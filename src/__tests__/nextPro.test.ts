import { describe, it, expect } from "vitest";
import { formatCountdownText, formatKickoffDate, resolveNextProTarget } from "../components/NextProCountdown";
import type { Match } from "../types";

const baseMatch = (overrides: Partial<Match>): Match =>
  ({
    matchId: "m1",
    startTimeUtc: "2027-01-16T17:00:00Z",
    state: "unstarted",
    leagueName: "LCK",
    leagueSlug: "lck",
    blockName: "Week 1",
    team1Code: "T1",
    team1Name: "T1",
    team2Code: "GEN",
    team2Name: "Gen.G",
    team1Score: 0,
    team2Score: 0,
    bestOf: 3,
    ...overrides,
  }) as Match;

describe("NextProCountdown resolver", () => {
  const nowMs = Date.parse("2026-11-25T23:00:00Z");

  it("hides countdown while an official pro match is live", () => {
    const live = [baseMatch({ state: "inProgress" })];
    const sched = [baseMatch({ startTimeUtc: "2026-11-26T10:00:00Z" })];
    expect(resolveNextProTarget(sched, live, { d: "2027-01-15", n: "LEC 2027 Winter" }, nowMs)).toBeNull();
  });

  it("prefers earliest unstarted Riot schedule match over stats fallback", () => {
    const later = baseMatch({ matchId: "m2", startTimeUtc: "2026-11-28T12:00:00Z", team1Code: "BLG", team2Code: "TES" });
    const sooner = baseMatch({ matchId: "m1", startTimeUtc: "2026-11-26T08:00:00Z", team1Code: "T1", team2Code: "GEN" });
    const target = resolveNextProTarget([later, sooner], [], { d: "2027-01-15", n: "LEC 2027 Winter" }, nowMs);
    expect(target).not.toBeNull();
    expect(target?.source).toBe("schedule");
    expect(target?.exactTime).toBe(true);
    expect(target?.label).toBe("T1 vs GEN");
    expect(formatCountdownText(target!, nowMs, true)).toBe("9h 0m");
    expect(formatCountdownText(target!, nowMs, false)).toBe("Starts in 9h 0m 0s");
  });

  it("falls back to off-season date-only Primary tournament kickoff", () => {
    const target = resolveNextProTarget(
      [],
      [],
      { d: "2027-01-15", n: "LEC 2027 Winter", l: "LoL EMEA Championship", lu: "lol-emea-championship", u: null },
      Date.UTC(2026, 10, 25, 12, 0, 0),
    );
    expect(target).not.toBeNull();
    expect(target?.source).toBe("nextPro");
    expect(target?.exactTime).toBe(false);
    expect(target?.route).toEqual({ kind: "league", slug: "lol-emea-championship" });
    expect(formatCountdownText(target!, Date.UTC(2026, 10, 25, 12, 0, 0), true)).toBe("51d");
    expect(formatCountdownText(target!, Date.UTC(2026, 10, 25, 12, 0, 0), false)).toBe("Starts in 51d");
    expect(formatKickoffDate("2027-01-15")).toContain("2027");
  });

  it("supports stats nextPro with exact timestamp and teams", () => {
    const target = resolveNextProTarget(
      [],
      [],
      { at: "2027-01-15T17:00:00Z", d: "2027-01-15", n: "LEC 2027 Winter", u: "lec-2027-winter", a: "G2", b: "FNC" },
      Date.parse("2027-01-15T16:45:10Z"),
    );
    expect(target?.exactTime).toBe(true);
    expect(target?.label).toBe("G2 vs FNC");
    expect(target?.route).toEqual({ kind: "event", slug: "lec-2027-winter" });
    expect(formatCountdownText(target!, Date.parse("2027-01-15T16:45:10Z"), true)).toBe("14m 50s");
    expect(formatCountdownText(target!, Date.parse("2027-01-15T16:45:10Z"), false)).toBe("Starts in 14m 50s");
  });
});
