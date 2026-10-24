/**
 * The power ratings right after each game: the stats build rates every game in the database, which reaches a new
 * result a few hours after it is played; until then this adds the newer results from Riot's schedule on top, one game
 * at a time, the way the build does (a win against the expected result moves both teams, international games more).
 * Only results the build hasn't rated are added: it lists the last days' rated series (ratings.json "rated").
 */
import type { HubRatings, RatingRow } from "./types";
import { chanceContext, matchChance } from "./winChance";
import { findHubTeam, loadHubIndex } from "./data";
import { recentSchedule } from "./riotMatch";

const DAY = 86400_000;
const INTL_LEAGUES = new Set(["worlds", "msi", "first_stand", "first-stand"]);

export interface LiveResult {
  /** UTC day the series started */
  date: string;
  a: string;
  b: string;
  wa: number;
  wb: number;
  intl: boolean;
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pairKey = (d: string, a: string, b: string) => `${d}|${[a, b].sort().join("|")}`;

/** The ratings with these results added (rows re-sorted by rating); results the build already rated are skipped. */
export function applyResults(r: HubRatings, results: LiveResult[]): HubRatings {
  if (!r.rated) return r; // builds before 2026-10-23 don't say which results they have: add nothing
  const rated = new Set(r.rated);
  const rows = new Map<string, RatingRow>(r.teams.map((t) => [t[0], [...t] as RatingRow]));
  const k = r.k || { top: 38.4, intl: 61.4 };
  const added: LiveResult[] = [];
  for (const x of [...results].sort((p, q) => p.date.localeCompare(q.date))) {
    const t = Date.parse(`${x.date}T12:00:00Z`);
    // the hub dates a series by its UTC day; a late match can be filed on the next day (or the day before)
    if ([-1, 0, 1].some((d) => rated.has(pairKey(dayOf(t + d * DAY), x.a, x.b)))) continue;
    const A = rows.get(x.a);
    const B = rows.get(x.b);
    if (!A || !B || x.wa + x.wb === 0) continue;
    const kk = x.intl ? k.intl : k.top;
    // the games one by one, alternating, so a 3-2 moves the ratings about as much as five single games would
    const games: boolean[] = [];
    for (let i = 0; i < Math.max(x.wa, x.wb); i++) {
      if (i < x.wa) games.push(true);
      if (i < x.wb) games.push(false);
    }
    for (const aWon of games) {
      const e = matchChance(A[5], B[5], chanceContext(A[9] === 1, B[9] === 1, A[3], B[3]), r.adjust);
      const d = kk * ((aWon ? 1 : 0) - e);
      A[5] += d;
      B[5] -= d;
      A[6] = (A[6] ?? 0) + d;
      B[6] = (B[6] ?? 0) - d;
    }
    for (const row of [A, B]) {
      row[7] += games.length;
      if (x.date > row[8]) row[8] = x.date;
    }
    added.push(x);
  }
  if (!added.length) return r;
  const teams = [...rows.values()]
    .map((t) => {
      t[5] = Math.round(t[5]);
      if (t[6] != null) t[6] = Math.round(t[6]);
      return t;
    })
    .sort((p, q) => q[5] - p[5]);
  return { ...r, teams, live: { series: added.length, games: added.reduce((n, x) => n + x.wa + x.wb, 0) } };
}

/** Riot's finished series of the last few days, with both teams' stats pages. */
async function recentResults(since: number): Promise<LiveResult[]> {
  const [schedule, index] = await Promise.all([recentSchedule(), loadHubIndex()]);
  const out: LiveResult[] = [];
  for (const m of schedule) {
    const t = Date.parse(m.startTimeUtc);
    if (m.state !== "completed" || !(t >= since) || m.team1Score === m.team2Score) continue;
    const a = findHubTeam(index, m.team1Name, m.team1Code);
    const b = findHubTeam(index, m.team2Name, m.team2Code);
    if (!a || !b || a === b) continue;
    out.push({ date: dayOf(t), a, b, wa: m.team1Score, wb: m.team2Score, intl: INTL_LEAGUES.has(m.leagueSlug) });
  }
  return out;
}

/** The build's ratings plus the results it doesn't have yet (the build's own ratings if Riot can't be reached). */
export async function withLiveResults(r: HubRatings): Promise<HubRatings> {
  if (!r.rated) return r;
  try {
    const since = Date.parse(`${r.asof}T00:00:00Z`) - 3 * DAY;
    return applyResults(r, await recentResults(since));
  } catch {
    return r;
  }
}

/** A team's rating with the newest results (falls back to the one on its own page). */
export const liveRating = (ratings: HubRatings | null | undefined, slug: string, fallback: number) =>
  ratings?.teams.find((t) => t[0] === slug)?.[5] ?? fallback;
