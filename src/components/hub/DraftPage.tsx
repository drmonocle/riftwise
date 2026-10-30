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
import { card, ChampIcon, ChampLink, HubLink, Loading, OeCredit, Section, useLoad, usePageTitle, useRetryAttempt, retryFailedLoads } from "./ui";
import { bare, loadHubChamp, prettySlug } from "../../hub/data";
import { BroadcastCardButton, draftBoardCard, type BoardSide } from "./BroadcastCard";
import type { LaneLine } from "../../hub/types";

type Who = "b" | "r";
/** Tournament draft order: who acts and whether it's a ban or a pick. */
const ORDER: { side: Who; ban: boolean }[] = [
  ...(["b", "r", "b", "r", "b", "r"] as Who[]).map((side) => ({ side, ban: true })),
  ...(["b", "r", "r", "b", "b", "r"] as Who[]).map((side) => ({ side, ban: false })),
  ...(["r", "b", "r", "b"] as Who[]).map((side) => ({ side, ban: true })),
  ...(["r", "b", "b", "r"] as Who[]).map((side) => ({ side, ban: false })),
];

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
export function roleOf(c: string, p: Pool): number | null {
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
  return null;
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
const packSlots = (slots: (string | null)[]) => (slots.some((s) => s) ? slots.map((s) => s || "").join(",") : "");
const parseList = (s: string | null) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);

interface PastGame {
  blue: string;
  red: string;
  slots: (string | null)[];
}
const parseHistory = (s: string | null): PastGame[] =>
  (s || "")
    .split(";")
    .filter(Boolean)
    .map((e) => {
      const [blue, red, rest] = e.split("~");
      return { blue, red, slots: parseSlots(rest || "") };
    });
const packHistory = (h: PastGame[]) => h.map((g) => `${g.blue}~${g.red}~${g.slots.map((s) => s || "").join(",")}`).join(";");

