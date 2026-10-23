import { describe, it, expect } from "vitest";
import { favourites, matchKey, quarterPairs, rng, roller, runKnockout, runSwiss, simulate, type RealSeries, type WTeam } from "../hub/worlds";

const teams: WTeam[] = Array.from({ length: 16 }, (_, i) => ({ u: `t${i}`, n: `Team ${i}`, c: `T${i}`, r: 1900 - i * 20, league: ["LCK", "LPL", "LEC", "LCS"][i % 4] }));
const round1: RealSeries[] = Array.from({ length: 8 }, (_, i) => ({ round: 1, a: `t${i}`, b: `t${15 - i}`, bo: 1, w: 0 }));

describe("Swiss stage", () => {
  it("plays out to 8 through and 8 out, with no rematches and best of 3 only on 2 wins or 2 losses", () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = runSwiss(teams, round1, {}, seed, undefined, roller(rng(seed * 7)));
      expect(s.done).toBe(true);
      expect(Object.values(s.rec).filter(([w]) => w === 3)).toHaveLength(8);
      expect(Object.values(s.rec).filter(([, l]) => l === 3)).toHaveLength(8);
      const pairs = s.rounds.flat().map((m) => [m.a, m.b].sort().join("|"));
      expect(new Set(pairs).size).toBe(pairs.length);
      // a match decides going through or out exactly when it's best of 3 (both teams have the same record)
      const rec: Record<string, [number, number]> = Object.fromEntries(teams.map((t) => [t.u, [0, 0]]));
      for (const r of s.rounds) {
        for (const m of r) {
          expect(rec[m.a]).toEqual(rec[m.b]);
          expect(m.bo).toBe(rec[m.a][0] === 2 || rec[m.a][1] === 2 ? 3 : 1);
        }
        for (const m of r) {
          const [w, l] = m.w === 1 ? [m.a, m.b] : [m.b, m.a];
          rec[w][0]++;
          rec[l][1]++;
        }
      }
      expect(s.rounds.length).toBe(5);
    }
  });

  it("keeps played results and picks, and waits to draw a round until the one before is decided", () => {
    const real = round1.map((s, i) => (i < 4 ? { ...s, w: 2 } : s));
    const s = runSwiss(teams, real, { [matchKey(1, "t4", "t11")]: "t11" }, 3);
    expect(s.rounds[0].filter((m) => m.from === "real")).toHaveLength(4);
    expect(s.rounds[0].find((m) => m.a === "t4")?.w).toBe(2);
    expect(s.waiting).toBe(2);
    expect(s.rounds).toHaveLength(1);
  });

  it("the favourite fill sends the best-rated teams through", () => {
    const s = runSwiss(teams, round1, {}, 5, undefined, favourites);
    expect(s.rec.t0).toEqual([3, 0]);
    expect(s.rec.t15[0]).toBeLessThan(3);
  });
});

describe("knockouts", () => {
  it("3-0 teams meet 3-2 teams, in opposite halves", () => {
    const s = runSwiss(teams, round1, {}, 11, undefined, roller(rng(4)));
    const pairs = quarterPairs(s.rec, 9);
    expect(pairs).toHaveLength(4);
    const r = (u: string) => s.rec[u][1];
    expect([r(pairs[0][0]), r(pairs[0][1])]).toEqual([0, 2]);
    expect([r(pairs[2][0]), r(pairs[2][1])]).toEqual([0, 2]);
    const k = runKnockout(teams, pairs, [], {}, undefined, favourites);
    expect(k.sf).toHaveLength(2);
    expect(k.champion).toBeTruthy();
  });

  it("simulated chances add up", () => {
    const o = simulate(teams, round1, [], undefined, 400);
    const sum = (k: "adv" | "win" | "final" | "sf") => Object.values(o).reduce((a, x) => a + x[k], 0);
    expect(sum("adv")).toBeCloseTo(8);
    expect(sum("sf")).toBeCloseTo(4);
    expect(sum("final")).toBeCloseTo(2);
    expect(sum("win")).toBeCloseTo(1);
    expect(o.t0.win).toBeGreaterThan(o.t15.win);
  });
});

describe("Riot's live schedule", () => {
  it("locks results before the stats have them and adds Riot's next-round draw", async () => {
    const { withLive } = await import("../hub/worlds");
    const live = [
      { a: "t15", b: "t0", w: 1, sa: 1, sb: 0, bo: 1, block: "Swiss", date: "2026-10-23 17:00" }, // upset, sides flipped
      { a: "t1", b: "t3", w: 0, bo: 1, block: "Swiss", date: "2026-10-24 17:00" }, // made-up round 2 pairing
    ];
    const real = withLive(round1, live);
    const r1 = real.find((s) => s.a === "t0");
    expect(r1?.w).toBe(2); // t15 won: b in the stats' order
    expect(r1?.sb).toBe(1);
    expect(real.find((s) => s.a === "t1" && s.b === "t3")?.round).toBe(2);
    const s = runSwiss(teams, real, {}, 1);
    expect(s.rounds[0].find((m) => m.a === "t0")?.from).toBe("real");
  });
});
