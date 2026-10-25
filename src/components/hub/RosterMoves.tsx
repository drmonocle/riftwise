/**
 * Roster moves: players who began playing for a new club in the last five months, newest first, from the stats
 * build (hub/moves.json: a player's newest club stint started recently and the one before was another club). Top
 * leagues by default; every league one click away. The build only sees a move once the player has played for the
 * new club, so announced transfers show up with their first game.
 */
import React, { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { tl, roleName } from "../../i18n";
import { loadLeagues, loadMoves } from "../../hub/data";
import { fmtDate, PlayerLink, TeamLink, useLoad } from "./ui";

export const RosterMoves: React.FC = () => {
  const moves = useLoad(loadMoves, []);
  const leagues = useLoad(loadLeagues, []);
  const [all, setAll] = useState(false);
  const top = useMemo(() => new Set((leagues.data || []).filter((l) => l.pr).map((l) => l.u)), [leagues.data]);
  const name = useMemo(() => new Map((leagues.data || []).map((l) => [l.u, l.s || l.l])), [leagues.data]);
  const [shown, setShown] = useState(25);
  if (!moves.data || !moves.data.list.length) return null;
  const list = moves.data.list.filter((m) => all || (m.lu && top.has(m.lu)));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-rw-border">
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
          {tl("Roster moves")}
        </h2>
        <div className="flex gap-1 text-[11px]" role="group" aria-label={tl("Leagues")}>
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setAll(v)}
              aria-pressed={all === v}
              className={`px-2 py-0.5 rounded-full border ${all === v ? "border-rw-accent text-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
            >
              {v ? tl("All leagues") : tl("Top leagues")}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-rw-muted">
        {tl("Players who started playing for a new club since {date}, newest first. A move shows once the player has played for the new club.", {
          date: fmtDate(moves.data.since),
        })}
      </p>
      {/* two columns, newest first down each, when the list is wide (one line a move left most of the row empty) */}
      <div className="@container">
      <ul className="text-xs @min-[64rem]:columns-2 gap-x-10">
        {list.slice(0, shown).map((m) => (
          <li key={`${m.u}-${m.d}`} className="py-1.5 border-b border-rw-border break-inside-avoid flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className="text-rw-muted tabular-nums w-20 shrink-0">{fmtDate(m.d, false)}</span>
            <span className="min-w-0">
              <PlayerLink name={m.n} u={m.u} className="font-semibold text-rw-text hover:text-rw-accent" />
              {m.r && <span className="text-rw-muted"> · {roleName(m.r)}</span>}
            </span>
            <span className="flex items-center gap-1 min-w-0 text-rw-sub">
              <TeamLink name={m.from.n} u={m.from.u} className="hover:text-rw-accent truncate" />
              <ArrowRight className="w-3 h-3 shrink-0 text-rw-teal" />
              <TeamLink name={m.to.n} u={m.to.u} className="text-rw-text hover:text-rw-accent truncate" />
            </span>
            {m.lu && name.get(m.lu) && <span className="text-[10px] text-rw-muted">{name.get(m.lu)}</span>}
          </li>
        ))}
        {!list.length && <li className="py-2 text-rw-muted">{tl("No moves in the top leagues yet. See every league.")}</li>}
      </ul>
      </div>
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 50)} className="text-[11px] text-rw-teal hover:underline">
          {tl("Show {n} more", { n: Math.min(50, list.length - shown) })}
        </button>
      )}
    </div>
  );
};
