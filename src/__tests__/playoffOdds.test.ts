import { describe, expect, it } from "vitest";
import { playoffOdds } from "../hub/playoffOdds";
import type { HubEvent, HubRatings, RatingRow, SeriesRow } from "../hub/types";

// four teams of one second-tier league, a single round robin with the last round to play:
// after two rounds A 2-0, B 1-1, C 1-1, D 0-2
const series = (a: string, b: string, w: 0 | 1 | 2, sa: number | null = null, sb: number | null = null): SeriesRow => ({
  g: null, a: a.toUpperCase(), au: a, ac: null, b: b.toUpperCase(), bu: b, bc: null, sa, sb, bo: 3, date: "2026-10-20 18:00", w,
});
const rating = (u: string, r: number): RatingRow => [u, u.toUpperCase(), null, "Test League", null, r, 0, null, null, 0, "Test League"] as unknown as RatingRow;
const ratings = {
  asof: "2026-10-20", games: 0, teams: [rating("a", 1600), rating("b", 1550), rating("c", 1500), rating("d", 1400)],
  leagues: [], adjust: { intl: 1, other: 1, series: { "3": 0.9, "5": 0.8 } }, test: {},
} as unknown as HubRatings;

function event(): HubEvent {
  return {
    n: "Test League 2026", u: "test-2026", op: "x", end: "2026-11-30",
    standings: [{ name: "Standings", rows: [] }],
    stages: [
      { name: "Week 1", kind: "list", series: [series("a", "b", 1, 2, 0), series("c", "d", 1, 2, 1)] },
      { name: "Week 2", kind: "list", series: [series("a", "c", 1, 2, 1), series("b", "d", 1, 2, 0)] },
      { name: "Week 3", kind: "list", series: [series("a", "d", 0), series("b", "c", 0)] },
    ],
  } as unknown as HubEvent;
}

describe("playoffOdds", () => {
  it("plays the last round out from the series so far", () => {
    const o = playoffOdds(event(), ratings, "2026-10-24", 3000)!;
    expect(o).not.toBeNull();
    expect(o.open).toBe(2);
    expect(o.cuts).toEqual([2]);
    const by = Object.fromEntries(o.rows.map((r) => [r.u, r]));
    expect([by.a.sw, by.a.sl, by.d.sw, by.d.sl, by.a.gw, by.a.gl]).toEqual([2, 0, 0, 2, 4, 1]);
    const sum = (f: (r: (typeof o.rows)[number]) => number) => o.rows.reduce((t, r) => t + f(r), 0);
    expect(sum((r) => r.first)).toBeCloseTo(1, 6);
    expect(sum((r) => r.top[0])).toBeCloseTo(2, 6);
    // D can't catch the leaders; A can't drop out of the top two
    expect(by.d.first).toBe(0);
    expect(by.d.top[0]).toBe(0);
    expect(by.a.top[0]).toBe(1);
    expect(by.a.first).toBeGreaterThan(by.b.first);
  });
  it("is the same on every reload of the same day", () => {
    expect(playoffOdds(event(), ratings, "2026-10-24", 800)).toEqual(playoffOdds(event(), ratings, "2026-10-24", 800));
  });
  it("leaves the playoff bracket's placeholders out", () => {
    const ev = event();
    ev.stages!.push({ name: "Playoffs", kind: "bracket", series: [{ ...series("a", "b", 0), au: null, bu: null }] });
    expect(playoffOdds(ev, ratings, "2026-10-24", 200)).not.toBeNull();
  });
  it("leaves out what it can't play out", () => {
    const at = (f: (ev: HubEvent) => void) => {
      const ev = event();
      f(ev);
      return playoffOdds(ev, ratings, "2026-10-24", 200);
    };
    expect(at((ev) => (ev.end = "2026-10-01"))).toBeNull(); // finished
    expect(at((ev) => ev.standings!.push({ name: "Group B", rows: [] }))).toBeNull(); // groups
    expect(at((ev) => ev.stages!.push({ name: "Final", kind: "bracket", series: [series("a", "b", 1, 3, 0)] }))).toBeNull(); // playoffs on
    expect(at((ev) => (ev.stages![2].series[0].bu = null))).toBeNull(); // a team still to be decided
    expect(at((ev) => ev.stages![2].series.pop())).toBeNull(); // part of the schedule missing
    expect(at((ev) => ev.stages!.pop())).toBeNull(); // nothing left to play
  });
});
