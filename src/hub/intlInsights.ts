/**
 * More facts for the Worlds / MSI / First Stand pages, from the events' lines files: upsets (by each game's pre-game
 * chance), comebacks (gold behind at 15), the Swiss stage records, finals and finalists, players' titles, each year's
 * champion picks, blue side and game length by year, Play-In and underdog runs, how the host region did, and debuts.
 * Everything takes the files on show with each one's edition ("Worlds 2025") and stage page.
 */
import type { EventLines } from "./worldsFacts";
import { seriesChance } from "./winChance";

export interface FileRef {
  f: EventLines;
  /** the edition, "Worlds 2025" */
  year: string;
  /** the stage's page, "worlds-2025-play-in" */
  stage: string;
}

/** The edition's year: "Worlds 2025" -> 2025, and the first three Worlds ("Worlds Season 1") -> 2011 to 2013. */
export const editionYear = (label: string) => {
  const y = /\d{4}/.exec(label)?.[0];
  if (y) return Number(y);
  const s = /Season (\d+)/.exec(label)?.[1];
  return s ? 2010 + Number(s) : 0;
};
const yearNum = editionYear;
const placeNum = (p: string | undefined) => Number(/^\d+/.exec(p || "")?.[0] || NaN);
const MERGE: Record<string, string> = { EU: "EMEA", LMS: "PCS", LAN: "LAT", LAS: "LAT" };
export const regionOf = (f: EventLines, u: string) => (f.rg?.[u] ? MERGE[f.rg[u]] || f.rg[u] : null);

/** A game with its series: both teams (then names), the winner, a's pre-game chance and gold lead at 15. */
interface GameView {
  ref: FileRef;
  series: string;
  stage: string;
  date: string;
  n: number;
  a: { n: string; u: string; c: string };
  b: { n: string; u: string; c: string };
  bo: number;
  /** 1 = a won, 2 = b won */
  w: number;
  aBlue: boolean;
  min: number | null;
  ka: number | null;
  kb: number | null;
  /** a's pre-game chance in % */
  pa: number | null;
  /** a's gold lead at 15 */
  g15: number | null;
}

const isPlayIn = (ref: FileRef) => /play-in/i.test(ref.stage);
/** The stage as fans say it: the Play-In's own rounds are "Play-In Round 1", not the Swiss stage's "Round 1". */
const stageLabel = (ref: FileRef, stage: string) => (isPlayIn(ref) && !/play-in/i.test(stage) ? `Play-In ${stage}` : stage);

export function gamesOfFiles(files: FileRef[]): GameView[] {
  const out: GameView[] = [];
  for (const ref of files) {
    for (const g of ref.f.g) {
      const s = ref.f.s[g[0]];
      if (!s || (g[3] !== 1 && g[3] !== 2)) continue;
      out.push({
        ref,
        series: s[0],
        stage: stageLabel(ref, s[1]),
        date: s[2],
        n: g[1],
        a: { n: s[3], u: s[4], c: s[5] },
        b: { n: s[6], u: s[7], c: s[8] },
        bo: s[11],
        w: g[3],
        aBlue: g[2] === 1,
        min: g[4],
        ka: g[7],
        kb: g[8],
        pa: g[11] ?? null,
        g15: g[12] ?? null,
      });
    }
  }
  return out;
}

export interface Upset {
  year: string;
  stage: string;
  winner: string;
  winnerU: string;
  loser: string;
  /** the winner's chance before it, in % */
  chance: number;
  series: string;
  n?: number;
  score?: string;
}

