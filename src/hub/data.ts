/**
 * Stats hub data: page files and the search lists, from the stats build (rebuilt when the database changes) (stats/<version>/hub/).
 * Every page fetches only its own small file.
 */
import { load } from "../stats";
import { searchAlias } from "../searchAliases";
import { normalizeTeamCode } from "../helpers";
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
type Aliases = { team: Record<string, string>; league: Record<string, string> };
export const loadAliases = () =>
  load<Partial<Aliases>>("hub/alias.json")
    .then((a): Aliases => ({ team: a.team || {}, league: a.league || {} }))
    .catch((): Aliases => ({ team: {}, league: {} }));

/** A page file; for an old team slug or a league's short name ("lck", "worlds"), the current page's. */
const withAlias =
  <T>(kind: keyof Aliases) =>
  (slug: string): Promise<T> =>
    load<T>(`hub/${kind}/${slug}.json`).catch(async (err) => {
      const to = (await loadAliases())[kind][slug.toLowerCase()];
      if (to && to !== slug) return load<T>(`hub/${kind}/${to}.json`);
      throw err;
    });

export const loadHubTeam = withAlias<HubTeam>("team");
export const loadHubPlayer = (slug: string) => load<HubPlayer>(`hub/player/${slug}.json`);
export const loadHubEvent = (slug: string) => load<HubEvent>(`hub/event/${slug}.json`);
export const loadHubSeries = (slug: string) => load<HubSeries>(`hub/game/${slug}.json`);
export const loadHubChamp = (slug: string) => load<HubChamp>(`hub/champ/${slug}.json`);
export const loadEventsOfYear = (year: string) => load<EventListItem[]>(`hub/events/${year}.json`);

// ── Search ────────────────────────────────────────────────────────────────

export type HubSearchKind = "team" | "player" | "event" | "champ" | "league";

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
  leagues?: import("./types").LeagueRow[];
}

let indexPromise: Promise<HubIndex> | null = null;

