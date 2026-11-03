import React, { Suspense, useEffect, useRef, useState } from "react";
import { AppSettings, Match, StreamEvent, StreamStatus, AppUpdateInfo, LiveShow } from "../types";
import { Radio, RefreshCw, Eye, EyeOff, Heart, Sparkles, Minimize2, Maximize2, Search, Settings } from "lucide-react";
import { formatStreamHeaderTitle, streamPhase } from "../helpers";
import { APP_VERSION } from "../version";
import { IS_DESKTOP } from "../platform";
import { tl, tn } from "../i18n";
import { LanguageFlag } from "./LanguageFlag";
import { lazyPart } from "../lazyPart";
import { Navigation, TabKey } from "./Navigation";
import { navigateHub, useHubRoute } from "../hub/route";
// the stats search box (loaded with the stats code; a look-alike box stands in until then)
const HubSearch = lazyPart(() => import("./hub/HubSearch").then((m) => m.HubSearch));

/** The header's search: a real search box as wide as the room left, its hint shortening as it narrows, and below
 *  SEARCH_MIN pixels a search button that opens the full-width search under the header instead. */
const SEARCH_MIN = 120;
const HeaderSearch: React.FC<{ onOpen?: () => void }> = ({ onOpen }) => {
  const slot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // a new box after each pick, so it starts empty again
  const [round, setRound] = useState(0);
  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const hint = width >= 360 ? tl("Search a team, player, champion, tournament or item") : width >= 210 ? tl("Search teams, players…") : tl("Search…");
  return (
    <div ref={slot} className="flex-1 min-w-0" data-header-search={width >= SEARCH_MIN ? "box" : "button"}>
      {width >= SEARCH_MIN ? (
        <div className="max-w-xl">
          <Suspense
            fallback={
              <div className="flex items-center gap-2 h-7 px-2.5 rounded-lg bg-rw-bg border border-rw-border text-xs text-rw-muted">
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{hint}</span>
              </div>
            }
          >
            <HubSearch key={round} placeholder={hint} onDone={() => setRound((r) => r + 1)} />
          </Suspense>
        </div>
      ) : (
        onOpen && (
          <button
            onClick={onOpen}
            className={`${pill} bg-rw-surface border-rw-border text-rw-text hover:bg-rw-raised hover:border-rw-accent/60`}
            aria-label={tl("Search teams, players and tournaments")}
            title={tl("Search teams, players and tournaments")}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        )
      )}
    </div>
  );
};

interface HeaderProps {
  settings: AppSettings;
  onUpdateSettings: (s: Partial<AppSettings>) => void;
  liveMatches: Match[];
  streamEvents: StreamEvent[];
  streamStatus?: StreamStatus | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  onOpenUrl: (url: string) => void;
  updateInfo?: AppUpdateInfo | null;
  /** Broadcasts on air with no match in progress (e.g. a delayed start). */
  liveShows?: LiveShow[];
  /** Opens the stats search (teams, players, tournaments, champions). */
  onSearch?: () => void;
}

// Shared look for the small header controls: one line, never wrapping.
const pill = "flex items-center gap-1.5 h-8 max-sm:h-9 px-2.5 rounded-lg text-xs whitespace-nowrap border transition-colors";
const iconBtn = "flex items-center justify-center h-8 w-8 max-sm:h-9 max-sm:w-9 rounded-lg border transition-colors";
const quiet = "bg-rw-surface border-rw-border text-rw-text hover:bg-rw-raised hover:border-rw-accent/60";

/**
 * One row: the brand, the site's six pages (wide screens), the search box with the room that is left, then what is
 * on right now (a live match, the 24/7 stream while it airs) and the controls: language, spoilers, support, settings.
 * Phones get the six pages as a second row that scrolls sideways.
 */
