/**
 * Pro champion duo synergy engine: computes 2v2 and role-pair win rates, expected win rates (solo baselines
 * adjusted for side win rate), synergy lift, Bayesian rank score, combined GD@15, and top pro duos from
 * hub/champgames/<league>/<year>.json.
 */
import { tk } from "../i18n";
import { matchesChampSearch, sameChamp } from "./data";
import type { ChampGame, ChampPick } from "./types";

export type RolePairKey = "all" | "mid-jg" | "bot-sup" | "top-jg" | "jg-sup" | "mid-bot" | "top-mid";

export const ROLE_PAIRS: { key: RolePairKey; roles: [number, number]; label: string }[] = [
  { key: "all", roles: [-1, -1], label: tk("All role pairs") },
  { key: "mid-jg", roles: [2, 1], label: "Mid + Jungle" },
  { key: "bot-sup", roles: [3, 4], label: "Bot + Support" },
  { key: "top-jg", roles: [0, 1], label: "Top + Jungle" },
  { key: "jg-sup", roles: [1, 4], label: "Jungle + Support" },
  { key: "mid-bot", roles: [2, 3], label: "Mid + Bot" },
  { key: "top-mid", roles: [0, 2], label: "Top + Mid" },
];

export interface DuoSource {
  games: ChampGame[];
  event?: number | Set<number> | null;
}

export interface DuoSynergyRow {
  a: string;
  roleA: number;
  b: string;
  roleB: number;
  g: number;
  w: number;
  wr: number;
  wrA: number;
  wrB: number;
  expWr: number;
  lift: number;
  score: number;
  gd15: number | null;
  gdGames: number;
  topPair: {
    players: [string, string];
    slugs: [string | null, string | null];
    team: string | null;
    teamSlug: string | null;
    g: number;
    w: number;
  } | null;
}

export interface DuoComputeOpts {
  patch?: string;
  side?: "b" | "r";
  pair?: RolePairKey;
  champ?: string;
  withChamp?: string;
  minGames?: number;
}

interface PairAcc {
  a: string;
  roleA: number;
  b: string;
  roleB: number;
  g: number;
  w: number;
  gdSum: number;
  gdN: number;
  players: Map<
    string,
    {
      players: [string, string];
      slugs: [string | null, string | null];
      team: string | null;
      teamSlug: string | null;
      g: number;
      w: number;
    }
  >;
}

