/**
 * Visual opponent performance chart & breakdown ("Against other teams"):
 * - Multi-stop colored SVG line & area graph showing how a player or team performed against each opponent
 *   (color-coded teal / accent / red by performance on the active metric: Player rating, Win %, KDA, DPM, or GD@15).
 * - Quick tournament / year period filter pills on Player Overview so viewers can inspect career vs opponents or
 *   zoom into a single split/tournament (e.g. LEC 2026 Versus, Worlds, EMEA Masters) with one click.
 * - Inline visual Win % and KDA bars (`WinBar`, `KdaBar`) for instant stat recognition across tables.
 */
import React, { useId, useMemo, useState } from "react";
import { tl, tc, eventTitle } from "../../i18n";
import { champName } from "../../champions";
import { loadPlayerGames, loadPlayerGames2y, prettySlug } from "../../hub/data";
import { playerRowLine, rateLine, type RatingFile } from "../../hub/playerRating";
import type { HubTeam, PlayerGameRow, TeamGameRow } from "../../hub/types";
import { smoothPath } from "../../useWidth";
import { SectionCard } from "./BroadcastCard";
import { RatingBadge, fmtRating, useRatingFile } from "./PlayerRating";
import { STable } from "../STable";
import { ChampIcon, EventLink, HubLink, Section, TeamLink, TeamLogo, fmtDate, fmtNum, td, th, useHiddenCheck, useLoad } from "./ui";

/** Visual win-rate progress bar + colored percentage for instant recognition in any table. */
export const WinBar: React.FC<{ w: number; g: number; showRecord?: boolean }> = ({ w, g, showRecord }) => {
  if (!g) return <span className="text-rw-muted">–</span>;
  const pctVal = Math.round((w / g) * 100);
  const l = g - w;
  const toneText = pctVal >= 60 ? "text-rw-teal font-semibold" : pctVal <= 40 ? "text-rw-red" : "text-rw-text";
  const toneBar = pctVal >= 60 ? "bg-rw-teal" : pctVal <= 40 ? "bg-rw-red" : "bg-rw-accent";
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="w-12 h-1.5 rounded-full bg-rw-bg border border-rw-border/60 overflow-hidden inline-flex shrink-0" aria-hidden="true">
        <span className={`h-full ${toneBar}`} style={{ width: `${pctVal}%` }} />
      </span>
      <span className={toneText}>{pctVal}%</span>
      {showRecord && (
        <span className="text-[11px] text-rw-muted">
          ({w}–{l})
        </span>
      )}
    </span>
  );
};

/** Visual KDA bar + colored number so standout KDAs pop at a glance. */
export const KdaBar: React.FC<{ kda: number | null | undefined; sub?: string }> = ({ kda, sub }) => {
  if (kda == null) return <span className="text-rw-muted">–</span>;
  const pctVal = Math.max(6, Math.min(100, Math.round((kda / 7) * 100)));
  const toneText = kda >= 4 ? "text-rw-teal font-semibold" : kda < 2 ? "text-rw-red" : "text-rw-text";
  const toneBar = kda >= 4 ? "bg-rw-teal" : kda < 2 ? "bg-rw-red" : "bg-rw-accent";
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="w-10 h-1.5 rounded-full bg-rw-bg border border-rw-border/60 overflow-hidden inline-flex shrink-0" aria-hidden="true">
        <span className={`h-full ${toneBar}`} style={{ width: `${pctVal}%` }} />
      </span>
      <span className={toneText}>{kda.toFixed(2)}</span>
      {sub && <span className="text-[11px] text-rw-muted">{sub}</span>}
    </span>
  );
};

export interface OppSummary {
  opp: string;
  u: string;
  g: number;
  w: number;
  k: number;
  d: number;
  a: number;
  kda: number;
  dpm: number | null;
  csm: number | null;
  gd15: number | null;
  gd15N: number;
  rating: number | null;
  ratingN: number;
  last: string;
  champs: { c: string; g: number; w: number }[];
  games: PlayerGameRow[];
}

type OppMetric = "rating" | "wr" | "kda" | "dpm" | "gd15";

function aggregatePlayerOpponents(rows: PlayerGameRow[], rf: RatingFile | null, hiddenCheck: (k: string, d: string | undefined) => boolean): OppSummary[] {
  const byOpp = new Map<
    string,
    {
      opp: string;
      g: number;
      w: number;
      k: number;
      d: number;
      a: number;
      dmg: number;
      dmgMin: number;
      cs: number;
      csMin: number;
      gd15Sum: number;
      gd15N: number;
      rSum: number;
      rN: number;
      last: string;
      champs: Map<string, { g: number; w: number }>;
      games: PlayerGameRow[];
    }
  >();

  for (const r of rows) {
    const date = r[0] || "";
    const series = r[1] || "";
    if (hiddenCheck(`match:${series}`, date)) continue;
    const opp = (r[8] || "").trim();
    if (!opp) continue;
    let cur = byOpp.get(opp);
    if (!cur) {
      cur = {
        opp,
        g: 0,
        w: 0,
        k: 0,
        d: 0,
        a: 0,
        dmg: 0,
        dmgMin: 0,
        cs: 0,
        csMin: 0,
        gd15Sum: 0,
        gd15N: 0,
        rSum: 0,
        rN: 0,
        last: date,
        champs: new Map(),
        games: [],
      };
      byOpp.set(opp, cur);
    }
    cur.g += 1;
    const won = r[6] === 1;
    if (won) cur.w += 1;
    cur.k += r[3] || 0;
    cur.d += r[4] || 0;
    cur.a += r[5] || 0;
    if (date > cur.last) cur.last = date;
    const min = r[16];
    if (min && min > 0) {
      if (r[14] != null) {
        cur.dmg += r[14];
        cur.dmgMin += min;
      }
      if (r[12] != null) {
        cur.cs += r[12];
        cur.csMin += min;
      }
    }
    const tl15 = r[21];
    if (Array.isArray(tl15) && tl15[3] != null) {
      cur.gd15Sum += tl15[3];
      cur.gd15N += 1;
    }
    if (rf) {
      const rv = rateLine(playerRowLine(r), rf);
      if (rv != null) {
        cur.rSum += rv;
        cur.rN += 1;
      }
    }
    const ch = r[2];
    if (ch) {
      const prev = cur.champs.get(ch) || { g: 0, w: 0 };
      prev.g += 1;
      if (won) prev.w += 1;
      cur.champs.set(ch, prev);
    }
    cur.games.push(r);
  }

  return [...byOpp.values()]
    .map((x) => ({
      opp: x.opp,
      u: prettySlug(x.opp),
      g: x.g,
      w: x.w,
      k: x.k,
      d: x.d,
      a: x.a,
      kda: Math.round(((x.k + x.a) / Math.max(1, x.d)) * 100) / 100,
      dpm: x.dmgMin > 0 ? Math.round(x.dmg / x.dmgMin) : null,
      csm: x.csMin > 0 ? Math.round((x.cs / x.csMin) * 10) / 10 : null,
      gd15: x.gd15N > 0 ? Math.round(x.gd15Sum / x.gd15N) : null,
      gd15N: x.gd15N,
      rating: x.rN > 0 ? Math.round((x.rSum / x.rN) * 10) / 10 : null,
      ratingN: x.rN,
      last: x.last,
      champs: [...x.champs.entries()]
        .map(([c, v]) => ({ c, g: v.g, w: v.w }))
        .sort((a, b) => b.g - a.g || b.w - a.w),
      games: x.games,
    }))
    .sort((a, b) => b.g - a.g || b.last.localeCompare(a.last));
}

