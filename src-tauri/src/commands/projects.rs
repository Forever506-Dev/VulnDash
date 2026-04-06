use crate::scanner::{Project};
use rusqlite::Connection;
use uuid::Uuid;
use chrono::Utc;
use std::path::PathBuf;

/// List all projects.
#[tauri::command]
pub async fn list_projects(app: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let db_path = get_db_path(&app)?;
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, name, path, github_url, github_owner, github_repo,
                created_at, last_scan_at, score
         FROM projects ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            github_url: row.get(3)?,
            github_owner: row.get(4)?,
            github_repo: row.get(5)?,
            created_at: row.get(6)?,
            last_scan_at: row.get(7)?,
            score: row.get(8)?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(projects)
}

/// Add a project from a local folder path.
#[tauri::command]
pub async fn add_project_local(
    app: tauri::AppHandle,
    path: String,
    name: Option<String>,
) -> Result<Project, String> {
    let folder = PathBuf::from(&path);
    if !folder.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let project_name = name.unwrap_or_else(|| {
        folder.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown Project")
            .to_string()
    });

    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: project_name,
        path: Some(path),
        github_url: None,
        github_owner: None,
        github_repo: None,
        created_at: Utc::now().timestamp(),
        last_scan_at: None,
        score: None,
    };

    let db_path = get_db_path(&app)?;
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO projects (id, name, path, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![project.id, project.name, project.path, project.created_at],
    ).map_err(|e| e.to_string())?;

    Ok(project)
}

/// Delete a project and all its scans/findings.
#[tauri::command]
pub async fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = crate::db::connect(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM projects WHERE id = ?1",
        rusqlite::params![project_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("vulndash.db"))
        .map_err(|e| e.to_string())
}
