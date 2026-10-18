/**
 * Translations. Text in the code stays in English and is wrapped in t("..."); each language file
 * (src/i18n/locales/<lang>.json) maps that English text to the translation. Missing entries fall
 * back to English, and a test fails if any language is missing a string or a {placeholder}.
 *
 *   tl("Live Matches")
 *   tl("Starts in {time}", { time })
 *   tn("{n} match", "{n} matches", count)        // plural forms via Intl.PluralRules
 *
 * Only the chosen language is downloaded. Changing language reloads the page (and the HUD window),
 * which keeps every screen simple: they just call t() while rendering.
 */

export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "ko", name: "한국어" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "ja", name: "日本語" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "tr", name: "Türkçe" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];
export type LangSetting = Lang | "auto";

/** Email for "is this translation wrong?" reports, shown next to the language picker. */
export const TRANSLATION_EMAIL = "kyle.l.hoover@gmail.com";
/** mailto: link with the language in the subject, so reports say which language they're about. */
export const TRANSLATION_MAILTO = (): string =>
  `mailto:${TRANSLATION_EMAIL}?subject=${encodeURIComponent(`RiftWise translation (${current})`)}`;

const CODES = LANGUAGES.map((l) => l.code) as readonly string[];

/** Best language for this browser / Windows: exact match, then by region rules, then base language. */
export function detectLanguage(prefs: readonly string[] = typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : []): Lang {
  for (const raw of prefs) {
    const p = (raw || "").toLowerCase();
    if (!p) continue;
    if (p.startsWith("zh")) {
      // Traditional script: Taiwan, Hong Kong, Macau or an explicit Hant tag
      return /hant|-tw|-hk|-mo/.test(p) ? "zh-TW" : "zh-CN";
    }
    if (p.startsWith("pt")) return "pt-BR";
    const exact = CODES.find((c) => c.toLowerCase() === p);
    if (exact) return exact as Lang;
    const base = p.split("-")[0];
    if (CODES.includes(base)) return base as Lang;
  }
  return "en";
}

let current: Lang = "en";
let dict: Record<string, string> = {};
// Test mode (localStorage riftwatch_i18n_pseudo = 1): every translated text shows as ⟦…⟧, so any
// English left on screen without brackets is text that was missed.
let pseudo = false;

export function currentLang(): Lang {
  return current;
}

/** Locale for dates, times and numbers: the chosen language, so a Korean screen gets Korean dates. */
export function locale(): string {
  return current;
}

/** Clock times: 2:00 PM / 下午2:00 where clocks are 12-hour, 02:00 where they are 24-hour. */
export function clockOptions(): Intl.DateTimeFormatOptions {
  const h12 = new Intl.DateTimeFormat(current, { hour: "numeric" }).resolvedOptions().hour12;
  return { hour: h12 ? "numeric" : "2-digit", minute: "2-digit" };
}

export function resolveLang(setting: LangSetting | undefined): Lang {
  return setting && setting !== "auto" && CODES.includes(setting) ? (setting as Lang) : detectLanguage();
}

const loaders = import.meta.glob("./locales/*.json", { import: "default" }) as Record<string, () => Promise<Record<string, string>>>;

