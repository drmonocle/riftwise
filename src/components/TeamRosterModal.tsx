import React, { useEffect, useRef, useState } from "react";
import { CatalogData, Match, AppSettings, PlayerEntry } from "../types";
import { X, Star, ExternalLink, BarChart3, GitCompare } from "lucide-react";
import { computeHeadToHead, pickTeamByCode } from "../helpers";
import { H2HMeter } from "./H2HMeter";
import { MatchOverviewButton } from "./MatchOverviewButton";
import { MatchPrepButton } from "./MatchPrepButton";
import { tl, locale, roleName, regionName, tc } from "../i18n";
import { findHubTeam, loadHubIndexQuick, prettySlug, resolveLeagueSlug } from "../hub/data";
import { findSeriesSlug } from "../hub/seriesLookup";
import { RIOT_PREFIX } from "../hub/riotMatch";
import { navigateHub } from "../hub/route";
import { RiotCatalogContext } from "../hub/riotCatalog";
import { PlayerPhoto, PhotosLink, TeamLogo, useTeamLogo } from "./hub/ui";
import { riotImg } from "../riotImage";
import { isRevealed, setRevealed, useRevealedVersion } from "../revealed";

interface TeamRosterModalProps {
  teamCode: string | null;
  teamName?: string;
  catalog?: CatalogData;
  schedule: Match[];
  settings: AppSettings;
  onClose: () => void;
  onToggleTeamFollow: (code: string) => void;
  onTogglePlayerFollow: (name: string) => void;
  onOpenUrl: (url: string) => void;
}

const ROLE_ORDER: Record<string, number> = {
  top: 1,
  jungle: 2,
  mid: 3,
  bot: 4,
  bottom: 4,
  adc: 4,
  support: 5,
  sub: 6,
};

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Top: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  Jungle: { bg: "bg-rw-teal/10", text: "text-rw-teal", border: "border-rw-teal/30" },
  Mid: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  Bot: { bg: "bg-rw-red/10", text: "text-rw-red", border: "border-rw-red/30" },
  Support: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  Sub: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
};

/** "Full history and stats": opens the team's page in the stats hub. */
const TeamStatsLink: React.FC<{ name: string; code: string; onDone: () => void }> = ({ name, code, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  const openRoute = (dest: (slug: string) => void) => {
    setBusy(true);
    loadHubIndexQuick()
      .then((index) => {
        const slug = findHubTeam(index, name, code);
        if (!slug) return setMissing(true);
        dest(slug);
        onDone();
      })
      .catch(() => setMissing(true))
      .finally(() => setBusy(false));
  };
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => openRoute((slug) => navigateHub({ kind: "team", slug }))}
        className="flex items-center gap-1 text-[11px] text-rw-accent hover:underline disabled:opacity-60"
      >
        <BarChart3 className="w-3 h-3" />
        {tl("Full history and stats")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => openRoute((slug) => navigateHub({ kind: "compare", mode: "team", a: slug }))}
        className="flex items-center gap-1 text-[11px] text-rw-sub hover:text-rw-accent hover:underline disabled:opacity-60"
      >
        <GitCompare className="w-3 h-3" />
        {tl("Compare")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => openRoute((slug) => navigateHub({ kind: "prep", a: slug }))}
        className="flex items-center gap-1 text-[11px] text-rw-sub hover:text-rw-accent hover:underline disabled:opacity-60"
      >
        {tl("Match prep")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => openRoute((slug) => navigateHub({ kind: "draft", query: `teams=${encodeURIComponent(slug)},` }))}
        className="flex items-center gap-1 text-[11px] text-rw-sub hover:text-rw-accent hover:underline disabled:opacity-60"
      >
        {tl("Draft board")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => openRoute((slug) => navigateHub({ kind: "finder", query: `team=${encodeURIComponent(slug)}` }))}
        className="flex items-center gap-1 text-[11px] text-rw-sub hover:text-rw-accent hover:underline disabled:opacity-60"
      >
        {tl("Game finder")}
      </button>
    </div>
  );
};

