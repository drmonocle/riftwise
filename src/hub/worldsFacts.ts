/**
 * Headline facts for an event, worked out from every game's scoreboard (the stats build's lines/<event>.json):
 * who leads in kills / deaths / KDA, champions that keep losing or winning, the biggest single games and series,
 * damage shares, games lost without a tower. Each fact is a short list that reads well copied as text.
 */
import { tl } from "../i18n";
import { champName } from "../champions";

/** lines/<event>.json */
export interface EventLines {
  /** [series page, stage, date, team a, page, code, team b, page, code, wins a, wins b, best of] */
  s: [string, string, string, string, string, string, string, string, string, number | null, number | null, number][];
  /** [series, game, a on blue, winner (1 a, 2 b, 0), minutes, towers a, towers b, kills a, kills b, gold a, gold b] */
  g: [number, number, number, number, number | null, number | null, number | null, number | null, number | null, number | null, number | null][];
  /** [game, side (0 a, 1 b), player, page, role, champion, kills, deaths, assists, cs, damage] */
  p: [number, number, string, string | null, string | null, string, number | null, number | null, number | null, number | null, number | null][];
}

export interface FactRow {
  label: string;
  value: string;
  sub?: string;
  player?: string | null;
  team?: string | null;
  champ?: string;
  match?: { slug: string; game?: number };
}
export interface Fact {
  id: string;
  title: string;
  headline: string;
  rows: FactRow[];
  note?: string;
}

interface Game {
  /** which event it was at ("Worlds 2016"), for lists over several years */
  label?: string;
  series: string;
  stage: string;
  date: string;
  n: number;
  w: number;
  min: number | null;
  team: [Side, Side];
}
interface Side {
  name: string;
  u: string;
  c: string;
  towers: number | null;
  kills: number | null;
  players: Line[];
}
interface Line {
  name: string;
  u: string | null;
  champ: string;
  k: number;
  d: number;
  a: number;
  dmg: number | null;
}

