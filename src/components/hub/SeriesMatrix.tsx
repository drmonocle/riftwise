/**
 * Caster / Analyst Series Views (`gol.gg`-style "ALL STATS" 10-player side-by-side matrix & "SUMMARY" grid).
 * Works cleanly for any Bo1–Bo5 series from `HubSeries`, keeping scroll position when switching games or Series Totals.
 */
import React, { useMemo, useRef, useState } from "react";
import { tl, tk, roleName, fmtDec } from "../../i18n";
import { champName } from "../../champions";
import { normalizeRole } from "../../hub/champAgg";
import { resolveChampSlug, resolvePlayerSlug } from "../../hub/data";
import type { GamePlayer, HubGame, HubSeries } from "../../hub/types";
import { TableExport } from "./SortTable";
import { ChampIcon, HubLink, PlayerPhoto, Section, TeamLogo, fmtNum, card } from "./ui";

const ROLES_ORDER = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;

export interface MatrixPlayer {
  n: string;
  u?: string;
  r: string;
  side: 1 | 2; // 1 = s.a, 2 = s.b
  teamName: string;
  c?: string;
  champs: string[];
  pk?: number;
  g: number;
  w: number;
  k: number;
  d: number;
  a: number;
  tk: number;
  tdth: number;
  cs: number;
  csKnown: boolean;
  gd: number;
  gdKnown: boolean;
  dm: number;
  dmKnown: boolean;
  v: number;
  vKnown: boolean;
  min: number;
  tdm: number;
  tgd: number;
  tv: number;
  g10: number;
  c10: number;
  x10: number;
  n10: number;
  g15: number;
  c15: number;
  x15: number;
  n15: number;
  g20: number;
  c20: number;
  x20: number;
  n20: number;
}

const byRoleSort = (a: { r?: string }, b: { r?: string }) => {
  const ia = ROLES_ORDER.indexOf(normalizeRole(a.r) as (typeof ROLES_ORDER)[number]);
  const ib = ROLES_ORDER.indexOf(normalizeRole(b.r) as (typeof ROLES_ORDER)[number]);
  return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
};

