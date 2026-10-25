import { Match, LiveShow, StreamEvent, StreamStatus, AppSettings, Team, Region, League, PlayerEntry, AppUpdateInfo } from "./types";
import type { H2HData } from "./helpers";
import { tk, tc, currentLang, eventName } from "./i18n";
import { IS_WEB } from "./platform";

// Riot's own translations for league, stage and block names ("8강", "Cuartos de Final"...).
const RIOT_HL: Record<string, string> = {
  en: "en-US", es: "es-MX", "pt-BR": "pt-BR", ko: "ko-KR", vi: "vi-VN", "zh-CN": "zh-CN",
  "zh-TW": "zh-TW", ja: "ja-JP", fr: "fr-FR", de: "de-DE", tr: "tr-TR",
};
const riotHl = (): string => RIOT_HL[currentLang()] || "en-US";
// Riot translates region names too ("한국", "国际赛区"), but follows and region matching use the English
// codes (KOREA, INTERNATIONAL...), which the app translates itself. So regions always come from en-US.

/** Riot's league list: names in the reader's language, regions as English codes. */
async function fetchRiotLeagues(timeout?: number): Promise<any[]> {
  const english = fetchJson(`${RIOT_BASE}/getLeagues?hl=en-US`, { headers: riotHeaders }, timeout);
  if (riotHl() === "en-US") return (await english)?.data?.leagues || [];
  const [en, local] = await Promise.all([english, fetchJson(`${RIOT_BASE}/getLeagues?hl=${riotHl()}`, { headers: riotHeaders }, timeout).catch(() => null)]);
  const names = new Map<string, string>();
  for (const l of local?.data?.leagues || []) if (l?.slug && l?.name) names.set(l.slug, l.name);
  return (en?.data?.leagues || []).map((l: any) => ({ ...l, name: names.get(l.slug) || l.name }));
}

// Public key used by the lolesports.com web client (not a private secret). Riot may rotate it; if the
// app suddenly shows "sync failed" with HTTP 401/403, look up the current key from lolesports.com.
const RIOT_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const RIOT_BASE = "https://esports-api.lolesports.com/persisted/gw";
// Riot shows a few leagues under internal short codes; use the names viewers know.
const LEAGUE_NAME_FIXES: Record<string, string> = { demacia_cup: "Demacia Cup" };
// International events use the app's own wording (롤드컵, 先锋赛...) so they read the same everywhere.
const EVENT_SLUGS: Record<string, string> = { worlds: "Worlds", msi: "MSI", first_stand: "First Stand" };
export function leagueDisplayName(league: { name?: string; slug?: string } | undefined, fallback = "League"): string {
  if (!league) return fallback;
  if (league.slug && EVENT_SLUGS[league.slug]) return eventName(EVENT_SLUGS[league.slug]);
  if (league.slug === "demacia_cup") return tc("league", "Demacia Cup");
  return (league.slug && LEAGUE_NAME_FIXES[league.slug]) || league.name || league.slug || fallback;
}

// Typos in Riot's own team names, fixed so viewers see the real name.
const TEAM_NAME_FIXES: Record<string, string> = { "KaBuM! Eports": "KaBuM! Esports" };
export function teamDisplayName(name: string | undefined, fallback = "TBD"): string {
  const n = (name || "").trim();
  return n ? TEAM_NAME_FIXES[n] || n : fallback;
}

const STREAM_SCHEDULE_URL = "https://lolworlds.com/api.ashx?type=schedule-json";
const STREAM_STATUS_URL = "https://lolworlds.com/riftwise/stream-status.json";

export const MAJOR_REGIONS: Region[] = [
  { code: "INTERNATIONAL", name: "International", leagues: ["Worlds", "MSI", "First Stand"], badge: "🌐" },
  { code: "KOREA", name: "Korea", leagues: ["LCK", "LCK Challengers"], badge: "🇰🇷" },
  { code: "CHINA", name: "China", leagues: ["LPL", "LDL"], badge: "🇨🇳" },
  { code: "EMEA", name: "Europe, Middle East & Africa", leagues: ["LEC", "EMEA Masters"], badge: "🇪🇺" },
  { code: "NORTH AMERICA", name: "North America", leagues: ["LCS", "NACL"], badge: "🇺🇸" },
  { code: "PACIFIC", name: "Asia-Pacific", leagues: ["LCP"], badge: "🌏" },
  { code: "BRAZIL", name: "Brazil", leagues: ["CBLOL", "CBLOL Academy"], badge: "🇧🇷" },
  { code: "JAPAN", name: "Japan", leagues: ["LJL"], badge: "🇯🇵" },
  { code: "VIETNAM", name: "Vietnam", leagues: ["VCS"], badge: "🇻🇳" },
  { code: "HONG KONG, MACAU, TAIWAN", name: "Hong Kong, Macau & Taiwan", leagues: ["PCS"], badge: "🇹🇼" },
  { code: "LATIN AMERICA", name: "Latin America", leagues: ["LLA"], badge: "🌎" },
  { code: "OCEANIA", name: "Oceania", leagues: [tk("Oceanic leagues")], badge: "🇦🇺" },
];

