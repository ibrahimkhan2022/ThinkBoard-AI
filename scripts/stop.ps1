<#
  Stops what scripts\serve.ps1 started (the app server, and Ollama if serve.ps1 was the one to start it).
  An Ollama that was already running before is left alone, and so is anything you started yourself.
#>
$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root "server\data\serve.pids.json"
if (-not (Test-Path $pidFile)) { Write-Host "Nothing was started by serve.ps1."; exit 0 }

$started = Get-Content $pidFile -Raw | ConvertFrom-Json
foreach ($name in "server", "ollama") {
  $id = $started.$name
  if ($id) {
    # taskkill /T also ends the processes the server or Ollama started (the model runner).
    taskkill /PID $id /T /F | Out-Null
    Write-Host "Stopped $name."
  }
}
Remove-Item $pidFile -Force
