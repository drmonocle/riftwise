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

async function get<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (r.status === 204 || r.status === 404) return null; // game not started or no stats for it
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  return text ? (JSON.parse(text) as T) : null;
}

/** The latest frames of a game (at = a time in ms; default: now minus the feed's lag). */
export const fetchLiveWindow = (gameId: string, at = Date.now() - LAG_MS) =>
  get<LiveWindow>(`${FEED}/window/${gameId}?startingTime=${stamp(at)}`);

/** The game's first frames: when it started, and who plays what. */
export const fetchLiveStart = (gameId: string) => get<LiveWindow>(`${FEED}/window/${gameId}`);

/** Per-player items, kill participation and damage share. */
export const fetchLiveDetails = (gameId: string, at = Date.now() - LAG_MS) =>
  get<{ frames: { rfc460Timestamp: string; participants: LiveDetailsParticipant[] }[] }>(
    `${FEED}/details/${gameId}?startingTime=${stamp(at)}`,
  );

/**
 * Blue's gold lead over the game so far, one point a minute (for the graph): [minute, gold lead].
 * Fetched only when someone opens the details, a few requests at a time.
 */
export async function fetchGoldHistory(gameId: string, startMs: number, endMs: number): Promise<[number, number][]> {
  const times: number[] = [];
  for (let t = startMs + 60_000; t <= endMs; t += 60_000) times.push(t);
  const points: [number, number][] = [];
  for (let i = 0; i < times.length; i += 4) {
    const batch = await Promise.all(
      times.slice(i, i + 4).map((t) =>
        fetchLiveWindow(gameId, t)
          .then((w) => {
            const f = w?.frames?.[0];
            return f ? ([(Date.parse(f.rfc460Timestamp) - startMs) / 60_000, f.blueTeam.totalGold - f.redTeam.totalGold] as [number, number]) : null;
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
