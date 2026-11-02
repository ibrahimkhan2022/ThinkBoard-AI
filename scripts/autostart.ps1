<#
  Starts ThinkBoard AI (scripts\serve.ps1) by itself whenever you sign in to Windows, with no window.
  Adds one file to your Startup folder; no administrator rights, nothing else on the system changes.

    powershell -ExecutionPolicy Bypass -File scripts\autostart.ps1 -Install
    powershell -ExecutionPolicy Bypass -File scripts\autostart.ps1 -Remove
#>
param([switch]$Install, [switch]$Remove)

$root = Split-Path -Parent $PSScriptRoot
$startup = [Environment]::GetFolderPath("Startup")
$file = Join-Path $startup "ThinkBoard AI.vbs"

if ($Install) {
  $serve = Join-Path $root "scripts\serve.ps1"
  # A .vbs runs the script with the window hidden (a plain shortcut would flash a console).
  $line = "CreateObject(""WScript.Shell"").Run ""powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """"$serve"""""", 0, False"
  Set-Content -Path $file -Value $line -Encoding ascii
  Write-Host "Installed: $file"
  Write-Host "ThinkBoard AI now starts when you sign in to Windows."
} elseif ($Remove) {
  if (Test-Path $file) { Remove-Item $file -Force; Write-Host "Removed. It no longer starts at sign-in." } else { Write-Host "It was not installed." }
} else {
  Write-Host "Use -Install or -Remove."
}
