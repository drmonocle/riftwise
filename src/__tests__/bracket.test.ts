import { describe, it, expect } from "vitest";
import { detectBracket, realOfStages, runBracket, simulateBracket } from "../hub/bracket";
import { favourites, type WTeam } from "../hub/worlds";
import events from "./fixtures/intl_brackets.json";

// Real MSI 2023-2026 and First Stand 2025-2026 stages (the stats files, 2026-10-21): the brackets must replay exactly.
type Ev = { winner: string | null; stages: { name: string; series: { au: string; bu: string; w: number; bo: number; sa: number; sb: number; date: string }[] }[] };
const all = events as unknown as Record<string, Ev>;
const teamsOf = (e: Ev): WTeam[] =>
  [...new Set(e.stages.flatMap((s) => s.series.flatMap((x) => [x.au, x.bu])).filter(Boolean))].map((u, i) => ({ u, n: u, c: u, r: 1800 - i * 10, league: "" }));

describe("MSI double elimination", () => {
  for (const name of ["msi-2023", "msi-2024", "msi-2025", "msi-2026"]) {
    it(`${name} replays from the real results to the real winner`, () => {
      const e = all[name];
      const br = detectBracket("msi", e.stages);
      expect(br).not.toBeNull();
      const r = runBracket(br!, teamsOf(e), realOfStages(e.stages, "msi"), {});
      expect(r.matches).toHaveLength(14);
      expect(r.matches.every((m) => m.from === "real")).toBe(true);
      expect(r.champion).toBe(e.winner);
    });
  }
});

describe("First Stand groups and knockouts", () => {
  it("2026 replays to the real winner", () => {
    const e = all["first-stand-2026"];
    const br = detectBracket("first-stand", e.stages);
    expect(br).not.toBeNull();
    const r = runBracket(br!, teamsOf(e), realOfStages(e.stages, "first-stand"), {});
    expect(r.matches).toHaveLength(13);
    expect(r.matches.every((m) => m.from === "real")).toBe(true);
    expect(r.champion).toBe(e.winner);
  });

  it("2025 (a round robin) isn't taken for this format", () => {
    expect(detectBracket("first-stand", all["first-stand-2025"].stages)).toBeNull();
  });

  it("an unplayed bracket fills and simulates", () => {
    const e = all["first-stand-2026"];
    const br = detectBracket("first-stand", e.stages)!;
    const teams = teamsOf(e);
    const r = runBracket(br, teams, [], {}, undefined, favourites);
    expect(r.matches).toHaveLength(13);
    expect(r.champion).toBe(teams[0].u);
    const odds = simulateBracket(br, teams, [], undefined, 300);
    const total = (k: number) => Object.values(odds).reduce((a, v) => a + v[k], 0);
    expect(total(0)).toBeCloseTo(4); // semifinalists
    expect(total(2)).toBeCloseTo(1); // one champion
  });
});
