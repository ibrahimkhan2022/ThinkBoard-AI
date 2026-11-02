<#
  Starts ThinkBoard AI so other devices (an iPad) can use it without anyone touching this computer:
  Ollama (the free local AI) and the app server, both in the background with no windows.
  The server also serves the built web app, so one address is the whole product.

    powershell -ExecutionPolicy Bypass -File scripts\serve.ps1            # start (builds the web app the first time)
    powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 -Rebuild   # rebuild the web app first (after code changes)

  Stop with scripts\stop.ps1. Start automatically at login with scripts\autostart.ps1 -Install.
  This computer must be on, awake and on the same Wi-Fi as the device.
#>
param(
  [switch]$Rebuild,
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$run = Join-Path $root "server\data"
New-Item -ItemType Directory -Force $run | Out-Null
$pidFile = Join-Path $run "serve.pids.json"

function Test-Url($url) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $url | Out-Null; return $true } catch { return $false }
}

# The address other devices use: the IPv4 address of the adapter that has the default route (not the VMware ones).
function Get-LanAddress {
  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
  if ($route) {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "169.*" } | Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
  }
  return "localhost"
}

if (Test-Url "http://127.0.0.1:$Port/api/health") {
  Write-Host "Already running: http://$(Get-LanAddress):$Port"
  exit 0
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
  throw "Port $Port is in use by something else (a dev server in a terminal?). Stop it first, or use -Port."
}

$started = @{}

# 1. Ollama. Left on this computer only (127.0.0.1): the app server is the one that talks to it.
if (-not (Test-Url "http://127.0.0.1:11434/api/tags")) {
  $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
  if (-not $ollama) { $ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe" }
  if (-not (Test-Path $ollama)) { throw "Ollama is not installed. Get it from https://ollama.com/download" }
  $p = Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden -PassThru
  $started.ollama = $p.Id
  for ($i = 0; $i -lt 30 -and -not (Test-Url "http://127.0.0.1:11434/api/tags"); $i++) { Start-Sleep -Seconds 1 }
  if (-not (Test-Url "http://127.0.0.1:11434/api/tags")) { throw "Ollama did not start." }
}

# 2. The web app, built once (and again with -Rebuild).
if ($Rebuild -or -not (Test-Path (Join-Path $root "client\dist\index.html"))) {
  Write-Host "Building the web app..."
  Push-Location $root
  try { npm run build:web -w client | Out-Host; if ($LASTEXITCODE -ne 0) { throw "Build failed." } } finally { Pop-Location }
}

# 3. The server: reachable on the Wi-Fi (0.0.0.0), serving the built app. Settings still come from .env.
$env:HOST = "0.0.0.0"
$env:PORT = "$Port"
$env:SERVE_WEB = "true"
$node = (Get-Command node).Source
$tsx = Join-Path $root "node_modules\tsx\dist\cli.mjs"
$log = Join-Path $run "server.log"
$srv = Start-Process -FilePath $node -ArgumentList @("`"$tsx`"", "src/index.ts") -WorkingDirectory (Join-Path $root "server") -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError (Join-Path $run "server.err.log")
$started.server = $srv.Id
for ($i = 0; $i -lt 30 -and -not (Test-Url "http://127.0.0.1:$Port/api/health"); $i++) { Start-Sleep -Seconds 1 }
if (-not (Test-Url "http://127.0.0.1:$Port/api/health")) { throw "The server did not start. See $run\server.err.log" }

$started | ConvertTo-Json | Set-Content -Encoding ascii $pidFile
$address = Get-LanAddress
Write-Host ""
Write-Host "Running. Open on any device on this Wi-Fi:  http://${address}:$Port"
