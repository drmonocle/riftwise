/**
 * The Worlds / MSI / First Stand pages' extra facts (src/hub/intlInsights.ts): upsets, comebacks, the Swiss stage,
 * Cinderella runs, and for every year together finals, players' titles, each year in numbers, regions year by year
 * and how the host did. Shown under the facts on the Facts tab.
 */
import React, { useMemo, useState } from "react";
import { tl } from "../../i18n";
import { champName } from "../../champions";
import { prettySlug, resolveChampSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias } from "../../hub/data";
import { currentHubRoute, hubShareUrl } from "../../hub/route";
import type { EventLines } from "../../hub/worldsFacts";
import { cinderella, comebacks, editionYear, finals, finalsRecords, hosts, playerTitles, regionOf, runs, swissRuns, upsets, yearLines, type FileRef, type Run } from "../../hub/intlInsights";
import { ChampIcon, HubLink, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo } from "./ui";
import { STable } from "../STable";
import { SectionCard } from "./BroadcastCard";
import { RegionFlag, regionLabel, regionLeagueQuery, regionStats } from "./RegionStats";

const mmss = (m: number | null) => {
  if (m == null) return "–";
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const k = (v: number) => `${(v / 1000).toFixed(1)}k`;
const yearOnly = (label: string) => String(editionYear(label) || label);
const teamSlug = (name: string) => resolveTeamAlias(name) || prettySlug(name);
const placeText = (p: number | string | null | undefined) => {
  const n = typeof p === "number" ? p : Number(/^\d+/.exec(p || "")?.[0] || NaN);
  if (p == null || Number.isNaN(n)) return "–";
  return n === 1 ? tl("Won it") : n === 2 ? tl("Final") : n <= 4 ? tl("Semifinal") : n <= 8 ? tl("Quarterfinal") : tl("Top {n}", { n });
};

const List: React.FC<{ children: React.ReactNode }> = ({ children }) => <ul className="text-xs space-y-1">{children}</ul>;
const Item: React.FC<{ left: React.ReactNode; right: React.ReactNode; sub?: React.ReactNode }> = ({ left, right, sub }) => (
  <li className="flex justify-between gap-2 min-w-0">
    <span className="min-w-0">
      <span className="block truncate">{left}</span>
      {sub && <span className="block text-[10px] text-rw-muted truncate">{sub}</span>}
    </span>
    <span className="shrink-0 tabular-nums font-semibold text-rw-accent">{right}</span>
  </li>
);

export const IntlInsights: React.FC<{ files: (EventLines | null)[]; years: string[]; stages: string[]; all: boolean; name: string; league?: string }> = ({
  files,
  years,
  stages,
  all,
  name,
  league,
}) => {
  const refs = useMemo<FileRef[]>(
    () => files.map((f, i) => (f ? { f, year: years[i], stage: stages[i] } : null)).filter((x): x is FileRef => !!x),
    [files, years, stages],
  );
  const singleYear = useMemo(() => (!all ? String(editionYear(years[0] || "") || "") : ""), [all, years]);
  const intlLeague = useMemo(
    () =>
      resolveLeagueSlug(
        league || (/msi|mid-season/i.test(name) ? "mid-season-invitational" : /first stand/i.test(name) ? "first-stand" : "world-championship"),
      ) || "world-championship",
    [league, name],
  );
  const up = useMemo(() => upsets(refs), [refs]);
  const cb = useMemo(() => comebacks(refs), [refs]);
  const sw = useMemo(() => swissRuns(refs), [refs]);
  const rn = useMemo(() => runs(refs), [refs]);
  const cind = useMemo(() => cinderella(rn), [rn]);
  const fin = useMemo(() => (all ? finalsRecords(finals(refs)) : null), [refs, all]);
  const titles = useMemo(() => (all ? playerTitles(refs).slice(0, 12) : []), [refs, all]);
  const ys = useMemo(() => (all ? yearLines(refs) : []), [refs, all]);
  const hs = useMemo(() => (all ? hosts(refs) : []), [refs, all]);
  const topChamps = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of refs) {
      for (const p of r.f.p || []) {
        if (!p[5]) continue;
        const c = resolveChampSlug(p[5]);
        if (c) counts.set(c, (counts.get(c) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([c]) => c);
  }, [refs]);
  const topPlayers = useMemo(() => {
    if (titles.length >= 2) {
      return titles
        .slice(0, 2)
        .map((p) => p.u || resolvePlayerSlug(p.name) || prettySlug(p.name))
        .filter(Boolean);
    }
    const counts = new Map<string, number>();
    for (const r of refs) {
      for (const p of r.f.p || []) {
        const u = p[3] || resolvePlayerSlug(p[2]) || prettySlug(p[2]);
        if (u) counts.set(u, (counts.get(u) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([u]) => u);
  }, [refs, titles]);
  const topTeams = useMemo(() => {
    const out: string[] = [];
    const push = (u?: string | null) => {
      if (u && !out.includes(u)) out.push(u);
    };
    for (const r of fin?.mostReached || []) push(r.u);
    for (const r of rn) push(r.u || teamSlug(r.team));
    for (const g of up.games) {
      push(teamSlug(g.winner));
      push(teamSlug(g.loser));
    }
    return out.slice(0, 2);
  }, [fin, rn, up.games]);
  const cA = topChamps[0];
  const cB = topChamps[1];
  const cJoin = topChamps.join(",");
  const pA = topPlayers[0];
  const pB = topPlayers[1];
  // each region's record against other regions, year by year (the regions with the most such series)
  const trend = useMemo(() => {
    if (!all) return null;
    const yearsList = [...new Set(refs.map((r) => r.year))].sort((a, b) => editionYear(a) - editionYear(b));
    const per = yearsList.map((y) => {
      const sub = refs.filter((r) => r.year === y);
      const tWins = new Map<string, Map<string, number>>();
      for (const r of sub) {
        if (!r.f.rg) continue;
        for (const u of Object.keys(r.f.rg)) {
          const rc = regionOf(r.f, u);
          if (!rc) continue;
          if (!tWins.has(rc)) tWins.set(rc, new Map());
          if (!tWins.get(rc)!.has(u)) tWins.get(rc)!.set(u, 0);
        }
        for (const s of r.f.s) {
          const [, , , , ua, , , ub, , wa, wb] = s;
          const rA = regionOf(r.f, ua);
          const rB = regionOf(r.f, ub);
          if (rA && ua && wa != null) tWins.get(rA)?.set(ua, (tWins.get(rA)?.get(ua) || 0) + wa);
          if (rB && ub && wb != null) tWins.get(rB)?.set(ub, (tWins.get(rB)?.get(ub) || 0) + wb);
        }
      }
      const topTeams = new Map<string, string>();
      for (const [c, m] of tWins) {
        const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (top) topTeams.set(c, top);
      }
      return { y, rows: regionStats(sub.map((r) => r.f), sub.map((r) => r.year)).list, topTeams };
    });
    const totals = new Map<string, number>();
    for (const p of per) for (const r of p.rows) totals.set(r.code, (totals.get(r.code) || 0) + r.ow + r.ol);
    const regions = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
    return { years: per, regions };
  }, [refs, all]);

  const sections: React.ReactNode[] = [];

  if (up.games.length)
    sections.push(
      <Section
        key="upsets"
        title={tl("Biggest upsets")}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {cA && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: cA,
                    ...(cB ? { vs: cB } : {}),
                    ...(singleYear ? { patch: `y${singleYear}`, year: singleYear } : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            {up.games[0]?.winner && up.games[0]?.loser && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: teamSlug(up.games[0].winner),
                    b: teamSlug(up.games[0].loser),
                    ...(singleYear ? { period: `y${singleYear}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(teamSlug(up.games[0].winner))},${encodeURIComponent(teamSlug(up.games[0].loser))}${cJoin ? `&champ=${encodeURIComponent(cJoin)}` : ""}${singleYear ? `&p=y${singleYear}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: teamSlug(up.games[0].winner),
                    b: teamSlug(up.games[0].loser),
                    ...(singleYear ? { period: `y${singleYear}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      league: intlLeague,
                      ...(singleYear ? { year: singleYear } : {}),
                      team: teamSlug(up.games[0].winner),
                      vs: teamSlug(up.games[0].loser),
                      ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                      ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(up.games[0]?.winner
                    ? {
                        q: `${teamSlug(up.games[0].winner)}${up.games[0].loser ? `,${teamSlug(up.games[0].loser)}` : ""}`,
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] font-semibold text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "best",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(up.games[0]?.winner
                    ? {
                        q: `${teamSlug(up.games[0].winner)}${up.games[0].loser ? `,${teamSlug(up.games[0].loser)}` : ""}`,
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Best games")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(up.games[0]?.winner ? { team: teamSlug(up.games[0].winner) } : {}),
                  ...(up.games[0]?.loser ? { vs: teamSlug(up.games[0].loser) } : {}),
                  ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                  ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "records",
                ...(up.games[0]?.winner
                  ? {
                      query: `q=${encodeURIComponent(
                        `${teamSlug(up.games[0].winner)}${up.games[0].loser ? `,${teamSlug(up.games[0].loser)}` : ""}`,
                      )}`,
                    }
                  : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Records")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(cA ? { champ: cA } : {}),
                  ...([
                    up.games[0]?.winner ? teamSlug(up.games[0].winner) : undefined,
                    up.games[0]?.loser ? teamSlug(up.games[0].loser) : undefined,
                    pA,
                    pB,
                  ].some(Boolean)
                    ? {
                        q: [
                          up.games[0]?.winner ? teamSlug(up.games[0].winner) : undefined,
                          up.games[0]?.loser ? teamSlug(up.games[0].loser) : undefined,
                          pA,
                          pB,
                        ]
                          .filter(Boolean)
                          .join(","),
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  scope: intlLeague,
                  league: intlLeague,
                  ...(singleYear ? { key: `y${singleYear}`, year: singleYear } : {}),
                  ...(cJoin ? { q: cJoin } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <CopyInsightPost
              title={`${tl("Biggest upsets")} · ${name}`}
              rows={up.games.slice(0, 5).map((u) => `${u.winner} ${tl("beat")} ${u.loser} (${u.chance}%) · ${all ? yearOnly(u.year) + " · " : ""}${u.stage}`)}
            />
            <SectionCard
              section={tl("Biggest upsets")}
              name={name}
              rows={() =>
                up.games.map((u, idx) => ({
                  rank: idx + 1,
                  team: u.winner,
                  label: `${u.winner} beat ${u.loser}`,
                  sub: `${all ? yearOnly(u.year) + " · " : ""}${u.stage} · ${tl("Game {n}", { n: u.n ?? 1 })}`,
                  value: `${u.chance}%`,
                }))
              }
            />
          </span>
        }
      >
        <p className="text-[11px] text-rw-muted">{tl("Wins by the team the power ratings gave the smallest chance before the game.")}</p>
        <List>
          {up.games.map((u, i) => (
            <Item
              key={i}
              left={
                <HubLink to={{ kind: "match", slug: u.series, game: u.n }} className="inline-flex items-center gap-1 text-rw-text hover:text-rw-accent">
                  <TeamLogo name={u.winner} size={14} />
                  <span>{u.winner}</span>
                  <span className="text-rw-muted">{tl("beat")}</span>
                  <TeamLogo name={u.loser} size={14} />
                  <span>{u.loser}</span>
                </HubLink>
              }
              sub={
                <HubLink to={{ kind: "match", slug: u.series, game: u.n }} className="hover:text-rw-accent hover:underline">
                  {`${all ? yearOnly(u.year) + " · " : ""}${u.stage} · ${tl("Game {n}", { n: u.n ?? 1 })}`}
                </HubLink>
              }
              right={
                <HubLink to={{ kind: "match", slug: u.series, game: u.n }} className="hover:underline">
                  {u.chance}%
                </HubLink>
              }
            />
          ))}
        </List>
        {up.series.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Series upsets")}</h4>
            <List>
              {up.series.slice(0, 5).map((u, i) => (
                <Item
                  key={i}
                  left={
                    <HubLink to={{ kind: "match", slug: u.series }} className="inline-flex items-center gap-1 text-rw-text hover:text-rw-accent">
                      <TeamLogo name={u.winner} size={14} />
                      <span>{u.winner} {u.score}</span>
                      <TeamLogo name={u.loser} size={14} />
                      <span>{u.loser}</span>
                    </HubLink>
                  }
                  sub={
                    <HubLink to={{ kind: "match", slug: u.series }} className="hover:text-rw-accent hover:underline">
                      {`${all ? yearOnly(u.year) + " · " : ""}${u.stage}`}
                    </HubLink>
                  }
                  right={
                    <HubLink to={{ kind: "match", slug: u.series }} className="hover:underline">
                      {u.chance}%
                    </HubLink>
                  }
                />
              ))}
            </List>
          </>
        )}
      </Section>,
    );

  if (cb.length)
    sections.push(
      <Section
        key="comebacks"
        title={tl("Biggest comebacks")}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {cA && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: cA,
                    ...(cB ? { vs: cB } : {}),
                    ...(singleYear ? { patch: `y${singleYear}`, year: singleYear } : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            {cb[0]?.winner && cb[0]?.loser && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: teamSlug(cb[0].winner),
                    b: teamSlug(cb[0].loser),
                    ...(singleYear ? { period: `y${singleYear}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(teamSlug(cb[0].winner))},${encodeURIComponent(teamSlug(cb[0].loser))}${cJoin ? `&champ=${encodeURIComponent(cJoin)}` : ""}${singleYear ? `&p=y${singleYear}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: teamSlug(cb[0].winner),
                    b: teamSlug(cb[0].loser),
                    ...(singleYear ? { period: `y${singleYear}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      league: intlLeague,
                      ...(singleYear ? { year: singleYear } : {}),
                      team: teamSlug(cb[0].winner),
                      vs: teamSlug(cb[0].loser),
                      ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                      ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{
                kind: "records",
                ...(cb[0]?.winner
                  ? {
                      query: `q=${encodeURIComponent(
                        `${teamSlug(cb[0].winner)}${cb[0].loser ? `,${teamSlug(cb[0].loser)}` : ""}`,
                      )}`,
                    }
                  : {}),
              }}
              className="text-[11px] font-semibold text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Records")} →
            </HubLink>
            <HubLink
              to={{
                kind: "best",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(cb[0]?.winner
                    ? {
                        q: `${teamSlug(cb[0].winner)}${cb[0].loser ? `,${teamSlug(cb[0].loser)}` : ""}`,
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Best games")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(cb[0]?.winner ? { team: teamSlug(cb[0].winner) } : {}),
                  ...(cb[0]?.loser ? { vs: teamSlug(cb[0].loser) } : {}),
                  ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                  ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(cb[0]?.winner
                    ? {
                        q: `${teamSlug(cb[0].winner)}${cb[0].loser ? `,${teamSlug(cb[0].loser)}` : ""}`,
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(cA ? { champ: cA } : {}),
                  ...([
                    cb[0]?.winner ? teamSlug(cb[0].winner) : undefined,
                    cb[0]?.loser ? teamSlug(cb[0].loser) : undefined,
                    pA,
                    pB,
                  ].some(Boolean)
                    ? {
                        q: [
                          cb[0]?.winner ? teamSlug(cb[0].winner) : undefined,
                          cb[0]?.loser ? teamSlug(cb[0].loser) : undefined,
                          pA,
                          pB,
                        ]
                          .filter(Boolean)
                          .join(","),
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  scope: intlLeague,
                  league: intlLeague,
                  ...(singleYear ? { key: `y${singleYear}`, year: singleYear } : {}),
                  ...(cJoin ? { q: cJoin } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <CopyInsightPost
              title={`${tl("Biggest comebacks")} · ${name}`}
              rows={cb.slice(0, 5).map((c) => `${c.winner} ${tl("beat")} ${c.loser} (−${k(c.behind)} @15) · ${all ? yearOnly(c.year) + " · " : ""}${c.stage}`)}
            />
            <SectionCard
              section={tl("Biggest comebacks")}
              name={name}
              rows={() =>
                cb.map((c, idx) => ({
                  rank: idx + 1,
                  team: c.winner,
                  label: `${c.winner} beat ${c.loser}`,
                  sub: `${all ? yearOnly(c.year) + " · " : ""}${c.stage}`,
                  value: `-${k(c.behind)}`,
                }))
              }
            />
          </span>
        }
      >
        <p className="text-[11px] text-rw-muted">{tl("Games won from furthest behind in gold at 15 minutes.")}</p>
        <List>
          {(() => {
            const maxBehind = Math.max(1, ...cb.map((c) => c.behind));
            return cb.map((c, i) => (
              <Item
                key={i}
                left={
                  <HubLink to={{ kind: "match", slug: c.series, game: c.n }} className="inline-flex items-center gap-1 text-rw-text hover:text-rw-accent">
                    <TeamLogo name={c.winner} size={14} />
                    <span>{c.winner}</span>
                    <span className="text-rw-muted">{tl("beat")}</span>
                    <TeamLogo name={c.loser} size={14} />
                    <span>{c.loser}</span>
                  </HubLink>
                }
                sub={
                  <HubLink to={{ kind: "match", slug: c.series, game: c.n }} className="hover:text-rw-accent hover:underline">
                    {`${all ? yearOnly(c.year) + " · " : ""}${c.stage} · ${tl("Game {n}", { n: c.n })}`}
                  </HubLink>
                }
                right={
                  <HubLink to={{ kind: "match", slug: c.series, game: c.n }} className="inline-flex items-center gap-1.5 hover:underline">
                    <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                      <span className="h-full bg-rw-red/80 rounded-full" style={{ width: `${Math.round((c.behind / maxBehind) * 100)}%` }} />
                    </span>
                    <span>−{k(c.behind)}</span>
                  </HubLink>
                }
              />
            ));
          })()}
        </List>
      </Section>,
    );

  if (sw.length) {
    const sorted = [...sw].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.team.localeCompare(b.team));
    const clean = sorted.filter((r) => r.wins === 3 && r.losses === 0);
    const swept = sorted.filter((r) => r.wins === 0 && r.losses === 3);
    const escaped = sorted.filter((r) => r.path.startsWith("LL") && r.wins === 3);
    // 1-2 after three rounds: one more loss and they're out
    const at12 = sw.filter((r) => r.path.length >= 3 && r.path.slice(0, 3).replace(/L/g, "").length === 1);
    const at12Through = at12.filter((r) => r.wins === 3).length;
    const chip = (path: string) => (
      <span className="inline-flex gap-0.5 align-middle">
        {path.split("").map((c, i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-sm text-[8px] font-bold flex items-center justify-center ${c === "W" ? "bg-rw-teal/30 text-rw-teal" : "bg-rw-red/30 text-rw-red"}`}>
            {c}
          </span>
        ))}
      </span>
    );
    sections.push(
      <Section
        key="swiss"
        title={tl("Swiss stage")}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {cA && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: cA,
                    ...(cB ? { vs: cB } : {}),
                    ...(!all && sorted[0] ? { patch: `y${yearOnly(sorted[0].year)}`, year: yearOnly(sorted[0].year) } : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            {sorted.length >= 1 && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: sorted[0].u || teamSlug(sorted[0].team),
                    ...(sorted[1] ? { b: sorted[1].u || teamSlug(sorted[1].team) } : {}),
                    ...(!all ? { period: `y${yearOnly(sorted[0].year)}` } : {}),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(sorted[0].u || teamSlug(sorted[0].team))}${
                      sorted[1] ? `,${encodeURIComponent(sorted[1].u || teamSlug(sorted[1].team))}` : ""
                    }${cJoin ? `&champ=${encodeURIComponent(cJoin)}` : ""}${!all ? `&p=y${encodeURIComponent(yearOnly(sorted[0].year))}` : ""}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: sorted[0].u || teamSlug(sorted[0].team),
                    ...(sorted[1] ? { b: sorted[1].u || teamSlug(sorted[1].team) } : {}),
                    ...(!all ? { period: `y${yearOnly(sorted[0].year)}` } : {}),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{
                kind: "items",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(!all && sorted[0] ? { year: yearOnly(sorted[0].year) } : {}),
                  ...(sorted[0]
                    ? {
                        team: sorted[0].u || teamSlug(sorted[0].team),
                        ...(sorted[1] ? { vs: sorted[1].u || teamSlug(sorted[1].team) } : {}),
                      }
                    : {}),
                  ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                  ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Item history")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(!all && sorted[0] ? { year: yearOnly(sorted[0].year) } : {}),
                  ...(sorted[0]
                    ? {
                        team: sorted[0].u || teamSlug(sorted[0].team),
                        ...(sorted[1] ? { vs: sorted[1].u || teamSlug(sorted[1].team) } : {}),
                      }
                    : {}),
                  ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                  ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(sorted[0]
                    ? {
                        q: `${sorted[0].u || teamSlug(sorted[0].team)}${sorted[1] ? `,${sorted[1].u || teamSlug(sorted[1].team)}` : ""}`,
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  scope: intlLeague,
                  league: intlLeague,
                  ...(!all && sorted[0] ? { key: `y${yearOnly(sorted[0].year)}`, year: yearOnly(sorted[0].year) } : {}),
                  ...(cJoin ? { q: cJoin } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(!all && sorted[0] ? { year: yearOnly(sorted[0].year) } : {}),
                  ...(cA ? { champ: cA } : {}),
                  ...([
                    sorted[0] ? sorted[0].u || teamSlug(sorted[0].team) : undefined,
                    sorted[1] ? sorted[1].u || teamSlug(sorted[1].team) : undefined,
                    pA,
                    pB,
                  ].some(Boolean)
                    ? {
                        q: [
                          sorted[0] ? sorted[0].u || teamSlug(sorted[0].team) : undefined,
                          sorted[1] ? sorted[1].u || teamSlug(sorted[1].team) : undefined,
                          pA,
                          pB,
                        ]
                          .filter(Boolean)
                          .join(","),
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <SectionCard
              section={tl("Swiss stage")}
              name={name}
              rows={() =>
                sorted.map((r, idx) => ({
                  rank: idx + 1,
                  team: r.team,
                  label: `${all ? yearOnly(r.year) + " · " : ""}${r.team}`,
                  sub: r.path.split("").join(" "),
                  value: `${r.wins}-${r.losses}`,
                  win: r.wins >= 3,
                }))
              }
            />
          </span>
        }
      >
        {all ? (
          <div className="space-y-2 text-xs">
            {(() => {
              const swissList = (list: typeof clean) =>
                list.length ? (
                  <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 align-middle">
                    {list.map((r, i) => {
                      const yrQ = `p=y${encodeURIComponent(yearOnly(r.year))}`;
                      return (
                        <span key={`${r.u}-${r.year}-${i}`} className="inline-flex items-center gap-1">
                          <HubLink to={{ kind: "team", slug: r.u || teamSlug(r.team), query: yrQ }} className="shrink-0">
                            <TeamLogo name={r.team} size={13} />
                          </HubLink>
                          <TeamLink name={r.team} u={r.u} query={yrQ} className="text-rw-text hover:text-rw-accent" />
                          <HubLink
                            to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&team=${encodeURIComponent(r.u || teamSlug(r.team))}&year=${encodeURIComponent(yearOnly(r.year))}` }}
                            className="text-rw-muted hover:text-rw-accent hover:underline"
                            title={tl("Game finder")}
                          >
                            ({yearOnly(r.year)})
                          </HubLink>
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  "–"
                );
              return (
                <>
                  <p>
                    <span className="font-bold text-rw-teal mr-1.5">3-0:</span>
                    {swissList(clean)}
                  </p>
                  <p>
                    <span className="font-bold text-rw-red mr-1.5">0-3:</span>
                    {swissList(swept)}
                  </p>
                  <p>
                    <span className="font-bold text-rw-accent mr-1.5">{tl("Escaped from 0-2:")}</span>
                    {swissList(escaped)}
                  </p>
                </>
              );
            })()}
            {at12.length > 0 && (
              <p className="text-rw-sub">
                <HubLink to={{ kind: "worlds" }} className="hover:text-rw-accent hover:underline">
                  {tl("Teams at 1-2 that still went through: {n} of {of}", { n: at12Through, of: at12.length })}
                </HubLink>
              </p>
            )}
          </div>
        ) : (
          <List>
            {sorted.map((r) => {
              const yrQ = `p=y${encodeURIComponent(yearOnly(r.year))}`;
              return (
                <li key={r.u} className="flex items-center justify-between gap-2 min-w-0">
                  <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                    <HubLink to={{ kind: "team", slug: r.u || teamSlug(r.team), query: yrQ }} className="shrink-0">
                      <TeamLogo name={r.team} size={15} />
                    </HubLink>
                    <TeamLink name={r.team} u={r.u} query={yrQ} className="text-rw-text hover:text-rw-accent truncate" />
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {chip(r.path)}
                    <HubLink
                      to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&team=${encodeURIComponent(r.u || teamSlug(r.team))}&year=${encodeURIComponent(yearOnly(r.year))}` }}
                      className={`tabular-nums font-bold w-8 text-right hover:underline ${r.wins === 3 ? "text-rw-teal" : r.losses === 3 ? "text-rw-red" : "text-rw-sub"}`}
                      title={tl("Game finder")}
                    >
                      {r.wins}-{r.losses}
                    </HubLink>
                  </span>
                </li>
              );
            })}
          </List>
        )}
      </Section>,
    );
  }

  const runRow = (r: Run, i: number, show: "chance" | "place") => {
    const yrQ = `p=y${encodeURIComponent(yearOnly(r.year))}`;
    return (
      <Item
        key={i}
        left={
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <HubLink to={{ kind: "team", slug: r.u || teamSlug(r.team), query: yrQ }} className="shrink-0">
              <TeamLogo name={r.team} size={15} />
            </HubLink>
            <TeamLink name={r.team} u={r.u} query={yrQ} className="text-rw-text hover:text-rw-accent truncate" />
          </span>
        }
      sub={
        <HubLink
          to={{
            kind: "finder",
            query: `league=${encodeURIComponent(intlLeague)}&team=${encodeURIComponent(r.u || teamSlug(r.team))}&year=${encodeURIComponent(yearOnly(r.year))}`,
          }}
          className="hover:text-rw-accent hover:underline"
        >
          {`${all ? yearOnly(r.year) + " · " : ""}${placeText(r.place)}${r.chance != null ? ` · ${tl("avg. chance {p}%", { p: r.chance })}` : ""}`}
        </HubLink>
      }
      right={
        r.u ? (
          <HubLink to={{ kind: "team", slug: r.u, tab: "history" }} className="hover:underline">
            {show === "chance" && r.chance != null ? `${r.chance}%` : placeText(r.place)}
          </HubLink>
        ) : show === "chance" && r.chance != null ? (
          `${r.chance}%`
        ) : (
          placeText(r.place)
        )
      }
      />
    );
  };
  if (cind.playIn.length || cind.underdogs.length || (all && cind.debuts.length)) {
    const cindList = [...cind.playIn, ...cind.underdogs, ...(all ? cind.debuts : [])];
    const u0 = cindList[0]?.u || (cindList[0]?.team ? teamSlug(cindList[0].team) : "");
    const u1 =
      cindList.slice(1).map((r) => r.u || (r.team ? teamSlug(r.team) : "")).find((u) => u && u !== u0) || "";
    sections.push(
      <Section
        key="cinderella"
        title={tl("Cinderella runs")}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {cA && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: cA,
                    ...(cB ? { vs: cB } : {}),
                    ...(singleYear ? { patch: `y${singleYear}`, year: singleYear } : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            {u0 ? (
              <>
                <HubLink
                  to={{ kind: "prep", a: u0, ...(u1 ? { b: u1 } : {}), ...(singleYear ? { period: `y${singleYear}` } : {}) }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(u0)}${u1 ? `,${encodeURIComponent(u1)}` : ""}${cJoin ? `&champ=${encodeURIComponent(cJoin)}` : ""}${singleYear ? `&p=y${singleYear}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: u0, ...(u1 ? { b: u1 } : {}), ...(singleYear ? { period: `y${singleYear}` } : {}) }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      league: intlLeague,
                      ...(singleYear ? { year: singleYear } : {}),
                      team: u0,
                      ...(u1 ? { vs: u1 } : {}),
                      ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                      ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
              </>
            ) : null}
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(u0 ? { q: `${u0}${u1 ? `,${u1}` : ""}` } : {}),
                }).toString(),
              }}
              className="text-[11px] font-semibold text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tournaments",
                ...(singleYear ? { year: singleYear } : {}),
                query: `league=${encodeURIComponent(intlLeague)}`,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Tournaments")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(u0 ? { team: u0, ...(u1 ? { vs: u1 } : {}) } : {}),
                  ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                  ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "best",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(u0 ? { q: `${u0}${u1 ? `,${u1}` : ""}` } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Best games")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(singleYear ? { year: singleYear } : {}),
                  ...(cA ? { champ: cA } : {}),
                  ...([u0, u1, pA, pB].some(Boolean) ? { q: [u0, u1, pA, pB].filter(Boolean).join(",") } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  scope: intlLeague,
                  league: intlLeague,
                  ...(singleYear ? { key: `y${singleYear}`, year: singleYear } : {}),
                  ...(cJoin ? { q: cJoin } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <SectionCard
              section={tl("Cinderella runs")}
              name={name}
              rows={() =>
                [
                  ...cind.playIn.slice(0, 4).map((r) => ({ team: r.team, label: `${r.team} · ${tl("from the Play-In")}`, sub: all ? yearOnly(r.year) : undefined, value: placeText(r.place) })),
                  ...cind.underdogs.slice(0, 4).map((r) => ({ team: r.team, label: `${r.team} · ${tl("underdog")}`, sub: all ? yearOnly(r.year) : undefined, value: placeText(r.place) })),
                  ...(all ? cind.debuts.slice(0, 4).map((r) => ({ team: r.team, label: `${r.team} · ${tl("debut")}`, sub: yearOnly(r.year), value: placeText(r.place) })) : []),
                ].map((row, idx) => ({ rank: idx + 1, ...row }))
              }
            />
          </span>
        }
      >
        {cind.playIn.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">{tl("From the Play-In")}</h4>
            <List>{cind.playIn.map((r, i) => runRow(r, i, "place"))}</List>
          </>
        )}
        {cind.underdogs.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Underdogs who went deep")}</h4>
            <List>{cind.underdogs.map((r, i) => runRow(r, i, "chance"))}</List>
          </>
        )}
        {all && cind.debuts.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Best debuts")}</h4>
            <List>{cind.debuts.map((r, i) => runRow(r, i, "place"))}</List>
          </>
        )}
      </Section>,
    );
  }

  if (fin && (fin.mostReached.length || fin.repeats.length))
    sections.push(
      <Section
        key="finals"
        title={tl("Finals")}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {cA && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: cA,
                    ...(cB ? { vs: cB } : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            {fin.mostReached.length >= 1 && (
              <>
                <HubLink
                  to={{ kind: "prep", a: fin.mostReached[0].u, ...(fin.mostReached[1] ? { b: fin.mostReached[1].u } : {}) }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(fin.mostReached[0].u)}${fin.mostReached[1] ? `,${encodeURIComponent(fin.mostReached[1].u)}` : ""}${cJoin ? `&champ=${encodeURIComponent(cJoin)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: fin.mostReached[0].u, ...(fin.mostReached[1] ? { b: fin.mostReached[1].u } : {}) }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      league: intlLeague,
                      team: fin.mostReached[0].u,
                      ...(fin.mostReached[1]?.u ? { vs: fin.mostReached[1].u } : {}),
                      ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                      ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{
                kind: "titles",
                ...(fin.mostReached[0]?.u
                  ? {
                      query: `q=${encodeURIComponent(`${fin.mostReached[0].u}${fin.mostReached[1]?.u ? `,${fin.mostReached[1].u}` : ""}`)}`,
                    }
                  : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Titles")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(fin.mostReached[0]?.u ? { team: fin.mostReached[0].u } : {}),
                  ...(fin.mostReached[1]?.u ? { vs: fin.mostReached[1].u } : {}),
                  ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                  ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(fin.mostReached[0]?.u
                    ? {
                        q: `${fin.mostReached[0].u}${fin.mostReached[1]?.u ? `,${fin.mostReached[1].u}` : ""}`,
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(cA ? { champ: cA } : {}),
                  ...([fin.mostReached[0]?.u, fin.mostReached[1]?.u, pA, pB].some(Boolean)
                    ? {
                        q: [fin.mostReached[0]?.u, fin.mostReached[1]?.u, pA, pB].filter(Boolean).join(","),
                      }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  scope: intlLeague,
                  league: intlLeague,
                  ...(cJoin ? { q: cJoin } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <CopyInsightPost
              title={`${tl("Most finals")} · ${name}`}
              rows={fin.mostReached.slice(0, 6).map((r) => `${r.name}: ${r.n} (${tl("{w} won · {l} lost", { w: r.won, l: r.n - r.won })})`)}
            />
            <SectionCard
              section={tl("Most finals")}
              name={name}
              rows={() =>
                fin.mostReached.map((r, idx) => ({
                  rank: idx + 1,
                  team: r.name,
                  label: r.name,
                  sub: tl("{w} won · {l} lost", { w: r.won, l: r.n - r.won }),
                  value: String(r.n),
                  win: r.won >= r.n - r.won,
                }))
              }
            />
          </span>
        }
      >
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">{tl("Most finals")}</h4>
        <List>
          {fin.mostReached.slice(0, 6).map((r) => {
            const wrPct = r.n > 0 ? Math.round((r.won / r.n) * 100) : 0;
            return (
              <Item
                key={r.u}
                left={
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <HubLink to={{ kind: "team", slug: r.u }} className="shrink-0">
                      <TeamLogo name={r.name} size={15} />
                    </HubLink>
                    <TeamLink name={r.name} u={r.u} className="text-rw-text hover:text-rw-accent truncate" />
                  </span>
                }
                sub={
                  <HubLink
                    to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&team=${encodeURIComponent(r.u)}` }}
                    className="hover:text-rw-accent hover:underline"
                  >
                    {tl("{w} won · {l} lost", { w: r.won, l: r.n - r.won })}
                  </HubLink>
                }
                right={
                  <span className="inline-flex items-center gap-1.5">
                    {r.n > 0 && (
                      <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                        <span className="h-full bg-rw-teal/85" style={{ width: `${wrPct}%` }} />
                        <span className="h-full bg-rw-red/75" style={{ width: `${100 - wrPct}%` }} />
                      </span>
                    )}
                    <HubLink to={{ kind: "team", slug: r.u, tab: "history" }} className="hover:underline">
                      {r.n}
                    </HubLink>
                  </span>
                }
              />
            );
          })}
        </List>
        {fin.mostLost.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Most finals lost")}</h4>
            <List>
              {(() => {
                const maxLost = Math.max(1, ...fin.mostLost.slice(0, 5).map((r) => r.n));
                return fin.mostLost.slice(0, 5).map((r) => (
                  <Item
                    key={r.u}
                    left={
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <HubLink to={{ kind: "team", slug: r.u }} className="shrink-0">
                          <TeamLogo name={r.name} size={15} />
                        </HubLink>
                        <TeamLink name={r.name} u={r.u} className="text-rw-text hover:text-rw-accent truncate" />
                      </span>
                    }
                    sub={
                      <HubLink
                        to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&team=${encodeURIComponent(r.u)}` }}
                        className="hover:text-rw-accent hover:underline"
                      >
                        {r.years.map(yearOnly).join(", ")}
                      </HubLink>
                    }
                    right={
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                          <span className="h-full bg-rw-red/75 rounded-full" style={{ width: `${Math.round((r.n / maxLost) * 100)}%` }} />
                        </span>
                        <HubLink to={{ kind: "team", slug: r.u, tab: "history" }} className="hover:underline">
                          {r.n}
                        </HubLink>
                      </span>
                    }
                  />
                ));
              })()}
            </List>
          </>
        )}
        {fin.repeats.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Rematches in the final")}</h4>
            <List>
              {fin.repeats.map((l, i) => {
                const wSlug = l[0].winnerU || teamSlug(l[0].winner);
                const lSlug = l[0].loserU || teamSlug(l[0].loser);
                const lastYr = yearOnly(l[0].year);
                const wQ =
                  new URLSearchParams({
                    ...(lastYr ? { p: `y${lastYr}` } : {}),
                    ...(lSlug && lSlug !== wSlug ? { q: lSlug } : {}),
                  }).toString() || undefined;
                const lQ =
                  new URLSearchParams({
                    ...(lastYr ? { p: `y${lastYr}` } : {}),
                    ...(wSlug && wSlug !== lSlug ? { q: wSlug } : {}),
                  }).toString() || undefined;
                return (
                  <Item
                    key={i}
                    left={
                      <span className="inline-flex items-center gap-1 min-w-0">
                        <HubLink to={{ kind: "team", slug: wSlug, ...(wQ ? { query: wQ } : {}) }} className="shrink-0">
                          <TeamLogo name={l[0].winner} size={14} />
                        </HubLink>
                        <TeamLink name={l[0].winner} u={l[0].winnerU} query={wQ} className="text-rw-text hover:text-rw-accent hover:underline" />
                        <HubLink
                          to={{ kind: "compare", mode: "team", a: wSlug, b: lSlug, ...(lastYr ? { period: `y${lastYr}` } : {}) }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Compare")}
                        >
                          vs
                        </HubLink>
                        <HubLink to={{ kind: "team", slug: lSlug, ...(lQ ? { query: lQ } : {}) }} className="shrink-0">
                          <TeamLogo name={l[0].loser} size={14} />
                        </HubLink>
                        <TeamLink name={l[0].loser} u={l[0].loserU} query={lQ} className="text-rw-text hover:text-rw-accent hover:underline" />
                      </span>
                    }
                    sub={l.map((f) => `${yearOnly(f.year)}: ${f.winner} ${f.score}`).join(" · ")}
                    right={
                      <span className="inline-flex items-center gap-2">
                        <HubLink
                          to={{ kind: "prep", a: wSlug, b: lSlug, ...(lastYr ? { period: `y${lastYr}` } : {}) }}
                          className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Match prep")}
                        >
                          {tl("Match prep")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "draft", query: `teams=${encodeURIComponent(wSlug)},${encodeURIComponent(lSlug)}${lastYr ? `&p=y${encodeURIComponent(lastYr)}` : ""}` }}
                          className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Draft board")}
                        >
                          {tl("Draft board")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "items", query: `league=${encodeURIComponent(intlLeague)}&team=${encodeURIComponent(wSlug)}&vs=${encodeURIComponent(lSlug)}${lastYr ? `&year=${encodeURIComponent(lastYr)}` : ""}` }}
                          className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Item history")}
                        >
                          {tl("Item history")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&team=${encodeURIComponent(wSlug)}&vs=${encodeURIComponent(lSlug)}${lastYr ? `&year=${encodeURIComponent(lastYr)}` : ""}` }}
                          className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {tl("Game finder")}
                        </HubLink>
                        <HubLink
                          to={{ kind: "compare", mode: "team", a: wSlug, b: lSlug, ...(lastYr ? { period: `y${lastYr}` } : {}) }}
                          className="hover:underline"
                          title={tl("Compare")}
                        >
                          ×{l.length}
                        </HubLink>
                      </span>
                    }
                  />
                );
              })}
            </List>
          </>
        )}
      </Section>,
    );

  if (titles.length) {
    const tTeams = Array.from(new Set(titles.map((p) => (p.team ? teamSlug(p.team) : "")).filter(Boolean))).slice(0, 2);
    const tPlayers = Array.from(new Set(titles.map((p) => p.u || prettySlug(p.name)).filter(Boolean))).slice(0, 2);
    sections.push(
      <Section
        key="players"
        title={tl("Players with the most titles")}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {cA && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: cA,
                    ...(cB ? { vs: cB } : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            {titles.length >= 1 && titles[0].u && (
              <>
                <HubLink
                  to={{ kind: "compare", mode: "player", a: titles[0].u, ...(titles[1]?.u ? { b: titles[1].u } : {}) }}
                  className="text-[11px] text-rw-accent hover:underline"
                  title={titles[1]?.u ? tl("Compare {a} and {b}", { a: titles[0].name, b: titles[1].name }) : tl("Compare")}
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      player: titles[0].u,
                      ...(titles[1]?.u && titles[1].u !== titles[0].u ? { vsplayer: titles[1].u } : {}),
                      ...(tTeams[0] ? { team: tTeams[0], ...(tTeams[1] ? { vs: tTeams[1] } : {}) } : {}),
                      ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                      league: intlLeague,
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                {tTeams[0] && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: tTeams[0],
                        ...(tTeams[1] ? { b: tTeams[1] } : {}),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                      data-nocapture="1"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          teams: tTeams.join(","),
                          ...(cJoin ? { champ: cJoin } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                      data-nocapture="1"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                  </>
                )}
              </>
            )}
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(cA ? { champ: cA } : {}),
                  ...([...tPlayers, ...tTeams].length >= 1 ? { q: [...tPlayers, ...tTeams].join(",") } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "titles",
                ...(tPlayers.length >= 1 ? { query: `q=${encodeURIComponent(tPlayers.join(","))}` } : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Titles")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  ...(titles[0]?.u ? { player: titles[0].u } : {}),
                  ...(titles[1]?.u && titles[1].u !== titles[0]?.u ? { vsplayer: titles[1].u } : {}),
                  ...(tTeams[0] ? { team: tTeams[0], ...(tTeams[1] ? { vs: tTeams[1] } : {}) } : {}),
                  ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                  league: intlLeague,
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  scope: intlLeague,
                  league: intlLeague,
                  ...(cJoin ? { q: cJoin } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(tTeams.length >= 1 ? { q: tTeams.join(",") } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <CopyInsightPost
              title={`${tl("Players with the most titles")} · ${name}`}
              rows={titles.slice(0, 6).map((p) => `${p.name}: ${tl("{n} titles", { n: p.titles.length })} (${p.titles.map(yearOnly).sort().join(", ")})`)}
            />
            <SectionCard
              section={tl("Players with the most titles")}
              name={name}
              rows={() =>
                titles.map((p, idx) => ({
                  rank: idx + 1,
                  team: p.team,
                  label: p.name,
                  sub: p.titles.map(yearOnly).join(", "),
                  value: tl("{n} titles", { n: p.titles.length }),
                }))
              }
            />
          </span>
        }
      >
        <List>
          {(() => {
            const maxTitles = Math.max(1, ...titles.map((p) => p.titles.length));
            return titles.map((p) => {
              const pLatestYr = p.titles.length ? yearOnly([...p.titles].sort().pop()!) : undefined;
              const pQ =
                new URLSearchParams({
                  ...(pLatestYr ? { p: `y${pLatestYr}` } : {}),
                  ...(p.team ? { team: teamSlug(p.team) } : {}),
                }).toString() || undefined;
              return (
                <Item
                  key={p.u || p.name}
                  left={
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      {p.u ? (
                        <HubLink to={{ kind: "player", slug: p.u, ...(pQ ? { query: pQ } : {}) }} className="shrink-0">
                          <PlayerPhoto name={p.name} team={p.team} slug={p.u} size={18} />
                        </HubLink>
                      ) : (
                        <PlayerPhoto name={p.name} team={p.team} slug={undefined} size={18} />
                      )}
                      <PlayerLink name={p.name} u={p.u} query={pQ} className="text-rw-text hover:text-rw-accent truncate" />
                    </span>
                  }
                  sub={
                    <HubLink
                      to={{
                        kind: "finder",
                        query: new URLSearchParams({
                          league: intlLeague,
                          player: p.u || prettySlug(p.name),
                          ...(p.team ? { team: teamSlug(p.team) } : {}),
                        }).toString(),
                      }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {`${p.titles.map(yearOnly).sort().join(", ")} · ${tl("{n} finals", { n: p.finals })}`}
                    </HubLink>
                  }
                  right={
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                        <span className="h-full bg-rw-accent/85 rounded-full" style={{ width: `${Math.round((p.titles.length / maxTitles) * 100)}%` }} />
                      </span>
                      {p.u ? (
                        <HubLink to={{ kind: "player", slug: p.u, tab: "career", ...(pQ ? { query: pQ } : {}) }} className="hover:underline">
                          {p.titles.length}
                        </HubLink>
                      ) : (
                        <span>{p.titles.length}</span>
                      )}
                    </span>
                  }
                />
              );
            });
          })()}
        </List>
      </Section>,
    );
  }

  if (hs.length) {
    const hostTeams = Array.from(new Set(hs.map((h) => h.teamU || (h.team ? teamSlug(h.team) : "")).filter(Boolean))).slice(0, 2);
    const u0 = hostTeams[0];
    const u1 = hostTeams[1];
    sections.push(
      <Section
        key="hosts"
        title={tl("Home region")}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {cA && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: cA,
                    ...(cB ? { vs: cB } : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            {u0 ? (
              <>
                <HubLink
                  to={{ kind: "prep", a: u0, ...(u1 ? { b: u1 } : {}) }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      teams: hostTeams.join(","),
                      ...(cJoin ? { champ: cJoin } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: u0, ...(u1 ? { b: u1 } : {}) }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      league: intlLeague,
                      team: u0,
                      ...(u1 ? { vs: u1 } : {}),
                      ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                      ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
              </>
            ) : null}
            <HubLink to={{ kind: "leagues" }} className="text-[11px] font-semibold text-rw-accent hover:underline" data-nocapture="1">
              {tl("Leagues")} →
            </HubLink>
            <HubLink
              to={{
                kind: "titles",
                ...(hostTeams.length >= 1 ? { query: `q=${encodeURIComponent(hostTeams.join(","))}` } : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Titles")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(u0 ? { team: u0, ...(u1 ? { vs: u1 } : {}) } : {}),
                  ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                  ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(hostTeams.length >= 1 ? { q: hostTeams.join(",") } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(cA ? { champ: cA } : {}),
                  ...([...hostTeams, pA, pB].some(Boolean)
                    ? { q: [...hostTeams, pA, pB].filter(Boolean).join(",") }
                    : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  scope: intlLeague,
                  league: intlLeague,
                  ...(cJoin ? { q: cJoin } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <SectionCard
              section={tl("Home region")}
              name={name}
              rows={() =>
                hs.map((h, idx) => ({
                  rank: idx + 1,
                  team: h.team || undefined,
                  label: `${yearOnly(h.year)} · ${h.country}`,
                  sub: h.team || undefined,
                  value: placeText(h.best),
                  win: h.best === 1,
                }))
              }
            />
          </span>
        }
      >
        <p className="text-[11px] text-rw-muted">
          {tl("How the host region's best team did. Home wins: {n} of {of}.", { n: hs.filter((h) => h.best === 1).length, of: hs.filter((h) => h.region).length })}
        </p>
        <List>
          {hs.map((h) => (
            <li key={h.year} className="flex items-center justify-between gap-2 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                <HubLink
                  to={{
                    kind: "finder",
                    query: `league=${encodeURIComponent(intlLeague)}${
                      h.team ? `&team=${encodeURIComponent(h.teamU || teamSlug(h.team))}` : ""
                    }&year=${encodeURIComponent(yearOnly(h.year))}`,
                  }}
                  className="tabular-nums text-rw-muted hover:text-rw-accent hover:underline w-9"
                >
                  {yearOnly(h.year)}
                </HubLink>
                {h.region && <RegionFlag code={h.region} />}
                <span className="truncate text-rw-text">{h.country}</span>
                {h.team && (
                  <span className="inline-flex items-center gap-1 truncate text-rw-muted">
                    <span>·</span>
                    <HubLink to={{ kind: "team", slug: h.teamU || teamSlug(h.team), query: `p=y${encodeURIComponent(yearOnly(h.year))}` }} className="shrink-0">
                      <TeamLogo name={h.team} size={14} />
                    </HubLink>
                    <TeamLink name={h.team} u={h.teamU} query={`p=y${encodeURIComponent(yearOnly(h.year))}`} className="truncate text-rw-muted hover:text-rw-accent hover:underline" />
                  </span>
                )}
              </span>
              {h.region && h.team ? (
                <HubLink
                  to={{ kind: "team", slug: h.teamU || teamSlug(h.team), tab: "history" }}
                  className={`shrink-0 font-semibold hover:underline ${h.best === 1 ? "text-rw-accent" : "text-rw-sub hover:text-rw-accent"}`}
                >
                  {placeText(h.best)}
                </HubLink>
              ) : (
                <span className={`shrink-0 font-semibold ${h.best === 1 ? "text-rw-accent" : "text-rw-sub"}`}>{h.region ? placeText(h.best) : "–"}</span>
              )}
            </li>
          ))}
        </List>
      </Section>,
    );
  }

  return (
    <>
      {sections.length > 0 && <div className="grid gap-3 md:grid-cols-2">{sections}</div>}
      {all && ys.length > 0 && (
        <Section
          title={tl("Year by year")}
          right={
            <span className="flex flex-wrap items-center gap-2">
            {ys[0] && (() => {
              const latestYr = yearOnly(ys[0].year);
              const c0 = ys[0].top?.[0] ? resolveChampSlug(ys[0].top[0]) : cA;
              const c1Raw = ys[0].best?.[0] && ys[0].best[0] !== ys[0].top?.[0] ? ys[0].best[0] : ys[1]?.top?.[0] && ys[1].top[0] !== ys[0].top?.[0] ? ys[1].top[0] : undefined;
              const c1 = (c1Raw ? resolveChampSlug(c1Raw) : undefined) || (cB && cB !== c0 ? cB : undefined);
              const yChamps = [c0, c1].filter((x): x is string => Boolean(x)).join(",");
              return (
                <>
                  {topTeams[0] && (
                    <>
                      <HubLink
                        to={{ kind: "prep", a: topTeams[0], ...(topTeams[1] ? { b: topTeams[1] } : {}) }}
                        className="text-[11px] font-semibold text-rw-accent hover:underline"
                        data-nocapture="1"
                      >
                        {tl("Match prep")} →
                      </HubLink>
                      <HubLink
                        to={{ kind: "compare", mode: "team", a: topTeams[0], ...(topTeams[1] ? { b: topTeams[1] } : {}) }}
                        className="text-[11px] font-semibold text-rw-accent hover:underline"
                        data-nocapture="1"
                      >
                        {tl("Compare")} →
                      </HubLink>
                    </>
                  )}
                  {c0 && (
                    <>
                      <HubLink
                        to={{ kind: "counters", query: `champ=${encodeURIComponent(c0)}${c1 ? `&vs=${encodeURIComponent(c1)}` : ""}${latestYr ? `&patch=y${encodeURIComponent(latestYr)}&year=${encodeURIComponent(latestYr)}` : ""}` }}
                        className="text-[11px] font-semibold text-rw-accent hover:underline"
                        data-nocapture="1"
                      >
                        {tl("Counters")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "items",
                          query: new URLSearchParams({
                            champ: c0,
                            ...(c1 ? { vschamp: c1 } : {}),
                            league: intlLeague,
                            ...(latestYr ? { year: latestYr } : {}),
                            ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                            ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                          }).toString(),
                        }}
                        className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                        data-nocapture="1"
                      >
                        {tl("Item history")} →
                      </HubLink>
                    </>
                  )}
                  <HubLink
                    to={{
                      kind: "champions",
                      query: new URLSearchParams({
                        scope: intlLeague,
                        league: intlLeague,
                        ...(latestYr ? { key: `y${latestYr}`, year: latestYr } : {}),
                        ...(yChamps ? { q: yChamps } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Champions")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        scope: intlLeague,
                        league: intlLeague,
                        ...(latestYr ? { key: `y${latestYr}`, year: latestYr } : {}),
                        ...(yChamps ? { q: yChamps } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query:
                        new URLSearchParams({
                          ...(topTeams.length ? { teams: topTeams.join(",") } : {}),
                          ...(latestYr ? { p: `y${latestYr}` } : {}),
                          ...(yChamps ? { champ: yChamps } : {}),
                        }).toString() || undefined,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: new URLSearchParams({
                        league: intlLeague,
                        ...(latestYr ? { year: latestYr } : {}),
                        ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                        ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                        ...(c0 ? { champ: c0, ...(c1 ? { vschamp: c1 } : {}) } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                </>
              );
            })()}
            <HubLink
              to={{
                kind: "records",
                ...(topTeams.length ? { query: `q=${encodeURIComponent(topTeams.join(","))}` } : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Records")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(topTeams.length ? { q: topTeams.join(",") } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  league: intlLeague,
                  ...(ys[0] ? { year: yearOnly(ys[0].year) } : {}),
                  ...(cA ? { champ: cA } : {}),
                  ...([...topTeams, ...topPlayers].length ? { q: [...topTeams, ...topPlayers].join(",") } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
              <CopyInsightPost
                title={`${tl("Year by year")} · ${name}`}
                rows={ys.slice(0, 6).map((y) => `${yearOnly(y.year)}: ${y.games}G · ${mmss(y.min)} · ${y.top ? champName(y.top[0]) : "–"}`)}
              />
              <SectionCard
                section={tl("Year by year")}
                name={name}
                rows={() =>
                  ys.map((y, idx) => ({
                    rank: idx + 1,
                    champ: y.top?.[0],
                    label: yearOnly(y.year),
                    sub: `${y.top ? champName(y.top[0]) : "–"} · ${tl("blue {p}%", { p: y.blue ?? "–" })}`,
                    value: mmss(y.min),
                  }))
                }
              />
            </span>
          }
        >
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
              <thead className="text-[10px] text-rw-muted">
                <tr>
                  <th className="px-2 py-1 text-left">{tl("Year")}</th>
                  <th className="px-2 py-1 text-right">{tl("Games")}</th>
                  <th className="px-2 py-1 text-right">{tl("Blue side wins")}</th>
                  <th className="px-2 py-1 text-right">{tl("Avg game")}</th>
                  <th className="px-2 py-1 text-right">{tl("Kills / game")}</th>
                  <th className="px-2 py-1 text-left">{tl("Most picked")}</th>
                  <th className="px-2 py-1 text-left">{tl("Best win rate")}</th>
                  <th className="px-2 py-1 text-right" title={tl("Teams and players at their first edition")}>
                    {tl("Debuts")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxG = Math.max(1, ...ys.map((y) => y.games));
                  return ys.map((y) => (
                    <tr key={y.year} className="border-t border-rw-border whitespace-nowrap">
                      <td className="px-2 py-1 text-rw-text font-semibold" data-sort={editionYear(y.year) || 0}>
                        <HubLink
                          to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&year=${encodeURIComponent(yearOnly(y.year))}` }}
                          className="hover:text-rw-accent hover:underline"
                        >
                          {yearOnly(y.year)}
                        </HubLink>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums" data-sort={y.games}>
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <span className="w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                            <span className="h-full bg-rw-accent/75 rounded-full" style={{ width: `${Math.round((y.games / maxG) * 100)}%` }} />
                          </span>
                          <HubLink
                            to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&year=${encodeURIComponent(yearOnly(y.year))}` }}
                            className="w-7 text-right hover:text-rw-accent hover:underline"
                          >
                            {y.games}
                          </HubLink>
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums" data-sort={y.blue ?? -1}>
                        {y.blue == null ? (
                          "–"
                        ) : (
                          <HubLink
                            to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&year=${encodeURIComponent(yearOnly(y.year))}&side=b` }}
                            className="inline-flex items-center justify-end gap-1.5 hover:text-rw-accent hover:underline"
                            title={tl("Game finder")}
                          >
                            <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                              <span className="h-full" style={{ width: `${y.blue}%`, background: "#4a9eff" }} />
                              <span className="h-full" style={{ width: `${100 - y.blue}%`, background: "var(--rw-red)" }} />
                            </span>
                            <span className="w-8 text-right">{y.blue}%</span>
                          </HubLink>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums" data-sort={y.min ?? -1}>
                        {y.min != null ? (
                          <HubLink
                            to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&year=${encodeURIComponent(yearOnly(y.year))}` }}
                            className="hover:text-rw-accent hover:underline"
                          >
                            {mmss(y.min)}
                          </HubLink>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums" data-sort={y.kills ?? -1}>
                        {y.kills != null ? (
                          <HubLink
                            to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&year=${encodeURIComponent(yearOnly(y.year))}` }}
                            className="hover:text-rw-accent hover:underline"
                          >
                            {y.kills}
                          </HubLink>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-2 py-1" data-sort={y.top ? y.top[1] : -1}>
                        {y.top ? (
                          <HubLink
                            to={{
                              kind: "champ",
                              slug: resolveChampSlug(y.top[0]),
                              query: new URLSearchParams({
                                p: `y${yearOnly(y.year)}`,
                                ...(y.best && resolveChampSlug(y.best[0]) !== resolveChampSlug(y.top[0])
                                  ? { vschamp: resolveChampSlug(y.best[0]) }
                                  : {}),
                              }).toString(),
                            }}
                            className="flex items-center gap-1 hover:text-rw-accent"
                          >
                            <ChampIcon name={y.top[0]} size={16} />
                            {champName(y.top[0])} <span className="text-rw-muted">· {y.top[1]}</span>
                          </HubLink>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-2 py-1" data-sort={y.best && y.best[1] ? y.best[2] / y.best[1] : -1}>
                        {y.best ? (
                          <HubLink
                            to={{
                              kind: "champ",
                              slug: resolveChampSlug(y.best[0]),
                              query: new URLSearchParams({
                                p: `y${yearOnly(y.year)}`,
                                ...(y.top && resolveChampSlug(y.top[0]) !== resolveChampSlug(y.best[0])
                                  ? { vschamp: resolveChampSlug(y.top[0]) }
                                  : {}),
                              }).toString(),
                            }}
                            className="flex items-center gap-1 hover:text-rw-accent"
                          >
                            <ChampIcon name={y.best[0]} size={16} />
                            {champName(y.best[0])}{" "}
                            <span className="text-rw-muted">
                              · {y.best[2]}-{y.best[1] - y.best[2]}
                            </span>
                          </HubLink>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-rw-sub" data-sort={y.newTeams * 100 + y.newPlayers}>
                        <HubLink
                          to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&year=${encodeURIComponent(yearOnly(y.year))}` }}
                          className="hover:text-rw-accent hover:underline"
                        >
                          {tl("{t} teams · {p} players", { t: y.newTeams, p: y.newPlayers })}
                        </HubLink>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </STable>
          </div>
        </Section>
      )}
      {trend && trend.regions.length > 0 && trend.years.length > 1 && (
        <Section
          title={tl("Regions year by year")}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {cA && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: cA,
                      ...(cB ? { vs: cB } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              {topTeams[0] && (
                <>
                  <HubLink
                    to={{ kind: "prep", a: topTeams[0], ...(topTeams[1] ? { b: topTeams[1] } : {}) }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        teams: topTeams.join(","),
                        ...(cJoin ? { champ: cJoin } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "compare", mode: "team", a: topTeams[0], ...(topTeams[1] ? { b: topTeams[1] } : {}) }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Compare")} →
                  </HubLink>
                </>
              )}
              <HubLink to={{ kind: "leagues" }} className="text-[11px] font-semibold text-rw-accent hover:underline" data-nocapture="1">
                {tl("Leagues")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(topTeams.length ? { q: topTeams.join(",") } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                    ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                    ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(topTeams[0] ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) } : {}),
                    ...(pA ? { player: pA, ...(pB ? { vsplayer: pB } : {}) } : {}),
                    ...(cA ? { champ: cA, ...(cB ? { vschamp: cB } : {}) } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    league: intlLeague,
                    ...(cA ? { champ: cA } : {}),
                    ...([...topTeams, ...topPlayers].length ? { q: [...topTeams, ...topPlayers].join(",") } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    scope: intlLeague,
                    league: intlLeague,
                    ...(cJoin ? { q: cJoin } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <CopyInsightPost
                title={`${tl("Regions year by year")} · ${name}`}
                rows={trend.regions.slice(0, 6).map((code) => {
                  const rows = trend.years.map((y) => y.rows.find((x) => x.code === code)).filter((x): x is NonNullable<typeof x> => !!x);
                  const w = rows.reduce((s, r) => s + r.ow, 0);
                  const l = rows.reduce((s, r) => s + r.ol, 0);
                  return `${regionLabel(code)}: ${w}-${l} (${w + l > 0 ? `${Math.round((w / (w + l)) * 100)}%` : "–"})`;
                })}
              />
              <SectionCard
                section={tl("Regions year by year")}
                name={name}
                rows={() =>
                  trend.regions.map((code, idx) => {
                    const rows = trend.years.map((y) => y.rows.find((x) => x.code === code)).filter((x): x is NonNullable<typeof x> => !!x);
                    const w = rows.reduce((s, r) => s + r.ow, 0);
                    const l = rows.reduce((s, r) => s + r.ol, 0);
                    return {
                      rank: idx + 1,
                      label: regionLabel(code),
                      sub: `${w}-${l}`,
                      value: w + l > 0 ? `${Math.round((w / (w + l)) * 100)}%` : "–",
                      win: w >= l,
                    };
                  })
                }
              />
            </span>
          }
        >
          <p className="text-[11px] text-rw-muted">{tl("Each region's series win rate against other regions.")}</p>
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
              <thead className="text-[10px] text-rw-muted">
                <tr>
                  <th className="px-2 py-1 text-left">{tl("Region")}</th>
                  {trend.years.map((y) => (
                    <th key={y.y} className="px-1.5 py-1 text-center tabular-nums">
                      {yearOnly(y.y).slice(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trend.regions.map((code) => (
                  <tr key={code} className="border-t border-rw-border">
                    <td className="px-2 py-1 whitespace-nowrap" data-sort={regionLabel(code)}>
                      <HubLink
                        to={{ kind: "leagues", query: `q=${encodeURIComponent(regionLeagueQuery(code))}` }}
                        className="flex items-center gap-1.5 hover:text-rw-accent"
                      >
                        <RegionFlag code={code} />
                        <span>{regionLabel(code)}</span>
                      </HubLink>
                    </td>
                    {trend.years.map((y) => {
                      const r = y.rows.find((x) => x.code === code);
                      const n = r ? r.ow + r.ol : 0;
                      const pct = n ? Math.round((r!.ow / n) * 100) : null;
                      const topTeam = y.topTeams.get(code);
                      return (
                        <td
                          key={y.y}
                          data-sort={pct ?? -1}
                          className="px-1.5 py-1 text-center tabular-nums"
                          title={r ? `${r.ow}-${r.ol}` : undefined}
                          style={pct == null ? undefined : { background: `color-mix(in srgb, ${pct >= 50 ? "var(--rw-teal)" : "var(--rw-red)"} ${Math.round(Math.abs(pct - 50) * 1.2)}%, transparent)` }}
                        >
                          {pct == null ? (
                            <span className="text-rw-muted">·</span>
                          ) : (
                            <HubLink
                              to={{ kind: "finder", query: `league=${encodeURIComponent(intlLeague)}&year=${encodeURIComponent(yearOnly(y.y))}${topTeam ? `&team=${encodeURIComponent(topTeam)}` : ""}` }}
                              className="hover:underline"
                            >
                              {pct}
                            </HubLink>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </STable>
          </div>
        </Section>
      )}
    </>
  );
};

const CopyInsightPost: React.FC<{ title: string; rows: string[] }> = ({ title, rows }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [title];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push(hubShareUrl(currentHubRoute()));
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        setState("failed");
        setTimeout(() => setState("idle"), 2400);
      });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
