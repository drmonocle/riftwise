/**
 * The Live tab's lists of coming matches as a table: league, the teams, each side's chance to win the series (power
 * rankings), the all-time head-to-head in games, both teams' form (last five series, newest first), best-of, time,
 * and the calendar / Match prep / Overview buttons. Phones get the same as two or three lines a match.
 */
import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { AppSettings, Match } from "../types";
import { tl, tc } from "../i18n";
import { computeHeadToHead } from "../helpers";
import { clickable } from "../a11y";
import { teamForm, useMatchRatings } from "../hub/matchRatings";
import { AddToCalendarMenu } from "./AddToCalendarMenu";
import { MatchPrepButton } from "./MatchPrepButton";
import { MatchOverviewButton } from "./MatchOverviewButton";

const GRID = "sm:grid sm:grid-cols-[5.5rem_minmax(0,1fr)_8.5rem_3.5rem_5.25rem_2.25rem_8.5rem_auto] sm:items-center sm:gap-x-3";

export const UpNextTable: React.FC<{
  matches: Match[];
  schedule: Match[];
  settings: AppSettings;
  onOpenUrl: (url: string) => void;
  onSelectTeam?: (code: string, name?: string) => void;
  /** with it, each team gets its follow star */
  onToggleFollow?: (code: string) => void;
  timeOf: (iso: string) => string;
}> = ({ matches, schedule, settings, onOpenUrl, onSelectTeam, onToggleFollow, timeOf }) => (
  <div className="rounded-lg border border-rw-border bg-rw-surface text-xs divide-y divide-rw-border/70">
    <div className={`hidden ${GRID} px-3 py-1.5 text-[10px] uppercase tracking-wider text-rw-muted`}>
      <span>{tl("League")}</span>
      <span>{tl("Match")}</span>
      <span title={tl("Chance to win the series, from the power rankings (every pro game since 2011)")}>{tl("Chance")}</span>
      <span title={tl("All-time head-to-head, in games")}>H2H</span>
      <span title={tl("Last five series, newest first")}>{tl("Form")}</span>
      <span>Bo</span>
      <span>{tl("Time")}</span>
      <span />
    </div>
    {matches.map((m) => (
      <UpNextRow key={m.matchId} m={m} schedule={schedule} settings={settings} onOpenUrl={onOpenUrl} onSelectTeam={onSelectTeam} onToggleFollow={onToggleFollow} timeOf={timeOf} />
    ))}
  </div>
);

const UpNextRow: React.FC<{
  m: Match;
  schedule: Match[];
  settings: AppSettings;
  onOpenUrl: (url: string) => void;
  onSelectTeam?: (code: string, name?: string) => void;
  onToggleFollow?: (code: string) => void;
  timeOf: (iso: string) => string;
}> = ({ m, schedule, settings, onOpenUrl, onSelectTeam, onToggleFollow, timeOf }) => {
  const h2h = computeHeadToHead(m.team1Code, m.team2Code, schedule, m.matchId);
  const team = (code: string, name: string) => {
    const followed = settings.followedTeams.includes(code);
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        <span
          {...clickable(() => onSelectTeam?.(code, name))}
          className="font-semibold text-rw-text hover:text-rw-accent cursor-pointer truncate"
          title={tl("View {team} roster", { team: name })}
        >
          <span className="sm:hidden">{code}</span>
          <span className="max-sm:hidden">{name}</span>
        </span>
        {onToggleFollow && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFollow(code);
            }}
            className={`p-1 -m-0.5 rounded hover:bg-rw-border shrink-0 ${followed ? "text-rw-accent" : "text-rw-sub"}`}
            aria-label={followed ? tl("Unfollow {name}", { name: code }) : tl("Follow {name}", { name: code })}
            title={followed ? tl("Unfollow {name}", { name: code }) : tl("Follow {name}", { name: code })}
          >
            <Star className={`w-3 h-3 ${followed ? "fill-rw-accent" : ""}`} />
          </button>
        )}
      </span>
    );
  };
  return (
    <div className={`px-3 py-2 ${GRID} flex flex-wrap items-center gap-x-3 gap-y-1`}>
      <span className="font-bold text-rw-teal text-[11px] truncate min-w-0 max-sm:flex-1" title={m.leagueName}>
        {m.leagueName}
      </span>
      <span className="flex items-center gap-1.5 min-w-0 max-sm:order-last max-sm:basis-full">
        {team(m.team1Code, m.team1Name)}
        <span className="text-rw-sub shrink-0">{tl("vs")}</span>
        {team(m.team2Code, m.team2Name)}
      </span>
      <span className="max-sm:order-last max-sm:basis-full sm:contents">
        <span className="max-sm:flex max-sm:items-center max-sm:gap-3">
          <ChanceCell m={m} />
          <span className="sm:hidden font-mono tabular-nums text-rw-sub text-[10px]" title={tl("All-time head-to-head, in games")}>
            {h2h ? `H2H ${h2h.team1Wins}–${h2h.team2Wins}` : ""}
          </span>
          <span className="sm:hidden">
            <FormCell m={m} schedule={schedule} hidden={settings.spoilerMode} />
          </span>
        </span>
      </span>
      <span className="max-sm:hidden font-mono tabular-nums text-rw-sub text-[11px]" title={tl("All-time head-to-head, in games")}>
        {h2h ? `${h2h.team1Wins}–${h2h.team2Wins}` : "–"}
      </span>
      <span className="max-sm:hidden">
        <FormCell m={m} schedule={schedule} hidden={settings.spoilerMode} />
      </span>
      <span className="text-rw-sub text-[11px] font-medium shrink-0">{tc("short best of", "Bo{n}", { n: m.bestOf })}</span>
      <span className="text-rw-sub font-mono text-[11px] font-medium shrink-0 whitespace-nowrap">{timeOf(m.startTimeUtc)}</span>
      <span className="flex items-center gap-0.5 shrink-0 ml-auto">
        <AddToCalendarMenu match={m} onOpenUrl={onOpenUrl} compact={true} />
        <MatchPrepButton match={m} compact />
        <MatchOverviewButton match={m} compact />
      </span>
    </div>
  );
};

