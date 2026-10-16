/**
 * Draft board: plan a draft between two pro teams in tournament order (3 bans, 3 picks, 2 bans, 2 picks per side)
 * with both teams' champion pools in view: how often each team picked or banned a champion over the chosen period,
 * how it went, who on the roster plays it, and each team's best picks still open. Fearless mode keeps the
 * champions of earlier games out. Address: /riftwise/stats/draft?teams=t1,gen-g&p=y2026
 */
import React, { useEffect, useMemo, useState } from "react";
import { RotateCcw, Undo2, ArrowLeftRight, ChevronsRight } from "lucide-react";
import { tl, roleName } from "../../i18n";
import { champName } from "../../champions";
import { winRate } from "../../stats";
import type { TeamGameRow } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { championList, useDDragon } from "../../hub/ddragon";
import { ROLES } from "../../hub/champAgg";
import {
  PeriodKey,
  inPeriod,
  playerRowRef,
  teamRowRef,
} from "../../hub/period";
import { ComparePick, bothOptions } from "./ComparePage";
import { PeriodPicker, defaultPeriod } from "./PeriodStats";
import { Side, loadSide } from "./PrepPage";
import { card, ChampIcon, HubLink, Loading, Section, usePageTitle } from "./ui";

type Who = "b" | "r";
/** Tournament draft order: who acts and whether it's a ban or a pick. */
const ORDER: { side: Who; ban: boolean }[] = [
  ...(["b", "r", "b", "r", "b", "r"] as Who[]).map((side) => ({
    side,
    ban: true,
  })),
  ...(["b", "r", "r", "b", "b", "r"] as Who[]).map((side) => ({
    side,
    ban: false,
  })),
  ...(["r", "b", "r", "b"] as Who[]).map((side) => ({ side, ban: true })),
  ...(["r", "b", "b", "r"] as Who[]).map((side) => ({ side, ban: false })),
];

interface Pool {
  picks: Map<string, [number, number]>; // champion -> games, wins
  bans: Map<string, number>;
  bansVs: Map<string, number>;
  roles: Map<string, Set<number>>;
  players: Map<string, { name: string; g: number; w: number }[]>;
  games: number;
}

function pool(side: Side, period: PeriodKey): Pool {
  const rows: TeamGameRow[] = inPeriod(side.games, period, teamRowRef);
  const p: Pool = {
    picks: new Map(),
    bans: new Map(),
    bansVs: new Map(),
    roles: new Map(),
    players: new Map(),
    games: rows.length,
  };
  for (const r of rows) {
    (r[20] || []).forEach((c, i) => {
      const x = p.picks.get(c) || [0, 0];
      x[0]++;
      x[1] += r[7];
      p.picks.set(c, x);
      const role = (r[22] || [])[i];
      if (role != null && role >= 0)
        p.roles.set(c, (p.roles.get(c) || new Set()).add(role));
    });
    for (const c of r[19] || []) p.bans.set(c, (p.bans.get(c) || 0) + 1);
    for (const c of r[21] || []) p.bansVs.set(c, (p.bansVs.get(c) || 0) + 1);
  }
  for (const pl of side.players) {
    if (!pl) continue;
    const by = new Map<string, [number, number]>();
    for (const g of inPeriod(pl.log, period, playerRowRef)) {
      const x = by.get(g[2]) || [0, 0];
      x[0]++;
      x[1] += g[6];
      by.set(g[2], x);
    }
    for (const [c, [g, w]] of by)
      p.players.set(c, [
        ...(p.players.get(c) || []),
        { name: pl.p.name, g, w },
      ]);
  }
  return p;
}

