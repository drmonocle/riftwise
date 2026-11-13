/**
 * A league page's season at a glance (hub/leagueyear/<league>/<year>.json): the teams by record, the standout
 * players on the main stats (the top three of each, among players with 30% of the most games), and links to the
 * full leaderboard, the season's champion picks and the tier list.
 */
import React, { useEffect, useState } from "react";
import { tl, roleName } from "../../i18n";
import { bare, loadLeagueSeason, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
import { normalizeRole } from "../../hub/champAgg";
import type { EventPlayer } from "../../hub/types";
import { currentHubRoute, hubShareUrl } from "../../hub/route";
import { HubLink, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo, useLoad } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { PLAYER_METRICS } from "./Ranks";

const STANDOUT = ["kda", "dpm", "g15", "csm", "vsm", "kp"];

export const LeagueSeasonPanel: React.FC<{ league: string; year: string; name: string }> = ({ league, year, name }) => {
  const state = useLoad(() => loadLeagueSeason(league, year), [league, year]);
  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;
  const [search, setSearch] = useState(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("q") || p.get("team") || p.get("player") || p.get("role") || p.get("champ") || p.get("vs") || "";
  });
  useEffect(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    const next = p.get("q") || p.get("team") || p.get("player") || p.get("role") || p.get("champ") || p.get("vs") || "";
    if (next) setSearch(next);
  }, [routeQuery]);
  const s = state.data;
  if (!s || (!s.players.length && !s.teamStats.length)) return null;
  const maxG = Math.max(1, ...s.players.map((p) => p.g));
  const minG = Math.max(3, Math.ceil(maxG * 0.3));
  const terms = search
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((x) => normText(x.trim()))
    .filter(Boolean);
  const tSlug = (t: string, u?: string | null) => u || resolveTeamAlias(t) || prettySlug(t);
  const pSlug = (n: string, u?: string | null) => u || resolvePlayerSlug(n) || prettySlug(n);
  const allRegular = s.players.filter((p) => p.g >= minG);
  const matchPlayer = (p: EventPlayer) => {
    const hay = normText(`${p.n} ${p.u || ""} ${p.t} ${p.tu || ""} ${p.r || ""} ${p.r ? roleName(p.r) : ""}`);
    const hayBare = bare(hay);
    const canonTeam = resolveTeamAlias(p.tu || p.t || "");
    return terms.some((term) => {
      const canonRole = normalizeRole(term);
      const ta = searchAlias(term);
      return (
        hay.includes(term) ||
        (term.length >= 2 && hayBare.includes(bare(term))) ||
        (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false) ||
        (p.u ? resolvePlayerSlug(term) === p.u : false) ||
        (canonTeam ? resolveTeamAlias(term) === canonTeam : false) ||
        (canonRole && p.r ? p.r === canonRole : false) ||
        (p.c || []).some((c) => matchesChampSearch(c, term))
      );
    });
  };
  const matchedRegular = terms.length ? allRegular.filter(matchPlayer) : allRegular;
  const matchedAnyPlayer = terms.length && matchedRegular.length === 0 ? s.players.filter(matchPlayer) : matchedRegular;
  const regular = matchedAnyPlayer.length > 0 ? matchedAnyPlayer : allRegular;
  const matchedTeamSlugs = new Set(
    matchedAnyPlayer.map((p) => resolveTeamAlias(p.tu || p.t || "")).filter(Boolean),
  );
  const allTeams = [...s.teamStats].sort((a, b) => b.w / Math.max(1, b.g) - a.w / Math.max(1, a.g) || b.g - a.g);
  const matchedTeams = terms.length
    ? allTeams.filter((t) => {
        const hay = normText(`${t.t} ${t.u || ""}`);
        const hayBare = bare(hay);
        const canonTeam = resolveTeamAlias(t.u || t.t);
        if (canonTeam && matchedTeamSlugs.has(canonTeam)) return true;
        return terms.some((term) => {
          const ta = searchAlias(term);
          return (
            hay.includes(term) ||
            (term.length >= 2 && hayBare.includes(bare(term))) ||
            (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false) ||
            (canonTeam ? resolveTeamAlias(term) === canonTeam : false)
          );
        });
      })
    : allTeams;
  const teams = matchedTeams.length > 0 ? matchedTeams : allTeams;
  const headerTeams = teams.length >= 1 ? teams : allTeams;
  const topTeams = Array.from(
    new Set([...teams, ...allTeams].map((t) => tSlug(t.t, t.u)).filter(Boolean)),
  ).slice(0, 2);
  const topPlayers = Array.from(
    new Set([...regular, ...allRegular].map((p) => pSlug(p.n, p.u)).filter(Boolean)),
  ).slice(0, 2);
  const lgSlug = resolveLeagueSlug(league);
  const qRole =
    terms.map((term) => normalizeRole(term) || (searchAlias(term) ? normalizeRole(searchAlias(term)) : null)).find(Boolean) ||
    (terms.length > 0 && regular.length === 1 && regular[0].r ? normalizeRole(regular[0].r) || regular[0].r : "");
  const qChampRaw =
    terms.map((term) => allRegular.flatMap((p) => p.c || []).find((c) => matchesChampSearch(c, term))).find(Boolean) ||
    (terms.length > 0 && regular.length === 1 && regular[0].c?.[0] ? regular[0].c[0] : "");
  const qChamp = qChampRaw ? resolveChampSlug(qChampRaw) : "";
  const topChampsList = Array.from(
    new Set(
      [qChamp, ...[...regular, ...allRegular].flatMap((p) => p.c || []).map((c) => resolveChampSlug(c))].filter(Boolean),
    ),
  ).slice(0, 2);
  const seasonChamps = topChampsList.join(",");
  return (
    <Section
      title={tl("{name} {year} at a glance", { name, year })}
      right={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          {(allTeams.length > 6 || allRegular.length > 10 || Boolean(search.trim())) && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              data-nocapture="1"
              className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] font-normal text-rw-text w-36"
            />
          )}
          {topChampsList[0] && (
            <HubLink
              to={{
                kind: "counters",
                query: new URLSearchParams({
                  champ: topChampsList[0],
                  ...(topChampsList[1] ? { vs: topChampsList[1] } : {}),
                  ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                  ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vsteam: topTeams[1] } : {}) } : {}),
                  ...(qRole ? { role: qRole } : {}),
                  league: lgSlug,
                  patch: `y${year}`,
                  year,
                }).toString(),
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Counters")}
            </HubLink>
          )}
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                league: lgSlug,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                ...(topPlayers.length || topTeams.length
                  ? { q: [...topPlayers, ...topTeams].join(",") }
                  : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Full leaderboard")}
          </HubLink>
          <HubLink
            to={{
              kind: "champions",
              query: new URLSearchParams({
                scope: lgSlug,
                league: lgSlug,
                key: `y${year}`,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                ...(seasonChamps ? { q: seasonChamps } : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Champion picks")}
          </HubLink>
          <HubLink
            to={{
              kind: "tiers",
              query: new URLSearchParams({
                scope: lgSlug,
                league: lgSlug,
                key: `y${year}`,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                ...(seasonChamps ? { q: seasonChamps } : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Tier list")}
          </HubLink>
          <HubLink
            to={{
              kind: "rankings",
              query: new URLSearchParams({
                league: lgSlug,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                ...(topTeams.length >= 1 ? { q: topTeams.join(",") } : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Power rankings")}
          </HubLink>
          <HubLink
            to={{
              kind: "best",
              query: new URLSearchParams({
                league: lgSlug,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                ...(topTeams.length >= 1 ? { q: topTeams.join(",") } : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Best games")}
          </HubLink>
          <HubLink
            to={{
              kind: "items",
              query: new URLSearchParams({
                league: lgSlug,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(topChampsList[0] ? { champ: topChampsList[0] } : {}),
                ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}),
                ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                ...(topTeams[0] ? { team: topTeams[0] } : {}),
                ...(topTeams[1] ? { vs: topTeams[1] } : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Item history")}
          </HubLink>
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                league: lgSlug,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(topChampsList[0] ? { champ: topChampsList[0] } : {}),
                ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}),
                ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                ...(topTeams[0] ? { team: topTeams[0] } : {}),
                ...(topTeams[1] ? { vs: topTeams[1] } : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Game finder")}
          </HubLink>
          {topTeams.length >= 1 && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: topTeams[0],
                  ...(topTeams[1] ? { b: topTeams[1] } : {}),
                  period: `y${year}`,
                  query: new URLSearchParams({
                    league: lgSlug,
                    year,
                    ...(qRole ? { role: qRole } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                    ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Match prep")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    teams: topTeams.join(","),
                    p: `y${year}`,
                    league: lgSlug,
                    year,
                    ...(qRole ? { role: qRole } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                    ...(seasonChamps ? { champ: seasonChamps } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: topTeams[0],
                  ...(topTeams[1] ? { b: topTeams[1] } : {}),
                  period: `y${year}`,
                  query: new URLSearchParams({
                    league: lgSlug,
                    year,
                    ...(qRole ? { role: qRole } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                    ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Compare")}
              </HubLink>
            </>
          )}
          {teams.length > 0 && (
            <>
              <CopyLeagueGlancePost
                title={tl("{name} {year} at a glance", { name, year })}
                league={league}
                year={year}
                teams={teams}
              />
              <SectionCard
                section={tl("{name} {year} at a glance", { name, year })}
                sub={tl("Teams by record")}
                name={`${league}-${year}-glance`}
                rows={() =>
                  teams.slice(0, 10).map((t, idx) => ({
                    rank: idx + 1,
                    team: t.t,
                    label: t.t,
                    sub: `${t.w}-${t.g - t.w}`,
                    value: `${Math.round((t.w / Math.max(1, t.g)) * 100)}%`,
                    win: t.g > 0 ? t.w / t.g >= 0.5 : undefined,
                  }))
                }
              />
            </>
          )}
        </span>
      }
      share={`riftwise-${league}-${year}-glance`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        {teams.length > 0 && (
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Teams by record")}</div>
            <ol className="text-xs space-y-1">
              {teams.slice(0, 12).map((t, i) => {
                const wrPct = Math.round((t.w / Math.max(1, t.g)) * 100);
                const myTeamU = tSlug(t.t, t.u);
                const rivalRow = teams[i === 0 ? 1 : 0] || allTeams.find((x) => tSlug(x.t, x.u) !== myTeamU);
                const vsTeamU = rivalRow ? tSlug(rivalRow.t, rivalRow.u) : "";
                const myP = [...regular, ...allRegular].find((p) => tSlug(p.t, p.tu) === myTeamU);
                const vsP = vsTeamU ? [...regular, ...allRegular].find((p) => tSlug(p.t, p.tu) === vsTeamU) : undefined;
                const myPU = myP ? pSlug(myP.n, myP.u) : "";
                const vsPU = vsP ? pSlug(vsP.n, vsP.u) : "";
                const myChamp = myP?.c?.[0] ? resolveChampSlug(myP.c[0]) : topChampsList[0];
                const vsChamp =
                  (vsP?.c?.[0] ? resolveChampSlug(vsP.c[0]) : undefined) ||
                  topChampsList.find((c) => c !== myChamp);
                const teamQ = new URLSearchParams({
                  p: `y${year}`,
                  league: lgSlug,
                  year,
                  ...(vsTeamU && vsTeamU !== myTeamU ? { vs: vsTeamU } : {}),
                  ...(myPU ? { player: myPU } : {}),
                  ...(vsPU && vsPU !== myPU ? { vsplayer: vsPU } : {}),
                  ...(myChamp ? { champ: myChamp } : {}),
                  ...(vsChamp && vsChamp !== myChamp ? { vschamp: vsChamp } : {}),
                  ...([vsTeamU && vsTeamU !== myTeamU ? vsTeamU : "", myPU].some(Boolean)
                    ? { q: [vsTeamU && vsTeamU !== myTeamU ? vsTeamU : "", myPU].filter(Boolean).join(",") }
                    : {}),
                }).toString();
                return (
                  <li key={t.u || t.t} className="flex items-center justify-between gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                      <span className="text-rw-muted tabular-nums w-4 inline-block shrink-0">{i + 1}</span>
                      <HubLink
                        to={{ kind: "team", slug: myTeamU, query: teamQ }}
                        className="shrink-0 hover:opacity-80"
                        title={t.t}
                      >
                        <TeamLogo name={t.t} size={15} />
                      </HubLink>
                      <TeamLink name={t.t} u={t.u} query={teamQ} className="text-rw-text hover:text-rw-accent truncate" />
                    </span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-rw-sub shrink-0">
                      <span>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: new URLSearchParams({
                              league: lgSlug,
                              year,
                              team: myTeamU,
                              ...(vsTeamU && vsTeamU !== myTeamU ? { vs: vsTeamU } : {}),
                              ...(myPU ? { player: myPU } : {}),
                              ...(vsPU && vsPU !== myPU ? { vsplayer: vsPU } : {}),
                              ...(myChamp ? { champ: myChamp } : {}),
                              ...(vsChamp && vsChamp !== myChamp ? { vschamp: vsChamp } : {}),
                            }).toString(),
                          }}
                          className="hover:text-rw-accent hover:underline"
                        >
                          {t.w}-{t.g - t.w}
                        </HubLink>{" "}
                        <HubLink
                          to={{ kind: "team", slug: myTeamU, tab: "stats", query: teamQ }}
                          className={`hover:underline ${wrPct >= 55 ? "text-rw-teal font-semibold" : wrPct <= 45 ? "text-rw-red" : "text-rw-muted"}`}
                        >
                          ({wrPct}%)
                        </HubLink>
                      </span>
                      <span className="w-9 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                        <span
                          className={`block h-full rounded-full ${wrPct >= 55 ? "bg-rw-teal/80" : wrPct <= 45 ? "bg-rw-red/75" : "bg-rw-sub/60"}`}
                          style={{ width: `${Math.max(6, wrPct)}%` }}
                        />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="text-[10px] text-rw-muted mt-1">{tl("Games won and lost over the whole season (all splits and playoffs).")}</p>
          </div>
        )}
        {regular.length > 0 && (
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[10px] font-semibold text-rw-muted">{tl("Standout players")}</div>
              <span className="flex items-center gap-2" data-nocapture="1">
                {regular.length >= 1 &&
                  (() => {
                    const spChampsList = Array.from(
                      new Set(
                        [...regular, ...allRegular]
                          .flatMap((p) => p.c || [])
                          .map((c) => resolveChampSlug(c))
                          .filter(Boolean),
                      ),
                    ).slice(0, 2);
                    const spChamps = spChampsList.join(",");
                    const spTeam0 =
                      (regular[0].tu || regular[0].t ? tSlug(regular[0].t, regular[0].tu) : "") || topTeams[0] || "";
                    const spTeam1 =
                      (regular[1] && (regular[1].tu || regular[1].t) && tSlug(regular[1].t, regular[1].tu) !== spTeam0
                        ? tSlug(regular[1].t, regular[1].tu)
                        : "") || topTeams.find((u) => u && u !== spTeam0) || "";
                    const spP0 = pSlug(regular[0].n, regular[0].u);
                    const spP1 =
                      (regular[1] && pSlug(regular[1].n, regular[1].u) !== spP0 ? pSlug(regular[1].n, regular[1].u) : "") ||
                      topPlayers.find((u) => u && u !== spP0) ||
                      "";
                    return (
                      <>
                        {spChampsList[0] && (
                          <HubLink
                            to={{
                              kind: "counters",
                              query: new URLSearchParams({
                                champ: spChampsList[0],
                                ...(spChampsList[1] ? { vs: spChampsList[1] } : {}),
                                player: spP0,
                                ...(spP1 ? { vsplayer: spP1 } : {}),
                                ...(spTeam0 ? { team: spTeam0, ...(spTeam1 ? { vsteam: spTeam1 } : {}) } : {}),
                                ...(regular[0].r ? { role: regular[0].r } : {}),
                                league: lgSlug,
                                patch: `y${year}`,
                                year,
                              }).toString(),
                            }}
                            className="text-[11px] font-semibold text-rw-accent hover:underline"
                          >
                            {tl("Counters")} →
                          </HubLink>
                        )}
                        <HubLink
                          to={{
                            kind: "compare",
                            mode: "player",
                            a: spP0,
                            ...(spP1 ? { b: spP1 } : {}),
                            period: `y${year}`,
                            query: new URLSearchParams({
                              league: lgSlug,
                              year,
                              ...(regular[0].r ? { role: regular[0].r } : {}),
                              ...(spTeam0 ? { team: spTeam0, ...(spTeam1 ? { vs: spTeam1 } : {}) } : {}),
                              ...(spChampsList[0] ? { champ: spChampsList[0], ...(spChampsList[1] ? { vschamp: spChampsList[1] } : {}) } : {}),
                            }).toString(),
                          }}
                          className="text-[11px] font-semibold text-rw-accent hover:underline"
                        >
                          {tl("Compare")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "items",
                            query: `player=${encodeURIComponent(spP0)}${spP1 ? `&vsplayer=${encodeURIComponent(spP1)}` : ""}${spTeam0 ? `&team=${encodeURIComponent(spTeam0)}` : ""}${spTeam1 ? `&vs=${encodeURIComponent(spTeam1)}` : ""}&league=${encodeURIComponent(lgSlug)}&year=${encodeURIComponent(year)}${regular[0].r ? `&role=${encodeURIComponent(regular[0].r)}` : ""}${spChampsList[0] ? `&champ=${encodeURIComponent(spChampsList[0])}` : ""}${spChampsList[1] ? `&vschamp=${encodeURIComponent(spChampsList[1])}` : ""}`,
                          }}
                          className="text-[11px] font-semibold text-rw-accent hover:underline"
                        >
                          {tl("Item history")} →
                        </HubLink>
                        {spTeam0 && (
                          <>
                            <HubLink
                              to={{
                                kind: "prep",
                                a: spTeam0,
                                ...(spTeam1 ? { b: spTeam1 } : {}),
                                period: `y${year}`,
                                query: new URLSearchParams({
                                  league: lgSlug,
                                  year,
                                  ...(regular[0].r ? { role: regular[0].r } : {}),
                                  ...(spP0 ? { player: spP0, ...(spP1 ? { vsplayer: spP1 } : {}) } : {}),
                                  ...(spChampsList[0] ? { champ: spChampsList[0], ...(spChampsList[1] ? { vschamp: spChampsList[1] } : {}) } : {}),
                                }).toString(),
                              }}
                              className="text-[11px] font-semibold text-rw-accent hover:underline"
                            >
                              {tl("Match prep")} →
                            </HubLink>
                            <HubLink
                              to={{
                                kind: "draft",
                                query: new URLSearchParams({
                                  teams: `${spTeam0}${spTeam1 ? `,${spTeam1}` : ""}`,
                                  p: `y${year}`,
                                  league: lgSlug,
                                  year,
                                  ...(regular[0].r ? { role: regular[0].r } : {}),
                                  ...(spP0 ? { player: spP0, ...(spP1 ? { vsplayer: spP1 } : {}) } : {}),
                                  ...(spChamps ? { champ: spChamps } : {}),
                                }).toString(),
                              }}
                              className="text-[11px] font-semibold text-rw-accent hover:underline"
                            >
                              {tl("Draft board")} →
                            </HubLink>
                          </>
                        )}
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `league=${encodeURIComponent(lgSlug)}&year=${encodeURIComponent(year)}&player=${encodeURIComponent(spP0)}${spP1 ? `&vsplayer=${encodeURIComponent(spP1)}` : ""}${spTeam0 ? `&team=${encodeURIComponent(spTeam0)}` : ""}${spTeam1 ? `&vs=${encodeURIComponent(spTeam1)}` : ""}${regular[0].r ? `&role=${encodeURIComponent(regular[0].r)}` : ""}${spChampsList[0] ? `&champ=${encodeURIComponent(spChampsList[0])}` : ""}${spChampsList[1] ? `&vschamp=${encodeURIComponent(spChampsList[1])}` : ""}`,
                          }}
                          className="text-[11px] font-semibold text-rw-accent hover:underline"
                        >
                          {tl("Game finder")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "tiers",
                            query: new URLSearchParams({
                              scope: lgSlug,
                              league: lgSlug,
                              key: `y${year}`,
                              year,
                              ...(regular[0].r ? { role: regular[0].r } : {}),
                              ...(spTeam0 ? { team: spTeam0, ...(spTeam1 ? { vs: spTeam1 } : {}) } : {}),
                              ...(spP0 ? { player: spP0, ...(spP1 ? { vsplayer: spP1 } : {}) } : {}),
                              ...(spChampsList[0] ? { champ: spChampsList[0], ...(spChampsList[1] ? { vschamp: spChampsList[1] } : {}) } : {}),
                              ...(spChamps ? { q: spChamps } : {}),
                            }).toString(),
                          }}
                          className="text-[11px] font-semibold text-rw-accent hover:underline"
                        >
                          {tl("Pro tier list")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "leaders",
                            query: new URLSearchParams({
                              league: lgSlug,
                              year,
                              ...(regular[0].r ? { role: regular[0].r } : {}),
                              ...(spTeam0 ? { team: spTeam0, ...(spTeam1 ? { vs: spTeam1 } : {}) } : {}),
                              ...(spP0 ? { player: spP0, ...(spP1 ? { vsplayer: spP1 } : {}) } : {}),
                              ...(spChampsList[0] ? { champ: spChampsList[0], ...(spChampsList[1] ? { vschamp: spChampsList[1] } : {}) } : {}),
                              q: [spP0, spP1, spTeam0, spTeam1].filter(Boolean).join(","),
                            }).toString(),
                          }}
                          className="text-[11px] font-semibold text-rw-accent hover:underline"
                        >
                          {tl("Player leaderboards")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "rankings",
                            query: new URLSearchParams({
                              league: lgSlug,
                              year,
                              ...(regular[0].r ? { role: regular[0].r } : {}),
                              ...(spTeam0
                                ? {
                                    q: `${spTeam0}${spTeam1 ? `,${spTeam1}` : ""}`,
                                    team: spTeam0,
                                    ...(spTeam1 ? { vs: spTeam1 } : {}),
                                  }
                                : {}),
                              ...(spP0 ? { player: spP0, ...(spP1 ? { vsplayer: spP1 } : {}) } : {}),
                              ...(spChampsList[0] ? { champ: spChampsList[0], ...(spChampsList[1] ? { vschamp: spChampsList[1] } : {}) } : {}),
                            }).toString(),
                          }}
                          className="text-[11px] font-semibold text-rw-accent hover:underline"
                        >
                          {tl("Power rankings")} →
                        </HubLink>
                      </>
                    );
                  })()}
                <SectionCard
                  section={tl("Standout players")}
                  name={`${name} ${year}`}
                  sub={tl("{name} {year} at a glance", { name, year })}
                  rows={() =>
                    PLAYER_METRICS.filter((m) => STANDOUT.includes(m.key))
                      .map((m, idx) => {
                        const top = regular
                          .map((p) => ({ p, v: m.value(p) }))
                          .filter((x): x is { p: EventPlayer; v: number } => x.v != null)
                          .sort((a, b) => (m.low ? a.v - b.v : b.v - a.v))[0];
                        if (!top) return null;
                        return {
                          rank: idx + 1,
                          team: top.p.t,
                          label: `${top.p.n} (${top.p.t})`,
                          sub: m.label,
                          value: m.fmt(top.v),
                          win: true,
                        };
                      })
                      .filter((x): x is NonNullable<typeof x> => !!x)
                  }
                />
              </span>
            </div>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              {PLAYER_METRICS.filter((m) => STANDOUT.includes(m.key)).map((m) => {
                const top = regular
                  .map((p) => ({ p, v: m.value(p) }))
                  .filter((x): x is { p: EventPlayer; v: number } => x.v != null)
                  .sort((a, b) => (m.low ? a.v - b.v : b.v - a.v))
                  .slice(0, 3);
                if (!top.length) return null;
                return (
                  <div key={m.key} className="min-w-0">
                    <div className="text-[11px] font-semibold text-rw-accent truncate" title={m.label}>
                      <HubLink
                        to={{
                          kind: "leaders",
                          query: new URLSearchParams({
                            league: lgSlug,
                            year,
                            stat: m.key,
                            ...(qRole ? { role: qRole } : {}),
                            ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                            ...(top[0] ? { player: pSlug(top[0].p.n, top[0].p.u), ...(top[1] ? { vsplayer: pSlug(top[1].p.n, top[1].p.u) } : {}) } : {}),
                            ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                            q: top.map(({ p }) => pSlug(p.n, p.u)).filter(Boolean).slice(0, 2).join(","),
                          }).toString(),
                        }}
                        className="hover:underline"
                      >
                        {m.label}
                      </HubLink>
                    </div>
                    <ol className="text-xs space-y-0.5">
                      {(() => {
                        const maxV = Math.max(0.01, ...top.map((x) => Math.abs(x.v)));
                        return top.map(({ p, v }, idx) => {
                          const barPct = Math.max(12, Math.min(100, Math.round((Math.abs(v) / maxV) * 100)));
                          const myPU = pSlug(p.n, p.u);
                          const myTU = p.t ? tSlug(p.t, p.tu) : "";
                          const myChamp = p.c?.[0] ? resolveChampSlug(p.c[0]) : "";
                          const vsEntry = top[idx === 0 ? 1 : 0]?.p;
                          const vsPU = vsEntry ? pSlug(vsEntry.n, vsEntry.u) : "";
                          const vsTU =
                            vsEntry?.t && tSlug(vsEntry.t, vsEntry.tu) !== myTU
                              ? tSlug(vsEntry.t, vsEntry.tu)
                              : topTeams.find((u) => u && u !== myTU) || "";
                          const vsChamp = vsEntry?.c?.[0] ? resolveChampSlug(vsEntry.c[0]) : "";
                          const pQuery = new URLSearchParams({
                            p: `y${year}`,
                            league: lgSlug,
                            year,
                            ...(myTU ? { team: myTU } : {}),
                            ...(vsTU && vsTU !== myTU ? { vs: vsTU } : {}),
                            ...(vsPU && vsPU !== myPU ? { q: vsPU, vsplayer: vsPU } : {}),
                            ...(myChamp ? { champ: myChamp } : {}),
                            ...(vsChamp && vsChamp !== myChamp ? { vschamp: vsChamp } : {}),
                          }).toString();
                          const tQuery = new URLSearchParams({
                            p: `y${year}`,
                            league: lgSlug,
                            year,
                            ...(myPU ? { player: myPU } : {}),
                            ...(vsPU && vsPU !== myPU ? { vsplayer: vsPU } : {}),
                            ...(vsTU && vsTU !== myTU ? { q: vsTU, vs: vsTU } : {}),
                            ...(myChamp ? { champ: myChamp } : {}),
                            ...(vsChamp && vsChamp !== myChamp ? { vschamp: vsChamp } : {}),
                          }).toString();
                          return (
                            <li key={`${p.u || p.n}-${p.t}`} className="flex items-center justify-between gap-2 min-w-0">
                              <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                                <HubLink
                                  to={{ kind: "player", slug: myPU, query: pQuery }}
                                  className="shrink-0 hover:opacity-80"
                                  title={p.n}
                                >
                                  <PlayerPhoto name={p.n} team={p.t} slug={p.u ?? undefined} size={16} />
                                </HubLink>
                                {p.t && (
                                  <HubLink
                                    to={{ kind: "team", slug: myTU, query: tQuery }}
                                    className="shrink-0 hover:opacity-80"
                                    title={p.t}
                                  >
                                    <TeamLogo name={p.t} size={13} />
                                  </HubLink>
                                )}
                                <PlayerLink name={p.n} u={p.u} query={pQuery} className="text-rw-text hover:text-rw-accent truncate" />{" "}
                                {p.u ? (
                                  <HubLink
                                    to={{ kind: "player", slug: p.u, tab: "stats", query: pQuery }}
                                    className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline shrink-0"
                                  >
                                    {roleName(p.r)}
                                  </HubLink>
                                ) : (
                                  <span className="text-[10px] text-rw-muted shrink-0">{roleName(p.r)}</span>
                                )}
                              </span>
                              <span className="inline-flex items-center gap-1.5 tabular-nums text-rw-sub shrink-0">
                                <HubLink
                                  to={{
                                    kind: "finder",
                                    query: new URLSearchParams({
                                      league: lgSlug,
                                      year,
                                      player: myPU,
                                      ...(vsPU && vsPU !== myPU ? { vsplayer: vsPU } : {}),
                                      ...(myTU ? { team: myTU } : {}),
                                      ...(vsTU && vsTU !== myTU ? { vs: vsTU } : {}),
                                      ...(p.r ? { role: p.r } : {}),
                                      ...(myChamp ? { champ: myChamp } : {}),
                                      ...(vsChamp && vsChamp !== myChamp ? { vschamp: vsChamp } : {}),
                                    }).toString(),
                                  }}
                                  className="hover:text-rw-accent hover:underline"
                                >
                                  {m.fmt(v)}
                                </HubLink>
                                <span className="w-7 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                                  <span className="block h-full rounded-full bg-rw-accent/70" style={{ width: `${barPct}%` }} />
                                </span>
                              </span>
                            </li>
                          );
                        });
                      })()}
                    </ol>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-rw-muted mt-1">
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    league: lgSlug,
                    year,
                    ...(qRole ? { role: qRole } : {}),
                    ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) } : {}),
                    ...(topChampsList[0] ? { champ: topChampsList[0], ...(topChampsList[1] ? { vschamp: topChampsList[1] } : {}) } : {}),
                    ...(topPlayers.length || topTeams.length ? { q: [...topPlayers, ...topTeams].join(",") } : {}),
                  }).toString(),
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {tl("Players with {n}+ games.", { n: minG })}
              </HubLink>
            </p>
          </div>
        )}
      </div>
    </Section>
  );
};

const CopyLeagueGlancePost: React.FC<{
  title: string;
  league: string;
  year: string;
  teams: { t: string; w: number; g: number }[];
}> = ({ title, league, year, teams }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [title];
    for (const [idx, t] of teams.slice(0, 6).entries()) {
      lines.push(`#${idx + 1} ${t.t}: ${t.w}–${t.g - t.w} (${Math.round((t.w / Math.max(1, t.g)) * 100)}%)`);
    }
    lines.push(hubShareUrl({ kind: "league", slug: league, year }));
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        setState("failed");
        setTimeout(() => setState("idle"), 2400);
      });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] font-normal text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
