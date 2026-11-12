/**
 * Tournament page, in tabs when it has enough to show (each its own address, /tournament/<slug>/<tab>): Overview
 * (results and prize money, the bracket, standings), Matches (every series by stage), Stats (leaders, player and team
 * tables, the stat cards), Champions and Teams (rosters).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, MapPin, CalendarDays, Coins, Download, Sparkles, ClipboardCopy } from "lucide-react";
import { BracketBoard, type BracketColumn } from "../BracketBoard";
import { CountryFlag, countryCode, localCountry } from "./CountryFlag";
import { tl, tn, tk, regionName, stageLabel, eventTitle } from "../../i18n";
import { champName } from "../../champions";
import { winRate } from "../../stats";
import { bare, downloadEventCsv, downloadStagesCsv, loadAliases, loadHubEvent, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolvePlayerSlug, resolveTeamAlias, sameChamp, searchAlias } from "../../hub/data";
import type { HubEvent, SeriesRow, Stage, StandingRow } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { EventPlayerStats, EventTeamStatsTable } from "./EventTables";
import { EventFacts, EventRosters, RegionalRecords } from "./EventExtras";
import { EventStatsSection } from "./EventStats";
import { PlayoffChances } from "./PlayoffChances";
import { BroadcastCardButton, SectionCard, eventCardData } from "./BroadcastCard";
import { WinBar } from "./OpponentChart";
import { currentHubRoute, hubShareUrl, navigateHub, type HubRoute } from "../../hub/route";
import {
  card,
  ChampLink,
  EventLink,
  fmtDate,
  fmtNum,
  fmtUsd,
  HubLink,
  Page,
  PlayerLink,
  PlayerPhoto,
  RevealButton,
  Section,
  Stat,
  td,
  th,
  TeamLink,
  TeamLogo,
  useHidden,
  useHiddenCheck,
  useLoad,
  usePageTitle,
  ratingTextClass,
} from "./ui";
import { STable } from "../STable";
import { JumpBar, PageTabs, type JumpItem, type PageTab } from "./PageTabs";
import { EntityHero, heroBtn, heroLink } from "./EntityHero";

/** The Stats tab's parts, for its "jump to" row (JumpBar leaves out the ones a tournament doesn't have) */
const STATS_JUMPS: JumpItem[] = [
  { id: "jump-leaders", label: tk("Player leaders") },
  { id: "jump-pstats", label: tk("Players") },
  { id: "jump-tstats", label: tk("Teams") },
  { id: "facts-event", label: tk("The event") },
  { id: "facts-teams", label: tk("Team records") },
  { id: "facts-players", label: tk("Player records") },
  { id: "facts-champs", label: tk("Champions and the draft") },
  { id: "jump-regions", label: tk("Region vs region") },
];

/** The tabs' names (the address says the key: /tournament/worlds-2026-main-event/stats) */
const TAB_LABEL: Record<string, string> = {
  "": tk("Overview"),
  matches: tk("Matches"),
  stats: tk("Stats"),
  champions: tk("Champions"),
  teams: tk("Teams"),
};

export const EventPage: React.FC<{ slug: string; tab?: string; onOpenUrl?: (url: string) => void }> = ({ slug, tab, onOpenUrl }) => {
  const state = useLoad(
    () =>
      loadHubEvent(slug).then((e) => {
        const now = currentHubRoute();
        if (e.u && e.u !== slug && now.kind === "event" && now.slug === slug)
          navigateHub({ kind: "event", slug: e.u, ...("tab" in now && now.tab ? { tab: now.tab } : {}), ...("query" in now && now.query ? { query: now.query } : {}) }, { replace: true });
        return e;
      }),
    [slug],
  );
  usePageTitle(state.data ? (tab && TAB_LABEL[tab] ? `${state.data.n} · ${tl(TAB_LABEL[tab])}` : state.data.n) : undefined);
  useDDragon();
  return <Page state={state}>{(e) => <EventView e={e} tab={tab || ""} onOpenUrl={onOpenUrl} />}</Page>;
};

/** Worlds, MSI and First Stand have a page of their own (facts, pickers): the league -> its section */
const INTL_PAGE: Record<string, "worlds" | "msi" | "first-stand"> = {
  "world-championship": "worlds",
  "mid-season-invitational": "msi",
  "first-stand": "first-stand",
};

