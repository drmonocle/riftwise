# Runs ON HOMESERVER every 5 minutes (scheduled task RiftWiseReleaseWatch): puts a new RiftWise release live by itself.
#
# A release is a version tag on main:   npm run set-version -- 0.7.49 (in the PR), merge, then
#                                       git tag v0.7.49 && git push origin v0.7.49
# The watcher sees the new tag (git ls-remote, no account needed), checks it out in C:\Sites\riftwise-release\repo and
# builds everything there BEFORE touching anything live: the web app (npm), the three Go services (vet, test, build)
# and, when the stats build's scripts changed, the 5-second test build plus a full build into a scratch folder (the
# rule for hub.py: a full build must finish before it goes live). Only then: web files (bundles first, index.html
# last), the services one by one (each must answer its health check with the new version), the stats scripts. Last,
# the live site must serve the new page. If anything live fails, everything this run changed is put back.
# Nothing GitHub sends runs here: the code comes from a tag on main, which only the repository's owner can push.
#
#   -Version 0.7.49   install that tag now (even if it isn't the newest)
#   -Rollback         install the version that was live before the current one, the same way; the version rolled
#                     back from is then skipped until a newer tag comes
#   -Force            allow a tag that isn't on main
# For riftwise.gg/status: status.json; the live version: installed.json; skipped versions: skip.txt; a log per run in
# logs\. A failure sends a phone notification (ntfy.txt, see status_watch.ps1). install_watchers.ps1 sets it all up.
param([string]$Version, [switch]$Rollback, [switch]$Force)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = 'C:\Sites\riftwise-release'
$repo = "$root\repo"
$origin = 'https://github.com/drmonocle/riftwise.git'
$git = 'C:\Program Files\Git\cmd\git.exe'
$npm = 'C:\Program Files\nodejs\npm.cmd'
$py = 'C:\Users\TV\AppData\Local\Programs\Python\Python313\python.exe'
$web = 'C:\inetpub\riftwise.gg'
$scripts = 'C:\Scripts\riftwise'
$catalog = 'C:\Users\TV\twitch_bot\data\pro_games_catalog.db'
$build = 'C:\Sites\riftwise-build'
$services = @('pages', 'push', 'sync')
$env:Path = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;$env:Path"
New-Item -ItemType Directory -Force "$root\logs" | Out-Null

# A native program's output and exit code. Windows PowerShell 5.1 turns a program's stderr lines (git, npm and go
# print progress there) into errors that stop the script, so they run with errors allowed and the exit code decides.
function Native([scriptblock]$cmd) {
  $eap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $out = & $cmd 2>&1 | Out-String } finally { $ErrorActionPreference = $eap }
  return @{ out = $out; code = $LASTEXITCODE }
}
function Git {
  $a = $args
  $r = Native { & $git -c safe.directory=* -C $repo @a }
  if ($r.code) { throw "git $($a -join ' ') failed ($($r.code)): $($r.out.Trim())" }
  return $r.out
}
function Read-Json($path) { if (Test-Path $path) { Get-Content $path -Raw | ConvertFrom-Json } else { $null } }
function Save-Json($path, $obj) { $obj | ConvertTo-Json -Depth 5 | Set-Content -Path $path -Encoding UTF8 }

# -- what to install ---------------------------------------------------------------------------------------------
$installed = Read-Json "$root\installed.json"
if (-not $installed) { Write-Output 'no installed.json: run install_watchers.ps1 first'; exit 1 }
$skip = @(Get-Content "$root\skip.txt" -ErrorAction SilentlyContinue | Where-Object { $_ })
if ($Rollback) {
  if (-not $installed.previous) { throw 'no previous version recorded to roll back to' }
  $target = $installed.previous.version
} elseif ($Version) {
  $target = $Version.TrimStart('v')
} else {
  $r = Native { & $git ls-remote --tags --refs $origin 'v*' }
  if ($r.code) { exit 0 } # GitHub unreachable: again in 5 minutes
  $newest = $r.out -split "`n" | ForEach-Object { if ($_ -match 'refs/tags/v(\d+\.\d+\.\d+)\s*$') { [version]$Matches[1] } } |
    Sort-Object -Descending | Select-Object -First 1
  if (-not $newest -or [version]$installed.version -ge $newest -or $skip -contains "$newest") { exit 0 }
  $target = "$newest"
}

# one run at a time (a full stats check takes ~15 minutes)
$lock = "$root\release.lock"
if ((Test-Path $lock) -and ((Get-Date) - (Get-Item $lock).LastWriteTime).TotalHours -lt 2) { Write-Output 'another release run is busy'; exit 0 }
Set-Content $lock $PID

