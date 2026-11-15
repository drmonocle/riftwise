/**
 * Client-side split aggregation from `hub/lines/<event>.json` (`EventLines`).
 * Enables Win / Loss / Blue / Red / Stage splits for tournament player tables on demand without bloating event JSONs.
 */
import type { EventPlayer } from "./types";
import { gamesOf, type EventLines, type Game } from "./worldsFacts";

export type SideSplit = "all" | "blue" | "red";
export type OutcomeSplit = "all" | "win" | "loss";

export interface SplitFilter {
  side: SideSplit;
  outcome: OutcomeSplit;
  /** "all", "__swiss__", "__knockout__", or an exact stage name from `lines.s[*][1]`. */
  stage: string;
}

const SWISS_RE = /^(round\s*[1-5]|swiss)/i;
const KNOCKOUT_RE = /(quarter|semi|final|playoff|knockout|upper|lower|grand|3rd)/i;

export function isSplitActive(f: SplitFilter): boolean {
  return f.side !== "all" || f.outcome !== "all" || (!!f.stage && f.stage !== "all");
}

export function matchStageFilter(stageName: string, stageFilter: string): boolean {
  if (!stageFilter || stageFilter === "all") return true;
  if (stageFilter === "__swiss__") return SWISS_RE.test(stageName.trim());
  if (stageFilter === "__knockout__") return KNOCKOUT_RE.test(stageName.trim());
  return stageName === stageFilter;
}

export function collectStageOptions(stages: string[]): { value: string; labelKey?: string; label: string; isRaw?: boolean }[] {
  const uniq = Array.from(new Set(stages.filter(Boolean)));
  const out: { value: string; labelKey?: string; label: string; isRaw?: boolean }[] = [];
  const hasSwiss = uniq.some((s) => SWISS_RE.test(s.trim()));
  const hasKnockout = uniq.some((s) => KNOCKOUT_RE.test(s.trim()));
  if (hasSwiss && hasKnockout) {
    out.push({ value: "__swiss__", labelKey: "Swiss stage", label: "Swiss stage" });
    out.push({ value: "__knockout__", labelKey: "Knockout stage", label: "Knockout stage" });
  }
  for (const s of uniq) {
    out.push({ value: s, label: s, isRaw: true });
  }
  return out;
}

/** Aggregate played games in `lines` matching `filter` into `EventPlayer[]`. */
export function aggregateLinesSplit(lines: EventLines, filter: SplitFilter): EventPlayer[] {
  const games: Game[] = gamesOf([lines]);
  type Acc = {
    n: string;
    u: string | null;
    t: string;
    tu: string;
    r: string;
    g: number;
    w: number;
    k: number;
    d: number;
    a: number;
    tk: number;
    tdth: number;
    min: number;
    cs: number;
    dmg: number;
    dm: number;
    gold: number;
    vis: number;
    vmin: number;
    sd: number;
    td: number;
    sg: number;
    tg: number;
    sv: number;
    tv: number;
    champs: Map<string, { c: string; g: number; w: number }>;
  };

  const map = new Map<string, Acc>();
  for (const g of games) {
    if (g.w !== 1 && g.w !== 2) continue;
    if (!matchStageFilter(g.stage || "", filter.stage)) continue;
    const min = g.min || 0;

    for (const sideIdx of [0, 1] as const) {
      const isBlue = g.blue === sideIdx;
      const won = g.w === sideIdx + 1;
      if (filter.side === "blue" && !isBlue) continue;
      if (filter.side === "red" && isBlue) continue;
      if (filter.outcome === "win" && !won) continue;
      if (filter.outcome === "loss" && won) continue;

      const tm = g.team[sideIdx];
      if (!tm.players.length) continue;

      const sumK = tm.kills ?? tm.players.reduce((s, p) => s + p.k, 0);
      const sumD = tm.players.reduce((s, p) => s + p.d, 0);
      const sumDm = tm.players.reduce((s, p) => s + (p.dmg && p.dmg > 0 ? p.dmg : 0), 0);
      const sumGd = tm.players.reduce((s, p) => s + (p.gold && p.gold > 0 ? p.gold : 0), 0);
      const sumV = tm.players.reduce((s, p) => s + (p.vision && p.vision > 0 ? p.vision : 0), 0);

      for (const p of tm.players) {
        const role = p.role || "Unknown";
        const key = `${p.u || p.name}::${tm.u || tm.name}::${role}`;
        let acc = map.get(key);
        if (!acc) {
          acc = {
            n: p.name,
            u: p.u,
            t: tm.name,
            tu: tm.u,
            r: role,
            g: 0,
            w: 0,
            k: 0,
            d: 0,
            a: 0,
            tk: 0,
            tdth: 0,
            min: 0,
            cs: 0,
            dmg: 0,
            dm: 0,
            gold: 0,
            vis: 0,
            vmin: 0,
            sd: 0,
            td: 0,
            sg: 0,
            tg: 0,
            sv: 0,
            tv: 0,
            champs: new Map(),
          };
          map.set(key, acc);
        }
        acc.g += 1;
        if (won) acc.w += 1;
        acc.k += p.k;
        acc.d += p.d;
        acc.a += p.a;
        acc.tk += sumK;
        acc.tdth += sumD;
        acc.min += min;
        acc.cs += p.cs || 0;
        if (p.dmg != null && p.dmg > 0 && sumDm > 0) {
          acc.dmg += p.dmg;
          acc.dm += min;
          acc.sd += p.dmg;
          acc.td += sumDm;
        }
        if (p.gold != null && p.gold > 0 && sumGd > 0) {
          acc.gold += p.gold;
          acc.sg += p.gold;
          acc.tg += sumGd;
        }
        if (p.vision != null && p.vision > 0 && sumV > 0) {
          acc.vis += p.vision;
          acc.vmin += min;
          acc.sv += p.vision;
          acc.tv += sumV;
        }
        if (p.champ) {
          const ch = acc.champs.get(p.champ) || { c: p.champ, g: 0, w: 0 };
          ch.g += 1;
          if (won) ch.w += 1;
          acc.champs.set(p.champ, ch);
        }
      }
    }
  }

  return Array.from(map.values())
    .map((a): EventPlayer => ({
      n: a.n,
      u: a.u,
      t: a.t,
      tu: a.tu,
      r: a.r,
      g: a.g,
      w: a.w,
      k: a.k,
      d: a.d,
      a: a.a,
      tk: a.tk,
      tdth: a.tdth,
      min: Math.round(a.min * 10) / 10,
      cs: a.cs,
      dmg: a.dmg,
      dm: Math.round(a.dm * 10) / 10,
      gold: a.gold,
      vis: a.vis,
      vmin: Math.round(a.vmin * 10) / 10,
      sd: a.sd,
      td: a.td,
      sg: a.sg,
      tg: a.tg,
      sv: a.sv,
      tv: a.tv,
      mvp: 0,
      nc: a.champs.size,
      c: Array.from(a.champs.values())
        .sort((x, y) => y.g - x.g || y.w - x.w || x.c.localeCompare(y.c))
        .map((x) => x.c),
    }))
    .sort((a, b) => b.g - a.g || (b.k + b.a) / Math.max(1, b.d) - (a.k + a.a) / Math.max(1, a.d));
}
