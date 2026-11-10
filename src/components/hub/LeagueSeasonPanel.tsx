/**
 * A league page's season at a glance (hub/leagueyear/<league>/<year>.json): the teams by record, the standout
 * players on the main stats (the top three of each, among players with 30% of the most games), and links to the
 * full leaderboard, the season's champion picks and the tier list.
 */
import React, { useState } from "react";
import { tl, roleName } from "../../i18n";
import { loadLeagueSeason } from "../../hub/data";
import type { EventPlayer } from "../../hub/types";
import { HubLink, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo, useLoad } from "./ui";
import { SectionCard } from "./BroadcastCard";
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
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          <HubLink to={{ kind: "leaders", query: `league=${league}&year=${year}` }} className="text-rw-accent hover:underline">
            {tl("Full leaderboard")}
          </HubLink>
          <HubLink to={{ kind: "champions", query: `league=${league}&year=${year}` }} className="text-rw-accent hover:underline">
            {tl("Champion picks")}
          </HubLink>
          <HubLink to={{ kind: "tiers", query: `league=${league}&year=${year}` }} className="text-rw-accent hover:underline">
            {tl("Tier list")}
          </HubLink>
          <HubLink to={{ kind: "finder", query: `league=${league}&year=${year}` }} className="text-rw-accent hover:underline">
            {tl("Game finder")}
          </HubLink>
          {teams.length >= 2 && (
            <HubLink
              to={{
                kind: "compare",
                mode: "team",
                a: teams[0].u || teams[0].t,
                b: teams[1].u || teams[1].t,
                period: `e:${league}`,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Compare")}
            </HubLink>
          )}
          {teams.length > 0 && (
            <>
              <CopyLeagueGlancePost
                title={tl("{name} {year} at a glance", { name, year })}
                league={league}
                teams={teams}
              />
              <SectionCard
                section={tl("{name} {year} at a glance", { name, year })}
                sub={tl("Teams by record")}
                name={`${league}-${year}-glance`}
                rows={() =>
                  teams.slice(0, 10).map((t, idx) => ({
                    rank: idx + 1,
                    team: t.t,
                    label: t.t,
                    sub: `${t.w}-${t.g - t.w}`,
                    value: `${Math.round((t.w / Math.max(1, t.g)) * 100)}%`,
                  }))
                }
              />
            </>
          )}
        </span>
      }
      share={`riftwise-${league}-${year}-glance`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        {teams.length > 0 && (
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Teams by record")}</div>
            <ol className="text-xs space-y-1">
              {teams.slice(0, 12).map((t, i) => {
                const wrPct = Math.round((t.w / Math.max(1, t.g)) * 100);
                return (
                  <li key={t.u || t.t} className="flex items-center justify-between gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                      <span className="text-rw-muted tabular-nums w-4 inline-block shrink-0">{i + 1}</span>
                      <TeamLogo name={t.t} size={15} />
                      <TeamLink name={t.t} u={t.u} className="text-rw-text hover:text-rw-accent truncate" />
                    </span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-rw-sub shrink-0">
                      <span>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `league=${encodeURIComponent(league)}&year=${encodeURIComponent(year)}&team=${encodeURIComponent(t.u || t.t)}`,
                          }}
                          className="hover:text-rw-accent hover:underline"
                        >
                          {t.w}-{t.g - t.w}
                        </HubLink>{" "}
                        <span className={wrPct >= 55 ? "text-rw-teal font-semibold" : wrPct <= 45 ? "text-rw-red" : "text-rw-muted"}>({wrPct}%)</span>
                      </span>
                      <span className="w-9 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                        <span
                          className={`block h-full rounded-full ${wrPct >= 55 ? "bg-rw-teal/80" : wrPct <= 45 ? "bg-rw-red/75" : "bg-rw-sub/60"}`}
                          style={{ width: `${Math.max(6, wrPct)}%` }}
                        />
                      </span>
                    </span>
                  </li>
                );
              })}
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
                      <HubLink to={{ kind: "leaders", query: `league=${league}&year=${year}&stat=${m.key}` }} className="hover:underline">
                        {m.label}
                      </HubLink>
                    </div>
                    <ol className="text-xs space-y-0.5">
                      {(() => {
                        const maxV = Math.max(0.01, ...top.map((x) => Math.abs(x.v)));
                        return top.map(({ p, v }) => {
                          const barPct = Math.max(12, Math.min(100, Math.round((Math.abs(v) / maxV) * 100)));
                          return (
                            <li key={`${p.u || p.n}-${p.t}`} className="flex items-center justify-between gap-2 min-w-0">
                              <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                                <PlayerPhoto name={p.n} team={p.t} slug={p.u ?? undefined} size={16} />
                                {p.t && <TeamLogo name={p.t} size={13} />}
                                <PlayerLink name={p.n} u={p.u} className="text-rw-text hover:text-rw-accent truncate" />{" "}
                                <span className="text-[10px] text-rw-muted shrink-0">{roleName(p.r)}</span>
                              </span>
                              <span className="inline-flex items-center gap-1.5 tabular-nums text-rw-sub shrink-0">
                                <HubLink
                                  to={{
                                    kind: "finder",
                                    query: `league=${encodeURIComponent(league)}&year=${encodeURIComponent(year)}&player=${encodeURIComponent(p.u || p.n)}`,
                                  }}
                                  className="hover:text-rw-accent hover:underline"
                                >
                                  {m.fmt(v)}
                                </HubLink>
                                <span className="w-7 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                                  <span className="block h-full rounded-full bg-rw-accent/70" style={{ width: `${barPct}%` }} />
                                </span>
                              </span>
                            </li>
                          );
                        });
                      })()}
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

const CopyLeagueGlancePost: React.FC<{
  title: string;
  league: string;
  teams: { t: string; w: number; g: number }[];
}> = ({ title, league, teams }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const lines: string[] = [title];
    for (const [idx, t] of teams.slice(0, 6).entries()) {
      lines.push(`#${idx + 1} ${t.t}: ${t.w}–${t.g - t.w} (${Math.round((t.w / Math.max(1, t.g)) * 100)}%)`);
    }
    lines.push(`https://riftwise.gg/league/${league}`);
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
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] font-normal text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};
