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
import { fmtDate, HubLink, PlayerLink, PlayerPhoto, TeamLink, TeamLogo, useLoad } from "./ui";
import { SectionCard } from "./BroadcastCard";

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
        <div className="flex flex-wrap items-center gap-2 text-[11px]" role="group" aria-label={tl("Leagues")}>
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
          {list.length > 0 && (
            <>
              <CopyMovesPost
                sub={all ? tl("All leagues") : tl("Top leagues")}
                rows={list.slice(0, 6).map((m) => `${m.n}${m.r ? ` (${roleName(m.r)})` : ""}: ${m.from.n} → ${m.to.n} (${fmtDate(m.d, false)})`)}
              />
              <SectionCard
                section={tl("Roster moves")}
                name={all ? tl("All leagues") : tl("Top leagues")}
                sub={fmtDate(moves.data.since)}
                rows={() =>
                  list.slice(0, 12).map((m) => ({
                    label: `${m.n}${m.r ? ` (${roleName(m.r)})` : ""}`,
                    sub: `${m.from.n} → ${m.to.n}${m.lu && name.get(m.lu) ? ` · ${name.get(m.lu)}` : ""}`,
                    value: fmtDate(m.d, false),
                  }))
                }
              />
            </>
          )}
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
            <HubLink
              to={{ kind: "finder", query: `player=${encodeURIComponent(m.u)}&team=${encodeURIComponent(m.to.u)}` }}
              className="text-rw-muted hover:text-rw-accent hover:underline tabular-nums w-20 shrink-0"
              title={tl("Game finder")}
            >
              {fmtDate(m.d, false)}
            </HubLink>
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <PlayerPhoto name={m.n} team={m.to.n} slug={m.u} size={18} />
              <PlayerLink name={m.n} u={m.u} className="font-semibold text-rw-text hover:text-rw-accent" />
              {m.r && (
                <HubLink to={{ kind: "player", slug: m.u, tab: "stats" }} className="text-rw-muted hover:text-rw-accent hover:underline">
                  · {roleName(m.r)}
                </HubLink>
              )}
            </span>
            <span className="flex items-center gap-1.5 min-w-0 text-rw-sub">
              <span className="inline-flex items-center gap-1 min-w-0">
                <HubLink to={{ kind: "team", slug: m.from.u }} className="shrink-0">
                  <TeamLogo name={m.from.n} sizeClass="w-3.5 h-3.5" />
                </HubLink>
                <TeamLink name={m.from.n} u={m.from.u} className="hover:text-rw-accent truncate" />
              </span>
              <HubLink
                to={{ kind: "compare", mode: "team", a: m.from.u, b: m.to.u }}
                className="text-rw-accent hover:opacity-80 shrink-0"
                title={tl("Compare")}
              >
                <ArrowRight className="w-3 h-3" />
              </HubLink>
              <span className="inline-flex items-center gap-1 min-w-0">
                <HubLink to={{ kind: "team", slug: m.to.u }} className="shrink-0">
                  <TeamLogo name={m.to.n} sizeClass="w-3.5 h-3.5" />
                </HubLink>
                <TeamLink name={m.to.n} u={m.to.u} className="text-rw-text hover:text-rw-accent truncate" />
              </span>
            </span>
            {m.lu && name.get(m.lu) && (
              <HubLink to={{ kind: "league", slug: m.lu }} className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline">
                {name.get(m.lu)}
              </HubLink>
            )}
          </li>
        ))}
        {!list.length && <li className="py-2 text-rw-muted">{tl("No moves in the top leagues yet. See every league.")}</li>}
      </ul>
      </div>
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 50)} className="text-[11px] text-rw-accent hover:underline">
          {tl("Show {n} more", { n: Math.min(50, list.length - shown) })}
        </button>
      )}
    </div>
  );
};

const CopyMovesPost: React.FC<{ sub: string; rows: string[] }> = ({ sub, rows }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const lines: string[] = [`${tl("Roster moves")} · ${sub}`];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push("https://riftwise.gg");
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};
