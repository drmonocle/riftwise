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
