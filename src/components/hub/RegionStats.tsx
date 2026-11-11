/**
 * How each region did at Worlds, MSI or First Stand: one year (or one stage) or every year together. Teams sent, series
 * and games won, the record against other regions, the best finish and (all years) titles and finals, plus the region
 * against region records. From the event's lines files (each team's region and final place, builds from 2026-10-23 on).
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, regionName } from "../../i18n";
import type { EventLines } from "../../hub/worldsFacts";
import { normText, searchAlias } from "../../hub/data";
import { currentHubRoute, hubShareUrl } from "../../hub/route";
import { HubLink, Section } from "./ui";
import { STable } from "../STable";
import { SectionCard } from "./BroadcastCard";
import { chanceShade } from "../SwissStandings";

/** A region as fans know it today: renamed leagues count as one (EU is EMEA, LMS became PCS, LAN and LAS became LAT). */
const MERGE: Record<string, string> = { EU: "EMEA", LMS: "PCS", LAN: "LAT", LAS: "LAT" };
/** Common league/region search shorthands mapped to canonical region codes for Region vs region filtering. */
const REGION_SEARCH_ALIASES: Record<string, string> = {
  KR: "KR korea lck ogn 韩国 韓國 한국",
  CN: "CN china lpl 中国 中國 중국",
  EMEA: "EMEA EU europe lec eulcs 欧洲 歐洲 유럽",
  NA: "NA north america lcs lta nalcs 北美 북미",
  BR: "BR brazil cblol lta 巴西 브라질",
  VN: "VN vietnam vcs lcp 越南 베트남",
  JP: "JP japan ljl lcp 日本 일본",
  TR: "TR turkey tcl 土耳其 튀르키예",
  OCE: "OCE oceania lco opl lcp 大洋洲 오세아니아",
  CIS: "CIS lcl 独联体",
  PCS: "PCS taiwan lms lcp gpl 太平洋 台港澳",
  APAC: "APAC pacific asia-pacific lcp pcs 亚太",
  AME: "AME americas lta lcs cblol lla 美洲",
  LAT: "LAT LAN LAS latin america lla lta 拉美",
  SEA: "SEA southeast asia gpl pcs lcp 东南亚",
};
/** region code -> [translation key, English name, flag] (no flag for regions of many countries) */
const REGIONS: Record<string, [string, string, string | null]> = {
  KR: ["KOREA", "Korea", "kr"],
  CN: ["CHINA", "China", "cn"],
  EMEA: ["EUROPE", "Europe", "eu"],
  NA: ["NORTH AMERICA", "North America", "us"],
  BR: ["BRAZIL", "Brazil", "br"],
  VN: ["VIETNAM", "Vietnam", "vn"],
  JP: ["JAPAN", "Japan", "jp"],
  TR: ["TURKEY", "Turkey", "tr"],
  OCE: ["OCEANIA", "Oceania", "au"],
  CIS: ["CIS", "CIS", "ru"],
  PCS: ["PCS", "Taiwan / PCS", "tw"],
  APAC: ["PACIFIC", "Asia-Pacific", null],
  AME: ["AMERICAS", "Americas", null],
  LAT: ["LATIN AMERICA", "Latin America", null],
  SEA: ["SOUTHEAST ASIA", "Southeast Asia", null],
};
const regionKey = (code: string) => MERGE[code] || code;
export const regionLabel = (code: string) => (REGIONS[code] ? regionName(REGIONS[code][0], REGIONS[code][1]) : code);
const regionLeagueQuery = (code: string) => (code === "EMEA" ? "EMEA, Europe" : REGIONS[code]?.[1] || code);

export const RegionFlag: React.FC<{ code: string }> = ({ code }) => {
  const flag = REGIONS[code]?.[2];
  return flag ? (
    <img src={`/flags/${flag}.svg`} alt="" width={20} height={15} loading="lazy" className="inline-block w-5 h-[15px] rounded-[2px] ring-1 ring-black/20 object-cover shrink-0" />
  ) : (
    <span className="inline-flex items-center justify-center w-5 h-[15px] rounded-[2px] bg-rw-border text-[7px] font-bold text-rw-sub shrink-0">{code.slice(0, 3)}</span>
  );
};

