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
  | "rankings" | "finder" | "draft" | "best" | "counters"
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
  "best", "counters",
];
/** Pages that keep their filters in the address (?league=lck&year=2026...). */
const QUERY_SECTIONS: HubSection[] = ["champions", "finder", "draft", "best", "counters"];
const ENTITY_PATH: Record<HubEntity, string> = {
  team: "team", player: "player", event: "tournament", match: "match", champ: "champion", league: "league",
};
const PATH_ENTITY: Record<string, HubEntity> = Object.fromEntries(Object.entries(ENTITY_PATH).map(([k, v]) => [v, k as HubEntity]));

/** "/" (riftwise.gg is the site root; the desktop app has no address). */
export const BASE: string = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");

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
      return kind === "tournaments" && parts[2] && /^\d{4}$/.test(parts[2]) ? { kind, year: parts[2] } : { kind };
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

/**
 * Keeps the address bar in step with the main tabs on the web: the Stats tab shows its page's
 * address, any other tab the plain site address (/). Moving into or out of the Stats tab adds a
 * history entry (so Back returns to where you were); switching between other tabs doesn't.
 */
export function syncTabAddress(prevTab: string, nextTab: string): void {
  if (!IS_WEB || prevTab === nextTab) return;
  const onHub = parseHubPath(window.location.pathname) !== null;
  if (nextTab === "stats") {
    if (!onHub) window.history.pushState({ hub: true, tab: "stats" }, "", hubPath(current));
  } else if (onHub) {
    window.history.pushState({ tab: nextTab }, "", BASE + window.location.hash);
  } else {
    window.history.replaceState({ ...(window.history.state || {}), tab: nextTab }, "", window.location.href);
  }
}
