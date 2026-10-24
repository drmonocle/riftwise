/** Shapes of the stats hub files (built by scripts/stats/hub.py whenever the database changes, into stats/<version>/hub/). */
import type { Title } from "../stats";

export interface HubMeta {
  version: string;
  games: number;
  statsGames: number;
  series: number;
  teams: number;
  players: number;
  events: number;
  champs: number;
  years: string[];
}

/** [name, slug ("" = made from the name), games, last year, old names, short names, region] */
export type SearchTeamRow = [string, string, number, string, string, string, string];
/** [name, slug, last team, games, last year, role letter, real / native name] */
export type SearchPlayerRow = [string, string, string, number, string, string, string];
/** [name, slug, year, league, level letter (P/S...), end date, games] */
export type SearchEventRow = [string, string, string, string, string, string, number];
/** [name, slug, picks] */
export type SearchChampRow = [string, string, number];

export interface EventRef {
  n: string;
  u: string;
}

export interface EventListItem {
  n: string;
  u: string;
  l?: string;
  r?: string;
  lv?: string;
  st?: string;
  en?: string;
  g?: number;
  q?: number;
  w?: string;
  wu?: string | null;
  /** 1 = first in the regular-season standings (the playoffs decide the title) */
  rs?: number;
  p?: string;
  /** a whole event: how many stages it has, and their pages (builds from 2026-10-21 on) */
  kids?: number;
  c?: string[];
  /** series played so far (with a winner) and the average game length in minutes (builds from 2026-10-25 on) */
  sp?: number;
  m?: number;
}

export interface HubHome {
  latest: EventListItem[];
  /** running now or starting within two weeks (builds from 2026-10-15 on) */
  now?: EventListItem[];
  /** the year's busiest players; t / tu: their current club (builds from 2026-10-25 on) */
  busiest: { n: string; u: string | null; g: number; w: number; kda: number; t?: string; tu?: string | null }[];
  year: string;
}

export interface SeriesRow {
  g: string | null;
  a: string;
  au: string | null;
  ac: string | null;
  b: string;
  bu: string | null;
  bc: string | null;
  sa: number | null;
  sb: number | null;
  bo: number;
  date: string;
  w: 0 | 1 | 2;
  /** the series' game rating (0-100) */
  r?: number;
}

export interface Stage {
  name: string;
  kind: "bracket" | "list";
  series: SeriesRow[];
}

export interface StandingRow {
  t: string;
  u: string | null;
  pl: number | null;
  sw: number | null;
  sl: number | null;
  st?: number | null;
  gw: number | null;
  gl: number | null;
}

export interface LeaderRow {
  n: string;
  u: string | null;
  t: string;
  g: number;
  v: number;
}

export interface HubEvent {
  n: string;
  u: string;
  op: string;
  league?: string;
  region?: string;
  level?: string;
  start?: string;
  end?: string;
  year?: string;
  country?: string;
  type?: string;
  prize?: string;
  cur?: string;
  q?: number;
  po?: number;
  parent?: EventRef;
  siblings?: EventRef[];
  children?: EventRef[];
  results?: { p: string; t: string; u: string | null; usd?: number }[];
  resultsFrom?: "this" | "event";
  standings?: { name: string; rows: StandingRow[] }[];
  stages?: Stage[];
  /** img: Riot's logo (Worlds / MSI / First Stand builds from 2026-10-21 on), for the Worlds page's pickers */
  teams?: { t: string; u: string | null; g: number; w: number; sg: number; sw: number; img?: string }[];
  leaders?: Partial<Record<"kda" | "kills" | "csm" | "dpm" | "pool", LeaderRow[]>>;
  champs?: { c: string; p: number; w: number; b: number }[];
  statsGames?: number;
  games?: number;
  series?: number;
  /** every player's sums in this tournament (rates are worked out in the app) */
  players?: EventPlayer[];
  teamStats?: EventTeamStats[];
  /** league page slug */
  lu?: string | null;
  /** a whole event (Worlds = Play-In + Main Event): its tables sum its stages */
  whole?: number;
  overview?: EventOverview | null;
  rosters?: EventRoster[];
  /** international events: series won between regions */
  regions?: { a: string; b: string; wa: number; wb: number }[];
}

