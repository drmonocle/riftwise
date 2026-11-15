/**
 * Swiss Stage Round Progression Matrix (`Leaguepedia`-style R1–R5 grid) for Worlds / Swiss events.
 * Each cell shows the opponent logo + code, series score, running Swiss record (e.g. 2-1 -> 3-1),
 * and links directly to `/match/<g>` so casters/viewers can inspect the exact Bo1/Bo3.
 */
import React, { useMemo } from "react";
import { tl } from "../../i18n";
import type { HubEvent, SeriesRow, Stage } from "../../hub/types";
import { HubLink, Section, TeamLink, TeamLogo, card, td, th } from "./ui";

type StandingGroup = NonNullable<HubEvent["standings"]>[number];

export interface SwissCell {
  round: number;
  seriesSlug: string | null;
  oppName: string;
  oppSlug?: string | null;
  oppCode?: string | null;
  score: string;
  won: boolean | null;
  bo?: number;
  recordAfter: string;
  decisive: boolean;
}

export interface SwissRow {
  team: string;
  slug?: string | null;
  code?: string | null;
  wins: number;
  losses: number;
  gw: number;
  gl: number;
  pl?: number;
  status: "qualified" | "eliminated" | "active";
  cells: Map<number, SwissCell>;
}

export interface SwissMatrixData {
  rounds: number[];
  rows: SwissRow[];
}

const ROUND_RE = /^round\s*([1-5])$/i;
const HIGH_ROUND_RE = /^round\s*([6-9]|\d{2,})$/i;

