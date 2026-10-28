/**
 * The stats menu in one place: its groups and pages (the menu rows in StatsView, the All pages panel, and the page
 * results of the search box). Grouped by what a fan comes for: what happened lately, an event, a team or player, the
 * champions, a tool.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  CalendarRange, ChevronDown, ClipboardList, Crosshair, Database, Flag, Flame, GitCompare, Globe, History, Home, Layers, LayoutGrid,
  ListOrdered, Medal, Menu, Package, Rows3, Search, Sparkles, Swords, TrendingUp, Trophy, User, Users, Wrench, X, type LucideIcon,
} from "lucide-react";
import { tk, tl } from "../../i18n";
import type { HubRoute, HubSection } from "../../hub/route";
import { HubLink } from "./ui";

export interface MenuItem {
  kind: HubSection | "home";
  label: string;
  /** one line on what the page is for (the All pages panel) */
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
    key: "highlights",
    label: tk("Highlights"),
    icon: ic(Sparkles),
    items: [
      { kind: "weekly", label: tk("This week"), sub: tk("Upsets, ranking movers, records, best games"), icon: ic(CalendarRange), also: ["weekly", "recap", "upsets"] },
      { kind: "best", label: tk("Best games"), sub: tk("Highest-rated games and series"), icon: ic(Flame), also: ["greatest games", "top games", "vod"] },
      { kind: "records", label: tk("Records"), sub: tk("Fastest, longest, best games"), icon: ic(Medal), also: ["fastest game", "longest game", "pentakills"] },
      { kind: "titles", label: tk("Titles"), sub: tk("Every champion, every league"), icon: ic(Trophy), also: ["winners", "champions list", "trophies"] },
    ],
  },
  {
    key: "events",
    label: tk("Events"),
    icon: ic(Globe),
    items: [
      { kind: "worlds", label: tk("Worlds"), sub: tk("Winners, records and region stats"), icon: ic(Globe), also: ["world championship", "pick'em", "pickem", "swiss"] },
      { kind: "msi", label: tk("MSI"), sub: tk("Winners, records and region stats"), icon: ic(Trophy), also: ["mid-season invitational"] },
      { kind: "first-stand", label: tk("First Stand"), sub: tk("Winners, records and region stats"), icon: ic(Flag) },
      { kind: "tournaments", label: tk("Tournaments"), sub: tk("Every event since 2011"), icon: ic(CalendarRange), also: ["events", "schedule"] },
      { kind: "leagues", label: tk("Leagues"), sub: tk("Every season and its champion"), icon: ic(Layers), also: ["lck", "lpl", "lec", "lcs"] },
    ],
  },
  {
    key: "people",
    label: tk("Teams & players"),
    icon: ic(Users),
    items: [
      { kind: "rankings", label: tk("Rankings"), sub: tk("Every team, every region, one scale"), icon: ic(TrendingUp), also: ["power rankings", "elo", "ratings"] },
      { kind: "teams", label: tk("Teams"), sub: tk("Every team since 2011, by region"), icon: ic(Users), also: ["all teams", "team list"] },
      { kind: "players", label: tk("Players"), sub: tk("Every pro player, by role and team"), icon: ic(User), also: ["all players", "player list", "pros"] },
      { kind: "leaders", label: tk("Leaderboards"), sub: tk("Every player on every stat, by league and role"), icon: ic(ListOrdered), also: ["leaders", "stat leaders", "kda"] },
      { kind: "compare", label: tk("Compare"), sub: tk("Any two teams or players"), icon: ic(GitCompare), also: ["versus", "vs", "head to head"] },
    ],
  },
  {
    key: "champs",
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
      { kind: "finder", label: tk("Game finder"), sub: tk("Any game by team, champion, player"), icon: ic(Search), also: ["find games", "search games", "csv"] },
      { kind: "items", label: tk("Item history"), sub: tk("Has a pro ever built it?"), icon: ic(Package), also: ["items", "item builds", "builds", "built", "build history"] },
      { kind: "data", label: tk("Data"), sub: tk("Download every game (CSV)"), icon: ic(Database), also: ["download", "csv", "json", "api"] },
    ],
  },
];

export const MENU_ITEMS: MenuItem[] = MENU.flatMap((g) => g.items);

/** The group a page belongs to: its own for a menu page; a team's or player's page sits under Teams & players, a
 *  tournament, league or match under Events, a champion under Champions. */
export function groupOf(kind: HubRoute["kind"]): MenuGroup | undefined {
  const own = MENU.find((g) => g.items.some((i) => i.kind === kind));
  if (own) return own;
  const key = ({ team: "people", player: "people", event: "events", league: "events", match: "events", champ: "champs" } as Record<string, string>)[kind];
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

/**
 * "All pages": every stats page in one panel, grouped, with a line on each. The phone's whole menu (one button
 * instead of a sideways row that hid most groups), and one click to anything on a wide screen.
 * `current`: the open page's name, shown on the phone's button.
 */
export const AllPagesMenu: React.FC<{ kind: HubRoute["kind"]; current?: string; phone?: boolean }> = ({ kind, current, phone }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    // wide screens: the panel opens under the whole menu row (the row is its positioned parent), not from the button,
    // which sits at the row's end and would push the panel off the screen
    <div ref={box} className={phone ? "relative flex-1 min-w-0" : ""}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={
          phone
            ? "w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rw-accent/60 bg-rw-accent/10 text-xs font-semibold text-rw-text min-w-0"
            : `${pillClass(open)} border-dashed`
        }
      >
        {open ? <X className="w-3.5 h-3.5 shrink-0" /> : <Menu className="w-3.5 h-3.5 shrink-0" />}
        {phone ? (
          <>
            <span className="truncate">{current || tl("All pages")}</span>
            <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </>
        ) : (
          tl("All pages")
        )}
      </button>
      {open && (
        <div
          className={`absolute z-40 top-full mt-1 left-0 right-0 bg-rw-surface border border-rw-accent/40 rounded-lg shadow-2xl p-3 grid gap-x-5 gap-y-3 text-xs overflow-y-auto max-h-[75vh] ${
            phone ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
          }`}
          role="menu"
        >
          {MENU.filter((g) => g.key !== "home").map((g) => (
            <div key={g.key} className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-rw-muted mb-1">
                {g.icon}
                {tl(g.label)}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((i) => (
                  <li key={i.kind}>
                    <HubLink
                      to={{ kind: i.kind } as HubRoute}
                      onNavigate={() => setOpen(false)}
                      className={`block rounded px-1.5 py-1 min-w-0 ${i.kind === kind ? "bg-rw-accent/15 text-rw-accent" : "text-rw-text hover:bg-rw-raised"}`}
                    >
                      <span className="flex items-center gap-1.5 font-semibold">
                        <span className="text-rw-accent shrink-0">{i.icon}</span>
                        {tl(i.label)}
                      </span>
                      {!phone && <span className="block text-[10px] text-rw-muted leading-snug">{tl(i.sub)}</span>}
                    </HubLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="col-span-full border-t border-rw-border pt-2 flex flex-wrap gap-x-4 gap-y-1">
            <HubLink to={{ kind: "home" }} onNavigate={() => setOpen(false)} className="inline-flex items-center gap-1 text-rw-teal hover:underline">
              <Home className="w-3 h-3" /> {tl("Stats home")}
            </HubLink>
            <HubLink to={{ kind: "about" }} onNavigate={() => setOpen(false)} className="text-rw-sub hover:text-rw-accent hover:underline">
              {tl("How we count")}
            </HubLink>
          </div>
        </div>
      )}
    </div>
  );
};
