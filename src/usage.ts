/**
 * Anonymous daily counts, so features get built by numbers (server/push/usage.go keeps only each day's totals; the
 * analytics hub's RiftWise funnel reads them). Once a day each browser says it visited, with its theme, language,
 * web or desktop app and version, and once a day that it opened a second page. No cookie, no id, nothing about
 * who it is: the day it last counted is the only thing kept here, so the next visit that day isn't counted again.
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

function send(body: Record<string, string>) {
  // the local preview and tests have no usage service; a failed count is just not counted
  if (IS_WEB && !/(^|\.)riftwise\.gg$/.test(location.hostname)) return;
  // plain text and no-cors: the desktop app posts from another origin without a CORS preflight (the reply isn't read)
  fetch(URL_, { method: "POST", mode: IS_WEB ? "same-origin" : "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

export function countVisit(theme: string | undefined) {
  if (!firstToday("riftwatch_usage_visit")) return;
  send({ event: "visit", theme: theme || "rift", lang: currentLang(), app: IS_DESKTOP ? "desktop" : "web", v: APP_VERSION });
}

export function countSecondPage() {
  if (firstToday("riftwatch_usage_second")) send({ event: "second" });
}
