import { describe, expect, it } from "vitest";
import { findHubTeam, groupRank, searchHub, type HubIndex } from "../hub/data";
import type { HubSearchKind } from "../hub/data";
import { champPairShortcuts, matchupShortcuts } from "../components/hub/HubSearch";

// A tiny search index shaped like hub/search/*.json
const index: HubIndex = {
  teams: [
    ["Kiwoom DRX", "", 1326, "2026", "DRX | DragonX", "KZ | KRX", "Korea"],
    ["DRX Rookie", "", 30, "2020", "", "", ""],
    ["Team Singularity", "", 153, "2022", "", "SNG", "Europe"],
    ["Ahriro", "", 4, "2024", "", "", ""],
    ["G2 Esports", "", 1160, "2026", "", "G2", "EMEA"],
    ["Hanwha Life Esports", "", 980, "2026", "ROX Tigers | KOO Tigers", "HLE", "Korea"],
    ["Team Liquid", "", 1400, "2026", "Team Curse", "TL", "Americas"],
  ],
  players: [
    ["Faker", "", "T1", 1742, "2026", "M", "Lee Sang-hyeok"],
    ["Sahrii", "", "Some Team", 98, "2025", "M", ""],
    ["Chovy", "", "Gen.G", 1100, "2026", "M", ""],
  ],
  events: [
    ["MSI 2026", "msi-2026", "2026", "Mid-Season Invitational", "P", "2026-07-12", 71],
    ["Season 3 World Championship", "worlds-season-3", "2013", "World Championship", "P", "2013-10-04", 63],
    ["RDAG 2022 West Asia", "", "2022", "", "S", "2022-05-01", 32],
  ],
  champs: [
    ["Ahri", "", 14477],
    ["Azir", "", 12000],
  ],
  leagues: [
    { u: "lol-champions-korea", l: "LoL Champions Korea", s: "LCK", r: "Korea", pr: 1, g: 4200, n: 45, from: "2012", to: "2026" },
  ],
};

const order = (r: Record<HubSearchKind, { score?: number }[]>) =>
  (Object.entries(r) as [HubSearchKind, never[]][])
    .filter(([, v]) => v.length)
    .sort((a, b) => groupRank(a[1]) - groupRank(b[1]))
    .map(([k]) => k);

describe("stats search", () => {
  it("ranks a team's old name with its current names, so the big team comes first", () => {
    expect(searchHub(index, "drx").team.map((h) => h.name)).toEqual(["Kiwoom DRX", "DRX Rookie"]);
  });

  it("doesn't match short searches across words", () => {
    expect(searchHub(index, "msi").team).toEqual([]); // not TeaM SIngularity
    expect(searchHub(index, "g2").event).toEqual([]); // not RDAG 2022
  });

  it("puts the group with the best match first", () => {
    expect(order(searchHub(index, "ahri"))[0]).toBe("champ");
    expect(order(searchHub(index, "msi"))[0]).toBe("event");
  });

  it("finds a near miss when nothing matches", () => {
    const fakr = searchHub(index, "fakr");
    expect(fakr.player.map((h) => h.name)).toEqual(["Faker"]);
    expect(fakr.player[0].fuzzy).toBe(true);
    expect(searchHub(index, "chovyy").player[0].name).toBe("Chovy");
    expect(searchHub(index, "zzzz").player).toEqual([]);
  });

  it("links team + champion and player + champion searches directly to their specific champion view", () => {
    const teamPair = champPairShortcuts(index, "G2 Ahri");
    expect(teamPair.shortcuts[0].route).toEqual({
      kind: "team",
      slug: "g2-esports",
      tab: "champions",
      query: "champ=ahri",
    });
    expect(teamPair.shortcuts[0].fillText).toBe("G2 Esports Ahri");

    const playerPair = champPairShortcuts(index, "Faker Ahri");
    expect(playerPair.shortcuts[0].route).toEqual({
      kind: "player",
      slug: "faker",
      tab: "champions",
      query: "champ=ahri",
    });
    expect(playerPair.shortcuts[0].fillText).toBe("Faker Ahri");

    // 1-char champion prefix after Tab-filling a team or player name ("G2 a" -> G2 Esports · Ahri)
    const prefixPair = champPairShortcuts(index, "G2 a");
    expect(prefixPair.shortcuts[0]?.route).toEqual({
      kind: "team",
      slug: "g2-esports",
      tab: "champions",
      query: "champ=ahri",
    });
  });

  it("links champion vs champion searches to Counter-pick finder and Game finder", () => {
    const cvc = matchupShortcuts(index, "Ahri vs Azir");
    expect(cvc.map((s) => s.route)).toEqual([
      { kind: "counters", query: "champ=ahri&vs=azir" },
      { kind: "finder", query: "champ=ahri&vschamp=azir" },
    ]);
  });

  it("links team vs team searches to Match prep, Draft board, Compare and Game finder", () => {
    const tvt = matchupShortcuts(index, "G2 vs DRX");
    expect(tvt.map((s) => s.route)).toEqual([
      { kind: "prep", a: "g2-esports", b: "kiwoom-drx" },
      { kind: "draft", query: "teams=g2-esports,kiwoom-drx" },
      { kind: "compare", mode: "team", a: "g2-esports", b: "kiwoom-drx" },
      { kind: "finder", query: "team=g2-esports&vs=kiwoom-drx" },
    ]);
  });

  it("matches year-qualified league queries and event aliases", () => {
    const lck2026 = searchHub(index, "LCK 2026").league[0];
    expect(lck2026?.slug).toBe("lol-champions-korea");
    expect(lck2026?.year).toBe("2026");

    const lck2024 = searchHub(index, "2024 LCK").league[0];
    expect(lck2024?.slug).toBe("lol-champions-korea");
    expect(lck2024?.year).toBe("2024");

    const w2013 = searchHub(index, "Worlds 2013").event[0];
    expect(w2013?.slug).toBe("worlds-season-3");
  });

  it("resolves sponsored and historical team names in findHubTeam", () => {
    expect(findHubTeam(index, "Team Liquid Honda", "TL")).toBe("team-liquid");
    expect(findHubTeam(index, "ROX Tigers", "ROX")).toBe("hanwha-life-esports");
    expect(findHubTeam(index, "DRX", "DRX")).toBe("kiwoom-drx");
  });
});
