/**
 * More of an event's stats, the kind Pick'em and Crystal Ball questions ask about: the event in numbers, team records
 * (kills in a game, kills and deaths per game, objectives, first blood / tower, fastest average win), comebacks and
 * upsets, player records (champion pool, CS, damage and vision per minute, kill participation, assists, pentakills)
 * and the draft (most picked, most banned, flex champions). All worked out from every game's scoreboard (the stats
 * build's lines/<event>.json, plus today's games from Riot on the Worlds / MSI / First Stand pages); a list whose data
 * an older file doesn't have is left out. Every list says how many games it counts.
 */
import { tl, roleName } from "../i18n";
import { champName } from "../champions";
import type { Fact, FactRow, Game, Side } from "./worldsFacts";

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const pctOf = (n: number, of: number) => `${Math.round((n / Math.max(1, of)) * 100)}%`;
const mmss = (m: number) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;
const num = (v: number) => v.toLocaleString();
const top = <T,>(xs: T[], by: (x: T) => number, n = 5) => xs.slice().sort((x, y) => by(y) - by(x)).slice(0, n);

export function moreEventFacts(games: Game[], event: string): Fact[] {
  const played = games.filter((g) => g.w === 1 || g.w === 2);
  if (!played.length) return [];
  const out: Fact[] = [];
  const allTime = new Set(played.map((g) => g.label)).size > 1;
  const at = (g: Game) => (allTime && g.label ? `${g.label} · ` : "");
  const tname = (s: Side) => s.c || s.name;
  const vsText = (g: Game, i: number) => at(g) + tl("Game {n} vs {opp}", { n: g.n, opp: tname(g.team[1 - i]) });
  const sides = played.flatMap((g) => g.team.map((s, i) => ({ g, s, i, opp: g.team[1 - i], won: g.w === i + 1 })));

  // ── teams over the event ────────────────────────────────────────────────
  type T = {
    name: string; c: string; u: string; g: number; w: number; k: number; d: number; mins: number; winMins: number; timedWins: number;
    drag: number; dragG: number; baron: number; baronG: number; fb: number; fbG: number; ft: number; ftG: number;
  };
  const teams = new Map<string, T>();
  for (const { g, s, opp, won } of sides) {
    if (!s.u && !s.name) continue;
    const key = s.u || s.name;
    const t = teams.get(key) || { name: s.name, c: s.c, u: s.u, g: 0, w: 0, k: 0, d: 0, mins: 0, winMins: 0, timedWins: 0, drag: 0, dragG: 0, baron: 0, baronG: 0, fb: 0, fbG: 0, ft: 0, ftG: 0 };
    t.g++;
    if (won) t.w++;
    t.k += s.kills || 0;
    t.d += opp.kills || 0;
    if (g.min) {
      t.mins += g.min;
      if (won) {
        t.winMins += g.min;
        t.timedWins++;
      }
    }
    if (s.drag != null) {
      t.drag += s.drag;
      t.dragG++;
    }
    if (s.baron != null) {
      t.baron += s.baron;
      t.baronG++;
    }
    const i = g.team.indexOf(s);
    if (g.fb != null) {
      t.fbG++;
      if (g.fb === i) t.fb++;
    }
    if (g.ft != null) {
      t.ftG++;
      if (g.ft === i) t.ft++;
    }
    teams.set(key, t);
  }
  const tlist = [...teams.values()];
  const mostG = Math.max(...tlist.map((t) => t.g));
  // per-game lists: teams with at least 40% of the most games any team played (at least 2)
  const minT = Math.max(2, Math.ceil(mostG * 0.4));
  const regular = tlist.filter((t) => t.g >= minT);
  const teamRow = (t: T, value: string, sub: string): FactRow => ({ label: allTime ? t.name : t.c || t.name, team: t.u || null, value, sub });
  const minNote = tl("Teams with at least {n} games.", { n: minT });

  // the event in numbers
  const timed = played.filter((g) => g.min);
  const kills = played.reduce((n, g) => n + (g.team[0].kills || 0) + (g.team[1].kills || 0), 0);
  const champs = new Set(played.flatMap((g) => g.team.flatMap((s) => s.players.map((p) => p.champ))).filter(Boolean));
  const pentas = played.reduce((n, g) => n + g.pentas.reduce((m, p) => m + p.n, 0), 0);
  const withDrag = played.filter((g) => g.team[0].drag != null && g.team[1].drag != null);
  const withBaron = played.filter((g) => g.team[0].baron != null && g.team[1].baron != null);
  const withFb = played.filter((g) => g.fb != null);
  const fbWon = withFb.filter((g) => g.w === (g.fb as number) + 1).length;
  const withFt = played.filter((g) => g.ft != null);
  const ftWon = withFt.filter((g) => g.w === (g.ft as number) + 1).length;
  const totals: FactRow[] = [
    { label: tl("Games"), value: num(played.length) },
    { label: tl("Kills per game"), value: f1(kills / played.length), sub: tl("{n} kills", { n: num(kills) }) },
  ];
  if (timed.length) totals.push({ label: tl("Average game time"), value: mmss(timed.reduce((m, g) => m + (g.min || 0), 0) / timed.length) });
  if (champs.size) totals.push({ label: tl("Different champions picked"), value: String(champs.size) });
  if (withDrag.length) totals.push({ label: tl("Dragons per game"), value: f1(withDrag.reduce((n, g) => n + (g.team[0].drag || 0) + (g.team[1].drag || 0), 0) / withDrag.length) });
  if (withBaron.length) totals.push({ label: tl("Barons per game"), value: f1(withBaron.reduce((n, g) => n + (g.team[0].baron || 0) + (g.team[1].baron || 0), 0) / withBaron.length) });
  if (withFb.length) totals.push({ label: tl("First blood won the game"), value: pctOf(fbWon, withFb.length), sub: tl("{n} of {m} games", { n: fbWon, m: withFb.length }) });
  if (withFt.length) totals.push({ label: tl("First tower won the game"), value: pctOf(ftWon, withFt.length), sub: tl("{n} of {m} games", { n: ftWon, m: withFt.length }) });
  totals.push({ label: tl("Pentakills"), value: String(pentas) });
  const blueWon = played.filter((g) => g.w === g.blue + 1).length;
  totals.push({ label: tl("Blue side won"), value: pctOf(blueWon, played.length), sub: tl("{n} of {m} games", { n: blueWon, m: played.length }) });
  out.push({
    id: "totals", title: tl("The event in numbers"),
    headline: tl("{n} games, {k} kills and {c} different champions at {event}", { n: num(played.length), k: num(kills), c: champs.size, event }),
    rows: totals,
    plain: true,
  });

  // most kills by a team in one game
  const bigGame = top(sides.filter((x) => x.s.kills != null), (x) => (x.s.kills || 0) * 100 - (x.g.min || 0));
  if (bigGame.length) {
    const x = bigGame[0];
    out.push({
      id: "team-game-kills", title: tl("Most kills by a team in one game"),
      headline: tl("{team} got {n} kills in Game {g} vs {opp}", { team: tname(x.s), n: x.s.kills || 0, g: x.g.n, opp: tname(x.opp) }),
      rows: bigGame.map((x) => ({ label: tname(x.s), team: x.s.u || null, value: String(x.s.kills), sub: vsText(x.g, x.i) + (x.won ? "" : ` · ${tl("lost")}`), match: { slug: x.g.series, game: x.g.n } })),
    });
  }
  // kills and deaths per game
  if (regular.length >= 3) {
    const kpg = top(regular, (t) => t.k / t.g);
    out.push({
      id: "team-kpg", title: tl("Most kills per game"),
      headline: tl("{team} averages {v} kills a game at {event}", { team: kpg[0].c || kpg[0].name, v: f1(kpg[0].k / kpg[0].g), event }),
      rows: kpg.map((t) => teamRow(t, f1(t.k / t.g), tl("{k} kills in {n} games", { k: t.k, n: t.g }))),
      note: minNote,
    });
    const dpg = top(regular, (t) => -t.d / t.g);
    out.push({
      id: "team-dpg", title: tl("Fewest deaths per game"),
      headline: tl("{team} dies {v} times a game at {event}, the fewest", { team: dpg[0].c || dpg[0].name, v: f1(dpg[0].d / dpg[0].g), event }),
      rows: dpg.map((t) => teamRow(t, f1(t.d / t.g), tl("{k} deaths in {n} games", { k: t.d, n: t.g }))),
      note: minNote,
    });
    const winners = regular.filter((t) => t.timedWins >= 2);
    if (winners.length >= 3) {
      const fast = top(winners, (t) => -t.winMins / t.timedWins);
      out.push({
        id: "team-fast", title: tl("Fastest average win"),
        headline: tl("{team} wins in {time} on average", { team: fast[0].c || fast[0].name, time: mmss(fast[0].winMins / fast[0].timedWins) }),
        rows: fast.map((t) => teamRow(t, mmss(t.winMins / t.timedWins), tl("{n} wins", { n: t.timedWins }))),
        note: tl("Teams with at least 2 timed wins.", {}),
      });
    }
    const dragTeams = regular.filter((t) => t.dragG >= minT);
    if (dragTeams.length >= 3) {
      const d = top(dragTeams, (t) => t.drag / t.dragG);
      out.push({
        id: "team-dragons", title: tl("Most dragons per game"),
        headline: tl("{team} takes {v} dragons a game", { team: d[0].c || d[0].name, v: f1(d[0].drag / d[0].dragG) }),
        rows: d.map((t) => teamRow(t, f1(t.drag / t.dragG), tl("{k} dragons in {n} games", { k: t.drag, n: t.dragG }))),
        note: minNote,
      });
    }
    const baronTeams = regular.filter((t) => t.baronG >= minT);
    if (baronTeams.length >= 3) {
      const b = top(baronTeams, (t) => t.baron / t.baronG);
      out.push({
        id: "team-barons", title: tl("Most barons per game"),
        headline: tl("{team} takes {v} barons a game", { team: b[0].c || b[0].name, v: f1(b[0].baron / b[0].baronG) }),
        rows: b.map((t) => teamRow(t, f1(t.baron / t.baronG), tl("{k} barons in {n} games", { k: t.baron, n: t.baronG }))),
        note: minNote,
      });
    }
    const fbTeams = regular.filter((t) => t.fbG >= minT);
    if (fbTeams.length >= 3) {
      const b = top(fbTeams, (t) => t.fb / t.fbG + t.fbG / 1e4);
      out.push({
        id: "team-fb", title: tl("First blood rate"),
        headline: tl("{team} draws first blood in {pct} of its games", { team: b[0].c || b[0].name, pct: pctOf(b[0].fb, b[0].fbG) }),
        rows: b.map((t) => teamRow(t, pctOf(t.fb, t.fbG), tl("{n} of {m} games", { n: t.fb, m: t.fbG }))),
        note: minNote,
      });
    }
    const ftTeams = regular.filter((t) => t.ftG >= minT);
    if (ftTeams.length >= 3) {
      const b = top(ftTeams, (t) => t.ft / t.ftG + t.ftG / 1e4);
      out.push({
        id: "team-ft", title: tl("First tower rate"),
        headline: tl("{team} takes the first tower in {pct} of its games", { team: b[0].c || b[0].name, pct: pctOf(b[0].ft, b[0].ftG) }),
        rows: b.map((t) => teamRow(t, pctOf(t.ft, t.ftG), tl("{n} of {m} games", { n: t.ft, m: t.ftG }))),
        note: minNote,
      });
    }
  }

  // comebacks: won after trailing in gold at 15 minutes (the biggest deficits)
  const comebacks = played
    .filter((g) => g.g15 != null && ((g.w === 1 && (g.g15 as number) < 0) || (g.w === 2 && (g.g15 as number) > 0)))
    .map((g) => ({ g, wi: g.w - 1, down: Math.abs(g.g15 as number) }));
  if (comebacks.length) {
    const c = top(comebacks, (x) => x.down);
    const x = c[0];
    out.push({
      id: "comebacks", title: tl("Biggest comebacks"),
      headline: tl("{team} was {gold} gold behind at 15 minutes and still beat {opp}", { team: tname(x.g.team[x.wi]), gold: num(x.down), opp: tname(x.g.team[1 - x.wi]) }),
      rows: c.map((x) => ({ label: tname(x.g.team[x.wi]), team: x.g.team[x.wi].u || null, value: `−${num(x.down)}`, sub: vsText(x.g, x.wi), match: { slug: x.g.series, game: x.g.n } })),
      note: tl("{n} games were won from behind at 15 minutes (gold, Oracle's Elixir).", { n: comebacks.length }),
    });
  }
  // upsets: the winner had the smaller chance before the game (power rankings)
  const upsets = played
    .filter((g) => g.chance != null)
    .map((g) => ({ g, wi: g.w - 1, p: g.w === 1 ? (g.chance as number) : 100 - (g.chance as number) }))
    .filter((x) => x.p < 50);
  if (upsets.length) {
    const u = top(upsets, (x) => -x.p);
    const x = u[0];
    out.push({
      id: "upsets", title: tl("Biggest upsets"),
      headline: tl("{team} beat {opp} with a {pct} chance before the game", { team: tname(x.g.team[x.wi]), opp: tname(x.g.team[1 - x.wi]), pct: `${Math.round(x.p)}%` }),
      rows: u.map((x) => ({ label: tname(x.g.team[x.wi]), team: x.g.team[x.wi].u || null, value: `${Math.round(x.p)}%`, sub: vsText(x.g, x.wi), match: { slug: x.g.series, game: x.g.n } })),
      note: tl("Chance to win the game before it started, from the power rankings. {n} games went to the team with the smaller chance.", { n: upsets.length }),
    });
  }

  // ── players ─────────────────────────────────────────────────────────────
  type P = {
    name: string; u: string | null; c: string; t: string; g: number; k: number; a: number; teamK: number;
    cs: number; csMin: number; dmg: number; dmgMin: number; vis: number; visMin: number; champs: Map<string, number>;
  };
  const players = new Map<string, P>();
  for (const { g, s } of sides)
    for (const l of s.players) {
      const key = l.u || `${s.u}:${l.name}`;
      const p = players.get(key) || { name: l.name, u: l.u, c: s.c, t: s.u, g: 0, k: 0, a: 0, teamK: 0, cs: 0, csMin: 0, dmg: 0, dmgMin: 0, vis: 0, visMin: 0, champs: new Map() };
      p.g++;
      p.k += l.k;
      p.a += l.a;
      p.teamK += s.kills || 0;
      if (g.min && l.cs != null) {
        p.cs += l.cs;
        p.csMin += g.min;
      }
      if (g.min && l.dmg != null) {
        p.dmg += l.dmg;
        p.dmgMin += g.min;
      }
      if (g.min && l.vision != null) {
        p.vis += l.vision;
        p.visMin += g.min;
      }
      if (l.champ) p.champs.set(l.champ, (p.champs.get(l.champ) || 0) + 1);
      p.c = s.c;
      p.t = s.u;
      players.set(key, p);
    }
  const plist = [...players.values()];
  const mostP = Math.max(...plist.map((p) => p.g));
  const minP = Math.max(2, Math.ceil(mostP * 0.4));
  const preg = plist.filter((p) => p.g >= minP);
  const who = (p: P) => (p.c && !allTime ? `${p.c} ${p.name}` : p.name);
  const pRow = (p: P, value: string, sub: string): FactRow => ({ label: who(p), player: p.u, team: p.t || null, value, sub });
  const pNote = tl("Players with at least {n} games.", { n: minP });
  if (preg.length >= 3) {
    const pool = top(preg, (p) => p.champs.size * 1000 - p.g);
    out.push({
      id: "player-pool", title: tl("Most champions played"),
      headline: tl("{who} has played {n} different champions at {event}", { who: who(pool[0]), n: pool[0].champs.size, event }),
      rows: pool.map((p) => pRow(p, String(p.champs.size), [...p.champs.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => champName(c)).join(", "))),
      note: pNote,
    });
    const csP = preg.filter((p) => p.csMin > 0);
    if (csP.length >= 3) {
      const b = top(csP, (p) => p.cs / p.csMin);
      out.push({
        id: "player-csm", title: tl("Best CS per minute"),
        headline: tl("{who} farms {v} CS a minute at {event}", { who: who(b[0]), v: f1(b[0].cs / b[0].csMin), event }),
        rows: b.map((p) => pRow(p, f1(p.cs / p.csMin), tl("{n} games", { n: p.g }))),
        note: pNote,
      });
    }
    const dmP = preg.filter((p) => p.dmgMin > 0);
    if (dmP.length >= 3) {
      const b = top(dmP, (p) => p.dmg / p.dmgMin);
      out.push({
        id: "player-dpm", title: tl("Most damage per minute"),
        headline: tl("{who} deals {v} damage a minute to champions at {event}", { who: who(b[0]), v: num(Math.round(b[0].dmg / b[0].dmgMin)), event }),
        rows: b.map((p) => pRow(p, num(Math.round(p.dmg / p.dmgMin)), tl("{n} games", { n: p.g }))),
        note: pNote,
      });
    }
    const vP = preg.filter((p) => p.visMin > 0);
    if (vP.length >= 3) {
      const b = top(vP, (p) => p.vis / p.visMin);
      out.push({
        id: "player-vision", title: tl("Most vision score per minute"),
        headline: tl("{who} has {v} vision score a minute at {event}", { who: who(b[0]), v: f1(b[0].vis / b[0].visMin), event }),
        rows: b.map((p) => pRow(p, f1(p.vis / p.visMin), tl("{n} games", { n: p.g }))),
        note: pNote,
      });
    }
    const kpP = preg.filter((p) => p.teamK > 0);
    if (kpP.length >= 3) {
      const b = top(kpP, (p) => (p.k + p.a) / p.teamK);
      out.push({
        id: "player-kp", title: tl("Highest kill participation"),
        headline: tl("{who} took part in {pct} of their team's kills at {event}", { who: who(b[0]), pct: pctOf(b[0].k + b[0].a, b[0].teamK), event }),
        rows: b.map((p) => pRow(p, pctOf(p.k + p.a, p.teamK), tl("{k} kills + assists of {n}", { k: p.k + p.a, n: p.teamK }))),
        note: tl("(kills + assists) ÷ the team's kills. {note}", { note: pNote }),
      });
    }
  }
  const assists = top(plist, (p) => p.a * 1000 - p.g);
  if (assists.length)
    out.push({
      id: "player-assists", title: tl("Most assists"),
      headline: tl("{who} has the most assists at {event}: {n}", { who: who(assists[0]), event, n: assists[0].a }),
      rows: assists.map((p) => pRow(p, String(p.a), tl("{n} games", { n: p.g }))),
    });
  const pk = played.flatMap((g) => g.pentas.map((p) => ({ g, p, side: g.team.find((s) => s.players.some((l) => (p.u && l.u === p.u) || l.champ === p.champ)) })));
  if (pk.length)
    out.push({
      id: "pentakills", title: tl("Pentakills"),
      headline: pk.length === 1
        ? tl("{who} got the only pentakill of {event}, on {champ}", { who: pk[0].p.name, event, champ: champName(pk[0].p.champ) })
        : tl("{n} pentakills at {event}", { n: pk.length, event }),
      rows: pk.slice(0, 8).map(({ g, p, side }) => ({
        label: p.name, player: p.u, champ: p.champ, value: p.n > 1 ? `×${p.n}` : "",
        sub: `${champName(p.champ)} · ${side ? vsText(g, g.team.indexOf(side)) : at(g) + tl("Game {n}", { n: g.n })}`,
        match: { slug: g.series, game: g.n },
      })),
    });

  // ── the draft ───────────────────────────────────────────────────────────
  const picks = new Map<string, { g: number; w: number; b: number; roles: Set<string> }>();
  const withBans = played.filter((g) => g.team[0].bans.length || g.team[1].bans.length);
  for (const { s, won } of sides)
    for (const l of s.players) {
      if (!l.champ) continue;
      const c = picks.get(l.champ) || { g: 0, w: 0, b: 0, roles: new Set() };
      c.g++;
      if (won) c.w++;
      if (l.role) c.roles.add(l.role);
      picks.set(l.champ, c);
    }
  for (const g of withBans)
    for (const s of g.team)
      for (const b of s.bans) {
        const c = picks.get(b) || { g: 0, w: 0, b: 0, roles: new Set() };
        c.b++;
        picks.set(b, c);
      }
  const clist = [...picks.entries()].map(([c, x]) => ({ c, ...x }));
  const picked = top(clist.filter((x) => x.g), (x) => x.g * 1000 + x.w);
  if (picked.length)
    out.push({
      id: "champ-picked", title: tl("Most picked champions"),
      headline: tl("{champ} is the most picked champion at {event}: {n} games", { champ: champName(picked[0].c), n: picked[0].g, event }),
      rows: picked.map((x) => ({ label: champName(x.c), champ: x.c, value: String(x.g), sub: tl("{rec} · picked in {pct} of games", { rec: `${x.w}-${x.g - x.w}`, pct: pctOf(x.g, played.length) }) })),
    });
  if (withBans.length) {
    const banned = top(clist.filter((x) => x.b), (x) => x.b * 1000 + x.g);
    if (banned.length)
      out.push({
        id: "champ-banned", title: tl("Most banned champions"),
        headline: tl("{champ} is the most banned champion at {event}: {n} bans", { champ: champName(banned[0].c), n: banned[0].b, event }),
        rows: banned.map((x) => ({ label: champName(x.c), champ: x.c, value: String(x.b), sub: tl("banned in {pct} of games · picked {n}", { pct: pctOf(x.b, withBans.length), n: x.g }) })),
        note: tl("Pick-or-ban presence counts both. {n} games with the draft known.", { n: withBans.length }),
      });
    const presence = top(clist, (x) => x.g + x.b);
    out.push({
      id: "champ-presence", title: tl("Highest pick-or-ban presence"),
      headline: tl("{champ} was picked or banned in {pct} of games at {event}", { champ: champName(presence[0].c), pct: pctOf(presence[0].g + presence[0].b, withBans.length), event }),
      rows: presence.map((x) => ({ label: champName(x.c), champ: x.c, value: pctOf(x.g + x.b, withBans.length), sub: tl("{p} picks · {b} bans", { p: x.g, b: x.b }) })),
      note: tl("(picks + bans) ÷ games with the draft known ({n}).", { n: withBans.length }),
    });
  }
  const flex = top(clist.filter((x) => x.roles.size >= 2), (x) => x.roles.size * 1000 + x.g);
  if (flex.length)
    out.push({
      id: "champ-flex", title: tl("Flex picks"),
      headline: tl("{champ} has been played in {n} roles at {event}", { champ: champName(flex[0].c), n: flex[0].roles.size, event }),
      rows: flex.map((x) => ({ label: champName(x.c), champ: x.c, value: String(x.roles.size), sub: [...x.roles].map((r) => roleName(r)).join(" / ") })),
    });

  // longest games (the fastest wins are with the other facts)
  if (timed.length >= 3) {
    const long = top(timed, (g) => g.min || 0, 3);
    const w = (g: Game) => tname(g.team[g.w - 1]);
    const l = (g: Game) => tname(g.team[2 - g.w]);
    out.push({
      id: "long", title: tl("Longest games"),
      headline: tl("{team} beat {opp} in {time}, the longest game at {event}", { team: w(long[0]), opp: l(long[0]), time: mmss(long[0].min || 0), event }),
      rows: long.map((g) => ({ label: `${w(g)} vs ${l(g)}`, value: mmss(g.min || 0), sub: at(g) + tl("Game {n}", { n: g.n }), match: { slug: g.series, game: g.n } })),
    });
  }
  return out;
}
