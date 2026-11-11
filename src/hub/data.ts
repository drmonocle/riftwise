/**
 * Stats hub data: page files and the search lists, from the stats build (rebuilt when the database changes) (stats/<version>/hub/).
 * Every page fetches only its own small file.
 */
import { load, loadText, MissingFile, statsFileUrl } from "../stats";
import { IS_WEB, SITE_URL } from "../platform";
import { searchAlias } from "../searchAliases";
import { normalizeTeamCode } from "../helpers";
import { champName } from "../champions";
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
type Aliases = { team: Record<string, string>; league: Record<string, string>; game: Record<string, string> };
export const loadAliases = () =>
  load<Partial<Aliases>>("hub/alias.json")
    .then((a): Aliases => ({ team: a.team || {}, league: a.league || {}, game: a.game || {} }))
    .catch((): Aliases => ({ team: {}, league: {}, game: {} }));

const LEAGUE_SLUG_ALIASES: Record<string, string> = {
  worlds: "world-championship",
  wc: "world-championship",
  msi: "mid-season-invitational",
  fst: "first-stand",
  lck: "lol-champions-korea",
  ogn: "lol-champions-korea",
  kr: "lol-champions-korea",
  korea: "lol-champions-korea",
  lpl: "tencent-lol-pro-league",
  cn: "tencent-lol-pro-league",
  china: "tencent-lol-pro-league",
  lec: "lol-emea-championship",
  "eu-lcs": "lol-emea-championship",
  eulcs: "lol-emea-championship",
  eu: "lol-emea-championship",
  europe: "lol-emea-championship",
  emea: "lol-emea-championship",
  lcs: "league-of-legends-championship-series",
  "na-lcs": "league-of-legends-championship-series",
  nalcs: "league-of-legends-championship-series",
  na: "league-of-legends-championship-series",
  pcs: "pacific-championship-series",
  vcs: "vietnam-championship-series",
  cblol: "circuit-brazilian-league-of-legends",
  ljl: "lol-japan-league",
  lla: "liga-latinoamerica",
  lco: "lol-circuit-oceania",
  tcl: "turkish-championship-league",
  lcl: "lol-continental-league",
  lckc: "lck-challengers-league",
  lckcl: "lck-challengers-league",
  ldl: "lol-development-league",
};
export const resolveLeagueSlug = (slug: string): string => LEAGUE_SLUG_ALIASES[slug.toLowerCase()] || slug;

const TEAM_SLUG_ALIASES: Record<string, string> = {
  skt: "t1",
  sktt1: "t1",
  "sk-telecom-t1": "t1",
  dwg: "dplus-kia",
  damwon: "dplus-kia",
  "damwon-gaming": "dplus-kia",
  "dwg-kia": "dplus-kia",
  dk: "dplus-kia",
  geng: "gen-g",
  ssg: "gen-g",
  ssw: "gen-g",
  ssb: "gen-g",
  samsung: "gen-g",
  "samsung-galaxy": "gen-g",
  "samsung-white": "gen-g",
  "samsung-blue": "gen-g",
  ksv: "gen-g",
  "ksv-esports": "gen-g",
  hle: "hanwha-life-esports",
  rox: "hanwha-life-esports",
  "rox-tigers": "hanwha-life-esports",
  "koo-tigers": "hanwha-life-esports",
  "ge-tigers": "hanwha-life-esports",
  kt: "kt-rolster",
  ktrolster: "kt-rolster",
  kz: "drx",
  kingzone: "drx",
  "kingzone-dragonx": "drx",
  lz: "drx",
  longzhu: "drx",
  "longzhu-gaming": "drx",
  blg: "bilibili-gaming",
  tes: "top-esports",
  topesports: "top-esports",
  jdg: "jd-gaming",
  jdgaming: "jd-gaming",
  wbg: "weibo-gaming",
  weibo: "weibo-gaming",
  sn: "weibo-gaming",
  suning: "weibo-gaming",
  lng: "lng-esports",
  edg: "edward-gaming",
  rng: "royal-never-give-up",
  ig: "invictus-gaming",
  fpx: "funplus-phoenix",
  we: "team-we",
  omg: "oh-my-god",
  g2: "g2-esports",
  fnc: "fnatic",
  koi: "movistar-koi",
  mkoi: "movistar-koi",
  mad: "movistar-koi",
  "mad-lions": "movistar-koi",
  splyce: "movistar-koi",
  kc: "karmine-corp",
  kcorp: "karmine-corp",
  bds: "team-bds",
  vit: "team-vitality",
  vitality: "team-vitality",
  tl: "team-liquid",
  liquid: "team-liquid",
  c9: "cloud9",
  fly: "flyquest",
  "100t": "100-thieves",
  psg: "psg-talon",
  gam: "gam-esports",
  cfo: "ctbc-flying-oyster",
};
/** Resolve a team shorthand or historical org name ("skt" -> "t1", "dwg" -> "dplus-kia", "ssg" -> "gen-g") synchronously. */
export function resolveTeamAlias(slug: string, teamAliases?: Record<string, string>): string {
  const raw = (slug || "").trim().toLowerCase();
  if (!raw) return "";
  const p = prettySlug(raw);
  const b = raw.replace(/[^a-z0-9]+/g, "");
  if (teamAliases) {
    const hit = teamAliases[raw] || teamAliases[p] || teamAliases[b];
    if (hit) return hit;
  }
  return TEAM_SLUG_ALIASES[raw] || TEAM_SLUG_ALIASES[p] || TEAM_SLUG_ALIASES[b] || p || raw;
}

/** A page file; for an old team slug or a league's short name ("lck", "worlds"), the current page's. */
const withAlias =
  <T>(kind: keyof Aliases) =>
  (slug: string): Promise<T> => {
    const first = kind === "league" ? resolveLeagueSlug(slug) : slug;
    return load<T>(`hub/${kind}/${first}.json`).catch(async (err) => {
      if (first !== slug) {
        try {
          return await load<T>(`hub/${kind}/${slug}.json`);
        } catch {
          // fall through to alias.json
        }
      }
      const to = (await loadAliases())[kind][slug.toLowerCase()];
      if (to && to !== first && to !== slug) return load<T>(`hub/${kind}/${to}.json`);
      throw err;
    });
  };

