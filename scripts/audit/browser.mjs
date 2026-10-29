// A headless Edge or Chrome driven over the DevTools protocol (no npm packages): the audit scripts share it.
// BROWSER=<path> picks the browser; otherwise the first one found (Edge on Windows, Chrome or Chromium on Linux).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function findBrowser() {
  const found = process.env.BROWSER || CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error("no Edge or Chrome found: set BROWSER to one");
  return found;
}

/** Starts the browser headless at a window size; `page()` gives the DevTools connection to its first tab. */
export async function launch({ width = 1440, height = 900 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // A fresh profile's first start can take longer than 15 s on a CI runner, and a random port can be taken (CI on
  // main failed with "the browser didn't start" five times on 2026-10-28): up to three tries, each on a new port with
  // up to 45 s to answer.
  let proc, profile, target;
  for (let attempt = 1; attempt <= 3 && !target; attempt++) {
    const port = 9200 + Math.floor(Math.random() * 600);
    profile = fs.mkdtempSync(path.join(os.tmpdir(), "rw-audit-"));
    proc = spawn(
      findBrowser(),
      [`--remote-debugging-port=${port}`, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        ...(process.platform === "linux" ? ["--no-sandbox"] : []), `--user-data-dir=${profile}`, `--window-size=${width},${height}`, "about:blank"],
      { stdio: "ignore" },
    );
    let exited = false;
    proc.on("exit", () => (exited = true));
    for (let i = 0; i < 180 && !target && !exited; i++) {
      await sleep(250);
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
      } catch {
        /* not up yet */
      }
    }
    if (!target) {
      console.log(`(the browser didn't start${exited ? ": it quit" : ""}; try ${attempt} of 3)`);
      proc.kill();
      await sleep(1000);
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  if (!target) throw new Error("the browser didn't start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
    } else if (d.method) {
      for (const fn of listeners.get(d.method) || []) fn(d.params);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);
  const close = () => {
    try {
      ws.close();
    } catch {
      /* gone */
    }
    proc.kill();
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500);
  };
  return { send, on, close, sleep };
}
