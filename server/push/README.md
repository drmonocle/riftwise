# riftwise-push

Sends the website's phone/browser alerts (Web Push) for RiftWise on lolworlds.com.

- Runs on HomeServer as the `RiftWisePush-Server` scheduled task (LOCAL SERVICE), listening on `127.0.0.1:8092`.
- IIS forwards `https://lolworlds.com/riftwise/api/push/*` to it (rule in `web/web.config`).
- Data folder `C:\Sites\riftwise-push-data`: `vapid.json` (keys, never commit), `subs.json`, `sent.json`, `locales\`, `logs\push.log`.

Alerts: match live, 15 minutes before a match (followed teams only), and S-tier bangers on the 24/7 stream.
Texts come from the app's locale files: copy `src/i18n/locales/*.json` to `<data>\locales` whenever translations change.

```
go test ./...
go build -o riftwise-push.exe .
riftwise-push.exe serve  -data C:\Sites\riftwise-push-data
riftwise-push.exe stats  -data C:\Sites\riftwise-push-data
riftwise-push.exe sample -kind kickoff -team T1 -data C:\Sites\riftwise-push-data
```
