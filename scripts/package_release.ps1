# Builds the release binary and packages it with a SHA-256 checksum.
# Upload BOTH RiftWise.exe and RiftWise.exe.sha256 to the GitHub release:
# the in-app updater refuses to install a binary without a matching checksum.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent  # the repo (this script is in scripts)
$pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = $pkg.version

Write-Host "1. Stopping running RiftWise processes..."
Get-Process -Name "RiftWise*", "riftwise*" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Write-Host "2. Checking versions are in sync..."
node (Join-Path $root "scripts/check-version.mjs")
if ($LASTEXITCODE -ne 0) { Write-Error "Version mismatch"; exit 1 }

Write-Host "3. Building frontend + Tauri binary (release)..."
Push-Location $root
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "Vite build failed!"; exit 1 }
Pop-Location
Push-Location (Join-Path $root "src-tauri")
cargo build --release
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "Cargo build failed!"; exit 1 }
Pop-Location

$srcExe = Join-Path $root "src-tauri\target\release\riftwise-tauri.exe"
if (-not (Test-Path $srcExe)) { Write-Error "Binary not found at $srcExe"; exit 1 }

$releaseDir = Join-Path $root "release"
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
$outExe = Join-Path $releaseDir "RiftWise.exe"
Copy-Item -Path $srcExe -Destination $outExe -Force

Write-Host "4. Writing SHA-256 checksum..."
$hash = (Get-FileHash -LiteralPath $outExe -Algorithm SHA256).Hash.ToLower()
Set-Content -LiteralPath "$outExe.sha256" -Value "$hash  RiftWise.exe" -Encoding ascii

Write-Host "5. Creating release zip..."
Compress-Archive -Path $outExe -DestinationPath (Join-Path $releaseDir "RiftWise-windows-x64.zip") -Force

$sizeMb = [math]::Round(((Get-Item $outExe).Length / 1MB), 2)
Write-Host "Done. RiftWise v$version, $sizeMb MB, sha256 $hash"
Write-Host "Upload from: $releaseDir (RiftWise.exe, RiftWise.exe.sha256, zip)"
