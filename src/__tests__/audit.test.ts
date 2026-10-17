import { describe, it, expect } from "vitest";
import { followedPlayerTeams, isMatchFollowed, mainPlayerEntries } from "../helpers";
import { findHubTeam, searchHub, type HubIndex } from "../hub/data";
import { playerHeadToHead } from "../hub/period";
import type { AppSettings, CatalogTeam, Match, PlayerEntry } from "../types";
import type { PlayerGameRow } from "../hub/types";

const teams: CatalogTeam[] = [
  { slug: "t1", code: "T1", name: "T1", league: "LCK", region: "KOREA" },
  { slug: "t1-esports-academy", code: "T1A", name: "T1 Esports Academy", league: "LCK Challengers", region: "KOREA" },
  { slug: "lyon", code: "LYON", name: "LYON", league: "LCS", region: "AMERICAS" },
  { slug: "lyon-academy", code: "LYON", name: "Lyon Academy", league: "NACL", region: "AMERICAS" },
];
const players: PlayerEntry[] = [
  { name: "Faker", role: "Mid", teamCode: "T1A", teamName: "T1 Esports Academy", teamSlug: "t1-esports-academy" },
  { name: "Faker", role: "Mid", teamCode: "T1", teamName: "T1", teamSlug: "t1" },
  { name: "Inspired", role: "Jungle", teamCode: "LYON", teamName: "LYON", teamSlug: "lyon" },
];

describe("followed players", () => {
  it("counts a player once, on their main team", () => {
    const main = mainPlayerEntries(players, teams);
    expect(main.map((p) => `${p.name}:${p.teamCode}`)).toEqual(["Faker:T1", "Inspired:LYON"]);
    expect(followedPlayerTeams(["faker"], { players, teams })).toEqual(["T1"]);
    expect(followedPlayerTeams([], { players, teams })).toEqual([]);
  });
  it("makes their team's matches followed", () => {
    const settings = { followedTeams: [], followedLeagues: [], followedRegions: [], followedPlayers: ["Faker"] } as unknown as AppSettings;
    const m = { team1Code: "T1", team2Code: "GEN", leagueSlug: "lck", leagueName: "LCK" } as Match;
    const academy = { team1Code: "T1A", team2Code: "GENA", leagueSlug: "lck_challengers_league", leagueName: "LCK CL" } as Match;
    const pt = followedPlayerTeams(settings.followedPlayers, { players, teams });
    expect(isMatchFollowed(m, settings, [], pt)).toBe(true);
    expect(isMatchFollowed(academy, settings, [], pt)).toBe(false);
    expect(isMatchFollowed(m, settings, [])).toBe(false);
  });
});

describe("stats search: leagues", () => {
  const index: HubIndex = {
    teams: [],
    players: [],
    events: [],
    champs: [],
    leagues: [
      { l: "LoL Champions Korea", u: "lol-champions-korea", s: "LCK", n: 58, pr: 1, g: 5406 },
      { l: "LCK Challengers League", u: "lck-challengers-league", s: "LCK CL", n: 20, pr: 0, g: 3000 },
      {
        l: "League of Legends Championship Series", u: "league-of-legends-championship-series", s: "LCS", n: 40, pr: 1, g: 4000,
        h: [{ l: "North America League Championship Series", s: "NA LCS", u: "north-america-league-championship-series" }],
      },
    ],
  };
  it("finds a league by its short name, its full name or an old name", () => {
    expect(searchHub(index, "lck").league[0].slug).toBe("lol-champions-korea");
    expect(searchHub(index, "champions korea").league[0].slug).toBe("lol-champions-korea");
    const old = searchHub(index, "na lcs").league[0];
    expect(old.slug).toBe("league-of-legends-championship-series");
    expect(old.matched).toBe("NA LCS");
  });
  it("works without the league list (older builds)", () => {
    expect(searchHub({ teams: [], players: [], events: [], champs: [] }, "lck").league).toEqual([]);
  });
});

describe("live team -> stats page", () => {
  const index: HubIndex = {
    teams: [
      ["Ninjas in Pyjamas", "ninjas-in-pyjamas", 80, "2018", "", "NIP", "Europe"],
      ["Ninjas in Pyjamas.CN", "ninjas-in-pyjamas-cn", 300, "2026", "", "NIP", "China"],
      ["LYON (2024 American Team)", "lyon-2024-american-team", 113, "2026", "", "LYON", ""],
      ["Lyon Gaming", "lyon-gaming", 400, "2023", "", "LYN", "Latin America"],
      ["Team Liquid", "team-liquid", 1500, "2026", "Team Curse", "TL", "North America"],
    ],
    players: [],
    events: [],
    champs: [],
  };
  it("picks the active team of that name", () => {
    expect(findHubTeam(index, "Ninjas in Pyjamas", "NIP")).toBe("ninjas-in-pyjamas-cn");
    expect(findHubTeam(index, "LYON", "LYON")).toBe("lyon-2024-american-team");
    expect(findHubTeam(index, "Team Liquid Honda", "TLAW")).toBe("team-liquid");
  });
});

describe("player head-to-head", () => {
  // [date, series, champ, k, d, a, won, team, opp, event, role, event slug, cs, gold, damage, vision, minutes]
  const row = (series: string, won: number, team: string, minutes: number): PlayerGameRow =>
    ["2026-01-01", series, "Ahri", 1, 1, 1, won, team, "", "", "Mid", "", null, null, null, null, minutes];
  it("gives both players the same games", () => {
    // B sat out game 2 of the series
    const a = [row("s1", 1, "T1", 30), row("s1", 0, "T1", 31), row("s1", 1, "T1", 32)];
    const b = [row("s1", 0, "GEN", 30), row("s1", 0, "GEN", 32)];
    expect(playerHeadToHead(a, b)).toEqual({ g: 2, w: 2 });
    expect(playerHeadToHead(b, a)).toEqual({ g: 2, w: 0 });
  });
  it("doesn't count games as teammates", () => {
    expect(playerHeadToHead([row("s2", 1, "T1", 30)], [row("s2", 1, "T1", 30)])).toEqual({ g: 0, w: 0 });
  });
});

import { hubPath, parseHubPath } from "../hub/route";
describe("best games links", () => {
  it("a match page can open at one game", () => {
    expect(hubPath({ kind: "match", slug: "worlds-2022-finals-1", game: 5 })).toBe("/match/worlds-2022-finals-1?g=5");
    expect(parseHubPath("/match/worlds-2022-finals-1", "?g=5")).toEqual({ kind: "match", slug: "worlds-2022-finals-1", game: 5 });
    expect(parseHubPath("/match/worlds-2022-finals-1", "")).toEqual({ kind: "match", slug: "worlds-2022-finals-1" });
    expect(parseHubPath("/team/t1", "?g=5")).toEqual({ kind: "team", slug: "t1" });
  });
  it("the page keeps its filters in the address", () => {
    expect(parseHubPath("/stats/best", "?view=series&year=2025")).toEqual({ kind: "best", query: "view=series&year=2025" });
    expect(hubPath({ kind: "best", query: "league=lol-champions-korea" })).toBe("/stats/best?league=lol-champions-korea");
  });
});
