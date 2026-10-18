/**
 * Player photos and team logos for the stats pages, from the team list the app already loads from Riot (the roster
 * popup uses it too). Pictures load straight from Riot's image server, so they add nothing to riftwise.gg's load.
 * Riot's server doesn't allow them inside copied pictures, so they carry data-nocapture where they're shown.
 */
import { createContext, useContext, useMemo } from "react";
import type { CatalogData } from "../types";

export const RiotCatalogContext = createContext<CatalogData | null>(null);

const norm = (s: string | undefined) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** name -> photo, and team name / code -> logo */
function useIndex() {
  const catalog = useContext(RiotCatalogContext);
  return useMemo(() => {
    const photos = new Map<string, { team: string; image: string }[]>();
    for (const p of catalog?.players || []) {
      if (!p.image || !p.name) continue;
      const k = norm(p.name);
      photos.set(k, [...(photos.get(k) || []), { team: norm(p.teamName), image: p.image }]);
    }
    const logos = new Map<string, string>();
    for (const t of catalog?.teams || []) {
      if (!t.image) continue;
      if (t.name) logos.set(norm(t.name), t.image);
      if (t.code && !logos.has(`code:${norm(t.code)}`)) logos.set(`code:${norm(t.code)}`, t.image);
    }
    return { photos, logos };
  }, [catalog]);
}

/** A pro's photo: the one on their current team when two players share the name. */
export function usePlayerPhoto(name: string | undefined, teamName?: string): string | undefined {
  const { photos } = useIndex();
  const list = photos.get(norm(name));
  if (!list?.length) return undefined;
  const t = norm(teamName);
  return (t && list.find((x) => x.team === t || x.team.includes(t) || t.includes(x.team))?.image) || (list.length === 1 ? list[0].image : undefined);
}

export function useTeamLogo(name: string | undefined, code?: string): string | undefined {
  const { logos } = useIndex();
  return logos.get(norm(name)) || (code ? logos.get(`code:${norm(code)}`) : undefined);
}
