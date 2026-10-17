@echo off
rem Keeps riftwise-pages running: restarts it within 5 seconds if it stops (scheduled task RiftWisePages-Server).
rem Installed on HomeServer as C:\Sites\riftwise-pages-data\run-server.cmd.
:loop
"C:\Sites\riftwise-pages-data\riftwise-pages.exe" -site C:\inetpub\riftwise.gg -stats C:\inetpub\wwwroot\riftwise\stats -public https://riftwise.gg/ -addr 127.0.0.1:8093 -logs C:\Sites\riftwise-pages-data\logs
timeout /t 5 /nobreak >nul
goto loop
