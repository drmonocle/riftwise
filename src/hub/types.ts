/** Shapes of the stats hub files (built nightly by scripts/stats/hub.py into stats/<version>/hub/). */
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
  p?: string;
  kids?: number;
}

export interface HubHome {
  latest: EventListItem[];
  /** running now or starting within two weeks (builds from 2026-10-15 on) */
  now?: EventListItem[];
  busiest: { n: string; u: string | null; g: number; w: number; kda: number }[];
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
  teams?: { t: string; u: string | null; g: number; w: number; sg: number; sw: number }[];
  leaders?: Partial<Record<"kda" | "kills" | "csm" | "dpm" | "pool", LeaderRow[]>>;
  champs?: { c: string; p: number; w: number; b: number }[];
  statsGames?: number;
  games?: number;
  series?: number;
}

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
  ff?: number;
  remake?: number;
  min?: number | null;
  t?: { blue: SideStats; red: SideStats };
  p?: GamePlayer[];
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
}

export interface HubTeam {
  name: string;
  u: string;
  region?: string;
  codes: string[];
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
  recent: { date: string; g: string | null; opp: string; us: number; them: number; en: string; e: string }[];
  opps: { n: string; u: string | null; g: number; w: number; last: string }[];
  champs: { c: string; g: number; w: number }[];
  bans: { c: string; g: number }[];
  events: { e: string; en: string; date: string; as: string; g: number; w: number; sg: number; sw: number; pl?: string; usd?: number }[];
  titles: (Omit<Title, "s"> & { e?: string | null })[];
  bestStreak: { n: number; date: string } | null;
  roster: { y: string; p: { n: string; u: string | null; g: number; r: string }[] }[];
}

export interface HubPlayer {
  name: string;
  u: string;
  page: string;
  role: string;
  club?: string;
  clubU?: string | null;
  clubTo?: string;
  bio: Partial<Record<"real" | "native" | "country" | "born" | "res" | "twitter" | "stream" | "youtube", string>> & { retired?: number };
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
    k: number; d: number; a: number; kda: number; csm: number | null; c: string[]; pl?: string;
  }[];
  recent: { date: string; g: string | null; c: string; k: number; d: number; a: number; win: number; opp: string; en: string; team: string }[];
  best: Record<string, { v: number; date: string; c: string; opp: string; en: string; g: string | null }>;
  titles: { t: string; date: string; kind: string; e?: string | null }[];
}

export interface HubChamp {
  name: string;
  u: string;
  p: number;
  w: number;
  b: number;
  years: { y: string; p: number; w: number; b: number }[];
  roles: { r: string; p: number }[];
  players: { n: string; u: string | null; g: number; w: number; kda: number }[];
  recent: { date: string; g: string | null; n: string; u: string | null; team: string; opp: string; k: number; d: number; a: number; win: number; en: string }[];
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
export interface HubRecords {
  built: string;
  note: string;
  game: Record<"fastest" | "longest" | "bloodiest" | "comebacks", HubGameRecord[]>;
  player: Record<"kills" | "assists" | "dmg" | "cs" | "perfect", HubPlayerRecord[]>;
  career: Record<"games" | "kills" | "assists" | "pool", HubCareerRecord[]>;
  team: Record<"streaks" | "titles", HubTeamRecord[]>;
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
