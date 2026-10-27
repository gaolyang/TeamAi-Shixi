# run-testcase.ps1 — convenience wrapper around the Node CLI.
# Usage:
#   .\run-testcase.ps1 -Testcase ..\examples\TC_OS_001.json
#   .\run-testcase.ps1 -Id TC_OS_001 -Command "uname -a" -HostName 192.168.63.132 -Username root
param(
  [string]$Testcase = "",
  [string]$Id = "",
  [string]$Command = "",
  [string]$HostName = "",
  [string]$Username = "",
  [switch]$Headful,
  [string]$Output = "evidence"
)

$ErrorActionPreference = 'Stop'
$SkillHome = Join-Path $PSScriptRoot '..'
Set-Location $SkillHome

$nodeArgs = @()

if ($Testcase) {
  $nodeArgs += @('--testcase', (Resolve-Path $Testcase))
} else {
  if ($Id)     { $nodeArgs += @('--id', $Id) }
  if ($Command){ $nodeArgs += @('--command', $Command) }
  if ($HostName){ $nodeArgs += @('--host', $HostName) }
  if ($Username){ $nodeArgs += @('--username', $Username) }
}
if ($Output)   { $nodeArgs += @('--output', $Output) }
if ($Headful)  { $nodeArgs += '--headful' }

& node 'src/index.mjs' @nodeArgs
exit $LASTEXITCODE
