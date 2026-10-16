import React, { useState, useEffect, useRef, useCallback } from "react";
import { AppSettings, Match, StreamEvent, StreamStatus, CatalogData, AppUpdateInfo, LiveShow } from "./types";
import {
  loadSettings,
  saveSettings,
  fetchLiveMatches,
  fetchSchedule,
  fetchStreamSchedule,
  fetchStreamStatus,
  loadCachedStreamSchedule,
  saveStreamSchedule,
  loadCachedCatalog,
  loadBundledCatalog,
  fetchLiveCatalog,
  checkForAppUpdate,
  loadCachedH2HData,
  fetchH2HData,
  EMPTY_CATALOG,
} from "./api";
import { APP_VERSION } from "./version";

// Read before the first render marks the app as launched (see the initial-tab logic below).
const FIRST_DESKTOP_LAUNCH = (() => {
  try {
    return IS_DESKTOP && !localStorage.getItem("riftwatch_has_launched");
  } catch {
    return false;
  }
})();
import { ArrowDownToLine, WifiOff, AlertTriangle, X } from "lucide-react";
import { IS_DESKTOP, IS_WEB, matchIdFromHash } from "./platform";
import { reconcileLiveAndSchedule, playKickoffChime, applyH2HData, loadBundledH2H } from "./helpers";
import { H2HDetailsModal } from "./components/H2HDetailsModal";
import { OPEN_H2H_EVENT, OpenH2HDetail } from "./components/H2HMeter";
import { Header } from "./components/Header";
import { Navigation, TabKey } from "./components/Navigation";
import { LiveView } from "./components/views/LiveView";
import { ScheduleView } from "./components/views/ScheduleView";
import { StreamView } from "./components/views/StreamView";
import { WatchlistView } from "./components/views/WatchlistView";
import { NewsView } from "./components/views/NewsView";
import { SettingsView } from "./components/views/SettingsView";
import { TeamRosterModal } from "./components/TeamRosterModal";
import { tl, locale } from "./i18n";
import { statsUpdatedAt } from "./stats";
import { syncPush } from "./push";
import { STARTED_ON_HUB, navigateHub, onHubRoute, syncFromLocation, syncTabAddress } from "./hub/route";
import { lazyPart } from "./lazyPart";
import { PartBoundary } from "./components/PartBoundary";
// The stats hub is big and most visits are for live scores, so its code loads when first opened.
const StatsView = lazyPart(() => import("./components/views/StatsView").then((m) => m.StatsView));
const HubSearch = lazyPart(() => import("./components/hub/HubSearch").then((m) => m.HubSearch));
const lazyFallback = (
  <div className="py-10 text-center text-xs text-[#9bb3c9]" role="status">
    …
  </div>
);

