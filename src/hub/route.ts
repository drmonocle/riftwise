/**
 * Page links for the stats hub. On the web every page has its own address, so it can be shared,
 * bookmarked and found by search engines:
 *
 *   /stats                      hub front page
 *   /stats/<section>[/<year>]   tournaments, leagues, champions, patches, records, titles, compare, data, about, prep,
 *                                         rankings, finder (?league=..&year=..&team=..), draft (?teams=a,b),
 *                                         best (?view=series&year=2025&league=..)
 *   /stats/compare?teams=t1,gen-g&p=y2026   a comparison (players=..., p = period: all, last20, y2026, e:<event>)
 *   /stats/champions?league=lck&year=2026&event=..&patch=26.18&side=b&role=Mid   champion stats with filters
 *   /about                      who makes RiftWise
 *   /player/<slug>              /team/<slug>  /tournament/<slug>  /match/<slug>[?g=<game>]  /champion/<slug>  /league/<slug>[/<year>]
 *
 * The desktop app has no address bar, so it keeps its own back stack instead.
 */
import { useSyncExternalStore } from "react";
import { IS_WEB, SITE_URL } from "../platform";

export type HubSection =
  | "tournaments" | "leagues" | "champions" | "patches" | "records" | "titles" | "compare" | "data" | "about" | "prep"
  | "rankings" | "finder" | "draft" | "best" | "counters" | "worlds" | "msi" | "first-stand" | "leaders" | "tiers"
  | "aboutme"; // riftwise.gg/about (not under /stats)
export type HubEntity = "team" | "player" | "event" | "match" | "champ" | "league";

export type HubRoute =
  | { kind: "home" }
  | { kind: HubSection; year?: string; mode?: "team" | "player"; a?: string; b?: string; period?: string; query?: string; more?: string[] }
  | { kind: HubEntity; slug: string; game?: number; year?: string };

export const HUB_HOME: HubRoute = { kind: "home" };
/** The compare page with who is compared over which period (all in the address). */
/** Compare: two sides, or more (`more` = the third one on; /stats/compare?teams=t1,geng,hle,dk) */
export type CompareRoute = { kind: "compare"; mode?: "team" | "player"; a?: string; b?: string; period?: string; more?: string[] };
/** Match prep for two teams: /stats/prep?teams=t1,gen-g&p=y2026 */
export type PrepRoute = { kind: "prep"; a?: string; b?: string; period?: string };
const SECTIONS: HubSection[] = [
  "tournaments", "leagues", "champions", "patches", "records", "titles", "compare", "data", "about", "prep", "rankings", "finder", "draft",
  "best", "counters", "worlds", "msi", "first-stand", "leaders", "tiers",
];
/** Pages that keep their filters in the address (?league=lck&year=2026...). */
/** Worlds, MSI and First Stand: one page each, for a year or every year (/stats/msi/2024, /stats/worlds/all). */
const INTL_SECTIONS: HubSection[] = ["worlds", "msi", "first-stand"];
const QUERY_SECTIONS: HubSection[] = ["champions", "finder", "draft", "best", "counters", "leaders", "tiers"];
const ENTITY_PATH: Record<HubEntity, string> = {
  team: "team", player: "player", event: "tournament", match: "match", champ: "champion", league: "league",
};
const PATH_ENTITY: Record<string, HubEntity> = Object.fromEntries(Object.entries(ENTITY_PATH).map(([k, v]) => [v, k as HubEntity]));

const ROOT: string = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");

/** The app's languages in addresses (riftwise.gg/ko/player/faker), lower case -> the language's code. English has
 *  no prefix. The page service gives these addresses their own titles (server/pages/i18n.go). */
const URL_LANGS: Record<string, string> = {
  es: "es", "pt-br": "pt-BR", ko: "ko", vi: "vi", "zh-cn": "zh-CN", "zh-tw": "zh-TW", ja: "ja", fr: "fr", de: "de", tr: "tr",
};
const startSeg =
  IS_WEB && typeof window !== "undefined" ? (new RegExp(`^${ROOT}([A-Za-z-]+)(?:/|$)`).exec(window.location.pathname)?.[1] || "").toLowerCase() : "";
/** The language the address asks for (null: none, or the desktop app). */
export const URL_LANG: string | null = URL_LANGS[startSeg] || null;

/** "/", or "/ko/" when the page was opened at a language's address: every page address and link then keeps it.
 *  (riftwise.gg is the site root; the desktop app has no address.) */
export const BASE: string = URL_LANG ? `${ROOT}${startSeg}/` : ROOT;

