/**
 * The Worlds page's Swiss stage and knockout pickers (no betting, just picks and chances from the power ratings).
 *
 * Swiss (Worlds 2023 on): 16 teams, 3 wins goes through, 3 losses goes out. Each round pairs teams with the same
 * record and no rematch; a match is best of 1 unless it decides going through or out (a team on 2 wins or 2 losses),
 * then best of 3. Played results and Riot's own draws come from the stats; the rest is the reader's picks, and later
 * rounds are drawn here (seeded, so a "Redraw" gives a new draw and the same seed always gives the same one).
 * Knockouts: the two 3-0 teams meet two 3-2 teams, the other four are paired at random, all best of 5; the 3-0
 * teams start in opposite halves.
 */
import { matchChance, seriesChance, type ChanceAdjust } from "./winChance";

export interface WTeam {
  u: string;
  n: string;
  c: string;
  /** power rating (top-league scale) */
  r: number;
  league: string;
  /** logo from the stats files */
  img?: string;
}

/** A played or scheduled series from the stats: winner 1 = a, 2 = b, 0 = not played yet. */
export interface RealSeries {
  round: number;
  a: string;
  b: string;
  bo: number;
  w: number;
  sa?: number | null;
  sb?: number | null;
  date?: string;
}

export interface WMatch {
  round: number;
  key: string;
  a: string;
  b: string;
  bo: number;
  /** a's chance to win this series */
  p: number;
  /** winner: 1 = a, 2 = b, 0 = not decided */
  w: number;
  /** where the winner came from */
  from: "real" | "pick" | "fill" | "";
  /** Riot's own pairing (from the stats) rather than drawn here */
  drawn: boolean;
  sa?: number | null;
  sb?: number | null;
  date?: string;
}

/** Winner by team page: what the reader picked, keyed by match. */
export type Picks = Record<string, string>;
/** Fills a match nobody picked: return 1 (a), 2 (b) or 0 (leave it). */
export type Fill = (m: WMatch) => number;

export const matchKey = (round: number | string, a: string, b: string) => `${round}:${[a, b].sort().join("|")}`;

