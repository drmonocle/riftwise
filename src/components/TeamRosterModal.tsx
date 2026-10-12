import React, { useEffect, useRef } from "react";
import { CatalogData, Match, AppSettings, PlayerEntry } from "../types";
import { X, Star, Calendar, Shield, ExternalLink, User } from "lucide-react";
import { computeHeadToHead, pickTeamByCode } from "../helpers";
import { H2HMeter } from "./H2HMeter";

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
      aria-label={`${teamName || teamCode} team details`}
    >
      <div
        className="bg-[#0a1420] border border-[#c8aa6e]/60 rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-5 border-b border-[#1e282d] bg-gradient-to-r from-[#091428] via-[#0a1420] to-[#091428] flex items-center justify-between">
          <div className="flex items-center gap-4">
            {teamImage ? (
              <img src={teamImage} alt={upperCode} className="w-14 h-14 object-contain rounded-lg drop-shadow" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-[#091428] border border-[#1e282d] flex items-center justify-center font-bold text-xl text-[#c8aa6e]">
                {upperCode.slice(0, 3)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-[#f0e6d2]">{displayName}</h2>
                <button
                  type="button"
                  onClick={() => onToggleTeamFollow(upperCode)}
                  className={`p-1 rounded hover:bg-[#1e282d] transition-colors ${
                    isTeamFollowed ? "text-[#c8aa6e]" : "text-[#9bb3c9] hover:text-[#c8aa6e]"
                  }`}
                  aria-label={isTeamFollowed ? `Unfollow ${upperCode}` : `Follow ${upperCode}`}
                  title={isTeamFollowed ? `Unfollow ${upperCode}` : `Follow ${upperCode}`}
                >
                  <Star className={`w-4 h-4 ${isTeamFollowed ? "fill-[#c8aa6e]" : ""}`} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-[#9bb3c9]">
                <span className="font-mono font-bold text-[#0ac8b9] bg-[#0ac8b9]/10 px-2 py-0.5 rounded border border-[#0ac8b9]/30">
                  {upperCode}
                </span>
                {catalogTeam?.league && <span>· {catalogTeam.league}</span>}
                {catalogTeam?.region && <span>· {catalogTeam.region}</span>}
              </div>
            </div>
          </div>

          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close team details"
            className="p-2 rounded-lg bg-[#091428] hover:bg-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2] transition-colors border border-[#1e282d]"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-6">
          {/* Active 5-Man Lineup */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#0ac8b9]" />
                <span>Active Roster ({players.length})</span>
              </h3>
              <span className="text-[11px] text-[#9bb3c9]">Click star to follow player</span>
            </div>

            {players.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {players.map((p) => {
                  const isPlayerFollowed = settings.followedPlayers.includes(p.name);
                  const colors = ROLE_COLORS[p.role] || ROLE_COLORS.Sub;

                  return (
                    <div
                      key={p.name}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#091428] border border-[#1e282d] hover:border-[#c8aa6e]/50 transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={p.name}
                            className="w-11 h-11 rounded-full object-cover bg-[#0a1420] border border-[#1e282d] shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-[#0a1420] border border-[#1e282d] flex items-center justify-center text-[#9bb3c9] shrink-0">
                            <User className="w-5 h-5 opacity-70" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#f0e6d2] group-hover:text-[#c8aa6e] transition-colors truncate">
                              {p.name}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${colors.bg} ${colors.text} ${colors.border}`}
                            >
                              {p.role}
                            </span>
                          </div>
                          {p.realName && (
                            <div className="text-xs text-[#9bb3c9] truncate">{p.realName}</div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onTogglePlayerFollow(p.name)}
                        className={`p-1.5 rounded hover:bg-[#1e282d] transition-colors shrink-0 ml-2 ${
                          isPlayerFollowed ? "text-[#c8aa6e]" : "text-[#9bb3c9] hover:text-[#c8aa6e]"
                        }`}
                        aria-label={isPlayerFollowed ? `Unfollow ${p.name}` : `Follow ${p.name}`}
                        title={isPlayerFollowed ? `Unfollow ${p.name}` : `Follow ${p.name}`}
                      >
                        <Star className={`w-4 h-4 ${isPlayerFollowed ? "fill-[#c8aa6e]" : ""}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center rounded-xl bg-[#091428] border border-[#1e282d] text-xs text-[#9bb3c9]">
                Roster details for {displayName} are not currently cataloged.
              </div>
            )}
          </section>

          {/* Schedule & Results Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Upcoming Matches */}
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-[#0ac8b9] uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Next Scheduled Matches</span>
              </h3>
              {upcomingMatches.length > 0 ? (
                <div className="space-y-1.5">
                  {upcomingMatches.map((m) => {
                    const opp = m.team1Code.toUpperCase() === upperCode ? m.team2Name : m.team1Name;
                    const oppCode = m.team1Code.toUpperCase() === upperCode ? m.team2Code : m.team1Code;
                    const h2h = computeHeadToHead(teamCode, oppCode, schedule, m.matchId);
                    return (
                      <div
                        key={m.matchId}
                        className="p-2.5 rounded-lg bg-[#091428] border border-[#1e282d] flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-[#f0e6d2]">
                            vs <span className="text-[#c8aa6e]">{opp}</span> ({oppCode})
                          </div>
                          <div className="text-[10px] text-[#9bb3c9]">
                            {m.leagueName} · Bo{m.bestOf}
                          </div>
                          {h2h && <H2HMeter team1Code={teamCode} team2Code={oppCode} h2h={h2h} matchId={m.matchId} />}
                        </div>
                        {m.state === "inProgress" ? (
                          <div className="text-right font-mono text-[11px] font-bold text-[#e84057]">LIVE</div>
                        ) : (
                          <div className="text-right font-mono text-[11px] text-[#0ac8b9]">
                            {new Date(m.startTimeUtc).toLocaleDateString([], {
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
                <div className="p-3 text-center rounded-lg bg-[#091428] border border-[#1e282d] text-xs text-[#9bb3c9]">
                  No upcoming matches scheduled in this window.
                </div>
              )}
            </section>

            {/* Recent Results */}
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
                <span>Recent Series Results</span>
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
                          className="p-2.5 rounded-lg bg-[#091428] border border-[#1e282d] flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-[#f0e6d2]">vs {oppName}</span>
                          <span className="text-[10px] text-[#9bb3c9]">Result hidden (spoiler mode)</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={m.matchId}
                        className="p-2.5 rounded-lg bg-[#091428] border border-[#1e282d] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              won ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                            }`}
                          >
                            {won ? "WIN" : "LOSS"}
                          </span>
                          <span className="font-semibold text-[#f0e6d2]">vs {oppName}</span>
                        </div>
                        <div className="font-mono font-bold text-xs text-[#f0e6d2]">
                          <span className={won ? "text-emerald-400" : ""}>{myScore}</span> -{" "}
                          <span className={!won ? "text-rose-400" : ""}>{oppScore}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 text-center rounded-lg bg-[#091428] border border-[#1e282d] text-xs text-[#9bb3c9]">
                  No recent completed series found in schedule.
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#1e282d] bg-[#091428] flex items-center justify-between text-xs text-[#9bb3c9]">
          <span className="text-[11px]">Synced with Riot Global Directory</span>
          <button
            type="button"
            onClick={() => onOpenUrl(`https://lolesports.com/teams/${catalogTeam?.slug || displayName.toLowerCase()}`)}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#0a1420] hover:bg-[#121e2d] border border-[#1e282d] text-[#0ac8b9] font-semibold text-xs transition-colors"
          >
            <span>View on LoLEsports</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
