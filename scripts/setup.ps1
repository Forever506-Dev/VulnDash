# VulnDash Windows Setup Script
Write-Host "VulnDash Setup" -ForegroundColor Cyan
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Node.js..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS
} else {
    Write-Host "Node.js: OK ($((node --version)))" -ForegroundColor Green
}

# Check Rust
if (!(Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Rust..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri https://win.rustup.rs -OutFile rustup-init.exe
    ./rustup-init.exe -y
    Remove-Item rustup-init.exe
} else {
    Write-Host "Rust: OK ($((rustc --version)))" -ForegroundColor Green
}

Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Setup complete! Run 'npm run tauri dev' to start." -ForegroundColor Green
