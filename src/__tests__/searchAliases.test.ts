import { describe, it, expect, vi } from "vitest";
import { searchAlias, isNonLatin } from "../searchAliases";
import { isTrinketItem } from "../hub/ddragon";
import { MissingFile } from "../stats";

describe("native-script search", () => {
  it("maps well-known nicknames to roster names", () => {
    expect(searchAlias("페이커")).toBe("Faker");
    expect(searchAlias(" 티원 ")).toBe("T1");
    expect(searchAlias("b站")).toBe("Bilibili");
    expect(searchAlias("thebausffs")).toBe("Baus");
    expect(searchAlias("Thebausffs")).toBe("Baus");
    expect(searchAlias("LR")).toBe("Los Ratones");
    expect(searchAlias("rekky")).toBe("Rekkles");
    expect(searchAlias("Faker")).toBe("Faker");
    expect(searchAlias("unknown")).toBe("unknown");
  });
  it("knows when a query has no Latin letters", () => {
    expect(isNonLatin("페이커")).toBe(true);
    expect(isNonLatin("滔搏")).toBe(true);
    expect(isNonLatin("T1")).toBe(false);
    expect(isNonLatin("Lê Văn")).toBe(false);
    expect(isNonLatin("")).toBe(false);
  });
});

import { eventTitle, setDictionaryForTests } from "../i18n";
describe("title names", () => {
  it("uses the reader's word for the event and drops 'Main Event'", () => {
    setDictionaryForTests("ko", { "event::Worlds": "롤드컵", "event::First Stand": "퍼스트 스탠드" });
    expect(eventTitle("Worlds 2025 Main Event")).toBe("롤드컵 2025");
    expect(eventTitle("First Stand 2026")).toBe("퍼스트 스탠드 2026");
    expect(eventTitle("LCK 2024 Summer")).toBe("LCK 2024 Summer");
    setDictionaryForTests("en", {});
    expect(eventTitle("Worlds 2016")).toBe("Worlds 2016");
    expect(eventTitle("Worlds Season 2")).toBe("Worlds 2012");
  });
});

import { champName, setChampionNamesForTests } from "../champions";
describe("champion names", () => {
  it("translates by Data Dragon id, including the odd ones", () => {
    setChampionNamesForTests({ azir: "아지르", monkeyking: "오공", nunu: "누누와 윌럼프", leblanc: "르블랑", kaisa: "카이사" });
    expect(champName("Azir")).toBe("아지르");
    expect(champName("Wukong")).toBe("오공");
    expect(champName("Nunu & Willump")).toBe("누누와 윌럼프");
    expect(champName("LeBlanc")).toBe("르블랑");
    expect(champName("Kai'Sa")).toBe("카이사");
    expect(champName("Unknown")).toBe("Unknown");
    setChampionNamesForTests(null);
    expect(champName("Azir")).toBe("Azir");
  });
});

