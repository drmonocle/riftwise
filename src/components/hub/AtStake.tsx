/**
 * "On the line today": for every match in the next 24 hours, the milestones and streaks of both teams and their
 * starters (hub/stakes.json, built with the stats), so a caster sees what's at stake before going on air.
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, locale } from "../../i18n";
import { load } from "../../stats";
import type { Match } from "../../types";
import { bare, findHubTeam, loadHubIndexQuick, matchesChampSearch, normText, prettySlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, type HubIndex } from "../../hub/data";
import { searchAlias } from "../../searchAliases";
import { MatchOverviewButton } from "../MatchOverviewButton";
import { MatchPrepButton } from "../MatchPrepButton";
import {
  type Note,
  type StoryLine,
  StoryBullets,
  notePlainText,
  noteText,
} from "./Storylines";
import { GRID_COLS, HubLink, Section, TeamLogo, useColumns } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { WinChanceLine } from "../WinChanceLine";

/** hub/stakes.json: team slug -> its storylines and its starters' (name, slug, role, as of, notes) */
interface TeamStakes {
  n: string;
  a: string | null;
  l: Note[];
  p: [string, string, string, string, Note[]][];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const teamSlug = (index: HubIndex, name?: string | null, code?: string | null): string =>
  findHubTeam(index, name || "", code || "") || resolveTeamAlias(name || "") || resolveTeamAlias(code || "") || prettySlug(name || code || "");

function matchLines(
  m: Match,
  index: HubIndex,
  stakes: Record<string, TeamStakes>,
): StoryLine[] {
  const lines: StoryLine[] = [];
  const mYr = m.startTimeUtc?.slice(0, 4);
  for (const [name, code] of [
    [m.team1Name, m.team1Code],
    [m.team2Name, m.team2Code],
  ]) {
    const u = findHubTeam(index, name, code);
    const s = u ? stakes[u] : undefined;
    if (!u || !s) continue;
    s.l.forEach((nt, i) => {
      const yr = nt.y ? String(nt.y) : mYr;
      lines.push({
        key: `${u}-${i}`,
        who: { name: s.n, team: s.n, to: { kind: "team", slug: u, ...(yr ? { query: `p=y${encodeURIComponent(yr)}` } : {}) } },
        text: noteText(nt, { kind: "team", slug: u }),
        plain: notePlainText(nt),
        champ: nt.c,
        asOf: s.a || undefined,
      });
    });
    for (const [pn, pu, , asOf, notes] of s.p)
      notes.forEach((nt, i) => {
        const yr = nt.y ? String(nt.y) : mYr;
        lines.push({
          key: `${pu}-${i}`,
          who: { name: pn, team: s.n, to: { kind: "player", slug: pu, ...(yr ? { query: `p=y${encodeURIComponent(yr)}` } : {}) } },
          text: noteText(nt, { kind: "player", slug: pu }),
          plain: notePlainText(nt),
          champ: nt.c,
          asOf,
        });
      });
  }
  return lines;
}

/** `narrow`: one column of the next three matches (the Live tab's side column). */
export const AtStakeToday: React.FC<{ schedule: Match[]; narrow?: boolean }> = ({ schedule, narrow }) => {
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
      loadHubIndexQuick(),
      load<Record<string, TeamStakes>>("hub/stakes.json"),
    ])
      .then(([index, stakes]) => alive && setData({ index, stakes }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [wanted]);
  const [search, setSearch] = useState("");
  const cols = useColumns();
  if (!data) return null;
  const allBlocks = upcoming
    .map((m) => ({ m, lines: matchLines(m, data.index, data.stakes) }))
    .filter((x) => x.lines.length);
  if (!allBlocks.length) return null;
  const q = normText(search.trim());
  const terms = q
    ? q
        .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
        .map((s) => normText(searchAlias(s.trim())))
        .filter(Boolean)
    : [];
  // a phone shows the next four matches; each extra column of room shows four more
  const blocks = terms.length
    ? allBlocks
        .map(({ m, lines }) => {
          const t1Slug = findHubTeam(data.index, m.team1Name, m.team1Code) || resolveTeamAlias(m.team1Name || m.team1Code);
          const t2Slug = findHubTeam(data.index, m.team2Name, m.team2Code) || resolveTeamAlias(m.team2Name || m.team2Code);
          const mLgSlug = resolveLeagueSlug(m.leagueSlug || m.leagueName || "");
          const mHay = normText(`${m.team1Code} ${m.team1Name} ${t1Slug} ${m.team2Code} ${m.team2Name} ${t2Slug} ${m.leagueName} ${m.leagueSlug || ""}`);
          const mHayBare = bare(mHay);
          if (
            terms.some((t) => {
              if (mHay.includes(t) || (t.length >= 2 && mHayBare.includes(bare(t)))) return true;
              const canonTeam = resolveTeamAlias(t);
              if (canonTeam && (canonTeam === t1Slug || canonTeam === t2Slug)) return true;
              const canonLg = resolveLeagueSlug(t);
              if (canonLg && canonLg === mLgSlug) return true;
              return false;
            })
          )
            return { m, lines };
          const filteredLines = lines.filter((l) => {
            const lHay = normText(`${l.who?.name || ""} ${l.who?.to.slug || ""} ${l.champ || ""} ${l.plain || ""}`);
            const lHayBare = bare(lHay);
            return terms.some(
              (t) =>
                lHay.includes(t) ||
                (t.length >= 2 && lHayBare.includes(bare(t))) ||
                (l.who?.to.slug && l.who.to.slug === resolvePlayerSlug(t)) ||
                (l.who?.to.kind === "team" && l.who.to.slug === resolveTeamAlias(t)) ||
                (l.champ ? matchesChampSearch(l.champ, t) : false),
            );
          });
          return { m, lines: filteredLines };
        })
        .filter((x) => x.lines.length > 0)
    : allBlocks.slice(0, narrow ? 3 : cols * 4);
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
      right={
        <span className="flex flex-wrap items-center gap-2 text-[11px]">
          {!narrow && (allBlocks.length > 3 || Boolean(search.trim())) && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              data-nocapture="1"
              className="bg-rw-bg border border-rw-border rounded-md px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-36"
            />
          )}
          {!narrow && terms.length === 0 && (
            <span className="flex items-center gap-2" data-nocapture="1">
              {blocks.length >= 1 && (() => {
                const m0 = blocks[0].m;
                const a = teamSlug(data.index, m0.team1Name, m0.team1Code);
                const b = teamSlug(data.index, m0.team2Name, m0.team2Code);
                const p = m0.startTimeUtc ? `y${m0.startTimeUtc.slice(0, 4)}` : undefined;
                return (
                  <>
                    <HubLink to={{ kind: "prep", a, b, period: p }} className="text-rw-sub hover:text-rw-accent hover:underline">
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "draft", query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}${p ? `&p=${encodeURIComponent(p)}` : ""}` }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink to={{ kind: "compare", mode: "team", a, b, period: p }} className="text-rw-sub hover:text-rw-accent hover:underline">
                      {tl("Compare")} →
                    </HubLink>
                  </>
                );
              })()}
              <HubLink to={{ kind: "records" }} className="text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Records")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  query:
                    new URLSearchParams({
                      ...(blocks[0]?.m.leagueSlug ? { league: resolveLeagueSlug(blocks[0].m.leagueSlug) } : {}),
                      ...(blocks[0]?.m
                        ? {
                            q: `${teamSlug(data.index, blocks[0].m.team1Name, blocks[0].m.team1Code)},${teamSlug(data.index, blocks[0].m.team2Name, blocks[0].m.team2Code)}`,
                          }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query:
                    new URLSearchParams({
                      ...(blocks[0]?.m.leagueSlug ? { league: resolveLeagueSlug(blocks[0].m.leagueSlug) } : {}),
                      ...(blocks[0]?.m.startTimeUtc ? { year: blocks[0].m.startTimeUtc.slice(0, 4) } : {}),
                      ...(blocks[0]?.m
                        ? {
                            q: `${teamSlug(data.index, blocks[0].m.team1Name, blocks[0].m.team1Code)},${teamSlug(data.index, blocks[0].m.team2Name, blocks[0].m.team2Code)}`,
                          }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query:
                    new URLSearchParams({
                      ...(blocks[0]?.m.leagueSlug
                        ? {
                            scope: resolveLeagueSlug(blocks[0].m.leagueSlug),
                            league: resolveLeagueSlug(blocks[0].m.leagueSlug),
                          }
                        : {}),
                      ...(blocks[0]?.m.startTimeUtc ? { key: `y${blocks[0].m.startTimeUtc.slice(0, 4)}` } : {}),
                    }).toString() || undefined,
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  ...(blocks[0]?.m
                    ? {
                        query: new URLSearchParams({
                          team: teamSlug(data.index, blocks[0].m.team1Name, blocks[0].m.team1Code),
                          vs: teamSlug(data.index, blocks[0].m.team2Name, blocks[0].m.team2Code),
                          ...(blocks[0].m.leagueSlug ? { league: resolveLeagueSlug(blocks[0].m.leagueSlug) } : {}),
                          ...(blocks[0].m.startTimeUtc ? { year: blocks[0].m.startTimeUtc.slice(0, 4) } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
            </span>
          )}
          {terms.length > 0 && blocks.length >= 1 && (() => {
            const m0 = blocks[0].m;
            const a = teamSlug(data.index, m0.team1Name, m0.team1Code);
            const b = teamSlug(data.index, m0.team2Name, m0.team2Code);
            const yr = m0.startTimeUtc ? m0.startTimeUtc.slice(0, 4) : undefined;
            const p = yr ? `y${yr}` : undefined;
            const lg = m0.leagueSlug ? resolveLeagueSlug(m0.leagueSlug) : undefined;
            return (
              <span className="flex items-center gap-2" data-nocapture="1">
                <HubLink to={{ kind: "prep", a, b, period: p }} className="text-rw-sub hover:text-rw-accent hover:underline">
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{ kind: "draft", query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}${p ? `&p=${encodeURIComponent(p)}` : ""}` }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink to={{ kind: "compare", mode: "team", a, b, period: p }} className="text-rw-sub hover:text-rw-accent hover:underline">
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      team: a,
                      vs: b,
                      ...(lg ? { league: lg } : {}),
                      ...(yr ? { year: yr } : {}),
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query: new URLSearchParams({
                      ...(lg ? { league: lg } : {}),
                      q: `${a},${b}`,
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query:
                      new URLSearchParams({
                        ...(lg ? { scope: lg, league: lg } : {}),
                        ...(p ? { key: p } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query:
                      new URLSearchParams({
                        ...(lg ? { league: lg } : {}),
                        ...(yr ? { year: yr } : {}),
                        q: `${a},${b}`,
                      }).toString() || undefined,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </span>
            );
          })()}
          <SectionCard
            section={tl("On the line today")}
            name="RiftWise"
            sub={tl("Milestones and streaks for the matches in the next 24 hours.")}
            rows={() =>
              blocks.slice(0, 8).map(({ m, lines }, idx) => ({
                rank: idx + 1,
                team: m.team1Name || m.team1Code,
                label: `${m.team1Code} vs ${m.team2Code}`,
                sub: lines[0]?.plain
                  ? `${m.leagueName} · ${lines[0].who ? `${lines[0].who.name}: ` : ""}${lines[0].plain}`
                  : m.leagueName,
                value: m.state === "inProgress" ? tl("Live now") : time(m.startTimeUtc),
              }))
            }
          />
        </span>
      }
    >
      <p className="text-[11px] text-rw-muted">
        {tl("Milestones and streaks for the matches in the next 24 hours.")}
      </p>
      <div className={`${narrow ? "grid" : GRID_COLS} gap-x-6 gap-y-3 items-start`}>
        {blocks.map(({ m, lines }) => {
          const t1Slug = teamSlug(data.index, m.team1Name, m.team1Code);
          const t2Slug = teamSlug(data.index, m.team2Name, m.team2Code);
          const mYr = m.startTimeUtc?.slice(0, 4);
          const mPeriodQ = mYr && /^\d{4}$/.test(mYr) ? `p=y${encodeURIComponent(mYr)}` : undefined;
          return (
          <div key={m.matchId} className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs border-b border-rw-border pb-1">
              <span className="inline-flex items-center gap-1 font-bold text-rw-text">
                <HubLink
                  to={{ kind: "team", slug: t1Slug, ...(mPeriodQ ? { query: mPeriodQ } : {}) }}
                  className="inline-flex items-center gap-1 hover:text-rw-accent"
                >
                  <TeamLogo name={m.team1Name || m.team1Code} code={m.team1Code} src={m.team1Image} sizeClass="w-3.5 h-3.5" />
                  <span>{m.team1Code}</span>
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: t1Slug,
                    b: t2Slug,
                    period: m.startTimeUtc ? `y${m.startTimeUtc.slice(0, 4)}` : undefined,
                  }}
                  className="text-rw-muted hover:text-rw-accent hover:underline font-normal"
                  title={tl("Compare")}
                >
                  vs
                </HubLink>
                <HubLink
                  to={{ kind: "team", slug: t2Slug, ...(mPeriodQ ? { query: mPeriodQ } : {}) }}
                  className="inline-flex items-center gap-1 hover:text-rw-accent"
                >
                  <TeamLogo name={m.team2Name || m.team2Code} code={m.team2Code} src={m.team2Image} sizeClass="w-3.5 h-3.5" />
                  <span>{m.team2Code}</span>
                </HubLink>
              </span>
              <span className="text-rw-muted">
                {m.leagueSlug || m.leagueName ? (
                  <HubLink
                    to={{
                      kind: "league",
                      slug: resolveLeagueSlug(m.leagueSlug || m.leagueName),
                      ...(mYr && /^\d{4}$/.test(mYr) ? { year: mYr } : {}),
                    }}
                    className="hover:text-rw-accent hover:underline"
                  >
                    {m.leagueName}
                  </HubLink>
                ) : (
                  m.leagueName
                )}{" "}
                ·{" "}
                <HubLink
                  to={{
                    kind: "prep",
                    a: t1Slug,
                    b: t2Slug,
                    period: m.startTimeUtc ? `y${m.startTimeUtc.slice(0, 4)}` : undefined,
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {m.state === "inProgress" ? tl("Live now") : time(m.startTimeUtc)}
                </HubLink>
              </span>
              <WinChanceLine match={m} />
              <span className="ml-auto flex items-center gap-1" data-nocapture="1">
                <MatchOverviewButton match={m} compact />
                <MatchPrepButton match={m} compact />
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(t1Slug)},${encodeURIComponent(t2Slug)}${m.startTimeUtc ? `&p=y${encodeURIComponent(m.startTimeUtc.slice(0, 4))}` : ""}`,
                  }}
                  className="px-1.5 py-0.5 rounded border border-rw-border bg-rw-bg text-[10px] text-rw-muted hover:text-rw-accent hover:border-rw-accent/60 transition-colors"
                >
                  {tl("Draft board")}
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: t1Slug,
                    b: t2Slug,
                    period: m.startTimeUtc ? `y${m.startTimeUtc.slice(0, 4)}` : undefined,
                  }}
                  className="px-1.5 py-0.5 rounded border border-rw-border bg-rw-bg text-[10px] text-rw-muted hover:text-rw-accent hover:border-rw-accent/60 transition-colors"
                >
                  {tl("Compare")}
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      team: t1Slug,
                      vs: t2Slug,
                      ...(m.leagueSlug ? { league: resolveLeagueSlug(m.leagueSlug) } : {}),
                      ...(m.startTimeUtc ? { year: m.startTimeUtc.slice(0, 4) } : {}),
                    }).toString(),
                  }}
                  className="px-1.5 py-0.5 rounded border border-rw-border bg-rw-bg text-[10px] text-rw-muted hover:text-rw-accent hover:border-rw-accent/60 transition-colors"
                >
                  {tl("Game finder")}
                </HubLink>
              </span>
            </div>
            <StoryBullets lines={lines} spoilerKey={`stakes:${m.matchId}`} />
          </div>
          );
        })}
      </div>
    </Section>
  );
};
