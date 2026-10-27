# Runs ON HOMESERVER: vets, tests and compiles each staged service in C:\Sites\riftwise-build\<svc> into
# riftwise-<svc>.new.exe. Installs nothing (install_services.ps1 does). Exit 1 if any step fails.
param([string[]]$Services = @('pages', 'push', 'sync'))
$ErrorActionPreference = 'Continue'
$env:GOCACHE = 'C:\Sites\riftwise-build\gocache'
$env:GOPATH = 'C:\Sites\riftwise-build\gopath'
$env:GOFLAGS = '-mod=mod'
$go = 'C:\Program Files\Go\bin\go.exe'
$failed = $false
foreach ($svc in $Services) {
  Write-Output "==== $svc"
  Push-Location "C:\Sites\riftwise-build\$svc"
  Remove-Item "riftwise-$svc.new.exe" -Force -ErrorAction SilentlyContinue
  foreach ($step in @(@('vet', './...'), @('test', './...'), @('build', '-trimpath', '-o', "riftwise-$svc.new.exe", '.'))) {
    & $go @step 2>&1 | Out-String | Write-Output
    Write-Output "$($step[0]) exit $LASTEXITCODE"
    if ($LASTEXITCODE -ne 0) { $failed = $true; break }
  }
  Pop-Location
}
if ($failed) { exit 1 }