$log = "$root\logs\$target-$(Get-Date -Format yyyyMMdd-HHmmss).log"
function Log($text) { $line = "$((Get-Date).ToString('s')) $text"; Add-Content -Path $log -Value $line -Encoding UTF8; Write-Output $line }
function Status($result, $step, $err = '') {
  Save-Json "$root\status.json" ([ordered]@{ version = $target; result = $result; step = $step; error = $err; at = (Get-Date).ToUniversalTime().ToString('o'); log = $log })
}
function Notify($title, $text) {
  if (-not (Test-Path "$root\ntfy.txt")) { return }
  try {
    Invoke-RestMethod -Method Post -Uri (Get-Content "$root\ntfy.txt" -Raw).Trim() -Body ([Text.Encoding]::UTF8.GetBytes($text)) `
      -ContentType 'text/plain; charset=utf-8' -Headers @{ Title = $title; Priority = '5'; Tags = 'riftwise'; Click = 'https://riftwise.gg/status' } -TimeoutSec 15 | Out-Null
  } catch { Log "ntfy failed: $($_.Exception.Message)" }
}
# a step that runs programs: its output goes to the log, a non-zero exit fails the release
function Run($what, [scriptblock]$cmd) {
  Log "-- $what"
  $r = Native $cmd
  Add-Content -Path $log -Value $r.out -Encoding UTF8
  if ($r.code) { throw "$what failed (exit $($r.code))" }
  return $r.out
}

$live = @{ web = $false; services = @(); stats = '' }
$step = 'prepare'
try {
  Log "release $target (live now: $($installed.version))"
  Status 'installing' $step

  # -- build and check everything; nothing live changes yet ----------------------------------------------------
  # main only (not the automated h2h-data branch); the tags come with the fetch
  if (-not (Test-Path "$repo\.git")) { Run 'clone' { & $git clone --quiet --no-checkout --single-branch --branch main $origin $repo } | Out-Null }
  Git fetch --quiet --tags --force origin | Out-Null
  Git checkout --quiet --force "v$target" | Out-Null
  Git clean -fdxq -e node_modules -e scripts/stats/ddragon_cache | Out-Null
  $commit = (Git rev-parse HEAD).Trim()
  if (-not $Force -and -not $Rollback) {
    $r = Native { & $git -c safe.directory=* -C $repo merge-base --is-ancestor $commit origin/main }
    if ($r.code) { throw "tag v$target is not on main (-Force installs it anyway)" }
  }
  $step = 'version'
  $v = Run 'version check' { node "$repo\scripts\check-version.mjs" }
  if ($v -notmatch [regex]::Escape("Versions in sync: $target")) { throw "the code at v$target says: $($v.Trim())" }

  $step = 'web build'
  $lockHash = (Get-FileHash "$repo\package-lock.json").Hash
  if (-not (Test-Path "$repo\node_modules") -or (Get-Content "$root\npm.lock.sha" -ErrorAction SilentlyContinue) -ne $lockHash) {
    Run 'npm ci' { Push-Location $repo; try { & $npm ci --no-audit --no-fund } finally { Pop-Location } } | Out-Null
    Set-Content "$root\npm.lock.sha" $lockHash
  }
  Run 'web build' { Push-Location $repo; try { & $npm run build:web } finally { Pop-Location } } | Out-Null
  $bundle = [regex]::Match((Get-Content "$repo\dist-web\index.html" -Raw), 'assets/index-[\w-]+\.js').Value
  if (-not $bundle) { throw 'the web build has no assets/index-*.js' }

  $step = 'services build'
  foreach ($svc in $services) {
    New-Item -ItemType Directory -Force "$build\$svc" | Out-Null
    Get-ChildItem "$repo\server\$svc" -File | Where-Object { $_.Extension -in '.go', '.mod', '.sum', '.json', '.md', '.cmd', '.ps1' } |
      Copy-Item -Destination "$build\$svc" -Force
  }
  New-Item -ItemType Directory -Force "$build\push\locales", "$build\scripts" | Out-Null
  Copy-Item "$repo\src\i18n\locales\*.json" "$build\push\locales" -Force
  Copy-Item "$repo\scripts\server\*.ps1" "$build\scripts" -Force
  Run 'go vet, test, build' { & "$build\scripts\build_services.ps1" -Services $services } | Out-Null

  $step = 'stats check'
  $changed = @(Get-ChildItem "$repo\scripts\stats\*.py" | Where-Object {
      -not (Test-Path "$scripts\$($_.Name)") -or (Get-FileHash $_.FullName).Hash -ne (Get-FileHash "$scripts\$($_.Name)").Hash })
  if ($changed.Count) {
    Log "stats scripts changed: $(($changed | ForEach-Object Name) -join ', ')"
    Run 'stats test build' { & $py -u "$repo\scripts\stats\test\test_build.py" } | Out-Null
    $check = "$root\statscheck"
    if (Test-Path $check) { Remove-Item $check -Recurse -Force }
    Log '-- full stats build into a scratch folder (below-normal priority)'
    $p = Start-Process -FilePath $py -PassThru -NoNewWindow -RedirectStandardOutput "$root\statscheck.out.txt" -RedirectStandardError "$root\statscheck.err.txt" `
      -ArgumentList @('-u', "`"$repo\scripts\stats\build_stats.py`"", '--db', "`"$catalog`"", '--out', "`"$check`"", '--renames-cache', "`"$scripts\team_renames.json`"")
    $null = $p.Handle # (so ExitCode is kept)
    try { $p.PriorityClass = 'BelowNormal' } catch { }
    $p.WaitForExit()
    $tail = (Get-Content "$root\statscheck.out.txt" -Tail 3) -join ' | '
    Log "full stats build: exit $($p.ExitCode): $tail"
    Remove-Item $check -Recurse -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0 -or $tail -notmatch 'done: ') { throw "the full stats build didn't finish (exit $($p.ExitCode)); see $root\statscheck.err.txt" }
  }

  # -- live: from here every change is undone if a step fails --------------------------------------------------
  $step = 'web'
  $backup = "$root\web-backup"
  if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
  New-Item -ItemType Directory -Force $backup | Out-Null
  Get-ChildItem $web -File | Copy-Item -Destination $backup -Force
  $live.web = $true
  # new bundles next to the old ones, index.html last (as scripts\deploy_web.ps1): open pages never miss a file
  Copy-Item "$repo\dist-web\*" $web -Recurse -Force -Exclude 'index.html'
  Copy-Item "$repo\dist-web\index.html" $web -Force
  Log "web files copied ($bundle)"

  $step = 'services'
  foreach ($svc in $services) {
    $live.services += $svc
    Run "install $svc" { & "$build\scripts\install_services.ps1" -Services $svc } | Out-Null
  }

  if ($changed.Count) {
    $step = 'stats scripts'
    $bak = "$scripts\bak-$($installed.version)"
    New-Item -ItemType Directory -Force $bak | Out-Null
    Get-ChildItem "$scripts\*.py" | Copy-Item -Destination $bak -Force
    $live.stats = $bak
    Copy-Item "$repo\scripts\stats\*.py" $scripts -Force
    Log "stats scripts installed (the old ones are in $bak)"
  }

  $step = 'live check'
  Start-Sleep -Seconds 35 # the page service re-reads index.html every 30 seconds
  foreach ($path in @("/?release=$target", "/stats?release=$target")) {
    $page = (Invoke-WebRequest -UseBasicParsing -Uri "https://riftwise.gg$path" -TimeoutSec 30).Content
    if ($page -notmatch [regex]::Escape($bundle)) { throw "https://riftwise.gg$path doesn't serve the new app ($bundle)" }
  }
  Log 'live check passed'

  # bundles no current page uses: gone after a week (only now: a rollback above needed the old ones)
  $keep = @{}
  Get-ChildItem "$repo\dist-web\assets" -File | ForEach-Object { $keep[$_.Name] = $true }
  Get-ChildItem "$web\assets" -File | Where-Object { -not $keep[$_.Name] -and $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Force

  $prev = if ($installed.version -ne $target) { [ordered]@{ version = $installed.version; commit = $installed.commit } } else { $installed.previous }
  Save-Json "$root\installed.json" ([ordered]@{ version = $target; commit = $commit; at = (Get-Date).ToUniversalTime().ToString('o'); previous = $prev })
  if ($Rollback) { Add-Content "$root\skip.txt" $installed.version } # don't put the version just rolled back from live again
  Status 'installed' 'done'
  Log "v$target is live"
} catch {
  $err = $_.Exception.Message
  Log "FAILED at '$step': $err"
  try {
    if ($live.stats) { Copy-Item "$($live.stats)\*.py" $scripts -Force; Log 'stats scripts restored' }
    if ($live.services.Count) {
      (Native { & "$build\scripts\install_services.ps1" -Services $live.services -Rollback }).out | Add-Content -Path $log -Encoding UTF8
      Log "services rolled back: $($live.services -join ', ')"
    }
    if ($live.web) { Copy-Item "$root\web-backup\*" $web -Force; Log 'web files restored' }
  } catch { Log "ROLLBACK PROBLEM: $($_.Exception.Message)"; $err += " (and the rollback hit: $($_.Exception.Message))" }
  $was = if ($live.web) { "rolled back to $($installed.version)" } else { "nothing live was changed; $($installed.version) stays" }
  Status 'failed' $step "$err; $was"
  Notify "RiftWise release $target failed" "At '$step': $err. $was. Log: $log"
  if (-not $Version -and -not $Rollback) { Add-Content "$root\skip.txt" $target } # not retried every 5 minutes
  exit 1
} finally {
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
