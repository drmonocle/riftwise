// Phone audit: every listed page at 375x812 (touch), what sticks out past the screen edge without being inside a
// scrolling box, whether the page itself scrolls sideways, and any script errors. Saves a screenshot of each.
// usage: node mobile_audit.mjs <base> <outdir> [width]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findBrowser } from "./browser.mjs";

const base = process.argv[2] || "http://localhost:4174";
const outDir = process.argv[3] || ".";
const W = Number(process.argv[4] || 375);
fs.mkdirSync(outDir, { recursive: true });
const PAGES = [
  ["live", "/"],
  ["schedule", "/#schedule"],
  ["tab-watchlist", "/", "Watchlist"],
  ["tab-stream", "/", "24/7 Stream"],
  ["tab-settings", "/", "Settings"],
  ["tab-dispatch", "/", "Dispatch"],
  ["stats-home", "/stats"],
  ["worlds-picker", "/stats/worlds"],
  ["worlds-facts-all", "/stats/worlds/all"],
  ["msi", "/stats/msi"],
  ["first-stand", "/stats/first-stand"],
  ["tournaments", "/stats/tournaments"],
  ["leagues", "/stats/leagues"],
  ["titles", "/stats/titles"],
  ["rankings", "/stats/rankings"],
  ["compare", "/stats/compare?teams=t1,geng"],
  ["records", "/stats/records"],
  ["champions", "/stats/champions"],
  ["counters", "/stats/counters"],
  ["patches", "/stats/patches"],
  ["prep", "/stats/prep?teams=t1,geng"],
  ["draft", "/stats/draft?teams=t1,geng"],
  ["finder", "/stats/finder"],
  ["best", "/stats/best"],
  ["data", "/stats/data"],
  ["about", "/stats/about"],
  ["team", "/team/t1"],
  ["team-stats", "/team/t1/stats"],
  ["player", "/player/faker"],
  ["player-matches", "/player/faker/matches"],
  ["teams", "/stats/teams"],
  ["players", "/stats/players"],
  ["weekly", "/stats/weekly"],
  ["event", "/tournament/worlds-2025-main-event"],
  ["event-stats", "/tournament/worlds-2025-main-event/stats"],
  ["league", "/league/lck"],
  ["champ", "/champion/ahri"],
  ["match", "/match/worlds-2025-main-event-finals-1"],
  ["aboutme", "/about"],
];
const edge = findBrowser(); // Edge or Chrome (browser.mjs; BROWSER=<path> to choose)
const port = 9200 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rw-edge-"));
const proc = spawn(edge, [`--remote-debugging-port=${port}`, "--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--window-size=${W},812`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const errors = [];
const CHECK = `(() => {
  const W = window.innerWidth;
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (/(auto|scroll)/.test(ox) && p.getBoundingClientRect().right <= W + 1) return true;
    }
    return false;
  };
  const off = [];
  for (const el of document.querySelectorAll("#root *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" && cs.visibility === "hidden") continue;
    if ((r.right > W + 1 || r.left < -1) && !inScroller(el)) off.push(el);
  }
  // the outermost offenders only
  const top = off.filter((el) => !off.some((o) => o !== el && o.contains(el)));
  const desc = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 4).join(".") : "") + " [" + Math.round(el.getBoundingClientRect().left) + "→" + Math.round(el.getBoundingClientRect().right) + "] " + (el.innerText || "").replace(/\\s+/g, " ").slice(0, 50);
  // text cut off in one line (ellipsis) is fine; text overflowing its box without clipping is not
  const spill = [...document.querySelectorAll("#root *")].filter((el) => {
    if (el.children.length) return false;
    const cs = getComputedStyle(el);
    return el.scrollWidth > el.clientWidth + 2 && cs.overflowX === "visible" && cs.whiteSpace !== "nowrap" && el.clientWidth > 0 && !inScroller(el);
  }).slice(0, 5);
  return { docW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, W, off: top.slice(0, 8).map(desc), spill: spill.map(desc) };
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
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: 812, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  // LANG_CODE=ko etc.: the pages in that language (the app's own setting)
  if (process.env.LANG_CODE) {
    await send("Page.navigate", { url: base + "/favicon.ico" });
    await sleep(600);
    await send("Runtime.evaluate", { expression: `localStorage.setItem("riftwatch_has_launched","1"); localStorage.setItem("riftwatch_settings", JSON.stringify({ language: ${JSON.stringify(process.env.LANG_CODE)} }));` });
  }
  const report = [];
  for (const [name, url, tab] of PAGES) {
    const before = errors.length;
    await send("Page.navigate", { url: base + url });
    await sleep(5000);
    if (tab) {
      await send("Runtime.evaluate", { expression: `(() => { const b = [...document.querySelectorAll("button, a")].find((x) => x.innerText.trim().replace(/\\s+/g, " ").endsWith(${JSON.stringify(tab)})); b && b.click(); return !!b; })()` });
      await sleep(3000);
    }
    const r = (await send("Runtime.evaluate", { expression: CHECK, returnByValue: true })).result.value;
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(shot.data, "base64"));
    const issues = (r.docW > W + 1 ? 1 : 0) + r.off.length + r.spill.length + (errors.length - before);
    report.push({ name, sideways: r.docW > W + 1 ? r.docW : 0, off: r.off, spill: r.spill, errors: errors.slice(before) });
    console.log(`${issues ? "!!" : "ok"} ${name}${r.docW > W + 1 ? ` page ${r.docW}px wide` : ""}`);
    for (const o of r.off) console.log("   off-screen:", o);
    for (const o of r.spill) console.log("   spills:", o);
    for (const e of errors.slice(before)) console.log("   error:", e);
  }
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 1));
} catch (e) { console.log("error", e.message); }
finally { try { ws && ws.close(); } catch {} proc.kill(); await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
