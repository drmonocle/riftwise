/**
 * Tournament page, in tabs when it has enough to show (each its own address, /tournament/<slug>/<tab>): Overview
 * (results and prize money, the bracket, standings), Matches (every series by stage), Stats (leaders, player and team
 * tables, the stat cards), Champions and Teams (rosters).
 */
import React, { useMemo, useState } from "react";
import { Trophy, MapPin, CalendarDays, Coins, Download, Sparkles } from "lucide-react";
import { downloadEventCsv, downloadStagesCsv } from "./DownloadsPage";
import { BracketBoard, type BracketColumn } from "../BracketBoard";
import { localCountry } from "./CountryFlag";
import { tl, tn, tk, regionName, stageLabel, eventTitle } from "../../i18n";
import { winRate } from "../../stats";
import { loadHubEvent } from "../../hub/data";
import type { HubEvent, SeriesRow, Stage, StandingRow } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { EventPlayerStats, EventTeamStatsTable } from "./EventTables";
import { EventFacts, EventRosters, RegionalRecords } from "./EventExtras";
import { EventStatsSection } from "./EventStats";
import { PlayoffChances } from "./PlayoffChances";
import { eventCardData } from "./BroadcastCard";
import {
  card,
  ChampLink,
  EventLink,
  fmtDate,
  fmtNum,
  fmtUsd,
  HubLink,
  Page,
  PlayerLink,
  RevealButton,
  Section,
  Stat,
  td,
  th,
  TeamLink,
  useHidden,
  useHiddenCheck,
  useLoad,
  usePageTitle,
} from "./ui";
import { ratingTextClass } from "./BestPage";
import { STable } from "../STable";
import { JumpBar, PageTabs, type JumpItem, type PageTab } from "./PageTabs";
import type { HubRoute } from "../../hub/route";

/** The Stats tab's parts, for its "jump to" row (JumpBar leaves out the ones a tournament doesn't have) */
const STATS_JUMPS: JumpItem[] = [
  { id: "jump-leaders", label: tk("Player leaders") },
  { id: "jump-pstats", label: tk("Players") },
  { id: "jump-tstats", label: tk("Teams") },
  { id: "facts-event", label: tk("The event") },
  { id: "facts-teams", label: tk("Team records") },
  { id: "facts-players", label: tk("Player records") },
  { id: "facts-champs", label: tk("Champions and the draft") },
  { id: "jump-regions", label: tk("Region vs region") },
];

/** The tabs' names (the address says the key: /tournament/worlds-2026-main-event/stats) */
const TAB_LABEL: Record<string, string> = {
  "": tk("Overview"),
  matches: tk("Matches"),
  stats: tk("Stats"),
  champions: tk("Champions"),
  teams: tk("Teams"),
};

export const EventPage: React.FC<{ slug: string; tab?: string; onOpenUrl?: (url: string) => void }> = ({ slug, tab, onOpenUrl }) => {
  const state = useLoad(() => loadHubEvent(slug), [slug]);
  usePageTitle(state.data ? (tab && TAB_LABEL[tab] ? `${state.data.n} · ${tl(TAB_LABEL[tab])}` : state.data.n) : undefined);
  useDDragon();
  return <Page state={state}>{(e) => <EventView e={e} tab={tab || ""} onOpenUrl={onOpenUrl} />}</Page>;
};

/** Worlds, MSI and First Stand have a page of their own (facts, pickers): the league -> its section */
const INTL_PAGE: Record<string, "worlds" | "msi" | "first-stand"> = {
  "world-championship": "worlds",
  "mid-season-invitational": "msi",
  "first-stand": "first-stand",
};

