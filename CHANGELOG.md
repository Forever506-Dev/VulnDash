# Changelog

All notable changes to VulnDash will be documented here.
Format based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

## [0.1.0-beta] - 2026-04-06

### Added
- Multi-language dependency scanning (Rust/cargo-audit, Node.js/npm-audit, Python/pip-audit)
- Secrets detection via gitleaks + regex fallback
- AI-powered fix suggestions via Ollama (local LLM)
- Monaco Editor with vulnerable line highlighting
- Scan history with score trend chart
- Scan diff view (new vs fixed findings)
- GitHub repository integration (add and scan remote repos)
- Auto-fix dependencies button
- HTML report export
- Desktop notifications
- Watch mode (auto-rescan on file change)
- Onboarding screen with tool status detection
- Auto-install missing tools
