/**
 * Champion stats with analyst filters. "Top leagues" / "All leagues" read the built patch and year files; a
 * league reads its champion game log for a year and narrows it by tournament, patch, side and role in the
 * browser (blind-pick rate and first picks come from the draft order). Filters live in the address, so a view
 * can be shared: /stats/champions?league=lck&year=2026&patch=26.18&role=Mid
 */
import React, { useMemo } from "react";
import { tl, roleName, fmtDec } from "../../i18n";
import { ChampionStats, StatsMeta, loadChampionStats } from "../../stats";
import { loadAliases, loadChampGames, loadChampIndex } from "../../hub/data";
import { navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { ChampAggRow, ROLES, champAgg, patchCompare } from "../../hub/champAgg";
import { SortTable, type Column } from "./SortTable";
import { card, ChampLink, Failed, fmtNum, HubLink, Loading, useLoad, usePageTitle } from "./ui";

const sel = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text max-w-[14rem]";
const pct = (v: number | null) => (v == null ? "–" : `${fmtDec(v * 100)}%`);

/** Change against the compared patch, in points: "+12.5 ▲" in teal, "-8.0 ▼" in red, "new" when it wasn't there. */
interface Delta {
  /** presence then (null: not picked or banned at all) */
  was: number | null;
  dPres: number | null;
  dWr: number | null;
  /** from under 5% presence (or nothing) to over 15% */
  emerging: boolean;
}

function deltas<T extends { c: string; presence: number; p: number; wr: number | null }>(
  now: T[],
  then: { c: string; presence: number; p: number; wr: number | null }[] | null,
  minPicks: number,
): (T & Delta)[] {
  if (!then) return now.map((r) => ({ ...r, was: null, dPres: null, dWr: null, emerging: false }));
  const by = new Map(then.map((r) => [r.c, r]));
  return now.map((r) => {
    const t = by.get(r.c);
    const was = t ? t.presence : null;
    return {
      ...r,
      was,
      dPres: r.presence - (was || 0),
      dWr: t && t.wr != null && r.wr != null && t.p >= minPicks && r.p >= minPicks ? r.wr - t.wr : null,
      emerging: (was || 0) < 0.05 && r.presence > 0.15,
    };
  });
}

const Arrow: React.FC<{ v: number | null; isNew?: boolean }> = ({ v, isNew }) =>
  isNew ? (
    <span className="text-rw-accent font-semibold">{tl("new")}</span>
  ) : v == null ? (
    <span className="text-rw-muted">–</span>
  ) : (
    <span className={v > 0.0005 ? "text-rw-teal" : v < -0.0005 ? "text-rw-red" : "text-rw-muted"}>
      {`${v > 0 ? "+" : ""}${fmtDec(v * 100)}`} {v > 0.0005 ? "▲" : v < -0.0005 ? "▼" : ""}
    </span>
  );

function deltaColumns<T extends Delta & { presence: number }>(label: string): Column<T>[] {
  return [
    {
      key: "dPres",
      label: tl("Presence Δ"),
      title: tl("Change in presence against {patch}, in points", { patch: label }),
      value: (c) => c.dPres,
      render: (c) => <Arrow v={c.dPres} isNew={c.was == null && c.presence > 0} />,
    },
    {
      key: "dWr",
      label: tl("Win % Δ"),
      title: tl("Change in win rate against {patch}, in points (enough picks on both)", { patch: label }),
      value: (c) => c.dWr,
      render: (c) => <Arrow v={c.dWr} />,
    },
  ];
}

/** "Compare with": none, or another patch of the list (the one before is the usual pick). */
const CompareWith: React.FC<{ value: string; options: [string, string][]; onChange: (v: string) => void; emerging: boolean; onEmerging: (v: boolean) => void }> = ({
  value,
  options,
  onChange,
  emerging,
  onEmerging,
}) => (
  <>
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={tl("Compare with")} className={sel}>
      <option value="">{tl("Compare with: nothing")}</option>
      {options.map(([k, l]) => (
        <option key={k} value={k}>
          {tl("Compare with {patch}", { patch: l })}
        </option>
      ))}
    </select>
    {value && (
      <label className="flex items-center gap-1 text-rw-sub cursor-pointer">
        <input type="checkbox" checked={emerging} onChange={(e) => onEmerging(e.target.checked)} />
        {tl("Only new or rising picks")}
      </label>
    )}
  </>
);

export const ChampionsPage: React.FC<{ meta: StatsMeta; query?: string }> = ({ meta, query }) => {
  usePageTitle(tl("Champions"));
  useDDragon();
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const aliases = useLoad(loadAliases, []);
  const asked = q.get("league") || q.get("scope") || "top";
  // ?league=lck works too (a league's short name)
  const scope = aliases.data?.league[asked.toLowerCase()] || asked;
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
  setQ,
}) => {
  const year = q.get("year") || [...years].sort().reverse()[0] || "";
  const file = useLoad(() => (year ? loadChampGames(league, year) : Promise.reject(new Error("no year"))), [league, year]);
  const eventSlug = q.get("event") || "";
  const roleQ = q.get("role") || "";
  const side = q.get("side") === "b" || q.get("side") === "r" ? (q.get("side") as "b" | "r") : undefined;
  const vs = q.get("vs") || "";
  const result = useMemo(() => {
    if (!file.data) return null;
    const ei = eventSlug ? file.data.events.findIndex(([s]) => s === eventSlug) : -1;
    const f = { event: ei >= 0 ? ei : undefined, side, role: roleQ ? ROLES.indexOf(roleQ) : undefined };
    const now = champAgg(file.data.games, { ...f, patch: q.get("patch") || undefined });
    const then = vs ? champAgg(file.data.games, { ...f, patch: vs }) : null;
    return { games: now.games, thenGames: then?.games || 0, rows: deltas(now.rows, then && then.games ? then.rows : null, 5) };
  }, [file.data, eventSlug, q, side, roleQ, vs]);
  const patchList = useMemo(
    () => [...new Set((file.data?.games || []).map((g) => g[1]).filter(Boolean))].sort(patchCompare).reverse(),
    [file.data],
  );
  const emerging = q.get("new") === "1";
  if (file.loading) return <Loading />;
  if (!file.data || !result) return <Failed />;
  const eventName = eventSlug ? file.data.events.find(([s]) => s === eventSlug)?.[1] : null;
  type LRow = ChampAggRow & Delta;
  const cols: Column<LRow>[] = [
    { key: "c", label: tl("Champion"), value: (c) => c.c, render: (c) => <ChampLink name={c.c} size={18} /> },
    { key: "role", label: tl("Role"), value: (c) => c.role, render: (c) => <span className="text-rw-muted">{c.role >= 0 ? roleName(ROLES[c.role]) : "–"}</span> },
    { key: "presence", label: tl("Presence"), value: (c) => c.presence, render: (c) => pct(c.presence) },
    ...(vs && result.thenGames ? deltaColumns<LRow>(vs) : []),
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
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <CompareWith
          value={vs}
          options={patchList.filter((p) => p !== q.get("patch")).map((p) => [p, p])}
          onChange={(v) => setQ({ vs: v || undefined, new: undefined })}
          emerging={emerging}
          onEmerging={(v) => setQ({ new: v ? "1" : undefined })}
        />
        {vs && !q.get("patch") && <span className="text-[10px] text-rw-muted">{tl("Pick a patch above to compare it with this one.")}</span>}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-rw-muted">
        <span>
          {tl("{n} games", { n: fmtNum(result.games) })}
          {vs && result.thenGames > 0 && ` · ${tl("{n} games on {patch}", { n: fmtNum(result.thenGames), patch: vs })}`}
          {eventName && eventSlug && (
            <>
              {" · "}
              <HubLink to={{ kind: "event", slug: eventSlug }}>{eventName}</HubLink>
            </>
          )}
        </span>
      </div>
      {result.games === 0 ? (
        <p className="text-xs text-rw-sub py-4 text-center">{tl("No games match these filters.")}</p>
      ) : (
        <SortTable
          rows={emerging && vs ? result.rows.filter((r) => r.emerging) : result.rows}
          columns={cols}
          // with a role picked, bans (not tied to a role) would put e.g. top-lane bans at the top of a mid list
          initial={{ key: vs ? "dPres" : roleQ ? "p" : "presence", desc: true }}
          key={vs ? "by-delta" : roleQ ? "by-picks" : "by-presence"}
          rowKey={(c) => c.c}
          copyName={["champions", q.get("league"), year, q.get("event"), q.get("patch"), q.get("side"), q.get("role")].filter(Boolean).join("-")}
        />
      )}
      <p className="text-[10px] text-rw-muted">
        {tl("Blind% = picked before the enemy laner was known (games with the draft order). B1 = blue side's first pick of the draft.")}
      </p>
    </div>
  );
};

