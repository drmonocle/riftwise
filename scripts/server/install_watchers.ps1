# Runs ON HOMESERVER once (through the remote wrapper): sets up the release and status watchers.
#   -NtfyUrl      the ntfy topic address for phone notifications (kept in C:\Sites\riftwise-release\ntfy.txt, not here)
#   -LiveVersion  the version live now, when installed.json doesn't exist yet (the watcher only installs newer tags)
# Both tasks run as SYSTEM every 5 minutes, from C:\Sites\riftwise-build\scripts (each release refreshes that copy).
param([string]$NtfyUrl, [string]$LiveVersion)
$ErrorActionPreference = 'Stop'
$root = 'C:\Sites\riftwise-release'
$bin = 'C:\Sites\riftwise-build\scripts'
New-Item -ItemType Directory -Force "$root\logs", $bin | Out-Null
if ($NtfyUrl) {
  Set-Content "$root\ntfy.txt" $NtfyUrl.Trim() -Encoding ASCII
  # start counting from now: problems only logged before notifications were on don't ping as "cleared" later
  Remove-Item "$root\alerts.json" -ErrorAction SilentlyContinue
}
if (-not (Test-Path "$root\installed.json")) {
  if (-not $LiveVersion) { throw 'no installed.json yet: pass -LiveVersion' }
  [ordered]@{ version = $LiveVersion; commit = ''; at = (Get-Date).ToUniversalTime().ToString('o'); previous = $null } |
    ConvertTo-Json | Set-Content "$root\installed.json" -Encoding UTF8
}

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
foreach ($t in @(
    @{ name = 'RiftWiseReleaseWatch'; file = 'release_watch.ps1'; limit = 2; what = 'Puts a new RiftWise release (a vX.Y.Z tag on main) live, with rollback (scripts/server/release_watch.ps1).' },
    @{ name = 'RiftWiseStatusWatch'; file = 'status_watch.ps1'; limit = 1; what = 'Phone notification (ntfy) for RiftWise problems from riftwise.gg/status.json (scripts/server/status_watch.ps1).' })) {
  if (-not (Test-Path "$bin\$($t.file)")) { throw "$bin\$($t.file) missing: stage the scripts first" }
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$bin\$($t.file)`""
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours $t.limit) -StartWhenAvailable
  Register-ScheduledTask -TaskName $t.name -Description $t.what -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  $info = Get-ScheduledTask -TaskName $t.name
  Write-Output "$($t.name): $($info.State), runs $bin\$($t.file) every 5 minutes as SYSTEM"
}
Write-Output "installed.json: $(Get-Content "$root\installed.json" -Raw)"
Write-Output "ntfy: $(if (Test-Path "$root\ntfy.txt") { 'set' } else { 'not set (problems are only logged)' })"
