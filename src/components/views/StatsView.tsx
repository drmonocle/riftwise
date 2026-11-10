import React, { Suspense, useEffect, useRef } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AppSettings, Match, CatalogData } from "../../types";
import { IS_WEB } from "../../platform";
import { StatsMeta, loadStatsMeta } from "../../stats";
import { tl, tk } from "../../i18n";
import { useChampionNames } from "../../champions";
import { loadHubMeta } from "../../hub/data";
import { CompareRoute, HubRoute, PrepRoute, canGoBack, hubBack, hubShareUrl, navigateHub, useHubRoute } from "../../hub/route";
import { PartBoundary } from "../PartBoundary";
import { useDDragon } from "../../hub/ddragon";
import { CopyLinkButton, Failed, HubLink, Loading, OpenUrlContext, SpoilerProvider, useCurrentTitle, useLoad } from "../hub/ui";
import { groupOf, MENU_ITEMS, subPillClass } from "../hub/menu";
import type { TabKey } from "../Navigation";

import { lazyPart } from "../../lazyPart";
import { reportUrl } from "../../feedback";
import { pageCode } from "../hub/pageCode";

import { RiotCatalogContext } from "../../hub/riotCatalog";

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
const ItemsPage = lazyPart(() => pageCode.items().then((m) => m.ItemsPage));
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
const TeamsDirectory = lazyPart(() => pageCode.teams().then((m) => m.TeamsDirectory));
const PlayersDirectory = lazyPart(() => pageCode.players().then((m) => m.PlayersDirectory));

interface StatsViewProps {
  settings: AppSettings;
  onOpenUrl: (url: string) => void;
  /** upcoming matches (today's matches and "On the line today" on the front page) */
  schedule?: Match[];
  /** matches in progress (the front page's live card) */
  liveMatches?: Match[];
  /** Riot's team list: player photos and team logos (Match prep) */
  catalog?: CatalogData | null;
  /** the front page opens the Matches tab (live scores) and a team's roster */
  onSelectTab?: (tab: TabKey) => void;
  onSelectTeam?: (code: string, name?: string) => void;
}

type SectionKind = HubRoute["kind"];
/** pages whose own title is their <h1> (the others get the page's name over them as theirs) */
const OWN_H1 = new Set(["home", "worlds", "msi", "first-stand", "rankings", "records", "prep", "draft", "finder", "best", "counters", "items", "leaders", "tiers", "team", "player", "event", "champ", "league", "match", "aboutme"]);

/** pages whose address carries what they show (teams, filters): their link is worth copying */
const LINKABLE = new Set<SectionKind>(["prep", "draft", "finder", "compare", "best", "champions", "counters", "items", "leaders", "tiers", "teams", "players", "data", "rankings", "records", "tournaments", "leagues", "patches", "titles", "weekly", "worlds", "msi", "first-stand"]);

/** pages that are one big table: kept at the two-column width on very wide screens (App.css .rw-capped) */
const CAPPED_KINDS = new Set(["weekly", "tournaments", "leagues", "rankings", "titles", "best", "champions", "patches", "data", "finder", "counters", "items", "leaders", "teams", "players"]);

/** what a page about one thing is called in the breadcrumb over it */
const KIND_NAME: Partial<Record<SectionKind, string>> = {
  team: tk("Teams"),
  player: tk("Players"),
  event: tk("Tournaments"),
  league: tk("Leagues"),
  match: tk("Tournaments"),
  champ: tk("Champions"),
  about: tk("How we count"),
  aboutme: tk("About"),
};
/** the list a kind of page is reached from (the breadcrumb's first link) */
const KIND_LIST: Partial<Record<SectionKind, HubRoute>> = {
  team: { kind: "teams" },
  player: { kind: "players" },
  event: { kind: "tournaments" },
  league: { kind: "leagues" },
  match: { kind: "tournaments" },
  champ: { kind: "champions" },
};

/**
 * Carries active filter/team/player/champion/league/year context when switching between sibling pills in the top
 * section bar (e.g. Match prep <-> Draft board <-> Compare <-> Game finder, or Champions <-> Tier list <-> Counters).
 * Clicking the already-open section pill returns a clean route (`{ kind: targetKind }`) to reset filters.
 */
