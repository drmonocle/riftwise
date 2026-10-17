/**
 * The move to riftwise.gg (v0.6.0). A browser keeps a site's saved settings per address, so what people set up at
 * lolworlds.com/riftwise (followed teams, theme, language...) doesn't show at riftwise.gg by itself. The note at the
 * top of the page offers to bring it over: lolworlds.com/riftwise/move.html (server/iis/move.html) packs those
 * settings into the address after "#" (never sent to a server) and comes straight back here, where
 * importMovedSettings() unpacks them before the app starts. Sign-in and alerts belong to the site, so they stay.
 */
import { IS_WEB } from "./platform";

/** What move.html carries over (keep the two lists the same). */
export const MOVE_KEYS = [
  "riftwatch_settings",
  "riftwatch_settings_updated",
  "riftwatch_revealed",
  "riftwatch_revealed_updated",
  "riftwatch_has_launched",
  "riftwatch_tip_hub_v1",
  "riftwatch_tip_rename_v1",
  "riftwatch_push_banner_closed",
];
export const MOVE_PAGE_URL = "https://lolworlds.com/riftwise/move.html";
const DONE_KEY = "riftwise_moved"; // "1" brought over, "0" nothing to bring or not wanted
const RESULT_KEY = "riftwise_move_result"; // this tab: "ok" / "none", for the note after coming back
const OFFER_UNTIL = Date.parse("2027-04-01");

function decode(data: string): Record<string, unknown> {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Coming back from move.html (#import=...): save what it brought and clean the address. Before the first render. */
export function importMovedSettings(): void {
  if (!IS_WEB || typeof window === "undefined" || !window.location.hash.startsWith("#import=")) return;
  const data = window.location.hash.slice("#import=".length);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  try {
    let n = 0;
    if (data && data !== "none") {
      const got = decode(data);
      for (const k of MOVE_KEYS) {
        const v = got[k];
        if (typeof v === "string") {
          localStorage.setItem(k, v);
          n++;
        }
      }
    }
    localStorage.setItem(DONE_KEY, n ? "1" : "0");
    sessionStorage.setItem(RESULT_KEY, n ? "ok" : "none");
  } catch {
    /* a broken or partial address: nothing to bring */
  }
}

/** Whether to offer bringing settings over (web only, until it's done or closed, and only for a few months). */
export function offerMove(): boolean {
  if (!IS_WEB || Date.now() > OFFER_UNTIL) return false;
  try {
    return localStorage.getItem(DONE_KEY) === null;
  } catch {
    return false;
  }
}

export function closeMoveOffer(): void {
  try {
    localStorage.setItem(DONE_KEY, "0");
  } catch {
    /* fine */
  }
}

/** "ok" or "none" right after coming back from move.html (once per tab), else null. */
export function moveResult(): "ok" | "none" | null {
  try {
    const r = sessionStorage.getItem(RESULT_KEY);
    return r === "ok" || r === "none" ? r : null;
  } catch {
    return null;
  }
}

export function clearMoveResult(): void {
  try {
    sessionStorage.removeItem(RESULT_KEY);
  } catch {
    /* fine */
  }
}
