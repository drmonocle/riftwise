/**
 * Power rankings: every active pro team on one scale across all regions (Elo over every pro game since 2011,
 * scripts/stats/ratings.py), league strength, and how often the higher-rated team actually won.
 * Address: /stats/rankings
 */
import React, { useMemo, useState } from "react";
import { tl, tn } from "../../i18n";
import { loadRatings, loadRatingsHistory } from "../../hub/data";
import { hubShareUrl, navigateHub, useHubRoute } from "../../hub/route";
import { Sparkline } from "./Sparkline";
import type { HubRatings, RatingRow } from "../../hub/types";
import { chanceContext, matchChance, pct, seriesChance } from "../../hub/winChance";
import { SortTable, type Column } from "./SortTable";
import {
  card,
  fmtDate,
  fmtNum,
  HubLink,
  Page,
  Section,
  td,
  th,
  TeamLink,
  TeamLogo,
  useLoad,
  usePageTitle,
} from "./ui";
import { CountryFlag, countryName } from "./CountryFlag";
import { STable } from "../STable";
import { BroadcastCardButton, SectionCard, rankingsCard } from "./BroadcastCard";

const sel =
  "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text max-w-[14rem]";

export const Change: React.FC<{ v: number | null | undefined }> = ({ v }) =>
  v == null ? (
    <span className="text-rw-muted">–</span>
  ) : (
    <span
      className={
        v > 0 ? "text-rw-teal" : v < 0 ? "text-rw-red" : "text-rw-muted"
      }
    >
      {v > 0 ? `+${v}` : v}
    </span>
  );

export const RankingsPage: React.FC = () => {
  usePageTitle(tl("Power rankings"));
  const state = useLoad(loadRatings, []);
  return <Page state={state}>{(d: HubRatings) => <RankingsView d={d} />}</Page>;
};

