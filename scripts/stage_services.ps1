# Copies the Go services' source (and the push alerts' translations) from this repo to HomeServer's build folder
# C:\Sites\riftwise-build\<svc> through the W: share, plus the server-side scripts in scripts\server. Nothing runs
# or changes on the server; build_services.ps1 and install_services.ps1 do that there (RUNBOOK.md).
#   powershell -ExecutionPolicy Bypass -File scripts\stage_services.ps1 [-Services pages,push,sync]
param([string[]]$Services = @('pages', 'push', 'sync'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$build = 'W:\Sites\riftwise-build'

foreach ($svc in $Services) {
  $to = "$build\$svc"
  New-Item -ItemType Directory -Force $to | Out-Null
  Get-ChildItem "$root\server\$svc" -File | Where-Object { $_.Extension -in '.go', '.mod', '.sum', '.json', '.md', '.cmd', '.ps1' } |
    Copy-Item -Destination $to -Force
  if ($svc -eq 'push') {
    # the alerts are sent in each subscriber's language, from the app's own translations
    New-Item -ItemType Directory -Force "$to\locales" | Out-Null
    Copy-Item "$root\src\i18n\locales\*.json" "$to\locales" -Force
  }
  Write-Host "staged $svc -> $to"
}
New-Item -ItemType Directory -Force "$build\scripts" | Out-Null
Copy-Item "$root\scripts\server\*.ps1" "$build\scripts" -Force
Write-Host "staged scripts -> $build\scripts"
