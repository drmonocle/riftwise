/**
 * Champion stats with analyst filters. "Top leagues" / "All leagues" read the nightly patch and year files; a
 * league reads its champion game log for a year and narrows it by tournament, patch, side and role in the
 * browser (blind-pick rate and first picks come from the draft order). Filters live in the address, so a view
 * can be shared: /riftwatch/stats/champions?league=lck&year=2026&patch=26.18&role=Mid
 */
import React, { useMemo } from "react";
import { tl, roleName } from "../../i18n";
import { ChampionStats, StatsMeta, loadChampionStats } from "../../stats";
import { loadChampGames, loadChampIndex } from "../../hub/data";
import { navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { ChampAggRow, ROLES, champAgg, patchCompare } from "../../hub/champAgg";
import { SortTable, type Column } from "./SortTable";
import { card, ChampLink, Failed, fmtNum, HubLink, Loading, useLoad, usePageTitle } from "./ui";

const sel = "bg-[#091428] border border-[#1e282d] rounded-lg px-2 py-1.5 text-[#f0e6d2] max-w-[14rem]";
const pct = (v: number | null) => (v == null ? "–" : `${(v * 100).toFixed(1)}%`);

export const ChampionsPage: React.FC<{ meta: StatsMeta; query?: string }> = ({ meta, query }) => {
  usePageTitle(tl("Champions"));
  useDDragon();
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const scope = q.get("league") || q.get("scope") || "top";
  const setQ = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    navigateHub({ kind: "champions", query: next.toString() }, { replace: true });
  };
  const index = useLoad(loadChampIndex, []);
  const leagues = index.data || [];
  const main = leagues.filter((l) => l.pr);
  const other = leagues.filter((l) => !l.pr && Object.values(l.y).reduce((s, n) => s + n, 0) >= 150);

  const pickScope = (v: string) =>
    v === "top" || v === "all"
      ? navigateHub({ kind: "champions", query: v === "all" ? "scope=all" : "" }, { replace: true })
      : navigateHub({ kind: "champions", query: new URLSearchParams({ league: v }).toString() }, { replace: true });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={scope} onChange={(e) => pickScope(e.target.value)} aria-label={tl("Leagues")} className={sel}>
          <option value="top">{tl("Top leagues")}</option>
          <option value="all">{tl("All leagues")}</option>
          {main.length > 0 && (
            <optgroup label={tl("Leagues")}>
              {main.map((l) => (
                <option key={l.u} value={l.u}>
                  {l.l}
                </option>
              ))}
            </optgroup>
          )}
          {other.length > 0 && (
            <optgroup label={tl("Other leagues")}>
              {other.map((l) => (
                <option key={l.u} value={l.u}>
                  {l.l}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {scope === "top" || scope === "all" ? null : (
          <LeagueFilters league={scope} years={Object.keys(leagues.find((l) => l.u === scope)?.y || {})} q={q} setQ={setQ} />
        )}
      </div>
      {scope === "top" || scope === "all" ? (
        <OverallTable meta={meta} scope={scope === "all" ? "all" : "major"} q={q} setQ={setQ} />
      ) : (
        <LeagueTable league={scope} q={q} setQ={setQ} years={Object.keys(leagues.find((l) => l.u === scope)?.y || {})} />
      )}
    </div>
  );
};

/** Year, tournament, patch, side and role pickers for a league (the tournament and patch lists come with the data). */
const LeagueFilters: React.FC<{ league: string; years: string[]; q: URLSearchParams; setQ: (p: Record<string, string | undefined>) => void }> = ({
  league,
  years,
  q,
  setQ,
}) => {
  const ys = [...years].sort().reverse();
  const year = q.get("year") || ys[0] || "";
  const file = useLoad(() => (year ? loadChampGames(league, year) : Promise.reject(new Error("no year"))), [league, year]);
  const events = file.data?.events || [];
  const patches = useMemo(
    () => [...new Set((file.data?.games || []).map((g) => g[1]).filter(Boolean))].sort(patchCompare),
    [file.data],
  );
  return (
    <>
      <select value={year} onChange={(e) => setQ({ year: e.target.value, event: undefined, patch: undefined })} aria-label={tl("Years")} className={sel}>
        {ys.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select value={q.get("event") || ""} onChange={(e) => setQ({ event: e.target.value || undefined })} aria-label={tl("Tournaments")} className={sel}>
        <option value="">{tl("All tournaments")}</option>
        {events.map(([slug, name]) => (
          <option key={slug} value={slug}>
            {name}
          </option>
        ))}
      </select>
      <select value={q.get("patch") || ""} onChange={(e) => setQ({ patch: e.target.value || undefined })} aria-label={tl("Patches")} className={sel}>
        <option value="">{tl("All patches")}</option>
        {patches.map((p) => (
          <option key={p} value={p}>
            {tl("Patch {patch}", { patch: p })}
          </option>
        ))}
      </select>
      <SideRole q={q} setQ={setQ} />
    </>
  );
};

const SideRole: React.FC<{ q: URLSearchParams; setQ: (p: Record<string, string | undefined>) => void; noSide?: boolean }> = ({ q, setQ, noSide }) => (
  <>
    {!noSide && (
      <select value={q.get("side") || ""} onChange={(e) => setQ({ side: e.target.value || undefined })} aria-label={tl("Side")} className={sel}>
        <option value="">{tl("Both sides")}</option>
        <option value="b">{tl("Blue side")}</option>
        <option value="r">{tl("Red side")}</option>
      </select>
    )}
    <select value={q.get("role") || ""} onChange={(e) => setQ({ role: e.target.value || undefined })} aria-label={tl("Role")} className={sel}>
      <option value="">{tl("All roles")}</option>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {roleName(r)}
        </option>
      ))}
    </select>
  </>
);

const LeagueTable: React.FC<{ league: string; years: string[]; q: URLSearchParams; setQ: (p: Record<string, string | undefined>) => void }> = ({
  league,
  years,
  q,
}) => {
  const year = q.get("year") || [...years].sort().reverse()[0] || "";
  const file = useLoad(() => (year ? loadChampGames(league, year) : Promise.reject(new Error("no year"))), [league, year]);
  const eventSlug = q.get("event") || "";
  const roleQ = q.get("role") || "";
  const side = q.get("side") === "b" || q.get("side") === "r" ? (q.get("side") as "b" | "r") : undefined;
  const result = useMemo(() => {
    if (!file.data) return null;
    const ei = eventSlug ? file.data.events.findIndex(([s]) => s === eventSlug) : -1;
    return champAgg(file.data.games, {
      event: ei >= 0 ? ei : undefined,
      patch: q.get("patch") || undefined,
      side,
      role: roleQ ? ROLES.indexOf(roleQ) : undefined,
    });
  }, [file.data, eventSlug, q, side, roleQ]);
  if (file.loading) return <Loading />;
  if (!file.data || !result) return <Failed />;
  const eventName = eventSlug ? file.data.events.find(([s]) => s === eventSlug)?.[1] : null;
  const cols: Column<ChampAggRow>[] = [
    { key: "c", label: tl("Champion"), value: (c) => c.c, render: (c) => <ChampLink name={c.c} size={18} /> },
    { key: "role", label: tl("Role"), value: (c) => c.role, render: (c) => <span className="text-[#7e8e9f]">{c.role >= 0 ? roleName(ROLES[c.role]) : "–"}</span> },
    { key: "presence", label: tl("Presence"), value: (c) => c.presence, render: (c) => pct(c.presence) },
    { key: "p", label: tl("Picks"), value: (c) => c.p },
    { key: "b", label: tl("Bans"), value: (c) => c.b },
    { key: "wr", label: tl("Win %"), value: (c) => (c.p >= 3 ? c.wr : null), render: (c) => (c.p ? pct(c.wr) : "–") },
    { key: "kda", label: tl("KDA"), value: (c) => c.kda },
    { key: "blind", label: tl("Blind%"), title: tl("Share of picks made before the enemy laner was picked"), value: (c) => c.blind, render: (c) => pct(c.blind) },
    { key: "fp", label: "B1", title: tl("First pick of the draft (blue side)"), value: (c) => c.fp || null, render: (c) => (c.fp ? c.fp : "–") },
    { key: "csm", label: tl("CS/m"), title: tl("CS per minute"), value: (c) => c.csm },
    { key: "gpm", label: tl("GPM"), title: tl("Gold per minute"), value: (c) => c.gpm },
    { key: "dpm", label: tl("DPM"), title: tl("Damage per minute"), value: (c) => c.dpm },
  ];
  return (
    <div className={`${card} space-y-2`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-[#7e8e9f]">
        <span>
          {tl("{n} games", { n: fmtNum(result.games) })}
          {eventName && eventSlug && (
            <>
              {" · "}
              <HubLink to={{ kind: "event", slug: eventSlug }}>{eventName}</HubLink>
            </>
          )}
        </span>
      </div>
      {result.games === 0 ? (
        <p className="text-xs text-[#9bb3c9] py-4 text-center">{tl("No games match these filters.")}</p>
      ) : (
        <SortTable
          rows={result.rows}
          columns={cols}
          // with a role picked, bans (not tied to a role) would put e.g. top-lane bans at the top of a mid list
          initial={{ key: roleQ ? "p" : "presence", desc: true }}
          key={roleQ ? "by-picks" : "by-presence"}
          rowKey={(c) => c.c}
          copyName={["champions", q.get("league"), year, q.get("event"), q.get("patch"), q.get("side"), q.get("role")].filter(Boolean).join("-")}
        />
      )}
      <p className="text-[10px] text-[#7e8e9f]">
        {tl("Blind% = picked before the enemy laner was known (games with the draft order). B1 = blue side's first pick of the draft.")}
      </p>
    </div>
  );
};

/** Top leagues / all leagues: the nightly patch and year files. */
const OverallTable: React.FC<{ meta: StatsMeta; scope: "major" | "all"; q: URLSearchParams; setQ: (p: Record<string, string | undefined>) => void }> = ({
  meta,
  scope,
  q,
  setQ,
}) => {
  const key = q.get("key") && meta.champions.includes(q.get("key")!) ? q.get("key")! : meta.champions.find((k) => k.startsWith("p")) || meta.champions[0];
  const state = useLoad<ChampionStats>(() => loadChampionStats(key), [key]);
  const block = state.data?.[scope] || state.data?.all;
  const roleQ = q.get("role") || "";
  const rows = useMemo(() => {
    if (!block) return [];
    const n = block.games;
    return block.champs
      .filter((c) => !roleQ || c.role === roleQ)
      .map((c) => ({ ...c, presence: (c.p + c.b) / n, wr: c.p ? c.w / c.p : null }));
  }, [block, roleQ]);
  const label = (k: string) =>
    k === "all" ? tl("All time (2011 to today)") : k.startsWith("p") ? tl("Patch {patch}", { patch: k.slice(1) }) : tl("Year {year}", { year: k.slice(1) });
  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    { key: "c", label: tl("Champion"), value: (c) => c.c, render: (c) => <ChampLink name={c.c} size={18} /> },
    { key: "role", label: tl("Role"), value: (c) => c.role || "", render: (c) => <span className="text-[#7e8e9f]">{c.role ? roleName(c.role) : "–"}</span> },
    { key: "presence", label: tl("Presence"), value: (c) => c.presence, render: (c) => pct(c.presence) },
    { key: "p", label: tl("Picks"), value: (c) => c.p },
    { key: "b", label: tl("Bans"), value: (c) => c.b },
    { key: "wr", label: tl("Win %"), value: (c) => (c.p >= 10 ? c.wr : null), render: (c) => (c.p ? pct(c.wr) : "–") },
    { key: "kda", label: tl("KDA"), value: (c) => c.kda ?? null },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={key} onChange={(e) => setQ({ key: e.target.value })} aria-label={tl("Patch or year")} className={sel}>
          {meta.champions.includes("all") && <option value="all">{label("all")}</option>}
          {meta.champions
            .filter((k) => k.startsWith("p"))
            .map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          {meta.champions
            .filter((k) => k.startsWith("y"))
            .map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
        </select>
        <SideRole q={q} setQ={setQ} noSide />
        {block && <span className="text-[#7e8e9f]">{tl("{n} games", { n: fmtNum(block.games) })}</span>}
      </div>
      {state.loading ? (
        <Loading />
      ) : state.error || !block ? (
        <Failed />
      ) : (
        <div className={card}>
          <SortTable rows={rows} columns={cols} initial={{ key: "presence", desc: true }} rowKey={(c) => c.c} copyName={`champions-${scope}-${key}`} />
          <p className="text-[10px] text-[#7e8e9f] mt-2">
            {tl('Presence = picked or banned in that share of games. "Top leagues" = the main regional leagues plus Worlds, MSI and other internationals.')}{" "}
            {tl("Pick a league above for tournament, patch, side and draft filters.")}
          </p>
        </div>
      )}
    </>
  );
};