/** The biggest upsets: games won by the team given the smallest chance, and series the same way (best of 3 and 5). */
export function upsets(files: FileRef[], top = 10): { games: Upset[]; series: Upset[] } {
  const gs = gamesOfFiles(files).filter((g) => g.pa != null);
  const games = gs
    .map((g) => {
      const aWon = g.w === 1;
      return {
        year: g.ref.year, stage: g.stage, winner: aWon ? g.a.n : g.b.n, winnerU: aWon ? g.a.u : g.b.u, loser: aWon ? g.b.n : g.a.n,
        chance: aWon ? g.pa! : 100 - g.pa!, series: g.series, n: g.n,
      };
    })
    .sort((x, y) => x.chance - y.chance)
    .slice(0, top);
  // a series: its first game's chance turned into a chance to win the best-of
  const bySeries = new Map<string, GameView[]>();
  for (const g of gs) if (g.bo > 1) bySeries.set(g.series, [...(bySeries.get(g.series) || []), g]);
  const series: Upset[] = [];
  for (const [slug, list] of bySeries) {
    const first = [...list].sort((x, y) => x.n - y.n)[0];
    const s = first.ref.f.s.find((r) => r[0] === slug);
    if (!s || s[9] == null || s[10] == null || s[9] === s[10]) continue;
    const pA = seriesChance(first.pa! / 100, first.bo) * 100;
    const aWon = s[9] > s[10];
    series.push({
      year: first.ref.year, stage: first.stage, winner: aWon ? s[3] : s[6], winnerU: aWon ? s[4] : s[7], loser: aWon ? s[6] : s[3],
      chance: Math.round(aWon ? pA : 100 - pA), series: slug, score: `${Math.max(s[9], s[10])}-${Math.min(s[9], s[10])}`,
    });
  }
  series.sort((x, y) => x.chance - y.chance);
  return { games, series: series.slice(0, top) };
}

export interface Comeback {
  year: string;
  stage: string;
  winner: string;
  winnerU: string;
  loser: string;
  /** gold behind at 15 */
  behind: number;
  series: string;
  n: number;
}

/** Games won from furthest behind in gold at 15 minutes (games Oracle's Elixir has). */
export function comebacks(files: FileRef[], top = 10): Comeback[] {
  return gamesOfFiles(files)
    .filter((g) => g.g15 != null)
    .map((g) => {
      const aWon = g.w === 1;
      const lead = aWon ? g.g15! : -g.g15!;
      return { year: g.ref.year, stage: g.stage, winner: aWon ? g.a.n : g.b.n, winnerU: aWon ? g.a.u : g.b.u, loser: aWon ? g.b.n : g.a.n, behind: -lead, series: g.series, n: g.n };
    })
    .filter((x) => x.behind > 0)
    .sort((x, y) => y.behind - x.behind)
    .slice(0, top);
}

export interface SwissRun {
  year: string;
  team: string;
  u: string;
  wins: number;
  losses: number;
  /** W / L in order */
  path: string;
}

/** Every team's Swiss stage (Round 1 to 5 series, 2023 on): its record and the order of its wins and losses. */
export function swissRuns(files: FileRef[]): SwissRun[] {
  const runs = new Map<string, SwissRun & { dates: [string, boolean][] }>();
  for (const ref of files) {
    for (const s of ref.f.s) {
      // the Swiss stage (Worlds from 2023); earlier events and the Play-In also have "Round" stages
      if (editionYear(ref.year) < 2023 || isPlayIn(ref) || !/^Round [1-5]$/.test(s[1]) || s[9] == null || s[10] == null || s[9] === s[10]) continue;
      for (const [u, n, won] of [[s[4], s[3], s[9] > s[10]], [s[7], s[6], s[10] > s[9]]] as [string, string, boolean][]) {
        const key = `${ref.year}|${u}`;
        const r = runs.get(key) || { year: ref.year, team: n, u, wins: 0, losses: 0, path: "", dates: [] };
        r.dates.push([s[2], won]);
        runs.set(key, r);
      }
    }
  }
  return [...runs.values()].map(({ dates, ...r }) => {
    const ordered = dates.sort((x, y) => x[0].localeCompare(y[0]));
    return { ...r, wins: ordered.filter((d) => d[1]).length, losses: ordered.filter((d) => !d[1]).length, path: ordered.map((d) => (d[1] ? "W" : "L")).join("") };
  });
}

export interface Final {
  year: string;
  winner: string;
  winnerU: string;
  loser: string;
  loserU: string;
  score: string;
  series: string;
}

