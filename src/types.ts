export interface Team {
  id?: string;
  code: string;
  name: string;
  image?: string;
  league?: string;
}

export interface Player {
  id?: string;
  summonerName: string;
  role: string;
  teamCode: string;
}

export interface Game {
  number: number;
  id: string;
  state: "unstarted" | "inProgress" | "completed";
  blueTeamId?: string;
  redTeamId?: string;
}

export interface Match {
  matchId: string;
  leagueName: string;
  leagueSlug: string;
  blockName: string;
  startTimeUtc: string;
  state: "unstarted" | "inProgress" | "completed";
  bestOf: number;
  winner?: string;
  streamUrl?: string;
  team1Code: string;
  team1Name: string;
  team1Image?: string;
  team1Score: number;
  team2Code: string;
  team2Name: string;
  team2Image?: string;
  team2Score: number;
  games: Game[];
  blueTeamId?: string;
  redTeamId?: string;
}

export interface LiveStats {
  matchId: string;
  blue: {
    teamId?: string;
    gold: number;
    kills: number;
    towers?: number;
    dragons?: number;
    barons?: number;
  };
  red: {
    teamId?: string;
    gold: number;
    kills: number;
    towers?: number;
    dragons?: number;
    barons?: number;
  };
}

/**
 * A broadcast "show" Riot reports as in progress (pre-game or desk coverage). It has no teams, so
 * it isn't a match, but it tells us a league's broadcast is on air, which matters when a match
 * that was scheduled to start is running late.
 */
export interface LiveShow {
  leagueSlug: string;
  leagueName: string;
  startTimeUtc: string;
  streamUrl: string;
}

export interface StreamEvent {
  id: string | number;
  type: string;
  name?: string;
  event: string;
  season: string;
  stage?: string;
  team1?: string;
  team2?: string;
  score?: string;
  rawTime: string;
  utcIso: string;
  isBanger?: boolean;
}

/**
 * Optional note the stream owner publishes at lolworlds.com/riftwatch/stream-status.json.
 * Every field is optional; without the file the app works it out from the schedule alone.
 */
export interface StreamStatus {
  /** true forces "on break", false forces "on air" logic; leave it out to decide from the schedule. */
  onBreak?: boolean;
  headline?: string;
  message?: string;
}

export interface Region {
  code: string;
  name: string;
  leagues: string[];
  badge: string;
}

export interface League {
  slug: string;
  name: string;
  region: string;
  image?: string;
  priority?: number;
}

export interface PlayerEntry {
  name: string;
  role: string;
  teamCode: string;
  teamName: string;
  teamSlug?: string;
  realName?: string;
  image?: string;
}

export interface CatalogTeam {
  slug: string;
  code: string;
  name: string;
  league: string;
  region: string;
  image?: string;
}

export interface CatalogData {
  teams: CatalogTeam[];
  players: PlayerEntry[];
  leagues: League[];
  updatedAt: number;
}

export interface AppSettings {
  spoilerMode: boolean;
  tickerMode: "docked" | "detached" | "hidden";
  tickerTopmost: boolean;
  tickerCycleSec: number;
  defaultTab: "live" | "schedule" | "stats" | "stream" | "watchlist" | "news" | "settings";
  notifyKickoff: boolean;
  notifyPregame: boolean;
  notifyStream: boolean;
  soundAlerts?: boolean;
  compactMode?: boolean;
  minimizeToTrayOnClose: boolean;
  startWithWindows: boolean;
  /** "auto" follows the browser / Windows language. */
  language: "auto" | "en" | "es" | "pt-BR" | "ko" | "vi" | "zh-CN" | "zh-TW" | "ja" | "fr" | "de" | "tr";
  followedTeams: string[];
  followedPlayers: string[];
  followedLeagues: string[];
  followedRegions: string[];
}

export interface AppUpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  downloadUrl: string;
  /** SHA-256 checksum file published next to the executable; required for in-app install. */
  checksumUrl: string;
  publishedAt: string;
}