/**
 * The build's slug for a team address it doesn't have: an old team slug (alias.json), the name without its dashes
 * ("gen-g" -> "geng"), or a short name ("hle", "skt"; the team with the most games). null when nothing fits.
 */
const resolvedTeams = new Map<string, Promise<string | null>>();
export function resolveTeamSlug(slug: string): Promise<string | null> {
  const s = slug.toLowerCase();
  let p = resolvedTeams.get(s);
  if (!p) {
    p = (async () => {
      const alias = (await loadAliases()).team[s];
      if (alias) return alias;
      const teams = await loadHubIndexQuick()
        .then((i) => i.teams)
        .catch(() => [] as SearchTeamRow[]);
      const bare = s.replace(/-/g, "");
      if (bare !== s && teams.some((t) => slugOf(t[0], t[1]) === bare)) return bare;
      const hit = teams.find((t) => t[5].split(" | ").some((c) => c.toLowerCase() === s));
      return hit ? slugOf(hit[0], hit[1]) : null;
    })();
    resolvedTeams.set(s, p);
  }
  return p;
}

/** A team's file (team, teamgames, teamseries), also under an address the build doesn't have (resolveTeamSlug). */
async function teamFile<T>(dir: string, slug: string): Promise<T> {
  try {
    return await load<T>(`hub/${dir}/${slug}.json`);
  } catch (err) {
    if (!(err instanceof MissingFile)) throw err;
    const to = await resolveTeamSlug(slug);
    if (to && to !== slug) return load<T>(`hub/${dir}/${to}.json`);
    throw err;
  }
}

const PLAYER_SLUG_ALIASES: Record<string, string> = {
  thebausffs: "baus",
  bausffs: "baus",
  thebaus: "baus",
  rekky: "rekkles",
  "show-maker": "showmaker",
  "the-shy": "theshy",
  "jackey-love": "jackeylove",
  "double-lift": "doublelift",
  "clear-love": "clearlove",
  knight9: "knight",
  bjerg: "bjergsen",
  dl: "doublelift",
};
export const resolvePlayerSlug = (slug: string) => PLAYER_SLUG_ALIASES[slug.toLowerCase()] || slug.toLowerCase();

async function playerFile<T>(dir: string, slug: string): Promise<T> {
  const first = resolvePlayerSlug(slug);
  try {
    return await load<T>(`hub/${dir}/${first}.json`);
  } catch (err) {
    if (!(err instanceof MissingFile)) throw err;
    const noDash = first.replace(/-/g, "");
    if (noDash && noDash !== first) {
      try {
        return await load<T>(`hub/${dir}/${noDash}.json`);
      } catch (e2) {
        if (!(e2 instanceof MissingFile)) throw e2;
      }
    }
    throw err;
  }
}

const CHAMP_SLUG_ALIASES: Record<string, string> = {
  "k-sante": "ksante",
  "kha-zix": "khazix",
  "rek-sai": "reksai",
  "vel-koz": "velkoz",
  "kog-maw": "kogmaw",
  "cho-gath": "chogath",
  "bel-veth": "belveth",
  "kai-sa": "kaisa",
  "le-blanc": "leblanc",
  lb: "leblanc",
  leesin: "lee-sin",
  twistedfate: "twisted-fate",
  tf: "twisted-fate",
  missfortune: "miss-fortune",
  mf: "miss-fortune",
  tahmkench: "tahm-kench",
  tk: "tahm-kench",
  jarvaniv: "jarvan-iv",
  jarvan: "jarvan-iv",
  jarvan4: "jarvan-iv",
  "jarvan-4": "jarvan-iv",
  j4: "jarvan-iv",
  aurelionsol: "aurelion-sol",
  asol: "aurelion-sol",
  "a-sol": "aurelion-sol",
  masteryi: "master-yi",
  yi: "master-yi",
  xinzhao: "xin-zhao",
  xin: "xin-zhao",
  drmundo: "dr-mundo",
  mundo: "dr-mundo",
  renataglasc: "renata-glasc",
  renata: "renata-glasc",
  nunu: "nunu-and-willump",
  "nunu-willump": "nunu-and-willump",
  nunuwillump: "nunu-and-willump",
  nunuandwillump: "nunu-and-willump",
  monkeyking: "wukong",
  "monkey-king": "wukong",
  blitz: "blitzcrank",
  cass: "cassiopeia",
  cassio: "cassiopeia",
  gp: "gangplank",
  ez: "ezreal",
  morde: "mordekaiser",
  cait: "caitlyn",
  vlad: "vladimir",
  heimer: "heimerdinger",
  nid: "nidalee",
  nida: "nidalee",
  sej: "sejuani",
  malph: "malphite",
  ali: "alistar",
  noc: "nocturne",
  renek: "renekton",
  ori: "orianna",
  aphel: "aphelios",
  kass: "kassadin",
};
export function resolveChampSlug(slug: string): string {
  const raw = (slug || "").trim().toLowerCase();
  if (CHAMP_SLUG_ALIASES[raw]) return CHAMP_SLUG_ALIASES[raw];
  const p = prettySlug(slug);
  return CHAMP_SLUG_ALIASES[p] || p;
}

/** True when two champion names, slugs, or shorthand aliases refer to the same champion ("Lee Sin" === "lee-sin", "Jarvan IV" === "j4", "K'Sante" === "k-sante", "Wukong" === "monkeyking"). */
export function sameChamp(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b || a.toLowerCase() === b.toLowerCase()) return true;
  const ba = bare(resolveChampSlug(a) || a);
  const bb = bare(resolveChampSlug(b) || b);
  if (ba && bb && ba === bb) return true;
  const ca = bare(champName(a));
  const cb = bare(champName(b));
  return (!!ca && (ca === bb || ca === cb)) || (!!cb && cb === ba);
}

