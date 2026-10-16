import { describe, expect, it } from "vitest";
import { pickCurrentTournament, loadSettings, saveSettings, DEFAULT_SETTINGS } from "../api";
import { regionIsFollowed, isMatchFollowed } from "../helpers";

describe("pickCurrentTournament", () => {
  const t = (id: string, start: string, end: string) => ({ id, slug: id, startDate: start, endDate: end });
  // newest first, as fetchLeagueTournaments returns them
  const list = [t("next", "2026-11-01", "2026-11-20"), t("now", "2026-10-01", "2026-10-15"), t("old", "2026-07-01", "2026-09-10")];
  it("prefers the tournament running today", () => {
    expect(pickCurrentTournament(list, "2026-10-09")?.id).toBe("now");
  });
  it("falls back to the most recently finished one between splits", () => {
    expect(pickCurrentTournament(list, "2026-10-20")?.id).toBe("now");
    expect(pickCurrentTournament(list.filter((x) => x.id !== "now"), "2026-10-20")?.id).toBe("old");
  });
  it("shows the next tournament when nothing has been played yet", () => {
    expect(pickCurrentTournament([t("only", "2026-12-01", "2026-12-10")], "2026-10-09")?.id).toBe("only");
    expect(pickCurrentTournament([], "2026-10-09")).toBeUndefined();
  });
});
import { buildStreamUrl, compareSemver } from "../api";

describe("compareSemver", () => {
  it("orders versions numerically, not lexically", () => {
    expect(compareSemver("0.3.10", "0.3.9")).toBe(1);
    expect(compareSemver("v1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("0.3.5", "0.3.6")).toBe(-1);
    expect(compareSemver("1.0", "1.0.0")).toBe(0);
  });
});

describe("buildStreamUrl", () => {
  it("returns empty for missing streams", () => {
    expect(buildStreamUrl(undefined)).toBe("");
    expect(buildStreamUrl([])).toBe("");
  });
  it("prefers English streams and encodes the channel", () => {
    const url = buildStreamUrl([
      { provider: "twitch", parameter: "lck_korea", locale: "ko-KR" },
      { provider: "twitch", parameter: "lck", locale: "en-US" },
    ]);
    expect(url).toBe("https://www.twitch.tv/lck");
    expect(buildStreamUrl([{ provider: "youtube", parameter: "a b" }])).toBe("https://www.youtube.com/watch?v=a%20b");
  });
  it("passes through explicit http(s) links and rejects unknown providers", () => {
    expect(buildStreamUrl([{ provider: "x", parameter: "https://example.com/s" }])).toBe("https://example.com/s");
    expect(buildStreamUrl([{ provider: "mystery", parameter: "abc" }])).toBe("");
  });
});

// A tiny localStorage for the settings tests (vitest runs in Node).
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe("loadSettings", () => {
  it("keeps an empty region list empty (Unfollow All must stick)", () => {
    (globalThis as any).localStorage = fakeStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).dispatchEvent = () => true;
    saveSettings({ ...DEFAULT_SETTINGS, followedRegions: [], followedLeagues: [] });
    const s = loadSettings();
    expect(s.followedRegions).toEqual([]);
    expect(s.followedLeagues).toEqual([]);
  });
  it("repairs settings an old version (or a hand edit) left behind instead of opening a blank page", () => {
    (globalThis as any).localStorage = fakeStorage();
    localStorage.setItem(
      "riftwatch_settings",
      JSON.stringify({
        spoilerMode: "yes",
        tickerMode: "floating",
        tickerCycleSec: 0,
        defaultTab: "news-old",
        followedTeams: ["t1", "GEN", null, 42, "T1"],
        followedPlayers: "Faker",
      }),
    );
    const s = loadSettings();
    expect(s.defaultTab).toBe(DEFAULT_SETTINGS.defaultTab);
    // settings of the removed ticker bar are dropped
    expect("tickerMode" in s).toBe(false);
    expect("tickerCycleSec" in s).toBe(false);
    expect(s.spoilerMode).toBe(DEFAULT_SETTINGS.spoilerMode);
    expect(s.followedTeams).toEqual(["T1", "GEN"]);
    expect(s.followedPlayers).toEqual(DEFAULT_SETTINGS.followedPlayers);
  });
  it("maps old region codes and falls back only when a list is missing", () => {
    (globalThis as any).localStorage = fakeStorage();
    localStorage.setItem("riftwatch_settings", JSON.stringify({ followedRegions: ["EUROPE", "KOREA", "EMEA"] }));
    const s = loadSettings();
    expect(s.followedRegions).toEqual(["EMEA", "KOREA"]);
    expect(s.followedTeams).toEqual(DEFAULT_SETTINGS.followedTeams);
  });
});

describe("regionIsFollowed", () => {
  it("matches Riot's extra region labels onto the region cards", () => {
    expect(regionIsFollowed("KOREA", ["KOREA"])).toBe(true);
    expect(regionIsFollowed("korea", ["KOREA"])).toBe(true);
    expect(regionIsFollowed("AMERICAS", ["BRAZIL"])).toBe(true);
    expect(regionIsFollowed("LATIN AMERICA SOUTH", ["LATIN AMERICA"])).toBe(true);
    expect(regionIsFollowed("COMMONWEALTH OF INDEPENDENT STATES", ["EMEA"])).toBe(true);
    expect(regionIsFollowed("AMERICAS", ["KOREA"])).toBe(false);
    expect(regionIsFollowed("KOREA", [])).toBe(false);
  });
  it("is used by isMatchFollowed", () => {
    const m = {
      matchId: "1", leagueName: "LTA North", leagueSlug: "lta_north", blockName: "", startTimeUtc: "", state: "unstarted" as const,
      bestOf: 3, team1Code: "AAA", team1Name: "A", team1Score: 0, team2Code: "BBB", team2Name: "B", team2Score: 0, games: [],
    };
    const leagues = [{ slug: "lta_north", name: "LTA North", region: "AMERICAS" }];
    const base = { ...DEFAULT_SETTINGS, followedTeams: [], followedLeagues: [] };
    expect(isMatchFollowed(m, { ...base, followedRegions: ["NORTH AMERICA"] }, leagues)).toBe(true);
    expect(isMatchFollowed(m, { ...base, followedRegions: [] }, leagues)).toBe(false);
  });
});
