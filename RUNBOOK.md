# RiftWise runbook

How to put a new version live, take it back, restart things, and where to look when something is wrong.
Everything live runs on HomeServer (`192.168.1.8`, hostname `TV`); its `C:` is `W:` on the main PC.
**Never edit the live files on HomeServer by hand**: every deploy below overwrites them from this repo.

## What runs where

| Piece | Lives in (HomeServer) | Scheduled task | Health |
|---|---|---|---|
| Web app (riftwise.gg) | `C:\inetpub\riftwise.gg` (IIS site `riftwise.gg`, pool `RiftWisePool`) | – | `https://riftwise.gg/` |
| Page service (titles, og cards, sitemaps, feed, calendar) | `C:\Sites\riftwise-pages-data\riftwise-pages.exe`, port 8093 | `RiftWisePages-Server` | `http://127.0.0.1:8093/riftwise/pages/health` |
| Push service (alerts, schedule copy) | `C:\Sites\riftwise-push-data\riftwise-push.exe`, port 8092 | `RiftWisePush-Server` | `https://riftwise.gg/api/push/health` |
| Sync service (accounts, Pick'Em) | `C:\Sites\riftwise-sync-data\riftwise-sync.exe`, port 8094 | `RiftWiseSync-Server` | `https://riftwise.gg/api/sync/health` |
| Stats build (hub.py and friends) | `C:\Scripts\riftwise\*.py`, output `C:\inetpub\wwwroot\riftwise\stats\<build>\` | `RiftWiseStatsBuild` (started by `RiftWiseStatsWatch`) | last line of `build_stats.log` is `exit 0` |
| Player photos | `C:\Scripts\riftwise\photos_lp.py` | `RiftWisePhotos` (04:40) | – |
| Desktop app | GitHub Releases (`drmonocle/riftwise`) | Release workflow on a `v*` tag | – |

Each health check reports `version` (the app version, the same number as `package.json`) and `started`
(when that exe started): a new install that really took over shows the new version and a fresh time.

**Is everything running?** https://riftwise.gg/status (and `/status.json`): stats build age and build lengths, each
service, the last alert sent, head-to-head data age, the data check, the last release. Problems from that page reach
the phone through ntfy (task `RiftWiseStatusWatch`, every 5 minutes, once per problem per 6 hours, and when it clears).

## Release (push-button)

Release day is **Tuesday**; a fix for something broken can go out any day.

1. In the pull request: `npm run set-version -- 0.7.50`. CI runs the app tests, the Go services' tests, the stats
   test build and the main pages in a headless browser (`scripts/audit/smoke.mjs`).
2. Merge, then tag main:
   ```
   git tag v0.7.50
   git push origin v0.7.50
   ```
3. Within 5 minutes the release watcher on HomeServer (`RiftWiseReleaseWatch`, `scripts/server/release_watch.ps1`)
   builds and checks everything from that tag first (web, services, and when the stats scripts changed the test build
   plus a full stats build), then installs web, services and stats scripts, then checks the live site serves the new
   page. If a live step fails it puts everything back and sends a phone notification. New stats scripts then get a
   stats build right away (after one already running; not while a job writes the database, which brings one anyway).
   Watch it on /status ("Last release") or in `C:\Sites\riftwise-release\logs\`.
4. The same tag starts the desktop build (Release workflow): publish its draft on GitHub when it should reach the app.

Roll back to the version before: run `C:\Sites\riftwise-build\scripts\release_watch.ps1 -Rollback` on HomeServer
(through the wrapper). The version rolled back from is skipped until a newer tag comes. `-Version 0.7.49` installs a
given tag. A tag that isn't on main is refused unless `-Force`.

Set up once with `scripts\server\install_watchers.ps1 -NtfyUrl <topic address> -LiveVersion <version live now>`.

## Before any release

```
npm test
npm run test:stats
npm run check:version
```

`npm run test:stats` is the whole stats build on the small test database (`scripts/stats/test`, ~5 seconds). Re-cut
that database with `scripts/stats/test/make_fixture.py` when the build starts reading another table.

## Deploy by hand (when the watcher can't)

### The web app

```
powershell -ExecutionPolicy Bypass -File scripts\deploy_web.ps1
```

Builds `dist-web` and copies it to `W:\inetpub\riftwise.gg`: new bundles first, `index.html` last, old bundles kept a
week so open pages never miss a file. Check `https://riftwise.gg/` afterwards (a hard reload: the service worker
caches the shell).

### The Go services

