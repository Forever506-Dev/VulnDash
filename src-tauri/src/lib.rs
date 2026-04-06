// VulnDash — Main entry point
// Tauri 2 application

mod ai;
mod commands;
mod db;
mod scanner;
mod score;

use tauri::Manager;
use tracing::info;
use commands::watch::WatchState;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "vulndash=info".into()),
        )
        .init();

    info!("VulnDash starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Initialize database on startup
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir)?;
            let db_path = app_dir.join("vulndash.db");
            db::init(&db_path).expect("Failed to initialize database");
            info!("Database initialized at {:?}", db_path);
            Ok(())
        })
        .manage(WatchState::default())
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::add_project_local,
            commands::projects::add_project_github,
            commands::projects::delete_project,
            commands::scan::start_scan,
            commands::scan::get_scan_results,
            commands::scan::list_scans,
            commands::scan::compare_scans,
            commands::scan::auto_fix_deps,
            commands::report::export_html_report,
            commands::ai::get_ai_fix,
            commands::ai::read_file_context,
            commands::tools::check_tools,
            commands::watch::toggle_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VulnDash");
}
