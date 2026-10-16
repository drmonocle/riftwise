/**
 * Champion, item, summoner spell and rune pictures from Riot's Data Dragon (allowed for fan sites).
 * The stats name things in English ("Kai'Sa", "Rabadon's Deathcap", "Flash", "Conqueror"), so the
 * English lists are loaded once (cached a week) to turn names into picture addresses. Anything not
 * found (old items, renamed runes) is shown as text instead.
 */
import { useEffect, useState } from "react";

const DD = "https://ddragon.leagueoflegends.com/cdn";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KEY = "riftwatch_ddragon_maps_v3";

interface Maps {
  v: string;
  champ: Record<string, string>; // normalized name -> image file id ("MonkeyKing")
  item: Record<string, string>; // normalized name -> item id ("3089")
  spell: Record<string, string>; // normalized name -> image file ("SummonerFlash.png")
  rune: Record<string, string>; // normalized name -> icon path ("perk-images/Styles/...png")
  full: Record<string, 1>; // normalized names of finished items (not parts, starters or consumables)
  names: string[]; // every champion's English name ("Kai'Sa"), for the draft board
}

let maps: Maps | null = null;
let loading: Promise<void> | null = null;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Stat names whose Data Dragon id differs from the name
const CHAMP_FIXES: Record<string, string> = { wukong: "MonkeyKing", nunuwillump: "Nunu", renataglasc: "Renata" };

function loadMaps(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      localStorage.removeItem("riftwatch_ddragon_maps_v2"); // older copy without the champion list
      const cached = JSON.parse(localStorage.getItem(KEY) || "null");
      if (cached && Date.now() - cached.at < WEEK_MS) {
        maps = cached.maps;
        return;
      }
    } catch {
      /* fetch below */
    }
    try {
      const v: string = (await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json())[0];
      const get = (f: string) => fetch(`${DD}/${v}/data/en_US/${f}`).then((r) => r.json());
      const [champs, items, spells, runes] = await Promise.all([get("champion.json"), get("item.json"), get("summoner.json"), get("runesReforged.json")]);
      const m: Maps = { v, champ: {}, item: {}, spell: {}, rune: {}, full: {}, names: [] };
      for (const [id, c] of Object.entries<any>(champs.data)) {
        m.champ[norm(c.name)] = id;
        m.champ[norm(id)] = id;
        m.names.push(c.name);
      }
      for (const [id, it] of Object.entries<any>(items.data)) {
        const k = norm(it.name);
        // Several ids can share a name (Arena / Ornn versions): keep the lowest, the normal one
        if (!m.item[k] || Number(id) < Number(m.item[k])) m.item[k] = id;
        const tags: string[] = it.tags || [];
        const finished = !(it.into && it.into.length) && !tags.includes("Consumable") && !tags.includes("Trinket");
        if (finished && ((it.gold?.total ?? 0) >= 900 || (tags.includes("Boots") && (it.depth ?? 1) >= 2))) m.full[k] = 1;
      }
      for (const s of Object.values<any>(spells.data)) m.spell[norm(s.name)] = s.image.full;
      for (const tree of runes) {
        m.rune[norm(tree.name)] = tree.icon;
        for (const slot of tree.slots) for (const r of slot.runes) m.rune[norm(r.name)] = r.icon;
      }
      maps = m;
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), maps: m }));
      } catch {
        /* storage full: fine for this session */
      }
    } catch {
      /* offline: names stay as text */
    }
  })();
  return loading;
}

/** Re-renders the caller once the picture lists are ready. */
export function useDDragon(): boolean {
  const [ready, setReady] = useState(maps !== null);
  useEffect(() => {
    let alive = true;
    loadMaps().then(() => alive && setReady(maps !== null));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/** Every champion's English name (empty until the lists are loaded, or offline). */
export function championList(): string[] {
  return maps?.names || [];
}

export function champIcon(name: string | undefined): string | null {
  if (!maps || !name) return null;
  const k = norm(name);
  const id = maps.champ[k] || CHAMP_FIXES[k];
  return id ? `${DD}/${maps.v}/img/champion/${id}.png` : null;
}

/** True for finished items (worth showing in a build); unknown items (removed from the game) count as finished. */
export function isFinishedItem(name: string): boolean {
  if (!maps) return true;
  const k = norm(name);
  return !maps.item[k] || !!maps.full[k];
}

/** Item picture by Riot item id (the live feed sends ids). */
export function itemIconById(id: number | undefined): string | null {
  if (!maps || !id) return null;
  return `${DD}/${maps.v}/img/item/${id}.png`;
}

export function itemIcon(name: string | undefined): string | null {
  if (!maps || !name) return null;
  const id = maps.item[norm(name)];
  return id ? `${DD}/${maps.v}/img/item/${id}.png` : null;
}

export function spellIcon(name: string | undefined): string | null {
  if (!maps || !name) return null;
  const f = maps.spell[norm(name)];
  return f ? `${DD}/${maps.v}/img/spell/${f}` : null;
}

// Keystones Riot has since removed: their pictures are still on Data Dragon
const RETIRED_RUNES: Record<string, string> = {
  phaserush: "perk-images/Styles/Sorcery/PhaseRush/PhaseRush.png",
  predator: "perk-images/Styles/Domination/Predator/Predator.png",
  kleptomancy: "perk-images/Styles/Inspiration/Kleptomancy/Kleptomancy.png",
};

export function runeIcon(name: string | undefined): string | null {
  if (!maps || !name) return null;
  const p = maps.rune[norm(name)] || RETIRED_RUNES[norm(name)];
  return p ? `${DD}/img/${p}` : null;
}
