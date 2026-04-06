use serde::Serialize;
use std::process::Command;

#[derive(Serialize, Clone)]
pub struct ToolStatus {
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
    pub install_hint: Option<String>,
}

fn check_command(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success() || !o.stdout.is_empty() || !o.stderr.is_empty())
        .map(|o| {
            let out = if !o.stdout.is_empty() {
                String::from_utf8_lossy(&o.stdout)
            } else {
                String::from_utf8_lossy(&o.stderr)
            };
            out.lines().next().unwrap_or("").trim().to_string()
        })
        .filter(|s| !s.is_empty())
}

#[tauri::command]
pub async fn check_tools() -> Result<Vec<ToolStatus>, String> {
    let mut tools = Vec::new();

    // cargo-audit
    let cargo_audit_version = check_command("cargo-audit", &["--version"])
        .or_else(|| check_command("cargo", &["audit", "--version"]));
    tools.push(ToolStatus {
        name: "cargo-audit".to_string(),
        available: cargo_audit_version.is_some(),
        version: cargo_audit_version,
        install_hint: Some("cargo install cargo-audit".to_string()),
    });

    // npm
    let npm_version = check_command("npm", &["--version"]);
    tools.push(ToolStatus {
        name: "npm".to_string(),
        available: npm_version.is_some(),
        version: npm_version,
        install_hint: Some("Install Node.js from https://nodejs.org".to_string()),
    });

    // pip-audit
    let pip_audit_version = check_command("pip-audit", &["--version"]);
    tools.push(ToolStatus {
        name: "pip-audit".to_string(),
        available: pip_audit_version.is_some(),
        version: pip_audit_version,
        install_hint: Some("pip install pip-audit".to_string()),
    });

    // gitleaks
    let gitleaks_version = check_command("gitleaks", &["version"]);
    tools.push(ToolStatus {
        name: "gitleaks".to_string(),
        available: gitleaks_version.is_some(),
        version: gitleaks_version,
        install_hint: Some("brew install gitleaks  OR  https://github.com/gitleaks/gitleaks".to_string()),
    });

    // git
    let git_version = check_command("git", &["--version"]);
    tools.push(ToolStatus {
        name: "git".to_string(),
        available: git_version.is_some(),
        version: git_version,
        install_hint: Some("Install git from https://git-scm.com".to_string()),
    });

    // Ollama — check via HTTP
    let ollama_available = check_ollama().await;
    tools.push(ToolStatus {
        name: "Ollama".to_string(),
        available: ollama_available,
        version: if ollama_available { Some("running".to_string()) } else { None },
        install_hint: Some("brew install ollama  OR  https://ollama.ai".to_string()),
    });

    Ok(tools)
}

async fn check_ollama() -> bool {
    // Use reqwest if available, otherwise fall back to curl
    let output = tokio::process::Command::new("curl")
        .args(["-s", "--max-time", "2", "http://localhost:11434/api/tags"])
        .output()
        .await;

    match output {
        Ok(o) => o.status.success() && !o.stdout.is_empty(),
        Err(_) => false,
    }
}
