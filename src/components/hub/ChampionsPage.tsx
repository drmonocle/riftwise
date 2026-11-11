/**
 * Champion stats with analyst filters. "Top leagues" / "All leagues" read the built patch and year files; a
 * league reads its champion game log for a year and narrows it by tournament, patch, side and role in the
 * browser (blind-pick rate and first picks come from the draft order). Filters live in the address, so a view
 * can be shared: /stats/champions?league=lck&year=2026&patch=26.18&role=Mid
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, roleName, fmtDec } from "../../i18n";
import { ChampionStats, StatsMeta, loadChampionStats } from "../../stats";
import { loadAliases, loadChampGames, loadChampIndex, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolveEventSlug, resolveLeagueSlug, sameChamp } from "../../hub/data";
import { hubShareUrl, navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { ChampAggRow, normalizeRole, ROLES, champAgg, matchedEventLabel, matchEventIndices, patchCompare } from "../../hub/champAgg";
import { SortTable, type Column } from "./SortTable";
import { card, ChampLink, Failed, fmtNum, HubLink, Loading, useLoad, usePageTitle } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { champName } from "../../champions";

const sel = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text max-w-[14rem]";
const pct = (v: number | null) => (v == null ? "–" : `${fmtDec(v * 100)}%`);

const PresenceCell: React.FC<{ presence: number; p: number; b: number; games: number; to?: import("../../hub/route").HubRoute }> = ({ presence, p, b, games, to }) => {
  const g = Math.max(games, 1);
  const pickW = Math.min(100, Math.round((p / g) * 100));
  const banW = Math.min(100 - pickW, Math.round((b / g) * 100));
  return (
    <div className="min-w-[4.5rem] space-y-0.5">
      <div className="font-mono tabular-nums text-rw-text font-semibold">
        {to ? (
          <HubLink to={to} className="hover:text-rw-accent hover:underline" title={tl("Game finder")}>
            {pct(presence)}
          </HubLink>
        ) : (
          pct(presence)
        )}
      </div>
      <div className="h-1 rounded-full bg-rw-raised overflow-hidden flex" aria-hidden="true">
        <div className="h-full bg-rw-teal/80" style={{ width: `${pickW}%` }} />
        <div className="h-full bg-rw-red/65" style={{ width: `${banW}%` }} />
      </div>
    </div>
  );
};

const WinRateCell: React.FC<{ wr: number | null; p: number; minPicks: number; to?: import("../../hub/route").HubRoute }> = ({ wr, p, minPicks, to }) => {
  if (!p || wr == null) return <>–</>;
  const pctNum = Math.round(wr * 100);
  const tone = p >= minPicks ? (wr >= 0.53 ? "text-rw-teal font-semibold" : wr <= 0.47 ? "text-rw-red" : "text-rw-text") : "text-rw-sub";
  return (
    <div className="min-w-[3.75rem] space-y-0.5">
      <div className={`font-mono tabular-nums ${tone}`}>
        {to ? (
          <HubLink to={to} className="hover:underline" title={tl("Game finder")}>
            {pct(wr)}
          </HubLink>
        ) : (
          pct(wr)
        )}
      </div>
      {p >= minPicks && (
        <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
          <div className={`h-full rounded-full ${wr >= 0.5 ? "bg-rw-teal/75" : "bg-rw-red/65"}`} style={{ width: `${Math.min(100, Math.max(4, pctNum))}%` }} />
        </div>
      )}
    </div>
  );
};

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
    const t = by.get(r.c) || then.find((x) => sameChamp(x.c, r.c));
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
  const index = useLoad(loadChampIndex, []);
  const leagues = index.data || [];
  const evSlug = q.get("event") || "";
  const canonEvSlug = evSlug ? resolveEventSlug(evSlug) : "";
  const evPrefix = (canonEvSlug || evSlug).replace(/-20\d{2}.*$/, "");
  const inferredLeague =
    !q.get("league") && !q.get("scope") && evPrefix && evPrefix !== (canonEvSlug || evSlug)
      ? aliases.data?.league[evPrefix.toLowerCase()] || resolveLeagueSlug(evPrefix)
      : "";
  const asked =
    q.get("league") ||
    q.get("scope") ||
    (inferredLeague && (!leagues.length || leagues.some((l) => l.u === inferredLeague)) ? inferredLeague : "top");
  // ?league=lck works too (a league's short name)
  const scope =
    asked === "top" || asked === "all"
      ? asked
      : aliases.data?.league[asked.toLowerCase()] || resolveLeagueSlug(asked);
  const setQ = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    navigateHub({ kind: "champions", query: next.toString() }, { replace: true });
  };
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
        <LeagueTable
          league={scope}
          leagueName={leagues.find((l) => l.u === scope)?.l || scope.toUpperCase()}
          q={q}
          setQ={setQ}
          years={Object.keys(leagues.find((l) => l.u === scope)?.y || {})}
          indexLoading={index.loading}
        />
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
  const evYr = /(?:^|-)(20\d{2})(?:-|$)/.exec(q.get("event") || "")?.[1] || "";
  const year = q.get("year") || (q.get("key")?.startsWith("y") ? q.get("key")!.slice(1) : "") || (evYr && ys.includes(evYr) ? evYr : "") || ys[0] || "";
  const file = useLoad(() => (year ? loadChampGames(league, year) : Promise.resolve(null)), [league, year]);
  const events = file.data?.events || [];
  const rawEventSlug = q.get("event") || "";
  const canonEventSlug = rawEventSlug ? resolveEventSlug(rawEventSlug) : "";
  const eventMatch = useMemo(
    () => matchEventIndices(events, rawEventSlug, canonEventSlug),
    [events, rawEventSlug, canonEventSlug],
  );
  const activeEventValue =
    typeof eventMatch === "number" ? events[eventMatch]?.[0] || "" : eventMatch ? canonEventSlug || rawEventSlug : "";
  const parentEventLabel =
    eventMatch instanceof Set ? matchedEventLabel(events, eventMatch, canonEventSlug || rawEventSlug) : null;
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
      <select value={activeEventValue} onChange={(e) => setQ({ event: e.target.value || undefined })} aria-label={tl("Tournaments")} className={sel}>
        <option value="">{tl("All tournaments")}</option>
        {parentEventLabel && activeEventValue && (
          <option value={activeEventValue}>{parentEventLabel}</option>
        )}
        {events.map(([slug, name]) => (
          <option key={slug} value={slug}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={q.get("patch") || (q.get("key")?.startsWith("p") ? q.get("key")!.slice(1) : "")}
        onChange={(e) => setQ({ patch: e.target.value || undefined, key: undefined })}
        aria-label={tl("Patches")}
        className={sel}
      >
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

const SideRole: React.FC<{ q: URLSearchParams; setQ: (p: Record<string, string | undefined>) => void; noSide?: boolean }> = ({ q, setQ, noSide }) => {
  const rawSide = (q.get("side") || "").toLowerCase();
  const sideVal = rawSide === "b" || rawSide === "blue" ? "b" : rawSide === "r" || rawSide === "red" ? "r" : "";
  return (
    <>
      {!noSide && (
        <select value={sideVal} onChange={(e) => setQ({ side: e.target.value || undefined })} aria-label={tl("Side")} className={sel}>
          <option value="">{tl("Both sides")}</option>
          <option value="b">{tl("Blue side")}</option>
          <option value="r">{tl("Red side")}</option>
        </select>
      )}
      <select value={normalizeRole(q.get("role"))} onChange={(e) => setQ({ role: e.target.value || undefined })} aria-label={tl("Role")} className={sel}>
        <option value="">{tl("All roles")}</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {roleName(r)}
          </option>
        ))}
      </select>
    </>
  );
};

const LeagueTable: React.FC<{
  league: string;
  leagueName: string;
  years: string[];
  q: URLSearchParams;
  setQ: (p: Record<string, string | undefined>) => void;
  indexLoading?: boolean;
}> = ({
  league,
  leagueName,
  years,
  q,
  setQ,
  indexLoading,
}) => {
  const urlSearch = q.get("champ") || q.get("q") || "";
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);
  const ys = [...years].sort().reverse();
  const evYr = /(?:^|-)(20\d{2})(?:-|$)/.exec(q.get("event") || "")?.[1] || "";
  const year = q.get("year") || (q.get("key")?.startsWith("y") ? q.get("key")!.slice(1) : "") || (evYr && ys.includes(evYr) ? evYr : "") || ys[0] || "";
  const file = useLoad(() => (year ? loadChampGames(league, year) : Promise.resolve(null)), [league, year]);
  const eventSlug = q.get("event") || "";
  const canonEventSlug = eventSlug ? resolveEventSlug(eventSlug) : "";
  const roleQ = normalizeRole(q.get("role"));
  const rawSide = (q.get("side") || "").toLowerCase();
  const side: "b" | "r" | undefined = rawSide === "b" || rawSide === "blue" ? "b" : rawSide === "r" || rawSide === "red" ? "r" : undefined;
  const patchQ = q.get("patch") || (q.get("key")?.startsWith("p") ? q.get("key")!.slice(1) : undefined);
  const rawVs = q.get("vs") || "";
  const vs = rawVs.startsWith("p") ? rawVs.slice(1) : rawVs;
  const eventMatch = useMemo(
    () => (file.data ? matchEventIndices(file.data.events, eventSlug, canonEventSlug) : null),
    [file.data, eventSlug, canonEventSlug],
  );
  const result = useMemo(() => {
    if (!file.data) return null;
    const f = { event: eventMatch ?? undefined, side, role: roleQ ? ROLES.indexOf(roleQ) : undefined };
    const now = champAgg(file.data.games, { ...f, patch: patchQ });
    const then = vs ? champAgg(file.data.games, { ...f, patch: vs }) : null;
    return { games: now.games, thenGames: then?.games || 0, rows: deltas(now.rows, then && then.games ? then.rows : null, 5) };
  }, [file.data, eventMatch, patchQ, side, roleQ, vs]);
  const patchList = useMemo(
    () => [...new Set((file.data?.games || []).map((g) => g[1]).filter(Boolean))].sort(patchCompare).reverse(),
    [file.data],
  );
  const emerging = q.get("new") === "1";
  if (indexLoading || file.loading) return <Loading />;
  if (!file.data || !result) return <Failed />;
  const eventName = matchedEventLabel(file.data.events, eventMatch, canonEventSlug || eventSlug);
  type LRow = ChampAggRow & Delta;
  const shownRows = useMemo(() => {
    const base = emerging && vs ? result.rows.filter((r) => r.emerging) : result.rows;
    const terms = search
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s.trim()))
      .filter(Boolean);
    if (!terms.length) return base;
    return base.filter((r) => terms.some((t) => matchesChampSearch(r.c, t)));
  }, [result.rows, emerging, vs, search]);
  const maxLPicks = Math.max(1, ...result.rows.map((r) => r.p || 0));
  const maxLBans = Math.max(1, ...result.rows.map((r) => r.b || 0));
  const cols: Column<LRow>[] = [
    { key: "c", label: tl("Champion"), value: (c) => champName(c.c), render: (c) => <ChampLink name={c.c} size={18} /> },
    {
      key: "role",
      label: tl("Role"),
      value: (c) => c.role,
      render: (c) =>
        c.role >= 0 ? (
          <button
            type="button"
            onClick={() => setQ({ role: roleQ === ROLES[c.role] ? undefined : ROLES[c.role] })}
            className="text-rw-muted hover:text-rw-accent hover:underline"
          >
            {roleName(ROLES[c.role])}
          </button>
        ) : (
          <span className="text-rw-muted">–</span>
        ),
    },
    {
      key: "presence",
      label: tl("Presence"),
      value: (c) => c.presence,
      render: (c) => {
        const fq = new URLSearchParams({
          ...(c.p > 0 ? { champ: resolveChampSlug(c.c) } : { ban: resolveChampSlug(c.c) }),
          league,
          ...(year ? { year } : {}),
          ...(eventSlug ? { event: eventSlug } : {}),
          ...(patchQ ? { patch: patchQ } : {}),
          ...(c.p > 0 && side ? { side } : {}),
          ...(c.p > 0 && roleQ ? { role: roleQ } : {}),
        }).toString();
        return <PresenceCell presence={c.presence} p={c.p} b={c.b} games={result.games} to={c.p + c.b > 0 ? { kind: "finder", query: fq } : undefined} />;
      },
    },
    ...(vs && result.thenGames ? deltaColumns<LRow>(vs) : []),
    {
      key: "p",
      label: tl("Picks"),
      value: (c) => c.p,
      render: (c) => {
        const fq = new URLSearchParams({
          champ: resolveChampSlug(c.c),
          league,
          ...(year ? { year } : {}),
          ...(eventSlug ? { event: eventSlug } : {}),
          ...(patchQ ? { patch: patchQ } : {}),
          ...(side ? { side } : {}),
          ...(roleQ ? { role: roleQ } : {}),
        }).toString();
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[2.5rem] tabular-nums">
            {c.p > 0 ? (
              <HubLink to={{ kind: "finder", query: fq }} className="hover:text-rw-accent hover:underline" title={tl("Game finder")}>
                {c.p}
              </HubLink>
            ) : (
              <span>{c.p}</span>
            )}
            <span className="h-1 w-9 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-teal/75" style={{ width: `${c.p > 0 ? Math.max(6, Math.round((c.p / maxLPicks) * 100)) : 0}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      key: "b",
      label: tl("Bans"),
      value: (c) => c.b,
      render: (c) => {
        const fq = new URLSearchParams({
          ban: resolveChampSlug(c.c),
          league,
          ...(year ? { year } : {}),
          ...(eventSlug ? { event: eventSlug } : {}),
          ...(patchQ ? { patch: patchQ } : {}),
        }).toString();
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[2.5rem] tabular-nums">
            {c.b > 0 ? (
              <HubLink to={{ kind: "finder", query: fq }} className="hover:text-rw-accent hover:underline" title={tl("Game finder")}>
                {c.b}
              </HubLink>
            ) : (
              <span>{c.b}</span>
            )}
            <span className="h-1 w-9 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-red/65" style={{ width: `${c.b > 0 ? Math.max(6, Math.round((c.b / maxLBans) * 100)) : 0}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      key: "wr",
      label: tl("Win %"),
      value: (c) => (c.p >= 3 ? c.wr : null),
      render: (c) => {
        const fq = new URLSearchParams({
          champ: resolveChampSlug(c.c),
          league,
          ...(year ? { year } : {}),
          ...(eventSlug ? { event: eventSlug } : {}),
          ...(patchQ ? { patch: patchQ } : {}),
          ...(side ? { side } : {}),
          ...(roleQ ? { role: roleQ } : {}),
        }).toString();
        return <WinRateCell wr={c.wr} p={c.p} minPicks={3} to={c.p > 0 ? { kind: "finder", query: fq } : undefined} />;
      },
    },
    {
      key: "kda",
      label: tl("KDA"),
      value: (c) => c.kda,
      render: (c) =>
        c.kda == null ? (
          "–"
        ) : (
          <HubLink to={{ kind: "champ", slug: resolveChampSlug(c.c) }} className="hover:text-rw-accent hover:underline">
            {fmtDec(c.kda, 2)}
          </HubLink>
        ),
    },
    {
      key: "blind",
      label: tl("Blind%"),
      title: tl("Share of picks made before the enemy laner was picked"),
      value: (c) => c.blind,
      render: (c) =>
        c.blind == null ? (
          "–"
        ) : (
          <HubLink to={{ kind: "champ", slug: resolveChampSlug(c.c) }} className="inline-flex flex-col gap-0.5 min-w-[3rem] tabular-nums hover:text-rw-accent">
            <span className="hover:underline">{pct(c.blind)}</span>
            <span className="h-1 w-10 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-accent/70" style={{ width: `${Math.max(4, Math.min(100, Math.round(c.blind * 100)))}%` }} />
            </span>
          </HubLink>
        ),
    },
    {
      key: "fp",
      label: "B1",
      title: tl("First pick of the draft (blue side)"),
      value: (c) => c.fp || null,
      render: (c) =>
        c.fp ? (
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                champ: resolveChampSlug(c.c),
                league,
                side: "b",
                ...(year ? { year } : {}),
                ...(eventSlug ? { event: eventSlug } : {}),
                ...(patchQ ? { patch: patchQ } : {}),
              }).toString(),
            }}
            className="hover:text-rw-accent hover:underline"
            title={tl("Game finder")}
          >
            {c.fp}
          </HubLink>
        ) : (
          "–"
        ),
    },
    {
      key: "csm",
      label: tl("CS/m"),
      title: tl("CS per minute"),
      value: (c) => c.csm,
      render: (c) =>
        c.csm == null ? (
          "–"
        ) : (
          <HubLink to={{ kind: "champ", slug: resolveChampSlug(c.c) }} className="hover:text-rw-accent hover:underline">
            {fmtDec(c.csm, 1)}
          </HubLink>
        ),
    },
    {
      key: "gpm",
      label: tl("GPM"),
      title: tl("Gold per minute"),
      value: (c) => c.gpm,
      render: (c) =>
        c.gpm == null ? (
          "–"
        ) : (
          <HubLink to={{ kind: "champ", slug: resolveChampSlug(c.c) }} className="hover:text-rw-accent hover:underline">
            {fmtNum(c.gpm)}
          </HubLink>
        ),
    },
    {
      key: "dpm",
      label: tl("DPM"),
      title: tl("Damage per minute"),
      value: (c) => c.dpm,
      render: (c) =>
        c.dpm == null ? (
          "–"
        ) : (
          <HubLink to={{ kind: "champ", slug: resolveChampSlug(c.c) }} className="hover:text-rw-accent hover:underline">
            {fmtNum(c.dpm)}
          </HubLink>
        ),
    },
  ];
  return (
    <div className={`${card} space-y-2`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setQ({ q: e.target.value.trim() || undefined, champ: undefined });
          }}
          placeholder={tl("Search champions…")}
          aria-label={tl("Search champions…")}
          className={`${sel} w-44`}
        />
        <CompareWith
          value={vs}
          options={patchList.filter((p) => p !== patchQ).map((p) => [p, p])}
          onChange={(v) => setQ({ vs: v || undefined, new: undefined })}
          emerging={emerging}
          onEmerging={(v) => setQ({ new: v ? "1" : undefined })}
        />
        {vs && !patchQ && <span className="text-[10px] text-rw-muted">{tl("Pick a patch above to compare it with this one.")}</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-rw-muted">
        <span>
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                league,
                ...(year ? { year } : {}),
                ...(eventSlug ? { event: eventSlug } : {}),
                ...(patchQ ? { patch: patchQ } : {}),
                ...(side ? { side } : {}),
                ...(roleQ ? { role: roleQ } : {}),
              }).toString(),
            }}
            className="hover:text-rw-accent hover:underline"
          >
            {tl("{n} games", { n: fmtNum(result.games) })}
          </HubLink>
          {vs && result.thenGames > 0 && (
            <>
              {" · "}
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    league,
                    ...(year ? { year } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    patch: vs,
                    ...(side ? { side } : {}),
                    ...(roleQ ? { role: roleQ } : {}),
                  }).toString(),
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {tl("{n} games on {patch}", { n: fmtNum(result.thenGames), patch: vs })}
              </HubLink>
            </>
          )}
          {eventName && eventSlug && (
            <>
              {" · "}
              <HubLink to={{ kind: "event", slug: eventSlug }}>{eventName}</HubLink>
            </>
          )}
        </span>
        {shownRows.length > 0 && (
          <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
            <HubLink
              to={{
                kind: "counters",
                query: new URLSearchParams({
                  ...(shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                  ...(shownRows[1] ? { vs: resolveChampSlug(shownRows[1].c) } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Counter-pick finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  scope: league,
                  ...(patchQ ? { key: `p${patchQ}` } : year ? { key: `y${year}` } : {}),
                  ...(eventSlug ? { event: eventSlug } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                  ...(search.trim()
                    ? { q: search.trim() }
                    : shownRows[0]
                      ? { q: shownRows.slice(0, 2).map((r) => resolveChampSlug(r.c)).join(",") }
                      : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "items",
                query: new URLSearchParams({
                  ...(shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                  ...(year ? { year } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Item history")} →
            </HubLink>
            <HubLink
              to={{
                kind: "draft",
                query: new URLSearchParams({
                  ...(eventSlug ? { p: `e:${eventSlug}` } : patchQ ? { p: `p:${patchQ}` } : year ? { p: `y${year}` } : {}),
                  ...(shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  league,
                  ...(year ? { year } : {}),
                  ...(eventSlug ? { event: eventSlug } : {}),
                  ...(patchQ ? { patch: patchQ } : {}),
                  ...(side ? { side } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                  ...((search.trim() || shownRows.length === 1) && shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league,
                  ...(year ? { year } : {}),
                  ...(eventSlug ? { event: eventSlug } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                  ...((search.trim() || shownRows.length === 1) && shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{ kind: "rankings", query: `league=${encodeURIComponent(league)}` }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Power rankings")} →
            </HubLink>
            <SectionCard
              section={tl("Champions")}
              name={[leagueName, year, patchQ && tl("Patch {patch}", { patch: patchQ })].filter(Boolean).join(" · ")}
              sub={tl("{n} games", { n: fmtNum(result.games) })}
              rows={() =>
                shownRows.slice(0, 12).map((c, i) => ({
                  rank: i + 1,
                  champ: c.c,
                  label: champName(c.c),
                  sub: `${c.p} ${tl("Picks")} · ${c.b} ${tl("Bans")}`,
                  value: `${pct(c.presence)}${c.p >= 3 && c.wr != null ? ` · ${pct(c.wr)}` : ""}`,
                  win: c.p >= 3 && c.wr != null ? c.wr >= 0.5 : undefined,
                }))
              }
            />
            <CopyChampsPost
              title={[tl("Champions"), leagueName, year, patchQ && tl("Patch {patch}", { patch: patchQ })].filter(Boolean).join(" · ")}
              rows={shownRows}
              query={q.toString()}
            />
          </span>
        )}
      </div>
      {shownRows.length > 0 && (
        <MetaSpotlight
          rows={shownRows}
          minWrPicks={5}
          league={league}
          year={year}
          event={eventSlug || undefined}
          patch={patchQ || undefined}
          role={roleQ || undefined}
        />
      )}
      {result.games === 0 ? (
        <p className="text-xs text-rw-sub py-4 text-center">{tl("No games match these filters.")}</p>
      ) : (
        <SortTable
          rows={shownRows}
          columns={cols}
          // with a role picked, bans (not tied to a role) would put e.g. top-lane bans at the top of a mid list
          initial={{ key: vs ? "dPres" : roleQ ? "p" : "presence", desc: true }}
          key={vs ? "by-delta" : roleQ ? "by-picks" : "by-presence"}
          rowKey={(c) => c.c}
          copyName={["champions", q.get("league"), year, q.get("event"), patchQ, q.get("side"), q.get("role")].filter(Boolean).join("-")}
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
  const urlSearch = q.get("champ") || q.get("q") || "";
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);
  const askedKey = q.get("key") || (q.get("patch") ? `p${q.get("patch")}` : q.get("year") ? `y${q.get("year")}` : "");
  const key = askedKey && meta.champions.includes(askedKey) ? askedKey : meta.champions.find((k) => k.startsWith("p")) || meta.champions[0];
  const state = useLoad<ChampionStats>(() => loadChampionStats(key), [key]);
  const block = state.data?.[scope] || state.data?.all;
  const roleQ = normalizeRole(q.get("role"));
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
  const shownRows = useMemo(() => {
    const base = emerging && thenBlock ? rows.filter((r) => r.emerging) : rows;
    const terms = search
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s.trim()))
      .filter(Boolean);
    if (!terms.length) return base;
    return base.filter((r) => terms.some((t) => matchesChampSearch(r.c, t)));
  }, [rows, emerging, thenBlock, search]);
  const maxOPicks = useMemo(() => Math.max(1, ...rows.map((r) => r.p || 0)), [rows]);
  const maxOBans = useMemo(() => Math.max(1, ...rows.map((r) => r.b || 0)), [rows]);
  const cols: Column<Row>[] = [
    { key: "c", label: tl("Champion"), value: (c) => champName(c.c), render: (c) => <ChampLink name={c.c} size={18} /> },
    {
      key: "role",
      label: tl("Role"),
      value: (c) => c.role || "",
      render: (c) =>
        c.role ? (
          <button
            type="button"
            onClick={() => setQ({ role: roleQ === c.role ? undefined : c.role || undefined })}
            className="text-rw-muted hover:text-rw-accent hover:underline"
          >
            {roleName(c.role)}
          </button>
        ) : (
          <span className="text-rw-muted">–</span>
        ),
    },
    {
      key: "presence",
      label: tl("Presence"),
      value: (c) => c.presence,
      render: (c) => {
        const fq = new URLSearchParams({
          ...(c.p > 0 ? { champ: resolveChampSlug(c.c) } : { ban: resolveChampSlug(c.c) }),
          ...(key.startsWith("p") ? { patch: key.slice(1) } : key.startsWith("y") ? { year: key.slice(1) } : {}),
          ...(c.p > 0 && roleQ ? { role: roleQ } : {}),
        }).toString();
        return <PresenceCell presence={c.presence} p={c.p} b={c.b} games={block?.games || 1} to={c.p + c.b > 0 ? { kind: "finder", query: fq } : undefined} />;
      },
    },
    ...(thenBlock ? deltaColumns<Row>(label(vs)) : []),
    {
      key: "p",
      label: tl("Picks"),
      value: (c) => c.p,
      render: (c) => {
        const fq = new URLSearchParams({
          champ: resolveChampSlug(c.c),
          ...(key.startsWith("p") ? { patch: key.slice(1) } : key.startsWith("y") ? { year: key.slice(1) } : {}),
          ...(roleQ ? { role: roleQ } : {}),
        }).toString();
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[2.75rem] tabular-nums">
            {c.p > 0 ? (
              <HubLink to={{ kind: "finder", query: fq }} className="hover:text-rw-accent hover:underline" title={tl("Game finder")}>
                {fmtNum(c.p)}
              </HubLink>
            ) : (
              <span>{fmtNum(c.p)}</span>
            )}
            <span className="h-1 w-9 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-teal/75" style={{ width: `${c.p > 0 ? Math.max(6, Math.round((c.p / maxOPicks) * 100)) : 0}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      key: "b",
      label: tl("Bans"),
      value: (c) => c.b,
      render: (c) => {
        const fq = new URLSearchParams({
          ban: resolveChampSlug(c.c),
          ...(key.startsWith("p") ? { patch: key.slice(1) } : key.startsWith("y") ? { year: key.slice(1) } : {}),
        }).toString();
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[2.75rem] tabular-nums">
            {c.b > 0 ? (
              <HubLink to={{ kind: "finder", query: fq }} className="hover:text-rw-accent hover:underline" title={tl("Game finder")}>
                {fmtNum(c.b)}
              </HubLink>
            ) : (
              <span>{fmtNum(c.b)}</span>
            )}
            <span className="h-1 w-9 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-red/65" style={{ width: `${c.b > 0 ? Math.max(6, Math.round((c.b / maxOBans) * 100)) : 0}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      key: "wr",
      label: tl("Win %"),
      value: (c) => (c.p >= 10 ? c.wr : null),
      render: (c) => {
        const fq = new URLSearchParams({
          champ: resolveChampSlug(c.c),
          ...(key.startsWith("p") ? { patch: key.slice(1) } : key.startsWith("y") ? { year: key.slice(1) } : {}),
          ...(roleQ ? { role: roleQ } : {}),
        }).toString();
        return <WinRateCell wr={c.wr} p={c.p} minPicks={10} to={c.p > 0 ? { kind: "finder", query: fq } : undefined} />;
      },
    },
    {
      key: "kda",
      label: tl("KDA"),
      value: (c) => c.kda ?? null,
      render: (c) =>
        c.kda == null ? (
          "–"
        ) : (
          <HubLink to={{ kind: "champ", slug: resolveChampSlug(c.c) }} className="hover:text-rw-accent hover:underline">
            {fmtDec(c.kda, 2)}
          </HubLink>
        ),
    },
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
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setQ({ q: e.target.value.trim() || undefined, champ: undefined });
          }}
          placeholder={tl("Search champions…")}
          aria-label={tl("Search champions…")}
          className={`${sel} w-44`}
        />
        {key.startsWith("p") && (
          <CompareWith
            value={vs}
            options={compareOptions}
            onChange={(v) => setQ({ vs: v || undefined, new: undefined })}
            emerging={emerging}
            onEmerging={(v) => setQ({ new: v ? "1" : undefined })}
          />
        )}
        {block && (
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                ...(key.startsWith("p") ? { patch: key.slice(1) } : key.startsWith("y") ? { year: key.slice(1) } : {}),
                ...(roleQ ? { role: roleQ } : {}),
              }).toString(),
            }}
            className="text-rw-muted hover:text-rw-accent hover:underline"
          >
            {tl("{n} games", { n: fmtNum(block.games) })}
          </HubLink>
        )}
        {block && shownRows.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
            <HubLink
              to={{
                kind: "counters",
                query: new URLSearchParams({
                  ...(shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                  ...(shownRows[1] ? { vs: resolveChampSlug(shownRows[1].c) } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Counter-pick finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  key,
                  ...(scope === "all" ? { scope: "all" } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                  ...(search.trim()
                    ? { q: search.trim() }
                    : shownRows[0]
                      ? { q: shownRows.slice(0, 2).map((r) => resolveChampSlug(r.c)).join(",") }
                      : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "items",
                query: new URLSearchParams({
                  ...(shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                  ...(key.startsWith("y") ? { year: key.slice(1) } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Item history")} →
            </HubLink>
            <HubLink
              to={{
                kind: "draft",
                query: new URLSearchParams({
                  ...(key.startsWith("p") ? { p: `p:${key.slice(1)}` } : key.startsWith("y") ? { p: key } : {}),
                  ...(shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  ...(key.startsWith("p") ? { patch: key.slice(1) } : key.startsWith("y") ? { year: key.slice(1) } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                  ...((search.trim() || shownRows.length === 1) && shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  ...(key.startsWith("y") ? { year: key.slice(1) } : {}),
                  ...(roleQ ? { role: roleQ } : {}),
                  ...((search.trim() || shownRows.length === 1) && shownRows[0] ? { champ: resolveChampSlug(shownRows[0].c) } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{ kind: "rankings" }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Power rankings")} →
            </HubLink>
            <SectionCard
              section={tl("Champions")}
              name={label(key)}
              sub={tl("{n} games", { n: fmtNum(block.games) })}
              rows={() =>
                shownRows.slice(0, 12).map((c, i) => ({
                  rank: i + 1,
                  champ: c.c,
                  label: champName(c.c),
                  sub: `${c.p} ${tl("Picks")} · ${c.b} ${tl("Bans")}`,
                  value: `${pct(c.presence)}${c.p >= 10 && c.wr != null ? ` · ${pct(c.wr)}` : ""}`,
                  win: c.p >= 10 && c.wr != null ? c.wr >= 0.5 : undefined,
                }))
              }
            />
            <CopyChampsPost title={`${tl("Champions")} · ${label(key)}`} rows={shownRows} query={q.toString()} />
          </span>
        )}
      </div>
      {state.loading ? (
        <Loading />
      ) : state.error || !block ? (
        <Failed />
      ) : (
        <div className={`${card} space-y-2.5`}>
          {shownRows.length > 0 && (
            <MetaSpotlight
              rows={shownRows}
              minWrPicks={10}
              keyParam={key}
              year={key.startsWith("y") ? key.slice(1) : undefined}
              patch={key.startsWith("p") ? key.slice(1) : undefined}
              role={roleQ || undefined}
              scopeAll={scope === "all"}
            />
          )}
          <SortTable
            rows={shownRows}
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

/** 4-card meta spotlight strip above the Champions table (#1 Presence, Picks, Bans, and Win %). */
const MetaSpotlight: React.FC<{
  rows: { c: string; presence: number; p: number; b: number; wr: number | null }[];
  minWrPicks: number;
  league?: string;
  year?: string;
  event?: string;
  patch?: string;
  role?: string;
  keyParam?: string;
  scopeAll?: boolean;
}> = ({ rows, minWrPicks, league, year, event, patch, role, keyParam, scopeAll }) => {
  const topPres = useMemo(() => [...rows].sort((a, b) => b.presence - a.presence)[0], [rows]);
  const topPicks = useMemo(() => [...rows].sort((a, b) => b.p - a.p)[0], [rows]);
  const topBans = useMemo(() => [...rows].sort((a, b) => b.b - a.b)[0], [rows]);
  const topWr = useMemo(
    () => [...rows].filter((r) => r.p >= minWrPicks && r.wr != null).sort((a, b) => (b.wr || 0) - (a.wr || 0))[0],
    [rows, minWrPicks],
  );
  const cards = [
    topPres ? { label: tl("Presence"), c: topPres.c, val: pct(topPres.presence), sub: `${topPres.p}P · ${topPres.b}B`, tone: "text-rw-accent" } : null,
    topPicks ? { label: tl("Picks"), c: topPicks.c, val: fmtNum(topPicks.p), sub: topPicks.wr != null ? `${pct(topPicks.wr)} ${tl("Win %")}` : undefined, tone: "text-rw-text" } : null,
    topBans && topBans.b > 0 ? { label: tl("Bans"), c: topBans.c, val: fmtNum(topBans.b), sub: `${pct(topBans.presence)} ${tl("Presence")}`, tone: "text-rw-red" } : null,
    topWr && topWr.wr != null ? { label: tl("Win %"), c: topWr.c, val: pct(topWr.wr), sub: `${topWr.p} ${tl("Picks")}`, tone: "text-rw-teal" } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  if (cards.length < 2) return null;
  const tierKey = keyParam || (patch ? `p${patch}` : year ? `y${year}` : "");
  const draftP = event ? `e:${event}` : patch ? `p:${patch}` : year ? `y${year}` : keyParam?.startsWith("p") ? `p:${keyParam.slice(1)}` : keyParam?.startsWith("y") ? keyParam : "";
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      {cards.map((item) => (
        <div key={item.label} className="rounded-lg border border-rw-border bg-rw-bg/50 px-2.5 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted truncate">{item.label}</div>
            <div className="mt-0.5 truncate">
              <ChampLink name={item.c} size={18} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <HubLink
              to={{ kind: "champ", slug: resolveChampSlug(item.c) }}
              className={`font-mono font-bold tabular-nums hover:underline ${item.tone}`}
            >
              {item.val}
            </HubLink>
            {item.sub && (
              <div className="text-[10px] text-rw-muted font-mono">
                <HubLink to={{ kind: "champ", slug: resolveChampSlug(item.c) }} className="hover:text-rw-accent hover:underline">
                  {item.sub}
                </HubLink>
                {" · "}
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${encodeURIComponent(resolveChampSlug(item.c))}${role ? `&role=${encodeURIComponent(role)}` : ""}`,
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")}
                </HubLink>
                {" · "}
                <HubLink
                  to={{
                    kind: "items",
                    query: `champ=${encodeURIComponent(resolveChampSlug(item.c))}${year ? `&year=${encodeURIComponent(year)}` : ""}`,
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")}
                </HubLink>
                {" · "}
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      champ: resolveChampSlug(item.c),
                      ...(league ? { league } : {}),
                      ...(year ? { year } : {}),
                      ...(event ? { event } : {}),
                      ...(patch ? { patch } : {}),
                      ...(role ? { role } : {}),
                    }).toString(),
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")}
                </HubLink>
                {" · "}
                <HubLink
                  to={{
                    kind: "tiers",
                    query: new URLSearchParams({
                      ...(league ? { scope: league } : scopeAll ? { scope: "all" } : {}),
                      ...(tierKey ? { key: tierKey } : {}),
                      ...(role ? { role } : {}),
                      q: resolveChampSlug(item.c),
                    }).toString(),
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")}
                </HubLink>
                {" · "}
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      ...(draftP ? { p: draftP } : {}),
                      champ: resolveChampSlug(item.c),
                      ...(role ? { role } : {}),
                    }).toString(),
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")}
                </HubLink>
                {" · "}
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      champ: resolveChampSlug(item.c),
                      ...(league ? { league } : {}),
                      ...(year ? { year } : {}),
                      ...(event ? { event } : {}),
                      ...(role ? { role } : {}),
                    }).toString(),
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")}
                </HubLink>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const CopyChampsPost: React.FC<{
  title: string;
  rows: { c: string; presence: number; p: number; b: number; wr: number | null }[];
  query?: string;
}> = ({ title, rows, query }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const top = [...rows].sort((a, b) => b.presence - a.presence).slice(0, 5);
    const lines = [
      title,
      ...top.map((c, i) => `#${i + 1} ${champName(c.c)} — ${pct(c.presence)} ${tl("Presence")} (${c.p}P / ${c.b}B${c.p >= 5 && c.wr != null ? `, ${pct(c.wr)} ${tl("Win %")}` : ""})`),
      hubShareUrl({ kind: "champions", ...(query ? { query } : {}) }),
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

