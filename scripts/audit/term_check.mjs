// League terms in RiftWise's translations: for every English text that uses a term, does each language use the word
// fans and casters use (src/i18n/GLOSSARY.md), and not a dictionary word? Prints the texts that don't.
// usage: node term_check.mjs <locales dir> [lang]
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const only = process.argv[3];
// term: English pattern, then per language [must contain one of (regex), must not contain (regex)]
const T = {
  kills: [/\bkills?\b/i, {
    es: [/kill/i, /asesinat/i], "pt-BR": [/abate/i, /assassinat/i], fr: [/kill/i, /éliminat|meurtre/i], de: [/kill/i, /tötung/i],
    ko: [/킬/], "zh-CN": [/击杀|杀/], "zh-TW": [/擊殺|殺/], ja: [/キル/], vi: [/hạ gục|mạng/i, /giết/i], tr: [/öldürme|kill|leş/i],
  }],
  deaths: [/\bdeaths?\b|\bdies\b|\bdied\b/i, {
    es: [/muert|muer/i], "pt-BR": [/mort|morr/i], fr: [/mort|meur/i], de: [/tod|tode|stirb|starb|gestorben/i],
    ko: [/데스/], "zh-CN": [/死亡|阵亡/], "zh-TW": [/死亡|陣亡/], ja: [/デス/], vi: [/chết/i], tr: [/öl/i],
  }],
  assists: [/\bassists?\b/i, {
    es: [/asistencia/i], "pt-BR": [/assist/i], fr: [/assist/i], de: [/assist/i],
    ko: [/어시/], "zh-CN": [/助攻/], "zh-TW": [/助攻/], ja: [/アシスト/], vi: [/hỗ trợ|kiến tạo/i], tr: [/asist/i],
  }],
  baron: [/\bbarons?\b/i, {
    es: [/barón|barones|nashor/i], "pt-BR": [/barão|barões|nashor/i], fr: [/nashor|baron/i], de: [/baron/i],
    ko: [/바론/], "zh-CN": [/大龙/, /男爵/], "zh-TW": [/巴龍/, /大龍|男爵/], ja: [/バロン/], vi: [/baron/i], tr: [/baron/i],
  }],
  dragon: [/\bdragons?\b/i, {
    es: [/dragón|dragones/i], "pt-BR": [/dragão|dragões/i], fr: [/dragon/i], de: [/drache|drachen/i],
    ko: [/드래곤|용/], "zh-CN": [/小龙|龙/], "zh-TW": [/小龍|龍/], ja: [/ドラゴン/], vi: [/rồng/i], tr: [/ejderha/i],
  }],
  cs: [/\bCS\b/, {
    "zh-CN": [/补刀/], "zh-TW": [/補兵/, /補刀/], ko: [/CS|씨에스/], ja: [/CS/],
  }],
  gold: [/\bgold\b/i, {
    es: [/oro/i], "pt-BR": [/ouro/i], fr: [/\bor\b|d'or/i], de: [/gold/i],
    ko: [/골드/], "zh-CN": [/经济|金币/], "zh-TW": [/經濟|金幣/], ja: [/ゴールド/], vi: [/vàng/i], tr: [/altın/i],
  }],
  presence: [/presence/i, {
    ko: [/픽밴률/], "zh-CN": [/BP\s?率/], "zh-TW": [/BP\s?率/], ja: [/P\/B率/], vi: [/pick\/cấm/i],
  }],
  pool: [/champion pool|champion pools/i, { ko: [/챔프폭/] }],
  pick: [/\bpick(ed|s)?\b/i, {
    es: [/pick/i, /elegid|escogid/i], "pt-BR": [/pick/i, /escolhid/i], de: [/pick/i, /gewählt|wahl/i], fr: [/pick|choisi/i],
  }],
  ban: [/\bban(ned|s)?\b/i, {
    es: [/ban/i], "pt-BR": [/ban/i], de: [/ban/i], fr: [/ban/i], ko: [/밴/], "zh-CN": [/禁|ban|BP/i], "zh-TW": [/禁|ban|BP/i], ja: [/バン/],
    vi: [/cấm/i], tr: [/yasak|ban/i],
  }],
  worlds: [/\bWorlds\b/, {
    es: [/Mundial|Worlds/], "pt-BR": [/Mundial|Worlds/], ko: [/롤드컵|월즈/], vi: [/CKTG|Worlds/], "zh-CN": [/全球总决赛|S赛|Worlds/],
    "zh-TW": [/世界大賽|Worlds/],
  }],
  firstblood: [/first blood/i, {
    ko: [/퍼스트 ?블러드|퍼블/], "zh-CN": [/一血/], "zh-TW": [/首殺|一血/], ja: [/ファーストブラッド|FB/], vi: [/first blood|chiến công đầu/i],
    tr: [/ilk kan|first blood/i],
  }],
  tower: [/\btowers?\b|\bturrets?\b/i, {
    es: [/torre/i], "pt-BR": [/torre/i], fr: [/tour/i], de: [/turm|türme/i], ko: [/포탑|타워/], "zh-CN": [/塔/], "zh-TW": [/塔/],
    ja: [/タワー/], vi: [/trụ/i], tr: [/kule/i],
  }],
  jungle: [/\bjungl/i, {
    es: [/jungla|jungl/i], "pt-BR": [/caçador|selva|jungl/i], ko: [/정글/], "zh-CN": [/打野|野区/], "zh-TW": [/打野|野區/], ja: [/ジャングル/],
    vi: [/rừng/i], tr: [/orman/i],
  }],
  support: [/\bsupports?\b/i, {
    "pt-BR": [/suporte/i], ko: [/서폿|서포터/], "zh-CN": [/辅助/], "zh-TW": [/輔助/], ja: [/サポート/], vi: [/hỗ trợ/i], tr: [/destek/i],
  }],
  playoffs: [/\bplayoffs?\b/i, {
    ko: [/플레이오프|PO/], "zh-CN": [/季后赛/], "zh-TW": [/季後賽/], ja: [/プレーオフ|プレイオフ/], tr: [/playoff|eleme/i],
  }],
  series: [/\bseries\b/i, {
    ko: [/매치|시리즈/], "zh-CN": [/大场|系列赛|BO/], "zh-TW": [/系列賽|BO/], ja: [/シリーズ/], es: [/serie/i], "pt-BR": [/série/i], vi: [/loạt|trận/i],
    fr: [/série/i], de: [/serie/i], tr: [/seri/i],
  }],
};
// one game of a series (not the whole match): GLOSSARY.md's word for it, never the series / match word
T.game = [/\bgames?\b(?!.*\b(match|matches|series)\b)/i, {
  "pt-BR": [null, /\bjogos\b|\bjogo\b(?! \{)/i], ko: [null, /경기/], vi: [null, /\btrận\b(?! đấu)/i],
  "zh-CN": [null, /场/], "zh-TW": [null, /場/], ja: [null, /試合/], fr: [null, /\bmatchs?\b/i], tr: [null, /\bmaç/i],
}];
const langs = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((l) => !only || l === only);
let total = 0;
const report = {};
for (const lang of langs) {
  const dict = JSON.parse(fs.readFileSync(path.join(dir, lang + ".json"), "utf8"));
  const hits = [];
  for (const [key, val] of Object.entries(dict)) {
    const en = key.replace(/^[^:]+::/, "");
    for (const [term, [re, rules]] of Object.entries(T)) {
      const r = rules[lang];
      if (!r || !re.test(en)) continue;
      const [must, mustNot] = r;
      const v = String(val);
      if ((must && !must.test(v)) || (mustNot && mustNot.test(v))) hits.push({ term, en: key, tr: v });
    }
  }
  report[lang] = hits;
  total += hits.length;
  console.log(`${lang}: ${hits.length}`);
}
fs.writeFileSync(process.argv[4] || "term_report.json", JSON.stringify(report, null, 1));
console.log("total", total);