/** Loads the language before the app first renders (English needs nothing). */
export async function initI18n(setting: LangSetting | undefined): Promise<Lang> {
  const lang = resolveLang(setting);
  current = lang;
  if (lang !== "en") {
    try {
      const load = loaders[`./locales/${lang}.json`];
      dict = load ? await load() : {};
    } catch {
      dict = {};
    }
  }
  try {
    pseudo = localStorage.getItem("riftwatch_i18n_pseudo") === "1";
  } catch {
    pseudo = false;
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  return lang;
}

/** For tests: use a dictionary directly. */
export function setDictionaryForTests(lang: Lang, d: Record<string, string>): void {
  current = lang;
  dict = d;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  const out = vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
  return pseudo ? `⟦${out}⟧` : out;
}

/** Translate English UI text. */
export function tl(english: string, vars?: Record<string, string | number>): string {
  return fill(dict[english] ?? english, vars);
}

/**
 * Plural-aware translate. The English singular/plural pair is the key ("one|other"); languages
 * store their forms as "one|other" too (or a single form where the language has no plural).
 */
export function tn(one: string, other: string, count: number, vars?: Record<string, string | number>): string {
  const key = `${one}|${other}`;
  const v = { n: count.toLocaleString(locale()), ...vars };
  const tr = dict[key];
  if (!tr) return fill(count === 1 ? one : other, v);
  const forms = tr.split("|");
  if (forms.length === 1) return fill(forms[0], v);
  const rule = new Intl.PluralRules(current).select(count);
  return fill(rule === "one" ? forms[0] : forms[forms.length - 1], v);
}

/** Marks English text stored in data (lists, tables) for translation; t() it where it's shown. */
export const tk = (english: string): string => english;

/**
 * Same English word, different meaning or space: the key is "<context>::<English>" so a language can
 * translate it differently (e.g. tc("short tab", "Settings") must fit a 54 px phone tab).
 */
export function tc(context: string, english: string, vars?: Record<string, string | number>): string {
  return fill(dict[`${context}::${english}`] ?? english, vars);
}

/** Player roles as each region's fans say them (Korean 원딜/서폿, Chinese 上单/打野...). */
export function roleName(role: string): string {
  // Riot rosters say "top/jungle/mid/bottom/support"; the stats say "Top/Jungle/Mid/Bot/Support"
  const norm: Record<string, string> = { top: "Top", jungle: "Jungle", mid: "Mid", middle: "Mid", bottom: "Bot", bot: "Bot", adc: "Bot", support: "Support" };
  const key = norm[(role || "").toLowerCase()];
  return key ? tc("role", key) : role;
}

/** Riot region codes (KOREA, EMEA, HONG KONG, MACAU, TAIWAN...) in the reader's language. */
export function regionName(code: string, english?: string): string {
  const key = `region::${(code || "").toUpperCase()}`;
  return dict[key] ?? english ?? code;
}

/** Event names as fans say them (Worlds is 롤드컵 to Korean fans, S赛 / 全球总决赛 in China...). */
export const eventName = (event: string): string => tc("event", event);

/** Title names from the stats ("Worlds 2025 Main Event", "First Stand 2026") with the event in the reader's wording. */
export function eventTitle(title: string): string {
  const m = /^(Worlds|MSI|First Stand)\b(.*?)(?: Main Event)?$/.exec(title || "");
  if (m) return eventName(m[1]) + m[2];
  return /^Demacia Cup\b/.test(title || "") ? tc("league", "Demacia Cup") + title.slice(11) : title;
}

const STAGE_ALIASES: Record<string, string> = {
  "semi finals": "Semifinals",
  "semi-finals": "Semifinals",
  semifinals: "Semifinals",
  swiss: "Swiss Stage",
  "play-ins": "Play-ins",
  "play-ins knockouts": "Play-ins Knockouts",
  "play-ins finals": "Play-ins Finals",
  eliminations: "Elimination",
  "elimination round": "Elimination",
  "elimination rounds": "Elimination",
  tiebreakers: "Tiebreakers",
  tiebreaker: "Tiebreakers",
  "play-in": "Play-ins",
  "play-in stage": "Play-ins",
  "grand final": "Grand Finals",
  final: "Finals",
  "quarter finals": "Quarterfinals",
  "quarter-finals": "Quarterfinals",
  groups: "Group Stage",
  knockouts: "Knockout Stage",
  playoff: "Playoffs",
  qualifier: "Qualifiers",
  qual: "Qualifiers",
  "qualification round": "Qualifying Round",
  promo: "Promotion",
  "winners finals": "Upper Bracket Final",
  "winners final": "Upper Bracket Final",
  "upper bracket final": "Upper Bracket Final",
  "upper bracket finals": "Upper Bracket Final",
  "losers finals": "Lower Bracket Final",
  "losers final": "Lower Bracket Final",
  "loser's finals": "Lower Bracket Final",
  "lower bracket final": "Lower Bracket Final",
  "lower bracket finals": "Lower Bracket Final",
  "winner's bracket": "Upper Bracket",
  "winners bracket": "Upper Bracket",
  "loser's bracket": "Lower Bracket",
  "losers bracket": "Lower Bracket",
};

/**
 * Tournament stage names from the 24/7 schedule ("Group Stage Day 3", "Play-ins Day 2",
 * "Bracket Rounds 1/2", "Round 4"), translated piece by piece.
 */
export function stageName(stage: string | undefined): string {
  const s = (stage || "").trim();
  if (!s) return "";
  let m = /^(.*?)\s*Day (\d+)$/i.exec(s);
  if (m) return m[1] ? tc("stage day", "{stage} Day {n}", { stage: stageName(m[1]), n: m[2] }) : tc("stage day", "Day {n}", { n: m[2] });
  m = /^Round (\d+)$/i.exec(s);
  if (m) return tc("stage", "Round {n}", { n: m[1] });
  m = /^Bracket Rounds (\S+)$/i.exec(s);
  if (m) return tc("stage", "Bracket Rounds {n}", { n: m[1] });
  m = /^Bracket Round (\d+)$/i.exec(s);
  if (m) return tc("stage", "Bracket Round {n}", { n: m[1] });
  m = /^Playoffs Round (\d+)$/i.exec(s);
  if (m) return tc("stage", "Playoffs Round {n}", { n: m[1] });
  m = /^Round of (\d+)$/i.exec(s);
  if (m) return tc("stage", "Round of {n}", { n: m[1] });
  m = /^Stage (\d+)$/i.exec(s);
  if (m) return tc("stage", "Stage {n}", { n: m[1] });
  m = /^(?:Upper|Winners|Winner's) (?:Bracket )?Round (\d+)$/i.exec(s);
  if (m) return tc("stage", "Upper Bracket Round {n}", { n: m[1] });
  m = /^(?:Lower|Losers|Loser's) (?:Bracket )?Round (\d+)$/i.exec(s);
  if (m) return tc("stage", "Lower Bracket Round {n}", { n: m[1] });
  const canon = STAGE_ALIASES[s.toLowerCase()] || s;
  return tc("stage", canon);
}

/**
 * A tournament stage as Leaguepedia names it ("Week 3", "Group B", "Playoffs - Round 1", "Swiss Round 4"...), in the
 * reader's language; a compound name is translated part by part.
 */
export function stageLabel(name: string | undefined): string {
  const s = (name || "").trim();
  if (!s) return "";
  let m = /^Week (\d+)$/i.exec(s);
  if (m) return tl("Week {n}", { n: m[1] });
  m = /^Swiss Round (\d+)$/i.exec(s);
  if (m) return stageName(`Round ${m[1]}`);
  m = /^Group ([A-Z0-9]+)$/i.exec(s);
  if (m) return tl("Group {name}", { name: m[1] });
  if (/^(third|3rd)[- ]place match$/i.test(s)) return tl("Third-place match");
  m = /^W(\d+)$/.exec(s);
  if (m) return tl("Week {n}", { n: m[1] });
  const parts = s.split(/\s+[·\-–]\s+/);
  if (parts.length > 1) return parts.map(stageLabel).join(" · ");
  m = /^(.+?)\s+(Week \d+|W\d+|Round \d+)$/i.exec(s); // "Group Stage Week 2", "Stage 2 Round 3"
  if (m && !/^(Upper|Lower|Winners|Losers|Winner's|Loser's|Bracket|Playoffs)( Bracket)?$/i.test(m[1]))
    return `${stageLabel(m[1])} · ${stageLabel(m[2])}`;
  return stageName(s);
}