export const DraftPage: React.FC<{ query?: string }> = ({ query }) => {
  useDDragon();
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const [a, b] = (q.get("teams") || "")
    .split(",")
    .map((x) => x.trim().toLowerCase() || null);
  const set = (patch: { a?: string | null; b?: string | null; p?: string }) => {
    const next = new URLSearchParams(q);
    const ta = patch.a !== undefined ? patch.a : a;
    const tb = patch.b !== undefined ? patch.b : b;
    if (ta || tb) next.set("teams", `${ta || ""},${tb || ""}`);
    else next.delete("teams");
    if (patch.p !== undefined) {
      if (patch.p && patch.p !== "all") next.set("p", patch.p);
      else next.delete("p");
    }
    navigateHub({ kind: "draft", query: next.toString() }, { replace: true });
  };
  const [sides, setSides] = useState<{
    a: Side | null;
    b: Side | null;
    failed?: boolean;
  }>({ a: null, b: null });
  useEffect(() => {
    let alive = true;
    setSides({ a: null, b: null });
    if (!a || !b) return;
    Promise.all([loadSide(a), loadSide(b)])
      .then(([x, y]) => alive && setSides({ a: x, b: y }))
      .catch(() => alive && setSides({ a: null, b: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [a, b]);
  usePageTitle(
    sides.a && sides.b
      ? tl("{a} vs {b}: draft board", {
          a: sides.a.team.name,
          b: sides.b.team.name,
        })
      : tl("Draft board"),
  );

  if (!a || !b)
    return (
      <div className="space-y-3">
        <div className={`${card} space-y-2 text-xs`}>
          <p className="text-[#f0e6d2] font-semibold">{tl("Draft board")}</p>
          <p className="text-[#9bb3c9]">
            {tl(
              "Pick a blue-side and a red-side team, then draft in tournament order with both teams' champion pools, bans and players in view.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((k) => (
            <div key={k} className={`${card} min-w-0 space-y-1`}>
              <div
                className={`text-[10px] uppercase tracking-wider font-bold ${k === "a" ? "text-[#0ac8b9]" : "text-[#e84057]"}`}
              >
                {k === "a" ? tl("Blue side") : tl("Red side")}
              </div>
              {(k === "a" ? a : b) ? (
                <button
                  type="button"
                  onClick={() => set({ [k]: null })}
                  className="text-[11px] text-[#0ac8b9] hover:underline"
                >
                  {tl("Change")}
                </button>
              ) : (
                <ComparePick
                  kind="team"
                  autoFocus={k === "a" || !!a}
                  onPick={(slug) => set({ [k]: slug })}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  if (sides.failed)
    return (
      <p className="text-xs text-[#9bb3c9] py-6 text-center">
        {tl(
          "Couldn't load the stats right now. Check your connection and try again in a minute.",
        )}
      </p>
    );
  if (!sides.a || !sides.b) return <Loading />;
  return (
    <Board
      blue={sides.a}
      red={sides.b}
      period={q.get("p") || undefined}
      onPeriod={(p) => set({ p })}
      onSwap={() => set({ a: b, b: a })}
    />
  );
};

const Board: React.FC<{
  blue: Side;
  red: Side;
  period?: string;
  onPeriod: (p: string) => void;
  onSwap: () => void;
}> = ({ blue, red, period: periodQ, onPeriod, onSwap }) => {
  const options = useMemo(
    () => bothOptions(blue.games.map(teamRowRef), red.games.map(teamRowRef)),
    [blue.games, red.games],
  );
  const period: PeriodKey =
    periodQ && options.some((o) => o.key === periodQ)
      ? periodQ
      : defaultPeriod(options);
  const pools = useMemo(
    () => ({ b: pool(blue, period), r: pool(red, period) }),
    [blue, red, period],
  );
  const [slots, setSlots] = useState<(string | null)[]>(() =>
    ORDER.map(() => null),
  );
  const [cursor, setCursor] = useState<number | null>(null);
  // fearless draft is the standard in pro play now (2025 on)
  const [fearless, setFearless] = useState(true);
  const [used, setUsed] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<number | null>(null);
  const step = cursor ?? slots.findIndex((s) => s === null);
  const taken = new Set([
    ...slots.filter((s): s is string => !!s),
    ...(fearless ? used : []),
  ]);

  const all = useMemo(() => {
    const names = new Set(championList());
    for (const p of [pools.b, pools.r])
      for (const c of [...p.picks.keys(), ...p.bans.keys()]) names.add(c);
    return [...names].sort((x, y) => champName(x).localeCompare(champName(y)));
  }, [pools]);
  const shown = all.filter(
    (c) =>
      (!search.trim() ||
        champName(c).toLowerCase().includes(search.trim().toLowerCase()) ||
        c.toLowerCase().includes(search.trim().toLowerCase())) &&
      (role == null ||
        pools.b.roles.get(c)?.has(role) ||
        pools.r.roles.get(c)?.has(role)),
  );

  const place = (c: string) => {
    if (step < 0 || step >= ORDER.length || taken.has(c)) return;
    const next = [...slots];
    next[step] = c;
    setSlots(next);
    setCursor(null);
    setFocus(c);
  };
  const clearSlot = (i: number) => {
    const next = [...slots];
    next[i] = null;
    setSlots(next);
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
    setSlots(ORDER.map(() => null));
    setCursor(null);
  };
  const nextGame = () => {
    setUsed((u) => [
      ...new Set([
        ...u,
        ...slots.filter((s, i): s is string => !!s && !ORDER[i].ban),
      ]),
    ]);
    reset();
  };
  const now = step >= 0 && step < ORDER.length ? ORDER[step] : null;
  const team = (w: Who) => (w === "b" ? blue : red);

  return (
    <div className="space-y-3">
      <div
        className={`${card} flex flex-wrap items-center justify-between gap-2`}
      >
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#c8aa6e]">
            {tl("Draft board")}
          </div>
          <h2 className="text-lg font-bold truncate">
            <HubLink
              to={{ kind: "team", slug: blue.team.u }}
              className="text-[#0ac8b9]"
            >
              {blue.team.name}
            </HubLink>
            <span className="text-[#7e8e9f] font-normal"> vs </span>
            <HubLink
              to={{ kind: "team", slug: red.team.u }}
              className="text-[#e84057]"
            >
              {red.team.name}
            </HubLink>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#7e8e9f]">{tl("Pools from")}</span>
          <PeriodPicker options={options} value={period} onChange={onPeriod} />
          <button
            type="button"
            onClick={onSwap}
            className="flex items-center gap-1 text-[#0ac8b9] hover:underline"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {tl("Swap sides")}
          </button>
          <HubLink
            to={{ kind: "prep", a: blue.team.u, b: red.team.u, period }}
            className="text-[#0ac8b9] hover:underline"
          >
            {tl("Match prep")}
          </HubLink>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)]">
        <TeamColumn
          who="b"
          side={blue}
          slots={slots}
          step={step}
          onSlot={clearSlot}
          onPick={setCursor}
        />
        <div className="space-y-3 min-w-0 order-first lg:order-none">
          <div className={`${card} space-y-2`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`font-bold ${now ? (now.side === "b" ? "text-[#0ac8b9]" : "text-[#e84057]") : "text-[#c8aa6e]"}`}
              >
                {now
                  ? now.ban
                    ? tl("{team} to ban", { team: team(now.side).team.name })
                    : tl("{team} to pick", { team: team(now.side).team.name })
                  : tl("Draft complete")}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={undo}
                  className="flex items-center gap-1 text-[#9bb3c9] hover:text-[#f0e6d2]"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  {tl("Undo")}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center gap-1 text-[#9bb3c9] hover:text-[#f0e6d2]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {tl("Reset")}
                </button>
                <label
                  className="flex items-center gap-1 text-[#9bb3c9]"
                  title={tl(
                    "Fearless: champions picked in earlier games of the series can't be picked again",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={fearless}
                    onChange={(e) => setFearless(e.target.checked)}
                  />
                  {tl("Fearless")}
                </label>
                {fearless && (
                  <button
                    type="button"
                    onClick={nextGame}
                    className="flex items-center gap-1 text-[#0ac8b9] hover:underline"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                    {tl("Next game")}
                  </button>
                )}
              </span>
            </div>
            {fearless && used.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-[10px] text-[#7e8e9f]">
                {tl("Used in earlier games:")}
                {used.map((c) => (
                  <ChampIcon
                    key={c}
                    name={c}
                    size={16}
                    className="opacity-60"
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setUsed([])}
                  className="text-[#0ac8b9] hover:underline ml-1"
                >
                  {tl("Clear")}
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tl("Search champions…")}
                className="bg-[#091428] border border-[#1e282d] rounded-lg px-2 py-1.5 text-[#f0e6d2] w-40"
              />
              <span className="flex flex-wrap gap-1">
                {[null, 0, 1, 2, 3, 4].map((r) => (
                  <button
                    key={String(r)}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-2 py-1 rounded border ${role === r ? "border-[#c8aa6e] text-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2]"}`}
                    title={
                      r == null
                        ? undefined
                        : tl("Champions these teams played in this role")
                    }
                  >
                    {r == null ? tl("All") : roleName(ROLES[r])}
                  </button>
                ))}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1 max-h-[22rem] overflow-y-auto pr-1">
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
                      off
                        ? "opacity-25 border-transparent"
                        : focus === c
                          ? "border-[#c8aa6e]"
                          : "border-transparent hover:border-[#2c3c44]"
                    }`}
                    title={champName(c)}
                  >
                    <ChampIcon name={c} size={36} />
                    <span className="truncate w-full text-center text-[#9bb3c9]">
                      {champName(c)}
                    </span>
                    {pb > 0 && (
                      <span className="absolute top-0 left-0 px-0.5 rounded bg-[#0ac8b9] text-[#091428] font-bold">
                        {pb}
                      </span>
                    )}
                    {pr > 0 && (
                      <span className="absolute top-0 right-0 px-0.5 rounded bg-[#e84057] text-[#091428] font-bold">
                        {pr}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[#7e8e9f]">
              {tl(
                "Numbers on a champion: games each team picked it in this period. Click a filled slot to change it.",
              )}
            </p>
          </div>
          {focus && <ChampInfo c={focus} pools={pools} blue={blue} red={red} />}
        </div>
        <TeamColumn
          who="r"
          side={red}
          slots={slots}
          step={step}
          onSlot={clearSlot}
          onPick={setCursor}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Priorities
          who="b"
          side={blue}
          pool={pools.b}
          other={pools.r}
          taken={taken}
          onPick={place}
        />
        <Priorities
          who="r"
          side={red}
          pool={pools.r}
          other={pools.b}
          taken={taken}
          onPick={place}
        />
      </div>
    </div>
  );
};

/** A side's five bans and five picks; click a slot to empty it and fill it next. */
const TeamColumn: React.FC<{
  who: Who;
  side: Side;
  slots: (string | null)[];
  step: number;
  onSlot: (i: number) => void;
  onPick: (i: number) => void;
}> = ({ who, side, slots, step, onSlot, onPick }) => {
  const mine = ORDER.map((o, i) => ({ ...o, i })).filter((o) => o.side === who);
  const bans = mine.filter((o) => o.ban);
  const picks = mine.filter((o) => !o.ban);
  const color = who === "b" ? "#0ac8b9" : "#e84057";
  const slot = (i: number, big: boolean) => {
    const c = slots[i];
    const active = step === i;
    return (
      <button
        key={i}
        type="button"
        onClick={() => (c ? onSlot(i) : onPick(i))}
        className={`flex items-center gap-2 rounded border ${big ? "p-1.5 w-full" : "p-0.5"} ${active ? "border-[#c8aa6e]" : "border-[#1e282d]"} bg-[#091428]`}
        title={c ? tl("Click to change") : undefined}
      >
        {c ? (
          <ChampIcon
            name={c}
            size={big ? 32 : 24}
            className={big ? "" : "grayscale"}
          />
        ) : (
          <span
            className={`${big ? "w-8 h-8" : "w-6 h-6"} rounded bg-[#1e282d]`}
          />
        )}
        {big && (
          <span className="text-xs text-[#f0e6d2] truncate">
            {c ? champName(c) : ""}
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
      <div className="flex gap-1">{bans.map((o) => slot(o.i, false))}</div>
      <div className="space-y-1">{picks.map((o) => slot(o.i, true))}</div>
    </div>
  );
};

/** What both teams have done with the champion under the pointer. */
const ChampInfo: React.FC<{
  c: string;
  pools: { b: Pool; r: Pool };
  blue: Side;
  red: Side;
}> = ({ c, pools, blue, red }) => (
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
        const roles = [...(p.roles.get(c) || [])].map((r) =>
          roleName(ROLES[r]),
        );
        return (
          <div key={w} className="space-y-1 min-w-0">
            <div
              className={`font-bold truncate ${w === "b" ? "text-[#0ac8b9]" : "text-[#e84057]"}`}
            >
              {s.team.name}
            </div>
            <div className="text-[#9bb3c9]">
              {pk
                ? tl("Picked {n} times, won {pct}", {
                    n: pk[0],
                    pct: winRate(pk[1], pk[0]),
                  })
                : tl("Not picked in this period")}
              {roles.length > 0 && ` (${roles.join(" / ")})`}
            </div>
            <div className="text-[#9bb3c9]">
              {tl("Banned it {n} times · banned against them {m} times", {
                n: p.bans.get(c) || 0,
                m: p.bansVs.get(c) || 0,
              })}
            </div>
            {(p.players.get(c) || []).map((x) => (
              <div key={x.name} className="text-[#f0e6d2]">
                {x.name}:{" "}
                {tl("{n} games, won {pct}", { n: x.g, pct: winRate(x.w, x.g) })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
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
  const color = who === "b" ? "text-[#0ac8b9]" : "text-[#e84057]";
  const list = (rows: [string, string][]) => (
    <ul className="space-y-1">
      {rows.map(([c, v]) => (
        <li key={c}>
          <button
            type="button"
            onClick={() => onPick(c)}
            className="flex items-center justify-between gap-2 w-full text-left hover:bg-[#091428] rounded px-1"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <ChampIcon name={c} size={18} />
              <span className="truncate text-[#f0e6d2]">{champName(c)}</span>
            </span>
            <span className="text-[#9bb3c9] tabular-nums shrink-0">{v}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <Section
      title={side.team.name}
      right={
        <span className={`text-[11px] ${color}`}>
          {tl("{n} games in this period", { n: p.games })}
        </span>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#7e8e9f] mb-1">
            {tl("Most picked, still open")}
          </div>
          {list(open.map(([c, [g, w]]) => [c, `${g} · ${winRate(w, g)}`]))}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#7e8e9f] mb-1">
            {tl("Their usual bans")}
          </div>
          {list(bans.map(([c, n]) => [c, String(n)]))}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#7e8e9f] mb-1">
            {tl("Banned against them")}
          </div>
          {list(vs.map(([c, n]) => [c, String(n)]))}
        </div>
      </div>
    </Section>
  );
};