const EventView: React.FC<{ e: HubEvent; tab: string; onOpenUrl?: (url: string) => void }> = ({ e, tab: asked, onOpenUrl }) => {
  const [resultsHidden, revealResults] = useHidden(`event:${e.u}`, e.end);
  const aliases = useLoad(loadAliases, []);
  const nowRoute = currentHubRoute();
  const routeQuery = nowRoute.kind === "event" && nowRoute.slug === e.u ? nowRoute.query : undefined;
  const urlParams = useMemo(
    () => new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : "")),
    [routeQuery],
  );
  const qParam = urlParams.get("q") || urlParams.get("team") || urlParams.get("player") || urlParams.get("champ") || urlParams.get("vs") || "";
  const champParam = urlParams.get("champ") || urlParams.get("vschamp") || qParam;
  const roleParam = urlParams.get("role") || undefined;
  const teamPlayerTextBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of e.players || []) {
      const ts = p.t ? tSlug(p.t, p.tu) : "";
      if (!ts) continue;
      const prev = map.get(ts) || "";
      map.set(ts, `${prev} ${p.n} ${p.u || ""} ${pSlug(p.n, p.u)}`);
    }
    for (const r of e.rosters || []) {
      const ts = tSlug(r.t, r.u);
      if (!ts) continue;
      const prev = map.get(ts) || "";
      const pStr = r.p.map(([n, u]) => `${n} ${u || ""} ${pSlug(n, u)}`).join(" ");
      map.set(ts, `${prev} ${pStr}`);
    }
    return map;
  }, [e.players, e.rosters]);
  const matchesEventTeam = (t: { t: string; u?: string | null }, term: string) => {
    const ts = resolveTeamAlias(aliases.data?.team[(t.u || t.t).toLowerCase()] || t.u || t.t) || prettySlug(t.t);
    const hay = normText(`${t.t} ${t.u || ""} ${ts} ${teamPlayerTextBySlug.get(ts) || ""}`);
    const qAlias = searchAlias(term);
    if (
      hay.includes(term) ||
      (bare(term).length >= 2 && bare(hay).includes(bare(term))) ||
      (qAlias && (hay.includes(qAlias) || (bare(qAlias).length >= 2 && bare(hay).includes(bare(qAlias)))))
    )
      return true;
    const canonTeam =
      resolveTeamAlias(aliases.data?.team[term] || term) ||
      (qAlias ? resolveTeamAlias(aliases.data?.team[qAlias] || qAlias) : "") ||
      prettySlug(qAlias || term);
    return Boolean(canonTeam && canonTeam === ts);
  };
  const effectiveTeamSearch = useMemo(() => {
    const tq = normText(qParam);
    const tTerms = tq ? tq.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => normText(s)).filter(Boolean) : [];
    if (!tTerms.length || !e.teams?.length) return "";
    const matchingTerms = tTerms.filter((term) => e.teams!.some((t) => matchesEventTeam(t, term)));
    return matchingTerms.length === tTerms.length ? qParam : matchingTerms.join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, e.teams, aliases.data, teamPlayerTextBySlug]);
  const [teamSearch, setTeamSearch] = useState(effectiveTeamSearch);
  const teamUserTyped = useRef(false);
  const lastQParam = useRef(qParam);
  useEffect(() => {
    if (lastQParam.current !== qParam) {
      lastQParam.current = qParam;
      teamUserTyped.current = false;
    }
    if (!teamUserTyped.current) setTeamSearch(effectiveTeamSearch);
  }, [qParam, effectiveTeamSearch]);
  const lists = (e.stages || []).filter((s) => s.kind === "list");
  // the tabs this tournament has something for; one with two parts or fewer stays one page
  const tabs: PageTab[] = [
    { key: "", label: TAB_LABEL[""] },
    ...(lists.length ? [{ key: "matches", label: TAB_LABEL.matches, count: e.series }] : []),
    ...((e.leaders && Object.keys(e.leaders).length) || e.players?.length || e.teamStats?.length || e.ln || e.regions?.length
      ? [{ key: "stats", label: TAB_LABEL.stats }]
      : []),
    ...(e.champs?.length ? [{ key: "champions", label: TAB_LABEL.champions }] : []),
    ...(e.teams?.length || e.rosters?.length ? [{ key: "teams", label: TAB_LABEL.teams, count: e.teams?.length }] : []),
  ];
  const tabbed = tabs.length >= 3;
  const tab = tabbed && tabs.some((t) => t.key === asked) ? asked : "";
  /** is this part on the open tab (everything is, on a one-page tournament) */
  const on = (key: string) => !tabbed || tab === key;
  const to = (key: string): HubRoute => ({
    kind: "event",
    slug: e.u,
    ...(key ? { tab: key } : {}),
    ...(routeQuery ? { query: routeQuery } : {}),
  });
  const qTokens = useMemo(
    () =>
      (urlParams.get("q") || "")
        .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
        .map((s) => s.trim())
        .filter(Boolean),
    [urlParams],
  );
  const urlTeams = useMemo(() => {
    const out: string[] = [];
    const push = (raw?: string | null) => {
      if (!raw?.trim()) return;
      const key = raw.trim().toLowerCase();
      const s = resolveTeamAlias(aliases.data?.team[key] || raw.trim()) || prettySlug(raw.trim());
      if (s && !out.includes(s)) out.push(s);
    };
    push(urlParams.get("team"));
    push(urlParams.get("vs") || urlParams.get("vsteam"));
    const allEvTeams = [...(e.results || []), ...(e.teams || []), ...(e.rosters || [])];
    for (const tok of qTokens) {
      const n = normText(tok);
      const matched = allEvTeams.find((t) => matchesEventTeam(t, n));
      if (matched) push(tSlug(matched.t, matched.u));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams, qTokens, aliases.data, e.results, e.teams, e.rosters, teamPlayerTextBySlug]);
  const urlChamps = useMemo(() => {
    const out: string[] = [];
    const pushExplicit = (raw?: string | null) => {
      if (!raw?.trim()) return;
      for (const part of raw.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)) {
        const s = resolveChampSlug(part.trim());
        if (s && !out.includes(s)) out.push(s);
      }
    };
    pushExplicit(urlParams.get("champ"));
    pushExplicit(urlParams.get("vschamp"));
    for (const tok of qTokens) {
      const matched = (e.champs || []).find((c) => sameChamp(c.c, tok) || matchesChampSearch(c.c, tok));
      if (matched) {
        const s = resolveChampSlug(matched.c);
        if (s && !out.includes(s)) out.push(s);
      }
    }
    return out;
  }, [urlParams, qTokens, e.champs]);
  const urlPlayers = useMemo(() => {
    const out: string[] = [];
    const push = (raw?: string | null) => {
      if (!raw?.trim()) return;
      const s = resolvePlayerSlug(raw.trim()) || prettySlug(raw.trim());
      if (s && !out.includes(s)) out.push(s);
    };
    push(urlParams.get("player"));
    push(urlParams.get("vsplayer"));
    const allEvPlayers: { n: string; u?: string | null }[] = [
      ...(e.players || []),
      ...(e.leaders?.kda || []),
      ...(e.overview?.mvp || []),
      ...(e.rosters || []).flatMap((r) => r.p.map(([n, u]) => ({ n, u }))),
    ];
    for (const tok of qTokens) {
      if ((e.champs || []).some((c) => sameChamp(c.c, tok))) continue;
      const n = normText(tok);
      const matched = allEvPlayers.find((p) => {
        const ps = pSlug(p.n, p.u);
        const hay = normText(`${p.n} ${p.u || ""} ${ps}`);
        return hay.includes(n) || (bare(n).length >= 2 && bare(hay).includes(bare(n)));
      });
      if (matched) push(pSlug(matched.n, matched.u));
    }
    return out;
  }, [urlParams, qTokens, e.champs, e.players, e.leaders, e.overview, e.rosters]);
  const evTopTeams = Array.from(
    new Set(
      [
        ...urlTeams,
        ...(!resultsHidden && e.results ? e.results.map((r) => tSlug(r.t, r.u)) : []),
        ...(e.teams || []).map((t) => tSlug(t.t, t.u)),
      ].filter(Boolean),
    ),
  ).slice(0, 2);
  const evTopChamps = Array.from(
    new Set(
      [
        ...urlChamps,
        ...(!resultsHidden ? (e.champs || []).map((c) => resolveChampSlug(c.c)) : []),
      ].filter(Boolean),
    ),
  ).slice(0, 2);
  const evTopPlayers = Array.from(
    new Set(
      [
        ...urlPlayers,
        ...(!resultsHidden
          ? [
              ...(e.leaders?.kda || []).map((r) => pSlug(r.n, r.u)),
              ...(e.players || []).map((p) => pSlug(p.n, p.u)),
              ...(e.overview?.mvp || []).map((m) => pSlug(m.n, m.u)),
            ]
          : []),
      ].filter(Boolean),
    ),
  ).slice(0, 2);
  return (
    <div>
      <EntityHero
        tabbed={tabbed}
        kicker={
          e.parent ? (
            <>
              {tl("Part of")}{" "}
              <EventLink
                name={e.parent.n}
                u={e.parent.u}
                query={routeQuery || (evTopTeams.length ? `q=${encodeURIComponent(evTopTeams.join(","))}` : undefined)}
                className="text-rw-accent hover:underline"
              />
            </>
          ) : undefined
        }
        title={e.n}
        lines={
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(e.start || e.end) && (
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                      ? { year: (e.start || e.end || "").slice(0, 4) }
                      : {}),
                    ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                    ...(evTopTeams[1] ? { vs: evTopTeams[1] } : {}),
                    ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                    ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                  }).toString(),
                }}
                className="flex items-center gap-1 hover:text-rw-accent hover:underline"
                title={tl("Game finder")}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {fmtDate(e.start)}
                {e.end && e.end !== e.start ? ` – ${fmtDate(e.end)}` : ""}
              </HubLink>
            )}
            {e.league &&
              (e.lu ? (
                <HubLink
                  to={{
                    kind: "league",
                    slug: e.lu,
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                      ? { year: (e.start || e.end || "").slice(0, 4) }
                      : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {e.league}
                </HubLink>
              ) : (
                <span>{e.league}</span>
              ))}
            {e.region && (
              <HubLink to={{ kind: "leagues", query: `q=${encodeURIComponent(e.region)}` }} className="hover:text-rw-accent hover:underline">
                {regionName(e.region, e.region)}
              </HubLink>
            )}
            {(e.country || e.type) && (
              <span className="flex items-center gap-1">
                {countryCode(e.country) ? <CountryFlag cc={countryCode(e.country)} /> : <MapPin className="w-3.5 h-3.5" />}
                {[localCountry(e.country), e.type === "Online" ? tl("Online") : e.type === "Offline" ? tl("On stage") : e.type].filter(Boolean).join(" · ")}
              </span>
            )}
            {e.prize && (
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                      ? { year: (e.start || e.end || "").slice(0, 4) }
                      : {}),
                    ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                    ...(evTopTeams[1] ? { vs: evTopTeams[1] } : {}),
                    ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                    ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                  }).toString(),
                }}
                className="flex items-center gap-1 hover:text-rw-accent hover:underline"
              >
                <Coins className="w-3.5 h-3.5" />
                {tl("Prize pool {amount}", { amount: e.prize })}
              </HubLink>
            )}
          </div>
        }
        extra={
          (e.siblings?.length || 0) > 1 || INTL_PAGE[e.lu || ""] ? (
            <div className="space-y-2">
              {(e.siblings?.length || 0) > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {e.siblings!.map((s) => (
                    <HubLink
                      key={s.u}
                      to={{ kind: "event", slug: s.u, ...(routeQuery ? { query: routeQuery } : {}) }}
                      className={`px-3 py-1.5 rounded-lg text-[13px] border ${
                        s.u === e.u ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
                      }`}
                    >
                      {s.n}
                    </HubLink>
                  ))}
                </div>
              )}
              {INTL_PAGE[e.lu || ""] && (
                <HubLink to={{ kind: INTL_PAGE[e.lu as string], year: e.year || undefined }} className={`${heroLink} font-semibold`}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {tl("Stats and pickers for {event}", { event: eventTitle((e.parent?.n || e.n).replace(/ (Main Event|Play-In)$/, "")) })}
                </HubLink>
              )}
            </div>
          ) : undefined
        }
        aside={
          (e.games || 0) > 0 || (!resultsHidden && e.overview) ? (
            <div className="flex flex-wrap items-center gap-2">
              {!resultsHidden && e.overview && (
                <BroadcastCardButton
                  hero
                  name={`${e.u}-overview`}
                  label={tl("Overview card")}
                  data={() =>
                    eventCardData({
                      name: eventTitle(e.n),
                      when: [e.start && fmtDate(e.start), e.end && e.end !== e.start && fmtDate(e.end)].filter(Boolean).join(" – ") || undefined,
                      podium: (e.results || [])
                        .filter((r) => ["1", "2", "3"].includes(r.p))
                        .sort((x, y) => Number(x.p) - Number(y.p))
                        .map((r) => r.t)
                        .slice(0, 3),
                      o: e.overview!,
                    })
                  }
                />
              )}
              {!resultsHidden && (e.games || 0) > 0 && <CopyEventPost e={e} />}
              {(e.games || 0) > 0 && (
                <>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(e.lu ? { league: e.lu } : {}),
                        ...(e.u ? { event: e.u } : {}),
                        ...(e.start || e.end ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                        ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                        ...(evTopTeams.length || evTopPlayers.length
                          ? { q: [...evTopTeams, ...evTopPlayers].filter(Boolean).join(",") }
                          : {}),
                      }).toString(),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Leaderboards")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(e.lu ? { league: e.lu, scope: e.lu } : {}),
                        ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                          ? { year: (e.start || e.end || "").slice(0, 4), key: `y${(e.start || e.end || "").slice(0, 4)}` }
                          : {}),
                        ...(e.u ? { event: e.u } : {}),
                        ...(evTopChamps.length ? { q: evTopChamps.join(",") } : {}),
                      }).toString() || undefined,
                    }}
                    className={heroBtn()}
                  >
                    {tl("Pro tier list")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        p: `e:${e.u}`,
                        ...(evTopTeams.length ? { teams: evTopTeams.join(",") } : {}),
                        ...(evTopChamps.length ? { champ: evTopChamps.join(",") } : {}),
                      }).toString(),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Draft board")}
                  </HubLink>
                  {evTopChamps[0] && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: new URLSearchParams({
                          champ: evTopChamps[0],
                          ...(evTopChamps[1] ? { vs: evTopChamps[1] } : {}),
                          ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                          ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                          ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                          ...(evTopTeams[1] ? { vsteam: evTopTeams[1] } : {}),
                          ...(e.lu ? { league: e.lu } : {}),
                          event: e.u,
                          ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                            ? { patch: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) }
                            : {}),
                        }).toString(),
                      }}
                      className={heroBtn()}
                    >
                      {tl("Counters")}
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: new URLSearchParams({
                        event: e.u,
                        ...(e.lu ? { league: e.lu } : {}),
                        ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                          ? { year: (e.start || e.end || "").slice(0, 4) }
                          : {}),
                        ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                        ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                        ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                        ...(evTopTeams[1] ? { vs: evTopTeams[1] } : {}),
                        ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                        ...(evTopChamps[1] ? { vschamp: evTopChamps[1] } : {}),
                      }).toString(),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Item history")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: new URLSearchParams({
                        ...(e.lu ? { league: e.lu } : {}),
                        ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                          ? { year: (e.start || e.end || "").slice(0, 4) }
                          : {}),
                        ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                        ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                        ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                        ...(evTopTeams[1] ? { vs: evTopTeams[1] } : {}),
                        ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                        ...(evTopChamps[1] ? { vschamp: evTopChamps[1] } : {}),
                        event: e.u,
                      }).toString(),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Game finder")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      query:
                        new URLSearchParams({
                          ...(e.lu ? { league: e.lu } : {}),
                          ...(evTopTeams.length || evTopPlayers.length
                            ? { q: [...evTopTeams, ...evTopPlayers].filter(Boolean).join(",") }
                            : {}),
                        }).toString() || undefined,
                    }}
                    className={heroBtn()}
                  >
                    {tl("Power rankings")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "best",
                      query:
                        new URLSearchParams({
                          ...(e.lu ? { league: e.lu } : {}),
                          ...(e.u ? { event: e.u } : {}),
                          ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                            ? { year: (e.start || e.end || "").slice(0, 4) }
                            : {}),
                          ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                          ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                          ...(evTopTeams.length ? { q: evTopTeams.join(",") } : {}),
                        }).toString() || undefined,
                    }}
                    className={heroBtn()}
                  >
                    {tl("Best games")}
                  </HubLink>
                  <button
                    type="button"
                    onClick={() =>
                      (e.whole && e.children?.length
                        ? downloadStagesCsv(e.u, e.children.map((c) => c.u), onOpenUrl)
                        : downloadEventCsv(e.u, onOpenUrl)
                      ).catch(() => {})
                    }
                    className={heroBtn()}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {tl("Download every game (CSV)")}
                  </button>
                </>
              )}
            </div>
          ) : undefined
        }
        stats={
          (e.games || 0) > 0
            ? [
                {
                  label: tl("Games"),
                  value: fmtNum(e.games || 0),
                  sub: e.statsGames ? tl("{n} with full stats", { n: fmtNum(e.statsGames) }) : undefined,
                  to: {
                    kind: "finder",
                    query: new URLSearchParams({
                      event: e.u,
                      ...(e.lu ? { league: e.lu } : {}),
                      ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                        ? { year: (e.start || e.end || "").slice(0, 4) }
                        : {}),
                      ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                      ...(evTopTeams[1] ? { vs: evTopTeams[1] } : {}),
                      ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                      ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                    }).toString(),
                  },
                },
                { label: tl("Series"), value: fmtNum(e.series || 0), to: tabbed ? to("matches") : undefined },
                { label: tl("Teams"), value: e.teams?.length || "–", to: tabbed ? to("teams") : undefined },
              ]
            : undefined
        }
      />
      {tabbed && <PageTabs attached tabs={tabs} active={tab} to={to} below={tab === "stats" ? <JumpBar bare items={STATS_JUMPS} /> : undefined} />}
      <div className="rw-page mt-3">
      {/* what most people open a tournament for comes first (TV, 2026-10-28): the bracket and standings, then the
          results and prize money, then the facts */}
      {on("") && <EventBracketBlock e={e} topChamps={evTopChamps} topPlayers={evTopPlayers} />}

      {on("") && e.results && e.results.length > 0 && (
        <Section
          title={e.resultsFrom === "event" ? tl("Final standings (whole event)") : tl("Final standings")}
          right={
            resultsHidden ? (
              <RevealButton onReveal={revealResults} small />
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                {e.results.length >= 1 && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: tSlug(e.results[0].t, e.results[0].u),
                        ...(e.results[1] ? { b: tSlug(e.results[1].t, e.results[1].u) } : {}),
                        period: `e:${e.u}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(tSlug(e.results[0].t, e.results[0].u))}${e.results[1] ? `,${encodeURIComponent(tSlug(e.results[1].t, e.results[1].u))}` : ""}&p=e:${encodeURIComponent(e.u)}${e.champs?.[0]?.c ? `&champ=${encodeURIComponent([resolveChampSlug(e.champs[0].c), e.champs[1]?.c ? resolveChampSlug(e.champs[1].c) : ""].filter(Boolean).join(","))}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a: tSlug(e.results[0].t, e.results[0].u),
                        ...(e.results[1] ? { b: tSlug(e.results[1].t, e.results[1].u) } : {}),
                        period: `e:${e.u}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: new URLSearchParams({
                          event: e.u,
                          ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                          ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                          team: tSlug(e.results[0].t, e.results[0].u),
                          ...(e.results[1] ? { vs: tSlug(e.results[1].t, e.results[1].u) } : {}),
                          ...(e.lu ? { league: e.lu } : {}),
                          ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                          ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                          ...(evTopChamps[1] ? { vschamp: evTopChamps[1] } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    {evTopChamps[0] && (
                      <HubLink
                        to={{
                          kind: "counters",
                          query: new URLSearchParams({
                            champ: evTopChamps[0],
                            ...(evTopChamps[1] ? { vs: evTopChamps[1] } : {}),
                            ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                            ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                            ...(e.results[0] ? { team: tSlug(e.results[0].t, e.results[0].u) } : {}),
                            ...(e.results[1] ? { vsteam: tSlug(e.results[1].t, e.results[1].u) } : {}),
                            ...(e.lu ? { league: e.lu } : {}),
                            event: e.u,
                            ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                              ? { patch: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) }
                              : {}),
                          }).toString(),
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Counters")} →
                      </HubLink>
                    )}
                  </>
                )}
                <HubLink
                  to={{
                    kind: "rankings",
                    query:
                      new URLSearchParams({
                        ...(e.lu ? { league: e.lu } : {}),
                        ...(e.results[0] || evTopPlayers.length
                          ? {
                              q: [
                                e.results[0] ? tSlug(e.results[0].t, e.results[0].u) : "",
                                e.results[1] ? tSlug(e.results[1].t, e.results[1].u) : "",
                                ...evTopPlayers,
                              ]
                                .filter(Boolean)
                                .join(","),
                            }
                          : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      event: e.u,
                      ...(e.lu ? { league: e.lu } : {}),
                      ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                      ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                      ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                      ...(e.results[0] ? { team: tSlug(e.results[0].t, e.results[0].u) } : {}),
                      ...(e.results[1] ? { vs: tSlug(e.results[1].t, e.results[1].u) } : {}),
                      ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                      ...(evTopChamps[1] ? { vschamp: evTopChamps[1] } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query: new URLSearchParams({
                      ...(e.lu ? { league: e.lu, scope: e.lu } : {}),
                      ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                        ? { year: (e.start || e.end || "").slice(0, 4), key: `y${(e.start || e.end || "").slice(0, 4)}` }
                        : {}),
                      event: e.u,
                      ...(evTopChamps.length ? { q: evTopChamps.join(",") } : {}),
                    }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(e.lu ? { league: e.lu } : {}),
                      ...(e.start || e.end ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                      event: e.u,
                      ...(e.results[0] || evTopPlayers.length
                        ? {
                            q: [
                              e.results[0] ? tSlug(e.results[0].t, e.results[0].u) : "",
                              e.results[1] ? tSlug(e.results[1].t, e.results[1].u) : "",
                              ...evTopPlayers,
                            ]
                              .filter(Boolean)
                              .join(","),
                          }
                        : {}),
                      ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <SectionCard
                  section={e.resultsFrom === "event" ? tl("Final standings (whole event)") : tl("Final standings")}
                  sub={eventTitle(e.n)}
                  name={`${e.u}-final-standings`}
                  rows={() =>
                    e.results!.slice(0, 10).map((r, idx) => ({
                      rank: Number(r.p.replace(/\D.*$/, "")) || idx + 1,
                      team: r.t,
                      label: `${r.p}. ${r.t}`,
                      value: r.usd ? fmtUsd(r.usd) : r.p,
                      win: r.p === "1",
                    }))
                  }
                />
              </span>
            )
          }
        >
          {resultsHidden ? (
            <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <STable className="w-full text-xs">
              <thead>
                <tr>
                  <th className={`${th} w-12`}>#</th>
                  <th className={th}>{tl("Team")}</th>
                  <th className={`${th} text-right`}>{tl("Place")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const shown = e.results.slice(0, 32);
                  const maxUsd = Math.max(0, ...shown.map((r) => r.usd || 0));
                  return shown.map((r, i) => {
                    const ts = tSlug(r.t, r.u);
                    const rivalRow = shown.find((x) => tSlug(x.t, x.u) !== ts);
                    const rivalSlug = rivalRow ? tSlug(rivalRow.t, rivalRow.u) : "";
                    const rTeamQ = new URLSearchParams({
                      p: `e:${e.u}`,
                      ...(rivalSlug ? { q: rivalSlug } : {}),
                      ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                      ...(evTopChamps[1] && evTopChamps[1] !== evTopChamps[0] ? { vschamp: evTopChamps[1] } : {}),
                    }).toString();
                    return (
                    <tr key={i} className="border-t border-rw-border first:border-0">
                      <td className={`${td} w-12 font-bold ${r.p === "1" ? "text-rw-accent" : "text-rw-sub"}`} data-sort={Number(r.p.replace(/\D.*$/, "")) || i + 1}>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: new URLSearchParams({
                              event: e.u,
                              ...(e.lu ? { league: e.lu } : {}),
                              ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                              team: ts,
                              ...(rivalSlug ? { vs: rivalSlug } : {}),
                              ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                              ...(evTopPlayers[1] && evTopPlayers[1] !== evTopPlayers[0] ? { vsplayer: evTopPlayers[1] } : {}),
                              ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                              ...(evTopChamps[1] && evTopChamps[1] !== evTopChamps[0] ? { vschamp: evTopChamps[1] } : {}),
                            }).toString(),
                          }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {r.p === "1" && <Trophy className="w-3 h-3 inline mr-1" />}
                          {r.p}
                        </HubLink>
                      </td>
                      <td className={td} data-sort={r.t}>
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <HubLink to={{ kind: "team", slug: ts, query: rTeamQ }} title={r.t}>
                            <TeamLogo name={r.t} size={16} />
                          </HubLink>
                          <TeamLink name={r.t} u={r.u} query={rTeamQ} />
                        </span>
                      </td>
                      <td className={`${td} text-right text-rw-muted`} data-sort={r.usd || 0}>
                        {r.usd ? (
                          <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
                            {maxUsd > 0 && (
                              <span className="w-12 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                                <span
                                  className={`h-full rounded-full ${r.p === "1" ? "bg-rw-teal/85" : "bg-rw-accent/75"}`}
                                  style={{ width: `${Math.max(6, Math.round((r.usd / maxUsd) * 100))}%` }}
                                />
                              </span>
                            )}
                            <HubLink
                              to={{
                                kind: "team",
                                slug: ts,
                                tab: "stats",
                                query: rTeamQ,
                              }}
                              className="hover:text-rw-accent hover:underline"
                              title={tl("Stats")}
                            >
                              {fmtUsd(r.usd)}
                            </HubLink>
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                    );
                  });
                })()}
              </tbody>
            </STable>
          )}
        </Section>
      )}

      {on("") && e.overview && (
        <EventFacts
          o={e.overview}
          slug={e.u}
          leagueSlug={e.lu}
          year={(e.start || e.end || "").slice(0, 4)}
          hidden={resultsHidden}
          card={{
            name: `${e.u}-overview`,
            data: () =>
              eventCardData({
                name: eventTitle(e.n),
                when: [e.start && fmtDate(e.start), e.end && e.end !== e.start && fmtDate(e.end)].filter(Boolean).join(" – ") || undefined,
                // the podium: the final standings' top three (one team per place)
                podium: (e.results || []).filter((r) => ["1", "2", "3"].includes(r.p)).sort((x, y) => Number(x.p) - Number(y.p)).map((r) => r.t).slice(0, 3),
                o: e.overview!,
              }),
          }}
        />
      )}

      {on("matches") && lists.length > 0 && (
        <div className="rw-span">
          <StageLists stages={lists} eventSlug={e.u} leagueSlug={e.lu} initialSearch={qParam} topChamps={evTopChamps} topPlayers={evTopPlayers} teamPlayerTextBySlug={teamPlayerTextBySlug} />
        </div>
      )}

      {on("") && e.children && e.children.length > 0 && (
        <Section
          title={tl("Stages")}
          right={
            <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
              <HubLink
                to={{
                  kind: "tournaments",
                  ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                    ? { year: (e.start || e.end || "").slice(0, 4) }
                    : {}),
                  query:
                    new URLSearchParams({
                      ...(e.lu ? { league: e.lu } : {}),
                    }).toString() || undefined,
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Tournaments")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    p: `e:${e.u}`,
                    ...(!resultsHidden && e.results?.[0]
                      ? {
                          teams: [
                            tSlug(e.results[0].t, e.results[0].u),
                            e.results[1] ? tSlug(e.results[1].t, e.results[1].u) : "",
                          ]
                            .filter(Boolean)
                            .join(","),
                        }
                      : e.teams?.[0]
                        ? {
                            teams: [
                              tSlug(e.teams[0].t, e.teams[0].u),
                              e.teams[1] ? tSlug(e.teams[1].t, e.teams[1].u) : "",
                            ]
                              .filter(Boolean)
                              .join(","),
                          }
                        : {}),
                    ...(!resultsHidden && e.champs?.[0]?.c
                      ? {
                          champ: [
                            resolveChampSlug(e.champs[0].c),
                            e.champs[1]?.c ? resolveChampSlug(e.champs[1].c) : "",
                          ]
                            .filter(Boolean)
                            .join(","),
                        }
                      : {}),
                  }).toString(),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                    ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                    ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                    ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                    ...(evTopTeams[1] ? { vs: evTopTeams[1] } : {}),
                    ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                    ...(evTopChamps[1] ? { vschamp: evTopChamps[1] } : {}),
                  }).toString(),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              {evTopChamps[0] && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: evTopChamps[0],
                      ...(evTopChamps[1] ? { vs: evTopChamps[1] } : {}),
                      ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                      ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                      ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                      ...(evTopTeams[1] ? { vsteam: evTopTeams[1] } : {}),
                      ...(e.lu ? { league: e.lu } : {}),
                      event: e.u,
                      ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                        ? { patch: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) }
                        : {}),
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "rankings",
                  query:
                    new URLSearchParams({
                      ...(e.lu ? { league: e.lu } : {}),
                      ...(evTopTeams.length || evTopPlayers.length
                        ? { q: [...evTopTeams, ...evTopPlayers].filter(Boolean).join(",") }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(e.lu ? { league: e.lu, scope: e.lu } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                      ? { year: (e.start || e.end || "").slice(0, 4), key: `y${(e.start || e.end || "").slice(0, 4)}` }
                      : {}),
                    event: e.u,
                    ...(evTopChamps.length ? { q: evTopChamps.join(",") } : {}),
                  }).toString() || undefined,
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                      ? { year: (e.start || e.end || "").slice(0, 4) }
                      : {}),
                    ...(evTopPlayers[0] ? { player: evTopPlayers[0] } : {}),
                    ...(evTopPlayers[1] ? { vsplayer: evTopPlayers[1] } : {}),
                    ...(evTopTeams[0] ? { team: evTopTeams[0] } : {}),
                    ...(evTopTeams[1] ? { vs: evTopTeams[1] } : {}),
                    ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                    ...(evTopChamps[1] ? { vschamp: evTopChamps[1] } : {}),
                    event: e.u,
                  }).toString(),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(e.start || e.end ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                    event: e.u,
                    ...(evTopTeams.length || evTopPlayers.length
                      ? { q: [...evTopTeams, ...evTopPlayers].filter(Boolean).join(",") }
                      : {}),
                    ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                  }).toString(),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
            </span>
          }
        >
          <ul className="text-xs space-y-1">
            {e.children.map((c) => (
              <li key={c.u}>
                <EventLink
                  name={c.n}
                  u={c.u}
                  query={routeQuery || (evTopTeams.length ? `q=${encodeURIComponent(evTopTeams.join(","))}` : undefined)}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* the leaders' game counts tell who went deep: hidden with the results */}
      {on("stats") && e.leaders && Object.keys(e.leaders).length > 0 && !resultsHidden && (
        <div id="jump-leaders" className="rw-span">
          <Leaders e={e} />
        </div>
      )}

      {/* wide tables: the whole page width on multi-column screens (the ids: the Stats tab's "jump to" row) */}
      {on("stats") && (
        <div className="rw-span space-y-3">
          {!!e.players?.length && !resultsHidden && (
            <div id="jump-pstats">
              <EventPlayerStats e={e} hidden={resultsHidden} initialSearch={qParam} initialRole={roleParam} />
            </div>
          )}
          {!!e.teamStats?.length && !resultsHidden && (
            <div id="jump-tstats">
              <EventTeamStatsTable e={e} hidden={resultsHidden} initialSearch={qParam} />
            </div>
          )}
          {/* the stats cards (records, objectives, the draft...) from every game's scoreboard */}
          {e.ln && !resultsHidden ? <EventStatsSection slug={e.u} name={eventTitle(e.n)} end={e.end} leagueSlug={e.lu} year={(e.start || e.end || "").slice(0, 4)} /> : null}
        </div>
      )}
      {on("stats") && !!e.regions?.length && !resultsHidden && (
        <div id="jump-regions" className="rw-span">
          <RegionalRecords e={e} hidden={resultsHidden} />
        </div>
      )}
      {tabbed && tab === "stats" && resultsHidden && (
        <p className="text-xs text-rw-sub flex items-center gap-2">
          {tl("Hidden while spoiler mode is on.")} <RevealButton onReveal={revealResults} />
        </p>
      )}

      {((on("champions") && e.champs && e.champs.length > 0) || (on("teams") && e.teams && e.teams.length > 0)) && (
        <div className={tabbed ? "rw-span" : "grid gap-3 md:grid-cols-2"}>
          {on("champions") && e.champs && e.champs.length > 0 && <EventChamps e={e} full={tabbed} initialSearch={champParam} topTeams={evTopTeams} topPlayers={evTopPlayers} />}
          {on("teams") && e.teams && e.teams.length > 0 && (() => {
            const tq = normText(teamSearch);
            const tTerms = tq ? tq.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => normText(s)).filter(Boolean) : [];
            const filteredTeams = tTerms.length
              ? e.teams.filter((t) => tTerms.some((term) => matchesEventTeam(t, term)))
              : e.teams;
            const ft0 = filteredTeams[0] ? tSlug(filteredTeams[0].t, filteredTeams[0].u) : "";
            const ft1 =
              [...filteredTeams, ...e.teams]
                .map((t) => tSlug(t.t, t.u))
                .find((s) => Boolean(s) && s !== ft0) || "";
            const ftPlayers = Array.from(
              new Set(
                [
                  ...(e.players || [])
                    .filter((p) => {
                      const pt = p.t ? tSlug(p.t, p.tu) : "";
                      return pt === ft0 || (ft1 && pt === ft1);
                    })
                    .map((p) => pSlug(p.n, p.u)),
                  ...evTopPlayers,
                ].filter(Boolean),
              ),
            ).slice(0, 2);
            return (
              <Section
                title={tl("Teams")}
                right={
                  <span className="flex flex-wrap items-center gap-2">
                    {(e.teams.length > 8 || Boolean(teamSearch.trim())) && (
                      <input
                        type="search"
                        value={teamSearch}
                        onChange={(ev) => {
                          teamUserTyped.current = true;
                          setTeamSearch(ev.target.value);
                        }}
                        placeholder={tl("Filter by name or team…")}
                        aria-label={tl("Filter by name or team…")}
                        data-nocapture="1"
                        className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
                      />
                    )}
                    {!resultsHidden && ft0 && (
                      <>
                        <HubLink
                          to={{
                            kind: "prep",
                            a: ft0,
                            ...(ft1 ? { b: ft1 } : {}),
                            period: `e:${e.u}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Match prep")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "draft",
                            query: `teams=${encodeURIComponent(ft0)}${ft1 ? `,${encodeURIComponent(ft1)}` : ""}&p=e:${encodeURIComponent(e.u)}${evTopChamps.length ? `&champ=${encodeURIComponent(evTopChamps.join(","))}` : ""}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Draft board")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "compare",
                            mode: "team",
                            a: ft0,
                            ...(ft1 ? { b: ft1 } : {}),
                            period: `e:${e.u}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Compare")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "items",
                            query: new URLSearchParams({
                              event: e.u,
                              ...(ftPlayers[0] ? { player: ftPlayers[0] } : {}),
                              ...(ftPlayers[1] ? { vsplayer: ftPlayers[1] } : {}),
                              team: ft0,
                              ...(ft1 ? { vs: ft1 } : {}),
                              ...(e.lu ? { league: e.lu } : {}),
                              ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                              ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                              ...(evTopChamps[1] ? { vschamp: evTopChamps[1] } : {}),
                            }).toString(),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Item history")} →
                        </HubLink>
                      </>
                    )}
                    {!resultsHidden && (
                      <>
                        {evTopChamps[0] && (
                          <HubLink
                            to={{
                              kind: "counters",
                              query: new URLSearchParams({
                                champ: evTopChamps[0],
                                ...(evTopChamps[1] ? { vs: evTopChamps[1] } : {}),
                                ...(ftPlayers[0] ? { player: ftPlayers[0] } : {}),
                                ...(ftPlayers[1] ? { vsplayer: ftPlayers[1] } : {}),
                                ...(ft0 ? { team: ft0 } : {}),
                                ...(ft1 ? { vsteam: ft1 } : {}),
                                ...(e.lu ? { league: e.lu } : {}),
                                event: e.u,
                                ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                                  ? { patch: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) }
                                  : {}),
                              }).toString(),
                            }}
                            className="text-[11px] text-rw-accent hover:underline"
                          >
                            {tl("Counters")} →
                          </HubLink>
                        )}
                        <HubLink
                          to={{
                            kind: "rankings",
                            query:
                              new URLSearchParams({
                                ...(e.lu ? { league: e.lu } : {}),
                                ...(ft0 || ftPlayers.length
                                  ? { q: [ft0, ft1, ...ftPlayers].filter(Boolean).join(",") }
                                  : {}),
                              }).toString() || undefined,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Power rankings")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "leaders",
                            query: new URLSearchParams({
                              ...(e.lu ? { league: e.lu } : {}),
                              ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                              ...(!e.whole ? { event: e.u } : {}),
                              ...(ft0 || ftPlayers.length
                                ? { q: [ft0, ft1, ...ftPlayers].filter(Boolean).join(",") }
                                : {}),
                              ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                            }).toString(),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Player leaderboards")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: new URLSearchParams({
                              event: e.u,
                              ...(e.lu ? { league: e.lu } : {}),
                              ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                              ...(ftPlayers[0] ? { player: ftPlayers[0] } : {}),
                              ...(ftPlayers[1] ? { vsplayer: ftPlayers[1] } : {}),
                              ...(ft0 ? { team: ft0 } : {}),
                              ...(ft1 ? { vs: ft1 } : {}),
                              ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                              ...(evTopChamps[1] ? { vschamp: evTopChamps[1] } : {}),
                            }).toString(),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Game finder")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "tiers",
                            query: new URLSearchParams({
                              ...(e.lu ? { scope: e.lu, league: e.lu } : {}),
                              ...(e.start || e.end ? { key: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) } : {}),
                              event: e.u,
                              ...(evTopChamps.length ? { q: evTopChamps.join(",") } : {}),
                            }).toString() || undefined,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Pro tier list")} →
                        </HubLink>
                        <SectionCard
                          section={tl("Teams")}
                          sub={eventTitle(e.n)}
                          name={`${e.u}-teams`}
                          rows={() =>
                            filteredTeams.slice(0, 12).map((t, idx) => ({
                              rank: idx + 1,
                              team: t.t,
                              label: t.t,
                              sub: `${t.w}-${t.g - t.w} ${tl("Games")}`,
                              value: `${t.sw}-${t.sg - t.sw}`,
                              win: t.sg ? t.sw / t.sg >= 0.5 : undefined,
                            }))
                          }
                        />
                      </>
                    )}
                  </span>
                }
              >
                <STable className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className={th}>{tl("Team")}</th>
                      <th className={th}>{tl("Series")}</th>
                      <th className={th}>{tl("Games")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeams.map((t) => {
                      const ts = tSlug(t.t, t.u);
                      const rivalRow = filteredTeams.find((x) => tSlug(x.t, x.u) !== ts);
                      const rivalSlug = rivalRow ? tSlug(rivalRow.t, rivalRow.u) : "";
                      const tRowQ = new URLSearchParams({
                        p: `e:${e.u}`,
                        ...(rivalSlug ? { q: rivalSlug } : {}),
                        ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                        ...(evTopChamps[1] && evTopChamps[1] !== evTopChamps[0] ? { vschamp: evTopChamps[1] } : {}),
                      }).toString();
                      const tFinderQ = new URLSearchParams({
                        event: e.u,
                        ...(e.lu ? { league: e.lu } : {}),
                        ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                        team: ts,
                        ...(rivalSlug ? { vs: rivalSlug } : {}),
                        ...(ftPlayers[0] ? { player: ftPlayers[0] } : {}),
                        ...(ftPlayers[1] && ftPlayers[1] !== ftPlayers[0] ? { vsplayer: ftPlayers[1] } : {}),
                        ...(evTopChamps[0] ? { champ: evTopChamps[0] } : {}),
                        ...(evTopChamps[1] && evTopChamps[1] !== evTopChamps[0] ? { vschamp: evTopChamps[1] } : {}),
                      }).toString();
                      return (
                    <tr key={t.t} className="border-t border-rw-border">
                      <td className={`${td} max-w-[12rem]`} data-sort={t.t}>
                        <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                          <HubLink to={{ kind: "team", slug: ts, query: tRowQ }} title={t.t} className="shrink-0">
                            <TeamLogo name={t.t} size={16} />
                          </HubLink>
                          <TeamLink name={t.t} u={t.u} query={tRowQ} className="truncate" />
                        </span>
                      </td>
                      <td className={`${td} text-rw-sub`} data-sort={t.sg ? t.sw / t.sg : 0}>
                        {resultsHidden ? (
                          "–"
                        ) : (
                          <HubLink
                            to={{
                              kind: "finder",
                              query: tFinderQ,
                            }}
                            className="hover:opacity-90"
                            title={tl("Game finder")}
                          >
                            {t.sg ? <WinBar w={t.sw} g={t.sg} showRecord /> : `${t.sw}-${t.sg - t.sw}`}
                          </HubLink>
                        )}
                      </td>
                      <td className={`${td} text-rw-sub`} data-sort={t.g ? t.w / t.g : 0}>
                        {resultsHidden ? (
                          "–"
                        ) : (
                          <HubLink
                            to={{
                              kind: "finder",
                              query: tFinderQ,
                            }}
                            className="hover:opacity-90"
                            title={tl("Game finder")}
                          >
                            <WinBar w={t.w} g={t.g} showRecord />
                          </HubLink>
                        )}
                      </td>
                    </tr>
                      );
                    })}
                  </tbody>
                </STable>
              </Section>
            );
          })()}
        </div>
      )}
      {on("teams") && e.rosters && e.rosters.length > 0 && (
        <EventRosters rosters={e.rosters} eventSlug={e.u} leagueSlug={e.lu} year={(e.start || e.end || "").slice(0, 4)} initialSearch={qParam} />
      )}
      </div>
    </div>
  );
};

