// Opens the main pages in a headless browser and fails (exit 1) when one has a script error, a broken request to the
// site itself (a missing stats file, a 5xx), or shows the app's own error message. Run by CI on every pull request
// against the web build served with the test stats build (scripts/stats/test), and by hand against the live site.
// usage: node scripts/audit/smoke.mjs <base> [width]      e.g. node scripts/audit/smoke.mjs https://riftwise.gg
// SMOKE_ALLOW=<regex>: same-site addresses allowed to fail (CI: the test stats build has no Data Dragon lists, hub/dd*)
import { launch } from "./browser.mjs";

const base = (process.argv[2] || "http://localhost:4174").replace(/\/$/, "");
const width = Number(process.argv[3] || 1440);
const origin = new URL(base).origin;
const allow = process.env.SMOKE_ALLOW ? new RegExp(process.env.SMOKE_ALLOW) : null;
const allowed = (u) => allow && allow.test(u);

// one page of each kind; a match page is taken from the build's records (the test build has other games than live)
const PAGES = [
  "/", "/schedule", "/results", "/stats", "/stats/rankings", "/stats/records", "/stats/titles", "/stats/leagues",
  "/stats/champions", "/stats/tournaments", "/stats/best", "/stats/data", "/stats/worlds", "/stats/worlds/2024",
  "/team/t1", "/player/faker", "/tournament/worlds-2024-main-event", "/league/lol-champions-korea", "/champion/ahri",
];
try {
  const { version } = await (await fetch(`${base}/stats/latest.json`)).json();
  const rec = await (await fetch(`${base}/stats/${version}/hub/records.json`)).json();
  const g = rec?.game?.fastest?.[0]?.g;
  if (g) PAGES.push(`/match/${g}`);
} catch (e) {
  console.log(`(no match page: ${e.message})`);
}

// the app's own "something broke" texts (English: the browser starts without a saved language)
const ERROR_TEXT = [/Something went wrong/i, /Couldn't load the stats right now/i, /We couldn't find that page/i];

const b = await launch({ width, height: 900 });
const problems = [];
let page = "";
const pageIssues = () => problems.filter((p) => p.page === page);
const requests = new Map();
b.on("Network.requestWillBeSent", (p) => requests.set(p.requestId, p.request.url));
b.on("Runtime.exceptionThrown", (p) => problems.push({ page, what: "script error", detail: (p.exceptionDetails.exception?.description || p.exceptionDetails.text || "").slice(0, 200) }));
b.on("Network.responseReceived", (p) => {
  const u = p.response.url;
  if (u.startsWith(origin) && p.response.status >= 400 && !/\/api\//.test(u) && !allowed(u)) problems.push({ page, what: `HTTP ${p.response.status}`, detail: u.slice(origin.length) });
});
b.on("Network.loadingFailed", (p) => {
  const u = requests.get(p.requestId) || "";
  if (!p.canceled && u.startsWith(origin) && !allowed(u)) problems.push({ page, what: "request failed", detail: `${requests.get(p.requestId).slice(origin.length)} (${p.errorText})` });
});
await b.send("Runtime.enable");
await b.send("Network.enable");
await b.send("Page.enable");
// skip the first-visit welcome and keep spoilers on screen, as a returning visitor
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("riftwatch_has_launched", "1"); } catch {}` });

for (const p of PAGES) {
  page = p;
  const t0 = Date.now();
  await b.send("Page.navigate", { url: base + p });
  // loaded, then a moment for the page's own files (stats parts are fetched as they're shown)
  for (let i = 0; i < 40; i++) {
    await b.sleep(250);
    const r = await b.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (r.result.value === "complete") break;
  }
  await b.sleep(2500);
  const text = (await b.send("Runtime.evaluate", { expression: "document.body ? document.body.innerText : ''", returnByValue: true })).result.value || "";
  for (const re of ERROR_TEXT) if (re.test(text)) problems.push({ page, what: "error shown", detail: re.source });
  if (text.trim().length < 40) problems.push({ page, what: "empty page", detail: `${text.trim().length} characters` });
  console.log(`${pageIssues().length ? "FAIL" : "ok  "} ${p} (${Date.now() - t0} ms)`);
}
b.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const x of problems) console.log(`  ${x.page}: ${x.what}: ${x.detail}`);
  process.exit(1);
}
console.log(`\nall ${PAGES.length} pages fine`);
