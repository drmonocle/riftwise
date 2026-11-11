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
import { riotImg } from "../../riotImage";
import { navigateHub } from "../../hub/route";
import { bare, normText, prettySlug, resolveLeagueSlug, resolveTeamAlias } from "../../hub/data";

const teamSlug = (name?: string, code?: string) =>
  (name && resolveTeamAlias(name)) || (code && resolveTeamAlias(code)) || prettySlug(name || code || "");
import { searchAlias } from "../../searchAliases";
import { SectionCard } from "../hub/BroadcastCard";
import { useTeamLogo } from "../hub/ui";

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
  const [groupSearch, setGroupSearch] = useState("");

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
                  ? "bg-rw-accent text-rw-bg font-bold"
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
            activeLeague ? (
              <button
                type="button"
                onClick={() => navigateHub({ kind: "league", slug: resolveLeagueSlug(activeLeague) })}
                className="text-[11px] text-rw-muted hover:text-rw-accent hover:underline"
              >
                {tournamentStatus(tournamentInfo)}
              </button>
            ) : (
              <span className="text-[11px] text-rw-muted">
                {tournamentStatus(tournamentInfo)}
              </span>
            )
          )}
          {activeLeague && (
            <span className="flex flex-wrap items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => navigateHub({ kind: "league", slug: resolveLeagueSlug(activeLeague) })}
                className="font-semibold text-rw-accent hover:underline"
              >
                {tl("Full history and stats")} →
              </button>
              <button
                type="button"
                onClick={() => navigateHub({ kind: "champions", query: `league=${encodeURIComponent(resolveLeagueSlug(activeLeague))}` })}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Champions")} →
              </button>
              <button
                type="button"
                onClick={() => navigateHub({ kind: "tiers", query: `scope=${encodeURIComponent(resolveLeagueSlug(activeLeague))}` })}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </button>
              <button
                type="button"
                onClick={() => navigateHub({ kind: "leaders", query: `league=${encodeURIComponent(resolveLeagueSlug(activeLeague))}` })}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </button>
              <button
                type="button"
                onClick={() => navigateHub({ kind: "rankings", query: `league=${encodeURIComponent(resolveLeagueSlug(activeLeague))}` })}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </button>
              <button
                type="button"
                onClick={() => navigateHub({ kind: "best", query: `league=${encodeURIComponent(resolveLeagueSlug(activeLeague))}` })}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Best games")} →
              </button>
              <button
                type="button"
                onClick={() => navigateHub({ kind: "finder", query: `league=${encodeURIComponent(resolveLeagueSlug(activeLeague))}` })}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </button>
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
            sec.type === "group" ? (() => {
              const allGroupTeams = sec.rows.flatMap((r) => r.teams.map((t) => ({ rank: r.rank, team: t })));
              const groupTerms = groupSearch
                .trim()
                .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                .map((s) => normText(searchAlias(s.trim())))
                .filter(Boolean);
              const filteredGroupEntries =
                groupTerms.length > 0
                  ? allGroupTeams.filter(({ team }) => {
                      const hay = normText(`${team.name || ""} ${team.code || ""}`);
                      const tSlug = teamSlug(team.name, team.code);
                      return groupTerms.some(
                        (q) =>
                          hay.includes(q) ||
                          (bare(q).length >= 2 && bare(hay).includes(bare(q))) ||
                          (!!tSlug && resolveTeamAlias(q) === tSlug),
                      );
                    })
                  : allGroupTeams;
              const groupTeams = filteredGroupEntries.map((e) => e.team).filter((t) => t.code && t.code !== "TBD");
              return (
              <div key={si} className="bg-rw-panel border border-rw-border rounded-xl overflow-hidden">
                <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-rw-accent border-b border-rw-border bg-rw-bg flex flex-wrap items-center justify-between gap-2">
                  <span>{sec.name || stage.name}</span>
                  <span className="flex flex-wrap items-center gap-2 font-normal normal-case tracking-normal">
                    {allGroupTeams.length > 6 && (
                      <input
                        type="search"
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        placeholder={tl("Filter by name or team…")}
                        aria-label={tl("Filter by name or team…")}
                        className="bg-rw-panel border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
                      />
                    )}
                    {(() => {
                      const yr = tournamentInfo?.startDate?.slice(0, 4);
                      if (groupTeams.length === 1 && groupTerms.length > 0) {
                        const a = teamSlug(groupTeams[0].name, groupTeams[0].code);
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => navigateHub({ kind: "prep", a, period: yr ? `y${yr}` : undefined })}
                              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                            >
                              {tl("Match prep")} →
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                navigateHub({
                                  kind: "draft",
                                  query: `teams=${encodeURIComponent(a)}${yr ? `&p=${encodeURIComponent(`y${yr}`)}` : ""}`,
                                })
                              }
                              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                            >
                              {tl("Draft board")} →
                            </button>
                            <button
                              type="button"
                              onClick={() => navigateHub({ kind: "compare", mode: "team", a, period: yr ? `y${yr}` : undefined })}
                              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                            >
                              {tl("Compare")} →
                            </button>
                            <button
                              type="button"
                              onClick={() => navigateHub({ kind: "finder", query: `team=${encodeURIComponent(a)}${yr ? `&year=${encodeURIComponent(yr)}` : ""}` })}
                              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                            >
                              {tl("Game finder")} →
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                navigateHub({
                                  kind: "rankings",
                                  query: new URLSearchParams({
                                    ...(activeLeague ? { league: resolveLeagueSlug(activeLeague) } : {}),
                                    q: a,
                                  }).toString(),
                                })
                              }
                              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                            >
                              {tl("Power rankings")} →
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const q = new URLSearchParams({
                                  ...(activeLeague ? { league: resolveLeagueSlug(activeLeague) } : {}),
                                  ...(yr ? { year: yr } : {}),
                                  q: a,
                                }).toString();
                                navigateHub({ kind: "leaders", ...(q ? { query: q } : {}) });
                              }}
                              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                            >
                              {tl("Player leaderboards")} →
                            </button>
                          </>
                        );
                      }
                      if (groupTeams.length < 2) return null;
                      const a = teamSlug(groupTeams[0].name, groupTeams[0].code);
                      const b = teamSlug(groupTeams[1].name, groupTeams[1].code);
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => navigateHub({ kind: "prep", a, b, period: yr ? `y${yr}` : undefined })}
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Match prep")} →
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigateHub({
                                kind: "draft",
                                query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}${yr ? `&p=${encodeURIComponent(`y${yr}`)}` : ""}`,
                              })
                            }
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Draft board")} →
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateHub({ kind: "compare", mode: "team", a, b, period: yr ? `y${yr}` : undefined })}
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Compare")} →
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigateHub({
                                kind: "finder",
                                query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}${yr ? `&year=${encodeURIComponent(yr)}` : ""}`,
                              })
                            }
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Game finder")} →
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigateHub({
                                kind: "rankings",
                                query: new URLSearchParams({
                                  ...(activeLeague ? { league: resolveLeagueSlug(activeLeague) } : {}),
                                  q: `${a},${b}`,
                                }).toString(),
                              })
                            }
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Power rankings")} →
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const q = new URLSearchParams({
                                ...(activeLeague ? { scope: resolveLeagueSlug(activeLeague) } : {}),
                                ...(yr ? { key: `y${yr}` } : {}),
                              }).toString();
                              navigateHub({ kind: "tiers", ...(q ? { query: q } : {}) });
                            }}
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Pro tier list")} →
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const q = new URLSearchParams({
                                ...(activeLeague ? { league: resolveLeagueSlug(activeLeague) } : {}),
                                ...(yr ? { year: yr } : {}),
                                q: `${a},${b}`,
                              }).toString();
                              navigateHub({ kind: "leaders", ...(q ? { query: q } : {}) });
                            }}
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Player leaderboards")} →
                          </button>
                        </>
                      );
                    })()}
                    {!hideResults && (
                      <SectionCard
                        section={sec.name || stage.name}
                        name={tournamentInfo ? prettyTournament(tournamentInfo) : activeLeague.toUpperCase()}
                        sub={stage.name}
                        rows={() =>
                          filteredGroupEntries.map(({ rank, team }) => {
                            const played = team.wins + team.losses + team.ties;
                            return {
                              rank: String(rank),
                              team: team.name || team.code,
                              label: team.name,
                              sub: team.code,
                              value: `${team.wins}–${team.losses}${team.ties > 0 ? `–${team.ties}` : ""}`,
                              note: played > 0 ? `${Math.round((team.wins / played) * 100)}%` : "",
                              win: played > 0 ? team.wins / played >= 0.5 : undefined,
                            };
                          })
                        }
                      />
                    )}
                  </span>
                </div>
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
                    {filteredGroupEntries.map(({ rank, team }) => {
                        const row = { rank };
                        const isFollowed = settings.followedTeams.includes(team.code);
                        const played = team.wins + team.losses + team.ties;
                        return (
                          <tr key={`${row.rank}-${team.code}`} className={`hover:bg-rw-raised/60 transition-colors group ${isFollowed ? "bg-rw-accent/5" : ""}`}>
                            <td className="py-2.5 px-3 text-center font-bold font-mono" data-sort={row.rank}>
                              <RankBadge rank={row.rank} />
                            </td>
                            <td className="py-2.5 px-3" data-sort={team.name}>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <TeamLogo code={team.code} name={team.name} image={team.image} onClick={() => onSelectTeam(team.code, team.name)} />
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
                                <button
                                  type="button"
                                  onClick={() => navigateHub({ kind: "team", slug: teamSlug(team.name, team.code) })}
                                  className="hidden sm:inline text-[11px] font-mono text-rw-sub hover:text-rw-accent hover:underline"
                                >
                                  {team.code}
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-sm whitespace-nowrap" data-sort={hideResults ? 0 : team.wins * 1000 - team.losses}>
                              {hideResults ? (
                                <span className="text-rw-muted">? – ?</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => navigateHub({ kind: "team", slug: teamSlug(team.name, team.code), tab: "matches" })}
                                  className="inline-flex flex-col items-center gap-0.5 hover:opacity-80"
                                  title={tl("Full history and stats")}
                                >
                                  <span className="hover:underline">
                                    <span className="text-rw-teal">{team.wins}</span>
                                    <span className="text-rw-muted mx-1">–</span>
                                    <span className="text-rw-red">{team.losses}</span>
                                    {team.ties > 0 && <span className="text-rw-sub text-xs"> – {team.ties}</span>}
                                  </span>
                                  {played > 0 && (
                                    <span className="w-10 h-1 rounded-full bg-rw-border/70 overflow-hidden flex gap-[1px]" aria-hidden="true">
                                      <span className="h-full bg-rw-teal/80" style={{ width: `${Math.round((team.wins / played) * 100)}%` }} />
                                      <span className="h-full flex-1 bg-rw-red/70" />
                                    </span>
                                  )}
                                </button>
                              )}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-center font-mono text-xs hidden sm:table-cell ${!hideResults && played > 0 && team.wins / played >= 0.5 ? "text-rw-teal font-semibold" : "text-rw-sub"}`}
                              data-sort={hideResults || played === 0 ? -1 : Math.round((team.wins / played) * 1000)}
                            >
                              {hideResults ? (
                                "–"
                              ) : played > 0 ? (
                                <span className="inline-flex items-center justify-center gap-1.5">
                                  <span className="w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                                    <span
                                      className={`block h-full rounded-full ${team.wins / played >= 0.5 ? "bg-rw-teal/80" : "bg-rw-red/70"}`}
                                      style={{ width: `${Math.max(4, Math.min(100, Math.round((team.wins / played) * 100)))}%` }}
                                    />
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => navigateHub({ kind: "team", slug: teamSlug(team.name, team.code), tab: "stats" })}
                                    className="hover:text-rw-accent hover:underline"
                                    title={tl("Stats")}
                                  >
                                    {Math.round((team.wins / played) * 100)}%
                                  </button>
                                </span>
                              ) : (
                                "–"
                              )}
                            </td>
                          </tr>
                        );
                    })}
                  </tbody>
                </STable>
              </div>
              );
            })() : (
              <div key={si} className="bg-rw-panel border border-rw-border rounded-xl overflow-hidden">
                <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-rw-accent border-b border-rw-border bg-rw-bg flex flex-wrap items-center justify-between gap-2">
                  <span>{sec.name || stage.name}</span>
                  <span className="flex flex-wrap items-center gap-2 font-normal normal-case tracking-normal">
                    {(() => {
                      const yr = tournamentInfo?.startDate?.slice(0, 4);
                      const bracketMatches = sec.rounds.flatMap((round) =>
                        round.matches.filter((m) => m.teams.length === 2 && m.teams.every((t) => t.code && t.code !== "TBD")),
                      );
                      const featured = bracketMatches[bracketMatches.length - 1] ?? bracketMatches[0];
                      const a = featured ? teamSlug(featured.teams[0].name, featured.teams[0].code) : "";
                      const b = featured ? teamSlug(featured.teams[1].name, featured.teams[1].code) : "";
                      return (
                        <>
                          {a && b && (
                            <>
                              <button
                                type="button"
                                onClick={() => navigateHub({ kind: "prep", a, b, period: yr ? `y${yr}` : undefined })}
                                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                              >
                                {tl("Match prep")} →
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  navigateHub({
                                    kind: "draft",
                                    query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}${yr ? `&p=${encodeURIComponent(`y${yr}`)}` : ""}`,
                                  })
                                }
                                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                              >
                                {tl("Draft board")} →
                              </button>
                              <button
                                type="button"
                                onClick={() => navigateHub({ kind: "compare", mode: "team", a, b, period: yr ? `y${yr}` : undefined })}
                                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                              >
                                {tl("Compare")} →
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  navigateHub({
                                    kind: "finder",
                                    query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}${yr ? `&year=${encodeURIComponent(yr)}` : ""}`,
                                  })
                                }
                                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                              >
                                {tl("Game finder")} →
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const q = new URLSearchParams({
                                ...(activeLeague ? { league: resolveLeagueSlug(activeLeague) } : {}),
                                ...(a && b ? { q: `${a},${b}` } : {}),
                              }).toString();
                              navigateHub({ kind: "rankings", ...(q ? { query: q } : {}) });
                            }}
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Power rankings")} →
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const q = new URLSearchParams({
                                ...(activeLeague ? { scope: resolveLeagueSlug(activeLeague) } : {}),
                                ...(yr ? { key: `y${yr}` } : {}),
                              }).toString();
                              navigateHub({ kind: "tiers", ...(q ? { query: q } : {}) });
                            }}
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Pro tier list")} →
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const q = new URLSearchParams({
                                ...(activeLeague ? { league: resolveLeagueSlug(activeLeague) } : {}),
                                ...(yr ? { year: yr } : {}),
                                ...(a && b ? { q: `${a},${b}` } : {}),
                              }).toString();
                              navigateHub({ kind: "leaders", ...(q ? { query: q } : {}) });
                            }}
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Player leaderboards")} →
                          </button>
                        </>
                      );
                    })()}
                    {!hideResults && (
                      <SectionCard
                        section={sec.name || stage.name}
                        name={tournamentInfo ? prettyTournament(tournamentInfo) : activeLeague.toUpperCase()}
                        sub={stage.name}
                        rows={() =>
                          sec.rounds
                            .flatMap((round) =>
                              round.matches
                                .filter((m) => m.teams.length === 2 && m.teams.some((t) => t.code && t.code !== "TBD"))
                                .map((m) => ({ m, roundName: round.name })),
                            )
                            .map(({ m, roundName }, idx) => {
                              const t1 = m.teams[0];
                              const t2 = m.teams[1];
                              const w1 = m.state === "completed" && t1.outcome === "win";
                              const w2 = m.state === "completed" && t2.outcome === "win";
                              return {
                                rank: idx + 1,
                                team: w2 ? t2.name || t2.code : t1.name || t1.code,
                                label: `${t1.name || t1.code} vs ${t2.name || t2.code}`,
                                sub: roundName,
                                value: m.state === "unstarted" ? tl("Upcoming") : `${t1.gameWins}–${t2.gameWins}`,
                                win: m.state === "completed" ? w1 || w2 : undefined,
                              };
                            })
                        }
                      />
                    )}
                  </span>
                </div>
                <div className="overflow-x-auto p-3">
                  <BracketBoard
                    colClass="w-[200px] grow max-w-80"
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
                          node: <MatchCard match={m} hideResults={hideResults} onSelectTeam={onSelectTeam} year={tournamentInfo?.startDate?.slice(0, 4)} />,
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
  <div className="bg-rw-panel border border-rw-border rounded-xl p-8 text-center text-xs text-rw-sub space-y-2" role="status">
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

/** A team's logo (or its code in a box). Clickable on its own only with onClick: inside a button it is just a picture,
 *  since a button inside a button is invalid HTML (and the click would fire twice). */
const TeamLogo: React.FC<{ code: string; name?: string; image?: string; onClick?: () => void; size?: string }> = ({ code, name, image, onClick, size = "w-7 h-7" }) => {
  const hubLogo = useTeamLogo(name || code, code);
  const src = image || hubLogo;
  const box = `${size} rounded bg-rw-bg border border-rw-border flex items-center justify-center font-bold text-[10px] text-rw-accent shrink-0 font-mono`;
  if (src) return <img {...riotImg(src, 96)} alt="" className={`${size} object-contain rounded shrink-0 ${onClick ? "cursor-pointer" : ""}`} onClick={onClick} />;
  return onClick ? (
    <button type="button" onClick={onClick} className={box}>
      {code.slice(0, 3)}
    </button>
  ) : (
    <span className={box}>{code.slice(0, 3)}</span>
  );
};

const MatchCard: React.FC<{ match: BracketMatch; hideResults: boolean; onSelectTeam: (code: string, name?: string) => void; year?: string }> = ({
  match,
  hideResults,
  onSelectTeam,
  year,
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
              <TeamLogo code={t.code} name={tbd ? undefined : t.name} image={tbd ? undefined : t.image} size="w-5 h-5" />
              <span className="truncate">{t.code}</span>
            </button>
            <span className="font-mono font-bold">
              {match.state === "unstarted" ? "" : masked ? "·" : t.gameWins}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2 text-[9px] text-rw-muted pt-0.5">
        {match.teams.length === 2 && match.teams.every((t) => t.code && t.code !== "TBD") ? (
          <button
            type="button"
            onClick={() =>
              navigateHub({
                kind: "finder",
                query: `team=${encodeURIComponent(teamSlug(match.teams[0].name, match.teams[0].code))}&vs=${encodeURIComponent(teamSlug(match.teams[1].name, match.teams[1].code))}${year ? `&year=${year}` : ""}`,
              })
            }
            className="hover:text-rw-accent hover:underline"
          >
            {match.state === "inProgress" ? <span className="text-rw-red">{tl("Live")}</span> : match.state === "completed" ? (masked ? tl("Final · hidden") : tl("Final")) : tl("Upcoming")}
          </button>
        ) : (
          <span>
            {match.state === "inProgress" ? <span className="text-rw-red">{tl("Live")}</span> : match.state === "completed" ? (masked ? tl("Final · hidden") : tl("Final")) : tl("Upcoming")}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          {match.teams.length === 2 && match.teams.every((t) => t.code && t.code !== "TBD") && (
            <>
              <button
                type="button"
                onClick={() =>
                  navigateHub({
                    kind: "prep",
                    a: teamSlug(match.teams[0].name, match.teams[0].code),
                    b: teamSlug(match.teams[1].name, match.teams[1].code),
                    period: year ? `y${year}` : undefined,
                  })
                }
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Match prep")}
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() =>
                  navigateHub({
                    kind: "draft",
                    query: `teams=${encodeURIComponent(teamSlug(match.teams[0].name, match.teams[0].code))},${encodeURIComponent(teamSlug(match.teams[1].name, match.teams[1].code))}${year ? `&p=y${year}` : ""}`,
                  })
                }
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")}
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() =>
                  navigateHub({
                    kind: "compare",
                    mode: "team",
                    a: teamSlug(match.teams[0].name, match.teams[0].code),
                    b: teamSlug(match.teams[1].name, match.teams[1].code),
                    period: year ? `y${year}` : undefined,
                  })
                }
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Compare")}
              </button>
            </>
          )}
          {!masked && match.state !== "unstarted" && match.teams.length === 2 && (match.teams[0].gameWins + match.teams[1].gameWins) > 0 && (
            <span className="w-10 h-1 rounded-full bg-rw-border/70 overflow-hidden inline-flex gap-[1px] shrink-0" aria-hidden="true">
              <span
                className="h-full bg-rw-teal/80"
                style={{ width: `${Math.round((match.teams[0].gameWins / (match.teams[0].gameWins + match.teams[1].gameWins)) * 100)}%` }}
              />
              <span className="h-full flex-1 bg-rw-rose/70" />
            </span>
          )}
        </span>
      </div>
    </div>
  );
};
