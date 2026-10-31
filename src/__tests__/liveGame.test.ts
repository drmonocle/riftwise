import { afterEach, describe, expect, it, vi } from "vitest";
import { feedNow, fetchLiveWindow, type LiveWindow } from "../liveGame";
import { extractGamePicks } from "../components/LiveNextGamePreview";
import { buildGameDraftQuery, slotsFromGameDraft } from "../components/hub/DraftPage";
import { seriesGameDraftQuery } from "../components/hub/MatchPage";
import type { HubSeries } from "../hub/types";
import type { Match } from "../types";

// the feed's refusal of a window it won't serve yet, with Riot's time in microseconds (as the real one says it)
const refusal = (server: number) =>
  new Response(
    JSON.stringify({
      httpStatus: 400,
      errorCode: "BAD_QUERY_PARAMETER",
      message: `disallowed window with end time less than 20 sec old (was 5.10 sec old). requested window: [x, y]) ahead of broadcast. current time: ${new Date(server).toISOString().replace(/Z$/, "456Z")}`,
    }),
    { status: 400 },
  );

describe("live feed timing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("learns Riot's clock from a too-recent refusal and asks again far enough back", async () => {
    const server = Date.now() - 45_000; // this device's clock runs 45 s fast
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return urls.length === 1 ? refusal(server) : new Response(JSON.stringify({ frames: [{ rfc460Timestamp: "t" }] }), { status: 200 });
      }),
    );
    const w = await fetchLiveWindow("g1");
    expect(w?.frames).toHaveLength(1);
    expect(urls).toHaveLength(2);
    const asked = Date.parse(new URL(urls[1]).searchParams.get("startingTime") || "");
    expect(asked).toBeLessThanOrEqual(server - 50_000);
    // later requests are timed by Riot's clock straight away
    expect(Math.abs(feedNow() - (Date.now() - 45_000))).toBeLessThan(1000);
  });

  it("gives up after one more try, and treats 204 as no stats yet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => refusal(Date.now())));
    await expect(fetchLiveWindow("g2")).rejects.toThrow("HTTP 400");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(fetchLiveWindow("g3")).resolves.toBeNull();
  });

  it("extracts earlier-game picks in role order for Fearless Draft preview", () => {
    const match = {
      id: "m1",
      team1Id: "t1",
      team1Code: "T1",
      team1Name: "T1",
      team2Id: "geng",
      team2Code: "GEN",
      team2Name: "Gen.G",
    } as unknown as Match;
    const win: LiveWindow = {
      gameMetadata: {
        blueTeamMetadata: {
          esportsTeamId: "geng",
          participantMetadata: [
            { participantId: 3, summonerName: "GEN Chovy", championId: "Ahri", role: "mid" },
            { participantId: 1, summonerName: "GEN Kiin", championId: "Ksante", role: "top" },
          ],
        },
        redTeamMetadata: {
          esportsTeamId: "t1",
          participantMetadata: [
            { participantId: 8, summonerName: "T1 Faker", championId: "Azir", role: "mid" },
            { participantId: 6, summonerName: "T1 Doran", championId: "Gnar", role: "top" },
          ],
        },
      },
      frames: [],
    };
    const res = extractGamePicks(match, win, 1);
    expect(res).toEqual({
      number: 1,
      blueIsTeam1: false,
      team1: [
        { c: "Gnar", player: "Doran", role: "top" },
        { c: "Azir", player: "Faker", role: "mid" },
      ],
      team2: [
        { c: "Ksante", player: "Kiin", role: "top" },
        { c: "Ahri", player: "Chovy", role: "mid" },
      ],
    });
  });

  it("loads the active game's draft and earlier Fearless history into the Draft board URL", () => {
    const slots = slotsFromGameDraft({
      blueBans: ["Vi", "Skarner", "Aurora", "Rakan", "Nautilus"],
      redBans: ["Ashe", "Kalista", "Yone", "Leona", "Braum"],
      bluePicks: ["Gnar", "Xin Zhao", "Ahri", "Varus", "Alistar"],
      redPicks: ["Jax", "Sejuani", "Azir", "Kai'Sa", "Rell"],
    });
    expect(slots).toHaveLength(20);
    // Phase 1 bans (0..5): b, r, b, r, b, r
    expect(slots.slice(0, 6)).toEqual(["Vi", "Ashe", "Skarner", "Kalista", "Aurora", "Yone"]);
    // Phase 1 picks (6..11): b, r, r, b, b, r
    expect(slots.slice(6, 12)).toEqual(["Gnar", "Jax", "Sejuani", "Xin Zhao", "Ahri", "Azir"]);
    // Phase 2 bans (12..15): r, b, r, b
    expect(slots.slice(12, 16)).toEqual(["Leona", "Rakan", "Braum", "Nautilus"]);
    // Phase 2 picks (16..19): r, b, b, r
    expect(slots.slice(16, 20)).toEqual(["Kai'Sa", "Varus", "Alistar", "Rell"]);

    const series: HubSeries = {
      a: { n: "T1", u: "t1", c: "T1" },
      b: { n: "Gen.G", u: "gen-g", c: "GEN" },
      sa: 2,
      sb: 1,
      bo: 3,
      w: 1,
      date: "2026-10-30",
      e: "worlds-2026",
      en: "Worlds 2026",
      stage: "Finals",
      games: [
        {
          n: 1,
          w: 1,
          blue: "a",
          st: "f",
          t: {
            blue: { bans: ["Ashe"], picks: ["Gnar", "Vi", "Ahri", "Varus", "Rell"] },
            red: { bans: ["Yone"], picks: ["Jax", "Skarner", "Azir", "Kalista", "Rakan"] },
          },
        },
        {
          n: 2,
          w: 2,
          blue: "b",
          st: "f",
          t: {
            blue: { bans: ["Aurora"], picks: ["Rumble", "Sejuani", "Sylas", "Ezreal", "Leona"] },
            red: { bans: ["Ziggs"], picks: ["Camille", "Xin Zhao", "Orianna", "Jhin", "Nautilus"] },
          },
        },
        {
          n: 3,
          w: 1,
          blue: "a",
          st: "f",
          t: {
            blue: { bans: ["Smolder"], picks: ["Renekton", "Lee Sin", "Ryze", "Xayah", "Alistar"] },
            red: { bans: ["Corki"], picks: ["Ornn", "Maokai", "Taliyah", "Kai'Sa", "Braum"] },
          },
        },
      ],
    };

    // Game 1: Blue=t1, Red=gen-g, g=1, d=Game 1 slots, no u or h
    const q1 = new URLSearchParams(seriesGameDraftQuery(series, series.games[0], 0));
    expect(q1.get("teams")).toBe("t1,gen-g");
    expect(q1.get("g")).toBe("1");
    expect(q1.get("d")).toContain("Gnar");
    expect(q1.get("u")).toBeNull();
    expect(q1.get("h")).toBeNull();

    // Game 2 (Gen.G on Blue side): Blue=gen-g, Red=t1, g=2, d=Game 2 slots, u=Game 1 picks, h=Game 1 history
    const q2 = new URLSearchParams(seriesGameDraftQuery(series, series.games[1], 1));
    expect(q2.get("teams")).toBe("gen-g,t1");
    expect(q2.get("g")).toBe("2");
    expect(q2.get("d")).toContain("Rumble");
    expect(q2.get("u")).toBe("Gnar,Vi,Ahri,Varus,Rell,Jax,Skarner,Azir,Kalista,Rakan");
    expect(q2.get("h")).toContain("t1~gen-g~");

    // Game 3: Blue=t1, Red=gen-g, g=3, d=Game 3 slots, u=Game 1+2 picks, h=2 games in history
    const q3 = new URLSearchParams(seriesGameDraftQuery(series, series.games[2], 2));
    expect(q3.get("teams")).toBe("t1,gen-g");
    expect(q3.get("g")).toBe("3");
    expect(q3.get("d")).toContain("Ryze");
    expect(q3.get("u")?.split(",")).toHaveLength(20);
    expect(q3.get("h")?.split(";")).toHaveLength(2);

    // Direct helper check
    const customQ = new URLSearchParams(
      buildGameDraftQuery({
        blueSlug: "t1",
        redSlug: "gen-g",
        period: "y2026",
        gameNum: 4,
      }),
    );
    expect(customQ.get("teams")).toBe("t1,gen-g");
    expect(customQ.get("p")).toBe("y2026");
    expect(customQ.get("g")).toBe("4");
  });
});
