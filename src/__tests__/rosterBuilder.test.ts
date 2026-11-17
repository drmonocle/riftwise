import { describe, it, expect } from "vitest";
import { computeRosterEconomy, computeRosterFlexes, computeRosterSynergy, ROSTER_ROLES } from "../components/hub/RosterBuilderPage";
import type { PlayerGameRow } from "../hub/types";

const makeRow = (series: string, gn: number, team: string, won: number, champ = "Azir", role = "Mid"): PlayerGameRow => [
  "2026-10-15 12:00:00",
  series,
  champ,
  4,
  1,
  6,
  won,
  team,
  "Enemy",
  "LCK",
  role,
  "lck",
  280,
  13000,
  24000,
  35,
  30,
  15,
  75000,
  55000,
  180,
  null,
  gn,
  7.2,
  "26.18",
];

describe("RosterBuilderPage helpers", () => {
  it("computes composite rating, grade, and balanced vs greedy vs low-econ gold share", () => {
    expect(ROSTER_ROLES).toEqual(["Top", "Jungle", "Mid", "Bot", "Support"]);
    const balanced = computeRosterEconomy([
      { role: "Top", games: 20, rating: 7.4, goldShare: 21.0, dmgShare: 22.0, gd15: 320 },
      { role: "Jungle", games: 20, rating: 7.1, goldShare: 18.0, dmgShare: 14.0, gd15: 180 },
      { role: "Mid", games: 20, rating: 7.5, goldShare: 23.0, dmgShare: 28.0, gd15: 400 },
      { role: "Bot", games: 20, rating: 7.2, goldShare: 25.0, dmgShare: 29.0, gd15: 250 },
      { role: "Support", games: 20, rating: 7.0, goldShare: 13.0, dmgShare: 7.0, gd15: 50 },
    ]);
    expect(balanced.avgRating).toBe(7.2);
    expect(balanced.grade).toBe("S");
    expect(balanced.totalGoldShare).toBe(100);
    expect(balanced.totalDmgShare).toBe(100);
    expect(balanced.sumGd15).toBe(1200);
    expect(balanced.economyStatus).toBe("balanced");

    const greedy = computeRosterEconomy([
      { role: "Top", games: 20, rating: 6.8, goldShare: 23.0, dmgShare: 24.0, gd15: 100 },
      { role: "Jungle", games: 20, rating: 6.7, goldShare: 20.0, dmgShare: 18.0, gd15: 50 },
      { role: "Mid", games: 20, rating: 6.9, goldShare: 24.0, dmgShare: 27.0, gd15: 120 },
      { role: "Bot", games: 20, rating: 6.6, goldShare: 26.0, dmgShare: 28.0, gd15: 80 },
      { role: "Support", games: 20, rating: 6.5, goldShare: 13.5, dmgShare: 7.0, gd15: -20 },
    ]);
    expect(greedy.economyStatus).toBe("greedy");
    expect(greedy.grade).toBe("A");

    const lowEcon = computeRosterEconomy([
      { role: "Top", games: 10, rating: 5.8, goldShare: 19.0, dmgShare: 19.0, gd15: -100 },
      { role: "Jungle", games: 10, rating: 5.8, goldShare: 17.0, dmgShare: 14.0, gd15: -50 },
      { role: "Mid", games: 10, rating: 5.8, goldShare: 21.0, dmgShare: 25.0, gd15: 0 },
      { role: "Bot", games: 10, rating: 5.8, goldShare: 23.0, dmgShare: 27.0, gd15: -50 },
      { role: "Support", games: 10, rating: 5.8, goldShare: 12.0, dmgShare: 6.0, gd15: 0 },
    ]);
    expect(lowEcon.economyStatus).toBe("low-econ");
    expect(lowEcon.grade).toBe("C");

    const incomplete = computeRosterEconomy([{ role: "Mid", games: 10, rating: 7.0, goldShare: 23.0, dmgShare: 27.0, gd15: 100 }]);
    expect(incomplete.economyStatus).toBe("incomplete");
  });

  it("flags Bo5 Fearless shallow pools (<5 picks with 2+ games) and ranks multi-role flexes", () => {
    const res = computeRosterFlexes([
      {
        slug: "zeus",
        name: "Zeus",
        role: "Top",
        champs: [
          { champ: "Jayce", games: 6, wins: 5 },
          { champ: "Yone", games: 4, wins: 3 },
          { champ: "Rumble", games: 3, wins: 2 },
        ],
      },
      {
        slug: "faker",
        name: "Faker",
        role: "Mid",
        champs: [
          { champ: "Azir", games: 10, wins: 8 },
          { champ: "Yone", games: 5, wins: 4 },
          { champ: "Sylas", games: 4, wins: 3 },
          { champ: "Ahri", games: 3, wins: 2 },
          { champ: "Orianna", games: 3, wins: 2 },
        ],
      },
    ]);
    expect(res.shallowPools).toEqual([{ slug: "zeus", name: "Zeus", role: "Top", usableCount: 3 }]);
    expect(res.flexPicks).toHaveLength(1);
    expect(res.flexPicks[0].champ).toBe("Yone");
    expect(res.flexPicks[0].totalGames).toBe(9);
  });

  it("matches historical teammate chemistry on the same series game and team", () => {
    const pairs = computeRosterSynergy([
      {
        slug: "oner",
        name: "Oner",
        role: "Jungle",
        games: [makeRow("t1-vs-geng-1", 1, "T1", 1), makeRow("t1-vs-geng-1", 2, "T1", 0), makeRow("t1-vs-kt-1", 1, "T1", 1)],
      },
      {
        slug: "faker",
        name: "Faker",
        role: "Mid",
        games: [makeRow("t1-vs-geng-1", 1, "T1", 1), makeRow("t1-vs-geng-1", 2, "T1", 0)],
      },
      {
        slug: "chovy",
        name: "Chovy",
        role: "Mid",
        games: [makeRow("t1-vs-geng-1", 1, "Gen.G", 0)],
      },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ games: 2, wins: 1, winPct: 50 });
  });
});
