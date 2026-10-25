/** The Records and Titles sections of the stats (split from StatsView so each is its own download). */
import React, { useEffect, useRef, useState } from "react";
import { BarChart3, Trophy, Swords, Medal, ArrowLeft, GitCompare, Home, CalendarRange, Layers, History, Database, TrendingUp, Flame, Crosshair } from "lucide-react";
import { AppSettings, Match, CatalogData } from "../../types";
import { IS_WEB } from "../../platform";
import {
  StatsMeta,
  INTERNATIONAL_KINDS,
  loadStatsMeta,
} from "../../stats";
import { tl, tk, tc, eventTitle, fmtDec } from "../../i18n";
import { champName, useChampionNames } from "../../champions";
import { loadHubMeta, loadHubRecords, loadHubTitles, loadRecordsYear } from "../../hub/data";
import type { HubRecords, HubTitle } from "../../hub/types";
import {
  CompareRoute,
  HubRoute,
  PrepRoute,
  canGoBack,
  hubBack,
  hubShareUrl,
  navigateHub,
  useHubRoute,
} from "../../hub/route";
import {
  card,
  ChampIcon,
  CopyLinkButton,
  EventLink,
  Failed,
  fmtDate,
  fmtNum,
  HubLink,
  Loading,
  Page,
  PlayerLink,
  RevealButton,
  Section,
  SpoilerProvider,
  td,
  th,
  TeamLink,
  useHidden,
  useLoad,
  usePageTitle,
  CaptureContext,
  OpenUrlContext,
} from "./ui";

import { STable } from "../STable";

/** Every pro pentakill: the players with the most, and the newest (spoiler mode hides fresh ones). */
/**
 * Career totals with a choice of games: every pro game (what player pages and storylines count) or only the top leagues
 * and international events (older builds have only those).
 */
const CareerRecords: React.FC<{
  r: HubRecords;
  list: (title: string, rows: HubRecords["career"]["games"]) => React.ReactNode;
}> = ({ r, list }) => {
  const [all, setAll] = useState(true);
  const c = all && r.careerAll ? r.careerAll : r.career;
  const pill = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-semibold border ${on ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rw-text">{tl("Career totals")}</h3>
        {r.careerAll && (
          <div className="flex gap-1" role="group" aria-label={tl("Games counted")}>
            <button type="button" className={pill(all)} aria-pressed={all} onClick={() => setAll(true)}>
              {tl("All pro games")}
            </button>
            <button type="button" className={pill(!all)} aria-pressed={!all} onClick={() => setAll(false)}>
              {tl("Top leagues & internationals")}
            </button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-rw-muted">
        {all && r.careerAll
          ? tl("Every pro game except All-Star and show matches, like the player pages.")
          : tl("Only top leagues and international events (Worlds, MSI, First Stand).")}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {list(tl("Most pro games"), c.games)}
        {list(tl("Most career kills"), c.kills)}
        {list(tl("Most career assists"), c.assists)}
        {list(tl("Biggest champion pools"), c.pool)}
      </div>
    </div>
  );
};

/** file name of a records card: "records-fastest-wins" */
const shareName = (title: string) => "records-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const PentakillRecords: React.FC<{ p: NonNullable<HubRecords["pentas"]> }> = ({
  p,
}) => {
  const [n, setN] = useState(15);
  return (
    <>
      <Section title={tl("Most pentakills")} share="records-most-pentakills">
        <ol className="text-xs space-y-1.5">
          {p.most.map((x, i) => (
            <li key={i} className="flex justify-between gap-2 min-w-0">
              <PlayerLink name={x.n} u={x.u} />
              <span className="text-rw-accent font-bold">{x.v}</span>
            </li>
          ))}
        </ol>
        <p className="text-[10px] text-rw-muted">
          {tl(
            "{n} pentakills recorded by Leaguepedia. Complete from 2018 on; earlier years only partly, so older players are undercounted.",
            {
              n: fmtNum(p.total),
            },
          )}
        </p>
      </Section>
      <Section title={tl("Latest pentakills")} share="records-latest-pentakills">
        <ol className="text-xs space-y-1.5">
          {p.recent.slice(0, n).map((x, i) => (
            <PentaRow key={i} x={x} />
          ))}
        </ol>
        {p.recent.length > n && (
          <button
            type="button"
            onClick={() => setN((v) => v + 30)}
            className="text-xs text-rw-teal hover:underline"
          >
            {tl("Show more ({n} left)", { n: p.recent.length - n })}
          </button>
        )}
      </Section>
    </>
  );
};

