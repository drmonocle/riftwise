/**
 * Percentile ranks in a league's season: where a player stands among the same role (or a team among the league's
 * teams) for each stat, e.g. "damage share: better than 92% of LCK mids in 2026, 2nd of 10".
 * Data: hub/leagueyear/<league>/<year>.json (every split and playoffs of the season summed).
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, tk, roleName, fmtDec } from "../../i18n";
import { loadLeagueSeason, loadLeagues, loadPlayerGames, loadPlayerGames2y, loadTeamGames, loadTeamGames2y } from "../../hub/data";
import type { EventPlayer, EventTeamStats, LeagueRow, PlayerGameRow, TeamGameRow } from "../../hub/types";
import { isFresh, Loading, RevealButton, Section, useHidden, useLoad } from "./ui";

export interface Metric<T> {
  key: string;
  label: string;
  /** a short column header for tables (Leaderboards) */
  short?: string;
  value: (x: T) => number | null;
  fmt: (v: number) => string;
  /** lower is better (deaths) */
  low?: boolean;
  /** count stats: the same per minute instead of per game (League ranks' per game / per minute switch) */
  perMin?: { label: string; value: (x: T) => number | null; fmt: (v: number) => string };
}

const r1 = (v: number) => fmtDec(v);
const r2 = (v: number) => fmtDec(v, 2);
const pc = (v: number) => `${fmtDec(v * 100)}%`;
const int = (v: number) => String(Math.round(v));
const sInt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}`;
const sR1 = (v: number) => `${v > 0 ? "+" : ""}${fmtDec(v)}`;
const div = (a: number | undefined, b: number | undefined) =>
  a != null && b ? a / b : null;

export const PLAYER_METRICS: Metric<EventPlayer>[] = [
  {
    key: "kda",
    label: "KDA",
    value: (p) => (p.k + p.a) / Math.max(p.d, 1),
    fmt: r2,
  },
  { key: "kp", label: "KP", value: (p) => div(p.k + p.a, p.tk), fmt: pc },
  {
    key: "k",
    short: "K",
    label: tk("Kills per game"),
    value: (p) => div(p.k, p.g),
    fmt: r1,
    perMin: { label: tk("Kills per minute"), value: (p) => div(p.k, p.min), fmt: r2 },
  },
  {
    key: "d",
    short: "D",
    label: tk("Deaths per game"),
    value: (p) => div(p.d, p.g),
    fmt: r1,
    low: true,
    perMin: { label: tk("Deaths per minute"), value: (p) => div(p.d, p.min), fmt: r2 },
  },
  {
    key: "csm",
    short: "CSM",
    label: tk("CS per minute"),
    value: (p) => div(p.cs, p.min),
    fmt: r1,
  },
  {
    key: "gpm",
    short: "GPM",
    label: tk("Gold per minute"),
    value: (p) => div(p.gold, p.min),
    fmt: int,
  },
  {
    key: "dpm",
    short: "DPM",
    label: tk("Damage per minute"),
    value: (p) => div(p.dmg, p.min),
    fmt: int,
  },
  { key: "dmgs", label: tk("DMG%"), value: (p) => div(p.sd, p.td), fmt: pc },
  { key: "golds", label: tk("Gold%"), value: (p) => div(p.sg, p.tg), fmt: pc },
  {
    key: "vsm",
    short: "VSPM",
    label: tk("Vision score per minute"),
    value: (p) => div(p.vis, p.vmin),
    fmt: r2,
  },
  // Oracle's Elixir (games with timelines only)
  { key: "g15", short: "GD@15", label: tk("Gold lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? div(p.g15, p.tn) : null), fmt: sInt },
  { key: "c15", short: "CSD@15", label: tk("CS lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? div(p.c15, p.tn) : null), fmt: sR1 },
  { key: "x15", short: "XPD@15", label: tk("XP lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? div(p.x15, p.tn) : null), fmt: sInt },
  { key: "fbp", short: "FB%", label: tk("Took part in first blood (kill or assist)"), value: (p) => (p.fbn ? div(p.fbp, p.fbn) : null), fmt: pc },
  { key: "wr", short: "W%", label: tk("Win %"), value: (p) => div(p.w, p.g), fmt: pc },
];

const TEAM_METRICS: Metric<EventTeamStats>[] = [
  { key: "wr", label: tk("Win %"), value: (t) => div(t.w, t.g), fmt: pc },
  {
    key: "gdm",
    label: tk("GD/m"),
    value: (t) => div(t.gd, t.min),
    fmt: (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`,
  },
  {
    key: "gpm",
    label: tk("GPM"),
    value: (t) => (t.gold ? div(t.gold, t.min) : null),
    fmt: int,
  },
  { key: "kd", label: "K:D", value: (t) => t.k / Math.max(t.d, 1), fmt: r2 },
  {
    key: "k",
    label: tk("Kills per game"),
    value: (t) => div(t.k, t.g),
    fmt: r1,
    perMin: { label: tk("Kills per minute"), value: (t) => div(t.k, t.min), fmt: r2 },
  },
  {
    key: "drap",
    label: tk("DRA%"),
    value: (t) => (t.odrag != null ? div(t.drag, t.drag + t.odrag) : null),
    fmt: pc,
  },
  {
    key: "barp",
    label: tk("Baron%"),
    value: (t) => (t.obar != null ? div(t.bar, t.bar + t.obar) : null),
    fmt: pc,
  },
  {
    key: "tow",
    label: tk("Towers per game"),
    value: (t) => div(t.tow, t.g),
    fmt: r1,
    perMin: { label: tk("Towers per minute"), value: (t) => div(t.tow, t.min), fmt: r2 },
  },
  {
    key: "tl",
    label: tk("Towers lost per game"),
    value: (t) => (t.tl != null ? div(t.tl, t.g) : null),
    fmt: r1,
    low: true,
    perMin: { label: tk("Towers lost per minute"), value: (t) => (t.tl != null ? div(t.tl, t.min) : null), fmt: r2 },
  },
  // Oracle's Elixir (games with timelines only)
  { key: "g15", label: tk("Gold lead at 15 minutes"), value: (t) => (t.tn ? div(t.g15, t.tn) : null), fmt: sInt },
  { key: "fb", label: tk("First blood rate"), value: (t) => (t.fbn ? div(t.fb, t.fbn) : null), fmt: pc },
  { key: "ft", label: tk("First tower rate"), value: (t) => (t.fbn ? div(t.ft, t.fbn) : null), fmt: pc },
  { key: "pl", label: tk("Turret plates taken per game"), value: (t) => (t.pln ? div(t.pl, t.pln) : null), fmt: r1 },
];

