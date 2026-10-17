/**
 * "Win chance before the series" for a match, from the power rankings (hub/ratings.json): the chance to win the
 * whole best-of. Shown only when both teams are rated on the same scale (top leagues, or the same league).
 */
import React, { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import type { Match } from "../types";
import { tl } from "../i18n";
import { findHubTeam, loadHubIndex, loadRatings } from "../hub/data";
import { navigateHub } from "../hub/route";
import { chanceContext, matchChance, pct, seriesChance } from "../hub/winChance";

export const WinChanceLine: React.FC<{ match: Match }> = ({ match }) => {
  const [p, setP] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([loadHubIndex(), loadRatings()])
      .then(([index, ratings]) => {
        const a = findHubTeam(index, match.team1Name, match.team1Code);
        const b = findHubTeam(index, match.team2Name, match.team2Code);
        const ra = ratings.teams.find((r) => r[0] === a);
        const rb = ratings.teams.find((r) => r[0] === b);
        // r[9] = 1 for top-league teams; second-tier teams only compare within their own league
        if (!alive || !ra || !rb || ((ra[9] !== 1 || rb[9] !== 1) && ra[3] !== rb[3])) return;
        const ctx = chanceContext(ra[9] === 1, rb[9] === 1, ra[3], rb[3]);
        setP(seriesChance(matchChance(ra[5], rb[5], ctx, ratings.adjust), match.bestOf || 1, ratings.adjust));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [match.team1Name, match.team1Code, match.team2Name, match.team2Code, match.bestOf]);
  if (p == null) return null;
  return (
    <button
      type="button"
      onClick={() => navigateHub({ kind: "rankings" })}
      className="flex items-center justify-center gap-1.5 w-full text-[10px] text-rw-sub hover:text-rw-accent"
      title={tl("From the power rankings (every pro game since 2011).")}
    >
      <TrendingUp className="w-3 h-3" />
      {tl("Win chance before the series: {a} {pa} · {b} {pb}", { a: match.team1Code, pa: pct(p), b: match.team2Code, pb: pct(1 - p) })}
    </button>
  );
};
