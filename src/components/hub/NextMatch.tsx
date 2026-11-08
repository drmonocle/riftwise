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
import { findHubTeam, loadHubIndexQuick, loadHubTeam, loadTeamSeries, teamStarter } from "../../hub/data";
import { recentSchedule, RIOT_PREFIX } from "../../hub/riotMatch";
import { useMatchRatings } from "../../hub/matchRatings";
import { riotImg } from "../../riotImage";
import { formatMatchTime } from "../../matchTime";
import { MatchPrepButton } from "../MatchPrepButton";
import { MatchOverviewButton } from "../MatchOverviewButton";
import { fmtDate, HubLink, Section, TeamLink } from "./ui";

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
  return (
    <Section title={tl("Next match")}>
      <FirstMatch c={first} t={t} />
      {rest.length > 0 && (
        <ul className="text-xs space-y-1 pt-2 border-t border-rw-border">
          {rest.map((c) => {
            const [, them] = sides(c);
            return (
              <li key={c.m.matchId} className="flex justify-between gap-2 min-w-0">
                <span className="truncate min-w-0">
                  <span className="text-rw-sub">{tl("vs")} </span>
                  <TeamLink name={them.name} u={c.opp} />
                  <span className="text-rw-muted"> · {[c.m.leagueName, c.m.blockName].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-rw-muted shrink-0">{formatMatchTime(c.m.startTimeUtc)}</span>
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

const Logo: React.FC<{ img?: string }> = ({ img }) =>
  img ? <img {...riotImg(img, 64)} alt="" className="w-8 h-8 object-contain shrink-0" loading="lazy" /> : <span className="w-8 h-8 shrink-0" aria-hidden="true" />;

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
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <span className="min-w-0 truncate">
          <span className="font-bold text-rw-accent">{m.leagueName}</span>
          {m.blockName && <span className="text-rw-sub"> · {m.blockName}</span>}
          <span className="text-rw-muted"> · {tc("short best of", "Bo{n}", { n: m.bestOf || 1 })}</span>
        </span>
        {live ? (
          <span className="flex items-center gap-1 font-semibold text-rw-red shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-rw-red animate-pulse" aria-hidden="true" />
            {tl("On now")}
          </span>
        ) : (
          <span className="font-mono font-medium text-rw-text shrink-0">{formatMatchTime(m.startTimeUtc)}</span>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 min-w-0">
        {/* short names on a phone ("Movistar KOI" didn't fit beside its logo) */}
        <span className="flex items-center gap-2 min-w-0 justify-end flex-1">
          <span className="font-bold text-sm text-rw-text truncate max-sm:hidden">{t.name}</span>
          <span className="font-bold text-sm text-rw-text sm:hidden">{ours.code || t.name}</span>
          <Logo img={ours.img} />
        </span>
        <span className="text-rw-sub text-xs shrink-0">{tl("vs")}</span>
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <Logo img={them.img} />
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
            <span className="flex items-center gap-1.5 w-48 max-w-full" title={tl("Chance to win the series, from the power rankings (every pro game since 2011)")}>
              <span className="font-mono tabular-nums text-rw-side-a w-8 text-right">{chance}%</span>
              <span className="flex-1 h-1.5 rounded-sm overflow-hidden bg-rw-side-b/70" aria-hidden="true">
                <span className="block h-full bg-rw-side-a" style={{ width: `${chance}%` }} />
              </span>
              <span className="font-mono tabular-nums text-rw-side-b w-8">{100 - chance}%</span>
            </span>
          )}
          {h2h && (
            <span className="font-mono tabular-nums text-rw-sub" title={tl("All-time head-to-head, in games")}>
              H2H {h2h.w}–{h2h.g - h2h.w}
            </span>
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
                to={{ kind: "compare", mode: "player", a: a.u, b: b.u }}
                title={tl("Compare {a} and {b}", { a: a.n, b: b.n })}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-rw-border bg-rw-bg/70 hover:border-rw-accent/60"
              >
                <span className="text-[9px] font-bold uppercase text-rw-accent">{ROLE_SHORT[role] || roleName(role)}</span>
                <span className="text-rw-side-a font-medium">{a.n}</span>
                <span className="text-rw-muted">v</span>
                <span className="text-rw-side-b font-medium">{b.n}</span>
              </HubLink>
            ) : null,
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <MatchPrepButton match={m} />
        <MatchOverviewButton match={m} />
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
