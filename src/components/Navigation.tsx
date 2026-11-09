/**
 * The site's one top bar: Matches (live scores, the schedule, your teams, the 24/7 stream) and the five stats groups
 * (menu.tsx). In the header on wide screens, a sideways row under it on phones. The hub pages open through the
 * router (route.ts); the app's own tabs (settings, news...) are reached from the header's buttons and the footer.
 */
import React from "react";
import { tl } from "../i18n";
import { IS_WEB } from "../platform";
import { HubRoute, hubPath, navigateHub, useHubRoute } from "../hub/route";
import { prefetchHub } from "../hub/data";
import { NAV_GROUP } from "./navGroups";

export type TabKey = "live" | "schedule" | "stats" | "stream" | "watchlist" | "news" | "settings";

/** the app tabs that make up the Matches area */
export const MATCH_TABS: TabKey[] = ["live", "schedule", "watchlist", "stream"];

interface Item {
  key: string;
  label: string;
  /** a stats group's first page */
  route?: HubRoute;
  /** an app tab instead */
  tab?: TabKey;
  on: boolean;
}

export const Navigation: React.FC<{
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  liveCount: number;
  /** the phone row: chips that scroll sideways */
  phone?: boolean;
}> = ({ activeTab, onSelectTab, liveCount, phone }) => {
  const route = useHubRoute();
  const group = activeTab === "stats" ? NAV_GROUP[route.kind] : undefined;
  const items: Item[] = [
    { key: "matches", label: tl("Matches"), tab: "live", on: MATCH_TABS.includes(activeTab) },
    { key: "tournaments", label: tl("Tournaments"), route: { kind: "tournaments" }, on: group === "tournaments" },
    { key: "teams", label: tl("Teams"), route: { kind: "teams" }, on: group === "teams" },
    { key: "players", label: tl("Players"), route: { kind: "players" }, on: group === "players" },
    { key: "champions", label: tl("Champions"), route: { kind: "champions" }, on: group === "champions" },
    { key: "tools", label: tl("Tools"), route: { kind: "prep" }, on: group === "tools" },
  ];
  const cls = (on: boolean) =>
    phone
      ? `flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
          on ? "border-rw-accent bg-rw-accent/10 text-rw-text" : "border-rw-border bg-rw-surface text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
        }`
      : `flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
          on ? "text-rw-text bg-rw-raised rw-tab-active" : "text-rw-sub hover:text-rw-text hover:bg-rw-raised/60"
        }`;
  return (
    <nav className={`flex items-center ${phone ? "gap-1.5 overflow-x-auto [scrollbar-width:none]" : "gap-0.5"}`} aria-label={tl("Main")}>
      {items.map((it) =>
        it.route ? (
          <a
            key={it.key}
            href={IS_WEB ? hubPath(it.route) : "#"}
            onMouseEnter={() => prefetchHub(it.route!)}
            onFocus={() => prefetchHub(it.route!)}
            onClick={(e) => {
              if (IS_WEB && (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0)) return;
              e.preventDefault();
              navigateHub(it.route!);
            }}
            aria-current={it.on ? "page" : undefined}
            className={cls(it.on)}
          >
            {it.label}
          </a>
        ) : (
          <button key={it.key} type="button" onClick={() => onSelectTab(it.tab!)} aria-current={it.on ? "page" : undefined} className={cls(it.on)}>
            {it.label}
            {liveCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-rw-red" title={tl("{n} live now", { n: liveCount })}>
                <span className="w-1.5 h-1.5 rounded-full bg-rw-red animate-pulse" />
                {liveCount}
              </span>
            )}
          </button>
        ),
      )}
    </nav>
  );
};
