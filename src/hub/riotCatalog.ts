/**
 * Player photos and team logos for the stats pages: from the team list the app already loads from Riot (the roster
 * popup uses it too), and for everyone else (retired pros, old rosters) from Leaguepedia through the stats build
 * (scripts/stats/photos_lp.py fetches them nightly; hub/photos.json says who has one, the picture is
 * stats/photos/<slug>.webp). Riot's pictures load straight from Riot's image server, which doesn't allow them inside
 * copied pictures, so they carry data-nocapture where they're shown; the Leaguepedia copies are on our own server.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CatalogData } from "../types";
import { load, statsLogoUrl, statsPhotoUrl } from "../stats";
import { prettySlug } from "./data";

export const RiotCatalogContext = createContext<CatalogData | null>(null);

const norm = (s: string | undefined) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Riot lists a picture for every player, but many are the same stand-in silhouette (photos_lp.py skips the same ones). */
const PLACEHOLDER = /default-headshot|silhouette|placeholder|\/download\.png|pobrane|noplayer/i;

/** name -> photo, and team name / code -> logo */
function useIndex() {
  const catalog = useContext(RiotCatalogContext);
  return useMemo(() => {
    const photos = new Map<string, { team: string; image: string }[]>();
    for (const p of catalog?.players || []) {
      if (!p.image || !p.name || PLACEHOLDER.test(p.image)) continue;
      const k = norm(p.name);
      photos.set(k, [...(photos.get(k) || []), { team: norm(p.teamName), image: p.image }]);
    }
    const logos = new Map<string, string>();
    const named: [string, string][] = []; // every team's normalized name and logo, for the longer-name match below
    for (const t of catalog?.teams || []) {
      if (!t.image) continue;
      if (t.name) {
        logos.set(norm(t.name), t.image);
        named.push([norm(t.name), t.image]);
      }
      if (t.code && !logos.has(`code:${norm(t.code)}`)) logos.set(`code:${norm(t.code)}`, t.image);
    }
    return { photos, logos, named };
  }, [catalog]);
}

// ── Leaguepedia photos and team logos (slug -> fetch date YYYYMMDD), one small file each per session ──────────

type PhotoMap = Record<string, string>;

/** One of the stats build's "who has a picture" lists: loaded once, then kept. */
function stampList(file: string) {
  let map: PhotoMap | null = null;
  let promise: Promise<PhotoMap> | null = null;
  const loadList = (): Promise<PhotoMap> => {
    if (!promise) {
      promise = load<PhotoMap>(file)
        .catch((): PhotoMap => ({})) // an older build without the file: nobody has one
        .then((m) => (map = m));
    }
    return promise;
  };
  /** the list; null until it has loaded (and not loaded at all while it isn't needed) */
  const useList = (need = true): PhotoMap | null => {
    const [m, setM] = useState<PhotoMap | null>(map);
    useEffect(() => {
      if (map || !need) return;
      let on = true;
      loadList().then((x) => {
        if (on) setM(x);
      });
      return () => {
        on = false;
      };
    }, [need]);
    return m ?? map;
  };
  return [loadList, useList] as const;
}

/** Players with a Leaguepedia photo, and teams with a Leaguepedia logo (where Riot's list has none). */
export const [loadHubPhotos, useHubPhotos] = stampList("hub/photos.json");
export const [loadHubLogos, useHubLogos] = stampList("hub/logos.json");

export interface PlayerPicture {
  src: string;
  from: "riot" | "leaguepedia";
}

/**
 * A pro's picture: Riot's photo of the player on the given team, else Leaguepedia's (by the player's page slug, or
 * the slug made from the name when none is given), else Riot's when the name is unique in its list.
 */
export function usePlayerPicture(name: string | undefined, teamName?: string, slug?: string, img?: string): PlayerPicture | undefined {
  const { photos } = useIndex();
  const hub = useHubPhotos();
  const list = photos.get(norm(name)) || [];
  const t = norm(teamName);
  const onTeam = t ? list.find((x) => x.team === t || x.team.includes(t) || t.includes(x.team))?.image : undefined;
  if (onTeam) return { src: onTeam, from: "riot" };
  // the photo the stats build found in Riot's list: shows before (or without) the app's own copy of that list
  if (img) return { src: img, from: "riot" };
  const key = slug || (name ? prettySlug(name) : "");
  const stamp = key && hub ? hub[key] : undefined;
  if (stamp !== undefined) return { src: statsPhotoUrl(key, stamp), from: "leaguepedia" };
  return list.length === 1 ? { src: list[0].image, from: "riot" } : undefined;
}

/** A team's logo by its name, its short name, or else Riot's team whose name starts with it, the shortest one
 *  ("Team Liquid" is "Team Liquid Alienware", code TLAW, in Riot's list); for a team Riot has none for, Leaguepedia's
 *  on our server (TV, 2026-10-28: "make sure all the teams have their proper logos"). */
export function useTeamLogo(name: string | undefined, code?: string): string | undefined {
  const riot = useRiotLogo(name, code);
  // the team page's slug is made from its name (photos_lp.py stores the logo under it); the list loads only when needed
  const hub = useHubLogos(!riot && !!name);
  if (riot) return riot;
  const key = name ? prettySlug(name) : "";
  const stamp = key && hub ? hub[key] : undefined;
  return stamp !== undefined ? statsLogoUrl(key, stamp) : undefined;
}

function useRiotLogo(name: string | undefined, code?: string): string | undefined {
  const { logos, named } = useIndex();
  const n = norm(name);
  // a Leaguepedia note tells teams of one name apart ("Team Secret (Vietnamese Team)"); Riot lists the name alone
  const bare = norm(name?.replace(/\s*\([^()]*\)\s*$/, ""));
  // a short one-word name is its code too ("TSM" is "TSM Challengers", code TSM, in Riot's list)
  const c = code || (name && name.length <= 5 && !/\s/.test(name) ? name : undefined);
  const exact = logos.get(n) || (bare !== n ? logos.get(bare) : undefined) || (c ? logos.get(`code:${norm(c)}`) : undefined);
  if (exact || n.length < 4) return exact;
  let best: [string, string] | undefined;
  for (const x of named) if (x[0].startsWith(n) && (!best || x[0].length < best[0].length)) best = x;
  return best?.[1];
}
