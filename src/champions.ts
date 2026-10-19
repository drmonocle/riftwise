import { useEffect, useState } from "react";
import { currentLang } from "./i18n";
import { load } from "./stats";

/**
 * Champion names in the reader's language (아지르, 阿兹尔, アジール, Ngộ Không...), from Riot's Data Dragon.
 * The stats use English names; until the list arrives (or if it can't load) names stay English.
 */
export const DD_LOCALE: Record<string, string> = {
  es: "es_ES", "pt-BR": "pt_BR", ko: "ko_KR", vi: "vi_VN", "zh-CN": "zh_CN", "zh-TW": "zh_TW",
  ja: "ja_JP", fr: "fr_FR", de: "de_DE", tr: "tr_TR",
};
// English stat names whose Data Dragon id differs
const ID_FIXES: Record<string, string> = { wukong: "monkeyking", nunuwillump: "nunu", renataglasc: "renata" };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let names: Record<string, string> | null = null;
let loading: Promise<void> | null = null;
let loadedLoc: string | null = null; // the language `names` / `loading` are for
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function champName(english: string): string {
  if (!names || !english) return english;
  const k = norm(english);
  return names[ID_FIXES[k] || k] || english;
}

export function loadChampionNames(): Promise<void> {
  const loc = DD_LOCALE[currentLang()];
  if (!loc) {
    // back to English: forget another language's names
    names = null;
    loading = null;
    loadedLoc = null;
    return Promise.resolve();
  }
  if (loading && loadedLoc === loc) return loading;
  // the language changed: load its names
  names = null;
  loadedLoc = loc;
  loading = (async () => {
    const key = `riftwatch_champ_names_${loc}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached && Date.now() - cached.at < WEEK_MS) {
        names = cached.names;
        return;
      }
    } catch {
      /* fetch below */
    }
    try {
      // The stats build's copy (hub/dd/<language>.json, a few KB, shared with the item / rune names), else Riot's
      // full champion list (about 35 KB)
      names = (await load<{ champ: Record<string, string> }>(`hub/dd/${currentLang()}.json`)).champ;
      if (names && Object.keys(names).length > 100) {
        try {
          localStorage.setItem(key, JSON.stringify({ at: Date.now(), names }));
        } catch {
          /* storage full: still fine for this session */
        }
        return;
      }
      names = null;
    } catch {
      names = null; // not in this build: Riot's list below
    }
    try {
      const versions = await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json();
      const data = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/${loc}/champion.json`)).json();
      const out: Record<string, string> = {};
      // Simplified Chinese keeps the everyday name (阿狸) in "title" and the epithet (九尾妖狐) in "name"
      for (const [id, ch] of Object.entries<any>(data.data)) out[norm(id)] = loc === "zh_CN" ? ch.title || ch.name : ch.name;
      names = out;
      try {
        localStorage.setItem(key, JSON.stringify({ at: Date.now(), names: out }));
      } catch {
        /* storage full: still fine for this session */
      }
    } catch {
      /* offline or blocked: stay with English names */
    }
  })();
  return loading;
}

/** Re-renders the calling component once the translated names have loaded. */
export function useChampionNames(): void {
  const [, setReady] = useState(names !== null);
  useEffect(() => {
    let alive = true;
    loadChampionNames().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
}

/** For tests. */
export function setChampionNamesForTests(map: Record<string, string> | null): void {
  names = map;
}
