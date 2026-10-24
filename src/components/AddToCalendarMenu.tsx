import React, { useState, useRef, useEffect } from "react";
import { Match } from "../types";
import { CalendarPlus, Calendar, Download, ExternalLink } from "lucide-react";
import { tl } from "../i18n";

interface AddToCalendarMenuProps {
  match: Match;
  onOpenUrl: (url: string) => void;
  compact?: boolean;
}

function formatGoogleDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export const AddToCalendarMenu: React.FC<AddToCalendarMenuProps> = ({
  match,
  onOpenUrl,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!match.startTimeUtc) return null;

  const startDate = new Date(match.startTimeUtc);
  if (isNaN(startDate.getTime())) return null;

  // Estimate duration: Bo1 = 60m, Bo3 = 150m, Bo5 = 240m
  const durationMinutes = match.bestOf === 1 ? 60 : match.bestOf === 5 ? 240 : 150;
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const title = `[LoL] ${match.team1Code} vs ${match.team2Code} (${match.leagueName})`;
  const description = [
    tl("League of Legends Esports: {a} vs {b}", { a: match.team1Name, b: match.team2Name }),
    tl("League: {league}", { league: `${match.leagueName}${match.blockName ? ` - ${match.blockName}` : ""}` }),
    tl("Format: Best of {n}", { n: match.bestOf }),
    tl("Watch live: {url}", { url: "https://lolesports.com" }),
    tl("Added from RiftWise"),
  ].join("\n");
  const location = "https://lolesports.com";

  // 1. Google Calendar URL
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&dates=${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}&details=${encodeURIComponent(
    description
  )}&location=${encodeURIComponent(location)}`;

  // 2. Outlook Web URL
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(
    title
  )}&startdt=${encodeURIComponent(startDate.toISOString())}&enddt=${encodeURIComponent(
    endDate.toISOString()
  )}&body=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`;

  // 3. Yahoo Calendar URL
  const yahooUrl = `https://calendar.yahoo.com/?v=60&title=${encodeURIComponent(
    title
  )}&st=${formatGoogleDate(startDate)}&et=${formatGoogleDate(endDate)}&desc=${encodeURIComponent(
    description
  )}&in_loc=${encodeURIComponent(location)}`;

  // 4. Apple Calendar / iCal (.ics file download)
  const handleDownloadIcs = (e: React.MouseEvent) => {
    e.stopPropagation();
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//RiftWise//LoL Esports Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:riftwise-${match.matchId || Date.now()}@monocle.gg`,
      `DTSTAMP:${formatGoogleDate(new Date())}`,
      `DTSTART:${formatGoogleDate(startDate)}`,
      `DTEND:${formatGoogleDate(endDate)}`,
      `SUMMARY:${title.replace(/[,;]/g, " ")}`,
      `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
      `LOCATION:${location}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${match.team1Code}_vs_${match.team2Code}_${match.leagueSlug || "lol"}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {compact ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          className={`p-1 max-sm:min-w-9 max-sm:min-h-9 pointer-coarse:min-w-9 pointer-coarse:min-h-9 flex items-center justify-center rounded transition-colors ${
            isOpen
              ? "bg-rw-accent/20 text-rw-accent"
              : "text-rw-sub hover:text-rw-accent hover:bg-rw-border"
          }`}
          title={tl("Add match to Calendar (Google, Apple, Outlook, Yahoo)")}
        >
          <CalendarPlus className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-all ${
            isOpen
              ? "bg-rw-accent/15 border-rw-accent text-rw-accent"
              : "bg-rw-bg border-rw-border hover:border-rw-accent text-rw-text"
          }`}
        >
          <CalendarPlus className="w-3.5 h-3.5 text-rw-accent" />
          <span>{tl("Add to Calendar")}</span>
        </button>
      )}

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-52 rounded-lg bg-rw-surface border border-rw-accent/80 shadow-2xl z-50 py-1 text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-rw-border text-[10px] font-bold text-rw-accent uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            <span>{tl("Select Calendar Type")}</span>
          </div>

          <div className="py-1">
            {/* Google Calendar */}
            <button
              type="button"
              onClick={() => {
                onOpenUrl(googleUrl);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-rw-raised hover:text-rw-teal text-rw-text flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🌐</span>
                <span className="font-medium">{tl("Google Calendar")}</span>
              </div>
              <ExternalLink className="w-3 h-3 text-rw-sub" />
            </button>

            {/* Apple Calendar / iCal (.ics) */}
            <button
              type="button"
              onClick={handleDownloadIcs}
              className="w-full text-left px-3 py-1.5 hover:bg-rw-raised hover:text-rw-teal text-rw-text flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🍏</span>
                <span className="font-medium">{tl("Apple Calendar (.ics)")}</span>
              </div>
              <Download className="w-3 h-3 text-rw-sub" />
            </button>

            {/* Outlook Web */}
            <button
              type="button"
              onClick={() => {
                onOpenUrl(outlookUrl);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-rw-raised hover:text-rw-teal text-rw-text flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">📧</span>
                <span className="font-medium">{tl("Outlook.com / 365")}</span>
              </div>
              <ExternalLink className="w-3 h-3 text-rw-sub" />
            </button>

            {/* Yahoo Calendar */}
            <button
              type="button"
              onClick={() => {
                onOpenUrl(yahooUrl);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-rw-raised hover:text-rw-teal text-rw-text flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🟣</span>
                <span className="font-medium">{tl("Yahoo Calendar")}</span>
              </div>
              <ExternalLink className="w-3 h-3 text-rw-sub" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
