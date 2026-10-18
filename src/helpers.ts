import { Match, StreamEvent, StreamStatus, AppSettings, League, PlayerEntry, CatalogTeam } from "./types";
import { tl, eventName, stageName, tc } from "./i18n";

// Current schedule codes folded into the code their franchise history is stored under in
// all_time_h2h.json (keep in sync with CODE_ALIASES in h2h-refresh/assemble.py).
const CODE_ALIASES: Record<string, string> = {
  TLAW: "TL",
  MKOI: "MDK",
  KBM: "KBM",
  KRX: "DRX",
  DNS: "KDF",
  DNF: "KDF",
};

// Full team names that can still appear as keys in all_time_h2h.json. Only same-org renames here.
const H2H_NAME_ALIASES: Record<string, string> = {
  "NATUS VINCERE": "NAVI",
  "OKSAVINGSBANK BRION": "BRO",
  "HANJIN BRION": "BRO",
  "KIWOOM DRX": "DRX",
};

export function normalizeTeamCode(code: string): string {
  if (!code) return "";
  const upper = code.trim().toUpperCase();
  return CODE_ALIASES[upper] || upper;
}

/** Merges the raw "A__B": [aWins, bWins] records under normalized team codes. */
export function buildAllTimeH2H(raw: Record<string, [number, number]>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const [key, [aWins, bWins]] of Object.entries(raw)) {
    const [rawA, rawB] = key.split("__");
    const a = normalizeTeamCode(H2H_NAME_ALIASES[rawA] || rawA);
    const b = normalizeTeamCode(H2H_NAME_ALIASES[rawB] || rawB);
    if (!a || !b || a === b) continue;
    if (out[`${a}__${b}`]) {
      out[`${a}__${b}`][0] += aWins;
      out[`${a}__${b}`][1] += bWins;
    } else if (out[`${b}__${a}`]) {
      out[`${b}__${a}`][0] += bWins;
      out[`${b}__${a}`][1] += aWins;
    } else {
      out[`${a}__${b}`] = [aWins, bWins];
    }
  }
  return out;
}

/** Games up to this moment are in the bundled all_time_h2h.json; later results come from the schedule. */
export const BUNDLED_H2H_CUTOFF = "2026-09-26T00:00:00Z";

// Empty until loadBundledH2H() or applyH2HData() runs; keeps the 170 KB table out of the startup bundle.
let ALL_TIME_H2H: Record<string, [number, number]> = {};
let H2H_CUTOFF_MS = new Date(BUNDLED_H2H_CUTOFF).getTime();
let H2H_LOADED = false;

/** True once any H2H table (bundled or downloaded) is in place. */
export function isH2HLoaded(): boolean {
  return H2H_LOADED;
}

/** Loads the table shipped inside the app, unless newer downloaded data is already applied. */
export async function loadBundledH2H(): Promise<boolean> {
  if (H2H_LOADED) return false;
  const mod = await import("./all_time_h2h.json");
  if (H2H_LOADED) return false; // downloaded data won the race
  ALL_TIME_H2H = buildAllTimeH2H((mod.default ?? mod) as unknown as Record<string, [number, number]>);
  H2H_LOADED = true;
  return true;
}

/** Key for a pair in the H2H tables: codes normalized and sorted, joined by "__". */
export function h2hKey(team1Code: string, team2Code: string): string {
  const [a, b] = [normalizeTeamCode(team1Code), normalizeTeamCode(team2Code)].sort();
  return `${a}__${b}`;
}

/** Start of the window the app fills from its own schedule (everything earlier is in the table). */
export function h2hCutoffMs(): number {
  return H2H_CUTOFF_MS;
}

/** Downloaded H2H data (see fetchH2HData). Only replaces the bundled table when it is newer. */
export interface H2HData {
  cutoff: string;
  pairs: Record<string, [number, number]>;
}

export function applyH2HData(data: H2HData): boolean {
  const cutoffMs = new Date(data.cutoff).getTime();
  if (isNaN(cutoffMs) || cutoffMs <= H2H_CUTOFF_MS) return false;
  ALL_TIME_H2H = buildAllTimeH2H(data.pairs);
  H2H_CUTOFF_MS = cutoffMs;
  H2H_LOADED = true;
  return true;
}

/** One past series between two teams, as shown in the H2H details view. */
export interface H2HMeeting {
  date: string;
  tournament: string;
  /** Game wins for team1 / team2 of the pair as the caller ordered them. */
  team1Score: number;
  team2Score: number;
  matchId?: string;
}

/**
 * Past meetings for the details view: the published series history (up to the data cutoff)
 * plus completed matches from the live schedule after it, newest first.
 */
