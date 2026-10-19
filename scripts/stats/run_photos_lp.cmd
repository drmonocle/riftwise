@echo off
rem Fetches Leaguepedia photos of pros Riot has no picture of (scheduled task RiftWisePhotos, nightly 04:40).
rem Installed on HomeServer as C:\Scripts\riftwise\run_photos_lp.cmd next to photos_lp.py; records in photos_lp.json there.
echo ==== %DATE% %TIME% >> "C:\Scripts\riftwise\photos_lp.log"
"C:\Users\TV\AppData\Local\Programs\Python\Python313\python.exe" -u "C:\Scripts\riftwise\photos_lp.py" --out "C:\inetpub\wwwroot\riftwise\stats" >> "C:\Scripts\riftwise\photos_lp.log" 2>&1
echo exit %ERRORLEVEL% >> "C:\Scripts\riftwise\photos_lp.log"
