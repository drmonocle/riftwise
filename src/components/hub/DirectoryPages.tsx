/**
 * Every team and every player (/stats/teams, /stats/players): the search box's lists as sortable tables, filtered by
 * region or role, the last year played and a name. The filters stay in the address (?region=Korea&since=2025&q=t1),
 * so a list can be shared.
 */
import React, { useMemo } from "react";
import { tl, roleName, regionName } from "../../i18n";
import { loadHubIndex, loadHubIndexQuick, normText, prettySlug } from "../../hub/data";
import { navigateHub, type HubSection } from "../../hub/route";
import type { SearchPlayerRow, SearchTeamRow } from "../../hub/types";
import { SortTable, type Column } from "./SortTable";
import { card, fmtNum, Page, PlayerLink, TeamLink, useLoad, usePageTitle } from "./ui";

/** rows shown before "Show more" (the whole list sorts and filters either way) */
const STEP = 200;
const ROLE_OF: Record<string, string> = { T: "Top", J: "Jungle", M: "Mid", B: "Bot", S: "Support" };
const THIS_YEAR = String(new Date().getFullYear());

const field = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text";

/** The page's filters from its address, and a way to change one (the address follows, without a new history step). */
function useFilters(kind: HubSection, query: string | undefined) {
  const q = new URLSearchParams(query || "");
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(query || "");
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    if (key !== "n") next.delete("n");
    navigateHub({ kind, query: next.toString() || undefined }, { replace: true });
  };
  return { q, set };
}

/** "Played in 2025 or later" choices: every year from the newest down to 2011 */
const yearChoices = (rows: string[]) => [...new Set(rows.filter((y) => /^\d{4}$/.test(y)))].sort().reverse();

const Filters: React.FC<{ children: React.ReactNode; count: number; total: number }> = ({ children, count, total }) => (
  <div className={`${card} flex flex-wrap items-center gap-2`}>
    {children}
    <span className="text-[11px] text-rw-muted ml-auto tabular-nums">{tl("{shown} of {total}", { shown: fmtNum(count), total: fmtNum(total) })}</span>
  </div>
);

const SinceSelect: React.FC<{ years: string[]; value: string; onChange: (v: string) => void }> = ({ years, value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={tl("Last played")} className={field}>
    <option value="all">{tl("Any year")}</option>
    {years.map((y) => (
      <option key={y} value={y}>
        {tl("Played in {year} or later", { year: y })}
      </option>
    ))}
  </select>
);

const NameFilter: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    aria-label={placeholder}
    className={`${field} flex-1 min-w-[10rem] placeholder-rw-muted`}
  />
);

const ShowMore: React.FC<{ shown: number; total: number; onMore: () => void }> = ({ shown, total, onMore }) =>
  shown < total ? (
    <div className="text-center">
      <button type="button" onClick={onMore} className="px-3 py-1.5 rounded-lg border border-rw-border text-xs text-rw-sub hover:text-rw-text hover:border-rw-accent/50">
        {tl("Show {n} more", { n: fmtNum(Math.min(STEP * 2, total - shown)) })}
      </button>
    </div>
  ) : null;

// ── Teams ─────────────────────────────────────────────────────────────────

export const TeamsDirectory: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Every team"));
  // the teams are in the quick search lists (no need to wait for the players)
  const state = useLoad(loadHubIndexQuick, []);
  return <Page state={state}>{(index) => <TeamsTable rows={index.teams} query={query} />}</Page>;
};

