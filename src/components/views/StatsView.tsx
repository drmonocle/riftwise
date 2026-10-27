import React, { Suspense, useEffect, useRef, useState } from "react";
import { Trophy, Swords, Medal, ArrowLeft, GitCompare, Home, CalendarRange, Layers, History, Database, TrendingUp, Flame, Crosshair, Globe, Flag, Wrench, ClipboardList, LayoutGrid, Search, ListOrdered, Rows3 } from "lucide-react";
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
import { PartBoundary } from "../PartBoundary";
import { useDDragon } from "../../hub/ddragon";
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
} from "../hub/ui";
import { HubSearch } from "../hub/HubSearch";

import { lazyPart } from "../../lazyPart";
import { reportUrl } from "../../feedback";
import { pageCode } from "../hub/pageCode";

import { RiotCatalogContext } from "../../hub/riotCatalog";
import { STable } from "../STable";

// Each page is its own download: a player page no longer brings the code of Compare, Draft, Finder and the rest.
// main.tsx starts the code of the page a visit opens on straight away (pageCode.ts).
const HubHome = lazyPart(() => pageCode.home().then((m) => m.HubHome));
const EventsBrowse = lazyPart(() => pageCode.tournaments().then((m) => m.EventsBrowse));
const LeaguesPanel = lazyPart(() => pageCode.leagues().then((m) => m.LeaguesPanel));
const PatchesPanel = lazyPart(() => pageCode.patches().then((m) => m.PatchesPanel));
const LeaguePage = lazyPart(() => pageCode.league().then((m) => m.LeaguePage));
const ChampionsPage = lazyPart(() => pageCode.champions().then((m) => m.ChampionsPage));
const RecordsPanel = lazyPart(() => pageCode.records().then((m) => m.RecordsPanel));
const WeeklyPage = lazyPart(() => pageCode.weekly().then((m) => m.WeeklyPage));
const TitlesPanel = lazyPart(() => pageCode.titles().then((m) => m.TitlesPanel));
const DownloadsPage = lazyPart(() => pageCode.data().then((m) => m.DownloadsPage));
const AboutPage = lazyPart(() => pageCode.about().then((m) => m.AboutPage));
const PrepPage = lazyPart(() => pageCode.prep().then((m) => m.PrepPage));
const RankingsPage = lazyPart(() => pageCode.rankings().then((m) => m.RankingsPage));
const FinderPage = lazyPart(() => pageCode.finder().then((m) => m.FinderPage));
const DraftPage = lazyPart(() => pageCode.draft().then((m) => m.DraftPage));
const BestPage = lazyPart(() => pageCode.best().then((m) => m.BestPage));
const CountersPage = lazyPart(() => pageCode.counters().then((m) => m.CountersPage));
const LeadersPage = lazyPart(() => pageCode.leaders().then((m) => m.LeadersPage));
const TiersPage = lazyPart(() => pageCode.tiers().then((m) => m.TiersPage));
const AboutMePage = lazyPart(() => pageCode.aboutme().then((m) => m.AboutMePage));
const ComparePage = lazyPart(() => pageCode.compare().then((m) => m.ComparePage));
const TeamPage = lazyPart(() => pageCode.team().then((m) => m.TeamPage));
const PlayerPage = lazyPart(() => pageCode.player().then((m) => m.PlayerPage));
const EventPage = lazyPart(() => pageCode.event().then((m) => m.EventPage));
const MatchPage = lazyPart(() => pageCode.match().then((m) => m.MatchPage));
const ChampPage = lazyPart(() => pageCode.champ().then((m) => m.ChampPage));
const WorldsPage = lazyPart(() => pageCode.worlds().then((m) => m.WorldsPage));

interface StatsViewProps {
  settings: AppSettings;
  onOpenUrl: (url: string) => void;
  /** upcoming matches (for "On the line today" on the stats home) */
  schedule?: Match[];
  /** Riot's team list: player photos and team logos (Match prep) */
  catalog?: CatalogData | null;
}

type SectionKind = HubRoute["kind"];
interface MenuItem {
  kind: SectionKind;
  label: string;
  icon: React.ReactNode;
}
/** The stats menu: groups on the first row, the open group's pages on the second. */
/** pages whose own title is their <h1> (the others get the "Pro stats" header as theirs) */
const OWN_H1 = new Set(["home", "worlds", "msi", "first-stand", "rankings", "records", "prep", "draft", "finder", "best", "counters", "leaders", "tiers", "team", "player", "event", "champ", "league", "match", "aboutme"]);

