import { describe, expect, it } from "vitest";
import { bracketEdges, type BracketColumn } from "../components/BracketBoard";

const col = (key: string, items: [string, string, string?][]): BracketColumn => ({
  key,
  title: key,
  items: items.map(([a, b, w], i) => ({ key: `${key}${i}`, teams: [a, b], winner: w ?? null, node: null })),
});

describe("bracket lines", () => {
  it("joins each match to where its winner plays next, highlighted", () => {
    const edges = bracketEdges([
      col("QF", [["GEN", "HLE", "GEN"], ["KT", "CFO", "KT"], ["G2", "TES", "TES"], ["AL", "T1", "T1"]]),
      col("SF", [["GEN", "KT", "KT"], ["T1", "TES", "T1"]]),
      col("F", [["T1", "KT"]]),
    ]);
    expect(edges).toEqual([
      { from: "0:0", to: "1:0", on: true },
      { from: "0:1", to: "1:0", on: true },
      { from: "0:2", to: "1:1", on: true },
      { from: "0:3", to: "1:1", on: true },
      { from: "1:0", to: "2:0", on: true },
      { from: "1:1", to: "2:0", on: true },
    ]);
  });

  it("hidden or unplayed results: by the teams shown, else by halving, never highlighted", () => {
    const edges = bracketEdges([
      col("SF", [["A", "B"], ["C", "D"]]),
      col("F", [["TBD", "TBD"]]),
    ]);
    expect(edges).toEqual([
      { from: "0:0", to: "1:0", on: false },
      { from: "0:1", to: "1:0", on: false },
    ]);
  });

  it("double elimination: an upper-bracket winner gets no line into the lower bracket; the last match feeds the final", () => {
    const edges = bracketEdges([
      col("UB final", [["KC", "MVK", "KC"]]),
      col("LB semi", [["FUR", "C9", "FUR"]]),
      col("LB final", [["MVK", "FUR"]]),
      col("Final", [["TBD", "KC"]]),
    ]);
    expect(edges).toEqual([
      { from: "1:0", to: "2:0", on: true },
      { from: "2:0", to: "3:0", on: false },
    ]);
  });
});
