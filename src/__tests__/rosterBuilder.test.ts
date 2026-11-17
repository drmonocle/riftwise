import { describe, it, expect } from "vitest";
import {
  computeRosterDelta,
  computeRosterEconomy,
  computeRosterFlexes,
  computeRosterSynergy,
  ROSTER_ROLES,
  teamLineupForPeriod,
} from "../components/hub/RosterBuilderPage";
import { itemPatchBreakdown } from "../components/hub/ItemsPage";
import type { HubTeam, PlayerGameRow } from "../hub/types";

const makeRow = (series: string, gn: number, team: string, won: number, champ = "Azir", role = "Mid", patch = "26.18"): PlayerGameRow => [
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
  patch,
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

  it("resolves season-specific lineups and computes role upgrade/downgrade/sidegrade deltas", () => {
    const fakeTeam = {
      name: "T1",
      u: "t1",
      starters: [
        ["Doran", "doran", "Top"],
        ["Oner", "oner", "Jungle"],
        ["Faker", "faker", "Mid"],
        ["Peyz", "peyz", "Bot"],
        ["Keria", "keria", "Support"],
      ],
      roster: [
        {
          y: "2025",
          p: [
            { n: "Doran", u: "doran", g: 90, r: "Top" },
            { n: "Oner", u: "oner", g: 90, r: "Jungle" },
            { n: "Faker", u: "faker", g: 90, r: "Mid" },
            { n: "Gumayusi", u: "gumayusi", g: 85, r: "Bot" },
            { n: "Smash", u: "smash", g: 5, r: "Bot" },
            { n: "Keria", u: "keria", g: 90, r: "Support" },
          ],
        },
      ],
    } as unknown as HubTeam;

    expect(teamLineupForPeriod(fakeTeam, "y2025")).toEqual({
      Top: "doran",
      Jungle: "oner",
      Mid: "faker",
      Bot: "gumayusi",
      Support: "keria",
    });

    const delta = computeRosterDelta(
      {
        Top: { role: "Top", slug: "zeus", name: "Zeus", games: 30, rating: 7.4, kda: 4.5, dpm: 620, goldShare: 21.5, gd15: 340 },
        Jungle: { role: "Jungle", slug: "oner", name: "Oner", games: 30, rating: 7.0, kda: 5.0, dpm: 380, goldShare: 18.0, gd15: 120 },
        Mid: { role: "Mid", slug: "faker", name: "Faker", games: 30, rating: 7.1, kda: 5.2, dpm: 650, goldShare: 23.0, gd15: 150 },
        Bot: { role: "Bot", slug: "peyz", name: "Peyz", games: 30, rating: 6.5, kda: 5.8, dpm: 720, goldShare: 25.0, gd15: 80 },
        Support: { role: "Support", slug: "keria", name: "Keria", games: 30, rating: 7.1, kda: 5.4, dpm: 250, goldShare: 12.5, gd15: 60 },
      },
      {
        Top: { role: "Top", slug: "doran", name: "Doran", games: 30, rating: 6.8, kda: 3.8, dpm: 560, goldShare: 20.5, gd15: 140 },
        Jungle: { role: "Jungle", slug: "oner", name: "Oner", games: 30, rating: 7.0, kda: 5.0, dpm: 380, goldShare: 18.0, gd15: 120 },
        Mid: { role: "Mid", slug: "faker", name: "Faker", games: 30, rating: 7.0, kda: 4.9, dpm: 630, goldShare: 22.8, gd15: 100 },
        Bot: { role: "Bot", slug: "gumayusi", name: "Gumayusi", games: 30, rating: 7.1, kda: 6.5, dpm: 760, goldShare: 25.2, gd15: 200 },
        Support: { role: "Support", slug: "keria", name: "Keria", games: 30, rating: 6.9, kda: 5.1, dpm: 240, goldShare: 12.5, gd15: 40 },
      },
      false,
    );

    expect(delta.comparedRoles).toBe(5);
    expect(delta.upgrades).toBe(1); // Top +0.6
    expect(delta.downgrades).toBe(1); // Bot -0.6
    expect(delta.sidegrades).toBe(3); // Jungle 0.0, Mid +0.1, Support +0.2 across seasons
    expect(delta.rows.find((r) => r.role === "Top")?.dGd15).toBe(200);
    expect(delta.netRatingDelta).toBe(0.1);
    expect(delta.netGd15Delta).toBe(150);

    const sameSeasonDelta = computeRosterDelta(
      { Jungle: { role: "Jungle", slug: "oner", name: "Oner", games: 30, rating: 7.0, kda: 5.0, dpm: 380, goldShare: 18.0, gd15: 120 } },
      { Jungle: { role: "Jungle", slug: "oner", name: "Oner", games: 30, rating: 7.0, kda: 5.0, dpm: 380, goldShare: 18.0, gd15: 120 } },
      true,
    );
    expect(sameSeasonDelta.rows.find((r) => r.role === "Jungle")?.verdict).toBe("unchanged");
  });

  it("groups item history rows numerically by patch descending with win rates", () => {
    const rows = [
      makeRow("s1", 1, "T1", 1, "Azir", "Mid", "26.8"),
      makeRow("s2", 1, "T1", 0, "Azir", "Mid", "26.8"),
      makeRow("s3", 1, "T1", 1, "Azir", "Mid", "26.18"),
      makeRow("s4", 1, "T1", 1, "Azir", "Mid", "26.18"),
      makeRow("s5", 1, "T1", 0, "Azir", "Mid", "25.20"),
      makeRow("s6", 1, "T1", 1, "Azir", "Mid", ""),
    ];
    const patches = itemPatchBreakdown(rows);
    expect(patches.map((p) => p.patch)).toEqual(["26.18", "26.8", "25.20"]);
    expect(patches[0]).toEqual({ patch: "26.18", games: 2, wins: 2, winPct: 100 });
    expect(patches[1]).toEqual({ patch: "26.8", games: 2, wins: 1, winPct: 50 });
  });
});