/** Aggregate one game OR all played games of a series into up to 10 normalized player columns (5 per series team). */
export function buildSeriesMatrixPlayers(s: HubSeries, gameNum: number | "all"): { a: MatrixPlayer[]; b: MatrixPlayer[]; minTotal: number; gamesCount: number } {
  const games = (s.games || []).filter((g) => !g.remake && g.p?.length && (gameNum === "all" || g.n === gameNum));
  const map = new Map<string, MatrixPlayer>();
  let minTotal = 0;

  for (const g of games) {
    const min = g.min || 0;
    minTotal += min;
    const blueTeamSide: 1 | 2 = g.blue === "b" ? 2 : 1;
    const ps = g.p || [];
    const teamK = { 1: 0, 2: 0 };
    const teamD = { 1: 0, 2: 0 };
    const teamDm = { 1: 0, 2: 0 };
    const teamGd = { 1: 0, 2: 0 };
    const teamV = { 1: 0, 2: 0 };
    for (const p of ps) {
      const seriesSide: 1 | 2 = p.s === 1 ? blueTeamSide : blueTeamSide === 1 ? 2 : 1;
      teamK[seriesSide] += p.k || 0;
      teamD[seriesSide] += p.d || 0;
      teamDm[seriesSide] += p.dm || 0;
      teamGd[seriesSide] += p.gd || 0;
      teamV[seriesSide] += p.v || 0;
    }
    for (const p of ps) {
      const seriesSide: 1 | 2 = p.s === 1 ? blueTeamSide : blueTeamSide === 1 ? 2 : 1;
      const role = normalizeRole(p.r) || p.r || "?";
      const key = `${seriesSide}:${p.u || p.n}:${role}`;
      let cur = map.get(key);
      if (!cur) {
        cur = {
          n: p.n,
          u: p.u,
          r: role,
          side: seriesSide,
          teamName: seriesSide === 1 ? s.a.n : s.b.n,
          c: p.c,
          champs: [],
          pk: gameNum !== "all" ? p.pk : undefined,
          g: 0,
          w: 0,
          k: 0,
          d: 0,
          a: 0,
          tk: 0,
          tdth: 0,
          cs: 0,
          csKnown: false,
          gd: 0,
          gdKnown: false,
          dm: 0,
          dmKnown: false,
          v: 0,
          vKnown: false,
          min: 0,
          tdm: 0,
          tgd: 0,
          tv: 0,
          g10: 0,
          c10: 0,
          x10: 0,
          n10: 0,
          g15: 0,
          c15: 0,
          x15: 0,
          n15: 0,
          g20: 0,
          c20: 0,
          x20: 0,
          n20: 0,
        };
        map.set(key, cur);
      }
      if (p.c && !cur.champs.includes(p.c)) cur.champs.push(p.c);
      if (gameNum !== "all") cur.pk = p.pk;
      cur.g += 1;
      if (g.w === seriesSide) cur.w += 1;
      cur.k += p.k || 0;
      cur.d += p.d || 0;
      cur.a += p.a || 0;
      cur.tk += teamK[seriesSide];
      cur.tdth += teamD[seriesSide];
      if (p.cs != null) {
        cur.cs += p.cs;
        cur.csKnown = true;
      }
      if (p.gd != null) {
        cur.gd += p.gd;
        cur.gdKnown = true;
        cur.tgd += teamGd[seriesSide];
      }
      if (p.dm != null) {
        cur.dm += p.dm;
        cur.dmKnown = true;
        cur.tdm += teamDm[seriesSide];
      }
      if (p.v != null) {
        cur.v += p.v;
        cur.vKnown = true;
        cur.tv += teamV[seriesSide];
      }
      if (min > 0) cur.min += min;
      if (p.g10 != null || p.c10 != null || p.x10 != null) {
        cur.n10 += 1;
        cur.g10 += p.g10 ?? 0;
        cur.c10 += p.c10 ?? 0;
        cur.x10 += p.x10 ?? 0;
      }
      if (p.g15 != null || p.c15 != null || p.x15 != null) {
        cur.n15 += 1;
        cur.g15 += p.g15 ?? 0;
        cur.c15 += p.c15 ?? 0;
        cur.x15 += p.x15 ?? 0;
      }
      if (p.g20 != null || p.c20 != null || p.x20 != null) {
        cur.n20 += 1;
        cur.g20 += p.g20 ?? 0;
        cur.c20 += p.c20 ?? 0;
        cur.x20 += p.x20 ?? 0;
      }
    }
  }
  const all = [...map.values()];
  return {
    a: all.filter((x) => x.side === 1).sort(byRoleSort),
    b: all.filter((x) => x.side === 2).sort(byRoleSort),
    minTotal,
    gamesCount: games.length,
  };
}

interface StatRowDef {
  key: string;
  label: string;
  title?: string;
  group: "core" | "dmg" | "gold" | "lane";
  val: (p: MatrixPlayer) => number | null;
  fmt: (v: number, p: MatrixPlayer) => string;
  lower?: boolean;
  diff?: boolean;
}

const r0 = (v: number) => String(Math.round(v));
const kFmt = (v: number) => (Math.abs(v) >= 1000 ? `${fmtDec(v / 1000)}k` : fmtNum(Math.round(v)));
const sInt = (v: number) => `${v > 0 ? "+" : ""}${fmtNum(Math.round(v))}`;
const sDec = (v: number) => `${v > 0 ? "+" : ""}${fmtDec(v)}`;
const pc1 = (v: number) => `${fmtDec(v * 100)}%`;

