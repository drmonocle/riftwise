import { describe, expect, it } from "vitest";
import { buildSeriesMatrixPlayers } from "../components/hub/SeriesMatrix";
import { buildSwissMatrix } from "../components/hub/SwissProgression";
import {
  collectTeamEventSeries,
  formatTierListMarkdown,
  pickDefaultTierEvent,
  playerId,
  seedItemsByStat,
} from "../components/hub/PlayerTierBuilder";
import { aggregateLinesSplit, collectStageOptions } from "../hub/splits";
import type { EventPlayer, HubEvent, HubSeries, SearchEventRow, Stage } from "../hub/types";
import type { EventLines } from "../hub/worldsFacts";

describe("SeriesMatrix aggregation", () => {
  const sampleSeries: HubSeries = {
    e: "worlds-2026-main-event",
    en: "Worlds 2026 Main Event",
    date: "2026-11-14 19:00",
    stage: "Finals",
    bo: 3,
    w: 1,
    sa: 2,
    sb: 0,
    a: { n: "Gen.G", u: "geng", c: "GEN" },
    b: { n: "Bilibili Gaming", u: "bilibili-gaming", c: "BLG" },
    games: [
      {
        n: 1,
        w: 1,
        blue: "a",
        st: "f",
        min: 30,
        p: [
          { s: 1, n: "Kiin", u: "kiin", r: "Top", c: "K'Sante", pk: 2, k: 3, d: 1, a: 7, cs: 240, gd: 12000, dm: 18000, v: 30, g10: 250, c10: 5, x10: 150, g15: 600, c15: 12, x15: 400 },
          { s: 1, n: "Chovy", u: "chovy", r: "Mid", c: "Azir", pk: 4, k: 6, d: 0, a: 5, cs: 300, gd: 15000, dm: 24000, v: 40 },
          { s: 2, n: "Bin", u: "bin", r: "Top", c: "Jax", pk: 1, k: 1, d: 4, a: 2, cs: 220, gd: 10000, dm: 14000, v: 20, g10: -250, c10: -5, x10: -150, g15: -600, c15: -12, x15: -400 },
          { s: 2, n: "Knight", u: "knight", r: "Mid", c: "Orianna", pk: 3, k: 2, d: 5, a: 1, cs: 260, gd: 12000, dm: 16000, v: 35 },
        ],
      },
      {
        n: 2,
        // Gen.G (a) is now on Red side (`blue: "b"`), but still wins (`w: 1`)
        w: 1,
        blue: "b",
        st: "f",
        min: 25,
        p: [
          { s: 2, n: "Kiin", u: "kiin", r: "Top", c: "Rumble", pk: 5, k: 4, d: 1, a: 6, cs: 210, gd: 11000, dm: 20000, v: 25, g10: 400, c10: 9, x10: 200, g15: 900, c15: 15, x15: 500 },
          { s: 2, n: "Chovy", u: "chovy", r: "Mid", c: "Yone", pk: 6, k: 5, d: 1, a: 4, cs: 250, gd: 13000, dm: 19000, v: 30 },
          { s: 1, n: "Bin", u: "bin", r: "Top", c: "Gnar", pk: 4, k: 1, d: 5, a: 1, cs: 190, gd: 9000, dm: 11000, v: 22 },
          { s: 1, n: "Knight", u: "knight", r: "Mid", c: "Ahri", pk: 2, k: 1, d: 4, a: 1, cs: 210, gd: 10000, dm: 12000, v: 28 },
        ],
      },
    ],
  };

  it("maps players cleanly to series teams even when Blue/Red sides swap across games", () => {
    const all = buildSeriesMatrixPlayers(sampleSeries, "all");
    expect(all.gamesCount).toBe(2);
    expect(all.minTotal).toBe(55);
    expect(all.a.map((p) => p.n)).toEqual(["Kiin", "Chovy"]);
    expect(all.b.map((p) => p.n)).toEqual(["Bin", "Knight"]);

    const kiin = all.a[0];
    expect(kiin.k).toBe(7);
    expect(kiin.d).toBe(2);
    expect(kiin.a).toBe(13);
    expect(kiin.w).toBe(2);
    expect(kiin.g).toBe(2);
    expect(kiin.champs).toEqual(["K'Sante", "Rumble"]);
    expect(kiin.g10).toBe(650);
    expect(kiin.g15).toBe(1500);
    // Team A total deaths = G1 (1) + G2 (2) = 3; Kiin had 2 deaths -> tdth = 3
    expect(kiin.tdth).toBe(3);
  });

  it("keeps single-game pick order (`pk`) when inspecting a specific game", () => {
    const g1 = buildSeriesMatrixPlayers(sampleSeries, 1);
    expect(g1.gamesCount).toBe(1);
    expect(g1.a.find((p) => p.n === "Kiin")?.pk).toBe(2);
    expect(g1.b.find((p) => p.n === "Bin")?.pk).toBe(1);
  });
});

