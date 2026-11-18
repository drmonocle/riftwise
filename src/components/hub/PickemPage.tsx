/**
 * Year-round League of Legends Pick'Em (/stats/pickem): predict upcoming LCK, LPL, LEC, LCS, LCP, CBLOL,
 * EMEA Masters, Demacia Cup or cross-league series from Riot's schedule, with Elo win-probability hints,
 * kickoff lock protection and private Friends League invite boards.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Lock, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { tl, tn, locale } from "../../i18n";
import type { Match } from "../../types";
import { fetchSchedule } from "../../api";
import type { PickemPick, PickemTeam } from "../../sync";
import { findHubTeam, loadHubIndexQuick, loadRatings, prettySlug, resolveLeagueSlug, resolveTeamAlias } from "../../hub/data";
import { chances } from "../../hub/matchRatings";
import type { HubRatings } from "../../hub/types";
import { currentHubRoute, navigateHub } from "../../hub/route";
import { HubLink, Section, TeamLogo, useLoad, usePageTitle } from "./ui";
import { pillClass } from "./menu";
import { PickemBoard } from "./PickemBoard";

export type PickemLeagueKey =
  | "season"
  | "lck"
  | "lpl"
  | "lec"
  | "lcs"
  | "lcp"
  | "cblol"
  | "emea-masters"
  | "demacia-cup";

export const PICKEM_LEAGUES: { key: PickemLeagueKey; label: string; hubSlug?: string }[] = [
  { key: "season", label: "All leagues" },
  { key: "lck", label: "LCK", hubSlug: "lol-champions-korea" },
  { key: "lpl", label: "LPL", hubSlug: "tencent-lol-pro-league" },
  { key: "lec", label: "LEC", hubSlug: "lol-emea-championship" },
  { key: "lcs", label: "LCS", hubSlug: "league-of-legends-championship-series" },
  { key: "lcp", label: "LCP", hubSlug: "league-of-legends-championship-pacific" },
  { key: "cblol", label: "CBLOL", hubSlug: "circuit-brazilian-league-of-legends" },
  { key: "emea-masters", label: "EMEA Masters", hubSlug: "emea-masters" },
  { key: "demacia-cup", label: "Demacia Cup", hubSlug: "demacia-cup" },
];

const HUB_SLUG_TO_PICKEM: Record<string, PickemLeagueKey> = {
  "lol-champions-korea": "lck",
  "tencent-lol-pro-league": "lpl",
  "lol-emea-championship": "lec",
  "league-of-legends-championship-series": "lcs",
  "league-of-legends-championship-of-the-americas-north": "lcs",
  "league-of-legends-championship-pacific": "lcp",
  "circuit-brazilian-league-of-legends": "cblol",
  "emea-masters": "emea-masters",
  "demacia-cup": "demacia-cup",
};

export function normalizePickemLeagueKey(raw?: string | null): PickemLeagueKey {
  const s = (raw || "").trim().toLowerCase();
  if (!s || s === "season" || s === "all") return "season";
  if (s === "lck" || s === "lpl" || s === "lec" || s === "lcs" || s === "lcp" || s === "cblol" || s === "emea-masters" || s === "demacia-cup") {
    return s;
  }
  if (s === "cblol-brazil") return "cblol";
  if (s === "emea_masters") return "emea-masters";
  if (s === "demacia_cup") return "demacia-cup";
  if (s === "lta_n" || s === "lta_north") return "lcs";
  const resolved = resolveLeagueSlug(s);
  return HUB_SLUG_TO_PICKEM[resolved] || HUB_SLUG_TO_PICKEM[s] || "season";
}

export function matchPickemSlug(riotSlug: string, leagueKey: PickemLeagueKey): boolean {
  const s = (riotSlug || "").trim().toLowerCase();
  switch (leagueKey) {
    case "season":
      return s !== "";
    case "cblol":
      return s === "cblol-brazil" || s === "cblol";
    case "emea-masters":
      return s === "emea_masters" || s === "emea-masters";
    case "demacia-cup":
      return s === "demacia_cup" || s === "demacia-cup";
    case "lcs":
      return s === "lcs" || s === "lta_n" || s === "lta_north";
    default:
      return s === leagueKey;
  }
}

export function isMatchLocked(m: Pick<Match, "state" | "startTimeUtc">, nowMs = Date.now()): boolean {
  if (m.state === "inProgress" || m.state === "completed") return true;
  if (!m.startTimeUtc) return false;
  const ts = Date.parse(m.startTimeUtc);
  return Number.isFinite(ts) && ts <= nowMs;
}

export function isPlayoffBlock(blockName?: string): boolean {
  return /(quarter|semi|final|knockout|playoff)/i.test(blockName || "");
}

export function buildSlatePicks(
  matches: Pick<Match, "matchId" | "blockName" | "team1Name" | "team1Code" | "team2Name" | "team2Code">[],
  choices: Record<string, 1 | 2>,
  teamSlugOf: (name: string, code: string) => string,
): { picks: PickemPick[]; teams: PickemTeam[] } {
  const teamMap = new Map<string, PickemTeam>();
  const picks: PickemPick[] = [];
  for (const m of matches) {
    const pick = choices[m.matchId];
    if (!m.matchId) continue;
    const a = teamSlugOf(m.team1Name, m.team1Code);
    const b = teamSlugOf(m.team2Name, m.team2Code);
    if (!a || !b || a === b) continue;
    if (!teamMap.has(a)) teamMap.set(a, { u: a, c: m.team1Code, n: m.team1Name });
    if (!teamMap.has(b)) teamMap.set(b, { u: b, c: m.team2Code, n: m.team2Name });
    if (pick === 1 || pick === 2) {
      picks.push({
        s: "match",
        m: m.matchId,
        r: isPlayoffBlock(m.blockName) ? 2 : 1,
        a,
        b,
        w: pick === 1 ? a : b,
      });
    }
  }
  return { picks, teams: Array.from(teamMap.values()) };
}

const storageKey = (ev: string) => `rw_pickem_slate_${ev}`;

function readSavedChoices(ev: string): Record<string, 1 | 2> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(ev)) || "{}");
    const out: Record<string, 1 | 2> = {};
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        if (v === 1 || v === 2) out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function fmtKickoff(utc: string): string {
  if (!utc) return "";
  const d = new Date(utc);
  if (isNaN(d.getTime())) return utc;
  return d.toLocaleString(locale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const PickemPage: React.FC<{ query?: string; schedule?: Match[] }> = ({ query, schedule }) => {
  const nowRoute = currentHubRoute();
  const routeQ = query ?? ("query" in nowRoute ? nowRoute.query : undefined) ?? (typeof window !== "undefined" ? window.location.search : "");
  const params = useMemo(() => new URLSearchParams(routeQ), [routeQ]);

  const [fetchedSchedule, setFetchedSchedule] = useState<Match[]>([]);
  const [schedLoading, setSchedLoading] = useState(() => !schedule || schedule.length === 0);
  useEffect(() => {
    if (schedule && schedule.length > 0) {
      setSchedLoading(false);
      return;
    }
    let alive = true;
    setSchedLoading(true);
    fetchSchedule(2)
      .then((ms) => alive && setFetchedSchedule(ms))
      .catch(() => {})
      .finally(() => alive && setSchedLoading(false));
    return () => {
      alive = false;
    };
  }, [schedule]);

  const allMatches = useMemo(() => {
    const base = schedule && schedule.length > 0 ? schedule : fetchedSchedule;
    return base.filter((m) => m.team1Code !== "TBD" && m.team2Code !== "TBD" && m.team1Name !== "TBD" && m.team2Name !== "TBD" && m.matchId);
  }, [schedule, fetchedSchedule]);

  const urlLeague = normalizePickemLeagueKey(params.get("league"));
  const defaultYear = useMemo(() => {
    const y = params.get("year");
    if (y === "2026" || y === "2027") return y;
    const years = Array.from(new Set(allMatches.map((m) => m.startTimeUtc.slice(0, 4)).filter((yr) => /^20\d\d$/.test(yr))));
    if (years.includes("2026")) return "2026";
    if (years.length > 0) return years.sort().reverse()[0];
    return String(Math.max(2026, new Date().getFullYear()));
  }, [params, allMatches]);

  const [leagueKey, setLeagueKey] = useState<PickemLeagueKey>(urlLeague);
  const [year, setYear] = useState<string>(defaultYear);
  useEffect(() => {
    setLeagueKey(normalizePickemLeagueKey(params.get("league")));
    const y = params.get("year");
    if (y === "2026" || y === "2027") setYear(y);
  }, [params]);

  const eventId = `${leagueKey}-${year}`;
  const leagueInfo = PICKEM_LEAGUES.find((l) => l.key === leagueKey) || PICKEM_LEAGUES[0];
  const boardName = `${leagueKey === "season" ? tl("All leagues") : leagueInfo.label} ${year}`;
  usePageTitle(`${tl("Pick'Em")} · ${boardName}`);

  const hubIndex = useLoad(loadHubIndexQuick, []).data;
  const ratings = useLoad(loadRatings, []).data;

  const teamSlugOf = useCallback(
    (name: string, code: string) => {
      const hit = hubIndex ? findHubTeam(hubIndex, name, code) : null;
      return hit || resolveTeamAlias(name) || resolveTeamAlias(code) || prettySlug(name || code);
    },
    [hubIndex],
  );

  const slateMatches = useMemo(() => {
    return allMatches
      .filter((m) => m.startTimeUtc.startsWith(year) && matchPickemSlug(m.leagueSlug, leagueKey))
      .sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
  }, [allMatches, year, leagueKey]);

  const upcomingMatches = useMemo(() => slateMatches.filter((m) => m.state !== "completed"), [slateMatches]);
  const completedMatches = useMemo(
    () => slateMatches.filter((m) => m.state === "completed").slice().reverse(),
    [slateMatches],
  );

  const [localChoices, setLocalChoices] = useState<Record<string, 1 | 2>>(() => readSavedChoices(eventId));
  const [serverPicks, setServerPicks] = useState<PickemPick[]>([]);

  useEffect(() => {
    setLocalChoices(readSavedChoices(eventId));
    setServerPicks([]);
  }, [eventId]);

  const saveLocal = useCallback(
    (next: Record<string, 1 | 2>) => {
      setLocalChoices(next);
      try {
        localStorage.setItem(storageKey(eventId), JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
    },
    [eventId],
  );

  const serverChoiceByMatch = useMemo(() => {
    const map: Record<string, 1 | 2> = {};
    if (!serverPicks.length) return map;
    const byId = new Map(slateMatches.map((m) => [m.matchId, m]));
    for (const p of serverPicks) {
      if (p.s !== "match" || !p.m) continue;
      const m = byId.get(p.m);
      if (m) {
        const s1 = teamSlugOf(m.team1Name, m.team1Code);
        const s2 = teamSlugOf(m.team2Name, m.team2Code);
        if (p.w === s1) map[p.m] = 1;
        else if (p.w === s2) map[p.m] = 2;
      } else if (p.w === p.a) {
        map[p.m] = 1;
      } else if (p.w === p.b) {
        map[p.m] = 2;
      }
    }
    return map;
  }, [serverPicks, slateMatches, teamSlugOf]);

  const effectiveChoices = useMemo(() => {
    const out: Record<string, 1 | 2> = {};
    for (const m of slateMatches) {
      const locked = isMatchLocked(m);
      const srv = serverChoiceByMatch[m.matchId];
      const loc = localChoices[m.matchId];
      const val = locked ? srv : (loc ?? srv);
      if (val === 1 || val === 2) out[m.matchId] = val;
    }
    return out;
  }, [slateMatches, serverChoiceByMatch, localChoices]);

  const { picks, teams } = useMemo(() => {
    const slateBuilt = buildSlatePicks(slateMatches, effectiveChoices, teamSlugOf);
    // Preserve server-stored picks for earlier matches that scrolled off Riot's schedule window
    const seenIds = new Set(slateBuilt.picks.map((p) => p.m).filter(Boolean));
    const mergedPicks = [...slateBuilt.picks];
    const teamSet = new Map(slateBuilt.teams.map((t) => [t.u, t]));
    for (const sp of serverPicks) {
      if (sp.s === "match" && sp.m && !seenIds.has(sp.m)) {
        mergedPicks.push(sp);
        if (!teamSet.has(sp.a)) teamSet.set(sp.a, { u: sp.a, c: sp.a.toUpperCase().slice(0, 5), n: sp.a });
        if (!teamSet.has(sp.b)) teamSet.set(sp.b, { u: sp.b, c: sp.b.toUpperCase().slice(0, 5), n: sp.b });
      }
    }
    return { picks: mergedPicks, teams: Array.from(teamSet.values()) };
  }, [slateMatches, effectiveChoices, teamSlugOf, serverPicks]);

  const togglePick = (m: Match, side: 1 | 2) => {
    if (isMatchLocked(m)) return;
    const next = { ...effectiveChoices };
    if (next[m.matchId] === side) delete next[m.matchId];
    else next[m.matchId] = side;
    saveLocal(next);
  };

  const matchProb = useCallback(
    (m: Match): number | null => {
      if (!ratings) return null;
      const s1 = teamSlugOf(m.team1Name, m.team1Code);
      const s2 = teamSlugOf(m.team2Name, m.team2Code);
      const r1 = ratings.teams.find((r) => r[0] === s1);
      const r2 = ratings.teams.find((r) => r[0] === s2);
      if (!r1 || !r2) return null;
      return chances(ratings, r1, r2, m.bestOf)?.series ?? null;
    },
    [ratings, teamSlugOf],
  );

  const pickFavourites = () => {
    const next = { ...effectiveChoices };
    let changed = false;
    for (const m of upcomingMatches) {
      if (isMatchLocked(m) || next[m.matchId]) continue;
      const p = matchProb(m);
      if (p !== null) {
        next[m.matchId] = p >= 0.5 ? 1 : 2;
        changed = true;
      } else if (m.team1Record && m.team2Record) {
        const w1 = m.team1Record[0] / Math.max(1, m.team1Record[0] + m.team1Record[1]);
        const w2 = m.team2Record[0] / Math.max(1, m.team2Record[0] + m.team2Record[1]);
        next[m.matchId] = w1 >= w2 ? 1 : 2;
        changed = true;
      } else {
        next[m.matchId] = 1;
        changed = true;
      }
    }
    if (changed) saveLocal(next);
  };

  const clearUnlocked = () => {
    const next: Record<string, 1 | 2> = {};
    for (const m of slateMatches) {
      if (isMatchLocked(m) && effectiveChoices[m.matchId]) {
        next[m.matchId] = effectiveChoices[m.matchId];
      }
    }
    saveLocal(next);
  };

  const switchParams = (nextLeague: PickemLeagueKey, nextYear: string) => {
    setLeagueKey(nextLeague);
    setYear(nextYear);
    const liveSearch = typeof window !== "undefined" ? window.location.search : routeQ;
    const p = new URLSearchParams(liveSearch);
    if (nextLeague === "season") p.delete("league");
    else p.set("league", nextLeague);
    if (nextYear === "2026" && !p.has("year")) p.delete("year");
    else p.set("year", nextYear);
    const qStr = p.toString();
    navigateHub(qStr ? { kind: "pickem", query: qStr } : { kind: "pickem" }, { replace: true });
  };

  const availableYears = useMemo(() => {
    const yrs = new Set(["2026", "2027", defaultYear]);
    for (const m of allMatches) {
      const y = m.startTimeUtc.slice(0, 4);
      if (/^20\d\d$/.test(y)) yrs.add(y);
    }
    return Array.from(yrs).sort();
  }, [allMatches, defaultYear]);

  const unlockedPickCount = upcomingMatches.filter((m) => !isMatchLocked(m) && (effectiveChoices[m.matchId] === 1 || effectiveChoices[m.matchId] === 2)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-extrabold text-rw-text flex items-center gap-2 mr-auto">
          <Trophy className="w-5 h-5 text-rw-accent" />
          {tl("Pick'Em")} · {boardName}
        </h1>
        <div className="flex items-center gap-1">
          {availableYears.map((y) => (
            <button key={y} type="button" onClick={() => switchParams(leagueKey, y)} className={pillClass(year === y)}>
              {y}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-rw-sub leading-relaxed">
        {tl("Predict upcoming series across every major league year-round. Picks lock automatically at kickoff, score 1 point for regular season or 2 points for playoffs, and sync across private friends leagues.")}
      </p>

      <div className="flex flex-wrap items-center gap-1.5" data-nocapture="1">
        {PICKEM_LEAGUES.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => switchParams(l.key, year)}
            className={pillClass(leagueKey === l.key)}
          >
            {l.key === "season" ? tl("All leagues") : l.label}
          </button>
        ))}
        <HubLink to={{ kind: "worlds" }} className={pillClass(false)}>
          {tl("Worlds")} →
        </HubLink>
        <HubLink to={{ kind: "msi" }} className={pillClass(false)}>
          {tl("MSI")} →
        </HubLink>
        <HubLink to={{ kind: "first-stand" }} className={pillClass(false)}>
          {tl("First Stand")} →
        </HubLink>
      </div>

      <Section
        title={tl("Upcoming")}
        right={
          <span className="flex flex-wrap items-center gap-1.5">
            {upcomingMatches.length > 0 && (
              <>
                <span className="text-[11px] font-num text-rw-muted">
                  {unlockedPickCount}/{upcomingMatches.filter((m) => !isMatchLocked(m)).length}
                </span>
                <button
                  type="button"
                  onClick={pickFavourites}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
                >
                  <Sparkles className="w-3 h-3 text-rw-accent" />
                  {tl("Favourites")}
                </button>
                <button
                  type="button"
                  onClick={clearUnlocked}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
                >
                  <RotateCcw className="w-3 h-3" />
                  {tl("Clear")}
                </button>
              </>
            )}
          </span>
        }
      >
        {schedLoading && allMatches.length === 0 ? (
          <p className="text-xs text-rw-sub py-4">{tl("Loading…")}</p>
        ) : upcomingMatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {upcomingMatches.map((m) => {
              const locked = isMatchLocked(m);
              const pick = effectiveChoices[m.matchId];
              const p1 = matchProb(m);
              const p2 = p1 !== null ? 1 - p1 : null;
              const s1 = teamSlugOf(m.team1Name, m.team1Code);
              const s2 = teamSlugOf(m.team2Name, m.team2Code);
              const playoff = isPlayoffBlock(m.blockName);
              return (
                <div key={m.matchId} className="rounded-xl border border-rw-border bg-rw-bg/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-rw-muted">
                    <span className="truncate font-semibold text-rw-sub">
                      {m.leagueName}
                      {m.blockName ? ` · ${m.blockName}` : ""} · Bo{m.bestOf}
                      {playoff ? ` · ${tl("2 pts")}` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 shrink-0 font-num">
                      {m.state === "inProgress" && <span className="text-rw-red font-bold">{tl("LIVE")}</span>}
                      {locked && (
                        <span className="inline-flex items-center gap-0.5 text-rw-muted">
                          <Lock className="w-3 h-3" />
                          {tl("Locked")}
                        </span>
                      )}
                      {!locked && <span>{fmtKickoff(m.startTimeUtc)}</span>}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([1, 2] as const).map((side) => {
                      const code = side === 1 ? m.team1Code : m.team2Code;
                      const name = side === 1 ? m.team1Name : m.team2Name;
                      const img = side === 1 ? m.team1Image : m.team2Image;
                      const prob = side === 1 ? p1 : p2;
                      const picked = pick === side;
                      return (
                        <button
                          key={side}
                          type="button"
                          disabled={locked}
                          onClick={() => togglePick(m, side)}
                          aria-pressed={picked}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors ${
                            picked
                              ? "bg-rw-accent/15 border-rw-accent text-rw-text"
                              : "border-rw-border bg-rw-panel/60 text-rw-sub hover:text-rw-text hover:border-rw-accent/40"
                          } ${locked ? "opacity-75 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <TeamLogo name={name} code={code} src={img} size={22} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold truncate flex items-center gap-1">
                              <span>{code}</span>
                              {picked && <Check className="w-3 h-3 text-rw-accent shrink-0" />}
                            </div>
                            <div className="text-[10px] text-rw-muted truncate">{name}</div>
                          </div>
                          {prob !== null && (
                            <span className="text-[11px] font-num text-rw-muted shrink-0">{Math.round(prob * 100)}%</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {s1 && s2 && s1 !== s2 && (
                    <div className="flex justify-end text-[11px]">
                      <HubLink to={{ kind: "prep", a: s1, b: s2 }} className="text-rw-accent hover:underline">
                        {tl("Match prep")} →
                      </HubLink>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-rw-border/70 bg-rw-bg/40 p-4 text-xs text-rw-sub space-y-2.5">
            <p>
              {leagueKey === "season"
                ? tl("No upcoming series in Riot's current schedule window yet. Your picks and friends league leaderboards stay active year-round.")
                : tl("No upcoming {league} series in Riot's current schedule window right now (off-season or between splits).", {
                    league: leagueInfo.label,
                  })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {leagueKey !== "season" && (
                <button
                  type="button"
                  onClick={() => switchParams("season", year)}
                  className="px-2.5 py-1 rounded-lg bg-rw-accent/15 border border-rw-accent text-rw-accent font-semibold"
                >
                  {tl("All leagues")}
                </button>
              )}
              {leagueInfo.hubSlug && (
                <HubLink to={{ kind: "league", slug: leagueInfo.hubSlug }} className="text-rw-accent hover:underline font-semibold">
                  {leagueInfo.label} →
                </HubLink>
              )}
              <HubLink to={{ kind: "moves" }} className="text-rw-accent hover:underline font-semibold">
                {tl("Roster moves")} →
              </HubLink>
            </div>
          </div>
        )}
      </Section>

      {completedMatches.length > 0 && (
        <Section title={`${tl("Results")} (${completedMatches.length})`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {completedMatches.slice(0, 12).map((m) => {
              const pick = effectiveChoices[m.matchId];
              const winner: 1 | 2 | null = m.team1Score > m.team2Score ? 1 : m.team2Score > m.team1Score ? 2 : null;
              const hit = pick && winner ? pick === winner : null;
              return (
                <div key={m.matchId} className="flex items-center justify-between gap-2 rounded-lg border border-rw-border bg-rw-bg/40 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-[11px] text-rw-muted truncate">
                      {m.leagueName}
                      {m.blockName ? ` · ${m.blockName}` : ""}
                    </div>
                    <div className="font-semibold text-rw-text truncate">
                      {m.team1Code}{" "}
                      <span className="font-num text-rw-accent">
                        {m.team1Score}–{m.team2Score}
                      </span>{" "}
                      {m.team2Code}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] font-semibold">
                    {hit === true && <span className="text-rw-teal">{tl("Correct")}</span>}
                    {hit === false && <span className="text-rw-red">{tl("Missed")}</span>}
                    {hit === null && <span className="text-rw-muted">{fmtKickoff(m.startTimeUtc)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <PickemBoard
        event={eventId}
        name={boardName}
        picks={picks}
        teams={teams}
        scoringNote={tl("{event}: predict pro series before kickoff and compete globally or inside a private friends league. 1 point per regular-season series, 2 points per playoff series.", {
          event: boardName,
        })}
        onServerPicks={setServerPicks}
      />
    </div>
  );
};
