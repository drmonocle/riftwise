import { describe, it, expect } from "vitest";
import { searchAlias, isNonLatin } from "../searchAliases";

describe("native-script search", () => {
  it("maps well-known nicknames to roster names", () => {
    expect(searchAlias("페이커")).toBe("Faker");
    expect(searchAlias(" 티원 ")).toBe("T1");
    expect(searchAlias("b站")).toBe("Bilibili");
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

import { searchHub, type HubIndex } from "../hub/data";
describe("team search by old names and short names", () => {
  const index: HubIndex = {
    teams: [
      ["DWG KIA Youth", "", 120, "2022", "", "", "Korea"],
      ["Dplus Kia", "", 1180, "2026", "DWG KIA | DAMWON Gaming", "DK", "Korea"],
      ["T1", "", 1860, "2026", "SK Telecom T1", "SKT", "Korea"],
      ["Gen.G", "", 1631, "2026", "KSV eSports | Samsung Galaxy", "GEN | KSV", "Korea"],
      ["Samsung Blue", "", 300, "2014", "", "", "Korea"],
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
  });
});
