use tauri::Manager;

/// Export a self-contained HTML security report for a given scan.
#[tauri::command]
pub async fn export_html_report(
    app: tauri::AppHandle,
    project_id: String,
    scan_id: String,
    output_path: String,
) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let db_path = app_dir.join("vulndash.db");
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    // Fetch project
    let (project_name, project_path): (String, Option<String>) = conn
        .query_row(
            "SELECT name, path FROM projects WHERE id = ?1",
            rusqlite::params![project_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Project not found: {e}"))?;

    // Fetch scan metadata
    let (scan_started_at, scan_score): (i64, Option<i64>) = conn
        .query_row(
            "SELECT started_at, score FROM scans WHERE id = ?1",
            rusqlite::params![scan_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Scan not found: {e}"))?;

    // Fetch findings sorted by severity weight
    let mut stmt = conn.prepare(
        "SELECT tool, severity, title, description, file_path, line_number, cve_id, cvss_score, fix_version
         FROM findings
         WHERE scan_id = ?1
         ORDER BY CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high'     THEN 2
           WHEN 'medium'   THEN 3
           WHEN 'low'      THEN 4
           ELSE 5
         END"
    ).map_err(|e| e.to_string())?;

    struct Row {
        tool: String,
        severity: String,
        title: String,
        #[allow(dead_code)]
        description: Option<String>,
        file_path: Option<String>,
        line_number: Option<i64>,
        cve_id: Option<String>,
        cvss_score: Option<f64>,
        fix_version: Option<String>,
    }

    let rows: Vec<Row> = stmt
        .query_map(rusqlite::params![scan_id], |row| {
            Ok(Row {
                tool: row.get(0)?,
                severity: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                file_path: row.get(4)?,
                line_number: row.get(5)?,
                cve_id: row.get(6)?,
                cvss_score: row.get(7)?,
                fix_version: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Count by severity
    let total = rows.len();
    let critical = rows.iter().filter(|r| r.severity == "critical").count();
    let high     = rows.iter().filter(|r| r.severity == "high").count();
    let medium   = rows.iter().filter(|r| r.severity == "medium").count();
    let low      = rows.iter().filter(|r| r.severity == "low").count();
    let _info    = rows.iter().filter(|r| r.severity == "info").count();

    // Score/grade
    let score = scan_score.unwrap_or(0);
    let grade = match score {
        90..=100 => "A",
        75..=89  => "B",
        60..=74  => "C",
        40..=59  => "D",
        _        => "F",
    };
    let score_color = match score {
        90..=100 => "#22c55e",
        75..=89  => "#3b82f6",
        60..=74  => "#eab308",
        40..=59  => "#f97316",
        _        => "#ef4444",
    };

    // Date
    let date_str = {
        let secs = scan_started_at as u64;
        // Simple ISO-like formatting without chrono
        let _ts = std::time::UNIX_EPOCH + std::time::Duration::from_secs(secs);
        format!("{}", humanize_ts(scan_started_at))
    };

    // Build findings table rows
    let findings_rows: String = rows.iter().map(|r| {
        let sev_color = match r.severity.as_str() {
            "critical" => ("#7f1d1d", "#ef4444"),
            "high"     => ("#431407", "#f97316"),
            "medium"   => ("#422006", "#eab308"),
            "low"      => ("#1e3a5f", "#60a5fa"),
            _          => ("#27272a", "#71717a"),
        };
        let badge = format!(
            r#"<span style="background:{};color:{};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase">{}</span>"#,
            sev_color.0, sev_color.1, escape_html(&r.severity)
        );
        let cve = r.cve_id.as_deref().unwrap_or("—");
        let _file = match (&r.file_path, &r.line_number) {
            (Some(f), Some(l)) => format!("{}:{}", escape_html(f), l),
            (Some(f), None)    => escape_html(f),
            _                  => "—".to_string(),
        };
        let fix = r.fix_version.as_deref().map(escape_html).unwrap_or_else(|| "—".to_string());
        let cvss = r.cvss_score.map(|v| format!("{:.1}", v)).unwrap_or_else(|| "—".to_string());
        format!(
            r#"<tr>
              <td style="padding:10px 12px">{badge}</td>
              <td style="padding:10px 12px;color:#e4e4e7">{title}</td>
              <td style="padding:10px 12px;color:#a1a1aa;font-family:monospace;font-size:12px">{cve}</td>
              <td style="padding:10px 12px;color:#a1a1aa">{tool}</td>
              <td style="padding:10px 12px;color:#71717a;font-family:monospace;font-size:11px">{cvss}</td>
              <td style="padding:10px 12px;color:#86efac">{fix}</td>
            </tr>"#,
            badge = badge,
            title = escape_html(&r.title),
            cve = escape_html(cve),
            tool = escape_html(&r.tool),
            cvss = cvss,
            fix = fix,
        )
    }).collect();

    let project_display = escape_html(&project_name);
    let path_display = project_path.as_deref().map(escape_html).unwrap_or_default();

    let html = format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VulnDash Report — {project_display}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#09090b;color:#e4e4e7;min-height:100vh;padding:0}}
  a{{color:#60a5fa;text-decoration:none}}
  .page{{max-width:1100px;margin:0 auto;padding:40px 24px}}
  .header{{display:flex;align-items:center;justify-content:space-between;padding:32px 40px;background:linear-gradient(135deg,#18181b 0%,#0f0f11 100%);border:1px solid rgba(255,255,255,0.07);border-radius:16px;margin-bottom:28px}}
  .header-left h1{{font-size:26px;font-weight:800;color:#f4f4f5;margin-bottom:4px}}
  .header-left .meta{{font-size:13px;color:#71717a;font-family:monospace}}
  .score-circle{{display:flex;flex-direction:column;align-items:center;gap:4px}}
  .score-circle .num{{font-size:48px;font-weight:900;line-height:1;color:{score_color}}}
  .score-circle .grade{{font-size:22px;font-weight:700;color:{score_color}}}
  .score-circle .label{{font-size:12px;color:#71717a;margin-top:2px}}
  .cards{{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:28px}}
  .card{{background:#18181b;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;text-align:center}}
  .card .val{{font-size:32px;font-weight:800;margin-bottom:4px}}
  .card .lbl{{font-size:12px;color:#71717a;font-weight:500}}
  .card.total .val{{color:#f4f4f5}}
  .card.crit .val{{color:#ef4444}}
  .card.high .val{{color:#f97316}}
  .card.med  .val{{color:#eab308}}
  .card.low  .val{{color:#60a5fa}}
  .section-title{{font-size:15px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px}}
  table{{width:100%;border-collapse:collapse;background:#18181b;border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden}}
  thead tr{{background:#0f0f11}}
  th{{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#52525b;border-bottom:1px solid rgba(255,255,255,0.06)}}
  tbody tr{{border-bottom:1px solid rgba(255,255,255,0.04)}}
  tbody tr:last-child{{border-bottom:none}}
  tbody tr:hover{{background:rgba(255,255,255,0.02)}}
  td{{vertical-align:middle}}
  .footer{{margin-top:40px;text-align:center;color:#3f3f46;font-size:12px;padding:16px 0;border-top:1px solid rgba(255,255,255,0.05)}}
  .empty{{padding:48px;text-align:center;color:#52525b;font-size:14px}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>🔐 {project_display}</h1>
      <div class="meta" style="margin-top:8px">{path_display}</div>
      <div class="meta" style="margin-top:4px">Scanned: {date_str}</div>
    </div>
    <div class="score-circle">
      <div class="num">{score}</div>
      <div class="grade">{grade}</div>
      <div class="label">Security Score</div>
    </div>
  </div>

  <div class="cards">
    <div class="card total"><div class="val">{total}</div><div class="lbl">Total Findings</div></div>
    <div class="card crit"><div class="val">{critical}</div><div class="lbl">Critical</div></div>
    <div class="card high"><div class="val">{high}</div><div class="lbl">High</div></div>
    <div class="card med"><div class="val">{medium}</div><div class="lbl">Medium</div></div>
    <div class="card low"><div class="val">{low}</div><div class="lbl">Low</div></div>
  </div>

  <div class="section-title">Findings</div>
  {findings_section}

  <div class="footer">Generated by VulnDash &mdash; privacy-first security scanner</div>
</div>
</body>
</html>"#,
        project_display = project_display,
        path_display = path_display,
        date_str = date_str,
        score_color = score_color,
        score = score,
        grade = grade,
        total = total,
        critical = critical,
        high = high,
        medium = medium,
        low = low,
        findings_section = if rows.is_empty() {
            r#"<div class="empty">✅ No findings — clean scan!</div>"#.to_string()
        } else {
            format!(r#"<table>
    <thead><tr>
      <th>Severity</th><th>Title</th><th>CVE / ID</th><th>Tool</th><th>File</th><th>Fix Version</th>
    </tr></thead>
    <tbody>{findings_rows}</tbody>
  </table>"#, findings_rows = findings_rows)
        },
    );

    std::fs::write(&output_path, html).map_err(|e| format!("Failed to write report: {e}"))?;
    Ok(())
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
}

fn humanize_ts(unix_secs: i64) -> String {
    // Manual UTC timestamp formatting without external crates
    let secs = unix_secs as u64;
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;

    // Gregorian calendar algorithm
    let z = days_since_epoch + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02} {:02}:{:02} UTC", y, m, d, hours, minutes)
}