export const DEFAULT_FOLLOWED_REGIONS = MAJOR_REGIONS.map((r) => r.code);

// Older versions used these region codes; map them to the real ones.
const LEGACY_REGION_CODES: Record<string, string> = { EUROPE: "EMEA", APAC: "PACIFIC" };

export const DEFAULT_FOLLOWED_LEAGUES = [
  "worlds",
  "msi",
  "first_stand",
  "lck",
  "lpl",
  "lec",
  "lcs",
  "lcp",
  "cblol-brazil",
];

export const POPULAR_PLAYERS: PlayerEntry[] = [
  { name: "Faker", role: "Mid", teamCode: "T1", teamName: "T1", realName: "Lee Sang-hyeok" },
  { name: "Chovy", role: "Mid", teamCode: "GEN", teamName: "Gen.G Esports", realName: "Jeong Ji-hoon" },
  { name: "Ruler", role: "Bot", teamCode: "GEN", teamName: "Gen.G Esports", realName: "Park Jae-hyuk" },
  { name: "Caps", role: "Mid", teamCode: "G2", teamName: "G2 Esports", realName: "Rasmus Winther" },
  { name: "Bwipo", role: "Top", teamCode: "EST", teamName: "Estral Esports", realName: "Gabriël Rau" },
  { name: "Gumayusi", role: "Bot", teamCode: "HLE", teamName: "Hanwha Life Esports", realName: "Lee Min-hyeong" },
  { name: "Keria", role: "Support", teamCode: "T1", teamName: "T1", realName: "Ryu Min-seok" },
  { name: "Oner", role: "Jungle", teamCode: "T1", teamName: "T1", realName: "Mun Hyeon-jun" },
  { name: "Zeus", role: "Top", teamCode: "HLE", teamName: "Hanwha Life Esports", realName: "Choi Woo-je" },
  { name: "Viper", role: "Bot", teamCode: "BLG", teamName: "Bilibili Gaming", realName: "Park Do-hyeon" },
  { name: "Knight", role: "Mid", teamCode: "BLG", teamName: "Bilibili Gaming", realName: "Zhuo Ding" },
  { name: "Bin", role: "Top", teamCode: "BLG", teamName: "Bilibili Gaming", realName: "Chen Ze-Bin" },
  { name: "JackeyLove", role: "Bot", teamCode: "TES", teamName: "Top Esports", realName: "Yu Wen-Bo" },
  { name: "Scout", role: "Mid", teamCode: "NS", teamName: "Nongshim RedForce", realName: "Lee Ye-chan" },
  { name: "Inspired", role: "Jungle", teamCode: "LYON", teamName: "LYON", realName: "Kacper Słoma" },
  { name: "Humanoid", role: "Mid", teamCode: "VIT", teamName: "Team Vitality", realName: "Marek Brázda" },
  { name: "Mikyx", role: "Support", teamCode: "SK", teamName: "SK Gaming", realName: "Mihael Mehle" },
  { name: "ShowMaker", role: "Mid", teamCode: "DK", teamName: "Dplus KIA", realName: "Heo Su" },
  { name: "Canyon", role: "Jungle", teamCode: "GEN", teamName: "Gen.G Esports", realName: "Kim Geon-bu" },
  { name: "Peyz", role: "Bot", teamCode: "T1", teamName: "T1", realName: "Kim Su-hwan" },
];

export const GLOBAL_LEAGUES: League[] = [
  { slug: "worlds", name: "World Championship", region: "INTERNATIONAL", priority: 0 },
  { slug: "msi", name: "Mid-Season Invitational", region: "INTERNATIONAL", priority: 1 },
  { slug: "first_stand", name: "First Stand", region: "INTERNATIONAL", priority: 2 },
  { slug: "lck", name: "LCK (League of Legends Champions Korea)", region: "KOREA", priority: 3 },
  { slug: "lpl", name: "LPL (League of Legends Pro League)", region: "CHINA", priority: 4 },
  { slug: "lec", name: "LEC (League of Legends EMEA Championship)", region: "EMEA", priority: 5 },
  { slug: "lcs", name: "LCS (League Championship Series)", region: "NORTH AMERICA", priority: 6 },
  { slug: "lcp", name: "LCP (League of Legends Championship Pacific)", region: "PACIFIC", priority: 7 },
  { slug: "cblol-brazil", name: "CBLOL (Campeonato Brasileiro)", region: "BRAZIL", priority: 8 },
  { slug: "demacia_cup", name: "Demacia Cup", region: "CHINA", priority: 9 },
  { slug: "emea_masters", name: "EMEA Masters", region: "EMEA", priority: 10 },
  { slug: "nacl", name: "NACL (North American Challengers)", region: "NORTH AMERICA", priority: 11 },
];

