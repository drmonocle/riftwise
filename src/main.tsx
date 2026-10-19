import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { IS_WEB } from "./platform";
import { loadSettings } from "./api";
import { initI18n } from "./i18n";
import { installWheelSideScroll } from "./wheelScroll";
import { applyTheme } from "./theme";
import { autoMove, importMovedSettings } from "./move";
import { STARTED_ON_HUB, currentHubRoute } from "./hub/route";
import { prefetch } from "./stats";
import { preloadDDragon } from "./hub/ddragon";

// Settings brought over from lolworlds.com/riftwise (#import=...) are saved before anything reads them;
// a browser's first visit to riftwise.gg goes and fetches them (the page reloads, so nothing starts here).
importMovedSettings();
const leaving = autoMove();

// Colours first, so the page never flashes the wrong theme
applyTheme(loadSettings().theme);
installWheelSideScroll();

// The pass-through service worker: offline page, alerts, and what lets browsers offer "Add to Home Screen"
if (IS_WEB && !leaving && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

// Opened at a stats page (a shared link to a player, a team, a match...): start on the stats code and the page's
// own data file now, alongside the language file, instead of one after the other once the app has drawn. The
// page then finds them already on their way (same module, same file cache). On a slow phone connection each of
// those waits is a round trip of up to half a second, plus the download.
const HUB_FILE_DIR: Partial<Record<string, string>> = { player: "player", team: "team", event: "event", match: "game", champ: "champ" };
let picturePage = false; // a page that shows champion pictures straight away
if (IS_WEB && !leaving && STARTED_ON_HUB) {
  import("./components/views/StatsView").catch(() => {}); // a failure shows (and retries) where the page loads it
  const r = currentHubRoute();
  const dir = HUB_FILE_DIR[r.kind];
  prefetch(["meta.json", "hub/meta.json", ...(dir && "slug" in r ? [`hub/${dir}/${r.slug}.json`] : [])]);
  picturePage = !!dir;
}

// The language is loaded before the first render, so every screen can simply call tl().
const startLanguage = loadSettings().language;
// riftwise.gg/overlay: the stream overlay instead of the app (an OBS browser source)
const overlay = IS_WEB && /^\/overlay\/?$/.test(window.location.pathname);
if (!leaving) {
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
}

// The language was changed in another window (main window <-> floating HUD): follow it.
window.addEventListener("storage", (e) => {
  if (e.key !== "riftwatch_settings") return;
  try {
    if (JSON.parse(e.newValue || "{}").language !== startLanguage) window.location.reload();
  } catch {
    /* ignore */
  }
});
