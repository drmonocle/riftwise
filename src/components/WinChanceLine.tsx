/**
 * "Win chance before the series" for a match, from the power rankings (hub/ratings.json): the chance to win the
 * whole best-of, as a bar. Shown only when both teams are rated on the same scale (top leagues, or the same league).
 * Also each team's place in the rankings, for the line under its name on a match card.
 */
import React from "react";
import { TrendingUp } from "lucide-react";
import type { Match } from "../types";
import { tl } from "../i18n";
import { navigateHub } from "../hub/route";
import { pct } from "../hub/winChance";
import { useMatchRatings } from "../hub/matchRatings";

export const WinChanceLine: React.FC<{ match: Match }> = ({ match }) => {
  const r = useMatchRatings(match);
  const p = r?.series;
  if (p == null) return null;
  const a = Math.round(p * 100);
  return (
    <button
      type="button"
      onClick={() => navigateHub({ kind: "rankings" })}
      className="block w-full text-left space-y-0.5 group"
      title={`${tl("From the power rankings (every pro game since 2011).")} ${tl("Win chance before the series: {a} {pa} · {b} {pb}", { a: match.team1Code, pa: pct(p), b: match.team2Code, pb: pct(1 - p) })}`}
    >
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-rw-sub group-hover:text-rw-accent">
        <TrendingUp className="w-3 h-3" />
        {tl("Win chance before the series")}
      </span>
      <span className="flex items-center gap-2">
        <span className="font-mono tabular-nums font-bold text-rw-teal w-16 text-right whitespace-nowrap text-[11px]">
          {match.team1Code} {a}%
        </span>
        <span className="flex-1 h-2 rounded-sm overflow-hidden bg-rw-red/70" aria-hidden="true">
          <span className="block h-full bg-rw-teal" style={{ width: `${a}%` }} />
        </span>
        <span className="font-mono tabular-nums font-bold text-rw-red w-16 whitespace-nowrap text-[11px]">
          {100 - a}% {match.team2Code}
        </span>
      </span>
    </button>
  );
};

/** "T1 · #3 · 1816": a team's code, its power rank (worldwide among top-league teams, else in its league) and rating. */
export const TeamRatingSub: React.FC<{ match: Match; side: "a" | "b"; align?: "left" | "right" }> = ({ match, side, align = "left" }) => {
  const r = useMatchRatings(match);
  const code = side === "a" ? match.team1Code : match.team2Code;
  const s = r?.[side];
  return (
    <div
      className={`text-[11px] text-rw-sub font-mono tabular-nums font-medium whitespace-nowrap ${align === "right" ? "text-right" : ""}`}
      title={
        s
          ? s.world != null
            ? tl("#{rank} of the top-league teams worldwide, #{lrank} in {league} · power rating {r}", { rank: s.world, lrank: s.league, league: s.leagueName, r: s.rating })
            : tl("#{lrank} in {league} · power rating {r}", { lrank: s.league, league: s.leagueName, r: s.rating })
          : undefined
      }
    >
      {code}
      {s && (
        <>
          {" · "}#{s.world ?? s.league}
          {s.world == null && <span className="text-rw-muted"> {s.leagueName}</span>}
          {" · "}
          {s.rating}
        </>
      )}
    </div>
  );
};