function shortOppLabel(name: string): string {
  const clean = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (clean.length <= 10) return clean;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((w) => w.length >= 2)) {
    const acr = words.map((w) => w[0].toUpperCase()).join("");
    if (acr.length >= 2 && acr.length <= 5) return acr;
  }
  return clean.slice(0, 9) + "…";
}

function metricTone(metric: OppMetric, val: number, baseline: number): "good" | "mid" | "bad" {
  if (metric === "wr") return val >= 60 ? "good" : val <= 40 ? "bad" : "mid";
  if (metric === "rating") return val >= 6.4 ? "good" : val < 5.6 ? "bad" : "mid";
  if (metric === "gd15") return val >= 150 ? "good" : val <= -150 ? "bad" : "mid";
  if (metric === "kda") return val >= Math.max(3.2, baseline * 1.12) ? "good" : val <= Math.min(2.0, baseline * 0.85) ? "bad" : "mid";
  return val >= baseline * 1.08 ? "good" : val <= baseline * 0.92 ? "bad" : "mid";
}

function toneColor(t: "good" | "mid" | "bad"): string {
  return t === "good" ? "var(--rw-teal)" : t === "bad" ? "var(--rw-red)" : "var(--rw-accent)";
}

/** Colored SVG performance line graph across opponents. */
const ColoredOpponentGraph: React.FC<{
  items: {
    opp: string;
    u: string;
    g: number;
    w: number;
    val: number;
    fmt: string;
    tone: "good" | "mid" | "bad";
    sub: string;
    champs?: { c: string; g: number; w: number }[];
  }[];
  baseline: number;
  baselineLabel: string;
  selectedOpp: string | null;
  onSelectOpp: (opp: string | null) => void;
}> = ({ items, baseline, baselineLabel, selectedOpp, onSelectOpp }) => {
  const gradId = useId().replace(/[^a-z0-9]/gi, "");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (items.length < 2) return null;

  const vals = items.map((d) => d.val);
  const loRaw = Math.min(...vals, baseline);
  const hiRaw = Math.max(...vals, baseline);
  const padVal = Math.max((hiRaw - loRaw) * 0.18, 0.5);
  const lo = loRaw - padVal;
  const hi = hiRaw + padVal;
  const span = Math.max(hi - lo, 1e-6);

  const W = 760;
  const H = 186;
  const padX = 38;
  const padTop = 26;
  const padBot = 36;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBot;

  const xOf = (i: number) => padX + (items.length === 1 ? plotW / 2 : (i / (items.length - 1)) * plotW);
  const yOf = (v: number) => padTop + (1 - (v - lo) / span) * plotH;

  const pts: [number, number][] = items.map((d, i) => [xOf(i), yOf(d.val)]);
  const linePath = smoothPath(pts);
  const baseY = yOf(baseline);
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${(H - padBot).toFixed(1)} L${pts[0][0].toFixed(1)},${(H - padBot).toFixed(1)} Z`;

  const activeIdx = hoverIdx ?? (selectedOpp ? items.findIndex((x) => x.opp === selectedOpp) : -1);
  const active = activeIdx >= 0 ? items[activeIdx] : null;

  return (
    <div className="bg-rw-bg/70 border border-rw-border rounded-lg p-2.5 space-y-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[480px] h-auto select-none block"
          role="img"
          aria-label={tl("Against other teams")}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={`${gradId}-stroke`} x1="0%" y1="0%" x2="100%" y2="0%">
              {items.map((d, i) => (
                <stop
                  key={d.opp}
                  offset={`${items.length > 1 ? ((i / (items.length - 1)) * 100).toFixed(1) : 50}%`}
                  style={{ stopColor: toneColor(d.tone) }}
                />
              ))}
            </linearGradient>
            <linearGradient id={`${gradId}-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: "var(--rw-accent)", stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: "var(--rw-accent)", stopOpacity: 0.0 }} />
            </linearGradient>
          </defs>

          {/* Subtle horizontal guide lines */}
          {[0.2, 0.5, 0.8].map((f) => {
            const gy = padTop + f * plotH;
            return <line key={f} x1={padX} x2={W - padX} y1={gy} y2={gy} stroke="var(--rw-border)" strokeWidth="1" strokeDasharray="2 4" opacity="0.55" />;
          })}

          {/* Baseline reference */}
          <line
            x1={padX - 8}
            x2={W - padX + 8}
            y1={baseY}
            y2={baseY}
            stroke="var(--rw-muted)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <text x={W - padX + 6} y={Math.max(12, Math.min(H - padBot - 4, baseY - 4))} textAnchor="end" fontSize="9.5" fill="var(--rw-muted)">
            {baselineLabel}
          </text>

          {/* Area under curve */}
          <path d={areaPath} fill={`url(#${gradId}-fill)`} />

          {/* Multi-colored performance curve */}
          <path
            d={linePath}
            fill="none"
            stroke={`url(#${gradId}-stroke)`}
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Opponent nodes & labels */}
          {items.map((d, i) => {
            const cx = pts[i][0];
            const cy = pts[i][1];
            const col = toneColor(d.tone);
            const isSel = activeIdx === i;
            return (
              <g
                key={d.opp}
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(i)}
                onClick={() => onSelectOpp(selectedOpp === d.opp ? null : d.opp)}
              >
                {/* Hover/click hit column */}
                <rect
                  x={cx - plotW / Math.max(items.length * 2, 4)}
                  y={0}
                  width={plotW / Math.max(items.length, 2)}
                  height={H}
                  fill="transparent"
                />
                {isSel && (
                  <line x1={cx} x2={cx} y1={padTop - 6} y2={H - padBot + 4} stroke={col} strokeWidth="1" strokeDasharray="2 2" opacity="0.75" />
                )}
                {isSel && <circle cx={cx} cy={cy} r="8" fill={col} opacity="0.22" />}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSel ? 5 : 4}
                  fill={col}
                  stroke="var(--rw-bg)"
                  strokeWidth="1.75"
                />
                {/* Value label above node */}
                <text
                  x={cx}
                  y={Math.max(13, cy - 9)}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={col}
                  className="tabular-nums"
                >
                  {d.fmt}
                </text>
                {/* Opponent short name & W-L along X-axis */}
                <text
                  x={cx}
                  y={H - 17}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight={isSel ? "700" : "600"}
                  fill={isSel ? "var(--rw-text)" : "var(--rw-sub)"}
                >
                  {shortOppLabel(d.opp)}
                </text>
                <text
                  x={cx}
                  y={H - 5}
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="var(--rw-muted)"
                  className="tabular-nums"
                >
                  {d.w}–{d.g - d.w}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Team logo strip + active opponent callout */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rw-border/60 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          {items.map((d, i) => {
            const isSel = selectedOpp === d.opp || hoverIdx === i;
            const dotCol = d.tone === "good" ? "bg-rw-teal" : d.tone === "bad" ? "bg-rw-red" : "bg-rw-accent";
            return (
              <button
                key={d.opp}
                type="button"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => onSelectOpp(selectedOpp === d.opp ? null : d.opp)}
                title={`${d.opp}: ${d.fmt} (${d.w}–${d.g - d.w})`}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] transition-colors ${
                  isSel
                    ? "border-rw-accent bg-rw-accent/15 text-rw-text font-semibold"
                    : "border-rw-border/70 bg-rw-surface/60 text-rw-sub hover:border-rw-accent/50 hover:text-rw-text"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCol}`} />
                <TeamLogo name={d.opp} size={14} />
                <span className="truncate max-w-[6.5rem]">{shortOppLabel(d.opp)}</span>
              </button>
            );
          })}
        </div>
        {active && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-rw-sub ml-auto">
            <span className="inline-flex items-center gap-1 font-semibold text-rw-text">
              <TeamLogo name={active.opp} size={16} />
              <TeamLink name={active.opp} u={active.u} />
            </span>
            <span className="tabular-nums font-bold" style={{ color: toneColor(active.tone) }}>
              {active.fmt}
            </span>
            <span className="text-rw-muted tabular-nums">{active.sub}</span>
            {active.champs && active.champs.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                {active.champs.slice(0, 3).map((c) => (
                  <HubLink
                    key={c.c}
                    to={{ kind: "champ", slug: prettySlug(c.c) }}
                    title={`${champName(c.c)} (${c.w}–${c.g - c.w})`}
                  >
                    <ChampIcon name={c.c} size={15} />
                  </HubLink>
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Player performance vs each opponent team (`PlayerPage` Overview & `PlayerPeriodStats`).
 * When `rows` is passed (from `PlayerPeriodStats`), uses those filtered games directly;
 * otherwise loads the player's game log and offers quick tournament/year filter pills.
 */
export const PlayerOpponents: React.FC<{
  slug: string;
  name: string;
  has2y?: boolean;
  rows?: PlayerGameRow[];
  cardSub?: string;
}> = ({ slug, name, has2y, rows: givenRows, cardSub }) => {
  const [fullLog, setFullLog] = useState(false);
  const loaded = useLoad(
    () =>
      givenRows
        ? Promise.resolve(givenRows)
        : !fullLog && has2y
          ? loadPlayerGames2y(slug).catch(() => loadPlayerGames(slug))
          : loadPlayerGames(slug),
    [slug, has2y, fullLog, givenRows],
  );
  const rf = useRatingFile();
  const hiddenCheck = useHiddenCheck();

  const rawRows = givenRows || loaded.data || [];

  // Quick tournament / year filter pills when rendered standalone on PlayerPage Overview
  const [scope, setScope] = useState<string>("all");
  const scopePills = useMemo(() => {
    if (givenRows || !rawRows.length) return [];
    const years = new Map<string, number>();
    const events = new Map<string, { slug: string; name: string; g: number; last: string }>();
    for (const r of rawRows) {
      const y = (r[0] || "").slice(0, 4);
      if (y) years.set(y, (years.get(y) || 0) + 1);
      const es = r[11] || "";
      const en = r[9] || "";
      if (es && en) {
        const cur = events.get(es) || { slug: es, name: en, g: 0, last: r[0] || "" };
        cur.g += 1;
        if ((r[0] || "") > cur.last) cur.last = r[0] || "";
        events.set(es, cur);
      }
    }
    const yrList = [...years.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 2)
      .map(([y]) => ({ key: `y:${y}`, label: y }));
    const evList = [...events.values()]
      .filter((e) => e.g >= 4)
      .sort((a, b) => b.last.localeCompare(a.last))
      .slice(0, 4)
      .map((e) => ({ key: `e:${e.slug}`, label: eventTitle(e.name) }));
    return [...yrList, ...evList];
  }, [givenRows, rawRows]);

  const scopedRows = useMemo(() => {
    if (givenRows || scope === "all") return rawRows;
    if (scope.startsWith("y:")) {
      const y = scope.slice(2);
      return rawRows.filter((r) => (r[0] || "").startsWith(y));
    }
    if (scope.startsWith("e:")) {
      const es = scope.slice(2);
      return rawRows.filter((r) => r[11] === es);
    }
    return rawRows;
  }, [givenRows, rawRows, scope]);

  const opps = useMemo(() => aggregatePlayerOpponents(scopedRows, rf, hiddenCheck), [scopedRows, rf, hiddenCheck]);

  const hasRating = useMemo(() => opps.some((o) => o.rating != null), [opps]);
  const hasGd15 = useMemo(() => opps.some((o) => o.gd15 != null), [opps]);
  const hasDpm = useMemo(() => opps.some((o) => o.dpm != null), [opps]);

  const [metric, setMetric] = useState<OppMetric>("kda");
  const activeMetric: OppMetric =
    metric === "rating" && !hasRating
      ? "kda"
      : metric === "gd15" && !hasGd15
        ? "kda"
        : metric === "dpm" && !hasDpm
          ? "kda"
          : metric;

  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);

  const chartOpps = useMemo(() => {
    const withVal = opps.filter((o) => {
      if (activeMetric === "rating") return o.rating != null;
      if (activeMetric === "gd15") return o.gd15 != null;
      if (activeMetric === "dpm") return o.dpm != null;
      return true;
    });
    // In single-event mode, order chronologically (oldest to newest match in that event); otherwise top opponents by games played
    const top = scope.startsWith("e:")
      ? [...withVal].sort((a, b) => a.last.localeCompare(b.last)).slice(-14)
      : withVal.slice(0, 12);
    return top;
  }, [opps, activeMetric, scope]);

  const chartData = useMemo(() => {
    if (!chartOpps.length) return { items: [], baseline: 0, baselineLabel: "" };
    const totalG = opps.reduce((s, o) => s + o.g, 0) || 1;
    const totalW = opps.reduce((s, o) => s + o.w, 0);
    const totalK = opps.reduce((s, o) => s + o.k, 0);
    const totalD = opps.reduce((s, o) => s + o.d, 0);
    const totalA = opps.reduce((s, o) => s + o.a, 0);
    const avgKda = Math.round(((totalK + totalA) / Math.max(1, totalD)) * 100) / 100;
    const dpmOpps = opps.filter((o) => o.dpm != null);
    const avgDpm = dpmOpps.length ? Math.round(dpmOpps.reduce((s, o) => s + (o.dpm || 0) * o.g, 0) / Math.max(1, dpmOpps.reduce((s, o) => s + o.g, 0))) : 500;

    const baseline =
      activeMetric === "rating"
        ? 6.0
        : activeMetric === "wr"
          ? Math.round((totalW / totalG) * 100)
          : activeMetric === "gd15"
            ? 0
            : activeMetric === "dpm"
              ? avgDpm
              : avgKda;

    const baselineLabel =
      activeMetric === "rating"
        ? "6.0"
        : activeMetric === "wr"
          ? `${baseline}%`
          : activeMetric === "gd15"
            ? "0"
            : activeMetric === "dpm"
              ? `${fmtNum(baseline)} DPM`
              : `${baseline.toFixed(2)} KDA`;

    const items = chartOpps.map((o) => {
      const wr = Math.round((o.w / o.g) * 100);
      const val =
        activeMetric === "rating"
          ? o.rating ?? 6
          : activeMetric === "wr"
            ? wr
            : activeMetric === "gd15"
              ? o.gd15 ?? 0
              : activeMetric === "dpm"
                ? o.dpm ?? 0
                : o.kda;
      const fmt =
        activeMetric === "rating"
          ? fmtRating(val)
          : activeMetric === "wr"
            ? `${wr}%`
            : activeMetric === "gd15"
              ? `${val > 0 ? "+" : ""}${fmtNum(val)}`
              : activeMetric === "dpm"
                ? fmtNum(val)
                : val.toFixed(2);
      return {
        opp: o.opp,
        u: o.u,
        g: o.g,
        w: o.w,
        val,
        fmt,
        tone: metricTone(activeMetric, val, baseline),
        sub: `${o.w}–${o.g - o.w} (${wr}%) · KDA ${o.kda.toFixed(2)}${o.dpm != null ? ` · ${fmtNum(o.dpm)} DPM` : ""}`,
        champs: o.champs,
      };
    });
    return { items, baseline, baselineLabel };
  }, [chartOpps, opps, activeMetric]);

  const filteredOpps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? opps.filter((o) => o.opp.toLowerCase().includes(q)) : opps;
  }, [opps, search]);

  if (!opps.length) return null;

  const maxOppG = Math.max(1, ...opps.map((o) => o.g));
  const shownOpps = showAll || search.trim() ? filteredOpps : filteredOpps.slice(0, 10);
  const expanded = selectedOpp ? opps.find((o) => o.opp === selectedOpp) || null : null;

  const metricButtons: { key: OppMetric; label: string; show: boolean }[] = [
    { key: "kda", label: tl("KDA"), show: true },
    { key: "wr", label: tl("Win %"), show: true },
    { key: "rating", label: tl("Player rating"), show: hasRating },
    { key: "dpm", label: tl("DPM"), show: hasDpm },
    { key: "gd15", label: "GD@15", show: hasGd15 },
  ];

  return (
    <Section
      title={tl("Against other teams")}
      share={`${slug}-opponents`}
      right={
        <span className="flex items-center gap-2">
          {!givenRows && has2y && !fullLog && (
            <button
              type="button"
              onClick={() => setFullLog(true)}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("All time")}
            </button>
          )}
          {filteredOpps.length > 10 && !search.trim() && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {showAll ? tl("Show fewer") : tl("Show all {n}", { n: filteredOpps.length })}
            </button>
          )}
          <SectionCard
            section={tl("Against other teams")}
            name={name}
            sub={cardSub}
            rows={() =>
              opps.slice(0, 10).map((o) => ({
                team: o.opp,
                label: o.opp,
                sub: `${o.w}–${o.g - o.w} (${Math.round((o.w / o.g) * 100)}%)${o.dpm != null ? ` · ${fmtNum(o.dpm)} DPM` : ""}`,
                value: `KDA ${o.kda.toFixed(2)}`,
              }))
            }
          />
        </span>
      }
    >
      {/* Period / tournament pills + metric selector pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {scopePills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1" data-nocapture="1">
            <button
              type="button"
              onClick={() => {
                setScope("all");
                setSelectedOpp(null);
              }}
              className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-colors ${
                scope === "all"
                  ? "bg-rw-accent border-rw-accent text-rw-bg"
                  : "bg-rw-bg border-rw-border text-rw-sub hover:border-rw-accent/50 hover:text-rw-text"
              }`}
            >
              {tl("All")}
            </button>
            {scopePills.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setScope(p.key);
                  setSelectedOpp(null);
                }}
                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-colors truncate max-w-[11rem] ${
                  scope === p.key
                    ? "bg-rw-accent border-rw-accent text-rw-bg"
                    : "bg-rw-bg border-rw-border text-rw-sub hover:border-rw-accent/50 hover:text-rw-text"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-1 ml-auto" data-nocapture="1">
          {metricButtons
            .filter((m) => m.show)
            .map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-colors ${
                  activeMetric === m.key
                    ? "border-rw-accent bg-rw-accent/20 text-rw-accent"
                    : "border-rw-border bg-rw-bg text-rw-muted hover:text-rw-text"
                }`}
              >
                {m.label}
              </button>
            ))}
        </div>
      </div>

      {/* Colored SVG line graph */}
      {chartData.items.length >= 2 && (
        <ColoredOpponentGraph
          items={chartData.items}
          baseline={chartData.baseline}
          baselineLabel={chartData.baselineLabel}
          selectedOpp={selectedOpp}
          onSelectOpp={setSelectedOpp}
        />
      )}

      {/* Expanded single-opponent game list when an opponent is clicked */}
      {expanded && (
        <div className="bg-rw-bg border border-rw-accent/40 rounded-lg p-2.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-rw-text">
              <TeamLogo name={expanded.opp} size={18} />
              <TeamLink name={expanded.opp} u={expanded.u} />
              <span className="text-rw-muted font-normal tabular-nums">
                · {expanded.w}–{expanded.g - expanded.w} ({Math.round((expanded.w / expanded.g) * 100)}%) · KDA {expanded.kda.toFixed(2)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <HubLink
                to={{ kind: "finder", query: `player=${encodeURIComponent(slug)}&team=${encodeURIComponent(expanded.u || expanded.opp)}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")}
              </HubLink>
              <button
                type="button"
                onClick={() => setSelectedOpp(null)}
                className="text-[11px] text-rw-muted hover:text-rw-accent"
              >
                {tl("Close")}
              </button>
            </span>
          </div>
          <ul className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {expanded.games.map((g, idx) => {
              const won = g[6] === 1;
              const rv = rf ? rateLine(playerRowLine(g), rf) : null;
              return (
                <li key={`${g[1]}-${g[22] || idx}`} className="flex items-center justify-between gap-2 py-0.5 border-t border-rw-border/50">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-3.5 shrink-0 font-bold ${won ? "text-rw-teal" : "text-rw-red"}`}>
                      {won ? tc("short result", "W") : tc("short result", "L")}
                    </span>
                    <HubLink to={{ kind: "champ", slug: prettySlug(g[2]) }} title={champName(g[2])} className="shrink-0">
                      <ChampIcon name={g[2]} size={17} />
                    </HubLink>
                    {g[1] ? (
                      <HubLink
                        to={{ kind: "match", slug: g[1], game: g[22] || undefined }}
                        className="tabular-nums text-rw-text hover:text-rw-accent hover:underline font-medium"
                      >
                        {g[3]}/{g[4]}/{g[5]}
                      </HubLink>
                    ) : (
                      <span className="tabular-nums text-rw-text font-medium">
                        {g[3]}/{g[4]}/{g[5]}
                      </span>
                    )}
                    <EventLink name={g[9]} u={g[11]} className="text-rw-muted hover:text-rw-accent hover:underline truncate" />
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-rw-muted tabular-nums">
                    {rv != null && <RatingBadge v={rv} />}
                    <span>{fmtDate(g[0], true)}</span>
                    {g[1] && (
                      <HubLink to={{ kind: "match", slug: g[1], game: g[22] || undefined }} className="text-rw-accent hover:underline">
                        {tl("Details")}
                      </HubLink>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Search filter when many opponents */}
      {opps.length > 8 && (
        <div className="flex items-center gap-2" data-nocapture="1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tl("Filter by team")}
            aria-label={tl("Filter by team")}
            className="w-full sm:w-64 bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1 text-xs text-rw-text placeholder:text-rw-muted focus:border-rw-accent outline-none"
          />
        </div>
      )}

      {/* Opponent breakdown table with visual Win % and KDA bars */}
      <div className="overflow-x-auto">
        <STable className="w-full text-xs">
          <thead>
            <tr>
              <th className={th}>{tl("Opponent")}</th>
              <th className={th}>{tl("Games")}</th>
              <th className={th}>{tl("Win %")}</th>
              {hasRating && <th className={th}>{tl("Player rating")}</th>}
              <th className={th}>{tl("KDA")}</th>
              {hasDpm && <th className={th}>{tl("DPM")}</th>}
              {hasGd15 && <th className={th}>GD@15</th>}
              <th className={th}>{tl("Champions")}</th>
            </tr>
          </thead>
          <tbody>
            {shownOpps.map((o) => {
              const isSel = selectedOpp === o.opp;
              return (
                <tr
                  key={o.opp}
                  onClick={() => setSelectedOpp(isSel ? null : o.opp)}
                  className={`border-t border-rw-border cursor-pointer transition-colors ${
                    isSel ? "bg-rw-accent/10" : "hover:bg-rw-raised/40"
                  }`}
                >
                  <td className={`${td} max-w-[12rem] truncate`} data-sort={o.opp}>
                    <span className="inline-flex items-center gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <TeamLogo name={o.opp} size={18} />
                      <TeamLink name={o.opp} u={o.u} className="text-rw-text hover:text-rw-accent hover:underline truncate" />
                    </span>
                  </td>
                  <td className={`${td} text-rw-sub tabular-nums`} data-sort={o.g}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="hidden sm:inline-block w-7 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-rw-accent/80"
                          style={{ width: `${Math.max(6, Math.round((o.g / maxOppG) * 100))}%` }}
                        />
                      </span>
                      <span>
                        <HubLink
                          to={{ kind: "finder", query: `player=${encodeURIComponent(slug)}&vsteam=${encodeURIComponent(o.u || prettySlug(o.opp))}` }}
                          onNavigate={() => {}}
                          className="font-semibold text-rw-text hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>{o.g}</span>
                        </HubLink>{" "}
                        <span className="text-[11px] text-rw-muted">
                          ({o.w}–{o.g - o.w})
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className={td} data-sort={o.g ? o.w / o.g : -1}>
                    <WinBar w={o.w} g={o.g} />
                  </td>
                  {hasRating && (
                    <td className={td} data-sort={o.rating ?? -1}>{o.rating != null ? <RatingBadge v={o.rating} /> : <span className="text-rw-muted">–</span>}</td>
                  )}
                  <td className={td} data-sort={o.kda}>
                    <KdaBar
                      kda={o.kda}
                      sub={`${(o.k / o.g).toFixed(1)}/${(o.d / o.g).toFixed(1)}/${(o.a / o.g).toFixed(1)}`}
                    />
                  </td>
                  {hasDpm && (
                    <td className={`${td} text-rw-sub tabular-nums`} data-sort={o.dpm ?? -1}>{o.dpm != null ? fmtNum(o.dpm) : "–"}</td>
                  )}
                  {hasGd15 && (
                    <td className={`${td} tabular-nums`} data-sort={o.gd15 ?? -99999}>
                      {o.gd15 != null ? (
                        <span className={o.gd15 >= 0 ? "text-rw-teal font-semibold" : "text-rw-red"}>
                          {o.gd15 > 0 ? `+${fmtNum(o.gd15)}` : fmtNum(o.gd15)}
                        </span>
                      ) : (
                        <span className="text-rw-muted">–</span>
                      )}
                    </td>
                  )}
                  <td className={td} data-sort={o.champs.length} onClick={(e) => e.stopPropagation()}>
                    <span className="inline-flex items-center gap-0.5">
                      {o.champs.slice(0, 4).map((c) => (
                        <HubLink
                          key={c.c}
                          to={{ kind: "player", slug, tab: "champions", query: `champ=${encodeURIComponent(c.c)}` }}
                          title={`${champName(c.c)}: ${c.w}–${c.g - c.w}`}
                        >
                          <ChampIcon name={c.c} size={17} />
                        </HubLink>
                      ))}
                      {o.champs.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setSelectedOpp(isSel ? null : o.opp)}
                          className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline ml-0.5"
                        >
                          +{o.champs.length - 4}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </STable>
      </div>
    </Section>
  );
};

/**
 * Team performance vs opponents chart (`TeamPage` Overview & Matches tab).
 * Uses `t.opps` (`HubTeam["opps"]`) and renders the colored Win % line graph across top rivals + visual Win % bars.
 */
export const TeamOpponentsChart: React.FC<{
  teamSlug: string;
  teamName: string;
  opps: HubTeam["opps"];
  cardSub?: string;
  compact?: boolean;
}> = ({ teamSlug, teamName, opps, cardSub, compact }) => {
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const chartOpps = useMemo(() => {
    const multi = opps.filter((o) => o.g >= 2);
    return (multi.length >= 3 ? multi : opps).slice(0, 12);
  }, [opps]);

  const totalG = useMemo(() => opps.reduce((s, o) => s + o.g, 0) || 1, [opps]);
  const totalW = useMemo(() => opps.reduce((s, o) => s + o.w, 0), [opps]);
  const avgWr = Math.round((totalW / totalG) * 100);

  const chartItems = useMemo(
    () =>
      chartOpps.map((o) => {
        const wr = Math.round((o.w / Math.max(1, o.g)) * 100);
        return {
          opp: o.n,
          u: o.u || prettySlug(o.n),
          g: o.g,
          w: o.w,
          val: wr,
          fmt: `${wr}%`,
          tone: metricTone("wr", wr, avgWr),
          sub: `${o.w}–${o.g - o.w} (${wr}%) · ${fmtDate(o.last)}`,
        };
      }),
    [chartOpps, avgWr],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? opps.filter((o) => o.n.toLowerCase().includes(q)) : opps;
  }, [opps, search]);

  if (!opps.length) return null;

  const maxTeamOppG = Math.max(1, ...opps.map((o) => o.g));
  const limit = compact ? 8 : 15;
  const shown = showAll || search.trim() ? filtered : filtered.slice(0, limit);

  return (
    <Section
      title={tl("Against other teams")}
      share={`${teamSlug}-opponents`}
      right={
        <span className="flex items-center gap-2">
          {filtered.length > limit && !search.trim() && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {showAll ? tl("Show fewer") : tl("Show all {n}", { n: filtered.length })}
            </button>
          )}
          <SectionCard
            section={tl("Against other teams")}
            name={teamName}
            sub={cardSub}
            rows={() =>
              opps.slice(0, 10).map((o) => ({
                team: o.n,
                label: o.n,
                sub: `${o.w}–${o.g - o.w} · ${fmtDate(o.last)}`,
                value: `${Math.round((o.w / Math.max(1, o.g)) * 100)}%`,
              }))
            }
          />
        </span>
      }
    >
      {chartItems.length >= 2 && (
        <ColoredOpponentGraph
          items={chartItems}
          baseline={avgWr}
          baselineLabel={`${avgWr}%`}
          selectedOpp={selectedOpp}
          onSelectOpp={setSelectedOpp}
        />
      )}

      {!compact && opps.length > 10 && (
        <div className="flex items-center gap-2" data-nocapture="1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tl("Filter by team")}
            aria-label={tl("Filter by team")}
            className="w-full sm:w-64 bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1 text-xs text-rw-text placeholder:text-rw-muted focus:border-rw-accent outline-none"
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <STable className="w-full text-xs">
          <thead>
            <tr>
              <th className={th}>{tl("Opponent")}</th>
              <th className={th}>{tl("Games")}</th>
              <th className={th}>{tl("Win %")}</th>
              <th className={th}>{tl("Last met")}</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const isSelected = selectedOpp === o.n;
              return (
                <tr
                  key={o.n}
                  onClick={() => setSelectedOpp(isSelected ? null : o.n)}
                  className={`border-t border-rw-border cursor-pointer transition-colors ${
                    isSelected ? "bg-rw-accent/15 ring-1 ring-inset ring-rw-accent/50" : "hover:bg-rw-raised/40"
                  }`}
                >
                  <td className={`${td} max-w-[13rem] truncate`} data-sort={o.n}>
                    <span className="inline-flex items-center gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <TeamLogo name={o.n} size={18} />
                      <TeamLink name={o.n} u={o.u} />
                    </span>
                  </td>
                  <td className={`${td} text-rw-sub tabular-nums`} data-sort={o.g}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="hidden sm:inline-block w-7 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-rw-accent/80"
                          style={{ width: `${Math.max(6, Math.round((o.g / maxTeamOppG) * 100))}%` }}
                        />
                      </span>
                      <span>
                        <HubLink
                          to={{ kind: "finder", query: `team=${encodeURIComponent(teamSlug)}&vsteam=${encodeURIComponent(o.u || prettySlug(o.n))}` }}
                          className="font-semibold text-rw-text hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>{o.g}</span>
                        </HubLink>{" "}
                        <span className="text-[11px] text-rw-muted">
                          ({o.w}–{o.g - o.w})
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className={td} data-sort={o.g ? o.w / o.g : -1}>
                    <WinBar w={o.w} g={o.g} />
                  </td>
                  <td className={`${td} text-rw-muted tabular-nums`} data-sort={o.last || ""}>{fmtDate(o.last)}</td>
                  <td className={`${td} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                    {o.u && (
                      <span className="inline-flex items-center gap-2">
                        <HubLink to={{ kind: "prep", a: teamSlug, b: o.u }} className="text-rw-accent hover:underline">
                          {tl("Match prep")}
                        </HubLink>
                        <HubLink to={{ kind: "compare", mode: "team", a: teamSlug, b: o.u }} className="text-rw-muted hover:text-rw-accent hover:underline">
                          {tl("Compare")}
                        </HubLink>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </STable>
      </div>
    </Section>
  );
};

/**
 * Period-filtered opponent performance chart for `TeamPeriodStats` (`Stats` tab on `TeamPage`).
 */
export const TeamPeriodOpponents: React.FC<{
  teamSlug: string;
  teamName: string;
  rows: TeamGameRow[];
  cardSub?: string;
}> = ({ teamSlug, teamName, rows, cardSub }) => {
  const hiddenCheck = useHiddenCheck();
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const [metric, setMetric] = useState<"wr" | "gd15">("wr");
  const [showAll, setShowAll] = useState(false);

  const opps = useMemo(() => {
    const byOpp = new Map<string, { opp: string; u: string | null; g: number; w: number; k: number; d: number; gd15Sum: number; gd15N: number; last: string }>();
    for (const r of rows) {
      const date = r[0] || "";
      const series = r[1] || "";
      if (hiddenCheck(`match:${series}`, date)) continue;
      const opp = (r[4] || "").trim();
      if (!opp) continue;
      let cur = byOpp.get(opp);
      if (!cur) {
        cur = { opp, u: r[5] || null, g: 0, w: 0, k: 0, d: 0, gd15Sum: 0, gd15N: 0, last: date };
        byOpp.set(opp, cur);
      }
      cur.g += 1;
      if (r[7] === 1) cur.w += 1;
      cur.k += r[9] || 0;
      cur.d += r[10] || 0;
      if (date > cur.last) cur.last = date;
      const tl15 = r[23];
      if (Array.isArray(tl15) && tl15[1] != null) {
        cur.gd15Sum += tl15[1];
        cur.gd15N += 1;
      }
    }
    return [...byOpp.values()]
      .map((x) => ({
        opp: x.opp,
        u: x.u || prettySlug(x.opp),
        g: x.g,
        w: x.w,
        k: x.k,
        d: x.d,
        gd15: x.gd15N > 0 ? Math.round(x.gd15Sum / x.gd15N) : null,
        last: x.last,
      }))
      .sort((a, b) => b.g - a.g || b.last.localeCompare(a.last));
  }, [rows, hiddenCheck]);

  const hasGd15 = useMemo(() => opps.some((o) => o.gd15 != null), [opps]);
  const activeMetric = metric === "gd15" && !hasGd15 ? "wr" : metric;

  if (!opps.length) return null;

  const totalG = opps.reduce((s, o) => s + o.g, 0) || 1;
  const totalW = opps.reduce((s, o) => s + o.w, 0);
  const avgWr = Math.round((totalW / totalG) * 100);
  const chartOpps = opps.filter((o) => (activeMetric === "gd15" ? o.gd15 != null : true)).slice(0, 12);

  const chartItems = chartOpps.map((o) => {
    const wr = Math.round((o.w / o.g) * 100);
    const val = activeMetric === "gd15" ? (o.gd15 ?? 0) : wr;
    const fmt = activeMetric === "gd15" ? `${val > 0 ? "+" : ""}${fmtNum(val)}` : `${wr}%`;
    return {
      opp: o.opp,
      u: o.u,
      g: o.g,
      w: o.w,
      val,
      fmt,
      tone: metricTone(activeMetric, val, activeMetric === "gd15" ? 0 : avgWr),
      sub: `${o.w}–${o.g - o.w} (${wr}%)${o.gd15 != null ? ` · GD@15 ${o.gd15 > 0 ? "+" : ""}${fmtNum(o.gd15)}` : ""}`,
    };
  });

  const maxPeriodOppG = Math.max(1, ...opps.map((o) => o.g));
  const shown = showAll ? opps : opps.slice(0, 10);

  return (
    <Section
      title={tl("Against other teams")}
      right={
        <span className="flex items-center gap-2">
          {hasGd15 && (
            <span className="inline-flex items-center gap-1" data-nocapture="1">
              {(["wr", "gd15"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                    activeMetric === m ? "border-rw-accent bg-rw-accent/20 text-rw-accent" : "border-rw-border bg-rw-bg text-rw-muted hover:text-rw-text"
                  }`}
                >
                  {m === "wr" ? tl("Win %") : "GD@15"}
                </button>
              ))}
            </span>
          )}
          {opps.length > 10 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-rw-accent hover:underline">
              {showAll ? tl("Show fewer") : tl("Show all {n}", { n: opps.length })}
            </button>
          )}
          <SectionCard
            section={tl("Against other teams")}
            name={teamName}
            sub={cardSub}
            rows={() =>
              opps.slice(0, 10).map((o) => ({
                team: o.opp,
                label: o.opp,
                sub: `${o.w}–${o.g - o.w}${o.gd15 != null ? ` · GD@15 ${o.gd15 > 0 ? "+" : ""}${fmtNum(o.gd15)}` : ""}`,
                value: `${Math.round((o.w / o.g) * 100)}%`,
              }))
            }
          />
        </span>
      }
    >
      {chartItems.length >= 2 && (
        <ColoredOpponentGraph
          items={chartItems}
          baseline={activeMetric === "gd15" ? 0 : avgWr}
          baselineLabel={activeMetric === "gd15" ? "0" : `${avgWr}%`}
          selectedOpp={selectedOpp}
          onSelectOpp={setSelectedOpp}
        />
      )}
      <div className="overflow-x-auto">
        <STable className="w-full text-xs">
          <thead>
            <tr>
              <th className={th}>{tl("Opponent")}</th>
              <th className={th}>{tl("Games")}</th>
              <th className={th}>{tl("Win %")}</th>
              {hasGd15 && <th className={th}>GD@15</th>}
              <th className={th}>{tl("Last met")}</th>
              {teamName && <th className={`${th} text-right`}></th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const isSelected = selectedOpp === o.opp;
              return (
                <tr
                  key={o.opp}
                  onClick={() => setSelectedOpp(isSelected ? null : o.opp)}
                  className={`border-t border-rw-border cursor-pointer transition-colors ${
                    isSelected ? "bg-rw-accent/15 ring-1 ring-inset ring-rw-accent/50" : "hover:bg-rw-raised/40"
                  }`}
                >
                  <td className={`${td} max-w-[13rem] truncate`} data-sort={o.opp}>
                    <span className="inline-flex items-center gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <TeamLogo name={o.opp} size={18} />
                      <TeamLink name={o.opp} u={o.u} />
                    </span>
                  </td>
                  <td className={`${td} text-rw-sub tabular-nums`} data-sort={o.g}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="hidden sm:inline-block w-7 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-rw-accent/80"
                          style={{ width: `${Math.max(6, Math.round((o.g / maxPeriodOppG) * 100))}%` }}
                        />
                      </span>
                      <span>
                        <span className="font-semibold text-rw-text">{o.g}</span>{" "}
                        <span className="text-[11px] text-rw-muted">
                          ({o.w}–{o.g - o.w})
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className={td} data-sort={o.g ? o.w / o.g : -1}>
                    <WinBar w={o.w} g={o.g} />
                  </td>
                  {hasGd15 && (
                    <td className={`${td} tabular-nums`} data-sort={o.gd15 ?? -99999}>
                      {o.gd15 != null ? (
                        <span className={o.gd15 >= 0 ? "text-rw-teal font-semibold" : "text-rw-red"}>
                          {o.gd15 > 0 ? `+${fmtNum(o.gd15)}` : fmtNum(o.gd15)}
                        </span>
                      ) : (
                        <span className="text-rw-muted">–</span>
                      )}
                    </td>
                  )}
                  <td className={`${td} text-rw-muted tabular-nums`} data-sort={o.last || ""}>{fmtDate(o.last)}</td>
                  {teamName && (
                    <td className={`${td} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                      {o.u && (
                        <span className="inline-flex items-center gap-2 text-[10px]">
                          <HubLink
                            to={{ kind: "prep", a: teamSlug, b: o.u }}
                            className="text-rw-accent hover:underline"
                            title={tl("Match prep")}
                          >
                            {tl("Match prep")}
                          </HubLink>
                          <HubLink
                            to={{ kind: "compare", mode: "team", a: teamSlug, b: o.u }}
                            className="text-rw-muted hover:text-rw-accent hover:underline"
                            title={tl("Compare")}
                          >
                            {tl("Compare")}
                          </HubLink>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </STable>
      </div>
    </Section>
  );
};
