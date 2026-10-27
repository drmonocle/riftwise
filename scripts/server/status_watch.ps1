# Runs ON HOMESERVER every 5 minutes (scheduled task RiftWiseStatusWatch): reads the page service's status.json
# (server/pages/status.go decides what counts as a problem) and sends a phone notification (ntfy) for each new
# problem, at most once per 6 hours per problem, plus one when it clears. The ntfy topic address is in
# C:\Sites\riftwise-release\ntfy.txt (not in this public repository); without that file it only logs.
$ErrorActionPreference = 'Continue'
$root = 'C:\Sites\riftwise-release'
$stateFile = "$root\alerts.json"
$logFile = "$root\logs\status_watch.log"
New-Item -ItemType Directory -Force "$root\logs" | Out-Null
if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 2MB) { Move-Item $logFile "$logFile.old" -Force }
function Log($text) { Add-Content -Path $logFile -Value "$((Get-Date).ToString('s')) $text" -Encoding UTF8 }

$topic = ''
if (Test-Path "$root\ntfy.txt") { $topic = (Get-Content "$root\ntfy.txt" -Raw).Trim() }
function Notify($title, $text, $priority) {
  if (-not $topic) { Log "(no ntfy.txt) $title - $text"; return }
  try {
    # HTTP headers must be plain ASCII: the details go in the body (UTF-8)
    $ascii = ($title -replace '[^\x20-\x7E]', '-')
    Invoke-RestMethod -Method Post -Uri $topic -Body ([Text.Encoding]::UTF8.GetBytes($text)) -ContentType 'text/plain; charset=utf-8' `
      -Headers @{ Title = $ascii; Priority = "$priority"; Tags = 'riftwise'; Click = 'https://riftwise.gg/status' } -TimeoutSec 15 | Out-Null
    Log "sent: $title - $text"
  } catch { Log "ntfy failed: $($_.Exception.Message)" }
}

# state: problem key -> when it was last alerted (UTC), for the open problems only
$state = @{}
if (Test-Path $stateFile) {
  try { (Get-Content $stateFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $state[$_.Name] = $_.Value } } catch { }
}

$problems = @()
try {
  $status = Invoke-RestMethod -Uri 'http://127.0.0.1:8093/riftwise/status.json' -TimeoutSec 20
  $problems = @($status.problems | Where-Object { $_ -and $_.key })
} catch {
  # the page service itself isn't answering: that's the problem
  $problems = @([pscustomobject]@{ key = 'service-pages'; text = "The page service isn't answering ($($_.Exception.Message))" })
}

$now = [DateTime]::UtcNow
$open = @{}
foreach ($p in $problems) {
  $open[$p.key] = $true
  $last = $null
  if ($state.ContainsKey($p.key)) { $last = [DateTime]::Parse($state[$p.key]).ToUniversalTime() }
  if (-not $last -or ($now - $last).TotalHours -ge 6) {
    $prio = if ($p.key -like 'service-*' -or $p.key -like 'build-failed*' -or $p.key -like 'release-failed*') { 5 } else { 4 }
    Notify "RiftWise: $($p.key)" $p.text $prio
    $state[$p.key] = $now.ToString('o')
  }
}
foreach ($k in @($state.Keys)) {
  if (-not $open.ContainsKey($k)) {
    Notify "RiftWise: $k cleared" "Back to normal: $k" 2
    $state.Remove($k)
  }
}
$state | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8