// ── Series boxes ──────────────────────────────────────────────────────────

const tSlug = (name: string, u?: string | null) => u || resolveTeamAlias(name) || prettySlug(name);
const pSlug = (name: string, u?: string | null) => u || resolvePlayerSlug(name) || prettySlug(name);

/** One series as two team lines with scores; links to its match page. */
const seriesKey = (r: SeriesRow) => `series:${r.g || r.a + r.b + r.date}`;

export const SeriesBox: React.FC<{ r: SeriesRow; hideResult?: boolean; note?: React.ReactNode; compact?: boolean; eventSlug?: string; leagueSlug?: string | null; year?: number | string | null }> = ({ r, hideResult, note, compact, eventSlug, leagueSlug, year }) => {
  const [hiddenBySpoiler, reveal] = useHidden(seriesKey(r), r.date);
  const hidden = hideResult || hiddenBySpoiler;
  const played = r.sa != null && r.sb != null;
  const au = r.a ? tSlug(r.a, r.au) : "";
  const bu = r.b ? tSlug(r.b, r.bu) : "";
  const sYr = /^\d{4}$/.test((r.date || "").slice(0, 4))
    ? (r.date || "").slice(0, 4)
    : year != null && /^\d{4}$/.test(String(year))
      ? String(year)
      : "";
  const sPeriod = eventSlug ? `e:${eventSlug}` : sYr ? `y${sYr}` : undefined;
  const sPeriodQ = sPeriod ? `p=${encodeURIComponent(sPeriod)}` : undefined;
  const line = (name: string, u: string | null, score: number | null, won: boolean, oppSlug?: string) => {
    const mySlug = tSlug(name, u);
    const lineQ =
      new URLSearchParams({
        ...(sPeriod ? { p: sPeriod } : {}),
        ...(oppSlug && oppSlug !== mySlug ? { q: oppSlug } : {}),
      }).toString() || undefined;
    return (
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className={`inline-flex items-center gap-1.5 truncate min-w-0 ${!hidden && won ? "text-rw-text font-bold" : "text-rw-sub"}`}>
          <HubLink to={{ kind: "team", slug: mySlug, ...(lineQ ? { query: lineQ } : {}) }} title={name} className="shrink-0">
            <TeamLogo name={name} size={14} />
          </HubLink>
          <TeamLink name={name} u={u} query={lineQ} className={`truncate ${!hidden && won ? "text-rw-text font-bold hover:underline" : "text-rw-sub hover:text-rw-text hover:underline"}`} />
        </span>
        <span className={`tabular-nums font-bold shrink-0 ${!hidden && won ? "text-rw-teal" : "text-rw-muted"}`}>
          {played ? (
            hidden ? (
              "?"
            ) : r.g && !hideResult ? (
              <HubLink to={{ kind: "match", slug: r.g }} className="hover:underline">
                {score}
              </HubLink>
            ) : (
              score
            )
          ) : (
            ""
          )}
        </span>
      </div>
    );
  };
  return (
    <div className={`bg-rw-bg border border-rw-border rounded-lg ${compact ? "px-2 py-1" : "px-2.5 py-1.5"} text-xs min-w-0`}>
      {line(r.a, r.au, r.sa, r.w === 1, bu)}
      {line(r.b, r.bu, r.sb, r.w === 2, au)}
      <div className="flex items-center justify-between gap-2 mt-0.5 text-[10px] text-rw-muted">
        <span className="truncate">
          {r.g && !hideResult ? (
            <HubLink to={{ kind: "match", slug: r.g }} className="hover:text-rw-text hover:underline">
              {note ?? fmtDate(r.date, false)}
            </HubLink>
          ) : (
            note ?? fmtDate(r.date, false)
          )}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {hiddenBySpoiler && !hideResult && played && <RevealButton onReveal={reveal} small />}
          {au && bu && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: au,
                  b: bu,
                  period: sPeriod,
                }}
                className="hidden sm:inline hover:text-rw-accent hover:underline"
                title={tl("Match prep")}
              >
                {tl("Match prep")}
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: au,
                  b: bu,
                  period: sPeriod,
                }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Compare")}
              >
                {tl("vs")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(au)},${encodeURIComponent(bu)}${sPeriodQ ? `&${sPeriodQ}` : ""}`,
                }}
                className="hidden sm:inline hover:text-rw-accent hover:underline"
                title={tl("Draft board")}
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    team: au,
                    vs: bu,
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(sYr ? { year: sYr } : {}),
                  }).toString(),
                }}
                className="hidden sm:inline hover:text-rw-accent hover:underline"
                title={tl("Item history")}
              >
                {tl("Item history")}
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    team: au,
                    vs: bu,
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(sYr ? { year: sYr } : {}),
                  }).toString(),
                }}
                className="hidden sm:inline hover:text-rw-accent hover:underline"
                title={tl("Game finder")}
              >
                {tl("Game finder")}
              </HubLink>
            </>
          )}
          {!hidden && r.r != null &&
            (r.g && !hideResult ? (
              <HubLink
                to={{ kind: "match", slug: r.g }}
                className={`tabular-nums font-semibold hover:underline ${ratingTextClass(r.r)}`}
                title={tl("Series rating: mostly its best game, then its other games")}
              >
                {r.r.toFixed(0)}
              </HubLink>
            ) : (
              <span className={`tabular-nums font-semibold ${ratingTextClass(r.r)}`} title={tl("Series rating: mostly its best game, then its other games")}>
                {r.r.toFixed(0)}
              </span>
            ))}
          {r.g && !hideResult ? (
            <HubLink to={{ kind: "match", slug: r.g }} className="text-rw-accent hover:underline">
              {tl("Details")}
            </HubLink>
          ) : !played && au && bu ? (
            <HubLink to={{ kind: "prep", a: au, b: bu, period: sPeriod }} className="text-rw-accent hover:underline">
              {tl("Match prep")}
            </HubLink>
          ) : null}
        </span>
      </div>
    </div>
  );
};

/**
 * A tournament's bracket and standings, as far as it has them: its own knockout rounds and tables (with each team's
 * chances while a league table is still being played), else its stages' (ChildStages). The top of a tournament's
 * Overview, and of the Worlds, MSI and First Stand pages in the years their pickers don't cover.
 */
export const EventBracketBlock: React.FC<{ e: HubEvent; topChamps?: string[]; topPlayers?: string[] }> = ({ e, topChamps = [], topPlayers = [] }) => {
  const st = e.stages || [];
  const bracket = st.filter((s) => s.kind === "bracket");
  const tables = e.standings || [];
  return (
    <>
      {bracket.length > 0 && (
        <Bracket
          stages={bracket}
          eventSlug={e.u}
          leagueSlug={e.lu}
          year={(e.start || e.end || "").slice(0, 4)}
          topChamps={topChamps}
          topPlayers={topPlayers}
        />
      )}
      {tables.length > 0 && (
        <div className={`grid gap-3 ${tables.length > 1 ? "md:grid-cols-2" : ""}`}>
          {tables.map((t, i) => (
            <Standings
              key={i}
              name={t.name === "Standings" ? tl("Standings") : tl("Group {name}", { name: t.name.replace(/^Group /, "") })}
              rows={t.rows}
              end={e.end}
              eventSlug={e.u}
              leagueSlug={e.lu}
              year={(e.start || e.end || "").slice(0, 4)}
              topChamps={topChamps}
              topPlayers={topPlayers}
            />
          ))}
        </div>
      )}
      {/* a league table still being played: each team's chance of first place and of a top-N finish */}
      <PlayoffChances e={e} />
      {!!e.children?.length && !bracket.length && !st.some((s) => s.kind === "list") && !tables.length && <ChildStages kids={e.children} />}
    </>
  );
};

/**
 * The stages of a whole event (Play-In, Swiss, Main Event...) on the parent's page: pick a stage, see its bracket,
 * standings and series. Starts on the newest stage that has a bracket (the knockouts), else the newest stage.
 */
const ChildStages: React.FC<{ kids: { n: string; u: string }[] }> = ({ kids }) => {
  const state = useLoad(() => Promise.all(kids.map((k) => loadHubEvent(k.u).catch(() => null))), [kids.map((k) => k.u).join()]);
  const loaded = (state.data || []).filter((x): x is HubEvent => !!x && !!((x.stages && x.stages.length) || (x.standings && x.standings.length)));
  const start = useMemo(() => {
    const withBracket = loaded.map((x, i) => ((x.stages || []).some((st) => st.kind === "bracket") ? i : -1)).filter((i) => i >= 0);
    return withBracket.length ? withBracket[withBracket.length - 1] : loaded.length - 1;
  }, [loaded]);
  const [pick, setPick] = useState<number | null>(null);
  if (!loaded.length) return null;
  const i = Math.min(pick ?? start, loaded.length - 1);
  const x = loaded[i];
  const st = x.stages || [];
  const b = st.filter((s) => s.kind === "bracket");
  const l = st.filter((s) => s.kind === "list");
  const childTopChamps = Array.from(new Set((x.champs || []).map((c) => resolveChampSlug(c.c)).filter(Boolean))).slice(0, 2);
  const childTopPlayers = Array.from(
    new Set(
      [
        ...(x.leaders?.kda || []).map((r) => pSlug(r.n, r.u)),
        ...(x.players || []).map((p) => pSlug(p.n, p.u)),
      ].filter(Boolean),
    ),
  ).slice(0, 2);
  const childTopTeams = Array.from(
    new Set(
      [
        ...(x.results || []).map((r) => tSlug(r.t, r.u)),
        ...(x.teams || []).map((t) => tSlug(t.t, t.u)),
        ...(x.standings?.[0]?.rows || []).map((r) => tSlug(r.t, r.u)),
      ].filter(Boolean),
    ),
  ).slice(0, 2);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-[10px] font-semibold text-rw-muted mr-1">{tl("Stages")}</span>
        {loaded.map((k, j) => (
          <button
            key={k.u}
            type="button"
            onClick={() => setPick(j)}
            className={`px-2.5 py-1.5 min-h-8 rounded border ${j === i ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
          >
            {k.n}
          </button>
        ))}
        <EventLink
          name={tl("Open {stage}", { stage: x.n })}
          u={x.u}
          query={childTopTeams.length ? `q=${encodeURIComponent(childTopTeams.join(","))}` : undefined}
          className="ml-auto text-rw-accent hover:underline"
        />
      </div>
      {b.length > 0 && <Bracket key={x.u} stages={b} eventSlug={x.u} leagueSlug={x.lu} year={(x.start || x.end || "").slice(0, 4)} topChamps={childTopChamps} topPlayers={childTopPlayers} />}
      {x.standings && x.standings.length > 0 && (
        <div className={`grid gap-3 ${x.standings.length > 1 ? "md:grid-cols-2" : ""}`}>
          {x.standings.map((t, k) => (
            <Standings
              key={k}
              name={t.name === "Standings" ? tl("Standings") : tl("Group {name}", { name: t.name.replace(/^Group /, "") })}
              rows={t.rows}
              end={x.end}
              eventSlug={x.u}
              leagueSlug={x.lu}
              year={(x.start || x.end || "").slice(0, 4)}
              topChamps={childTopChamps}
              topPlayers={childTopPlayers}
            />
          ))}
        </div>
      )}
      {l.length > 0 && <StageLists key={x.u} stages={l} eventSlug={x.u} leagueSlug={x.lu} topChamps={childTopChamps} topPlayers={childTopPlayers} />}
    </div>
  );
};

