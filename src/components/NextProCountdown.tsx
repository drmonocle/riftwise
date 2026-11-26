/**
 * Compact countdown to the next official pro match or Primary tournament kickoff.
 * Prefers Riot's live schedule when an unstarted match is in the current window, and
 * seamlessly falls back to stats/latest.json's `nextPro` during off-season gaps.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { locale, tl } from "../i18n";
import { statsNextPro, type NextPro } from "../stats";
import { navigateHub, type HubRoute } from "../hub/route";
import type { Match } from "../types";
import type { TabKey } from "./Navigation";

export interface NextProTarget {
  source: "schedule" | "nextPro";
  exactTime: boolean;
  atMs?: number;
  dateStr: string;
  label: string;
  shortLabel: string;
  subLabel?: string;
  route?: HubRoute;
  tab?: "schedule";
}

function calendarDaysUntil(dateStr: string, nowMs: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const targetUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date(nowMs);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

/** Format a local calendar date like "Jan 15, 2027" from YYYY-MM-DD without timezone shifts. */
export function formatKickoffDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return dateStr;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Pure resolver for unit tests & UI: picks live Riot upcoming match first, else stats `nextPro`. */
export function resolveNextProTarget(
  schedule: Match[] | undefined,
  liveMatches: Match[] | undefined,
  nextPro: NextPro | null | undefined,
  nowMs: number = Date.now(),
): NextProTarget | null {
  if (liveMatches?.some((m) => m.state === "inProgress")) return null;

  const upcoming = (schedule || [])
    .map((m) => ({ m, at: Date.parse(m.startTimeUtc) }))
    .filter((x) => x.m.state === "unstarted" && Number.isFinite(x.at) && x.at > nowMs)
    .sort((a, b) => a.at - b.at);

  if (upcoming.length > 0) {
    const { m, at } = upcoming[0];
    const knownTeams = Boolean(m.team1Code && m.team2Code && !/^tbd$/i.test(m.team1Code) && !/^tbd$/i.test(m.team2Code));
    const label = knownTeams ? `${m.team1Code} vs ${m.team2Code}` : m.leagueName || m.blockName || tl("Next official pro game");
    const subLabel = knownTeams ? [m.leagueName, m.blockName].filter(Boolean).join(" · ") || undefined : m.blockName || undefined;
    return {
      source: "schedule",
      exactTime: true,
      atMs: at,
      dateStr: m.startTimeUtc.slice(0, 10),
      label,
      shortLabel: knownTeams ? `${m.team1Code} vs ${m.team2Code}` : m.leagueName || label,
      subLabel,
      tab: "schedule",
    };
  }

  if (!nextPro) return null;

  if (nextPro.at) {
    const atMs = Date.parse(nextPro.at);
    if (Number.isFinite(atMs) && atMs > nowMs) {
      const hasMatchup = Boolean(nextPro.a && nextPro.b);
      const label = hasMatchup ? `${nextPro.a} vs ${nextPro.b}` : nextPro.n;
      const route: HubRoute | undefined = nextPro.u
        ? { kind: "event", slug: nextPro.u }
        : nextPro.lu
          ? { kind: "league", slug: nextPro.lu }
          : undefined;
      return {
        source: "nextPro",
        exactTime: true,
        atMs,
        dateStr: nextPro.d || nextPro.at.slice(0, 10),
        label,
        shortLabel: label,
        subLabel: hasMatchup ? nextPro.n : nextPro.l && nextPro.l !== nextPro.n ? nextPro.l : undefined,
        route,
        tab: route ? undefined : "schedule",
      };
    }
  }

  if (nextPro.d) {
    const days = calendarDaysUntil(nextPro.d, nowMs);
    if (days === null || days < 0) return null;
    const route: HubRoute | undefined = nextPro.u
      ? { kind: "event", slug: nextPro.u }
      : nextPro.lu
        ? { kind: "league", slug: nextPro.lu }
        : undefined;
    return {
      source: "nextPro",
      exactTime: false,
      dateStr: nextPro.d,
      label: nextPro.n,
      shortLabel: nextPro.n,
      subLabel: nextPro.l && nextPro.l !== nextPro.n ? nextPro.l : undefined,
      route,
      tab: route ? undefined : "schedule",
    };
  }

  return null;
}

export function formatCountdownText(target: NextProTarget, nowMs: number = Date.now(), compact = false): string {
  if (target.exactTime && target.atMs !== undefined) {
    const totalSec = Math.max(0, Math.floor((target.atMs - nowMs) / 1000));
    const days = Math.floor(totalSec / 86400);
    const totalHours = Math.floor(totalSec / 3600);
    const remHours = totalHours % 24;
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (compact) {
      if (days >= 1) return tl("{d}d {h}h", { d: days, h: remHours });
      if (totalHours >= 1) return tl("{h}h {m}m", { h: totalHours, m: minutes });
      return tl("{m}m {s}s", { m: minutes, s: seconds });
    }
    if (totalHours > 24) return tl("Starts in {d}d {h}h {m}m", { d: days, h: remHours, m: minutes });
    if (totalHours > 0) return tl("Starts in {h}h {m}m {s}s", { h: totalHours, m: minutes, s: seconds });
    return tl("Starts in {m}m {s}s", { m: minutes, s: seconds });
  }
  const days = calendarDaysUntil(target.dateStr, nowMs);
  if (days === null || days <= 0) return tl("Today");
  return compact ? tl("{d}d", { d: days }) : tl("Starts in {d}d", { d: days });
}

