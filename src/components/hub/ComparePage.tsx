/**
 * Compare two teams or two players over any period (all time, last N games, a year, a tournament), side by side,
 * with the better number highlighted and their head-to-head. The choice lives in the address
 * (/stats/compare?teams=t1,gen-g&p=y2026) so it can be shared.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { tl, tc, tn, roleName, fmtDec, locale, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { HubHit, HubIndex, loadHubIndex, loadHubIndexQuick, loadHubPlayer, loadHubTeam, loadPlayerGames, loadTeamGames, prettySlug, searchHub, teamStarter } from "../../hub/data";
import { countView } from "../../usage";
import type { HubPlayer, HubTeam, PlayerGameRow, TeamGameRow } from "../../hub/types";
import { CompareRoute, hubShareUrl, navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import {
  PeriodKey,
  PeriodOption,
  type PlayerAgg,
  type TeamAgg,
  inPeriod,
  periodOptions,
  playerAgg,
  playerHeadToHead,
  playerMeetings,
  playerRowRef,
  teamAgg,
  teamHeadToHead,
  teamRowRef,
} from "../../hub/period";
import { HeadToHeadSeries } from "./Archives";
import { PeriodPicker, QuickPeriods } from "./PeriodStats";
import { DraftTendencies, draftTendencies } from "./DraftTendencies";
import { BroadcastCardButton, SectionCard, draftCard, playerCardData, teamCardData } from "./BroadcastCard";
import { CaptureContext, card, ChampIcon, ChampLink, EventLink, fmtDate, fmtNum, HubLink, isFresh, Loading, OeCredit, PhotosLink, PlayerPhoto, ratingTextClass, RevealButton, Section, td, TeamLogo, th, useHidden, usePageTitle } from "./ui";
import { useTeamPercentiles } from "./Ranks";
import { STable } from "../STable";
import { Radar } from "./Radar";
import { useRatingFile } from "./PlayerRating";
import { playerRowLine, profile } from "../../hub/playerRating";

type Mode = "team" | "player";

/** Team / player picker: type, then Enter (or a click) picks; arrow keys move through the list. */
export const ComparePick: React.FC<{ kind: Mode; onPick: (slug: string) => void; autoFocus?: boolean }> = ({ kind, onPick, autoFocus }) => {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<HubIndex | null>(null);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    (kind === "team" ? loadHubIndexQuick : loadHubIndex)()
      .then(setIndex)
      .catch(() => {});
  }, [kind]);
  const hits: HubHit[] = index && q.trim() ? searchHub(index, q, 6)[kind] : [];
  const pick = (h: HubHit | undefined) => {
    if (!h) return;
    onPick(h.slug);
    setQ("");
    setSel(0);
  };
  const label = kind === "team" ? tl("Pick a team…") : tl("Pick a player…");
  return (
    <div className="space-y-1">
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            pick(hits[sel] || hits[0]);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(s + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(s - 1, 0));
          }
        }}
        placeholder={label}
        aria-label={label}
        className="w-full bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-xs text-rw-text placeholder-rw-muted"
      />
      {hits.map((h, i) => (
        <button
          key={h.slug}
          type="button"
          onClick={() => pick(h)}
          onMouseEnter={() => setSel(i)}
          className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-xs min-w-0 ${
            i === sel ? "bg-rw-raised" : "bg-rw-bg hover:bg-rw-raised"
          }`}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            {kind === "team" ? (
              <TeamLogo name={h.name} size={16} />
            ) : (
              <PlayerPhoto name={h.name} team={h.sub} slug={h.slug} size={18} linkFallback={false} />
            )}
            <span className="text-rw-text font-semibold truncate">{h.name}</span>
          </span>
          <span className="text-rw-muted truncate shrink-0 max-w-[50%]">{h.sub}</span>
        </button>
      ))}
    </div>
  );
};

/** One compared number; "better" says which side to highlight (higher or lower is better). */
/** A percentile (0-100, 100 = best of its league season) as a small chip shaded from red to teal. */
const PctChip: React.FC<{ p: number | null | undefined }> = ({ p }) =>
  p == null ? null : (
    <span
      className="inline-block px-1 py-0.5 rounded text-center font-mono tabular-nums text-[9px] leading-none text-rw-sub border border-rw-border/60"
      style={{
        background:
          p >= 50
            ? `color-mix(in srgb, var(--rw-teal) ${Math.round(12 + (p - 50) * 0.9)}%, transparent)`
            : `color-mix(in srgb, var(--rw-red) ${Math.round(12 + (50 - p) * 0.9)}%, transparent)`,
      }}
      title={tl("Percentile in its league season: better than {p}% of the league's teams", { p })}
    >
      P{p}
    </span>
  );

const Row: React.FC<{
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  va?: number | null;
  vb?: number | null;
  better?: "high" | "low";
  /** each team's percentile on this stat in its league season */
  pa?: number | null;
  pb?: number | null;
  /** false: no bars (the viewer switched them off) */
  bars?: boolean;
}> = ({ label, a, b, va, vb, better = "high", pa, pb, bars: barsOn = true }) => {
  const win = va != null && vb != null && va !== vb ? ((va > vb) === (better === "high") ? "a" : "b") : null;
  const cls = (side: "a" | "b") =>
    win === side
      ? side === "a"
        ? "text-rw-side-a font-bold"
        : "text-rw-side-b font-bold"
      : win
        ? "text-rw-sub font-medium"
        : "text-rw-text font-medium";
  const hasNums = barsOn && va != null && vb != null && Number.isFinite(va) && Number.isFinite(vb) && !(va === 0 && vb === 0);
  let shareA = 0.5;
  if (hasNums) {
    const na = va as number;
    const nb = vb as number;
    if (na === nb) {
      shareA = 0.5;
    } else if (na >= 0 && nb >= 0 && na + nb > 0) {
      shareA = Math.min(0.92, Math.max(0.08, na / (na + nb)));
    } else {
      const span = Math.max(Math.abs(na), Math.abs(nb), 1);
      shareA = Math.min(0.92, Math.max(0.08, 0.5 + (na - nb) / (4 * span)));
    }
  }
  return (
    <div className="py-2 border-t border-rw-border/60 first:border-t-0 space-y-1">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2">
        <span className={`flex items-baseline gap-1.5 min-w-0 font-mono tabular-nums text-xs sm:text-[13px] ${cls("a")}`}>
          <span className="truncate">{a}</span>
          <PctChip p={pa} />
        </span>
        <span className="px-2 text-center text-rw-muted text-[11px] font-medium leading-tight">{label}</span>
        <span className={`flex items-baseline justify-end gap-1.5 min-w-0 font-mono tabular-nums text-xs sm:text-[13px] text-right ${cls("b")}`}>
          <PctChip p={pb} />
          <span className="truncate">{b}</span>
        </span>
      </div>
      {hasNums && (
        <div className="relative h-1.5 w-full rounded-full bg-rw-bg overflow-hidden flex gap-[2px]" aria-hidden="true">
          <div
            className={`h-full rounded-l-full transition-all ${
              win === "a" ? "bg-rw-side-a/90" : win === "b" ? "bg-rw-side-a/25" : "bg-rw-side-a/55"
            }`}
            style={{ width: `calc(${(shareA * 100).toFixed(1)}% - 1px)` }}
          />
          <div
            className={`h-full flex-1 rounded-r-full transition-all ${
              win === "b" ? "bg-rw-side-b/90" : win === "a" ? "bg-rw-side-b/25" : "bg-rw-side-b/55"
            }`}
          />
          <span className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1.5px] bg-rw-panel/90" />
        </div>
      )}
    </div>
  );
};

/** One row of the side-by-side table, as data (CompareRows orders and filters them). */
interface RowSpec {
  key: string;
  label: string;
  group?: string;
  a: React.ReactNode;
  b: React.ReactNode;
  va?: number | null;
  vb?: number | null;
  better?: "high" | "low";
  pa?: number | null;
  pb?: number | null;
}

/** The side-by-side table's settings, kept on this device: hidden stats, bars, percentile chips, the order. */
interface ComparePrefs {
  hide: string[];
  bars: boolean;
  pcts: boolean;
  edge: boolean;
}
const COMPARE_PREFS = "rw_compare_prefs";
function useComparePrefs(): [ComparePrefs, (p: ComparePrefs) => void] {
  const [p, setP] = useState<ComparePrefs>(() => {
    const none: ComparePrefs = { hide: [], bars: true, pcts: false, edge: false };
    try {
      const saved = JSON.parse(localStorage.getItem(COMPARE_PREFS) || "{}");
      return {
        hide: Array.isArray(saved.hide) ? saved.hide : [],
        bars: saved.bars !== false,
        pcts: saved.pcts === true,
        edge: !!saved.edge,
      };
    } catch {
      return none;
    }
  });
  const set = (n: ComparePrefs) => {
    setP(n);
    try {
      localStorage.setItem(COMPARE_PREFS, JSON.stringify(n));
    } catch {
      // private window: the choice lasts until the page closes
    }
  };
  return [p, set];
}

/** How far apart the two numbers are, relative to their size (a row without two numbers sorts last). */
const gap = (r: RowSpec) => (r.va != null && r.vb != null ? Math.abs(r.va - r.vb) / Math.max(Math.abs(r.va), Math.abs(r.vb), 1e-9) : -1);

/**
 * The side-by-side table with the viewer's choices: the order (as listed, or the biggest difference first: the gap
 * relative to the two numbers' size), the bars and percentile chips on or off, and which stats show.
 */
const CompareRows: React.FC<{ rows: RowSpec[]; pctNote?: React.ReactNode }> = ({ rows, pctNote }) => {
  const [prefs, set] = useComparePrefs();
  const shown = rows.filter((r) => !prefs.hide.includes(r.key));
  const ordered = prefs.edge ? [...shown].sort((x, y) => gap(y) - gap(x)) : shown;
  const seg = (on: boolean) => `px-2 py-1 pointer-coarse:min-h-9 max-sm:min-h-9 ${on ? "bg-rw-accent/15 text-rw-text" : "text-rw-sub hover:text-rw-text"}`;
  const check = "flex items-center gap-2 text-xs text-rw-text cursor-pointer min-h-7";
  const hasAnyPcts = rows.some((r) => r.pa != null || r.pb != null);

  // When in "As listed" mode and rows define groups, render clean grouped cards/sections
  const groups = useMemo(() => {
    if (prefs.edge || !ordered.some((r) => r.group)) {
      return [{ title: null as string | null, items: ordered }];
    }
    const out: { title: string | null; items: RowSpec[] }[] = [];
    for (const r of ordered) {
      const g = r.group || null;
      const last = out[out.length - 1];
      if (!last || last.title !== g) out.push({ title: g, items: [r] });
      else last.items.push(r);
    }
    return out;
  }, [ordered, prefs.edge]);

  return (
    <>
      <div data-nocapture="1" className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
        <span className="flex rounded border border-rw-border divide-x divide-rw-border overflow-hidden" role="group" aria-label={tl("Order")}>
          <button type="button" aria-pressed={!prefs.edge} onClick={() => set({ ...prefs, edge: false })} className={seg(!prefs.edge)}>
            {tl("As listed")}
          </button>
          <button type="button" aria-pressed={prefs.edge} onClick={() => set({ ...prefs, edge: true })} className={seg(prefs.edge)}>
            {tl("Biggest difference first")}
          </button>
        </span>
        <details className="relative">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none px-2 py-1 pointer-coarse:min-h-9 max-sm:min-h-9 flex items-center rounded border border-rw-border text-rw-sub hover:text-rw-text">
            {tl("Show")}
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-60 max-h-80 overflow-y-auto bg-rw-surface border border-rw-border rounded-lg shadow-xl p-2 space-y-1">
            <label className={check}>
              <input type="checkbox" checked={prefs.bars} onChange={(e) => set({ ...prefs, bars: e.target.checked })} />
              {tl("Bars")}
            </label>
            {hasAnyPcts && (
              <label className={check}>
                <input type="checkbox" checked={prefs.pcts} onChange={(e) => set({ ...prefs, pcts: e.target.checked })} />
                {tl("Percentile chips")}
              </label>
            )}
            <div className="pt-1 mt-1 border-t border-rw-border text-[10px] text-rw-muted">{tl("Stats")}</div>
            {rows.map((r) => (
              <label key={r.key} className={check}>
                <input
                  type="checkbox"
                  checked={!prefs.hide.includes(r.key)}
                  onChange={(e) => set({ ...prefs, hide: e.target.checked ? prefs.hide.filter((h) => h !== r.key) : [...prefs.hide, r.key] })}
                />
                {r.label}
              </label>
            ))}
          </div>
        </details>
      </div>
      {prefs.pcts && pctNote}
      <div className="space-y-3">
        {groups.map((grp, gi) => (
          <div key={grp.title || `g-${gi}`} className="rounded-lg border border-rw-border/70 bg-rw-bg/35 px-3 py-1.5">
            {grp.title && (
              <div className="text-[10px] font-bold uppercase tracking-wider text-rw-accent pt-1 pb-1.5 border-b border-rw-border/60">
                {grp.title}
              </div>
            )}
            <div>
              {grp.items.map(({ key, ...r }) => (
                <Row key={key} {...r} bars={prefs.bars} pa={prefs.pcts ? r.pa : null} pb={prefs.pcts ? r.pb : null} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

/** The two teams on their league-season percentiles (the rows that have both), as one picture. */
const TeamRadar: React.FC<{ rows: RowSpec[]; a: string; b: string }> = ({ rows, a, b }) => {
  const both = rows.filter((r) => r.pa != null && r.pb != null).slice(0, 8);
  if (both.length < 3) return null;
  return (
    <Radar
      axes={both.map((r) => r.label)}
      sides={[
        { name: a, values: both.map((r) => r.pa as number) },
        { name: b, values: both.map((r) => r.pb as number) },
      ]}
      note={tl("Percentile among their league's teams that season: the dashed ring is the middle, the edge the best.")}
    />
  );
};

/** The two players on the parts of the RiftWise rating, each against their role's average game. */
const PlayerRadar: React.FC<{ ra: PlayerGameRow[]; rb: PlayerGameRow[]; a: string; b: string }> = ({ ra, rb, a, b }) => {
  const f = useRatingFile();
  const pa = useMemo(() => (f ? profile(ra.map(playerRowLine), f) : null), [f, ra]);
  const pb = useMemo(() => (f ? profile(rb.map(playerRowLine), f) : null), [f, rb]);
  if (!pa || !pb) return null;
  return (
    <Radar
      axes={[tl("Kill participation"), tl("Damage share"), tl("Gold share"), tl("CS / min"), tl("Vision share"), tl("Staying alive")]}
      sides={[
        { name: a, values: pa },
        { name: b, values: pb },
      ]}
      note={tl("The parts of the RiftWise rating, each against the same role's average game (the dashed ring); the edge is the best.")}
    />
  );
};

/** a share in percent, one decimal like gol.gg ("61.0%") */
const pct = (v: number | null | undefined) => (v == null ? "–" : `${fmtDec(v)}%`);
const d = (v: number | null | undefined, suffix = "") => (v == null ? "–" : `${fmtN(v)}${suffix}`);
const sgn = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`);
const perGame = (n: number, g: number) => (g ? Number((n / g).toFixed(1)) : null);

/** Choices both logs offer: all, last N, years and tournaments of either, newest first. */
export function bothOptions(a: { date: string; e: string; en: string }[], b: { date: string; e: string; en: string }[]): PeriodOption[] {
  const merged = [...a, ...b].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const opts = periodOptions(merged, 80);
  const n = Math.min(a.length, b.length);
  return opts.filter((o) => !/^last(\d+)$/.test(o.key) || Number(o.key.slice(4)) < n);
}

export const ComparePage: React.FC<{ route: CompareRoute }> = ({ route }) => {
  usePageTitle(tl("Compare"));
  useDDragon();
  const mode: Mode = route.mode || "team";
  const a = route.a || null;
  const b = route.b || null;
  const set = (patch: Partial<CompareRoute>) =>
    navigateHub({ kind: "compare", mode, a: a || undefined, b: b || undefined, period: route.period, more: route.more, ...patch }, { replace: true });
  // three or more: a table with a column each
  if (route.more && route.more.length && a && b) return <MultiCompare mode={mode} slugs={[a, b, ...route.more]} period={route.period} set={set} />;

  // what the loaded files are for: switching players -> teams (or new names) mustn't read the old files as the new
  // kind for a moment (player rows as team rows broke the page)
  const forKey = `${mode}|${a}|${b}`;
  const [info, setInfo] = useState<{ key: string; a: HubTeam | HubPlayer | null; b: HubTeam | HubPlayer | null }>({ key: "", a: null, b: null });
  const [logs, setLogs] = useState<{ key: string; a: (TeamGameRow | PlayerGameRow)[] | null; b: (TeamGameRow | PlayerGameRow)[] | null }>({ key: "", a: null, b: null });
  useEffect(() => {
    let alive = true;
    const loadInfo = (s: string | null) => (s ? (mode === "team" ? loadHubTeam(s) : loadHubPlayer(s)).catch(() => null) : Promise.resolve(null));
    const loadLog = (s: string | null) =>
      s ? (mode === "team" ? loadTeamGames(s) : loadPlayerGames(s)).catch(() => [] as (TeamGameRow | PlayerGameRow)[]) : Promise.resolve(null);
    Promise.all([loadInfo(a), loadInfo(b), loadLog(a), loadLog(b)]).then(([ia, ib, la, lb]) => {
      if (!alive) return;
      setInfo({ key: forKey, a: ia, b: ib });
      setLogs({ key: forKey, a: la, b: lb });
    });
    return () => {
      alive = false;
    };
  }, [mode, a, b]);

  const ready = !!(a && b && info.key === forKey && logs.key === forKey && info.a && info.b && logs.a && logs.b);
  useEffect(() => {
    if (!ready || !info.a || !info.b) return;
    countView(`${mode}/${info.a.u}`, info.a.name);
    countView(`${mode}/${info.b.u}`, info.b.name);
  }, [ready, mode, info.a, info.b]);
  const refs = (rows: (TeamGameRow | PlayerGameRow)[]) =>
    mode === "team" ? (rows as TeamGameRow[]).map(teamRowRef) : (rows as PlayerGameRow[]).map(playerRowRef);
  const options = useMemo(() => (ready ? bothOptions(refs(logs.a!), refs(logs.b!)) : []), [ready, logs]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaultComparePeriod = useMemo<PeriodKey>(() => {
    if (!ready) return "all";
    const topYr = options.find((o) => o.group === "year")?.key;
    if (topYr && topYr.startsWith("y")) {
      const yr = topYr.slice(1);
      const recentCutoff = String(new Date().getFullYear() - 1);
      if (yr >= recentCutoff && logs.a!.some((r) => r[0].startsWith(yr)) && logs.b!.some((r) => r[0].startsWith(yr))) {
        return topYr;
      }
    }
    return "all";
  }, [ready, options, logs.a, logs.b]);
  const period: PeriodKey = route.period && options.some((o) => o.key === route.period) ? route.period : defaultComparePeriod;

  const selA = useMemo(
    () => (ready ? (mode === "team" ? inPeriod(logs.a as TeamGameRow[], period, teamRowRef) : inPeriod(logs.a as PlayerGameRow[], period, playerRowRef)) : []),
    [ready, logs.a, period, mode],
  );
  const selB = useMemo(
    () => (ready ? (mode === "team" ? inPeriod(logs.b as TeamGameRow[], period, teamRowRef) : inPeriod(logs.b as PlayerGameRow[], period, playerRowRef)) : []),
    [ready, logs.b, period, mode],
  );
  const opt = options.find((o) => o.key === period);
  const periodLabel = !opt || opt.key === "all" ? tl("All time") : opt.group === "basic" ? tl("Last {n} games", { n: opt.label }) : opt.label;
  const freshDate = [...selA, ...selB].map((r) => r[0]).find((x) => isFresh(x));
  const [hidden, reveal] = useHidden(`compare:${mode}:${a}:${b}:${period}`, freshDate);

  return (
    <CaptureContext.Provider value={ready ? `${info.a!.name} vs ${info.b!.name} · ${periodLabel}` : null}>
    <div className="rw-page">
      <div className="rw-span flex flex-wrap items-center gap-2 text-xs">
        {(["team", "player"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => navigateHub({ kind: "compare", mode: k }, { replace: true })}
            className={`px-2.5 py-1.5 rounded-lg border ${
              mode === k ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
            }`}
          >
            {k === "team" ? tl("Teams") : tl("Players")}
          </button>
        ))}
        {ready && mode === "team" && (
          <>
            <HubLink to={{ kind: "prep", a: a!, b: b!, period: route.period }} className="text-rw-accent hover:underline">
              {tl("Match prep")}
            </HubLink>
            <HubLink
              to={{ kind: "draft", query: `teams=${encodeURIComponent(a!)},${encodeURIComponent(b!)}${period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}` }}
              className="text-rw-accent hover:underline"
            >
              {tl("Draft board")}
            </HubLink>
            <HubLink
              to={{ kind: "finder", query: `team=${encodeURIComponent(a!)}&vs=${encodeURIComponent(b!)}` }}
              className="text-rw-accent hover:underline"
            >
              {tl("Game finder")}
            </HubLink>
          </>
        )}
        {ready && mode === "player" && (
          <>
            <HubLink
              to={{ kind: "finder", query: `player=${encodeURIComponent(a!)}` }}
              className="text-rw-accent hover:underline"
            >
              {tl("Game finder")}
            </HubLink>
            <HubLink to={{ kind: "leaders" }} className="text-rw-accent hover:underline">
              {tl("Leaderboards")}
            </HubLink>
          </>
        )}
        {ready && (
          <span className="flex flex-wrap items-center gap-1.5 ml-auto min-w-0">
            <QuickPeriods options={options} value={period} onChange={(p) => set({ period: p })} />
            <span className="text-rw-muted">{tl("Stats for")}</span>
            <PeriodPicker options={options} value={period} onChange={(p) => set({ period: p })} />
          </span>
        )}
      </div>
      <div className="rw-span grid grid-cols-2 gap-3">
        {(
          [
            { s: a, i: info.key === forKey ? info.a : null, key: "a" as const },
            { s: b, i: info.key === forKey ? info.b : null, key: "b" as const },
          ]
        ).map((side) => (
          <div key={side.key} className={`${card} space-y-1 min-w-0`}>
            {side.s && side.i && (
              <div className={`text-sm font-bold flex items-center gap-2 min-w-0 ${side.key === "a" ? "text-rw-side-a" : "text-rw-side-b"}`}>
                {mode === "team" ? (
                  <TeamLogo name={side.i.name} size={20} />
                ) : (
                  <PlayerPhoto name={side.i.name} slug={side.s} img={(side.i as HubPlayer).img} size={22} />
                )}
                <HubLink to={{ kind: mode, slug: side.s }} className="truncate hover:underline">
                  {side.i.name}
                </HubLink>
              </div>
            )}
            {side.s ? (
              <button type="button" onClick={() => set({ [side.key]: undefined })} className="text-[11px] text-rw-accent hover:underline">
                {tl("Change")}
              </button>
            ) : (
              <ComparePick kind={mode} autoFocus={side.key === "a" || !!a} onPick={(slug) => set({ [side.key]: slug })} />
            )}
          </div>
        ))}
      </div>
      {ready && (
        <details className="rw-span text-xs">
          <summary className="cursor-pointer text-rw-accent hover:underline">{tl("Compare a third one too")}</summary>
          <div className={`${card} mt-2 max-w-md`}>
            <ComparePick kind={mode} autoFocus onPick={(slug) => set({ more: [slug] })} />
          </div>
        </details>
      )}
      {ready &&
        (hidden ? (
          <div className={`${card} py-4 text-center`}>
            <RevealButton onReveal={reveal} />
          </div>
        ) : mode === "team" ? (
          <TeamRows x={info.a as HubTeam} y={info.b as HubTeam} ra={selA as TeamGameRow[]} rb={selB as TeamGameRow[]} bSlug={b!} career={period === "all"} period={period} periodLabel={periodLabel} />
        ) : (
          <PlayerRows x={info.a as HubPlayer} y={info.b as HubPlayer} ra={selA as PlayerGameRow[]} rb={selB as PlayerGameRow[]} career={period === "all"} period={period} periodLabel={periodLabel} />
        ))}
      {mode === "team" && ready && <HeadToHeadSeries a={a!} b={b!} aName={info.a!.name} bName={info.b!.name} />}
      {mode === "player" && ready && (
        <PlayerHeadToHead a={logs.a as PlayerGameRow[]} b={logs.b as PlayerGameRow[]} aName={info.a!.name} bName={info.b!.name} spoilerKey={`h2hp:${a}:${b}`} />
      )}
    </div>
    </CaptureContext.Provider>
  );
};

const COMPARE_ROLES: { role: string; short: string }[] = [
  { role: "Top", short: "TOP" },
  { role: "Jungle", short: "JGL" },
  { role: "Mid", short: "MID" },
  { role: "Bot", short: "BOT" },
  { role: "Support", short: "SUP" },
];

const CopyComparePost: React.FC<{ title: string; lines: string[]; url: string }> = ({ title, lines, url }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = [title, ...lines, url].filter(Boolean).join("\n");
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={tl("Copy post")}
      className="px-2 py-0.5 rounded bg-rw-surface hover:bg-rw-border border border-rw-border text-[11px] font-semibold text-rw-sub hover:text-rw-text inline-flex items-center gap-1"
    >
      {copied ? <Check className="w-3 h-3 text-rw-teal" /> : <Copy className="w-3 h-3" />}
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};

export const TeamRows: React.FC<{
  x: HubTeam;
  y: HubTeam;
  ra: TeamGameRow[];
  rb: TeamGameRow[];
  bSlug: string;
  career: boolean;
  period?: PeriodKey;
  periodLabel: string;
  /** win chance of x and y in percent (Match prep), for the 16:9 card */
  chance?: [number, number] | null;
}> = ({ x, y, ra, rb, bSlug, career, period, periodLabel, chance }) => {
  const A = useMemo(() => teamAgg(ra), [ra]);
  const B = useMemo(() => teamAgg(rb), [rb]);
  const h2h = useMemo(() => teamHeadToHead(ra, bSlug), [ra, bSlug]);
  const PX = useTeamPercentiles(x.u, x.events);
  const PY = useTeamPercentiles(y.u, y.events);
  const pc = (key: string) => ({ pa: PX?.pct[key] ?? null, pb: PY?.pct[key] ?? null });
  const drafts = useMemo(() => ({ A: draftTendencies(ra), B: draftTendencies(rb) }), [ra, rb]);
  const wr = (w: number, g: number) => (g ? w / g : null);
  const rolePairs = useMemo(
    () => COMPARE_ROLES.map(({ role, short }) => ({ role, short, pa: teamStarter(x, role), pb: teamStarter(y, role) })).filter((r) => r.pa && r.pb),
    [x, y],
  );
  // the side-by-side rows (their order and which show are the viewer's: CompareRows)
  const gOverview = tl("Overview");
  const gEarly = tl("Early game");
  const gObj = `${tl("Towers")} · ${tl("Baron%")}`;
  const gPace = tl("Stats");
  const tStat = (slug: string, v: string) =>
    v !== "–" ? (
      <HubLink
        to={{ kind: "team", slug, tab: "stats", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
        className="hover:text-rw-accent hover:underline"
      >
        {v}
      </HubLink>
    ) : (
      v
    );
  const periodFinderParam =
    period?.startsWith("y") && period.length === 5
      ? `&year=${encodeURIComponent(period.slice(1))}`
      : period?.startsWith("e:")
        ? `&event=${encodeURIComponent(period.slice(2))}`
        : "";
  const rows: RowSpec[] = [
    {
      key: "h2h",
      group: gOverview,
      label: career ? tl("Head to head (games)") : tl("Head to head this period (games)"),
      a: h2h.g ? (
        <HubLink
          to={{ kind: "finder", query: `team=${encodeURIComponent(x.u)}&vs=${encodeURIComponent(y.u)}${periodFinderParam}` }}
          className="hover:text-rw-accent hover:underline"
        >
          {h2h.w}
        </HubLink>
      ) : (
        "–"
      ),
      b: h2h.g ? (
        <HubLink
          to={{ kind: "finder", query: `team=${encodeURIComponent(y.u)}&vs=${encodeURIComponent(x.u)}${periodFinderParam}` }}
          className="hover:text-rw-accent hover:underline"
        >
          {h2h.g - h2h.w}
        </HubLink>
      ) : (
        "–"
      ),
      va: h2h.g ? h2h.w : null,
      vb: h2h.g ? h2h.g - h2h.w : null,
    },
    {
      key: "games",
      group: gOverview,
      label: tl("Games won"),
      a: (
        <HubLink to={{ kind: "team", slug: x.u, tab: "matches" }} className="hover:text-rw-accent hover:underline">
          {`${A.w}-${A.g - A.w}`}
        </HubLink>
      ),
      b: (
        <HubLink to={{ kind: "team", slug: y.u, tab: "matches" }} className="hover:text-rw-accent hover:underline">
          {`${B.w}-${B.g - B.w}`}
        </HubLink>
      ),
    },
    {
      key: "wr",
      group: gOverview,
      label: tl("Win rate"),
      a: (
        <HubLink
          to={{ kind: "team", slug: x.u, tab: "stats", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
          className="hover:text-rw-accent hover:underline"
        >
          {winRate(A.w, A.g)}
        </HubLink>
      ),
      b: (
        <HubLink
          to={{ kind: "team", slug: y.u, tab: "stats", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
          className="hover:text-rw-accent hover:underline"
        >
          {winRate(B.w, B.g)}
        </HubLink>
      ),
      va: wr(A.w, A.g),
      vb: wr(B.w, B.g),
      ...pc("wr"),
    },
    {
      key: "blue",
      group: gOverview,
      label: tl("Blue side wins"),
      a: A.blue[0] ? (
        <HubLink to={{ kind: "finder", query: `team=${encodeURIComponent(x.u)}&side=b${periodFinderParam}` }} className="hover:text-rw-accent hover:underline">
          {`${winRate(A.blue[1], A.blue[0])} (${A.blue[0]})`}
        </HubLink>
      ) : (
        `${winRate(A.blue[1], A.blue[0])} (${A.blue[0]})`
      ),
      b: B.blue[0] ? (
        <HubLink to={{ kind: "finder", query: `team=${encodeURIComponent(y.u)}&side=b${periodFinderParam}` }} className="hover:text-rw-accent hover:underline">
          {`${winRate(B.blue[1], B.blue[0])} (${B.blue[0]})`}
        </HubLink>
      ) : (
        `${winRate(B.blue[1], B.blue[0])} (${B.blue[0]})`
      ),
      va: wr(A.blue[1], A.blue[0]),
      vb: wr(B.blue[1], B.blue[0]),
    },
    {
      key: "red",
      group: gOverview,
      label: tl("Red side wins"),
      a: A.red[0] ? (
        <HubLink to={{ kind: "finder", query: `team=${encodeURIComponent(x.u)}&side=r${periodFinderParam}` }} className="hover:text-rw-accent hover:underline">
          {`${winRate(A.red[1], A.red[0])} (${A.red[0]})`}
        </HubLink>
      ) : (
        `${winRate(A.red[1], A.red[0])} (${A.red[0]})`
      ),
      b: B.red[0] ? (
        <HubLink to={{ kind: "finder", query: `team=${encodeURIComponent(y.u)}&side=r${periodFinderParam}` }} className="hover:text-rw-accent hover:underline">
          {`${winRate(B.red[1], B.red[0])} (${B.red[0]})`}
        </HubLink>
      ) : (
        `${winRate(B.red[1], B.red[0])} (${B.red[0]})`
      ),
      va: wr(A.red[1], A.red[0]),
      vb: wr(B.red[1], B.red[0]),
    },
    ...(career
      ? ([
          {
            key: "titles",
            group: gOverview,
            label: tl("Titles"),
            a: (
              <HubLink to={{ kind: "team", slug: x.u, tab: "history" }} className="hover:text-rw-accent hover:underline">
                {x.titles.length}
              </HubLink>
            ),
            b: (
              <HubLink to={{ kind: "team", slug: y.u, tab: "history" }} className="hover:text-rw-accent hover:underline">
                {y.titles.length}
              </HubLink>
            ),
            va: x.titles.length,
            vb: y.titles.length,
          },
          {
            key: "worlds",
            group: gOverview,
            label: tl("Worlds"),
            a: (
              <HubLink to={{ kind: "team", slug: x.u, tab: "history" }} className="hover:text-rw-accent hover:underline">
                {x.titles.filter((t) => t.kind === "Worlds").length}
              </HubLink>
            ),
            b: (
              <HubLink to={{ kind: "team", slug: y.u, tab: "history" }} className="hover:text-rw-accent hover:underline">
                {y.titles.filter((t) => t.kind === "Worlds").length}
              </HubLink>
            ),
          },
        ] as RowSpec[])
      : []),
    ...(A.tl || B.tl
      ? ([
          { key: "gd10", group: gEarly, label: "GD@10", a: tStat(x.u, sgn(A.tl?.gd10 ?? null)), b: tStat(y.u, sgn(B.tl?.gd10 ?? null)), va: A.tl?.gd10 ?? null, vb: B.tl?.gd10 ?? null },
          { key: "gd15", group: gEarly, label: "GD@15", a: tStat(x.u, sgn(A.tl?.gd15 ?? null)), b: tStat(y.u, sgn(B.tl?.gd15 ?? null)), va: A.tl?.gd15 ?? null, vb: B.tl?.gd15 ?? null, ...pc("g15") },
          { key: "lead15", group: gEarly, label: tl("Ahead at 15"), a: tStat(x.u, pct(A.tl?.lead15 ?? null)), b: tStat(y.u, pct(B.tl?.lead15 ?? null)), va: A.tl?.lead15 ?? null, vb: B.tl?.lead15 ?? null },
          {
            key: "ahead",
            group: gEarly,
            label: tl("Win rate when ahead at 15"),
            a: tStat(x.u, A.tl ? winRate(A.tl.ahead[1], A.tl.ahead[0]) : "–"),
            b: tStat(y.u, B.tl ? winRate(B.tl.ahead[1], B.tl.ahead[0]) : "–"),
            va: A.tl ? wr(A.tl.ahead[1], A.tl.ahead[0]) : null,
            vb: B.tl ? wr(B.tl.ahead[1], B.tl.ahead[0]) : null,
          },
          {
            key: "behind",
            group: gEarly,
            label: tl("Win rate when behind at 15"),
            a: tStat(x.u, A.tl ? winRate(A.tl.behind[1], A.tl.behind[0]) : "–"),
            b: tStat(y.u, B.tl ? winRate(B.tl.behind[1], B.tl.behind[0]) : "–"),
            va: A.tl ? wr(A.tl.behind[1], A.tl.behind[0]) : null,
            vb: B.tl ? wr(B.tl.behind[1], B.tl.behind[0]) : null,
          },
          { key: "fb", group: gEarly, label: tl("First blood"), a: tStat(x.u, pct(A.tl?.fb ?? null)), b: tStat(y.u, pct(B.tl?.fb ?? null)), va: A.tl?.fb ?? null, vb: B.tl?.fb ?? null, ...pc("fb") },
          { key: "ft", group: gEarly, label: tl("First tower"), a: tStat(x.u, pct(A.tl?.ft ?? null)), b: tStat(y.u, pct(B.tl?.ft ?? null)), va: A.tl?.ft ?? null, vb: B.tl?.ft ?? null, ...pc("ft") },
          { key: "fd", group: gEarly, label: tl("First dragon"), a: tStat(x.u, pct(A.tl?.fd ?? null)), b: tStat(y.u, pct(B.tl?.fd ?? null)), va: A.tl?.fd ?? null, vb: B.tl?.fd ?? null },
          { key: "pl", group: gEarly, label: tl("Turret plates"), a: tStat(x.u, d(A.tl?.plates ?? null)), b: tStat(y.u, d(B.tl?.plates ?? null)), va: A.tl?.plates ?? null, vb: B.tl?.plates ?? null, ...pc("pl") },
          ...(A.tl?.grubs != null || B.tl?.grubs != null
            ? [{ key: "grubs", group: gEarly, label: tl("Void grubs"), a: tStat(x.u, d(A.tl?.grubs ?? null)), b: tStat(y.u, d(B.tl?.grubs ?? null)), va: A.tl?.grubs ?? null, vb: B.tl?.grubs ?? null }]
            : []),
        ] as RowSpec[])
      : []),
    { key: "drap", group: gObj, label: tl("DRA%"), a: tStat(x.u, pct(A.dragShare)), b: tStat(y.u, pct(B.dragShare)), va: A.dragShare, vb: B.dragShare, ...pc("drap") },
    { key: "barp", group: gObj, label: tl("Baron%"), a: tStat(x.u, pct(A.baronShare)), b: tStat(y.u, pct(B.baronShare)), va: A.baronShare, vb: B.baronShare, ...pc("barp") },
    { key: "tow", group: gObj, label: tl("Towers"), a: tStat(x.u, d(A.towers)), b: tStat(y.u, d(B.towers)), va: A.towers, vb: B.towers, ...pc("tow") },
    { key: "tl", group: gObj, label: tl("Towers lost per game"), a: tStat(x.u, d(A.towersLost)), b: tStat(y.u, d(B.towersLost)), va: A.towersLost, vb: B.towersLost, better: "low", ...pc("tl") },
    { key: "k", group: gPace, label: tl("Kills / game"), a: tStat(x.u, d(A.kills)), b: tStat(y.u, d(B.kills)), va: A.kills, vb: B.kills, ...pc("k") },
    { key: "d", group: gPace, label: tl("Deaths / game"), a: tStat(x.u, d(A.deaths)), b: tStat(y.u, d(B.deaths)), va: A.deaths, vb: B.deaths, better: "low" },
    { key: "ckpm", group: gPace, label: "CKPM", a: tStat(x.u, d(A.ckpm)), b: tStat(y.u, d(B.ckpm)), va: A.ckpm, vb: B.ckpm },
    { key: "min", group: gPace, label: tl("Avg game (min)"), a: tStat(x.u, d(A.min)), b: tStat(y.u, d(B.min)), va: A.min, vb: B.min },
    { key: "gd", group: gPace, label: tl("Gold diff / game"), a: tStat(x.u, sgn(A.gd)), b: tStat(y.u, sgn(B.gd)), va: A.gd, vb: B.gd },
    { key: "gdm", group: gPace, label: tl("GD/m"), a: tStat(x.u, sgn(A.gdm)), b: tStat(y.u, sgn(B.gdm)), va: A.gdm, vb: B.gdm, ...pc("gdm") },
    { key: "gpm", group: gPace, label: tl("GPM"), a: tStat(x.u, A.gpm != null ? fmtNum(A.gpm) : "–"), b: tStat(y.u, B.gpm != null ? fmtNum(B.gpm) : "–"), va: A.gpm, vb: B.gpm, ...pc("gpm") },
    ...(A.tl || B.tl
      ? ([{ key: "vspm", group: gPace, label: tl("VS / min"), a: tStat(x.u, d(A.tl?.vspm ?? null)), b: tStat(y.u, d(B.tl?.vspm ?? null)), va: A.tl?.vspm ?? null, vb: B.tl?.vspm ?? null }] as RowSpec[])
      : []),
  ];
  const pctNote =
    PX || PY ? (
      <p className="text-[10px] text-rw-muted">
        {tl("Shaded numbers: percentile among their league's teams that season (100 = best; {list}).", {
          list: [PX && `${x.name}: ${PX.league} ${PX.year}, ${PX.n} ${tl("teams")}`, PY && `${y.name}: ${PY.league} ${PY.year}, ${PY.n} ${tl("teams")}`]
            .filter(Boolean)
            .join("; "),
        })}
      </p>
    ) : null;
  const postLines = [
    h2h.g > 0 ? `H2H: ${x.name} ${h2h.w}–${h2h.g - h2h.w} ${y.name}` : "",
    `${tl("Win rate")}: ${winRate(A.w, A.g)} (${A.w}-${A.g - A.w}) vs ${winRate(B.w, B.g)} (${B.w}-${B.g - B.w})`,
    A.tl || B.tl ? `GD@15: ${sgn(A.tl?.gd15 ?? null)} vs ${sgn(B.tl?.gd15 ?? null)} · FB: ${pct(A.tl?.fb ?? null)} vs ${pct(B.tl?.fb ?? null)}` : "",
    `DRA%: ${pct(A.dragShare)} vs ${pct(B.dragShare)} · ${tl("Baron%")}: ${pct(A.baronShare)} vs ${pct(B.baronShare)}`,
  ];
  return (
    <>
      <Section
        title={`${x.name} vs ${y.name}`}
        right={
          <span className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-[11px] text-rw-sub whitespace-nowrap">{periodLabel}</span>
            <CopyComparePost title={`${x.name} vs ${y.name} · ${periodLabel}`} lines={postLines} url={hubShareUrl({ kind: "compare", mode: "team", a: x.u, b: y.u })} />
            <BroadcastCardButton data={() => teamCardData(x, y, A, B, periodLabel, chance)} name={`${x.name}-vs-${y.name}`} label={tl("Overview card")} />
            {drafts.A.games >= 3 && drafts.B.games >= 3 && (
              <BroadcastCardButton
                data={() => draftCard({ aName: x.name, bName: y.name, A: drafts.A, B: drafts.B, period: periodLabel })}
                name={`${x.name}-vs-${y.name}-drafts`}
                label={tl("Draft card")}
              />
            )}
          </span>
        }
        share={`${x.name}-vs-${y.name}-${periodLabel}`}
      >
        <div className="flex items-center justify-between gap-3 text-sm font-bold">
          <span className="flex items-center gap-2 min-w-0 text-rw-side-a">
            <TeamLogo name={x.name} sizeClass="w-9 h-9 lg:w-12 lg:h-12 2xl:w-16 2xl:h-16" />
            <HubLink to={{ kind: "team", slug: x.u }} className="truncate hover:underline">
              {x.name}
            </HubLink>
          </span>
          <span className="flex items-center gap-2 min-w-0 text-rw-side-b">
            <HubLink to={{ kind: "team", slug: y.u }} className="truncate text-right hover:underline">
              {y.name}
            </HubLink>
            <TeamLogo name={y.name} sizeClass="w-9 h-9 lg:w-12 lg:h-12 2xl:w-16 2xl:h-16" />
          </span>
        </div>
        {rolePairs.length > 0 && (
          <div data-nocapture="1" className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
            {rolePairs.map(({ role, short, pa, pb }) => (
              <HubLink
                key={role}
                to={{ kind: "compare", mode: "player", a: pa!.u, b: pb!.u, period }}
                className="flex flex-col items-center justify-center px-2 py-1.5 rounded-lg bg-rw-bg/70 hover:bg-rw-raised border border-rw-border/70 hover:border-rw-accent/50 transition-colors min-w-0"
              >
                <span className="text-[9px] font-bold uppercase tracking-wider text-rw-muted">{short}</span>
                <span className="w-full flex items-center justify-between gap-1 text-[11px] font-semibold min-w-0 mt-0.5">
                  <span className="flex items-center gap-1 min-w-0 text-rw-side-a">
                    <PlayerPhoto name={pa!.n} team={x.name} slug={pa!.u} size={16} linkFallback={false} />
                    <span className="truncate">{pa!.n}</span>
                  </span>
                  <span className="text-rw-muted text-[9px] shrink-0">vs</span>
                  <span className="flex items-center justify-end gap-1 min-w-0 text-rw-side-b text-right">
                    <span className="truncate">{pb!.n}</span>
                    <PlayerPhoto name={pb!.n} team={y.name} slug={pb!.u} size={16} linkFallback={false} />
                  </span>
                </span>
              </HubLink>
            ))}
          </div>
        )}
        <CompareRows rows={rows} pctNote={pctNote} />
        <TeamRadar rows={rows} a={x.name} b={y.name} />
        {(A.tl || B.tl) && <OeCredit />}
      </Section>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { n: x.name, u: x.u, t: A, rows: ra },
          { n: y.name, u: y.u, t: B, rows: rb },
        ].map((s) => (
          <Section
            key={s.n}
            title={tl("Most picked: {team}", { team: s.n })}
            share={`${s.n}-draft-${periodLabel}`}
            right={
              <SectionCard
                section={tl("Most picked: {team}", { team: s.n })}
                sub={periodLabel}
                name={`${s.n}-picks-${periodLabel}`}
                rows={() =>
                  s.t.picks.slice(0, 10).map(([c, n, w], idx) => ({
                    rank: idx + 1,
                    champ: c,
                    label: c,
                    sub: tn("{n} game", "{n} games", n),
                    value: winRate(w, n),
                  }))
                }
              />
            }
          >
            <ul className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {(() => {
                const topPicks = s.t.picks.slice(0, 10);
                const maxPickN = Math.max(1, ...topPicks.map(([, n]) => n));
                return topPicks.map(([c, n, w]) => {
                  const good = n > 0 && w / n >= 0.5;
                  return (
                    <li key={c} className="flex items-center justify-between gap-2 min-w-0">
                      <ChampLink name={c} size={16} />
                      <span
                        className="inline-flex items-center gap-1.5 text-rw-sub shrink-0 tabular-nums"
                        title={`${tn("{n} game", "{n} games", n)} · ${tl("{pct} win rate", { pct: winRate(w, n) })}`}
                      >
                        <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                          <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(8, Math.round((n / maxPickN) * 100))}%` }} />
                        </span>
                        <HubLink
                          to={{
                            kind: "team",
                            slug: s.u,
                            tab: "champions",
                            query: `champ=${encodeURIComponent(c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                          }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Every game")}
                        >
                          {n}
                        </HubLink>
                        <span className="text-rw-muted">·</span>
                        <HubLink
                          to={{
                            kind: "team",
                            slug: s.u,
                            tab: "champions",
                            query: `champ=${encodeURIComponent(c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                          }}
                          className={`w-9 text-right hover:underline ${good ? "text-rw-teal font-semibold" : "text-rw-red"}`}
                          title={tl("Every game")}
                        >
                          {winRate(w, n)}
                        </HubLink>
                      </span>
                    </li>
                  );
                });
              })()}
            </ul>
            <DraftTendencies rows={s.rows} teamName={s.n} teamSlug={s.u} period={period} periodLabel={periodLabel} />
          </Section>
        ))}
      </div>
    </>
  );
};

const PlayerRows: React.FC<{
  x: HubPlayer;
  y: HubPlayer;
  ra: PlayerGameRow[];
  rb: PlayerGameRow[];
  career: boolean;
  period?: PeriodKey;
  periodLabel: string;
}> = ({
  x,
  y,
  ra,
  rb,
  career,
  period,
  periodLabel,
}) => {
  const A = useMemo(() => playerAgg(ra), [ra]);
  const B = useMemo(() => playerAgg(rb), [rb]);
  const h2h = useMemo(() => playerHeadToHead(ra, rb), [ra, rb]);
  const shared = useMemo(() => {
    const mb = new Map(B.champs.map((c) => [c.c, c]));
    return A.champs.filter((c) => mb.has(c.c)).slice(0, 8).map((c) => ({ c, o: mb.get(c.c)! }));
  }, [A, B]);
  const wr = (w: number, g: number) => (g ? w / g : null);
  const pg = (p: typeof A) => `${perGame(p.k, p.g) ?? "–"} / ${perGame(p.d, p.g) ?? "–"} / ${perGame(p.a, p.g) ?? "–"}`;
  const gOverview = tl("Overview");
  const gStats = tl("Stats");
  const gEarly = tl("Early game");
  const pStat = (slug: string, v: string) =>
    v === "–" ? (
      v
    ) : (
      <HubLink
        to={{ kind: "player", slug, tab: "stats", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
        className="hover:text-rw-accent hover:underline"
      >
        {v}
      </HubLink>
    );
  const pRows: RowSpec[] = [
    {
      key: "p_role",
      group: gOverview,
      label: tl("Role"),
      a: A.roles[0] ? (
        <HubLink to={{ kind: "leaders", query: `role=${encodeURIComponent(A.roles[0])}` }} className="hover:text-rw-accent hover:underline">
          {roleName(A.roles[0])}
        </HubLink>
      ) : (
        "–"
      ),
      b: B.roles[0] ? (
        <HubLink to={{ kind: "leaders", query: `role=${encodeURIComponent(B.roles[0])}` }} className="hover:text-rw-accent hover:underline">
          {roleName(B.roles[0])}
        </HubLink>
      ) : (
        "–"
      ),
    },
    ...(h2h.g > 0
      ? ([
          {
            key: "p_h2h",
            group: gOverview,
            label: career ? tl("Head to head (games)") : tl("Head to head this period (games)"),
            a: (
              <HubLink
                to={{ kind: "player", slug: x.u, tab: "matches", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
                className="hover:text-rw-accent hover:underline"
              >
                {h2h.w}
              </HubLink>
            ),
            b: (
              <HubLink
                to={{ kind: "player", slug: y.u, tab: "matches", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
                className="hover:text-rw-accent hover:underline"
              >
                {h2h.g - h2h.w}
              </HubLink>
            ),
            va: h2h.w,
            vb: h2h.g - h2h.w,
          },
        ] as RowSpec[])
      : []),
    {
      key: "p_games",
      group: gOverview,
      label: tl("Games won"),
      a: (
        <HubLink
          to={{ kind: "player", slug: x.u, tab: "stats", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
          className="hover:text-rw-accent hover:underline"
        >
          {`${A.w}-${A.g - A.w}`}
        </HubLink>
      ),
      b: (
        <HubLink
          to={{ kind: "player", slug: y.u, tab: "stats", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
          className="hover:text-rw-accent hover:underline"
        >
          {`${B.w}-${B.g - B.w}`}
        </HubLink>
      ),
    },
    {
      key: "p_wr",
      group: gOverview,
      label: tl("Win rate"),
      a: (
        <HubLink
          to={{ kind: "player", slug: x.u, tab: "stats", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
          className="hover:text-rw-accent hover:underline"
        >
          {winRate(A.w, A.g)}
        </HubLink>
      ),
      b: (
        <HubLink
          to={{ kind: "player", slug: y.u, tab: "stats", ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
          className="hover:text-rw-accent hover:underline"
        >
          {winRate(B.w, B.g)}
        </HubLink>
      ),
      va: wr(A.w, A.g),
      vb: wr(B.w, B.g),
    },
    {
      key: "p_champs",
      group: gOverview,
      label: tl("Champions played"),
      a: (
        <HubLink
          to={{ kind: "player", slug: x.u, tab: "champions", query: period && period !== "all" ? `p=${encodeURIComponent(period)}` : undefined }}
          className="hover:text-rw-accent hover:underline"
        >
          {A.champs.length}
        </HubLink>
      ),
      b: (
        <HubLink
          to={{ kind: "player", slug: y.u, tab: "champions", query: period && period !== "all" ? `p=${encodeURIComponent(period)}` : undefined }}
          className="hover:text-rw-accent hover:underline"
        >
          {B.champs.length}
        </HubLink>
      ),
      va: A.champs.length,
      vb: B.champs.length,
    },
    ...(career
      ? ([
          {
            key: "p_titles",
            group: gOverview,
            label: tl("Titles"),
            a: (
              <HubLink to={{ kind: "player", slug: x.u, tab: "career" }} className="hover:text-rw-accent hover:underline">
                {x.titles.length}
              </HubLink>
            ),
            b: (
              <HubLink to={{ kind: "player", slug: y.u, tab: "career" }} className="hover:text-rw-accent hover:underline">
                {y.titles.length}
              </HubLink>
            ),
            va: x.titles.length,
            vb: y.titles.length,
          },
          {
            key: "p_worlds",
            group: gOverview,
            label: tl("Worlds"),
            a: (
              <HubLink to={{ kind: "player", slug: x.u, tab: "career" }} className="hover:text-rw-accent hover:underline">
                {x.titles.filter((t) => t.kind === "Worlds").length}
              </HubLink>
            ),
            b: (
              <HubLink to={{ kind: "player", slug: y.u, tab: "career" }} className="hover:text-rw-accent hover:underline">
                {y.titles.filter((t) => t.kind === "Worlds").length}
              </HubLink>
            ),
          },
        ] as RowSpec[])
      : []),
    { key: "p_kda", group: gStats, label: tl("KDA"), a: pStat(x.u, fmtN(A.kda)), b: pStat(y.u, fmtN(B.kda)), va: A.kda, vb: B.kda },
    { key: "p_kda_line", group: gStats, label: "K / D / A", a: pStat(x.u, pg(A)), b: pStat(y.u, pg(B)) },
    { key: "p_kp", group: gStats, label: "KP", a: pStat(x.u, pct(A.kp)), b: pStat(y.u, pct(B.kp)), va: A.kp, vb: B.kp },
    { key: "p_csm", group: gStats, label: tl("CS / min"), a: pStat(x.u, d(A.csm)), b: pStat(y.u, d(B.csm)), va: A.csm, vb: B.csm },
    { key: "p_gpm", group: gStats, label: tl("GPM"), a: pStat(x.u, A.gpm != null ? fmtNum(A.gpm) : "–"), b: pStat(y.u, B.gpm != null ? fmtNum(B.gpm) : "–"), va: A.gpm, vb: B.gpm },
    { key: "p_dpm", group: gStats, label: tl("Damage / min"), a: pStat(x.u, A.dpm != null ? fmtNum(A.dpm) : "–"), b: pStat(y.u, B.dpm != null ? fmtNum(B.dpm) : "–"), va: A.dpm, vb: B.dpm },
    { key: "p_dmgp", group: gStats, label: tl("DMG%"), a: pStat(x.u, pct(A.dmgShare)), b: pStat(y.u, pct(B.dmgShare)), va: A.dmgShare, vb: B.dmgShare },
    { key: "p_goldp", group: gStats, label: tl("Gold%"), a: pStat(x.u, pct(A.goldShare)), b: pStat(y.u, pct(B.goldShare)), va: A.goldShare, vb: B.goldShare },
    { key: "p_vsm", group: gStats, label: tl("VS / min"), a: pStat(x.u, d(A.vsm)), b: pStat(y.u, d(B.vsm)), va: A.vsm, vb: B.vsm },
    ...(A.tl || B.tl
      ? ([
          { key: "p_gd15", group: gEarly, label: "GD@15", a: pStat(x.u, sgn(A.tl?.gd15 ?? null)), b: pStat(y.u, sgn(B.tl?.gd15 ?? null)), va: A.tl?.gd15 ?? null, vb: B.tl?.gd15 ?? null },
          { key: "p_csd15", group: gEarly, label: "CSD@15", a: pStat(x.u, sgn(A.tl?.csd15 ?? null)), b: pStat(y.u, sgn(B.tl?.csd15 ?? null)), va: A.tl?.csd15 ?? null, vb: B.tl?.csd15 ?? null },
          { key: "p_xpd15", group: gEarly, label: "XPD@15", a: pStat(x.u, sgn(A.tl?.xpd15 ?? null)), b: pStat(y.u, sgn(B.tl?.xpd15 ?? null)), va: A.tl?.xpd15 ?? null, vb: B.tl?.xpd15 ?? null },
          { key: "p_fbp", group: gEarly, label: tl("First blood involvement"), a: pStat(x.u, pct(A.tl?.fbPart ?? null)), b: pStat(y.u, pct(B.tl?.fbPart ?? null)), va: A.tl?.fbPart ?? null, vb: B.tl?.fbPart ?? null },
          {
            key: "p_fbv",
            group: gEarly,
            label: tl("Died for first blood"),
            a: pStat(x.u, pct(A.tl?.fbVictim ?? null)),
            b: pStat(y.u, pct(B.tl?.fbVictim ?? null)),
            va: A.tl?.fbVictim ?? null,
            vb: B.tl?.fbVictim ?? null,
            better: "low",
          },
          { key: "p_wpm", group: gEarly, label: tl("Wards / min"), a: pStat(x.u, d(A.tl?.wpm ?? null)), b: pStat(y.u, d(B.tl?.wpm ?? null)), va: A.tl?.wpm ?? null, vb: B.tl?.wpm ?? null },
          { key: "p_wcpm", group: gEarly, label: tl("Wards cleared / min"), a: pStat(x.u, d(A.tl?.wcpm ?? null)), b: pStat(y.u, d(B.tl?.wcpm ?? null)), va: A.tl?.wcpm ?? null, vb: B.tl?.wcpm ?? null },
        ] as RowSpec[])
      : []),
  ];
  const postLines = [
    h2h.g > 0 ? `H2H: ${x.name} ${h2h.w}–${h2h.g - h2h.w} ${y.name}` : "",
    `${tl("Win rate")}: ${winRate(A.w, A.g)} (${A.w}-${A.g - A.w}) vs ${winRate(B.w, B.g)} (${B.w}-${B.g - B.w})`,
    `KDA: ${fmtN(A.kda)} vs ${fmtN(B.kda)} · DPM: ${A.dpm != null ? fmtNum(A.dpm) : "–"} vs ${B.dpm != null ? fmtNum(B.dpm) : "–"}`,
    A.tl || B.tl ? `GD@15: ${sgn(A.tl?.gd15 ?? null)} vs ${sgn(B.tl?.gd15 ?? null)} · CSD@15: ${sgn(A.tl?.csd15 ?? null)} vs ${sgn(B.tl?.csd15 ?? null)}` : "",
  ];
  return (
    <>
      <Section
        title={`${x.name} vs ${y.name}`}
        right={
          <span className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-[11px] text-rw-sub whitespace-nowrap">{periodLabel}</span>
            <CopyComparePost title={`${x.name} vs ${y.name} · ${periodLabel}`} lines={postLines} url={hubShareUrl({ kind: "compare", mode: "player", a: x.u, b: y.u })} />
            <BroadcastCardButton
              data={() =>
                playerCardData(
                  { name: x.name, role: x.role ? roleName(x.role) : undefined, club: x.club, slug: x.u },
                  A,
                  periodLabel,
                  { name: y.name, role: y.role ? roleName(y.role) : undefined, club: y.club, slug: y.u },
                  B,
                )
              }
              name={`${x.name}-vs-${y.name}`}
              label={tl("Overview card")}
            />
          </span>
        }
        share={`${x.name}-vs-${y.name}-${periodLabel}`}
      >
        <div className="flex items-center justify-between gap-3 text-sm font-bold">
          <span className="flex items-center gap-2 min-w-0 text-rw-side-a">
            <PlayerPhoto name={x.name} team={x.club} slug={x.u} img={x.img} sizeClass="w-11 h-11 lg:w-16 lg:h-16 2xl:w-20 2xl:h-20" />
            <HubLink to={{ kind: "player", slug: x.u }} className="truncate hover:underline">
              {x.name}
            </HubLink>
            <PhotosLink q={x.name} iconOnly className="text-rw-muted hover:text-rw-accent shrink-0" />
          </span>
          <span className="flex items-center gap-2 min-w-0 text-rw-side-b">
            <PhotosLink q={y.name} iconOnly className="text-rw-muted hover:text-rw-accent shrink-0" />
            <HubLink to={{ kind: "player", slug: y.u }} className="truncate text-right hover:underline">
              {y.name}
            </HubLink>
            <PlayerPhoto name={y.name} team={y.club} slug={y.u} img={y.img} sizeClass="w-11 h-11 lg:w-16 lg:h-16 2xl:w-20 2xl:h-20" />
          </span>
        </div>
        <CompareRows rows={pRows} />
        <PlayerRadar ra={ra} rb={rb} a={x.name} b={y.name} />
        {(A.tl || B.tl) && <OeCredit />}
      </Section>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { n: x.name, u: x.u, p: A },
          { n: y.name, u: y.u, p: B },
        ].map((s) => (
          <Section
            key={s.n}
            title={tl("Champions: {player}", { player: s.n })}
            right={
              <SectionCard
                section={tl("Champions: {player}", { player: s.n })}
                sub={periodLabel}
                name={`${s.n}-champs-${periodLabel}`}
                rows={() =>
                  s.p.champs.slice(0, 8).map((c, idx) => ({
                    rank: idx + 1,
                    champ: c.c,
                    label: c.c,
                    sub: `${c.g} · ${fmtN(c.kda)} KDA`,
                    value: winRate(c.w, c.g),
                  }))
                }
              />
            }
          >
            <ul className="text-xs space-y-1">
              {(() => {
                const topChamps = s.p.champs.slice(0, 8);
                const maxChampG = Math.max(1, ...topChamps.map((c) => c.g));
                return topChamps.map((c) => {
                  const good = c.g > 0 && c.w / c.g >= 0.5;
                  return (
                    <li key={c.c} className="flex items-center justify-between gap-2 min-w-0">
                      <ChampLink name={c.c} size={16} />
                      <span className="inline-flex items-center gap-1.5 text-rw-sub shrink-0 tabular-nums">
                        <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                          <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(8, Math.round((c.g / maxChampG) * 100))}%` }} />
                        </span>
                        <HubLink
                          to={{
                            kind: "player",
                            slug: s.u,
                            tab: "champions",
                            query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                          }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Every game")}
                        >
                          {c.g}
                        </HubLink>
                        <span className="text-rw-muted">·</span>
                        <HubLink
                          to={{
                            kind: "player",
                            slug: s.u,
                            tab: "champions",
                            query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                          }}
                          className={`w-9 text-right hover:underline ${good ? "text-rw-teal font-semibold" : "text-rw-red"}`}
                          title={tl("Every game")}
                        >
                          {winRate(c.w, c.g)}
                        </HubLink>
                        <span className="text-rw-muted">·</span>
                        <HubLink
                          to={{
                            kind: "player",
                            slug: s.u,
                            tab: "champions",
                            query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                          }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Every game")}
                        >
                          {fmtN(c.kda)} KDA
                        </HubLink>
                      </span>
                    </li>
                  );
                });
              })()}
            </ul>
          </Section>
        ))}
      </div>
      {shared.length > 0 && (
        <Section
          title={tl("Champions both played")}
          right={
            <SectionCard
              section={tl("Champions both played")}
              sub={`${x.name} vs ${y.name} · ${periodLabel}`}
              name={`${x.name}-vs-${y.name}-shared-champs`}
              rows={() =>
                shared.map(({ c, o }, idx) => ({
                  rank: idx + 1,
                  champ: c.c,
                  label: c.c,
                  sub: `${x.name}: ${c.g} (${winRate(c.w, c.g)})`,
                  value: `${y.name}: ${o.g} (${winRate(o.w, o.g)})`,
                }))
              }
            />
          }
        >
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={`${th} text-right text-rw-side-a`}>{x.name}</th>
                <th className={`${th} text-center`}>{tl("Champion")}</th>
                <th className={`${th} text-rw-side-b`}>{y.name}</th>
              </tr>
            </thead>
            <tbody>
              {shared.map(({ c, o }) => {
                const wrA = c.g ? c.w / c.g : 0;
                const wrB = o.g ? o.w / o.g : 0;
                const gSum = c.g + o.g;
                const aShare = gSum > 0 ? Math.round((c.g / gSum) * 100) : 50;
                return (
                  <tr key={c.c} className="border-t border-rw-border">
                    <td className={`${td} text-right tabular-nums w-2/5`} data-sort={c.g}>
                      <HubLink
                        to={{
                          kind: "player",
                          slug: x.u,
                          tab: "champions",
                          query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                        }}
                        className="hover:text-rw-accent hover:underline"
                        title={tl("Every game")}
                      >
                        {c.g}
                      </HubLink>{" "}
                      ·{" "}
                      <HubLink
                        to={{
                          kind: "player",
                          slug: x.u,
                          tab: "champions",
                          query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                        }}
                        className={`hover:underline ${wrA > wrB ? "text-rw-side-a font-semibold" : ""}`}
                        title={tl("Every game")}
                      >
                        {winRate(c.w, c.g)}
                      </HubLink>{" "}
                      ·{" "}
                      <HubLink
                        to={{
                          kind: "player",
                          slug: x.u,
                          tab: "champions",
                          query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                        }}
                        className={`hover:underline ${c.kda != null && o.kda != null && c.kda > o.kda ? "text-rw-side-a font-semibold" : ""}`}
                        title={tl("Every game")}
                      >
                        {fmtN(c.kda)}
                      </HubLink>
                    </td>
                    <td className={`${td} text-center`} data-sort={c.c}>
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <ChampLink name={c.c} size={16} />
                        {gSum > 0 && (
                          <span className="w-12 h-1 rounded-full bg-rw-raised overflow-hidden flex" aria-hidden="true">
                            <span className="h-full bg-rw-side-a/85" style={{ width: `${aShare}%` }} />
                            <span className="h-full bg-rw-side-b/85" style={{ width: `${100 - aShare}%` }} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${td} tabular-nums w-2/5`} data-sort={o.g}>
                      <HubLink
                        to={{
                          kind: "player",
                          slug: y.u,
                          tab: "champions",
                          query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                        }}
                        className="hover:text-rw-accent hover:underline"
                        title={tl("Every game")}
                      >
                        {o.g}
                      </HubLink>{" "}
                      ·{" "}
                      <HubLink
                        to={{
                          kind: "player",
                          slug: y.u,
                          tab: "champions",
                          query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                        }}
                        className={`hover:underline ${wrB > wrA ? "text-rw-side-b font-semibold" : ""}`}
                        title={tl("Every game")}
                      >
                        {winRate(o.w, o.g)}
                      </HubLink>{" "}
                      ·{" "}
                      <HubLink
                        to={{
                          kind: "player",
                          slug: y.u,
                          tab: "champions",
                          query: `champ=${encodeURIComponent(c.c)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                        }}
                        className={`hover:underline ${c.kda != null && o.kda != null && o.kda > c.kda ? "text-rw-side-b font-semibold" : ""}`}
                        title={tl("Every game")}
                      >
                        {fmtN(o.kda)}
                      </HubLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </STable>
          <p className="text-[10px] text-rw-muted">{tl("Games · win rate · KDA")}</p>
        </Section>
      )}
    </>
  );
};

/**
 * Every game two players played against each other (all time): the record, the lane gold lead at 15 minutes when
 * they faced each other in lane, their most common champion matchups and the games themselves.
 */
const PlayerHeadToHead: React.FC<{ a: PlayerGameRow[]; b: PlayerGameRow[]; aName: string; bName: string; spoilerKey: string }> = ({
  a,
  b,
  aName,
  bName,
  spoilerKey,
}) => {
  const meetings = useMemo(() => playerMeetings(a, b), [a, b]);
  const [hidden, reveal] = useHidden(spoilerKey, meetings.find((m) => isFresh(m.a[0]))?.a[0]);
  const [n, setN] = useState(10);
  const shown = hidden ? meetings.filter((m) => !isFresh(m.a[0])) : meetings;
  const s = useMemo(() => {
    const w = shown.filter((m) => m.a[6]).length;
    // lane leads only when they played the same role (then each one's lead is over the other)
    const lane = shown.filter((m) => m.a[10] && m.a[10] === m.b[10] && m.a[21]?.[3] != null);
    const gd15 = lane.length ? lane.reduce((t, m) => t + (m.a[21]![3] as number), 0) / lane.length : null;
    const pairs = new Map<string, { ca: string; cb: string; g: number; w: number }>();
    for (const m of shown) {
      const k = `${m.a[2]}|${m.b[2]}`;
      const x = pairs.get(k) || { ca: m.a[2], cb: m.b[2], g: 0, w: 0 };
      x.g++;
      x.w += m.a[6] ? 1 : 0;
      pairs.set(k, x);
    }
    const series = new Map<string, number>();
    for (const m of shown) series.set(m.a[1], (series.get(m.a[1]) || 0) + (m.a[6] ? 1 : -1));
    const sw = [...series.values()].filter((v) => v > 0).length;
    const sl = [...series.values()].filter((v) => v < 0).length;
    return { w, l: shown.length - w, gd15, lane: lane.length, top: [...pairs.values()].sort((x, y) => y.g - x.g).slice(0, 5), sw, sl };
  }, [shown]);
  if (meetings.length === 0) return null;
  return (
    <Section
      title={tl("Head to head")}
      right={
        hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <SectionCard
            section={`${tl("Head to head")} · ${aName} vs ${bName}`}
            sub={`${aName} ${s.w} – ${s.l} ${bName}`}
            name={`h2h-${aName}-vs-${bName}`}
            rows={() =>
              shown.slice(0, 10).map((m, idx) => ({
                rank: idx + 1,
                champ: m.a[2],
                label: `${m.a[2]} (${m.a[3]}/${m.a[4]}/${m.a[5]}) vs ${m.b[2]} (${m.b[3]}/${m.b[4]}/${m.b[5]})`,
                sub: `${m.a[9]} · ${fmtDate(m.a[0])}`,
                value: m.a[6] ? aName : bName,
              }))
            }
          />
        )
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className={`${card} py-2 space-y-1`}>
          <div className="text-[10px] text-rw-muted">{tl("Games")}</div>
          <div className="font-bold text-rw-text tabular-nums">
            <HubLink to={{ kind: "player", slug: prettySlug(aName), tab: "matches" }} className="hover:text-rw-accent hover:underline">
              {aName} {s.w}
            </HubLink>{" "}
            –{" "}
            <HubLink to={{ kind: "player", slug: prettySlug(bName), tab: "matches" }} className="hover:text-rw-accent hover:underline">
              {s.l} {bName}
            </HubLink>
          </div>
          {s.w + s.l > 0 && (
            <div className="h-1.5 rounded-full bg-rw-raised overflow-hidden flex gap-[2px]">
              <div className="h-full bg-rw-side-a/85" style={{ width: `${Math.round((s.w / Math.max(1, s.w + s.l)) * 100)}%` }} />
              <div className="h-full flex-1 bg-rw-side-b/85" />
            </div>
          )}
        </div>
        <div className={`${card} py-2 space-y-1`}>
          <div className="text-[10px] text-rw-muted">{tl("Series")}</div>
          <div className="font-bold text-rw-text tabular-nums">
            <HubLink to={{ kind: "player", slug: prettySlug(aName), tab: "matches" }} className="hover:text-rw-accent hover:underline">
              {s.sw}
            </HubLink>{" "}
            –{" "}
            <HubLink to={{ kind: "player", slug: prettySlug(bName), tab: "matches" }} className="hover:text-rw-accent hover:underline">
              {s.sl}
            </HubLink>
          </div>
          {s.sw + s.sl > 0 && (
            <div className="h-1.5 rounded-full bg-rw-raised overflow-hidden flex gap-[2px]">
              <div className="h-full bg-rw-side-a/85" style={{ width: `${Math.round((s.sw / Math.max(1, s.sw + s.sl)) * 100)}%` }} />
              <div className="h-full flex-1 bg-rw-side-b/85" />
            </div>
          )}
        </div>
        {s.gd15 != null && (
          <div className={`${card} py-2`} title={tl("{name}'s gold lead over the other at 15 minutes, in the {n} games they faced each other in lane", { name: aName, n: s.lane })}>
            <div className="text-[10px] text-rw-muted">{tl("Gold lead at 15 in lane")}</div>
            <HubLink
              to={{ kind: "player", slug: prettySlug(aName), tab: "stats" }}
              className={`font-bold tabular-nums hover:underline ${s.gd15 >= 0 ? "text-rw-teal" : "text-rw-red"}`}
            >
              {s.gd15 >= 0 ? "+" : ""}
              {fmtNum(Math.round(s.gd15))}
            </HubLink>
          </div>
        )}
      </div>
      {s.top.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-rw-muted">{tl("Most common champion matchups")}</div>
          <ul className="text-xs grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {s.top.map((p) => {
              const aPct = p.g > 0 ? Math.round((p.w / p.g) * 100) : 50;
              return (
                <li key={p.ca + p.cb} className="flex items-center gap-1.5 min-w-0">
                  <HubLink to={{ kind: "champ", slug: prettySlug(p.ca) }} className="shrink-0">
                    <ChampIcon name={p.ca} size={18} />
                  </HubLink>
                  <HubLink to={{ kind: "champ", slug: prettySlug(p.cb) }} className="shrink-0">
                    <ChampIcon name={p.cb} size={18} />
                  </HubLink>
                  <span className="truncate text-rw-sub">
                    <ChampLink name={p.ca} /> vs <ChampLink name={p.cb} />
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5 shrink-0">
                    <span className="hidden sm:inline-flex w-8 h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                      <span className="h-full bg-rw-side-a/85" style={{ width: `${aPct}%` }} />
                      <span className="h-full bg-rw-side-b/85" style={{ width: `${100 - aPct}%` }} />
                    </span>
                    <HubLink
                      to={{ kind: "counters", query: `champ=${prettySlug(p.ca)}&vs=${encodeURIComponent(p.cb)}` }}
                      className="tabular-nums text-rw-text hover:text-rw-accent hover:underline"
                      title={tl("Counter-pick finder")}
                    >
                      {p.w}–{p.g - p.w}
                    </HubLink>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ul className="text-xs space-y-1">
        {shown.slice(0, n).map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-2 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <HubLink
                to={{ kind: "match", slug: m.a[1], game: m.a[22] || undefined }}
                className={`w-3.5 shrink-0 font-bold hover:underline ${m.a[6] ? "text-rw-teal" : "text-rw-red"}`}
              >
                {m.a[6] ? tc("short result", "W") : tc("short result", "L")}
              </HubLink>
              <HubLink to={{ kind: "champ", slug: prettySlug(m.a[2]) }}>
                <ChampIcon name={m.a[2]} size={18} />
              </HubLink>
              <HubLink to={{ kind: "match", slug: m.a[1], game: m.a[22] || undefined }} className="tabular-nums text-rw-text hover:text-rw-accent hover:underline">
                {m.a[3]}/{m.a[4]}/{m.a[5]}
              </HubLink>
              <HubLink
                to={{ kind: "counters", query: `champ=${prettySlug(m.a[2])}&vs=${encodeURIComponent(m.b[2])}` }}
                className="text-rw-muted hover:text-rw-accent hover:underline"
                title={tl("Counter-pick finder")}
              >
                vs
              </HubLink>
              <HubLink to={{ kind: "champ", slug: prettySlug(m.b[2]) }}>
                <ChampIcon name={m.b[2]} size={18} />
              </HubLink>
              <HubLink to={{ kind: "match", slug: m.a[1], game: m.a[22] || undefined }} className="tabular-nums text-rw-sub hover:text-rw-accent hover:underline">
                {m.b[3]}/{m.b[4]}/{m.b[5]}
              </HubLink>
              <span className="truncate text-rw-muted">
                · <EventLink name={m.a[9]} u={m.a[11]} className="text-rw-muted hover:text-rw-accent hover:underline" />
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0 text-rw-muted">
              {m.a[23] != null && (
                <HubLink
                  to={{ kind: "match", slug: m.a[1], game: m.a[22] || undefined }}
                  className={`tabular-nums font-semibold hover:underline ${ratingTextClass(m.a[23])}`}
                  title={tl("Game rating")}
                >
                  {m.a[23].toFixed(0)}
                </HubLink>
              )}
              <HubLink to={{ kind: "match", slug: m.a[1], game: m.a[22] || undefined }} className="hover:text-rw-accent hover:underline">
                {fmtDate(m.a[0])}
              </HubLink>
              <HubLink to={{ kind: "match", slug: m.a[1], game: m.a[22] || undefined }} className="text-rw-accent hover:underline">
                {tl("Details")}
              </HubLink>
            </span>
          </li>
        ))}
      </ul>
      {shown.length > n && (
        <button type="button" onClick={() => setN((x) => x + 20)} className="text-[11px] text-rw-accent hover:underline">
          {tl("Show more ({n} left)", { n: shown.length - n })}
        </button>
      )}
    </Section>
  );
};

// ── Three or more side by side ────────────────────────────────────────────────────────────────────────────

type Loaded = { slug: string; info: HubTeam | HubPlayer; log: (TeamGameRow | PlayerGameRow)[] };

/** Up to eight teams or players in one table: one column each, the best number of every row lit up. */
const MultiCompare: React.FC<{ mode: Mode; slugs: string[]; period?: string; set: (p: Partial<CompareRoute>) => void }> = ({ mode, slugs, period: wanted, set }) => {
  // tagged with what they were loaded for (see ComparePage: old files mustn't be read as the new kind)
  const forKey = `${mode}|${slugs.join(",")}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: Loaded[] } | null>(null);
  const rows = loaded && loaded.key === forKey ? loaded.rows : null;
  useEffect(() => {
    let alive = true;
    Promise.all(
      slugs.map(async (slug) => {
        try {
          const info = await (mode === "team" ? loadHubTeam(slug) : loadHubPlayer(slug));
          const log = await (mode === "team" ? loadTeamGames(slug) : loadPlayerGames(slug)).catch(() => [] as (TeamGameRow | PlayerGameRow)[]);
          return { slug, info, log } as Loaded;
        } catch {
          return null;
        }
      }),
    ).then((xs) => alive && setLoaded({ key: forKey, rows: xs.filter((x): x is Loaded => !!x) }));
    return () => {
      alive = false;
    };
  }, [mode, slugs.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const refs = (log: (TeamGameRow | PlayerGameRow)[]) => (mode === "team" ? (log as TeamGameRow[]).map(teamRowRef) : (log as PlayerGameRow[]).map(playerRowRef));
  // periods every column can show: all logs merged; "last N" only when each has that many games
  const options = useMemo(() => {
    if (!rows || !rows.length) return [];
    const merged = rows.flatMap((r) => refs(r.log)).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    const n = Math.min(...rows.map((r) => r.log.length));
    return periodOptions(merged, 80).filter((o) => !/^last(\d+)$/.test(o.key) || Number(o.key.slice(4)) < n);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const period: PeriodKey = wanted && options.some((o) => o.key === wanted) ? wanted : "all";
  const opt = options.find((o) => o.key === period);
  const periodLabel = !opt || opt.key === "all" ? tl("All time") : opt.group === "basic" ? tl("Last {n} games", { n: opt.label }) : opt.label;
  const aggs = useMemo(
    () =>
      (rows || []).map((r) =>
        mode === "team" ? teamAgg(inPeriod(r.log as TeamGameRow[], period, teamRowRef)) : playerAgg(inPeriod(r.log as PlayerGameRow[], period, playerRowRef)),
      ),
    [rows, period, mode],
  );
  const remove = (slug: string) => {
    const left = slugs.filter((s) => s !== slug);
    set({ a: left[0], b: left[1], more: left.slice(2).length ? left.slice(2) : undefined });
  };
  if (!rows) return <Loading />;
  const wr = (w: number, g: number) => (g ? (w / g) * 100 : null);
  // [label, value per column, lower is better]
  const lines: [string, (number | null)[], boolean?][] =
    mode === "team"
      ? (() => {
          const A = aggs as TeamAgg[];
          return [
            [tl("Games"), A.map((x) => x.g)],
            [tl("Win rate"), A.map((x) => wr(x.w, x.g))],
            [tl("Blue side wins"), A.map((x) => wr(x.blue[1], x.blue[0]))],
            [tl("Red side wins"), A.map((x) => wr(x.red[1], x.red[0]))],
            [tl("Avg game (min)"), A.map((x) => x.min)],
            [tl("Kills / game"), A.map((x) => x.kills)],
            [tl("Deaths / game"), A.map((x) => x.deaths), true],
            [tl("Gold diff / game"), A.map((x) => x.gd)],
            ["GD@15", A.map((x) => x.tl?.gd15 ?? null)],
            [tl("First blood"), A.map((x) => x.tl?.fb ?? null)],
            ["DRA%", A.map((x) => x.dragShare)],
            [tl("Baron%"), A.map((x) => x.baronShare)],
            [tl("Towers"), A.map((x) => x.towers)],
            [tl("Champion pool"), A.map((x) => x.nPicks)],
          ];
        })()
      : (() => {
          const A = aggs as PlayerAgg[];
          return [
            [tl("Games"), A.map((x) => x.g)],
            [tl("Win rate"), A.map((x) => wr(x.w, x.g))],
            ["KDA", A.map((x) => x.kda)],
            ["KP", A.map((x) => x.kp)],
            [tl("CS / min"), A.map((x) => x.csm)],
            [tl("Damage / min"), A.map((x) => x.dpm)],
            ["DMG%", A.map((x) => x.dmgShare)],
            ["GD@15", A.map((x) => x.tl?.gd15 ?? null)],
            ["CSD@15", A.map((x) => x.tl?.csd15 ?? null)],
            [tl("VS / min"), A.map((x) => x.vsm)],
            [tl("Champion pool"), A.map((x) => x.champs.length)],
          ];
        })();
  const pct = (label: string) => /rate|wins|%|blood|KP/.test(label);
  const fmt = (label: string, v: number | null) =>
    v == null ? "–" : pct(label) ? `${fmtDec(v)}%` : /GD@15|Gold diff/.test(label) ? `${v > 0 ? "+" : ""}${fmtNum(Math.round(v))}` : /KDA|CS|VS|min\)/.test(label) ? Number(v.toFixed(2)).toLocaleString(locale()) : fmtNum(Math.round(v));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {rows.map((r) => (
          <span key={r.slug} className={`${card} py-1 px-2 flex items-center gap-1.5`}>
            {mode === "team" ? (
              <TeamLogo name={r.info.name} size={16} />
            ) : (
              <PlayerPhoto name={r.info.name} slug={r.slug} img={(r.info as HubPlayer).img} size={18} />
            )}
            <HubLink to={{ kind: mode, slug: r.slug }} className="font-bold hover:underline">
              {r.info.name}
            </HubLink>
            <button type="button" onClick={() => remove(r.slug)} className="text-rw-muted hover:text-rw-red" aria-label={tl("Remove")} title={tl("Remove")}>
              ×
            </button>
          </span>
        ))}
        {slugs.length < 8 && (
          <details>
            <summary className="cursor-pointer text-rw-accent hover:underline">{tl("Add another")}</summary>
            <div className={`${card} mt-2 max-w-md`}>
              <ComparePick kind={mode} autoFocus onPick={(slug) => set({ more: [...slugs.slice(2), slug] })} />
            </div>
          </details>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {mode === "team" && rows.length >= 2 && (
            <>
              <HubLink
                to={{ kind: "prep", a: rows[0].slug, b: rows[1].slug, ...(period !== "all" ? { period } : {}) }}
                className="text-rw-accent hover:underline"
              >
                {tl("Match prep")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(rows[0].slug)},${encodeURIComponent(rows[1].slug)}${period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `team=${encodeURIComponent(rows[0].slug)}&vs=${encodeURIComponent(rows[1].slug)}`,
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Game finder")}
              </HubLink>
            </>
          )}
          <span className="text-rw-muted">{tl("Stats for")}</span>
          <QuickPeriods options={options} value={period} onChange={(p) => set({ period: p })} />
          <PeriodPicker options={options} value={period} onChange={(p) => set({ period: p })} />
        </span>
      </div>
      <Section
        title={`${tl("Compare")} · ${periodLabel}`}
        share={`riftwise-compare-${slugs.join("-")}`}
        right={
          <SectionCard
            section={`${tl("Compare")} · ${periodLabel}`}
            sub={rows.map((r) => r.info.name).join(" · ")}
            name={`compare-${slugs.join("-")}`}
            rows={() =>
              rows.map((r, idx) => {
                const agg = aggs[idx];
                return {
                  rank: idx + 1,
                  team: mode === "team" ? r.info.name : undefined,
                  label: r.info.name,
                  sub: mode === "team" ? `${agg.w}-${agg.g - agg.w} · GD@15 ${sgn(agg.tl?.gd15 ?? null)}` : `${agg.w}-${agg.g - agg.w} · ${fmtN((agg as PlayerAgg).kda)} KDA`,
                  value: winRate(agg.w, agg.g),
                };
              })
            }
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left py-1.5 pr-2 text-rw-muted font-semibold"></th>
                {rows.map((r) => (
                  <th key={r.slug} className="text-right py-1.5 px-2 font-bold text-rw-text whitespace-nowrap">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {mode === "team" ? (
                        <TeamLogo name={r.info.name} size={15} />
                      ) : (
                        <PlayerPhoto name={r.info.name} slug={r.slug} img={(r.info as HubPlayer).img} size={16} />
                      )}
                      <HubLink to={{ kind: mode, slug: r.slug }} className="hover:text-rw-accent hover:underline">
                        {r.info.name}
                      </HubLink>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines
                .filter(([, vs]) => vs.some((v) => v != null))
                .map(([label, vs, low]) => {
                  const known = vs.filter((v): v is number => v != null);
                  const best = known.length > 1 ? (low ? Math.min(...known) : Math.max(...known)) : null;
                  return (
                    <tr key={label} className="border-t border-rw-border">
                      <td className="py-1.5 pr-2 text-rw-muted whitespace-nowrap">{label}</td>
                      {vs.map((v, i) => {
                        const cellText = fmt(label, v);
                        const isSideLink =
                          v != null && mode === "team" && (label === tl("Blue side wins") || label === tl("Red side wins"));
                        const isChampsLink = v != null && label === tl("Champion pool");
                        const isStatsLink = v != null && !isSideLink && !isChampsLink;
                        return (
                          <td key={i} className={`py-1.5 px-2 text-right tabular-nums ${best != null && v === best ? "text-rw-teal font-bold" : "text-rw-text"}`}>
                            {isSideLink ? (
                              <HubLink
                                to={{
                                  kind: "finder",
                                  query: `team=${encodeURIComponent(rows[i].slug)}&side=${label === tl("Blue side wins") ? "b" : "r"}`,
                                }}
                                className="hover:text-rw-accent hover:underline"
                              >
                                {cellText}
                              </HubLink>
                            ) : isStatsLink ? (
                              <HubLink
                                to={{
                                  kind: mode,
                                  slug: rows[i].slug,
                                  tab: "stats",
                                  ...(period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}),
                                }}
                                className="hover:text-rw-accent hover:underline"
                              >
                                {cellText}
                              </HubLink>
                            ) : isChampsLink ? (
                              <HubLink
                                to={{
                                  kind: mode,
                                  slug: rows[i].slug,
                                  tab: "champions",
                                  ...(period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}),
                                }}
                                className="hover:text-rw-accent hover:underline"
                              >
                                {cellText}
                              </HubLink>
                            ) : (
                              cellText
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {aggs.some((x) => x.tl) && <OeCredit />}
      </Section>
    </>
  );
};
