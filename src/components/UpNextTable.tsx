/**
 * The Live tab's lists of coming matches as a table: league and best-of, the teams with their logos, each side's
 * chance to win the series (power rankings) over the all-time head-to-head in games, both teams' form (last five
 * series, newest first), time, and the calendar / Match prep / Overview buttons. Phones get the same as two or three
 * lines a match.
 */
import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { AppSettings, Match } from "../types";
import { tl, tc } from "../i18n";
import { computeHeadToHead } from "../helpers";
import { clickable } from "../a11y";
import { teamForm, useMatchRatings } from "../hub/matchRatings";
import { prettySlug, resolveLeagueSlug } from "../hub/data";
import { navigateHub } from "../hub/route";
import { AddToCalendarMenu } from "./AddToCalendarMenu";
import { MatchPrepButton } from "./MatchPrepButton";
import { MatchOverviewButton } from "./MatchOverviewButton";
import { SectionCard } from "./hub/BroadcastCard";
import { TeamLogo } from "./hub/ui";

// the one-line layout once the table itself is 900 px wide; below that two or three lines a match. Every column has
// a set width (the buttons' too: an "auto" one was empty in the header row, so its columns sat ~75 px right of the rows').
// The team names come first (a small app window cut them to "LY…"): best-of sits under the league, the
// head-to-head under the chance bar, and the form column only shows from 1060 px, where the names still fit beside it.
const GRID =
  "@min-[900px]:grid @min-[900px]:grid-cols-[5.5rem_minmax(0,1fr)_8rem_8.5rem_5rem] @min-[1060px]:grid-cols-[5.5rem_minmax(0,1fr)_8rem_5.25rem_8.5rem_5rem] @min-[900px]:items-center @min-[900px]:gap-x-3";