export function siblingSectionRoute(current: HubRoute, targetKind: HubRoute["kind"]): HubRoute {
  if (targetKind === current.kind) return { kind: targetKind } as HubRoute;
  const params = new URLSearchParams("query" in current && current.query ? current.query : "");
  let teamA: string | undefined;
  let teamB: string | undefined;
  let playerA: string | undefined;
  let playerB: string | undefined;
  if (current.kind === "prep") {
    teamA = current.a;
    teamB = current.b;
  } else if (current.kind === "compare") {
    if (current.mode === "player") {
      playerA = current.a;
      playerB = current.b;
    } else {
      teamA = current.a;
      teamB = current.b;
    }
  }
  const qTeams = params.get("teams");
  if (!teamA && qTeams) {
    const parts = qTeams.split(",").map((s) => s.trim()).filter(Boolean);
    teamA = parts[0];
    teamB = parts[1];
  }
  if (!teamA && params.get("team")) {
    teamA = params.get("team") || undefined;
    teamB = params.get("vs") || undefined;
  }
  if (!playerA && params.get("player")) {
    playerA = params.get("player") || undefined;
    playerB = params.get("vsplayer") || undefined;
  }
  const rawPeriod =
    ("period" in current && current.period ? current.period : "") ||
    params.get("p") ||
    params.get("key") ||
    params.get("patch") ||
    "";
  const periodYearMatch = /^y(\d{4})$/i.exec(rawPeriod);
  const year =
    ("year" in current && current.year ? current.year : "") ||
    params.get("year") ||
    (periodYearMatch ? periodYearMatch[1] : "");
  const period = rawPeriod || (year ? `y${year}` : "");
  const league =
    params.get("league") ||
    ((current.kind === "champions" || current.kind === "tiers") ? params.get("scope") || "" : "");
  const event = params.get("event") || "";
  const role = params.get("role") || "";
  const champ = params.get("champ") || "";
  const region = params.get("region") || "";
  const q = params.get("q") || "";

  if (targetKind === "prep") {
    return {
      kind: "prep",
      ...(teamA ? { a: teamA } : {}),
      ...(teamB ? { b: teamB } : {}),
      ...(period ? { period } : {}),
    };
  }
  if (targetKind === "compare") {
    if (playerA || playerB) {
      return {
        kind: "compare",
        mode: "player",
        ...(playerA ? { a: playerA } : {}),
        ...(playerB ? { b: playerB } : {}),
        ...(period ? { period } : {}),
      };
    }
    return {
      kind: "compare",
      mode: "team",
      ...(teamA ? { a: teamA } : {}),
      ...(teamB ? { b: teamB } : {}),
      ...(period ? { period } : {}),
    };
  }
  if (targetKind === "draft") {
    const next = new URLSearchParams();
    if (teamA || teamB) next.set("teams", [teamA, teamB].filter(Boolean).join(","));
    if (period) next.set("p", period);
    if (champ) next.set("champ", champ);
    if (role) next.set("role", role);
    const qs = next.toString();
    return { kind: "draft", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "finder") {
    const next = new URLSearchParams();
    if (teamA) next.set("team", teamA);
    if (teamB) next.set("vs", teamB);
    if (playerA) next.set("player", playerA);
    if (playerB) next.set("vsplayer", playerB);
    if (champ) next.set("champ", champ);
    if (event) next.set("event", event);
    if (league) next.set("league", league);
    if (year) next.set("year", year);
    const qs = next.toString();
    return { kind: "finder", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "items") {
    const next = new URLSearchParams();
    if (playerA) next.set("player", playerA);
    if (champ) next.set("champ", champ);
    const qs = next.toString();
    return { kind: "items", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "data") {
    const next = new URLSearchParams();
    if (league) next.set("league", league);
    if (year) next.set("year", year);
    const qs = next.toString();
    return { kind: "data", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "champions" || targetKind === "tiers") {
    const next = new URLSearchParams();
    if (league) next.set("scope", league);
    if (period) next.set("key", period);
    if (event) next.set("event", event);
    if (role) next.set("role", role);
    if (q || champ) next.set("q", q || champ);
    const qs = next.toString();
    return { kind: targetKind, ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "counters") {
    const next = new URLSearchParams();
    if (champ || q) next.set("champ", champ || q);
    if (role) next.set("role", role);
    if (event) next.set("event", event);
    if (period) next.set("patch", period);
    const qs = next.toString();
    return { kind: "counters", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "patches") {
    const next = new URLSearchParams();
    if (q || champ) next.set("q", q || champ);
    const qs = next.toString();
    return { kind: "patches", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "teams") {
    const next = new URLSearchParams();
    if (region) next.set("region", region);
    if (q) next.set("q", q);
    const qs = next.toString();
    return { kind: "teams", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "rankings") {
    const next = new URLSearchParams();
    if (region) next.set("region", region);
    if (league) next.set("league", league);
    if (q) next.set("q", q);
    const qs = next.toString();
    return { kind: "rankings", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "players") {
    const next = new URLSearchParams();
    if (role) next.set("role", role);
    if (q) next.set("q", q);
    const qs = next.toString();
    return { kind: "players", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "leaders") {
    const next = new URLSearchParams();
    if (role) next.set("role", role);
    if (league) next.set("league", league);
    if (year) next.set("year", year);
    if (event) next.set("event", event);
    if (q) next.set("q", q);
    const qs = next.toString();
    return { kind: "leaders", ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "tournaments") {
    const next = new URLSearchParams();
    if (league) next.set("league", league);
    if (q) next.set("q", q);
    const qs = next.toString();
    return { kind: "tournaments", ...(year ? { year } : {}), ...(qs ? { query: qs } : {}) };
  }
  if (targetKind === "worlds" || targetKind === "msi" || targetKind === "first-stand") {
    return { kind: targetKind, ...(year ? { year } : {}) };
  }
  if (targetKind === "best") {
    const next = new URLSearchParams();
    if (year) next.set("year", year);
    if (league) next.set("league", league);
    if (event) next.set("event", event);
    if (q) next.set("q", q);
    const qs = next.toString();
    return { kind: "best", ...(qs ? { query: qs } : {}) };
  }
  return { kind: targetKind } as HubRoute;
}

// ── The stats pages ───────────────────────────────────────────────────────

export const StatsView: React.FC<StatsViewProps> = ({ settings, onOpenUrl, schedule, liveMatches, catalog, onSelectTab, onSelectTeam }) => {
  useChampionNames();
  useDDragon();
  const route = useHubRoute();
  const needsStatsMeta = route.kind === "champions" || route.kind === "tiers";
  const needsHubMeta = route.kind === "tournaments";
  const statsMeta = useLoad<StatsMeta | null>(() => (needsStatsMeta ? loadStatsMeta() : Promise.resolve(null)), [needsStatsMeta]);
  const hubMeta = useLoad(() => (needsHubMeta ? loadHubMeta() : Promise.resolve(null)), [needsHubMeta]);
  const pageTitle = useCurrentTitle(route);
  const scroller = useRef<HTMLDivElement>(null);
  // the open group's pages are one sideways row on phones: keep the open page in view
  const sectionRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = sectionRow.current;
    const on = row?.querySelector<HTMLElement>(".bg-rw-raised");
    if (row && on && row.scrollWidth > row.clientWidth) {
      row.scrollLeft = on.offsetLeft + on.offsetWidth <= row.clientWidth - 8 ? 0 : on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    }
  }, [route.kind]);
  const lastRoute = useRef(route);
  useEffect(() => {
    const prev = lastRoute.current;
    lastRoute.current = route;
    const samePage = prev.kind === route.kind && "slug" in prev && "slug" in route && prev.slug === route.slug;
    // switching games inside one series keeps the place on the page, and so does switching a page's tabs (the tabs
    // bring themselves to the top when they had scrolled away: PageTabs)
    if (samePage && (route.kind === "match" || "tab" in prev || "tab" in route)) return;
    scroller.current?.scrollTo({ top: 0 });
  }, [route]);

  const isSection = MENU_ITEMS.some((s) => s.kind === route.kind);
  // pages without a title heading of their own get the page's name as theirs
  const ownTitle = !OWN_H1.has(route.kind);
  const sectionName = MENU_ITEMS.find((it) => it.kind === route.kind)?.label || KIND_NAME[route.kind] || "";
  // a team's or player's page sits under Teams or Players, a tournament under Tournaments... (menu.tsx)
  const group = groupOf(route.kind);
  const crumbs = !isSection && route.kind !== "home" && route.kind !== "about" && route.kind !== "aboutme";

  return (
    <OpenUrlContext.Provider value={onOpenUrl}>
    <RiotCatalogContext.Provider value={catalog || null}>
    <SpoilerProvider on={settings.spoilerMode}>
      <div
        ref={scroller}
        className="p-4 space-y-4 page-5xl overflow-y-auto h-full"
      >
        {route.kind !== "home" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* the desktop app has no browser Back button: its own, while there is a page to go back to */}
            {!IS_WEB && canGoBack() && (
              <button type="button" onClick={() => hubBack()} className="flex items-center gap-1 min-h-8 px-1.5 -ml-1.5 rounded text-xs text-rw-accent hover:underline shrink-0" aria-label={tl("Back")}>
                <ArrowLeft className="w-3.5 h-3.5" /> {tl("Back")}
              </button>
            )}
            {/* the open group's pages; phones: one row that scrolls sideways, so the page itself starts near the top */}
            {isSection && group && group.items.length > 1 && (
              <div
                ref={sectionRow}
                className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 w-[calc(100%+2rem)] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:w-auto"
                role="tablist"
                aria-label={tl(group.label)}
              >
                {group.items.map((i) => (
                  <HubLink key={i.kind} to={siblingSectionRoute(route, i.kind)} className={subPillClass(route.kind === i.kind)}>
                    {i.icon}
                    {tl(i.label)}
                  </HubLink>
                ))}
              </div>
            )}
            {/* a team, player, tournament, match, league or champion: where it sits, then its own name */}
            {crumbs && (
              <nav aria-label={tl("Breadcrumb")} className="flex items-center gap-1 text-xs min-w-0">
                <HubLink to={KIND_LIST[route.kind] || { kind: "home" }} className="text-rw-accent hover:underline shrink-0">
                  {tl(sectionName)}
                </HubLink>
                <ChevronRight className="w-3 h-3 text-rw-muted shrink-0" aria-hidden="true" />
                <span className="text-rw-text font-semibold truncate">{pageTitle || "…"}</span>
              </nav>
            )}
            {(route.kind === "about" || route.kind === "aboutme") && (
              <nav aria-label={tl("Breadcrumb")} className="flex items-center gap-1 text-xs min-w-0">
                <HubLink to={{ kind: "home" }} className="text-rw-accent hover:underline shrink-0">
                  RiftWise
                </HubLink>
                <ChevronRight className="w-3 h-3 text-rw-muted shrink-0" aria-hidden="true" />
                <span className="text-rw-text font-semibold truncate">{tl(sectionName)}</span>
              </nav>
            )}
            {(!isSection || LINKABLE.has(route.kind)) && (
              <div className="ml-auto flex items-center gap-2">
                <CopyLinkButton url={hubShareUrl(route)} />
              </div>
            )}
          </div>
        )}
        {ownTitle && route.kind !== "home" && (
          <h1 className="font-head text-xl font-bold text-rw-text leading-tight">{tl(sectionName)}</h1>
        )}

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
        {route.kind === "home" && (
          <HubHome schedule={schedule} liveMatches={liveMatches} settings={settings} onOpenUrl={onOpenUrl} onSelectTab={onSelectTab} onSelectTeam={onSelectTeam} />
        )}
        {route.kind === "teams" && <TeamsDirectory query={"query" in route ? route.query : undefined} />}
        {route.kind === "players" && <PlayersDirectory query={"query" in route ? route.query : undefined} />}
        {route.kind === "tournaments" && (
          <EventsBrowse
            year={route.year}
            query={"query" in route ? route.query : undefined}
            meta={hubMeta.data}
            onYear={(y) => {
              const nextQ = new URLSearchParams("query" in route ? route.query || "" : "");
              nextQ.delete("year");
              const qs = nextQ.toString();
              navigateHub({ kind: "tournaments", year: y, ...(qs ? { query: qs } : {}) }, { replace: true });
            }}
          />
        )}
        {route.kind === "leagues" && <LeaguesPanel query={"query" in route ? route.query : undefined} />}
        {route.kind === "patches" && <PatchesPanel query={"query" in route ? route.query : undefined} />}
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
        {route.kind === "data" && <DownloadsPage onOpenUrl={IS_WEB ? undefined : onOpenUrl} query={"query" in route ? route.query : undefined} />}
        {route.kind === "about" && <AboutPage onOpenUrl={IS_WEB ? undefined : onOpenUrl} />}
        {route.kind === "prep" && <PrepPage route={route as PrepRoute} />}
        {route.kind === "rankings" && <RankingsPage />}
        {route.kind === "finder" && <FinderPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "draft" && <DraftPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "best" && <BestPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "counters" && <CountersPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "items" && <ItemsPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "leaders" && <LeadersPage query={"query" in route ? route.query : undefined} />}
        {route.kind === "tiers" &&
          (statsMeta.data ? <TiersPage meta={statsMeta.data} query={"query" in route ? route.query : undefined} /> : statsMeta.error ? <Failed /> : <Loading />)}
        {route.kind === "aboutme" && <AboutMePage onOpenUrl={IS_WEB ? undefined : onOpenUrl} />}
        {route.kind === "titles" && <TitlesPanel />}
        {route.kind === "weekly" && <WeeklyPage />}
        {route.kind === "compare" && <ComparePage route={route as CompareRoute} />}
        {route.kind === "team" && <TeamPage slug={route.slug} tab={"tab" in route ? route.tab : undefined} />}
        {route.kind === "player" && (
          <PlayerPage slug={route.slug} tab={"tab" in route ? route.tab : undefined} onOpenUrl={onOpenUrl} />
        )}
        {route.kind === "event" && <EventPage slug={route.slug} tab={"tab" in route ? route.tab : undefined} onOpenUrl={IS_WEB ? undefined : onOpenUrl} />}
        {route.kind === "match" && (
          <MatchPage slug={route.slug} game={route.game} onOpenUrl={onOpenUrl} />
        )}
        {route.kind === "champ" && <ChampPage slug={route.slug} query={"query" in route ? route.query : undefined} />}
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
