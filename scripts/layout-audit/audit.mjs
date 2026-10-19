// Layout audit: opens every page at several window sizes in headless Edge (over the DevTools protocol, no npm
// packages), measures sideways overflow, clipped text, the column layout and console errors, and saves a
// full-page screenshot of each. Needs Node 22+ (built-in WebSocket) and Microsoft Edge.
//   node scripts/layout-audit/audit.mjs https://riftwise.gg out/audit          (the live site)
//   node scripts/layout-audit/audit.mjs http://localhost:4174 out/audit        (a local preview)
// Pages: scripts/layout-audit/pages.json (a "click" entry presses a tab by its label). Results: results.json
// (one row per page and size) + <page>__<size>.png. Set EDGE to another browser path, AUDIT_PORT to another port.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [base, outDir, pagesFile] = process.argv.slice(2);
if (!base || !outDir) {
  console.error("usage: node audit.mjs <base url> <out dir> [pages.json]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const EDGE = process.env.EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = Number(process.env.AUDIT_PORT || 9333);
const SIZES = { mobile: [390, 844], wide: [1920, 1080], square: [1200, 1200], ultrawide: [3440, 1440] };
const pages = JSON.parse(readFileSync(pagesFile || new URL("./pages.json", import.meta.url), "utf8"));

const AUDIT_JS = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const doc = document.documentElement;
  const out = { vw, vh, pageW: doc.scrollWidth, pageH: doc.scrollHeight, hOverflow: doc.scrollWidth - vw, title: document.title, over: [], clipped: [], clippedCount: 0, columns: null, pageWidthPx: null, text: document.body.innerText.length };
  const main = document.querySelector('.rw-page');
  if (main) { const cs = getComputedStyle(main); out.columns = cs.columnCount; out.pageWidthPx = Math.round(main.getBoundingClientRect().width); }
  out.nav = [...document.querySelectorAll('nav button')].filter(b => b.offsetParent).map(b => Math.round(b.getBoundingClientRect().left));
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.right > vw + 1 && r.left < vw && cs.position !== 'fixed') {
      if (out.over.length < 8) out.over.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 60), right: Math.round(r.right), text: (el.innerText || '').trim().slice(0, 50) });
    }
    const clips = (cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 1 && el.children.length <= 2;
    if (clips) {
      out.clippedCount++;
      const t = (el.innerText || '').trim().slice(0, 50);
      if (!seen.has(t) && out.clipped.length < 10) { seen.add(t); out.clipped.push({ tag: el.tagName.toLowerCase(), w: Math.round(r.width), need: el.scrollWidth, text: t }); }
    }
  }
  return JSON.stringify(out);
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = join(outDir, "edge-profile");
const edge = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1920,1080", "about:blank",
], { stdio: "ignore" });
process.on("exit", () => edge.kill());

async function cdpTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Edge did not come up");
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.ws.onmessage = (m) => this.onMessage(JSON.parse(m.data)); }
  static async open(url) { const ws = new WebSocket(url); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); return new CDP(ws); }
  onMessage(msg) { if (msg.id && this.pending.has(msg.id)) { const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); } else if (msg.method) this.events.push(msg); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
}

const cdp = await CDP.open(await cdpTarget());
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
const results = [];
for (const page of pages) {
  for (const [sizeName, [w, h]] of Object.entries(SIZES)) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: sizeName === "mobile" });
    cdp.events.length = 0;
    await cdp.send("Page.navigate", { url: base + page.path });
    await sleep(page.wait || 4500);
    if (page.click) {
      await cdp.send("Runtime.evaluate", { expression: `(() => { const lbl = ${JSON.stringify(page.click)}; const b = document.querySelector('nav button[aria-label=' + JSON.stringify(lbl) + ']') || [...document.querySelectorAll('nav button, button, a')].find(x => x.textContent.replace(/\s+/g, ' ').trim().startsWith(lbl)); if (b) b.click(); return !!b; })()` });
      await sleep(3000);
    }
    let audit = {};
    try {
      const r = await cdp.send("Runtime.evaluate", { expression: AUDIT_JS, returnByValue: true });
      audit = JSON.parse(r.result.value);
    } catch (e) { audit = { error: String(e) }; }
    const errors = cdp.events.filter((e) => (e.method === "Log.entryAdded" && e.params.entry.level === "error") || e.method === "Runtime.exceptionThrown").map((e) => e.method === "Runtime.exceptionThrown" ? e.params.exceptionDetails.text : e.params.entry.text).filter((t) => !/favicon|404/.test(t)).slice(0, 5);
    // the app scrolls inside a container, not the document: let it grow so the screenshot shows the whole page
    let capH = h;
    try {
      const r = await cdp.send("Runtime.evaluate", { expression: `(() => { document.querySelectorAll('.overflow-y-auto.h-full, .rw-app').forEach(e => { e.style.height = 'auto'; e.style.maxHeight = 'none'; e.style.overflow = 'visible'; }); return document.documentElement.scrollHeight; })()`, returnByValue: true });
      capH = Math.min(Math.max(r.result.value || h, h), 6000);
    } catch {}
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: capH, scale: 1 } });
    const file = `${page.name}__${sizeName}.png`;
    writeFileSync(join(outDir, file), Buffer.from(shot.data, "base64"));
    results.push({ page: page.name, path: page.path, size: sizeName, w, h, file, errors, ...audit });
    console.log(`${page.name.padEnd(22)} ${sizeName.padEnd(10)} overflow ${String(audit.hOverflow ?? "?").padStart(4)}  clipped ${String(audit.clippedCount ?? "?").padStart(3)}  cols ${audit.columns ?? "-"}  pageH ${audit.pageH}  errors ${errors.length}`);
  }
}
writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 1));
edge.kill();
console.log("done");
process.exit(0);
