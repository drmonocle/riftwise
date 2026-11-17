import { describe, expect, it } from "vitest";
import { champAgg } from "../hub/champAgg";
import { buildCounterRows } from "../components/hub/CountersPage";
import { PLAYER_METRICS, TEAM_METRICS } from "../components/hub/Ranks";
import { computeRatingChange, computeRatingTrend } from "../components/hub/RankingsPage";
import type { ChampGame, EventPlayer, EventTeamStats, HubChamp, HubMatchups } from "../hub/types";

const mkGame = (patch: string, min: number, bluePicks: ChampGame[5], redPicks: ChampGame[6]): ChampGame => [
  "2026-10-15 12:00",
  patch,
  0,
  1,
  min,
  bluePicks,
  redPicks,
  [],
  [],
  1,
];

describe("champAgg per-metric denominators & legacy zero guard", () => {
  it("treats untracked zero gold/dmg/cs as null rather than zero", () => {
    const { rows } = champAgg(
      [
        mkGame(
          "1.14",
          30,
          [["Ahri", 2, 4, 1, 5, 0, 0, 0]],
          [["Orianna", 2, 1, 4, 2, 210, 0, 0]],
        ),
      ],
      {},
    );
    const ahri = rows.find((r) => r.c === "Ahri")!;
    const ori = rows.find((r) => r.c === "Orianna")!;
    expect(ahri.csm).toBeNull();
    expect(ahri.gpm).toBeNull();
    expect(ahri.dpm).toBeNull();
    expect(ori.csm).toBe(7.0);
    expect(ori.gpm).toBeNull();
    expect(ori.dpm).toBeNull();
  });

  it("keeps legitimate 0 CS support games when gold/dmg exist and isolates missing dmg minutes", () => {
    const { rows } = champAgg(
      [
        mkGame(
          "26.20",
          30,
          [
            ["Ahri", 2, 5, 1, 7, 270, 13500, 21000],
            ["Yuumi", 4, 0, 1, 10, 0, 9000, 6000],
          ],
          [["Orianna", 2, 1, 5, 2, 240, 10500, 0]],
        ),
        mkGame(
          "26.20",
          30,
          [["Ahri", 2, 3, 2, 4, 240, 12000, 0]],
          [["Orianna", 2, 2, 3, 1, 210, 9000, 12000]],
        ),
      ],
      {},
    );
    const ahri = rows.find((r) => r.c === "Ahri")!;
    const yuumi = rows.find((r) => r.c === "Yuumi")!;
    // Ahri has CS & gold across 60m, but dmg only in Game 1 (30m) — DPM must divide by 30m, not 60m.
    expect(ahri.csm).toBe(8.5);
    expect(ahri.gpm).toBe(425);
    expect(ahri.dpm).toBe(700);
    // Support with 0 CS still counts 0.0 CS/M because gold and dmg telemetry are present.
    expect(yuumi.csm).toBe(0);
    expect(yuumi.gpm).toBe(300);
    expect(yuumi.dpm).toBe(200);
  });
});

