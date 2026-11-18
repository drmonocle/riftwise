import { describe, it, expect } from "vitest";
import { simulateInternationalField } from "../hub/intlSim";
import type { RatingRow } from "../hub/types";

function makeFixtureTeams(): RatingRow[] {
  const leagues: [string, string, string][] = [
    ["LoL Champions Korea", "lol-champions-korea", "LCK"],
    ["Tencent LoL Pro League", "tencent-lol-pro-league", "LPL"],
    ["LoL EMEA Championship", "lol-emea-championship", "LEC"],
    ["League of Legends Championship Series", "league-of-legends-championship-series", "LCS"],
    ["League of Legends Championship Pacific", "league-of-legends-championship-pacific", "LCP"],
    ["Circuit Brazilian League of Legends", "circuit-brazilian-league-of-legends", "CBLOL"],
  ];
  const rows: RatingRow[] = [];
  for (let li = 0; li < leagues.length; li++) {
    const [full, slug, code] = leagues[li];
    for (let rank = 1; rank <= 6; rank++) {
      const rating = li === 0 && rank === 1 ? 1850 : 1680 - li * 35 - (rank - 1) * 45;
      rows.push([
        `${code.toLowerCase()}-team-${rank}`,
        `${code} Team ${rank}`,
        `${code}${rank}`,
        full,
        slug,
        rating,
        0,
        40,
        "2026-10-01",
        1,
        code,
        null,
      ]);
    }
  }
  return rows;
}

describe("international qualification simulator", () => {
  const teams = makeFixtureTeams();

  it("projects 18 Worlds qualifiers with normalized Top-8, Finals, Title odds and 6 bubble teams", () => {
    const res = simulateInternationalField(teams, "worlds");
    expect(res.qualifiers).toHaveLength(18);
    expect(res.bubble).toHaveLength(6);
    const sumWin = res.qualifiers.reduce((s, q) => s + q.winProb, 0);
    const sumFin = res.qualifiers.reduce((s, q) => s + q.finProb, 0);
    const sumTop = res.qualifiers.reduce((s, q) => s + q.topProb, 0);
    expect(sumWin).toBeGreaterThan(0.99);
    expect(sumWin).toBeLessThan(1.01);
    expect(sumFin).toBeGreaterThan(1.98);
    expect(sumFin).toBeLessThan(2.02);
    expect(sumTop).toBeGreaterThan(7.95);
    expect(sumTop).toBeLessThan(8.05);
    expect(res.qualifiers[0].slug).toBe("lck-team-1");
    expect(res.qualifiers[0].winProb).toBeGreaterThan(0.35);
    // Determinism across repeated runs
    expect(simulateInternationalField(teams, "worlds")).toEqual(res);
  });

  it("projects 11 MSI qualifiers and 6 First Stand qualifiers cleanly", () => {
    const msi = simulateInternationalField(teams, "msi");
    expect(msi.qualifiers).toHaveLength(11);
    expect(msi.bubble).toHaveLength(6);
    expect(msi.qualifiers.reduce((s, q) => s + q.winProb, 0)).toBeCloseTo(1, 2);
    expect(msi.qualifiers.reduce((s, q) => s + q.topProb, 0)).toBeCloseTo(4, 1);

    const fs = simulateInternationalField(teams, "first-stand");
    expect(fs.qualifiers).toHaveLength(6);
    expect(fs.bubble).toHaveLength(6);
    expect(fs.qualifiers.reduce((s, q) => s + q.winProb, 0)).toBeCloseTo(1, 2);
    expect(fs.qualifiers.reduce((s, q) => s + q.topProb, 0)).toBeCloseTo(4, 1);
  });
});