export function useNextProGame(schedule?: Match[], liveMatches?: Match[], fallback?: NextPro | null) {
  const [loadedNextPro, setLoadedNextPro] = useState<NextPro | null>(fallback ?? null);
  useEffect(() => {
    if (fallback !== undefined) {
      setLoadedNextPro(fallback);
      return;
    }
    let alive = true;
    statsNextPro().then((n) => {
      if (alive) setLoadedNextPro(n);
    });
    return () => {
      alive = false;
    };
  }, [fallback]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const target = useMemo(
    () => resolveNextProTarget(schedule, liveMatches, loadedNextPro, nowMs),
    [schedule, liveMatches, loadedNextPro, nowMs],
  );

  const fastTick = Boolean(target?.exactTime && target.atMs !== undefined && target.atMs - nowMs < 86_400_000);
  useEffect(() => {
    if (!target) return;
    const ms = fastTick ? 1000 : 30_000;
    const id = window.setInterval(() => setNowMs(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [target, fastTick]);

  return target ? { target, nowMs } : null;
}

function openTarget(target: NextProTarget, onSelectTab?: (tab: TabKey) => void) {
  if (target.route) {
    navigateHub(target.route);
    return;
  }
  if (target.tab && onSelectTab) {
    onSelectTab(target.tab);
    return;
  }
  navigateHub({ kind: "moves" });
}

/** Compact header pill shown when no match or broadcast is currently live. */
export const HeaderNextProPill: React.FC<{
  schedule?: Match[];
  liveMatches?: Match[];
  onSelectTab?: (tab: TabKey) => void;
}> = ({ schedule, liveMatches, onSelectTab }) => {
  const next = useNextProGame(schedule, liveMatches);
  if (!next) return null;
  const { target, nowMs } = next;
  const cdCompact = formatCountdownText(target, nowMs, true);
  const cdFull = formatCountdownText(target, nowMs, false);
  const dateFull = formatKickoffDate(target.dateStr);
  return (
    <button
      type="button"
      onClick={() => openTarget(target, onSelectTab)}
      className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs whitespace-nowrap border transition-colors min-w-0 bg-rw-surface border-rw-border hover:border-rw-accent/60 text-rw-text"
      title={`${tl("Next official pro game")}: ${target.label}${target.subLabel ? ` (${target.subLabel})` : ""} · ${dateFull} · ${cdFull}`}
    >
      <Clock className="w-3.5 h-3.5 text-rw-accent shrink-0" />
      <span className="truncate font-medium max-w-[10rem] hidden lg:inline">{target.shortLabel}</span>
      <span className="font-num tabular-nums font-bold text-rw-accent">{cdCompact}</span>
    </button>
  );
};

/** Compact countdown strip / pill banner for HubHome off-season, LiveView idle header, and ScheduleView empty state. */
export const NextProBanner: React.FC<{
  schedule?: Match[];
  liveMatches?: Match[];
  fallback?: NextPro | null;
  onSelectTab?: (tab: TabKey) => void;
  compact?: boolean;
  actions?: React.ReactNode;
}> = ({ schedule, liveMatches, fallback, onSelectTab, compact, actions }) => {
  const next = useNextProGame(schedule, liveMatches, fallback);
  if (!next) return null;
  const { target, nowMs } = next;
  const cd = formatCountdownText(target, nowMs, false);
  const dateLabel = formatKickoffDate(target.dateStr);

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => openTarget(target, onSelectTab)}
        className="inline-flex flex-wrap items-center justify-center gap-2 px-3 py-1 rounded-full bg-rw-panel border border-rw-border hover:border-rw-accent/60 text-xs transition-colors max-w-full"
      >
        <Clock className="w-3.5 h-3.5 text-rw-accent shrink-0" />
        <span className="text-rw-muted font-semibold uppercase tracking-wider text-[10px]">{tl("Next official pro game")}</span>
        <span className="font-semibold text-rw-text">{target.label}</span>
        <span className="text-rw-muted">· {dateLabel} ·</span>
        <span className="font-num tabular-nums font-bold text-rw-accent">{cd}</span>
      </button>
    );
  }

  return (
    <div className="bg-rw-panel border border-rw-border rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 max-w-full text-xs">
        <span className="inline-flex items-center gap-1.5 font-head text-[11px] font-semibold uppercase tracking-[0.12em] text-rw-accent">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          {tl("Next official pro game")}
        </span>
        <button
          type="button"
          onClick={() => openTarget(target, onSelectTab)}
          className="font-head text-sm font-bold text-rw-text hover:text-rw-accent hover:underline max-w-full break-words text-left"
        >
          {target.label}
        </button>
        {target.subLabel && <span className="text-rw-muted max-w-full break-words">{target.subLabel}</span>}
        <span className="text-rw-muted">· {dateLabel}</span>
        <span className="font-num tabular-nums px-2 py-0.5 rounded-full bg-rw-accent/10 border border-rw-accent/40 text-rw-accent font-bold text-[11px]">
          {cd}
        </span>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 text-xs max-w-full">{actions}</div>}
    </div>
  );
};
