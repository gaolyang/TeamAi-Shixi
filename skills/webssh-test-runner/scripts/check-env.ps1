# check-env.ps1 — WebSSH test runner environment gate.
# Run before any real test. Exits non-zero when a required dependency is missing.
param(
  [string]$HostName = "",
  [string]$Username = "",
  [string]$SkillHome = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
Set-Location $SkillHome

Write-Host '== WebSSH Test Runner : Environment Check ==' -ForegroundColor Cyan

# --- Node.js ---
$node = (Get-Command node -ErrorAction SilentlyContinue)
if ($node) {
  $nv = (& node --version) -replace '^v',''
  $major = [int](($nv -split '\.')[0])
  Write-Host "[OK] Node.js $nv" -ForegroundColor Green
  if ($major -lt 20) {
    Write-Host '[FAIL] Node.js >= 20 required' -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host '[FAIL] Node.js not found' -ForegroundColor Red
  exit 1
}

# --- npm ---
if (Get-Command npm -ErrorAction SilentlyContinue) {
  $npmv = (& npm --version)
  Write-Host "[OK] npm $npmv" -ForegroundColor Green
} else {
  Write-Host '[FAIL] npm not found' -ForegroundColor Red
  exit 1
}

# --- project deps (playwright) ---
if (Test-Path (Join-Path $SkillHome 'node_modules\playwright')) {
  Write-Host '[OK] Playwright installed' -ForegroundColor Green
} else {
  Write-Host '[FAIL] Playwright missing. Run:  npm install  then:  npx playwright install chromium' -ForegroundColor Red
  exit 1
}

# --- WebSSH2 service ---
$url = if ($env:WEBSSH2_URL) { $env:WEBSSH2_URL } else { 'http://127.0.0.1:2222/ssh' }
try {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -Headers @{ Accept = 'text/html' }
  Write-Host "[OK] WebSSH2 reachable HTTP $($r.StatusCode) at $url" -ForegroundColor Green
} catch {
  Write-Host "[FAIL] WebSSH2 unavailable at $url - $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host '== Environment gate PASSED ==' -ForegroundColor Cyan
exit 0