// How often each data source is re-fetched (ms)
const LIVE_POLL_MS = 60_000;
const LIVE_POLL_ACTIVE_MS = 30_000; // faster while a match is in progress
const SCHEDULE_POLL_MS = 5 * 60_000;
const STREAM_POLL_MS = 15 * 60_000;
const H2H_POLL_MS = 6 * 60 * 60_000;

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [catalog, setCatalog] = useState<CatalogData>(() => loadCachedCatalog() ?? EMPTY_CATALOG);

  const [showWelcome, setShowWelcome] = useState(FIRST_DESKTOP_LAUNCH);

  // Initial tab. The desktop app's very first launch opens the Watchlist so people pick their
  // teams; the public web page opens on live scores, so a first-time visitor sees matches at once.
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    // Opened at a stats page address (lolworlds.com/riftwatch/player/faker): show it
    if (STARTED_ON_HUB) return "stats";
    try {
      const hasLaunched = localStorage.getItem("riftwatch_has_launched");
      if (!hasLaunched) {
        localStorage.setItem("riftwatch_has_launched", "true");
        if (IS_DESKTOP) return "watchlist";
      }
    } catch {}
    return loadSettings().defaultTab || "live";
  });

  const activeTabRef = useRef(activeTab);
  const selectTab = useCallback((tab: TabKey) => {
    syncTabAddress(activeTabRef.current, tab);
    activeTabRef.current = tab;
    setActiveTab(tab);
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  // One-time note about the stats hub and features people were missing (closed for good with X)
  const [hubTip, setHubTip] = useState(() => {
    try {
      return localStorage.getItem("riftwatch_tip_hub_v1") !== "1";
    } catch {
      return false;
    }
  });
  const closeHubTip = () => {
    setHubTip(false);
    try {
      localStorage.setItem("riftwatch_tip_hub_v1", "1");
    } catch {
      /* fine */
    }
  };

  // Opening any stats page (from the search, a link, a team card) brings up the Stats tab;
  // the browser's Back / Forward move between pages and tabs.
  useEffect(() => {
    const offRoute = onHubRoute(() => {
      if (activeTabRef.current !== "stats") selectTab("stats");
    });
    const onPop = () => {
      const r = syncFromLocation();
      const tab: TabKey = r ? "stats" : activeTabRef.current === "stats" ? (window.history.state?.tab as TabKey) || "live" : activeTabRef.current;
      activeTabRef.current = tab;
      setActiveTab(tab);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      offRoute();
      window.removeEventListener("popstate", onPop);
    };
  }, [selectTab]);

  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveShows, setLiveShows] = useState<LiveShow[]>([]);
  const [schedule, setSchedule] = useState<Match[]>([]);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>(loadCachedStreamSchedule);
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  // When the stats database last took in new games (shown in the footer)
  const [dbUpdated, setDbUpdated] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<{ code: string; name?: string } | null>(null);
  const [h2hDetail, setH2hDetail] = useState<OpenH2HDetail | null>(null);
  const [updateCheck, setUpdateCheck] = useState<{ at: number; error: string | null } | null>(null);
  // Set when Riot's API stops answering: "riot-down" (no response), "riot-key" (401/403), "offline".
  const [outage, setOutage] = useState<"riot-down" | "riot-key" | "offline" | null>(null);
  const lastLiveOk = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 4500);
  }, []);
  // Browser "install this site as an app" prompt (Chrome / Edge / Android); null where unsupported.
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // Shareable links: #match/<id> opens that match once its data has loaded.
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(() => matchIdFromHash());
  const [highlightMatchId, setHighlightMatchId] = useState<string | null>(null);

  // Tapping any H2H meter opens the details view.
  useEffect(() => {
    const onOpen = (e: Event) => setH2hDetail((e as CustomEvent<OpenH2HDetail>).detail);
    window.addEventListener(OPEN_H2H_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_H2H_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onHash = () => setPendingMatchId(matchIdFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!IS_WEB) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Persistent refs to prevent React stale closure bugs during periodic background polling
  const liveMatchesRef = useRef<Match[]>([]);
  const scheduleRef = useRef<Match[]>([]);
  const streamEventsRef = useRef<StreamEvent[]>(streamEvents);

  useEffect(() => {
    liveMatchesRef.current = liveMatches;
  }, [liveMatches]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    streamEventsRef.current = streamEvents;
  }, [streamEvents]);

  // All-time H2H table: the cached download if there is one (newest, instant), otherwise the copy
  // bundled with the app; then the latest download. Kept out of the startup bundle either way.
  const [, setH2hVersion] = useState(0);
  useEffect(() => {
    const cached = loadCachedH2HData();
    if (cached && applyH2HData(cached)) setH2hVersion((v) => v + 1);
    else loadBundledH2H().then((loaded) => loaded && setH2hVersion((v) => v + 1)).catch(() => {});
    const refresh = () =>
      fetchH2HData()
        .then((data) => {
          if (applyH2HData(data)) setH2hVersion((v) => v + 1);
        })
        .catch(() => {}); // offline or not published yet: keep what we have
    refresh();
    const timer = window.setInterval(refresh, H2H_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Sync settings across windows / browser tabs
  useEffect(() => {
    const handleSync = () => {
      const fresh = loadSettings();
      settingsRef.current = fresh;
      setSettings(fresh);
    };
    window.addEventListener("riftwatch_settings_updated", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("riftwatch_settings_updated", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  // The tray menu and tray notice live on the Windows side: hand them the translated labels once.
  useEffect(() => {
    if (!IS_DESKTOP) return;
    const texts: Record<string, string> = {
      show: tl("Open RiftWatch"),
      hide: tl("Hide to Tray"),
      nav_live: "🔴 " + tl("Live Matches"),
      nav_schedule: "📅 " + tl("Schedule & Results"),
      nav_stats: "📊 " + tl("Pro Stats"),
      nav_stream: "📺 " + tl("24/7 Stream Marathon"),
      nav_watchlist: "⭐ " + tl("Watchlist & Teams"),
      nav_news: "📰 " + tl("News & Intel"),
      nav_settings: "⚙ " + tl("Settings"),
      stream_twitch: "▶ " + tl("Watch 24/7 on Twitch"),
      stream_youtube: "▶ " + tl("Watch 24/7 on YouTube"),
      stream_sched: "🌐 " + tl("Full Schedule (lolworlds.com)"),
      kofi_support: "☕ " + tl("Support on Ko-fi"),
      quit: tl("Quit RiftWatch"),
      tray_hint_title: tl("RiftWatch is still running"),
      tray_hint_body: tl(
        "It's in the system tray (bottom-right, near the clock) so match alerts keep working. Right-click the icon to quit, or change this in Settings.",
      ),
    };
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("set_ui_texts", { texts }).catch(() => {}))
      .catch(() => {});
  }, []);

  // Synchronize Compact Desktop mode window sizing
  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => {
        invoke("set_compact_mode", { compact: !!settings.compactMode }).catch(() => {});
      })
      .catch(() => {});
  }, [settings.compactMode]);

  const handleUpdateSettings = useCallback((partial: Partial<AppSettings>) => {
    const updated = { ...settingsRef.current, ...partial };
    settingsRef.current = updated;
    setSettings(updated);
    saveSettings(updated);
  }, []);

  // Listen for tray menu events (with proper cleanup)
  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        const offTab = await listen<string>("navigate_tab", (event) => {
          if (event.payload) selectTab(event.payload as TabKey);
        });
        if (cancelled) offTab();
        else unlisteners.push(offTab);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisteners.forEach((off) => off());
    };
  }, [selectTab]);

  // ---------------------------------------------------------------
  // Data polling
  // ---------------------------------------------------------------
  const inFlight = useRef(false);
  const lastSchedule = useRef(0);
  const lastStream = useRef(0);
  const liveCount = useRef(0);

  const refreshData = useCallback(async (force = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsRefreshing(true);
    const now = Date.now();
    const wantSchedule = force || scheduleRef.current.length === 0 || now - lastSchedule.current >= SCHEDULE_POLL_MS - 1000;
    const wantStream = force || streamEventsRef.current.length === 0 || now - lastStream.current >= STREAM_POLL_MS - 1000;

    // The owner's break / return note for the 24/7 stream; a failure just keeps the last one
    if (wantStream) fetchStreamStatus().then(setStreamStatus).catch(() => {});

    try {
      // allSettled: one source failing must never wipe the data we already have
      const [live, sched, stream] = await Promise.allSettled([
        fetchLiveMatches(),
        wantSchedule ? fetchSchedule() : Promise.resolve(null),
        wantStream ? fetchStreamSchedule() : Promise.resolve(null),
      ]);

      let nextLive = liveMatchesRef.current;
      let nextSched = scheduleRef.current;

      if (live.status === "fulfilled") {
        nextLive = live.value.matches;
        setLiveShows(live.value.shows);
      }
      if (sched.status === "fulfilled" && sched.value && sched.value.length > 0) {
        nextSched = sched.value;
        lastSchedule.current = now;
      }

      // Correlate live broadcasts with scheduled matches to surface live tournament slates
      const { finalLive, finalSchedule } = reconcileLiveAndSchedule(nextLive, nextSched);
      liveMatchesRef.current = finalLive;
      scheduleRef.current = finalSchedule;
      setLiveMatches(finalLive);
      setSchedule(finalSchedule);
      // Poll faster while a match is in progress or a broadcast is on air (a delayed match can
      // start at any moment, and we want to catch Game 1 within seconds).
      liveCount.current =
        finalLive.filter((m) => m.state === "inProgress").length +
        (live.status === "fulfilled" ? live.value.shows.length : 0);

      if (stream.status === "fulfilled" && stream.value && stream.value.length > 0) {
        streamEventsRef.current = stream.value;
        setStreamEvents(stream.value);
        saveStreamSchedule(stream.value);
        lastStream.current = now;
      }

      const anyFailed = [live, sched, stream].some((r) => r.status === "rejected");
      setSyncFailed(anyFailed);
      if (!anyFailed || live.status === "fulfilled") setLastSync(Date.now());

      // Riot outage banner: the live feed is polled every tick, so it is the signal. Only show it
      // once we have had no answer for a few minutes (or never), so a single blip stays quiet.
      if (live.status === "fulfilled") {
        lastLiveOk.current = Date.now();
        setOutage(null);
      } else {
        const msg = String((live.reason as any)?.message || "");
        if (/HTTP (401|403)\b/.test(msg)) setOutage("riot-key");
        else if (Date.now() - lastLiveOk.current > 3 * 60_000)
          setOutage(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "riot-down");
      }
    } finally {
      inFlight.current = false;
      setIsRefreshing(false);
    }
  }, []);

  // Desktop keyboard shortcuts (F5, Ctrl+R, Ctrl+1..7 in tab order, Ctrl+S). Not on the web page: there
  // they would hijack the browser's own Reload, Save Page and tab-switching shortcuts.
  useEffect(() => {
    if (!IS_DESKTOP) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
        e.preventDefault();
        refreshData(true);
      } else if (e.ctrlKey && e.key === "1") {
        e.preventDefault();
        selectTab("live");
      } else if (e.ctrlKey && e.key === "2") {
        e.preventDefault();
        selectTab("schedule");
      } else if (e.ctrlKey && e.key === "3") {
        e.preventDefault();
        selectTab("stats");
      } else if (e.ctrlKey && e.key === "4") {
        e.preventDefault();
        selectTab("stream");
      } else if (e.ctrlKey && e.key === "5") {
        e.preventDefault();
        selectTab("watchlist");
      } else if (e.ctrlKey && e.key === "6") {
        e.preventDefault();
        selectTab("news");
      } else if (e.ctrlKey && e.key === "7") {
        e.preventDefault();
        selectTab("settings");
      } else if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleUpdateSettings({ spoilerMode: !settingsRef.current.spoilerMode });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUpdateSettings, refreshData, selectTab]);

  // Software update check
  const handleCheckForUpdate = useCallback(async () => {
    if (!IS_DESKTOP) return; // the web version is always current
    setIsCheckingUpdate(true);
    try {
      const info = await checkForAppUpdate(APP_VERSION);
      setUpdateInfo(info);
      setUpdateCheck({ at: Date.now(), error: info ? null : tl("Couldn't reach GitHub to check for updates.") });
      if (info?.hasUpdate) {
        // Notify once per version rather than on every startup / manual check
        let alreadyNotified = false;
        try {
          alreadyNotified = localStorage.getItem("riftwatch_update_notified") === info.latestVersion;
          if (!alreadyNotified) localStorage.setItem("riftwatch_update_notified", info.latestVersion);
        } catch {
          /* storage unavailable: fall through and notify */
        }
        if (!alreadyNotified) {
          import("@tauri-apps/api/core").then(({ invoke }) => {
            invoke("send_notification", {
              title: "⚡ " + tl("RiftWatch update available"),
              body: tl("Version v{version} is available. Open Settings to install it.", { version: info.latestVersion }),
            }).catch(() => {});
          });
        }
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  // The stats database is rebuilt whenever new games come in: keep its time in the footer current
  useEffect(() => {
    let alive = true;
    const check = () =>
      statsUpdatedAt(true).then((t) => {
        if (alive && t) setDbUpdated(t);
      });
    check();
    const timer = window.setInterval(check, 10 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  // Check for updates on startup (delayed 2.5s)
  useEffect(() => {
    const timer = setTimeout(() => {
      handleCheckForUpdate();
    }, 2500);
    return () => clearTimeout(timer);
  }, [handleCheckForUpdate]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    let first = true;
    const loop = async () => {
      // Always fetch once right away: a tab opened in the background (or preloaded by the
      // browser) would otherwise sit on "Loading…" until it is switched to. After that, skip
      // polls while hidden; the visibility handler catches up when the tab comes back.
      if (first || !document.hidden) await refreshData();
      first = false;
      if (cancelled) return;
      timer = window.setTimeout(loop, liveCount.current > 0 ? LIVE_POLL_ACTIVE_MS : LIVE_POLL_MS);
    };
    const onVisible = () => {
      if (!document.hidden) refreshData();
    };

    loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshData]);

  // ---------------------------------------------------------------
  // Native window sync
  // ---------------------------------------------------------------
  // Tell the native side whether closing the window should hide to tray or quit
  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => {
        invoke("set_close_to_tray", { enabled: settings.minimizeToTrayOnClose }).catch(() => {});
      })
      .catch(() => {});
  }, [settings.minimizeToTrayOnClose]);

  // Synchronize Windows autostart on sign-in
  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => {
        invoke("set_autostart", { enabled: settings.startWithWindows }).catch(() => {});
      })
      .catch(() => {});
  }, [settings.startWithWindows]);

  // ---------------------------------------------------------------
  // Desktop Notifications (Kickoffs & S-Tier Bangers)
  // ---------------------------------------------------------------
  const notifiedKickoffs = useRef(new Set<string>());
  const notifiedBangers = useRef(new Set<string>());

  useEffect(() => {
    if ((!settings.notifyKickoff && !settings.soundAlerts) || liveMatches.length === 0) return;

    const followed = new Set(settings.followedTeams.map((t) => t.toUpperCase()));
    for (const m of liveMatches) {
      if (m.state === "inProgress" && !notifiedKickoffs.current.has(m.matchId)) {
        const isFollowed =
          followed.has(m.team1Code.toUpperCase()) || followed.has(m.team2Code.toUpperCase());
        if (isFollowed) {
          notifiedKickoffs.current.add(m.matchId);
          if (settings.soundAlerts) {
            playKickoffChime();
          }
          if (settings.notifyKickoff) {
            import("@tauri-apps/api/core")
              .then(({ invoke }) => {
                invoke("send_notification", {
                  title: "🔴 " + tl("MATCH LIVE: {a} vs {b}", { a: m.team1Code, b: m.team2Code }),
                  body: tl("{league} match is now live! (Bo{n})", { league: m.leagueName, n: m.bestOf }),
                }).catch(() => {});
              })
              .catch(() => {});
          }
        }
      }
    }
  }, [liveMatches, settings.notifyKickoff, settings.soundAlerts, settings.followedTeams]);

  useEffect(() => {
    if (!settings.notifyStream || streamEvents.length === 0) return;

    const now = Date.now();
    for (const ev of streamEvents) {
      if (ev.isBanger && ev.utcIso) {
        const start = new Date(ev.utcIso).getTime();
        // Airing now (started within the last 45 minutes)
        if (now >= start && now - start < 45 * 60 * 1000) {
          const key = `banger-${ev.id}`;
          if (!notifiedBangers.current.has(key)) {
            notifiedBangers.current.add(key);
            const matchup =
              ev.team1 && ev.team2 ? `${ev.team1} vs ${ev.team2}` : ev.name || tl("Legendary match");
            import("@tauri-apps/api/core")
              .then(({ invoke }) => {
                invoke("send_notification", {
                  title: "🔥 " + tl("S-TIER BANGER AIRING NOW"),
                  body: tl("{matchup} ({event}) is playing on the 24/7 stream!", { matchup, event: `${ev.event} ${ev.season}` }),
                }).catch(() => {});
              })
              .catch(() => {});
          }
        }
      }
    }
  }, [streamEvents, settings.notifyStream]);

  // Desktop: "starting soon" 15 minutes before a followed team plays (the web gets it from the alert server)
  const notifiedPregame = useRef(new Set<string>());
  useEffect(() => {
    if (!IS_DESKTOP || !settings.notifyPregame) return;
    const check = () => {
      const followed = new Set(settings.followedTeams.map((t) => t.toUpperCase()));
      const now = Date.now();
      for (const m of schedule) {
        if (m.state !== "unstarted" || notifiedPregame.current.has(m.matchId)) continue;
        if (!followed.has(m.team1Code.toUpperCase()) && !followed.has(m.team2Code.toUpperCase())) continue;
        const until = new Date(m.startTimeUtc).getTime() - now;
        if (until > 0 && until <= 15 * 60 * 1000) {
          notifiedPregame.current.add(m.matchId);
          const minutes = Math.ceil(until / 60000);
          import("@tauri-apps/api/core")
            .then(({ invoke }) =>
              invoke("send_notification", {
                title: "⏰ " + tl("Starting soon: {a} vs {b}", { a: m.team1Code, b: m.team2Code }),
                body: tl("{league} · starts in {n} min", { league: m.leagueName, n: minutes }),
              }).catch(() => {}),
            )
            .catch(() => {});
        }
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [schedule, settings.notifyPregame, settings.followedTeams]);

  // Web: keep the alert server's copy of the followed teams and alert choices current
  useEffect(() => {
    if (!IS_WEB) return;
    const timer = setTimeout(() => {
      syncPush(settings).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.followedTeams, settings.notifyKickoff, settings.notifyPregame, settings.notifyStream]);

  // ---------------------------------------------------------------
  // Catalog (teams / players / leagues)
  // ---------------------------------------------------------------
  // First run: load the snapshot bundled with the app (kept out of the startup bundle).
  useEffect(() => {
    if (catalog.teams.length > 0) return;
    const load = () =>
      loadBundledCatalog()
        .then((bundled) => setCatalog((prev) => (prev.teams.length > 0 ? prev : bundled)))
        .catch((e) => console.warn("Failed to load bundled catalog:", e));
    if (IS_DESKTOP) {
      load();
      return;
    }
    // Web: the 1 MB team directory can wait until the live data is on screen.
    const timer = window.setTimeout(load, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve a #match/<id> link once the live list or schedule contains it.
  useEffect(() => {
    if (!pendingMatchId) return;
    if (liveMatches.some((m) => m.matchId === pendingMatchId)) {
      selectTab("live");
      setHighlightMatchId(pendingMatchId);
      setPendingMatchId(null);
    } else if (schedule.some((m) => m.matchId === pendingMatchId)) {
      selectTab("schedule");
      setHighlightMatchId(pendingMatchId);
      setPendingMatchId(null);
    } else if (lastSync && schedule.length > 0) {
      showToast(tl("That match isn't in the current schedule window."));
      setPendingMatchId(null);
    }
  }, [pendingMatchId, liveMatches, schedule, lastSync, showToast, selectTab]);

  // Refresh from Riot in the background if the saved copy is older than 24 hours
  useEffect(() => {
    const cached = loadCachedCatalog();
    const age = Date.now() - (cached?.updatedAt || 0);
    if (age > 24 * 60 * 60 * 1000) {
      fetchLiveCatalog(cached ?? undefined)
        .then((updated) => {
          if (updated) setCatalog(updated);
        })
        .catch(() => {});
    }
  }, []);

  const handleRefreshCatalog = async () => {
    setIsRefreshing(true);
    try {
      const updated = await fetchLiveCatalog(catalog);
      if (updated) setCatalog(updated);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenUrl = (url: string) => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => {
        invoke("open_external_url", { url }).catch(() => {
          // Native side refused (not an http/https link) or isn't available (browser dev mode)
          if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
        });
      })
      .catch(() => {
        if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
      });
  };

  const clock = (t: number) => new Date(t).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
  // "2:08 PM" today, "Oct 15, 2:08 PM" before that
  const whenText = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString()
      ? clock(d.getTime())
      : d.toLocaleString(locale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  const syncLabel = syncFailed
    ? lastSync
      ? tl("Connection problem · showing data from {time}", { time: clock(lastSync) })
      : tl("Can't reach the data sources right now")
    : dbUpdated
      ? tl("Database updated {time}", { time: whenText(dbUpdated) })
      : lastSync
        ? tl("Live scores up to date")
        : tl("Loading…");
  const syncTitle = [
    dbUpdated ? tl("Stats database last took in new games: {time}", { time: whenText(dbUpdated) }) : "",
    lastSync ? tl("Live scores last checked: {time}", { time: clock(lastSync) }) : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex flex-col h-screen w-screen bg-[#091428] text-[#f0e6d2] overflow-hidden select-none">
      {/* Header */}
      <Header
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        liveMatches={liveMatches}
        streamEvents={streamEvents}
        streamStatus={streamStatus}
        onRefresh={() => refreshData(true)}
        isRefreshing={isRefreshing}
        onSelectTab={selectTab}
        onOpenUrl={handleOpenUrl}
        updateInfo={updateInfo}
        onInstall={installPrompt ? () => installPrompt.prompt?.() : undefined}
        liveShows={liveShows}
        onSearch={() => setSearchOpen((v) => !v)}
      />

      {/* Stats search (teams, players, tournaments, champions), opened from the header */}
      {searchOpen && (
        <div className="bg-[#0a0e17] border-b border-[#1e282d] px-3 sm:px-4 py-2">
          <div className="max-w-2xl mx-auto">
            <PartBoundary>
              <React.Suspense fallback={lazyFallback}>
                <HubSearch big autoFocus onDone={() => setSearchOpen(false)} />
              </React.Suspense>
            </PartBoundary>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <Navigation activeTab={activeTab} onSelectTab={selectTab} liveCount={liveMatches.length} />

      {/* Data outage banner */}
      {outage && (
        <div
          role="status"
          className={`flex items-center gap-2 px-4 py-2 text-xs border-b ${
            outage === "riot-key"
              ? "bg-[#1e131d] border-[#e84057]/60 text-[#f0e6d2]"
              : "bg-[#1a1708] border-[#c8aa6e]/50 text-[#f0e6d2]"
          }`}
        >
          {outage === "offline" ? (
            <WifiOff className="w-4 h-4 text-[#c8aa6e] shrink-0" />
          ) : (
            <AlertTriangle className={`w-4 h-4 shrink-0 ${outage === "riot-key" ? "text-[#e84057]" : "text-[#c8aa6e]"}`} />
          )}
          <span>
            {outage === "offline" && tl("You're offline. Live scores and schedules will come back when the connection does.")}
            {outage === "riot-down" &&
              tl("Riot's LoL Esports data isn't responding right now. Nothing is wrong on your end; RiftWatch retries every minute and the 24/7 stream guide still works.")}
            {outage === "riot-key" && (
              <>
                {tl("Riot changed the key RiftWatch uses for esports data.")}{" "}
                <button type="button" onClick={() => handleOpenUrl("https://github.com/drmonocle/riftwatch/releases")} className="underline hover:text-[#c8aa6e]">
                  {tl("Update RiftWatch")}
                </button>
              </>
            )}
          </span>
        </div>
      )}

      {showWelcome && (
        <div className="bg-[#0a1420] border-b border-[#c8aa6e]/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 text-xs" role="status">
          <div className="flex-1 text-[#9bb3c9] leading-relaxed">
            <strong className="text-[#c8aa6e]">{tl("Welcome to RiftWatch!")}</strong>{" "}
            {tl("Start by following the teams you care about below: they get highlighted everywhere and you get an alert when they play. RiftWatch also starts with Windows, quietly in the tray; you can turn that off in Settings.")}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => {
                setShowWelcome(false);
                selectTab("live");
              }}
              className="px-3 py-1.5 rounded-md bg-[#c8aa6e] hover:bg-[#f0e6d2] text-[#091428] font-bold"
            >
              {tl("Show live matches")}
            </button>
            <button
              onClick={() => setShowWelcome(false)}
              className="px-3 py-1.5 rounded-md border border-[#1e282d] hover:border-[#c8aa6e]/60 text-[#f0e6d2]"
            >
              {tl("Got it")}
            </button>
          </div>
        </div>
      )}

      {hubTip && !showWelcome && activeTab !== "stats" && (
        <div className="bg-[#0a1420] border-b border-[#c8aa6e]/40 px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" role="status">
          <div className="flex-1 min-w-[14rem] text-[#9bb3c9] leading-relaxed">
            <strong className="text-[#c8aa6e]">{tl("New: Pro Stats for every game since 2011.")}</strong>{" "}
            {tl("Search any team, player, tournament or champion; every match has its draft, builds and a link to watch it.")}{" "}
            <span className="text-[#7e8e9f] hidden sm:inline">
              {tl("Also: group tables and brackets are under Schedule → Standings & Brackets, and tapping the head-to-head bar on a match shows the all-time record.")}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                closeHubTip();
                navigateHub({ kind: "home" });
              }}
              className="px-3 py-1.5 rounded-md bg-[#c8aa6e] hover:bg-[#f0e6d2] text-[#091428] font-bold"
            >
              {tl("Open Pro Stats")}
            </button>
            <button onClick={closeHubTip} aria-label={tl("Close")} className="p-1 text-[#7e8e9f] hover:text-[#f0e6d2]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content View Container */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === "live" && (
          <LiveView
            matches={liveMatches}
            schedule={schedule}
            settings={settings}
            catalog={catalog}
            onOpenUrl={handleOpenUrl}
            onSelectTab={selectTab}
            onUpdateSettings={handleUpdateSettings}
            onSelectTeam={(code, name) => setSelectedTeam({ code, name })}
            highlightMatchId={highlightMatchId}
            isLoading={lastSync === null && !syncFailed}
            liveShows={liveShows}
          />
        )}
        {activeTab === "schedule" && (
          <ScheduleView
            schedule={schedule}
            settings={settings}
            catalog={catalog}
            onOpenUrl={handleOpenUrl}
            onUpdateSettings={handleUpdateSettings}
            onSelectTeam={(code, name) => setSelectedTeam({ code, name })}
            highlightMatchId={highlightMatchId}
            isLoading={lastSync === null && !syncFailed}
          />
        )}
        {activeTab === "stream" && (
          <StreamView
            events={streamEvents}
            status={streamStatus}
            settings={settings}
            catalog={catalog}
            onOpenUrl={handleOpenUrl}
            onSelectTab={selectTab}
          />
        )}
        {activeTab === "watchlist" && (
          <WatchlistView
            settings={settings}
            catalog={catalog}
            onUpdateSettings={handleUpdateSettings}
            onRefreshCatalog={handleRefreshCatalog}
            isRefreshingCatalog={isRefreshing}
          />
        )}
        {activeTab === "stats" && (
          <PartBoundary>
            <React.Suspense fallback={lazyFallback}>
              <StatsView settings={settings} onOpenUrl={handleOpenUrl} schedule={schedule} />
            </React.Suspense>
          </PartBoundary>
        )}
        {activeTab === "news" && <NewsView onOpenUrl={handleOpenUrl} />}
        {activeTab === "settings" && (
          <SettingsView
            settings={settings}
            catalog={catalog}
            onUpdateSettings={handleUpdateSettings}
            onOpenUrl={handleOpenUrl}
            onRefreshCatalog={handleRefreshCatalog}
            updateInfo={updateInfo}
            onCheckForUpdate={handleCheckForUpdate}
            isCheckingUpdate={isCheckingUpdate}
            lastUpdateCheck={updateCheck}
          />
        )}
      </main>

      {/* All-time H2H details (opened from any H2H meter) */}
      {h2hDetail && (
        <H2HDetailsModal
          team1Code={h2hDetail.team1Code}
          team2Code={h2hDetail.team2Code}
          matchId={h2hDetail.matchId}
          countThisMatch={h2hDetail.countThisMatch !== false}
          schedule={schedule}
          catalog={catalog}
          spoilerMode={settings.spoilerMode}
          onClose={() => setH2hDetail(null)}
          onSelectTeam={(code, name) => {
            setH2hDetail(null);
            setSelectedTeam({ code, name });
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#0a1420] border border-[#c8aa6e]/60 text-xs text-[#f0e6d2] shadow-xl"
        >
          {toast}
        </div>
      )}

      {/* Team Roster & Player Profiles Flyout Modal */}
      {selectedTeam && (
        <TeamRosterModal
          teamCode={selectedTeam.code}
          teamName={selectedTeam.name}
          catalog={catalog}
          schedule={schedule}
          settings={settings}
          onClose={() => setSelectedTeam(null)}
          onToggleTeamFollow={(code) => {
            const isFollowed = settings.followedTeams.includes(code);
            const next = isFollowed
              ? settings.followedTeams.filter((t) => t !== code)
              : [...settings.followedTeams, code];
            handleUpdateSettings({ followedTeams: next });
          }}
          onTogglePlayerFollow={(name) => {
            const isFollowed = settings.followedPlayers.includes(name);
            const next = isFollowed
              ? settings.followedPlayers.filter((p) => p !== name)
              : [...settings.followedPlayers, name];
            handleUpdateSettings({ followedPlayers: next });
          }}
          onOpenUrl={handleOpenUrl}
        />
      )}

      {/* Minimal Status Footer */}
      <footer className="bg-[#0a0e17] border-t border-[#1e282d] px-4 py-1 flex items-center justify-between text-[11px] text-[#7e8e9f] select-none">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${syncFailed ? "bg-[#e84057]" : "bg-[#0ac8b9]"}`} />
          <span className="whitespace-nowrap" title={syncTitle || undefined}>
            {syncLabel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {settings.spoilerMode && (
            <span className="text-[#c8aa6e] font-semibold whitespace-nowrap">
              <span className="hidden sm:inline">{tl("SPOILER MODE ACTIVE")}</span>
              <span className="sm:hidden">{tl("SPOILERS HIDDEN")}</span>
            </span>
          )}
          {/* Narrow screens: make room for the spoiler notice so the footer stays on one line */}
          <span
            onClick={() => handleOpenUrl("https://drmonocle.com")}
            className={`hover:text-[#c8aa6e] cursor-pointer whitespace-nowrap ${settings.spoilerMode ? "hidden sm:inline" : ""}`}
          >
            {tl("Monocle Productions LLC")}
          </span>
          {IS_DESKTOP && <button
            onClick={() =>
              import("@tauri-apps/api/core")
                .then(({ invoke }) => invoke("hide_main"))
                .catch(() => {})
            }
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#1e282d] text-[#a09b8c] hover:text-[#f0e6d2] hover:border-[#c8aa6e] hover:bg-[#121e2d] transition-colors"
            aria-label={tl("Hide RiftWatch to the system tray")}
            title={tl("Hide RiftWatch to the system tray (click the tray icon or press Alt+Shift+L to bring it back)")}
          >
            <ArrowDownToLine className="w-3 h-3" />
            <span>{tl("Hide to tray")}</span>
          </button>}
        </div>
      </footer>
    </div>
  );
}
