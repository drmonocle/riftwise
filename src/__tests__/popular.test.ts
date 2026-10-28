import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nameFits } from "../hub/popular";

// The stats home's "Most viewed this week": pages are counted once a day per browser, a few at a time, and a name
// only shows when it is that page's own name.

describe("most viewed names", () => {
  it("takes a name only for its own page", () => {
    expect(nameFits("geng", "Gen.G")).toBe(true);
    expect(nameFits("lyon-2024-american-team", "LYON (2024 American Team)")).toBe(true);
    expect(nameFits("lyon-2024-american-team", "LYON")).toBe(true);
    expect(nameFits("worlds-2024-main-event", "Worlds 2024 Main Event")).toBe(true);
    expect(nameFits("kaisa", "Kai'Sa")).toBe(true);
    expect(nameFits("nunu-and-willump", "Nunu & Willump")).toBe(true);
    expect(nameFits("faker", "Buy cheap coins")).toBe(false);
    expect(nameFits("faker", "")).toBe(false);
    expect(nameFits("kaisa", "카이사")).toBe(false); // a name in another language: champion pages count the English one
  });
});

function storage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("page view counts", () => {
  let sent: { event: string; pages?: { page: string; title: string }[]; person?: boolean }[];
  let listeners: Map<string, (e: Partial<Event>) => void>;
  /** a tap or key press: made by the browser (`isTrusted`) unless `trusted` is false (a script's) */
  const press = (trusted = true) => listeners.get("pointerdown")?.({ type: "pointerdown", isTrusted: trusted });
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    sent = [];
    listeners = new Map();
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("window", {
      location: { pathname: "/stats", search: "", hostname: "riftwise.gg" },
      addEventListener: (type: string, f: (e: Partial<Event>) => void) => void listeners.set(type, f),
      removeEventListener: (type: string) => void listeners.delete(type),
      setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    });
    vi.stubGlobal("location", { hostname: "riftwise.gg" });
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36", webdriver: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("counts a page once a day, a few seconds after it opens", async () => {
    const { countView } = await import("../usage");
    press();
    countView("player/faker", "Faker");
    countView("player/faker", "Faker");
    countView("team/t1", "T1");
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(4000);
    expect(sent).toEqual([{ event: "views", pages: [{ page: "player/faker", title: "Faker" }, { page: "team/t1", title: "T1" }], person: true }]);
    countView("player/faker", "Faker");
    vi.advanceTimersByTime(4000);
    expect(sent.length).toBe(1);
  });

  it("sends 20 pages a time", async () => {
    const { countView } = await import("../usage");
    press();
    for (let i = 0; i < 25; i++) countView(`champ/c${i}`, `C${i}`);
    vi.advanceTimersByTime(4000);
    expect(sent.map((s) => s.pages?.length)).toEqual([20]);
    vi.advanceTimersByTime(4000);
    expect(sent.map((s) => s.pages?.length)).toEqual([20, 5]);
  });

  it("doesn't count test browsers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 HeadlessChrome/141.0", webdriver: false });
    const { countView, countVisit } = await import("../usage");
    press();
    countView("player/faker", "Faker");
    countVisit("rift");
    vi.advanceTimersByTime(4000);
    expect(sent).toEqual([]);
  });

  it("counts a page under its own name, without its tab, and not matches", async () => {
    const { rememberRecent } = await import("../hub/recent");
    press();
    rememberRecent({ kind: "champ", slug: "kaisa" }, "카이사", "Kai'Sa");
    rememberRecent({ kind: "team", slug: "t1", tab: "matches" }, "T1 · Matches");
    rememberRecent({ kind: "match", slug: "worlds-2024-main-event-finals-1" }, "T1 vs BLG");
    vi.advanceTimersByTime(4000);
    expect(sent).toEqual([{ event: "views", pages: [{ page: "champ/kaisa", title: "Kai'Sa" }, { page: "team/t1", title: "T1" }], person: true }]);
  });

  it("counts nothing until the first real tap, click or key press, then what waited", async () => {
    const { countView, countVisit, countSecondPage } = await import("../usage");
    countVisit("rift");
    countView("player/faker", "Faker");
    countSecondPage();
    vi.advanceTimersByTime(60000);
    expect(sent).toEqual([]);
    press(false); // an event a script made
    vi.advanceTimersByTime(4000);
    expect(sent).toEqual([]);
    press();
    expect(sent.map((s) => s.event)).toEqual(["visit", "second"]);
    expect(sent.every((s) => s.person)).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(sent.map((s) => s.event)).toEqual(["visit", "second", "views"]);
    expect(listeners.size).toBe(1); // the input listeners are gone; only pagehide is left
    countVisit("rift");
    countSecondPage();
    expect(sent.length).toBe(3); // once a day
  });

  it("doesn't use up the day's visit when no one pressed anything", async () => {
    let usage = await import("../usage");
    usage.countVisit("rift");
    expect(sent).toEqual([]);
    vi.resetModules(); // the next page load the same day
    listeners = new Map();
    usage = await import("../usage");
    usage.countVisit("light");
    press();
    expect(sent).toEqual([expect.objectContaining({ event: "visit", theme: "light", person: true })]);
  });
});