/** Rank, "better than X%" and the peers' average of `me` among `peers` for one metric. */
function place<T>(
  m: Metric<T>,
  me: T,
  peers: T[],
): { v: number; rank: number; of: number; pct: number; avg: number } | null {
  const v = m.value(me);
  if (v == null || !isFinite(v)) return null;
  const vals = peers
    .map((p) => m.value(p))
    .filter((x): x is number => x != null && isFinite(x));
  if (vals.length < 3) return null;
  const better = vals.filter((x) => (m.low ? x < v : x > v)).length;
  const worse = vals.filter((x) => (m.low ? x > v : x < v)).length;
  const ties = vals.length - better - worse - 1;
  return {
    v,
    rank: better + 1,
    of: vals.length,
    pct: Math.round(
      ((worse + Math.max(ties, 0) / 2) / Math.max(vals.length - 1, 1)) * 100,
    ),
    avg: vals.reduce((t, x) => t + x, 0) / vals.length,
  };
}

interface RankRow {
  key: string;
  label: string;
  text: string;
  rank: number;
  of: number;
  pct: number;
  /** the league's average, and our value minus it ("+" better, "−" worse, whatever the metric's direction) */
  avg: string;
  diff: string;
  better: boolean | null;
  /** the last-10 line: the season's last games (oldest first), the league average, lower is better, the format */
  last?: { vals: number[]; avg: number; binary: boolean; low?: boolean; fmt: (v: number) => string };
}

/** A League ranks row from a metric's place: the value, the league average and the difference, formatted. */
function rankRow<T>(m: Metric<T>, r: NonNullable<ReturnType<typeof place<T>>>, vals?: number[]): RankRow {
  const d = r.v - r.avg;
  // the metric's own format, without a sign it may add (+63), then the difference's sign
  const abs = m.fmt(Math.abs(d)).replace(/^[+−-]/, "");
  const zero = abs === m.fmt(0).replace(/^[+−-]/, "");
  return {
    key: m.key,
    label: tl(m.label),
    text: m.fmt(r.v),
    rank: r.rank,
    of: r.of,
    pct: r.pct,
    avg: m.fmt(r.avg),
    diff: zero ? "±0" : `${d > 0 ? "+" : "−"}${abs}`,
    better: zero ? null : m.low ? d < 0 : d > 0,
    last: vals && { vals, avg: r.avg, binary: BINARY.has(m.key), low: m.low, fmt: m.fmt },
  };
}

