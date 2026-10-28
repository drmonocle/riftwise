/**
 * Anonymous daily counts, so features get built by numbers (server/push/usage.go keeps only each day's totals; the
 * analytics hub's RiftWise funnel reads them). Once a day each browser says it visited, with its theme, language,
 * web or desktop app and version, and once a day that it opened a second page. No cookie, no id, nothing about
 * who it is: the day it last counted is the only thing kept here, so the next visit that day isn't counted again.
 * Team, player, tournament, champion and league pages are counted the same way, once a page a day: the stats home's
 * "Most viewed this week" for a first visit, when there are no recently viewed pages yet (src/hub/popular.ts).
 * Counts are sent once someone uses the page (a tap, click, key press, wheel turn or mouse move); the ones asked for
 * before that wait for it.
 */
import { currentLang } from "./i18n";
import { IS_DESKTOP, IS_WEB } from "./platform";
import { APP_VERSION } from "./version";

const URL_ = IS_WEB ? "/api/push/usage" : "https://riftwise.gg/api/push/usage";

const today = () => new Date().toISOString().slice(0, 10);

/** true the first time `key` is asked today (and remembered), false after; never counts when storage is off */
function firstToday(key: string): boolean {
  try {
    if (localStorage.getItem(key) === today()) return false;
    localStorage.setItem(key, today());
    return true;
  } catch {
    return false;
  }
}

function send(body: Record<string, unknown>) {
  // the local preview and tests have no usage service; a failed count is just not counted
  if (IS_WEB && !/(^|\.)riftwise\.gg$/.test(location.hostname)) return;
  // plain text and no-cors: the desktop app posts from another origin without a CORS preflight (the reply isn't read)
  fetch(URL_, { method: "POST", mode: IS_WEB ? "same-origin" : "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ ...body, person: true }), keepalive: true }).catch(() => {});
}

// ── Someone using the page ────────────────────────────────────────────────

/** a crawler or a test browser: it would count every page it renders (the service checks the user agent too) */
const botLike = () =>
  typeof navigator === "undefined" || !!navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent);
const INPUTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"];
let person = false;
const waiting: (() => void)[] = [];

function onInput(e: Event) {
  if (person || !e.isTrusted) return;
  person = true;
  for (const t of INPUTS) window.removeEventListener(t, onInput, true);
  for (const f of waiting.splice(0)) f();
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function")
  for (const t of INPUTS) window.addEventListener(t, onInput, { capture: true, passive: true });

/** runs `count` now when someone has used this page, or when they first do */
function asPerson(count: () => void) {
  if (botLike()) return;
  if (person) count();
  else waiting.push(count);
}

export function countVisit(theme: string | undefined) {
  asPerson(() => {
    if (firstToday("riftwatch_usage_visit"))
      send({ event: "visit", theme: theme || "rift", lang: currentLang(), app: IS_DESKTOP ? "desktop" : "web", v: APP_VERSION });
  });
}

export function countSecondPage() {
  asPerson(() => {
    if (firstToday("riftwatch_usage_second")) send({ event: "second" });
  });
}

// ── Page views (Most viewed) ──────────────────────────────────────────────

const VIEWS_KEY = "riftwatch_usage_views";
const queue: { page: string; title: string }[] = [];
let timer = 0;

/** sends the pages waiting to be counted, 20 a time, a few seconds apart (the service takes 30 requests a minute) */
function flushViews() {
  window.clearTimeout(timer);
  if (!queue.length) return;
  send({ event: "views", pages: queue.splice(0, 20) });
  if (queue.length) timer = window.setTimeout(flushViews, 4000);
}

/** counts one view of a page ("player/faker"), once a page a day on this browser; `title` is the name it shows */
export function countView(page: string, title: string) {
  asPerson(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(VIEWS_KEY) || "null");
      const seen: string[] = raw && raw.d === today() && Array.isArray(raw.p) ? raw.p : [];
      if (seen.includes(page)) return;
      seen.push(page);
      localStorage.setItem(VIEWS_KEY, JSON.stringify({ d: today(), p: seen.slice(-300) }));
    } catch {
      return; // storage off: not counted, like the visits
    }
    queue.push({ page, title: title.slice(0, 60) });
    window.clearTimeout(timer);
    timer = window.setTimeout(flushViews, 4000);
  });
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("pagehide", flushViews);
