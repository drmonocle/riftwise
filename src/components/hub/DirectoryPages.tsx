/**
 * Every team and every player (/stats/teams, /stats/players): the search box's lists as sortable tables, filtered by
 * region or role, the last year played and a name. The filters stay in the address (?region=Korea&since=2025&q=t1),
 * so a list can be shared.
 */
import React, { useMemo, useState } from "react";
import { tl, roleName, regionName } from "../../i18n";
import { loadHubIndex, loadHubIndexQuick, normText, prettySlug } from "../../hub/data";
import { navigateHub, type HubSection } from "../../hub/route";
import type { SearchPlayerRow, SearchTeamRow } from "../../hub/types";
import { SortTable, type Column } from "./SortTable";
import { SectionCard } from "./BroadcastCard";
import { card, fmtNum, HubLink, Page, PlayerLink, PlayerPhoto, TeamLink, TeamLogo, useLoad, usePageTitle } from "./ui";

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
  const maxGames = useMemo(() => Math.max(1, ...list.map((t) => t[2] || 0)), [list]);
  const columns: Column<SearchTeamRow>[] = [
    {
      key: "n",
      label: tl("Team"),
      value: (t) => t[0].toLowerCase(),
      render: (t) => (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <TeamLogo name={t[0]} code={(t[5] || "").split(" | ")[0] || undefined} size={16} />
          <TeamLink name={t[0]} u={t[1] || prettySlug(t[0])} />
        </span>
      ),
    },
    {
      key: "c",
      label: tl("Short name"),
      value: (t) => (t[5] || "").split(" | ")[0] || null,
      render: (t) => {
        const c = (t[5] || "").split(" | ")[0];
        return c ? (
          <HubLink to={{ kind: "team", slug: t[1] || prettySlug(t[0]) }} className="hover:text-rw-accent hover:underline">
            {c}
          </HubLink>
        ) : null;
      },
      className: "text-rw-sub",
    },
    {
      key: "r",
      label: tl("Region"),
      value: (t) => (t[6] ? regionName(t[6], t[6]) : null),
      render: (t) =>
        t[6] ? (
          <button
            type="button"
            onClick={() => set("region", region === t[6] ? null : t[6])}
            className="text-rw-sub hover:text-rw-accent hover:underline truncate max-w-full"
          >
            {regionName(t[6], t[6])}
          </button>
        ) : null,
      className: "text-rw-sub max-w-[10rem] truncate",
    },
    {
      key: "y",
      label: tl("Last played"),
      value: (t) => t[3] || null,
      render: (t) =>
        t[3] ? (
          <button
            type="button"
            onClick={() => set("since", since === t[3] ? "all" : t[3])}
            className="text-rw-sub hover:text-rw-accent hover:underline"
          >
            {t[3]}
          </button>
        ) : null,
      className: "tabular-nums text-rw-sub",
    },
    {
      key: "g",
      label: tl("Games"),
      value: (t) => t[2],
      render: (t) => (
        <div className="min-w-[4.25rem] space-y-0.5">
          <HubLink
            to={{ kind: "finder", query: `team=${encodeURIComponent(t[1] || prettySlug(t[0]))}` }}
            className="tabular-nums text-rw-text hover:text-rw-accent hover:underline block"
            title={tl("Game finder")}
          >
            {fmtNum(t[2])}
          </HubLink>
          <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-rw-accent/65" style={{ width: `${Math.max(4, Math.round(((t[2] || 0) / maxGames) * 100))}%` }} />
          </div>
        </div>
      ),
      className: "tabular-nums",
    },
    {
      key: "o",
      label: tl("Also played as"),
      value: (t) => t[4] || null,
      render: (t) =>
        t[4] ? (
          <HubLink
            to={{ kind: "team", slug: t[1] || prettySlug(t[0]), tab: "history" }}
            className="text-rw-muted hover:text-rw-accent hover:underline"
          >
            {t[4].split(" | ").slice(0, 2).join(", ")}
          </HubLink>
        ) : null,
      className: "max-w-[16rem] truncate",
    },
    {
      key: "act",
      label: "",
      value: () => null,
      render: (t) => {
        const u = t[1] || prettySlug(t[0]);
        return (
          <span className="inline-flex items-center gap-2 text-[11px] whitespace-nowrap">
            <HubLink to={{ kind: "prep", a: u }} className="text-rw-accent hover:underline">
              {tl("Match prep")}
            </HubLink>
            <HubLink to={{ kind: "compare", mode: "team", a: u }} className="text-rw-sub hover:text-rw-accent hover:underline">
              {tl("Compare")}
            </HubLink>
            <HubLink to={{ kind: "finder", query: `team=${encodeURIComponent(u)}` }} className="text-rw-sub hover:text-rw-accent hover:underline">
              {tl("Game finder")}
            </HubLink>
          </span>
        );
      },
      className: "text-right",
    },
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
        {list.length === 2 && (
          <>
            <HubLink
              to={{ kind: "prep", a: list[0][1] || prettySlug(list[0][0]), b: list[1][1] || prettySlug(list[1][0]) }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Match prep")} →
            </HubLink>
            <HubLink
              to={{ kind: "compare", mode: "team", a: list[0][1] || prettySlug(list[0][0]), b: list[1][1] || prettySlug(list[1][0]) }}
              className="text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Compare")} →
            </HubLink>
          </>
        )}
        {list.length > 0 && (
          <>
            <CopyDirectoryPost
              title={tl("Every team")}
              sub={region ? regionName(region, region) : tl("Every region")}
              rows={[...list]
                .sort((a, b) => b[2] - a[2])
                .slice(0, 5)
                .map((t, idx) => `#${idx + 1} ${t[0]}${t[6] ? ` (${regionName(t[6], t[6])})` : ""} · ${fmtNum(t[2])} ${tl("Games")}`)}
              url={`https://riftwise.gg/stats/teams${query ? `?${query}` : ""}`}
            />
            <SectionCard
              section={tl("Every team")}
              sub={region ? regionName(region, region) : tl("Every region")}
              name={`teams-directory-${region || "all"}`}
              rows={() =>
                [...list]
                  .sort((a, b) => b[2] - a[2])
                  .slice(0, 10)
                  .map((t, idx) => ({
                    rank: idx + 1,
                    team: t[0],
                    label: t[0],
                    sub: [t[6] ? regionName(t[6], t[6]) : "", t[3] || ""].filter(Boolean).join(" · "),
                    value: `${fmtNum(t[2])} ${tl("Games")}`,
                  }))
              }
            />
          </>
        )}
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
  const maxGames = useMemo(() => Math.max(1, ...list.map((p) => p[3] || 0)), [list]);
  const columns: Column<SearchPlayerRow>[] = [
    {
      key: "n",
      label: tl("Player"),
      value: (p) => p[0].toLowerCase(),
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <PlayerPhoto name={p[0]} team={p[2] || undefined} slug={p[1] || prettySlug(p[0])} size={18} />
          <PlayerLink name={p[0]} u={p[1] || prettySlug(p[0])} />
        </span>
      ),
    },
    {
      key: "r",
      label: tl("Role"),
      value: (p) => (ROLE_OF[p[5]] ? roleName(ROLE_OF[p[5]]) : null),
      render: (p) =>
        ROLE_OF[p[5]] ? (
          <button
            type="button"
            onClick={() => set("role", role === ROLE_OF[p[5]] ? null : ROLE_OF[p[5]])}
            className="text-rw-sub hover:text-rw-accent hover:underline"
          >
            {roleName(ROLE_OF[p[5]])}
          </button>
        ) : null,
      className: "text-rw-sub",
    },
    {
      key: "t",
      label: tl("Last team"),
      value: (p) => p[2] || null,
      render: (p) =>
        p[2] ? (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <TeamLogo name={p[2]} size={15} />
            <TeamLink name={p[2]} u={prettySlug(p[2])} />
          </span>
        ) : null,
      className: "text-rw-sub max-w-[12rem] truncate",
    },
    {
      key: "y",
      label: tl("Last played"),
      value: (p) => p[4] || null,
      render: (p) =>
        p[4] ? (
          <button
            type="button"
            onClick={() => set("since", since === p[4] ? "all" : p[4])}
            className="text-rw-sub hover:text-rw-accent hover:underline"
          >
            {p[4]}
          </button>
        ) : null,
      className: "tabular-nums text-rw-sub",
    },
    {
      key: "g",
      label: tl("Games"),
      value: (p) => p[3],
      render: (p) => (
        <div className="min-w-[4.25rem] space-y-0.5">
          <HubLink
            to={{ kind: "finder", query: `player=${encodeURIComponent(p[1] || prettySlug(p[0]))}` }}
            className="tabular-nums text-rw-text hover:text-rw-accent hover:underline block"
            title={tl("Game finder")}
          >
            {fmtNum(p[3])}
          </HubLink>
          <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-rw-accent/65" style={{ width: `${Math.max(4, Math.round(((p[3] || 0) / maxGames) * 100))}%` }} />
          </div>
        </div>
      ),
      className: "tabular-nums",
    },
    {
      key: "real",
      label: tl("Name"),
      value: (p) => p[6] || null,
      render: (p) =>
        p[6] ? (
          <HubLink to={{ kind: "player", slug: p[1] || prettySlug(p[0]) }} className="hover:text-rw-accent hover:underline">
            {p[6]}
          </HubLink>
        ) : null,
      className: "text-rw-muted max-w-[12rem] truncate",
    },
    {
      key: "act",
      label: "",
      value: () => null,
      render: (p) => {
        const u = p[1] || prettySlug(p[0]);
        return (
          <span className="inline-flex items-center gap-2 text-[11px] whitespace-nowrap">
            <HubLink to={{ kind: "compare", mode: "player", a: u }} className="text-rw-accent hover:underline">
              {tl("Compare")}
            </HubLink>
            <HubLink to={{ kind: "finder", query: `player=${encodeURIComponent(u)}` }} className="text-rw-sub hover:text-rw-accent hover:underline">
              {tl("Game finder")}
            </HubLink>
            <HubLink to={{ kind: "items", query: `player=${encodeURIComponent(u)}` }} className="text-rw-sub hover:text-rw-accent hover:underline">
              {tl("Item history")}
            </HubLink>
          </span>
        );
      },
      className: "text-right",
    },
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
        {list.length === 2 && (
          <HubLink
            to={{ kind: "compare", mode: "player", a: list[0][1] || prettySlug(list[0][0]), b: list[1][1] || prettySlug(list[1][0]) }}
            className="text-rw-accent hover:underline font-semibold"
          >
            {tl("Compare")} →
          </HubLink>
        )}
        {list.length > 0 && (
          <>
            <CopyDirectoryPost
              title={tl("Every player")}
              sub={role ? roleName(role) : tl("Every role")}
              rows={[...list]
                .sort((a, b) => b[3] - a[3])
                .slice(0, 5)
                .map((p, idx) => `#${idx + 1} ${p[0]}${p[2] ? ` (${p[2]})` : ""} · ${fmtNum(p[3])} ${tl("Games")}`)}
              url={`https://riftwise.gg/stats/players${query ? `?${query}` : ""}`}
            />
            <SectionCard
              section={tl("Every player")}
              sub={role ? roleName(role) : tl("Every role")}
              name={`players-directory-${role || "all"}`}
              rows={() =>
                [...list]
                  .sort((a, b) => b[3] - a[3])
                  .slice(0, 10)
                  .map((p, idx) => ({
                    rank: idx + 1,
                    team: p[2] || undefined,
                    label: p[0],
                    sub: [ROLE_OF[p[5]] ? roleName(ROLE_OF[p[5]]) : "", p[2] || "", p[4] || ""].filter(Boolean).join(" · "),
                    value: `${fmtNum(p[3])} ${tl("Games")}`,
                  }))
              }
            />
          </>
        )}
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

const CopyDirectoryPost: React.FC<{
  title: string;
  sub: string;
  rows: string[];
  url: string;
}> = ({ title, sub, rows, url }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const lines: string[] = [`${title} · ${sub}`];
    for (const r of rows) {
      lines.push(r);
    }
    lines.push(url);
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2.5 py-1.5 rounded-lg border border-rw-border bg-rw-bg text-xs text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};
