use crate::scanner::{Finding, Severity};
use std::path::Path;
use tracing::{info, warn};
use uuid::Uuid;

/// Run npm audit on a Node.js project.
pub async fn scan(path: &Path, scan_id: &str) -> Vec<Finding> {
    let pkg_lock = path.join("package-lock.json");
    let yarn_lock = path.join("yarn.lock");
    if !pkg_lock.exists() && !yarn_lock.exists() {
        return vec![];
    }

    info!("Running npm audit on {:?}", path);

    let output = tokio::process::Command::new("npm")
        .args(["audit", "--json"])
        .current_dir(path)
        .output()
        .await;

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            parse_npm_audit_json(&stdout, scan_id)
        }
        Err(e) => {
            warn!("npm not found: {}", e);
            vec![]
        }
    }
}

fn parse_npm_audit_json(json_str: &str, scan_id: &str) -> Vec<Finding> {
    let mut findings = vec![];

    let Ok(data) = serde_json::from_str::<serde_json::Value>(json_str) else {
        return findings;
    };

    let vulns = data
        .get("vulnerabilities")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    for (pkg_name, vuln_data) in &vulns {
        let severity_str = vuln_data
            .get("severity")
            .and_then(|v| v.as_str())
            .unwrap_or("low");

        let severity = match severity_str {
            "critical" => Severity::Critical,
            "high" => Severity::High,
            "moderate" => Severity::Medium,
            "low" => Severity::Low,
            _ => Severity::Info,
        };

        // Only report high/critical by default (npm audit returns many transitive deps)
        if severity == Severity::Low || severity == Severity::Info {
            continue;
        }

        let title = format!(
            "npm: {} — {}",
            pkg_name,
            vuln_data
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Vulnerability")
        );

        let via = vuln_data
            .get("via")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        if let Some(s) = item.as_str() {
                            Some(s.to_string())
                        } else {
                            item.get("title")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();

        let fix_available = vuln_data
            .get("fixAvailable")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        findings.push(Finding {
            id: Uuid::new_v4().to_string(),
            scan_id: scan_id.to_string(),
            tool: "npm-audit".to_string(),
            severity,
            title,
            description: if via.is_empty() {
                None
            } else {
                Some(format!("Via: {}", via))
            },
            file_path: Some("package-lock.json".to_string()),
            line_number: None,
            cve_id: None,
            cvss_score: None,
            fix_version: if fix_available {
                Some("run npm audit fix".to_string())
            } else {
                None
            },
            ai_advice: None,
            mitre_id: None,
            status: "open".to_string(),
        });
    }

    info!("npm-audit: {} findings (high/critical only)", findings.len());
    findings
}
