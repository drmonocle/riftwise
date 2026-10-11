/**
 * Loader for the Stats tab. The data is pre-built on the server from the pro games catalog
 * (scripts/stats/build_stats.py) into small JSON files, and each screen fetches only the file it
 * shows, so the app never downloads or crunches the whole database.
 */
import { IS_WEB } from "./platform";

// Same origin on the web version; the desktop app reads it from lolworlds.com.
const STATS_BASE =
  IS_WEB && typeof window !== "undefined" && window.location.hostname.endsWith("lolworlds.com")
    ? "/riftwatch/stats"
    : "https://lolworlds.com/riftwatch/stats";

/** a = other names the team has played under, joined by " | " (searchable). */
export interface StatsSearchTeam { n: string; s: string; g: number; y: string; a?: string }
export interface StatsSearchPlayer { n: string; s: string; t: string; g: number; y: string }
export interface StatsSearch { teams: StatsSearchTeam[]; players: StatsSearchPlayer[] }

export interface StatsMeta {
  version: string;
  games: number;
  series: number;
  teams: number;
  players: number;
  from: string;
  to: string;
  champions: string[];
}

export type TitleKind = "Worlds" | "MSI" | "First Stand" | "EWC" | "IEM" | "Regional";
/** w = the team today, as = the name it won under, s = its page (if it has one). */
export interface Title { t: string; date: string; kind: TitleKind; w: string; as: string; s: string | null; l: string; score: string }
export const INTERNATIONAL_KINDS: TitleKind[] = ["Worlds", "MSI", "First Stand"];

export interface TeamStats {
  name: string;
  g: number; w: number; sg: number; sw: number;
  from: string; to: string;
  names: { n: string; from: string; to: string; g: number }[];
  avgMin: number; kills: number | null; deaths: number | null;
  obj: { dragons: number; barons: number; towers: number; heralds: number; golddiff: number } | null;
  years: { y: string; g: number; w: number; as: string }[];
  recent: { date: string; opp: string; t: string; us: number; them: number }[];
  opps: { n: string; s: string | null; g: number; w: number; last: string }[];
  champs: { c: string; g: number; w: number }[];
  bans: { c: string; g: number }[];
  tourns: { t: string; g: number; w: number; date: string }[];
  titles: Title[];
  bestStreak: { n: number; date: string } | null;
  roster: { y: string; p: { n: string; s: string; g: number; r: string }[] }[];
}

export interface PlayerStats {
  name: string; page: string; role: string;
  g: number; w: number; k: number; d: number; a: number; kda: number;
  csm: number | null; gpm: number | null; dpm: number | null;
  teams: { n: string; s: string | null; g: number; w: number; from: string; to: string }[];
  years: { y: string; g: number; w: number; kda: number; team: string }[];
  champs: { c: string; g: number; w: number; k: number; d: number; a: number; kda: number }[];
  nChamps: number;
  recent: { date: string; team: string; opp: string; c: string; k: number; d: number; a: number; win: number; t: string }[];
  best: Record<string, { v: number; date: string; c: string; opp: string; t: string }>;
  titles: [string, string, string][];
}

export interface ChampRow { c: string; p: number; w: number; b: number; kda: number | null; role: string | null }
export type ChampionStats = Partial<Record<"major" | "all", { games: number; champs: ChampRow[] }>>;

export interface GameRecord { v: number; a: string; b: string; w: string; date: string; t: string; min: number; score: string | null }
export interface PlayerRecord { v: number; pl: string; ps: string; team: string; opp: string; c: string; date: string; t: string; kda: string }
export interface CareerRecord { v: number; pl: string; ps: string }
export interface TeamRecord { v: number; team: string; s: string | null; date?: string; worlds?: number }
export interface Records {
  built: string;
  note: string;
  game: Record<"fastest" | "longest" | "bloodiest" | "comebacks", GameRecord[]>;
  player: Record<"kills" | "assists" | "dmg" | "cs" | "perfect", PlayerRecord[]>;
  career: Record<"games" | "kills" | "assists" | "pool", CareerRecord[]>;
  team: Record<"streaks" | "titles", TeamRecord[]>;
}

let versionPromise: Promise<string> | null = null;
const cache = new Map<string, Promise<any>>();

function getVersion(): Promise<string> {
  if (!versionPromise) {
    versionPromise = fetch(`${STATS_BASE}/latest.json`, { cache: "no-store", signal: AbortSignal.timeout(15000) })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => String(j.version))
      .catch((e) => {
        versionPromise = null; // try again next time
        throw e;
      });
  }
  return versionPromise;
}

function load<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit) return hit;
  const p = getVersion()
    .then((v) => fetch(`${STATS_BASE}/${v}/${path}`, { signal: AbortSignal.timeout(20000) }))
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<T>;
    })
    .catch((e) => {
      cache.delete(path);
      throw e;
    });
  cache.set(path, p);
  return p;
}

export const loadStatsMeta = () => load<StatsMeta>("meta.json");
export const loadStatsSearch = () => load<StatsSearch>("search.json");
export const loadTeamStats = (slug: string) => load<TeamStats>(`teams/${slug}.json`);
export const loadPlayerStats = (slug: string) => load<PlayerStats>(`players/${slug}.json`);
export const loadChampionStats = (key: string) => load<ChampionStats>(`champions/${key}.json`);
export const loadRecords = () => load<Records>("records.json");
export const loadTitles = () => load<Title[]>("titles.json");

export function winRate(w: number, g: number): string {
  return g ? `${Math.round((w / g) * 100)}%` : "–";
}

/** Case- and accent-insensitive search. Exact and prefix matches first, then by games played. */
export function searchByName<T extends { n: string; g: number; a?: string }>(items: T[], query: string, limit = 30): T[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query.trim());
  if (!q) return items.slice(0, limit);
  const scored: [number, T][] = [];
  for (const it of items) {
    const n = norm(it.n);
    const i = n.indexOf(q);
    if (i >= 0) {
      scored.push([n === q ? 0 : i === 0 ? 1 : 2, it]);
      continue;
    }
    // Old names (e.g. "SK Telecom T1" finds T1)
    if (it.a) {
      const olds = norm(it.a).split(" | ");
      if (olds.some((o) => o === q)) scored.push([1, it]);
      else if (olds.some((o) => o.includes(q))) scored.push([3, it]);
    }
  }
  scored.sort((a, b) => a[0] - b[0] || b[1].g - a[1].g);
  return scored.slice(0, limit).map((x) => x[1]);
}