const FORM_COL = "@max-[1060px]:hidden";

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
  <div className="@container rounded-xl border border-rw-border bg-rw-panel rw-lit text-xs divide-y divide-rw-border/70">
    <div className={`hidden ${GRID} px-3 py-1.5 text-[10px] uppercase tracking-wider text-rw-muted`}>
      <span>{tl("League")}</span>
      <span className="text-center">{tl("Match")}</span>
      <span className="text-center" title={tl("Chance to win the series, from the power rankings (every pro game since 2011)")}>
        {tl("Chance")}
      </span>
      <span className={FORM_COL} title={tl("Last five series, newest first")}>
        {tl("Form")}
      </span>
      <span>{tl("Time")}</span>
      <span className="flex justify-end">
        {matches.length > 0 && (
          <SectionCard
            section={tl("Up Next")}
            name={tl("Up Next")}
            rows={() =>
              matches.slice(0, 12).map((m, idx) => ({
                rank: idx + 1,
                team: m.team1Name || m.team1Code,
                label: `${m.team1Name} vs ${m.team2Name}`,
                sub: `${m.leagueName} · ${tc("short best of", "Bo{n}", { n: m.bestOf })}`,
                value: timeOf(m.startTimeUtc),
              }))
            }
          />
        )}
      </span>
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
  const bo = tc("short best of", "Bo{n}", { n: m.bestOf });
  // team 1 reads right to left (star, name, logo) so both logos meet at the "vs", in the middle of the cell on one line
  const team = (code: string, name: string, first: boolean) => {
    const followed = settings.followedTeams.includes(code);
    return (
      <span className={`flex items-center gap-1 min-w-0 ${first ? "justify-end" : ""}`}>
        <span
          {...clickable(() => onSelectTeam?.(code, name))}
          className={`font-semibold text-rw-text hover:text-rw-accent cursor-pointer truncate ${first ? "order-2" : ""}`}
          title={tl("View {team} roster", { team: name })}
        >
          <span className="@min-[480px]:hidden">{code}</span>
          <span className="@max-[480px]:hidden">{name}</span>
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
  const logo = (name: string, code: string, image: string | undefined) => (
    <button
      type="button"
      onClick={() => (onSelectTeam ? onSelectTeam(code, name) : navigateHub({ kind: "team", slug: prettySlug(name || code) }))}
      className="w-5 h-5 shrink-0 inline-flex items-center justify-center rounded hover:ring-1 hover:ring-rw-accent transition-all"
      title={tl("View {team} roster", { team: name })}
    >
      <TeamLogo name={name} code={code} src={image} size={20} />
    </button>
  );
  return (
    <div className={`px-3 py-2 ${GRID} flex flex-wrap items-center gap-x-3 gap-y-1`}>
      <span className="flex flex-col min-w-0 @max-[900px]:flex-1">
        <button
          type="button"
          onClick={() => navigateHub({ kind: "league", slug: resolveLeagueSlug(m.leagueSlug || m.leagueName) })}
          className="font-bold text-rw-accent hover:underline text-[11px] truncate text-left"
          title={m.leagueName}
        >
          {m.leagueName}
        </button>
        <button
          type="button"
          onClick={() =>
            navigateHub({
              kind: "prep",
              a: prettySlug(m.team1Name || m.team1Code),
              b: prettySlug(m.team2Name || m.team2Code),
            })
          }
          className="@max-[900px]:hidden text-rw-sub hover:text-rw-accent hover:underline text-[10px] font-medium text-left"
          title={tl("Match prep")}
        >
          {bo}
        </button>
      </span>
      <span className="flex items-center gap-1.5 min-w-0 @max-[900px]:order-last @max-[900px]:basis-full @min-[900px]:grid @min-[900px]:grid-cols-[minmax(0,1fr)_auto_auto_auto_minmax(0,1fr)]">
        {team(m.team1Code, m.team1Name, true)}
        {logo(m.team1Name, m.team1Code, m.team1Image)}
        <button
          type="button"
          onClick={() => navigateHub({ kind: "compare", mode: "team", a: prettySlug(m.team1Name), b: prettySlug(m.team2Name) })}
          className="text-rw-sub hover:text-rw-accent hover:underline"
          title={tl("Compare {a} and {b}", { a: m.team1Name, b: m.team2Name })}
        >
          {tl("vs")}
        </button>
        {logo(m.team2Name, m.team2Code, m.team2Image)}
        {team(m.team2Code, m.team2Name, false)}
      </span>
      <span className="@max-[900px]:order-last @max-[900px]:basis-full @min-[900px]:contents">
        <span className="flex items-center gap-3 @min-[900px]:flex-col @min-[900px]:items-stretch @min-[900px]:gap-0.5">
          <ChanceCell m={m} />
          {h2h && (
            <button
              type="button"
              onClick={() => navigateHub({ kind: "compare", mode: "team", a: prettySlug(m.team1Name), b: prettySlug(m.team2Name) })}
              className="inline-flex items-center justify-center gap-1.5 font-mono tabular-nums text-rw-sub hover:text-rw-accent hover:underline text-[10px] @min-[900px]:text-center"
              title={tl("All-time head-to-head, in games")}
            >
              <span>
                H2H {h2h.team1Wins}–{h2h.team2Wins}
              </span>
              {h2h.team1Wins + h2h.team2Wins > 0 && (
                <span className="w-7 h-1 rounded-full bg-rw-border/70 overflow-hidden inline-flex gap-[1px] shrink-0" aria-hidden="true">
                  <span
                    className="h-full bg-rw-side-a/80"
                    style={{ width: `${Math.round((h2h.team1Wins / (h2h.team1Wins + h2h.team2Wins)) * 100)}%` }}
                  />
                  <span className="h-full flex-1 bg-rw-side-b/80" />
                </span>
              )}
            </button>
          )}
          <span className="@min-[900px]:hidden">
            <FormCell m={m} schedule={schedule} hidden={settings.spoilerMode} />
          </span>
        </span>
      </span>
      <span className={FORM_COL}>
        <FormCell m={m} schedule={schedule} hidden={settings.spoilerMode} />
      </span>
      <button
        type="button"
        onClick={() =>
          navigateHub({
            kind: "prep",
            a: prettySlug(m.team1Name || m.team1Code),
            b: prettySlug(m.team2Name || m.team2Code),
          })
        }
        className="@min-[900px]:hidden text-rw-sub hover:text-rw-accent hover:underline text-[11px] font-medium shrink-0"
        title={tl("Match prep")}
      >
        {bo}
      </button>
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
  if (r?.series == null) return <span className="text-rw-muted text-center @max-[900px]:hidden">–</span>;
  const a = Math.round(r.series * 100);
  return (
    <button
      type="button"
      onClick={() =>
        navigateHub({
          kind: "prep",
          a: prettySlug(m.team1Name || m.team1Code),
          b: prettySlug(m.team2Name || m.team2Code),
        })
      }
      className="flex items-center gap-1.5 min-w-[7rem] hover:opacity-85"
      title={tl("Chance to win the series, from the power rankings (every pro game since 2011)")}
    >
      <span className="font-mono tabular-nums text-[11px] text-rw-side-a w-6 text-right">{a}</span>
      <span className="flex-1 h-1.5 rounded-sm overflow-hidden bg-rw-side-b/70" aria-hidden="true">
        <span className="block h-full bg-rw-side-a" style={{ width: `${a}%` }} />
      </span>
      <span className="font-mono tabular-nums text-[11px] text-rw-side-b w-6 text-left">{100 - a}</span>
    </button>
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
  const row = (f: ("W" | "L")[], code: string, name: string) => (
    <button
      type="button"
      onClick={() => navigateHub({ kind: "team", slug: prettySlug(name || code), tab: "matches" })}
      className="flex gap-px hover:opacity-80"
      title={`${code}: ${f.join(" ")}`}
    >
      {f.map((x, i) => (
        <span
          key={i}
          className={`w-3 h-3 rounded-[1px] text-[8px] leading-3 text-center font-bold ${x === "W" ? "bg-rw-teal/25 text-rw-teal" : "bg-rw-red/20 text-rw-red"}`}
        >
          {x === "W" ? tc("short result", "W") : tc("short result", "L")}
        </span>
      ))}
    </button>
  );
  return (
    <span className="flex flex-col gap-px" aria-label={tl("Last five series, newest first")}>
      {row(form[0], m.team1Code, m.team1Name)}
      {row(form[1], m.team2Code, m.team2Name)}
    </span>
  );
};
