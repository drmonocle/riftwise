/**
 * Team page, in tabs (each its own address, /team/t1/<tab>): Overview (record, next match, recent series, this
 * year's roster, storylines, titles), Stats (any period, league ranks), Matches (every series, rivals), History (tournaments with
 * placements, roster by year) and Champions.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { tl, tk, roleName, regionName, eventTitle, tc } from "../../i18n";
import { winRate } from "../../stats";
import { loadHubTeam, loadTeamGames } from "../../hub/data";
import { currentHubRoute, navigateHub, type HubRoute } from "../../hub/route";
import { PageTabs, type PageTab } from "./PageTabs";
import type { HubTeam } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { TeamSeriesArchive } from "./Archives";
import { PeriodPicker, TeamPeriodStats } from "./PeriodStats";
import { PeriodKey, inPeriod, periodOptions, teamAgg, teamRowRef } from "../../hub/period";
import { TeamRanks } from "./Ranks";
import { OwnStorylines } from "./Storylines";
import { CaptureContext, card, ChampLink, EventLink, fmtDate, fmtNum, fmtUsd, HubLink, Page, PlayerLink, PlayerPhoto, RevealButton, Section, Stat, td, TeamLink, TeamLogo, th, useHidden, useHiddenCheck, useLoad, usePageTitle, PhotosLink, FollowFeeds } from "./ui";
import { ratingTextClass } from "./BestPage";
import { Sparkline } from "./Sparkline";
import { STable } from "../STable";
import { SectionCard } from "./BroadcastCard";
import { champName } from "../../champions";
import { NextMatch } from "./NextMatch";

/** The tabs' names (the address says the key: /team/t1/matches) */
const TAB_LABEL: Record<string, string> = {
  "": tk("Overview"),
  stats: tk("Stats"),
  matches: tk("Matches"),
  history: tk("History"),
  champions: tk("Champions"),
};

export const TeamPage: React.FC<{ slug: string; tab?: string }> = ({ slug, tab }) => {
  // reached by an old or short address (/team/hle): show the team's own address, once this team's file is in and
  // only while its page is still the one open (moving to another team mustn't bounce back)
  const state = useLoad(
    () =>
      loadHubTeam(slug).then((t) => {
        const now = currentHubRoute();
        if (t.u && t.u !== slug && now.kind === "team" && now.slug === slug)
          navigateHub({ kind: "team", slug: t.u, ...("tab" in now && now.tab ? { tab: now.tab } : {}), ...("query" in now && now.query ? { query: now.query } : {}) }, { replace: true });
        return t;
      }),
    [slug],
  );
  usePageTitle(state.data ? (tab && TAB_LABEL[tab] ? `${state.data.name} · ${tl(TAB_LABEL[tab])}` : state.data.name) : undefined);
  useDDragon();
  return (
    <Page state={state}>
      {(t) => (
        <CaptureContext.Provider value={t.name}>
          <TeamView t={t} tab={tab && TAB_LABEL[tab] ? tab : ""} />
        </CaptureContext.Provider>
      )}
    </Page>
  );
};

