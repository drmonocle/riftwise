/**
 * A league page's season at a glance (hub/leagueyear/<league>/<year>.json): the teams by record, the standout
 * players on the main stats (the top three of each, among players with 30% of the most games), and links to the
 * full leaderboard, the season's champion picks and the tier list.
 */
import React, { useEffect, useState } from "react";
import { tl, roleName } from "../../i18n";
import { bare, loadLeagueSeason, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
import { normalizeRole } from "../../hub/champAgg";
import type { EventPlayer } from "../../hub/types";
import { currentHubRoute, hubShareUrl } from "../../hub/route";
import { HubLink, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo, useLoad } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { PLAYER_METRICS } from "./Ranks";

const STANDOUT = ["kda", "dpm", "g15", "csm", "vsm", "kp"];

export const LeagueSeasonPanel: React.FC<{ league: string; year: string; name: string }> = ({ league, year, name }) => {
  const state = useLoad(() => loadLeagueSeason(league, year), [league, year]);
  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;
  const [search, setSearch] = useState(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("q") || p.get("team") || p.get("player") || p.get("role") || p.get("champ") || p.get("vs") || "";
  });
  useEffect(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    const next = p.get("q") || p.get("team") || p.get("player") || p.get("role") || p.get("champ") || p.get("vs") || "";
    if (next) setSearch(next);
  }, [routeQuery]);
  const s = state.data;
  if (!s || (!s.players.length && !s.teamStats.length)) return null;
  const maxG = Math.max(1, ...s.players.map((p) => p.g));
  const minG = Math.max(3, Math.ceil(maxG * 0.3));
  const terms = search
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((x) => normText(x.trim()))
    .filter(Boolean);
  const tSlug = (t: string, u?: string | null) => u || resolveTeamAlias(t) || prettySlug(t);
  const pSlug = (n: string, u?: string | null) => u || resolvePlayerSlug(n) || prettySlug(n);
  const allRegular = s.players.filter((p) => p.g >= minG);
  const regular = terms.length
    ? allRegular.filter((p) => {
        const hay = normText(`${p.n} ${p.u || ""} ${p.t} ${p.tu || ""} ${p.r || ""} ${p.r ? roleName(p.r) : ""}`);
        const hayBare = bare(hay);
        const canonTeam = resolveTeamAlias(p.tu || p.t || "");
        return terms.some((term) => {
          const canonRole = normalizeRole(term);
          const ta = searchAlias(term);
          return (
            hay.includes(term) ||
            (term.length >= 2 && hayBare.includes(bare(term))) ||
            (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false) ||
            (p.u ? resolvePlayerSlug(term) === p.u : false) ||
            (canonTeam ? resolveTeamAlias(term) === canonTeam : false) ||
            (canonRole && p.r ? p.r === canonRole : false) ||
            (p.c || []).some((c) => matchesChampSearch(c, term))
          );
        });
      })
    : allRegular;
  const allTeams = [...s.teamStats].sort((a, b) => b.w / Math.max(1, b.g) - a.w / Math.max(1, a.g) || b.g - a.g);
  const teams = terms.length
    ? allTeams.filter((t) => {
        const hay = normText(`${t.t} ${t.u || ""}`);
        const hayBare = bare(hay);
        const canonTeam = resolveTeamAlias(t.u || t.t);
        return terms.some((term) => {
          const ta = searchAlias(term);
          return (
            hay.includes(term) ||
            (term.length >= 2 && hayBare.includes(bare(term))) ||
            (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false) ||
            (canonTeam ? resolveTeamAlias(term) === canonTeam : false)
          );
        });
      })
    : allTeams;
  const headerTeams = teams.length >= 1 ? teams : allTeams;
  const lgSlug = resolveLeagueSlug(league);
  const qRole =
    terms.map((term) => normalizeRole(term) || (searchAlias(term) ? normalizeRole(searchAlias(term)) : null)).find(Boolean) ||
    (terms.length > 0 && regular.length === 1 && regular[0].r ? normalizeRole(regular[0].r) || regular[0].r : "");
  const qChampRaw =
    terms.map((term) => allRegular.flatMap((p) => p.c || []).find((c) => matchesChampSearch(c, term))).find(Boolean) ||
    (terms.length > 0 && regular.length === 1 && regular[0].c?.[0] ? regular[0].c[0] : "");
  const qChamp = qChampRaw ? resolveChampSlug(qChampRaw) : "";
  return (
    <Section
      title={tl("{name} {year} at a glance", { name, year })}
      right={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          {(allTeams.length > 6 || allRegular.length > 10 || Boolean(search.trim())) && (
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
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                league: lgSlug,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(qChamp ? { champ: qChamp } : {}),
                ...(terms.length > 0 && regular.length === 1
                  ? { q: regular[0].u || resolvePlayerSlug(regular[0].n) || regular[0].n }
                  : headerTeams.length >= 1
                    ? {
                        q: headerTeams
                          .slice(0, 2)
                          .map((t) => t.u || resolveTeamAlias(t.t) || prettySlug(t.t))
                          .join(","),
                      }
                    : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Full leaderboard")}
          </HubLink>
          <HubLink
            to={{
              kind: "champions",
              query: new URLSearchParams({
                league: lgSlug,
                year,
                ...(qRole ? { role: qRole } : {}),
                ...(qChamp ? { q: qChamp } : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Champion picks")}
          </HubLink>
          <HubLink
            to={{
              kind: "tiers",
              query: new URLSearchParams({
                scope: lgSlug,
                league: lgSlug,
                key: `y${year}`,
                ...(qRole ? { role: qRole } : {}),
                ...(qChamp ? { q: qChamp } : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Tier list")}
          </HubLink>
          <HubLink
            to={{
              kind: "rankings",
              query: new URLSearchParams({
                league: lgSlug,
                ...(headerTeams.length >= 1
                  ? {
                      q: headerTeams
                        .slice(0, 2)
                        .map((t) => t.u || resolveTeamAlias(t.t) || prettySlug(t.t))
                        .join(","),
                    }
                  : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Power rankings")}
          </HubLink>
          <HubLink
            to={{
              kind: "best",
              query: new URLSearchParams({
                league: lgSlug,
                year,
                ...(headerTeams.length >= 1
                  ? {
                      q: headerTeams
                        .slice(0, 2)
                        .map((t) => t.u || resolveTeamAlias(t.t) || prettySlug(t.t))
                        .join(","),
                    }
                  : {}),
              }).toString(),
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Best games")}
          </HubLink>
          <HubLink
            to={{
              kind: "finder",
              query: `league=${encodeURIComponent(lgSlug)}&year=${encodeURIComponent(year)}${qRole ? `&role=${encodeURIComponent(qRole)}` : ""}${qChamp ? `&champ=${encodeURIComponent(qChamp)}` : ""}${
                terms.length > 0 && regular.length === 1
                  ? `&player=${encodeURIComponent(pSlug(regular[0].n, regular[0].u))}`
                  : headerTeams.length >= 1
                    ? `&team=${encodeURIComponent(tSlug(headerTeams[0].t, headerTeams[0].u))}${
                        terms.length && headerTeams[1] ? `&vs=${encodeURIComponent(tSlug(headerTeams[1].t, headerTeams[1].u))}` : ""
                      }`
                    : ""
              }`,
            }}
            className="text-rw-accent hover:underline"
          >
            {tl("Game finder")}
          </HubLink>
          {headerTeams.length >= 1 && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: tSlug(headerTeams[0].t, headerTeams[0].u),
                  ...(headerTeams[1] ? { b: tSlug(headerTeams[1].t, headerTeams[1].u) } : {}),
                  period: `y${year}`,
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Match prep")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(tSlug(headerTeams[0].t, headerTeams[0].u))}${headerTeams[1] ? `,${encodeURIComponent(tSlug(headerTeams[1].t, headerTeams[1].u))}` : ""}&p=y${encodeURIComponent(year)}${qRole ? `&role=${encodeURIComponent(qRole)}` : ""}${qChamp ? `&champ=${encodeURIComponent(qChamp)}` : ""}`,
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: tSlug(headerTeams[0].t, headerTeams[0].u),
                  ...(headerTeams[1] ? { b: tSlug(headerTeams[1].t, headerTeams[1].u) } : {}),
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
                      <HubLink
                        to={{ kind: "team", slug: tSlug(t.t, t.u), query: `p=y${encodeURIComponent(year)}` }}
                        className="shrink-0 hover:opacity-80"
                        title={t.t}
                      >
                        <TeamLogo name={t.t} size={15} />
                      </HubLink>
                      <TeamLink name={t.t} u={t.u} query={`p=y${encodeURIComponent(year)}`} className="text-rw-text hover:text-rw-accent truncate" />
                    </span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-rw-sub shrink-0">
                      <span>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `league=${encodeURIComponent(lgSlug)}&year=${encodeURIComponent(year)}&team=${encodeURIComponent(tSlug(t.t, t.u))}`,
                          }}
                          className="hover:text-rw-accent hover:underline"
                        >
                          {t.w}-{t.g - t.w}
                        </HubLink>{" "}
                        <HubLink
                          to={{ kind: "team", slug: tSlug(t.t, t.u), tab: "stats", query: `p=y${encodeURIComponent(year)}` }}
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
              <span className="flex items-center gap-2" data-nocapture="1">
                {regular.length >= 1 && (
                  <>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "player",
                        a: pSlug(regular[0].n, regular[0].u),
                        ...(regular[1] ? { b: pSlug(regular[1].n, regular[1].u) } : {}),
                        period: `y${year}`,
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: `player=${encodeURIComponent(pSlug(regular[0].n, regular[0].u))}&year=${encodeURIComponent(year)}${regular[0].r ? `&role=${encodeURIComponent(regular[0].r)}` : ""}`,
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    {(regular[0].tu || regular[0].t) && (
                      <>
                        <HubLink
                          to={{
                            kind: "prep",
                            a: tSlug(regular[0].t, regular[0].tu),
                            ...(regular[1] && (regular[1].tu || regular[1].t) && tSlug(regular[1].t, regular[1].tu) !== tSlug(regular[0].t, regular[0].tu)
                              ? { b: tSlug(regular[1].t, regular[1].tu) }
                              : {}),
                            period: `y${year}`,
                          }}
                          className="text-[11px] font-semibold text-rw-accent hover:underline"
                        >
                          {tl("Match prep")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "draft",
                            query: `teams=${encodeURIComponent(tSlug(regular[0].t, regular[0].tu))}${
                              regular[1] && (regular[1].tu || regular[1].t) && tSlug(regular[1].t, regular[1].tu) !== tSlug(regular[0].t, regular[0].tu)
                                ? `,${encodeURIComponent(tSlug(regular[1].t, regular[1].tu))}`
                                : ""
                            }&p=y${encodeURIComponent(year)}`,
                          }}
                          className="text-[11px] font-semibold text-rw-accent hover:underline"
                        >
                          {tl("Draft board")} →
                        </HubLink>
                      </>
                    )}
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `league=${encodeURIComponent(lgSlug)}&year=${encodeURIComponent(year)}&player=${encodeURIComponent(pSlug(regular[0].n, regular[0].u))}${
                          terms.length > 0 && regular[1] && pSlug(regular[1].n, regular[1].u) !== pSlug(regular[0].n, regular[0].u)
                            ? `&vsplayer=${encodeURIComponent(pSlug(regular[1].n, regular[1].u))}`
                            : ""
                        }`,
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: `scope=${encodeURIComponent(lgSlug)}&league=${encodeURIComponent(lgSlug)}&key=y${encodeURIComponent(year)}${regular[0].r ? `&role=${encodeURIComponent(regular[0].r)}` : ""}`,
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          league: lgSlug,
                          year,
                          ...(regular[0].r ? { role: regular[0].r } : {}),
                          ...(regular[0]
                            ? {
                                q:
                                  regular.length === 1
                                    ? regular[0].u || resolvePlayerSlug(regular[0].n) || regular[0].n
                                    : `${regular[0].u || resolvePlayerSlug(regular[0].n) || regular[0].n}${regular[1] ? `,${regular[1].u || resolvePlayerSlug(regular[1].n) || regular[1].n}` : ""}`,
                              }
                            : {}),
                        }).toString(),
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        query: new URLSearchParams({
                          league: lgSlug,
                          ...(regular[0]?.tu || regular[0]?.t
                            ? {
                                q: `${tSlug(regular[0].t, regular[0].tu)}${
                                  regular[1] &&
                                  (regular[1].tu || regular[1].t) &&
                                  tSlug(regular[1].t, regular[1].tu) !== tSlug(regular[0].t, regular[0].tu)
                                    ? `,${tSlug(regular[1].t, regular[1].tu)}`
                                    : ""
                                }`,
                              }
                            : {}),
                        }).toString(),
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                  </>
                )}
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
                      <HubLink to={{ kind: "leaders", query: `league=${encodeURIComponent(lgSlug)}&year=${encodeURIComponent(year)}&stat=${encodeURIComponent(m.key)}` }} className="hover:underline">
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
                                <HubLink
                                  to={{ kind: "player", slug: pSlug(p.n, p.u), query: `p=y${encodeURIComponent(year)}` }}
                                  className="shrink-0 hover:opacity-80"
                                  title={p.n}
                                >
                                  <PlayerPhoto name={p.n} team={p.t} slug={p.u ?? undefined} size={16} />
                                </HubLink>
                                {p.t && (
                                  <HubLink
                                    to={{ kind: "team", slug: tSlug(p.t, p.tu), query: `p=y${encodeURIComponent(year)}` }}
                                    className="shrink-0 hover:opacity-80"
                                    title={p.t}
                                  >
                                    <TeamLogo name={p.t} size={13} />
                                  </HubLink>
                                )}
                                <PlayerLink name={p.n} u={p.u} query={`p=y${encodeURIComponent(year)}`} className="text-rw-text hover:text-rw-accent truncate" />{" "}
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
                                    query: `league=${encodeURIComponent(lgSlug)}&year=${encodeURIComponent(year)}&player=${encodeURIComponent(pSlug(p.n, p.u))}`,
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
                to={{ kind: "leaders", query: `league=${encodeURIComponent(lgSlug)}&year=${encodeURIComponent(year)}` }}
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
