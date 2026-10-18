/**
 * From a match in Riot's schedule to its page in the stats hub (/match/<slug>): the two teams are found by name or
 * code, then the series they played that day in the first team's series list. New results reach the hub with the
 * nightly stats update, so a match from today may not have a page yet (null).
 */
import { findHubTeam, loadHubIndex, loadTeamSeries } from "./data";
import type { Match } from "../types";

const DAY_MS = 24 * 3600 * 1000;

export async function findSeriesSlug(m: Pick<Match, "team1Name" | "team1Code" | "team2Name" | "team2Code" | "startTimeUtc">): Promise<string | null> {
  const index = await loadHubIndex();
  const a = findHubTeam(index, m.team1Name, m.team1Code);
  const b = findHubTeam(index, m.team2Name, m.team2Code);
  const team = a || b;
  if (!team) return null;
  const opp = a ? b : findHubTeam(index, m.team1Name, m.team1Code);
  const rows = await loadTeamSeries(team);
  const start = new Date(m.startTimeUtc).getTime();
  // the hub dates series by their UTC day; a late-night match can be on the next day
  const near = rows.filter((r) => r[7] && Math.abs(new Date(`${r[0]}T12:00:00Z`).getTime() - start) <= 1.5 * DAY_MS);
  // with both teams known, only their series counts (never the team's other series that day)
  const hit = opp ? near.find((r) => r[2] === opp) : near.length === 1 ? near[0] : undefined;
  return hit?.[7] || null;
}
