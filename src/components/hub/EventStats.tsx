/**
 * An event's stat cards (src/hub/worldsFacts.ts + eventStats.ts), grouped: the event, teams, players, champions and
 * the draft. Used by the Worlds / MSI / First Stand stats tab and by every tournament page with a lines file (the
 * stats build writes one for those events, so the cards appear and update with the data, nothing to set up per event).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { tl } from "../../i18n";
import { bare, loadEventLines, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
import { currentHubRoute, hubShareUrl } from "../../hub/route";
import { eventFacts, factText, gamesOf, type Fact } from "../../hub/worldsFacts";
import { moreEventFacts } from "../../hub/eventStats";
import { SectionCard } from "./BroadcastCard";
import { ChampIcon, CopyLinkButton, HubLink, PlayerLink, PlayerPhoto, RevealButton, Section, TeamLink, TeamLogo, useHidden, useLoad } from "./ui";

const btn =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50 disabled:opacity-50";

/** Every card for these games: the event in numbers first, then the rest in their groups. */
export function allFacts(files: Parameters<typeof gamesOf>[0], labels: Parameters<typeof gamesOf>[1], name: string): Fact[] {
  const games = gamesOf(files, labels);
  return [...eventFacts(games, name), ...moreEventFacts(games, name)];
}

type Group = "event" | "teams" | "players" | "champs";
const GROUP_OF: Record<string, Group> = {
  totals: "event", titles: "event", fast: "event", long: "event", comebacks: "event", upsets: "event",
  towers: "teams", "team-game-kills": "teams", "team-kpg": "teams", "team-dpg": "teams", "team-fast": "teams",
  "team-dragons": "teams", "team-barons": "teams", "team-fb": "teams", "team-ft": "teams",
  "champ-worst": "champs", "champ-best": "champs", "champ-picked": "champs", "champ-banned": "champs", "champ-presence": "champs", "champ-flex": "champs",
};
const groupOf = (f: Fact): Group => GROUP_OF[f.id] || "players";

