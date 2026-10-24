/**
 * A match from Riot's feeds, for a match page before the stats hub has its stats: the schedule entry (teams, date,
 * stage, score) with its games and Riot team ids, so each game's numbers come from the live stats feed as soon as it
 * ends. Used for /match/riot-<Riot match id> (a match the hub doesn't have yet) and for a hub series that has no
 * stats yet (found by its teams and day).
 */
import { fetchMatchGames, fetchSchedule } from "../api";
import { normalizeTeamCode } from "../helpers";
import type { Match } from "../types";
import type { HubSeries } from "./types";

const DAY_MS = 24 * 3600 * 1000;
/** the address part of a match page that comes from Riot's feeds */
export const RIOT_PREFIX = "riot-";

let schedule: Promise<Match[]> | null = null;
let scheduleAt = 0;
/** the schedule, asked again after a minute (a series that just ended changes state) */
export function recentSchedule(): Promise<Match[]> {
  if (!schedule || Date.now() - scheduleAt > 60_000) {
    scheduleAt = Date.now();
    schedule = fetchSchedule(0).catch((e) => {
      schedule = null;
      throw e;
    });
  }
  return schedule;
}

export async function riotMatchById(matchId: string): Promise<Match | null> {
  const m = (await recentSchedule()).find((x) => x.matchId === matchId);
  return m ? fetchMatchGames(m) : null;
}

const norm = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameTeam = (code: string, name: string, t: HubSeries["a"]) =>
  (!!t.c && normalizeTeamCode(t.c) === normalizeTeamCode(code)) || (!!name && norm(t.n) === norm(name));

/** Riot's match for a hub series (the same two teams within a day and a half), with its games. */
export async function riotMatchFor(s: HubSeries): Promise<Match | null> {
  const day = Date.parse(s.date.length <= 10 ? `${s.date}T12:00:00Z` : `${s.date.replace(" ", "T")}Z`);
  const m = (await recentSchedule()).find(
    (x) =>
      Math.abs(Date.parse(x.startTimeUtc) - day) <= 1.5 * DAY_MS &&
      ((sameTeam(x.team1Code, x.team1Name, s.a) && sameTeam(x.team2Code, x.team2Name, s.b)) ||
        (sameTeam(x.team1Code, x.team1Name, s.b) && sameTeam(x.team2Code, x.team2Name, s.a))),
  );
  return m ? fetchMatchGames(m) : null;
}
