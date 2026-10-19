/**
 * Loader for the Stats tab. The data is pre-built on the server from the pro games catalog
 * (scripts/stats/build_stats.py) into small JSON files, and each screen fetches only the file it
 * shows, so the app never downloads or crunches the whole database.
 */
import { IS_WEB, OLD_SITE_URL, SITE_URL } from "./platform";

// Same origin on the web version; the desktop app reads it from riftwise.gg, and from the old address
// (lolworlds.com/riftwise, which keeps answering) if riftwise.gg can't be reached.
// (vite preview on this PC passes /stats on to the server, or serves a local build.)
let STATS_BASE =
  IS_WEB && typeof window !== "undefined" && /^riftwise\.gg$|^localhost$|^127\.0\.0\.1$/.test(window.location.hostname)
    ? "/stats"
    : `${SITE_URL}stats`;
let statsFallback: string | null = IS_WEB ? null : `${OLD_SITE_URL}stats`;

/** a = other names the team has played under, c = short names (SKT, C9...), each joined by " | ". */
export interface StatsSearchTeam { n: string; s: string; g: number; y: string; a?: string; c?: string }
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
  /** The club they play (or last played) for, ignoring one-off national-team games. */
  club?: string; clubTo?: string;
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

// The server rebuilds the stats under a new version whenever the database changes (a few times a day)
// and keeps the newest three. The desktop app can stay open in the tray for days, so the current version is
// re-checked every hour, and a file that has gone missing triggers one fresh check and retry.
const VERSION_MAX_AGE_MS = 60 * 60 * 1000;
let versionPromise: Promise<string> | null = null;
let versionCheckedAt = 0;
let builtAt: string | null = null; // when the current build finished (latest.json "built")
const cache = new Map<string, Promise<any>>(); // keyed by "<version>/<path>"

// Stats pages come with the current build's version (<meta name="rw-stats">, from the page service), which saves
// a round trip before the first file. A build replaced since then is caught by the missing-file retry in load().
const pageVersion =
  IS_WEB && typeof document !== "undefined" ? document.querySelector('meta[name="rw-stats"]')?.getAttribute("content") || null : null;

function getVersion(force = false): Promise<string> {
  if (!force && !versionPromise && pageVersion && /^\d{14}$/.test(pageVersion)) {
    versionCheckedAt = Date.now();
    versionPromise = Promise.resolve(pageVersion);
  }
  if (force || !versionPromise || Date.now() - versionCheckedAt > VERSION_MAX_AGE_MS) {
    versionCheckedAt = Date.now();
    const ask = () => fetch(`${STATS_BASE}/latest.json`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    versionPromise = ask()
      .catch((e) => {
        // riftwise.gg out of reach (a network error, not an HTTP one): use the old address from now on
        if (!statsFallback) throw e;
        STATS_BASE = statsFallback;
        statsFallback = null;
        return ask();
      })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (j.built) builtAt = String(j.built);
        return String(j.version);
      })
      .catch((e) => {
        versionPromise = null; // try again next time
        throw e;
      });
  }
  return versionPromise;
}

/** When the stats database was last rebuilt from new games (ISO time), or null if it can't be read. */
export async function statsUpdatedAt(force = false): Promise<string | null> {
  try {
    await getVersion(force);
  } catch {
    return null;
  }
  return builtAt;
}

/** The file isn't in the current build (for hub pages: no such team / player / ...). */
export class MissingFile extends Error {}