describe("Swiss progression matrix", () => {
  const mkMatch = (g: string, a: string, b: string, sa: number, sb: number, bo = 1) => ({
    g,
    a,
    au: a.toLowerCase(),
    ac: a,
    b,
    bu: b.toLowerCase(),
    bc: b,
    sa,
    sb,
    bo,
    date: "2026-10-20 12:00",
    w: (sa > sb ? 1 : 2) as 1 | 2,
  });

  it("builds chronological R1-R5 records and flags decisive 3W/3L matches", () => {
    const stages: Stage[] = [
      {
        name: "Round 1",
        kind: "list",
        series: [
          mkMatch("r1-1", "T1", "BLG", 1, 0),
          mkMatch("r1-2", "GEN", "HLE", 1, 0),
          mkMatch("r1-3", "G2", "FLY", 1, 0),
          mkMatch("r1-4", "TES", "DK", 0, 1),
        ],
      },
      {
        name: "Round 2",
        kind: "list",
        series: [
          mkMatch("r2-1", "T1", "GEN", 1, 0),
          mkMatch("r2-2", "G2", "DK", 1, 0),
          mkMatch("r2-3", "BLG", "HLE", 1, 0),
          mkMatch("r2-4", "FLY", "TES", 0, 1),
        ],
      },
      {
        name: "Round 3",
        kind: "list",
        series: [
          mkMatch("r3-1", "T1", "G2", 2, 0, 3),
          mkMatch("r3-2", "GEN", "BLG", 1, 0),
          mkMatch("r3-3", "DK", "TES", 1, 0),
          mkMatch("r3-4", "HLE", "FLY", 2, 1, 3),
        ],
      },
      {
        name: "Round 4",
        kind: "list",
        series: [
          mkMatch("r4-1", "G2", "GEN", 0, 2, 3),
          mkMatch("r4-2", "BLG", "DK", 2, 1, 3),
          mkMatch("r4-3", "TES", "HLE", 1, 2, 3),
        ],
      },
      {
        name: "Round 5",
        kind: "list",
        series: [
          mkMatch("r5-1", "G2", "HLE", 1, 2, 3),
        ],
      },
    ];
    const matrix = buildSwissMatrix(stages);
    expect(matrix).not.toBeNull();
    expect(matrix!.rounds).toEqual([1, 2, 3, 4, 5]);
    const t1 = matrix!.rows.find((r) => r.team === "T1")!;
    expect(t1.status).toBe("qualified");
    expect(`${t1.wins}-${t1.losses}`).toBe("3-0");
    expect(t1.cells.get(3)?.decisive).toBe(true);

    const fly = matrix!.rows.find((r) => r.team === "FLY")!;
    expect(fly.status).toBe("eliminated");
    expect(`${fly.wins}-${fly.losses}`).toBe("0-3");
    expect(fly.cells.get(3)?.decisive).toBe(true);

    const hle = matrix!.rows.find((r) => r.team === "HLE")!;
    expect(hle.status).toBe("qualified");
    expect(`${hle.wins}-${hle.losses}`).toBe("3-2");
  });

  it("rejects domestic round-robin leagues with Round 6+", () => {
    const stages: Stage[] = [1, 2, 3, 4, 5, 6].map((n) => ({
      name: `Round ${n}`,
      kind: "list",
      series: [mkMatch(`s-${n}`, "A", "B", 2, 0, 3), mkMatch(`s2-${n}`, "C", "D", 2, 0, 3), mkMatch(`s3-${n}`, "E", "F", 2, 0, 3), mkMatch(`s4-${n}`, "G", "H", 2, 0, 3)],
    }));
    expect(buildSwissMatrix(stages)).toBeNull();
  });
});

