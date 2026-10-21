import { describe, it, expect, beforeEach, vi } from "vitest";

// Signing in on another computer (a sync code, a password, a QR code) must not bring back what the account removed.
function storage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

let server: Record<string, { v: unknown; t: number }>;
let sent: Record<string, { v: unknown; t: number }> | null;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("window", { dispatchEvent: () => true, addEventListener: () => {}, setTimeout, clearTimeout, location: { reload: () => {} } });
  vi.stubGlobal("Event", class {
    constructor(public type: string) {}
  });
  sent = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("code/login")) return new Response(JSON.stringify({ token: "tok", account: { username: "" } }));
      if (url.endsWith("data") && init?.method === "POST") {
        sent = JSON.parse(String(init.body)).fields;
        return new Response("{}");
      }
      if (url.endsWith("data")) return new Response(JSON.stringify({ fields: server }));
      return new Response("{}");
    }),
  );
});

const account = { teams: ["HLE", "KT"], players: ["Zeka"], leagues: ["lck"], regions: ["KOREA"] };

describe("first sign-in on a device", () => {
  it("a new computer (starting follows) takes the account's follows as they are", async () => {
    server = { follows: { v: account, t: 1000 } };
    const { loginWithCode } = await import("../sync");
    const { loadSettings } = await import("../api");
    await loginWithCode("ABCD-EFGH");
    const s = loadSettings();
    expect(s.followedTeams).toEqual(["HLE", "KT"]);
    expect(s.followedPlayers).toEqual(["Zeka"]);
    expect(s.followedLeagues).toEqual(["lck"]);
    expect(s.followedRegions).toEqual(["KOREA"]);
    expect(sent?.follows).toBeUndefined(); // nothing pushed back over the account
  });

  it("a device with its own follows still keeps both sides, and the old list can be put back", async () => {
    server = { follows: { v: account, t: 1000 } };
    const api = await import("../api");
    api.saveSettings({ ...api.loadSettings(), followedTeams: ["G2"] });
    const { loginWithCode, followBackups, restoreFollows } = await import("../sync");
    await loginWithCode("ABCD-EFGH");
    expect(api.loadSettings().followedTeams).toEqual(["HLE", "KT", "G2"]);
    expect(api.loadSettings().followedPlayers).toEqual(["Zeka"]); // players were still the starting list
    expect(followBackups()[0].follows.teams).toEqual(["G2"]);
    restoreFollows(0);
    expect(api.loadSettings().followedTeams).toEqual(["G2"]);
  });
});