export function recentMeetings(
  team1Code: string,
  team2Code: string,
  published: [string, string, number, number][] | undefined,
  schedule: Match[] | undefined,
  matchId?: string,
  countThisMatch = true,
  limit = 10,
): H2HMeeting[] {
  const c1 = normalizeTeamCode(team1Code);
  const c2 = normalizeTeamCode(team2Code);
  const [a] = [c1, c2].sort();
  const flip = a !== c1; // published scores are from the alphabetically-first team's side

  // Opened from a finished match: list meetings up to and including it (see computeHeadToHead)
  const self = matchId ? schedule?.find((m) => m.matchId === matchId) : undefined;
  const selfDone = self?.state === "completed";
  const asOfMs = selfDone ? new Date(self!.startTimeUtc).getTime() : Infinity;
  const asOfDate = selfDone ? self!.startTimeUtc.slice(0, 10) : "9999";

  const out: H2HMeeting[] = [];
  for (const m of schedule || []) {
    if (m.state !== "completed") continue;
    if (m.matchId === matchId && !countThisMatch) continue;
    const m1 = normalizeTeamCode(m.team1Code);
    const m2 = normalizeTeamCode(m.team2Code);
    const direct = m1 === c1 && m2 === c2;
    if (!direct && !(m1 === c2 && m2 === c1)) continue;
    const t = new Date(m.startTimeUtc).getTime();
    if (isNaN(t) || t < H2H_CUTOFF_MS || t > asOfMs) continue;
    out.push({
      date: m.startTimeUtc.slice(0, 10),
      tournament: m.leagueName,
      team1Score: direct ? m.team1Score : m.team2Score,
      team2Score: direct ? m.team2Score : m.team1Score,
      matchId: m.matchId,
    });
  }
  for (const [date, tournament, aw, bw] of published || []) {
    if (date > asOfDate || (selfDone && !countThisMatch && date === asOfDate)) continue;
    out.push({ date, tournament, team1Score: flip ? bw : aw, team2Score: flip ? aw : bw });
  }
  out.sort((x, y) => y.date.localeCompare(x.date));
  return out.slice(0, limit);
}

/** If the schedule's latest started entry is older than this, the stream is treated as offline. */
const MAX_AIRING_GAP_MS = 10 * 60 * 60 * 1000;

const ts = (iso?: string): number => {
  if (!iso) return NaN;
  return new Date(iso).getTime();
};

export type StreamPhase =
  | { kind: "airing"; current: StreamEvent; next?: StreamEvent }
  | { kind: "between"; next: StreamEvent }
  | { kind: "break"; next?: StreamEvent; lastAired?: StreamEvent };

/** Gap after which "nothing on" stops being a short pause and counts as the marathon being on break. */
const BREAK_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Where the 24/7 marathon is: airing a match, briefly between matches, or on break (the playlist
 * has ended, or the next match is more than a day away). The owner's status note can force a break.
 */
export function streamPhase(events: StreamEvent[], status?: StreamStatus | null, now = Date.now()): StreamPhase {
  const current = currentStreamEvent(events, now);
  const upcoming = upcomingStreamMatches(events, now);
  const next = upcoming[0];
  const lastAired = events
    .filter((e) => e.type !== "special" && ts(e.utcIso) <= now)
    .sort((a, b) => ts(b.utcIso) - ts(a.utcIso))[0];
  if (status?.onBreak === true) return { kind: "break", next, lastAired };
  if (current) return { kind: "airing", current, next };
  if (next && (status?.onBreak === false || ts(next.utcIso) - now <= BREAK_AFTER_MS)) return { kind: "between", next };
  return { kind: "break", next, lastAired };
}

/** "Worlds 2024" from event "Worlds" + season "S14 (2024)". */
export function streamEventTitle(e: StreamEvent): string {
  const year = /\b(20\d\d|19\d\d)\b/.exec(e.season || "")?.[1];
  return year ? `${eventName(e.event)} ${year}` : `${eventName(e.event)} ${e.season || ""}`.trim();
}

/** The match airing on the 24/7 stream right now, or null if it is off air. */
export function currentStreamEvent(events: StreamEvent[], now = Date.now()): StreamEvent | null {
  let last: StreamEvent | null = null;
  let lastT = -Infinity;
  let lastMatch: StreamEvent | null = null;
  let lastMatchT = -Infinity;

  for (const e of events) {
    const t = ts(e.utcIso);
    if (isNaN(t) || t > now) continue;
    if (t >= lastT) {
      last = e;
      lastT = t;
    }
    if (e.type !== "special" && t >= lastMatchT) {
      lastMatch = e;
      lastMatchT = t;
    }
  }

  if (!last) return null;
  // The playlist ended (an "End" marker is the most recent entry)
  if (last.type === "special" && /^\s*end/i.test(last.name || "")) return null;
  if (now - lastT > MAX_AIRING_GAP_MS) return null;
  // Start / pre-show markers: show the last real match if it is recent, otherwise the marker itself
  if (last.type === "special" && lastMatch && now - lastMatchT <= MAX_AIRING_GAP_MS) return lastMatch;
  return last;
}

