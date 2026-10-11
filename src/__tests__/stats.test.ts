import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The server keeps only the two newest stats builds, so a long-running app must notice a new one.
describe("stats loader", () => {
  let current = "v1";
  const files: Record<string, unknown> = {};
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/latest.json")) return new Response(JSON.stringify({ version: current }));
    const hit = Object.keys(files).find((k) => url.endsWith(k));
    return hit ? new Response(JSON.stringify(files[hit])) : new Response("", { status: 404 });
  });

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    current = "v1";
    for (const k of Object.keys(files)) delete files[k];
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries with the new build when the old one was removed", async () => {
    files["/v1/records.json"] = { built: "v1" };
    const { loadRecords, loadTitles } = await import("../stats");
    expect(await loadRecords()).toEqual({ built: "v1" });

    // Overnight: v2 is built and v1 deleted, while the app stays open.
    current = "v2";
    delete files["/v1/records.json"];
    files["/v2/titles.json"] = [{ t: "Worlds 2025" }];
    expect(await loadTitles()).toEqual([{ t: "Worlds 2025" }]);
  });

  it("re-checks the current build after an hour", async () => {
    files["/v1/meta.json"] = { version: "v1" };
    files["/v2/meta.json"] = { version: "v2" };
    const { loadStatsMeta } = await import("../stats");
    expect(await loadStatsMeta()).toEqual({ version: "v1" });

    current = "v2";
    expect(await loadStatsMeta()).toEqual({ version: "v1" }); // still within the hour
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect(await loadStatsMeta()).toEqual({ version: "v2" });
  });
});
