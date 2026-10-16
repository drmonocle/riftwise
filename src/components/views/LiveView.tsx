import React, { useState, useEffect } from "react";
import { Match, AppSettings, CatalogData, LiveShow } from "../../types";
import { Tv, ExternalLink, Calendar, Clock, ChevronRight, Star, Swords } from "lucide-react";
import { AddToCalendarMenu } from "../AddToCalendarMenu";
import { MatchPrepButton } from "../MatchPrepButton";
import { LiveGamePanel } from "../LiveGamePanel";
import { WinChanceLine } from "../WinChanceLine";
import { ShareMatchButton } from "../ShareMatchButton";
import {
  getLeagueBroadcastStreams,
  isMatchFollowed,
  computeHeadToHead,
  isUpcomingOrDelayed,
  minutesLate,
  formatLate,
  DELAY_GRACE_MIN,
} from "../../helpers";
import { clickable } from "../../a11y";
import { H2HMeter } from "../H2HMeter";
import { tl, tc, locale } from "../../i18n";

interface LiveViewProps {
  matches: Match[];
  schedule: Match[];
  settings: AppSettings;
  catalog?: CatalogData;
  onOpenUrl: (url: string) => void;
  onSelectTab: (tab: any) => void;
  onUpdateSettings?: (s: Partial<AppSettings>) => void;
  onSelectTeam?: (teamCode: string, teamName?: string) => void;
  /** From a #match/<id> link: scroll to this live match and flash it. */
  highlightMatchId?: string | null;
  /** True until the first data sync has finished. */
  isLoading?: boolean;
  /** Broadcast shows Riot reports as on air right now (they have no teams). */
  liveShows?: LiveShow[];
}

// Live ticking countdown hook
function useCountdown(utcDateStr?: string) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
    formatted: string;
  }>({ hours: 0, minutes: 0, seconds: 0, isPast: false, formatted: "" });

  useEffect(() => {
    if (!utcDateStr) return;

    const calc = () => {
      const target = new Date(utcDateStr).getTime();
      const now = Date.now();
      const diff = target - now;

      if (isNaN(target)) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isPast: false, formatted: tl("Scheduled") });
        return;
      }

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isPast: true, formatted: tl("Starting momentarily") });
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      let str = "";
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        str = tl("Starts in {d}d {h}h {m}m", { d: days, h: remHours, m: minutes });
      } else if (hours > 0) {
        str = tl("Starts in {h}h {m}m {s}s", { h: hours, m: minutes, s: seconds });
      } else {
        str = tl("Starts in {m}m {s}s", { m: minutes, s: seconds });
      }

      setTimeLeft({ hours, minutes, seconds, isPast: false, formatted: str });
    };

    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [utcDateStr]);

  return timeLeft;
}

function formatMatchTime(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();

    const timeStr = d.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
    if (isToday) return tl("Today at {time}", { time: timeStr });

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const isTomorrow =
      d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear();

    if (isTomorrow) return tl("Tomorrow at {time}", { time: timeStr });

    return tl("{date} at {time}", { date: d.toLocaleDateString(locale(), { month: "short", day: "numeric" }), time: timeStr });
  } catch {
    return iso;
  }
}