describe("Client-side EventLines split aggregation", () => {
  const sampleLines: EventLines = {
    s: [
      ["ev-r1-1", "Round 1", "2026-10-20 12:00", "Gen.G", "geng", "GEN", "Top Esports", "top-esports", "TES", 1, 0, 1],
      ["ev-qf-1", "Quarterfinals", "2026-11-01 12:00", "Gen.G", "geng", "GEN", "Top Esports", "top-esports", "TES", 0, 1, 5],
    ],
    g: [
      // g0: series 0, GEN on Blue (`aOnBlue = 1`), Blue wins (`w = 1`), 30m
      [0, 1, 1, 1, 30, 9, 2, 18, 5, 60000, 48000, 55, 2000, 3, 1, 1, 0, 1, 0, 3, 3, 0, 0, 5, 2, 2, 0, 1, 1, [], []],
      // g1: series 1, GEN on Red (`aOnBlue = 0`), Red wins (`w = 2` -> TES won!), 25m
      [1, 1, 0, 2, 25, 2, 8, 4, 15, 42000, 53000, 50, -1500, 1, 3, 0, 1, 0, 1, 1, 3, 0, 0, 1, 4, 0, 2, 2, 2, [], []],
    ],
    p: [
      [0, 0, "Chovy", "chovy", "Mid", "Azir", 8, 1, 6, 280, 24000, 40, 15000],
      [0, 1, "Creme", "creme", "Mid", "Orianna", 2, 5, 2, 240, 15000, 30, 11000],
      [1, 0, "Chovy", "chovy", "Mid", "Corki", 1, 4, 2, 210, 12000, 25, 10000],
      [1, 1, "Creme", "creme", "Mid", "Sylas", 6, 1, 7, 230, 19000, 35, 14000],
    ],
  };

  it("filters wins vs losses, blue vs red side, and stages accurately", () => {
    const winsOnly = aggregateLinesSplit(sampleLines, { side: "all", outcome: "win", stage: "all" });
    const chovyWin = winsOnly.find((p) => p.n === "Chovy")!;
    expect(chovyWin.g).toBe(1);
    expect(chovyWin.w).toBe(1);
    expect(chovyWin.k).toBe(8);

    const redOnly = aggregateLinesSplit(sampleLines, { side: "red", outcome: "all", stage: "all" });
    const chovyRed = redOnly.find((p) => p.n === "Chovy")!;
    expect(chovyRed.g).toBe(1);
    expect(chovyRed.w).toBe(0);
    expect(chovyRed.c[0]).toBe("Corki");
    expect(chovyRed.nc).toBe(1);

    const koOnly = aggregateLinesSplit(sampleLines, { side: "all", outcome: "all", stage: "__knockout__" });
    expect(koOnly).toHaveLength(2);
    expect(koOnly.find((p) => p.n === "Creme")?.w).toBe(1);
  });

  it("offers Swiss and Knockout group options when both exist", () => {
    const opts = collectStageOptions(["Round 1", "Round 2", "Quarterfinals", "Finals"]);
    expect(opts.slice(0, 2).map((o) => o.value)).toEqual(["__swiss__", "__knockout__"]);
  });
});

