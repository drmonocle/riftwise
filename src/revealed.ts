import React from "react";
/**
 * Results revealed in spoiler mode, remembered on this device (and synced to the person's other devices when they
 * use cloud sync). Keys: "match:<lolesports id>" for match cards, hub keys like "series:<slug>" for stats pages.
 * Spoiler mode only hides results from the last two weeks, so reveals older than 30 days are forgotten.
 */
const KEY = "riftwatch_revealed";
export const REVEALED_EVENT = "riftwatch_revealed_updated";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

let cache: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (cache) return cache;
  let m: Record<string, number> = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (raw && typeof raw === "object") m = raw;
  } catch {
    /* start empty */
  }
  const cut = Date.now() - KEEP_MS;
  for (const [k, t] of Object.entries(m)) if (typeof t !== "number" || t < cut) delete m[k];
  cache = m;
  return m;
}

function save(m: Record<string, number>) {
  cache = m;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* private mode: kept in memory for this visit */
  }
  window.dispatchEvent(new Event(REVEALED_EVENT));
}

export const isRevealed = (key: string) => key in load();

export function setRevealed(key: string, on: boolean) {
  const m = { ...load() };
  if (on) m[key] = Date.now();
  else delete m[key];
  save(m);
}

/** Everything revealed on this device (for sync). */
export const allRevealed = (): Record<string, number> => ({ ...load() });

/** Replace the whole list (sync brought a newer one). */
export function replaceRevealed(m: Record<string, number>) {
  const clean: Record<string, number> = {};
  const cut = Date.now() - KEEP_MS;
  for (const [k, t] of Object.entries(m || {})) if (typeof k === "string" && k.length < 200 && typeof t === "number" && t >= cut) clean[k] = t;
  save(clean);
}

// another tab changed it
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = null;
      window.dispatchEvent(new Event(REVEALED_EVENT));
    }
  });
}

/** Re-render when anything is revealed or hidden (here, in another tab, or by sync). */
export function useRevealedVersion(): number {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    const f = () => setV((x) => x + 1);
    window.addEventListener(REVEALED_EVENT, f);
    return () => window.removeEventListener(REVEALED_EVENT, f);
  }, []);
  return v;
}