export interface EventPlayer {
  n: string;
  u: string | null;
  t: string;
  tu: string | null;
  r: string;
  g: number;
  w: number;
  k: number;
  d: number;
  a: number;
  /** team kills in the games played (for kill participation) */
  tk: number;
  cs: number;
  gold: number;
  dmg: number;
  /** minutes of the games with cs / gold / damage */
  min: number;
  /** minutes of the games that recorded damage (builds from 2026-10-18 on; none before 2015) */
  dm?: number;
  vis: number;
  vmin: number;
  c: string[];
  nc: number;
  /** own and team totals of damage, gold and vision (for the shares) */
  sd?: number;
  td?: number;
  sg?: number;
  tg?: number;
  sv?: number;
  tv?: number;
  /** Player of the Game awards in this tournament */
  mvp?: number;
  /** Oracle's Elixir: games with leads at 15 minutes, and the sums of the gold / CS / XP leads */
  tn?: number;
  g15?: number;
  c15?: number;
  x15?: number;
  /** Oracle's Elixir: games where first blood is known, ones they took part in, ones they died in */
  fbn?: number;
  fbp?: number;
  fbv?: number;
}

export interface EventTeamStats {
  t: string;
  u: string | null;
  g: number;
  w: number;
  min: number;
  k: number;
  d: number;
  gd: number;
  drag: number;
  bar: number;
  tow: number;
  her: number;
  grub: number;
  gold?: number;
  /** towers lost */
  tl?: number;
  odrag?: number;
  obar?: number;
  oher?: number;
  blue?: number;
  /** games with player rows, their minutes, team CS and damage */
  pg?: number;
  pmin?: number;
  cs?: number;
  dmg?: number;
  /** Oracle's Elixir: games with the gold lead at 15 and its sum; games with first blood / tower known, firsts taken;
   *  games with turret plates known, plates taken and lost */
  tn?: number;
  g15?: number;
  fbn?: number;
  fb?: number;
  ft?: number;
  pln?: number;
  pl?: number;
  opl?: number;
}

/** [date, opponent, opponent slug, won, lost, event, event slug, series slug, stage, name played under, series rating
 *  (builds from 2026-10-18 on)] */
export type TeamSeriesRow = [string, string, string | null, number, number, string, string, string | null, string, string, (number | null)?];
/**
 * Oracle's Elixir's numbers for a player's game: [gd10, csd10, xpd10, gd15, csd15, xpd15, gd20, csd20, xpd20,
 * first blood (1 got the kill, 2 assisted, 3 died, 0 none), wards placed, wards killed, control wards bought]
 * (leads are against the lane opponent; any of them can be null)
 */
export type PlayerTimeline = (number | null)[];
/**
 * [date, series slug, champion, k, d, a, won, team, opponent, event, role, event slug,
 *  cs, gold, damage, vision, minutes, team kills, team damage, team gold, team vision, timeline, game number, game rating]
 * (cs .. team vision are in builds from 2026-10-16 on, the timeline from 2026-10-17, the game number from 2026-10-18;
 * null when the game has no full scoreboard / Oracle's Elixir doesn't have it)
 */
export type PlayerGameRow = [
  string, string, string, number, number, number, number, string, string, string, string, string,
  (number | null)?, (number | null)?, (number | null)?, (number | null)?, (number | null)?,
  (number | null)?, (number | null)?, (number | null)?, (number | null)?, (PlayerTimeline | null)?, number?, (number | null)?,
];
/**
 * Oracle's Elixir's numbers for a team's game: [gd10, gd15, gd20, csd15, xpd15, first blood, first tower,
 * first mid tower, first to three towers, first dragon, first herald, first baron (1/0), plates, opp plates,
 * grubs, opp grubs, wards placed, wards killed, control wards bought, vision score] (any of them can be null)
 */