const STAT_ROWS: StatRowDef[] = [
  { key: "k", label: tk("Kills"), group: "core", val: (p) => p.k, fmt: r0 },
  { key: "d", label: tk("Deaths"), group: "core", val: (p) => p.d, fmt: r0, lower: true },
  { key: "a", label: tk("Assists"), group: "core", val: (p) => p.a, fmt: r0 },
  { key: "kda", label: "KDA", group: "core", val: (p) => (p.k + p.a) / Math.max(p.d, 1), fmt: (v) => fmtDec(v, 2) },
  { key: "kp", label: "KP%", title: tk("Kill participation"), group: "core", val: (p) => (p.tk ? (p.k + p.a) / p.tk : null), fmt: pc1 },
  { key: "ks", label: "KS%", title: tk("Share of team kills"), group: "core", val: (p) => (p.tk ? p.k / p.tk : null), fmt: pc1 },
  { key: "dth", label: "DTH%", title: tk("Share of team deaths"), group: "core", val: (p) => (p.tdth ? p.d / p.tdth : null), fmt: pc1, lower: true },
  { key: "cs", label: "CS", group: "gold", val: (p) => (p.csKnown ? p.cs : null), fmt: r0 },
  { key: "csm", label: "CS/m", title: tk("CS per minute"), group: "gold", val: (p) => (p.csKnown && p.min ? p.cs / p.min : null), fmt: (v) => fmtDec(v) },
  { key: "gd", label: tk("Gold"), group: "gold", val: (p) => (p.gdKnown ? p.gd : null), fmt: kFmt },
  { key: "gpm", label: "GPM", title: tk("Gold per minute"), group: "gold", val: (p) => (p.gdKnown && p.min ? p.gd / p.min : null), fmt: r0 },
  { key: "golds", label: tk("Gold%"), group: "gold", val: (p) => (p.tgd ? p.gd / p.tgd : null), fmt: pc1 },
  { key: "dm", label: tk("Damage"), group: "dmg", val: (p) => (p.dmKnown ? p.dm : null), fmt: kFmt },
  { key: "dpm", label: "DPM", title: tk("Damage per minute"), group: "dmg", val: (p) => (p.dmKnown && p.min ? p.dm / p.min : null), fmt: r0 },
  { key: "dmgs", label: tk("DMG%"), group: "dmg", val: (p) => (p.tdm ? p.dm / p.tdm : null), fmt: pc1 },
  {
    key: "dmgeff",
    label: tk("DMG% − Gold%"),
    title: tk("Damage vs. gold share"),
    group: "dmg",
    val: (p) => (p.tdm && p.tgd ? p.dm / p.tdm - p.gd / p.tgd : null),
    fmt: (v) => `${v > 0 ? "+" : ""}${fmtDec(v * 100)}%`,
    diff: true,
  },
  { key: "v", label: tk("Vision"), group: "dmg", val: (p) => (p.vKnown ? p.v : null), fmt: r0 },
  { key: "vsm", label: "VSPM", title: tk("Vision score per minute"), group: "dmg", val: (p) => (p.vKnown && p.min ? p.v / p.min : null), fmt: (v) => fmtDec(v, 2) },
  { key: "g10", label: "GD@10", title: tk("Gold lead over the lane opponent at 10 minutes"), group: "lane", val: (p) => (p.n10 ? p.g10 / p.n10 : null), fmt: sInt, diff: true },
  { key: "c10", label: "CSD@10", title: tk("CS lead over the lane opponent at 10 minutes"), group: "lane", val: (p) => (p.n10 ? p.c10 / p.n10 : null), fmt: sDec, diff: true },
  { key: "x10", label: "XPD@10", title: tk("XP lead over the lane opponent at 10 minutes"), group: "lane", val: (p) => (p.n10 ? p.x10 / p.n10 : null), fmt: sInt, diff: true },
  { key: "g15", label: "GD@15", title: tk("Gold lead over the lane opponent at 15 minutes"), group: "lane", val: (p) => (p.n15 ? p.g15 / p.n15 : null), fmt: sInt, diff: true },
  { key: "c15", label: "CSD@15", title: tk("CS lead over the lane opponent at 15 minutes"), group: "lane", val: (p) => (p.n15 ? p.c15 / p.n15 : null), fmt: sDec, diff: true },
  { key: "x15", label: "XPD@15", title: tk("XP lead over the lane opponent at 15 minutes"), group: "lane", val: (p) => (p.n15 ? p.x15 / p.n15 : null), fmt: sInt, diff: true },
  { key: "g20", label: "GD@20", title: tk("Gold lead over the lane opponent at 20 minutes"), group: "lane", val: (p) => (p.n20 ? p.g20 / p.n20 : null), fmt: sInt, diff: true },
  { key: "pk", label: tk("Pick #"), title: tk("Draft pick order (1–10)"), group: "core", val: (p) => (p.pk != null ? p.pk : null), fmt: (v) => `#${Math.round(v)}`, lower: true },
];

