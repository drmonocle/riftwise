/**
 * Which item of the top bar a stats page belongs to. Kept apart from menu.tsx so the header, which loads with the
 * app, doesn't bring the menu's icons (they come with the stats pages). Must say what menu.tsx groupOf says:
 * navigation.test.ts checks every page.
 */
export type NavGroup = "tournaments" | "teams" | "players" | "champions" | "tools";

export const NAV_GROUP: Record<string, NavGroup> = {
  tournaments: "tournaments",
  worlds: "tournaments",
  msi: "tournaments",
  "first-stand": "tournaments",
  leagues: "tournaments",
  weekly: "tournaments",
  best: "tournaments",
  records: "tournaments",
  titles: "tournaments",
  event: "tournaments",
  league: "tournaments",
  match: "tournaments",
  teams: "teams",
  rankings: "teams",
  team: "teams",
  players: "players",
  leaders: "players",
  player: "players",
  champions: "champions",
  tiers: "champions",
  counters: "champions",
  patches: "champions",
  champ: "champions",
  prep: "tools",
  draft: "tools",
  compare: "tools",
  finder: "tools",
  items: "tools",
  data: "tools",
};
