/**
 * Stats for any stretch of time, worked out in the browser from a player's or team's game log
 * (hub/playergames, hub/teamgames): all time, the last N games, a year, or one tournament. This is what
 * gol.gg's season / split selectors do, without a request per choice.
 */
import type { PlayerGameRow, PlayerTimeline, TeamGameRow, TeamTimeline } from "./types";

/** "all", "last20", "y2026", "p:26.18", "e:<event slug>" */
export type PeriodKey = string;

export interface PeriodOption {
  key: PeriodKey;
  /** year, patch or tournament name; the "all" / "last N" labels are translated by the picker */
  label: string;
  group: "basic" | "year" | "patch" | "event";
}

const LAST = [10, 20, 50];

/** Choices for a game log (newest first): all time, last N games, every year, recent patches, the tournaments played. */
export function periodOptions(rows: { date: string; e: string; en: string; patch?: string | null }[], maxEvents = 60): PeriodOption[] {
  const out: PeriodOption[] = [{ key: "all", label: "all", group: "basic" }];
  for (const n of LAST) if (rows.length > n) out.push({ key: `last${n}`, label: String(n), group: "basic" });
  const years = [...new Set(rows.map((r) => r.date.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))];
  for (const y of years) out.push({ key: `y${y}`, label: y, group: "year" });
  const seenPatch = new Set<string>();
  for (const r of rows) {
    if (!r.patch || seenPatch.has(r.patch)) continue;
    seenPatch.add(r.patch);
    out.push({ key: `p:${r.patch}`, label: r.patch, group: "patch" });
    if (seenPatch.size >= 16) break;
  }
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.e || seen.has(r.e)) continue;
    seen.add(r.e);
    out.push({ key: `e:${r.e}`, label: r.en, group: "event" });
    if (seen.size >= maxEvents) break;
  }
  return out;
}

/** The rows of a period; rows are newest first. */
export function inPeriod<T>(rows: T[], key: PeriodKey, get: (r: T) => { date: string; e: string; patch?: string | null }): T[] {
  if (!key || key === "all") return rows;
  const last = /^last(\d+)$/.exec(key);
  if (last) return rows.slice(0, Number(last[1]));
  if (key.startsWith("y")) return rows.filter((r) => get(r).date.startsWith(key.slice(1)));
  if (key.startsWith("p:")) return rows.filter((r) => get(r).patch === key.slice(2));
  if (key.startsWith("e:")) return rows.filter((r) => get(r).e === key.slice(2));
  return rows;
}

export const playerRowRef = (r: PlayerGameRow) => ({ date: r[0], e: r[11], en: r[9], patch: r[24] || null });
export const teamRowRef = (r: TeamGameRow) => ({ date: r[0], e: r[2], en: r[3], patch: r[25] || null });

const ratio = (n: number, d: number, digits = 1): number | null => (d > 0 ? Number((n / d).toFixed(digits)) : null);
const share = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export interface ChampLine {
  c: string;
  g: number;
  w: number;
  k: number;
  d: number;
  a: number;
  kda: number;
  csm: number | null;
  dpm: number | null;
  /** average gold / CS lead over the lane opponent at 15 minutes (Oracle's Elixir games only) */
  gd15: number | null;
  csd15: number | null;
}

/** A running average that skips missing values. */
class Avg {
  s = 0;
  n = 0;
  add(v: number | null | undefined) {
    if (v == null) return;
    this.s += v;
    this.n++;
  }
  get(digits = 0): number | null {
    return this.n ? Number((this.s / this.n).toFixed(digits)) : null;
  }
}

/** A yes/no rate in percent over the games where it's known. */
class Rate {
  y = 0;
  n = 0;
  add(v: boolean | null | undefined) {
    if (v == null) return;
    this.n++;
    if (v) this.y++;
  }
  get(): number | null {
    return share(this.y, this.n);
  }
}

/** Oracle's Elixir's early-game numbers over some games (null when none of them has any). */
export interface PlayerTl {
  /** games with the leads at 15 minutes */
  n: number;
  gd10: number | null;
  csd10: number | null;
  xpd10: number | null;
  gd15: number | null;
  csd15: number | null;
  xpd15: number | null;
  gd20: number | null;
  csd20: number | null;
  xpd20: number | null;
  /** % of games (first blood known) with the kill or an assist on it; % where they died for it */
  fbPart: number | null;
  fbVictim: number | null;
  /** wards placed / cleared per minute, control wards bought per game */
  wpm: number | null;
  wcpm: number | null;
  cw: number | null;
}

