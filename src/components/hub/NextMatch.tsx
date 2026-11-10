/**
 * "Next match" at the top of a team page's Overview (TV, 2026-10-28): the team's coming series from Riot's schedule
 * (the copy match pages read), up to three. The first one in full: league, stage and best-of, the opponent, when (or
 * that it's on now), each side's chance from the power rankings, the all-time head-to-head in games, Match prep and
 * the match page; the next two as a line each. Nothing shows for a team with nothing coming up, or when the schedule
 * can't be read.
 */
import React, { useEffect, useState } from "react";
import type { Match } from "../../types";
import type { HubTeam, TeamSeriesRow } from "../../hub/types";
import { tl, tc, roleName } from "../../i18n";
import { findHubTeam, loadHubIndexQuick, loadHubTeam, loadTeamSeries, prettySlug, resolveLeagueSlug, teamStarter } from "../../hub/data";
import { recentSchedule, RIOT_PREFIX } from "../../hub/riotMatch";
import { useMatchRatings } from "../../hub/matchRatings";
import { formatMatchTime } from "../../matchTime";
import { MatchPrepButton } from "../MatchPrepButton";
import { MatchOverviewButton } from "../MatchOverviewButton";
import { SectionCard } from "./BroadcastCard";
import { fmtDate, HubLink, PlayerPhoto, Section, TeamLink, TeamLogo } from "./ui";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
const ROLE_SHORT: Record<string, string> = { Top: "TOP", Jungle: "JGL", Mid: "MID", Bot: "BOT", Support: "SUP" };

interface Coming {
  m: Match;
  /** which side of Riot's match this team is */
  us: 1 | 2;
  /** the opponent's hub team, when it has one */
  opp: string | null;
}

const DAY_MS = 86_400_000;