/** This page's address in another language (English: no prefix), for the language pickers. */
export function langAddress(code: string): string {
  const seg = Object.keys(URL_LANGS).find((k) => URL_LANGS[k] === code);
  const tail = window.location.pathname.slice(BASE.length) + window.location.search + window.location.hash;
  return `${ROOT}${seg ? `${seg}/` : ""}${tail}`;
}

/** The hub page an address points at, or null when it isn't one (the live scores page, say). */
export function parseHubPath(pathname: string, search = ""): HubRoute | null {
  if (!pathname.startsWith(BASE)) return null;
  const parts = pathname.slice(BASE.length).split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  if (parts[0] === "about" && parts.length === 1) return { kind: "aboutme" };
  if (parts[0] === "stats") {
    if (parts.length === 1) return HUB_HOME;
    if ((SECTIONS as string[]).includes(parts[1])) {
      const kind = parts[1] as HubSection;
      if (kind === "compare") return { kind, ...parseCompare(search) };
      if (kind === "prep") {
        const c = parseCompare(search);
        return { kind, a: c.a, b: c.b, period: c.period };
      }
      // these pages keep their filters in the address (?league=lck&year=2026&patch=26.18...)
      if (QUERY_SECTIONS.includes(kind) && search.replace(/^\?/, "")) return { kind, query: search.replace(/^\?/, "") };
      // a year (tournaments, the international events), or "all" for every year of Worlds / MSI / First Stand
      if (kind === "tournaments" && parts[2] && /^\d{4}$/.test(parts[2])) return { kind, year: parts[2] };
      if (INTL_SECTIONS.includes(kind) && parts[2] && /^(\d{4}|all)$/.test(parts[2])) return { kind, year: parts[2] };
      return { kind };
    }
    return null;
  }
  const kind = PATH_ENTITY[parts[0]];
  // a league page can open at one season: /league/lck/2025
  if (kind === "league" && parts.length === 3 && /^\d{4}$/.test(parts[2])) return { kind, slug: parts[1].toLowerCase(), year: parts[2] };
  if (!kind || !parts[1] || parts.length !== 2) return null;
  // a match page can open at one of its games: /match/<slug>?g=5
  const game = kind === "match" ? Number(new URLSearchParams(search).get("g")) || undefined : undefined;
  return game ? { kind, slug: parts[1].toLowerCase(), game } : { kind, slug: parts[1].toLowerCase() };
}

/** ?teams=a,b&p=y2026 -> who is compared over which period */
function parseCompare(search: string): { mode?: "team" | "player"; a?: string; b?: string; period?: string; more?: string[] } {
  const q = new URLSearchParams(search);
  const mode = q.has("players") ? "player" : q.has("teams") ? "team" : undefined;
  if (!mode) return {};
  const [a, b, ...more] = (q.get(mode === "player" ? "players" : "teams") || "").split(",").map((x) => x.trim().toLowerCase());
  const rest = more.filter(Boolean).slice(0, 6);
  return { mode, a: a || undefined, b: b || undefined, period: q.get("p") || undefined, ...(rest.length ? { more: rest } : {}) };
}

export function hubPath(r: HubRoute): string {
  if (r.kind === "home") return `${BASE}stats`;
  if (r.kind === "aboutme") return `${BASE}about`;
  if ((r.kind === "compare" || r.kind === "prep") && "a" in r && (r.a || r.b) && (r.kind === "prep" || ("mode" in r && r.mode))) {
    const players = r.kind === "compare" && "mode" in r && r.mode === "player";
    const more = r.kind === "compare" && "more" in r && r.more ? r.more : [];
    const q = `${players ? "players" : "teams"}=${[r.a || "", r.b || "", ...more].map(encodeURIComponent).join(",")}`;
    return `${BASE}stats/${r.kind}?${q}${r.period && r.period !== "all" ? `&p=${encodeURIComponent(r.period)}` : ""}`;
  }
  if (QUERY_SECTIONS.includes(r.kind as HubSection) && "query" in r && r.query) return `${BASE}stats/${r.kind}?${r.query}`;
  if ((SECTIONS as string[]).includes(r.kind)) {
    const y = "year" in r && r.year ? `/${r.year}` : "";
    return `${BASE}stats/${r.kind}${y}`;
  }
  const e = r as { slug: string; game?: number; year?: string };
  const tail = r.kind === "match" && e.game ? `?g=${e.game}` : r.kind === "league" && e.year ? `/${e.year}` : "";
  return `${BASE}${ENTITY_PATH[r.kind as HubEntity]}/${encodeURIComponent(e.slug)}${tail}`;
}

/** Full shareable web address of a hub page (the desktop app shares these too). */
export const hubShareUrl = (r: HubRoute): string => `${SITE_URL}${hubPath(r).slice(BASE.length)}`;