/** Knockout rounds as bracket columns (quarterfinals → semifinals → final), joined by lines. */
export const Bracket: React.FC<{
  stages: Stage[];
  hide?: (r: SeriesRow) => boolean;
  note?: (r: SeriesRow) => React.ReactNode;
  title?: string;
  eventSlug?: string;
  leagueSlug?: string | null;
  year?: number | string | null;
  topChamps?: string[];
  topPlayers?: string[];
}> = ({
  stages,
  hide,
  note,
  title,
  eventSlug,
  leagueSlug,
  year,
  topChamps = [],
  topPlayers = [],
}) => {
  const hiddenNow = useHiddenCheck();
  const columns: BracketColumn[] = stages.map((st) => ({
    key: st.name,
    title: stageLabel(st.name),
    items: st.series.map((r, i) => {
      const shown = !hide?.(r) && !hiddenNow(seriesKey(r), r.date);
      return {
        key: `${st.name}-${i}`,
        teams: [r.a, r.b],
        winner: shown ? (r.w === 1 ? r.a : r.w === 2 ? r.b : null) : null,
        node: <SeriesBox r={r} hideResult={hide?.(r)} note={note?.(r)} compact eventSlug={eventSlug} leagueSlug={leagueSlug} year={year} />,
      };
    }),
  }));
  // four rounds or more need the whole page width (half of a two-column page made them scroll sideways)
  const finalS = [...stages].reverse().flatMap((s) => s.series).find((r) => r.au || r.bu || r.a || r.b);
  const rawFA = finalS?.a ? tSlug(finalS.a, finalS.au) : "";
  const rawFB = finalS?.b ? tSlug(finalS.b, finalS.bu) : "";
  const fTeamA = rawFA || rawFB;
  const fTeamB = rawFA && rawFB && rawFB !== rawFA ? rawFB : undefined;
  const bYr = /^\d{4}$/.test((finalS?.date || "").slice(0, 4))
    ? (finalS?.date || "").slice(0, 4)
    : year != null && /^\d{4}$/.test(String(year))
      ? String(year)
      : "";
  const bPeriod = eventSlug ? `e:${eventSlug}` : bYr ? `y${bYr}` : undefined;
  return (
    <div className={columns.length >= 4 ? "rw-span" : undefined}>
      <Section
        title={title || tl("Bracket")}
        right={
          fTeamA ? (
            <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
              <HubLink
                to={{
                  kind: "prep",
                  a: fTeamA,
                  ...(fTeamB ? { b: fTeamB } : {}),
                  ...(bPeriod ? { period: bPeriod } : {}),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(fTeamA)}${fTeamB ? `,${encodeURIComponent(fTeamB)}` : ""}${bPeriod ? `&p=${encodeURIComponent(bPeriod)}` : ""}${topChamps.length ? `&champ=${encodeURIComponent(topChamps.join(","))}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: fTeamA,
                  ...(fTeamB ? { b: fTeamB } : {}),
                  ...(bPeriod ? { period: bPeriod } : {}),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              {topChamps[0] && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: topChamps[0],
                      ...(topChamps[1] ? { vs: topChamps[1] } : {}),
                      ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                      ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                      team: fTeamA,
                      ...(fTeamB ? { vsteam: fTeamB } : {}),
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(bYr ? { patch: `y${bYr}`, year: bYr } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    team: fTeamA,
                    ...(fTeamB ? { vs: fTeamB } : {}),
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(bYr ? { year: bYr } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      q: [fTeamA, fTeamB, ...topPlayers].filter(Boolean).join(","),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    team: fTeamA,
                    ...(fTeamB ? { vs: fTeamB } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(bYr ? { year: bYr } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { scope: leagueSlug, league: leagueSlug } : {}),
                      ...(bYr ? { key: `y${bYr}`, year: bYr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(topChamps.length ? { q: topChamps.join(",") } : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(bYr ? { year: bYr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                      ...(finalS?.a || finalS?.b || topPlayers.length
                        ? {
                            q: [
                              finalS?.a ? tSlug(finalS.a, finalS.au) : "",
                              finalS?.b ? tSlug(finalS.b, finalS.bu) : "",
                              ...topPlayers,
                            ]
                              .filter(Boolean)
                              .join(","),
                          }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
            </span>
          ) : undefined
        }
      >
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <BracketBoard columns={columns} />
        </div>
      </Section>
    </div>
  );
};

/** Stage names from Leaguepedia ("Week 3", "Round 1", "Quarterfinals") in the reader's language where we can. */

const StageLists: React.FC<{
  stages: Stage[];
  eventSlug?: string;
  leagueSlug?: string | null;
  initialSearch?: string;
  topChamps?: string[];
  topPlayers?: string[];
  teamPlayerTextBySlug?: Map<string, string>;
}> = ({ stages, eventSlug, leagueSlug, initialSearch = "", topChamps = [], topPlayers = [], teamPlayerTextBySlug }) => {
  // Long leagues: one stage at a time, newest first
  const [i, setI] = useState(stages.length - 1);
  const [byRating, setByRating] = useState(false);
  const aliases = useLoad(loadAliases, []);
  const filterSeries = (
    base: SeriesRow[],
    rawQuery: string,
    stageBySeries: Map<SeriesRow, string>,
  ): SeriesRow[] => {
    const qTerms = rawQuery
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s))
      .filter(Boolean);
    if (!qTerms.length) return base;
    const vsMode = /\s+vs\.?\s+|\s+v\s+/i.test(rawQuery);
    const matchSide = (name: string, slug: string | null | undefined, term: string) => {
      const sideSlug = resolveTeamAlias(aliases.data?.team[(slug || name).toLowerCase()] || slug || name) || prettySlug(name);
      const hay = normText(`${name} ${slug || ""} ${sideSlug} ${teamPlayerTextBySlug?.get(sideSlug) || ""}`);
      const qAlias = searchAlias(term);
      if (
        hay.includes(term) ||
        (bare(term).length >= 2 && bare(hay).includes(bare(term))) ||
        (qAlias && (hay.includes(qAlias) || (bare(qAlias).length >= 2 && bare(hay).includes(bare(qAlias)))))
      )
        return true;
      const canonTerm =
        resolveTeamAlias(aliases.data?.team[term] || term) ||
        (qAlias ? resolveTeamAlias(aliases.data?.team[qAlias] || qAlias) : "") ||
        prettySlug(qAlias || term);
      return Boolean(canonTerm && canonTerm === sideSlug);
    };
    if (vsMode && qTerms.length >= 2) {
      const [ta, tb] = qTerms;
      return base.filter(
        (r) =>
          (matchSide(r.a, r.au, ta) && matchSide(r.b, r.bu, tb)) ||
          (matchSide(r.a, r.au, tb) && matchSide(r.b, r.bu, ta)),
      );
    }
    return base.filter((r) => {
      const stHay = normText(stageBySeries.get(r) || "");
      return qTerms.some(
        (t) =>
          matchSide(r.a, r.au, t) ||
          matchSide(r.b, r.bu, t) ||
          (r.date && normText(r.date).includes(t)) ||
          (stHay && (stHay.includes(t) || (bare(t).length >= 2 && bare(stHay).includes(bare(t))))),
      );
    });
  };
  const stageBySeriesMap = useMemo(() => {
    const map = new Map<SeriesRow, string>();
    for (const s of stages) {
      const label = `${s.name || ""} ${stageLabel(s.name) || ""}`;
      for (const r of s.series) map.set(r, label);
    }
    return map;
  }, [stages]);
  const effectiveInitialSearch = useMemo(() => {
    if (!initialSearch.trim()) return "";
    const allSeries = stages.flatMap((s) => s.series);
    if (filterSeries(allSeries, initialSearch, stageBySeriesMap).length > 0) return initialSearch;
    const rawTerms = initialSearch.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => s.trim()).filter(Boolean);
    const matchingTerms = rawTerms.filter((t) => filterSeries(allSeries, t, stageBySeriesMap).length > 0);
    return matchingTerms.join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch, stages, stageBySeriesMap, aliases.data, teamPlayerTextBySlug]);
  const [search, setSearch] = useState(effectiveInitialSearch);
  const userTyped = useRef(false);
  const lastInitial = useRef(initialSearch);
  useEffect(() => {
    if (lastInitial.current !== initialSearch) {
      lastInitial.current = initialSearch;
      userTyped.current = false;
    }
    if (!userTyped.current) setSearch(effectiveInitialSearch);
  }, [initialSearch, effectiveInitialSearch]);
  const isHidden = useHiddenCheck();
  const st = stages[Math.min(i, stages.length - 1)];
  // "Top rated": every stage's series, best first (results still hidden by spoiler mode stay out, so the order gives
  // nothing away)
  const rated = useMemo(
    () =>
      stages
        .flatMap((s) => s.series)
        .filter((r) => r.r != null && !isHidden(seriesKey(r), r.date))
        .sort((a, b) => (b.r || 0) - (a.r || 0)),
    [stages, isHidden],
  );
  const terms = useMemo(
    () =>
      search
        .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
        .map((s) => normText(s))
        .filter(Boolean),
    [search],
  );
  const shown = useMemo(() => {
    const base = byRating ? rated : terms.length > 0 ? stages.flatMap((s) => s.series) : st.series;
    return filterSeries(base, search, stageBySeriesMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byRating, rated, terms, search, stages, st.series, stageBySeriesMap, aliases.data, teamPlayerTextBySlug]);
  const s0A = shown[0]?.a ? tSlug(shown[0].a, shown[0].au) : "";
  const s0B = shown[0]?.b ? tSlug(shown[0].b, shown[0].bu) : "";
  const s0First = s0A || s0B;
  const s0Second = s0A && s0B && s0B !== s0A ? s0B : undefined;
  return (
    <Section
      title={tl("Matches")}
      right={
        <span className="flex flex-wrap items-center gap-1.5" data-nocapture="1">
          {s0First && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: s0First,
                  ...(s0Second ? { b: s0Second } : {}),
                  ...(eventSlug ? { period: `e:${eventSlug}` } : {}),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(s0First)}${s0Second ? `,${encodeURIComponent(s0Second)}` : ""}${eventSlug ? `&p=e:${encodeURIComponent(eventSlug)}` : ""}${topChamps.length ? `&champ=${encodeURIComponent(topChamps.join(","))}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: s0First,
                  ...(s0Second ? { b: s0Second } : {}),
                  ...(eventSlug ? { period: `e:${eventSlug}` } : {}),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              {topChamps[0] && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: topChamps[0],
                      ...(topChamps[1] ? { vs: topChamps[1] } : {}),
                      ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                      ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                      team: s0First,
                      ...(s0Second ? { vsteam: s0Second } : {}),
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(/^\d{4}$/.test((shown[0].date || "").slice(0, 4))
                        ? { patch: `y${(shown[0].date || "").slice(0, 4)}`, year: (shown[0].date || "").slice(0, 4) }
                        : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    team: s0First,
                    ...(s0Second ? { vs: s0Second } : {}),
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(/^\d{4}$/.test((shown[0].date || "").slice(0, 4)) ? { year: (shown[0].date || "").slice(0, 4) } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      q: [s0First, s0Second, ...topPlayers].filter(Boolean).join(","),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(/^\d{4}$/.test((shown[0].date || "").slice(0, 4)) ? { year: (shown[0].date || "").slice(0, 4) } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    team: s0First,
                    ...(s0Second ? { vs: s0Second } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { scope: leagueSlug, league: leagueSlug } : {}),
                      ...(/^\d{4}$/.test((shown[0].date || "").slice(0, 4)) ? { key: `y${(shown[0].date || "").slice(0, 4)}`, year: (shown[0].date || "").slice(0, 4) } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(topChamps.length ? { q: topChamps.join(",") } : {}),
                    }).toString() || undefined,
              }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(/^\d{4}$/.test((shown[0].date || "").slice(0, 4)) ? { year: (shown[0].date || "").slice(0, 4) } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                      q: [s0First, s0Second, ...topPlayers].filter(Boolean).join(","),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
            </>
          )}
          <input
            type="search"
            value={search}
            onChange={(ev) => {
              userTyped.current = true;
              setSearch(ev.target.value);
            }}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
          />
          {rated.length > 1 && (
            <select
              value={byRating ? "r" : "d"}
              onChange={(e) => setByRating(e.target.value === "r")}
              aria-label={tl("Order")}
              className="bg-rw-bg border border-rw-border rounded px-1.5 py-0.5 text-[11px] text-rw-text"
            >
              <option value="d">{tl("By stage")}</option>
              <option value="r">{tl("Top rated")}</option>
            </select>
          )}
          {shown.length > 0 && (
            <SectionCard
              section={tl("Matches")}
              name={stageLabel(st.name) || tl("Matches")}
              rows={() =>
                shown.slice(0, 12).map((r, idx) => {
                  const hide = isHidden(seriesKey(r), r.date);
                  const played = r.sa != null && r.sb != null;
                  const winTeam = !hide && played ? (r.w === 1 ? r.a : r.w === 2 ? r.b : r.a) : r.a;
                  return {
                    rank: idx + 1,
                    team: winTeam,
                    label: `${r.a} vs ${r.b}`,
                    sub: fmtDate(r.date, false),
                    value: played ? (hide ? "–" : `${r.sa}–${r.sb}`) : fmtDate(r.date, false),
                    win: !hide && played ? r.w === 1 : undefined,
                  };
                })
              }
            />
          )}
        </span>
      }
    >
      {!byRating && !terms.length && stages.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {stages.map((s, k) => (
            <button
              key={s.name + k}
              type="button"
              onClick={() => setI(k)}
              className={`px-2 py-1 rounded text-[11px] border ${
                k === i ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
              }`}
            >
              {stageLabel(s.name) || tl("Matches")}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r, k) => (
          <SeriesBox key={k} r={r} eventSlug={eventSlug} leagueSlug={leagueSlug} />
        ))}
      </div>
    </Section>
  );
};

export const Standings: React.FC<{
  name: string;
  rows: StandingRow[];
  end?: string;
  hideAll?: boolean;
  eventSlug?: string;
  leagueSlug?: string | null;
  year?: string;
  topChamps?: string[];
  topPlayers?: string[];
}> = ({
  name,
  rows,
  end,
  hideAll,
  eventSlug,
  leagueSlug,
  year,
  topChamps = [],
  topPlayers = [],
}) => {
  const [hidden, reveal] = useHidden(`standings:${name}:${rows.map((r) => r.t).join()}`, end);
  const hide = hideAll || hidden;
  const ties = rows.some((r) => r.st);
  const yr = year && /^\d{4}$/.test(year) ? year : end && /^\d{4}/.test(end) ? end.slice(0, 4) : undefined;
  return (
    <Section
      title={name}
      right={
        hidden && !hideAll ? (
          <RevealButton onReveal={reveal} small />
        ) : !hide ? (
          <span className="flex flex-wrap items-center gap-2">
            {rows.length >= 1 && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: tSlug(rows[0].t, rows[0].u),
                    ...(rows[1] ? { b: tSlug(rows[1].t, rows[1].u) } : {}),
                    period: eventSlug ? `e:${eventSlug}` : yr ? `y${yr}` : undefined,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(tSlug(rows[0].t, rows[0].u))}${rows[1] ? `,${encodeURIComponent(tSlug(rows[1].t, rows[1].u))}` : ""}${eventSlug ? `&p=e:${encodeURIComponent(eventSlug)}` : yr ? `&p=y${encodeURIComponent(yr)}` : ""}${topChamps.length ? `&champ=${encodeURIComponent(topChamps.join(","))}` : ""}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: tSlug(rows[0].t, rows[0].u),
                    ...(rows[1] ? { b: tSlug(rows[1].t, rows[1].u) } : {}),
                    period: eventSlug ? `e:${eventSlug}` : yr ? `y${yr}` : undefined,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                {topChamps[0] && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        champ: topChamps[0],
                        ...(topChamps[1] ? { vs: topChamps[1] } : {}),
                        ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                        ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                        team: tSlug(rows[0].t, rows[0].u),
                        ...(rows[1] ? { vsteam: tSlug(rows[1].t, rows[1].u) } : {}),
                        ...(leagueSlug ? { league: leagueSlug } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        ...(yr ? { patch: `y${yr}`, year: yr } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                      ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                      team: tSlug(rows[0].t, rows[0].u),
                      ...(rows[1] ? { vs: tSlug(rows[1].t, rows[1].u) } : {}),
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(yr ? { year: yr } : {}),
                      ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                      ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{
                kind: "rankings",
                query:
                  new URLSearchParams({
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(rows[0] || topPlayers.length
                      ? {
                          q: [
                            rows[0] ? tSlug(rows[0].t, rows[0].u) : "",
                            rows[1] ? tSlug(rows[1].t, rows[1].u) : "",
                            ...topPlayers,
                          ]
                            .filter(Boolean)
                            .join(","),
                        }
                      : {}),
                  }).toString() || undefined,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            {(eventSlug || yr || rows[0]) && (
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(yr ? { year: yr } : {}),
                    ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    ...(rows[0] ? { team: tSlug(rows[0].t, rows[0].u) } : {}),
                    ...(rows[1] ? { vs: tSlug(rows[1].t, rows[1].u) } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  ...(leagueSlug ? { scope: leagueSlug, league: leagueSlug } : {}),
                  ...(yr ? { key: `y${yr}`, year: yr } : {}),
                  ...(eventSlug ? { event: eventSlug } : {}),
                  ...(topChamps.length ? { q: topChamps.join(",") } : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query:
                  new URLSearchParams({
                    ...(leagueSlug ? { league: leagueSlug } : {}),
                    ...(yr ? { year: yr } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(rows[0] || topPlayers.length
                      ? {
                          q: [
                            rows[0] ? tSlug(rows[0].t, rows[0].u) : "",
                            rows[1] ? tSlug(rows[1].t, rows[1].u) : "",
                            ...topPlayers,
                          ]
                            .filter(Boolean)
                            .join(","),
                        }
                      : {}),
                  }).toString() || undefined,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <SectionCard
              section={name}
              name={`standings-${name}`}
              rows={() =>
                rows.slice(0, 10).map((r, idx) => ({
                  rank: r.pl && r.pl > 0 ? r.pl : idx + 1,
                  team: r.t,
                  label: r.t,
                  sub: r.gw != null ? `${r.gw}-${r.gl ?? 0}` : undefined,
                  value: `${r.sw ?? 0}-${r.sl ?? 0}${ties ? `-${r.st ?? 0}` : ""}`,
                  win: (r.sw ?? 0) + (r.sl ?? 0) > 0 ? (r.sw ?? 0) >= (r.sl ?? 0) : undefined,
                }))
              }
            />
          </span>
        ) : undefined
      }
    >
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={`${th} w-6`}>#</th>
            <th className={th}>{tl("Team")}</th>
            <th className={th}>{tl("Series")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.t + i} className="border-t border-rw-border">
              <td className={`${td} text-rw-muted`} data-sort={r.pl ?? i + 1}>
                {hide || r.pl === 0 ? (
                  "–"
                ) : eventSlug || yr ? (
                  <HubLink
                    to={{
                      kind: "team",
                      slug: tSlug(r.t, r.u),
                      tab: "stats",
                      query: new URLSearchParams({
                        ...(eventSlug ? { p: `e:${eventSlug}` } : yr ? { p: `y${yr}` } : {}),
                        ...(rows.find((x) => tSlug(x.t, x.u) !== tSlug(r.t, r.u))
                          ? { q: tSlug(rows.find((x) => tSlug(x.t, x.u) !== tSlug(r.t, r.u))!.t, rows.find((x) => tSlug(x.t, x.u) !== tSlug(r.t, r.u))!.u) }
                          : {}),
                        ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                      }).toString(),
                    }}
                    className="hover:text-rw-accent hover:underline"
                    title={tl("Stats")}
                  >
                    {r.pl ?? i + 1}
                  </HubLink>
                ) : (
                  r.pl ?? i + 1
                )}
              </td>
              <td className={`${td} max-w-[11rem]`} data-sort={r.t}>
                {(() => {
                  const ts = tSlug(r.t, r.u);
                  const rivalRow = rows.find((x) => tSlug(x.t, x.u) !== ts);
                  const rivalSlug = rivalRow ? tSlug(rivalRow.t, rivalRow.u) : "";
                  const stTeamQ =
                    new URLSearchParams({
                      ...(eventSlug ? { p: `e:${eventSlug}` } : yr ? { p: `y${yr}` } : {}),
                      ...(rivalSlug ? { q: rivalSlug } : {}),
                      ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    }).toString() || undefined;
                  return (
                    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                      <HubLink
                        to={{
                          kind: "team",
                          slug: ts,
                          ...(stTeamQ ? { query: stTeamQ } : {}),
                        }}
                        title={r.t}
                        className="shrink-0"
                      >
                        <TeamLogo name={r.t} size={16} />
                      </HubLink>
                      <TeamLink
                        name={r.t}
                        u={r.u}
                        query={stTeamQ}
                        className="truncate"
                      />
                    </span>
                  );
                })()}
              </td>
              <td className={`${td} text-rw-sub tabular-nums`} data-sort={hide ? 0 : (r.sw ?? 0) + (r.sl ?? 0) > 0 ? (r.sw ?? 0) / ((r.sw ?? 0) + (r.sl ?? 0)) : 0}>
                {hide ? (
                  "–"
                ) : (() => {
                  const ts = tSlug(r.t, r.u);
                  const rivalRow = rows.find((x) => tSlug(x.t, x.u) !== ts);
                  const rivalSlug = rivalRow ? tSlug(rivalRow.t, rivalRow.u) : "";
                  const seriesNode =
                    !ties && (r.sw ?? 0) + (r.sl ?? 0) > 0 ? (
                      <WinBar w={r.sw ?? 0} g={(r.sw ?? 0) + (r.sl ?? 0)} showRecord />
                    ) : (
                      `${r.sw ?? 0}-${r.sl ?? 0}${ties ? `-${r.st ?? 0}` : ""}`
                    );
                  return eventSlug ? (
                    <HubLink
                      to={{
                        kind: "finder",
                        query: new URLSearchParams({
                          event: eventSlug,
                          ...(leagueSlug ? { league: leagueSlug } : {}),
                          ...(yr ? { year: yr } : {}),
                          team: ts,
                          ...(rivalSlug ? { vs: rivalSlug } : {}),
                          ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                          ...(topPlayers[1] && topPlayers[1] !== topPlayers[0] ? { vsplayer: topPlayers[1] } : {}),
                          ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                          ...(topChamps[1] && topChamps[1] !== topChamps[0] ? { vschamp: topChamps[1] } : {}),
                        }).toString(),
                      }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      {seriesNode}
                    </HubLink>
                  ) : (
                    seriesNode
                  );
                })()}
              </td>
              <td className={`${td} text-rw-muted tabular-nums`} data-sort={hide || r.gw == null ? 0 : r.gw + (r.gl ?? 0) > 0 ? r.gw / (r.gw + (r.gl ?? 0)) : 0}>
                {hide || r.gw == null ? (
                  "–"
                ) : (() => {
                  const ts = tSlug(r.t, r.u);
                  const rivalRow = rows.find((x) => tSlug(x.t, x.u) !== ts);
                  const rivalSlug = rivalRow ? tSlug(rivalRow.t, rivalRow.u) : "";
                  const gamesNode =
                    r.gw + (r.gl ?? 0) > 0 ? (
                      <WinBar w={r.gw} g={r.gw + (r.gl ?? 0)} showRecord />
                    ) : (
                      `${r.gw}-${r.gl ?? 0}`
                    );
                  return eventSlug ? (
                    <HubLink
                      to={{
                        kind: "finder",
                        query: new URLSearchParams({
                          event: eventSlug,
                          ...(leagueSlug ? { league: leagueSlug } : {}),
                          ...(yr ? { year: yr } : {}),
                          team: ts,
                          ...(rivalSlug ? { vs: rivalSlug } : {}),
                          ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                          ...(topPlayers[1] && topPlayers[1] !== topPlayers[0] ? { vsplayer: topPlayers[1] } : {}),
                          ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                          ...(topChamps[1] && topChamps[1] !== topChamps[0] ? { vschamp: topChamps[1] } : {}),
                        }).toString(),
                      }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      {gamesNode}
                    </HubLink>
                  ) : (
                    gamesNode
                  );
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </STable>
    </Section>
  );
};

const LEADER_TITLES: Record<string, string> = {
  kda: tk("Best KDA"),
  kills: tk("Kills per game"),
  csm: tk("CS per minute"),
  dpm: tk("Damage per minute"),
  pool: tk("Most champions played"),
};

const Leaders: React.FC<{ e: HubEvent }> = ({ e }) => {
  const keys = (["kda", "kills", "csm", "dpm", "pool"] as const).filter((k) => e.leaders?.[k]?.length);
  const [k, setK] = useState<(typeof keys)[number]>(keys[0]);
  const rows = e.leaders?.[k] || [];
  const maxV = Math.max(1, ...rows.map((r) => r.v || 0));
  const topTeams = Array.from(new Set(rows.map((r) => (r.t ? tSlug(r.t, e.teams?.find((tm) => tm.t === r.t)?.u) : "")).filter(Boolean))).slice(0, 2);
  const topPlayers = Array.from(new Set(rows.map((r) => pSlug(r.n, r.u)).filter(Boolean))).slice(0, 2);
  const topChamps = Array.from(new Set((e.champs || []).map((c) => resolveChampSlug(c.c)).filter(Boolean))).slice(0, 2);
  return (
    <Section
      title={tl("Player leaders")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {topTeams[0] && (
            <HubLink
              to={{
                kind: "prep",
                a: topTeams[0],
                ...(topTeams[1] ? { b: topTeams[1] } : {}),
                period: `e:${e.u}`,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Match prep")} →
            </HubLink>
          )}
          {topPlayers[0] && (
            <HubLink
              to={{
                kind: "compare",
                mode: "player",
                a: topPlayers[0],
                ...(topPlayers[1] ? { b: topPlayers[1] } : {}),
                period: `e:${e.u}`,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Compare")} →
            </HubLink>
          )}
          {topPlayers[0] && (
            <>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    event: e.u,
                    player: topPlayers[0],
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    ...(topTeams[0] ? { team: topTeams[0] } : {}),
                    ...(topTeams[1] ? { vs: topTeams[1] } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                    player: topPlayers[0],
                    ...(topTeams[0] ? { team: topTeams[0] } : {}),
                    ...(topTeams[1] ? { vs: topTeams[1] } : {}),
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              {topChamps[0] && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: topChamps[0],
                      ...(topChamps[1] ? { vs: topChamps[1] } : {}),
                      ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                      ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                      ...(topTeams[0] ? { team: topTeams[0] } : {}),
                      ...(topTeams[1] ? { vsteam: topTeams[1] } : {}),
                      ...(e.lu ? { league: e.lu } : {}),
                      event: e.u,
                      ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                        ? { patch: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) }
                        : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "draft",
                  query: `p=e:${encodeURIComponent(e.u)}${topTeams.length ? `&teams=${topTeams.map(encodeURIComponent).join(",")}` : ""}${topChamps.length ? `&champ=${encodeURIComponent(topChamps.join(","))}` : ""}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
            </>
          )}
          <HubLink
            to={{
              kind: "tiers",
              query: new URLSearchParams({
                ...(e.lu ? { scope: e.lu, league: e.lu } : {}),
                ...(e.start || e.end ? { key: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) } : {}),
                event: e.u,
                ...(topChamps.length ? { q: topChamps.join(",") } : {}),
              }).toString() || undefined,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink
            to={{
              kind: "rankings",
              query:
                new URLSearchParams({
                  ...(e.lu ? { league: e.lu } : {}),
                  ...(topTeams.length || topPlayers.length
                    ? { q: [...topTeams, ...topPlayers].filter(Boolean).join(",") }
                    : {}),
                }).toString() || undefined,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
          >
            {tl("Power rankings")} →
          </HubLink>
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(!e.whole ? { event: e.u } : {}),
                ...(e.start || e.end ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                ...(topPlayers.length || topTeams.length ? { q: [...topPlayers, ...topTeams].filter(Boolean).join(",") } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Full leaderboard")}
          </HubLink>
          <SectionCard
            section={`${tl("Player leaders")} · ${tl(LEADER_TITLES[k])}`}
            sub={eventTitle(e.n)}
            name={`${e.u}-leaders-${k}`}
            rows={() =>
              rows.slice(0, 10).map((r, idx) => ({
                rank: idx + 1,
                team: r.t,
                label: r.n,
                sub: `${r.t} · ${tn("{n} game", "{n} games", r.g)}`,
                value: fmtNum(r.v),
              }))
            }
          />
        </span>
      }
    >
      <div className="flex flex-wrap gap-1">
        {keys.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setK(x)}
            className={`px-2 py-1 rounded text-[11px] border ${
              x === k ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
            }`}
          >
            {tl(LEADER_TITLES[x])}
          </button>
        ))}
      </div>
      <ol className="text-xs space-y-1">
        {rows.map((r, i) => {
          const pct = Math.max(4, Math.min(100, Math.round(((r.v || 0) / maxV) * 100)));
          const rPlayerSlug = pSlug(r.n, r.u);
          const rTeamSlug = r.t ? tSlug(r.t, e.teams?.find((tm) => tm.t === r.t)?.u) : "";
          const vsLeaderSlug = rows.map((x) => pSlug(x.n, x.u)).find((s) => Boolean(s) && s !== rPlayerSlug) || "";
          const rPlayerQ = new URLSearchParams({
            p: `e:${e.u}`,
            ...(rTeamSlug ? { team: rTeamSlug } : {}),
            ...(vsLeaderSlug ? { q: vsLeaderSlug } : {}),
            ...(topChamps[0] ? { champ: topChamps[0] } : {}),
          }).toString();
          const rTeamQ = new URLSearchParams({
            p: `e:${e.u}`,
            ...(rPlayerSlug ? { q: rPlayerSlug } : {}),
            ...(topChamps[0] ? { champ: topChamps[0] } : {}),
          }).toString();
          return (
            <li key={r.n + i} className="relative overflow-hidden rounded px-2 py-1 flex items-center justify-between gap-2 min-w-0">
              <span
                className="pointer-events-none absolute inset-y-0 left-0 rounded"
                style={{ width: `${pct}%`, background: i === 0 ? "rgba(216,184,120,0.16)" : "rgba(130,170,255,0.08)" }}
              />
              <span className="relative inline-flex items-center gap-1.5 truncate min-w-0">
                <span className={`w-4 shrink-0 tabular-nums ${i === 0 ? "text-rw-accent font-bold" : "text-rw-muted"}`}>{i + 1}.</span>
                <HubLink to={{ kind: "player", slug: rPlayerSlug, query: rPlayerQ }} title={r.n} className="shrink-0">
                  <PlayerPhoto name={r.n} team={r.t} slug={r.u ?? undefined} size={20} />
                </HubLink>
                <PlayerLink name={r.n} u={r.u} query={rPlayerQ} />
                <span className="text-rw-muted shrink-0">·</span>
                <HubLink to={{ kind: "team", slug: rTeamSlug, query: rTeamQ }} title={r.t} className="shrink-0">
                  <TeamLogo name={r.t} size={14} />
                </HubLink>
                <TeamLink name={r.t} u={e.teams?.find((tm) => tm.t === r.t)?.u} query={rTeamQ} className="text-rw-muted hover:text-rw-accent hover:underline truncate" />
              </span>
              <span className="relative shrink-0 text-rw-sub tabular-nums">
                {(() => {
                  const rowFinderQ = new URLSearchParams({
                    event: e.u,
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                    player: rPlayerSlug,
                    ...(vsLeaderSlug ? { vsplayer: vsLeaderSlug } : {}),
                    ...(rTeamSlug ? { team: rTeamSlug } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                  }).toString();
                  return (
                    <>
                      <HubLink
                        to={
                          k === "pool" && r.u
                            ? { kind: "player", slug: r.u, tab: "champions", query: rPlayerQ }
                            : { kind: "finder", query: rowFinderQ }
                        }
                        className="text-rw-accent font-bold hover:underline"
                      >
                        {fmtNum(r.v)}
                      </HubLink>{" "}
                      ·{" "}
                      <HubLink
                        to={{ kind: "finder", query: rowFinderQ }}
                        className="hover:text-rw-accent hover:underline"
                      >
                        {tn("{n} game", "{n} games", r.g)}
                      </HubLink>
                    </>
                  );
                })()}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[10px] text-rw-muted">{tl("Players who played at least 40% of the most games anyone played here.")}</p>
    </Section>
  );
};

const CopyEventPost: React.FC<{ e: HubEvent }> = ({ e }) => {
  const [state, setState] = useState<"" | "copied" | "failed">("");
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(""), 2200);
    return () => clearTimeout(t);
  }, [state]);
  const text = () => {
    const podium = (e.results || [])
      .filter((r) => ["1", "2", "3"].includes(r.p))
      .sort((x, y) => Number(x.p) - Number(y.p))
      .slice(0, 3);
    const lines = [
      `${eventTitle(e.n)}${e.games ? ` — ${fmtNum(e.games)} ${tl("Games")}${e.series ? ` · ${fmtNum(e.series)} ${tl("Series")}` : ""}` : ""}`,
    ];
    if (podium.length > 0) {
      lines.push(podium.map((r) => `#${r.p} ${r.t}${r.usd ? ` (${fmtUsd(r.usd)})` : ""}`).join(" · "));
    }
    if (e.champs && e.champs.length > 0) {
      lines.push(
        `${tl("Champions")}: ${e.champs
          .slice(0, 3)
          .map((c) => `${champName(c.c)} (${c.p}P/${c.b}B)`)
          .join(", ")}`,
      );
    }
    lines.push(hubShareUrl({ kind: "event", slug: e.u }));
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
      <ClipboardCopy className="w-3.5 h-3.5" />
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

const EventChamps: React.FC<{ e: HubEvent; full?: boolean; initialSearch?: string; topTeams?: string[]; topPlayers?: string[] }> = ({
  e,
  full,
  initialSearch = "",
  topTeams = [],
  topPlayers = [],
}) => {
  const games = e.statsGames || 0;
  const allChamps = useMemo(() => e.champs || [], [e.champs]);
  const effectiveInitialSearch = useMemo(() => {
    const terms = initialSearch
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(searchAlias(s.trim())))
      .filter(Boolean);
    if (!terms.length) return "";
    const matchingTerms = terms.filter((t) => allChamps.some((c) => matchesChampSearch(c.c, t)));
    return matchingTerms.length === terms.length ? initialSearch : matchingTerms.join(",");
  }, [allChamps, initialSearch]);
  const [search, setSearch] = useState(effectiveInitialSearch);
  const userTyped = useRef(false);
  const lastInitial = useRef(initialSearch);
  useEffect(() => {
    if (lastInitial.current !== initialSearch) {
      lastInitial.current = initialSearch;
      userTyped.current = false;
    }
    if (!userTyped.current) setSearch(effectiveInitialSearch);
  }, [initialSearch, effectiveInitialSearch]);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const terms = search
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(searchAlias(s.trim())))
      .filter(Boolean);
    if (terms.length)
      return allChamps.filter((c) => terms.some((t) => matchesChampSearch(c.c, t)));
    return full || showAll ? allChamps : allChamps.slice(0, 20);
  }, [allChamps, search, full, showAll]);
  // the Champions page with this tournament picked: every champion, by patch / side / role, blind picks
  const year = (e.start || e.end || "").slice(0, 4);
  const c0 = rows[0] ? resolveChampSlug(rows[0].c) : "";
  const c1 =
    [...rows, ...allChamps]
      .map((c) => resolveChampSlug(c.c))
      .find((s) => Boolean(s) && s !== c0) || "";
  const evTeams = Array.from(
    new Set(
      [
        ...topTeams,
        ...(e.results || []).map((r) => tSlug(r.t, r.u)),
        ...(e.teams || []).map((t) => tSlug(t.t, t.u)),
      ].filter(Boolean),
    ),
  ).slice(0, 2);
  const evPlayers = Array.from(
    new Set(
      [
        ...topPlayers,
        ...(e.leaders?.kda || []).map((r) => pSlug(r.n, r.u)),
        ...(e.players || []).map((p) => pSlug(p.n, p.u)),
      ].filter(Boolean),
    ),
  ).slice(0, 2);
  const more =
    e.lu && /^\d{4}$/.test(year) ? (
      <HubLink
        to={{
          kind: "champions",
          query: new URLSearchParams({
            scope: e.lu,
            league: e.lu,
            key: `y${year}`,
            year,
            event: e.u,
            ...(c0 ? { q: [c0, c1].filter(Boolean).join(",") } : {}),
          }).toString(),
        }}
        className="text-[11px] text-rw-accent hover:underline"
      >
        {tl("Every champion, with filters")}
      </HubLink>
    ) : undefined;
  return (
    <Section
      title={tl("Champions")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {(allChamps.length >= 10 || Boolean(search.trim())) && (
            <input
              type="search"
              value={search}
              onChange={(ev) => {
                userTyped.current = true;
                setSearch(ev.target.value);
              }}
              placeholder={tl("Search champions…")}
              aria-label={tl("Search champions…")}
              className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
            />
          )}
          {!full && !search && allChamps.length > 20 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-rw-accent hover:underline">
              {showAll ? tl("Show fewer") : tl("Show all {n}", { n: allChamps.length })}
            </button>
          )}
          {c0 && (
            <>
              {evTeams[0] && (
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: evTeams[0],
                    ...(evTeams[1] ? { b: evTeams[1] } : {}),
                    period: `e:${e.u}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: c0,
                    ...(c1 ? { vs: c1 } : {}),
                    ...(evPlayers[0] ? { player: evPlayers[0] } : {}),
                    ...(evPlayers[1] ? { vsplayer: evPlayers[1] } : {}),
                    ...(evTeams[0] ? { team: evTeams[0] } : {}),
                    ...(evTeams[1] ? { vsteam: evTeams[1] } : {}),
                    ...(e.lu ? { league: e.lu } : {}),
                    event: e.u,
                    ...(/^\d{4}$/.test(year) ? { patch: `y${year}`, year } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    champ: c0,
                    ...(c1 ? { vschamp: c1 } : {}),
                    ...(evPlayers[0] ? { player: evPlayers[0] } : {}),
                    ...(evPlayers[1] ? { vsplayer: evPlayers[1] } : {}),
                    ...(e.lu ? { league: e.lu } : {}),
                    ...(/^\d{4}$/.test(year) ? { year } : {}),
                    ...(evTeams[0] ? { team: evTeams[0] } : {}),
                    ...(evTeams[1] ? { vs: evTeams[1] } : {}),
                    event: e.u,
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
            </>
          )}
          <HubLink
            to={{
              kind: "tiers",
              query: new URLSearchParams({
                ...(e.lu ? { scope: e.lu, league: e.lu } : {}),
                ...(year ? { key: `y${year}`, year } : {}),
                event: e.u,
                ...(c0 ? { q: [c0, c1].filter(Boolean).join(",") } : {}),
              }).toString() || undefined,
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink
            to={{
              kind: "draft",
              query: new URLSearchParams({
                p: `e:${e.u}`,
                ...(evTeams.length ? { teams: evTeams.join(",") } : {}),
                ...(c0 ? { champ: [c0, c1].filter(Boolean).join(",") } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Draft board")} →
          </HubLink>
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                event: e.u,
                ...(e.lu ? { league: e.lu } : {}),
                ...(/^\d{4}$/.test(year) ? { year } : {}),
                ...(evPlayers[0] ? { player: evPlayers[0] } : {}),
                ...(evPlayers[1] ? { vsplayer: evPlayers[1] } : {}),
                ...(c0 ? { champ: c0 } : {}),
                ...(c1 ? { vschamp: c1 } : {}),
                ...(evTeams[0] ? { team: evTeams[0] } : {}),
                ...(evTeams[1] ? { vs: evTeams[1] } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Game finder")} →
          </HubLink>
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(year ? { year } : {}),
                event: e.u,
                ...(c0 ? { champ: c0 } : {}),
                ...(evTeams.length || evPlayers.length
                  ? { q: [...evTeams, ...evPlayers].filter(Boolean).join(",") }
                  : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Player leaderboards")} →
          </HubLink>
          <HubLink
            to={{
              kind: "rankings",
              query:
                new URLSearchParams({
                  ...(e.lu ? { league: e.lu } : {}),
                  ...(evTeams.length || evPlayers.length
                    ? { q: [...evTeams, ...evPlayers].filter(Boolean).join(",") }
                    : {}),
                }).toString() || undefined,
            }}
            className="text-[11px] text-rw-accent hover:underline"
          >
            {tl("Power rankings")} →
          </HubLink>
          {more}
          <SectionCard
            section={tl("Champions")}
            sub={eventTitle(e.n)}
            name={`${e.u}-champions`}
            rows={() =>
              rows.slice(0, 10).map((c, idx) => ({
                rank: idx + 1,
                champ: c.c,
                label: champName(c.c),
                sub: `${c.p} P · ${c.b} B · ${c.p ? winRate(c.w, c.p) : "–"}`,
                value: games ? `${Math.round(((c.p + c.b) / games) * 100)}%` : `${c.p}`,
                win: c.p >= 3 ? c.w / c.p >= 0.5 : undefined,
              }))
            }
          />
        </span>
      }
    >
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Champion")}</th>
            <th className={th}>{tl("Presence")}</th>
            <th className={th}>{tl("Picks")}</th>
            <th className={th}>{tl("Bans")}</th>
            <th className={th}>{tl("Win %")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const presPct = games ? Math.min(100, Math.round(((c.p + c.b) / games) * 100)) : 0;
            const pickPct = games ? Math.min(100, (c.p / games) * 100) : 0;
            const banPct = games ? Math.min(Math.max(0, 100 - pickPct), (c.b / games) * 100) : 0;
            const cSlug = resolveChampSlug(c.c);
            const vsC = c0 && cSlug !== c0 ? c0 : c1 && cSlug !== c1 ? c1 : "";
            const cFinderQ = (mode: "champ" | "ban") =>
              new URLSearchParams({
                event: e.u,
                ...(e.lu ? { league: e.lu } : {}),
                ...(/^\d{4}$/.test(year) ? { year } : {}),
                ...(evTeams[0] ? { team: evTeams[0] } : {}),
                ...(evTeams[1] && evTeams[1] !== evTeams[0] ? { vs: evTeams[1] } : {}),
                ...(evPlayers[0] ? { player: evPlayers[0] } : {}),
                ...(evPlayers[1] && evPlayers[1] !== evPlayers[0] ? { vsplayer: evPlayers[1] } : {}),
                [mode]: cSlug,
                ...(mode === "champ" && vsC ? { vschamp: vsC } : {}),
              }).toString();
            return (
              <tr key={c.c} className="border-t border-rw-border">
                <td className={`${td} max-w-[9rem]`} data-sort={c.c}>
                  <ChampLink
                    name={c.c}
                    size={18}
                    query={new URLSearchParams({
                      p: `e:${e.u}`,
                      ...(evPlayers[0] ? { player: evPlayers[0] } : {}),
                      ...(evPlayers[1] && evPlayers[1] !== evPlayers[0] ? { vsplayer: evPlayers[1] } : {}),
                      ...(evTeams[0] ? { team: evTeams[0] } : {}),
                      ...(evTeams[1] && evTeams[1] !== evTeams[0] ? { vs: evTeams[1] } : {}),
                      ...(vsC ? { vschamp: vsC } : {}),
                    }).toString()}
                  />
                </td>
                <td className={`${td} text-rw-sub`} data-sort={games ? (c.p + c.b) / games : 0}>
                  {games ? (
                    <HubLink
                      to={{
                        kind: "finder",
                        query: cFinderQ(c.p > 0 ? "champ" : "ban"),
                      }}
                      className="inline-flex flex-col gap-0.5 min-w-[3.25rem] hover:text-rw-accent hover:underline"
                      title={`${tl("Picks")}: ${c.p} · ${tl("Bans")}: ${c.b}`}
                    >
                      <span className="tabular-nums font-medium">{presPct}%</span>
                      <span className="h-1 w-12 rounded-full bg-rw-border/70 overflow-hidden flex" aria-hidden="true">
                        <span className="h-full bg-rw-teal/85" style={{ width: `${pickPct.toFixed(1)}%` }} />
                        <span className="h-full bg-rw-red/75" style={{ width: `${banPct.toFixed(1)}%` }} />
                      </span>
                    </HubLink>
                  ) : (
                    "–"
                  )}
                </td>
                <td className={`${td} text-rw-sub`} data-sort={c.p}>
                  {c.p > 0 ? (
                    <HubLink
                      to={{ kind: "finder", query: cFinderQ("champ") }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {c.p}
                    </HubLink>
                  ) : (
                    c.p
                  )}
                </td>
                <td className={`${td} text-rw-sub`} data-sort={c.b}>
                  {c.b > 0 ? (
                    <HubLink
                      to={{ kind: "finder", query: cFinderQ("ban") }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {c.b}
                    </HubLink>
                  ) : (
                    c.b
                  )}
                </td>
                <td className={`${td} text-rw-sub`} data-sort={c.p ? c.w / c.p : -1}>
                  {c.p ? (
                    <HubLink
                      to={{ kind: "finder", query: cFinderQ("champ") }}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      <WinBar w={c.w} g={c.p} />
                    </HubLink>
                  ) : (
                    "–"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </STable>
    </Section>
  );
};

