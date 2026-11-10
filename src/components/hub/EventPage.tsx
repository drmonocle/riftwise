/**
 * Tournament page, in tabs when it has enough to show (each its own address, /tournament/<slug>/<tab>): Overview
 * (results and prize money, the bracket, standings), Matches (every series by stage), Stats (leaders, player and team
 * tables, the stat cards), Champions and Teams (rosters).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Trophy, MapPin, CalendarDays, Coins, Download, Sparkles, ClipboardCopy } from "lucide-react";
import { BracketBoard, type BracketColumn } from "../BracketBoard";
import { CountryFlag, countryCode, localCountry } from "./CountryFlag";
import { tl, tn, tk, regionName, stageLabel, eventTitle } from "../../i18n";
import { champName } from "../../champions";
import { winRate } from "../../stats";
import { downloadEventCsv, downloadStagesCsv, loadHubEvent, normText, prettySlug } from "../../hub/data";
import type { HubEvent, SeriesRow, Stage, StandingRow } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { EventPlayerStats, EventTeamStatsTable } from "./EventTables";
import { EventFacts, EventRosters, RegionalRecords } from "./EventExtras";
import { EventStatsSection } from "./EventStats";
import { PlayoffChances } from "./PlayoffChances";
import { BroadcastCardButton, SectionCard, eventCardData } from "./BroadcastCard";
import { WinBar } from "./OpponentChart";
import { hubShareUrl, type HubRoute } from "../../hub/route";
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
  PlayerPhoto,
  RevealButton,
  Section,
  Stat,
  td,
  th,
  TeamLink,
  TeamLogo,
  useHidden,
  useHiddenCheck,
  useLoad,
  usePageTitle,
  ratingTextClass,
} from "./ui";
import { STable } from "../STable";
import { JumpBar, PageTabs, type JumpItem, type PageTab } from "./PageTabs";
import { EntityHero, heroBtn, heroLink } from "./EntityHero";

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
  const [teamSearch, setTeamSearch] = useState("");
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
      <EntityHero
        tabbed={tabbed}
        kicker={
          e.parent ? (
            <>
              {tl("Part of")} <EventLink name={e.parent.n} u={e.parent.u} className="text-rw-accent hover:underline" />
            </>
          ) : undefined
        }
        title={e.n}
        lines={
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(e.start || e.end) && (
              <HubLink
                to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}` }}
                className="flex items-center gap-1 hover:text-rw-accent hover:underline"
                title={tl("Game finder")}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {fmtDate(e.start)}
                {e.end && e.end !== e.start ? ` – ${fmtDate(e.end)}` : ""}
              </HubLink>
            )}
            {e.league &&
              (e.lu ? (
                <HubLink to={{ kind: "league", slug: e.lu }} className="text-rw-sub hover:text-rw-accent hover:underline">
                  {e.league}
                </HubLink>
              ) : (
                <span>{e.league}</span>
              ))}
            {e.region && (
              <HubLink to={{ kind: "leagues" }} className="hover:text-rw-accent hover:underline">
                {regionName(e.region, e.region)}
              </HubLink>
            )}
            {(e.country || e.type) && (
              <span className="flex items-center gap-1">
                {countryCode(e.country) ? <CountryFlag cc={countryCode(e.country)} /> : <MapPin className="w-3.5 h-3.5" />}
                {[localCountry(e.country), e.type === "Online" ? tl("Online") : e.type === "Offline" ? tl("On stage") : e.type].filter(Boolean).join(" · ")}
              </span>
            )}
            {e.prize && (
              <HubLink
                to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}` }}
                className="flex items-center gap-1 hover:text-rw-accent hover:underline"
              >
                <Coins className="w-3.5 h-3.5" />
                {tl("Prize pool {amount}", { amount: e.prize })}
              </HubLink>
            )}
          </div>
        }
        extra={
          (e.siblings?.length || 0) > 1 || INTL_PAGE[e.lu || ""] ? (
            <div className="space-y-2">
              {(e.siblings?.length || 0) > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {e.siblings!.map((s) => (
                    <HubLink
                      key={s.u}
                      to={{ kind: "event", slug: s.u }}
                      className={`px-3 py-1.5 rounded-lg text-[13px] border ${
                        s.u === e.u ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
                      }`}
                    >
                      {s.n}
                    </HubLink>
                  ))}
                </div>
              )}
              {INTL_PAGE[e.lu || ""] && (
                <HubLink to={{ kind: INTL_PAGE[e.lu as string], year: e.year || undefined }} className={`${heroLink} font-semibold`}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {tl("Stats and pickers for {event}", { event: eventTitle((e.parent?.n || e.n).replace(/ (Main Event|Play-In)$/, "")) })}
                </HubLink>
              )}
            </div>
          ) : undefined
        }
        aside={
          (e.games || 0) > 0 || (!resultsHidden && e.overview) ? (
            <div className="flex flex-wrap items-center gap-2">
              {!resultsHidden && e.overview && (
                <BroadcastCardButton
                  hero
                  name={`${e.u}-overview`}
                  label={tl("Overview card")}
                  data={() =>
                    eventCardData({
                      name: eventTitle(e.n),
                      when: [e.start && fmtDate(e.start), e.end && e.end !== e.start && fmtDate(e.end)].filter(Boolean).join(" – ") || undefined,
                      podium: (e.results || [])
                        .filter((r) => ["1", "2", "3"].includes(r.p))
                        .sort((x, y) => Number(x.p) - Number(y.p))
                        .map((r) => r.t)
                        .slice(0, 3),
                      o: e.overview!,
                    })
                  }
                />
              )}
              {!resultsHidden && (e.games || 0) > 0 && <CopyEventPost e={e} />}
              {(e.games || 0) > 0 && (
                <>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(e.lu ? { league: e.lu } : {}),
                        ...(!e.whole ? { event: e.u } : {}),
                        ...(e.start || e.end ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                      }).toString(),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Leaderboards")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Pro tier list")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `p=e:${encodeURIComponent(e.u)}`,
                    }}
                    className={heroBtn()}
                  >
                    {tl("Draft board")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `event=${encodeURIComponent(e.u)}`,
                    }}
                    className={heroBtn()}
                  >
                    {tl("Game finder")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Power rankings")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "best",
                      ...(e.lu
                        ? {
                            query: `league=${encodeURIComponent(e.lu)}${
                              e.start || e.end ? `&year=${encodeURIComponent((e.start || e.end || "").slice(0, 4))}` : ""
                            }`,
                          }
                        : {}),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Best games")}
                  </HubLink>
                  <button
                    type="button"
                    onClick={() =>
                      (e.whole && e.children?.length
                        ? downloadStagesCsv(e.u, e.children.map((c) => c.u), onOpenUrl)
                        : downloadEventCsv(e.u, onOpenUrl)
                      ).catch(() => {})
                    }
                    className={heroBtn()}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {tl("Download every game (CSV)")}
                  </button>
                </>
              )}
            </div>
          ) : undefined
        }
        stats={
          (e.games || 0) > 0
            ? [
                {
                  label: tl("Games"),
                  value: fmtNum(e.games || 0),
                  sub: e.statsGames ? tl("{n} with full stats", { n: fmtNum(e.statsGames) }) : undefined,
                  to: { kind: "finder", query: `event=${encodeURIComponent(e.u)}` },
                },
                { label: tl("Series"), value: fmtNum(e.series || 0), to: tabbed ? to("matches") : undefined },
                { label: tl("Teams"), value: e.teams?.length || "–", to: tabbed ? to("teams") : undefined },
              ]
            : undefined
        }
      />
      {tabbed && <PageTabs attached tabs={tabs} active={tab} to={to} below={tab === "stats" ? <JumpBar bare items={STATS_JUMPS} /> : undefined} />}
      <div className="rw-page mt-3">
      {/* what most people open a tournament for comes first (TV, 2026-10-28): the bracket and standings, then the
          results and prize money, then the facts */}
      {on("") && <EventBracketBlock e={e} />}

      {on("") && e.results && e.results.length > 0 && (
        <Section
          title={e.resultsFrom === "event" ? tl("Final standings (whole event)") : tl("Final standings")}
          right={
            resultsHidden ? (
              <RevealButton onReveal={revealResults} small />
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                {e.results.length >= 2 && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: e.results[0].u || prettySlug(e.results[0].t),
                        b: e.results[1].u || prettySlug(e.results[1].t),
                        period: `e:${e.u}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(e.results[0].u || prettySlug(e.results[0].t))},${encodeURIComponent(e.results[1].u || prettySlug(e.results[1].t))}&p=e:${encodeURIComponent(e.u)}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a: e.results[0].u || prettySlug(e.results[0].t),
                        b: e.results[1].u || prettySlug(e.results[1].t),
                        period: `e:${e.u}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{ kind: "rankings", ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}) }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}` }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{ kind: "tiers", ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}) }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{ kind: "leaders", query: `event=${encodeURIComponent(e.u)}` }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <SectionCard
                  section={e.resultsFrom === "event" ? tl("Final standings (whole event)") : tl("Final standings")}
                  sub={eventTitle(e.n)}
                  name={`${e.u}-final-standings`}
                  rows={() =>
                    e.results!.slice(0, 10).map((r, idx) => ({
                      rank: Number(r.p.replace(/\D.*$/, "")) || idx + 1,
                      team: r.t,
                      label: `${r.p}. ${r.t}`,
                      value: r.usd ? fmtUsd(r.usd) : r.p,
                      win: r.p === "1",
                    }))
                  }
                />
              </span>
            )
          }
        >
          {resultsHidden ? (
            <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <STable className="w-full text-xs">
              <thead>
                <tr>
                  <th className={`${th} w-12`}>#</th>
                  <th className={th}>{tl("Team")}</th>
                  <th className={`${th} text-right`}>{tl("Place")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const shown = e.results.slice(0, 32);
                  const maxUsd = Math.max(0, ...shown.map((r) => r.usd || 0));
                  return shown.map((r, i) => (
                    <tr key={i} className="border-t border-rw-border first:border-0">
                      <td className={`${td} w-12 font-bold ${r.p === "1" ? "text-rw-accent" : "text-rw-sub"}`} data-sort={Number(r.p.replace(/\D.*$/, "")) || i + 1}>
                        <HubLink
                          to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&team=${encodeURIComponent(r.u || r.t)}` }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {r.p === "1" && <Trophy className="w-3 h-3 inline mr-1" />}
                          {r.p}
                        </HubLink>
                      </td>
                      <td className={td} data-sort={r.t}>
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <HubLink to={{ kind: "team", slug: r.u || prettySlug(r.t) }} title={r.t}>
                            <TeamLogo name={r.t} size={16} />
                          </HubLink>
                          <TeamLink name={r.t} u={r.u} />
                        </span>
                      </td>
                      <td className={`${td} text-right text-rw-muted`} data-sort={r.usd || 0}>
                        {r.usd ? (
                          <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
                            {maxUsd > 0 && (
                              <span className="w-12 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                                <span
                                  className={`h-full rounded-full ${r.p === "1" ? "bg-rw-teal/85" : "bg-rw-accent/75"}`}
                                  style={{ width: `${Math.max(6, Math.round((r.usd / maxUsd) * 100))}%` }}
                                />
                              </span>
                            )}
                            <HubLink
                              to={{ kind: "team", slug: r.u || r.t.toLowerCase().replace(/[^a-z0-9]+/g, "-"), tab: "stats", query: `p=e:${encodeURIComponent(e.u)}` }}
                              className="hover:text-rw-accent hover:underline"
                              title={tl("Stats")}
                            >
                              {fmtUsd(r.usd)}
                            </HubLink>
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </STable>
          )}
        </Section>
      )}

      {on("") && e.overview && (
        <EventFacts
          o={e.overview}
          slug={e.u}
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
        <Section
          title={tl("Stages")}
          right={
            <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
              <HubLink to={{ kind: "tournaments" }} className="text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Tournaments")} →
              </HubLink>
              <HubLink
                to={{ kind: "draft", query: `p=e:${encodeURIComponent(e.u)}` }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "rankings", ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}) }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{ kind: "tiers", ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}) }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}` }} className="text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Game finder")} →
              </HubLink>
              <HubLink to={{ kind: "leaders", query: `event=${encodeURIComponent(e.u)}` }} className="text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Player leaderboards")} →
              </HubLink>
            </span>
          }
        >
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
        <div className={tabbed ? "rw-span" : "grid gap-3 md:grid-cols-2"}>
          {on("champions") && e.champs && e.champs.length > 0 && <EventChamps e={e} full={tabbed} />}
          {on("teams") && e.teams && e.teams.length > 0 && (() => {
            const tq = teamSearch.trim().toLowerCase();
            const tTerms = tq ? tq.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => s.trim()).filter(Boolean) : [];
            const filteredTeams = tTerms.length
              ? e.teams.filter((t) => {
                  const hay = `${t.t} ${t.u || ""}`.toLowerCase();
                  return tTerms.some((term) => hay.includes(term));
                })
              : e.teams;
            return (
              <Section
                title={tl("Teams")}
                right={
                  <span className="flex flex-wrap items-center gap-2">
                    {e.teams.length > 8 && (
                      <input
                        type="search"
                        value={teamSearch}
                        onChange={(ev) => setTeamSearch(ev.target.value)}
                        placeholder={tl("Filter by name or team…")}
                        aria-label={tl("Filter by name or team…")}
                        data-nocapture="1"
                        className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
                      />
                    )}
                    {!resultsHidden && filteredTeams.length >= 2 && (
                      <>
                        <HubLink
                          to={{
                            kind: "prep",
                            a: filteredTeams[0].u || prettySlug(filteredTeams[0].t),
                            b: filteredTeams[1].u || prettySlug(filteredTeams[1].t),
                            period: `e:${e.u}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Match prep")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "draft",
                            query: `teams=${encodeURIComponent(filteredTeams[0].u || prettySlug(filteredTeams[0].t))},${encodeURIComponent(filteredTeams[1].u || prettySlug(filteredTeams[1].t))}&p=e:${encodeURIComponent(e.u)}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Draft board")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "compare",
                            mode: "team",
                            a: filteredTeams[0].u || prettySlug(filteredTeams[0].t),
                            b: filteredTeams[1].u || prettySlug(filteredTeams[1].t),
                            period: `e:${e.u}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Compare")} →
                        </HubLink>
                      </>
                    )}
                    {!resultsHidden && filteredTeams.length === 1 && (
                      <>
                        <HubLink
                          to={{ kind: "prep", a: filteredTeams[0].u || prettySlug(filteredTeams[0].t), period: `e:${e.u}` }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Match prep")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "draft",
                            query: `teams=${encodeURIComponent(filteredTeams[0].u || prettySlug(filteredTeams[0].t))}&p=e:${encodeURIComponent(e.u)}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Draft board")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "compare",
                            mode: "team",
                            a: filteredTeams[0].u || prettySlug(filteredTeams[0].t),
                            period: `e:${e.u}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Compare")} →
                        </HubLink>
                      </>
                    )}
                    {!resultsHidden && (
                      <>
                        <HubLink
                          to={{
                            kind: "rankings",
                            ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Power rankings")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "leaders",
                            query: new URLSearchParams({
                              ...(e.lu ? { league: e.lu } : {}),
                              ...(!e.whole ? { event: e.u } : {}),
                            }).toString(),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Player leaderboards")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `event=${encodeURIComponent(e.u)}${filteredTeams.length === 1 ? `&team=${encodeURIComponent(filteredTeams[0].u || filteredTeams[0].t)}` : ""}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Game finder")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "tiers",
                            ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Pro tier list")} →
                        </HubLink>
                        <SectionCard
                          section={tl("Teams")}
                          sub={eventTitle(e.n)}
                          name={`${e.u}-teams`}
                          rows={() =>
                            filteredTeams.slice(0, 12).map((t, idx) => ({
                              rank: idx + 1,
                              team: t.t,
                              label: t.t,
                              sub: `${t.w}-${t.g - t.w} ${tl("Games")}`,
                              value: `${t.sw}-${t.sg - t.sw}`,
                              win: t.sg ? t.sw / t.sg >= 0.5 : undefined,
                            }))
                          }
                        />
                      </>
                    )}
                  </span>
                }
              >
                <STable className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className={th}>{tl("Team")}</th>
                      <th className={th}>{tl("Series")}</th>
                      <th className={th}>{tl("Games")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeams.map((t) => (
                    <tr key={t.t} className="border-t border-rw-border">
                      <td className={`${td} max-w-[12rem]`} data-sort={t.t}>
                        <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                          <HubLink to={{ kind: "team", slug: t.u || prettySlug(t.t) }} title={t.t} className="shrink-0">
                            <TeamLogo name={t.t} size={16} />
                          </HubLink>
                          <TeamLink name={t.t} u={t.u} className="truncate" />
                        </span>
                      </td>
                      <td className={`${td} text-rw-sub`} data-sort={t.sg ? t.sw / t.sg : 0}>
                        {resultsHidden ? (
                          "–"
                        ) : (
                          <HubLink
                            to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&team=${encodeURIComponent(t.u || t.t)}` }}
                            className="hover:opacity-90"
                            title={tl("Game finder")}
                          >
                            {t.sg ? <WinBar w={t.sw} g={t.sg} showRecord /> : `${t.sw}-${t.sg - t.sw}`}
                          </HubLink>
                        )}
                      </td>
                      <td className={`${td} text-rw-sub`} data-sort={t.g ? t.w / t.g : 0}>
                        {resultsHidden ? (
                          "–"
                        ) : (
                          <HubLink
                            to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&team=${encodeURIComponent(t.u || t.t)}` }}
                            className="hover:opacity-90"
                            title={tl("Game finder")}
                          >
                            <WinBar w={t.w} g={t.g} showRecord />
                          </HubLink>
                        )}
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </STable>
              </Section>
            );
          })()}
        </div>
      )}
      {on("teams") && e.rosters && e.rosters.length > 0 && <EventRosters rosters={e.rosters} eventSlug={e.u} />}
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
      <span className={`inline-flex items-center gap-1.5 truncate min-w-0 ${!hidden && won ? "text-rw-text font-bold" : "text-rw-sub"}`}>
        <HubLink to={{ kind: "team", slug: u || prettySlug(name) }} title={name} className="shrink-0">
          <TeamLogo name={name} size={14} />
        </HubLink>
        <TeamLink name={name} u={u} className={`truncate ${!hidden && won ? "text-rw-text font-bold hover:underline" : "text-rw-sub hover:text-rw-text hover:underline"}`} />
      </span>
      <span className={`tabular-nums font-bold shrink-0 ${!hidden && won ? "text-rw-teal" : "text-rw-muted"}`}>
        {played ? (
          hidden ? (
            "?"
          ) : r.g && !hideResult ? (
            <HubLink to={{ kind: "match", slug: r.g }} className="hover:underline">
              {score}
            </HubLink>
          ) : (
            score
          )
        ) : (
          ""
        )}
      </span>
    </div>
  );
  return (
    <div className={`bg-rw-bg border border-rw-border rounded-lg ${compact ? "px-2 py-1" : "px-2.5 py-1.5"} text-xs min-w-0`}>
      {line(r.a, r.au, r.sa, r.w === 1)}
      {line(r.b, r.bu, r.sb, r.w === 2)}
      <div className="flex items-center justify-between gap-2 mt-0.5 text-[10px] text-rw-muted">
        <span className="truncate">
          {r.g && !hideResult ? (
            <HubLink to={{ kind: "match", slug: r.g }} className="hover:text-rw-text hover:underline">
              {note ?? fmtDate(r.date, false)}
            </HubLink>
          ) : (
            note ?? fmtDate(r.date, false)
          )}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {hiddenBySpoiler && !hideResult && played && <RevealButton onReveal={reveal} small />}
          {r.au && r.bu && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: r.au,
                  b: r.bu,
                  period: /^\d{4}$/.test((r.date || "").slice(0, 4)) ? `y${(r.date || "").slice(0, 4)}` : undefined,
                }}
                className="hidden sm:inline hover:text-rw-accent hover:underline"
                title={tl("Match prep")}
              >
                {tl("Match prep")}
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: r.au,
                  b: r.bu,
                  period: /^\d{4}$/.test((r.date || "").slice(0, 4)) ? `y${(r.date || "").slice(0, 4)}` : undefined,
                }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Compare")}
              >
                {tl("vs")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(r.au)},${encodeURIComponent(r.bu)}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&p=y${(r.date || "").slice(0, 4)}` : ""}`,
                }}
                className="hidden sm:inline hover:text-rw-accent hover:underline"
                title={tl("Draft board")}
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `team=${encodeURIComponent(r.au)}&vs=${encodeURIComponent(r.bu)}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&year=${(r.date || "").slice(0, 4)}` : ""}`,
                }}
                className="hidden sm:inline hover:text-rw-accent hover:underline"
                title={tl("Game finder")}
              >
                {tl("Game finder")}
              </HubLink>
            </>
          )}
          {!hidden && r.r != null &&
            (r.g && !hideResult ? (
              <HubLink
                to={{ kind: "match", slug: r.g }}
                className={`tabular-nums font-semibold hover:underline ${ratingTextClass(r.r)}`}
                title={tl("Series rating: mostly its best game, then its other games")}
              >
                {r.r.toFixed(0)}
              </HubLink>
            ) : (
              <span className={`tabular-nums font-semibold ${ratingTextClass(r.r)}`} title={tl("Series rating: mostly its best game, then its other games")}>
                {r.r.toFixed(0)}
              </span>
            ))}
          {r.g && !hideResult ? (
            <HubLink to={{ kind: "match", slug: r.g }} className="text-rw-accent hover:underline">
              {tl("Details")}
            </HubLink>
          ) : !played && r.au && r.bu ? (
            <HubLink to={{ kind: "prep", a: r.au, b: r.bu }} className="text-rw-accent hover:underline">
              {tl("Match prep")}
            </HubLink>
          ) : null}
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
            <Standings key={i} name={t.name === "Standings" ? tl("Standings") : tl("Group {name}", { name: t.name.replace(/^Group /, "") })} rows={t.rows} end={e.end} eventSlug={e.u} />
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
        <EventLink name={tl("Open {stage}", { stage: x.n })} u={x.u} className="ml-auto text-rw-accent hover:underline" />
      </div>
      {b.length > 0 && <Bracket key={x.u} stages={b} />}
      {x.standings && x.standings.length > 0 && (
        <div className={`grid gap-3 ${x.standings.length > 1 ? "md:grid-cols-2" : ""}`}>
          {x.standings.map((t, k) => (
            <Standings key={k} name={t.name === "Standings" ? tl("Standings") : tl("Group {name}", { name: t.name.replace(/^Group /, "") })} rows={t.rows} end={x.end} eventSlug={x.u} />
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
  const finalS = stages[stages.length - 1]?.series.find((r) => r.au && r.bu);
  return (
    <div className={columns.length >= 4 ? "rw-span" : undefined}>
      <Section
        title={title || tl("Bracket")}
        right={
          finalS?.au && finalS?.bu ? (
            <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
              <HubLink
                to={{ kind: "prep", a: finalS.au, b: finalS.bu }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{ kind: "draft", query: `teams=${encodeURIComponent(finalS.au)},${encodeURIComponent(finalS.bu)}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "compare", mode: "team", a: finalS.au, b: finalS.bu }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{ kind: "rankings" }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{ kind: "finder", query: `team=${encodeURIComponent(finalS.au)}&vs=${encodeURIComponent(finalS.bu)}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{ kind: "tiers" }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{ kind: "leaders" }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
            </span>
          ) : undefined
        }
      >
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
  const isVsMatchup = useMemo(() => /\s+vs\.?\s+|\s+v\s+/i.test(search), [search]);
  const terms = useMemo(
    () =>
      search
        .toLowerCase()
        .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
        .map((s) => s.trim())
        .filter(Boolean),
    [search],
  );
  const shown = useMemo(() => {
    const base = byRating ? rated : terms.length > 0 ? stages.flatMap((s) => s.series) : st.series;
    if (!terms.length) return base;
    if (isVsMatchup && terms.length >= 2) {
      const [ta, tb] = terms;
      return base.filter((r) => {
        const a = `${r.a} ${r.au || ""}`.toLowerCase();
        const b = `${r.b} ${r.bu || ""}`.toLowerCase();
        return (a.includes(ta) && b.includes(tb)) || (a.includes(tb) && b.includes(ta));
      });
    }
    return base.filter((r) => {
      const a = `${r.a} ${r.au || ""}`.toLowerCase();
      const b = `${r.b} ${r.bu || ""}`.toLowerCase();
      return terms.some((t) => a.includes(t) || b.includes(t));
    });
  }, [byRating, rated, terms, isVsMatchup, stages, st.series]);
  return (
    <Section
      title={tl("Matches")}
      right={
        <span className="flex flex-wrap items-center gap-1.5" data-nocapture="1">
          {shown[0]?.au && shown[0]?.bu && (
            <>
              <HubLink
                to={{ kind: "prep", a: shown[0].au, b: shown[0].bu }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{ kind: "draft", query: `teams=${encodeURIComponent(shown[0].au)},${encodeURIComponent(shown[0].bu)}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "compare", mode: "team", a: shown[0].au, b: shown[0].bu }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{ kind: "rankings" }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{ kind: "finder", query: `team=${encodeURIComponent(shown[0].au)}&vs=${encodeURIComponent(shown[0].bu)}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{ kind: "tiers" }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{ kind: "leaders" }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
            </>
          )}
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
          {shown.length > 0 && (
            <SectionCard
              section={tl("Matches")}
              name={stageLabel(st.name) || tl("Matches")}
              rows={() =>
                shown.slice(0, 12).map((r, idx) => {
                  const hide = isHidden(seriesKey(r), r.date);
                  const played = r.sa != null && r.sb != null;
                  const winTeam = !hide && played ? (r.w === 1 ? r.a : r.w === 2 ? r.b : r.a) : r.a;
                  return {
                    rank: idx + 1,
                    team: winTeam,
                    label: `${r.a} vs ${r.b}`,
                    sub: fmtDate(r.date, false),
                    value: played ? (hide ? "–" : `${r.sa}–${r.sb}`) : fmtDate(r.date, false),
                    win: !hide && played ? r.w === 1 : undefined,
                  };
                })
              }
            />
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

export const Standings: React.FC<{ name: string; rows: StandingRow[]; end?: string; hideAll?: boolean; eventSlug?: string }> = ({ name, rows, end, hideAll, eventSlug }) => {
  const [hidden, reveal] = useHidden(`standings:${name}:${rows.map((r) => r.t).join()}`, end);
  const hide = hideAll || hidden;
  const ties = rows.some((r) => r.st);
  return (
    <Section
      title={name}
      right={
        hidden && !hideAll ? (
          <RevealButton onReveal={reveal} small />
        ) : !hide ? (
          <span className="flex flex-wrap items-center gap-2">
            {rows.length >= 2 && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: rows[0].u || prettySlug(rows[0].t),
                    b: rows[1].u || prettySlug(rows[1].t),
                    period: eventSlug ? `e:${eventSlug}` : undefined,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(rows[0].u || prettySlug(rows[0].t))},${encodeURIComponent(rows[1].u || prettySlug(rows[1].t))}${eventSlug ? `&p=e:${encodeURIComponent(eventSlug)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: rows[0].u || prettySlug(rows[0].t),
                    b: rows[1].u || prettySlug(rows[1].t),
                    period: eventSlug ? `e:${eventSlug}` : undefined,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{ kind: "rankings" }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            {eventSlug && (
              <HubLink
                to={{ kind: "finder", query: `event=${encodeURIComponent(eventSlug)}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
            )}
            <HubLink
              to={{ kind: "tiers" }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{ kind: "leaders", ...(eventSlug ? { query: `event=${encodeURIComponent(eventSlug)}` } : {}) }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <SectionCard
              section={name}
              name={`standings-${name}`}
              rows={() =>
                rows.slice(0, 10).map((r, idx) => ({
                  rank: r.pl && r.pl > 0 ? r.pl : idx + 1,
                  team: r.t,
                  label: r.t,
                  sub: r.gw != null ? `${r.gw}-${r.gl ?? 0}` : undefined,
                  value: `${r.sw ?? 0}-${r.sl ?? 0}${ties ? `-${r.st ?? 0}` : ""}`,
                  win: (r.sw ?? 0) + (r.sl ?? 0) > 0 ? (r.sw ?? 0) >= (r.sl ?? 0) : undefined,
                }))
              }
            />
          </span>
        ) : undefined
      }
    >
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
              <td className={`${td} text-rw-muted`} data-sort={r.pl ?? i + 1}>
                {hide || r.pl === 0 ? (
                  "–"
                ) : eventSlug ? (
                  <HubLink
                    to={{ kind: "team", slug: r.u || r.t.toLowerCase().replace(/[^a-z0-9]+/g, "-"), tab: "stats", query: `p=e:${encodeURIComponent(eventSlug)}` }}
                    className="hover:text-rw-accent hover:underline"
                    title={tl("Stats")}
                  >
                    {r.pl ?? i + 1}
                  </HubLink>
                ) : (
                  r.pl ?? i + 1
                )}
              </td>
              <td className={`${td} max-w-[11rem]`} data-sort={r.t}>
                <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                  <HubLink to={{ kind: "team", slug: r.u || prettySlug(r.t) }} title={r.t} className="shrink-0">
                    <TeamLogo name={r.t} size={16} />
                  </HubLink>
                  <TeamLink name={r.t} u={r.u} className="truncate" />
                </span>
              </td>
              <td className={`${td} text-rw-sub tabular-nums`} data-sort={hide ? 0 : (r.sw ?? 0) + (r.sl ?? 0) > 0 ? (r.sw ?? 0) / ((r.sw ?? 0) + (r.sl ?? 0)) : 0}>
                {hide ? (
                  "–"
                ) : (() => {
                  const seriesNode =
                    !ties && (r.sw ?? 0) + (r.sl ?? 0) > 0 ? (
                      <WinBar w={r.sw ?? 0} g={(r.sw ?? 0) + (r.sl ?? 0)} showRecord />
                    ) : (
                      `${r.sw ?? 0}-${r.sl ?? 0}${ties ? `-${r.st ?? 0}` : ""}`
                    );
                  return eventSlug ? (
                    <HubLink
                      to={{ kind: "finder", query: `event=${encodeURIComponent(eventSlug)}&team=${encodeURIComponent(r.u || r.t)}` }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      {seriesNode}
                    </HubLink>
                  ) : (
                    seriesNode
                  );
                })()}
              </td>
              <td className={`${td} text-rw-muted tabular-nums`} data-sort={hide || r.gw == null ? 0 : r.gw + (r.gl ?? 0) > 0 ? r.gw / (r.gw + (r.gl ?? 0)) : 0}>
                {hide || r.gw == null ? (
                  "–"
                ) : (() => {
                  const gamesNode =
                    r.gw + (r.gl ?? 0) > 0 ? (
                      <WinBar w={r.gw} g={r.gw + (r.gl ?? 0)} showRecord />
                    ) : (
                      `${r.gw}-${r.gl ?? 0}`
                    );
                  return eventSlug ? (
                    <HubLink
                      to={{ kind: "finder", query: `event=${encodeURIComponent(eventSlug)}&team=${encodeURIComponent(r.u || r.t)}` }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      {gamesNode}
                    </HubLink>
                  ) : (
                    gamesNode
                  );
                })()}
              </td>
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
  const maxV = Math.max(1, ...rows.map((r) => r.v || 0));
  return (
    <Section
      title={tl("Player leaders")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {rows.length >= 1 && rows[0].t && (
            <HubLink
              to={{
                kind: "prep",
                a: prettySlug(rows[0].t),
                ...(rows[1]?.t && rows[1].t !== rows[0].t ? { b: prettySlug(rows[1].t) } : {}),
                period: `e:${e.u}`,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Match prep")} →
            </HubLink>
          )}
          {rows.length >= 2 && (
            <HubLink
              to={{
                kind: "compare",
                mode: "player",
                a: rows[0].u || prettySlug(rows[0].n),
                b: rows[1].u || prettySlug(rows[1].n),
                period: `e:${e.u}`,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Compare")} →
            </HubLink>
          )}
          {rows.length >= 1 && (
            <>
              <HubLink
                to={{
                  kind: "items",
                  query: `player=${encodeURIComponent(rows[0].u || prettySlug(rows[0].n))}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(rows[0].u || rows[0].n)}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `p=e:${encodeURIComponent(e.u)}${rows[0].t ? `&teams=${encodeURIComponent(prettySlug(rows[0].t))}${rows[1]?.t && rows[1].t !== rows[0].t ? `,${encodeURIComponent(prettySlug(rows[1].t))}` : ""}` : ""}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
            </>
          )}
          <HubLink
            to={{
              kind: "tiers",
              ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink
            to={{
              kind: "rankings",
              ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
          >
            {tl("Power rankings")} →
          </HubLink>
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(!e.whole ? { event: e.u } : {}),
                ...(e.start || e.end ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Full leaderboard")}
          </HubLink>
          <SectionCard
            section={`${tl("Player leaders")} · ${tl(LEADER_TITLES[k])}`}
            sub={eventTitle(e.n)}
            name={`${e.u}-leaders-${k}`}
            rows={() =>
              rows.slice(0, 10).map((r, idx) => ({
                rank: idx + 1,
                team: r.t,
                label: r.n,
                sub: `${r.t} · ${tn("{n} game", "{n} games", r.g)}`,
                value: fmtNum(r.v),
              }))
            }
          />
        </span>
      }
    >
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
        {rows.map((r, i) => {
          const pct = Math.max(4, Math.min(100, Math.round(((r.v || 0) / maxV) * 100)));
          return (
            <li key={r.n + i} className="relative overflow-hidden rounded px-2 py-1 flex items-center justify-between gap-2 min-w-0">
              <span
                className="pointer-events-none absolute inset-y-0 left-0 rounded"
                style={{ width: `${pct}%`, background: i === 0 ? "rgba(216,184,120,0.16)" : "rgba(130,170,255,0.08)" }}
              />
              <span className="relative inline-flex items-center gap-1.5 truncate min-w-0">
                <span className={`w-4 shrink-0 tabular-nums ${i === 0 ? "text-rw-accent font-bold" : "text-rw-muted"}`}>{i + 1}.</span>
                <HubLink to={{ kind: "player", slug: r.u || prettySlug(r.n) }} title={r.n} className="shrink-0">
                  <PlayerPhoto name={r.n} team={r.t} slug={r.u ?? undefined} size={20} />
                </HubLink>
                <PlayerLink name={r.n} u={r.u} />
                <span className="text-rw-muted shrink-0">·</span>
                <HubLink to={{ kind: "team", slug: e.teams?.find((tm) => tm.t === r.t)?.u || prettySlug(r.t) }} title={r.t} className="shrink-0">
                  <TeamLogo name={r.t} size={14} />
                </HubLink>
                <TeamLink name={r.t} u={e.teams?.find((tm) => tm.t === r.t)?.u} className="text-rw-muted hover:text-rw-accent hover:underline truncate" />
              </span>
              <span className="relative shrink-0 text-rw-sub tabular-nums">
                <HubLink
                  to={
                    k === "pool" && r.u
                      ? { kind: "player", slug: r.u, tab: "champions", query: `p=e:${encodeURIComponent(e.u)}` }
                      : { kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(r.u || r.n)}` }
                  }
                  className="text-rw-accent font-bold hover:underline"
                >
                  {fmtNum(r.v)}
                </HubLink>{" "}
                ·{" "}
                <HubLink
                  to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(r.u || r.n)}` }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {tn("{n} game", "{n} games", r.g)}
                </HubLink>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[10px] text-rw-muted">{tl("Players who played at least 40% of the most games anyone played here.")}</p>
    </Section>
  );
};

const CopyEventPost: React.FC<{ e: HubEvent }> = ({ e }) => {
  const [state, setState] = useState<"" | "copied" | "failed">("");
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(""), 2200);
    return () => clearTimeout(t);
  }, [state]);
  const text = () => {
    const podium = (e.results || [])
      .filter((r) => ["1", "2", "3"].includes(r.p))
      .sort((x, y) => Number(x.p) - Number(y.p))
      .slice(0, 3);
    const lines = [
      `${eventTitle(e.n)}${e.games ? ` — ${fmtNum(e.games)} ${tl("Games")}${e.series ? ` · ${fmtNum(e.series)} ${tl("Series")}` : ""}` : ""}`,
    ];
    if (podium.length > 0) {
      lines.push(podium.map((r) => `#${r.p} ${r.t}${r.usd ? ` (${fmtUsd(r.usd)})` : ""}`).join(" · "));
    }
    if (e.champs && e.champs.length > 0) {
      lines.push(
        `${tl("Champions")}: ${e.champs
          .slice(0, 3)
          .map((c) => `${champName(c.c)} (${c.p}P/${c.b}B)`)
          .join(", ")}`,
      );
    }
    lines.push(hubShareUrl({ kind: "event", slug: e.u }));
    return lines.join("\n");
  };
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text()).then(() => setState("copied"), () => setState("failed"))}
      className={heroBtn()}
      title={`${tl("Copy post")}: ${tl("Copy a ready-to-post summary with the link, for X or Discord")}`}
      aria-label={tl("Copy post")}
    >
      <ClipboardCopy className="w-3.5 h-3.5" />
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