const EventView: React.FC<{ e: HubEvent; tab: string; onOpenUrl?: (url: string) => void }> = ({ e, tab: asked, onOpenUrl }) => {
  const [resultsHidden, revealResults] = useHidden(`event:${e.u}`, e.end);
  const lists = (e.stages || []).filter((s) => s.kind === "list");
  // the tabs this tournament has something for; one with two parts or fewer stays one page
  const tabs: PageTab[] = [
    { key: "", label: TAB_LABEL[""] },
    ...(lists.length ? [{ key: "matches", label: TAB_LABEL.matches, count: e.series }] : []),
    ...((e.leaders && Object.keys(e.leaders).length) || e.players?.length || e.teamStats?.length || e.ln || e.regions?.length
      ? [{ key: "stats", label: TAB_LABEL.stats }]
      : []),
    ...(e.champs?.length ? [{ key: "champions", label: TAB_LABEL.champions }] : []),
    ...(e.teams?.length || e.rosters?.length ? [{ key: "teams", label: TAB_LABEL.teams, count: e.teams?.length }] : []),
  ];
  const tabbed = tabs.length >= 3;
  const tab = tabbed && tabs.some((t) => t.key === asked) ? asked : "";
  /** is this part on the open tab (everything is, on a one-page tournament) */
  const on = (key: string) => !tabbed || tab === key;
  const to = (key: string): HubRoute => ({ kind: "event", slug: e.u, ...(key ? { tab: key } : {}) });
  return (
    <div>
      <div className={`${card} mb-3`}>
        {e.parent && (
          <p className="text-[11px] text-rw-muted mb-1">
            {tl("Part of")} <EventLink name={e.parent.n} u={e.parent.u} className="text-rw-accent hover:underline" />
          </p>
        )}
        <h1 className="text-lg font-bold text-rw-text">{e.n}</h1>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-rw-sub mt-1">
          {(e.start || e.end) && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {fmtDate(e.start)}
              {e.end && e.end !== e.start ? ` – ${fmtDate(e.end)}` : ""}
            </span>
          )}
          {e.league &&
            (e.lu ? (
              <HubLink to={{ kind: "league", slug: e.lu }} className="text-rw-sub hover:text-rw-accent hover:underline">
                {e.league}
              </HubLink>
            ) : (
              <span>{e.league}</span>
            ))}
          {e.region && <span>{regionName(e.region, e.region)}</span>}
          {(e.country || e.type) && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {[localCountry(e.country), e.type === "Online" ? tl("Online") : e.type === "Offline" ? tl("On stage") : e.type].filter(Boolean).join(" · ")}
            </span>
          )}
          {e.prize && (
            <span className="flex items-center gap-1">
              <Coins className="w-3 h-3" />
              {tl("Prize pool {amount}", { amount: e.prize })}
            </span>
          )}
        </div>
        {(e.siblings?.length || 0) > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {e.siblings!.map((s) => (
              <HubLink
                key={s.u}
                to={{ kind: "event", slug: s.u }}
                className={`px-2.5 py-1 rounded-lg text-xs border ${
                  s.u === e.u ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
                }`}
              >
                {s.n}
              </HubLink>
            ))}
          </div>
        )}
        {INTL_PAGE[e.lu || ""] && (
          <HubLink
            to={{ kind: INTL_PAGE[e.lu as string], year: e.year || undefined }}
            className="mt-2 inline-flex items-center gap-1 text-xs text-rw-teal hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {tl("Stats and pickers for {event}", { event: eventTitle((e.parent?.n || e.n).replace(/ (Main Event|Play-In)$/, "")) })}
          </HubLink>
        )}
        {(e.games || 0) > 0 && (
          <div className="grid grid-cols-3 rw-stats mt-3">
            <Stat label={tl("Games")} value={fmtNum(e.games || 0)} sub={e.statsGames ? tl("{n} with full stats", { n: fmtNum(e.statsGames) }) : undefined} />
            <Stat label={tl("Series")} value={fmtNum(e.series || 0)} />
            <Stat label={tl("Teams")} value={e.teams?.length || "–"} />
          </div>
        )}
        {(e.games || 0) > 0 && (
          <button
            type="button"
            onClick={() =>
              (e.whole && e.children?.length
                ? downloadStagesCsv(e.u, e.children.map((c) => c.u), onOpenUrl)
                : downloadEventCsv(e.u, onOpenUrl)
              ).catch(() => {})
            }
            className="mt-2 flex items-center gap-1 text-[11px] text-rw-teal hover:underline"
          >
            <Download className="w-3 h-3" />
            {tl("Download every game (CSV)")}
          </button>
        )}
      </div>

      {tabbed && <PageTabs tabs={tabs} active={tab} to={to} below={tab === "stats" ? <JumpBar bare items={STATS_JUMPS} /> : undefined} />}
      <div className={`rw-page ${tabbed ? "mt-3" : ""}`}>
      {/* what most people open a tournament for comes first (TV, 2026-10-28): the bracket and standings, then the
          results and prize money, then the facts */}
      {on("") && <EventBracketBlock e={e} />}

      {on("") && e.results && e.results.length > 0 && (
        <Section
          title={e.resultsFrom === "event" ? tl("Final standings (whole event)") : tl("Final standings")}
          right={resultsHidden ? <RevealButton onReveal={revealResults} small /> : undefined}
        >
          {resultsHidden ? (
            <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <STable className="w-full text-xs">
              <tbody>
                {e.results.slice(0, 32).map((r, i) => (
                  <tr key={i} className="border-t border-rw-border first:border-0">
                    <td className={`${td} w-12 font-bold ${r.p === "1" ? "text-rw-accent" : "text-rw-sub"}`}>
                      {r.p === "1" && <Trophy className="w-3 h-3 inline mr-1" />}
                      {r.p}
                    </td>
                    <td className={td}>
                      <TeamLink name={r.t} u={r.u} />
                    </td>
                    <td className={`${td} text-right text-rw-muted`} data-sort={r.usd || 0}>{r.usd ? fmtUsd(r.usd) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </STable>
          )}
        </Section>
      )}

      {on("") && e.overview && (
        <EventFacts
          o={e.overview}
          hidden={resultsHidden}
          card={{
            name: `${e.u}-overview`,
            data: () =>
              eventCardData({
                name: eventTitle(e.n),
                when: [e.start && fmtDate(e.start), e.end && e.end !== e.start && fmtDate(e.end)].filter(Boolean).join(" – ") || undefined,
                // the podium: the final standings' top three (one team per place)
                podium: (e.results || []).filter((r) => ["1", "2", "3"].includes(r.p)).sort((x, y) => Number(x.p) - Number(y.p)).map((r) => r.t).slice(0, 3),
                o: e.overview!,
              }),
          }}
        />
      )}

      {on("matches") && lists.length > 0 && (
        <div className="rw-span">
          <StageLists stages={lists} />
        </div>
      )}

      {on("") && e.children && e.children.length > 0 && (
        <Section title={tl("Stages")}>
          <ul className="text-xs space-y-1">
            {e.children.map((c) => (
              <li key={c.u}>
                <EventLink name={c.n} u={c.u} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* the leaders' game counts tell who went deep: hidden with the results */}
      {on("stats") && e.leaders && Object.keys(e.leaders).length > 0 && !resultsHidden && (
        <div id="jump-leaders" className="rw-span">
          <Leaders e={e} />
        </div>
      )}

      {/* wide tables: the whole page width on multi-column screens (the ids: the Stats tab's "jump to" row) */}
      {on("stats") && (
        <div className="rw-span space-y-3">
          {!!e.players?.length && !resultsHidden && (
            <div id="jump-pstats">
              <EventPlayerStats e={e} hidden={resultsHidden} />
            </div>
          )}
          {!!e.teamStats?.length && !resultsHidden && (
            <div id="jump-tstats">
              <EventTeamStatsTable e={e} hidden={resultsHidden} />
            </div>
          )}
          {/* the stats cards (records, objectives, the draft...) from every game's scoreboard */}
          {e.ln && !resultsHidden ? <EventStatsSection slug={e.u} name={eventTitle(e.n)} end={e.end} /> : null}
        </div>
      )}
      {on("stats") && !!e.regions?.length && !resultsHidden && (
        <div id="jump-regions" className="rw-span">
          <RegionalRecords e={e} hidden={resultsHidden} />
        </div>
      )}
      {tabbed && tab === "stats" && resultsHidden && (
        <p className="text-xs text-rw-sub flex items-center gap-2">
          {tl("Hidden while spoiler mode is on.")} <RevealButton onReveal={revealResults} />
        </p>
      )}

      {((on("champions") && e.champs && e.champs.length > 0) || (on("teams") && e.teams && e.teams.length > 0)) && (
        <div className={`${tabbed && tab === "champions" ? "rw-span " : ""}grid gap-3 md:grid-cols-2`}>
          {on("champions") && e.champs && e.champs.length > 0 && <EventChamps e={e} />}
          {on("teams") && e.teams && e.teams.length > 0 && (
            <Section title={tl("Teams")}>
              <STable className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={th}>{tl("Team")}</th>
                    <th className={th}>{tl("Series")}</th>
                    <th className={th}>{tl("Games")}</th>
                  </tr>
                </thead>
                <tbody>
                  {e.teams.map((t) => (
                    <tr key={t.t} className="border-t border-rw-border">
                      <td className={`${td} max-w-[12rem] truncate`}>
                        <TeamLink name={t.t} u={t.u} />
                      </td>
                      <td className={`${td} text-rw-sub`}>{resultsHidden ? "–" : `${t.sw}-${t.sg - t.sw}`}</td>
                      <td className={`${td} text-rw-sub`}>{resultsHidden ? "–" : `${t.w}-${t.g - t.w}`}</td>
                    </tr>
                  ))}
                </tbody>
              </STable>
            </Section>
          )}
        </div>
      )}
      {on("teams") && e.rosters && e.rosters.length > 0 && <EventRosters rosters={e.rosters} />}
      </div>
    </div>
  );
};

// ── Series boxes ──────────────────────────────────────────────────────────

/** One series as two team lines with scores; links to its match page. */
const seriesKey = (r: SeriesRow) => `series:${r.g || r.a + r.b + r.date}`;

export const SeriesBox: React.FC<{ r: SeriesRow; hideResult?: boolean; note?: React.ReactNode; compact?: boolean }> = ({ r, hideResult, note, compact }) => {
  const [hiddenBySpoiler, reveal] = useHidden(seriesKey(r), r.date);
  const hidden = hideResult || hiddenBySpoiler;
  const played = r.sa != null && r.sb != null;
  const line = (name: string, u: string | null, score: number | null, won: boolean) => (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className={`truncate ${!hidden && won ? "text-rw-text font-bold" : "text-rw-sub"}`}>
        <TeamLink name={name} u={u} className={!hidden && won ? "text-rw-text font-bold hover:underline" : "text-rw-sub hover:text-rw-text hover:underline"} />
      </span>
      <span className={`tabular-nums font-bold ${!hidden && won ? "text-rw-teal" : "text-rw-muted"}`}>{played ? (hidden ? "?" : score) : ""}</span>
    </div>
  );
  return (
    <div className={`bg-rw-bg border border-rw-border rounded-lg ${compact ? "px-2 py-1" : "px-2.5 py-1.5"} text-xs min-w-0`}>
      {line(r.a, r.au, r.sa, r.w === 1)}
      {line(r.b, r.bu, r.sb, r.w === 2)}
      <div className="flex items-center justify-between gap-2 mt-0.5 text-[10px] text-rw-muted">
        <span className="truncate">{note ?? fmtDate(r.date, false)}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {hiddenBySpoiler && !hideResult && played && <RevealButton onReveal={reveal} small />}
          {!hidden && r.r != null && (
            <span className={`tabular-nums font-semibold ${ratingTextClass(r.r)}`} title={tl("Series rating: mostly its best game, then its other games")}>
              {r.r.toFixed(0)}
            </span>
          )}
          {r.g && !hideResult && (
            <HubLink to={{ kind: "match", slug: r.g }} className="text-rw-teal hover:underline">
              {tl("Details")}
            </HubLink>
          )}
        </span>
      </div>
    </div>
  );
};

/**
 * A tournament's bracket and standings, as far as it has them: its own knockout rounds and tables (with each team's
 * chances while a league table is still being played), else its stages' (ChildStages). The top of a tournament's
 * Overview, and of the Worlds, MSI and First Stand pages in the years their pickers don't cover.
 */
export const EventBracketBlock: React.FC<{ e: HubEvent }> = ({ e }) => {
  const st = e.stages || [];
  const bracket = st.filter((s) => s.kind === "bracket");
  const tables = e.standings || [];
  return (
    <>
      {bracket.length > 0 && <Bracket stages={bracket} />}
      {tables.length > 0 && (
        <div className={`grid gap-3 ${tables.length > 1 ? "md:grid-cols-2" : ""}`}>
          {tables.map((t, i) => (
            <Standings key={i} name={t.name === "Standings" ? tl("Standings") : tl("Group {name}", { name: t.name.replace(/^Group /, "") })} rows={t.rows} end={e.end} />
          ))}
        </div>
      )}
      {/* a league table still being played: each team's chance of first place and of a top-N finish */}
      <PlayoffChances e={e} />
      {!!e.children?.length && !bracket.length && !st.some((s) => s.kind === "list") && !tables.length && <ChildStages kids={e.children} />}
    </>
  );
};

/**
 * The stages of a whole event (Play-In, Swiss, Main Event...) on the parent's page: pick a stage, see its bracket,
 * standings and series. Starts on the newest stage that has a bracket (the knockouts), else the newest stage.
 */
const ChildStages: React.FC<{ kids: { n: string; u: string }[] }> = ({ kids }) => {
  const state = useLoad(() => Promise.all(kids.map((k) => loadHubEvent(k.u).catch(() => null))), [kids.map((k) => k.u).join()]);
  const loaded = (state.data || []).filter((x): x is HubEvent => !!x && !!((x.stages && x.stages.length) || (x.standings && x.standings.length)));
  const start = useMemo(() => {
    const withBracket = loaded.map((x, i) => ((x.stages || []).some((st) => st.kind === "bracket") ? i : -1)).filter((i) => i >= 0);
    return withBracket.length ? withBracket[withBracket.length - 1] : loaded.length - 1;
  }, [loaded]);
  const [pick, setPick] = useState<number | null>(null);
  if (!loaded.length) return null;
  const i = Math.min(pick ?? start, loaded.length - 1);
  const x = loaded[i];
  const st = x.stages || [];
  const b = st.filter((s) => s.kind === "bracket");
  const l = st.filter((s) => s.kind === "list");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-[10px] font-semibold text-rw-muted mr-1">{tl("Stages")}</span>
        {loaded.map((k, j) => (
          <button
            key={k.u}
            type="button"
            onClick={() => setPick(j)}
            className={`px-2.5 py-1.5 min-h-8 rounded border ${j === i ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
          >
            {k.n}
          </button>
        ))}
        <EventLink name={tl("Open {stage}", { stage: x.n })} u={x.u} className="ml-auto text-rw-teal hover:underline" />
      </div>
      {b.length > 0 && <Bracket key={x.u} stages={b} />}
      {x.standings && x.standings.length > 0 && (
        <div className={`grid gap-3 ${x.standings.length > 1 ? "md:grid-cols-2" : ""}`}>
          {x.standings.map((t, k) => (
            <Standings key={k} name={t.name === "Standings" ? tl("Standings") : tl("Group {name}", { name: t.name.replace(/^Group /, "") })} rows={t.rows} end={x.end} />
          ))}
        </div>
      )}
      {l.length > 0 && <StageLists key={x.u} stages={l} />}
    </div>
  );
};

/** Knockout rounds as bracket columns (quarterfinals → semifinals → final), joined by lines. */
export const Bracket: React.FC<{ stages: Stage[]; hide?: (r: SeriesRow) => boolean; note?: (r: SeriesRow) => React.ReactNode; title?: string }> = ({
  stages,
  hide,
  note,
  title,
}) => {
  const hiddenNow = useHiddenCheck();
  const columns: BracketColumn[] = stages.map((st) => ({
    key: st.name,
    title: stageLabel(st.name),
    items: st.series.map((r, i) => {
      const shown = !hide?.(r) && !hiddenNow(seriesKey(r), r.date);
      return {
        key: `${st.name}-${i}`,
        teams: [r.a, r.b],
        winner: shown ? (r.w === 1 ? r.a : r.w === 2 ? r.b : null) : null,
        node: <SeriesBox r={r} hideResult={hide?.(r)} note={note?.(r)} compact />,
      };
    }),
  }));
  // four rounds or more need the whole page width (half of a two-column page made them scroll sideways)
  return (
    <div className={columns.length >= 4 ? "rw-span" : undefined}>
      <Section title={title || tl("Bracket")}>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <BracketBoard columns={columns} />
        </div>
      </Section>
    </div>
  );
};

/** Stage names from Leaguepedia ("Week 3", "Round 1", "Quarterfinals") in the reader's language where we can. */

const StageLists: React.FC<{ stages: Stage[] }> = ({ stages }) => {
  // Long leagues: one stage at a time, newest first
  const [i, setI] = useState(stages.length - 1);
  const [byRating, setByRating] = useState(false);
  const [search, setSearch] = useState("");
  const isHidden = useHiddenCheck();
  const st = stages[Math.min(i, stages.length - 1)];
  // "Top rated": every stage's series, best first (results still hidden by spoiler mode stay out, so the order gives
  // nothing away)
  const rated = useMemo(
    () =>
      stages
        .flatMap((s) => s.series)
        .filter((r) => r.r != null && !isHidden(seriesKey(r), r.date))
        .sort((a, b) => (b.r || 0) - (a.r || 0)),
    [stages, isHidden],
  );
  const terms = useMemo(
    () =>
      search
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [search],
  );
  const shown = useMemo(() => {
    const base = byRating ? rated : terms.length > 0 ? stages.flatMap((s) => s.series) : st.series;
    if (!terms.length) return base;
    return base.filter((r) => terms.some((t) => r.a.toLowerCase().includes(t) || r.b.toLowerCase().includes(t)));
  }, [byRating, rated, terms, stages, st.series]);
  return (
    <Section
      title={tl("Matches")}
      right={
        <span className="flex flex-wrap items-center gap-1.5" data-nocapture="1">
          <input
            type="search"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
          />
          {rated.length > 1 && (
            <select
              value={byRating ? "r" : "d"}
              onChange={(e) => setByRating(e.target.value === "r")}
              aria-label={tl("Order")}
              className="bg-rw-bg border border-rw-border rounded px-1.5 py-0.5 text-[11px] text-rw-text"
            >
              <option value="d">{tl("By stage")}</option>
              <option value="r">{tl("Top rated")}</option>
            </select>
          )}
        </span>
      }
    >
      {!byRating && !terms.length && stages.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {stages.map((s, k) => (
            <button
              key={s.name + k}
              type="button"
              onClick={() => setI(k)}
              className={`px-2 py-1 rounded text-[11px] border ${
                k === i ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
              }`}
            >
              {stageLabel(s.name) || tl("Matches")}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r, k) => (
          <SeriesBox key={k} r={r} />
        ))}
      </div>
    </Section>
  );
};

export const Standings: React.FC<{ name: string; rows: StandingRow[]; end?: string; hideAll?: boolean }> = ({ name, rows, end, hideAll }) => {
  const [hidden, reveal] = useHidden(`standings:${name}:${rows.map((r) => r.t).join()}`, end);
  const hide = hideAll || hidden;
  const ties = rows.some((r) => r.st);
  return (
    <Section title={name} right={hidden && !hideAll ? <RevealButton onReveal={reveal} small /> : undefined}>
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={`${th} w-6`}>#</th>
            <th className={th}>{tl("Team")}</th>
            <th className={th}>{tl("Series")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.t + i} className="border-t border-rw-border">
              <td className={`${td} text-rw-muted`}>{hide || r.pl === 0 ? "–" : r.pl ?? i + 1}</td>
              <td className={`${td} max-w-[11rem] truncate`}>
                <TeamLink name={r.t} u={r.u} />
              </td>
              <td className={`${td} text-rw-sub tabular-nums`}>{hide ? "–" : `${r.sw ?? 0}-${r.sl ?? 0}${ties ? `-${r.st ?? 0}` : ""}`}</td>
              <td className={`${td} text-rw-muted tabular-nums`}>{hide || r.gw == null ? "–" : `${r.gw}-${r.gl ?? 0}`}</td>
            </tr>
          ))}
        </tbody>
      </STable>
    </Section>
  );
};

const LEADER_TITLES: Record<string, string> = {
  kda: tk("Best KDA"),
  kills: tk("Kills per game"),
  csm: tk("CS per minute"),
  dpm: tk("Damage per minute"),
  pool: tk("Most champions played"),
};

const Leaders: React.FC<{ e: HubEvent }> = ({ e }) => {
  const keys = (["kda", "kills", "csm", "dpm", "pool"] as const).filter((k) => e.leaders?.[k]?.length);
  const [k, setK] = useState<(typeof keys)[number]>(keys[0]);
  const rows = e.leaders?.[k] || [];
  return (
    <Section title={tl("Player leaders")}>
      <div className="flex flex-wrap gap-1">
        {keys.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setK(x)}
            className={`px-2 py-1 rounded text-[11px] border ${
              x === k ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
            }`}
          >
            {tl(LEADER_TITLES[x])}
          </button>
        ))}
      </div>
      <ol className="text-xs space-y-1">
        {rows.map((r, i) => (
          <li key={r.n + i} className="flex items-center justify-between gap-2 min-w-0">
            <span className="truncate min-w-0">
              <span className="text-rw-muted mr-1.5 tabular-nums">{i + 1}.</span>
              <PlayerLink name={r.n} u={r.u} />
              <span className="text-rw-muted"> · {r.t}</span>
            </span>
            <span className="shrink-0 text-rw-sub tabular-nums">
              <span className="text-rw-accent font-bold">{fmtNum(r.v)}</span> · {tn("{n} game", "{n} games", r.g)}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-rw-muted">{tl("Players who played at least 40% of the most games anyone played here.")}</p>
    </Section>
  );
};

const EventChamps: React.FC<{ e: HubEvent }> = ({ e }) => {
  const games = e.statsGames || 0;
  const rows = useMemo(() => (e.champs || []).slice(0, 20), [e.champs]);
  // the Champions page with this tournament picked: every champion, by patch / side / role, blind picks
  const year = (e.start || e.end || "").slice(0, 4);
  const more =
    e.lu && /^\d{4}$/.test(year) ? (
      <HubLink
        to={{ kind: "champions", query: new URLSearchParams({ league: e.lu, year, ...(e.whole ? {} : { event: e.u }) }).toString() }}
        className="text-[11px] text-rw-teal hover:underline"
      >
        {tl("Every champion, with filters")}
      </HubLink>
    ) : undefined;
  return (
    <Section title={tl("Champions")} right={more}>
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Champion")}</th>
            <th className={th}>{tl("Presence")}</th>
            <th className={th}>{tl("Picks")}</th>
            <th className={th}>{tl("Bans")}</th>
            <th className={th}>{tl("Win %")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.c} className="border-t border-rw-border">
              <td className={`${td} max-w-[9rem]`}>
                <ChampLink name={c.c} size={18} />
              </td>
              <td className={`${td} text-rw-sub`}>{games ? `${Math.round(((c.p + c.b) / games) * 100)}%` : "–"}</td>
              <td className={`${td} text-rw-sub`}>{c.p}</td>
              <td className={`${td} text-rw-sub`}>{c.b}</td>
              <td className={`${td} text-rw-sub`}>{c.p ? winRate(c.w, c.p) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </STable>
    </Section>
  );
};