/** Upcoming real matches on the 24/7 stream (skips Start/End/Preshow markers), soonest first. */
export function upcomingStreamMatches(events: StreamEvent[], now = Date.now()): StreamEvent[] {
  return events
    .filter((e) => e.type !== "special" && ts(e.utcIso) > now)
    .sort((a, b) => ts(a.utcIso) - ts(b.utcIso));
}

/**
 * The next few matches that haven't started yet.
 * Matches involving teams you follow come first, then the soonest remaining ones.
 */
export function nextUpcomingMatches(
  schedule: Match[],
  followedTeams: string[],
  limit = 3,
  now = Date.now(),
): Match[] {
  // Allow matches a little past their start time (delayed kickoffs) that haven't gone live yet
  const cutoff = now - 30 * 60 * 1000;
  const future = schedule
    .filter((m) => m.state === "unstarted" && ts(m.startTimeUtc) >= cutoff)
    .sort((a, b) => ts(a.startTimeUtc) - ts(b.startTimeUtc));

  const followed = new Set(followedTeams.map((c) => c.toUpperCase()));
  const isFollowed = (m: Match) =>
    followed.has(m.team1Code.toUpperCase()) || followed.has(m.team2Code.toUpperCase());

  const mine = future.filter(isFollowed).slice(0, limit);
  if (mine.length >= limit) return mine;
  const mineIds = new Set(mine.map((m) => m.matchId));
  const rest = future.filter((m) => !mineIds.has(m.matchId)).slice(0, limit - mine.length);
  return [...mine, ...rest].sort((a, b) => ts(a.startTimeUtc) - ts(b.startTimeUtc));
}

export interface BroadcastStream {
  name: string;
  url: string;
  icon: "twitch" | "youtube" | "riot" | "soop" | "bilibili" | "generic";
  badge?: string;
}

/**
 * Returns the official broadcast destinations for a given league slug,
 * including Riot's direct live stream URL if available.
 */
export function getLeagueBroadcastStreams(
  leagueSlug?: string,
  riotStreamUrl?: string
): BroadcastStream[] {
  const streams: BroadcastStream[] = [];

  // If Riot's live API provided a direct active stream link, prioritize it
  if (riotStreamUrl && riotStreamUrl.trim()) {
    streams.push({
      name: tl("Watch Live"),
      url: riotStreamUrl.trim(),
      icon: "riot",
      badge: "LIVE FEED",
    });
  }

  const slug = (leagueSlug || "").toLowerCase();
  if (slug.includes("lck")) {
    streams.push(
      { name: "LCK Twitch", url: "https://www.twitch.tv/lck", icon: "twitch" },
      { name: "LCK YouTube", url: "https://www.youtube.com/@LCKglobal/live", icon: "youtube" },
      { name: "LoLEsports", url: "https://lolesports.com", icon: "riot" }
    );
  } else if (slug.includes("lpl")) {
    streams.push(
      { name: "LPL Twitch", url: "https://www.twitch.tv/lpl", icon: "twitch" },
      { name: "LPL YouTube", url: "https://www.youtube.com/@LPL/live", icon: "youtube" },
      { name: "LoLEsports", url: "https://lolesports.com", icon: "riot" }
    );
  } else if (slug.includes("lec")) {
    streams.push(
      { name: "LEC Twitch", url: "https://www.twitch.tv/lec", icon: "twitch" },
      { name: "LEC YouTube", url: "https://www.youtube.com/@LEC/live", icon: "youtube" },
      { name: "LoLEsports", url: "https://lolesports.com", icon: "riot" }
    );
  } else if (slug.includes("lcs")) {
    streams.push(
      { name: "LCS Twitch", url: "https://www.twitch.tv/lcs", icon: "twitch" },
      { name: "LCS YouTube", url: "https://www.youtube.com/@LCS/live", icon: "youtube" },
      { name: "LoLEsports", url: "https://lolesports.com", icon: "riot" }
    );
  } else if (slug.includes("lcp") || slug.includes("pacific") || slug.includes("pcs")) {
    streams.push(
      { name: "LCP Twitch", url: "https://www.twitch.tv/lolesportspacific", icon: "twitch" },
      { name: "LCP YouTube", url: "https://www.youtube.com/@lolesportspacific/live", icon: "youtube" },
      { name: "LoLEsports", url: "https://lolesports.com", icon: "riot" }
    );
  } else if (slug.includes("cblol") || slug.includes("brazil")) {
    streams.push(
      { name: "CBLOL Twitch", url: "https://www.twitch.tv/cblol", icon: "twitch" },
      { name: "CBLOL YouTube", url: "https://www.youtube.com/@CBLOLoficial/live", icon: "youtube" },
      { name: "LoLEsports", url: "https://lolesports.com", icon: "riot" }
    );
  } else if (slug.includes("emea") || slug.includes("masters")) {
    streams.push(
      { name: "EMEA Twitch", url: "https://www.twitch.tv/emeamasters", icon: "twitch" },
      { name: "OTP LoL (FR)", url: "https://www.twitch.tv/otplol_", icon: "twitch" },
      { name: "Prime League (DE)", url: "https://www.twitch.tv/primeleague", icon: "twitch" },
      { name: "LoLEsports", url: "https://lolesports.com", icon: "riot" }
    );
  } else {
    // International tournaments (Worlds, MSI, First Stand) & general default
    streams.push(
      { name: "Riot Twitch", url: "https://www.twitch.tv/riotgames", icon: "twitch" },
      { name: "LoL YouTube", url: "https://www.youtube.com/@lolesports/live", icon: "youtube" },
      { name: "LoLEsports", url: "https://lolesports.com", icon: "riot" }
    );
  }

  return streams;
}

