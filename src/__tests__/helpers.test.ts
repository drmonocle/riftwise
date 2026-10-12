import { beforeAll, describe, expect, it } from "vitest";
import { isMatchCompleted, normalizeTeamCode, reconcileLiveAndSchedule, computeLeagueStandings, buildAllTimeH2H, computeHeadToHead, applyH2HData, loadBundledH2H, h2hKey, recentMeetings, minutesLate, formatLate, isUpcomingOrDelayed, pickTeamByCode } from "../helpers";
import { matchIdFromHash, matchShareUrl } from "../platform";

// The bundled table is loaded on demand now (kept out of the startup bundle).
beforeAll(async () => {
  await loadBundledH2H();
});
import type { Match } from "../types";

const match = (over: Partial<Match> = {}): Match => ({
  matchId: "m1",
  leagueName: "LCK",
  leagueSlug: "lck",
  blockName: "Week 1",
  startTimeUtc: "2026-01-01T10:00:00Z",
  state: "unstarted",
  bestOf: 3,
  team1Code: "T1",
  team1Name: "T1",
  team1Score: 0,
  team2Code: "GEN",
  team2Name: "Gen.G",
  team2Score: 0,
  games: [],
  ...over,
});

describe("normalizeTeamCode", () => {
  it("uppercases, trims and applies aliases", () => {
    expect(normalizeTeamCode(" t1 ")).toBe("T1");
    expect(normalizeTeamCode("tlaw")).toBe("TL");
    expect(normalizeTeamCode("KRX")).toBe("DRX");
    expect(normalizeTeamCode("DNS")).toBe("KDF");
    expect(normalizeTeamCode("")).toBe("");
  });
});

describe("isMatchCompleted", () => {
  it("is true when state is completed", () => {
    expect(isMatchCompleted(match({ state: "completed" }))).toBe(true);
  });
  it("uses the series win threshold for Bo3 and Bo5", () => {
    expect(isMatchCompleted(match({ bestOf: 3, team1Score: 1 }))).toBe(false);
    expect(isMatchCompleted(match({ bestOf: 3, team1Score: 2 }))).toBe(true);
    expect(isMatchCompleted(match({ bestOf: 5, team2Score: 2 }))).toBe(false);
    expect(isMatchCompleted(match({ bestOf: 5, team2Score: 3 }))).toBe(true);
    expect(isMatchCompleted(match({ bestOf: 1, team1Score: 1 }))).toBe(true);
  });
});

describe("reconcileLiveAndSchedule", () => {
  it("never puts finished matches in the live list and syncs the schedule", () => {
    const live = [match({ state: "inProgress", team1Score: 2 })];
    const sched = [match({ state: "inProgress" })];
    const { finalLive, finalSchedule } = reconcileLiveAndSchedule(live, sched);
    expect(finalLive).toHaveLength(0);
    expect(finalSchedule[0].state).toBe("completed");
    expect(finalSchedule[0].winner).toBe("T1");
  });

  it("keeps genuine in-progress matches and drops placeholders", () => {
    const live = [
      match({ matchId: "a", state: "inProgress", team1Score: 1 }),
      match({ matchId: "b", state: "inProgress", team1Code: "LIVE" }),
    ];
    const { finalLive } = reconcileLiveAndSchedule(live, []);
    expect(finalLive.map((m) => m.matchId)).toEqual(["a"]);
  });

  it("surfaces in-progress schedule entries missing from getLive, without duplicates", () => {
    const sched = [match({ matchId: "x", state: "inProgress" })];
    const { finalLive } = reconcileLiveAndSchedule([match({ matchId: "x", state: "inProgress" })], sched);
    expect(finalLive).toHaveLength(1);
  });

  it("marks a live match as live in a stale schedule, with the live score", () => {
    const sched = [match({ matchId: "x", bestOf: 5, state: "unstarted" })];
    const live = [match({ matchId: "x", bestOf: 5, state: "inProgress", team2Score: 1 })];
    const { finalLive, finalSchedule } = reconcileLiveAndSchedule(live, sched);
    expect(finalLive).toHaveLength(1);
    expect(finalSchedule[0].state).toBe("inProgress");
    expect(finalSchedule[0].team2Score).toBe(1);
  });
});

