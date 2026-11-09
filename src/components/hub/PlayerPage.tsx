/**
 * Player page, in tabs (each its own address, /player/faker/<tab>): Overview (career numbers, bio, titles, recent
 * games, bests), Stats (any period, league ranks), Champions (the pool), Matches (every game) and Career
 * (tournaments, teams, years).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Trophy, ExternalLink, Package } from "lucide-react";
import { tl, tk, tc, roleName, eventTitle, regionName, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubChamp, loadHubPlayer, loadPlayerGames, prettySlug } from "../../hub/data";
import { currentHubRoute, type HubRoute } from "../../hub/route";
import type { HubPlayer } from "../../hub/types";
import { type PeriodKey, inPeriod, periodOptions, playerAgg, playerRowRef } from "../../hub/period";
import { PageTabs, type PageTab } from "./PageTabs";
import { useDDragon } from "../../hub/ddragon";
import { PlayerChampGames, PlayerGamesArchive } from "./Archives";
import { PeriodPicker, PlayerPeriodStats, QuickPeriods } from "./PeriodStats";
import { BroadcastCardButton, SectionCard, playerCareerCardData } from "./BroadcastCard";
import { PlayerRanks } from "./Ranks";
import { OwnStorylines } from "./Storylines";
import { CountryFlag, countryCode, localCountry } from "./CountryFlag";
import { CaptureContext, card, ChampIcon, ChampLink, EventLink, fmtDate, fmtNum, HubLink, Page, PlayerLink, PlayerPhoto, ratingTextClass, RevealButton, Section, td, TeamLink, TeamLogo, th, useHidden, useHiddenCheck, useLoad, usePageTitle, PhotosLink } from "./ui";
import { EntityHero, heroBtn, heroLink } from "./EntityHero";
import { useTeamLogo } from "../../hub/riotCatalog";
import { KdaBar, PlayerOpponents, WinBar } from "./OpponentChart";
import { PlayerVisualOverview, SignatureChampsGrid } from "./VisualAnalytics";
import { STable } from "../STable";

const BEST_LABEL: Record<string, string> = {
  kills: tk("Most kills"),
  assists: tk("Most assists"),
  dmg: tk("Most damage"),
  cs: tk("Most CS"),
};

/** The tabs' names (the address says the key: /player/faker/champions) */
const TAB_LABEL: Record<string, string> = {
  "": tk("Overview"),
  stats: tk("Stats"),
  champions: tk("Champions"),
  matches: tk("Matches"),
  career: tk("Career"),
};

export const PlayerPage: React.FC<{
  slug: string;
  tab?: string;
  onOpenUrl: (url: string) => void;
}> = ({ slug, tab, onOpenUrl }) => {
  const state = useLoad(() => loadHubPlayer(slug), [slug]);
  usePageTitle(state.data ? (tab && TAB_LABEL[tab] ? `${state.data.name} · ${tl(TAB_LABEL[tab])}` : state.data.name) : undefined);
  useDDragon();
  return (
    <Page state={state}>
      {(p) => (
        <CaptureContext.Provider value={p.name}>
          <PlayerView p={p} tab={tab && TAB_LABEL[tab] ? tab : ""} onOpenUrl={onOpenUrl} />
        </CaptureContext.Provider>
      )}
    </Page>
  );
};

function age(born?: string): number | null {
  if (!born || !/^\d{4}-\d{2}-\d{2}$/.test(born)) return null;
  const b = new Date(`${born}T00:00:00Z`);
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (
    now.getUTCMonth() < b.getUTCMonth() ||
    (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())
  )
    a--;
  return a;
}

/** The club's logo in the corner of the photo (none when Riot has no logo for it). */
const ClubBadge: React.FC<{ name: string }> = ({ name }) => {
  const logo = useTeamLogo(name);
  if (!logo) return null;
  return (
    <span className="absolute -right-1 -bottom-0.5 w-[30px] h-[30px] md:w-9 md:h-9 rounded-full bg-rw-deep border-2 border-rw-accent/50 p-[3px] flex items-center justify-center">
      <TeamLogo name={name} sizeClass="w-full h-full" />
    </span>
  );
};

