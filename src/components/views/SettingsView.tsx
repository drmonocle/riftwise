import React, { useState } from "react";
import { AppSettings, CatalogData, AppUpdateInfo } from "../../types";
import {
  Monitor,
  Bell,
  Minimize2,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  FolderOpen,
  Heart,
  Check,
  AlertTriangle,
  Languages,
  Globe,
  Radio,
  Database,
  Sparkles,
  Download,
  Volume2,
  Keyboard,
} from "lucide-react";
import { APP_VERSION } from "../../version";
import { DEFAULT_FOLLOWED_REGIONS, DEFAULT_FOLLOWED_LEAGUES } from "../../api";
import { playKickoffChime } from "../../helpers";
import {
  IS_DESKTOP,
  IS_WEB,
  RIOT_LEGAL_NOTICE,
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_RELEASES_URL,
  DESKTOP_CHECKSUM_URL,
} from "../../platform";
import { tl, locale, LANGUAGES, TRANSLATION_EMAIL, TRANSLATION_MAILTO, detectLanguage } from "../../i18n";
import { PushAlertsCard } from "../PushAlerts";

interface SettingsViewProps {
  settings: AppSettings;
  catalog?: CatalogData;
  onUpdateSettings: (s: Partial<AppSettings>) => void;
  onOpenUrl: (url: string) => void;
  onRefreshCatalog?: () => Promise<void>;
  updateInfo?: AppUpdateInfo | null;
  onCheckForUpdate?: () => Promise<void>;
  isCheckingUpdate?: boolean;
  /** Result of the most recent update check, so the button visibly did something. */
  lastUpdateCheck?: { at: number; error: string | null } | null;
}

