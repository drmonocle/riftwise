/**
 * Power rankings: every active pro team on one scale across all regions (Elo over every pro game since 2011,
 * scripts/stats/ratings.py), league strength, and how often the higher-rated team actually won.
 * Address: /riftwise/stats/rankings
 */
import React, { useMemo, useState } from "react";
import { tl, tn } from "../../i18n";
import { loadRatings } from "../../hub/data";
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
  useLoad,
  usePageTitle,
} from "./ui";

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
  const [league, setLeague] = useState("");
  const [limit, setLimit] = useState(50);
  // all leagues: top-league teams on one scale; one league: its teams ranked within it
  const rows = useMemo(
    () =>
      d.teams
        .filter((r) => (league ? r[3] === league : r[9] === 1))
        .map((r, i) => ({ r, rank: i + 1 })),
    [d.teams, league],
  );
  const top = d.teams.find((r) => r[9] === 1) || d.teams[0];
  const leagues = useMemo(() => {
    const tier = new Map(d.teams.map((r) => [r[3], r[9]]));
    return [...tier.keys()]
      .filter(Boolean)
      .sort((a, b) => tier.get(a)! - tier.get(b)! || a.localeCompare(b))
      .map((l) => ({ l, tier: tier.get(l)! }));
  }, [d.teams]);
  type Row = { r: RatingRow; rank: number };
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
        <TeamLink
          name={x.r[1]}
          u={x.r[0]}
          className="text-rw-text hover:text-rw-accent hover:underline font-semibold"
        />
      ),
    },
    {
      key: "league",
      label: tl("League"),
      value: (x) => x.r[3],
      render: (x) =>
        x.r[4] ? (
          <HubLink
            to={{ kind: "league", slug: x.r[4] }}
            className="text-rw-sub hover:text-rw-accent hover:underline"
          >
            {x.r[3]}
          </HubLink>
        ) : (
          <span className="text-rw-sub">{x.r[3] || "–"}</span>
        ),
    },
    {
      key: "rating",
      label: tl("Rating"),
      value: (x) => x.r[5],
      className: "tabular-nums font-bold text-rw-accent",
    },
    {
      key: "chg",
      label: tl("30 days"),
      title: tl("Rating change over the last 30 days"),
      value: (x) => x.r[6],
      render: (x) => <Change v={x.r[6]} />,
      className: "tabular-nums",
    },
    {
      key: "vs1",
      label: tl("vs #1"),
      title: tl("Chance to beat the top team in one game"),
      value: (x) => x.r[5],
      render: (x) =>
        top ? pct(matchChance(x.r[5], top[5], chanceContext(x.r[9] === 1, top[9] === 1, x.r[3], top[3]), d.adjust)) : "–",
      className: "tabular-nums text-rw-sub",
    },
    {
      key: "games",
      label: tl("Games"),
      title: tl("Pro games rated"),
      value: (x) => x.r[7],
      render: (x) => fmtNum(x.r[7]),
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
        <h2 className="text-base font-bold text-rw-text">
          {tl("Power rankings")}
        </h2>
        <p className="text-rw-sub">
          {tl(
            "Every active pro team on one scale, across all regions. Ratings come from every pro game since 2011: beating a strong team moves you up more than beating a weak one, and international events are what compare the regions.",
          )}{" "}
          {tl("A team's rating mostly follows the five players it fields, so a roster change counts right away.")}
        </p>
        <p className="text-rw-muted">
          {tl(
            "Up to {date} · {n} games rated · teams with a game in the last 120 days",
            { date: fmtDate(d.asof), n: fmtNum(d.games) },
          )}
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

      <Section
        title={tl("Power rankings")}
        share={`riftwise-power-rankings${league ? "-" + league : ""}`}
        right={
          <span
            className="flex flex-wrap items-center gap-2 text-xs"
            data-nocapture="1"
          >
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              aria-label={tl("League")}
              className={sel}
            >
              <option value="">{tl("Top leagues, all regions")}</option>
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
            {!league && (
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
          </span>
        }
      >
        {league && (
          <p className="rw-capture-only text-xs text-rw-sub">{league}</p>
        )}
        {league && d.teams.find((r) => r[3] === league)?.[9] !== 1 && (
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
          limit={league ? undefined : limit}
          copyName={`riftwise-power-rankings${league ? "-" + league : ""}`}
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
        >
          <p className="text-[11px] text-rw-muted">
            {tl("Average rating of each league's best four teams.")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>{tl("League")}</th>
                  <th className={`${th} text-right`}>{tl("Rating")}</th>
                  <th className={`${th} text-right`}>{tl("Teams")}</th>
                </tr>
              </thead>
              <tbody>
                {d.leagues.slice(0, 20).map(([l, u, r, n], i) => (
                  <tr key={l} className="border-t border-rw-border">
                    <td className={`${td} text-rw-muted`}>{i + 1}</td>
                    <td className={td}>
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
                    <td
                      className={`${td} text-right tabular-nums font-bold text-rw-accent`}
                    >
                      {r}
                    </td>
                    <td
                      className={`${td} text-right tabular-nums text-rw-sub`}
                    >
                      {n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <table className="w-full text-xs">
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
                    <td className={td}>
                      {lo}–{Math.min(hi, 100)}%
                    </td>
                    <td
                      className={`${td} text-right tabular-nums text-rw-sub`}
                    >
                      {fmtNum(n)}
                    </td>
                    {saidCol && <td className={`${td} text-right tabular-nums text-rw-sub`}>{said != null ? pct(said) : "–"}</td>}
                    <td
                      className={`${td} text-right tabular-nums font-bold text-rw-text`}
                    >
                      {pct(won)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {series3.length + series5.length > 0 && (
            <>
              <p className="text-[11px] text-rw-muted">
                {tl("Whole series since {year}: how often the favourite won the series (we said · it won · series).", {
                  year: t.from.slice(0, 4),
                })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
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
                        <td className={td}>
                          {lo}–{lo + 10}%
                        </td>
                        {[series3, series5].map((rows, i) => {
                          const row = rows.find((r) => r[0] === lo);
                          return (
                            <td key={i} className={`${td} text-right tabular-nums text-rw-sub whitespace-nowrap`}>
                              {row ? (
                                <>
                                  {row[4] != null ? `${pct(row[4])} · ` : ""}
                                  <span className="font-bold text-rw-text">{pct(row[3])}</span>
                                  <span className="hidden sm:inline"> · {fmtNum(row[2])}</span>
                                </>
                              ) : (
                                "–"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
