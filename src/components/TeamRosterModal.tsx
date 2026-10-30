import React, { useEffect, useRef, useState } from "react";
import { CatalogData, Match, AppSettings, PlayerEntry } from "../types";
import { X, Star, ExternalLink, BarChart3 } from "lucide-react";
import { computeHeadToHead, pickTeamByCode } from "../helpers";
import { H2HMeter } from "./H2HMeter";
import { tl, locale, roleName, regionName, tc } from "../i18n";
import { findHubTeam, loadHubIndex } from "../hub/data";
import { navigateHub } from "../hub/route";
import { RiotCatalogContext } from "../hub/riotCatalog";
import { PlayerPhoto, PhotosLink } from "./hub/ui";
import { riotImg } from "../riotImage";

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
  Jungle: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  Mid: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  Bot: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30" },
  Support: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  Sub: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
};

/** "Full history and stats": opens the team's page in the stats hub. */
const TeamStatsLink: React.FC<{ name: string; code: string; onDone: () => void }> = ({ name, code, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        loadHubIndex()
          .then((index) => {
            const slug = findHubTeam(index, name, code);
            if (!slug) return setMissing(true);
            navigateHub({ kind: "team", slug });
            onDone();
          })
          .catch(() => setMissing(true))
          .finally(() => setBusy(false));
      }}
      className="mt-1.5 flex items-center gap-1 text-[11px] text-rw-teal hover:underline disabled:opacity-60"
    >
      <BarChart3 className="w-3 h-3" />
      {tl("Full history and stats")}
    </button>
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

  if (!teamCode) return null;

  const upperCode = teamCode.toUpperCase();
  // Exact name first (Riot reuses codes: "KT" is both kt Rolster and kt Challengers), then the
  // main-league team for the code.
  const catalogTeam =
    (teamName ? catalog?.teams?.find((t) => t.name.toLowerCase() === teamName.toLowerCase()) : undefined) ??
    (catalog?.teams ? pickTeamByCode(catalog.teams, teamCode) : undefined);

  const displayName = catalogTeam?.name || teamName || teamCode;
  const teamImage = catalogTeam?.image;
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
                <h2 className="text-xl font-extrabold text-rw-text">{displayName}</h2>
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
                <span className="font-mono font-bold text-rw-teal bg-rw-teal/10 px-2 py-0.5 rounded border border-rw-teal/30">
                  {upperCode}
                </span>
                {catalogTeam?.league && <span>· {catalogTeam.league}</span>}
                {catalogTeam?.region && <span>· {regionName(catalogTeam.region)}</span>}
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
                <span>{tl("Active Roster ({n})", { n: players.length })}</span>
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
                              <span className="font-bold text-sm text-rw-text group-hover:text-rw-accent transition-colors truncate">
                                {p.name}
                              </span>
                              <PhotosLink q={p.name} iconOnly className="text-rw-muted hover:text-rw-teal shrink-0" />
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${colors.bg} ${colors.text} ${colors.border}`}
                              >
                                {roleName(p.role)}
                              </span>
                            </div>
                            {p.realName && (
                              <div className="text-xs text-rw-sub truncate">{p.realName}</div>
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
              <h3 className="text-xs font-bold text-rw-teal uppercase tracking-wider flex items-center gap-1.5">
                <span>{tl("Next Scheduled Matches")}</span>
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
                          <div className="font-semibold text-rw-text">
                            vs <span className="text-rw-accent">{opp}</span> ({oppCode})
                          </div>
                          <div className="text-[10px] text-rw-sub">
                            {m.leagueName} · {tc("short best of", "Bo{n}", { n: m.bestOf })}
                          </div>
                          {h2h && <H2HMeter team1Code={teamCode} team2Code={oppCode} h2h={h2h} matchId={m.matchId} />}
                        </div>
                        {m.state === "inProgress" ? (
                          <div className="text-right font-mono text-[11px] font-bold text-rw-red">{tl("LIVE")}</div>
                        ) : (
                          <div className="text-right font-mono text-[11px] text-rw-teal">
                            {new Date(m.startTimeUtc).toLocaleDateString(locale(), {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        )}
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
                <span>{tl("Recent Series Results")}</span>
              </h3>
              {completedMatches.length > 0 ? (
                <div className="space-y-1.5">
                  {completedMatches.map((m) => {
                    const isT1 = m.team1Code.toUpperCase() === upperCode;
                    const myScore = isT1 ? m.team1Score : m.team2Score;
                    const oppScore = isT1 ? m.team2Score : m.team1Score;
                    const oppName = isT1 ? m.team2Name : m.team1Name;
                    const won = myScore > oppScore;

                    if (settings.spoilerMode) {
                      return (
                        <div
                          key={m.matchId}
                          className="p-2.5 rounded-lg bg-rw-bg border border-rw-border flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-rw-text">vs {oppName}</span>
                          <span className="text-[10px] text-rw-sub">{tl("Result hidden (spoiler mode)")}</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={m.matchId}
                        className="p-2.5 rounded-lg bg-rw-bg border border-rw-border flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              won ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                            }`}
                          >
                            <span className="uppercase">{won ? tl("Win") : tl("Loss")}</span>
                          </span>
                          <span className="font-semibold text-rw-text">vs {oppName}</span>
                        </div>
                        <div className="font-mono font-bold text-xs text-rw-text">
                          <span className={won ? "text-emerald-400" : ""}>{myScore}</span> -{" "}
                          <span className={!won ? "text-rose-400" : ""}>{oppScore}</span>
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
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-rw-surface hover:bg-rw-raised border border-rw-border text-rw-teal font-semibold text-xs transition-colors"
          >
            <span>{tl("View on LoLEsports")}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