function playerTl(rows: PlayerGameRow[]): PlayerTl | null {
  const leads = Array.from({ length: 9 }, () => new Avg());
  const fbPart = new Rate();
  const fbVictim = new Rate();
  const cw = new Avg();
  let wards = 0, cleared = 0, wMin = 0, any = false;
  for (const r of rows) {
    const t = r[21] as PlayerTimeline | null | undefined;
    if (!t) continue;
    any = true;
    for (let i = 0; i < 9; i++) leads[i].add(t[i]);
    const fb = t[9];
    if (fb != null) {
      fbPart.add(fb === 1 || fb === 2);
      fbVictim.add(fb === 3);
    }
    const rmin = r[16];
    if (rmin && t[10] != null && t[11] != null) {
      wards += t[10];
      cleared += t[11];
      wMin += rmin;
    }
    cw.add(t[12]);
  }
  if (!any) return null;
  return {
    n: leads[3].n,
    gd10: leads[0].get(),
    csd10: leads[1].get(1),
    xpd10: leads[2].get(),
    gd15: leads[3].get(),
    csd15: leads[4].get(1),
    xpd15: leads[5].get(),
    gd20: leads[6].get(),
    csd20: leads[7].get(1),
    xpd20: leads[8].get(),
    fbPart: fbPart.get(),
    fbVictim: fbVictim.get(),
    wpm: ratio(wards, wMin, 2),
    wcpm: ratio(cleared, wMin, 2),
    cw: cw.get(1),
  };
}

export interface PlayerAgg {
  g: number;
  w: number;
  k: number;
  d: number;
  a: number;
  kda: number;
  kp: number | null;
  csm: number | null;
  gpm: number | null;
  dpm: number | null;
  dmgShare: number | null;
  goldShare: number | null;
  vsm: number | null;
  visShare: number | null;
  champs: ChampLine[];
  roles: string[];
  /** Oracle's Elixir's early-game numbers */
  tl: PlayerTl | null;
}

export const kdaOf = (k: number, d: number, a: number) => Number(((k + a) / Math.max(d, 1)).toFixed(2));

/** A player's numbers over some games. Older logs have no cs / gold / damage columns: those come out null. */
export function playerAgg(rows: PlayerGameRow[]): PlayerAgg {
  let g = 0, w = 0, k = 0, d = 0, a = 0;
  let kpN = 0, kpD = 0, cs = 0, gold = 0, dmg = 0, vis = 0, minCs = 0, minGold = 0, minDmg = 0, minVis = 0;
  let sDmg = 0, tDmg = 0, sGold = 0, tGold = 0, sVis = 0, tVis = 0;
  const champs = new Map<string, { g: number; w: number; k: number; d: number; a: number; cs: number; dmg: number; min: number; mcs: number; mdmg: number; gd15: Avg; csd15: Avg }>();
  const roles = new Map<string, number>();
  for (const r of rows) {
    g++;
    w += r[6] ? 1 : 0;
    k += r[3];
    d += r[4];
    a += r[5];
    if (r[10]) roles.set(r[10], (roles.get(r[10]) || 0) + 1);
    const [, , c, , , , , , , , , , rcs, rgold, rdmg, rvis, rmin, tk, td, tg, tv] = r;
    if (tk) {
      kpN += r[3] + r[5];
      kpD += tk;
    }
    if (rmin) {
      if (rcs != null) {
        cs += rcs;
        minCs += rmin;
      }
      if (rgold != null) {
        gold += rgold;
        minGold += rmin;
      }
      if (rdmg != null) {
        dmg += rdmg;
        minDmg += rmin;
      }
      if (rvis != null) {
        vis += rvis;
        minVis += rmin;
      }
    }
    if (rdmg != null && td) {
      sDmg += rdmg;
      tDmg += td;
    }
    if (rgold != null && tg) {
      sGold += rgold;
      tGold += tg;
    }
    if (rvis != null && tv) {
      sVis += rvis;
      tVis += tv;
    }
    if (c) {
      const x = champs.get(c) || { g: 0, w: 0, k: 0, d: 0, a: 0, cs: 0, dmg: 0, min: 0, mcs: 0, mdmg: 0, gd15: new Avg(), csd15: new Avg() };
      const t = r[21] as PlayerTimeline | null | undefined;
      if (t) {
        x.gd15.add(t[3]);
        x.csd15.add(t[4]);
      }
      x.g++;
      x.w += r[6] ? 1 : 0;
      x.k += r[3];
      x.d += r[4];
      x.a += r[5];
      if (rmin && rcs != null) {
        x.cs += rcs;
        x.mcs += rmin;
      }
      if (rmin && rdmg != null) {
        x.dmg += rdmg;
        x.mdmg += rmin;
      }
      champs.set(c, x);
    }
  }
  return {
    g,
    w,
    k,
    d,
    a,
    kda: kdaOf(k, d, a),
    kp: share(kpN, kpD),
    csm: ratio(cs, minCs),
    gpm: ratio(gold, minGold, 0),
    dpm: ratio(dmg, minDmg, 0),
    dmgShare: share(sDmg, tDmg),
    goldShare: share(sGold, tGold),
    vsm: ratio(vis, minVis, 2),
    visShare: share(sVis, tVis),
    champs: [...champs.entries()]
      .map(([c, x]) => ({
        c, g: x.g, w: x.w, k: x.k, d: x.d, a: x.a, kda: kdaOf(x.k, x.d, x.a), csm: ratio(x.cs, x.mcs), dpm: ratio(x.dmg, x.mdmg, 0),
        gd15: x.gd15.get(), csd15: x.csd15.get(1),
      }))
      .sort((p, q) => q.g - p.g || q.w - p.w),
    roles: [...roles.entries()].sort((p, q) => q[1] - p[1]).map(([r]) => r),
    tl: playerTl(rows),
  };
}

