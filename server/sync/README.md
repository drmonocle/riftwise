# riftwise-sync

Optional accounts and cloud sync for RiftWise (followed teams/players/leagues/regions, settings, revealed spoilers).
Ways in: username + password (Argon2id, recovery code instead of email), a sync code (no account details), and
Discord / Twitch sign-in when `oauth.json` has their app ids and secrets. No email, no IP addresses stored.

- HomeServer: source `C:\Sites\riftwise-sync`, data `C:\Sites\riftwise-sync-data` (`accounts\`, `data\`, `sessions.json`,
  `oauth.json`, `logs\sync.log`), scheduled task **RiftWiseSync-Server** (LOCAL SERVICE, at startup) runs
  `run-server.cmd` -> `riftwise-sync.exe serve` on `127.0.0.1:8094`. IIS (`web/web.config`, rule "RiftWise Sync API")
  forwards `/riftwise/api/sync/*`.
- Health: https://riftwise.gg/api/sync/health (also at the old https://lolworlds.com/riftwise/api/sync/health). Counts: `riftwise-sync.exe stats -data C:\Sites\riftwise-sync-data`.
- Build: `go test ./... ; go build -trimpath -o riftwise-sync.exe .` (needs golang.org/x/crypto).
- Discord / Twitch: create an app, set its redirect address to
  `https://lolworlds.com/riftwise/api/sync/auth/discord/callback` (or `/twitch/callback`), then put
  `{"discord": {"clientId": "...", "clientSecret": "..."}, "twitch": {...}}` in `C:\Sites\riftwise-sync-data\oauth.json`
  and restart the task. Never commit that file.