export type TeamTimeline = (number | null)[];
/**
 * [date, series slug, event slug, event, opponent, its slug, side "b"/"r", won 0/1, minutes, kills, deaths,
 *  gold, opp gold, dragons, opp dragons, barons, opp barons, towers, opp towers, bans, picks, opponent's bans,
 *  roles of the picks, timeline, each pick's gold lead over its lane opponent at 15]
 */
export type TeamGameRow = [
  string, string, string, string, string, string | null, "b" | "r", number, number | null, number | null, number | null,
  number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null,
  string[], string[], string[]?, number[]?, (TeamTimeline | null)?, ((number | null)[] | null)?,
];

export interface SideStats {
  k?: number;
  gold?: number;
  towers?: number;
  drag?: number;
  barons?: number;
  heralds?: number;
  inhib?: number;
  bans?: string[];
  picks?: string[];
  drakes?: Partial<Record<"cloud" | "infernal" | "mountain" | "ocean" | "hextech" | "chemtech", number>>;
  elders?: number;
  grubs?: number;
  atakhan?: number;
  /** Oracle's Elixir: gold lead at 15 minutes, first blood / first tower (1/0), turret plates */
  g15?: number;
  /** gold lead at 10 and 20 minutes, XP lead at 15 (builds from 2026-10-18 on) */
  g10?: number;
  g20?: number;
  x15?: number;
  fb?: number;
  ft?: number;
  pl?: number;
}

export interface GamePlayer {
  s: 1 | 2;
  r?: string;
  n: string;
  u?: string;
  c?: string;
  k: number;
  d: number;
  a: number;
  cs?: number;
  gd?: number;
  dm?: number;
  v?: number;
  it?: string[];
  tr?: string;
  sp?: string[];
  ks?: string;
  pt?: string;
  stt?: string;
  rn?: string[];
  /** Oracle's Elixir: gold / CS / XP lead over the lane opponent at 15 minutes */
  g15?: number;
  c15?: number;
  x15?: number;
  /** gold and XP leads at 10 and 20 minutes (builds from 2026-10-18 on) */
  g10?: number;
  x10?: number;
  g20?: number;
  x20?: number;
}

export interface HubGame {
  n: number;
  /** 1 = team a won, 2 = team b won, 0 = unknown */
  w: 0 | 1 | 2;
  /** which series team played on blue side */
  blue: "a" | "b";
  patch?: string;
  date?: string;
  /** f = full stats, r = result only, s = scheduled only */
  st: "f" | "r" | "s";
  vod?: string;
  /** the same VOD at the draft and at the game start (Leaguepedia timestamps) */
  vpb?: string;
  vgs?: string;
  ff?: number;
  remake?: number;
  /** Player of the Game */
  mvp?: { n: string; u: string | null };
  min?: number | null;
  t?: { blue: SideStats; red: SideStats };
  p?: GamePlayer[];
  /** game rating 0-100 (MEPI): action, closeness, length, stakes, series drama, comebacks */
  r?: number;
}

export interface HubSeries {
  e: string;
  en: string;
  stage: string;
  date: string;
  bo: number;
  a: { n: string; u: string | null; c: string | null };
  b: { n: string; u: string | null; c: string | null };
  sa: number;
  sb: number;
  w: 0 | 1 | 2;
  games: HubGame[];
  /** the series' rating: its best game's (0-100) */
  r?: number;
  /** 1: the league gave the result by forfeit, so the score doesn't follow the games played */
  ff?: 1;
}

/**
 * A rated game (hub/best/...): [rating 0-100, series slug, game number, date, event, event slug, stage, team a, its slug,
 * team b, its slug, winner 1 = a / 2 = b, minutes, kills a, kills b, has a VOD 1/0, league slug]
 */
