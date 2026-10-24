/**
 * The Swiss stage being played (Worlds): every team's record and its chance to make the top 8 (hub/swissNow.ts),
 * with a link to the Swiss picker. Shown on the Live tab while the stage is on.
 */
import React, { useEffect, useState } from "react";
import type { Match } from "../types";
import { tl } from "../i18n";
import { navigateHub } from "../hub/route";
import { swissNow, type SwissNow } from "../hub/swissNow";

/** a cell's shade: teal for likely, red for unlikely, stronger the surer (theme colours) */
export const chanceShade = (p: number) =>
  p >= 0.5
    ? { background: `color-mix(in srgb, var(--rw-teal) ${Math.round(20 + (p - 0.5) * 120)}%, transparent)` }
    : { background: `color-mix(in srgb, var(--rw-red) ${Math.round(20 + (0.5 - p) * 120)}%, transparent)` };

/** `narrow`: two columns at every width (the Live tab's side column). */
export const SwissStandings: React.FC<{ schedule: Match[]; onOpen: () => void; narrow?: boolean }> = ({ schedule, onOpen, narrow }) => {
  const [d, setD] = useState<SwissNow | null>(null);
  // the finished matches decide the table: recompute when one ends, not on every schedule refresh
  const key = schedule
    .filter((m) => m.leagueSlug === "worlds" && /swiss/i.test(m.blockName))
    .map((m) => `${m.matchId}:${m.state}:${m.team1Score}-${m.team2Score}`)
    .join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const t = window.setTimeout(() => {
      swissNow(schedule)
        .then((x) => alive && setD(x))
        .catch(() => {});
    }, 600);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!d || d.played === 0 || d.played >= d.total) return null;
  return (
    <section className="rounded-lg border border-rw-border bg-rw-surface text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 border-b border-rw-border">
        <h2 className="font-head text-xs font-semibold uppercase tracking-wider text-rw-text">{tl("Worlds Swiss stage: standings")}</h2>
        <span className="text-[11px] text-rw-muted font-mono tabular-nums">{tl("{n} of {m} series played", { n: d.played, m: d.total })}</span>
        <button
          type="button"
          onClick={() => {
            navigateHub({ kind: "worlds" });
            onOpen();
          }}
          className="ml-auto text-[11px] font-semibold text-rw-teal hover:underline"
        >
          {tl("Swiss picker →")}
        </button>
      </div>
      <div className={`grid grid-cols-2 ${narrow ? "" : "sm:grid-cols-4"} gap-x-4 px-3 py-2`}>
        {d.rows.map((r) => (
          <div key={r.u} className="flex items-center gap-2 py-0.5 border-b border-rw-border/40 min-w-0" title={r.name}>
            <span className="font-semibold text-rw-text truncate flex-1 min-w-0">{r.code}</span>
            <span className="font-mono tabular-nums text-rw-sub">
              {r.w}–{r.l}
            </span>
            <span className="font-mono tabular-nums text-[11px] w-10 text-center rounded-sm text-rw-text" style={chanceShade(r.adv)}>
              {Math.round(r.adv * 100)}%
            </span>
          </div>
        ))}
      </div>
      <p className="px-3 pb-2 text-[10px] text-rw-muted">
        {tl("Chance to make the top 8: the rest of the stage played {n} times, each match rolled by the power ratings (3 wins go through, 3 losses go home).", {
          n: d.runs.toLocaleString(),
        })}
      </p>
    </section>
  );
};
