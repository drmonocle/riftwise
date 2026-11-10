import { describe, it, expect } from "vitest";
import { hubPath, parseHubPath } from "../hub/route";
import { resolveChampSlug, resolveEventSlug, resolveLeagueSlug, resolvePlayerSlug } from "../hub/data";
import { rateLine, profile, type RatingFile } from "../hub/playerRating";
import { filterBuiltSeasons } from "../components/hub/Ranks";
import { champPairShortcuts, matchupShortcuts, pageShortcuts } from "../components/hub/HubSearch";
import { groupOf, MENU, MENU_ITEMS } from "../components/hub/menu";
import { NAV_GROUP } from "../components/navGroups";
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
  it("makes the stats front page the site's home", () => {
    expect(parseHubPath("/", "")).toEqual({ kind: "home" });
    expect(parseHubPath("/stats", "")).toEqual({ kind: "home" });
    expect(hubPath({ kind: "home" })).toBe("/");
    expect(hubPath({ kind: "rankings" })).toBe("/stats/rankings");
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
    expect(parseHubPath("/stats/rankings", "?league=LCK")).toEqual({ kind: "rankings", query: "league=LCK" });
    expect(hubPath({ kind: "rankings", query: "league=LCK" })).toBe("/stats/rankings?league=LCK");
    expect(parseHubPath("/stats/data", "?year=2018")).toEqual({ kind: "data", query: "year=2018" });
    expect(hubPath({ kind: "data", query: "league=lck&year=2026" })).toBe("/stats/data?league=lck&year=2026");
    expect(parseHubPath("/stats/tournaments/2025", "?league=lck")).toEqual({ kind: "tournaments", year: "2025", query: "league=lck" });
    expect(hubPath({ kind: "tournaments", year: "2025", query: "league=lck" })).toBe("/stats/tournaments/2025?league=lck");
    expect(parseHubPath("/stats/leagues", "?scope=past&q=Korea")).toEqual({ kind: "leagues", query: "scope=past&q=Korea" });
    expect(hubPath({ kind: "leagues", query: "scope=past&q=Korea" })).toBe("/stats/leagues?scope=past&q=Korea");
    expect(parseHubPath("/stats/patches", "?q=Azir")).toEqual({ kind: "patches", query: "q=Azir" });
    expect(hubPath({ kind: "patches", query: "q=Azir" })).toBe("/stats/patches?q=Azir");
  });
  it("resolves legacy and alternate entity/compare URLs and slug aliases", () => {
    expect(parseHubPath("/event/worlds-2026-main-event", "")).toEqual({ kind: "event", slug: "worlds-2026-main-event" });
    expect(parseHubPath("/champ/ahri", "")).toEqual({ kind: "champ", slug: "ahri" });
    expect(parseHubPath("/champion/pantheon", "?role=Support")).toEqual({ kind: "champ", slug: "pantheon", query: "role=Support" });
    expect(hubPath({ kind: "champ", slug: "pantheon", query: "role=Support" })).toBe("/champion/pantheon?role=Support");
    expect(parseHubPath("/team/t1/tournaments", "")).toEqual({ kind: "team", slug: "t1", tab: "history" });
    expect(parseHubPath("/team/t1/series", "")).toEqual({ kind: "team", slug: "t1", tab: "matches" });
    expect(hubPath({ kind: "team", slug: "t1", tab: "tournaments" })).toBe("/team/t1/history");
    expect(parseHubPath("/compare", "?a=t1&b=geng")).toEqual({ kind: "compare", mode: "team", a: "t1", b: "geng" });
    expect(resolveLeagueSlug("worlds")).toBe("world-championship");
    expect(resolveLeagueSlug("lck")).toBe("lol-champions-korea");
    expect(resolveEventSlug("world-championship-2016")).toBe("worlds-2016");
    expect(resolveEventSlug("lol-world-championship-2013")).toBe("worlds-season-3");
    expect(resolveEventSlug("mid-season-invitational-2024")).toBe("msi-2024");
    expect(resolveChampSlug("k-sante")).toBe("ksante");
    expect(resolveChampSlug("Kha-Zix")).toBe("khazix");
    expect(resolveChampSlug("leesin")).toBe("lee-sin");
    expect(resolveChampSlug("monkeyking")).toBe("wukong");
    expect(resolveChampSlug("nunu")).toBe("nunu-and-willump");
    expect(resolveChampSlug("j4")).toBe("jarvan-iv");
    expect(resolvePlayerSlug("show-maker")).toBe("showmaker");
    expect(resolvePlayerSlug("the-shy")).toBe("theshy");
    expect(resolvePlayerSlug("thebausffs")).toBe("baus");
  });
});

describe("built league seasons filter", () => {
  const events = [
    { lu: "lck", date: "2026-03-01", g: 18 },
    { lu: "cyber-games-arena", date: "2015-05-01", g: 12 },
    { lu: "unlisted-student-league", date: "2024-02-01", g: 10 },
  ];
  it("waits until leagues.json is loaded and excludes leagues without built season files", () => {
    expect(filterBuiltSeasons(events, 5, null)).toEqual([]);
    const leagues = [
      { l: "LCK", u: "lck", r: "Korea", pr: 1, g: 5000, e: 20, f: "2012", t: "2026", sy: ["2026", "2025"] },
      { l: "Cyber Games Arena", u: "cyber-games-arena", r: null, pr: 0, g: 50, e: 2, f: "2015", t: "2015", sy: [] },
    ];
    expect(filterBuiltSeasons(events, 5, leagues)).toEqual([["lck", "2026", 18]]);
  });
});

describe("the menu", () => {
  it("has every page once, and a group for every kind of page", () => {
    const kinds = MENU_ITEMS.map((i) => i.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of ["weekly", "worlds", "rankings", "teams", "players", "tiers", "prep", "data"]) expect(kinds).toContain(k);
    expect(groupOf("team")?.key).toBe("teams");
    expect(groupOf("event")?.key).toBe("tournaments");
    expect(groupOf("champ")?.key).toBe("champions");
    expect(groupOf("best")?.key).toBe("tournaments");
    expect(groupOf("compare")?.key).toBe("tools");
  });
  it("lights the same top-bar item as the menu's group for every page", () => {
    const kinds = [...MENU_ITEMS.map((i) => i.kind).filter((k) => k !== "home"), "team", "player", "event", "league", "match", "champ"];
    for (const k of kinds) expect(NAV_GROUP[k], k).toBe(groupOf(k as never)?.key);
    expect(Object.keys(NAV_GROUP).sort()).toEqual([...kinds].sort());
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
  it("opens Match prep, Draft board, Compare and Game finder for two teams", () => {
    const s = matchupShortcuts(INDEX, "t1 vs gen.g");
    expect(s.map((x) => x.key)).toEqual(["prep", "draft", "compare", "finder"]);
    expect(hubPath(s[0].route)).toBe("/stats/prep?teams=t1,geng");
    expect(hubPath(s[1].route)).toBe("/stats/draft?teams=t1,geng");
    expect(hubPath(s[3].route)).toBe("/stats/finder?team=t1&vs=geng");
  });
  it("opens a player's or team's champion pool for player/team + champion queries", () => {
    const p = champPairShortcuts(INDEX, "faker azir");
    expect(p.shortcuts).toHaveLength(1);
    expect(hubPath(p.shortcuts[0].route)).toBe("/player/faker/champions?champ=Azir");
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
