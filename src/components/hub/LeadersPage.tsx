/**
 * Player leaderboards: every player of a league season, or of one of its tournaments, ranked on any stat, for one
 * role or all, with a minimum number of games (hub/leagueyear/<league>/<year>.json, hub/event/<slug>.json).
 * Address: /stats/leaders?league=lol-champions-korea&year=2026&event=<tournament>&role=Mid&min=10
 */
import React, { useMemo, useState } from "react";
import { tl, roleName } from "../../i18n";
import { loadAliases, loadHubEvent, loadLeagues, loadLeagueSeason, prettySlug, resolveLeagueSlug } from "../../hub/data";
import type { EventPlayer, LeagueRow } from "../../hub/types";
import { hubShareUrl, navigateHub } from "../../hub/route";
import { ROLES } from "../../hub/champAgg";
import { card, HubLink, Loading, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo, useLoad, usePageTitle } from "./ui";
import { SortTable, type Column } from "./SortTable";
import { PLAYER_METRICS } from "./Ranks";
import { SectionCard } from "./BroadcastCard";

/** the page opens on Worlds (the busiest event of the autumn; any league is one pick away) */
const DEFAULT_LEAGUE = "world-championship";

const yearsOf = (l?: LeagueRow) => {
  if (l?.sy?.length) return l.sy;
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
  const aliases = useLoad(loadAliases, []);
  const asked = q.get("league") || DEFAULT_LEAGUE;
  const league = aliases.data?.league[asked.toLowerCase()] || resolveLeagueSlug(asked);
  const row = leagues.data?.find((l) => l.u === league);
  const years = yearsOf(row);
  const askedYear = q.get("year") || "";
  const year = (askedYear && (!row?.sy?.length || row.sy.includes(askedYear)) ? askedYear : "") || years[0] || row?.to || String(new Date().getFullYear());
  const event = q.get("event") || "";
  const role = q.get("role") || "";
  const statParam = q.get("stat") || "";
  const statMetric = PLAYER_METRICS.find((m) => m.key === statParam);
  const waitingForLeagues = !askedYear && league !== DEFAULT_LEAGUE && leagues.loading && !leagues.data;
  const season = useLoad(
    () => (waitingForLeagues ? Promise.resolve(null) : loadLeagueSeason(league, year)),
    [league, year, waitingForLeagues],
  );
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
  const [search, setSearch] = useState(() => q.get("q") || "");
  const shownRows = useMemo(() => {
    const terms = search
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((p) => {
      const n = p.n.toLowerCase();
      const t = p.t.toLowerCase();
      return terms.some((term) => n.includes(term) || t.includes(term));
    });
  }, [rows, search]);
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

  const maxG = useMemo(() => Math.max(1, ...shownRows.map((p) => p.g)), [shownRows]);
  const columns: Column<EventPlayer>[] = [
    {
      key: "n",
      label: tl("Player"),
      value: (p) => p.n,
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <HubLink to={{ kind: "player", slug: p.u || prettySlug(p.n) }} title={p.n} className="shrink-0">
            <PlayerPhoto name={p.n} team={p.t} slug={p.u ?? undefined} size={18} />
          </HubLink>
          <PlayerLink name={p.n} u={p.u} className="text-rw-text hover:text-rw-accent font-semibold" />
          <span className="inline-flex items-center gap-1 text-[10px] text-rw-muted">
            <HubLink to={{ kind: "team", slug: p.tu || prettySlug(p.t) }} title={p.t} className="shrink-0">
              <TeamLogo name={p.t} size={13} />
            </HubLink>
            <TeamLink name={p.t} u={p.tu} className="text-rw-muted hover:text-rw-accent" />
          </span>
        </span>
      ),
    },
    {
      key: "r",
      label: tl("Role"),
      value: (p) => ROLES.indexOf(p.r),
      render: (p) => (
        <button
          type="button"
          onClick={() => set({ role: role === p.r ? undefined : p.r })}
          className="text-rw-sub hover:text-rw-accent hover:underline"
        >
          {roleName(p.r)}
        </button>
      ),
      className: "text-rw-sub",
    },
    {
      key: "g",
      label: tl("Games"),
      value: (p) => p.g,
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                ...(league ? { league } : {}),
                ...(year ? { year } : {}),
                ...(event ? { event } : {}),
                player: p.u || p.n,
              }).toString(),
            }}
            className="w-5 text-right hover:text-rw-accent hover:underline"
            title={tl("Game finder")}
          >
            {p.g}
          </HubLink>
          <span className="w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
            <span className="h-full bg-rw-accent/75 rounded-full" style={{ width: `${Math.round((p.g / maxG) * 100)}%` }} />
          </span>
        </span>
      ),
      className: "tabular-nums text-rw-sub",
    },
    ...PLAYER_METRICS.map<Column<EventPlayer>>((m) => ({
      key: m.key,
      label: m.short || m.label,
      title: zMode ? `${m.label}: ${tl("standard deviations from the average of the player's role in this list")}` : m.label,
      // lower is better (deaths): a negative z is the good one, so it is flipped for sorting and colour
      value: (p) => (zMode ? (z => (z == null ? null : m.low ? -z : z))(zOf(m.key, p, m.value(p))) : m.value(p)),
      render: (p) => {
        const v = m.value(p);
        if (v == null) return "–";
        const z = zOf(m.key, p, v);
        const good = z == null ? 0 : m.low ? -z : z;
        if (!zMode) {
          if (m.key === "wr") {
            const pct = Math.max(0, Math.min(100, Math.round(v * 100)));
            const tone = v >= 0.55 ? "text-rw-teal font-semibold" : v <= 0.45 ? "text-rw-red" : "";
            return (
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    ...(league ? { league } : {}),
                    ...(year ? { year } : {}),
                    ...(event ? { event } : {}),
                    player: p.u || p.n,
                  }).toString(),
                }}
                className="inline-flex items-center gap-1.5 tabular-nums hover:opacity-90"
                title={tl("Game finder")}
              >
                <span className={`w-9 text-right ${tone}`}>{m.fmt(v)}</span>
                <span className="w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                  <span className="h-full bg-rw-teal/85" style={{ width: `${pct}%` }} />
                  <span className="h-full bg-rw-red/75" style={{ width: `${100 - pct}%` }} />
                </span>
              </HubLink>
            );
          }
          const tone =
            good >= 1.25
              ? "text-rw-teal font-semibold"
              : good <= -1.25
                ? "text-rw-red"
                : "";
          return p.u ? (
            <HubLink
              to={{
                kind: "player",
                slug: p.u,
                tab: "stats",
                query: `p=${encodeURIComponent(event ? `e:${event}` : `y${year}`)}`,
              }}
              className={`hover:underline ${tone || "hover:text-rw-accent"}`}
            >
              {m.fmt(v)}
            </HubLink>
          ) : tone ? (
            <span className={tone}>{m.fmt(v)}</span>
          ) : (
            m.fmt(v)
          );
        }
        if (z == null) return "–";
        const zTone = good >= 1 ? "text-rw-teal font-semibold" : good <= -1 ? "text-rw-red" : "";
        return p.u ? (
          <HubLink
            to={{
              kind: "player",
              slug: p.u,
              tab: "stats",
              query: `p=${encodeURIComponent(event ? `e:${event}` : `y${year}`)}`,
            }}
            className={`hover:underline ${zTone || "hover:text-rw-accent"}`}
            title={m.fmt(v)}
          >
            {z > 0 ? "+" : z < 0 ? "−" : ""}
            {Math.abs(z).toFixed(1)}
          </HubLink>
        ) : (
          <span className={zTone} title={m.fmt(v)}>
            {z > 0 ? "+" : z < 0 ? "−" : ""}
            {Math.abs(z).toFixed(1)}
          </span>
        );
      },
      className: "tabular-nums font-mono",
    })),
  ];

  const sel = "bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text max-w-full";
  const hasSeasons = (l: LeagueRow) => !l.sy || l.sy.length > 0;
  const primary = (leagues.data || []).filter((l) => l.pr && hasSeasons(l)).sort((a, b) => b.g - a.g);
  const others = (leagues.data || []).filter((l) => !l.pr && hasSeasons(l)).sort((a, b) => b.g - a.g);
  const scope = event ? ev.data?.n || event : `${row?.s || row?.l || league} ${year}`;
  const loading = event ? ev.loading : waitingForLeagues || season.loading;
  const failed = event ? !ev.loading && !ev.data : !waitingForLeagues && !!season.error;
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
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className={`${sel} w-44`}
          />
          {shownRows.length === 2 && shownRows[0].u && shownRows[1].u && (
            <HubLink
              to={{
                kind: "compare",
                mode: "player",
                a: shownRows[0].u,
                b: shownRows[1].u,
                period: event ? `e:${event}` : `y${year}`,
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Compare")} →
            </HubLink>
          )}
          <HubLink
            to={event ? { kind: "event", slug: event } : { kind: "league", slug: league, year }}
            className="ml-auto text-rw-accent hover:underline font-semibold"
          >
            {scope} →
          </HubLink>
        </div>
      </div>
      {loading && <Loading />}
      {!loading && failed && <p className="text-xs text-rw-sub">{tl("No player numbers for this season yet.")}</p>}
      {!loading && !failed && (
        <Section
          title={tl("{scope}: {n} players", { scope, n: shownRows.length })}
          right={
            shownRows.length > 0 ? (
              <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
                <SectionCard
                  section={tl("Player leaderboards")}
                  name={scope}
                  sub={[role ? roleName(role) : null, statMetric ? statMetric.short || statMetric.label : null].filter(Boolean).join(" · ") || undefined}
                  rows={() => {
                    const kdaM = PLAYER_METRICS.find((m) => m.key === "kda")!;
                    const dpmM = PLAYER_METRICS.find((m) => m.key === "dpm")!;
                    const wrM = PLAYER_METRICS.find((m) => m.key === "wr")!;
                    const primaryM = statMetric || kdaM;
                    return [...shownRows]
                      .sort((a, b) => {
                        const va = primaryM.value(a);
                        const vb = primaryM.value(b);
                        if (va == null && vb == null) return 0;
                        if (va == null) return 1;
                        if (vb == null) return -1;
                        return primaryM.low ? va - vb : vb - va;
                      })
                      .slice(0, 12)
                      .map((p, i) => {
                        const pv = primaryM.value(p);
                        const kda = kdaM.value(p);
                        const dpm = dpmM.value(p);
                        const wr = wrM.value(p);
                        return {
                          rank: i + 1,
                          team: p.t,
                          label: `${p.n} (${p.t})`,
                          sub: [
                            roleName(p.r),
                            `${p.g}G`,
                            primaryM.key !== "kda" && kda != null ? `${kdaM.fmt(kda)} KDA` : null,
                            primaryM.key !== "dpm" && dpm != null ? `${dpmM.fmt(dpm)} DPM` : null,
                            primaryM.key !== "wr" && wr != null ? wrM.fmt(wr) : null,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                          value: pv != null ? `${primaryM.fmt(pv)} ${primaryM.short || primaryM.label}` : `${p.g}G`,
                          win: wr != null ? wr >= 0.5 : undefined,
                        };
                      });
                  }}
                />
                <CopyLeadersPost scope={scope} role={role} rows={shownRows} query={query} statMetric={statMetric} />
              </span>
            ) : undefined
          }
          share={`riftwise-leaders-${league}-${year}${event ? `-${event}` : ""}${role ? `-${role}` : ""}`}
        >
          {shownRows.length >= 2 && <LeaderSpotlight rows={shownRows} activeStat={statMetric?.key} onPickStat={(k) => set({ stat: k })} league={league} year={year} event={event} />}
          {zMode && (
            <p className="text-[11px] text-rw-muted">
              {tl("z = (value − role average) ÷ role standard deviation, over the {n} players listed. +1.0 is one standard deviation better than the role's average (for deaths, fewer is better). Hover a number for the stat itself.", { n: rows.length })}
            </p>
          )}
          {shownRows.length ? (
            <SortTable
              key={`${statMetric?.key || "kda"}:${zMode ? "z" : "v"}`}
              rows={shownRows}
              columns={columns}
              initial={statMetric ? { key: statMetric.key, desc: zMode ? true : !statMetric.low } : { key: "kda", desc: true }}
              rowKey={(p) => `${p.u || p.n}-${p.t}-${p.r}`}
              copyName={`riftwise-leaders-${league}-${year}`}
            />
          ) : (
            <p className="text-xs text-rw-sub">{tl("No player has that many games here. Lower the minimum.")}</p>
          )}
        </Section>
      )}
    </div>
  );
};

/** 5-card spotlight strip showing the #1 player in KDA, DPM, CSM, GD@15, and KP for the current filter. */
const LeaderSpotlight: React.FC<{
  rows: EventPlayer[];
  activeStat?: string;
  onPickStat?: (key: string) => void;
  league?: string;
  year?: string;
  event?: string;
}> = ({ rows, activeStat, onPickStat, league, year, event }) => {
  const keys = ["kda", "dpm", "csm", "g15", "kp"] as const;
  const cards = useMemo(() => {
    return keys
      .map((k) => {
        const m = PLAYER_METRICS.find((x) => x.key === k);
        if (!m) return null;
        const ranked = rows
          .map((p) => ({ p, v: m.value(p) }))
          .filter((x): x is { p: EventPlayer; v: number } => x.v != null && isFinite(x.v))
          .sort((a, b) => b.v - a.v);
        if (!ranked.length) return null;
        return { key: k, label: m.short || m.label, top: ranked[0].p, val: m.fmt(ranked[0].v) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [rows]);
  if (cards.length < 2) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
      {cards.map((c) => (
        <div
          key={c.key}
          className={`rounded-lg border bg-rw-bg/50 px-2.5 py-2 flex items-center justify-between gap-2 ${
            activeStat === c.key ? "border-rw-accent" : "border-rw-border"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <HubLink to={{ kind: "player", slug: c.top.u || prettySlug(c.top.n) }} title={c.top.n} className="shrink-0">
              <PlayerPhoto name={c.top.n} team={c.top.t} slug={c.top.u ?? undefined} size={22} />
            </HubLink>
            <div className="min-w-0">
              {onPickStat ? (
                <button
                  type="button"
                  onClick={() => onPickStat(c.key)}
                  className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted hover:text-rw-accent truncate block text-left"
                >
                  {c.label}
                </button>
              ) : (
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted truncate">{c.label}</div>
              )}
              <div className="mt-0.5 truncate">
                <PlayerLink name={c.top.n} u={c.top.u} className="font-semibold text-rw-text hover:text-rw-accent" />
              </div>
              <div className="text-[10px] text-rw-muted flex items-center gap-1 min-w-0">
                <HubLink to={{ kind: "team", slug: c.top.tu || prettySlug(c.top.t) }} title={c.top.t} className="shrink-0">
                  <TeamLogo name={c.top.t} size={12} />
                </HubLink>
                <TeamLink name={c.top.t} u={c.top.tu} className="text-rw-muted hover:text-rw-accent truncate" />
                <span className="shrink-0">
                  ·{" "}
                  {c.top.u ? (
                    <HubLink
                      to={{
                        kind: "player",
                        slug: c.top.u,
                        tab: "stats",
                        query: `p=${encodeURIComponent(event ? `e:${event}` : `y${year}`)}`,
                      }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {roleName(c.top.r)}
                    </HubLink>
                  ) : (
                    roleName(c.top.r)
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            {onPickStat ? (
              <button
                type="button"
                onClick={() => onPickStat(c.key)}
                className="font-mono font-bold tabular-nums text-rw-teal hover:text-rw-accent hover:underline block ml-auto"
              >
                {c.val}
              </button>
            ) : (
              <div className="font-mono font-bold tabular-nums text-rw-teal">{c.val}</div>
            )}
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  ...(league ? { league } : {}),
                  ...(year ? { year } : {}),
                  ...(event ? { event } : {}),
                  player: c.top.u || c.top.n,
                }).toString(),
              }}
              className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline font-mono block"
              title={tl("Game finder")}
            >
              {c.top.g}G
            </HubLink>
          </div>
        </div>
      ))}
    </div>
  );
};

const CopyLeadersPost: React.FC<{ scope: string; role: string; rows: EventPlayer[]; query?: string; statMetric?: (typeof PLAYER_METRICS)[number] }> = ({ scope, role, rows, query, statMetric }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const keys = statMetric ? [statMetric.key, ...(["kda", "dpm", "csm", "g15", "kp"] as const).filter((k) => k !== statMetric.key)] : (["kda", "dpm", "csm", "g15", "kp"] as const);
    const leaders = keys
      .map((k) => {
        const m = PLAYER_METRICS.find((x) => x.key === k);
        if (!m) return null;
        const ranked = rows
          .map((p) => ({ p, v: m.value(p) }))
          .filter((x): x is { p: EventPlayer; v: number } => x.v != null && isFinite(x.v))
          .sort((a, b) => (m.low ? a.v - b.v : b.v - a.v));
        if (!ranked.length) return null;
        return `${m.short || m.label}: ${ranked[0].p.n} (${ranked[0].p.t}) — ${m.fmt(ranked[0].v)}`;
      })
      .filter((x): x is string => !!x);
    const lines = [
      `${tl("Player leaderboards")} · ${scope}${role ? ` · ${roleName(role)}` : ""}`,
      ...leaders,
      hubShareUrl({ kind: "leaders", ...(query ? { query } : {}) }),
    ];
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        setState("copied");
        setTimeout(() => setState("idle"), 1600);
      },
      () => {
        setState("failed");
        setTimeout(() => setState("idle"), 2000);
      },
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={tl("Copy a ready-to-post summary with the link, for X or Discord")}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-surface text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
