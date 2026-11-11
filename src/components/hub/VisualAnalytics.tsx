/**
 * Visual analytics cards for Player and Team Overview tabs:
 *  - PlayerPlaystyleOverview: role-contextualized 6-metric visual DNA bars + automatic playstyle tags + 20-game rolling form SVG chart
 *  - SignatureChampsGrid: visual mastery cards with circular SVG win-rate rings for a player's signature champions
 *  - TeamFormAndSideCard: rolling series form trajectory SVG + Blue vs Red side & objective control breakdown
 */
import React, { useEffect, useId, useMemo, useState } from "react";
import { tl, tc, roleName, fmtDec, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadPlayerGames, loadPlayerGames2y, prettySlug, resolveChampSlug, resolveEventSlug, resolveLeagueSlug, resolveTeamAlias } from "../../hub/data";
import type { HubChamp, HubPlayer, HubTeam, PlayerGameRow, PlayerTimeline } from "../../hub/types";
import { playerAgg, type PlayerAgg } from "../../hub/period";
import { playerRowLine, rateLine } from "../../hub/playerRating";
import { fmtRating, useRatingFile } from "./PlayerRating";
import { SectionCard } from "./BroadcastCard";
import { KdaBar } from "./OpponentChart";
import {
  ChampIcon,
  EventLink,
  fmtDate,
  fmtNum,
  HubLink,
  isFresh,
  RevealButton,
  Section,
  TeamLink,
  TeamLogo,
  useHidden,
} from "./ui";
import { smoothPath, useWidth } from "../../useWidth";

const clamp = (v: number, lo = 6, hi = 96) => Math.max(lo, Math.min(hi, v));
const signed = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`);
const pct = (v: number | null | undefined) => (v == null ? "–" : `${fmtDec(v)}%`);
const teamSlug = (name?: string | null, u?: string | null): string =>
  u || (name ? resolveTeamAlias(name) : null) || prettySlug(name || "");

/** Role-aware playstyle tags derived from a player's aggregated stats and Oracle's Elixir timeline. */
export function playerPlaystyleTags(agg: PlayerAgg, role: string, careerChamps: number): { tag: string; why: string; good?: boolean }[] {
  if (agg.g < 8) return [];
  const out: { tag: string; why: string; good?: boolean }[] = [];
  const r = role.toLowerCase();
  const isSup = r.startsWith("sup");
  const isJng = r.startsWith("jun") || r === "jng";

  if (agg.tl && agg.tl.n >= 5 && agg.tl.gd15 != null) {
    const thresh = isSup ? 220 : 350;
    if (agg.tl.gd15 >= thresh) {
      out.push({
        tag: tl("Strong early game"),
        why: tl("{n} gold ahead at 15 minutes on average", { n: `+${fmtNum(agg.tl.gd15)}` }),
        good: true,
      });
    } else if (agg.tl.gd15 <= -thresh) {
      out.push({
        tag: tl("Slow starters"),
        why: tl("{n} gold behind at 15 minutes on average", { n: fmtNum(-agg.tl.gd15) }),
        good: false,
      });
    }
  }

  if (agg.dmgShare != null) {
    const carryThresh = isSup ? 12 : isJng ? 19 : 26.5;
    if (agg.dmgShare >= carryThresh) {
      out.push({
        tag: tl("Damage / min"),
        why: `${tl("{p} of team damage", { p: `${fmtDec(agg.dmgShare)}%` })}${agg.dpm != null ? ` · ${fmtNum(agg.dpm)} ${tl("DPM")}` : ""}`,
        good: true,
      });
    }
  }

  if (agg.kp != null && agg.kp >= (isSup || isJng ? 74 : 68)) {
    out.push({
      tag: tl("Kill participation"),
      why: `${fmtDec(agg.kp)}% KP`,
      good: true,
    });
  }

  const dpg = agg.g > 0 ? agg.d / agg.g : 99;
  if (dpg <= (isSup ? 2.2 : 1.85) && agg.kda >= 4.2) {
    out.push({
      tag: tl("KDA"),
      why: `KDA ${fmtN(agg.kda)} · ${fmtDec(dpg, 1)} D/G`,
      good: true,
    });
  }

  if (agg.tl?.fbPart != null && agg.tl.fbPart >= 32) {
    out.push({
      tag: tl("First blood"),
      why: `${fmtDec(agg.tl.fbPart)}%`,
      good: true,
    });
  }

  if (agg.champs.length >= 14 || careerChamps >= 55) {
    out.push({
      tag: tl("Champions"),
      why: tl("{n} champions played", { n: Math.max(agg.champs.length, careerChamps) }),
      good: true,
    });
  }

  return out.slice(0, 5);
}

/** Shared hook to load a player's 2-year or full game log once on the Overview tab. */
export function usePlayerOverviewRows(slug: string, has2y: boolean): PlayerGameRow[] | null {
  const [rows, setRows] = useState<PlayerGameRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    const load = has2y ? loadPlayerGames2y(slug) : loadPlayerGames(slug);
    load
      .catch(() => (has2y ? loadPlayerGames(slug).catch(() => [] as PlayerGameRow[]) : ([] as PlayerGameRow[])))
      .then((res) => {
        if (alive) setRows(res);
      });
    return () => {
      alive = false;
    };
  }, [slug, has2y]);
  return rows;
}

/** Player Playstyle DNA & Role Benchmarks + Rolling 20-Game Form Trajectory on the Player Overview tab. */
export const PlayerVisualOverview: React.FC<{ p: HubPlayer; cardSub?: string }> = ({ p, cardSub }) => {
  const rows = usePlayerOverviewRows(p.u, !!p.g2y);
  const { periodRows, periodLabel, periodKey } = useMemo(() => {
    if (!rows || !rows.length) return { periodRows: [] as PlayerGameRow[], periodLabel: "", periodKey: undefined as string | undefined };
    const latestYear = p.years[p.years.length - 1]?.y;
    if (latestYear) {
      const yRows = rows.filter((r) => r[0].startsWith(latestYear));
      if (yRows.length >= 10) return { periodRows: yRows, periodLabel: `${latestYear} · ${yRows.length}G`, periodKey: `y${latestYear}` };
    }
    const recent = rows.slice(0, 50);
    return { periodRows: recent, periodLabel: `${recent.length}G`, periodKey: undefined as string | undefined };
  }, [rows, p.years]);

  const agg = useMemo(() => (periodRows.length ? playerAgg(periodRows) : null), [periodRows]);
  const tags = useMemo(() => (agg ? playerPlaystyleTags(agg, p.role, p.nChamps) : []), [agg, p.role, p.nChamps]);
  const fresh = periodRows.map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`player-visual:${p.u}`, fresh);

  if (!rows || !rows.length || !agg || agg.g < 5) return null;

  const r = p.role.toLowerCase();
  const isSup = r.startsWith("sup");
  const isJng = r.startsWith("jun") || r === "jng";
  const dpg = agg.g ? agg.d / agg.g : 0;
  const kpg = agg.g ? agg.k / agg.g : 0;
  const apg = agg.g ? agg.a / agg.g : 0;
  const eff = agg.dmgShare != null && agg.goldShare != null ? Math.round((agg.dmgShare - agg.goldShare) * 10) / 10 : null;

  const metrics: { label: string; value: string; sub?: string; pct: number; good?: boolean; tab: "stats" | "matches" | "champions" }[] = [
    {
      label: tl("KDA"),
      value: fmtN(agg.kda),
      sub: `${fmtDec(kpg, 1)} / ${fmtDec(dpg, 1)} / ${fmtDec(apg, 1)}`,
      pct: clamp((agg.kda / 6.5) * 100),
      good: agg.kda >= 4.0 ? true : agg.kda < 2.5 ? false : undefined,
      tab: "stats",
    },
    {
      label: tl("Kill participation"),
      value: pct(agg.kp),
      sub: `${tl("{p} win rate", { p: winRate(agg.w, agg.g) })} (${agg.w}-${agg.g - agg.w})`,
      pct: agg.kp != null ? clamp(((agg.kp - 40) / 45) * 100) : 50,
      good: agg.kp != null ? (agg.kp >= (isSup || isJng ? 70 : 64) ? true : agg.kp < 52 ? false : undefined) : undefined,
      tab: "matches",
    },
    {
      label: tl("Damage share"),
      value: agg.dmgShare != null ? pct(agg.dmgShare) : agg.dpm != null ? `${fmtNum(agg.dpm)} DPM` : "–",
      sub: [
        agg.dpm != null ? `${fmtNum(agg.dpm)} ${tl("DPM")}` : null,
        eff != null ? `${tl("DMG% − Gold%")} ${signed(eff)}%` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
      pct:
        agg.dmgShare != null
          ? clamp((agg.dmgShare / (isSup ? 16 : isJng ? 24 : 34)) * 100)
          : agg.dpm != null
            ? clamp((agg.dpm / 850) * 100)
            : 50,
      good:
        agg.dmgShare != null
          ? agg.dmgShare >= (isSup ? 10 : isJng ? 17 : 25)
            ? true
            : undefined
          : undefined,
      tab: "stats",
    },
    {
      label: "GD@15",
      value: agg.tl?.gd15 != null ? signed(agg.tl.gd15) : "–",
      sub:
        agg.tl && (agg.tl.csd15 != null || agg.tl.xpd15 != null)
          ? `CS ${signed(agg.tl.csd15)} · XP ${signed(agg.tl.xpd15)}`
          : tl("Average lead over the lane opponent at 15 minutes"),
      pct: agg.tl?.gd15 != null ? clamp(((agg.tl.gd15 + 1000) / 2000) * 100) : 50,
      good: agg.tl?.gd15 != null ? (agg.tl.gd15 >= 150 ? true : agg.tl.gd15 <= -250 ? false : undefined) : undefined,
      tab: "stats",
    },
    {
      label: isSup ? tl("VS / min") : tl("CS / min"),
      value: isSup
        ? agg.vsm != null
          ? fmtDec(agg.vsm, 2)
          : "–"
        : agg.csm != null
          ? fmtN(agg.csm)
          : "–",
      sub: isSup
        ? [agg.visShare != null ? tl("{p} of team vision", { p: pct(agg.visShare) }) : null, agg.tl?.cw != null ? `${fmtDec(agg.tl.cw, 1)} ${tl("Control wards")}` : null]
            .filter(Boolean)
            .join(" · ") || undefined
        : [agg.gpm != null ? `${fmtNum(agg.gpm)} ${tl("Gold / min")}` : null, agg.goldShare != null ? `${pct(agg.goldShare)} ${tl("Gold%")}` : null]
            .filter(Boolean)
            .join(" · ") || undefined,
      pct: isSup
        ? agg.vsm != null
          ? clamp((agg.vsm / 3.6) * 100)
          : 50
        : agg.csm != null
          ? clamp(((agg.csm - (isJng ? 4.5 : 6.0)) / (isJng ? 3.5 : 4.2)) * 100)
          : 50,
      good: isSup
        ? agg.vsm != null && agg.vsm >= 2.6
          ? true
          : undefined
        : agg.csm != null && agg.csm >= (isJng ? 6.5 : 8.6)
          ? true
          : undefined,
      tab: "stats",
    },
    {
      label: agg.tl?.fbPart != null ? tl("First blood") : tl("Champions"),
      value: agg.tl?.fbPart != null ? pct(agg.tl.fbPart) : String(agg.champs.length),
      sub:
        agg.tl?.fbPart != null
          ? tl("{n} champions played", { n: agg.champs.length })
          : `${tl("Career")} ${p.nChamps}`,
      pct: agg.tl?.fbPart != null ? clamp((agg.tl.fbPart / 55) * 100) : clamp((agg.champs.length / 18) * 100),
      good: agg.tl?.fbPart != null ? (agg.tl.fbPart >= 28 ? true : undefined) : agg.champs.length >= 10 ? true : undefined,
      tab: "champions",
    },
  ];

  return (
    <>
      <div className="rw-span">
        <Section
          title={`${tl("Playstyle")} · ${tl("Early game")}`}
          share={`${p.u}-playstyle`}
          right={
            hidden ? (
              <RevealButton onReveal={reveal} small />
            ) : (
              <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
                <HubLink
                  to={{ kind: "player", slug: p.u, tab: "stats", ...(periodKey ? { query: `p=${encodeURIComponent(periodKey)}` } : {}) }}
                  className="text-rw-muted hover:text-rw-accent hover:underline font-mono"
                >
                  {periodLabel}
                </HubLink>
                <HubLink
                  to={{ kind: "player", slug: p.u, tab: "stats", ...(periodKey ? { query: `p=${encodeURIComponent(periodKey)}` } : {}) }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Stats")} · {tl("Open →")}
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "player", a: p.u, period: periodKey }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `player=${encodeURIComponent(p.u)}${periodKey?.startsWith("y") ? `&year=${encodeURIComponent(periodKey.slice(1))}` : ""}`,
                  }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: `player=${encodeURIComponent(p.u)}${agg.champs[0] ? `&champ=${encodeURIComponent(resolveChampSlug(agg.champs[0].c))}` : ""}${periodKey?.startsWith("y") ? `&year=${encodeURIComponent(periodKey.slice(1))}` : ""}`,
                  }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Item history")} →
                </HubLink>
                {p.club && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: teamSlug(p.club, p.clubU),
                        ...(periodKey ? { period: periodKey } : {}),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          teams: teamSlug(p.club, p.clubU),
                          ...(periodKey ? { p: periodKey } : {}),
                          ...(p.role ? { role: p.role } : {}),
                          ...(agg.champs[0] ? { champ: resolveChampSlug(agg.champs[0].c) } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(periodKey?.startsWith("y") ? { year: periodKey.slice(1) } : {}),
                      ...(p.role ? { role: p.role } : {}),
                      ...(agg.champs[0] ? { champ: resolveChampSlug(agg.champs[0].c) } : {}),
                      q: p.u,
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(p.role || agg.champs[0] || periodKey?.startsWith("y")
                      ? {
                          query: new URLSearchParams({
                            ...(p.role ? { role: p.role } : {}),
                            ...(agg.champs[0] ? { q: resolveChampSlug(agg.champs[0].c) } : {}),
                            ...(periodKey?.startsWith("y") ? { key: periodKey } : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={
                    agg.champs[0]
                      ? {
                          kind: "counters",
                          query: `champ=${encodeURIComponent(resolveChampSlug(agg.champs[0].c))}${p.role ? `&role=${encodeURIComponent(p.role)}` : ""}`,
                        }
                      : { kind: "counters", ...(p.role ? { query: `role=${encodeURIComponent(p.role)}` } : {}) }
                  }
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    ...(p.club ? { query: `q=${encodeURIComponent(teamSlug(p.club, p.clubU))}` } : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <SectionCard
                  section={`${tl("Playstyle")} · ${periodLabel}`}
                  name={p.name}
                  sub={cardSub}
                  rows={() =>
                    [
                      ...tags.map((x) => ({ team: p.club || undefined, label: x.tag, sub: x.why, win: x.good })),
                      ...metrics.map((m) => ({ team: p.club || undefined, label: m.label, sub: m.sub, value: m.value, win: m.good })),
                    ].map((r, idx) => ({ ...r, rank: idx + 1 }))
                  }
                />
              </span>
            )
          }
        >
          {hidden ? (
            <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <div className="space-y-2.5">
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((x) => (
                    <HubLink
                      key={x.tag}
                      to={{ kind: "player", slug: p.u, tab: "stats" }}
                      title={x.why}
                      className={`px-2.5 py-1 rounded-full border text-[11px] hover:border-rw-accent/60 transition-colors ${
                        x.good === true
                          ? "border-rw-teal/60 bg-rw-teal/10 text-rw-teal"
                          : x.good === false
                            ? "border-rw-red/60 bg-rw-red/10 text-rw-red"
                            : "border-rw-border bg-rw-bg/60 text-rw-sub"
                      }`}
                    >
                      <span className="font-semibold">{x.tag}</span> <span className="text-rw-muted">· {x.why}</span>
                    </HubLink>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {metrics.map((m) => (
                  <HubLink
                    key={m.label}
                    to={{ kind: "player", slug: p.u, tab: m.tab }}
                    className="rounded-lg border border-rw-border bg-rw-bg/50 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-2.5 py-2 flex flex-col justify-between gap-1.5 transition-colors"
                  >
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted truncate">{m.label}</div>
                      <div
                        className={`mt-0.5 text-sm font-bold font-mono tabular-nums ${
                          m.good === true ? "text-rw-teal" : m.good === false ? "text-rw-red" : "text-rw-text"
                        }`}
                      >
                        {m.value}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="h-1.5 rounded-full bg-rw-raised overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            m.good === true ? "bg-rw-teal" : m.good === false ? "bg-rw-red/80" : "bg-rw-accent"
                          }`}
                          style={{ width: `${Math.round(m.pct)}%` }}
                        />
                      </div>
                      {m.sub && (
                        <div className="text-[10px] text-rw-muted truncate" title={m.sub}>
                          {m.sub}
                        </div>
                      )}
                    </div>
                  </HubLink>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      <div className="rw-span">
        <PlayerFormChart p={p} rows={rows} cardSub={cardSub} />
      </div>
    </>
  );
};

