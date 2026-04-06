use crate::scanner::{Scan, Finding, Severity};
use serde::Serialize;
use rusqlite::OptionalExtension;
use crate::score;
use tauri::Manager;
use uuid::Uuid;
use chrono::Utc;
use std::path::PathBuf;
use tracing::info;

/// Start a scan for a project.
#[tauri::command]
pub async fn start_scan(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Scan, String> {
    let db_path = get_db_path(&app)?;
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    // Get project info (path + github fields)
    let (project_name, project_path, github_owner, github_repo): (String, Option<String>, Option<String>, Option<String>) = conn.query_row(
        "SELECT name, path, github_owner, github_repo FROM projects WHERE id = ?1",
        rusqlite::params![project_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|_| "Project not found".to_string())?;

    // Resolve scan path — clone GitHub repo if needed
    let (path, _temp_dir) = match project_path {
        Some(ref p) if !p.is_empty() => (PathBuf::from(p), None::<tempfile::TempDir>),
        _ => {
            // GitHub project — clone to temp dir
            let owner = github_owner.ok_or("No local path and no GitHub owner")?;
            let repo = github_repo.ok_or("No local path and no GitHub repo")?;
            info!("Cloning {}/{} for scanning", owner, repo);

            let tmp = tempfile::TempDir::new().map_err(|e| e.to_string())?;
            let clone_url = format!("https://github.com/{}/{}.git", owner, repo);

            let output = tokio::process::Command::new("git")
                .args(["clone", "--depth", "1", &clone_url, tmp.path().to_str().unwrap()])
                .output()
                .await
                .map_err(|e| format!("git not found: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Clone failed: {}", stderr));
            }
            info!("Cloned to {:?}", tmp.path());
            (tmp.path().to_path_buf(), Some(tmp))
        }
    };

    // Create scan record
    let scan = Scan {
        id: Uuid::new_v4().to_string(),
        project_id: project_id.clone(),
        started_at: Utc::now().timestamp(),
        finished_at: None,
        status: "running".to_string(),
        score: None,
        summary: None,
    };

    conn.execute(
        "INSERT INTO scans (id, project_id, started_at, status) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![scan.id, scan.project_id, scan.started_at, scan.status],
    ).map_err(|e| e.to_string())?;

    info!("Scan {} started for project {}", scan.id, project_id);

    // Run all scanners
    let mut all_findings: Vec<Finding> = vec![];

    let cargo_findings = crate::scanner::cargo_audit::scan(&path, &scan.id).await;
    let npm_findings = crate::scanner::npm_audit::scan(&path, &scan.id).await;
    let pip_findings = crate::scanner::pip_audit::scan(&path, &scan.id).await;

    all_findings.extend(cargo_findings);
    all_findings.extend(npm_findings);
    all_findings.extend(pip_findings);

    let gitleaks_findings = crate::scanner::gitleaks::scan(&path, &scan.id).await;
    all_findings.extend(gitleaks_findings);

    // Calculate score
    let final_score = score::calculate(&all_findings);

    // Save findings to DB
    for finding in &all_findings {
        conn.execute(
            "INSERT INTO findings
             (id, scan_id, tool, severity, title, description, file_path,
              line_number, cve_id, cvss_score, fix_version, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                finding.id, finding.scan_id, finding.tool,
                finding.severity.as_str(), finding.title, finding.description,
                finding.file_path, finding.line_number, finding.cve_id,
                finding.cvss_score, finding.fix_version, finding.status
            ],
        ).map_err(|e| e.to_string())?;
    }

    // Build summary
    let summary = serde_json::json!({
        "total": all_findings.len(),
        "critical": all_findings.iter().filter(|f| f.severity == crate::scanner::Severity::Critical).count(),
        "high": all_findings.iter().filter(|f| f.severity == crate::scanner::Severity::High).count(),
        "medium": all_findings.iter().filter(|f| f.severity == crate::scanner::Severity::Medium).count(),
        "low": all_findings.iter().filter(|f| f.severity == crate::scanner::Severity::Low).count(),
        "info": all_findings.iter().filter(|f| f.severity == crate::scanner::Severity::Info).count(),
    });

    let finished_at = Utc::now().timestamp();

    // Update scan as completed
    conn.execute(
        "UPDATE scans SET status='completed', finished_at=?1, score=?2, summary=?3 WHERE id=?4",
        rusqlite::params![finished_at, final_score, summary.to_string(), scan.id],
    ).map_err(|e| e.to_string())?;

    // Update project score
    conn.execute(
        "UPDATE projects SET score=?1, last_scan_at=?2 WHERE id=?3",
        rusqlite::params![final_score, finished_at, project_id],
    ).map_err(|e| e.to_string())?;

    info!("Scan {} completed — score: {}, findings: {}", scan.id, final_score, all_findings.len());

    // Emit desktop notification
    {
        use tauri_plugin_notification::NotificationExt;
        let critical_count = all_findings.iter().filter(|f| f.severity == Severity::Critical).count();
        // Get previous scan score for comparison
        let prev_score: Option<i32> = conn.query_row(
            "SELECT score FROM scans WHERE project_id = ?1 AND id != ?2 AND status = 'completed' ORDER BY started_at DESC LIMIT 1",
            rusqlite::params![project_id, scan.id],
            |row| row.get(0),
        ).optional().ok().flatten();
        let message = if critical_count > 0 {
            format!("⚠️ {} — {} critical issue{} found!", project_name, critical_count, if critical_count == 1 { "" } else { "s" })
        } else if let Some(prev) = prev_score {
            if final_score > prev {
                format!("✅ {} — Score improved to {}/100", project_name, final_score)
            } else if all_findings.is_empty() {
                format!("✅ {} — All clear! Score: {}/100", project_name, final_score)
            } else {
                format!("ℹ️ {} — Scan complete. Score: {}/100", project_name, final_score)
            }
        } else if all_findings.is_empty() {
            format!("✅ {} — All clear! Score: {}/100", project_name, final_score)
        } else {
            format!("ℹ️ {} — Scan complete. Score: {}/100", project_name, final_score)
        };
        app.notification().builder().title("VulnDash").body(&message).show().ok();
    }

    Ok(Scan {
        id: scan.id,
        project_id: scan.project_id,
        started_at: scan.started_at,
        finished_at: Some(finished_at),
        status: "completed".to_string(),
        score: Some(final_score),
        summary: Some(summary),
    })
}

/// Get all findings for a scan.
#[tauri::command]
pub async fn get_scan_results(
    app: tauri::AppHandle,
    scan_id: String,
) -> Result<Vec<Finding>, String> {
    let db_path = get_db_path(&app)?;
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, scan_id, tool, severity, title, description, file_path,
                line_number, cve_id, cvss_score, fix_version, ai_advice, mitre_id, status
         FROM findings WHERE scan_id = ?1
         ORDER BY CASE severity
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
             ELSE 5 END"
    ).map_err(|e| e.to_string())?;

    let findings = stmt.query_map(rusqlite::params![scan_id], |row| {
        let sev_str: String = row.get(3)?;
        let severity = match sev_str.as_str() {
            "critical" => crate::scanner::Severity::Critical,
            "high"     => crate::scanner::Severity::High,
            "medium"   => crate::scanner::Severity::Medium,
            "low"      => crate::scanner::Severity::Low,
            _          => crate::scanner::Severity::Info,
        };
        Ok(Finding {
            id: row.get(0)?,
            scan_id: row.get(1)?,
            tool: row.get(2)?,
            severity,
            title: row.get(4)?,
            description: row.get(5)?,
            file_path: row.get(6)?,
            line_number: row.get(7)?,
            cve_id: row.get(8)?,
            cvss_score: row.get(9)?,
            fix_version: row.get(10)?,
            ai_advice: row.get(11)?,
            mitre_id: row.get(12)?,
            status: row.get(13)?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(findings)
}

/// List all scans for a project.
#[tauri::command]
pub async fn list_scans(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<Scan>, String> {
    let db_path = get_db_path(&app)?;
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, started_at, finished_at, status, score, summary
         FROM scans WHERE project_id = ?1 ORDER BY started_at DESC"
    ).map_err(|e| e.to_string())?;

    let scans = stmt.query_map(rusqlite::params![project_id], |row| {
        let summary_str: Option<String> = row.get(6)?;
        let summary = summary_str
            .and_then(|s| serde_json::from_str(&s).ok());
        Ok(Scan {
            id: row.get(0)?,
            project_id: row.get(1)?,
            started_at: row.get(2)?,
            finished_at: row.get(3)?,
            status: row.get(4)?,
            score: row.get(5)?,
            summary,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(scans)
}

/// Auto-fix dependencies for a project.
#[tauri::command]
pub async fn auto_fix_deps(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    let project_path: Option<String> = conn.query_row(
        "SELECT path FROM projects WHERE id = ?1",
        rusqlite::params![project_id],
        |row| row.get(0),
    ).map_err(|_| "Project not found".to_string())?;

    let path = {
        let p = project_path.filter(|p| !p.is_empty()).ok_or_else(|| "No local path for this project".to_string())?;
        PathBuf::from(p)
    };

    let mut results: Vec<String> = vec![];

    // Cargo
    if path.join("Cargo.lock").exists() {
        info!("Running cargo update in {:?}", path);
        let out = tokio::process::Command::new("cargo")
            .args(["update"])
            .current_dir(&path)
            .output()
            .await
            .map_err(|e| format!("cargo not found: {}", e))?;
        if out.status.success() {
            results.push("cargo update: OK".to_string());
        } else {
            let stderr = String::from_utf8_lossy(&out.stderr);
            results.push(format!("cargo update: failed — {}", stderr.lines().next().unwrap_or("unknown error")));
        }
    }

    // npm
    if path.join("package-lock.json").exists() {
        info!("Running npm audit fix in {:?}", path);
        let out = tokio::process::Command::new("npm")
            .args(["audit", "fix"])
            .current_dir(&path)
            .output()
            .await
            .map_err(|e| format!("npm not found: {}", e))?;
        if out.status.success() {
            results.push("npm audit fix: OK".to_string());
        } else {
            let stderr = String::from_utf8_lossy(&out.stderr);
            results.push(format!("npm audit fix: failed — {}", stderr.lines().next().unwrap_or("unknown error")));
        }
    }

    // pip
    if path.join("requirements.txt").exists() {
        info!("Running pip install --upgrade in {:?}", path);
        let out = tokio::process::Command::new("pip")
            .args(["install", "--upgrade", "-r", "requirements.txt"])
            .current_dir(&path)
            .output()
            .await
            .map_err(|e| format!("pip not found: {}", e))?;
        if out.status.success() {
            results.push("pip upgrade: OK".to_string());
        } else {
            let stderr = String::from_utf8_lossy(&out.stderr);
            results.push(format!("pip upgrade: failed — {}", stderr.lines().next().unwrap_or("unknown error")));
        }
    }

    if results.is_empty() {
        return Err("No supported package managers found (Cargo.lock, package-lock.json, requirements.txt)".to_string());
    }

    Ok(results.join("\n"))
}

// ── Scan Diff ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ScanDiff {
    pub new_findings: Vec<Finding>,
    pub fixed_count: usize,
    pub score_delta: i32,
}

#[tauri::command]
pub async fn compare_scans(
    app: tauri::AppHandle,
    scan_id: String,
) -> Result<ScanDiff, String> {
    let db_path = get_db_path(&app)?;
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    // Get current scan
    let (project_id, current_score, current_started_at): (String, Option<i32>, i64) = conn
        .query_row(
            "SELECT project_id, score, started_at FROM scans WHERE id = ?1",
            rusqlite::params![scan_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Scan not found".to_string())?;

    // Get previous scan (same project, immediately before this one)
    let prev_scan: Option<(String, Option<i32>)> = conn
        .query_row(
            "SELECT id, score FROM scans WHERE project_id = ?1 AND started_at < ?2 AND status = 'completed' ORDER BY started_at DESC LIMIT 1",
            rusqlite::params![project_id, current_started_at],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    // Helper: load findings for a scan
    let load_findings = |sid: &str| -> Result<Vec<Finding>, String> {
        let mut stmt = conn.prepare(
            "SELECT id, scan_id, tool, severity, title, description, file_path,
                    line_number, cve_id, cvss_score, fix_version, ai_advice, mitre_id, status
             FROM findings WHERE scan_id = ?1"
        ).map_err(|e| e.to_string())?;
        let findings: Vec<Finding> = stmt
            .query_map(rusqlite::params![sid], |row| {
                let sev_str: String = row.get(3)?;
                let severity = match sev_str.as_str() {
                    "critical" => Severity::Critical,
                    "high"     => Severity::High,
                    "medium"   => Severity::Medium,
                    "low"      => Severity::Low,
                    _          => Severity::Info,
                };
                Ok(Finding {
                    id: row.get(0)?,
                    scan_id: row.get(1)?,
                    tool: row.get(2)?,
                    severity,
                    title: row.get(4)?,
                    description: row.get(5)?,
                    file_path: row.get(6)?,
                    line_number: row.get(7)?,
                    cve_id: row.get(8)?,
                    cvss_score: row.get(9)?,
                    fix_version: row.get(10)?,
                    ai_advice: row.get(11)?,
                    mitre_id: row.get(12)?,
                    status: row.get(13)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(findings)
    };

    let current_findings = load_findings(&scan_id)?;

    let Some((prev_id, prev_score)) = prev_scan else {
        // No previous scan — everything is "new"
        return Ok(ScanDiff {
            new_findings: current_findings,
            fixed_count: 0,
            score_delta: 0,
        });
    };

    let prev_findings = load_findings(&prev_id)?;

    // Key: title + tool
    let prev_keys: std::collections::HashSet<String> = prev_findings
        .iter()
        .map(|f| format!("{}:{}", f.title, f.tool))
        .collect();
    let curr_keys: std::collections::HashSet<String> = current_findings
        .iter()
        .map(|f| format!("{}:{}", f.title, f.tool))
        .collect();

    let new_findings: Vec<Finding> = current_findings
        .into_iter()
        .filter(|f| !prev_keys.contains(&format!("{}:{}", f.title, f.tool)))
        .collect();

    let fixed_count = prev_findings
        .iter()
        .filter(|f| !curr_keys.contains(&format!("{}:{}", f.title, f.tool)))
        .count();

    let score_delta = match (current_score, prev_score) {
        (Some(c), Some(p)) => c - p,
        _ => 0,
    };

    Ok(ScanDiff {
        new_findings,
        fixed_count,
        score_delta,
    })
}

fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d: PathBuf| d.join("vulndash.db"))
        .map_err(|e: tauri::Error| e.to_string())
}
