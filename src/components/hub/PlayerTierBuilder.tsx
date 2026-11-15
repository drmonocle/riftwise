/**
 * Interactive Player & Team Tier List Studio (`TierMaker`-style S/A/B/C/D board + live Oracle's Elixir / tournament stats + inline Dossier inspector).
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, roleName, fmtDec } from "../../i18n";
import { loadHubEvent, loadHubIndexQuick, prettySlug, resolveTeamAlias } from "../../hub/data";
import type { EventPlayer, EventTeamStats, HubEvent, SearchEventRow, SeriesRow } from "../../hub/types";
import { ROLES, normalizeRole } from "../../hub/champAgg";
import { hubShareUrl } from "../../hub/route";
import { ChampIcon, EventLink, HubLink, Loading, PlayerLink, PlayerPhoto, RevealButton, Section, TeamLink, TeamLogo, card, fmtNum, useHidden, useLoad } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { per } from "./SortTable";

export type TierLevel = "S" | "A" | "B" | "C" | "D";
export type TierBucket = TierLevel | "pool";
export type StudioMode = "players" | "teams";

export const TIER_LEVELS: { t: TierLevel; color: string }[] = [
  { t: "S", color: "#ff6b81" },
  { t: "A", color: "#ffa94d" },
  { t: "B", color: "#e0b86b" },
  { t: "C", color: "#b39dff" },
  { t: "D", color: "#7b8298" },
];

const signed = (s: string | null) => (s == null ? null : s.startsWith("-") || s === "0" || s === "0.0" ? s : `+${s}`);
const fmtPer = (n: number, d: number, digits = 1): string | null => {
  const v = per(n, d, digits);
  if (v == null) return null;
  return digits === 0 ? String(Math.round(v)) : v.toFixed(digits);
};
const pctStr = (num: number | undefined, den: number | undefined) => {
  if (!den) return null;
  const v = (num || 0) / den;
  return `${Math.round(v * 100)}%`;
};

export interface StatOption<T> {
  key: string;
  labelKey: string;
  short: string;
  low?: boolean;
  value: (x: T) => number | null;
  format: (x: T) => string | null;
}

export const PLAYER_TIER_STATS: StatOption<EventPlayer>[] = [
  {
    key: "kda",
    labelKey: "KDA",
    short: "KDA",
    value: (p) => (p.g ? (p.k + p.a) / Math.max(p.d, 1) : null),
    format: (p) => fmtPer(p.k + p.a, Math.max(p.d, 1), 2),
  },
  {
    key: "wr",
    labelKey: "Win %",
    short: "W%",
    value: (p) => (p.g ? p.w / p.g : null),
    format: (p) => pctStr(p.w, p.g),
  },
  {
    key: "dpm",
    labelKey: "DPM",
    short: "DPM",
    value: (p) => (p.dmg ? per(p.dmg, p.dm ?? p.min, 0) : null),
    format: (p) => (p.dmg ? fmtPer(p.dmg, p.dm ?? p.min, 0) : null),
  },
  {
    key: "dmgs",
    labelKey: "DMG%",
    short: "DMG%",
    value: (p) => (p.td ? (p.sd || 0) / p.td : null),
    format: (p) => pctStr(p.sd, p.td),
  },
  {
    key: "kp",
    labelKey: "Kill participation",
    short: "KP%",
    value: (p) => (p.tk ? (p.k + p.a) / p.tk : null),
    format: (p) => pctStr(p.k + p.a, p.tk),
  },
  {
    key: "ks",
    labelKey: "KS%",
    short: "KS%",
    value: (p) => (p.tk ? p.k / p.tk : null),
    format: (p) => pctStr(p.k, p.tk),
  },
  {
    key: "dth",
    labelKey: "DTH%",
    short: "DTH%",
    low: true,
    value: (p) => (p.tdth ? p.d / p.tdth : null),
    format: (p) => pctStr(p.d, p.tdth),
  },
  {
    key: "g15",
    labelKey: "Gold lead over the lane opponent at 15 minutes",
    short: "GD@15",
    value: (p) => (p.tn ? (p.g15 || 0) / p.tn : null),
    format: (p) => (p.tn ? signed(fmtPer(p.g15 || 0, p.tn, 0)) : null),
  },
  {
    key: "c15",
    labelKey: "CS lead over the lane opponent at 15 minutes",
    short: "CSD@15",
    value: (p) => (p.tn ? (p.c15 || 0) / p.tn : null),
    format: (p) => (p.tn ? signed(fmtPer(p.c15 || 0, p.tn, 1)) : null),
  },
  {
    key: "g10",
    labelKey: "Gold lead over the lane opponent at 10 minutes",
    short: "GD@10",
    value: (p) => (p.tn10 ? (p.g10 || 0) / p.tn10 : null),
    format: (p) => (p.tn10 ? signed(fmtPer(p.g10 || 0, p.tn10, 0)) : null),
  },
  {
    key: "ctr",
    labelKey: "CTR%",
    short: "CTR%",
    value: (p) => (p.ctrg ? (p.ctr || 0) / p.ctrg : null),
    format: (p) => pctStr(p.ctr, p.ctrg),
  },
  {
    key: "gpm",
    labelKey: "GPM",
    short: "GPM",
    value: (p) => (p.min ? p.gold / p.min : null),
    format: (p) => fmtPer(p.gold, p.min, 0),
  },
];

export const TEAM_TIER_STATS: StatOption<EventTeamStats>[] = [
  {
    key: "wr",
    labelKey: "Win %",
    short: "W%",
    value: (t) => (t.g ? t.w / t.g : null),
    format: (t) => pctStr(t.w, t.g),
  },
  {
    key: "kd",
    labelKey: "Kills to deaths",
    short: "K:D",
    value: (t) => (t.g ? t.k / Math.max(t.d, 1) : null),
    format: (t) => fmtPer(t.k, Math.max(t.d, 1), 2),
  },
  {
    key: "gdm",
    labelKey: "GD/m",
    short: "GD/m",
    value: (t) => (t.min ? t.gd / t.min : null),
    format: (t) => signed(fmtPer(t.gd, t.min, 0)),
  },
  {
    key: "g15",
    labelKey: "Gold lead at 15 minutes",
    short: "GD@15",
    value: (t) => (t.tn ? (t.g15 || 0) / t.tn : null),
    format: (t) => (t.tn ? signed(fmtPer(t.g15 || 0, t.tn, 0)) : null),
  },
  {
    key: "fb",
    labelKey: "First blood rate",
    short: "FB%",
    value: (t) => (t.fbn ? (t.fb || 0) / t.fbn : null),
    format: (t) => pctStr(t.fb, t.fbn),
  },
  {
    key: "ft",
    labelKey: "First tower rate",
    short: "FT%",
    value: (t) => (t.fbn ? (t.ft || 0) / t.fbn : null),
    format: (t) => pctStr(t.ft, t.fbn),
  },
  {
    key: "drap",
    labelKey: "DRA%",
    short: "DRA%",
    value: (t) => (t.odrag != null && t.drag + t.odrag > 0 ? t.drag / (t.drag + t.odrag) : null),
    format: (t) => (t.odrag != null ? pctStr(t.drag, t.drag + t.odrag) : null),
  },
];

export const playerId = (p: EventPlayer) => `${p.u || prettySlug(p.n)}:${p.tu || prettySlug(p.t)}:${normalizeRole(p.r) || p.r}`;
export const teamId = (t: EventTeamStats) => t.u || resolveTeamAlias(t.t) || prettySlug(t.t);
const eventRowSlug = (r: SearchEventRow) => r[1] || prettySlug(r[0]);

const INTL_LEAGUE_RE = /(world championship|mid-season invitational|first stand)/i;

/** Pick a default recent Worlds / Premier tournament slug for the Player Tier List Studio. */
export function pickDefaultTierEvent(events: SearchEventRow[]): string {
  const withGames = events.filter((r) => (r[6] || 0) > 0);
  const worldsMain = withGames
    .filter((r) => /worlds\s+\d{4}\s+main event/i.test(r[0]))
    .sort((a, b) => (b[5] || b[2]).localeCompare(a[5] || a[2]) || b[6] - a[6]);
  if (worldsMain[0]) return eventRowSlug(worldsMain[0]);

  const intl = withGames
    .filter((r) => INTL_LEAGUE_RE.test(r[3]) && !/play-in/i.test(r[0]))
    .sort((a, b) => (b[5] || b[2]).localeCompare(a[5] || a[2]) || b[6] - a[6]);
  if (intl[0]) return eventRowSlug(intl[0]);

  const premier = withGames
    .filter((r) => r[4] === "P")
    .sort((a, b) => (b[5] || b[2]).localeCompare(a[5] || a[2]) || b[6] - a[6]);
  return premier[0] ? eventRowSlug(premier[0]) : "worlds-2026-main-event";
}

