/**
 * Fans often type names the way their community writes them: 페이커 for Faker, 티원 for T1, B站 for
 * Bilibili. Rosters only have the in-game (Latin) names, so the best-known of those are mapped here.
 * Exact matches only; anything else is searched as typed.
 */
const ALIASES: Record<string, string> = {
  // Korean: players
  페이커: "Faker", 쵸비: "Chovy", 룰러: "Ruler", 케리아: "Keria", 구마유시: "Gumayusi", 오너: "Oner",
  제우스: "Zeus", 도란: "Doran", 쇼메이커: "ShowMaker", 캐니언: "Canyon", 데프트: "Deft", 비디디: "Bdd",
  카나비: "Kanavi", 페이즈: "Peyz", 피넛: "Peanut", 스코어: "Score", 뱅: "Bang", 울프: "Wolf", 칸: "Khan",
  마타: "Mata", 바이퍼: "Viper", 루키: "Rookie", 더샤이: "TheShy", 기인: "Kiin", 클리드: "Clid",
  // Korean: teams
  티원: "T1", 젠지: "Gen.G", 한화: "Hanwha", 한화생명: "Hanwha", 디플러스: "Dplus", 디플러스기아: "Dplus",
  담원: "Dplus", 케이티: "KT", 농심: "Nongshim", 디알엑스: "DRX", 피어엑스: "FEARX", 브리온: "BRION",
  // Chinese (both scripts where they differ)
  李相赫: "Faker", 大魔王: "Faker", 简自豪: "Uzi", 簡自豪: "Uzi", 厂长: "Clearlove", 廠長: "Clearlove",
  小虎: "Xiaohu", 阿水: "JackeyLove", 哔哩哔哩: "Bilibili", 嗶哩嗶哩: "Bilibili", B站: "Bilibili",
  滔搏: "Top Esports", 京东: "JD", 京東: "JD", 微博: "Weibo", 皇族: "Royal Never Give Up",
  李宁: "LNG", 李寧: "LNG", 凤凰: "FunPlus Phoenix", 鳳凰: "FunPlus Phoenix", 闪电狼: "Flash Wolves",
  閃電狼: "Flash Wolves", 中信: "CTBC",
  // Japanese
  フェイカー: "Faker",
};

/** The Latin name to search for, if the query is a known nickname in another alphabet. */
export function searchAlias(query: string): string {
  const q = query.trim();
  return ALIASES[q] || ALIASES[q.toUpperCase()] || query;
}

/** True when the text has no Latin letters or digits (Hangul, Chinese, Japanese...). */
export const isNonLatin = (query: string): boolean => /\S/.test(query) && !/[A-Za-z0-9]/.test(query);
