import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { IS_WEB } from "./platform";
import { loadSettings } from "./api";
import { initI18n } from "./i18n";
import { installWheelSideScroll } from "./wheelScroll";
import { applyTheme } from "./theme";

// Colours first, so the page never flashes the wrong theme
applyTheme(loadSettings().theme);
installWheelSideScroll();

// On lolworlds.com the site-wide service worker serves every request cache-first, which would
// show stale live scores. /riftwise/sw.js is a pass-through worker whose narrower scope wins.
if (IS_WEB && "serviceWorker" in navigator && window.location.pathname.startsWith("/riftwise")) {
  navigator.serviceWorker.register("/riftwise/sw.js", { scope: "/riftwise/" }).catch(() => {});
}

// The language is loaded before the first render, so every screen can simply call tl().
const startLanguage = loadSettings().language;
initI18n(startLanguage).finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
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
