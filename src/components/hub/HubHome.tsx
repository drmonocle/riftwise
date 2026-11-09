/**
 * The site's front page: one search, today's matches (live or next, with prep, overview, calendar and where to
 * watch), the event that is on, four ways in (tournaments, teams, players, champions), the power rankings, what is
 * on the line tonight, the week's storylines and the analyst tools. Also the tournament browser (EventsBrowse).
 */
import React, { useMemo, useState } from "react";
import { HomeStorylines } from "./Storylines";
import { AtStakeToday } from "./AtStake";
import type { AppSettings, Match } from "../../types";
import { Crown, ClipboardList, TrendingUp, Users, User, Globe, Trophy, Flag, Swords, LayoutGrid, GitCompare, Search, Package, Database, Star } from "lucide-react";
import { tl, tn, tk, tc, regionName, roleName, LANGUAGES } from "../../i18n";
import { loadEventsOfYear, loadHubHome, loadHubMeta, loadLeagues, loadPatches, loadRatings } from "../../hub/data";
import { UpNextTable } from "../UpNextTable";
import { formatMatchTime } from "../../matchTime";
import { RatingBadge } from "./PlayerRating";
import { useRecentPages } from "../../hub/recent";
import { loadPopular } from "../../hub/popular";
import { champName } from "../../champions";
import type { EventListItem, HubMeta, PatchMove, PatchRow, RatingRow } from "../../hub/types";
import { HubRoute, navigateHub } from "../../hub/route";
import { HubSearch } from "./HubSearch";
import { IS_WEB } from "../../platform";
import { card, ChampIcon, EventLink, fmtDate, fmtNum, HubLink, Page, PlayerLink, PlayerPhoto, RevealButton, StandingsFirst, Section, TeamLink, TeamLogo, td, th, useHidden, useLoad, usePageTitle } from "./ui";
import { STable } from "../STable";
import { computeHeadToHead, getLeagueBroadcastStreams } from "../../helpers";
import { clickable } from "../../a11y";
import { riotImg } from "../../riotImage";
import { H2HMeter } from "../H2HMeter";
import { WinChanceLine } from "../WinChanceLine";
import { MatchPrepButton } from "../MatchPrepButton";
import { MatchOverviewButton } from "../MatchOverviewButton";
import { AddToCalendarMenu } from "../AddToCalendarMenu";
import { ShareMatchButton } from "../ShareMatchButton";
import { SwissStandings } from "../SwissStandings";
import { INTL_EVENTS, intlMatchNow } from "../../intlNow";
import { LatestResults } from "../IdleHome";
import { prettySlug } from "../../hub/data";
import { BroadcastCardButton, SectionCard, rankingsCard } from "./BroadcastCard";
import type { TabKey } from "../Navigation";

/** the panel that matters most on the page: a brighter edge and a soft glow (the card's look, its own border colour) */
const hot = "bg-rw-panel border border-rw-accent/50 rounded-xl p-4 shadow-[0_18px_50px_color-mix(in_oklab,var(--rw-accent-2)_16%,transparent)]";
/** a small condensed label over a block, with a short accent line before it */
const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`flex items-center gap-2 font-head text-[11px] font-semibold uppercase tracking-[0.14em] text-rw-accent ${className}`}>
    <span className="w-4 h-0.5 rounded bg-rw-accent shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </div>
);
const more = "inline-block mt-auto pt-3 text-xs font-semibold text-rw-accent hover:underline";
const tileHead = "font-head text-lg font-bold text-rw-text flex items-center gap-2 mb-2";

/** Searches to try, one of each kind the box understands, each going straight to its page. */
const TRY: { label: string; to: HubRoute; icon: React.ReactNode }[] = [
  { label: "T1 vs Gen.G", to: { kind: "prep", a: "t1", b: "geng" }, icon: <Swords className="w-3 h-3" /> },
  { label: "Faker Azir", to: { kind: "player", slug: "faker", tab: "champions", query: "champ=Azir" }, icon: <User className="w-3 h-3" /> },
  { label: "Heartsteel", to: { kind: "items", query: "item=heartsteel" }, icon: <Package className="w-3 h-3" /> },
  { label: `Worlds ${new Date().getFullYear()}`, to: { kind: "worlds" }, icon: <Trophy className="w-3 h-3" /> },
  { label: `LCK ${new Date().getFullYear()}`, to: { kind: "league", slug: "lol-champions-korea" }, icon: <Flag className="w-3 h-3" /> },
];

