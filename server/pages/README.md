# riftwise-pages

Gives every RiftWise stats page its own title, description, canonical address and link-preview tags
(Google, Discord, X...), and serves the sitemaps. The page itself is still the normal web app.

- Runs on HomeServer as the `RiftWisePages-Server` scheduled task (LOCAL SERVICE), on `127.0.0.1:8093`.
- IIS sends `/riftwise/{player,team,tournament,match,champion,league}/<slug>`, `/riftwise/stats[/<section>]` and
  `/riftwise/sitemap*.xml` to it (rule "RiftWise Stats Pages" in `web/web.config`).
- Reads the deployed `C:\inetpub\riftwise.gg\index.html` and the stats build (`C:\inetpub\wwwroot\riftwise\stats`)
  (`stats/<version>/hub/seo/*.tsv`, `hub/alias.json`); re-reads both when they change.
- Unknown pages answer 404 (the app shows "not found"); old team names redirect to the current one.
- Standard library only.

```
go test ./...
go build -o riftwise-pages.exe .
riftwise-pages.exe -site C:\inetpub\riftwise.gg -stats C:\inetpub\wwwroot\riftwise\stats -public https://riftwise.gg/ -addr 127.0.0.1:8093 -logs C:\Sites\riftwise-pages-data\logs
```
Health: `http://127.0.0.1:8093/riftwise/pages/health`.
