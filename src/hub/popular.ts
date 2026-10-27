/**
 * "Most viewed this week" (the stats home, for a visitor with no recently viewed pages yet): the pages most opened in
 * the last seven days, from the anonymous page counts (src/usage.ts -> server/push/usage.go, /api/push/popular).
 */
import { IS_WEB } from "../platform";
import { prettySlug } from "./data";
import type { HubRoute } from "./route";

export interface PopularPage {
  route: HubRoute;
  title: string;
  views: number;
}

const URL_ = IS_WEB ? "/api/push/popular" : "https://riftwise.gg/api/push/popular";
const KINDS = new Set(["team", "player", "event", "champ", "league"]);

/**
 * The name a page was counted with, only when it is that page's name: it must give the page's own address the way
 * the stats build makes them ("Gen.G" -> geng, "LYON (2024 American Team)" -> lyon-2024-american-team), so a name
 * sent by hand to the counter can't put other words on the stats home.
 */
export function nameFits(slug: string, title: string): boolean {
  const s = prettySlug(title);
  return !!s && (s === slug || slug.startsWith(`${s}-`));
}

let cache: Promise<PopularPage[]> | null = null;

/** the most viewed pages (never fails: an empty list when the counter can't be reached) */
export function loadPopular(): Promise<PopularPage[]> {
  if (!cache)
    cache = fetch(URL_, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((j: { pages?: { page: string; title: string; n: number }[] }) =>
        (j.pages || [])
          .map((p) => {
            const [kind, slug] = (p.page || "").split("/");
            return KINDS.has(kind) && slug && nameFits(slug, p.title || "") ? { route: { kind, slug } as HubRoute, title: p.title, views: p.n } : null;
          })
          .filter((p): p is PopularPage => !!p),
      )
      .catch(() => []);
  return cache;
}
