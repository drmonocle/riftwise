import React from "react";
import { Newspaper, ExternalLink, Heart } from "lucide-react";
import { tl, tk, currentLang, type Lang } from "../../i18n";

interface NewsViewProps {
  onOpenUrl: (url: string) => void;
}

interface Source {
  name: string;
  url: string;
  /** English (translated with tl) for the main list; written in the language itself for the local lists */
  blurb: string;
}

/** Riot's official esports news in each app language (there is no Simplified Chinese edition; LPL's site is below). */
const RIOT_NEWS: Partial<Record<Lang, string>> = {
  es: "es-MX",
  "pt-BR": "pt-BR",
  ko: "ko-KR",
  vi: "vi-VN",
  "zh-TW": "zh-TW",
  ja: "ja-JP",
  fr: "fr-FR",
  de: "de-DE",
  tr: "tr-TR",
};

/** Outlets we link to. Descriptions are general; RiftWise does not scrape or republish their articles. */
const SOURCES: Source[] = [
  {
    name: "Riot LoL Esports",
    url: "https://lolesports.com/en-US/news",
    blurb: tk(
      "Official announcements, tournament formats, rulebook changes and schedules.",
    ),
  },
  {
    name: "Sheep Esports",
    url: "https://www.sheepesports.com",
    blurb: tk("Roster moves, transfer news and industry reporting."),
  },
  {
    name: "Inven Global",
    url: "https://www.invenglobal.com/esports",
    blurb: tk(
      "LCK coverage, interviews and Korean scene reporting in English.",
    ),
  },
  {
    name: "Dot Esports",
    url: "https://dotesports.com/league-of-legends",
    blurb: tk("Match recaps, patch and meta coverage."),
  },
  {
    name: "Dexerto",
    url: "https://www.dexerto.com/league-of-legends/",
    blurb: tk(
      "Fast League of Legends news, from roster rumors to big results.",
    ),
  },
  {
    name: "ONE Esports",
    url: "https://www.oneesports.gg/category/league-of-legends/",
    blurb: tk("League of Legends esports news and features from every region."),
  },
  {
    name: "Leaguepedia",
    url: "https://lol.fandom.com/wiki/League_of_Legends_Esports_Wiki",
    blurb: tk(
      "The esports wiki: rosters, transfers, results and every tournament.",
    ),
  },
];

/**
 * Outlets in the app's language, shown first when it's picked (names and descriptions in that language, so they
 * aren't translation keys). Every link checked on 2026-10-16.
 */
const LOCAL: Partial<Record<Lang, Source[]>> = {
  ko: [
    {
      name: "인벤 LoL 뉴스",
      url: "https://www.inven.co.kr/webzine/news/?site=lol",
      blurb: "LCK 기사, 인터뷰, 패치 소식을 빠르게 다루는 대표 게임 매체예요.",
    },
    {
      name: "데일리e스포츠",
      url: "https://www.dailyesports.com/",
      blurb:
        "e스포츠 전문 언론사예요. LCK와 국제 대회 기사, 인터뷰를 볼 수 있어요.",
    },
    {
      name: "네이버 e스포츠",
      url: "https://game.naver.com/esports/League_of_Legends/home",
      blurb:
        "LoL e스포츠 일정과 결과, 여러 언론사의 기사를 한곳에서 볼 수 있어요.",
    },
    {
      name: "포모스",
      url: "https://www.fomos.kr/",
      blurb: "e스포츠·게임 뉴스와 커뮤니티예요.",
    },
  ],
  "zh-CN": [
    {
      name: "英雄联盟赛事官网",
      url: "https://lpl.qq.com/",
      blurb: "LPL 官方：赛程、战报、公告和转会信息。",
    },
    {
      name: "玩加电竞",
      url: "https://www.wanplus.cn/",
      blurb: "电竞资讯与数据社区，LPL 战报和选手数据。",
    },
    {
      name: "虎扑英雄联盟",
      url: "https://bbs.hupu.com/lol",
      blurb: "热门 LOL 社区，赛后讨论和转会消息。",
    },
  ],
  "zh-TW": [
    {
      name: "巴哈姆特 GNN",
      url: "https://gnn.gamer.com.tw/",
      blurb: "台灣最大的遊戲新聞網，也有 LCP 與國際賽的電競新聞。",
    },
    {
      name: "4Gamers",
      url: "https://www.4gamers.com.tw/",
      blurb: "遊戲與電競新聞，常有 LCP、國際賽報導與專訪。",
    },
  ],
  ja: [
    {
      name: "eSports World",
      url: "https://esports-world.jp/",
      blurb:
        "eスポーツ専門メディア。LoL の国内外の大会ニュースやインタビュー。",
    },
    {
      name: "4Gamer.net",
      url: "https://www.4gamer.net/",
      blurb: "国内最大級のゲーム情報サイト。LoL の大会やアップデートの情報も。",
    },
  ],
  vi: [
    {
      name: "ONE Esports Việt Nam",
      url: "https://www.oneesports.vn/",
      blurb: "Tin tức thể thao điện tử, VCS và các giải quốc tế.",
    },
    {
      name: "GameK",
      url: "https://gamek.vn/",
      blurb:
        "Trang tin game lớn tại Việt Nam, có tin LMHT và thể thao điện tử.",
    },
  ],
  es: [
    {
      name: "Sheep Esports en español",
      url: "https://www.sheepesports.com/es",
      blurb: "Fichajes, rumores y noticias de la escena, en español.",
    },
    {
      name: "Dexerto en español",
      url: "https://www.dexerto.es/league-of-legends/",
      blurb: "Noticias de League of Legends y sus competiciones.",
    },
    {
      name: "MARCA eSports",
      url: "https://www.marca.com/videojuegos/esports.html",
      blurb: "Noticias de esports del diario deportivo MARCA.",
    },
  ],
  "pt-BR": [
    {
      name: "Mais Esports",
      url: "https://maisesports.com.br/",
      blurb: "Notícias de esports do Brasil, com cobertura do CBLOL.",
    },
    {
      name: "ge eSports",
      url: "https://ge.globo.com/esports/lol/",
      blurb: "LoL no ge (Globo): CBLOL, Mundial e transferências.",
    },
    {
      name: "Sheep Esports em português",
      url: "https://www.sheepesports.com/pt",
      blurb: "Transferências e bastidores do cenário, em português.",
    },
  ],
  fr: [
    {
      name: "Sheep Esports (FR)",
      url: "https://www.sheepesports.com/fr",
      blurb: "Mercato, rumeurs et coulisses de la scène, en français.",
    },
    {
      name: "Millenium (MGG)",
      url: "https://www.millenium.org/",
      blurb: "Actualités esport, dont la LFL et la LEC.",
    },
    {
      name: "Dexerto.fr",
      url: "https://www.dexerto.fr/league-of-legends/",
      blurb: "Actus League of Legends et compétitions.",
    },
  ],
  de: [
    {
      name: "Sheep Esports (DE)",
      url: "https://www.sheepesports.com/de",
      blurb: "Transfers, Gerüchte und Hintergründe aus der Szene, auf Deutsch.",
    },
    {
      name: "Prime League",
      url: "https://www.primeleague.gg/de/news",
      blurb:
        "Die deutsche League-of-Legends-Liga: News, Ergebnisse und Termine.",
    },
    {
      name: "Mein-MMO",
      url: "https://mein-mmo.de/league-of-legends/",
      blurb: "News und Hintergründe zu League of Legends, auch zum E-Sport.",
    },
  ],
  tr: [
    {
      name: "Sporx E-Spor",
      url: "https://www.sporx.com/e-spor/",
      blurb: "Sporx'in e-spor haberleri.",
    },
    {
      name: "Fanatik E-Spor",
      url: "https://www.fanatik.com.tr/espor/",
      blurb: "Fanatik gazetesinin e-spor haberleri.",
    },
    {
      name: "Milliyet Espor",
      url: "https://www.milliyet.com.tr/haberleri/espor",
      blurb: "Milliyet gazetesinin e-spor haberleri.",
    },
  ],
};