/**
 * Formats the header 24/7 Twitch stream title pill showing what stage, year, and match.
 * If stream is offline or outside airing window, returns offline status.
 */
export function formatStreamHeaderTitle(e: StreamEvent | null): { title: string; isLive: boolean } {
  if (!e) {
    return { title: tl("Twitch 24/7: Offline"), isLive: false };
  }

  // Extract 4-digit year from season (e.g. "S13 (2023)" -> "2023", "2024" -> "2024")
  let year = "";
  if (e.season) {
    const m = e.season.match(/\b(20\d\d)\b/);
    year = m ? m[1] : e.season;
  }

  const stage = e.stage ? stageName(e.stage) : e.event ? eventName(e.event) : "";
  const match = e.team1 && e.team2 ? `${e.team1} vs ${e.team2}` : e.name || "";

  // Combine: "Twitch 24/7: [Year] [Stage] · [Match]" (e.g. "Twitch 24/7: 2023 Finals · WBG vs T1")
  const details: string[] = [];
  if (year && stage) {
    details.push(`${year} ${stage}`);
  } else if (year || stage) {
    details.push(year || stage);
  }

  if (match) {
    details.push(match);
  }

  if (details.length > 0) {
    return { title: tl("Twitch 24/7: {details}", { details: details.join(" · ") }), isLive: true };
  }

  return { title: tl("Twitch 24/7: Airing Now"), isLive: true };
}

// Riot lists some players on two teams (a main roster and its academy): a player's team is the one in the biggest league
const LEAGUE_RANK = ["LCK", "LPL", "LEC", "LCS", "LTA NORTH", "LTA SOUTH", "LCP", "CBLOL", "PCS", "VCS", "LJL", "LLA"];

function leagueRank(league?: string) {
  const i = LEAGUE_RANK.indexOf((league || "").toUpperCase());
  return i < 0 ? LEAGUE_RANK.length : i;
}

/** One catalog entry per player name (case-insensitive): the one on the team in the biggest league. */
export function mainPlayerEntries(players: PlayerEntry[], teams: CatalogTeam[] = []): PlayerEntry[] {
  const leagueOf = new Map(teams.map((t) => [t.slug, t.league]));
  const rank = (p: PlayerEntry) => leagueRank(p.teamSlug ? leagueOf.get(p.teamSlug) : undefined);
  const best = new Map<string, PlayerEntry>();
  for (const p of players) {
    const k = p.name.toLowerCase();
    const cur = best.get(k);
    if (!cur || rank(p) < rank(cur)) best.set(k, p);
  }
  return [...best.values()];
}

/** Team codes of the players you follow (each player's main team). */
export function followedPlayerTeams(
  followedPlayers: string[],
  catalog?: { players?: PlayerEntry[]; teams?: CatalogTeam[] } | null,
): string[] {
  if (!followedPlayers.length || !catalog?.players?.length) return [];
  const names = new Set(followedPlayers.map((n) => n.toLowerCase()));
  const mine = catalog.players.filter((p) => names.has(p.name.toLowerCase()));
  return [...new Set(mainPlayerEntries(mine, catalog.teams).map((p) => p.teamCode.toUpperCase()))];
}

