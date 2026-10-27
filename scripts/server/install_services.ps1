# Runs ON HOMESERVER: installs the services build_services.ps1 compiled. For each one: stop its task, keep the running
# exe as .prev, copy the new one in, start the task and wait for its health check to answer with the new version.
# A service that doesn't come back healthy within 30 seconds gets its .prev back (and the run exits 1).
#   -Rollback: put each service's .prev back without installing anything.
param([string[]]$Services = @('pages', 'push', 'sync'), [switch]$Rollback)
$ErrorActionPreference = 'Continue'
$info = @{
  pages = @{ task = 'RiftWisePages-Server'; health = 'http://127.0.0.1:8093/riftwise/pages/health' }
  push  = @{ task = 'RiftWisePush-Server'; health = 'http://127.0.0.1:8092/riftwise/api/push/health' }
  sync  = @{ task = 'RiftWiseSync-Server'; health = 'http://127.0.0.1:8094/riftwise/api/sync/health' }
}

function Stop-Svc($svc) {
  Stop-ScheduledTask -TaskName $info[$svc].task -ErrorAction SilentlyContinue
  foreach ($i in 1..3) {
    Get-Process -Name "riftwise-$svc" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
}

# the health answer once it comes ($null after 30 s); with $want, only one that reports that version
function Wait-Healthy($svc, $want) {
  foreach ($i in 1..15) {
    Start-Sleep -Seconds 2
    try {
      $h = Invoke-RestMethod -Uri $info[$svc].health -TimeoutSec 5
      if (-not $want -or $h.version -eq $want) { return $h }
    } catch { }
  }
  return $null
}

$failed = $false
foreach ($svc in $Services) {
  $build = "C:\Sites\riftwise-build\$svc"
  $data = "C:\Sites\riftwise-$svc-data"
  $exe = "$data\riftwise-$svc.exe"
  Write-Output "==== $svc"
  if ($Rollback) {
    if (-not (Test-Path "$exe.prev")) { Write-Output "no $exe.prev, nothing to roll back"; $failed = $true; continue }
    Stop-Svc $svc
    Copy-Item "$exe.prev" $exe -Force
    Start-ScheduledTask -TaskName $info[$svc].task
    $h = Wait-Healthy $svc $null
    Write-Output "rolled back: $(if ($h) { "healthy, version $($h.version)" } else { 'NOT answering' })"
    continue
  }
  $new = "$build\riftwise-$svc.new.exe"
  if (-not (Test-Path $new)) { Write-Output "no $new (run build_services.ps1 first), skipped"; $failed = $true; continue }
  $want = (Select-String -Path "$build\main.go" -Pattern '^\s*(?:const\s+)?version\s*=\s*"([^"]+)"' | Select-Object -First 1).Matches.Groups[1].Value
  # the server's source copy = what runs
  New-Item -ItemType Directory -Force "C:\Sites\riftwise-$svc" | Out-Null
  Get-ChildItem $build -File | Where-Object { $_.Extension -in '.go', '.mod', '.sum', '.json', '.md', '.cmd' } | Copy-Item -Destination "C:\Sites\riftwise-$svc" -Force
  if ($svc -eq 'push' -and (Test-Path "$build\locales")) { Copy-Item "$build\locales\*.json" "$data\locales" -Force }
  Stop-Svc $svc
  if (Test-Path $exe) { Copy-Item $exe "$exe.prev" -Force }
  Copy-Item $new $exe -Force
  Start-ScheduledTask -TaskName $info[$svc].task
  $h = Wait-Healthy $svc $want
  if ($h) {
    Write-Output "installed: version $($h.version), started $($h.started), ok=$($h.ok)"
    continue
  }
  Write-Output "NOT healthy with version $want after 30 s: putting the previous exe back"
  $failed = $true
  Stop-Svc $svc
  Copy-Item "$exe.prev" $exe -Force
  Start-ScheduledTask -TaskName $info[$svc].task
  $h = Wait-Healthy $svc $null
  Write-Output "rolled back: $(if ($h) { "healthy, version $($h.version)" } else { 'NOT answering' })"
}
if ($failed) { exit 1 }
