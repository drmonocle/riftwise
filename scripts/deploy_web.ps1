# Builds the RiftWise web version and publishes it to riftwise.gg: the IIS site "riftwise.gg" on HomeServer
# (C:\inetpub\riftwise.gg) through the W: share. Its stats folder is a virtual folder and isn't touched.
# lolworlds.com/riftwise isn't deployed any more: it forwards every page to riftwise.gg (server/iis/).
#   powershell -ExecutionPolicy Bypass -File scripts\deploy_web.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = "W:\inetpub\riftwise.gg"

Push-Location $root
npm.cmd run build:web
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Web build failed" }
Pop-Location

New-Item -ItemType Directory -Force -Path $target | Out-Null
# Old hashed bundles are no longer referenced by index.html; clear them so the folder doesn't grow forever.
if (Test-Path "$target\assets") { Remove-Item "$target\assets" -Recurse -Force }
Copy-Item "$root\dist-web\*" $target -Recurse -Force   # includes web\* (sw.js, manifest, icons, web.config)

Write-Host "Deployed to $target. Check https://riftwise.gg/"
