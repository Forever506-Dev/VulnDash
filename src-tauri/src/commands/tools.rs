use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct ToolStatus {
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
    pub install_hint: Option<String>,
    pub install_url: Option<String>,
}

/// Try to run a command and return the first line of output if successful.
fn check_command(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .map(|o| {
            let out = if !o.stdout.is_empty() {
                String::from_utf8_lossy(&o.stdout).to_string()
            } else {
                String::from_utf8_lossy(&o.stderr).to_string()
            };
            out.lines().next().unwrap_or("").trim().to_string()
        })
        .filter(|s| !s.is_empty())
}

/// On Windows, also try the .cmd / .exe variants since PATH may differ.
fn check_command_cross(base: &str, args: &[&str]) -> Option<String> {
    // Try plain name first (works on Linux/macOS and Windows when in PATH)
    if let Some(v) = check_command(base, args) {
        return Some(v);
    }
    // Windows: try with .cmd extension (npm.cmd, etc.)
    #[cfg(target_os = "windows")]
    {
        let cmd_name = format!("{}.cmd", base);
        if let Some(v) = check_command(&cmd_name, args) {
            return Some(v);
        }
        // Try via cmd /C (resolves .cmd scripts in PATH)
        let mut all_args = vec!["/C", base];
        all_args.extend_from_slice(args);
        if let Some(v) = check_command("cmd", &all_args) {
            return Some(v);
        }
    }
    None
}

#[tauri::command]
pub async fn check_tools() -> Result<Vec<ToolStatus>, String> {
    let mut tools = Vec::new();

    // cargo-audit
    let v = check_command("cargo-audit", &["--version"])
        .or_else(|| check_command("cargo", &["audit", "--version"]));
    tools.push(ToolStatus {
        name: "cargo-audit".to_string(),
        available: v.is_some(),
        version: v,
        install_hint: Some("cargo install cargo-audit".to_string()),
        install_url: Some("https://crates.io/crates/cargo-audit".to_string()),
    });

    // npm — use cross-platform check
    let v = check_command_cross("npm", &["--version"]);
    tools.push(ToolStatus {
        name: "npm".to_string(),
        available: v.is_some(),
        version: v,
        install_hint: Some("Install Node.js (includes npm)".to_string()),
        install_url: Some("https://nodejs.org/en/download".to_string()),
    });

    // pip-audit
    let v = check_command_cross("pip-audit", &["--version"])
        .or_else(|| check_command_cross("pip3", &["-m", "pip_audit", "--version"]));
    tools.push(ToolStatus {
        name: "pip-audit".to_string(),
        available: v.is_some(),
        version: v,
        install_hint: Some("pip install pip-audit".to_string()),
        install_url: Some("https://pypi.org/project/pip-audit".to_string()),
    });

    // gitleaks
    let v = check_command_cross("gitleaks", &["version"]);
    tools.push(ToolStatus {
        name: "gitleaks".to_string(),
        available: v.is_some(),
        version: v,
        install_hint: Some("Download gitleaks.exe from releases".to_string()),
        install_url: Some("https://github.com/gitleaks/gitleaks/releases/latest".to_string()),
    });

    // git
    let v = check_command_cross("git", &["--version"]);
    tools.push(ToolStatus {
        name: "git".to_string(),
        available: v.is_some(),
        version: v,
        install_hint: Some("Install Git for Windows".to_string()),
        install_url: Some("https://git-scm.com/download/win".to_string()),
    });

    // Ollama — check via HTTP
    let ollama_available = check_ollama().await;
    tools.push(ToolStatus {
        name: "Ollama (AI)".to_string(),
        available: ollama_available,
        version: if ollama_available { Some("running".to_string()) } else { None },
        install_hint: Some("Install Ollama for AI-powered fix suggestions".to_string()),
        install_url: Some("https://ollama.ai".to_string()),
    });

    Ok(tools)
}

async fn check_ollama() -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default();
    client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}
