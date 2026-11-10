import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { IS_WEB } from "./platform";
import { loadSettings } from "./api";
import { initI18n } from "./i18n";
import { installWheelSideScroll } from "./wheelScroll";
import { applyTheme } from "./theme";
import { importMovedSettings } from "./move";
import { STARTED_ON_HUB, URL_LANG, currentHubRoute } from "./hub/route";
import { prefetch } from "./stats";
import { preloadDDragon } from "./hub/ddragon";
import { preloadPageCode } from "./components/hub/pageCode";

// Settings brought over from lolworlds.com/riftwise (#import=...) are saved before anything reads them.
importMovedSettings();

// Colours first, so the page never flashes the wrong theme
applyTheme(loadSettings().theme);
installWheelSideScroll();

// The pass-through service worker: offline page, alerts, and what lets browsers offer "Add to Home Screen"
if (IS_WEB && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

// Opened at a stats page (a shared link to a player, a team, a match...): start on the stats code and the page's
// own data file now, alongside the language file, instead of one after the other once the app has drawn. The
// page then finds them already on their way (same module, same file cache). On a slow phone connection each of
// those waits is a round trip of up to half a second, plus the download.
const HUB_FILE_DIR: Partial<Record<string, string>> = {
  player: "player",
  team: "team",
  event: "event",
  match: "game",
  champ: "champ",
  league: "league",
};
const HUB_KIND_PREFETCH: Partial<Record<string, string[]>> = {
  home: ["hub/home.json", "hub/meta.json", "hub/ratings.json", "hub/leagues.json", "hub/weekly.json"],
  tournaments: ["hub/meta.json"],
  champions: ["meta.json", "hub/champgames/index.json", "hub/leagues.json", "hub/alias.json"],
  tiers: ["meta.json", "hub/champgames/index.json", "hub/leagues.json", "hub/alias.json"],
  rankings: ["hub/ratings.json"],
  weekly: ["hub/weekly.json"],
  records: ["hub/records.json"],
  titles: ["hub/titles.json"],
  leagues: ["hub/leagues.json"],
  league: ["hub/leagues.json"],
  patches: ["hub/patches.json"],
  teams: ["hub/search/teams.json", "hub/leagues.json"],
  players: ["hub/search/players.json", "hub/search/teams.json", "hub/leagues.json"],
  items: ["hub/items/index.json"],
  leaders: ["hub/leagues.json", "hub/alias.json"],
  best: ["hub/best/index.json", "hub/best/all.json", "hub/leagues.json", "hub/alias.json"],
  finder: ["hub/champgames/index.json", "hub/leagues.json", "hub/alias.json"],
  counters: ["hub/search/teams.json", "hub/search/events.json", "hub/search/champs.json", "hub/leagues.json"],
  prep: ["hub/search/teams.json", "hub/ratings.json", "hub/leagues.json"],
  compare: ["hub/search/teams.json", "hub/leagues.json"],
  draft: ["hub/search/teams.json", "hub/leagues.json", "hub/alias.json"],
  data: ["hub/leagues.json", "hub/meta.json"],
  worlds: ["hub/league/world-championship.json", "hub/titles.json", "hub/ratings.json"],
  msi: ["hub/league/mid-season-invitational.json", "hub/titles.json", "hub/ratings.json"],
  "first-stand": ["hub/league/first-stand.json", "hub/titles.json", "hub/ratings.json"],
  team: ["hub/ratings.json"],
};
let picturePage = false; // a page that shows champion pictures straight away
if (IS_WEB && STARTED_ON_HUB) {
  import("./components/views/StatsView").catch(() => {}); // a failure shows (and retries) where the page loads it
  const r = currentHubRoute();
  preloadPageCode(r.kind); // each stats page is its own download (pageCode.ts)
  const dir = HUB_FILE_DIR[r.kind];
  const files = [...(HUB_KIND_PREFETCH[r.kind] || []), ...(dir && "slug" in r ? [`hub/${dir}/${r.slug}.json`] : [])];
  if (files.length > 0) prefetch(files);
  picturePage =
    !!dir ||
    r.kind === "home" ||
    r.kind === "champions" ||
    r.kind === "tiers" ||
    r.kind === "items" ||
    r.kind === "counters" ||
    r.kind === "best" ||
    r.kind === "weekly" ||
    r.kind === "prep" ||
    r.kind === "compare" ||
    r.kind === "draft" ||
    r.kind === "finder" ||
    r.kind === "leaders" ||
    r.kind === "patches" ||
    r.kind === "records" ||
    r.kind === "worlds" ||
    r.kind === "msi" ||
    r.kind === "first-stand";
} else if (IS_WEB) {
  import("./components/views/LiveView").catch(() => {});
}

// The language is loaded before the first render, so every screen can simply call tl().
// A language's address (riftwise.gg/ko/...) shows that language, whatever was picked before
const startLanguage = (URL_LANG as ReturnType<typeof loadSettings>["language"] | null) || loadSettings().language;
// riftwise.gg/overlay: the stream overlay instead of the app (an OBS browser source)
const overlay = IS_WEB && /^\/overlay\/?$/.test(window.location.pathname);
initI18n(startLanguage).finally(async () => {
  // its picture lists too, once the language is known (they come with that language's names)
  if (picturePage) preloadDDragon();
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  if (overlay) {
    const { Overlay } = await import("./overlay/Overlay");
    root.render(<Overlay />);
    return;
  }
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

// The language was changed in another window (main window <-> floating HUD): follow it.
window.addEventListener("storage", (e) => {
  if (e.key !== "riftwatch_settings") return;
  try {
    if (JSON.parse(e.newValue || "{}").language !== startLanguage) window.location.reload();
  } catch {
    /* ignore */
  }
});
