/**
 * Player photos and team logos for the stats pages: from the team list the app already loads from Riot (the roster
 * popup uses it too), and for everyone else (retired pros, old rosters) from Leaguepedia through the stats build
 * (scripts/stats/photos_lp.py fetches them nightly; hub/photos.json says who has one, the picture is
 * stats/photos/<slug>.webp). Riot's pictures load straight from Riot's image server, which doesn't allow them inside
 * copied pictures, so they carry data-nocapture where they're shown; the Leaguepedia copies are on our own server.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CatalogData } from "../types";
import { load, statsPhotoUrl } from "../stats";
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
    for (const t of catalog?.teams || []) {
      if (!t.image) continue;
      if (t.name) logos.set(norm(t.name), t.image);
      if (t.code && !logos.has(`code:${norm(t.code)}`)) logos.set(`code:${norm(t.code)}`, t.image);
    }
    return { photos, logos };
  }, [catalog]);
}

// ── Leaguepedia photos (slug -> fetch date YYYYMMDD), one small file per session ──────────────

type PhotoMap = Record<string, string>;
let hubPhotos: PhotoMap | null = null;
let hubPhotosPromise: Promise<PhotoMap> | null = null;

function loadHubPhotos(): Promise<PhotoMap> {
  if (!hubPhotosPromise) {
    hubPhotosPromise = load<PhotoMap>("hub/photos.json")
      .catch((): PhotoMap => ({})) // an older build without the file: nobody has one
      .then((m) => (hubPhotos = m));
  }
  return hubPhotosPromise;
}

/** Who has a Leaguepedia photo; null until the list has loaded. */
export function useHubPhotos(): PhotoMap | null {
  const [m, setM] = useState<PhotoMap | null>(hubPhotos);
  useEffect(() => {
    if (hubPhotos) return;
    let on = true;
    loadHubPhotos().then((x) => {
      if (on) setM(x);
    });
    return () => {
      on = false;
    };
  }, []);
  return m;
}

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

export function useTeamLogo(name: string | undefined, code?: string): string | undefined {
  const { logos } = useIndex();
  return logos.get(norm(name)) || (code ? logos.get(`code:${norm(code)}`) : undefined);
}
