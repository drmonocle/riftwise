// RiftWise web (riftwise.gg): service worker for the whole site. It passes every request straight
// to the network and only steps in when the page itself can't be loaded (offline), and it is
// what lets browsers offer "Add to Home Screen".
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>RiftWise</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#091428;color:#f0e6d2;
font:15px/1.5 system-ui,sans-serif;text-align:center;padding:24px}h1{color:#c8aa6e;font-size:22px;margin:0 0 8px}
p{color:#9bb3c9;margin:0 0 20px}.b{background:#c8aa6e;color:#091428;border:0;border-radius:8px;
padding:10px 18px;font-weight:700;font-size:14px;text-decoration:none;display:inline-block}</style></head><body><div><h1>RiftWise is offline</h1>
<p>Live scores need a connection. Try again once you're back online.</p>
<a class="b" href="">Retry</a></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// ---- Alerts (Web Push from riftwise-push on HomeServer) ----
// The payload is {title, body, url, tag}, already in the reader's language.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "RiftWise", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "RiftWise", {
      body: data.body || "",
      icon: "/icon-192.png?v=2",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    }),
  );
});

// Tapping an alert opens RiftWise (an open tab is reused) at the match it is about.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = tabs.find((c) => c.url.startsWith(self.location.origin + "/"));
      if (tab) {
        await tab.focus();
        try {
          await tab.navigate(url);
        } catch {
          /* focusing is enough if navigation isn't allowed */
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser replaced its push address: sign up again with what the page last saved.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open("riftwatch-push");
      const saved = await cache.match("/push-state");
      if (!saved) return;
      const state = await saved.json();
      const key = Uint8Array.from(atob(state.publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const body = { ...state, ...sub.toJSON() };
      delete body.publicKey;
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (event.oldSubscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
        });
      }
    })().catch(() => {}),
  );
});

// ---- Stats files: cache first ----
// A build's files (stats/<version>/...) never change, so a copy is as good as the server's: repeat visits are instant
// and pages open on a bad connection. When a new build appears, the old build's copies are thrown out.
const STATS_CACHE = "riftwise-stats-v1";
const STATS_RE = /^\/stats\/(\d{14})\//;

async function statsFromCache(request, version) {
  const cache = await caches.open(STATS_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    cache.put(request, res.clone()).catch(() => {});
    pruneOldBuilds(cache, version);
  }
  return res;
}

let prunedFor = "";
async function pruneOldBuilds(cache, version) {
  if (prunedFor === version) return;
  prunedFor = version;
  for (const req of await cache.keys()) {
    const m = STATS_RE.exec(new URL(req.url).pathname);
    if (m && m[1] !== version) await cache.delete(req);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method === "GET") {
    const url = new URL(req.url);
    const m = url.origin === self.location.origin ? STATS_RE.exec(url.pathname) : null;
    if (m) {
      event.respondWith(statsFromCache(req, m[1]).catch(() => fetch(req)));
      return;
    }
  }
  if (req.mode !== "navigate") return; // other assets and APIs: plain network, no caching
  event.respondWith(
    fetch(req).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
