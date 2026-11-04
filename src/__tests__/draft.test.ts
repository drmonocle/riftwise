import { describe, expect, it } from "vitest";
import { assignDraftRoles, computeDraftSuggestions, type Pool } from "../components/hub/DraftPage";
import type { HubChamp } from "../hub/types";

function makeMockPool(opts: {
  picks?: [string, [number, number]][];
  bans?: [string, number][];
  bansVs?: [string, number][];
  roles?: [string, number[]][];
  roleCount?: [string, [number, number, number, number, number]][];
  byPlayer?: Pool["byPlayer"];
}): Pool {
  const players = new Map<string, { name: string; role: number; c: string; g: number; w: number; cg: number; cw: number; ckda: number; kda: number | null; gd15: number | null }[]>();
  for (const pl of opts.byPlayer || []) {
    for (const x of pl.champs) {
      const list = players.get(x.c) || [];
      list.push(x);
      players.set(x.c, list);
    }
  }
  return {
    games: 20,
    picks: new Map(opts.picks || []),
    bans: new Map(opts.bans || []),
    bansVs: new Map(opts.bansVs || []),
    roles: new Map((opts.roles || []).map(([c, rs]) => [c, new Set(rs)])),
    roleCount: new Map(opts.roleCount || []),
    players,
    byPlayer: opts.byPlayer || [],
  };
}

describe("assignDraftRoles", () => {
  it("resolves flex picks into distinct open roles instead of colliding on Mid ×2", () => {
    // Yone played 5 Mid, 3 Top; Ahri played 6 Mid, 0 Top
    const p = makeMockPool({
      picks: [
        ["Yone", [8, 6]],
        ["Ahri", [6, 4]],
      ],
      roles: [
        ["Yone", [0, 2]],
        ["Ahri", [2]],
      ],
      roleCount: [
        ["Yone", [3, 0, 5, 0, 0]],
        ["Ahri", [0, 0, 6, 0, 0]],
      ],
    });
    // Single pick Yone defaults to Mid (2)
    expect(assignDraftRoles(["Yone"], p).get("Yone")).toBe(2);
    // Once Ahri (Mid-only) is also locked, Yone flexes to Top (0) and Ahri takes Mid (2)
    const assigned = assignDraftRoles(["Yone", "Ahri"], p);
    expect(assigned.get("Yone")).toBe(0);
    expect(assigned.get("Ahri")).toBe(2);
  });
});

describe("computeDraftSuggestions", () => {
  const me = makeMockPool({
    picks: [
      ["Ahri", [8, 6]],
      ["Orianna", [7, 5]],
      ["Vi", [6, 4]],
      ["Rumble", [5, 4]],
    ],
    roles: [
      ["Ahri", [2]],
      ["Orianna", [2]],
      ["Vi", [1]],
      ["Rumble", [0]],
    ],
    roleCount: [
      ["Ahri", [0, 0, 8, 0, 0]],
      ["Orianna", [0, 0, 7, 0, 0]],
      ["Vi", [0, 6, 0, 0, 0]],
      ["Rumble", [5, 0, 0, 0, 0]],
    ],
  });

  const them = makeMockPool({
    picks: [
      ["Azir", [10, 8]],
      ["Sejuani", [8, 6]],
      ["Ksante", [6, 4]],
      ["Rell", [5, 4]],
    ],
    roles: [
      ["Azir", [2]],
      ["Sejuani", [1]],
      ["Ksante", [0]],
      ["Rell", [4]],
    ],
    roleCount: [
      ["Azir", [0, 0, 10, 0, 0]],
      ["Sejuani", [0, 8, 0, 0, 0]],
      ["Ksante", [6, 0, 0, 0, 0]],
      ["Rell", [0, 0, 0, 0, 5]],
    ],
    byPlayer: [
      {
        name: "Chovy",
        u: "chovy",
        role: 2,
        full: true,
        champs: [{ name: "Chovy", role: 2, c: "Azir", g: 10, w: 8, cg: 50, cw: 38, ckda: 5, kda: 6, gd15: 300 }],
      },
      {
        name: "Canyon",
        u: "canyon",
        role: 1,
        full: true,
        champs: [{ name: "Canyon", role: 1, c: "Sejuani", g: 8, w: 6, cg: 40, cw: 28, ckda: 4.5, kda: 5, gd15: 150 }],
      },
      {
        name: "Kiin",
        u: "kiin",
        role: 0,
        full: true,
        champs: [{ name: "Kiin", role: 0, c: "Ksante", g: 6, w: 4, cg: 35, cw: 24, ckda: 4, kda: 4, gd15: 120 }],
      },
    ],
  });

  it("recommends top opponent threats in Ban Phase 1 and filters out filled opponent roles in Ban Phase 2", () => {
    const phase1 = computeDraftSuggestions({
      step: 0,
      now: { side: "b", ban: true },
      me,
      them,
      myPicks: [],
      theirPicks: [],
      taken: new Set(),
    });
    expect(phase1[0].c).toBe("Azir");

    // In Ban Phase 2 (step 12), if the opponent already locked Azir (Mid) and Sejuani (Jungle),
    // Phase 2 bans only target remaining open roles (Top Ksante, Support Rell).
    const phase2 = computeDraftSuggestions({
      step: 12,
      now: { side: "b", ban: true },
      me,
      them,
      myPicks: ["Ahri", "Vi", "Rumble"],
      theirPicks: ["Azir", "Sejuani"],
      taken: new Set(["Azir", "Sejuani", "Ahri", "Vi", "Rumble"]),
    });
    expect(phase2.map((x) => x.c)).toEqual(["Ksante", "Rell"]);
  });

  it("boosts lane counter picks when HubChamp matchup data shows a strong @15 gold lead", () => {
    const champMap: Record<string, HubChamp | null> = {
      Azir: {
        c: "Azir",
        g: 100,
        w: 50,
        b: 20,
        kda: 4,
        roles: [{ r: "Mid", g: 100, w: 50, p: 1 }],
        matchups12: {
          // From Azir's perspective, Orianna has -260 GD@15 for Azir (meaning Orianna leads by +260 @15)
          Mid: [["Orianna", 12, 4, 12, -260]],
        },
        players: [],
        teams: [],
        events: [],
        byYear: [],
      } as unknown as HubChamp,
    };
    const picks = computeDraftSuggestions({
      step: 6,
      now: { side: "b", ban: false },
      me,
      them,
      myPicks: [],
      theirPicks: ["Azir"],
      taken: new Set(["Azir"]),
      champMap,
    });
    expect(picks[0].c).toBe("Orianna");
    expect(picks[0].badge).toContain("vs Azir +260");
  });
});
