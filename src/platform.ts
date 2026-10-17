/**
 * True inside the Windows desktop app (Tauri), false when the same UI runs as the web version
 * at riftwise.gg. Desktop-only features (tray, hotkey, Windows startup,
 * self-updater, native notifications) are hidden on the web.
 */
export const IS_DESKTOP: boolean = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const IS_WEB = !IS_DESKTOP;

/** Riot Games' required notice for fan projects ("Legal Jibber Jabber"), verbatim apart from the name. */
export const RIOT_LEGAL_NOTICE =
  "RiftWise isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone " +
  "officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties " +
  "are trademarks or registered trademarks of Riot Games, Inc.";

/** The web version. Shared links always point here so they open without installing anything. */
/** The web version (riftwise.gg since 2026-10; lolworlds.com/riftwise pages forward there). */
export const SITE_URL = "https://riftwise.gg/";
export const WEB_APP_URL = SITE_URL;
/** Where installed apps of 0.5.1 and older read the data: it keeps answering there. */
export const OLD_SITE_URL = "https://lolworlds.com/riftwise/";

export function matchShareUrl(matchId: string): string {
  return `${WEB_APP_URL}#match/${encodeURIComponent(matchId)}`;
}

/** The match id in a `#match/<id>` link, if the page was opened with one. */
export function matchIdFromHash(hash: string = window.location.hash): string | null {
  const m = /^#match\/([^/?#]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Download for the desktop app, served straight from GitHub's release CDN so a rush of visitors
 * never touches the web server. "latest/download" always resolves to the newest published release.
 */
export const DESKTOP_DOWNLOAD_URL = "https://github.com/drmonocle/riftwise/releases/latest/download/RiftWise.exe";
export const DESKTOP_RELEASES_URL = "https://github.com/drmonocle/riftwise/releases/latest";
export const DESKTOP_CHECKSUM_URL = "https://github.com/drmonocle/riftwise/releases/latest/download/RiftWise.exe.sha256";

/** The desktop app is Windows-only, so only offer it to browsers on Windows. */
export const IS_WINDOWS_BROWSER: boolean =
  typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