type FormMetric = "rating" | "kda" | "gd15";

/** Interactive 20-game rolling form & rating trajectory chart on the Player Overview tab. */
const PlayerFormChart: React.FC<{ p: HubPlayer; rows: PlayerGameRow[]; cardSub?: string }> = ({ p, rows, cardSub }) => {
  const ratingFile = useRatingFile();
  const [metric, setMetric] = useState<FormMetric>("rating");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>();
  const gradId = useId().replace(/[^a-z0-9]/gi, "");

  const recent20 = useMemo(() => rows.slice(0, 20).reverse(), [rows]);
  const fresh = recent20.map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`player-form:${p.u}`, fresh);

  const points = useMemo(() => {
    return recent20.map((r) => {
      const rt = r[23] != null ? r[23] : ratingFile ? rateLine(playerRowLine(r), ratingFile) : null;
      const kda = Number(((r[3] + r[5]) / Math.max(1, r[4])).toFixed(2));
      const tlRow = r[21] as PlayerTimeline | null | undefined;
      const gd15 = tlRow && tlRow[3] != null ? tlRow[3] : null;
      return {
        row: r,
        date: r[0],
        seriesSlug: r[1],
        champ: r[2],
        k: r[3],
        d: r[4],
        a: r[5],
        won: r[6] === 1,
        team: r[7],
        opp: r[8],
        event: r[9],
        gn: r[22],
        rating: rt,
        kda,
        gd15,
      };
    });
  }, [recent20, ratingFile, p.role]);

  const hasRating = points.filter((x) => x.rating != null).length >= 5;
  const hasGd15 = points.filter((x) => x.gd15 != null).length >= 5;
  const activeMetric: FormMetric =
    metric === "rating" && !hasRating ? "kda" : metric === "gd15" && !hasGd15 ? (hasRating ? "rating" : "kda") : metric;

  if (points.length < 5) return null;

  const valOf = (pt: (typeof points)[number]): number | null =>
    activeMetric === "rating" ? pt.rating : activeMetric === "gd15" ? pt.gd15 : pt.kda;

  const validVals = points.map(valOf).filter((v): v is number => v != null);
  if (validVals.length < 4) return null;

  const minV =
    activeMetric === "rating"
      ? Math.min(3.5, ...validVals)
      : activeMetric === "gd15"
        ? Math.min(-1200, ...validVals)
        : 0;
  const maxV =
    activeMetric === "rating"
      ? Math.max(8.8, ...validVals)
      : activeMetric === "gd15"
        ? Math.max(1200, ...validVals)
        : Math.max(8, ...validVals);
  const baseLine = activeMetric === "rating" ? 6.0 : activeMetric === "gd15" ? 0 : 3.0;

  const L = 34;
  const R = 12;
  const T = 12;
  const CH = 112;
  const H = T + CH + 26;
  const pw = Math.max(W - L - R, 120);
  const step = points.length > 1 ? pw / (points.length - 1) : pw;
  const cx = (i: number) => L + (points.length > 1 ? i * step : pw / 2);
  const cy = (v: number) => T + CH * (1 - (v - minV) / Math.max(0.001, maxV - minV));

  // 5-game rolling average curve
  const rollingPts: [number, number][] = [];
  const rawPts: [number, number][] = [];
  points.forEach((pt, i) => {
    const v = valOf(pt);
    if (v != null) rawPts.push([cx(i), cy(v)]);
    const winSlice = points
      .slice(Math.max(0, i - 4), i + 1)
      .map(valOf)
      .filter((x): x is number => x != null);
    if (winSlice.length >= 2) {
      const avg = winSlice.reduce((s, x) => s + x, 0) / winSlice.length;
      rollingPts.push([cx(i), cy(avg)]);
    }
  });

  const winsCount = points.filter((x) => x.won).length;
  const avgVal = validVals.reduce((s, x) => s + x, 0) / validVals.length;
  const fmtMetric = (v: number | null) =>
    v == null ? "–" : activeMetric === "rating" ? fmtRating(v) : activeMetric === "gd15" ? signed(Math.round(v)) : fmtN(v);

  const selectedIdx = hoverIdx != null && points[hoverIdx] ? hoverIdx : points.length - 1;
  const sel = points[selectedIdx];

  return (
    <Section
      title={`${tl("Form over time")} · ${tl("Last {n} games", { n: points.length })}`}
      share={`${p.u}-form`}
      right={
        hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <span className="flex flex-wrap items-center gap-1.5 text-[11px]" data-nocapture="1">
            {(
              [
                hasRating ? ["rating", tl("Rating")] : null,
                ["kda", tl("KDA")],
                hasGd15 ? ["gd15", "GD@15"] : null,
              ].filter(Boolean) as [FormMetric, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMetric(k)}
                className={`px-2 py-0.5 rounded-full border font-semibold ${
                  activeMetric === k
                    ? "bg-rw-accent text-rw-bg border-rw-accent"
                    : "border-rw-border text-rw-sub hover:text-rw-text"
                }`}
              >
                {label}
              </button>
            ))}
            <HubLink
              to={{
                kind: "compare",
                mode: "player",
                a: p.u,
                ...(sel?.date && /^\d{4}/.test(sel.date) ? { period: `y${sel.date.slice(0, 4)}` } : {}),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Compare")} →
            </HubLink>
            {(p.club || sel?.team) && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: sel?.team ? teamSlug(sel.team) : teamSlug(p.club, p.clubU),
                    ...(sel?.opp ? { b: teamSlug(sel.opp) } : {}),
                    ...(sel?.date && /^\d{4}/.test(sel.date) ? { period: `y${sel.date.slice(0, 4)}` } : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      teams: [sel?.team ? teamSlug(sel.team) : teamSlug(p.club, p.clubU), sel?.opp ? teamSlug(sel.opp) : ""].filter(Boolean).join(","),
                      ...(sel?.date && /^\d{4}/.test(sel.date) ? { p: `y${sel.date.slice(0, 4)}` } : {}),
                      ...(p.role ? { role: p.role } : {}),
                      ...(sel?.champ ? { champ: resolveChampSlug(sel.champ) } : {}),
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
              </>
            )}
            {sel?.champ && (
              <HubLink
                to={{
                  kind: "counters",
                  query: `champ=${encodeURIComponent(resolveChampSlug(sel.champ))}${p.role ? `&role=${encodeURIComponent(p.role)}` : ""}`,
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "items",
                query: `player=${encodeURIComponent(p.u)}${sel?.champ ? `&champ=${encodeURIComponent(resolveChampSlug(sel.champ))}` : ""}${sel?.date && /^\d{4}/.test(sel.date) ? `&year=${encodeURIComponent(sel.date.slice(0, 4))}` : ""}`,
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Item history")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: `player=${encodeURIComponent(p.u)}${sel?.champ ? `&champ=${encodeURIComponent(resolveChampSlug(sel.champ))}` : ""}${sel?.date && /^\d{4}/.test(sel.date) ? `&year=${encodeURIComponent(sel.date.slice(0, 4))}` : ""}`,
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  ...(p.role ? { role: p.role } : {}),
                  ...(sel?.champ ? { champ: resolveChampSlug(sel.champ) } : {}),
                  ...(sel?.date && /^\d{4}/.test(sel.date) ? { year: sel.date.slice(0, 4) } : {}),
                  q: p.u,
                }).toString(),
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                ...(p.role || sel?.champ || (sel?.date && /^\d{4}/.test(sel.date))
                  ? {
                      query: new URLSearchParams({
                        ...(p.role ? { role: p.role } : {}),
                        ...(sel?.champ ? { q: resolveChampSlug(sel.champ) } : {}),
                        ...(sel?.date && /^\d{4}/.test(sel.date) ? { key: `y${sel.date.slice(0, 4)}` } : {}),
                      }).toString(),
                    }
                  : {}),
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  q: [sel?.team ? teamSlug(sel.team) : p.club ? teamSlug(p.club, p.clubU) : "", sel?.opp ? teamSlug(sel.opp) : ""].filter(Boolean).join(","),
                }).toString(),
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            <SectionCard
              section={`${tl("Recent games")} (${points.length}G)`}
              name={p.name}
              sub={`${winsCount}-${points.length - winsCount} (${winRate(winsCount, points.length)}) · ${
                activeMetric === "rating" ? tl("Rating") : activeMetric === "gd15" ? "GD@15" : tl("KDA")
              } ${fmtMetric(avgVal)}`}
              rows={() =>
                [...points]
                  .reverse()
                  .slice(0, 10)
                  .map((pt, idx) => ({
                    rank: idx + 1,
                    champ: pt.champ,
                    team: pt.team || pt.opp,
                    win: pt.won,
                    label: `${champName(pt.champ)} vs ${pt.opp}`,
                    sub: `${pt.k}/${pt.d}/${pt.a} · ${pt.event}`,
                    value: fmtMetric(valOf(pt)),
                  }))
              }
            />
          </span>
        )
      }
    >
      {hidden ? (
        <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <HubLink
                to={{ kind: "player", slug: p.u, tab: "matches" }}
                className="font-semibold text-rw-text tabular-nums hover:text-rw-accent hover:underline"
              >
                {winsCount}W – {points.length - winsCount}L{" "}
                <span className="text-rw-sub">({winRate(winsCount, points.length)})</span>
              </HubLink>
              <span className="text-rw-sub tabular-nums">
                {activeMetric === "rating" ? tl("Rating") : activeMetric === "gd15" ? "GD@15" : tl("KDA")}:{" "}
                <HubLink
                  to={{ kind: "player", slug: p.u, tab: "stats" }}
                  className="font-bold text-rw-accent hover:underline"
                >
                  {fmtMetric(avgVal)}
                </HubLink>
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-rw-muted">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rw-teal inline-block" /> {tc("short result", "W")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rw-red inline-block" /> {tc("short result", "L")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-0.5 bg-rw-accent inline-block rounded" /> 5G avg
              </span>
            </div>
          </div>

          <div ref={box} className="relative select-none">
            <svg
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className="block w-full touch-pan-y"
              role="img"
              aria-label={tl("Form over time")}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const idx = Math.round((e.clientX - rect.left - L) / Math.max(1, step));
                setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
              }}
              onPointerLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id={`${gradId}-fill`} gradientUnits="userSpaceOnUse" x1={0} y1={T} x2={0} y2={T + CH}>
                  <stop offset="0" style={{ stopColor: "var(--rw-accent)", stopOpacity: 0.24 }} />
                  <stop offset="1" style={{ stopColor: "var(--rw-accent)", stopOpacity: 0.0 }} />
                </linearGradient>
              </defs>

              {/* Horizontal reference lines */}
              {[minV, baseLine, maxV].map((v, idx) => (
                <g key={idx}>
                  <line
                    x1={L}
                    x2={L + pw}
                    y1={cy(v)}
                    y2={cy(v)}
                    strokeDasharray={v === baseLine ? "3 3" : undefined}
                    style={{ stroke: v === baseLine ? "var(--rw-line)" : "var(--rw-border)" }}
                    strokeWidth={1}
                  />
                  <text
                    x={L - 5}
                    y={cy(v) + 3}
                    textAnchor="end"
                    className="font-num"
                    style={{ fill: "var(--rw-muted)", fontSize: 9 }}
                  >
                    {fmtMetric(v)}
                  </text>
                </g>
              ))}

              {/* Area and faint game-to-game line */}
              {rawPts.length > 1 && (
                <>
                  <path
                    d={`${smoothPath(rawPts)} L${rawPts[rawPts.length - 1][0].toFixed(1)},${T + CH} L${rawPts[0][0].toFixed(1)},${T + CH} Z`}
                    style={{ fill: `url(#${gradId}-fill)` }}
                  />
                  <path
                    d={smoothPath(rawPts)}
                    fill="none"
                    style={{ stroke: "var(--rw-sub)", strokeOpacity: 0.45 }}
                    strokeWidth={1.25}
                  />
                </>
              )}

              {/* 5-game rolling average curve */}
              {rollingPts.length > 1 && (
                <path
                  d={smoothPath(rollingPts)}
                  fill="none"
                  style={{ stroke: "var(--rw-accent)" }}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                />
              )}

              {/* Active vertical guide */}
              {sel && valOf(sel) != null && (
                <line
                  x1={cx(selectedIdx)}
                  x2={cx(selectedIdx)}
                  y1={T}
                  y2={T + CH}
                  style={{ stroke: "var(--rw-accent)", strokeOpacity: 0.5 }}
                  strokeWidth={1}
                />
              )}

              {/* Game nodes */}
              {points.map((pt, i) => {
                const v = valOf(pt);
                if (v == null) return null;
                const active = i === selectedIdx;
                return (
                  <circle
                    key={i}
                    cx={cx(i)}
                    cy={cy(v)}
                    r={active ? 5 : 3.5}
                    style={{
                      fill: pt.won ? "var(--rw-teal)" : "var(--rw-red)",
                      stroke: active ? "var(--rw-text)" : "var(--rw-surface)",
                    }}
                    strokeWidth={active ? 2 : 1.5}
                  />
                );
              })}

              {/* Date endpoints */}
              <text x={L} y={H - 4} textAnchor="start" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
                {points[0]?.date}
              </text>
              <text x={L + pw} y={H - 4} textAnchor="end" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
                {points[points.length - 1]?.date}
              </text>
            </svg>
          </div>

          {/* Champion strip along the 20 games */}
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
            {points.map((pt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHoverIdx(i)}
                onMouseEnter={() => setHoverIdx(i)}
                title={`${pt.won ? "W" : "L"} · ${champName(pt.champ)} (${pt.k}/${pt.d}/${pt.a}) vs ${pt.opp}`}
                className={`flex flex-col items-center py-1 rounded border transition-colors ${
                  i === selectedIdx
                    ? "border-rw-accent bg-rw-accent/15"
                    : pt.won
                      ? "border-rw-teal/30 bg-rw-teal/5 hover:border-rw-teal/60"
                      : "border-rw-red/30 bg-rw-red/5 hover:border-rw-red/60"
                }`}
              >
                <ChampIcon name={pt.champ} size={16} />
                <span className={`mt-0.5 text-[9px] font-bold tabular-nums leading-none ${pt.won ? "text-rw-teal" : "text-rw-red"}`}>
                  {pt.won ? tc("short result", "W") : tc("short result", "L")}
                </span>
              </button>
            ))}
          </div>

          {/* Selected game detail bar */}
          {sel && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rw-border bg-rw-bg/60 px-3 py-1.5 text-xs">
              <span className="flex flex-wrap items-center gap-2 min-w-0">
                <span className={`font-bold ${sel.won ? "text-rw-teal" : "text-rw-red"}`}>
                  {sel.won ? tc("short result", "W") : tc("short result", "L")}
                </span>
                <HubLink
                  to={{ kind: "champ", slug: resolveChampSlug(sel.champ) }}
                  className="inline-flex items-center gap-1.5 font-semibold text-rw-text hover:text-rw-accent hover:underline"
                >
                  <ChampIcon name={sel.champ} size={18} />
                  <span>{champName(sel.champ)}</span>
                </HubLink>
                {sel.seriesSlug ? (
                  <HubLink
                    to={{ kind: "match", slug: sel.seriesSlug, game: sel.gn }}
                    className="font-mono font-bold text-rw-text hover:text-rw-accent hover:underline tabular-nums"
                  >
                    {sel.k}/{sel.d}/{sel.a}
                  </HubLink>
                ) : (
                  <span className="font-mono font-bold text-rw-text tabular-nums">
                    {sel.k}/{sel.d}/{sel.a}
                  </span>
                )}
                  {sel.rating != null && (
                    sel.seriesSlug ? (
                      <HubLink
                        to={{ kind: "match", slug: sel.seriesSlug, game: sel.gn }}
                        className="text-rw-teal font-mono font-semibold tabular-nums hover:underline"
                        title={tl("Game rating")}
                      >
                        ★ {fmtRating(sel.rating)}
                      </HubLink>
                    ) : (
                      <span className="text-rw-teal font-mono font-semibold tabular-nums">
                        ★ {fmtRating(sel.rating)}
                      </span>
                    )
                  )}
                  {sel.gd15 != null &&
                    (sel.seriesSlug ? (
                      <HubLink
                        to={{ kind: "match", slug: sel.seriesSlug, game: sel.gn }}
                        className={`font-mono text-[11px] tabular-nums hover:underline ${sel.gd15 >= 0 ? "text-rw-teal" : "text-rw-red"}`}
                      >
                        GD@15 {signed(sel.gd15)}
                      </HubLink>
                    ) : (
                      <span className={`font-mono text-[11px] tabular-nums ${sel.gd15 >= 0 ? "text-rw-teal" : "text-rw-red"}`}>
                        GD@15 {signed(sel.gd15)}
                      </span>
                    ))}
                  <span className="inline-flex items-center gap-1.5 text-rw-sub truncate">
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `player=${encodeURIComponent(p.u)}&vs=${encodeURIComponent(teamSlug(sel.opp))}${
                          sel.date && sel.date.length >= 4 ? `&year=${encodeURIComponent(sel.date.slice(0, 4))}` : ""
                        }`,
                      }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      vs
                    </HubLink>
                  <HubLink to={{ kind: "team", slug: teamSlug(sel.opp) }} className="shrink-0">
                    <TeamLogo name={sel.opp} sizeClass="w-3.5 h-3.5" />
                  </HubLink>
                  <TeamLink name={sel.opp} u={teamSlug(sel.opp)} />
                  <span className="text-rw-muted">·</span>
                  <EventLink name={sel.event} u={sel.row[11]} className="text-rw-sub hover:text-rw-accent hover:underline truncate" />
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${encodeURIComponent(resolveChampSlug(sel.champ))}${p.role ? `&role=${encodeURIComponent(p.role)}` : ""}`,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")}
                </HubLink>
                {(() => {
                  const selYr = sel.date && /^\d{4}/.test(sel.date) ? sel.date.slice(0, 4) : undefined;
                  return (
                    <>
                      <HubLink
                        to={{
                          kind: "items",
                          query: new URLSearchParams({
                            player: p.u,
                            champ: resolveChampSlug(sel.champ),
                            ...(selYr ? { year: selYr } : {}),
                          }).toString(),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Item history")}
                      </HubLink>
                      <HubLink
                        to={{ kind: "compare", mode: "player", a: p.u, ...(selYr ? { period: `y${selYr}` } : {}) }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Compare")}
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "finder",
                          query: new URLSearchParams({
                            player: p.u,
                            champ: resolveChampSlug(sel.champ),
                            ...(selYr ? { year: selYr } : {}),
                          }).toString(),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Game finder")}
                      </HubLink>
                      {sel.team && sel.opp && (
                        <>
                          <HubLink
                            to={{ kind: "prep", a: teamSlug(sel.team), b: teamSlug(sel.opp), ...(selYr ? { period: `y${selYr}` } : {}) }}
                            className="text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Match prep")}
                          </HubLink>
                          <HubLink
                            to={{
                              kind: "draft",
                              query: new URLSearchParams({
                                teams: `${teamSlug(sel.team)},${teamSlug(sel.opp)}`,
                                ...(selYr ? { p: `y${selYr}` } : {}),
                                ...(p.role ? { role: p.role } : {}),
                                ...(sel.champ ? { champ: resolveChampSlug(sel.champ) } : {}),
                              }).toString(),
                            }}
                            className="text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Draft board")}
                          </HubLink>
                        </>
                      )}
                      <HubLink
                        to={{
                          kind: "tiers",
                          ...(p.role || sel.champ || selYr
                            ? {
                                query: new URLSearchParams({
                                  ...(selYr ? { key: `y${selYr}` } : {}),
                                  ...(p.role ? { role: p.role } : {}),
                                  ...(sel.champ ? { q: resolveChampSlug(sel.champ) } : {}),
                                }).toString(),
                              }
                            : {}),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Pro tier list")}
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "leaders",
                          query: new URLSearchParams({
                            ...(selYr ? { year: selYr } : {}),
                            ...(p.role ? { role: p.role } : {}),
                            ...(sel.champ ? { champ: resolveChampSlug(sel.champ) } : {}),
                            q: p.u,
                          }).toString(),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Player leaderboards")}
                      </HubLink>
                    </>
                  );
                })()}
                <HubLink
                  to={{
                    kind: "rankings",
                    query: new URLSearchParams({
                      q: [sel.team ? teamSlug(sel.team) : "", sel.opp ? teamSlug(sel.opp) : ""].filter(Boolean).join(","),
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")}
                </HubLink>
                {sel.seriesSlug ? (
                  <HubLink
                    to={{ kind: "match", slug: sel.seriesSlug, game: sel.gn }}
                    className="hover:text-rw-accent hover:underline"
                  >
                    {fmtDate(sel.date)}
                  </HubLink>
                ) : (
                  <span>{fmtDate(sel.date)}</span>
                )}
                {sel.seriesSlug && (
                  <HubLink
                    to={{ kind: "match", slug: sel.seriesSlug, game: sel.gn }}
                    className="text-rw-accent font-semibold hover:underline"
                  >
                    {tl("Details")} →
                  </HubLink>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </Section>
  );
};

/** Signature Champions Visual Mastery Cards on the Player Overview tab. */
export const SignatureChampsGrid: React.FC<{ p: HubPlayer; cardSub?: string }> = ({ p, cardSub }) => {
  const topChamps = p.champs.slice(0, 6);
  if (topChamps.length === 0) return null;

  const R = 21;
  const C = 2 * Math.PI * R;

  return (
    <div className="rw-span">
      <Section
        title={tl("Most played champions")}
        share={`${p.u}-signature-champs`}
        right={
          <span className="flex items-center gap-2 text-[11px]" data-nocapture="1">
            {topChamps.length >= 1 && (
              <>
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${encodeURIComponent(resolveChampSlug(topChamps[0].c))}${topChamps[1] ? `&vs=${encodeURIComponent(resolveChampSlug(topChamps[1].c))}` : ""}${p.role ? `&role=${encodeURIComponent(p.role)}` : ""}`,
                  }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Counters")} →
                </HubLink>
                <HubLink
                  to={{ kind: "items", query: `player=${encodeURIComponent(p.u)}&champ=${encodeURIComponent(resolveChampSlug(topChamps[0].c))}` }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{ kind: "finder", query: `player=${encodeURIComponent(p.u)}&champ=${encodeURIComponent(resolveChampSlug(topChamps[0].c))}` }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "player", a: p.u }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                {p.club && (
                  <>
                    <HubLink
                      to={{ kind: "prep", a: teamSlug(p.club, p.clubU) }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          teams: teamSlug(p.club, p.clubU),
                          ...(p.role ? { role: p.role } : {}),
                          ...(topChamps[0]?.c ? { champ: resolveChampSlug(topChamps[0].c) } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(p.role || topChamps[0]?.c
                      ? {
                          query: new URLSearchParams({
                            ...(p.role ? { role: p.role } : {}),
                            ...(topChamps[0]?.c ? { q: resolveChampSlug(topChamps[0].c) } : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(p.role ? { role: p.role } : {}),
                      ...(topChamps[0]?.c ? { champ: resolveChampSlug(topChamps[0].c) } : {}),
                      q: p.u,
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    ...(p.club ? { query: `q=${encodeURIComponent(teamSlug(p.club, p.clubU))}` } : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
              </>
            )}
            <HubLink to={{ kind: "player", slug: p.u, tab: "champions" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Show all {n}", { n: p.nChamps })} →
            </HubLink>
            <SectionCard
              section={tl("Most played champions")}
              name={p.name}
              sub={cardSub}
              rows={() =>
                topChamps.map((c, idx) => ({
                  rank: idx + 1,
                  champ: c.c,
                  team: p.club || undefined,
                  win: c.w / Math.max(1, c.g) >= 0.5,
                  label: champName(c.c),
                  sub: `${c.w}-${c.g - c.w} (${winRate(c.w, c.g)})`,
                  value: `KDA ${fmtN(c.kda)}`,
                }))
              }
            />
          </span>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {topChamps.map((c, idx) => {
            const wr = c.g > 0 ? c.w / c.g : 0;
            const ringColor = wr >= 0.6 ? "var(--rw-teal)" : wr >= 0.5 ? "var(--rw-accent)" : "var(--rw-red)";
            const dash = C * wr;
            const kpg = c.g ? (c.k / c.g).toFixed(1) : "0";
            const dpg = c.g ? (c.d / c.g).toFixed(1) : "0";
            const apg = c.g ? (c.a / c.g).toFixed(1) : "0";
            return (
              <HubLink
                key={c.c}
                to={{ kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(resolveChampSlug(c.c))}` }}
                className="group rounded-xl border border-rw-border bg-rw-bg/50 hover:border-rw-accent/60 hover:bg-rw-raised/60 p-2.5 flex flex-col justify-between gap-2 transition-colors"
                title={`${p.name} · ${champName(c.c)} (${c.w}-${c.g - c.w})`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                    <svg width={48} height={48} viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
                      <circle cx={24} cy={24} r={R} fill="none" stroke="var(--rw-raised)" strokeWidth={3.5} />
                      <circle
                        cx={24}
                        cy={24}
                        r={R}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth={3.5}
                        strokeDasharray={`${dash.toFixed(1)} ${C.toFixed(1)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <ChampIcon name={c.c} size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono text-rw-muted">#{idx + 1}</span>
                      <span className="text-xs font-bold text-rw-text group-hover:text-rw-accent truncate">
                        {champName(c.c)}
                      </span>
                    </div>
                    <div className="text-xs font-bold font-mono tabular-nums" style={{ color: ringColor }}>
                      {winRate(c.w, c.g)}{" "}
                      <span className="text-[10px] font-normal text-rw-sub">
                        ({c.w}-{c.g - c.w})
                      </span>
                    </div>
                    <div className="text-[10px] text-rw-muted tabular-nums">
                      {tl("{n} games", { n: c.g })}
                    </div>
                  </div>
                </div>
                <div className="pt-1.5 border-t border-rw-border/60 flex items-center justify-between gap-1 text-[10px]">
                  <KdaBar kda={c.kda} />
                  <span className="text-rw-muted font-mono tabular-nums">
                    {kpg}/{dpg}/{apg}
                  </span>
                </div>
              </HubLink>
            );
          })}
        </div>
      </Section>
    </div>
  );
};

/** Rolling Series Form Trajectory + Blue/Red Side & Objective Control card on the Team Overview tab. */
export const TeamFormAndSideCard: React.FC<{ t: HubTeam; cardSub?: string }> = ({ t, cardSub }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>();
  const series = useMemo(() => t.recent.slice(0, 16).reverse(), [t.recent]);
  const [hidden, reveal] = useHidden(`team-form-side:${t.u}`, t.recent[0]?.date);

  const hasSides = t.sides && (t.sides[0] + t.sides[2] > 0);
  if (series.length < 3 && !hasSides) return null;

  const seriesWins = series.filter((s) => s.us > s.them).length;
  const gameWins = series.reduce((a, s) => a + s.us, 0);
  const gameLosses = series.reduce((a, s) => a + s.them, 0);

  // Current streak from newest series (t.recent is newest-first)
  let streakN = 0;
  let streakWon: boolean | null = null;
  for (const s of t.recent) {
    if (s.us === s.them) continue;
    const won = s.us > s.them;
    if (streakWon === null) {
      streakWon = won;
      streakN = 1;
    } else if (won === streakWon) {
      streakN++;
    } else {
      break;
    }
  }

  const L = 24;
  const R = 8;
  const T = 10;
  const CH = 86;
  const H = T + CH + 20;
  const pw = Math.max(W - L - R, 120);
  const bw = series.length > 0 ? pw / series.length : pw;
  const midY = T + CH / 2;

  const selIdx = hoverIdx != null && series[hoverIdx] ? hoverIdx : series.length - 1;
  const sel = series[selIdx];

  const blueG = t.sides ? t.sides[0] : 0;
  const blueW = t.sides ? t.sides[1] : 0;
  const redG = t.sides ? t.sides[2] : 0;
  const redW = t.sides ? t.sides[3] : 0;
  const blueWr = blueG > 0 ? (blueW / blueG) * 100 : 0;
  const redWr = redG > 0 ? (redW / redG) * 100 : 0;

  return (
    <div className="rw-span">
      <Section
        title={`${tl("Form over time")} · ${tl("Blue / red side")}`}
        share={`${t.u}-form-sides`}
        right={
          hidden ? (
            <RevealButton onReveal={reveal} small />
          ) : (
            <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
              {(() => {
                const opp0 = t.recent[0]?.opp;
                const oppSlug = opp0 ? teamSlug(opp0, t.opps.find((o) => o.n === opp0)?.u) : undefined;
                const lg = t.rating?.league ? resolveLeagueSlug(t.rating.league) || t.rating.league : undefined;
                return (
                  <>
                    <HubLink
                      to={{ kind: "prep", a: t.u, ...(oppSlug ? { b: oppSlug } : {}) }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(t.u)}${oppSlug ? `,${encodeURIComponent(oppSlug)}` : ""}`,
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "compare", mode: "team", a: t.u, ...(oppSlug ? { b: oppSlug } : {}) }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "finder", query: `team=${encodeURIComponent(t.u)}` }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        query: new URLSearchParams({
                          ...(lg ? { league: lg } : {}),
                          q: `${t.u}${oppSlug ? `,${oppSlug}` : ""}`,
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        ...(lg ? { query: `scope=${encodeURIComponent(lg)}` } : {}),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(lg ? { league: lg } : {}),
                          q: `${t.u}${oppSlug ? `,${oppSlug}` : ""}`,
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                  </>
                );
              })()}
              <SectionCard
                section={`${tl("Recent series")} & ${tl("Blue / red side")}`}
                name={t.name}
                sub={cardSub}
                rows={() =>
                  [
                    ...(series.length > 0
                      ? [
                          {
                            team: t.name,
                            label: tl("Recent series"),
                            sub: `${gameWins}-${gameLosses} ${tl("Games")}`,
                            value: `${seriesWins}-${series.length - seriesWins} (${winRate(seriesWins, series.length)})`,
                            win: seriesWins * 2 >= series.length,
                          },
                        ]
                      : []),
                    ...(hasSides
                      ? [
                          {
                            team: t.name,
                            label: tl("Blue side"),
                            sub: `${blueW}-${blueG - blueW}`,
                            value: winRate(blueW, blueG),
                            win: blueWr >= 50,
                          },
                          {
                            team: t.name,
                            label: tl("Red side"),
                            sub: `${redW}-${redG - redW}`,
                            value: winRate(redW, redG),
                            win: redWr >= 50,
                          },
                        ]
                      : []),
                    ...(t.obj
                      ? [
                          {
                            team: t.name,
                            label: `${tl("Dragons")} · ${tl("Barons")} · ${tl("Towers")}`,
                            sub: tl("Per game"),
                            value: `${fmtDec(t.obj.dragons, 2)} · ${fmtDec(t.obj.barons, 2)} · ${fmtDec(t.obj.towers, 1)}`,
                          },
                        ]
                      : []),
                  ].map((r, idx) => ({ ...r, rank: idx + 1 }))
                }
              />
            </span>
          )
        }
      >
        {hidden ? (
          <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            {/* Left column: Rolling Series Form Trajectory */}
            {series.length >= 3 && (
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted">
                      {tl("Recent series")} ({series.length})
                    </span>
                    <HubLink
                      to={{ kind: "team", slug: t.u, tab: "matches" }}
                      className="font-bold text-rw-text tabular-nums hover:text-rw-accent hover:underline"
                    >
                      {seriesWins}W – {series.length - seriesWins}L
                    </HubLink>
                    <HubLink
                      to={{ kind: "finder", query: `team=${encodeURIComponent(t.u)}` }}
                      className="text-rw-muted tabular-nums text-[11px] hover:text-rw-accent hover:underline"
                    >
                      ({gameWins}–{gameLosses} {tl("Games")})
                    </HubLink>
                  </div>
                  {streakN >= 2 && streakWon != null && (
                    <HubLink
                      to={{ kind: "team", slug: t.u, tab: "matches" }}
                      title={tl("Matches")}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border tabular-nums hover:border-rw-accent/60 transition-colors ${
                        streakWon
                          ? "border-rw-teal/60 bg-rw-teal/10 text-rw-teal"
                          : "border-rw-red/60 bg-rw-red/10 text-rw-red"
                      }`}
                    >
                      {streakN}
                      {streakWon ? tc("short result", "W") : tc("short result", "L")}
                    </HubLink>
                  )}
                </div>

                <div ref={box} className="relative select-none">
                  <svg
                    width={W}
                    height={H}
                    viewBox={`0 0 ${W} ${H}`}
                    className="block w-full touch-pan-y"
                    role="img"
                    aria-label={tl("Recent series")}
                    onPointerMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const idx = Math.floor((e.clientX - rect.left - L) / Math.max(1, bw));
                      setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
                    }}
                    onPointerLeave={() => setHoverIdx(null)}
                  >
                    <line x1={L} x2={L + pw} y1={midY} y2={midY} style={{ stroke: "var(--rw-line)" }} strokeWidth={1} />
                    <text x={L - 4} y={T + 8} textAnchor="end" className="font-num" style={{ fill: "var(--rw-teal)", fontSize: 9 }}>
                      {tc("short result", "W")}
                    </text>
                    <text x={L - 4} y={T + CH - 2} textAnchor="end" className="font-num" style={{ fill: "var(--rw-red)", fontSize: 9 }}>
                      {tc("short result", "L")}
                    </text>

                    {series.map((s, i) => {
                      const diff = s.us - s.them;
                      const won = diff > 0;
                      const mag = Math.min(3, Math.max(1, Math.abs(diff)));
                      const barH = (mag / 3) * (CH / 2 - 6);
                      const colW = Math.max(6, Math.min(24, bw * 0.68));
                      const x0 = L + (i + 0.5) * bw - colW / 2;
                      const y0 = won ? midY - barH : midY;
                      const active = i === selIdx;
                      return (
                        <g key={i}>
                          <rect
                            x={x0}
                            y={y0}
                            width={colW}
                            height={Math.max(3, barH)}
                            rx={3}
                            style={{
                              fill: won ? "var(--rw-teal)" : "var(--rw-red)",
                              opacity: active ? 1 : 0.78,
                              stroke: active ? "var(--rw-text)" : "none",
                            }}
                            strokeWidth={active ? 1.5 : 0}
                          />
                          <text
                            x={L + (i + 0.5) * bw}
                            y={won ? y0 - 3 : y0 + barH + 9}
                            textAnchor="middle"
                            className="font-num"
                            style={{ fill: active ? "var(--rw-text)" : "var(--rw-muted)", fontSize: 8.5, fontWeight: active ? 700 : 500 }}
                          >
                            {s.us}-{s.them}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {sel && (() => {
                  const oppSlug = teamSlug(sel.opp, t.opps.find((o) => o.n === sel.opp)?.u);
                  const selPeriod = /^\d{4}/.test(sel.date) ? `y${sel.date.slice(0, 4)}` : undefined;
                  return (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rw-border bg-rw-bg/60 px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      {sel.g ? (
                        <HubLink
                          to={{ kind: "match", slug: sel.g }}
                          className={`font-bold tabular-nums hover:underline ${sel.us > sel.them ? "text-rw-teal" : "text-rw-red"}`}
                        >
                          {sel.us > sel.them ? tc("short result", "W") : tc("short result", "L")} {sel.us}–{sel.them}
                        </HubLink>
                      ) : (
                        <span className={`font-bold tabular-nums ${sel.us > sel.them ? "text-rw-teal" : "text-rw-red"}`}>
                          {sel.us > sel.them ? tc("short result", "W") : tc("short result", "L")} {sel.us}–{sel.them}
                        </span>
                      )}
                      <HubLink
                        to={{ kind: "compare", mode: "team", a: t.u, b: oppSlug, period: selPeriod }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
                        title={tl("Compare")}
                      >
                        vs
                      </HubLink>
                      <HubLink to={{ kind: "team", slug: oppSlug }} className="shrink-0">
                        <TeamLogo name={sel.opp} sizeClass="w-3.5 h-3.5" />
                      </HubLink>
                      <TeamLink name={sel.opp} u={oppSlug} />
                      <span className="text-rw-muted">·</span>
                      <EventLink name={sel.en} u={sel.e} className="text-rw-muted hover:text-rw-accent hover:underline truncate" />
                    </span>
                    <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                      {sel.g ? (
                        <HubLink to={{ kind: "match", slug: sel.g }} className="hover:text-rw-accent hover:underline">
                          {fmtDate(sel.date, false)}
                        </HubLink>
                      ) : (
                        <span>{fmtDate(sel.date, false)}</span>
                      )}
                      <HubLink
                        to={{ kind: "prep", a: t.u, b: oppSlug, period: selPeriod }}
                        className="text-[11px] text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {tl("Match prep")}
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "draft",
                          query: `teams=${encodeURIComponent(t.u)},${encodeURIComponent(oppSlug)}${selPeriod ? `&p=${encodeURIComponent(selPeriod)}` : ""}`,
                        }}
                        className="text-[11px] text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {tl("Draft board")}
                      </HubLink>
                      <HubLink
                        to={{ kind: "compare", mode: "team", a: t.u, b: oppSlug, period: selPeriod }}
                        className="text-[11px] text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {tl("Compare")}
                      </HubLink>
                      {(() => {
                        const lg = t.rating?.league ? resolveLeagueSlug(t.rating.league) || t.rating.league : undefined;
                        return (
                          <>
                            <HubLink
                              to={{
                                kind: "finder",
                                query: `team=${encodeURIComponent(t.u)}&vs=${encodeURIComponent(oppSlug)}${selPeriod ? `&year=${encodeURIComponent(selPeriod.slice(1))}` : ""}`,
                              }}
                              className="text-[11px] text-rw-muted hover:text-rw-accent hover:underline"
                            >
                              {tl("Game finder")}
                            </HubLink>
                            <HubLink
                              to={{
                                kind: "tiers",
                                ...(lg || selPeriod
                                  ? {
                                      query: new URLSearchParams({
                                        ...(lg ? { scope: lg } : {}),
                                        ...(selPeriod ? { key: selPeriod } : {}),
                                      }).toString(),
                                    }
                                  : {}),
                              }}
                              className="text-[11px] text-rw-muted hover:text-rw-accent hover:underline"
                            >
                              {tl("Pro tier list")}
                            </HubLink>
                            <HubLink
                              to={{
                                kind: "rankings",
                                query: new URLSearchParams({
                                  ...(lg ? { league: lg } : {}),
                                  q: `${t.u},${oppSlug}`,
                                }).toString(),
                              }}
                              className="text-[11px] text-rw-muted hover:text-rw-accent hover:underline"
                            >
                              {tl("Power rankings")}
                            </HubLink>
                            <HubLink
                              to={{
                                kind: "leaders",
                                query: new URLSearchParams({
                                  ...(lg ? { league: lg } : {}),
                                  ...(selPeriod ? { year: selPeriod.slice(1) } : {}),
                                  ...(sel.e ? { event: resolveEventSlug(sel.e) } : {}),
                                  q: `${t.u},${oppSlug}`,
                                }).toString(),
                              }}
                              className="text-[11px] text-rw-muted hover:text-rw-accent hover:underline"
                            >
                              {tl("Player leaderboards")}
                            </HubLink>
                          </>
                        );
                      })()}
                      {sel.g && (
                        <HubLink to={{ kind: "match", slug: sel.g }} className="text-rw-accent font-semibold hover:underline">
                          {tl("Details")} →
                        </HubLink>
                      )}
                    </span>
                  </div>
                  );
                })()}
              </div>
            )}

            {/* Right column: Blue vs Red Side & Objective Control */}
            <div className="space-y-3 min-w-0">
              {hasSides && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-rw-muted">
                    <span>{tl("Blue / red side")}</span>
                    <HubLink
                      to={{ kind: "finder", query: `team=${encodeURIComponent(t.u)}&side=${blueWr >= redWr ? "b" : "r"}` }}
                      className="font-mono text-rw-sub normal-case hover:text-rw-accent hover:underline"
                    >
                      {blueWr >= redWr
                        ? `${tl("Blue side")} +${fmtDec(blueWr - redWr, 1)}%`
                        : `${tl("Red side")} +${fmtDec(redWr - blueWr, 1)}%`}
                    </HubLink>
                  </div>

                  {/* Blue Side Bar */}
                  <HubLink
                    to={{ kind: "finder", query: `team=${encodeURIComponent(t.u)}&side=b` }}
                    className="block rounded-lg border border-rw-border bg-rw-bg/50 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-3 py-2 space-y-1 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold flex items-center gap-1.5" style={{ color: "#4a9eff" }}>
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#4a9eff" }} />
                        {tl("Blue side")}
                      </span>
                      <span className="font-mono tabular-nums text-rw-text font-bold">
                        {winRate(blueW, blueG)}{" "}
                        <span className="text-rw-muted font-normal text-[11px]">
                          ({blueW}W – {blueG - blueW}L · {blueG}G)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-rw-raised overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(blueWr)}%`, background: "#4a9eff" }} />
                    </div>
                  </HubLink>

                  {/* Red Side Bar */}
                  <HubLink
                    to={{ kind: "finder", query: `team=${encodeURIComponent(t.u)}&side=r` }}
                    className="block rounded-lg border border-rw-border bg-rw-bg/50 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-3 py-2 space-y-1 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold flex items-center gap-1.5" style={{ color: "var(--rw-red)" }}>
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--rw-red)" }} />
                        {tl("Red side")}
                      </span>
                      <span className="font-mono tabular-nums text-rw-text font-bold">
                        {winRate(redW, redG)}{" "}
                        <span className="text-rw-muted font-normal text-[11px]">
                          ({redW}W – {redG - redW}L · {redG}G)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-rw-raised overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(redWr)}%`, background: "var(--rw-red)" }} />
                    </div>
                  </HubLink>
                </div>
              )}

              {t.obj && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <HubLink
                    to={{ kind: "team", slug: t.u, tab: "stats" }}
                    className="block rounded-lg border border-rw-border bg-rw-bg/40 hover:border-rw-accent/60 px-2.5 py-1.5 space-y-1 transition-colors"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-rw-muted">{tl("Dragons")}</div>
                    <div className="text-sm font-bold font-mono text-rw-text tabular-nums">{fmtDec(t.obj.dragons, 2)}</div>
                    <div className="h-1 rounded-full bg-rw-raised overflow-hidden">
                      <div className="h-full rounded-full bg-rw-accent/80" style={{ width: `${clamp(Math.round((t.obj.dragons / 4.0) * 100), 8, 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-rw-muted">{tl("Per game")}</div>
                  </HubLink>
                  <HubLink
                    to={{ kind: "team", slug: t.u, tab: "stats" }}
                    className="block rounded-lg border border-rw-border bg-rw-bg/40 hover:border-rw-accent/60 px-2.5 py-1.5 space-y-1 transition-colors"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-rw-muted">{tl("Barons")}</div>
                    <div className="text-sm font-bold font-mono text-rw-text tabular-nums">{fmtDec(t.obj.barons, 2)}</div>
                    <div className="h-1 rounded-full bg-rw-raised overflow-hidden">
                      <div className="h-full rounded-full bg-rw-accent/80" style={{ width: `${clamp(Math.round((t.obj.barons / 1.5) * 100), 8, 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-rw-muted">{tl("Per game")}</div>
                  </HubLink>
                  <HubLink
                    to={{ kind: "team", slug: t.u, tab: "stats" }}
                    className="block rounded-lg border border-rw-border bg-rw-bg/40 hover:border-rw-accent/60 px-2.5 py-1.5 space-y-1 transition-colors"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-rw-muted">{tl("Towers")}</div>
                    <div className="text-sm font-bold font-mono text-rw-text tabular-nums">{fmtDec(t.obj.towers, 1)}</div>
                    <div className="h-1 rounded-full bg-rw-raised overflow-hidden">
                      <div className="h-full rounded-full bg-rw-accent/80" style={{ width: `${clamp(Math.round((t.obj.towers / 11.0) * 100), 8, 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-rw-muted">{tl("Per game")}</div>
                  </HubLink>
                  <HubLink
                    to={{ kind: "team", slug: t.u, tab: "stats" }}
                    className="block rounded-lg border border-rw-border bg-rw-bg/40 hover:border-rw-accent/60 px-2.5 py-1.5 space-y-1 transition-colors"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-rw-muted">{tl("Gold diff")}</div>
                    <div className={`text-sm font-bold font-mono tabular-nums ${t.obj.golddiff >= 0 ? "text-rw-teal" : "text-rw-red"}`}>
                      {signed(Math.round(t.obj.golddiff))}
                    </div>
                    <div className="h-1 rounded-full bg-rw-raised overflow-hidden">
                      <div
                        className={`h-full rounded-full ${t.obj.golddiff >= 0 ? "bg-rw-teal" : "bg-rw-red"}`}
                        style={{ width: `${clamp(Math.round((Math.abs(t.obj.golddiff) / 4000) * 100), 10, 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-rw-muted">{t.avgMin ? `${fmtDec(t.avgMin, 1)}m` : tl("Per game")}</div>
                  </HubLink>
                </div>
              )}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
};

/** Champion Meta Presence Trajectory (16 patches) + Role, Side & @15 Early-Game Profile on ChampPage. */
export const ChampVisualOverview: React.FC<{ c: HubChamp }> = ({ c }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>();
  const gradId = useId().replace(/[^a-z0-9]/gi, "");

  const patches = useMemo(() => (c.patches || []).slice(0, 16).reverse(), [c.patches]);
  const totalRoles = useMemo(() => c.roles.reduce((s, r) => s + r.p, 0) || 1, [c.roles]);
  const topRoles = useMemo(() => c.roles.filter((r) => r.p / totalRoles >= 0.02).slice(0, 5), [c.roles, totalRoles]);
  const primaryRole = topRoles[0]?.r || "";
  const lane = (c.lane12 && c.lane12[primaryRole]) || (c.lane && c.lane[primaryRole]) || null;

  const blueG = c.side?.[0] || 0;
  const blueW = c.side?.[1] || 0;
  const redG = c.side?.[2] || 0;
  const redW = c.side?.[3] || 0;
  const hasSides = blueG + redG >= 5;
  const blueWr = blueG ? (blueW / blueG) * 100 : 0;
  const redWr = redG ? (redW / redG) * 100 : 0;

  if (patches.length < 3 && topRoles.length === 0 && !hasSides) return null;

  const L = 34;
  const R = 12;
  const T = 12;
  const CH = 112;
  const H = T + CH + 24;
  const pw = Math.max(W - L - R, 120);
  const step = patches.length > 1 ? pw / (patches.length - 1) : pw;
  const cx = (i: number) => L + (patches.length > 1 ? i * step : pw / 2);
  const cy = (pctVal: number) => T + CH * (1 - clamp(pctVal, 0, 100) / 100);

  const presPts: [number, number][] = patches.map((p, i) => {
    const prPct = ((p.pr ?? p.pk + p.b) / Math.max(1, p.g)) * 100;
    return [cx(i), cy(prPct)];
  });
  const wrPts: [number, number][] = [];
  patches.forEach((p, i) => {
    if (p.pk >= 3) {
      wrPts.push([cx(i), cy((p.w / p.pk) * 100)]);
    }
  });

  const selIdx = hoverIdx != null && patches[hoverIdx] ? hoverIdx : patches.length - 1;
  const sel = patches[selIdx];
  const selPres = sel ? Math.round(((sel.pr ?? sel.pk + sel.b) / Math.max(1, sel.g)) * 100) : 0;
  const selWr = sel && sel.pk > 0 ? Math.round((sel.w / sel.pk) * 100) : null;

  return (
    <div className="rw-span">
      <Section
        title={`${tl("Recent patches")} · ${tl("Blue / red side")}`}
        share={`${c.u}-meta-profile`}
        right={
          <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
            <HubLink
              to={{
                kind: "counters",
                query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}`,
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Counters")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  q: c.u || resolveChampSlug(c.name),
                  ...(sel ? { key: `p${sel.p}` } : {}),
                  ...(primaryRole ? { role: primaryRole } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{ kind: "items", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}` }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Item history")} →
            </HubLink>
            <HubLink
              to={{ kind: "finder", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}` }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Game finder")} →
            </HubLink>
            {(() => {
              const rec0 = c.recent?.find((r) => r.team && r.opp);
              if (!rec0) return null;
              const tA = teamSlug(rec0.team);
              const tB = teamSlug(rec0.opp);
              return (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: tA,
                      b: tB,
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: tA,
                      b: tB,
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                </>
              );
            })()}
            <HubLink
              to={{
                kind: "draft",
                query: (() => {
                  const rec0 = c.recent?.find((r) => r.team && r.opp);
                  return new URLSearchParams({
                    champ: c.u || resolveChampSlug(c.name),
                    ...(primaryRole ? { role: primaryRole } : {}),
                    ...(rec0 ? { teams: `${teamSlug(rec0.team)},${teamSlug(rec0.opp)}` } : {}),
                    ...(sel ? { p: `p:${sel.p}` } : {}),
                  }).toString();
                })(),
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink
              to={{
                kind: "champions",
                query: new URLSearchParams({
                  q: c.u || resolveChampSlug(c.name),
                  ...(sel ? { key: `p${sel.p}` } : {}),
                }).toString(),
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Champions")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  champ: c.u || resolveChampSlug(c.name),
                  ...(primaryRole ? { role: primaryRole } : {}),
                }).toString(),
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                ...((() => {
                  const rec0 = c.recent?.find((r) => r.team && r.opp);
                  return rec0 ? { query: `q=${encodeURIComponent(teamSlug(rec0.team))},${encodeURIComponent(teamSlug(rec0.opp))}` } : {};
                })()),
              }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            <SectionCard
              section={`${tl("Recent patches")} · ${champName(c.name)}`}
              name={champName(c.name)}
              sub={`${fmtNum(c.p)} ${tl("Picks")} · ${fmtNum(c.b)} ${tl("Bans")} · ${winRate(c.w, c.p)}`}
              rows={() =>
                [
                  ...topRoles.slice(0, 3).map((r) => ({
                    champ: c.name,
                    label: roleName(r.r),
                    sub: `${fmtNum(r.p)} ${tl("Picks")}`,
                    value: `${Math.round((r.p / totalRoles) * 100)}%`,
                    win: true,
                  })),
                  ...patches
                    .slice(-5)
                    .reverse()
                    .map((p) => {
                      const pr = Math.round(((p.pr ?? p.pk + p.b) / Math.max(1, p.g)) * 100);
                      return {
                        champ: c.name,
                        label: tl("Patch {patch}", { patch: p.p }),
                        sub: `${p.pk} ${tl("Picks")} · ${p.b} ${tl("Bans")}`,
                        value: `${pr}% · ${p.pk ? winRate(p.w, p.pk) : "–"}`,
                        win: p.pk >= 3 ? p.w / p.pk >= 0.5 : undefined,
                      };
                    }),
                ].map((r, idx) => ({ ...r, rank: idx + 1 }))
              }
            />
          </span>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
          {/* Left column: Interactive 16-patch presence & win rate chart */}
          {patches.length >= 3 && (
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-rw-muted flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-0.5 bg-rw-accent inline-block" />
                    <span>{tl("Presence")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-0.5 bg-rw-teal inline-block" />
                    <span>{tl("Win %")}</span>
                  </span>
                </span>
                <span className="text-[11px] text-rw-sub font-mono">
                  <HubLink
                    to={{ kind: "champions", query: `key=p${encodeURIComponent(patches[0].p)}` }}
                    className="hover:text-rw-accent hover:underline"
                  >
                    {patches[0].p}
                  </HubLink>{" "}
                  →{" "}
                  <HubLink
                    to={{ kind: "champions", query: `key=p${encodeURIComponent(patches[patches.length - 1].p)}` }}
                    className="hover:text-rw-accent hover:underline"
                  >
                    {patches[patches.length - 1].p}
                  </HubLink>
                </span>
              </div>

              <div ref={box} className="w-full select-none">
                <svg
                  width={W}
                  height={H}
                  className="block overflow-visible cursor-crosshair"
                  onPointerMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const idx = Math.round((e.clientX - rect.left - L) / Math.max(1, step));
                    setHoverIdx(Math.max(0, Math.min(patches.length - 1, idx)));
                  }}
                  onPointerLeave={() => setHoverIdx(null)}
                >
                  <defs>
                    <linearGradient id={`cpres-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" style={{ stopColor: "var(--rw-accent)", stopOpacity: 0.28 }} />
                      <stop offset="100%" style={{ stopColor: "var(--rw-accent)", stopOpacity: 0.0 }} />
                    </linearGradient>
                  </defs>

                  {[0, 50, 100].map((v) => (
                    <g key={v}>
                      <line
                        x1={L}
                        x2={L + pw}
                        y1={cy(v)}
                        y2={cy(v)}
                        style={{ stroke: "var(--rw-line)" }}
                        strokeDasharray={v === 50 ? "3 3" : undefined}
                        strokeWidth={1}
                      />
                      <text x={L - 5} y={cy(v) + 3} textAnchor="end" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9.5 }}>
                        {v}%
                      </text>
                    </g>
                  ))}

                  {presPts.length >= 2 && (
                    <>
                      <path
                        d={`${smoothPath(presPts)} L ${presPts[presPts.length - 1][0].toFixed(1)},${(T + CH).toFixed(1)} L ${presPts[0][0].toFixed(1)},${(T + CH).toFixed(1)} Z`}
                        fill={`url(#cpres-${gradId})`}
                      />
                      <path d={smoothPath(presPts)} fill="none" style={{ stroke: "var(--rw-accent)" }} strokeWidth={2.2} />
                    </>
                  )}

                  {wrPts.length >= 2 && (
                    <path d={smoothPath(wrPts)} fill="none" style={{ stroke: "var(--rw-teal)" }} strokeWidth={1.6} strokeDasharray="4 3" />
                  )}

                  {patches.map((p, i) => {
                    const prPct = ((p.pr ?? p.pk + p.b) / Math.max(1, p.g)) * 100;
                    const x = cx(i);
                    const y = cy(prPct);
                    const active = i === selIdx;
                    const showLbl = i === 0 || i === patches.length - 1 || i === Math.floor(patches.length / 2) || active;
                    return (
                      <g key={p.p}>
                        {active && (
                          <line x1={x} x2={x} y1={T} y2={T + CH} style={{ stroke: "var(--rw-accent)", opacity: 0.45 }} strokeDasharray="2 2" />
                        )}
                        <circle
                          cx={x}
                          cy={y}
                          r={active ? 4.5 : 2.8}
                          style={{
                            fill: "var(--rw-accent)",
                            stroke: active ? "var(--rw-text)" : "var(--rw-card)",
                          }}
                          strokeWidth={active ? 1.8 : 1.2}
                        />
                        {p.pk >= 3 && (
                          <circle
                            cx={x}
                            cy={cy((p.w / p.pk) * 100)}
                            r={active ? 3.8 : 2.3}
                            style={{
                              fill: p.w / p.pk >= 0.5 ? "var(--rw-teal)" : "var(--rw-red)",
                              stroke: "var(--rw-card)",
                            }}
                            strokeWidth={1}
                          />
                        )}
                        {showLbl && (
                          <text
                            x={x}
                            y={T + CH + 15}
                            textAnchor={i === 0 ? "start" : i === patches.length - 1 ? "end" : "middle"}
                            className="font-num"
                            style={{
                              fill: active ? "var(--rw-accent)" : "var(--rw-muted)",
                              fontSize: 9.5,
                              fontWeight: active ? 700 : 500,
                            }}
                          >
                            {p.p}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {sel && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rw-border bg-rw-bg/60 px-3 py-1.5 text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <HubLink
                      to={{ kind: "champions", query: `key=p${encodeURIComponent(sel.p)}` }}
                      className="font-bold text-rw-accent hover:underline"
                    >
                      {tl("Patch {patch}", { patch: sel.p })}
                    </HubLink>
                    <span className="text-rw-sub tabular-nums">
                      {tl("{pres} presence · {p} picks · {wr}", {
                        pres: `${selPres}%`,
                        p: sel.pk,
                        wr: selWr != null ? `${selWr}%` : "–",
                      })}
                    </span>
                  </span>
                  <span className="text-rw-muted tabular-nums text-[11px]">
                    <HubLink
                      to={{ kind: "finder", query: `patch=${encodeURIComponent(sel.p)}&champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}` }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {sel.pk} {tl("Picks")}
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink
                      to={{ kind: "finder", query: `patch=${encodeURIComponent(sel.p)}&ban=${encodeURIComponent(c.u || resolveChampSlug(c.name))}` }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {sel.b} {tl("Bans")}
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink
                      to={{ kind: "finder", query: `patch=${encodeURIComponent(sel.p)}` }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {sel.g} {tl("Games")}
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}${primaryRole ? `&role=${encodeURIComponent(primaryRole)}` : ""}`,
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Counters")} →
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink
                      to={{ kind: "items", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}` }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Item history")} →
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          p: `p:${sel.p}`,
                          champ: c.u || resolveChampSlug(c.name),
                          ...(primaryRole ? { role: primaryRole } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Draft board")} →
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          key: `p${sel.p}`,
                          q: c.u || resolveChampSlug(c.name),
                          ...(primaryRole ? { role: primaryRole } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          champ: c.u || resolveChampSlug(c.name),
                          ...(primaryRole ? { role: primaryRole } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink
                      to={{
                        kind: "rankings",
                        ...((() => {
                          const rec0 = c.recent?.find((r) => r.team && r.opp);
                          return rec0 ? { query: `q=${encodeURIComponent(teamSlug(rec0.team))},${encodeURIComponent(teamSlug(rec0.opp))}` } : {};
                        })()),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Right column: Role distribution, Blue/Red side win rates & @15 lane profile */}
          <div className="space-y-3 min-w-0">
            {topRoles.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted">{tl("Role")}</div>
                <div className="space-y-1">
                  {topRoles.map((r) => {
                    const share = Math.round((r.p / totalRoles) * 100);
                    return (
                      <HubLink
                        key={r.r}
                        to={{ kind: "counters", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}&role=${encodeURIComponent(r.r)}` }}
                        className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs rounded px-1 -mx-1 hover:bg-rw-raised/50 transition-colors"
                      >
                        <span className="font-semibold text-rw-text truncate">{roleName(r.r)}</span>
                        <div className="h-2 rounded-full bg-rw-raised overflow-hidden">
                          <div className="h-full rounded-full bg-rw-accent" style={{ width: `${Math.max(4, share)}%` }} />
                        </div>
                        <span className="font-mono tabular-nums text-rw-sub text-[11px] min-w-[5.5rem] text-right">
                          {share}% <span className="text-rw-muted">({fmtNum(r.p)})</span>
                        </span>
                      </HubLink>
                    );
                  })}
                </div>
              </div>
            )}

            {hasSides && (
              <div className="grid grid-cols-2 gap-2">
                <HubLink
                  to={{ kind: "finder", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}&side=b` }}
                  className="block rounded-lg border border-rw-border bg-rw-bg/50 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-2.5 py-2 space-y-1 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold flex items-center gap-1.5" style={{ color: "#4a9eff" }}>
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#4a9eff" }} />
                      {tl("Blue side")}
                    </span>
                    <span className="font-mono tabular-nums text-rw-text font-bold">{winRate(blueW, blueG)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-rw-raised overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(blueWr)}%`, background: "#4a9eff" }} />
                  </div>
                  <div className="text-[10px] text-rw-muted font-mono tabular-nums">
                    {blueW}W – {blueG - blueW}L ({fmtNum(blueG)}G)
                  </div>
                </HubLink>

                <HubLink
                  to={{ kind: "finder", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}&side=r` }}
                  className="block rounded-lg border border-rw-border bg-rw-bg/50 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-2.5 py-2 space-y-1 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold flex items-center gap-1.5" style={{ color: "var(--rw-red)" }}>
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--rw-red)" }} />
                      {tl("Red side")}
                    </span>
                    <span className="font-mono tabular-nums text-rw-text font-bold">{winRate(redW, redG)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-rw-raised overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(redWr)}%`, background: "var(--rw-red)" }} />
                  </div>
                  <div className="text-[10px] text-rw-muted font-mono tabular-nums">
                    {redW}W – {redG - redW}L ({fmtNum(redG)}G)
                  </div>
                </HubLink>
              </div>
            )}

            {lane && lane[2] >= 5 && (
              <div className="grid grid-cols-4 gap-2">
                <HubLink
                  to={{ kind: "counters", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}&role=${encodeURIComponent(primaryRole)}` }}
                  className="block rounded-lg border border-rw-border bg-rw-bg/40 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-2 py-1.5 transition-colors"
                >
                  <div className="text-[10px] uppercase tracking-wider text-rw-muted">GD@15</div>
                  <div className={`text-xs font-bold font-mono tabular-nums ${(lane[3] || 0) >= 0 ? "text-rw-teal" : "text-rw-red"}`}>
                    {signed(lane[3])}
                  </div>
                  <div className="text-[10px] text-rw-muted truncate">{roleName(primaryRole)}</div>
                </HubLink>
                <HubLink
                  to={{ kind: "counters", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}&role=${encodeURIComponent(primaryRole)}` }}
                  className="block rounded-lg border border-rw-border bg-rw-bg/40 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-2 py-1.5 transition-colors"
                >
                  <div className="text-[10px] uppercase tracking-wider text-rw-muted">CSD@15</div>
                  <div className={`text-xs font-bold font-mono tabular-nums ${(lane[4] || 0) >= 0 ? "text-rw-teal" : "text-rw-red"}`}>
                    {signed(lane[4])}
                  </div>
                  <div className="text-[10px] text-rw-muted truncate">{roleName(primaryRole)}</div>
                </HubLink>
                <HubLink
                  to={{ kind: "counters", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}&role=${encodeURIComponent(primaryRole)}` }}
                  className="block rounded-lg border border-rw-border bg-rw-bg/40 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-2 py-1.5 transition-colors"
                >
                  <div className="text-[10px] uppercase tracking-wider text-rw-muted">XPD@15</div>
                  <div className={`text-xs font-bold font-mono tabular-nums ${(lane[5] || 0) >= 0 ? "text-rw-teal" : "text-rw-red"}`}>
                    {signed(lane[5])}
                  </div>
                  <div className="text-[10px] text-rw-muted truncate">{roleName(primaryRole)}</div>
                </HubLink>
                <HubLink
                  to={{ kind: "counters", query: `champ=${encodeURIComponent(c.u || resolveChampSlug(c.name))}&role=${encodeURIComponent(primaryRole)}` }}
                  className="block rounded-lg border border-rw-border bg-rw-bg/40 hover:border-rw-accent/60 hover:bg-rw-raised/40 px-2 py-1.5 transition-colors"
                >
                  <div className="text-[10px] uppercase tracking-wider text-rw-muted">{tl("Lane %")}</div>
                  <div
                    className={`text-xs font-bold font-mono tabular-nums ${
                      (lane[6] || 0) / Math.max(1, lane[2]) >= 0.5 ? "text-rw-teal" : "text-rw-red"
                    }`}
                  >
                    {Math.round(((lane[6] || 0) / Math.max(1, lane[2])) * 100)}%
                  </div>
                  <div className="text-[10px] text-rw-muted truncate">{fmtNum(lane[2])}G</div>
                </HubLink>
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
};

