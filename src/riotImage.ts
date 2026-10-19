/**
 * Riot's player photos are big PNGs (~270 KB each, 784 px wide): Match prep alone would pull ~2.7 MB on a phone.
 * Riot's own image resizer (the one lolesports.com uses) serves the same picture at the width asked for: 192 px is
 * ~21 KB and still sharp at the largest size we show on a high-density screen. Anything that isn't one of Riot's
 * pictures is returned as it is. If the resizer ever fails, show the original (see PlayerPhoto).
 */
const RIOT_STATIC = "https://static.lolesports.com/";

export function riotThumb(url: string, width = 192): string {
  return url.startsWith(RIOT_STATIC) ? `https://am-a.akamaihd.net/image?resize=${width}:&f=${encodeURIComponent(url)}` : url;
}