export type BestGame = [
  number, string, number, string, string, string, string, string, string | null, string, string | null, 1 | 2,
  number | null, number | null, number | null, 0 | 1, string | null,
];
/** A rated series: [rating, slug, date, event, event slug, stage, a, a slug, b, b slug, games won a, b,
 * best game's number, games played, league slug, each game's rating in order (builds from 2026-10-18 on)] */
export type BestSeries = [
  number, string, string, string, string, string, string, string | null, string, string | null, number, number, number, number,
  string | null, (number | null)[]?,
];
export interface BestFile {
  g: BestGame[];
  s: BestSeries[];
}
/** hub/best/index.json: years with rated games, and leagues: [slug, name, short name, main league 1/0, years] */
export interface BestIndex {
  years: string[];
  leagues: [string, string, string | null, number, string[]][];
  n: number;
}

/** A team's power rating (hub/ratings.json, scripts/stats/ratings.py); only for teams active in the last 120 days. */
export interface TeamRating {
  r: number;
  /** rank among active teams in top leagues, and how many there are (null for second-tier teams: their
   *  leagues never meet the top ones, so only their league rank means something) */
  rank: number | null;
  of: number;
  /** home league (Leaguepedia name) and rank in it */
  league: string;
  lrank: number;
  /** change over the last 30 days (null: no rating 30 days ago) */
  chg30: number | null;
}
/** slug, name, code, league, league slug, rating, 30-day change, games rated, last game, tier (1 top league, 2 second tier) */
/** [slug, team, code, league, league slug, rating, change over 30 days, games, last game, tier 1/2, league short name, country code] */
export type RatingRow = [string, string, string, string, string | null, number, number | null, number, string, number, string?, (string | null)?];
export interface RatingScore {
  n: number;
  acc?: number;
  brier?: number;
  logloss?: number;
}
export interface HubRatings {
  asof: string;
  games: number;
  /** the last days' rated series, "date|slug|slug" (builds from 2026-10-23 on): the app adds only newer results */
  rated?: string[];
  /** published points one game moves: top-league and international games */
  k?: { top: number; intl: number };
  /** added in the app from Riot's schedule since the build (src/hub/liveRatings.ts) */
  live?: { series: number; games: number };
  teams: RatingRow[];
  /** top leagues: league, league slug, average rating of its best four teams, active teams */
  leagues: [string, string | null, number, number][];
  /** calibration on top of the published (top-league) scale: rating difference x intl for teams from two leagues,
   * x other below the top leagues; a series' per-game edge over 50% x series[best of] */
  adjust?: { intl: number; other: number; series: Record<string, number> };
  test: {
    from: string;
    all: RatingScore;
    /** best of "3" / "5": favourite's chance from-to (%), series, how often the favourite won, chance given on average */
    series?: Record<string, [number, number, number, number, number?][]>;
    intl: RatingScore;
    settled: RatingScore;
    /** games between a top-league and a second-tier team: average chance we gave the top-league side, how often it won */
    cross?: { n: number; pred?: number; won?: number };
    /** favourite's chance from-to (%), games, how often the favourite won, chance given on average (newer builds) */
    calibration: [number, number, number, number, number?][];
  };
}

