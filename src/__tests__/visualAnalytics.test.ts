import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { playerPlaystyleTags } from "../components/hub/VisualAnalytics";
import { listCard } from "../components/hub/BroadcastCard";
import type { PlayerAgg } from "../hub/period";

describe("playerPlaystyleTags", () => {
  const baseAgg: PlayerAgg = {
    g: 25,
    w: 18,
    k: 110,
    d: 35,
    a: 140,
    kda: 7.14,
    kp: 71.2,
    csm: 9.2,
    gpm: 445,
    dpm: 690,
    dmgShare: 28.4,
    goldShare: 23.5,
    vsm: 1.4,
    visShare: 14.2,
    champs: Array.from({ length: 15 }, (_, i) => ({
      c: `Champ${i}`,
      g: 2,
      w: 1,
      k: 4,
      d: 1,
      a: 5,
      kda: 9,
      csm: 9,
      dpm: 650,
      gd15: 420,
      csd15: 12,
    })),
    roles: ["Mid"],
    tl: {
      n: 20,
      gd10: 250,
      csd10: 8,
      xpd10: 180,
      gd15: 480,
      csd15: 14,
      xpd15: 320,
      gd20: 620,
      csd20: 18,
      xpd20: 410,
      fbPart: 35.0,
      fbVictim: 5.0,
      wpm: 0.55,
      wcpm: 0.25,
      cw: 3.2,
    },
  };

  it("identifies lane dominance, damage threat, teamfight engine, and low-death anchor", () => {
    const tags = playerPlaystyleTags(baseAgg, "Mid", 60);
    expect(tags.length).toBeGreaterThanOrEqual(4);
    expect(tags.some((t) => t.good === true)).toBe(true);
  });

  it("returns empty array when sample size is too small", () => {
    expect(playerPlaystyleTags({ ...baseAgg, g: 4 }, "Mid", 10)).toEqual([]);
  });
});

describe("listCard", () => {
  it("renders rank badges, note fallback as subtitle, and dual sub + note lines", () => {
    const card = listCard({
      section: "Standings",
      name: "LCK 2026",
      sub: "Regular Season",
      rows: [
        { rank: 1, label: "Gen.G", sub: "GEN", value: "16 - 2", note: "89%" },
        { rank: "#2", label: "Mid: Faker (Ahri)", value: "5/1/8 · 295 CS", note: "T1: Chovy (Orianna) · 2/3/4 · 280 CS" },
      ],
    });
    const html = renderToStaticMarkup(card.body as any);
    expect(html).toContain("#1");
    expect(html).toContain("Gen.G");
    expect(html).toContain("GEN");
    expect(html).toContain("16 - 2");
    expect(html).toContain("89%");
    expect(html).toContain("#2");
    expect(html).toContain("T1: Chovy (Orianna)");
  });
});