export const HubHome: React.FC<{
  schedule?: Match[];
  liveMatches?: Match[];
  settings?: AppSettings;
  onOpenUrl?: (url: string) => void;
  onSelectTab?: (tab: TabKey) => void;
  onSelectTeam?: (code: string, name?: string) => void;
}> = ({ schedule, liveMatches, settings, onOpenUrl, onSelectTab, onSelectTeam }) => {
  usePageTitle(tl("Every pro League of Legends game since 2011"));
  const meta = useLoad(loadHubMeta, []);
  const home = useLoad(loadHubHome, []);
  const ratings = useLoad(() => loadRatings().catch(() => null), []);
  const intl = useMemo(() => (schedule ? intlMatchNow(schedule) : undefined), [schedule]);
  const ev = intl ? INTL_EVENTS[intl.leagueSlug] : undefined;
  return (
    <div className="space-y-6">
      {/* the title, the search and the numbers */}
      {/* no overflow-hidden here: the search's results open below the box, past the panel's edge */}
      <section className="bg-rw-panel border border-rw-border rounded-xl relative p-5 sm:p-7 space-y-4">
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none bg-[radial-gradient(900px_380px_at_8%_-20%,color-mix(in_oklab,var(--rw-accent-2)_28%,transparent),transparent_60%),radial-gradient(600px_300px_at_100%_0%,color-mix(in_oklab,var(--rw-accent)_10%,transparent),transparent_60%)]" aria-hidden="true" />
        <div className="relative space-y-4">
          <Eyebrow>{ev && intl ? tl("{event} {year} is on", { event: tc("event", ev.name), year: intl.startTimeUtc.slice(0, 4) }) : tl("Pro League of Legends stats")}</Eyebrow>
          <h1 className="font-head text-3xl sm:text-[2.6rem] font-bold text-rw-text leading-[1.05] max-w-3xl">{tl("Every pro League of Legends game since 2011.")}</h1>
          <p className="text-sm text-rw-sub max-w-2xl">
            {tl("Results, drafts, builds and records from every tournament. Live scores and stats while games are on, and power rankings that put every region on one scale. Free, no ads, no account.")}
          </p>
          {/* data-search-main: the "/" key focuses this box (App.tsx); the header has none on this page */}
          <div className="max-w-2xl" data-search-main="1">
            <HubSearch big initial={IS_WEB ? new URLSearchParams(window.location.search).get("q") || "" : ""} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted mr-1">{tl("Try")}</span>
            {TRY.map((t) => (
              <HubLink key={t.label} to={t.to} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-rw-border bg-rw-bg/60 text-rw-text hover:border-rw-accent hover:text-rw-accent">
                <span className="text-rw-accent">{t.icon}</span>
                {t.label}
              </HubLink>
            ))}
          </div>
          <p className="text-[11px] text-rw-muted max-w-2xl">
            {tl("A matchup opens match prep, a draft board and a comparison. A player plus a champion opens their games on it. An item shows every pro who ever built it.")}
          </p>
          {meta.data && (
            <dl className="grid grid-cols-3 sm:grid-cols-5 gap-x-5 gap-y-2 pt-3 border-t border-rw-border/60">
              {[
                [fmtNum(meta.data.games), tl("pro games")],
                [fmtNum(meta.data.events), tl("tournaments")],
                [fmtNum(meta.data.players), tl("players")],
                [fmtNum(meta.data.teams), tl("teams")],
                [String(LANGUAGES.length), tl("languages")],
              ].map(([v, label]) => (
                <div key={label}>
                  <dd className="font-num tabular-nums text-xl text-rw-text leading-tight">{v}</dd>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted">{label}</dt>
                </div>
              ))}
            </dl>
          )}
          <LeagueChips />
          <RecentPages />
        </div>
      </section>

      {schedule && settings && onOpenUrl && (
        <TodayMatches schedule={schedule} liveMatches={liveMatches || []} settings={settings} onOpenUrl={onOpenUrl} onSelectTab={onSelectTab} onSelectTeam={onSelectTeam} />
      )}

      {/* the event that is on (Worlds, MSI, First Stand) or the tournaments running now, and the month's best players */}
      {/* grid-cols-1 on phones: a grid's one automatic column grows to its widest row and pushes past the screen */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-stretch">
        <EventNow intl={intl} schedule={schedule} settings={settings} now={home.data?.now} onSelectTab={onSelectTab} />
        {home.data?.potm && home.data.potm.length > 0 ? (
          <PlayersOfTheMonth rows={home.data.potm} from={home.data.potmFrom} />
        ) : (
          <Page state={home}>{(h) => <LatestTournaments latest={h.latest} />}</Page>
        )}
      </div>

      {/* four ways in */}
      <section className="space-y-3">
        <Eyebrow>{tl("Browse")}</Eyebrow>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
          <div className={`${card} flex flex-col`}>
            <h2 className={tileHead}><Trophy className="w-4 h-4 text-rw-accent" />{tl("Tournaments")}</h2>
            <Page state={home}>
              {(h) => (
                <ul className="text-xs space-y-1.5">
                  {(h.now && h.now.length ? [...h.now.slice(0, 1), ...h.latest.filter((e) => !h.now!.some((n) => n.u === e.u))] : h.latest).slice(0, 3).map((e) => (
                    <LatestRow key={e.u} e={e} />
                  ))}
                </ul>
              )}
            </Page>
            <HubLink to={{ kind: "tournaments" }} className={more}>{tl("Every event since 2011 →")}</HubLink>
          </div>
          <div className={`${card} flex flex-col`}>
            <h2 className={tileHead}><Users className="w-4 h-4 text-rw-accent" />{tl("Teams")}</h2>
            <TopTeams rows={ratings.data?.teams} n={3} />
            <HubLink to={{ kind: "teams" }} className={more}>{tl("Every team since 2011, by region →")}</HubLink>
          </div>
          <div className={`${card} flex flex-col`}>
            <h2 className={tileHead}><User className="w-4 h-4 text-rw-accent" />{tl("Players")}</h2>
            <ul className="text-xs space-y-1.5">
              {(home.data?.potm || []).slice(0, 3).map((p) => (
                <li key={p.u || p.n} className="flex items-center gap-2 min-w-0">
                  <PlayerPhoto name={p.n} team={p.t} slug={p.u || undefined} size={24} />
                  <PlayerLink name={p.n} u={p.u} className="font-semibold truncate" />
                  <span className="inline-flex items-center gap-1 text-rw-muted truncate ml-auto">
                    {p.t && <TeamLogo name={p.t} size={13} />}
                    <span className="truncate">{[p.r ? roleName(p.r) : "", p.t].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              ))}
            </ul>
            <HubLink to={{ kind: "players" }} className={more}>{tl("Every player, by role and team →")}</HubLink>
          </div>
          <div className={`${card} flex flex-col`}>
            <h2 className={tileHead}><Swords className="w-4 h-4 text-rw-accent" />{tl("Champions")}</h2>
            <PatchMovers />
          </div>
        </div>
      </section>

      {/* the power rankings and the tools side by side; what is on the line today and the storylines take the whole
          width after them (both lay themselves out in columns) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 items-stretch">
        <section className={`${hot} flex flex-col`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-head text-lg font-bold text-rw-text flex items-center gap-2"><TrendingUp className="w-4 h-4 text-rw-accent" />{tl("Power rankings")}</h2>
            <span className="flex items-center gap-2">
              <span className="text-[10px] text-rw-muted">{tl("30-day change")}</span>
              {ratings.data && ratings.data.teams.length > 0 && (
                <BroadcastCardButton
                  data={() =>
                    rankingsCard({
                      title: tl("Power rankings"),
                      subtitle: tl("Top leagues, all regions"),
                      rows: ratings.data!.teams
                        .filter((t) => t[9] === 1)
                        .sort((a, b) => b[5] - a[5])
                        .slice(0, 10)
                        .map((r) => ({ name: r[1], league: r[10] || r[3], r: r[5], chg: r[6] })),
                    })
                  }
                  name="riftwise-power-rankings"
                />
              )}
            </span>
          </div>
          <TopTeams rows={ratings.data?.teams} n={5} ranked />
          <HubLink to={{ kind: "rankings" }} className={more}>{tl("Every active team on one scale →")}</HubLink>
        </section>
        <section className={`${card} flex flex-col`}>
          <h2 className="font-head text-lg font-bold text-rw-text flex items-center gap-2 mb-2"><ClipboardList className="w-4 h-4 text-rw-accent" />{tl("Tools")}</h2>
          <ul className="text-xs space-y-1.5">
            {(
              [
                [{ kind: "prep" }, tk("Match prep"), tk("form, lanes, drafts, storylines"), <ClipboardList key="p" className="w-3.5 h-3.5" />],
                [{ kind: "draft" }, tk("Draft board"), tk("pools, Fearless, live handoff"), <LayoutGrid key="d" className="w-3.5 h-3.5" />],
                [{ kind: "compare" }, tk("Compare"), tk("any teams or players"), <GitCompare key="c" className="w-3.5 h-3.5" />],
                [{ kind: "finder" }, tk("Game finder"), tk("any game, as CSV too"), <Search key="f" className="w-3.5 h-3.5" />],
                [{ kind: "items" }, tk("Item history"), tk("has a pro ever built it?"), <Package key="i" className="w-3.5 h-3.5" />],
                [{ kind: "data" }, tk("Data downloads"), tk("every game, CSV and JSON"), <Database key="x" className="w-3.5 h-3.5" />],
              ] as [HubRoute, string, string, React.ReactNode][]
            ).map(([to, label, sub, icon]) => (
              <li key={label} className="flex items-center gap-2 min-w-0">
                <span className="text-rw-accent shrink-0">{icon}</span>
                <HubLink to={to} className="font-semibold text-rw-text hover:text-rw-accent shrink-0">{tl(label)}</HubLink>
                <span className="text-rw-muted truncate">{tl(sub)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {schedule && schedule.length > 0 && <AtStakeToday schedule={schedule} />}
      <HomeStorylines />

      <p className="text-[10px] text-rw-muted text-center">
        {tl("Data: Leaguepedia (CC BY-SA 3.0), updated through the day. Game statistics belong to Riot Games.")}
      </p>
    </div>
  );
};

/** m.ss from minutes (32.2 -> 32:12) */
const mmss = (min: number) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, "0")}`;

// ── Today's matches ───────────────────────────────────────────────────────

/** The match that matters most right now (in progress, else the next one), then the next few in a table. */
const TodayMatches: React.FC<{
  schedule: Match[];
  liveMatches: Match[];
  settings: AppSettings;
  onOpenUrl: (url: string) => void;
  onSelectTab?: (tab: TabKey) => void;
  onSelectTeam?: (code: string, name?: string) => void;
}> = ({ schedule, liveMatches, settings, onOpenUrl, onSelectTab, onSelectTeam }) => {
  const live = useMemo(() => liveMatches.filter((m) => m.state === "inProgress" && m.team1Code && m.team2Code), [liveMatches]);
  const next = useMemo(() => {
    const now = Date.now();
    return schedule
      .filter(
        (m) =>
          m.state !== "completed" &&
          m.state !== "inProgress" &&
          Date.parse(m.startTimeUtc) > now - 3 * 60 * 60 * 1000 &&
          m.team1Code &&
          m.team2Code &&
          !/^tbd$/i.test(m.team1Code) &&
          !/^tbd$/i.test(m.team2Code),
      )
      .sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
  }, [schedule]);
  const featured = live[0] || next[0];
  if (!featured) return null;
  const rest = (live.length > 1 ? live.slice(1) : []).concat(next.filter((m) => m.matchId !== featured.matchId)).slice(0, 3);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>{live.length > 0 ? tn("{n} match live now", "{n} matches live now", live.length) : tl("Next up")}</Eyebrow>
        {onSelectTab && (
          <button type="button" onClick={() => onSelectTab("schedule")} className="text-xs font-semibold text-rw-accent hover:underline">
            {tl("Full schedule, results and standings →")}
          </button>
        )}
      </div>
      <FeaturedMatch m={featured} live={live.includes(featured)} schedule={schedule} settings={settings} onOpenUrl={onOpenUrl} onSelectTab={onSelectTab} onSelectTeam={onSelectTeam} />
      {rest.length > 0 && <UpNextTable matches={rest} schedule={schedule} settings={settings} onOpenUrl={onOpenUrl} onSelectTeam={onSelectTeam} timeOf={formatMatchTime} />}
    </section>
  );
};

const FeaturedMatch: React.FC<{
  m: Match;
  live: boolean;
  schedule: Match[];
  settings: AppSettings;
  onOpenUrl: (url: string) => void;
  onSelectTab?: (tab: TabKey) => void;
  onSelectTeam?: (code: string, name?: string) => void;
}> = ({ m, live, schedule, settings, onOpenUrl, onSelectTab, onSelectTeam }) => {
  const h2h = computeHeadToHead(m.team1Code, m.team2Code, schedule, m.matchId);
  const streams = getLeagueBroadcastStreams(m.leagueSlug, m.streamUrl);
  const showScore = live && !settings.spoilerMode;
  const team = (code: string, name: string, image: string | undefined, right: boolean) => {
    const open = () => onSelectTeam?.(code, name);
    const followed = settings.followedTeams.includes(code);
    return (
      <div className={`flex items-center gap-3 min-w-0 ${right ? "flex-row-reverse text-right" : ""}`}>
        {image ? (
          <img {...riotImg(image, 160)} alt="" className="w-12 h-12 sm:w-16 sm:h-16 object-contain shrink-0 cursor-pointer drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]" onClick={open} />
        ) : (
          <div {...clickable(open)} className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-rw-bg border border-rw-border flex items-center justify-center font-num font-bold text-rw-accent shrink-0 cursor-pointer">
            {code.slice(0, 3)}
          </div>
        )}
        <div className="min-w-0">
          {/* phones: the short code (TES), wider screens: the full name */}
          <div {...clickable(open)} className="font-head text-xl sm:text-2xl font-bold text-rw-text leading-tight hover:text-rw-accent cursor-pointer truncate" title={tl("View {team} roster", { team: name })}>
            <span className="sm:hidden">{code}</span>
            <span className="hidden sm:inline">{name}</span>
          </div>
          <div className={`flex items-center gap-1.5 text-xs text-rw-sub font-num ${right ? "justify-end" : ""}`}>
            <span className="hidden sm:inline">{code}</span>
            {followed && <Star className="w-3 h-3 fill-rw-accent text-rw-accent" aria-label={tl("Followed")} />}
          </div>
        </div>
      </div>
    );
  };
  return (
    <section className={`${hot} p-4 sm:p-5 space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {live ? (
            <span className="flex items-center gap-1.5 font-head font-semibold uppercase tracking-wider text-rw-red">
              <span className="w-2 h-2 rounded-full bg-rw-red animate-pulse" />
              {tl("Live now")}
            </span>
          ) : (
            <span className="font-head font-semibold uppercase tracking-wider text-rw-accent">{formatMatchTime(m.startTimeUtc)}</span>
          )}
          <span className="text-rw-muted">
            {m.leagueSlug ? (
              <HubLink to={{ kind: "league", slug: m.leagueSlug }} className="hover:text-rw-accent hover:underline">
                {m.leagueName}
              </HubLink>
            ) : (
              m.leagueName
            )}
            {m.blockName ? ` · ${m.blockName}` : ""} · {tl("Best of {n}", { n: m.bestOf })}
          </span>
        </span>
        {h2h && <H2HMeter team1Code={m.team1Code} team2Code={m.team2Code} h2h={h2h} size="sm" matchId={m.matchId} />}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
        {team(m.team1Code, m.team1Name, m.team1Image, false)}
        <div className="text-center">
          {showScore ? (
            <span className="font-num text-3xl sm:text-4xl font-bold text-rw-text tabular-nums">
              {m.team1Score} – {m.team2Score}
            </span>
          ) : (
            <span className="text-xs font-bold text-rw-sub bg-rw-bg border border-rw-border px-2.5 py-1 rounded-full uppercase tracking-widest font-num">{tl("VS")}</span>
          )}
        </div>
        {team(m.team2Code, m.team2Name, m.team2Image, true)}
      </div>
      <WinChanceLine match={m} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 border-t border-rw-border/60">
        <div className="flex flex-wrap items-center gap-2">
          {live && onSelectTab && (
            <button type="button" onClick={() => onSelectTab("live")} className="px-3 py-1.5 rounded-lg bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs transition-colors">
              {tl("Live stats")}
            </button>
          )}
          <MatchPrepButton match={m} />
          <MatchOverviewButton match={m} />
          <AddToCalendarMenu match={m} onOpenUrl={onOpenUrl} />
          <ShareMatchButton match={m} className="border border-rw-border bg-rw-bg p-1.5" />
        </div>
        {streams.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted mr-1">{tl("Watch")}</span>
            {streams.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenUrl(s.url)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                  s.badge === "LIVE FEED" ? "bg-rw-red/15 border-rw-red/60 text-rw-text" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
                }`}
                title={tl("Open {name} ({url})", { name: s.name, url: s.url })}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// ── The event that is on ──────────────────────────────────────────────────

const EventNow: React.FC<{ intl?: Match; schedule?: Match[]; settings?: AppSettings; now?: EventListItem[]; onSelectTab?: (tab: TabKey) => void }> = ({
  intl,
  schedule,
  settings,
  now,
  onSelectTab,
}) => {
  const ev = intl ? INTL_EVENTS[intl.leagueSlug] : undefined;
  const year = intl?.startTimeUtc.slice(0, 4) || "";
  const running = (now || []).filter((e) => e.sp != null || e.g);
  const title = ev ? `${tc("event", ev.name)} ${year}` : tl("Happening now");
  const open = () => {
    if (ev) navigateHub({ kind: ev.kind });
    else navigateHub({ kind: "tournaments" });
  };
  const line = (e: EventListItem) =>
    [e.sp != null ? tn("{n} series played", "{n} series played", e.sp) : null, e.g ? tn("{n} game", "{n} games", e.g) : null, e.m ? tl("{t} average game", { t: mmss(e.m) }) : null]
      .filter(Boolean)
      .join(" · ");
  return (
    <section className={`${ev ? hot : card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Eyebrow>{ev ? tl("Happening now") : tl("Tournaments")}</Eyebrow>
          <h2 className="font-head text-2xl font-bold text-rw-text leading-tight mt-1">{title}</h2>
          {ev && running[0] && <p className="text-[11px] text-rw-muted font-num">{line(running[0])}</p>}
        </div>
        {ev && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={open} className="px-3 py-1.5 rounded-lg bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs transition-colors">
              {ev.kind === "worlds" ? tl("Swiss and bracket pickers") : tl("Bracket picker")}
            </button>
            <button type="button" onClick={open} className="px-3 py-1.5 rounded-lg border border-rw-border hover:border-rw-accent/60 text-rw-text font-semibold text-xs transition-colors">
              {tl("Stats and records")}
            </button>
          </div>
        )}
      </div>
      {/* the Swiss table while that stage is on; the event's latest results (spoiler-safe) */}
      {ev && schedule && !settings?.spoilerMode && <SwissStandings schedule={schedule} onOpen={open} narrow />}
      {ev && intl && schedule && settings && (
        <LatestResults oneEvent schedule={schedule.filter((m) => m.leagueSlug === intl.leagueSlug)} settings={settings} onSelectTab={(t) => onSelectTab?.(t)} />
      )}
      {!ev && (
        <ul className="text-xs space-y-1.5">
          {running.length === 0 && <li className="text-rw-muted">{tl("No tournament is running this week.")}</li>}
          {running.slice(0, 5).map((e) => (
            <li key={e.u} className="min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <EventLink name={e.n} u={e.u} />
                <span className="text-rw-muted shrink-0">
                  {fmtDate(e.st, false)} – {fmtDate(e.en, false)}
                </span>
              </div>
              <div className="text-[11px] text-rw-muted font-num">{line(e)}</div>
            </li>
          ))}
        </ul>
      )}
      {ev && intl && (
        <p className="text-[11px] text-rw-sub mt-auto">
          {ev.kind === "worlds"
            ? tl("Pick the Swiss stage and the bracket, see every team's chances, and the standout stats so far.")
            : tl("Pick the bracket, see every team's chances, and the standout stats so far.")}
        </p>
      )}
    </section>
  );
};

const LatestTournaments: React.FC<{ latest: EventListItem[] }> = ({ latest }) => (
  <Section title={tl("Latest tournaments")}>
    <ul className="text-xs space-y-1.5">
      {latest.slice(0, 6).map((e) => (
        <LatestRow key={e.u} e={e} />
      ))}
    </ul>
  </Section>
);

// ── Teams and champions ───────────────────────────────────────────────────

/** The highest-rated active teams in the top leagues (the power rankings), with their 30-day change when ranked. */
const TopTeams: React.FC<{ rows?: RatingRow[]; n: number; ranked?: boolean }> = ({ rows, n, ranked }) => {
  const top = useMemo(() => (rows || []).filter((t) => t[9] === 1).sort((a, b) => b[5] - a[5]).slice(0, n), [rows, n]);
  if (!top.length) return <p className="text-xs text-rw-muted">…</p>;
  const maxR = Math.max(1600, ...top.map((t) => t[5]));
  const minR = Math.min(1350, ...top.map((t) => t[5]));
  return (
    <ol className="text-xs space-y-1.5">
      {top.map((t, i) => {
        const barPct = Math.round(Math.max(12, Math.min(100, ((t[5] - (minR - 50)) / Math.max(1, maxR - (minR - 50))) * 100)));
        return (
          <li key={t[0]} className="flex items-center gap-2 min-w-0">
            {ranked && <span className="w-3 text-rw-muted font-num tabular-nums shrink-0">{i + 1}</span>}
            <TeamLogo name={t[1]} code={t[2]} size={22} />
            <TeamLink name={t[1]} u={t[0]} className="font-semibold text-rw-text hover:text-rw-accent truncate" />
            <span className="ml-auto flex items-center gap-2 shrink-0">
              {!ranked && <span className="text-rw-muted">{t[10] || t[3]}</span>}
              <span className="hidden sm:inline-flex w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden shrink-0">
                <span className="h-full bg-rw-accent/80 rounded-full" style={{ width: `${barPct}%` }} />
              </span>
              <span className="font-num tabular-nums font-bold text-rw-text">{Math.round(t[5])}</span>
              {ranked && t[6] != null && (
                <span className={`font-num tabular-nums text-[11px] w-9 text-right ${t[6] >= 0 ? "text-rw-accent" : "text-rw-muted"}`}>
                  {t[6] >= 0 ? "+" : ""}
                  {Math.round(t[6])}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/** The newest patch's biggest movers, for the Champions tile. */
const PatchMovers: React.FC = () => {
  const state = useLoad(loadPatches, []);
  const p = (state.data || []).find((x) => (x.up && x.up.length) || (x.down && x.down.length));
  const before = p ? (state.data || []).find((x) => x.p === p.prev) : undefined;
  const rows: { m: PatchMove; up: boolean }[] = p ? [...(p.up || []).slice(0, 2).map((m) => ({ m, up: true })), ...(p.down || []).slice(0, 1).map((m) => ({ m, up: false }))] : [];
  const maxDelta = Math.max(0.05, ...rows.map(({ m }) => Math.abs(m[1] - m[2])));
  return (
    <>
      <ul className="text-xs space-y-1.5">
        {rows.map(({ m, up }) => {
          const [c, now, was] = m;
          const wr = winChange(m, before);
          const deltaPct = Math.round(Math.max(12, Math.min(100, (Math.abs(now - was) / maxDelta) * 100)));
          const wrTone = wr.now == null ? "" : wr.now >= 0.55 ? "text-rw-teal font-semibold" : wr.now < 0.45 ? "text-rw-red" : "text-rw-sub";
          return (
            <li key={c} className="flex items-center gap-2 min-w-0">
              <ChampIcon name={c} size={22} />
              <HubLink to={{ kind: "champ", slug: prettySlug(c) }} className="font-semibold text-rw-text hover:text-rw-accent truncate">
                {champName(c)}
              </HubLink>
              <span className="ml-auto flex items-center gap-1.5 font-num tabular-nums text-[11px] whitespace-nowrap shrink-0">
                <span className="hidden sm:inline-flex w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden shrink-0">
                  <span className={`h-full rounded-full ${up ? "bg-rw-teal/85" : "bg-rw-red/75"}`} style={{ width: `${deltaPct}%` }} />
                </span>
                <span className={up ? "text-rw-accent" : "text-rw-muted"}>
                  {up ? "▲" : "▼"} {Math.round(Math.abs(now - was) * 100)}%
                </span>
                {wr.now != null && (
                  <span className={wrTone}>
                    · {Math.round(wr.now * 100)}% {tl("WR")}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <HubLink to={{ kind: "champions" }} className={more}>{p ? tl("Patch {patch}, tier list, counters, items →", { patch: p.p }) : tl("Pick, ban and win rates →")}</HubLink>
    </>
  );
};

/** A patch mover's win rate when picked, and its change against the patch before (null when either is unknown). */
function winChange(m: PatchMove, before: PatchRow | undefined): { now: number | null; change: number | null } {
  const [c, , , wins, picks] = m;
  const now = picks ? wins / picks : null;
  const b = before?.c.find((x) => x[0] === c);
  const was = b && b[1] ? b[3] / b[1] : null;
  return { now, change: now != null && was != null && picks >= 5 && (b?.[1] || 0) >= 5 ? now - was : null };
}

// ── Leagues, recent pages, players of the month ───────────────────────────

const INTL_CHIPS: { to: HubRoute; label: string; icon: React.ReactNode }[] = [
  { to: { kind: "worlds" }, label: tk("Worlds"), icon: <Globe className="w-3 h-3" /> },
  { to: { kind: "msi" }, label: tk("MSI"), icon: <Trophy className="w-3 h-3" /> },
  { to: { kind: "first-stand" }, label: tk("First Stand"), icon: <Flag className="w-3 h-3" /> },
];

/**
 * The main leagues playing this year (most games first), each to its league page, and the three international
 * events. From hub/leagues.json: a top league (pr) with a short name (LCK, not KeSPA Cup) that played this year.
 */
const LeagueChips: React.FC = () => {
  const state = useLoad(loadLeagues, []);
  const year = new Date().getFullYear();
  const main = (y: number) =>
    (state.data || []).filter((l) => l.pr && l.s && l.r !== "International" && (l.to || "") >= String(y)).sort((a, b) => b.g - a.g);
  // early in a year, before the leagues start: last year's
  const leagues = (main(year).length >= 4 ? main(year) : main(year - 1)).slice(0, 8);
  if (!leagues.length) return null;
  const chip = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rw-border text-xs font-semibold text-rw-text hover:border-rw-accent/60 hover:text-rw-accent";
  return (
    <nav className="flex flex-wrap items-center gap-1.5" aria-label={tl("Leagues")}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted mr-1">{tl("Leagues")}</span>
      {leagues.map((l) => (
        <HubLink key={l.u} to={{ kind: "league", slug: l.u }} className={chip} title={l.l}>
          {l.s}
        </HubLink>
      ))}
      <span className="w-px h-4 bg-rw-border mx-1" aria-hidden="true" />
      {INTL_CHIPS.map((c) => (
        <HubLink key={c.label} to={c.to} className={chip}>
          <span className="text-rw-accent">{c.icon}</span>
          {tl(c.label)}
        </HubLink>
      ))}
      <HubLink to={{ kind: "leagues" }} className="text-[11px] text-rw-accent hover:underline ml-1">
        {tl("Every league")}
      </HubLink>
    </nav>
  );
};

/** The best-rated players of the last 30 days in the top leagues and international events (hub.py: home.json potm). */
const PlayersOfTheMonth: React.FC<{ rows: NonNullable<import("../../hub/types").HubHome["potm"]>; from?: string }> = ({ rows, from }) => {
  const [hidden, reveal] = useHidden("potm", new Date().toISOString().slice(0, 10));
  return (
    <Section
      title={tl("Players of the month")}
      right={
        hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <span className="flex items-center gap-2" data-nocapture="1">
            <HubLink to={{ kind: "leaders" }} className="text-[11px] text-rw-accent hover:underline">
              {tl("Player leaderboards")}
            </HubLink>
            <SectionCard
              section={tl("Players of the month")}
              name="RiftWise"
              sub={from ? fmtDate(from) : undefined}
              rows={() =>
                rows.slice(0, 10).map((p, i) => ({
                  label: `#${i + 1} · ${p.n}`,
                  sub: [p.r ? roleName(p.r) : "", p.t, `${p.g}G`].filter(Boolean).join(" · "),
                  value: String(Math.round(p.rt)),
                  win: true,
                }))
              }
            />
          </span>
        )
      }
    >
      {hidden ? (
        <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
      ) : (
        <>
          <ol className="space-y-1.5 text-xs">
            {(() => {
              const shown = rows.slice(0, 6);
              const maxG = Math.max(1, ...shown.map((p) => p.g));
              return shown.map((p, i) => (
                <li key={p.u || p.n} className="flex items-center gap-2 min-w-0">
                  <span className="w-3 text-right text-rw-muted tabular-nums shrink-0">{i + 1}</span>
                  <PlayerPhoto name={p.n} team={p.t} slug={p.u || undefined} size={26} />
                  <span className="inline-flex items-center gap-1 truncate min-w-0">
                    <PlayerLink name={p.n} u={p.u} />
                    {p.t && <TeamLogo name={p.t} size={13} />}
                    <span className="text-rw-muted truncate">· {[p.r ? roleName(p.r) : "", p.t].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="ml-auto flex items-center gap-2 shrink-0">
                    <span className="hidden sm:inline-flex w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden shrink-0">
                      <span className="h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.round((p.g / maxG) * 100)}%` }} />
                    </span>
                    <span className="text-[10px] text-rw-muted tabular-nums">{tn("{n} game", "{n} games", p.g)}</span>
                    <RatingBadge v={p.rt} />
                  </span>
                </li>
              ));
            })()}
          </ol>
          <p className="text-[10px] text-rw-muted">
            {tl("Average RiftWise rating since {date} in the top leagues and international events (at least {n} games).", { date: fmtDate(from), n: 6 })}
          </p>
        </>
      )}
    </Section>
  );
};

const chipClass = "px-2 py-0.5 rounded-full border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-line max-w-[14rem] truncate";

/** The pages opened last on this device, plus the week's most viewed across all visitors. */
const RecentPages: React.FC = () => {
  const recent = useRecentPages();
  const recentShown = recent.slice(0, 8);
  const recentKeys = useMemo(() => new Set(recentShown.map((r) => hubPathOf(r.route))), [recentShown]);
  if (!recentShown.length) return <MostViewed />;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-rw-muted font-semibold text-[10px] mr-1">{tl("Recently viewed")}</span>
        {recentShown.map((r) => (
          <HubLink key={hubPathOf(r.route)} to={r.route} className={chipClass}>
            {r.title}
          </HubLink>
        ))}
      </div>
      <MostViewed exclude={recentKeys} />
    </div>
  );
};

/** The pages everyone opened most in the last seven days (src/hub/popular.ts); nothing until there are some. */
const MostViewed: React.FC<{ exclude?: Set<string> }> = ({ exclude }) => {
  const state = useLoad(loadPopular, []);
  const list = (state.data || []).filter((p) => !exclude?.has(hubPathOf(p.route))).slice(0, 8);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-rw-muted font-semibold text-[10px] mr-1">{tl("Most viewed this week")}</span>
      {list.map((p) => (
        <HubLink key={hubPathOf(p.route)} to={p.route} className={chipClass}>
          {p.route.kind === "champ" ? champName(p.title) : p.title}
        </HubLink>
      ))}
    </div>
  );
};
const hubPathOf = (r: HubRoute) => JSON.stringify(r);

const LatestRow: React.FC<{ e: EventListItem }> = ({ e }) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <li className="flex items-center justify-between gap-2 min-w-0">
      <span className="truncate min-w-0">
        <EventLink name={e.n} u={e.u} />
        <span className="text-rw-muted"> · {fmtDate(e.en, false)}</span>
      </span>
      {e.w && (
        <span className="shrink-0 flex items-center gap-1 text-rw-accent">
          {!e.rs && <Crown className="w-3 h-3" />}
          {hidden ? (
            <RevealButton onReveal={reveal} small />
          ) : (
            <span className="inline-flex items-center gap-1 min-w-0">
              <TeamLogo name={e.w} size={14} />
              <TeamLink name={e.w} u={e.wu} className="text-rw-accent hover:underline" />
            </span>
          )}
          {e.rs ? <span className="hidden sm:inline"><StandingsFirst /></span> : null}
        </span>
      )}
    </li>
  );
};

// ── Tournament browser ────────────────────────────────────────────────────

export const EventsBrowse: React.FC<{ year?: string; meta: HubMeta | null; onYear: (y: string) => void }> = ({ year, meta, onYear }) => {
  const years = meta?.years || [];
  const thisYear = String(new Date().getFullYear());
  const y = year || (years.includes(thisYear) ? thisYear : years[0]) || thisYear;
  usePageTitle(tl("Tournaments in {year}", { year: y }));
  const state = useLoad(() => loadEventsOfYear(y), [y]);
  const [scope, setScope] = useState<"main" | "all">("main");
  const [q, setQ] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={y}
          onChange={(e) => onYear(e.target.value)}
          aria-label={tl("Year")}
          className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text"
        >
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-rw-border overflow-hidden">
          {(["main", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-2.5 py-1.5 ${scope === s ? "bg-rw-accent text-rw-bg font-bold" : "text-rw-sub"}`}
            >
              {s === "main" ? tl("Main leagues & internationals") : tl("Everything")}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tl("Filter by name or league…")}
          aria-label={tl("Filter by name or league…")}
          className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-rw-text placeholder-rw-muted flex-1 min-w-[10rem]"
        />
      </div>
      <Page state={state}>{(list) => <EventsTable list={list} scope={scope} q={q} />}</Page>
    </div>
  );
};

const EventsTable: React.FC<{ list: EventListItem[]; scope: "main" | "all"; q: string }> = ({ list, scope, q }) => {
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return list.filter((e) => {
      if (qq) return `${e.n} ${e.l || ""} ${e.r || ""}`.toLowerCase().includes(qq);
      if (e.p) return false; // stages are listed on their event's page
      return scope === "all" || (e.lv === "Primary" && !e.q);
    });
  }, [list, scope, q]);
  if (rows.length === 0) return <p className="text-xs text-rw-sub py-6 text-center">{tl("No tournaments match.")}</p>;
  const maxG = Math.max(1, ...rows.map((e) => e.g || 0));
  return (
    <div className={`${card} space-y-2 overflow-x-auto`}>
      <div className="flex items-center justify-end" data-nocapture="1">
        <SectionCard
          section={tl("Tournaments")}
          name={scope === "main" ? tl("Main leagues & internationals") : tl("Everything")}
          sub={`${rows.length}`}
          rows={() =>
            rows.slice(0, 12).map((e) => ({
              label: e.n,
              sub: [e.r ? regionName(e.r, e.r) : null, fmtDate(e.st, false)].filter(Boolean).join(" · "),
              value: e.w || (e.g ? `${e.g}G` : "–"),
              win: !!e.w,
            }))
          }
        />
      </div>
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Tournament")}</th>
            <th className={th}>{tl("Dates")}</th>
            <th className={`${th} hidden sm:table-cell`}>{tl("Region")}</th>
            <th className={th}>{tl("Winner")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <BrowseRow key={e.u} e={e} maxG={maxG} />
          ))}
        </tbody>
      </STable>
    </div>
  );
};

const BrowseRow: React.FC<{ e: EventListItem; maxG: number }> = ({ e, maxG }) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <tr className="border-t border-rw-border">
      <td className={`${td} max-w-[16rem] truncate`}>
        <EventLink name={e.n} u={e.u} />
      </td>
      <td className={`${td} text-rw-muted`} data-sort={e.st}>
        {fmtDate(e.st, false)}
        {e.en && e.en !== e.st ? ` – ${fmtDate(e.en, false)}` : ""}
      </td>
      <td className={`${td} text-rw-sub max-w-[8rem] truncate hidden sm:table-cell`}>{e.r ? regionName(e.r, e.r) : ""}</td>
      <td className={`${td} max-w-[18rem] truncate`}>
        {e.w ? (
          hidden ? (
            <RevealButton onReveal={reveal} small />
          ) : (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <TeamLogo name={e.w} size={15} />
              <TeamLink name={e.w} u={e.wu} />
            </span>
          )
        ) : (
          ""
        )}
        {e.w && !hidden && e.rs ? <> <StandingsFirst /></> : null}
      </td>
      <td className={`${td} text-rw-muted`} data-sort={e.g || 0}>
        {e.g ? (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="w-5 text-right">{e.g}</span>
            <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
              <span className="h-full bg-rw-accent/75 rounded-full" style={{ width: `${Math.round((e.g / maxG) * 100)}%` }} />
            </span>
          </span>
        ) : (
          ""
        )}
      </td>
    </tr>
  );
};