export const DEFAULT_SETTINGS: AppSettings = {
  spoilerMode: false,
  defaultTab: "live",
  notifyKickoff: true,
  notifyPregame: true,
  notifyStream: true,
  soundAlerts: false,
  theme: "scoreboard",
  compactMode: false,
  minimizeToTrayOnClose: true,
  startWithWindows: true,
  language: "auto",
  followedTeams: ["T1", "GEN", "G2", "FLY", "BLG"],
  followedPlayers: ["Faker", "Chovy", "Ruler", "Caps"],
  followedLeagues: [...DEFAULT_FOLLOWED_LEAGUES],
  followedRegions: [...DEFAULT_FOLLOWED_REGIONS],
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("riftwatch_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      // A list that is missing or corrupt gets the default. An EMPTY list is a choice the user
      // made ("Unfollow All") and must stay empty: this function runs after every save, so
      // refilling it here made unfollowing regions impossible.
      for (const key of ["followedTeams", "followedPlayers", "followedLeagues", "followedRegions"] as const) {
        if (!Array.isArray(parsed[key])) parsed[key] = [...DEFAULT_SETTINGS[key]];
      }
      // Only text entries count; team codes are upper case everywhere else in the app.
      for (const key of ["followedTeams", "followedPlayers", "followedLeagues", "followedRegions"] as const) {
        parsed[key] = Array.from(
          new Set((parsed[key] as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "")),
        );
      }
      parsed.followedTeams = Array.from(new Set((parsed.followedTeams as string[]).map((c) => c.toUpperCase())));
      // Region codes saved by older versions (EUROPE, APAC) map to the current ones.
      parsed.followedRegions = Array.from(
        new Set((parsed.followedRegions as string[]).map((c) => LEGACY_REGION_CODES[c] || c)),
      );
      // A value an older version saved (or a hand-edited one) that this version doesn't know falls
      // back to the default instead of breaking the app (an unknown default tab opened a blank page).
      const merged = { ...DEFAULT_SETTINGS, ...parsed } as AppSettings;
      const oneOf = <T,>(v: unknown, allowed: readonly T[], dflt: T): T => (allowed.includes(v as T) ? (v as T) : dflt);
      merged.language = oneOf(merged.language, ["auto", "en", "es", "pt-BR", "ko", "vi", "zh-CN", "zh-TW", "ja", "fr", "de", "tr"] as const, "auto");
      merged.theme = oneOf(merged.theme, ["rift", "classic", "midnight", "scoreboard", "light", "tsm", "flyquest", "t1"] as const, "scoreboard");
      // Scoreboard replaced Rift as the default (0.7.38); a saved Rift that was never picked was just the old default
      if (merged.theme === "rift" && !merged.themePicked) merged.theme = "scoreboard";
      merged.defaultTab = oneOf(merged.defaultTab, ["live", "schedule", "stats", "stream", "watchlist", "news", "settings"] as const, DEFAULT_SETTINGS.defaultTab);
      // Settings for the removed ticker bar / desktop HUD (0.4.0) are dropped
      for (const old of ["tickerMode", "tickerTopmost", "tickerCycleSec"]) delete (merged as unknown as Record<string, unknown>)[old];
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
        if (typeof DEFAULT_SETTINGS[key] === "boolean" && typeof merged[key] !== "boolean") {
          (merged as unknown as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
        }
      }
      return merged;
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem("riftwatch_settings", JSON.stringify(settings));
    window.dispatchEvent(new Event("riftwatch_settings_updated"));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

// -------------------------------------------------------------
// Catalog Persistence & Live Synchronizer (Teams, Players, Leagues)
// -------------------------------------------------------------
import { CatalogData, CatalogTeam } from "./types";

export const EMPTY_CATALOG: CatalogData = { teams: [], players: [], leagues: [], updatedAt: 0 };

/** Catalog saved from a previous live sync (null if none yet). */
export function loadCachedCatalog(): CatalogData | null {
  try {
    const raw = localStorage.getItem("riftwatch_catalog");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Names come back in the reader's language, so a catalog saved in another language is refetched.
      // regions:"en" marks catalogs saved since regions are always English codes (0.3.27).
      if ((parsed.lang || "en") !== currentLang()) return null;
      if (currentLang() !== "en" && parsed.regions !== "en") return null;
      if (parsed.teams?.length > 0 && parsed.players?.length > 0 && parsed.leagues?.length > 0) {
        return parsed as CatalogData;
      }
    }
  } catch (e) {
    console.warn("Failed to read catalog from cache:", e);
  }
  return null;
}

/** The catalog snapshot shipped inside the app. Loaded only when needed to keep startup light. */
export async function loadBundledCatalog(): Promise<CatalogData> {
  const mod = await import("./catalog_default.json");
  return (mod.default ?? mod) as unknown as CatalogData;
}

export function saveCatalog(catalog: CatalogData): void {
  try {
    localStorage.setItem("riftwatch_catalog", JSON.stringify({ ...catalog, lang: currentLang(), regions: "en" }));
    window.dispatchEvent(new CustomEvent("riftwatch_catalog_updated", { detail: catalog }));
  } catch (e) {
    console.error("Failed to save catalog:", e);
  }
}

/**
 * Pulls the latest teams, players and leagues from Riot.
 * Returns null (and changes nothing) if the request fails or the result looks broken.
 */
export async function fetchLiveCatalog(current?: CatalogData): Promise<CatalogData | null> {
  try {
    const [teamsData, rawLeagues] = await Promise.all([
      fetchJson(`${RIOT_BASE}/getTeams?hl=en-US`, { headers: riotHeaders }, 30000),
      fetchRiotLeagues(30000),
    ]);

    const rawTeams = teamsData?.data?.teams || [];
    const cleanTeams: CatalogTeam[] = [];
    const cleanPlayers: PlayerEntry[] = [];
    const seenPlayers = new Set<string>();

    for (const t of rawTeams) {
      if (t.status !== "active" || !t.players || t.players.length === 0 || !t.slug) continue;
      const code = (t.code || t.slug).trim().toUpperCase();
      const name = teamDisplayName(t.name || t.slug, "");
      const homeLeague = t.homeLeague?.name || "";
      const homeRegion = t.homeLeague?.region || "";

      cleanTeams.push({
        slug: t.slug,
        code,
        name,
        image: t.image,
        league: homeLeague,
        region: homeRegion,
      });

      for (const p of t.players) {
        const pName = (p.summonerName || "").trim();
        if (!pName) continue;
        const key = `${pName.toLowerCase()}:${code}`;
        if (seenPlayers.has(key)) continue;
        seenPlayers.add(key);

        const roleStr = (p.role || "").toLowerCase();
        let roleFormatted = "Sub";
        if (roleStr === "top") roleFormatted = "Top";
        else if (roleStr === "jungle") roleFormatted = "Jungle";
        else if (roleStr === "mid") roleFormatted = "Mid";
        else if (roleStr === "bottom") roleFormatted = "Bot";
        else if (roleStr === "support") roleFormatted = "Support";

        let real = "";
        if (p.firstName && p.lastName) {
          real = `${p.firstName} ${p.lastName}`.trim();
        } else if (p.firstName) {
          real = p.firstName.trim();
        }

        cleanPlayers.push({
          name: pName,
          role: roleFormatted,
          teamCode: code,
          teamName: name,
          teamSlug: t.slug,
          realName: real || undefined,
          image: p.image,
        });
      }
    }

    const cleanLeagues: League[] = [];
    for (const l of rawLeagues) {
      if (!l.slug || !l.name) continue;
      cleanLeagues.push({
        slug: l.slug,
        name: l.name,
        region: l.region || "",
        image: l.image,
      });
    }

    // Sanity guard: a response far smaller than what we already have is almost certainly a glitch.
    if (current && current.teams.length > 0 && cleanTeams.length < current.teams.length * 0.5) {
      console.warn(`Live catalog looks incomplete (${cleanTeams.length} vs ${current.teams.length} teams); keeping current.`);
      return null;
    }
    if (cleanTeams.length === 0 || cleanPlayers.length === 0 || cleanLeagues.length === 0) return null;

    const newCatalog: CatalogData = {
      teams: cleanTeams,
      players: cleanPlayers,
      leagues: cleanLeagues,
      updatedAt: Date.now(),
    };

    saveCatalog(newCatalog);
    return newCatalog;
  } catch (err) {
    console.warn("fetchLiveCatalog failed, retaining current cache:", err);
    return null;
  }
}



async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15000): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  // some older team logos come as http://static.lolesports.com (blocked or warned about on an https page)
  return JSON.parse((await res.text()).replace(/http:(\\?\/\\?\/)static\.lolesports\.com/g, "https:$1static.lolesports.com"));
}

