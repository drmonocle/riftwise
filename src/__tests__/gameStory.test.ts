import { describe, it, expect } from "vitest";
import { gameStory } from "../gameStory";
import type { TimelinePoint, TeamSnap } from "../liveGame";

const s = (k: number, tw: number, b = 0, inh = 0, d = 0): TeamSnap => ({ k, tw, b, inh, d });
// T1 on blue (left) falls 4k behind, takes Baron at 26 and wins; leads are blue minus red
const comeback: TimelinePoint[] = [
  { t: 2, lead: 0, blue: s(0, 0), red: s(0, 0) },
  { t: 5, lead: -300, blue: s(0, 0), red: s(1, 0) },
  { t: 10, lead: -1200, blue: s(1, 0), red: s(3, 0) },
  { t: 14, lead: -2500, blue: s(2, 0), red: s(5, 1) },
  { t: 20, lead: -4100, blue: s(3, 1), red: s(8, 3) },
  { t: 25, lead: -3000, blue: s(6, 2), red: s(9, 4) },
  { t: 26, lead: -2000, blue: s(8, 2, 1), red: s(9, 4) },
  { t: 28, lead: 1500, blue: s(12, 5, 1), red: s(9, 4) },
  { t: 31, lead: 5200, blue: s(16, 9, 1, 2), red: s(10, 4) },
];

describe("game story", () => {
  it("tells first blood, first tower, the biggest lead, the Baron turn and the comeback", () => {
    const text = gameStory(comeback, "T1", "GEN", true).join(" ");
    expect(text).toContain("GEN drew first blood (by minute 5).");
    expect(text).toContain("GEN took the first tower (by minute 14).");
    expect(text).not.toContain("biggest lead"); // the comeback sentence says it
    expect(text).toContain("The Baron by minute 26 turned it: T1 went from −3.0k to +5.2k gold.");
    expect(text).toContain("T1 came back from 4.1k gold behind (minute 20) to win.");
  });

  it("tells a win from start to finish with its biggest lead", () => {
    // ahead all game, and ahead in towers and inhibitors at the end
    const wire = comeback.map((p) => ({ ...p, lead: Math.abs(p.lead) + 100 }));
    const text = gameStory(wire, "T1", "GEN", true).join(" ");
    expect(text).toContain("T1's biggest lead: 5.3k gold at minute 31.");
    expect(text).toContain("T1 led from the start and never gave it back.");
  });

  it("sees the sides the right way round when the left team plays red", () => {
    const text = gameStory(comeback, "GEN", "T1", false).join(" ");
    expect(text).toContain("T1 came back from 4.1k gold behind");
    expect(text).toContain("GEN drew first blood");
  });

  it("names no winner when gold, towers and inhibitors at the end disagree (a base race)", () => {
    const race = [...comeback.slice(0, -1), { t: 31, lead: -800, blue: s(14, 8, 1, 2), red: s(12, 4) }];
    const text = gameStory(race, "T1", "GEN", true).join(" ");
    expect(text).not.toMatch(/to win|for good|never gave it back/);
  });

  it("says nothing for a game with too few frames", () => {
    expect(gameStory(comeback.slice(0, 3), "T1", "GEN", true)).toEqual([]);
  });
});