describe("buildCounterRows lane telemetry & span handling", () => {
  const mkBundle = (): { m: HubMatchups; ch: HubChamp } => ({
    m: {
      c: "Ahri",
      g: 25,
      vs: [
        ["Azir", 2, 12, 8, 220],
        ["Syndra", 2, 2, 2, -50],
      ],
    },
    ch: {
      name: "Ahri",
      u: "ahri",
      p: 25,
      w: 15,
      b: 5,
      roles: [{ r: "Mid", p: 25 }],
      matchups: {
        Mid: [["Azir", 12, 8, 10, 220, 4.5, 310, 7]],
      },
      matchups12: {
        Mid: [["Azir", 4, 3, 4, 180, 3.2, 240, 3]],
      },
    } as unknown as HubChamp,
  });

  it("merges ch.matchups telemetry with low-sample m.vs rows on All time without duplicating", () => {
    const rows = buildCounterRows(mkBundle(), { span: "all", minG: 1 });
    expect(rows).toHaveLength(2);
    const azir = rows.find((r) => r.c === "Azir")!;
    const syndra = rows.find((r) => r.c === "Syndra")!;
    expect(azir.csd).toBe(4.5);
    expect(azir.xpd).toBe(310);
    expect(azir.lane).toBe(70);
    expect(syndra.g).toBe(2);
    expect(syndra.xpd).toBeUndefined();
  });

  it("uses matchups12 on 12m span without falling back to all-time m.vs when filtered out", () => {
    const bundle = mkBundle();
    expect(buildCounterRows(bundle, { span: "12m", minG: 2 })).toEqual([
      { c: "Azir", role: 2, g: 4, w: 3, gd: 180, csd: 3.2, xpd: 240, lane: 75 },
    ]);
    // Syndra only appeared in m.vs (all time), not in the last 12 months.
    expect(buildCounterRows(bundle, { span: "12m", oppQuery: "Syndra" })).toEqual([]);
    // Only when matchups12 is completely absent does 12m fall back to m.vs.
    const legacyRows = buildCounterRows({ m: bundle.m, ch: null }, { span: "12m", minG: 2 });
    expect(legacyRows.map((r) => r.c)).toEqual(["Azir", "Syndra"]);
  });
});

describe("Ranks legacy zero guard and RankingsPage asOf trend clamping", () => {
  it("guards untracked 0 CSM and team GDM on legacy seasons while keeping tracked 0 CS supports", () => {
    const csm = PLAYER_METRICS.find((m) => m.key === "csm")!;
    const gdm = TEAM_METRICS.find((m) => m.key === "gdm")!;
    const basePlayer = {
      n: "A", r: "Mid", t: "T1", g: 4, w: 3, k: 12, d: 4, a: 16, tk: 40, tdth: 20,
      min: 120, cs: 0, dmg: 0, gold: 0, vis: 0, vmin: 0,
    } as unknown as EventPlayer;
    expect(csm.value(basePlayer)).toBeNull();
    expect(csm.value({ ...basePlayer, gold: 32000, dmg: 18000 })).toBe(0);

    const baseTeam = { t: "T1", g: 4, w: 3, k: 40, d: 20, min: 120, gd: 0, gold: 0 } as unknown as EventTeamStats;
    expect(gdm.value(baseTeam)).toBeNull();
    expect(gdm.value({ ...baseTeam, gold: 240000, gd: 12000 })).toBe(100);
  });

  it("clamps historical ratings sparkline and change strictly to <= asOf", () => {
    const pts: [string, number][] = [
      ["2026-10-18", 1650],
      ["2026-10-25", 1710],
      ["2026-11-10", 1780],
    ];
    // Rewound to 2026-10-25 (rating 1710): must never include 2026-11-10 (1780)
    const rewoundTrend = computeRatingTrend(pts, 1710, "2026-11-16", "2026-10-25");
    expect(rewoundTrend).toEqual([
      ["2026-10-18", 1650],
      ["2026-10-25", 1710],
    ]);
    expect(computeRatingChange(pts, { 5: 1710, 6: 99, 8: "2026-11-16" }, "2026-10-25")).toBe(60);

    // On earliest date with only 1 point, must return null rather than leaking today's r[6]
    expect(computeRatingTrend(pts, 1650, "2026-11-16", "2026-10-18")).toBeNull();
    expect(computeRatingChange(pts, { 5: 1650, 6: 99, 8: "2026-11-16" }, "2026-10-18")).toBeNull();

    // Live view still extends to lastDate if latest rating moved after last snapshot
    expect(computeRatingTrend(pts, 1795, "2026-11-16")).toEqual([...pts, ["2026-11-16", 1795]]);
    expect(computeRatingChange(pts, { 5: 1795, 6: 99, 8: "2026-11-16" })).toBe(145);
  });
});