const TeamsTable: React.FC<{ rows: SearchTeamRow[]; query?: string }> = ({ rows, query }) => {
  const { q, set } = useFilters("teams", query);
  const region = q.get("region") || "";
  const words = q.get("q") || "";
  const since = q.get("since") || (words.trim() ? "all" : THIS_YEAR);
  const shown = Number(q.get("n")) || STEP;
  const regions = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of rows) if (t[6]) n.set(t[6], (n.get(t[6]) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  }, [rows]);
  const years = useMemo(() => yearChoices(rows.map((t) => t[3])), [rows]);
  const list = useMemo(() => {
    const w = normText(words.trim());
    return rows.filter(
      (t) =>
        (!region || t[6] === region) &&
        (since === "all" || (t[3] || "") >= since) &&
        (!w || normText(`${t[0]} | ${t[4]} | ${t[5]}`).includes(w)),
    );
  }, [rows, region, since, words]);
  const columns: Column<SearchTeamRow>[] = [
    { key: "n", label: tl("Team"), value: (t) => t[0].toLowerCase(), render: (t) => <TeamLink name={t[0]} u={t[1] || prettySlug(t[0])} /> },
    { key: "c", label: tl("Short name"), value: (t) => (t[5] || "").split(" | ")[0] || null, className: "text-rw-sub" },
    { key: "r", label: tl("Region"), value: (t) => (t[6] ? regionName(t[6], t[6]) : null), className: "text-rw-sub max-w-[10rem] truncate" },
    { key: "y", label: tl("Last played"), value: (t) => t[3] || null, className: "tabular-nums text-rw-sub" },
    { key: "g", label: tl("Games"), value: (t) => t[2], className: "tabular-nums" },
    { key: "o", label: tl("Also played as"), value: (t) => t[4] || null, render: (t) => <span className="text-rw-muted">{(t[4] || "").split(" | ").slice(0, 2).join(", ")}</span>, className: "max-w-[16rem] truncate" },
  ];
  return (
    <div className="space-y-3">
      <Filters count={list.length} total={rows.length}>
        <select value={region} onChange={(e) => set("region", e.target.value)} aria-label={tl("Region")} className={field}>
          <option value="">{tl("Every region")}</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {regionName(r, r)}
            </option>
          ))}
        </select>
        <SinceSelect years={years} value={since} onChange={(v) => set("since", v === THIS_YEAR ? null : v)} />
        <NameFilter value={words} onChange={(v) => set("q", v)} placeholder={tl("Filter by name or short name…")} />
      </Filters>
      <div className={card}>
        {list.length ? (
          <SortTable rows={list} columns={columns} initial={{ key: "g", desc: true }} rowKey={(t) => t[1] || t[0]} limit={shown} copyName="riftwise-teams" />
        ) : (
          <p className="text-xs text-rw-sub text-center py-6">{tl("No teams match.")}</p>
        )}
      </div>
      <ShowMore shown={Math.min(shown, list.length)} total={list.length} onMore={() => set("n", String(shown + STEP * 2))} />
    </div>
  );
};

// ── Players ───────────────────────────────────────────────────────────────

/** in the address in English (?role=Mid, like the Champions page), shown in the reader's language */
const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];

export const PlayersDirectory: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Every player"));
  const state = useLoad(loadHubIndex, []);
  return <Page state={state}>{(index) => <PlayersTable rows={index.players} query={query} />}</Page>;
};

const PlayersTable: React.FC<{ rows: SearchPlayerRow[]; query?: string }> = ({ rows, query }) => {
  const { q, set } = useFilters("players", query);
  const role = q.get("role") || "";
  const words = q.get("q") || "";
  const since = q.get("since") || (words.trim() ? "all" : THIS_YEAR);
  const shown = Number(q.get("n")) || STEP;
  const years = useMemo(() => yearChoices(rows.map((p) => p[4])), [rows]);
  const list = useMemo(() => {
    const w = normText(words.trim());
    return rows.filter(
      (p) =>
        (!role || ROLE_OF[p[5]] === role) &&
        (since === "all" || (p[4] || "") >= since) &&
        (!w || normText(`${p[0]} | ${p[2]} | ${p[6]}`).includes(w)),
    );
  }, [rows, role, since, words]);
  const columns: Column<SearchPlayerRow>[] = [
    { key: "n", label: tl("Player"), value: (p) => p[0].toLowerCase(), render: (p) => <PlayerLink name={p[0]} u={p[1] || prettySlug(p[0])} /> },
    { key: "r", label: tl("Role"), value: (p) => (ROLE_OF[p[5]] ? roleName(ROLE_OF[p[5]]) : null), className: "text-rw-sub" },
    { key: "t", label: tl("Last team"), value: (p) => p[2] || null, className: "text-rw-sub max-w-[12rem] truncate" },
    { key: "y", label: tl("Last played"), value: (p) => p[4] || null, className: "tabular-nums text-rw-sub" },
    { key: "g", label: tl("Games"), value: (p) => p[3], className: "tabular-nums" },
    { key: "real", label: tl("Name"), value: (p) => p[6] || null, className: "text-rw-muted max-w-[12rem] truncate" },
  ];
  return (
    <div className="space-y-3">
      <Filters count={list.length} total={rows.length}>
        <select value={role} onChange={(e) => set("role", e.target.value)} aria-label={tl("Role")} className={field}>
          <option value="">{tl("Every role")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleName(r)}
            </option>
          ))}
        </select>
        <SinceSelect years={years} value={since} onChange={(v) => set("since", v === THIS_YEAR ? null : v)} />
        <NameFilter value={words} onChange={(v) => set("q", v)} placeholder={tl("Filter by name or team…")} />
      </Filters>
      <div className={card}>
        {list.length ? (
          <SortTable rows={list} columns={columns} initial={{ key: "g", desc: true }} rowKey={(p) => p[1] || p[0]} limit={shown} copyName="riftwise-players" />
        ) : (
          <p className="text-xs text-rw-sub text-center py-6">{tl("No players match.")}</p>
        )}
      </div>
      <ShowMore shown={Math.min(shown, list.length)} total={list.length} onMore={() => set("n", String(shown + STEP * 2))} />
    </div>
  );
};
