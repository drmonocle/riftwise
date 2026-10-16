/**
 * Win chances from the power ratings (same formulas as scripts/stats/ratings.py): Elo's chance for one game, and
 * from that the chance to take a best-of-3 or best-of-5.
 */

/** Chance that a team rated `ra` beats one rated `rb` in one game. */
export const gameChance = (ra: number, rb: number) =>
  1 / (1 + 10 ** ((rb - ra) / 400));

/** Chance to win a best-of-`bo` series when each game is won with chance p. */
export function seriesChance(p: number, bo: number): number {
  const need = Math.floor(bo / 2) + 1;
  let total = 0;
  for (let k = 0; k < need; k++)
    total += choose(need - 1 + k, k) * p ** need * (1 - p) ** k;
  return total;
}

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