export const sameRoute = (a: HubRoute, b: HubRoute) => hubPath(a) === hubPath(b);

// ── The current page ──────────────────────────────────────────────────────

const atStart = IS_WEB && typeof window !== "undefined" ? parseHubPath(window.location.pathname, window.location.search) : null;
let current: HubRoute = atStart || HUB_HOME;
const desktopStack: HubRoute[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** True when the page was opened at a hub address (the app then starts on the Stats tab). */
export const STARTED_ON_HUB = atStart !== null;

export function currentHubRoute(): HubRoute {
  return current;
}

/** Re-renders with the current hub page. */
export function useHubRoute(): HubRoute {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function onHubRoute(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Open a hub page. On the web this adds a browser history entry, so Back works as expected. */
export function navigateHub(r: HubRoute, opts: { replace?: boolean } = {}): void {
  if (sameRoute(r, current) && !opts.replace) {
    emit();
    return;
  }
  if (IS_WEB) {
    const url = hubPath(r);
    if (opts.replace) window.history.replaceState({ hub: true }, "", url);
    else window.history.pushState({ hub: true }, "", url);
  } else if (!opts.replace) {
    desktopStack.push(current);
  }
  current = r;
  emit();
}

/** Back to the previous hub page; false when there is none (the caller can then show the hub home). */
export function hubBack(): boolean {
  if (IS_WEB) {
    if (window.history.state && window.history.state.hub) {
      window.history.back();
      return true;
    }
    return false;
  }
  const prev = desktopStack.pop();
  if (!prev) return false;
  current = prev;
  emit();
  return true;
}

export const canGoBack = (): boolean => (IS_WEB ? !!(window.history.state && window.history.state.hub) : desktopStack.length > 0);

/** Called by the app on the browser's Back / Forward: returns the hub page there, or null. */
export function syncFromLocation(): HubRoute | null {
  const r = parseHubPath(window.location.pathname, window.location.search);
  if (r) {
    current = r;
    emit();
  }
  return r;
}

// ── The other tabs' addresses ─────────────────────────────────────────────

/** Each tab's own address on the web (riftwise.gg/schedule); the Live tab is the site's home (/). The schedule
 *  also has /results (its Results list) and /schedule/<league> (one league's matches, Riot's league slug). */
const TAB_PATHS: Record<string, string> = { live: "", schedule: "schedule", stream: "stream", watchlist: "watchlist", news: "news", settings: "settings" };

/** The tab an address belongs to (null: not a tab's address, e.g. a stats page). */
export function tabOfPath(path: string = IS_WEB ? window.location.pathname : ""): string | null {
  if (!path.startsWith(BASE)) return null;
  const first = path.slice(BASE.length).replace(/\/+$/, "").split("/")[0];
  if (first === "results") return "schedule";
  const tab = Object.keys(TAB_PATHS).find((k) => TAB_PATHS[k] === first);
  return tab ?? null;
}

/** What the schedule's address asks for: the Results list, and one league (/schedule/worlds, /results/lck). */
export function scheduleOfPath(path: string = IS_WEB ? window.location.pathname : ""): { results: boolean; league: string | null } {
  const [first, league] = path.slice(BASE.length).replace(/\/+$/, "").split("/");
  return { results: first === "results", league: (first === "schedule" || first === "results") && league ? decodeURIComponent(league) : null };
}

/** The schedule's address for a list and league, so a filtered schedule can be linked. */
export function setScheduleAddress(results: boolean, league: string | null): void {
  if (!IS_WEB || tabOfPath() !== "schedule") return;
  const path = `${BASE}${results ? "results" : "schedule"}${league ? `/${encodeURIComponent(league)}` : ""}`;
  if (path !== window.location.pathname) window.history.replaceState({ ...(window.history.state || {}), tab: "schedule" }, "", path);
}

/**
 * Keeps the address bar in step with the main tabs on the web: the Stats tab shows its page's address, each other
 * tab its own (/, /schedule, /stream...). Every switch adds a history entry, so Back steps through the tabs.
 */
export function syncTabAddress(prevTab: string, nextTab: string): void {
  if (!IS_WEB || prevTab === nextTab) return;
  if (nextTab === "stats") {
    if (parseHubPath(window.location.pathname) === null) window.history.pushState({ hub: true, tab: "stats" }, "", hubPath(current));
    return;
  }
  const path = BASE + (TAB_PATHS[nextTab] ?? "");
  if (tabOfPath() !== nextTab || parseHubPath(window.location.pathname) !== null) window.history.pushState({ tab: nextTab }, "", path);
}
