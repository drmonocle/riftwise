/**
 * Win chances from the power ratings (same formulas as scripts/stats/ratings.py): the chance for one game, and from
 * that the chance to take a best-of-3 or best-of-5. Ratings are on the top-league scale; ratings.json "adjust" says
 * how much a difference counts between teams from different leagues (they meet at international events, where
 * games are more open) and below the top leagues, and how much less certain a whole series is than its games
 * multiplied out. All of it is calibrated on past games and series (see the Rankings page).
 */
import type { HubRatings } from "./types";

export type ChanceAdjust = HubRatings["adjust"];
export type ChanceContext = "top" | "intl" | "other";

/** Chance that a team rated `ra` beats one rated `rb` in one game (`scale`: how much the difference counts). */
export const gameChance = (ra: number, rb: number, scale = 1) =>
  1 / (1 + 10 ** (((rb - ra) * scale) / 400));

/** Which calibration a match uses: two top-league teams from one league, from two leagues, or anything else. */
export function chanceContext(topA: boolean, topB: boolean, leagueA: string | null | undefined, leagueB: string | null | undefined): ChanceContext {
  if (!topA || !topB) return "other";
  return leagueA === leagueB ? "top" : "intl";
}

/** One-game chance for a match between two rated teams, with the calibration for its context. */
export const matchChance = (ra: number, rb: number, ctx: ChanceContext, adjust?: ChanceAdjust) =>
  gameChance(ra, rb, ctx === "top" ? 1 : (adjust?.[ctx] ?? 1));

/** Chance to win a best-of-`bo` series when each game is won with chance p (adjusted like past series held up). */
export function seriesChance(p: number, bo: number, adjust?: ChanceAdjust): number {
  const c = bo > 1 ? (adjust?.series?.[String(bo)] ?? 1) : 1;
  const q = 0.5 + (p - 0.5) * c;
  const need = Math.floor(bo / 2) + 1;
  let total = 0;
  for (let k = 0; k < need; k++)
    total += choose(need - 1 + k, k) * q ** need * (1 - q) ** k;
  return total;
}

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
