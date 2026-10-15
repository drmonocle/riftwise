import React, { useEffect, useState } from "react";
import { Match, AppSettings, CatalogData } from "../../types";
import { Search, Calendar, Star, Trophy } from "lucide-react";
import { AddToCalendarMenu } from "../AddToCalendarMenu";
import { ShareMatchButton } from "../ShareMatchButton";
import { isMatchFollowed, computeHeadToHead } from "../../helpers";
import { clickable } from "../../a11y";
import { H2HMeter } from "../H2HMeter";
import { StandingsView } from "./StandingsView";
import { tl, locale, clockOptions } from "../../i18n";
import { searchAlias } from "../../searchAliases";

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
  const [revealedMatchIds, setRevealedMatchIds] = useState<Record<string, boolean>>({});

  const toggleReveal = (matchId: string) => {
    setRevealedMatchIds((prev) => ({ ...prev, [matchId]: !prev[matchId] }));
  };

  // A shared link: show the filter the match lives in, then scroll to it.
  const [flashMatchId, setFlashMatchId] = useState<string | null>(null);
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
    if (!onUpdateSettings || !code) return;
    const isFollowed = settings.followedTeams.includes(code);
    const next = isFollowed
      ? settings.followedTeams.filter((t) => t !== code)
      : [...settings.followedTeams, code];
    onUpdateSettings({ followedTeams: next });
  };

  const now = new Date();
  const todayStr = now.toDateString();

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
      if (!isMatchFollowed(m, settings, catalog?.leagues)) return false;
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
    <div className="p-4 space-y-4 max-w-4xl mx-auto overflow-y-auto h-full select-none">
      {/* Top Segmented Control: Schedule vs Standings */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1e282d]">
        <div className="flex items-center gap-1.5 bg-[#0a0e17] p-1 rounded-lg border border-[#1e282d]">
          <button
            type="button"
            onClick={() => setMainSubTab("matches")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              mainSubTab === "matches"
                ? "bg-[#c8aa6e] text-[#091428] font-bold shadow"
                : "text-[#9bb3c9] hover:text-[#f0e6d2] hover:bg-[#121e2d]"
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
                ? "bg-[#c8aa6e] text-[#091428] font-bold shadow"
                : "text-[#9bb3c9] hover:text-[#f0e6d2] hover:bg-[#121e2d]"
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
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1e282d]">
            {/* Range Buttons */}
            <div className="flex items-center gap-1 bg-[#0a0e17] p-1 rounded border border-[#1e282d]">
              {(["today", "upcoming", "results"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setFilterRange(r)}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-all ${
                    filterRange === r
                      ? "bg-[#c8aa6e] text-[#091428]"
                      : "text-[#9bb3c9] hover:text-[#f0e6d2] hover:bg-[#121e2d]"
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
                    ? "bg-[#c8aa6e]/20 border-[#c8aa6e] text-[#c8aa6e]"
                    : "bg-[#0a1420] border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2]"
                }`}
                title={tl("Filter by your followed teams and leagues")}
              >
                <Star className={`w-3.5 h-3.5 ${followedOnly ? "fill-current" : ""}`} />
                <span>{tl("Followed only")}</span>
              </button>

              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#9bb3c9]" />
                <input
                  type="text"
                  placeholder={tl("Search team or league…")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0a1420] border border-[#1e282d] rounded pl-8 pr-3 py-1 text-xs text-[#f0e6d2] focus:outline-none focus:border-[#c8aa6e]"
                />
              </div>
            </div>
          </div>

          {/* Match Rows */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-[#9bb3c9] text-xs" role="status">
              {isLoading && schedule.length === 0
                ? tl("Loading the schedule…")
                : tl('No scheduled matches match your active filters. Try switching tabs or turning off "Followed only".')}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((m, idx) => {
                const day = dayOf(m.startTimeUtc);
                const newDay = filterRange !== "today" && (idx === 0 || dayOf(filtered[idx - 1].startTimeUtc) !== day);
                const timeStr = m.startTimeUtc
                  ? new Date(m.startTimeUtc).toLocaleTimeString(locale(), clockOptions())
                  : "--:--";

                const isT1Followed = settings.followedTeams.includes(m.team1Code);
                const isT2Followed = settings.followedTeams.includes(m.team2Code);
                const isRevealed = !!revealedMatchIds[m.matchId];
                const isLive = m.state === "inProgress";
                const showScore = (m.state === "completed" || isLive) && (!settings.spoilerMode || isRevealed);
                const h2h = computeHeadToHead(m.team1Code, m.team2Code, schedule, m.matchId, showScore);

                return (
                  <React.Fragment key={m.matchId}>
                  {newDay && (
                    <div className="flex items-center gap-2 px-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#0ac8b9]">
                      {day}
                      <span className="flex-1 h-px bg-[#1e282d]" />
                    </div>
                  )}
                  <div
                    id={`match-${m.matchId}`}
                    className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-1.5 bg-[#0a1420] border px-3 sm:px-4 py-2.5 rounded-lg transition-all ${
                      flashMatchId === m.matchId
                        ? "border-[#0ac8b9] ring-2 ring-[#0ac8b9]/40 shadow-lg shadow-[#0ac8b9]/10"
                        : "border-[#1e282d] hover:border-[#c8aa6e]/80"
                    }`}
                  >
                    {/* Time, Calendar & League */}
                    <div className="flex items-center gap-2 min-w-0 sm:w-44 shrink sm:shrink-0 order-1">
                      <span className="font-mono text-xs text-[#0ac8b9] font-bold shrink-0">{timeStr}</span>
                      {m.state === "unstarted" && (
                        <AddToCalendarMenu match={m} onOpenUrl={onOpenUrl} compact={true} />
                      )}
                      <span className="text-[11px] text-[#9bb3c9] truncate font-medium">{m.leagueName}</span>
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
                          className={`p-0.5 rounded hover:bg-[#1e282d] transition-colors shrink-0 ${
                            isT1Followed ? "text-[#c8aa6e]" : "text-[#9bb3c9] hover:text-[#c8aa6e]"
                          }`}
                          aria-label={isT1Followed ? tl("Unfollow {name}", { name: m.team1Code }) : tl("Follow {name}", { name: m.team1Code })}
                          title={isT1Followed ? tl("Unfollow {name}", { name: m.team1Code }) : tl("Follow {name}", { name: m.team1Code })}
                        >
                          <Star className={`w-3.5 h-3.5 ${isT1Followed ? "fill-[#c8aa6e]" : ""}`} />
                        </button>
                        <span
                          {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                          className="text-xs font-bold text-[#f0e6d2] hover:text-[#c8aa6e] cursor-pointer transition-colors"
                          title={tl("Click to view {team} roster", { team: m.team1Name })}
                        >
                          {m.team1Code}
                        </span>
                        {m.team1Image && (
                          <img
                            src={m.team1Image}
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
                                  ? "cursor-pointer hover:text-[#c8aa6e] bg-[#091428] px-2 py-0.5 rounded border border-[#1e282d]"
                                  : ""
                              }`}
                              title={settings.spoilerMode ? tl("Click to re-hide score") : undefined}
                            >
                              <span className="text-[#f0e6d2]">
                                {m.team1Score} : {m.team2Score}
                              </span>
                            </div>
                          ) : (m.state === "completed" || isLive) && settings.spoilerMode ? (
                            <button
                              type="button"
                              onClick={() => toggleReveal(m.matchId)}
                              className="text-[11px] px-2 py-0.5 rounded bg-[#091428] border border-[#1e282d] text-[#9bb3c9] hover:text-[#c8aa6e] hover:border-[#c8aa6e]/60 transition-colors cursor-pointer"
                              title={isLive ? tl("Click to reveal the live score") : tl("Click to reveal final score")}
                            >
                              {tl("Reveal")}
                            </button>
                          ) : (
                            <span className="text-[#9bb3c9] font-medium">{tl("VS")}</span>
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
                            src={m.team2Image}
                            alt=""
                            className="w-5 h-5 object-contain cursor-pointer"
                            onClick={() => onSelectTeam?.(m.team2Code, m.team2Name)}
                          />
                        )}
                        <span
                          {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                          className="text-xs font-bold text-[#f0e6d2] hover:text-[#c8aa6e] cursor-pointer transition-colors"
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
                          className={`p-0.5 rounded hover:bg-[#1e282d] transition-colors shrink-0 ${
                            isT2Followed ? "text-[#c8aa6e]" : "text-[#9bb3c9] hover:text-[#c8aa6e]"
                          }`}
                          aria-label={isT2Followed ? tl("Unfollow {name}", { name: m.team2Code }) : tl("Follow {name}", { name: m.team2Code })}
                          title={isT2Followed ? tl("Unfollow {name}", { name: m.team2Code }) : tl("Follow {name}", { name: m.team2Code })}
                        >
                          <Star className={`w-3.5 h-3.5 ${isT2Followed ? "fill-[#c8aa6e]" : ""}`} />
                        </button>
                      </div>
                    </div>

                    {/* Status / Best Of */}
                    <div className="flex items-center gap-2 sm:w-32 justify-end shrink-0 ml-auto sm:ml-0 order-2 sm:order-3">
                      <ShareMatchButton match={m} />
                      <span className="text-[10px] text-[#9bb3c9] bg-[#091428] px-2 py-0.5 rounded border border-[#1e282d] font-medium">
                        Bo{m.bestOf}
                      </span>
                      {m.state === "completed" ? (
                        <span className="text-[10px] text-[#9bb3c9] font-semibold">{tl("FINAL")}</span>
                      ) : isLive ? (
                        <span className="flex items-center gap-1 text-[10px] text-[#e84057] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#e84057] animate-pulse" />
                          {tl("LIVE")}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#c8aa6e] font-semibold">{tl("UPCOMING")}</span>
                      )}
                    </div>
                  </div>
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

