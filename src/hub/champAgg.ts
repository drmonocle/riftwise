/**
 * Champion numbers for a league / year, narrowed by tournament, patch, side and role, from the champion game log
 * (hub/champgames). Includes draft-order numbers gol.gg users look for: blind-pick rate and blue-side first picks.
 */
import type { ChampGame } from "./types";

export const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const ROLE_ALIASES: Record<string, string> = {
  top: "Top",
  toplane: "Top",
  jg: "Jungle",
  jng: "Jungle",
  jung: "Jungle",
  jungle: "Jungle",
  jungler: "Jungle",
  mid: "Mid",
  middle: "Mid",
  midlane: "Mid",
  bot: "Bot",
  bottom: "Bot",
  adc: "Bot",
  ad: "Bot",
  marksman: "Bot",
  carry: "Bot",
  sup: "Support",
  supp: "Support",
  support: "Support",
  utility: "Support",
};
/** Normalize a role URL parameter or shorthand ("adc" -> "Bot", "sup" -> "Support", "jg" -> "Jungle", "mid" -> "Mid"). */
export function normalizeRole(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (ROLES.includes(trimmed)) return trimmed;
  return ROLE_ALIASES[trimmed.toLowerCase()] || "";
}
/** overall draft position of each team's 1st..5th pick */
const PICK_POS = { b: [1, 4, 5, 8, 9], r: [2, 3, 6, 7, 10] };

export interface ChampFilter {
  event?: number | Set<number>; // index (or set of stage indices) in the file's event list; undefined = all
  patch?: string;
  side?: "b" | "r";
  role?: number; // 0-4; undefined = all roles
}

/** Match an event slug (or whole-event parent slug like "lec-2024-winter") against a champgames `events` list. */
export function matchEventIndices(
  events: [string, string][],
  rawSlug: string | null | undefined,
  canonSlug?: string,
): number | Set<number> | null {
  if (!rawSlug) return null;
  const slug = canonSlug || rawSlug;
  const exact = events.findIndex(([s]) => s === slug || s === rawSlug);
  if (exact >= 0) return exact;
  const prefix = slug + "-";
  const rawPrefix = rawSlug + "-";
  const indices: number[] = [];
  events.forEach(([s], idx) => {
    if (s.startsWith(prefix) || s.startsWith(rawPrefix)) indices.push(idx);
  });
  return indices.length === 1 ? indices[0] : indices.length > 1 ? new Set(indices) : null;
}

/** Human-readable label for a matched stage or whole-event parent across `events`. */
export function matchedEventLabel(
  events: [string, string][],
  match: number | Set<number> | null,
  fallbackSlug?: string | null,
): string | null {
  if (match == null) return null;
  if (typeof match === "number") return events[match]?.[1] || fallbackSlug || null;
  const names = [...match].map((i) => events[i]?.[1]).filter(Boolean);
  if (names.length) {
    const words = names[0].split(/\s+/);
    let len = words.length;
    for (const n of names.slice(1)) {
      const nw = n.split(/\s+/);
      let j = 0;
      while (j < len && j < nw.length && words[j].toLowerCase() === nw[j].toLowerCase()) j++;
      len = j;
    }
    const common = words.slice(0, len).join(" ").replace(/[-:–—\s]+$/, "");
    if (common) return common;
  }
  return fallbackSlug || null;
}

export interface ChampAggRow {
  c: string;
  role: number; // most played role (-1 unknown)
  p: number;
  w: number;
  b: number;
  presence: number;
  wr: number | null;
  kda: number | null;
  /** share of picks made before the enemy laner was picked (draft order known, both roles known) */
  blind: number | null;
  /** picked first in the draft (blue side's first pick) */
  fp: number;
  csm: number | null;
  gpm: number | null;
  dpm: number | null;
  blueP: number;
  redP: number;
}