import { loadHubSeries, loadLeagueSeason, matchesItemSearch, resolveItemSlug, resolveTeamAlias, searchHub, type HubIndex } from "../hub/data";
import { prefetchHubFile, resolveLeagueSlug } from "../hub/slugs";
describe("team search by old names and short names", () => {
  const index: HubIndex = {
    teams: [
      ["DWG KIA Youth", "", 120, "2022", "", "", "Korea"],
      ["Dplus Kia", "", 1180, "2026", "DWG KIA | DAMWON Gaming", "DK", "Korea"],
      ["T1", "", 1860, "2026", "SK Telecom T1", "SKT", "Korea"],
      ["Gen.G", "", 1631, "2026", "KSV eSports | Samsung Galaxy", "GEN | KSV", "Korea"],
      ["Samsung Blue", "", 300, "2014", "", "", "Korea"],
      ["TSM", "", 853, "2023", "", "TSM", "North America"],
      ["TSM Evo", "", 22, "2012", "Team SoloMid Evo", "", "North America"],
      ["Evil Geniuses Challengers", "", 340, "2023", "", "EG.C", "North America"],
      ["Evil Geniuses.NA", "evil-geniuses-na", 321, "2023", "Evil Geniuses", "", "North America"],
    ],
    players: [],
    events: [],
    champs: [],
  };
  it("puts the current org first", () => {
    expect(searchHub(index, "DWG").team[0].name).toBe("Dplus Kia");
    expect(searchHub(index, "damwon").team[0].name).toBe("Dplus Kia");
    expect(searchHub(index, "SKT").team[0].name).toBe("T1");
    expect(searchHub(index, "ksv").team[0].name).toBe("Gen.G");
    expect(searchHub(index, "Samsung").team[0].name).toBe("Gen.G");
    expect(searchHub(index, "Team SoloMid").team[0].name).toBe("TSM");
    expect(searchHub(index, "Evil Geniuses").team[0].name).toBe("Evil Geniuses.NA");
    expect(searchHub(index, "EG").team[0].name).toBe("Evil Geniuses.NA");
  });
  it("resolves common item abbreviations and shorthands", () => {
    expect(resolveItemSlug("ie")).toBe("infinity-edge");
    expect(resolveItemSlug("bork")).toBe("blade-of-the-ruined-king");
    expect(resolveItemSlug("zhonya")).toBe("zhonyas-hourglass");
    expect(resolveItemSlug("rabadon")).toBe("rabadons-deathcap");
    expect(resolveItemSlug("ldr")).toBe("lord-dominiks-regards");
    expect(matchesItemSearch("Zhonya's Hourglass", "Zhonya's Hourglass", "zhonya")).toBe(true);
    expect(matchesItemSearch("Blade of The Ruined King", "Blade of The Ruined King", "bork")).toBe(true);
    expect(matchesItemSearch("Infinity Edge", "Infinity Edge", "ie")).toBe(true);
    expect(matchesItemSearch("Infinity Edge", "Infinity Edge", "zhonya")).toBe(false);
  });
  it("resolves merged and rebranded team aliases", () => {
    expect(resolveTeamAlias("kz")).toBe("kiwoom-drx");
    expect(resolveTeamAlias("bds")).toBe("shifters");
    expect(resolveTeamAlias("geng-esports")).toBe("geng");
    expect(resolveTeamAlias("origen")).toBe("astralis");
    expect(resolveTeamAlias("lyon-gaming")).toBe("lyon");
    expect(resolveTeamAlias("movistar-koi-2018-2024")).toBe("movistar-koi-2017-2024");
    expect(resolveLeagueSlug("european-masters")).toBe("european-masters");
    expect(resolveLeagueSlug("eu-lcs")).toBe("europe-league-championship-series");
    expect(resolveLeagueSlug("na-lcs")).toBe("north-america-league-championship-series");
  });
  it("identifies trinket items that have no finished-item stats page", () => {
    expect(isTrinketItem("oracle-lens")).toBe(true);
    expect(isTrinketItem("Scarecrow Effigy")).toBe(true);
    expect(isTrinketItem("Stealth Ward", 3340)).toBe(true);
    expect(isTrinketItem("Infinity Edge", 3031)).toBe(false);
  });
  it("rejects non-year league seasons and riot match slugs before fetching", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(loadLeagueSeason("world-championship", "all")).rejects.toBeInstanceOf(MissingFile);
      await expect(loadHubSeries("riot-123")).rejects.toBeInstanceOf(MissingFile);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it("resolves aliases and skips riot match IDs in startup prefetch paths", () => {
    expect(prefetchHubFile({ kind: "team", slug: "kz" })).toBe("hub/team/kiwoom-drx.json");
    expect(prefetchHubFile({ kind: "team", slug: "bds" })).toBe("hub/team/shifters.json");
    expect(prefetchHubFile({ kind: "team", slug: "lyon-gaming" })).toBe("hub/team/lyon.json");
    expect(prefetchHubFile({ kind: "team", slug: "movistar-koi-2018-2024" })).toBe("hub/team/movistar-koi-2017-2024.json");
    expect(prefetchHubFile({ kind: "league", slug: "lck" })).toBe("hub/league/lol-champions-korea.json");
    expect(prefetchHubFile({ kind: "match", slug: "riot-12345" })).toBeNull();
    expect(prefetchHubFile({ kind: "match", slug: "worlds-2025-finals-1" })).toBe("hub/game/worlds-2025-finals-1.json");
  });
});
