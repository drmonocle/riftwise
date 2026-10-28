/**
 * "Your matches in your calendar": a calendar feed of the followed teams' and leagues' matches
 * (riftwise.gg/calendar.ics, server/pages/calendar.go). Calendar apps re-read it every few hours, so new matches
 * and changed times arrive by themselves, unlike the one-match "Add to calendar" buttons.
 */
import React, { useState } from "react";
import { CalendarPlus, Copy, Check } from "lucide-react";
import { AppSettings } from "../types";
import { tl } from "../i18n";
import { SITE_URL } from "../platform";

export function calendarFeedUrl(settings: Pick<AppSettings, "followedTeams" | "followedLeagues">): string {
  const q = new URLSearchParams();
  if (settings.followedTeams.length) q.set("teams", settings.followedTeams.join(","));
  if (settings.followedLeagues.length) q.set("leagues", settings.followedLeagues.join(","));
  const s = q.toString();
  return `${SITE_URL}calendar.ics${s ? `?${s}` : ""}`;
}

export const CalendarFeed: React.FC<{ settings: AppSettings; onOpenUrl?: (url: string) => void }> = ({ settings, onOpenUrl }) => {
  const [copied, setCopied] = useState(false);
  const https = calendarFeedUrl(settings);
  const webcal = https.replace(/^https:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const open = (url: string) => (e: React.MouseEvent) => {
    if (!onOpenUrl) return;
    e.preventDefault();
    onOpenUrl(url);
  };
  const btn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-8 rounded border border-rw-border bg-rw-bg text-rw-text hover:border-rw-accent text-[11px]";
  return (
    <div className="p-3 rounded-lg bg-rw-panel border border-rw-border space-y-2">
      <div className="flex items-center gap-2 font-bold text-rw-accent uppercase tracking-wider text-[11px]">
        <CalendarPlus className="w-3.5 h-3.5 text-rw-teal" />
        {tl("Your matches in your calendar")}
      </div>
      <p className="text-[11px] text-rw-sub">
        {settings.followedTeams.length + settings.followedLeagues.length
          ? tl("Every match of the teams and leagues you follow, kept up to date by your calendar app (new matches and time changes arrive by themselves).")
          : tl("Follow teams or leagues first; until then the calendar has every match.")}
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={webcal} onClick={open(webcal)} className={btn}>
          <CalendarPlus className="w-3.5 h-3.5" />
          {tl("Subscribe (Apple, Outlook)")}
        </a>
        <a href={google} target="_blank" rel="noopener noreferrer" onClick={open(google)} className={btn}>
          <CalendarPlus className="w-3.5 h-3.5" />
          {tl("Google Calendar")}
        </a>
        <button
          type="button"
          className={btn}
          onClick={() => {
            navigator.clipboard
              ?.writeText(https)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              })
              .catch(() => {});
          }}
          title={https}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? tl("Copied") : tl("Copy the calendar link")}
        </button>
      </div>
    </div>
  );
};