const RankingsView: React.FC<{ d: HubRatings }> = ({ d }) => {
  const route = useHubRoute();
  const q = new URLSearchParams(route.kind === "rankings" && "query" in route ? route.query || "" : "");
  const league = q.get("league") || "";
  const setLeague = (v: string) => {
    const next = new URLSearchParams(q);
    if (!v) next.delete("league");
    else next.set("league", v);
    const qs = next.toString();
    navigateHub({ kind: "rankings", ...(qs ? { query: qs } : {}) }, { replace: true });
  };
  const [limit, setLimit] = useState(50);
  const [asOf, setAsOf] = useState("");
  const hist = useLoad(loadRatingsHistory, []);
  const histDates = useMemo(() => {
    if (!hist.data) return [];
    const s = new Set<string>();
    for (const pts of Object.values(hist.data)) {
      for (const [dt] of pts) if (dt) s.add(dt);
    }
    return [...s].sort().reverse();
  }, [hist.data]);
  // all leagues: top-league teams on one scale; one league: its teams ranked within it
  const rows = useMemo(() => {
    const filtered = d.teams.filter((r) => (league === "*" ? true : league ? r[3] === league : r[9] === 1));
    if (!asOf || !hist.data) {
      return filtered.map((r, i) => ({ r, rank: i + 1 }));
    }
    const rewound = filtered
      .map((r) => {
        const pts = hist.data?.[r[0]];
        if (!pts || !pts.length) return r;
        let pastRating = pts[0][1];
        for (const [dt, val] of pts) {
          if (dt <= asOf) pastRating = val;
          else break;
        }
        const copy = [...r] as RatingRow;
        copy[5] = Math.round(pastRating);
        return copy;
      })
      .sort((a, b) => b[5] - a[5]);
    return rewound.map((r, i) => ({ r, rank: i + 1 }));
  }, [d.teams, league, asOf, hist.data]);
  const topLeagueCards = useMemo(() => {
    return d.leagues.slice(0, 6).map(([l, u, top4Avg, count]) => {
      const lTeams = d.teams.filter((t) => t[3] === l).sort((a, b) => b[5] - a[5]);
      const best = lTeams[0] || null;
      const worst = lTeams[lTeams.length - 1] || null;
      const short = best?.[10] || l;
      return { l, u, short, top4Avg, count, best, minR: worst ? worst[5] : top4Avg, maxR: best ? best[5] : top4Avg };
    });
  }, [d.leagues, d.teams]);
  // #1 of the list shown (a league's own #1 when one league is picked)
  const top = rows[0]?.r;
  // one scale for the whole column, so a lower-rated team never shows a better chance than one above it
  const vs1 = (x: RatingRow) =>
    top ? matchChance(x[5], top[5], league ? chanceContext(x[9] === 1, top[9] === 1, x[3], top[3]) : chanceContext(true, true, top[3], top[3]), d.adjust) : null;
  const oneLeague = league !== "" && league !== "*";
  const leagues = useMemo(() => {
    const tier = new Map(d.teams.map((r) => [r[3], r[9]]));
    return [...tier.keys()]
      .filter(Boolean)
      .sort((a, b) => tier.get(a)! - tier.get(b)! || a.localeCompare(b))
      .map((l) => ({ l, tier: tier.get(l)! }));
  }, [d.teams]);
  type Row = { r: RatingRow; rank: number };
  // the rating after each game day of the last 30 days (the stats build), ending at the rating shown (which counts the
  // games since); the "30 days" number is the same line's start to end, so the line, its colour and the number agree
  const trend = (r: RatingRow): [string, number][] | null => {
    const h = hist.data?.[r[0]];
    if (!h || !h.length) return null;
    const end = h[h.length - 1];
    // no game since: a flat (grey) line
    return end[1] === r[5] && h.length > 1 ? h : [...h, [r[8] > end[0] ? r[8] : end[0], r[5]]];
  };
  const change = (r: RatingRow) => {
    const p = trend(r);
    return p && p.length > 1 ? p[p.length - 1][1] - p[0][1] : r[6];
  };
  const maxRowRating = useMemo(() => Math.max(1500, ...rows.map((x) => x.r[5])), [rows]);
  const minRowRating = useMemo(() => Math.min(1100, ...rows.map((x) => x.r[5])) - 40, [rows]);
  const maxRowGames = useMemo(() => Math.max(1, ...rows.map((x) => x.r[7] || 0)), [rows]);
  const columns: Column<Row>[] = [
    {
      key: "rank",
      label: "#",
      value: (x) => x.rank,
      className: "text-rw-muted tabular-nums",
    },
    {
      key: "team",
      label: tl("Team"),
      value: (x) => x.r[1],
      render: (x) => (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <TeamLogo name={x.r[1]} size={16} />
          <TeamLink
            name={x.r[1]}
            u={x.r[0]}
            className="text-rw-text hover:text-rw-accent hover:underline font-semibold"
          />
        </span>
      ),
    },
    {
      key: "league",
      label: tl("League"),
      value: (x) => x.r[10] || x.r[3],
      render: (x) =>
        x.r[4] ? (
          <HubLink
            to={{ kind: "league", slug: x.r[4] }}
            title={x.r[3]}
            className="text-rw-sub hover:text-rw-accent hover:underline whitespace-nowrap"
          >
            {x.r[10] || x.r[3]}
          </HubLink>
        ) : (
          <span className="text-rw-sub" title={x.r[3]}>{x.r[10] || x.r[3] || "–"}</span>
        ),
    },
    {
      key: "country",
      label: tl("Country"),
      value: (x) => countryName(x.r[11]),
      render: (x) => <CountryFlag cc={x.r[11]} />,
    },
    {
      key: "rating",
      label: tl("Rating"),
      value: (x) => x.r[5],
      render: (x) => {
        const w = Math.max(10, Math.min(100, Math.round(((x.r[5] - minRowRating) / Math.max(1, maxRowRating - minRowRating)) * 100)));
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[3.25rem]">
            <span>{x.r[5]}</span>
            <span className="h-1 w-11 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-accent/80" style={{ width: `${w}%` }} />
            </span>
          </span>
        );
      },
      className: "tabular-nums font-bold text-rw-accent",
    },
    {
      key: "trend",
      label: tl("Trend"),
      title: tl("Rating over the last 30 days, after each game day: green went up, red went down, grey stayed the same"),
      value: (x) => change(x.r),
      render: (x) => {
        const p = trend(x.r);
        return p && p.length > 1 ? <Sparkline points={p} width={80} height={20} /> : null;
      },
      className: "hidden md:table-cell",
    },
    {
      key: "chg",
      label: tl("30 days"),
      title: tl("Rating change over the last 30 days"),
      value: (x) => change(x.r),
      render: (x) => <Change v={change(x.r)} />,
      className: "tabular-nums",
    },
    {
      key: "vs1",
      label: tl("vs #1"),
      title: tl("Chance to beat the top team in one game"),
      value: (x) => vs1(x.r),
      render: (x) => {
        const v = vs1(x.r);
        if (v == null) return "–";
        const p = Math.max(4, Math.min(100, Math.round(v * 100)));
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[2.75rem]">
            {top && x.r[0] && top[0] && x.r[0] !== top[0] ? (
              <HubLink
                to={{ kind: "prep", a: x.r[0], b: top[0] }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Match prep")}
              >
                {pct(v)}
              </HubLink>
            ) : (
              <span>{pct(v)}</span>
            )}
            <span className="h-1 w-10 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
              <span className={`block h-full rounded-full ${v >= 0.45 ? "bg-rw-teal/75" : "bg-rw-sub/55"}`} style={{ width: `${p}%` }} />
            </span>
          </span>
        );
      },
      className: "tabular-nums text-rw-sub",
    },
    {
      key: "games",
      label: tl("Games"),
      title: tl("Pro games rated"),
      value: (x) => x.r[7],
      render: (x) => {
        const w = Math.max(6, Math.min(100, Math.round(((x.r[7] || 0) / maxRowGames) * 100)));
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[2.75rem]">
            <HubLink
              to={{ kind: "finder", query: `team=${encodeURIComponent(x.r[0] || x.r[1])}` }}
              className="hover:text-rw-accent hover:underline"
              title={tl("Game finder")}
            >
              {fmtNum(x.r[7])}
            </HubLink>
            <span className="h-1 w-10 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-sub/55" style={{ width: `${w}%` }} />
            </span>
          </span>
        );
      },
      className: "tabular-nums text-rw-sub",
    },
    {
      key: "last",
      label: tl("Last game"),
      value: (x) => x.r[8],
      render: (x) => fmtDate(x.r[8]),
      className: "text-rw-muted",
    },
  ];
  const t = d.test;
  const saidCol = t.calibration.some((r) => r[4] != null);
  const series3 = t.series?.["3"] || [];
  const series5 = t.series?.["5"] || [];
  const seriesBins = [50, 60, 70, 80, 90].filter((lo) => series3.some((r) => r[0] === lo) || series5.some((r) => r[0] === lo));
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-2 text-xs`}>
        <h1 className="text-base font-bold text-rw-text">
          {tl("Power rankings")}
        </h1>
        <p className="text-rw-sub">
          {tl(
            "Every active pro team on one scale, across all regions. Ratings come from every pro game since 2011: beating a strong team moves you up more than beating a weak one, and international events are what compare the regions.",
          )}{" "}
          {tl("A team's rating mostly follows the five players it fields, so a roster change counts right away.")}
        </p>
        {d.live && (
          <p className="text-rw-teal">
            {tl("Includes {n} games played since the last stats update, added the moment they ended.", { n: d.live.games })}
          </p>
        )}
        <p className="text-rw-muted">
          {tl(
            "Up to {date} · {n} games rated · teams with a game in the last 120 days",
            { date: fmtDate(d.asof), n: fmtNum(d.games) },
          )}{" "}
          <span
            className="underline decoration-dotted cursor-help"
            title={tl(
              "The ratings learn from every game Leaguepedia lists, academy and second-tier leagues included, so this is more than the pro games counted on the stats pages.",
            )}
          >
            {tl("Why more games?")}
          </span>
        </p>
        {t.all.n > 0 && (
          <p className="text-rw-text">
            {tl(
              "How good is it? Since {year}, the higher-rated team won {acc} of {n} games ({intl} at international events).",
              {
                year: t.from.slice(0, 4),
                acc: pct(t.all.acc || 0),
                n: fmtNum(t.all.n),
                intl: pct(t.intl.acc || 0),
              },
            )}
          </p>
        )}
      </div>

      {topLeagueCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs" data-nocapture="1">
          {topLeagueCards.map((lc) => {
            const active = league === lc.l;
            return (
              <button
                key={lc.l}
                type="button"
                onClick={() => setLeague(active ? "" : lc.l)}
                title={lc.l}
                className={`rounded-xl border p-2.5 text-left transition-colors ${
                  active ? "border-rw-accent bg-rw-accent/15" : "border-rw-border bg-rw-surface hover:border-rw-accent/50"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-rw-text truncate">{lc.short}</span>
                  <span className="font-mono tabular-nums font-bold text-rw-accent">{lc.top4Avg}</span>
                </div>
                {lc.best && (
                  <div className="mt-1 text-[11px] text-rw-sub flex items-center gap-1 min-w-0">
                    <span className="shrink-0">#1</span>
                    <TeamLogo name={lc.best[1]} size={14} />
                    <span className="text-rw-text font-medium truncate">{lc.best[1]}</span>
                    <span className="text-rw-muted tabular-nums shrink-0">({lc.best[5]})</span>
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-rw-muted tabular-nums">
                  <span>{lc.minR}–{lc.maxR}</span>
                  <span>{lc.count} · {tl("Teams")}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Section
        title={tl("Power rankings")}
        share={`riftwise-power-rankings${oneLeague ? "-" + league : league === "*" ? "-all" : ""}`}
        right={
          <span
            className="flex flex-wrap items-center gap-2 text-xs"
            data-nocapture="1"
          >
            {histDates.length > 1 && (
              <select
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                aria-label={tl("Date")}
                className={sel}
              >
                <option value="">{fmtDate(d.asof)}</option>
                {histDates.map((dt) => (
                  <option key={dt} value={dt}>
                    {fmtDate(dt)}
                  </option>
                ))}
              </select>
            )}
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              aria-label={tl("League")}
              className={sel}
            >
              <option value="">{tl("Top leagues, all regions")}</option>
              <option value="*">{tl("All leagues (academies and second tiers too)")}</option>
              <optgroup label={tl("Top leagues")}>
                {leagues
                  .filter((x) => x.tier === 1)
                  .map(({ l }) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
              </optgroup>
              <optgroup label={tl("Second tier")}>
                {leagues
                  .filter((x) => x.tier !== 1)
                  .map(({ l }) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
              </optgroup>
            </select>
            {!oneLeague && (
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                aria-label={tl("Show")}
                className={sel}
              >
                {/* only sizes smaller than the list, then the whole list */}
                {[25, 50, 100]
                  .filter((n) => n < rows.length)
                  .map((n) => (
                    <option key={n} value={n}>
                      {tl("Top {n}", { n })}
                    </option>
                  ))}
                <option value={1000}>{tl("All {n} teams", { n: rows.length })}</option>
              </select>
            )}
            <BroadcastCardButton
              data={() =>
                rankingsCard({
                  title: tl("Power rankings"),
                  subtitle: [oneLeague ? league : league === "*" ? tl("All leagues") : tl("Top leagues, all regions"), asOf ? fmtDate(asOf) : null]
                    .filter(Boolean)
                    .join(" · "),
                  rows: rows.slice(0, 10).map(({ r }) => ({ name: r[1], league: r[10] || r[3], r: r[5], chg: r[6] })),
                })
              }
              name={`riftwise-power-rankings${oneLeague ? "-" + league : ""}${asOf ? "-" + asOf : ""}`}
              label={tl("Overview card")}
            />
            <CopyRankingsPost
              subtitle={[oneLeague ? league : league === "*" ? tl("All leagues") : tl("Top leagues, all regions"), asOf ? fmtDate(asOf) : fmtDate(d.asof)]
                .filter(Boolean)
                .join(" · ")}
              rows={rows}
              query={q.toString()}
            />
          </span>
        }
      >
        {oneLeague && (
          <p className="rw-capture-only text-xs text-rw-sub">{league}</p>
        )}
        {oneLeague && d.teams.find((r) => r[3] === league)?.[9] !== 1 && (
          <p className="text-[11px] text-rw-muted">
            {tl(
              "Second-tier leagues never play the top leagues, so their teams are ranked within their league; each year the league's average is set below its region's top league.",
            )}
          </p>
        )}
        <SortTable
          rows={rows}
          columns={columns}
          initial={{ key: "rank", desc: false }}
          rowKey={(x) => x.r[0]}
          limit={oneLeague ? undefined : limit}
          copyName={`riftwise-power-rankings${oneLeague ? "-" + league : league === "*" ? "-all" : ""}`}
        />
        {!league && (
          <p className="text-[11px] text-rw-muted" data-nocapture="1">
            {tl(
              "This list has the teams in top leagues, the only ones that meet across regions. Pick a second-tier league above (LCK CL, LFL, NACL...) to see its teams.",
            )}
          </p>
        )}
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title={tl("League strength")}
          share="riftwise-league-strength"
          right={
            <SectionCard
              section={tl("League strength")}
              name={tl("Power rankings")}
              sub={fmtDate(d.asof)}
              rows={() =>
                d.leagues.slice(0, 10).map(([l, , r, n]) => {
                  const best = d.teams.filter((t) => t[3] === l).sort((a, b) => b[5] - a[5])[0];
                  return {
                    label: l,
                    sub: best ? `#1 ${best[1]} (${best[5]}) · ${n} ${tl("Teams")}` : `${n} ${tl("Teams")}`,
                    value: String(r),
                  };
                })
              }
            />
          }
        >
          <p className="text-[11px] text-rw-muted">
            {tl("Average rating of each league's best four teams.")}
          </p>
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>{tl("League")}</th>
                  <th className={th}>#1</th>
                  <th className={`${th} text-right`}>{tl("Rating")}</th>
                  <th className={`${th} text-right`}>{tl("Teams")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const shownLeagues = d.leagues.slice(0, 20);
                  const maxLr = Math.max(1500, ...shownLeagues.map((x) => x[2]));
                  const minLr = Math.min(1200, ...shownLeagues.map((x) => x[2]));
                  return shownLeagues.map(([l, u, r, n], i) => {
                    const best = d.teams.filter((t) => t[3] === l).sort((a, b) => b[5] - a[5])[0];
                    const barW = Math.max(10, Math.min(100, Math.round(((r - minLr + 80) / Math.max(1, maxLr - minLr + 80)) * 100)));
                    return (
                      <tr key={l} className="border-t border-rw-border">
                        <td className={`${td} text-rw-muted`} data-sort={i + 1}>{i + 1}</td>
                        <td className={td} data-sort={l}>
                          {u ? (
                            <HubLink
                              to={{ kind: "league", slug: u }}
                              className="text-rw-text hover:text-rw-accent hover:underline"
                            >
                              {l}
                            </HubLink>
                          ) : (
                            l
                          )}
                        </td>
                        <td className={`${td} text-rw-sub max-w-[9rem] truncate`} data-sort={best ? best[1] : ""}>
                          {best ? (
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <TeamLogo name={best[1]} size={15} />
                              <TeamLink name={best[1]} u={best[0]} />
                            </span>
                          ) : (
                            "–"
                          )}
                        </td>
                        <td className={`${td} text-right`} data-sort={r}>
                          <div className="inline-flex flex-col items-end gap-0.5 min-w-[4.5rem]">
                            <span className="tabular-nums font-bold text-rw-accent">{r}</span>
                            <div className="w-full h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                              <div className="h-full rounded-full bg-rw-accent/75" style={{ width: `${barW}%` }} />
                            </div>
                          </div>
                        </td>
                        <td
                          className={`${td} text-right tabular-nums text-rw-sub`}
                          data-sort={n}
                        >
                          <button
                            type="button"
                            onClick={() => setLeague(league === l ? "" : l)}
                            className="hover:text-rw-accent hover:underline"
                            title={tl("Teams")}
                          >
                            {n}
                          </button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </STable>
          </div>
        </Section>

        <Section title={tl("How the chances hold up")}>
          <p className="text-[11px] text-rw-muted">
            {tl(
              "Every game since {year}, using only what was known before it: when we made a team the favourite by this much, how often it won.",
              {
                year: t.from.slice(0, 4),
              },
            )}
          </p>
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>{tl("Favourite's chance")}</th>
                  <th className={`${th} text-right`}>{tl("Games")}</th>
                  {saidCol && <th className={`${th} text-right`} title={tl("The chance we gave the favourite, on average")}>{tl("We said")}</th>}
                  <th className={`${th} text-right`}>{tl("Favourite won")}</th>
                </tr>
              </thead>
              <tbody>
                {t.calibration.map(([lo, hi, n, won, said]) => (
                  <tr key={lo} className="border-t border-rw-border">
                    <td className={td} data-sort={lo}>
                      {lo}–{Math.min(hi, 100)}%
                    </td>
                    <td
                      className={`${td} text-right tabular-nums text-rw-sub`}
                      data-sort={n}
                    >
                      {fmtNum(n)}
                    </td>
                    {saidCol && (
                      <td className={`${td} text-right tabular-nums text-rw-sub`} data-sort={said ?? -1}>
                        {said != null ? pct(said) : "–"}
                      </td>
                    )}
                    <td
                      className={`${td} text-right tabular-nums font-bold text-rw-text`}
                      data-sort={won}
                    >
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span className="hidden sm:inline-block w-10 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                          <span className="block h-full rounded-full bg-rw-teal/80" style={{ width: `${Math.max(6, Math.min(100, Math.round(won * 100)))}%` }} />
                        </span>
                        <span>{pct(won)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </STable>
          </div>
          {series3.length + series5.length > 0 && (
            <>
              <p className="text-[11px] text-rw-muted">
                {tl("Whole series since {year}: how often the favourite won the series (we said · it won · series).", {
                  year: t.from.slice(0, 4),
                })}
              </p>
              <div className="overflow-x-auto">
                <STable className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className={th}>{tl("Favourite's chance")}</th>
                      <th className={`${th} text-right`}>{tl("Best of 3")}</th>
                      <th className={`${th} text-right`}>{tl("Best of 5")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seriesBins.map((lo) => (
                      <tr key={lo} className="border-t border-rw-border">
                        <td className={td} data-sort={lo}>
                          {lo}–{lo + 10}%
                        </td>
                        {[series3, series5].map((rows, i) => {
                          const row = rows.find((r) => r[0] === lo);
                          return (
                            <td key={i} className={`${td} text-right tabular-nums text-rw-sub whitespace-nowrap`} data-sort={row ? row[3] : -1}>
                              {row ? (
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <span className="hidden sm:inline-block w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                                    <span className="block h-full rounded-full bg-rw-teal/80" style={{ width: `${Math.max(6, Math.min(100, Math.round(row[3] * 100)))}%` }} />
                                  </span>
                                  <span>
                                    {row[4] != null ? `${pct(row[4])} · ` : ""}
                                    <span className="font-bold text-rw-text">{pct(row[3])}</span>
                                    <span className="hidden sm:inline"> · {fmtNum(row[2])}</span>
                                  </span>
                                </span>
                              ) : (
                                "–"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </STable>
              </div>
            </>
          )}
          {t.cross && t.cross.n > 0 && t.cross.pred != null && t.cross.won != null && (
            <p className="text-[11px] text-rw-sub">
              {tl(
                "Top-league teams against second-tier teams ({n} games since {year}): we gave the top-league team {pred} on average, and it won {won}.",
                {
                  n: fmtNum(t.cross.n),
                  year: t.from.slice(0, 4),
                  pred: pct(t.cross.pred),
                  won: pct(t.cross.won),
                },
              )}
            </p>
          )}
          <p className="text-[11px] text-rw-muted">
            {tl(
              "A series is less certain than its games multiplied out: going by past series, a team at 60% per game wins about {bo3} of best-of-threes and {bo5} of best-of-fives.",
              {
                bo3: pct(seriesChance(0.6, 3, d.adjust)),
                bo5: pct(seriesChance(0.6, 5, d.adjust)),
              },
            )}
          </p>
        </Section>
      </div>
      <p className="text-[11px] text-rw-muted">
        {tn(
          "Ratings are a guide, not a prediction market: they know results and who played, not form or injuries, and a brand-new player starts close to their team's level. {n} active team is rated.",
          "Ratings are a guide, not a prediction market: they know results and who played, not form or injuries, and a brand-new player starts close to their team's level. {n} active teams are rated.",
          d.teams.length,
        )}
      </p>
    </div>
  );
};

const CopyRankingsPost: React.FC<{ subtitle: string; rows: { r: RatingRow; rank: number }[]; query?: string }> = ({ subtitle, rows, query }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines = [
      `${tl("Power rankings")} · ${subtitle}`,
      ...rows.slice(0, 5).map(({ r, rank }) => {
        const chg = r[6] != null && r[6] !== 0 ? ` (${r[6] > 0 ? `+${r[6]}` : r[6]})` : "";
        return `#${rank} ${r[1]} (${r[10] || r[3]}) — ${r[5]}${chg}`;
      }),
      hubShareUrl({ kind: "rankings", ...(query ? { query } : {}) }),
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