/** True when a champion name or slug `c` matches a search substring or shorthand alias ("j4", "tf", "mf", "gp", "tk", "asol", "lb", "ksante", "monkeyking"). */
export function matchesChampSearch(c: string, term: string): boolean {
  const q = normText(term.trim());
  if (!q) return true;
  const disp = normText(champName(c));
  const raw = normText(c);
  if (disp.includes(q) || raw.includes(q)) return true;
  const bq = bare(q);
  const bDisp = bare(disp);
  const bRaw = bare(raw);
  if (bq.length >= 2 && (bDisp.includes(bq) || bRaw.includes(bq))) return true;
  const alias = CHAMP_SLUG_ALIASES[q] || CHAMP_SLUG_ALIASES[prettySlug(q)];
  if (alias) {
    const ba = bare(alias);
    if (ba && (bDisp === ba || bRaw === ba)) return true;
  }
  return false;
}

const ITEM_SLUG_ALIASES: Record<string, string> = {
  ie: "infinity-edge",
  bt: "bloodthirster",
  ga: "guardian-angel",
  bork: "blade-of-the-ruined-king",
  botrk: "blade-of-the-ruined-king",
  rfc: "rapid-firecannon",
  pd: "phantom-dancer",
  ldr: "lord-dominiks-regards",
  eon: "edge-of-night",
  dd: "deaths-dance",
  bc: "black-cleaver",
  roa: "rod-of-ages",
  liandry: "liandrys-torment",
  liandrys: "liandrys-torment",
  zhonya: "zhonyas-hourglass",
  zhonyas: "zhonyas-hourglass",
  hourglass: "zhonyas-hourglass",
  rabadon: "rabadons-deathcap",
  rabadons: "rabadons-deathcap",
  dcap: "rabadons-deathcap",
  deathcap: "rabadons-deathcap",
  seraph: "seraphs-embrace",
  seraphs: "seraphs-embrace",
  qss: "quicksilver-sash",
  er: "essence-reaver",
  triforce: "trinity-force",
  jaksho: "jaksho-the-protean",
  "jak-sho": "jaksho-the-protean",
  sterak: "steraks-gage",
  steraks: "steraks-gage",
  warmog: "warmogs-armor",
  warmogs: "warmogs-armor",
  randuin: "randuins-omen",
  randuins: "randuins-omen",
  rylai: "rylais-crystal-scepter",
  rylais: "rylais-crystal-scepter",
  shurelya: "shurelyas-battlesong",
  shurelyas: "shurelyas-battlesong",
  guinsoo: "guinsoos-rageblade",
  guinsoos: "guinsoos-rageblade",
  rageblade: "guinsoos-rageblade",
  youmuu: "youmuus-ghostblade",
  youmuus: "youmuus-ghostblade",
  ghostblade: "youmuus-ghostblade",
  mikael: "mikaels-blessing",
  mikaels: "mikaels-blessing",
  locket: "locket-of-the-iron-solari",
};
export function resolveItemSlug(slug: string): string {
  const raw = (slug || "").trim().toLowerCase();
  if (ITEM_SLUG_ALIASES[raw]) return ITEM_SLUG_ALIASES[raw];
  const p = prettySlug(slug);
  return ITEM_SLUG_ALIASES[p] || p;
}

export function matchesItemSearch(rawName: string, localizedName: string, term: string): boolean {
  const q = normText(term.trim());
  if (!q) return true;
  const disp = normText(localizedName || rawName);
  const raw = normText(rawName);
  if (disp.includes(q) || raw.includes(q)) return true;
  const bq = bare(q);
  const bDisp = bare(disp);
  const bRaw = bare(raw);
  if (bq.length >= 2 && (bDisp.includes(bq) || bRaw.includes(bq))) return true;
  const alias = ITEM_SLUG_ALIASES[q] || ITEM_SLUG_ALIASES[prettySlug(q)];
  if (alias) {
    const ba = bare(alias);
    if (ba && (bDisp === ba || bRaw === ba || bDisp.startsWith(ba) || bRaw.startsWith(ba))) return true;
  }
  return false;
}

async function champFile<T>(dir: "champ" | "matchups", slug: string): Promise<T> {
  const first = resolveChampSlug(slug);
  try {
    return await load<T>(`hub/${dir}/${first}.json`);
  } catch (err) {
    if (!(err instanceof MissingFile)) throw err;
    const b = bare(first || slug);
    if (b) {
      const champs = await loadHubIndexQuick()
        .then((i) => i.champs)
        .catch(() => [] as SearchChampRow[]);
      const hit = champs.find((c) => bare(c[0]) === b || bare(c[1]) === b);
      const canon = hit ? slugOf(hit[0], hit[1]) : "";
      if (canon && canon !== first) return load<T>(`hub/${dir}/${canon}.json`);
    }
    throw err;
  }
}

const EVENT_EARLY_WORLDS: Record<string, string> = {
  "worlds-2011": "worlds-season-1",
  "worlds-2012": "worlds-season-2",
  "worlds-2013": "worlds-season-3",
};
export function resolveEventSlug(slug: string): string {
  const s = slug
    .toLowerCase()
    .replace(/^(?:lol-)?world-championship-(\d{4}\b.*)/, "worlds-$1")
    .replace(/^(?:lol-)?mid-season-invitational-(\d{4}\b.*)/, "msi-$1")
    .replace(/^first-stand-tournament-(\d{4}\b.*)/, "first-stand-$1");
  return EVENT_EARLY_WORLDS[s] || s;
}

