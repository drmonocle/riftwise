import { describe, it, expect, afterEach } from "vitest";
import { LANGUAGES, detectLanguage, tl, tn, tc, roleName, regionName, stageName, setDictionaryForTests } from "../i18n";

// The app's source files as text (tests excluded) and the language files.
const SOURCES = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../__tests__/**", "!../i18n/index.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const LOCALE_FILES = import.meta.glob("../i18n/locales/*.json", { import: "default", eager: true }) as Record<string, Record<string, string>>;

/**
 * Keys that never appear as a literal in the code: they are built from data (Riot region codes,
 * roster roles, 24/7 schedule events and stages).
 */
const DATA_KEYS = [
  ...["Top", "Jungle", "Mid", "Bot", "Support"].map((r) => `role::${r}`),
  ...["Worlds", "MSI", "First Stand"].map((e) => `event::${e}`),
  "First Stand",
  "stage day::{stage} Day {n}",
  "stage day::Day {n}",
  ...[
    "Round {n}",
    "Bracket Rounds {n}",
    "Group Stage",
    "Play-ins",
    "Play-ins Knockouts",
    "Play-ins Finals",
    "Swiss Stage",
    "Rumble",
    "Quarterfinals",
    "Semifinals",
    "Finals",
    "Grand Finals",
    "Elimination",
    "Tiebreakers",
    "Qualifiers",
    "Qualifier Series",
    "Last Chance Qualifier",
    "5th Place",
  ].map((s) => `stage::${s}`),
  ...[
    "INTERNATIONAL",
    "KOREA",
    "CHINA",
    "EMEA",
    "EUROPE",
    "NORTH AMERICA",
    "PACIFIC",
    "BRAZIL",
    "JAPAN",
    "VIETNAM",
    "HONG KONG, MACAU, TAIWAN",
    "LATIN AMERICA",
    "LATIN AMERICA NORTH",
    "LATIN AMERICA SOUTH",
    "OCEANIA",
    "AMERICAS",
    "COMMONWEALTH OF INDEPENDENT STATES",
  ].map((r) => `region::${r}`),
];

const STR = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`(?:[^\`\\$]|\\.)*\`)`;
const unquote = (s: string): string => {
  const body = s.slice(1, -1);
  if (s[0] === '"') return JSON.parse(s);
  return body.replace(/\\(.)/g, "$1");
};

/** Every key the app can ask for: literals in tl/tk/tn/tc calls plus the data keys. */
function allKeys(): { keys: Set<string>; plural: Set<string> } {
  const keys = new Set<string>(DATA_KEYS);
  const plural = new Set<string>();
  for (const text of Object.values(SOURCES)) {
    for (const m of text.matchAll(new RegExp(String.raw`\b(?:tl|tk)\(\s*` + STR, "g"))) keys.add(unquote(m[1]));
    for (const m of text.matchAll(new RegExp(String.raw`\btn\(\s*` + STR + String.raw`\s*,\s*` + STR, "g"))) {
      const k = `${unquote(m[1])}|${unquote(m[2])}`;
      keys.add(k);
      plural.add(k);
    }
    for (const m of text.matchAll(new RegExp(String.raw`\btc\(\s*` + STR + String.raw`\s*,\s*` + STR, "g")))
      keys.add(`${unquote(m[1])}::${unquote(m[2])}`);
  }
  return { keys, plural };
}

const placeholders = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

const { keys, plural } = allKeys();
const langs = LANGUAGES.map((l) => l.code).filter((c) => c !== "en");
const load = (lang: string): Record<string, string> => LOCALE_FILES[`../i18n/locales/${lang}.json`] ?? {};

