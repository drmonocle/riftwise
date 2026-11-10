/**
 * A league page's season at a glance (hub/leagueyear/<league>/<year>.json): the teams by record, the standout
 * players on the main stats (the top three of each, among players with 30% of the most games), and links to the
 * full leaderboard, the season's champion picks and the tier list.
 */
import React, { useState } from "react";
import { tl, roleName } from "../../i18n";
import { loadLeagueSeason, prettySlug } from "../../hub/data";
import type { EventPlayer } from "../../hub/types";
import { hubShareUrl } from "../../hub/route";
import { HubLink, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo, useLoad } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { PLAYER_METRICS } from "./Ranks";

const STANDOUT = ["kda", "dpm", "g15", "csm", "vsm", "kp"];

export const LeagueSeasonPanel: React.FC<{ league: string; year: string; name: string }> = ({ league, year, name }) => {
  const state = useLoad(() => loadLeagueSeason(league, year), [league, year]);
  const [search, setSearch] = useState("");
  const s = state.data;
  if (!s || (!s.players.length && !s.teamStats.length)) return null;
  const maxG = Math.max(1, ...s.players.map((p) => p.g));
  const minG = Math.max(3, Math.ceil(maxG * 0.3));
  const terms = search
    .toLowerCase()
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  const allRegular = s.players.filter((p) => p.g >= minG);
  const regular = terms.length
    ? allRegular.filter((p) => terms.some((term) => `${p.n} ${p.u || ""} ${p.t} ${p.tu || ""}`.toLowerCase().includes(term)))
    : allRegular;
  const allTeams = [...s.teamStats].sort((a, b) => b.w / Math.max(1, b.g) - a.w / Math.max(1, a.g) || b.g - a.g);
  const teams = terms.length
    ? allTeams.filter((t) => terms.some((term) => `${t.t} ${t.u || ""}`.toLowerCase().includes(term)))
    : allTeams;
  const headerTeams = teams.length >= 2 ? teams : allTeams;
  return (
    <Section
      title={tl("{name} {year} at a glance", { name, year })}
      right={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          {(allTeams.length > 6 || allRegular.length > 10) && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              data-nocapture="1"
              className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] font-normal text-rw-text w-36"
            />
          )}
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
          {headerTeams.length >= 2 && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: headerTeams[0].u || prettySlug(headerTeams[0].t),
                  b: headerTeams[1].u || prettySlug(headerTeams[1].t),
                  period: `y${year}`,
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Match prep")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(headerTeams[0].u || prettySlug(headerTeams[0].t))},${encodeURIComponent(headerTeams[1].u || prettySlug(headerTeams[1].t))}&p=y${encodeURIComponent(year)}`,
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: headerTeams[0].u || prettySlug(headerTeams[0].t),
                  b: headerTeams[1].u || prettySlug(headerTeams[1].t),
                  period: `y${year}`,
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Compare")}
              </HubLink>
            </>
          )}
          {teams.length > 0 && (
            <>
              <CopyLeagueGlancePost
                title={tl("{name} {year} at a glance", { name, year })}
                league={league}
                year={year}
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
                    win: t.g > 0 ? t.w / t.g >= 0.5 : undefined,
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
                      <HubLink to={{ kind: "team", slug: t.u || prettySlug(t.t) }} className="shrink-0 hover:opacity-80" title={t.t}>
                        <TeamLogo name={t.t} size={15} />
                      </HubLink>
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
                        <HubLink
                          to={{ kind: "team", slug: t.u || prettySlug(t.t), tab: "stats", query: `p=y${encodeURIComponent(year)}` }}
                          className={`hover:underline ${wrPct >= 55 ? "text-rw-teal font-semibold" : wrPct <= 45 ? "text-rw-red" : "text-rw-muted"}`}
                        >
                          ({wrPct}%)
                        </HubLink>
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
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[10px] font-semibold text-rw-muted">{tl("Standout players")}</div>
              <span data-nocapture="1">
                <SectionCard
                  section={tl("Standout players")}
                  name={`${name} ${year}`}
                  sub={tl("{name} {year} at a glance", { name, year })}
                  rows={() =>
                    PLAYER_METRICS.filter((m) => STANDOUT.includes(m.key))
                      .map((m, idx) => {
                        const top = regular
                          .map((p) => ({ p, v: m.value(p) }))
                          .filter((x): x is { p: EventPlayer; v: number } => x.v != null)
                          .sort((a, b) => (m.low ? a.v - b.v : b.v - a.v))[0];
                        if (!top) return null;
                        return {
                          rank: idx + 1,
                          team: top.p.t,
                          label: `${top.p.n} (${top.p.t})`,
                          sub: m.label,
                          value: m.fmt(top.v),
                          win: true,
                        };
                      })
                      .filter((x): x is NonNullable<typeof x> => !!x)
                  }
                />
              </span>
            </div>
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
                                <HubLink to={{ kind: "player", slug: p.u || prettySlug(p.n) }} className="shrink-0 hover:opacity-80" title={p.n}>
                                  <PlayerPhoto name={p.n} team={p.t} slug={p.u ?? undefined} size={16} />
                                </HubLink>
                                {p.t && (
                                  <HubLink to={{ kind: "team", slug: p.tu || prettySlug(p.t) }} className="shrink-0 hover:opacity-80" title={p.t}>
                                    <TeamLogo name={p.t} size={13} />
                                  </HubLink>
                                )}
                                <PlayerLink name={p.n} u={p.u} className="text-rw-text hover:text-rw-accent truncate" />{" "}
                                {p.u ? (
                                  <HubLink
                                    to={{ kind: "player", slug: p.u, tab: "stats", query: `p=y${encodeURIComponent(year)}` }}
                                    className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline shrink-0"
                                  >
                                    {roleName(p.r)}
                                  </HubLink>
                                ) : (
                                  <span className="text-[10px] text-rw-muted shrink-0">{roleName(p.r)}</span>
                                )}
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
            <p className="text-[10px] text-rw-muted mt-1">
              <HubLink
                to={{ kind: "leaders", query: `league=${encodeURIComponent(league)}&year=${encodeURIComponent(year)}` }}
                className="hover:text-rw-accent hover:underline"
              >
                {tl("Players with {n}+ games.", { n: minG })}
              </HubLink>
            </p>
          </div>
        )}
      </div>
    </Section>
  );
};

const CopyLeagueGlancePost: React.FC<{
  title: string;
  league: string;
  year: string;
  teams: { t: string; w: number; g: number }[];
}> = ({ title, league, year, teams }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [title];
    for (const [idx, t] of teams.slice(0, 6).entries()) {
      lines.push(`#${idx + 1} ${t.t}: ${t.w}–${t.g - t.w} (${Math.round((t.w / Math.max(1, t.g)) * 100)}%)`);
    }
    lines.push(hubShareUrl({ kind: "league", slug: league, year }));
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        setState("failed");
        setTimeout(() => setState("idle"), 2400);
      });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] font-normal text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