export interface HubTeam {
  /** 1: a smaller file with the last two years of games exists (teamgames2y / playergames2y) */
  g2y?: 1;
  /** active teams: who played the latest games in each role, [name, slug, role] */
  starters?: [string, string, string][];
  /** power rating over the last year, [date, rating] (builds from 2026-10-18 on) */
  rh?: [string, number][];
  /** storylines: milestones within reach, streaks, unbeaten runs */
  notes?: import("../components/hub/Storylines").Notes;
  name: string;
  u: string;
  region?: string;
  codes: string[];
  rating?: TeamRating | null;
  disbanded: number;
  g: number;
  w: number;
  sg: number;
  sw: number;
  from: string;
  to: string;
  names: { n: string; from: string; to: string; g: number }[];
  avgMin: number;
  kills: number | null;
  deaths: number | null;
  obj: { dragons: number; barons: number; towers: number; heralds: number; golddiff: number } | null;
  years: { y: string; g: number; w: number; as: string }[];
  recent: { date: string; g: string | null; opp: string; us: number; them: number; en: string; e: string; r?: number }[];
  opps: { n: string; u: string | null; g: number; w: number; last: string }[];
  champs: { c: string; g: number; w: number }[];
  bans: { c: string; g: number }[];
  events: { e: string; en: string; date: string; as: string; g: number; w: number; sg: number; sw: number; pl?: string; usd?: number; lu?: string }[];
  titles: (Omit<Title, "s"> & { e?: string | null })[];
  bestStreak: { n: number; date: string } | null;
  roster: { y: string; p: { n: string; u: string | null; g: number; r: string }[] }[];
  /** prize money in USD as listed on Leaguepedia */
  earnings?: number;
  /** [blue games, blue wins, red games, red wins] */
  sides?: [number, number, number, number] | null;
  bansVs?: { c: string; g: number }[];
}

export interface HubPlayer {
  /** Riot's photo of a current pro (matched by the stats build to their current team), so it shows without Riot's team list */
  img?: string;
  /** 1: a smaller file with the last two years of games exists (teamgames2y / playergames2y) */
  g2y?: 1;
  /** storylines: milestones within reach, streaks, unbeaten runs */
  notes?: import("../components/hub/Storylines").Notes;
  name: string;
  u: string;
  page: string;
  role: string;
  club?: string;
  clubU?: string | null;
  clubTo?: string;
  bio: Partial<Record<"real" | "native" | "country" | "cc" | "born" | "res" | "twitter" | "stream" | "youtube" | "contract", string>> & {
    retired?: number;
    fav?: string[];
    soloq?: string[];
  };
  /** Player of the Game awards (where Leaguepedia records them) */
  mvp?: number;
  /** gn: game number in the series (builds from 2026-10-18 on), here and below */
  pentas?: { date: string; c: string; g: string | null; en: string; x: number; gn?: number }[];
  g: number;
  w: number;
  k: number;
  d: number;
  a: number;
  kda: number;
  csm: number | null;
  gpm: number | null;
  dpm: number | null;
  teams: { n: string; u: string | null; g: number; w: number; from: string; to: string }[];
  years: { y: string; g: number; w: number; kda: number; team: string }[];
  champs: { c: string; g: number; w: number; k: number; d: number; a: number; kda: number }[];
  nChamps: number;
  events: {
    e: string; en: string; date: string; t: string; tu: string | null; g: number; w: number;
    k: number; d: number; a: number; kda: number; csm: number | null; c: string[]; pl?: string; lu?: string;
  }[];
  recent: { date: string; g: string | null; c: string; k: number; d: number; a: number; win: number; opp: string; en: string; team: string; gn?: number; r?: number }[];
  best: Record<string, { v: number; date: string; c: string; opp: string; en: string; g: string | null; gn?: number }>;
  titles: { t: string; date: string; kind: string; e?: string | null }[];
}

/** [opponent champion, games, wins, games with lane leads?, gold lead at 15?, CS lead?, XP lead?, games ahead at 15?] */
export type LaneLine = [string, number, number, number?, number?, number?, number?, number?];

