# riftwatch-pages

Gives every RiftWatch stats page its own title, description, canonical address and link-preview tags
(Google, Discord, X...), and serves the sitemaps. The page itself is still the normal web app.

- Runs on HomeServer as the `RiftWatchPages-Server` scheduled task (LOCAL SERVICE), on `127.0.0.1:8093`.
- IIS sends `/riftwatch/{player,team,tournament,match,champion}/<slug>`, `/riftwatch/stats[/<section>]` and
  `/riftwatch/sitemap*.xml` to it (rule "RiftWatch Stats Pages" in `web/web.config`).
- Reads the deployed `C:\inetpub\wwwroot\riftwatch\index.html` and the nightly stats build
  (`stats/<version>/hub/seo/*.tsv`, `hub/alias.json`); re-reads both when they change.
- Unknown pages answer 404 (the app shows "not found"); old team names redirect to the current one.
- Standard library only.

```
go test ./...
go build -o riftwatch-pages.exe .
riftwatch-pages.exe -site C:\inetpub\wwwroot\riftwatch -addr 127.0.0.1:8093 -logs C:\Sites\riftwatch-pages-data\logs
```
Health: `http://127.0.0.1:8093/riftwatch/pages/health`.