/** The metric as shown: its per-minute version when that's switched on and it has one. */
function rated<T>(m: Metric<T>, perMin: boolean): Metric<T> {
  return perMin && m.perMin ? { ...m, label: m.perMin.label, value: m.perMin.value, fmt: m.perMin.fmt } : m;
}

/** One game's value of a metric from a player's game-log row (the last-10 line). */
const PLAYER_GAME: Record<string, (r: PlayerGameRow, perMin: boolean) => number | null> = {
  kda: (r) => (r[3] + r[5]) / Math.max(r[4], 1),
  kp: (r) => (r[17] ? (r[3] + r[5]) / r[17] : null),
  k: (r, pm) => (pm ? (r[16] ? r[3] / r[16] : null) : r[3]),
  d: (r, pm) => (pm ? (r[16] ? r[4] / r[16] : null) : r[4]),
  csm: (r) => (r[12] != null && r[16] ? r[12] / r[16] : null),
  gpm: (r) => (r[13] != null && r[16] ? r[13] / r[16] : null),
  dpm: (r) => (r[14] != null && r[16] ? r[14] / r[16] : null),
  dmgs: (r) => (r[14] != null && r[18] ? r[14] / r[18] : null),
  golds: (r) => (r[13] != null && r[19] ? r[13] / r[19] : null),
  vsm: (r) => (r[15] != null && r[16] ? r[15] / r[16] : null),
  g15: (r) => r[21]?.[3] ?? null,
  c15: (r) => r[21]?.[4] ?? null,
  x15: (r) => r[21]?.[5] ?? null,
  fbp: (r) => (r[21]?.[9] != null ? (r[21][9] === 1 || r[21][9] === 2 ? 1 : 0) : null),
  wr: (r) => r[6],
};
/** One game's value of a metric from a team's game-log row. */
const TEAM_GAME: Record<string, (r: TeamGameRow, perMin: boolean) => number | null> = {
  wr: (r) => r[7],
  gdm: (r) => (r[11] != null && r[12] != null && r[8] ? (r[11] - r[12]) / r[8] : null),
  gpm: (r) => (r[11] != null && r[8] ? r[11] / r[8] : null),
  kd: (r) => (r[9] != null && r[10] != null ? r[9] / Math.max(r[10], 1) : null),
  k: (r, pm) => (r[9] == null ? null : pm ? (r[8] ? r[9] / r[8] : null) : r[9]),
  drap: (r) => (r[13] != null && r[14] != null && r[13] + r[14] ? r[13] / (r[13] + r[14]) : null),
  barp: (r) => (r[15] != null && r[16] != null && r[15] + r[16] ? r[15] / (r[15] + r[16]) : null),
  tow: (r, pm) => (r[17] == null ? null : pm ? (r[8] ? r[17] / r[8] : null) : r[17]),
  tl: (r, pm) => (r[18] == null ? null : pm ? (r[8] ? r[18] / r[8] : null) : r[18]),
  g15: (r) => r[23]?.[1] ?? null,
  fb: (r) => r[23]?.[5] ?? null,
  ft: (r) => r[23]?.[6] ?? null,
  pl: (r) => r[23]?.[12] ?? null,
};
/** yes / no each game: the last-10 column shows them as squares */
const BINARY = new Set(["wr", "fbp", "fb", "ft"]);

/** A metric's last ten values in the season's games (oldest first); at least three, else nothing. */
function lastTen<R>(rows: R[] | null, get: ((r: R, perMin: boolean) => number | null) | undefined, perMin: boolean): number[] | undefined {
  if (!rows || !get) return undefined;
  const vals: number[] = [];
  for (let i = rows.length - 1; i >= 0 && vals.length < 10; i--) {
    const v = get(rows[i], perMin);
    if (v != null && isFinite(v)) vals.push(v);
  }
  return vals.length >= 3 ? vals.reverse() : undefined;
}