export const NextMatch: React.FC<{ t: HubTeam }> = ({ t }) => {
  const [list, setList] = useState<Coming[]>([]);
  useEffect(() => {
    setList([]);
    if (t.disbanded) return;
    let alive = true;
    Promise.all([recentSchedule(), loadHubIndexQuick()])
      .then(([schedule, index]) => {
        // the next three weeks; a series that began in the last six hours and isn't over is on now
        const now = Date.now();
        const mine: Coming[] = [];
        for (const m of schedule) {
          const at = Date.parse(m.startTimeUtc);
          if (m.state === "completed" || !(at > now - DAY_MS / 4 && at < now + 21 * DAY_MS)) continue;
          const a = findHubTeam(index, m.team1Name, m.team1Code);
          const b = findHubTeam(index, m.team2Name, m.team2Code);
          if (a === t.u && b !== t.u) mine.push({ m, us: 1, opp: b });
          else if (b === t.u && a !== t.u) mine.push({ m, us: 2, opp: a });
        }
        mine.sort((x, y) => x.m.startTimeUtc.localeCompare(y.m.startTimeUtc));
        if (alive) setList(mine.slice(0, 3));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [t.u, t.disbanded]);
  if (!list.length) return null;
  const [first, ...rest] = list;
  const firstYr = first.m.startTimeUtc && /^\d{4}$/.test(first.m.startTimeUtc.slice(0, 4)) ? first.m.startTimeUtc.slice(0, 4) : "";
  const firstLg = first.m.leagueSlug || first.m.leagueName ? resolveLeagueSlug(first.m.leagueSlug || first.m.leagueName) : "";
  return (
    <Section
      title={tl("Next match")}
      share={`${t.u}-next-match`}
      right={
        <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
          {first.opp && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: t.u,
                  b: first.opp,
                  ...(firstYr ? { period: `y${firstYr}` } : {}),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(t.u)},${encodeURIComponent(first.opp)}${firstYr ? `&p=y${firstYr}` : ""}`,
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: t.u,
                  b: first.opp,
                  ...(firstYr ? { period: `y${firstYr}` } : {}),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    team: t.u,
                    vs: first.opp,
                    ...(firstYr ? { year: firstYr } : {}),
                    ...(firstLg ? { league: firstLg } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{ kind: "rankings", ...(firstLg ? { query: `league=${encodeURIComponent(firstLg)}` } : {}) }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  ...((firstLg || firstYr)
                    ? {
                        query: new URLSearchParams({
                          ...(firstLg ? { league: firstLg } : {}),
                          ...(firstYr ? { key: `y${firstYr}` } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  ...((firstLg || firstYr)
                    ? {
                        query: new URLSearchParams({
                          ...(firstLg ? { league: firstLg } : {}),
                          ...(firstYr ? { year: firstYr } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Player leaderboards")} →
              </HubLink>
            </>
          )}
          <SectionCard
            section={tl("Next match")}
            name={t.name}
            sub={first.m.leagueName}
            rows={() =>
              list.map((c, idx) => {
                const [, them] = sides(c);
                return {
                  rank: idx + 1,
                  team: them.name || them.code,
                  label: `${tl("vs")} ${them.name || them.code}`,
                  sub: [c.m.leagueName, c.m.blockName, tc("short best of", "Bo{n}", { n: c.m.bestOf || 1 })].filter(Boolean).join(" · "),
                  value: c.m.state === "inProgress" ? tl("On now") : formatMatchTime(c.m.startTimeUtc),
                };
              })
            }
          />
        </span>
      }
    >
      <FirstMatch c={first} t={t} />
      {rest.length > 0 && (
        <ul className="text-xs space-y-1 pt-2 border-t border-rw-border">
          {rest.map((c) => {
            const [, them] = sides(c);
            const yr = c.m.startTimeUtc?.slice(0, 4);
            const period = yr && /^\d{4}$/.test(yr) ? `y${yr}` : undefined;
            return (
              <li key={c.m.matchId} className="flex items-center justify-between gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                  {c.opp ? (
                    <HubLink
                      to={{ kind: "compare", mode: "team", a: t.u, b: c.opp, period }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Compare")}
                    >
                      {tl("vs")}
                    </HubLink>
                  ) : (
                    <span className="text-rw-sub">{tl("vs")}</span>
                  )}
                  <HubLink to={{ kind: "team", slug: c.opp || prettySlug(them.name) }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
                    <TeamLogo name={them.name} code={them.code} src={them.img} size={15} className="shrink-0" />
                  </HubLink>
                  <TeamLink name={them.name} u={c.opp} className="truncate hover:text-rw-accent" />
                  <span className="text-rw-muted truncate">
                    ·{" "}
                    <HubLink to={{ kind: "league", slug: resolveLeagueSlug(c.m.leagueSlug || c.m.leagueName) }} className="hover:text-rw-accent hover:underline">
                      {c.m.leagueName}
                    </HubLink>
                    {c.m.blockName ? ` · ${c.m.blockName}` : ""}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  <MatchPrepButton match={c.m} compact />
                  {c.opp && (
                    <>
                      <HubLink
                        to={{ kind: "draft", query: `teams=${encodeURIComponent(t.u)},${encodeURIComponent(c.opp)}${period ? `&p=${encodeURIComponent(period)}` : ""}` }}
                        className="text-[11px] font-medium text-rw-accent hover:underline"
                      >
                        {tl("Draft board")}
                      </HubLink>
                      <HubLink
                        to={{ kind: "compare", mode: "team", a: t.u, b: c.opp, period }}
                        className="text-[11px] font-medium text-rw-accent hover:underline"
                      >
                        {tl("Compare")}
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "finder",
                          query: new URLSearchParams({
                            team: t.u,
                            vs: c.opp,
                            ...(yr && /^\d{4}$/.test(yr) ? { year: yr } : {}),
                            ...(c.m.leagueSlug || c.m.leagueName ? { league: resolveLeagueSlug(c.m.leagueSlug || c.m.leagueName) } : {}),
                          }).toString(),
                        }}
                        className="text-[11px] font-medium text-rw-accent hover:underline"
                      >
                        {tl("Game finder")}
                      </HubLink>
                    </>
                  )}
                  <MatchOverviewButton match={c.m} compact />
                  <HubLink to={{ kind: "match", slug: RIOT_PREFIX + c.m.matchId }} className="text-rw-muted hover:text-rw-accent hover:underline">
                    {formatMatchTime(c.m.startTimeUtc)}
                  </HubLink>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
};

/** this team's side of the match, then the opponent's */
function sides({ m, us }: Coming) {
  const one = { code: m.team1Code, name: m.team1Name, img: m.team1Image };
  const two = { code: m.team2Code, name: m.team2Name, img: m.team2Image };
  return us === 1 ? [one, two] : [two, one];
}

const FirstMatch: React.FC<{ c: Coming; t: HubTeam }> = ({ c, t }) => {
  const { m } = c;
  const [ours, them] = sides(c);
  const r = useMatchRatings(m);
  const chance = r?.series == null ? null : Math.round((c.us === 1 ? r.series : 1 - r.series) * 100);
  const h2h = c.opp ? t.opps.find((o) => o.u === c.opp) : undefined;
  const live = m.state === "inProgress";
  const [oppTeam, setOppTeam] = useState<HubTeam | null>(null);
  const [lastMeeting, setLastMeeting] = useState<TeamSeriesRow | null>(null);
  useEffect(() => {
    setOppTeam(null);
    setLastMeeting(null);
    if (!c.opp) return;
    let alive = true;
    loadHubTeam(c.opp)
      .then((ot) => alive && setOppTeam(ot))
      .catch(() => {});
    loadTeamSeries(t.u)
      .then((rows) => {
        if (!alive) return;
        const found = [...rows].filter((x) => x[2] === c.opp).sort((a, b) => (a[0] < b[0] ? 1 : -1))[0] || null;
        setLastMeeting(found);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [c.opp, t.u]);
  const lanePairs = oppTeam
    ? ROLES.map((role) => ({ role, a: teamStarter(t, role), b: teamStarter(oppTeam, role) }))
    : [];
  const hasLanePairs = lanePairs.filter((lp) => lp.a && lp.b).length >= 3;
  const yr = m.startTimeUtc?.slice(0, 4);
  const period = yr && /^\d{4}$/.test(yr) ? `y${yr}` : undefined;
  const lg = m.leagueSlug || m.leagueName ? resolveLeagueSlug(m.leagueSlug || m.leagueName) : "";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <span className="min-w-0 truncate">
          <HubLink to={{ kind: "league", slug: resolveLeagueSlug(m.leagueSlug || m.leagueName) }} className="font-bold text-rw-accent hover:underline">
            {m.leagueName}
          </HubLink>
          {m.blockName && <span className="text-rw-sub"> · {m.blockName}</span>}
          <span className="text-rw-muted">
            {" · "}
            {c.opp ? (
              <HubLink to={{ kind: "prep", a: t.u, b: c.opp, period }} className="hover:text-rw-accent hover:underline" title={tl("Match prep")}>
                {tc("short best of", "Bo{n}", { n: m.bestOf || 1 })}
              </HubLink>
            ) : (
              tc("short best of", "Bo{n}", { n: m.bestOf || 1 })
            )}
          </span>
        </span>
        {live ? (
          <span className="flex items-center gap-1 font-semibold text-rw-red shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-rw-red animate-pulse" aria-hidden="true" />
            {tl("On now")}
          </span>
        ) : (
          <HubLink to={{ kind: "match", slug: RIOT_PREFIX + m.matchId }} className="font-mono font-medium text-rw-text hover:text-rw-accent hover:underline shrink-0">
            {formatMatchTime(m.startTimeUtc)}
          </HubLink>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 min-w-0">
        {/* short names on a phone ("Movistar KOI" didn't fit beside its logo) */}
        <span className="flex items-center gap-2 min-w-0 justify-end flex-1">
          <span className="font-bold text-sm text-rw-text truncate max-sm:hidden">
            <TeamLink name={t.name} u={t.u} />
          </span>
          <span className="font-bold text-sm text-rw-text sm:hidden">
            <TeamLink name={ours.code || t.name} u={t.u} />
          </span>
          <HubLink to={{ kind: "team", slug: t.u }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
            <TeamLogo name={t.name} code={ours.code} src={ours.img} size={32} className="shrink-0" />
          </HubLink>
        </span>
        {c.opp ? (
          <HubLink
            to={{ kind: "compare", mode: "team", a: t.u, b: c.opp, period }}
            className="text-rw-sub hover:text-rw-accent hover:underline text-xs shrink-0"
            title={tl("Compare")}
          >
            {tl("vs")}
          </HubLink>
        ) : (
          <span className="text-rw-sub text-xs shrink-0">{tl("vs")}</span>
        )}
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <HubLink to={{ kind: "team", slug: c.opp || prettySlug(them.name) }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
            <TeamLogo name={them.name} code={them.code} src={them.img} size={32} className="shrink-0" />
          </HubLink>
          <span className="font-bold text-sm truncate min-w-0 max-sm:hidden">
            <TeamLink name={them.name} u={c.opp} />
          </span>
          <span className="font-bold text-sm sm:hidden">
            <TeamLink name={them.code || them.name} u={c.opp} />
          </span>
        </span>
      </div>
      {(chance != null || h2h) && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
          {chance != null && (
            <HubLink
              to={{ kind: "rankings", ...(lg ? { query: `league=${encodeURIComponent(lg)}` } : {}) }}
              className="flex items-center gap-1.5 w-48 max-w-full hover:opacity-90"
              title={tl("Chance to win the series, from the power rankings (every pro game since 2011)")}
            >
              <span className="font-mono tabular-nums text-rw-side-a w-8 text-right hover:underline">{chance}%</span>
              <span className="flex-1 h-1.5 rounded-sm overflow-hidden bg-rw-side-b/70" aria-hidden="true">
                <span className="block h-full bg-rw-side-a" style={{ width: `${chance}%` }} />
              </span>
              <span className="font-mono tabular-nums text-rw-side-b w-8 hover:underline">{100 - chance}%</span>
            </HubLink>
          )}
          {h2h && (
            <HubLink
              to={{ kind: "compare", mode: "team", a: t.u, b: c.opp || undefined, period }}
              className="inline-flex items-center gap-1.5 font-mono tabular-nums text-rw-sub hover:text-rw-accent hover:underline"
              title={tl("All-time head-to-head, in games")}
            >
              <span>
                H2H {h2h.w}–{h2h.g - h2h.w}
              </span>
              {h2h.g > 0 && (
                <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                  <span className="h-full bg-rw-side-a/85" style={{ width: `${Math.round((h2h.w / h2h.g) * 100)}%` }} />
                  <span className="h-full bg-rw-side-b/85" style={{ width: `${100 - Math.round((h2h.w / h2h.g) * 100)}%` }} />
                </span>
              )}
            </HubLink>
          )}
          {lastMeeting && lastMeeting[7] && (
            <HubLink
              to={{ kind: "match", slug: lastMeeting[7] }}
              className="text-rw-accent hover:underline tabular-nums"
              title={`${lastMeeting[5]} · ${fmtDate(lastMeeting[0])}`}
            >
              {tl("Last")}: {lastMeeting[3]}–{lastMeeting[4]} ({fmtDate(lastMeeting[0])}) →
            </HubLink>
          )}
        </div>
      )}
      {hasLanePairs && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] pt-0.5">
          {lanePairs.map(({ role, a, b }) =>
            a && b ? (
              <HubLink
                key={role}
                to={{ kind: "compare", mode: "player", a: a.u, b: b.u, period }}
                title={tl("Compare {a} and {b}", { a: a.n, b: b.n })}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-rw-border bg-rw-bg/70 hover:border-rw-accent/60"
              >
                <span className="text-[9px] font-bold uppercase text-rw-accent">{ROLE_SHORT[role] || roleName(role)}</span>
                <PlayerPhoto name={a.n} team={t.name} slug={a.u} size={14} linkFallback={false} />
                <span className="text-rw-side-a font-medium">{a.n}</span>
                <span className="text-rw-muted">v</span>
                <span className="text-rw-side-b font-medium">{b.n}</span>
                <PlayerPhoto name={b.n} team={them.name} slug={b.u} size={14} linkFallback={false} />
              </HubLink>
            ) : null,
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <MatchPrepButton match={m} />
        <MatchOverviewButton match={m} />
        <HubLink
          to={{ kind: "draft", query: `teams=${encodeURIComponent(t.u)}${c.opp ? `,${encodeURIComponent(c.opp)}` : ""}${period ? `&p=${encodeURIComponent(period)}` : ""}` }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
        >
          {tl("Draft board")}
        </HubLink>
        {c.opp && (
          <>
            <HubLink
              to={{ kind: "compare", mode: "team", a: t.u, b: c.opp, period }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
            >
              {tl("Compare")}
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  team: t.u,
                  vs: c.opp,
                  ...(yr && /^\d{4}$/.test(yr) ? { year: yr } : {}),
                  ...(lg ? { league: lg } : {}),
                }).toString(),
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
            >
              {tl("Game finder")}
            </HubLink>
          </>
        )}
        <HubLink
          to={{ kind: "rankings", ...(lg ? { query: `league=${encodeURIComponent(lg)}` } : {}) }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
        >
          {tl("Power rankings")}
        </HubLink>
        <HubLink
          to={{
            kind: "tiers",
            ...((lg || period)
              ? {
                  query: new URLSearchParams({
                    ...(lg ? { league: lg } : {}),
                    ...(period ? { key: period } : {}),
                  }).toString(),
                }
              : {}),
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
        >
          {tl("Pro tier list")}
        </HubLink>
        <HubLink
          to={{
            kind: "leaders",
            ...((lg || (yr && /^\d{4}$/.test(yr)))
              ? {
                  query: new URLSearchParams({
                    ...(lg ? { league: lg } : {}),
                    ...(yr && /^\d{4}$/.test(yr) ? { year: yr } : {}),
                  }).toString(),
                }
              : {}),
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
        >
          {tl("Player leaderboards")}
        </HubLink>
        <HubLink
          to={{ kind: "match", slug: RIOT_PREFIX + m.matchId }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
        >
          {tl("Match page")}
        </HubLink>
      </div>
    </div>
  );
};
