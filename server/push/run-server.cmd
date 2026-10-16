@echo off
rem Keeps riftwise-push running: restarts it within 5 seconds if it stops (scheduled task RiftWisePush-Server).
rem Installed on HomeServer as C:\Sites\riftwise-push-data\run-server.cmd.
:loop
"C:\Sites\riftwise-push-data\riftwise-push.exe" serve -data C:\Sites\riftwise-push-data -addr 127.0.0.1:8092
timeout /t 5 /nobreak >nul
goto loop