/**
 * Determines whether a match matches the user's watchlist:
 * 1. Followed team (team1Code or team2Code in settings.followedTeams)
 * 2. Followed league (leagueSlug or lowercase leagueName in settings.followedLeagues)
 * 3. Followed region (if user follows the region associated with this league)
 * 4. A followed player's team (playerTeams: from followedPlayerTeams)
 */
export function isMatchFollowed(
  m: Match,
  settings: AppSettings,
  leaguesCatalog?: League[],
  playerTeams: string[] = [],
): boolean {
  if (
    settings.followedTeams.includes(m.team1Code) ||
    settings.followedTeams.includes(m.team2Code) ||
    playerTeams.includes((m.team1Code || "").toUpperCase()) ||
    playerTeams.includes((m.team2Code || "").toUpperCase())
  ) {
    return true;
  }

  const slug = (m.leagueSlug || "").toLowerCase();
  const name = (m.leagueName || "").toLowerCase();

  if (
    settings.followedLeagues.some(
      (l) => l.toLowerCase() === slug || l.toLowerCase() === name
    )
  ) {
    return true;
  }

  // Region check against catalog
  if (settings.followedRegions && settings.followedRegions.length > 0 && leaguesCatalog) {
    const l = leaguesCatalog.find(
      (item) => item.slug.toLowerCase() === slug || item.name.toLowerCase() === name
    );
    if (l?.region && regionIsFollowed(l.region, settings.followedRegions)) {
      return true;
    }
  }

  return false;
}

/**
 * Riot labels some leagues with regions the Regions tab doesn't list (the LTA leagues are
 * "AMERICAS", LLA sub-leagues are "LATIN AMERICA NORTH/SOUTH", the CIS league is its own
 * region). Map those onto the region cards so following a region covers them.
 */
const REGION_ALIASES: Record<string, string[]> = {
  AMERICAS: ["NORTH AMERICA", "BRAZIL", "LATIN AMERICA"],
  "LATIN AMERICA NORTH": ["LATIN AMERICA"],
  "LATIN AMERICA SOUTH": ["LATIN AMERICA"],
  "COMMONWEALTH OF INDEPENDENT STATES": ["EMEA"],
};

export function regionIsFollowed(leagueRegion: string, followedRegions: string[]): boolean {
  const r = leagueRegion.toUpperCase();
  const candidates = [r, ...(REGION_ALIASES[r] || [])];
  return candidates.some((c) => followedRegions.includes(c));
}

/**
 * Riot reuses team codes across tiers (27 in the bundled catalog: KT is both "kt Rolster" in the
 * LCK and "kt Challengers"). Pick the main-league team for a code, not whichever is listed first.
 */
export function pickTeamByCode<T extends { code: string; league?: string }>(teams: T[], code: string): T | undefined {
  const c = normalizeTeamCode(code);
  const matches = teams.filter((t) => normalizeTeamCode(t.code) === c);
  const lower = /challengers|academy|youth|queue|legends|all-?stars|promotion|regional/i;
  return matches.find((t) => t.league && !lower.test(t.league)) ?? matches[0];
}

/** A match this many minutes past its start time with no start from Riot counts as delayed. */
export const DELAY_GRACE_MIN = 10;
/** How far past its start time an unstarted match stays on the Live tab while its broadcast is on air. */
export const DELAY_MAX_HOURS = 8;

/** Minutes a match is running late (0 if it isn't unstarted, or isn't past its start time yet). */
export function minutesLate(m: Match, now = Date.now()): number {
  if (m.state !== "unstarted") return 0;
  const t = new Date(m.startTimeUtc).getTime();
  if (isNaN(t) || t >= now) return 0;
  return Math.floor((now - t) / 60_000);
}

/** "1h 52m", "25m" */
export function formatLate(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? tl("{h}h {m}m", { h, m }) : tl("{m}m", { m });
}

/**
 * Keep an unstarted match on the Live tab: upcoming ones, ones that start within the last 15
 * minutes, and ones that are running late while their league's broadcast is on air (Riot leaves
 * a delayed match "unstarted" until the first game actually begins).
 */
export function isUpcomingOrDelayed(m: Match, liveLeagueSlugs: Set<string>, now = Date.now()): boolean {
  if (m.state === "completed") return false;
  const t = new Date(m.startTimeUtc).getTime();
  if (isNaN(t)) return false;
  if (t >= now - 15 * 60_000) return true;
  return (
    m.state === "unstarted" &&
    liveLeagueSlugs.has((m.leagueSlug || "").toLowerCase()) &&
    t >= now - DELAY_MAX_HOURS * 3_600_000
  );
}

