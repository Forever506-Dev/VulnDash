# VulnDash

> **The AI-powered security coach for every developer.**
> Scan your code, your dependencies, your secrets — understand your risk, fix it fast.

![Status](https://img.shields.io/badge/status-planning-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![Stack](https://img.shields.io/badge/stack-Tauri%202%20%7C%20Rust%20%7C%20React%2019-orange)

---

## What is VulnDash?

VulnDash is a **cross-platform desktop application** that acts as a personal security coach for developers. It scans your projects — whether from GitHub or local folders — and gives you a complete, actionable security picture in seconds.

No more running 5 different CLI tools manually. No more forgetting to check your deps before a release. VulnDash does it all in one place, with a dashboard that makes security accessible to every developer, not just security experts.

---

## Key Features

### 🔗 Project Sources
- **GitHub integration** — connect your account, browse and scan any repo
- **Local folder scan** — drag & drop or browse any folder on your machine
- **Auto-rescan** — watch mode for continuous scanning while you code

### 🔍 What it scans
- **Dependencies** — cargo audit, npm audit, pip-audit, Trivy (Docker images)
- **Secrets & credentials** — hardcoded API keys, passwords, tokens (truffleHog / gitleaks integration)
- **License compliance** — detect restrictive licenses in your deps
- **SBOM generation** — Software Bill of Materials (CycloneDX format)
- **Known CVEs** — mapped to CVSS scores, severity levels, fix versions
- **Code patterns** — dangerous function calls, SQL injection risks, XSS vectors
- **Config files** — exposed .env files, insecure settings

### 📊 Dashboard
- **Security Score** — 0-100 score per project with trend over time
- **Risk breakdown** — Critical / High / Medium / Low / Info
- **MITRE ATT&CK mapping** — vulnerability categories mapped to attack techniques
- **Fix suggestions** — AI-powered remediation advice per finding
- **Dependency graph** — visual tree of deps with vuln highlights
- **History** — track how your security score evolves with each scan

### 🤖 AI Security Coach
- Natural language explanations of every vulnerability
- "What should I do?" — step-by-step fix instructions
- Priority ranking — fix this first, that later
- Context-aware — explains why something is dangerous for YOUR stack

### 📤 Reports & Integrations
- Export PDF/HTML security reports
- GitHub PR comments (post scan results as PR review)
- Webhook notifications (Slack, Discord, Telegram)
- CI/CD mode — run as CLI for pipeline integration

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Desktop framework | **Tauri 2** | Rust backend, tiny binary, cross-platform, secure |
| UI | **React 19 + TypeScript** | Modern, component-based, reuse from LearnForge |
| Styling | **Tailwind CSS v4** | Already mastered in our projects |
| Charts | **Recharts** | Clean, React-native charting |
| Rust backend | **Rust** | Fast scanning, process spawning, file system |
| Local DB | **SQLite via rusqlite** | Lightweight, embedded, no server needed |
| AI features | **Ollama (local) + OpenAI fallback** | Privacy-first, works offline |
| GitHub API | **Octokit (REST)** | Official GitHub client |

---

## Architecture Overview

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full diagrams.

```
┌─────────────────────────────────────────────────────┐
│                   VulnDash Desktop                   │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │  React UI    │◄──►│   Tauri IPC Bridge       │  │
│  │  (Frontend)  │    │   (Commands & Events)    │  │
│  └──────────────┘    └──────────┬───────────────┘  │
│                                 │                   │
│                    ┌────────────▼────────────────┐  │
│                    │      Rust Core Engine        │  │
│                    │  ┌─────────┐ ┌───────────┐  │  │
│                    │  │Scanner  │ │ GitHub    │  │  │
│                    │  │Manager  │ │ Client    │  │  │
│                    │  └────┬────┘ └─────┬─────┘  │  │
│                    │       │            │         │  │
│                    │  ┌────▼────────────▼──────┐  │  │
│                    │  │    Tool Runners         │  │  │
│                    │  │ cargo-audit | npm audit │  │  │
│                    │  │ pip-audit   | gitleaks  │  │  │
│                    │  │ trivy       | semgrep   │  │  │
│                    │  └────────────────────────┘  │  │
│                    │                              │  │
│                    │  ┌────────────────────────┐  │  │
│                    │  │   SQLite Database       │  │  │
│                    │  │  (projects, scans,      │  │  │
│                    │  │   findings, history)    │  │  │
│                    │  └────────────────────────┘  │  │
│                    └─────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                          │
                    ┌─────▼──────┐
                    │  AI Engine  │
                    │  (Ollama /  │
                    │   OpenAI)   │
                    └────────────┘
```

---

## Roadmap

### MVP (v0.1)
- [ ] App shell (Tauri 2 + React 19 + Tailwind v4)
- [ ] Local folder scanning (cargo-audit, npm audit, pip-audit)
- [ ] Basic dashboard with findings list
- [ ] SQLite persistence (projects + scan history)
- [ ] Security score calculation

### v0.2
- [ ] GitHub integration (OAuth + repo browser)
- [ ] Secrets detection (gitleaks)
- [ ] AI fix suggestions (Ollama local)
- [ ] Dependency graph visualization

### v0.3
- [ ] PDF/HTML report export
- [ ] SBOM generation (CycloneDX)
- [ ] License compliance checker
- [ ] Webhook notifications

### v1.0
- [ ] CI/CD CLI mode
- [ ] Docker image scanning (Trivy)
- [ ] GitHub PR integration
- [ ] Code pattern analysis (Semgrep rules)

---

## Getting Started

> Documentation coming soon. Project is in planning phase.

---

## License

MIT — Open source, free forever for individual developers.

---

*Built by Vincent Roussel & Hexis 🔐*
