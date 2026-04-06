#!/bin/bash
set -e
echo "VulnDash Setup"

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Installing Linux dependencies..."
    sudo apt-get update
    sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS detected. Ensure Xcode CLI tools are installed."
fi

# Check/install Rust
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# Install npm deps
npm install
echo "Setup complete! Run 'npm run tauri dev' to start."
