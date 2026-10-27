/** The last pages opened in the stats hub (teams, players, tournaments, matches...), kept on this device. */
import { useSyncExternalStore } from "react";
import { hubPath, type HubRoute } from "./route";
import { countView } from "../usage";

const KEY = "riftwatch_recent_pages";
const MAX = 10;
const KINDS = new Set(["team", "player", "event", "match", "champ", "league"]);

export interface RecentPage {
  route: HubRoute;
  title: string;
  at: number;
}

let list: RecentPage[] | null = null;
const listeners = new Set<() => void>();

function read(): RecentPage[] {
  if (list) return list;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    list = Array.isArray(raw) ? raw.filter((x) => x && x.route && typeof x.title === "string") : [];
  } catch {
    list = [];
  }
  return list;
}

/** Called by usePageTitle: the page just opened goes to the front of the list (`name`: see usePageTitle). */
export function rememberRecent(route: HubRoute, title: string, name?: string): void {
  if (!KINDS.has(route.kind) || !title) return;
  // a page's tabs are one page here (T1 once, not T1 and T1's matches), under the page's own name ("T1 · Matches")
  if ("tab" in route && route.tab) {
    route = { ...route, tab: undefined };
    title = title.replace(/ · [^·]+$/, "");
  }
  // and one view in the anonymous page counts (src/usage.ts: the stats home's Most viewed)
  if (route.kind !== "match" && "slug" in route) countView(`${route.kind}/${route.slug}`, name || title);
  const path = hubPath(route);
  const next = [{ route, title, at: Date.now() }, ...read().filter((x) => hubPath(x.route) !== path)].slice(0, MAX);
  list = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the list lives for this visit only */
  }
  listeners.forEach((l) => l());
}

export function useRecentPages(): RecentPage[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => [],
  );
}
