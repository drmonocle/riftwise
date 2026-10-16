/**
 * Match prep: everything an analyst gathers before a broadcast for one matchup, on one page and for any period:
 * storylines (milestones, streaks, head-to-head), recent form, every series between them, team numbers and draft
 * tendencies, and the lanes player against player. Address: /riftwatch/stats/prep?teams=t1,gen-g&p=y2026
 */
import React, { useEffect, useMemo, useState } from "react";
import { GitCompare } from "lucide-react";
import { tl, roleName } from "../../i18n";
import { winRate } from "../../stats";
import { loadHubPlayer, loadHubTeam, loadPlayerGames, loadTeamGames, loadTeamSeries } from "../../hub/data";
import type { HubPlayer, HubTeam, PlayerGameRow, TeamGameRow, TeamSeriesRow } from "../../hub/types";
import { PrepRoute, navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { PeriodKey, inPeriod, playerAgg, playerRowRef, teamRowRef } from "../../hub/period";
import { HeadToHeadSeries } from "./Archives";
import { ComparePick, TeamRows, bothOptions } from "./ComparePage";
import { PeriodPicker, defaultPeriod } from "./PeriodStats";
import { StoryLine, StoryList, noteText } from "./Storylines";
import { card, ChampIcon, fmtDate, HubLink, isFresh, Loading, RevealButton, Section, useHidden, usePageTitle } from "./ui";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];

interface Side {
  team: HubTeam;
  games: TeamGameRow[];
  series: TeamSeriesRow[];
  /** current starters by role (most games in the newest roster year) */
  players: ({ p: HubPlayer; log: PlayerGameRow[] } | null)[];
}

async function loadSide(slug: string): Promise<Side> {
  const [team, games, series] = await Promise.all([
    loadHubTeam(slug),
    loadTeamGames(slug).catch(() => [] as TeamGameRow[]),
    loadTeamSeries(slug).catch(() => [] as TeamSeriesRow[]),
  ]);
  const latest = team.roster[0];
  const starters = ROLES.map((r) => (latest?.p || []).filter((x) => x.r === r && x.u).sort((a, b) => b.g - a.g)[0] || null);
  const players = await Promise.all(
    starters.map((x) =>
      x && x.u
        ? Promise.all([loadHubPlayer(x.u), loadPlayerGames(x.u).catch(() => [] as PlayerGameRow[])])
            .then(([p, log]) => ({ p, log }))
            .catch(() => null)
        : Promise.resolve(null),
    ),
  );
  return { team, games, series, players };
}

