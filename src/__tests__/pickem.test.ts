import { describe, it, expect } from "vitest";
import {
  buildSlatePicks,
  isMatchLocked,
  isPlayoffBlock,
  matchPickemSlug,
  normalizePickemLeagueKey,
} from "../components/hub/PickemPage";
import type { Match } from "../types";

describe("year-round Pick'Em helpers", () => {
  it("normalizes hub league slugs and Riot slugs into Pick'Em tabs", () => {
    expect(normalizePickemLeagueKey(undefined)).toBe("season");
    expect(normalizePickemLeagueKey("lol-champions-korea")).toBe("lck");
    expect(normalizePickemLeagueKey("tencent-lol-pro-league")).toBe("lpl");
    expect(normalizePickemLeagueKey("lol-emea-championship")).toBe("lec");
    expect(normalizePickemLeagueKey("lta_north")).toBe("lcs");
    expect(normalizePickemLeagueKey("cblol-brazil")).toBe("cblol");
    expect(normalizePickemLeagueKey("emea_masters")).toBe("emea-masters");
    expect(normalizePickemLeagueKey("demacia_cup")).toBe("demacia-cup");
  });

  it("matches Riot league slugs against Pick'Em tabs", () => {
    expect(matchPickemSlug("lck", "season")).toBe(true);
    expect(matchPickemSlug("cblol-brazil", "cblol")).toBe(true);
    expect(matchPickemSlug("lta_n", "lcs")).toBe(true);
    expect(matchPickemSlug("emea_masters", "emea-masters")).toBe(true);
    expect(matchPickemSlug("demacia_cup", "demacia-cup")).toBe(true);
    expect(matchPickemSlug("lpl", "lck")).toBe(false);
  });

  it("locks matches at kickoff or once inProgress / completed", () => {
    const now = Date.parse("2026-04-01T12:00:00Z");
    expect(isMatchLocked({ state: "unstarted", startTimeUtc: "2026-04-01T12:30:00Z" }, now)).toBe(false);
    expect(isMatchLocked({ state: "unstarted", startTimeUtc: "2026-04-01T12:00:00Z" }, now)).toBe(true);
    expect(isMatchLocked({ state: "unstarted", startTimeUtc: "2026-04-01T11:45:00Z" }, now)).toBe(true);
    expect(isMatchLocked({ state: "inProgress", startTimeUtc: "2026-04-01T12:30:00Z" }, now)).toBe(true);
    expect(isMatchLocked({ state: "completed", startTimeUtc: "2026-04-01T12:30:00Z" }, now)).toBe(true);
  });

  it("builds match picks with regular (r=1) vs playoff (r=2) weights and deduplicated teams", () => {
    expect(isPlayoffBlock("Regular Season")).toBe(false);
    expect(isPlayoffBlock("Playoffs Round 2")).toBe(true);
    const base = {
      leagueName: "LCK",
      leagueSlug: "lck",
      startTimeUtc: "2026-04-05T08:00:00Z",
      state: "unstarted" as const,
      bestOf: 3,
      team1Code: "T1",
      team1Name: "T1",
      team1Score: 0,
      team2Code: "GEN",
      team2Name: "Gen.G",
      team2Score: 0,
      games: [],
    };
    const matches: Match[] = [
      { ...base, matchId: "reg-1", blockName: "Regular Season" },
      { ...base, matchId: "po-1", blockName: "Grand Finals" },
      { ...base, matchId: "unpicked-1", blockName: "Regular Season" },
    ];
    const slugs = (n: string) => (n === "Gen.G" ? "geng" : n.toLowerCase());
    const out = buildSlatePicks(matches, { "reg-1": 1, "po-1": 2 }, slugs);
    expect(out.teams).toHaveLength(2);
    expect(out.picks).toEqual([
      { s: "match", m: "reg-1", r: 1, a: "t1", b: "geng", w: "t1" },
      { s: "match", m: "po-1", r: 2, a: "t1", b: "geng", w: "geng" },
    ]);
  });
});
