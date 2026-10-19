@echo off
rem Builds the RiftWise stats (scheduled task RiftWiseStatsBuild, started by RiftWiseStatsWatch when the game database changes).
rem Installed on HomeServer as C:\Scripts\riftwise\run_build_stats.cmd next to build_stats.py, hub.py, ratings.py and leagues_info.py.
echo ==== %DATE% %TIME% >> "C:\Scripts\riftwise\build_stats.log"
"C:\Users\TV\AppData\Local\Programs\Python\Python313\python.exe" -u "C:\Scripts\riftwise\build_stats.py" --db "C:\Users\TV\twitch_bot\data\pro_games_catalog.db" --out "C:\inetpub\wwwroot\riftwise\stats" >> "C:\Scripts\riftwise\build_stats.log" 2>&1
set RC=%ERRORLEVEL%
echo exit %RC% >> "C:\Scripts\riftwise\build_stats.log"
rem After a good build: the read-only data check (audit_data.py, about a minute), its report next to the log.
if "%RC%"=="0" "C:\Users\TV\AppData\Local\Programs\Python\Python313\python.exe" -u "C:\Scripts\riftwise\audit_data.py" "C:\inetpub\wwwroot\riftwise\stats" --json "C:\Scripts\riftwise\audit_latest.json" > "C:\Scripts\riftwise\audit_latest.txt" 2>&1
exit /b %RC%
