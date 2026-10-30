import { afterEach, describe, expect, it, vi } from "vitest";
import { feedNow, fetchLiveWindow, type LiveWindow } from "../liveGame";
import { extractGamePicks } from "../components/LiveNextGamePreview";
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
});
