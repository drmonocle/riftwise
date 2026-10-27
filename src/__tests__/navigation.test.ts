import { describe, it, expect } from "vitest";
import { hubPath, parseHubPath } from "../hub/route";
import { rateLine, profile, type RatingFile } from "../hub/playerRating";
import { matchupShortcuts, pageShortcuts } from "../components/hub/HubSearch";
import { groupOf, MENU, MENU_ITEMS } from "../components/hub/menu";
import type { HubIndex } from "../hub/data";

describe("page tabs in the address", () => {
  it("reads and writes a team's, player's and tournament's tabs", () => {
    expect(parseHubPath("/team/t1/matches", "")).toEqual({ kind: "team", slug: "t1", tab: "matches" });
    expect(parseHubPath("/player/Faker/Champions", "")).toEqual({ kind: "player", slug: "faker", tab: "champions" });
    expect(parseHubPath("/tournament/worlds-2026-main-event/stats", "")).toEqual({ kind: "event", slug: "worlds-2026-main-event", tab: "stats" });
    expect(hubPath({ kind: "team", slug: "t1", tab: "history" })).toBe("/team/t1/history");
    expect(hubPath({ kind: "event", slug: "lck-2026", tab: "teams" })).toBe("/tournament/lck-2026/teams");
    expect(hubPath({ kind: "team", slug: "t1" })).toBe("/team/t1");
  });
  it("turns down a tab a page doesn't have", () => {
    expect(parseHubPath("/team/t1/career", "")).toBeNull();
    expect(parseHubPath("/player/faker/history", "")).toBeNull();
    expect(parseHubPath("/champion/ahri/stats", "")).toBeNull();
    expect(parseHubPath("/match/x/stats", "")).toBeNull();
    // a league's season still works
    expect(parseHubPath("/league/lck/2025", "")).toEqual({ kind: "league", slug: "lck", year: "2025" });
  });
  it("keeps the new lists' filters in the address", () => {
    expect(parseHubPath("/stats/players", "?role=Mid&since=2024")).toEqual({ kind: "players", query: "role=Mid&since=2024" });
    expect(parseHubPath("/stats/teams", "")).toEqual({ kind: "teams" });
    expect(hubPath({ kind: "teams", query: "region=Korea" })).toBe("/stats/teams?region=Korea");
  });
});

describe("the menu", () => {
  it("has every page once, and a group for every kind of page", () => {
    const kinds = MENU_ITEMS.map((i) => i.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of ["weekly", "worlds", "rankings", "teams", "players", "tiers", "prep", "data"]) expect(kinds).toContain(k);
    expect(groupOf("team")?.key).toBe("people");
    expect(groupOf("event")?.key).toBe("events");
    expect(groupOf("champ")?.key).toBe("champs");
    expect(groupOf("best")?.key).toBe("highlights");
    // a group's button opens its first page, and no group is named like a page in another group
    for (const g of MENU) expect(g.items.length).toBeGreaterThan(0);
  });
});

// the same game as scripts/stats/test/test_build.py rating_check(): the two copies of the formula must agree
const FILE: RatingFile = {
  v: 1,
  built: "2026-10-27",
  w: { kp: 0.25, ds: 0.25, gs: 0.15, cs: 0.1, vs: 0.05, dpm: -0.2 },
  win: 0.5,
  scale: 1.2,
  base: { "2026|Mid": { kp: [0.65, 0.15], ds: [0.27, 0.06], gs: [0.22, 0.03], cs: [8.5, 1.2], vs: [0.14, 0.04], dpm: [0.08, 0.04] } },
};
const GAME = {
  year: "2026", role: "Mid", won: true, k: 5, d: 1, a: 7, cs: 300, gold: 14000, dmg: 25000, vision: 40, min: 32,
  teamK: 18, teamDmg: 80000, teamGold: 62000, teamVision: 260,
};

describe("player rating", () => {
  it("rates a known game like the stats build", () => {
    expect(rateLine(GAME, FILE)).toBe(7.2);
    expect(rateLine({ ...GAME, won: false }, FILE)).toBe(6.2);
  });
  it("needs a role with averages", () => {
    expect(rateLine({ ...GAME, role: "" }, FILE)).toBeNull();
    expect(rateLine({ ...GAME, role: "Top" }, FILE)).toBeNull();
  });
  it("draws a profile around the role's average", () => {
    const p = profile([GAME], FILE)!;
    expect(p).toHaveLength(6);
    // more damage than the average mid: above 50; fewer deaths: above 50 too (turned round)
    expect(p[1]!).toBeGreaterThan(70);
    expect(p[5]!).toBeGreaterThan(80);
  });
});

const INDEX: HubIndex = {
  teams: [
    ["T1", "t1", 1860, "2026", "SK Telecom T1", "T1 | SKT", "Korea"],
    ["Gen.G", "geng", 1500, "2026", "Samsung Galaxy", "GEN", "Korea"],
  ],
  players: [
    ["Faker", "faker", "T1", 1300, "2026", "M", "Lee Sang-hyeok"],
    ["Chovy", "chovy", "Gen.G", 900, "2026", "M", ""],
  ],
  events: [],
  champs: [["Azir", "azir", 19000]],
};

describe("search shortcuts", () => {
  it("opens Match prep and Compare for two teams", () => {
    const s = matchupShortcuts(INDEX, "t1 vs gen.g");
    expect(s.map((x) => x.key)).toEqual(["prep", "compare"]);
    expect(hubPath(s[0].route)).toBe("/stats/prep?teams=t1,geng");
  });
  it("compares two players", () => {
    const s = matchupShortcuts(INDEX, "Faker v Chovy");
    expect(s).toHaveLength(1);
    expect(hubPath(s[0].route)).toBe("/stats/compare?players=faker,chovy");
  });
  it("leaves other searches alone", () => {
    expect(matchupShortcuts(INDEX, "faker")).toEqual([]);
    expect(matchupShortcuts(INDEX, "t1 vs nobody")).toEqual([]);
  });
  it("finds pages by name", () => {
    expect(pageShortcuts("tier list")[0]?.route).toEqual({ kind: "tiers" });
    expect(pageShortcuts("power rankings")[0]?.route).toEqual({ kind: "rankings" });
    expect(pageShortcuts("ab")).toEqual([]);
  });
});
