import { describe, expect, it } from "vitest";
import { groupRank, searchHub, type HubIndex } from "../hub/data";
import type { HubSearchKind } from "../hub/data";

// A tiny search index shaped like hub/search/*.json
const index: HubIndex = {
  teams: [
    ["Kiwoom DRX", "", 1326, "2026", "DRX | DragonX", "KZ | KRX", "Korea"],
    ["DRX Rookie", "", 30, "2020", "", "", ""],
    ["Team Singularity", "", 153, "2022", "", "SNG", "Europe"],
    ["Ahriro", "", 4, "2024", "", "", ""],
    ["G2 Esports", "", 1160, "2026", "", "G2", "EMEA"],
  ],
  players: [
    ["Faker", "", "T1", 1742, "2026", "M", "Lee Sang-hyeok"],
    ["Sahrii", "", "Some Team", 98, "2025", "M", ""],
    ["Chovy", "", "Gen.G", 1100, "2026", "M", ""],
  ],
  events: [
    ["MSI 2026", "msi-2026", "2026", "Mid-Season Invitational", "P", "2026-07-12", 71],
    ["RDAG 2022 West Asia", "", "2022", "", "S", "2022-05-01", 32],
  ],
  champs: [["Ahri", "", 14477]],
  leagues: [],
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
});
