import { afterEach, describe, expect, it, vi } from "vitest";
import { feedNow, fetchLiveWindow, type LiveWindow } from "../liveGame";
import { extractGamePicks } from "../components/LiveNextGamePreview";
import { buildGameDraftQuery, buildTakenSet, isChampTaken, nextDraftSlot, ORDER, slotsFromGameDraft, swapDraftSlots } from "../components/hub/DraftPage";
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

  it("normalizes picked, banned, and Fearless-locked champions across display names and DDragon IDs", () => {
    const used = [
      "Rumble",
      "Pantheon",
      "Syndra",
      "Ezreal",
      "Alistar",
      "Aurora",
      "Vi",
      "Cassiopeia",
      "Kai'Sa",
      "Nautilus",
      "Gnar",
      "Lee Sin",
      "Orianna",
      "Yunara",
      "Lulu",
      "Ambessa",
      "Qiyana",
      "LeBlanc",
      "Caitlyn",
      "Karma",
      "Wukong",
    ];
    const slots: (string | null)[] = ["Trundle", "Twisted Fate", "Viktor", ...new Array(17).fill(null)];
    const taken = buildTakenSet(slots, used, true);

    for (const c of [
      ...used,
      "Kaisa",
      "LeeSin",
      "Leblanc",
      "MonkeyKing",
      "Trundle",
      "Twisted Fate",
      "TwistedFate",
      "Viktor",
    ]) {
      expect(isChampTaken(c, taken)).toBe(true);
    }
    expect(isChampTaken("Ahri", taken)).toBe(false);
    expect(isChampTaken("Azir", taken)).toBe(false);

    // When Fearless is disabled, only current-game slots are taken
    const nonFearless = buildTakenSet(slots, used, false);
    expect(isChampTaken("Trundle", nonFearless)).toBe(true);
    expect(isChampTaken("TwistedFate", nonFearless)).toBe(true);
    expect(isChampTaken("Rumble", nonFearless)).toBe(false);
  });

  it("advances draft cursor in live turn order, same-team ban order, and preserves team bans/picks on Swap sides", () => {
    const empty: (string | null)[] = ORDER.map(() => null);

    // 1. Jumping mid-draft to Pick 1 (slot 6) while bans 0..5 are empty continues forward to slot 7 (R1) instead of jumping back to slot 0
    const s1 = [...empty];
    s1[6] = "Olaf";
    expect(nextDraftSlot(s1, 6, false)).toBe(7);

    // 2. Clicking a team's Ban slot in TeamColumn (sameTeamBans = true) fills that team's Phase 1 bans (0 -> 2 -> 4),
    //    then moves to the other team's Phase 1 bans (1 -> 3 -> 5), and then to Pick 1 (slot 6)
    const s2 = [...empty];
    s2[0] = "Trundle";
    expect(nextDraftSlot(s2, 0, true)).toBe(2);
    s2[2] = "TwistedFate";
    expect(nextDraftSlot(s2, 2, true)).toBe(4);
    s2[4] = "Viktor";
    expect(nextDraftSlot(s2, 4, true)).toBe(1);
    s2[1] = "Skarner";
    expect(nextDraftSlot(s2, 1, true)).toBe(3);
    s2[3] = "Ashe";
    expect(nextDraftSlot(s2, 3, true)).toBe(5);
    s2[5] = "Kalista";
    expect(nextDraftSlot(s2, 5, true)).toBe(6);

    // 3. Swapping sides moves Blue's bans (0, 2, 4) to Red's bans (1, 3, 5) and vice versa
    const swapped = swapDraftSlots(s2);
    expect(swapped[1]).toBe("Trundle");
    expect(swapped[3]).toBe("TwistedFate");
    expect(swapped[5]).toBe("Viktor");
    expect(swapped[0]).toBe("Skarner");
    expect(swapped[2]).toBe("Ashe");
    expect(swapped[4]).toBe("Kalista");
  });
});