/** The cards under a heading per group (a group with no cards is left out). */
export const FactGroups: React.FC<{
  facts: Fact[];
  link: string;
  shareId: (f: Fact) => string;
  eventSlug?: string;
  leagueSlug?: string | null;
  year?: string | null;
}> = ({ facts, link, shareId, eventSlug, leagueSlug, year }) => {
  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;
  const [search, setSearch] = useState(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("q") || p.get("team") || p.get("player") || p.get("champ") || "";
  });
  useEffect(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    const next = p.get("q") || p.get("team") || p.get("player") || p.get("champ") || "";
    if (next) setSearch(next);
  }, [routeQuery]);
  const titles: Record<Group, string> = {
    event: tl("The event"),
    teams: tl("Teams"),
    players: tl("Players"),
    champs: tl("Champions and the draft"),
  };
  // a link to one card (riftwise.gg/stats/worlds/2026#worlds-2026-totals) opens the page scrolled to it
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !facts.some((f) => shareId(f) === id)) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts.length]);
  const terms = search
    .trim()
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((s) => normText(s))
    .filter(Boolean);
  const filteredFacts = useMemo(() => {
    if (!terms.length) return facts;
    return facts
      .map((f) => {
        const cardMatch = terms.some((t) => {
          const hay = normText(`${f.title} ${f.headline}`);
          const ta = searchAlias(t);
          return hay.includes(t) || (ta ? hay.includes(ta) : false);
        });
        if (cardMatch) return f;
        const matchingRows = f.rows.filter((r) => {
          const hay = normText(`${r.label} ${r.value} ${r.sub || ""} ${r.player || ""} ${r.team || ""} ${r.champ || ""}`);
          const canonTeam = resolveTeamAlias(r.team || r.label || "");
          return terms.some((t) => {
            const ta = searchAlias(t);
            return (
              hay.includes(t) ||
              (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
              (ta ? hay.includes(ta) || bare(hay).includes(bare(ta)) : false) ||
              (r.champ ? matchesChampSearch(r.champ, t) : false) ||
              (r.player ? resolvePlayerSlug(t) === r.player : false) ||
              (canonTeam ? resolveTeamAlias(t) === canonTeam : false)
            );
          });
        });
        if (!matchingRows.length) return null;
        return { ...f, rows: matchingRows };
      })
      .filter((f): f is Fact => f !== null);
  }, [facts, terms.join("|")]);
  const allRows = useMemo(() => filteredFacts.flatMap((f) => f.rows), [filteredFacts]);
  const fallbackRows = useMemo(() => facts.flatMap((f) => f.rows), [facts]);
  const topTeams = useMemo(() => {
    const out: string[] = [];
    for (const r of [...allRows, ...fallbackRows]) {
      if (r.team && !out.includes(r.team)) out.push(r.team);
      else if (!r.team) {
        const vsText = /\s+vs\.?\s+/i.test(r.label) ? r.label : r.sub && /\s+vs\.?\s+/i.test(r.sub) ? r.sub : "";
        if (vsText) {
          for (const part of vsText.split(/\s+vs\.?\s+/i)) {
            const ts = resolveTeamAlias(part.replace(/·.*$/, "").trim());
            if (ts && !out.includes(ts)) out.push(ts);
            if (out.length >= 2) break;
          }
        }
      }
      if (out.length >= 2) break;
    }
    return out;
  }, [allRows, fallbackRows]);
  const topPlayers = useMemo(() => {
    if (!allRows.some((r) => r.player)) return [];
    const out: string[] = [];
    for (const r of [...allRows, ...fallbackRows]) {
      if (r.player && !out.includes(r.player)) out.push(r.player);
      if (out.length >= 2) break;
    }
    return out;
  }, [allRows, fallbackRows]);
  const topChamps = useMemo(() => {
    if (!allRows.some((r) => r.champ)) return [];
    const out: string[] = [];
    for (const r of [...allRows, ...fallbackRows]) {
      if (r.champ && !out.includes(r.champ)) out.push(r.champ);
      if (out.length >= 2) break;
    }
    return out;
  }, [allRows, fallbackRows]);
  const evYr =
    year && /^\d{4}$/.test(year)
      ? year
      : eventSlug && /\d{4}/.test(eventSlug)
        ? /\d{4}/.exec(eventSlug)![0]
        : undefined;
  const normLg = leagueSlug ? resolveLeagueSlug(leagueSlug) : undefined;
  return (
    <div className="space-y-4">
      {(facts.length > 6 || Boolean(search.trim())) && (
        <div className="flex flex-wrap items-center justify-between gap-2" data-nocapture="1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold">
            {topTeams.length >= 1 && (
              <HubLink
                to={{
                  kind: "prep",
                  a: topTeams[0],
                  ...(topTeams[1] ? { b: topTeams[1] } : {}),
                  ...(eventSlug ? { period: `e:${eventSlug}` } : evYr ? { period: `y${evYr}` } : {}),
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
            )}
            {(topTeams.length >= 1 || topPlayers.length >= 1) && (
              <HubLink
                to={{
                  kind: "compare",
                  mode: topPlayers.length >= 1 && (terms.length > 0 || topTeams.length === 0) ? "player" : "team",
                  a: topPlayers.length >= 1 && (terms.length > 0 || topTeams.length === 0) ? topPlayers[0] : topTeams[0],
                  ...(topPlayers.length >= 1 && (terms.length > 0 || topTeams.length === 0)
                    ? topPlayers[1]
                      ? { b: topPlayers[1] }
                      : {}
                    : topTeams[1]
                      ? { b: topTeams[1] }
                      : {}),
                  ...(eventSlug ? { period: `e:${eventSlug}` } : evYr ? { period: `y${evYr}` } : {}),
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
            )}
            {topChamps.length >= 1 && (
              <HubLink
                to={{
                  kind: "counters",
                  query: `champ=${encodeURIComponent(resolveChampSlug(topChamps[0]))}${topChamps[1] ? `&vs=${encodeURIComponent(resolveChampSlug(topChamps[1]))}` : topTeams[0] ? `&vs=${encodeURIComponent(topTeams[0])}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${evYr ? `&patch=y${evYr}&year=${evYr}` : ""}`,
                }}
                className="text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "items",
                query:
                  new URLSearchParams({
                    ...(topPlayers[0]
                      ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) }
                      : {}),
                    ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                    ...(topChamps[0]
                      ? {
                          champ: resolveChampSlug(topChamps[0]),
                          ...(topChamps[1] ? { vschamp: resolveChampSlug(topChamps[1]) } : {}),
                        }
                      : {}),
                    ...(normLg ? { league: normLg } : {}),
                    ...(evYr ? { year: evYr } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                  }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Item history")} →
            </HubLink>
            <HubLink
              to={{
                kind: "records",
                query: new URLSearchParams({
                  ...(normLg ? { league: normLg } : {}),
                  ...(evYr ? { year: evYr } : {}),
                  ...(terms.length > 0 && (topPlayers[0] || topTeams[0])
                    ? { q: [...topPlayers, ...topTeams].filter(Boolean).join(",") }
                    : eventSlug
                      ? { q: eventSlug }
                      : {}),
                }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Records")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query:
                  new URLSearchParams({
                    ...(normLg ? { league: normLg } : {}),
                    ...(evYr ? { year: evYr } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topChamps[0] ? { champ: resolveChampSlug(topChamps[0]) } : {}),
                    ...(topPlayers.length >= 1 || topTeams.length >= 1
                      ? { q: [...topPlayers, ...topTeams].filter(Boolean).join(",") }
                      : {}),
                  }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "champions",
                query:
                  new URLSearchParams({
                    ...(normLg ? { scope: normLg, league: normLg } : {}),
                    ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topChamps.length >= 1 ? { q: topChamps.map(resolveChampSlug).join(",") } : {}),
                  }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Champions")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query:
                  new URLSearchParams({
                    ...(normLg ? { league: normLg, scope: normLg } : {}),
                    ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topChamps.length >= 1 ? { q: topChamps.map(resolveChampSlug).join(",") } : {}),
                  }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "draft",
                query: new URLSearchParams({
                  ...(topTeams.length >= 1 ? { teams: topTeams.join(",") } : {}),
                  ...(eventSlug ? { p: `e:${eventSlug}` } : evYr ? { p: `y${evYr}` } : {}),
                  ...(topChamps.length >= 1 ? { champ: topChamps.map(resolveChampSlug).join(",") } : {}),
                }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query:
                  new URLSearchParams({
                    ...(normLg ? { league: normLg } : {}),
                    ...(topTeams.length >= 1 ? { q: topTeams.join(",") } : {}),
                  }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query:
                  new URLSearchParams({
                    ...(normLg ? { league: normLg } : {}),
                    ...(evYr ? { year: evYr } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topPlayers[0]
                      ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) }
                      : {}),
                    ...(topTeams[0]
                      ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) }
                      : {}),
                    ...(topChamps[0] ? { champ: resolveChampSlug(topChamps[0]) } : {}),
                    ...(topChamps[1] ? { vschamp: resolveChampSlug(topChamps[1]) } : {}),
                  }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "best",
                query:
                  new URLSearchParams({
                    ...(normLg ? { league: normLg } : {}),
                    ...(evYr ? { year: evYr } : {}),
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(terms.length > 0 && topTeams.length >= 1
                      ? { q: topTeams.join(",") }
                      : eventSlug
                        ? { q: eventSlug }
                        : {}),
                  }).toString() || undefined,
              }}
              className="text-rw-accent hover:underline"
            >
              {tl("Best games")} →
            </HubLink>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1 text-xs text-rw-text w-48"
          />
        </div>
      )}
      {(["event", "teams", "players", "champs"] as Group[]).map((g) => {
        // the event in numbers leads its group
        const list = filteredFacts.filter((f) => groupOf(f) === g).sort((a, b) => Number(b.id === "totals") - Number(a.id === "totals"));
        if (!list.length) return null;
        return (
          // the id: a "jump to" link's target (the Worlds page's JumpBar)
          <div key={g} className="space-y-2" id={`facts-${g}`}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rw-text flex items-center gap-2">
              {titles[g]}
              <span className="flex-1 h-px bg-rw-border" />
            </h2>
            <div className="grid gap-3 md:grid-cols-2 3xl:grid-cols-3">
              {list.map((f) => (
                <FactCard key={f.id} f={f} link={link} shareId={shareId(f)} eventSlug={eventSlug} leagueSlug={normLg} year={evYr} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const FactCard: React.FC<{
  f: Fact;
  link: string;
  shareId: string;
  eventSlug?: string;
  leagueSlug?: string | null;
  year?: string | null;
}> = ({ f, link, shareId, eventSlug, leagueSlug, year }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const evYr =
    year && /^\d{4}$/.test(year)
      ? year
      : eventSlug && /\d{4}/.test(eventSlug)
        ? /\d{4}/.exec(eventSlug)![0]
        : undefined;
  const normLg = leagueSlug ? resolveLeagueSlug(leagueSlug) : undefined;
  const cardTeams = useMemo(() => {
    const out: string[] = [];
    for (const r of f.rows) {
      if (r.team && !out.includes(r.team)) out.push(r.team);
      else if (!r.team) {
        const vsText = /\s+vs\.?\s+/i.test(r.label) ? r.label : r.sub && /\s+vs\.?\s+/i.test(r.sub) ? r.sub : "";
        if (vsText) {
          for (const part of vsText.split(/\s+vs\.?\s+/i)) {
            const ts = resolveTeamAlias(part.replace(/·.*$/, "").trim());
            if (ts && !out.includes(ts)) out.push(ts);
            if (out.length >= 2) break;
          }
        }
      }
      if (out.length >= 2) break;
    }
    return out;
  }, [f.rows]);
  const cardPlayers = useMemo(() => {
    const out: string[] = [];
    for (const r of f.rows) {
      if (r.player && !out.includes(r.player)) out.push(r.player);
      if (out.length >= 2) break;
    }
    return out;
  }, [f.rows]);
  const cardChamps = useMemo(() => {
    const out: string[] = [];
    for (const r of f.rows) {
      const c = r.champ ? resolveChampSlug(r.champ) : "";
      if (c && !out.includes(c)) out.push(c);
      if (out.length >= 2) break;
    }
    return out;
  }, [f.rows]);
  const copy = () => {
    navigator.clipboard
      ?.writeText(factText(f, link))
      .then(() => {
        setState("copied");
        window.setTimeout(() => setState("idle"), 1500);
      })
      .catch(() => {
        setState("failed");
        window.setTimeout(() => setState("idle"), 2000);
      });
  };
  return (
    <Section
      title={f.title}
      id={shareId}
      share={shareId}
      right={
        <span className="flex items-center gap-1">
          {f.rows.length >= 1 &&
            (cardPlayers[0] ? (
              <>
                {cardTeams[0] && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: cardTeams[0],
                        ...(cardTeams[1] ? { b: cardTeams[1] } : {}),
                        ...(eventSlug ? { period: `e:${eventSlug}` } : evYr ? { period: `y${evYr}` } : {}),
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                      data-nocapture="1"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(cardTeams.join(","))}${eventSlug ? `&p=e:${encodeURIComponent(eventSlug)}` : evYr ? `&p=y${evYr}` : ""}${
                          cardChamps.length >= 1 ? `&champ=${encodeURIComponent(cardChamps.join(","))}` : ""
                        }`,
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                      data-nocapture="1"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "player",
                    a: cardPlayers[0],
                    ...(cardPlayers[1] ? { b: cardPlayers[1] } : {}),
                    ...(eventSlug ? { period: `e:${eventSlug}` } : evYr ? { period: `y${evYr}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: `player=${encodeURIComponent(cardPlayers[0])}${cardPlayers[1] ? `&vsplayer=${encodeURIComponent(cardPlayers[1])}` : ""}${cardTeams[0] ? `&team=${encodeURIComponent(cardTeams[0])}` : ""}${cardTeams[1] ? `&vs=${encodeURIComponent(cardTeams[1])}` : ""}${cardChamps[0] ? `&champ=${encodeURIComponent(cardChamps[0])}` : ""}${cardChamps[1] ? `&vschamp=${encodeURIComponent(cardChamps[1])}` : ""}${normLg ? `&league=${encodeURIComponent(normLg)}` : ""}${evYr ? `&year=${evYr}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
                {cardChamps[0] && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: `champ=${encodeURIComponent(cardChamps[0])}${cardChamps[1] ? `&vs=${encodeURIComponent(cardChamps[1])}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${evYr ? `&patch=y${evYr}&year=${evYr}` : ""}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                    data-nocapture="1"
                  >
                    {tl("Counters")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "leaders",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(evYr ? { year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        ...(cardChamps[0] ? { champ: cardChamps[0] } : {}),
                        q: [...cardPlayers, ...cardTeams].filter(Boolean).join(","),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      player: cardPlayers[0],
                      ...(cardPlayers[1] ? { vsplayer: cardPlayers[1] } : {}),
                      ...(cardTeams[0] ? { team: cardTeams[0] } : {}),
                      ...(cardTeams[1] ? { vs: cardTeams[1] } : {}),
                      ...(cardChamps[0] ? { champ: cardChamps[0] } : {}),
                      ...(cardChamps[1] ? { vschamp: cardChamps[1] } : {}),
                      ...(normLg ? { league: normLg } : {}),
                      ...(evYr ? { year: evYr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg, scope: normLg } : {}),
                        ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        ...(cardChamps.length >= 1 ? { q: cardChamps.join(",") } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(cardTeams.length >= 1 ? { q: cardTeams.join(",") } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Power rankings")} →
                </HubLink>
              </>
            ) : !cardPlayers[0] && !cardChamps[0] && cardTeams[0] ? (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: cardTeams[0],
                    ...(cardTeams[1] ? { b: cardTeams[1] } : {}),
                    ...(eventSlug ? { period: `e:${eventSlug}` } : evYr ? { period: `y${evYr}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(cardTeams.join(","))}${eventSlug ? `&p=e:${encodeURIComponent(eventSlug)}` : evYr ? `&p=y${evYr}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: cardTeams[0],
                    ...(cardTeams[1] ? { b: cardTeams[1] } : {}),
                    ...(eventSlug ? { period: `e:${eventSlug}` } : evYr ? { period: `y${evYr}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query: new URLSearchParams({
                      ...(normLg ? { league: normLg } : {}),
                      q: cardTeams.join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      team: cardTeams[0],
                      ...(cardTeams[1] ? { vs: cardTeams[1] } : {}),
                      ...(normLg ? { league: normLg } : {}),
                      ...(evYr ? { year: evYr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      team: cardTeams[0],
                      ...(cardTeams[1] ? { vs: cardTeams[1] } : {}),
                      ...(normLg ? { league: normLg } : {}),
                      ...(evYr ? { year: evYr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg, scope: normLg } : {}),
                        ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(evYr ? { year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        q: cardTeams.join(","),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </>
            ) : cardChamps[0] ? (
              <>
                {cardTeams[0] && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: cardTeams[0],
                        ...(cardTeams[1] ? { b: cardTeams[1] } : {}),
                        ...(eventSlug ? { period: `e:${eventSlug}` } : evYr ? { period: `y${evYr}` } : {}),
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                      data-nocapture="1"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a: cardTeams[0],
                        ...(cardTeams[1] ? { b: cardTeams[1] } : {}),
                        ...(eventSlug ? { period: `e:${eventSlug}` } : evYr ? { period: `y${evYr}` } : {}),
                      }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                      data-nocapture="1"
                    >
                      {tl("Compare")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${encodeURIComponent(cardChamps[0])}${cardChamps[1] ? `&vs=${encodeURIComponent(cardChamps[1])}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}${evYr ? `&patch=y${evYr}&year=${evYr}` : ""}`,
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Counters")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: `champ=${encodeURIComponent(cardChamps[0])}${cardChamps[1] ? `&vschamp=${encodeURIComponent(cardChamps[1])}` : ""}${cardTeams[0] ? `&team=${encodeURIComponent(cardTeams[0])}` : ""}${cardTeams[1] ? `&vs=${encodeURIComponent(cardTeams[1])}` : ""}${normLg ? `&league=${encodeURIComponent(normLg)}` : ""}${evYr ? `&year=${evYr}` : ""}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "champions",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg, scope: normLg } : {}),
                        ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        q: cardChamps.join(","),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Champions")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg, scope: normLg } : {}),
                        ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        q: cardChamps.join(","),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      ...(cardTeams.length >= 1 ? { teams: cardTeams.join(",") } : {}),
                      ...(eventSlug ? { p: `e:${eventSlug}` } : evYr ? { p: `y${evYr}` } : {}),
                      champ: cardChamps.join(","),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      champ: cardChamps[0],
                      ...(cardChamps[1] ? { vschamp: cardChamps[1] } : {}),
                      ...(cardTeams[0] ? { team: cardTeams[0] } : {}),
                      ...(cardTeams[1] ? { vs: cardTeams[1] } : {}),
                      ...(normLg ? { league: normLg } : {}),
                      ...(evYr ? { year: evYr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(cardTeams.length >= 1 ? { q: cardTeams.join(",") } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      champ: cardChamps[0],
                      ...(cardTeams.length >= 1 ? { q: cardTeams.join(",") } : {}),
                      ...(normLg ? { league: normLg } : {}),
                      ...(evYr ? { year: evYr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </>
            ) : (
              <>
                <HubLink
                  to={{
                    kind: "draft",
                    ...(eventSlug ? { query: `p=e:${encodeURIComponent(eventSlug)}` } : evYr ? { query: `p=y${evYr}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(evYr ? { year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(evYr ? { year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(evYr ? { year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query:
                      new URLSearchParams({
                        ...(normLg ? { league: normLg, scope: normLg } : {}),
                        ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Pro tier list")} →
                </HubLink>
              </>
            ))}
          <SectionCard
            section={f.title}
            sub={f.headline}
            name={shareId}
            rows={() =>
              f.rows.slice(0, 10).map((r, idx) => ({
                rank: f.plain ? undefined : idx + 1,
                champ: r.champ,
                team: !r.champ && r.team ? r.team : undefined,
                label: r.label,
                sub: r.sub,
                value: r.value,
              }))
            }
          />
          <CopyLinkButton url={`${link}#${shareId}`} />
          <button type="button" className={btn} onClick={copy} aria-label={tl("Copy as text")}>
            {state === "copied" ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <Copy className="w-3.5 h-3.5" />}
            {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Text")}
          </button>
        </span>
      }
    >
      <p className="text-sm font-semibold text-rw-text leading-snug">{f.headline}</p>
      <ol className="text-xs space-y-1.5">
        {(() => {
          const parseV = (s: string) => {
            if (!s) return null;
            const m = s.replace(/,/g, "").match(/^([0-9]+(?:\.[0-9]+)?)/);
            return m ? Number(m[1]) : null;
          };
          const nums = !f.plain ? f.rows.map((r) => parseV(r.value)) : [];
          const validNums = nums.filter((v): v is number => v != null && isFinite(v) && v > 0);
          const maxNum = validNums.length >= 2 ? Math.max(...validNums) : 0;
          const evQ = eventSlug ? `p=e:${encodeURIComponent(eventSlug)}` : evYr ? `p=y${encodeURIComponent(evYr)}` : undefined;
          return f.rows.map((r, i) => {
            const vNum = nums[i];
            const barPct = maxNum > 0 && vNum != null && vNum > 0 ? Math.max(4, Math.min(100, Math.round((vNum / maxNum) * 100))) : 0;
            const rChampSlug = r.champ ? resolveChampSlug(r.champ) : "";
            const vsChampSlug =
              rChampSlug && cardChamps[0] && cardChamps[0] !== rChampSlug
                ? cardChamps[0]
                : rChampSlug && cardChamps[1] && cardChamps[1] !== rChampSlug
                  ? cardChamps[1]
                  : "";
            const champRowQ =
              new URLSearchParams({
                ...(eventSlug ? { p: `e:${eventSlug}` } : evYr ? { p: `y${evYr}` } : {}),
                ...(r.player ? { player: r.player } : cardPlayers[0] ? { player: cardPlayers[0] } : {}),
                ...(r.team ? { team: r.team } : cardTeams[0] ? { team: cardTeams[0] } : {}),
                ...(vsChampSlug ? { vschamp: vsChampSlug } : {}),
              }).toString() || undefined;
            const playerRowQ =
              r.player
                ? new URLSearchParams({
                    ...(eventSlug ? { p: `e:${eventSlug}` } : evYr ? { p: `y${evYr}` } : {}),
                    ...(r.team ? { team: r.team } : {}),
                    ...(rChampSlug ? { champ: rChampSlug } : {}),
                  }).toString() || undefined
                : evQ;
            const vsTeamSlug = r.team ? cardTeams.find((t) => t !== r.team) : undefined;
            const teamRowQ =
              r.team
                ? new URLSearchParams({
                    ...(eventSlug ? { p: `e:${eventSlug}` } : evYr ? { p: `y${evYr}` } : {}),
                    ...(r.player ? { q: r.player } : vsTeamSlug ? { q: vsTeamSlug } : {}),
                    ...(rChampSlug ? { champ: rChampSlug } : {}),
                  }).toString() || undefined
                : evQ;
            return (
              <li key={i} className="relative overflow-hidden rounded px-1.5 py-0.5 flex items-start gap-2 min-w-0">
                {barPct > 0 && (
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 rounded"
                    style={{ width: `${barPct}%`, background: i === 0 ? "rgba(216,184,120,0.14)" : "rgba(130,170,255,0.07)" }}
                  />
                )}
                {!f.plain && <span className="relative w-4 text-rw-muted text-right shrink-0">{i + 1}.</span>}
                {r.champ ? (
                  <HubLink to={{ kind: "champ", slug: resolveChampSlug(r.champ), ...(champRowQ ? { query: champRowQ } : {}) }} className="relative shrink-0">
                    <ChampIcon name={r.champ} size={18} />
                  </HubLink>
                ) : r.player ? (
                  <HubLink to={{ kind: "player", slug: r.player, ...(playerRowQ ? { query: playerRowQ } : {}) }} className="relative shrink-0">
                    <PlayerPhoto
                      name={r.team && /^[A-Z0-9]{2,6}\s+\S/.test(r.label) ? r.label.replace(/^[A-Z0-9]{2,6}\s+/, "") : r.label}
                      team={r.team ?? undefined}
                      slug={r.player}
                      size={18}
                    />
                  </HubLink>
                ) : r.team ? (
                  <HubLink to={{ kind: "team", slug: r.team, ...(teamRowQ ? { query: teamRowQ } : {}) }} className="relative shrink-0">
                    <TeamLogo name={r.team} code={r.label.length <= 5 && !/\s/.test(r.label) ? r.label : undefined} size={16} />
                  </HubLink>
                ) : null}
                <span className="relative min-w-0 flex-1">
                  {r.player ? (
                    <PlayerLink name={r.label} u={r.player} query={playerRowQ} />
                  ) : r.team ? (
                    <TeamLink name={r.label} u={r.team} query={teamRowQ} />
                  ) : r.champ ? (
                    <HubLink to={{ kind: "champ", slug: resolveChampSlug(r.champ), ...(champRowQ ? { query: champRowQ } : {}) }} className="hover:text-rw-accent hover:underline">
                      {r.label}
                    </HubLink>
                  ) : r.match ? (
                    <HubLink to={{ kind: "match", slug: r.match.slug, game: r.match.game }} className="hover:text-rw-accent hover:underline">
                      {r.label}
                    </HubLink>
                  ) : (
                    <span>{r.label}</span>
                  )}
                  {r.sub && <span className="block text-[11px] text-rw-muted break-words">{r.sub}</span>}
                </span>
                {r.match ? (
                  <HubLink
                    to={{ kind: "match", slug: r.match.slug, game: r.match.game }}
                    className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums"
                  >
                    {r.value}
                  </HubLink>
                ) : r.player ? (
                  <HubLink
                    to={{
                      kind: "player",
                      slug: r.player,
                      tab: "stats",
                      ...(playerRowQ ? { query: playerRowQ } : {}),
                    }}
                    className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums"
                  >
                    {r.value}
                  </HubLink>
                ) : r.team ? (
                  <HubLink
                    to={{
                      kind: "team",
                      slug: r.team,
                      tab: "stats",
                      ...(teamRowQ ? { query: teamRowQ } : {}),
                    }}
                    className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums"
                  >
                    {r.value}
                  </HubLink>
                ) : r.champ ? (
                  <HubLink to={{ kind: "champ", slug: resolveChampSlug(r.champ), ...(champRowQ ? { query: champRowQ } : {}) }} className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums">
                    {r.value}
                  </HubLink>
                ) : eventSlug || normLg || evYr ? (
                  <HubLink
                    to={{
                      kind: "finder",
                      query: new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(evYr ? { year: evYr } : {}),
                        ...(eventSlug ? { event: eventSlug } : {}),
                        ...(cardPlayers[0] ? { player: cardPlayers[0] } : {}),
                        ...(cardPlayers[1] ? { vsplayer: cardPlayers[1] } : {}),
                        ...(cardTeams[0] ? { team: cardTeams[0] } : {}),
                        ...(cardTeams[1] ? { vs: cardTeams[1] } : {}),
                        ...(cardChamps[0] ? { champ: cardChamps[0] } : {}),
                        ...(cardChamps[1] ? { vschamp: cardChamps[1] } : {}),
                      }).toString(),
                    }}
                    className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums"
                  >
                    {r.value}
                  </HubLink>
                ) : (
                  <span className="relative font-bold text-rw-accent shrink-0 tabular-nums">{r.value}</span>
                )}
              </li>
            );
          });
        })()}
      </ol>
      {f.note && <p className="text-[10px] text-rw-muted">{f.note}</p>}
    </Section>
  );
};

/** A tournament page's stats, from its lines file (the stats build writes one for events played into last year on). */
export const EventStatsSection: React.FC<{ slug: string; name: string; end?: string | null; leagueSlug?: string | null; year?: string | null }> = ({
  slug,
  name,
  end,
  leagueSlug,
  year,
}) => {
  const lines = useLoad(() => loadEventLines(slug).catch(() => null), [slug]);
  const [hidden, reveal] = useHidden(`event-stats:${slug}`, end ?? undefined);
  const facts = useMemo(() => (lines.data ? allFacts([lines.data], [], name) : []), [lines.data, name]);
  if (!facts.length) return null;
  if (hidden)
    return (
      <Section title={tl("Stats")}>
        <p className="text-xs text-rw-sub flex items-center gap-2">
          {tl("Hidden while spoiler mode is on.")} <RevealButton onReveal={reveal} />
        </p>
      </Section>
    );
  return <FactGroups facts={facts} link={hubShareUrl({ kind: "event", slug, tab: "stats" })} shareId={(f) => `${slug}-${f.id}`} eventSlug={slug} leagueSlug={leagueSlug} year={year} />;
};
