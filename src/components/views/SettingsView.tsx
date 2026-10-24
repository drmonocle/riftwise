import React, { useState } from "react";
import { THEMES, DEFAULT_THEME } from "../../theme";
import { AppSettings, CatalogData, AppUpdateInfo } from "../../types";
import {
  Trash2,
  RefreshCw,
  ExternalLink,
  Heart,
  Check,
  AlertTriangle,
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
import { langAddress } from "../../hub/route";
import { PushAlertsCard } from "../PushAlerts";
import { SyncPanel } from "../SyncPanel";

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
    <div className="p-4 space-y-6 page-4xl rw-capped overflow-y-auto h-full select-none text-xs">
      {/* 0. App Version & Software Updates (desktop app only) */}
      {IS_DESKTOP && (
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-rw-teal" />
            {tl("Software Updates")}
          </span>
          <span className="text-[11px] font-mono text-rw-muted">{tl("Current: v{version}", { version: APP_VERSION })}</span>
        </h2>

        <div
          className={`p-4 rounded-lg border transition-all ${
            updateInfo?.hasUpdate
              ? "bg-rw-surface border-rw-teal shadow-lg shadow-rw-teal/10"
              : "bg-rw-surface border-rw-border"
          }`}
        >
          {updateInfo?.hasUpdate ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rw-teal text-rw-bg uppercase tracking-wider animate-pulse">
                      {tl("Update Available")}
                    </span>
                    <span className="font-bold text-sm text-rw-text">
                      RiftWise v{updateInfo.latestVersion}
                    </span>
                  </div>
                  <div className="text-[11px] text-rw-accent mt-1 font-medium">
                    {updateInfo.releaseName || tl("Release v{version}", { version: updateInfo.latestVersion })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleInstallUpdate}
                    disabled={isInstallingUpdate}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-rw-teal hover:bg-rw-teal/80 text-rw-bg font-bold text-xs transition-colors shadow disabled:opacity-60"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rw-bg hover:bg-rw-raised border border-rw-border hover:border-rw-accent text-rw-text font-semibold text-xs transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-rw-muted" />
                    <span>{tl("Notes")}</span>
                  </button>
                </div>
              </div>

              {isInstallingUpdate && (
                <div className="p-2.5 rounded bg-rw-bg border border-rw-teal/40 text-rw-teal text-xs flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{tl("Downloading latest release binary and replacing executable… RiftWise will reopen automatically.")}</span>
                </div>
              )}

              {installError && (
                <div className="p-2.5 rounded bg-rw-red/10 border border-rw-red/40 text-rw-red text-xs flex items-center justify-between gap-2">
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
                <div className="p-3 rounded bg-rw-bg border border-rw-border text-[11px] text-rw-sub max-h-32 overflow-y-auto whitespace-pre-line leading-relaxed">
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
                      <AlertTriangle className="w-4 h-4 text-rw-accent" />
                      <span className="font-semibold text-rw-text text-xs">
                        {tl("Couldn't check for updates · you have v{version}", { version: APP_VERSION })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-rw-teal" />
                      <span className="font-semibold text-rw-text text-xs">
                        {tl("RiftWise is up to date (v{version})", { version: APP_VERSION })}
                      </span>
                    </>
                  )}
                </div>
                <div
                  className={`text-[11px] mt-0.5 ml-6 ${lastUpdateCheck?.error ? "text-rw-red" : "text-rw-muted"}`}
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
                  className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded bg-rw-bg hover:bg-rw-raised border border-rw-border hover:border-rw-accent text-rw-text font-semibold text-xs transition-colors disabled:opacity-50"
                  title={tl("Check GitHub Releases for new updates")}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? "animate-spin text-rw-accent" : ""}`} />
                  <span>{isCheckingUpdate ? tl("Checking…") : tl("Check for Updates")}</span>
                </button>

                <button
                  onClick={() => onOpenUrl("https://github.com/drmonocle/riftwise/releases")}
                  className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded bg-rw-bg hover:bg-rw-raised border border-rw-border text-rw-muted hover:text-rw-text text-xs transition-colors"
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
          <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
            {tl("RiftWise for Windows")}
          </h2>
          <div className="p-4 rounded-lg border border-rw-border bg-rw-surface space-y-3">
            <p className="text-rw-sub text-xs leading-relaxed">
              {tl("The desktop app adds a system tray icon, a global hotkey (Alt+Shift+L), kickoff notifications and automatic updates. It is free, about 5 MB, and needs no installer.")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={DESKTOP_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{tl("Download RiftWise.exe")}</span>
              </a>
              <a
                href={DESKTOP_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rw-bg hover:bg-rw-raised border border-rw-border hover:border-rw-accent text-rw-text font-semibold text-xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-rw-muted" />
                <span>{tl("Release notes")}</span>
              </a>
              <a
                href={DESKTOP_CHECKSUM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-rw-muted hover:text-rw-accent underline"
              >
                {tl("SHA-256 checksum")}
              </a>
            </div>
            <p className="text-[11px] text-rw-muted leading-relaxed">
              {tl("Windows 10 or 11. RiftWise isn't code-signed yet, so Windows SmartScreen may say \"Windows protected your PC\": click More info, then Run anyway. The download comes straight from GitHub.")}
            </p>
            <p className="text-[11px] text-rw-muted leading-relaxed">
              {tl("Each release lists the SHA-256 checksum of the file, so you can check your download matches.")}
            </p>
          </div>
        </section>
      )}
      {/* Language: names in their own language; the help line is in the language now on screen */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
          {tl("Language")}
        </h2>
        <div className="p-3 rounded-lg bg-rw-surface border border-rw-border space-y-2">
          <select
            value={settings.language}
            onChange={(e) => {
              onUpdateSettings({ language: e.target.value as AppSettings["language"] });
              // Every screen reads its text once, so load the new language with a quick reload (on the web at the page's
              // address in that language: riftwise.gg/ko/...; Automatic goes back to the plain address)
              const code = e.target.value;
              window.setTimeout(() => (IS_WEB ? window.location.assign(langAddress(code)) : window.location.reload()), 150);
            }}
            aria-label={tl("Language")}
            className="w-full sm:w-auto bg-rw-bg border border-rw-border rounded-lg px-3 py-2 text-sm text-rw-text"
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
          <p className="text-[11px] text-rw-sub leading-relaxed">
            {tl("Is this language wrong? Email me:")}{" "}
            <a
              href={TRANSLATION_MAILTO()}
              onClick={(e) => {
                if (IS_DESKTOP) {
                  e.preventDefault();
                  onOpenUrl(TRANSLATION_MAILTO());
                }
              }}
              className="text-rw-teal underline"
            >
              {TRANSLATION_EMAIL}
            </a>
          </p>
        </div>
      </section>

      {/* Cloud sync (optional account) */}
      <SyncPanel onOpenUrl={onOpenUrl} />

      {/* 1. Display */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
          {tl("Display")}
        </h2>

        <div className="space-y-2">
          {/* Theme */}
          <div className="p-3 rounded-lg bg-rw-surface border border-rw-border space-y-2">
            <div>
              <div className="font-semibold text-rw-text">{tl("Theme")}</div>
              <div className="text-[11px] text-rw-muted">{tl("Pick the colours for RiftWise.")}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {THEMES.map((th) => {
                const on = (settings.theme || DEFAULT_THEME) === th.id;
                const name = {
                  rift: tl("Rift"),
                  classic: tl("Classic"),
                  midnight: tl("Midnight"),
                  light: tl("Light"),
                  // team names stay as they are in every language
                  tsm: "TSM",
                  flyquest: "FlyQuest",
                  t1: "T1",
                }[th.id];
                const about = {
                  rift: tl("Deep indigo with a soft violet, like the Rift Herald"),
                  classic: tl("The original navy and Hextech gold"),
                  midnight: tl("Graphite with a cool blue"),
                  light: tl("A pale background with deep violet, for daylight and printing"),
                  tsm: tl("TSM's black and white, with a steel blue"),
                  flyquest: tl("FlyQuest green on near-black"),
                  t1: tl("T1 red on black, with championship gold"),
                }[th.id];
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: th.id })}
                    aria-pressed={on}
                    className={`text-left rounded-lg border p-2.5 transition-all ${th.id === "light" ? "[&_*]:!text-[#17142b]" : ""} ${
                      on ? "border-rw-accent ring-1 ring-rw-accent/50" : "border-rw-border hover:border-rw-line"
                    }`}
                    style={{ background: `linear-gradient(135deg, ${th.swatch[0]}, ${th.swatch[0]} 55%, ${th.swatch[1]}33)` }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {th.swatch.map((c) => (
                        <span key={c} className="w-3 h-3 rounded-full border border-white/10" style={{ background: c }} />
                      ))}
                      <span className="ml-1 text-xs font-bold" style={{ color: th.swatch[1] }}>
                        {name}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/60 leading-snug">{about}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Spoiler Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text">{tl("Spoiler Mode")}</div>
              <div className="text-[11px] text-rw-muted">
                {tl("Hide all match scores, game results, and in-game statistics until manually revealed.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ spoilerMode: !settings.spoilerMode })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.spoilerMode
                  ? "bg-rw-teal text-rw-bg"
                  : "bg-rw-border text-rw-muted hover:text-rw-text"
              }`}
            >
              {settings.spoilerMode ? tl("ON") : tl("OFF")}
            </button>
          </div>

          {/* Default Tab on Launch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text">{tl("Default Tab on Launch")}</div>
              <div className="text-[11px] text-rw-muted">
                {tl("Choose which view opens automatically when starting RiftWise.")}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-rw-bg p-1 rounded border border-rw-border">
              {(["live", "schedule", "stats", "stream", "watchlist"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onUpdateSettings({ defaultTab: t })}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                    settings.defaultTab === t
                      ? "bg-rw-accent text-rw-bg"
                      : "text-rw-muted hover:text-rw-text"
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
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
          {IS_DESKTOP ? tl("Desktop Notifications & Sound Alerts") : tl("Alerts & Sound")}
        </h2>

        <div className="space-y-2">
          {!IS_DESKTOP && <PushAlertsCard settings={settings} onUpdateSettings={onUpdateSettings} />}
          {/* Kickoff Audio Chime */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-rw-teal" />
                <span>{tl("Kickoff Hextech Audio Chime")}</span>
              </div>
              <div className="text-[11px] text-rw-muted">
                {tl("Plays a short Hextech-style chime when a match you follow starts.")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => playKickoffChime()}
                className="px-2.5 py-1 rounded bg-rw-bg hover:bg-rw-raised border border-rw-border hover:border-rw-accent text-rw-accent font-semibold text-xs transition-colors flex items-center gap-1"
                title={tl("Play a test sample of the procedural hextech chime")}
              >
                <Volume2 className="w-3 h-3" />
                <span>{tl("Test Sound")}</span>
              </button>
              <button
                onClick={() => onUpdateSettings({ soundAlerts: !settings.soundAlerts })}
                className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                  settings.soundAlerts ? "bg-rw-teal text-rw-bg" : "bg-rw-border text-rw-muted"
                }`}
              >
                {settings.soundAlerts ? tl("ON") : tl("OFF")}
              </button>
            </div>
          </div>

          {IS_DESKTOP && (<>
          <div className="flex items-center justify-between p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text">{tl("Live Kickoff Desktop Alerts")}</div>
              <div className="text-[11px] text-rw-muted">
                {tl("Display desktop notifications when followed teams or players begin a match.")}{" "}
                <button
                  type="button"
                  onClick={() =>
                    import("@tauri-apps/api/core").then(({ invoke }) =>
                      invoke("send_notification", {
                        title: tl("RiftWise test alert"),
                        body: tl("Alerts work. You'll get one like this when a team you follow starts a match."),
                      }).catch(() => {}),
                    )
                  }
                  className="text-rw-teal hover:underline"
                >
                  {tl("Send a test alert")}
                </button>
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ notifyKickoff: !settings.notifyKickoff })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.notifyKickoff ? "bg-rw-teal text-rw-bg" : "bg-rw-border text-rw-muted"
              }`}
            >
              {settings.notifyKickoff ? tl("ON") : tl("OFF")}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text">{tl("Pre-match 15m Countdown")}</div>
              <div className="text-[11px] text-rw-muted">
                {tl("Display a reminder notification 15 minutes before your followed pro matches go live.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ notifyPregame: !settings.notifyPregame })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.notifyPregame ? "bg-rw-teal text-rw-bg" : "bg-rw-border text-rw-muted"
              }`}
            >
              {settings.notifyPregame ? tl("ON") : tl("OFF")}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text">{tl("24/7 Stream & S-Tier Banger Alerts")}</div>
              <div className="text-[11px] text-rw-muted">
                {tl("Notify when S-Tier legendary marathon games begin on Twitch and YouTube.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ notifyStream: !settings.notifyStream })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.notifyStream ? "bg-rw-teal text-rw-bg" : "bg-rw-border text-rw-muted"
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
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
          {tl("System Tray, Ergonomics & Hotkeys")}
        </h2>

        <div className="space-y-2">
          {/* Global Summon Hotkey */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-rw-surface border border-rw-teal/40 shadow-sm">
            <div>
              <div className="font-semibold text-rw-text flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5 text-rw-teal" />
                <span>{tl("Global Summon Hotkey")}</span>
              </div>
              <div className="text-[11px] text-rw-muted">
                {tl("Summon or hide RiftWise instantly from anywhere in Windows (even inside full-screen games or browser).")}
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-rw-bg border border-rw-teal/60 text-rw-teal font-mono font-bold text-xs tracking-wider">
              {tl("Alt + Shift + L")}
            </span>
          </div>

          {/* Compact Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text">{tl("Compact Desktop Mode")}</div>
              <div className="text-[11px] text-rw-muted">
                {tl("Fit RiftWise into a tight, distraction-free mini window for second monitors or split-screen gaming.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ compactMode: !settings.compactMode })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.compactMode ? "bg-rw-teal text-rw-bg" : "bg-rw-border text-rw-muted"
              }`}
            >
              {settings.compactMode ? tl("ON") : tl("OFF")}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text">{tl("Close Button Minimizes to System Tray")}</div>
              <div className="text-[11px] text-rw-muted">
                {tl("Keep RiftWise running silently in the Windows notification area when you click the window X button.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ minimizeToTrayOnClose: !settings.minimizeToTrayOnClose })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.minimizeToTrayOnClose
                  ? "bg-rw-teal text-rw-bg"
                  : "bg-rw-border text-rw-muted"
              }`}
            >
              {settings.minimizeToTrayOnClose ? tl("ON") : tl("OFF")}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-rw-surface border border-rw-border">
            <div>
              <div className="font-semibold text-rw-text">{tl("Start RiftWise with Windows")}</div>
              <div className="text-[11px] text-rw-muted">
                {tl("Launch automatically in the background when you sign in to Windows.")}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ startWithWindows: !settings.startWithWindows })}
              className={`px-3 py-1 font-bold rounded text-xs transition-colors ${
                settings.startWithWindows ? "bg-rw-teal text-rw-bg" : "bg-rw-border text-rw-muted"
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
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
          {tl("Watchlist & Following Status")}
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-rw-surface border border-rw-border">
          <div>
            <div className="font-bold text-rw-text text-xs">{tl("What you follow")}</div>
            <div className="text-[11px] text-rw-accent mt-0.5">
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
            className="px-3 py-1.5 rounded bg-rw-bg border border-rw-red/40 text-rw-red hover:bg-rw-red hover:text-white font-semibold text-xs transition-colors"
          >
            {tl("Reset All Follows")}
          </button>
        </div>
      </section>

      {/* 5. 24/7 Stream Rebroadcasts */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
          {tl("24/7 Stream Rebroadcasts (Twitch & YouTube)")}
        </h2>

        <div className="p-3.5 rounded-lg bg-rw-surface border border-rw-border space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-bold text-rw-teal text-xs">
                {tl("Twitch: twitch.tv/LoLWorldChampionship · YouTube: @LoLWorldChampionships")}
              </div>
              <div className="text-[11px] text-rw-muted mt-0.5">
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
                className="px-3 py-1 rounded bg-rw-bg border border-rw-border text-rw-muted hover:text-rw-text font-semibold text-xs transition-colors"
              >
                {tl("Schedule ↗")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Data Sources & Storage Diagnostics */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
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
              className="flex items-center justify-between p-2.5 rounded bg-rw-surface border border-rw-border text-[11px]"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rw-teal" />
                <span className="text-rw-text font-medium">{ds.name}</span>
              </div>
              <span className="text-rw-muted font-mono text-[10px]">{ds.endpoint}</span>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rw-surface border border-rw-border hover:border-rw-teal text-rw-text hover:text-rw-teal transition-colors text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCatalog ? "animate-spin text-rw-teal" : ""}`} />
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rw-surface border border-rw-border hover:border-rw-red text-rw-muted hover:text-rw-red transition-colors text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{cacheCleared ? tl("Cache cleared!") : tl("Clear cache")}</span>
          </button>
        </div>
      </section>

      {/* 7. Support & About */}
      <section className="p-4 rounded-lg bg-rw-surface border border-[#720e9e]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="font-bold text-rw-text flex items-center gap-1.5 text-sm">
            <Heart className="w-4 h-4 text-[#ff4655] fill-current" />
            {tl("Support RiftWise")}
          </div>
          <div className="text-[11px] text-rw-muted mt-0.5">
            {tl("RiftWise is 100% free and open-source. Help fund 24/7 broadcast servers and active development.")}
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
      <footer className="pt-2 text-[11px] text-rw-muted space-y-1">
        <div className="flex items-center justify-between">
          <div>
            {IS_DESKTOP ? `RiftWise Desktop v${APP_VERSION} · Rust & WebView2` : `RiftWise Web v${APP_VERSION}`} · {tl("MIT License")}
          </div>
          <button
            onClick={() => onOpenUrl("https://github.com/drmonocle/riftwise")}
            className="hover:text-rw-accent underline"
          >
            {tl("GitHub Repository ↗")}
          </button>
        </div>
        <div className="text-[10px] text-rw-muted/80">
          {RIOT_LEGAL_NOTICE}
        </div>
      </footer>
    </div>
  );
};
