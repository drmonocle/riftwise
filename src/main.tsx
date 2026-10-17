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

// The language is loaded before the first render, so every screen can simply call tl().
const startLanguage = loadSettings().language;
if (!leaving) {
  initI18n(startLanguage).finally(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
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
