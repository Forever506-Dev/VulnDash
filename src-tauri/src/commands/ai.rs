use crate::ai::ollama;
use crate::db;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize)]
pub struct AiFix {
    pub available: bool,
    pub model: Option<String>,
    pub explanation: String,
    pub fix_suggestion: String,
    pub fixed_code: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct FileContext {
    pub content: String,
    pub language: String,
    pub total_lines: usize,
    pub target_line: Option<i64>,
}

#[derive(Debug)]
struct FindingRow {
    tool: String,
    severity: String,
    title: String,
    description: Option<String>,
    file_path: Option<String>,
    cve_id: Option<String>,
    fix_version: Option<String>,
}

fn rule_based_fix(finding: &FindingRow) -> AiFix {
    let tool = finding.tool.as_str();
    let cve = finding.cve_id.as_deref().unwrap_or("");
    let title_lower = finding.title.to_lowercase();

    let (explanation, fix_suggestion, fixed_code) = if tool == "gitleaks" || title_lower.contains("secret") || title_lower.contains("key") || title_lower.contains("token") {
        (
            "A secret or credential was found hardcoded in your repository. Hardcoded secrets can be extracted by anyone with read access to the code, leading to unauthorized access to your accounts and services.".to_string(),
            "1. Remove the secret from the file immediately.\n2. Rotate/revoke the exposed credential in the relevant service.\n3. Add the file to .gitignore if it contains secrets.\n4. Use environment variables, a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault), or a .env file that is git-ignored.".to_string(),
            Some("# .env (git-ignored)\nSECRET_KEY=your_actual_secret\n\n# In code\nimport os\nsecret = os.environ['SECRET_KEY']".to_string()),
        )
    } else if tool == "trivy" || tool == "osv-scanner" || title_lower.contains("dependency") || title_lower.contains("package") {
        let fix_ver = finding.fix_version.as_deref().unwrap_or("the latest patched version");
        (
            format!("A vulnerable dependency was detected{}. Outdated or vulnerable packages can be exploited to execute arbitrary code, escalate privileges, or cause data breaches.", if !cve.is_empty() { format!(" ({})", cve) } else { String::new() }),
            format!("1. Update the dependency to {}.\n2. Run your test suite after upgrading.\n3. Check for any API changes in the new version.\n4. Consider using a dependency audit tool in your CI/CD pipeline.", fix_ver),
            None,
        )
    } else if tool == "semgrep" || tool == "bandit" {
        (
            "A static analysis tool detected a potential security vulnerability in your code. These issues can lead to injection attacks, data exposure, or logic flaws if left unaddressed.".to_string(),
            "1. Review the flagged code carefully.\n2. Understand the vulnerability class (e.g., SQL injection, XSS, path traversal).\n3. Apply the appropriate fix pattern for the vulnerability type.\n4. Add a test case to prevent regression.".to_string(),
            None,
        )
    } else {
        (
            format!("A security issue was detected by {}. This finding should be investigated and remediated to reduce your attack surface.", tool),
            "1. Review the finding details carefully.\n2. Research the specific vulnerability type.\n3. Apply the recommended fix or mitigation.\n4. Verify the fix with a follow-up scan.".to_string(),
            None,
        )
    };

    AiFix {
        available: false,
        model: None,
        explanation,
        fix_suggestion,
        fixed_code,
    }
}

#[derive(Deserialize)]
struct OllamaFixJson {
    explanation: Option<String>,
    fix_suggestion: Option<String>,
    fixed_code: Option<String>,
}

fn build_prompt(f: &FindingRow) -> String {
    format!(
        r#"You are a security expert helping a developer fix a vulnerability.

Finding:
- Tool: {tool}
- Severity: {severity}
- Title: {title}
- CVE: {cve}
- Description: {description}
- File: {file_path}
- Fix version available: {fix_version}

Provide a JSON response with these exact fields:
{{
  "explanation": "2-3 sentences explaining why this is dangerous",
  "fix_suggestion": "Step-by-step fix instructions",
  "fixed_code": "Code snippet showing the fix (or null if not applicable)"
}}

Respond with ONLY the JSON, no other text."#,
        tool = f.tool,
        severity = f.severity,
        title = f.title,
        cve = f.cve_id.as_deref().unwrap_or("N/A"),
        description = f.description.as_deref().unwrap_or("N/A"),
        file_path = f.file_path.as_deref().unwrap_or("N/A"),
        fix_version = f.fix_version.as_deref().unwrap_or("N/A"),
    )
}

#[tauri::command]
pub async fn get_ai_fix(finding_id: String, db_path_str: String) -> Result<AiFix, String> {
    let db_path = std::path::PathBuf::from(&db_path_str);
    let conn = db::connect(&db_path).map_err(|e| format!("DB error: {}", e))?;

    let finding = conn
        .query_row(
            "SELECT tool, severity, title, description, file_path, cve_id, fix_version FROM findings WHERE id = ?1",
            params![finding_id],
            |row| {
                Ok(FindingRow {
                    tool: row.get(0)?,
                    severity: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    file_path: row.get(4)?,
                    cve_id: row.get(5)?,
                    fix_version: row.get(6)?,
                })
            },
        )
        .map_err(|e| format!("Finding not found: {}", e))?;

    // Check Ollama availability
    if !ollama::is_available().await {
        return Ok(rule_based_fix(&finding));
    }

    let model = match ollama::get_model().await {
        Some(m) => m,
        None => return Ok(rule_based_fix(&finding)),
    };

    let prompt = build_prompt(&finding);
    let raw = ollama::ask(&model, &prompt)
        .await
        .unwrap_or_default();

    // Try to parse JSON from the response
    let parsed: Option<OllamaFixJson> = serde_json::from_str(raw.trim()).ok().or_else(|| {
        // Try to extract JSON block if there's surrounding text
        let start = raw.find('{')?;
        let end = raw.rfind('}')?;
        serde_json::from_str(&raw[start..=end]).ok()
    });

    if let Some(p) = parsed {
        Ok(AiFix {
            available: true,
            model: Some(model),
            explanation: p.explanation.unwrap_or_else(|| "No explanation provided.".to_string()),
            fix_suggestion: p.fix_suggestion.unwrap_or_else(|| "No fix suggestion provided.".to_string()),
            fixed_code: p.fixed_code,
        })
    } else {
        // Ollama responded but JSON parsing failed — return raw as explanation
        Ok(AiFix {
            available: true,
            model: Some(model),
            explanation: raw.clone(),
            fix_suggestion: "See explanation above.".to_string(),
            fixed_code: None,
        })
    }
}

fn detect_language(path: &str) -> String {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "rs" => "rust",
        "py" => "python",
        "js" | "mjs" | "cjs" => "javascript",
        "ts" | "mts" => "typescript",
        "tsx" => "typescriptreact",
        "jsx" => "javascriptreact",
        "go" => "go",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "cs" => "csharp",
        "cpp" | "cc" | "cxx" => "cpp",
        "c" => "c",
        "rb" => "ruby",
        "php" => "php",
        "swift" => "swift",
        "sh" | "bash" => "shell",
        "yml" | "yaml" => "yaml",
        "json" => "json",
        "toml" => "toml",
        "md" => "markdown",
        "html" | "htm" => "html",
        "css" => "css",
        "sql" => "sql",
        "env" => "plaintext",
        _ => "plaintext",
    }
    .to_string()
}

#[tauri::command]
pub async fn read_file_context(
    file_path: String,
    line_number: Option<i64>,
) -> Result<FileContext, String> {
    const MAX_BYTES: usize = 50 * 1024; // 50KB

    let raw = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let content = if raw.len() > MAX_BYTES {
        String::from_utf8_lossy(&raw[..MAX_BYTES]).into_owned()
    } else {
        String::from_utf8_lossy(&raw).into_owned()
    };

    let total_lines = content.lines().count();
    let language = detect_language(&file_path);

    Ok(FileContext {
        content,
        language,
        total_lines,
        target_line: line_number,
    })
}

/// Save edited file content back to disk (creates .vulndash.bak backup first).
#[tauri::command]
pub async fn save_file_content(file_path: String, content: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    // Create backup
    let backup_path = format!("{}.vulndash.bak", file_path);
    if let Err(e) = std::fs::copy(&file_path, &backup_path) {
        tracing::warn!("Could not create backup: {}", e);
    }
    // Write new content
    std::fs::write(&file_path, &content).map_err(|e| e.to_string())?;
    tracing::info!("Saved file: {}", file_path);
    Ok(())
}
