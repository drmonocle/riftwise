# Starts the stats build (task RiftWatchStatsBuild) whenever the game database has changed since the last build,
# so new results show up on the stats pages within minutes instead of the next morning.
# Run every 10 minutes by task RiftWatchStatsWatch on HomeServer (installed by hs_stats_watch_install.ps1).
#
# Waits until the database has been quiet for 5 minutes and none of the jobs that write it are running,
# leaves at least 60 minutes between builds, and still builds once a day if nothing changed.
$ErrorActionPreference = "Stop"
$Build = "RiftWatchStatsBuild"
$Writers = "TwitchBotNightlyCatalog", "Claude-LpScheduleRefresh", "Claude-OeDailyRefresh", "Claude-LpWeeklyRefresh"
$Data = "C:\Users\TV\twitch_bot\data"
$Files = "pro_games_catalog.db", "lp_all_games.db"
$Log = "C:\Scripts\riftwatch\stats_watch.log"
$Quiet = [TimeSpan]::FromMinutes(5)
$MinGap = [TimeSpan]::FromMinutes(60)
$Daily = [TimeSpan]::FromHours(22)

function Say($msg) {
    if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 1MB) { Move-Item $Log "$Log.old" -Force }
    Add-Content -Path $Log -Value ("{0:yyyy-MM-dd HH:mm} {1}" -f (Get-Date), $msg)
}

try {
    $task = Get-ScheduledTask -TaskName $Build
    if ($task.State -eq "Running") { exit 0 }
    foreach ($w in $Writers) {
        $t = Get-ScheduledTask -TaskName $w -ErrorAction SilentlyContinue
        if ($t -and $t.State -eq "Running") { exit 0 }
    }
    $changed = [datetime]::MinValue
    foreach ($f in $Files) {
        $p = Join-Path $Data $f
        if (Test-Path "$p-journal") { exit 0 }  # something is writing it right now
        if (Test-Path $p) {
            $m = (Get-Item $p).LastWriteTime
            if ($m -gt $changed) { $changed = $m }
        }
    }
    $now = Get-Date
    $last = ($task | Get-ScheduledTaskInfo).LastRunTime
    if (-not $last -or $last.Year -lt 2000) { $last = [datetime]::MinValue }
    $why = $null
    if ($changed -gt $last -and $now - $changed -ge $Quiet) { $why = "database changed at {0:HH:mm}" -f $changed }
    elseif ($now - $last -ge $Daily) { $why = "daily build" }
    if (-not $why) { exit 0 }
    if ($now - $last -lt $MinGap) { exit 0 }
    Start-ScheduledTask -TaskName $Build
    Say ("started build ($why; last build {0:yyyy-MM-dd HH:mm})" -f $last)
} catch {
    Say "error: $($_.Exception.Message)"
    exit 1
}