/** The search lists (about 600 KB compressed in all), loaded once when someone first searches. */
export function loadHubIndex(): Promise<HubIndex> {
  if (!indexPromise) {
    indexPromise = Promise.all([
      load<SearchTeamRow[]>("hub/search/teams.json"),
      load<SearchPlayerRow[]>("hub/search/players.json"),
      load<SearchEventRow[]>("hub/search/events.json"),
      load<SearchChampRow[]>("hub/search/champs.json"),
      load<import("./types").LeagueRow[]>("hub/leagues.json").catch(() => []),
    ])
      .then(([teams, players, events, champs, leagues]) => ({ teams, players, events, champs, leagues }))
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
 * One search across teams, players, leagues, tournaments and champions. Exact and prefix matches first, then
 * by how much a name has played; old team names, short names (SKT, C9) and real names count too.
 */
export function searchHub(index: HubIndex, query: string, limit = 6): Record<HubSearchKind, HubHit[]> {
  const raw = searchAlias(query.trim());
  const q = normText(raw);
  const out: Record<HubSearchKind, HubHit[]> = { team: [], player: [], event: [], champ: [], league: [] };
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
        // an old name that starts with the query ("DWG" -> DWG KIA, "Samsung" -> Samsung Galaxy) ranks with the
        // current names that do, so the bigger team (Dplus Kia, Gen.G) comes before a small one named that way
        if (hit) return [score(hit, q) <= 1.5 ? 1 : score(hit, q) + 1, hit];
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
  out.league = pick(
    index.leagues || [],
    (l) => {
      const s = Math.min(...[l.s ? score(l.s, q) : -1, score(l.l, q)].map((x) => (x < 0 ? 9 : x)));
      if (s < 9) return [s, undefined];
      // an old name of the league ("NA LCS", "OGN Champions")
      const old = (l.h || []).find((h) => h.u !== l.u && ((h.s && score(h.s, q) >= 0 && score(h.s, q) <= 1) || score(h.l, q) >= 0));
      return old ? [2, old.s || old.l] : null;
    },
    (l) => (l.pr ? 100000 : 0) + l.g,
    (l, m) => ({
      kind: "league",
      name: l.l,
      slug: l.u,
      sub: [l.s && l.s !== l.l ? l.s : "", l.from && l.to ? (l.from === l.to ? l.from : `${l.from}–${l.to}`) : l.from || ""].filter(Boolean).join(" · "),
      games: l.g,
      matched: m,
    }),
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
/** A team name without a "(...)" note or a ".CN"-style region suffix: "LYON (2024 American Team)" -> "lyon". */
const bareTeam = (s: string) =>
  normText(s || "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .replace(/\.(cn|na|eu|kr|cis|vn|br|jp|tw)$/, "")
    .trim();

/**
 * The hub team behind a team on the live schedule (Riot's name and code). Candidates: the same name, the same
 * name without a "(...)" / ".CN" suffix, an old name, the same code (TLAW = TL); a name and code that both fit
 * count most, then the team that played most recently (the active Ninjas in Pyjamas.CN, not the 2018 EU team).
 */
export function findHubTeam(index: HubIndex, name: string, code?: string): string | null {
  const n = normText(name || "");
  const nb = bareTeam(name || "");
  const c = normalizeTeamCode(code || "");
  let best: SearchTeamRow | null = null;
  let bestKey: [number, string, number] | null = null;
  for (const t of index.teams) {
    const exact = normText(t[0]) === n;
    const nameFit =
      exact || (!!nb && bareTeam(t[0]) === nb) || (!!t[4] && t[4].split(" | ").some((o) => normText(o) === n || (!!nb && bareTeam(o) === nb)));
    const codeFit = !!c && !!t[5] && t[5].split(" | ").some((x) => normalizeTeamCode(x) === c);
    if (!nameFit && !codeFit) continue;
    const key: [number, string, number] = [(nameFit ? 2 : 0) + (codeFit ? 1 : 0), t[3] || "", t[2]];
    if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
      best = t;
      bestKey = key;
    }
  }
  return best ? slugOf(best[0], best[1]) : null;
}

export const loadTeamSeries = (slug: string) => load<import("./types").TeamSeriesRow[]>(`hub/teamseries/${slug}.json`);
export const loadPlayerGames = (slug: string) => load<import("./types").PlayerGameRow[]>(`hub/playergames/${slug}.json`);
export const loadTeamGames = (slug: string) => load<import("./types").TeamGameRow[]>(`hub/teamgames/${slug}.json`);
export const loadLeagueSeason = (league: string, year: string) => load<import("./types").LeagueSeason>(`hub/leagueyear/${league}/${year}.json`);
export const loadChampIndex = () => load<import("./types").ChampLeagueIndex[]>("hub/champgames/index.json");
export const loadChampGames = (league: string, year: string) => load<import("./types").ChampGamesFile>(`hub/champgames/${league}/${year}.json`);
export const loadPatches = () => load<import("./types").PatchRow[]>("hub/patches.json");
export const loadLeagues = () => load<import("./types").LeagueRow[]>("hub/leagues.json");
export const loadLeague = withAlias<import("./types").HubLeague>("league");

/** Starts loading a hub page's file before it's opened (pointer on its link); the page then finds it ready. */
export function prefetchHub(r: import("./route").HubRoute): void {
  if (!("slug" in r)) return;
  const go: Record<string, ((s: string) => Promise<unknown>) | undefined> = {
    team: loadHubTeam, player: loadHubPlayer, event: loadHubEvent, match: loadHubSeries, champ: loadHubChamp, league: loadLeague,
  };
  go[r.kind]?.(r.slug).catch(() => {});
}
export const loadBestIndex = () => load<import("./types").BestIndex>("hub/best/index.json");
export const loadRecordsYear = (year: string) => load<import("./types").HubRecordsYear>(`hub/records/${year}.json`);
export const loadMatchups = (slug: string) => load<import("./types").HubMatchups>(`hub/matchups/${slug}.json`);
/** top-league teams' ratings over the last 120 days: slug -> [date, rating][] */
export const loadRatingsHistory = () => load<Record<string, [string, number][]>>("hub/ratings-history.json");
/** a player's last two years of games (smaller than the full log; not every player has one) */
export const loadPlayerGames2y = (slug: string) => load<import("./types").PlayerGameRow[]>(`hub/playergames2y/${slug}.json`);
/** The best-rated games and series: all time, a year, a league, or a league's year. */
export const loadBest = (year?: string, league?: string) =>
  load<import("./types").BestFile>(
    league ? `hub/best/l/${league}${year ? `/${year}` : ""}.json` : year ? `hub/best/${year}.json` : "hub/best/all.json",
  );
export const loadRatings = () => load<import("./types").HubRatings>("hub/ratings.json");
