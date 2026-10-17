import React from "react";
import { AppSettings, Match, StreamEvent, StreamStatus, AppUpdateInfo, LiveShow } from "../types";
import { Radio, RefreshCw, Eye, EyeOff, Heart, Sparkles, Minimize2, Maximize2, Download, Smartphone, Search } from "lucide-react";
import { formatStreamHeaderTitle, streamPhase } from "../helpers";
import { APP_VERSION } from "../version";
import { IS_DESKTOP, IS_WEB, IS_WINDOWS_BROWSER, DESKTOP_DOWNLOAD_URL } from "../platform";
import { tl, tn } from "../i18n";
import { LanguageFlag } from "./LanguageFlag";

interface HeaderProps {
  settings: AppSettings;
  onUpdateSettings: (s: Partial<AppSettings>) => void;
  liveMatches: Match[];
  streamEvents: StreamEvent[];
  streamStatus?: StreamStatus | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSelectTab: (tab: any) => void;
  onOpenUrl: (url: string) => void;
  updateInfo?: AppUpdateInfo | null;
  /** Web only: present when the browser offers to install the page as an app. */
  onInstall?: () => void;
  /** Broadcasts on air with no match in progress (e.g. a delayed start). */
  liveShows?: LiveShow[];
  /** Opens the stats search (teams, players, tournaments, champions). */
  onSearch?: () => void;
}

