/**
 * Bracket pickers for MSI (8-team double elimination, since 2023) and First Stand (two 4-team "GSL" groups, then
 * semifinals and a final, since 2026). A bracket is a list of matches whose teams come from a seed or from the
 * winner / loser of an earlier match; results come from the stats when played, else the reader's picks, else a fill
 * (favourites, a roll by the chances, a coin flip), the same way as the Worlds pickers.
 */
import type { ChanceAdjust } from "./winChance";
import { matchKey, rng, roller, seriesChanceOf, type Fill, type Picks, type RealSeries, type WMatch, type WTeam } from "./worlds";

export type Src = { seed: string } | { win: string } | { lose: string };
export interface BracketNode {
  id: string;
  /** column it shows in ("Upper round 1", "Group A"...) */
  col: string;
  a: Src;
  b: Src;
  bo: number;
}
export interface Bracket {
  nodes: BracketNode[];
  /** the match whose winner takes the title */
  final: string;
  /** places worth counting in the chances table: [label, match ids whose two teams reach it] */
  reach: [string, string[]][];
}

/** MSI's bracket stage: the first-round pairs in order (1v2 and 3v4 meet in the upper semifinals). */
export function msiBracket(pairs: [string, string][], bo = 5): Bracket {
  const [p1, p2, p3, p4] = pairs;
  const n = (id: string, col: string, a: Src, b: Src): BracketNode => ({ id, col, a, b, bo });
  return {
    nodes: [
      n("ub1", "Upper round 1", { seed: p1[0] }, { seed: p1[1] }),
      n("ub2", "Upper round 1", { seed: p2[0] }, { seed: p2[1] }),
      n("ub3", "Upper round 1", { seed: p3[0] }, { seed: p3[1] }),
      n("ub4", "Upper round 1", { seed: p4[0] }, { seed: p4[1] }),
      n("lb1", "Lower round 1", { lose: "ub1" }, { lose: "ub2" }),
      n("lb2", "Lower round 1", { lose: "ub3" }, { lose: "ub4" }),
      n("us1", "Upper semifinals", { win: "ub1" }, { win: "ub2" }),
      n("us2", "Upper semifinals", { win: "ub3" }, { win: "ub4" }),
      // the upper semifinal losers drop crossed over, so first-round opponents don't meet again at once
      n("lr1", "Lower round 2", { lose: "us1" }, { win: "lb2" }),
      n("lr2", "Lower round 2", { lose: "us2" }, { win: "lb1" }),
      n("lb3", "Lower round 3", { win: "lr1" }, { win: "lr2" }),
      n("uf", "Upper final", { win: "us1" }, { win: "us2" }),
      n("lf", "Lower final", { lose: "uf" }, { win: "lb3" }),
      n("gf", "Grand final", { win: "uf" }, { win: "lf" }),
    ],
    final: "gf",
    reach: [["Upper final", ["uf"]], ["Grand final", ["gf"]]],
  };
}

/** First Stand: groups A and B (each two opening pairs), then A1 v B2 and B1 v A2, then the final. */
export function gslBracket(groupA: [string, string][], groupB: [string, string][], bo = 5): Bracket {
  const n = (id: string, col: string, a: Src, b: Src): BracketNode => ({ id, col, a, b, bo });
  const group = (g: string, pairs: [string, string][]) => [
    n(`${g}1`, `Group ${g}`, { seed: pairs[0][0] }, { seed: pairs[0][1] }),
    n(`${g}2`, `Group ${g}`, { seed: pairs[1][0] }, { seed: pairs[1][1] }),
    n(`${g}w`, `Group ${g}`, { win: `${g}1` }, { win: `${g}2` }), // winner: 1st
    n(`${g}l`, `Group ${g}`, { lose: `${g}1` }, { lose: `${g}2` }),
    n(`${g}d`, `Group ${g}`, { lose: `${g}w` }, { win: `${g}l` }), // decider: 2nd
  ];
  return {
    nodes: [
      ...group("A", groupA),
      ...group("B", groupB),
      n("sf1", "Semifinals", { win: "Aw" }, { win: "Bd" }),
      n("sf2", "Semifinals", { win: "Bw" }, { win: "Ad" }),
      n("f", "Final", { win: "sf1" }, { win: "sf2" }),
    ],
    final: "f",
    reach: [["Semifinal", ["sf1", "sf2"]], ["Final", ["f"]]],
  };
}

export interface BracketResult {
  matches: (WMatch & { id: string; col: string })[];
  champion: string | null;
}

