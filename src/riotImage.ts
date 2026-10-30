/**
 * Riot's player photos are big PNGs (~270 KB each, 784 px wide) and many team logos are too (often 100-250 KB):
 * Match prep alone would pull ~2.7 MB of photos on a phone, the Live tab ~1 MB of logos. Riot's own image resizer
 * (the one lolesports.com uses) serves the same picture at the width asked for: a logo at 96 px is ~8 KB, a photo at
 * 192 px ~21 KB, still sharp at the size we show on a high-density screen. Anything that isn't one of Riot's
 * pictures is returned as it is. If the resizer ever fails, the original is shown (riotImg's onError, PlayerPhoto).
 */
const RIOT_STATIC = /^https?:\/\/static\.lolesports\.com\//;

export function riotThumb(url: string, width = 192): string {
  return RIOT_STATIC.test(url) ? `https://am-a.akamaihd.net/image?resize=${width}:&f=${encodeURIComponent(url.replace(/^http:/, "https:"))}` : url;
}

const DDRAGON_CHAMP = /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[^/]+\/img\/champion\//;

/**
 * A Data Dragon champion icon (120 px, ~28 KB) at about 2.5x the size it's shown, through the same resizer (a 20 px
 * icon: ~9 KB at 64 px). Items, spells and runes stay as they are: they're already small (64 px, ~7 KB) and resizing
 * them saves little or even adds. The resizer doesn't allow pictures to be copied into "save as image", so
 * the full icon goes in data-full and withFullImages() swaps it in before a picture is taken.
 */
export function ddragonThumb(url: string, shown: number): string {
  if (!DDRAGON_CHAMP.test(url)) return url;
  const w = shown <= 38 ? 64 : 0;
  return w ? `https://am-a.akamaihd.net/image?resize=${w}:&f=${encodeURIComponent(url)}` : url;
}

/** Runs `take` (an html-to-image capture of `node`) with every resized icon in it swapped for its full picture. */
export async function withFullImages<T>(node: HTMLElement, take: () => Promise<T>): Promise<T> {
  const imgs = [...node.querySelectorAll<HTMLImageElement>("img[data-full]")].filter((i) => i.dataset.full && i.getAttribute("src") !== i.dataset.full);
  const before = imgs.map((i) => i.getAttribute("src") || "");
  for (const i of imgs) {
    i.loading = "eager";
    i.src = i.dataset.full!;
  }
  try {
    return await take();
  } finally {
    imgs.forEach((i, k) => i.setAttribute("src", before[k]));
  }
}

/** <img {...riotImg(logo, 96)} />: the resized picture, and the original if that one fails to load. */
export function riotImg(url: string, width: number): { src: string; onError: (e: { currentTarget: HTMLImageElement }) => void } {
  const original = url.replace(/^http:\/\/static\.lolesports\.com\//, "https://static.lolesports.com/");
  return {
    src: riotThumb(url, width),
    onError: (e) => {
      if (e.currentTarget.src !== original) e.currentTarget.src = original;
    },
  };
}
