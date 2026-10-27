# install-prerequisites.ps1 — install Node deps + Chromium for this Skill.
# Only installs within this project (local node_modules + user browser cache);
# never touches system-wide config or a running WebSSH2.
param(
  [switch]$SkipBrowser
)

$ErrorActionPreference = 'Stop'
$SkillHome = Join-Path $PSScriptRoot '..'
Set-Location $SkillHome

Write-Host '== Installing prerequisites ==' -ForegroundColor Cyan

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[FAIL] Node.js not found. Install Node 20+ from https://nodejs.org' -ForegroundColor Red
  exit 1
}

Write-Host '[1/2] npm install ...' -ForegroundColor Yellow
& npm install
if ($LASTEXITCODE -ne 0) { Write-Host '[FAIL] npm install failed' -ForegroundColor Red; exit 1 }

if ($SkipBrowser) {
  Write-Host '[SKIP] browser download skipped (--SkipBrowser). Run:  npx playwright install chromium' -ForegroundColor Yellow
} else {
  Write-Host '[2/2] npx playwright install chromium ...' -ForegroundColor Yellow
  & npx playwright install chromium
  if ($LASTEXITCODE -ne 0) { Write-Host '[FAIL] chromium install failed' -ForegroundColor Red; exit 1 }
}

Write-Host '== Prerequisites installed ==' -ForegroundColor Green
exit 0