describe("PlayerTierBuilder pure helpers", () => {
  it("selects the latest Worlds Main Event as default tournament", () => {
    const rows: SearchEventRow[] = [
      ["LCK 2026 Summer", "", "2026", "LCK", "P", "2026-09-10", 90],
      ["Worlds 2025 Main Event", "", "2025", "World Championship", "P", "2025-11-09", 80],
      ["Worlds 2026 Play-In", "", "2026", "World Championship", "P", "2026-10-18", 22],
      ["Worlds 2026 Main Event", "", "2026", "World Championship", "P", "2026-11-14", 76],
    ];
    expect(pickDefaultTierEvent(rows)).toBe("worlds-2026-main-event");
  });

  it("seeds items across S-D tiers both descending and ascending (lowerIsBetter)", () => {
    const mkP = (n: string, k: number, d: number, tdth: number): EventPlayer => ({
      n,
      u: n.toLowerCase(),
      t: "Team",
      tu: "team",
      r: "Mid",
      g: 5,
      w: 3,
      k,
      d,
      a: 10,
      tk: 50,
      tdth,
      min: 150,
      cs: 1200,
      dmg: 80000,
      gold: 60000,
      vis: 100,
      vmin: 150,
      nc: 3,
      c: ["Ahri"],
      mvp: 0,
    });
    const players = [
      mkP("Best", 30, 2, 100),
      mkP("Good", 20, 4, 100),
      mkP("Mid", 15, 10, 100),
      mkP("Low", 10, 15, 100),
      mkP("Worst", 5, 30, 100),
    ];
    const seededKda = seedItemsByStat(players, playerId, (p) => (p.k + p.a) / Math.max(1, p.d));
    expect(seededKda[playerId(players[0])]).toBe("S");
    expect(seededKda[playerId(players[4])]).toBe("D");

    // Lower DTH% -> Best is S, Worst is D
    const seededDth = seedItemsByStat(players, playerId, (p) => (p.tdth ? p.d / p.tdth : null), true);
    expect(seededDth[playerId(players[0])]).toBe("S");
    expect(seededDth[playerId(players[4])]).toBe("D");
  });

  it("formats Markdown summary and deduplicates team event series", () => {
    const md = formatTierListMarkdown(
      "Worlds 2026 Mid Tier List",
      [
        { bucket: "S", items: [{ name: "Chovy (Gen.G)", sub: "KDA: 8.2" }] },
        { bucket: "A", items: [{ name: "Faker (T1)" }] },
      ],
      "https://riftwise.gg/stats/tiers?mode=players",
    );
    expect(md).toContain("- **S**: Chovy (Gen.G) (KDA: 8.2)");
    expect(md).toContain("- **A**: Faker (T1)");

    const ev: HubEvent = {
      n: "Worlds 2026",
      u: "worlds-2026-main-event",
      op: "",
      stages: [
        {
          name: "Finals",
          kind: "bracket",
          series: [
            { g: "fin-1", a: "Gen.G", au: "geng", ac: "GEN", b: "BLG", bu: "blg", bc: "BLG", sa: 3, sb: 1, bo: 5, w: 1, date: "2026-11-14" },
          ],
        },
        {
          name: "Round 1",
          kind: "list",
          series: [
            { g: "r1-1", a: "T1", au: "t1", ac: "T1", b: "Gen.G", bu: "geng", bc: "GEN", sa: 0, sb: 1, bo: 1, w: 2, date: "2026-10-20" },
            { g: "fin-1", a: "Gen.G", au: "geng", ac: "GEN", b: "BLG", bu: "blg", bc: "BLG", sa: 3, sb: 1, bo: 5, w: 1, date: "2026-11-14" },
          ],
        },
      ],
    };
    const series = collectTeamEventSeries(ev, "Gen.G", "geng");
    expect(series.map((x) => x.row.g)).toEqual(["r1-1", "fin-1"]);
  });
});