export const TeamRosterModal: React.FC<TeamRosterModalProps> = ({
  teamCode,
  teamName,
  catalog,
  schedule,
  settings,
  onClose,
  onToggleTeamFollow,
  onTogglePlayerFollow,
  onOpenUrl,
}) => {
  useRevealedVersion();
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Keyboard and screen-reader users land inside the pop-up, and go back where they were on close
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!teamCode) return;
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => before?.focus?.();
  }, [teamCode]);

  const upperCode = (teamCode || "").toUpperCase();
  // Exact name first (Riot reuses codes: "KT" is both kt Rolster and kt Challengers), then the
  // main-league team for the code.
  const catalogTeam =
    (teamName ? catalog?.teams?.find((t) => t.name.toLowerCase() === teamName.toLowerCase()) : undefined) ??
    (catalog?.teams && teamCode ? pickTeamByCode(catalog.teams, teamCode) : undefined);

  const displayName = catalogTeam?.name || teamName || teamCode || "";
  const hubLogo = useTeamLogo(teamCode ? displayName : undefined, teamCode ? upperCode : undefined);
  const teamImage = catalogTeam?.image || hubLogo;

  if (!teamCode) return null;

  const isTeamFollowed = settings.followedTeams.includes(upperCode);

  // Find all players matching this team
  const allPlayers = catalog?.players || [];
  const slugPlayers = catalogTeam?.slug ? allPlayers.filter((p) => p.teamSlug === catalogTeam.slug) : [];
  const players = (slugPlayers.length > 0 ? slugPlayers : allPlayers.filter((p) => p.teamCode.toUpperCase() === upperCode))
    .sort((a, b) => {
      const orderA = ROLE_ORDER[a.role.toLowerCase()] || 99;
      const orderB = ROLE_ORDER[b.role.toLowerCase()] || 99;
      return orderA - orderB;
    });

  // Recent & Upcoming Matches for this team
  const teamMatches = schedule.filter(
    (m) => m.team1Code.toUpperCase() === upperCode || m.team2Code.toUpperCase() === upperCode
  );

  const completedMatches = teamMatches
    .filter((m) => m.state === "completed")
    .sort((a, b) => new Date(b.startTimeUtc).getTime() - new Date(a.startTimeUtc).getTime())
    .slice(0, 3);

  const upcomingMatches = teamMatches
    .filter((m) => m.state !== "completed")
    .sort((a, b) => new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime())
    .slice(0, 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={tl("{team} team details", { team: teamName || teamCode })}
    >
      <div
        className="bg-rw-surface border border-rw-accent/60 rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-5 border-b border-rw-border bg-rw-surface flex items-center justify-between">
          <div className="flex items-center gap-4">
            {teamImage ? (
              <img {...riotImg(teamImage, 160)} alt={upperCode} className="w-14 h-14 object-contain rounded-lg drop-shadow" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-rw-bg border border-rw-border flex items-center justify-center font-bold text-xl text-rw-accent">
                {upperCode.slice(0, 3)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigateHub({ kind: "team", slug: prettySlug(displayName) });
                    onClose();
                  }}
                  className="text-xl font-extrabold text-rw-text hover:text-rw-accent hover:underline text-left transition-colors"
                >
                  {displayName}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTeamFollow(upperCode)}
                  className={`p-1 rounded hover:bg-rw-border transition-colors ${
                    isTeamFollowed ? "text-rw-accent" : "text-rw-sub hover:text-rw-accent"
                  }`}
                  aria-label={isTeamFollowed ? tl("Unfollow {name}", { name: upperCode }) : tl("Follow {name}", { name: upperCode })}
                  title={isTeamFollowed ? tl("Unfollow {name}", { name: upperCode }) : tl("Follow {name}", { name: upperCode })}
                >
                  <Star className={`w-4 h-4 ${isTeamFollowed ? "fill-rw-accent" : ""}`} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-rw-sub">
                <button
                  type="button"
                  onClick={() => {
                    navigateHub({ kind: "team", slug: prettySlug(displayName) });
                    onClose();
                  }}
                  className="font-mono font-bold text-rw-teal bg-rw-teal/10 px-2 py-0.5 rounded border border-rw-teal/30 hover:bg-rw-teal/20 transition-colors"
                >
                  {upperCode}
                </button>
                {catalogTeam?.league && (
                  <span>
                    ·{" "}
                    <button
                      type="button"
                      onClick={() => {
                        navigateHub({ kind: "league", slug: resolveLeagueSlug(catalogTeam.league) });
                        onClose();
                      }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {catalogTeam.league}
                    </button>
                  </span>
                )}
                {catalogTeam?.region && (
                  <span>
                    ·{" "}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigateHub({ kind: "leagues" });
                      }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {regionName(catalogTeam.region)}
                    </button>
                  </span>
                )}
              </div>
              <TeamStatsLink name={displayName} code={upperCode} onDone={onClose} />
            </div>
          </div>

          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            aria-label={tl("Close team details")}
            className="p-2 rounded-lg bg-rw-bg hover:bg-rw-border text-rw-sub hover:text-rw-text transition-colors border border-rw-border"
            title={tl("Close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-6">
          {/* Active 5-Man Lineup */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigateHub({ kind: "team", slug: prettySlug(displayName), tab: "history" });
                  }}
                  className="hover:text-rw-accent hover:underline uppercase tracking-wider"
                >
                  {tl("Active Roster ({n})", { n: players.length })}
                </button>
              </h3>
              <span className="text-[11px] text-rw-sub">{tl("Click star to follow player")}</span>
            </div>

            {players.length > 0 ? (
              <RiotCatalogContext.Provider value={catalog ?? null}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {players.map((p) => {
                    const isPlayerFollowed = settings.followedPlayers.includes(p.name);
                    const colors = ROLE_COLORS[p.role] || ROLE_COLORS.Sub;

                    return (
                      <div
                        key={p.name}
                        className="flex items-center justify-between p-3 rounded-xl bg-rw-bg border border-rw-border hover:border-rw-accent/50 transition-all group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerPhoto name={p.name} team={displayName} img={p.image} size={44} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  navigateHub({ kind: "player", slug: prettySlug(p.name) });
                                  onClose();
                                }}
                                className="font-bold text-sm text-rw-text hover:text-rw-accent hover:underline transition-colors truncate text-left"
                              >
                                {p.name}
                              </button>
                              <PhotosLink q={p.name} iconOnly className="text-rw-muted hover:text-rw-accent shrink-0" />
                              <button
                                type="button"
                                onClick={() => {
                                  navigateHub({ kind: "player", slug: prettySlug(p.name), tab: "stats" });
                                  onClose();
                                }}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider hover:opacity-80 ${colors.bg} ${colors.text} ${colors.border}`}
                                title={tl("Stats")}
                              >
                                {roleName(p.role)}
                              </button>
                            </div>
                            {p.realName && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigateHub({ kind: "player", slug: prettySlug(p.name) });
                                  onClose();
                                }}
                                className="block text-xs text-rw-sub hover:text-rw-accent hover:underline truncate text-left"
                              >
                                {p.realName}
                              </button>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onTogglePlayerFollow(p.name)}
                          className={`p-1.5 rounded hover:bg-rw-border transition-colors shrink-0 ml-2 ${
                            isPlayerFollowed ? "text-rw-accent" : "text-rw-sub hover:text-rw-accent"
                          }`}
                          aria-label={isPlayerFollowed ? tl("Unfollow {name}", { name: p.name }) : tl("Follow {name}", { name: p.name })}
                          title={isPlayerFollowed ? tl("Unfollow {name}", { name: p.name }) : tl("Follow {name}", { name: p.name })}
                        >
                          <Star className={`w-4 h-4 ${isPlayerFollowed ? "fill-rw-accent" : ""}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </RiotCatalogContext.Provider>
            ) : (
              <div className="p-6 text-center rounded-xl bg-rw-bg border border-rw-border text-xs text-rw-sub">
                {tl("Roster details for {team} are not currently cataloged.", { team: displayName })}
              </div>
            )}
          </section>

          {/* Schedule & Results Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Upcoming Matches */}
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-rw-accent uppercase tracking-wider flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    navigateHub({ kind: "team", slug: prettySlug(displayName), tab: "matches" });
                    onClose();
                  }}
                  className="hover:underline text-left"
                >
                  {tl("Next Scheduled Matches")}
                </button>
              </h3>
              {upcomingMatches.length > 0 ? (
                <div className="space-y-1.5">
                  {upcomingMatches.map((m) => {
                    const opp = m.team1Code.toUpperCase() === upperCode ? m.team2Name : m.team1Name;
                    const oppCode = m.team1Code.toUpperCase() === upperCode ? m.team2Code : m.team1Code;
                    // spoiler mode: a series under way doesn't add its games yet
                    const h2h = computeHeadToHead(teamCode, oppCode, schedule, m.matchId, !settings.spoilerMode);
                    return (
                      <div
                        key={m.matchId}
                        className="p-2.5 rounded-lg bg-rw-bg border border-rw-border flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-rw-text inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                navigateHub({
                                  kind: "compare",
                                  mode: "team",
                                  a: prettySlug(displayName),
                                  b: prettySlug(opp),
                                });
                                onClose();
                              }}
                              className="text-rw-muted hover:text-rw-accent hover:underline"
                              title={tl("Compare")}
                            >
                              {tl("vs")}
                            </button>
                            <TeamLogo name={opp} code={oppCode} size={14} />
                            <button
                              type="button"
                              onClick={() => {
                                navigateHub({ kind: "team", slug: prettySlug(opp) });
                                onClose();
                              }}
                              className="text-rw-accent hover:underline text-left"
                            >
                              {opp} ({oppCode})
                            </button>
                          </div>
                          <div className="text-[10px] text-rw-sub">
                            <button
                              type="button"
                              onClick={() => {
                                navigateHub({ kind: "league", slug: resolveLeagueSlug(m.leagueSlug || m.leagueName) });
                                onClose();
                              }}
                              className="hover:text-rw-accent hover:underline"
                            >
                              {m.leagueName}
                            </button>{" "}
                            ·{" "}
                            <button
                              type="button"
                              onClick={() => {
                                navigateHub({ kind: "prep", a: prettySlug(displayName), b: prettySlug(opp) });
                                onClose();
                              }}
                              className="hover:text-rw-accent hover:underline"
                              title={tl("Match prep")}
                            >
                              {tc("short best of", "Bo{n}", { n: m.bestOf })}
                            </button>
                          </div>
                          {h2h && <H2HMeter team1Code={teamCode} team2Code={oppCode} h2h={h2h} matchId={m.matchId} />}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <MatchOverviewButton match={m} compact onDone={onClose} />
                          <MatchPrepButton match={m} compact onDone={onClose} />
                          {m.state === "inProgress" ? (
                            <div className="text-right font-mono text-[11px] font-bold text-rw-red">{tl("LIVE")}</div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigateHub({ kind: "prep", a: prettySlug(displayName), b: prettySlug(opp) });
                              }}
                              className="text-right font-mono text-[11px] text-rw-teal hover:underline"
                            >
                              {new Date(m.startTimeUtc).toLocaleDateString(locale(), {
                                month: "short",
                                day: "numeric",
                              })}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 text-center rounded-lg bg-rw-bg border border-rw-border text-xs text-rw-sub">
                  {tl("No upcoming matches scheduled in this window.")}
                </div>
              )}
            </section>

            {/* Recent Results */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    navigateHub({ kind: "team", slug: prettySlug(displayName), tab: "matches" });
                    onClose();
                  }}
                  className="hover:text-rw-accent hover:underline text-left"
                >
                  {tl("Recent Series Results")}
                </button>
              </h3>
              {completedMatches.length > 0 ? (
                <div className="space-y-1.5">
                  {completedMatches.map((m) => {
                    const isT1 = m.team1Code.toUpperCase() === upperCode;
                    const myScore = isT1 ? m.team1Score : m.team2Score;
                    const oppScore = isT1 ? m.team2Score : m.team1Score;
                    const oppName = isT1 ? m.team2Name : m.team1Name;
                    const won = myScore > oppScore;
                    const shown = !settings.spoilerMode || isRevealed(`match:${m.matchId}`);

                    if (!shown) {
                      return (
                        <div
                          key={m.matchId}
                          className="p-2.5 rounded-lg bg-rw-bg border border-rw-border flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-semibold text-rw-text inline-flex items-center gap-1.5 min-w-0 truncate">
                            <button
                              type="button"
                              onClick={() => {
                                navigateHub({
                                  kind: "compare",
                                  mode: "team",
                                  a: prettySlug(displayName),
                                  b: prettySlug(oppName),
                                });
                                onClose();
                              }}
                              className="text-rw-muted hover:text-rw-accent hover:underline"
                              title={tl("Compare")}
                            >
                              {tl("vs")}
                            </button>
                            <TeamLogo name={oppName} size={14} />
                            <button
                              type="button"
                              onClick={() => {
                                navigateHub({ kind: "team", slug: prettySlug(oppName) });
                                onClose();
                              }}
                              className="hover:text-rw-accent hover:underline text-left truncate"
                            >
                              {oppName}
                            </button>
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setRevealed(`match:${m.matchId}`, true)}
                              className="text-[10px] rounded border border-rw-accent/50 text-rw-accent hover:bg-rw-accent/10 px-1.5 py-0.5"
                              title={tl("Result hidden (spoiler mode)")}
                            >
                              {tl("Reveal")}
                            </button>
                            <MatchPrepButton match={m} compact onDone={onClose} />
                          </span>
                        </div>
                      );
                    }

                    const tot = myScore + oppScore;
                    const myShare = tot > 0 ? Math.round((myScore / tot) * 100) : 50;
                    return (
                      <div
                        key={m.matchId}
                        className="p-2.5 rounded-lg bg-rw-bg border border-rw-border flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              findSeriesSlug(m)
                                .catch(() => null)
                                .then((slug) => {
                                  navigateHub({ kind: "match", slug: slug || RIOT_PREFIX + m.matchId });
                                  onClose();
                                });
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 hover:opacity-80 ${
                              won ? "bg-rw-teal/20 text-rw-teal" : "bg-rw-red/20 text-rw-red"
                            }`}
                            title={tl("Details")}
                          >
                            <span className="uppercase">{won ? tl("Win") : tl("Loss")}</span>
                          </button>
                          <span className="font-semibold text-rw-text truncate inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                navigateHub({
                                  kind: "compare",
                                  mode: "team",
                                  a: prettySlug(displayName),
                                  b: prettySlug(oppName),
                                });
                                onClose();
                              }}
                              className="text-rw-muted hover:text-rw-accent hover:underline"
                              title={tl("Compare")}
                            >
                              {tl("vs")}
                            </button>
                            <TeamLogo name={oppName} size={14} />
                            <button
                              type="button"
                              onClick={() => {
                                navigateHub({ kind: "team", slug: prettySlug(oppName) });
                                onClose();
                              }}
                              className="truncate hover:text-rw-accent hover:underline text-left"
                            >
                              {oppName}
                            </button>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {tot > 0 && (
                            <span className="hidden sm:inline-flex w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden gap-[1px] shrink-0" aria-hidden="true">
                              <span className="h-full bg-rw-teal/80" style={{ width: `${myShare}%` }} />
                              <span className="h-full flex-1 bg-rw-red/70" />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              findSeriesSlug(m)
                                .catch(() => null)
                                .then((slug) => {
                                  navigateHub({ kind: "match", slug: slug || RIOT_PREFIX + m.matchId });
                                  onClose();
                                });
                            }}
                            className="font-mono font-bold text-xs text-rw-text hover:text-rw-accent hover:underline tabular-nums"
                            title={tl("Details")}
                          >
                            <span className={won ? "text-rw-teal" : ""}>{myScore}</span> -{" "}
                            <span className={!won ? "text-rw-red" : ""}>{oppScore}</span>
                          </button>
                          <MatchOverviewButton match={m} compact onDone={onClose} />
                          <MatchPrepButton match={m} compact onDone={onClose} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 text-center rounded-lg bg-rw-bg border border-rw-border text-xs text-rw-sub">
                  {tl("No recent completed series found in schedule.")}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-rw-border bg-rw-bg flex items-center justify-between text-xs text-rw-sub">
          <span className="text-[11px]">{tl("Synced with Riot Global Directory")}</span>
          <button
            type="button"
            onClick={() => onOpenUrl(`https://lolesports.com/teams/${catalogTeam?.slug || displayName.toLowerCase()}`)}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-rw-surface hover:bg-rw-raised border border-rw-border text-rw-accent font-semibold text-xs transition-colors"
          >
            <span>{tl("View on LoLEsports")}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