/** Release notes are written in Markdown; show them as plain readable text. */
function plainNotes(md: string): string {
  return md
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^\s*[-*]\s+/, "• "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  catalog,
  onUpdateSettings,
  onOpenUrl,
  onRefreshCatalog,
  updateInfo,
  onCheckForUpdate,
  isCheckingUpdate = false,
  lastUpdateCheck,
}) => {
  const [cacheCleared, setCacheCleared] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const handleInstallUpdate = async () => {
    if (!updateInfo?.downloadUrl) return;
    setIsInstallingUpdate(true);
    setInstallError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("apply_app_update", {
        downloadUrl: updateInfo.downloadUrl,
        checksumUrl: updateInfo.checksumUrl,
      });
    } catch (err: any) {
      setIsInstallingUpdate(false);
      setInstallError(typeof err === "string" ? err : err?.message || tl("Failed to download update."));
    }
  };

  const handleClearCache = () => {
    localStorage.removeItem("riftwatch_settings");
    localStorage.removeItem("riftwatch_catalog");
    localStorage.removeItem("riftwatch_has_launched");
    setCacheCleared(true);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  const handleResetWatchlist = () => {
    onUpdateSettings({
      followedTeams: [],
      followedPlayers: [],
      followedLeagues: [...DEFAULT_FOLLOWED_LEAGUES],
      followedRegions: [...DEFAULT_FOLLOWED_REGIONS],
    });
  };

  return (
    <div className="p-4 space-y-6 page-4xl overflow-y-auto h-full select-none text-xs">
      {/* 0. App Version & Software Updates (desktop app only) */}
      {IS_DESKTOP && (
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#0ac8b9]" />
            {tl("Software Updates")}
          </span>
          <span className="text-[11px] font-mono text-[#7e8e9f]">{tl("Current: v{version}", { version: APP_VERSION })}</span>
        </h2>

        <div
          className={`p-4 rounded-lg border transition-all ${
            updateInfo?.hasUpdate
              ? "bg-[#0c1626] border-[#0ac8b9] shadow-lg shadow-[#0ac8b9]/10"
              : "bg-[#0a1420] border-[#1e282d]"
          }`}
        >
          {updateInfo?.hasUpdate ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#0ac8b9] text-[#091428] uppercase tracking-wider animate-pulse">
                      {tl("Update Available")}
                    </span>
                    <span className="font-bold text-sm text-[#f0e6d2]">
                      RiftWatch v{updateInfo.latestVersion}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#c8aa6e] mt-1 font-medium">
                    {updateInfo.releaseName || tl("Release v{version}", { version: updateInfo.latestVersion })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleInstallUpdate}
                    disabled={isInstallingUpdate}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#0ac8b9] hover:bg-[#0ac8b9]/80 text-[#091428] font-bold text-xs transition-colors shadow disabled:opacity-60"
                  >
                    {isInstallingUpdate ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{tl("Updating…")}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>{tl("Update & Restart Now")}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onOpenUrl(updateInfo.releaseUrl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#091428] hover:bg-[#121e2d] border border-[#1e282d] hover:border-[#c8aa6e] text-[#f0e6d2] font-semibold text-xs transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#7e8e9f]" />
                    <span>{tl("Notes")}</span>
                  </button>
                </div>
              </div>

              {isInstallingUpdate && (
                <div className="p-2.5 rounded bg-[#091428] border border-[#0ac8b9]/40 text-[#0ac8b9] text-xs flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{tl("Downloading latest release binary and replacing executable… RiftWatch will reopen automatically.")}</span>
                </div>
              )}

              {installError && (
                <div className="p-2.5 rounded bg-[#1e131d] border border-[#e84057]/40 text-[#e84057] text-xs flex items-center justify-between gap-2">
                  <span>{installError}</span>
                  <button
                    onClick={() => onOpenUrl(updateInfo.releaseUrl)}
                    className="underline text-[11px] hover:text-white"
                  >
                    {tl("Download manually")}
                  </button>
                </div>
              )}

              {updateInfo.releaseNotes && (
                <div className="p-3 rounded bg-[#091428] border border-[#1e282d] text-[11px] text-[#9bb3c9] max-h-32 overflow-y-auto whitespace-pre-line leading-relaxed">
                  {plainNotes(updateInfo.releaseNotes)}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {lastUpdateCheck?.error && !isCheckingUpdate ? (
                    // The check failed, so we can't say whether this is the newest version
                    <>
                      <AlertTriangle className="w-4 h-4 text-[#c8aa6e]" />
                      <span className="font-semibold text-[#f0e6d2] text-xs">
                        Couldn't check for updates · you have v{APP_VERSION}
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-[#0ac8b9]" />
                      <span className="font-semibold text-[#f0e6d2] text-xs">
                        {tl("RiftWatch is up to date (v{version})", { version: APP_VERSION })}
                      </span>
                    </>
                  )}
                </div>
                <div
                  className={`text-[11px] mt-0.5 ml-6 ${lastUpdateCheck?.error ? "text-[#e84057]" : "text-[#7e8e9f]"}`}
                  role="status"
                >
                  {isCheckingUpdate
                    ? tl("Checking GitHub for a newer release…")
                    : lastUpdateCheck?.error
                      ? `${lastUpdateCheck.error} ${tl("Check your internet connection and try again.")}`
                      : lastUpdateCheck
                        ? tl("Checked at {time} · latest release is v{version}", { time: new Date(lastUpdateCheck.at).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }), version: updateInfo?.latestVersion || APP_VERSION })
                        : tl("Updates are checked automatically a few seconds after launch.")}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onCheckForUpdate?.()}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded bg-[#091428] hover:bg-[#121e2d] border border-[#1e282d] hover:border-[#c8aa6e] text-[#f0e6d2] font-semibold text-xs transition-colors disabled:opacity-50"
                  title={tl("Check GitHub Releases for new updates")}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? "animate-spin text-[#c8aa6e]" : ""}`} />
                  <span>{isCheckingUpdate ? tl("Checking…") : tl("Check for Updates")}</span>
                </button>

                <button
                  onClick={() => onOpenUrl("https://github.com/drmonocle/riftwatch/releases")}
                  className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded bg-[#091428] hover:bg-[#121e2d] border border-[#1e282d] text-[#7e8e9f] hover:text-[#f0e6d2] text-xs transition-colors"
                  title={tl("View all releases on GitHub")}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{tl("All Releases")}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      )}

      {/* 0b. Web version: offer the Windows app (served by GitHub, not this server) */}
      {IS_WEB && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-[#0ac8b9]" />
            {tl("RiftWatch for Windows")}
          </h2>
          <div className="p-4 rounded-lg border border-[#1e282d] bg-[#0a1420] space-y-3">
            <p className="text-[#9bb3c9] text-xs leading-relaxed">
              {tl("The desktop app adds a floating always-on-top ticker, a system tray icon, a global hotkey (Alt+Shift+L), kickoff notifications and automatic updates. It is free, about 4 MB, and needs no installer.")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={DESKTOP_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#c8aa6e] hover:bg-[#f0e6d2] text-[#091428] font-bold text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{tl("Download RiftWatch.exe")}</span>
              </a>
              <a
                href={DESKTOP_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#091428] hover:bg-[#121e2d] border border-[#1e282d] hover:border-[#c8aa6e] text-[#f0e6d2] font-semibold text-xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#7e8e9f]" />
                <span>{tl("Release notes")}</span>
              </a>
              <a
                href={DESKTOP_CHECKSUM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#7e8e9f] hover:text-[#c8aa6e] underline"
              >
                {tl("SHA-256 checksum")}
              </a>
            </div>
            <p className="text-[11px] text-[#7e8e9f] leading-relaxed">
              {tl("Windows 10 or 11. RiftWatch isn't code-signed yet, so Windows SmartScreen may say \"Windows protected your PC\": click More info, then Run anyway. The download comes straight from GitHub.")}
            </p>
            <p className="text-[11px] text-[#7e8e9f] leading-relaxed">
              {tl("Each release lists the SHA-256 checksum of the file, so you can check your download matches.")}
            </p>
          </div>
        </section>
      )}
      {/* Language: names in their own language; the help line is in the language now on screen */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
          <Languages className="w-3.5 h-3.5 text-[#0ac8b9]" />
          {tl("Language")}
        </h2>
        <div className="p-3 rounded-lg bg-[#0a1420] border border-[#1e282d] space-y-2">
          <select
            value={settings.language}
            onChange={(e) => {
              onUpdateSettings({ language: e.target.value as AppSettings["language"] });
              // Every screen reads its text once, so load the new language with a quick reload
              window.setTimeout(() => window.location.reload(), 150);
            }}
            aria-label={tl("Language")}
            className="w-full sm:w-auto bg-[#091428] border border-[#1e282d] rounded-lg px-3 py-2 text-sm text-[#f0e6d2]"
          >
            <option value="auto">
              {tl("Automatic")} ({LANGUAGES.find((l) => l.code === detectLanguage())?.name})
            </option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[#9bb3c9] leading-relaxed">
            {tl("Is this language wrong? Email me:")}{" "}
            <a
              href={TRANSLATION_MAILTO()}
              onClick={(e) => {
                if (IS_DESKTOP) {
                  e.preventDefault();
                  onOpenUrl(TRANSLATION_MAILTO());
                }
              }}
              className="text-[#0ac8b9] underline"
            >
              {TRANSLATION_EMAIL}
            </a>
          </p>
        </div>
      </section>

      {/* 1. Display & Live Ticker Bar */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
          <Monitor className="w-3.5 h-3.5 text-[#0ac8b9]" />
          {tl("Display & Live Ticker Bar")}
        </h2>

        <div className="space-y-2">
          {/* Spoiler Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Spoiler Mode")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Hide all match scores, game results, and in-game statistics until manually revealed.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ spoilerMode: !settings.spoilerMode })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.spoilerMode
                  ? "bg-[#0ac8b9] text-[#091428]"
                  : "bg-[#1e282d] text-[#7e8e9f] hover:text-[#f0e6d2]"
              }`}
            >
              {settings.spoilerMode ? tl("ON") : tl("OFF")}
            </button>
          </div>

          {/* Live Ticker Mode Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Live Ticker Bar Mode")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Display real-time scores, countdowns, and 24/7 stream highlights.")}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-[#091428] p-1 rounded border border-[#1e282d]">
              {(IS_DESKTOP ? (["docked", "detached", "hidden"] as const) : (["docked", "hidden"] as const)).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    onUpdateSettings({ tickerMode: mode });
                    import("@tauri-apps/api/core").then(({ invoke }) => {
                      if (mode === "detached") {
                        invoke("show_ticker").catch(() => {});
                      } else {
                        invoke("hide_ticker").catch(() => {});
                      }
                    }).catch(() => {});
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-all ${
                    settings.tickerMode === mode
                      ? "bg-[#c8aa6e] text-[#091428]"
                      : "text-[#7e8e9f] hover:text-[#f0e6d2]"
                  }`}
                >
                  {mode === "detached" ? "⧉ " + tl("Detached HUD") : mode === "docked" ? tl("Docked") : tl("Hidden")}
                </button>
              ))}
            </div>
          </div>

          {/* Detached Pin Always on Top */}
          {IS_DESKTOP && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Detached Ticker Always on Top")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Keep the floating desktop HUD bar pinned above full-screen games and browser windows.")}
              </div>
            </div>
            <button
              onClick={() => {
                const nextVal = !settings.tickerTopmost;
                onUpdateSettings({ tickerTopmost: nextVal });
                import("@tauri-apps/api/core").then(({ invoke }) => {
                  invoke("set_ticker_topmost", { topmost: nextVal }).catch(() => {});
                }).catch(() => {});
              }}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.tickerTopmost
                  ? "bg-[#0ac8b9] text-[#091428]"
                  : "bg-[#1e282d] text-[#7e8e9f] hover:text-[#f0e6d2]"
              }`}
            >
              {settings.tickerTopmost ? tl("ON") : tl("OFF")}
            </button>
          </div>
          )}

          {/* Ticker Rotation Speed */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Ticker Rotation Interval")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("How long each match or highlight stays visible on the ribbon before rotating.")}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-[#091428] p-1 rounded border border-[#1e282d]">
              {[3, 5, 8, 12].map((sec) => (
                <button
                  key={sec}
                  onClick={() => onUpdateSettings({ tickerCycleSec: sec })}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                    (settings.tickerCycleSec || 5) === sec
                      ? "bg-[#0ac8b9] text-[#091428]"
                      : "text-[#7e8e9f] hover:text-[#f0e6d2]"
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Default Tab on Launch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Default Tab on Launch")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Choose which view opens automatically when starting RiftWatch.")}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-[#091428] p-1 rounded border border-[#1e282d]">
              {(["live", "schedule", "stats", "stream", "watchlist"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onUpdateSettings({ defaultTab: t })}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                    settings.defaultTab === t
                      ? "bg-[#c8aa6e] text-[#091428]"
                      : "text-[#7e8e9f] hover:text-[#f0e6d2]"
                  }`}
                >
                  {
                    { live: tl("Live"), schedule: tl("Schedule"), stats: tl("Stats"), stream: tl("24/7 Stream"), watchlist: tl("Watchlist") }[t]
                  }
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Desktop Notifications & Sound Alerts */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-[#0ac8b9]" />
          {IS_DESKTOP ? tl("Desktop Notifications & Sound Alerts") : tl("Alerts & Sound")}
        </h2>

        <div className="space-y-2">
          {!IS_DESKTOP && <PushAlertsCard settings={settings} onUpdateSettings={onUpdateSettings} />}
          {/* Kickoff Audio Chime */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2] flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#0ac8b9]" />
                <span>{tl("Kickoff Hextech Audio Chime")}</span>
              </div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Synthesize a rich LoL-style hextech harmonic chime when a followed match begins. (0 KB assets)")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => playKickoffChime()}
                className="px-2.5 py-1 rounded bg-[#091428] hover:bg-[#121e2d] border border-[#1e282d] hover:border-[#c8aa6e] text-[#c8aa6e] font-semibold text-xs transition-colors flex items-center gap-1"
                title={tl("Play a test sample of the procedural hextech chime")}
              >
                <Volume2 className="w-3 h-3" />
                <span>{tl("Test Sound")}</span>
              </button>
              <button
                onClick={() => onUpdateSettings({ soundAlerts: !settings.soundAlerts })}
                className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                  settings.soundAlerts ? "bg-[#0ac8b9] text-[#091428]" : "bg-[#1e282d] text-[#7e8e9f]"
                }`}
              >
                {settings.soundAlerts ? tl("ON") : tl("OFF")}
              </button>
            </div>
          </div>

          {IS_DESKTOP && (<>
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Live Kickoff Desktop Alerts")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Display desktop notifications when followed teams or players begin a match.")}{" "}
                <button
                  type="button"
                  onClick={() =>
                    import("@tauri-apps/api/core").then(({ invoke }) =>
                      invoke("send_notification", {
                        title: tl("RiftWatch test alert"),
                        body: tl("Alerts work. You'll get one like this when a team you follow starts a match."),
                      }).catch(() => {}),
                    )
                  }
                  className="text-[#0ac8b9] hover:underline"
                >
                  {tl("Send a test alert")}
                </button>
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ notifyKickoff: !settings.notifyKickoff })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.notifyKickoff ? "bg-[#0ac8b9] text-[#091428]" : "bg-[#1e282d] text-[#7e8e9f]"
              }`}
            >
              {settings.notifyKickoff ? tl("ON") : tl("OFF")}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Pre-match 15m Countdown")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Display a reminder notification 15 minutes before your followed pro matches go live.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ notifyPregame: !settings.notifyPregame })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.notifyPregame ? "bg-[#0ac8b9] text-[#091428]" : "bg-[#1e282d] text-[#7e8e9f]"
              }`}
            >
              {settings.notifyPregame ? tl("ON") : tl("OFF")}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("24/7 Stream & S-Tier Banger Alerts")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Notify when S-Tier legendary marathon games begin on Twitch and YouTube.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ notifyStream: !settings.notifyStream })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.notifyStream ? "bg-[#0ac8b9] text-[#091428]" : "bg-[#1e282d] text-[#7e8e9f]"
              }`}
            >
              {settings.notifyStream ? tl("ON") : tl("OFF")}
            </button>
          </div>
          </>)}
        </div>
      </section>

      {/* 3. System Tray, Ergonomics & Startup (desktop app only) */}
      {IS_DESKTOP && (
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
          <Minimize2 className="w-3.5 h-3.5 text-[#0ac8b9]" />
          {tl("System Tray, Ergonomics & Hotkeys")}
        </h2>

        <div className="space-y-2">
          {/* Global Summon Hotkey */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#0ac8b9]/40 shadow-sm">
            <div>
              <div className="font-semibold text-[#f0e6d2] flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5 text-[#0ac8b9]" />
                <span>{tl("Global Summon Hotkey")}</span>
              </div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Summon or hide RiftWatch instantly from anywhere in Windows (even inside full-screen games or browser).")}
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-[#091428] border border-[#0ac8b9]/60 text-[#0ac8b9] font-mono font-bold text-xs tracking-wider">
              {tl("Alt + Shift + L")}
            </span>
          </div>

          {/* Compact Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Compact Desktop Mode")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Fit RiftWatch into a tight, distraction-free mini window for second monitors or split-screen gaming.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ compactMode: !settings.compactMode })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.compactMode ? "bg-[#0ac8b9] text-[#091428]" : "bg-[#1e282d] text-[#7e8e9f]"
              }`}
            >
              {settings.compactMode ? tl("ON") : tl("OFF")}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Close Button Minimizes to System Tray")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Keep RiftWatch running silently in the Windows notification area when you click the window X button.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ minimizeToTrayOnClose: !settings.minimizeToTrayOnClose })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.minimizeToTrayOnClose
                  ? "bg-[#0ac8b9] text-[#091428]"
                  : "bg-[#1e282d] text-[#7e8e9f]"
              }`}
            >
              {settings.minimizeToTrayOnClose ? tl("ON") : tl("OFF")}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a1420] border border-[#1e282d]">
            <div>
              <div className="font-semibold text-[#f0e6d2]">{tl("Start RiftWatch with Windows")}</div>
              <div className="text-[11px] text-[#7e8e9f]">
                {tl("Launch automatically in the background when you sign in to Windows.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ startWithWindows: !settings.startWithWindows })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.startWithWindows ? "bg-[#0ac8b9] text-[#091428]" : "bg-[#1e282d] text-[#7e8e9f]"
              }`}
            >
              {settings.startWithWindows ? tl("ON") : tl("OFF")}
            </button>
          </div>
        </div>
      </section>
      )}

      {/* 4. Watchlist Management */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-[#c8aa6e]" />
          {tl("Watchlist & Following Status")}
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-[#0a1420] border border-[#1e282d]">
          <div>
            <div className="font-bold text-[#f0e6d2] text-xs">{tl("Active Tracked Entities")}</div>
            <div className="text-[11px] text-[#c8aa6e] mt-0.5">
              {tl("{teams} teams · {players} players · {regions} regions · {leagues} leagues", {
                teams: settings.followedTeams.length,
                players: settings.followedPlayers.length,
                regions: settings.followedRegions.length,
                leagues: settings.followedLeagues.length,
              })}
            </div>
          </div>
          <button
            onClick={handleResetWatchlist}
            className="px-3 py-1.5 rounded bg-[#091428] border border-[#e84057]/40 text-[#e84057] hover:bg-[#e84057] hover:text-white font-semibold text-xs transition-colors"
          >
            {tl("Reset All Follows")}
          </button>
        </div>
      </section>

      {/* 5. 24/7 Stream Rebroadcasts */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-[#0ac8b9]" />
          {tl("24/7 Stream Rebroadcasts (Twitch & YouTube)")}
        </h2>

        <div className="p-3.5 rounded-lg bg-[#0a1420] border border-[#1e282d] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-bold text-[#0ac8b9] text-xs">
                {tl("Twitch: twitch.tv/LoLWorldChampionship · YouTube: @LoLWorldChampionships")}
              </div>
              <div className="text-[11px] text-[#7e8e9f] mt-0.5">
                {tl("Continuous curated tournament broadcast marathon synced with lolworlds.com.")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenUrl("https://www.twitch.tv/LoLWorldChampionship")}
                className="px-3 py-1 rounded bg-[#9146ff] hover:bg-[#a970ff] text-white font-bold text-xs transition-colors"
              >
                {tl("Twitch ↗")}
              </button>
              <button
                onClick={() => onOpenUrl("https://www.youtube.com/@LoLWorldChampionships/live")}
                className="px-3 py-1 rounded bg-[#cc0000] hover:bg-[#e60000] text-white font-bold text-xs transition-colors"
              >
                {tl("YouTube ↗")}
              </button>
              <button
                onClick={() => onOpenUrl("https://lolworlds.com")}
                className="px-3 py-1 rounded bg-[#091428] border border-[#1e282d] text-[#7e8e9f] hover:text-[#f0e6d2] font-semibold text-xs transition-colors"
              >
                {tl("Schedule ↗")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Data Sources & Storage Diagnostics */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 text-[#0ac8b9]" />
          {tl("Data Sources & Diagnostics")}
        </h2>

        <div className="grid gap-1.5">
          {[
            { name: tl("LoL Esports Schedule Feed"), endpoint: "esports-api.lolesports.com/getSchedule" },
            { name: tl("Live Game State Feed"), endpoint: "esports-api.lolesports.com/getLive" },
            { name: tl("24/7 Stream Marathon Schedule"), endpoint: "lolworlds.com/api.ashx?type=schedule-json" },
            { name: tl("Global Teams & Rosters Directory"), endpoint: "esports-api.lolesports.com/getTeams" },
          ].map((ds) => (
            <div
              key={ds.name}
              className="flex items-center justify-between p-2.5 rounded bg-[#0a1420] border border-[#1e282d] text-[11px]"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#0ac8b9]" />
                <span className="text-[#f0e6d2] font-medium">{ds.name}</span>
              </div>
              <span className="text-[#7e8e9f] font-mono text-[10px]">{ds.endpoint}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {onRefreshCatalog && (
            <button
              onClick={async () => {
                setIsSyncingCatalog(true);
                try {
                  await onRefreshCatalog();
                  setSyncSuccess(true);
                  setTimeout(() => setSyncSuccess(false), 2500);
                } catch {
                } finally {
                  setIsSyncingCatalog(false);
                }
              }}
              disabled={isSyncingCatalog}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0a1420] border border-[#1e282d] hover:border-[#0ac8b9] text-[#f0e6d2] hover:text-[#0ac8b9] transition-colors text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCatalog ? "animate-spin text-[#0ac8b9]" : ""}`} />
              <span>
                {isSyncingCatalog
                  ? tl("Syncing global teams & rosters…")
                  : syncSuccess
                  ? tl("Catalog updated!")
                  : tl("Sync directory ({teams} teams, {players} players)", { teams: catalog?.teams.length || 778, players: catalog?.players.length || 4634 })}
              </span>
            </button>
          )}

          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0a1420] border border-[#1e282d] hover:border-[#e84057] text-[#7e8e9f] hover:text-[#e84057] transition-colors text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{cacheCleared ? tl("Cache cleared!") : tl("Clear cache")}</span>
          </button>
        </div>
      </section>

      {/* 7. Support & About */}
      <section className="p-4 rounded-lg bg-[#0a1420] border border-[#720e9e]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="font-bold text-[#f0e6d2] flex items-center gap-1.5 text-sm">
            <Heart className="w-4 h-4 text-[#ff4655] fill-current" />
            {tl("Support RiftWatch")}
          </div>
          <div className="text-[11px] text-[#7e8e9f] mt-0.5">
            {tl("RiftWatch is 100% free and open-source. Help fund 24/7 broadcast servers and active development.")}
          </div>
        </div>
        <button
          onClick={() => onOpenUrl("https://ko-fi.com/monocle")}
          className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#720e9e] hover:bg-[#8c19bd] text-white font-bold text-xs transition-colors shrink-0"
        >
          <span>{tl("Support on Ko-fi")}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </section>

      {/* Footer */}
      <footer className="pt-2 text-[11px] text-[#7e8e9f] space-y-1">
        <div className="flex items-center justify-between">
          <div>
            {IS_DESKTOP ? `RiftWatch Desktop v${APP_VERSION} · Rust & WebView2` : `RiftWatch Web v${APP_VERSION}`} · {tl("MIT License")}
          </div>
          <button
            onClick={() => onOpenUrl("https://github.com/drmonocle/riftwatch")}
            className="hover:text-[#c8aa6e] underline"
          >
            {tl("GitHub Repository ↗")}
          </button>
        </div>
        <div className="text-[10px] text-[#536675]">
          {RIOT_LEGAL_NOTICE}
        </div>
      </footer>
    </div>
  );
};
