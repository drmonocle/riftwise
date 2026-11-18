/**
 * Champion duo synergies: 2v2 and role-pair win rates, expected win rate vs solo baselines,
 * synergy lift, combined GD@15, and top pro player pairs across leagues, patches, and seasons.
 * Address: /stats/synergy?pair=mid-jg&scope=major&year=2026&champ=azir
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, fmtDec, roleName } from "../../i18n";
import { champName } from "../../champions";
import {
  loadAliases,
  loadChampGames,
  loadChampIndex,
  loadHubIndexQuick,
  normText,
  prettySlug,
  resolveChampSlug,
  resolveEventSlug,
  resolveLeagueSlug,
  sameChamp,
  searchAlias,
} from "../../hub/data";
import { ROLES, matchedEventLabel, matchEventIndices, patchCompare } from "../../hub/champAgg";
import { patchYear } from "../../hub/period";
import { computeDuoSynergy, ROLE_PAIRS, type DuoSynergyRow, type RolePairKey } from "../../hub/duoSynergy";
import { hubShareUrl, navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import type { ChampGamesFile } from "../../hub/types";
import { STable } from "../STable";
import { SectionCard } from "./BroadcastCard";
import { WinBar } from "./OpponentChart";
import {
  card,
  ChampLink,
  Failed,
  fmtNum,
  HubLink,
  Loading,
  OeCredit,
  Section,
  Stat,
  td,
  TeamLogo,
  th,
  useLoad,
  usePageTitle,
} from "./ui";

const sel = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text max-w-[14rem]";
const pct = (v: number) => `${fmtDec(v * 100)}%`;
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${fmtDec(v * 100)}%`;
const signedGold = (v: number) => `${v > 0 ? "+" : ""}${fmtNum(v)}`;

const VALID_PAIRS = new Set<RolePairKey>(ROLE_PAIRS.map((p) => p.key));

const pairLabel = (p: (typeof ROLE_PAIRS)[number]) =>
  p.roles[0] < 0 ? tl(p.label) : `${roleName(ROLES[p.roles[0]])} + ${roleName(ROLES[p.roles[1]])}`;

export const SynergyPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Champion synergies"));
  useDDragon();

  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const index = useLoad(loadChampIndex, []);
  const aliases = useLoad(loadAliases, []);
  const hubIndex = useLoad(loadHubIndexQuick, []);

  const leagues = index.data || [];
  const rawScope = (q.get("league") || q.get("scope") || "major").trim();
  const resolvedScope =
    !rawScope || rawScope === "major"
      ? "major"
      : aliases.data?.league[rawScope.toLowerCase()] || resolveLeagueSlug(rawScope);
  const selectedLg = resolvedScope !== "major" ? leagues.find((l) => l.u === resolvedScope) : undefined;
  const scope = selectedLg ? selectedLg.u : "major";

  const scopeYears = useMemo(() => {
    const src = selectedLg ? [selectedLg] : leagues.filter((l) => l.pr);
    const fallback = src.length ? src : leagues;
    const ys = new Set<string>();
    for (const l of fallback) for (const y of Object.keys(l.y)) if ((l.y[y] || 0) > 0) ys.add(y);
    return [...ys].sort((a, b) => Number(b) - Number(a));
  }, [leagues, selectedLg]);

  const rawPatch = (q.get("patch") || "").replace(/^p:?/i, "").trim();
  const patchYr = rawPatch && !/^y\d{4}$/i.test(rawPatch) ? patchYear(rawPatch) : "";
  const rawEv = (q.get("event") || "").trim();
  const canonEv = rawEv ? resolveEventSlug(rawEv) : "";
  const evYr = canonEv ? /(?:^|-)(20\d{2})(?:-|$)/.exec(canonEv)?.[1] || "" : "";
  const askedYear = q.get("year") || (/^y(\d{4})$/i.exec(rawPatch)?.[1] ?? "") || evYr || patchYr || "";
  const year = scopeYears.includes(askedYear) ? askedYear : scopeYears[0] || "";
  const patch = rawPatch && !/^y\d{4}$/i.test(rawPatch) ? rawPatch : "";

  const rawPair = (q.get("pair") || "all").toLowerCase() as RolePairKey;
  const pair: RolePairKey = VALID_PAIRS.has(rawPair) ? rawPair : "all";

  const rawSide = (q.get("side") || "").toLowerCase();
  const side: "" | "b" | "r" = rawSide === "b" || rawSide === "blue" ? "b" : rawSide === "r" || rawSide === "red" ? "r" : "";

  const rawChampParam = (q.get("champ") || "").trim();
  const commaParts = rawChampParam.includes(",")
    ? rawChampParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const champ = commaParts[0] || rawChampParam;
  const withChamp = (q.get("with") || q.get("vschamp") || commaParts[1] || "").trim();

  const defaultMin = selectedLg || patch || canonEv || champ ? 2 : 3;
  const minGames = Math.max(1, Number(q.get("min")) || defaultMin);

  const [showAllRows, setShowAllRows] = useState(false);

  const set = (upd: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query || "");
    if ("league" in upd || "scope" in upd) next.delete("league");
    for (const [k, v] of Object.entries(upd)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    navigateHub({ kind: "synergy", query: next.toString() }, { replace: true });
  };

  const targetLeagues = useMemo(() => {
    if (!leagues.length || !year) return [];
    if (selectedLg) return (selectedLg.y[year] || 0) > 0 ? [selectedLg] : [];
    const primary = leagues.filter((l) => l.pr && (l.y[year] || 0) > 0);
    return (primary.length ? primary : leagues.filter((l) => (l.y[year] || 0) > 0).slice(0, 8));
  }, [leagues, selectedLg, year]);

  const targetKey = targetLeagues.map((l) => `${l.u}:${year}`).join(",");

  const gamesState = useLoad<{ files: { league: string; file: ChampGamesFile }[] } | null>(
    () => {
      if (!targetLeagues.length || !year) return Promise.resolve(null);
      return Promise.all(
        targetLeagues.map((l) =>
          loadChampGames(l.u, year)
            .then((file) => ({ league: l.u, file }))
            .catch(() => null),
        ),
      ).then((arr) => ({ files: arr.filter((x): x is { league: string; file: ChampGamesFile } => !!x) }));
    },
    [targetKey],
  );

  const champsSorted = useMemo(
    () => [...(hubIndex.data?.champs || [])].sort((a, b) => champName(a[0]).localeCompare(champName(b[0]))),
    [hubIndex.data?.champs],
  );

  const findChampMatch = (typed: string) => {
    const raw = typed.trim();
    if (!raw) return "";
    const n = normText(searchAlias(raw));
    const exact = champsSorted.find(
      (r) =>
        sameChamp(r[0], raw) ||
        sameChamp(r[1] || "", raw) ||
        normText(r[0]) === n ||
        normText(champName(r[0])) === n,
    );
    if (exact) return exact[1] || prettySlug(exact[0]);
    return raw;
  };

  const champDisplay = useMemo(() => {
    if (!champ) return "";
    const hit = champsSorted.find((r) => sameChamp(r[0], champ) || sameChamp(r[1] || "", champ));
    return hit ? champName(hit[0]) : champ;
  }, [champ, champsSorted]);

  const withDisplay = useMemo(() => {
    if (!withChamp) return "";
    const hit = champsSorted.find((r) => sameChamp(r[0], withChamp) || sameChamp(r[1] || "", withChamp));
    return hit ? champName(hit[0]) : withChamp;
  }, [withChamp, champsSorted]);

  const [champInput, setChampInput] = useState(champDisplay);
  const [withInput, setWithInput] = useState(withDisplay);
  useEffect(() => setChampInput(champDisplay), [champDisplay]);
  useEffect(() => setWithInput(withDisplay), [withDisplay]);

  const loadedFiles = gamesState.data?.files || [];
  const singleEvents = selectedLg && loadedFiles.length === 1 ? loadedFiles[0].file.events : [];
  const eventMatch =
    selectedLg && loadedFiles.length === 1 && rawEv
      ? matchEventIndices(loadedFiles[0].file.events, rawEv, canonEv)
      : null;

  const patches = useMemo(() => {
    const ps = new Set<string>();
    for (const f of loadedFiles) for (const g of f.file.games) if (g[1]) ps.add(g[1]);
    return [...ps].sort(patchCompare);
  }, [loadedFiles]);

  const sources = useMemo(
    () =>
      loadedFiles.map((f) => ({
        games: f.file.games,
        event: loadedFiles.length === 1 && rawEv ? eventMatch : undefined,
      })),
    [loadedFiles, rawEv, eventMatch],
  );

  const result = useMemo(
    () =>
      computeDuoSynergy(sources, {
        patch: patch || undefined,
        side: side || undefined,
        pair,
        champ: champ || undefined,
        withChamp: withChamp || undefined,
        minGames,
      }),
    [sources, patch, side, pair, champ, withChamp, minGames],
  );

  const visibleRows = showAllRows ? result.rows.slice(0, 250) : result.rows.slice(0, 80);

  const bestLift = useMemo(
    () =>
      [...result.rows]
        .filter((r) => r.g >= Math.max(minGames, 5))
        .sort((a, b) => b.lift - a.lift || b.g - a.g)[0] || result.rows[0],
    [result.rows, minGames],
  );
  const mostPlayed = useMemo(
    () => [...result.rows].sort((a, b) => b.g - a.g || b.w - a.w)[0],
    [result.rows],
  );
  const bestLane = useMemo(
    () =>
      [...result.rows]
        .filter((r) => r.gd15 != null && r.gdGames >= 2)
        .sort((a, b) => (b.gd15 ?? -1e9) - (a.gd15 ?? -1e9))[0],
    [result.rows],
  );

  const scopeLabel = selectedLg ? selectedLg.l : tl("Top leagues");
  const evLabel =
    selectedLg && singleEvents.length && eventMatch != null
      ? matchedEventLabel(singleEvents, eventMatch, canonEv || rawEv)
      : null;
  const activePairDef = ROLE_PAIRS.find((p) => p.key === pair) || ROLE_PAIRS[0];
  const activeSub = [evLabel || scopeLabel, year, patch ? `p${patch}` : "", pair !== "all" ? pairLabel(activePairDef) : ""]
    .filter(Boolean)
    .join(" · ");

  const mainLeagues = leagues.filter((l) => l.pr);
  const otherLeagues = leagues.filter((l) => !l.pr && Object.values(l.y).reduce((s, n) => s + n, 0) >= 100);
  const hasFilters = Boolean(scope !== "major" || patch || rawEv || side || pair !== "all" || champ || withChamp || q.get("min"));

  const duoFinderUrl = (r: DuoSynergyRow) => ({
    kind: "finder" as const,
    query: new URLSearchParams({
      champ: `${resolveChampSlug(r.a)},${resolveChampSlug(r.b)}`,
      ...(selectedLg ? { league: selectedLg.u } : {}),
      ...(year ? { year } : {}),
      ...(patch ? { patch } : {}),
      ...(canonEv ? { event: canonEv } : {}),
      ...(side ? { side } : {}),
    }).toString(),
  });

  return (
    <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-rw-text">{tl("Champion synergies")}</h1>
            <p className="text-[11px] text-rw-sub mt-0.5">
              {tl(
                "Best 2v2 and role-pair champion duos in pro play: actual win rate against expected baseline, synergy delta, 15-minute lane leads, and the pro pairs who play them most.",
              )}
            </p>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => navigateHub({ kind: "synergy" }, { replace: true })}
              className="text-[11px] px-2.5 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
            >
              {tl("Reset")}
            </button>
          )}
        </div>

        {/* Role-pair filter pills */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tl("Role pairs")}>
          {ROLE_PAIRS.map((p) => {
            const on = p.key === pair;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => set({ pair: p.key === "all" ? undefined : p.key })}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                  on
                    ? "bg-rw-accent text-rw-bg font-bold border-rw-accent"
                    : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
                }`}
              >
                {pairLabel(p)}
              </button>
            );
          })}
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={scope}
            onChange={(e) => set({ scope: e.target.value === "major" ? undefined : e.target.value, event: undefined, patch: undefined })}
            aria-label={tl("League")}
            className={sel}
          >
            <option value="major">{tl("Top leagues")}</option>
            {mainLeagues.map((l) => (
              <option key={l.u} value={l.u}>
                {l.l}
              </option>
            ))}
            {otherLeagues.length > 0 && (
              <optgroup label={tl("Other leagues")}>
                {otherLeagues.map((l) => (
                  <option key={l.u} value={l.u}>
                    {l.l}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {scopeYears.length > 0 && (
            <select
              value={year}
              onChange={(e) => set({ year: e.target.value, event: undefined, patch: undefined })}
              aria-label={tl("Year")}
              className={sel}
            >
              {scopeYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          {singleEvents.length > 1 && (
            <select
              value={rawEv}
              onChange={(e) => set({ event: e.target.value || undefined })}
              aria-label={tl("Tournament")}
              className={sel}
            >
              <option value="">{tl("All tournaments")}</option>
              {singleEvents.map(([es, en]) => (
                <option key={es} value={es}>
                  {en}
                </option>
              ))}
            </select>
          )}

          {patches.length > 1 && (
            <select
              value={patch}
              onChange={(e) => set({ patch: e.target.value || undefined })}
              aria-label={tl("Patch")}
              className={sel}
            >
              <option value="">{tl("All patches")}</option>
              {patches.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}

          <select
            value={side}
            onChange={(e) => set({ side: e.target.value || undefined })}
            aria-label={tl("Side")}
            className={sel}
          >
            <option value="">{tl("Both sides")}</option>
            <option value="b">{tl("Blue side")}</option>
            <option value="r">{tl("Red side")}</option>
          </select>

          <select
            value={String(minGames)}
            onChange={(e) => set({ min: e.target.value })}
            aria-label={tl("At least")}
            className={sel}
          >
            {[2, 3, 5, 10, 20].map((n) => (
              <option key={n} value={String(n)}>
                {tl("{n}+ games", { n })}
              </option>
            ))}
          </select>

          <input
            type="search"
            list="rw-synergy-champs"
            value={champInput}
            placeholder={tl("Champion…")}
            aria-label={tl("Champion")}
            onChange={(e) => {
              const v = e.target.value;
              setChampInput(v);
              if (!v.trim()) set({ champ: undefined });
              else {
                const hit = champsSorted.find(
                  (r) => normText(r[0]) === normText(v) || normText(champName(r[0])) === normText(v),
                );
                if (hit) set({ champ: hit[1] || prettySlug(hit[0]) });
              }
            }}
            onBlur={() => {
              const next = findChampMatch(champInput);
              if (next !== champ) set({ champ: next || undefined });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") set({ champ: findChampMatch(champInput) || undefined });
            }}
            className={`${sel} w-36`}
          />

          <input
            type="search"
            list="rw-synergy-champs"
            value={withInput}
            placeholder={tl("With champion…")}
            aria-label={tl("With champion…")}
            onChange={(e) => {
              const v = e.target.value;
              setWithInput(v);
              if (!v.trim()) set({ with: undefined });
              else {
                const hit = champsSorted.find(
                  (r) => normText(r[0]) === normText(v) || normText(champName(r[0])) === normText(v),
                );
                if (hit) set({ with: hit[1] || prettySlug(hit[0]) });
              }
            }}
            onBlur={() => {
              const next = withInput.trim();
              if (next !== withChamp) set({ with: next ? findChampMatch(next) : undefined });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const next = withInput.trim();
                set({ with: next ? findChampMatch(next) : undefined });
              }
            }}
            className={`${sel} w-36`}
          />

          <datalist id="rw-synergy-champs">
            {champsSorted.map((c) => (
              <option key={c[1] || c[0]} value={champName(c[0])} />
            ))}
          </datalist>
        </div>
      </div>

      {(index.loading || gamesState.loading) && !loadedFiles.length && <Loading />}
      {(index.error || gamesState.error) && <Failed />}

      {result.rows.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-3">
          {bestLift && (
            <Stat
              label={tl("Best synergy lift")}
              value={`${champName(bestLift.a)} + ${champName(bestLift.b)}`}
              sub={`${signedPct(bestLift.lift)} · ${bestLift.w}-${bestLift.g - bestLift.w} (${bestLift.g}G)`}
              to={{
                kind: "synergy",
                query: new URLSearchParams({
                  ...(scope !== "major" ? { scope } : {}),
                  ...(year ? { year } : {}),
                  ...(patch ? { patch } : {}),
                  ...(pair !== "all" ? { pair } : {}),
                  champ: resolveChampSlug(bestLift.a),
                  with: resolveChampSlug(bestLift.b),
                }).toString(),
              }}
            />
          )}
          {mostPlayed && (
            <Stat
              label={tl("Most played duo")}
              value={`${champName(mostPlayed.a)} + ${champName(mostPlayed.b)}`}
              sub={`${pct(mostPlayed.wr)} · ${mostPlayed.g}G`}
              to={duoFinderUrl(mostPlayed)}
            />
          )}
          {bestLane ? (
            <Stat
              label={tl("Best 2v2 @15")}
              value={`${champName(bestLane.a)} + ${champName(bestLane.b)}`}
              sub={`${signedGold(bestLane.gd15!)} GD@15 · ${pct(bestLane.wr)} (${bestLane.g}G)`}
              to={duoFinderUrl(bestLane)}
            />
          ) : (
            <Stat
              label={tl("Games sampled")}
              value={fmtNum(result.totalGames)}
              sub={`${result.rows.length} duos · ${activeSub}`}
            />
          )}
        </div>
      )}

      {loadedFiles.length > 0 && (
        <Section
          title={`${tl("Pro duo table")} (${fmtNum(result.rows.length)} · ${fmtNum(result.totalGames)}G)`}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {champ && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${encodeURIComponent(resolveChampSlug(champ))}${year ? `&year=${encodeURIComponent(year)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    ...(result.rows[0] ? { champ: `${resolveChampSlug(result.rows[0].a)},${resolveChampSlug(result.rows[0].b)}` } : {}),
                    ...(selectedLg ? { league: selectedLg.u } : {}),
                    ...(canonEv ? { p: `e:${canonEv}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(selectedLg ? { scope: selectedLg.u } : {}),
                    ...(patch ? { key: `p${patch}` } : year ? { key: `y${year}` } : {}),
                    ...(result.rows[0] ? { q: `${resolveChampSlug(result.rows[0].a)},${resolveChampSlug(result.rows[0].b)}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Tier list")} →
              </HubLink>
              <CopySynergyPost rows={result.rows} sub={activeSub} query={query} />
              {result.rows.length > 0 && (
                <SectionCard
                  section={tl("Champion synergies")}
                  name={activeSub || tl("Champion synergies")}
                  sub={champ ? champDisplay : undefined}
                  rows={() =>
                    result.rows.slice(0, 12).map((r, idx) => ({
                      rank: idx + 1,
                      champ: r.a,
                      label: `${champName(r.a)} + ${champName(r.b)}`,
                      sub: `${r.g}G · ${signedPct(r.lift)}${r.gd15 != null ? ` · ${signedGold(r.gd15)} GD@15` : ""}`,
                      value: pct(r.wr),
                      win: r.wr >= 0.5,
                    }))
                  }
                />
              )}
            </span>
          }
          share="synergy-duos"
        >
          {result.rows.length === 0 ? (
            <p className="text-xs text-rw-sub">{tl("No duos meet these filters yet. Try lowering the minimum games.")}</p>
          ) : (
            <>
              <STable className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={th}>{tl("Duo")}</th>
                    <th className={th}>{tl("Games")}</th>
                    <th className={th}>{tl("Win %")}</th>
                    <th className={`${th} hidden sm:table-cell`} title={tl("Expected win rate from both champions' solo baselines on this side")}>
                      {tl("Expected")}
                    </th>
                    <th className={th} title={tl("Difference between actual duo win rate and expected win rate")}>
                      {tl("Synergy Δ")}
                    </th>
                    <th className={`${th} hidden md:table-cell`} title={tl("Combined gold lead of both champions over their lane opponents at 15 minutes (Oracle's Elixir)")}>
                      {tl("2v2 GD@15")}
                    </th>
                    <th className={`${th} hidden lg:table-cell`}>{tl("Top pro duo")}</th>
                    <th className={`${th} text-right`} data-nosort>
                      {tl("Draft")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const liftColor = r.lift >= 0.02 ? "text-rw-teal font-semibold" : r.lift <= -0.02 ? "text-rw-red" : "text-rw-sub";
                    const gdColor = r.gd15 == null ? "text-rw-muted" : r.gd15 >= 0 ? "text-rw-teal" : "text-rw-red";
                    return (
                      <tr key={`${r.a}:${r.roleA}:${r.b}:${r.roleB}`} className="border-t border-rw-border hover:bg-rw-raised/40">
                        <td className={td} data-sort={`${champName(r.a)} ${champName(r.b)}`}>
                          <div className="flex flex-wrap items-center gap-1.5 min-w-[11rem]">
                            <ChampLink name={r.a} size={20} query={year ? `year=${encodeURIComponent(year)}` : undefined} />
                            <span className="text-[10px] text-rw-muted">{roleName(ROLES[r.roleA] || "")}</span>
                            <span className="text-rw-muted">+</span>
                            <ChampLink name={r.b} size={20} query={year ? `year=${encodeURIComponent(year)}` : undefined} />
                            <span className="text-[10px] text-rw-muted">{roleName(ROLES[r.roleB] || "")}</span>
                          </div>
                        </td>
                        <td className={`${td} font-mono tabular-nums`} data-sort={r.g}>
                          <HubLink to={duoFinderUrl(r)} className="hover:text-rw-accent hover:underline" title={tl("Game finder")}>
                            {fmtNum(r.g)}
                          </HubLink>
                        </td>
                        <td className={td} data-sort={r.wr.toFixed(4)}>
                          <WinBar w={r.w} g={r.g} />
                        </td>
                        <td className={`${td} hidden sm:table-cell font-mono tabular-nums text-rw-sub`} data-sort={r.expWr.toFixed(4)}>
                          {pct(r.expWr)}
                        </td>
                        <td className={`${td} font-mono tabular-nums ${liftColor}`} data-sort={r.lift.toFixed(4)}>
                          {signedPct(r.lift)}
                        </td>
                        <td className={`${td} hidden md:table-cell font-mono tabular-nums ${gdColor}`} data-sort={r.gd15 ?? ""}>
                          {r.gd15 != null ? signedGold(r.gd15) : "–"}
                        </td>
                        <td className={`${td} hidden lg:table-cell text-rw-sub`} data-sort={r.topPair ? r.topPair.g : ""}>
                          {r.topPair ? (
                            <HubLink
                              to={{
                                kind: "finder",
                                query: new URLSearchParams({
                                  champ: `${resolveChampSlug(r.a)},${resolveChampSlug(r.b)}`,
                                  player: r.topPair.slugs[0] || r.topPair.players[0],
                                  ...(r.topPair.teamSlug ? { team: r.topPair.teamSlug } : {}),
                                  ...(year ? { year } : {}),
                                }).toString(),
                              }}
                              className="inline-flex items-center gap-1.5 hover:text-rw-accent hover:underline max-w-[14rem] truncate"
                            >
                              {r.topPair.team && <TeamLogo name={r.topPair.team} size={14} />}
                              <span className="truncate">
                                {r.topPair.players[0]} + {r.topPair.players[1]}
                              </span>
                              <span className="text-[10px] text-rw-muted font-mono">({r.topPair.g}G)</span>
                            </HubLink>
                          ) : (
                            "–"
                          )}
                        </td>
                        <td className={`${td} text-right`}>
                          <HubLink
                            to={{
                              kind: "draft",
                              query: new URLSearchParams({
                                champ: `${resolveChampSlug(r.a)},${resolveChampSlug(r.b)}`,
                                ...(selectedLg ? { league: selectedLg.u } : {}),
                                ...(canonEv ? { p: `e:${canonEv}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                              }).toString(),
                            }}
                            className="text-[11px] text-rw-accent hover:underline whitespace-nowrap"
                          >
                            {tl("Draft")} →
                          </HubLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </STable>
              {result.rows.length > 80 && !showAllRows && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAllRows(true)}
                    className="text-xs px-3 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
                  >
                    {tl("Show all {n} duos", { n: Math.min(250, result.rows.length) })}
                  </button>
                </div>
              )}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-rw-muted">
                <span>
                  {tl("Synergy Δ compares actual duo win rate against each champion's solo win rate on that side.")}
                </span>
                <OeCredit />
              </div>
            </>
          )}
        </Section>
      )}
    </div>
  );
};

const CopySynergyPost: React.FC<{ rows: DuoSynergyRow[]; sub: string; query?: string }> = ({ rows, sub, query }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  if (!rows.length) return null;
  const copy = () => {
    const lines = [
      `${tl("Champion synergies")} · ${sub}`,
      ...rows
        .slice(0, 5)
        .map(
          (r, i) =>
            `${i + 1}. ${champName(r.a)} + ${champName(r.b)}: ${pct(r.wr)} (${r.w}-${r.g - r.w}, ${signedPct(r.lift)})${r.gd15 != null ? `, ${signedGold(r.gd15)} GD@15` : ""}`,
        ),
      hubShareUrl({ kind: "synergy", ...(query ? { query } : {}) }),
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
