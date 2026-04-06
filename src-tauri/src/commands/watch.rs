// VulnDash — Watch Mode command
// Monitors project files and emits events when relevant files change

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use notify::event::{ModifyKind, CreateKind, RemoveKind};
use tauri::{AppHandle, Emitter, Manager, State};
use tracing::{info, warn};

/// State holding active watchers keyed by project_id
#[derive(Default)]
pub struct WatchState(pub Mutex<HashMap<String, RecommendedWatcher>>);

/// Extensions we care about
const WATCHED_EXTENSIONS: &[&str] = &[
    "rs", "toml", "lock", "json", "py", "txt", "ts", "js", "env", "yaml", "yml",
];

fn is_relevant(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| WATCHED_EXTENSIONS.contains(&ext))
        .unwrap_or(false)
}

#[tauri::command]
pub fn toggle_watch(
    app: AppHandle,
    state: State<WatchState>,
    project_id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut watchers = state.0.lock().map_err(|e| e.to_string())?;

    if !enabled {
        watchers.remove(&project_id);
        info!("Watch mode disabled for project {}", project_id);
        return Ok(());
    }

    // Look up project path from DB
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let db_path = app_dir.join("vulndash.db");
    let project_path = crate::db::get_project_path(&db_path, &project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Project {} not found or has no local path", project_id))?;

    let pid = project_id.clone();
    let app_handle = app.clone();

    // Use a channel-based watcher with debounce
    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<Event>>();

    let mut watcher = RecommendedWatcher::new(tx, notify::Config::default().with_poll_interval(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&project_path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Spawn background thread to handle events
    std::thread::spawn(move || {
        use std::time::Instant;
        let debounce = Duration::from_secs(3);
        let mut last_emit: Option<Instant> = None;

        for result in rx {
            match result {
                Ok(event) => {
                    let relevant = event.paths.iter().any(|p| is_relevant(p));
                    if !relevant {
                        continue;
                    }

                    let is_change = matches!(
                        event.kind,
                        EventKind::Create(CreateKind::File)
                            | EventKind::Modify(ModifyKind::Data(_))
                            | EventKind::Modify(ModifyKind::Name(_))
                            | EventKind::Remove(RemoveKind::File)
                    );

                    if !is_change {
                        continue;
                    }

                    let now = Instant::now();
                    let should_emit = last_emit
                        .map(|t| now.duration_since(t) >= debounce)
                        .unwrap_or(true);

                    if should_emit {
                        last_emit = Some(now);
                        info!("Watch: relevant change detected for project {}", pid);
                        if let Err(e) = app_handle.emit("watch:changed", pid.clone()) {
                            warn!("Failed to emit watch:changed: {}", e);
                        }
                    }
                }
                Err(e) => {
                    warn!("Watch error for project {}: {}", pid, e);
                    break;
                }
            }
        }
        info!("Watch thread exiting for project {}", pid);
    });

    watchers.insert(project_id.clone(), watcher);
    info!("Watch mode enabled for project {} at {}", project_id, project_path);
    Ok(())
}
