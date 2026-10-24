// Builds server/pages/seo_i18n.json: what the page service needs to give riftwise.gg/<lang>/... pages a title and
// description in that language. The page templates (home, tabs, "{name} – pro stats..." per kind) are in
// scripts/seo_templates.json; the stats sections' names and one-line descriptions come from the app's own
// translations (src/i18n/locales), so they read the same as on screen.
//
//   node scripts/seo_i18n.mjs
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), "utf8"));
const templates = read("scripts/seo_templates.json");

// section -> [name key, description key] (the Stats home tiles)
const SECTIONS = {
  "": ["Pro Stats", "Every pro League of Legends game, in one place"],
  tournaments: ["Tournaments", "Every event since 2011"],
  leagues: ["Leagues", "Every season and its champion"],
  champions: ["Champions", "Pick, ban and win rates"],
  patches: ["Patches", "The pro meta on every patch"],
  records: ["Records", "Fastest, longest, best games"],
  titles: ["Titles", "Every champion, every league"],
  compare: ["Compare", "Any two teams or players"],
  prep: ["Match prep", "Everything before a broadcast"],
  rankings: ["Power rankings", "Every team, every region, one scale"],
  finder: ["Game finder", "Any game by team, champion, player"],
  draft: ["Draft board", "Plan a draft with both teams' pools"],
  best: ["Best games", "Highest-rated games and series"],
  counters: ["Counter-picks", "Every pro lane matchup, by champion"],
  leaders: ["Leaderboards", "Every player on every stat, by league and role"],
  tiers: ["Pro tier list", "What pros play on each patch, by role"],
  worlds: ["event::Worlds", "Winners, records and region stats"],
  msi: ["event::MSI", "Winners, records and region stats"],
  "first-stand": ["event::First Stand", "Winners, records and region stats"],
};

const out = {};
for (const [lang, t] of Object.entries(templates)) {
  const dict = read(`src/i18n/locales/${lang}.json`);
  const entry = { ...t };
  for (const [sec, [nameKey, descKey]] of Object.entries(SECTIONS)) {
    const plain = nameKey.replace(/^event::/, "");
    entry[`sec.${sec}.name`] = dict[nameKey] || dict[plain] || plain;
    if (dict[descKey]) entry[`sec.${sec}.desc`] = dict[descKey];
  }
  out[lang] = entry;
}
fs.writeFileSync(new URL("server/pages/seo_i18n.json", root), JSON.stringify(out, null, 1) + "\n");
console.log("seo_i18n.json:", Object.keys(out).length, "languages,", Object.keys(out.ko).length, "texts each");
