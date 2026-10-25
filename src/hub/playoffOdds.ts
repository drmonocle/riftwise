/**
 * Playoff chances for a league table that is still being played: the remaining series played out many times with
 * the power ratings (winChance.ts through matchRatings.chances), and each team's share of the runs where it finished
 * first and in the top N for each cut line. The table comes from the tournament's own series (the same list as the
 * series still to play, so the two always agree; a standings table can name a team differently). Only for one
 * league table whose whole schedule is known: every unplayed table series has both teams, the playoff bracket (if
 * the tournament has one) hasn't started, and every team ends on the same number of series (a round robin; a Swiss
 * stage only knows its next round). Ties on series wins go to the better game difference, then by lot: a league's
 * own tiebreakers (head to head first, tiebreaker games) aren't modelled.
 */
import type { HubEvent, HubRatings, RatingRow } from "./types";
import { chances } from "./matchRatings";
import { gameChance, seriesChance } from "./winChance";

export interface OddsRow {
  u: string;
  name: string;
  /** record so far: series won and lost, games won and lost */
  sw: number;
  sl: number;
  gw: number;
  gl: number;
  /** series still to play */
  left: number;
  /** share of the runs where it finished first, and in the top `cuts[i]` */
  first: number;
  top: number[];
  /** no power rating: played with the table's median rating */
  unrated: boolean;
}

export interface PlayoffOdds {
  rows: OddsRow[];
  /** the cut lines offered (top 2, 4, 6, 8: those below the number of teams) */
  cuts: number[];
  /** a sensible first cut line for the table's size */
  cut: number;
  open: number;
  runs: number;
}

/** A small seeded random: the same numbers for the same table on the same day, so a reload doesn't change them. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (text: string) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export function playoffOdds(ev: HubEvent, ratings: HubRatings, today: string, runs = 4000): PlayoffOdds | null {
  if (!ev.end || ev.end.slice(0, 10) < today) return null;
  // several groups would need a table each
  if ((ev.standings?.length ?? 0) > 1) return null;
  const stages = ev.stages || [];
  // the playoffs have started (a bracket series played, or with both teams known): the table is done
  if (stages.some((st) => st.kind === "bracket" && st.series.some((s) => s.w || (s.au && s.bu)))) return null;
  const series = stages.filter((st) => st.kind === "list").flatMap((st) => st.series);
  const open = series.filter((s) => !s.w);
  if (!open.length || open.some((s) => !s.au || !s.bu)) return null;

  // the table so far, from the played series
  const teams = new Map<string, Omit<OddsRow, "first" | "top" | "unrated">>();
  const team = (u: string, name: string) => {
    let t = teams.get(u);
    if (!t) teams.set(u, (t = { u, name, sw: 0, sl: 0, gw: 0, gl: 0, left: 0 }));
    return t;
  };
  for (const s of series) {
    if (!s.au || !s.bu) continue;
    const a = team(s.au, s.a);
    const b = team(s.bu, s.b);
    if (!s.w) {
      a.left++;
      b.left++;
      continue;
    }
    const [w, l] = s.w === 1 ? [a, b] : [b, a];
    w.sw++;
    l.sl++;
    a.gw += s.sa ?? 0;
    a.gl += s.sb ?? 0;
    b.gw += s.sb ?? 0;
    b.gl += s.sa ?? 0;
  }
  const table = [...teams.values()];
  if (table.length < 4) return null;
  const ends = table.map((t) => t.sw + t.sl + t.left);
  if (Math.max(...ends) !== Math.min(...ends)) return null;
  const at = new Map(table.map((t, i) => [t.u, i]));

  // each remaining series: the chance for its first team, from the power ratings (unrated teams: the table's median)
  const row = (u: string) => ratings.teams.find((r) => r[0] === u);
  const rated = table.map((t) => row(t.u)).filter((r): r is RatingRow => !!r);
  const median = rated.length ? [...rated.map((r) => r[5])].sort((x, y) => x - y)[Math.floor(rated.length / 2)] : 1500;
  const ctxScale = rated.some((r) => r[9] === 1) ? 1 : (ratings.adjust?.other ?? 1);
  const games = open.map((s) => {
    const ra = row(s.au as string);
    const rb = row(s.bu as string);
    const both = ra && rb ? chances(ratings, ra, rb, s.bo || 1) : null;
    const g = both ? both.game : gameChance(ra?.[5] ?? median, rb?.[5] ?? median, ctxScale);
    return { a: at.get(s.au as string)!, b: at.get(s.bu as string)!, g, p: both ? both.series : seriesChance(g, s.bo || 1, ratings.adjust), bo: s.bo || 1 };
  });

  const cuts = [2, 4, 6, 8].filter((k) => k < table.length);
  const firsts = table.map(() => 0);
  const tops = cuts.map(() => table.map(() => 0));
  const R = rng(hash(`${ev.u}|${today}`));
  const sw = table.map(() => 0);
  const gd = table.map(() => 0);
  const lot = table.map(() => 0);
  const order = table.map((_, i) => i);
  for (let run = 0; run < runs; run++) {
    table.forEach((t, i) => {
      sw[i] = t.sw;
      gd[i] = t.gw - t.gl;
      lot[i] = R();
    });
    for (const m of games) {
      const aWon = R() < m.p;
      // the series score: the loser takes each of its (wins needed - 1) games with its one-game chance
      const need = Math.floor(m.bo / 2) + 1;
      const q = aWon ? 1 - m.g : m.g;
      let lost = 0;
      for (let k = 0; k < need - 1; k++) if (R() < q) lost++;
      const [w, l] = aWon ? [m.a, m.b] : [m.b, m.a];
      sw[w]++;
      gd[w] += need - lost;
      gd[l] -= need - lost;
    }
    order.sort((x, y) => sw[y] - sw[x] || gd[y] - gd[x] || lot[y] - lot[x]);
    firsts[order[0]]++;
    order.forEach((t, place) => cuts.forEach((k, c) => place < k && tops[c][t]++));
  }
  const rows: OddsRow[] = table.map((t, i) => ({
    ...t,
    first: firsts[i] / runs,
    top: cuts.map((_, c) => tops[c][i] / runs),
    unrated: !row(t.u),
  }));
  // a first cut line that fits most league formats: 6 of 10 or more, 4 of 6 to 9, 2 of 4 or 5
  const cut = table.length >= 10 ? 6 : table.length >= 6 ? 4 : 2;
  return { rows, cuts, cut: cuts.includes(cut) ? cut : cuts[cuts.length - 1], open: open.length, runs };
}
