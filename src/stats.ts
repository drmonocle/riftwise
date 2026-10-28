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

export interface ChampRow { c: string; p: number; w: number; b: number; kda: number | null; role: string | null }
export type ChampionStats = Partial<Record<"major" | "all", { games: number; champs: ChampRow[] }>>;

// The server rebuilds the stats under a new version whenever the database changes (a few times a day)
// and keeps the newest three. The desktop app can stay open in the tray for days, so the current version is
// re-checked every hour, and a file that has gone missing triggers one fresh check and retry.
const VERSION_MAX_AGE_MS = 60 * 60 * 1000;
let versionPromise: Promise<string> | null = null;
let versionCheckedAt = 0;
let builtAt: string | null = null; // when the current build finished (latest.json "built")
const cache = new Map<string, Promise<any>>(); // keyed by "<version>/<path>", oldest use first
// Files read in this visit stay in memory for instant back-and-forth, but not all of them: after a few hundred pages
// a phone would run out of memory (a big team's game log is several MB once read). The least recently used go first.
const CACHE_FILES = 80;

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

/** A reigning international champion (latest.json): kind, year, the team today and its short name. */
export interface Reigning {
  k: "Worlds" | "MSI" | "First Stand";
  y: string;
  t: string;
  c: string;
}
let reigning: Promise<Reigning[]> | null = null;

/** The reigning Worlds, MSI and First Stand champions (the floating team logos); [] when they can't be read. */
export function statsReigning(): Promise<Reigning[]> {
  if (!reigning)
    reigning = fetch(`${STATS_BASE}/latest.json`, { cache: "no-store", signal: AbortSignal.timeout(15000) })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: { reigning?: Reigning[] }) => (Array.isArray(j.reigning) ? j.reigning : []))
      .catch(() => []);
  return reigning;
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
  if (hit) {
    cache.delete(key); // to the back of the line: used just now
    cache.set(key, hit);
    return hit;
  }
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
  while (cache.size > CACHE_FILES) cache.delete(cache.keys().next().value as string);
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

/** Start loading files a page is about to ask for; the page's own load() then picks them up from the cache. */
export function prefetch(paths: string[]): void {
  for (const p of paths) load(p).catch(() => {}); // a failure is retried (and shown) by the page's own load
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
export const loadChampionStats = (key: string) => load<ChampionStats>(`champions/${key}.json`);

export function winRate(w: number, g: number): string {
  return g ? `${Math.round((w / g) * 100)}%` : "–";
}
