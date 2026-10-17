/**
 * "On the line today": for every match in the next 24 hours, the milestones and streaks of both teams and their
 * starters (hub/stakes.json, built with the stats), so a caster sees what's at stake before going on air.
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, locale } from "../../i18n";
import { load } from "../../stats";
import type { Match } from "../../types";
import { findHubTeam, loadHubIndex, type HubIndex } from "../../hub/data";
import { MatchPrepButton } from "../MatchPrepButton";
import {
  type Note,
  type StoryLine,
  StoryBullets,
  noteText,
} from "./Storylines";
import { Section } from "./ui";

/** hub/stakes.json: team slug -> its storylines and its starters' (name, slug, role, as of, notes) */
interface TeamStakes {
  n: string;
  a: string | null;
  l: Note[];
  p: [string, string, string, string, Note[]][];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function matchLines(
  m: Match,
  index: HubIndex,
  stakes: Record<string, TeamStakes>,
): StoryLine[] {
  const lines: StoryLine[] = [];
  for (const [name, code] of [
    [m.team1Name, m.team1Code],
    [m.team2Name, m.team2Code],
  ]) {
    const u = findHubTeam(index, name, code);
    const s = u ? stakes[u] : undefined;
    if (!u || !s) continue;
    s.l.forEach((nt, i) =>
      lines.push({
        key: `${u}-${i}`,
        who: { name: s.n, to: { kind: "team", slug: u } },
        text: noteText(nt),
        asOf: s.a || undefined,
      }),
    );
    for (const [pn, pu, , asOf, notes] of s.p)
      notes.forEach((nt, i) =>
        lines.push({
          key: `${pu}-${i}`,
          who: { name: pn, to: { kind: "player", slug: pu } },
          text: noteText(nt),
          asOf,
        }),
      );
  }
  return lines;
}

export const AtStakeToday: React.FC<{ schedule: Match[] }> = ({ schedule }) => {
  const upcoming = useMemo(() => {
    const now = Date.now();
    return schedule
      .filter((m) => {
        const t = Date.parse(m.startTimeUtc);
        return (
          m.state !== "completed" &&
          t < now + DAY_MS &&
          t > now - 6 * 60 * 60 * 1000 &&
          m.team1Code &&
          m.team2Code &&
          !/^tbd$/i.test(m.team1Code) &&
          !/^tbd$/i.test(m.team2Code)
        );
      })
      .sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc))
      .slice(0, 16);
  }, [schedule]);
  const [data, setData] = useState<{
    index: HubIndex;
    stakes: Record<string, TeamStakes>;
  } | null>(null);
  const wanted = upcoming.length > 0;
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    Promise.all([
      loadHubIndex(),
      load<Record<string, TeamStakes>>("hub/stakes.json"),
    ])
      .then(([index, stakes]) => alive && setData({ index, stakes }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [wanted]);
  if (!data) return null;
  const blocks = upcoming
    .map((m) => ({ m, lines: matchLines(m, data.index, data.stakes) }))
    .filter((x) => x.lines.length);
  if (!blocks.length) return null;
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale(), {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <Section
      title={tl("On the line today")}
      share="riftwise-on-the-line-today"
    >
      <p className="text-[11px] text-rw-muted">
        {tl("Milestones and streaks for the matches in the next 24 hours.")}
      </p>
      <div className="space-y-3">
        {blocks.map(({ m, lines }) => (
          <div key={m.matchId} className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs border-b border-rw-border pb-1">
              <span className="font-bold text-rw-text">
                {m.team1Code}{" "}
                <span className="text-rw-muted font-normal">vs</span>{" "}
                {m.team2Code}
              </span>
              <span className="text-rw-muted">
                {m.leagueName} ·{" "}
                {m.state === "inProgress"
                  ? tl("Live now")
                  : time(m.startTimeUtc)}
              </span>
              <span className="ml-auto" data-nocapture="1">
                <MatchPrepButton match={m} compact />
              </span>
            </div>
            <StoryBullets lines={lines} spoilerKey={`stakes:${m.matchId}`} />
          </div>
        ))}
      </div>
    </Section>
  );
};
