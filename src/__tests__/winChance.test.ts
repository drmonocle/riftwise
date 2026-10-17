import { describe, expect, it } from "vitest";
import { chanceContext, gameChance, matchChance, seriesChance } from "../hub/winChance";

const adjust = { intl: 0.9, other: 1.175, series: { "3": 0.85, "5": 0.7 } };

describe("win chances", () => {
  it("one game: Elo on the published scale, scaled for other contexts", () => {
    expect(gameChance(1600, 1600)).toBeCloseTo(0.5);
    expect(gameChance(1800, 1400)).toBeCloseTo(10 / 11);
    expect(matchChance(1800, 1400, "top", adjust)).toBeCloseTo(gameChance(1800, 1400));
    expect(matchChance(1800, 1400, "intl", adjust)).toBeCloseTo(gameChance(1800, 1400, 0.9));
    expect(matchChance(1800, 1400, "intl", adjust)).toBeLessThan(matchChance(1800, 1400, "top", adjust));
  });

  it("contexts", () => {
    expect(chanceContext(true, true, "LCK", "LCK")).toBe("top");
    expect(chanceContext(true, true, "LCS", "CBLOL")).toBe("intl");
    expect(chanceContext(false, true, "LCK CL", "LCK")).toBe("other");
  });

  it("series: plain binomial without adjust, less certain with it", () => {
    expect(seriesChance(0.6, 3)).toBeCloseTo(0.648);
    expect(seriesChance(0.6, 5)).toBeCloseTo(0.68256);
    expect(seriesChance(0.6, 1, adjust)).toBeCloseTo(0.6);
    expect(seriesChance(0.6, 3, adjust)).toBeCloseTo(seriesChance(0.585, 3));
    expect(seriesChance(0.6, 5, adjust)).toBeCloseTo(seriesChance(0.57, 5));
    expect(seriesChance(0.5, 5, adjust)).toBeCloseTo(0.5);
    // the favourite's side is the mirror image
    expect(seriesChance(0.3, 5, adjust) + seriesChance(0.7, 5, adjust)).toBeCloseTo(1);
  });
});
