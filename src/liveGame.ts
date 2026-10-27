/**
 * The game being played right now, from Riot's public live-stats feed (the one lolesports.com uses):
 * team gold, kills, towers, dragons, barons and inhibitors, and for each player the champion, level, K/D/A,
 * CS, gold, items, kill participation and damage share.
 *
 * The feed answers with ten seconds of frames starting at `startingTime` (a multiple of ten seconds). Without it
 * you get the first frames of the game, so asking for "a minute ago" gives the current state (the feed itself
 * runs a little behind the game).
 */

const FEED = "https://feed.lolesports.com/livestats/v1";
const LAG_MS = 50_000;

export interface LiveParticipantMeta {
  participantId: number;
  summonerName: string;
  championId: string;
  role: string;
}
export interface LiveParticipantFrame {
  participantId: number;
  totalGold: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  currentHealth: number;
  maxHealth: number;
}
export interface LiveTeamFrame {
  totalGold: number;
  inhibitors: number;
  towers: number;
  barons: number;
  totalKills: number;
  dragons: string[];
  participants: LiveParticipantFrame[];
}
export interface LiveFrame {
  rfc460Timestamp: string;
  gameState: "in_game" | "paused" | "finished" | string;
  blueTeam: LiveTeamFrame;
  redTeam: LiveTeamFrame;
}
export interface LiveWindow {
  gameMetadata: {
    patchVersion?: string;
    blueTeamMetadata: { esportsTeamId: string; participantMetadata: LiveParticipantMeta[] };
    redTeamMetadata: { esportsTeamId: string; participantMetadata: LiveParticipantMeta[] };
  };
  frames: LiveFrame[];
}
export interface LiveDetailsParticipant {
  participantId: number;
  items: number[];
  killParticipation: number;
  championDamageShare: number;
  wardsPlaced: number;
  wardsDestroyed: number;
}

/** ISO time rounded down to ten seconds, as the feed wants it. */
const stamp = (ms: number) => new Date(Math.floor(ms / 10_000) * 10_000).toISOString();

/**
 * How far Riot's clock is ahead of this device's (ms). The feed refuses a window that ends less than 20 seconds
 * before its own time ("ahead of broadcast"), so a device whose clock runs fast asked for windows that weren't served
 * yet and never got live stats. The refusal says Riot's time; from then on requests are timed by it.
 */
let clockOffset = 0;
/** Now by Riot's clock (as far as this device has learned it). */
export const feedNow = () => Date.now() + clockOffset;

/** Riot's time from the feed's "too recent" refusal ("... current time: 2026-10-25T01:11:53.734707Z"). */
function serverTime(text: string): number | null {
  const m = /current time: (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?/.exec(text);
  if (!m) return null;
  const t = Date.parse(`${m[1]}${(m[2] || "").slice(0, 4)}Z`);
  return isNaN(t) ? null : t;
}

async function get<T>(url: string, again = true): Promise<T | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (r.status === 204 || r.status === 404) return null; // game not started or no stats for it
  if (r.status === 400 && again) {
    // too recent for Riot's clock: learn the difference, then ask once more for a window far enough back
    const server = serverTime(await r.text().catch(() => ""));
    const u = new URL(url);
    const asked = Date.parse(u.searchParams.get("startingTime") || "");
    if (server != null && !isNaN(asked)) {
      clockOffset = server - Date.now();
      u.searchParams.set("startingTime", stamp(Math.min(asked, server - LAG_MS)));
      return get<T>(u.toString(), false);
    }
    throw new Error("HTTP 400");
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  return text ? (JSON.parse(text) as T) : null;
}

/** The latest frames of a game (at = a time in ms by Riot's clock; default: now minus the feed's lag). */
export const fetchLiveWindow = (gameId: string, at = feedNow() - LAG_MS) =>
  get<LiveWindow>(`${FEED}/window/${gameId}?startingTime=${stamp(at)}`);

/** The game's first frames: when it started, and who plays what. */
export const fetchLiveStart = (gameId: string) => get<LiveWindow>(`${FEED}/window/${gameId}`);

/** Per-player items, kill participation and damage share. */
export const fetchLiveDetails = (gameId: string, at = feedNow() - LAG_MS) =>
  get<{ frames: { rfc460Timestamp: string; participants: LiveDetailsParticipant[] }[] }>(
    `${FEED}/details/${gameId}?startingTime=${stamp(at)}`,
  );

/** One team at one moment: kills, towers, barons, inhibitors and dragons taken so far. */
export interface TeamSnap {
  k: number;
  tw: number;
  b: number;
  inh: number;
  d: number;
}
/** A moment of the game: minute, blue's gold lead, and both teams' totals (the gold graph and the game story). */
export interface TimelinePoint {
  t: number;
  lead: number;
  blue: TeamSnap;
  red: TeamSnap;
}
const snap = (t: LiveTeamFrame): TeamSnap => ({ k: t.totalKills, tw: t.towers, b: t.barons, inh: t.inhibitors, d: t.dragons.length });

/** A frame as a timeline point (startMs: when the game started). */
export const timelinePoint = (f: LiveFrame, startMs: number): TimelinePoint => ({
  t: (Date.parse(f.rfc460Timestamp) - startMs) / 60_000,
  lead: f.blueTeam.totalGold - f.redTeam.totalGold,
  blue: snap(f.blueTeam),
  red: snap(f.redTeam),
});

/**
 * The game so far, one point a minute (every two after 30 minutes...): the gold graph and, once it's over, the game
 * story (gameStory.ts). Fetched only when someone opens the details, a few requests at a time.
 */
export async function fetchTimeline(gameId: string, startMs: number, endMs: number): Promise<TimelinePoint[]> {
  const times: number[] = [];
  // a point a minute, but at most ~30 for a long game: the graph shows for everyone watching, so it stays light
  const step = Math.max(1, Math.ceil((endMs - startMs) / 60_000 / 30)) * 60_000;
  for (let t = startMs + step; t <= endMs; t += step) times.push(t);
  const points: TimelinePoint[] = [];
  for (let i = 0; i < times.length; i += 4) {
    const batch = await Promise.all(
      times.slice(i, i + 4).map((t) =>
        fetchLiveWindow(gameId, t)
          .then((w) => {
            const f = w?.frames?.[0];
            return f ? timelinePoint(f, startMs) : null;
          })
          .catch(() => null),
      ),
    );
    for (const p of batch) if (p) points.push(p);
  }
  return points;
}

/**
 * A team's chance to win from its gold lead at a minute of the game: a logistic curve fitted on the pro games of
 * 2023-2026 with timelines (Oracle's Elixir, ~74,000 team games): what a gold lead is worth drops as the game goes
 * on (1,000 gold wins 69% at 10 minutes, 62% at 20). Gold only; towers, dragons and barons aren't in it.
 */
export function winChanceFromGold(minute: number, goldLead: number): number {
  const a = 0.0098 / (Math.max(minute, 3) + 2.3);
  return 1 / (1 + Math.exp(-a * goldLead));
}