export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  liveMatches,
  streamEvents,
  streamStatus,
  onRefresh,
  isRefreshing,
  activeTab,
  onSelectTab,
  onOpenUrl,
  updateInfo,
  liveShows = [],
  onSearch,
}) => {
  const hasLive = liveMatches.length > 0;
  const onAir = !hasLive && liveShows.length > 0 ? liveShows[0] : null;
  const firstLive = hasLive ? liveMatches[0] : null;
  const phase = streamPhase(streamEvents, streamStatus);
  const streamInfo = phase.kind === "airing" ? formatStreamHeaderTitle(phase.current) : null;
  const extraLive = liveMatches.length > 1 ? ` +${liveMatches.length - 1}` : "";
  // the front page has its own big search box: one box per page
  const route = useHubRoute();
  const onHome = activeTab === "stats" && route.kind === "home";
  return (
    <header className="rw-header select-none">
      <div className="px-3 sm:px-4 py-2 flex items-center gap-x-2 min-[400px]:gap-x-3">
        {/* Brand: the front page */}
        <button
          type="button"
          onClick={() => navigateHub({ kind: "home" })}
          className="flex items-baseline shrink-0 rounded"
          title={`RiftWise v${APP_VERSION}`}
          aria-label={tl("RiftWise home")}
        >
          <span className="rw-logo font-extrabold text-base min-[360px]:text-lg tracking-wider">RIFTWISE</span>
        </button>
        <div className="hidden tab:block shrink-0">
          <Navigation activeTab={activeTab} onSelectTab={onSelectTab} liveCount={liveMatches.length} />
        </div>
        {onHome ? <div className="flex-1" /> : <HeaderSearch onOpen={onSearch} />}

        {/* What is on right now */}
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          {hasLive && (
            <button
              type="button"
              onClick={() => onSelectTab("live")}
              className={`${pill} min-w-0 bg-rw-red/10 border-rw-red text-rw-red font-semibold`}
              title={tn("{n} live pro match. Click to view.", "{n} live pro matches. Click to view.", liveMatches.length)}
            >
              <span className="w-2 h-2 rounded-full bg-rw-red animate-pulse shrink-0" />
              <span className="truncate">
                <span className="sm:hidden">{tl("LIVE")}</span>
                <span className="hidden sm:inline">{tl("LIVE {a} vs {b}", { a: firstLive?.team1Code ?? "", b: firstLive?.team2Code ?? "" }) + extraLive}</span>
              </span>
            </button>
          )}
          {onAir && (
            <button
              type="button"
              onClick={() => onSelectTab("live")}
              className={`${pill} hidden sm:flex min-w-0 bg-rw-accent/10 border-rw-accent/70 text-rw-accent font-semibold`}
              title={tl("{league} broadcast is on air, no match has started yet", { league: onAir.leagueName })}
            >
              <span className="w-2 h-2 rounded-full bg-rw-accent animate-pulse shrink-0" />
              <span className="truncate">{tl("{league} on air", { league: onAir.leagueName })}</span>
            </button>
          )}
          {streamInfo && (
            <button
              type="button"
              onClick={() => onSelectTab("stream")}
              className={`${pill} hidden md:flex min-w-0 bg-rw-surface border-rw-teal/60 text-rw-teal hover:border-rw-teal hover:bg-rw-raised`}
              title={tl("{title} · Click to view stream", { title: streamInfo.title })}
            >
              <Radio className="w-3.5 h-3.5 shrink-0 animate-pulse" />
              <span className="font-semibold truncate hidden lg:inline">{streamInfo.title}</span>
              <span className="font-semibold lg:hidden">24/7</span>
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0">
          {updateInfo?.hasUpdate && (
            <button
              onClick={() => onSelectTab("settings")}
              className={`${pill} font-bold bg-rw-teal border-rw-teal text-rw-bg hover:bg-rw-teal/80 animate-pulse`}
              title={tl("New version v{version} available! Click to update.", { version: updateInfo.latestVersion })}
            >
              <Sparkles className="w-3 h-3" />
              <span className="hidden sm:inline">{tl("Update v{version}", { version: updateInfo.latestVersion })}</span>
            </button>
          )}
          <LanguageFlag onUpdateSettings={onUpdateSettings} />
          <button
            onClick={() => onUpdateSettings({ spoilerMode: !settings.spoilerMode })}
            className={`${iconBtn} ${settings.spoilerMode ? "bg-rw-accent border-rw-accent text-rw-bg" : quiet}`}
            aria-label={settings.spoilerMode ? tl("Show spoilers") : tl("Hide spoilers")}
            aria-pressed={settings.spoilerMode}
            title={settings.spoilerMode ? tl("Spoilers hidden: scores and gold are masked. Click to show.") : tl("Spoilers shown. Click to hide scores and gold.")}
          >
            {settings.spoilerMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onOpenUrl("https://ko-fi.com/monocle")}
            className={`${iconBtn} max-[360px]:hidden bg-[#720e9e] border-[#720e9e] hover:bg-[#8c19bd] text-white`}
            aria-label={tl("Support RiftWise on Ko-fi")}
            title={tl("Support RiftWise development on Ko-fi")}
          >
            <Heart className="w-3.5 h-3.5 fill-current" />
          </button>
          <button
            onClick={() => onSelectTab("settings")}
            className={`${iconBtn} ${activeTab === "settings" ? "bg-rw-raised border-rw-accent text-rw-accent" : quiet}`}
            aria-label={tl("Settings")}
            title={tl("Settings: language, theme, spoilers, alerts")}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          {IS_DESKTOP && (
            <button
              onClick={() => onUpdateSettings({ compactMode: !settings.compactMode })}
              className={`${iconBtn} ${settings.compactMode ? "bg-rw-teal border-rw-teal text-rw-bg" : quiet}`}
              aria-label={settings.compactMode ? tl("Expand window") : tl("Compact window")}
              title={tl("{action} (Alt+Shift+L summons/hides app anywhere)", { action: settings.compactMode ? tl("Expand window") : tl("Compact window") })}
            >
              {settings.compactMode ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          {IS_DESKTOP && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={`${iconBtn} ${quiet}`}
              aria-label={tl("Refresh match data")}
              title={tl("Refresh match data")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-rw-accent" : ""}`} />
            </button>
          )}
        </div>
      </div>
      {/* phones and narrow windows: the six pages as a row that scrolls sideways */}
      <div className="tab:hidden px-3 sm:px-4 pb-2">
        <Navigation phone activeTab={activeTab} onSelectTab={onSelectTab} liveCount={liveMatches.length} />
      </div>
    </header>
  );
};