// Shared look for the small header controls: one line, never wrapping.
const pill = "flex items-center gap-1.5 h-7 px-2.5 rounded text-xs whitespace-nowrap border transition-colors";
const iconBtn = "flex items-center justify-center h-7 w-7 rounded border transition-colors";

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  liveMatches,
  streamEvents,
  streamStatus,
  onRefresh,
  isRefreshing,
  onSelectTab,
  onOpenUrl,
  updateInfo,
  onInstall,
  liveShows = [],
  onSearch,
}) => {
  const hasLive = liveMatches.length > 0;
  const onAir = !hasLive && liveShows.length > 0 ? liveShows[0] : null;
  const firstLive = hasLive ? liveMatches[0] : null;
  const phase = streamPhase(streamEvents, streamStatus);
  const streamInfo =
    phase.kind === "airing"
      ? formatStreamHeaderTitle(phase.current)
      : { title: phase.kind === "break" ? tl("Twitch 24/7: On break") : tl("Twitch 24/7: Back shortly"), isLive: false };
  const extraLive = liveMatches.length > 1 ? ` +${liveMatches.length - 1}` : "";

  return (
    // Three columns: brand + support on the left, the status pills centred, the actions on the right. The side
    // columns share the leftover space equally, so the pills sit in the middle of the window when there's room.
    <header className="rw-header px-3 sm:px-4 py-2 grid grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-3 select-none">
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Brand */}
        <div className="flex items-baseline gap-1.5 cursor-pointer flex-shrink-0" onClick={() => onSelectTab("live")}>
          <span className="rw-logo font-extrabold text-lg tracking-wider">RIFTWISE</span>
          <span className="hidden sm:inline text-rw-muted text-[10px]">v{APP_VERSION}</span>
        </div>

        {/* Support (Ko-fi): "Support ♥", just the heart when space is short */}
        <button
          onClick={() => onOpenUrl("https://ko-fi.com/monocle")}
          className={`${pill} flex-shrink-0 font-semibold bg-[#720e9e] border-[#720e9e] hover:bg-[#8c19bd] text-white`}
          aria-label={tl("Support RiftWise on Ko-fi")}
          title={tl("Support RiftWise development on Ko-fi")}
        >
          <span className="hidden lg:inline">{tl("Support")}</span>
          <Heart className="w-3.5 h-3.5 fill-current" />
        </button>
      </div>

      {/* Status pills, centred: these shrink and truncate instead of wrapping; on phones the Live tab shows the live count */}
      <div className="hidden sm:flex items-center justify-center gap-2 min-w-0 overflow-hidden">
        {updateInfo?.hasUpdate && (
          <button
            onClick={() => onSelectTab("settings")}
            className={`${pill} flex-shrink-0 font-bold bg-rw-teal border-rw-teal text-rw-bg hover:bg-rw-teal/80 animate-pulse`}
            title={tl("New version v{version} available! Click to update.", { version: updateInfo.latestVersion })}
          >
            <Sparkles className="w-3 h-3" />
            <span>{tl("Update v{version}", { version: updateInfo.latestVersion })}</span>
          </button>
        )}

        <button
          onClick={() => onSelectTab("live")}
          className={`${pill} flex-shrink-0 ${
            hasLive
              ? "bg-rw-red/10 border-rw-red text-rw-red font-semibold"
              : onAir
                ? "bg-rw-accent/10 border-rw-accent/70 text-rw-accent font-semibold"
                : "bg-rw-surface border-rw-border text-rw-muted hover:border-rw-accent"
          }`}
          title={
            hasLive
              ? tn("{n} live pro match. Click to view.", "{n} live pro matches. Click to view.", liveMatches.length)
              : onAir
                ? tl("{league} broadcast is on air, no match has started yet", { league: onAir.leagueName })
                : tl("No pro matches live right now")
          }
        >
          <span
            className={`w-2 h-2 rounded-full ${
              hasLive ? "bg-rw-red animate-pulse" : onAir ? "bg-rw-accent animate-pulse" : "bg-rw-muted"
            }`}
          />
          <span>
            {hasLive
              ? tl("LIVE {a} vs {b}", { a: firstLive?.team1Code ?? "", b: firstLive?.team2Code ?? "" }) + extraLive
              : onAir
                ? tl("{league} on air", { league: onAir.leagueName })
                : tl("No live matches")}
          </span>
        </button>

        <button
          onClick={() => onSelectTab("stream")}
          className={`${pill} min-w-0 ${
            streamInfo.isLive
              ? "bg-rw-surface border-rw-teal/60 text-rw-teal hover:border-rw-teal hover:bg-rw-raised"
              : "bg-rw-surface border-rw-border text-rw-muted hover:border-rw-muted"
          }`}
          title={streamInfo.isLive ? tl("{title} · Click to view stream", { title: streamInfo.title }) : phase.kind === "break" ? tl("The 24/7 marathon is on break · Click for details") : tl("Twitch 24/7 Stream is currently offline")}
        >
          <Radio className={`w-3.5 h-3.5 flex-shrink-0 ${streamInfo.isLive ? "text-rw-teal animate-pulse" : ""}`} />
          <span className="font-semibold truncate">{streamInfo.title}</span>
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5 min-w-0 col-start-3">
        <LanguageFlag onUpdateSettings={onUpdateSettings} />
        {onInstall && (
          <button
            onClick={onInstall}
            className={`${pill} font-semibold bg-rw-surface border-rw-teal/60 text-rw-teal hover:bg-rw-raised`}
            aria-label={tl("Install RiftWise on this device")}
            title={tl("Add RiftWise to your home screen or desktop")}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tl("Install")}</span>
          </button>
        )}
        {IS_WEB && IS_WINDOWS_BROWSER && (
          <a
            href={DESKTOP_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${pill} hidden sm:inline-flex font-semibold bg-rw-accent border-rw-accent text-rw-bg hover:bg-rw-text`}
            title={tl("Download RiftWise for Windows (free, about 4 MB, no installer)")}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline 2xl:hidden">{tl("Windows app")}</span>
            <span className="hidden 2xl:inline">{tl("Download the Windows app")}</span>
          </a>
        )}
        {onSearch && (
          <button
            onClick={onSearch}
            className={`${pill} bg-rw-surface border-rw-border text-rw-text hover:bg-rw-raised hover:border-rw-accent/60`}
            aria-label={tl("Search teams, players and tournaments")}
            title={tl("Search teams, players and tournaments")}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{tl("Search")}</span>
          </button>
        )}
        <button
          onClick={() => onUpdateSettings({ spoilerMode: !settings.spoilerMode })}
          className={`${pill} font-medium ${
            settings.spoilerMode
              ? "bg-rw-accent border-rw-accent text-rw-bg"
              : "bg-rw-surface border-rw-border text-rw-text hover:bg-rw-raised"
          }`}
          aria-label={settings.spoilerMode ? tl("Show spoilers") : tl("Hide spoilers")}
          aria-pressed={settings.spoilerMode}
          title={settings.spoilerMode ? tl("Spoilers hidden: scores and gold are masked. Click to show.") : tl("Spoilers shown. Click to hide scores and gold.")}
        >
          {settings.spoilerMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{tl("Spoilers")}</span>
        </button>

        {IS_DESKTOP && (
          <button
            onClick={() => onUpdateSettings({ compactMode: !settings.compactMode })}
            className={`${iconBtn} ${
              settings.compactMode
                ? "bg-rw-teal border-rw-teal text-rw-bg"
                : "bg-rw-surface border-rw-border text-rw-text hover:bg-rw-raised"
            }`}
            aria-label={settings.compactMode ? tl("Expand window") : tl("Compact window")}
            title={tl("{action} (Alt+Shift+L summons/hides app anywhere)", { action: settings.compactMode ? tl("Expand window") : tl("Compact window") })}
          >
            {settings.compactMode ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
        )}

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`${iconBtn} bg-rw-surface border-rw-border text-rw-text hover:bg-rw-raised`}
          aria-label={tl("Refresh match data")}
          title={tl("Refresh match data")}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-rw-accent" : ""}`} />
        </button>
      </div>
    </header>
  );
};
