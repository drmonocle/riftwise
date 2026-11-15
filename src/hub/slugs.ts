/** Pure slug normalization and static alias maps shared by the initial entry prefetcher and hub data loader. */
import type { HubRoute } from "./route";

const LETTERS: Record<string, string> = {
  Ø: "O", ø: "o", Æ: "AE", æ: "ae", Œ: "OE", œ: "oe", ß: "ss", Ł: "L", ł: "l", Đ: "D", đ: "d", Þ: "Th", þ: "th", ı: "i", Ð: "D", ð: "d",
};

/** 'Worlds 2025 Main Event' -> 'worlds-2025-main-event'. Same rules as pretty() in scripts/stats/hub.py. */
export function prettySlug(text: string): string {
  let s = (text || "").replace(/[ØøÆæŒœßŁłĐđÞþıÐð]/g, (c) => LETTERS[c] || c);
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ");
  s = s.replace(/['\u2019`.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 70).replace(/-+$/g, "");
}

export const LEAGUE_SLUG_ALIASES: Record<string, string> = {
  worlds: "world-championship",
  wc: "world-championship",
  "lol-world-championship": "world-championship",
  msi: "mid-season-invitational",
  "lol-mid-season-invitational": "mid-season-invitational",
  fst: "first-stand",
  first_stand: "first-stand",
  "first-stand-tournament": "first-stand",
  ewc: "esports-world-cup",
  iem: "intel-extreme-masters",
  lck: "lol-champions-korea",
  ogn: "lol-champions-korea",
  "ogn-champions": "lol-the-champions",
  "champions-korea": "lol-champions-korea",
  kr: "lol-champions-korea",
  korea: "lol-champions-korea",
  lpl: "tencent-lol-pro-league",
  "lol-pro-league": "tencent-lol-pro-league",
  cn: "tencent-lol-pro-league",
  china: "tencent-lol-pro-league",
  "demacia-cup": "demacia-cup",
  demacia_cup: "demacia-cup",
  lec: "lol-emea-championship",
  "eu-lcs": "europe-league-championship-series",
  eulcs: "europe-league-championship-series",
  eu: "lol-emea-championship",
  europe: "lol-emea-championship",
  emea: "lol-emea-championship",
  lcs: "league-of-legends-championship-series",
  "na-lcs": "north-america-league-championship-series",
  nalcs: "north-america-league-championship-series",
  na: "league-of-legends-championship-series",
  lta: "league-of-legends-championship-of-the-americas",
  "lta-north": "league-of-legends-championship-of-the-americas-north",
  lta_north: "league-of-legends-championship-of-the-americas-north",
  ltan: "league-of-legends-championship-of-the-americas-north",
  "lta-south": "league-of-legends-championship-of-the-americas-south",
  lta_south: "league-of-legends-championship-of-the-americas-south",
  ltas: "league-of-legends-championship-of-the-americas-south",
  "lta-cross-conference": "league-of-legends-championship-of-the-americas",
  lcp: "league-of-legends-championship-pacific",
  pcs: "pacific-championship-series",
  lms: "lol-master-series",
  gpl: "garena-premier-league",
  vcs: "vietnam-championship-series",
  cblol: "circuit-brazilian-league-of-legends",
  "cblol-brazil": "circuit-brazilian-league-of-legends",
  "cblol-academy": "circuit-brazilian-league-of-legends-academy",
  cblol_academy: "circuit-brazilian-league-of-legends-academy",
  ljl: "lol-japan-league",
  "ljl-japan": "lol-japan-league",
  lla: "liga-latinoamerica",
  lco: "lol-circuit-oceania",
  "oceanic-leagues": "lol-circuit-oceania",
  opl: "oceanic-pro-league",
  tcl: "turkish-championship-league",
  "turkish-championship-league": "turkish-championship-league",
  lcl: "lol-continental-league",
  lckc: "lck-challengers-league",
  lckcl: "lck-challengers-league",
  "lck-cl": "lck-challengers-league",
  "lck-challengers": "lck-challengers-league",
  lck_challengers_league: "lck-challengers-league",
  ldl: "lol-development-league",
  nacl: "north-american-challengers-league",
  "north-american-challengers": "north-american-challengers-league",
  north_american_challengers_league: "north-american-challengers-league",
  "emea-masters": "emea-masters",
  emea_masters: "emea-masters",
  em: "emea-masters",
  lfl: "la-ligue-francaise",
  nlc: "northern-league-of-legends-championship",
  "prime-league": "prime-league-pro-division",
  prm: "prime-league-pro-division",
  les: "liga-espanola-de-league-of-legends",
  lvp: "liga-espanola-de-league-of-legends",
  sl: "liga-espanola-de-league-of-legends",
};

export function resolveLeagueSlug(slug: string): string {
  const raw = (slug || "").trim().toLowerCase();
  if (!raw) return "";
  if (LEAGUE_SLUG_ALIASES[raw]) return LEAGUE_SLUG_ALIASES[raw];
  const p = prettySlug(raw);
  if (LEAGUE_SLUG_ALIASES[p]) return LEAGUE_SLUG_ALIASES[p];
  const stripped = prettySlug(raw.replace(/\s*\(.*\)\s*$/, ""));
  if (stripped && LEAGUE_SLUG_ALIASES[stripped]) return LEAGUE_SLUG_ALIASES[stripped];
  return p || raw;
}

export const TEAM_SLUG_ALIASES: Record<string, string> = {
  skt: "t1",
  sktt1: "t1",
  "sk-telecom-t1": "t1",
  dwg: "dplus-kia",
  damwon: "dplus-kia",
  "damwon-gaming": "dplus-kia",
  "dwg-kia": "dplus-kia",
  dk: "dplus-kia",
  geng: "geng",
  "geng-esports": "geng",
  "gen-g": "geng",
  gen: "geng",
  ssg: "geng",
  ssw: "geng",
  ssb: "geng",
  samsung: "geng",
  "samsung-galaxy": "geng",
  "samsung-white": "geng",
  "samsung-blue": "geng",
  ksv: "geng",
  "ksv-esports": "geng",
  hle: "hanwha-life-esports",
  rox: "hanwha-life-esports",
  "rox-tigers": "hanwha-life-esports",
  "koo-tigers": "hanwha-life-esports",
  "ge-tigers": "hanwha-life-esports",
  kt: "kt-rolster",
  ktrolster: "kt-rolster",
  drx: "kiwoom-drx",
  kz: "kiwoom-drx",
  kingzone: "kiwoom-drx",
  "kingzone-dragonx": "kiwoom-drx",
  lz: "kiwoom-drx",
  longzhu: "kiwoom-drx",
  "longzhu-gaming": "kiwoom-drx",
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
  "movistar-koi-2018-2024": "movistar-koi-2017-2024",
  kc: "karmine-corp",
  kcorp: "karmine-corp",
  bds: "shifters",
  "team-bds": "shifters",
  vit: "team-vitality",
  vitality: "team-vitality",
  tl: "team-liquid",
  liquid: "team-liquid",
  c9: "cloud9",
  fly: "flyquest",
  "100t": "100-thieves",
  "100-thieves-academy": "100-thieves-challengers",
  "team-liquid-academy": "team-liquid-challengers",
  origen: "astralis",
  "vici-gaming": "rare-atom",
  "snake-esports": "lng-esports",
  "nord-esports": "g2-nord",
  "lyon-gaming": "lyon",
  psg: "psg-talon",
  gam: "gam-esports",
  cfo: "ctbc-flying-oyster",
};

/** Resolve a team shorthand or historical org name ("skt" -> "t1", "dwg" -> "dplus-kia", "ssg" -> "gen-g") synchronously. */
export function resolveTeamSlugAlias(slug: string, teamAliases?: Record<string, string>): string {
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

export const PLAYER_SLUG_ALIASES: Record<string, string> = {
  thebausffs: "baus",
  "the-bausffs": "baus",
  bausffs: "baus",
  thebaus: "baus",
  "the-baus": "baus",
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

export function resolvePlayerSlug(slug: string): string {
  const raw = (slug || "").trim().toLowerCase();
  if (!raw) return "";
  if (PLAYER_SLUG_ALIASES[raw]) return PLAYER_SLUG_ALIASES[raw];
  const p = prettySlug(raw);
  return PLAYER_SLUG_ALIASES[p] || p || raw;
}

export const CHAMP_SLUG_ALIASES: Record<string, string> = {
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

const EVENT_EARLY_WORLDS: Record<string, string> = {
  "worlds-2011": "worlds-season-1",
  "worlds-2012": "worlds-season-2",
  "worlds-2013": "worlds-season-3",
};

export function resolveEventSlug(slug: string): string {
  const s = (prettySlug(slug) || slug.toLowerCase())
    .replace(/^(?:lol-)?world-championship-(\d{4}\b.*)/, "worlds-$1")
    .replace(/^(?:lol-)?mid-season-invitational-(\d{4}\b.*)/, "msi-$1")
    .replace(/^first-stand-tournament-(\d{4}\b.*)/, "first-stand-$1");
  return EVENT_EARLY_WORLDS[s] || s;
}

const HUB_FILE_DIR: Partial<Record<string, string>> = {
  player: "player",
  team: "team",
  event: "event",
  match: "game",
  champ: "champ",
  league: "league",
};

/** Canonical stats file path to pre-fetch at startup for a direct entity route, or null for live Riot match IDs. */
export function prefetchHubFile(r: HubRoute): string | null {
  const dir = HUB_FILE_DIR[r.kind];
  if (!dir || !("slug" in r)) return null;
  if (r.kind === "match") return r.slug.startsWith("riot-") ? null : `hub/${dir}/${r.slug}.json`;
  if (r.kind === "team") return `hub/${dir}/${resolveTeamSlugAlias(r.slug)}.json`;
  if (r.kind === "player") return `hub/${dir}/${resolvePlayerSlug(r.slug)}.json`;
  if (r.kind === "league") return `hub/${dir}/${resolveLeagueSlug(r.slug)}.json`;
  if (r.kind === "event") return `hub/${dir}/${resolveEventSlug(r.slug)}.json`;
  if (r.kind === "champ") return `hub/${dir}/${resolveChampSlug(r.slug)}.json`;
  return `hub/${dir}/${r.slug}.json`;
}
