/**
 * Monte Carlo simulator projecting Worlds (18 teams), MSI (11 teams) and First Stand (6 teams)
 * fields directly from regional tier-1 Elo standings (hub/ratings.json + Time Machine history).
 */
import type { RatingRow } from "./types";
import { chanceContext, matchChance, seriesChance, type ChanceAdjust } from "./winChance";

export type IntlEventKey = "worlds" | "msi" | "first-stand";

export interface IntlSeedEntry {
  slug: string;
  name: string;
  code: string;
  league: string;
  leagueShort: string;
  seed: number;
  rating: number;
  /** Probability of making Knockout Top 8 (Worlds) or Semifinals Top 4 (MSI / First Stand). */
  topProb: number;
  finProb: number;
  winProb: number;
}

export interface IntlBubbleEntry {
  slug: string;
  name: string;
  code: string;
  league: string;
  leagueShort: string;
  seed: number;
  rating: number;
  cutCode: string;
  gap: number;
}

export interface IntlSimResult {
  event: IntlEventKey;
  trials: number;
  qualifiers: IntlSeedEntry[];
  bubble: IntlBubbleEntry[];
}

const REGIONS = ["LCK", "LPL", "LEC", "LCS", "LCP", "CBLOL"] as const;
const EVENT_SLOTS: Record<IntlEventKey, Record<(typeof REGIONS)[number], number>> = {
  worlds: { LCK: 4, LPL: 4, LEC: 3, LCS: 3, LCP: 3, CBLOL: 1 },
  msi: { LCK: 2, LPL: 2, LEC: 2, LCS: 2, LCP: 2, CBLOL: 1 },
  "first-stand": { LCK: 1, LPL: 1, LEC: 1, LCS: 1, LCP: 1, CBLOL: 1 },
};

const LEAGUE_TO_SHORT: Record<string, (typeof REGIONS)[number]> = {
  "lol-champions-korea": "LCK",
  "tencent-lol-pro-league": "LPL",
  "lol-emea-championship": "LEC",
  "league-of-legends-championship-series": "LCS",
  "league-of-legends-championship-pacific": "LCP",
  "circuit-brazilian-league-of-legends": "CBLOL",
  "lol champions korea": "LCK",
  "tencent lol pro league": "LPL",
  "lol emea championship": "LEC",
  "league of legends championship series": "LCS",
  "league of legends championship pacific": "LCP",
  "circuit brazilian league of legends": "CBLOL",
};

