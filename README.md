# VulnDash

> **The AI-powered security coach for every developer.**
> Scan your code, your dependencies, your secrets — understand your risk, fix it fast.

![Status](https://img.shields.io/badge/status-beta-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![Stack](https://img.shields.io/badge/stack-Tauri%202%20%7C%20Rust%20%7C%20React%2019-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## What is VulnDash?

VulnDash is a **cross-platform desktop application** that acts as a personal security coach for developers. It scans your projects — whether from GitHub or local folders — and gives you a complete, actionable security picture in seconds.

No more running 5 different CLI tools manually. No more forgetting to check your deps before a release. VulnDash does it all in one place, with a dashboard that makes security accessible to every developer, not just security experts.

**Privacy-first.** Everything runs locally by default. No telemetry. No cloud required.

---

## Screenshots

> _Screenshots coming soon — beta release_

<!-- Add screenshots here once UI is stabilized -->

---

## Key Features

### 🔗 Project Sources
- **GitHub integration** — connect your account, browse and scan any repo
- **Local folder scan** — drag & drop or browse any folder on your machine
- **Auto-rescan** — watch mode for continuous scanning while you code

### 🔍 What it scans
- **Dependencies** — cargo-audit, npm audit, pip-audit, Trivy (Docker images)
- **Secrets & credentials** — hardcoded API keys, passwords, tokens (gitleaks integration)
- **License compliance** — detect restrictive licenses in your deps
- **SBOM generation** — Software Bill of Materials (CycloneDX format)
- **Known CVEs** — mapped to CVSS scores, severity levels, fix versions
- **Code patterns** — dangerous function calls, SQL injection risks, XSS vectors
- **Config files** — exposed .env files, insecure settings

### 📊 Dashboard
- **Security Score** — 0-100 score per project with trend over time
- **Risk breakdown** — Critical / High / Medium / Low / Info
- **MITRE ATT&CK mapping** — vulnerability categories mapped to attack techniques
- **AI fix suggestions** — AI-powered remediation advice per finding via Ollama (local LLM)
- **Scan diff view** — see what's new vs what's been fixed between scans
- **History** — track how your security score evolves with each scan

### 🤖 AI Security Coach
- Natural language explanations of every vulnerability
- "What should I do?" — step-by-step fix instructions
- Priority ranking — fix this first, that later
- Context-aware — explains why something is dangerous for YOUR stack

### 📤 Reports & Integrations
- Export HTML security reports
- Desktop notifications
- Webhook notifications (Slack, Discord, Telegram)
- CI/CD mode — run as CLI for pipeline integration

---

## Prerequisites

### 📦 For end users (just running VulnDash)

Download the installer for your platform from the [latest release](https://github.com/Forever506-Dev/VulnDash/releases/latest) — no prerequisites needed for Windows/macOS.

**Optional — for AI-powered fix suggestions:**
1. Install **Ollama Desktop** from [ollama.ai](https://ollama.ai)
2. Pull the recommended model:
   ```bash
   ollama pull codellama
   ```
   VulnDash auto-detects Ollama when it's running. You can also use `mistral` or any other model — VulnDash picks the best available.

**Optional — for Rust project scanning (cargo-audit):**
```bash
# Install Rust first:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Then install cargo-audit:
cargo install cargo-audit
```

---

### 🛠️ For developers (building from source)

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Rust 1.70+** — [rustup.rs](https://rustup.rs)

### Platform-specific build dependencies

**Windows**
```
winget install Microsoft.VisualStudio.2022.BuildTools
```
(Select "Desktop development with C++" workload)

**Linux (Ubuntu/Debian)**
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

**macOS**
```bash
xcode-select --install
```

---

## Quick Start

1. **Clone the repo**
   ```bash
   git clone https://github.com/Forever506-Dev/VulnDash
   cd VulnDash
   ```

2. **Run the setup script** *(optional — installs prerequisites automatically)*
   ```bash
   # Linux/macOS
   bash scripts/setup.sh

   # Windows (PowerShell)
   .\scripts\setup.ps1
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the development build**
   ```bash
   npm run tauri dev
   ```

5. **Build for production**
   ```bash
   npm run tauri build
   ```

---

## Development

### Project Structure

```
VulnDash/
├── src/                  # React frontend (TypeScript)
│   ├── components/       # UI components
│   ├── hooks/            # Tauri IPC hooks
│   └── stores/           # Zustand state stores
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── scanner/      # Scanner modules (each implements Scanner trait)
│   │   ├── db/           # SQLite database access layer
│   │   └── main.rs       # Entry point + Tauri commands
│   └── Cargo.toml
├── scripts/              # Setup scripts
├── .github/workflows/    # CI/CD workflows
└── ARCHITECTURE.md       # Full component map & DB schema
```

### Running Tests

```bash
# Rust tests
cd src-tauri && cargo test

# Lint Rust code
cd src-tauri && cargo clippy
```

### Key Architecture Decisions

- **No REST API** — frontend/backend communicate exclusively via Tauri IPC (commands & events)
- **Local-first** — SQLite embedded database, no server required
- **Privacy** — no telemetry, AI features use local Ollama by default
- **Dark theme only** — deep blacks, red accent (`#e53535`), severity color system

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full diagrams and IPC contracts.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   VulnDash Desktop                  │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  React UI    │◄──►│   Tauri IPC Bridge       │   │
│  │  (Frontend)  │    │   (Commands & Events)    │   │
│  └──────────────┘    └──────────┬───────────────┘   │
│                                 │                   │
│                    ┌────────────▼────────────────┐  │
│                    │      Rust Core Engine       │  │
│                    │  ┌─────────┐ ┌───────────┐  │  │
│                    │  │Scanner  │ │ GitHub    │  │  │
│                    │  │Manager  │ │ Client    │  │  │
│                    │  └────┬────┘ └─────┬─────┘  │  │
│                    │       │            │        │  │
│                    │  ┌────▼────────────▼──────┐ │  │
│                    │  │    Tool Runners        │ │  │
│                    │  │ cargo-audit | npm audit│ │  │
│                    │  │ pip-audit   | gitleaks │ │  │
│                    │  │ trivy       | semgrep  │ │  │
│                    │  └────────────────────────┘ │  │
│                    │                             │  │
│                    │  ┌────────────────────────┐ │  │
│                    │  │   SQLite Database      │ │  │
│                    │  │  (projects, scans,     │ │  │
│                    │  │   findings, history)   │ │  │
│                    │  └────────────────────────┘ │  │
│                    └─────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                          │
                    ┌─────▼──────┐
                    │  AI Engine │
                    │  (Ollama / │
                    │   OpenAI)  │
                    └────────────┘
```

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to get started, submit changes, and follow code style conventions.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

---

## Roadmap

### v0.1.0 ✅ (Released)
- [x] Tauri 2 + React 19 + Tailwind v4 desktop app
- [x] Local folder + GitHub repo scanning
- [x] Dependency scanning (cargo-audit, npm audit, pip-audit)
- [x] Secrets detection (gitleaks + regex fallback)
- [x] AI Coach with Ollama local LLM (CodeLlama, Mistral)
- [x] Monaco Editor with vulnerable line highlighting
- [x] Apply AI fix directly to source files
- [x] Security score 0-100 with trend chart
- [x] Scan history + diff view
- [x] HTML report export
- [x] Desktop notifications
- [x] Watch mode (auto-rescan on file change)
- [x] Auto-install missing tools
- [x] Cross-platform builds (Windows, Linux, macOS)

### v0.2 (Planned)
- [ ] **Auto-update** — check GitHub releases on startup, notify user of new versions, one-click update
- [ ] Docker image scanning (Trivy)
- [ ] SBOM generation (CycloneDX)
- [ ] License compliance checker
- [ ] Dependency graph visualization
- [ ] GitHub PR integration (post scan as PR comment)
- [ ] CI/CD CLI mode

### v1.0 (Future)
- [ ] **Silent auto-update** — download and install new versions automatically in background
- [ ] Code pattern analysis (Semgrep)
- [ ] Custom detection rules
- [ ] Team/organization support
- [ ] SaaS dashboard (optional cloud sync)

---

## License

MIT — Open source, free forever for individual developers.

---

*Built by Forever506-Dev 🔐*