interface Row {
  code: string;
  /** team appearances (one team in one year) */
  teams: number;
  sw: number;
  sl: number;
  gw: number;
  gl: number;
  /** series against other regions */
  ow: number;
  ol: number;
  /** best place (1 = won it) */
  best: number | null;
  titles: number;
  finals: number;
}

const placeNum = (p: string) => Number(/^\d+/.exec(p)?.[0] || NaN);
const pctOf = (w: number, l: number) => (w + l ? Math.round((w / (w + l)) * 100) : null);

/** files: the lines files shown (null = not part of this view); years: each file's edition ("Worlds 2025"). */
export function regionStats(files: (EventLines | null)[], years: string[]) {
  const rows = new Map<string, Row>();
  const pairs = new Map<string, [number, number]>();
  const placed = new Map<string, { code: string; p: number }>();
  const seen = new Set<string>();
  const row = (code: string) => {
    let r = rows.get(code);
    if (!r) rows.set(code, (r = { code, teams: 0, sw: 0, sl: 0, gw: 0, gl: 0, ow: 0, ol: 0, best: null, titles: 0, finals: 0 }));
    return r;
  };
  files.forEach((f, i) => {
    if (!f?.rg) return;
    const rg = (u: string) => (f.rg?.[u] ? regionKey(f.rg[u]) : null);
    for (const [u, code] of Object.entries(f.rg)) {
      const key = `${years[i]}|${u}`;
      if (!seen.has(key)) {
        seen.add(key);
        row(regionKey(code)).teams++;
      }
      const p = placeNum(f.pl?.[u] || "");
      if (!Number.isNaN(p)) placed.set(key, { code: regionKey(code), p });
    }
    for (const s of f.s) {
      const [, , , , ua, , , ub, , wa, wb] = s;
      const ra = rg(ua);
      const rb = rg(ub);
      if (!ra || !rb || wa == null || wb == null || wa === wb) continue;
      const aWon = wa > wb;
      const A = row(ra);
      const B = row(rb);
      A.gw += wa;
      A.gl += wb;
      B.gw += wb;
      B.gl += wa;
      if (aWon) (A.sw++, B.sl++);
      else (B.sw++, A.sl++);
      if (ra !== rb) {
        if (aWon) (A.ow++, B.ol++);
        else (B.ow++, A.ol++);
        const [x, y, xWon] = ra < rb ? [ra, rb, aWon] : [rb, ra, !aWon];
        const pr = pairs.get(`${x}|${y}`) || [0, 0];
        pr[xWon ? 0 : 1]++;
        pairs.set(`${x}|${y}`, pr);
      }
    }
  });
  for (const { code, p } of placed.values()) {
    const r = row(code);
    r.best = r.best == null ? p : Math.min(r.best, p);
    if (p === 1) r.titles++;
    if (p <= 2) r.finals++;
  }
  const list = [...rows.values()]
    .filter((r) => r.sw + r.sl > 0)
    .sort((a, b) => b.titles - a.titles || b.finals - a.finals || (pctOf(b.ow, b.ol) ?? -1) - (pctOf(a.ow, a.ol) ?? -1) || b.sw - a.sw);
  const pairList = [...pairs.entries()]
    .map(([k, [wa, wb]]) => {
      const [a, b] = k.split("|");
      return wa >= wb ? { a, b, wa, wb } : { a: b, b: a, wa: wb, wb: wa };
    })
    .sort((x, y) => y.wa + y.wb - (x.wa + x.wb));
  return { list, pairs: pairList };
}

/**
 * Region strength over time (every edition together): each region's series record against teams from other
 * regions, edition by edition, as shaded percentages (teal above 50%, red below; the record on hover). Regions in at
 * least three editions, the most series against other regions first.
 */
