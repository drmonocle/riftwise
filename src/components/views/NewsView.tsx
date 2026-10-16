import React from "react";
import { Newspaper, ExternalLink } from "lucide-react";
import { tl, tk } from "../../i18n";

interface NewsViewProps {
  onOpenUrl: (url: string) => void;
}

/** Outlets we link to. Descriptions are general; RiftWatch does not scrape or republish their articles. */
const SOURCES = [
  {
    name: "Riot LoL Esports",
    url: "https://lolesports.com/news",
    blurb: tk("Official announcements, tournament formats, rulebook changes and schedules."),
  },
  {
    name: "Sheep Esports",
    url: "https://www.sheepesports.com",
    blurb: tk("Roster moves, transfer news and industry reporting."),
  },
  {
    name: "Inven Global",
    url: "https://www.invenglobal.com/esports",
    blurb: tk("LCK coverage, interviews and Korean scene reporting in English."),
  },
  {
    name: "Dot Esports",
    url: "https://dotesports.com/league-of-legends",
    blurb: tk("Match recaps, patch and meta coverage."),
  },
] as const;

export const NewsView: React.FC<NewsViewProps> = ({ onOpenUrl }) => (
  <div className="p-4 space-y-4 page-4xl overflow-y-auto h-full select-none">
    <div className="pb-1 border-b border-[#1e282d]">
      <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-1.5">
        <Newspaper className="w-3.5 h-3.5 text-[#0ac8b9]" />
        {tl("News Sources")}
      </h2>
      <div className="text-[11px] text-[#7e8e9f] mt-0.5">
        {tl("Links to LoL Esports outlets. RiftWatch does not show live headlines here.")}
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      {SOURCES.map((s) => (
        <button
          key={s.name}
          onClick={() => onOpenUrl(s.url)}
          className="text-left bg-[#0a1420] border border-[#1e282d] hover:border-[#c8aa6e] p-4 rounded-lg transition-all group"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-sm font-bold text-[#f0e6d2] group-hover:text-[#c8aa6e] transition-colors">
              {s.name}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-[#0ac8b9]" />
          </div>
          <p className="text-xs text-[#7e8e9f] leading-relaxed">{tl(s.blurb)}</p>
        </button>
      ))}
    </div>
  </div>
);
