/**
 * Game finder: every game of a league's year (hub/champgames/<league>/<year>.json), narrowed by tournament, patch,
 * team, opponent, side, result, champions (with / against / banned), player and game length. Conditions are about
 * one side of the game ("T1 on red with Azir against Orianna, and lost"); a game matches when either side does.
 * Filters live in the address: /stats/finder?league=lck&year=2026&team=T1&champ=Azir
 */
import React, { useMemo, useRef, useState } from "react";
import { tl, tn, tc, fmtDec, roleName } from "../../i18n";
import { champName } from "../../champions";
import { bare, loadAliases, loadChampGames, loadChampIndex, prettySlug, resolveChampSlug, resolveEventSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, sameChamp } from "../../hub/data";
import type { ChampGame, ChampGamesFile, ChampPick } from "../../hub/types";
import { hubShareUrl, navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { matchedEventLabel, matchEventIndices, normalizeRole, patchCompare, ROLES } from "../../hub/champAgg";
import { TableExport } from "./SortTable";
import {
  card,
  ChampIcon,
  fmtDate,
  fmtNum,
  HubLink,
  isFresh,
  Loading,
  Failed,
  RevealButton,
  td,
  TeamLink,
  TeamLogo,
  th,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";
import { STable } from "../STable";
import { csvSafe } from "../../helpers";
import { SectionCard } from "./BroadcastCard";

const sel =
  "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text max-w-[12rem]";
const num =
  "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text w-16";
type Q = URLSearchParams;
type SetQ = (p: Record<string, string | undefined>) => void;

/** The side of `g` that meets every condition (0 blue, 1 red), or -1. */
/** A side's team as one key across renames: its page, else its name. */
const teamKey = (g: ChampGame, s: number) => (s === 0 ? g[12] || g[10] : g[13] || g[11]) || "";

/** "26.18" -> 26018, so patches sort as patches (26.9 before 26.18). */
const patchSort = (p: string) => {
  const [a, b] = p.split(".").map(Number);
  return (a || 0) * 1000 + (b || 0);
};

const eqSlug = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && (a === b || bare(a) === bare(b));
const eqTeam = (a: string | null | undefined, b: string | null | undefined) =>
  eqSlug(a, b) || (!!a && !!b && eqSlug(resolveTeamAlias(a), resolveTeamAlias(b)));
const eqChamp = (a: string | null | undefined, b: string | null | undefined) =>
  eqSlug(a, b) || (!!a && !!b && (sameChamp(a, b) || eqSlug(resolveChampSlug(a), resolveChampSlug(b))));
const eqPlayer = (a: string | null | undefined, b: string | null | undefined) =>
  eqSlug(a, b) || (!!a && !!b && eqSlug(resolvePlayerSlug(a), resolvePlayerSlug(b)));

export function matchSide(g: ChampGame, q: Q, eventIdx: number | Set<number> | null): number {
  if (eventIdx != null && (typeof eventIdx === "number" ? g[2] !== eventIdx : !eventIdx.has(g[2]))) return -1;
  const patch = q.get("patch");
  if (patch && g[1] !== patch) return -1;
  const minLen = Number(q.get("min") || 0);
  const maxLen = Number(q.get("max") || 0);
  if (minLen && (g[4] == null || g[4] < minLen)) return -1;
  if (maxLen && (g[4] == null || g[4] > maxLen)) return -1;
  const ban = q.get("ban");
  if (ban && !g[7].some((c) => eqChamp(c, ban)) && !g[8].some((c) => eqChamp(c, ban))) return -1;
  const team = q.get("team");
  const vs = q.get("vs") || q.get("vsteam");
  const rawSide = (q.get("side") || "").toLowerCase();
  const side = rawSide === "blue" ? "b" : rawSide === "red" ? "r" : rawSide;
  const rawResult = (q.get("result") || "").toLowerCase();
  const result = rawResult === "win" ? "w" : rawResult === "loss" ? "l" : rawResult;
  const champs = (q.get("champ") || "").split(",").filter(Boolean);
  const vsChamp = q.get("vschamp");
  const player = q.get("player");
  const vsPlayer = q.get("vsplayer");
  const roleQ = normalizeRole(q.get("role"));
  const roleIdx = roleQ ? ROLES.indexOf(roleQ) : -1;
  // "won" / "lost" only means something for a side picked by another filter
  const sided = !!(team || vs || side || champs.length || vsChamp || player || vsPlayer || roleIdx >= 0);
  for (const s of [0, 1]) {
    const mine = s === 0 ? g[5] : g[6];
    const theirs = s === 0 ? g[6] : g[5];
    const myTeam = teamKey(g, s);
    const theirTeam = teamKey(g, 1 - s);
    const won = s === 0 ? g[3] === 1 : g[3] === 0;
    // a team filter is the team's page (one entry across a rename), or a name from an older link
    if (team && !eqTeam(myTeam, team) && !eqTeam(s === 0 ? g[10] : g[11], team)) continue;
    if (vs && !eqTeam(theirTeam, vs) && !eqTeam(s === 0 ? g[11] : g[10], vs)) continue;
    if (side && side !== (s === 0 ? "b" : "r")) continue;
    if (result && sided && (result === "w") !== won) continue;
    if (champs.length) {
      if (roleIdx >= 0) {
        if (!mine.some((p) => eqChamp(p[0], champs[0]) && p[1] === roleIdx)) continue;
        if (champs.slice(1).some((c) => !mine.some((p) => eqChamp(p[0], c)))) continue;
      } else if (champs.some((c) => !mine.some((p) => eqChamp(p[0], c)))) continue;
    }
    if (vsChamp) {
      if (roleIdx >= 0 && champs.length > 0) {
        if (!theirs.some((p) => eqChamp(p[0], vsChamp) && (p[1] < 0 || p[1] === roleIdx))) continue;
      } else if (!theirs.some((p) => eqChamp(p[0], vsChamp))) continue;
    }
    if (player && !mine.some((p) => (eqPlayer(p[9], player) || eqPlayer(p[8], player)) && (roleIdx < 0 || p[1] === roleIdx)))
      continue;
    if (vsPlayer && !theirs.some((p) => (eqPlayer(p[9], vsPlayer) || eqPlayer(p[8], vsPlayer)) && (roleIdx < 0 || p[1] === roleIdx)))
      continue;
    if (roleIdx >= 0 && !champs.length && !player && !vsPlayer && !mine.some((p) => p[1] === roleIdx))
      continue;
    return s;
  }
  return -1;
}

export const FinderPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Game finder"));
  useDDragon();
  const q = useMemo(() => {
    const p = new URLSearchParams(query || "");
    const teamsParam = p.get("teams");
    if (teamsParam) {
      const [a, b] = teamsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (a && !p.get("team")) p.set("team", a);
      if (b && !p.get("vs") && !p.get("vsteam")) p.set("vs", b);
      p.delete("teams");
    }
    const vsTeam = p.get("vsteam");
    if (vsTeam && !p.get("vs")) {
      p.set("vs", vsTeam);
      p.delete("vsteam");
    }
    const playersParam = p.get("players");
    if (playersParam) {
      const [pa, pb] = playersParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (pa && !p.get("player")) p.set("player", pa);
      if (pb && !p.get("vsplayer")) p.set("vsplayer", pb);
      p.delete("players");
    }
    const resParam = (p.get("result") || "").toLowerCase();
    if (resParam === "win") p.set("result", "w");
    else if (resParam === "loss") p.set("result", "l");
    return p;
  }, [query]);
  const setQ: SetQ = (patch) => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    navigateHub({ kind: "finder", query: next.toString() }, { replace: true });
  };
  const index = useLoad(loadChampIndex, []);
  const leagues = index.data || [];
  const aliases = useLoad(loadAliases, []);
  const evSlug = q.get("event") || "";
  const evPrefix = evSlug.replace(/-20\d{2}.*$/, "");
  const inferredLeague =
    !q.get("league") && evPrefix && evPrefix !== evSlug
      ? aliases.data?.league[evPrefix.toLowerCase()] || resolveLeagueSlug(evPrefix)
      : "";
  const asked = q.get("league") || (inferredLeague && leagues.some((l) => l.u === inferredLeague) ? inferredLeague : "");
  const league = asked ? aliases.data?.league[asked.toLowerCase()] || resolveLeagueSlug(asked) : leagues.length ? "top" : "";
  const years = useMemo(
    () =>
      (league === "top"
        ? Array.from(new Set(leagues.filter((l) => l.pr).flatMap((l) => Object.keys(l.y))))
        : Object.keys(leagues.find((l) => l.u === league)?.y || {})
      )
        .sort()
        .reverse(),
    [leagues, league],
  );
  const evYr = /(?:^|-)(20\d{2})(?:-|$)/.exec(evSlug)?.[1] || "";
  const patchYr = q.get("patch")
    ? (() => {
        const m = Number(q.get("patch")!.split(".")[0]);
        return m >= 25 ? String(2000 + m) : m >= 1 ? String(2010 + m) : "";
      })()
    : "";
  const askedYear = q.get("year") || evYr || patchYr;
  const year =
    askedYear && years.includes(askedYear)
      ? askedYear
      : years[0] || "";
  const file = useLoad<ChampGamesFile>(
    () => {
      if (!league || !year) return Promise.resolve({ events: [], games: [] });
      if (league !== "top") return loadChampGames(league, year);
      const topLeagues = leagues.filter((l) => l.pr && l.y[year]);
      if (!topLeagues.length) return Promise.resolve({ events: [], games: [] });
      return Promise.all(topLeagues.map((l) => loadChampGames(l.u, year))).then((files) => {
        const events: [string, string][] = [];
        const games: ChampGame[] = [];
        for (const f of files) {
          const offset = events.length;
          events.push(...f.events);
          for (const g of f.games) {
            const copy = [...g] as ChampGame;
            copy[2] = g[2] + offset;
            games.push(copy);
          }
        }
        games.sort((a, b) => (b[0] < a[0] ? -1 : b[0] > a[0] ? 1 : 0));
        return { events, games };
      });
    },
    [league, year, leagues.length],
  );

  if (index.error) return <Failed />;
  if (!index.data) return <Loading />;
  const main = leagues.filter((l) => l.pr);
  const other = leagues.filter(
    (l) => !l.pr && Object.values(l.y).reduce((s, n) => s + n, 0) >= 100,
  );
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-2 text-xs`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-base font-bold text-rw-text">
            {tl("Game finder")}
          </h1>
          <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
            {(() => {
              const qEvent = q.get("event") || "";
              const qPatch = q.get("patch") || "";
              const qRole = normalizeRole(q.get("role"));
              const qChamp = (q.get("champ") || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || "";
              const qVsChamp = (q.get("vschamp") || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || "";
              const qTeam = resolveTeamAlias(q.get("team") || "", aliases.data?.team);
              const qVs = resolveTeamAlias(q.get("vs") || "", aliases.data?.team);
              const qPlayer = resolvePlayerSlug(prettySlug(q.get("player") || ""));
              const qVsPlayer = resolvePlayerSlug(prettySlug(q.get("vsplayer") || ""));
              return (
                <>
                  {qTeam && (
                    <>
                      <HubLink
                        to={{
                          kind: "prep",
                          a: qTeam,
                          ...(qVs ? { b: qVs } : {}),
                          ...(qEvent ? { period: `e:${qEvent}` } : year ? { period: `y${year}` } : {}),
                        }}
                        className="text-rw-accent hover:underline font-semibold"
                      >
                        {tl("Match prep")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "compare",
                          mode: "team",
                          a: qTeam,
                          ...(qVs ? { b: qVs } : {}),
                          ...(qEvent ? { period: `e:${qEvent}` } : year ? { period: `y${year}` } : {}),
                        }}
                        className="text-rw-accent hover:underline font-semibold"
                      >
                        {tl("Compare")} →
                      </HubLink>
                    </>
                  )}
                  {!qTeam && qPlayer && (
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "player",
                        a: qPlayer,
                        ...(qVsPlayer ? { b: qVsPlayer } : {}),
                        ...(qEvent ? { period: `e:${qEvent}` } : year ? { period: `y${year}` } : {}),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Compare")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "champions",
                      query: new URLSearchParams({
                        ...(league && league !== "top"
                          ? {
                              league,
                              ...(year ? { year } : {}),
                              ...(qEvent ? { event: qEvent } : {}),
                              ...(qPatch ? { patch: qPatch } : {}),
                            }
                          : {
                              ...(qPatch ? { key: `p${qPatch}` } : year ? { key: `y${year}` } : {}),
                            }),
                        ...(qRole ? { role: qRole } : {}),
                        ...(qChamp ? { q: [qChamp, qVsChamp].filter(Boolean).join(",") } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Champions")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(league && league !== "top" ? { scope: league } : {}),
                        ...(qPatch ? { key: `p${qPatch}` } : year ? { key: `y${year}` } : {}),
                        ...(qEvent ? { event: qEvent } : {}),
                        ...(qRole ? { role: qRole } : {}),
                        ...(qChamp ? { q: [qChamp, qVsChamp].filter(Boolean).join(",") } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        ...(qChamp ? { champ: resolveChampSlug(qChamp) } : {}),
                        ...(qChamp && qVsChamp ? { vs: resolveChampSlug(qVsChamp) } : {}),
                        ...(qRole ? { role: qRole } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Counter-pick finder")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        ...(qTeam ? { teams: `${qTeam}${qVs ? `,${qVs}` : ""}` } : {}),
                        ...(qEvent ? { p: `e:${qEvent}` } : qPatch ? { p: `p:${qPatch}` } : year ? { p: `y${year}` } : {}),
                        ...(qChamp ? { champ: qChamp } : {}),
                        ...(qRole ? { role: qRole } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "items",
                      query: new URLSearchParams({
                        ...(qPlayer ? { player: qPlayer } : {}),
                        ...(qChamp ? { champ: resolveChampSlug(qChamp) } : {}),
                        ...(year ? { year } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(league && league !== "top" ? { league } : {}),
                        ...(year ? { year } : {}),
                        ...(qEvent ? { event: qEvent } : {}),
                        ...(qRole ? { role: qRole } : {}),
                        ...(qChamp ? { champ: qChamp } : {}),
                        ...(qPlayer || qTeam ? { q: [qPlayer, qVsPlayer, qTeam, qVs].filter(Boolean).slice(0, 2).join(",") } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      query: new URLSearchParams({
                        ...(league && league !== "top" ? { league } : {}),
                        ...(qTeam ? { q: [qTeam, qVs].filter(Boolean).join(",") } : {}),
                      }).toString() || undefined,
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                </>
              );
            })()}
          </span>
        </div>
        <p className="text-rw-sub">
          {tl(
            'Find games by team, champion, player, side, result, patch and length. Conditions are about one team in the game: "T1 on red with Azir, against Orianna, lost".',
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={league}
            onChange={(e) =>
              setQ({
                league: e.target.value,
                year: undefined,
                event: undefined,
                patch: undefined,
              })
            }
            aria-label={tl("League")}
            className={sel}
          >
            <option value="top">{tl("Top leagues")}</option>
            <optgroup label={tl("Leagues")}>
              {main.map((l) => (
                <option key={l.u} value={l.u}>
                  {l.l}
                </option>
              ))}
            </optgroup>
            {other.length > 0 && (
              <optgroup label={tl("Other leagues")}>
                {other.map((l) => (
                  <option key={l.u} value={l.u}>
                    {l.l}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select
            value={year}
            onChange={(e) =>
              setQ({ year: e.target.value, event: undefined, patch: undefined })
            }
            aria-label={tl("Year")}
            className={sel}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {q.toString().replace(/(^|&)(league|year)=[^&]*/g, "") !== "" && (
            <button
              type="button"
              onClick={() =>
                navigateHub(
                  {
                    kind: "finder",
                    query: new URLSearchParams({ league, year }).toString(),
                  },
                  { replace: true },
                )
              }
              className="text-rw-accent hover:underline"
            >
              {tl("Clear filters")}
            </button>
          )}
        </div>
      </div>
      {file.error ? (
        <Failed />
      ) : !file.data ? (
        <Loading />
      ) : (
        <FinderBody
          games={file.data.games}
          events={file.data.events}
          q={q}
          setQ={setQ}
          year={year}
          name={`riftwise-games-${league}-${year}`}
        />
      )}
    </div>
  );
};

/** The dropdown entry for a team filter: its page, or (older links) its name. */
const teamOption = (teams: [string, string][], v: string | null) =>
  !v ? "" : (teams.find(([k, n]) => eqTeam(k, v) || eqTeam(n, v))?.[0] ?? v);
const teamLabel = (teams: [string, string][], v: string | null) =>
  !v ? "" : (teams.find(([k, n]) => eqTeam(k, v) || eqTeam(n, v))?.[1] ?? v);
const champOption = (champs: string[], v: string | null) =>
  !v ? "" : (champs.find((c) => eqChamp(c, v)) ?? v);
const playerOption = (players: [string, string][], v: string | null) =>
  !v ? "" : (players.find(([k, n]) => eqPlayer(k, v) || eqPlayer(n, v))?.[0] ?? v);
const playerLabel = (players: [string, string][], v: string | null) =>
  !v ? "" : (players.find(([k, n]) => eqPlayer(k, v) || eqPlayer(n, v))?.[1] ?? v);

const FinderBody: React.FC<{
  games: ChampGame[];
  events: [string, string][];
  q: Q;
  setQ: SetQ;
  year: string;
  name: string;
}> = ({ games, events, q, setQ, year, name }) => {
  const opts = useMemo(() => {
    const teams = new Map<string, string>(); // team page (or name) -> its newest name in this file
    const champs = new Set<string>();
    const players = new Map<string, string>(); // slug or name -> name
    const patches = new Set<string>();
    for (const g of games) {
      for (const s of [0, 1]) {
        const name = s === 0 ? g[10] : g[11];
        if (name) teams.set(teamKey(g, s), name); // games are oldest first, so the newest name stays
      }
      if (g[1]) patches.add(g[1]);
      for (const p of [...g[5], ...g[6]]) {
        champs.add(p[0]);
        if (p[8]) players.set(p[9] || p[8], p[8]);
      }
      for (const c of [...g[7], ...g[8]]) champs.add(c);
    }
    const byName = (a: string, b: string) => a.localeCompare(b);
    return {
      teams: [...teams.entries()].sort((a, b) => byName(a[1], b[1])),
      champs: [...champs].sort((a, b) =>
        champName(a).localeCompare(champName(b)),
      ),
      players: [...players.entries()].sort((a, b) => byName(a[1], b[1])),
      patches: [...patches].sort(patchCompare),
    };
  }, [games]);
  const eventSlug = q.get("event");
  const canonEventSlug = eventSlug ? resolveEventSlug(eventSlug) : "";
  const eventMatch = useMemo(
    () => matchEventIndices(events, eventSlug, canonEventSlug),
    [events, eventSlug, canonEventSlug],
  );
  const activeEventValue =
    typeof eventMatch === "number" ? events[eventMatch]?.[0] || "" : eventMatch ? canonEventSlug || eventSlug || "" : "";
  const parentEventLabel =
    eventMatch instanceof Set ? matchedEventLabel(events, eventMatch, canonEventSlug || eventSlug) : null;
  const found = useMemo(() => {
    const out: { g: ChampGame; s: number }[] = [];
    for (const g of games) {
      const s = matchSide(g, q, eventMatch);
      if (s >= 0) out.push({ g, s });
    }
    return out.sort((a, b) => (a.g[0] < b.g[0] ? 1 : a.g[0] > b.g[0] ? -1 : 0));
  }, [games, q, eventMatch]);
  const [limit, setLimit] = useState(100);
  const tableRef = useRef<HTMLTableElement>(null);
  const won = found.filter(({ g, s }) =>
    s === 0 ? g[3] === 1 : g[3] === 0,
  ).length;
  const mins = found.map(({ g }) => g[4]).filter((m): m is number => m != null);
  const avg = mins.length
    ? mins.reduce((a, b) => a + b, 0) / mins.length
    : null;
  const newest = found[0]?.g[0];
  const [hidden, reveal] = useHidden(
    `finder:${q.toString()}`,
    newest && isFresh(newest) ? newest : undefined,
  );
  const sideCond = !!(
    q.get("team") ||
    q.get("vs") ||
    q.get("vsteam") ||
    q.get("side") ||
    q.get("result") ||
    q.get("champ") ||
    q.get("vschamp") ||
    q.get("player") ||
    q.get("vsplayer") ||
    q.get("role")
  );

  const champSel = (
    label: string,
    list: string[],
    value: string,
    onChange: (v: string) => void,
    selectedPrefix?: string,
  ) => (
    <select
      value={champOption(list, value)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={sel}
    >
      <option value="">{label}</option>
      {list.map((c) => (
        <option key={c} value={c}>
          {selectedPrefix ? `${selectedPrefix}: ${champName(c)}` : champName(c)}
        </option>
      ))}
    </select>
  );
  const champs = (q.get("champ") || "").split(",").filter(Boolean);
  const setChamp = (i: number, v: string) => {
    const next = [...champs];
    if (v) next[i] = v;
    else next.splice(i, 1);
    setQ({ champ: next.filter(Boolean).join(",") || undefined });
  };

  return (
    <>
      <div className={`${card} space-y-2 text-xs`}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeEventValue}
            onChange={(e) => setQ({ event: e.target.value || undefined })}
            aria-label={tl("Tournaments")}
            className={sel}
          >
            <option value="">{tl("All tournaments")}</option>
            {parentEventLabel && activeEventValue && (
              <option value={activeEventValue}>{parentEventLabel}</option>
            )}
            {events.map(([slug, n]) => (
              <option key={slug} value={slug}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={q.get("patch") || ""}
            onChange={(e) => setQ({ patch: e.target.value || undefined })}
            aria-label={tl("Patches")}
            className={sel}
          >
            <option value="">{tl("All patches")}</option>
            {opts.patches.map((p) => (
              <option key={p} value={p}>
                {tl("Patch {patch}", { patch: p })}
              </option>
            ))}
          </select>
          {champSel(tl("Banned: any"), opts.champs, q.get("ban") || "", (v) =>
            setQ({ ban: v || undefined }),
          )}
          <span className="flex items-center gap-1 text-rw-sub">
            {tl("Length (min)")}
            <input
              type="number"
              min={0}
              value={q.get("min") || ""}
              onChange={(e) => setQ({ min: e.target.value || undefined })}
              placeholder={tl("from")}
              aria-label={tl("Shortest game (minutes)")}
              className={num}
            />
            <input
              type="number"
              min={0}
              value={q.get("max") || ""}
              onChange={(e) => setQ({ max: e.target.value || undefined })}
              placeholder={tl("to")}
              aria-label={tl("Longest game (minutes)")}
              className={num}
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rw-border">
          <span className="text-[10px] uppercase tracking-wider font-bold text-rw-accent">
            {tl("One team in the game")}
          </span>
          <select
            value={teamOption(opts.teams, q.get("team"))}
            onChange={(e) => setQ({ team: e.target.value || undefined })}
            aria-label={tl("Team")}
            className={sel}
          >
            <option value="">{tl("Team: any")}</option>
            {opts.teams.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
          {(q.get("team") || q.get("vs") || q.get("vsteam")) && (
            <button
              type="button"
              onClick={() =>
                setQ({
                  team: q.get("vs") || q.get("vsteam") || undefined,
                  vs: q.get("team") || undefined,
                  vsteam: undefined,
                })
              }
              className="px-1.5 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/60 font-semibold"
              title="⇄"
            >
              ⇄
            </button>
          )}
          <select
            value={teamOption(opts.teams, q.get("vs") || q.get("vsteam"))}
            onChange={(e) => setQ({ vs: e.target.value || undefined, vsteam: undefined })}
            aria-label={tl("Opponent")}
            className={sel}
          >
            <option value="">{tl("Against: anyone")}</option>
            {opts.teams.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={q.get("side") === "blue" ? "b" : q.get("side") === "red" ? "r" : q.get("side") || ""}
            onChange={(e) => setQ({ side: e.target.value || undefined })}
            aria-label={tl("Side")}
            className={sel}
          >
            <option value="">{tl("Both sides")}</option>
            <option value="b">{tl("Blue side")}</option>
            <option value="r">{tl("Red side")}</option>
          </select>
          <select
            value={q.get("result") || ""}
            onChange={(e) => setQ({ result: e.target.value || undefined })}
            aria-label={tl("Result")}
            className={sel}
          >
            <option value="">{tl("Won or lost")}</option>
            <option value="w">{tl("Won")}</option>
            <option value="l">{tl("Lost")}</option>
          </select>
          <select
            value={playerOption(opts.players, q.get("player"))}
            onChange={(e) => setQ({ player: e.target.value || undefined })}
            aria-label={tl("Player")}
            className={sel}
          >
            <option value="">{tl("Player: any")}</option>
            {opts.players.map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
          {(q.get("player") || q.get("vsplayer")) && (
            <>
              <button
                type="button"
                onClick={() =>
                  setQ({
                    player: q.get("vsplayer") || undefined,
                    vsplayer: q.get("player") || undefined,
                  })
                }
                className="px-1.5 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/60 font-semibold"
                title="⇄"
              >
                ⇄
              </button>
              <select
                value={playerOption(opts.players, q.get("vsplayer"))}
                onChange={(e) => setQ({ vsplayer: e.target.value || undefined })}
                aria-label={tl("Opponent")}
                className={sel}
              >
                <option value="">{tl("Against: anyone")}</option>
                {opts.players.map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
            </>
          )}
          <select
            value={normalizeRole(q.get("role"))}
            onChange={(e) => setQ({ role: e.target.value || undefined })}
            aria-label={tl("Role")}
            className={sel}
          >
            <option value="">{tl("All roles")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleName(r)}
              </option>
            ))}
          </select>
          {champSel(
            tl("With champion"),
            opts.champs,
            champs[0] || "",
            (v) => setChamp(0, v),
            tl("With champion"),
          )}
          {champs.length > 0 &&
            champSel(
              `+ ${tl("and champion")}`,
              opts.champs,
              champs[1] || "",
              (v) => setChamp(1, v),
              `+ ${tl("and champion")}`,
            )}
          {champs.length === 1 && q.get("vschamp") && (
            <button
              type="button"
              onClick={() =>
                setQ({
                  champ: q.get("vschamp") || undefined,
                  vschamp: champs[0] || undefined,
                })
              }
              className="px-1.5 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/60 font-semibold"
              title="⇄"
            >
              ⇄
            </button>
          )}
          {champSel(
            tl("Against champion"),
            opts.champs,
            q.get("vschamp") || "",
            (v) => setQ({ vschamp: v || undefined }),
            tl("Against champion"),
          )}
        </div>
      </div>

      <div className={`${card} space-y-2`}>
        <p className="text-xs text-rw-text">
          {tn("{n} game", "{n} games", found.length, {
            n: fmtNum(found.length),
          })}
          {found.length > 0 && sideCond && !hidden && (
            <span className="text-rw-sub inline-flex items-center gap-1.5">
              <span>
                {" · "}
                <button
                  type="button"
                  onClick={() => setQ({ result: q.get("result") === "w" ? "l" : q.get("result") === "l" ? undefined : "w" })}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("won {w}, lost {l} ({pct})", {
                    w: won,
                    l: found.length - won,
                    pct: `${Math.round((won / found.length) * 100)}%`,
                  })}
                </button>
              </span>
              <span className="inline-flex w-10 h-1.5 rounded-full bg-rw-raised overflow-hidden shrink-0" aria-hidden="true">
                <span className="h-full bg-rw-teal/85" style={{ width: `${Math.round((won / found.length) * 100)}%` }} />
                <span className="h-full bg-rw-red/75" style={{ width: `${100 - Math.round((won / found.length) * 100)}%` }} />
              </span>
            </span>
          )}
          {avg != null && (
            <span className="text-rw-sub">
              {" "}
              ·{" "}
              <HubLink
                to={{ kind: "records", ...(year ? { query: `year=${encodeURIComponent(year)}` } : {}) }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Records")}
              >
                {tl("average {n} min", { n: fmtDec(avg) })}
              </HubLink>
            </span>
          )}
        </p>
        {hidden ? (
          <div className="py-2 text-center">
            <RevealButton onReveal={reveal} />
          </div>
        ) : found.length > 0 ? (
          <>
            <Cohort
              found={found}
              sideCond={sideCond}
              champ={champs[0] || ""}
              player={q.get("player") || ""}
              league={q.get("league") || ""}
              year={year || ""}
              event={q.get("event") || ""}
              patch={q.get("patch") || ""}
              role={q.get("role") || ""}
              onPick={(c) => setChamp(0, champs[0] === c ? "" : c)}
              onBan={(c) => setQ({ ban: q.get("ban") === c ? undefined : c })}
              onSide={(s) => setQ({ side: q.get("side") === s ? undefined : s })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <TableExport tableRef={tableRef} name={name} />
              <button
                type="button"
                onClick={() => downloadCohort(found, events, name)}
                className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                title={tl("Every game found, not just the ones shown, with picks and bans")}
              >
                {tl("CSV of all {n} games", { n: fmtNum(found.length) })}
              </button>
              <SectionCard
                section={tl("Game finder")}
                name={[
                  teamLabel(opts.teams, q.get("team")),
                  (q.get("vs") || q.get("vsteam")) && `vs ${teamLabel(opts.teams, q.get("vs") || q.get("vsteam"))}`,
                  q.get("champ") && champName(champOption(opts.champs, q.get("champ")!)),
                  q.get("role") && roleName(q.get("role")!),
                  playerLabel(opts.players, q.get("player")),
                  q.get("vsplayer") && `vs ${playerLabel(opts.players, q.get("vsplayer"))}`,
                  q.get("patch") && `Patch ${q.get("patch")}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || name}
                sub={
                  sideCond
                    ? `${won}-${found.length - won} (${Math.round((won / found.length) * 100)}%)`
                    : tn("{n} game", "{n} games", found.length)
                }
                rows={() =>
                  found.slice(0, 12).map(({ g, s }, idx) => {
                    const bWon = g[3] === 1;
                    const winSide = sideCond ? (s === 0 ? bWon : !bWon) : undefined;
                    const focusTeam = sideCond ? (s === 0 ? g[10] : g[11]) : bWon ? g[10] : g[11];
                    const focusPicks = sideCond ? (s === 0 ? g[5] : g[6]) : bWon ? g[5] : g[6];
                    return {
                      rank: idx + 1,
                      champ: (champs[0] && champOption(opts.champs, champs[0])) || focusPicks[0]?.[0] || undefined,
                      team: focusTeam || undefined,
                      label: `${g[10] || tl("Blue")} vs ${g[11] || tl("Red")}${g[15] ? ` (${tc("short game", "G{n}", { n: g[15] })})` : ""}`,
                      sub: [events[g[2]]?.[1], g[1] && `P${g[1]}`, fmtDate(g[0])].filter(Boolean).join(" · "),
                      value: g[4] != null ? `${fmtDec(g[4])}m` : bWon ? g[10] || tl("Blue") : g[11] || tl("Red"),
                      win: winSide,
                    };
                  })
                }
              />
              <CopyFinderPost
                found={found}
                events={events}
                q={q}
                opts={opts}
                sideCond={sideCond}
                won={won}
                avg={avg}
              />
              {!q.get("team") && !q.get("vs") && found[0]?.g[10] && found[0]?.g[11] && (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: found[0].g[12] || resolveTeamAlias(found[0].g[10]!) || prettySlug(found[0].g[10]!),
                      b: found[0].g[13] || resolveTeamAlias(found[0].g[11]!) || prettySlug(found[0].g[11]!),
                      period: year ? `y${year}` : undefined,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `teams=${encodeURIComponent(found[0].g[12] || resolveTeamAlias(found[0].g[10]!) || prettySlug(found[0].g[10]!))},${encodeURIComponent(found[0].g[13] || resolveTeamAlias(found[0].g[11]!) || prettySlug(found[0].g[11]!))}${year ? `&p=y${encodeURIComponent(year)}` : ""}`,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: found[0].g[12] || resolveTeamAlias(found[0].g[10]!) || prettySlug(found[0].g[10]!),
                      b: found[0].g[13] || resolveTeamAlias(found[0].g[11]!) || prettySlug(found[0].g[11]!),
                      period: year ? `y${year}` : undefined,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      ...(q.get("league") && q.get("league") !== "top" ? { query: `league=${encodeURIComponent(q.get("league")!)}` } : {}),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(q.get("league") && q.get("league") !== "top" ? { scope: q.get("league")! } : {}),
                        ...(q.get("patch") ? { key: `p${q.get("patch")}` } : year ? { key: `y${year}` } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(q.get("league") && q.get("league") !== "top" ? { league: q.get("league")! } : {}),
                        ...(year ? { year } : {}),
                        ...(q.get("event") ? { event: q.get("event")! } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                        ...(champs[0] ? { champ: champs[0] } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                </>
              )}
              {q.get("team") && q.get("vs") && (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: teamOption(opts.teams, q.get("team")) || q.get("team")!,
                      b: teamOption(opts.teams, q.get("vs")) || q.get("vs")!,
                      period: q.get("event") ? `e:${q.get("event")}` : year ? `y${year}` : undefined,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: teamOption(opts.teams, q.get("team")) || q.get("team")!,
                      b: teamOption(opts.teams, q.get("vs")) || q.get("vs")!,
                      period: q.get("event") ? `e:${q.get("event")}` : year ? `y${year}` : undefined,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `teams=${encodeURIComponent(teamOption(opts.teams, q.get("team")) || q.get("team")!)},${encodeURIComponent(teamOption(opts.teams, q.get("vs")) || q.get("vs")!)}${q.get("event") ? `&p=e:${encodeURIComponent(q.get("event")!)}` : q.get("patch") ? `&p=p:${encodeURIComponent(q.get("patch")!)}` : year ? `&p=y${encodeURIComponent(year)}` : ""}`,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      ...(q.get("league") && q.get("league") !== "top" ? { query: `league=${encodeURIComponent(q.get("league")!)}` } : {}),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(q.get("league") && q.get("league") !== "top" ? { scope: q.get("league")! } : {}),
                        ...(q.get("patch") ? { key: `p${q.get("patch")}` } : year ? { key: `y${year}` } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(q.get("league") && q.get("league") !== "top" ? { league: q.get("league")! } : {}),
                        ...(year ? { year } : {}),
                        ...(q.get("event") ? { event: q.get("event")! } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                        ...(champs[0] ? { champ: champs[0] } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                </>
              )}
              {q.get("team") && !q.get("vs") && (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: teamOption(opts.teams, q.get("team")) || q.get("team")!,
                      period: q.get("event") ? `e:${q.get("event")}` : year ? `y${year}` : undefined,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `teams=${encodeURIComponent(teamOption(opts.teams, q.get("team")) || q.get("team")!)}${q.get("event") ? `&p=e:${encodeURIComponent(q.get("event")!)}` : q.get("patch") ? `&p=p:${encodeURIComponent(q.get("patch")!)}` : year ? `&p=y${encodeURIComponent(year)}` : ""}`,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: teamOption(opts.teams, q.get("team")) || q.get("team")!,
                      period: q.get("event") ? `e:${q.get("event")}` : year ? `y${year}` : undefined,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      ...(q.get("league") && q.get("league") !== "top" ? { query: `league=${encodeURIComponent(q.get("league")!)}` } : {}),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(q.get("league") && q.get("league") !== "top" ? { scope: q.get("league")! } : {}),
                        ...(q.get("patch") ? { key: `p${q.get("patch")}` } : year ? { key: `y${year}` } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(q.get("league") && q.get("league") !== "top" ? { league: q.get("league")! } : {}),
                        ...(year ? { year } : {}),
                        ...(q.get("event") ? { event: q.get("event")! } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                        ...(champs[0] ? { champ: champs[0] } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                </>
              )}
              {champs[0] && (
                <>
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        champ: prettySlug(champs[0]),
                        ...(q.get("vschamp") ? { vs: q.get("vschamp")! } : champs[1] ? { vs: champs[1] } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Counter-pick finder")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(q.get("league") && q.get("league") !== "top" ? { scope: q.get("league")! } : {}),
                        ...(q.get("patch") ? { key: `p${q.get("patch")}` } : year ? { key: `y${year}` } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  {!q.get("player") && (
                    <HubLink
                      to={{
                        kind: "items",
                        query: new URLSearchParams({
                          champ: prettySlug(champs[0]),
                          ...(year ? { year } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                    >
                      {tl("Item history")} →
                    </HubLink>
                  )}
                </>
              )}
              {q.get("player") && (
                <>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "player",
                      a: playerOption(opts.players, q.get("player")) || q.get("player")!,
                      ...(q.get("vsplayer") ? { b: playerOption(opts.players, q.get("vsplayer")) || q.get("vsplayer")! } : {}),
                      period: q.get("event") ? `e:${q.get("event")}` : year ? `y${year}` : undefined,
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "items",
                      query: new URLSearchParams({
                        player: playerOption(opts.players, q.get("player")) || q.get("player")!,
                        ...(champs[0] ? { champ: prettySlug(champs[0]) } : {}),
                        ...(year ? { year } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(q.get("league") && q.get("league") !== "top" ? { league: q.get("league")! } : {}),
                        ...(year ? { year } : {}),
                        ...(q.get("event") ? { event: q.get("event")! } : {}),
                        ...(q.get("role") ? { role: q.get("role")! } : {}),
                        ...(champs[0] ? { champ: champs[0] } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  {!champs[0] && (
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          ...(q.get("league") && q.get("league") !== "top" ? { scope: q.get("league")! } : {}),
                          ...(q.get("patch") ? { key: `p${q.get("patch")}` } : year ? { key: `y${year}` } : {}),
                          ...(q.get("role") ? { role: q.get("role")! } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                  )}
                </>
              )}
            </div>
            <div className="overflow-x-auto">
              <STable ref={tableRef} className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={th}>{tl("Date")}</th>
                    <th className={th}>{tl("Tournament")}</th>
                    <th className={th}>{tl("Blue")}</th>
                    <th className={th}>{tl("Red")}</th>
                    <th className={th}>{tl("Winner")}</th>
                    <th className={th}>{tl("Patch")}</th>
                    <th className={th}>{tl("Min")}</th>
                    <th className={th}>{tl("Blue picks")}</th>
                    <th className={th}>{tl("Red picks")}</th>
                  </tr>
                </thead>
                <tbody>
                  {found.slice(0, limit).map(({ g, s }, i) => (
                    <tr
                      key={`${g[0]}-${g[14] || i}-${g[15] || 0}-${i}`}
                      className="border-t border-rw-border"
                    >
                      <td className={`${td} text-rw-sub`} data-sort={g[0]}>
                        {g[14] ? (
                          <HubLink
                            to={{ kind: "match", slug: g[14], game: g[15] || undefined }}
                            className="hover:text-rw-accent hover:underline"
                          >
                            {fmtDate(g[0])}
                            {g[15] ? ` · ${tc("short game", "G{n}", { n: g[15] })}` : ""}
                          </HubLink>
                        ) : (
                          fmtDate(g[0])
                        )}
                      </td>
                      <td
                        className={`${td} text-rw-muted max-w-[12rem] truncate`}
                        data-sort={events[g[2]]?.[1] || ""}
                      >
                        {events[g[2]]?.[0] ? (
                          <HubLink
                            to={{ kind: "event", slug: events[g[2]][0] }}
                            className="hover:text-rw-accent hover:underline"
                          >
                            {events[g[2]][1]}
                          </HubLink>
                        ) : (
                          events[g[2]]?.[1] || ""
                        )}
                      </td>
                      <TeamCell
                        name={g[10]}
                        u={g[12]}
                        focus={sideCond && s === 0}
                        won={g[3] === 1}
                      />
                      <TeamCell
                        name={g[11]}
                        u={g[13]}
                        focus={sideCond && s === 1}
                        won={g[3] === 0}
                      />
                      <td className={`${td} font-semibold text-rw-text`} data-sort={(g[3] === 1 ? g[10] : g[11]) || ""}>
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          {(g[3] === 1 ? g[10] : g[11]) && (
                            <HubLink
                              to={{ kind: "team", slug: (g[3] === 1 ? g[12] : g[13]) || resolveTeamAlias((g[3] === 1 ? g[10] : g[11])!) || prettySlug((g[3] === 1 ? g[10] : g[11])!) }}
                              className="shrink-0"
                            >
                              <TeamLogo name={(g[3] === 1 ? g[10] : g[11])!} size={14} />
                            </HubLink>
                          )}
                          {(g[3] === 1 ? g[10] : g[11]) ? (
                            <TeamLink name={(g[3] === 1 ? g[10] : g[11])!} u={g[3] === 1 ? g[12] : g[13]} />
                          ) : g[3] === 1 ? (
                            <span>{tl("Blue")}</span>
                          ) : (
                            <span>{tl("Red")}</span>
                          )}
                        </span>
                      </td>
                      <td className={`${td} text-rw-sub`} data-sort={patchSort(g[1])}>
                        {g[1] ? (
                          <button
                            type="button"
                            onClick={() => setQ({ patch: q.get("patch") === g[1] ? undefined : g[1] })}
                            className="text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {g[1]}
                          </button>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={`${td} text-rw-sub tabular-nums`} data-sort={g[4] ?? -1}>
                        {g[4] != null ? (
                          g[14] ? (
                            <HubLink
                              to={{ kind: "match", slug: g[14], game: g[15] || undefined }}
                              className="hover:text-rw-accent hover:underline"
                            >
                              {fmtDec(g[4])}
                            </HubLink>
                          ) : (
                            fmtDec(g[4])
                          )
                        ) : (
                          ""
                        )}
                      </td>
                      <Picks list={g[5]} />
                      <Picks list={g[6]} />
                    </tr>
                  ))}
                </tbody>
              </STable>
            </div>
            {found.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + 200)}
                className="text-xs text-rw-accent hover:underline"
              >
                {tl("Show more ({n} left)", { n: found.length - limit })}
              </button>
            )}
            <p className="text-[10px] text-rw-muted">
              {tl(
                "Copy and CSV take the games shown; show more first to include them all.",
              )}{" "}
              {tl("\"CSV of all\" takes every game found.")}
            </p>
          </>
        ) : (
          <p className="text-xs text-rw-sub">
            {tl("No games match. Try fewer filters.")}
          </p>
        )}
      </div>
    </>
  );
};

type Found = { g: ChampGame; s: number }[];

const tally = (m: Map<string, [number, number]>, n: number) =>
  [...m.entries()].sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).slice(0, n);

/**
 * What the games found add up to: blue side's record, kills per game, and the most picked and banned champions.
 * With a condition on one side ("T1", "on red", "with Azir"), picks and bans are that side's and the win rate is theirs.
 */
const Cohort: React.FC<{
  found: Found;
  sideCond: boolean;
  champ: string;
  player: string;
  league?: string;
  year?: string;
  event?: string;
  patch?: string;
  role?: string;
  onPick?: (c: string) => void;
  onBan?: (c: string) => void;
  onSide?: (s: "b" | "r") => void;
}> = ({ found, sideCond, champ, player, league, year, event, patch, role, onPick, onBan, onSide }) => {
  const scopeLg = league && league !== "top" ? league : "";
  const d = useMemo(() => {
    let blueW = 0, kills = 0, kg = 0, kMin = 0, gd = 0, gdn = 0;
    const picks = new Map<string, [number, number]>();
    const bans = new Map<string, [number, number]>();
    for (const { g, s } of found) {
      blueW += g[3];
      ([
        [g[5], g[7], g[3]],
        [g[6], g[8], g[3] ? 0 : 1],
      ] as [ChampPick[], string[], number][]).forEach(([pk, bn, won], i) => {
        if (sideCond && i !== s) return;
        for (const p of pk) {
          const x = picks.get(p[0]) || [0, 0];
          x[0]++;
          x[1] += won;
          picks.set(p[0], x);
        }
        for (const b of bn || []) {
          const x = bans.get(b) || [0, 0];
          x[0]++;
          x[1] += won;
          bans.set(b, x);
        }
      });
      const all = [...g[5], ...g[6]];
      if (all.length === 10 && all.every((p) => p[2] != null)) {
        const k = all.reduce((t, p) => t + (p[2] || 0), 0);
        kills += k;
        kg++;
        if (g[4]) kMin += g[4];
      }
      // the side the filters are about: its champion's / player's lead in lane at 15, else the team's (the five add up)
      if (sideCond) {
        const mine = s === 0 ? g[5] : g[6];
        const one = champ ? mine.find((p) => eqSlug(p[0], champ)) : player ? mine.find((p) => eqSlug(p[9], player) || eqSlug(p[8], player)) : null;
        if (one) {
          if (one[10] != null) {
            gd += one[10];
            gdn++;
          }
        } else if (mine.length === 5 && mine.every((p) => p[10] != null)) {
          gd += mine.reduce((t, p) => t + (p[10] || 0), 0);
          gdn++;
        }
      }
    }
    return {
      blueW,
      kpg: kg ? kills / kg : null,
      ckpm: kMin ? kills / kMin : null,
      gd15: gdn ? Math.round(gd / gdn) : null,
      gdn,
      picks: tally(picks, 10),
      bans: tally(bans, 8),
    };
  }, [found, sideCond, champ, player]);
  const n = found.length;
  const list = (title: string, rows: [string, [number, number]][], wr: boolean) => {
    if (!rows.length) return null;
    const maxG = Math.max(1, ...rows.map(([, [g]]) => g));
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-rw-muted mb-1">
          <span>{title}</span>
          <span className="flex items-center gap-2 shrink-0">
            {rows.length >= 1 && (
              <>
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${prettySlug(rows[0][0])}${rows[1] ? `&vs=${encodeURIComponent(rows[1][0])}` : ""}${role ? `&role=${encodeURIComponent(role)}` : ""}`,
                  }}
                  className="text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: `champ=${prettySlug(rows[0][0])}${year ? `&year=${encodeURIComponent(year)}` : ""}`,
                  }}
                  className="text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query: new URLSearchParams({
                      ...(scopeLg ? { scope: scopeLg } : {}),
                      ...(patch ? { key: `p${patch}` } : year ? { key: `y${year}` } : {}),
                      ...(event ? { event } : {}),
                      ...(role ? { role } : {}),
                      q: rows.slice(0, 2).map((r) => r[0]).join(","),
                    }).toString(),
                  }}
                  className="text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(scopeLg ? { league: scopeLg } : {}),
                      ...(year ? { year } : {}),
                      ...(event ? { event } : {}),
                      ...(role ? { role } : {}),
                      champ: rows[0][0],
                    }).toString(),
                  }}
                  className="text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                      champ: rows[0][0],
                      ...(role ? { role } : {}),
                    }).toString(),
                  }}
                  className="text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    ...(scopeLg ? { query: `league=${encodeURIComponent(scopeLg)}` } : {}),
                  }}
                  className="text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
              </>
            )}
          </span>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
          {rows.map(([c, [g, w]]) => {
            const pctVal = wr ? Math.round((w / g) * 100) : Math.round((g / n) * 100);
            const good = wr && g > 0 && w / g >= 0.5;
            return (
              <li key={c} className="flex items-center justify-between gap-1.5 min-w-0">
                <HubLink to={{ kind: "champ", slug: prettySlug(c) }} className="flex items-center gap-1 min-w-0 hover:text-rw-accent">
                  <ChampIcon name={c} size={16} />
                  <span className="truncate text-rw-text hover:text-rw-accent">{champName(c)}</span>
                </HubLink>
                <span className="inline-flex items-center gap-1.5 text-rw-sub tabular-nums shrink-0">
                  <span className="w-7 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden lg:inline-block shrink-0">
                    <span
                      className={`block h-full rounded-full ${wr ? "bg-rw-teal/75" : "bg-rw-accent/65"}`}
                      style={{ width: `${Math.max(8, Math.round((g / maxG) * 100))}%` }}
                    />
                  </span>
                  {(wr ? onPick : onBan) ? (
                    <button
                      type="button"
                      onClick={() => (wr ? onPick?.(c) : onBan?.(c))}
                      className="hover:text-rw-accent hover:underline"
                      title={wr ? tl("With champion") : tl("Bans")}
                    >
                      {g}
                    </button>
                  ) : (
                    <span>{g}</span>
                  )}
                  <span className="text-rw-muted">·</span>
                  {(wr ? onPick : onBan) ? (
                    <button
                      type="button"
                      onClick={() => (wr ? onPick?.(c) : onBan?.(c))}
                      className={`w-8 text-right hover:underline ${wr ? (good ? "text-rw-teal font-semibold" : "text-rw-red") : "hover:text-rw-accent"}`}
                      title={wr ? tl("With champion") : tl("Bans")}
                    >
                      {pctVal}%
                    </button>
                  ) : (
                    <span className={`w-8 text-right ${wr ? (good ? "text-rw-teal font-semibold" : "text-rw-red") : ""}`}>{pctVal}%</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  const bluePct = Math.round((d.blueW / Math.max(1, n)) * 100);
  return (
    <div className="space-y-2 pb-2 border-b border-rw-border text-xs">
      <div className="space-y-1">
        <p className="text-rw-sub">
          {onSide ? (
            <button type="button" onClick={() => onSide("b")} className="hover:text-rw-accent hover:underline">
              {tl("Blue side won {p}", { p: `${bluePct}%` })}
            </button>
          ) : (
            tl("Blue side won {p}", { p: `${bluePct}%` })
          )}
          {d.kpg != null && (
            <>
              {" · "}
              <HubLink
                to={{ kind: "records", ...(year ? { query: `year=${encodeURIComponent(year)}` } : {}) }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Records")}
              >
                {tl("{n} kills per game", { n: fmtDec(d.kpg) })}
              </HubLink>
            </>
          )}
          {d.ckpm != null && (
            <>
              {" · "}
              <HubLink
                to={{ kind: "records", ...(year ? { query: `year=${encodeURIComponent(year)}` } : {}) }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Records")}
              >
                {tl("{n} kills per minute", { n: fmtDec(d.ckpm, 2) })}
              </HubLink>
            </>
          )}
          {d.gd15 != null && (
            <span title={tl("{n} games with timelines (Oracle's Elixir)", { n: d.gdn })}>
              {" · "}
              {champ || player
                ? tl("their lane at 15: {gd} gold", { gd: `${d.gd15 > 0 ? "+" : ""}${fmtNum(d.gd15)}` })
                : tl("their gold lead at 15: {gd}", { gd: `${d.gd15 > 0 ? "+" : ""}${fmtNum(d.gd15)}` })}
            </span>
          )}
        </p>
        {n > 0 && (
          <div className="h-1.5 max-w-xs rounded-full bg-rw-bg overflow-hidden flex gap-[2px]" title={`${tl("Blue")}: ${bluePct}% · ${tl("Red")}: ${100 - bluePct}%`}>
            <div className="h-full bg-[#4a9eff]/85" style={{ width: `${bluePct}%` }} />
            <div className="h-full flex-1 bg-rw-red/80" />
          </div>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {list(sideCond ? tl("Their most picked (games · win %)") : tl("Most picked (games · win %)"), d.picks, true)}
        {list(sideCond ? tl("Their most banned (games · share)") : tl("Most banned (games · share)"), d.bans, false)}
      </div>
    </div>
  );
};

/** Every game found as a CSV file (the table only holds the ones shown). */
function downloadCohort(found: Found, events: [string, string][], name: string) {
  const esc = (v: string | number | null | undefined) => {
    const t = v == null ? "" : csvSafe(String(v));
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const champs = (pk: ChampPick[]) => pk.map((p) => p[0]).join(" / ");
  const players = (pk: ChampPick[]) => pk.map((p) => p[8] || "").join(" / ");
  const head = ["date", "tournament", "game", "patch", "blue", "red", "winner", "minutes", "blue picks", "red picks",
    "blue players", "red players", "blue bans", "red bans", "url"];
  const lines = found.map(({ g }) =>
    [
      g[0], events[g[2]]?.[1] || "", g[15] || "", g[1], g[10] || "", g[11] || "", (g[3] === 1 ? g[10] : g[11]) || (g[3] === 1 ? "Blue" : "Red"),
      g[4] != null ? g[4].toFixed(1) : "", champs(g[5]), champs(g[6]), players(g[5]), players(g[6]), (g[7] || []).join(" / "),
      (g[8] || []).join(" / "), g[14] ? hubShareUrl({ kind: "match", slug: g[14], game: g[15] || undefined }) : "",
    ].map(esc).join(","),
  );
  const csv = "\ufeff" + [head.join(","), ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-all.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TeamCell: React.FC<{
  name?: string;
  u?: string | null;
  focus: boolean;
  won: boolean;
}> = ({ name, u, focus, won }) => (
  <td
    className={`${td} ${won ? "text-rw-text font-semibold" : "text-rw-sub"} ${focus ? "underline decoration-rw-accent decoration-2 underline-offset-4" : ""}`}
    data-sort={name || ""}
  >
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {name && (
        <HubLink to={{ kind: "team", slug: u || resolveTeamAlias(name) || prettySlug(name) }} className="shrink-0">
          <TeamLogo name={name} size={14} />
        </HubLink>
      )}
      {u ? (
        <HubLink to={{ kind: "team", slug: u }} className="hover:text-rw-accent">
          {name}
        </HubLink>
      ) : name ? (
        <TeamLink name={name} />
      ) : (
        "–"
      )}
    </span>
  </td>
);

const Picks: React.FC<{ list: ChampPick[] }> = ({ list }) => (
  <td className={td}>
    <span className="flex gap-0.5">
      {list.map((p, i) => (
        <HubLink
          key={`${p[0]}-${i}`}
          to={
            p[9]
              ? { kind: "player", slug: p[9], tab: "champions", query: `champ=${encodeURIComponent(p[0])}` }
              : { kind: "champ", slug: prettySlug(p[0]) }
          }
          title={p[8] ? `${p[8]}: ${champName(p[0])}` : champName(p[0])}
          className="hover:opacity-80"
        >
          <ChampIcon name={p[0]} size={20} />
        </HubLink>
      ))}
    </span>
  </td>
);

const CopyFinderPost: React.FC<{
  found: Found;
  events: [string, string][];
  q: Q;
  opts: { teams: [string, string][]; champs: string[]; players: [string, string][] };
  sideCond: boolean;
  won: number;
  avg: number | null;
}> = ({ found, events, q, opts, sideCond, won, avg }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const parts = [
      teamLabel(opts.teams, q.get("team")),
      (q.get("vs") || q.get("vsteam")) && `vs ${teamLabel(opts.teams, q.get("vs") || q.get("vsteam"))}`,
      q.get("champ") && champName(champOption(opts.champs, q.get("champ")!)),
      q.get("role") && roleName(q.get("role")!),
      q.get("vschamp") && `vs ${champName(champOption(opts.champs, q.get("vschamp")!))}`,
      playerLabel(opts.players, q.get("player")),
      q.get("vsplayer") && `vs ${playerLabel(opts.players, q.get("vsplayer"))}`,
      q.get("patch") && `Patch ${q.get("patch")}`,
    ].filter(Boolean);
    const lines: string[] = [
      `${tl("Game finder")}${parts.length ? ` · ${parts.join(" · ")}` : ""}`,
      [
        tn("{n} game", "{n} games", found.length),
        sideCond ? `${won}–${found.length - won} (${Math.round((won / found.length) * 100)}%)` : null,
        avg != null ? `${fmtDec(avg)}m` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    ];
    for (const { g } of found.slice(0, 5)) {
      const winner = (g[3] === 1 ? g[10] : g[11]) || (g[3] === 1 ? tl("Blue") : tl("Red"));
      lines.push(
        `• ${g[10] || tl("Blue")} vs ${g[11] || tl("Red")} → ${winner}${events[g[2]]?.[1] ? ` (${events[g[2]][1]})` : ""}`,
      );
    }
    const qs = q.toString();
    lines.push(hubShareUrl({ kind: "finder", query: qs || undefined }));
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
      className="text-[11px] px-2 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
