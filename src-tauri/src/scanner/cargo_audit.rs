use crate::scanner::{Finding, Severity};
use std::path::Path;
use tracing::{info, warn};
use uuid::Uuid;

/// Run cargo-audit on a Rust project and return findings.
pub async fn scan(path: &Path, scan_id: &str) -> Vec<Finding> {
    let cargo_lock = path.join("Cargo.lock");
    if !cargo_lock.exists() {
        return vec![];
    }

    info!("Running cargo-audit on {:?}", path);

    let output = tokio::process::Command::new("cargo")
        .args(["audit", "--json"])
        .current_dir(path)
        .output()
        .await;

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            parse_cargo_audit_json(&stdout, scan_id)
        }
        Err(e) => {
            warn!("cargo-audit not found or failed: {}", e);
            vec![]
        }
    }
}

fn parse_cargo_audit_json(json_str: &str, scan_id: &str) -> Vec<Finding> {
    let mut findings = vec![];

    let Ok(data) = serde_json::from_str::<serde_json::Value>(json_str) else {
        return findings;
    };

    let vulns = data
        .get("vulnerabilities")
        .and_then(|v| v.get("list"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    for vuln in vulns {
        let advisory = vuln.get("advisory").cloned().unwrap_or_default();
        let package = vuln.get("package").cloned().unwrap_or_default();

        let id_str = advisory
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("?");
        let title = advisory
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown vulnerability");
        let description = advisory
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let cvss = advisory
            .get("cvss")
            .and_then(|v| v.as_f64());
        let pkg_name = package
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("?");
        let pkg_version = package
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("?");

        let severity = cvss_to_severity(cvss);

        findings.push(Finding {
            id: Uuid::new_v4().to_string(),
            scan_id: scan_id.to_string(),
            tool: "cargo-audit".to_string(),
            severity,
            title: format!("{} — {} v{}", title, pkg_name, pkg_version),
            description,
            file_path: Some("Cargo.lock".to_string()),
            line_number: None,
            cve_id: Some(id_str.to_string()),
            cvss_score: cvss,
            fix_version: None,
            ai_advice: None,
            mitre_id: None,
            status: "open".to_string(),
        });
    }

    // Handle warnings (unmaintained crates)
    let warnings = data
        .get("warnings")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    for (warn_type, warn_list) in &warnings {
        if let Some(list) = warn_list.as_array() {
            for w in list {
                let pkg_name = w
                    .get("package")
                    .and_then(|p| p.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let advisory_id = w
                    .get("advisory")
                    .and_then(|a| a.get("id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");

                findings.push(Finding {
                    id: Uuid::new_v4().to_string(),
                    scan_id: scan_id.to_string(),
                    tool: "cargo-audit".to_string(),
                    severity: Severity::Low,
                    title: format!("{}: {} ({})", warn_type, pkg_name, advisory_id),
                    description: Some(format!(
                        "Crate '{}' has a warning: {}",
                        pkg_name, warn_type
                    )),
                    file_path: Some("Cargo.lock".to_string()),
                    line_number: None,
                    cve_id: Some(advisory_id.to_string()),
                    cvss_score: None,
                    fix_version: None,
                    ai_advice: None,
                    mitre_id: None,
                    status: "open".to_string(),
                });
            }
        }
    }

    info!("cargo-audit: {} findings", findings.len());
    findings
}

fn cvss_to_severity(cvss: Option<f64>) -> Severity {
    match cvss {
        Some(s) if s >= 9.0 => Severity::Critical,
        Some(s) if s >= 7.0 => Severity::High,
        Some(s) if s >= 4.0 => Severity::Medium,
        Some(s) if s > 0.0 => Severity::Low,
        _ => Severity::Medium, // unknown CVSS = medium by default
    }
}