function fetchVersioned<T>(v: string, path: string): Promise<T> {
  const key = `${v}/${path}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(`${STATS_BASE}/${key}`, { signal: AbortSignal.timeout(20000) })
    .then((r) => {
      if (r.status === 404) throw new MissingFile(key);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<T>;
    })
    .catch((e) => {
      cache.delete(key);
      throw e;
    });
  cache.set(key, p);
  return p;
}

/** One file of the current stats build (path inside the version folder, e.g. "hub/meta.json"). */
export async function load<T>(path: string): Promise<T> {
  const v = await getVersion();
  try {
    return await fetchVersioned<T>(v, path);
  } catch (e) {
    if (!(e instanceof MissingFile)) throw e;
    // That build was replaced since we last checked: find the current one and try once more.
    const fresh = await getVersion(true);
    if (fresh === v) throw e;
    for (const k of cache.keys()) if (!k.startsWith(`${fresh}/`)) cache.delete(k);
    return fetchVersioned<T>(fresh, path);
  }
}

/** A text file of the current stats build (the CSV downloads); not cached, they're fetched once per click. */
export async function loadText(path: string): Promise<string> {
  const v = await getVersion();
  let r = await fetch(`${STATS_BASE}/${v}/${path}`, { signal: AbortSignal.timeout(60000) });
  if (r.status === 404) {
    const fresh = await getVersion(true);
    if (fresh !== v) r = await fetch(`${STATS_BASE}/${fresh}/${path}`, { signal: AbortSignal.timeout(60000) });
  }
  if (r.status === 404) throw new MissingFile(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Full web address of a file of the current stats build (for links that open in a browser). */
export async function statsFileUrl(path: string): Promise<string> {
  const v = await getVersion();
  return `${SITE_URL}stats/${v}/${path}`;
}

/**
 * Address of a player's photo from Leaguepedia (fetched by scripts/stats/photos_lp.py into stats/photos/<slug>.webp),
 * with its fetch date so a newer picture isn't hidden by a cached one. Same host as the stats files.
 */
export function statsPhotoUrl(slug: string, stamp: string): string {
  return `${STATS_BASE}/photos/${encodeURIComponent(slug)}.webp${stamp ? `?v=${stamp}` : ""}`;
}

export const loadStatsMeta = () => load<StatsMeta>("meta.json");
export const loadStatsSearch = () => load<StatsSearch>("search.json");
// Split search lists: the Teams list is ~70 KB, players ~300 KB, so each loads only when needed.
// Builds made before the split only have search.json, so fall back to it.
export const loadTeamIndex = () =>
  load<StatsSearchTeam[]>("search-teams.json").catch(() => loadStatsSearch().then((s) => s.teams));
export const loadPlayerIndex = () =>
  load<StatsSearchPlayer[]>("search-players.json").catch(() => loadStatsSearch().then((s) => s.players));
export const loadTeamStats = (slug: string) => load<TeamStats>(`teams/${slug}.json`);
export const loadPlayerStats = (slug: string) => load<PlayerStats>(`players/${slug}.json`);
export const loadChampionStats = (key: string) => load<ChampionStats>(`champions/${key}.json`);
export const loadRecords = () => load<Records>("records.json");
export const loadTitles = () => load<Title[]>("titles.json");

export function winRate(w: number, g: number): string {
  return g ? `${Math.round((w / g) * 100)}%` : "–";
}

/** Case- and accent-insensitive search. Exact and prefix matches first, then by games played. */
export function searchByName<T extends { n: string; g: number; a?: string; c?: string }>(items: T[], query: string, limit = 30): T[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query.trim());
  if (!q) return items.slice(0, limit);
  const scored: [number, T][] = [];
  for (const it of items) {
    // Short names: "SKT", "C9", "HLE" find the team they stand for
    if (it.c && norm(it.c).split(" | ").includes(q)) {
      scored.push([0, it]);
      continue;
    }
    const n = norm(it.n);
    const i = n.indexOf(q);
    if (i >= 0) {
      scored.push([n === q ? 0 : i === 0 ? 1 : 2, it]);
      continue;
    }
    // Ignore punctuation and spaces: "geng" finds Gen.G, "100thieves" finds 100 Thieves
    const bare = (s: string) => s.replace(/[^a-z0-9]/g, "");
    if (bare(q) && bare(n).includes(bare(q))) {
      scored.push([bare(n) === bare(q) ? 0 : 2, it]);
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