export const PrepPage: React.FC<{ route: PrepRoute }> = ({ route }) => {
  useDDragon();
  const a = route.a || null;
  const b = route.b || null;
  const [sides, setSides] = useState<{ a: Side | null; b: Side | null; failed?: boolean }>({ a: null, b: null });
  useEffect(() => {
    let alive = true;
    setSides({ a: null, b: null });
    if (!a || !b) return;
    Promise.all([loadSide(a), loadSide(b)])
      .then(([x, y]) => alive && setSides({ a: x, b: y }))
      .catch(() => alive && setSides({ a: null, b: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [a, b]);
  usePageTitle(sides.a && sides.b ? tl("{a} vs {b}: match prep", { a: sides.a.team.name, b: sides.b.team.name }) : tl("Match prep"));
  const set = (patch: Partial<PrepRoute>) => navigateHub({ kind: "prep", a: a || undefined, b: b || undefined, period: route.period, ...patch }, { replace: true });

  if (!a || !b)
    return (
      <div className="space-y-3">
        <div className={`${card} space-y-2 text-xs`}>
          <p className="text-[#f0e6d2] font-semibold">{tl("Match prep")}</p>
          <p className="text-[#9bb3c9]">{tl("Pick two teams: storylines, form, head-to-head, team numbers, draft tendencies and every lane, on one page.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((k) => (
            <div key={k} className={`${card} min-w-0`}>
              {(k === "a" ? a : b) ? (
                <button type="button" onClick={() => set({ [k]: undefined })} className="text-[11px] text-[#0ac8b9] hover:underline">
                  {tl("Change")}
                </button>
              ) : (
                <ComparePick kind="team" autoFocus={k === "a" || !!a} onPick={(slug) => set({ [k]: slug })} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  if (sides.failed) return <p className="text-xs text-[#9bb3c9] py-6 text-center">{tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>;
  if (!sides.a || !sides.b) return <Loading />;
  return <PrepView a={sides.a} b={sides.b} route={route} set={set} />;
};

const PrepView: React.FC<{ a: Side; b: Side; route: PrepRoute; set: (p: Partial<PrepRoute>) => void }> = ({ a, b, route, set }) => {
  const options = useMemo(() => bothOptions(a.games.map(teamRowRef), b.games.map(teamRowRef)), [a.games, b.games]);
  const period: PeriodKey = route.period && options.some((o) => o.key === route.period) ? route.period : defaultPeriod(options);
  const opt = options.find((o) => o.key === period);
  const periodLabel = !opt || opt.key === "all" ? tl("All time") : opt.group === "basic" ? tl("Last {n} games", { n: opt.label }) : opt.label;
  const ra = useMemo(() => inPeriod(a.games, period, teamRowRef), [a.games, period]);
  const rb = useMemo(() => inPeriod(b.games, period, teamRowRef), [b.games, period]);
  const fresh = [...ra, ...rb].map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`prep:${a.team.u}:${b.team.u}:${period}`, fresh);
  const title = `${a.team.name} vs ${b.team.name}`;

  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#c8aa6e]">{tl("Match prep")}</div>
          <h2 className="text-lg font-bold text-[#f0e6d2] truncate">
            <HubLink to={{ kind: "team", slug: a.team.u }}>{a.team.name}</HubLink>
            <span className="text-[#7e8e9f] font-normal"> vs </span>
            <HubLink to={{ kind: "team", slug: b.team.u }}>{b.team.name}</HubLink>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#7e8e9f]">{tl("Stats for")}</span>
          <PeriodPicker options={options} value={period} onChange={(p) => set({ period: p })} />
          <HubLink
            to={{ kind: "compare", mode: "team", a: a.team.u, b: b.team.u, period }}
            className="flex items-center gap-1 text-[#0ac8b9] hover:underline"
          >
            <GitCompare className="w-3.5 h-3.5" />
            {tl("Compare")}
          </HubLink>
        </div>
      </div>

      <PrepStorylines a={a} b={b} />
      <Form a={a} b={b} />
      <HeadToHeadSeries a={a.team.u} b={b.team.u} aName={a.team.name} bName={b.team.name} />
      {hidden ? (
        <div className={`${card} py-4 text-center`}>
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <>
          <TeamRows x={a.team} y={b.team} ra={ra} rb={rb} bSlug={b.team.u} career={period === "all"} periodLabel={periodLabel} />
          <Lanes a={a} b={b} period={period} periodLabel={periodLabel} title={title} />
        </>
      )}
    </div>
  );
};

/** Head-to-head facts plus both teams' and their starters' storylines. */
const PrepStorylines: React.FC<{ a: Side; b: Side }> = ({ a, b }) => {
  const lines: StoryLine[] = [];
  const meetings = a.series.filter((r) => r[2] === b.team.u).sort((x, y) => (x[0] < y[0] ? 1 : -1));
  if (!meetings.length) {
    lines.push({ key: "first", text: tl("First ever meeting between these teams") });
  } else {
    const [date, , , won, lost, en] = meetings[0];
    const winner = won > lost ? a.team.name : b.team.name;
    lines.push({
      key: "last",
      text: tl("Last meeting: {team} won {score} ({event}, {date})", { team: winner, score: `${Math.max(won, lost)}-${Math.min(won, lost)}`, event: en, date: fmtDate(date) }),
      asOf: date,
    });
    const aWonFirst = meetings[0][3] > meetings[0][4];
    let n = 0;
    for (const m of meetings) {
      if (m[3] > m[4] !== aWonFirst) break;
      n++;
    }
    if (n >= 2) lines.push({ key: "h2hstreak", text: tl("{team} have won the last {n} meetings", { team: aWonFirst ? a.team.name : b.team.name, n }), asOf: date });
    const wa = meetings.filter((m) => m[3] > m[4]).length;
    lines.push({ key: "h2h", text: tl("Series between them: {a} {wa}-{wb} {b}", { a: a.team.name, b: b.team.name, wa, wb: meetings.length - wa }), asOf: date });
  }
  for (const s of [a, b]) {
    for (const [i, nt] of (s.team.notes?.list || []).entries())
      lines.push({ key: `${s.team.u}-${i}`, who: { name: s.team.name, to: { kind: "team", slug: s.team.u } }, text: noteText(nt), asOf: s.team.notes?.asOf });
    for (const pl of s.players)
      if (pl?.p.notes)
        for (const [i, nt] of pl.p.notes.list.entries())
          lines.push({ key: `${pl.p.u}-${i}`, who: { name: pl.p.name, to: { kind: "player", slug: pl.p.u } }, text: noteText(nt), asOf: pl.p.notes.asOf });
  }
  return <StoryList lines={lines} spoilerKey={`prep-notes:${a.team.u}:${b.team.u}`} share={`${a.team.name}-vs-${b.team.name}-storylines`} />;
};

/** Each team's last 10 series. */
const Form: React.FC<{ a: Side; b: Side }> = ({ a, b }) => {
  const last = (s: Side) => [...s.series].sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, 10);
  const la = last(a);
  const lb = last(b);
  const fresh = [...la, ...lb].map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`prep-form:${a.team.u}:${b.team.u}`, fresh);
  return (
    <Section title={tl("Form: last 10 series")} share={`${a.team.name}-vs-${b.team.name}-form`}>
      {hidden ? (
        <div className="py-2 text-center">
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <div className="space-y-2">
          {[
            { s: a, rows: la },
            { s: b, rows: lb },
          ].map(({ s, rows }) => {
            const w = rows.filter((r) => r[3] > r[4]).length;
            return (
              <div key={s.team.u} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="w-32 truncate font-semibold text-[#f0e6d2]">{s.team.name}</span>
                <span className="text-[#9bb3c9] w-10 tabular-nums">
                  {w}-{rows.length - w}
                </span>
                {rows.map((r) => {
                  const won = r[3] > r[4];
                  return (
                    <span
                      key={`${r[0]}-${r[7]}-${r[1]}`}
                      title={`${won ? "W" : "L"} ${r[3]}-${r[4]} vs ${r[1]} · ${r[5]} · ${fmtDate(r[0])}`}
                      className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                        won ? "bg-[#0ac8b9]/20 text-[#0ac8b9]" : "bg-[#e84057]/20 text-[#e84057]"
                      }`}
                    >
                      {won ? "W" : "L"}
                    </span>
                  );
                })}
              </div>
            );
          })}
          <p className="text-[10px] text-[#7e8e9f]">{tl("Newest first; hover a square for the opponent and score.")}</p>
        </div>
      )}
    </Section>
  );
};

/** Lane by lane: each team's starter, their numbers in the period and most played champions. */
const Lanes: React.FC<{ a: Side; b: Side; period: PeriodKey; periodLabel: string; title: string }> = ({ a, b, period, periodLabel, title }) => {
  const stats = (pl: Side["players"][number]) => {
    if (!pl) return null;
    const rows = inPeriod(pl.log, period, playerRowRef);
    return rows.length ? playerAgg(rows) : null;
  };
  const cell = (pl: Side["players"][number], right: boolean) => {
    const s = stats(pl);
    if (!pl) return <span className="text-[#7e8e9f]">–</span>;
    return (
      <div className={`min-w-0 space-y-0.5 ${right ? "text-right" : ""}`}>
        <HubLink to={{ kind: "player", slug: pl.p.u }} className="text-sm font-bold text-[#f0e6d2] hover:underline">
          {pl.p.name}
        </HubLink>
        {s ? (
          <>
            <div className="text-[11px] text-[#9bb3c9] tabular-nums">
              {s.g} · {winRate(s.w, s.g)} · {s.kda} KDA{s.kp != null ? ` · KP ${s.kp.toFixed(0)}%` : ""}
            </div>
            <div className="text-[11px] text-[#7e8e9f] tabular-nums">
              {s.csm != null ? `${s.csm} CS/m` : ""}
              {s.dpm != null ? ` · ${s.dpm} DPM` : ""}
              {s.dmgShare != null ? ` · ${s.dmgShare.toFixed(0)}% DMG` : ""}
            </div>
            <div className={`flex gap-1 flex-wrap ${right ? "justify-end" : ""}`}>
              {s.champs.slice(0, 4).map((c) => (
                <span key={c.c} className="flex items-center gap-0.5 text-[10px] text-[#9bb3c9]" title={`${c.g} · ${winRate(c.w, c.g)}`}>
                  <ChampIcon name={c.c} size={18} />
                  {c.g}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-[#7e8e9f]">{tl("No games in this period")}</div>
        )}
      </div>
    );
  };
  return (
    <Section title={tl("Lane by lane")} right={<span className="text-[11px] text-[#9bb3c9]">{periodLabel}</span>} share={`${title}-lanes-${periodLabel}`}>
      <ul className="divide-y divide-[#1e282d]">
        {ROLES.map((r, i) => (
          <li key={r} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
            {cell(a.players[i], false)}
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#c8aa6e] text-center w-14">{roleName(r)}</span>
            {cell(b.players[i], true)}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-[#7e8e9f]">{tl("Starters: the players with the most games in each team's newest roster. Games · win rate · KDA · kill participation; champions with games played.")}</p>
    </Section>
  );
};
