/**
 * Where each stats page's code is: every page is its own download (StatsView loads it when the page is opened).
 * main.tsx starts the one a visit opens on straight away, next to the stats code and the page's data.
 */
export const pageCode = {
  home: () => import("./HubHome"),
  tournaments: () => import("./HubHome"),
  leagues: () => import("./MetaPages"),
  patches: () => import("./MetaPages"),
  league: () => import("./MetaPages"),
  champions: () => import("./ChampionsPage"),
  records: () => import("./RecordsPage"),
  titles: () => import("./RecordsPage"),
  data: () => import("./DownloadsPage"),
  about: () => import("./AboutPage"),
  prep: () => import("./PrepPage"),
  rankings: () => import("./RankingsPage"),
  finder: () => import("./FinderPage"),
  draft: () => import("./DraftPage"),
  best: () => import("./BestPage"),
  counters: () => import("./CountersPage"),
  leaders: () => import("./LeadersPage"),
  tiers: () => import("./TiersPage"),
  aboutme: () => import("./AboutMePage"),
  compare: () => import("./ComparePage"),
  team: () => import("./TeamPage"),
  player: () => import("./PlayerPage"),
  event: () => import("./EventPage"),
  match: () => import("./MatchPage"),
  champ: () => import("./ChampPage"),
  worlds: () => import("./WorldsPage"),
  msi: () => import("./WorldsPage"),
  "first-stand": () => import("./WorldsPage"),
};

/** Start downloading one page's code (a failure shows, and is retried, where the page loads it). */
export function preloadPageCode(kind: string): void {
  (pageCode as Record<string, () => Promise<unknown>>)[kind]?.().catch(() => {});
}
