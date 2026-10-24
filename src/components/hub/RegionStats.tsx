/**
 * How each region did at Worlds, MSI or First Stand: one year (or one stage) or every year together. Teams sent, series
 * and games won, the record against other regions, the best finish and (all years) titles and finals, plus the region
 * against region records. From the event's lines files (each team's region and final place, builds from 2026-10-23 on).
 */
import React, { useMemo } from "react";
import { tl, regionName } from "../../i18n";
import type { EventLines } from "../../hub/worldsFacts";
import { Section } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { chanceShade } from "../SwissStandings";

/** A region as fans know it today: renamed leagues count as one (EU is EMEA, LMS became PCS, LAN and LAS became LAT). */
const MERGE: Record<string, string> = { EU: "EMEA", LMS: "PCS", LAN: "LAT", LAS: "LAT" };
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
const RegionTrend: React.FC<{ files: (EventLines | null)[]; years: string[] }> = ({ files, years }) => {
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
    <Section title={tl("Region strength over time")}>
      <div className="overflow-x-auto">
        <table className="text-xs">
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
                <td className="px-2 py-1">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <RegionFlag code={c} />
                    <span className="text-rw-text font-semibold">{regionLabel(c)}</span>
                  </span>
                </td>
                {t.cols.map((y) => {
                  const wl = t.cells.get(c)!.get(y);
                  if (!wl) return <td key={y} className="px-0.5 py-1 text-center text-rw-muted">–</td>;
                  const p = wl[0] / (wl[0] + wl[1]);
                  return (
                    <td key={y} className="px-0.5 py-0.5 text-center">
                      <span
                        className={`block min-w-[2.5rem] rounded-sm px-1 py-0.5 tabular-nums text-rw-text ${wl[0] + wl[1] < 3 ? "opacity-45" : ""}`}
                        style={chanceShade(p)}
                        title={tl("{region} {year}: {w}-{l} in series against other regions", { region: regionLabel(c), year: y, w: wl[0], l: wl[1] })}
                      >
                        {Math.round(p * 100)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-rw-muted">
        {tl("Each edition: the share of series a region's teams won against teams from other regions (hover for the record). Teal above 50%, red below; faded when fewer than 3 series.")}
      </p>
    </Section>
  );
};

const bestText = (p: number | null) => (p == null ? "–" : p === 1 ? tl("Won it") : p === 2 ? tl("Final") : p <= 4 ? tl("Semifinal") : p <= 8 ? tl("Quarterfinal") : tl("Top {n}", { n: p }));

export const RegionStats: React.FC<{ files: (EventLines | null)[]; years: string[]; all: boolean; name: string }> = ({ files, years, all, name }) => {
  const { list, pairs } = useMemo(() => regionStats(files, years), [files, years]);
  if (!list.length) return null;
  const cell = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  return (
    <>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Section
        title={tl("Regions")}
        right={
          <SectionCard
            section={tl("Regions")}
            name={name}
            rows={() =>
              list.map((r) => ({
                label: regionLabel(r.code),
                sub: `${tl("Series {w}-{l}", { w: r.sw, l: r.sl })} · ${tl("vs other regions {w}-{l}", { w: r.ow, l: r.ol })}`,
                value: all ? tl("{n} titles", { n: r.titles }) : bestText(r.best),
              }))
            }
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
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
              {list.map((r) => (
                <tr key={r.code} className="border-t border-rw-border">
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <RegionFlag code={r.code} />
                      <span className="truncate text-rw-text font-semibold">{regionLabel(r.code)}</span>
                    </span>
                  </td>
                  <td className={cell}>{r.teams}</td>
                  <td className={cell}>
                    {r.sw}-{r.sl}
                  </td>
                  <td className={cell}>
                    {r.gw}-{r.gl}
                    <span className="text-rw-muted"> · {pctOf(r.gw, r.gl) ?? "–"}%</span>
                  </td>
                  <td className={cell}>
                    {r.ow + r.ol ? (
                      <>
                        {r.ow}-{r.ol} <span className="text-rw-muted">· {pctOf(r.ow, r.ol)}%</span>
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className={`${cell} ${r.best === 1 ? "text-rw-accent font-bold" : ""}`}>{bestText(r.best)}</td>
                  {all && <td className={`${cell} font-bold ${r.titles ? "text-rw-accent" : "text-rw-muted"}`}>{r.titles}</td>}
                  {all && <td className={cell}>{r.finals}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {pairs.length > 0 && (
        <Section
          title={tl("Region vs region")}
          right={
            <SectionCard
              section={tl("Region vs region")}
              name={name}
              rows={() => pairs.map((p) => ({ label: `${regionLabel(p.a)} vs ${regionLabel(p.b)}`, value: `${p.wa}-${p.wb}` }))}
            />
          }
        >
          <ul className="text-xs space-y-1">
            {pairs.slice(0, 12).map((p) => (
              <li key={p.a + p.b} className="flex items-center justify-between gap-2 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <RegionFlag code={p.a} />
                  <span className="truncate text-rw-text">{regionLabel(p.a)}</span>
                  <span className="text-rw-muted">vs</span>
                  <RegionFlag code={p.b} />
                  <span className="truncate text-rw-sub">{regionLabel(p.b)}</span>
                </span>
                <span className="tabular-nums shrink-0">
                  <span className="text-rw-teal font-bold">{p.wa}</span>
                  <span className="text-rw-muted"> – </span>
                  <span className="text-rw-sub">{p.wb}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-rw-muted">{tl("Series between teams from different regions.")}</p>
        </Section>
      )}
    </div>
    {all && <RegionTrend files={files} years={years} />}
    </>
  );
};
