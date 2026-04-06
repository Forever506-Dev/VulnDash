# VulnDash — AGENTS.md
# Context for AI agents working on this project

## Project Identity
**VulnDash** is a cross-platform desktop security scanner for developers.
Built with Tauri 2 (Rust backend) + React 19 (TypeScript frontend).
Think: a personal cybersecurity coach that lives on your desktop.

## Core Principle
Privacy-first. Everything runs locally by default. No telemetry. No cloud required.
Offline-capable. AI features use Ollama locally; OpenAI is opt-in only.

## Stack (non-negotiable)
- **Desktop:** Tauri 2
- **Backend:** Rust (in src-tauri/)
- **Frontend:** React 19 + TypeScript + Tailwind CSS v4
- **DB:** SQLite via rusqlite (embedded, no server)
- **State:** Zustand (frontend)
- **Charts:** Recharts
- **IPC:** Tauri commands + events (no REST API between frontend/backend)

## Design Language
- Dark theme ONLY — deep blacks, subtle glass effects, red accent (#e53535)
- High contrast — readability is paramount
- Severity colors: Critical=red, High=orange, Medium=yellow, Low=blue, Info=gray
- Dense but clean — developers are power users, don't oversimplify
- Inspired by: VSCode, GitHub, Linear, Vercel dashboard

## Code Conventions — Rust
- Use `thiserror` for error types
- Use `serde` for all serialization
- All Tauri commands return `Result<T, String>`
- Use `tokio` for async (Tauri uses tokio runtime)
- Scanner modules live in `src-tauri/src/scanner/`
- Each scanner implements the `Scanner` trait
- Database access only through functions in `src-tauri/src/db/`

## Code Conventions — TypeScript/React
- Functional components only — no class components
- Custom hooks for all Tauri IPC calls (in src/hooks/)
- Tailwind v4 utility classes — NO inline styles
- All Tauri invoke calls are typed (use generated types or manual interfaces)
- Components are small and focused — one responsibility per component

## Scanner Trait (Rust)
```rust
pub trait Scanner: Send + Sync {
    fn name(&self) -> &str;
    fn supported_languages(&self) -> Vec<&str>;
    async fn scan(&self, path: &Path) -> Result<Vec<Finding>, ScanError>;
}
```

## Finding Structure
```rust
pub struct Finding {
    pub id: Uuid,
    pub scan_id: Uuid,
    pub tool: String,
    pub severity: Severity,  // Critical|High|Medium|Low|Info
    pub title: String,
    pub description: String,
    pub file_path: Option<PathBuf>,
    pub line_number: Option<u32>,
    pub cve_id: Option<String>,
    pub cvss_score: Option<f32>,
    pub fix_version: Option<String>,
    pub mitre_id: Option<String>,
}
```

## What NOT to do
- No Express/Node backend — Tauri IS the backend
- No REST API between frontend and Rust — use Tauri IPC only
- No `any` type in TypeScript — always type properly
- No hardcoded paths — use Tauri's path APIs
- No network calls from frontend directly — route through Rust commands
- No storing secrets/tokens in SQLite plaintext — use OS keychain

## Current Status
Planning phase. No code written yet.
Start with: Tauri app scaffold + basic project management + local folder scan.

## Key Files
- README.md — Project overview and feature list
- ARCHITECTURE.md — Full component map, DB schema, IPC contracts
- SPEC.md — Detailed feature specifications (coming)
- STACK.md — Technology decisions (coming)

## Owner
Vincent Roussel (Forever506-Dev) — viroussel@osullivan-quebec.qc.ca
AI pair: Hexis 🔐
