# Contributing to VulnDash

We welcome contributions! Here's how to get started.

## Prerequisites

- Rust 1.70+ (install via https://rustup.rs)
- Node.js 18+ (install via https://nodejs.org)
- Platform deps (see below)

### Windows

Install Visual Studio Build Tools 2022 with C++ workload:

```
winget install Microsoft.VisualStudio.2022.BuildTools
```

### Linux (Ubuntu/Debian)

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### macOS

```bash
xcode-select --install
```

---

## Development Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/Forever506-Dev/VulnDash
   ```
2. Enter the directory:
   ```bash
   cd VulnDash
   ```
3. Install npm dependencies:
   ```bash
   npm install
   ```
4. Start the dev build:
   ```bash
   npm run tauri dev
   ```

---

## Running Tests

```bash
cd src-tauri && cargo test
```

---

## Project Structure

```
VulnDash/
├── src/                  # React frontend (TypeScript)
│   ├── components/       # UI components — one responsibility per component
│   ├── hooks/            # Custom hooks for all Tauri IPC calls
│   └── stores/           # Zustand state management
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── scanner/      # Scanner modules (each implements the Scanner trait)
│   │   ├── db/           # SQLite database access layer (all DB access goes here)
│   │   └── main.rs       # Tauri entry point + command registration
│   └── Cargo.toml
├── scripts/              # One-click setup scripts for Windows/Linux/macOS
└── .github/workflows/    # CI/CD — release builds on tag push
```

---

## Submitting Changes

1. Fork the repo
2. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature
   ```
3. Make your changes
4. Run tests:
   ```bash
   cd src-tauri && cargo test
   ```
5. Push your branch and open a Pull Request against `main`

Please keep PRs focused — one feature or fix per PR makes review much easier.

---

## Code Style

### Rust
- Follow clippy recommendations: `cargo clippy`
- Use `thiserror` for error types
- All Tauri commands return `Result<T, String>`
- Database access only through functions in `src-tauri/src/db/`

### TypeScript
- Follow existing patterns — no `any` types
- Functional components only — no class components
- Custom hooks for all Tauri IPC calls (place in `src/hooks/`)
- Tailwind v4 utility classes — no inline styles

### Components
- One responsibility per component
- Keep components small and focused
- Co-locate styles with components using Tailwind classes

---

## Questions?

Open an issue or start a discussion on GitHub. We're happy to help!
