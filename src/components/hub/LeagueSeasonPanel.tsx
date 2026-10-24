/**
 * A league page's season at a glance (hub/leagueyear/<league>/<year>.json): the teams by record, the standout
 * players on the main stats (the top three of each, among players with 30% of the most games), and links to the
 * full leaderboard, the season's champion picks and the tier list.
 */
import React from "react";
import { tl, roleName } from "../../i18n";
import { loadLeagueSeason } from "../../hub/data";
import type { EventPlayer } from "../../hub/types";
import { HubLink, PlayerLink, Section, TeamLink, useLoad } from "./ui";
import { PLAYER_METRICS } from "./Ranks";

const STANDOUT = ["kda", "dpm", "g15", "csm", "vsm", "kp"];

export const LeagueSeasonPanel: React.FC<{ league: string; year: string; name: string }> = ({ league, year, name }) => {
  const state = useLoad(() => loadLeagueSeason(league, year), [league, year]);
  const s = state.data;
  if (!s || (!s.players.length && !s.teamStats.length)) return null;
  const maxG = Math.max(1, ...s.players.map((p) => p.g));
  const minG = Math.max(3, Math.ceil(maxG * 0.3));
  const regular = s.players.filter((p) => p.g >= minG);
  const teams = [...s.teamStats].sort((a, b) => b.w / Math.max(1, b.g) - a.w / Math.max(1, a.g) || b.g - a.g);
  return (
    <Section
      title={tl("{name} {year} at a glance", { name, year })}
      right={
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
          <HubLink to={{ kind: "leaders", query: `league=${league}&year=${year}` }} className="text-rw-teal hover:underline">
            {tl("Full leaderboard")}
          </HubLink>
          <HubLink to={{ kind: "champions", query: `league=${league}&year=${year}` }} className="text-rw-teal hover:underline">
            {tl("Champion picks")}
          </HubLink>
        </span>
      }
      share={`riftwise-${league}-${year}-glance`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        {teams.length > 0 && (
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Teams by record")}</div>
            <ol className="text-xs space-y-0.5">
              {teams.slice(0, 12).map((t, i) => (
                <li key={t.u || t.t} className="flex justify-between gap-2 min-w-0">
                  <span className="truncate">
                    <span className="text-rw-muted tabular-nums w-5 inline-block">{i + 1}</span>
                    <TeamLink name={t.t} u={t.u} className="text-rw-text hover:text-rw-accent" />
                  </span>
                  <span className="tabular-nums text-rw-sub shrink-0">
                    {t.w}-{t.g - t.w} <span className="text-rw-muted">({Math.round((t.w / Math.max(1, t.g)) * 100)}%)</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-[10px] text-rw-muted mt-1">{tl("Games won and lost over the whole season (all splits and playoffs).")}</p>
          </div>
        )}
        {regular.length > 0 && (
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Standout players")}</div>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              {PLAYER_METRICS.filter((m) => STANDOUT.includes(m.key)).map((m) => {
                const top = regular
                  .map((p) => ({ p, v: m.value(p) }))
                  .filter((x): x is { p: EventPlayer; v: number } => x.v != null)
                  .sort((a, b) => (m.low ? a.v - b.v : b.v - a.v))
                  .slice(0, 3);
                if (!top.length) return null;
                return (
                  <div key={m.key} className="min-w-0">
                    <div className="text-[11px] font-semibold text-rw-accent truncate" title={m.label}>
                      {m.label}
                    </div>
                    <ol className="text-xs">
                      {top.map(({ p, v }) => (
                        <li key={`${p.u || p.n}-${p.t}`} className="flex justify-between gap-2 min-w-0">
                          <span className="truncate">
                            <PlayerLink name={p.n} u={p.u} className="text-rw-text hover:text-rw-accent" />{" "}
                            <span className="text-[10px] text-rw-muted">{roleName(p.r)}</span>
                          </span>
                          <span className="tabular-nums text-rw-sub shrink-0">{m.fmt(v)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-rw-muted mt-1">{tl("Players with {n}+ games.", { n: minG })}</p>
          </div>
        )}
      </div>
    </Section>
  );
};
