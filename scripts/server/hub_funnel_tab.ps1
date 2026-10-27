# Runs ON HOMESERVER once, after the release that brings scriptsnalyticsunnel.py (through the remote wrapper).
# Analytics hub (C:\goaccess): a "RiftWise funnel" tab. The report (www\reports\riftwise-funnel.html) is written by the
# RiftWise repository's scripts\analytics\funnel.py, which the hub's update_reports.ps1 now runs every 10 minutes from
# the release watcher's checkout. Both hub files are backed up first (.bak-<time>); both are UTF-8 without BOM, LF.
$ErrorActionPreference = 'Stop'
$hub = 'C:\goaccess'
$stamp = Get-Date -Format yyyyMMddHHmm
$utf8 = New-Object Text.UTF8Encoding $false
$py = 'C:\Users\TV\AppData\Local\Programs\Python\Python313\python.exe'
$funnel = 'C:\Sites\riftwise-release\repo\scripts\analytics\funnel.py'
if (-not (Test-Path $funnel)) { throw "$funnel not there yet (release first)" }

Copy-Item "$hub\www\index.html" "$hub\www\index.html.bak-$stamp"
Copy-Item "$hub\update_reports.ps1" "$hub\update_reports.ps1.bak-$stamp"

# 1. the tab, after the riftwise.gg one; the "Open site" link of both RiftWise tabs goes to riftwise.gg
$i = [IO.File]::ReadAllText("$hub\www\index.html", $utf8)
if ($i -notmatch 'riftwise-funnel') {
  $at = $i.IndexOf('id="badgeRiftwise"')
  $end = $i.IndexOf('</button>', $at) + '</button>'.Length
  if ($at -lt 0 -or $end -lt $at) { throw 'riftwise tab not found' }
  $chart = [char]::ConvertFromUtf32(0x1F4C8)
  $tab = "`n            <button class=`"tab-btn`" data-report=`"riftwise-funnel`" onclick=`"switchTab('riftwise-funnel')`">`n                <span>$chart RiftWise funnel</span>`n            </button>"
  $i = $i.Insert($end, $tab)
  $old = "if (currentTab === 'riftwise') {"
  if (([regex]::Matches($i, [regex]::Escape($old))).Count -ne 1) { throw 'site-link line not found once' }
  $i = $i.Replace($old, "if (currentTab.startsWith('riftwise')) {")
  [IO.File]::WriteAllText("$hub\www\index.html", $i, $utf8)
  Write-Output 'index.html: funnel tab added'
}

# 2. update_reports.ps1 runs the funnel report after the RiftWise stats
$u = [IO.File]::ReadAllText("$hub\update_reports.ps1", $utf8)
if ($u -notmatch 'funnel\.py') {
  $anchor = '# 2. Only regenerate raw GoAccess log dumps'
  if ($u.IndexOf($anchor) -lt 0) { throw 'update_reports.ps1 anchor not found' }
  $block = @"
# RiftWise funnel (the RiftWise repo's scripts\analytics\funnel.py, in the release watcher's checkout): visits past
# the first page, themes and languages, Pick'Em entries, feed and calendar readers -> reports\riftwise-funnel.html
`$funnel = '$funnel'
if (Test-Path `$funnel) {
    try { & '$py' `$funnel --out `$outDir 2>&1 | Out-Null } catch { Write-Warning "funnel.py error: `$_" }
}

"@
  $u = $u.Replace($anchor, ($block -replace "`r`n", "`n") + $anchor)
  [IO.File]::WriteAllText("$hub\update_reports.ps1", $u, $utf8)
  Write-Output 'update_reports.ps1: funnel step added'
}

# 3. the first report now
& $py $funnel --out "$hub\www\reports" 2>&1 | Out-String | Write-Output
Get-Item "$hub\www\reports\riftwise-funnel.html" | Select-Object Length, LastWriteTime | Format-List | Out-String | Write-Output
