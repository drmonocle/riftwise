/**
 * A Swiss stage being played right now (Worlds), from Riot's schedule alone: the 16 teams, each one's record so far,
 * and its chance to make the top 8, playing out the rest of the stage and the knockouts with the Worlds picker's
 * simulation (worlds.ts: power ratings for the chances, 3 wins go through, 3 losses go home). Light enough for the
 * Live tab: the team list and ratings, no event files.
 */
import type { Match } from "../types";
import { findHubTeam, loadHubIndexQuick, loadRatings } from "./data";
import { simulate, withLive, type LiveResult, type WTeam } from "./worlds";

export interface SwissRow {
  u: string;
  code: string;
  name: string;
  w: number;
  l: number;
  /** share of the simulated runs in which the team made the top 8 */
  adv: number;
}

export interface SwissNow {
  rows: SwissRow[];
  /** series played so far and in the stage (33 for 16 teams: 8 + 8 + 8 + 6 + 3) */
  played: number;
  total: number;
  runs: number;
}

const RUNS = 2000;

export async function swissNow(schedule: Match[], leagueSlug = "worlds", year = String(new Date().getFullYear())): Promise<SwissNow | null> {
  const swiss = schedule
    .filter((m) => m.leagueSlug === leagueSlug && /swiss/i.test(m.blockName) && m.startTimeUtc.startsWith(year))
    .sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
  const names = new Map<string, string>();
  for (const m of swiss)
    for (const [c, n] of [
      [m.team1Code, m.team1Name],
      [m.team2Code, m.team2Name],
    ])
      if (c && c.toUpperCase() !== "TBD") names.set(c, n);
  if (names.size !== 16) return null;
  const [index, ratings] = await Promise.all([loadHubIndexQuick(), loadRatings()]);
  const teams: WTeam[] = [...names].map(([code, name]) => {
    const slug = findHubTeam(index, name, code);
    const row = slug ? ratings.teams.find((r) => r[0] === slug) : undefined;
    return { u: code, n: name, c: code, r: row?.[5] ?? 1500, league: row?.[3] || "" };
  });
  const live: LiveResult[] = swiss
    .filter((m) => names.has(m.team1Code) && names.has(m.team2Code))
    .map((m) => {
      const done = m.state === "completed" && m.team1Score !== m.team2Score;
      return {
        a: m.team1Code,
        b: m.team2Code,
        w: done ? (m.team1Score > m.team2Score ? 1 : 2) : 0,
        sa: done ? m.team1Score : undefined,
        sb: done ? m.team2Score : undefined,
        bo: m.bestOf || 1,
        block: m.blockName,
        date: m.startTimeUtc,
      };
    });
  const real = withLive([], live);
  const rec = new Map(teams.map((t) => [t.u, { w: 0, l: 0 }]));
  for (const s of real) {
    if (!s.w) continue;
    rec.get(s.w === 1 ? s.a : s.b)!.w++;
    rec.get(s.w === 1 ? s.b : s.a)!.l++;
  }
  const odds = simulate(teams, real, [], ratings.adjust, RUNS, {}, 7);
  const rows = teams
    .map((t) => ({ u: t.u, code: t.c, name: t.n, w: rec.get(t.u)!.w, l: rec.get(t.u)!.l, adv: odds[t.u]?.adv ?? 0 }))
    .sort((a, b) => b.w - a.w || a.l - b.l || b.adv - a.adv);
  return { rows, played: real.filter((s) => s.w).length, total: 33, runs: RUNS };
}
