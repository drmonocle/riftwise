import { describe, it, expect } from "vitest";
import { isBootsItem, isTrinketItem } from "../hub/ddragon";
import { extractCoreCombos, splitBuildItems, type BuildItemRow } from "../hub/buildPaths";
import type { HubChamp } from "../hub/types";

describe("boots classification", () => {
  it("detects Tier-1, Tier-2, and Season-15/16 Tier-3 boots across punctuation variants", () => {
    expect(isBootsItem("Mercury's Treads")).toBe(true);
    expect(isBootsItem("Plated Steelcaps")).toBe(true);
    expect(isBootsItem("Slightly Magical Footwear")).toBe(true);
    expect(isBootsItem("Crimson Lucidity")).toBe(true);
    expect(isBootsItem("Chainlaced Crushers")).toBe(true);
    expect(isBootsItem("Spellslinger's Shoes")).toBe(true);
    expect(isBootsItem("Boots of Swiftness")).toBe(true);
    expect(isBootsItem("Synchronized Souls")).toBe(true);

    expect(isBootsItem("Essence Reaver")).toBe(false);
    expect(isBootsItem("Infinity Edge")).toBe(false);
    expect(isBootsItem("Control Ward")).toBe(false);
    expect(isBootsItem("")).toBe(false);
    expect(isBootsItem(null)).toBe(false);
    expect(isTrinketItem("Oracle Lens")).toBe(true);
  });
});

describe("splitBuildItems", () => {
  it("separates core (>=30% or min 3), situational, and boots items", () => {
    const items: BuildItemRow[] = [
      ["Black Cleaver", 90, 50],
      ["Sundered Sky", 80, 44],
      ["Mercury's Treads", 70, 38],
      ["Plated Steelcaps", 40, 22],
      ["Guardian Angel", 20, 14],
      ["Sterak's Gage", 15, 9],
      ["Maw of Malmortius", 10, 6],
      ["Oracle Lens", 95, 50],
    ];
    const res = splitBuildItems(items, 100);
    // Top 3 non-boots promoted to core even though Guardian Angel is 20%
    expect(res.core.map((r) => r[0])).toEqual(["Black Cleaver", "Sundered Sky", "Guardian Angel"]);
    expect(res.situational.map((r) => r[0])).toEqual(["Sterak's Gage", "Maw of Malmortius"]);
    expect(res.boots.map((r) => r[0])).toEqual(["Mercury's Treads", "Plated Steelcaps"]);
  });

  it("allows up to 5 core items when >=30% pick rate", () => {
    const items: BuildItemRow[] = [
      ["Item A", 85, 45],
      ["Item B", 75, 40],
      ["Item C", 60, 32],
      ["Item D", 45, 25],
      ["Item E", 35, 18],
      ["Item F", 32, 16],
      ["Item G", 12, 6],
    ];
    const res = splitBuildItems(items, 100);
    expect(res.core).toHaveLength(5);
    expect(res.core.map((r) => r[0])).toEqual(["Item A", "Item B", "Item C", "Item D", "Item E"]);
    expect(res.situational.map((r) => r[0])).toEqual(["Item F", "Item G"]);
  });
});

describe("extractCoreCombos", () => {
  const buildItems: BuildItemRow[] = [
    ["Essence Reaver", 50, 26],
    ["Navori Flickerblade", 40, 21],
    ["Infinity Edge", 30, 18],
    ["Rapid Firecannon", 15, 8],
    ["Trinity Force", 10, 4],
  ];

  const mkGame = (win: number, r: string, it: string[]): HubChamp["recent"][number] => ({
    date: "2026-10-01",
    g: "m-1",
    n: "Peyz",
    u: "peyz",
    team: "T1",
    opp: "Gen.G",
    k: 5,
    d: 1,
    a: 5,
    win,
    en: "Worlds",
    r,
    it,
  });

  it("canonicalizes slot order, strips boots/trinkets, promotes 3-item cores, and filters by role", () => {
    const recent: HubChamp["recent"] = [
      // Slot order shuffled across games, boots included -> should collapse into one 3-item core (3G, 2W)
      mkGame(1, "Bot", ["Infinity Edge", "Mercury's Treads", "Navori Flickerblade", "Essence Reaver", "Oracle Lens"]),
      mkGame(1, "Bot", ["Essence Reaver", "Infinity Edge", "Plated Steelcaps", "Navori Flickerblade"]),
      mkGame(0, "Bot", ["Navori Flickerblade", "Essence Reaver", "Infinity Edge"]),
      // Another ER + Navori game without IE -> makes ER+Navori 2-item pair 4G (distinct from the 3-item trio!)
      mkGame(1, "Bot", ["Navori Flickerblade", "Essence Reaver", "Rapid Firecannon"]),
      // Different build in Mid role -> filtered out when role="Bot"
      mkGame(1, "Mid", ["Trinity Force", "Rapid Firecannon"]),
      mkGame(1, "Mid", ["Trinity Force", "Rapid Firecannon"]),
    ];

    const botCombos = extractCoreCombos(recent, buildItems, { role: "Bot" });
    expect(botCombos).toEqual([
      { items: ["Essence Reaver", "Navori Flickerblade"], g: 4, w: 3 },
      { items: ["Essence Reaver", "Navori Flickerblade", "Infinity Edge"], g: 3, w: 2 },
    ]);

    const midCombos = extractCoreCombos(recent, buildItems, { role: "Mid" });
    expect(midCombos).toEqual([{ items: ["Rapid Firecannon", "Trinity Force"], g: 2, w: 2 }]);
  });

  it("replaces redundant 2-item pair when all games share the exact 3-item core", () => {
    const recent: HubChamp["recent"] = [
      mkGame(1, "Bot", ["Essence Reaver", "Navori Flickerblade", "Infinity Edge"]),
      mkGame(1, "Bot", ["Infinity Edge", "Navori Flickerblade", "Essence Reaver"]),
      mkGame(0, "Bot", ["Navori Flickerblade", "Essence Reaver", "Infinity Edge"]),
    ];
    const combos = extractCoreCombos(recent, buildItems);
    expect(combos).toEqual([{ items: ["Essence Reaver", "Navori Flickerblade", "Infinity Edge"], g: 3, w: 2 }]);
  });
});