export const DraftPage: React.FC<{ query?: string }> = ({ query }) => {
  useDDragon();
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const rawTeams = q.get("teams") || (q.get("a") || q.get("b") ? `${q.get("a") || ""},${q.get("b") || ""}` : "");
  const [a, b] = rawTeams.split(",").map((x) => x.trim().toLowerCase() || null);
  const set = (patch: { a?: string | null; b?: string | null; p?: string; d?: string; u?: string; f?: string; h?: string }) => {
    const next = new URLSearchParams(q);
    const ta = patch.a !== undefined ? patch.a : a;
    const tb = patch.b !== undefined ? patch.b : b;
    if (ta || tb) next.set("teams", `${ta || ""},${tb || ""}`);
    else next.delete("teams");
    if (patch.p !== undefined) {
      if (patch.p && patch.p !== "all") next.set("p", patch.p);
      else next.delete("p");
    }
    for (const k of ["d", "u", "f", "h"] as const) {
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
              <div className={`text-[10px] uppercase tracking-wider font-bold ${k === "a" ? "text-rw-teal" : "text-rw-red"}`}>
                {k === "a" ? tl("Blue side") : tl("Red side")}
              </div>
              {(k === "a" ? a : b) ? (
                <button type="button" onClick={() => set({ [k]: null })} className="text-[11px] text-rw-teal hover:underline">
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
          <button type="button" onClick={retryFailedLoads} className="text-rw-teal hover:underline mr-4">
            {tl("Try again")}
          </button>
        )}
        <button type="button" onClick={() => set({ a: null, b: null, d: "", u: "", h: "" })} className="text-rw-teal hover:underline">
          {tl("Pick the teams again")}
        </button>
      </div>
    );
  if (!sides.a || !sides.b) return <Loading />;
  const slots = parseSlots(q.get("d"));
  return (
    <Board
      blue={sides.a}
      red={sides.b}
      period={q.get("p") || undefined}
      slots={slots}
      used={parseList(q.get("u"))}
      fearless={q.get("f") !== "0"}
      history={parseHistory(q.get("h"))}
      onPeriod={(p) => set({ p })}
      onSlots={(s) => set({ d: packSlots(s) })}
      onUsed={(u) => set({ u: u.join(",") })}
      onFearless={(on) => set({ f: on ? "" : "0" })}
      onHistory={(h) => set({ h: packHistory(h) })}
      onNextGame={(h, u) => set({ h: packHistory(h), u: u.join(","), d: "" })}
      onSwap={() => set({ a: b, b: a, d: "" })}
      onSides={(x, y) => setSides({ a: x, b: y })}
    />
  );
};

const Board: React.FC<{
  blue: Side;
  red: Side;
  period?: string;
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
  onSwap: () => void;
  onSides: (blue: Side, red: Side) => void;
}> = ({ blue, red, period: periodQ, slots, used, fearless, history, onPeriod, onSlots, onUsed, onFearless, onHistory, onNextGame, onSwap, onSides }) => {
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
  const [focus, setFocus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<number | null>(null);
  const firstEmpty = slots.findIndex((s) => s === null);
  const step = cursor != null && slots[cursor] === null ? cursor : firstEmpty;
  const taken = new Set([...slots.filter((s): s is string => !!s), ...(fearless ? used : [])]);

  const all = useMemo(() => {
    const names = new Set(championList());
    for (const p of [pools.b, pools.r]) for (const c of [...p.picks.keys(), ...p.bans.keys()]) names.add(c);
    return [...names].sort((x, y) => champName(x).localeCompare(champName(y)));
  }, [pools]);
  const bq = bare(search.trim());
  const shown = all.filter(
    (c) =>
      (!search.trim() ||
        champName(c).toLowerCase().includes(search.trim().toLowerCase()) ||
        c.toLowerCase().includes(search.trim().toLowerCase()) ||
        (bq.length >= 2 && (bare(champName(c)).includes(bq) || bare(c).includes(bq)))) &&
      (role == null || pools.b.roles.get(c)?.has(role) || pools.r.roles.get(c)?.has(role)),
  );

  const place = (c: string) => {
    if (step < 0 || step >= SLOTS || taken.has(c)) return;
    const next = [...slots];
    next[step] = c;
    onSlots(next);
    setCursor(null);
    setFocus(c);
  };
  const clearSlot = (i: number) => {
    const next = [...slots];
    next[i] = null;
    onSlots(next);
    setCursor(i);
  };
  const undo = () => {
    const last = slots
      .map((s, i) => (s ? i : -1))
      .filter((i) => i >= 0)
      .pop();
    if (last != null) clearSlot(last);
  };
  const reset = () => {
    onSlots(ORDER.map(() => null));
    setCursor(null);
  };
  const nextGame = () => {
    const picks = slots.filter((s, i): s is string => !!s && !ORDER[i].ban);
    const h = picks.length ? [...history, { blue: blue.team.u, red: red.team.u, slots }] : history;
    onNextGame(h, [...new Set([...used, ...picks])]);
    setCursor(null);
  };
  const now = step >= 0 && step < SLOTS ? ORDER[step] : null;
  const team = (w: Who) => (w === "b" ? blue : red);
  const picksOf = (w: Who) => ORDER.map((o, i) => (o.side === w && !o.ban ? slots[i] : null)).filter((c): c is string => !!c);
  const bansOf = (w: Who) => ORDER.map((o, i) => (o.side === w && o.ban ? slots[i] : null)).filter((c): c is string => !!c);

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
      const picks = picksOf(w).map((c) => {
        const r = roleOf(c, p);
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
          <div className="text-[10px] uppercase tracking-wider font-bold text-rw-accent">{tl("Draft board")}</div>
          <h1 className="text-lg font-bold truncate">
            <HubLink to={{ kind: "team", slug: blue.team.u }} className="text-rw-teal">
              {blue.team.name}
            </HubLink>
            <span className="text-rw-muted font-normal"> vs </span>
            <HubLink to={{ kind: "team", slug: red.team.u }} className="text-rw-red">
              {red.team.name}
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
          <button type="button" onClick={onSwap} className="flex items-center gap-1 text-rw-teal hover:underline" title={tl("The teams change sides; the draft on the board starts over")}>
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {tl("Swap sides")}
          </button>
          <CopyDraft text={draftText} />
          {slots.some((s) => s) && (
            <BroadcastCardButton
              data={() => {
                // each pick with the role it most likely fills and the player on the roster who plays it
                const sideOf = (w: Who): BoardSide => ({
                  name: team(w).team.name,
                  bans: bansOf(w),
                  picks: picksOf(w).map((c) => {
                    const r = roleOf(c, pools[w]);
                    return { c, role: r == null ? undefined : roleName(ROLES[r]), player: champOf(c, pools[w])?.name };
                  }),
                });
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
          <HubLink to={{ kind: "prep", a: blue.team.u, b: red.team.u, period }} className="text-rw-teal hover:underline">
            {tl("Match prep")}
          </HubLink>
        </div>
      </div>

      {/* phones and tablets: both boards side by side, the champion picker under them (so a pick shows on the board) */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)]">
        <TeamColumn who="b" side={blue} pool={pools.b} slots={slots} step={step} onSlot={clearSlot} onPick={setCursor} />
        <div className="space-y-3 min-w-0 col-span-2 order-last lg:col-span-1 lg:order-none">
          <div className={`${card} space-y-2`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`font-bold ${now ? (now.side === "b" ? "text-rw-teal" : "text-rw-red") : "text-rw-accent"}`}>
                {now
                  ? now.ban
                    ? tl("{team} to ban", { team: team(now.side).team.name })
                    : tl("{team} to pick", { team: team(now.side).team.name })
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
                    className="flex items-center gap-1 text-rw-teal hover:underline"
                    title={tl("Keeps this game's picks out of the next draft and clears the board")}
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                    {tl("Next game")}
                  </button>
                )}
              </span>
            </div>
            {now && (
              <Suggest
                now={now}
                me={pools[now.side]}
                them={pools[now.side === "b" ? "r" : "b"]}
                meSide={team(now.side)}
                themSide={team(now.side === "b" ? "r" : "b")}
                myPicks={picksOf(now.side)}
                taken={taken}
                onPick={place}
                onFocus={setFocus}
              />
            )}
            {fearless && (used.length > 0 || history.length > 0) && (
              <div className="space-y-1 text-[10px] text-rw-muted">
                {history.map((g, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold text-rw-sub">{tl("Game {n}", { n: i + 1 })}</span>
                    <span className="text-rw-teal">{g.blue === blue.team.u ? blue.team.name : red.team.name}</span>
                    {ORDER.map((o, k) => (o.side === "b" && !o.ban && g.slots[k] ? <ChampIcon key={k} name={g.slots[k] as string} size={16} /> : null))}
                    <span className="text-rw-red ml-1">{g.red === red.team.u ? red.team.name : blue.team.name}</span>
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
                    className="text-rw-teal hover:underline ml-1"
                  >
                    {tl("Clear")}
                  </button>
                  {history.length > 0 && <span className="ml-1">{tl("Teams usually change sides between games: Swap sides.")}</span>}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const openHit = shown.find((c) => !taken.has(c));
                    if (openHit) {
                      e.preventDefault();
                      place(openHit);
                      setSearch("");
                    }
                  }
                }}
                placeholder={tl("Search champions…")}
                aria-label={tl("Search champions…")}
                className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text w-full sm:w-40"
              />
              <span className="flex flex-wrap gap-1">
                {[null, 0, 1, 2, 3, 4].map((r) => (
                  <button
                    key={String(r)}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-2 py-1 rounded border ${role === r ? "border-rw-accent text-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
                    title={r == null ? undefined : tl("Champions these teams played in this role")}
                  >
                    {r == null ? tl("All") : roleName(ROLES[r])}
                  </button>
                ))}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1 max-h-[22rem] max-sm:max-h-[55vh] overflow-y-auto pr-1">
              {shown.map((c) => {
                const off = taken.has(c);
                const pb = pools.b.picks.get(c)?.[0] || 0;
                const pr = pools.r.picks.get(c)?.[0] || 0;
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
                    {pb > 0 && <span className="absolute top-0 left-0 px-0.5 rounded bg-rw-teal text-rw-bg font-bold">{pb}</span>}
                    {pr > 0 && <span className="absolute top-0 right-0 px-0.5 rounded bg-rw-red text-rw-bg font-bold">{pr}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-rw-muted">
              {tl("Numbers on a champion: games each team picked it in this period. Click a filled slot to change it.")}
            </p>
          </div>
          {focus && <ChampInfo c={focus} pools={pools} blue={blue} red={red} />}
        </div>
        <TeamColumn who="r" side={red} pool={pools.r} slots={slots} step={step} onSlot={clearSlot} onPick={setCursor} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PlayerPools
          who="b"
          side={blue}
          pool={pools.b}
          taken={taken}
          onPick={place}
          onFocus={setFocus}
          onSwap={(rIdx, slug) => swapPlayerInSide(blue, rIdx, slug).then((nb) => onSides(nb, red))}
        />
        <PlayerPools
          who="r"
          side={red}
          pool={pools.r}
          taken={taken}
          onPick={place}
          onFocus={setFocus}
          onSwap={(rIdx, slug) => swapPlayerInSide(red, rIdx, slug).then((nr) => onSides(blue, nr))}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Priorities who="b" side={blue} pool={pools.b} other={pools.r} taken={taken} onPick={place} />
        <Priorities who="r" side={red} pool={pools.r} other={pools.b} taken={taken} onPick={place} />
      </div>
      <FearlessDepth a={blue} b={red} period={period} periodLabel="" title={`${blue.team.name}-${red.team.name}`} />
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
      className="flex items-center gap-1 text-rw-teal hover:underline"
      title={tl("Copy the draft as text, with the link, to paste in the team chat")}
    >
      {state === "copied" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Copy failed") : tl("Copy draft")}
    </button>
  );
};

/** What to do with the current ban or pick, and why: the other team's threats, or this team's comfort picks. */
const Suggest: React.FC<{
  now: { side: Who; ban: boolean };
  me: Pool;
  them: Pool;
  meSide: Side;
  themSide: Side;
  myPicks: string[];
  taken: Set<string>;
  onPick: (c: string) => void;
  onFocus: (c: string) => void;
}> = ({ now, me, them, meSide, themSide, myPicks, taken, onPick, onFocus }) => {
  const filled = new Set(myPicks.map((c) => roleOf(c, me)).filter((r): r is number => r != null));
  type Row = { c: string; score: number; why: string; dim?: boolean };
  let rows: Row[];
  if (now.ban) {
    rows = [...them.picks.entries()]
      .filter(([c]) => !taken.has(c))
      .map(([c, [g, w]]) => {
        const who = champOf(c, them);
        const parts = [who ? `${who.name}: ${tl("{n} games, won {pct}", { n: who.g, pct: winRate(who.w, who.g) })}` : tl("{n} games, won {pct}", { n: g, pct: winRate(w, g) })];
        if ((me.bans.get(c) || 0) > 0) parts.push(tl("you banned it {n} times", { n: me.bans.get(c) || 0 }));
        return { c, score: comfort(g, w) * (1 + Math.min(w / Math.max(g, 1), 1)), why: parts.join(" · ") };
      });
  } else {
    rows = [...me.picks.entries()]
      .filter(([c]) => !taken.has(c))
      .map(([c, [g, w]]) => {
        const who = champOf(c, me);
        const r = roleOf(c, me);
        const roleTaken = r != null && filled.has(r);
        const parts = [who ? `${who.name}: ${tl("{n} games, won {pct}", { n: who.g, pct: winRate(who.w, who.g) })}` : tl("{n} games, won {pct}", { n: g, pct: winRate(w, g) })];
        if (r != null) parts.push(roleTaken ? tl("{role} already picked", { role: roleName(ROLES[r]) }) : roleName(ROLES[r]));
        if ((them.bans.get(c) || 0) > 0) parts.push(tl("they ban it {n} times", { n: them.bans.get(c) || 0 }));
        if ((me.roles.get(c)?.size || 0) > 1) parts.push(tl("flex"));
        return { c, score: comfort(g, w) * (roleTaken ? 0.3 : 1), why: parts.join(" · "), dim: roleTaken };
      });
  }
  rows.sort((a, b) => b.score - a.score);
  const top = rows.slice(0, 5);
  if (!top.length) return null;
  const name = now.ban ? themSide.team.name : meSide.team.name;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="flex items-center gap-1 text-rw-muted" title={now.ban ? tl("What {team} plays best that is still open", { team: name }) : tl("What {team} plays best that is still open", { team: name })}>
        <Lightbulb className="w-3.5 h-3.5" />
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
          <span className="text-rw-text">{champName(x.c)}</span>
          <span className="text-rw-muted hidden xl:inline">· {x.why}</span>
        </button>
      ))}
    </div>
  );
};

/** A side's five bans and five picks; click a slot to empty it and fill it next. Picks show the role they fill. */
const TeamColumn: React.FC<{
  who: Who;
  side: Side;
  pool: Pool;
  slots: (string | null)[];
  step: number;
  onSlot: (i: number) => void;
  onPick: (i: number) => void;
}> = ({ who, side, pool: p, slots, step, onSlot, onPick }) => {
  const mine = ORDER.map((o, i) => ({ ...o, i })).filter((o) => o.side === who);
  const bans = mine.filter((o) => o.ban);
  const picks = mine.filter((o) => !o.ban);
  const color = who === "b" ? "var(--rw-teal)" : "var(--rw-red)";
  const picked = picks.map((o) => slots[o.i]).filter((c): c is string => !!c);
  const count = [0, 0, 0, 0, 0];
  let unknown = 0;
  for (const c of picked) {
    const r = roleOf(c, p);
    if (r == null) unknown++;
    else count[r]++;
  }
  const slot = (i: number, big: boolean) => {
    const c = slots[i];
    const active = step === i;
    const r = c && big ? roleOf(c, p) : null;
    const who_ = c && big ? champOf(c, p) : undefined;
    return (
      <button
        key={i}
        type="button"
        onClick={() => (c ? onSlot(i) : onPick(i))}
        className={`flex items-center gap-2 rounded border ${big ? "p-1.5 w-full" : "p-0.5"} ${active ? "border-rw-accent" : "border-rw-border"} bg-rw-bg`}
        title={c ? tl("Click to change") : undefined}
        aria-label={c ? `${champName(c)}: ${tl("Click to change")}` : tl("Empty slot")}
      >
        {c ? <ChampIcon name={c} size={big ? 32 : 24} className={big ? "" : "grayscale"} /> : <span className={`${big ? "w-8 h-8" : "w-6 h-6"} rounded bg-rw-border`} />}
        {big && (
          <span className="min-w-0 text-left">
            <span className="block text-xs text-rw-text truncate">{c ? champName(c) : ""}</span>
            {c && (
              <span className="block text-[10px] text-rw-muted truncate">
                {r != null ? roleName(ROLES[r]) : tl("role unknown")}
                {who_ && who_.cg > 0 ? ` · ${who_.name}` : ""}
              </span>
            )}
          </span>
        )}
      </button>
    );
  };
  return (
    <div className={`${card} space-y-2`} style={{ borderColor: `${color}55` }}>
      <div className="text-xs font-bold truncate" style={{ color }}>
        {who === "b" ? tl("Blue side") : tl("Red side")}: {side.team.name}
      </div>
      <div className="flex flex-wrap gap-1">{bans.map((o) => slot(o.i, false))}</div>
      <div className="space-y-1">{picks.map((o) => slot(o.i, true))}</div>
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
  onPick: (c: string) => void;
  onFocus: (c: string) => void;
  onSwap?: (roleIdx: number, slug: string) => void;
}> = ({ who, side, pool: p, taken, onPick, onFocus, onSwap }) => {
  const color = who === "b" ? "text-rw-teal" : "text-rw-red";
  const chip = (c: string, label: string, title: string, pocket: boolean) => {
    const off = taken.has(c);
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
  return (
    <Section title={tl("{team}: player pools", { team: side.team.name })} right={<span className={`text-[11px] ${color}`}>{tl("{n} games in this period", { n: p.games })}</span>}>
      {p.byPlayer.length === 0 ? (
        <p className="text-xs text-rw-muted">{tl("No roster known for this team.")}</p>
      ) : (
        <div className="space-y-2 text-xs">
          {p.byPlayer.map((pl) => {
            const now = pl.champs.filter((x) => x.g > 0).sort((a, b) => comfort(b.g, b.w) - comfort(a.g, a.w) || b.g - a.g).slice(0, 8);
            const pocket = pl.champs
              .filter((x) => x.g === 0 && x.cg >= 3)
              .sort((a, b) => comfort(b.cg, b.cw) - comfort(a.cg, a.cw))
              .slice(0, 5);
            return (
              <div key={pl.role} className="flex flex-wrap items-start gap-1.5 min-w-0">
                <span className="w-24 shrink-0 min-w-0 leading-tight">
                  {pl.u ? (
                    <HubLink to={{ kind: "player", slug: pl.u }} className="font-semibold text-rw-text hover:text-rw-accent truncate block">
                      {pl.name}
                    </HubLink>
                  ) : (
                    <span className="font-semibold text-rw-text truncate block">{pl.name}</span>
                  )}
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
const LaneCounters: React.FC<{ c: string; pools: { b: Pool; r: Pool }; blue: Side; red: Side }> = ({ c, pools, blue, red }) => {
  const state = useLoad(() => loadHubChamp(prettySlug(c)), [c]);
  const data = state.data;
  if (!data) return null;
  const role = data.roles[0]?.r;
  if (!role) return null;
  const withLane = (m?: Record<string, LaneLine[]> | null) => (m?.[role] || []).filter((x) => x[3] != null && x[3] >= 3);
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
    return (
      <li key={oc} className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-1 min-w-0">
          <ChampLink name={oc} size={16} />
          {owner(oc).map((o) => (
            <span
              key={o.w}
              className={`text-[9px] px-1 rounded shrink-0 ${o.w === "b" ? "bg-rw-teal/20 text-rw-teal" : "bg-rw-red/20 text-rw-red"}`}
              title={tl("{player} ({team}) plays it: {n} games, won {pct}", { player: o.who.name, team: o.team.team.name, n: o.who.g || o.who.cg, pct: winRate(o.who.g ? o.who.w : o.who.cw, o.who.g || o.who.cg) })}
            >
              {o.who.name}
            </span>
          ))}
        </span>
        <span className="tabular-nums text-rw-sub shrink-0" title={tl("{n} games against it", { n: g })}>
          {gd != null && gd > 0 ? "+" : ""}
          {gd} · {winRate(w, g)}
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
const ChampInfo: React.FC<{ c: string; pools: { b: Pool; r: Pool }; blue: Side; red: Side }> = ({ c, pools, blue, red }) => (
  <Section title={champName(c)}>
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
            <div className={`font-bold truncate ${w === "b" ? "text-rw-teal" : "text-rw-red"}`}>{s.team.name}</div>
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
    <LaneCounters c={c} pools={pools} blue={blue} red={red} />
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
    .filter(([c]) => !taken.has(c))
    .sort((a, b) => b[1][0] - a[1][0])
    .slice(0, 10);
  const bans = [...p.bans.entries()]
    .filter(([c]) => !taken.has(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const vs = [...p.bansVs.entries()]
    .filter(([c]) => !taken.has(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const color = who === "b" ? "text-rw-teal" : "text-rw-red";
  const list = (rows: [string, string][]) => (
    <ul className="space-y-1">
      {rows.map(([c, v]) => (
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
            <span className="text-rw-sub tabular-nums shrink-0">{v}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <Section title={side.team.name} right={<span className={`text-[11px] ${color}`}>{tl("{n} games in this period", { n: p.games })}</span>}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Most picked, still open")}</div>
          {list(open.map(([c, [g, w]]) => [c, `${g} · ${winRate(w, g)}`]))}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Their usual bans")}</div>
          {list(bans.map(([c, n]) => [c, String(n)]))}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Banned against them")}</div>
          {list(vs.map(([c, n]) => [c, String(n)]))}
        </div>
      </div>
    </Section>
  );
};
