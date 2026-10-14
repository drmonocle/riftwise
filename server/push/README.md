# riftwatch-push

Sends the website's phone/browser alerts (Web Push) for RiftWatch on lolworlds.com.

- Runs on HomeServer as the `RiftWatchPush-Server` scheduled task (LOCAL SERVICE), listening on `127.0.0.1:8092`.
- IIS forwards `https://lolworlds.com/riftwatch/api/push/*` to it (rule in `web/web.config`).
- Data folder `C:\Sites\riftwatch-push-data`: `vapid.json` (keys, never commit), `subs.json`, `sent.json`, `locales\`, `logs\push.log`.

Alerts: match live, 15 minutes before a match (followed teams only), and S-tier bangers on the 24/7 stream.
Texts come from the app's locale files: copy `src/i18n/locales/*.json` to `<data>\locales` whenever translations change.

```
go test ./...
go build -o riftwatch-push.exe .
riftwatch-push.exe serve  -data C:\Sites\riftwatch-push-data
riftwatch-push.exe stats  -data C:\Sites\riftwatch-push-data
riftwatch-push.exe sample -kind kickoff -team T1 -data C:\Sites\riftwatch-push-data
```
