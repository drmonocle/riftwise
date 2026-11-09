/**
 * Team page, in tabs (each its own address, /team/t1/<tab>): Overview (record, next match, recent series, this
 * year's roster, storylines, titles), Stats (any period, league ranks), Matches (every series, rivals), History (tournaments with
 * placements, roster by year) and Champions.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { tl, tk, roleName, regionName, eventTitle, tc, tn, fmtDec } from "../../i18n";
import { winRate } from "../../stats";
import { loadHubTeam, loadPlayerGames, loadTeamGames, loadTeamGames2y, prettySlug } from "../../hub/data";
import { currentHubRoute, navigateHub, type HubRoute } from "../../hub/route";
import { PageTabs, type PageTab } from "./PageTabs";
import type { HubTeam, PlayerGameRow, TeamGameRow } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { TeamSeriesArchive } from "./Archives";
import { PeriodPicker, QuickPeriods, TeamPeriodStats, playstyleTags } from "./PeriodStats";
import { PeriodKey, inPeriod, periodOptions, teamAgg, teamRowRef } from "../../hub/period";
import { TeamRanks } from "./Ranks";
import { OwnStorylines } from "./Storylines";
import { CaptureContext, card, ChampIcon, ChampLink, EventLink, fmtDate, fmtNum, fmtUsd, fmtUsdShort, HubLink, isFresh, Loading, Page, PlayerLink, PlayerPhoto, ratingTextClass, RevealButton, Section, Stat, td, TeamLink, TeamLogo, th, useHidden, useHiddenCheck, useLoad, usePageTitle, PhotosLink, FollowFeeds } from "./ui";
import { Sparkline } from "./Sparkline";
import { TeamOpponentsChart, WinBar } from "./OpponentChart";
import { TeamFormAndSideCard } from "./VisualAnalytics";
import { STable } from "../STable";
import { SectionCard, BroadcastCardButton, teamCareerCardData } from "./BroadcastCard";
import { champName } from "../../champions";
import { NextMatch } from "./NextMatch";
import { EntityHero, heroBtn, heroLink } from "./EntityHero";
import { useTeamLogo } from "../../hub/riotCatalog";

const select = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-xs text-rw-text";

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
  // Riot's logo when it has one; otherwise the top card shows the team's short name in a tile
  const logo = useTeamLogo(t.name, t.codes[0]);
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
                className="text-[11px] text-rw-accent hover:underline"
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
                  {overview && <PhotosLink q={p.n} iconOnly className="text-rw-muted hover:text-rw-accent" />}
                </span>
              ))}
            </div>
          );
        })}
        {overview && t.roster.length > 1 && (
          <HubLink to={to("history")} className="text-[11px] text-rw-accent hover:underline">
            {tl("Every roster since {year}", { year: t.roster[t.roster.length - 1].y })}
          </HubLink>
        )}
      </div>
    </Section>
  );
  return (
    <div>
      {/* the team's name on every tab; its numbers, old names and buttons on the Overview */}
      <EntityHero
        tabbed
        compact={!overview}
        media={
          logo ? (
            <TeamLogo
              name={t.name}
              code={t.codes[0]}
              sizeClass={overview ? "w-[72px] h-[72px] md:w-[104px] md:h-[104px]" : "w-10 h-10 sm:w-12 sm:h-12"}
              className="drop-shadow-[0_8px_18px_rgba(0,0,0,0.5)]"
            />
          ) : (
            <span
              className={`flex items-center justify-center rounded-2xl bg-rw-raised border border-rw-border font-num font-bold text-rw-accent ${
                overview ? "w-[72px] h-[72px] md:w-[104px] md:h-[104px] text-[22px] md:text-[30px]" : "w-10 h-10 sm:w-12 sm:h-12 text-[15px]"
              }`}
            >
              {(t.codes[0] || t.name).slice(0, 4)}
            </span>
          )
        }
        title={
          <>
            {t.name}
            {t.codes.length > 0 && <span className="text-rw-muted text-[0.5em] font-semibold ml-2 align-middle">{t.codes.slice(0, 3).join(" · ")}</span>}
          </>
        }
        lines={
          <p>
            {[t.region ? regionName(t.region, t.region) : null, tl("Pro games from {from} to {to}", { from: fmtDate(t.from), to: fmtDate(t.to) }), t.disbanded ? tl("Disbanded") : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        }
        extra={
          overview && oldNames.length > 0 ? (
            <p className="text-[13px] text-rw-sub">
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
                      className="text-rw-muted hover:text-rw-accent hover:underline"
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
          ) : undefined
        }
        aside={
          <>
            {overview && (
              <div className="flex flex-wrap gap-2 md:justify-end">
                <HubLink to={{ kind: "compare", mode: "team", a: t.u }} className={heroBtn(true)}>
                  {tl("Compare")}
                </HubLink>
                <HubLink to={{ kind: "prep", a: t.u }} className={heroBtn()}>
                  {tl("Match prep")}
                </HubLink>
                <HubLink to={{ kind: "draft", query: `teams=${t.u}` }} className={heroBtn()}>
                  {tl("Draft board")}
                </HubLink>
                <BroadcastCardButton hero data={() => teamCareerCardData(t)} name={`${t.name}-overview`} label={tl("Overview card")} />
                <CopyTeamPost t={t} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:justify-end">
              <HubLink to={{ kind: "finder", query: `team=${encodeURIComponent(t.name)}` }} className={heroLink}>
                {tl("Game finder")}
              </HubLink>
              <PhotosLink q={t.name} className={heroLink} />
              {/* its own calendar and results feed, while it still plays (the schedule only has current teams) */}
              {!t.disbanded && Date.now() - Date.parse(t.to) < 180 * 86_400_000 && <FollowFeeds teams={[t.name]} />}
            </div>
          </>
        }
        stats={
          overview
            ? [
                { label: tl("Games"), value: `${fmtNum(t.w)}–${fmtNum(t.g - t.w)}`, sub: tl("{pct} win rate", { pct: winRate(t.w, t.g) }) },
                { label: tl("Series"), value: `${t.sw}–${t.sg - t.sw}`, sub: tl("{pct} won", { pct: winRate(t.sw, t.sg) }) },
                t.rating
                  ? {
                      label: tl("Power ranking"),
                      value: `#${t.rating.rank ?? t.rating.lrank}`,
                      sub:
                        t.rating.rank != null
                          ? tl("#{lrank} in {league} · rating {r}", { lrank: t.rating.lrank, league: t.rating.league || "–", r: t.rating.r })
                          : tl("in {league} · rating {r}", { league: t.rating.league || "–", r: t.rating.r }),
                      to: { kind: "rankings" } as HubRoute,
                      title: t.rh && t.rh.length > 1 ? tl("Rating over the last year") : undefined,
                      corner: t.rh && t.rh.length > 1 ? <Sparkline points={t.rh} width={64} height={20} /> : undefined,
                    }
                  : null,
                {
                  label: tl("Titles"),
                  value: t.titles.length,
                  sub:
                    worlds || msi || firstStand
                      ? [tl("{n} Worlds", { n: worlds }), tl("{n} MSI", { n: msi }), firstStand ? tl("{n} First Stand", { n: firstStand }) : ""].filter(Boolean).join(" · ")
                      : tl("finals won"),
                },
                t.earnings
                  ? { label: tl("Prize money"), value: fmtUsdShort(t.earnings), title: fmtUsd(t.earnings), sub: `${fmtUsd(t.earnings)} · ${tl("as listed in US dollars")}` }
                  : null,
                { label: tl("Best streak"), value: t.bestStreak ? tl("{n} wins", { n: t.bestStreak.n }) : "–", sub: t.bestStreak ? fmtDate(t.bestStreak.date) : undefined },
                { label: tl("Avg game"), value: tl("{n} min", { n: t.avgMin }) },
                t.kills != null ? { label: tl("Kills / game"), value: t.kills, sub: tl("{n} deaths", { n: t.deaths ?? 0 }) } : null,
                t.obj ? { label: tl("Dragons / game"), value: t.obj.dragons, sub: tl("{n} barons", { n: t.obj.barons }) } : null,
                t.sides && t.sides[0] + t.sides[2] > 0
                  ? {
                      label: tl("Blue / red side"),
                      value: `${winRate(t.sides[1], t.sides[0])} / ${winRate(t.sides[3], t.sides[2])}`,
                      sub: tl("{b} blue games · {r} red", { b: fmtNum(t.sides[0]), r: fmtNum(t.sides[2]) }),
                    }
                  : null,
                t.obj
                  ? {
                      label: tl("Gold diff / game"),
                      value: `${t.obj.golddiff >= 0 ? "+" : ""}${fmtNum(Math.round(t.obj.golddiff))}`,
                      sub: tl("{n} towers", { n: t.obj.towers }),
                    }
                  : null,
              ]
            : undefined
        }
      />
      <PageTabs tabs={tabs} active={tab} to={to} attached />
      <div className="rw-page mt-3">
      {tab === "stats" && (
        <div className="rw-span space-y-3">
          <TeamPeriodStats
            slug={t.u}
            has2y={!!t.g2y}
            preferAll={!!t.disbanded || t.to.slice(0, 4) < String(new Date().getFullYear() - 1)}
            who={{ name: t.name, sub: [t.region, t.rating?.league].filter(Boolean).join(" · ") || undefined, code: t.codes[0], roster: t.roster[0]?.p }}
          />
          <TeamRanks slug={t.u} name={t.name} events={t.events} has2y={!!t.g2y} />
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
                    <HubLink to={{ kind: "team", slug: t.u, tab: "stats", query: `p=y${y.y}` }} className="hover:text-rw-accent hover:underline font-medium">
                      {y.y}
                    </HubLink>
                    {y.as !== t.name && <span className="text-rw-muted text-[10px]"> {tl("as {name}", { name: y.as })}</span>}
                  </td>
                  <td className={`${td} text-rw-sub`}>
                    <HubLink to={{ kind: "team", slug: t.u, tab: "stats", query: `p=y${y.y}` }} className="hover:text-rw-accent hover:underline">
                      {y.w}-{y.g - y.w}
                    </HubLink>
                  </td>
                  <td className={`${td} text-rw-sub`}>
                    <WinBar w={y.w} g={y.g} />
                  </td>
                </tr>
              ))}
            </tbody>
          </STable>
        </Section>
      </div>
      )}

      {overview && <div className="rw-span">{rosterSection}</div>}

      {overview && (
        <div className="rw-span">
          <TeamPlaystyleOverview t={t} />
        </div>
      )}

      {overview && <TeamFormAndSideCard t={t} cardSub={cardSub} />}

      {overview && t.opps.length > 0 && (
        <div className="rw-span">
          <TeamOpponentsChart teamSlug={t.u} teamName={t.name} opps={t.opps} cardSub={cardSub} compact />
        </div>
      )}

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
                <button type="button" onClick={() => setAllEvents((v) => !v)} className="text-[11px] text-rw-accent hover:underline">
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
        <div className="rw-span">
          <TeamOpponentsChart teamSlug={t.u} teamName={t.name} opps={t.opps} cardSub={tl("Most games against")} />
        </div>
      )}

      {tab === "champions" && (
        <TeamChampionsTab
          t={t}
          initialPeriod={urlParams.get("p") || (rosterYear && rosterYear !== t.roster[0]?.y ? `y${rosterYear}` : "all")}
          initialChamp={urlParams.get("champ")}
          asParam={asParam}
          to={to}
        />
      )}
      </div>
    </div>
  );
};