const TeamView: React.FC<{ t: HubTeam; tab: string }> = ({ t, tab }) => {
  const worlds = t.titles.filter((x) => x.kind === "Worlds").length;
  const msi = t.titles.filter((x) => x.kind === "MSI").length;
  const firstStand = t.titles.filter((x) => x.kind === "First Stand").length;
  const oldNames = t.names.filter((n) => n.n !== t.name);
  const [allEvents, setAllEvents] = useState(false);
  const [recentHidden, revealRecent] = useHidden(`team-recent:${t.u}`, t.recent[0]?.date);
  const events = allEvents ? t.events : t.events.slice(0, 15);
  // the section cards leave out what spoiler mode hides
  const hiddenCheck = useHiddenCheck();
  const cardSub = t.region ? regionName(t.region) : undefined;
  const tabs: PageTab[] = [
    { key: "", label: TAB_LABEL[""] },
    { key: "stats", label: TAB_LABEL.stats },
    { key: "matches", label: TAB_LABEL.matches, count: t.sg },
    { key: "history", label: TAB_LABEL.history, count: t.events.length },
    ...(t.champs.length ? [{ key: "champions", label: TAB_LABEL.champions }] : []),
  ];
  const to = (key: string): HubRoute => ({ kind: "team", slug: t.u, ...(key ? { tab: key } : {}) });
  const overview = tab === "";
  const nowRoute = currentHubRoute();
  const routeQuery = nowRoute.kind === "team" && nowRoute.slug === t.u ? nowRoute.query : undefined;
  const urlParams = useMemo(
    () => new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : "")),
    [routeQuery],
  );
  const asParam = urlParams.get("as") || "";
  const yParam = urlParams.get("y") || "";
  const initialRosterYear = useMemo(() => {
    if (yParam && t.roster.some((r) => r.y === yParam)) return yParam;
    if (asParam) {
      const m =
        t.names.find((n) => n.n.toLowerCase() === asParam.toLowerCase()) ||
        t.years.find((y) => y.as.toLowerCase() === asParam.toLowerCase());
      const yr = m ? ("to" in m ? m.to.slice(0, 4) : m.y) : "";
      if (yr && t.roster.some((r) => r.y === yr)) return yr;
    }
    return t.roster[0]?.y || "";
  }, [t.roster, t.names, t.years, asParam, yParam]);
  const [rosterYear, setRosterYear] = useState(initialRosterYear);
  useEffect(() => {
    setRosterYear(initialRosterYear);
  }, [initialRosterYear]);
  const activeRoster = (overview ? t.roster.find((r) => r.y === rosterYear) || t.roster[0] : t.roster[0]);
  // this year's roster on the Overview (with 1-click year pills for every historical season), every year's under History
  const rosterSection = t.roster.length > 0 && (
    <Section
      title={tl("Roster")}
      right={
        activeRoster ? (
          <span className="flex items-center gap-2">
            {overview && (
              <HubLink
                to={{ kind: "team", slug: t.u, tab: "stats", query: `p=y${activeRoster.y}` }}
                className="text-[11px] text-rw-teal hover:underline"
              >
                {`${tl("Stats for")} ${activeRoster.y}`}
              </HubLink>
            )}
            <SectionCard
              section={tl("Roster")}
              name={t.name}
              sub={activeRoster.y}
              rows={() => activeRoster.p.map((x) => ({ label: x.n, sub: roleName(x.r), value: tl("{n} games", { n: x.g }) }))}
            />
          </span>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {overview && t.roster.length > 1 && (
          <div data-nocapture="1" className="flex flex-wrap items-center gap-1 text-[11px]">
            {t.roster.map((yr) => {
              const eraName = t.years.find((y) => y.y === yr.y)?.as;
              return (
                <button
                  key={yr.y}
                  type="button"
                  onClick={() => setRosterYear(yr.y)}
                  title={eraName && eraName !== t.name ? `${yr.y} (${eraName})` : yr.y}
                  className={`px-2 py-0.5 rounded-full border tabular-nums ${
                    activeRoster?.y === yr.y
                      ? "border-rw-accent bg-rw-accent/15 text-rw-text font-semibold"
                      : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
                  }`}
                >
                  {yr.y}
                </button>
              );
            })}
          </div>
        )}
        {(overview ? (activeRoster ? [activeRoster] : []) : t.roster).map((yr) => {
          const eraName = t.years.find((y) => y.y === yr.y)?.as;
          return (
            <div key={yr.y} className="text-xs flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-rw-muted font-semibold whitespace-nowrap">
                {yr.y}
                {eraName && eraName !== t.name ? ` (${eraName})` : ""}
              </span>
              {yr.p.map((p, i) => (
                <span key={p.n + i} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {i > 0 && !overview && <span className="text-rw-muted/60 mr-0.5">·</span>}
                  {overview && <PlayerPhoto name={p.n} team={eraName || t.name} slug={p.u ?? undefined} size={22} />}
                  <PlayerLink name={p.n} u={p.u} />
                  <span className="text-rw-muted">{roleName(p.r)}</span>
                  {overview && <PhotosLink q={p.n} iconOnly className="text-rw-muted hover:text-rw-teal" />}
                </span>
              ))}
            </div>
          );
        })}
        {overview && t.roster.length > 1 && (
          <HubLink to={to("history")} className="text-[11px] text-rw-teal hover:underline">
            {tl("Every roster since {year}", { year: t.roster[t.roster.length - 1].y })}
          </HubLink>
        )}
      </div>
    </Section>
  );
  return (
    <div>
      {/* the team's name on every tab; its numbers on the Overview */}
      <div className={`${card} mb-3`}>
        <h1 className="text-lg font-bold text-rw-text flex items-center gap-2.5 min-w-0">
          <TeamLogo name={t.name} code={t.codes[0]} size={36} />
          <span className="min-w-0">
            {t.name}
            {t.codes.length > 0 && <span className="text-rw-muted text-sm font-semibold ml-2">{t.codes.slice(0, 3).join(" · ")}</span>}
          </span>
        </h1>
        <p className="text-[11px] text-rw-muted">
          {[t.region ? regionName(t.region, t.region) : null, tl("Pro games from {from} to {to}", { from: fmtDate(t.from), to: fmtDate(t.to) }), t.disbanded ? tl("Disbanded") : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <span className="flex flex-wrap items-center gap-x-3">
          <PhotosLink q={t.name} className="mt-1 inline-flex items-center gap-1 text-[11px] text-rw-teal hover:underline" />
          {/* its own calendar and results feed, while it still plays (the schedule only has current teams) */}
          {!t.disbanded && Date.now() - Date.parse(t.to) < 180 * 86_400_000 && <FollowFeeds teams={[t.name]} />}
        </span>
        {overview && oldNames.length > 0 && (
          <p className="text-[11px] text-rw-sub mt-1">
            {tl("Also played as:")}{" "}
            {oldNames.map((n, i) => {
              const targetYr = n.to.slice(0, 4);
              return (
                <span key={n.n + n.from}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    onClick={() => setRosterYear(targetYr)}
                    title={`${tl("Stats for")} ${targetYr}`}
                    className={`hover:underline ${activeRoster?.y === targetYr ? "text-rw-accent font-semibold" : "text-rw-text"}`}
                  >
                    {n.n}
                  </button>{" "}
                  <HubLink
                    to={{ kind: "team", slug: t.u, tab: "stats", query: `p=y${targetYr}` }}
                    className="text-rw-muted hover:text-rw-teal hover:underline"
                    title={`${tl("Stats for")} ${targetYr}`}
                  >
                    ({n.from.slice(0, 4)}
                    {n.to.slice(0, 4) !== n.from.slice(0, 4) ? `–${n.to.slice(0, 4)}` : ""})
                  </HubLink>
                </span>
              );
            })}
            {". "}
            {tl("All of it counts here.")}
          </p>
        )}
        {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 rw-stats mt-3">
          <Stat label={tl("Games")} value={`${fmtNum(t.w)}-${fmtNum(t.g - t.w)}`} sub={tl("{pct} win rate", { pct: winRate(t.w, t.g) })} />
          <Stat label={tl("Series")} value={`${t.sw}-${t.sg - t.sw}`} sub={tl("{pct} won", { pct: winRate(t.sw, t.sg) })} />
          {t.rating && (
            <HubLink to={{ kind: "rankings" }} className="block hover:opacity-80 relative">
              {t.rh && t.rh.length > 1 && (
                <span className="hidden sm:block absolute right-2 top-2" title={tl("Rating over the last year")}>
                  <Sparkline points={t.rh} width={72} height={22} />
                </span>
              )}
              <Stat
                label={tl("Power ranking")}
                value={`#${t.rating.rank ?? t.rating.lrank}`}
                sub={
                  t.rating.rank != null
                    ? tl("#{lrank} in {league} · rating {r}", { lrank: t.rating.lrank, league: t.rating.league || "–", r: t.rating.r })
                    : tl("in {league} · rating {r}", { league: t.rating.league || "–", r: t.rating.r })
                }
              />
            </HubLink>
          )}
          <Stat
            label={tl("Titles")}
            value={t.titles.length}
            sub={
              worlds || msi || firstStand
                ? [tl("{n} Worlds", { n: worlds }), tl("{n} MSI", { n: msi }), firstStand ? tl("{n} First Stand", { n: firstStand }) : ""].filter(Boolean).join(" · ")
                : tl("finals won")
            }
          />
          <Stat label={tl("Best streak")} value={t.bestStreak ? tl("{n} wins", { n: t.bestStreak.n }) : "–"} sub={t.bestStreak ? fmtDate(t.bestStreak.date) : undefined} />
          <Stat label={tl("Avg game")} value={tl("{n} min", { n: t.avgMin })} />
          {t.kills != null && <Stat label={tl("Kills / game")} value={t.kills} sub={tl("{n} deaths", { n: t.deaths ?? 0 })} />}
          {t.obj && <Stat label={tl("Dragons / game")} value={t.obj.dragons} sub={tl("{n} barons", { n: t.obj.barons })} />}
          {t.earnings ? <Stat label={tl("Prize money")} value={fmtUsd(t.earnings)} sub={tl("as listed in US dollars")} /> : null}
          {t.sides && t.sides[0] + t.sides[2] > 0 && (
            <Stat
              label={tl("Blue / red side")}
              value={`${winRate(t.sides[1], t.sides[0])} / ${winRate(t.sides[3], t.sides[2])}`}
              sub={tl("{b} blue games · {r} red", { b: fmtNum(t.sides[0]), r: fmtNum(t.sides[2]) })}
            />
          )}
          {t.obj && (
            <Stat
              label={tl("Gold diff / game")}
              value={`${t.obj.golddiff >= 0 ? "+" : ""}${fmtNum(Math.round(t.obj.golddiff))}`}
              sub={tl("{n} towers", { n: t.obj.towers })}
            />
          )}
        </div>
        )}
      </div>

      <PageTabs tabs={tabs} active={tab} to={to} />
      <div className="rw-page mt-3">
      {tab === "stats" && (
        <div className="rw-span space-y-3">
          <TeamPeriodStats
            slug={t.u}
            has2y={!!t.g2y}
            preferAll={!!t.disbanded || t.to.slice(0, 4) < String(new Date().getFullYear() - 1)}
            who={{ name: t.name, sub: [t.region, t.rating?.league].filter(Boolean).join(" · ") || undefined, code: t.codes[0], roster: t.roster[0]?.p }}
          />
          <TeamRanks slug={t.u} events={t.events} has2y={!!t.g2y} />
        </div>
      )}

      {overview && <NextMatch t={t} />}

      {/* the Overview leads with how the team is doing now (TV, 2026-10-28: pages in the order people want them):
          its next match, recent series and this year's roster, then storylines and titles.
          Side by side, each only as tall as it needs; a long recent list scrolls instead of leaving a gap beside By year */}
      {overview && (
      <div className="rw-span grid gap-3 md:grid-cols-2 md:items-start">
        <Section
          title={tl("Recent series")}
          right={
            recentHidden ? (
              <RevealButton onReveal={revealRecent} small />
            ) : (
              <SectionCard
                section={tl("Recent series")}
                name={t.name}
                rows={() => t.recent.map((r) => ({ win: r.us > r.them, label: `${r.us}-${r.them} vs ${r.opp}`, sub: r.en, value: fmtDate(r.date, false) }))}
              />
            )
          }
        >
          {recentHidden ? (
            <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <>
            {t.recent.some((r) => r.r != null) && (
              <div className="flex justify-end text-[10px] text-rw-muted pr-[4.5rem]" title={tl("Series rating: mostly its best game, then its other games")}>
                {tl("Series rating")}
              </div>
            )}
            <ul className="text-xs space-y-1 md:max-h-[24rem] md:overflow-y-auto md:pr-1">
              {t.recent.map((r, i) => (
                <li key={i} className="flex justify-between gap-2 min-w-0">
                  <span className="truncate min-w-0">
                    <span className={r.us > r.them ? "text-rw-teal font-bold" : "text-rw-red font-bold"}>
                      {r.us > r.them ? tc("short result", "W") : tc("short result", "L")} {r.us}-{r.them}
                    </span>{" "}
                    {r.g ? (
                      <HubLink to={{ kind: "match", slug: r.g }}>vs {r.opp}</HubLink>
                    ) : (
                      <span className="text-rw-text">vs {r.opp}</span>
                    )}
                    <span className="text-rw-muted"> · {r.en}</span>
                  </span>
                  <span className="text-rw-muted shrink-0 flex items-center gap-2">
                    {r.r != null && (
                      <span className={`tabular-nums font-semibold ${ratingTextClass(r.r)}`} title={tl("Series rating")}>
                        {r.r.toFixed(0)}
                      </span>
                    )}
                    {fmtDate(r.date, false)}
                  </span>
                </li>
              ))}
            </ul>
            </>
          )}
        </Section>

        <Section
          title={tl("By year")}
          right={
            <SectionCard
              section={tl("By year")}
              name={t.name}
              sub={cardSub}
              rows={() => [...t.years].reverse().map((y) => ({ label: y.as !== t.name ? `${y.y} · ${y.as}` : y.y, sub: `${y.w}-${y.g - y.w}`, value: winRate(y.w, y.g) }))}
            />
          }
        >
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Year")}</th>
                <th className={th}>{tl("Record")}</th>
                <th className={th}>{tl("Win %")}</th>
              </tr>
            </thead>
            <tbody>
              {t.years.map((y) => (
                <tr key={y.y} className="border-t border-rw-border hover:bg-rw-raised/50">
                  <td className={`${td} text-rw-text`}>
                    <HubLink to={{ kind: "team", slug: t.u, tab: "stats", query: `p=y${y.y}` }} className="hover:text-rw-teal hover:underline font-medium">
                      {y.y}
                    </HubLink>
                    {y.as !== t.name && <span className="text-rw-muted text-[10px]"> {tl("as {name}", { name: y.as })}</span>}
                  </td>
                  <td className={`${td} text-rw-sub`}>
                    <HubLink to={{ kind: "team", slug: t.u, tab: "stats", query: `p=y${y.y}` }} className="hover:text-rw-teal hover:underline">
                      {y.w}-{y.g - y.w}
                    </HubLink>
                  </td>
                  <td className={`${td} text-rw-sub`}>{winRate(y.w, y.g)}</td>
                </tr>
              ))}
            </tbody>
          </STable>
        </Section>
      </div>
      )}

      {overview && rosterSection}

      {overview && <OwnStorylines notes={t.notes} spoilerKey={`notes:team:${t.u}`} share={`${t.u}-storylines`} />}

      {overview && t.titles.length > 0 && (
        <Section
          title={tl("Titles")}
          right={<SectionCard section={tl("Titles")} name={t.name} sub={tl("{n} titles", { n: t.titles.length })} rows={() => t.titles.map((x) => ({ label: eventTitle(x.t), sub: `${x.score} vs ${x.l}`, value: x.date.slice(0, 4) }))} />}
        >
          <ul className="text-xs space-y-1">
            {t.titles.map((x) => (
              <li key={x.t + x.date} className="flex justify-between gap-2">
                <span className="text-rw-text min-w-0 truncate">
                  <Trophy className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-rw-accent" : "text-rw-muted"}`} />
                  <EventLink name={eventTitle(x.t)} u={x.e} />
                  {x.as !== t.name && <span className="text-rw-muted"> ({tl("as {name}", { name: x.as })})</span>}
                </span>
                <span className="text-rw-muted shrink-0">
                  {x.score} vs {x.l}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tab === "history" && t.events.length > 0 && (
        <Section
          title={tl("Tournaments")}
          right={
            <span className="flex items-center gap-2">
              {t.events.length > 15 && (
                <button type="button" onClick={() => setAllEvents((v) => !v)} className="text-[11px] text-rw-teal hover:underline">
                  {allEvents ? tl("Show fewer") : tl("Show all {n}", { n: t.events.length })}
                </button>
              )}
              <SectionCard
                section={tl("Tournaments")}
                name={t.name}
                rows={() =>
                  t.events
                    .filter((x) => !hiddenCheck(`team-event:${x.e}`, x.date))
                    .map((x) => ({ label: x.en, sub: tl("Series {s} · games {g}", { s: `${x.sw}-${x.sg - x.sw}`, g: `${x.w}-${x.g - x.w}` }), value: x.pl ? tl("Place {p}", { p: x.pl }) : undefined }))
                }
              />
            </span>
          }
        >
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>{tl("Tournament")}</th>
                  <th className={th}>{tl("Place")}</th>
                  <th className={th}>{tl("Series")}</th>
                  <th className={th}>{tl("Games")}</th>
                  <th className={th}>{tl("Prize")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((x) => (
                  <EventRow key={x.e} x={x} teamName={t.name} />
                ))}
              </tbody>
            </STable>
          </div>
        </Section>
      )}

      {tab === "matches" && <TeamSeriesArchive slug={t.u} teamName={t.name} />}

      {tab === "history" && rosterSection}

      {tab === "matches" && (
      <Section
        title={tl("Against other teams")}
        right={
          <SectionCard
            section={tl("Against other teams")}
            name={t.name}
            sub={tl("Most games against")}
            rows={() => [...t.opps].sort((a, b) => b.g - a.g).map((o) => ({ label: o.n, sub: `${o.w}-${o.g - o.w}`, value: winRate(o.w, o.g) }))}
          />
        }
      >
        <div className="overflow-x-auto max-h-[36rem]">
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Opponent")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
                <th className={th}>{tl("Last met")}</th>
              </tr>
            </thead>
            <tbody>
              {t.opps.map((o) => (
                <tr key={o.n} className="border-t border-rw-border">
                  <td className={td}>
                    <TeamLink name={o.n} u={o.u} />
                  </td>
                  <td className={`${td} text-rw-sub`}>
                    {o.u ? (
                      <HubLink
                        to={{ kind: "compare", mode: "team", a: t.u, b: o.u }}
                        className="hover:text-rw-teal hover:underline"
                        title={tl("Head to head")}
                      >
                        {o.w}-{o.g - o.w}
                      </HubLink>
                    ) : (
                      `${o.w}-${o.g - o.w}`
                    )}
                  </td>
                  <td className={`${td} text-rw-sub`}>{winRate(o.w, o.g)}</td>
                  <td className={`${td} text-rw-muted`} data-sort={o.last}>{fmtDate(o.last)}</td>
                </tr>
              ))}
            </tbody>
          </STable>
        </div>
      </Section>
      )}

      {tab === "champions" && <TeamChampionsTab t={t} initialPeriod={urlParams.get("p") || (rosterYear && rosterYear !== t.roster[0]?.y ? `y${rosterYear}` : "all")} to={to} />}
      </div>
    </div>
  );
};

const TeamChampionsTab: React.FC<{ t: HubTeam; initialPeriod: PeriodKey; to: (k: string) => HubRoute }> = ({ t, initialPeriod, to }) => {
  const [period, setPeriod] = useState<PeriodKey>(initialPeriod || "all");
  const log = useLoad(() => loadTeamGames(t.u), [t.u]);
  const options = useMemo(() => (log.data ? periodOptions(log.data.map(teamRowRef)) : []), [log.data]);
  const agg = useMemo(() => {
    if (!log.data || period === "all") return null;
    const rows = inPeriod(log.data, period, teamRowRef);
    return teamAgg(rows);
  }, [log.data, period]);
  const champs = agg ? agg.picks.map(([c, g, w]) => ({ c, g, w })) : t.champs;
  const bans = agg ? agg.bans.map(([c, g]) => ({ c, g })) : t.bans;
  const bansVs = agg ? agg.bansVs.map(([c, g]) => ({ c, g })) : t.bansVs || [];
  return (
    <div className="rw-span space-y-3">
      {options.length > 0 && (
        <div className={`${card} !py-2 flex flex-wrap items-center justify-between gap-2 text-xs`}>
          <span className="text-rw-sub font-semibold">{tl("Stats for")}</span>
          <PeriodPicker options={options} value={period} onChange={setPeriod} />
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title={tl("Most picked champions")}
          right={<SectionCard section={tl("Most picked champions")} name={t.name} rows={() => champs.map((c) => ({ champ: c.c, label: champName(c.c), sub: tl("{n} games", { n: c.g }), value: winRate(c.w, c.g) }))} />}
        >
          <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
            {champs.map((c) => (
              <li key={c.c} className="flex justify-between gap-1 min-w-0">
                <ChampLink name={c.c} size={16} />
                <span className="text-rw-muted shrink-0">
                  {c.g} · {winRate(c.w, c.g)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section
          title={tl("Most banned by them")}
          right={<SectionCard section={tl("Most banned by them")} name={t.name} rows={() => bans.map((c) => ({ champ: c.c, label: champName(c.c), value: String(c.g) }))} />}
        >
          <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
            {bans.map((c) => (
              <li key={c.c} className="flex justify-between gap-1 min-w-0">
                <ChampLink name={c.c} size={16} />
                <span className="text-rw-muted shrink-0">{c.g}</span>
              </li>
            ))}
          </ul>
        </Section>
        {bansVs.length > 0 && (
          <Section
            title={tl("Most banned against them")}
            right={<SectionCard section={tl("Most banned against them")} name={t.name} rows={() => bansVs.map((c) => ({ champ: c.c, label: champName(c.c), value: String(c.g) }))} />}
          >
            <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
              {bansVs.map((c) => (
                <li key={c.c} className="flex justify-between gap-1 min-w-0">
                  <ChampLink name={c.c} size={16} />
                  <span className="text-rw-muted shrink-0">{c.g}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        <p className="text-[11px] text-rw-muted md:col-span-2">
          {tl("Every game since {year}.", { year: t.from.slice(0, 4) })}{" "}
          <HubLink to={to("stats")} className="text-rw-teal hover:underline">
            {tl("Draft tendencies for any period are under Stats.")}
          </HubLink>
        </p>
      </div>
    </div>
  );
};

const EventRow: React.FC<{ x: HubTeam["events"][number]; teamName: string }> = ({ x, teamName }) => {
  const [hidden, reveal] = useHidden(`team-event:${x.e}`, x.date);
  return (
    <tr className="border-t border-rw-border">
      <td className={`${td} max-w-[14rem] truncate`}>
        <EventLink name={x.en} u={x.e} />
        {x.as && x.as !== teamName && <span className="text-rw-muted text-[10px]"> {tl("as {name}", { name: x.as })}</span>}
      </td>
      <td className={`${td} ${x.pl === "1" ? "text-rw-accent font-bold" : "text-rw-sub"}`}>
        {hidden ? <RevealButton onReveal={reveal} small /> : x.pl || "–"}
      </td>
      <td className={`${td} text-rw-sub`}>{hidden ? "–" : `${x.sw}-${x.sg - x.sw}`}</td>
      <td className={`${td} text-rw-sub`}>{hidden ? "–" : `${x.w}-${x.g - x.w}`}</td>
      <td className={`${td} text-rw-muted`} data-sort={x.usd && !hidden ? x.usd : 0}>{x.usd && !hidden ? fmtUsd(x.usd) : ""}</td>
    </tr>
  );
};

