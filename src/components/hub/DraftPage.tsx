/**
 * Draft board: plan a draft between two pro teams in tournament order (3 bans, 3 picks, 2 bans, 2 picks per side)
 * with both teams' champion pools in view: how often each team picked or banned a champion over the chosen period,
 * how it went, who on the roster plays it, each player's pool, what to ban or pick next and why, which roles the
 * picks so far cover, and the lane answers the other team has in its own pool. Fearless mode keeps the champions
 * of earlier games out and remembers those games. The whole draft lives in the address, so it survives a reload
 * and can be sent to the rest of the staff: /stats/draft?teams=t1,gen-g&p=y2026&d=...&u=...&h=...
 */
import React, { useEffect, useMemo, useState } from "react";
import { RotateCcw, Undo2, ArrowLeftRight, ChevronsRight, Copy, Check, Lightbulb } from "lucide-react";
import { tl, roleName, fmtN } from "../../i18n";
import { champName } from "../../champions";
import { MissingFile, winRate } from "../../stats";
import type { TeamGameRow } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { championList, useDDragon } from "../../hub/ddragon";
import { ROLES } from "../../hub/champAgg";
import { PeriodKey, inPeriod, kdaOf, playerRowRef, teamRowRef } from "../../hub/period";
import { ComparePick, bothOptions } from "./ComparePage";
import { PeriodPicker, defaultPeriod } from "./PeriodStats";
import { FearlessDepth, RosterSubPicker, Side, loadFullLogs, loadSide, needsFullLogs, swapPlayerInSide } from "./PrepPage";
import { card, ChampIcon, ChampLink, HubLink, Loading, OeCredit, PlayerPhoto, Section, TeamLogo, useLoad, usePageTitle, useRetryAttempt, retryFailedLoads } from "./ui";
import { bare, buildGameDraftQuery, DRAFT_ORDER as ORDER, type GameDraftInput, type GameDraftQueryInput, loadHubChamp, packHistory, packSlots, type PastGame, prettySlug, slotsFromGameDraft } from "../../hub/data";
import { BroadcastCardButton, SectionCard, draftBoardCard, type BoardSide } from "./BroadcastCard";
import type { HubChamp, LaneLine } from "../../hub/types";
import { draftTendencies } from "./DraftTendencies";

export { ORDER, packSlots, packHistory, slotsFromGameDraft, buildGameDraftQuery };
export type { PastGame, GameDraftInput, GameDraftQueryInput };
type Who = "b" | "r";

export interface PlayerOnChamp {
  c: string;
  name: string;
  /** roster slot = role index (0 top .. 4 support) */
  role: number;
  /** this period: games, wins, KDA, average gold lead over the lane opponent at 15 (Oracle's Elixir games) */
  g: number;
  w: number;
  kda: number | null;
  gd15: number | null;
  /** whole log (the career, or the last two years for a veteran: see Side.players[].full) */
  cg: number;
  cw: number;
  ckda: number;
}

export interface PlayerPool {
  name: string;
  u: string | null;
  role: number;
  full: boolean;
  champs: PlayerOnChamp[];
}

export interface Pool {
  picks: Map<string, [number, number]>; // champion -> games, wins
  bans: Map<string, number>;
  bansVs: Map<string, number>;
  roles: Map<string, Set<number>>;
  /** champion -> games per role index, for the role a pick most likely fills */
  roleCount: Map<string, number[]>;
  /** who on the roster plays it: in the period and in their whole log (catches pocket picks) */
  players: Map<string, PlayerOnChamp[]>;
  byPlayer: PlayerPool[];
  games: number;
}

export function pool(side: Side, period: PeriodKey, sideOnly?: "b" | "r"): Pool {
  const rows: TeamGameRow[] = inPeriod(side.games, period, teamRowRef).filter((r) => !sideOnly || r[6] === sideOnly);
  const p: Pool = {
    picks: new Map(),
    bans: new Map(),
    bansVs: new Map(),
    roles: new Map(),
    roleCount: new Map(),
    players: new Map(),
    byPlayer: [],
    games: rows.length,
  };
  for (const r of rows) {
    (r[20] || []).forEach((c, i) => {
      const x = p.picks.get(c) || [0, 0];
      x[0]++;
      x[1] += r[7];
      p.picks.set(c, x);
      const role = (r[22] || [])[i];
      if (role != null && role >= 0) {
        p.roles.set(c, (p.roles.get(c) || new Set()).add(role));
        const rc = p.roleCount.get(c) || [0, 0, 0, 0, 0];
        rc[role]++;
        p.roleCount.set(c, rc);
      }
    });
    for (const c of r[19] || []) p.bans.set(c, (p.bans.get(c) || 0) + 1);
    for (const c of r[21] || []) p.bansVs.set(c, (p.bansVs.get(c) || 0) + 1);
  }
  side.players.forEach((pl, role) => {
    if (!pl) return;
    // a period's games are the ones for this team (a new signing's games for their old team are career only)
    const teamNames = new Set((side.team.names || []).map((x) => x.n).concat(side.team.name));
    const now = new Set(inPeriod(pl.log, period, playerRowRef).filter((g) => period === "all" || teamNames.has(g[7])));
    // champion -> [games, wins, k, d, a, gold lead sum, games with it] this period, then the same for the whole log
    const by = new Map<string, number[]>();
    for (const g of pl.log) {
      if (!g[2]) continue;
      const x = by.get(g[2]) || new Array(14).fill(0);
      const add = (o: number) => {
        x[o]++;
        x[o + 1] += g[6];
        x[o + 2] += g[3];
        x[o + 3] += g[4];
        x[o + 4] += g[5];
        const gd = g[21]?.[3];
        if (gd != null) {
          x[o + 5] += gd;
          x[o + 6]++;
        }
      };
      if (now.has(g)) add(0);
      add(7);
      by.set(g[2], x);
    }
    const mine: PlayerOnChamp[] = [];
    for (const [c, x] of by) {
      const row: PlayerOnChamp = {
        c,
        name: pl.p.name,
        role,
        g: x[0],
        w: x[1],
        kda: x[0] ? kdaOf(x[2], x[3], x[4]) : null,
        gd15: x[6] ? Math.round(x[5] / x[6]) : null,
        cg: x[7],
        cw: x[8],
        ckda: kdaOf(x[9], x[10], x[11]),
      };
      mine.push(row);
      p.players.set(c, [...(p.players.get(c) || []), row]);
    }
    p.byPlayer.push({ name: pl.p.name, u: pl.p.u, role, full: pl.full, champs: mine });
  });
  return p;
}

/** The role a champion would fill for this team: the role it played it in most, else its main player's seat. */
export function roleOf(c: string, p: Pool, champMap?: Record<string, HubChamp | null>): number | null {
  const rc = p.roleCount.get(c);
  if (rc) {
    let best = -1;
    let n = 0;
    rc.forEach((v, i) => {
      if (v > n) {
        n = v;
        best = i;
      }
    });
    if (best >= 0) return best;
  }
  const pls = p.players.get(c);
  if (pls && pls.length) return [...pls].sort((a, b) => b.g - a.g || b.cg - a.cg)[0].role;
  const ch = champMap?.[c] || champMap?.[bare(c)];
  if (ch?.roles?.length) {
    const idx = ROLES.indexOf(ch.roles[0].r);
    if (idx >= 0) return idx;
  }
  return null;
}

/** Candidate roles (0..4) and their preference weights for a champion on a given side. */
export function candidateRolesOf(c: string, p: Pool, champMap?: Record<string, HubChamp | null>): Map<number, number> {
  const weights = new Map<number, number>();
  const rc = p.roleCount.get(c);
  if (rc) {
    rc.forEach((v, r) => {
      if (v > 0) weights.set(r, (weights.get(r) || 0) + v * 12);
    });
  }
  for (const pl of p.players.get(c) || []) {
    if (pl.g > 0 || pl.cg > 0) {
      weights.set(pl.role, (weights.get(pl.role) || 0) + pl.g * 10 + Math.min(pl.cg, 15));
    }
  }
  const ch = champMap?.[c] || champMap?.[bare(c)];
  if (ch?.roles?.length) {
    const total = ch.roles.reduce((s, x) => s + x.p, 0) || 1;
    for (const xr of ch.roles) {
      const idx = ROLES.indexOf(xr.r);
      if (idx >= 0 && (xr.p / total >= 0.08 || weights.size === 0)) {
        weights.set(idx, (weights.get(idx) || 0) + Math.max(1, Math.round((xr.p / total) * 20)));
      }
    }
  }
  return weights;
}

/**
 * Resolves flex picks across a team's locked picks (up to 5) so that e.g. Yone (Mid/Top) + Ahri (Mid) assigns
 * Yone -> Top and Ahri -> Mid instead of colliding on Mid ×2.
 */
export function assignDraftRoles(picks: string[], p: Pool, champMap?: Record<string, HubChamp | null>): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (!picks.length) return out;
  const cands = picks.map((c) => candidateRolesOf(c, p, champMap));
  let bestScore = -1;
  let bestAssign: (number | null)[] = picks.map((c) => roleOf(c, p, champMap));

  const search = (idx: number, usedMask: number, cur: (number | null)[], score: number) => {
    if (idx === picks.length) {
      if (score > bestScore) {
        bestScore = score;
        bestAssign = [...cur];
      }
      return;
    }
    const map = cands[idx];
    let triedAny = false;
    for (const [r, w] of map.entries()) {
      if ((usedMask & (1 << r)) === 0) {
        triedAny = true;
        cur.push(r);
        search(idx + 1, usedMask | (1 << r), cur, score + 10000 + w);
        cur.pop();
      }
    }
    // Also allow leaving this pick on its fallback/colliding role if all its candidate roles were taken by stronger locks
    if (!triedAny || map.size > 0) {
      cur.push(roleOf(picks[idx], p, champMap));
      search(idx + 1, usedMask, cur, score);
      cur.pop();
    }
  };
  search(0, 0, [], 0);
  picks.forEach((c, i) => out.set(c, bestAssign[i] ?? null));
  return out;
}

/** games weighted by how they went: 10 games at 70% beat 12 at 40% */
export const comfort = (g: number, w: number) => g * (0.5 + (g ? w / g : 0));

export const champOf = (c: string | null, p: Pool) => (c ? [...(p.players.get(c) || [])].sort((a, b) => b.g - a.g || b.cg - a.cg)[0] : undefined);

// ── address <-> state ──────────────────────────────────────────────────────

const SLOTS = ORDER.length;
const parseSlots = (s: string | null): (string | null)[] => {
  const out = (s || "").split(",").map((x) => x.trim() || null);
  while (out.length < SLOTS) out.push(null);
  return out.slice(0, SLOTS);
};
const parseList = (s: string | null) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);

const CHAMP_ALIAS: Record<string, string> = {
  monkeyking: "wukong",
  wukong: "monkeyking",
  nunu: "nunuwillump",
  nunuwillump: "nunu",
  renata: "renataglasc",
  renataglasc: "renata",
};

/**
 * Builds a normalized lookup set of all unavailable champions (picked/banned in `slots` + Fearless `used` when `fearless` is enabled),
 * matching across spacing, apostrophes, case, and DDragon/OE aliases (`Kai'Sa`/`Kaisa`, `Lee Sin`/`LeeSin`, `Twisted Fate`/`TwistedFate`, `LeBlanc`/`Leblanc`, `Wukong`/`MonkeyKing`).
 */
export function buildTakenSet(slots: (string | null)[], used: string[], fearless: boolean): Set<string> {
  const out = new Set<string>();
  const raw = [...slots.filter((s): s is string => !!s), ...(fearless ? used : [])];
  for (const r of raw) {
    const t = r.trim();
    if (!t) continue;
    out.add(t);
    out.add(t.toLowerCase());
    const b = bare(t);
    if (b) {
      out.add(b);
      if (CHAMP_ALIAS[b]) out.add(CHAMP_ALIAS[b]);
    }
    const cn = champName(t);
    if (cn && cn !== t) {
      out.add(cn);
      out.add(cn.toLowerCase());
      const bcn = bare(cn);
      if (bcn) out.add(bcn);
    }
  }
  return out;
}

export function isChampTaken(c: string, taken: Set<string>): boolean {
  if (!c) return false;
  if (taken.has(c) || taken.has(c.toLowerCase())) return true;
  const b = bare(c);
  if (b && (taken.has(b) || (CHAMP_ALIAS[b] !== undefined && taken.has(CHAMP_ALIAS[b])))) return true;
  const cn = champName(c);
  if (cn && (taken.has(cn) || taken.has(cn.toLowerCase()) || taken.has(bare(cn)))) return true;
  return false;
}

const parseHistory = (s: string | null): PastGame[] =>
  (s || "")
    .split(";")
    .filter(Boolean)
    .map((e) => {
      const [blue, red, rest] = e.split("~");
      return { blue, red, slots: parseSlots(rest || "") };
    });

