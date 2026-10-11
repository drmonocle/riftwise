import { describe, expect, it } from "vitest";
import { streamPhase, streamEventTitle } from "../helpers";
import { StreamEvent } from "../types";

const H = 60 * 60 * 1000;
const t0 = Date.parse("2026-10-14T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const match = (id: string, at: number, extra: Partial<StreamEvent> = {}): StreamEvent => ({
  id, type: "match", event: "Worlds", season: "S15 (2025)", stage: "Finals", team1: "T1", team2: "KT",
  rawTime: "", utcIso: iso(at), ...extra,
});
const special = (id: string, name: string, at: number): StreamEvent => ({
  id, type: "special", name, event: "Worlds", season: "S15 (2025)", rawTime: "", utcIso: iso(at),
});

describe("24/7 stream phase", () => {
  const schedule = [match("a", t0 - 2 * H), match("b", t0 + 1 * H), special("end", "End", t0 + 4 * H)];

  it("is airing while a match is on", () => {
    const p = streamPhase(schedule, null, t0);
    expect(p.kind).toBe("airing");
    if (p.kind === "airing") {
      expect(p.current.id).toBe("a");
      expect(p.next?.id).toBe("b");
    }
  });

  it("goes on break once the playlist's End marker has passed", () => {
    const p = streamPhase(schedule, null, t0 + 5 * H);
    expect(p.kind).toBe("break");
    if (p.kind === "break") expect(p.lastAired?.id).toBe("b");
  });

  it("is on break when the next marathon is more than a day away", () => {
    const future = [...schedule, match("fs", t0 + 120 * 24 * H, { event: "First Stand", season: "S16 (2026)" })];
    const p = streamPhase(future, null, t0 + 5 * H);
    expect(p.kind).toBe("break");
    if (p.kind === "break") expect(p.next?.id).toBe("fs");
  });

  it("is only a short pause when the next match is within a day", () => {
    const gap = [special("end", "End", t0 - H), match("c", t0 + 3 * H)];
    expect(streamPhase(gap, null, t0).kind).toBe("between");
  });

  it("follows the owner's status note", () => {
    expect(streamPhase(schedule, { onBreak: true }, t0).kind).toBe("break");
    const far = [match("fs", t0 + 30 * 24 * H)];
    expect(streamPhase(far, { onBreak: false }, t0).kind).toBe("between");
  });

  it("formats event titles with the year", () => {
    expect(streamEventTitle(match("x", t0))).toBe("Worlds 2025");
  });
});