/**
 * A team's or player's games in one league season (oldest first), from the game log: the two-year file when the
 * season is recent (the page may have loaded it already), else the whole log. Nothing is loaded while `on` is false.
 */
function useSeasonGames<R extends unknown[]>(
  on: boolean,
  slug: string,
  has2y: boolean | undefined,
  load2y: (slug: string) => Promise<R[]>,
  loadAll: (slug: string) => Promise<R[]>,
  eventAt: number,
  events: { e?: string; lu?: string; date: string }[],
  lu: string,
  year: string,
): R[] | null {
  // the smaller two-year file only when the build made one (g2y): asking for a missing one was a 404 on every page
  const recent = Number(year) >= new Date().getFullYear() - 1 && !!has2y;
  const state = useLoad(
    () => (!on ? Promise.resolve(null) : recent ? load2y(slug).catch(() => loadAll(slug)) : loadAll(slug)),
    [on, slug, recent],
  );
  return useMemo(() => {
    if (!state.data) return null;
    const inSeason = new Set(events.filter((e) => e.e && e.lu === lu && (e.date || "").startsWith(year)).map((e) => e.e));
    return state.data
      .filter((r) => inSeason.has(r[eventAt] as string))
      .sort((a, b) => ((a[0] as string) < (b[0] as string) ? -1 : (a[0] as string) > (b[0] as string) ? 1 : 0));
  }, [state.data, events, lu, year, eventAt]);
}

/** The last games as a small line (squares for yes / no stats), oldest left, with the league average dashed. */
const Spark: React.FC<NonNullable<RankRow["last"]>> = ({ vals, avg, binary, low, fmt }) => {
  const title = `${tl("Last 10 games")}: ${vals.map(fmt).join(" · ")}`;
  if (binary)
    return (
      <span className="inline-flex gap-px align-middle" title={title} role="img" aria-label={title}>
        {vals.map((v, i) => (
          <span key={i} className={`w-1.5 h-3 rounded-[1px] ${v ? "bg-rw-teal" : "bg-rw-red/60"}`} />
        ))}
      </span>
    );
  const W = 64;
  const H = 18;
  const P = 2;
  const lo = Math.min(...vals, avg);
  const hi = Math.max(...vals, avg);
  const y = (v: number) => (hi === lo ? H / 2 : P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P));
  const x = (i: number) => P + (i / Math.max(vals.length - 1, 1)) * (W - 2 * P);
  const last = vals[vals.length - 1];
  const good = low ? last <= avg : last >= avg;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="inline-block align-middle" role="img" aria-label={title}>
      <title>{title}</title>
      <line x1={P} x2={W - P} y1={y(avg)} y2={y(avg)} stroke="var(--rw-line)" strokeDasharray="2 2" />
      <polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--rw-sub)" strokeWidth="1.25" />
      <circle cx={x(vals.length - 1)} cy={y(last)} r="2" fill={good ? "var(--rw-teal)" : "var(--rw-red)"} />
    </svg>
  );
};

type ColId = "pct" | "value" | "avg" | "diff" | "last";
const COLS: { id: ColId; label: () => string; width: string }[] = [
  { id: "pct", label: () => tl("Percentile"), width: "minmax(6rem,1fr)" },
  { id: "value", label: () => tl("Value · rank"), width: "auto" },
  { id: "avg", label: () => tl("League avg"), width: "4.5rem" },
  { id: "diff", label: () => tl("Diff"), width: "4.5rem" },
  { id: "last", label: () => tl("Last 10 games"), width: "4.75rem" },
];

/** League ranks settings kept on this device: hidden columns, and per minute instead of per game for count stats. */
interface RankPrefs {
  hide: ColId[];
  perMin: boolean;
}
const PREFS_KEY = "rw_ranks_prefs";
function useRankPrefs(): [RankPrefs, (p: RankPrefs) => void] {
  const [p, setP] = useState<RankPrefs>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return { hide: Array.isArray(saved.hide) ? saved.hide : [], perMin: !!saved.perMin };
    } catch {
      return { hide: [], perMin: false };
    }
  });
  const set = (n: RankPrefs) => {
    setP(n);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(n));
    } catch {
      // private window: the choice lasts until the page closes
    }
  };
  return [p, set];
}

