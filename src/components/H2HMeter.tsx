import React from "react";
import { Swords } from "lucide-react";
import { HeadToHeadStats } from "../helpers";
import { tl } from "../i18n";

interface H2HMeterProps {
  team1Code: string;
  team2Code: string;
  h2h: HeadToHeadStats;
  /** "sm" fits under a schedule row score; "md" is the full banner with labels. */
  size?: "sm" | "md";
  /** The match this meter sits on (the details view shows the record as of that match). */
  matchId?: string;
  /** False while that match's score is hidden (spoiler mode): its games stay out of the record. */
  countThisMatch?: boolean;
}

export const T1_COLOR = "var(--rw-teal)";
export const T2_COLOR = "var(--rw-red)";

/** Fired when a meter is tapped; App.tsx opens the H2H details view. */
export const OPEN_H2H_EVENT = "riftwatch_open_h2h";
export interface OpenH2HDetail {
  team1Code: string;
  team2Code: string;
  matchId?: string;
  countThisMatch?: boolean;
}

export const H2HBar: React.FC<{ t1Pct: number; className?: string }> = ({ t1Pct, className = "h-1.5" }) => (
  <div className={`flex w-full rounded-full overflow-hidden bg-rw-border ${className}`}>
    <div style={{ width: `${t1Pct}%`, backgroundColor: T1_COLOR }} />
    <div style={{ width: `${100 - t1Pct}%`, backgroundColor: T2_COLOR }} />
  </div>
);

/** Split bar of all-time game wins between two teams. Tap it for the full history. */
export const H2HMeter: React.FC<H2HMeterProps> = ({ team1Code, team2Code, h2h, size = "sm", matchId, countThisMatch = true }) => {
  const total = h2h.team1Wins + h2h.team2Wins;
  const t1Pct = total > 0 ? Math.round((h2h.team1Wins / total) * 100) : 50;
  const summary = tl("All-time head-to-head: {a} {w1}-{w2} {b} ({games} games)", { a: team1Code, w1: h2h.team1Wins, w2: h2h.team2Wins, b: team2Code, games: h2h.totalGames });
  const label = tl("{summary}. Show full history.", { summary });

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    const detail: OpenH2HDetail = { team1Code, team2Code, matchId, countThisMatch };
    window.dispatchEvent(new CustomEvent(OPEN_H2H_EVENT, { detail }));
  };

  if (size === "sm") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={label}
        title={tl("{summary} · tap for history", { summary })}
        className="flex flex-col items-center w-[84px] mt-1 rounded px-0.5 hover:bg-rw-border/60 transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-between w-full text-[9px] font-mono leading-none mb-0.5">
          <span style={{ color: T1_COLOR }}>{h2h.team1Wins}</span>
          <span className="text-rw-muted tracking-wide">H2H</span>
          <span style={{ color: T2_COLOR }}>{h2h.team2Wins}</span>
        </div>
        <H2HBar t1Pct={t1Pct} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={label}
      title={tl("{summary} · tap for history", { summary })}
      className="w-full max-w-xs px-3 py-2 rounded-lg bg-rw-bg border border-rw-accent/40 hover:border-rw-accent transition-colors cursor-pointer text-left"
    >
      <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-rw-accent font-semibold mb-1.5">
        <Swords className="w-3 h-3 text-rw-teal" />
        <span>{tl("All-Time H2H · {games} games", { games: h2h.totalGames })}</span>
      </div>
      <div className="flex items-center gap-2 text-xs font-mono font-bold">
        <span className="whitespace-nowrap" style={{ color: T1_COLOR }}>
          {team1Code} {h2h.team1Wins}
        </span>
        <div className="flex-1">
          <H2HBar t1Pct={t1Pct} />
        </div>
        <span className="whitespace-nowrap" style={{ color: T2_COLOR }}>
          {h2h.team2Wins} {team2Code}
        </span>
      </div>
    </button>
  );
};