const EventChamps: React.FC<{ e: HubEvent; full?: boolean }> = ({ e, full }) => {
  const games = e.statsGames || 0;
  const allChamps = useMemo(() => e.champs || [], [e.champs]);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const terms = search
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s))
      .filter(Boolean);
    if (terms.length)
      return allChamps.filter((c) => {
        const hay = `${normText(champName(c.c))} ${normText(c.c)}`;
        return terms.some((t) => hay.includes(t));
      });
    return full || showAll ? allChamps : allChamps.slice(0, 20);
  }, [allChamps, search, full, showAll]);
  // the Champions page with this tournament picked: every champion, by patch / side / role, blind picks
  const year = (e.start || e.end || "").slice(0, 4);
  const more =
    e.lu && /^\d{4}$/.test(year) ? (
      <HubLink
        to={{ kind: "champions", query: new URLSearchParams({ league: e.lu, year, ...(e.whole ? {} : { event: e.u }) }).toString() }}
        className="text-[11px] text-rw-accent hover:underline"
      >
        {tl("Every champion, with filters")}
      </HubLink>
    ) : undefined;
  return (
    <Section
      title={tl("Champions")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {allChamps.length >= 10 && (
            <input
              type="search"
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={tl("Search champions…")}
              aria-label={tl("Search champions…")}
              className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
            />
          )}
          {!full && !search && allChamps.length > 20 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-rw-accent hover:underline">
              {showAll ? tl("Show fewer") : tl("Show all {n}", { n: allChamps.length })}
            </button>
          )}
          {rows.length >= 2 && (
            <HubLink
              to={{
                kind: "counters",
                query: `champ=${encodeURIComponent(prettySlug(rows[0].c))}&vs=${encodeURIComponent(prettySlug(rows[1].c))}`,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Counters")} →
            </HubLink>
          )}
          {rows.length === 1 && (
            <HubLink
              to={{
                kind: "counters",
                query: `champ=${encodeURIComponent(prettySlug(rows[0].c))}`,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Counters")} →
            </HubLink>
          )}
          {rows.length >= 1 && (
            <HubLink
              to={{
                kind: "items",
                query: `champ=${encodeURIComponent(prettySlug(rows[0].c))}`,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Item history")} →
            </HubLink>
          )}
          <HubLink
            to={{ kind: "tiers" }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink
            to={{
              kind: "draft",
              query: `p=e:${encodeURIComponent(e.u)}`,
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Draft board")} →
          </HubLink>
          <HubLink
            to={{
              kind: "finder",
              query: `event=${encodeURIComponent(e.u)}${rows.length === 1 ? `&champ=${encodeURIComponent(rows[0].c)}` : ""}`,
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Game finder")} →
          </HubLink>
          <HubLink
            to={{ kind: "leaders", query: `event=${encodeURIComponent(e.u)}` }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Player leaderboards")} →
          </HubLink>
          <HubLink
            to={{ kind: "rankings", ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}) }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Power rankings")} →
          </HubLink>
          {more}
          <SectionCard
            section={tl("Champions")}
            sub={eventTitle(e.n)}
            name={`${e.u}-champions`}
            rows={() =>
              rows.slice(0, 10).map((c, idx) => ({
                rank: idx + 1,
                champ: c.c,
                label: champName(c.c),
                sub: `${c.p} P · ${c.b} B · ${c.p ? winRate(c.w, c.p) : "–"}`,
                value: games ? `${Math.round(((c.p + c.b) / games) * 100)}%` : `${c.p}`,
                win: c.p >= 3 ? c.w / c.p >= 0.5 : undefined,
              }))
            }
          />
        </span>
      }
    >
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
          {rows.map((c) => {
            const presPct = games ? Math.min(100, Math.round(((c.p + c.b) / games) * 100)) : 0;
            const pickPct = games ? Math.min(100, (c.p / games) * 100) : 0;
            const banPct = games ? Math.min(Math.max(0, 100 - pickPct), (c.b / games) * 100) : 0;
            return (
              <tr key={c.c} className="border-t border-rw-border">
                <td className={`${td} max-w-[9rem]`} data-sort={c.c}>
                  <ChampLink name={c.c} size={18} />
                </td>
                <td className={`${td} text-rw-sub`} data-sort={games ? (c.p + c.b) / games : 0}>
                  {games ? (
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `event=${encodeURIComponent(e.u)}&${c.p > 0 ? "champ" : "ban"}=${encodeURIComponent(c.c)}`,
                      }}
                      className="inline-flex flex-col gap-0.5 min-w-[3.25rem] hover:text-rw-accent hover:underline"
                      title={`${tl("Picks")}: ${c.p} · ${tl("Bans")}: ${c.b}`}
                    >
                      <span className="tabular-nums font-medium">{presPct}%</span>
                      <span className="h-1 w-12 rounded-full bg-rw-border/70 overflow-hidden flex" aria-hidden="true">
                        <span className="h-full bg-rw-teal/85" style={{ width: `${pickPct.toFixed(1)}%` }} />
                        <span className="h-full bg-rw-red/75" style={{ width: `${banPct.toFixed(1)}%` }} />
                      </span>
                    </HubLink>
                  ) : (
                    "–"
                  )}
                </td>
                <td className={`${td} text-rw-sub`} data-sort={c.p}>
                  {c.p > 0 ? (
                    <HubLink
                      to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&champ=${encodeURIComponent(c.c)}` }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {c.p}
                    </HubLink>
                  ) : (
                    c.p
                  )}
                </td>
                <td className={`${td} text-rw-sub`} data-sort={c.b}>
                  {c.b > 0 ? (
                    <HubLink
                      to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&ban=${encodeURIComponent(c.c)}` }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {c.b}
                    </HubLink>
                  ) : (
                    c.b
                  )}
                </td>
                <td className={`${td} text-rw-sub`} data-sort={c.p ? c.w / c.p : -1}>
                  {c.p ? (
                    <HubLink
                      to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&champ=${encodeURIComponent(c.c)}` }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      <WinBar w={c.w} g={c.p} />
                    </HubLink>
                  ) : (
                    "–"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </STable>
    </Section>
  );
};

