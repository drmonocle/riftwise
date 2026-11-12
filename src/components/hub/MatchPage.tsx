/** One series (a "match": Bo1 to Bo5): every game's draft, scoreboard, builds, runes and objectives. */
import React, { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, PlayCircle, Clock, Crown, Star, Swords } from "lucide-react";
import { tl, tc, tk, roleName, locale, stageLabel, fmtDec } from "../../i18n";
import { champName } from "../../champions";
import { normalizeRole } from "../../hub/champAgg";
import { buildGameDraftQuery, type GameDraftInput, loadHubSeries, prettySlug, resolveChampSlug, resolveItemSlug, resolvePlayerSlug, resolveTeamAlias } from "../../hub/data";
import type { GamePlayer, HubGame, HubSeries, SideStats } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { RatingBadge as PlayerRatingBadge, fmtRating, useRatingFile } from "./PlayerRating";
import { rateLine } from "../../hub/playerRating";
import { hubShareUrl, navigateHub } from "../../hub/route";
import { BroadcastCardButton, gameCardData, SectionCard, seriesCardData } from "./BroadcastCard";
import { RiotGamesFor, RiotMatchPage } from "./RiotMatch";
import { RIOT_PREFIX } from "../../hub/riotMatch";
import { card, ChampIcon, EventLink, fmtDate, fmtNum, HubLink, ItemIcon, OeCredit, Page, PlayerLink, PlayerPhoto, RatingBadge, RevealButton, RuneIcon, Section, SpellIcon, TeamLink, TeamLogo, useHidden, useLoad, usePageTitle, PhotosLink } from "./ui";
import { heroBtn } from "./EntityHero";

export function extractHubGameDraft(g: HubGame): GameDraftInput {
  const bluePicks = g.t?.blue?.picks?.length
    ? g.t.blue.picks
    : (g.p || []).filter((p) => p.s === 1 && p.c).map((p) => p.c!);
  const redPicks = g.t?.red?.picks?.length
    ? g.t.red.picks
    : (g.p || []).filter((p) => p.s === 2 && p.c).map((p) => p.c!);
  return {
    blueBans: g.t?.blue?.bans || [],
    redBans: g.t?.red?.bans || [],
    bluePicks,
    redPicks,
  };
}

export function seriesGameDraftQuery(s: HubSeries, g: HubGame | undefined, gi = 0): string {
  const slugA = s.a.u || resolveTeamAlias(s.a.n) || prettySlug(s.a.n);
  const slugB = s.b.u || resolveTeamAlias(s.b.n) || prettySlug(s.b.n);
  const year = (g?.date || s.date || "").slice(0, 4);
  const period = /^\d{4}$/.test(year) ? `y${year}` : undefined;
  if (!g) {
    return buildGameDraftQuery({
      blueSlug: slugA,
      redSlug: slugB,
      period,
      gameNum: gi + 1,
    });
  }
  const activeIdx = Math.max(0, s.games.indexOf(g));
  const blueIsB = g.blue === "b";
  const blueSlug = blueIsB ? slugB : slugA;
  const redSlug = blueIsB ? slugA : slugB;
  const earlier = s.games.slice(0, activeIdx).map((eg) => {
    const egBlueIsB = eg.blue === "b";
    return {
      blueSlug: egBlueIsB ? slugB : slugA,
      redSlug: egBlueIsB ? slugA : slugB,
      draft: extractHubGameDraft(eg),
    };
  });
  return buildGameDraftQuery({
    blueSlug,
    redSlug,
    period,
    gameNum: g.n || activeIdx + 1,
    current: extractHubGameDraft(g),
    earlier,
  });
}

