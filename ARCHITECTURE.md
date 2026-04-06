# VulnDash — Architecture

## Overview

VulnDash is a Tauri 2 desktop application. The Rust backend handles all heavy lifting
(file scanning, process spawning, DB, GitHub API). The React frontend is purely UI.
Communication happens via Tauri's IPC (commands + events).

---

## Component Map

### Frontend (React 19 + TypeScript)

```
src/
├── App.tsx                    # Root + routing
├── pages/
│   ├── Dashboard.tsx          # Main security overview
│   ├── Projects.tsx           # Project list + add new
│   ├── ScanResults.tsx        # Detailed findings for a scan
│   ├── History.tsx            # Scan history + score trends
│   ├── Settings.tsx           # GitHub auth, AI config, preferences
│   └── Report.tsx             # Report preview + export
├── components/
│   ├── SecurityScore.tsx      # Circular score gauge (0-100)
│   ├── FindingCard.tsx        # Single vulnerability card
│   ├── SeverityBadge.tsx      # Critical/High/Medium/Low badge
│   ├── DependencyGraph.tsx    # D3/Recharts dep tree
│   ├── ScanProgress.tsx       # Real-time scan progress bar
│   ├── AiCoach.tsx            # Chat-style AI fix suggestions
│   └── RepoSelector.tsx       # GitHub repo browser
├── hooks/
│   ├── useScanner.ts          # Tauri commands for scanning
│   ├── useProjects.ts         # Project CRUD
│   ├── useGitHub.ts           # GitHub API interactions
│   └── useAI.ts               # AI coach interactions
└── store/
    └── appStore.ts            # Zustand global state
```

### Backend (Rust + Tauri)

```
src-tauri/src/
├── main.rs                    # App entry point
├── commands/
│   ├── scan.rs                # Scan commands (Tauri IPC)
│   ├── projects.rs            # Project management commands
│   ├── github.rs              # GitHub API commands
│   ├── ai.rs                  # AI coach commands
│   └── report.rs              # Report generation commands
├── scanner/
│   ├── mod.rs                 # Scanner orchestrator
│   ├── cargo_audit.rs         # Rust dependency scanner
│   ├── npm_audit.rs           # Node.js dependency scanner
│   ├── pip_audit.rs           # Python dependency scanner
│   ├── gitleaks.rs            # Secrets detection
│   ├── trivy.rs               # Docker/container scanning
│   ├── semgrep.rs             # Code pattern analysis
│   └── license.rs             # License compliance checker
├── github/
│   ├── client.rs              # GitHub REST API client
│   ├── auth.rs                # OAuth flow
│   └── repos.rs               # Repo listing + cloning
├── db/
│   ├── mod.rs                 # SQLite connection pool
│   ├── migrations/            # SQL migration files
│   ├── projects.rs            # Projects table operations
│   ├── scans.rs               # Scans table operations
│   └── findings.rs            # Findings table operations
├── ai/
│   ├── mod.rs                 # AI engine selector
│   ├── ollama.rs              # Local Ollama client
│   └── openai.rs              # OpenAI fallback client
└── score/
    └── calculator.rs          # Security score algorithm
```

---

## Database Schema

```sql
-- Projects tracked by VulnDash
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,   -- UUID
    name        TEXT NOT NULL,
    path        TEXT,               -- Local path (nullable if GitHub)
    github_url  TEXT,               -- GitHub URL (nullable if local)
    github_owner TEXT,
    github_repo  TEXT,
    created_at  INTEGER NOT NULL,
    last_scan_at INTEGER,
    score       INTEGER             -- Latest security score 0-100
);

-- Individual scan runs
CREATE TABLE scans (
    id          TEXT PRIMARY KEY,   -- UUID
    project_id  TEXT NOT NULL REFERENCES projects(id),
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    status      TEXT NOT NULL,      -- running | completed | failed
    score       INTEGER,            -- Score for this scan
    summary     TEXT                -- JSON summary counts per severity
);

-- Individual findings from a scan
CREATE TABLE findings (
    id           TEXT PRIMARY KEY,  -- UUID
    scan_id      TEXT NOT NULL REFERENCES scans(id),
    tool         TEXT NOT NULL,     -- cargo-audit | npm-audit | gitleaks | etc.
    severity     TEXT NOT NULL,     -- critical | high | medium | low | info
    title        TEXT NOT NULL,
    description  TEXT,
    file_path    TEXT,
    line_number  INTEGER,
    cve_id       TEXT,
    cvss_score   REAL,
    fix_version  TEXT,
    ai_advice    TEXT,              -- AI-generated fix suggestion
    mitre_id     TEXT,              -- MITRE ATT&CK technique ID
    status       TEXT DEFAULT 'open' -- open | fixed | ignored | false_positive
);
```

---

## Security Score Algorithm

```
Base score: 100

Deductions:
  Critical finding: -20 points each (max -60)
  High finding:     -10 points each (max -40)
  Medium finding:   -3 points each  (max -15)
  Low finding:      -1 point each   (max -5)
  Secrets found:    -25 points each (no cap — secrets are critical)

Bonuses:
  All deps up to date:    +5
  No secrets found:       +5
  SBOM generated:         +2
  Last scan < 7 days ago: +3

Final score: clamp(0, 100)

Grades:
  90-100: A (Excellent)
  75-89:  B (Good)
  60-74:  C (Needs attention)
  40-59:  D (At risk)
  0-39:   F (Critical)
```

---

## Tauri IPC Commands

```typescript
// Scan commands
invoke('start_scan', { projectId: string })
invoke('get_scan_status', { scanId: string })
invoke('cancel_scan', { scanId: string })

// Project commands
invoke('add_project_local', { path: string })
invoke('add_project_github', { owner: string, repo: string })
invoke('list_projects')
invoke('delete_project', { projectId: string })

// GitHub commands
invoke('github_auth_start')          // Opens OAuth browser
invoke('github_list_repos')
invoke('github_clone_repo', { owner: string, repo: string })

// AI commands
invoke('get_ai_advice', { findingId: string })
invoke('get_ai_summary', { scanId: string })

// Report commands
invoke('export_pdf', { scanId: string, outputPath: string })
invoke('export_html', { scanId: string, outputPath: string })
invoke('generate_sbom', { projectId: string })
```

---

## Tauri Events (real-time updates)

```typescript
// Listen for scan progress
listen('scan:progress', (event) => {
  // { tool: string, progress: number, message: string }
})

// Listen for new findings
listen('scan:finding', (event) => {
  // { finding: Finding }
})

// Listen for scan completion
listen('scan:completed', (event) => {
  // { scanId: string, score: number, summary: ScanSummary }
})
```

---

## AI Coach Design

The AI coach receives structured context per finding:

```
Finding: [title]
Severity: [severity]
CVE: [cve_id] (CVSS: [score])
Tool: [tool]
File: [file_path]:[line_number]
Stack: [detected languages/frameworks]
Description: [description]

Provide:
1. Plain English explanation (2-3 sentences)
2. Why this is dangerous in this specific context
3. Exact fix (code snippet if applicable)
4. Time estimate to fix
```

Privacy: All AI processing happens locally via Ollama by default.
OpenAI is opt-in and requires explicit user consent + API key.

---

*VulnDash — Built by Vincent Roussel & Hexis 🔐*