export function computeDuoSynergy(
  sources: DuoSource[],
  opts?: DuoComputeOpts,
): { totalGames: number; rows: DuoSynergyRow[] } {
  const pairKey: RolePairKey = opts?.pair || "all";
  const pairDef = ROLE_PAIRS.find((p) => p.key === pairKey) || ROLE_PAIRS[0];
  const [pA, pB] = pairDef.roles;
  const anchor = (opts?.champ || "").trim();
  const withQ = (opts?.withChamp || "").trim();
  const minGames = Math.max(1, opts?.minGames ?? 3);

  const soloAcc = new Map<string, [number, number]>();
  const duos = new Map<string, PairAcc>();
  let totalGames = 0;
  let sideLineups = 0;
  let sideWins = 0;

  const wMatch = (c: string) => matchesChampSearch(c, withQ) || sameChamp(c, withQ);

  for (const src of sources) {
    const evFilter = src.event;
    for (const g of src.games) {
      const [, patch, ev, blueWon, , bp, rp, , , , blueTeam, redTeam, blueSlug, redSlug] = g;
      if (evFilter != null && (typeof evFilter === "number" ? ev !== evFilter : !evFilter.has(ev))) continue;
      if (opts?.patch && patch !== opts.patch) continue;
      totalGames += 1;

      const sides: ["b" | "r", ChampPick[], number, string | null, string | null][] = [
        ["b", bp, blueWon === 1 ? 1 : 0, blueTeam || null, blueSlug || null],
        ["r", rp, blueWon === 0 ? 1 : 0, redTeam || null, redSlug || null],
      ];

      for (const [side, picks, won, teamName, teamSlug] of sides) {
        if (opts?.side && opts.side !== side) continue;
        sideLineups += 1;
        sideWins += won;

        for (const pk of picks) {
          if (!pk[0] || pk[1] < 0) continue;
          const sk = `${pk[0]}\0${pk[1]}`;
          const cur = soloAcc.get(sk) || [0, 0];
          cur[0] += 1;
          cur[1] += won;
          soloAcc.set(sk, cur);
        }

        for (let i = 0; i < picks.length; i++) {
          const pk1 = picks[i];
          if (!pk1[0] || pk1[1] < 0) continue;
          for (let j = i + 1; j < picks.length; j++) {
            const pk2 = picks[j];
            if (!pk2[0] || pk2[1] < 0 || pk1[0] === pk2[0]) continue;

            if (pairKey !== "all") {
              const ok = (pk1[1] === pA && pk2[1] === pB) || (pk1[1] === pB && pk2[1] === pA);
              if (!ok) continue;
            }

            let first = pk1;
            let second = pk2;

            if (anchor) {
              const m1 = sameChamp(pk1[0], anchor);
              const m2 = sameChamp(pk2[0], anchor);
              if (!m1 && !m2) continue;
              if (m2 && !m1) {
                first = pk2;
                second = pk1;
              }
            } else if (pairKey !== "all") {
              if (pk1[1] === pB && pk2[1] === pA) {
                first = pk2;
                second = pk1;
              }
            } else if (pk1[1] > pk2[1] || (pk1[1] === pk2[1] && pk1[0] > pk2[0])) {
              first = pk2;
              second = pk1;
            }

            if (withQ) {
              const matched = anchor ? wMatch(second[0]) : wMatch(first[0]) || wMatch(second[0]);
              if (!matched) continue;
            }

            const key = `${first[0]}\0${first[1]}\0${second[0]}\0${second[1]}`;
            let acc = duos.get(key);
            if (!acc) {
              acc = {
                a: first[0],
                roleA: first[1],
                b: second[0],
                roleB: second[1],
                g: 0,
                w: 0,
                gdSum: 0,
                gdN: 0,
                players: new Map(),
              };
              duos.set(key, acc);
            }
            acc.g += 1;
            acc.w += won;

            const gd1 = first[10];
            const gd2 = second[10];
            if (gd1 != null && gd2 != null) {
              acc.gdSum += gd1 + gd2;
              acc.gdN += 1;
            }

            const pl1 = first[8];
            const pl2 = second[8];
            if (pl1 && pl2) {
              const pKey = `${pl1}\0${pl2}\0${teamSlug || teamName || ""}`;
              let pAcc = acc.players.get(pKey);
              if (!pAcc) {
                pAcc = {
                  players: [pl1, pl2],
                  slugs: [first[9] ?? null, second[9] ?? null],
                  team: teamName,
                  teamSlug,
                  g: 0,
                  w: 0,
                };
                acc.players.set(pKey, pAcc);
              }
              pAcc.g += 1;
              pAcc.w += won;
            }
          }
        }
      }
    }
  }

  const baselineWr = sideLineups > 0 ? sideWins / sideLineups : 0.5;
  const rows: DuoSynergyRow[] = [];

  for (const acc of duos.values()) {
    if (acc.g < minGames) continue;
    const sA = soloAcc.get(`${acc.a}\0${acc.roleA}`) || [acc.g, acc.w];
    const sB = soloAcc.get(`${acc.b}\0${acc.roleB}`) || [acc.g, acc.w];
    const wr = acc.w / acc.g;
    const wrA = sA[0] > 0 ? sA[1] / sA[0] : wr;
    const wrB = sB[0] > 0 ? sB[1] / sB[0] : wr;
    const expWr = Math.max(0.05, Math.min(0.95, wrA + wrB - baselineWr));
    const lift = wr - expWr;
    const score = expWr + (acc.g / (acc.g + 8)) * lift + 0.015 * Math.log10(Math.max(1, acc.g));

    let topPair: DuoSynergyRow["topPair"] = null;
    for (const p of acc.players.values()) {
      if (!topPair || p.g > topPair.g || (p.g === topPair.g && p.w > topPair.w)) {
        topPair = p;
      }
    }

    rows.push({
      a: acc.a,
      roleA: acc.roleA,
      b: acc.b,
      roleB: acc.roleB,
      g: acc.g,
      w: acc.w,
      wr,
      wrA,
      wrB,
      expWr,
      lift,
      score,
      gd15: acc.gdN > 0 ? Math.round(acc.gdSum / acc.gdN) : null,
      gdGames: acc.gdN,
      topPair,
    });
  }

  rows.sort((a, b) => b.score - a.score || b.g - a.g || b.w - a.w);
  return { totalGames, rows };
}
