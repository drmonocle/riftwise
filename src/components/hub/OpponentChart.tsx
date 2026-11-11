/**
 * Visual opponent performance chart & breakdown ("Against other teams"):
 * - Multi-stop colored SVG line & area graph showing how a player or team performed against each opponent
 *   (color-coded teal / accent / red by performance on the active metric: Player rating, Win %, KDA, DPM, or GD@15).
 * - Quick tournament / year period filter pills on Player Overview so viewers can inspect career vs opponents or
 *   zoom into a single split/tournament (e.g. LEC 2026 Versus, Worlds, EMEA Masters) with one click.
 * - Inline visual Win % and KDA bars (`WinBar`, `KdaBar`) for instant stat recognition across tables.
 */
import React, { useEffect, useId, useMemo, useState } from "react";
import { tl, tc, eventTitle } from "../../i18n";
import { champName } from "../../champions";
import { bare, loadPlayerGames, loadPlayerGames2y, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolveEventSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
import { matchesPeriodEvent } from "../../hub/period";
import { currentHubRoute } from "../../hub/route";
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

const resolveOppSlug = (name: string, u?: string | null): string => u || resolveTeamAlias(name) || prettySlug(name);

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
      u: resolveOppSlug(x.opp),
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
  subjectTeamSlug?: string;
  subjectPlayerSlug?: string;
  subjectRole?: string;
  period?: string;
}> = ({ items, baseline, baselineLabel, selectedOpp, onSelectOpp, subjectTeamSlug, subjectPlayerSlug, subjectRole, period }) => {
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
            {(() => {
              const activeTeamQ = (() => {
                const qp = new URLSearchParams();
                if (period && period !== "all") qp.set("p", period);
                if (active.champs?.[0]?.c) qp.set("champ", resolveChampSlug(active.champs[0].c));
                const subQ = subjectPlayerSlug || subjectTeamSlug;
                if (subQ) qp.set("q", subQ);
                return qp.toString() || undefined;
              })();
              return (
                <>
                  <span className="inline-flex items-center gap-1 font-semibold text-rw-text">
                    <HubLink
                      to={{
                        kind: "team",
                        slug: resolveOppSlug(active.opp, active.u),
                        ...(activeTeamQ ? { query: activeTeamQ } : {}),
                      }}
                      className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent"
                    >
                      <TeamLogo name={active.opp} size={16} />
                    </HubLink>
                    <TeamLink name={active.opp} u={active.u} query={activeTeamQ} />
                  </span>
                  <HubLink
                    to={{
                      kind: "team",
                      slug: resolveOppSlug(active.opp, active.u),
                      ...(activeTeamQ ? { query: activeTeamQ } : {}),
                    }}
                    className="tabular-nums font-bold hover:underline"
                    style={{ color: toneColor(active.tone) }}
                  >
                    {active.fmt}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "team",
                      slug: resolveOppSlug(active.opp, active.u),
                      ...(activeTeamQ ? { query: activeTeamQ } : {}),
                    }}
                    className="text-rw-muted tabular-nums hover:text-rw-accent hover:underline"
                  >
                    {active.sub}
                  </HubLink>
                </>
              );
            })()}
            {active.champs && active.champs.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                {active.champs.slice(0, 3).map((c) => {
                  const cSlug = resolveChampSlug(c.c);
                  const otherC = active.champs?.find((x) => resolveChampSlug(x.c) !== cSlug);
                  return (
                    <HubLink
                      key={c.c}
                      to={{
                        kind: "champ",
                        slug: cSlug,
                        query: new URLSearchParams({
                          ...(subjectPlayerSlug ? { player: subjectPlayerSlug } : {}),
                          ...(subjectTeamSlug ? { team: subjectTeamSlug } : {}),
                          vs: resolveOppSlug(active.opp, active.u),
                          ...(subjectRole ? { role: subjectRole } : {}),
                          ...(otherC ? { vschamp: resolveChampSlug(otherC.c) } : {}),
                          ...(period && period !== "all" ? { p: period } : {}),
                        }).toString(),
                      }}
                      title={`${champName(c.c)} (${c.w}–${c.g - c.w})`}
                    >
                      <ChampIcon name={c.c} size={15} />
                    </HubLink>
                  );
                })}
              </span>
            )}
            <HubLink
              to={{
                kind: "prep",
                a: subjectTeamSlug || resolveOppSlug(active.opp, active.u),
                ...(subjectTeamSlug && subjectTeamSlug !== resolveOppSlug(active.opp, active.u)
                  ? { b: resolveOppSlug(active.opp, active.u) }
                  : {}),
                ...(period && period !== "all" ? { period } : {}),
              }}
              className="text-rw-muted hover:text-rw-accent hover:underline"
            >
              {tl("Match prep")} →
            </HubLink>
            {(() => {
              const c0Slug = active.champs?.[0]?.c ? resolveChampSlug(active.champs[0].c) : undefined;
              const c1Slug =
                active.champs?.map((c) => resolveChampSlug(c.c)).find((s) => Boolean(s) && s !== c0Slug) ||
                items
                  .flatMap((it) => it.champs || [])
                  .map((c) => resolveChampSlug(c.c))
                  .find((s) => Boolean(s) && s !== c0Slug);
              const qChamps = [c0Slug, c1Slug]
                .filter((v, idx, arr): v is string => Boolean(v) && arr.indexOf(v) === idx)
                .join(",");
              return (
                <>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `teams=${encodeURIComponent(subjectTeamSlug || resolveOppSlug(active.opp, active.u))}${
                        subjectTeamSlug && subjectTeamSlug !== resolveOppSlug(active.opp, active.u)
                          ? `,${encodeURIComponent(resolveOppSlug(active.opp, active.u))}`
                          : ""
                      }${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}${
                        qChamps ? `&champ=${encodeURIComponent(qChamps)}` : ""
                      }${subjectRole ? `&role=${encodeURIComponent(subjectRole)}` : ""}`,
                    }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: subjectTeamSlug || resolveOppSlug(active.opp, active.u),
                      ...(subjectTeamSlug && subjectTeamSlug !== resolveOppSlug(active.opp, active.u)
                        ? { b: resolveOppSlug(active.opp, active.u) }
                        : {}),
                      ...(period && period !== "all" ? { period } : {}),
                    }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  {c0Slug && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: new URLSearchParams({
                          champ: c0Slug,
                          ...(c1Slug ? { vs: c1Slug } : {}),
                          ...(subjectRole ? { role: subjectRole } : {}),
                          ...(period && /^y:?(\d{4})$/.test(period)
                            ? { patch: `y${/^y:?(\d{4})$/.exec(period)![1]}`, year: /^y:?(\d{4})$/.exec(period)![1] }
                            : period?.startsWith("e:")
                              ? { event: resolveEventSlug(period.slice(2)) }
                              : period?.startsWith("p:")
                                ? { patch: period.slice(2) }
                                : {}),
                        }).toString(),
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: `${subjectPlayerSlug ? `player=${encodeURIComponent(subjectPlayerSlug)}&` : ""}team=${encodeURIComponent(subjectTeamSlug || resolveOppSlug(active.opp, active.u))}${
                        subjectTeamSlug && subjectTeamSlug !== resolveOppSlug(active.opp, active.u)
                          ? `&vs=${encodeURIComponent(resolveOppSlug(active.opp, active.u))}`
                          : ""
                      }${subjectRole ? `&role=${encodeURIComponent(subjectRole)}` : ""}${c0Slug ? `&champ=${encodeURIComponent(c0Slug)}` : ""}${c1Slug ? `&vschamp=${encodeURIComponent(c1Slug)}` : ""}${periodQuerySuffix(period)}`,
                    }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `${subjectPlayerSlug ? `player=${encodeURIComponent(subjectPlayerSlug)}&` : ""}team=${encodeURIComponent(subjectTeamSlug || resolveOppSlug(active.opp, active.u))}${
                        subjectTeamSlug && subjectTeamSlug !== resolveOppSlug(active.opp, active.u)
                          ? `&vs=${encodeURIComponent(resolveOppSlug(active.opp, active.u))}`
                          : ""
                      }${subjectRole ? `&role=${encodeURIComponent(subjectRole)}` : ""}${c0Slug ? `&champ=${encodeURIComponent(c0Slug)}` : ""}${c1Slug ? `&vschamp=${encodeURIComponent(c1Slug)}` : ""}${periodQuerySuffix(period)}`,
                    }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      query: new URLSearchParams({
                        q: [subjectTeamSlug, resolveOppSlug(active.opp, active.u)].filter(Boolean).join(","),
                      }).toString(),
                    }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      ...(period || qChamps || subjectRole
                        ? {
                            query: new URLSearchParams({
                              ...(period && /^y:?(\d{4})$/.test(period)
                                ? { key: `y${/^y:?(\d{4})$/.exec(period)![1]}`, year: /^y:?(\d{4})$/.exec(period)![1] }
                                : period?.startsWith("e:")
                                  ? { event: resolveEventSlug(period.slice(2)) }
                                  : period?.startsWith("p:")
                                    ? { key: `p${period.slice(2)}`, patch: period.slice(2) }
                                    : {}),
                              ...(subjectRole ? { role: subjectRole } : {}),
                              ...(qChamps ? { q: qChamps } : {}),
                            }).toString(),
                          }
                        : {}),
                    }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(period && /^y:?(\d{4})$/.test(period) ? { year: /^y:?(\d{4})$/.exec(period)![1] } : {}),
                        ...(period?.startsWith("e:") ? { event: resolveEventSlug(period.slice(2)) } : {}),
                        ...(subjectRole ? { role: subjectRole } : {}),
                        ...(c0Slug ? { champ: c0Slug } : {}),
                        q: [subjectPlayerSlug, subjectTeamSlug, resolveOppSlug(active.opp, active.u)].filter(Boolean).join(","),
                      }).toString(),
                    }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

