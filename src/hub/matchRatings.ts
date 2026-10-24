/**
 * A schedule match's two teams in the power rankings (hub/ratings.json, with today's results added by
 * liveRatings.ts): each team's rating, its rank among the top-league teams worldwide and in its own league, and the
 * chance to win one game and the whole series (winChance.ts). The teams are found by Riot's name and code in the
 * stats' team list (the small search file, not the players). Also each team's form: its last series, newest first,
 * from its team file plus the finished matches on Riot's schedule since the stats build.
 */
import { useEffect, useState } from "react";
import type { Match } from "../types";
import type { HubRatings, RatingRow } from "./types";
import { findHubTeam, loadHubIndexQuick, loadHubTeam, loadRatings } from "./data";
import { chanceContext, matchChance, seriesChance } from "./winChance";

export interface SideRating {
  slug: string;
  name: string;
  rating: number;
  /** rank among the top-league teams of every region (null for a second-tier team) */
  world: number | null;
  /** rank in its own league */
  league: number;
  leagueName: string;
  top: boolean;
  chg30: number | null;
}

export interface MatchRatings {
  a: SideRating | null;
  b: SideRating | null;
  /** chance for team 1 to win one game / the series (null when the two aren't on one scale) */
  game: number | null;
  series: number | null;
  /** how many points one game moves a top-league rating (the Elo K) */
  k: number | null;
}

/** A rated team's place in the rankings (the teams come sorted by rating, best first). */
export function sideRating(ratings: HubRatings, slug: string | null): SideRating | null {
  if (!slug) return null;
  const row = ratings.teams.find((r) => r[0] === slug);
  if (!row) return null;
  const top = row[9] === 1;
  let world: number | null = null;
  let league = 0;
  let w = 0;
  for (const r of ratings.teams) {
    if (r[9] === 1) w++;
    if (r[3] === row[3]) league++;
    if (r === row) {
      world = top ? w : null;
      break;
    }
  }
  return { slug, name: row[1], rating: row[5], world, league, leagueName: row[10] || row[3], top, chg30: row[6] };
}

/** One game's and the series' chance for team a, when both teams can be compared on one scale. */
export function chances(ratings: HubRatings, ra: RatingRow, rb: RatingRow, bestOf: number): { game: number; series: number } | null {
  // second-tier teams only compare within their own league
  if ((ra[9] !== 1 || rb[9] !== 1) && ra[3] !== rb[3]) return null;
  const ctx = chanceContext(ra[9] === 1, rb[9] === 1, ra[3], rb[3]);
  const game = matchChance(ra[5], rb[5], ctx, ratings.adjust);
  return { game, series: seriesChance(game, bestOf || 1, ratings.adjust) };
}

export async function matchRatings(m: Match): Promise<MatchRatings> {
  const [index, ratings] = await Promise.all([loadHubIndexQuick(), loadRatings()]);
  const sa = findHubTeam(index, m.team1Name, m.team1Code);
  const sb = findHubTeam(index, m.team2Name, m.team2Code);
  const ra = ratings.teams.find((r) => r[0] === sa);
  const rb = ratings.teams.find((r) => r[0] === sb);
  const c = ra && rb ? chances(ratings, ra, rb, m.bestOf) : null;
  return { a: sideRating(ratings, sa), b: sideRating(ratings, sb), game: c?.game ?? null, series: c?.series ?? null, k: ratings.k?.top ?? null };
}

/** The ratings of a match's teams, once loaded (null until then, or when the stats can't be reached). */
export function useMatchRatings(m: Match | undefined): MatchRatings | null {
  const [r, setR] = useState<MatchRatings | null>(null);
  const key = m ? `${m.team1Name}|${m.team1Code}|${m.team2Name}|${m.team2Code}|${m.bestOf}` : "";
  useEffect(() => {
    if (!m) return;
    let alive = true;
    setR(null);
    matchRatings(m)
      .then((x) => alive && setR(x))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return r;
}

/** W / L of a team's last series, newest first: Riot's finished matches since the stats build, then the build's. */
export async function teamForm(name: string, code: string, schedule: Match[], n = 5): Promise<("W" | "L")[]> {
  const index = await loadHubIndexQuick();
  const slug = findHubTeam(index, name, code);
  const team = slug ? await loadHubTeam(slug).catch(() => null) : null;
  const built = (team?.recent || []).map((r) => ({ date: r.date, won: r.us > r.them }));
  const newest = built[0]?.date || "";
  const up = code.toUpperCase();
  const fresh = schedule
    .filter((m) => m.state === "completed" && (m.team1Code.toUpperCase() === up || m.team2Code.toUpperCase() === up) && m.startTimeUtc.slice(0, 10) > newest)
    .map((m) => {
      const mine = m.team1Code.toUpperCase() === up ? m.team1Score : m.team2Score;
      const theirs = m.team1Code.toUpperCase() === up ? m.team2Score : m.team1Score;
      return { date: m.startTimeUtc.slice(0, 10), won: mine > theirs };
    })
    .sort((x, y) => (x.date < y.date ? 1 : -1));
  return [...fresh, ...built].slice(0, n).map((x) => (x.won ? "W" : "L"));
}