/** Team 1's chance (left, teal) and team 2's (right) to win the series. */
const ChanceCell: React.FC<{ m: Match }> = ({ m }) => {
  const r = useMatchRatings(m);
  if (r?.series == null) return <span className="text-rw-muted max-sm:hidden">–</span>;
  const a = Math.round(r.series * 100);
  return (
    <span className="flex items-center gap-1.5 min-w-[7rem]" title={tl("Chance to win the series, from the power rankings (every pro game since 2011)")}>
      <span className="font-mono tabular-nums text-[11px] text-rw-teal w-6 text-right">{a}</span>
      <span className="flex-1 h-1.5 rounded-sm overflow-hidden bg-rw-red/70" aria-hidden="true">
        <span className="block h-full bg-rw-teal" style={{ width: `${a}%` }} />
      </span>
      <span className="font-mono tabular-nums text-[11px] text-rw-red w-6">{100 - a}</span>
    </span>
  );
};

/** Both teams' last five series (W / L squares, newest first), loaded a moment after the page so it shows first. */
const FormCell: React.FC<{ m: Match; schedule: Match[]; hidden: boolean }> = ({ m, schedule, hidden }) => {
  const [form, setForm] = useState<[("W" | "L")[], ("W" | "L")[]] | null>(null);
  useEffect(() => {
    if (hidden) return;
    let alive = true;
    const t = window.setTimeout(() => {
      Promise.all([teamForm(m.team1Name, m.team1Code, schedule), teamForm(m.team2Name, m.team2Code, schedule)])
        .then((f) => alive && setForm(f))
        .catch(() => {});
    }, 1200);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.matchId, hidden]);
  if (hidden) return <span className="text-rw-muted text-[10px]" title={tl("Hidden while spoiler mode is on.")}>–</span>;
  if (!form || (!form[0].length && !form[1].length)) return <span className="text-rw-muted">–</span>;
  const row = (f: ("W" | "L")[], code: string) => (
    <span className="flex gap-px" title={`${code}: ${f.join(" ")}`}>
      {f.map((x, i) => (
        <span
          key={i}
          className={`w-3 h-3 rounded-[1px] text-[8px] leading-3 text-center font-bold ${x === "W" ? "bg-rw-teal/30 text-rw-teal" : "bg-rw-red/30 text-rw-red"}`}
        >
          {x === "W" ? tc("short result", "W") : tc("short result", "L")}
        </span>
      ))}
    </span>
  );
  return (
    <span className="flex flex-col gap-px" aria-label={tl("Last five series, newest first")}>
      {row(form[0], m.team1Code)}
      {row(form[1], m.team2Code)}
    </span>
  );
};
