import { describe, it, expect } from "vitest";
import { applyResults } from "../hub/liveRatings";
import type { HubRatings, RatingRow } from "../hub/types";

const row = (u: string, r: number, league: string): RatingRow => [u, u.toUpperCase(), u.toUpperCase(), league, null, r, 0, 100, "2026-10-22", 1];
const base: HubRatings = {
  asof: "2026-10-22",
  games: 1000,
  teams: [row("geng", 1950, "LCK"), row("ig", 1700, "LPL"), row("t1", 1815, "LCK")],
  leagues: [],
  adjust: { intl: 0.9, other: 1, series: {} },
  rated: ["2026-10-22|geng|t1"],
  k: { top: 38.4, intl: 61.4 },
  test: { from: "2024", all: { n: 0 }, intl: { n: 0 }, settled: { n: 0 }, calibration: [] },
} as unknown as HubRatings;

describe("live power ratings", () => {
  it("an upset moves both teams and re-sorts the list", () => {
    const r = applyResults(base, [{ date: "2026-10-23", a: "ig", b: "geng", wa: 1, wb: 0, intl: true }]);
    const ig = r.teams.find((t) => t[0] === "ig")!;
    const gen = r.teams.find((t) => t[0] === "geng")!;
    expect(ig[5]).toBeGreaterThan(1700);
    expect(gen[5]).toBeLessThan(1950);
    expect(ig[5] - 1700).toBe(1950 - gen[5]);
    expect(r.live).toEqual({ series: 1, games: 1 });
    expect(r.teams.map((t) => t[5])).toEqual([...r.teams.map((t) => t[5])].sort((a, b) => b - a));
  });
  it("skips results the build already rated (a day either side) and old builds", () => {
    expect(applyResults(base, [{ date: "2026-10-23", a: "t1", b: "geng", wa: 1, wb: 0, intl: false }])).toBe(base);
    expect(applyResults({ ...base, rated: undefined }, [{ date: "2026-10-23", a: "ig", b: "geng", wa: 1, wb: 0, intl: true }]).live).toBeUndefined();
  });
});
