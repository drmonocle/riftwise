/**
 * Stats hub data: page files and the search lists, from the stats build (rebuilt when the database changes) (stats/<version>/hub/).
 * Every page fetches only its own small file.
 */
import { load } from "../stats";
import { searchAlias } from "../searchAliases";
import type {
  EventListItem,
  HubChamp,
  HubEvent,
  HubHome,
  HubMeta,
  HubPlayer,
  HubSeries,
  HubTeam,
  SearchChampRow,
  SearchEventRow,
  SearchPlayerRow,
  SearchTeamRow,
} from "./types";

const LETTERS: Record<string, string> = {
  Ø: "O", ø: "o", Æ: "AE", æ: "ae", Œ: "OE", œ: "oe", ß: "ss", Ł: "L", ł: "l", Đ: "D", đ: "d", Þ: "Th", þ: "th", ı: "i", Ð: "D", ð: "d",
};

/** 'Worlds 2025 Main Event' -> 'worlds-2025-main-event'. Same rules as pretty() in scripts/stats/hub.py. */
export function prettySlug(text: string): string {
  let s = (text || "").replace(/[ØøÆæŒœßŁłĐđÞþıÐð]/g, (c) => LETTERS[c] || c);
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ");
  s = s.replace(/['’`.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 70).replace(/-+$/g, "");
}

const slugOf = (name: string, slug: string) => slug || prettySlug(name);

export const loadHubMeta = () => load<HubMeta>("hub/meta.json");
export const loadHubHome = () => load<HubHome>("hub/home.json");
export const loadHubTeam = (slug: string) => load<HubTeam>(`hub/team/${slug}.json`);
export const loadHubPlayer = (slug: string) => load<HubPlayer>(`hub/player/${slug}.json`);
export const loadHubEvent = (slug: string) => load<HubEvent>(`hub/event/${slug}.json`);
export const loadHubSeries = (slug: string) => load<HubSeries>(`hub/game/${slug}.json`);
export const loadHubChamp = (slug: string) => load<HubChamp>(`hub/champ/${slug}.json`);
export const loadEventsOfYear = (year: string) => load<EventListItem[]>(`hub/events/${year}.json`);
export const loadAliases = () => load<{ team: Record<string, string> }>("hub/alias.json").catch(() => ({ team: {} }));

// ── Search ────────────────────────────────────────────────────────────────

export type HubSearchKind = "team" | "player" | "event" | "champ";

export interface HubHit {
  kind: HubSearchKind;
  name: string;
  slug: string;
  /** short line under the name: team, year, league... */
  sub: string;
  games: number;
  /** filled in when an old name or a real name is what matched */
  matched?: string;
  role?: string;
  year?: string;
}

export interface HubIndex {
  teams: SearchTeamRow[];
  players: SearchPlayerRow[];
  events: SearchEventRow[];
  champs: SearchChampRow[];
}

let indexPromise: Promise<HubIndex> | null = null;

/** The four search lists (about 600 KB compressed in all), loaded once when someone first searches. */
export function loadHubIndex(): Promise<HubIndex> {
  if (!indexPromise) {
    indexPromise = Promise.all([
      load<SearchTeamRow[]>("hub/search/teams.json"),
      load<SearchPlayerRow[]>("hub/search/players.json"),
      load<SearchEventRow[]>("hub/search/events.json"),
      load<SearchChampRow[]>("hub/search/champs.json"),
    ])
      .then(([teams, players, events, champs]) => ({ teams, players, events, champs }))
      .catch((e) => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}

export const normText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const bare = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");

/** Lower is better: 0 exact, 1 starts with, 2 contains, 3 contains ignoring spaces and dots, -1 no match. */
function score(name: string, q: string): number {
  const n = normText(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const i = n.indexOf(q);
  if (i > 0) return /[\s\-.(]/.test(n[i - 1]) ? 1.5 : 2;
  const bq = bare(q);
  if (bq && bare(n).includes(bq)) return bare(n) === bq ? 0.5 : 3;
  return -1;
}

const ROLE: Record<string, string> = { T: "Top", J: "Jungle", M: "Mid", B: "Bot", S: "Support" };

/**
 * One search across teams, players, tournaments and champions. Exact and prefix matches first, then
 * by how much a name has played; old team names, short names (SKT, C9) and real names count too.
 */
export function searchHub(index: HubIndex, query: string, limit = 6): Record<HubSearchKind, HubHit[]> {
  const raw = searchAlias(query.trim());
  const q = normText(raw);
  const out: Record<HubSearchKind, HubHit[]> = { team: [], player: [], event: [], champ: [] };
  if (!q) return out;
  const pick = <T>(rows: T[], rank: (r: T) => [number, string | undefined] | null, weight: (r: T) => number, make: (r: T, m?: string) => HubHit) => {
    const scored: [number, number, T, string | undefined][] = [];
    for (const r of rows) {
      const s = rank(r);
      if (s) scored.push([s[0], weight(r), r, s[1]]);
    }
    scored.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    return scored.slice(0, limit).map((x) => make(x[2], x[3]));
  };

  out.team = pick(
    index.teams,
    (t) => {
      const s = score(t[0], q);
      if (s >= 0) return [s, undefined];
      if (t[5] && normText(t[5]).split(" | ").includes(q)) return [0.2, undefined];
      if (t[4]) {
        const olds = t[4].split(" | ");
        const hit = olds.find((o) => score(o, q) >= 0 && score(o, q) <= 1.5) || olds.find((o) => score(o, q) >= 0);
        if (hit) return [score(hit, q) + 1, hit];
      }
      return null;
    },
    (t) => t[2],
    (t, m) => ({ kind: "team", name: t[0], slug: slugOf(t[0], t[1]), sub: [t[6], t[3]].filter(Boolean).join(" · "), games: t[2], matched: m, year: t[3] }),
  );
  out.player = pick(
    index.players,
    (p) => {
      const s = score(p[0], q);
      if (s >= 0) return [s, undefined];
      if (p[6] && q.length >= 2 && normText(p[6]).includes(q)) return [2.5, p[6]];
      return null;
    },
    (p) => p[3] + (p[4] >= String(new Date().getFullYear() - 1) ? 400 : 0),
    (p, m) => ({ kind: "player", name: p[0], slug: slugOf(p[0], p[1]), sub: p[2], games: p[3], matched: m, role: ROLE[p[5]] || "", year: p[4] }),
  );
  out.event = pick(
    index.events,
    (e) => {
      const s = score(e[0], q);
      if (s >= 0) return [s, undefined];
      // "worlds 2019" / "lck spring 2024": every word somewhere in the name or league
      const words = q.split(/\s+/).filter(Boolean);
      const hay = normText(`${e[0]} ${e[3]}`);
      return words.length > 1 && words.every((w) => hay.includes(w)) ? [2.5, undefined] : null;
    },
    (e) => (e[4] === "P" ? 100000 : 0) + Number(e[2] || 0) * 10 + Math.min(e[6], 9),
    (e) => ({ kind: "event", name: e[0], slug: slugOf(e[0], e[1]), sub: [e[3], e[5]?.slice(0, 4) || e[2]].filter(Boolean).join(" · "), games: e[6], year: e[2] }),
  );
  out.champ = pick(
    index.champs,
    (c) => {
      const s = score(c[0], q);
      return s >= 0 ? [s, undefined] : null;
    },
    (c) => c[2],
    (c) => ({ kind: "champ", name: c[0], slug: slugOf(c[0], c[1]), sub: "", games: c[2] }),
  );
  return out;
}

export const loadHubRecords = () => load<import("./types").HubRecords>("hub/records.json");
export const loadHubTitles = () => load<import("./types").HubTitle[]>("hub/titles.json");

/** The stats page of a team known only by its current name and short code (from Riot's feeds). */
export function findHubTeam(index: HubIndex, name: string, code?: string): string | null {
  const n = normText(name || "");
  const c = (code || "").toLowerCase();
  const byName = index.teams.filter((t) => normText(t[0]) === n);
  const pick = (rows: SearchTeamRow[]) => rows.sort((a, b) => b[3].localeCompare(a[3]) || b[2] - a[2])[0];
  let t = pick(byName);
  if (!t && n) t = pick(index.teams.filter((x) => x[4] && x[4].split(" | ").some((o) => normText(o) === n)));
  if (!t && c) t = pick(index.teams.filter((x) => x[5] && x[5].toLowerCase().split(" | ").includes(c)));
  return t ? slugOf(t[0], t[1]) : null;
}

export const loadTeamSeries = (slug: string) => load<import("./types").TeamSeriesRow[]>(`hub/teamseries/${slug}.json`);
export const loadPlayerGames = (slug: string) => load<import("./types").PlayerGameRow[]>(`hub/playergames/${slug}.json`);
export const loadTeamGames = (slug: string) => load<import("./types").TeamGameRow[]>(`hub/teamgames/${slug}.json`);
export const loadLeagueSeason = (league: string, year: string) => load<import("./types").LeagueSeason>(`hub/leagueyear/${league}/${year}.json`);
export const loadChampIndex = () => load<import("./types").ChampLeagueIndex[]>("hub/champgames/index.json");
export const loadChampGames = (league: string, year: string) => load<import("./types").ChampGamesFile>(`hub/champgames/${league}/${year}.json`);
export const loadPatches = () => load<import("./types").PatchRow[]>("hub/patches.json");
export const loadLeagues = () => load<import("./types").LeagueRow[]>("hub/leagues.json");
export const loadLeague = (slug: string) => load<import("./types").HubLeague>(`hub/league/${slug}.json`);
export const loadRatings = () => load<import("./types").HubRatings>("hub/ratings.json");
