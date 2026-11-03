/**
 * The stats menu in one place: the site's top bar (Navigation.tsx), the page row under it on each section page
 * (StatsView), and the page results of the search box. Grouped the way people think: an event, a team, a player, the
 * champions, a tool. Live scores and the schedule are the Matches tab (not a stats group).
 */
import React from "react";
import {
  CalendarRange, ClipboardList, Crosshair, Database, Flag, Flame, GitCompare, Globe, History, Home, Layers, LayoutGrid, ListOrdered, Medal,
  Package, Rows3, Search, Swords, TrendingUp, Trophy, User, Users, Wrench, type LucideIcon,
} from "lucide-react";
import { tk } from "../../i18n";
import type { HubRoute, HubSection } from "../../hub/route";

export interface MenuItem {
  kind: HubSection | "home";
  label: string;
  /** one line on what the page is for (the search box's page results) */
  sub: string;
  icon: React.ReactNode;
  /** more words the search box finds the page by (English; the label in the reader's language counts too) */
  also?: string[];
}
export interface MenuGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: MenuItem[];
}

const ic = (C: LucideIcon) => <C className="w-3.5 h-3.5" />;

export const MENU: MenuGroup[] = [
  { key: "home", label: tk("Home"), icon: ic(Home), items: [{ kind: "home", label: tk("Home"), sub: tk("Every pro League of Legends game, in one place"), icon: ic(Home) }] },
  {
    key: "tournaments",
    label: tk("Tournaments"),
    icon: ic(Trophy),
    items: [
      { kind: "tournaments", label: tk("Tournaments"), sub: tk("Every event since 2011"), icon: ic(CalendarRange), also: ["events", "schedule"] },
      { kind: "worlds", label: tk("Worlds"), sub: tk("Winners, records and region stats"), icon: ic(Globe), also: ["world championship", "pick'em", "pickem", "swiss"] },
      { kind: "msi", label: tk("MSI"), sub: tk("Winners, records and region stats"), icon: ic(Trophy), also: ["mid-season invitational"] },
      { kind: "first-stand", label: tk("First Stand"), sub: tk("Winners, records and region stats"), icon: ic(Flag) },
      { kind: "leagues", label: tk("Leagues"), sub: tk("Every season and its champion"), icon: ic(Layers), also: ["lck", "lpl", "lec", "lcs"] },
      { kind: "weekly", label: tk("This week"), sub: tk("Upsets, ranking movers, records, best games"), icon: ic(CalendarRange), also: ["weekly", "recap", "upsets"] },
      { kind: "best", label: tk("Best games"), sub: tk("Highest-rated games and series"), icon: ic(Flame), also: ["greatest games", "top games", "vod"] },
      { kind: "records", label: tk("Records"), sub: tk("Fastest, longest, best games"), icon: ic(Medal), also: ["fastest game", "longest game", "pentakills"] },
      { kind: "titles", label: tk("Titles"), sub: tk("Every champion, every league"), icon: ic(Trophy), also: ["winners", "champions list", "trophies"] },
    ],
  },
  {
    key: "teams",
    label: tk("Teams"),
    icon: ic(Users),
    items: [
      { kind: "teams", label: tk("Teams"), sub: tk("Every team since 2011, by region"), icon: ic(Users), also: ["all teams", "team list"] },
      { kind: "rankings", label: tk("Power rankings"), sub: tk("Every team, every region, one scale"), icon: ic(TrendingUp), also: ["rankings", "elo", "ratings"] },
    ],
  },
  {
    key: "players",
    label: tk("Players"),
    icon: ic(User),
    items: [
      { kind: "players", label: tk("Players"), sub: tk("Every pro player, by role and team"), icon: ic(User), also: ["all players", "player list", "pros"] },
      { kind: "leaders", label: tk("Leaderboards"), sub: tk("Every player on every stat, by league and role"), icon: ic(ListOrdered), also: ["leaders", "stat leaders", "kda"] },
    ],
  },
  {
    key: "champions",
    label: tk("Champions"),
    icon: ic(Swords),
    items: [
      { kind: "champions", label: tk("Champions"), sub: tk("Pick, ban and win rates"), icon: ic(Swords), also: ["pick rate", "ban rate", "presence"] },
      { kind: "tiers", label: tk("Tier list"), sub: tk("What pros play on each patch, by role"), icon: ic(Rows3), also: ["meta", "pro tier list"] },
      { kind: "counters", label: tk("Counters"), sub: tk("Every pro lane matchup, by champion"), icon: ic(Crosshair), also: ["counter picks", "matchups", "lane matchup"] },
      { kind: "patches", label: tk("Patches"), sub: tk("The pro meta on every patch"), icon: ic(History), also: ["patch", "meta changes"] },
    ],
  },
  {
    key: "tools",
    label: tk("Tools"),
    icon: ic(Wrench),
    items: [
      { kind: "prep", label: tk("Match prep"), sub: tk("Everything before a broadcast"), icon: ic(ClipboardList), also: ["preview", "head to head", "h2h", "caster"] },
      { kind: "draft", label: tk("Draft board"), sub: tk("Plan a draft with both teams' pools"), icon: ic(LayoutGrid), also: ["draft", "pick and ban", "fearless"] },
      { kind: "compare", label: tk("Compare"), sub: tk("Any two teams or players"), icon: ic(GitCompare), also: ["versus", "vs", "head to head"] },
      { kind: "finder", label: tk("Game finder"), sub: tk("Any game by team, champion, player"), icon: ic(Search), also: ["find games", "search games", "csv"] },
      { kind: "items", label: tk("Item history"), sub: tk("Has a pro ever built it?"), icon: ic(Package), also: ["items", "item builds", "builds", "built", "build history"] },
      { kind: "data", label: tk("Data"), sub: tk("Download every game (CSV)"), icon: ic(Database), also: ["download", "csv", "json", "api"] },
    ],
  },
];

export const MENU_ITEMS: MenuItem[] = MENU.flatMap((g) => g.items);

/** The group a page belongs to: its own for a menu page; a team's page sits under Teams, a player's under Players, a
 *  tournament, league or match under Tournaments, a champion under Champions. */
export function groupOf(kind: HubRoute["kind"]): MenuGroup | undefined {
  const own = MENU.find((g) => g.items.some((i) => i.kind === kind));
  if (own) return own;
  const key = ({ team: "teams", player: "players", event: "tournaments", league: "tournaments", match: "tournaments", champ: "champions" } as Record<string, string>)[kind];
  return MENU.find((g) => g.key === key);
}

export const pillClass = (on: boolean) =>
  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 whitespace-nowrap ${
    on ? "bg-rw-accent/10 text-rw-accent border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
  }`;
export const subPillClass = (on: boolean) =>
  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 whitespace-nowrap ${
    on ? "bg-rw-raised text-rw-text border-rw-line" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
  }`;
