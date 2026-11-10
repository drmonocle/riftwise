import React, { useEffect, useRef, useState } from "react";
import { Match, AppSettings, CatalogData } from "../../types";
import { Search, Calendar, Star, Trophy, BarChart3, X } from "lucide-react";
import { AddToCalendarMenu } from "../AddToCalendarMenu";
import { MatchPrepButton } from "../MatchPrepButton";
import { MatchOverviewButton } from "../MatchOverviewButton";
import { ShareMatchButton } from "../ShareMatchButton";
import { isMatchFollowed, followedPlayerTeams, computeHeadToHead, swissStakes } from "../../helpers";
import { clickable } from "../../a11y";
import { H2HMeter } from "../H2HMeter";
import { StandingsView } from "./StandingsView";
import { tl, locale, clockOptions, tc } from "../../i18n";
import { searchAlias } from "../../searchAliases";
import { isRevealed, setRevealed, useRevealedVersion } from "../../revealed";
import { findSeriesSlug } from "../../hub/seriesLookup";
import { prettySlug, resolveLeagueSlug } from "../../hub/data";
import { RIOT_PREFIX } from "../../hub/riotMatch";
import { navigateHub, scheduleOfPath, setScheduleAddress } from "../../hub/route";
import { riotImg } from "../../riotImage";
import { TeamLogo } from "../hub/ui";
import { SectionCard } from "../hub/BroadcastCard";
import { countSecondPage } from "../../usage";

