/**
 * Champion, item, summoner spell and rune pictures from Riot's Data Dragon (allowed for fan sites).
 * The stats name things in English ("Kai'Sa", "Rabadon's Deathcap", "Flash", "Conqueror"), so the
 * English lists are loaded once (cached a week) to turn names into picture addresses. Anything not
 * found (old items, renamed runes) is shown as text instead.
 */
import { useEffect, useState } from "react";

const DD = "https://ddragon.leagueoflegends.com/cdn";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KEY = "riftwatch_ddragon_maps_v1";

interface Maps {
  v: string;
  champ: Record<string, string>; // normalized name -> image file id ("MonkeyKing")
  item: Record<string, string>; // normalized name -> item id ("3089")
  spell: Record<string, string>; // normalized name -> image file ("SummonerFlash.png")
  rune: Record<string, string>; // normalized name -> icon path ("perk-images/Styles/...png")
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
      const m: Maps = { v, champ: {}, item: {}, spell: {}, rune: {} };
      for (const [id, c] of Object.entries<any>(champs.data)) {
        m.champ[norm(c.name)] = id;
        m.champ[norm(id)] = id;
      }
      for (const [id, it] of Object.entries<any>(items.data)) {
        const k = norm(it.name);
        // Several ids can share a name (Arena / Ornn versions): keep the lowest, the normal one
        if (!m.item[k] || Number(id) < Number(m.item[k])) m.item[k] = id;
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

export function champIcon(name: string | undefined): string | null {
  if (!maps || !name) return null;
  const k = norm(name);
  const id = maps.champ[k] || CHAMP_FIXES[k];
  return id ? `${DD}/${maps.v}/img/champion/${id}.png` : null;
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

export function runeIcon(name: string | undefined): string | null {
  if (!maps || !name) return null;
  const p = maps.rune[norm(name)];
  return p ? `${DD}/img/${p}` : null;
}