export const loadHubTeam = (slug: string) => teamFile<HubTeam>("team", slug);
export const loadHubPlayer = (slug: string) => playerFile<HubPlayer>("player", slug);
export const loadHubEvent = async (slug: string): Promise<HubEvent> => {
  const first = resolveEventSlug(slug);
  try {
    return await load<HubEvent>(`hub/event/${first}.json`);
  } catch (err) {
    if (!(err instanceof MissingFile)) throw err;
    const events = await loadHubIndexQuick()
      .then((i) => i.events)
      .catch(() => [] as SearchEventRow[]);
    const b = bare(first);
    const hit =
      events.find((e) => e[1] === `${first}-main-event`) ||
      (b ? events.find((e) => bare(e[1]) === b || bare(e[0]) === b) : undefined);
    if (hit && hit[1] && hit[1] !== first) return load<HubEvent>(`hub/event/${hit[1]}.json`);
    throw err;
  }
};
export const loadHubSeries = withAlias<HubSeries>("game");
export const loadHubChamp = (slug: string) => champFile<HubChamp>("champ", slug);
/** Every game scoreboard of a Worlds / MSI / First Stand event in one file (Worlds page facts). */
export const loadEventLines = (slug: string) => load<import("./worldsFacts").EventLines>(`hub/lines/${resolveEventSlug(slug)}.json`);
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
  /** how well it matched: lower is better (0 exact ... 3 loose); the search box orders its groups by it */
  score?: number;
  /** a near miss of a misspelt search ("fakr" -> Faker) */
  fuzzy?: boolean;
}

export interface HubIndex {
  teams: SearchTeamRow[];
  players: SearchPlayerRow[];
  events: SearchEventRow[];
  champs: SearchChampRow[];
  leagues?: import("./types").LeagueRow[];
}

let indexPromise: Promise<HubIndex> | null = null;
let quickPromise: Promise<HubIndex> | null = null;

/**
 * The search lists without the big player list (~320 KB of the ~450 KB): teams, tournaments, champions and leagues
 * can be found while the players are still on the way (a slow phone connection). `players` is empty.
 */
export function loadHubIndexQuick(): Promise<HubIndex> {
  if (!quickPromise) {
    quickPromise = Promise.all([
      load<SearchTeamRow[]>("hub/search/teams.json"),
      load<SearchEventRow[]>("hub/search/events.json"),
      load<SearchChampRow[]>("hub/search/champs.json"),
      loadLeagues().catch(() => []),
    ])
      .then(([teams, events, champs, leagues]) => ({ teams, players: [] as SearchPlayerRow[], events, champs, leagues }))
      .catch((e) => {
        quickPromise = null;
        throw e;
      });
  }
  return quickPromise;
}