/** Top leagues / all leagues: the built patch and year files. */
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
  const patchKeys = meta.champions.filter((k) => k.startsWith("p"));
  const vs = q.get("vs") && meta.champions.includes(q.get("vs")!) ? q.get("vs")! : "";
  const then = useLoad<ChampionStats | null>(() => (vs ? loadChampionStats(vs) : Promise.resolve(null)), [vs]);
  const thenBlock = then.data ? then.data[scope] || then.data.all : null;
  const emerging = q.get("new") === "1";
  const rows = useMemo(() => {
    if (!block) return [];
    const shape = (b: NonNullable<typeof block>) =>
      b.champs.map((c) => ({ ...c, presence: Math.min(1, (c.p + c.b) / b.games), wr: c.p ? c.w / c.p : null }));
    // the role filter applies to this patch only: a flex pick whose main role changed isn't "new"
    return deltas(shape(block).filter((c) => !roleQ || c.role === roleQ), thenBlock ? shape(thenBlock) : null, 10);
  }, [block, thenBlock, roleQ]);
  const label = (k: string) =>
    k === "all" ? tl("All time (2011 to today)") : k.startsWith("p") ? tl("Patch {patch}", { patch: k.slice(1) }) : tl("Year {year}", { year: k.slice(1) });
  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    { key: "c", label: tl("Champion"), value: (c) => c.c, render: (c) => <ChampLink name={c.c} size={18} /> },
    { key: "role", label: tl("Role"), value: (c) => c.role || "", render: (c) => <span className="text-rw-muted">{c.role ? roleName(c.role) : "–"}</span> },
    { key: "presence", label: tl("Presence"), value: (c) => c.presence, render: (c) => pct(c.presence) },
    ...(thenBlock ? deltaColumns<Row>(label(vs)) : []),
    { key: "p", label: tl("Picks"), value: (c) => c.p },
    { key: "b", label: tl("Bans"), value: (c) => c.b },
    { key: "wr", label: tl("Win %"), value: (c) => (c.p >= 10 ? c.wr : null), render: (c) => (c.p ? pct(c.wr) : "–") },
    { key: "kda", label: tl("KDA"), value: (c) => c.kda ?? null },
  ];
  // the patch before the chosen one, for "Compare with" (patch keys are newest first)
  const compareOptions: [string, string][] = patchKeys.filter((k) => k !== key).map((k) => [k, label(k)]);
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
        {key.startsWith("p") && (
          <CompareWith
            value={vs}
            options={compareOptions}
            onChange={(v) => setQ({ vs: v || undefined, new: undefined })}
            emerging={emerging}
            onEmerging={(v) => setQ({ new: v ? "1" : undefined })}
          />
        )}
        {block && <span className="text-rw-muted">{tl("{n} games", { n: fmtNum(block.games) })}</span>}
      </div>
      {state.loading ? (
        <Loading />
      ) : state.error || !block ? (
        <Failed />
      ) : (
        <div className={card}>
          <SortTable
            rows={emerging && thenBlock ? rows.filter((r) => r.emerging) : rows}
            columns={cols}
            initial={{ key: thenBlock ? "dPres" : "presence", desc: true }}
            key={thenBlock ? "by-delta" : "by-presence"}
            rowKey={(c) => c.c}
            copyName={`champions-${scope}-${key}${vs ? `-vs-${vs}` : ""}`}
          />
          <p className="text-[10px] text-rw-muted mt-2">
            {tl('Presence = picked or banned in that share of games. "Top leagues" = the main regional leagues plus Worlds, MSI and other internationals.')}{" "}
            {tl("Pick a league above for tournament, patch, side and draft filters.")}
          </p>
        </div>
      )}
    </>
  );
};