/** The section's controls: per game / per minute for count stats, and which columns show. */
const RankControls: React.FC<{ prefs: RankPrefs; set: (p: RankPrefs) => void }> = ({ prefs, set }) => {
  const seg = (on: boolean) =>
    `px-2 py-1 pointer-coarse:min-h-9 max-sm:min-h-9 ${on ? "bg-rw-accent/15 text-rw-text" : "text-rw-sub hover:text-rw-text"}`;
  return (
    <span data-nocapture="1" className="flex items-center gap-2 text-[11px]">
      <span className="flex rounded border border-rw-border divide-x divide-rw-border overflow-hidden" role="group" aria-label={tl("Count stats")}>
        <button type="button" aria-pressed={!prefs.perMin} onClick={() => set({ ...prefs, perMin: false })} className={seg(!prefs.perMin)}>
          {tl("Per game")}
        </button>
        <button type="button" aria-pressed={prefs.perMin} onClick={() => set({ ...prefs, perMin: true })} className={seg(prefs.perMin)}>
          {tl("Per minute")}
        </button>
      </span>
      <details className="relative">
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none px-2 py-1 pointer-coarse:min-h-9 max-sm:min-h-9 flex items-center rounded border border-rw-border text-rw-sub hover:text-rw-text">
          {tl("Columns")}
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-44 bg-rw-surface border border-rw-border rounded-lg shadow-xl p-2 space-y-1">
          {COLS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-xs text-rw-text cursor-pointer min-h-7">
              <input
                type="checkbox"
                checked={!prefs.hide.includes(c.id)}
                onChange={(e) => set({ ...prefs, hide: e.target.checked ? prefs.hide.filter((h) => h !== c.id) : [...prefs.hide, c.id] })}
              />
              {c.label()}
            </label>
          ))}
        </div>
      </details>
    </span>
  );
};

