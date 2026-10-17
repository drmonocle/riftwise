/**
 * The move to riftwise.gg (v0.6.0). A browser keeps a site's saved settings per address, so what people set up at
 * lolworlds.com/riftwise (followed teams, theme, language, sign-in...) doesn't show at riftwise.gg by itself.
 * The first time a browser opens riftwise.gg, autoMove() takes a quick detour through
 * lolworlds.com/riftwise/move.html (server/iis/move.html), which packs those settings into the address after "#"
 * (never sent to a server) and comes straight back; importMovedSettings() saves them before the app starts and
 * puts the address back as it was. It happens once per browser, and only for people (not search engines).
 */
import { IS_WEB } from "./platform";

/** What move.html carries over (keep the two lists the same). Alerts belong to the old site and keep working there. */
export const MOVE_KEYS = [
  "riftwatch_settings",
  "riftwatch_settings_updated",
  "riftwatch_revealed",
  "riftwatch_revealed_updated",
  "riftwatch_has_launched",
  "riftwatch_tip_hub_v1",
  "riftwatch_tip_rename_v1",
  "riftwatch_push_banner_closed",
  "riftwatch_sync_token",
  "riftwatch_sync_account",
  "riftwatch_sync_state",
  "riftwatch_sync_code",
];
export const MOVE_PAGE_URL = "https://lolworlds.com/riftwise/move.html";
const DONE_KEY = "riftwise_moved"; // set once the detour was taken: "1" settings came over, "0" none
const RESULT_KEY = "riftwise_move_result"; // this tab: "ok" right after settings came over
const MOVE_UNTIL = Date.parse("2027-04-01"); // after that, people still on the old address are rare enough
const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

function decode(data: string): Record<string, unknown> {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Coming back from move.html (#import=<data>&h=<the address's own #part>): save what it brought and put the
 * address back as it was. Runs before the app reads anything.
 */
export function importMovedSettings(): void {
  if (!IS_WEB || typeof window === "undefined" || !window.location.hash.startsWith("#import=")) return;
  const [data, h] = window.location.hash.slice("#import=".length).split("&h=");
  let hash = "";
  try {
    hash = h ? decodeURIComponent(h) : "";
  } catch {
    hash = "";
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search + (hash.startsWith("#") ? hash : ""));
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
    if (n) sessionStorage.setItem(RESULT_KEY, "ok");
  } catch {
    /* a broken or partial address: nothing to bring */
  }
}

/**
 * First visit to riftwise.gg in this browser: go and fetch the settings saved at the old address (true = leaving,
 * don't start the app). Once per browser, even if the trip fails.
 */
export function autoMove(): boolean {
  if (!IS_WEB || typeof window === "undefined" || window.location.hostname !== "riftwise.gg" || Date.now() > MOVE_UNTIL) return false;
  if (typeof navigator !== "undefined" && (navigator.webdriver || BOTS.test(navigator.userAgent || ""))) return false;
  try {
    if (localStorage.getItem(DONE_KEY) !== null || localStorage.getItem("riftwatch_settings") !== null) return false;
    localStorage.setItem(DONE_KEY, "0");
  } catch {
    return false; // no storage (private window, blocked): nothing could come over anyway
  }
  const back = window.location.pathname + window.location.search + window.location.hash;
  window.location.replace(`${MOVE_PAGE_URL}?to=${encodeURIComponent(back)}`);
  return true;
}

/** True right after settings came over (once per tab), for the "new home" note. */
export function movedHere(): boolean {
  try {
    return sessionStorage.getItem(RESULT_KEY) === "ok";
  } catch {
    return false;
  }
}

export function clearMovedNote(): void {
  try {
    sessionStorage.removeItem(RESULT_KEY);
  } catch {
    /* fine */
  }
}