export interface HubChamp {
  name: string;
  u: string;
  p: number;
  w: number;
  b: number;
  years: { y: string; p: number; w: number; b: number }[];
  roles: { r: string; p: number }[];
  players: { n: string; u: string | null; g: number; w: number; kda: number }[];
  recent: {
    date: string; g: string | null; n: string; u: string | null; team: string; opp: string; k: number; d: number; a: number; win: number; en: string;
    it?: string[]; ks?: string; stt?: string; sp?: string[]; r?: string; gn?: number;
  }[];
  /** [blue games, blue wins, red games, red wins] */
  side?: [number, number, number, number];
  /** draft pick slot (B1, B2-3, B4-5, R1-2, R3, R4, R5) -> [games, wins], games with the pick order known (builds from 2026-10-24 on) */
  slots?: Record<string, [number, number]> | null;
  /** builds in the last 12 months: [name, games, wins] */
  builds?: { since: string; g: number; items: [string, number, number][]; keys: [string, number, number][]; spells: [string, number, number][] } | null;
  /** role -> [opponent champion, games, wins, then from Oracle's Elixir games: games with lane leads, average
   *  gold / CS / XP lead at 15 minutes, games ahead in gold at 15] (all time, 3+ games) */
  matchups?: Record<string, LaneLine[]> | null;
  /** the same for the last 12 months (2+ games) */
  matchups12?: Record<string, LaneLine[]> | null;
  /** role -> [games, wins, games with lane leads, gold / CS / XP lead at 15, games ahead at 15]: all time, last 12 months */
  lane?: Record<string, number[]> | null;
  lane12?: Record<string, number[]> | null;
  /** bot lane partner -> [champion, games, wins] */
  duos?: [string, number, number][] | null;
  /** per patch: picks, wins, bans, games where it was picked or banned (pr, from builds of 2026-10-18), games */
  patches?: { p: string; pk: number; w: number; b: number; pr?: number; g: number }[];
}

export interface HubGameRecord {
  v: number;
  a: string;
  b: string;
  w: string;
  date: string;
  t: string;
  min: number;
  score: string | null;
  g: string | null;
  gn?: number;
  e: string | null;
  au: string | null;
  bu: string | null;
}
export interface HubPlayerRecord {
  v: number;
  pl: string;
  u: string | null;
  team: string;
  opp: string;
  c: string;
  date: string;
  t: string;
  kda: string;
  g: string | null;
  gn?: number;
  e: string | null;
}
export interface HubCareerRecord {
  v: number;
  pl: string;
  u: string | null;
}
export interface HubTeamRecord {
  v: number;
  team: string;
  u: string | null;
  date?: string;
  worlds?: number;
}
/** hub/matchups/<champion>.json: [opponent, role 0-4 (-1 unknown), games, wins, avg gold lead at 15 or null] */
export interface HubMatchups {
  c: string;
  g: number;
  vs: [string, number, number, number, number | null][];
}
/** hub/records/<year>.json: one year's game and single-game player records, and its pentakills */
export interface HubRecordsYear {
  year: string;
  game: HubRecords["game"];
  player: HubRecords["player"];
  pentas: NonNullable<HubRecords["pentas"]>;
}
export interface HubRecords {
  /** years with their own records file (builds from 2026-10-18 on) */
  years?: string[];
  built: string;
  note: string;
  game: Record<"fastest" | "longest" | "bloodiest" | "comebacks", HubGameRecord[]>;
  player: Record<"kills" | "assists" | "dmg" | "cs" | "perfect", HubPlayerRecord[]>;
  /** top leagues and international events */
  career: Record<"games" | "kills" | "assists" | "pool", HubCareerRecord[]>;
  /** every pro game, like the player pages (builds from 2026-10-18 on) */
  careerAll?: Record<"games" | "kills" | "assists" | "pool", HubCareerRecord[]>;
  team: Record<"streaks" | "titles", HubTeamRecord[]>;
  /** Every pentakill Leaguepedia's scoreboards record (builds from 2026-10-16 on) */
  pentas?: {
    total: number;
    recent: { date: string; n: string; u: string | null; c: string; g: string | null; t: string; e: string | null; a: string; b: string; x: number; gn?: number }[];
    most: { n: string; u: string | null; v: number }[];
  };
}
export interface HubTitle {
  t: string;
  date: string;
  kind: Title["kind"];
  w: string;
  as: string;
  l: string;
  score: string;
  u: string | null;
  e: string | null;
}

// ── audit round (2026-10-16): tournament facts, rosters, regions, team / player / champion extras ──

export interface GameRef {
  g: string | null;
  a: string;
  b: string;
  v: number;
  /** game number in the series (builds from 2026-10-18 on) */
  n?: number;
}

