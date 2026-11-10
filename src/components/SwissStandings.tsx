/**
 * The Swiss stage being played (Worlds): every team's record and its chance to make the top 8 (hub/swissNow.ts),
 * with a link to the Swiss picker. Shown on the Live tab while the stage is on.
 */
import React, { useEffect, useState } from "react";
import type { Match } from "../types";
import { tl } from "../i18n";
import { navigateHub } from "../hub/route";
import { swissNow, type SwissNow } from "../hub/swissNow";
import { SectionCard } from "./hub/BroadcastCard";
import { TeamLogo } from "./hub/ui";

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
    <section className="rounded-xl border border-rw-border bg-rw-panel rw-lit text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 border-b border-rw-border">
        <h2 className="font-head text-[13px] font-bold uppercase tracking-[0.12em] text-rw-sub">{tl("Worlds Swiss stage: standings")}</h2>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-rw-muted font-mono tabular-nums">
          <button
            type="button"
            onClick={() => {
              navigateHub({ kind: "worlds" });
              onOpen();
            }}
            className="hover:text-rw-accent hover:underline"
          >
            {tl("{n} of {m} series played", { n: d.played, m: d.total })}
          </button>
          {d.total > 0 && (
            <span className="w-12 h-1 rounded-full bg-rw-border/70 overflow-hidden shrink-0" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-accent/80" style={{ width: `${Math.round((d.played / d.total) * 100)}%` }} />
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <SectionCard
            section={tl("Worlds Swiss stage: standings")}
            name={tl("Worlds Swiss stage: standings")}
            sub={tl("{n} of {m} series played", { n: d.played, m: d.total })}
            rows={() =>
              d.rows.map((r) => ({
                label: r.name,
                sub: r.code,
                value: `${r.w}–${r.l}`,
                note: `${Math.round(r.adv * 100)}%`,
              }))
            }
          />
          <button
            type="button"
            onClick={() => {
              navigateHub({ kind: "worlds" });
              onOpen();
            }}
            className="text-[11px] font-semibold text-rw-accent hover:underline"
          >
            {tl("Swiss picker →")}
          </button>
        </div>
      </div>
      <div className={`grid grid-cols-2 ${narrow ? "" : "sm:grid-cols-4"} gap-x-4 px-3 py-2`}>
        {d.rows.map((r) => (
          <button
            key={r.u}
            type="button"
            onClick={() => {
              navigateHub({ kind: "team", slug: r.u });
              onOpen();
            }}
            className="flex items-center gap-1.5 py-0.5 border-b border-rw-border/40 min-w-0 text-left hover:text-rw-accent transition-colors"
            title={r.name}
          >
            <TeamLogo name={r.name} code={r.code} size={14} />
            <span className="font-semibold text-rw-text hover:text-rw-accent truncate flex-1 min-w-0">{r.code}</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums text-rw-sub">
              <span className="hidden sm:inline-flex items-center gap-0.5" aria-hidden="true">
                {Array.from({ length: r.w }).map((_, i) => (
                  <span key={`w${i}`} className="w-1.5 h-1.5 rounded-full bg-rw-teal/85" />
                ))}
                {Array.from({ length: r.l }).map((_, i) => (
                  <span key={`l${i}`} className="w-1.5 h-1.5 rounded-full bg-rw-rose/75" />
                ))}
              </span>
              <span>
                {r.w}–{r.l}
              </span>
            </span>
            <span className="font-mono tabular-nums text-[11px] w-10 text-center rounded-sm text-rw-text" style={chanceShade(r.adv)}>
              {Math.round(r.adv * 100)}%
            </span>
          </button>
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
