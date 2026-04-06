use crate::scanner::{Finding, Severity};
use std::path::Path;
use tracing::{info, warn};
use uuid::Uuid;

/// Run pip-audit on a Python project.
pub async fn scan(path: &Path, scan_id: &str) -> Vec<Finding> {
    let req_file = path.join("requirements.txt");
    let pyproject = path.join("pyproject.toml");
    if !req_file.exists() && !pyproject.exists() {
        return vec![];
    }

    info!("Running pip-audit on {:?}", path);

    let mut cmd = tokio::process::Command::new("pip-audit");
    cmd.args(["--format", "json"]);
    if req_file.exists() {
        cmd.args(["-r", "requirements.txt"]);
    }
    cmd.current_dir(path);

    match cmd.output().await {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            parse_pip_audit_json(&stdout, scan_id)
        }
        Err(e) => {
            warn!("pip-audit not found: {}", e);
            vec![]
        }
    }
}

fn parse_pip_audit_json(json_str: &str, scan_id: &str) -> Vec<Finding> {
    let mut findings = vec![];

    let Ok(data) = serde_json::from_str::<serde_json::Value>(json_str) else {
        return findings;
    };

    let deps = data.as_array().cloned().unwrap_or_default();

    for dep in deps {
        let pkg_name = dep.get("name").and_then(|v| v.as_str()).unwrap_or("?");
        let pkg_version = dep.get("version").and_then(|v| v.as_str()).unwrap_or("?");

        let vulns = dep
            .get("vulns")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        for vuln in vulns {
            let vuln_id = vuln.get("id").and_then(|v| v.as_str()).unwrap_or("?");
            let description = vuln
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let fix_versions: Vec<String> = vuln
                .get("fix_versions")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            let cvss = vuln
                .get("aliases")
                .and_then(|v| v.as_array())
                .map(|_| None::<f64>)
                .unwrap_or(None);

            findings.push(Finding {
                id: Uuid::new_v4().to_string(),
                scan_id: scan_id.to_string(),
                tool: "pip-audit".to_string(),
                severity: Severity::High, // Default high until we have CVSS
                title: format!("{} v{} — {}", pkg_name, pkg_version, vuln_id),
                description,
                file_path: Some("requirements.txt".to_string()),
                line_number: None,
                cve_id: Some(vuln_id.to_string()),
                cvss_score: cvss,
                fix_version: if fix_versions.is_empty() {
                    None
                } else {
                    Some(fix_versions.join(", "))
                },
                ai_advice: None,
                mitre_id: None,
                status: "open".to_string(),
            });
        }
    }

    info!("pip-audit: {} findings", findings.len());
    findings
}
