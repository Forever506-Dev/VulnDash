use crate::scanner::Finding;

/// Calculate a security score (0-100) from a list of findings.
pub fn calculate(findings: &[Finding]) -> i32 {
    let mut score = 100i32;

    // Count by severity
    let critical = findings.iter().filter(|f| f.severity == crate::scanner::Severity::Critical).count() as i32;
    let high     = findings.iter().filter(|f| f.severity == crate::scanner::Severity::High).count() as i32;
    let medium   = findings.iter().filter(|f| f.severity == crate::scanner::Severity::Medium).count() as i32;
    let low      = findings.iter().filter(|f| f.severity == crate::scanner::Severity::Low).count() as i32;

    // Check for hardcoded secrets (extra penalty)
    let secrets = findings.iter().filter(|f| f.tool == "gitleaks").count() as i32;

    // Deduct points (with caps)
    score -= (critical * 20).min(60);
    score -= (high * 10).min(40);
    score -= (medium * 3).min(15);
    score -= (low * 1).min(5);
    score -= secrets * 25; // No cap — secrets are critical

    score.clamp(0, 100)
}

/// Convert a score to a letter grade.
#[allow(dead_code)]
pub fn grade(score: i32) -> &'static str {
    match score {
        90..=100 => "A",
        75..=89  => "B",
        60..=74  => "C",
        40..=59  => "D",
        _        => "F",
    }
}

/// Convert a score to a color class (for UI).
#[allow(dead_code)]
pub fn color_class(score: i32) -> &'static str {
    match score {
        90..=100 => "text-green-400",
        75..=89  => "text-blue-400",
        60..=74  => "text-yellow-400",
        40..=59  => "text-orange-400",
        _        => "text-red-500",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::{Finding, Severity};

    fn make_finding(severity: Severity) -> Finding {
        Finding {
            id: "test".to_string(),
            scan_id: "scan".to_string(),
            tool: "test".to_string(),
            severity,
            title: "Test".to_string(),
            description: None,
            file_path: None,
            line_number: None,
            cve_id: None,
            cvss_score: None,
            fix_version: None,
            ai_advice: None,
            mitre_id: None,
            status: "open".to_string(),
        }
    }

    #[test]
    fn test_clean_project_scores_100() {
        assert_eq!(calculate(&[]), 100);
    }

    #[test]
    fn test_critical_deducts_20() {
        let findings = vec![make_finding(Severity::Critical)];
        assert_eq!(calculate(&findings), 80);
    }

    #[test]
    fn test_score_never_below_zero() {
        let findings = vec![
            make_finding(Severity::Critical),
            make_finding(Severity::Critical),
            make_finding(Severity::Critical),
            make_finding(Severity::Critical),
            make_finding(Severity::Critical),
        ];
        assert!(calculate(&findings) >= 0);
    }

    #[test]
    fn test_grade_a() { assert_eq!(grade(95), "A"); }
    #[test]
    fn test_grade_f() { assert_eq!(grade(30), "F"); }
}
