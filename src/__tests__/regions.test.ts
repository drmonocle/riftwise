import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchLiveCatalog, leagueDisplayName } from "../api";
import { isMatchFollowed } from "../helpers";
import { DEFAULT_SETTINGS } from "../api";
import { setDictionaryForTests } from "../i18n";

// Riot translates region names with hl= ("한국" for KOREA). Follows use the English codes, so the
// catalog must keep English regions while league names may come back translated.
describe("catalog in another language", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setDictionaryForTests("en", {});
  });

  it("keeps English region codes and translated league names", async () => {
    setDictionaryForTests("ko", { "event::Worlds": "롤드컵" });
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const korean = url.includes("hl=ko-KR");
        if (url.includes("/getTeams")) {
          return new Response(JSON.stringify({ data: { teams: [{ slug: "t1", code: "T1", name: "T1", status: "active", homeLeague: { name: "LCK", region: korean ? "한국" : "KOREA" }, players: [{ summonerName: "Faker", role: "mid" }] }] } }));
        }
        return new Response(
          JSON.stringify({
            data: {
              leagues: [
                { id: "1", slug: "lck_challengers_league", name: korean ? "LCK 챌린저스" : "LCK Challengers", region: korean ? "한국" : "KOREA" },
                { id: "2", slug: "worlds", name: korean ? "월드 챔피언십" : "Worlds", region: korean ? "국제 대회" : "INTERNATIONAL" },
              ],
            },
          }),
        );
      }),
    );
    const cat = await fetchLiveCatalog();
    expect(cat).not.toBeNull();
    expect(urls.some((u) => u.includes("/getTeams") && u.includes("hl=en-US"))).toBe(true);
    const ll = cat!.leagues.find((l) => l.slug === "lck_challengers_league")!;
    expect(ll.region).toBe("KOREA");
    expect(ll.name).toBe("LCK 챌린저스");
    expect(cat!.teams[0].region).toBe("KOREA");
    expect(leagueDisplayName({ slug: "worlds", name: "월드 챔피언십" })).toBe("롤드컵");

    // Following the Korea region now covers LCK Challengers matches for a Korean reader
    const m = {
      matchId: "1", leagueName: "LCK 챌린저스", leagueSlug: "lck_challengers_league", blockName: "", startTimeUtc: "", state: "unstarted" as const,
      bestOf: 3, team1Code: "AAA", team1Name: "A", team1Score: 0, team2Code: "BBB", team2Name: "B", team2Score: 0, games: [],
    };
    const settings = { ...DEFAULT_SETTINGS, followedTeams: [], followedLeagues: [], followedRegions: ["KOREA"] };
    expect(isMatchFollowed(m, settings, cat!.leagues)).toBe(true);
  });
});
