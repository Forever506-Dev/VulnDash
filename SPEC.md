# VulnDash — Feature Specification

## MVP Scope (v0.1)

### 1. Project Management
- Add project from local folder (folder picker dialog)
- Add project from GitHub URL (paste URL or browse repos)
- List all projects with last scan date and current score
- Delete project (keeps history)
- Project settings (name, excluded paths, scan frequency)

### 2. Scanning Engine — MVP Tools
| Tool | Language | What it finds |
|---|---|---|
| cargo-audit | Rust | Known CVEs in Cargo.lock |
| npm audit | Node.js | Known CVEs in package-lock.json |
| pip-audit | Python | Known CVEs in requirements.txt |
| gitleaks | All | Hardcoded secrets, API keys, tokens |

### 3. Dashboard
- Security score gauge (0-100, animated)
- Finding counts by severity (Critical/High/Medium/Low/Info)
- Recent scans list
- "Fix these first" — top 3 critical findings highlighted
- Last scan timestamp + rescan button

### 4. Findings View
- Full list of all findings from a scan
- Filterable by: severity, tool, status (open/fixed/ignored)
- Sortable by: severity, CVSS score, file path
- Each finding card shows:
  - Title + severity badge
  - CVE ID + CVSS score (if applicable)
  - Affected file + line number
  - Fix version available (if applicable)
  - "Get AI advice" button

### 5. Scan History
- List of all scans per project
- Score trend chart (line graph over time)
- Compare two scans (what was fixed, what appeared)

---

## v0.2 Features

### GitHub Integration
- OAuth login (GitHub App or Personal Access Token)
- Browse and select repos without cloning
- Auto-detect language/package managers from repo
- Scan without full clone (use GitHub API for dependency files)
- Post scan summary as GitHub PR comment (optional)

### AI Security Coach
- Per-finding AI explanation (plain English, no jargon)
- "Why is this dangerous?" — contextual explanation
- "How do I fix this?" — step-by-step with code snippets
- Priority advisor — "You should fix X before Y because..."
- Uses Ollama locally (llama3 or mistral) by default
- OpenAI opt-in (user provides own API key)

### Secrets Detection Enhancement
- gitleaks integration with custom rules
- Detection of: AWS keys, GitHub tokens, database URLs, private keys, JWT secrets
- Git history scanning (not just current state)
- False positive management (mark as ignored with reason)

---

## v0.3 Features

### Reporting
- PDF report export (professional layout, suitable for clients)
- HTML report export (shareable, self-contained)
- SBOM generation (CycloneDX JSON format)
- Executive summary mode (non-technical language)

### License Compliance
- Detect all licenses in dependencies
- Flag: GPL (viral), AGPL (network-copyleft), unknown licenses
- Custom policy: define which licenses are acceptable
- Report: full license inventory

### Notifications
- Desktop notifications on scan completion
- Webhook support (Slack, Discord, Telegram, custom)
- Email report delivery (SMTP config)
- Scheduled auto-scans (daily/weekly)

---

## v1.0 Features

### CI/CD CLI Mode
```bash
vulndash scan ./my-project --format json --fail-on critical
vulndash scan ./my-project --output report.html
vulndash scan github://owner/repo --token $GITHUB_TOKEN
```
Exit code 0 = pass, 1 = findings found, 2 = error

### Docker & Container Scanning
- Trivy integration for Docker image scanning
- Dockerfile best practice analysis
- docker-compose.yml security review

### Code Pattern Analysis (Semgrep)
- SQL injection detection
- XSS vulnerability patterns
- Hardcoded credentials patterns
- Insecure cryptography usage
- Path traversal vulnerabilities
- Community rules + custom rules

### GitHub PR Integration
- GitHub App for automatic PR scanning
- Block merge on critical findings (configurable)
- Inline PR comments with fix suggestions

---

## UI/UX Specifications

### Theme
- Background: #09090b (near black)
- Surface: rgba(13,13,20,0.78)
- Accent: #e53535 (red — danger/brand)
- Success: #22c55e (green)
- Warning: #f59e0b (amber)
- Text: #e5e5e5

### Severity Colors
- Critical: #ef4444 (red-500)
- High: #f97316 (orange-500)
- Medium: #eab308 (yellow-500)
- Low: #3b82f6 (blue-500)
- Info: #6b7280 (gray-500)

### Key Screens
1. **Home/Dashboard** — Score gauge + recent activity + quick actions
2. **Projects** — Grid/list of all projects with mini score badges
3. **Scan View** — Real-time progress + live findings feed during scan
4. **Findings** — Full findings list with filters and sorting
5. **Finding Detail** — Full detail + AI coach panel
6. **History** — Score timeline + scan comparison
7. **Settings** — GitHub auth, AI config, notification preferences

### Animations
- Score gauge: animated fill on scan completion
- Finding cards: slide in as discovered during live scan
- Severity badges: subtle pulse on critical findings
- Progress bar: smooth increment during scan

---

*VulnDash — Built by Vincent Roussel & Hexis 🔐*