/** Each edition's final: the series between its 1st and 2nd placed teams (the latest one, for a rematch). */
export function finals(files: FileRef[]): Final[] {
  const byYear = new Map<string, FileRef[]>();
  for (const r of files) byYear.set(r.year, [...(byYear.get(r.year) || []), r]);
  const out: Final[] = [];
  for (const [year, refs] of byYear) {
    const pl = Object.assign({}, ...refs.map((r) => r.f.pl || {})) as Record<string, string>;
    const first = Object.keys(pl).find((u) => pl[u] === "1");
    const second = Object.keys(pl).find((u) => pl[u] === "2");
    if (!first || !second) continue;
    const s = refs
      .flatMap((r) => r.f.s)
      .filter((x) => (x[4] === first && x[7] === second) || (x[4] === second && x[7] === first))
      .sort((x, y) => y[2].localeCompare(x[2]))[0];
    if (!s || s[9] == null || s[10] == null) continue;
    const aWon = s[4] === first;
    out.push({
      year, winner: aWon ? s[3] : s[6], winnerU: first, loser: aWon ? s[6] : s[3], loserU: second,
      score: `${Math.max(s[9], s[10])}-${Math.min(s[9], s[10])}`, series: s[0],
    });
  }
  return out.sort((x, y) => yearNum(y.year) - yearNum(x.year));
}

/** Finals between the same two organisations more than once, and the organisations that lost the most finals. */
export function finalsRecords(fs: Final[]) {
  const pairs = new Map<string, Final[]>();
  for (const f of fs) {
    const key = [f.winnerU, f.loserU].sort().join("|");
    pairs.set(key, [...(pairs.get(key) || []), f]);
  }
  const repeats = [...pairs.values()].filter((l) => l.length > 1).sort((x, y) => y.length - x.length);
  const lost = new Map<string, { name: string; u: string; n: number; years: string[] }>();
  const reached = new Map<string, { name: string; u: string; n: number; won: number }>();
  for (const f of fs) {
    const l = lost.get(f.loserU) || { name: f.loser, u: f.loserU, n: 0, years: [] };
    l.n++;
    l.years.push(f.year);
    lost.set(f.loserU, l);
    for (const [u, name, won] of [[f.winnerU, f.winner, 1], [f.loserU, f.loser, 0]] as [string, string, number][]) {
      const r = reached.get(u) || { name, u, n: 0, won: 0 };
      r.n++;
      r.won += won;
      reached.set(u, r);
    }
  }
  return {
    repeats,
    mostLost: [...lost.values()].sort((x, y) => y.n - x.n).filter((x) => x.n > 1),
    mostReached: [...reached.values()].sort((x, y) => y.n - x.n || y.won - x.won),
  };
}

/** Players with the most titles and finals: everyone who played a game for the winning (or losing) finalist that year. */
export function playerTitles(files: FileRef[]) {
  const byYear = new Map<string, FileRef[]>();
  for (const r of files) byYear.set(r.year, [...(byYear.get(r.year) || []), r]);
  const players = new Map<string, { name: string; u: string | null; titles: string[]; finals: number }>();
  for (const [year, refs] of byYear) {
    const pl = Object.assign({}, ...refs.map((r) => r.f.pl || {})) as Record<string, string>;
    const seen = new Set<string>();
    for (const ref of refs) {
      for (const p of ref.f.p) {
        const g = ref.f.g[p[0]];
        const s = g && ref.f.s[g[0]];
        if (!s) continue;
        const team = p[1] === 0 ? s[4] : s[7];
        const place = pl[team];
        if (place !== "1" && place !== "2") continue;
        const key = p[3] || p[2];
        if (seen.has(key)) continue;
        seen.add(key);
        const x = players.get(key) || { name: p[2], u: p[3], titles: [], finals: 0 };
        x.name = p[2];
        x.finals++;
        if (place === "1") x.titles.push(year);
        players.set(key, x);
      }
    }
  }
  return [...players.values()].filter((x) => x.titles.length).sort((a, b) => b.titles.length - a.titles.length || b.finals - a.finals || a.name.localeCompare(b.name));
}

