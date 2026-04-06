use crate::scanner::{Scan, Finding};
use crate::score;
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

    // Get project path
    let (project_path,): (Option<String>,) = conn.query_row(
        "SELECT path FROM projects WHERE id = ?1",
        rusqlite::params![project_id],
        |row| Ok((row.get(0)?,)),
    ).map_err(|_| "Project not found".to_string())?;

    let path_str = project_path.ok_or("Project has no local path")?;
    let path = PathBuf::from(&path_str);

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

fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("vulndash.db"))
        .map_err(|e| e.to_string())
}
