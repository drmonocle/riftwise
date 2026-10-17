import React from "react";
import { Radio, Calendar, Flame, Star, Newspaper, Settings, BarChart3 } from "lucide-react";
import { tl, tc } from "../i18n";

export type TabKey = "live" | "schedule" | "stats" | "stream" | "watchlist" | "news" | "settings";

interface NavigationProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  liveCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, liveCount }) => {
  // short = the label under the icon on phones, where all seven tabs must fit on one row
  const tabs: { key: TabKey; label: string; short: string; icon: React.ReactNode; badge?: number }[] = [
    {
      key: "live",
      label: tl("Live Matches"),
      short: tc("short tab", "Live"),
      icon: <Flame className="w-4 h-4" />,
      badge: liveCount > 0 ? liveCount : undefined,
    },
    { key: "schedule", label: tl("Schedule"), short: tc("short tab", "Games"), icon: <Calendar className="w-4 h-4" /> },
    { key: "stats", label: tl("Stats"), short: tc("short tab", "Stats"), icon: <BarChart3 className="w-4 h-4" /> },
    { key: "stream", label: tl("24/7 Stream"), short: tc("short tab", "24/7"), icon: <Radio className="w-4 h-4" /> },
    { key: "watchlist", label: tl("Watchlist"), short: tc("short tab", "Follow"), icon: <Star className="w-4 h-4" /> },
    { key: "news", label: tl("Dispatch"), short: tc("short tab", "News"), icon: <Newspaper className="w-4 h-4" /> },
    { key: "settings", label: tl("Settings"), short: tc("short tab", "Settings"), icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <nav className="rw-nav border-b border-rw-border sm:px-2 min-[920px]:px-4 flex items-stretch sm:items-center sm:gap-1 select-none sm:overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            aria-label={tab.label}
            className={`flex flex-1 sm:flex-none flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-0.5 sm:px-3 min-[920px]:px-4 py-1.5 sm:py-2.5 text-[10px] sm:text-xs font-semibold sm:tracking-wide whitespace-nowrap min-w-0 border-b-2 transition-all relative ${
              isActive
                ? "border-transparent text-rw-accent rw-tab-active"
                : "border-transparent text-rw-muted hover:text-rw-text hover:bg-rw-surface/50"
            }`}
          >
            {tab.icon}
            <span className="hidden min-[920px]:inline">{tab.label}</span>
            {/* Phones and narrow windows (compact mode) get the short names so all 7 tabs fit */}
            <span className="min-[920px]:hidden truncate max-w-full">{tab.short}</span>
            {tab.badge !== undefined && (
              <span className="absolute top-0.5 right-1 sm:static bg-rw-red text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 rounded-full animate-pulse">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