They are compiled on HomeServer (Go isn't on the main PC). Changes on the server go only through
`C:\Users\TV\.claude\tools\Invoke-HomeServer.ps1 -ScriptPath <file.ps1>`, which takes no arguments, so write a
one-line launcher for it.

1. Stage the source: `powershell -ExecutionPolicy Bypass -File scripts\stage_services.ps1 -Services pages,push`
   (copies `server\<svc>` to `W:\Sites\riftwise-build\<svc>`, the push translations, and `scripts\server\*.ps1`).
2. Build and test there: launcher `& 'C:\Sites\riftwise-build\scripts\build_services.ps1' -Services pages,push`.
   Exit 1 means `go vet`, `go test` or `go build` failed; nothing changed.
3. Install: launcher `& 'C:\Sites\riftwise-build\scripts\install_services.ps1' -Services pages,push`. Each service:
   stop task, keep the old exe as `.prev`, copy the new one, start the task, wait up to 30 s for its health check to
   report the new version. **A service that doesn't come back healthy gets its `.prev` back by itself** (exit 1).

Translations used by push alerts are copied in step 1 and installed in step 3: redo both for `push` whenever
`src/i18n/locales` changes.

### A changed stats build (hub.py)

1. Run `npm run test:stats`, then a full local build (about 8 minutes) and check it ends with `done:`:
   ```
   py -3 -u scripts/stats/build_stats.py --db C:\Users\TV\Tools\riftwatch-hub-dev\catalog_mepi.db --out C:\Users\TV\Tools\riftwatch-hub-dev\out --renames-cache C:\Users\TV\Tools\riftwatch-hub-dev\team_renames.json
   ```
   A compile check alone is not enough (it missed the 2026-10-24 crash).
2. Copy the old one aside on the server (`hub.py.bak-YYYYMMDD` in `C:\Scripts\riftwise`), then copy the changed
   `scripts\stats\*.py` there. Builds start only when the game database changes (or once a day), so start one:
   `Start-ScheduledTask RiftWiseStatsBuild` (not while it's already running). A failed build leaves the previous
   data live.

## Roll back by hand

| What | How |
|---|---|
| Everything (preferred) | `release_watch.ps1 -Rollback` on HomeServer (see Release) |
| Web app | `git checkout <previous tag>` then `scripts\deploy_web.ps1` (old bundles are still on the server for a week) |
| A Go service | launcher `& 'C:\Sites\riftwise-build\scripts\install_services.ps1' -Services <svc> -Rollback` (puts `.prev` back) |
| Stats build code | copy `C:\Scripts\riftwise\hub.py.bak-YYYYMMDD` back over `hub.py` |
| Stats data | `C:\inetpub\wwwroot\riftwise\stats\latest.json` names the build in use; point `version` at the previous build folder |
| Desktop app | mark the previous GitHub release as Latest again |

## Restart

- A service: `Stop-ScheduledTask <task>; Get-Process riftwise-<svc> | Stop-Process -Force; Start-ScheduledTask <task>`
  (each task runs a `run-server.cmd` loop that also restarts the exe within 5 seconds if it exits).
- IIS site: `Restart-WebAppPool RiftWisePool`.
- After any HomeServer reboot the server waits at the sign-in screen; the RiftWise tasks start without a sign-in.

## Numbers (what visitors use)

- **Funnel**: the analytics hub (HomeServer `:8088`) tab "RiftWise funnel": visits, how many go past the first page,
  themes, languages, web vs desktop app, Pick'Em entries, results-feed and calendar readers. Written every 10 minutes
  by `scripts/analytics/funnel.py` (run by the hub's `update_reports.ps1` from the release watcher's checkout).
- The visits come from the app itself (`src/usage.ts` → `/api/push/usage`): once a day per browser, no cookie, no
  id; only the day's totals are kept (`C:\Sites\riftwise-push-data\usage\people\<date>.json`, page views for Most
  viewed in `people\views\`). Only people count: the app sends nothing until the first tap, click, key press or mouse
  move, and the service drops crawler user agents, the renderer-swarm ranges the analytics hub flags (`crawlerNets`
  in `server/push/usage.go`) and repeats from one address in a day. The files directly in `usage\` (v0.7.52–0.7.57)
  were ~99.7 % crawlers and aren't read any more.
- **Discord**: channels that get results, records and the daily card are in `C:\Sites\riftwise-push-data\discord.json`
  (added and removed from the Watchlist tab; a webhook Discord says is gone is dropped by itself).

## Logs

| What | Where (HomeServer) |
|---|---|
| Stats build | `C:\Scripts\riftwise\build_stats.log` (each run ends `exit 0` / `exit 1`) |
| Data check after each build | `C:\Scripts\riftwise\audit_latest.txt` and `.json` |
| Page service | `C:\Sites\riftwise-pages-data\logs\` |
| Push / sync services | `C:\Sites\riftwise-push-data\`, `C:\Sites\riftwise-sync-data\` (`logs\` there) |
| IIS (riftwise.gg) | `C:\inetpub\logs\LogFiles\W3SVC4\u_exYYMMDD_x.log` |
| Every remote change made through the wrapper | `C:\Backups\claude-remote\` (`index.log`, one line per run) |
| Releases | `C:\Sites\riftwise-release\logs\<version>-<time>.log`; `status.json`, `installed.json`, `skip.txt` beside it |
| Phone notifications sent | `C:\Sites\riftwise-release\logs\status_watch.log` |

## Checks (`scripts/audit`, Edge or Chrome found by itself, `BROWSER=<path>` to choose)

The weekly site audit (`.github/workflows/audit.yml`, Wednesdays) runs the first three against the live site.

- Main pages in a browser (script errors, missing files, error messages): `npm run smoke -- https://riftwise.gg`
- Crawl like Bing (4xx and pages without an H1): `node scripts/audit/crawl.mjs https://riftwise.gg 1200 20 4000`
- Titles and headings across the sitemaps: `node scripts/audit/seo_scan.mjs https://riftwise.gg 40`
- Phone layout: `node scripts/audit/mobile_audit.mjs <base> <outdir> 375`
- Wide screens: `node scripts/audit/wide_audit.mjs http://localhost:4174 <outdir> 1920` (`crop.ps1` for tall shots)
- Esports wording in the translations: `node scripts/audit/term_check.mjs src/i18n/locales [lang]` (a list to read, not pass/fail)
