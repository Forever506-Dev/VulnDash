pub mod cargo_audit;
pub mod npm_audit;
pub mod pip_audit;

pub use types::*;

mod types {
    use serde::{Deserialize, Serialize};
    use chrono::Utc;
    use uuid::Uuid;

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct Project {
        pub id: String,
        pub name: String,
        pub path: Option<String>,
        pub github_url: Option<String>,
        pub github_owner: Option<String>,
        pub github_repo: Option<String>,
        pub created_at: i64,
        pub last_scan_at: Option<i64>,
        pub score: Option<i32>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct Scan {
        pub id: String,
        pub project_id: String,
        pub started_at: i64,
        pub finished_at: Option<i64>,
        pub status: String,
        pub score: Option<i32>,
        pub summary: Option<serde_json::Value>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct Finding {
        pub id: String,
        pub scan_id: String,
        pub tool: String,
        pub severity: Severity,
        pub title: String,
        pub description: Option<String>,
        pub file_path: Option<String>,
        pub line_number: Option<i64>,
        pub cve_id: Option<String>,
        pub cvss_score: Option<f64>,
        pub fix_version: Option<String>,
        pub ai_advice: Option<String>,
        pub mitre_id: Option<String>,
        pub status: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "lowercase")]
    pub enum Severity {
        Critical,
        High,
        Medium,
        Low,
        Info,
    }

    impl Severity {
        pub fn as_str(&self) -> &str {
            match self {
                Severity::Critical => "critical",
                Severity::High => "high",
                Severity::Medium => "medium",
                Severity::Low => "low",
                Severity::Info => "info",
            }
        }
    }
}
