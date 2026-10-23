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
# New hashed bundles go in next to the old ones, and index.html last, so a page that is loading or already open
# (it asks for its parts later, as they are shown) never asks for a file that is gone. Deleting the old bundles
# first made those pages fail and reload during every deploy.
Copy-Item "$root\dist-web\*" $target -Recurse -Force -Exclude "index.html"   # includes web\* (sw.js, manifest, icons, web.config)
Copy-Item "$root\dist-web\index.html" $target -Force
# Old bundles no current page uses: gone after a week, so the folder doesn't grow forever.
$keep = @{}
Get-ChildItem "$root\dist-web\assets" -File | ForEach-Object { $keep[$_.Name] = $true }
Get-ChildItem "$target\assets" -File | Where-Object { -not $keep[$_.Name] -and $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Force

Write-Host "Deployed to $target. Check https://riftwise.gg/"
