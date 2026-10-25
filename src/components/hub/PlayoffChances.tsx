/**
 * Playoff chances on a tournament page while its league table is still being played (hub/playoffOdds.ts): each
 * team's chance to finish first and in the top N. The cut line is the viewer's choice: leagues send different
 * numbers of teams to their playoffs. Hidden like the standings in spoiler mode (the records are results).
 */
import React, { useMemo, useState } from "react";
import { tl } from "../../i18n";
import { loadRatings } from "../../hub/data";
import type { HubEvent } from "../../hub/types";
import { playoffOdds } from "../../hub/playoffOdds";
import { chanceShade } from "../SwissStandings";
import { RevealButton, Section, TeamLink, useHidden, useLoad } from "./ui";

const pctText = (p: number) => (p === 0 ? "0%" : p < 0.005 ? "<1%" : p > 0.995 && p < 1 ? ">99%" : `${Math.round(p * 100)}%`);

export const PlayoffChances: React.FC<{ e: HubEvent }> = ({ e }) => {
  const ratings = useLoad(loadRatings, []);
  const today = new Date().toISOString().slice(0, 10);
  const odds = useMemo(() => (ratings.data ? playoffOdds(e, ratings.data, today) : null), [e, ratings.data, today]);
  const [pick, setPick] = useState<number | null>(null);
  const [hidden, reveal] = useHidden(`playoffs:${e.u}`, e.end);
  if (!odds) return null;
  const cut = pick != null && odds.cuts.includes(pick) ? pick : odds.cut;
  const ci = odds.cuts.indexOf(cut);
  const rows = [...odds.rows].sort((a, b) => b.top[ci] - a.top[ci] || b.first - a.first || b.sw - a.sw);
  const unrated = odds.rows.filter((r) => r.unrated).length;
  const th = "px-1.5 sm:px-2 py-1 font-normal text-[10px] text-rw-muted whitespace-nowrap";
  const seg = (on: boolean) => `px-2 py-1 pointer-coarse:min-h-9 max-sm:min-h-9 ${on ? "bg-rw-accent/15 text-rw-text" : "text-rw-sub hover:text-rw-text"}`;
  return (
    <Section
      title={tl("Playoff chances")}
      right={
        hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <span data-nocapture="1" className="flex rounded border border-rw-border divide-x divide-rw-border overflow-hidden text-[11px]" role="group" aria-label={tl("Cut line")}>
            {odds.cuts.map((k) => (
              <button key={k} type="button" aria-pressed={k === cut} onClick={() => setPick(k)} className={seg(k === cut)}>
                {tl("Top {n}", { n: k })}
              </button>
            ))}
          </span>
        )
      }
      share={`${e.u}-playoff-chances`}
    >
      {hidden ? (
        <p className="text-xs text-rw-muted">{tl("Hidden while spoiler mode is on.")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            {/* fixed layout: the number columns keep their width, the team names take the rest and truncate (phones) */}
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>{tl("Team")}</th>
                  <th className={`${th} text-right w-10 sm:w-16`}>{tl("Series")}</th>
                  <th className={`${th} text-right w-12 max-sm:hidden`} title={tl("Series still to play")}>{tl("Left")}</th>
                  <th className={`${th} text-right w-10 sm:w-24`} title={tl("First place")}>
                    <span className="sm:hidden">#1</span>
                    <span className="max-sm:hidden">{tl("First place")}</span>
                  </th>
                  <th className={`${th} text-right w-16`}>{tl("Top {n}", { n: cut })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.u} className="border-t border-rw-border">
                    <td className="px-1.5 sm:px-2 py-1 truncate">
                      <TeamLink name={r.name} u={r.u} />
                      {r.unrated && <span className="text-rw-muted" title={tl("No power rating yet: played at the table's median rating")}> *</span>}
                    </td>
                    <td className="px-1.5 sm:px-2 py-1 text-right tabular-nums text-rw-sub whitespace-nowrap">
                      {r.sw}-{r.sl}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-rw-muted max-sm:hidden">{r.left}</td>
                    <td className="px-1.5 sm:px-2 py-1 text-right tabular-nums text-rw-sub">{pctText(r.first)}</td>
                    <td className="px-1 py-0.5 text-right">
                      <span className="inline-block min-w-[3rem] rounded-sm px-1.5 py-0.5 text-center tabular-nums text-rw-text" style={chanceShade(r.top[ci])}>
                        {pctText(r.top[ci])}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-rw-muted">
            {tl(
              "The {n} series still to play, each played out {runs} times with the power ratings (best of 3 and 5 from the one-game chance). Ties on series wins go to game difference, then by lot: the league's own tiebreakers aren't modelled. Pick the cut line the league uses; as of the last stats update.",
              { n: odds.open, runs: odds.runs.toLocaleString() },
            )}
            {` ${tl("Records come from the series list below; the standings table can differ for a while as results come in.")}`}
            {unrated > 0 && ` ${tl("* No power rating yet: played at the table's median rating")}`}
          </p>
        </>
      )}
    </Section>
  );
};