interface ScheduleViewProps {
  schedule: Match[];
  settings: AppSettings;
  catalog?: CatalogData;
  onOpenUrl: (url: string) => void;
  onUpdateSettings?: (s: Partial<AppSettings>) => void;
  onSelectTeam?: (teamCode: string, teamName?: string) => void;
  /** From a #match/<id> link: switch filters to show this match, scroll to it and flash it. */
  highlightMatchId?: string | null;
  /** True until the first data sync has finished. */
  isLoading?: boolean;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  schedule,
  settings,
  catalog,
  onOpenUrl,
  onUpdateSettings,
  onSelectTeam,
  highlightMatchId,
  isLoading,
}) => {
  const [mainSubTab, setMainSubTab] = useState<"matches" | "standings">("matches");
  // riftwise.gg/results and /schedule/<league> (or /results/<league>) open on that list and league
  const [fromPath] = useState(() => scheduleOfPath());
  const [league, setLeague] = useState<string | null>(fromPath.league);
  const [filterRange, setFilterRange] = useState<"today" | "upcoming" | "results">(() => {
    if (fromPath.results) return "results";
    if (fromPath.league) return "upcoming";
    const today = new Date().toDateString();
    const hasTodayMatches = schedule.some((m) => {
      if (!m.startTimeUtc) return false;
      return new Date(m.startTimeUtc).toDateString() === today;
    });
    return hasTodayMatches ? "today" : "upcoming";
  });
  const syncedInitialRange = useRef(schedule.length > 0);
  useEffect(() => {
    if (syncedInitialRange.current || schedule.length === 0) return;
    syncedInitialRange.current = true;
    if (fromPath.results || fromPath.league || highlightMatchId) return;
    const today = new Date().toDateString();
    const hasTodayMatches = schedule.some((m) => !!m.startTimeUtc && new Date(m.startTimeUtc).toDateString() === today);
    if (hasTodayMatches) setFilterRange("today");
  }, [schedule, fromPath.results, fromPath.league, highlightMatchId]);
  const [followedOnly, setFollowedOnly] = useState(false);
  // the address follows the list and league, so what's on screen can be linked
  useEffect(() => setScheduleAddress(filterRange === "results", league), [filterRange, league]);
  const [searchQuery, setSearchQuery] = useState("");
  // revealed scores are remembered on this device (src/revealed.ts) and synced with cloud sync
  useRevealedVersion();
  const toggleReveal = (matchId: string) => setRevealed(`match:${matchId}`, !isRevealed(`match:${matchId}`));

  // A shared link: show the filter the match lives in, then scroll to it.
  const [flashMatchId, setFlashMatchId] = useState<string | null>(null);
  // a finished match opens its page in the stats hub (found by teams and day); one the hub doesn't have yet (today's)
  // opens a match page made from Riot's feeds, with every game's numbers as soon as it ends
  const [busy, setBusy] = useState<string | null>(null);
  const openDetails = (m: Match) => {
    if (busy === m.matchId) return;
    setBusy(m.matchId);
    findSeriesSlug(m)
      .catch(() => null)
      .then((slug) => {
        setBusy(null);
        navigateHub({ kind: "match", slug: slug || RIOT_PREFIX + m.matchId });
      });
  };
  useEffect(() => {
    if (!highlightMatchId) return;
    const m = schedule.find((x) => x.matchId === highlightMatchId);
    if (!m) return;
    const isToday = !!m.startTimeUtc && new Date(m.startTimeUtc).toDateString() === new Date().toDateString();
    setMainSubTab("matches");
    setFollowedOnly(false);
    setSearchQuery("");
    setFilterRange(m.state === "completed" ? "results" : isToday ? "today" : "upcoming");
    setFlashMatchId(highlightMatchId);
    const scroll = window.setTimeout(
      () => document.getElementById(`match-${highlightMatchId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
      50,
    );
    const clear = window.setTimeout(() => setFlashMatchId(null), 6000);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
    };
  }, [highlightMatchId, schedule]);

  const toggleTeamFollow = (code: string) => {
    if (!onUpdateSettings || !code || code.toUpperCase() === "TBD") return;
    const isFollowed = settings.followedTeams.includes(code);
    const next = isFollowed
      ? settings.followedTeams.filter((t) => t !== code)
      : [...settings.followedTeams, code];
    onUpdateSettings({ followedTeams: next });
  };

  // the countdowns on upcoming matches move on once a minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 60000);
    return () => window.clearInterval(t);
  }, []);

  const now = new Date();
  const todayStr = now.toDateString();
  const playerTeams = followedOnly ? followedPlayerTeams(settings.followedPlayers, catalog) : [];

  // Filter matches
  const filtered = schedule.filter((m) => {
    const matchDate = m.startTimeUtc ? new Date(m.startTimeUtc) : null;

    // Range filter
    if (filterRange === "today") {
      if (!matchDate || matchDate.toDateString() !== todayStr) return false;
    } else if (filterRange === "upcoming") {
      if (!matchDate || m.state === "completed") return false;
      // Allow matches scheduled in the future or pending today
      const isPending = m.state === "inProgress" || m.state === "unstarted";
      if (!isPending && matchDate < now) return false;
    } else if (filterRange === "results") {
      if (m.state !== "completed") return false;
    }

    if (league && m.leagueSlug !== league) return false;

    // Followed only
    if (followedOnly) {
      if (!isMatchFollowed(m, settings, catalog?.leagues, playerTeams)) return false;
    }

    // Search query (supports "Team A vs Team B" for head-to-head and "Team A, Team B" for multiple teams/leagues)
    if (searchQuery.trim()) {
      const raw = searchQuery.trim();
      const text = `${m.team1Code} ${m.team1Name} ${m.team2Code} ${m.team2Name} ${m.leagueName} ${m.blockName || ""}`.toLowerCase();
      if (/\s+vs\.?\s+|\s+v\s+/i.test(raw)) {
        const parts = raw
          .split(/\s+vs\.?\s+|\s+v\s+/i)
          .map((s) => searchAlias(s.trim()).toLowerCase())
          .filter(Boolean);
        if (parts.some((p) => !text.includes(p))) return false;
      } else {
        const terms = raw
          .split(/[,|]+/)
          .map((s) => searchAlias(s.trim()).toLowerCase())
          .filter(Boolean);
        if (terms.length && !terms.some((q) => text.includes(q))) return false;
      }
    }

    return true;
  });
  // Results: newest first. Today / upcoming: soonest first.
  filtered.sort((a, b) => {
    const d = new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime();
    return filterRange === "results" ? -d : d;
  });
  // every row of the same league (a Worlds day): phones drop the repeated name
  const oneLeague = new Set(filtered.map((m) => m.leagueName)).size === 1;
  // tomorrow's "TBD vs TBD" slots: one line per run of them instead of a tile each
  const isTbd = (m: Match) => m.state === "unstarted" && m.team1Code.toUpperCase() === "TBD" && m.team2Code.toUpperCase() === "TBD";
  const tbdRuns = new Map<string, number>();
  const tbdHidden = new Set<string>();
  filtered.forEach((m, i) => {
    if (!isTbd(m)) return;
    const prev = filtered[i - 1];
    if (prev && isTbd(prev) && dayOf(prev.startTimeUtc) === dayOf(m.startTimeUtc)) {
      tbdHidden.add(m.matchId);
      let j = i - 1;
      while (tbdHidden.has(filtered[j].matchId)) j--;
      tbdRuns.set(filtered[j].matchId, (tbdRuns.get(filtered[j].matchId) || 1) + 1);
    } else tbdRuns.set(m.matchId, 1);
  });
  /** "in 2h 15m" for a match starting within a day, null after that */
  const untilText = (iso: string) => {
    const ms = new Date(iso).getTime() - Date.now();
    if (isNaN(ms) || ms > 86400000) return null;
    if (ms <= 0) return tl("Starting soon");
    const mins = Math.ceil(ms / 60000);
    return mins < 60 ? tl("in {m} min", { m: mins }) : tl("in {h}h {m}m", { h: Math.floor(mins / 60), m: mins % 60 });
  };
  function dayOf(iso: string) {
    if (!iso) return tl("Date to be announced");
    const d = new Date(iso);
    const days = Math.round(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
        new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
        86400000,
    );
    if (days === 0) return tl("Today");
    if (days === 1) return tl("Tomorrow");
    if (days === -1) return tl("Yesterday");
    return d.toLocaleDateString(locale(), { weekday: "long", month: "short", day: "numeric" });
  }

  return (
    <div className="p-4 space-y-4 page-5xl rw-capped overflow-y-auto h-full select-none">
      <h1 className="sr-only">{tl("Schedule")}</h1>
      {/* Top Segmented Control: Schedule vs Standings */}
      <div className="flex items-center justify-between pb-2 border-b border-rw-border">
        <div className="flex items-center gap-1.5 bg-rw-deep p-1 rounded-lg border border-rw-border">
          <button
            type="button"
            onClick={() => {
              setMainSubTab("matches");
              countSecondPage();
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              mainSubTab === "matches"
                ? "bg-rw-accent text-rw-bg font-bold shadow"
                : "text-rw-sub hover:text-rw-text hover:bg-rw-raised"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{tl("Matches & Schedule")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMainSubTab("standings");
              countSecondPage();
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              mainSubTab === "standings"
                ? "bg-rw-accent text-rw-bg font-bold shadow"
                : "text-rw-sub hover:text-rw-text hover:bg-rw-raised"
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>{tl("Standings & Brackets")}</span>
          </button>
        </div>
      </div>

      {mainSubTab === "standings" ? (
        <StandingsView
          schedule={schedule}
          settings={settings}
          catalog={catalog}
          onSelectTeam={(code, name) => onSelectTeam?.(code, name)}
          onToggleTeamFollow={toggleTeamFollow}
        />
      ) : (
        <>
          {/* Filters & Search Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-rw-border">
            {/* Range Buttons */}
            <div className="flex items-center gap-1 bg-rw-deep p-1 rounded border border-rw-border">
              {(["today", "upcoming", "results"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    syncedInitialRange.current = true;
                    setFilterRange(r);
                    countSecondPage();
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-all ${
                    filterRange === r
                      ? "bg-rw-accent text-rw-bg"
                      : "text-rw-sub hover:text-rw-text hover:bg-rw-raised"
                  }`}
                >
                  {r === "today" ? tl("Today") : r === "upcoming" ? tl("Upcoming") : tl("Results")}
                </button>
              ))}
            </div>

            {/* Search & Followed Toggle */}
            <div className="flex items-center gap-2 flex-1 max-w-xs justify-end">
              {league && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "league", slug: resolveLeagueSlug(league) })}
                    className="px-2 py-1 rounded text-[11px] font-semibold text-rw-accent hover:underline whitespace-nowrap"
                  >
                    {tl("Full history and stats")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "champions", query: `league=${encodeURIComponent(resolveLeagueSlug(league))}` })}
                    className="hidden sm:inline px-1.5 py-1 rounded text-[11px] font-medium text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                  >
                    {tl("Champions")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "tiers", query: `league=${encodeURIComponent(resolveLeagueSlug(league))}` })}
                    className="hidden md:inline px-1.5 py-1 rounded text-[11px] font-medium text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                  >
                    {tl("Pro tier list")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "rankings", query: `league=${encodeURIComponent(resolveLeagueSlug(league))}` })}
                    className="hidden md:inline px-1.5 py-1 rounded text-[11px] font-medium text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                  >
                    {tl("Power rankings")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "leaders", query: `league=${encodeURIComponent(resolveLeagueSlug(league))}` })}
                    className="hidden lg:inline px-1.5 py-1 rounded text-[11px] font-medium text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                  >
                    {tl("Player leaderboards")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "finder", query: `league=${encodeURIComponent(resolveLeagueSlug(league))}` })}
                    className="hidden lg:inline px-1.5 py-1 rounded text-[11px] font-medium text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                  >
                    {tl("Game finder")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLeague(null);
                      countSecondPage();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-xs border bg-rw-accent/20 border-rw-accent text-rw-accent whitespace-nowrap"
                    title={tl("Show every league")}
                  >
                    {schedule.find((m) => m.leagueSlug === league)?.leagueName || league}
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <button
                onClick={() => setFollowedOnly(!followedOnly)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${
                  followedOnly
                    ? "bg-rw-accent/20 border-rw-accent text-rw-accent"
                    : "bg-rw-surface border-rw-border text-rw-sub hover:text-rw-text"
                }`}
                title={tl("Filter by your followed teams and leagues")}
              >
                <Star className={`w-3.5 h-3.5 ${followedOnly ? "fill-current" : ""}`} />
                <span>{tl("Followed only")}</span>
              </button>

              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-rw-sub" />
                <input
                  type="text"
                  placeholder={tl("Search team or league…")}
                  aria-label={tl("Search team or league…")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-rw-surface border border-rw-border rounded pl-8 pr-3 py-1 text-xs text-rw-text focus:outline-none focus:border-rw-accent"
                />
              </div>
              {searchQuery.trim() && (() => {
                const topPair = filtered.find(
                  (m) => m.team1Code && m.team1Code !== "TBD" && m.team2Code && m.team2Code !== "TBD",
                );
                if (!topPair) return null;
                const a = prettySlug(topPair.team1Name || topPair.team1Code);
                const b = prettySlug(topPair.team2Name || topPair.team2Code);
                return (
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => navigateHub({ kind: "prep", a, b })}
                      className="text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                    >
                      {tl("Match prep")} →
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateHub({ kind: "draft", query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}` })}
                      className="text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                    >
                      {tl("Draft board")} →
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateHub({ kind: "compare", mode: "team", a, b })}
                      className="text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                    >
                      {tl("Compare")} →
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateHub({ kind: "finder", query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}` })}
                      className="text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
                    >
                      {tl("Game finder")} →
                    </button>
                  </div>
                );
              })()}
              {filtered.length > 0 && (filterRange !== "results" || !settings.spoilerMode) && (
                <SectionCard
                  section={filterRange === "today" ? tl("Today") : filterRange === "upcoming" ? tl("Upcoming") : tl("Results")}
                  name={league ? schedule.find((m) => m.leagueSlug === league)?.leagueName || league : tl("Matches & Schedule")}
                  rows={() =>
                    filtered
                      .filter((m) => m.team1Code !== "TBD" || m.team2Code !== "TBD")
                      .slice(0, 12)
                      .map((m, idx) => {
                        const done = m.state === "completed";
                        const w2 = done && m.team2Score > m.team1Score;
                        const tStr = m.startTimeUtc ? new Date(m.startTimeUtc).toLocaleTimeString(locale(), clockOptions()) : "";
                        return {
                          rank: idx + 1,
                          team: w2 ? m.team2Name || m.team2Code : m.team1Name || m.team1Code,
                          label: `${m.team1Name || m.team1Code} vs ${m.team2Name || m.team2Code}`,
                          sub: [m.leagueName, dayOf(m.startTimeUtc), tc("short best of", "Bo{n}", { n: m.bestOf })].filter(Boolean).join(" · "),
                          value: done ? `${m.team1Score}–${m.team2Score}` : tStr,
                          win: done && m.team1Score !== m.team2Score ? true : undefined,
                        };
                      })
                  }
                />
              )}
            </div>
          </div>

          {/* Match Rows */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-rw-sub text-xs" role="status">
              {isLoading && schedule.length === 0
                ? tl("Loading the schedule…")
                : tl('No scheduled matches match your active filters. Try switching tabs or turning off "Followed only".')}
            </div>
          ) : (
            <div className="space-y-2 rw-tiles">
              {filtered.map((m, idx) => {
                const day = dayOf(m.startTimeUtc);
                const newDay = filterRange !== "today" && (idx === 0 || dayOf(filtered[idx - 1].startTimeUtc) !== day);
                const timeStr = m.startTimeUtc
                  ? new Date(m.startTimeUtc).toLocaleTimeString(locale(), clockOptions())
                  : "--:--";

                const isT1Followed = settings.followedTeams.includes(m.team1Code);
                const isT2Followed = settings.followedTeams.includes(m.team2Code);
                const shown = isRevealed(`match:${m.matchId}`);
                const isLive = m.state === "inProgress";
                const showScore = (m.state === "completed" || isLive) && (!settings.spoilerMode || shown);
                const h2h = computeHeadToHead(m.team1Code, m.team2Code, schedule, m.matchId, showScore);
                const tbdCount = tbdRuns.get(m.matchId) || 0;

                return (
                  <React.Fragment key={m.matchId}>
                  {newDay && (
                    <div className="rw-day flex items-center gap-2 px-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-rw-teal">
                      {day}
                      <span className="flex-1 h-px bg-rw-border" />
                    </div>
                  )}
                  {tbdCount > 1 ? (
                    <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-dashed border-rw-border text-xs text-rw-sub">
                      <span className="font-mono text-rw-teal font-bold">{timeStr}</span>
                      <span>{tl("{n} matches to be decided", { n: tbdCount })}</span>
                    </div>
                  ) : tbdHidden.has(m.matchId) ? null : (
                  <div
                    id={`match-${m.matchId}`}
                    onClick={(e) => {
                      // a finished match's tile opens its stats page; its buttons and team names keep their own clicks
                      if (m.state !== "completed" || (e.target as HTMLElement).closest("button, a, img, [role=button], input")) return;
                      openDetails(m);
                    }}
                    className={`@container bg-rw-surface border px-3 sm:px-4 py-2.5 rounded-lg transition-all ${
                      m.state === "completed" ? "cursor-pointer " : ""
                    }${
                      flashMatchId === m.matchId
                        ? "border-rw-teal ring-2 ring-rw-teal/40"
                        : "border-rw-border hover:border-rw-accent/80"
                    }`}
                  >
                    {/* laid out by the tile's own width: on a wide screen the tiles sit two to a row */}
                    <div className="flex flex-wrap @min-[36rem]:flex-nowrap items-center justify-between gap-y-1.5 h-full">
                    {/* Time, Calendar & League */}
                    <div className="flex items-center gap-2 min-w-0 @min-[36rem]:w-56 @min-[56rem]:w-72 shrink @min-[36rem]:shrink-0 order-1">
                      <span className="font-mono text-xs text-rw-teal font-bold shrink-0">{timeStr}</span>
                      {m.state === "unstarted" && <AddToCalendarMenu match={m} onOpenUrl={onOpenUrl} compact={true} />}
                      <MatchPrepButton match={m} compact />
                      <MatchOverviewButton match={m} compact />
                      <span
                        className={`text-[11px] text-rw-sub truncate font-medium ${oneLeague ? "@max-[36rem]:hidden" : ""}`}
                        title={m.blockName ? `${m.leagueName} · ${m.blockName}` : m.leagueName}
                      >
                        <span
                          {...clickable(() => {
                            setLeague(m.leagueSlug);
                            countSecondPage();
                          })}
                          className="hover:text-rw-accent cursor-pointer"
                        >
                          {m.leagueName}
                        </span>
                        {m.blockName && <span className="hidden @min-[56rem]:inline text-rw-muted"> · {m.blockName}</span>}
                      </span>
                    </div>

                    {/* Teams & Score */}
                    <div className="flex items-center justify-center gap-2 @min-[36rem]:gap-3 w-full @min-[36rem]:w-auto @min-[36rem]:flex-1 order-3 @min-[36rem]:order-2 min-w-0">
                      {/* Team 1 */}
                      <div className="flex items-center gap-1.5 flex-1 justify-end text-right min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTeamFollow(m.team1Code);
                          }}
                          className={`p-1.5 -m-1 rounded hover:bg-rw-border transition-colors shrink-0 ${
                            isT1Followed ? "text-rw-accent" : "text-rw-sub hover:text-rw-accent"
                          }`}
                          aria-label={isT1Followed ? tl("Unfollow {name}", { name: m.team1Code }) : tl("Follow {name}", { name: m.team1Code })}
                          title={isT1Followed ? tl("Unfollow {name}", { name: m.team1Code }) : tl("Follow {name}", { name: m.team1Code })}
                        >
                          <Star className={`w-3.5 h-3.5 ${isT1Followed ? "fill-rw-accent" : ""}`} />
                        </button>
                        <span
                          {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                          className="text-xs font-bold text-rw-text hover:text-rw-accent cursor-pointer transition-colors"
                          title={tl("Click to view {team} roster", { team: m.team1Name })}
                        >
                          {m.team1Code}
                        </span>
                        {m.team1Code.toUpperCase() !== "TBD" && (
                          <span
                            {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                            className="cursor-pointer shrink-0 inline-flex items-center"
                          >
                            <TeamLogo name={m.team1Name} code={m.team1Code} src={m.team1Image} size={20} />
                          </span>
                        )}
                      </div>

                      {/* Score / VS Center with Per-Match Reveal & H2H */}
                      <div className="flex flex-col items-center justify-center w-24 @min-[36rem]:w-28 shrink-0 text-center">
                        <div className="font-mono font-bold text-xs px-2 flex items-center justify-center">
                          {showScore ? (
                            <div
                              onClick={() => settings.spoilerMode && toggleReveal(m.matchId)}
                              className={`flex flex-col items-center gap-0.5 text-xs ${
                                settings.spoilerMode
                                  ? "cursor-pointer hover:text-rw-accent bg-rw-bg px-2 py-0.5 rounded border border-rw-border"
                                  : ""
                              }`}
                              title={settings.spoilerMode ? tl("Click to re-hide score") : undefined}
                            >
                              <span className="text-rw-text tabular-nums">
                                <span className={m.team1Score > m.team2Score ? "text-rw-teal" : ""}>{m.team1Score}</span>
                                <span className="text-rw-muted"> : </span>
                                <span className={m.team2Score > m.team1Score ? "text-rw-teal" : ""}>{m.team2Score}</span>
                              </span>
                              {(m.team1Score ?? 0) + (m.team2Score ?? 0) > 0 && (
                                <span className="w-10 h-1 rounded-full bg-rw-border/70 overflow-hidden flex gap-[1px]" aria-hidden="true">
                                  <span
                                    className="h-full bg-rw-side-a/80"
                                    style={{ width: `${Math.round(((m.team1Score ?? 0) / ((m.team1Score ?? 0) + (m.team2Score ?? 0))) * 100)}%` }}
                                  />
                                  <span className="h-full flex-1 bg-rw-side-b/80" />
                                </span>
                              )}
                            </div>
                          ) : (m.state === "completed" || isLive) && settings.spoilerMode ? (
                            <button
                              type="button"
                              onClick={() => toggleReveal(m.matchId)}
                              className="text-[11px] px-2 py-0.5 rounded bg-rw-bg border border-rw-border text-rw-sub hover:text-rw-accent hover:border-rw-accent/60 transition-colors cursor-pointer"
                              title={isLive ? tl("Click to reveal the live score") : tl("Click to reveal final score")}
                            >
                              {tl("Reveal")}
                            </button>
                          ) : m.team1Code && m.team1Code !== "TBD" && m.team2Code && m.team2Code !== "TBD" ? (
                            <button
                              type="button"
                              onClick={() => {
                                const yr = m.startTimeUtc?.slice(0, 4);
                                navigateHub({
                                  kind: "compare",
                                  mode: "team",
                                  a: prettySlug(m.team1Name || m.team1Code),
                                  b: prettySlug(m.team2Name || m.team2Code),
                                  period: yr ? `y${yr}` : undefined,
                                });
                              }}
                              title={tl("Compare")}
                              className="text-rw-sub hover:text-rw-accent hover:underline font-medium"
                            >
                              {tl("VS")}
                            </button>
                          ) : (
                            <span className="text-rw-sub font-medium">{tl("VS")}</span>
                          )}
                        </div>
                        {m.team1Code && m.team1Code !== "TBD" && m.team2Code && m.team2Code !== "TBD" ? (
                          <button
                            type="button"
                            onClick={() => {
                              const yr = m.startTimeUtc?.slice(0, 4);
                              navigateHub({
                                kind: "prep",
                                a: prettySlug(m.team1Name || m.team1Code),
                                b: prettySlug(m.team2Name || m.team2Code),
                                period: yr ? `y${yr}` : undefined,
                              });
                            }}
                            className="@min-[36rem]:hidden text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
                          >
                            {tc("short best of", "Bo{n}", { n: m.bestOf })}
                          </button>
                        ) : (
                          <span className="@min-[36rem]:hidden text-[10px] text-rw-muted">{tc("short best of", "Bo{n}", { n: m.bestOf })}</span>
                        )}
                        {/* Swiss: what this match decides */}
                        {swissStakes(m) && (
                          <span className={`text-[9px] font-bold uppercase tracking-wide leading-tight ${swissStakes(m) === "advance" ? "text-rw-teal" : "text-rw-red"}`}>
                            {swissStakes(m) === "both" ? tl("Win and in, lose and out") : swissStakes(m) === "advance" ? tl("Winner advances") : tl("Elimination match")}
                          </span>
                        )}
                        {(showScore || m.state !== "completed") && h2h && (
                          <div className="@max-[36rem]:hidden">
                          <H2HMeter team1Code={m.team1Code} team2Code={m.team2Code} h2h={h2h} matchId={m.matchId} countThisMatch={showScore} />
                          </div>
                        )}
                      </div>

                      {/* Team 2 */}
                      <div className="flex items-center gap-1.5 flex-1 justify-start text-left min-w-0">
                        {m.team2Code.toUpperCase() !== "TBD" && (
                          <span
                            {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                            className="cursor-pointer shrink-0 inline-flex items-center"
                          >
                            <TeamLogo name={m.team2Name} code={m.team2Code} src={m.team2Image} size={20} />
                          </span>
                        )}
                        <span
                          {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                          className="text-xs font-bold text-rw-text hover:text-rw-accent cursor-pointer transition-colors"
                          title={tl("Click to view {team} roster", { team: m.team2Name })}
                        >
                          {m.team2Code}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTeamFollow(m.team2Code);
                          }}
                          className={`p-1.5 -m-1 rounded hover:bg-rw-border transition-colors shrink-0 ${
                            isT2Followed ? "text-rw-accent" : "text-rw-sub hover:text-rw-accent"
                          }`}
                          aria-label={isT2Followed ? tl("Unfollow {name}", { name: m.team2Code }) : tl("Follow {name}", { name: m.team2Code })}
                          title={isT2Followed ? tl("Unfollow {name}", { name: m.team2Code }) : tl("Follow {name}", { name: m.team2Code })}
                        >
                          <Star className={`w-3.5 h-3.5 ${isT2Followed ? "fill-rw-accent" : ""}`} />
                        </button>
                      </div>
                    </div>

                    {/* Status / Best Of */}
                    <div className="flex items-center gap-2 @min-[36rem]:w-48 justify-end shrink-0 min-w-0 ml-auto @min-[36rem]:ml-0 order-2 @min-[36rem]:order-3">
                      {/* phones: just the status here, so the row fits on two lines (best-of moves under VS) */}
                      <span className="@max-[36rem]:hidden">
                        <ShareMatchButton match={m} />
                      </span>
                      {m.team1Code && m.team1Code !== "TBD" && m.team2Code && m.team2Code !== "TBD" ? (
                        <button
                          type="button"
                          onClick={() => {
                            const yr = m.startTimeUtc?.slice(0, 4);
                            navigateHub({
                              kind: "prep",
                              a: prettySlug(m.team1Name || m.team1Code),
                              b: prettySlug(m.team2Name || m.team2Code),
                              period: yr ? `y${yr}` : undefined,
                            });
                          }}
                          className="@max-[36rem]:hidden text-[10px] text-rw-sub hover:text-rw-accent bg-rw-bg px-2 py-0.5 rounded border border-rw-border hover:border-rw-accent/60 font-medium transition-colors"
                        >
                          {tc("short best of", "Bo{n}", { n: m.bestOf })}
                        </button>
                      ) : (
                        <span className="@max-[36rem]:hidden text-[10px] text-rw-sub bg-rw-bg px-2 py-0.5 rounded border border-rw-border font-medium">
                          {tc("short best of", "Bo{n}", { n: m.bestOf })}
                        </span>
                      )}
                      {m.state === "completed" ? (
                        <button
                          type="button"
                          onClick={() => openDetails(m)}
                          disabled={busy === m.matchId}
                          className="flex items-center gap-1 text-[10px] text-rw-accent font-semibold hover:underline disabled:opacity-60"
                          title={tl("Open the match: every game's draft and stats")}
                        >
                          <BarChart3 className="w-3 h-3" />
                          {tl("Details")}
                        </button>
                      ) : isLive ? (
                        <span className="flex items-center gap-1 text-[10px] text-rw-red font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-rw-red animate-pulse" />
                          {tl("LIVE")}
                        </span>
                      ) : m.team1Code && m.team1Code !== "TBD" && m.team2Code && m.team2Code !== "TBD" ? (
                        <button
                          type="button"
                          onClick={() => {
                            const yr = m.startTimeUtc?.slice(0, 4);
                            navigateHub({
                              kind: "prep",
                              a: prettySlug(m.team1Name || m.team1Code),
                              b: prettySlug(m.team2Name || m.team2Code),
                              period: yr ? `y${yr}` : undefined,
                            });
                          }}
                          className="text-[10px] text-rw-accent hover:underline font-semibold whitespace-nowrap truncate min-w-0"
                          title={m.blockName || undefined}
                        >
                          {untilText(m.startTimeUtc) || m.blockName || tl("UPCOMING")}
                        </button>
                      ) : (
                        <span className="text-[10px] text-rw-accent font-semibold whitespace-nowrap truncate min-w-0" title={m.blockName || undefined}>
                          {untilText(m.startTimeUtc) || m.blockName || tl("UPCOMING")}
                        </span>
                      )}
                    </div>
                    </div>
                  </div>
                  )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};