const PlayerView: React.FC<{
  p: HubPlayer;
  tab: string;
  onOpenUrl: (url: string) => void;
}> = ({ p, tab, onOpenUrl }) => {
  const overview = tab === "";
  const tabs: PageTab[] = [
    { key: "", label: TAB_LABEL[""] },
    { key: "stats", label: TAB_LABEL.stats },
    { key: "champions", label: TAB_LABEL.champions, count: p.nChamps },
    { key: "matches", label: TAB_LABEL.matches, count: p.g },
    { key: "career", label: TAB_LABEL.career, count: p.events.length },
  ];
  const to = (key: string): HubRoute => ({ kind: "player", slug: p.u, ...(key ? { tab: key } : {}) });
  const [allEvents, setAllEvents] = useState(false);
  const nowRoute = currentHubRoute();
  const routeQuery = nowRoute.kind === "player" && nowRoute.slug === p.u ? nowRoute.query : undefined;
  const urlParams = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
  const champParam = urlParams.get("champ");
  const [champPeriod, setChampPeriod] = useState<PeriodKey>(urlParams.get("p") || "all");
  // the Champions tab: a champion's every game, with the items of each (TV, 2026-10-28)
  const [gamesOn, setGamesOn] = useState<string | null>(() => {
    if (!champParam) return null;
    const hit = p.champs.find((c) => c.c.toLowerCase() === champParam.toLowerCase());
    return hit ? hit.c : champParam;
  });
  useEffect(() => {
    if (!champParam) return;
    const hit = p.champs.find((c) => c.c.toLowerCase() === champParam.toLowerCase());
    setGamesOn(hit ? hit.c : champParam);
  }, [champParam, p.champs]);
  const [recentHidden, revealRecent] = useHidden(
    `player-recent:${p.u}`,
    p.recent[0]?.date,
  );
  const yrs = age(p.bio.born);
  const pentas = p.pentas ? p.pentas.reduce((s, x) => s + x.x, 0) : 0;
  const links: [string, string][] = [];
  if (p.bio.twitter)
    links.push([
      "X / Twitter",
      p.bio.twitter.startsWith("http")
        ? p.bio.twitter
        : `https://x.com/${p.bio.twitter}`,
    ]);
  if (p.bio.stream) links.push([tl("Stream"), p.bio.stream]);
  if (p.bio.youtube) links.push(["YouTube", p.bio.youtube]);
  links.push([
    "Leaguepedia",
    `https://lol.fandom.com/wiki/${encodeURIComponent(p.page.replace(/ /g, "_"))}`,
  ]);
  const events = allEvents ? p.events : p.events.slice(0, 12);
  // the section cards leave out what spoiler mode hides
  const hiddenCheck = useHiddenCheck();
  const cardSub = [p.role ? roleName(p.role) : null, p.club].filter(Boolean).join(" · ") || undefined;
  return (
    <div>
      {/* who they are on every tab; their numbers, links and favourite champions on the Overview */}
      <EntityHero
        tabbed
        compact={!overview}
        media={
          <>
            <PlayerPhoto
              name={p.name}
              team={p.club}
              slug={p.u}
              img={p.img}
              sizeClass={overview ? "w-[84px] h-[84px] md:w-[116px] md:h-[116px]" : "w-12 h-12 sm:w-14 sm:h-14"}
              className={overview ? "!border-[3px] !border-rw-accent/50 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" : ""}
            />
            {overview && p.club && <ClubBadge name={p.club} />}
          </>
        }
        title={
          <>
            {p.name}
            {p.bio.native && <span className="text-rw-sub text-[0.5em] font-semibold ml-2 align-middle">{p.bio.native}</span>}
          </>
        }
        lines={
          <>
            <p>
              {(
                [
                  roleName(p.role),
                  p.bio.real,
                  localCountry(p.bio.country, p.bio.cc) ? (
                    <span key="cc" className="inline-flex items-center gap-1">
                      {countryCode(p.bio.country, p.bio.cc) && <CountryFlag cc={countryCode(p.bio.country, p.bio.cc)} />}
                      {localCountry(p.bio.country, p.bio.cc)}
                    </span>
                  ) : null,
                  yrs != null ? tl("{n} years old", { n: yrs }) : null,
                  p.bio.retired ? tl("Retired") : null,
                ] as React.ReactNode[]
              )
                .filter(Boolean)
                .map((item, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && " · "}
                    {item}
                  </React.Fragment>
                ))}
            </p>
            {p.club && (
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <TeamLogo name={p.club} size={15} />
                <TeamLink name={p.club} u={p.clubU} className="font-semibold text-rw-text hover:text-rw-accent hover:underline" />{" "}
                <span>{tl("(last game {date})", { date: fmtDate(p.clubTo) })}</span>
                {p.bio.contract && <span>· {tl("Contract until {date}", { date: fmtDate(p.bio.contract) })}</span>}
                {p.bio.res && <span>· {tl("Residency: {region}", { region: regionName(p.bio.res, p.bio.res) })}</span>}
              </p>
            )}
          </>
        }
        extra={
          overview && p.bio.fav && p.bio.fav.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-head text-[12px] font-bold uppercase tracking-[0.12em] text-rw-muted mr-1">
                {tl("Favorite champions:").replace(/\s*[:：]\s*$/, "")}
              </span>
              {p.bio.fav.map((c) => (
                <ChampLink key={c} name={c} size={34} showName={false} />
              ))}
            </div>
          ) : undefined
        }
        foot={
          overview ? (
            <>
              {p.bio.soloq && p.bio.soloq.length > 0 && (
                <p>
                  {tl("Solo queue:")} {p.bio.soloq.join(" · ")}
                </p>
              )}
              <p>{tl("All-Star and show matches aren't counted.")}</p>
            </>
          ) : undefined
        }
        aside={
          <>
            {overview && (
              <div className="flex flex-wrap gap-2 md:justify-end">
                <HubLink to={{ kind: "compare", mode: "player", a: p.u }} className={heroBtn(true)}>
                  {tl("Compare")}
                </HubLink>
                <BroadcastCardButton hero data={() => playerCareerCardData(p)} name={`${p.name}-career`} label={tl("Overview card")} />
                <CopyPlayerPost p={p} />
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 md:justify-end">
              {!overview && (
                <HubLink to={{ kind: "compare", mode: "player", a: p.u }} className={heroLink}>
                  {tl("Compare")}
                </HubLink>
              )}
              {overview &&
                links.map(([label, url]) => (
                  <button key={label} type="button" onClick={() => onOpenUrl(url)} className={heroLink}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              <PhotosLink q={p.name} className={heroLink} />
              <HubLink to={{ kind: "items", query: `player=${p.u}` }} className={heroLink}>
                <Package className="w-3.5 h-3.5" />
                {tl("Item history")}
              </HubLink>
              <HubLink to={{ kind: "finder", query: `player=${encodeURIComponent(p.name)}` }} className={heroLink}>
                {tl("Game finder")}
              </HubLink>
            </div>
          </>
        }
        stats={
          overview
            ? [
                {
                  label: tl("Games"),
                  value: `${fmtNum(p.w)}–${fmtNum(p.g - p.w)}`,
                  sub: tl("{pct} win rate", { pct: winRate(p.w, p.g) }),
                  bar: p.g > 0 ? { split: [p.w, p.g - p.w] } : undefined,
                },
                {
                  label: tl("KDA"),
                  value: fmtN(p.kda),
                  sub: `${fmtNum(p.k)} / ${fmtNum(p.d)} / ${fmtNum(p.a)}`,
                  bar: p.kda > 0 ? { pct: Math.min(100, Math.round((p.kda / 6) * 100)), tone: p.kda >= 4 ? "teal" : p.kda < 2.5 ? "red" : "accent" } : undefined,
                },
                {
                  label: tl("Titles"),
                  value: p.titles.length,
                  sub: `${tl("{n} Worlds", { n: p.titles.filter((x) => x.kind === "Worlds").length })} · ${tl("{n} MSI", { n: p.titles.filter((x) => x.kind === "MSI").length })}`,
                },
                { label: tl("Champions"), value: p.nChamps, sub: p.champs[0] ? tl("most: {champion}", { champion: champName(p.champs[0].c) }) : undefined },
                p.csm != null || p.gpm != null
                  ? {
                      label: [p.csm != null ? tl("CS / min") : null, p.gpm != null ? tl("Gold / min") : null].filter(Boolean).join(" · "),
                      value: [p.csm != null ? fmtN(p.csm) : null, p.gpm != null ? fmtNum(p.gpm) : null].filter(Boolean).join(" · "),
                      sub: p.dpm != null ? `${tl("Damage / min")} ${fmtNum(p.dpm)}` : undefined,
                    }
                  : null,
                p.mvp
                  ? {
                      label: tl("Player of the Game"),
                      value: fmtNum(p.mvp),
                      sub: pentas ? `${tl("Pentakills")} ${pentas}` : tl("awards (where recorded)"),
                    }
                  : pentas
                    ? { label: tl("Pentakills"), value: pentas, sub: tl("fully recorded from 2018") }
                    : null,
              ]
            : undefined
        }
      />
      <PageTabs tabs={tabs} active={tab} to={to} attached />
      <div className="rw-page mt-3">
      {tab === "stats" && (
        <div className="rw-span space-y-3">
          <PlayerPeriodStats
            slug={p.u}
            has2y={!!p.g2y}
            preferAll={!!p.bio.retired || (p.clubTo ? p.clubTo.slice(0, 4) < String(new Date().getFullYear() - 1) : false)}
            who={{ name: p.name, role: p.role ? roleName(p.role) : undefined, club: p.club }}
          />
          <PlayerRanks slug={p.u} name={p.name} events={p.events} has2y={!!p.g2y} />
        </div>
      )}

      {tab === "career" && p.events.length > 0 && (
        <div className="rw-span">
        <Section
          title={tl("Tournaments")}
          right={
            <span className="flex items-center gap-2">
              {p.events.length > 12 && (
                <button
                  type="button"
                  onClick={() => setAllEvents((v) => !v)}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {allEvents
                    ? tl("Show fewer")
                    : tl("Show all {n}", { n: p.events.length })}
                </button>
              )}
              <SectionCard
                section={tl("Tournaments")}
                name={p.name}
                sub={cardSub}
                rows={() =>
                  p.events
                    .filter((x) => !hiddenCheck(`player-event:${x.e}`, x.date))
                    .map((x) => ({ label: x.en, sub: `${x.t} · ${x.w}-${x.g - x.w} · KDA ${fmtN(x.kda)}`, value: x.pl ? tl("Place {p}", { p: x.pl }) : undefined }))
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
                  <th className={th}>{tl("Team")}</th>
                  <th className={th}>{tl("Place")}</th>
                  <th className={th}>{tl("Games")}</th>
                  <th className={th}>{tl("KDA")}</th>
                  <th className={th}>{tl("CS / min")}</th>
                  <th className={th}>{tl("Champions")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((x) => (
                  <PlayerEventRow key={x.e} x={x} />
                ))}
              </tbody>
            </STable>
          </div>
        </Section>
        </div>
      )}

      {tab === "career" && (
      <div className="rw-span grid gap-3 md:grid-cols-2 items-start">
        <CareerTimeline p={p} cardSub={cardSub} />
        <Section
          title={tl("By year")}
          right={
            <SectionCard
              section={tl("By year")}
              name={p.name}
              sub={cardSub}
              rows={() => [...p.years].reverse().map((y) => ({ label: y.y, sub: `${y.team} · ${y.w}-${y.g - y.w}`, value: `KDA ${fmtN(y.kda)}` }))}
            />
          }
        >
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Year")}</th>
                <th className={th}>{tl("Team")}</th>
                <th className={th}>{tl("Record")}</th>
                <th className={th}>{tl("KDA")}</th>
              </tr>
            </thead>
            <tbody>
              {p.years.map((y) => (
                <tr key={y.y} className="border-t border-rw-border hover:bg-rw-raised/50">
                  <td className={`${td} text-rw-text`} data-sort={y.y}>
                    <HubLink to={{ kind: "player", slug: p.u, tab: "stats", query: `p=y${y.y}` }} className="hover:text-rw-accent hover:underline font-medium">
                      {y.y}
                    </HubLink>
                  </td>
                  <td className={`${td} text-rw-sub max-w-[9rem]`}>
                    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                      <TeamLogo name={y.team} size={15} />
                      <TeamLink name={y.team} u={p.teams.find((t) => t.n === y.team)?.u} className="truncate" />
                    </span>
                  </td>
                  <td className={`${td} text-rw-sub`} data-sort={y.g ? y.w / y.g : 0}>
                    <HubLink to={{ kind: "player", slug: p.u, tab: "stats", query: `p=y${y.y}` }} className="hover:text-rw-accent hover:underline">
                      <WinBar w={y.w} g={y.g} showRecord />
                    </HubLink>
                  </td>
                  <td className={`${td} text-rw-sub`} data-sort={y.kda}>
                    <KdaBar kda={y.kda} />
                  </td>
                </tr>
              ))}
            </tbody>
          </STable>
        </Section>
      </div>
      )}

      {tab === "champions" && gamesOn && (
        <PlayerChampGames
          slug={p.u}
          champ={gamesOn}
          year={/^y\d{4}$/.test(champPeriod) ? champPeriod.slice(1) : "all"}
          onClose={() => setGamesOn(null)}
        />
      )}

      {tab === "champions" && (
        <PlayerChampionsTab
          p={p}
          period={champPeriod}
          onPeriodChange={setChampPeriod}
          gamesOn={gamesOn}
          onSelectChamp={(c) => {
            setGamesOn(c);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {/* the Overview leads with how the player is doing now (TV, 2026-10-28: pages in the order people want them):
          recent games and career bests, then storylines, titles and pentakills */}
      {overview && (
      <div className="rw-span grid gap-3 md:grid-cols-2 items-start">
        <Section
          title={tl("Recent games")}
          right={
            recentHidden ? (
              <RevealButton onReveal={revealRecent} small />
            ) : (
              <SectionCard
                section={tl("Recent games")}
                name={p.name}
                sub={cardSub}
                rows={() => p.recent.map((r) => ({ win: !!r.win, champ: r.c, label: `${r.k}/${r.d}/${r.a} vs ${r.opp}`, sub: r.en, value: fmtDate(r.date, false) }))}
              />
            )
          }
        >
          {recentHidden ? (
            <p className="text-[11px] text-rw-muted italic">
              {tl("Hidden while spoiler mode is on.")}
            </p>
          ) : (
            <ul className="text-xs space-y-1.5">
              {p.recent.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 min-w-0"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {r.g ? (
                      <HubLink
                        to={{ kind: "match", slug: r.g, game: r.gn }}
                        className={`w-3.5 shrink-0 font-bold hover:underline ${r.win ? "text-rw-teal" : "text-rw-red"}`}
                      >
                        {r.win
                          ? tc("short result", "W")
                          : tc("short result", "L")}
                      </HubLink>
                    ) : (
                      <span
                        className={`w-3.5 shrink-0 font-bold ${r.win ? "text-rw-teal" : "text-rw-red"}`}
                      >
                        {r.win
                          ? tc("short result", "W")
                          : tc("short result", "L")}
                      </span>
                    )}
                    <HubLink
                      to={{ kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(r.c)}` }}
                      className="shrink-0"
                      title={tl("Every game")}
                    >
                      <ChampIcon name={r.c} size={18} />
                    </HubLink>
                    <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                      {r.g ? (
                        <HubLink
                          to={{ kind: "match", slug: r.g, game: r.gn }}
                          className="text-rw-text hover:text-rw-accent hover:underline tabular-nums shrink-0"
                        >
                          {r.k}/{r.d}/{r.a}
                        </HubLink>
                      ) : (
                        <span className="text-rw-text tabular-nums shrink-0">
                          {r.k}/{r.d}/{r.a}
                        </span>
                      )}
                      <span className="text-rw-muted shrink-0">vs</span>
                      <TeamLogo name={r.opp} size={15} />
                      <TeamLink name={r.opp} className="text-rw-sub hover:text-rw-accent hover:underline truncate" />
                      {r.en && (
                        <span className="text-rw-muted truncate">
                          · <EventLink name={r.en} u={p.events.find((ev) => ev.en === r.en)?.e} className="text-rw-muted hover:text-rw-accent hover:underline" />
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-rw-muted shrink-0 flex items-center gap-2">
                    {r.r != null && (
                      <span className={`tabular-nums font-semibold ${ratingTextClass(r.r)}`} title={tl("Game rating")}>
                        {r.r.toFixed(0)}
                      </span>
                    )}
                    {fmtDate(r.date, false)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section
          title={tl("Career bests")}
          right={
            <SectionCard
              section={tl("Career bests")}
              name={p.name}
              sub={cardSub}
              rows={() => Object.entries(p.best).map(([k, b]) => ({ champ: b.c, label: BEST_LABEL[k] ? tl(BEST_LABEL[k]) : k, sub: `${champName(b.c)} vs ${b.opp}, ${b.date.slice(0, 4)}`, value: fmtNum(b.v) }))}
            />
          }
        >
          <ul className="text-xs space-y-1">
            {Object.entries(p.best).map(([k, b]) => (
              <li key={k} className="flex justify-between gap-2 min-w-0">
                <span className="text-rw-sub shrink-0">
                  {BEST_LABEL[k] ? tl(BEST_LABEL[k]) : k}
                </span>
                <span className="text-rw-text text-right truncate min-w-0 inline-flex items-center gap-1 justify-end">
                  {b.g ? (
                    <HubLink
                      to={{ kind: "match", slug: b.g, game: b.gn }}
                      className="font-semibold text-rw-accent hover:underline"
                    >
                      {fmtNum(b.v)}
                    </HubLink>
                  ) : (
                    <span className="font-semibold text-rw-accent">{fmtNum(b.v)}</span>
                  )}
                  <span className="text-rw-muted inline-flex items-center gap-1 truncate">
                    (
                    <HubLink
                      to={{ kind: "champ", slug: prettySlug(b.c) }}
                      className="inline-flex items-center gap-1 text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      <ChampIcon name={b.c} size={14} />
                      <span>{champName(b.c)}</span>
                    </HubLink>
                    <span>vs</span>
                    <TeamLogo name={b.opp} size={13} />
                    <TeamLink name={b.opp} className="text-rw-muted hover:text-rw-accent hover:underline truncate" />
                    , {b.date.slice(0, 4)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      )}

      {overview && <PlayerVisualOverview p={p} cardSub={cardSub} />}

      {overview && <SignatureChampsGrid p={p} cardSub={cardSub} />}

      {overview && (
        <div className="rw-span">
          <PlayerOpponents slug={p.u} name={p.name} has2y={!!p.g2y} cardSub={cardSub} />
        </div>
      )}

      {overview && <OwnStorylines notes={p.notes} spoilerKey={`notes:player:${p.u}`} share={`${p.u}-storylines`} />}

      {overview && (
        <div className="rw-span grid gap-3 md:grid-cols-2 items-start">
          <CareerTimeline p={p} cardSub={cardSub} />
          <SimilarPlayers p={p} cardSub={cardSub} />
        </div>
      )}

      {overview && p.titles.length > 0 && (
        <Section
          title={tl("Titles")}
          right={<SectionCard section={tl("Titles")} name={p.name} sub={tl("{n} titles", { n: p.titles.length })} rows={() => p.titles.map((x) => ({ label: eventTitle(x.t), value: x.date.slice(0, 4) }))} />}
        >
          <ul className="text-xs space-y-1">
            {p.titles.map((x) => (
              <li key={x.t + x.date} className="flex justify-between gap-2">
                <span className="text-rw-text truncate min-w-0">
                  <Trophy
                    className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-rw-accent" : "text-rw-muted"}`}
                  />
                  <EventLink name={eventTitle(x.t)} u={x.e} />
                </span>
                <span className="text-rw-muted shrink-0">
                  {fmtDate(x.date)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {overview && p.pentas && p.pentas.length > 0 && (
        <Section
          title={tl("Pentakills")}
          right={<SectionCard section={tl("Pentakills")} name={p.name} sub={cardSub} rows={() => p.pentas!.map((x) => ({ champ: x.c, label: x.x > 1 ? `${champName(x.c)} ×${x.x}` : champName(x.c), sub: x.en, value: x.date.slice(0, 4) }))} />}
        >
          <ul className="text-xs space-y-1">
            {p.pentas.map((x, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 min-w-0"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <HubLink to={{ kind: "champ", slug: prettySlug(x.c) }} className="shrink-0">
                    <ChampIcon name={x.c} size={18} />
                  </HubLink>
                  <span className="truncate">
                    <HubLink to={{ kind: "champ", slug: prettySlug(x.c) }} className="hover:text-rw-accent hover:underline">
                      {champName(x.c)}
                    </HubLink>
                    {x.x > 1 && <span className="text-rw-accent"> ×{x.x}</span>}
                    <span className="text-rw-muted">
                      {" · "}
                      <EventLink name={x.en} u={p.events.find((ev) => ev.en === x.en)?.e} className="text-rw-muted hover:text-rw-accent hover:underline" />
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                  {fmtDate(x.date)}
                  {x.g && (
                    <HubLink
                      to={{ kind: "match", slug: x.g, game: x.gn }}
                      className="text-rw-accent hover:underline"
                    >
                      {tl("Details")}
                    </HubLink>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tab === "matches" && (
        <div className="rw-span">
          <PlayerGamesArchive slug={p.u} />
        </div>
      )}
      </div>
    </div>
  );
};

const PlayerChampionsTab: React.FC<{
  p: HubPlayer;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  gamesOn: string | null;
  onSelectChamp: (c: string) => void;
}> = ({ p, period, onPeriodChange: setPeriod, gamesOn, onSelectChamp }) => {
  const log = useLoad(() => loadPlayerGames(p.u), [p.u]);
  const options = useMemo(() => (log.data ? periodOptions(log.data.map(playerRowRef)) : []), [log.data]);
  const agg = useMemo(() => {
    if (!log.data || period === "all") return null;
    const rows = inPeriod(log.data, period, playerRowRef);
    return playerAgg(rows);
  }, [log.data, period]);
  const champs = agg ? agg.champs : p.champs;
  const maxChampG = Math.max(1, ...champs.map((c) => c.g));
  return (
    <div className={`${gamesOn ? "" : "rw-span "}space-y-3`}>
      {options.length > 0 && (
        <div className={`${card} !py-2 flex flex-wrap items-center justify-between gap-2 text-xs`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-rw-sub font-semibold">{tl("Stats for")}</span>
            <QuickPeriods options={options} value={period} onChange={setPeriod} />
          </div>
          <PeriodPicker options={options} value={period} onChange={setPeriod} />
        </div>
      )}
      <Section
        title={tl("Champion pool")}
        right={
          <SectionCard
            section={tl("Champion pool")}
            name={p.name}
            sub={tl("{n} champions played", { n: champs.length })}
            rows={() => champs.map((c) => ({ champ: c.c, label: champName(c.c), sub: tl("{g} games · {wr}", { g: c.g, wr: winRate(c.w, c.g) }), value: `KDA ${fmtN(c.kda)}` }))}
          />
        }
      >
        <div className="overflow-x-auto">
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Champion")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
                <th className={th}>{tl("KDA")}</th>
                <th className={th}>K / D / A</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {champs.map((c) => (
                <tr key={c.c} className={`border-t border-rw-border ${gamesOn === c.c ? "bg-rw-accent/10" : ""}`}>
                  <td className={`${td} max-w-[10rem]`}>
                    <ChampLink name={c.c} size={18} />
                  </td>
                  <td className={`${td} text-rw-sub`} data-sort={c.g}>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                        <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((c.g / maxChampG) * 100))}%` }} />
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectChamp(c.c)}
                        className="hover:text-rw-accent hover:underline"
                        title={tl("Every game")}
                      >
                        {c.g}
                      </button>
                    </span>
                  </td>
                  <td className={`${td} text-rw-sub`} data-sort={c.g ? c.w / c.g : 0}>
                    <WinBar w={c.w} g={c.g} />
                  </td>
                  <td className={`${td} text-rw-sub`} data-sort={c.kda}>
                    <KdaBar kda={c.kda} />
                  </td>
                  <td className={`${td} text-rw-muted`} data-sort={c.k}>
                    {c.k} / {c.d} / {c.a}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => onSelectChamp(c.c)}
                      className="text-rw-accent hover:underline"
                    >
                      {tl("Every game")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </STable>
        </div>
      </Section>
    </div>
  );
};

const PlayerEventRow: React.FC<{ x: HubPlayer["events"][number] }> = ({
  x,
}) => {
  const [hidden, reveal] = useHidden(`player-event:${x.e}`, x.date);
  return (
    <tr className="border-t border-rw-border">
      <td className={`${td} max-w-[13rem] truncate`}>
        <EventLink name={x.en} u={x.e} />
      </td>
      <td className={`${td} max-w-[9rem]`}>
        <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
          <TeamLogo name={x.t} size={14} />
          <TeamLink name={x.t} u={x.tu} className="truncate" />
        </span>
      </td>
      <td
        className={`${td} ${x.pl === "1" ? "text-rw-accent font-bold" : "text-rw-sub"}`}
        data-sort={hidden ? 999 : parseInt(x.pl || "999", 10) || 999}
      >
        {hidden ? <RevealButton onReveal={reveal} small /> : x.pl || "–"}
      </td>
      <td className={`${td} text-rw-sub`} data-sort={hidden ? x.g : x.g ? x.w / x.g : 0}>
        {hidden ? x.g : <WinBar w={x.w} g={x.g} showRecord />}
      </td>
      <td className={`${td} text-rw-sub`} data-sort={x.kda}>
        <KdaBar kda={x.kda} />
      </td>
      <td className={`${td} text-rw-sub`} data-sort={x.csm ?? -1}>{x.csm ?? "–"}</td>
      <td className={td}>
        <span className="flex gap-0.5">
          {x.c.map((c) => (
            <HubLink key={c} to={{ kind: "champ", slug: prettySlug(c) }}>
              <ChampIcon name={c} size={16} />
            </HubLink>
          ))}
        </span>
      </td>
    </tr>
  );
};

/** Visual career stint & transfer timeline: team logos, year spans, win-rate bars, titles won during each stint, and 1-click era stats. */
const CareerTimeline: React.FC<{ p: HubPlayer; cardSub?: string }> = ({ p, cardSub }) => {
  if (!p.teams.length) return null;
  const maxG = Math.max(1, ...p.teams.map((t) => t.g));
  return (
    <Section
      title={tl("Teams")}
      right={
        <SectionCard
          section={tl("Teams")}
          name={p.name}
          sub={cardSub}
          rows={() =>
            p.teams.map((x) => {
              const fy = x.from.slice(0, 4);
              const ty = x.to.slice(0, 4);
              return { label: x.n, sub: fy === ty ? fy : `${fy}–${ty}`, value: `${x.w}-${x.g - x.w} (${winRate(x.w, x.g)})` };
            })
          }
        />
      }
    >
      <ol className="relative border-l-2 border-rw-border ml-2.5 pl-4 space-y-2.5 text-xs">
        {p.teams.map((t, idx) => {
          const isCurrent = idx === 0 && !p.bio.retired && t.n === p.club;
          const fy = t.from.slice(0, 4);
          const ty = t.to.slice(0, 4);
          const yrLabel = fy === ty ? fy : `${fy}–${ty}`;
          const stintTitles = p.titles.filter((ti) => ti.date >= t.from && ti.date <= t.to);
          const wrPct = t.g > 0 ? Math.round((t.w / t.g) * 100) : 0;
          return (
            <li key={`${t.n}-${t.from}`} className="relative min-w-0">
              <span
                className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                  isCurrent ? "bg-rw-accent border-rw-accent shadow-[0_0_8px_var(--rw-accent)]" : "bg-rw-bg border-rw-sub"
                }`}
                aria-hidden="true"
              />
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <TeamLogo name={t.n} size={20} />
                  <TeamLink name={t.n} u={t.u} className="font-semibold text-rw-text hover:text-rw-accent truncate" />
                  <span className="text-[11px] text-rw-muted tabular-nums shrink-0">{yrLabel}</span>
                </span>
                <HubLink
                  to={{ kind: "player", slug: p.u, tab: "stats", query: `p=y${ty}` }}
                  className="text-[11px] font-mono tabular-nums text-rw-sub hover:text-rw-accent hover:underline shrink-0"
                  title={`${tl("Stats for")} ${ty}`}
                >
                  {t.w}–{t.g - t.w} ({wrPct}%)
                </HubLink>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-rw-bg rounded overflow-hidden flex" title={`${t.w}W – ${t.g - t.w}L`}>
                  <div className="bg-rw-teal/75" style={{ width: `${(t.w / maxG) * 100}%` }} />
                  <div className="bg-rw-red/50" style={{ width: `${((t.g - t.w) / maxG) * 100}%` }} />
                </div>
                {stintTitles.length > 0 && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-rw-accent shrink-0"
                    title={stintTitles.map((x) => `${eventTitle(x.t)} (${x.date.slice(0, 4)})`).join(" · ")}
                  >
                    <Trophy className="w-3 h-3" />
                    {stintTitles.length}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
};

interface PeerMatch {
  peer: HubPlayer;
  sim: number;
  shared: string[];
}

/** Playstyle & champion-pool nearest neighbors in the same role, with 1-click Player Compare links. */
const SimilarPlayers: React.FC<{ p: HubPlayer; cardSub?: string }> = ({ p, cardSub }) => {
  const [peers, setPeers] = useState<PeerMatch[] | null>(null);
  useEffect(() => {
    setPeers(null);
    const sig = p.champs.slice(0, 4);
    if (!sig.length) return;
    let alive = true;
    Promise.all(sig.map((c) => loadHubChamp(prettySlug(c.c)).catch(() => null)))
      .then(async (champFiles) => {
        if (!alive) return;
        const candScore = new Map<string, number>();
        for (let i = 0; i < champFiles.length; i++) {
          const cf = champFiles[i];
          if (!cf) continue;
          const weight = 4 - i;
          for (const pl of [...(cf.players12 || []), ...cf.players]) {
            if (!pl.u || pl.u === p.u) continue;
            candScore.set(pl.u, (candScore.get(pl.u) || 0) + weight * Math.min(pl.g, 40));
          }
        }
        const topSlugs = [...candScore.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([u]) => u);
        const loaded = (await Promise.all(topSlugs.map((u) => loadHubPlayer(u).catch(() => null)))).filter(
          (x): x is HubPlayer => !!x && x.u !== p.u,
        );
        if (!alive) return;
        const sameRole = loaded.filter((x) => !p.role || !x.role || x.role === p.role);
        const pool = sameRole.length >= 3 ? sameRole : loaded;
        const myMap = new Map(p.champs.slice(0, 12).map((c) => [c.c, c.g / Math.max(p.g, 1)]));
        const myNorm = Math.sqrt([...myMap.values()].reduce((s, v) => s + v * v, 0)) || 1;
        const scored: PeerMatch[] = pool.map((peer) => {
          const theirMap = new Map(peer.champs.slice(0, 12).map((c) => [c.c, c.g / Math.max(peer.g, 1)]));
          const theirNorm = Math.sqrt([...theirMap.values()].reduce((s, v) => s + v * v, 0)) || 1;
          let dot = 0;
          const shared: string[] = [];
          for (const [c, v] of myMap) {
            const tv = theirMap.get(c);
            if (tv != null) {
              dot += v * tv;
              shared.push(c);
            }
          }
          const poolSim = dot / (myNorm * theirNorm);
          // Stat similarity across KDA, Win%, CSM, DPM
          const wrDiff = Math.abs(p.w / Math.max(p.g, 1) - peer.w / Math.max(peer.g, 1));
          const kdaDiff = Math.abs((p.kda || 3) - (peer.kda || 3)) / 5;
          const csmDiff = p.csm != null && peer.csm != null ? Math.abs(p.csm - peer.csm) / 4 : 0.1;
          const dpmDiff = p.dpm != null && peer.dpm != null ? Math.abs(p.dpm - peer.dpm) / 300 : 0.1;
          const statSim = Math.max(0, 1 - (wrDiff + kdaDiff + csmDiff + dpmDiff) / 4);
          const sim = Math.min(99, Math.round((poolSim * 0.55 + statSim * 0.45) * 100));
          return { peer, sim, shared: shared.slice(0, 4) };
        });
        scored.sort((a, b) => b.sim - a.sim);
        if (alive) setPeers(scored.slice(0, 5));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [p]);

  if (!peers || !peers.length) return null;
  return (
    <Section
      title={`${tl("Compare")} · ${p.role ? roleName(p.role) : tl("Players")}`}
      right={
        <SectionCard
          section={`${tl("Compare")} · ${p.role ? roleName(p.role) : tl("Players")}`}
          name={p.name}
          sub={cardSub}
          rows={() =>
            peers.map(({ peer, shared }) => ({
              label: peer.name,
              sub: [peer.club, shared.slice(0, 3).map(champName).join(", ")].filter(Boolean).join(" · "),
              value: `KDA ${fmtN(peer.kda)} · ${winRate(peer.w, peer.g)}`,
            }))
          }
        />
      }
    >
      <ul className="space-y-2 text-xs">
        {peers.map(({ peer, sim, shared }) => (
          <li key={peer.u} className="flex items-center justify-between gap-2 min-w-0">
            <span className="flex items-center gap-2 min-w-0">
              <PlayerPhoto name={peer.name} team={peer.club} slug={peer.u} img={peer.img} size={26} />
              <span className="min-w-0 truncate">
                <PlayerLink name={peer.name} u={peer.u} />
                {peer.club && (
                  <span className="text-rw-muted text-[11px] inline-flex items-center gap-1 ml-1">
                    · <TeamLogo name={peer.club} size={12} />
                    <TeamLink name={peer.club} u={peer.clubU} className="text-rw-muted hover:text-rw-accent hover:underline" />
                  </span>
                )}
                <span className="block text-[10px] text-rw-sub tabular-nums">
                  {winRate(peer.w, peer.g)} · KDA {fmtN(peer.kda)}
                  {peer.dpm != null ? ` · ${fmtNum(peer.dpm)} DPM` : ""}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-rw-sub tabular-nums" title={`${sim}%`}>
                <span className="w-7 h-1.5 rounded-full bg-rw-bg overflow-hidden shrink-0">
                  <span className="block h-full rounded-full bg-rw-accent/75" style={{ width: `${sim}%` }} />
                </span>
                <span>{sim}%</span>
              </span>
              <span className="flex gap-0.5" title={shared.map(champName).join(", ")}>
                {shared.slice(0, 3).map((c) => (
                  <HubLink key={c} to={{ kind: "champ", slug: prettySlug(c) }}>
                    <ChampIcon name={c} size={18} />
                  </HubLink>
                ))}
              </span>
              <HubLink
                to={{ kind: "compare", mode: "player", a: p.u, b: peer.u }}
                className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
              >
                {tl("Compare")}
              </HubLink>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
};

const CopyPlayerPost: React.FC<{ p: HubPlayer }> = ({ p }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const sub = [p.role ? roleName(p.role) : null, p.club].filter(Boolean).join(" · ");
    const lines: string[] = [
      `${p.name}${sub ? ` (${sub})` : ""}`,
      `${tl("Games")}: ${p.w}–${p.g - p.w} (${winRate(p.w, p.g)}) · KDA ${fmtN(p.kda)}`,
    ];
    if (p.titles.length > 0) {
      lines.push(`🏆 ${tl("Titles")}: ${p.titles.length}`);
    }
    if (p.champs.length > 0) {
      lines.push(
        `${tl("Champions")}: ${p.champs
          .slice(0, 4)
          .map((c) => `${champName(c.c)} (${c.g})`)
          .join(", ")}`,
      );
    }
    lines.push(`https://riftwise.gg/player/${p.u}`);
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