/** Auto-assign items into S / A / B / C / D using percentile quantiles of a chosen metric. */
export function seedItemsByStat<T>(
  items: T[],
  getId: (item: T) => string,
  getValue: (item: T) => number | null,
  lowerIsBetter = false,
): Record<string, TierBucket> {
  const scored = items
    .map((item) => ({ id: getId(item), val: getValue(item) }))
    .filter((x): x is { id: string; val: number } => x.val != null && Number.isFinite(x.val));
  scored.sort((a, b) => (lowerIsBetter ? a.val - b.val : b.val - a.val));

  const out: Record<string, TierBucket> = {};
  const n = scored.length;
  if (!n) return out;

  scored.forEach((x, idx) => {
    const pct = n === 1 ? 0 : idx / Math.max(1, n - 1);
    const tier: TierLevel =
      pct <= 0.14 ? "S" : pct <= 0.36 ? "A" : pct <= 0.68 ? "B" : pct <= 0.88 ? "C" : "D";
    out[x.id] = tier;
  });
  return out;
}

/** Format the tier list into a clean Markdown block for Discord, Reddit, or cast prep docs. */
export function formatTierListMarkdown(
  title: string,
  rows: { bucket: string; items: { name: string; sub?: string }[] }[],
  shareUrl?: string,
): string {
  const lines = [`**${title}**`];
  for (const row of rows) {
    if (!row.items.length) continue;
    const text = row.items.map((x) => (x.sub ? `${x.name} (${x.sub})` : x.name)).join(", ");
    lines.push(`- **${row.bucket}**: ${text}`);
  }
  if (shareUrl) lines.push(shareUrl);
  return lines.join("\n");
}