const Bars: React.FC<{ rows: RankRow[]; hide: ColId[] }> = ({ rows, hide }) => {
  // Percentile dots: a hairline track per stat with a dot at its percentile (the number in it), red at the bottom of
  // the league, plain in the middle, teal at the top; then the value and rank, the league's average, the difference
  // and the last ten games. Long names ("Gold lead over the lane opponent at 15 minutes") wrap instead of being cut;
  // on phones two lines a stat: name and value, then the track with the rest beside it.
  const [sort, setSort] = useState<"" | "best" | "worst">("");
  const show = (id: ColId) => !hide.includes(id) && (id !== "last" || rows.some((r) => r.last));
  const cols = COLS.filter((c) => show(c.id));
  const template = [show("pct") ? "minmax(7rem,14rem)" : "minmax(7rem,1fr)", ...cols.map((c) => c.width)].join(" ");
  const sorted = sort ? [...rows].sort((a, b) => (sort === "best" ? b.pct - a.pct : a.pct - b.pct)) : rows;
  const grid = "sm:grid-cols-[var(--rank-cols)]";
  return (
    <ul className="space-y-1 text-xs" style={{ "--rank-cols": template } as React.CSSProperties}>
      <li className={`hidden sm:grid ${grid} gap-x-3 text-[10px] text-rw-muted items-end`}>
        <span />
        {cols.map((c) =>
          c.id === "pct" ? (
            <button
              key={c.id}
              type="button"
              data-nocapture="1"
              onClick={() => setSort(sort === "" ? "best" : sort === "best" ? "worst" : "")}
              className="text-center hover:text-rw-text"
              title={tl("Sort by percentile")}
            >
              {c.label()} {sort === "best" ? "▼" : sort === "worst" ? "▲" : ""}
            </button>
          ) : (
            <span key={c.id} className="text-right">
              {c.label()}
            </span>
          ),
        )}
      </li>
      {sorted.map((r) => (
        <li key={r.key} className={`grid grid-cols-[minmax(0,1fr)_auto] ${grid} items-center gap-x-3 min-w-0`}>
          <span className="order-1 text-rw-sub leading-tight break-words min-w-0" title={r.label}>
            {r.label}
          </span>
          {show("pct") && (
            <span className="order-3 sm:order-2 relative h-6" title={tl("Percentile {p} (100 = the best)", { p: r.pct })}>
              <span className="absolute inset-x-3 top-1/2 h-px bg-rw-line" />
              <span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full grid place-items-center text-[10px] font-semibold tabular-nums text-rw-bg"
                style={{ left: `calc(0.75rem + (100% - 1.5rem) * ${r.pct / 100})`, background: pctShade(r.pct) }}
              >
                {r.pct}
              </span>
            </span>
          )}
          {show("value") && (
            <span className="order-2 sm:order-3 tabular-nums text-rw-text whitespace-nowrap text-right">
              {r.text}{" "}
              <span className="text-rw-muted">
                · {tl("{n} of {m}", { n: r.rank, m: r.of })}
              </span>
            </span>
          )}
          <span className="order-4 flex items-center justify-end gap-2 sm:contents tabular-nums whitespace-nowrap">
            {show("avg") && (
              <span className="text-rw-sub sm:order-4 sm:text-right">
                <span className="sm:hidden text-rw-muted">{tl("avg")} </span>
                {r.avg}
              </span>
            )}
            {show("diff") && (
              <span className={`sm:order-5 sm:text-right ${r.better == null ? "text-rw-muted" : r.better ? "text-rw-teal" : "text-rw-red"}`}>{r.diff}</span>
            )}
            {show("last") && <span className="sm:order-6 sm:text-right">{r.last ? <Spark {...r.last} /> : <span className="text-rw-muted">–</span>}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** A percentile's colour: the theme's red at 0, its muted grey at 50, its teal at 100. */
const pctShade = (p: number) =>
  p >= 50
    ? `color-mix(in srgb, var(--rw-teal) ${Math.round((p - 50) * 2)}%, var(--rw-muted))`
    : `color-mix(in srgb, var(--rw-red) ${Math.round((50 - p) * 2)}%, var(--rw-muted))`;

/** The league seasons someone played: [league slug, year, games], most games last year first. */
function seasonsOf(
  events: { lu?: string; date: string; g: number }[],
): [string, string, number][] {
  const m = new Map<string, number>();
  for (const e of events) {
    const y = (e.date || "").slice(0, 4);
    if (!e.lu || !/^\d{4}$/.test(y)) continue;
    const k = `${e.lu}|${y}`;
    m.set(k, (m.get(k) || 0) + e.g);
  }
  return [...m.entries()]
    .map(([k, g]) => [...k.split("|"), g] as [string, string, number])
    .sort((a, b) => (a[1] !== b[1] ? (a[1] < b[1] ? 1 : -1) : b[2] - a[2]));
}

const SeasonPicker: React.FC<{
  seasons: [string, string, number][];
  value: string;
  onChange: (v: string) => void;
  names: Map<string, string>;
}> = ({ seasons, value, onChange, names }) => (
  <>
    <span className="rw-capture-only text-xs font-semibold text-rw-text">
      {(() => {
        const [lu, y] = value.split("|");
        return `${(names.get(lu) || lu).replace(/\s\d{4}$/, "")} ${y}`;
      })()}
    </span>
    <select
      data-nocapture="1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={tl("Season")}
      className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text w-44 sm:w-56 max-w-full"
    >
      {seasons.map(([lu, y]) => (
        <option key={`${lu}|${y}`} value={`${lu}|${y}`}>
          {/* some league names carry a year ("Asian Games 2018"): show the season's year instead */}
          {`${(names.get(lu) || lu).replace(/\s\d{4}$/, "")} ${y}`}
        </option>
      ))}
    </select>
  </>
);

const useLeagueNames = () => {
  const leagues = useLoad(loadLeagues, []);
  return useMemo(
    () => new Map((leagues.data || []).map((l: LeagueRow) => [l.u, l.l])),
    [leagues.data],
  );
};

/** The seasons a player's or team's events span that have a whole-season file (builds since 0.7.45 list them in
 *  leagues.json as `sy`; before that every season is assumed to have one), at least `min` games each. */
function useSeasons(events: { lu?: string; date: string; g: number }[], min: number): [string, string, number][] {
  const leagues = useLoad(loadLeagues, []);
  return useMemo(() => {
    const sy = new Map((leagues.data || []).map((l: LeagueRow) => [l.u, l.sy]));
    return seasonsOf(events).filter((s) => {
      if (s[2] < min) return false;
      const years = sy.get(s[0]);
      return !years || years.includes(s[1]);
    });
  }, [events, min, leagues.data]);
}

export const PlayerRanks: React.FC<{
  slug: string;
  events: { e?: string; lu?: string; date: string; g: number }[];
  has2y?: boolean;
}> = ({ slug, events, has2y }) => {
  const seasons = useSeasons(events, 5);
  const [pick, setPick] = useState(() =>
    seasons[0] ? `${seasons[0][0]}|${seasons[0][1]}` : "",
  );
  useEffect(() => {
    if (seasons.length && !seasons.some((s) => `${s[0]}|${s[1]}` === pick)) setPick(`${seasons[0][0]}|${seasons[0][1]}`);
  }, [seasons, pick]);
  const names = useLeagueNames();
  const [lu, year] = pick.split("|");
  const state = useLoad(
    () =>
      lu && year
        ? loadLeagueSeason(lu, year)
        : Promise.reject(new Error("none")),
    [lu, year],
  );
  // a season with games in the last two weeks: its ranks wait for Reveal in spoiler mode
  const newest = events.filter((e) => e.lu === lu && (e.date || "").startsWith(year)).reduce((m, e) => (e.date > m ? e.date : m), "");
  const [ranksHidden, revealRanks] = useHidden(`ranks:${slug}:${pick}`, newest && isFresh(newest) ? newest : undefined);
  const [prefs, setPrefs] = useRankPrefs();
  const games = useSeasonGames<PlayerGameRow>(!prefs.hide.includes("last") && !!lu && !!year, slug, has2y, loadPlayerGames2y, loadPlayerGames, 11, events, lu, year);
  if (!seasons.length) return null;
  const season = state.data;
  const me = season?.players.find((p) => p.u === slug);
  let body: React.ReactNode = <Loading />;
  if (state.error)
    body = (
      <p className="text-xs text-rw-muted">
        {tl("No season numbers for this league yet.")}
      </p>
    );
  else if (season && !me)
    body = (
      <p className="text-xs text-rw-muted">
        {tl("Not enough games with a full scoreboard in this season.")}
      </p>
    );
  else if (season && me) {
    const same = season.players.filter((p) => p.r === me.r);
    const maxG = Math.max(...same.map((p) => p.g));
    const minG = Math.max(5, Math.ceil(maxG * 0.3));
    const peers = same.filter((p) => p.g >= minG || p.u === slug);
    const rows = PLAYER_METRICS.map((m0) => {
      const m = rated(m0, prefs.perMin);
      const r = place(m, me, peers);
      return r && rankRow(m, r, lastTen(games, PLAYER_GAME[m0.key], prefs.perMin));
    }).filter((x): x is RankRow => !!x);
    body =
      me.g < minG ? (
        <p className="text-xs text-rw-muted">
          {tl("Not enough games in this season to rank ({n} played).", {
            n: me.g,
          })}
        </p>
      ) : (
        <>
          <Bars rows={rows} hide={prefs.hide} />
          <p className="text-[10px] text-rw-muted">
            {tl(
              "Compared with the {n} {role} players with {g}+ games in {league} {year} (all splits and playoffs).",
              {
                n: peers.length,
                role: roleName(me.r),
                g: minG,
                league: (names.get(lu) || lu).replace(/\s\d{4}$/, ""),
                year,
              },
            )}
          </p>
        </>
      );
  }
  return (
    <Section
      title={tl("League ranks")}
      right={
        <>
          <RankControls prefs={prefs} set={setPrefs} />
          <SeasonPicker
            seasons={seasons}
            value={pick}
            onChange={setPick}
            names={names}
          />
        </>
      }
      share={`${slug}-ranks-${lu}-${year}`}
    >
      {ranksHidden ? (
        <div className="py-3 text-center">
          <RevealButton onReveal={revealRanks} />
        </div>
      ) : (
        body
      )}
    </Section>
  );
};

export const TeamRanks: React.FC<{
  slug: string;
  events: { e?: string; lu?: string; date: string; g: number }[];
  has2y?: boolean;
}> = ({ slug, events, has2y }) => {
  const seasons = useSeasons(events, 5);
  const [pick, setPick] = useState(() =>
    seasons[0] ? `${seasons[0][0]}|${seasons[0][1]}` : "",
  );
  useEffect(() => {
    if (seasons.length && !seasons.some((s) => `${s[0]}|${s[1]}` === pick)) setPick(`${seasons[0][0]}|${seasons[0][1]}`);
  }, [seasons, pick]);
  const names = useLeagueNames();
  const [lu, year] = pick.split("|");
  const state = useLoad(
    () =>
      lu && year
        ? loadLeagueSeason(lu, year)
        : Promise.reject(new Error("none")),
    [lu, year],
  );
  // a season with games in the last two weeks: its ranks wait for Reveal in spoiler mode
  const newest = events.filter((e) => e.lu === lu && (e.date || "").startsWith(year)).reduce((m, e) => (e.date > m ? e.date : m), "");
  const [ranksHidden, revealRanks] = useHidden(`ranks:${slug}:${pick}`, newest && isFresh(newest) ? newest : undefined);
  const [prefs, setPrefs] = useRankPrefs();
  const games = useSeasonGames<TeamGameRow>(!prefs.hide.includes("last") && !!lu && !!year, slug, has2y, loadTeamGames2y, loadTeamGames, 2, events, lu, year);
  if (!seasons.length) return null;
  const season = state.data;
  const me = season?.teamStats.find((t) => t.u === slug);
  let body: React.ReactNode = <Loading />;
  if (state.error)
    body = (
      <p className="text-xs text-rw-muted">
        {tl("No season numbers for this league yet.")}
      </p>
    );
  else if (season && !me)
    body = (
      <p className="text-xs text-rw-muted">
        {tl("Not enough games with a full scoreboard in this season.")}
      </p>
    );
  else if (season && me) {
    const maxG = Math.max(...season.teamStats.map((t) => t.g));
    const peers = season.teamStats.filter(
      (t) => t.g >= Math.max(3, Math.ceil(maxG * 0.3)) || t.u === slug,
    );
    const rows = TEAM_METRICS.map((m0) => {
      const m = rated(m0, prefs.perMin);
      const r = place(m, me, peers);
      return r && rankRow(m, r, lastTen(games, TEAM_GAME[m0.key], prefs.perMin));
    }).filter((x): x is RankRow => !!x);
    body = (
      <>
        <Bars rows={rows} hide={prefs.hide} />
        <p className="text-[10px] text-rw-muted">
          {tl(
            "Compared with the {n} teams of {league} {year} (all splits and playoffs).",
            {
              n: peers.length,
              league: (names.get(lu) || lu).replace(/\s\d{4}$/, ""),
              year,
            },
          )}
        </p>
      </>
    );
  }
  return (
    <Section
      title={tl("League ranks")}
      right={
        <>
          <RankControls prefs={prefs} set={setPrefs} />
          <SeasonPicker
            seasons={seasons}
            value={pick}
            onChange={setPick}
            names={names}
          />
        </>
      }
      share={`${slug}-ranks-${lu}-${year}`}
    >
      {ranksHidden ? (
        <div className="py-3 text-center">
          <RevealButton onReveal={revealRanks} />
        </div>
      ) : (
        body
      )}
    </Section>
  );
};

/**
 * A team's percentile on each team stat in its latest league season (the season League ranks opens on): metric key
 * -> 0-100 (100 = the best of the league's regular teams), with the league, year and how many teams it is among.
 * Used for the percentile chips in the Compare and Match prep tables.
 */
export function useTeamPercentiles(
  slug: string,
  events: { lu?: string; date: string; g: number }[],
): { league: string; year: string; n: number; pct: Record<string, number> } | null {
  const seasons = useSeasons(events, 5);
  const pick = seasons[0] || null;
  const names = useLeagueNames();
  const state = useLoad(
    () => (pick ? loadLeagueSeason(pick[0], pick[1]) : Promise.reject(new Error("none"))),
    [pick?.[0], pick?.[1]],
  );
  return useMemo(() => {
    const season = state.data;
    if (!pick || !season) return null;
    const me = season.teamStats.find((t) => t.u === slug);
    if (!me) return null;
    const maxG = Math.max(...season.teamStats.map((t) => t.g));
    const peers = season.teamStats.filter((t) => t.g >= Math.max(3, Math.ceil(maxG * 0.3)) || t.u === slug);
    const pct: Record<string, number> = {};
    for (const m of TEAM_METRICS) {
      const r = place(m, me, peers);
      if (r) pct[m.key] = r.pct;
    }
    return { league: (names.get(pick[0]) || pick[0]).replace(/\s\d{4}$/, ""), year: pick[1], n: peers.length, pct };
  }, [state.data, pick, slug, names]);
}
