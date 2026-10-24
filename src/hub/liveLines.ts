/**
 * The Worlds / MSI / First Stand facts right after each game: the stats build's lines files only get a game once its
 * full stats reach the database (the next morning); until then this makes the same lines from Riot's live stats feed
 * for the event's finished series the files don't have yet (series, games, every player's line), so the facts, the
 * region table and the other panels count today's games too. The build's own lines take over when they arrive.
 */
import type { HubEvent } from "./types";
import type { EventLines } from "./worldsFacts";
import type { Match } from "../types";
import { fetchMatchGames } from "../api";
import { fetchLiveDetails, fetchLiveStart, fetchLiveWindow, type LiveWindow } from "../liveGame";
import { findHubTeam, loadHubIndex, type HubIndex } from "./data";
import { RIOT_PREFIX, recentSchedule } from "./riotMatch";
import { champNameById, ddragonReady } from "./ddragon";

const DAY = 86400_000;
const ROLE: Record<string, string> = { top: "Top", jungle: "Jungle", mid: "Mid", bottom: "Bot", support: "Support" };
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** "GEN Chovy" -> "Chovy" */
const bareName = (n: string) => n.replace(/^\S+\s+/, "") || n;

interface GameLines {
  /** a on blue side, winner (1 a, 2 b), minutes, towers / kills / gold of a and b */
  g: [number, number, number | null, number, number, number, number, number, number];
  /** side (0 a, 1 b), player, player page, role, champion, kills, deaths, assists, cs, damage share x 1000 */
  p: [number, string, string | null, string | null, string, number, number, number, number, number | null][];
  /** how sure the winner is: inhibitors and towers taken (the feed doesn't say who won a game) */
  edge: number;
}

const gameCache = new Map<string, Promise<GameLines | null>>();

/** One finished game from the feed: its first frames (who plays what), its last frames and the players' damage. */
function gameLines(gameId: string, match: Match, index: HubIndex): Promise<GameLines | null> {
  const cached = gameCache.get(gameId);
  if (cached) return cached;
  const p = (async (): Promise<GameLines | null> => {
      const [first, last, det] = await Promise.all([
        fetchLiveStart(gameId),
        // asking well past a finished game's end gives its last frames
        fetchLiveWindow(gameId, Date.now() - 60_000),
        fetchLiveDetails(gameId, Date.now() - 60_000).catch(() => null),
      ]);
      const f = last?.frames?.[last.frames.length - 1];
      const meta = (last || first)?.gameMetadata;
      if (!f || f.gameState !== "finished" || !meta) return null;
      const startMs = Date.parse(first?.frames?.[0]?.rfc460Timestamp || "");
      const min = Number.isFinite(startMs) ? (Date.parse(f.rfc460Timestamp) - startMs) / 60_000 : null;
      const aBlue = match.team1Id ? meta.blueTeamMetadata.esportsTeamId === match.team1Id : true;
      const [A, B] = aBlue ? [f.blueTeam, f.redTeam] : [f.redTeam, f.blueTeam];
      const shares = new Map((det?.frames?.[det.frames.length - 1]?.participants || []).map((x) => [x.participantId, x.championDamageShare]));
      const players: GameLines["p"] = [];
      const add = (side: 0 | 1, w: LiveWindow["gameMetadata"]["blueTeamMetadata"], frame: typeof A) => {
        for (const pm of w.participantMetadata) {
          const pf = frame.participants.find((x) => x.participantId === pm.participantId);
          const name = bareName(pm.summonerName);
          const row = index.players
            .filter((x) => norm(x[0]) === norm(name))
            .sort((x, y) => (y[4] || "").localeCompare(x[4] || "") || y[3] - x[3])[0];
          const share = shares.get(pm.participantId);
          players.push([side, name, row ? row[1] || null : null, ROLE[pm.role] || pm.role, champNameById(pm.championId), pf?.kills ?? 0, pf?.deaths ?? 0, pf?.assists ?? 0, pf?.creepScore ?? 0, share == null ? null : Math.round(share * 1000)]);
        }
      };
      add(0, aBlue ? meta.blueTeamMetadata : meta.redTeamMetadata, A);
      add(1, aBlue ? meta.redTeamMetadata : meta.blueTeamMetadata, B);
      // the feed has no winner: the side that took more inhibitors, then towers, then gold (the series score settles it below)
      const edge = (A.inhibitors - B.inhibitors) * 100 + (A.towers - B.towers) * 10 + Math.sign(A.totalGold - B.totalGold);
      const lines: GameLines = {
        g: [aBlue ? 1 : 0, edge >= 0 ? 1 : 2, min, A.towers, B.towers, A.totalKills, B.totalKills, A.totalGold, B.totalGold],
        p: players,
        edge,
      };
      return lines;
    })().catch(() => null);
  gameCache.set(gameId, p);
  return p;
}