/** The search lists (about 600 KB compressed in all), loaded once when someone first searches. */
export function loadHubIndex(): Promise<HubIndex> {
  if (!indexPromise) {
    indexPromise = Promise.all([
      load<SearchTeamRow[]>("hub/search/teams.json"),
      load<SearchPlayerRow[]>("hub/search/players.json"),
      load<SearchEventRow[]>("hub/search/events.json"),
      load<SearchChampRow[]>("hub/search/champs.json"),
      loadLeagues().catch(() => []),
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
export const bare = (s: string) => normText(s).replace(/[^\p{L}\p{N}]/gu, "");

/** Lower is better: 0 exact, 1 starts with, 2 contains, 3 contains ignoring spaces and dots, -1 no match. */
function score(name: string, q: string): number {
  const n = normText(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const i = n.indexOf(q);
  if (i > 0) return /[\s\-.(]/.test(n[i - 1]) ? 1.5 : 2;
  const bq = bare(q);
  if (!bq) return -1;
  if (bare(n) === bq) return 0.5;
  // across words ("dplus kia" for "dpluskia") only for 4+ letters: "msi" isn't "TeaM SIngularity", "g2" isn't "RDAG 2022"
  return bq.length >= 4 && bare(n).includes(bq) ? 3 : -1;
}

/** Edit distance with swaps (Damerau), stopping early once it passes `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

const ROLE: Record<string, string> = { T: "Top", J: "Jungle", M: "Mid", B: "Bot", S: "Support" };

const TEAM_EXTRA_OLD: Record<string, string[]> = {
  TSM: ["Team SoloMid"],
  "Griffin (Korean Team)": ["Griffin"],
  "Rogue (European Team)": ["Rogue", "KOI"],
  "Movistar KOI": ["MAD Lions KOI", "MAD Lions", "Splyce"],
  "Evil Geniuses.NA": ["Evil Geniuses"],
  "DN SOOPers": ["DN Freecs", "Kwangdong Freecs", "Afreeca Freecs", "Rebels Anarchy"],
  "Gen.G": ["Samsung Galaxy", "Samsung White", "Samsung Blue", "MVP Ozone"],
  "Hanwha Life Esports": ["ROX Tigers", "KOO Tigers", "GE Tigers"],
  "Dplus Kia": ["DWG KIA", "DAMWON Gaming"],
  "Royal Club": ["Star Horn Royal Club", "Royal Club Huang Zu"],
  "Moscow Five": ["Team Empire"],
};

const TEAM_EXTRA_CODES: Record<string, string[]> = {
  "Moscow Five": ["M5"],
  "Griffin (Korean Team)": ["GRF"],
  "Rogue (European Team)": ["RGE", "KOI"],
  "Movistar KOI": ["MKOI", "MDK", "MAD", "SPY"],
  "Evil Geniuses.NA": ["EG"],
  "DN SOOPers": ["DNS", "DNF", "KDF", "AF", "AFS"],
  "Gen.G": ["GEN", "SSG", "SSW", "SSB"],
  "Hanwha Life Esports": ["HLE", "ROX", "KOO", "GE"],
  "Dplus Kia": ["DK", "DWG"],
  "Royal Club": ["RYL", "SHRC", "SHR"],
  "KT Rolster Bullets": ["KTB", "KT.B"],
  "KT Rolster Arrows": ["KTA", "KT.A"],
};

const ACADEMY_TEAM = /\b(challengers|academy|youth|junior|talent|scholars|prodigies|trainee|amateur|next)\b|\.(a|c|y|j|young)$/i;

/**
 * One search across teams, players, leagues, tournaments and champions. Exact and prefix matches first, then
 * by how much a name has played; old team names, short names (SKT, C9) and real names count too.
 */
export function searchHub(index: HubIndex, query: string, limit = 6): Record<HubSearchKind, HubHit[]> {
  const raw = searchAlias(query.trim());
  const q = normText(raw);
  const bq = bare(q);
  const out: Record<HubSearchKind, HubHit[]> = { team: [], player: [], event: [], champ: [], league: [] };
  if (!q) return out;
  const pick = <T>(rows: T[], rank: (r: T) => [number, string | undefined] | null, weight: (r: T) => number, make: (r: T, m?: string) => HubHit) => {
    const scored: [number, number, T, string | undefined][] = [];
    for (const r of rows) {
      const s = rank(r);
      if (s) scored.push([s[0], weight(r), r, s[1]]);
    }
    scored.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    return scored.slice(0, limit).map((x) => ({ ...make(x[2], x[3]), score: x[0] }));
  };

  out.team = pick(
    index.teams,
    (t) => {
      // the best of: the current name, a short name (SKT, C9) and an old name
      const cands: [number, string | undefined][] = [];
      const s = score(t[0], q);
      if (s >= 0) cands.push([s, undefined]);
      const codes = [...(t[5] ? normText(t[5]).split(" | ") : []), ...(TEAM_EXTRA_CODES[t[0]] || []).map(normText)];
      if (codes.some((c) => c === q || (bq.length >= 2 && bare(c) === bq))) cands.push([0.2, undefined]);
      const olds = [...(t[4] ? t[4].split(" | ") : []), ...(TEAM_EXTRA_OLD[t[0]] || [])];
      if (olds.length) {
        const hit =
          olds.find((o) => score(o, q) >= 0 && score(o, q) <= 0.5) ||
          olds.find((o) => score(o, q) >= 0 && score(o, q) <= 1.5) ||
          olds.find((o) => score(o, q) >= 0);
        // an exact old name ("Team SoloMid", "Evil Geniuses", "Griffin") beats prefix matches on other teams ("TSM Evo",
        // "Evil Geniuses Challengers"); a prefix old name ("DWG" -> DWG KIA, "Samsung" -> Samsung Galaxy) ranks with
        // current names that start with the query
        if (hit) {
          const hs = score(hit, q);
          cands.push([hs <= 0.5 ? 0.3 : hs <= 1.5 ? 1 : hs + 1, hit]);
        }
      }
      return cands.length ? cands.sort((a, b) => a[0] - b[0])[0] : null;
    },
    (t) => (ACADEMY_TEAM.test(t[0]) ? Math.round(t[2] * 0.15) : t[2]),
    (t, m) => ({ kind: "team", name: t[0], slug: slugOf(t[0], t[1]), sub: [t[6], t[3]].filter(Boolean).join(" · "), games: t[2], matched: m, year: t[3] }),
  );
  const playerAlias = PLAYER_SLUG_ALIASES[q] || PLAYER_SLUG_ALIASES[prettySlug(q)];
  out.player = pick(
    index.players,
    (p) => {
      const s = score(p[0], q);
      if (s >= 0) return [s, undefined];
      if (playerAlias && slugOf(p[0], p[1]) === playerAlias) return [0.4, undefined];
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
  const champAlias = CHAMP_SLUG_ALIASES[q] || CHAMP_SLUG_ALIASES[prettySlug(q)];
  const bChampAlias = champAlias ? bare(champAlias) : "";
  out.champ = pick(
    index.champs,
    (c) => {
      const s = score(c[0], q);
      if (s >= 0) return [s, undefined];
      const disp = champName(c[0]);
      if (disp !== c[0]) {
        const ds = score(disp, q);
        if (ds >= 0) return [ds, undefined];
      }
      if (bChampAlias && (slugOf(c[0], c[1]) === champAlias || bare(c[0]) === bChampAlias || bare(c[1]) === bChampAlias)) {
        return [0.4, undefined];
      }
      return null;
    },
    (c) => c[2],
    (c) => ({ kind: "champ", name: c[0], slug: slugOf(c[0], c[1]), sub: "", games: c[2] }),
  );
  // Nothing at all: a misspelling? The nearest players, teams and champions ("fakr" -> Faker, "chovyy" -> Chovy),
  // one letter off for short searches, two for long ones; the most-played first.
  if (bq.length >= 4 && !Object.values(out).some((l) => l.length)) {
    const max = bq.length >= 7 ? 2 : 1;
    const near = <T>(rows: T[], name: (r: T) => string, weight: (r: T) => number) =>
      rows
        .map((r) => [editDistance(bare(normText(name(r))), bq, max), weight(r), r] as const)
        .filter((x) => x[0] <= max)
        .sort((a, b) => a[0] - b[0] || b[1] - a[1])
        .slice(0, limit);
    out.player = near(index.players, (p) => p[0], (p) => p[3]).map(([d, , p]) => ({
      kind: "player" as const, name: p[0], slug: slugOf(p[0], p[1]), sub: p[2], games: p[3], role: ROLE[p[5]] || "", year: p[4], score: 4 + d, fuzzy: true,
    }));
    out.team = near(index.teams, (t) => t[0], (t) => t[2]).map(([d, , t]) => ({
      kind: "team" as const, name: t[0], slug: slugOf(t[0], t[1]), sub: [t[6], t[3]].filter(Boolean).join(" · "), games: t[2], year: t[3], score: 4 + d, fuzzy: true,
    }));
    out.champ = near(index.champs, (c) => c[0], (c) => c[2]).map(([d, , c]) => ({
      kind: "champ" as const, name: c[0], slug: slugOf(c[0], c[1]), sub: "", games: c[2], score: 4 + d, fuzzy: true,
    }));
  }
  return out;
}

/**
 * The order of the result groups: the one with the best match first, a well-known name winning a near tie
 * (Ahri the champion before a team called Ahriro, MSI the tournament before a team with "msi" in its name).
 */
export function groupRank(hits: HubHit[]): number {
  const h = hits[0];
  if (!h) return 99;
  const bucket = (h.score ?? 2) < 0.6 ? 0 : (h.score ?? 2) < 2 ? 1 : 2;
  const known = h.kind === "champ" || h.games >= 300 ? 0.6 : h.games >= 50 ? 0.3 : 0;
  return bucket - known + (h.fuzzy ? 5 : 0);
}

export const loadHubRecords = () => load<import("./types").HubRecords>("hub/records.json");
export const loadHubTitles = () => load<import("./types").HubTitle[]>("hub/titles.json");
/** the last seven days in one file (hub.py "weekly.json"): results, upsets, rating movers, records, best games */
export const loadWeekly = () => load<import("./types").HubWeekly>("hub/weekly.json");

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

export const loadTeamSeries = (slug: string) => teamFile<import("./types").TeamSeriesRow[]>("teamseries", slug);
export const loadPlayerGames = (slug: string) => playerFile<import("./types").PlayerGameRow[]>("playergames", slug);
export const loadTeamGames = (slug: string) => teamFile<import("./types").TeamGameRow[]>("teamgames", slug);
const seasonCache = new Map<string, Promise<import("./types").LeagueSeason>>();
export const loadLeagueSeason = (league: string, year: string): Promise<import("./types").LeagueSeason> => {
  const first = resolveLeagueSlug(league);
  const key = `${first}/${year}`;
  let p = seasonCache.get(key);
  if (!p) {
    if (seasonCache.size >= 32) seasonCache.clear();
    p = load<import("./types").LeagueSeason>(`hub/leagueyear/${key}.json`)
      .catch(async (e) => {
        if (first !== league) {
          try {
            return await load<import("./types").LeagueSeason>(`hub/leagueyear/${league}/${year}.json`);
          } catch {
            // fall through
          }
        }
        const to = (await loadAliases()).league[league.toLowerCase()];
        if (to && to !== first && to !== league) return load<import("./types").LeagueSeason>(`hub/leagueyear/${to}/${year}.json`);
        throw e;
      })
      .catch((e) => {
        seasonCache.delete(key);
        throw e;
      });
    seasonCache.set(key, p);
  }
  return p;
};
export const loadChampIndex = () => load<import("./types").ChampLeagueIndex[]>("hub/champgames/index.json");
export const loadChampGames = (league: string, year: string) => load<import("./types").ChampGamesFile>(`hub/champgames/${league}/${year}.json`);
export const loadPatches = () => load<import("./types").PatchRow[]>("hub/patches.json");
let leaguesPromise: Promise<import("./types").LeagueRow[]> | null = null;
export const loadLeagues = (): Promise<import("./types").LeagueRow[]> => {
  if (!leaguesPromise) {
    leaguesPromise = load<import("./types").LeagueRow[]>("hub/leagues.json").catch((e) => {
      leaguesPromise = null;
      throw e;
    });
  }
  return leaguesPromise;
};
/** roster moves of the last five months (builds from 2026-10-24 on; older builds have none) */
export const loadMoves = () => load<import("./types").RosterMovesFile>("hub/moves.json");
export const loadLeague = withAlias<import("./types").HubLeague>("league");

/** Starts loading a hub page's file before it's opened (pointer on its link); the page then finds it ready. */
export function prefetchHub(r: import("./route").HubRoute): void {
  if ("slug" in r) {
    const go: Record<string, ((s: string) => Promise<unknown>) | undefined> = {
      team: loadHubTeam, player: loadHubPlayer, event: loadHubEvent, match: loadHubSeries, champ: loadHubChamp, league: loadLeague,
    };
    go[r.kind]?.(r.slug).catch(() => {});
    if (r.kind === "team") loadRatings().catch(() => {});
    return;
  }
  const qp = new URLSearchParams("query" in r && r.query ? r.query : "");
  const byKind: Record<string, (() => Promise<unknown>) | undefined> = {
    home: loadHubHome,
    tournaments: () => {
      const yr = ("year" in r && r.year) || qp.get("year") || "";
      return Promise.all([loadHubMeta(), ...(/^\d{4}$/.test(yr) ? [loadEventsOfYear(yr)] : [])]);
    },
    weekly: loadWeekly,
    records: () => {
      const yr = qp.get("year") || "";
      return Promise.all([loadHubRecords(), ...(/^\d{4}$/.test(yr) ? [loadRecordsYear(yr)] : [])]);
    },
    titles: loadHubTitles,
    rankings: loadRatings,
    leagues: loadLeagues,
    patches: loadPatches,
    teams: loadHubIndexQuick,
    players: loadHubIndex,
    items: () => {
      const pl = qp.get("player") || "";
      const it = qp.get("item") || "";
      return Promise.all([
        loadItemIndex(),
        ...(pl ? [loadPlayerItems(pl)] : []),
        ...(it ? [loadHubItem(it)] : []),
      ]);
    },
    best: () => Promise.all([loadBestIndex(), loadBest()]),
    counters: () => {
      const ch = qp.get("champ") || "";
      return Promise.all([loadHubIndexQuick(), ...(ch ? [loadMatchups(ch)] : [])]);
    },
    finder: () => Promise.all([loadChampIndex(), loadAliases()]),
    leaders: () => {
      const ev = qp.get("event") || "";
      const lg = qp.get("league") || "";
      const yr = qp.get("year") || "";
      return Promise.all([
        loadLeagues(),
        loadAliases(),
        ...(ev ? [loadHubEvent(ev)] : []),
        ...(lg && /^\d{4}$/.test(yr) ? [loadLeagueSeason(lg, yr)] : []),
      ]);
    },
    champions: () => Promise.all([loadChampIndex(), loadAliases()]),
    tiers: () => Promise.all([loadChampIndex(), loadAliases()]),
    data: () => Promise.all([loadLeagues(), loadHubMeta()]),
    prep: () => {
      const a = ("a" in r && r.a) || "";
      const b = ("b" in r && r.b) || "";
      return Promise.all([
        loadHubIndexQuick(),
        loadRatings(),
        ...(a ? [loadHubTeam(a)] : []),
        ...(b ? [loadHubTeam(b)] : []),
      ]);
    },
    compare: () => {
      const isPlayer = "mode" in r && r.mode === "player";
      const a = ("a" in r && r.a) || "";
      const b = ("b" in r && r.b) || "";
      return Promise.all([
        isPlayer ? loadHubIndex() : loadHubIndexQuick(),
        ...(a ? [isPlayer ? loadHubPlayer(a) : loadHubTeam(a)] : []),
        ...(b ? [isPlayer ? loadHubPlayer(b) : loadHubTeam(b)] : []),
      ]);
    },
    draft: () => {
      const tms = (qp.get("teams") || "").split(",").map((s) => s.trim()).filter(Boolean);
      return Promise.all([loadHubIndexQuick(), ...tms.slice(0, 2).map((t) => loadHubTeam(t))]);
    },
    worlds: () => Promise.all([loadLeague("world-championship"), loadHubTitles(), loadRatings()]),
    msi: () => Promise.all([loadLeague("mid-season-invitational"), loadHubTitles(), loadRatings()]),
    "first-stand": () => Promise.all([loadLeague("first-stand"), loadHubTitles(), loadRatings()]),
  };
  byKind[r.kind]?.().catch(() => {});
}
export const loadBestIndex = () => load<import("./types").BestIndex>("hub/best/index.json");
export const loadRecordsYear = (year: string) => load<import("./types").HubRecordsYear>(`hub/records/${year}.json`);
export const loadMatchups = (slug: string) => champFile<import("./types").HubMatchups>("matchups", slug);
/** The item history (/stats/items): one player's items, one item's players, and every item */
const playerItemsCache = new Map<string, Promise<import("./types").PlayerItems>>();
export const loadPlayerItems = (slug: string): Promise<import("./types").PlayerItems> => {
  const key = resolvePlayerSlug(slug);
  let p = playerItemsCache.get(key);
  if (!p) {
    if (playerItemsCache.size >= 32) playerItemsCache.clear();
    p = playerFile<import("./types").PlayerItems>("playeritems", key).catch((e) => {
      if (!(e instanceof MissingFile)) playerItemsCache.delete(key);
      throw e;
    });
    playerItemsCache.set(key, p);
  }
  return p;
};
export const loadHubItem = (slug: string) => load<import("./types").HubItem>(`hub/items/${resolveItemSlug(slug)}.json`);
export const loadHubItemChamp = async (item: string, champ: string) => {
  const it = resolveItemSlug(item);
  const first = resolveChampSlug(champ);
  try {
    return await load<import("./types").HubItemChamp>(`hub/items/${it}/c/${first}.json`);
  } catch (err) {
    if (err instanceof MissingFile) {
      const alt = prettySlug(champ);
      if (alt && alt !== first) return load<import("./types").HubItemChamp>(`hub/items/${it}/c/${alt}.json`);
    }
    throw err;
  }
};
export const loadHubItemYear = (item: string, year: string) => load<import("./types").HubItemYear>(`hub/items/${resolveItemSlug(item)}/y/${year}.json`);
export const loadItemIndex = () => load<import("./types").ItemIndexRow[]>("hub/items/index.json");
/** top-league teams' ratings over the last 120 days: slug -> [date, rating][] */
export const loadRatingsHistory = () => load<Record<string, [string, number][]>>("hub/ratings-history.json");
/** a player's last two years of games (smaller than the full log; not every player has one) */
const playerGames2yCache = new Map<string, Promise<import("./types").PlayerGameRow[]>>();
export const loadPlayerGames2y = (slug: string): Promise<import("./types").PlayerGameRow[]> => {
  const key = resolvePlayerSlug(slug);
  let p = playerGames2yCache.get(key);
  if (!p) {
    if (playerGames2yCache.size >= 32) playerGames2yCache.clear();
    p = playerFile<import("./types").PlayerGameRow[]>("playergames2y", key).catch((e) => {
      if (!(e instanceof MissingFile)) playerGames2yCache.delete(key);
      throw e;
    });
    playerGames2yCache.set(key, p);
  }
  return p;
};
/** a team's last two years of games (only teams whose page says g2y have one) */
export const loadTeamGames2y = (slug: string) => teamFile<import("./types").TeamGameRow[]>("teamgames2y", slug);
/** The best-rated games and series: all time, a year, a league, or a league's year. */
export const loadBest = (year?: string, league?: string) =>
  load<import("./types").BestFile>(
    league ? `hub/best/l/${league}${year ? `/${year}` : ""}.json` : year ? `hub/best/${year}.json` : "hub/best/all.json",
  );
const loadRatingsBuilt = () => load<import("./types").HubRatings>("hub/ratings.json");
/** The power ratings with every result Riot has that the last build doesn't (src/hub/liveRatings.ts), asked again every
 *  two minutes so a game that just ended counts. */
let ratingsLive: { at: number; p: Promise<import("./types").HubRatings> } | null = null;
export const loadRatings = (): Promise<import("./types").HubRatings> => {
  if (!ratingsLive || Date.now() - ratingsLive.at > 120_000) {
    const p = loadRatingsBuilt().then((r) => import("./liveRatings").then((m) => m.withLiveResults(r)));
    ratingsLive = { at: Date.now(), p };
    p.catch(() => (ratingsLive = null));
  }
  return ratingsLive.p;
};

/** Starting player for a role on a team (`t.starters` first, else most-played on the latest roster). */
export function teamStarter(t: HubTeam, role: string): { n: string; u: string } | null {
  const st = t.starters?.find((x) => x[2] === role);
  if (st && st[1]) return { n: st[0], u: st[1] };
  const p = (t.roster[0]?.p || []).filter((x) => x.r === role && x.u).sort((a, b) => b.g - a.g)[0];
  return p && p.u ? { n: p.n, u: p.u } : null;
}

type DraftSide = "b" | "r";
/** Tournament draft order: who acts and whether it's a ban or a pick. */
export const DRAFT_ORDER: { side: DraftSide; ban: boolean }[] = [
  ...(["b", "r", "b", "r", "b", "r"] as DraftSide[]).map((side) => ({ side, ban: true })),
  ...(["b", "r", "r", "b", "b", "r"] as DraftSide[]).map((side) => ({ side, ban: false })),
  ...(["r", "b", "r", "b"] as DraftSide[]).map((side) => ({ side, ban: true })),
  ...(["r", "b", "b", "r"] as DraftSide[]).map((side) => ({ side, ban: false })),
];

export interface PastGame {
  blue: string;
  red: string;
  slots: (string | null)[];
}

export const packSlots = (slots: (string | null)[]) => (slots.some((s) => s) ? slots.map((s) => s || "").join(",") : "");
export const packHistory = (h: PastGame[]) => h.map((g) => `${g.blue}~${g.red}~${g.slots.map((s) => s || "").join(",")}`).join(";");

export interface GameDraftInput {
  blueBans?: (string | null | undefined)[];
  redBans?: (string | null | undefined)[];
  bluePicks?: (string | null | undefined)[];
  redPicks?: (string | null | undefined)[];
}

/** Maps a game's Blue/Red bans & picks into the 20 tournament-order Draft Board slots. */
export function slotsFromGameDraft(g: GameDraftInput): (string | null)[] {
  const out: (string | null)[] = DRAFT_ORDER.map(() => null);
  let bb = 0;
  let rb = 0;
  let bp = 0;
  let rp = 0;
  DRAFT_ORDER.forEach((o, i) => {
    if (o.side === "b" && o.ban) out[i] = g.blueBans?.[bb++]?.trim() || null;
    else if (o.side === "r" && o.ban) out[i] = g.redBans?.[rb++]?.trim() || null;
    else if (o.side === "b" && !o.ban) out[i] = g.bluePicks?.[bp++]?.trim() || null;
    else if (o.side === "r" && !o.ban) out[i] = g.redPicks?.[rp++]?.trim() || null;
  });
  return out;
}

export interface GameDraftQueryInput {
  blueSlug: string;
  redSlug: string;
  period?: string;
  gameNum?: number;
  current?: GameDraftInput | null;
  earlier?: {
    blueSlug: string;
    redSlug: string;
    draft: GameDraftInput;
  }[];
}

/**
 * Builds the `/stats/draft?...` query string that loads a specific game (`gameNum`) onto the Draft Board:
 * - `teams=blueSlug,redSlug` (matching the Blue and Red sides of that game)
 * - `g=gameNum` (which game of the series is loaded on the board)
 * - `d=<20-slot-csv>` (that game's bans and picks loaded directly onto the board)
 * - `u=<earlier-picks-csv>` (champions picked in games 1..gameNum-1 locked in Fearless mode)
 * - `h=<PastGame-history>` (each earlier game's Blue/Red teams and picks shown in the Fearless history)
 */
export function buildGameDraftQuery(input: GameDraftQueryInput): string {
  const parts: string[] = [`teams=${encodeURIComponent(input.blueSlug)},${encodeURIComponent(input.redSlug)}`];
  if (input.period && input.period !== "all") parts.push(`p=${encodeURIComponent(input.period)}`);
  if (input.gameNum != null && input.gameNum >= 1) parts.push(`g=${encodeURIComponent(String(input.gameNum))}`);
  if (input.current) {
    const d = packSlots(slotsFromGameDraft(input.current));
    if (d) parts.push(`d=${encodeURIComponent(d)}`);
  }
  if (input.earlier && input.earlier.length > 0) {
    const usedSet = new Set<string>();
    const history: PastGame[] = [];
    for (const eg of input.earlier) {
      const slots = slotsFromGameDraft(eg.draft);
      for (const c of [...(eg.draft.bluePicks || []), ...(eg.draft.redPicks || [])]) {
        if (c && c.trim()) usedSet.add(c.trim());
      }
      if (slots.some((s) => s)) {
        history.push({ blue: eg.blueSlug, red: eg.redSlug, slots });
      }
    }
    if (usedSet.size > 0) parts.push(`u=${encodeURIComponent([...usedSet].join(","))}`);
    if (history.length > 0) parts.push(`h=${encodeURIComponent(packHistory(history))}`);
  }
  return parts.join("&");
}

/** Save text as a file (web), or open the file's address in the browser (desktop app). */
export async function saveCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One tournament's CSV: downloaded on the web, opened in the browser from the desktop app. */
export async function downloadEventCsv(slug: string, onOpenUrl?: (url: string) => void) {
  if (!IS_WEB && onOpenUrl) {
    onOpenUrl(await statsFileUrl(`hub/csv/${slug}.csv`));
    return;
  }
  await saveCsv(`${slug}.csv`, await loadText(`hub/csv/${slug}.csv`));
}

/** Join multiple tournament CSV files in the browser (up to 6 at a time), keeping the header row once. */
export async function joinCsvs(slugs: string[], onProgress?: (done: number, total: number) => void): Promise<string> {
  const raw = new Array<string>(slugs.length).fill("");
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < slugs.length) {
      const idx = next++;
      raw[idx] = await loadText(`hub/csv/${slugs[idx]}.csv`);
      done++;
      onProgress?.(done, slugs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, slugs.length) }, () => worker()));
  const parts: string[] = [];
  for (const text of raw) {
    if (!text) continue;
    parts.push(parts.length === 0 ? text.replace(/\n+$/, "") : text.slice(text.indexOf("\n") + 1).replace(/\n+$/, ""));
  }
  return parts.length ? parts.join("\n") + "\n" : "";
}

/** A whole event's CSV (Worlds = Play-In + Main Event): its stages' files in one, the header once. */
export async function downloadStagesCsv(name: string, slugs: string[], onOpenUrl?: (url: string) => void) {
  if (!IS_WEB && onOpenUrl) {
    onOpenUrl(`${SITE_URL}stats/data`);
    return;
  }
  const csv = await joinCsvs(slugs).catch(() => "");
  if (csv) await saveCsv(`${name}.csv`, csv);
}