export const SeriesMatrix: React.FC<{ s: HubSeries; initialGame?: number | "all" }> = ({ s, initialGame }) => {
  const playedGames = useMemo(() => (s.games || []).filter((g) => !g.remake && g.p?.length), [s.games]);
  const [scope, setScope] = useState<number | "all">(
    initialGame ?? (playedGames[0]?.n ?? "all"),
  );
  const [highlighted, setHighlighted] = useState<string | null>("dpm");
  const [compareMode, setCompareMode] = useState<"overall" | "lane">("overall");
  const tableRef = useRef<HTMLTableElement>(null);

  const effectiveScope = scope !== "all" && playedGames.some((g) => g.n === scope) ? scope : playedGames.length > 1 ? "all" : playedGames[0]?.n ?? "all";
  const { a, b } = useMemo(() => buildSeriesMatrixPlayers(s, effectiveScope), [s, effectiveScope]);
  const activeGame = effectiveScope === "all" ? null : playedGames.find((g) => g.n === effectiveScope) || null;
  const cols = useMemo(() => [...a, ...b], [a, b]);

  if (!playedGames.length || !cols.length) return null;

  const aIsBlue = activeGame ? activeGame.blue !== "b" : null;
  const pill = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
      on ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-line"
    }`;

  // Filter rows dynamically so e.g. pick order # disappears on "Series Avg" or when unavailable across the series
  const visibleRows = STAT_ROWS.filter(
    (row) => (row.key !== "pk" || effectiveScope !== "all") && cols.some((p) => row.val(p) !== null),
  );

  return (
    <Section
      title={tl("All stats matrix")}
      right={
        <div className="flex flex-wrap items-center gap-1.5" data-nocapture="1">
          {playedGames.map((g) => (
            <button key={g.n} type="button" onClick={() => setScope(g.n)} className={pill(effectiveScope === g.n)}>
              {tl("Game {n}", { n: g.n })}
            </button>
          ))}
          {playedGames.length > 1 && (
            <button type="button" onClick={() => setScope("all")} className={pill(effectiveScope === "all")}>
              {tl("Series totals")}
            </button>
          )}
          <div className="inline-flex rounded-lg border border-rw-border bg-rw-surface p-0.5 text-[11px]" role="group" aria-label={tl("Stat highlight")}>
            {(["overall", "lane"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setCompareMode(m)}
                aria-pressed={compareMode === m}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  compareMode === m ? "bg-rw-raised text-rw-text shadow-sm" : "text-rw-muted hover:text-rw-text"
                }`}
              >
                {m === "overall" ? tl("All") : tl("Role 1v1")}
              </button>
            ))}
          </div>
          <TableExport tableRef={tableRef} name={`${s.a.c || s.a.n}-vs-${s.b.c || s.b.n}-${effectiveScope === "all" ? "series" : `g${effectiveScope}`}-matrix`} />
        </div>
      }
    >
      <p className="text-[11px] text-rw-muted">
        {tl("All 10 players side by side. Click any stat row to highlight leaders across every role.")}
      </p>
      <div className="overflow-x-auto rounded-lg border border-rw-border bg-rw-bg/50">
        <table ref={tableRef} className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-rw-border bg-rw-raised/40">
              <th scope="col" className="sticky left-0 z-10 bg-rw-panel px-2.5 py-2 text-left text-rw-muted font-semibold border-r border-rw-border whitespace-nowrap">
                {tl("Team")}
              </th>
              <th
                scope="col"
                colSpan={Math.max(1, a.length)}
                className={`px-2 py-1.5 text-center font-bold border-r border-rw-border ${
                  aIsBlue === true ? "text-sky-400" : aIsBlue === false ? "text-rose-400" : "text-rw-text"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <TeamLogo name={s.a.n} size={14} />
                  <span>{s.a.n}</span>
                  {activeGame?.w === 1 && <span className="text-[10px] text-rw-teal font-semibold">✓</span>}
                  {aIsBlue !== null && (
                    <span className="text-[10px] font-normal opacity-80">({aIsBlue ? tl("Blue") : tl("Red")})</span>
                  )}
                </span>
              </th>
              <th
                scope="col"
                colSpan={Math.max(1, b.length)}
                className={`px-2 py-1.5 text-center font-bold ${
                  aIsBlue === false ? "text-sky-400" : aIsBlue === true ? "text-rose-400" : "text-rw-text"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <TeamLogo name={s.b.n} size={14} />
                  <span>{s.b.n}</span>
                  {activeGame?.w === 2 && <span className="text-[10px] text-rw-teal font-semibold">✓</span>}
                  {aIsBlue !== null && (
                    <span className="text-[10px] font-normal opacity-80">({aIsBlue ? tl("Red") : tl("Blue")})</span>
                  )}
                </span>
              </th>
            </tr>
            <tr className="border-b border-rw-border">
              <th scope="col" className="sticky left-0 z-10 bg-rw-panel px-2.5 py-2 text-left text-rw-muted font-semibold border-r border-rw-border whitespace-nowrap">
                {tl("Player")}
              </th>
              {cols.map((p, idx) => {
                const sep = idx === a.length - 1 ? "border-r border-rw-border" : "";
                const pSlug = p.u || resolvePlayerSlug(p.n);
                return (
                  <th key={`${p.side}-${p.n}-${idx}`} scope="col" className={`px-2 py-2 text-center font-normal min-w-[78px] ${sep}`}>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[9px] uppercase tracking-wider text-rw-muted">{roleName(p.r)}</span>
                      <div className="flex items-center gap-1 justify-center">
                        <PlayerPhoto name={p.n} slug={p.u} size={20} />
                        {effectiveScope !== "all" && p.c && (
                          <HubLink to={{ kind: "champ", slug: resolveChampSlug(p.c) }} title={champName(p.c)}>
                            <ChampIcon name={p.c} size={20} />
                          </HubLink>
                        )}
                      </div>
                      <HubLink to={{ kind: "player", slug: pSlug }} className="font-semibold text-rw-text hover:text-rw-accent truncate max-w-[74px]">
                        {p.n}
                      </HubLink>
                      {effectiveScope === "all" && p.champs.length > 0 && (
                        <div className="flex items-center justify-center gap-0.5 flex-wrap">
                          {p.champs.slice(0, 4).map((ch) => (
                            <ChampIcon key={ch} name={ch} size={13} />
                          ))}
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const vals = cols.map((p) => row.val(p));
              const valid = vals.filter((v): v is number => v !== null);
              const best = valid.length ? (row.lower ? Math.min(...valid) : Math.max(...valid)) : null;
              const laneWinners = compareMode === "lane" ? (() => {
                const map = new Map<string, number>();
                const byRole = new Map<string, number[]>();
                cols.forEach((p, i) => {
                  const v = vals[i];
                  if (v === null || !p.r) return;
                  const arr = byRole.get(p.r) ?? [];
                  arr.push(v);
                  byRole.set(p.r, arr);
                });
                byRole.forEach((arr, r) => {
                  if (arr.length >= 2) {
                    const bVal = row.lower ? Math.min(...arr) : Math.max(...arr);
                    if (arr.filter((x) => x === bVal).length < arr.length) map.set(r, bVal);
                  }
                });
                return map;
              })() : null;
              const isHi = highlighted === row.key;
              return (
                <tr
                  key={row.key}
                  onClick={() => setHighlighted((cur) => (cur === row.key ? null : row.key))}
                  className={`border-t border-rw-border/70 cursor-pointer transition-colors ${
                    isHi ? "bg-rw-accent/15 hover:bg-rw-accent/20" : "hover:bg-rw-raised/40"
                  }`}
                >
                  <th
                    scope="row"
                    title={row.title ? tl(row.title) : undefined}
                    className={`sticky left-0 z-10 px-2.5 py-1.5 text-left font-semibold border-r border-rw-border whitespace-nowrap ${
                      isHi ? "bg-rw-panel text-rw-accent" : "bg-rw-panel text-rw-sub"
                    }`}
                  >
                    {tl(row.label)}
                  </th>
                  {cols.map((p, idx) => {
                    const v = vals[idx];
                    const sep = idx === a.length - 1 ? "border-r border-rw-border" : "";
                    const roleBest = laneWinners && p.r ? laneWinners.get(p.r) : undefined;
                    const isBest = compareMode === "lane"
                      ? v !== null && roleBest !== undefined && v === roleBest
                      : v !== null && best !== null && v === best && valid.filter((x) => x === best).length < valid.length;
                    const color =
                      row.diff && v !== null
                        ? v >= 0
                          ? "text-rw-teal font-semibold"
                          : "text-rw-red"
                        : isBest
                          ? "text-rw-accent font-bold"
                          : "text-rw-text";
                    return (
                      <td key={`${row.key}-${idx}`} className={`px-2 py-1.5 text-center tabular-nums whitespace-nowrap ${sep} ${color}`}>
                        {v === null ? "–" : row.fmt(v, p)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
};

export const SeriesSummaryGrid: React.FC<{ s: HubSeries; onSelectGame?: (n: number) => void }> = ({ s, onSelectGame }) => {
  const games = useMemo(() => (s.games || []).filter((g) => !g.remake && (g.w || g.t || g.p?.length)), [s.games]);
  if (games.length < 2) return null;
  const fmtDur = (min?: number | null) => {
    if (!min) return "–";
    const m = Math.floor(min);
    const sec = Math.round((min - m) * 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };
  return (
    <Section title={tl("Series summary")}>
      <div className="space-y-2">
        {games.map((g: HubGame) => {
          const blueSide: 1 | 2 = g.blue === "b" ? 2 : 1;
          const aBlue = blueSide === 1;
          const blueTeam = aBlue ? s.a : s.b;
          const redTeam = aBlue ? s.b : s.a;
          const sb = g.t?.blue;
          const sr = g.t?.red;
          const blueWon = (g.w === 1 && aBlue) || (g.w === 2 && !aBlue);
          const redWon = (g.w === 2 && aBlue) || (g.w === 1 && !aBlue);
          const bPicks = sb?.picks?.length ? sb.picks : (g.p || []).filter((p: GamePlayer) => p.s === 1 && p.c).map((p) => p.c!);
          const rPicks = sr?.picks?.length ? sr.picks : (g.p || []).filter((p: GamePlayer) => p.s === 2 && p.c).map((p) => p.c!);
          const goldDiff = sb?.gold != null && sr?.gold != null ? sb.gold - sr.gold : null;
          return (
            <div key={g.n} className={`${card} p-3 flex flex-col gap-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-rw-text">{tl("Game {n}", { n: g.n })}</span>
                  {g.min && <span className="text-rw-muted tabular-nums">{fmtDur(g.min)}</span>}
                  {g.patch && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rw-raised text-rw-sub">{g.patch}</span>}
                  {(g.fp === "r" || g.p?.some((p) => p.pk === 1)) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rw-raised text-rw-sub font-medium">
                      {g.fp === "r" || g.p?.some((p) => p.s === 2 && p.pk === 1) ? tl("Red 1st pick") : tl("Blue 1st pick")}
                    </span>
                  )}
                  {g.mvp?.n && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rw-gold/15 text-rw-gold font-semibold">
                      {tl("MVP")}: {g.mvp.n}
                    </span>
                  )}
                </div>
                {onSelectGame && (
                  <button
                    type="button"
                    onClick={() => onSelectGame(g.n)}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                  >
                    {tl("Open game")} →
                  </button>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-2 text-xs">
                {[
                  { team: blueTeam, isBlue: true, won: blueWon, stats: sb, picks: bPicks },
                  { team: redTeam, isBlue: false, won: redWon, stats: sr, picks: rPicks },
                ].map((side, si) => (
                  <div
                    key={si}
                    className={`rounded-lg border px-2.5 py-2 space-y-1.5 ${
                      side.won ? "border-rw-teal/50 bg-rw-teal/5" : "border-rw-border bg-rw-bg/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold truncate">
                        <span className={`w-2 h-2 rounded-full ${side.isBlue ? "bg-sky-400" : "bg-rose-400"}`} />
                        <TeamLogo name={side.team.n} size={14} />
                        <span className="truncate">{side.team.n}</span>
                        {side.won && <span className="text-[10px] font-bold text-rw-teal uppercase">{tl("Win")}</span>}
                      </span>
                      <span className="flex flex-col items-end gap-0.5 text-[11px] text-rw-sub tabular-nums shrink-0">
                        <span>
                          {side.stats?.k != null ? `${side.stats.k} ${tl("kills")}` : ""}
                          {side.stats?.gold != null ? ` · ${fmtDec(side.stats.gold / 1000)}k` : ""}
                          {si === 0 && goldDiff !== null ? ` (${goldDiff >= 0 ? "+" : ""}${fmtDec(goldDiff / 1000)}k)` : ""}
                        </span>
                        {(side.stats?.towers != null || side.stats?.drag != null || side.stats?.barons != null || side.stats?.grubs != null) && (
                          <span className="inline-flex flex-wrap justify-end gap-1 text-[10px] text-rw-muted">
                            {side.stats?.towers != null && <span className="px-1 rounded bg-rw-raised" title={tl("Towers")}>T {side.stats.towers}</span>}
                            {side.stats?.drag != null && <span className="px-1 rounded bg-rw-raised" title={tl("Dragons")}>D {side.stats.drag}</span>}
                            {side.stats?.barons != null && <span className="px-1 rounded bg-rw-raised" title={tl("Barons")}>B {side.stats.barons}</span>}
                            {side.stats?.grubs != null && <span className="px-1 rounded bg-rw-raised" title={tl("Void grubs")}>G {side.stats.grubs}</span>}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {side.picks.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-rw-muted">{tl("Picks")}</span>
                          {side.picks.map((ch, idx) => (
                            <ChampIcon key={`${ch}-${idx}`} name={ch} size={20} />
                          ))}
                        </div>
                      )}
                      {side.stats?.bans && side.stats.bans.length > 0 && (
                        <div className="flex items-center gap-1 ml-auto opacity-75">
                          <span className="text-[10px] text-rw-muted">{tl("Bans")}</span>
                          {side.stats.bans.map((ch, idx) => (
                            <ChampIcon key={`${ch}-${idx}`} name={ch} size={16} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
};
