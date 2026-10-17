import { describe, it, expect, beforeEach, vi } from "vitest";
import { importMovedSettings, offerMove, moveResult, MOVE_KEYS } from "../move";

// What lolworlds.com/riftwise/move.html puts after #import= (base64url of the UTF-8 JSON)
const pack = (o: Record<string, string>) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function storage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

let replaced: string | null;
function at(hash: string) {
  replaced = null;
  vi.stubGlobal("window", {
    location: { hash, pathname: "/", search: "" },
    history: { replaceState: (_s: unknown, _t: string, url: string) => (replaced = url) },
  });
}

describe("bringing settings over from lolworlds.com/riftwise", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
  });

  it("saves the settings it brought and cleans the address", () => {
    const settings = JSON.stringify({ followedTeams: ["T1", "GEN"], language: "ko", theme: "midnight" });
    at("#import=" + pack({ riftwatch_settings: settings, riftwatch_has_launched: "1", riftwatch_sync_token: "secret" }));
    expect(offerMove()).toBe(true);
    importMovedSettings();
    expect(localStorage.getItem("riftwatch_settings")).toBe(settings);
    expect(localStorage.getItem("riftwatch_has_launched")).toBe("1");
    expect(localStorage.getItem("riftwatch_sync_token")).toBeNull(); // sign-in stays behind
    expect(replaced).toBe("/");
    expect(moveResult()).toBe("ok");
    expect(offerMove()).toBe(false);
  });

  it("says so when there was nothing to bring", () => {
    at("#import=none");
    importMovedSettings();
    expect(moveResult()).toBe("none");
    expect(offerMove()).toBe(false);
  });

  it("ignores a broken address and other pages", () => {
    at("#import=%%%");
    importMovedSettings();
    expect(localStorage.getItem("riftwatch_settings")).toBeNull();
    at("#match/123");
    importMovedSettings();
    expect(replaced).toBeNull();
    expect(MOVE_KEYS).toContain("riftwatch_settings");
  });
});
