// What Bing's site scan sees: follow links from the home page (no JavaScript), note each page's status and
// whether it has an <h1>. Pages are crawled up to `perT` per page type; every link found is status-checked.
// usage: node crawl.mjs [base] [maxPages] [perType] [maxLinkChecks]
const base = process.argv[2] || "https://riftwise.gg";
const max = Number(process.argv[3] || 1500);
const perT = Number(process.argv[4] || 25);
const maxChecks = Number(process.argv[5] || 6000);
const host = new URL(base).host;
// AUDIT_UA: another user agent (the weekly GitHub run names itself: Cloudflare blocks a "bingbot" from elsewhere)
const UA = { "user-agent": process.env.AUDIT_UA || "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" };
const SKIP = /\.(js|css|png|jpe?g|gif|svg|webp|ico|json|webmanifest|woff2?|txt|zip|exe|msi)$/i;

const typeOf = (path) => {
  const segs = path.split("?")[0].split("/").filter(Boolean);
  const lang = segs[0] && /^[a-z]{2}(-[A-Z]{2})?$/.test(segs[0]) ? [segs.shift()] : [];
  return "/" + [...lang, segs[0] || "", ...segs.slice(1).map(() => "*")].join("/") + (path.includes("?") ? "?" : "");
};

const crawled = new Map(); // path -> {status, h1, title}
const found = new Map(); // path -> first page linking to it
const perType = new Map();
const queue = ["/"];
found.set("/", "(start)");

function links(html, from) {
  const out = [];
  for (const m of html.matchAll(/<(a|link)\b[^>]*?\bhref="([^"]+)"[^>]*>/gi)) {
    const tag = m[0];
    if (m[1].toLowerCase() === "link" && !/rel="(alternate|canonical|next|prev)"/i.test(tag)) continue;
    let u;
    try {
      u = new URL(m[2].replace(/&amp;/g, "&"), base + from);
    } catch {
      continue;
    }
    if (u.host !== host || SKIP.test(u.pathname)) continue;
    out.push(u.pathname + u.search);
  }
  return out;
}

async function fetchPage(path) {
  const r = await fetch(base + path, { headers: UA, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const text = r.status === 200 ? await r.text() : "";
  return { status: r.status, location: r.headers.get("location"), text, type: r.headers.get("content-type") || "" };
}

let qi = 0;
async function crawlWorker() {
  while (qi < queue.length && crawled.size < max) {
    const path = queue[qi++];
    if (crawled.has(path)) continue;
    crawled.set(path, null);
    try {
      const { status, location, text, type } = await fetchPage(path);
      const noNs = text.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
      const title = (/<title>([^<]*)<\/title>/.exec(text) || [])[1] || "";
      crawled.set(path, { status, location, h1: /<h1[\s>]/i.test(noNs), html: type.includes("html"), title });
      if (location) {
        const to = new URL(location, base + path);
        if (to.host === host) add(to.pathname + to.search, path);
      }
      for (const l of links(text, path)) add(l, path);
    } catch (e) {
      crawled.set(path, { status: "ERR " + e.message });
    }
  }
}
function add(path, from) {
  if (!found.has(path)) found.set(path, from);
  if (crawled.has(path) || queue.includes(path)) return;
  const t = typeOf(path);
  const n = perType.get(t) || 0;
  if (n >= perT) return;
  perType.set(t, n + 1);
  queue.push(path);
}

// crawl in rounds so the queue can grow while workers run
while (qi < queue.length && crawled.size < max) await Promise.all(Array.from({ length: 6 }, crawlWorker));

// status-check every other link found (HEAD; GET if HEAD isn't allowed)
const rest = [...found.keys()].filter((p) => !crawled.has(p)).slice(0, maxChecks);
const checked = new Map();
let ci = 0;
async function checkWorker() {
  while (ci < rest.length) {
    const p = rest[ci++];
    try {
      let r = await fetch(base + p, { method: "HEAD", headers: UA, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      if (r.status === 405 || r.status === 501) r = await fetch(base + p, { headers: UA, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      checked.set(p, r.status);
    } catch (e) {
      checked.set(p, "ERR " + e.message);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, checkWorker));

const all = [...crawled].map(([p, x]) => ({ p, ...(x || {}) }));
const bad = all.filter((x) => typeof x.status !== "number" || x.status >= 400);
const noH1 = all.filter((x) => x.status === 200 && x.html && !x.h1);
const redirects = all.filter((x) => x.status >= 300 && x.status < 400);
const badLinks = [...checked].filter(([, s]) => typeof s !== "number" || s >= 400);
console.log(`crawled ${all.length} pages (${perType.size} page types), checked ${checked.size} more links of ${found.size - all.length} found`);
console.log("\n4xx/5xx/errors among crawled pages:", bad.length);
for (const x of bad) console.log(" ", x.status, x.p, "<- linked from", found.get(x.p));
console.log("\nbroken links among checked:", badLinks.length);
for (const [p, s] of badLinks.slice(0, 40)) console.log(" ", s, p, "<- linked from", found.get(p));
console.log("\n200 HTML pages without <h1>:", noH1.length);
for (const x of noH1) console.log(" ", x.p, "|", x.title, "<- linked from", found.get(x.p));
console.log("\nredirects:", redirects.length);
for (const x of redirects.slice(0, 20)) console.log(" ", x.status, x.p, "->", x.location, "<- linked from", found.get(x.p));
console.log("\npage types:", [...perType.keys()].sort().join("  "));
// exit 1 when a crawler would find something wrong (the weekly audit workflow then fails and GitHub says so)
if (bad.length || badLinks.length || noH1.length) process.exit(1);