/**
 * Swaps Blue and Red ban/pick slots so clicking "Swap sides" moves each team's already-entered bans and picks
 * to its new side rather than inverting or wiping them.
 */
export function swapDraftSlots(slots: (string | null)[]): (string | null)[] {
  const blueBans = ORDER.map((o, i) => (o.side === "b" && o.ban ? slots[i] ?? null : undefined)).filter((x): x is string | null => x !== undefined);
  const redBans = ORDER.map((o, i) => (o.side === "r" && o.ban ? slots[i] ?? null : undefined)).filter((x): x is string | null => x !== undefined);
  const bluePicks = ORDER.map((o, i) => (o.side === "b" && !o.ban ? slots[i] ?? null : undefined)).filter((x): x is string | null => x !== undefined);
  const redPicks = ORDER.map((o, i) => (o.side === "r" && !o.ban ? slots[i] ?? null : undefined)).filter((x): x is string | null => x !== undefined);
  return slotsFromGameDraft({
    blueBans: redBans,
    redBans: blueBans,
    bluePicks: redPicks,
    redPicks: bluePicks,
  });
}

/**
 * Computes the next cursor slot after placing a champion at `currentStep`:
 * - When `sameTeamBans` is true on a Ban slot, advances through that team's remaining empty bans in the same ban phase
 *   (e.g. Blue Ban 1 -> 2 -> 3), then to the other team's empty bans in that phase, and then into the Pick phase.
 * - Otherwise advances forward in tournament turn order from `currentStep + 1` so jumping mid-draft to any turn
 *   (e.g. Pick 1 or Ban 3) continues forward without yanking the cursor back to slot 0.
 */
export function nextDraftSlot(slots: (string | null)[], currentStep: number, sameTeamBans = false): number | null {
  if (sameTeamBans && currentStep >= 0 && currentStep < SLOTS && ORDER[currentStep].ban) {
    const phaseIndices = currentStep < 6 ? [0, 1, 2, 3, 4, 5] : [12, 13, 14, 15];
    const mySide = ORDER[currentStep].side;
    const sameAfter = phaseIndices.find((i) => i > currentStep && ORDER[i].side === mySide && slots[i] === null);
    if (sameAfter !== undefined) return sameAfter;
    const sameBefore = phaseIndices.find((i) => ORDER[i].side === mySide && slots[i] === null);
    if (sameBefore !== undefined) return sameBefore;
    const otherSide = phaseIndices.find((i) => ORDER[i].side !== mySide && slots[i] === null);
    if (otherSide !== undefined) return otherSide;
    const afterPhaseEnd = phaseIndices[phaseIndices.length - 1];
    for (let i = afterPhaseEnd + 1; i < SLOTS; i++) {
      if (slots[i] === null) return i;
    }
  }
  for (let i = currentStep + 1; i < SLOTS; i++) {
    if (slots[i] === null) return i;
  }
  const allPicksFilled = ORDER.every((o, i) => o.ban || !!slots[i]);
  if (!allPicksFilled) {
    const first = slots.findIndex((s) => s === null);
    return first >= 0 ? first : null;
  }
  return null;
}