export interface YearLine {
  year: string;
  games: number;
  /** blue side wins in % */
  blue: number | null;
  /** average game length in minutes */
  min: number | null;
  kills: number | null;
  /** most picked champion: [champion, games, wins] */
  top: [string, number, number] | null;
  /** best win rate with enough games: [champion, games, wins] */
  best: [string, number, number] | null;
  /** teams and players at their first edition */
  newTeams: number;
  newPlayers: number;
}

/** One line per edition: games, blue side wins, length, kills, its champions, and how many teams and players debuted. */
export function yearLines(files: FileRef[]): YearLine[] {
  const byYear = new Map<string, FileRef[]>();
  for (const r of files) byYear.set(r.year, [...(byYear.get(r.year) || []), r]);
  const years = [...byYear.keys()].sort((x, y) => yearNum(x) - yearNum(y));
  const seenTeams = new Set<string>();
  const seenPlayers = new Set<string>();
  const out: YearLine[] = [];
  for (const year of years) {
    const refs = byYear.get(year)!;
    const gs = gamesOfFiles(refs);
    const timed = gs.filter((g) => g.min);
    const killed = gs.filter((g) => g.ka != null && g.kb != null);
    const picks = new Map<string, [number, number]>();
    const teams = new Set<string>();
    const playersNow = new Set<string>();
    for (const ref of refs) {
      for (const s of ref.f.s) (teams.add(s[4]), teams.add(s[7]));
      for (const p of ref.f.p) {
        const g = ref.f.g[p[0]];
        if (!g) continue;
        playersNow.add(p[3] || p[2]);
        const won = (g[3] === 1) === (p[1] === 0);
        const x = picks.get(p[5]) || [0, 0];
        x[0]++;
        if (won) x[1]++;
        picks.set(p[5], x);
      }
    }
    const list = [...picks.entries()].map(([c, [n, w]]) => [c, n, w] as [string, number, number]);
    const top = list.sort((a, b) => b[1] - a[1])[0] || null;
    const most = top ? top[1] : 0;
    const enough = Math.max(5, Math.round(most / 3));
    const best = list.filter((x) => x[1] >= enough).sort((a, b) => b[2] / b[1] - a[2] / a[1] || b[1] - a[1])[0] || null;
    out.push({
      year,
      games: gs.length,
      blue: gs.length ? Math.round((gs.filter((g) => (g.w === 1) === g.aBlue).length / gs.length) * 100) : null,
      min: timed.length ? timed.reduce((t, g) => t + g.min!, 0) / timed.length : null,
      kills: killed.length ? Math.round((killed.reduce((t, g) => t + g.ka! + g.kb!, 0) / killed.length) * 10) / 10 : null,
      top,
      best,
      newTeams: [...teams].filter((u) => u && !seenTeams.has(u)).length,
      newPlayers: [...playersNow].filter((p) => !seenPlayers.has(p)).length,
    });
    for (const u of teams) seenTeams.add(u);
    for (const p of playersNow) seenPlayers.add(p);
  }
  return out.reverse();
}

export interface Run {
  year: string;
  team: string;
  u: string;
  place: string;
  /** average pre-game chance in %, when known */
  chance: number | null;
  /** came through the Play-In */
  playIn: boolean;
  /** first edition for this organisation */
  debut: boolean;
}

/** Every team's run: its place, its average pre-game chance, whether it came through the Play-In, whether it debuted. */
export function runs(files: FileRef[]): Run[] {
  const byYear = new Map<string, FileRef[]>();
  for (const r of files) byYear.set(r.year, [...(byYear.get(r.year) || []), r]);
  const years = [...byYear.keys()].sort((x, y) => yearNum(x) - yearNum(y));
  const seen = new Set<string>();
  const out: Run[] = [];
  for (const year of years) {
    const refs = byYear.get(year)!;
    const pl = Object.assign({}, ...refs.map((r) => r.f.pl || {})) as Record<string, string>;
    const names = new Map<string, string>();
    const playIn = new Set<string>();
    for (const ref of refs)
      for (const s of ref.f.s) {
        names.set(s[4], s[3]);
        names.set(s[7], s[6]);
        if (/play-in/i.test(ref.stage) || /play-in/i.test(s[1])) (playIn.add(s[4]), playIn.add(s[7]));
      }
    const chance = new Map<string, number[]>();
    for (const g of gamesOfFiles(refs)) {
      if (g.pa == null) continue;
      chance.set(g.a.u, [...(chance.get(g.a.u) || []), g.pa]);
      chance.set(g.b.u, [...(chance.get(g.b.u) || []), 100 - g.pa]);
    }
    for (const [u, name] of names) {
      if (!u) continue;
      const cs = chance.get(u);
      out.push({
        year, team: name, u, place: pl[u] || "", chance: cs?.length ? Math.round(cs.reduce((a, b) => a + b, 0) / cs.length) : null,
        playIn: playIn.has(u), debut: !seen.has(u),
      });
    }
    for (const u of names.keys()) seen.add(u);
  }
  return out;
}

