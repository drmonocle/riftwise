import { describe, it, expect, beforeEach, vi } from "vitest";
import { importMovedSettings, autoMove, movedHere, MOVE_KEYS } from "../move";

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
let went: string | null;
function at(url: string, ua = "Mozilla/5.0 Chrome/140") {
  const u = new URL(url);
  replaced = null;
  went = null;
  vi.stubGlobal("window", {
    location: { hostname: u.hostname, hash: u.hash, pathname: u.pathname, search: u.search, replace: (to: string) => (went = to) },
    history: { replaceState: (_s: unknown, _t: string, to: string) => (replaced = to) },
  });
  vi.stubGlobal("navigator", { userAgent: ua, webdriver: false });
}

describe("settings come over from lolworlds.com/riftwise by themselves", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
  });

  it("a first visit goes to fetch them, keeping the page it was on", () => {
    at("https://riftwise.gg/team/t1?p=y2026#match/123");
    expect(autoMove()).toBe(true);
    expect(went).toBe("https://lolworlds.com/riftwise/move.html?to=" + encodeURIComponent("/team/t1?p=y2026#match/123"));
    // only once per browser
    expect(autoMove()).toBe(false);
  });

  it("saves what came back, sign-in included, and puts the address back", () => {
    const settings = JSON.stringify({ followedTeams: ["T1", "GEN"], language: "ko", theme: "classic" });
    at("https://riftwise.gg/team/t1#import=" + pack({ riftwatch_settings: settings, riftwatch_sync_token: "tok", other: "x" }) + "&h=" + encodeURIComponent("#match/123"));
    importMovedSettings();
    expect(localStorage.getItem("riftwatch_settings")).toBe(settings);
    expect(localStorage.getItem("riftwatch_sync_token")).toBe("tok");
    expect(localStorage.getItem("other")).toBeNull();
    expect(replaced).toBe("/team/t1#match/123");
    expect(movedHere()).toBe(true);
    expect(autoMove()).toBe(false);
  });

  it("nothing saved there: no note, and no second trip", () => {
    at("https://riftwise.gg/#import=none&h=");
    importMovedSettings();
    expect(replaced).toBe("/");
    expect(movedHere()).toBe(false);
    expect(autoMove()).toBe(false);
  });

  it("leaves search engines, other addresses and set-up browsers alone", () => {
    at("https://riftwise.gg/team/t1", "Mozilla/5.0 (compatible; Googlebot/2.1)");
    expect(autoMove()).toBe(false);
    at("http://localhost:4174/");
    expect(autoMove()).toBe(false);
    at("https://riftwise.gg/");
    localStorage.setItem("riftwatch_settings", "{}");
    expect(autoMove()).toBe(false);
    expect(went).toBeNull();
  });

  it("ignores a broken address", () => {
    at("https://riftwise.gg/#import=%%%");
    importMovedSettings();
    expect(localStorage.getItem("riftwatch_settings")).toBeNull();
    expect(MOVE_KEYS).toContain("riftwatch_sync_token");
  });
});
