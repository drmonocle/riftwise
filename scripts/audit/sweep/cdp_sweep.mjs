// Headless Edge: run the page sweep (__sweep.js + __pages.json, copied into dist-web) over every page, in chunks.
// usage: node cdp_sweep.mjs [base url] [language]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findBrowser } from "../browser.mjs";

const base = process.argv[2] || "http://localhost:4174";
const lang = process.argv[3] || "en";
const edge = findBrowser(); // Edge or Chrome (browser.mjs; BROWSER=<path> to choose)
const port = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rw-edge-"));
const proc = spawn(edge, [`--remote-debugging-port=${port}`, "--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, "--window-size=375,812", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const errors = [];
try {
  let target;
  for (let k = 0; k < 40 && !target; k++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    if (d.method === "Runtime.exceptionThrown") errors.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 200));
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { const s = JSON.parse(localStorage.getItem("riftwatch_settings") || "{}"); s.language = ${JSON.stringify(lang)}; localStorage.setItem("riftwatch_settings", JSON.stringify(s)); } catch {}` });
  await send("Page.navigate", { url: base + "/stats" });
  await sleep(6000);
  await send("Runtime.evaluate", { awaitPromise: true, expression: `new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/__sweep.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }).then(async () => { window.__P = await (await fetch('/__pages.json')).json(); return window.__P.length; })` });
  const n = (await send("Runtime.evaluate", { expression: "window.__P.length", returnByValue: true })).result.value;
  const bad = [];
  for (let a = 0; a < n; a += 25) {
    const r = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `window.__sweep(window.__P, ${a}, ${Math.min(n, a + 25)})` });
    bad.push(...(r.result.value || []));
    process.stdout.write(`${Math.min(n, a + 25)}/${n} `);
  }
  console.log("\n" + JSON.stringify({ pages: n, lang, bad, pageErrors: errors.slice(0, 10) }, null, 1));
} catch (e) { console.log("error", e.message); }
finally { try { ws && ws.close(); } catch {} proc.kill(); await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