const riotHeaders = { "x-api-key": RIOT_API_KEY };

/**
 * Turns Riot's stream entry (provider + channel/video id) into a real web link.
 * Prefers English-language streams, like the original Python app did.
 */
export function buildStreamUrl(streams: any[] | undefined): string {
  if (!streams || streams.length === 0) return "";
  const pick =
    streams.find((s) => String(s?.locale || "").toLowerCase().startsWith("en")) || streams[0];
  const param = String(pick?.parameter || "").trim();
  if (!param) return "";
  if (/^https?:\/\//i.test(param)) return param;
  const p = encodeURIComponent(param);
  switch (String(pick?.provider || "").toLowerCase()) {
    case "twitch":
      return `https://www.twitch.tv/${p}`;
    case "youtube":
      return `https://www.youtube.com/watch?v=${p}`;
    case "afreecatv":
    case "afreeca":
    case "soop":
      return `https://play.sooplive.co.kr/${p}`;
    case "bilibili":
      return `https://live.bilibili.com/${p}`;
    case "huya":
      return `https://www.huya.com/${p}`;
    case "chzzk":
      return `https://chzzk.naver.com/live/${p}`;
    default:
      return "";
  }
}

export async function fetchLiveMatches(): Promise<{
  matches: Match[];
  shows: LiveShow[];
}> {
  const data = await fetchJson(`${RIOT_BASE}/getLive?hl=${riotHl()}`, { headers: riotHeaders });
  const rawEvents = data?.data?.schedule?.events || [];

  const matches: Match[] = [];
  const shows: LiveShow[] = [];

  for (const ev of rawEvents) {
    if (ev.type === "show") {
      if (ev.state === "inProgress" && ev.league?.slug) {
        shows.push({
          leagueSlug: String(ev.league.slug),
          leagueName: leagueDisplayName(ev.league),
          startTimeUtc: ev.startTime || "",
          streamUrl: buildStreamUrl(ev.streams),
        });
      }
      continue;
    }
    if (ev.type !== "match") continue;
    const m = ev.match;
    if (!m) continue;

    const t1 = m.teams?.[0] || {};
    const t2 = m.teams?.[1] || {};

    const c1 = (t1.code || t1.name || "").trim().toUpperCase();
    const c2 = (t2.code || t2.name || "").trim().toUpperCase();
    if (!c1 || !c2 || (c1 === "TBD" && c2 === "TBD")) continue;
    if (c1 === "LIVE" || c2 === "AIR") continue;

    matches.push({
      matchId: m.id || ev.id,
      leagueName: leagueDisplayName(ev.league),
      leagueSlug: ev.league?.slug || "",
      blockName: ev.blockName || "",
      startTimeUtc: ev.startTime || new Date().toISOString(),
      state: m.state || "inProgress",
      bestOf: m.strategy?.count || 3,
      winner: (t1.result?.outcome === "win" ? t1.code : t2.result?.outcome === "win" ? t2.code : undefined),
      streamUrl: buildStreamUrl(ev.streams),
      team1Code: t1.code || t1.name || "TBD",
      team1Name: teamDisplayName(t1.name),
      team1Image: t1.image,
      team1Score: t1.result?.gameWins ?? 0,
      team1Id: t1.id,
      team2Code: t2.code || t2.name || "TBD",
      team2Name: teamDisplayName(t2.name),
      team2Image: t2.image,
      team2Score: t2.result?.gameWins ?? 0,
      team2Id: t2.id,
      games: (m.games || []).map((g: any) => ({
        id: g.id,
        number: g.number,
        state: g.state,
      })),
    });
  }
  return { matches, shows };
}

/**
 * A finished match's games and Riot team ids (the schedule has neither), so its games' final numbers can come
 * from the live stats feed right after it ends, before the stats hub has it.
 */
export async function fetchMatchGames(match: Match): Promise<Match> {
  const data = await fetchJson(`${RIOT_BASE}/getEventDetails?hl=${riotHl()}&id=${encodeURIComponent(match.matchId)}`, { headers: riotHeaders });
  const m = data?.data?.event?.match;
  const team = (code: string) => (m?.teams || []).find((t: any) => t.code === code);
  const id = (code: string) => team(code)?.id;
  // the event's own score: newer than the schedule's copy while a series is on
  const wins = (code: string, fallback: number) => team(code)?.result?.gameWins ?? fallback;
  return {
    ...match,
    team1Id: match.team1Id || id(match.team1Code),
    team2Id: match.team2Id || id(match.team2Code),
    team1Score: wins(match.team1Code, match.team1Score),
    team2Score: wins(match.team2Code, match.team2Score),
    games: (m?.games || []).map((g: any) => ({ id: g.id, number: g.number, state: g.state })),
  };
}

function scheduleEventsToMatches(rawEvents: any[]): Match[] {
  const matches: Match[] = [];
  for (const ev of rawEvents) {
    if (ev.type !== "match") continue;
    const m = ev.match;
    if (!m) continue;

    const t1 = m.teams?.[0] || {};
    const t2 = m.teams?.[1] || {};

    matches.push({
      matchId: m.id || ev.id,
      leagueName: leagueDisplayName(ev.league),
      leagueSlug: ev.league?.slug || "",
      blockName: ev.blockName || "",
      startTimeUtc: ev.startTime || "",
      state: m.state || (ev.state === "completed" ? "completed" : "unstarted"),
      bestOf: m.strategy?.count || 3,
      streamUrl: buildStreamUrl(ev.streams),
      team1Code: t1.code || t1.name || "TBD",
      team1Name: teamDisplayName(t1.name),
      team1Image: t1.image,
      team1Score: t1.result?.gameWins ?? 0,
      team2Code: t2.code || t2.name || "TBD",
      team2Name: teamDisplayName(t2.name),
      team2Image: t2.image,
      team2Score: t2.result?.gameWins ?? 0,
      team1Record: t1.record ? [t1.record.wins ?? 0, t1.record.losses ?? 0] : undefined,
      team2Record: t2.record ? [t2.record.wins ?? 0, t2.record.losses ?? 0] : undefined,
      games: [],
    });
  }
  return matches;
}

/**
 * Riot's schedule endpoint only returns about two days per request.
 * We take the first page, then follow "newer" pages a couple of times so
 * "next match for a team you follow" can see further ahead.
 */
/** The schedule riftwise.gg's push service keeps (one Riot caller instead of every visitor): events as Riot sends them. */
const SCHEDULE_CACHE_URL = IS_WEB ? "/api/push/schedule" : "https://riftwise.gg/api/push/schedule";

export async function fetchSchedule(extraNewerPages = 2): Promise<Match[]> {
  // the server's copy first (fast, and kind to Riot's limits); Riot itself when it isn't there
  try {
    const cached = await fetchJson(SCHEDULE_CACHE_URL, undefined, 8000);
    const events = cached?.events;
    if (Array.isArray(events) && events.length > 0) {
      const ms = scheduleEventsToMatches(events);
      const seen = new Set<string>();
      const unique = ms.filter((m) => (seen.has(m.matchId) ? false : (seen.add(m.matchId), true)));
      unique.sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
      return unique;
    }
  } catch {
    /* Riot directly, below */
  }
  const first = await fetchJson(`${RIOT_BASE}/getSchedule?hl=${riotHl()}`, { headers: riotHeaders });
  const all: Match[] = scheduleEventsToMatches(first?.data?.schedule?.events || []);

  let token: string | undefined = first?.data?.schedule?.pages?.newer;
  for (let i = 0; i < extraNewerPages && token; i++) {
    try {
      const next = await fetchJson(
        `${RIOT_BASE}/getSchedule?hl=${riotHl()}&pageToken=${encodeURIComponent(token)}`,
        { headers: riotHeaders },
      );
      all.push(...scheduleEventsToMatches(next?.data?.schedule?.events || []));
      token = next?.data?.schedule?.pages?.newer;
    } catch {
      break; // later pages are a bonus; keep what we have
    }
  }

  const seen = new Set<string>();
  const unique = all.filter((m) => (seen.has(m.matchId) ? false : (seen.add(m.matchId), true)));
  unique.sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
  return unique;
}

/**
 * All-time H2H table rebuilt every few hours by the h2h-data GitHub Action
 * (scripts/h2h/refresh.py), so records stay current between app releases.
 */
const H2H_DATA_URL = "https://raw.githubusercontent.com/drmonocle/riftwise/h2h-data/h2h.json";
const H2H_CACHE_KEY = "riftwatch_h2h_data";

function isH2HData(d: any): d is H2HData {
  return !!d && typeof d.cutoff === "string" && !!d.pairs && typeof d.pairs === "object" && !Array.isArray(d.pairs);
}

export function loadCachedH2HData(): H2HData | null {
  try {
    const raw = localStorage.getItem(H2H_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isH2HData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchH2HData(): Promise<H2HData> {
  const data = await fetchJson(H2H_DATA_URL, undefined, 20000);
  if (!isH2HData(data)) throw new Error("Malformed H2H data");
  try {
    localStorage.setItem(H2H_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to cache H2H data:", e);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Official standings (Riot's getStandingsV3: the same feed lolesports.com shows)
// ---------------------------------------------------------------------------

export interface TournamentInfo {
  id: string;
  slug: string;
  startDate: string;
  endDate: string;
}

export interface StandingsTeam {
  code: string;
  name: string;
  image?: string;
  wins: number;
  losses: number;
  ties: number;
}

export interface StandingsRow {
  rank: number;
  /** Several teams when they are tied on the same rank. */
  teams: StandingsTeam[];
}

export interface BracketTeam {
  code: string;
  name: string;
  image?: string;
  gameWins: number;
  outcome: "win" | "loss" | null;
}

export interface BracketMatch {
  id: string;
  state: "unstarted" | "inProgress" | "completed";
  teams: BracketTeam[];
}

export interface BracketRound {
  name: string;
  matches: BracketMatch[];
}

export interface StandingsSection {
  name: string;
  type: "group" | "bracket";
  rows: StandingsRow[];
  rounds: BracketRound[];
}

export interface StandingsStage {
  name: string;
  slug: string;
  sections: StandingsSection[];
}

export interface TournamentStandings {
  tournamentId: string;
  name: string;
  stages: StandingsStage[];
  fetchedAt: number;
}

const TOURNAMENTS_TTL_MS = 24 * 60 * 60_000;
const STANDINGS_TTL_MS = 10 * 60_000;

function readCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    return typeof at === "number" && Date.now() - at < ttlMs ? (data as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* storage full or unavailable: the fetch still worked */
  }
}

/** All leagues Riot lists, slug -> id (needed to look up a league's tournaments). Cached a day. */
export async function fetchLeagueIds(): Promise<Record<string, { id: string; name: string; region: string }>> {
  const key = `riftwatch_league_ids_v2_${riotHl()}`; // names come in the reader's language
  const cached = readCache<Record<string, { id: string; name: string; region: string }>>(key, TOURNAMENTS_TTL_MS);
  if (cached) return cached;
  const leagues = await fetchRiotLeagues();
  const out: Record<string, { id: string; name: string; region: string }> = {};
  for (const l of leagues) {
    if (l?.slug && l?.id) out[String(l.slug).toLowerCase()] = { id: String(l.id), name: l.name || l.slug, region: l.region || "" };
  }
  writeCache(key, out);
  return out;
}

/** A league's tournaments (splits, playoffs, cups), newest first. Cached a day. */
export async function fetchLeagueTournaments(leagueId: string): Promise<TournamentInfo[]> {
  const key = `riftwatch_tournaments_${leagueId}_${riotHl()}`;
  const cached = readCache<TournamentInfo[]>(key, TOURNAMENTS_TTL_MS);
  if (cached) return cached;
  const data = await fetchJson(`${RIOT_BASE}/getTournamentsForLeague?hl=${riotHl()}&leagueId=${encodeURIComponent(leagueId)}`, {
    headers: riotHeaders,
  });
  const raw: any[] = data?.data?.leagues?.[0]?.tournaments || [];
  const list: TournamentInfo[] = raw
    .filter((t) => t?.id && t?.startDate && t?.endDate)
    .map((t) => ({ id: String(t.id), slug: t.slug || "", startDate: t.startDate, endDate: t.endDate }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  writeCache(key, list);
  return list;
}

/** The tournament to show by default: the one running today, else the most recent, else the next. */
export function pickCurrentTournament(tournaments: TournamentInfo[], today = new Date().toISOString().slice(0, 10)): TournamentInfo | undefined {
  const running = tournaments.find((t) => t.startDate <= today && today <= t.endDate);
  if (running) return running;
  const finished = tournaments.find((t) => t.endDate < today); // list is newest first
  return finished || tournaments[tournaments.length - 1];
}

/** A tournament's official standings: group tables and brackets per stage. Cached 10 minutes. */
export async function fetchTournamentStandings(tournamentId: string): Promise<TournamentStandings> {
  const key = `riftwatch_standings_${tournamentId}_${riotHl()}`;
  const cached = readCache<TournamentStandings>(key, STANDINGS_TTL_MS);
  if (cached) return cached;
  const data = await fetchJson(`${RIOT_BASE}/getStandingsV3?hl=${riotHl()}&tournamentId=${encodeURIComponent(tournamentId)}`, {
    headers: riotHeaders,
  });
  const s = data?.data?.standings?.[0];
  const stages: StandingsStage[] = (s?.stages || []).map((st: any) => ({
    name: st.name || st.slug || "Stage",
    slug: st.slug || "",
    sections: (st.sections || []).map((sec: any): StandingsSection => {
      const rows: StandingsRow[] = (sec.rankings || []).map((r: any) => ({
        rank: Number(r.ordinal) || 0,
        teams: (r.teams || []).map(
          (t: any): StandingsTeam => ({
            code: t.code || t.name || "TBD",
            name: t.name || t.code || "TBD",
            image: t.image,
            wins: t.record?.wins ?? 0,
            losses: t.record?.losses ?? 0,
            ties: t.record?.ties ?? 0,
          }),
        ),
      }));
      const rounds: BracketRound[] = [];
      for (const col of sec.columns || []) {
        for (const cell of col.cells || []) {
          rounds.push({
            name: cell.name || "",
            matches: (cell.matches || []).map(
              (m: any): BracketMatch => ({
                id: String(m.id || ""),
                state: m.state === "completed" || m.state === "inProgress" ? m.state : "unstarted",
                teams: (m.teams || []).map(
                  (t: any): BracketTeam => ({
                    code: t.code || "TBD",
                    name: t.name || "TBD",
                    image: t.image,
                    gameWins: t.result?.gameWins ?? 0,
                    outcome: t.result?.outcome === "win" ? "win" : t.result?.outcome === "loss" ? "loss" : null,
                  }),
                ),
              }),
            ),
          });
        }
      }
      return { name: sec.name || "", type: rows.length > 0 ? "group" : "bracket", rows, rounds };
    }),
  }));
  const out: TournamentStandings = { tournamentId, name: s?.name || "", stages, fetchedAt: Date.now() };
  writeCache(key, out);
  return out;
}

/** Series history for the H2H details view, published next to h2h.json in 26 shards by first letter. */
export interface H2HSeriesEntry {
  /** Game wins at Worlds / MSI / First Stand, from the alphabetically-first team's side. */
  intl: [number, number];
  /** Newest first: [date, tournament, aScore, bScore]. */
  recent: [string, string, number, number][];
}

const H2H_SERIES_URL = "https://raw.githubusercontent.com/drmonocle/riftwise/h2h-data/series/";
const seriesShards = new Map<string, Promise<Record<string, H2HSeriesEntry>>>();

export function fetchH2HSeries(pairKey: string): Promise<H2HSeriesEntry | null> {
  const c = pairKey.charAt(0).toUpperCase();
  const shard = c >= "A" && c <= "Z" ? c : "0";
  let p = seriesShards.get(shard);
  if (!p) {
    p = fetchJson(`${H2H_SERIES_URL}${shard}.json`, undefined, 20000);
    p.catch(() => seriesShards.delete(shard)); // let a later tap retry
    seriesShards.set(shard, p);
  }
  return p.then((data) => data[pairKey] ?? null);
}

const STREAM_CACHE_KEY = "riftwatch_stream_schedule";

/** Last 24/7 schedule fetched, so a lolworlds.com outage doesn't blank the Stream tab. */
export function loadCachedStreamSchedule(): StreamEvent[] {
  try {
    const raw = localStorage.getItem(STREAM_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as StreamEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveStreamSchedule(events: StreamEvent[]): void {
  try {
    localStorage.setItem(STREAM_CACHE_KEY, JSON.stringify(events));
  } catch (e) {
    console.warn("Failed to cache stream schedule:", e);
  }
}

/** The stream owner's optional break / return note. A missing file just means "no note". */
export async function fetchStreamStatus(): Promise<StreamStatus> {
  const res = await fetch(STREAM_STATUS_URL, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${STREAM_STATUS_URL}`);
  const j = await res.json();
  return {
    onBreak: typeof j?.onBreak === "boolean" ? j.onBreak : undefined,
    headline: typeof j?.headline === "string" ? j.headline : undefined,
    message: typeof j?.message === "string" ? j.message : undefined,
  };
}

export async function fetchStreamSchedule(): Promise<StreamEvent[]> {
  const data: any[] = await fetchJson(STREAM_SCHEDULE_URL, undefined, 20000);
  return data.map((item) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    event: item.event,
    season: item.season,
    stage: item.stage,
    team1: item.team1,
    team2: item.team2,
    rawTime: item.rawTime,
    utcIso: item.utcIso,
    isBanger: item.isBanger === true || (typeof item.tag === "string" && item.tag.toLowerCase().trim() === "banger"),
  }));
}

/**
 * Compare two semver-like strings (e.g., "0.3.5" vs "0.3.6").
 * Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if equal.
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = v1.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const p2 = v2.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const maxLen = Math.max(p1.length, p2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Query GitHub Releases API for the latest published RiftWise release.
 * Returns metadata and direct download URL for the standalone .exe asset.
 */
export async function checkForAppUpdate(currentVersion: string): Promise<AppUpdateInfo | null> {
  try {
    const res = await fetch("https://api.github.com/repos/drmonocle/riftwise/releases/latest", {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const latestTag = (data.tag_name || "").trim();
    const cleanLatest = latestTag.replace(/^v/i, "");
    const cleanCurrent = currentVersion.replace(/^v/i, "");

    const hasUpdate = compareSemver(cleanLatest, cleanCurrent) > 0;
    const exeAsset = (data.assets || []).find((a: any) =>
      a.name?.toLowerCase().endsWith(".exe")
    );
    const downloadUrl =
      exeAsset?.browser_download_url ||
      `https://github.com/drmonocle/riftwise/releases/download/${latestTag}/RiftWise.exe`;

    const sumAsset = (data.assets || []).find((a: any) =>
      a.name?.toLowerCase() === `${String(exeAsset?.name || "RiftWise.exe").toLowerCase()}.sha256`
    );
    const checksumUrl = sumAsset?.browser_download_url || `${downloadUrl}.sha256`;

    return {
      hasUpdate,
      currentVersion: cleanCurrent,
      latestVersion: cleanLatest,
      releaseName: data.name || latestTag,
      releaseNotes: data.body || "",
      releaseUrl: data.html_url || "https://github.com/drmonocle/riftwise/releases",
      downloadUrl,
      checksumUrl,
      publishedAt: data.published_at || "",
    };
  } catch (err) {
    console.warn("Failed to check GitHub releases for updates:", err);
    return null;
  }
}
