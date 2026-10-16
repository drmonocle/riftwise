# Builds the RiftWise web version and publishes it to lolworlds.com/riftwise/.
# Target is the HomeServer's site root through the W: share. Only the riftwise\ folder is touched.
#   powershell -ExecutionPolicy Bypass -File scripts\deploy_web.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = "W:\inetpub\wwwroot\riftwise"

Push-Location $root
npm.cmd run build:web
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Web build failed" }
Pop-Location

New-Item -ItemType Directory -Force -Path $target | Out-Null
# Old hashed bundles are no longer referenced by index.html; clear them so the folder doesn't grow forever.
if (Test-Path "$target\assets") { Remove-Item "$target\assets" -Recurse -Force }
Copy-Item "$root\dist-web\*" $target -Recurse -Force   # includes web\* (sw.js, manifest, icons, web.config)

Write-Host "Deployed to $target. Check https://lolworlds.com/riftwise/"
