use std::path::Path;
use uuid::Uuid;
use tracing::{info, warn};
use serde::Deserialize;

use crate::scanner::{Finding, Severity};

/// Gitleaks JSON report entry
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct GitleaksFinding {
    description: Option<String>,
    secret: Option<String>,
    file: Option<String>,
    #[serde(rename = "StartLine")]
    start_line: Option<i64>,
    #[serde(rename = "RuleID")]
    rule_id: Option<String>,
}

/// Run gitleaks secrets detection on a path.
/// Falls back to manual regex scan if gitleaks is not installed.
pub async fn scan(path: &Path, scan_id: &str) -> Vec<Finding> {
    // Check if gitleaks is installed
    let gitleaks_installed = tokio::process::Command::new("gitleaks")
        .arg("version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    if gitleaks_installed {
        info!("gitleaks found — running native scan on {:?}", path);
        run_gitleaks(path, scan_id).await
    } else {
        warn!("gitleaks not installed — falling back to regex scan on {:?}", path);
        run_regex_scan(path, scan_id).await
    }
}

async fn run_gitleaks(path: &Path, scan_id: &str) -> Vec<Finding> {
    // Create a temp file for the JSON report
    let tmp = match tempfile::NamedTempFile::new() {
        Ok(f) => f,
        Err(e) => {
            warn!("Failed to create temp file for gitleaks report: {}", e);
            return vec![];
        }
    };
    let report_path = tmp.path().to_path_buf();

    let output = tokio::process::Command::new("gitleaks")
        .args([
            "detect",
            "--source", path.to_str().unwrap_or("."),
            "--report-format", "json",
            "--report-path", report_path.to_str().unwrap_or("/tmp/gitleaks.json"),
            "--exit-code", "0",
            "--no-git",
        ])
        .output()
        .await;

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            warn!("Failed to run gitleaks: {}", e);
            return vec![];
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("gitleaks exited with error: {}", stderr);
    }

    // Read and parse the JSON report
    let report_content = match tokio::fs::read_to_string(&report_path).await {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to read gitleaks report: {}", e);
            return vec![];
        }
    };

    if report_content.trim().is_empty() || report_content.trim() == "null" {
        info!("gitleaks found no secrets");
        return vec![];
    }

    let raw_findings: Vec<GitleaksFinding> = match serde_json::from_str(&report_content) {
        Ok(f) => f,
        Err(e) => {
            warn!("Failed to parse gitleaks JSON: {} — raw: {}", e, &report_content[..200.min(report_content.len())]);
            return vec![];
        }
    };

    raw_findings.into_iter().map(|gf| {
        let title = match (&gf.rule_id, &gf.description) {
            (Some(rule), _) => format!("Secret detected: {}", rule),
            (_, Some(desc)) => format!("Secret detected: {}", desc),
            _ => "Hardcoded secret detected".to_string(),
        };

        let description = gf.secret.map(|s| {
            // Redact the actual secret value from description
            let preview = if s.len() > 6 { format!("{}...", &s[..4]) } else { "****".to_string() };
            format!("Potential secret value starting with: {}", preview)
        });

        Finding {
            id: Uuid::new_v4().to_string(),
            scan_id: scan_id.to_string(),
            tool: "gitleaks".to_string(),
            severity: Severity::Critical,
            title,
            description,
            file_path: gf.file,
            line_number: gf.start_line,
            cve_id: None,
            cvss_score: None,
            fix_version: None,
            ai_advice: None,
            mitre_id: Some("T1552".to_string()), // MITRE: Unsecured Credentials
            status: "open".to_string(),
        }
    }).collect()
}

async fn run_regex_scan(path: &Path, scan_id: &str) -> Vec<Finding> {
    use std::collections::HashSet;
    use tokio::io::AsyncReadExt;
    use regex::Regex;

    // Patterns: (regex, title)
    let patterns: Vec<(Regex, &str)> = vec![
        (
            Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
            "AWS Access Key ID",
        ),
        (
            Regex::new(r"ghp_[A-Za-z0-9]{36}").unwrap(),
            "GitHub Personal Access Token (ghp_)",
        ),
        (
            Regex::new(r"github_pat_[A-Za-z0-9_]{36,}").unwrap(),
            "GitHub Personal Access Token (github_pat_)",
        ),
        (
            Regex::new(r#"(?i)(api_key|apikey|api-key)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}"#).unwrap(),
            "Generic API Key",
        ),
        (
            Regex::new(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----").unwrap(),
            "Private Key Material",
        ),
        (
            Regex::new(r#"(?i)password\s*[:=]\s*["'][^"']{8,}["']"#).unwrap(),
            "Hardcoded Password",
        ),
    ];

    let extensions: HashSet<&str> = [
        "env", "json", "toml", "yaml", "yml", "js", "ts", "py", "rs",
    ].iter().cloned().collect();

    let skip_dirs: HashSet<&str> = [".git", "node_modules", "target"].iter().cloned().collect();

    let mut findings = vec![];
    let mut file_list = vec![];

    // Walk directory
    collect_files(path, &extensions, &skip_dirs, &mut file_list);

    for file_path in file_list {
        let mut file = match tokio::fs::File::open(&file_path).await {
            Ok(f) => f,
            Err(_) => continue,
        };

        let mut content = String::new();
        if file.read_to_string(&mut content).await.is_err() {
            continue; // Skip binary files
        }

        for (line_num, line) in content.lines().enumerate() {
            for (pattern, title) in &patterns {
                if pattern.is_match(line) {
                    findings.push(Finding {
                        id: Uuid::new_v4().to_string(),
                        scan_id: scan_id.to_string(),
                        tool: "gitleaks".to_string(),
                        severity: Severity::Critical,
                        title: format!("{} found", title),
                        description: Some(format!(
                            "Pattern match for {} at line {}. Remove secrets from code and rotate credentials immediately.",
                            title, line_num + 1
                        )),
                        file_path: Some(file_path.to_string_lossy().to_string()),
                        line_number: Some((line_num + 1) as i64),
                        cve_id: None,
                        cvss_score: None,
                        fix_version: None,
                        ai_advice: None,
                        mitre_id: Some("T1552".to_string()),
                        status: "open".to_string(),
                    });
                    break; // One finding per line per file max
                }
            }
        }
    }

    info!("Regex secrets scan found {} potential secrets", findings.len());
    findings
}

fn collect_files(
    dir: &Path,
    extensions: &std::collections::HashSet<&str>,
    skip_dirs: &std::collections::HashSet<&str>,
    results: &mut Vec<std::path::PathBuf>,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if path.is_dir() {
            if !skip_dirs.contains(name) {
                collect_files(&path, extensions, skip_dirs, results);
            }
        } else if path.is_file() {
            let ext = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            // Also match dotfiles like .env, .env.local
            let is_env_file = name == ".env" || name.starts_with(".env.");
            if extensions.contains(ext) || is_env_file {
                results.push(path);
            }
        }
    }
}