const RegionTrend: React.FC<{ files: (EventLines | null)[]; years: string[]; name: string; league?: string }> = ({ files, years, name, league }) => {
  const intlLeague = useMemo(
    () => league || (/msi|mid-season/i.test(name) ? "mid-season-invitational" : /first stand/i.test(name) ? "first-stand" : "world-championship"),
    [league, name],
  );
  const t = useMemo(() => {
    // an edition has several stage files: group them by year
    const byYear = new Map<string, number[]>();
    years.forEach((y, i) => {
      const yy = /\d{4}/.exec(y)?.[0];
      if (!yy || !files[i]) return;
      if (!byYear.has(yy)) byYear.set(yy, []);
      byYear.get(yy)!.push(i);
    });
    const cols = [...byYear.keys()].sort();
    const cells = new Map<string, Map<string, [number, number]>>();
    for (const y of cols) {
      const idx = byYear.get(y)!;
      for (const r of regionStats(idx.map((i) => files[i]), idx.map((i) => years[i])).list) {
        if (r.ow + r.ol === 0) continue;
        if (!cells.has(r.code)) cells.set(r.code, new Map());
        cells.get(r.code)!.set(y, [r.ow, r.ol]);
      }
    }
    const total = (c: string) => [...cells.get(c)!.values()].reduce((n, [w, l]) => n + w + l, 0);
    const rows = [...cells.keys()].filter((c) => cells.get(c)!.size >= 3).sort((a, b) => total(b) - total(a));
    return { cols, rows, cells };
  }, [files, years]);
  if (t.cols.length < 3 || !t.rows.length) return null;
  return (
    <Section
      title={tl("Region strength over time")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          <HubLink to={{ kind: "leagues" }} className="text-[11px] font-semibold text-rw-accent hover:underline" data-nocapture="1">
            {tl("Leagues")} →
          </HubLink>
          <HubLink to={{ kind: "tournaments", query: `league=${encodeURIComponent(intlLeague)}` }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline" data-nocapture="1">
            {tl("Tournaments")} →
          </HubLink>
          <HubLink to={{ kind: "titles" }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline" data-nocapture="1">
            {tl("Titles")} →
          </HubLink>
          <HubLink to={{ kind: "rankings", query: `league=${encodeURIComponent(intlLeague)}` }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline" data-nocapture="1">
            {tl("Power rankings")} →
          </HubLink>
          <HubLink to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}` }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline" data-nocapture="1">
            {tl("Game finder")} →
          </HubLink>
          <HubLink to={{ kind: "tiers", query: `league=${encodeURIComponent(intlLeague)}` }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline" data-nocapture="1">
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink to={{ kind: "best", query: `league=${encodeURIComponent(intlLeague)}` }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline" data-nocapture="1">
            {tl("Best games")} →
          </HubLink>
          <HubLink to={{ kind: "leaders", query: `league=${encodeURIComponent(intlLeague)}` }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline" data-nocapture="1">
            {tl("Player leaderboards")} →
          </HubLink>
          <CopyRegionStatsPost
            title={`${tl("Region strength over time")} · ${name}`}
            rows={t.rows.slice(0, 6).map((c) => {
              const vals = [...t.cells.get(c)!.values()];
              const w = vals.reduce((s, [a]) => s + a, 0);
              const l = vals.reduce((s, [, b]) => s + b, 0);
              return `${regionLabel(c)}: ${w}-${l} (${w + l > 0 ? `${Math.round((w / (w + l)) * 100)}%` : "–"})`;
            })}
          />
          <SectionCard
            section={tl("Region strength over time")}
            name={tl("Regions")}
            sub={`${t.cols[0]}–${t.cols[t.cols.length - 1]}`}
            rows={() =>
              t.rows.slice(0, 10).map((c, idx) => {
                const vals = [...t.cells.get(c)!.values()];
                const w = vals.reduce((s, [a]) => s + a, 0);
                const l = vals.reduce((s, [, b]) => s + b, 0);
                return {
                  rank: idx + 1,
                  label: regionLabel(c),
                  sub: `${w}-${l} (${t.cells.get(c)!.size} ${tl("Years")})`,
                  value: w + l > 0 ? `${Math.round((w / (w + l)) * 100)}%` : "–",
                  win: w >= l,
                };
              })
            }
          />
        </span>
      }
    >
      <div className="overflow-x-auto">
        <STable className="text-xs">
          <thead className="text-[10px] text-rw-muted">
            <tr>
              <th className="px-2 py-1 text-left font-normal">{tl("Region")}</th>
              {t.cols.map((y) => (
                <th key={y} className="px-0.5 py-1 text-center font-normal tabular-nums">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((c) => (
              <tr key={c} className="border-t border-rw-border">
                <td className="px-2 py-1" data-sort={regionLabel(c)}>
                  <HubLink to={{ kind: "leagues", query: `q=${encodeURIComponent(regionLeagueQuery(c))}` }} className="flex items-center gap-1.5 whitespace-nowrap hover:text-rw-accent">
                    <RegionFlag code={c} />
                    <span className="text-rw-text hover:text-rw-accent font-semibold">{regionLabel(c)}</span>
                  </HubLink>
                </td>
                {t.cols.map((y) => {
                  const wl = t.cells.get(c)!.get(y);
                  if (!wl) return <td key={y} data-sort={-1} className="px-0.5 py-1 text-center text-rw-muted">–</td>;
                  const p = wl[0] / (wl[0] + wl[1]);
                  return (
                    <td key={y} data-sort={Math.round(p * 100)} className="px-0.5 py-0.5 text-center">
                      <HubLink
                        to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&year=${encodeURIComponent(y)}` }}
                        className={`block min-w-[2.5rem] rounded-sm px-1 py-0.5 tabular-nums text-rw-text hover:ring-1 hover:ring-rw-accent/60 ${wl[0] + wl[1] < 3 ? "opacity-45" : ""}`}
                        style={chanceShade(p)}
                        title={tl("{region} {year}: {w}-{l} in series against other regions", { region: regionLabel(c), year: y, w: wl[0], l: wl[1] })}
                      >
                        {Math.round(p * 100)}
                      </HubLink>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </STable>
      </div>
      <p className="text-[10px] text-rw-muted">
        {tl("Each edition: the share of series a region's teams won against teams from other regions (hover for the record). Teal above 50%, red below; faded when fewer than 3 series.")}
      </p>
    </Section>
  );
};

const bestText = (p: number | null) => (p == null ? "–" : p === 1 ? tl("Won it") : p === 2 ? tl("Final") : p <= 4 ? tl("Semifinal") : p <= 8 ? tl("Quarterfinal") : tl("Top {n}", { n: p }));

export const RegionStats: React.FC<{ files: (EventLines | null)[]; years: string[]; all: boolean; name: string; league?: string }> = ({ files, years, all, name, league }) => {
  const { list, pairs } = useMemo(() => regionStats(files, years), [files, years]);
  const singleYear = useMemo(() => (!all ? /\d{4}/.exec(years[0] || "")?.[0] : undefined), [all, years]);
  const intlLeague = useMemo(
    () => league || (/msi|mid-season/i.test(name) ? "mid-season-invitational" : /first stand/i.test(name) ? "first-stand" : "world-championship"),
    [league, name],
  );
  const topTeamByRegion = useMemo(() => {
    const wins = new Map<string, Map<string, number>>();
    files.forEach((f) => {
      if (!f?.rg) return;
      const rg = (u: string) => (f.rg?.[u] ? regionKey(f.rg[u]) : null);
      for (const [u, code] of Object.entries(f.rg)) {
        const r = regionKey(code);
        if (!wins.has(r)) wins.set(r, new Map());
        if (!wins.get(r)!.has(u)) wins.get(r)!.set(u, 0);
      }
      for (const s of f.s) {
        const [, , , , ua, , , ub, , wa, wb] = s;
        const ra = rg(ua);
        const rb = rg(ub);
        if (ra && ua && wa != null) wins.get(ra)?.set(ua, (wins.get(ra)?.get(ua) || 0) + wa);
        if (rb && ub && wb != null) wins.get(rb)?.set(ub, (wins.get(rb)?.get(ub) || 0) + wb);
      }
    });
    const best = new Map<string, string>();
    for (const [r, m] of wins.entries()) {
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (top) best.set(r, top);
    }
    return best;
  }, [files]);
  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;
  const [pairSearch, setPairSearch] = useState(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("region") || p.get("pair") || "";
  });
  useEffect(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    const v = p.get("region") || p.get("pair") || "";
    if (v) setPairSearch(v);
  }, [routeQuery]);
  const pairTerms = useMemo(
    () =>
      pairSearch
        .trim()
        .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
        .map((s) => normText(s.trim()))
        .filter(Boolean),
    [pairSearch],
  );
  const filteredPairs = useMemo(() => {
    if (!pairTerms.length) return pairs;
    const bare = (s: string) => normText(s).replace(/[^a-z0-9\u00c0-\uffff]/g, "");
    return pairs.filter((p) => {
      const hay = normText(`${p.a} ${regionLabel(p.a)} ${REGION_SEARCH_ALIASES[p.a] || ""} ${p.b} ${regionLabel(p.b)} ${REGION_SEARCH_ALIASES[p.b] || ""}`);
      const hayBare = bare(hay);
      return pairTerms.some((t) => {
        const ta = searchAlias(t);
        return (
          hay.includes(t) ||
          (t.length >= 2 && hayBare.includes(bare(t))) ||
          (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false)
        );
      });
    });
  }, [pairs, pairTerms]);
  if (!list.length) return null;
  const maxTitles = Math.max(1, ...list.map((r) => r.titles));
  const maxFinals = Math.max(1, ...list.map((r) => r.finals));
  const cell = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const topRegTeamA = list[0] ? topTeamByRegion.get(list[0].code) : undefined;
  const topRegTeamB = list[1] ? topTeamByRegion.get(list[1].code) : undefined;
  const pairTeamA = filteredPairs[0] ? topTeamByRegion.get(filteredPairs[0].a) : undefined;
  const pairTeamB = filteredPairs[0] ? topTeamByRegion.get(filteredPairs[0].b) : undefined;
  return (
    <>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Section
        title={tl("Regions")}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {topRegTeamA && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: topRegTeamA,
                    ...(topRegTeamB && topRegTeamB !== topRegTeamA ? { b: topRegTeamB } : {}),
                    ...(singleYear ? { period: `y${singleYear}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(topRegTeamA)}${topRegTeamB && topRegTeamB !== topRegTeamA ? `,${encodeURIComponent(topRegTeamB)}` : ""}${singleYear ? `&p=y${singleYear}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: topRegTeamA,
                    ...(topRegTeamB && topRegTeamB !== topRegTeamA ? { b: topRegTeamB } : {}),
                    ...(singleYear ? { period: `y${singleYear}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
              </>
            )}
            <HubLink to={{ kind: "leagues" }} className="text-[11px] font-semibold text-rw-accent hover:underline" data-nocapture="1">
              {tl("Leagues")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tournaments",
                ...(singleYear ? { year: singleYear } : {}),
                query: `league=${encodeURIComponent(intlLeague)}`,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Tournaments")} →
            </HubLink>
            <HubLink
              to={{
                kind: "titles",
                ...(topRegTeamA ? { query: `q=${encodeURIComponent(topRegTeamA)}` } : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Titles")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(topRegTeamA ? { q: `${topRegTeamA}${topRegTeamB && topRegTeamB !== topRegTeamA ? `,${topRegTeamB}` : ""}` } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(topRegTeamA ? { team: topRegTeamA } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { key: `y${singleYear}` } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "best",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(topRegTeamA ? { q: `${topRegTeamA}${topRegTeamB && topRegTeamB !== topRegTeamA ? `,${topRegTeamB}` : ""}` } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Best games")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(topRegTeamA ? { q: `${topRegTeamA}${topRegTeamB && topRegTeamB !== topRegTeamA ? `,${topRegTeamB}` : ""}` } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <CopyRegionStatsPost
              title={`${tl("Regions")} · ${name}`}
              rows={list.slice(0, 6).map((r) => `${regionLabel(r.code)}: ${tl("Series {w}-{l}", { w: r.sw, l: r.sl })} · ${all ? tl("{n} titles", { n: r.titles }) : bestText(r.best)}`)}
            />
            <SectionCard
              section={tl("Regions")}
              name={name}
              rows={() =>
                list.map((r, idx) => ({
                  rank: idx + 1,
                  label: regionLabel(r.code),
                  sub: `${tl("Series {w}-{l}", { w: r.sw, l: r.sl })} · ${tl("vs other regions {w}-{l}", { w: r.ow, l: r.ol })}`,
                  value: all ? tl("{n} titles", { n: r.titles }) : bestText(r.best),
                  win: r.sw >= r.sl,
                }))
              }
            />
          </span>
        }
      >
        <div className="overflow-x-auto">
          <STable className="w-full text-xs">
            <thead className="text-[10px] text-rw-muted">
              <tr>
                <th className="px-2 py-1 text-left">{tl("Region")}</th>
                <th className={cell}>{all ? tl("Teams sent") : tl("Teams")}</th>
                <th className={cell}>{tl("Series")}</th>
                <th className={cell}>{tl("Games")}</th>
                <th className={cell} title={tl("Series against teams from other regions")}>{tl("vs others")}</th>
                <th className={cell}>{tl("Best")}</th>
                {all && <th className={cell}>{tl("Titles")}</th>}
                {all && <th className={cell}>{tl("Finals")}</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const sPct = pctOf(r.sw, r.sl);
                const gPct = pctOf(r.gw, r.gl);
                const oPct = pctOf(r.ow, r.ol);
                const tBar = r.titles > 0 ? Math.max(6, Math.round((r.titles / maxTitles) * 100)) : 0;
                const fBar = r.finals > 0 ? Math.max(6, Math.round((r.finals / maxFinals) * 100)) : 0;
                return (
                  <tr key={r.code} className="border-t border-rw-border">
                    <td className="px-2 py-1" data-sort={regionLabel(r.code)}>
                      <HubLink to={{ kind: "leagues", query: `q=${encodeURIComponent(regionLeagueQuery(r.code))}` }} className="flex items-center gap-1.5 min-w-0 hover:text-rw-accent">
                        <RegionFlag code={r.code} />
                        <span className="truncate text-rw-text hover:text-rw-accent font-semibold">{regionLabel(r.code)}</span>
                      </HubLink>
                    </td>
                    <td className={cell} data-sort={r.teams}>{r.teams}</td>
                    <td className={cell} data-sort={r.sw * 1000 - r.sl}>
                      <HubLink
                        to={{
                          kind: "finder",
                          query:
                            new URLSearchParams({
                              league: intlLeague,
                              ...(topTeamByRegion.get(r.code) ? { team: topTeamByRegion.get(r.code)! } : {}),
                              ...(singleYear ? { year: singleYear } : {}),
                            }).toString() || undefined,
                        }}
                        className="inline-flex items-center justify-end gap-1.5 hover:text-rw-accent hover:underline"
                        title={tl("Game finder")}
                      >
                        {sPct != null && (
                          <span className="hidden sm:inline-block w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                            <span
                              className={`block h-full rounded-full ${sPct >= 50 ? "bg-rw-teal/80" : "bg-rw-rose/70"}`}
                              style={{ width: `${Math.max(4, Math.min(100, sPct))}%` }}
                            />
                          </span>
                        )}
                        <span>{r.sw}-{r.sl}</span>
                      </HubLink>
                    </td>
                    <td className={cell} data-sort={gPct ?? -1}>
                      <HubLink
                        to={{
                          kind: "finder",
                          query:
                            new URLSearchParams({
                              league: intlLeague,
                              ...(topTeamByRegion.get(r.code) ? { team: topTeamByRegion.get(r.code)! } : {}),
                              ...(singleYear ? { year: singleYear } : {}),
                            }).toString() || undefined,
                        }}
                        className="inline-flex items-center justify-end gap-1.5 hover:text-rw-accent hover:underline"
                        title={tl("Game finder")}
                      >
                        {gPct != null && (
                          <span className="hidden sm:inline-block w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                            <span
                              className={`block h-full rounded-full ${gPct >= 50 ? "bg-rw-teal/80" : "bg-rw-rose/70"}`}
                              style={{ width: `${Math.max(4, Math.min(100, gPct))}%` }}
                            />
                          </span>
                        )}
                        <span>
                          {r.gw}-{r.gl}
                          <span className="text-rw-muted"> · {gPct ?? "–"}%</span>
                        </span>
                      </HubLink>
                    </td>
                    <td className={cell} data-sort={oPct ?? -1}>
                      {r.ow + r.ol ? (
                        <HubLink
                          to={{
                            kind: "finder",
                            query:
                              new URLSearchParams({
                                league: intlLeague,
                                ...(topTeamByRegion.get(r.code) ? { team: topTeamByRegion.get(r.code)! } : {}),
                                ...(singleYear ? { year: singleYear } : {}),
                              }).toString() || undefined,
                          }}
                          className="inline-flex items-center justify-end gap-1.5 hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {oPct != null && (
                            <span className="hidden sm:inline-block w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                              <span
                                className={`block h-full rounded-full ${oPct >= 50 ? "bg-rw-teal/80" : "bg-rw-rose/70"}`}
                                style={{ width: `${Math.max(4, Math.min(100, oPct))}%` }}
                              />
                            </span>
                          )}
                          <span>
                            {r.ow}-{r.ol} <span className={oPct != null && oPct >= 50 ? "text-rw-teal font-semibold" : "text-rw-muted"}>· {oPct}%</span>
                          </span>
                        </HubLink>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className={`${cell} ${r.best === 1 ? "text-rw-accent font-bold" : ""}`} data-sort={r.best ? -r.best : -999}>{bestText(r.best)}</td>
                    {all && (
                      <td className={`${cell} font-bold ${r.titles ? "text-rw-accent" : "text-rw-muted"}`} data-sort={r.titles}>
                        {r.titles > 0 ? (
                          <HubLink
                            to={{
                              kind: "titles",
                              ...(topTeamByRegion.get(r.code) ? { query: `q=${encodeURIComponent(topTeamByRegion.get(r.code)!)}` } : {}),
                            }}
                            className="inline-flex items-center justify-end gap-1.5 hover:underline"
                          >
                            {tBar > 0 && (
                              <span className="hidden sm:inline-block w-7 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                                <span className="block h-full rounded-full bg-rw-accent/80" style={{ width: `${tBar}%` }} />
                              </span>
                            )}
                            <span>{r.titles}</span>
                          </HubLink>
                        ) : (
                          <span>{r.titles}</span>
                        )}
                      </td>
                    )}
                    {all && (
                      <td className={cell} data-sort={r.finals}>
                        {r.finals > 0 ? (
                          <HubLink
                            to={{
                              kind: "titles",
                              ...(topTeamByRegion.get(r.code) ? { query: `q=${encodeURIComponent(topTeamByRegion.get(r.code)!)}` } : {}),
                            }}
                            className="inline-flex items-center justify-end gap-1.5 hover:text-rw-accent hover:underline"
                          >
                            {fBar > 0 && (
                              <span className="hidden sm:inline-block w-7 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
                                <span className="block h-full rounded-full bg-rw-teal/70" style={{ width: `${fBar}%` }} />
                              </span>
                            )}
                            <span>{r.finals}</span>
                          </HubLink>
                        ) : (
                          <span>{r.finals}</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </STable>
        </div>
      </Section>
      {pairs.length > 0 && (
        <Section
          title={tl("Region vs region")}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {pairTeamA && (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: pairTeamA,
                      ...(pairTeamB && pairTeamB !== pairTeamA ? { b: pairTeamB } : {}),
                      ...(singleYear ? { period: `y${singleYear}` } : {}),
                    }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `teams=${encodeURIComponent(pairTeamA)}${pairTeamB && pairTeamB !== pairTeamA ? `,${encodeURIComponent(pairTeamB)}` : ""}${singleYear ? `&p=y${singleYear}` : ""}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: pairTeamA,
                      ...(pairTeamB && pairTeamB !== pairTeamA ? { b: pairTeamB } : {}),
                      ...(singleYear ? { period: `y${singleYear}` } : {}),
                    }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Compare")} →
                  </HubLink>
                </>
              )}
              <HubLink to={{ kind: "leagues" }} className="text-[11px] font-semibold text-rw-accent hover:underline" data-nocapture="1">
                {tl("Leagues")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tournaments",
                  ...(singleYear ? { year: singleYear } : {}),
                  query: `league=${encodeURIComponent(intlLeague)}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Tournaments")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "titles",
                  ...(pairTeamA
                    ? {
                        query: `q=${encodeURIComponent(`${pairTeamA}${pairTeamB && pairTeamB !== pairTeamA ? `,${pairTeamB}` : ""}`)}`,
                      }
                    : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Titles")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(pairTeamA ? { q: `${pairTeamA}${pairTeamB && pairTeamB !== pairTeamA ? `,${pairTeamB}` : ""}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(singleYear ? { year: singleYear } : {}),
                    ...(pairTeamA
                      ? {
                          team: pairTeamA,
                          ...(pairTeamB && pairTeamB !== pairTeamA ? { vs: pairTeamB } : {}),
                        }
                      : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(singleYear ? { key: `y${singleYear}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "best",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(singleYear ? { year: singleYear } : {}),
                    ...(pairTeamA
                      ? { q: `${pairTeamA}${pairTeamB && pairTeamB !== pairTeamA ? `,${pairTeamB}` : ""}` }
                      : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Best games")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(singleYear ? { year: singleYear } : {}),
                    ...(pairTeamA
                      ? { q: `${pairTeamA}${pairTeamB && pairTeamB !== pairTeamA ? `,${pairTeamB}` : ""}` }
                      : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              {(pairs.length > 6 || Boolean(pairSearch.trim())) && (
                <input
                  type="search"
                  value={pairSearch}
                  onChange={(e) => setPairSearch(e.target.value)}
                  placeholder={tl("Filter by name or team…")}
                  aria-label={tl("Filter by name or team…")}
                  data-nocapture="1"
                  className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-32"
                />
              )}
              <CopyRegionStatsPost
                title={`${tl("Region vs region")} · ${name}`}
                rows={filteredPairs.slice(0, 6).map((p) => `${regionLabel(p.a)} ${p.wa}–${p.wb} ${regionLabel(p.b)}`)}
              />
              <SectionCard
                section={tl("Region vs region")}
                name={name}
                rows={() =>
                  filteredPairs.map((p, idx) => ({
                    rank: idx + 1,
                    label: `${regionLabel(p.a)} vs ${regionLabel(p.b)}`,
                    value: `${p.wa}-${p.wb}`,
                    win: p.wa >= p.wb,
                  }))
                }
              />
            </span>
          }
        >
          <ul className="text-xs space-y-1.5">
            {(pairTerms.length > 0 ? filteredPairs : filteredPairs.slice(0, 12)).map((p) => {
              const tot = p.wa + p.wb;
              const shareA = tot > 0 ? Math.round((p.wa / tot) * 100) : 50;
              return (
                <li key={p.a + p.b} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <RegionFlag code={p.a} />
                      <HubLink to={{ kind: "leagues", query: `q=${encodeURIComponent(regionLeagueQuery(p.a))}` }} className="truncate text-rw-text font-medium hover:text-rw-accent hover:underline">
                        {regionLabel(p.a)}
                      </HubLink>
                      <span className="text-rw-muted">vs</span>
                      <RegionFlag code={p.b} />
                      <HubLink to={{ kind: "leagues", query: `q=${encodeURIComponent(regionLeagueQuery(p.b))}` }} className="truncate text-rw-sub hover:text-rw-accent hover:underline">
                        {regionLabel(p.b)}
                      </HubLink>
                    </span>
                    <HubLink
                      to={{
                        kind: "finder",
                        query:
                          new URLSearchParams({
                            league: intlLeague,
                            ...(topTeamByRegion.get(p.a) ? { team: topTeamByRegion.get(p.a)! } : {}),
                            ...(topTeamByRegion.get(p.b) ? { vs: topTeamByRegion.get(p.b)! } : {}),
                            ...(singleYear ? { year: singleYear } : {}),
                          }).toString() || undefined,
                      }}
                      className="tabular-nums shrink-0 hover:underline"
                      title={tl("Game finder")}
                    >
                      <span className="text-rw-teal font-bold">{p.wa}</span>
                      <span className="text-rw-muted"> – </span>
                      <span className="text-rw-sub">{p.wb}</span>
                    </HubLink>
                  </div>
                  <div className="h-1 w-full rounded-full bg-rw-border/70 overflow-hidden flex gap-[1px]" aria-hidden="true">
                    <span className="h-full bg-rw-teal/80" style={{ width: `${shareA}%` }} />
                    <span className="h-full flex-1 bg-rw-sub/40" />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-rw-muted">{tl("Series between teams from different regions.")}</p>
        </Section>
      )}
    </div>
    {all && <RegionTrend files={files} years={years} name={name} league={intlLeague} />}
    </>
  );
};

const CopyRegionStatsPost: React.FC<{ title: string; rows: string[] }> = ({ title, rows }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [title];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push(hubShareUrl(currentHubRoute()));
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        setState("failed");
        setTimeout(() => setState("idle"), 2400);
      });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