export const LiveView: React.FC<LiveViewProps> = ({
  matches,
  schedule,
  settings,
  catalog,
  onOpenUrl,
  onSelectTab,
  onUpdateSettings,
  onSelectTeam,
  highlightMatchId,
  isLoading,
  liveShows = [],
}) => {
  const [revealedMatchIds, setRevealedMatchIds] = useState<Record<string, boolean>>({});

  const toggleReveal = (matchId: string) => {
    setRevealedMatchIds((prev) => ({ ...prev, [matchId]: !prev[matchId] }));
  };

  // A shared link to a live match: scroll to its card and flash it.
  const [flashMatchId, setFlashMatchId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightMatchId) return;
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
  }, [highlightMatchId]);

  const toggleTeamFollow = (code: string) => {
    if (!onUpdateSettings || !code) return;
    const isFollowed = settings.followedTeams.includes(code);
    const next = isFollowed
      ? settings.followedTeams.filter((t) => t !== code)
      : [...settings.followedTeams, code];
    onUpdateSettings({ followedTeams: next });
  };

  const now = Date.now();
  // Leagues whose broadcast is on air right now. A match in one of them that is past its start
  // time is running late, not gone, so it stays on this tab (Riot keeps it "unstarted").
  const liveLeagueSlugs = new Set(liveShows.map((s) => s.leagueSlug.toLowerCase()));
  const unstarted = schedule
    .filter((m) => isUpcomingOrDelayed(m, liveLeagueSlugs, now))
    .sort((a, b) => new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime());

  const hasWatchlist =
    settings.followedTeams.length > 0 ||
    settings.followedLeagues.length > 0 ||
    (settings.followedRegions && settings.followedRegions.length > 0);

  // Matches that match user's watchlist (followed teams, followed leagues, or followed regions)
  const isFollowed = (m: Match) => isMatchFollowed(m, settings, catalog?.leagues);

  let nextMatch: Match | undefined;
  let nextTag = tl("Next upcoming match");
  let comingUp: Match[] = [];

  if (hasWatchlist) {
    const followedMatches = unstarted.filter(isFollowed);
    if (followedMatches.length > 0) {
      nextMatch = followedMatches[0];
      const isTeam =
        settings.followedTeams.includes(nextMatch.team1Code) ||
        settings.followedTeams.includes(nextMatch.team2Code);
      nextTag = isTeam
        ? tl("Next match you follow")
        : tl("Next in your leagues · {league}", { league: nextMatch.leagueName });
      if (minutesLate(nextMatch, now) >= DELAY_GRACE_MIN) nextTag = tl("Delayed · {league}", { league: nextMatch.leagueName });
      comingUp = followedMatches.slice(1, 5);
    }
  } else {
    // User has no watchlist items: show upcoming matches overall or say none at all
    if (unstarted.length > 0) {
      nextMatch = unstarted[0];
      nextTag = tl("Next upcoming match");
      comingUp = unstarted.slice(1, 5);
    }
  }

  const countdown = useCountdown(nextMatch?.startTimeUtc);
  const lateMin = nextMatch ? minutesLate(nextMatch, now) : 0;
  const nextIsDelayed = lateMin >= DELAY_GRACE_MIN;
  const nextShow = nextMatch
    ? liveShows.find((s) => s.leagueSlug.toLowerCase() === (nextMatch!.leagueSlug || "").toLowerCase())
    : undefined;

  // If pro matches are live right now
  if (matches.length > 0) {
    return (
      <div className="p-4 space-y-4 page-4xl overflow-y-auto h-full">
        <div className="flex items-center justify-between pb-1 border-b border-[#1e282d]">
          <h2 className="text-xs font-bold text-[#e84057] uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#e84057] animate-ping" />
            {tl("Live Pro Matches ({n})", { n: matches.length })}
          </h2>
          {settings.spoilerMode && (
            <span className="text-[10px] text-[#c8aa6e] bg-[#c8aa6e]/10 border border-[#c8aa6e]/30 px-2 py-0.5 rounded">
              {tl("SPOILER MODE ACTIVE · CLICK SCORE TO REVEAL")}
            </span>
          )}
        </div>

        <div className="grid gap-4">
          {matches.map((m) => {
            const isT1Followed = settings.followedTeams.includes(m.team1Code);
            const isT2Followed = settings.followedTeams.includes(m.team2Code);
            const isRevealed = !!revealedMatchIds[m.matchId];
            const showScore = !settings.spoilerMode || isRevealed;

            return (
              <div
                key={m.matchId}
                id={`match-${m.matchId}`}
                className={`bg-[#0a1420] border rounded-lg p-4 transition-all hover:border-[#c8aa6e] ${
                  flashMatchId === m.matchId
                    ? "border-[#0ac8b9] ring-2 ring-[#0ac8b9]/40"
                    : isT1Followed || isT2Followed
                      ? "border-[#c8aa6e] shadow-lg shadow-[#c8aa6e]/5"
                      : "border-[#1e282d]"
                }`}
              >
                {/* Card Header: League & Best-of */}
                <div className="flex items-center justify-between text-xs text-[#9bb3c9] mb-3 font-medium">
                  <span className="font-bold text-[#0ac8b9]">{m.leagueName}</span>
                  <span className="flex items-center gap-1.5">
                    <ShareMatchButton match={m} />
                    <span className="font-medium bg-[#091428] px-2 py-0.5 rounded border border-[#1e282d]">
                      {tl("Best of {n}", { n: m.bestOf })}
                    </span>
                  </span>
                </div>

                {/* Match Scoreboard */}
                <div className="grid grid-cols-5 items-center gap-2 my-2">
                  {/* Team 1 */}
                  <div className="col-span-2 min-w-0 flex items-center justify-end gap-2 sm:gap-3 text-right">
                    <div className="min-w-0">
                      <div className="flex items-center justify-end gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTeamFollow(m.team1Code);
                          }}
                          className={`p-1 shrink-0 rounded hover:bg-[#1e282d] transition-colors ${
                            isT1Followed ? "text-[#c8aa6e]" : "text-[#9bb3c9] hover:text-[#c8aa6e]"
                          }`}
                          aria-label={isT1Followed ? tl("Unfollow {name}", { name: m.team1Code }) : tl("Follow {name}", { name: m.team1Code })}
                          title={isT1Followed ? tl("Unfollow {name}", { name: m.team1Code }) : tl("Follow {name}", { name: m.team1Code })}
                        >
                          <Star className={`w-3.5 h-3.5 ${isT1Followed ? "fill-[#c8aa6e]" : ""}`} />
                        </button>
                        <span
                          {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                          className="font-bold text-sm sm:text-base text-[#f0e6d2] hover:text-[#c8aa6e] cursor-pointer transition-colors truncate"
                          title={tl("View {team} roster", { team: m.team1Name })}
                        >
                          {m.team1Name}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9bb3c9] font-mono font-medium">{m.team1Code}</div>
                    </div>
                    {m.team1Image ? (
                      <img
                        src={m.team1Image}
                        alt={m.team1Code}
                        className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 object-contain rounded cursor-pointer"
                        onClick={() => onSelectTeam?.(m.team1Code, m.team1Name)}
                      />
                    ) : (
                      <div
                        {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                        className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-[#091428] rounded flex items-center justify-center font-bold text-xs text-[#c8aa6e] cursor-pointer font-mono"
                      >
                        {m.team1Code.slice(0, 3)}
                      </div>
                    )}
                  </div>

                  {/* Score Center (Interactive with Per-Match Reveal) */}
                  <div className="col-span-1 text-center font-bold font-mono flex flex-col items-center justify-center">
                    {showScore ? (
                      <div
                        onClick={() => settings.spoilerMode && toggleReveal(m.matchId)}
                        className={`text-2xl text-[#f0e6d2] ${
                          settings.spoilerMode ? "cursor-pointer group flex flex-col items-center" : ""
                        }`}
                        title={settings.spoilerMode ? tl("Click to re-hide score") : undefined}
                      >
                        <div>
                          <span className="text-[#0ac8b9]">{m.team1Score}</span>
                          <span className="text-[#9bb3c9] mx-2">:</span>
                          <span className="text-[#e84057]">{m.team2Score}</span>
                        </div>
                        {settings.spoilerMode && (
                          <span className="text-[9px] text-[#9bb3c9] opacity-80 group-hover:opacity-100 font-sans tracking-tight">
                            {tl("Revealed (hide)")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleReveal(m.matchId)}
                        className="text-xs text-[#9bb3c9] bg-[#091428] hover:bg-[#121e2d] hover:text-[#c8aa6e] py-1 px-2.5 rounded border border-[#1e282d] hover:border-[#c8aa6e]/50 transition-all cursor-pointer flex flex-col items-center gap-0.5 group"
                        title={tl("Click to reveal live score for this match")}
                      >
                        <span className="font-bold">{tl("VS")}</span>
                        <span className="text-[9px] text-[#9bb3c9] group-hover:text-[#c8aa6e]">
                          {tl("Reveal")}
                        </span>
                      </button>
                    )}
                    {(() => {
                      // Games already finished in this series count, unless the score is hidden
                      const h2h = computeHeadToHead(m.team1Code, m.team2Code, schedule, m.matchId, showScore);
                      return h2h ? <H2HMeter team1Code={m.team1Code} team2Code={m.team2Code} h2h={h2h} matchId={m.matchId} countThisMatch={showScore} /> : null;
                    })()}
                  </div>

                  {/* Team 2 */}
                  <div className="col-span-2 min-w-0 flex items-center gap-2 sm:gap-3 text-left">
                    {m.team2Image ? (
                      <img
                        src={m.team2Image}
                        alt={m.team2Code}
                        className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 object-contain rounded cursor-pointer"
                        onClick={() => onSelectTeam?.(m.team2Code, m.team2Name)}
                      />
                    ) : (
                      <div
                        {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                        className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-[#091428] rounded flex items-center justify-center font-bold text-xs text-[#c8aa6e] cursor-pointer font-mono"
                      >
                        {m.team2Code.slice(0, 3)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                          className="font-bold text-sm sm:text-base text-[#f0e6d2] hover:text-[#c8aa6e] cursor-pointer transition-colors truncate"
                          title={tl("View {team} roster", { team: m.team2Name })}
                        >
                          {m.team2Name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTeamFollow(m.team2Code);
                          }}
                          className={`p-1 shrink-0 rounded hover:bg-[#1e282d] transition-colors ${
                            isT2Followed ? "text-[#c8aa6e]" : "text-[#9bb3c9] hover:text-[#c8aa6e]"
                          }`}
                          aria-label={isT2Followed ? tl("Unfollow {name}", { name: m.team2Code }) : tl("Follow {name}", { name: m.team2Code })}
                          title={isT2Followed ? tl("Unfollow {name}", { name: m.team2Code }) : tl("Follow {name}", { name: m.team2Code })}
                        >
                          <Star className={`w-3.5 h-3.5 ${isT2Followed ? "fill-[#c8aa6e]" : ""}`} />
                        </button>
                      </div>
                      <div className="text-[11px] text-[#9bb3c9] font-mono font-medium">{m.team2Code}</div>
                    </div>
                  </div>
                </div>

                {/* Series Progression Game Tracker */}
                {/* Hidden in spoiler mode: the game number gives the series score away (Game 5 = 2-2) */}
                {m.bestOf > 1 && showScore && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 my-2 pt-2 border-t border-[#1e282d]/40">
                    {Array.from({ length: m.bestOf }).map((_, idx) => {
                      const gNum = idx + 1;
                      const winsNeeded = Math.ceil((m.bestOf || 1) / 2);
                      const isMatchDone = m.state === "completed" || (m.team1Score ?? 0) >= winsNeeded || (m.team2Score ?? 0) >= winsNeeded;
                      const totalGamesPlayed = (m.team1Score ?? 0) + (m.team2Score ?? 0);
                      const isPast = gNum <= totalGamesPlayed;
                      const isCurrent = !isMatchDone && !isPast && totalGamesPlayed === idx;
                      const isNotNeeded = isMatchDone && gNum > totalGamesPlayed;
                      // Between games Riot marks the next game "unstarted": say "Next", not "Live"
                      const isBetweenGames =
                        isCurrent && (m.games?.length ?? 0) > 0 && !m.games.some((g) => g.state === "inProgress");

                      if (isNotNeeded) return null;

                      return (
                        <span
                          key={gNum}
                          className={`px-1.5 sm:px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border whitespace-nowrap transition-all ${
                            isCurrent && isBetweenGames
                              ? "bg-[#c8aa6e]/10 border-[#c8aa6e] text-[#c8aa6e]"
                              : isCurrent
                              ? "bg-[#e84057]/20 border-[#e84057] text-[#e84057] animate-pulse"
                              : isPast
                              ? "bg-[#091428] border-[#1e282d] text-[#0ac8b9]"
                              : "bg-[#091428]/40 border-[#1e282d]/50 text-[#7e8e9f]"
                          }`}
                        >
                          {isCurrent && !isBetweenGames && "● "}
                          <span className="sm:hidden">{tc("short game", "G{n}", { n: gNum })}</span>
                          <span className="hidden sm:inline">{tl("Game {n}", { n: gNum })}</span>
                          {isCurrent && (isBetweenGames ? " · " + tl("Next") : " · " + tl("Live"))}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* The game being played: gold, objectives, players (spoiler mode hides it like the score) */}
                <LiveGamePanel match={m} showStats={showScore} />
                <div className="mt-2">
                  <WinChanceLine match={m} />
                </div>

                {/* Action Footer */}
                <div className="flex items-center justify-between pt-3 mt-2 border-t border-[#1e282d]/60 text-xs">
                  {(() => {
                    const winsNeeded = Math.ceil((m.bestOf || 1) / 2);
                    const isDone = m.state === "completed" || (m.team1Score ?? 0) >= winsNeeded || (m.team2Score ?? 0) >= winsNeeded;
                    if (isDone) {
                      const winnerName = m.winner
                        ? m.winner === m.team1Code ? m.team1Name : m.team2Name
                        : (m.team1Score ?? 0) > (m.team2Score ?? 0) ? m.team1Name : m.team2Name;
                      return (
                        <span className="flex items-center gap-1.5 text-[#0ac8b9] font-bold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-[#0ac8b9]" />
                          {showScore
                            ? tl("Final · {team} won {score}", {
                                team: winnerName,
                                score: `${Math.max(m.team1Score, m.team2Score)}-${Math.min(m.team1Score, m.team2Score)}`,
                              })
                            : tl("Series over")}
                        </span>
                      );
                    }
                    return (
                      <span className="flex items-center gap-1.5 text-[#e84057] font-semibold text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-[#e84057] animate-ping" />
                        {tl("Match In Progress")}
                      </span>
                    );
                  })()}

                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <MatchPrepButton match={m} />
                    <button
                      onClick={() => onOpenUrl(m.streamUrl || "https://lolesports.com")}
                      className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#0ac8b9] hover:bg-[#0ac8b9]/80 text-[#091428] font-bold text-xs transition-colors"
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>{tl("Watch Stream")}</span>
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Up next: keeps the page useful when only one or two matches are live */}
        {(() => {
          const pool = hasWatchlist ? unstarted.filter(isFollowed) : unstarted;
          const upNext = (pool.length > 0 ? pool : unstarted).slice(0, 5);
          if (upNext.length === 0) return null;
          return (
            <section className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#7e8e9f] uppercase tracking-wider">{tl("Up Next")}</span>
                <button
                  onClick={() => onSelectTab("schedule")}
                  className="text-[#0ac8b9] hover:underline text-[11px] font-medium"
                >
                  {tl("Full schedule →")}
                </button>
              </div>
              <div className="grid gap-2">
                {upNext.map((m) => (
                  <div
                    key={m.matchId}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 p-3 rounded-lg bg-[#0a1420] border border-[#1e282d] text-xs"
                  >
                    {/* Phones: league, Bo and time on the first line, the teams on the second */}
                    <span className="font-bold text-[#0ac8b9] text-[11px] flex-1 sm:flex-none sm:w-24 truncate min-w-0">{m.leagueName}</span>
                    <span className="order-last sm:order-none basis-full sm:basis-auto sm:flex-1 text-[#f0e6d2] font-semibold truncate min-w-0">
                      {m.team1Name} <span className="text-[#9bb3c9] mx-1">{tl("vs")}</span> {m.team2Name}
                    </span>
                    <span className="text-[#9bb3c9] text-[11px] font-medium shrink-0">{tc("short best of", "Bo{n}", { n: m.bestOf })}</span>
                    <div className="text-[#9bb3c9] font-mono text-[11px] font-medium shrink-0">
                      {formatMatchTime(m.startTimeUtc)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#7e8e9f] text-center pt-1">
                {tl("Want fewer leagues or only your teams? Pick them in the Watchlist tab.")}{" "}
                <button onClick={() => onSelectTab("watchlist")} className="text-[#c8aa6e] hover:underline">
                  {tl("Open Watchlist")}
                </button>
              </p>
            </section>
          );
        })()}
      </div>
    );
  }

  // FIRST LOAD: nothing has arrived yet, so don't claim there are no matches.
  if (isLoading && schedule.length === 0) {
    return (
      <div className="p-4 h-full flex items-center justify-center" role="status">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0a1420] border border-[#1e282d] text-[#9bb3c9] text-xs">
          <Clock className="w-3.5 h-3.5 text-[#0ac8b9] animate-pulse" />
          <span>{tl("Loading live matches and the schedule…")}</span>
        </div>
      </div>
    );
  }

  // IDLE STATE: No matches live right now -> Show Next Match Hero with Live Countdown
  return (
    <div className="p-4 space-y-6 page-4xl overflow-y-auto h-full">
      {/* Idle Notice Header */}
      <div className="text-center py-4 border-b border-[#1e282d]">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0a1420] border border-[#1e282d] text-[#7e8e9f] text-xs mb-1">
          <Clock className="w-3.5 h-3.5 text-[#0ac8b9]" />
          <span>{tl("No pro matches are live right now")}</span>
        </div>
        {liveShows.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2" role="status">
            {liveShows.map((s) => (
              <button
                key={s.leagueSlug}
                type="button"
                onClick={() => s.streamUrl && onOpenUrl(s.streamUrl)}
                disabled={!s.streamUrl}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a1708] border border-[#c8aa6e]/60 text-[#f0e6d2] text-xs hover:border-[#c8aa6e] disabled:cursor-default"
                title={s.streamUrl ? tl("Open the {league} broadcast", { league: s.leagueName }) : undefined}
              >
                <span className="w-2 h-2 rounded-full bg-[#e84057] animate-pulse" />
                <span>
                  <strong>{s.leagueName}</strong> broadcast is live
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hero Next Match Card */}
      {nextMatch ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#c8aa6e] uppercase tracking-wider">
              {nextTag}
            </span>
            <span className="text-[#9bb3c9] font-medium">
              {nextMatch.blockName || ""}
            </span>
          </div>

          <div className="bg-[#0a1420] border border-[#c8aa6e] rounded-xl p-4 sm:p-6 shadow-xl shadow-[#c8aa6e]/5 relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#c8aa6e]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

            <div className="relative z-10 flex flex-col items-center text-center">
              {/* League & Format Badge */}
              <div className="flex items-center gap-2 text-xs text-[#9bb3c9] mb-4 font-medium">
                <span className="font-semibold text-[#0ac8b9]">{nextMatch.leagueName}</span>
                <span>·</span>
                <span className="font-mono bg-[#091428] px-2 py-0.5 rounded border border-[#1e282d]">
                  {tl("Best of {n}", { n: nextMatch.bestOf })}
                </span>
              </div>

              {/* Matchup Banner */}
              <div className="flex items-center justify-center gap-3 sm:gap-12 w-full my-2">
                {/* Team 1 */}
                <div className="flex flex-col items-center flex-1 min-w-0 max-w-[180px]">
                  {nextMatch.team1Image ? (
                    <img
                      src={nextMatch.team1Image}
                      alt={nextMatch.team1Code}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-contain mb-2 drop-shadow-md cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => onSelectTeam?.(nextMatch!.team1Code, nextMatch!.team1Name)}
                      title={tl("View {team} roster", { team: nextMatch.team1Name })}
                    />
                  ) : (
                    <div
                      {...clickable(() => onSelectTeam?.(nextMatch!.team1Code, nextMatch!.team1Name))}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-[#091428] border border-[#1e282d] hover:border-[#c8aa6e] flex items-center justify-center font-bold text-lg text-[#c8aa6e] mb-2 font-mono cursor-pointer"
                      title={tl("View {team} roster", { team: nextMatch.team1Name })}
                    >
                      {nextMatch.team1Code.slice(0, 3)}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5 w-full">
                    <span
                      {...clickable(() => onSelectTeam?.(nextMatch!.team1Code, nextMatch!.team1Name))}
                      className="font-bold text-base sm:text-lg text-[#f0e6d2] hover:text-[#c8aa6e] cursor-pointer truncate transition-colors"
                      title={tl("View {team} roster", { team: nextMatch.team1Name })}
                    >
                      {nextMatch.team1Name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTeamFollow(nextMatch!.team1Code);
                      }}
                      className={`p-1 rounded hover:bg-[#1e282d] transition-colors shrink-0 ${
                        settings.followedTeams.includes(nextMatch.team1Code)
                          ? "text-[#c8aa6e]"
                          : "text-[#9bb3c9] hover:text-[#c8aa6e]"
                      }`}
                      aria-label={
                        settings.followedTeams.includes(nextMatch.team1Code)
                          ? tl("Unfollow {name}", { name: nextMatch.team1Code })
                          : tl("Follow {name}", { name: nextMatch.team1Code })
                      }
                      title={
                        settings.followedTeams.includes(nextMatch.team1Code)
                          ? tl("Unfollow {name}", { name: nextMatch.team1Code })
                          : tl("Follow {name}", { name: nextMatch.team1Code })
                      }
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          settings.followedTeams.includes(nextMatch.team1Code)
                            ? "fill-[#c8aa6e]"
                            : ""
                        }`}
                      />
                    </button>
                  </div>
                  <div
                    {...clickable(() => onSelectTeam?.(nextMatch!.team1Code, nextMatch!.team1Name))}
                    className="text-xs text-[#9bb3c9] hover:text-[#0ac8b9] cursor-pointer font-mono font-medium"
                  >
                    {nextMatch.team1Code}
                  </div>
                </div>

                {/* VS Center */}
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-[#9bb3c9] bg-[#091428] border border-[#1e282d] px-2.5 py-1 rounded-full uppercase tracking-widest font-mono">
                    {tl("VS")}
                  </span>
                </div>

                {/* Team 2 */}
                <div className="flex flex-col items-center flex-1 min-w-0 max-w-[180px]">
                  {nextMatch.team2Image ? (
                    <img
                      src={nextMatch.team2Image}
                      alt={nextMatch.team2Code}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-contain mb-2 drop-shadow-md cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => onSelectTeam?.(nextMatch!.team2Code, nextMatch!.team2Name)}
                      title={tl("View {team} roster", { team: nextMatch.team2Name })}
                    />
                  ) : (
                    <div
                      {...clickable(() => onSelectTeam?.(nextMatch!.team2Code, nextMatch!.team2Name))}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-[#091428] border border-[#1e282d] hover:border-[#c8aa6e] flex items-center justify-center font-bold text-lg text-[#c8aa6e] mb-2 font-mono cursor-pointer"
                      title={tl("View {team} roster", { team: nextMatch.team2Name })}
                    >
                      {nextMatch.team2Code.slice(0, 3)}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5 w-full">
                    <span
                      {...clickable(() => onSelectTeam?.(nextMatch!.team2Code, nextMatch!.team2Name))}
                      className="font-bold text-base sm:text-lg text-[#f0e6d2] hover:text-[#c8aa6e] cursor-pointer truncate transition-colors"
                      title={tl("View {team} roster", { team: nextMatch.team2Name })}
                    >
                      {nextMatch.team2Name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTeamFollow(nextMatch!.team2Code);
                      }}
                      className={`p-1 rounded hover:bg-[#1e282d] transition-colors shrink-0 ${
                        settings.followedTeams.includes(nextMatch.team2Code)
                          ? "text-[#c8aa6e]"
                          : "text-[#9bb3c9] hover:text-[#c8aa6e]"
                      }`}
                      aria-label={
                        settings.followedTeams.includes(nextMatch.team2Code)
                          ? tl("Unfollow {name}", { name: nextMatch.team2Code })
                          : tl("Follow {name}", { name: nextMatch.team2Code })
                      }
                      title={
                        settings.followedTeams.includes(nextMatch.team2Code)
                          ? tl("Unfollow {name}", { name: nextMatch.team2Code })
                          : tl("Follow {name}", { name: nextMatch.team2Code })
                      }
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          settings.followedTeams.includes(nextMatch.team2Code)
                            ? "fill-[#c8aa6e]"
                            : ""
                        }`}
                      />
                    </button>
                  </div>
                  <div
                    {...clickable(() => onSelectTeam?.(nextMatch!.team2Code, nextMatch!.team2Name))}
                    className="text-xs text-[#9bb3c9] hover:text-[#0ac8b9] cursor-pointer font-mono font-medium"
                  >
                    {nextMatch.team2Code}
                  </div>
                </div>
              </div>

              {/* Head-to-Head Record Banner */}
              {(() => {
                const h2h = computeHeadToHead(nextMatch.team1Code, nextMatch.team2Code, schedule, nextMatch.matchId);
                if (h2h) {
                  return (
                    <div className="mt-3 w-full flex justify-center">
                      <H2HMeter team1Code={nextMatch.team1Code} team2Code={nextMatch.team2Code} h2h={h2h} size="md" matchId={nextMatch.matchId} />
                    </div>
                  );
                }
                return null;
              })()}

              {/* Live Ticking Countdown */}
              <div className="mt-5 pt-4 border-t border-[#1e282d]/80 w-full flex flex-col items-center">
                {nextIsDelayed ? (
                  <div className="flex flex-col items-center gap-1" role="status">
                    <span className="px-2.5 py-0.5 rounded bg-[#c8aa6e] text-[#091428] text-[10px] font-extrabold uppercase tracking-wider">
                      {tl("Delayed")}
                    </span>
                    <div className="text-xl sm:text-2xl font-extrabold text-[#c8aa6e] font-mono tracking-tight">
                      {tl("{time} late", { time: formatLate(lateMin) })}
                    </div>
                    <div className="text-[11px] text-[#9bb3c9]">
                      {nextShow
                        ? tl("The {league} broadcast is on air. Game 1 hasn't started yet.", { league: nextShow.leagueName })
                        : tl("Riot hasn't marked this match as started yet.")}
                    </div>
                  </div>
                ) : (
                  <div className="text-xl sm:text-2xl font-extrabold text-[#0ac8b9] font-mono tracking-tight animate-pulse">
                    {countdown.formatted || tl("Calculating…")}
                  </div>
                )}
                <div className="text-xs text-[#9bb3c9] mt-1 flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-[#c8aa6e]" />
                  <span>{formatMatchTime(nextMatch.startTimeUtc)}</span>
                </div>

                {/* Calendar Integration Button */}
                <div className="mt-3.5 flex items-center justify-center gap-2">
                  <AddToCalendarMenu match={nextMatch} onOpenUrl={onOpenUrl} />
                  <MatchPrepButton match={nextMatch} />
                  <ShareMatchButton match={nextMatch} className="border border-[#1e282d] bg-[#091428] p-1.5" />
                </div>

                {/* Official League Broadcast Stream Channels */}
                {(() => {
                  const streams = getLeagueBroadcastStreams(nextMatch.leagueSlug, nextMatch.streamUrl);
                  return (
                    <div className="mt-4 w-full pt-3 border-t border-[#1e282d]/60">
                      <div className="text-[10px] font-bold text-[#c8aa6e] uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
                        <Tv className="w-3 h-3 text-[#c8aa6e]" />
                        <span>{tl("Broadcast & Live Stream Channels")}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {streams.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => onOpenUrl(s.url)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                              s.badge === "LIVE FEED"
                                ? "bg-[#e84057] hover:bg-[#e84057]/90 text-white animate-pulse"
                                : s.icon === "twitch"
                                ? "bg-[#9146ff]/20 hover:bg-[#9146ff]/35 border border-[#9146ff]/60 text-[#d8b4fe]"
                                : s.icon === "youtube"
                                ? "bg-[#ff0000]/15 hover:bg-[#ff0000]/30 border border-[#ff0000]/50 text-[#fca5a5]"
                                : "bg-[#091428] hover:bg-[#121e2d] border border-[#0ac8b9]/60 text-[#0ac8b9]"
                            }`}
                            title={tl("Open {name} ({url})", { name: s.name, url: s.url })}
                          >
                            {s.icon === "twitch" && (
                              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                              </svg>
                            )}
                            {s.icon === "youtube" && (
                              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                              </svg>
                            )}
                            {s.icon === "riot" && !s.badge && (
                              <Tv className="w-3.5 h-3.5 text-[#0ac8b9]" />
                            )}
                            {s.badge && (
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            )}
                            <span>{s.name}</span>
                            <ExternalLink className="w-3 h-3 opacity-70" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </section>
      ) : hasWatchlist ? (
        <div className="space-y-6">
          <div className="bg-[#0a1420] border border-[#1e282d] rounded-xl p-8 text-center space-y-4 max-w-xl mx-auto my-4 shadow-lg">
            <div className="w-12 h-12 rounded-full bg-[#c8aa6e]/10 border border-[#c8aa6e]/30 flex items-center justify-center mx-auto text-[#c8aa6e]">
              <Star className="w-6 h-6 fill-[#c8aa6e]/20" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#f0e6d2]">{tl("No Upcoming Matches in Your Watchlist")}</h3>
              <p className="text-xs text-[#9bb3c9] mt-1.5 leading-relaxed">
                {tl("None of your followed teams, leagues, or regions have matches scheduled in the current window.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                onClick={() => onSelectTab("watchlist")}
                className="px-4 py-2 rounded-lg bg-[#c8aa6e] hover:bg-[#f0e6d2] text-[#091428] font-bold text-xs transition-colors shadow"
              >
                {tl("Manage Watchlist")}
              </button>
              <button
                onClick={() => onSelectTab("schedule")}
                className="px-4 py-2 rounded-lg bg-[#091428] hover:bg-[#121e2d] border border-[#1e282d] hover:border-[#c8aa6e]/50 text-[#f0e6d2] font-semibold text-xs transition-colors"
              >
                {tl("Browse All Matches ({n})", { n: unstarted.length })}
              </button>
            </div>
          </div>

          {unstarted.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#7e8e9f] uppercase tracking-wider">
                  {tl("Upcoming in Other Leagues")}
                </span>
                <button
                  onClick={() => onSelectTab("schedule")}
                  className="text-[#0ac8b9] hover:underline text-[11px] font-medium"
                >
                  View all {unstarted.length} matches →
                </button>
              </div>
              <div className="grid gap-2">
                {unstarted.slice(0, 4).map((m) => (
                  <div
                    key={m.matchId}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 p-3 rounded-lg bg-[#0a1420] border border-[#1e282d] hover:border-[#c8aa6e]/60 transition-all text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                      <span className="font-bold text-[#0ac8b9] text-[11px] w-20 truncate">
                        {m.leagueName}
                      </span>
                      <div className="flex items-center gap-1 text-[#f0e6d2] font-semibold">
                        <span
                          {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                          className="hover:text-[#c8aa6e] cursor-pointer transition-colors"
                          title={tl("View {team} roster", { team: m.team1Name })}
                        >
                          {m.team1Name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTeamFollow(m.team1Code);
                          }}
                          className={`p-0.5 rounded hover:bg-[#1e282d] ${
                            settings.followedTeams.includes(m.team1Code) ? "text-[#c8aa6e]" : "text-[#9bb3c9]"
                          }`}
                          aria-label={
                            settings.followedTeams.includes(m.team1Code)
                              ? tl("Unfollow {name}", { name: m.team1Code })
                              : tl("Follow {name}", { name: m.team1Code })
                          }
                          title={
                            settings.followedTeams.includes(m.team1Code)
                              ? tl("Unfollow {name}", { name: m.team1Code })
                              : tl("Follow {name}", { name: m.team1Code })
                          }
                        >
                          <Star
                            className={`w-3 h-3 ${
                              settings.followedTeams.includes(m.team1Code) ? "fill-[#c8aa6e]" : ""
                            }`}
                          />
                        </button>
                        <span className="text-[#9bb3c9] mx-1">{tl("vs")}</span>
                        <span
                          {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                          className="hover:text-[#c8aa6e] cursor-pointer transition-colors"
                          title={tl("View {team} roster", { team: m.team2Name })}
                        >
                          {m.team2Name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTeamFollow(m.team2Code);
                          }}
                          className={`p-0.5 rounded hover:bg-[#1e282d] ${
                            settings.followedTeams.includes(m.team2Code) ? "text-[#c8aa6e]" : "text-[#9bb3c9]"
                          }`}
                          aria-label={
                            settings.followedTeams.includes(m.team2Code)
                              ? tl("Unfollow {name}", { name: m.team2Code })
                              : tl("Follow {name}", { name: m.team2Code })
                          }
                          title={
                            settings.followedTeams.includes(m.team2Code)
                              ? tl("Unfollow {name}", { name: m.team2Code })
                              : tl("Follow {name}", { name: m.team2Code })
                          }
                        >
                          <Star
                            className={`w-3 h-3 ${
                              settings.followedTeams.includes(m.team2Code) ? "fill-[#c8aa6e]" : ""
                            }`}
                          />
                        </button>
                      </div>
                      <span className="text-[#9bb3c9] text-[11px] font-medium">{tc("short best of", "Bo{n}", { n: m.bestOf })}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <RowH2H m={m} schedule={schedule} />
                      <AddToCalendarMenu match={m} onOpenUrl={onOpenUrl} compact={true} />
                      <MatchPrepButton match={m} compact />
                      <div className="text-[#9bb3c9] font-mono text-[11px] font-medium">
                        {formatMatchTime(m.startTimeUtc)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="bg-[#0a1420] border border-[#1e282d] rounded-xl p-8 text-center space-y-3 max-w-xl mx-auto my-6 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-[#0ac8b9]/10 border border-[#0ac8b9]/30 flex items-center justify-center mx-auto text-[#0ac8b9]">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#f0e6d2]">{tl("No Upcoming Pro Matches Scheduled")}</h3>
          <p className="text-xs text-[#9bb3c9] max-w-md mx-auto leading-relaxed">
            {tl("There are currently no upcoming pro matches scheduled across any league in the current broadcast window.")}
          </p>
          <div className="pt-2">
            <button
              onClick={() => onSelectTab("schedule")}
              className="px-4 py-2 rounded-lg bg-[#c8aa6e] hover:bg-[#f0e6d2] text-[#091428] font-bold text-xs transition-colors shadow"
            >
              {tl("Check Full Schedule")}
            </button>
          </div>
        </div>
      )}

      {/* Coming Up Next (followed upcoming matches) */}
      {comingUp.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider">
            {tl("Coming Up Next")}
          </h3>
          <div className="grid gap-2">
            {comingUp.map((m) => (
              <div
                key={m.matchId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 p-3 rounded-lg bg-[#0a1420] border border-[#1e282d] hover:border-[#c8aa6e]/60 transition-all text-xs"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                  <span className="font-bold text-[#0ac8b9] text-[11px] w-20 truncate">
                    {m.leagueName}
                  </span>
                  <div className="flex items-center gap-1 text-[#f0e6d2] font-semibold">
                    <span
                      {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                      className="hover:text-[#c8aa6e] cursor-pointer transition-colors"
                      title={tl("View {team} roster", { team: m.team1Name })}
                    >
                      {m.team1Name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTeamFollow(m.team1Code);
                      }}
                      className={`p-0.5 rounded hover:bg-[#1e282d] ${
                        settings.followedTeams.includes(m.team1Code) ? "text-[#c8aa6e]" : "text-[#9bb3c9]"
                      }`}
                      aria-label={
                        settings.followedTeams.includes(m.team1Code)
                          ? tl("Unfollow {name}", { name: m.team1Code })
                          : tl("Follow {name}", { name: m.team1Code })
                      }
                      title={
                        settings.followedTeams.includes(m.team1Code)
                          ? tl("Unfollow {name}", { name: m.team1Code })
                          : tl("Follow {name}", { name: m.team1Code })
                      }
                    >
                      <Star
                        className={`w-3 h-3 ${
                          settings.followedTeams.includes(m.team1Code) ? "fill-[#c8aa6e]" : ""
                        }`}
                      />
                    </button>
                    <span className="text-[#9bb3c9] mx-1">{tl("vs")}</span>
                    <span
                      {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                      className="hover:text-[#c8aa6e] cursor-pointer transition-colors"
                      title={tl("View {team} roster", { team: m.team2Name })}
                    >
                      {m.team2Name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTeamFollow(m.team2Code);
                      }}
                      className={`p-0.5 rounded hover:bg-[#1e282d] ${
                        settings.followedTeams.includes(m.team2Code) ? "text-[#c8aa6e]" : "text-[#9bb3c9]"
                      }`}
                      aria-label={
                        settings.followedTeams.includes(m.team2Code)
                          ? tl("Unfollow {name}", { name: m.team2Code })
                          : tl("Follow {name}", { name: m.team2Code })
                      }
                      title={
                        settings.followedTeams.includes(m.team2Code)
                          ? tl("Unfollow {name}", { name: m.team2Code })
                          : tl("Follow {name}", { name: m.team2Code })
                      }
                    >
                      <Star
                        className={`w-3 h-3 ${
                          settings.followedTeams.includes(m.team2Code) ? "fill-[#c8aa6e]" : ""
                        }`}
                      />
                    </button>
                  </div>
                  <span className="text-[#9bb3c9] text-[11px] font-medium">{tc("short best of", "Bo{n}", { n: m.bestOf })}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <RowH2H m={m} schedule={schedule} />
                  <AddToCalendarMenu match={m} onOpenUrl={onOpenUrl} compact={true} />
                  <MatchPrepButton match={m} compact />
                  <div className="text-[#9bb3c9] font-mono text-[11px] font-medium">
                    {formatMatchTime(m.startTimeUtc)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full Schedule Link */}
      <div className="flex justify-center pt-2 pb-6">
        <button
          onClick={() => onSelectTab("schedule")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#c8aa6e] hover:bg-[#f0e6d2] text-[#091428] font-bold text-xs transition-colors shadow"
        >
          <span>{tl("View Full Schedule")}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/** H2H meter for a compact match row, when the teams have any recorded history. */
const RowH2H: React.FC<{ m: Match; schedule: Match[] }> = ({ m, schedule }) => {
  const h2h = computeHeadToHead(m.team1Code, m.team2Code, schedule, m.matchId);
  return h2h ? <H2HMeter team1Code={m.team1Code} team2Code={m.team2Code} h2h={h2h} matchId={m.matchId} /> : null;
};
