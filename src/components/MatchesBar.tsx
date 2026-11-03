/**
 * The row under the header on the Matches pages: live scores, the schedule and results, the teams you follow, and
 * the 24/7 stream (with a dot while it is on air). One place for what used to be four top-level tabs.
 */
import React from "react";
import { Radio, Star } from "lucide-react";
import { tl } from "../i18n";
import type { TabKey } from "./Navigation";

export const MatchesBar: React.FC<{ activeTab: TabKey; onSelectTab: (tab: TabKey) => void; liveCount: number; streamLive: boolean }> = ({
  activeTab,
  onSelectTab,
  liveCount,
  streamLive,
}) => {
  const items: { tab: TabKey; label: string; icon?: React.ReactNode }[] = [
    { tab: "live", label: tl("Live") },
    { tab: "schedule", label: tl("Schedule and results") },
    { tab: "watchlist", label: tl("Watchlist"), icon: <Star className="w-3.5 h-3.5" /> },
    { tab: "stream", label: tl("24/7 stream"), icon: <Radio className={`w-3.5 h-3.5 ${streamLive ? "text-rw-teal" : ""}`} /> },
  ];
  return (
    <nav className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b border-rw-border overflow-x-auto [scrollbar-width:none]" aria-label={tl("Matches")}>
      {items.map((it) => {
        const on = activeTab === it.tab;
        return (
          <button
            key={it.tab}
            type="button"
            onClick={() => onSelectTab(it.tab)}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              on ? "bg-rw-accent/10 text-rw-accent border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
            }`}
          >
            {it.icon}
            {it.label}
            {it.tab === "live" && liveCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rw-red animate-pulse" aria-hidden="true" />}
            {it.tab === "stream" && streamLive && <span className="w-1.5 h-1.5 rounded-full bg-rw-teal animate-pulse" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
};