describe("translations", () => {
  afterEach(() => setDictionaryForTests("en", {}));

  it("finds the app's text", () => {
    expect(keys.size).toBeGreaterThan(400);
    expect(keys.has("Live Matches")).toBe(true);
    expect(plural.has("{n} match|{n} matches")).toBe(true);
  });

  it.each(langs)("%s has every text, with the same {placeholders}", (lang) => {
    const dict = load(lang);
    const missing = [...keys].filter((k) => !(k in dict) || !String(dict[k]).trim());
    expect(missing, `${lang} is missing`).toEqual([]);
    const unused = Object.keys(dict).filter((k) => !keys.has(k));
    expect(unused, `${lang} has text the app no longer uses`).toEqual([]);
    const broken: string[] = [];
    for (const k of keys) {
      const english = plural.has(k) ? k.split("|") : [k.replace(/^[^:]*::/, "")];
      const want = placeholders(english.join(" "));
      for (const form of String(dict[k]).split(plural.has(k) ? "|" : /(?!)/)) {
        // a plural form may leave out {n} ("one match") but must not invent or drop the others
        const got = placeholders(form);
        const extra = got.filter((p) => !want.includes(p));
        const lost = want.filter((p) => p !== "n" && !got.includes(p));
        if (extra.length || lost.length || (!plural.has(k) && got.join() !== want.join())) broken.push(`${k} => ${form}`);
      }
    }
    expect(broken, `${lang} placeholders differ`).toEqual([]);
  });

  it.each(langs)("%s keeps product and brand names", (lang) => {
    const dict = load(lang);
    for (const [k, v] of Object.entries(dict)) {
      for (const brand of ["RiftWise", "Twitch", "YouTube", "GitHub", "Ko-fi", "Leaguepedia", "lolworlds.com", "Alt+Shift+L"]) {
        if (k.includes(brand)) expect(v, `${lang}: ${k}`).toContain(brand);
      }
    }
  });

  it("uses the translation, the plural rules and the context keys", () => {
    setDictionaryForTests("ko", {
      "Live Matches": "라이브 경기",
      "Starts in {m}m {s}s": "{m}분 {s}초 후 시작",
      "{n} match|{n} matches": "{n}경기",
      "role::Bot": "원딜",
      "stage day::{stage} Day {n}": "{stage} {n}일차",
      "stage::Group Stage": "그룹 스테이지",
      "region::KOREA": "한국",
    });
    expect(tl("Live Matches")).toBe("라이브 경기");
    expect(tl("Starts in {m}m {s}s", { m: 3, s: 9 })).toBe("3분 9초 후 시작");
    expect(tn("{n} match", "{n} matches", 1)).toBe("1경기");
    expect(roleName("bottom")).toBe("원딜");
    expect(roleName("ADC")).toBe("원딜");
    expect(stageName("Group Stage Day 3")).toBe("그룹 스테이지 3일차");
    expect(regionName("Korea")).toBe("한국");
    expect(tl("Not translated")).toBe("Not translated");
    setDictionaryForTests("fr", { "{n} match|{n} matches": "{n} match|{n} matchs" });
    expect(tn("{n} match", "{n} matches", 1)).toBe("1 match");
    expect(tn("{n} match", "{n} matches", 0)).toBe("0 match"); // French: 0 is singular
    expect(tn("{n} match", "{n} matches", 5)).toBe("5 matchs");
    expect(tc("short tab", "Settings")).toBe("Settings");
  });

  it("picks the language from the browser", () => {
    expect(detectLanguage(["ko-KR", "en"])).toBe("ko");
    expect(detectLanguage(["zh-TW"])).toBe("zh-TW");
    expect(detectLanguage(["zh-Hant-HK"])).toBe("zh-TW");
    expect(detectLanguage(["zh-HK"])).toBe("zh-TW");
    expect(detectLanguage(["zh"])).toBe("zh-CN");
    expect(detectLanguage(["pt-PT"])).toBe("pt-BR");
    expect(detectLanguage(["es-MX"])).toBe("es");
    expect(detectLanguage(["nl-NL", "de-DE"])).toBe("de");
    expect(detectLanguage(["nl-NL"])).toBe("en");
  });
});