/** A small seeded random number generator (mulberry32): the same seed, the same draws. */
export function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(a: T[], rand: () => number): T[] {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/** a's chance to win a best-of-`bo` against b (two leagues meeting count the difference less, like the ratings). */
export function seriesChanceOf(a: WTeam | undefined, b: WTeam | undefined, bo: number, adjust?: ChanceAdjust): number {
  if (!a || !b) return 0.5;
  const p = matchChance(a.r, b.r, a.league === b.league ? "top" : "intl", adjust);
  return bo > 1 ? seriesChance(p, bo, adjust) : p;
}

/** Pairs teams of one record with no rematch where that's possible (else the fewest rematches). */
function pairUp(group: string[], met: Set<string>, rand: () => number): [string, string][] {
  let best: [string, string][] = [];
  let bestRe = Infinity;
  for (let tries = 0; tries < 60 && bestRe > 0; tries++) {
    const order = shuffle(group, rand);
    const pairs: [string, string][] = [];
    let re = 0;
    const left = order.slice();
    while (left.length > 1) {
      const a = left.shift()!;
      let j = left.findIndex((b) => !met.has([a, b].sort().join("|")));
      if (j < 0) {
        j = 0;
        re++;
      }
      pairs.push([a, left.splice(j, 1)[0]]);
    }
    if (re < bestRe) {
      best = pairs;
      bestRe = re;
    }
  }
  return best;
}

export interface SwissResult {
  rounds: WMatch[][];
  /** wins, losses */
  rec: Record<string, [number, number]>;
  /** every team has 3 wins or 3 losses */
  done: boolean;
  /** first round that couldn't be drawn yet (an earlier match isn't decided), or 0 */
  waiting: number;
}

/**
 * Plays the Swiss stage out: real results first, then the reader's picks, then `fill` (favourites, a roll by the
 * chances, a coin flip) for whatever is still open. Later rounds are drawn once every team's previous match is decided.
 */
export function runSwiss(teams: WTeam[], real: RealSeries[], picks: Picks, seed: number, adjust?: ChanceAdjust, fill?: Fill): SwissResult {
  const by = new Map(teams.map((t) => [t.u, t]));
  const rec: Record<string, [number, number]> = Object.fromEntries(teams.map((t) => [t.u, [0, 0] as [number, number]]));
  const met = new Set<string>();
  const rand = rng(seed);
  const rounds: WMatch[][] = [];
  let waiting = 0;
  for (let round = 1; round <= 5; round++) {
    const active = teams.map((t) => t.u).filter((u) => rec[u][0] < 3 && rec[u][1] < 3);
    if (!active.length) break;
    const realHere = real.filter((s) => s.round === round && by.has(s.a) && by.has(s.b));
    const paired = new Set(realHere.flatMap((s) => [s.a, s.b]));
    const toDraw = active.filter((u) => !paired.has(u));
    if (toDraw.length && rounds.some((r) => r.some((m) => !m.w))) {
      waiting = round;
      break;
    }
    // same record, best records first
    const groups = new Map<string, string[]>();
    for (const u of toDraw) {
      const k = rec[u].join("-");
      groups.set(k, [...(groups.get(k) || []), u]);
    }
    const drawn: [string, string][] = [];
    for (const k of [...groups.keys()].sort((x, y) => Number(y.split("-")[0]) - Number(x.split("-")[0]) || Number(x.split("-")[1]) - Number(y.split("-")[1])))
      drawn.push(...pairUp(groups.get(k)!, met, rand));
    const matches: WMatch[] = [];
    const add = (a: string, b: string, bo: number, realS?: RealSeries) => {
      const m: WMatch = {
        round, key: matchKey(round, a, b), a, b, bo, p: seriesChanceOf(by.get(a), by.get(b), bo, adjust),
        w: 0, from: "", drawn: !realS, sa: realS?.sa, sb: realS?.sb, date: realS?.date,
      };
      const pick = picks[m.key];
      if (realS && (realS.w === 1 || realS.w === 2)) {
        m.w = realS.w;
        m.from = "real";
      } else if (pick === a || pick === b) {
        m.w = pick === a ? 1 : 2;
        m.from = "pick";
      } else if (fill) {
        m.w = fill(m);
        if (m.w) m.from = "fill";
      }
      matches.push(m);
    };
    for (const s of realHere) add(s.a, s.b, s.bo || (Math.max(...rec[s.a]) === 2 ? 3 : 1), s);
    for (const [a, b] of drawn) add(a, b, rec[a][0] === 2 || rec[a][1] === 2 ? 3 : 1);
    for (const m of matches) {
      met.add([m.a, m.b].sort().join("|"));
      if (!m.w) continue;
      const [win, lose] = m.w === 1 ? [m.a, m.b] : [m.b, m.a];
      rec[win][0]++;
      rec[lose][1]++;
    }
    rounds.push(matches);
  }
  const done = teams.every((t) => rec[t.u][0] >= 3 || rec[t.u][1] >= 3);
  return { rounds, rec, done, waiting };
}

/** The eight that went through, best record first (3-0, 3-1, 3-2). */
export const qualifiers = (rec: Record<string, [number, number]>) =>
  Object.keys(rec)
    .filter((u) => rec[u][0] >= 3)
    .sort((a, b) => rec[a][1] - rec[b][1]);

export interface KnockoutResult {
  qf: WMatch[];
  sf: WMatch[];
  final: WMatch | null;
  champion: string | null;
}

/**
 * Quarterfinal pairs from the Swiss records (the draw rule), or Riot's own quarterfinals when they're known.
 * Order: QF1 and QF2 meet in semifinal 1, QF3 and QF4 in semifinal 2.
 */
export function quarterPairs(rec: Record<string, [number, number]>, seed: number, realQf: RealSeries[] = []): [string, string][] {
  if (realQf.length === 4) return realQf.map((s) => [s.a, s.b]);
  const q = qualifiers(rec);
  if (q.length !== 8) return [];
  const rand = rng(seed ^ 0x5eed);
  const t30 = shuffle(q.filter((u) => rec[u][1] === 0), rand);
  const t32 = shuffle(q.filter((u) => rec[u][1] === 2), rand);
  const t31 = q.filter((u) => rec[u][1] === 1);
  if (t30.length !== 2 || t32.length < 2) {
    // not the usual 2 / 3 / 3 split: pair at random
    const all = shuffle(q, rand);
    return [[all[0], all[1]], [all[2], all[3]], [all[4], all[5]], [all[6], all[7]]];
  }
  const rest = shuffle([...t31, ...t32.slice(2)], rand);
  return [[t30[0], t32[0]], [rest[0], rest[1]], [t30[1], t32[1]], [rest[2], rest[3]]];
}

/** Plays the knockouts out from the quarterfinal pairs, like runSwiss (real, then picks, then fill). */
export function runKnockout(teams: WTeam[], pairs: [string, string][], real: RealSeries[], picks: Picks, adjust?: ChanceAdjust, fill?: Fill): KnockoutResult {
  const by = new Map(teams.map((t) => [t.u, t]));
  const make = (stage: string, a: string, b: string): WMatch => {
    const r = real.find((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a));
    const m: WMatch = { round: 0, key: matchKey(stage, a, b), a, b, bo: 5, p: seriesChanceOf(by.get(a), by.get(b), 5, adjust), w: 0, from: "", drawn: !r };
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
    return m;
  };
  const winner = (m: WMatch | null) => (m && m.w ? (m.w === 1 ? m.a : m.b) : null);
  const qf = pairs.map(([a, b]) => make("qf", a, b));
  const sf: WMatch[] = [];
  for (const [x, y] of [[0, 1], [2, 3]]) {
    const a = winner(qf[x]);
    const b = winner(qf[y]);
    if (a && b) sf.push(make("sf", a, b));
  }
  const fa = sf.length === 2 ? winner(sf[0]) : null;
  const fb = sf.length === 2 ? winner(sf[1]) : null;
  const final = fa && fb ? make("final", fa, fb) : null;
  return { qf, sf, final, champion: winner(final) };
}

/** Fills: the favourite always wins, a roll by the chances, or a coin flip. */
export const favourites: Fill = (m) => (m.p >= 0.5 ? 1 : 2);
export const roller = (rand: () => number): Fill => (m) => (rand() < m.p ? 1 : 2);
export const coin = (rand: () => number): Fill => () => (rand() < 0.5 ? 1 : 2);

export interface TeamOdds {
  /** went 3-0, went through, went out, reached the semifinals, the final, won Worlds (shares of the runs) */
  r30: number;
  adv: number;
  out: number;
  sf: number;
  final: number;
  win: number;
}

/**
 * Plays the rest of Worlds `runs` times with every open match rolled by its chance (played results stay), and
 * counts how often each team gets how far. With `picks`, the reader's picks are kept fixed too.
 */
export function simulate(teams: WTeam[], real: RealSeries[], realKo: RealSeries[], adjust: ChanceAdjust | undefined, runs = 5000, picks: Picks = {}, seed = 1): Record<string, TeamOdds> {
  const odds: Record<string, TeamOdds> = Object.fromEntries(teams.map((t) => [t.u, { r30: 0, adv: 0, out: 0, sf: 0, final: 0, win: 0 }]));
  const rand = rng(seed);
  const roll = roller(rand);
  for (let i = 0; i < runs; i++) {
    const s = runSwiss(teams, real, picks, Math.floor(rand() * 2 ** 31), adjust, roll);
    for (const t of teams) {
      const [w, l] = s.rec[t.u];
      if (w >= 3) odds[t.u].adv++;
      else odds[t.u].out++;
      if (w >= 3 && l === 0) odds[t.u].r30++;
    }
    const pairs = quarterPairs(s.rec, Math.floor(rand() * 2 ** 31), realKo.filter((x) => x.round === 1));
    if (pairs.length !== 4) continue;
    const k = runKnockout(teams, pairs, realKo, picks, adjust, roll);
    for (const m of k.sf) [m.a, m.b].forEach((u) => odds[u].sf++);
    if (k.final) [k.final.a, k.final.b].forEach((u) => odds[u].final++);
    if (k.champion) odds[k.champion].win++;
  }
  for (const o of Object.values(odds)) for (const key of Object.keys(o) as (keyof TeamOdds)[]) o[key] /= runs;
  return odds;
}

/** A match from Riot's live schedule, with the stats' team pages: w 1 = a won, 2 = b won, 0 = not finished. */
export interface LiveResult {
  a: string;
  b: string;
  w: number;
  sa?: number;
  sb?: number;
  bo: number;
  /** Riot's round name: "Swiss", "Quarterfinals", "Semifinals", "Finals" */
  block: string;
  date: string;
}

const samePair = (s: RealSeries, a: string, b: string) => (s.a === a && s.b === b) || (s.a === b && s.b === a);
function merge(list: RealSeries[], m: LiveResult, round: () => number): RealSeries[] {
  const i = list.findIndex((s) => samePair(s, m.a, m.b) && !(s.w === 1 || s.w === 2));
  const done = list.some((s) => samePair(s, m.a, m.b) && (s.w === 1 || s.w === 2));
  if (done) return list; // the stats have it already
  const flip = (r: RealSeries) => r.a !== m.a;
  if (i >= 0) {
    const r = list[i];
    const w = !m.w ? 0 : flip(r) ? 3 - m.w : m.w;
    const [sa, sb] = flip(r) ? [m.sb, m.sa] : [m.sa, m.sb];
    return list.map((s, k) => (k === i ? { ...s, w, sa: m.w ? sa : s.sa, sb: m.w ? sb : s.sb } : s));
  }
  return [...list, { round: round(), a: m.a, b: m.b, bo: m.bo, w: m.w, sa: m.sa, sb: m.sb, date: m.date }];
}

/**
 * The Swiss series from the stats plus Riot's live schedule: results the next stats build hasn't taken in yet (it
 * lands 30-60 minutes after a game), and the next round's pairings as soon as Riot draws them.
 */
export function withLive(real: RealSeries[], live: LiveResult[]): RealSeries[] {
  let out = real;
  for (const m of live.filter((x) => /swiss/i.test(x.block)).sort((x, y) => x.date.localeCompare(y.date))) {
    // a team's next Swiss round is one more than the rounds it has a series in
    out = merge(out, m, () => 1 + out.filter((s) => s.a === m.a || s.b === m.a).length);
  }
  return out;
}

/** The same for the knockouts (quarterfinals round 1, semifinals 2, final 3). */
export function withLiveKo(real: RealSeries[], live: LiveResult[]): RealSeries[] {
  let out = real;
  for (const m of live.sort((x, y) => x.date.localeCompare(y.date))) {
    const round = /quarter/i.test(m.block) ? 1 : /semi/i.test(m.block) ? 2 : /^finals?$/i.test(m.block.trim()) ? 3 : 0;
    if (round) out = merge(out, m, () => round);
  }
  return out;
}
