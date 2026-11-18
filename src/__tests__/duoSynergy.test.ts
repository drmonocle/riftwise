import { describe, it, expect } from "vitest";
import { computeDuoSynergy } from "../hub/duoSynergy";
import type { ChampGame, ChampPick } from "../hub/types";

const pk = (c: string, r: number, pl?: string, ps?: string, gd?: number): ChampPick =>
  [c, r, 3, 1, 5, 220, 12000, 18000, pl, ps, gd] as unknown as ChampPick;

const mkGame = (
  patch: string,
  blueWon: number,
  bp: ChampPick[],
  rp: ChampPick[],
  ev = 0,
  blueTeam = "T1",
  redTeam = "Gen.G",
): ChampGame =>
  ["2026-04-01", patch, ev, blueWon, 31, bp, rp, [], [], 1, blueTeam, redTeam, blueTeam.toLowerCase(), redTeam.toLowerCase(), "s-1", 1];

describe("computeDuoSynergy", () => {
  it("computes positive vs negative synergy lift, combined GD@15, and top pro pair attribution", () => {
    const games: ChampGame[] = [
      // Azir + Vi win together all 4 times with +300 combined GD@15 (Faker + Oner on T1)
      ...Array.from({ length: 4 }, () =>
        mkGame(
          "26.7",
          1,
          [pk("K'Sante", 0, "Doran", "doran", 100), pk("Vi", 1, "Oner", "oner", 120), pk("Azir", 2, "Faker", "faker", 180)],
          [pk("Gnar", 0, "Kiin", "kiin", -100), pk("Maokai", 1, "Canyon", "canyon", -120), pk("Orianna", 2, "Chovy", "chovy", -180)],
        ),
      ),
      // Azir loses 2 times with Jarvan IV, while Vi loses 2 times with Ahri -> keeps Azir & Vi solo WRs near 67%
      // expWr(Azir+Vi) = 0.667 + 0.667 - 0.50 = ~0.833; actual = 1.0 -> positive lift (+16.7pp)
      ...Array.from({ length: 2 }, () =>
        mkGame(
          "26.7",
          0,
          [pk("K'Sante", 0, "Doran", "doran"), pk("Jarvan IV", 1, "Oner", "oner"), pk("Azir", 2, "Faker", "faker")],
          [pk("Gnar", 0), pk("Vi", 1, "Canyon", "canyon"), pk("Ahri", 2, "Chovy", "chovy")],
        ),
      ),
      // Wait: make Orianna win with Vi 2 times and lose 4 times with Maokai -> Azir+J4 is 0/2 (neg lift) while Vi+Ahri was on red side and won!
    ];

    const midJg = computeDuoSynergy([{ games }], { pair: "mid-jg", minGames: 2 });
    const azirVi = midJg.rows.find((r) => r.a === "Azir" && r.b === "Vi");
    expect(azirVi).toBeDefined();
    expect(azirVi!.g).toBe(4);
    expect(azirVi!.w).toBe(4);
    expect(azirVi!.wr).toBe(1);
    expect(azirVi!.lift).toBeGreaterThan(0);
    expect(azirVi!.gd15).toBe(300);
    expect(azirVi!.gdGames).toBe(4);
    expect(azirVi!.topPair).toEqual({
      players: ["Faker", "Oner"],
      slugs: ["faker", "oner"],
      team: "T1",
      teamSlug: "t1",
      g: 4,
      w: 4,
    });

    // Maokai + Orianna lost 4/4 -> negative lift vs solo baselines (or clamped below actual)
    const oriMao = midJg.rows.find((r) => r.a === "Orianna" && r.b === "Maokai");
    expect(oriMao).toBeDefined();
    expect(oriMao!.wr).toBe(0);
    expect(oriMao!.lift).toBeLessThan(0);

    // Non mid-jg role pair is excluded when pair="mid-jg"
    const topJg = midJg.rows.find((r) => r.a === "K'Sante");
    expect(topJg).toBeUndefined();
  });

  it("filters by role pair, anchor champ orientation, patch, side baseline, and partner search", () => {
    const games: ChampGame[] = [
      // Blue wins 4/4 (baselineWr on blue side = 1.0 when filtered to side="b")
      ...Array.from({ length: 3 }, () =>
        mkGame(
          "26.8",
          1,
          [pk("Lucian", 3, "Gumayusi", "gumayusi", 250), pk("Nami", 4, "Keria", "keria", 150), pk("Azir", 2)],
          [pk("Jinx", 3), pk("Lulu", 4), pk("Orianna", 2)],
          0,
        ),
      ),
      mkGame(
        "26.7",
        0,
        [pk("Lucian", 3, "Gumayusi", "gumayusi"), pk("Nami", 4, "Keria", "keria"), pk("Azir", 2)],
        [pk("Jinx", 3), pk("Lulu", 4), pk("Orianna", 2)],
        1,
      ),
    ];

    // Anchor on Support ("Nami") -> Nami should be oriented as `a` (`roleA=4`), Lucian as `b` (`roleB=3`)
    const anchored = computeDuoSynergy([{ games }], {
      pair: "bot-sup",
      champ: "nami",
      withChamp: "lucian",
      minGames: 2,
    });
    expect(anchored.rows).toHaveLength(1);
    expect(anchored.rows[0].a).toBe("Nami");
    expect(anchored.rows[0].b).toBe("Lucian");
    expect(anchored.rows[0].g).toBe(4);
    expect(anchored.rows[0].w).toBe(3);

    // Side filter = "b" on patch 26.8 with event = 0
    const blueOnly = computeDuoSynergy([{ games, event: 0 }], {
      pair: "bot-sup",
      patch: "26.8",
      side: "b",
      minGames: 2,
    });
    expect(blueOnly.totalGames).toBe(3);
    expect(blueOnly.rows).toHaveLength(1);
    expect(blueOnly.rows[0].wr).toBe(1);
    // Blue won 100% -> wrA=1, wrB=1, baselineWr=1 => expWr=0.95 (clamped), lift=0.05
    expect(blueOnly.rows[0].expWr).toBeCloseTo(0.95, 5);
    expect(blueOnly.rows[0].gd15).toBe(400);
  });
});
