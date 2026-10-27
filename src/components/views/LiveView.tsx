import React, { Suspense, useState, useEffect } from "react";
import { Match, AppSettings, CatalogData, LiveShow } from "../../types";
import { Tv, ExternalLink, Calendar, Clock, ChevronRight, Star, Swords } from "lucide-react";
import { AddToCalendarMenu } from "../AddToCalendarMenu";
import { MatchPrepButton } from "../MatchPrepButton";
import { MatchOverviewButton } from "../MatchOverviewButton";
import { LiveGamePanel } from "../LiveGamePanel";
import { TeamRatingSub, WinChanceLine } from "../WinChanceLine";
import { UpNextTable } from "../UpNextTable";
import { SwissStandings } from "../SwissStandings";
import { ShareMatchButton } from "../ShareMatchButton";
import { IdleHome } from "../IdleHome";
import {
  getLeagueBroadcastStreams,
  isMatchFollowed,
  followedPlayerTeams,
  computeHeadToHead,
  isUpcomingOrDelayed,
  minutesLate,
  formatLate,
  DELAY_GRACE_MIN,
} from "../../helpers";
import { clickable } from "../../a11y";
import { H2HMeter } from "../H2HMeter";
import { tl, tc, locale } from "../../i18n";
import { isRevealed, setRevealed, useRevealedVersion } from "../../revealed";
import { riotImg } from "../../riotImage";
import { navigateHub } from "../../hub/route";
import { lazyPart } from "../../lazyPart";
import { formatMatchTime } from "../../matchTime";

// what's on the line in the next day (milestones, streaks), in the side column: loaded only when it shows
const AtStakeToday = lazyPart(() => import("../hub/AtStake").then((m) => m.AtStakeToday));

/** Two columns from 1280 px: the matches, and a side column (the next match in your leagues, the Swiss standings,
 *  what's on the line today). One column below that, the side column after the matches. */