const byPlace = (a: Run, b: Run) => placeNum(a.place) - placeNum(b.place) || (a.chance ?? 50) - (b.chance ?? 50);
/** The furthest runs from the Play-In, the best finishes by the least-fancied teams, and the best debuts. */
export function cinderella(rs: Run[], top = 10) {
  const placed = rs.filter((r) => !Number.isNaN(placeNum(r.place)));
  return {
    playIn: placed.filter((r) => r.playIn && placeNum(r.place) <= 8).sort(byPlace).slice(0, top),
    underdogs: placed.filter((r) => r.chance != null && r.chance < 50 && placeNum(r.place) <= 4).sort((a, b) => (a.chance ?? 0) - (b.chance ?? 0)).slice(0, top),
    debuts: placed.filter((r) => r.debut && placeNum(r.place) <= 8).sort(byPlace).slice(0, top),
  };
}

/** Host country -> region (as the region table names them). */
const HOST_REGION: Record<string, string> = {
  "South Korea": "KR", Korea: "KR", China: "CN", "United States": "NA", USA: "NA", Canada: "NA", Brazil: "BR", Vietnam: "VN",
  Taiwan: "PCS", Japan: "JP", Turkey: "TR", Mexico: "LAT", Germany: "EMEA", France: "EMEA", Spain: "EMEA", "United Kingdom": "EMEA",
  UK: "EMEA", England: "EMEA", Iceland: "EMEA", Sweden: "EMEA", Netherlands: "EMEA", Belgium: "EMEA", Poland: "EMEA", Europe: "EMEA",
  "Saudi Arabia": "EMEA",
};

/** Editions Leaguepedia files under one country though most of it was elsewhere (as the search summaries say). */
const HOST_FIX: Record<string, string> = { "worlds-2022": "United States", "worlds-2024": "Europe", "msi-2019": "Taiwan, Vietnam" };
const hostFix = (refs: FileRef[]) => Object.entries(HOST_FIX).find(([page]) => refs.some((r) => r.stage.startsWith(page)))?.[1];

/** Each edition's host and how the host region's best team did. */
export function hosts(files: FileRef[]) {
  const byYear = new Map<string, FileRef[]>();
  for (const r of files) byYear.set(r.year, [...(byYear.get(r.year) || []), r]);
  const out: { year: string; country: string; region: string | null; best: number | null; team: string | null }[] = [];
  for (const [year, refs] of byYear) {
    // only finished editions (one with a winner)
    if (!refs.some((r) => Object.values(r.f.pl || {}).includes("1"))) continue;
    const country = hostFix(refs) || refs.map((r) => r.f.host).find(Boolean);
    if (!country) continue;
    const region = HOST_REGION[country] || (country.split(/,\s*/).map((c) => HOST_REGION[c]).find(Boolean) ?? null);
    let best: number | null = null;
    let team: string | null = null;
    if (region)
      for (const ref of refs)
        for (const [u, p] of Object.entries(ref.f.pl || {})) {
          if (regionOf(ref.f, u) !== region) continue;
          const n = placeNum(p);
          if (!Number.isNaN(n) && (best == null || n < best)) {
            best = n;
            team = ref.f.s.find((s) => s[4] === u)?.[3] || ref.f.s.find((s) => s[7] === u)?.[6] || u;
          }
        }
    out.push({ year, country, region, best, team });
  }
  return out.sort((x, y) => yearNum(y.year) - yearNum(x.year));
}
