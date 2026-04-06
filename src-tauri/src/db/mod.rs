use rusqlite::{Connection, Result};
use std::path::Path;
use tracing::info;

/// Initialize the SQLite database and run migrations.
pub fn init(db_path: &Path) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(SCHEMA)?;
    info!("Database schema applied");
    Ok(())
}

/// Open a connection to the database.
pub fn connect(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

/// Get the local filesystem path for a project.
pub fn get_project_path(db_path: &Path, project_id: &str) -> Result<Option<String>> {
    let conn = connect(db_path)?;
    let mut stmt = conn.prepare("SELECT path FROM projects WHERE id = ?1")?;
    let result = stmt.query_row([project_id], |row| row.get::<_, Option<String>>(0));
    match result {
        Ok(path) => Ok(path),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

const SCHEMA: &str = "
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    path         TEXT,
    github_url   TEXT,
    github_owner TEXT,
    github_repo  TEXT,
    created_at   INTEGER NOT NULL,
    last_scan_at INTEGER,
    score        INTEGER
);

CREATE TABLE IF NOT EXISTS scans (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    status      TEXT NOT NULL DEFAULT 'running',
    score       INTEGER,
    summary     TEXT
);

CREATE TABLE IF NOT EXISTS findings (
    id           TEXT PRIMARY KEY,
    scan_id      TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    tool         TEXT NOT NULL,
    severity     TEXT NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    file_path    TEXT,
    line_number  INTEGER,
    cve_id       TEXT,
    cvss_score   REAL,
    fix_version  TEXT,
    ai_advice    TEXT,
    mitre_id     TEXT,
    status       TEXT NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_id);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
";
