/**
 * RiftWise player rating (1.0): how well one player played one game, 0-10 (6 is an average game). The same sum as
 * scripts/stats/player_rating.py, with the weights, scale and role-year averages the stats build writes to
 * hub/rating.json: kill participation, share of the team's damage, gold and vision, CS per minute and deaths per
 * minute, each against the same role that year, then half a point for a win (off for a loss).
 */
import { load } from "../stats";

type Comp = "kp" | "ds" | "gs" | "cs" | "vs" | "dpm";

export interface RatingFile {
  v: number;
  built: string;
  w: Record<Comp, number>;
  win: number;
  scale: number;
  /** "<year>|<role>" and "all|<role>" -> component -> [average, spread] */
  base: Record<string, Partial<Record<Comp, [number, number]>>>;
}

let file: Promise<RatingFile | null> | null = null;
/** hub/rating.json, once (null with a build from before 0.7.54) */
export const loadRatingFile = (): Promise<RatingFile | null> => {
  if (!file) file = load<RatingFile>("hub/rating.json").catch(() => null);
  return file;
};

/** One player's game: the numbers the rating needs (null where the scoreboard doesn't have them). */
export interface RatedLine {
  year: string;
  role: string;
  won: boolean;
  k: number;
  d: number;
  a: number;
  cs?: number | null;
  gold?: number | null;
  dmg?: number | null;
  vision?: number | null;
  min?: number | null;
  teamK?: number | null;
  teamDmg?: number | null;
  teamGold?: number | null;
  teamVision?: number | null;
}

function parts(x: RatedLine): Record<Comp, number | null> {
  const has = (v: number | null | undefined): v is number => v != null;
  return {
    kp: x.teamK ? (x.k + x.a) / x.teamK : null,
    ds: has(x.dmg) && x.teamDmg ? x.dmg / x.teamDmg : null,
    gs: has(x.gold) && x.teamGold ? x.gold / x.teamGold : null,
    cs: has(x.cs) && x.min ? x.cs / x.min : null,
    vs: has(x.vision) && x.teamVision ? x.vision / x.teamVision : null,
    dpm: x.min ? x.d / x.min : null,
  };
}

/** The rating, 0-10 with one decimal, or null (no role, no averages for it, too few numbers). */
export function rateLine(x: RatedLine, f: RatingFile): number | null {
  if (!x.role) return null;
  const byYear = f.base[`${x.year}|${x.role}`] || {};
  const every = f.base[`all|${x.role}`] || {};
  let total = 0;
  let wsum = 0;
  for (const [c, v] of Object.entries(parts(x)) as [Comp, number | null][]) {
    const ms = byYear[c] || every[c];
    if (v == null || !ms || !ms[1]) continue;
    const z = Math.max(-3, Math.min(3, (v - ms[0]) / ms[1]));
    total += f.w[c] * z;
    wsum += Math.abs(f.w[c]);
  }
  if (wsum < 0.5) return null;
  const r = 6 + f.scale * (total / wsum) + (x.won ? f.win : -f.win);
  // one decimal (Python rounds an exact half to even: the two can differ by 0.1 on such a game, nowhere else)
  return Math.round(Math.max(0, Math.min(10, r)) * 10) / 10;
}

/** The normal curve's share below z (for turning an average z-score into a 0-100 percentile). */
function phi(z: number): number {
  // Abramowitz & Stegun 7.1.26, good to 1e-7
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** The rating's parts as a profile: for each, how a player's games compare with their role's (0-100, 50 = the
 *  role's average; deaths turned round, so 100 is the hardest to kill). null when no game could be rated. */
export const PROFILE_AXES: Comp[] = ["kp", "ds", "gs", "cs", "vs", "dpm"];
export function profile(lines: RatedLine[], f: RatingFile): (number | null)[] | null {
  const sum: Record<Comp, [number, number]> = { kp: [0, 0], ds: [0, 0], gs: [0, 0], cs: [0, 0], vs: [0, 0], dpm: [0, 0] };
  for (const x of lines) {
    if (!x.role) continue;
    const byYear = f.base[`${x.year}|${x.role}`] || {};
    const every = f.base[`all|${x.role}`] || {};
    for (const [c, v] of Object.entries(parts(x)) as [Comp, number | null][]) {
      const ms = byYear[c] || every[c];
      if (v == null || !ms || !ms[1]) continue;
      sum[c][0] += (v - ms[0]) / ms[1];
      sum[c][1] += 1;
    }
  }
  if (!PROFILE_AXES.some((c) => sum[c][1])) return null;
  return PROFILE_AXES.map((c) => (sum[c][1] ? Math.round(phi((c === "dpm" ? -1 : 1) * (sum[c][0] / sum[c][1])) * 100) : null));
}

/** The Stats tab's game log row (hub/playergames) as a rated line. */
export function playerRowLine(r: (string | number | null | undefined | unknown)[]): RatedLine {
  const n = (i: number) => (typeof r[i] === "number" ? (r[i] as number) : null);
  return {
    year: String(r[0] || "").slice(0, 4),
    role: String(r[10] || ""),
    won: r[6] === 1,
    k: n(3) || 0,
    d: n(4) || 0,
    a: n(5) || 0,
    cs: n(12),
    gold: n(13),
    dmg: n(14),
    vision: n(15),
    min: n(16),
    teamK: n(17),
    teamDmg: n(18),
    teamGold: n(19),
    teamVision: n(20),
  };
}