describe("computeLeagueStandings", () => {
  it("counts series and games for completed matches in the league only", () => {
    const sched = [
      match({ matchId: "1", state: "completed", team1Score: 2, team2Score: 1, winner: "T1" }),
      match({ matchId: "2", state: "completed", leagueSlug: "lpl", team1Score: 2, team2Score: 0 }),
      match({ matchId: "3", state: "unstarted" }),
    ];
    const table = computeLeagueStandings("lck", sched);
    const t1 = table.find((t) => t.teamCode === "T1");
    const gen = table.find((t) => t.teamCode === "GEN");
    expect(table).toHaveLength(2);
    expect(t1).toMatchObject({ seriesWon: 1, seriesLost: 0, gamesWon: 2, gamesLost: 1 });
    expect(gen).toMatchObject({ seriesWon: 0, seriesLost: 1 });
  });
});

describe("buildAllTimeH2H", () => {
  it("maps full team names to codes and merges duplicate pairs in either order", () => {
    const merged = buildAllTimeH2H({
      "NATUS VINCERE__RED": [3, 1],
      "RED__NAVI": [2, 2],
      "HANJIN BRION__T1": [1, 4],
    });
    expect(merged["NAVI__RED"]).toEqual([5, 3]);
    expect(merged["BRO__T1"]).toEqual([1, 4]);
  });
});

describe("computeHeadToHead", () => {
  it("shows any recorded history, and nothing when there is none", () => {
    // T1 vs GEN has hundreds of games in the bundled all-time data.
    expect(computeHeadToHead("T1", "GEN")?.totalGames).toBeGreaterThan(5);
    const done = (id: string) => match({ matchId: id, state: "completed", team1Code: "AAA", team2Code: "BBB", team1Score: 2, team2Score: 1 });
    expect(computeHeadToHead("AAA", "BBB", [])).toBeNull();
    expect(computeHeadToHead("AAA", "BBB", [done("1")])).toMatchObject({ team1Wins: 2, team2Wins: 1, totalGames: 3 });
    // The match itself never counts towards its own H2H.
    expect(computeHeadToHead("AAA", "BBB", [done("1")], "1")).toBeNull();
  });

  it("takes a match back out of downloaded data that already includes it", () => {
    const before = computeHeadToHead("T1", "GEN")!;
    expect(
      applyH2HData({ cutoff: "2030-01-01T00:00:00Z", pairs: { GEN__T1: [before.team2Wins + 1, before.team1Wins + 2] } }),
    ).toBe(true);
    const played = match({ matchId: "final", state: "completed", startTimeUtc: "2029-06-01T10:00:00Z", team1Score: 2, team2Score: 1 });
    // T1 2-1 GEN is inside the downloaded table; on its own card it must not count.
    expect(computeHeadToHead("T1", "GEN", [played], "final")).toMatchObject({
      team1Wins: before.team1Wins,
      team2Wins: before.team2Wins,
    });
    expect(computeHeadToHead("T1", "GEN", [played])?.totalGames).toBe(before.totalGames + 3);
  });
});
describe("h2hKey", () => {
  it("normalizes and sorts the codes", () => {
    expect(h2hKey("t1", "GEN")).toBe("GEN__T1");
    expect(h2hKey("GEN", "T1")).toBe("GEN__T1");
    expect(h2hKey("KRX", "T1")).toBe("DRX__T1");
  });
});