/**
 * Helper to determine if a match has reached completion,
 * either by state === "completed" or by one team reaching the wins threshold (e.g. 3 in Bo5, 2 in Bo3).
 */
export function isMatchCompleted(m: Match): boolean {
  if (m.state === "completed") return true;
  const bestOf = m.bestOf || 1;
  const winsNeeded = Math.ceil(bestOf / 2);
  const t1Score = m.team1Score ?? 0;
  const t2Score = m.team2Score ?? 0;
  return t1Score >= winsNeeded || t2Score >= winsNeeded;
}

/**
 * Reconciles Riot's live matches (/getLive) with scheduled matches (/getSchedule).
 * Ensures legitimate inProgress matches from either source are captured,
 * while preventing completed matches or fake/synthetic placeholders from ever appearing in liveMatches.
 */
export function reconcileLiveAndSchedule(
  liveMatches: Match[],
  scheduleMatches: Match[]
): { finalLive: Match[]; finalSchedule: Match[] } {
  const finalLive: Match[] = [];
  const liveById = new Set<string>();

  // Map schedule matches by matchId
  const scheduleById = new Map<string, Match>();
  for (const sm of scheduleMatches) {
    scheduleById.set(sm.matchId, sm);
  }

  // 1. Process matches from getLive
  for (const lm of liveMatches) {
    if (lm.team1Code === "LIVE" || lm.team2Code === "AIR") continue;

    // Check if match is finished (by score threshold or marked completed in schedule)
    const sm = scheduleById.get(lm.matchId);
    const isDone = isMatchCompleted(lm) || (sm && isMatchCompleted(sm));

    if (isDone) {
      // Synchronize completion and latest scores onto schedule match
      if (sm) {
        sm.state = "completed";
        sm.team1Score = Math.max(sm.team1Score ?? 0, lm.team1Score ?? 0);
        sm.team2Score = Math.max(sm.team2Score ?? 0, lm.team2Score ?? 0);
        if (!sm.winner) {
          sm.winner = sm.team1Score > sm.team2Score ? sm.team1Code : sm.team2Code;
        }
      }
      continue; // NEVER add completed matches to finalLive
    }

    // The schedule is polled less often: show the match as live there too, with the latest score
    if (sm && lm.state === "inProgress") {
      sm.state = "inProgress";
      sm.team1Score = lm.team1Score;
      sm.team2Score = lm.team2Score;
      if (lm.games?.length) sm.games = lm.games;
    }

    if (!liveById.has(lm.matchId)) {
      liveById.add(lm.matchId);
      finalLive.push(lm);
    }
  }

  // 2. Process schedule matches
  const updatedSchedule = scheduleMatches.map((sm) => {
    // If schedule match reached winning threshold, ensure marked completed
    if (isMatchCompleted(sm)) {
      sm.state = "completed";
      if (!sm.winner) {
        sm.winner = (sm.team1Score ?? 0) > (sm.team2Score ?? 0) ? sm.team1Code : sm.team2Code;
      }
    } else if (sm.state === "inProgress" && !liveById.has(sm.matchId)) {
      liveById.add(sm.matchId);
      finalLive.push(sm);
    }
    return sm;
  });

  return { finalLive, finalSchedule: updatedSchedule };
}

export interface HeadToHeadStats {
  team1Wins: number;
  team2Wins: number;
  /** Of the results taken from the live schedule (newer than the H2H table): game wins at Worlds / MSI / First Stand */
  scheduleBigT1: number;
  scheduleBigT2: number;
  totalGames: number;
  totalMeetings: number;
  totalMatches: number;
  team1GameWins: number;
  team2GameWins: number;
  lastWinner?: string;
  lastDate?: string;
}

/**
 * Worlds, MSI or First Stand (the H2H view's international line), by lolesports league slug or name. Not the Esports
 * World Cup, the Americas Cup or a Worlds qualifier; same test as big_event in scripts/h2h/refresh.py.
 */
export function isBigEvent(leagueSlug?: string, leagueName?: string): boolean {
  if (/^(worlds|msi|first[-_]?stand)$/i.test(leagueSlug || "")) return true;
  const n = leagueName || "";
  return /\bworlds?\b|world championship|\bmsi\b|mid-season invitational|first stand/i.test(n) && !/world cup|qualif/i.test(n);
}

/** User requirement: show the H2H whenever the teams have any recorded history. */
export const H2H_MIN_GAMES = 1;

