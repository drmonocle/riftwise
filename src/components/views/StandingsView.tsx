import React, { useEffect, useMemo, useState } from "react";
import { BracketBoard } from "../BracketBoard";
import { Match, CatalogData, AppSettings } from "../../types";
import { Trophy, Star, Eye, EyeOff, RefreshCw, ChevronDown } from "lucide-react";
import {
  fetchLeagueIds,
  fetchLeagueTournaments,
  fetchTournamentStandings,
  pickCurrentTournament,
  leagueDisplayName,
  BracketMatch,
  StandingsStage,
  TournamentInfo,
  TournamentStandings,
} from "../../api";
import { tl, tc, locale, regionName } from "../../i18n";
import { STable } from "../STable";

interface StandingsViewProps {
  schedule: Match[];
  settings: AppSettings;
  catalog?: CatalogData;
  onSelectTeam: (teamCode: string, teamName?: string) => void;
  onToggleTeamFollow?: (teamCode: string) => void;
}

/** Official league standings from Riot's standings feed: group tables, Swiss rounds and brackets. */
export const StandingsView: React.FC<StandingsViewProps> = ({
  schedule,
  settings,
  catalog,
  onSelectTeam,
  onToggleTeamFollow,
}) => {
  const [leagueIds, setLeagueIds] = useState<Record<string, { id: string; name: string; region: string }>>({});
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [tournaments, setTournaments] = useState<TournamentInfo[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [standings, setStandings] = useState<TournamentStandings | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [loading, setLoading] = useState<"leagues" | "tournaments" | "standings" | null>("leagues");
  const [error, setError] = useState<string | null>(null);
  const [revealedStages, setRevealedStages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetchLeagueIds()
      .then((ids) => !cancelled && setLeagueIds(ids))
      .catch(() => !cancelled && setError(tl("Couldn't load the league list from Riot.")))
      .finally(() => !cancelled && setLoading(null));
    return () => {
      cancelled = true;
    };
  }, []);

  // League pills: the leagues you follow, then any league with a match in the current window.
  const pills = useMemo(() => {
    const seen = new Set<string>();
    const out: { slug: string; name: string }[] = [];
    const add = (slug: string, name: string) => {
      const s = slug.toLowerCase();
      if (!s || seen.has(s) || !leagueIds[s]) return;
      seen.add(s);
      out.push({ slug: s, name });
    };
    for (const slug of settings.followedLeagues || []) add(slug, leagueDisplayName({ slug: slug.toLowerCase(), name: leagueIds[slug.toLowerCase()]?.name }, slug));
    for (const m of schedule) add(m.leagueSlug, m.leagueName);
    return out;
  }, [settings.followedLeagues, schedule, leagueIds]);

  const allLeagues = useMemo(
    () =>
      Object.entries(leagueIds)
        .map(([slug, l]) => ({ slug, name: leagueDisplayName({ slug, name: l.name }), region: l.region }))
        .sort((a, b) => regionName(a.region).localeCompare(regionName(b.region), locale()) || a.name.localeCompare(b.name)),
    [leagueIds],
  );

  const activeLeague = selectedLeague && leagueIds[selectedLeague] ? selectedLeague : pills[0]?.slug || "";

  // League -> its tournaments, defaulting to the one in progress.
  useEffect(() => {
    const league = leagueIds[activeLeague];
    if (!league) return;
    let cancelled = false;
    setLoading("tournaments");
    setError(null);
    setStandings(null);
    fetchLeagueTournaments(league.id)
      .then((list) => {
        if (cancelled) return;
        setTournaments(list);
        setSelectedTournament(pickCurrentTournament(list)?.id || "");
      })
      .catch(() => !cancelled && setError(tl("Couldn't load this league's tournaments from Riot.")))
      .finally(() => !cancelled && setLoading(null));
    return () => {
      cancelled = true;
    };
  }, [activeLeague, leagueIds]);

  // Tournament -> standings, opening on the stage that is currently being played.
  useEffect(() => {
    if (!selectedTournament) return;
    let cancelled = false;
    setLoading("standings");
    setError(null);
    fetchTournamentStandings(selectedTournament)
      .then((s) => {
        if (cancelled) return;
        setStandings(s);
        setStageIndex(currentStageIndex(s.stages));
      })
      .catch(() => !cancelled && setError(tl("Couldn't load standings from Riot right now.")))
      .finally(() => !cancelled && setLoading(null));
    return () => {
      cancelled = true;
    };
  }, [selectedTournament]);

  const stage = standings?.stages[stageIndex];
  const tournamentInfo = tournaments.find((t) => t.id === selectedTournament);
  const revealKey = `${selectedTournament}:${stageIndex}`;
  const hideResults = settings.spoilerMode && !revealedStages[revealKey];

  return (
    <div className="space-y-4 select-none">
      {/* League pills + full league picker */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-rw-border">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
          {pills.map((l) => (
            <button
              key={l.slug}
              type="button"
              onClick={() => setSelectedLeague(l.slug)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                activeLeague === l.slug
                  ? "bg-rw-accent text-rw-bg font-bold shadow-md shadow-rw-accent/10"
                  : "bg-rw-surface text-rw-sub hover:text-rw-text hover:bg-rw-raised border border-rw-border"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
        <label className="relative ml-auto max-w-full min-w-0">
          <span className="sr-only">{tl("Choose any league")}</span>
          <select
            value={activeLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
            className="appearance-none max-w-full truncate bg-rw-deep border border-rw-border rounded-lg pl-3 pr-8 py-1 text-xs text-rw-text focus:border-rw-accent focus:outline-none"
          >
            <option value="" disabled>
              {tl("All leagues…")}
            </option>
            {allLeagues.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.region ? `${regionName(l.region)} · ` : ""}{l.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-rw-muted pointer-events-none" />
        </label>
      </div>

      {/* Tournament + stage */}
      {tournaments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative max-w-full min-w-0">
            <span className="sr-only">{tl("Tournament")}</span>
            <select
              value={selectedTournament}
              onChange={(e) => setSelectedTournament(e.target.value)}
              className="appearance-none max-w-full truncate bg-rw-surface border border-rw-border rounded-lg pl-3 pr-8 py-1 text-xs font-semibold text-rw-text focus:border-rw-accent focus:outline-none"
            >
              {tournaments.slice(0, 12).map((t) => (
                <option key={t.id} value={t.id}>
                  {prettyTournament(t)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-rw-muted pointer-events-none" />
          </label>
          {tournamentInfo && (
            <span className="text-[11px] text-rw-muted">
              {tournamentStatus(tournamentInfo)}
            </span>
          )}
          {standings && standings.stages.length > 1 && (
            <div className="flex items-center gap-1 bg-rw-deep p-1 rounded-lg border border-rw-border ml-auto overflow-x-auto max-w-full">
              {standings.stages.map((st, i) => (
                <button
                  key={st.slug || i}
                  type="button"
                  onClick={() => setStageIndex(i)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded whitespace-nowrap transition-all ${
                    i === stageIndex ? "bg-rw-accent text-rw-bg" : "text-rw-sub hover:text-rw-text"
                  }`}
                >
                  {st.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spoiler control for this stage */}
      {settings.spoilerMode && stage && stage.sections.length > 0 && (
        <button
          type="button"
          onClick={() => setRevealedStages((r) => ({ ...r, [revealKey]: !r[revealKey] }))}
          className="flex items-center gap-1.5 text-[11px] text-rw-accent hover:text-rw-text"
          aria-pressed={!hideResults}
        >
          {hideResults ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {hideResults ? tl("Spoiler mode: match results hidden. Reveal this stage") : tl("Hide this stage's results again")}
        </button>
      )}

      {/* Body */}
      {error ? (
        <Notice icon={<Trophy className="w-8 h-8 text-rw-accent/40 mx-auto" />} title={tl("Standings unavailable")} text={error} />
      ) : loading ? (
        <Notice
          icon={<RefreshCw className="w-6 h-6 text-rw-teal mx-auto animate-spin" />}
          title={loading === "leagues" ? tl("Loading leagues…") : loading === "tournaments" ? tl("Finding the current split…") : tl("Loading standings…")}
        />
      ) : !activeLeague ? (
        <Notice icon={<Trophy className="w-8 h-8 text-rw-accent/40 mx-auto" />} title={tl("Pick a league")} text={tl("Choose a league above to see its official standings.")} />
      ) : !stage ? (
        <Notice
          icon={<Trophy className="w-8 h-8 text-rw-accent/40 mx-auto" />}
          title={tl("No standings yet")}
          text={tl("Riot hasn't published a table for this tournament yet.")}
        />
      ) : (
        <div className="space-y-4">
          {stage.sections.map((sec, si) =>
            sec.type === "group" ? (
              <div key={si} className="bg-rw-surface border border-rw-border rounded-xl overflow-hidden shadow-lg">
                {(stage.sections.length > 1 || sec.name !== stage.name) && sec.name && (
                  <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-rw-accent border-b border-rw-border bg-rw-bg">
                    {sec.name}
                  </div>
                )}
                <STable className="w-full text-left text-xs">
                  <thead className="bg-rw-bg border-b border-rw-border text-rw-sub font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">{tl("Team")}</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap">{tc("short result", "W")} – {tc("short result", "L")}</th>
                      <th className="py-2.5 px-3 text-center hidden sm:table-cell">{tl("Win%")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rw-border/60">
                    {sec.rows.flatMap((row) =>
                      row.teams.map((team) => {
                        const isFollowed = settings.followedTeams.includes(team.code);
                        const played = team.wins + team.losses + team.ties;
                        return (
                          <tr key={`${row.rank}-${team.code}`} className={`hover:bg-rw-raised/60 transition-colors group ${isFollowed ? "bg-rw-accent/5" : ""}`}>
                            <td className="py-2.5 px-3 text-center font-bold font-mono">
                              <RankBadge rank={row.rank} />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <TeamLogo code={team.code} image={team.image} onClick={() => onSelectTeam(team.code, team.name)} />
                                <button
                                  type="button"
                                  onClick={() => onSelectTeam(team.code, team.name)}
                                  className="font-bold text-rw-text group-hover:text-rw-accent transition-colors truncate text-left"
                                  title={tl("View {team} roster", { team: team.name })}
                                >
                                  <span className="sm:hidden">{team.code}</span>
                                  <span className="hidden sm:inline">{team.name}</span>
                                </button>
                                {onToggleTeamFollow && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleTeamFollow(team.code);
                                    }}
                                    className={`p-1 rounded hover:bg-rw-border transition-colors shrink-0 ${isFollowed ? "text-rw-accent" : "text-rw-muted hover:text-rw-accent"}`}
                                    aria-label={isFollowed ? tl("Unfollow {name}", { name: team.code }) : tl("Follow {name}", { name: team.code })}
                                    title={isFollowed ? tl("Unfollow {name}", { name: team.code }) : tl("Follow {name}", { name: team.code })}
                                  >
                                    <Star className={`w-3.5 h-3.5 ${isFollowed ? "fill-rw-accent" : ""}`} />
                                  </button>
                                )}
                                <span className="hidden sm:inline text-[11px] font-mono text-rw-sub">{team.code}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-sm whitespace-nowrap">
                              {hideResults ? (
                                <span className="text-rw-muted">? – ?</span>
                              ) : (
                                <>
                                  <span className="text-emerald-400">{team.wins}</span>
                                  <span className="text-rw-muted mx-1">–</span>
                                  <span className="text-rose-400">{team.losses}</span>
                                  {team.ties > 0 && <span className="text-rw-sub text-xs"> – {team.ties}</span>}
                                </>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-xs text-rw-teal hidden sm:table-cell">
                              {hideResults ? "–" : played > 0 ? `${Math.round((team.wins / played) * 100)}%` : "–"}
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </STable>
              </div>
            ) : (
              <div key={si} className="bg-rw-surface border border-rw-border rounded-xl shadow-lg overflow-hidden">
                {(stage.sections.length > 1 || sec.name !== stage.name) && sec.name && (
                  <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-rw-accent border-b border-rw-border bg-rw-bg">
                    {sec.name}
                  </div>
                )}
                <div className="overflow-x-auto p-3">
                  <BracketBoard
                    colClass="w-[200px]"
                    titleClass="text-[10px] font-bold uppercase tracking-wider text-rw-sub px-1 mb-2"
                    columns={sec.rounds.map((round, ri) => ({
                      key: String(ri),
                      title: round.name,
                      items: round.matches.map((m) => {
                        const shown = !(hideResults && m.state !== "unstarted") && m.state === "completed";
                        return {
                          key: m.id,
                          teams: m.teams.map((t) => t.code),
                          winner: shown ? m.teams.find((t) => t.outcome === "win")?.code ?? null : null,
                          node: <MatchCard match={m} hideResults={hideResults} onSelectTeam={onSelectTeam} />,
                        };
                      }),
                    }))}
                  />
                </div>
              </div>
            ),
          )}
          {standings && (
            <div className="text-[10px] text-rw-muted text-right">
              {tl("Official standings from lolesports.com · updated {time}", { time: new Date(standings.fetchedAt).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }) })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Open on the stage still being played: the last one with any finished or live match. */
function currentStageIndex(stages: StandingsStage[]): number {
  for (let i = stages.length - 1; i >= 0; i--) {
    const started = stages[i].sections.some(
      (s) => s.rows.some((r) => r.teams.some((t) => t.wins + t.losses + t.ties > 0)) || s.rounds.some((r) => r.matches.some((m) => m.state !== "unstarted")),
    );
    if (started) return i;
  }
  return 0;
}

// Riot only gives tournaments a slug ("lck_split_2_2026", "lec_summer_2025"); the season words in it
// are translated the way each region says them (서머, 夏季赛, Verano...).
const tournamentWords = (): [RegExp, string][] => [
  [/\bRegional Qualifier\b/, tc("tournament", "Regional Qualifier")],
  [/\bRegional Finals\b/, tc("tournament", "Regional Finals")],
  [/\bSeason Finals\b/, tc("tournament", "Season Finals")],
  [/\bSplit\b/, tc("tournament", "Split")],
  [/\bSpring\b/, tc("tournament", "Spring")],
  [/\bSummer\b/, tc("tournament", "Summer")],
  [/\bWinter\b/, tc("tournament", "Winter")],
  [/\bCUP\b/, tc("tournament", "Cup")],
  [/\bKickoff\b/, tc("tournament", "Kickoff")],
  [/\bPlayoffs\b/, tc("tournament", "Playoffs")],
  [/\bFinals\b/, tc("tournament", "Finals")],
];

function prettyTournament(t: TournamentInfo): string {
  const words = t.slug.replace(/[-_]+/g, " ").trim().split(" ");
  const english = words.map((w) => (/^\d/.test(w) || w.length <= 4 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
  return tournamentWords().reduce((s, [re, word]) => s.replace(re, word), english);
}

function tournamentStatus(t: TournamentInfo): string {
  const today = new Date().toISOString().slice(0, 10);
  const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(locale(), { month: "short", day: "numeric" });
  if (t.startDate <= today && today <= t.endDate) return tl("In progress · {from} – {to}", { from: fmt(t.startDate), to: fmt(t.endDate) });
  if (t.endDate < today) return tl("Finished {date}", { date: fmt(t.endDate) });
  return tl("Starts {date}", { date: fmt(t.startDate) });
}

const Notice: React.FC<{ icon: React.ReactNode; title: string; text?: string }> = ({ icon, title, text }) => (
  <div className="bg-rw-surface border border-rw-border rounded-xl p-8 text-center text-xs text-rw-sub space-y-2" role="status">
    {icon}
    <p className="font-semibold text-rw-text">{title}</p>
    {text && <p>{text}</p>}
  </div>
);

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  const styles: Record<number, string> = {
    1: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    2: "bg-slate-300/20 text-slate-200 border-slate-300/40",
    3: "bg-amber-700/20 text-amber-500 border-amber-700/40",
  };
  return styles[rank] ? (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${styles[rank]}`}>{rank}</span>
  ) : (
    <span className="text-rw-sub">{rank}</span>
  );
};

const TeamLogo: React.FC<{ code: string; image?: string; onClick: () => void; size?: string }> = ({ code, image, onClick, size = "w-7 h-7" }) =>
  image ? (
    <img src={image} alt="" className={`${size} object-contain rounded shrink-0 cursor-pointer`} onClick={onClick} />
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={`${size} rounded bg-rw-bg border border-rw-border flex items-center justify-center font-bold text-[10px] text-rw-accent shrink-0 font-mono`}
    >
      {code.slice(0, 3)}
    </button>
  );

const MatchCard: React.FC<{ match: BracketMatch; hideResults: boolean; onSelectTeam: (code: string, name?: string) => void }> = ({
  match,
  hideResults,
  onSelectTeam,
}) => {
  const masked = hideResults && match.state !== "unstarted";
  return (
    <div
      className={`rounded-lg border bg-rw-bg px-2.5 py-2 space-y-1 ${
        match.state === "inProgress" ? "border-rw-red/70" : "border-rw-border"
      }`}
    >
      {match.teams.map((t, i) => {
        const won = !masked && t.outcome === "win";
        const lost = !masked && t.outcome === "loss";
        const tbd = t.code === "TBD";
        return (
          <div key={i} className={`flex items-center justify-between gap-2 text-xs ${lost ? "opacity-50" : ""}`}>
            <button
              type="button"
              disabled={tbd}
              onClick={() => onSelectTeam(t.code, t.name)}
              className={`flex items-center gap-2 min-w-0 ${won ? "text-rw-teal font-bold" : "text-rw-text"} disabled:text-rw-muted`}
              title={tbd ? undefined : tl("View {team} roster", { team: t.name })}
            >
              <TeamLogo code={t.code} image={tbd ? undefined : t.image} onClick={() => !tbd && onSelectTeam(t.code, t.name)} size="w-5 h-5" />
              <span className="truncate">{t.code}</span>
            </button>
            <span className="font-mono font-bold">
              {match.state === "unstarted" ? "" : masked ? "·" : t.gameWins}
            </span>
          </div>
        );
      })}
      <div className="text-[9px] uppercase tracking-wider text-rw-muted pt-0.5">
        {match.state === "inProgress" ? <span className="text-rw-red">{tl("Live")}</span> : match.state === "completed" ? (masked ? tl("Final · hidden") : tl("Final")) : tl("Upcoming")}
      </div>
    </div>
  );
};