const normTeamKey = (name: string, slug?: string | null) =>
  (slug || name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Build the Swiss progression grid from event stages + standings, returning null for non-Swiss events. */
export function buildSwissMatrix(stages?: Stage[], standings?: StandingGroup[]): SwissMatrixData | null {
  if (!stages?.length) return null;
  // Domestic Bo1/Bo3 round-robins have Round 6..9+; reject those immediately.
  if (stages.some((st) => HIGH_ROUND_RE.test((st.name || "").trim()))) return null;

  const found: { round: number; stage: Stage }[] = [];
  for (const st of stages) {
    const m = ROUND_RE.exec((st.name || "").trim());
    if (!m) continue;
    const round = Number(m[1]);
    if (st.series?.length) found.push({ round, stage: st });
  }
  found.sort((a, b) => a.round - b.round);
  if (found.length < 3 || found.length > 5) return null;

  // Validate per-round uniqueness (1 match per team per round) and Swiss elimination shrinkage.
  const allRoundTeams = new Set<string>();
  const rowMap = new Map<string, SwissRow>();

  const ensureTeam = (name: string, slug?: string | null, code?: string | null): SwissRow => {
    const k = normTeamKey(name, slug);
    const existing = rowMap.get(k);
    if (existing) {
      if (!existing.slug && slug) existing.slug = slug;
      if (!existing.code && code) existing.code = code;
      return existing;
    }
    const created: SwissRow = {
      team: name,
      slug,
      code,
      wins: 0,
      losses: 0,
      gw: 0,
      gl: 0,
      status: "active",
      cells: new Map(),
    };
    rowMap.set(k, created);
    return created;
  };

  for (const st of standings || []) {
    for (const r of st.rows || []) {
      const row = ensureTeam(r.t, r.u);
      if (r.pl != null && (row.pl == null || r.pl < row.pl)) row.pl = r.pl;
      if (r.gw != null && row.gw === 0) row.gw = r.gw;
      if (r.gl != null && row.gl === 0) row.gl = r.gl;
    }
  }

  for (const { round, stage } of found) {
    const seenInRound = new Set<string>();
    for (const m of stage.series) {
      const ka = normTeamKey(m.a, m.au);
      const kb = normTeamKey(m.b, m.bu);
      if (!ka || !kb || seenInRound.has(ka) || seenInRound.has(kb)) return null;
      seenInRound.add(ka);
      seenInRound.add(kb);
      allRoundTeams.add(ka);
      allRoundTeams.add(kb);
    }
  }
  if (allRoundTeams.size < 8) return null;

  // Standard 16-team Swiss drops from 8 matches (R1-R3) to 6 (R4) and 3 (R5); allow 12-team / 8-team Swiss variants too.
  if (found.length >= 4 && found[found.length - 1].stage.series.length >= found[0].stage.series.length) {
    return null;
  }

  // Track game win-loss from the round series when standings lacked it, and populate round cells in order.
  const computedGames = new Map<string, { gw: number; gl: number }>();
  for (const { round, stage } of found) {
    for (const m of stage.series as SeriesRow[]) {
      const teamA = ensureTeam(m.a, m.au, m.ac);
      const teamB = ensureTeam(m.b, m.bu, m.bc);
      const keyA = normTeamKey(m.a, m.au);
      const keyB = normTeamKey(m.b, m.bu);
      const sa = m.sa ?? 0;
      const sb = m.sb ?? 0;
      const aWon = m.w === 1 ? true : m.w === 2 ? false : null;
      const bWon = m.w === 2 ? true : m.w === 1 ? false : null;

      if (aWon === true) teamA.wins += 1;
      else if (aWon === false) teamA.losses += 1;
      if (bWon === true) teamB.wins += 1;
      else if (bWon === false) teamB.losses += 1;

      const cgA = computedGames.get(keyA) || { gw: 0, gl: 0 };
      cgA.gw += sa;
      cgA.gl += sb;
      computedGames.set(keyA, cgA);
      const cgB = computedGames.get(keyB) || { gw: 0, gl: 0 };
      cgB.gw += sb;
      cgB.gl += sa;
      computedGames.set(keyB, cgB);

      const recA = `${teamA.wins}-${teamA.losses}`;
      const recB = `${teamB.wins}-${teamB.losses}`;
      if (teamA.wins >= 3) teamA.status = "qualified";
      else if (teamA.losses >= 3) teamA.status = "eliminated";
      if (teamB.wins >= 3) teamB.status = "qualified";
      else if (teamB.losses >= 3) teamB.status = "eliminated";

      teamA.cells.set(round, {
        round,
        seriesSlug: m.g,
        oppName: m.b,
        oppSlug: m.bu,
        oppCode: m.bc,
        score: aWon === null && sa === 0 && sb === 0 ? "vs" : `${sa}-${sb}`,
        won: aWon,
        bo: m.bo,
        recordAfter: recA,
        decisive: aWon !== null && (teamA.wins === 3 || teamA.losses === 3),
      });
      teamB.cells.set(round, {
        round,
        seriesSlug: m.g,
        oppName: m.a,
        oppSlug: m.au,
        oppCode: m.ac,
        score: bWon === null && sa === 0 && sb === 0 ? "vs" : `${sb}-${sa}`,
        won: bWon,
        bo: m.bo,
        recordAfter: recB,
        decisive: bWon !== null && (teamB.wins === 3 || teamB.losses === 3),
      });
    }
  }

  const rows = Array.from(rowMap.entries())
    .filter(([k]) => allRoundTeams.has(k))
    .map(([k, r]) => {
      if (r.gw === 0 && r.gl === 0) {
        const cg = computedGames.get(k);
        if (cg) {
          r.gw = cg.gw;
          r.gl = cg.gl;
        }
      }
      return r;
    });

  rows.sort((a, b) => {
    const rank = (r: SwissRow) => (r.status === "qualified" ? 0 : r.status === "active" ? 1 : 2);
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    const diffA = a.gw - a.gl;
    const diffB = b.gw - b.gl;
    if (diffA !== diffB) return diffB - diffA;
    return a.team.localeCompare(b.team);
  });

  return {
    rounds: found.map((f) => f.round),
    rows,
  };
}

export const SwissProgression: React.FC<{ e: HubEvent; hidden?: boolean }> = ({ e, hidden }) => {
  const matrix = useMemo(() => buildSwissMatrix(e.stages, e.standings), [e.stages, e.standings]);
  if (!matrix) return null;

  return (
    <Section title={tl("Swiss stage progression")}>
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-rw-border/80 bg-rw-raised/40">
              <th className={`${th} text-left w-10`}>#</th>
              <th className={`${th} text-left min-w-[140px]`}>{tl("Team")}</th>
              <th className={`${th} text-center`}>{tl("Record")}</th>
              {matrix.rounds.map((r) => (
                <th key={r} className={`${th} text-center min-w-[104px]`}>
                  {`R${r}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r, idx) => {
              const badgeCls =
                hidden
                  ? "text-rw-muted bg-rw-raised border-rw-border"
                  : r.status === "qualified"
                    ? "text-rw-teal bg-rw-teal/15 border-rw-teal/40"
                    : r.status === "eliminated"
                      ? "text-rw-red bg-rw-red/10 border-rw-red/30"
                      : "text-rw-sub bg-rw-raised border-rw-border";
              return (
                <tr key={r.slug || r.team} className="border-b border-rw-border/40 last:border-b-0 hover:bg-rw-raised/25">
                  <td className={`${td} text-rw-muted tabular-nums`}>{idx + 1}</td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-1.5 font-medium text-rw-text">
                      <TeamLogo name={r.team} size={16} />
                      <TeamLink name={r.team} u={r.slug} />
                    </span>
                  </td>
                  <td className={`${td} text-center`}>
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-bold tabular-nums ${badgeCls}`}>
                      {hidden ? "–" : `${r.wins}-${r.losses}`}
                    </span>
                  </td>
                  {matrix.rounds.map((round) => {
                    const cell = r.cells.get(round);
                    if (!cell) {
                      return (
                        <td key={round} className={`${td} text-center text-rw-muted/40`}>
                          —
                        </td>
                      );
                    }
                    const cellCls = hidden
                      ? "border-rw-border/60 bg-rw-bg/40 text-rw-sub hover:border-rw-accent"
                      : cell.won === true
                        ? cell.decisive
                          ? "border-rw-teal bg-rw-teal/20 text-rw-teal hover:brightness-110"
                          : "border-rw-teal/45 bg-rw-teal/10 text-rw-text hover:border-rw-teal"
                        : cell.won === false
                          ? cell.decisive
                            ? "border-rw-red bg-rw-red/15 text-rw-red hover:brightness-110"
                            : "border-rw-red/40 bg-rw-red/8 text-rw-text hover:border-rw-red"
                          : "border-rw-border bg-rw-bg/40 text-rw-sub hover:border-rw-accent";
                    const inner = (
                      <>
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <TeamLogo name={cell.oppName} size={14} />
                          <span className="font-semibold truncate">{cell.oppCode || cell.oppName}</span>
                        </span>
                        <span className="tabular-nums text-[10px] font-bold shrink-0">
                          {hidden ? (cell.bo && cell.bo > 1 ? `Bo${cell.bo}` : "vs") : cell.score}
                        </span>
                      </>
                    );
                    return (
                      <td key={round} className="px-1.5 py-1 text-center">
                        {cell.seriesSlug ? (
                          <HubLink
                            to={{ kind: "match", slug: cell.seriesSlug }}
                            className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded border transition-colors ${cellCls}`}
                            title={`${r.team} vs ${cell.oppName}${hidden ? "" : ` (${cell.score})`}`}
                          >
                            {inner}
                          </HubLink>
                        ) : (
                          <div
                            className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded border ${cellCls}`}
                            title={`${r.team} vs ${cell.oppName}${hidden ? "" : ` (${cell.score})`}`}
                          >
                            {inner}
                          </div>
                        )}
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