const periodQuerySuffix = (p?: string): string => {
  if (!p || p === "all") return "";
  if (p.startsWith("y:")) return `&year=${encodeURIComponent(p.slice(2))}`;
  if (/^y\d{4}$/.test(p)) return `&year=${encodeURIComponent(p.slice(1))}`;
  if (p.startsWith("e:")) return `&event=${encodeURIComponent(resolveEventSlug(p.slice(2)))}`;
  if (p.startsWith("p:")) return `&patch=${encodeURIComponent(p.slice(2))}`;
  return "";
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
  period?: string;
}> = ({ slug, name, has2y, rows: givenRows, cardSub, period }) => {
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

  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;

  // Quick tournament / year filter pills when rendered standalone on PlayerPage Overview
  const parseUrlScope = (rq?: string): string => {
    const p = new URLSearchParams(rq ?? (typeof window !== "undefined" ? window.location.search : ""));
    const raw = (p.get("p") || p.get("period") || "").trim();
    if (/^y:?(\d{4})$/.test(raw)) return `y${/^y:?(\d{4})$/.exec(raw)![1]}`;
    if (/^\d{4}$/.test(raw)) return `y${raw}`;
    if (raw.startsWith("e:") && raw.length > 2) return `e:${resolveEventSlug(raw.slice(2))}`;
    const yr = (p.get("y") || p.get("year") || "").trim();
    if (/^\d{4}$/.test(yr)) return `y${yr}`;
    const ev = (p.get("event") || "").trim();
    if (ev) return `e:${resolveEventSlug(ev.startsWith("e:") ? ev.slice(2) : ev)}`;
    return "all";
  };
  const [scope, setScope] = useState<string>(() => (givenRows ? "all" : parseUrlScope(routeQuery)));
  useEffect(() => {
    if (givenRows) return;
    const next = parseUrlScope(routeQuery);
    if (next !== "all") setScope(next);
  }, [givenRows, routeQuery]);
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
      .map(([y]) => ({ key: `y${y}`, label: y }));
    const evList = [...events.values()]
      .filter((e) => e.g >= 4)
      .sort((a, b) => b.last.localeCompare(a.last))
      .slice(0, 4)
      .map((e) => ({ key: `e:${e.slug}`, label: eventTitle(e.name) }));
    const pills = [...yrList, ...evList];
    if (scope !== "all" && !pills.some((p) => p.key === scope)) {
      if (/^y\d{4}$/.test(scope) && years.has(scope.slice(1))) {
        pills.unshift({ key: scope, label: scope.slice(1) });
      } else if (scope.startsWith("e:")) {
        const es = scope.slice(2);
        const hit = [...events.values()].find((e) => matchesPeriodEvent(e.slug, e.name, es));
        if (hit) pills.push({ key: scope, label: eventTitle(hit.name) });
      }
    }
    return pills;
  }, [givenRows, rawRows, scope]);

  const scopedRows = useMemo(() => {
    if (givenRows || scope === "all") return rawRows;
    if (/^y:?(\d{4})$/.test(scope)) {
      const y = /^y:?(\d{4})$/.exec(scope)![1];
      return rawRows.filter((r) => (r[0] || "").startsWith(y));
    }
    if (scope.startsWith("e:")) {
      const es = scope.slice(2);
      return rawRows.filter((r) => matchesPeriodEvent(r[11] || "", r[9] || "", es));
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

  const [search, setSearch] = useState(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("vs") || p.get("opp") || p.get("team") || p.get("champ") || p.get("q") || "";
  });
  useEffect(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    const v = p.get("vs") || p.get("opp") || p.get("team") || p.get("champ") || p.get("q") || "";
    if (v) setSearch(v);
  }, [routeQuery]);
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
    const q = normText(search);
    const terms = q ? q.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => normText(s)).filter(Boolean) : [];
    if (!terms.length) return opps;
    return opps.filter((o) => {
      const hay = normText(`${o.opp} ${o.u || ""} ${o.champs.map((c) => `${c.c} ${champName(c.c)}`).join(" ")}`);
      const hayBare = bare(hay);
      const canonOpp = resolveTeamAlias(o.u || o.opp);
      return terms.some((t) => {
        const tb = bare(t);
        const ta = searchAlias(t);
        return (
          hay.includes(t) ||
          (tb.length >= 2 && hayBare.includes(tb)) ||
          (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false) ||
          (canonOpp ? resolveTeamAlias(t) === canonOpp : false) ||
          o.champs.some((c) => matchesChampSearch(c.c, t))
        );
      });
    });
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
          {search.trim() && filteredOpps.length >= 2 && (() => {
            const activeP = period || (scope !== "all" ? scope : "");
            const yrMatch = /^y:?(\d{4})$/.exec(activeP);
            const yr = yrMatch ? yrMatch[1] : "";
            const ev = activeP.startsWith("e:") ? resolveEventSlug(activeP.slice(2)) : "";
            const topChamp = filteredOpps[0]?.champs[0]?.c ? resolveChampSlug(filteredOpps[0].champs[0].c) : undefined;
            const secondChamp = [...filteredOpps, ...opps]
              .flatMap((o) => o.champs)
              .map((c) => resolveChampSlug(c.c))
              .find((s) => Boolean(s) && s !== topChamp);
            const topChamps = [topChamp, secondChamp]
              .filter((c): c is string => Boolean(c))
              .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
              .join(",");
            const subTeam = scopedRows.map((r) => (r[7] ? resolveOppSlug(r[7]) : "")).find(Boolean) || "";
            const primaryRole = scopedRows.map((r) => r[10] || "").find(Boolean) || "";
            const opp0Slug = resolveOppSlug(filteredOpps[0].opp, filteredOpps[0].u);
            const opp1Slug = resolveOppSlug(filteredOpps[1].opp, filteredOpps[1].u);
            return (
              <>
                <HubLink
                  to={{ kind: "prep", a: opp0Slug, b: opp1Slug, period: period || (scope !== "all" ? scope : undefined) }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(opp0Slug)},${encodeURIComponent(opp1Slug)}${period || scope !== "all" ? `&p=${encodeURIComponent(period || scope)}` : ""}${topChamps ? `&champ=${topChamps}` : ""}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: opp0Slug, b: opp1Slug, period: period || (scope !== "all" ? scope : undefined) }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                {topChamp && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        champ: topChamp,
                        ...(secondChamp ? { vs: secondChamp } : {}),
                        ...(primaryRole ? { role: primaryRole } : {}),
                        ...(yr ? { patch: `y${yr}`, year: yr } : ev ? { event: ev } : activeP.startsWith("p:") ? { patch: activeP.slice(2) } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "items",
                    query: `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}&vs=${encodeURIComponent(opp0Slug)}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${topChamp ? `&champ=${encodeURIComponent(topChamp)}` : ""}${secondChamp ? `&vschamp=${encodeURIComponent(secondChamp)}` : ""}${periodQuerySuffix(period || scope)}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}&vs=${encodeURIComponent(opp0Slug)}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${topChamp ? `&champ=${encodeURIComponent(topChamp)}` : ""}${secondChamp ? `&vschamp=${encodeURIComponent(secondChamp)}` : ""}${periodQuerySuffix(period || scope)}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(yr || ev || activeP.startsWith("p:") || topChamps || primaryRole
                      ? {
                          query: new URLSearchParams({
                            ...(yr ? { key: `y${yr}`, year: yr } : ev ? { event: ev } : activeP.startsWith("p:") ? { key: `p${activeP.slice(2)}`, patch: activeP.slice(2) } : {}),
                            ...(topChamps ? { q: topChamps } : {}),
                            ...(primaryRole ? { role: primaryRole } : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{ kind: "rankings", query: `q=${encodeURIComponent(`${opp0Slug},${opp1Slug}`)}` }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(yr ? { year: yr } : {}),
                      ...(ev ? { event: ev } : {}),
                      ...(topChamp ? { champ: topChamp } : {}),
                      ...(primaryRole ? { role: primaryRole } : {}),
                      q: [slug, subTeam, opp0Slug, opp1Slug].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </>
            );
          })()}
          {search.trim() && filteredOpps.length === 1 && (() => {
            const activeP = period || (scope !== "all" ? scope : "");
            const yrMatch = /^y:?(\d{4})$/.exec(activeP);
            const yr = yrMatch ? yrMatch[1] : "";
            const ev = activeP.startsWith("e:") ? resolveEventSlug(activeP.slice(2)) : "";
            const topChamp = filteredOpps[0].champs[0]?.c ? resolveChampSlug(filteredOpps[0].champs[0].c) : undefined;
            const secondChamp = [...filteredOpps, ...opps]
              .flatMap((o) => o.champs)
              .map((c) => resolveChampSlug(c.c))
              .find((s) => Boolean(s) && s !== topChamp);
            const topChamps = [topChamp, secondChamp]
              .filter((c): c is string => Boolean(c))
              .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
              .join(",");
            const subTeam = scopedRows.map((r) => (r[7] ? resolveOppSlug(r[7]) : "")).find(Boolean) || "";
            const primaryRole = scopedRows.map((r) => r[10] || "").find(Boolean) || "";
            const opp0Slug = resolveOppSlug(filteredOpps[0].opp, filteredOpps[0].u);
            const fallbackOpp = opps.map((o) => resolveOppSlug(o.opp, o.u)).find((s) => Boolean(s) && s !== opp0Slug && s !== subTeam);
            const teamA = subTeam && subTeam !== opp0Slug ? subTeam : opp0Slug;
            const teamB = subTeam && subTeam !== opp0Slug ? opp0Slug : fallbackOpp;
            const teamsQ = teamB ? `${encodeURIComponent(teamA)},${encodeURIComponent(teamB)}` : encodeURIComponent(teamA);
            return (
              <>
                <HubLink
                  to={{ kind: "prep", a: teamA, ...(teamB ? { b: teamB } : {}), period: period || (scope !== "all" ? scope : undefined) }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${teamsQ}${period || scope !== "all" ? `&p=${encodeURIComponent(period || scope)}` : ""}${topChamps ? `&champ=${topChamps}` : ""}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: teamA, ...(teamB ? { b: teamB } : {}), period: period || (scope !== "all" ? scope : undefined) }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                {topChamp && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        champ: topChamp,
                        ...(secondChamp ? { vs: secondChamp } : {}),
                        ...(primaryRole ? { role: primaryRole } : {}),
                        ...(yr ? { patch: `y${yr}`, year: yr } : ev ? { event: ev } : activeP.startsWith("p:") ? { patch: activeP.slice(2) } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "items",
                    query: `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}&vs=${encodeURIComponent(opp0Slug)}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${topChamp ? `&champ=${encodeURIComponent(topChamp)}` : ""}${secondChamp ? `&vschamp=${encodeURIComponent(secondChamp)}` : ""}${periodQuerySuffix(period || scope)}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}&vs=${encodeURIComponent(opp0Slug)}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${topChamp ? `&champ=${encodeURIComponent(topChamp)}` : ""}${secondChamp ? `&vschamp=${encodeURIComponent(secondChamp)}` : ""}${periodQuerySuffix(period || scope)}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(yr || ev || activeP.startsWith("p:") || topChamps || primaryRole
                      ? {
                          query: new URLSearchParams({
                            ...(yr ? { key: `y${yr}`, year: yr } : ev ? { event: ev } : activeP.startsWith("p:") ? { key: `p${activeP.slice(2)}`, patch: activeP.slice(2) } : {}),
                            ...(topChamps ? { q: topChamps } : {}),
                            ...(primaryRole ? { role: primaryRole } : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{ kind: "rankings", query: `q=${encodeURIComponent([teamA, teamB].filter(Boolean).join(","))}` }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(yr ? { year: yr } : {}),
                      ...(ev ? { event: ev } : {}),
                      ...(topChamp ? { champ: topChamp } : {}),
                      ...(primaryRole ? { role: primaryRole } : {}),
                      q: [slug, teamA, teamB].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </>
            );
          })()}
          {!search.trim() && (() => {
            const activeP = period || (scope !== "all" ? scope : "");
            const yrMatch = /^y:?(\d{4})$/.exec(activeP);
            const yr = yrMatch ? yrMatch[1] : "";
            const ev = activeP.startsWith("e:") ? resolveEventSlug(activeP.slice(2)) : "";
            const topChamp = opps[0]?.champs[0]?.c ? resolveChampSlug(opps[0].champs[0].c) : undefined;
            const secondChamp = opps
              .flatMap((o) => o.champs)
              .map((c) => resolveChampSlug(c.c))
              .find((s) => Boolean(s) && s !== topChamp);
            const topChamps = [topChamp, secondChamp]
              .filter((c): c is string => Boolean(c))
              .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
              .join(",");
            const subTeam = scopedRows.map((r) => (r[7] ? resolveOppSlug(r[7]) : "")).find(Boolean) || "";
            const primaryRole = scopedRows.map((r) => r[10] || "").find(Boolean) || "";
            const opp0Slug = opps[0] ? resolveOppSlug(opps[0].opp, opps[0].u) : "";
            const opp1Slug = opps.map((o) => resolveOppSlug(o.opp, o.u)).find((s) => Boolean(s) && s !== opp0Slug && s !== subTeam) || "";
            const teamA = subTeam || opp0Slug;
            const teamB = subTeam && opp0Slug && opp0Slug !== subTeam ? opp0Slug : opp1Slug && opp1Slug !== teamA ? opp1Slug : "";
            return (
              <>
                {teamA && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: teamA,
                        ...(teamB ? { b: teamB } : {}),
                        period: period || (scope !== "all" ? scope : undefined),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(teamA)}${teamB ? `,${encodeURIComponent(teamB)}` : ""}${period || scope !== "all" ? `&p=${encodeURIComponent(period || scope)}` : ""}${topChamps ? `&champ=${topChamps}` : ""}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "player",
                    a: slug,
                    ...(period ? { period } : scope !== "all" ? { period: scope } : {}),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}${opp0Slug ? `&vs=${encodeURIComponent(opp0Slug)}` : ""}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${topChamp ? `&champ=${encodeURIComponent(topChamp)}` : ""}${secondChamp ? `&vschamp=${encodeURIComponent(secondChamp)}` : ""}${periodQuerySuffix(period || scope)}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(yr ? { year: yr } : {}),
                      ...(ev ? { event: ev } : {}),
                      ...(topChamp ? { champ: topChamp } : {}),
                      ...(primaryRole ? { role: primaryRole } : {}),
                      q: [slug, teamA, teamB].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(yr || ev || activeP.startsWith("p:") || topChamps || primaryRole
                      ? {
                          query: new URLSearchParams({
                            ...(yr ? { key: `y${yr}`, year: yr } : ev ? { event: ev } : activeP.startsWith("p:") ? { key: `p${activeP.slice(2)}`, patch: activeP.slice(2) } : {}),
                            ...(topChamps ? { q: topChamps } : {}),
                            ...(primaryRole ? { role: primaryRole } : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "counters",
                    ...(topChamp
                      ? {
                          query: `champ=${encodeURIComponent(topChamp)}${
                            secondChamp ? `&vs=${encodeURIComponent(secondChamp)}` : ""
                          }${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${ev ? `&event=${encodeURIComponent(ev)}` : ""}${yr ? `&patch=y${encodeURIComponent(yr)}&year=${encodeURIComponent(yr)}` : activeP.startsWith("p:") ? `&patch=${encodeURIComponent(activeP.slice(2))}` : ""}`,
                        }
                      : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}${opp0Slug ? `&vs=${encodeURIComponent(opp0Slug)}` : ""}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${topChamp ? `&champ=${encodeURIComponent(topChamp)}` : ""}${secondChamp ? `&vschamp=${encodeURIComponent(secondChamp)}` : ""}${periodQuerySuffix(period || scope)}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query: new URLSearchParams({
                      q: [teamA, teamB].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
              </>
            );
          })()}
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
              filteredOpps.slice(0, 10).map((o, idx) => ({
                rank: idx + 1,
                team: o.opp,
                label: o.opp,
                sub: `${o.w}–${o.g - o.w} (${Math.round((o.w / o.g) * 100)}%)${o.dpm != null ? ` · ${fmtNum(o.dpm)} DPM` : ""}`,
                value: `KDA ${o.kda.toFixed(2)}`,
                win: o.w / Math.max(1, o.g) >= 0.5,
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
          subjectTeamSlug={scopedRows[0]?.[7] ? resolveOppSlug(scopedRows[0][7]) : undefined}
          subjectPlayerSlug={slug}
          subjectRole={scopedRows[0]?.[10] || undefined}
          period={period || (scope !== "all" ? scope : undefined)}
        />
      )}

      {/* Expanded single-opponent game list when an opponent is clicked */}
      {expanded && (
        <div className="bg-rw-bg border border-rw-accent/40 rounded-lg p-2.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-rw-text">
              <HubLink
                to={{
                  kind: "team",
                  slug: resolveOppSlug(expanded.opp, expanded.u),
                  query: new URLSearchParams({
                    ...((period || scope) && (period || scope) !== "all" ? { p: (period || scope)! } : {}),
                    ...(expanded.champs[0]?.c ? { champ: resolveChampSlug(expanded.champs[0].c) } : {}),
                    q: slug,
                  }).toString(),
                }}
                className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent"
              >
                <TeamLogo name={expanded.opp} size={18} />
              </HubLink>
              <TeamLink
                name={expanded.opp}
                u={expanded.u}
                query={new URLSearchParams({
                  ...((period || scope) && (period || scope) !== "all" ? { p: (period || scope)! } : {}),
                  ...(expanded.champs[0]?.c ? { champ: resolveChampSlug(expanded.champs[0].c) } : {}),
                  q: slug,
                }).toString()}
              />
              <HubLink
                to={{
                  kind: "finder",
                  query: (() => {
                    const subTeam = scopedRows.map((r) => (r[7] ? resolveOppSlug(r[7]) : "")).find(Boolean) || "";
                    const primaryRole = scopedRows.map((r) => r[10] || "").find(Boolean) || "";
                    const expSlug = resolveOppSlug(expanded.opp, expanded.u);
                    const expC0 = expanded.champs[0]?.c ? resolveChampSlug(expanded.champs[0].c) : undefined;
                    const expC1 = [...expanded.champs, ...opps.flatMap((o) => o.champs)]
                      .map((c) => resolveChampSlug(c.c))
                      .find((s) => Boolean(s) && s !== expC0);
                    return `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}&vs=${encodeURIComponent(expSlug)}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${expC0 ? `&champ=${encodeURIComponent(expC0)}` : ""}${expC1 ? `&vschamp=${encodeURIComponent(expC1)}` : ""}${periodQuerySuffix(period || scope)}`;
                  })(),
                }}
                className="text-rw-muted font-normal tabular-nums hover:text-rw-accent hover:underline"
              >
                · {expanded.w}–{expanded.g - expanded.w} ({Math.round((expanded.w / expanded.g) * 100)}%) · KDA {expanded.kda.toFixed(2)}
              </HubLink>
            </span>
            <span className="flex items-center gap-2">
              {(() => {
                const subTeam = scopedRows.map((r) => (r[7] ? resolveOppSlug(r[7]) : "")).find(Boolean) || "";
                const primaryRole = scopedRows.map((r) => r[10] || "").find(Boolean) || "";
                const expSlug = resolveOppSlug(expanded.opp, expanded.u);
                const teamA = subTeam && subTeam !== expSlug ? subTeam : expSlug;
                const teamB = subTeam && subTeam !== expSlug ? expSlug : undefined;
                const yr = (period || scope) && /^y:?(\d{4})$/.test((period || scope)!) ? /^y:?(\d{4})$/.exec((period || scope)!)![1] : undefined;
                const ev = (period || scope)?.startsWith("e:") ? resolveEventSlug((period || scope)!.slice(2)) : undefined;
                const expC0 = expanded.champs[0]?.c ? resolveChampSlug(expanded.champs[0].c) : undefined;
                const expC1 = [...expanded.champs, ...opps.flatMap((o) => o.champs)]
                  .map((c) => resolveChampSlug(c.c))
                  .find((s) => Boolean(s) && s !== expC0);
                const expChamps = [expC0, expC1]
                  .filter((c): c is string => Boolean(c))
                  .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
                  .join(",");
                return (
                  <>
                    <HubLink
                      to={{ kind: "prep", a: teamA, ...(teamB ? { b: teamB } : {}), period: period || (scope !== "all" ? scope : undefined) }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Match prep")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          teams: teamB ? `${teamA},${teamB}` : teamA,
                          ...(period || scope !== "all" ? { p: (period || scope)! } : {}),
                          ...(expChamps ? { champ: expChamps } : {}),
                          ...(primaryRole ? { role: primaryRole } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")}
                    </HubLink>
                    <HubLink
                      to={{ kind: "compare", mode: "team", a: teamA, ...(teamB ? { b: teamB } : {}), period: period || (scope !== "all" ? scope : undefined) }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")}
                    </HubLink>
                    {expC0 && (
                      <HubLink
                        to={{
                          kind: "counters",
                          query: new URLSearchParams({
                            champ: expC0,
                            ...(expC1 ? { vs: expC1 } : {}),
                            ...(primaryRole ? { role: primaryRole } : {}),
                            ...(yr ? { patch: `y${yr}`, year: yr } : ev ? { event: ev } : (period || scope)?.startsWith("p:") ? { patch: (period || scope)!.slice(2) } : {}),
                          }).toString(),
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Counters")}
                      </HubLink>
                    )}
                    <HubLink
                      to={{
                        kind: "items",
                        query: `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}&vs=${encodeURIComponent(expSlug)}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${expC0 ? `&champ=${encodeURIComponent(expC0)}` : ""}${expC1 ? `&vschamp=${encodeURIComponent(expC1)}` : ""}${periodQuerySuffix(period || scope)}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}&vs=${encodeURIComponent(expSlug)}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${expC0 ? `&champ=${encodeURIComponent(expC0)}` : ""}${expC1 ? `&vschamp=${encodeURIComponent(expC1)}` : ""}${periodQuerySuffix(period || scope)}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Game finder")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        ...(yr || ev || (period || scope)?.startsWith("p:") || expChamps || primaryRole
                          ? {
                              query: new URLSearchParams({
                                ...(yr
                                  ? { key: `y${yr}`, year: yr }
                                  : ev
                                    ? { event: ev }
                                    : (period || scope)?.startsWith("p:")
                                      ? { key: `p${(period || scope)!.slice(2)}`, patch: (period || scope)!.slice(2) }
                                      : {}),
                                ...(expChamps ? { q: expChamps } : {}),
                                ...(primaryRole ? { role: primaryRole } : {}),
                              }).toString(),
                            }
                          : {}),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        query: new URLSearchParams({
                          q: [teamA, teamB].filter(Boolean).join(","),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(yr ? { year: yr } : {}),
                          ...(ev ? { event: ev } : {}),
                          ...(expC0 ? { champ: expC0 } : {}),
                          ...(primaryRole ? { role: primaryRole } : {}),
                          q: [slug, teamA, teamB].filter(Boolean).join(","),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")}
                    </HubLink>
                  </>
                );
              })()}
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
                    <HubLink
                      to={{
                        kind: "champ",
                        slug: resolveChampSlug(g[2]),
                        query: new URLSearchParams({
                          player: slug,
                          ...(g[7] ? { team: resolveOppSlug(g[7]) } : {}),
                          vs: resolveOppSlug(expanded.opp, expanded.u),
                          ...(g[10] ? { role: g[10] } : {}),
                          ...(g[11]
                            ? { p: `e:${resolveEventSlug(g[11])}` }
                            : g[0]?.slice(0, 4)
                              ? { p: `y${g[0].slice(0, 4)}` }
                              : {}),
                        }).toString(),
                      }}
                      title={champName(g[2])}
                      className="shrink-0"
                    >
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
                    <EventLink
                      name={g[9]}
                      u={g[11]}
                      query={`q=${encodeURIComponent([slug, g[7] ? resolveOppSlug(g[7]) : "", resolveOppSlug(expanded.opp, expanded.u)].filter(Boolean).join(","))}${g[2] ? `&champ=${encodeURIComponent(resolveChampSlug(g[2]))}` : ""}`}
                      className="text-rw-muted hover:text-rw-accent hover:underline truncate"
                    />
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-rw-muted tabular-nums">
                    {rv != null && <RatingBadge v={rv} />}
                    {g[1] ? (
                      <HubLink to={{ kind: "match", slug: g[1], game: g[22] || undefined }} className="hover:text-rw-accent hover:underline">
                        {fmtDate(g[0], true)}
                      </HubLink>
                    ) : (
                      <span>{fmtDate(g[0], true)}</span>
                    )}
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
      {(opps.length > 8 || Boolean(search.trim())) && (
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
              const subTeam = scopedRows.map((r) => (r[7] ? resolveOppSlug(r[7]) : "")).find(Boolean) || "";
              const primaryRole = scopedRows.map((r) => r[10] || "").find(Boolean) || "";
              const rowC0 = o.champs[0]?.c ? resolveChampSlug(o.champs[0].c) : "";
              const rowC1 = o.champs.map((c) => resolveChampSlug(c.c)).find((s) => Boolean(s) && s !== rowC0) || "";
              const rowFinderQuery = `player=${encodeURIComponent(slug)}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}&vs=${encodeURIComponent(resolveOppSlug(o.opp, o.u))}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${rowC0 ? `&champ=${encodeURIComponent(rowC0)}` : ""}${rowC1 ? `&vschamp=${encodeURIComponent(rowC1)}` : ""}${periodQuerySuffix(period || scope)}`;
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
                      <HubLink
                        to={{
                          kind: "team",
                          slug: resolveOppSlug(o.opp, o.u),
                          query: new URLSearchParams({
                            ...((period || scope) && (period || scope) !== "all" ? { p: (period || scope)! } : {}),
                            ...(rowC0 ? { champ: rowC0 } : {}),
                            q: slug,
                          }).toString(),
                        }}
                        className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent"
                      >
                        <TeamLogo name={o.opp} size={18} />
                      </HubLink>
                      <TeamLink
                        name={o.opp}
                        u={o.u}
                        query={new URLSearchParams({
                          ...((period || scope) && (period || scope) !== "all" ? { p: (period || scope)! } : {}),
                          ...(rowC0 ? { champ: rowC0 } : {}),
                          q: slug,
                        }).toString()}
                        className="text-rw-text hover:text-rw-accent hover:underline truncate"
                      />
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
                          to={{ kind: "finder", query: rowFinderQuery }}
                          onNavigate={() => {}}
                          className="font-semibold text-rw-text hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>
                            {o.g}{" "}
                            <span className="text-[11px] font-normal text-rw-muted">
                              ({o.w}–{o.g - o.w})
                            </span>
                          </span>
                        </HubLink>
                      </span>
                    </span>
                  </td>
                  <td className={td} data-sort={o.g ? o.w / o.g : -1}>
                    <HubLink
                      to={{ kind: "finder", query: rowFinderQuery }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      <span onClick={(e) => e.stopPropagation()}>
                        <WinBar w={o.w} g={o.g} />
                      </span>
                    </HubLink>
                  </td>
                  {hasRating && (
                    <td className={td} data-sort={o.rating ?? -1}>
                      {o.rating != null ? (
                        <HubLink
                          to={{ kind: "finder", query: rowFinderQuery }}
                          className="hover:opacity-90"
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>
                            <RatingBadge v={o.rating} />
                          </span>
                        </HubLink>
                      ) : (
                        <span className="text-rw-muted">–</span>
                      )}
                    </td>
                  )}
                  <td className={td} data-sort={o.kda}>
                    <HubLink
                      to={{ kind: "finder", query: rowFinderQuery }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      <span onClick={(e) => e.stopPropagation()}>
                        <KdaBar
                          kda={o.kda}
                          sub={`${(o.k / o.g).toFixed(1)}/${(o.d / o.g).toFixed(1)}/${(o.a / o.g).toFixed(1)}`}
                        />
                      </span>
                    </HubLink>
                  </td>
                  {hasDpm && (
                    <td className={`${td} text-rw-sub tabular-nums`} data-sort={o.dpm ?? -1}>
                      {o.dpm != null ? (
                        <HubLink
                          to={{ kind: "finder", query: rowFinderQuery }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>{fmtNum(o.dpm)}</span>
                        </HubLink>
                      ) : (
                        "–"
                      )}
                    </td>
                  )}
                  {hasGd15 && (
                    <td className={`${td} tabular-nums`} data-sort={o.gd15 ?? -99999}>
                      {o.gd15 != null ? (
                        <HubLink
                          to={{ kind: "finder", query: rowFinderQuery }}
                          className={`hover:underline ${o.gd15 >= 0 ? "text-rw-teal font-semibold" : "text-rw-red"}`}
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>{o.gd15 > 0 ? `+${fmtNum(o.gd15)}` : fmtNum(o.gd15)}</span>
                        </HubLink>
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
                          to={{
                            kind: "player",
                            slug,
                            tab: "champions",
                            query: `champ=${encodeURIComponent(resolveChampSlug(c.c))}&q=${encodeURIComponent(resolveOppSlug(o.opp, o.u))}${subTeam ? `&team=${encodeURIComponent(subTeam)}` : ""}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}${(period || scope) && (period || scope) !== "all" ? `&p=${encodeURIComponent((period || scope)!)}` : ""}`,
                          }}
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
  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const [search, setSearch] = useState(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("vs") || p.get("opp") || p.get("team") || p.get("q") || "";
  });
  useEffect(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    const v = p.get("vs") || p.get("opp") || p.get("team") || p.get("q") || "";
    if (v) setSearch(v);
  }, [routeQuery]);
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
          u: resolveOppSlug(o.n, o.u),
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
    const q = normText(search);
    const terms = q ? q.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => normText(s)).filter(Boolean) : [];
    if (!terms.length) return opps;
    return opps.filter((o) => {
      const hay = normText(`${o.n} ${o.u || ""}`);
      const hayBare = bare(hay);
      const canonOpp = resolveTeamAlias(o.u || o.n);
      return terms.some((t) => {
        const tb = bare(t);
        const ta = searchAlias(t);
        return (
          hay.includes(t) ||
          (tb.length >= 2 && hayBare.includes(tb)) ||
          (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false) ||
          (canonOpp ? resolveTeamAlias(t) === canonOpp : false)
        );
      });
    });
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
        <span className="flex flex-wrap items-center gap-2">
          {compact && (opps.length > 8 || Boolean(search.trim())) && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              data-nocapture="1"
              className="bg-rw-bg border border-rw-border rounded-md px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-36"
            />
          )}
          {(() => {
            const opp0Yr = filtered[0]?.last && /^\d{4}/.test(filtered[0].last) ? filtered[0].last.slice(0, 4) : undefined;
            const opp0Slug = [...filtered, ...opps]
              .map((o) => resolveOppSlug(o.n, o.u))
              .find((s) => Boolean(s) && s !== teamSlug);
            return (
              <>
                {opp0Slug && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: teamSlug,
                        b: opp0Slug,
                        ...(opp0Yr ? { period: `y${opp0Yr}` } : {}),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(teamSlug)},${encodeURIComponent(opp0Slug)}${opp0Yr ? `&p=y${encodeURIComponent(opp0Yr)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a: teamSlug,
                        b: opp0Slug,
                        ...(opp0Yr ? { period: `y${opp0Yr}` } : {}),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{
                    kind: "counters",
                    ...(opp0Yr ? { query: `patch=y${encodeURIComponent(opp0Yr)}&year=${encodeURIComponent(opp0Yr)}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      team: teamSlug,
                      ...(opp0Slug ? { vs: opp0Slug } : {}),
                      ...(opp0Yr ? { year: opp0Yr } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query: new URLSearchParams({
                      q: [teamSlug, opp0Slug].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(opp0Yr ? { query: `key=y${opp0Yr}&year=${opp0Yr}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `team=${encodeURIComponent(teamSlug)}${
                      opp0Slug
                        ? `&vs=${encodeURIComponent(opp0Slug)}${opp0Yr ? `&year=${encodeURIComponent(opp0Yr)}` : ""}`
                        : opp0Yr
                          ? `&year=${encodeURIComponent(opp0Yr)}`
                          : ""
                    }`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(opp0Yr ? { year: opp0Yr } : {}),
                      q: [teamSlug, opp0Slug].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </>
            );
          })()}
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
              filtered.slice(0, 10).map((o, idx) => ({
                rank: idx + 1,
                team: o.n,
                label: o.n,
                sub: `${o.w}–${o.g - o.w} · ${fmtDate(o.last)}`,
                value: `${Math.round((o.w / Math.max(1, o.g)) * 100)}%`,
                win: o.w / Math.max(1, o.g) >= 0.5,
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
          subjectTeamSlug={teamSlug}
        />
      )}

      {!compact && (opps.length > 10 || Boolean(search.trim())) && (
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
              const oppSlug = resolveOppSlug(o.n, o.u);
              const rowYr = o.last && /^\d{4}/.test(o.last) ? o.last.slice(0, 4) : undefined;
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
                      <HubLink
                        to={{
                          kind: "team",
                          slug: oppSlug,
                          query: new URLSearchParams({
                            ...(rowYr ? { p: `y${rowYr}` } : {}),
                            q: teamSlug,
                          }).toString(),
                        }}
                        className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent"
                      >
                        <TeamLogo name={o.n} size={18} />
                      </HubLink>
                      <TeamLink
                        name={o.n}
                        u={oppSlug}
                        query={new URLSearchParams({
                          ...(rowYr ? { p: `y${rowYr}` } : {}),
                          q: teamSlug,
                        }).toString()}
                      />
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
                          to={{ kind: "finder", query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(oppSlug)}${rowYr ? `&year=${encodeURIComponent(rowYr)}` : ""}` }}
                          className="font-semibold text-rw-text hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>
                            {o.g}{" "}
                            <span className="text-[11px] font-normal text-rw-muted">
                              ({o.w}–{o.g - o.w})
                            </span>
                          </span>
                        </HubLink>
                      </span>
                    </span>
                  </td>
                  <td className={td} data-sort={o.g ? o.w / o.g : -1}>
                    <HubLink
                      to={{ kind: "finder", query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(oppSlug)}${rowYr ? `&year=${encodeURIComponent(rowYr)}` : ""}` }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      <span onClick={(e) => e.stopPropagation()}>
                        <WinBar w={o.w} g={o.g} />
                      </span>
                    </HubLink>
                  </td>
                  <td className={`${td} text-rw-muted tabular-nums`} data-sort={o.last || ""}>
                    <HubLink
                      to={{ kind: "finder", query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(oppSlug)}${rowYr ? `&year=${encodeURIComponent(rowYr)}` : ""}` }}
                      className="hover:text-rw-accent hover:underline"
                      title={tl("Game finder")}
                    >
                      <span onClick={(e) => e.stopPropagation()}>{fmtDate(o.last)}</span>
                    </HubLink>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                    <span className="inline-flex items-center gap-2">
                      <HubLink to={{ kind: "prep", a: teamSlug, b: oppSlug, ...(rowYr ? { period: `y${rowYr}` } : {}) }} className="text-rw-accent hover:underline">
                        {tl("Match prep")}
                      </HubLink>
                      <HubLink
                        to={{ kind: "draft", query: `teams=${encodeURIComponent(teamSlug)},${encodeURIComponent(oppSlug)}${rowYr ? `&p=y${encodeURIComponent(rowYr)}` : ""}` }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {tl("Draft board")}
                      </HubLink>
                      <HubLink to={{ kind: "compare", mode: "team", a: teamSlug, b: oppSlug, ...(rowYr ? { period: `y${rowYr}` } : {}) }} className="text-rw-muted hover:text-rw-accent hover:underline">
                        {tl("Compare")}
                      </HubLink>
                      <HubLink
                        to={{ kind: "rankings", query: `q=${encodeURIComponent(`${teamSlug},${oppSlug}`)}` }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {tl("Power rankings")}
                      </HubLink>
                      <HubLink
                        to={{ kind: "items", query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(oppSlug)}${rowYr ? `&year=${encodeURIComponent(rowYr)}` : ""}` }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {tl("Item history")}
                      </HubLink>
                      <HubLink
                        to={{ kind: "finder", query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(oppSlug)}${rowYr ? `&year=${encodeURIComponent(rowYr)}` : ""}` }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {tl("Game finder")}
                      </HubLink>
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
 * Period-filtered opponent performance chart for `TeamPeriodStats` (`Stats` tab on `TeamPage`).
 */
export const TeamPeriodOpponents: React.FC<{
  teamSlug: string;
  teamName: string;
  rows: TeamGameRow[];
  cardSub?: string;
  period?: string;
  rosterSlugs?: string[];
}> = ({ teamSlug, teamName, rows, cardSub, period, rosterSlugs }) => {
  const pVal = period && period !== "all" ? period : undefined;
  const pSuffix = periodQuerySuffix(period);
  const rosterP = `${rosterSlugs?.[0] ? `&player=${encodeURIComponent(rosterSlugs[0])}` : ""}${rosterSlugs?.[1] ? `&vsplayer=${encodeURIComponent(rosterSlugs[1])}` : ""}`;
  const hiddenCheck = useHiddenCheck();
  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const [metric, setMetric] = useState<"wr" | "gd15">("wr");
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("vs") || p.get("opp") || p.get("team") || p.get("q") || "";
  });
  useEffect(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    const v = p.get("vs") || p.get("opp") || p.get("team") || p.get("q") || "";
    if (v) setSearch(v);
  }, [routeQuery]);

  const opps = useMemo(() => {
    const byOpp = new Map<string, { opp: string; u: string | null; g: number; w: number; k: number; d: number; gd15Sum: number; gd15N: number; last: string; games: TeamGameRow[] }>();
    for (const r of rows) {
      const date = r[0] || "";
      const series = r[1] || "";
      if (hiddenCheck(`match:${series}`, date)) continue;
      const opp = (r[4] || "").trim();
      if (!opp) continue;
      let cur = byOpp.get(opp);
      if (!cur) {
        cur = { opp, u: r[5] || null, g: 0, w: 0, k: 0, d: 0, gd15Sum: 0, gd15N: 0, last: date, games: [] };
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
      cur.games.push(r);
    }
    return [...byOpp.values()]
      .map((x) => ({
        opp: x.opp,
        u: resolveOppSlug(x.opp, x.u),
        g: x.g,
        w: x.w,
        k: x.k,
        d: x.d,
        gd15: x.gd15N > 0 ? Math.round(x.gd15Sum / x.gd15N) : null,
        last: x.last,
        games: x.games,
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
  const q = normText(search);
  const terms = q ? q.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => normText(s)).filter(Boolean) : [];
  const filtered = terms.length
    ? opps.filter((o) => {
        const hay = normText(`${o.opp} ${o.u || ""}`);
        const hayBare = bare(hay);
        const canonOpp = resolveTeamAlias(o.u || o.opp);
        return terms.some((t) => {
          const tb = bare(t);
          const ta = searchAlias(t);
          return (
            hay.includes(t) ||
            (tb.length >= 2 && hayBare.includes(tb)) ||
            (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false) ||
            (canonOpp ? resolveTeamAlias(t) === canonOpp : false)
          );
        });
      })
    : opps;
  const shown = showAll || q ? filtered : filtered.slice(0, 10);
  const expanded = selectedOpp ? opps.find((o) => o.opp === selectedOpp) || null : null;

  return (
    <Section
      title={tl("Against other teams")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {(opps.length > 8 || Boolean(search.trim())) && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              data-nocapture="1"
              className="bg-rw-bg border border-rw-border rounded-md px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-36"
            />
          )}
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
          {(() => {
            const pickCounts = new Map<string, number>();
            for (const g of filtered[0]?.games || rows) {
              for (const c of g[20] || []) {
                const cs = c ? resolveChampSlug(c) : "";
                if (cs) pickCounts.set(cs, (pickCounts.get(cs) || 0) + 1);
              }
            }
            const sortedPicks = [...pickCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
            const topChamp = sortedPicks[0];
            const secChamp = sortedPicks.find((c) => c !== topChamp);
            const topChamps = [topChamp, secChamp]
              .filter((c): c is string => Boolean(c))
              .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
              .join(",");
            const opp0Slug = [...filtered, ...opps]
              .map((o) => o.u || prettySlug(o.opp))
              .find((s) => Boolean(s) && s !== teamSlug) || "";
            return (
              <>
                {opp0Slug && (
                  <>
                    <HubLink
                      to={{ kind: "prep", a: teamSlug, b: opp0Slug, period: pVal }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(teamSlug)},${encodeURIComponent(opp0Slug)}${pVal ? `&p=${encodeURIComponent(pVal)}` : ""}${topChamps ? `&champ=${topChamps}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "compare", mode: "team", a: teamSlug, b: opp0Slug, period: pVal }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                  </>
                )}
                {topChamp && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        champ: topChamp,
                        ...(secChamp ? { vs: secChamp } : {}),
                        ...(period && /^y\d{4}$/.test(period)
                          ? { patch: period, year: period.slice(1) }
                          : period?.startsWith("e:")
                            ? { event: resolveEventSlug(period.slice(2)) }
                            : period?.startsWith("p:")
                              ? { patch: period.slice(2) }
                              : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "items",
                    query: `team=${encodeURIComponent(teamSlug)}${opp0Slug ? `&vs=${encodeURIComponent(opp0Slug)}` : ""}${rosterP}${topChamp ? `&champ=${encodeURIComponent(topChamp)}` : ""}${secChamp ? `&vschamp=${encodeURIComponent(secChamp)}` : ""}${pSuffix}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query: new URLSearchParams({
                      q: [teamSlug, opp0Slug].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(topChamps || (period && period !== "all")
                      ? {
                          query: new URLSearchParams({
                            ...(topChamps ? { q: topChamps } : {}),
                            ...(period && /^y\d{4}$/.test(period)
                              ? { key: period, year: period.slice(1) }
                              : period?.startsWith("e:")
                                ? { event: resolveEventSlug(period.slice(2)) }
                                : period?.startsWith("p:")
                                  ? { key: `p${period.slice(2)}`, patch: period.slice(2) }
                                  : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `team=${encodeURIComponent(teamSlug)}${opp0Slug ? `&vs=${encodeURIComponent(opp0Slug)}` : ""}${rosterP}${topChamp ? `&champ=${encodeURIComponent(topChamp)}` : ""}${secChamp ? `&vschamp=${encodeURIComponent(secChamp)}` : ""}${pSuffix}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(period && /^y\d{4}$/.test(period)
                        ? { year: period.slice(1) }
                        : period?.startsWith("e:")
                          ? { event: resolveEventSlug(period.slice(2)) }
                          : {}),
                      ...(topChamp ? { champ: topChamp } : {}),
                      q: [teamSlug, opp0Slug, ...(rosterSlugs || [])].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </>
            );
          })()}
          {filtered.length > 10 && !q && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-rw-accent hover:underline">
              {showAll ? tl("Show fewer") : tl("Show all {n}", { n: filtered.length })}
            </button>
          )}
          <SectionCard
            section={tl("Against other teams")}
            name={teamName}
            sub={cardSub}
            rows={() =>
              filtered.slice(0, 10).map((o, idx) => ({
                rank: idx + 1,
                team: o.opp,
                label: o.opp,
                sub: `${o.w}–${o.g - o.w}${o.gd15 != null ? ` · GD@15 ${o.gd15 > 0 ? "+" : ""}${fmtNum(o.gd15)}` : ""}`,
                value: `${Math.round((o.w / o.g) * 100)}%`,
                win: o.w / Math.max(1, o.g) >= 0.5,
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
          subjectTeamSlug={teamSlug}
          period={pVal}
        />
      )}
      {expanded && (
        <div className="bg-rw-bg border border-rw-accent/40 rounded-lg p-2.5 space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-rw-text">
              {(() => {
                const expTopC = expanded.games.flatMap((g) => g[20] || []).find(Boolean);
                const expTeamQ = new URLSearchParams({
                  ...(pVal ? { p: pVal } : {}),
                  ...(expTopC ? { champ: resolveChampSlug(expTopC) } : {}),
                  q: [teamSlug, rosterSlugs?.[0]].filter(Boolean).join(","),
                }).toString();
                return (
                  <>
                    <HubLink
                      to={{
                        kind: "team",
                        slug: resolveOppSlug(expanded.opp, expanded.u),
                        query: expTeamQ,
                      }}
                      className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent"
                    >
                      <TeamLogo name={expanded.opp} size={18} />
                    </HubLink>
                    <TeamLink
                      name={expanded.opp}
                      u={expanded.u}
                      query={expTeamQ}
                    />
                  </>
                );
              })()}
              <HubLink
                to={{
                  kind: "finder",
                  query: (() => {
                    const expSlug = resolveOppSlug(expanded.opp, expanded.u);
                    const pickCounts = new Map<string, number>();
                    for (const g of expanded.games) {
                      for (const c of g[20] || []) {
                        const cs = c ? resolveChampSlug(c) : "";
                        if (cs) pickCounts.set(cs, (pickCounts.get(cs) || 0) + 1);
                      }
                    }
                    const sortedPicks = [...pickCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
                    const expChamp = sortedPicks[0];
                    const expSecChamp = sortedPicks.find((c) => c !== expChamp);
                    return `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(expSlug)}${rosterP}${expChamp ? `&champ=${encodeURIComponent(expChamp)}` : ""}${expSecChamp ? `&vschamp=${encodeURIComponent(expSecChamp)}` : ""}${pSuffix}`;
                  })(),
                }}
                className="text-rw-muted font-normal tabular-nums hover:text-rw-accent hover:underline"
              >
                · {expanded.w}–{expanded.g - expanded.w} ({Math.round((expanded.w / expanded.g) * 100)}%)
              </HubLink>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-[11px]">
              {(() => {
                const expSlug = resolveOppSlug(expanded.opp, expanded.u);
                const pickCounts = new Map<string, number>();
                for (const g of expanded.games) {
                  for (const c of g[20] || []) {
                    const cs = c ? resolveChampSlug(c) : "";
                    if (cs) pickCounts.set(cs, (pickCounts.get(cs) || 0) + 1);
                  }
                }
                const sortedPicks = [...pickCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
                const expChamp = sortedPicks[0];
                const expSecChamp = sortedPicks.find((c) => c !== expChamp);
                const expChamps = [expChamp, expSecChamp]
                  .filter((c): c is string => Boolean(c))
                  .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
                  .join(",");
                return (
                  <>
                    <HubLink to={{ kind: "prep", a: teamSlug, b: expSlug, period: pVal }} className="text-rw-accent hover:underline">
                      {tl("Match prep")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(teamSlug)},${encodeURIComponent(expSlug)}${pVal ? `&p=${encodeURIComponent(pVal)}` : ""}${expChamps ? `&champ=${expChamps}` : ""}`,
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")}
                    </HubLink>
                    <HubLink to={{ kind: "compare", mode: "team", a: teamSlug, b: expSlug, period: pVal }} className="text-rw-muted hover:text-rw-accent hover:underline">
                      {tl("Compare")}
                    </HubLink>
                    {expChamp && (
                      <HubLink
                        to={{
                          kind: "counters",
                          query: new URLSearchParams({
                            champ: expChamp,
                            ...(expSecChamp ? { vs: expSecChamp } : {}),
                            ...(period && /^y\d{4}$/.test(period)
                              ? { patch: period, year: period.slice(1) }
                              : period?.startsWith("e:")
                                ? { event: resolveEventSlug(period.slice(2)) }
                                : period?.startsWith("p:")
                                  ? { patch: period.slice(2) }
                                  : {}),
                          }).toString(),
                        }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {tl("Counters")}
                      </HubLink>
                    )}
                    <HubLink
                      to={{
                        kind: "items",
                        query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(expSlug)}${rosterP}${expChamp ? `&champ=${encodeURIComponent(expChamp)}` : ""}${expSecChamp ? `&vschamp=${encodeURIComponent(expSecChamp)}` : ""}${pSuffix}`,
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      {tl("Item history")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(expSlug)}${rosterP}${expChamp ? `&champ=${encodeURIComponent(expChamp)}` : ""}${expSecChamp ? `&vschamp=${encodeURIComponent(expSecChamp)}` : ""}${pSuffix}`,
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      {tl("Game finder")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        ...(expChamps || (period && period !== "all")
                          ? {
                              query: new URLSearchParams({
                                ...(expChamps ? { q: expChamps } : {}),
                                ...(period && /^y\d{4}$/.test(period)
                                  ? { key: period, year: period.slice(1) }
                                  : period?.startsWith("e:")
                                    ? { event: resolveEventSlug(period.slice(2)) }
                                    : period?.startsWith("p:")
                                      ? { key: `p${period.slice(2)}`, patch: period.slice(2) }
                                      : {}),
                              }).toString(),
                            }
                          : {}),
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        query: new URLSearchParams({
                          q: `${teamSlug},${expSlug}`,
                        }).toString(),
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(period && /^y\d{4}$/.test(period)
                            ? { year: period.slice(1) }
                            : period?.startsWith("e:")
                              ? { event: resolveEventSlug(period.slice(2)) }
                              : {}),
                          ...(expChamp ? { champ: expChamp } : {}),
                          q: [teamSlug, expSlug, ...(rosterSlugs || [])].filter(Boolean).join(","),
                        }).toString(),
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")}
                    </HubLink>
                  </>
                );
              })()}
              <button type="button" onClick={() => setSelectedOpp(null)} className="text-rw-muted hover:text-rw-accent">
                {tl("Close")}
              </button>
            </span>
          </div>
          <ul className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {expanded.games.map((g, idx) => {
              const won = g[7] === 1;
              return (
                <li key={`${g[1]}-${idx}`} className="flex items-center justify-between gap-2 py-0.5 border-t border-rw-border/50">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-3.5 shrink-0 font-bold ${won ? "text-rw-teal" : "text-rw-red"}`}>
                      {won ? tc("short result", "W") : tc("short result", "L")}
                    </span>
                    <HubLink
                      to={{ kind: "finder", query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(resolveOppSlug(expanded.opp, expanded.u))}${rosterP}&side=${g[6]}${pSuffix}` }}
                      className={`text-[10px] font-bold shrink-0 hover:underline ${g[6] === "b" ? "text-[#4a9eff]" : "text-rw-red"}`}
                    >
                      {g[6] === "b" ? tl("Blue") : tl("Red")}
                    </HubLink>
                    <span className="inline-flex items-center gap-0.5 shrink-0">
                      {(g[20] || []).slice(0, 5).map((ch) => {
                        const chSlug = resolveChampSlug(ch);
                        const otherCh = (g[20] || []).find((x) => x && resolveChampSlug(x) !== chSlug);
                        return (
                          <HubLink
                            key={ch}
                            to={{
                              kind: "champ",
                              slug: chSlug,
                              query: new URLSearchParams({
                                team: teamSlug,
                                vs: resolveOppSlug(expanded.opp, expanded.u),
                                ...(rosterSlugs?.[0] ? { player: rosterSlugs[0] } : {}),
                                ...(otherCh ? { vschamp: resolveChampSlug(otherCh) } : {}),
                                ...(pVal
                                  ? { p: pVal }
                                  : g[2]
                                    ? { p: `e:${resolveEventSlug(g[2])}` }
                                    : g[0]?.slice(0, 4)
                                      ? { p: `y${g[0].slice(0, 4)}` }
                                      : {}),
                              }).toString(),
                            }}
                            title={champName(ch)}
                          >
                            <ChampIcon name={ch} size={15} />
                          </HubLink>
                        );
                      })}
                    </span>
                    {g[9] != null && g[10] != null &&
                      (g[1] ? (
                        <HubLink to={{ kind: "match", slug: g[1] }} className="tabular-nums text-rw-sub hover:text-rw-accent hover:underline shrink-0">
                          {g[9]}–{g[10]}
                        </HubLink>
                      ) : (
                        <span className="tabular-nums text-rw-sub shrink-0">
                          {g[9]}–{g[10]}
                        </span>
                      ))}
                    <EventLink
                      name={g[3]}
                      u={g[2]}
                      query={`q=${encodeURIComponent([teamSlug, resolveOppSlug(expanded.opp, expanded.u), rosterSlugs?.[0]].filter(Boolean).join(","))}${g[20]?.[0] ? `&champ=${encodeURIComponent(resolveChampSlug(g[20][0]))}` : ""}`}
                      className="text-rw-muted hover:text-rw-accent hover:underline truncate"
                    />
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-rw-muted tabular-nums">
                    {g[1] ? (
                      <HubLink to={{ kind: "match", slug: g[1] }} className="hover:text-rw-accent hover:underline">
                        {fmtDate(g[0], true)}
                      </HubLink>
                    ) : (
                      <span>{fmtDate(g[0], true)}</span>
                    )}
                    {g[1] && (
                      <HubLink to={{ kind: "match", slug: g[1] }} className="text-rw-accent hover:underline">
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
              const oppSlug = resolveOppSlug(o.opp, o.u);
              const rowPickCounts = new Map<string, number>();
              for (const g of o.games) {
                for (const c of g[20] || []) {
                  const cs = c ? resolveChampSlug(c) : "";
                  if (cs) rowPickCounts.set(cs, (rowPickCounts.get(cs) || 0) + 1);
                }
              }
              const rowSortedPicks = [...rowPickCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
              const rowC0 = rowSortedPicks[0];
              const rowC1 = rowSortedPicks.find((c) => c !== rowC0);
              const rowChamps = [rowC0, rowC1].filter(Boolean).join(",");
              const rowFinderQuery = `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(oppSlug)}${rosterP}${rowC0 ? `&champ=${encodeURIComponent(rowC0)}` : ""}${rowC1 ? `&vschamp=${encodeURIComponent(rowC1)}` : ""}${pSuffix}`;
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
                      <HubLink
                        to={{
                          kind: "team",
                          slug: oppSlug,
                          query: new URLSearchParams({
                            ...(pVal ? { p: pVal } : {}),
                            ...(rowC0 ? { champ: rowC0 } : {}),
                            q: [teamSlug, rosterSlugs?.[0]].filter(Boolean).join(","),
                          }).toString(),
                        }}
                        className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent"
                      >
                        <TeamLogo name={o.opp} size={18} />
                      </HubLink>
                      <TeamLink
                        name={o.opp}
                        u={o.u}
                        query={new URLSearchParams({
                          ...(pVal ? { p: pVal } : {}),
                          ...(rowC0 ? { champ: rowC0 } : {}),
                          q: [teamSlug, rosterSlugs?.[0]].filter(Boolean).join(","),
                        }).toString()}
                      />
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
                        <HubLink
                          to={{ kind: "finder", query: rowFinderQuery }}
                          className="font-semibold text-rw-text hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>
                            {o.g}{" "}
                            <span className="text-[11px] font-normal text-rw-muted">
                              ({o.w}–{o.g - o.w})
                            </span>
                          </span>
                        </HubLink>
                      </span>
                    </span>
                  </td>
                  <td className={td} data-sort={o.g ? o.w / o.g : -1}>
                    <HubLink
                      to={{ kind: "finder", query: rowFinderQuery }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      <span onClick={(e) => e.stopPropagation()}>
                        <WinBar w={o.w} g={o.g} />
                      </span>
                    </HubLink>
                  </td>
                  {hasGd15 && (
                    <td className={`${td} tabular-nums`} data-sort={o.gd15 ?? -99999}>
                      {o.gd15 != null ? (
                        <HubLink
                          to={{ kind: "finder", query: rowFinderQuery }}
                          className={`hover:underline ${o.gd15 >= 0 ? "text-rw-teal font-semibold" : "text-rw-red"}`}
                          title={tl("Game finder")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>{o.gd15 > 0 ? `+${fmtNum(o.gd15)}` : fmtNum(o.gd15)}</span>
                        </HubLink>
                      ) : (
                        <span className="text-rw-muted">–</span>
                      )}
                    </td>
                  )}
                  <td className={`${td} text-rw-muted tabular-nums`} data-sort={o.last || ""}>
                    <HubLink
                      to={{ kind: "finder", query: rowFinderQuery }}
                      className="hover:text-rw-accent hover:underline"
                      title={tl("Game finder")}
                    >
                      <span onClick={(e) => e.stopPropagation()}>{fmtDate(o.last)}</span>
                    </HubLink>
                  </td>
                  {teamName && (
                    <td className={`${td} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-2 text-[10px]">
                        <HubLink
                          to={{ kind: "prep", a: teamSlug, b: oppSlug, period: pVal }}
                          className="text-rw-accent hover:underline"
                          title={tl("Match prep")}
                        >
                          {tl("Match prep")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "draft", query: `teams=${encodeURIComponent(teamSlug)},${encodeURIComponent(oppSlug)}${pVal ? `&p=${encodeURIComponent(pVal)}` : ""}${rowChamps ? `&champ=${encodeURIComponent(rowChamps)}` : ""}` }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Draft board")}
                        >
                          {tl("Draft board")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "compare", mode: "team", a: teamSlug, b: oppSlug, period: pVal }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Compare")}
                        >
                          {tl("Compare")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "rankings", query: `q=${encodeURIComponent(`${teamSlug},${oppSlug}`)}` }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Power rankings")}
                        >
                          {tl("Power rankings")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "items", query: `team=${encodeURIComponent(teamSlug)}&vs=${encodeURIComponent(oppSlug)}${rosterP}${rowC0 ? `&champ=${encodeURIComponent(rowC0)}` : ""}${rowC1 ? `&vschamp=${encodeURIComponent(rowC1)}` : ""}${pSuffix}` }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Item history")}
                        >
                          {tl("Item history")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "finder", query: rowFinderQuery }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {tl("Game finder")}
                        </HubLink>
                      </span>
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
