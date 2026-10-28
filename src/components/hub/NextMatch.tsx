/**
 * "Next match" at the top of a team page's Overview (TV, 2026-10-28): the team's coming series from Riot's schedule
 * (the copy match pages read), up to three. The first one in full: league, stage and best-of, the opponent, when (or
 * that it's on now), each side's chance from the power rankings, the all-time head-to-head in games, Match prep and
 * the match page; the next two as a line each. Nothing shows for a team with nothing coming up, or when the schedule
 * can't be read.
 */
import React, { useEffect, useState } from "react";
import type { Match } from "../../types";
import type { HubTeam } from "../../hub/types";
import { tl, tc } from "../../i18n";
import { findHubTeam, loadHubIndexQuick } from "../../hub/data";
import { recentSchedule, RIOT_PREFIX } from "../../hub/riotMatch";
import { useMatchRatings } from "../../hub/matchRatings";
import { riotImg } from "../../riotImage";
import { formatMatchTime } from "../../matchTime";
import { MatchPrepButton } from "../MatchPrepButton";
import { HubLink, Section, TeamLink } from "./ui";

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
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <span className="min-w-0 truncate">
          <span className="font-bold text-rw-teal">{m.leagueName}</span>
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
              <span className="font-mono tabular-nums text-rw-teal w-8 text-right">{chance}%</span>
              <span className="flex-1 h-1.5 rounded-sm overflow-hidden bg-rw-red/70" aria-hidden="true">
                <span className="block h-full bg-rw-teal" style={{ width: `${chance}%` }} />
              </span>
              <span className="font-mono tabular-nums text-rw-red w-8">{100 - chance}%</span>
            </span>
          )}
          {h2h && (
            <span className="font-mono tabular-nums text-rw-sub" title={tl("All-time head-to-head, in games")}>
              H2H {h2h.w}–{h2h.g - h2h.w}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <MatchPrepButton match={m} />
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