export interface TeamAgg {
  g: number;
  w: number;
  blue: [number, number];
  red: [number, number];
  /** games with a scoreboard (kills, gold, objectives) */
  sg: number;
  min: number | null;
  /** average length of its wins and of its losses, minutes */
  minWin: number | null;
  minLoss: number | null;
  kills: number | null;
  deaths: number | null;
  gpm: number | null;
  gdm: number | null;
  gd: number | null;
  dragShare: number | null;
  baronShare: number | null;
  towers: number | null;
  towersLost: number | null;
  picks: [string, number, number][];
  /** different champions picked */
  nPicks: number;
  bans: [string, number][];
  bansVs: [string, number][];
  /** combined kills per minute (both teams) */
  ckpm: number | null;
  /** Oracle's Elixir's early-game numbers */
  tl: TeamTl | null;
}

/** Oracle's Elixir's numbers for a team over some games (rates in percent of the games where they're known). */
export interface TeamTl {
  /** games with the gold lead at 15 minutes */
  n: number;
  gd10: number | null;
  gd15: number | null;
  gd20: number | null;
  csd15: number | null;
  xpd15: number | null;
  /** % of games ahead in gold at 15 */
  lead15: number | null;
  /** [games, wins] when ahead / behind in gold at 15 */
  ahead: [number, number];
  behind: [number, number];
  fb: number | null;
  ft: number | null;
  fmt: number | null;
  f3t: number | null;
  fd: number | null;
  fh: number | null;
  fbaron: number | null;
  /** turret plates taken / lost per game */
  plates: number | null;
  platesLost: number | null;
  /** void grubs per game and their share of all grubs in their games */
  grubs: number | null;
  grubShare: number | null;
  wpm: number | null;
  wcpm: number | null;
  /** control wards bought per game, vision score per minute */
  cw: number | null;
  vspm: number | null;
}

function teamTl(rows: TeamGameRow[]): TeamTl | null {
  const diffs = Array.from({ length: 5 }, () => new Avg());
  const firsts = Array.from({ length: 7 }, () => new Rate());
  const lead = new Rate();
  const ahead: [number, number] = [0, 0];
  const behind: [number, number] = [0, 0];
  const plates = new Avg();
  const platesLost = new Avg();
  const grubs = new Avg();
  const cw = new Avg();
  let grubFor = 0, grubAll = 0, wards = 0, cleared = 0, vis = 0, wMin = 0, any = false;
  for (const r of rows) {
    const t = r[23] as TeamTimeline | null | undefined;
    if (!t) continue;
    any = true;
    for (let i = 0; i < 5; i++) diffs[i].add(t[i]);
    const g15 = t[1];
    if (g15 != null) {
      lead.add(g15 > 0);
      if (g15 > 0) {
        ahead[0]++;
        ahead[1] += r[7];
      } else if (g15 < 0) {
        behind[0]++;
        behind[1] += r[7];
      }
    }
    for (let i = 0; i < 7; i++) {
      const f = t[5 + i];
      firsts[i].add(f == null ? null : f === 1);
    }
    if (t[12] != null && t[13] != null) {
      plates.add(t[12]);
      platesLost.add(t[13]);
    }
    if (t[14] != null && t[15] != null) {
      grubs.add(t[14]);
      grubFor += t[14];
      grubAll += t[14] + t[15];
    }
    const rmin = r[8];
    if (rmin && t[16] != null && t[17] != null && t[19] != null) {
      wards += t[16];
      cleared += t[17];
      vis += t[19];
      wMin += rmin;
    }
    cw.add(t[18]);
  }
  if (!any) return null;
  return {
    n: diffs[1].n,
    gd10: diffs[0].get(),
    gd15: diffs[1].get(),
    gd20: diffs[2].get(),
    csd15: diffs[3].get(1),
    xpd15: diffs[4].get(),
    lead15: lead.get(),
    ahead,
    behind,
    fb: firsts[0].get(),
    ft: firsts[1].get(),
    fmt: firsts[2].get(),
    f3t: firsts[3].get(),
    fd: firsts[4].get(),
    fh: firsts[5].get(),
    fbaron: firsts[6].get(),
    plates: plates.get(1),
    platesLost: platesLost.get(1),
    grubs: grubs.get(1),
    grubShare: share(grubFor, grubAll),
    wpm: ratio(wards, wMin, 2),
    wcpm: ratio(cleared, wMin, 2),
    cw: cw.get(1),
    vspm: ratio(vis, wMin, 2),
  };
}

