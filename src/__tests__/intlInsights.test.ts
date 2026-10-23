import { describe, it, expect } from "vitest";
import { cinderella, comebacks, finals, finalsRecords, hosts, playerTitles, runs, swissRuns, upsets, yearLines, type FileRef } from "../hub/intlInsights";
import type { EventLines } from "../hub/worldsFacts";

// A made-up event: Swiss rounds for A (L L W W W), B and C, then a final A 3-1 B.
const S = (slug: string, stage: string, date: string, a: string, b: string, wa: number, wb: number, bo = 1): EventLines["s"][number] =>
  [slug, stage, date, a.toUpperCase(), a, a.toUpperCase(), b.toUpperCase(), b, b.toUpperCase(), wa, wb, bo];
const lines: EventLines = {
  s: [
    S("r1", "Round 1", "2025-10-01", "a", "b", 0, 1),
    S("r2", "Round 2", "2025-10-02", "a", "c", 0, 1),
    S("r3", "Round 3", "2025-10-03", "a", "c", 2, 0, 3),
    S("r4", "Round 4", "2025-10-04", "a", "d", 2, 1, 3),
    S("r5", "Round 5", "2025-10-05", "a", "e", 2, 0, 3),
    S("f", "Finals", "2025-11-01", "a", "b", 3, 1, 5),
  ],
  g: [
    // series, game, a on blue, winner, minutes, towers, kills, gold, a's chance, a's lead at 15
    [0, 1, 1, 2, 30, 2, 9, 10, 20, 50000, 60000, 80, 3000],
    [1, 1, 0, 2, 32, 3, 8, 12, 15, 52000, 61000, 60, 1000],
    [5, 1, 1, 1, 28, 9, 2, 18, 5, 60000, 45000, 30, -4500],
  ],
  p: [
    [2, 0, "Ace", "ace", "Mid", "Ahri", 5, 1, 8, 300, 20000],
    [2, 1, "Bee", "bee", "Mid", "Azir", 1, 4, 2, 280, 15000],
  ],
  rg: { a: "KR", b: "CN", c: "EU", d: "NA", e: "LMS" },
  pl: { a: "1", b: "2", c: "3-4" },
  host: "China",
};
const ref: FileRef = { f: lines, year: "Worlds 2025", stage: "worlds-2025-main-event" };

describe("international insights", () => {
  it("Swiss paths: A escaped from 0-2", () => {
    const a = swissRuns([ref]).find((r) => r.u === "a")!;
    expect(a.path).toBe("LLWWW");
    expect([a.wins, a.losses]).toEqual([3, 2]);
  });
  it("upsets: the winner given the smallest chance comes first", () => {
    const u = upsets([ref]).games;
    expect(u[0]).toMatchObject({ winner: "B", chance: 20 });
    expect(u.map((x) => x.chance)).toEqual([20, 30, 40]);
  });
  it("comebacks: A won the final from 4.5k behind at 15", () => {
    expect(comebacks([ref])[0]).toMatchObject({ winner: "A", behind: 4500 });
  });
  it("finals, players' titles, hosts", () => {
    const f = finals([ref]);
    expect(f[0]).toMatchObject({ winner: "A", loser: "B", score: "3-1" });
    expect(finalsRecords(f).mostReached[0]).toMatchObject({ u: "a", n: 1, won: 1 });
    expect(playerTitles([ref])[0]).toMatchObject({ name: "Ace", titles: ["Worlds 2025"] });
    expect(hosts([ref])[0]).toMatchObject({ country: "China", region: "CN", best: 2 });
  });
  it("year lines and runs", () => {
    const y = yearLines([ref])[0];
    expect(y.games).toBe(3);
    expect(y.blue).toBe(67); // blue won games 2 and 3
    const rs = runs([ref]);
    expect(rs.find((r) => r.u === "a")).toMatchObject({ place: "1", debut: true });
    expect(cinderella(rs).debuts[0].u).toBe("a");
  });
});