describe("recentMeetings", () => {
  it("merges published history with newer schedule results, newest first, from team1's side", () => {
    // Published rows are from the alphabetically-first team's side (GEN), so T1-first callers get them flipped.
    const published: [string, string, number, number][] = [["2025-10-18", "Worlds 2025", 1, 0]];
    const played = match({
      matchId: "new",
      state: "completed",
      startTimeUtc: "2031-01-01T10:00:00Z",
      team1Code: "T1",
      team2Code: "GEN",
      team1Score: 3,
      team2Score: 2,
      leagueName: "LCK",
    });
    const rows = recentMeetings("T1", "GEN", published, [played]);
    expect(rows).toEqual([
      { date: "2031-01-01", tournament: "LCK", team1Score: 3, team2Score: 2, matchId: "new" },
      { date: "2025-10-18", tournament: "Worlds 2025", team1Score: 0, team2Score: 1 },
    ]);
    // The match the view was opened from is left out.
    expect(recentMeetings("T1", "GEN", published, [played], "new")).toHaveLength(1);
  });
});

describe("shareable match links", () => {
  it("round-trips a match id through the web URL hash", () => {
    const url = matchShareUrl("115 abc/1");
    expect(url).toBe("https://lolworlds.com/riftwatch/#match/115%20abc%2F1");
    expect(matchIdFromHash(new URL(url).hash)).toBe("115 abc/1");
    expect(matchIdFromHash("#other")).toBeNull();
    expect(matchIdFromHash("")).toBeNull();
  });
});

describe("delayed matches", () => {
  const NOW = new Date("2026-10-09T22:52:00Z").getTime();
  const dsgFue = match({ matchId: "d", leagueSlug: "lcs_promotion", state: "unstarted", startTimeUtc: "2026-10-09T21:00:00Z", team1Code: "DSG", team2Code: "FUE" });

  it("measures how late an unstarted match is", () => {
    expect(minutesLate(dsgFue, NOW)).toBe(112);
    expect(formatLate(112)).toBe("1h 52m");
    expect(formatLate(25)).toBe("25m");
    expect(minutesLate({ ...dsgFue, startTimeUtc: "2026-10-09T23:30:00Z" }, NOW)).toBe(0); // not due yet
    expect(minutesLate({ ...dsgFue, state: "inProgress" }, NOW)).toBe(0);
    expect(minutesLate({ ...dsgFue, state: "completed" }, NOW)).toBe(0);
  });

  it("keeps a late match on the Live tab only while its league's broadcast is on air", () => {
    expect(isUpcomingOrDelayed(dsgFue, new Set(), NOW)).toBe(false); // old behaviour: dropped after 15 min
    expect(isUpcomingOrDelayed(dsgFue, new Set(["lcs_promotion"]), NOW)).toBe(true);
    expect(isUpcomingOrDelayed(dsgFue, new Set(["lck"]), NOW)).toBe(false);
    expect(isUpcomingOrDelayed({ ...dsgFue, startTimeUtc: "2026-10-09T10:00:00Z" }, new Set(["lcs_promotion"]), NOW)).toBe(false); // 12 h late: stale
    expect(isUpcomingOrDelayed({ ...dsgFue, state: "completed" }, new Set(["lcs_promotion"]), NOW)).toBe(false);
    expect(isUpcomingOrDelayed({ ...dsgFue, startTimeUtc: "2026-10-09T23:30:00Z" }, new Set(), NOW)).toBe(true); // upcoming
  });
});

describe("pickTeamByCode", () => {
  const teams = [
    { code: "KT", name: "kt Challengers", league: "LCK Challengers" },
    { code: "KT", name: "kt Rolster", league: "LCK" },
    { code: "HLE", name: "HLE Academy", league: "" },
    { code: "HLE", name: "Hanwha Life Esports", league: "LCK" },
    { code: "TLAW", name: "Team Liquid Alienware", league: "LCS" },
    { code: "ONLY", name: "Only Entry", league: "LCK Challengers" },
  ];
  it("prefers the main-league team when a code is shared", () => {
    expect(pickTeamByCode(teams, "KT")?.name).toBe("kt Rolster");
    expect(pickTeamByCode(teams, "hle")?.name).toBe("Hanwha Life Esports");
  });
  it("uses aliases and falls back to whatever exists", () => {
    expect(pickTeamByCode(teams, "TL")?.name).toBe("Team Liquid Alienware");
    expect(pickTeamByCode(teams, "ONLY")?.name).toBe("Only Entry");
    expect(pickTeamByCode(teams, "NOPE")).toBeUndefined();
  });
});