const COLS = "grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] items-start";
/** A heading in the shared section look: small condensed capitals in the text colour. */
const HEAD = "font-head text-xs font-semibold uppercase tracking-wider text-rw-text";

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
  // revealed scores are remembered on this device (src/revealed.ts) and synced with cloud sync
  useRevealedVersion();
  const toggleReveal = (matchId: string) => setRevealed(`match:${matchId}`, !isRevealed(`match:${matchId}`));

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
    if (!onUpdateSettings || !code || code.toUpperCase() === "TBD") return;
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

  const playerTeams = followedPlayerTeams(settings.followedPlayers, catalog);
  const hasWatchlist =
    settings.followedTeams.length > 0 ||
    playerTeams.length > 0 ||
    settings.followedLeagues.length > 0 ||
    (settings.followedRegions && settings.followedRegions.length > 0);

  // Matches that match user's watchlist (followed teams, followed leagues, or followed regions)
  const isFollowed = (m: Match) => isMatchFollowed(m, settings, catalog?.leagues, playerTeams);

  let nextMatch: Match | undefined;
  let nextTag = tl("Next upcoming match");
  let comingUp: Match[] = [];

  if (hasWatchlist) {
    const followedMatches = unstarted.filter(isFollowed);
    if (followedMatches.length > 0) {
      nextMatch = followedMatches[0];
      const isTeam =
        settings.followedTeams.includes(nextMatch.team1Code) ||
        settings.followedTeams.includes(nextMatch.team2Code) ||
        playerTeams.includes(nextMatch.team1Code.toUpperCase()) ||
        playerTeams.includes(nextMatch.team2Code.toUpperCase());
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
      <div className="p-4 space-y-4 page-5xl rw-capped overflow-y-auto h-full">
        <h1 className="sr-only">{tl("Live Matches")}</h1>
        <IntlBanner schedule={schedule} onSelectTab={onSelectTab} />
        <div className={COLS}>
          <div className="space-y-4 min-w-0">
            <div className="flex items-center justify-between pb-1 border-b border-rw-border">
              <h2 className="text-xs font-bold text-rw-red uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rw-red animate-ping" />
                {tl("Live Pro Matches ({n})", { n: matches.length })}
              </h2>
              {settings.spoilerMode && (
                <span className="text-[10px] text-rw-accent bg-rw-accent/10 border border-rw-accent/30 px-2 py-0.5 rounded">
                  {tl("SPOILER MODE ACTIVE · CLICK SCORE TO REVEAL")}
                </span>
              )}
            </div>

            <div className="grid gap-4">
              {matches.map((m) => {
                const isT1Followed = settings.followedTeams.includes(m.team1Code);
                const isT2Followed = settings.followedTeams.includes(m.team2Code);
                const shown = isRevealed(`match:${m.matchId}`);
                const showScore = !settings.spoilerMode || shown;

                return (
                  <div
                    key={m.matchId}
                    id={`match-${m.matchId}`}
                    className={`bg-rw-surface border rounded-lg p-4 transition-all hover:border-rw-accent ${
                      flashMatchId === m.matchId
                        ? "border-rw-teal ring-2 ring-rw-teal/40"
                        : isT1Followed || isT2Followed
                          ? "border-rw-accent"
                          : "border-rw-border"
                    }`}
                  >
                    {/* Card Header: League & Best-of */}
                    <div className="flex items-center justify-between text-xs text-rw-sub mb-3 font-medium">
                      <span className="font-bold text-rw-teal">{m.leagueName}</span>
                      <span className="flex items-center gap-1.5">
                        <ShareMatchButton match={m} />
                        <span className="font-medium bg-rw-bg px-2 py-0.5 rounded border border-rw-border">
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
                              className={`p-1 shrink-0 rounded hover:bg-rw-border transition-colors ${
                                isT1Followed ? "text-rw-accent" : "text-rw-sub hover:text-rw-accent"
                              }`}
                              aria-label={isT1Followed ? tl("Unfollow {name}", { name: m.team1Code }) : tl("Follow {name}", { name: m.team1Code })}
                              title={isT1Followed ? tl("Unfollow {name}", { name: m.team1Code }) : tl("Follow {name}", { name: m.team1Code })}
                            >
                              <Star className={`w-3.5 h-3.5 ${isT1Followed ? "fill-rw-accent" : ""}`} />
                            </button>
                            <span
                              {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                              className="font-bold text-sm sm:text-base text-rw-text hover:text-rw-accent cursor-pointer transition-colors truncate"
                              title={tl("View {team} roster", { team: m.team1Name })}
                            >
                              {m.team1Name}
                            </span>
                          </div>
                          <TeamRatingSub match={m} side="a" align="right" />
                        </div>
                        {m.team1Image ? (
                          <img
                            {...riotImg(m.team1Image, 96)}
                            alt={m.team1Code}
                            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 object-contain rounded cursor-pointer"
                            onClick={() => onSelectTeam?.(m.team1Code, m.team1Name)}
                          />
                        ) : (
                          <div
                            {...clickable(() => onSelectTeam?.(m.team1Code, m.team1Name))}
                            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-rw-bg rounded flex items-center justify-center font-bold text-xs text-rw-accent cursor-pointer font-mono"
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
                            className={`text-2xl text-rw-text ${
                              settings.spoilerMode ? "cursor-pointer group flex flex-col items-center" : ""
                            }`}
                            title={settings.spoilerMode ? tl("Click to re-hide score") : undefined}
                          >
                            <div>
                              <span className="text-rw-teal">{m.team1Score}</span>
                              <span className="text-rw-sub mx-2">:</span>
                              <span className="text-rw-red">{m.team2Score}</span>
                            </div>
                            {settings.spoilerMode && (
                              <span className="text-[9px] text-rw-sub opacity-80 group-hover:opacity-100 font-sans tracking-tight">
                                {tl("Revealed (hide)")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleReveal(m.matchId)}
                            className="text-xs text-rw-sub bg-rw-bg hover:bg-rw-raised hover:text-rw-accent py-1 px-2.5 rounded border border-rw-border hover:border-rw-accent/50 transition-all cursor-pointer flex flex-col items-center gap-0.5 group"
                            title={tl("Click to reveal live score for this match")}
                          >
                            <span className="font-bold">{tl("VS")}</span>
                            <span className="text-[9px] text-rw-sub group-hover:text-rw-accent">
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
                            {...riotImg(m.team2Image, 96)}
                            alt={m.team2Code}
                            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 object-contain rounded cursor-pointer"
                            onClick={() => onSelectTeam?.(m.team2Code, m.team2Name)}
                          />
                        ) : (
                          <div
                            {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-rw-bg rounded flex items-center justify-center font-bold text-xs text-rw-accent cursor-pointer font-mono"
                          >
                            {m.team2Code.slice(0, 3)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              {...clickable(() => onSelectTeam?.(m.team2Code, m.team2Name))}
                              className="font-bold text-sm sm:text-base text-rw-text hover:text-rw-accent cursor-pointer transition-colors truncate"
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
                              className={`p-1 shrink-0 rounded hover:bg-rw-border transition-colors ${
                                isT2Followed ? "text-rw-accent" : "text-rw-sub hover:text-rw-accent"
                              }`}
                              aria-label={isT2Followed ? tl("Unfollow {name}", { name: m.team2Code }) : tl("Follow {name}", { name: m.team2Code })}
                              title={isT2Followed ? tl("Unfollow {name}", { name: m.team2Code }) : tl("Follow {name}", { name: m.team2Code })}
                            >
                              <Star className={`w-3.5 h-3.5 ${isT2Followed ? "fill-rw-accent" : ""}`} />
                            </button>
                          </div>
                          <TeamRatingSub match={m} side="b" />
                        </div>
                      </div>
                    </div>

                    {/* Series Progression Game Tracker */}
                    {/* Hidden in spoiler mode: the game number gives the series score away (Game 5 = 2-2) */}
                    {m.bestOf > 1 && showScore && (
                      <div className="flex flex-wrap items-center justify-center gap-1.5 my-2 pt-2 border-t border-rw-border/40">
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
                                  ? "bg-rw-accent/10 border-rw-accent text-rw-accent"
                                  : isCurrent
                                  ? "bg-rw-red/20 border-rw-red text-rw-red animate-pulse"
                                  : isPast
                                  ? "bg-rw-bg border-rw-border text-rw-teal"
                                  : "bg-rw-bg/40 border-rw-border/50 text-rw-muted"
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

                    {/* Before the series (power rankings), then the game being played: gold, objectives, the chance right
                        now, players (spoiler mode hides the game like the score) */}
                    <div className="mt-2">
                      <WinChanceLine match={m} />
                    </div>
                    <LiveGamePanel match={m} showStats={showScore} />

                    {/* Action Footer */}
                    <div className="flex items-center justify-between pt-3 mt-2 border-t border-rw-border/60 text-xs">
                      {(() => {
                        const winsNeeded = Math.ceil((m.bestOf || 1) / 2);
                        const isDone = m.state === "completed" || (m.team1Score ?? 0) >= winsNeeded || (m.team2Score ?? 0) >= winsNeeded;
                        if (isDone) {
                          const winnerName = m.winner
                            ? m.winner === m.team1Code ? m.team1Name : m.team2Name
                            : (m.team1Score ?? 0) > (m.team2Score ?? 0) ? m.team1Name : m.team2Name;
                          return (
                            <span className="flex items-center gap-1.5 text-rw-teal font-bold text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-rw-teal" />
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
                          <span className="flex items-center gap-1.5 text-rw-red font-semibold text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-rw-red animate-ping" />
                            {tl("Match In Progress")}
                          </span>
                        );
                      })()}

                      <span className="flex flex-wrap items-center justify-end gap-2">
                        <MatchPrepButton match={m} />
                        <MatchOverviewButton match={m} />
                        <button
                          onClick={() => onOpenUrl(m.streamUrl || "https://lolesports.com")}
                          className="flex items-center gap-1.5 px-3 py-1 rounded bg-rw-teal hover:bg-rw-teal/80 text-rw-bg font-bold text-xs transition-colors"
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
                    <h2 className={HEAD}>{tl("Up Next")}</h2>
                    <button
                      onClick={() => onSelectTab("schedule")}
                      className="text-rw-teal hover:underline text-[11px] font-medium"
                    >
                      {tl("Full schedule →")}
                    </button>
                  </div>
                  <UpNextTable matches={upNext} schedule={schedule} settings={settings} onOpenUrl={onOpenUrl} onSelectTeam={onSelectTeam} timeOf={formatMatchTime} />
                  <p className="text-[11px] text-rw-muted text-center pt-1">
                    {tl("Want fewer leagues or only your teams? Pick them in the Watchlist tab.")}{" "}
                    <button onClick={() => onSelectTab("watchlist")} className="text-rw-accent hover:underline">
                      {tl("Open Watchlist")}
                    </button>
                  </p>
                </section>
              );
            })()}
          </div>
          <aside className="space-y-4 min-w-0">
            {nextMatch && (
              <NextMatchCard
                match={nextMatch}
                tag={nextTag}
                countdown={countdown}
                delayed={nextIsDelayed}
                lateMin={lateMin}
                show={nextShow}
                schedule={schedule}
                settings={settings}
                onToggleFollow={toggleTeamFollow}
                onSelectTeam={onSelectTeam}
                onOpenUrl={onOpenUrl}
                compact
              />
            )}
            {/* the Swiss stage in progress: records and the chance to make the top 8 (hidden in spoiler mode: records are results) */}
            {!settings.spoilerMode && <SwissStandings schedule={schedule} onOpen={() => onSelectTab("stats")} narrow />}
            <Suspense fallback={null}>
              <AtStakeToday schedule={schedule} narrow />
            </Suspense>
          </aside>
        </div>
      </div>
    );
  }

  // FIRST LOAD: nothing has arrived yet, so don't claim there are no matches.
  if (isLoading && schedule.length === 0) {
    return (
      <div className="p-4 h-full flex items-center justify-center" role="status">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rw-surface border border-rw-border text-rw-sub text-xs">
          <Clock className="w-3.5 h-3.5 text-rw-teal animate-pulse" />
          <span>{tl("Loading live matches and the schedule…")}</span>
        </div>
      </div>
    );
  }

  // IDLE STATE: No matches live right now -> Show Next Match Hero with Live Countdown
  return (
    <div className="p-4 space-y-4 page-5xl rw-capped overflow-y-auto h-full">
      <h1 className="sr-only">{tl("Live Matches")}</h1>
      <IntlBanner schedule={schedule} onSelectTab={onSelectTab} />
      {/* Idle Notice Header */}
      <div className="text-center py-4 border-b border-rw-border">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rw-surface border border-rw-border text-rw-muted text-xs mb-1">
          <Clock className="w-3.5 h-3.5 text-rw-teal" />
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
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rw-accent/10 border border-rw-accent/60 text-rw-text text-xs hover:border-rw-accent disabled:cursor-default"
                title={s.streamUrl ? tl("Open the {league} broadcast", { league: s.leagueName }) : undefined}
              >
                <span className="w-2 h-2 rounded-full bg-rw-red animate-pulse" />
                <span>
                  {tl("{league} broadcast is live", { league: s.leagueName })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={COLS}>
        <div className="space-y-6 min-w-0">
          {nextMatch ? (
            <NextMatchCard
              match={nextMatch}
              tag={nextTag}
              countdown={countdown}
              delayed={nextIsDelayed}
              lateMin={lateMin}
              show={nextShow}
              schedule={schedule}
              settings={settings}
              onToggleFollow={toggleTeamFollow}
              onSelectTeam={onSelectTeam}
              onOpenUrl={onOpenUrl}
            />
          ) : hasWatchlist ? (
            <div className="space-y-6">
              <div className="bg-rw-surface border border-rw-border rounded-xl p-8 text-center space-y-4 max-w-xl mx-auto my-4">
                <div className="w-12 h-12 rounded-full bg-rw-accent/10 border border-rw-accent/30 flex items-center justify-center mx-auto text-rw-accent">
                  <Star className="w-6 h-6 fill-rw-accent/20" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-rw-text">{tl("No Upcoming Matches in Your Watchlist")}</h3>
                  <p className="text-xs text-rw-sub mt-1.5 leading-relaxed">
                    {tl("None of your followed teams, leagues, or regions have matches scheduled in the current window.")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <button
                    onClick={() => onSelectTab("watchlist")}
                    className="px-4 py-2 rounded-lg bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs transition-colors"
                  >
                    {tl("Manage Watchlist")}
                  </button>
                  <button
                    onClick={() => onSelectTab("schedule")}
                    className="px-4 py-2 rounded-lg bg-rw-bg hover:bg-rw-raised border border-rw-border hover:border-rw-accent/50 text-rw-text font-semibold text-xs transition-colors"
                  >
                    {tl("Browse All Matches ({n})", { n: unstarted.length })}
                  </button>
                </div>
              </div>

              {unstarted.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <h2 className={HEAD}>{tl("Upcoming in Other Leagues")}</h2>
                    <button
                      onClick={() => onSelectTab("schedule")}
                      className="text-rw-teal hover:underline text-[11px] font-medium"
                    >
                      {tl("View all {n} matches →", { n: unstarted.length })}
                    </button>
                  </div>
                  <UpNextTable
                    matches={unstarted.slice(0, 4)}
                    schedule={schedule}
                    settings={settings}
                    onOpenUrl={onOpenUrl}
                    onSelectTeam={onSelectTeam}
                    onToggleFollow={toggleTeamFollow}
                    timeOf={formatMatchTime}
                  />
                </section>
              )}
            </div>
          ) : (
            <div className="bg-rw-surface border border-rw-border rounded-xl p-8 text-center space-y-3 max-w-xl mx-auto my-6">
              <div className="w-12 h-12 rounded-full bg-rw-teal/10 border border-rw-teal/30 flex items-center justify-center mx-auto text-rw-teal">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-rw-text">{tl("No Upcoming Pro Matches Scheduled")}</h3>
              <p className="text-xs text-rw-sub max-w-md mx-auto leading-relaxed">
                {tl("There are currently no upcoming pro matches scheduled across any league in the current broadcast window.")}
              </p>
              <div className="pt-2">
                <button
                  onClick={() => onSelectTab("schedule")}
                  className="px-4 py-2 rounded-lg bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs transition-colors"
                >
                  {tl("Check Full Schedule")}
                </button>
              </div>
            </div>
          )}

          {/* Nothing live: the latest results, the stats pages people use most, the top of the rankings */}
          <IdleHome schedule={schedule} settings={settings} onSelectTab={onSelectTab} />

          {/* Coming Up Next (followed upcoming matches) */}
          {comingUp.length > 0 && (
            <section className="space-y-2">
              <h2 className={HEAD}>
                {tl("Coming Up Next")}
              </h2>
              <UpNextTable
                matches={comingUp}
                schedule={schedule}
                settings={settings}
                onOpenUrl={onOpenUrl}
                onSelectTeam={onSelectTeam}
                onToggleFollow={toggleTeamFollow}
                timeOf={formatMatchTime}
              />
            </section>
          )}

          {/* Full Schedule Link */}
          <div className="flex justify-center pt-2 pb-6">
            <button
              onClick={() => onSelectTab("schedule")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs transition-colors"
            >
              <span>{tl("View Full Schedule")}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <aside className="space-y-4 min-w-0">
          {!settings.spoilerMode && <SwissStandings schedule={schedule} onOpen={() => onSelectTab("stats")} narrow />}
          <Suspense fallback={null}>
            <AtStakeToday schedule={schedule} narrow />
          </Suspense>
        </aside>
      </div>
    </div>
  );
};

/**
 * The next match (one you follow, in your leagues, or the next overall): both teams, the head to head, the countdown
 * or how late it is, calendar / prep / overview / share, and the official broadcast channels. A flat panel with its
 * label in the header strip; big on the idle page, compact in the side column.
 */
const NextMatchCard: React.FC<{
  match: Match;
  tag: string;
  countdown: ReturnType<typeof useCountdown>;
  delayed: boolean;
  lateMin: number;
  show?: LiveShow;
  schedule: Match[];
  settings: AppSettings;
  onToggleFollow: (code: string) => void;
  onSelectTeam?: (teamCode: string, teamName?: string) => void;
  onOpenUrl: (url: string) => void;
  compact?: boolean;
}> = ({ match: m, tag, countdown, delayed, lateMin, show, schedule, settings, onToggleFollow, onSelectTeam, onOpenUrl, compact }) => {
  const logo = compact ? "w-10 h-10" : "w-14 h-14 sm:w-16 sm:h-16";
  const team = (code: string, name: string, image: string | undefined) => {
    const followed = settings.followedTeams.includes(code);
    const open = () => onSelectTeam?.(code, name);
    const follow = followed ? tl("Unfollow {name}", { name: code }) : tl("Follow {name}", { name: code });
    return (
      <div className={`flex flex-col items-center flex-1 min-w-0 ${compact ? "" : "max-w-[180px]"}`}>
        {image ? (
          <img
            {...riotImg(image, 160)}
            alt={code}
            className={`${logo} object-contain mb-2 cursor-pointer`}
            onClick={open}
            title={tl("View {team} roster", { team: name })}
          />
        ) : (
          <div
            {...clickable(open)}
            className={`${logo} rounded-lg bg-rw-bg border border-rw-border hover:border-rw-accent flex items-center justify-center font-bold text-lg text-rw-accent mb-2 font-mono cursor-pointer`}
            title={tl("View {team} roster", { team: name })}
          >
            {code.slice(0, 3)}
          </div>
        )}
        <div className="flex items-center justify-center gap-1.5 w-full">
          <span
            {...clickable(open)}
            className={`font-bold ${compact ? "text-sm" : "text-sm min-[400px]:text-base sm:text-lg"} leading-tight text-rw-text hover:text-rw-accent cursor-pointer line-clamp-2 break-words text-center min-w-0 transition-colors`}
            title={tl("View {team} roster", { team: name })}
          >
            {name}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFollow(code);
            }}
            className={`p-1 rounded hover:bg-rw-border transition-colors shrink-0 max-[359px]:hidden ${followed ? "text-rw-accent" : "text-rw-sub hover:text-rw-accent"}`}
            aria-label={follow}
            title={follow}
          >
            <Star className={`w-3.5 h-3.5 ${followed ? "fill-rw-accent" : ""}`} />
          </button>
        </div>
        <div {...clickable(open)} className="text-xs text-rw-sub hover:text-rw-teal cursor-pointer font-mono font-medium">
          {code}
        </div>
      </div>
    );
  };
  const h2h = computeHeadToHead(m.team1Code, m.team2Code, schedule, m.matchId);
  const streams = getLeagueBroadcastStreams(m.leagueSlug, m.streamUrl);
  return (
    <section className="bg-rw-surface border border-rw-border rounded-lg min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-rw-border">
        <h2 className={HEAD}>{tag}</h2>
        {m.blockName && <span className="text-xs text-rw-sub font-medium">{m.blockName}</span>}
      </div>
      <div className={`flex flex-col items-center text-center ${compact ? "p-3" : "p-4 sm:p-6"}`}>
        {/* League & Format Badge */}
        <div className="flex items-center gap-2 text-xs text-rw-sub mb-4 font-medium">
          <span className="font-semibold text-rw-teal">{m.leagueName}</span>
          <span>·</span>
          <span className="font-mono bg-rw-bg px-2 py-0.5 rounded border border-rw-border">{tl("Best of {n}", { n: m.bestOf })}</span>
        </div>

        {/* Matchup */}
        <div className={`flex items-center justify-center w-full my-2 ${compact ? "gap-3" : "gap-3 sm:gap-12"}`}>
          {team(m.team1Code, m.team1Name, m.team1Image)}
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-rw-sub bg-rw-bg border border-rw-border px-2.5 py-1 rounded-full uppercase tracking-widest font-mono">
              {tl("VS")}
            </span>
          </div>
          {team(m.team2Code, m.team2Name, m.team2Image)}
        </div>

        {/* Head-to-Head Record Banner */}
        {h2h && (
          <div className="mt-3 w-full flex justify-center">
            <H2HMeter team1Code={m.team1Code} team2Code={m.team2Code} h2h={h2h} size="md" matchId={m.matchId} />
          </div>
        )}

        {/* Live Ticking Countdown */}
        <div className="mt-5 pt-4 border-t border-rw-border/80 w-full flex flex-col items-center">
          {delayed ? (
            <div className="flex flex-col items-center gap-1" role="status">
              <span className="px-2.5 py-0.5 rounded bg-rw-accent text-rw-bg text-[10px] font-extrabold uppercase tracking-wider">
                {tl("Delayed")}
              </span>
              <div className="text-xl sm:text-2xl font-extrabold text-rw-accent font-mono tracking-tight">
                {tl("{time} late", { time: formatLate(lateMin) })}
              </div>
              <div className="text-[11px] text-rw-sub">
                {show
                  ? tl("The {league} broadcast is on air. Game 1 hasn't started yet.", { league: show.leagueName })
                  : tl("Riot hasn't marked this match as started yet.")}
              </div>
            </div>
          ) : (
            <div
              className={`${
                compact || (countdown.formatted || "").length > 22 ? "text-base sm:text-xl" : "text-xl sm:text-2xl"
              } font-extrabold text-rw-teal font-mono tabular-nums tracking-tight`}
            >
              {countdown.formatted || tl("Calculating…")}
            </div>
          )}
          <div className="text-xs text-rw-sub mt-1 flex items-center gap-1.5 font-medium">
            <Calendar className="w-3.5 h-3.5 text-rw-accent" />
            <span>{formatMatchTime(m.startTimeUtc)}</span>
          </div>

          {/* Calendar Integration Button */}
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
            <AddToCalendarMenu match={m} onOpenUrl={onOpenUrl} />
            <MatchPrepButton match={m} />
            <MatchOverviewButton match={m} />
            <ShareMatchButton match={m} className="border border-rw-border bg-rw-bg p-1.5" />
          </div>

          {/* Official League Broadcast Stream Channels */}
          <div className="mt-4 w-full pt-3 border-t border-rw-border/60">
            <div className="text-[10px] font-semibold text-rw-muted mb-2 text-center">{tl("Broadcast & Live Stream Channels")}</div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {streams.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onOpenUrl(s.url)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    s.badge === "LIVE FEED"
                      ? "bg-rw-red hover:bg-rw-red/90 text-white animate-pulse"
                      : s.icon === "twitch"
                      ? "bg-[#9146ff]/20 hover:bg-[#9146ff]/35 border border-[#9146ff]/60 text-[#d8b4fe] light:text-[#5b21b6]"
                      : s.icon === "youtube"
                      ? "bg-[#ff0000]/15 hover:bg-[#ff0000]/30 border border-[#ff0000]/50 text-[#fca5a5] light:text-[#a51111]"
                      : "bg-rw-bg hover:bg-rw-raised border border-rw-teal/60 text-rw-teal"
                  }`}
                  title={tl("Open {name} ({url})", { name: s.name, url: s.url })}
                >
                  {s.icon === "twitch" && (
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                    </svg>
                  )}
                  {s.icon === "youtube" && (
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  )}
                  {s.icon === "riot" && !s.badge && <Tv className="w-3.5 h-3.5 text-rw-teal" />}
                  {s.badge && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                  <span>{s.name}</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * While Worlds, MSI or First Stand is on (a match of it live, or within the next two days, or in the last day): a
 * way into its page (Swiss / bracket pickers, chances, facts) from the live page, where most visitors land.
 */
const INTL_EVENTS: Record<string, { kind: "worlds" | "msi" | "first-stand"; name: string }> = {
  worlds: { kind: "worlds", name: "Worlds" },
  msi: { kind: "msi", name: "MSI" },
  first_stand: { kind: "first-stand", name: "First Stand" },
};
/** A Worlds, MSI or First Stand match that is on, was on in the last day or starts in the next two. */
export function intlMatchNow(schedule: Match[], now = Date.now()): Match | undefined {
  return schedule.find((m) => {
    if (!INTL_EVENTS[m.leagueSlug]) return false;
    const t = Date.parse(m.startTimeUtc);
    return m.state === "inProgress" || (t > now - 24 * 3600_000 && t < now + 48 * 3600_000);
  });
}
const IntlBanner: React.FC<{ schedule: Match[]; onSelectTab: (tab: "stats") => void }> = ({ schedule, onSelectTab }) => {
  const on = intlMatchNow(schedule);
  if (!on) return null;
  const ev = INTL_EVENTS[on.leagueSlug];
  const year = on.startTimeUtc.slice(0, 4);
  return (
    <button
      type="button"
      onClick={() => {
        navigateHub({ kind: ev.kind });
        onSelectTab("stats");
      }}
      className="w-full text-left rounded-lg border border-rw-border border-l-[3px] border-l-rw-accent bg-rw-surface hover:bg-rw-raised px-4 py-3 flex flex-wrap items-center justify-between gap-2"
    >
      <span>
        <span className="block text-sm font-extrabold text-rw-text">{tl("{event} {year} is on", { event: tc("event", ev.name), year })}</span>
        <span className="block text-xs text-rw-sub">
          {ev.kind === "worlds"
            ? tl("Pick the Swiss stage and the bracket, see every team's chances, and the standout stats so far.")
            : tl("Pick the bracket, see every team's chances, and the standout stats so far.")}
        </span>
      </span>
      <span className="text-xs font-semibold text-rw-accent whitespace-nowrap">{tl("Open →")}</span>
    </button>
  );
};
