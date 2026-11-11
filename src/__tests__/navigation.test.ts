import { describe, it, expect } from "vitest";
import { hubPath, parseHubPath } from "../hub/route";
import { matchesChampSearch, resolveChampSlug, resolveEventSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, sameChamp, searchHub } from "../hub/data";
import { rateLine, profile, type RatingFile } from "../hub/playerRating";
import { filterBuiltSeasons } from "../components/hub/Ranks";
import { matchSide } from "../components/hub/FinderPage";
import { champAgg, matchedEventLabel, matchEventIndices, normalizeRole } from "../hub/champAgg";
import { inPeriod, matchesPeriodEvent, periodOptions, withRequestedPeriod } from "../hub/period";
import { champPairShortcuts, matchupShortcuts, pageShortcuts } from "../components/hub/HubSearch";
import { groupOf, MENU, MENU_ITEMS } from "../components/hub/menu";
import { NAV_GROUP } from "../components/navGroups";
import { siblingSectionRoute } from "../components/views/StatsView";
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
    expect(parseHubPath("/prep", "?teams=t1,geng&p=y2026")).toEqual({ kind: "prep", a: "t1", b: "geng", period: "y2026" });
    expect(parseHubPath("/champion/ahri", "?role=Mid&item=zhonyas-hourglass&span=12m")).toEqual({
      kind: "champ",
      slug: "ahri",
      query: "role=Mid&span=12m&item=zhonyas-hourglass",
    });
    expect(parseHubPath("/tournament/worlds-2024", "?team=t1&player=faker")).toEqual({
      kind: "event",
      slug: "worlds-2024",
      query: "team=t1&player=faker",
    });
    expect(resolveLeagueSlug("worlds")).toBe("world-championship");
    expect(resolveLeagueSlug("lck")).toBe("lol-champions-korea");
    expect(resolveLeagueSlug("LCK (League of Legends Champions Korea)")).toBe("lol-champions-korea");
    expect(resolveLeagueSlug("first_stand")).toBe("first-stand");
    expect(resolveLeagueSlug("First Stand")).toBe("first-stand");
    expect(resolveLeagueSlug("lta_north")).toBe("league-of-legends-championship-of-the-americas-north");
    expect(resolveLeagueSlug("LTA South")).toBe("league-of-legends-championship-of-the-americas-south");
    expect(resolveLeagueSlug("lcp")).toBe("league-of-legends-championship-pacific");
    expect(resolveLeagueSlug("cblol-brazil")).toBe("circuit-brazilian-league-of-legends");
    expect(resolveLeagueSlug("lck_challengers_league")).toBe("lck-challengers-league");
    expect(resolveLeagueSlug("emea_masters")).toBe("emea-masters");
    expect(resolveEventSlug("world-championship-2016")).toBe("worlds-2016");
    expect(resolveEventSlug("World Championship 2024")).toBe("worlds-2024");
    expect(resolveEventSlug("lol-world-championship-2013")).toBe("worlds-season-3");
    expect(resolveEventSlug("mid-season-invitational-2024")).toBe("msi-2024");
    expect(resolveChampSlug("k-sante")).toBe("ksante");
    expect(resolveChampSlug("Kha-Zix")).toBe("khazix");
    expect(resolveChampSlug("leesin")).toBe("lee-sin");
    expect(resolveChampSlug("monkeyking")).toBe("wukong");
    expect(resolveChampSlug("nunu")).toBe("nunu-and-willump");
    expect(resolveChampSlug("j4")).toBe("jarvan-iv");
    expect(resolvePlayerSlug("show-maker")).toBe("showmaker");
    expect(resolvePlayerSlug("Show Maker")).toBe("showmaker");
    expect(resolvePlayerSlug("Hans Sama")).toBe("hans-sama");
    expect(resolvePlayerSlug("the-shy")).toBe("theshy");
    expect(resolvePlayerSlug("thebausffs")).toBe("baus");
    expect(resolvePlayerSlug("The Baus")).toBe("baus");
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
    expect(hubPath(p.shortcuts[0].route)).toBe("/player/faker/champions?champ=azir");
  });
  it("compares two players and links to head-to-head game finder and leaderboards", () => {
    const s = matchupShortcuts(INDEX, "Faker v Chovy");
    expect(s.map((x) => x.key)).toEqual(["compare", "finder", "leaders"]);
    expect(hubPath(s[0].route)).toBe("/stats/compare?players=faker,chovy");
    expect(hubPath(s[1].route)).toBe("/stats/finder?player=faker&vsplayer=chovy");
    expect(hubPath(s[2].route)).toBe("/stats/leaders?q=faker%2Cchovy");
  });
  it("carries context across sibling section pills in StatsView", () => {
    expect(siblingSectionRoute({ kind: "prep", a: "t1", b: "geng", period: "y2025" }, "draft")).toEqual({
      kind: "draft",
      query: "teams=t1%2Cgeng&p=y2025",
    });
    expect(siblingSectionRoute({ kind: "prep", a: "t1", b: "geng", period: "y2025" }, "finder")).toEqual({
      kind: "finder",
      query: "team=t1&vs=geng&year=2025",
    });
    expect(siblingSectionRoute({ kind: "compare", mode: "player", a: "faker", b: "chovy" }, "finder")).toEqual({
      kind: "finder",
      query: "player=faker&vsplayer=chovy",
    });
    expect(siblingSectionRoute({ kind: "compare", mode: "player", a: "faker", b: "chovy" }, "leaders")).toEqual({
      kind: "leaders",
      query: "q=faker%2Cchovy",
    });
    expect(siblingSectionRoute({ kind: "prep", a: "t1", b: "geng", period: "y2025" }, "rankings")).toEqual({
      kind: "rankings",
      query: "q=t1%2Cgeng",
    });
    expect(siblingSectionRoute({ kind: "prep", a: "t1", b: "geng", period: "y2025" }, "best")).toEqual({
      kind: "best",
      query: "year=2025&q=t1%2Cgeng",
    });
    expect(siblingSectionRoute({ kind: "champions", query: "scope=lck&key=y2025&role=Mid&q=azir" }, "tiers")).toEqual({
      kind: "tiers",
      query: "scope=lck&key=y2025&role=Mid&q=azir",
    });
    expect(siblingSectionRoute({ kind: "champions", query: "scope=lck&key=y2025&role=Mid&q=azir" }, "champions")).toEqual({
      kind: "champions",
    });
    expect(siblingSectionRoute({ kind: "counters", query: "champ=azir&vs=orianna&role=Mid&patch=16.5" }, "tiers")).toEqual({
      kind: "tiers",
      query: "key=p16.5&role=Mid&q=azir%2Corianna",
    });
    expect(siblingSectionRoute({ kind: "counters", query: "champ=azir&vs=orianna&role=Mid&patch=16.5" }, "finder")).toEqual({
      kind: "finder",
      query: "champ=azir&vschamp=orianna&role=Mid&patch=16.5",
    });
    expect(siblingSectionRoute({ kind: "tiers", query: "key=p16.5&q=azir,orianna&role=Mid" }, "counters")).toEqual({
      kind: "counters",
      query: "champ=azir&vs=orianna&role=Mid&patch=16.5",
    });
    expect(siblingSectionRoute({ kind: "tiers", query: "key=p16.5" }, "patches")).toEqual({
      kind: "patches",
      query: "patch=16.5",
    });
    expect(siblingSectionRoute({ kind: "tournaments", year: "2025", query: "league=lck&q=t1" }, "leagues")).toEqual({
      kind: "leagues",
      query: "q=t1",
    });
    expect(siblingSectionRoute({ kind: "worlds", year: "2024" }, "titles")).toEqual({
      kind: "titles",
      query: "kind=Worlds",
    });
    expect(siblingSectionRoute({ kind: "tournaments", year: "2025", query: "q=faker" }, "records")).toEqual({
      kind: "records",
      query: "year=2025&q=faker",
    });
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
  it("matches game finder vsplayer and champion/player aliases", () => {
    const g = [
      "2026-04-01",
      "26.7",
      0,
      1,
      32,
      [["Wukong", 1, 5, 1, 7, 250, 14000, 22000, "Oner", "oner", 150]],
      [["Jarvan IV", 1, 2, 4, 5, 220, 12000, 18000, "Canyon", "canyon", -150]],
      ["Twisted Fate"],
      ["K'Sante"],
      "lck-2026",
      "T1",
      "Gen.G",
      "t1",
      "geng",
      "t1-vs-geng",
      1,
    ] as unknown as import("../hub/types").ChampGame;
    expect(matchSide(g, new URLSearchParams("player=oner&vsplayer=canyon"), null)).toBe(0);
    expect(matchSide(g, new URLSearchParams("player=canyon&vsplayer=oner"), null)).toBe(1);
    expect(matchSide(g, new URLSearchParams("champ=monkeyking&vschamp=j4"), null)).toBe(0);
    expect(matchSide(g, new URLSearchParams("ban=k-sante"), null)).toBe(0);
    expect(matchSide(g, new URLSearchParams("team=skt&vs=ssg&role=jg"), null)).toBe(0);
    expect(matchSide(g, new URLSearchParams("team=samsung&vs=sk-telecom-t1&role=jng"), null)).toBe(1);
    expect(normalizeRole("adc")).toBe("Bot");
    expect(normalizeRole("sup")).toBe("Support");
    expect(normalizeRole("jg")).toBe("Jungle");
    expect(resolveTeamAlias("dwg")).toBe("dplus-kia");
    expect(resolveTeamAlias("skt")).toBe("t1");
    expect(resolveTeamAlias("ssg")).toBe("geng");
    expect(resolveTeamAlias("gen-g")).toBe("geng");
    expect(resolveLeagueSlug("kr")).toBe("lol-champions-korea");
    expect(resolveLeagueSlug("cn")).toBe("tencent-lol-pro-league");
    expect(resolveLeagueSlug("eu")).toBe("lol-emea-championship");
  });
  it("matches champion shorthand and aliases across search and filters", () => {
    expect(sameChamp("Jarvan IV", "j4")).toBe(true);
    expect(sameChamp("K'Sante", "k-sante")).toBe(true);
    expect(sameChamp("Wukong", "monkeyking")).toBe(true);
    expect(sameChamp("Lee Sin", "lee-sin")).toBe(true);
    expect(matchesChampSearch("Jarvan IV", "j4")).toBe(true);
    expect(matchesChampSearch("Twisted Fate", "tf")).toBe(true);
    expect(matchesChampSearch("K'Sante", "ksante")).toBe(true);
    const idx: HubIndex = {
      ...INDEX,
      players: [...INDEX.players, ["Baus", "baus", "Los Ratones", 120, "2026", "T", "Simon Hofverberg"]],
      champs: [...INDEX.champs, ["Jarvan IV", "jarvan-iv", 14000], ["LeBlanc", "leblanc", 11000]],
    };
    expect(searchHub(idx, "j4").champ.map((h) => h.slug)).toContain("jarvan-iv");
    expect(searchHub(idx, "thebausffs").player.map((h) => h.slug)).toContain("baus");
    const pair = champPairShortcuts(idx, "faker lb");
    expect(pair.shortcuts).toHaveLength(1);
    expect(hubPath(pair.shortcuts[0].route)).toBe("/player/faker/champions?champ=leblanc");
  });
  it("matches whole-event parent slugs across multi-stage champgames files", () => {
    const events: [string, string][] = [
      ["lec-2024-winter-season", "LEC 2024 Winter Season"],
      ["lec-2024-winter-groups", "LEC 2024 Winter Groups"],
      ["lec-2024-winter-playoffs", "LEC 2024 Winter Playoffs"],
      ["lec-2024-spring-season", "LEC 2024 Spring Season"],
    ];
    const m = matchEventIndices(events, "lec-2024-winter");
    expect(m).toBeInstanceOf(Set);
    expect([...(m as Set<number>)]).toEqual([0, 1, 2]);
    expect(matchedEventLabel(events, m, "lec-2024-winter")).toBe("LEC 2024 Winter");
    const g0 = ["2024-01-13", "14.1", 0, 1, 30, [["Azir", 2, 3, 1, 5, 250, 13000, 20000, "Caps", "caps", 0]], [], [], [], 1] as unknown as import("../hub/types").ChampGame;
    const g3 = ["2024-03-09", "14.5", 3, 1, 30, [["Ahri", 2, 3, 1, 5, 250, 13000, 20000, "Caps", "caps", 0]], [], [], [], 1] as unknown as import("../hub/types").ChampGame;
    expect(matchSide(g0, new URLSearchParams(), m)).toBe(0);
    expect(matchSide(g3, new URLSearchParams(), m)).toBe(-1);
    const agg = champAgg([g0, g3], { event: m ?? undefined });
    expect(agg.games).toBe(1);
    expect(agg.rows.map((r) => r.c)).toEqual(["Azir"]);
  });
  it("preserves contextual query parameters across entity routes and tabs", () => {
    expect(parseHubPath("/tournament/worlds-2025/stats", "?role=Mid&q=t1")).toEqual({
      kind: "event",
      slug: "worlds-2025",
      tab: "stats",
      query: "role=Mid&q=t1",
    });
    expect(hubPath({ kind: "event", slug: "worlds-2025", tab: "stats", query: "role=Mid&q=t1" })).toBe(
      "/tournament/worlds-2025/stats?role=Mid&q=t1",
    );
    expect(parseHubPath("/team/t1/matches", "?y=2025&q=gen-g")).toEqual({
      kind: "team",
      slug: "t1",
      tab: "matches",
      query: "y=2025&q=gen-g",
    });
    expect(parseHubPath("/league/lck/2025", "?q=t1")).toEqual({
      kind: "league",
      slug: "lck",
      year: "2025",
      query: "q=t1",
    });
    expect(hubPath({ kind: "league", slug: "lck", year: "2025", query: "q=t1" })).toBe("/league/lck/2025?q=t1");
  });
  it("matches parent-event period keys and synthesizes parent tournament options", () => {
    const rows = [
      { date: "2025-11-02", e: "worlds-2025-main-event", en: "Worlds 2025 Main Event" },
      { date: "2025-10-10", e: "worlds-2025-swiss", en: "Worlds 2025 Swiss" },
      { date: "2025-08-30", e: "lck-2025-summer-playoffs", en: "LCK 2025 Summer Playoffs" },
    ];
    expect(matchesPeriodEvent("worlds-2025-main-event", "Worlds 2025 Main Event", "worlds-2025")).toBe(true);
    expect(matchesPeriodEvent("worlds-2025-main-event", "Worlds 2025 Main Event", "worlds")).toBe(false);
    expect(inPeriod(rows, "e:worlds-2025", (r) => r)).toHaveLength(2);
    const opts = withRequestedPeriod(periodOptions(rows), "e:worlds-2025", rows);
    expect(opts.find((o) => o.key === "e:worlds-2025")?.label).toBe("Worlds 2025");
  });
});