const top = (m: Map<string, number>, n: number): [string, number][] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/** A team's numbers over some games. */
export function teamAgg(rows: TeamGameRow[]): TeamAgg {
  let g = 0, w = 0, sg = 0, min = 0, minG = 0, kills = 0, deaths = 0, gold = 0, gd = 0, goldMin = 0, goldGames = 0;
  let drag = 0, odrag = 0, bar = 0, obar = 0, tow = 0, otow = 0, towG = 0, ck = 0, ckMin = 0;
  const winMin = new Avg(), lossMin = new Avg();
  const blue: [number, number] = [0, 0];
  const red: [number, number] = [0, 0];
  const picks = new Map<string, [number, number]>();
  const bans = new Map<string, number>();
  const bansVs = new Map<string, number>();
  for (const r of rows) {
    const [, , , , , , side, won, rmin, k, ok, gl, ogl, dr, odr, br, obr, tw, otw, rb, rp, rob] = r;
    g++;
    w += won;
    const s = side === "b" ? blue : red;
    s[0]++;
    s[1] += won;
    if (rmin) {
      min += rmin;
      minG++;
      (won ? winMin : lossMin).add(rmin);
    }
    if (k != null && ok != null) {
      sg++;
      kills += k;
      deaths += ok;
      if (rmin) {
        ck += k + ok;
        ckMin += rmin;
      }
      if (gl != null && ogl != null && rmin) {
        gold += gl;
        gd += gl - ogl;
        goldMin += rmin;
        goldGames++;
      }
      drag += dr || 0;
      odrag += odr || 0;
      bar += br || 0;
      obar += obr || 0;
      if (tw != null && otw != null) {
        tow += tw;
        otow += otw;
        towG++;
      }
    }
    for (const c of rp || []) {
      const x = picks.get(c) || [0, 0];
      x[0]++;
      x[1] += won;
      picks.set(c, x);
    }
    for (const c of rb || []) bans.set(c, (bans.get(c) || 0) + 1);
    for (const c of rob || []) bansVs.set(c, (bansVs.get(c) || 0) + 1);
  }
  return {
    g,
    w,
    blue,
    red,
    sg,
    min: minG ? Number((min / minG).toFixed(1)) : null,
    minWin: winMin.get(1),
    minLoss: lossMin.get(1),
    kills: ratio(kills, sg),
    deaths: ratio(deaths, sg),
    gpm: ratio(gold, goldMin, 0),
    gdm: ratio(gd, goldMin, 0),
    gd: goldGames ? Math.round(gd / goldGames) : null,
    dragShare: share(drag, drag + odrag),
    baronShare: share(bar, bar + obar),
    // over the games with towers recorded (some scoreboards have kills but no towers)
    towers: ratio(tow, towG),
    towersLost: ratio(otow, towG),
    picks: [...picks.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 15).map(([c, x]) => [c, x[0], x[1]]),
    nPicks: picks.size,
    bans: top(bans, 10),
    bansVs: top(bansVs, 10),
    ckpm: ratio(ck, ckMin, 2),
    tl: teamTl(rows),
  };
}

/**
 * Games two players played against each other: the same game (same series and game length), on different teams.
 * Only games both of them were in count, so a substitute who played one game of a series isn't counted for the
 * others, and A vs B has as many games as B vs A. Games without a length fall back to the same series, up to the
 * fewer games either player had in it.
 */
