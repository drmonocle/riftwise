/**
 * Page links for the stats hub. On the web every page has its own address, so it can be shared,
 * bookmarked and found by search engines:
 *
 *   /riftwatch/stats                      hub front page
 *   /riftwatch/stats/<section>[/<year>]   tournaments, leagues, champions, patches, records, titles, compare
 *   /riftwatch/player/<slug>              /team/<slug>  /tournament/<slug>  /match/<slug>  /champion/<slug>  /league/<slug>
 *
 * The desktop app has no address bar, so it keeps its own back stack instead.
 */
import { useSyncExternalStore } from "react";
import { IS_WEB } from "../platform";

export type HubSection = "tournaments" | "leagues" | "champions" | "patches" | "records" | "titles" | "compare";
export type HubEntity = "team" | "player" | "event" | "match" | "champ" | "league";

export type HubRoute =
  | { kind: "home" }
  | { kind: HubSection; year?: string }
  | { kind: HubEntity; slug: string };

export const HUB_HOME: HubRoute = { kind: "home" };
const SECTIONS: HubSection[] = ["tournaments", "leagues", "champions", "patches", "records", "titles", "compare"];
const ENTITY_PATH: Record<HubEntity, string> = {
  team: "team", player: "player", event: "tournament", match: "match", champ: "champion", league: "league",
};
const PATH_ENTITY: Record<string, HubEntity> = Object.fromEntries(Object.entries(ENTITY_PATH).map(([k, v]) => [v, k as HubEntity]));

/** "/riftwatch/" on the web build, "/" in the desktop app. */
export const BASE: string = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");

/** The hub page an address points at, or null when it isn't one (the live scores page, say). */
export function parseHubPath(pathname: string): HubRoute | null {
  if (!pathname.startsWith(BASE)) return null;
  const parts = pathname.slice(BASE.length).split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  if (parts[0] === "stats") {
    if (parts.length === 1) return HUB_HOME;
    if ((SECTIONS as string[]).includes(parts[1])) {
      const kind = parts[1] as HubSection;
      return kind === "tournaments" && parts[2] && /^\d{4}$/.test(parts[2]) ? { kind, year: parts[2] } : { kind };
    }
    return null;
  }
  const kind = PATH_ENTITY[parts[0]];
  return kind && parts[1] && parts.length === 2 ? { kind, slug: parts[1].toLowerCase() } : null;
}

export function hubPath(r: HubRoute): string {
  if (r.kind === "home") return `${BASE}stats`;
  if ((SECTIONS as string[]).includes(r.kind)) {
    const y = "year" in r && r.year ? `/${r.year}` : "";
    return `${BASE}stats/${r.kind}${y}`;
  }
  return `${BASE}${ENTITY_PATH[r.kind as HubEntity]}/${encodeURIComponent((r as { slug: string }).slug)}`;
}

/** Full shareable web address of a hub page (the desktop app shares these too). */
export const hubShareUrl = (r: HubRoute): string => `https://lolworlds.com/riftwatch/${hubPath(r).slice(BASE.length)}`;

export const sameRoute = (a: HubRoute, b: HubRoute) => hubPath(a) === hubPath(b);

// ── The current page ──────────────────────────────────────────────────────

const atStart = IS_WEB && typeof window !== "undefined" ? parseHubPath(window.location.pathname) : null;
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
  const r = parseHubPath(window.location.pathname);
  if (r) {
    current = r;
    emit();
  }
  return r;
}

/**
 * Keeps the address bar in step with the main tabs on the web: the Stats tab shows its page's
 * address, any other tab the plain /riftwatch/ address. Moving into or out of the Stats tab adds a
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
