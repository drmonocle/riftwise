// Desktop layout audit: every listed page at a desktop width, full-height screenshots (the app scrolls inside a box,
// so the window is made as tall as the content), plus checks for boxes that don't line up:
//  - short: a box narrower than its parent while a sibling box fills it (right edges don't line up)
//  - capped: a box held by a max-width while its parent has much more room (doesn't grow on wide screens)
//  - ragged: boxes side by side in one row with different heights (a grid / flex row that doesn't stretch)
//  - empty: how much of the window the page's content leaves empty on the right
// usage: node wide_audit.mjs <base> <outdir> [width] [only page names, comma separated]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findBrowser } from "./browser.mjs";

const base = process.argv[2] || "http://localhost:4174";
const outDir = process.argv[3] || ".";
const W = Number(process.argv[4] || 1920);
const only = (process.argv[5] || "").split(",").filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });
const PAGES = [
  ["live", "/"],
  ["schedule", "/schedule"],
  ["results", "/results"],
  ["tab-watchlist", "/watchlist"],
  ["tab-stream", "/stream"],
  ["tab-settings", "/settings"],
  ["news", "/news"],
  ["stats-home", "/stats"],
  ["worlds-picker", "/stats/worlds"],
  ["worlds-facts-all", "/stats/worlds/all"],
  ["msi", "/stats/msi"],
  ["worlds-2025", "/stats/worlds/2025"],
  ["event-lck", "/tournament/lck-2026-season-playoffs"],
  ["tournaments", "/stats/tournaments"],
  ["leagues", "/stats/leagues"],
  ["titles", "/stats/titles"],
  ["rankings", "/stats/rankings"],
  ["compare", "/stats/compare?teams=t1,geng"],
  ["records", "/stats/records"],
  ["champions", "/stats/champions"],
  ["counters", "/stats/counters"],
  ["patches", "/stats/patches"],
  ["tiers", "/stats/tiers"],
  ["leaders", "/stats/leaders"],
  ["prep", "/stats/prep?teams=t1,geng"],
  ["draft", "/stats/draft?teams=t1,geng"],
  ["finder", "/stats/finder"],
  ["best", "/stats/best"],
  ["data", "/stats/data"],
  ["about", "/stats/about"],
  ["team", "/team/t1"],
  ["player", "/player/faker"],
  ["event", "/tournament/worlds-2025-main-event"],
  ["league", "/league/lck"],
  ["champ", "/champion/ahri"],
  ["match", "/match/worlds-2025-main-event-finals-1"],
  ["aboutme", "/about"],
].filter(([n]) => !only.length || only.includes(n));
const edge = findBrowser(); // Edge or Chrome (browser.mjs; BROWSER=<path> to choose)
const port = 9600 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rw-edge-"));
const proc = spawn(edge, [`--remote-debugging-port=${port}`, "--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--window-size=${W},1100`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const errors = [];

// the tallest scrolling box's content height (the app's page scroller)
const HEIGHT = `(() => { let h = document.documentElement.scrollHeight; for (const el of document.querySelectorAll("#root *")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.clientHeight > 300 && el.scrollHeight > el.clientHeight + 4) h = Math.max(h, el.scrollHeight + el.getBoundingClientRect().top + 40); } return Math.ceil(h); })()`;

const CHECK = `(() => {
  const W = window.innerWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const desc = (el) => { const r = el.getBoundingClientRect(); return el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 6).join(".") : "") + " [" + Math.round(r.left) + "→" + Math.round(r.right) + " w" + Math.round(r.width) + " h" + Math.round(r.height) + "] \\"" + (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 40) + "\\""; };
  const isBox = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return r.width >= 140 && r.height >= 28 && parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0 && parseFloat(cs.borderRightWidth) > 0 && cs.display !== "inline" && cs.display !== "inline-flex" && cs.display !== "inline-block" && cs.position !== "fixed" && cs.position !== "absolute" && !/^(button|a|input|select|textarea|img|svg|th|td|tr|table)$/i.test(el.tagName);
  };
  const contentW = (p) => { const cs = getComputedStyle(p); return p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); };
  const boxes = [...document.querySelectorAll("#root *")].filter((el) => vis(el) && isBox(el));
  const short = [], capped = [], ragged = [];
  const seenParents = new Set();
  for (const b of boxes) {
    const p = b.parentElement;
    if (!p || seenParents.has(p)) continue;
    seenParents.add(p);
    const pcs = getComputedStyle(p);
    const kids = [...p.children].filter((k) => vis(k) && isBox(k));
    if (kids.length < 1) continue;
    const cw = contentW(p);
    const column = pcs.display === "block" || (pcs.display === "flex" && pcs.flexDirection.startsWith("column")) || (pcs.display === "grid" && pcs.gridTemplateColumns.split(" ").length === 1);
    if (column && kids.length >= 2) {
      const fills = kids.filter((k) => k.getBoundingClientRect().width >= cw - 4);
      for (const k of kids) if (fills.length && k.getBoundingClientRect().width < cw - 16) short.push(desc(k) + " | parent content w" + Math.round(cw));
    }
    // rows of boxes side by side
    const rows = new Map();
    for (const k of kids) { const t = Math.round(k.getBoundingClientRect().top / 4); if (!rows.has(t)) rows.set(t, []); rows.get(t).push(k); }
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      const hs = row.map((k) => k.getBoundingClientRect().height);
      if (Math.max(...hs) - Math.min(...hs) > 10) ragged.push(row.length + " boxes, heights " + hs.map(Math.round).join("/") + " | first " + desc(row[0]));
    }
  }
  for (const el of document.querySelectorAll("#root *")) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (!cs.maxWidth.endsWith("px")) continue;
    const mw = parseFloat(cs.maxWidth), r = el.getBoundingClientRect();
    const p = el.parentElement;
    if (!p || r.width < 200 || r.width < mw - 2 || /^(td|th|select|input|button)$/i.test(el.tagName)) continue;
    const room = contentW(p);
    if (room - r.width > 160) capped.push(desc(el) + " | max-width " + mw + ", parent room " + Math.round(room));
  }
  // right edge of the page's content
  let right = 0;
  for (const b of boxes) right = Math.max(right, b.getBoundingClientRect().right);
  return { W, contentRight: Math.round(right), emptyRight: Math.round(W - right), short: short.slice(0, 12), capped: capped.filter((c, i, a) => a.indexOf(c) === i).slice(0, 12), ragged: ragged.slice(0, 10) };
})()`;

try {
  let target;
  for (let k = 0; k < 40 && !target; k++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    if (d.method === "Runtime.exceptionThrown") errors.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 160));
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base + "/favicon.ico" });
  await sleep(600);
  await send("Runtime.evaluate", { expression: `localStorage.setItem("riftwatch_has_launched","1");` + (process.env.LANG_CODE ? `localStorage.setItem("riftwatch_settings", JSON.stringify({ language: ${JSON.stringify(process.env.LANG_CODE)} }));` : "") });
  const report = [];
  for (const [name, url] of PAGES) {
    const before = errors.length;
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: 1100, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: base + url });
    await sleep(6000);
    const r = (await send("Runtime.evaluate", { expression: CHECK, returnByValue: true })).result.value;
    const h = Math.min(7000, (await send("Runtime.evaluate", { expression: HEIGHT, returnByValue: true })).result.value);
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: Math.max(1100, h), deviceScaleFactor: 1, mobile: false });
    await sleep(1200);
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    fs.writeFileSync(path.join(outDir, `${name}.jpg`), Buffer.from(shot.data, "base64"));
    report.push({ name, ...r, errors: errors.slice(before) });
    const n = r.short.length + r.capped.length + r.ragged.length;
    console.log(`${n ? "!!" : "ok"} ${name}: content ends at ${r.contentRight}px (${r.emptyRight}px empty on the right)`);
    for (const o of r.short) console.log("   short:", o);
    for (const o of r.capped) console.log("   capped:", o);
    for (const o of r.ragged) console.log("   ragged:", o);
    for (const e of errors.slice(before)) console.log("   error:", e);
  }
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 1));
} catch (e) { console.log("error", e.message); }
finally { try { ws && ws.close(); } catch {} proc.kill(); await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