export const DraftPage: React.FC<{ query?: string }> = ({ query }) => {
  useDDragon();
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const rawTeams = q.get("teams") || (q.get("a") || q.get("b") ? `${q.get("a") || ""},${q.get("b") || ""}` : "");
  const [a, b] = rawTeams.split(",").map((x) => x.trim().toLowerCase() || null);
  const set = (patch: { a?: string | null; b?: string | null; p?: string; g?: string; d?: string; u?: string; f?: string; h?: string }) => {
    const next = new URLSearchParams(q);
    const ta = patch.a !== undefined ? patch.a : a;
    const tb = patch.b !== undefined ? patch.b : b;
    if (ta || tb) next.set("teams", `${ta || ""},${tb || ""}`);
    else next.delete("teams");
    if (patch.p !== undefined) {
      if (patch.p && patch.p !== "all") next.set("p", patch.p);
      else next.delete("p");
    }
    for (const k of ["g", "d", "u", "f", "h"] as const) {
      const v = patch[k];
      if (v === undefined) continue;
      if (v) next.set(k, v);
      else next.delete(k);
    }
    navigateHub({ kind: "draft", query: next.toString() }, { replace: true });
  };
  const [sides, setSides] = useState<{ a: Side | null; b: Side | null; failed?: boolean; missing?: boolean }>({ a: null, b: null });
  const attempt = useRetryAttempt(!!sides.failed && !sides.missing);
  useEffect(() => {
    let alive = true;
    setSides({ a: null, b: null });
    if (!a || !b) return;
    Promise.all([loadSide(a, true), loadSide(b, true)])
      .then(([x, y]) => alive && setSides({ a: x, b: y }))
      .catch((e) => alive && setSides({ a: null, b: null, failed: true, missing: e instanceof MissingFile }));
    return () => {
      alive = false;
    };
  }, [a, b, attempt]);
  usePageTitle(
    sides.a && sides.b ? tl("{a} vs {b}: draft board", { a: sides.a.team.name, b: sides.b.team.name }) : tl("Draft board"),
  );

  if (!a || !b)
    return (
      <div className="space-y-3">
        <div className={`${card} space-y-2 text-xs`}>
          <p className="text-rw-text font-semibold">{tl("Draft board")}</p>
          <p className="text-rw-sub">
            {tl(
              "Pick a blue-side and a red-side team, then draft in tournament order with both teams' champion pools, bans and players in view.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((k) => (
            <div key={k} className={`${card} min-w-0 space-y-1`}>
              <div className={`text-[10px] uppercase tracking-wider font-bold ${k === "a" ? "text-rw-side-a" : "text-rw-side-b"}`}>
                {k === "a" ? tl("Blue side") : tl("Red side")}
              </div>
              {(k === "a" ? a : b) ? (
                <button type="button" onClick={() => set({ [k]: null })} className="text-[11px] text-rw-accent hover:underline">
                  {tl("Change")}
                </button>
              ) : (
                <ComparePick kind="team" autoFocus={k === "a" || !!a} onPick={(slug) => set({ [k]: slug })} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  if (sides.failed)
    return (
      <div className="text-xs text-rw-sub py-6 text-center space-y-2">
        <p>{sides.missing ? tl("We couldn't find one of these teams.") : tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>
        {sides.missing ? null : (
          <button type="button" onClick={retryFailedLoads} className="text-rw-accent hover:underline mr-4">
            {tl("Try again")}
          </button>
        )}
        <button type="button" onClick={() => set({ a: null, b: null, g: "", d: "", u: "", h: "" })} className="text-rw-accent hover:underline">
          {tl("Pick the teams again")}
        </button>
      </div>
    );
  if (!sides.a || !sides.b) return <Loading />;
  const slots = parseSlots(q.get("d"));
  const history = parseHistory(q.get("h"));
  const usedList = parseList(q.get("u"));
  const gameParam = Number(q.get("g")) || 0;
  const activeGameNum =
    history.length > 0
      ? Math.max(gameParam, history.length + 1)
      : gameParam > 0
        ? gameParam
        : usedList.length >= 10
          ? Math.floor(usedList.length / 10) + 1
          : null;
  return (
    <Board
      blue={sides.a}
      red={sides.b}
      period={q.get("p") || undefined}
      gameNum={activeGameNum}
      slots={slots}
      used={usedList}
      fearless={q.get("f") !== "0"}
      history={history}
      onPeriod={(p) => set({ p })}
      onSlots={(s) => set({ d: packSlots(s) })}
      onUsed={(u) => set({ u: u.join(",") })}
      onFearless={(on) => set({ f: on ? "" : "0" })}
      onHistory={(h) => set({ h: packHistory(h), g: h.length ? String(h.length + 1) : "" })}
      onNextGame={(h, u) => set({ h: packHistory(h), u: u.join(","), d: "", g: String(h.length + 1) })}
      onLoadPastGame={(idx) => {
        const target = history[idx];
        if (!target) return;
        const prior = history.slice(0, idx);
        const priorPicks = prior.flatMap((pg) => pg.slots.filter((s, k): s is string => !!s && !ORDER[k].ban));
        set({
          a: target.blue || a,
          b: target.red || b,
          g: String(idx + 1),
          d: packSlots(target.slots),
          u: [...new Set(priorPicks)].join(","),
          h: packHistory(prior),
        });
      }}
      onSwap={() => set({ a: b, b: a, d: packSlots(swapDraftSlots(slots)) })}
      onSides={(x, y) => setSides({ a: x, b: y })}
    />
  );
};

type PoolFilter = "all" | "played" | "blue" | "red" | "both" | "flex" | "pocket";
type SortKey = "picked" | "wr" | "bans" | "az";

function champHasRole(c: string, r: number, pools: { b: Pool; r: Pool }): boolean {
  if (pools.b.roles.get(c)?.has(r) || pools.r.roles.get(c)?.has(r)) return true;
  if (pools.b.players.get(c)?.some((p) => p.role === r && (p.g > 0 || p.cg >= 3))) return true;
  if (pools.r.players.get(c)?.some((p) => p.role === r && (p.g > 0 || p.cg >= 3))) return true;
  return false;
}

const Board: React.FC<{
  blue: Side;
  red: Side;
  period?: string;
  gameNum?: number | null;
  slots: (string | null)[];
  used: string[];
  fearless: boolean;
  history: PastGame[];
  onPeriod: (p: string) => void;
  onSlots: (s: (string | null)[]) => void;
  onUsed: (u: string[]) => void;
  onFearless: (on: boolean) => void;
  onHistory: (h: PastGame[]) => void;
  onNextGame: (h: PastGame[], u: string[]) => void;
  onLoadPastGame: (idx: number) => void;
  onSwap: () => void;
  onSides: (blue: Side, red: Side) => void;
}> = ({ blue, red, period: periodQ, gameNum, slots, used, fearless, history, onPeriod, onSlots, onUsed, onFearless, onHistory, onNextGame, onLoadPastGame, onSwap, onSides }) => {
  const options = useMemo(() => bothOptions(blue.games.map(teamRowRef), red.games.map(teamRowRef)), [blue.games, red.games]);
  const period: PeriodKey = periodQ && options.some((o) => o.key === periodQ) ? periodQ : defaultPeriod(options);
  const notFull = blue.gamesFull === false || red.gamesFull === false || [...blue.players, ...red.players].some((p) => p && !p.full);
  const askedOlder = !!periodQ && !options.some((o) => o.key === periodQ);
  const wantFull = notFull && (askedOlder || needsFullLogs(period, [...blue.games, ...red.games]));
  useEffect(() => {
    if (!wantFull) return;
    let alive = true;
    Promise.all([loadFullLogs(blue), loadFullLogs(red)]).then(([x, y]) => alive && onSides(x, y));
    return () => {
      alive = false;
    };
  }, [wantFull]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sideOnly, setSideOnly] = useState(false);
  const pools = useMemo(
    () => ({ b: pool(blue, period, sideOnly ? "b" : undefined), r: pool(red, period, sideOnly ? "r" : undefined) }),
    [blue, red, period, sideOnly],
  );
  const [cursor, setCursor] = useState<number | null>(null);
  const [sameTeamBans, setSameTeamBans] = useState<boolean>(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<number | "open" | null>(null);
  const [poolFilter, setPoolFilter] = useState<PoolFilter>("all");
  const [minGames, setMinGames] = useState<number>(0);
  const [sortBy, setSortBy] = useState<SortKey>("picked");
  const [hideTaken, setHideTaken] = useState<boolean>(true);
  const firstEmpty = slots.findIndex((s) => s === null);
  const allPicksFilled = ORDER.every((o, i) => o.ban || !!slots[i]);
  const step = cursor != null && cursor >= 0 && cursor < SLOTS ? cursor : allPicksFilled ? -1 : firstEmpty;
  const taken = useMemo(() => buildTakenSet(slots, used, fearless), [slots, used, fearless]);

  const now = step >= 0 && step < SLOTS ? ORDER[step] : null;
  const team = (w: Who) => (w === "b" ? blue : red);
  const picksOf = (w: Who) => ORDER.map((o, i) => (o.side === w && !o.ban ? slots[i] : null)).filter((c): c is string => !!c);
  const bansOf = (w: Who) => ORDER.map((o, i) => (o.side === w && o.ban ? slots[i] : null)).filter((c): c is string => !!c);

  const activeSide: Who = now ? now.side : "b";
  const [champMap, setChampMap] = useState<Record<string, HubChamp | null>>({});
  useEffect(() => {
    const picked = slots.filter((s, i): s is string => !!s && !ORDER[i].ban);
    const missing = picked.filter((c) => !(c in champMap) && !(bare(c) in champMap));
    if (!missing.length) return;
    let alive = true;
    Promise.all(
      missing.map((c) =>
        loadHubChamp(prettySlug(c))
          .then((ch) => [c, ch] as const)
          .catch(() => [c, null] as const),
      ),
    ).then((pairs) => {
      if (!alive) return;
      setChampMap((prev) => {
        const next = { ...prev };
        for (const [c, ch] of pairs) {
          next[c] = ch;
          next[bare(c)] = ch;
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const filledRoles = useMemo(() => {
    const pks = ORDER.map((o, i) => (o.side === activeSide && !o.ban ? slots[i] : null)).filter((c): c is string => !!c);
    const assigned = assignDraftRoles(pks, pools[activeSide], champMap);
    return new Set([...assigned.values()].filter((r): r is number => r != null));
  }, [slots, activeSide, pools, champMap]);
  const openRoles = useMemo(() => [0, 1, 2, 3, 4].filter((r) => !filledRoles.has(r)), [filledRoles]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (c: string) => {
      const k = bare(c);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(c);
    };
    for (const p of [pools.b, pools.r]) {
      for (const c of [...p.picks.keys(), ...p.bans.keys(), ...p.bansVs.keys(), ...p.players.keys()]) add(c);
    }
    for (const c of championList()) add(c);
    return out.sort((x, y) => champName(x).localeCompare(champName(y)));
  }, [pools]);

  const takenCount = useMemo(() => all.filter((c) => isChampTaken(c, taken)).length, [all, taken]);
  const availableTotal = hideTaken ? all.length - takenCount : all.length;

  const bq = bare(search.trim());
  const shown = useMemo(() => {
    const filtered = all.filter((c) => {
      if (hideTaken && isChampTaken(c, taken)) return false;
      if (
        search.trim() &&
        !champName(c).toLowerCase().includes(search.trim().toLowerCase()) &&
        !c.toLowerCase().includes(search.trim().toLowerCase()) &&
        !(bq.length >= 2 && (bare(champName(c)).includes(bq) || bare(c).includes(bq)))
      ) {
        return false;
      }
      if (role === "open") {
        if (openRoles.length > 0 && !openRoles.some((r) => champHasRole(c, r, pools))) return false;
      } else if (role != null) {
        if (!champHasRole(c, role, pools)) return false;
      }
      const pb = pools.b.picks.get(c)?.[0] || 0;
      const pr = pools.r.picks.get(c)?.[0] || 0;
      const bStarter = (pools.b.players.get(c) || []).some((p) => p.g > 0 || p.cg >= 3);
      const rStarter = (pools.r.players.get(c) || []).some((p) => p.g > 0 || p.cg >= 3);
      if (poolFilter === "played" && pb === 0 && pr === 0 && !bStarter && !rStarter) return false;
      if (poolFilter === "blue" && pb === 0 && !bStarter) return false;
      if (poolFilter === "red" && pr === 0 && !rStarter) return false;
      if (poolFilter === "both" && !((pb > 0 || bStarter) && (pr > 0 || rStarter))) return false;
      if (poolFilter === "flex") {
        const flexRoles = new Set([...(pools.b.roles.get(c) || []), ...(pools.r.roles.get(c) || [])]);
        if (flexRoles.size < 2) return false;
      }
      if (poolFilter === "pocket") {
        const hasPocket = [...(pools.b.players.get(c) || []), ...(pools.r.players.get(c) || [])].some((p) => p.g === 0 && p.cg >= 3);
        if (pb + pr > 0 || !hasPocket) return false;
      }
      if (minGames > 0) {
        if (poolFilter === "blue" && pb < minGames) return false;
        else if (poolFilter === "red" && pr < minGames) return false;
        else if (poolFilter === "both" && (pb < minGames || pr < minGames)) return false;
        else if (pb + pr < minGames) return false;
      }
      return true;
    });

    const statsOf = (c: string) => {
      const [gb, wb] = pools.b.picks.get(c) || [0, 0];
      const [gr, wr] = pools.r.picks.get(c) || [0, 0];
      const g = poolFilter === "blue" ? gb : poolFilter === "red" ? gr : gb + gr;
      const w = poolFilter === "blue" ? wb : poolFilter === "red" ? wr : wb + wr;
      const comf =
        poolFilter === "blue"
          ? comfort(gb, wb)
          : poolFilter === "red"
            ? comfort(gr, wr)
            : comfort(gb, wb) + comfort(gr, wr);
      const bans =
        (pools.b.bans.get(c) || 0) +
        (pools.r.bans.get(c) || 0) +
        (pools.b.bansVs.get(c) || 0) +
        (pools.r.bansVs.get(c) || 0);
      const career = [...(pools.b.players.get(c) || []), ...(pools.r.players.get(c) || [])].reduce((acc, p) => Math.max(acc, p.cg), 0);
      return { g, w, comf, bans, career };
    };

    return [...filtered].sort((x, y) => {
      if (sortBy === "az") return champName(x).localeCompare(champName(y));
      const sx = statsOf(x);
      const sy = statsOf(y);
      if (sortBy === "bans") {
        return sy.bans - sx.bans || sy.comf - sx.comf || sy.g - sx.g || champName(x).localeCompare(champName(y));
      }
      if (sortBy === "wr") {
        const wx = sx.g > 0 ? sx.w / sx.g : -1;
        const wy = sy.g > 0 ? sy.w / sy.g : -1;
        return wy - wx || sy.g - sx.g || sy.comf - sx.comf || champName(x).localeCompare(champName(y));
      }
      return sy.comf - sx.comf || sy.g - sx.g || sy.bans - sx.bans || sy.career - sx.career || champName(x).localeCompare(champName(y));
    });
  }, [all, hideTaken, taken, search, bq, role, openRoles, pools, poolFilter, minGames, sortBy]);

  const hasActiveFilters =
    !!search.trim() || role !== null || poolFilter !== "all" || minGames > 0 || !hideTaken || sortBy !== "picked";

  const clearAllFilters = () => {
    setSearch("");
    setRole(null);
    setPoolFilter("all");
    setMinGames(0);
    setSortBy("picked");
    setHideTaken(true);
  };

  const place = (c: string) => {
    if (step < 0 || step >= SLOTS || isChampTaken(c, taken)) return;
    const next = [...slots];
    next[step] = c;
    onSlots(next);
    const nextIdx = nextDraftSlot(next, step, sameTeamBans);
    if (nextIdx == null || !ORDER[nextIdx].ban) setSameTeamBans(false);
    setCursor(nextIdx);
    setFocus(c);
  };
  const selectSlot = (i: number, fromTeamColumn = false) => {
    setSameTeamBans(fromTeamColumn && ORDER[i]?.ban === true);
    // If clicking a filled slot that isn't currently focused as the cursor, select it first so a champion click replaces it;
    // clicking it again clears it to empty.
    if (slots[i] !== null && cursor !== i) {
      setCursor(i);
      setFocus(slots[i]);
      return;
    }
    if (slots[i] !== null) {
      const next = [...slots];
      next[i] = null;
      onSlots(next);
    }
    setCursor(i);
  };
  const undo = () => {
    const last = slots
      .map((s, i) => (s ? i : -1))
      .filter((i) => i >= 0)
      .pop();
    if (last != null) {
      const next = [...slots];
      next[last] = null;
      onSlots(next);
      setCursor(last);
    }
  };
  const reset = () => {
    onSlots(ORDER.map(() => null));
    setCursor(null);
    setSameTeamBans(false);
  };
  const nextGame = () => {
    const picks = slots.filter((s, i): s is string => !!s && !ORDER[i].ban);
    const h = picks.length ? [...history, { blue: blue.team.u, red: red.team.u, slots }] : history;
    onNextGame(h, [...new Set([...used, ...picks])]);
    setCursor(null);
    setSameTeamBans(false);
  };

  const autoFillPhase = () => {
    if (step < 0 || step >= SLOTS) return;
    const phaseIndices = step < 6 ? [0, 1, 2, 3, 4, 5] : step < 12 ? [6, 7, 8, 9, 10, 11] : step < 16 ? [12, 13, 14, 15] : [16, 17, 18, 19];
    const ordered = [...phaseIndices.filter((i) => i >= step), ...phaseIndices.filter((i) => i < step)];
    const curSlots = [...slots];
    let lastPlaced: string | null = null;
    for (const idx of ordered) {
      if (curSlots[idx] !== null) continue;
      const turn = ORDER[idx];
      const curTaken = buildTakenSet(curSlots, used, fearless);
      const myPks = ORDER.map((o, k) => (o.side === turn.side && !o.ban ? curSlots[k] : null)).filter((c): c is string => !!c);
      const theirSide: Who = turn.side === "b" ? "r" : "b";
      const theirPks = ORDER.map((o, k) => (o.side === theirSide && !o.ban ? curSlots[k] : null)).filter((c): c is string => !!c);
      const sugs = computeDraftSuggestions({
        step: idx,
        now: turn,
        me: pools[turn.side],
        them: pools[theirSide],
        meSide: team(turn.side),
        themSide: team(theirSide),
        myPicks: myPks,
        theirPicks: theirPks,
        taken: curTaken,
        period,
        champMap,
      });
      if (sugs.length > 0) {
        curSlots[idx] = sugs[0].c;
        lastPlaced = sugs[0].c;
      }
    }
    onSlots(curSlots);
    const afterPhaseEnd = phaseIndices[phaseIndices.length - 1];
    let nextCur: number | null = null;
    for (let i = afterPhaseEnd + 1; i < SLOTS; i++) {
      if (curSlots[i] === null) {
        nextCur = i;
        break;
      }
    }
    setSameTeamBans(false);
    setCursor(nextCur);
    if (lastPlaced) setFocus(lastPlaced);
  };

  const draftText = () => {
    const lines: string[] = [];
    const per = options.find((o) => o.key === period)?.label || period;
    lines.push(`${blue.team.name} (${tl("Blue side")}) vs ${red.team.name} (${tl("Red side")}) – ${tl("Draft board")} · ${tl("Pools from")} ${per}`);
    history.forEach((g, i) => {
      const bn = g.blue === blue.team.u ? blue.team.name : red.team.name;
      const rn = g.red === red.team.u ? red.team.name : blue.team.name;
      const pb = ORDER.map((o, k) => (o.side === "b" && !o.ban ? g.slots[k] : null)).filter(Boolean).map((c) => champName(c as string));
      const pr = ORDER.map((o, k) => (o.side === "r" && !o.ban ? g.slots[k] : null)).filter(Boolean).map((c) => champName(c as string));
      lines.push(`${tl("Game {n}", { n: i + 1 })}: ${bn} ${pb.join(", ")} | ${rn} ${pr.join(", ")}`);
    });
    for (const w of ["b", "r"] as Who[]) {
      const t = team(w);
      const p = pools[w];
      const pks = picksOf(w);
      const assigned = assignDraftRoles(pks, p, champMap);
      const picks = pks.map((c) => {
        const r = assigned.get(c) ?? roleOf(c, p, champMap);
        return r == null ? champName(c) : `${roleName(ROLES[r])} ${champName(c)}`;
      });
      lines.push(`${t.team.name}: ${tl("Bans")} ${bansOf(w).map(champName).join(", ") || "–"} · ${tl("Picks")} ${picks.join(", ") || "–"}`);
    }
    lines.push(window.location.href);
    return lines.join("\n");
  };

  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-rw-accent">
            {tl("Draft board")}
            {gameNum != null && gameNum >= 1 ? ` · ${tl("Game {n}", { n: gameNum })}` : ""}
          </div>
          <h1 className="text-lg font-bold flex flex-wrap items-center gap-2 min-w-0">
            <HubLink to={{ kind: "team", slug: blue.team.u }} className="inline-flex items-center gap-1.5 min-w-0 text-rw-side-a hover:underline">
              <TeamLogo name={blue.team.name} size={22} />
              <span className="truncate">{blue.team.name}</span>
            </HubLink>
            <span className="text-rw-muted font-normal">vs</span>
            <HubLink to={{ kind: "team", slug: red.team.u }} className="inline-flex items-center gap-1.5 min-w-0 text-rw-side-b hover:underline">
              <TeamLogo name={red.team.name} size={22} />
              <span className="truncate">{red.team.name}</span>
            </HubLink>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-rw-muted">{tl("Pools from")}</span>
          <PeriodPicker options={options} value={period} onChange={onPeriod} />
          <label
            className="flex items-center gap-1 text-rw-sub cursor-pointer"
            title={`${tl("Blue side only")} / ${tl("Red side only")}`}
          >
            <input type="checkbox" checked={sideOnly} onChange={(e) => setSideOnly(e.target.checked)} />
            {tl("Blue / red side")}
          </label>
          <button type="button" onClick={onSwap} className="flex items-center gap-1 text-rw-accent hover:underline" title={tl("The teams change sides; the draft on the board starts over")}>
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {tl("Swap sides")}
          </button>
          <CopyDraft text={draftText} />
          {slots.some((s) => s) && (
            <BroadcastCardButton
              data={() => {
                // each pick with the role it most likely fills and the player on the roster who plays it
                const sideOf = (w: Who): BoardSide => {
                  const pks = picksOf(w);
                  const assigned = assignDraftRoles(pks, pools[w], champMap);
                  return {
                    name: team(w).team.name,
                    bans: bansOf(w),
                    picks: pks.map((c) => {
                      const r = assigned.get(c) ?? roleOf(c, pools[w], champMap);
                      return { c, role: r == null ? undefined : roleName(ROLES[r]), player: champOf(c, pools[w])?.name };
                    }),
                  };
                };
                const pk = (g: PastGame, w: Who) => ORDER.map((o, k) => (o.side === w && !o.ban ? g.slots[k] : null)).filter((c): c is string => !!c);
                return draftBoardCard({
                  blue: sideOf("b"),
                  red: sideOf("r"),
                  period: options.find((o) => o.key === period)?.label || "",
                  earlier: fearless ? history.map((g) => ({ blue: pk(g, "b"), red: pk(g, "r") })) : [],
                });
              }}
              name={`${blue.team.name}-vs-${red.team.name}-draft`}
              label={tl("Overview card")}
            />
          )}
          <HubLink to={{ kind: "prep", a: blue.team.u, b: red.team.u, period }} className="text-rw-accent hover:underline">
            {tl("Match prep")}
          </HubLink>
          <HubLink to={{ kind: "compare", mode: "team", a: blue.team.u, b: red.team.u, period }} className="text-rw-accent hover:underline">
            {tl("Compare")}
          </HubLink>
          <HubLink
            to={{ kind: "finder", query: `team=${encodeURIComponent(blue.team.name)}&vs=${encodeURIComponent(red.team.name)}` }}
            className="text-rw-accent hover:underline"
          >
            {tl("Game finder")}
          </HubLink>
        </div>
      </div>

      {/* phones and tablets: both boards side by side, the champion picker under them (so a pick shows on the board) */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)]">
        <TeamColumn who="b" side={blue} pool={pools.b} slots={slots} step={step} champMap={champMap} onSelect={(i) => selectSlot(i, true)} />
        <div className="space-y-3 min-w-0 col-span-2 order-last lg:col-span-1 lg:order-none">
          <div className={`${card} space-y-2`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`font-bold ${now ? (now.side === "b" ? "text-rw-side-a" : "text-rw-side-b") : "text-rw-accent"}`}>
                {now
                  ? `#${step + 1} · ${
                      now.ban
                        ? tl("{team} to ban", { team: team(now.side).team.name })
                        : tl("{team} to pick", { team: team(now.side).team.name })
                    }`
                  : tl("Draft complete")}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <button type="button" onClick={undo} className="flex items-center gap-1 text-rw-sub hover:text-rw-text">
                  <Undo2 className="w-3.5 h-3.5" />
                  {tl("Undo")}
                </button>
                <button type="button" onClick={reset} className="flex items-center gap-1 text-rw-sub hover:text-rw-text">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {tl("Reset")}
                </button>
                <label className="flex items-center gap-1 text-rw-sub" title={tl("Fearless: champions picked in earlier games of the series can't be picked again")}>
                  <input type="checkbox" checked={fearless} onChange={(e) => onFearless(e.target.checked)} />
                  {tl("Fearless")}
                </label>
                {fearless && (
                  <button
                    type="button"
                    onClick={nextGame}
                    className="flex items-center gap-1 text-rw-accent hover:underline"
                    title={tl("Keeps this game's picks out of the next draft and clears the board")}
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                    {tl("Next game")}
                  </button>
                )}
              </span>
            </div>
            <DraftOrderStrip slots={slots} step={step} blueName={blue.team.name} redName={red.team.name} onSelect={(i) => selectSlot(i, false)} />
            {now && (
              <Suggest
                step={step}
                now={now}
                me={pools[now.side]}
                them={pools[now.side === "b" ? "r" : "b"]}
                meSide={team(now.side)}
                themSide={team(now.side === "b" ? "r" : "b")}
                myPicks={picksOf(now.side)}
                theirPicks={picksOf(now.side === "b" ? "r" : "b")}
                taken={taken}
                period={period}
                champMap={champMap}
                onPick={place}
                onFocus={setFocus}
                onAutoFillPhase={autoFillPhase}
              />
            )}
            {fearless && (used.length > 0 || history.length > 0) && (
              <div className="space-y-1 text-[10px] text-rw-muted">
                {history.map((g, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onLoadPastGame(i)}
                      className="font-semibold text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Game {n}", { n: i + 1 })}
                    </button>
                    <span className="text-rw-side-a">{g.blue === blue.team.u ? blue.team.name : red.team.name}</span>
                    {ORDER.map((o, k) => (o.side === "b" && !o.ban && g.slots[k] ? <ChampIcon key={k} name={g.slots[k] as string} size={16} /> : null))}
                    <span className="text-rw-side-b ml-1">{g.red === red.team.u ? red.team.name : blue.team.name}</span>
                    {ORDER.map((o, k) => (o.side === "r" && !o.ban && g.slots[k] ? <ChampIcon key={k} name={g.slots[k] as string} size={16} /> : null))}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-1">
                  {tl("Used in earlier games:")}
                  {used.map((c) => (
                    <ChampIcon key={c} name={c} size={16} className="opacity-60" />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      onUsed([]);
                      onHistory([]);
                    }}
                    className="text-rw-accent hover:underline ml-1"
                  >
                    {tl("Clear")}
                  </button>
                  {history.length > 0 && <span className="ml-1">{tl("Teams usually change sides between games: Swap sides.")}</span>}
                </div>
              </div>
            )}
            <div className="space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const openHit = shown.find((c) => !isChampTaken(c, taken));
                      if (openHit) {
                        e.preventDefault();
                        place(openHit);
                        setSearch("");
                      }
                    }
                  }}
                  placeholder={tl("Search champions…")}
                  aria-label={tl("Search champions…")}
                  className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-rw-text w-full sm:w-36"
                />
                <span className="flex flex-wrap gap-1">
                  {([null, 0, 1, 2, 3, 4] as const).map((r) => (
                    <button
                      key={String(r)}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`px-2 py-1 rounded border ${role === r ? "border-rw-accent text-rw-accent bg-rw-accent/10" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
                      title={r == null ? undefined : tl("Champions these teams played in this role")}
                    >
                      {r == null ? tl("All") : roleName(ROLES[r])}
                    </button>
                  ))}
                  {filledRoles.size > 0 && openRoles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRole(role === "open" ? null : "open")}
                      className={`px-2 py-1 rounded border ${role === "open" ? "border-rw-accent text-rw-accent bg-rw-accent/10" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
                      title={tl("Roles the picks so far cover")}
                    >
                      {openRoles.map((r) => roleName(ROLES[r])).join(" / ")}
                    </button>
                  )}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1 text-[11px]">
                  {(
                    [
                      ["picked", tl("Most picked")],
                      ["wr", tl("Best win rate")],
                      ["bans", tl("Bans")],
                      ["az", "A–Z"],
                    ] as [SortKey, string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSortBy(k)}
                      className={`px-1.5 py-0.5 rounded border ${sortBy === k ? "border-rw-accent text-rw-accent bg-rw-accent/10" : "border-rw-border text-rw-muted hover:text-rw-text"}`}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {(
                  [
                    ["all", tl("All"), "text-rw-sub"],
                    ["played", tl("Champions played"), "text-rw-sub"],
                    ["blue", blue.team.name, "text-rw-side-a"],
                    ["red", red.team.name, "text-rw-side-b"],
                    ["both", tl("Champions both played"), "text-rw-sub"],
                    ["flex", tl("Flex picks"), "text-rw-sub"],
                    ["pocket", tl("pocket pick"), "text-rw-sub"],
                  ] as [PoolFilter, string, string][]
                ).map(([k, label, tone]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPoolFilter(poolFilter === k && k !== "all" ? "all" : k)}
                    className={`px-2 py-0.5 rounded border ${
                      poolFilter === k ? "border-rw-accent text-rw-accent bg-rw-accent/10 font-semibold" : `border-rw-border ${tone} hover:text-rw-text`
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMinGames(minGames === 2 ? 0 : 2)}
                  className={`px-2 py-0.5 rounded border ${
                    minGames === 2 ? "border-rw-accent text-rw-accent bg-rw-accent/10 font-semibold" : "border-rw-border text-rw-sub hover:text-rw-text"
                  }`}
                >
                  {tl("{n}+ games", { n: 2 })}
                </button>
                {takenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setHideTaken((v) => !v)}
                    className={`px-2 py-0.5 rounded border ${
                      hideTaken ? "border-rw-accent/60 text-rw-accent bg-rw-accent/10 font-semibold" : "border-rw-border text-rw-muted hover:text-rw-text"
                    }`}
                    title={tl("Fearless: champions picked in earlier games of the series can't be picked again")}
                  >
                    {tl("Most picked, still open")} ({takenCount})
                  </button>
                )}
                <span className="ml-auto flex items-center gap-2 text-[10px] text-rw-muted tabular-nums">
                  <span>{tl("{shown} of {total}", { shown: shown.length, total: availableTotal })}</span>
                  {hasActiveFilters && (
                    <button type="button" onClick={clearAllFilters} className="text-rw-accent hover:underline">
                      {tl("Clear filters")}
                    </button>
                  )}
                </span>
              </div>
            </div>
            {shown.length === 0 ? (
              <div className="py-6 text-center text-xs text-rw-muted space-y-1">
                <p>{tl("No games match these filters.")}</p>
                {hasActiveFilters && (
                  <button type="button" onClick={clearAllFilters} className="text-rw-accent hover:underline">
                    {tl("Clear filters")}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1 max-h-[22rem] max-sm:max-h-[55vh] overflow-y-auto pr-1">
                {shown.map((c) => {
                  const off = isChampTaken(c, taken);
                  const pb = pools.b.picks.get(c)?.[0] || 0;
                  const pr = pools.r.picks.get(c)?.[0] || 0;
                  const isFlex = new Set([...(pools.b.roles.get(c) || []), ...(pools.r.roles.get(c) || [])]).size >= 2;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={off}
                      onClick={() => place(c)}
                      onMouseEnter={() => setFocus(c)}
                      onFocus={() => setFocus(c)}
                      className={`relative flex flex-col items-center gap-0.5 p-1 rounded border text-[9px] leading-tight ${
                        off ? "opacity-25 border-transparent" : focus === c ? "border-rw-accent" : "border-transparent hover:border-rw-line"
                      }`}
                      title={champName(c)}
                    >
                      <ChampIcon name={c} size={36} />
                      <span className="truncate w-full text-center text-rw-sub">{champName(c)}</span>
                      {pb > 0 && <span className="absolute top-0 left-0 px-0.5 rounded bg-rw-side-a text-rw-bg font-bold">{pb}</span>}
                      {pr > 0 && <span className="absolute top-0 right-0 px-0.5 rounded bg-rw-side-b text-rw-bg font-bold">{pr}</span>}
                      {isFlex && <span className="absolute bottom-3.5 right-0.5 px-0.5 rounded bg-rw-accent/85 text-rw-bg font-bold text-[8px]">{tl("flex")}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-rw-muted">
              {tl("Numbers on a champion: games each team picked it in this period. Click a filled slot to change it.")}
            </p>
          </div>
          {focus && <ChampInfo c={focus} pools={pools} blue={blue} red={red} taken={taken} hideTaken={hideTaken} />}
        </div>
        <TeamColumn who="r" side={red} pool={pools.r} slots={slots} step={step} champMap={champMap} onSelect={(i) => selectSlot(i, true)} />
      </div>

      {(picksOf("b").length > 0 || picksOf("r").length > 0) && (
        <DraftMatchupPanel
          blue={blue}
          red={red}
          pools={pools}
          bluePicks={picksOf("b")}
          redPicks={picksOf("r")}
          period={period}
          champMap={champMap}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <PlayerPools
          who="b"
          side={blue}
          pool={pools.b}
          taken={taken}
          hideTaken={hideTaken}
          roleFilter={typeof role === "number" ? role : null}
          minGames={minGames}
          onPick={place}
          onFocus={setFocus}
          onSwap={(rIdx, slug) => swapPlayerInSide(blue, rIdx, slug).then((nb) => onSides(nb, red))}
        />
        <PlayerPools
          who="r"
          side={red}
          pool={pools.r}
          taken={taken}
          hideTaken={hideTaken}
          roleFilter={typeof role === "number" ? role : null}
          minGames={minGames}
          onPick={place}
          onFocus={setFocus}
          onSwap={(rIdx, slug) => swapPlayerInSide(red, rIdx, slug).then((nr) => onSides(blue, nr))}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Priorities who="b" side={blue} pool={pools.b} other={pools.r} taken={taken} onPick={place} />
        <Priorities who="r" side={red} pool={pools.r} other={pools.b} taken={taken} onPick={place} />
      </div>
      <FearlessDepth a={blue} b={red} period={period} periodLabel="" title={`${blue.team.name}-${red.team.name}`} exclude={hideTaken ? taken : undefined} />
    </div>
  );
};

/** "Copy draft": the board as text with its link, for the team chat. */
const CopyDraft: React.FC<{ text: () => string }> = ({ text }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text()).then(() => setState("copied"), () => setState("failed"))}
      className="flex items-center gap-1 text-rw-accent hover:underline"
      title={tl("Copy the draft as text, with the link, to paste in the team chat")}
    >
      {state === "copied" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Copy failed") : tl("Copy draft")}
    </button>
  );
};

export interface DraftSuggestion {
  c: string;
  score: number;
  why: string;
  role: number | null;
  stat: string;
  badge?: string;
  badgeTone?: "teal" | "red" | "accent";
  dim?: boolean;
}

/**
 * Phase-aware ban and context-aware pick suggestions:
 * - Ban Phase 1 (steps 0..5): opponent comfort (games × win rate), respect-ban frequency, flex picks, signature pockets, and Fearless pinch roles.
 * - Ban Phase 2 (steps 12..15): filters to the opponent's remaining open roles (resolving flexes), boosting Fearless pool pinches and counter-protection bans against our locked picks.
 * - Pick Phases (steps 6..11, 16..19): resolves flex roles via `assignDraftRoles`, boosts contested picks in Phase 1, proven Mid+JG / Bot+Sup duos, and pro lane answers into opponent locks.
 */
export function computeDraftSuggestions(opts: {
  step: number;
  now: { side: Who; ban: boolean };
  me: Pool;
  them: Pool;
  meSide?: Side;
  themSide?: Side;
  myPicks: string[];
  theirPicks?: string[];
  taken: Set<string>;
  period?: PeriodKey;
  champMap?: Record<string, HubChamp | null>;
}): DraftSuggestion[] {
  const { step, now, me, them, meSide, themSide, myPicks, theirPicks = [], taken, period = "all", champMap } = opts;
  const myAssigned = assignDraftRoles(myPicks, me, champMap);
  const theirAssigned = assignDraftRoles(theirPicks, them, champMap);
  const myFilled = new Set([...myAssigned.values()].filter((r): r is number => r != null));
  const theirFilled = new Set([...theirAssigned.values()].filter((r): r is number => r != null));
  const isPhase2 = step >= 12;

  const themPinchRoles = new Set<number>();
  for (const pl of them.byPlayer) {
    const openComfort = pl.champs.filter((x) => x.g >= 2 && !isChampTaken(x.c, taken)).length;
    if (openComfort <= 2) themPinchRoles.add(pl.role);
  }

  if (now.ban) {
    const candMap = new Map<string, [number, number]>();
    for (const [c, gw] of them.picks.entries()) {
      if (!isChampTaken(c, taken)) candMap.set(c, gw);
    }
    for (const pl of them.byPlayer) {
      for (const x of pl.champs) {
        if (x.g === 0 && x.cg >= 5 && x.cw / x.cg >= 0.55 && !isChampTaken(x.c, taken) && !candMap.has(x.c)) {
          candMap.set(x.c, [0, 0]);
        }
      }
    }
    const rows: DraftSuggestion[] = [];
    for (const [c, [g, w]] of candMap.entries()) {
      const r = roleOf(c, them, champMap);
      const roleSet = them.roles.get(c);
      const openCandRoles = [r, ...(roleSet || [])].filter((rr): rr is number => rr != null && !theirFilled.has(rr));
      // In Ban Phase 2 (Bans 4–5), exclude champions whose roles on the opponent are all already filled in Picks 1–3
      if (isPhase2 && theirFilled.size > 0 && r != null && openCandRoles.length === 0) {
        continue;
      }
      const targetRole = openCandRoles[0] ?? r;
      const who = champOf(c, them);
      const parts = [
        who
          ? `${who.name}: ${tl("{n} games, won {pct}", { n: who.g || who.cg, pct: winRate(who.g ? who.w : who.cw, who.g || who.cg) })}`
          : tl("{n} games, won {pct}", { n: g, pct: winRate(w, g) }),
      ];
      if ((me.bans.get(c) || 0) > 0) parts.push(tl("you banned it {n} times", { n: me.bans.get(c) || 0 }));

      let score =
        g > 0
          ? comfort(g, w) * (1 + Math.min(w / Math.max(g, 1), 1))
          : who
            ? comfort(Math.min(who.cg, 8) * 0.35, Math.min(who.cw, 8) * 0.35)
            : 0.1;

      const respectBans = (them.bansVs.get(c) || 0) + (me.bans.get(c) || 0);
      if (respectBans > 0) score *= 1 + Math.min(respectBans, 8) * 0.06;

      const isFlex = (roleSet?.size || 0) > 1;
      if (isFlex && !isPhase2) score *= 1.18;

      const isPinch = targetRole != null && themPinchRoles.has(targetRole) && g >= 2;
      if (isPinch) score *= isPhase2 ? 1.45 : 1.25;

      let counterVs: { myC: string; oppGd15: number } | null = null;
      if (targetRole != null && champMap) {
        const myLanePick = myPicks.find((mc) => myAssigned.get(mc) === targetRole);
        if (myLanePick) {
          const myCh = champMap[myLanePick] || champMap[bare(myLanePick)];
          const mRows = myCh?.matchups12?.[ROLES[targetRole]] || myCh?.matchups?.[ROLES[targetRole]] || [];
          const hit = mRows.find((m) => bare(m[0]) === bare(c) && (m[3] ?? m[1]) >= 2);
          if (hit && hit[4] != null && hit[4] <= -120) {
            score *= 1.35;
            counterVs = { myC: myLanePick, oppGd15: -hit[4] };
          }
        }
      }

      let badge: string | undefined;
      let badgeTone: "teal" | "red" | "accent" | undefined;
      if (counterVs) {
        badge = `vs ${champName(counterVs.myC)} +${counterVs.oppGd15}`;
        badgeTone = "red";
      } else if (isPinch) {
        badge = tl("pinch point");
        badgeTone = "accent";
      } else if (isFlex) {
        badge = tl("flex");
        badgeTone = "accent";
      } else if (g === 0 && who && who.cg >= 5) {
        badge = tl("pocket pick");
        badgeTone = "accent";
      } else if ((them.bansVs.get(c) || 0) >= 3) {
        badge = `${tl("Bans")} ×${them.bansVs.get(c)}`;
        badgeTone = "red";
      }

      rows.push({
        c,
        score,
        why: parts.join(" · "),
        role: targetRole,
        stat: g > 0 ? `${g}G ${winRate(w, g)}` : who ? `${who.cg}G` : "",
        badge,
        badgeTone,
      });
    }
    rows.sort((a, b) => b.score - a.score || champName(a.c).localeCompare(champName(b.c)));
    return rows;
  }

  const tend = meSide ? draftTendencies(inPeriod(meSide.games, period, teamRowRef)) : null;
  const candMap = new Map<string, [number, number]>();
  for (const [c, gw] of me.picks.entries()) {
    if (!isChampTaken(c, taken)) candMap.set(c, gw);
  }
  for (const pl of me.byPlayer) {
    if (myFilled.has(pl.role)) continue;
    for (const x of pl.champs) {
      if (x.g === 0 && x.cg >= 5 && x.cw / x.cg >= 0.55 && !isChampTaken(x.c, taken) && !candMap.has(x.c)) {
        candMap.set(x.c, [0, 0]);
      }
    }
  }

  const rows: DraftSuggestion[] = [];
  for (const [c, [g, w]] of candMap.entries()) {
    const who = champOf(c, me);
    const assignedWithC = assignDraftRoles([...myPicks, c], me, champMap);
    const r = assignedWithC.get(c) ?? roleOf(c, me, champMap);
    const assignedRoles = [...assignedWithC.values()].filter((v): v is number => v != null);
    const hasCollision = new Set(assignedRoles).size < assignedRoles.length;
    const roleTaken = hasCollision || (r != null && myFilled.has(r) && assignedWithC.get(c) === roleOf(c, me, champMap));

    const parts = [
      who
        ? `${who.name}: ${tl("{n} games, won {pct}", { n: who.g || who.cg, pct: winRate(who.g ? who.w : who.cw, who.g || who.cg) })}`
        : tl("{n} games, won {pct}", { n: g, pct: winRate(w, g) }),
    ];
    if (r != null) parts.push(roleTaken ? tl("{role} already picked", { role: roleName(ROLES[r]) }) : roleName(ROLES[r]));
    if ((them.bans.get(c) || 0) > 0) parts.push(tl("they ban it {n} times", { n: them.bans.get(c) || 0 }));
    if ((me.roles.get(c)?.size || 0) > 1) parts.push(tl("flex"));

    let score =
      (g > 0 ? comfort(g, w) : who ? comfort(Math.min(who.cg, 6) * 0.25, Math.min(who.cw, 6) * 0.25) : 0.1) *
      (roleTaken ? 0.25 : 1);

    const isFlex = (me.roles.get(c)?.size || 0) > 1;
    if (isFlex && !roleTaken && !isPhase2) score *= 1.12;

    const themG = them.picks.get(c)?.[0] || 0;
    const themRole = roleOf(c, them, champMap);
    const isContested = !roleTaken && !isPhase2 && themG >= 2 && (themRole == null || !theirFilled.has(themRole));
    if (isContested) score *= 1.22;

    let duoWith: { partner: string; g: number; w: number } | null = null;
    if (!roleTaken && tend && myPicks.length > 0) {
      for (const [p1, p2, pg, pw] of [...tend.botDuos, ...tend.midJungle]) {
        if (pg < 2) continue;
        if (bare(p1) === bare(c) && myPicks.some((mp) => bare(mp) === bare(p2))) {
          duoWith = { partner: p2, g: pg, w: pw };
          break;
        }
        if (bare(p2) === bare(c) && myPicks.some((mp) => bare(mp) === bare(p1))) {
          duoWith = { partner: p1, g: pg, w: pw };
          break;
        }
      }
      if (duoWith) score *= 1.3 + Math.min(duoWith.g, 6) * 0.04;
    }

    let laneEdge: { oppC: string; myGd15: number } | null = null;
    if (!roleTaken && r != null && champMap) {
      const oppLanePick = theirPicks.find((oc) => theirAssigned.get(oc) === r);
      if (oppLanePick) {
        const oppCh = champMap[oppLanePick] || champMap[bare(oppLanePick)];
        const mRows = oppCh?.matchups12?.[ROLES[r]] || oppCh?.matchups?.[ROLES[r]] || [];
        const hit = mRows.find((m) => bare(m[0]) === bare(c) && (m[3] ?? m[1]) >= 2);
        if (hit && hit[4] != null && hit[4] <= -100) {
          score *= 1.32;
          laneEdge = { oppC: oppLanePick, myGd15: -hit[4] };
        }
      }
    }

    let badge: string | undefined;
    let badgeTone: "teal" | "red" | "accent" | undefined;
    if (roleTaken && r != null) {
      badge = tl("{role} already picked", { role: roleName(ROLES[r]) });
    } else if (laneEdge) {
      badge = `vs ${champName(laneEdge.oppC)} +${laneEdge.myGd15}`;
      badgeTone = "teal";
    } else if (duoWith) {
      badge = `+${champName(duoWith.partner)} (${duoWith.g}G)`;
      badgeTone = "teal";
    } else if (isContested) {
      badge = `${themSide?.team.codes?.[0] || themSide?.team.name || "Opp"} ${themG}G`;
      badgeTone = "accent";
    } else if (isFlex) {
      badge = tl("flex");
      badgeTone = "accent";
    } else if (g === 0 && who && who.cg >= 5) {
      badge = tl("pocket pick");
      badgeTone = "accent";
    }

    rows.push({
      c,
      score,
      why: parts.join(" · "),
      role: r,
      stat: g > 0 ? `${g}G ${winRate(w, g)}` : who ? `${who.cg}G` : "",
      badge,
      badgeTone,
      dim: roleTaken,
    });
  }
  rows.sort((a, b) => b.score - a.score || champName(a.c).localeCompare(champName(b.c)));
  return rows;
}

/** What to do with the current ban or pick, and why: the other team's threats, or this team's comfort picks. */
const Suggest: React.FC<{
  step: number;
  now: { side: Who; ban: boolean };
  me: Pool;
  them: Pool;
  meSide: Side;
  themSide: Side;
  myPicks: string[];
  theirPicks: string[];
  taken: Set<string>;
  period: PeriodKey;
  champMap: Record<string, HubChamp | null>;
  onPick: (c: string) => void;
  onFocus: (c: string) => void;
  onAutoFillPhase: () => void;
}> = ({ step, now, me, them, meSide, themSide, myPicks, theirPicks, taken, period, champMap, onPick, onFocus, onAutoFillPhase }) => {
  const rows = useMemo(
    () =>
      computeDraftSuggestions({
        step,
        now,
        me,
        them,
        meSide,
        themSide,
        myPicks,
        theirPicks,
        taken,
        period,
        champMap,
      }),
    [step, now, me, them, meSide, themSide, myPicks, theirPicks, taken, period, champMap],
  );
  const top = rows.slice(0, 5);
  if (!top.length) return null;
  const name = now.ban ? themSide.team.name : meSide.team.name;
  const toneClass = (t?: "teal" | "red" | "accent") =>
    t === "teal"
      ? "bg-rw-teal/15 text-rw-teal"
      : t === "red"
        ? "bg-rw-red/15 text-rw-red"
        : t === "accent"
          ? "bg-rw-accent/15 text-rw-accent"
          : "bg-rw-border text-rw-muted";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="flex items-center gap-1 text-rw-muted" title={now.ban ? tl("What {team} plays best that is still open", { team: name }) : tl("What {team} plays best that is still open", { team: name })}>
        <Lightbulb className="w-3.5 h-3.5 text-rw-accent" />
        {now.ban ? tl("Threats to ban") : tl("Comfort picks")}
      </span>
      {top.map((x) => (
        <button
          key={x.c}
          type="button"
          onClick={() => onPick(x.c)}
          onMouseEnter={() => onFocus(x.c)}
          className={`flex items-center gap-1 rounded border border-rw-border px-1.5 py-0.5 hover:border-rw-accent ${x.dim ? "opacity-60" : ""}`}
          title={x.why}
        >
          <ChampIcon name={x.c} size={18} />
          <span className="text-rw-text font-medium">{champName(x.c)}</span>
          {x.role != null && !x.dim && <span className="text-[9px] text-rw-muted">{roleName(ROLES[x.role])}</span>}
          {x.stat && <span className="text-[10px] text-rw-sub tabular-nums">{x.stat}</span>}
          {x.badge && <span className={`text-[9px] px-1 rounded font-semibold ${toneClass(x.badgeTone)}`}>{x.badge}</span>}
        </button>
      ))}
      <button
        type="button"
        onClick={onAutoFillPhase}
        className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-rw-border text-rw-accent hover:border-rw-accent"
        title={tl("Every open match goes to the team with the better chance")}
      >
        {tl("Favourites")}
      </button>
    </div>
  );
};

/**
 * Live role-by-role (Top -> Support) lane matchup & draft comfort strip once champions are locked onto the board.
 * Resolves flex picks via `assignDraftRoles`, shows starter comfort, pro lane matchup GD@15 & win rate from `HubChamp`,
 * 1-click Game Finder links for locked head-to-head lanes, and active Mid+JG / Bot+Sup duo synergies.
 */
const DraftMatchupPanel: React.FC<{
  blue: Side;
  red: Side;
  pools: { b: Pool; r: Pool };
  bluePicks: string[];
  redPicks: string[];
  period: PeriodKey;
  champMap: Record<string, HubChamp | null>;
}> = ({ blue, red, pools, bluePicks, redPicks, period, champMap }) => {
  const bAssign = useMemo(() => assignDraftRoles(bluePicks, pools.b, champMap), [bluePicks, pools.b, champMap]);
  const rAssign = useMemo(() => assignDraftRoles(redPicks, pools.r, champMap), [redPicks, pools.r, champMap]);
  const bTend = useMemo(() => draftTendencies(inPeriod(blue.games, period, teamRowRef)), [blue.games, period]);
  const rTend = useMemo(() => draftTendencies(inPeriod(red.games, period, teamRowRef)), [red.games, period]);

  const byRole = ROLES.map((rKey, rIdx) => {
    const bChamp = bluePicks.find((c) => bAssign.get(c) === rIdx) || null;
    const rChamp = redPicks.find((c) => rAssign.get(c) === rIdx) || null;
    const bPlayer = bChamp
      ? (pools.b.players.get(bChamp) || []).find((pl) => pl.role === rIdx && (pl.g > 0 || pl.cg > 0)) || champOf(bChamp, pools.b)
      : undefined;
    const rPlayer = rChamp
      ? (pools.r.players.get(rChamp) || []).find((pl) => pl.role === rIdx && (pl.g > 0 || pl.cg > 0)) || champOf(rChamp, pools.r)
      : undefined;
    let laneStats: { g: number; bw: number; bgd: number | null } | null = null;
    if (bChamp && rChamp) {
      const bCh = champMap[bChamp] || champMap[bare(bChamp)];
      const mRows = bCh?.matchups12?.[rKey] || bCh?.matchups?.[rKey] || [];
      const hit = mRows.find((m) => bare(m[0]) === bare(rChamp));
      if (hit) {
        laneStats = { g: hit[1], bw: hit[2], bgd: hit[4] ?? null };
      } else {
        const rCh = champMap[rChamp] || champMap[bare(rChamp)];
        const rmRows = rCh?.matchups12?.[rKey] || rCh?.matchups?.[rKey] || [];
        const rHit = rmRows.find((m) => bare(m[0]) === bare(bChamp));
        if (rHit) {
          laneStats = { g: rHit[1], bw: rHit[1] - rHit[2], bgd: rHit[4] != null ? -rHit[4] : null };
        }
      }
    }
    return { rKey, rIdx, bChamp, rChamp, bPlayer, rPlayer, laneStats };
  });

  const activeDuos: { side: Who; teamName: string; label: string; c1: string; c2: string; g: number; w: number }[] = [];
  const checkDuos = (w: Who, tName: string, pks: string[], tend: ReturnType<typeof draftTendencies>) => {
    for (const [c1, c2, g, wins] of tend.midJungle) {
      if (pks.some((p) => bare(p) === bare(c1)) && pks.some((p) => bare(p) === bare(c2))) {
        activeDuos.push({ side: w, teamName: tName, label: tl("Jungle + mid pairs"), c1, c2, g, w: wins });
      }
    }
    for (const [c1, c2, g, wins] of tend.botDuos) {
      if (pks.some((p) => bare(p) === bare(c1)) && pks.some((p) => bare(p) === bare(c2))) {
        activeDuos.push({ side: w, teamName: tName, label: tl("Bot lane pairs"), c1, c2, g, w: wins });
      }
    }
  };
  checkDuos("b", blue.team.name, bluePicks, bTend);
  checkDuos("r", red.team.name, redPicks, rTend);

  return (
    <Section
      title={`${tl("Lane by lane")} · ${tl("Matchups")}`}
      right={
        <SectionCard
          section={`${tl("Lane by lane")} · ${tl("Matchups")}`}
          sub={`${blue.team.name} vs ${red.team.name}`}
          name={`${blue.team.name}-${red.team.name}-draft-lanes`}
          rows={() =>
            byRole.map(({ rKey, bChamp, rChamp, bPlayer, rPlayer, laneStats }) => ({
              champ: bChamp || rChamp || undefined,
              label: `${roleName(rKey)}: ${bChamp ? champName(bChamp) : "–"} vs ${rChamp ? champName(rChamp) : "–"}`,
              sub: [bPlayer ? `${bPlayer.name} (${bPlayer.g}G)` : "", rPlayer ? `${rPlayer.name} (${rPlayer.g}G)` : ""].filter(Boolean).join(" vs ") || undefined,
              value: laneStats ? `${winRate(laneStats.bw, laneStats.g)} (${laneStats.g}G)` : undefined,
            }))
          }
        />
      }
    >
      <div className="divide-y divide-rw-border/60 text-xs">
        {byRole.map(({ rKey, rIdx, bChamp, rChamp, bPlayer, rPlayer, laneStats }) => (
          <div key={rIdx} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              {bChamp ? (
                <>
                  <ChampIcon name={bChamp} size={24} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-rw-text truncate">{champName(bChamp)}</div>
                    <div className="text-[10px] text-rw-muted truncate tabular-nums">
                      {bPlayer
                        ? bPlayer.g > 0
                          ? `${bPlayer.name} · ${bPlayer.g}G (${winRate(bPlayer.w, bPlayer.g)})`
                          : `${bPlayer.name} · ${tl("pocket pick")} (${bPlayer.cg}G)`
                        : "–"}
                    </div>
                  </div>
                </>
              ) : (
                <span className="text-rw-muted text-[11px]">–</span>
              )}
            </div>

            <div className="flex flex-col items-center justify-center px-2 text-center shrink-0">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-rw-muted">{roleName(rKey)}</span>
              {bChamp && rChamp && (
                <div className="flex flex-col items-center gap-0.5 text-[10px] tabular-nums">
                  <div className="flex items-center gap-1.5">
                    {laneStats ? (
                      <span
                        className={
                          laneStats.bgd != null && laneStats.bgd > 50
                            ? "text-rw-teal font-semibold"
                            : laneStats.bgd != null && laneStats.bgd < -50
                              ? "text-rw-red font-semibold"
                              : "text-rw-sub"
                        }
                        title={tl("Average lead over the lane opponent at 15 minutes")}
                      >
                        {laneStats.bgd != null ? `GD@15 ${laneStats.bgd > 0 ? "+" : ""}${laneStats.bgd} · ` : ""}
                        {winRate(laneStats.bw, laneStats.g)} ({laneStats.g}G)
                      </span>
                    ) : null}
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `champ=${encodeURIComponent(bChamp)}&vs=${encodeURIComponent(rChamp)}&role=${encodeURIComponent(rKey)}`,
                      }}
                      className="text-rw-accent hover:underline"
                    >
                      {tl("Game finder")}
                    </HubLink>
                  </div>
                  {laneStats && laneStats.g > 0 && (
                    <span className="w-16 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex">
                      <span className="h-full bg-rw-side-a/85" style={{ width: `${Math.round((laneStats.bw / laneStats.g) * 100)}%` }} />
                      <span className="h-full bg-rw-side-b/85" style={{ width: `${100 - Math.round((laneStats.bw / laneStats.g) * 100)}%` }} />
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 min-w-0 text-right">
              {rChamp ? (
                <>
                  <div className="min-w-0">
                    <div className="font-semibold text-rw-text truncate">{champName(rChamp)}</div>
                    <div className="text-[10px] text-rw-muted truncate tabular-nums">
                      {rPlayer
                        ? rPlayer.g > 0
                          ? `${rPlayer.name} · ${rPlayer.g}G (${winRate(rPlayer.w, rPlayer.g)})`
                          : `${rPlayer.name} · ${tl("pocket pick")} (${rPlayer.cg}G)`
                        : "–"}
                    </div>
                  </div>
                  <ChampIcon name={rChamp} size={24} className="shrink-0" />
                </>
              ) : (
                <span className="text-rw-muted text-[11px]">–</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {activeDuos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rw-border/60 text-[11px]">
          {activeDuos.map((d, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                d.side === "b" ? "border-rw-side-a/40 bg-rw-side-a/10 text-rw-side-a" : "border-rw-side-b/40 bg-rw-side-b/10 text-rw-side-b"
              }`}
            >
              <span className="font-semibold">{d.teamName}</span>
              <span className="text-rw-muted">({d.label}):</span>
              <ChampIcon name={d.c1} size={14} />
              <span>{champName(d.c1)}</span>
              <span>+</span>
              <ChampIcon name={d.c2} size={14} />
              <span>{champName(d.c2)}</span>
              <span className="tabular-nums font-semibold">
                {d.g}G · {winRate(d.w, d.g)}
              </span>
            </span>
          ))}
        </div>
      )}
    </Section>
  );
};

const PICK_CODES: Record<number, string> = {
  6: "B1",
  7: "R1",
  8: "R2",
  9: "B2",
  10: "B3",
  11: "R3",
  16: "R4",
  17: "B4",
  18: "B5",
  19: "R5",
};

/** Interactive 20-turn strip grouped into the 4 tournament draft phases so users can jump to any turn in real time. */
const DraftOrderStrip: React.FC<{
  slots: (string | null)[];
  step: number;
  blueName: string;
  redName: string;
  onSelect: (i: number) => void;
}> = ({ slots, step, blueName, redName, onSelect }) => {
  const groups: { label: string; indices: number[] }[] = [
    { label: `${tl("Bans")} 1–3`, indices: [0, 1, 2, 3, 4, 5] },
    { label: `${tl("Picks")} 1–3`, indices: [6, 7, 8, 9, 10, 11] },
    { label: `${tl("Bans")} 4–5`, indices: [12, 13, 14, 15] },
    { label: `${tl("Picks")} 4–5`, indices: [16, 17, 18, 19] },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px]">
      {groups.map((grp) => (
        <div key={grp.label} className="flex items-center gap-1">
          <span className="text-rw-muted font-medium">{grp.label}</span>
          <div className="flex items-center gap-0.5">
            {grp.indices.map((i) => {
              const o = ORDER[i];
              const c = slots[i];
              const active = step === i;
              const isBlue = o.side === "b";
              const teamLabel = isBlue ? blueName : redName;
              const code = o.ban ? `#${i + 1}` : PICK_CODES[i] || `#${i + 1}`;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelect(i)}
                  title={`#${i + 1} · ${o.ban ? tl("{team} to ban", { team: teamLabel }) : tl("{team} to pick", { team: teamLabel })}${c ? ` (${champName(c)})` : ""}`}
                  className={`relative flex items-center justify-center rounded border h-6 min-w-[1.55rem] px-1 transition-colors ${
                    active
                      ? "border-rw-accent bg-rw-accent/15 ring-1 ring-rw-accent text-rw-accent font-bold"
                      : isBlue
                        ? "border-rw-side-a/40 bg-rw-side-a/10 text-rw-side-a hover:border-rw-side-a"
                        : "border-rw-side-b/40 bg-rw-side-b/10 text-rw-side-b hover:border-rw-side-b"
                  }`}
                >
                  {c ? (
                    <ChampIcon name={c} size={18} className={o.ban ? "grayscale opacity-80" : ""} />
                  ) : (
                    <span className="leading-none tabular-nums">{code}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/** A side's five bans and five picks arranged in chronological draft phases (Bans 1–3, Picks 1–3, Bans 4–5, Picks 4–5). */
const TeamColumn: React.FC<{
  who: Who;
  side: Side;
  pool: Pool;
  slots: (string | null)[];
  step: number;
  champMap?: Record<string, HubChamp | null>;
  onSelect: (i: number) => void;
}> = ({ who, side, pool: p, slots, step, champMap, onSelect }) => {
  const mine = ORDER.map((o, i) => ({ ...o, i })).filter((o) => o.side === who);
  const bans1 = mine.filter((o) => o.ban && o.i < 6);
  const picks1 = mine.filter((o) => !o.ban && o.i < 12);
  const bans2 = mine.filter((o) => o.ban && o.i >= 12);
  const picks2 = mine.filter((o) => !o.ban && o.i >= 16);
  const picks = mine.filter((o) => !o.ban);
  const color = who === "b" ? "var(--rw-side-a)" : "var(--rw-side-b)";
  const picked = picks.map((o) => slots[o.i]).filter((c): c is string => !!c);
  const assigned = useMemo(() => assignDraftRoles(picked, p, champMap), [picked, p, champMap]);
  const count = [0, 0, 0, 0, 0];
  let unknown = 0;
  for (const c of picked) {
    const r = assigned.get(c) ?? roleOf(c, p, champMap);
    if (r == null) unknown++;
    else count[r]++;
  }
  const selectFirstEmptyIn = (list: { i: number }[]) => {
    const empty = list.find((o) => slots[o.i] === null);
    onSelect((empty || list[0]).i);
  };
  const banSlot = (i: number) => {
    const c = slots[i];
    const active = step === i;
    return (
      <button
        key={i}
        type="button"
        onClick={() => onSelect(i)}
        className={`relative flex flex-col items-center gap-0.5 rounded border p-1 min-w-0 ${
          active ? "border-rw-accent ring-1 ring-rw-accent bg-rw-accent/10" : "border-rw-border hover:border-rw-line bg-rw-bg"
        }`}
        title={c ? `${champName(c)} (#${i + 1}) · ${tl("Click to change")}` : `#${i + 1}`}
        aria-label={c ? `${champName(c)}: ${tl("Click to change")}` : tl("Empty slot")}
      >
        <span className="absolute top-0.5 left-1 text-[9px] text-rw-muted font-semibold tabular-nums leading-none">
          #{i + 1}
        </span>
        {c ? (
          <ChampIcon name={c} size={28} className="grayscale shrink-0" />
        ) : (
          <span className="w-7 h-7 rounded bg-rw-border shrink-0 flex items-center justify-center text-[10px] text-rw-muted font-semibold tabular-nums">
            –
          </span>
        )}
        <span className="block w-full text-center text-[10px] text-rw-sub truncate leading-tight">
          {c ? champName(c) : `#${i + 1}`}
        </span>
      </button>
    );
  };
  const pickSlot = (i: number) => {
    const c = slots[i];
    const active = step === i;
    const r = c ? (assigned.get(c) ?? roleOf(c, p, champMap)) : null;
    const who_ = c
      ? (r != null ? (p.players.get(c) || []).find((pl) => pl.role === r && (pl.g > 0 || pl.cg > 0)) : undefined) || champOf(c, p)
      : undefined;
    const code = PICK_CODES[i] || `#${i + 1}`;
    return (
      <button
        key={i}
        type="button"
        onClick={() => onSelect(i)}
        className={`flex items-center gap-2 rounded border p-1.5 w-full ${
          active ? "border-rw-accent ring-1 ring-rw-accent bg-rw-accent/10" : "border-rw-border hover:border-rw-line bg-rw-bg"
        }`}
        title={c ? `${champName(c)} (${code} · #${i + 1}) · ${tl("Click to change")}` : `${code} · #${i + 1}`}
        aria-label={c ? `${champName(c)}: ${tl("Click to change")}` : tl("Empty slot")}
      >
        {c ? (
          <ChampIcon name={c} size={32} className="shrink-0" />
        ) : (
          <span className="w-8 h-8 rounded bg-rw-border shrink-0 flex items-center justify-center text-[10px] text-rw-muted font-bold tabular-nums">
            {code}
          </span>
        )}
        <span className="min-w-0 text-left flex-1">
          <span className="flex items-center justify-between gap-1 text-xs text-rw-text">
            <span className="truncate font-medium">{c ? champName(c) : code}</span>
            <span className="text-[10px] text-rw-muted tabular-nums shrink-0">#{i + 1}</span>
          </span>
          {c && (
            <span className="block text-[10px] text-rw-muted truncate">
              {r != null ? roleName(ROLES[r]) : tl("role unknown")}
              {who_ && who_.cg > 0 ? ` · ${who_.name}` : ""}
            </span>
          )}
        </span>
      </button>
    );
  };
  return (
    <div className={`${card} space-y-2`} style={{ borderColor: `${color}55` }}>
      <div className="text-xs font-bold flex items-center gap-1.5 min-w-0" style={{ color }}>
        <TeamLogo name={side.team.name} size={16} />
        <span className="truncate">
          {who === "b" ? tl("Blue side") : tl("Red side")}: {side.team.name}
        </span>
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => selectFirstEmptyIn(bans1)}
          className="text-[10px] font-semibold text-rw-muted hover:text-rw-text flex items-center gap-1"
        >
          <span>{tl("Bans")} 1–3</span>
          <span className="text-[9px] font-normal tabular-nums">({bans1.map((o) => `#${o.i + 1}`).join(", ")})</span>
        </button>
        <div className="grid grid-cols-3 gap-1">{bans1.map((o) => banSlot(o.i))}</div>
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => selectFirstEmptyIn(picks1)}
          className="text-[10px] font-semibold text-rw-muted hover:text-rw-text flex items-center gap-1"
        >
          <span>{tl("Picks")} 1–3</span>
          <span className="text-[9px] font-normal tabular-nums">({picks1.map((o) => PICK_CODES[o.i]).join(", ")})</span>
        </button>
        <div className="space-y-1">{picks1.map((o) => pickSlot(o.i))}</div>
      </div>
      <div className="space-y-1 pt-0.5 border-t border-rw-border/60">
        <button
          type="button"
          onClick={() => selectFirstEmptyIn(bans2)}
          className="text-[10px] font-semibold text-rw-muted hover:text-rw-text flex items-center gap-1"
        >
          <span>{tl("Bans")} 4–5</span>
          <span className="text-[9px] font-normal tabular-nums">({bans2.map((o) => `#${o.i + 1}`).join(", ")})</span>
        </button>
        <div className="grid grid-cols-2 gap-1">{bans2.map((o) => banSlot(o.i))}</div>
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => selectFirstEmptyIn(picks2)}
          className="text-[10px] font-semibold text-rw-muted hover:text-rw-text flex items-center gap-1"
        >
          <span>{tl("Picks")} 4–5</span>
          <span className="text-[9px] font-normal tabular-nums">({picks2.map((o) => PICK_CODES[o.i]).join(", ")})</span>
        </button>
        <div className="space-y-1">{picks2.map((o) => pickSlot(o.i))}</div>
      </div>
      {picked.length >= 2 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]" title={tl("Roles the picks so far cover")}>
          {ROLES.map((r, i) => (
            <span key={r} className={count[i] === 1 ? "text-rw-teal" : count[i] > 1 ? "text-rw-accent font-semibold" : "text-rw-muted"}>
              {count[i] > 1 ? `${roleName(r)} ×${count[i]}` : count[i] === 1 ? roleName(r) : `– ${roleName(r)}`}
            </span>
          ))}
          {unknown > 0 && <span className="text-rw-muted">{tl("{n} unknown", { n: unknown })}</span>}
        </div>
      )}
    </div>
  );
};

/** Each player's champions this period (and the ones they only played before), to target bans and read picks. */
const PlayerPools: React.FC<{
  who: Who;
  side: Side;
  pool: Pool;
  taken: Set<string>;
  hideTaken?: boolean;
  roleFilter?: number | null;
  minGames?: number;
  onPick: (c: string) => void;
  onFocus: (c: string) => void;
  onSwap?: (roleIdx: number, slug: string) => void;
}> = ({ who, side, pool: p, taken, hideTaken = true, roleFilter = null, minGames = 0, onPick, onFocus, onSwap }) => {
  const color = who === "b" ? "text-rw-side-a" : "text-rw-side-b";
  const chip = (c: string, label: string, title: string, pocket: boolean) => {
    const off = isChampTaken(c, taken);
    return (
      <button
        key={c}
        type="button"
        disabled={off}
        onClick={() => onPick(c)}
        onMouseEnter={() => onFocus(c)}
        className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] ${off ? "opacity-25 border-transparent line-through" : pocket ? "border-dashed border-rw-border hover:border-rw-accent" : "border-rw-border hover:border-rw-accent"}`}
        title={title}
      >
        <ChampIcon name={c} size={16} />
        <span className="text-rw-text">{champName(c)}</span>
        <span className="text-rw-muted tabular-nums">{label}</span>
      </button>
    );
  };
  const rows = roleFilter != null ? p.byPlayer.filter((pl) => pl.role === roleFilter) : p.byPlayer;
  return (
    <Section
      title={tl("{team}: player pools", { team: side.team.name })}
      right={
        <span className="flex items-center gap-2">
          <span className={`text-[11px] ${color}`}>{tl("{n} games in this period", { n: p.games })}</span>
          {rows.length > 0 && (
            <SectionCard
              section={tl("{team}: player pools", { team: side.team.name })}
              sub={tl("{n} games in this period", { n: p.games })}
              name={`${side.team.name}-player-pools`}
              rows={() =>
                rows.map((pl) => {
                  const top = pl.champs
                    .filter((x) => x.g > 0)
                    .sort((a, b) => comfort(b.g, b.w) - comfort(a.g, a.w) || b.g - a.g)
                    .slice(0, 4);
                  return {
                    champ: top[0]?.c,
                    label: `${pl.name} (${roleName(ROLES[pl.role])})`,
                    sub: top.map((x) => `${champName(x.c)} ${x.g}G (${winRate(x.w, x.g)})`).join(" · ") || tl("No games in this period"),
                  };
                })
              }
            />
          )}
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="text-xs text-rw-muted">{tl("No roster known for this team.")}</p>
      ) : (
        <div className="space-y-2 text-xs">
          {rows.map((pl) => {
            const now = pl.champs
              .filter((x) => x.g > 0 && x.g >= minGames && (!hideTaken || !isChampTaken(x.c, taken)))
              .sort((a, b) => comfort(b.g, b.w) - comfort(a.g, a.w) || b.g - a.g)
              .slice(0, 8);
            const pocket = pl.champs
              .filter((x) => x.g === 0 && x.cg >= Math.max(3, minGames) && (!hideTaken || !isChampTaken(x.c, taken)))
              .sort((a, b) => comfort(b.cg, b.cw) - comfort(a.cg, a.cw))
              .slice(0, 5);
            return (
              <div key={pl.role} className="flex flex-wrap items-start gap-1.5 min-w-0">
                <span className="w-28 shrink-0 min-w-0 leading-tight">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <PlayerPhoto name={pl.name} team={side.team.name} slug={pl.u ?? undefined} size={18} />
                    {pl.u ? (
                      <HubLink to={{ kind: "player", slug: pl.u }} className="font-semibold text-rw-text hover:text-rw-accent truncate">
                        {pl.name}
                      </HubLink>
                    ) : (
                      <span className="font-semibold text-rw-text truncate">{pl.name}</span>
                    )}
                  </span>
                  <span className="text-[10px] text-rw-muted">{roleName(ROLES[pl.role])}</span>
                  {onSwap && <RosterSubPicker side={side} roleIdx={pl.role} onSwap={onSwap} />}
                </span>
                <span className="flex flex-wrap gap-1 min-w-0 flex-1">
                  {now.map((x) =>
                    chip(
                      x.c,
                      `${x.g} · ${winRate(x.w, x.g)}`,
                      [
                        tl("{n} games, won {pct}", { n: x.g, pct: winRate(x.w, x.g) }),
                        x.kda != null ? `${fmtN(x.kda)} KDA` : "",
                        x.gd15 != null ? `GD@15 ${x.gd15 > 0 ? "+" : ""}${x.gd15}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      false,
                    ),
                  )}
                  {pocket.map((x) =>
                    chip(
                      x.c,
                      `${x.cg} · ${winRate(x.cw, x.cg)}`,
                      `${tl("pocket pick")}: ${pl.full ? tl("career {n} games, won {pct}, {kda} KDA", { n: x.cg, pct: winRate(x.cw, x.cg), kda: x.ckda }) : tl("last two years {n} games, won {pct}, {kda} KDA", { n: x.cg, pct: winRate(x.cw, x.cg), kda: x.ckda })}`,
                      true,
                    ),
                  )}
                  {now.length === 0 && pocket.length === 0 && <span className="text-rw-muted">{tl("No games in this period")}</span>}
                </span>
              </div>
            );
          })}
          <p className="text-[10px] text-rw-muted">{tl("Games · wins this period, best first. Dashed: played before this period only (pocket picks). Click to put it on the board.")}</p>
        </div>
      )}
    </Section>
  );
};

/**
 * Lane counters for the champion in focus, from its champion page: who wins the lane against it (lowest gold lead
 * at 15) and whom it beats, in its main role. The last 12 months when there are enough games, else all time.
 * A counter one of the two teams has in its own pool is marked with the team's colour and the player.
 */
const LaneCounters: React.FC<{ c: string; pools: { b: Pool; r: Pool }; blue: Side; red: Side; taken: Set<string>; hideTaken?: boolean }> = ({
  c,
  pools,
  blue,
  red,
  taken,
  hideTaken = true,
}) => {
  const state = useLoad(() => loadHubChamp(prettySlug(c)), [c]);
  const data = state.data;
  if (!data) return null;
  const role = data.roles[0]?.r;
  if (!role) return null;
  const withLane = (m?: Record<string, LaneLine[]> | null) =>
    (m?.[role] || []).filter((x) => x[3] != null && x[3] >= 3 && (!hideTaken || !isChampTaken(x[0], taken)));
  const recent = withLane(data.matchups12);
  const rows = recent.length >= 4 ? recent : withLane(data.matchups);
  if (rows.length < 2) return null;
  const byLane = [...rows].sort((a, b) => (a[4] ?? 0) - (b[4] ?? 0));
  const owner = (oc: string) =>
    (["b", "r"] as Who[])
      .map((w) => {
        const who = champOf(oc, pools[w]);
        return who && who.cg > 0 ? { w, who, team: w === "b" ? blue : red } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  const line = (x: LaneLine) => {
    const [oc, g, w, , gd] = x;
    const wrPct = g ? Math.round((w / g) * 100) : 0;
    const gdTone = gd == null ? "text-rw-sub" : gd > 50 ? "text-rw-teal font-semibold" : gd < -50 ? "text-rw-red font-semibold" : "text-rw-sub";
    return (
      <li key={oc} className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-1 min-w-0">
          <ChampLink name={oc} size={16} />
          {owner(oc).map((o) => (
            <span
              key={o.w}
              className={`text-[9px] px-1 rounded shrink-0 ${o.w === "b" ? "bg-rw-side-a/20 text-rw-side-a" : "bg-rw-side-b/20 text-rw-side-b"}`}
              title={tl("{player} ({team}) plays it: {n} games, won {pct}", { player: o.who.name, team: o.team.team.name, n: o.who.g || o.who.cg, pct: winRate(o.who.g ? o.who.w : o.who.cw, o.who.g || o.who.cg) })}
            >
              {o.who.name}
            </span>
          ))}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums text-rw-sub shrink-0" title={tl("{n} games against it", { n: g })}>
          <span className={gdTone}>
            {gd != null && gd > 0 ? "+" : ""}
            {gd}
          </span>
          <span>· {winRate(w, g)}</span>
          {g > 0 && (
            <span className="w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
              <span className="h-full bg-rw-teal/85" style={{ width: `${wrPct}%` }} />
              <span className="h-full bg-rw-red/75" style={{ width: `${100 - wrPct}%` }} />
            </span>
          )}
        </span>
      </li>
    );
  };
  return (
    <div className="space-y-2 pt-2 border-t border-rw-border text-xs">
      <div className="text-[10px] font-semibold text-rw-muted">
        {tl("{champion} in lane ({role}, {when})", {
          champion: champName(c),
          role: roleName(role),
          when: rows === recent ? tl("last 12 months") : tl("all time"),
        })}
      </div>
      <div className="text-[10px] text-rw-muted">{tl("Gold lead at 15 · games won · who on either roster plays the answer")}</div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-[10px] text-rw-red font-semibold mb-1">{tl("Loses lane to")}</div>
          <ul className="space-y-1">{byLane.slice(0, 5).map(line)}</ul>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-rw-teal font-semibold mb-1">{tl("Wins lane against")}</div>
          <ul className="space-y-1">{byLane.slice(-5).reverse().map(line)}</ul>
        </div>
      </div>
      <OeCredit />
    </div>
  );
};

/** What both teams have done with the champion under the pointer. */
const ChampInfo: React.FC<{ c: string; pools: { b: Pool; r: Pool }; blue: Side; red: Side; taken: Set<string>; hideTaken?: boolean }> = ({
  c,
  pools,
  blue,
  red,
  taken,
  hideTaken = true,
}) => (
  <Section
    title={champName(c)}
    right={
      <span className="flex items-center gap-2 text-[11px]" data-nocapture="1">
        <HubLink to={{ kind: "champ", slug: prettySlug(c) }} className="text-rw-accent hover:underline font-semibold">
          {champName(c)} →
        </HubLink>
        <HubLink to={{ kind: "counters", query: `champ=${prettySlug(c)}` }} className="text-rw-accent hover:underline font-semibold">
          {tl("Counter-picks")} →
        </HubLink>
      </span>
    }
  >
    <div className="grid sm:grid-cols-2 gap-3 text-xs">
      {(
        [
          ["b", blue],
          ["r", red],
        ] as [Who, Side][]
      ).map(([w, s]) => {
        const p = pools[w];
        const pk = p.picks.get(c);
        const roles = [...(p.roles.get(c) || [])].map((r) => roleName(ROLES[r]));
        return (
          <div key={w} className="space-y-1 min-w-0">
            <div className={`font-bold flex items-center gap-1.5 min-w-0 ${w === "b" ? "text-rw-side-a" : "text-rw-side-b"}`}>
              <TeamLogo name={s.team.name} size={15} />
              <span className="truncate">{s.team.name}</span>
            </div>
            <div className="text-rw-sub">
              {pk ? tl("Picked {n} times, won {pct}", { n: pk[0], pct: winRate(pk[1], pk[0]) }) : tl("Not picked in this period")}
              {roles.length > 0 && ` (${roles.join(" / ")})`}
            </div>
            <div className="text-rw-sub">
              {tl("Banned it {n} times · banned against them {m} times", { n: p.bans.get(c) || 0, m: p.bansVs.get(c) || 0 })}
            </div>
            {(p.players.get(c) || [])
              .sort((a, b) => b.g - a.g || b.cg - a.cg)
              .map((x) => {
                const full = s.players[x.role]?.full;
                return (
                  <div key={x.name} className="text-rw-text">
                    <span className="font-semibold">{x.name}</span>:{" "}
                    {x.g ? (
                      <>
                        {tl("{n} games, won {pct}", { n: x.g, pct: winRate(x.w, x.g) })}
                        {x.kda != null && ` · ${fmtN(x.kda)} KDA`}
                        {x.gd15 != null && (
                          <span className="text-rw-sub" title={tl("Average lead over the lane opponent at 15 minutes")}>
                            {` · GD@15 ${x.gd15 > 0 ? "+" : ""}${x.gd15}`}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-rw-accent" title={tl("Played it before, but not in this period")}>
                        {tl("pocket pick")}
                      </span>
                    )}
                    <span className="text-rw-muted">
                      {" "}
                      (
                      {full
                        ? tl("career {n} games, won {pct}, {kda} KDA", { n: x.cg, pct: winRate(x.cw, x.cg), kda: x.ckda })
                        : tl("last two years {n} games, won {pct}, {kda} KDA", { n: x.cg, pct: winRate(x.cw, x.cg), kda: x.ckda })}
                      )
                    </span>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
    <LaneCounters c={c} pools={pools} blue={blue} red={red} taken={taken} hideTaken={hideTaken} />
  </Section>
);

/** A team's most picked champions still open, what it bans, and what gets banned against it. */
const Priorities: React.FC<{
  who: Who;
  side: Side;
  pool: Pool;
  other: Pool;
  taken: Set<string>;
  onPick: (c: string) => void;
}> = ({ who, side, pool: p, taken, onPick }) => {
  const open = [...p.picks.entries()]
    .filter(([c]) => !isChampTaken(c, taken))
    .sort((a, b) => b[1][0] - a[1][0])
    .slice(0, 10);
  const bans = [...p.bans.entries()]
    .filter(([c]) => !isChampTaken(c, taken))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const vs = [...p.bansVs.entries()]
    .filter(([c]) => !isChampTaken(c, taken))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const color = who === "b" ? "text-rw-side-a" : "text-rw-side-b";
  const barTone = who === "b" ? "bg-rw-side-a/75" : "bg-rw-side-b/75";
  const list = (rows: { c: string; n: number; w?: number; v: string }[], barCls: string) => {
    const maxN = Math.max(1, ...rows.map((r) => r.n));
    return (
      <ul className="space-y-1">
        {rows.map(({ c, n, w, v }) => {
          const wr = w != null && n > 0 ? w / n : null;
          const wrCls = wr == null ? "text-rw-sub" : wr >= 0.6 ? "text-rw-teal font-semibold" : wr < 0.45 ? "text-rw-red" : "text-rw-sub";
          return (
            <li key={c}>
              <button type="button" onClick={() => onPick(c)} className="flex items-center justify-between gap-2 w-full text-left hover:bg-rw-bg rounded px-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <ChampIcon name={c} size={18} />
                  <span className="truncate text-rw-text">{champName(c)}</span>
                  {(p.roles.get(c)?.size || 0) > 1 && (
                    <span
                      className="text-[9px] font-bold uppercase px-1 rounded bg-rw-accent/20 text-rw-accent shrink-0"
                      title={[...(p.roles.get(c) || [])].map((r) => roleName(ROLES[r])).join(" / ")}
                    >
                      {tl("flex")}
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums shrink-0">
                  <span className="w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                    <span className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.round((n / maxN) * 100)}%` }} />
                  </span>
                  <span className={wrCls}>{v}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };
  return (
    <Section
      title={side.team.name}
      right={
        <span className="flex items-center gap-2">
          <span className={`text-[11px] ${color}`}>{tl("{n} games in this period", { n: p.games })}</span>
          {open.length > 0 && (
            <SectionCard
              section={side.team.name}
              sub={tl("Most picked, still open")}
              name={`${side.team.name}-priorities`}
              rows={() =>
                open.map(([c, [g, w]], idx) => ({
                  rank: idx + 1,
                  champ: c,
                  label: champName(c),
                  sub: (p.roles.get(c)?.size || 0) > 1 ? tl("flex") : undefined,
                  value: `${g}G · ${winRate(w, g)}`,
                }))
              }
            />
          )}
        </span>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Most picked, still open")}</div>
          {list(
            open.map(([c, [g, w]]) => ({ c, n: g, w, v: `${g} · ${winRate(w, g)}` })),
            barTone,
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Their usual bans")}</div>
          {list(
            bans.map(([c, n]) => ({ c, n, v: String(n) })),
            "bg-rw-red/75",
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Banned against them")}</div>
          {list(
            vs.map(([c, n]) => ({ c, n, v: String(n) })),
            "bg-rw-red/75",
          )}
        </div>
      </div>
    </Section>
  );
};