/** Games won per side must match the series score: when they don't, the least sure games change hands. */
function settleWinners(games: GameLines[], wa: number, wb: number) {
  let a = games.filter((g) => g.g[1] === 1).length;
  if (games.length !== wa + wb || a === wa) return;
  const byDoubt = [...games].sort((x, y) => Math.abs(x.edge) - Math.abs(y.edge));
  for (const g of byDoubt) {
    if (a === wa) break;
    if (a > wa && g.g[1] === 1) (g.g[1] = 2), a--;
    else if (a < wa && g.g[1] === 2) (g.g[1] = 1), a++;
  }
}

/**
 * Lines for the event's finished series that `have` (the build's lines files) doesn't cover yet, from Riot's feed.
 * leagueSlug: Riot's league ("worlds", "msi", "first_stand"); main: the event's main stage (team regions); since: the
 * event's first day. Null when there is nothing to add.
 */
export async function liveLines(leagueSlug: string, have: (EventLines | null)[], main: HubEvent | null, since: string): Promise<EventLines | null> {
  const [schedule, index] = await Promise.all([recentSchedule(), loadHubIndex(), ddragonReady()]);
  const start = Date.parse(`${since}T00:00:00Z`) - DAY;
  // series the build already has: the same two teams within a day and a half
  const known = have.flatMap((f) => (f ? f.s.map((s) => ({ t: Date.parse(s[2].replace(" ", "T") + "Z"), k: [s[4], s[7]].sort().join("|") })) : []));
  const out: EventLines = { s: [], g: [], p: [], rg: {}, pl: {} };
  for (const f of have) Object.assign(out.rg!, f?.rg || {});
  for (const r of main?.rosters || []) if (r.u && r.r) out.rg![r.u] = r.r;
  const todo: { m: Match; a: string; b: string }[] = [];
  for (const m of schedule) {
    if (m.leagueSlug !== leagueSlug || m.state !== "completed" || Date.parse(m.startTimeUtc) < start) continue;
    const a = findHubTeam(index, m.team1Name, m.team1Code);
    const b = findHubTeam(index, m.team2Name, m.team2Code);
    if (!a || !b || a === b) continue;
    const t = Date.parse(m.startTimeUtc);
    const k = [a, b].sort().join("|");
    if (known.some((x) => x.k === k && Math.abs(x.t - t) <= 1.5 * DAY)) continue;
    todo.push({ m, a, b });
  }
  if (!todo.length) return null;
  // the series' games, six series at a time (a first visit can have a few dozen to fetch)
  todo.sort((x, y) => x.m.startTimeUtc.localeCompare(y.m.startTimeUtc));
  const fetched: { full: Match | null; done: Match["games"]; got: (GameLines | null)[] }[] = new Array(todo.length);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const i = next++;
      const full = await fetchMatchGames(todo[i].m).catch(() => null);
      const done = (full?.games || []).filter((g) => g.state === "completed").sort((x, y) => x.number - y.number);
      fetched[i] = { full, done, got: full ? await Promise.all(done.map((g) => gameLines(g.id, full, index))) : [] };
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const [i, { m, a, b }] of todo.entries()) {
    const { full, done, got } = fetched[i];
    if (!full) continue;
    // each game with its number (a game the feed has nothing for is left out)
    const numbered = got.map((gl, i) => ({ gl, n: done[i].number })).filter((x): x is { gl: GameLines; n: number } => !!x.gl);
    const games = numbered.map((x) => x.gl);
    if (!games.length) continue;
    settleWinners(games, full.team1Score, full.team2Score);
    const si = out.s.length;
    out.s.push([
      RIOT_PREFIX + m.matchId, m.blockName || "", m.startTimeUtc.slice(0, 16).replace("T", " "),
      m.team1Name, a, m.team1Code, m.team2Name, b, m.team2Code, full.team1Score, full.team2Score, m.bestOf || games.length,
    ]);
    numbered.forEach(({ gl, n }) => {
      const gi = out.g.length;
      out.g.push([si, n, ...gl.g, null, null]);
      for (const p of gl.p) out.p.push([gi, ...p]);
    });
  }
  return out.s.length ? out : null;
}
