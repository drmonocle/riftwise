/**
 * Best games: every pro game since 2011 rated 0-100 (MEPI, the catalog's game rating: action and pace, how close it
 * was, length, what was at stake, series drama, comebacks, rivalries), as a ranked list of games or of series,
 * all time or by year and league. Every row opens the match page at that game.
 * Address: /stats/best?view=series&year=2025&league=lol-champions-korea
 */
import React, { useEffect, useMemo, useState } from "react";
import { PlayCircle } from "lucide-react";
import { tl, tn, tc, stageLabel, fmtDec } from "../../i18n";
import { bare, loadAliases, loadBest, loadBestIndex, normText, prettySlug, resolveEventSlug, resolveLeagueSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
import { matchesPeriodEvent } from "../../hub/period";
import type { BestGame, BestSeries } from "../../hub/types";
import { hubShareUrl, navigateHub } from "../../hub/route";
import { card, EventLink, Failed, fmtDate, HubLink, isFresh, Loading, RatingBadge, ratingTextClass, ratingTier, RevealButton, TeamLink, TeamLogo, th, useHidden, useLoad, usePageTitle } from "./ui";
import { STable } from "../STable";
import { SectionCard } from "./BroadcastCard";

export { ratingTier, ratingTextClass, RatingBadge };
const TIERS = ["S", "A", "B", "C", "D"] as const;
const TIER_FLOOR: Record<string, number> = { S: 90, A: 80, B: 70, C: 55, D: 0 };

const sel = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text max-w-full";
const tabBtn = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-semibold border ${on ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`;

export const BestPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Best games"));
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const view = q.get("view") === "series" ? "series" : "games";
  const index = useLoad(loadBestIndex, []);
  const aliases = useLoad(loadAliases, []);
  // ?league=lck / worlds work too: a short name (index) or a league alias
  const asked = (q.get("league") || "").toLowerCase();
  const canonAsked = resolveLeagueSlug(asked);
  const league = !asked
    ? ""
    : index.data?.leagues.find((l) => l[0] === asked || l[0] === canonAsked)?.[0] ||
      index.data?.leagues.find((l) => (l[2] || "").toLowerCase() === asked)?.[0] ||
      aliases.data?.league[asked] ||
      canonAsked;
  const lgRow = index.data?.leagues.find((l) => l[0] === league);
  const years = (lgRow ? lgRow[4] : index.data?.years) || [];
  const rawEvent = q.get("event") ? resolveEventSlug(q.get("event")!) : "";
  const evYr = /(?:^|-)(20\d{2})(?:-|$)/.exec(rawEvent)?.[1] || "";
  const rawYear = q.get("year") || evYr;
  const year = rawYear && years.includes(rawYear) ? rawYear : "";
  const file = useLoad(
    () => (asked && !index.data && !index.error ? Promise.resolve({ g: [], s: [] }) : loadBest(year || undefined, lgRow ? lgRow[0] : undefined)),
    [year, lgRow?.[0] || "", Boolean(index.data), Boolean(index.error), asked],
  );
  // filters on the list itself (also synced to the address): tiers, games with a VOD, a team
  const urlTiers = q.get("tier") || "";
  const urlVod = q.get("vod") === "1";
  const urlTeam =
    q.get("team") && q.get("vs") && !/\s+vs\.?\s+|\s+v\s+/i.test(q.get("team")!)
      ? `${q.get("team")} vs ${q.get("vs")}`
      : q.get("team") || q.get("q") || q.get("vs") || rawEvent || "";
  const [tiers, setTiers] = useState<Set<string>>(() => new Set(urlTiers.split(",").filter(Boolean)));
  const [vodOnly, setVodOnly] = useState(urlVod);
  const [team, setTeam] = useState(urlTeam);
  useEffect(() => {
    setTiers(new Set(urlTiers.split(",").filter(Boolean)));
  }, [urlTiers]);
  useEffect(() => {
    setVodOnly(urlVod);
  }, [urlVod]);
  useEffect(() => {
    setTeam(urlTeam);
  }, [urlTeam]);

  const setQ = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    navigateHub({ kind: "best", query: next.toString() }, { replace: true });
  };

  const main = index.data?.leagues.filter((l) => l[3]) || [];
  const other = index.data?.leagues.filter((l) => !l[3]) || [];
  const rows: (BestGame | BestSeries)[] = (view === "series" ? file.data?.s : file.data?.g) || [];
  const seriesWithVod = useMemo(() => {
    const s = new Set<string>();
    for (const g of file.data?.g || []) if (g[15]) s.add(g[1]);
    return s;
  }, [file.data]);
  const dateOf = (r: BestGame | BestSeries) => (view === "series" ? (r as BestSeries)[2] : (r as BestGame)[3]);
  // spoiler mode: games of the last days stay off the list (their rating says how close they were) until Reveal
  const latestDate = useMemo(() => {
    let m = "";
    for (const r of rows) {
      const d = dateOf(r);
      if (d > m) m = d;
    }
    return m || undefined;
  }, [rows, view]);
  const [spoilerHidden, reveal] = useHidden("best", latestDate);
  const rawTeam = team.trim();
  const isVsQuery = /\s+vs\.?\s+|\s+v\s+/i.test(rawTeam);
  const teamSlug = (n: string) => resolveTeamAlias(n, aliases.data?.team) || prettySlug(n);
  const teamTerms = useMemo(() => {
    if (!rawTeam) return [];
    const parts = isVsQuery ? rawTeam.split(/\s+vs\.?\s+|\s+v\s+/i) : rawTeam.split(/[,|]+/);
    return parts
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const alias = searchAlias(s);
        return {
          norm: normText(s),
          alias,
          aliasSlug:
            resolveTeamAlias(s, aliases.data?.team) ||
            (alias ? resolveTeamAlias(alias, aliases.data?.team) : undefined),
        };
      });
  }, [rawTeam, isVsQuery, aliases.data]);
  const shown = rows.filter((r) => {
    if (spoilerHidden && isFresh(dateOf(r))) return false;
    if (tiers.size && !tiers.has(ratingTier(r[0]))) return false;
    if (vodOnly && (view === "games" ? !(r as BestGame)[15] : !seriesWithVod.has(r[1]))) return false;
    const [a, aSlug, b, bSlug, en, eSlug] =
      view === "series"
        ? [(r as BestSeries)[6], (r as BestSeries)[7], (r as BestSeries)[8], (r as BestSeries)[9], (r as BestSeries)[3], (r as BestSeries)[4]]
        : [(r as BestGame)[7], (r as BestGame)[8], (r as BestGame)[9], (r as BestGame)[10], (r as BestGame)[4], (r as BestGame)[5]];
    if (rawEvent && !matchesPeriodEvent(eSlug || "", en || "", normText(rawEvent))) return false;
    if (teamTerms.length) {
      const aCanon = aSlug || resolveTeamAlias(a, aliases.data?.team);
      const bCanon = bSlug || resolveTeamAlias(b, aliases.data?.team);
      const matchesTerm = (term: { norm: string; alias?: string | null; aliasSlug?: string }) => {
        const bTerm = bare(term.norm);
        const bAlias = term.alias ? bare(term.alias) : "";
        const matchName =
          normText(a).includes(term.norm) ||
          normText(b).includes(term.norm) ||
          normText(en || "").includes(term.norm) ||
          (term.alias && (normText(a).includes(term.alias) || normText(b).includes(term.alias) || normText(en || "").includes(term.alias))) ||
          (bTerm.length >= 2 && (bare(a).includes(bTerm) || bare(b).includes(bTerm))) ||
          (bAlias.length >= 2 && (bare(a).includes(bAlias) || bare(b).includes(bAlias)));
        const matchSlug =
          Boolean(term.aliasSlug && (aCanon === term.aliasSlug || bCanon === term.aliasSlug)) ||
          (aSlug && (normText(aSlug).includes(term.norm) || (bTerm.length >= 2 && bare(aSlug).includes(bTerm)))) ||
          (bSlug && (normText(bSlug).includes(term.norm) || (bTerm.length >= 2 && bare(bSlug).includes(bTerm))));
        const matchEvent =
          matchesPeriodEvent(eSlug || "", en || "", term.norm) ||
          Boolean(term.alias && matchesPeriodEvent(eSlug || "", en || "", term.alias));
        return Boolean(matchName || matchSlug || matchEvent);
      };
      if (isVsQuery && teamTerms.length >= 2) {
        if (!teamTerms.every(matchesTerm)) return false;
      } else {
        if (!teamTerms.some(matchesTerm)) return false;
      }
    }
    return true;
  });
  const held = spoilerHidden ? rows.filter((r) => isFresh(dateOf(r))).length : 0;
  const toggleTier = (t: string) =>
    setTiers((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      setQ({ tier: [...next].join(",") || undefined });
      return next;
    });

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-rw-text">{tl("Best games")}</h1>
          {shown.length > 0 && (
            <span className="flex flex-wrap items-center gap-2 text-xs" data-nocapture="1">
              {(() => {
                const r0 = shown[0];
                const a =
                  view === "series"
                    ? (r0 as BestSeries)[7] || teamSlug((r0 as BestSeries)[6])
                    : (r0 as BestGame)[8] || teamSlug((r0 as BestGame)[7]);
                const b =
                  view === "series"
                    ? (r0 as BestSeries)[9] || teamSlug((r0 as BestSeries)[8])
                    : (r0 as BestGame)[10] || teamSlug((r0 as BestGame)[9]);
                const eslug = view === "series" ? (r0 as BestSeries)[4] : (r0 as BestGame)[5];
                const canonEv = eslug ? resolveEventSlug(eslug) : "";
                const dt = view === "series" ? (r0 as BestSeries)[2] : (r0 as BestGame)[3];
                const r0Year = year || (dt && /^\d{4}/.test(dt) ? dt.slice(0, 4) : "");
                const p = canonEv ? `e:${canonEv}` : r0Year ? `y${r0Year}` : undefined;
                return (
                  <>
                    <HubLink
                      to={{ kind: "prep", a, b, period: p }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "draft", query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}${p ? `&p=${encodeURIComponent(p)}` : ""}` }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "compare", mode: "team", a, b, period: p }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        query: new URLSearchParams({
                          ...(league ? { league } : {}),
                          ...(a && b ? { q: `${a},${b}` } : a ? { q: a } : {}),
                        }).toString() || undefined,
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "champions",
                        query: new URLSearchParams({
                          ...(league ? { scope: league, league } : {}),
                          ...(canonEv && teamTerms.length > 0 ? { event: canonEv } : {}),
                          ...(r0Year ? { key: `y${r0Year}`, year: r0Year } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Champions")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          ...(league ? { scope: league, league } : {}),
                          ...(canonEv && teamTerms.length > 0 ? { event: canonEv } : {}),
                          ...(r0Year ? { key: `y${r0Year}`, year: r0Year } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(league ? { league } : {}),
                          ...(canonEv && teamTerms.length > 0 ? { event: canonEv } : {}),
                          ...(r0Year ? { year: r0Year } : {}),
                          ...(a && b ? { q: `${a},${b}` } : a ? { q: a } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: new URLSearchParams({
                          ...(a ? { team: a } : {}),
                          ...(b ? { vs: b } : {}),
                          ...(canonEv && teamTerms.length > 0 ? { event: canonEv } : {}),
                          ...(r0Year ? { year: r0Year } : {}),
                          ...(league ? { league } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: new URLSearchParams({
                          team: a,
                          vs: b,
                          ...(canonEv && teamTerms.length > 0 ? { event: canonEv } : r0Year ? { year: r0Year } : {}),
                          ...(league ? { league } : {}),
                        }).toString(),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "records",
                        query: new URLSearchParams({
                          ...(year ? { year } : {}),
                          ...(rawTeam ? { q: rawTeam } : a ? { q: b ? `${a},${b}` : a } : {}),
                        }).toString() || undefined,
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Records")} →
                    </HubLink>
                  </>
                );
              })()}
              <SectionCard
                section={view === "series" ? `${tl("Best games")} · ${tl("Series")}` : tl("Best games")}
                name={[lgRow ? lgRow[2] || lgRow[1] : tl("All leagues"), year || tl("All time")].filter(Boolean).join(" · ")}
                rows={() =>
                  shown.slice(0, 10).map((r, i) => {
                    if (view === "series") {
                      const [rating, , date, en, , stage, a, , b, , wa, wb] = r as BestSeries;
                      return {
                        rank: i + 1,
                        team: wa >= wb ? a : b,
                        label: `${a} ${wa}–${wb} ${b}`,
                        sub: [en, stage && stageLabel(stage), fmtDate(date)].filter(Boolean).join(" · "),
                        value: `${fmtDec(rating)} (${ratingTier(rating)})`,
                        win: true,
                      };
                    }
                    const [rating, , n, date, en, , stage, a, , b, , w, min] = r as BestGame;
                    return {
                      rank: i + 1,
                      team: w === 2 ? b : a,
                      label: `${a} vs ${b} (${tl("Game {n}", { n })})`,
                      sub: [en, stage && stageLabel(stage), min ? `${Math.round(min)}m` : null, fmtDate(date)].filter(Boolean).join(" · "),
                      value: `${fmtDec(rating)} (${ratingTier(rating)})`,
                      win: true,
                    };
                  })
                }
              />
              <CopyBestPost
                title={[view === "series" ? `${tl("Best games")} · ${tl("Series")}` : tl("Best games"), lgRow ? lgRow[2] || lgRow[1] : tl("All leagues"), year || tl("All time")]
                  .filter(Boolean)
                  .join(" · ")}
                view={view}
                rows={shown}
                query={q.toString()}
              />
            </span>
          )}
        </div>
        <p className="text-[11px] text-rw-sub mt-1 leading-relaxed">
          {tl(
            "Every pro game since 2011 rated from 0 to 100: action and pace, how close it was, its length, what was at stake (a Worlds final counts most), the series drama (a deciding game 5), comebacks and rivalries.",
          )} {tl("A series counts its best game most, then its best three games and all of them; a 3-2 gets a little more, a sweep a little less.")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex gap-1.5" role="tablist">
            <button type="button" role="tab" aria-selected={view === "games"} className={tabBtn(view === "games")} onClick={() => setQ({ view: undefined })}>
              {tl("Games")}
            </button>
            <button type="button" role="tab" aria-selected={view === "series"} className={tabBtn(view === "series")} onClick={() => setQ({ view: "series" })}>
              {tl("Series")}
            </button>
          </div>
          <select value={year} onChange={(e) => setQ({ year: e.target.value })} aria-label={tl("Year")} className={sel}>
            <option value="">{tl("All time")}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select value={league} onChange={(e) => setQ({ league: e.target.value })} aria-label={tl("Leagues")} className={sel}>
            <option value="">{tl("All leagues")}</option>
            {main.length > 0 && (
              <optgroup label={tl("Main leagues")}>
                {main.map((l) => (
                  <option key={l[0]} value={l[0]}>
                    {l[2] && l[2] !== l[1] ? `${l[2]} · ${l[1]}` : l[1]}
                  </option>
                ))}
              </optgroup>
            )}
            {other.length > 0 && (
              <optgroup label={tl("Other leagues")}>
                {other.map((l) => (
                  <option key={l[0]} value={l[0]}>
                    {l[2] && l[2] !== l[1] ? `${l[2]} · ${l[1]}` : l[1]}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="mt-2 text-[10px] text-rw-muted flex flex-wrap gap-x-2 gap-y-1.5 items-center">
          <span>{tl("Tiers:")}</span>
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tiers.has(t)}
              onClick={() => toggleTier(t)}
              title={tl("Show only this tier (click again to clear)")}
              className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 ${tiers.has(t) ? "ring-2 ring-rw-accent" : tiers.size ? "opacity-50 hover:opacity-100" : ""}`}
            >
              <RatingBadge r={TIER_FLOOR[t] + 5} className="!py-0" />
              <span>{t === "D" ? tl("below 55") : `${TIER_FLOOR[t]}+`}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="search"
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setQ({ team: e.target.value || undefined, q: undefined, vs: undefined, event: undefined });
            }}
            placeholder={tl("Filter by team")}
            aria-label={tl("Filter by team")}
            className={`${sel} w-40`}
          />
          <label className="flex items-center gap-1 text-rw-sub cursor-pointer">
            <input
              type="checkbox"
              checked={vodOnly}
              onChange={(e) => {
                setVodOnly(e.target.checked);
                setQ({ vod: e.target.checked ? "1" : undefined });
              }}
            />
            {tl("Only games with a VOD")}
          </label>
          {(isVsQuery || teamTerms.length >= 1) && shown.length > 0 && (() => {
            const first = shown[0];
            const [aName, aSlug, bName, bSlug, fEslug, fDate] =
              view === "series"
                ? [(first as BestSeries)[6], (first as BestSeries)[7], (first as BestSeries)[8], (first as BestSeries)[9], (first as BestSeries)[4], (first as BestSeries)[2]]
                : [(first as BestGame)[7], (first as BestGame)[8], (first as BestGame)[9], (first as BestGame)[10], (first as BestGame)[5], (first as BestGame)[3]];
            const sa = aSlug || teamSlug(aName);
            const sb = bSlug || teamSlug(bName);
            if (!sa || !sb || sa === sb) return null;
            const fEv = fEslug ? resolveEventSlug(fEslug) : "";
            const fYr = year || (fDate && /^\d{4}/.test(fDate) ? fDate.slice(0, 4) : "");
            const fPeriod = fEv ? `e:${fEv}` : fYr ? `y${fYr}` : undefined;
            return (
              <span className="inline-flex flex-wrap items-center gap-2 ml-auto">
                <HubLink
                  to={{ kind: "prep", a: sa, b: sb, period: fPeriod }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{ kind: "draft", query: `teams=${encodeURIComponent(sa)},${encodeURIComponent(sb)}${fPeriod ? `&p=${encodeURIComponent(fPeriod)}` : ""}` }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: sa, b: sb, period: fPeriod }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      team: sa,
                      vs: sb,
                      ...(fEv ? { event: fEv } : {}),
                      ...(fYr ? { year: fYr } : {}),
                      ...(league ? { league } : {}),
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `team=${encodeURIComponent(sa)}&vs=${encodeURIComponent(sb)}${fEv ? `&event=${encodeURIComponent(fEv)}` : fYr ? `&year=${encodeURIComponent(fYr)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query: new URLSearchParams({
                      ...(league ? { league } : {}),
                      q: `${sa},${sb}`,
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query: new URLSearchParams({
                      ...(league ? { scope: league, league } : {}),
                      ...(fEv ? { event: fEv } : {}),
                      ...(fYr ? { key: `y${fYr}`, year: fYr } : {}),
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(league ? { league } : {}),
                      ...(fEv ? { event: fEv } : {}),
                      ...(fYr ? { year: fYr } : {}),
                      q: `${sa},${sb}`,
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </span>
            );
          })()}
        </div>
      </div>

      <div className={card}>
        {file.loading || index.loading ? (
          <Loading />
        ) : file.error ? (
          <Failed />
        ) : shown.length === 0 ? (
          <p className="text-xs text-rw-muted">{tl("No rated games here yet.")}</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <STable className="w-full text-xs">
              <thead>
                <tr>
                  <th className={`${th} w-8 text-right`}>#</th>
                  <th className={`${th} w-16`}>{tl("Rating")}</th>
                  <th className={th}>{tl("Match")}</th>
                  <th className={`${th} hidden sm:table-cell`}>{tl("Tournament")}</th>
                  <th className={`${th} text-right hidden sm:table-cell`}>{tl("Date")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) =>
                  view === "series" ? (
                    <SeriesRow key={r[1]} r={r as BestSeries} rank={i + 1} league={league || undefined} />
                  ) : (
                    <GameRow key={`${r[1]}-${r[2]}`} r={r as BestGame} rank={i + 1} league={league || undefined} />
                  ),
                )}
              </tbody>
            </STable>
          </div>
        )}
        {held > 0 && (
          <p className="mt-2 text-[10px] text-rw-muted flex flex-wrap items-center gap-2">
            {tn("{n} recent game is left out while spoiler mode is on.", "{n} recent games are left out while spoiler mode is on.", held)}
            <RevealButton onReveal={reveal} small />
          </p>
        )}
      </div>
    </div>
  );
};

const Team: React.FC<{ name: string; u?: string | null; won: boolean; period?: string }> = ({ name, u, won, period }) => (
  <span className={`inline-flex items-center gap-1 ${won ? "font-bold text-rw-teal" : "text-rw-text"}`}>
    <HubLink to={{ kind: "team", slug: u || resolveTeamAlias(name) || prettySlug(name), ...(period ? { query: `p=${encodeURIComponent(period)}` } : {}) }} title={name} className="shrink-0">
      <TeamLogo name={name} size={15} />
    </HubLink>
    <TeamLink name={name} u={u} className={won ? "font-bold text-rw-teal hover:underline" : "text-rw-text hover:text-rw-accent hover:underline"} />
  </span>
);

const GameRow: React.FC<{ r: BestGame; rank: number; league?: string }> = ({ r, rank, league }) => {
  const [rating, slug, n, date, en, eslug, stage, a, aSlug, b, bSlug, w, min, ka, kb, vod] = r;
  const totalK = ka != null && kb != null ? ka + kb : 0;
  const pctKa = totalK > 0 && ka != null ? Math.round((ka / totalK) * 100) : 50;
  const y = (date || "").slice(0, 4);
  const canonEslug = eslug ? resolveEventSlug(eslug) : "";
  const period = canonEslug ? `e:${canonEslug}` : /^\d{4}$/.test(y) ? `y${y}` : undefined;
  const sa = aSlug || (a ? resolveTeamAlias(a) || prettySlug(a) : "");
  const sb = bSlug || (b ? resolveTeamAlias(b) || prettySlug(b) : "");
  return (
    <tr className="border-t border-rw-border/60 first:border-t-0 hover:bg-rw-raised/50">
      <td className="py-2 pr-2 text-rw-muted tabular-nums w-8 text-right" data-sort={rank}>
        <HubLink to={{ kind: "match", slug, game: n }} className="hover:text-rw-accent hover:underline">
          {rank}
        </HubLink>
      </td>
      <td className="py-2 pr-3 w-16" data-sort={rating}>
        <HubLink to={{ kind: "match", slug, game: n }} className="inline-block">
          <RatingBadge r={rating} />
        </HubLink>
      </td>
      <td className="py-2 pr-3 sm:min-w-[12rem]" data-sort={min || 0}>
        <div className="inline-flex flex-wrap items-center gap-x-1.5">
          <Team name={a} u={aSlug} won={w === 1} period={period} />
          <HubLink
            to={
              sa && sb
                ? { kind: "compare", mode: "team", a: sa, b: sb, period }
                : { kind: "match", slug, game: n }
            }
            className="text-rw-muted hover:text-rw-accent hover:underline"
            title={tl("Compare")}
          >
            vs
          </HubLink>
          <Team name={b} u={bSlug} won={w === 2} period={period} />
          <HubLink to={{ kind: "match", slug, game: n }} className="text-rw-sub hover:text-rw-accent hover:underline">
            · {tl("Game {n}", { n })}
          </HubLink>
        </div>
        <div className="text-[10px] text-rw-muted mt-0.5 sm:hidden">
          <EventLink name={en} u={eslug} className="hover:text-rw-accent hover:underline" />
          {stage ? (
            <>
              {" · "}
              {eslug ? <EventLink name={stageLabel(stage)} u={eslug} className="hover:text-rw-accent hover:underline" /> : stageLabel(stage)}
            </>
          ) : null}{" "}
          ·{" "}
          <HubLink to={{ kind: "match", slug, game: n }} className="hover:text-rw-accent hover:underline">
            {fmtDate(date)}
          </HubLink>
        </div>
        <div className="text-[10px] text-rw-muted mt-0.5 flex flex-wrap items-center gap-x-2">
          {ka != null && kb != null && (
            <HubLink to={{ kind: "match", slug, game: n }} className="inline-flex items-center gap-1.5 tabular-nums hover:text-rw-accent hover:underline">
              <span>{tl("{a}–{b} kills", { a: ka, b: kb })}</span>
              {totalK > 0 && (
                <span className="w-12 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                  <span className={`h-full ${w === 1 ? "bg-rw-teal/85" : "bg-rw-sub/65"}`} style={{ width: `${pctKa}%` }} />
                  <span className={`h-full ${w === 2 ? "bg-rw-teal/85" : "bg-rw-sub/65"}`} style={{ width: `${100 - pctKa}%` }} />
                </span>
              )}
            </HubLink>
          )}
          {min ? (
            <HubLink to={{ kind: "match", slug, game: n }} className="tabular-nums hover:text-rw-accent hover:underline">
              {tl("{n} min", { n: Math.round(min) })}
            </HubLink>
          ) : null}
          {vod ? (
            <HubLink
              to={{ kind: "match", slug, game: n }}
              className="inline-flex items-center gap-0.5 text-rw-accent hover:underline"
              title={tl("Open the game: its VOD links are on the match page")}
            >
              <PlayCircle className="w-3 h-3" /> {tl("VOD")}
            </HubLink>
          ) : null}
          {sa && sb && (
            <>
              <HubLink to={{ kind: "prep", a: sa, b: sb, period }} className="hover:text-rw-accent hover:underline">
                {tl("Match prep")}
              </HubLink>
              <HubLink
                to={{ kind: "draft", query: `teams=${encodeURIComponent(sa)},${encodeURIComponent(sb)}${period ? `&p=${encodeURIComponent(period)}` : ""}` }}
                className="hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink to={{ kind: "compare", mode: "team", a: sa, b: sb, period }} className="hover:text-rw-accent hover:underline">
                {tl("Compare")}
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: `team=${encodeURIComponent(sa)}&vs=${encodeURIComponent(sb)}${canonEslug ? `&event=${encodeURIComponent(canonEslug)}` : ""}${/^\d{4}$/.test(y) ? `&year=${encodeURIComponent(y)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {tl("Item history")}
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `team=${encodeURIComponent(sa)}&vs=${encodeURIComponent(sb)}${canonEslug ? `&event=${encodeURIComponent(canonEslug)}` : /^\d{4}$/.test(y) ? `&year=${encodeURIComponent(y)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {tl("Game finder")}
              </HubLink>
            </>
          )}
        </div>
      </td>
      <td className="py-2 pr-3 min-w-[10rem] hidden sm:table-cell" data-sort={en}>
        <EventLink name={en} u={eslug} className="text-rw-sub hover:text-rw-accent hover:underline" />
        {stage && (
          <div className="text-[10px] text-rw-muted">
            {eslug ? <EventLink name={stageLabel(stage)} u={eslug} className="hover:text-rw-accent hover:underline" /> : stageLabel(stage)}
          </div>
        )}
      </td>
      <td className="py-2 pr-1 text-rw-muted whitespace-nowrap text-right hidden sm:table-cell" data-sort={date}>
        <HubLink to={{ kind: "match", slug, game: n }} className="hover:text-rw-accent hover:underline">
          {fmtDate(date)}
        </HubLink>
      </td>
    </tr>
  );
};

const SeriesRow: React.FC<{ r: BestSeries; rank: number; league?: string }> = ({ r, rank, league }) => {
  const [rating, slug, date, en, eslug, stage, a, aSlug, b, bSlug, wa, wb, bestN, games, , perGame] = r;
  const totalS = wa + wb;
  const pctWa = totalS > 0 ? Math.round((wa / totalS) * 100) : 50;
  const y = (date || "").slice(0, 4);
  const canonEslug = eslug ? resolveEventSlug(eslug) : "";
  const period = canonEslug ? `e:${canonEslug}` : /^\d{4}$/.test(y) ? `y${y}` : undefined;
  const sa = aSlug || (a ? resolveTeamAlias(a) || prettySlug(a) : "");
  const sb = bSlug || (b ? resolveTeamAlias(b) || prettySlug(b) : "");
  return (
    <tr className="border-t border-rw-border/60 first:border-t-0 hover:bg-rw-raised/50">
      <td className="py-2 pr-2 text-rw-muted tabular-nums w-8 text-right" data-sort={rank}>
        <HubLink to={{ kind: "match", slug }} className="hover:text-rw-accent hover:underline">
          {rank}
        </HubLink>
      </td>
      <td className="py-2 pr-3 w-16" data-sort={rating}>
        <HubLink to={{ kind: "match", slug }} className="inline-block">
          <RatingBadge r={rating} />
        </HubLink>
      </td>
      <td className="py-2 pr-3 sm:min-w-[12rem]" data-sort={games || totalS}>
        <div className="inline-flex flex-wrap items-center gap-x-1.5">
          <Team name={a} u={aSlug} won={wa > wb} period={period} />
          <HubLink to={{ kind: "match", slug }} className="inline-flex items-center gap-1 tabular-nums text-rw-text hover:text-rw-accent hover:underline font-semibold">
            <span>{wa}–{wb}</span>
            {totalS > 0 && (
              <span className="w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                <span className={`h-full ${wa > wb ? "bg-rw-teal/85" : "bg-rw-sub/65"}`} style={{ width: `${pctWa}%` }} />
                <span className={`h-full ${wb > wa ? "bg-rw-teal/85" : "bg-rw-sub/65"}`} style={{ width: `${100 - pctWa}%` }} />
              </span>
            )}
          </HubLink>
          <Team name={b} u={bSlug} won={wb > wa} period={period} />
        </div>
        <div className="text-[10px] text-rw-muted mt-0.5 sm:hidden">
          <EventLink name={en} u={eslug} className="hover:text-rw-accent hover:underline" />
          {stage ? (
            <>
              {" · "}
              {eslug ? <EventLink name={stageLabel(stage)} u={eslug} className="hover:text-rw-accent hover:underline" /> : stageLabel(stage)}
            </>
          ) : null}{" "}
          ·{" "}
          <HubLink to={{ kind: "match", slug }} className="hover:text-rw-accent hover:underline">
            {fmtDate(date)}
          </HubLink>
        </div>
        {perGame && perGame.length > 1 ? (
          // every game's rating: G1 89 · G2 91 · G3 97 (each opens that game; the best one is outlined)
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {perGame.map((v, i) => (
              <HubLink
                key={i}
                to={{ kind: "match", slug, game: i + 1 }}
                className={`px-1.5 py-0.5 rounded border text-[10px] tabular-nums hover:bg-rw-raised ${
                  i + 1 === bestN ? "border-rw-accent" : "border-rw-border"
                }`}
                title={tl("Game {n}", { n: i + 1 })}
              >
                <span className="text-rw-muted">{tc("short game", "G{n}", { n: i + 1 })}</span>{" "}
                <span className={`font-semibold ${v != null ? ratingTextClass(v) : "text-rw-muted"}`}>{v != null ? v : "–"}</span>
              </HubLink>
            ))}
            {sa && sb && (
              <span className="text-[10px] text-rw-muted inline-flex items-center gap-1.5 ml-1">
                <HubLink to={{ kind: "prep", a: sa, b: sb, period }} className="hover:text-rw-accent hover:underline">
                  {tl("Match prep")}
                </HubLink>
                <span>·</span>
                <HubLink
                  to={{ kind: "draft", query: `teams=${encodeURIComponent(sa)},${encodeURIComponent(sb)}${period ? `&p=${encodeURIComponent(period)}` : ""}` }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")}
                </HubLink>
                <span>·</span>
                <HubLink to={{ kind: "compare", mode: "team", a: sa, b: sb, period }} className="hover:text-rw-accent hover:underline">
                  {tl("Compare")}
                </HubLink>
                <span>·</span>
                <HubLink
                  to={{
                    kind: "items",
                    query: `team=${encodeURIComponent(sa)}&vs=${encodeURIComponent(sb)}${canonEslug ? `&event=${encodeURIComponent(canonEslug)}` : ""}${/^\d{4}$/.test(y) ? `&year=${encodeURIComponent(y)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")}
                </HubLink>
                <span>·</span>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `team=${encodeURIComponent(sa)}&vs=${encodeURIComponent(sb)}${canonEslug ? `&event=${encodeURIComponent(canonEslug)}` : /^\d{4}$/.test(y) ? `&year=${encodeURIComponent(y)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")}
                </HubLink>
              </span>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-rw-muted mt-0.5 flex flex-wrap items-center gap-x-1.5">
            <HubLink to={{ kind: "match", slug }} className="hover:underline hover:text-rw-accent">
              {tn("{n} game", "{n} games", games)}
            </HubLink>
            <span>·</span>
            <HubLink to={{ kind: "match", slug, game: bestN }} className="hover:underline hover:text-rw-accent">
              {tl("best: game {n}", { n: bestN })}
            </HubLink>
            {sa && sb && (
              <>
                <span>·</span>
                <HubLink to={{ kind: "prep", a: sa, b: sb, period }} className="hover:text-rw-accent hover:underline">
                  {tl("Match prep")}
                </HubLink>
                <span>·</span>
                <HubLink
                  to={{ kind: "draft", query: `teams=${encodeURIComponent(sa)},${encodeURIComponent(sb)}${period ? `&p=${encodeURIComponent(period)}` : ""}` }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")}
                </HubLink>
                <span>·</span>
                <HubLink to={{ kind: "compare", mode: "team", a: sa, b: sb, period }} className="hover:text-rw-accent hover:underline">
                  {tl("Compare")}
                </HubLink>
                <span>·</span>
                <HubLink
                  to={{
                    kind: "items",
                    query: `team=${encodeURIComponent(sa)}&vs=${encodeURIComponent(sb)}${canonEslug ? `&event=${encodeURIComponent(canonEslug)}` : ""}${/^\d{4}$/.test(y) ? `&year=${encodeURIComponent(y)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")}
                </HubLink>
                <span>·</span>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `team=${encodeURIComponent(sa)}&vs=${encodeURIComponent(sb)}${canonEslug ? `&event=${encodeURIComponent(canonEslug)}` : /^\d{4}$/.test(y) ? `&year=${encodeURIComponent(y)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")}
                </HubLink>
              </>
            )}
          </div>
        )}
      </td>
      <td className="py-2 pr-3 min-w-[10rem] hidden sm:table-cell" data-sort={en}>
        <EventLink name={en} u={eslug} className="text-rw-sub hover:text-rw-accent hover:underline" />
        {stage && (
          <div className="text-[10px] text-rw-muted">
            {eslug ? <EventLink name={stageLabel(stage)} u={eslug} className="hover:text-rw-accent hover:underline" /> : stageLabel(stage)}
          </div>
        )}
      </td>
      <td className="py-2 pr-1 text-rw-muted whitespace-nowrap text-right hidden sm:table-cell" data-sort={date}>
        <HubLink to={{ kind: "match", slug }} className="hover:text-rw-accent hover:underline">
          {fmtDate(date)}
        </HubLink>
      </td>
    </tr>
  );
};

const CopyBestPost: React.FC<{ title: string; view: "games" | "series"; rows: (BestGame | BestSeries)[]; query?: string }> = ({ title, view, rows, query }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines = [
      title,
      ...rows.slice(0, 5).map((r, i) => {
        if (view === "series") {
          const [rating, , , en, , , a, , b, , wa, wb] = r as BestSeries;
          return `#${i + 1} ${a} ${wa}–${wb} ${b} (${en}) — ${fmtDec(rating)} (${ratingTier(rating)})`;
        }
        const [rating, , n, , en, , , a, , b] = r as BestGame;
        return `#${i + 1} ${a} vs ${b} (${tl("Game {n}", { n })} · ${en}) — ${fmtDec(rating)} (${ratingTier(rating)})`;
      }),
      hubShareUrl({ kind: "best", ...(query ? { query } : {}) }),
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
