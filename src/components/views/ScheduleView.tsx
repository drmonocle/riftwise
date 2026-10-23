import React, { useEffect, useState } from "react";
import { Match, AppSettings, CatalogData } from "../../types";
import { Search, Calendar, Star, Trophy, BarChart3 } from "lucide-react";
import { AddToCalendarMenu } from "../AddToCalendarMenu";
import { MatchPrepButton } from "../MatchPrepButton";
import { ShareMatchButton } from "../ShareMatchButton";
import { isMatchFollowed, followedPlayerTeams, computeHeadToHead } from "../../helpers";
import { clickable } from "../../a11y";
import { H2HMeter } from "../H2HMeter";
import { StandingsView } from "./StandingsView";
import { tl, locale, clockOptions, tc } from "../../i18n";
import { searchAlias } from "../../searchAliases";
import { isRevealed, setRevealed, useRevealedVersion } from "../../revealed";
import { findSeriesSlug } from "../../hub/seriesLookup";
import { fetchMatchGames } from "../../api";
import { LiveGamePanel } from "../LiveGamePanel";
import { navigateHub } from "../../hub/route";
import { riotImg } from "../../riotImage";

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
  const [filterRange, setFilterRange] = useState<"today" | "upcoming" | "results">(() => {
    const today = new Date().toDateString();
    const hasTodayMatches = schedule.some((m) => {
      if (!m.startTimeUtc) return false;
      return new Date(m.startTimeUtc).toDateString() === today;
    });
    return hasTodayMatches ? "today" : "upcoming";
  });
  const [followedOnly, setFollowedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // revealed scores are remembered on this device (src/revealed.ts) and synced with cloud sync
  useRevealedVersion();
  const toggleReveal = (matchId: string) => setRevealed(`match:${matchId}`, !isRevealed(`match:${matchId}`));

  // A shared link: show the filter the match lives in, then scroll to it.
  const [flashMatchId, setFlashMatchId] = useState<string | null>(null);
  // a finished match opens its page in the stats hub (found by teams and day); "missing" until the nightly update has it
  const [detail, setDetail] = useState<Record<string, "busy" | "missing">>({});
  // until then, its games' final numbers from Riot's live stats feed, shown under the match (available as it ends)
  const [finals, setFinals] = useState<Record<string, Match | null>>({});
  const showFinals = (m: Match) => {
    if (finals[m.matchId] !== undefined) {
      setFinals((f) => {
        const rest = { ...f };
        delete rest[m.matchId];
        return rest;
      });
      return;
    }
    setFinals((f) => ({ ...f, [m.matchId]: null }));
    fetchMatchGames(m)
      .then((full) => setFinals((f) => (m.matchId in f ? { ...f, [m.matchId]: full } : f)))
      .catch(() => setFinals((f) => (m.matchId in f ? { ...f, [m.matchId]: { ...m, games: [] } } : f)));
  };
  const openDetails = (m: Match) => {
    if (detail[m.matchId] === "busy") return;
    if (detail[m.matchId] === "missing") return showFinals(m);
    setDetail((d) => ({ ...d, [m.matchId]: "busy" }));
    findSeriesSlug(m)
      .then((slug) => {
        if (slug) {
          setDetail((d) => {
            const rest = { ...d };
            delete rest[m.matchId];
            return rest;
          });
          navigateHub({ kind: "match", slug });
        } else {
          setDetail((d) => ({ ...d, [m.matchId]: "missing" }));
          showFinals(m);
        }
      })
      .catch(() => {
        setDetail((d) => ({ ...d, [m.matchId]: "missing" }));
        showFinals(m);
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

    // Followed only
    if (followedOnly) {
      if (!isMatchFollowed(m, settings, catalog?.leagues, playerTeams)) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchAlias(searchQuery).toLowerCase();
      const text = `${m.team1Code} ${m.team1Name} ${m.team2Code} ${m.team2Name} ${m.leagueName}`.toLowerCase();
      if (!text.includes(q)) return false;
    }

    return true;
  });
  // Results: newest first. Today / upcoming: soonest first.
  filtered.sort((a, b) => {
    const d = new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime();
    return filterRange === "results" ? -d : d;
  });
  const dayOf = (iso: string) => {
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
  };

  return (
    <div className="p-4 space-y-4 page-4xl rw-capped overflow-y-auto h-full select-none">
      {/* Top Segmented Control: Schedule vs Standings */}
      <div className="flex items-center justify-between pb-2 border-b border-rw-border">
        <div className="flex items-center gap-1.5 bg-rw-deep p-1 rounded-lg border border-rw-border">
          <button
            type="button"
            onClick={() => setMainSubTab("matches")}
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
            onClick={() => setMainSubTab("standings")}
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
                  onClick={() => setFilterRange(r)}
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

                return (
                  <React.Fragment key={m.matchId}>
                  {newDay && (
                    <div className="rw-day flex items-center gap-2 px-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-rw-teal">
                      {day}
                      <span className="flex-1 h-px bg-rw-border" />
                    </div>
                  )}
                  <div
                    id={`match-${m.matchId}`}
                    onClick={(e) => {
                      // a finished match's tile opens its stats page; its buttons and team names keep their own clicks
                      if (m.state !== "completed" || (e.target as HTMLElement).closest("button, a, img, [role=button], input")) return;
                      openDetails(m);
                    }}
                    className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-1.5 bg-rw-surface border px-3 sm:px-4 py-2.5 rounded-lg transition-all ${
                      m.state === "completed" ? "cursor-pointer " : ""
                    }${
                      flashMatchId === m.matchId
                        ? "border-rw-teal ring-2 ring-rw-teal/40 shadow-lg shadow-rw-teal/10"
                        : "border-rw-border hover:border-rw-accent/80"
                    }`}
                  >
                    {/* Time, Calendar & League */}
                    <div className="flex items-center gap-2 min-w-0 sm:w-44 shrink sm:shrink-0 order-1">
                      <span className="font-mono text-xs text-rw-teal font-bold shrink-0">{timeStr}</span>
                      {m.state === "unstarted" && <AddToCalendarMenu match={m} onOpenUrl={onOpenUrl} compact={true} />}
                      {m.state !== "completed" && <MatchPrepButton match={m} compact />}
                      <span className="text-[11px] text-rw-sub truncate font-medium">{m.leagueName}</span>
                    </div>

                    {/* Teams & Score */}
                    <div className="flex items-center justify-center gap-2 sm:gap-4 w-full sm:w-auto sm:flex-1 order-3 sm:order-2 min-w-0">
                      {/* Team 1 */}
                      <div className="flex items-center gap-1.5 flex-1 sm:flex-none sm:w-36 justify-end text-right min-w-0">
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
                        {m.team1Image && (
                          <img
                            {...riotImg(m.team1Image, 64)}
                            alt=""
                            className="w-5 h-5 object-contain cursor-pointer"
                            onClick={() => onSelectTeam?.(m.team1Code, m.team1Name)}
                          />
                        )}
                      </div>

                      {/* Score / VS Center with Per-Match Reveal & H2H */}
                      <div className="flex flex-col items-center justify-center min-w-[70px]">
                        <div className="font-mono font-bold text-xs px-2 flex items-center justify-center">
                          {showScore ? (
                            <div
                              onClick={() => settings.spoilerMode && toggleReveal(m.matchId)}
                              className={`text-xs ${
                                settings.spoilerMode
                                  ? "cursor-pointer hover:text-rw-accent bg-rw-bg px-2 py-0.5 rounded border border-rw-border"
                                  : ""
                              }`}
                              title={settings.spoilerMode ? tl("Click to re-hide score") : undefined}
                            >
                              <span className="text-rw-text">
                                {m.team1Score} : {m.team2Score}
                              </span>
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
                          ) : (
                            <span className="text-rw-sub font-medium">{tl("VS")}</span>
                          )}
                        </div>
                        {(showScore || m.state !== "completed") && h2h && (
                          <H2HMeter team1Code={m.team1Code} team2Code={m.team2Code} h2h={h2h} matchId={m.matchId} countThisMatch={showScore} />
                        )}
                      </div>

                      {/* Team 2 */}
                      <div className="flex items-center gap-1.5 flex-1 sm:flex-none sm:w-36 justify-start text-left min-w-0">
                        {m.team2Image && (
                          <img
                            {...riotImg(m.team2Image, 64)}
                            alt=""
                            className="w-5 h-5 object-contain cursor-pointer"
                            onClick={() => onSelectTeam?.(m.team2Code, m.team2Name)}
                          />
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
                    <div className="flex items-center gap-2 sm:w-32 justify-end shrink-0 ml-auto sm:ml-0 order-2 sm:order-3">
                      <ShareMatchButton match={m} />
                      <span className="text-[10px] text-rw-sub bg-rw-bg px-2 py-0.5 rounded border border-rw-border font-medium">
                        {tc("short best of", "Bo{n}", { n: m.bestOf })}
                      </span>
                      {m.state === "completed" ? (
                        <button
                          type="button"
                          onClick={() => openDetails(m)}
                          disabled={detail[m.matchId] === "busy"}
                          className="flex items-center gap-1 text-[10px] text-rw-teal font-semibold hover:underline disabled:opacity-60"
                          title={detail[m.matchId] === "missing" ? tl("Final numbers from Riot's live stats feed. The full stats page comes with the next stats update.") : tl("Open the match: every game's draft and stats")}
                        >
                          <BarChart3 className="w-3 h-3" />
                          {detail[m.matchId] === "missing" ? (finals[m.matchId] !== undefined ? tl("Hide stats") : tl("Game stats")) : tl("Details")}
                        </button>
                      ) : isLive ? (
                        <span className="flex items-center gap-1 text-[10px] text-rw-red font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-rw-red animate-pulse" />
                          {tl("LIVE")}
                        </span>
                      ) : (
                        <span className="text-[10px] text-rw-accent font-semibold">{tl("UPCOMING")}</span>
                      )}
                    </div>
                  </div>
                  {finals[m.matchId] !== undefined && <FinalStats match={finals[m.matchId]} showStats={showScore} />}
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


/** A finished match's games, final numbers from Riot's live stats feed (null: still asking Riot for its games). */
const FinalStats: React.FC<{ match: Match | null; showStats: boolean }> = ({ match, showStats }) => {
  const games = (match?.games || []).filter((g) => g.state === "completed");
  return (
    <div className="bg-rw-surface border border-rw-border rounded-lg px-3 sm:px-4 pb-3 -mt-1">
      {!match ? (
        <p className="text-[11px] text-rw-muted text-center pt-3">{tl("Loading…")}</p>
      ) : games.length === 0 ? (
        <p className="text-[11px] text-rw-muted text-center pt-3">{tl("Live game stats aren't available right now.")}</p>
      ) : (
        games.map((g) => <LiveGamePanel key={g.id} match={match} only={g} showStats={showStats} startOpen={games.length === 1} />)
      )}
      <p className="text-[10px] text-rw-muted pt-2">{tl("The full stats page for this match comes with the next stats update.")}</p>
    </div>
  );
};