const Card: React.FC<{
  s: Source;
  text: string;
  onOpenUrl: (url: string) => void;
}> = ({ s, text, onOpenUrl }) => (
  <button
    onClick={() => onOpenUrl(s.url)}
    className="text-left bg-rw-surface border border-rw-border hover:border-rw-accent p-4 rounded-lg transition-all group"
  >
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span className="text-sm font-bold text-rw-text group-hover:text-rw-accent transition-colors">
        {s.name}
      </span>
      <ExternalLink className="w-3.5 h-3.5 text-rw-teal shrink-0" />
    </div>
    <p className="text-xs text-rw-muted leading-relaxed">{text}</p>
  </button>
);

export const NewsView: React.FC<NewsViewProps> = ({ onOpenUrl }) => {
  const lang = currentLang();
  const local = LOCAL[lang] || [];
  const riot = RIOT_NEWS[lang];
  // Riot's own news comes in the reader's language where it exists
  const main = SOURCES.map((s, i) =>
    i === 0 && riot ? { ...s, url: `https://lolesports.com/${riot}/news` } : s,
  );
  return (
    <div className="p-4 space-y-4 page-4xl rw-capped overflow-y-auto h-full select-none">
      <div className="pb-1 border-b border-rw-border">
        <h2 className="text-xs font-bold text-rw-accent uppercase tracking-wider flex items-center gap-1.5">
          <Newspaper className="w-3.5 h-3.5 text-rw-teal" />
          {tl("News Sources")}
        </h2>
        <div className="text-[11px] text-rw-muted mt-0.5">
          {tl(
            "Links to LoL Esports outlets. RiftWise does not show live headlines here.",
          )}
        </div>
      </div>

      {local.length > 0 && (
        <>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">
            {tl("In your language")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {local.map((s) => (
              <Card key={s.name} s={s} text={s.blurb} onOpenUrl={onOpenUrl} />
            ))}
          </div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-1">
            {tl("International")}
          </h3>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {main.map((s) => (
          <Card key={s.name} s={s} text={tl(s.blurb)} onOpenUrl={onOpenUrl} />
        ))}
      </div>

      {/* fan-made tools worth knowing, with credit to the people behind them */}
      <div className="pt-2 border-t border-rw-border space-y-3">
        <div>
          <h2 className="text-xs font-bold text-rw-accent uppercase tracking-wider flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-rw-teal" />
            {tl("Community picks")}
          </h2>
          <div className="text-[11px] text-rw-muted mt-0.5">{tl("Fan-made projects we love. Not ours: all credit to their makers.")}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card
            s={{ name: "NerdFinder", url: "https://nerdfinder.gg/", blurb: "" }}
            text={tl(
              "Search Riot's LoL Esports event photos by who's in them: any player, any team, two players in the same shot. Made by Alessandra Ogawa, Gabriela Albuquerque and Pedro Fracassi, starting as a computer-vision class project at Insper. Photos belong to Riot Games.",
            )}
            onOpenUrl={onOpenUrl}
          />
        </div>
      </div>
    </div>
  );
};