const GROUPS: { label: string; icon: React.ReactNode; items: MenuItem[] }[] = [
  { label: tk("Home"), icon: <Home className="w-3.5 h-3.5" />, items: [{ kind: "home", label: tk("Home"), icon: <Home className="w-3.5 h-3.5" /> }] },
  {
    label: tk("International events"),
    icon: <Globe className="w-3.5 h-3.5" />,
    items: [
      { kind: "worlds", label: tk("Worlds"), icon: <Globe className="w-3.5 h-3.5" /> },
      { kind: "msi", label: tk("MSI"), icon: <Trophy className="w-3.5 h-3.5" /> },
      { kind: "first-stand", label: tk("First Stand"), icon: <Flag className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: tk("Tournaments"),
    icon: <CalendarRange className="w-3.5 h-3.5" />,
    items: [
      { kind: "weekly", label: tk("This week"), icon: <CalendarRange className="w-3.5 h-3.5" /> },
      { kind: "tournaments", label: tk("Tournaments"), icon: <CalendarRange className="w-3.5 h-3.5" /> },
      { kind: "leagues", label: tk("Leagues"), icon: <Layers className="w-3.5 h-3.5" /> },
      { kind: "titles", label: tk("Titles"), icon: <Trophy className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: tk("Teams & players"),
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    items: [
      { kind: "rankings", label: tk("Rankings"), icon: <TrendingUp className="w-3.5 h-3.5" /> },
      { kind: "leaders", label: tk("Leaderboards"), icon: <ListOrdered className="w-3.5 h-3.5" /> },
      { kind: "compare", label: tk("Compare"), icon: <GitCompare className="w-3.5 h-3.5" /> },
      { kind: "records", label: tk("Records"), icon: <Medal className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: tk("Champions"),
    icon: <Swords className="w-3.5 h-3.5" />,
    items: [
      { kind: "champions", label: tk("Champions"), icon: <Swords className="w-3.5 h-3.5" /> },
      { kind: "counters", label: tk("Counters"), icon: <Crosshair className="w-3.5 h-3.5" /> },
      { kind: "tiers", label: tk("Tier list"), icon: <Rows3 className="w-3.5 h-3.5" /> },
      { kind: "patches", label: tk("Patches"), icon: <History className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: tk("Tools"),
    icon: <Wrench className="w-3.5 h-3.5" />,
    items: [
      { kind: "prep", label: tk("Match prep"), icon: <ClipboardList className="w-3.5 h-3.5" /> },
      { kind: "draft", label: tk("Draft board"), icon: <LayoutGrid className="w-3.5 h-3.5" /> },
      { kind: "finder", label: tk("Game finder"), icon: <Search className="w-3.5 h-3.5" /> },
      { kind: "best", label: tk("Best games"), icon: <Flame className="w-3.5 h-3.5" /> },
      { kind: "data", label: tk("Data"), icon: <Database className="w-3.5 h-3.5" /> },
    ],
  },
];
const SECTIONS: MenuItem[] = GROUPS.flatMap((g) => g.items);
/** pages whose address carries what they show (teams, filters): their link is worth copying */
const LINKABLE = new Set<SectionKind>(["prep", "draft", "finder", "compare", "best", "champions", "counters", "leaders", "tiers"]);

/** pages that are one big table: kept at the two-column width on very wide screens (App.css .rw-capped) */
const CAPPED_KINDS = new Set(["weekly", "tournaments", "leagues", "rankings", "titles", "best", "champions", "patches", "data", "finder", "counters", "leaders"]);

// ── Compare ───────────────────────────────────────────────────────────────


// ── The Stats tab ─────────────────────────────────────────────────────────

export const StatsView: React.FC<StatsViewProps> = ({
  settings,
  onOpenUrl,
  schedule,
  catalog,
}) => {
  useChampionNames();
  useDDragon();
  const route = useHubRoute();
  const statsMeta = useLoad<StatsMeta>(loadStatsMeta, []);
  const hubMeta = useLoad(loadHubMeta, []);
  const scroller = useRef<HTMLDivElement>(null);
  // the section menu is one sideways row on phones: keep the open section in view
  const sectionRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = sectionRow.current;
    const on = row?.querySelector<HTMLElement>(".bg-rw-accent");
    if (row && on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  }, [route.kind]);
  const lastRoute = useRef(route);
  useEffect(() => {
    const prev = lastRoute.current;
    lastRoute.current = route;
    // switching games inside one series keeps the place on the page
    if (prev.kind === "match" && route.kind === "match" && "slug" in prev && "slug" in route && prev.slug === route.slug) return;
    scroller.current?.scrollTo({ top: 0 });
  }, [route]);

  const isSection = SECTIONS.some((s) => s.kind === route.kind);
  // pages without a title heading of their own: the "Pro stats" header is their <h1>, with the page's name
  const ownTitle = !OWN_H1.has(route.kind);
  const sectionName = GROUPS.flatMap((g) => g.items).find((it) => it.kind === route.kind)?.label || (route.kind === "about" ? tk("About") : "");
  const group = GROUPS.find((g) => g.items.some((i) => i.kind === route.kind));
  const pillClass = (on: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 whitespace-nowrap ${
      on ? "bg-rw-accent/10 text-rw-accent border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
    }`;
  const back = () => {
    if (!hubBack()) navigateHub({ kind: "home" });
  };

  return (
    <OpenUrlContext.Provider value={onOpenUrl}>
    <RiotCatalogContext.Provider value={catalog || null}>
    <SpoilerProvider on={settings.spoilerMode}>
      <div
        ref={scroller}
        className="p-4 space-y-4 page-5xl overflow-y-auto h-full"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-rw-border">
          {ownTitle ? (
            <h1 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-2">
              {tl("Pro Stats")}
              {sectionName && <span className="text-rw-text">· {tl(sectionName)}</span>}
            </h1>
          ) : (
            <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-2">
              {tl("Pro Stats")}
            </h2>
          )}
          {hubMeta.data && (
            <span className="text-[11px] text-rw-muted">
              {tl("{n} pro games · {from}–{to} · updated through the day", {
                n: fmtNum(hubMeta.data.games),
                from: "2011",
                to:
                  hubMeta.data.years.find(
                    (y) => y <= String(new Date().getFullYear()),
                  ) || "",
              })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isSection && (
            <button
              type="button"
              onClick={back}
              className="flex items-center gap-1 min-h-8 px-1.5 -ml-1.5 rounded text-xs text-rw-teal hover:underline shrink-0"
              aria-label={tl("Back")}
            >
              <ArrowLeft className="w-3.5 h-3.5" />{" "}
              {canGoBack() ? tl("Back") : tl("Stats home")}
            </button>
          )}
          {(!isSection || LINKABLE.has(route.kind)) && <CopyLinkButton url={hubShareUrl(route)} />}
          {/* phones: one row that scrolls sideways, so the page itself starts near the top; wider screens: wrapped */}
          <div
            ref={sectionRow}
            className="relative flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 w-[calc(100%+2rem)] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:w-auto"
            role="tablist"
          >
            {GROUPS.map((g) => (
              <HubLink key={g.label} to={{ kind: g.items[0].kind } as HubRoute} className={pillClass(g === group)}>
                {g.icon}
                {tl(g.label)}
              </HubLink>
            ))}
          </div>
          {/* the open group's pages */}
          {group && group.items.length > 1 && (
            <div
              className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 w-[calc(100%+2rem)] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:w-full"
              role="tablist"
              aria-label={tl(group.label)}
            >
              {group.items.map((i) => (
                <HubLink key={i.kind} to={{ kind: i.kind } as HubRoute} className={pillClass(route.kind === i.kind).replace("bg-rw-accent/10 text-rw-accent border-rw-accent", "bg-rw-raised text-rw-text border-rw-line")}>
                  {i.icon}
                  {tl(i.label)}
                </HubLink>
              ))}
            </div>
          )}
          {route.kind !== "home" && (
            <div className="w-full sm:w-64 sm:ml-auto">
              <HubSearch placeholder={tl("Search…")} />
            </div>
          )}
        </div>

        {settings.spoilerMode && (
          <p className="text-[11px] text-rw-accent bg-rw-accent/10 border border-rw-accent/30 rounded-lg px-3 py-2">
            {tl(
              "Spoiler mode is on: results from the last two weeks are hidden until you reveal them. Older results and career stats still show.",
            )}
          </p>
        )}

        <div className={CAPPED_KINDS.has(route.kind) ? "rw-capped" : undefined}>
        {/* one page's crash shows its own error; the next page starts fresh (the menu and search stay usable).
            Keyed by the page, not its filters, so changing a period or a filter doesn't restart it. */}
        <PartBoundary key={`${route.kind}:${"slug" in route ? route.slug : ""}`}>
        <Suspense fallback={<Loading />}>
        {route.kind === "home" && <HubHome schedule={schedule} />}
        {route.kind === "tournaments" && (
          <EventsBrowse
            year={route.year}
            meta={hubMeta.data}
            onYear={(y) =>
              navigateHub({ kind: "tournaments", year: y }, { replace: true })
            }
          />
        )}
        {route.kind === "leagues" && <LeaguesPanel />}
        {route.kind === "patches" && <PatchesPanel />}
        {route.kind === "league" && <LeaguePage slug={route.slug} year={"year" in route ? route.year : undefined} />}
        {route.kind === "champions" &&
          (statsMeta.data ? (
            <ChampionsPage meta={statsMeta.data} query={"query" in route ? route.query : undefined} />
          ) : statsMeta.error ? (
            <Failed />
          ) : (
            <Loading />
          ))}
        {route.kind === "records" && <RecordsPanel />}
        {route.kind === "data" && <DownloadsPage onOpenUrl={IS_WEB ? undefined : onOpenUrl} />}
        {route.kind === "about" && <AboutPage onOpenUrl={IS_WEB ? undefined : onOpenUrl} />}
        {route.kind === "prep" && <PrepPage route={route as PrepRoute} />}
        {route.kind === "rankings" && <RankingsPage />}
        {route.kind === "finder" && <FinderPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "draft" && <DraftPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "best" && <BestPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "counters" && <CountersPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "leaders" && <LeadersPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "tiers" &&
          (statsMeta.data ? <TiersPage meta={statsMeta.data} query={"query" in route ? route.query : undefined} /> : statsMeta.error ? <Failed /> : <Loading />)}
        {route.kind === "aboutme" && <AboutMePage onOpenUrl={IS_WEB ? undefined : onOpenUrl} />}
        {route.kind === "titles" && <TitlesPanel />}
        {route.kind === "weekly" && <WeeklyPage />}
        {route.kind === "compare" && <ComparePage route={route as CompareRoute} />}
        {route.kind === "team" && <TeamPage slug={route.slug} />}
        {route.kind === "player" && (
          <PlayerPage slug={route.slug} onOpenUrl={onOpenUrl} />
        )}
        {route.kind === "event" && <EventPage slug={route.slug} onOpenUrl={IS_WEB ? undefined : onOpenUrl} />}
        {route.kind === "match" && (
          <MatchPage slug={route.slug} game={route.game} onOpenUrl={onOpenUrl} />
        )}
        {route.kind === "champ" && <ChampPage slug={route.slug} />}
        {(route.kind === "worlds" || route.kind === "msi" || route.kind === "first-stand") && (
          <WorldsPage key={route.kind} kind={route.kind} year={"year" in route ? route.year : undefined} schedule={schedule} />
        )}
        </Suspense>
        </PartBoundary>
        </div>

        <p className="text-[10px] text-rw-muted text-center pt-2">
          {tl(
            "Stats come from RiftWise's pro games catalog (built from public Leaguepedia data) and are rebuilt whenever new games come in.",
          )}
        </p>
        <p className="text-[11px] text-center flex flex-wrap justify-center gap-x-3 gap-y-1">
          <HubLink to={{ kind: "about" }} className="text-rw-sub hover:text-rw-accent hover:underline">
            {tl("How we count")}
          </HubLink>
          <HubLink to={{ kind: "aboutme" }} className="text-rw-sub hover:text-rw-accent hover:underline">
            {tl("About RiftWise")}
          </HubLink>
          <a
            href={reportUrl(hubShareUrl(route))}
            onClick={(e) => {
              if (!IS_WEB) {
                e.preventDefault();
                onOpenUrl(reportUrl(hubShareUrl(route)));
              }
            }}
            className="text-rw-sub hover:text-rw-accent hover:underline"
          >
            {tl("Report a wrong stat")}
          </a>
          <HubLink to={{ kind: "data" }} className="text-rw-sub hover:text-rw-accent hover:underline">
            {tl("Data downloads")}
          </HubLink>
        </p>
      </div>
    </SpoilerProvider>
    </RiotCatalogContext.Provider>
    </OpenUrlContext.Provider>
  );
};
