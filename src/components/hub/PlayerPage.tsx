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
import { loadHubPlayer, loadPlayerGames } from "../../hub/data";
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
import { localCountry } from "./CountryFlag";
import { CaptureContext, card, ChampIcon, ChampLink, EventLink, fmtDate, fmtNum, HubLink, Page, PlayerPhoto, RevealButton, Section, td, TeamLink, TeamLogo, th, useHidden, useHiddenCheck, useLoad, usePageTitle, PhotosLink } from "./ui";
import { EntityHero, heroBtn, heroLink } from "./EntityHero";
import { useTeamLogo } from "../../hub/riotCatalog";
import { ratingTextClass } from "./BestPage";
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
              {[
                roleName(p.role),
                p.bio.real,
                localCountry(p.bio.country, p.bio.cc),
                yrs != null ? tl("{n} years old", { n: yrs }) : null,
                p.bio.retired ? tl("Retired") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {p.club && (
              <p>
                <TeamLink name={p.club} u={p.clubU} className="font-semibold text-rw-text hover:text-rw-accent hover:underline" />{" "}
                {tl("(last game {date})", { date: fmtDate(p.clubTo) })}
                {p.bio.contract && <> · {tl("Contract until {date}", { date: fmtDate(p.bio.contract) })}</>}
                {p.bio.res && <> · {tl("Residency: {region}", { region: regionName(p.bio.res, p.bio.res) })}</>}
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
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 md:justify-end">
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
            </div>
          </>
        }
        stats={
          overview
            ? [
                { label: tl("Games"), value: `${fmtNum(p.w)}–${fmtNum(p.g - p.w)}`, sub: tl("{pct} win rate", { pct: winRate(p.w, p.g) }) },
                { label: tl("KDA"), value: fmtN(p.kda), sub: `${fmtNum(p.k)} / ${fmtNum(p.d)} / ${fmtNum(p.a)}` },
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
          <PlayerRanks slug={p.u} events={p.events} has2y={!!p.g2y} />
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
                  className="text-[11px] text-rw-teal hover:underline"
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
        <Section
          title={tl("Teams")}
          right={<SectionCard section={tl("Teams")} name={p.name} sub={cardSub} rows={() => p.teams.map((x) => ({ label: x.n, sub: `${x.from.slice(0, 4)}–${x.to.slice(0, 4)}`, value: `${x.w}-${x.g - x.w}` }))} />}
        >
          <ul className="text-xs space-y-1">
            {p.teams.map((t) => (
              <li key={t.n} className="flex justify-between gap-2 min-w-0">
                <span className="truncate min-w-0">
                  <TeamLink name={t.n} u={t.u} />
                </span>
                <HubLink
                  to={{ kind: "player", slug: p.u, tab: "stats", query: `p=y${t.to.slice(0, 4)}` }}
                  className="text-rw-muted hover:text-rw-teal hover:underline shrink-0"
                  title={`${tl("Stats for")} ${t.to.slice(0, 4)}`}
                >
                  {t.from.slice(0, 4)}–{t.to.slice(0, 4)} · {t.w}-{t.g - t.w}
                </HubLink>
              </li>
            ))}
          </ul>
        </Section>
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
                  <td className={`${td} text-rw-text`}>
                    <HubLink to={{ kind: "player", slug: p.u, tab: "stats", query: `p=y${y.y}` }} className="hover:text-rw-teal hover:underline font-medium">
                      {y.y}
                    </HubLink>
                  </td>
                  <td className={`${td} text-rw-sub max-w-[9rem] truncate`}>
                    {y.team}
                  </td>
                  <td className={`${td} text-rw-sub`}>
                    <HubLink to={{ kind: "player", slug: p.u, tab: "stats", query: `p=y${y.y}` }} className="hover:text-rw-teal hover:underline">
                      {y.w}-{y.g - y.w}
                    </HubLink>
                  </td>
                  <td className={`${td} text-rw-sub`}>{fmtN(y.kda)}</td>
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
                    <span
                      className={`w-3.5 shrink-0 font-bold ${r.win ? "text-rw-teal" : "text-rw-red"}`}
                    >
                      {r.win
                        ? tc("short result", "W")
                        : tc("short result", "L")}
                    </span>
                    <ChampIcon name={r.c} size={18} />
                    <span className="truncate min-w-0">
                      <span className="text-rw-text tabular-nums">
                        {r.k}/{r.d}/{r.a}
                      </span>{" "}
                      {r.g ? (
                        <HubLink to={{ kind: "match", slug: r.g, game: r.gn }}>
                          vs {r.opp}
                        </HubLink>
                      ) : (
                        <span className="text-rw-sub">vs {r.opp}</span>
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
                <span className="text-rw-text text-right truncate min-w-0">
                  {fmtNum(b.v)}{" "}
                  <span className="text-rw-muted">
                    ({champName(b.c)} vs{" "}
                    {b.g ? (
                      <HubLink
                        to={{ kind: "match", slug: b.g, game: b.gn }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {b.opp}
                      </HubLink>
                    ) : (
                      b.opp
                    )}
                    , {b.date.slice(0, 4)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      )}

      {overview && <OwnStorylines notes={p.notes} spoilerKey={`notes:player:${p.u}`} share={`${p.u}-storylines`} />}

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
                  <ChampIcon name={x.c} size={18} />
                  <span className="truncate">
                    {champName(x.c)}
                    {x.x > 1 && <span className="text-rw-accent"> ×{x.x}</span>}
                    <span className="text-rw-muted"> · {x.en}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                  {fmtDate(x.date)}
                  {x.g && (
                    <HubLink
                      to={{ kind: "match", slug: x.g, game: x.gn }}
                      className="text-rw-teal hover:underline"
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
                  <td className={`${td} text-rw-sub`}>{c.g}</td>
                  <td className={`${td} text-rw-sub`}>{winRate(c.w, c.g)}</td>
                  <td className={`${td} text-rw-sub`}>{fmtN(c.kda)}</td>
                  <td className={`${td} text-rw-muted`}>
                    {c.k} / {c.d} / {c.a}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => onSelectChamp(c.c)}
                      className="text-rw-teal hover:underline"
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
      <td className={`${td} max-w-[8rem] truncate`}>
        <TeamLink name={x.t} u={x.tu} />
      </td>
      <td
        className={`${td} ${x.pl === "1" ? "text-rw-accent font-bold" : "text-rw-sub"}`}
      >
        {hidden ? <RevealButton onReveal={reveal} small /> : x.pl || "–"}
      </td>
      <td className={`${td} text-rw-sub`}>
        {hidden ? x.g : `${x.w}-${x.g - x.w}`}
      </td>
      <td className={`${td} text-rw-sub`}>{fmtN(x.kda)}</td>
      <td className={`${td} text-rw-sub`}>{x.csm ?? "–"}</td>
      <td className={td}>
        <span className="flex gap-0.5">
          {x.c.map((c) => (
            <ChampIcon key={c} name={c} size={16} />
          ))}
        </span>
      </td>
    </tr>
  );
};