const PentaRow: React.FC<{
  x: NonNullable<HubRecords["pentas"]>["recent"][number];
}> = ({ x }) => {
  const [hidden, reveal] = useHidden(`penta:${x.g}:${x.n}`, x.date);
  return (
    <li className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <>
            <ChampIcon name={x.c} size={18} />
            <span className="truncate">
              <PlayerLink name={x.n} u={x.u} />{" "}
              <span className="text-rw-sub">{champName(x.c)}</span>
              {x.x > 1 && <span className="text-rw-accent"> ×{x.x}</span>}{" "}
              {x.g ? (
                <HubLink
                  to={{ kind: "match", slug: x.g, game: x.gn }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {x.a} vs {x.b}
                </HubLink>
              ) : (
                <span className="text-rw-sub">
                  {x.a} vs {x.b}
                </span>
              )}
            </span>
          </>
        )}
      </div>
      <div className="text-[10px] text-rw-muted truncate">
        <EventLink
          name={x.t}
          u={x.e}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        />{" "}
        · {fmtDate(x.date)}
      </div>
    </li>
  );
};

/** Minutes as m:ss (records are kept to the second) */
const mmss = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
// ── Records ───────────────────────────────────────────────────────────────

export const RecordsPanel: React.FC = () => {
  usePageTitle(tl("Records"));
  const state = useLoad<HubRecords>(loadHubRecords, []);
  // all time, or one year (its own file; team streaks, titles and career totals are all-time only)
  const [year, setYear] = useState("all");
  const yearState = useLoad(() => (year === "all" ? Promise.resolve(null) : loadRecordsYear(year)), [year]);
  return (
    <Page state={state}>
      {(all) => {
        const y = year !== "all" ? yearState.data : null;
        const r: HubRecords = y ? { ...all, game: y.game, player: y.player, pentas: y.pentas } : all;
        const yearPick = all.years && all.years.length > 0 && (
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label={tl("Year")}
            className="bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text"
          >
            <option value="all">{tl("All time")}</option>
            {all.years.map((yy) => (
              <option key={yy} value={yy}>
                {yy}
              </option>
            ))}
          </select>
        );
        const gameList = (
          title: string,
          rows: HubRecords["game"]["fastest"],
          fmt: (v: number) => string,
        ) => (
          <Section title={title} share={shareName(title)}>
            <ol className="text-xs space-y-1.5">
              {rows.map((g, i) => (
                <li key={i} className="min-w-0">
                  <div className="truncate">
                    <span className="text-rw-accent font-bold mr-1">
                      {fmt(g.v)}
                    </span>
                    {g.g ? (
                      <HubLink to={{ kind: "match", slug: g.g, game: g.gn }}>
                        {tl("{w} beat {l}", {
                          w: g.w,
                          l: g.w === g.a ? g.b : g.a,
                        })}
                      </HubLink>
                    ) : (
                      <span className="text-rw-text">
                        {tl("{w} beat {l}", {
                          w: g.w,
                          l: g.w === g.a ? g.b : g.a,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-rw-muted truncate">
                    <EventLink
                      name={g.t}
                      u={g.e}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    />{" "}
                    · {fmtDate(g.date)}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        );
        const playerList = (
          title: string,
          rows: HubRecords["player"]["kills"],
          fmt: (v: number) => string = fmtNum,
        ) => (
          <Section title={title} share={shareName(title)}>
            <ol className="text-xs space-y-1.5">
              {rows.map((p, i) => (
                <li key={i} className="min-w-0">
                  <div className="truncate">
                    <span className="text-rw-accent font-bold mr-1">
                      {fmt(p.v)}
                    </span>
                    <PlayerLink name={p.pl} u={p.u} />
                    <span className="text-rw-sub">
                      {" "}
                      {champName(p.c)}{" "}
                      {p.g ? (
                        <HubLink
                          to={{ kind: "match", slug: p.g, game: p.gn }}
                          className="text-rw-sub hover:text-rw-accent hover:underline"
                        >
                          {p.kda}
                        </HubLink>
                      ) : (
                        p.kda
                      )}
                    </span>
                  </div>
                  <div className="text-[10px] text-rw-muted truncate">
                    vs {p.opp} ·{" "}
                    <EventLink
                      name={p.t}
                      u={p.e}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    />{" "}
                    · {fmtDate(p.date)}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        );
        const careerList = (
          title: string,
          rows: HubRecords["career"]["games"],
        ) => (
          <Section title={title} share={shareName(title)}>
            <ol className="text-xs space-y-1.5">
              {rows.map((p, i) => (
                <li key={i} className="flex justify-between gap-2 min-w-0">
                  <PlayerLink name={p.pl} u={p.u} />
                  <span className="text-rw-accent font-bold">
                    {fmtNum(p.v)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        );
        return (
          <CaptureContext.Provider value={year === "all" ? tl("All-time pro records") : tl("{year} records", { year })}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-lg font-bold text-rw-text">{year === "all" ? tl("Records") : tl("{year} records", { year })}</h1>
              {yearPick}
            </div>
            {year !== "all" && yearState.loading && <Loading />}
            <p className="text-[11px] text-rw-muted">
              {tl(
                "Top leagues and international events only. Games shorter than 14 minutes are skipped, and a game only counts when its numbers agree across Leaguepedia's tables.",
              )}{" "}
              {tl("The top records were checked against Leaguepedia.")}
            </p>
            <div className="grid gap-3 md:grid-cols-2 5xl:grid-cols-3">
              {gameList(tl("Fastest wins"), r.game.fastest, mmss)}
              {gameList(tl("Longest games"), r.game.longest, mmss)}
              {gameList(tl("Most kills in a game"), r.game.bloodiest, (v) =>
                tl("{n} kills", { n: v }),
              )}
              {gameList(
                tl("Won with the biggest gold deficit (end of game)"),
                r.game.comebacks,
                (v) => `${fmtDec(v / 1000)}k`,
              )}
              {playerList(tl("Most kills by one player"), r.player.kills)}
              {playerList(tl("Most assists by one player"), r.player.assists)}
              {playerList(
                tl("Best deathless games (kills + assists)"),
                r.player.perfect,
              )}
              {playerList(tl("Most damage in a game"), r.player.dmg)}
              {playerList(tl("Most CS in a game"), r.player.cs)}
              {r.pentas && r.pentas.recent.length > 0 && (
                <PentakillRecords p={r.pentas} />
              )}
              {year === "all" && (
              <Section title={tl("Longest win streaks")} share="records-longest-win-streaks">
                <ol className="text-xs space-y-1.5">
                  {r.team.streaks.map((t, i) => (
                    <li key={i} className="flex justify-between gap-2 min-w-0">
                      <TeamLink name={t.team} u={t.u} />
                      <span className="text-rw-muted">
                        <span className="text-rw-accent font-bold">
                          {tl("{n} games", { n: t.v })}
                        </span>{" "}
                        · {tl("ended {date}", { date: fmtDate(t.date) })}
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
              )}
              {year === "all" && (
              <Section
                title={tl(
                  "Most international titles (Worlds, MSI, First Stand)",
                )}
                share="records-most-international-titles"
              >
                <ol className="text-xs space-y-1.5">
                  {r.team.titles.map((t, i) => (
                    <li key={i} className="flex justify-between gap-2 min-w-0">
                      <TeamLink name={t.team} u={t.u} />
                      <span className="text-rw-muted">
                        {t.worlds
                          ? tl("{n} Worlds", { n: t.worlds }) + " · "
                          : ""}
                        <span className="text-rw-accent font-bold">
                          {tl("{n} total", { n: t.v })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
              )}
            </div>
            {year === "all" && <CareerRecords r={r} list={careerList} />}
          </div>
          </CaptureContext.Provider>
        );
      }}
    </Page>
  );
};

// ── Titles ────────────────────────────────────────────────────────────────


const TITLE_FILTERS = [
  { key: "International", label: tk("Worlds, MSI & First Stand") },
  { key: "Worlds", label: tk("Worlds") },
  { key: "Leagues", label: tk("League titles") },
  { key: "All", label: tk("Everything") },
] as const;

export const TitlesPanel: React.FC = () => {
  usePageTitle(tl("Titles"));
  const state = useLoad<HubTitle[]>(loadHubTitles, []);
  const [kind, setKind] =
    useState<(typeof TITLE_FILTERS)[number]["key"]>("International");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {TITLE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKind(f.key)}
            className={`px-2.5 py-1.5 rounded-lg border ${
              kind === f.key
                ? "bg-rw-accent text-rw-bg font-bold border-rw-accent"
                : "border-rw-border text-rw-sub"
            }`}
          >
            {tl(f.label)}
          </button>
        ))}
      </div>
      <Page state={state}>
        {(data) => {
          const rows = data
            .filter((x) =>
              kind === "All"
                ? true
                : kind === "International"
                  ? INTERNATIONAL_KINDS.includes(x.kind)
                  : kind === "Worlds"
                    ? x.kind === "Worlds"
                    : x.kind === "Regional",
            )
            .slice(0, 300);
          return (
            <div className={`${card} overflow-x-auto`}>
              <STable className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={th}>{tl("Event")}</th>
                    <th className={th}>{tc("title winner", "Champion")}</th>
                    <th className={th}>{tc("title match", "Final")}</th>
                    <th className={th}>{tl("Date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => (
                    <tr
                      key={x.t + x.date}
                      className="border-t border-rw-border"
                    >
                      <td className={`${td} max-w-[14rem] truncate`}>
                        <Trophy
                          className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-rw-accent" : "text-rw-muted"}`}
                        />
                        <EventLink name={eventTitle(x.t)} u={x.e} />
                      </td>
                      <td className={td}>
                        <TeamLink name={x.as} u={x.u} />
                        {x.as !== x.w && (
                          <span className="text-rw-muted text-[10px]">
                            {" "}
                            ({tl("now {team}", { team: x.w })})
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-rw-sub`}>
                        {x.score} vs {x.l}
                      </td>
                      <td className={`${td} text-rw-muted`} data-sort={x.date}>
                        {fmtDate(x.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </STable>
            </div>
          );
        }}
      </Page>
    </div>
  );
};
