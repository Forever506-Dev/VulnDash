use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

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

/// Check if gitleaks is available, including in the app's local data dir
/// (where it gets auto-installed on Windows).
#[cfg_attr(not(target_os = "windows"), allow(unused_variables))]
fn check_gitleaks(app_local_data_dir: Option<&PathBuf>) -> Option<String> {
    // Check PATH first
    if let Some(v) = check_command_cross("gitleaks", &["version"]) {
        return Some(v);
    }
    // Check app_local_data_dir (auto-install location)
    #[cfg(target_os = "windows")]
    if let Some(dir) = app_local_data_dir {
        let exe = dir.join("gitleaks.exe");
        if exe.exists() {
            let result = Command::new(&exe)
                .arg("version")
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
                .filter(|s| !s.is_empty());
            if result.is_some() {
                return result;
            }
        }
    }
    None
}

#[tauri::command]
pub async fn check_tools(app: tauri::AppHandle) -> Result<Vec<ToolStatus>, String> {
    let app_local_data_dir = app.path().app_local_data_dir().ok();
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

    // gitleaks — also check app_local_data_dir for auto-installed binary
    let v = check_gitleaks(app_local_data_dir.as_ref());
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

// ── install_tool ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn install_tool(tool_name: String, app: tauri::AppHandle) -> Result<String, String> {
    match tool_name.as_str() {
        "gitleaks" => install_gitleaks(app).await,
        "pip-audit" => install_pip_audit().await,
        "cargo-audit" => install_cargo_audit().await,
        other => {
            let url = match other {
                "npm" => "https://nodejs.org/en/download",
                "git" => "https://git-scm.com/downloads",
                "Ollama (AI)" | "Ollama" => "https://ollama.ai",
                _ => "https://github.com",
            };
            Ok(format!(
                "Please install '{}' manually.\nDownload: {}",
                other, url
            ))
        }
    }
}

async fn install_gitleaks(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        install_gitleaks_windows(app).await
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app; // suppress unused warning
        #[cfg(target_os = "macos")]
        return Ok(
            "Run in Terminal: brew install gitleaks\n\
             Or visit: https://github.com/gitleaks/gitleaks/releases/latest"
                .to_string(),
        );
        #[cfg(target_os = "linux")]
        return Ok(
            "Run in Terminal:\n  sudo apt install gitleaks\n  or  brew install gitleaks\n\
             Or visit: https://github.com/gitleaks/gitleaks/releases/latest"
                .to_string(),
        );
        #[allow(unreachable_code)]
        Ok(
            "Run: brew install gitleaks  OR  sudo apt install gitleaks\n\
             Or visit: https://github.com/gitleaks/gitleaks/releases/latest"
                .to_string(),
        )
    }
}

#[cfg(target_os = "windows")]
async fn install_gitleaks_windows(app: tauri::AppHandle) -> Result<String, String> {
    use std::io::Read;

    // 1. Fetch latest release metadata
    let client = reqwest::Client::builder()
        .user_agent("VulnDash/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let release: serde_json::Value = client
        .get("https://api.github.com/repos/gitleaks/gitleaks/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse release JSON: {}", e))?;

    // 2. Find windows_x64.zip asset
    let assets = release["assets"]
        .as_array()
        .ok_or("No assets in release")?;

    let zip_url = assets
        .iter()
        .find(|a| {
            a["name"]
                .as_str()
                .map(|n| n.contains("windows") && n.contains("x64") && n.ends_with(".zip"))
                .unwrap_or(false)
        })
        .and_then(|a| a["browser_download_url"].as_str())
        .ok_or("Could not find windows_x64.zip asset in latest release")?
        .to_string();

    // 3. Download zip
    let zip_bytes = client
        .get(&zip_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download gitleaks: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    // 4. Extract gitleaks.exe to app_local_data_dir
    let dest_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app local data dir: {}", e))?;
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let cursor = std::io::Cursor::new(&zip_bytes[..]);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open zip: {}", e))?;

    let mut found = false;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.name().ends_with("gitleaks.exe") {
            let dest_path = dest_dir.join("gitleaks.exe");
            let mut out = std::fs::File::create(&dest_path)
                .map_err(|e| format!("Failed to create gitleaks.exe: {}", e))?;
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut out, &buf)
                .map_err(|e| format!("Failed to write gitleaks.exe: {}", e))?;
            found = true;
            break;
        }
    }

    if !found {
        return Err("gitleaks.exe not found in zip archive".to_string());
    }

    // 5. Add dest_dir to PATH for the current process
    let dest_dir_str = dest_dir.to_string_lossy();
    let current_path = std::env::var("PATH").unwrap_or_default();
    if !current_path.contains(dest_dir_str.as_ref()) {
        let new_path = format!("{};{}", dest_dir_str, current_path);
        std::env::set_var("PATH", new_path);
    }

    Ok("gitleaks installed successfully".to_string())
}

async fn install_pip_audit() -> Result<String, String> {
    // Try pip first, then pip3
    let output = tokio::process::Command::new("pip")
        .args(["install", "pip-audit"])
        .output()
        .await;

    let output = match output {
        Ok(o) => o,
        Err(_) => tokio::process::Command::new("pip3")
            .args(["install", "pip-audit"])
            .output()
            .await
            .map_err(|e| format!("Failed to run pip/pip3: {}", e))?,
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}{}", stdout, stderr).trim().to_string();

    if output.status.success() {
        Ok(format!("pip-audit installed successfully.\n{}", combined))
    } else {
        Err(format!("pip install pip-audit failed:\n{}", combined))
    }
}

async fn install_cargo_audit() -> Result<String, String> {
    // This takes a while — return a warning as a note in the output
    let output = tokio::process::Command::new("cargo")
        .args(["install", "cargo-audit"])
        .output()
        .await
        .map_err(|e| format!("Failed to run cargo: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}{}", stdout, stderr).trim().to_string();

    if output.status.success() {
        Ok(format!("cargo-audit installed successfully.\n{}", combined))
    } else {
        Err(format!(
            "cargo install cargo-audit failed (note: this can take several minutes to compile):\n{}",
            combined
        ))
    }
}
