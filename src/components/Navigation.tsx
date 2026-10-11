import React from "react";
import { Radio, Calendar, Flame, Star, Newspaper, Settings, BarChart3 } from "lucide-react";

export type TabKey = "live" | "schedule" | "stats" | "stream" | "watchlist" | "news" | "settings";

interface NavigationProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  liveCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, liveCount }) => {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      key: "live",
      label: "Live Matches",
      icon: <Flame className="w-4 h-4" />,
      badge: liveCount > 0 ? liveCount : undefined,
    },
    { key: "schedule", label: "Schedule", icon: <Calendar className="w-4 h-4" /> },
    { key: "stats", label: "Stats", icon: <BarChart3 className="w-4 h-4" /> },
    { key: "stream", label: "24/7 Stream", icon: <Radio className="w-4 h-4" /> },
    { key: "watchlist", label: "Watchlist", icon: <Star className="w-4 h-4" /> },
    { key: "news", label: "Dispatch", icon: <Newspaper className="w-4 h-4" /> },
    { key: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <nav className="bg-[#091428] border-b border-[#1e282d] px-2 sm:px-4 flex items-center gap-1 select-none overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap flex-shrink-0 border-b-2 transition-all relative ${
              isActive
                ? "border-[#c8aa6e] text-[#c8aa6e] bg-[#0c1829]"
                : "border-transparent text-[#7e8e9f] hover:text-[#f0e6d2] hover:bg-[#0c1829]/50"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="bg-[#e84057] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full animate-pulse">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