/**
 * Head-to-head record shown with a match (in games). A finished match shows the record *after* it: its
 * own games count, meetings played later don't. A live match also counts the games already finished,
 * and an upcoming one shows everything played so far. Pass countThisMatch=false when the match's score
 * is hidden (spoiler mode), so the record can't give the result away.
 */
export function computeHeadToHead(
  team1Code: string,
  team2Code: string,
  schedule?: Match[],
  matchId?: string,
  countThisMatch = true
): HeadToHeadStats | null {
  const stats = rawHeadToHead(team1Code, team2Code, schedule, matchId, countThisMatch);
  return stats && stats.totalGames >= H2H_MIN_GAMES ? stats : null;
}

function rawHeadToHead(
  team1Code: string,
  team2Code: string,
  schedule: Match[] | undefined,
  matchId: string | undefined,
  countThisMatch: boolean
): HeadToHeadStats | null {
  const c1 = normalizeTeamCode(team1Code);
  const c2 = normalizeTeamCode(team2Code);
  if (!c1 || !c2 || c1 === c2 || c1 === "TBD" || c2 === "TBD") return null;

  const time = (m: Match) => new Date(m.startTimeUtc).getTime();
  const samePair = (m: Match) => {
    const m1 = normalizeTeamCode(m.team1Code);
    const m2 = normalizeTeamCode(m.team2Code);
    return (m1 === c1 && m2 === c2) || (m1 === c2 && m2 === c1);
  };
  const scores = (m: Match): [number, number] =>
    normalizeTeamCode(m.team1Code) === c1 ? [m.team1Score || 0, m.team2Score || 0] : [m.team2Score || 0, m.team1Score || 0];

  const self = matchId ? schedule?.find((m) => m.matchId === matchId) : undefined;
  const selfTime = self ? time(self) : NaN;
  // A finished match's record stops at that match: later meetings are left out
  const asOf = self?.state === "completed" && !isNaN(selfTime) ? selfTime : Infinity;

  // 1. All-time games from the H2H table (everything before the cutoff)
  let t1AllTimeWins = 0;
  let t2AllTimeWins = 0;
  let hasAllTimeRecord = false;

  const key1 = `${c1}__${c2}`;
  const key2 = `${c2}__${c1}`;

  if (ALL_TIME_H2H[key1]) {
    t1AllTimeWins = ALL_TIME_H2H[key1][0];
    t2AllTimeWins = ALL_TIME_H2H[key1][1];
    hasAllTimeRecord = true;
  } else if (ALL_TIME_H2H[key2]) {
    t1AllTimeWins = ALL_TIME_H2H[key2][1];
    t2AllTimeWins = ALL_TIME_H2H[key2][0];
    hasAllTimeRecord = true;
  }

  const CUTOFF_MS = H2H_CUTOFF_MS;

  // Meetings inside the table that must come back out: ones played after the shown match, and the
  // shown match itself when its result is hidden.
  if (hasAllTimeRecord && schedule) {
    for (const m of schedule) {
      if (m.state !== "completed" || !samePair(m)) continue;
      const t = time(m);
      if (isNaN(t) || t >= CUTOFF_MS) continue;
      const isSelf = m.matchId === matchId;
      if ((!isSelf && t > asOf) || (isSelf && !countThisMatch)) {
        const [s1, s2] = scores(m);
        t1AllTimeWins = Math.max(0, t1AllTimeWins - s1);
        t2AllTimeWins = Math.max(0, t2AllTimeWins - s2);
      }
    }
  }

  // 2. Results newer than the table come from the schedule (all of them for pairs the table lacks)
  let scheduleT1Wins = 0;
  let scheduleT2Wins = 0;
  let scheduleBigT1 = 0;
  let scheduleBigT2 = 0;
  let recentMeetingsCount = 0;
  let lastWinner: string | undefined;
  let lastDate: string | undefined;

  if (schedule && schedule.length > 0) {
    const counted = schedule.filter((m) => {
      if (m.matchId === matchId || m.state !== "completed" || !samePair(m)) return false;
      const t = time(m);
      if (isNaN(t) || t > asOf) return false;
      return !hasAllTimeRecord || t >= CUTOFF_MS;
    });
    // The shown match's own games: finished, or the games already done in a live series
    if (self && countThisMatch && samePair(self)) {
      const inTable = self.state === "completed" && hasAllTimeRecord && selfTime < CUTOFF_MS;
      if ((self.state === "completed" || self.state === "inProgress") && !inTable) counted.push(self);
    }
    for (const m of counted) {
      const [s1, s2] = scores(m);
      scheduleT1Wins += s1;
      scheduleT2Wins += s2;
      if (isBigEvent(m.leagueSlug, m.leagueName)) {
        scheduleBigT1 += s1;
        scheduleBigT2 += s2;
      }
    }

    const finished = counted.filter((m) => m.state === "completed").sort((a, b) => time(b) - time(a));
    recentMeetingsCount = finished.length;
    if (finished.length > 0) {
      const [l1, l2] = scores(finished[0]);
      lastWinner = l1 > l2 ? c1 : c2;
      lastDate = finished[0].startTimeUtc;
    }
  }

  const team1Wins = t1AllTimeWins + scheduleT1Wins;
  const team2Wins = t2AllTimeWins + scheduleT2Wins;
  const totalGames = team1Wins + team2Wins;

  return {
    team1Wins,
    team2Wins,
    scheduleBigT1,
    scheduleBigT2,
    totalGames,
    totalMeetings: recentMeetingsCount,
    totalMatches: recentMeetingsCount,
    team1GameWins: team1Wins,
    team2GameWins: team2Wins,
    lastWinner,
    lastDate,
  };
}