export interface EventOverview {
  g: number;
  min: number;
  kills: number;
  blue: number;
  red: number;
  drakes: Record<string, number>;
  short: GameRef | null;
  long: GameRef | null;
  bloody: GameRef | null;
  /** the event's best-rated game (v = rating, n = game number) */
  best?: GameRef & { n: number };
  /** gn = game number in the series (builds from 2026-10-18 on) */
  farm: { v: number; n: string; u: string | null; c: string; cs: number; min: number; g: string | null; gn?: number } | null;
  pentas: { n: string; u: string | null; c: string; g: string | null; x: number; gn?: number }[];
  mvp: { n: string; u: string | null; v: number }[];
}

export interface EventRoster {
  t: string;
  u: string | null;
  r?: string | null;
  /** [name, slug, role, country] */
  p: [string, string | null, string, string][];
}

export interface PatchRow {
  p: string;
  from: string;
  to: string;
  g: number;
  /** [champion, picks, bans, wins, games it was picked or banned in (builds from 2026-10-18)] */
  c: [string, number, number, number, number?][];
  /** patch movers against `prev` (the patch before with 30+ games): [champion, presence now, presence before, wins, picks] */
  prev?: string;
  up?: PatchMove[];
  down?: PatchMove[];
}
export type PatchMove = [string, number, number, number, number];

/** One step in a league's history: league, its short name, page, years ("2019–2024", "2026–") */
export interface LeagueStep {
  l: string;
  s?: string | null;
  u?: string | null;
  y?: string | null;
}
export interface LeagueRow {
  l: string;
  u: string;
  /** short name (LCK, LCS, CBLOL...) */
  s?: string | null;
  /** renamed / merged leagues it belongs to, oldest first (NA LCS -> LCS -> LTA North -> LCS) */
  h?: LeagueStep[];
  r?: string | null;
  n: number;
  from?: string | null;
  to?: string | null;
  pr: number;
  g: number;
}

export interface HubLeague {
  l: string;
  u: string;
  s?: string | null;
  history?: LeagueStep[] | null;
  region?: string | null;
  primary: boolean;
  events: (EventListItem & { y: string })[];
  titles: { t: string; u: string | null; n: number }[];
}

// ── champion game logs per league and year (Champions page filters) ──

/** [champion, role 0-4 (-1 unknown), kills, deaths, assists, cs, gold, damage, player, player slug, gold lead over the
 *  lane opponent at 15] (stats and player missing without a scoreboard; player from builds of 2026-10-16 on, the lead
 *  from 2026-10-17 on and only for games Oracle's Elixir has) */
export type ChampPick = [string, number, number?, number?, number?, number?, number?, number?, string?, (string | null)?, number?];
/** [date, patch, event index, blue won 1/0, minutes, blue picks, red picks, blue bans, red bans, draft order known 1/0,
 *  blue team, red team, blue slug, red slug, series slug, game number] (the last six from builds of 2026-10-16 on) */
export type ChampGame = [
  string, string, number, number, number | null, ChampPick[], ChampPick[], string[], string[], number,
  string?, string?, (string | null)?, (string | null)?, (string | null)?, number?,
];
export interface ChampGamesFile {
  events: [string, string][];
  games: ChampGame[];
}
export interface ChampLeagueIndex {
  u: string;
  l: string;
  r: string | null;
  pr: number;
  y: Record<string, number>;
}

/** A league's whole season: every split and playoffs summed (hub/leagueyear/<league>/<year>.json) */
export interface LeagueSeason {
  events: [string, string][];
  statsGames: number;
  players: EventPlayer[];
  teamStats: EventTeamStats[];
}

/** hub/moves.json: players who started at a new club recently (d: first game there), newest first */
export interface RosterMovesFile {
  since: string;
  list: { d: string; n: string; u: string; r: string; from: { n: string; u: string; to: string }; to: { n: string; u: string; g: number }; g: number; lu: string | null }[];
}