const ROLE_NAMES = ["Top", "Jungle", "Mid", "Bot", "Support"];

const TeamChampionsTab: React.FC<{
  t: HubTeam;
  initialPeriod: PeriodKey;
  initialChamp?: string | null;
  asParam?: string;
  to: (k: string) => HubRoute;
}> = ({ t, initialPeriod, initialChamp, asParam, to }) => {
  const [period, setPeriod] = useState<PeriodKey>(initialPeriod || "all");
  const [selectedChamp, setSelectedChamp] = useState<string | null>(initialChamp || null);
  useEffect(() => {
    setSelectedChamp(initialChamp || null);
  }, [initialChamp]);
  useEffect(() => {
    setPeriod(initialPeriod || "all");
  }, [initialPeriod]);

  const syncUrl = (nextChamp: string | null, nextPeriod: PeriodKey) => {
    const q = new URLSearchParams();
    if (asParam) q.set("as", asParam);
    if (nextPeriod && nextPeriod !== "all") q.set("p", nextPeriod);
    if (nextChamp) q.set("champ", nextChamp);
    const qs = q.toString();
    navigateHub({ kind: "team", slug: t.u, tab: "champions", ...(qs ? { query: qs } : {}) }, { replace: true });
  };

  const pickChamp = (c: string | null) => {
    setSelectedChamp(c);
    syncUrl(c, period);
    if (c) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pickPeriod = (p: PeriodKey) => {
    setPeriod(p);
    syncUrl(selectedChamp, p);
  };

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
  const maxPickG = Math.max(1, ...champs.map((c) => c.g));
  const maxBanG = Math.max(1, ...bans.map((c) => c.g));
  const maxBanVsG = Math.max(1, ...bansVs.map((c) => c.g));
  return (
    <div className="rw-span space-y-3">
      {options.length > 0 && (
        <div className={`${card} !py-2 flex flex-wrap items-center justify-between gap-2 text-xs`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-rw-sub font-semibold">{tl("Stats for")}</span>
            <QuickPeriods options={options} value={period} onChange={pickPeriod} />
          </div>
          <PeriodPicker options={options} value={period} onChange={pickPeriod} />
        </div>
      )}
      {selectedChamp && (
        <TeamChampGames
          t={t}
          rows={log.data}
          loading={log.loading}
          champ={selectedChamp}
          period={period}
          allChamps={champs}
          onSelectChamp={pickChamp}
          onClose={() => pickChamp(null)}
        />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title={tl("Most picked champions")}
          right={<SectionCard section={tl("Most picked champions")} name={t.name} rows={() => champs.map((c) => ({ champ: c.c, label: champName(c.c), sub: tl("{n} games", { n: c.g }), value: winRate(c.w, c.g) }))} />}
        >
          <ul className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            {champs.map((c) => {
              const isSel = selectedChamp?.toLowerCase() === c.c.toLowerCase();
              const good = c.g > 0 && c.w / c.g >= 0.5;
              return (
                <li
                  key={c.c}
                  className={`flex items-center justify-between gap-1.5 min-w-0 rounded px-1 py-0.5 transition-colors ${
                    isSel ? "bg-rw-accent/15 ring-1 ring-rw-accent/50" : "hover:bg-rw-raised/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => pickChamp(c.c)}
                    className="flex items-center gap-1.5 min-w-0 text-left hover:text-rw-accent truncate"
                    title={tl("Every game on {champ}", { champ: champName(c.c) })}
                  >
                    <ChampIcon name={c.c} size={16} />
                    <span className="truncate font-medium text-rw-text">{champName(c.c)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => pickChamp(c.c)}
                    className="inline-flex items-center gap-1.5 text-rw-sub hover:text-rw-accent shrink-0 tabular-nums"
                    title={tl("Every game on {champ}", { champ: champName(c.c) })}
                  >
                    <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden lg:inline-block shrink-0">
                      <span className="block h-full bg-rw-teal/75 rounded-full" style={{ width: `${Math.max(8, Math.round((c.g / maxPickG) * 100))}%` }} />
                    </span>
                    <span>{c.g}</span>
                    <span className="text-rw-muted">·</span>
                    <span className={`w-9 text-right ${good ? "text-rw-teal font-semibold" : "text-rw-red"}`}>{winRate(c.w, c.g)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section
          title={tl("Most banned by them")}
          right={<SectionCard section={tl("Most banned by them")} name={t.name} rows={() => bans.map((c) => ({ champ: c.c, label: champName(c.c), value: String(c.g) }))} />}
        >
          <ul className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            {bans.map((c) => (
              <li key={c.c} className="flex items-center justify-between gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => pickChamp(c.c)}
                  className="flex items-center gap-1.5 min-w-0 text-left hover:text-rw-accent truncate"
                >
                  <ChampIcon name={c.c} size={16} />
                  <span className="truncate text-rw-text">{champName(c.c)}</span>
                </button>
                <span className="inline-flex items-center gap-1.5 text-rw-muted shrink-0 tabular-nums">
                  <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden lg:inline-block shrink-0">
                    <span className="block h-full bg-rw-accent/65 rounded-full" style={{ width: `${Math.max(8, Math.round((c.g / maxBanG) * 100))}%` }} />
                  </span>
                  <span className="w-5 text-right">{c.g}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
        {bansVs.length > 0 && (
          <Section
            title={tl("Most banned against them")}
            right={<SectionCard section={tl("Most banned against them")} name={t.name} rows={() => bansVs.map((c) => ({ champ: c.c, label: champName(c.c), value: String(c.g) }))} />}
          >
            <ul className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
              {bansVs.map((c) => (
                <li key={c.c} className="flex items-center justify-between gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => pickChamp(c.c)}
                    className="flex items-center gap-1.5 min-w-0 text-left hover:text-rw-accent truncate"
                  >
                    <ChampIcon name={c.c} size={16} />
                    <span className="truncate text-rw-text">{champName(c.c)}</span>
                  </button>
                  <span className="inline-flex items-center gap-1.5 text-rw-muted shrink-0 tabular-nums">
                    <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden lg:inline-block shrink-0">
                      <span className="block h-full bg-rw-red/70 rounded-full" style={{ width: `${Math.max(8, Math.round((c.g / maxBanVsG) * 100))}%` }} />
                    </span>
                    <span className="w-5 text-right">{c.g}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        <p className="text-[11px] text-rw-muted md:col-span-2">
          {tl("Every game since {year}.", { year: t.from.slice(0, 4) })}{" "}
          <HubLink to={to("stats")} className="text-rw-accent hover:underline">
            {tl("Draft tendencies for any period are under Stats.")}
          </HubLink>
        </p>
      </div>
    </div>
  );
};

/**
 * Dedicated Team + Champion view (/team/<slug>/champions?champ=<Champ>): shows the team's record, side split,
 * lane & team gold diff at 15, bans, which players on the team played that champion, top draft partners,
 * and every game the team played on that champion.
 */
const TeamChampGames: React.FC<{
  t: HubTeam;
  rows: TeamGameRow[] | null | undefined;
  loading: boolean;
  champ: string;
  period: PeriodKey;
  allChamps: { c: string; g: number; w: number }[];
  onSelectChamp: (c: string) => void;
  onClose: () => void;
}> = ({ t, rows, loading, champ, period, allChamps, onSelectChamp, onClose }) => {
  const [year, setYear] = useState("all");
  const [sideFilter, setSideFilter] = useState<"all" | "b" | "r">("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [limit, setLimit] = useState(25);

  useEffect(() => {
    setPlayerFilter("all");
    setLimit(25);
  }, [champ]);

  useEffect(() => {
    if (/^y\d{4}$/.test(period)) setYear(period.slice(1));
    else setYear("all");
  }, [period]);

  const canonical = useMemo(() => {
    const low = champ.toLowerCase();
    const hit =
      t.champs.find((x) => x.c.toLowerCase() === low || champName(x.c).toLowerCase() === low)?.c ||
      t.bans.find((x) => x.c.toLowerCase() === low || champName(x.c).toLowerCase() === low)?.c ||
      (t.bansVs || []).find((x) => x.c.toLowerCase() === low || champName(x.c).toLowerCase() === low)?.c;
    return hit || champ;
  }, [t, champ]);

  const periodRows = useMemo(() => {
    if (!rows) return [];
    return period === "all" ? rows : inPeriod(rows, period, teamRowRef);
  }, [rows, period]);

  const pickEntries = useMemo(() => {
    const low = canonical.toLowerCase();
    const out: { r: TeamGameRow; idx: number; roleIdx: number | null; gd15: number | null }[] = [];
    for (const r of periodRows) {
      const picks = r[20] || [];
      const idx = picks.findIndex((c) => c.toLowerCase() === low || champName(c).toLowerCase() === low);
      if (idx >= 0) {
        const roleIdx = r[22]?.[idx] != null && r[22]![idx] >= 0 ? r[22]![idx] : null;
        const gd15 = r[24]?.[idx] ?? null;
        out.push({ r, idx, roleIdx, gd15 });
      }
    }
    return out;
  }, [periodRows, canonical]);

  // Identify candidate roster players who played in the years & roles where this champion was picked, and load their logs
  // so we can show exact player records and per-game K/D/A.
  const candidatePlayers = useMemo(() => {
    const years = new Set(pickEntries.map((x) => x.r[0].slice(0, 4)));
    const roles = new Set(pickEntries.map((x) => (x.roleIdx != null ? ROLE_NAMES[x.roleIdx] : "")).filter(Boolean));
    const map = new Map<string, { n: string; u: string; r: string }>();
    for (const ry of t.roster) {
      if (years.size > 0 && !years.has(ry.y)) continue;
      for (const p of ry.p) {
        if (!p.u) continue;
        if (roles.size === 0 || roles.has(p.r)) {
          if (!map.has(p.u)) map.set(p.u, { n: p.n, u: p.u, r: p.r });
        }
      }
    }
    return [...map.values()].slice(0, 30);
  }, [t.roster, pickEntries]);

  const [playerLogs, setPlayerLogs] = useState<Record<string, PlayerGameRow[]>>({});
  useEffect(() => {
    let alive = true;
    for (const p of candidatePlayers) {
      if (playerLogs[p.u] !== undefined) continue;
      loadPlayerGames(p.u)
        .then((g) => {
          if (alive) setPlayerLogs((prev) => ({ ...prev, [p.u]: g }));
        })
        .catch(() => {
          if (alive) setPlayerLogs((prev) => ({ ...prev, [p.u]: [] }));
        });
    }
    return () => {
      alive = false;
    };
  }, [candidatePlayers, playerLogs]);

  // Match each team game on `canonical` to the player who played it (via player game logs, or single-role-starter fallback)
  const gamePlayerMap = useMemo(() => {
    const low = canonical.toLowerCase();
    const bySeriesDate = new Map<string, { n: string; u: string; r: string; k: number; d: number; a: number; g15: number | null }>();
    for (const p of candidatePlayers) {
      const logs = playerLogs[p.u] || [];
      for (const pg of logs) {
        if (pg[2]?.toLowerCase() !== low && champName(pg[2] || "").toLowerCase() !== low) continue;
        const key = `${pg[0]}|${pg[1] || ""}|${pg[22] || ""}`;
        const keyFallback = `${pg[0]}|${pg[1] || ""}|${pg[6]}`;
        const info = { n: p.n, u: p.u, r: pg[10] || p.r, k: pg[3], d: pg[4], a: pg[5], g15: pg[21]?.[3] ?? null };
        bySeriesDate.set(key, info);
        if (!bySeriesDate.has(keyFallback)) bySeriesDate.set(keyFallback, info);
      }
    }
    const result = new Map<TeamGameRow, { n: string; u: string | null; r: string; k?: number; d?: number; a?: number; g15?: number | null }>();
    for (const e of pickEntries) {
      const r = e.r;
      const hit = bySeriesDate.get(`${r[0]}|${r[1] || ""}|${r[7]}`);
      if (hit) {
        result.set(r, hit);
        continue;
      }
      // Fallback: if only 1 player played that role in that year on this team's roster
      if (e.roleIdx != null) {
        const roleNameStr = ROLE_NAMES[e.roleIdx];
        const yr = r[0].slice(0, 4);
        const rosterYr = t.roster.find((x) => x.y === yr);
        const inRole = (rosterYr?.p || []).filter((x) => x.r === roleNameStr);
        if (inRole.length === 1) {
          result.set(r, { n: inRole[0].n, u: inRole[0].u, r: roleNameStr, g15: e.gd15 });
        } else if (inRole.length > 1) {
          const main = [...inRole].sort((a, b) => b.g - a.g)[0];
          result.set(r, { n: main.n, u: main.u, r: roleNameStr, g15: e.gd15 });
        }
      }
    }
    return result;
  }, [pickEntries, candidatePlayers, playerLogs, canonical, t.roster]);

  // Aggregate per-player stats on this champion for this team
  const playersSummary = useMemo(() => {
    const map = new Map<string, { n: string; u: string | null; r: string; g: number; w: number; k: number; d: number; a: number; kdaGames: number; gdSum: number; gdGames: number }>();
    for (const e of pickEntries) {
      const who = gamePlayerMap.get(e.r);
      const roleStr = who?.r || (e.roleIdx != null ? ROLE_NAMES[e.roleIdx] : "");
      const key = who?.u || who?.n || (roleStr ? `role:${roleStr}` : "unknown");
      const cur = map.get(key) || {
        n: who?.n || (roleStr ? roleName(roleStr) : "–"),
        u: who?.u ?? null,
        r: roleStr,
        g: 0,
        w: 0,
        k: 0,
        d: 0,
        a: 0,
        kdaGames: 0,
        gdSum: 0,
        gdGames: 0,
      };
      cur.g++;
      cur.w += e.r[7];
      if (who?.k != null && who.d != null && who.a != null) {
        cur.k += who.k;
        cur.d += who.d;
        cur.a += who.a;
        cur.kdaGames++;
      }
      const gd = e.gd15 ?? who?.g15 ?? null;
      if (gd != null) {
        cur.gdSum += gd;
        cur.gdGames++;
      }
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.g - a.g || b.w - a.w);
  }, [pickEntries, gamePlayerMap]);

  // Draft synergies: most frequent teammate champions in the same 5-man composition
  const draftPartners = useMemo(() => {
    const low = canonical.toLowerCase();
    const counts = new Map<string, [number, number]>();
    for (const e of pickEntries) {
      for (const c of e.r[20] || []) {
        if (c.toLowerCase() === low || champName(c).toLowerCase() === low) continue;
        const cur = counts.get(c) || [0, 0];
        cur[0]++;
        cur[1] += e.r[7];
        counts.set(c, cur);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).slice(0, 6);
  }, [pickEntries, canonical]);

  const bansInfo = useMemo(() => {
    const low = canonical.toLowerCase();
    let byTeam = 0;
    let vsTeam = 0;
    for (const r of periodRows) {
      if ((r[19] || []).some((c) => c.toLowerCase() === low)) byTeam++;
      if ((r[21] || []).some((c) => c.toLowerCase() === low)) vsTeam++;
    }
    return { byTeam, vsTeam };
  }, [periodRows, canonical]);

  const years = useMemo(() => [...new Set(pickEntries.map((x) => x.r[0].slice(0, 4)))], [pickEntries]);
  const filtered = useMemo(
    () =>
      pickEntries.filter((e) => {
        if (year !== "all" && !e.r[0].startsWith(year)) return false;
        if (sideFilter !== "all" && e.r[6] !== sideFilter) return false;
        if (playerFilter !== "all") {
          const who = gamePlayerMap.get(e.r);
          if ((who?.u || who?.n || "") !== playerFilter) return false;
        }
        return true;
      }),
    [pickEntries, year, sideFilter, playerFilter, gamePlayerMap],
  );

  const [hidden, reveal] = useHidden(`teamchamp:${t.u}:${canonical}:${year}`, filtered.find((e) => isFresh(e.r[0]))?.r[0]);

  if (loading && !rows) return <Loading />;

  const totalG = pickEntries.length;
  const totalW = pickEntries.filter((e) => e.r[7] === 1).length;
  const blueEntries = pickEntries.filter((e) => e.r[6] === "b");
  const redEntries = pickEntries.filter((e) => e.r[6] === "r");
  const blueW = blueEntries.filter((e) => e.r[7] === 1).length;
  const redW = redEntries.filter((e) => e.r[7] === 1).length;
  const gdEntries = pickEntries.map((e) => e.gd15).filter((v): v is number => v != null);
  const avgGd15 = gdEntries.length > 0 ? Math.round(gdEntries.reduce((s, v) => s + v, 0) / gdEntries.length) : null;

  return (
    <Section
      title={`${t.name} · ${champName(canonical)}`}
      right={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={canonical}
            onChange={(e) => onSelectChamp(e.target.value)}
            aria-label={tl("Champion")}
            className={select}
          >
            {!allChamps.some((x) => x.c.toLowerCase() === canonical.toLowerCase()) && (
              <option value={canonical}>{champName(canonical)} (0)</option>
            )}
            {allChamps.map((x) => (
              <option key={x.c} value={x.c}>
                {champName(x.c)} ({x.g})
              </option>
            ))}
          </select>
          <HubLink to={{ kind: "champ", slug: prettySlug(canonical) }} className="text-[11px] text-rw-accent hover:underline">
            {champName(canonical)} →
          </HubLink>
          {!hidden && totalG > 0 && (
            <>
              <CopyTeamChampPost
                team={t}
                champ={canonical}
                totalG={totalG}
                totalW={totalW}
                avgGd15={avgGd15}
                players={playersSummary}
              />
              <SectionCard
                section={`${t.name} · ${champName(canonical)}`}
                sub={`${totalW}–${totalG - totalW} (${winRate(totalW, totalG)})`}
                name={`${t.u}-${prettySlug(canonical)}`}
                rows={() => [
                  ...playersSummary.map((pl) => ({
                    champ: canonical,
                    label: `${pl.n}${pl.r ? ` (${roleName(pl.r)})` : ""}`,
                    sub: pl.kdaGames > 0 ? `KDA ${fmtDec((pl.k + pl.a) / Math.max(pl.d, 1), 2)}` : undefined,
                    value: `${pl.w}–${pl.g - pl.w} (${winRate(pl.w, pl.g)})`,
                  })),
                  ...filtered.slice(0, 8).map((e) => ({
                    champ: canonical,
                    label: `vs ${e.r[4]}`,
                    sub: `${e.r[3]} · ${fmtDate(e.r[0])}`,
                    value: e.r[7] ? tc("short result", "W") : tc("short result", "L"),
                    win: e.r[7] === 1,
                  })),
                ]}
              />
            </>
          )}
          <button type="button" onClick={onClose} className="text-[11px] text-rw-sub hover:text-rw-text">
            {tl("Close")}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-xs">
        {/* Top KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat
            label={tl("Picks")}
            value={totalG > 0 ? `${totalW}–${totalG - totalW} (${winRate(totalW, totalG)})` : tl("{n} games", { n: 0 })}
            sub={tn("{n} game", "{n} games", totalG)}
          />
          <Stat
            label={tl("Blue / red side")}
            value={
              totalG > 0
                ? `${blueEntries.length ? winRate(blueW, blueEntries.length) : "–"} / ${redEntries.length ? winRate(redW, redEntries.length) : "–"}`
                : "–"
            }
            sub={`${blueW}–${blueEntries.length - blueW} ${tl("Blue side")} · ${redW}–${redEntries.length - redW} ${tl("Red side")}`}
          />
          <Stat
            label={tl("Gold @15")}
            value={avgGd15 != null ? `${avgGd15 > 0 ? "+" : ""}${fmtNum(avgGd15)}` : "–"}
            sub={tl("Average lead over the lane opponent at 15 minutes")}
          />
          <Stat
            label={tl("Bans")}
            value={`${bansInfo.byTeam} / ${bansInfo.vsTeam}`}
            sub={tl("Banned it {n} times · banned against them {m} times", { n: bansInfo.byTeam, m: bansInfo.vsTeam })}
          />
        </div>

        {/* Players on this team who played the champion + Most paired with */}
        {totalG > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {playersSummary.length > 0 && (
              <div className="bg-rw-bg border border-rw-border rounded-lg p-2.5 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted">
                  {tl("Most games on {champion}", { champion: champName(canonical) })}
                </div>
                <ul className="space-y-1">
                  {playersSummary.map((pl) => (
                    <li key={pl.u || pl.n} className="flex items-center justify-between gap-2 min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <PlayerPhoto slug={pl.u ?? undefined} name={pl.n} team={t.name} size={20} />
                        {pl.u ? (
                          <HubLink
                            to={{ kind: "player", slug: pl.u, tab: "champions", query: `champ=${encodeURIComponent(canonical)}` }}
                            className="font-semibold text-rw-text hover:text-rw-accent truncate"
                          >
                            {pl.n}
                          </HubLink>
                        ) : (
                          <span className="font-semibold text-rw-text truncate">{pl.n}</span>
                        )}
                        {pl.r && <span className="text-[10px] text-rw-muted shrink-0">· {roleName(pl.r)}</span>}
                      </span>
                      <span className="text-rw-sub tabular-nums shrink-0 text-[11px]">
                        {pl.g}G · {pl.w}–{pl.g - pl.w} ({winRate(pl.w, pl.g)})
                        {pl.kdaGames > 0 && ` · KDA ${fmtDec((pl.k + pl.a) / Math.max(pl.d, 1), 2)}`}
                        {pl.gdGames > 0 && (
                          <span className="text-rw-muted">
                            {` · GD@15 ${Math.round(pl.gdSum / pl.gdGames) > 0 ? "+" : ""}${Math.round(pl.gdSum / pl.gdGames)}`}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {draftPartners.length > 0 && (
              <div className="bg-rw-bg border border-rw-border rounded-lg p-2.5 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted">
                  {tl("With {name}", { name: champName(canonical) })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                  {(() => {
                    const maxPartG = Math.max(1, ...draftPartners.map(([, [g]]) => g));
                    return draftPartners.map(([c, [g, w]]) => {
                      const good = g > 0 && w / g >= 0.5;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => onSelectChamp(c)}
                          className="flex items-center justify-between gap-1.5 min-w-0 text-left hover:bg-rw-raised rounded px-1 py-0.5"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <ChampIcon name={c} size={16} />
                            <span className="truncate text-rw-text">{champName(c)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-rw-sub tabular-nums shrink-0 text-[11px]">
                            <span className="w-7 h-1.5 bg-rw-raised rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                              <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(8, Math.round((g / maxPartG) * 100))}%` }} />
                            </span>
                            <span>{g}G</span>
                            <span className="text-rw-muted">·</span>
                            <span className={`w-9 text-right ${good ? "text-rw-teal font-semibold" : "text-rw-red"}`}>{winRate(w, g)}</span>
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Game Log */}
        {totalG === 0 ? (
          <p className="text-rw-muted py-2">
            {tl("Not picked in this period")}
          </p>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted">
                {tl("Every game on {champ}", { champ: champName(canonical) })}
              </span>
              {years.length > 1 && (
                <select
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setLimit(25);
                  }}
                  aria-label={tl("Year")}
                  className={select}
                >
                  <option value="all">{tl("All years")}</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={sideFilter}
                onChange={(e) => {
                  setSideFilter(e.target.value as "all" | "b" | "r");
                  setLimit(25);
                }}
                aria-label={tl("Blue / red side")}
                className={select}
              >
                <option value="all">{tl("All")}</option>
                <option value="b">{tl("Blue side")}</option>
                <option value="r">{tl("Red side")}</option>
              </select>
              {playersSummary.length > 1 && (
                <select
                  value={playerFilter}
                  onChange={(e) => {
                    setPlayerFilter(e.target.value);
                    setLimit(25);
                  }}
                  aria-label={tl("Player")}
                  className={select}
                >
                  <option value="all">{tl("All")}</option>
                  {playersSummary.map((p) => (
                    <option key={p.u || p.n} value={p.u || p.n}>
                      {p.n} ({p.g})
                    </option>
                  ))}
                </select>
              )}
              <span className="text-[11px] text-rw-sub">
                {tn("{n} game", "{n} games", filtered.length)}
                {!hidden && filtered.length > 0 && (
                  <>
                    {" · "}
                    {tl("{pct} win rate", {
                      pct: winRate(
                        filtered.filter((e) => e.r[7] === 1).length,
                        filtered.length,
                      ),
                    })}
                  </>
                )}
              </span>
              {hidden && <RevealButton onReveal={reveal} small />}
            </div>

            <ul className="space-y-1">
              {filtered.slice(0, limit).map((e, i) => {
                const r = e.r;
                const hide = hidden && isFresh(r[0]);
                const who = gamePlayerMap.get(r);
                const roleStr = who?.r || (e.roleIdx != null ? ROLE_NAMES[e.roleIdx] : "");
                const otherPicks = (r[20] || []).filter((_, idx) => idx !== e.idx);
                return (
                  <li key={i} className="flex items-center justify-between gap-2 min-w-0 py-0.5 border-t border-rw-border/40 first:border-t-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-3.5 shrink-0 font-bold ${hide ? "text-rw-muted" : r[7] ? "text-rw-teal" : "text-rw-red"}`}>
                        {hide ? "?" : r[7] ? tc("short result", "W") : tc("short result", "L")}
                      </span>
                      <HubLink to={{ kind: "champ", slug: prettySlug(canonical) }} className="shrink-0">
                        <ChampIcon name={canonical} size={18} />
                      </HubLink>
                      <span className="truncate min-w-0">
                        {who && (
                          <>
                            {who.u ? (
                              <PlayerLink name={who.n} u={who.u} className="font-semibold text-rw-text hover:text-rw-accent" />
                            ) : (
                              <span className="font-semibold text-rw-text">{who.n}</span>
                            )}{" "}
                            {who.k != null && (
                              <span className="text-rw-text tabular-nums">{hide ? "?/?/?" : `${who.k}/${who.d}/${who.a}`}</span>
                            )}{" "}
                          </>
                        )}
                        <span className="text-rw-sub">
                          vs {r[4]}
                          {roleStr ? ` · ${roleName(roleStr)}` : ""}
                        </span>{" "}
                        <span className="text-rw-muted">
                          · <EventLink name={r[3]} u={r[2]} className="text-rw-muted hover:text-rw-accent hover:underline" />
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                      {!hide && e.gd15 != null && (
                        <span
                          className={`hidden sm:inline font-mono text-[10px] tabular-nums ${e.gd15 >= 0 ? "text-rw-teal" : "text-rw-red"}`}
                          title={tl("Average lead over the lane opponent at 15 minutes")}
                        >
                          GD@15 {e.gd15 > 0 ? "+" : ""}
                          {e.gd15}
                        </span>
                      )}
                      {otherPicks.length > 0 && (
                        <span className="hidden md:flex items-center gap-0.5" title={tl("Picks")}>
                          {otherPicks.map((oc, oi) => (
                            <button
                              key={`${oc}-${oi}`}
                              type="button"
                              onClick={() => onSelectChamp(oc)}
                              title={champName(oc)}
                              className="hover:opacity-80"
                            >
                              <ChampIcon name={oc} size={15} />
                            </button>
                          ))}
                        </span>
                      )}
                      {fmtDate(r[0])}
                      {r[1] && (
                        <HubLink to={{ kind: "match", slug: r[1] }} className="text-rw-accent hover:underline">
                          {tl("Details")}
                        </HubLink>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {filtered.length > limit && (
              <button type="button" onClick={() => setLimit((x) => x + 50)} className="text-[11px] text-rw-accent hover:underline">
                {tl("Show more ({n} left)", { n: filtered.length - limit })}
              </button>
            )}
          </div>
        )}
      </div>
    </Section>
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
      <td className={`${td} text-rw-sub`} data-sort={hidden ? x.sg : x.sg ? x.sw / x.sg : 0}>
        {hidden ? "–" : x.sg > 0 ? <WinBar w={x.sw} g={x.sg} showRecord /> : "–"}
      </td>
      <td className={`${td} text-rw-sub`} data-sort={hidden ? x.g : x.g ? x.w / x.g : 0}>
        {hidden ? "–" : x.g > 0 ? <WinBar w={x.w} g={x.g} showRecord /> : "–"}
      </td>
      <td className={`${td} text-rw-muted`} data-sort={x.usd && !hidden ? x.usd : 0}>{x.usd && !hidden ? fmtUsd(x.usd) : ""}</td>
    </tr>
  );
};

/** Visual playstyle & early-game DNA card on the Team Overview tab, with 16:9 card export. */
const TeamPlaystyleOverview: React.FC<{ t: HubTeam }> = ({ t }) => {
  const [rows, setRows] = useState<TeamGameRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    const load = t.g2y ? loadTeamGames2y(t.u) : loadTeamGames(t.u);
    load
      .catch(() => (t.g2y ? loadTeamGames(t.u).catch(() => [] as TeamGameRow[]) : ([] as TeamGameRow[])))
      .then((res) => alive && setRows(res));
    return () => {
      alive = false;
    };
  }, [t.u, t.g2y]);

  const { periodRows, periodLabel } = useMemo(() => {
    if (!rows || !rows.length) return { periodRows: [] as TeamGameRow[], periodLabel: "" };
    const latestYear = t.years[t.years.length - 1]?.y;
    if (latestYear) {
      const yRows = rows.filter((r) => r[0].startsWith(latestYear));
      if (yRows.length >= 12) return { periodRows: yRows, periodLabel: `${latestYear} · ${yRows.length}G` };
    }
    const recent = rows.slice(0, 50);
    return { periodRows: recent, periodLabel: `${recent.length}G` };
  }, [rows, t.years]);

  const agg = useMemo(() => (periodRows.length ? teamAgg(periodRows) : null), [periodRows]);
  const tags = useMemo(() => (agg ? playstyleTags(agg) : []), [agg]);
  const fresh = periodRows.map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`team-playstyle:${t.u}`, fresh);

  if (!agg || agg.g < 10 || !agg.tl || agg.tl.n < 6) return null;
  const e = agg.tl;
  const signedVal = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`);
  const pctVal = (v: number | null | undefined) => (v == null ? "–" : `${fmtDec(v)}%`);

  const metrics: { label: string; value: string; sub?: string; pct: number; good?: boolean }[] = [
    {
      label: "GD@15",
      value: signedVal(e.gd15),
      sub: `@10 ${signedVal(e.gd10)} · @20 ${signedVal(e.gd20)}`,
      pct: e.gd15 == null ? 50 : Math.max(8, Math.min(96, ((e.gd15 + 1500) / 3000) * 100)),
      good: e.gd15 != null ? e.gd15 >= 0 : undefined,
    },
    {
      label: tl("Ahead at 15"),
      value: pctVal(e.lead15),
      sub: tl("Win {a} ahead · {b} behind", {
        a: winRate(e.ahead[1], e.ahead[0]),
        b: winRate(e.behind[1], e.behind[0]),
      }),
      pct: e.lead15 ?? 50,
      good: e.lead15 != null ? e.lead15 >= 50 : undefined,
    },
    {
      label: tl("First blood"),
      value: pctVal(e.fb),
      pct: e.fb ?? 50,
      good: e.fb != null ? e.fb >= 50 : undefined,
    },
    {
      label: tl("First tower"),
      value: pctVal(e.ft),
      pct: e.ft ?? 50,
      good: e.ft != null ? e.ft >= 50 : undefined,
    },
    {
      label: tl("First dragon"),
      value: pctVal(e.fd),
      pct: e.fd ?? 50,
      good: e.fd != null ? e.fd >= 50 : undefined,
    },
    {
      label: "CKPM",
      value: agg.ckpm == null ? "–" : fmtDec(agg.ckpm, 2),
      sub: agg.min != null ? tl("{n} min on average", { n: fmtDec(agg.min, 1) }) : tl("Kills per minute, both teams"),
      pct: agg.ckpm == null ? 50 : Math.max(10, Math.min(96, (agg.ckpm / 1.5) * 100)),
    },
  ];

  return (
    <Section
      title={`${tl("Playstyle")} · ${tl("Early game")}`}
      right={
        hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
            <span className="text-rw-muted font-mono">{periodLabel}</span>
            <HubLink to={{ kind: "team", slug: t.u, tab: "stats" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Stats")} · {tl("Open →")}
            </HubLink>
            <SectionCard
              section={tl("Playstyle")}
              name={t.name}
              sub={periodLabel}
              rows={() => [
                ...tags.map((x) => ({ label: x.tag, sub: x.why, win: x.good })),
                ...metrics.map((m) => ({ label: m.label, sub: m.sub, value: m.value, win: m.good })),
              ]}
            />
          </span>
        )
      }
      share={`${t.u}-playstyle`}
    >
      {hidden ? (
        <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
      ) : (
        <div className="space-y-2.5">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((x) => (
                <span
                  key={x.tag}
                  title={x.why}
                  className={`px-2.5 py-1 rounded-full border text-[11px] ${
                    x.good === true
                      ? "border-rw-teal/60 bg-rw-teal/10 text-rw-teal"
                      : x.good === false
                        ? "border-rw-red/60 bg-rw-red/10 text-rw-red"
                        : "border-rw-border bg-rw-bg/60 text-rw-sub"
                  }`}
                >
                  <span className="font-semibold">{x.tag}</span> <span className="text-rw-muted">· {x.why}</span>
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-lg border border-rw-border bg-rw-bg/50 px-2.5 py-2 flex flex-col justify-between gap-1.5">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted truncate">{m.label}</div>
                  <div
                    className={`mt-0.5 text-sm font-bold font-mono tabular-nums ${
                      m.good === true ? "text-rw-teal" : m.good === false ? "text-rw-red" : "text-rw-text"
                    }`}
                  >
                    {m.value}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-rw-raised overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        m.good === true ? "bg-rw-teal" : m.good === false ? "bg-rw-red/80" : "bg-rw-accent"
                      }`}
                      style={{ width: `${Math.round(m.pct)}%` }}
                    />
                  </div>
                  {m.sub && <div className="text-[10px] text-rw-muted truncate" title={m.sub}>{m.sub}</div>}
                </div>
              </div>
            ))}
          </div>
          {tags.length > 0 && (
            <p className="text-[10px] text-rw-muted">{tl("Compared with every pro team season since 2024: a label means the top or bottom fifth.")}</p>
          )}
        </div>
      )}
    </Section>
  );
};

const CopyTeamPost: React.FC<{ t: HubTeam }> = ({ t }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const lines: string[] = [
      `${t.name}${t.region ? ` (${regionName(t.region, t.region)})` : ""}`,
      `${tl("Games")}: ${t.w}–${t.g - t.w} (${winRate(t.w, t.g)}) · ${tl("Series")}: ${t.sw}–${t.sg - t.sw} (${winRate(t.sw, t.sg)})`,
    ];
    if (t.rating) {
      lines.push(`${tl("Power ranking")}: #${t.rating.rank ?? t.rating.lrank} (${t.rating.r})`);
    }
    if (t.titles.length > 0) {
      lines.push(`🏆 ${tl("Titles")}: ${t.titles.length}`);
    }
    if (t.roster[0]?.p.length) {
      lines.push(`${tl("Roster")} (${t.roster[0].y}): ${t.roster[0].p.slice(0, 5).map((p) => p.n).join(" · ")}`);
    }
    lines.push(`https://riftwise.gg/team/${t.u}`);
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <button type="button" onClick={copy} className={heroBtn()} title={tl("Copy post")}>
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};

const CopyTeamChampPost: React.FC<{
  team: HubTeam;
  champ: string;
  totalG: number;
  totalW: number;
  avgGd15: number | null;
  players: { n: string; r: string; g: number; w: number }[];
}> = ({ team, champ, totalG, totalW, avgGd15, players }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const lines: string[] = [
      `${team.name} · ${champName(champ)}`,
      `${tl("Games")}: ${totalW}–${totalG - totalW} (${winRate(totalW, totalG)})${avgGd15 != null ? ` · GD@15 ${avgGd15 > 0 ? "+" : ""}${avgGd15}` : ""}`,
    ];
    for (const pl of players.slice(0, 4)) {
      lines.push(`• ${pl.n}${pl.r ? ` (${roleName(pl.r)})` : ""}: ${pl.w}–${pl.g - pl.w} (${winRate(pl.w, pl.g)})`);
    }
    lines.push(`https://riftwise.gg/team/${team.u}/champions?champ=${encodeURIComponent(champ)}`);
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
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};