export interface TeamStanding {
  teamCode: string;
  teamName: string;
  teamImage?: string;
  seriesWon: number;
  seriesLost: number;
  seriesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  winRatePct: number;
  streak: string;
}

export function computeLeagueStandings(
  leagueSlug: string,
  schedule: Match[]
): TeamStanding[] {
  const slug = (leagueSlug || "").toLowerCase();
  const completed = schedule.filter(
    (m) => m.state === "completed" && (!slug || m.leagueSlug?.toLowerCase() === slug)
  );

  const statsMap = new Map<
    string,
    {
      code: string;
      name: string;
      image?: string;
      sWon: number;
      sLost: number;
      gWon: number;
      gLost: number;
      results: boolean[];
    }
  >();

  const getOrCreate = (code: string, name: string, image?: string) => {
    const upper = code.toUpperCase();
    if (!statsMap.has(upper)) {
      statsMap.set(upper, {
        code: upper,
        name: name || upper,
        image,
        sWon: 0,
        sLost: 0,
        gWon: 0,
        gLost: 0,
        results: [],
      });
    }
    const item = statsMap.get(upper)!;
    if (!item.image && image) item.image = image;
    return item;
  };

  const sorted = [...completed].sort(
    (a, b) => new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime()
  );

  for (const m of sorted) {
    if (!m.team1Code || !m.team2Code || m.team1Code === "TBD" || m.team2Code === "TBD") continue;
    const t1 = getOrCreate(m.team1Code, m.team1Name, m.team1Image);
    const t2 = getOrCreate(m.team2Code, m.team2Name, m.team2Image);

    t1.gWon += m.team1Score;
    t1.gLost += m.team2Score;
    t2.gWon += m.team2Score;
    t2.gLost += m.team1Score;

    if (m.team1Score > m.team2Score) {
      t1.sWon++;
      t2.sLost++;
      t1.results.push(true);
      t2.results.push(false);
    } else if (m.team2Score > m.team1Score) {
      t2.sWon++;
      t1.sLost++;
      t2.results.push(true);
      t1.results.push(false);
    }
  }

  const standings: TeamStanding[] = Array.from(statsMap.values()).map((s) => {
    const sPlayed = s.sWon + s.sLost;
    const winRate = sPlayed > 0 ? Math.round((s.sWon / sPlayed) * 100) : 0;

    let streak = "-";
    if (s.results.length > 0) {
      const last = s.results[s.results.length - 1];
      let count = 0;
      for (let i = s.results.length - 1; i >= 0; i--) {
        if (s.results[i] === last) count++;
        else break;
      }
      streak = `${count}${last ? tc("short result", "W") : tc("short result", "L")}`;
    }

    return {
      teamCode: s.code,
      teamName: s.name,
      teamImage: s.image,
      seriesWon: s.sWon,
      seriesLost: s.sLost,
      seriesPlayed: sPlayed,
      gamesWon: s.gWon,
      gamesLost: s.gLost,
      gameDiff: s.gWon - s.gLost,
      winRatePct: winRate,
      streak,
    };
  });

  return standings.sort((a, b) => {
    if (b.seriesWon !== a.seriesWon) return b.seriesWon - a.seriesWon;
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
    return b.gamesWon - a.gamesWon;
  });
}

/**
 * Procedurally synthesizes a crisp, elegant LoL-style hextech kickoff chime
 * using the browser Web Audio API (0 KB disk asset overhead).
 */
export function playKickoffChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (Hextech ascending fanfare)
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.4);
    });
  } catch (e) {
    // Audio context unavailable or user blocked autoplay
  }
}