export function champAgg(games: ChampGame[], f: ChampFilter): { games: number; rows: ChampAggRow[] } {
  type Acc = {
    p: number; w: number; b: number; k: number; d: number; a: number; ks: number; cs: number; gold: number; dmg: number; min: number;
    blindN: number; blindD: number; fp: number; roles: number[]; blueP: number; redP: number;
    /** picks in any role (a role view scales the champion's bans by its share of picks in that role) */
    allP: number;
    /** games it was picked or banned in (once per game) */
    pres: number;
  };
  const acc = new Map<string, Acc>();
  const get = (c: string): Acc => {
    let x = acc.get(c);
    if (!x) {
      x = { p: 0, w: 0, b: 0, k: 0, d: 0, a: 0, ks: 0, cs: 0, gold: 0, dmg: 0, min: 0, blindN: 0, blindD: 0, fp: 0, roles: [0, 0, 0, 0, 0], blueP: 0, redP: 0, allP: 0, pres: 0 };
      acc.set(c, x);
    }
    return x;
  };
  let n = 0;
  for (const g of games) {
    const [, patch, ev, blueWon, min, bp, rp, bb, rb, ordered] = g;
    if (f.event !== undefined && (typeof f.event === "number" ? ev !== f.event : !f.event.has(ev))) continue;
    if (f.patch && patch !== f.patch) continue;
    n++;
    // a champion counts once per game for presence (blind-pick mirrors, a ban written twice)
    const present = new Set<string>();
    const pickedHere = new Set([...bp, ...rp].map((x) => x[0]));
    const sides: ["b" | "r", typeof bp, typeof bb, typeof rp][] = [
      ["b", bp, bb, rp],
      ["r", rp, rb, bp],
    ];
    for (const [side, picks, bans, enemy] of sides) {
      if (f.side && f.side !== side) continue;
      const won = side === "b" ? blueWon : 1 - blueWon;
      picks.forEach((pk, i) => {
        const [c, role, k, d, a, cs, gold, dmg] = pk;
        get(c).allP++;
        if (f.role !== undefined && role !== f.role) return;
        const x = get(c);
        present.add(c);
        x.p++;
        x.w += won;
        if (side === "b") x.blueP++;
        else x.redP++;
        if (role >= 0) x.roles[role]++;
        if (k != null && d != null && a != null) {
          x.k += k;
          x.d += d;
          x.a += a;
          x.ks++;
        }
        if (min && cs != null && gold != null && dmg != null) {
          x.cs += cs;
          x.gold += gold;
          x.dmg += dmg;
          x.min += min;
        }
        if (ordered && role >= 0) {
          const j = enemy.findIndex((e) => e[1] === role);
          if (j >= 0) {
            x.blindD++;
            if (PICK_POS[side][i] < PICK_POS[side === "b" ? "r" : "b"][j]) x.blindN++;
          }
        }
        if (ordered && side === "b" && i === 0) x.fp++;
      });
      for (const c of new Set(bans)) {
        if (pickedHere.has(c)) continue;
        get(c).b++;
        if (f.role === undefined) present.add(c);
      }
    }
    for (const c of present) get(c).pres++;
  }
  const rows: ChampAggRow[] = [];
  for (const [c, x] of acc) {
    if (f.role !== undefined && x.p === 0) continue; // a role view lists champions played in that role
    const role = x.roles.some((v) => v > 0) ? x.roles.indexOf(Math.max(...x.roles)) : -1;
    // in a role view a ban counts by the champion's share of picks in that role (a top laner flexed to support
    // once isn't 80% present among supports)
    const b = f.role !== undefined ? (x.allP ? Math.round((x.b * x.p) / x.allP) : 0) : x.b;
    rows.push({
      c,
      role,
      p: x.p,
      w: x.w,
      b,
      presence: n ? Math.min(1, (f.role !== undefined ? x.pres + b : x.pres) / n) : 0,
      wr: x.p ? x.w / x.p : null,
      kda: x.ks ? Number(((x.k + x.a) / Math.max(x.d, 1)).toFixed(2)) : null,
      blind: x.blindD ? x.blindN / x.blindD : null,
      fp: x.fp,
      csm: x.min ? Number((x.cs / x.min).toFixed(1)) : null,
      gpm: x.min ? Math.round(x.gold / x.min) : null,
      dpm: x.min ? Math.round(x.dmg / x.min) : null,
      blueP: x.blueP,
      redP: x.redP,
    });
  }
  rows.sort((a, b) => b.presence - a.presence);
  return { games: n, rows };
}

/** "26.18" > "26.9" > "25.20" */
export function patchCompare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
}