/** Collect every series played by `teamName` / `teamSlug` in `ev.stages`, deduplicated by series slug. */
export function collectTeamEventSeries(ev: HubEvent, teamName: string, teamSlug?: string | null): { stage: string; row: SeriesRow }[] {
  const targetSlug = (teamSlug || resolveTeamAlias(teamName) || prettySlug(teamName)).toLowerCase();
  const targetName = teamName.trim().toLowerCase();
  const seen = new Set<string>();
  const out: { stage: string; row: SeriesRow }[] = [];

  for (const st of ev.stages || []) {
    for (const m of st.series || []) {
      const aMatch = (m.au || "").toLowerCase() === targetSlug || m.a.trim().toLowerCase() === targetName;
      const bMatch = (m.bu || "").toLowerCase() === targetSlug || m.b.trim().toLowerCase() === targetName;
      if (!aMatch && !bMatch) continue;
      const dedupeKey = m.g || `${st.name}|${m.date}|${m.a}|${m.b}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({ stage: st.name, row: m });
    }
  }
  return out.sort((a, b) => (a.row.date || "").localeCompare(b.row.date || ""));
}

const storageKey = (mode: StudioMode, eventSlug: string) => `riftwise:tierboard:v1:${mode}:${eventSlug}`;

function readSavedPlacements(mode: StudioMode, eventSlug: string): Record<string, TierBucket> {
  if (typeof window === "undefined" || !eventSlug) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(mode, eventSlug));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export const PlayerTierBuilder: React.FC<{
  mode: StudioMode;
  eventSlug?: string;
  query?: string;
  onSelectEvent: (slug: string) => void;
  headerSwitcher: React.ReactNode;
}> = ({ mode, eventSlug: askedEvent, query, onSelectEvent, headerSwitcher }) => {
  const idx = useLoad(loadHubIndexQuick, []);
  const resolvedDefault = useMemo(() => {
    if (askedEvent) return askedEvent;
    if (idx.data?.events?.length) return pickDefaultTierEvent(idx.data.events);
    return "worlds-2026-main-event";
  }, [askedEvent, idx.data]);

  const evState = useLoad(() => loadHubEvent(resolvedDefault), [resolvedDefault]);
  const [role, setRole] = useState<string>("All");
  const [minGp, setMinGp] = useState<number>(3);
  const [statKey, setStatKey] = useState<string>(mode === "players" ? "kda" : "wr");
  const [seedStatKey, setSeedStatKey] = useState<string>(mode === "players" ? "kda" : "wr");
  const [filterText, setFilterText] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [placements, setPlacements] = useState<Record<string, TierBucket>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TierBucket | null>(null);
  const [copiedState, setCopiedState] = useState<"idle" | "copied" | "failed">("idle");

  // Reset stat keys cleanly when switching between players and teams.
  useEffect(() => {
    setStatKey(mode === "players" ? "kda" : "wr");
    setSeedStatKey(mode === "players" ? "kda" : "wr");
    setSelectedId(null);
  }, [mode]);

  // Load saved board from localStorage when tournament or mode changes.
  useEffect(() => {
    setPlacements(readSavedPlacements(mode, resolvedDefault));
    setSelectedId(null);
  }, [mode, resolvedDefault]);

  const updatePlacements = (next: Record<string, TierBucket>) => {
    setPlacements(next);
    if (typeof window !== "undefined" && resolvedDefault) {
      try {
        window.localStorage.setItem(storageKey(mode, resolvedDefault), JSON.stringify(next));
      } catch {
        // Ignore quota errors in private browsing.
      }
    }
  };

  const setBucket = (id: string, bucket: TierBucket) => {
    const next = { ...placements };
    if (bucket === "pool") delete next[id];
    else next[id] = bucket;
    updatePlacements(next);
  };

  // Curate Premier / International events list for the selector.
  const eventGroups = useMemo(() => {
    const raw = (idx.data?.events || []).filter((r) => (r[6] || 0) > 0 && r[4] === "P");
    const qLower = eventSearch.trim().toLowerCase();
    const filtered = qLower
      ? raw.filter((r) => r[0].toLowerCase().includes(qLower) || r[3].toLowerCase().includes(qLower) || r[2].includes(qLower))
      : raw;
    const sorted = [...filtered].sort((a, b) => (b[5] || b[2]).localeCompare(a[5] || a[2]) || b[6] - a[6]);
    const intl = sorted.filter((r) => INTL_LEAGUE_RE.test(r[3])).slice(0, 45);
    const regional = sorted.filter((r) => !INTL_LEAGUE_RE.test(r[3])).slice(0, qLower ? 60 : 40);
    return { intl, regional };
  }, [idx.data, eventSearch]);

  const ev = evState.data;
  const [spoilerHidden, revealSpoilers] = useHidden(ev ? `event:${ev.u}` : "tier-none", ev?.end);

  const playerMaxG = useMemo(() => Math.max(0, ...(ev?.players || []).map((p) => p.g)), [ev]);
  const teamMaxG = useMemo(() => Math.max(0, ...(ev?.teamStats || []).map((t) => t.g)), [ev]);
  const effectiveMinGp = mode === "players" ? (playerMaxG < 3 ? 1 : minGp) : teamMaxG < 3 ? 1 : minGp;

  const filteredPlayers = useMemo(() => {
    if (!ev?.players?.length) return [];
    const ql = filterText.trim().toLowerCase();
    return ev.players.filter((p) => {
      const nr = normalizeRole(p.r) || p.r;
      if (role !== "All" && nr !== role) return false;
      if (effectiveMinGp > 1 && p.g < effectiveMinGp) return false;
      if (ql && !p.n.toLowerCase().includes(ql) && !p.t.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [ev, role, effectiveMinGp, filterText]);

  const filteredTeams = useMemo(() => {
    if (!ev?.teamStats?.length) return [];
    const ql = filterText.trim().toLowerCase();
    return ev.teamStats.filter((t) => {
      if (effectiveMinGp > 1 && t.g < effectiveMinGp) return false;
      if (ql && !t.t.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [ev, effectiveMinGp, filterText]);

  const availablePlayerStats = useMemo(() => {
    const ps = ev?.players || [];
    return PLAYER_TIER_STATS.filter((m) => ps.length === 0 || ps.some((p) => m.value(p) != null));
  }, [ev]);

  const availableTeamStats = useMemo(() => {
    const ts = ev?.teamStats || [];
    return TEAM_TIER_STATS.filter((m) => ts.length === 0 || ts.some((t) => m.value(t) != null));
  }, [ev]);

  const activePlayerStat = availablePlayerStats.find((m) => m.key === statKey) || availablePlayerStats[0] || PLAYER_TIER_STATS[0];
  const activeTeamStat = availableTeamStats.find((m) => m.key === statKey) || availableTeamStats[0] || TEAM_TIER_STATS[0];

  const groupedPlayers = useMemo(() => {
    const map = new Map<TierBucket, EventPlayer[]>([["S", []], ["A", []], ["B", []], ["C", []], ["D", []], ["pool", []]]);
    for (const p of filteredPlayers) {
      const b = placements[playerId(p)] || "pool";
      (map.get(b) || map.get("pool")!).push(p);
    }
    const stat = activePlayerStat;
    for (const list of map.values()) {
      list.sort((a, b) => {
        const va = stat.value(a);
        const vb = stat.value(b);
        if (va != null && vb != null && va !== vb) return stat.low ? va - vb : vb - va;
        return b.g - a.g || a.n.localeCompare(b.n);
      });
    }
    return map;
  }, [filteredPlayers, placements, activePlayerStat]);

  const groupedTeams = useMemo(() => {
    const map = new Map<TierBucket, EventTeamStats[]>([["S", []], ["A", []], ["B", []], ["C", []], ["D", []], ["pool", []]]);
    for (const t of filteredTeams) {
      const b = placements[teamId(t)] || "pool";
      (map.get(b) || map.get("pool")!).push(t);
    }
    const stat = activeTeamStat;
    for (const list of map.values()) {
      list.sort((a, b) => {
        const va = stat.value(a);
        const vb = stat.value(b);
        if (va != null && vb != null && va !== vb) return stat.low ? va - vb : vb - va;
        return b.g - a.g || a.t.localeCompare(b.t);
      });
    }
    return map;
  }, [filteredTeams, placements, activeTeamStat]);

  const selectedPlayer = useMemo(
    () => (mode === "players" && selectedId ? ev?.players?.find((p) => playerId(p) === selectedId) || null : null),
    [mode, selectedId, ev],
  );
  const selectedTeam = useMemo(
    () => (mode === "teams" && selectedId ? ev?.teamStats?.find((t) => teamId(t) === selectedId) || null : null),
    [mode, selectedId, ev],
  );

  const dossierSeries = useMemo(() => {
    if (!ev) return [];
    if (selectedPlayer) return collectTeamEventSeries(ev, selectedPlayer.t, selectedPlayer.tu);
    if (selectedTeam) return collectTeamEventSeries(ev, selectedTeam.t, selectedTeam.u);
    return [];
  }, [ev, selectedPlayer, selectedTeam]);

  const handleAutoSeed = () => {
    if (mode === "players") {
      const m = availablePlayerStats.find((x) => x.key === seedStatKey) || activePlayerStat;
      const seeded = seedItemsByStat(filteredPlayers, playerId, m.value, m.low);
      // Merge so un-filtered roles keep any placements user already set.
      updatePlacements({ ...placements, ...seeded });
    } else {
      const m = availableTeamStats.find((x) => x.key === seedStatKey) || activeTeamStat;
      const seeded = seedItemsByStat(filteredTeams, teamId, m.value, m.low);
      updatePlacements({ ...placements, ...seeded });
    }
  };

  const handleCopyMarkdown = () => {
    const title = `${ev?.n || resolvedDefault} · ${mode === "players" ? (role === "All" ? tl("Player tier list") : `${roleName(role)} ${tl("Player tier list")}`) : tl("Team tier list")}`;
    const rows = TIER_LEVELS.map(({ t }) => {
      if (mode === "players") {
        const items = (groupedPlayers.get(t) || []).map((p) => ({
          name: `${p.n} (${p.t})`,
          sub: activePlayerStat.format(p) ? `${activePlayerStat.short}: ${activePlayerStat.format(p)}` : undefined,
        }));
        return { bucket: t, items };
      }
      const items = (groupedTeams.get(t) || []).map((tm) => ({
        name: tm.t,
        sub: activeTeamStat.format(tm) ? `${activeTeamStat.short}: ${activeTeamStat.format(tm)}` : undefined,
      }));
      return { bucket: t, items };
    });
    const url = hubShareUrl({ kind: "tiers", ...(query ? { query } : {}) });
    navigator.clipboard?.writeText(formatTierListMarkdown(title, rows, url)).then(
      () => {
        setCopiedState("copied");
        setTimeout(() => setCopiedState("idle"), 1600);
      },
      () => {
        setCopiedState("failed");
        setTimeout(() => setCopiedState("idle"), 1600);
      },
    );
  };

  const placedCount = TIER_LEVELS.reduce(
    (sum, { t }) => sum + (mode === "players" ? (groupedPlayers.get(t) || []).length : (groupedTeams.get(t) || []).length),
    0,
  );

  const selCls = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-xs text-rw-text focus:border-rw-accent focus:outline-none";

  const renderPlayerCard = (p: EventPlayer, inTier: TierBucket) => {
    const id = playerId(p);
    const active = selectedId === id;
    const pillVal = activePlayerStat.format(p);
    const nr = normalizeRole(p.r) || p.r;
    return (
      <div
        key={id}
        draggable
        onDragStart={(e) => {
          setDragId(id);
          e.dataTransfer.setData("text/plain", id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropTarget(null);
        }}
        onClick={() => setSelectedId(active ? null : id)}
        className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing select-none transition-colors ${
          active
            ? "border-rw-accent bg-rw-accent/15 ring-1 ring-rw-accent"
            : "border-rw-border bg-rw-bg/70 hover:border-rw-accent/60"
        }`}
        title={`${p.n} · ${p.t} · ${roleName(nr)} · ${p.g}G`}
      >
        <PlayerPhoto name={p.n} slug={p.u ?? undefined} size={28} />
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-rw-text truncate max-w-[96px]">{p.n}</span>
            {role === "All" && (
              <span className="text-[9px] font-bold uppercase px-1 rounded bg-rw-raised text-rw-muted">{nr.slice(0, 3)}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-rw-sub mt-0.5">
            <TeamLogo name={p.t} size={12} />
            <span className="tabular-nums font-mono text-rw-accent font-semibold">
              {activePlayerStat.short} {pillVal ?? "–"}
            </span>
          </div>
        </div>
        {inTier !== "pool" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBucket(id, "pool");
            }}
            className="opacity-0 group-hover:opacity-100 ml-0.5 text-[10px] text-rw-muted hover:text-rw-red px-1"
            title={tl("Return to pool")}
            aria-label={tl("Return to pool")}
          >
            ×
          </button>
        )}
      </div>
    );
  };

  const renderTeamCard = (tm: EventTeamStats, inTier: TierBucket) => {
    const id = teamId(tm);
    const active = selectedId === id;
    const pillVal = activeTeamStat.format(tm);
    return (
      <div
        key={id}
        draggable
        onDragStart={(e) => {
          setDragId(id);
          e.dataTransfer.setData("text/plain", id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropTarget(null);
        }}
        onClick={() => setSelectedId(active ? null : id)}
        className={`group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-grab active:cursor-grabbing select-none transition-colors ${
          active
            ? "border-rw-accent bg-rw-accent/15 ring-1 ring-rw-accent"
            : "border-rw-border bg-rw-bg/70 hover:border-rw-accent/60"
        }`}
        title={`${tm.t} · ${tm.g}G`}
      >
        <TeamLogo name={tm.t} size={22} />
        <div className="min-w-0 leading-tight">
          <div className="font-semibold text-rw-text truncate max-w-[120px]">{tm.t}</div>
          <div className="text-[10px] font-mono tabular-nums text-rw-accent font-semibold">
            {activeTeamStat.short} {pillVal ?? "–"} · {tm.g}G
          </div>
        </div>
        {inTier !== "pool" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBucket(id, "pool");
            }}
            className="opacity-0 group-hover:opacity-100 ml-0.5 text-[10px] text-rw-muted hover:text-rw-red px-1"
            title={tl("Return to pool")}
            aria-label={tl("Return to pool")}
          >
            ×
          </button>
        )}
      </div>
    );
  };

  const poolCount = mode === "players" ? (groupedPlayers.get("pool") || []).length : (groupedTeams.get("pool") || []).length;

  return (
    <div className="space-y-3">
      <div className={`${card} space-y-2.5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-bold text-rw-text">
              {mode === "players" ? tl("Player tier list") : tl("Team tier list")}
            </h1>
            {headerSwitcher}
          </div>
          {ev && (
            <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
              <EventLink name={ev.n} u={ev.u} />
              <SectionCard
                section={mode === "players" ? tl("Player tier list") : tl("Team tier list")}
                name={ev.n}
                sub={mode === "players" && role !== "All" ? roleName(role) : `${placedCount || (mode === "players" ? filteredPlayers.length : filteredTeams.length)} ranked`}
                rows={() => {
                  const placedRows = TIER_LEVELS.flatMap(({ t }) =>
                    mode === "players"
                      ? (groupedPlayers.get(t) || []).map((p) => ({
                          rank: t,
                          team: p.t,
                          label: `${p.n} (${p.t})`,
                          sub: `${roleName(normalizeRole(p.r) || p.r)} · ${p.w}-${p.g - p.w}`,
                          value: activePlayerStat.format(p) ? `${activePlayerStat.short} ${activePlayerStat.format(p)}` : `${p.g}G`,
                          win: p.w >= p.g / 2,
                        }))
                      : (groupedTeams.get(t) || []).map((tm) => ({
                          rank: t,
                          team: tm.t,
                          label: tm.t,
                          sub: `${tm.w}-${tm.g - tm.w}`,
                          value: activeTeamStat.format(tm) ? `${activeTeamStat.short} ${activeTeamStat.format(tm)}` : `${tm.g}G`,
                          win: tm.w >= tm.g / 2,
                        })),
                  );
                  if (placedRows.length > 0) return placedRows.slice(0, 12);
                  return mode === "players"
                    ? filteredPlayers.slice(0, 10).map((p, i) => ({
                        rank: i + 1,
                        team: p.t,
                        label: `${p.n} (${p.t})`,
                        sub: roleName(normalizeRole(p.r) || p.r),
                        value: activePlayerStat.format(p) || `${p.g}G`,
                      }))
                    : filteredTeams.slice(0, 10).map((tm, i) => ({
                        rank: i + 1,
                        team: tm.t,
                        label: tm.t,
                        value: activeTeamStat.format(tm) || `${tm.g}G`,
                      }));
                }}
              />
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="px-2 py-0.5 rounded border border-rw-border bg-rw-surface text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
              >
                {copiedState === "copied" ? tl("Copied") : copiedState === "failed" ? tl("Couldn't copy") : tl("Copy Markdown")}
              </button>
            </span>
          )}
        </div>

        <p className="text-[11px] text-rw-sub">
          {tl("Drag cards into S–D tiers (or click any card to inspect full tournament stats, champs, and series links). Placements auto-save per tournament.")}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
            placeholder={tl("Filter tournaments…")}
            aria-label={tl("Filter tournaments…")}
            className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-xs text-rw-text placeholder:text-rw-muted w-36 focus:border-rw-accent focus:outline-none"
          />
          <select
            value={ev?.u || resolvedDefault}
            onChange={(e) => onSelectEvent(e.target.value)}
            aria-label={tl("Tournaments")}
            className={`${selCls} max-w-[260px]`}
          >
            {ev && ![...eventGroups.intl, ...eventGroups.regional].some((r) => eventRowSlug(r) === ev.u) && (
              <option value={ev.u}>{ev.n}</option>
            )}
            {eventGroups.intl.length > 0 && (
              <optgroup label={tl("International")}>
                {eventGroups.intl.map((r) => {
                  const slug = eventRowSlug(r);
                  return (
                    <option key={slug} value={slug}>
                      {`${r[0]} (${r[6]}G)`}
                    </option>
                  );
                })}
              </optgroup>
            )}
            {eventGroups.regional.length > 0 && (
              <optgroup label={tl("Regional leagues")}>
                {eventGroups.regional.map((r) => {
                  const slug = eventRowSlug(r);
                  return (
                    <option key={slug} value={slug}>
                      {`${r[0]} (${r[6]}G)`}
                    </option>
                  );
                })}
              </optgroup>
            )}
          </select>

          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={mode === "players" ? tl("Filter player or team…") : tl("Filter team…")}
            aria-label={tl("Filter player or team…")}
            className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-xs text-rw-text placeholder:text-rw-muted w-36 focus:border-rw-accent focus:outline-none"
          />

          <select
            value={String(minGp)}
            onChange={(e) => setMinGp(Number(e.target.value))}
            aria-label={tl("Minimum games")}
            className={selCls}
          >
            <option value="1">{tl("All games")}</option>
            <option value="2">2+ GP</option>
            <option value="3">3+ GP</option>
            <option value="5">5+ GP</option>
            <option value="8">8+ GP</option>
            <option value="10">10+ GP</option>
          </select>

          <select
            value={statKey}
            onChange={(e) => setStatKey(e.target.value)}
            aria-label={tl("Card stat")}
            className={selCls}
          >
            {(mode === "players" ? availablePlayerStats : availableTeamStats).map((m) => (
              <option key={m.key} value={m.key}>
                {`${tl("Card stat")}: ${m.short}`}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-1 ml-auto">
            <select
              value={seedStatKey}
              onChange={(e) => setSeedStatKey(e.target.value)}
              aria-label={tl("Auto-seed metric")}
              className={selCls}
            >
              {(mode === "players" ? availablePlayerStats : availableTeamStats).map((m) => (
                <option key={m.key} value={m.key}>
                  {m.short}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAutoSeed}
              className="px-2.5 py-1 rounded-lg bg-rw-accent text-rw-bg text-xs font-semibold hover:brightness-110"
            >
              {tl("Auto-seed by stat")}
            </button>
            {Object.keys(placements).length > 0 && (
              <button
                type="button"
                onClick={() => updatePlacements({})}
                className="px-2 py-1 rounded-lg border border-rw-border text-xs text-rw-sub hover:text-rw-text"
              >
                {tl("Reset board")}
              </button>
            )}
          </div>
        </div>

        {mode === "players" && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={tl("Role")}>
            {["All", ...ROLES].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`px-2 py-1 rounded border text-xs ${
                  role === r ? "border-rw-accent bg-rw-accent/15 text-rw-accent font-semibold" : "border-rw-border text-rw-sub hover:text-rw-text"
                }`}
              >
                {r === "All" ? tl("All roles") : roleName(r)}
              </button>
            ))}
          </div>
        )}
      </div>

      {evState.loading && <Loading />}

      {ev && (
        <div className={`grid gap-3 items-start ${selectedPlayer || selectedTeam ? "xl:grid-cols-[1fr_360px]" : ""}`}>
          <div className="space-y-3">
            {/* Tier Rows */}
            <div className={`${card} p-0 overflow-hidden divide-y divide-rw-border/60`}>
              {TIER_LEVELS.map(({ t, color }) => {
                const list = mode === "players" ? groupedPlayers.get(t) || [] : groupedTeams.get(t) || [];
                const isOver = dropTarget === t;
                return (
                  <div
                    key={t}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dropTarget !== t) setDropTarget(t);
                    }}
                    onDragLeave={() => {
                      if (dropTarget === t) setDropTarget(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dropped = e.dataTransfer.getData("text/plain") || dragId;
                      if (dropped) setBucket(dropped, t);
                      setDragId(null);
                      setDropTarget(null);
                    }}
                    className={`flex min-h-[72px] transition-colors ${isOver ? "bg-rw-accent/10" : ""}`}
                  >
                    <div
                      className="w-12 sm:w-14 shrink-0 flex flex-col items-center justify-center font-black text-lg text-black select-none"
                      style={{ background: color }}
                    >
                      <span>{t}</span>
                      <span className="text-[9px] font-bold opacity-75">{list.length}</span>
                    </div>
                    <div className="flex-1 flex flex-wrap items-center gap-2 p-2.5">
                      {list.length > 0 ? (
                        mode === "players"
                          ? (list as EventPlayer[]).map((p) => renderPlayerCard(p, t))
                          : (list as EventTeamStats[]).map((tm) => renderTeamCard(tm, t))
                      ) : (
                        <span className="text-[11px] text-rw-muted/60 select-none">
                          {tl("Drop here or use tier buttons in the inspector")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unplaced Pool */}
            <Section title={`${tl("Unplaced pool")} (${poolCount})`}>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dropTarget !== "pool") setDropTarget("pool");
                }}
                onDragLeave={() => {
                  if (dropTarget === "pool") setDropTarget(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.getData("text/plain") || dragId;
                  if (dropped) setBucket(dropped, "pool");
                  setDragId(null);
                  setDropTarget(null);
                }}
                className={`rounded-lg border border-dashed p-2.5 flex flex-wrap gap-2 min-h-[72px] ${
                  dropTarget === "pool" ? "border-rw-accent bg-rw-accent/10" : "border-rw-border bg-rw-bg/40"
                }`}
              >
                {mode === "players"
                  ? (groupedPlayers.get("pool") || []).map((p) => renderPlayerCard(p, "pool"))
                  : (groupedTeams.get("pool") || []).map((tm) => renderTeamCard(tm, "pool"))}
                {poolCount === 0 && (
                  <p className="text-[11px] text-rw-muted">
                    {placedCount > 0 ? tl("Every filtered card is placed on the tier board.") : tl("No players match the current filter.")}
                  </p>
                )}
              </div>
            </Section>
          </div>

          {/* Inline Dossier Panel */}
          {(selectedPlayer || selectedTeam) && (
            <div className={`${card} space-y-3 xl:sticky xl:top-3`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {selectedPlayer ? (
                    <PlayerPhoto name={selectedPlayer.n} slug={selectedPlayer.u ?? undefined} size={48} />
                  ) : selectedTeam ? (
                    <TeamLogo name={selectedTeam.t} size={40} />
                  ) : null}
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-rw-text truncate">
                      {selectedPlayer ? (
                        <PlayerLink name={selectedPlayer.n} u={selectedPlayer.u} />
                      ) : selectedTeam ? (
                        <TeamLink name={selectedTeam.t} u={selectedTeam.u} />
                      ) : null}
                    </div>
                    {selectedPlayer && (
                      <div className="flex items-center gap-1.5 text-xs text-rw-sub mt-0.5">
                        <TeamLogo name={selectedPlayer.t} size={14} />
                        <TeamLink name={selectedPlayer.t} u={selectedPlayer.tu} />
                        <span>· {roleName(normalizeRole(selectedPlayer.r) || selectedPlayer.r)}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-rw-muted tabular-nums mt-0.5">
                      {selectedPlayer
                        ? `${selectedPlayer.g}G · ${selectedPlayer.w}-${selectedPlayer.g - selectedPlayer.w} (${Math.round((selectedPlayer.w / Math.max(1, selectedPlayer.g)) * 100)}%)`
                        : selectedTeam
                          ? `${selectedTeam.g}G · ${selectedTeam.w}-${selectedTeam.g - selectedTeam.w} (${Math.round((selectedTeam.w / Math.max(1, selectedTeam.g)) * 100)}%)`
                          : ""}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-xs text-rw-muted hover:text-rw-text px-1.5 py-0.5 rounded border border-rw-border"
                  aria-label={tl("Close")}
                >
                  ×
                </button>
              </div>

              {/* Quick tier assignment */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-rw-muted mb-1">{tl("Assign tier")}</div>
                <div className="flex flex-wrap gap-1">
                  {TIER_LEVELS.map(({ t, color }) => {
                    const current = selectedId ? placements[selectedId] || "pool" : "pool";
                    const on = current === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => selectedId && setBucket(selectedId, t)}
                        className={`px-2.5 py-1 rounded text-xs font-black border transition-transform ${
                          on ? "text-black border-white scale-105" : "border-rw-border text-rw-text bg-rw-bg hover:border-rw-accent"
                        }`}
                        style={on ? { background: color } : undefined}
                      >
                        {t}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => selectedId && setBucket(selectedId, "pool")}
                    className={`px-2 py-1 rounded text-[11px] border ${
                      selectedId && !placements[selectedId]
                        ? "border-rw-accent text-rw-accent"
                        : "border-rw-border text-rw-sub hover:text-rw-text"
                    }`}
                  >
                    {tl("Pool")}
                  </button>
                </div>
              </div>

              {/* Full stat grid */}
              {selectedPlayer && (
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  {[
                    ["KDA", fmtPer(selectedPlayer.k + selectedPlayer.a, Math.max(selectedPlayer.d, 1), 2) || "–"],
                    ["K/D/A", `${fmtPer(selectedPlayer.k, selectedPlayer.g) ?? 0}/${fmtPer(selectedPlayer.d, selectedPlayer.g) ?? 0}/${fmtPer(selectedPlayer.a, selectedPlayer.g) ?? 0}`],
                    ["KP%", pctStr(selectedPlayer.k + selectedPlayer.a, selectedPlayer.tk) || "–"],
                    ["KS%", pctStr(selectedPlayer.k, selectedPlayer.tk) || "–"],
                    ["DTH%", pctStr(selectedPlayer.d, selectedPlayer.tdth) || "–"],
                    ["DPM", (selectedPlayer.dmg ? fmtPer(selectedPlayer.dmg, selectedPlayer.dm ?? selectedPlayer.min, 0) : null) || "–"],
                    ["DMG%", pctStr(selectedPlayer.sd, selectedPlayer.td) || "–"],
                    ["CS/m", fmtPer(selectedPlayer.cs, selectedPlayer.min) || "–"],
                    ["GPM", fmtPer(selectedPlayer.gold, selectedPlayer.min, 0) || "–"],
                    ["GD@15", (selectedPlayer.tn ? signed(fmtPer(selectedPlayer.g15 || 0, selectedPlayer.tn, 0)) : null) || "–"],
                    ["CSD@15", (selectedPlayer.tn ? signed(fmtPer(selectedPlayer.c15 || 0, selectedPlayer.tn, 1)) : null) || "–"],
                    ["CTR%", pctStr(selectedPlayer.ctr, selectedPlayer.ctrg) || "–"],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="rounded border border-rw-border/60 bg-rw-bg/50 px-2 py-1">
                      <div className="text-[9px] uppercase text-rw-muted">{lbl}</div>
                      <div className="font-mono font-semibold text-rw-text tabular-nums">{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {selectedTeam && (
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  {[
                    ["W%", pctStr(selectedTeam.w, selectedTeam.g) || "–"],
                    ["K:D", fmtPer(selectedTeam.k, Math.max(selectedTeam.d, 1), 2) || "–"],
                    ["GD/m", signed(fmtPer(selectedTeam.gd, selectedTeam.min, 0)) || "–"],
                    ["GPM", fmtPer(selectedTeam.gold ?? 0, selectedTeam.min, 0) || "–"],
                    ["GD@15", (selectedTeam.tn ? signed(fmtPer(selectedTeam.g15 || 0, selectedTeam.tn, 0)) : null) || "–"],
                    ["FB%", pctStr(selectedTeam.fb, selectedTeam.fbn) || "–"],
                    ["FT%", pctStr(selectedTeam.ft, selectedTeam.fbn) || "–"],
                    ["DRA%", selectedTeam.odrag != null ? pctStr(selectedTeam.drag, selectedTeam.drag + selectedTeam.odrag) || "–" : "–"],
                    ["Avg", selectedTeam.g ? `${fmtDec(selectedTeam.min / selectedTeam.g)}m` : "–"],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="rounded border border-rw-border/60 bg-rw-bg/50 px-2 py-1">
                      <div className="text-[9px] uppercase text-rw-muted">{lbl}</div>
                      <div className="font-mono font-semibold text-rw-text tabular-nums">{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Champion Pool */}
              {selectedPlayer?.c && selectedPlayer.c.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">
                    {tl("Champions")} {selectedPlayer.nc ? `(${selectedPlayer.nc})` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(selectedPlayer.c)).slice(0, 8).map((ch) => (
                      <span key={ch} className="inline-flex items-center gap-1 rounded border border-rw-border bg-rw-bg/50 px-1.5 py-0.5 text-[11px]">
                        <ChampIcon name={ch} size={18} />
                        <span className="font-medium truncate max-w-[90px]">{ch}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tournament Series & Match Links */}
              {dossierSeries.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">{tl("Series in this tournament")}</span>
                    {spoilerHidden && <RevealButton onReveal={revealSpoilers} />}
                  </div>
                  <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                    {dossierSeries.map(({ stage, row }) => {
                      const focusName = selectedPlayer ? selectedPlayer.t : selectedTeam?.t || "";
                      const focusSlug = selectedPlayer ? selectedPlayer.tu : selectedTeam?.u;
                      const isA =
                        (row.au && focusSlug && row.au.toLowerCase() === focusSlug.toLowerCase()) ||
                        row.a.trim().toLowerCase() === focusName.trim().toLowerCase();
                      const oppName = isA ? row.b : row.a;
                      const oppCode = isA ? row.bc : row.ac;
                      const myScore = isA ? row.sa : row.sb;
                      const oppScore = isA ? row.sb : row.sa;
                      const won = row.w != null ? (isA ? row.w === 1 : row.w === 2) : null;
                      return (
                        <div key={row.g || `${stage}-${row.a}-${row.b}`} className="flex items-center justify-between gap-2 rounded border border-rw-border/60 bg-rw-bg/50 px-2 py-1 text-[11px]">
                          {row.g ? (
                            <HubLink to={{ kind: "match", slug: row.g }} className="flex items-center gap-1.5 min-w-0 hover:text-rw-accent">
                              <span className="text-[10px] text-rw-muted shrink-0 truncate max-w-[78px]">{stage}</span>
                              <TeamLogo name={oppName} size={14} />
                              <span className="font-semibold truncate">vs {oppCode || oppName}</span>
                            </HubLink>
                          ) : (
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] text-rw-muted shrink-0 truncate max-w-[78px]">{stage}</span>
                              <TeamLogo name={oppName} size={14} />
                              <span className="font-semibold truncate">vs {oppCode || oppName}</span>
                            </span>
                          )}
                          <div className="flex items-center gap-2 shrink-0">
                            {!spoilerHidden && (
                              <span className={`font-bold tabular-nums ${won === true ? "text-rw-teal" : won === false ? "text-rw-red" : "text-rw-sub"}`}>
                                {myScore ?? 0}-{oppScore ?? 0}
                              </span>
                            )}
                            {row.g && (
                              <HubLink
                                to={{ kind: "match", slug: row.g, query: "view=matrix" }}
                                className="text-[10px] text-rw-accent hover:underline"
                                title={tl("All stats matrix")}
                              >
                                {tl("Matrix")}
                              </HubLink>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {ev && !evState.loading && mode === "players" && !(ev.players?.length) && (
        <div className={`${card} text-xs text-rw-muted`}>
          {tl("No player statistics are recorded for this tournament yet.")} ({fmtNum(ev.games || 0)} {tl("Games")})
        </div>
      )}
    </div>
  );
};