function regionOf(r: RatingRow): (typeof REGIONS)[number] | null {
  const s = (r[10] || "").trim().toUpperCase();
  if ((REGIONS as readonly string[]).includes(s)) return s as (typeof REGIONS)[number];
  const l = (r[4] || r[3] || "").trim().toLowerCase();
  return LEAGUE_TO_SHORT[l] || null;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateInternationalField(
  teams: RatingRow[],
  event: IntlEventKey,
  adjust?: ChanceAdjust,
  trials = 2000,
): IntlSimResult {
  const slots = EVENT_SLOTS[event];
  const byReg = new Map<(typeof REGIONS)[number], RatingRow[]>();
  for (const reg of REGIONS) byReg.set(reg, []);
  for (const r of teams) {
    if (r[9] !== 1) continue;
    const reg = regionOf(r);
    if (reg) byReg.get(reg)!.push(r);
  }

  const picked: { row: RatingRow; reg: (typeof REGIONS)[number]; seed: number }[] = [];
  const bubble: IntlBubbleEntry[] = [];
  for (const reg of REGIONS) {
    const sorted = byReg
      .get(reg)!
      .slice()
      .sort((a, b) => b[5] - a[5] || a[1].localeCompare(b[1]));
    const count = slots[reg];
    const inField = sorted.slice(0, count);
    inField.forEach((row, i) => picked.push({ row, reg, seed: i + 1 }));
    const cutRow = inField[inField.length - 1];
    const outRow = sorted[count];
    if (cutRow && outRow) {
      bubble.push({
        slug: outRow[0],
        name: outRow[1],
        code: outRow[2] || outRow[1],
        league: outRow[3],
        leagueShort: reg,
        seed: count + 1,
        rating: outRow[5],
        cutCode: cutRow[2] || cutRow[1],
        gap: Math.max(0, Math.round(cutRow[5] - outRow[5])),
      });
    }
  }
  bubble.sort((a, b) => a.gap - b.gap || b.rating - a.rating);

  const n = picked.length;
  if (n < 2) return { event, trials, qualifiers: [], bubble };

  // Sort qualifiers globally by Elo descending for seeding (worlds Swiss direct slots / bracket seeds)
  picked.sort((a, b) => b.row[5] - a.row[5] || a.row[1].localeCompare(b.row[1]));

  const pBo1 = Array.from({ length: n }, () => new Float64Array(n));
  const pBo3 = Array.from({ length: n }, () => new Float64Array(n));
  const pBo5 = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ra = picked[i].row;
      const rb = picked[j].row;
      const ctx = chanceContext(true, true, ra[3], rb[3]);
      const g = matchChance(ra[5], rb[5], ctx, adjust);
      const b3 = seriesChance(g, 3, adjust);
      const b5 = seriesChance(g, 5, adjust);
      pBo1[i][j] = g;
      pBo1[j][i] = 1 - g;
      pBo3[i][j] = b3;
      pBo3[j][i] = 1 - b3;
      pBo5[i][j] = b5;
      pBo5[j][i] = 1 - b5;
    }
  }

  let seedHash = event === "worlds" ? 0x13579bdf : event === "msi" ? 0x2468ace0 : 0x55aa33cc;
  for (let i = 0; i < n; i++) seedHash = (seedHash * 33 + Math.round(picked[i].row[5])) | 0;
  const rng = mulberry32(seedHash);

  const play = (a: number, b: number, table: Float64Array[]): number => (rng() < table[a][b] ? a : b);
  const topHits = new Int32Array(n);
  const finHits = new Int32Array(n);
  const winHits = new Int32Array(n);

  const playKo8 = (seeds8: number[], recordTop: boolean) => {
    if (seeds8.length < 2) return;
    // Standard 8-team halves: (#0 vs #7), (#3 vs #4) | (#1 vs #6), (#2 vs #5)
    const qfPairs: [number, number][] =
      seeds8.length >= 8
        ? [
            [seeds8[0], seeds8[7]],
            [seeds8[3], seeds8[4]],
            [seeds8[1], seeds8[6]],
            [seeds8[2], seeds8[5]],
          ]
        : [
            [seeds8[0], seeds8[seeds8.length - 1]],
            [seeds8[1], seeds8[Math.min(2, seeds8.length - 1)]],
          ];
    const sfTeams = qfPairs.map(([a, b]) => play(a, b, pBo5));
    if (recordTop) for (const idx of sfTeams) topHits[idx]++;
    if (sfTeams.length >= 4) {
      const f1 = play(sfTeams[0], sfTeams[1], pBo5);
      const f2 = play(sfTeams[2], sfTeams[3], pBo5);
      finHits[f1]++;
      finHits[f2]++;
      winHits[play(f1, f2, pBo5)]++;
    } else if (sfTeams.length >= 2) {
      finHits[sfTeams[0]]++;
      finHits[sfTeams[1]]++;
      winHits[play(sfTeams[0], sfTeams[1], pBo5)]++;
    }
  };

  for (let t = 0; t < trials; t++) {
    if (event === "worlds") {
      // 18 qualifiers: top 14 enter Swiss directly, #15 vs #18 & #16 vs #17 play Bo5 Play-Ins
      const swissPool: number[] = [];
      for (let i = 0; i < Math.min(14, n); i++) swissPool.push(i);
      if (n >= 18) {
        swissPool.push(play(14, 17, pBo5));
        swissPool.push(play(15, 16, pBo5));
      } else {
        for (let i = 14; i < n; i++) swissPool.push(i);
      }
      const w = new Int8Array(n);
      const l = new Int8Array(n);
      const met = new Int32Array(n);
      const tier30: number[] = [];
      const tier31: number[] = [];
      const tier32: number[] = [];

      for (let rd = 0; rd < 5; rd++) {
        const active = swissPool.filter((idx) => w[idx] < 3 && l[idx] < 3);
        if (active.length < 2) break;
        active.sort((a, b) => w[b] - w[a] || l[a] - l[b] || picked[b].row[5] - picked[a].row[5]);
        // Group roughly by win-loss diff with shuffled tie-order inside same record
        const pairs: [number, number][] = [];
        const used = new Uint8Array(n);
        for (let i = 0; i < active.length; i++) {
          const a = active[i];
          if (used[a]) continue;
          let partnerIdx = -1;
          for (let j = i + 1; j < active.length; j++) {
            const cand = active[j];
            if (used[cand]) continue;
            if (partnerIdx < 0) partnerIdx = j;
            if (w[cand] === w[a] && l[cand] === l[a] && (met[a] & (1 << swissPool.indexOf(cand))) === 0) {
              partnerIdx = j;
              break;
            }
          }
          if (partnerIdx >= 0) {
            const b = active[partnerIdx];
            used[a] = 1;
            used[b] = 1;
            pairs.push([a, b]);
          }
        }
        for (const [a, b] of pairs) {
          const ia = swissPool.indexOf(a);
          const ib = swissPool.indexOf(b);
          if (ia >= 0 && ib >= 0) {
            met[a] |= 1 << ib;
            met[b] |= 1 << ia;
          }
          const decider = w[a] === 2 || l[a] === 2 || w[b] === 2 || l[b] === 2;
          const winner = play(a, b, decider ? pBo3 : pBo1);
          const loser = winner === a ? b : a;
          w[winner]++;
          l[loser]++;
          if (w[winner] === 3) {
            topHits[winner]++;
            if (l[winner] === 0) tier30.push(winner);
            else if (l[winner] === 1) tier31.push(winner);
            else tier32.push(winner);
          }
        }
      }
      // Build 8-team knockout bracket: the two 3-0 seeds sit on opposite halves and draw 3-2 teams
      const adv = [...tier30, ...tier31, ...tier32];
      if (adv.length >= 8) {
        const qfOrder = [
          adv[0], adv[1], adv[4], adv[2],
          adv[3], adv[5], adv[7], adv[6],
        ];
        playKo8(qfOrder, false);
      } else {
        playKo8(adv, false);
      }
    } else if (event === "msi") {
      // 11 qualifiers: top 5 direct to Top 8; #6 vs #11, #7 vs #10, #8 vs #9 play Bo5 Play-Ins
      const top8: number[] = [];
      for (let i = 0; i < Math.min(5, n); i++) top8.push(i);
      if (n >= 11) {
        top8.push(play(5, 10, pBo5));
        top8.push(play(6, 9, pBo5));
        top8.push(play(7, 8, pBo5));
      } else {
        for (let i = 5; i < n; i++) top8.push(i);
      }
      top8.sort((a, b) => a - b);
      playKo8(top8, true);
    } else {
      // First Stand (6 #1 seeds): single Bo3 round robin -> top 4 play Bo5 SF -> Final
      const wins = new Int8Array(n);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          wins[play(i, j, pBo3)]++;
        }
      }
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => wins[b] - wins[a] || a - b);
      const top4 = order.slice(0, 4);
      for (const idx of top4) topHits[idx]++;
      if (top4.length >= 4) {
        const f1 = play(top4[0], top4[3], pBo5);
        const f2 = play(top4[1], top4[2], pBo5);
        finHits[f1]++;
        finHits[f2]++;
        winHits[play(f1, f2, pBo5)]++;
      } else if (top4.length >= 2) {
        finHits[top4[0]]++;
        finHits[top4[1]]++;
        winHits[play(top4[0], top4[1], pBo5)]++;
      }
    }
  }

  const qualifiers: IntlSeedEntry[] = picked.map((p, i) => ({
    slug: p.row[0],
    name: p.row[1],
    code: p.row[2] || p.row[1],
    league: p.row[3],
    leagueShort: p.reg,
    seed: p.seed,
    rating: p.row[5],
    topProb: topHits[i] / trials,
    finProb: finHits[i] / trials,
    winProb: winHits[i] / trials,
  }));
  qualifiers.sort((a, b) => b.winProb - a.winProb || b.finProb - a.finProb || b.topProb - a.topProb || b.rating - a.rating);
  return { event, trials, qualifiers, bubble };
}