export function playerHeadToHead(a: PlayerGameRow[], b: PlayerGameRow[]): { g: number; w: number } {
  // the game number (builds from 2026-10-18 on) or the game's length tells the games of one series apart
  const exact = (r: PlayerGameRow) => (r[22] != null ? `${r[1]}#${r[22]}` : r[16] != null ? `${r[1]}|${r[16]}` : null);
  const bGame = new Map<string, string>();
  const bLoose = new Map<string, { team: string; n: number }>();
  for (const r of b) {
    const k = exact(r);
    if (k) bGame.set(k, r[7]);
    else {
      const x = bLoose.get(r[1]) || { team: r[7], n: 0 };
      x.n++;
      bLoose.set(r[1], x);
    }
  }
  let g = 0, w = 0;
  const used = new Map<string, number>();
  for (const r of a) {
    const k = exact(r);
    if (k) {
      const bt = bGame.get(k);
      if (bt !== undefined && bt !== r[7]) {
        g++;
        w += r[6] ? 1 : 0;
      }
      continue;
    }
    const lb = bLoose.get(r[1]);
    if (lb && lb.team !== r[7] && (used.get(r[1]) || 0) < lb.n) {
      used.set(r[1], (used.get(r[1]) || 0) + 1);
      g++;
      w += r[6] ? 1 : 0;
    }
  }
  return { g, w };
}

/** One game two players played against each other: a's row and b's row. */
export interface Meeting {
  a: PlayerGameRow;
  b: PlayerGameRow;
}

/** The games two players played on opposite sides, newest first (needs the game number: builds from 2026-10-18 on). */
export function playerMeetings(a: PlayerGameRow[], b: PlayerGameRow[]): Meeting[] {
  const bGame = new Map<string, PlayerGameRow>();
  for (const r of b) if (r[1] && r[22] != null) bGame.set(`${r[1]}#${r[22]}`, r);
  const out: Meeting[] = [];
  for (const r of a) {
    const o = r[1] && r[22] != null ? bGame.get(`${r[1]}#${r[22]}`) : undefined;
    if (o && o[7] !== r[7]) out.push({ a: r, b: o });
  }
  return out.sort((x, y) => (x.a[0] < y.a[0] ? 1 : x.a[0] > y.a[0] ? -1 : 0));
}

/** A team's games against one opponent (by the opponent's page slug). */
export function teamHeadToHead(rows: TeamGameRow[], oppSlug: string): { g: number; w: number } {
  let g = 0, w = 0;
  for (const r of rows) if (r[5] === oppSlug) {
    g++;
    w += r[7];
  }
  return { g, w };
}

/**
 * Win rate by what happened early (games with Oracle's Elixir timelines): with and without each first objective,
 * and by the gold lead at 15 minutes in four bands. [games, wins] each; "without" counts games the other team got it.
 */
export function winWhen(rows: TeamGameRow[]): {
  firsts: { key: "fb" | "ft" | "f3t" | "fd" | "fh" | "fbaron"; got: [number, number]; lost: [number, number] }[];
  gold: { key: "a2" | "a0" | "b0" | "b2"; g: number; w: number }[];
  n: number;
} {
  const idx = { fb: 5, ft: 6, f3t: 8, fd: 9, fh: 10, fbaron: 11 } as const;
  const firsts = (Object.keys(idx) as (keyof typeof idx)[]).map((key) => ({ key, got: [0, 0] as [number, number], lost: [0, 0] as [number, number] }));
  const bands = { a2: [0, 0], a0: [0, 0], b0: [0, 0], b2: [0, 0] } as Record<"a2" | "a0" | "b0" | "b2", [number, number]>;
  let n = 0;
  for (const r of rows) {
    const t = r[23] as TeamTimeline | null | undefined;
    if (!t) continue;
    n++;
    for (const f of firsts) {
      const v = t[idx[f.key]];
      if (v === 1) {
        f.got[0]++;
        f.got[1] += r[7];
      } else if (v === 0) {
        f.lost[0]++;
        f.lost[1] += r[7];
      }
    }
    const g = t[1];
    if (g != null) {
      const b = g >= 2000 ? "a2" : g > 0 ? "a0" : g > -2000 ? "b0" : "b2";
      if (g !== 0) {
        bands[b][0]++;
        bands[b][1] += r[7];
      }
    }
  }
  return { firsts, gold: (["a2", "a0", "b0", "b2"] as const).map((key) => ({ key, g: bands[key][0], w: bands[key][1] })), n };
}
