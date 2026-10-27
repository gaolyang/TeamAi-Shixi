# start-webssh2.ps1 — start WebSSH2 in the background (if not already running).
# Reuses an existing instance; never restarts a running service.
param(
  [string]$Url = 'http://127.0.0.1:2222/ssh',
  [string]$SkillHome = ''
)

$ErrorActionPreference = 'Stop'

# If a valid home was not given, auto-detect common locations.
if ([string]::IsNullOrWhiteSpace($SkillHome)) {
  foreach ($cand in @('D:\DSH对话\webssh2', 'C:\webssh\webssh2')) {
    if (Test-Path (Join-Path $cand 'package.json')) { $SkillHome = $cand; break }
  }
}

$port = 2222
try { $port = ([uri]$Url).Port } catch { $port = 2222 }

# Already running? Reuse it.
$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host "[INFO] WebSSH2 already listening on port $port - reusing. $Url" -ForegroundColor Green
  exit 0
}

if ([string]::IsNullOrWhiteSpace($SkillHome) -or !(Test-Path (Join-Path $SkillHome 'package.json'))) {
  Write-Host "[FAIL] WebSSH2 home not found. Set WEBSSH2_HOME or HOME param." -ForegroundColor Red
  exit 1
}

Write-Host "[INFO] Starting WebSSH2 from $SkillHome on port $port..." -ForegroundColor Yellow
$log = Join-Path (Join-Path $PSScriptRoot '..') 'evidence\webssh2-start.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

$env:WEBSSH2_LISTEN_PORT = "$port"
Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $SkillHome `
  -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $log

# Wait for service to be ready.
$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 500
  $ok = try { (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
} while (-not $ok -and (Get-Date) -lt $deadline)

if (-not $ok) {
  Write-Host "[FAIL] WebSSH2 did not become ready. Log: $log" -ForegroundColor Red
  exit 1
}
Write-Host "[OK] WebSSH2 up: $Url" -ForegroundColor Green
exit 0
