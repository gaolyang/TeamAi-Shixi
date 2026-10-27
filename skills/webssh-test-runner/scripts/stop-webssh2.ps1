# stop-webssh2.ps1 — stop ONLY a WebSSH2 instance started by THIS Skill.
# The Skill passes the pid it recorded when it started the service. It will
# never terminate a service the user or another process started.
param(
  [int]$Pid = 0
)

if ($Pid -le 0) {
  Write-Host '[INFO] No pid given - nothing to stop. WebSSH2 left running.' -ForegroundColor Yellow
  exit 0
}

# Only stop if this process was started by us (marker recorded in state file).
$stateFile = Join-Path $PSScriptRoot '..\.webssh2-owned-pids'
if (Test-Path $stateFile) {
  $owned = Get-Content $stateFile | ForEach-Object { [int]$_ }
  if ($owned -contains $Pid) {
    Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue
    Write-Host "[INFO] Stopped owned WebSSH2 pid $Pid" -ForegroundColor Green
    exit 0
  }
}

Write-Host "[INFO] pid $Pid is not owned by this Skill - left running." -ForegroundColor Yellow
exit 0