/** All the events' games in one list (several stages, or several years with `labels`: the event of each file). */
export function gamesOf(files: (EventLines | null)[], labels: (string | undefined)[] = []): Game[] {
  const out: Game[] = [];
  files.forEach((f, fi) => {
    if (!f) return;
    const games: Game[] = f.g.map((g) => {
      const s = f.s[g[0]];
      return {
        label: labels[fi],
        series: s[0], stage: s[1], date: s[2], n: g[1], w: g[3], min: g[4],
        team: [
          { name: s[3], u: s[4], c: s[5], towers: g[5], kills: g[7], players: [] },
          { name: s[6], u: s[7], c: s[8], towers: g[6], kills: g[8], players: [] },
        ],
      };
    });
    for (const p of f.p) {
      const g = games[p[0]];
      if (g) g.team[p[1] ? 1 : 0].players.push({ name: p[2], u: p[3], champ: p[5], k: p[6] || 0, d: p[7] || 0, a: p[8] || 0, dmg: p[10] });
    }
    out.push(...games);
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
}

const kdaOf = (k: number, d: number, a: number) => (k + a) / Math.max(1, d);
const kdaText = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const line = (k: number, d: number, a: number) => `${k}/${d}/${a}`;


export function eventFacts(games: Game[], event: string): Fact[] {
  const played = games.filter((g) => g.w === 1 || g.w === 2);
  if (!played.length) return [];
  const facts: Fact[] = [];
  // over several years: say which event a game was at, and add the all-time lists
  const allTime = new Set(played.map((g) => g.label)).size > 1;
  const at = (g: Game) => (allTime && g.label ? `${g.label} · ` : "");
  // "KC Caliste" for one event; over many years a player has had several teams, so just the name
  const who = (code: string, name: string) => (code && !allTime ? `${code} ${name}` : name);

  // players over the event
  type P = { name: string; u: string | null; c: string; t: string; g: number; k: number; d: number; a: number; ev: Set<string> };
  const players = new Map<string, P>();
  for (const g of played)
    for (const side of g.team)
      for (const l of side.players) {
        const key = l.u || `${side.u}:${l.name}`;
        const p = players.get(key) || { name: l.name, u: l.u, c: side.c, t: side.u, g: 0, k: 0, d: 0, a: 0, ev: new Set<string>() };
        p.g++;
        if (g.label) p.ev.add(g.label);
        p.k += l.k;
        p.d += l.d;
        p.a += l.a;
        p.c = side.c;
        p.t = side.u;
        players.set(key, p);
      }
  const plist = [...players.values()];
  const top = <T,>(xs: T[], by: (x: T) => number, n = 5) => xs.slice().sort((x, y) => by(y) - by(x)).slice(0, n);

  const kills = top(plist, (p) => p.k * 1000 - p.g);
  if (kills.length)
    facts.push({
      id: "kills", title: tl("Most kills"),
      headline: tl("{who} has the most kills at {event}: {n}", { who: who(kills[0].c, kills[0].name), event, n: kills[0].k }),
      rows: kills.map((p) => ({ label: who(p.c, p.name), player: p.u, team: p.t, value: String(p.k), sub: tl("{n} games", { n: p.g }) })),
    });
  const deaths = top(plist, (p) => p.d * 1000 - p.g);
  if (deaths.length)
    facts.push({
      id: "deaths", title: tl("Most deaths"),
      headline: tl("{who} has died the most at {event}: {n}", { who: who(deaths[0].c, deaths[0].name), event, n: deaths[0].d }),
      rows: deaths.map((p) => ({ label: who(p.c, p.name), player: p.u, team: p.t, value: String(p.d), sub: tl("{n} games", { n: p.g }) })),
    });
  if (allTime) {
    const games_ = top(plist, (p) => p.g * 1000 + p.ev.size);
    facts.push({
      id: "games-played", title: tl("Most games played"),
      headline: tl("{who} has played the most games at {event}: {n}", { who: games_[0].name, event, n: games_[0].g }),
      rows: games_.map((p) => ({ label: p.name, player: p.u, value: String(p.g), sub: tl("{n} events", { n: p.ev.size }) })),
    });
    const apps = top(plist, (p) => p.ev.size * 10000 + p.g);
    facts.push({
      id: "appearances", title: tl("Most appearances"),
      headline: tl("{who} has played at {n} editions of {event}", { who: apps[0].name, n: apps[0].ev.size, event }),
      rows: apps.map((p) => ({ label: p.name, player: p.u, value: String(p.ev.size), sub: tl("{n} games", { n: p.g }) })),
    });
  }
  const most = Math.max(...plist.map((p) => p.g));
  const minG = allTime ? Math.min(20, Math.max(2, Math.ceil(most * 0.4))) : Math.max(2, Math.ceil(most * 0.4));
  const kda = top(plist.filter((p) => p.g >= minG), (p) => kdaOf(p.k, p.d, p.a));
  if (kda.length)
    facts.push({
      id: "kda", title: tl("Best KDA"),
      headline: tl("{who} has the best KDA at {event}: {v} ({line})", { who: who(kda[0].c, kda[0].name), event, v: kdaText(kdaOf(kda[0].k, kda[0].d, kda[0].a)), line: line(kda[0].k, kda[0].d, kda[0].a) }),
      rows: kda.map((p) => ({ label: who(p.c, p.name), player: p.u, team: p.t, value: kdaText(kdaOf(p.k, p.d, p.a)), sub: line(p.k, p.d, p.a) })),
      note: tl("Players with at least {n} games.", { n: minG }),
    });

  // champions
  const champs = new Map<string, { w: number; g: number }>();
  for (const g of played)
    g.team.forEach((side, i) => {
      const won = g.w === i + 1;
      for (const l of side.players) {
        const c = champs.get(l.champ) || { w: 0, g: 0 };
        c.g++;
        if (won) c.w++;
        champs.set(l.champ, c);
      }
    });
  // at least 3 games, more over many years (1 in every 100 games played)
  const minC = Math.max(3, Math.round(played.length / 100));
  const clist = [...champs.entries()].filter(([c, x]) => c && x.g >= minC).map(([c, x]) => ({ c, ...x, rate: x.w / x.g }));
  const rec = (x: { w: number; g: number }) => `${x.w}-${x.g - x.w} (${Math.round((x.w / x.g) * 100)}%)`;
  const worst = clist.filter((x) => x.rate <= 0.35).sort((a, b) => a.rate - b.rate || b.g - a.g).slice(0, 5);
  if (worst.length) {
    const w0 = worst[0];
    facts.push({
      id: "champ-worst", title: tl("Champions that keep losing"),
      headline: w0.w === 0
        ? tl("{champ} has lost all {n} of its games at {event}", { champ: champName(w0.c), n: w0.g, event })
        : tl("{champ} is {rec} at {event}", { champ: champName(w0.c), rec: rec(w0), event }),
      rows: worst.map((x) => ({ label: champName(x.c), champ: x.c, value: rec(x) })),
      note: tl("Champions with at least {n} games.", { n: minC }),
    });
  }
  const best = clist.filter((x) => x.rate >= 0.65).sort((a, b) => b.rate - a.rate || b.g - a.g).slice(0, 5);
  if (best.length) {
    const b0 = best[0];
    facts.push({
      id: "champ-best", title: tl("Champions that keep winning"),
      headline: b0.w === b0.g
        ? tl("{champ} has won all {n} of its games at {event}", { champ: champName(b0.c), n: b0.g, event })
        : tl("{champ} is {rec} at {event}", { champ: champName(b0.c), rec: rec(b0), event }),
      rows: best.map((x) => ({ label: champName(x.c), champ: x.c, value: rec(x) })),
      note: tl("Champions with at least {n} games.", { n: minC }),
    });
  }

  // single games
  type One = { l: Line; side: Side; opp: Side; g: Game; won: boolean };
  const ones: One[] = [];
  for (const g of played)
    g.team.forEach((side, i) => {
      for (const l of side.players) ones.push({ l, side, opp: g.team[1 - i], g, won: g.w === i + 1 });
    });
  const gameSub = (o: One) => at(o.g) + tl("Game {n} vs {opp}", { n: o.g.n, opp: o.opp.c || o.opp.name });
  const big = top(ones, (o) => o.l.k * 100 + kdaOf(o.l.k, o.l.d, o.l.a));
  if (big.length) {
    const o = big[0];
    facts.push({
      id: "games", title: tl("Biggest single games"),
      headline: tl("{who} went {line} on {champ} in Game {n} vs {opp}", { who: who(o.side.c, o.l.name), line: line(o.l.k, o.l.d, o.l.a), champ: champName(o.l.champ), n: o.g.n, opp: o.opp.c || o.opp.name }),
      rows: big.map((o) => ({ label: who(o.side.c, o.l.name), player: o.l.u, champ: o.l.champ, value: line(o.l.k, o.l.d, o.l.a), sub: `${champName(o.l.champ)} · ${gameSub(o)}`, match: { slug: o.g.series, game: o.g.n } })),
    });
  }
  const dmgShare = ones
    .filter((o) => o.l.dmg != null)
    .map((o) => ({ o, share: (o.l.dmg || 0) / Math.max(1, o.side.players.reduce((t, x) => t + (x.dmg || 0), 0)) }));
  const dmg = dmgShare.sort((a, b) => b.share - a.share).slice(0, 5);
  if (dmg.length) {
    const { o, share } = dmg[0];
    facts.push({
      id: "damage", title: tl("Biggest share of a team's damage"),
      headline: tl("{who} dealt {pct} of {team}'s damage on {champ} in Game {n} vs {opp}", { who: who(o.side.c, o.l.name), pct: `${Math.round(share * 100)}%`, team: o.side.c || o.side.name, champ: champName(o.l.champ), n: o.g.n, opp: o.opp.c || o.opp.name }),
      rows: dmg.map(({ o, share }) => ({ label: who(o.side.c, o.l.name), player: o.l.u, champ: o.l.champ, value: `${Math.round(share * 100)}%`, sub: `${champName(o.l.champ)} · ${gameSub(o)}`, match: { slug: o.g.series, game: o.g.n } })),
    });
  }

  // a player's line over a whole series
  type S = { name: string; u: string | null; c: string; side: number; series: string; games: One[] };
  const series = new Map<string, S>();
  for (const o of ones) {
    const i = o.g.team.indexOf(o.side);
    const key = `${o.g.series}:${o.l.u || o.l.name}`;
    const s = series.get(key) || { name: o.l.name, u: o.l.u, c: o.side.c, side: i, series: o.g.series, games: [] };
    s.games.push(o);
    series.set(key, s);
  }
  const multi = [...series.values()].filter((s) => s.games.length >= 2);
  const sum = (s: S) => s.games.reduce((t, o) => [t[0] + o.l.k, t[1] + o.l.d, t[2] + o.l.a], [0, 0, 0]);
  const bestSeries = top(multi, (s) => {
    const [k, d, a] = sum(s);
    return kdaOf(k, d, a) * 10 + k;
  });
  if (bestSeries.length) {
    const s = bestSeries[0];
    const [k, d, a] = sum(s);
    const won = s.games.filter((o) => o.won).length;
    const lost = s.games.length - won;
    const opp = s.games[0].opp.c || s.games[0].opp.name;
    const score = `${won}-${lost}`;
    facts.push({
      id: "series", title: tl("Best lines over a series"),
      headline: won > lost
        ? tl("{who} went a combined {line} in {team}'s {score} win vs {opp}", { who: s.name, line: line(k, d, a), team: s.c, score, opp })
        : tl("{who} went a combined {line} in {team}'s {score} loss vs {opp}", { who: s.name, line: line(k, d, a), team: s.c, score, opp }),
      rows: bestSeries.map((s) => {
        const [k, d, a] = sum(s);
        return {
          label: who(s.c, s.name), player: s.u, value: line(k, d, a), match: { slug: s.series },
          sub: at(s.games[0].g) + s.games.map((o) => tl("G{n}: {line} on {champ}", { n: o.g.n, line: line(o.l.k, o.l.d, o.l.a), champ: champName(o.l.champ) })).join(" · "),
        };
      }),
    });
  }

  // lost without destroying a tower
  const noTower = played.flatMap((g) => g.team.map((side, i) => ({ g, side, opp: g.team[1 - i], lost: g.w !== i + 1 }))).filter((x) => x.lost && x.side.towers === 0);
  if (noTower.length) {
    const x = noTower[0];
    facts.push({
      id: "towers", title: tl("Lost without a tower"),
      headline: tl("{team} lost Game {n} vs {opp} without destroying a single tower", { team: x.side.c || x.side.name, n: x.g.n, opp: x.opp.c || x.opp.name }),
      rows: noTower.slice(0, 5).map((x) => ({ label: x.side.c || x.side.name, team: x.side.u, value: "", sub: at(x.g) + tl("Game {n} vs {opp}", { n: x.g.n, opp: x.opp.c || x.opp.name }), match: { slug: x.g.series, game: x.g.n } })),
      ...(noTower.length > 5 ? { note: tl("{n} games in all.", { n: noTower.length }) } : {}),
    });
  }

  // longest and shortest games
  const timed = played.filter((g) => g.min);
  if (timed.length >= 3) {
    const mmss = (m: number) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;
    const short = timed.slice().sort((a, b) => (a.min || 0) - (b.min || 0)).slice(0, 3);
    const s0 = short[0];
    const wname = (g: Game) => g.team[g.w - 1].c || g.team[g.w - 1].name;
    const lname = (g: Game) => g.team[2 - g.w].c || g.team[2 - g.w].name;
    facts.push({
      id: "fast", title: tl("Fastest wins"),
      headline: tl("{team} beat {opp} in {time}, the fastest win at {event}", { team: wname(s0), opp: lname(s0), time: mmss(s0.min || 0), event }),
      rows: short.map((g) => ({ label: `${wname(g)} vs ${lname(g)}`, value: mmss(g.min || 0), sub: at(g) + tl("Game {n}", { n: g.n }), match: { slug: g.series, game: g.n } })),
    });
  }
  return facts;
}

/** A fact as plain text to paste anywhere: the headline, then the numbered list. */
export function factText(f: Fact, link: string): string {
  const rows = f.rows.map((r, i) => `${i + 1}. ${r.label} - ${r.value}${r.sub && f.id !== "kills" && f.id !== "deaths" ? ` (${r.sub})` : ""}`);
  return [f.headline, "", ...rows, "", `(via RiftWise: ${link})`].join("\n");
}
