/**
 * Player leaderboards: every player of a league season, or of one of its tournaments, ranked on any stat, for one
 * role or all, with a minimum number of games (hub/leagueyear/<league>/<year>.json, hub/event/<slug>.json).
 * Address: /stats/leaders?league=lol-champions-korea&year=2026&event=<tournament>&role=Mid&min=10
 */
import React, { useMemo } from "react";
import { tl, roleName } from "../../i18n";
import { loadHubEvent, loadLeagues, loadLeagueSeason } from "../../hub/data";
import type { EventPlayer, LeagueRow } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { ROLES } from "../../hub/champAgg";
import { card, Loading, PlayerLink, Section, TeamLink, useLoad, usePageTitle } from "./ui";
import { SortTable, type Column } from "./SortTable";
import { PLAYER_METRICS } from "./Ranks";

/** the page opens on Worlds (the busiest event of the autumn; any league is one pick away) */
const DEFAULT_LEAGUE = "world-championship";

const yearsOf = (l?: LeagueRow) => {
  const from = Number(l?.from) || 0;
  const to = Number(l?.to) || 0;
  const out: string[] = [];
  for (let y = to; y >= from && y > 0; y--) out.push(String(y));
  return out;
};

export const LeadersPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Player leaderboards"));
  const q = new URLSearchParams(query || "");
  const leagues = useLoad(loadLeagues, []);
  const league = q.get("league") || DEFAULT_LEAGUE;
  const row = leagues.data?.find((l) => l.u === league);
  const years = yearsOf(row);
  const year = q.get("year") || row?.to || String(new Date().getFullYear());
  const event = q.get("event") || "";
  const role = q.get("role") || "";
  const season = useLoad(() => loadLeagueSeason(league, year), [league, year]);
  const ev = useLoad(() => (event ? loadHubEvent(event) : Promise.resolve(null)), [event]);
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query || "");
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    navigateHub({ kind: "leaders", query: next.toString() }, { replace: true });
  };

  const players: EventPlayer[] = (event ? ev.data?.players : season.data?.players) || [];
  const inRole = players.filter((p) => !role || p.r === role);
  // the default bar: 30% of the most games anyone in the list played (like League ranks), at least 1
  const autoMin = Math.max(1, Math.ceil(Math.max(0, ...inRole.map((p) => p.g)) * 0.3));
  const minG = q.has("min") ? Math.max(1, Number(q.get("min")) || 1) : autoMin;
  const rows = useMemo(() => inRole.filter((p) => p.g >= minG), [inRole, minG]);
  // z-scores: each stat against the average of the player's own role in this list (support vision next to mid CS)
  const zMode = q.get("show") === "z";
  const roleStats = useMemo(() => {
    const out = new Map<string, Map<string, { mean: number; sd: number }>>();
    for (const m of PLAYER_METRICS) {
      const byRole = new Map<string, number[]>();
      for (const p of rows) {
        const v = m.value(p);
        if (v == null || !isFinite(v)) continue;
        if (!byRole.has(p.r)) byRole.set(p.r, []);
        byRole.get(p.r)!.push(v);
      }
      const per = new Map<string, { mean: number; sd: number }>();
      for (const [r, vs] of byRole) {
        if (vs.length < 3) continue;
        const mean = vs.reduce((t, v) => t + v, 0) / vs.length;
        const sd = Math.sqrt(vs.reduce((t, v) => t + (v - mean) ** 2, 0) / (vs.length - 1));
        if (sd > 0) per.set(r, { mean, sd });
      }
      out.set(m.key, per);
    }
    return out;
  }, [rows]);
  const zOf = (key: string, p: EventPlayer, v: number | null) => {
    const st = roleStats.get(key)?.get(p.r);
    return v == null || !st ? null : (v - st.mean) / st.sd;
  };

  const columns: Column<EventPlayer>[] = [
    {
      key: "n",
      label: tl("Player"),
      value: (p) => p.n,
      render: (p) => (
        <span className="whitespace-nowrap">
          <PlayerLink name={p.n} u={p.u} className="text-rw-text hover:text-rw-accent font-semibold" />{" "}
          <TeamLink name={p.t} u={p.tu} className="text-[10px] text-rw-muted hover:text-rw-accent" />
        </span>
      ),
    },
    { key: "r", label: tl("Role"), value: (p) => ROLES.indexOf(p.r), render: (p) => roleName(p.r), className: "text-rw-sub" },
    { key: "g", label: tl("Games"), value: (p) => p.g, className: "tabular-nums text-rw-sub" },
    ...PLAYER_METRICS.map<Column<EventPlayer>>((m) => ({
      key: m.key,
      label: m.short || m.label,
      title: zMode ? `${m.label}: ${tl("standard deviations from the average of the player's role in this list")}` : m.label,
      // lower is better (deaths): a negative z is the good one, so it is flipped for sorting and colour
      value: (p) => (zMode ? (z => (z == null ? null : m.low ? -z : z))(zOf(m.key, p, m.value(p))) : m.value(p)),
      render: (p) => {
        const v = m.value(p);
        if (!zMode) return v == null ? "–" : m.fmt(v);
        const z = zOf(m.key, p, v);
        if (z == null) return "–";
        const good = m.low ? -z : z;
        return (
          <span className={good >= 1 ? "text-rw-teal font-semibold" : good <= -1 ? "text-rw-red" : ""} title={v != null ? m.fmt(v) : undefined}>
            {z > 0 ? "+" : z < 0 ? "−" : ""}
            {Math.abs(z).toFixed(1)}
          </span>
        );
      },
      className: "tabular-nums font-mono",
    })),
  ];

  const sel = "bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text max-w-full";
  const primary = (leagues.data || []).filter((l) => l.pr).sort((a, b) => b.g - a.g);
  const others = (leagues.data || []).filter((l) => !l.pr).sort((a, b) => b.g - a.g);
  const scope = event ? ev.data?.n || event : `${row?.s || row?.l || league} ${year}`;
  const loading = event ? ev.loading : season.loading;
  const failed = event ? !ev.loading && !ev.data : !!season.error;
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-2`}>
        <h1 className="text-lg font-bold text-rw-text">{tl("Player leaderboards")}</h1>
        <p className="text-[11px] text-rw-sub">
          {tl("Every player of a league season or tournament on every stat. Click a column to rank by it.")}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={league} onChange={(e) => set({ league: e.target.value, year: undefined, event: undefined })} aria-label={tl("League")} className={sel}>
            {!row && <option value={league}>{league}</option>}
            <optgroup label={tl("Main leagues and international events")}>
              {primary.map((l) => (
                <option key={l.u} value={l.u}>
                  {l.s ? `${l.s} · ${l.l}` : l.l}
                </option>
              ))}
            </optgroup>
            <optgroup label={tl("Other leagues")}>
              {others.map((l) => (
                <option key={l.u} value={l.u}>
                  {l.s ? `${l.s} · ${l.l}` : l.l}
                </option>
              ))}
            </optgroup>
          </select>
          <select value={year} onChange={(e) => set({ year: e.target.value, event: undefined })} aria-label={tl("Year")} className={sel}>
            {(years.length ? years : [year]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select value={event} onChange={(e) => set({ event: e.target.value || undefined })} aria-label={tl("Tournament")} className={sel}>
            <option value="">{tl("Whole season")}</option>
            {(season.data?.events || []).map(([u, n]) => (
              <option key={u} value={u}>
                {n}
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => set({ role: e.target.value || undefined })} aria-label={tl("Role")} className={sel}>
            <option value="">{tl("Every role")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleName(r)}
              </option>
            ))}
          </select>
          <span className="flex rounded border border-rw-border overflow-hidden" role="group" aria-label={tl("Show")}>
            {(["", "z"] as const).map((v) => (
              <button
                key={v || "values"}
                type="button"
                onClick={() => set({ show: v || undefined })}
                aria-pressed={(v === "z") === zMode}
                className={`px-2 py-1 text-xs ${(v === "z") === zMode ? "bg-rw-accent text-rw-bg" : "text-rw-sub hover:text-rw-text"}`}
                title={v === "z" ? tl("Each stat as standard deviations from the average of the player's role in this list: compares roles on one scale") : undefined}
              >
                {v === "z" ? tl("z-scores by role") : tl("Values")}
              </button>
            ))}
          </span>
          <select value={q.has("min") ? String(minG) : ""} onChange={(e) => set({ min: e.target.value || undefined })} aria-label={tl("At least")} className={sel}>
            <option value="">{tl("{n}+ games", { n: autoMin })}</option>
            {[1, 3, 5, 10, 20, 30, 50].filter((n) => n !== autoMin).map((n) => (
              <option key={n} value={n}>
                {tl("{n}+ games", { n })}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loading && <Loading />}
      {!loading && failed && <p className="text-xs text-rw-sub">{tl("No player numbers for this season yet.")}</p>}
      {!loading && !failed && (
        <Section title={tl("{scope}: {n} players", { scope, n: rows.length })} share={`riftwise-leaders-${league}-${year}${event ? `-${event}` : ""}${role ? `-${role}` : ""}`}>
          {zMode && (
            <p className="text-[11px] text-rw-muted">
              {tl("z = (value − role average) ÷ role standard deviation, over the {n} players listed. +1.0 is one standard deviation better than the role's average (for deaths, fewer is better). Hover a number for the stat itself.", { n: rows.length })}
            </p>
          )}
          {rows.length ? (
            <SortTable rows={rows} columns={columns} initial={{ key: "kda", desc: true }} rowKey={(p) => `${p.u || p.n}-${p.t}-${p.r}`} copyName={`riftwise-leaders-${league}-${year}`} />
          ) : (
            <p className="text-xs text-rw-sub">{tl("No player has that many games here. Lower the minimum.")}</p>
          )}
        </Section>
      )}
    </div>
  );
};
