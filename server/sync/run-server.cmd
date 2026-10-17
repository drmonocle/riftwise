@echo off
rem Keeps riftwise-sync running: restarts it within 5 seconds if it stops (scheduled task RiftWiseSync-Server).
rem Installed on HomeServer as C:\Sites\riftwise-sync-data\run-server.cmd.
:loop
"C:\Sites\riftwise-sync-data\riftwise-sync.exe" serve -data C:\Sites\riftwise-sync-data -addr 127.0.0.1:8094
timeout /t 5 /nobreak >nul
goto loop