/** Plays a bracket out: real results first, then picks, then `fill`. A match shows once both its teams are known. */
export function runBracket(br: Bracket, teams: WTeam[], real: RealSeries[], picks: Picks, adjust?: ChanceAdjust, fill?: Fill): BracketResult {
  const by = new Map(teams.map((t) => [t.u, t]));
  const out = new Map<string, WMatch & { id: string; col: string }>();
  const side = (s: Src): string | null => {
    if ("seed" in s) return s.seed;
    const m = out.get("win" in s ? s.win : s.lose);
    if (!m || !m.w) return null;
    return ("win" in s) === (m.w === 1) ? m.a : m.b;
  };
  const used = new Set<RealSeries>();
  for (const nd of br.nodes) {
    const a = side(nd.a);
    const b = side(nd.b);
    if (!a || !b) continue;
    const m: WMatch & { id: string; col: string } = {
      id: nd.id, col: nd.col, round: 0, key: matchKey(nd.id, a, b), a, b, bo: nd.bo,
      p: seriesChanceOf(by.get(a), by.get(b), nd.bo, adjust), w: 0, from: "", drawn: false,
    };
    // the same two teams can meet twice (upper and lower bracket): take the earliest series not used yet
    const r = real.find((s) => !used.has(s) && ((s.a === a && s.b === b) || (s.a === b && s.b === a)));
    if (r) used.add(r);
    if (r && (r.w === 1 || r.w === 2)) {
      m.w = (r.w === 1) === (r.a === a) ? 1 : 2;
      m.from = "real";
      [m.sa, m.sb] = r.a === a ? [r.sa, r.sb] : [r.sb, r.sa];
    } else if (picks[m.key] === a || picks[m.key] === b) {
      m.w = picks[m.key] === a ? 1 : 2;
      m.from = "pick";
    } else if (fill) {
      m.w = fill(m);
      if (m.w) m.from = "fill";
    }
    out.set(nd.id, m);
  }
  const f = out.get(br.final);
  return { matches: [...out.values()], champion: f && f.w ? (f.w === 1 ? f.a : f.b) : null };
}

/** How often each team gets how far over `runs` playthroughs (open matches rolled by their chances). */
export function simulateBracket(br: Bracket, teams: WTeam[], real: RealSeries[], adjust: ChanceAdjust | undefined, runs = 10000, picks: Picks = {}, seed = 1): Record<string, number[]> {
  const odds: Record<string, number[]> = Object.fromEntries(teams.map((t) => [t.u, new Array(br.reach.length + 1).fill(0)]));
  const roll = roller(rng(seed));
  for (let i = 0; i < runs; i++) {
    const r = runBracket(br, teams, real, picks, adjust, roll);
    const at = new Map(r.matches.map((m) => [m.id, m]));
    br.reach.forEach(([, ids], k) => {
      for (const id of ids) {
        const m = at.get(id);
        if (m) for (const u of [m.a, m.b]) if (odds[u]) odds[u][k]++;
      }
    });
    if (r.champion && odds[r.champion]) odds[r.champion][br.reach.length]++;
  }
  for (const v of Object.values(odds)) for (let k = 0; k < v.length; k++) v[k] /= runs;
  return odds;
}

// ── finding the format in an event's stages ──────────────────────────────

interface StageLike {
  name?: string;
  series?: { au?: string | null; bu?: string | null; w?: number; bo?: number; sa?: number | null; sb?: number | null; date?: string }[];
}

const pairsOf = (st: StageLike | undefined): [string, string][] =>
  (st?.series || []).filter((s) => s.au && s.bu).map((s) => [s.au as string, s.bu as string]);
const distinct = (pairs: [string, string][]) => new Set(pairs.flat()).size === pairs.length * 2;

/** The bracket an MSI or First Stand event uses, from its stages, or null when it isn't one of the known formats. */
export function detectBracket(kind: "msi" | "first-stand", stages: StageLike[]): Bracket | null {
  if (kind === "msi") {
    const r1 = pairsOf(stages.find((s) => /^bracket round 1$/i.test(s.name || ""))).slice(0, 4);
    return r1.length === 4 && distinct(r1) ? msiBracket(r1) : null;
  }
  const d1 = pairsOf(stages.find((s) => /^groups day 1$/i.test(s.name || "")));
  const d2 = pairsOf(stages.find((s) => /^groups day 2$/i.test(s.name || "")));
  if (d1.length !== 2 || d2.length !== 2 || !distinct([...d1, ...d2])) return null;
  // a GSL group plays its winners' and losers' matches next: check day 3 or 4 pairs up group A's opening winners
  return gslBracket(d1, d2);
}

/** Every played or scheduled series of the event's bracket and group stages (not the play-in). */
export function realOfStages(stages: StageLike[], kind: "msi" | "first-stand"): RealSeries[] {
  const re = kind === "msi" ? /^(bracket round \d+|finals?)$/i : /^(groups day \d+|semifinals|finals?)$/i;
  return stages
    .filter((st) => re.test(st.name || ""))
    .flatMap((st) => (st.series || []).filter((s) => s.au && s.bu).map((s) => ({ round: 0, a: s.au as string, b: s.bu as string, bo: s.bo || 5, w: s.w || 0, sa: s.sa, sb: s.sb, date: s.date })))
    .sort((x, y) => (x.date || "").localeCompare(y.date || ""));
}
