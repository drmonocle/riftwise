import React from "react";
import { AppSettings, Match, StreamEvent, StreamStatus, AppUpdateInfo, LiveShow } from "../types";
import { Radio, RefreshCw, Eye, EyeOff, Heart, Sparkles, Minimize2, Maximize2, Download, Smartphone } from "lucide-react";
import { formatStreamHeaderTitle, streamPhase } from "../helpers";
import { APP_VERSION } from "../version";
import { IS_DESKTOP, IS_WEB, IS_WINDOWS_BROWSER, DESKTOP_DOWNLOAD_URL } from "../platform";
import { tl, tn } from "../i18n";

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
    <header className="bg-[#0a0e17] border-b border-[#c8aa6e] px-3 sm:px-4 py-2 flex items-center gap-3 select-none">
      {/* Brand */}
      <div className="flex items-baseline gap-1.5 cursor-pointer flex-shrink-0" onClick={() => onSelectTab("live")}>
        <span className="text-[#c8aa6e] font-bold text-lg tracking-wider">RIFTWATCH</span>
        <span className="hidden sm:inline text-[#a09b8c] text-[10px]">v{APP_VERSION}</span>
      </div>

      {/* Support: sits just left of the live pills */}
      <button
        onClick={() => onOpenUrl("https://ko-fi.com/monocle")}
        className={`${iconBtn} flex-shrink-0 bg-[#720e9e] border-[#720e9e] hover:bg-[#8c19bd] text-white`}
        aria-label={tl("Support RiftWatch on Ko-fi")}
        title={tl("Support RiftWatch development on Ko-fi")}
      >
        <Heart className="w-3.5 h-3.5 fill-current" />
      </button>

      {/* Status pills: these shrink and truncate instead of wrapping; on phones the ticker shows the same info */}
      <div className="hidden sm:flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        {updateInfo?.hasUpdate && (
          <button
            onClick={() => onSelectTab("settings")}
            className={`${pill} flex-shrink-0 font-bold bg-[#0ac8b9] border-[#0ac8b9] text-[#091428] hover:bg-[#0ac8b9]/80 animate-pulse`}
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
              ? "bg-[#1e131d] border-[#e84057] text-[#e84057] font-semibold"
              : onAir
                ? "bg-[#1a1708] border-[#c8aa6e]/70 text-[#c8aa6e] font-semibold"
                : "bg-[#0a1420] border-[#1e282d] text-[#7e8e9f] hover:border-[#c8aa6e]"
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
              hasLive ? "bg-[#e84057] animate-pulse" : onAir ? "bg-[#c8aa6e] animate-pulse" : "bg-[#7e8e9f]"
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
              ? "bg-[#0a1420] border-[#0ac8b9]/60 text-[#0ac8b9] hover:border-[#0ac8b9] hover:bg-[#121e2d]"
              : "bg-[#0a1420] border-[#1e282d] text-[#7e8e9f] hover:border-[#7e8e9f]"
          }`}
          title={streamInfo.isLive ? tl("{title} · Click to view stream", { title: streamInfo.title }) : phase.kind === "break" ? tl("The 24/7 marathon is on break · Click for details") : tl("Twitch 24/7 Stream is currently offline")}
        >
          <Radio className={`w-3.5 h-3.5 flex-shrink-0 ${streamInfo.isLive ? "text-[#0ac8b9] animate-pulse" : ""}`} />
          <span className="font-semibold truncate">{streamInfo.title}</span>
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        {onInstall && (
          <button
            onClick={onInstall}
            className={`${pill} font-semibold bg-[#0a1420] border-[#0ac8b9]/60 text-[#0ac8b9] hover:bg-[#121e2d]`}
            aria-label={tl("Install RiftWatch on this device")}
            title={tl("Add RiftWatch to your home screen or desktop")}
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
            className={`${pill} hidden sm:inline-flex font-semibold bg-[#c8aa6e] border-[#c8aa6e] text-[#091428] hover:bg-[#f0e6d2]`}
            title={tl("Download RiftWatch for Windows (free, about 4 MB, no installer)")}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{tl("Download for Windows")}</span>
            <span className="md:hidden">{tl("Windows")}</span>
          </a>
        )}
        <button
          onClick={() => onUpdateSettings({ spoilerMode: !settings.spoilerMode })}
          className={`${pill} font-medium ${
            settings.spoilerMode
              ? "bg-[#c8aa6e] border-[#c8aa6e] text-[#091428]"
              : "bg-[#0a1420] border-[#1e282d] text-[#f0e6d2] hover:bg-[#121e2d]"
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
                ? "bg-[#0ac8b9] border-[#0ac8b9] text-[#091428]"
                : "bg-[#0a1420] border-[#1e282d] text-[#f0e6d2] hover:bg-[#121e2d]"
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
          className={`${iconBtn} bg-[#0a1420] border-[#1e282d] text-[#f0e6d2] hover:bg-[#121e2d]`}
          aria-label={tl("Refresh match data")}
          title={tl("Refresh match data")}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#c8aa6e]" : ""}`} />
        </button>
      </div>
    </header>
  );
};