const fmtGold = (g?: number) => (g == null ? "–" : `${fmtDec(g / 1000)}k`);
const fmtMin = (m?: number | null) => {
  if (m == null) return "";
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const DRAKE_LABEL: Record<string, string> = {
  infernal: tk("Infernal"), mountain: tk("Mountain"), ocean: tk("Ocean"), cloud: tk("Cloud"), hextech: tk("Hextech"), chemtech: tk("Chemtech"),
};

export const MatchPage: React.FC<{ slug: string; game?: number; onOpenUrl: (url: string) => void }> = ({ slug, game, onOpenUrl }) =>
  // a match the stats hub doesn't have yet: from Riot's feeds
  slug.startsWith(RIOT_PREFIX) ? <RiotMatchPage matchId={slug.slice(RIOT_PREFIX.length)} /> : <HubMatchPage slug={slug} game={game} onOpenUrl={onOpenUrl} />;

const HubMatchPage: React.FC<{ slug: string; game?: number; onOpenUrl: (url: string) => void }> = ({ slug, game, onOpenUrl }) => {
  const state = useLoad(() => loadHubSeries(slug), [slug]);
  usePageTitle(state.data ? `${state.data.a.n} vs ${state.data.b.n} – ${state.data.en}` : null);
  useDDragon();
  return <Page state={state}>{(s) => <SeriesView key={slug} s={s} slug={slug} game={game} onOpenUrl={onOpenUrl} />}</Page>;
};

const sideSlug = (team: HubSeries["a"]) => team.u || resolveTeamAlias(team.n) || prettySlug(team.n);
const pSlug = (n: string, u?: string | null) => u || resolvePlayerSlug(n) || prettySlug(n);

/** One team in a series' top card: its logo next to the score and its name, the winner's in the accent. Phones: the
 *  logo over the short name. */
const SeriesSide: React.FC<{ team: HubSeries["a"]; oppSlug?: string; topPlayer?: string; topChamp?: string; won: boolean; align: "left" | "right"; period?: string; eventSlug?: string }> = ({
  team,
  oppSlug,
  topPlayer,
  topChamp,
  won,
  align,
  period,
  eventSlug,
}) => {
  const u = sideSlug(team);
  const pQuery =
    new URLSearchParams({
      ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
      ...(oppSlug && oppSlug !== u ? { q: oppSlug } : {}),
      ...(topPlayer ? { player: topPlayer } : {}),
      ...(topChamp ? { champ: resolveChampSlug(topChamp) } : {}),
    }).toString() || undefined;
  const name = (
    <>
      <span className="sm:hidden">{team.c || team.n}</span>
      <span className="hidden sm:inline">{team.n}</span>
    </>
  );
  const cls = `font-head text-[20px] sm:text-[28px] font-bold leading-tight break-words min-w-0 ${won ? "text-rw-teal" : "text-rw-text"}`;
  const logoImg = <TeamLogo name={team.n} code={team.c || undefined} sizeClass="w-11 h-11 sm:w-14 sm:h-14" className="drop-shadow-[0_6px_14px_rgba(0,0,0,0.5)]" />;
  const logo = u ? (
    <HubLink to={{ kind: "team", slug: u, ...(pQuery ? { query: pQuery } : {}) }} className="shrink-0 hover:opacity-85" title={team.n}>
      {logoImg}
    </HubLink>
  ) : (
    logoImg
  );
  return (
    <span
      className={`flex items-center gap-2 sm:gap-3 min-w-0 ${
        align === "right" ? "flex-col-reverse sm:flex-row sm:justify-end text-center sm:text-right" : "flex-col sm:flex-row text-center sm:text-left"
      }`}
    >
      {align === "left" && logo}
      {u ? (
        <HubLink to={{ kind: "team", slug: u, ...(pQuery ? { query: pQuery } : {}) }} className={`${cls} hover:underline`}>
          {name}
        </HubLink>
      ) : (
        <span className={cls}>{name}</span>
      )}
      {align === "right" && logo}
    </span>
  );
};

const SeriesView: React.FC<{ s: HubSeries; slug: string; game?: number; onOpenUrl: (url: string) => void }> = ({ s, slug, game: startGame, onOpenUrl }) => {
  const [hidden, reveal] = useHidden(`series:${slug}`, s.date);
  const withStats = s.games.filter((g) => g.p && g.p.length);
  // opened at one game (/match/<slug>?g=5, from Best games), else the first
  const [gi, setGi] = useState(() => Math.max(0, s.games.findIndex((g) => g.n === startGame)));
  // Back/Forward or a link to another game of this series
  useEffect(() => {
    const i = s.games.findIndex((g) => g.n === startGame);
    if (i >= 0) setGi(i);
  }, [startGame, s.games]);
  // the address (and Copy link) follow the game on screen: /match/<slug>?g=3
  const pick = (i: number) => {
    setGi(i);
    const g = s.games[i];
    if (g) navigateHub({ kind: "match", slug, game: g.n }, { replace: true });
  };
  // spoiler mode shows every game a best-of could have, so a 3-0 doesn't give itself away by having 3 tabs
  const tabs = hidden ? Math.max(s.bo || 0, s.games.length) : s.games.length;
  const game = gi < s.games.length ? s.games[gi] : hidden ? undefined : s.games[s.games.length - 1];
  const scoreA = hidden ? "?" : s.sa;
  const scoreB = hidden ? "?" : s.sb;
  const seriesYear = (s.date || "").slice(0, 4);
  const seriesPeriod = /^\d{4}$/.test(seriesYear) ? `y${seriesYear}` : undefined;
  const slugA = sideSlug(s.a);
  const slugB = sideSlug(s.b);
  const aSide = game?.blue === "b" ? 2 : 1;
  const pAObj = game?.p?.find((p) => p.s === aSide);
  const pBObj = game?.p?.find((p) => p.s !== aSide);
  const topPlayerA = pAObj ? pSlug(pAObj.n, pAObj.u) : undefined;
  const topPlayerB = pBObj ? pSlug(pBObj.n, pBObj.u) : undefined;
  const topChampA =
    (game?.blue === "b" ? game?.t?.red?.picks?.[0] : game?.t?.blue?.picks?.[0]) ||
    game?.p?.find((p) => p.s === aSide && p.c)?.c;
  const topChampB =
    (game?.blue === "b" ? game?.t?.blue?.picks?.[0] : game?.t?.red?.picks?.[0]) ||
    game?.p?.find((p) => p.s !== aSide && p.c)?.c;
  return (
    <div className="space-y-3">
      {/* the series' top card: where and when, both teams and the score, then what to open next */}
      <section className="relative bg-rw-panel border border-rw-accent/40 rounded-xl rw-hot p-4 sm:p-6">
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-[inherit] pointer-events-none bg-[radial-gradient(640px_220px_at_50%_0%,color-mix(in_oklab,var(--rw-accent)_12%,transparent),transparent_70%)]"
        />
        <div className="relative text-[13px] text-rw-sub flex flex-wrap items-center gap-x-2 gap-y-1">
          <EventLink
            name={s.en}
            u={s.e}
            query={slugA || slugB ? `q=${encodeURIComponent([slugA, slugB].filter(Boolean).join(","))}` : undefined}
            className="text-rw-accent font-semibold hover:underline"
          />
          {s.stage && (
            <span>
              ·{" "}
              {s.e ? (
                <HubLink
                  to={{
                    kind: "event",
                    slug: s.e,
                    ...((slugA || slugB) ? { query: `q=${encodeURIComponent([slugA, slugB].filter(Boolean).join(","))}` } : {}),
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {stageLabel(s.stage)}
                </HubLink>
              ) : (
                stageLabel(s.stage)
              )}
            </span>
          )}
          <span>
            ·{" "}
            <HubLink
              to={
                slugA && slugB
                  ? {
                      kind: "finder",
                      query: new URLSearchParams({
                        ...(topPlayerA ? { player: topPlayerA } : {}),
                        ...(topPlayerB && topPlayerB !== topPlayerA ? { vsplayer: topPlayerB } : {}),
                        team: slugA,
                        vs: slugB,
                        ...(pAObj?.r ? { role: normalizeRole(pAObj.r) } : {}),
                        ...(topChampA ? { champ: resolveChampSlug(topChampA) } : {}),
                        ...(topChampB && topChampB !== topChampA ? { vschamp: resolveChampSlug(topChampB) } : {}),
                        ...(game?.patch ? { patch: game.patch } : {}),
                        ...(s.e ? { event: s.e } : {}),
                        ...(seriesYear ? { year: seriesYear } : {}),
                      }).toString(),
                    }
                  : { kind: "finder", ...(game?.patch || s.e || seriesYear ? { query: new URLSearchParams({ ...(game?.patch ? { patch: game.patch } : {}), ...(s.e ? { event: s.e } : {}), ...(seriesYear ? { year: seriesYear } : {}) }).toString() } : {}) }
              }
              className="hover:text-rw-accent hover:underline"
            >
              {fmtDate(s.date)}
            </HubLink>
          </span>
          <span>
            ·{" "}
            {slugA && slugB ? (
              <HubLink
                to={{ kind: "prep", a: slugA, b: slugB, period: seriesPeriod }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Match prep")}
              >
                {tc("series length", "Best of {n}", { n: s.bo })}
              </HubLink>
            ) : (
              tc("series length", "Best of {n}", { n: s.bo })
            )}
          </span>
          <span>
            ·{" "}
            <PhotosLink
              q={s.en}
              label={tl("Event photos")}
              title={tl("Riot's photos from {event} on NerdFinder", { event: s.en })}
              className="inline-flex items-center gap-1 text-rw-accent hover:underline"
            />
          </span>
          {!hidden && s.r != null && (
            <HubLink
              to={{
                kind: "best",
                query: new URLSearchParams({
                  view: "series",
                  ...(s.e ? { event: s.e } : {}),
                  ...(seriesYear ? { year: seriesYear } : {}),
                  ...(topChampA ? { champ: resolveChampSlug(topChampA) } : {}),
                  ...(slugA && slugB ? { q: `${slugA},${slugB}` } : {}),
                }).toString(),
              }}
              className="ml-auto"
              title={tl("Series rating: mostly its best game, then its other games")}
            >
              <RatingBadge r={s.r} />
            </HubLink>
          )}
        </div>
        {/* the page's main heading: both teams and the score (short names on phones) */}
        <h1 className="relative mt-4 sm:mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
          <SeriesSide
            team={s.a}
            oppSlug={slugB}
            topPlayer={topPlayerA}
            topChamp={topChampA}
            won={!hidden && s.w === 1}
            align="right"
            period={seriesPeriod}
            eventSlug={s.e}
          />
          <span className="flex flex-col items-center gap-1 min-w-[4.5rem]">
            <span className="block font-num text-[32px] sm:text-[44px] font-bold text-rw-text tabular-nums text-center leading-none">
              {scoreA} <span className="text-rw-muted/60">–</span> {scoreB}
            </span>
            {!hidden && s.sa + s.sb > 0 && (
              <span className="w-16 sm:w-20 h-1 rounded-full bg-rw-border/70 overflow-hidden flex gap-[1px]" aria-hidden="true">
                <span className="h-full bg-rw-teal/80" style={{ width: `${Math.round((s.sa / (s.sa + s.sb)) * 100)}%` }} />
                <span className="h-full flex-1 bg-rw-rose/70" />
              </span>
            )}
          </span>
          <SeriesSide
            team={s.b}
            oppSlug={slugA}
            topPlayer={topPlayerB}
            topChamp={topChampB}
            won={!hidden && s.w === 2}
            align="left"
            period={seriesPeriod}
            eventSlug={s.e}
          />
        </h1>
        {hidden && (
          <div className="relative mt-3 text-center">
            <RevealButton onReveal={reveal} />
          </div>
        )}
        {((!hidden && s.games.some((g) => g.w)) || (slugA && slugB)) && (
          <div className="relative mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-2">
            {slugA && slugB && (
              <>
                <HubLink to={{ kind: "prep", a: slugA, b: slugB, period: seriesPeriod }} className={heroBtn(true)}>
                  {tl("Match prep")}
                </HubLink>
                <HubLink to={{ kind: "compare", mode: "team", a: slugA, b: slugB, period: seriesPeriod }} className={heroBtn()}>
                  {tl("Compare")}
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: seriesGameDraftQuery(s, game, gi),
                  }}
                  className={heroBtn()}
                >
                  {tl("Draft board")}
                </HubLink>
                {(() => {
                  const b0 = game?.p?.find((p) => p.s === 1 && p.c) || game?.t?.blue?.picks?.[0];
                  const r0 = game?.p?.find((p) => p.s === 2 && p.c) || game?.t?.red?.picks?.[0];
                  const cBlue = typeof b0 === "string" ? b0 : b0?.c;
                  const cRed = typeof r0 === "string" ? r0 : r0?.c;
                  const rBlue = typeof b0 === "object" && b0?.r ? normalizeRole(b0.r) : "";
                  const pBlue = typeof b0 === "object" && b0?.n ? pSlug(b0.n, b0.u) : "";
                  const pRed = typeof r0 === "object" && r0?.n ? pSlug(r0.n, r0.u) : "";
                  const blueTeamSlug = game?.blue === "b" ? slugB : slugA;
                  const redTeamSlug = game?.blue === "b" ? slugA : slugB;
                  const qChamps = [cBlue ? resolveChampSlug(cBlue) : "", cRed && cRed !== cBlue ? resolveChampSlug(cRed) : ""]
                    .filter(Boolean)
                    .join(",");
                  return (
                    <>
                      {cBlue && (
                        <HubLink
                          to={{
                            kind: "counters",
                            query: `champ=${encodeURIComponent(resolveChampSlug(cBlue))}${cRed && cRed !== cBlue ? `&vs=${encodeURIComponent(resolveChampSlug(cRed))}` : ""}${pBlue ? `&player=${encodeURIComponent(pBlue)}` : ""}${pRed && pRed !== pBlue ? `&vsplayer=${encodeURIComponent(pRed)}` : ""}&team=${encodeURIComponent(blueTeamSlug)}&vsteam=${encodeURIComponent(redTeamSlug)}${rBlue ? `&role=${encodeURIComponent(rBlue)}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${game?.patch ? `&patch=${encodeURIComponent(game.patch)}` : seriesYear ? `&patch=y${encodeURIComponent(seriesYear)}&year=${encodeURIComponent(seriesYear)}` : ""}`,
                          }}
                          className={heroBtn()}
                        >
                          {tl("Counters")}
                        </HubLink>
                      )}
                      <HubLink
                        to={{
                          kind: "items",
                          query: `${pBlue ? `player=${encodeURIComponent(pBlue)}&` : ""}${pRed && pRed !== pBlue ? `vsplayer=${encodeURIComponent(pRed)}&` : ""}team=${encodeURIComponent(blueTeamSlug)}&vs=${encodeURIComponent(redTeamSlug)}${rBlue ? `&role=${encodeURIComponent(rBlue)}` : ""}${cBlue ? `&champ=${encodeURIComponent(resolveChampSlug(cBlue))}` : ""}${cRed && cRed !== cBlue ? `&vschamp=${encodeURIComponent(resolveChampSlug(cRed))}` : ""}${game?.patch ? `&patch=${encodeURIComponent(game.patch)}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${seriesYear ? `&year=${encodeURIComponent(seriesYear)}` : ""}`,
                        }}
                        className={heroBtn()}
                      >
                        {tl("Item history")}
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "finder",
                          query: `${pBlue ? `player=${encodeURIComponent(pBlue)}&` : ""}${pRed && pRed !== pBlue ? `vsplayer=${encodeURIComponent(pRed)}&` : ""}team=${encodeURIComponent(blueTeamSlug)}&vs=${encodeURIComponent(redTeamSlug)}${rBlue ? `&role=${encodeURIComponent(rBlue)}` : ""}${cBlue ? `&champ=${encodeURIComponent(resolveChampSlug(cBlue))}` : ""}${cRed && cRed !== cBlue ? `&vschamp=${encodeURIComponent(resolveChampSlug(cRed))}` : ""}${game?.patch ? `&patch=${encodeURIComponent(game.patch)}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${seriesYear ? `&year=${encodeURIComponent(seriesYear)}` : ""}`,
                        }}
                        className={heroBtn()}
                      >
                        {tl("Game finder")}
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "rankings",
                          query: `q=${encodeURIComponent([slugA, slugB, pBlue, pRed && pRed !== pBlue ? pRed : ""].filter(Boolean).join(","))}`,
                        }}
                        className={heroBtn()}
                      >
                        {tl("Power rankings")}
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "leaders",
                          query: new URLSearchParams({
                            q: [slugA, slugB, pBlue, pRed && pRed !== pBlue ? pRed : ""].filter(Boolean).join(","),
                            ...(rBlue ? { role: rBlue } : {}),
                            ...(cBlue ? { champ: resolveChampSlug(cBlue) } : {}),
                            ...(s.e ? { event: s.e } : {}),
                            ...(seriesYear ? { year: seriesYear } : {}),
                          }).toString(),
                        }}
                        className={heroBtn()}
                      >
                        {tl("Leaderboards")}
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "tiers",
                          ...(qChamps || game?.patch || seriesPeriod || s.e || rBlue
                            ? {
                                query: new URLSearchParams({
                                  ...(qChamps ? { q: qChamps } : {}),
                                  ...(rBlue ? { role: rBlue } : {}),
                                  ...(game?.patch ? { key: `p${game.patch}`, patch: game.patch } : seriesPeriod ? { key: seriesPeriod } : {}),
                                  ...(seriesYear ? { year: seriesYear } : {}),
                                  ...(s.e ? { event: s.e } : {}),
                                }).toString(),
                              }
                            : {}),
                        }}
                        className={heroBtn()}
                      >
                        {tl("Pro tier list")}
                      </HubLink>
                    </>
                  );
                })()}
              </>
            )}
            {!hidden && s.games.some((g) => g.w) && (
              <>
                <BroadcastCardButton hero data={() => seriesCardData(s)} name={`${s.a.n}-vs-${s.b.n}-series`} label={tl("Overview card")} />
                <CopySeriesPost s={s} slug={slug} />
              </>
            )}
          </div>
        )}
        {!hidden && s.ff ? (
          <p className="relative mt-3 text-[12px] text-rw-muted text-center">{tl("Result awarded by forfeit, not by the games played.")}</p>
        ) : null}
      </section>

      {/* no stats in the hub yet (a match from today): every game from Riot's live stats feed instead */}
      {withStats.length === 0 ? (
        <RiotGamesFor
          s={s}
          showStats={!hidden}
          fallback={
            <>
              <p className="text-[11px] text-rw-muted text-center">{tl("Only the results of this series are known: no player stats were recorded for it.")}</p>
              <SeriesGames s={s} tabs={tabs} gi={gi} pick={pick} hidden={hidden} game={game} reveal={reveal} onOpenUrl={onOpenUrl} />
            </>
          }
        />
      ) : (
        <SeriesGames s={s} tabs={tabs} gi={gi} pick={pick} hidden={hidden} game={game} reveal={reveal} onOpenUrl={onOpenUrl} />
      )}
    </div>
  );
};

/** Whole-series MVP & macro totals strip for multi-game series (Bo3/Bo5). */
const SeriesSummaryStrip: React.FC<{ s: HubSeries }> = ({ s }) => {
  const ratingFile = useRatingFile();
  const summary = useMemo(() => {
    let aKills = 0;
    let bKills = 0;
    let aGold = 0;
    let bGold = 0;
    let aTowers = 0;
    let bTowers = 0;
    let totalMin = 0;
    let minCount = 0;
    const players = new Map<
      string,
      {
        n: string;
        u: string | null;
        r: string;
        teamSide: 1 | 2;
        k: number;
        d: number;
        a: number;
        g: number;
        rtSum: number;
        rtCount: number;
        champs: string[];
      }
    >();

    for (const g of s.games) {
      const aIsBlue = g.blue === "a";
      const bSt = g.t?.blue;
      const rSt = g.t?.red;
      const blueP = (g.p || []).filter((p) => p.s === 1);
      const redP = (g.p || []).filter((p) => p.s === 2);
      const bk = bSt?.k ?? blueP.reduce((acc, p) => acc + p.k, 0);
      const rk = rSt?.k ?? redP.reduce((acc, p) => acc + p.k, 0);
      const bg = bSt?.gold ?? blueP.reduce((acc, p) => acc + (p.gd || 0), 0);
      const rg = rSt?.gold ?? redP.reduce((acc, p) => acc + (p.gd || 0), 0);
      const bt = bSt?.towers || 0;
      const rt = rSt?.towers || 0;
      aKills += aIsBlue ? bk : rk;
      bKills += aIsBlue ? rk : bk;
      aGold += aIsBlue ? bg : rg;
      bGold += aIsBlue ? rg : bg;
      aTowers += aIsBlue ? bt : rt;
      bTowers += aIsBlue ? rt : bt;
      if (g.min != null) {
        totalMin += g.min;
        minCount++;
      }

      if (!g.p || !g.p.length) continue;
      const year = (g.date || s.date || "").slice(0, 4);
      const blueWon = (g.w === 1 && aIsBlue) || (g.w === 2 && !aIsBlue);
      const redWon = g.w !== 0 && !blueWon;
      const sumSide = (side: number, f: (p: GamePlayer) => number | undefined) =>
        (g.p || []).filter((p) => p.s === side).reduce((acc, p) => acc + (f(p) || 0), 0);

      for (const p of g.p) {
        const key = (p.u || p.n).toLowerCase();
        const teamSide: 1 | 2 = (p.s === 1 ? aIsBlue : !aIsBlue) ? 1 : 2;
        const cur = players.get(key) || {
          n: p.n,
          u: p.u || null,
          r: p.r || "",
          teamSide,
          k: 0,
          d: 0,
          a: 0,
          g: 0,
          rtSum: 0,
          rtCount: 0,
          champs: [] as string[],
        };
        if (!cur.r && p.r) cur.r = p.r;
        cur.k += p.k;
        cur.d += p.d;
        cur.a += p.a;
        cur.g += 1;
        if (p.c && !cur.champs.includes(p.c)) cur.champs.push(p.c);
        if (ratingFile && g.min && g.w) {
          const val = rateLine(
            {
              year,
              role: p.r || "",
              won: p.s === 1 ? blueWon : redWon,
              k: p.k,
              d: p.d,
              a: p.a,
              cs: p.cs,
              gold: p.gd,
              dmg: p.dm,
              vision: p.v,
              min: g.min,
              teamK: sumSide(p.s, (x) => x.k),
              teamDmg: p.dm != null ? sumSide(p.s, (x) => x.dm) : null,
              teamGold: p.gd != null ? sumSide(p.s, (x) => x.gd) : null,
              teamVision: p.v != null ? sumSide(p.s, (x) => x.v) : null,
            },
            ratingFile,
          );
          if (val != null) {
            cur.rtSum += val;
            cur.rtCount += 1;
          }
        }
        players.set(key, cur);
      }
    }

    const allPlayers = [...players.values()];
    const eligible = allPlayers.filter((p) => p.rtCount >= Math.min(2, minCount));
    const winnerPool = s.w === 1 || s.w === 2 ? eligible.filter((p) => p.teamSide === s.w) : [];
    const pool = winnerPool.length ? winnerPool : eligible;
    pool.sort((a, b) => b.rtSum / b.rtCount - a.rtSum / a.rtCount || (b.k + b.a) - (a.k + a.a));
    const mvp = pool[0] ? { ...pool[0], avgRt: pool[0].rtSum / pool[0].rtCount } : null;
    const mvpOpp = mvp
      ? allPlayers.find((p) => p.teamSide !== mvp.teamSide && p.r && mvp.r && p.r === mvp.r) ||
        allPlayers.find((p) => p.teamSide !== mvp.teamSide) ||
        null
      : null;
    const pSideA = allPlayers.find((p) => p.teamSide === 1) || null;
    const pSideB = allPlayers.find((p) => p.teamSide === 2) || null;
    return { aKills, bKills, aGold, bGold, aTowers, bTowers, totalMin, minCount, mvp, mvpOpp, pSideA, pSideB };
  }, [s, ratingFile]);

  const { aKills, bKills, aGold, bGold, aTowers, bTowers, totalMin, minCount, mvp, mvpOpp, pSideA, pSideB } = summary;
  if (aKills + bKills === 0 && !mvp) return null;
  const codeA = s.a.c || s.a.n;
  const codeB = s.b.c || s.b.n;
  const slugA = sideSlug(s.a);
  const slugB = sideSlug(s.b);
  const seriesYear = (s.date || "").slice(0, 4);
  const seriesPeriod = /^\d{4}$/.test(seriesYear) ? `y${seriesYear}` : undefined;
  const macros = [
    aKills + bKills > 0 ? { label: tl("Kills"), a: aKills, b: bKills, fmt: (v: number) => String(v) } : null,
    aGold + bGold > 0 ? { label: tl("Gold"), a: aGold, b: bGold, fmt: (v: number) => fmtGold(v) } : null,
    aTowers + bTowers > 0 ? { label: tl("Towers"), a: aTowers, b: bTowers, fmt: (v: number) => String(v) } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className={`${card} !py-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 items-center text-xs`}>
      {mvp && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-rw-border/70 bg-rw-bg/40 px-2.5 py-1.5 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rw-teal">
              <Star className="w-3 h-3 fill-current shrink-0" />
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    q: [pSlug(mvp.n, mvp.u), mvpOpp ? pSlug(mvpOpp.n, mvpOpp.u) : "", slugA, slugB].filter(Boolean).join(","),
                    ...(mvp.r ? { role: normalizeRole(mvp.r) } : {}),
                    ...(mvp.champs[0] ? { champ: resolveChampSlug(mvp.champs[0]) } : {}),
                    ...(s.e ? { event: s.e } : {}),
                    ...(seriesYear ? { year: seriesYear } : {}),
                  }).toString(),
                }}
                className="truncate hover:underline"
                title={tl("Player leaderboards")}
              >
                {tl("Top rated:")}
              </HubLink>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              {(() => {
                const mvpSlug = pSlug(mvp.n, mvp.u);
                const mvpTeamSlug = mvp.teamSide === 1 ? slugA : slugB;
                const mvpOppSlug = mvp.teamSide === 1 ? slugB : slugA;
                const mvpOppPSlug = mvpOpp ? pSlug(mvpOpp.n, mvpOpp.u) : "";
                const mvpQuery =
                  new URLSearchParams({
                    ...(seriesPeriod ? { p: seriesPeriod } : s.e ? { p: `e:${s.e}` } : {}),
                    ...(mvpTeamSlug ? { team: mvpTeamSlug } : {}),
                    ...(mvpOppSlug && mvpOppSlug !== mvpTeamSlug ? { vs: mvpOppSlug } : {}),
                    ...(mvpOppPSlug && mvpOppPSlug !== mvpSlug ? { vsplayer: mvpOppPSlug, q: mvpOppPSlug } : mvpOppSlug ? { q: mvpOppSlug } : {}),
                    ...(mvp.r ? { role: normalizeRole(mvp.r) } : {}),
                    ...(mvp.champs[0] ? { champ: resolveChampSlug(mvp.champs[0]) } : {}),
                    ...(mvpOpp?.champs[0] && mvpOpp.champs[0] !== mvp.champs[0] ? { vschamp: resolveChampSlug(mvpOpp.champs[0]) } : {}),
                  }).toString() || undefined;
                return (
                  <>
                    <HubLink to={{ kind: "player", slug: mvpSlug, ...(mvpQuery ? { query: mvpQuery } : {}) }} className="shrink-0 hover:opacity-80" title={mvp.n}>
                      <PlayerPhoto name={mvp.n} team={mvp.teamSide === 1 ? s.a.n : s.b.n} slug={mvp.u ?? undefined} size={20} />
                    </HubLink>
                    <PlayerLink name={mvp.n} u={mvp.u} query={mvpQuery} className="font-semibold text-rw-text hover:text-rw-accent truncate" />
                    <HubLink
                      to={{ kind: "player", slug: mvpSlug, tab: "stats", ...(mvpQuery ? { query: mvpQuery } : {}) }}
                      className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline font-mono tabular-nums shrink-0"
                      title={tl("Stats")}
                    >
                      {mvp.k}/{mvp.d}/{mvp.a}
                    </HubLink>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-0.5">
              {mvp.champs.slice(0, 4).map((c) => {
                const mvpSlug = pSlug(mvp.n, mvp.u);
                const mvpTeamSlug = mvp.teamSide === 1 ? slugA : slugB;
                const mvpOppSlug = mvp.teamSide === 1 ? slugB : slugA;
                const mvpOppPSlug = mvpOpp ? pSlug(mvpOpp.n, mvpOpp.u) : "";
                return (
                  <HubLink
                    key={c}
                    to={{
                      kind: "player",
                      slug: mvpSlug,
                      tab: "champions",
                      query: new URLSearchParams({
                        champ: resolveChampSlug(c),
                        ...(mvpOpp?.champs[0] && mvpOpp.champs[0] !== c ? { vschamp: resolveChampSlug(mvpOpp.champs[0]) } : {}),
                        ...(mvpTeamSlug ? { team: mvpTeamSlug } : {}),
                        ...(mvpOppSlug && mvpOppSlug !== mvpTeamSlug ? { vs: mvpOppSlug } : {}),
                        ...(mvpOppPSlug && mvpOppPSlug !== mvpSlug ? { vsplayer: mvpOppPSlug, q: mvpOppPSlug } : mvpOppSlug ? { q: mvpOppSlug } : {}),
                        ...(mvp.r ? { role: normalizeRole(mvp.r) } : {}),
                        ...(seriesPeriod ? { p: seriesPeriod } : s.e ? { p: `e:${s.e}` } : {}),
                      }).toString(),
                    }}
                    className="hover:opacity-80"
                    title={`${mvp.n} · ${champName(c)}`}
                  >
                    <ChampIcon name={c} size={16} />
                  </HubLink>
                );
              })}
            </span>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  player: pSlug(mvp.n, mvp.u),
                  ...(mvpOpp && pSlug(mvpOpp.n, mvpOpp.u) !== pSlug(mvp.n, mvp.u) ? { vsplayer: pSlug(mvpOpp.n, mvpOpp.u) } : {}),
                  ...(mvp.teamSide === 1 ? (slugA ? { team: slugA, ...(slugB ? { vs: slugB } : {}) } : {}) : (slugB ? { team: slugB, ...(slugA ? { vs: slugA } : {}) } : {})),
                  ...(mvp.r ? { role: normalizeRole(mvp.r) } : {}),
                  ...(mvp.champs[0] ? { champ: resolveChampSlug(mvp.champs[0]) } : {}),
                  ...(mvpOpp?.champs[0] && mvpOpp.champs[0] !== mvp.champs[0] ? { vschamp: resolveChampSlug(mvpOpp.champs[0]) } : {}),
                  ...(s.e ? { event: s.e } : {}),
                  ...(seriesYear ? { year: seriesYear } : {}),
                }).toString(),
              }}
              className="hover:opacity-85"
              title={tl("Game finder")}
            >
              <PlayerRatingBadge v={mvp.avgRt} top />
            </HubLink>
          </div>
        </div>
      )}
      {macros.map((m) => {
        const sum = m.a + m.b;
        const aPct = sum > 0 ? Math.round((m.a / sum) * 100) : 50;
        const pASlug = pSideA ? pSlug(pSideA.n, pSideA.u) : "";
        const pBSlug = pSideB ? pSlug(pSideB.n, pSideB.u) : "";
        return (
          <div key={m.label} className="rounded-lg border border-rw-border/70 bg-rw-bg/40 px-2.5 py-1.5 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
              <span className="font-bold text-rw-side-a">
                <TeamLink
                  name={codeA}
                  u={s.a.u}
                  query={
                    new URLSearchParams({
                      ...(seriesPeriod ? { p: seriesPeriod } : s.e ? { p: `e:${s.e}` } : {}),
                      ...(slugB && slugB !== slugA ? { q: slugB } : {}),
                      ...(pASlug ? { player: pASlug } : {}),
                      ...(pSideA?.champs[0] ? { champ: resolveChampSlug(pSideA.champs[0]) } : {}),
                    }).toString() || undefined
                  }
                  className="hover:underline"
                />{" "}
                {m.fmt(m.a)}
              </span>
              {slugA && slugB ? (
                <HubLink
                  to={{ kind: "compare", mode: "team", a: slugA, b: slugB, period: seriesPeriod }}
                  className="font-sans text-[9px] font-bold uppercase tracking-wider text-rw-muted hover:text-rw-accent hover:underline"
                  title={tl("Compare")}
                >
                  {m.label}
                  {m.label === tl("Kills") && minCount > 0 ? ` · ${fmtMin(totalMin)}` : ""}
                </HubLink>
              ) : (
                <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-rw-muted">
                  {m.label}
                  {m.label === tl("Kills") && minCount > 0 ? ` · ${fmtMin(totalMin)}` : ""}
                </span>
              )}
              <span className="font-bold text-rw-side-b">
                {m.fmt(m.b)}{" "}
                <TeamLink
                  name={codeB}
                  u={s.b.u}
                  query={
                    new URLSearchParams({
                      ...(seriesPeriod ? { p: seriesPeriod } : s.e ? { p: `e:${s.e}` } : {}),
                      ...(slugA && slugA !== slugB ? { q: slugA } : {}),
                      ...(pBSlug ? { player: pBSlug } : {}),
                      ...(pSideB?.champs[0] ? { champ: resolveChampSlug(pSideB.champs[0]) } : {}),
                    }).toString() || undefined
                  }
                  className="hover:underline"
                />
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden flex bg-rw-raised">
              <div className="h-full bg-rw-side-a" style={{ width: `${aPct}%` }} />
              <div className="h-full bg-rw-side-b" style={{ width: `${100 - aPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** The game tabs and the game on screen. */
const SeriesGames: React.FC<{
  s: HubSeries;
  tabs: number;
  gi: number;
  pick: (i: number) => void;
  hidden: boolean;
  game: HubGame | undefined;
  reveal: () => void;
  onOpenUrl: (url: string) => void;
}> = ({ s, tabs, gi, pick, hidden, game, reveal, onOpenUrl }) => {
  const seriesYear = s.date && /^\d{4}/.test(s.date) ? s.date.slice(0, 4) : undefined;
  const slugA = sideSlug(s.a);
  const slugB = sideSlug(s.b);
  const gamePicks = !hidden && tabs > 1
    ? s.games.map((g, i) => {
        const aBlue = g.blue === "a";
        const aPicks =
          g.t?.blue?.picks?.length && g.t?.red?.picks?.length
            ? aBlue
              ? g.t.blue.picks
              : g.t.red.picks
            : (g.p || []).filter((p) => p.s === (aBlue ? 1 : 2) && p.c).map((p) => p.c!);
        const bPicks =
          g.t?.blue?.picks?.length && g.t?.red?.picks?.length
            ? aBlue
              ? g.t.red.picks
              : g.t.blue.picks
            : (g.p || []).filter((p) => p.s !== (aBlue ? 1 : 2) && p.c).map((p) => p.c!);
        return { i, n: g.n, w: g.w, aPicks, bPicks };
      }).filter((x) => x.aPicks.length > 0 && x.bPicks.length > 0)
    : [];
  return (
    <>
      {!hidden && s.games.length >= 2 && <SeriesSummaryStrip s={s} />}
      {tabs > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {Array.from({ length: tabs }, (_, i) => s.games[i]).map((g, i) => (
            <button
              key={g ? g.n : `slot-${i}`}
              type="button"
              role="tab"
              aria-selected={i === gi}
              onClick={() => pick(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                i === gi ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
              }`}
            >
              {tl("Game {n}", { n: g ? g.n : i + 1 })}
              {!hidden && g?.w ? <span className="ml-1 opacity-90">({g.w === 1 ? s.a.c || s.a.n : s.b.c || s.b.n})</span> : null}
              {!hidden && g?.r != null ? <span className="ml-1.5 tabular-nums opacity-90">· {g.r.toFixed(0)}</span> : null}
            </button>
          ))}
        </div>
      )}
      {gamePicks.length > 1 && (
        <div className={`${card} !py-2 flex flex-wrap items-center gap-2 text-[11px]`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">{tl("Fearless")}</span>
          {gamePicks.map((gp) => (
            <button
              key={gp.n}
              type="button"
              onClick={() => pick(gp.i)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${
                gp.i === gi ? "border-rw-accent bg-rw-accent/10" : "border-rw-border/70 hover:border-rw-accent/50"
              }`}
            >
              <span className="text-[10px] font-semibold text-rw-sub">{tc("short game", "G{n}", { n: gp.n })}</span>
              <span className={`inline-flex items-center gap-0.5 ${gp.w === 2 ? "opacity-60" : ""}`}>
                {gp.aPicks.map((c) => (
                  <span key={`a-${c}`} title={champName(c)}>
                    <ChampIcon name={c} size={15} />
                  </span>
                ))}
              </span>
              <span className="text-[9px] text-rw-muted">vs</span>
              <span className={`inline-flex items-center gap-0.5 ${gp.w === 1 ? "opacity-60" : ""}`}>
                {gp.bPicks.map((c) => (
                  <span key={`b-${c}`} title={champName(c)}>
                    <ChampIcon name={c} size={15} />
                  </span>
                ))}
              </span>
            </button>
          ))}
          {slugA && slugB && (() => {
            const curGp = gamePicks.find((gp) => gp.i === gi) || gamePicks[0];
            const aSide = game?.blue === "b" ? 2 : 1;
            const pAObj = (game?.p || []).find((p) => p.s === aSide);
            const pBObj = (game?.p || []).find((p) => p.s !== aSide);
            const pA = pAObj ? pSlug(pAObj.n, pAObj.u) : "";
            const pB = pBObj ? pSlug(pBObj.n, pBObj.u) : "";
            const rA = pAObj?.r ? normalizeRole(pAObj.r) : "";
            const fearlessPeriod = seriesYear ? `y${seriesYear}` : s.e ? `e:${s.e}` : undefined;
            return (
              <span className="ml-auto flex items-center gap-2">
                <HubLink
                  to={{ kind: "prep", a: slugA, b: slugB, ...(fearlessPeriod ? { period: fearlessPeriod } : {}) }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(slugA)},${encodeURIComponent(slugB)}${
                      curGp?.aPicks[0]
                        ? `&champ=${encodeURIComponent(
                            [
                              resolveChampSlug(curGp.aPicks[0]),
                              curGp.bPicks[0] && curGp.bPicks[0] !== curGp.aPicks[0]
                                ? resolveChampSlug(curGp.bPicks[0])
                                : "",
                            ]
                              .filter(Boolean)
                              .join(","),
                          )}`
                        : ""
                    }${rA ? `&role=${encodeURIComponent(rA)}` : ""}${fearlessPeriod ? `&p=${encodeURIComponent(fearlessPeriod)}` : ""}`,
                  }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: slugA, b: slugB, ...(fearlessPeriod ? { period: fearlessPeriod } : {}) }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Compare")} →
                </HubLink>
                {curGp?.aPicks[0] && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: `champ=${encodeURIComponent(resolveChampSlug(curGp.aPicks[0]))}${
                        curGp.bPicks[0] && curGp.bPicks[0] !== curGp.aPicks[0]
                          ? `&vs=${encodeURIComponent(resolveChampSlug(curGp.bPicks[0]))}`
                          : ""
                      }${pA ? `&player=${encodeURIComponent(pA)}` : ""}${pB && pB !== pA ? `&vsplayer=${encodeURIComponent(pB)}` : ""}&team=${encodeURIComponent(slugA)}&vsteam=${encodeURIComponent(slugB)}${rA ? `&role=${encodeURIComponent(rA)}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${
                        game?.patch ? `&patch=${encodeURIComponent(game.patch)}` : seriesYear ? `&patch=y${encodeURIComponent(seriesYear)}&year=${encodeURIComponent(seriesYear)}` : ""
                      }`,
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "items",
                    query: `${pA ? `player=${encodeURIComponent(pA)}&` : ""}${pB && pB !== pA ? `vsplayer=${encodeURIComponent(pB)}&` : ""}team=${encodeURIComponent(slugA)}&vs=${encodeURIComponent(slugB)}${
                      rA ? `&role=${encodeURIComponent(rA)}` : ""
                    }${
                      curGp?.aPicks[0] ? `&champ=${encodeURIComponent(resolveChampSlug(curGp.aPicks[0]))}` : ""
                    }${
                      curGp?.bPicks[0] && curGp.bPicks[0] !== curGp?.aPicks[0]
                        ? `&vschamp=${encodeURIComponent(resolveChampSlug(curGp.bPicks[0]))}`
                        : ""
                    }${game?.patch ? `&patch=${encodeURIComponent(game.patch)}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${
                      seriesYear ? `&year=${encodeURIComponent(seriesYear)}` : ""
                    }`,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `${pA ? `player=${encodeURIComponent(pA)}&` : ""}${pB && pB !== pA ? `vsplayer=${encodeURIComponent(pB)}&` : ""}team=${encodeURIComponent(slugA)}&vs=${encodeURIComponent(slugB)}${
                      rA ? `&role=${encodeURIComponent(rA)}` : ""
                    }${
                      curGp?.aPicks[0] ? `&champ=${encodeURIComponent(resolveChampSlug(curGp.aPicks[0]))}` : ""
                    }${
                      curGp?.bPicks[0] && curGp.bPicks[0] !== curGp?.aPicks[0]
                        ? `&vschamp=${encodeURIComponent(resolveChampSlug(curGp.bPicks[0]))}`
                        : ""
                    }${game?.patch ? `&patch=${encodeURIComponent(game.patch)}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${seriesYear ? `&year=${encodeURIComponent(seriesYear)}` : ""}`,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query: `q=${encodeURIComponent([slugA, slugB, pA, pB && pB !== pA ? pB : ""].filter(Boolean).join(","))}`,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      q: [slugA, slugB, pA, pB && pB !== pA ? pB : ""].filter(Boolean).join(","),
                      ...(rA ? { role: rA } : {}),
                      ...(curGp?.aPicks[0] ? { champ: resolveChampSlug(curGp.aPicks[0]) } : {}),
                      ...(s.e ? { event: s.e } : {}),
                      ...(seriesYear ? { year: seriesYear } : {}),
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(game?.patch || s.e || seriesYear || curGp?.aPicks[0] || rA
                      ? {
                          query: new URLSearchParams({
                            ...(curGp?.aPicks[0]
                              ? {
                                  q: [
                                    resolveChampSlug(curGp.aPicks[0]),
                                    curGp.bPicks[0] && curGp.bPicks[0] !== curGp.aPicks[0]
                                      ? resolveChampSlug(curGp.bPicks[0])
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(","),
                                }
                              : {}),
                            ...(rA ? { role: rA } : {}),
                            ...(game?.patch ? { key: `p${game.patch}`, patch: game.patch } : seriesYear ? { key: `y${seriesYear}` } : {}),
                            ...(seriesYear ? { year: seriesYear } : {}),
                            ...(s.e ? { event: s.e } : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
              </span>
            );
          })()}
        </div>
      )}

      {game ? (
        <GameView s={s} g={game} hidden={hidden} onReveal={reveal} onOpenUrl={onOpenUrl} />
      ) : (
        hidden && (
          <div className={`${card} py-4 text-center space-y-2`}>
            <p className="text-[11px] text-rw-muted">{tl("Hidden while spoiler mode is on.")}</p>
            <RevealButton onReveal={reveal} />
          </div>
        )
      )}
    </>
  );
};

const GameView: React.FC<{ s: HubSeries; g: HubGame; hidden: boolean; onReveal: () => void; onOpenUrl: (url: string) => void }> = ({
  s,
  g,
  hidden,
  onReveal,
  onOpenUrl,
}) => {
  const blueTeam = g.blue === "a" ? s.a : s.b;
  const redTeam = g.blue === "a" ? s.b : s.a;
  const blueWon = (g.w === 1 && g.blue === "a") || (g.w === 2 && g.blue === "b");
  const redWon = g.w !== 0 && !blueWon;
  const blue = g.p?.filter((p) => p.s === 1) || [];
  const red = g.p?.filter((p) => p.s === 2) || [];
  const gameYear = (g.date || s.date || "").slice(0, 4);
  const gamePeriod = /^\d{4}$/.test(gameYear) ? `y${gameYear}` : undefined;
  const slugA = sideSlug(s.a);
  const slugB = sideSlug(s.b);
  const blueTeamSlug = sideSlug(blueTeam);
  const redTeamSlug = sideSlug(redTeam);
  // each player's rating for this game (src/hub/playerRating.ts), and the best of the ten
  const ratingFile = useRatingFile();
  const ratings = useMemo(() => {
    const m = new Map<GamePlayer, number>();
    if (!ratingFile || !g.p || !g.min || !g.w) return m;
    const year = (g.date || s.date || "").slice(0, 4);
    const sum = (side: number, f: (p: GamePlayer) => number | undefined) => (g.p || []).filter((p) => p.s === side).reduce((a, p) => a + (f(p) || 0), 0);
    for (const p of g.p) {
      const v = rateLine(
        {
          year,
          role: p.r || "",
          won: p.s === 1 ? blueWon : redWon,
          k: p.k,
          d: p.d,
          a: p.a,
          cs: p.cs,
          gold: p.gd,
          dmg: p.dm,
          vision: p.v,
          min: g.min,
          teamK: sum(p.s, (x) => x.k),
          teamDmg: p.dm != null ? sum(p.s, (x) => x.dm) : null,
          teamGold: p.gd != null ? sum(p.s, (x) => x.gd) : null,
          teamVision: p.v != null ? sum(p.s, (x) => x.v) : null,
        },
        ratingFile,
      );
      if (v != null) m.set(p, v);
    }
    return m;
  }, [ratingFile, g, s.date, blueWon, redWon]);
  const top = [...ratings.entries()].sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-rw-muted">
          <span className="flex items-center gap-2">
            {g.min != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {hidden ? (
                  "–"
                ) : (
                  <HubLink
                    to={{
                      kind: "records",
                      ...(slugA || slugB || s.e || s.en || gameYear
                        ? {
                            query: new URLSearchParams({
                              ...(slugA || slugB || s.e || s.en
                                ? { q: [slugA, slugB, s.e || s.en].filter(Boolean).join(",") }
                                : {}),
                              ...(s.e ? { event: s.e } : {}),
                              ...(gameYear ? { year: gameYear } : {}),
                            }).toString(),
                          }
                        : {}),
                    }}
                    className="hover:text-rw-accent hover:underline"
                    title={tl("Records")}
                  >
                    {fmtMin(g.min)}
                  </HubLink>
                )}
              </span>
            )}
            {g.patch && (
              <HubLink
                to={{
                  kind: "champions",
                  query: new URLSearchParams({
                    key: `p${g.patch}`,
                    patch: g.patch,
                    ...(blue[0]?.r ? { role: normalizeRole(blue[0].r) } : {}),
                    ...(blue[0]?.c || red[0]?.c
                      ? {
                          q: [
                            blue[0]?.c ? resolveChampSlug(blue[0].c) : "",
                            red[0]?.c && red[0].c !== blue[0]?.c ? resolveChampSlug(red[0].c) : "",
                          ]
                            .filter(Boolean)
                            .join(","),
                        }
                      : {}),
                    ...(gameYear ? { year: gameYear } : {}),
                    ...(s.e ? { event: s.e } : {}),
                  }).toString(),
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {tl("Patch {patch}", { patch: g.patch })}
              </HubLink>
            )}
            {g.date &&
              (blueTeamSlug && redTeamSlug ? (
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      ...(blue[0] ? { player: pSlug(blue[0].n, blue[0].u) } : {}),
                      ...(red[0] && pSlug(red[0].n, red[0].u) !== (blue[0] ? pSlug(blue[0].n, blue[0].u) : "")
                        ? { vsplayer: pSlug(red[0].n, red[0].u) }
                        : {}),
                      team: blueTeamSlug,
                      vs: redTeamSlug,
                      ...(blue[0]?.r ? { role: normalizeRole(blue[0].r) } : {}),
                      ...(blue[0]?.c ? { champ: resolveChampSlug(blue[0].c) } : {}),
                      ...(red[0]?.c && red[0].c !== blue[0]?.c ? { vschamp: resolveChampSlug(red[0].c) } : {}),
                      ...(g.patch ? { patch: g.patch } : {}),
                      ...(s.e ? { event: s.e } : {}),
                      ...(gameYear ? { year: gameYear } : {}),
                    }).toString(),
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {new Date(`${g.date.replace(" ", "T")}Z`).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })}
                </HubLink>
              ) : (
                <span>{new Date(`${g.date.replace(" ", "T")}Z`).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })}</span>
              ))}
            {g.ff ? <span className="text-rw-accent">{tl("Forfeit")}</span> : null}
            {g.mvp && !hidden && (() => {
              const mvpSlug = pSlug(g.mvp.n, g.mvp.u);
              const mvpRow = g.p?.find((x) => pSlug(x.n, x.u) === mvpSlug || x.n === g.mvp?.n);
              const mvpTeamSlug = mvpRow ? (mvpRow.s === 1 ? blueTeamSlug : redTeamSlug) : "";
              const mvpOppTeamSlug = mvpRow ? (mvpRow.s === 1 ? redTeamSlug : blueTeamSlug) : "";
              const mvpLaneOpp = mvpRow?.r ? g.p?.find((x) => x.s !== mvpRow.s && x.r === mvpRow.r) : undefined;
              const mvpLaneOppSlug = mvpLaneOpp ? pSlug(mvpLaneOpp.n, mvpLaneOpp.u) : "";
              const mvpOppSlug = mvpLaneOppSlug || mvpOppTeamSlug;
              const mvpQ =
                new URLSearchParams({
                  ...(gamePeriod ? { p: gamePeriod } : s.e ? { p: `e:${s.e}` } : {}),
                  ...(mvpTeamSlug ? { team: mvpTeamSlug } : {}),
                  ...(mvpOppTeamSlug && mvpOppTeamSlug !== mvpTeamSlug ? { vs: mvpOppTeamSlug } : {}),
                  ...(mvpLaneOppSlug && mvpLaneOppSlug !== mvpSlug ? { vsplayer: mvpLaneOppSlug } : {}),
                  ...(mvpOppSlug && mvpOppSlug !== mvpSlug ? { q: mvpOppSlug } : {}),
                  ...(mvpRow?.r ? { role: normalizeRole(mvpRow.r) } : {}),
                  ...(mvpRow?.c ? { champ: resolveChampSlug(mvpRow.c) } : {}),
                  ...(mvpLaneOpp?.c && mvpLaneOpp.c !== mvpRow?.c ? { vschamp: resolveChampSlug(mvpLaneOpp.c) } : {}),
                }).toString() || undefined;
              return (
                <span className="flex items-center gap-1 text-rw-accent">
                  <Crown className="w-3 h-3" />
                  {tl("Player of the Game:")}{" "}
                  <HubLink to={{ kind: "player", slug: mvpSlug, ...(mvpQ ? { query: mvpQ } : {}) }} className="shrink-0 hover:opacity-80" title={g.mvp.n}>
                    <PlayerPhoto name={g.mvp.n} slug={g.mvp.u ?? undefined} size={15} />
                  </HubLink>
                  <PlayerLink name={g.mvp.n} u={g.mvp.u} query={mvpQ} className="text-rw-accent hover:underline font-semibold" />
                </span>
              );
            })()}
            {top && !hidden && (() => {
              const topSlug = pSlug(top[0].n, top[0].u);
              const topTeamSlug = top[0].s === 1 ? blueTeamSlug : redTeamSlug;
              const topOppTeamSlug = top[0].s === 1 ? redTeamSlug : blueTeamSlug;
              const topLaneOpp = top[0].r ? g.p?.find((x) => x.s !== top[0].s && x.r === top[0].r) : undefined;
              const topLaneOppSlug = topLaneOpp ? pSlug(topLaneOpp.n, topLaneOpp.u) : "";
              const topOppSlug = topLaneOppSlug || topOppTeamSlug;
              const topQ =
                new URLSearchParams({
                  ...(gamePeriod ? { p: gamePeriod } : s.e ? { p: `e:${s.e}` } : {}),
                  ...(topTeamSlug ? { team: topTeamSlug } : {}),
                  ...(topOppTeamSlug && topOppTeamSlug !== topTeamSlug ? { vs: topOppTeamSlug } : {}),
                  ...(topLaneOppSlug && topLaneOppSlug !== topSlug ? { vsplayer: topLaneOppSlug } : {}),
                  ...(topOppSlug && topOppSlug !== topSlug ? { q: topOppSlug } : {}),
                  ...(top[0].r ? { role: normalizeRole(top[0].r) } : {}),
                  ...(top[0].c ? { champ: resolveChampSlug(top[0].c) } : {}),
                  ...(topLaneOpp?.c && topLaneOpp.c !== top[0].c ? { vschamp: resolveChampSlug(topLaneOpp.c) } : {}),
                }).toString() || undefined;
              return (
                <span className="flex items-center gap-1 text-rw-teal" title={tl("RiftWise rating: how well they played this game (6 is average)")}>
                  <Star className="w-3 h-3 fill-current" />
                  {tl("Top rated:")}{" "}
                  <HubLink to={{ kind: "player", slug: topSlug, ...(topQ ? { query: topQ } : {}) }} className="shrink-0 hover:opacity-80" title={top[0].n}>
                    <PlayerPhoto name={top[0].n} slug={top[0].u ?? undefined} size={15} />
                  </HubLink>
                  <PlayerLink name={top[0].n} u={top[0].u} query={topQ} className="text-rw-teal hover:underline font-semibold" />
                  <HubLink
                    to={{ kind: "player", slug: topSlug, tab: "stats", ...(topQ ? { query: topQ } : {}) }}
                    className="tabular-nums hover:underline"
                    title={tl("Stats")}
                  >
                    {fmtRating(top[1])}
                  </HubLink>
                </span>
              );
            })()}
          </span>
          <span className="flex flex-wrap items-center gap-2 ml-auto">
            {slugA && slugB && (
              <>
                <HubLink
                  to={{ kind: "prep", a: slugA, b: slugB, period: gamePeriod }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                >
                  {tl("Match prep")}
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: slugA, b: slugB, period: gamePeriod }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                >
                  {tl("Compare")}
                </HubLink>
                <HubLink
                  to={{ kind: "draft", query: seriesGameDraftQuery(s, g) }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-rw-accent hover:underline"
                >
                  <Swords className="w-3.5 h-3.5" />
                  {tl("Draft board")}
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `${blue[0] ? `player=${encodeURIComponent(pSlug(blue[0].n, blue[0].u))}&` : ""}${
                      red[0] && pSlug(red[0].n, red[0].u) !== (blue[0] ? pSlug(blue[0].n, blue[0].u) : "")
                        ? `vsplayer=${encodeURIComponent(pSlug(red[0].n, red[0].u))}&`
                        : ""
                    }team=${encodeURIComponent(blueTeamSlug)}&vs=${encodeURIComponent(redTeamSlug)}${
                      blue[0]?.r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""
                    }${blue[0]?.c ? `&champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}` : ""}${
                      red[0]?.c && red[0].c !== blue[0]?.c
                        ? `&vschamp=${encodeURIComponent(resolveChampSlug(red[0].c))}`
                        : red[1]?.c && red[1].c !== blue[0]?.c
                          ? `&vschamp=${encodeURIComponent(resolveChampSlug(red[1].c))}`
                          : ""
                    }${g.patch ? `&patch=${encodeURIComponent(g.patch)}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${gameYear ? `&year=${encodeURIComponent(gameYear)}` : ""}`,
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                >
                  {tl("Game finder")}
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      q: [
                        slugA,
                        slugB,
                        blue[0] ? pSlug(blue[0].n, blue[0].u) : "",
                        red[0] && pSlug(red[0].n, red[0].u) !== (blue[0] ? pSlug(blue[0].n, blue[0].u) : "")
                          ? pSlug(red[0].n, red[0].u)
                          : "",
                      ]
                        .filter(Boolean)
                        .join(","),
                      ...(blue[0]?.r ? { role: normalizeRole(blue[0].r) } : {}),
                      ...(blue[0]?.c ? { champ: resolveChampSlug(blue[0].c) } : {}),
                      ...(s.e ? { event: s.e } : {}),
                      ...(gameYear ? { year: gameYear } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")}
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...((blue[0]?.c || red[0]?.c) || g.patch || gamePeriod || s.e || blue[0]?.r
                      ? {
                          query: new URLSearchParams({
                            ...(blue[0]?.c || red[0]?.c
                              ? {
                                  q: [
                                    blue[0]?.c ? resolveChampSlug(blue[0].c) : "",
                                    red[0]?.c && red[0]?.c !== blue[0]?.c ? resolveChampSlug(red[0].c) : "",
                                  ]
                                    .filter(Boolean)
                                    .join(","),
                                }
                              : {}),
                            ...(blue[0]?.r ? { role: normalizeRole(blue[0].r) } : {}),
                            ...(g.patch ? { key: `p${g.patch}`, patch: g.patch } : gamePeriod ? { key: gamePeriod } : {}),
                            ...(gameYear ? { year: gameYear } : {}),
                            ...(s.e ? { event: s.e } : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")}
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query: `q=${encodeURIComponent(
                      [
                        slugA,
                        slugB,
                        blue[0] ? pSlug(blue[0].n, blue[0].u) : "",
                        red[0] && pSlug(red[0].n, red[0].u) !== (blue[0] ? pSlug(blue[0].n, blue[0].u) : "")
                          ? pSlug(red[0].n, red[0].u)
                          : "",
                      ]
                        .filter(Boolean)
                        .join(","),
                    )}`,
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                >
                  {tl("Power rankings")}
                </HubLink>
                {blue[0]?.c && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: `champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}${
                        red[0]?.c && red[0].c !== blue[0].c
                          ? `&vs=${encodeURIComponent(resolveChampSlug(red[0].c))}`
                          : red[1]?.c && red[1].c !== blue[0].c
                            ? `&vs=${encodeURIComponent(resolveChampSlug(red[1].c))}`
                            : ""
                      }${blue[0] ? `&player=${encodeURIComponent(pSlug(blue[0].n, blue[0].u))}` : ""}${red[0] && pSlug(red[0].n, red[0].u) !== (blue[0] ? pSlug(blue[0].n, blue[0].u) : "") ? `&vsplayer=${encodeURIComponent(pSlug(red[0].n, red[0].u))}` : ""}&team=${encodeURIComponent(blueTeamSlug)}&vsteam=${encodeURIComponent(redTeamSlug)}${blue[0].r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${g.patch ? `&patch=${encodeURIComponent(g.patch)}` : gameYear ? `&patch=y${encodeURIComponent(gameYear)}&year=${encodeURIComponent(gameYear)}` : ""}`,
                    }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                  >
                    {tl("Counters")}
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "items",
                    query: `${blue[0] ? `player=${encodeURIComponent(pSlug(blue[0].n, blue[0].u))}&` : ""}${
                      red[0] && pSlug(red[0].n, red[0].u) !== (blue[0] ? pSlug(blue[0].n, blue[0].u) : "")
                        ? `vsplayer=${encodeURIComponent(pSlug(red[0].n, red[0].u))}&`
                        : ""
                    }team=${encodeURIComponent(blueTeamSlug)}&vs=${encodeURIComponent(redTeamSlug)}${
                      blue[0]?.r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""
                    }${blue[0]?.c ? `&champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}` : ""}${
                      red[0]?.c && red[0].c !== blue[0]?.c
                        ? `&vschamp=${encodeURIComponent(resolveChampSlug(red[0].c))}`
                        : red[1]?.c && red[1].c !== blue[0]?.c
                          ? `&vschamp=${encodeURIComponent(resolveChampSlug(red[1].c))}`
                          : ""
                    }${g.patch ? `&patch=${encodeURIComponent(g.patch)}` : ""}${s.e ? `&event=${encodeURIComponent(s.e)}` : ""}${gameYear ? `&year=${encodeURIComponent(gameYear)}` : ""}`,
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                >
                  {tl("Item history")}
                </HubLink>
              </>
            )}
            {!hidden && g.t && (
              <BroadcastCardButton data={() => gameCardData(s, g)} name={`${s.a.n}-vs-${s.b.n}-game-${g.n}`} label={tl("Game card")} />
            )}
          </span>
          {(g.vod || g.vpb || g.vgs) && (
            <span className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  [g.vpb, tl("Watch the draft")],
                  [g.vgs, tl("Watch from game start")],
                  [g.vod, g.vpb || g.vgs ? tl("Full VOD") : tl("Watch this game")],
                ] as [string | undefined, string][]
              )
                .filter(([url]) => !!url)
                .map(([url, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onOpenUrl(url!)}
                    className="flex items-center gap-1 px-2.5 py-1.5 min-h-8 rounded-md bg-rw-red/15 border border-rw-red/50 text-rw-text hover:bg-rw-red/25 font-semibold"
                  >
                    <PlayCircle className="w-3.5 h-3.5 text-rw-red" />
                    {label}
                  </button>
                ))}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* spoiler mode: the draft only (kills, gold and objectives give the result away) */}
          <SideHeader name={blueTeam.n} u={blueTeamSlug} oppU={redTeamSlug} p0={blue[0]} oppP0={red[0]} side="blue" won={!hidden && blueWon} st={hidden ? undefined : g.t?.blue} period={gamePeriod} eventSlug={s.e} patch={g.patch} />
          <SideHeader name={redTeam.n} u={redTeamSlug} oppU={blueTeamSlug} p0={red[0]} oppP0={blue[0]} side="red" won={!hidden && redWon} st={hidden ? undefined : g.t?.red} right period={gamePeriod} eventSlug={s.e} patch={g.patch} />
        </div>
        {(g.t?.blue?.picks?.length || g.t?.blue?.bans?.length) && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-rw-border">
            <Draft st={g.t?.blue} side="blue" teamSlug={blueTeamSlug} oppSlug={redTeamSlug} p0={blue[0]} period={gamePeriod} eventSlug={s.e} />
            <Draft st={g.t?.red} side="red" right teamSlug={redTeamSlug} oppSlug={blueTeamSlug} p0={red[0]} period={gamePeriod} eventSlug={s.e} />
          </div>
        )}
        {!hidden && blue.length === 5 && red.length === 5 && (
          <GameRoleMatchups blue={blue} red={red} blueU={blueTeamSlug} redU={redTeamSlug} period={gamePeriod || (s.e ? `e:${s.e}` : undefined)} />
        )}
      </div>

      {hidden && (blue.length > 0 || red.length > 0) && (
        <div className={`${card} py-4 text-center space-y-2`}>
          <p className="text-[11px] text-rw-muted">{tl("Player stats are hidden while spoiler mode is on.")}</p>
          <RevealButton onReveal={onReveal} />
        </div>
      )}
      {!hidden && (blue.length > 0 || red.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Scoreboard name={blueTeam.n} u={sideSlug(blueTeam)} oppU={sideSlug(redTeam)} side="blue" players={blue} oppPlayers={red} hidden={hidden} won={blueWon} minutes={g.min} ratings={ratings} top={top?.[0]} period={gamePeriod} eventSlug={s.e} patch={g.patch} />
          <Scoreboard name={redTeam.n} u={sideSlug(redTeam)} oppU={sideSlug(blueTeam)} side="red" players={red} oppPlayers={blue} hidden={hidden} won={redWon} minutes={g.min} ratings={ratings} top={top?.[0]} period={gamePeriod} eventSlug={s.e} patch={g.patch} />
        </div>
      )}
      {!hidden && <Leads g={g} blueName={blueTeam.n} redName={redTeam.n} blueU={sideSlug(blueTeam)} redU={sideSlug(redTeam)} blue={blue} red={red} period={gamePeriod} eventSlug={s.e} />}
      {!hidden && <PlayerBars g={g} blueName={blueTeam.n} redName={redTeam.n} blueU={sideSlug(blueTeam)} redU={sideSlug(redTeam)} blue={blue} red={red} minutes={g.min ?? undefined} ratings={ratings} period={gamePeriod} eventSlug={s.e} />}
      {g.st !== "f" && !g.p && (
        <p className="text-[11px] text-rw-muted text-center">
          {g.st === "r" ? tl("Only the result of this game is known.") : tl("No result or stats were recorded for this game.")}
        </p>
      )}
    </div>
  );
};

// ── Early-game leads (Oracle's Elixir): the team's gold and XP lead at 10 / 15 / 20 minutes and each lane at 15 ──

const BLUE = "#4a9eff";
const RED = "var(--rw-red)";
const kfmt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v) >= 1000 ? `${fmtDec(Math.abs(v) / 1000)}k` : Math.abs(v)}`;

/** One row: a bar from the middle toward the side that leads (blue left, red right), its size against `max`. The row's
 *  label (the minute, the lane) sits on its own line above the bar, so it never lands on the bar or its number. */
const LeadBar: React.FC<{ label: React.ReactNode; left?: React.ReactNode; right?: React.ReactNode; v: number; max: number; tip: string }> = ({
  label,
  left,
  right,
  v,
  max,
  tip,
}) => {
  const w = max ? Math.min(50, (Math.abs(v) / max) * 50) : 0;
  const blueAhead = v > 0;
  // a long bar carries its number inside, so the number never runs into the names beside the chart
  const inside = w > 30;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-end gap-2 text-[11px]" title={tip}>
      <span className="truncate text-right text-rw-sub leading-5">{left}</span>
      <div>
        <div className="text-center text-[9px] leading-3 text-rw-muted truncate">{label}</div>
        <div className="relative h-5">
          <div className="absolute inset-y-0 left-1/2 w-px bg-rw-line" />
          {v !== 0 && (
            <div
              className="absolute top-1 bottom-1"
              style={{
                background: blueAhead ? BLUE : RED,
                width: `${w}%`,
                ...(blueAhead ? { right: "50%", borderRadius: "4px 0 0 4px" } : { left: "50%", borderRadius: "0 4px 4px 0" }),
              }}
            />
          )}
          <span
            className={`absolute inset-y-0 flex items-center tabular-nums font-semibold ${inside ? "text-white" : "text-rw-text"}`}
            style={inside ? (blueAhead ? { right: "calc(50% + 6px)" } : { left: "calc(50% + 6px)" }) : blueAhead ? { right: `calc(50% + ${w}% + 4px)` } : { left: `calc(50% + ${w}% + 4px)` }}
          >
            {v === 0 ? "0" : kfmt(Math.abs(v))}
          </span>
        </div>
      </div>
      <span className="truncate text-rw-sub leading-5">{right}</span>
    </div>
  );
};

const ROLE_ORDER = ["Top", "Jungle", "Mid", "Bot", "Support"];

/** Copy a ready-to-post series recap with game-by-game winners/MVPs and canonical link for X or Discord. */
const CopySeriesPost: React.FC<{ s: HubSeries; slug: string }> = ({ s, slug }) => {
  const [state, setState] = useState<"" | "copied" | "failed">("");
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(""), 2200);
    return () => clearTimeout(t);
  }, [state]);
  const text = () => {
    const lines = [
      `${s.a.n} ${s.sa}–${s.sb} ${s.b.n} — ${s.en}${s.stage ? ` (${stageLabel(s.stage)})` : ""}`,
    ];
    const gameSummaries = s.games
      .filter((g) => g.w)
      .map((g) => {
        const wCode = g.w === 1 ? s.a.c || s.a.n : s.b.c || s.b.n;
        const dur = g.min != null ? ` (${fmtMin(g.min)}${g.mvp ? ` · ${g.mvp.n}` : ""})` : g.mvp ? ` (${g.mvp.n})` : "";
        return `${tc("short game", "G{n}", { n: g.n })}: ${wCode}${dur}`;
      });
    if (gameSummaries.length) lines.push(gameSummaries.join(" · "));
    lines.push(hubShareUrl({ kind: "match", slug }));
    return lines.join("\n");
  };
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text()).then(() => setState("copied"), () => setState("failed"))}
      className={heroBtn()}
      title={`${tl("Copy post")}: ${tl("Copy a ready-to-post summary with the link, for X or Discord")}`}
      aria-label={tl("Copy post")}
    >
      <ClipboardCopy className="w-3.5 h-3.5 inline mr-1" />
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

/** 5-role 1v1 lane strip inside a game card, linking each lane matchup directly to /stats/compare. */
const GameRoleMatchups: React.FC<{ blue: GamePlayer[]; red: GamePlayer[]; blueU?: string | null; redU?: string | null; period?: string }> = ({ blue, red, blueU, redU, period }) => {
  const pairs = ROLE_ORDER.map((r, i) => {
    const b = blue.find((p) => p.r === r) || blue[i];
    const rd = red.find((p) => p.r === r) || red[i];
    return { role: r, b, r: rd };
  }).filter((x) => x.b && x.r);
  if (pairs.length < 5) return null;
  return (
    <div className="pt-2 border-t border-rw-border">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
        {pairs.map(({ role, b, r }) => {
          const gd15 = b.g15;
          const bSlug = pSlug(b.n, b.u);
          const rSlug = pSlug(r.n, r.u);
          const cmpQuery =
            new URLSearchParams({
              ...(blueU ? { team: blueU } : {}),
              ...(redU && redU !== blueU ? { vs: redU } : {}),
              ...(role ? { role: normalizeRole(role) } : {}),
              ...(b.c ? { champ: resolveChampSlug(b.c) } : {}),
              ...(r.c && r.c !== b.c ? { vschamp: resolveChampSlug(r.c) } : {}),
            }).toString() || undefined;
          const inner = (
            <>
              <div className="flex items-center justify-between text-[9px] uppercase tracking-wider font-bold text-rw-muted">
                <span>{roleName(role)}</span>
                {gd15 != null && gd15 !== 0 ? (
                  <span className={`font-mono tabular-nums ${gd15 > 0 ? "text-rw-side-a" : "text-rw-side-b"}`}>
                    {gd15 > 0 ? `+${gd15}` : gd15}@15
                  </span>
                ) : (
                  bSlug && rSlug && <span className="text-rw-accent">{tl("Compare")} →</span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-1 min-w-0">
                <span className="inline-flex items-center gap-1 min-w-0 truncate text-rw-side-a font-semibold">
                  {b.c && <ChampIcon name={b.c} size={15} />}
                  <PlayerPhoto name={b.n} slug={b.u ?? undefined} size={14} linkFallback={false} />
                  <span className="truncate">{b.n}</span>
                </span>
                <span className="text-[9px] text-rw-muted shrink-0">vs</span>
                <span className="inline-flex items-center gap-1 min-w-0 truncate text-rw-side-b font-semibold justify-end">
                  <span className="truncate">{r.n}</span>
                  <PlayerPhoto name={r.n} slug={r.u ?? undefined} size={14} linkFallback={false} />
                  {r.c && <ChampIcon name={r.c} size={15} />}
                </span>
              </div>
              {(b.k != null || r.k != null) && (
                <div className="mt-0.5 flex items-center justify-between text-[9px] font-mono tabular-nums text-rw-sub">
                  <span>{b.k ?? 0}/{b.d ?? 0}/{b.a ?? 0}</span>
                  {bSlug && rSlug && gd15 != null && gd15 !== 0 && <span className="text-rw-accent font-sans font-bold">{tl("Compare")} →</span>}
                  <span>{r.k ?? 0}/{r.d ?? 0}/{r.a ?? 0}</span>
                </div>
              )}
            </>
          );
          return bSlug && rSlug ? (
            <HubLink
              key={role}
              to={{ kind: "compare", mode: "player", a: bSlug, b: rSlug, period, ...(cmpQuery ? { query: cmpQuery } : {}) }}
              className="rounded-lg border border-rw-border bg-rw-bg/50 px-2 py-1.5 hover:border-rw-accent/60 hover:bg-rw-raised/60 transition-colors"
              title={`${b.n} vs ${r.n} · ${tl("Compare")}`}
            >
              {inner}
            </HubLink>
          ) : (
            <div key={role} className="rounded-lg border border-rw-border bg-rw-bg/40 px-2 py-1.5">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
};

type BarMetric = "dm" | "gd" | "rt" | "kp" | "cs" | "v";

/**
 * Each lane's two players side by side for one number from the scoreboard (damage to champions, gold, rating, K+A, CS, vision):
 * blue's bar grows left, red's right, all on one scale, plus a team-wide macro tug-of-war strip.
 */
const PlayerBars: React.FC<{
  g: HubGame;
  blueName: string;
  redName: string;
  blueU?: string | null;
  redU?: string | null;
  blue: GamePlayer[];
  red: GamePlayer[];
  minutes?: number;
  ratings?: Map<GamePlayer, number>;
  period?: string;
  eventSlug?: string;
}> = ({ g, blueName, redName, blueU, redU, blue, red, minutes, ratings, period, eventSlug }) => {
  const [metric, setMetric] = useState<BarMetric>("dm");
  const getVal = (p: GamePlayer, k: BarMetric): number | undefined => {
    if (k === "rt") return ratings?.get(p);
    if (k === "kp") return p.k + p.a;
    return p[k];
  };
  const metrics: [BarMetric, string][] = [
    ["dm", tl("Damage")],
    ["gd", tl("Gold")],
    ["rt", tl("Rating")],
    ["kp", "K + A"],
    ["cs", "CS"],
    ["v", tl("Vision")],
  ];
  const have = metrics.filter(([k]) => [...blue, ...red].some((p) => getVal(p, k) != null));
  const m = have.some(([k]) => k === metric) ? metric : have[0]?.[0];
  if (!m || blue.length !== 5 || red.length !== 5) return null;
  const rows = ROLE_ORDER.map((r, i) => ({ r, b: blue.find((p) => p.r === r) || blue[i], o: red.find((p) => p.r === r) || red[i] }));
  const max = Math.max(1, ...rows.flatMap((x) => [getVal(x.b, m) || 0, getVal(x.o, m) || 0]));
  const total = (list: GamePlayer[]) =>
    m === "rt"
      ? list.reduce((t, p) => t + (getVal(p, m) || 0), 0) / Math.max(1, list.filter((p) => getVal(p, m) != null).length)
      : list.reduce((t, p) => t + (getVal(p, m) || 0), 0);
  const fmt = (v: number | undefined) =>
    v == null ? "–" : m === "dm" || m === "gd" ? fmtGold(v) : m === "rt" ? fmtRating(v) : String(Math.round(v));
  const perMin = (v: number | undefined) =>
    v != null && minutes && (m === "dm" || m === "gd" || m === "cs" || m === "v")
      ? m === "cs" || m === "v"
        ? fmtDec(v / minutes)
        : Math.round(v / minutes)
      : null;

  // Team Macro Tug-of-War summary items
  const bSt = g.t?.blue;
  const rSt = g.t?.red;
  const bDmg = blue.reduce((s, p) => s + (p.dm || 0), 0);
  const rDmg = red.reduce((s, p) => s + (p.dm || 0), 0);
  const bGold = bSt?.gold ?? blue.reduce((s, p) => s + (p.gd || 0), 0);
  const rGold = rSt?.gold ?? red.reduce((s, p) => s + (p.gd || 0), 0);
  const bKills = bSt?.k ?? blue.reduce((s, p) => s + p.k, 0);
  const rKills = rSt?.k ?? red.reduce((s, p) => s + p.k, 0);
  const macroItems = (
    [
      bKills + rKills > 0 ? { label: tl("Kills"), b: bKills, r: rKills, fmt: (x: number) => String(x) } : null,
      bGold + rGold > 0 ? { label: tl("Gold"), b: bGold, r: rGold, fmt: (x: number) => fmtGold(x) } : null,
      bDmg + rDmg > 0 ? { label: tl("Damage"), b: bDmg, r: rDmg, fmt: (x: number) => fmtGold(x) } : null,
      bSt?.towers != null && rSt?.towers != null ? { label: tl("Towers"), b: bSt.towers, r: rSt.towers, fmt: (x: number) => String(x) } : null,
      bSt?.drag != null && rSt?.drag != null ? { label: tl("Dragons"), b: bSt.drag, r: rSt.drag, fmt: (x: number) => String(x) } : null,
    ].filter(Boolean) as { label: string; b: number; r: number; fmt: (x: number) => string }[]
  );

  const pCtxQ = (p: GamePlayer, tU?: string | null, oppP?: GamePlayer, oppTU?: string | null) => {
    const pS = pSlug(p.n, p.u);
    const oS = oppP ? pSlug(oppP.n, oppP.u) : "";
    return (
      new URLSearchParams({
        ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
        ...(tU ? { team: tU } : {}),
        ...(oppTU && oppTU !== tU ? { vs: oppTU } : {}),
        ...(oS && oS !== pS ? { vsplayer: oS, q: oS } : oppTU && oppTU !== tU ? { q: oppTU } : {}),
        ...(p.r ? { role: normalizeRole(p.r) } : {}),
        ...(p.c ? { champ: resolveChampSlug(p.c) } : {}),
        ...(oppP?.c && oppP.c !== p.c ? { vschamp: resolveChampSlug(oppP.c) } : {}),
      }).toString() || undefined
    );
  };
  const side = (p: GamePlayer, right: boolean, oppP?: GamePlayer) => {
    const v = getVal(p, m);
    const w = v ? (v / max) * 100 : 0;
    const pS = pSlug(p.n, p.u);
    const sQ = pCtxQ(p, right ? redU : blueU, oppP, right ? blueU : redU);
    return (
      <div className={`flex items-center gap-2 min-w-0 ${right ? "" : "flex-row-reverse"}`}>
        {pS ? (
          <HubLink
            to={{ kind: "player", slug: pS, tab: "stats", ...(sQ ? { query: sQ } : {}) }}
            className={`text-[11px] tabular-nums font-semibold text-rw-text hover:text-rw-accent hover:underline w-11 shrink-0 ${right ? "" : "text-right"}`}
            title={tl("Stats")}
          >
            {fmt(v)}
          </HubLink>
        ) : (
          <span className={`text-[11px] tabular-nums font-semibold text-rw-text w-11 shrink-0 ${right ? "" : "text-right"}`}>{fmt(v)}</span>
        )}
        <div className={`flex-1 h-3 flex ${right ? "" : "justify-end"}`}>
          <div className={right ? "rounded-r" : "rounded-l"} style={{ width: `${w}%`, background: right ? RED : BLUE }} />
        </div>
      </div>
    );
  };
  const b0S = blue[0] ? pSlug(blue[0].n, blue[0].u) : "";
  const r0S = red[0] ? pSlug(red[0].n, red[0].u) : "";
  return (
    <Section
      title={tl("Player by player")}
      share={`game-${g.n}-bars`}
      right={
        <div className="flex flex-wrap items-center gap-2" data-nocapture="1">
          <div className="flex flex-wrap gap-1" role="group" aria-label={tl("Show")}>
            {have.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMetric(k)}
                aria-pressed={m === k}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  m === k ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {blueU && redU && (
            <>
              <HubLink
                to={{ kind: "prep", a: blueU, b: redU, period }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(blueU)},${encodeURIComponent(redU)}${
                    blue[0]?.c || red[0]?.c
                      ? `&champ=${encodeURIComponent(
                          [
                            blue[0]?.c ? resolveChampSlug(blue[0].c) : "",
                            red[0]?.c && red[0].c !== blue[0]?.c ? resolveChampSlug(red[0].c) : "",
                          ]
                            .filter(Boolean)
                            .join(","),
                        )}`
                      : ""
                  }${blue[0]?.r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""}${period ? `&p=${encodeURIComponent(period)}` : eventSlug ? `&p=${encodeURIComponent(`e:${eventSlug}`)}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "compare", mode: "team", a: blueU, b: redU, period }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              {blue[0]?.c && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}${
                      red[0]?.c && red[0].c !== blue[0].c ? `&vs=${encodeURIComponent(resolveChampSlug(red[0].c))}` : ""
                    }${b0S ? `&player=${encodeURIComponent(b0S)}` : ""}${r0S && r0S !== b0S ? `&vsplayer=${encodeURIComponent(r0S)}` : ""}&team=${encodeURIComponent(blueU)}&vsteam=${encodeURIComponent(redU)}${blue[0].r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${
                      g.patch ? `&patch=${encodeURIComponent(g.patch)}` : period && /^y\d{4}$/.test(period) ? `&patch=${encodeURIComponent(period)}&year=${encodeURIComponent(period.slice(1))}` : ""
                    }`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "items",
                  query: `${b0S ? `player=${encodeURIComponent(b0S)}&` : ""}${
                    r0S && r0S !== b0S ? `vsplayer=${encodeURIComponent(r0S)}&` : ""
                  }team=${encodeURIComponent(blueU)}&vs=${encodeURIComponent(redU)}${
                    blue[0]?.r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""
                  }${
                    blue[0]?.c ? `&champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}` : ""
                  }${
                    red[0]?.c && red[0].c !== blue[0]?.c ? `&vschamp=${encodeURIComponent(resolveChampSlug(red[0].c))}` : ""
                  }${g.patch ? `&patch=${encodeURIComponent(g.patch)}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${
                    period && /^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : ""
                  }`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `${b0S ? `player=${encodeURIComponent(b0S)}&` : ""}${
                    r0S && r0S !== b0S ? `vsplayer=${encodeURIComponent(r0S)}&` : ""
                  }team=${encodeURIComponent(blueU)}&vs=${encodeURIComponent(redU)}${
                    blue[0]?.r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""
                  }${
                    blue[0]?.c ? `&champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}` : ""
                  }${
                    red[0]?.c && red[0].c !== blue[0]?.c ? `&vschamp=${encodeURIComponent(resolveChampSlug(red[0].c))}` : ""
                  }${g.patch ? `&patch=${encodeURIComponent(g.patch)}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${period && /^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    q: [blueU, redU, b0S, r0S && r0S !== b0S ? r0S : ""].filter(Boolean).join(","),
                    ...(blue[0]?.r ? { role: normalizeRole(blue[0].r) } : {}),
                    ...(blue[0]?.c ? { champ: resolveChampSlug(blue[0].c) } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(period && /^y\d{4}$/.test(period) ? { year: period.slice(1) } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  ...(() => {
                    const qChamps = [blue[0]?.c, red[0]?.c && red[0]?.c !== blue[0]?.c ? red[0].c : ""].filter(Boolean).map((c) => resolveChampSlug(c!)).join(",");
                    const key = g.patch ? `p${g.patch}` : period && /^y\d{4}$/.test(period) ? period : "";
                    const yr = period && /^y\d{4}$/.test(period) ? period.slice(1) : "";
                    return qChamps || key || eventSlug || blue[0]?.r
                      ? {
                          query: new URLSearchParams({
                            ...(qChamps ? { q: qChamps } : {}),
                            ...(blue[0]?.r ? { role: normalizeRole(blue[0].r) } : {}),
                            ...(key ? { key } : {}),
                            ...(g.patch ? { patch: g.patch } : {}),
                            ...(yr ? { year: yr } : {}),
                            ...(eventSlug ? { event: eventSlug } : {}),
                          }).toString(),
                        }
                      : {};
                  })(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  query: `q=${encodeURIComponent([blueU, redU, b0S, r0S && r0S !== b0S ? r0S : ""].filter(Boolean).join(","))}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
            </>
          )}
          <SectionCard
            section={`${tl("Player by player")} · ${have.find(([k]) => k === m)?.[1] || ""}`}
            name={`${blueName} vs ${redName}`}
            sub={`${fmt(total(blue))} vs ${fmt(total(red))}`}
            rows={() =>
              rows.map(({ r, b, o }, idx) => ({
                rank: idx + 1,
                champ: (getVal(b, m) || 0) >= (getVal(o, m) || 0) ? b.c : o.c,
                team: (getVal(b, m) || 0) >= (getVal(o, m) || 0) ? blueName : redName,
                label: `${roleName(r)} · ${b.n} vs ${o.n}`,
                sub: [b.c && champName(b.c), o.c && champName(o.c)].filter(Boolean).join(" vs "),
                value: `${fmt(getVal(b, m))} – ${fmt(getVal(o, m))}`,
                win: (getVal(b, m) || 0) >= (getVal(o, m) || 0),
              }))
            }
          />
        </div>
      }
    >
      <div className="space-y-2.5">
        {/* Team Macro Tug-of-War Summary Strip */}
        {macroItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pb-2 border-b border-rw-border/70">
            {macroItems.map((it) => {
              const sum = it.b + it.r;
              const bPct = sum > 0 ? Math.round((it.b / sum) * 100) : 50;
              return (
                <div key={it.label} className="rounded-lg border border-rw-border/70 bg-rw-bg/40 px-2.5 py-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                    {blueU ? (
                      <HubLink
                        to={{
                          kind: "team",
                          slug: blueU,
                          tab: "stats",
                          query:
                            new URLSearchParams({
                              ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                              ...(redU && redU !== blueU ? { q: redU } : {}),
                              ...(b0S ? { player: b0S } : {}),
                              ...(blue[0]?.c ? { champ: resolveChampSlug(blue[0].c) } : {}),
                            }).toString() || undefined,
                        }}
                        className="font-bold hover:underline"
                        style={{ color: BLUE }}
                      >
                        {it.fmt(it.b)}
                      </HubLink>
                    ) : (
                      <span className="font-bold" style={{ color: BLUE }}>
                        {it.fmt(it.b)}
                      </span>
                    )}
                    {blueU && redU ? (
                      <HubLink
                        to={{ kind: "compare", mode: "team", a: blueU, b: redU, period }}
                        className="font-sans text-[9px] font-bold uppercase tracking-wider text-rw-muted hover:text-rw-accent hover:underline"
                      >
                        {it.label}
                      </HubLink>
                    ) : (
                      <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-rw-muted">{it.label}</span>
                    )}
                    {redU ? (
                      <HubLink
                        to={{
                          kind: "team",
                          slug: redU,
                          tab: "stats",
                          query:
                            new URLSearchParams({
                              ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                              ...(blueU && blueU !== redU ? { q: blueU } : {}),
                              ...(r0S ? { player: r0S } : {}),
                              ...(red[0]?.c ? { champ: resolveChampSlug(red[0].c) } : {}),
                            }).toString() || undefined,
                        }}
                        className="font-bold hover:underline"
                        style={{ color: RED }}
                      >
                        {it.fmt(it.r)}
                      </HubLink>
                    ) : (
                      <span className="font-bold" style={{ color: RED }}>
                        {it.fmt(it.r)}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden flex bg-rw-raised">
                    <div style={{ width: `${bPct}%`, background: BLUE }} />
                    <div style={{ width: `${100 - bPct}%`, background: RED }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 text-[10px] uppercase tracking-wider font-bold">
          <span className="truncate text-right" style={{ color: BLUE }}>
            <TeamLink
              name={blueName}
              u={blueU}
              query={
                new URLSearchParams({
                  ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                  ...(redU && redU !== blueU ? { q: redU } : {}),
                  ...(b0S ? { player: b0S } : {}),
                  ...(blue[0]?.c ? { champ: resolveChampSlug(blue[0].c) } : {}),
                }).toString() || undefined
              }
              className="hover:underline"
            />{" "}
            · {fmt(total(blue))}
          </span>
          <span />
          <span className="truncate" style={{ color: RED }}>
            <TeamLink
              name={redName}
              u={redU}
              query={
                new URLSearchParams({
                  ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                  ...(blueU && blueU !== redU ? { q: blueU } : {}),
                  ...(r0S ? { player: r0S } : {}),
                  ...(red[0]?.c ? { champ: resolveChampSlug(red[0].c) } : {}),
                }).toString() || undefined
              }
              className="hover:underline"
            />{" "}
            · {fmt(total(red))}
          </span>
        </div>
        {rows.map(({ r, b, o }) => {
          const bv = getVal(b, m);
          const ov = getVal(o, m);
          const duelSum = (bv || 0) + (ov || 0);
          const bShare = duelSum > 0 ? Math.round(((bv || 0) / duelSum) * 100) : 50;
          const bPSlug = pSlug(b.n, b.u);
          const oPSlug = pSlug(o.n, o.u);
          const rowCmpQ =
            new URLSearchParams({
              ...(blueU ? { team: blueU } : {}),
              ...(redU && redU !== blueU ? { vs: redU } : {}),
              ...(r ? { role: normalizeRole(r) } : {}),
              ...(b.c ? { champ: resolveChampSlug(b.c) } : {}),
              ...(o.c && o.c !== b.c ? { vschamp: resolveChampSlug(o.c) } : {}),
            }).toString() || undefined;
          return (
            <div
              key={r}
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3"
              title={`${roleName(r)}: ${b.n} ${fmt(bv)}${perMin(bv) != null ? ` (${perMin(bv)}/min)` : ""} · ${o.n} ${fmt(ov)}${
                perMin(ov) != null ? ` (${perMin(ov)}/min)` : ""
              }`}
            >
              <div className="min-w-0">
                <div className="text-[10px] text-rw-sub truncate text-right inline-flex items-center justify-end gap-1 w-full">
                  {b.c && (
                    <HubLink
                      to={{
                        kind: "champ",
                        slug: resolveChampSlug(b.c),
                        query: new URLSearchParams({
                          ...(blueU ? { team: blueU } : {}),
                          ...(redU && redU !== blueU ? { vs: redU } : {}),
                          ...(r ? { role: normalizeRole(r) } : {}),
                          ...(bPSlug ? { player: bPSlug } : {}),
                          ...(oPSlug && oPSlug !== bPSlug ? { vsplayer: oPSlug } : {}),
                          ...(o.c && o.c !== b.c ? { vschamp: resolveChampSlug(o.c) } : {}),
                          ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                          ...(g.patch ? { patch: g.patch } : {}),
                        }).toString(),
                      }}
                      className="shrink-0 hover:opacity-80"
                      title={champName(b.c)}
                    >
                      <ChampIcon name={b.c} size={14} />
                    </HubLink>
                  )}
                  <PlayerLink name={b.n} u={b.u} query={pCtxQ(b, blueU, o, redU)} className="truncate hover:text-rw-accent hover:underline" />
                </div>
                {side(b, false, o)}
              </div>
              <div className="flex flex-col items-center w-14 shrink-0">
                {bPSlug && oPSlug ? (
                  <HubLink
                    to={{ kind: "compare", mode: "player", a: bPSlug, b: oPSlug, period, ...(rowCmpQ ? { query: rowCmpQ } : {}) }}
                    className="text-[9px] text-rw-muted hover:text-rw-accent hover:underline text-center"
                    title={`${tl("Compare")}: ${b.n} vs ${o.n}`}
                  >
                    {roleName(r)}
                  </HubLink>
                ) : (
                  <span className="text-[9px] text-rw-muted text-center">{roleName(r)}</span>
                )}
                <div className="mt-0.5 w-full h-1 rounded-full overflow-hidden flex bg-rw-raised">
                  <div style={{ width: `${bShare}%`, background: BLUE }} />
                  <div style={{ width: `${100 - bShare}%`, background: RED }} />
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-rw-sub truncate inline-flex items-center gap-1 w-full">
                  <PlayerLink name={o.n} u={o.u} query={pCtxQ(o, redU, b, blueU)} className="truncate hover:text-rw-accent hover:underline" />
                  {o.c && (
                    <HubLink
                      to={{
                        kind: "champ",
                        slug: resolveChampSlug(o.c),
                        query: new URLSearchParams({
                          ...(redU ? { team: redU } : {}),
                          ...(blueU && blueU !== redU ? { vs: blueU } : {}),
                          ...(r ? { role: normalizeRole(r) } : {}),
                          ...(oPSlug ? { player: oPSlug } : {}),
                          ...(bPSlug && bPSlug !== oPSlug ? { vsplayer: bPSlug } : {}),
                          ...(b.c && b.c !== o.c ? { vschamp: resolveChampSlug(b.c) } : {}),
                          ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                          ...(g.patch ? { patch: g.patch } : {}),
                        }).toString(),
                      }}
                      className="shrink-0 hover:opacity-80"
                      title={champName(o.c)}
                    >
                      <ChampIcon name={o.c} size={14} />
                    </HubLink>
                  )}
                </div>
                {side(o, true, b)}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
};

const Leads: React.FC<{ g: HubGame; blueName: string; redName: string; blueU?: string | null; redU?: string | null; blue: GamePlayer[]; red: GamePlayer[]; period?: string; eventSlug?: string }> = ({ g, blueName, redName, blueU, redU, blue, red, period, eventSlug }) => {
  const t = g.t?.blue;
  const pQuery = period ? `p=${encodeURIComponent(period)}` : eventSlug ? `p=${encodeURIComponent(`e:${eventSlug}`)}` : undefined;
  // the team's XP lead: its five players' leads over their lane opponents add up to it
  const xpAt = (key: "x10" | "x15" | "x20") => (blue.length === 5 && blue.every((p) => p[key] != null) ? blue.reduce((s, p) => s + (p[key] as number), 0) : null);
  const gold = ([[10, t?.g10], [15, t?.g15], [20, t?.g20]] as [number, number | undefined][]).filter((x): x is [number, number] => x[1] != null);
  const xp = ([[10, xpAt("x10")], [15, t?.x15 ?? xpAt("x15")], [20, xpAt("x20")]] as [number, number | null | undefined][]).filter(
    (x): x is [number, number] => x[1] != null,
  );
  const lanes = ROLE_ORDER.map((r) => ({ r, b: blue.find((p) => p.r === r), o: red.find((p) => p.r === r) })).filter((x) => x.b?.g15 != null && x.o);
  if (!gold.length && !lanes.length) return null;
  const maxGold = Math.max(1000, ...gold.map((x) => Math.abs(x[1])));
  const maxXp = Math.max(1000, ...xp.map((x) => Math.abs(x[1])));
  const maxLane = Math.max(500, ...lanes.map((x) => Math.abs(x.b!.g15 as number)));
  const b0S = blue[0] ? pSlug(blue[0].n, blue[0].u) : "";
  const r0S = red[0] ? pSlug(red[0].n, red[0].u) : "";
  const lb0S = lanes[0]?.b ? pSlug(lanes[0].b.n, lanes[0].b.u) : "";
  const lo0S = lanes[0]?.o ? pSlug(lanes[0].o.n, lanes[0].o.u) : "";
  const headBlueQ =
    new URLSearchParams({
      ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
      ...(redU ? { q: redU } : {}),
      ...(b0S ? { player: b0S } : {}),
      ...(blue[0]?.c ? { champ: resolveChampSlug(blue[0].c) } : {}),
    }).toString() || pQuery;
  const headRedQ =
    new URLSearchParams({
      ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
      ...(blueU ? { q: blueU } : {}),
      ...(r0S ? { player: r0S } : {}),
      ...(red[0]?.c ? { champ: resolveChampSlug(red[0].c) } : {}),
    }).toString() || pQuery;
  const head = (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] gap-2 text-[10px] uppercase tracking-wider font-bold">
      <span className="truncate text-right" style={{ color: BLUE }}>
        <TeamLink name={blueName} u={blueU} query={headBlueQ} className="hover:underline" />
      </span>
      <span />
      <span className="truncate" style={{ color: RED }}>
        <TeamLink name={redName} u={redU} query={headRedQ} className="hover:underline" />
      </span>
    </div>
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {gold.length > 0 && (
        <Section
          title={tl("Gold and XP lead")}
          share={`game-${g.n}-leads`}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {blueU && redU && (
                <>
                  <HubLink
                    to={{ kind: "prep", a: blueU, b: redU, period }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `teams=${encodeURIComponent(blueU)},${encodeURIComponent(redU)}${
                        blue[0]?.c || red[0]?.c
                          ? `&champ=${encodeURIComponent(
                              [
                                blue[0]?.c ? resolveChampSlug(blue[0].c) : "",
                                red[0]?.c && red[0].c !== blue[0]?.c ? resolveChampSlug(red[0].c) : "",
                              ]
                                .filter(Boolean)
                                .join(","),
                            )}`
                          : ""
                      }${blue[0]?.r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""}${period ? `&p=${encodeURIComponent(period)}` : eventSlug ? `&p=${encodeURIComponent(`e:${eventSlug}`)}` : ""}`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "compare", mode: "team", a: blueU, b: redU, period }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  {blue[0]?.c && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}${
                          red[0]?.c && red[0].c !== blue[0].c ? `&vs=${encodeURIComponent(resolveChampSlug(red[0].c))}` : ""
                        }${b0S ? `&player=${encodeURIComponent(b0S)}` : ""}${r0S && r0S !== b0S ? `&vsplayer=${encodeURIComponent(r0S)}` : ""}&team=${encodeURIComponent(blueU)}&vsteam=${encodeURIComponent(redU)}${blue[0].r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${
                          g.patch ? `&patch=${encodeURIComponent(g.patch)}` : period && /^y\d{4}$/.test(period) ? `&patch=${encodeURIComponent(period)}&year=${encodeURIComponent(period.slice(1))}` : ""
                        }`,
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: `${b0S ? `player=${encodeURIComponent(b0S)}&` : ""}${
                        r0S && r0S !== b0S ? `vsplayer=${encodeURIComponent(r0S)}&` : ""
                      }team=${encodeURIComponent(blueU)}&vs=${encodeURIComponent(redU)}${
                        blue[0]?.r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""
                      }${blue[0]?.c ? `&champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}` : ""}${
                        red[0]?.c && red[0].c !== blue[0]?.c ? `&vschamp=${encodeURIComponent(resolveChampSlug(red[0].c))}` : ""
                      }${g.patch ? `&patch=${encodeURIComponent(g.patch)}` : ""}${
                        eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""
                      }${period && /^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : ""}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `${b0S ? `player=${encodeURIComponent(b0S)}&` : ""}${
                        r0S && r0S !== b0S ? `vsplayer=${encodeURIComponent(r0S)}&` : ""
                      }team=${encodeURIComponent(blueU)}&vs=${encodeURIComponent(redU)}${
                        blue[0]?.r ? `&role=${encodeURIComponent(normalizeRole(blue[0].r))}` : ""
                      }${
                        blue[0]?.c ? `&champ=${encodeURIComponent(resolveChampSlug(blue[0].c))}` : ""
                      }${
                        red[0]?.c && red[0].c !== blue[0]?.c ? `&vschamp=${encodeURIComponent(resolveChampSlug(red[0].c))}` : ""
                      }${g.patch ? `&patch=${encodeURIComponent(g.patch)}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${
                        period && /^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : ""
                      }`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      query: `q=${encodeURIComponent([blueU, redU, b0S, r0S && r0S !== b0S ? r0S : ""].filter(Boolean).join(","))}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      ...(() => {
                        const qChamps = [blue[0]?.c, red[0]?.c && red[0]?.c !== blue[0]?.c ? red[0].c : ""].filter(Boolean).map((c) => resolveChampSlug(c!)).join(",");
                        const key = g.patch ? `p${g.patch}` : period && /^y\d{4}$/.test(period) ? period : "";
                        const yr = period && /^y\d{4}$/.test(period) ? period.slice(1) : "";
                        return qChamps || key || eventSlug || lanes[0]?.r
                          ? {
                              query: new URLSearchParams({
                                ...(qChamps ? { q: qChamps } : {}),
                                ...(lanes[0]?.r ? { role: normalizeRole(lanes[0].r) } : {}),
                                ...(key ? { key } : {}),
                                ...(g.patch ? { patch: g.patch } : {}),
                                ...(yr ? { year: yr } : {}),
                                ...(eventSlug ? { event: eventSlug } : {}),
                              }).toString(),
                            }
                          : {};
                      })(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        q: [blueU, redU, b0S, r0S && r0S !== b0S ? r0S : ""].filter(Boolean).join(","),
                        ...(blue[0]?.r ? { role: normalizeRole(blue[0].r) } : {}),
                        ...(blue[0]?.c ? { champ: resolveChampSlug(blue[0].c) } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        ...(period && /^y\d{4}$/.test(period) ? { year: period.slice(1) } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                </>
              )}
              <SectionCard
                section={tl("Gold and XP lead")}
                name={`${blueName} vs ${redName}`}
                rows={() =>
                  [
                    ...gold.map(([m, v]) => ({
                      team: v >= 0 ? blueName : redName,
                      label: `${tl("Gold")} · ${tl("{n} min", { n: m })}`,
                      sub: v >= 0 ? blueName : redName,
                      value: kfmt(v),
                      win: v >= 0,
                    })),
                    ...xp.map(([m, v]) => ({
                      team: v >= 0 ? blueName : redName,
                      label: `XP · ${tl("{n} min", { n: m })}`,
                      sub: v >= 0 ? blueName : redName,
                      value: kfmt(v),
                      win: v >= 0,
                    })),
                  ].map((r, idx) => ({ rank: idx + 1, ...r }))
                }
              />
            </span>
          }
        >
          <div className="space-y-1.5">
            {head}
            {gold.map(([m, v]) => (
              <LeadBar key={`g${m}`} label={tl("{n} min", { n: m })} left={m === gold[0][0] ? tl("Gold") : undefined} v={v} max={maxGold}
                tip={tl("Gold lead at {n} minutes: {lead}", { n: m, lead: `${v >= 0 ? blueName : redName} ${kfmt(Math.abs(v))}` })} />
            ))}
            {xp.map(([m, v]) => (
              <LeadBar key={`x${m}`} label={tl("{n} min", { n: m })} left={m === xp[0][0] ? "XP" : undefined} v={v} max={maxXp}
                tip={tl("XP lead at {n} minutes: {lead}", { n: m, lead: `${v >= 0 ? blueName : redName} ${kfmt(Math.abs(v))}` })} />
            ))}
            <OeCredit />
          </div>
        </Section>
      )}
      {lanes.length > 0 && (
        <Section
          title={tl("Gold lead in each lane at 15 minutes")}
          share={`game-${g.n}-lanes`}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {blueU && redU && (
                <>
                  <HubLink
                    to={{ kind: "prep", a: blueU, b: redU, period }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `teams=${encodeURIComponent(blueU)},${encodeURIComponent(redU)}${
                        lanes[0]?.b?.c || lanes[0]?.o?.c
                          ? `&champ=${encodeURIComponent(
                              [
                                lanes[0]?.b?.c ? resolveChampSlug(lanes[0].b.c) : "",
                                lanes[0]?.o?.c && lanes[0].o.c !== lanes[0]?.b?.c ? resolveChampSlug(lanes[0].o.c) : "",
                              ]
                                .filter(Boolean)
                                .join(","),
                            )}`
                          : ""
                      }&role=${encodeURIComponent(normalizeRole(lanes[0].r))}${period ? `&p=${encodeURIComponent(period)}` : eventSlug ? `&p=${encodeURIComponent(`e:${eventSlug}`)}` : ""}`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "compare", mode: "team", a: blueU, b: redU, period }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  {lanes[0]?.b?.c && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(resolveChampSlug(lanes[0].b.c))}${
                          lanes[0]?.o?.c && lanes[0].o.c !== lanes[0].b.c ? `&vs=${encodeURIComponent(resolveChampSlug(lanes[0].o.c))}` : ""
                        }${lb0S ? `&player=${encodeURIComponent(lb0S)}` : ""}${lo0S && lo0S !== lb0S ? `&vsplayer=${encodeURIComponent(lo0S)}` : ""}&team=${encodeURIComponent(blueU)}&vsteam=${encodeURIComponent(redU)}&role=${encodeURIComponent(normalizeRole(lanes[0].r))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${
                          g.patch ? `&patch=${encodeURIComponent(g.patch)}` : period && /^y\d{4}$/.test(period) ? `&patch=${encodeURIComponent(period)}&year=${encodeURIComponent(period.slice(1))}` : ""
                        }`,
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: `${lb0S ? `player=${encodeURIComponent(lb0S)}&` : ""}${
                        lo0S && lo0S !== lb0S ? `vsplayer=${encodeURIComponent(lo0S)}&` : ""
                      }team=${encodeURIComponent(blueU)}&vs=${encodeURIComponent(redU)}&role=${encodeURIComponent(
                        normalizeRole(lanes[0].r),
                      )}${lanes[0]?.b?.c ? `&champ=${encodeURIComponent(resolveChampSlug(lanes[0].b.c))}` : ""}${
                        lanes[0]?.o?.c && lanes[0].o.c !== lanes[0]?.b?.c ? `&vschamp=${encodeURIComponent(resolveChampSlug(lanes[0].o.c))}` : ""
                      }${
                        g.patch ? `&patch=${encodeURIComponent(g.patch)}` : ""
                      }${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${
                        period && /^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : ""
                      }`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `${lb0S ? `player=${encodeURIComponent(lb0S)}&` : ""}${
                        lo0S && lo0S !== lb0S ? `vsplayer=${encodeURIComponent(lo0S)}&` : ""
                      }team=${encodeURIComponent(blueU)}&vs=${encodeURIComponent(redU)}&role=${encodeURIComponent(normalizeRole(lanes[0].r))}${
                        lanes[0]?.b?.c ? `&champ=${encodeURIComponent(resolveChampSlug(lanes[0].b.c))}` : ""
                      }${
                        lanes[0]?.o?.c && lanes[0].o.c !== lanes[0]?.b?.c ? `&vschamp=${encodeURIComponent(resolveChampSlug(lanes[0].o.c))}` : ""
                      }${g.patch ? `&patch=${encodeURIComponent(g.patch)}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${
                        period && /^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : ""
                      }`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        q: [blueU, redU, lb0S, lo0S && lo0S !== lb0S ? lo0S : ""].filter(Boolean).join(","),
                        role: normalizeRole(lanes[0].r),
                        ...(lanes[0]?.b?.c ? { champ: resolveChampSlug(lanes[0].b.c) } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        ...(period && /^y\d{4}$/.test(period) ? { year: period.slice(1) } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      query: `q=${encodeURIComponent([blueU, redU, lb0S, lo0S && lo0S !== lb0S ? lo0S : ""].filter(Boolean).join(","))}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      ...(() => {
                        const qChamps = [lanes[0]?.b?.c, lanes[0]?.o?.c && lanes[0]?.o?.c !== lanes[0]?.b?.c ? lanes[0].o.c : ""].filter(Boolean).map((c) => resolveChampSlug(c!)).join(",");
                        const key = g.patch ? `p${g.patch}` : period && /^y\d{4}$/.test(period) ? period : "";
                        const yr = period && /^y\d{4}$/.test(period) ? period.slice(1) : "";
                        return qChamps || key || eventSlug || lanes[0]?.r
                          ? {
                              query: new URLSearchParams({
                                ...(qChamps ? { q: qChamps } : {}),
                                ...(lanes[0]?.r ? { role: normalizeRole(lanes[0].r) } : {}),
                                ...(key ? { key } : {}),
                                ...(g.patch ? { patch: g.patch } : {}),
                                ...(yr ? { year: yr } : {}),
                                ...(eventSlug ? { event: eventSlug } : {}),
                              }).toString(),
                            }
                          : {};
                      })(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                </>
              )}
              <SectionCard
                section={tl("Gold lead in each lane at 15 minutes")}
                name={`${blueName} vs ${redName}`}
                rows={() =>
                  lanes.map(({ r, b, o }, idx) => ({
                    rank: idx + 1,
                    champ: (b!.g15 as number) >= 0 ? b!.c : o!.c,
                    team: (b!.g15 as number) >= 0 ? blueName : redName,
                    label: `${roleName(r)} · ${b!.n} vs ${o!.n}`,
                    sub: (b!.g15 as number) >= 0 ? b!.n : o!.n,
                    value: kfmt(b!.g15 as number),
                    win: (b!.g15 as number) >= 0,
                  }))
                }
              />
            </span>
          }
        >
          <div className="space-y-1.5">
            {head}
            {lanes.map(({ r, b, o }) => {
              const bPSlug = pSlug(b!.n, b!.u);
              const oPSlug = pSlug(o!.n, o!.u);
              const laneCmpQ =
                new URLSearchParams({
                  ...(blueU ? { team: blueU } : {}),
                  ...(redU && redU !== blueU ? { vs: redU } : {}),
                  ...(r ? { role: normalizeRole(r) } : {}),
                  ...(b!.c ? { champ: resolveChampSlug(b!.c) } : {}),
                  ...(o!.c && o!.c !== b!.c ? { vschamp: resolveChampSlug(o!.c) } : {}),
                }).toString() || undefined;
              return (
              <LeadBar
                key={r}
                label={
                  bPSlug && oPSlug ? (
                    <HubLink
                      to={{ kind: "compare", mode: "player", a: bPSlug, b: oPSlug, period, ...(laneCmpQ ? { query: laneCmpQ } : {}) }}
                      className="hover:text-rw-accent hover:underline"
                      title={`${tl("Compare")}: ${b!.n} vs ${o!.n}`}
                    >
                      {roleName(r)}
                    </HubLink>
                  ) : (
                    roleName(r)
                  )
                }
                left={
                  <span className="inline-flex items-center justify-end gap-1 min-w-0 max-w-full">
                    {b!.c && (
                      <HubLink
                        to={{
                          kind: "champ",
                          slug: resolveChampSlug(b!.c),
                          query: new URLSearchParams({
                            ...(blueU ? { team: blueU } : {}),
                            ...(redU && redU !== blueU ? { vs: redU } : {}),
                            ...(r ? { role: normalizeRole(r) } : {}),
                            ...(bPSlug ? { player: bPSlug } : {}),
                            ...(oPSlug && oPSlug !== bPSlug ? { vsplayer: oPSlug } : {}),
                            ...(o!.c && o!.c !== b!.c ? { vschamp: resolveChampSlug(o!.c) } : {}),
                            ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                            ...(g.patch ? { patch: g.patch } : {}),
                          }).toString(),
                        }}
                        className="shrink-0 hover:opacity-80"
                        title={champName(b!.c)}
                      >
                        <ChampIcon name={b!.c} size={13} />
                      </HubLink>
                    )}
                    <PlayerLink
                      name={b!.n}
                      u={b!.u}
                      query={
                        new URLSearchParams({
                          ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                          ...(blueU ? { team: blueU } : {}),
                          ...(redU && redU !== blueU ? { vs: redU } : {}),
                          ...(oPSlug ? { vsplayer: oPSlug, q: oPSlug } : redU && redU !== blueU ? { q: redU } : {}),
                          ...(r ? { role: normalizeRole(r) } : {}),
                          ...(b!.c ? { champ: resolveChampSlug(b!.c) } : {}),
                          ...(o!.c && o!.c !== b!.c ? { vschamp: resolveChampSlug(o!.c) } : {}),
                        }).toString() || undefined
                      }
                      className="truncate hover:text-rw-accent hover:underline"
                    />
                  </span>
                }
                right={
                  <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                    <PlayerLink
                      name={o!.n}
                      u={o!.u}
                      query={
                        new URLSearchParams({
                          ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                          ...(redU ? { team: redU } : {}),
                          ...(blueU && blueU !== redU ? { vs: blueU } : {}),
                          ...(bPSlug ? { vsplayer: bPSlug, q: bPSlug } : blueU && blueU !== redU ? { q: blueU } : {}),
                          ...(r ? { role: normalizeRole(r) } : {}),
                          ...(o!.c ? { champ: resolveChampSlug(o!.c) } : {}),
                          ...(b!.c && b!.c !== o!.c ? { vschamp: resolveChampSlug(b!.c) } : {}),
                        }).toString() || undefined
                      }
                      className="truncate hover:text-rw-accent hover:underline"
                    />
                    {o!.c && (
                      <HubLink
                        to={{
                          kind: "champ",
                          slug: resolveChampSlug(o!.c),
                          query: new URLSearchParams({
                            ...(redU ? { team: redU } : {}),
                            ...(blueU && blueU !== redU ? { vs: blueU } : {}),
                            ...(r ? { role: normalizeRole(r) } : {}),
                            ...(oPSlug ? { player: oPSlug } : {}),
                            ...(bPSlug && bPSlug !== oPSlug ? { vsplayer: bPSlug } : {}),
                            ...(b!.c && b!.c !== o!.c ? { vschamp: resolveChampSlug(b!.c) } : {}),
                            ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                            ...(g.patch ? { patch: g.patch } : {}),
                          }).toString(),
                        }}
                        className="shrink-0 hover:opacity-80"
                        title={champName(o!.c)}
                      >
                        <ChampIcon name={o!.c} size={13} />
                      </HubLink>
                    )}
                  </span>
                }
                v={b!.g15 as number}
                max={maxLane}
                tip={tl("{role} at 15 minutes: {lead}", {
                  role: roleName(r),
                  lead: `${(b!.g15 as number) >= 0 ? b!.n : o!.n} ${kfmt(Math.abs(b!.g15 as number))}`,
                })}
              />
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
};

const SideHeader: React.FC<{ name: string; u: string | null; oppU?: string | null; p0?: GamePlayer; oppP0?: GamePlayer; side: "blue" | "red"; won: boolean; st?: SideStats; right?: boolean; period?: string; eventSlug?: string; patch?: string }> = ({
  name,
  u,
  oppU,
  p0,
  oppP0,
  side,
  won,
  st,
  right,
  period,
  eventSlug,
  patch,
}) => {
  const color = side === "blue" ? "#4a9eff" : "var(--rw-red)";
  const p0Slug = p0 ? pSlug(p0.n, p0.u) : "";
  const oppP0Slug = oppP0 ? pSlug(oppP0.n, oppP0.u) : "";
  const p0Role = p0?.r ? normalizeRole(p0.r) : "";
  const p0Champ = p0?.c || st?.picks?.[0] || "";
  const oppP0Champ = oppP0?.c || "";
  const pQuery =
    new URLSearchParams({
      ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
      ...(oppU && oppU !== u ? { q: oppU } : {}),
      ...(p0Slug ? { player: p0Slug } : {}),
      ...(p0Champ ? { champ: resolveChampSlug(p0Champ) } : {}),
    }).toString() || undefined;
  const obj: [string, React.ReactNode][] = [];
  if (st?.k != null) obj.push([tl("Kills"), st.k]);
  if (st?.gold != null) obj.push([tl("Gold"), fmtGold(st.gold)]);
  if (st?.towers != null) obj.push([tl("Towers"), st.towers]);
  if (st?.drag != null) obj.push([tl("Dragons"), st.drag]);
  if (st?.barons != null) obj.push([tl("Barons"), st.barons]);
  if (st?.grubs) obj.push([tl("Void grubs"), st.grubs]);
  if (st?.heralds) obj.push([tl("Heralds"), st.heralds]);
  if (st?.atakhan) obj.push([tl("Atakhan"), st.atakhan]);
  if (st?.elders) obj.push([tl("Elders"), st.elders]);
  if (st?.pl != null) obj.push([tl("Plates"), st.pl]);
  if (st?.g15 != null) obj.push(["GD@15", sgn(st.g15)]);
  const firsts = [st?.fb === 1 ? tl("First blood") : null, st?.ft === 1 ? tl("First tower") : null].filter((x): x is string => !!x);
  const drakes = st?.drakes ? Object.entries(st.drakes).map(([k, n]) => `${tl(DRAKE_LABEL[k] || k)}${n && n > 1 ? ` ×${n}` : ""}`) : [];
  const yr = period && /^y\d{4}$/.test(period) ? period.slice(1) : undefined;
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`flex items-center gap-2 ${right ? "justify-end" : ""}`}>
        {u ? (
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                ...(p0Slug ? { player: p0Slug } : {}),
                ...(oppP0Slug && oppP0Slug !== p0Slug ? { vsplayer: oppP0Slug } : {}),
                team: u,
                ...(oppU ? { vs: oppU } : {}),
                side: side === "blue" ? "b" : "r",
                ...(p0Role ? { role: p0Role } : {}),
                ...(p0Champ ? { champ: resolveChampSlug(p0Champ) } : {}),
                ...(oppP0Champ && oppP0Champ !== p0Champ ? { vschamp: resolveChampSlug(oppP0Champ) } : {}),
                ...(patch ? { patch } : {}),
                ...(eventSlug ? { event: eventSlug } : {}),
                ...(yr ? { year: yr } : {}),
              }).toString(),
            }}
            className="text-[10px] uppercase font-bold tracking-wider hover:underline"
            style={{ color }}
            title={tl("Game finder")}
          >
            {side === "blue" ? tl("Blue side") : tl("Red side")}
          </HubLink>
        ) : (
          <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color }}>
            {side === "blue" ? tl("Blue side") : tl("Red side")}
          </span>
        )}
        {won && <span className="text-[10px] font-bold text-rw-teal">{tc("short result", "W")}</span>}
      </div>
      <div className={`flex items-center gap-1.5 min-w-0 ${right ? "flex-row-reverse" : ""}`}>
        <HubLink to={{ kind: "team", slug: u || resolveTeamAlias(name) || prettySlug(name), ...(pQuery ? { query: pQuery } : {}) }} className="shrink-0 hover:opacity-80" title={name}>
          <TeamLogo name={name} size={18} />
        </HubLink>
        <TeamLink name={name} u={u} query={pQuery} className="text-sm font-bold text-rw-text hover:underline truncate" />
      </div>
      {obj.length > 0 && (
        <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] ${right ? "justify-end" : ""}`}>
          {obj.map(([l, v]) => (
            <span key={l} className="text-rw-muted">
              {l}{" "}
              {u ? (
                <HubLink to={{ kind: "team", slug: u, tab: "stats", ...(pQuery ? { query: pQuery } : {}) }} className="text-rw-text font-semibold hover:text-rw-accent hover:underline" title={tl("Stats")}>
                  {v}
                </HubLink>
              ) : (
                <span className="text-rw-text font-semibold">{v}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {drakes.length > 0 && <div className="text-[10px] text-rw-muted mt-0.5">{drakes.join(" · ")}</div>}
      {firsts.length > 0 && (
        <div className={`mt-1 flex flex-wrap gap-1 ${right ? "justify-end" : ""}`}>
          {firsts.map((f) =>
            u ? (
              <HubLink
                key={f}
                to={{ kind: "team", slug: u, tab: "stats", ...(pQuery ? { query: pQuery } : {}) }}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rw-accent/15 border border-rw-accent/40 text-rw-text hover:border-rw-accent"
                title={tl("Stats")}
              >
                {f}
              </HubLink>
            ) : (
              <span key={f} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rw-accent/15 border border-rw-accent/40 text-rw-text">
                {f}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
};

/** +1,234 / -56 */
const sgn = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`);

// Draft order: blue picks 1st, 4th, 5th, 8th, 9th; red 2nd, 3rd, 6th, 7th, 10th. Bans and picks come in two phases (3 + 2).
const PICK_NO: Record<"blue" | "red", number[]> = { blue: [1, 4, 5, 8, 9], red: [2, 3, 6, 7, 10] };

const Draft: React.FC<{ st?: SideStats; side: "blue" | "red"; right?: boolean; teamSlug?: string | null; oppSlug?: string | null; p0?: GamePlayer; period?: string; eventSlug?: string }> = ({ st, side, right, teamSlug, oppSlug, p0, period, eventSlug }) => {
  const effPeriod = period || (eventSlug ? `e:${eventSlug}` : undefined);
  const p0Slug = p0 ? pSlug(p0.n, p0.u) : "";
  const p0Role = p0?.r ? normalizeRole(p0.r) : "";
  return (
  <div className={`space-y-1.5 min-w-0 ${right ? "text-right" : ""}`}>
    {st?.bans && st.bans.length > 0 && (
      <div className={`flex flex-wrap items-center gap-1 ${right ? "justify-end" : ""}`}>
        {teamSlug ? (
          <HubLink
            to={{
              kind: "draft",
              query: `teams=${encodeURIComponent(teamSlug)}${oppSlug ? `,${encodeURIComponent(oppSlug)}` : ""}${
                st.bans[0]
                  ? `&champ=${encodeURIComponent(
                      st.bans
                        .slice(0, 2)
                        .filter(Boolean)
                        .map((c) => resolveChampSlug(c))
                        .join(","),
                    )}`
                  : ""
              }${p0Role ? `&role=${encodeURIComponent(p0Role)}` : ""}${effPeriod ? `&p=${encodeURIComponent(effPeriod)}` : ""}`,
            }}
            className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline uppercase mr-1"
            title={tl("Draft board")}
          >
            {tl("Bans")}
          </HubLink>
        ) : (
          <span className="text-[10px] text-rw-muted uppercase mr-1">{tl("Bans")}</span>
        )}
        {st.bans.map((c, i) => (
          <HubLink
            key={i}
            to={
              teamSlug
                ? {
                    kind: "team",
                    slug: teamSlug,
                    tab: "champions",
                    query: `champ=${encodeURIComponent(resolveChampSlug(c))}${oppSlug && oppSlug !== teamSlug ? `&q=${encodeURIComponent(oppSlug)}` : ""}${p0Slug ? `&player=${encodeURIComponent(p0Slug)}` : ""}${effPeriod ? `&p=${encodeURIComponent(effPeriod)}` : ""}`,
                  }
                : { kind: "champ", slug: resolveChampSlug(c), ...(effPeriod ? { query: `p=${encodeURIComponent(effPeriod)}` } : {}) }
            }
            className={`opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-opacity ${i === 3 ? "ml-2" : ""}`}
            title={`${champName(c)} · ${tl("Ban {n}", { n: i + 1 })}`}
          >
            <ChampIcon name={c} size={20} />
          </HubLink>
        ))}
      </div>
    )}
    {st?.picks && st.picks.length > 0 && (
      <div className={`flex flex-wrap items-start gap-1 ${right ? "justify-end" : ""}`}>
        {teamSlug ? (
          <HubLink
            to={{
              kind: "draft",
              query: `teams=${encodeURIComponent(teamSlug)}${oppSlug ? `,${encodeURIComponent(oppSlug)}` : ""}${
                st.picks[0]
                  ? `&champ=${encodeURIComponent(
                      st.picks
                        .slice(0, 2)
                        .filter(Boolean)
                        .map((c) => resolveChampSlug(c))
                        .join(","),
                    )}`
                  : ""
              }${p0Role ? `&role=${encodeURIComponent(p0Role)}` : ""}${effPeriod ? `&p=${encodeURIComponent(effPeriod)}` : ""}`,
            }}
            className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline uppercase mr-1 mt-1.5"
            title={tl("Draft board")}
          >
            {tl("Picks")}
          </HubLink>
        ) : (
          <span className="text-[10px] text-rw-muted uppercase mr-1 mt-1.5">{tl("Picks")}</span>
        )}
        {st.picks.map((c, i) => (
          <HubLink
            key={i}
            to={
              teamSlug
                ? {
                    kind: "team",
                    slug: teamSlug,
                    tab: "champions",
                    query: `champ=${encodeURIComponent(resolveChampSlug(c))}${oppSlug && oppSlug !== teamSlug ? `&q=${encodeURIComponent(oppSlug)}` : ""}${p0Slug ? `&player=${encodeURIComponent(p0Slug)}` : ""}${effPeriod ? `&p=${encodeURIComponent(effPeriod)}` : ""}`,
                  }
                : { kind: "champ", slug: resolveChampSlug(c), ...(effPeriod ? { query: `p=${encodeURIComponent(effPeriod)}` } : {}) }
            }
            className={`flex flex-col items-center hover:opacity-85 ${i === 3 ? "ml-2" : ""}`}
            title={`${champName(c)} · ${tl("Pick {n} of the draft", { n: PICK_NO[side][i] ?? i + 1 })}`}
          >
            <ChampIcon name={c} size={24} />
            <span className="text-[9px] text-rw-muted tabular-nums leading-tight">{`${side === "blue" ? "B" : "R"}${i + 1}`}</span>
          </HubLink>
        ))}
      </div>
    )}
  </div>
  );
};

const Scoreboard: React.FC<{
  name: string;
  u?: string | null;
  oppU?: string | null;
  side: "blue" | "red";
  players: GamePlayer[];
  oppPlayers?: GamePlayer[];
  hidden: boolean;
  won: boolean;
  minutes?: number | null;
  ratings?: Map<GamePlayer, number>;
  top?: GamePlayer;
  period?: string;
  eventSlug?: string;
  patch?: string;
}> = ({ name, u, oppU, side, players, oppPlayers, hidden, won, minutes, ratings, top, period, eventSlug, patch }) => {
  const color = side === "blue" ? "#4a9eff" : "var(--rw-red)";
  const p0Slug = players[0] ? pSlug(players[0].n, players[0].u) : "";
  const oppP0Slug = oppPlayers?.[0] ? pSlug(oppPlayers[0].n, oppPlayers[0].u) : "";
  const pQuery =
    new URLSearchParams({
      ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
      ...(oppU && oppU !== u ? { q: oppU } : {}),
      ...(p0Slug ? { player: p0Slug } : {}),
      ...(players[0]?.c ? { champ: resolveChampSlug(players[0].c) } : {}),
    }).toString() || undefined;
  const totalK = players.reduce((s, p) => s + p.k, 0);
  const totalDmg = players.reduce((s, p) => s + (p.dm || 0), 0);
  const totalGold = players.reduce((s, p) => s + (p.gd || 0), 0);
  const maxDmg = Math.max(1, ...players.map((p) => p.dm || 0));
  return (
    <section className={`${card} p-3 min-w-0`} style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <h3 className="text-xs font-bold text-rw-text mb-2 flex items-center gap-2">
        <span className="w-1 h-3.5 rounded-sm shrink-0" style={{ background: color }} aria-hidden="true" />
        <HubLink to={{ kind: "team", slug: u || resolveTeamAlias(name) || prettySlug(name), ...(pQuery ? { query: pQuery } : {}) }} className="shrink-0 hover:opacity-80" title={name}>
          <TeamLogo name={name} size={16} />
        </HubLink>
        <TeamLink name={name} u={u} query={pQuery} className="text-rw-text hover:underline truncate" />
        {!hidden && won && <span className="text-[10px] text-rw-teal">{tl("Victory")}</span>}
        {u && (
          <span className="ml-auto flex items-center gap-2 shrink-0 font-normal">
            <HubLink
              to={{ kind: "prep", a: u, ...(oppU ? { b: oppU } : {}), ...(period ? { period } : {}) }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Match prep")} →
            </HubLink>
            <HubLink
              to={{ kind: "compare", mode: "team", a: u, ...(oppU ? { b: oppU } : {}), ...(period ? { period } : {}) }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Compare")} →
            </HubLink>
            <HubLink
              to={{ kind: "team", slug: u, tab: "stats", ...(pQuery ? { query: pQuery } : {}) }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Stats")} →
            </HubLink>
            <HubLink
              to={{ kind: "team", slug: u, tab: "champions", ...(pQuery ? { query: pQuery } : {}) }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Champions")} →
            </HubLink>
            <HubLink
              to={{ kind: "team", slug: u, tab: "matches", ...(pQuery ? { query: pQuery } : {}) }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Matches")} →
            </HubLink>
            <HubLink
              to={{
                kind: "draft",
                query: `teams=${encodeURIComponent(u)}${oppU ? `,${encodeURIComponent(oppU)}` : ""}${
                  players[0]?.c
                    ? `&champ=${encodeURIComponent(
                        [
                          resolveChampSlug(players[0].c),
                          oppPlayers?.[0]?.c && oppPlayers[0].c !== players[0].c
                            ? resolveChampSlug(oppPlayers[0].c)
                            : players[1]?.c && players[1].c !== players[0].c
                              ? resolveChampSlug(players[1].c)
                              : "",
                        ]
                          .filter(Boolean)
                          .join(","),
                      )}`
                    : ""
                }${players[0]?.r ? `&role=${encodeURIComponent(normalizeRole(players[0].r))}` : ""}${period ? `&p=${encodeURIComponent(period)}` : eventSlug ? `&p=${encodeURIComponent(`e:${eventSlug}`)}` : ""}`,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Draft board")} →
            </HubLink>
            {players[0]?.c && (
              <HubLink
                to={{
                  kind: "counters",
                  query: `champ=${encodeURIComponent(resolveChampSlug(players[0].c))}${
                    oppPlayers?.[0]?.c && oppPlayers[0].c !== players[0].c ? `&vs=${encodeURIComponent(resolveChampSlug(oppPlayers[0].c))}` : ""
                  }${p0Slug ? `&player=${encodeURIComponent(p0Slug)}` : ""}${oppP0Slug && oppP0Slug !== p0Slug ? `&vsplayer=${encodeURIComponent(oppP0Slug)}` : ""}&team=${encodeURIComponent(u)}${oppU && oppU !== u ? `&vsteam=${encodeURIComponent(oppU)}` : ""}${players[0].r ? `&role=${encodeURIComponent(normalizeRole(players[0].r))}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${patch ? `&patch=${encodeURIComponent(patch)}` : period && /^y\d{4}$/.test(period) ? `&patch=${encodeURIComponent(period)}&year=${encodeURIComponent(period.slice(1))}` : ""}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "items",
                query: `${p0Slug ? `player=${encodeURIComponent(p0Slug)}&` : ""}${
                  oppP0Slug && oppP0Slug !== p0Slug ? `vsplayer=${encodeURIComponent(oppP0Slug)}&` : ""
                }team=${encodeURIComponent(u)}${oppU ? `&vs=${encodeURIComponent(oppU)}` : ""}${
                  players[0]?.r ? `&role=${encodeURIComponent(normalizeRole(players[0].r))}` : ""
                }${players[0]?.c ? `&champ=${encodeURIComponent(resolveChampSlug(players[0].c))}` : ""}${
                  oppPlayers?.[0]?.c && oppPlayers[0].c !== players[0]?.c
                    ? `&vschamp=${encodeURIComponent(resolveChampSlug(oppPlayers[0].c))}`
                    : players[1]?.c && players[1].c !== players[0]?.c
                      ? `&vschamp=${encodeURIComponent(resolveChampSlug(players[1].c))}`
                      : ""
                }${patch ? `&patch=${encodeURIComponent(patch)}` : ""}${
                  eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""
                }${period && /^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : ""}`,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Item history")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  q: [
                    u,
                    oppU || "",
                    p0Slug,
                    oppP0Slug && oppP0Slug !== p0Slug ? oppP0Slug : "",
                  ]
                    .filter(Boolean)
                    .join(","),
                  ...(players[0]?.r ? { role: normalizeRole(players[0].r) } : {}),
                  ...(players[0]?.c ? { champ: resolveChampSlug(players[0].c) } : {}),
                  ...(eventSlug ? { event: eventSlug } : {}),
                  ...(period && /^y\d{4}$/.test(period) ? { year: period.slice(1) } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: `${p0Slug ? `player=${encodeURIComponent(p0Slug)}&` : ""}${
                  oppP0Slug && oppP0Slug !== p0Slug ? `vsplayer=${encodeURIComponent(oppP0Slug)}&` : ""
                }team=${encodeURIComponent(u)}${oppU ? `&vs=${encodeURIComponent(oppU)}` : ""}${
                  players[0]?.r ? `&role=${encodeURIComponent(normalizeRole(players[0].r))}` : ""
                }${
                  players[0]?.c ? `&champ=${encodeURIComponent(resolveChampSlug(players[0].c))}` : ""
                }${
                  oppPlayers?.[0]?.c && oppPlayers[0].c !== players[0]?.c
                    ? `&vschamp=${encodeURIComponent(resolveChampSlug(oppPlayers[0].c))}`
                    : players[1]?.c && players[1].c !== players[0]?.c
                      ? `&vschamp=${encodeURIComponent(resolveChampSlug(players[1].c))}`
                      : ""
                }${patch ? `&patch=${encodeURIComponent(patch)}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${
                  period && /^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : ""
                }`,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: `q=${encodeURIComponent([u, oppU || "", p0Slug, oppP0Slug && oppP0Slug !== p0Slug ? oppP0Slug : ""].filter(Boolean).join(","))}`,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                ...(() => {
                  const qChamps = [
                    players[0]?.c ? resolveChampSlug(players[0].c) : "",
                    oppPlayers?.[0]?.c && oppPlayers[0].c !== players[0]?.c
                      ? resolveChampSlug(oppPlayers[0].c)
                      : players[1]?.c && players[1].c !== players[0]?.c
                        ? resolveChampSlug(players[1].c)
                        : "",
                  ]
                    .filter((x): x is string => Boolean(x))
                    .join(",");
                  const key = patch ? `p${patch}` : period && /^y\d{4}$/.test(period) ? period : "";
                  const yr = period && /^y\d{4}$/.test(period) ? period.slice(1) : "";
                  return qChamps || key || eventSlug || players[0]?.r
                    ? {
                        query: new URLSearchParams({
                          ...(qChamps ? { q: qChamps } : {}),
                          ...(players[0]?.r ? { role: normalizeRole(players[0].r) } : {}),
                          ...(key ? { key } : {}),
                          ...(patch ? { patch } : {}),
                          ...(yr ? { year: yr } : {}),
                          ...(eventSlug ? { event: eventSlug } : {}),
                        }).toString(),
                      }
                    : {};
                })(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </HubLink>
          </span>
        )}
      </h3>
      <div className="space-y-2">
        {players.map((p, i) => (
          <PlayerRow
            key={i}
            p={p}
            oppP={oppPlayers?.find((op) => op.r && p.r && op.r === p.r) || oppPlayers?.[i]}
            teamName={name}
            teamU={u}
            oppU={oppU}
            teamKills={totalK}
            teamDmg={totalDmg}
            teamGold={totalGold}
            maxDmg={maxDmg}
            sideColor={color}
            minutes={minutes}
            rating={ratings?.get(p)}
            top={p === top}
            period={period}
            eventSlug={eventSlug}
            patch={patch}
          />
        ))}
      </div>
    </section>
  );
};

const PlayerRow: React.FC<{
  p: GamePlayer;
  oppP?: GamePlayer;
  teamName?: string;
  teamU?: string | null;
  oppU?: string | null;
  teamKills: number;
  teamDmg: number;
  teamGold: number;
  maxDmg: number;
  sideColor: string;
  minutes?: number | null;
  rating?: number;
  top?: boolean;
  period?: string;
  eventSlug?: string;
  patch?: string;
}> = ({
  p,
  oppP,
  teamName,
  teamU,
  oppU,
  teamKills,
  teamDmg,
  teamGold,
  maxDmg,
  sideColor,
  minutes,
  rating,
  top,
  period,
  eventSlug,
  patch,
}) => {
  const kp = teamKills ? Math.round(((p.k + p.a) / teamKills) * 100) : null;
  const csm = p.cs != null && minutes ? fmtDec(p.cs / minutes) : null;
  const dmgBarW = p.dm != null && maxDmg > 0 ? Math.max(3, Math.round((p.dm / maxDmg) * 100)) : 0;
  const pS = pSlug(p.n, p.u);
  const oppS = oppP ? pSlug(oppP.n, oppP.u) : "";
  const playerRowQuery =
    new URLSearchParams({
      ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
      ...(teamU ? { team: teamU } : {}),
      ...(oppU && oppU !== teamU ? { vs: oppU } : {}),
      ...(oppS && oppS !== pS ? { vsplayer: oppS, q: oppS } : oppU && oppU !== teamU ? { q: oppU } : {}),
      ...(p.r ? { role: normalizeRole(p.r) } : {}),
      ...(p.c ? { champ: resolveChampSlug(p.c) } : {}),
      ...(oppP?.c && oppP.c !== p.c ? { vschamp: resolveChampSlug(oppP.c) } : {}),
    }).toString() || undefined;
  return (
    <div className="border-t border-rw-border pt-2 first:border-0 first:pt-0 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        {p.c && (
          <HubLink
            to={{
              kind: "champ",
              slug: resolveChampSlug(p.c),
              query: new URLSearchParams({
                ...(teamU ? { team: teamU } : {}),
                ...(oppU && oppU !== teamU ? { vs: oppU } : {}),
                ...(p.r ? { role: normalizeRole(p.r) } : {}),
                ...(pS ? { player: pS } : {}),
                ...(oppS && oppS !== pS ? { vsplayer: oppS } : {}),
                ...(oppP?.c && oppP.c !== p.c ? { vschamp: resolveChampSlug(oppP.c) } : {}),
                ...(period ? { p: period } : eventSlug ? { p: `e:${eventSlug}` } : {}),
                ...(patch ? { patch } : {}),
              }).toString(),
            }}
            className="shrink-0 hover:opacity-85"
            title={champName(p.c)}
          >
            <ChampIcon name={p.c} size={30} />
          </HubLink>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <HubLink
              to={{
                kind: "player",
                slug: pS,
                ...(playerRowQuery ? { query: playerRowQuery } : {}),
              }}
              className="shrink-0 hover:opacity-80"
              title={p.n}
            >
              <PlayerPhoto name={p.n} team={teamName} slug={p.u ?? undefined} size={16} />
            </HubLink>
            <PlayerLink
              name={p.n}
              u={p.u}
              query={playerRowQuery}
              className="font-semibold text-rw-text hover:text-rw-accent hover:underline truncate"
            />
            {p.r &&
              (pS ? (
                <HubLink
                  to={{
                    kind: "player",
                    slug: pS,
                    tab: "stats",
                    ...(playerRowQuery ? { query: playerRowQuery } : {}),
                  }}
                  className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline shrink-0"
                  title={tl("Stats")}
                >
                  {roleName(p.r)}
                </HubLink>
              ) : (
                <span className="text-[10px] text-rw-muted shrink-0">{roleName(p.r)}</span>
              ))}
          </div>
          <div className="text-[10px] text-rw-muted truncate">
            {p.c ? (
              pS ? (
                <HubLink
                  to={{
                    kind: "player",
                    slug: pS,
                    tab: "champions",
                    query: playerRowQuery,
                  }}
                  className="hover:text-rw-accent hover:underline"
                  title={`${p.n} · ${champName(p.c)}`}
                >
                  {champName(p.c)}
                </HubLink>
              ) : (
                champName(p.c)
              )
            ) : (
              ""
            )}
          </div>
        </div>
        {rating != null && (
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                q: [pS, oppS && oppS !== pS ? oppS : "", teamU || "", oppU || ""].filter(Boolean).join(","),
                ...(p.r ? { role: normalizeRole(p.r) } : {}),
                ...(p.c ? { champ: resolveChampSlug(p.c) } : {}),
                ...(eventSlug ? { event: eventSlug } : {}),
                ...(period && /^y\d{4}$/.test(period) ? { year: period.slice(1) } : {}),
              }).toString(),
            }}
            className="hover:opacity-85 shrink-0"
            title={tl("Player leaderboards")}
          >
            <PlayerRatingBadge v={rating} top={top} />
          </HubLink>
        )}
        <div className="text-right shrink-0">
          <div className="font-bold text-rw-text tabular-nums">
            {pS || p.c ? (
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    ...(pS ? { player: pS } : {}),
                    ...(oppS && oppS !== pS ? { vsplayer: oppS } : {}),
                    ...(teamU ? { team: teamU } : {}),
                    ...(oppU ? { vs: oppU } : {}),
                    ...(p.r ? { role: normalizeRole(p.r) } : {}),
                    ...(p.c ? { champ: resolveChampSlug(p.c) } : {}),
                    ...(oppP?.c && oppP.c !== p.c ? { vschamp: resolveChampSlug(oppP.c) } : {}),
                    ...(patch ? { patch } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(period && /^y\d{4}$/.test(period) ? { year: period.slice(1) } : {}),
                  }).toString(),
                }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Game finder")}
              >
                {p.k}/{p.d}/{p.a}
              </HubLink>
            ) : (
              <>
                {p.k}/{p.d}/{p.a}
              </>
            )}
          </div>
          <div className="text-[10px] text-rw-muted tabular-nums">
            {pS ? (
              <HubLink
                to={{
                  kind: "player",
                  slug: pS,
                  tab: "stats",
                  ...(playerRowQuery ? { query: playerRowQuery } : {}),
                }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Stats")}
              >
                {p.cs != null && <>{tl("{n} CS", { n: p.cs })}{csm ? ` (${csm})` : ""}</>}
                {kp != null && <> · {tl("{pct} KP", { pct: `${kp}%` })}</>}
              </HubLink>
            ) : (
              <>
                {p.cs != null && <>{tl("{n} CS", { n: p.cs })}{csm ? ` (${csm})` : ""}</>}
                {kp != null && <> · {tl("{pct} KP", { pct: `${kp}%` })}</>}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {p.it && p.it.length > 0 && (
          <span className="flex items-center gap-0.5">
            {p.it.map((it, i) => (
              <HubLink
                key={i}
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    item: resolveItemSlug(it),
                    ...(pS ? { player: pS } : {}),
                    ...(oppS && oppS !== pS ? { vsplayer: oppS } : {}),
                    ...(teamU ? { team: teamU } : {}),
                    ...(oppU ? { vs: oppU } : {}),
                    ...(p.r ? { role: normalizeRole(p.r) } : {}),
                    ...(p.c ? { champ: resolveChampSlug(p.c) } : {}),
                    ...(oppP?.c && oppP.c !== p.c ? { vschamp: resolveChampSlug(oppP.c) } : {}),
                    ...(patch ? { patch } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(period && /^y\d{4}$/.test(period) ? { year: period.slice(1) } : {}),
                  }).toString(),
                }}
                className="hover:opacity-80"
              >
                <ItemIcon name={it} size={20} />
              </HubLink>
            ))}
            {p.tr && (
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    item: resolveItemSlug(p.tr),
                    ...(pS ? { player: pS } : {}),
                    ...(oppS && oppS !== pS ? { vsplayer: oppS } : {}),
                    ...(teamU ? { team: teamU } : {}),
                    ...(oppU ? { vs: oppU } : {}),
                    ...(p.r ? { role: normalizeRole(p.r) } : {}),
                    ...(p.c ? { champ: resolveChampSlug(p.c) } : {}),
                    ...(oppP?.c && oppP.c !== p.c ? { vschamp: resolveChampSlug(oppP.c) } : {}),
                    ...(patch ? { patch } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(period && /^y\d{4}$/.test(period) ? { year: period.slice(1) } : {}),
                  }).toString(),
                }}
                className="hover:opacity-80"
              >
                <ItemIcon name={p.tr} size={16} />
              </HubLink>
            )}
          </span>
        )}
        {p.sp && p.sp.length > 0 && (
          <span className="flex items-center gap-0.5">
            {p.sp.map((sp, i) => (
              <SpellIcon key={i} name={sp} />
            ))}
          </span>
        )}
        {p.ks && (
          <span className="flex items-center gap-0.5" title={(p.rn || [p.ks]).join(", ")}>
            <RuneIcon name={p.ks} size={20} />
            {p.stt && <RuneIcon name={p.stt} size={14} />}
          </span>
        )}
        {pS ? (
          <HubLink
            to={{
              kind: "player",
              slug: pS,
              tab: "stats",
              ...(playerRowQuery ? { query: playerRowQuery } : {}),
            }}
            className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline tabular-nums"
            title={tl("Stats")}
          >
            {p.gd != null && (
              <>
                {tl("{n} gold", { n: fmtNum(p.gd) })}
                {teamGold ? ` (${Math.round((p.gd / teamGold) * 100)}%)` : ""}
              </>
            )}
            {p.dm != null && (
              <>
                {" · "}
                {tl("{n} dmg", { n: fmtNum(p.dm) })}
                {teamDmg ? ` (${Math.round((p.dm / teamDmg) * 100)}%)` : ""}
              </>
            )}
            {p.v != null && <> · {tl("{n} vision", { n: p.v })}</>}
          </HubLink>
        ) : (
          <span className="text-[10px] text-rw-muted tabular-nums">
            {p.gd != null && (
              <>
                {tl("{n} gold", { n: fmtNum(p.gd) })}
                {teamGold ? ` (${Math.round((p.gd / teamGold) * 100)}%)` : ""}
              </>
            )}
            {p.dm != null && (
              <>
                {" · "}
                {tl("{n} dmg", { n: fmtNum(p.dm) })}
                {teamDmg ? ` (${Math.round((p.dm / teamDmg) * 100)}%)` : ""}
              </>
            )}
            {p.v != null && <> · {tl("{n} vision", { n: p.v })}</>}
          </span>
        )}
      </div>
      {dmgBarW > 0 && teamDmg > 0 && (
        <div className="mt-1 h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${dmgBarW}%`, background: sideColor, opacity: top ? 0.95 : 0.72 }} />
        </div>
      )}
      {(() => {
        const bits = [
          minutes && p.dm != null ? `${fmtNum(Math.round(p.dm / minutes))} ${tl("DPM")}` : null,
          minutes && p.v != null ? `${fmtDec(p.v / minutes, 2)} ${tl("VS/m")}` : null,
          p.g15 != null ? `@15 ${sgn(p.g15)} ${tl("gold")} · ${sgn(p.c15)} CS · ${sgn(p.x15)} XP` : null,
        ].filter(Boolean);
        return bits.length ? (
          <div className="mt-0.5 text-[10px] text-rw-muted tabular-nums" title={p.g15 != null ? tl("Lead over the lane opponent at 15 minutes (Oracle's Elixir)") : undefined}>
            {pS ? (
              <HubLink
                to={{
                  kind: "player",
                  slug: pS,
                  tab: "stats",
                  ...(playerRowQuery ? { query: playerRowQuery } : {}),
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {bits.join(" · ")}
              </HubLink>
            ) : (
              bits.join(" · ")
            )}
          </div>
        ) : null;
      })()}
    </div>
  );
};

