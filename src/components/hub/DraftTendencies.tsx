/**
 * How a team drafts, over the chosen period: blue-side first picks, red-side first two picks, phase 1 and phase 2
 * bans, which role they lock in first and keep for last, which roles they pick in each phase, flex picks
 * (champions they played in two roles), their most played lane pairs, and how deep each role's pool is (Fearless).
 */
import React, { useMemo, useState } from "react";
import { tl, roleName } from "../../i18n";
import { winRate } from "../../stats";
import type { TeamGameRow } from "../../hub/types";
import { ROLES } from "../../hub/champAgg";
import { champName } from "../../champions";
import { prettySlug, resolveChampSlug, resolveEventSlug, resolveTeamAlias } from "../../hub/data";
import { hubShareUrl } from "../../hub/route";
import { ChampLink, HubLink } from "./ui";
import { SectionCard } from "./BroadcastCard";

type Count = [string, number, number]; // champion, games, wins

function tally(rows: TeamGameRow[], pickOut: (r: TeamGameRow) => string[], n: number): Count[] {
  const m = new Map<string, [number, number]>();
  for (const r of rows)
    for (const c of pickOut(r)) {
      const x = m.get(c) || [0, 0];
      x[0]++;
      x[1] += r[7];
      m.set(c, x);
    }
  return [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, n).map(([c, x]) => [c, x[0], x[1]]);
}

export function draftTendencies(rows: TeamGameRow[]) {
  const withDraft = rows.filter((r) => (r[20] || []).length === 5);
  const blue = withDraft.filter((r) => r[6] === "b");
  const red = withDraft.filter((r) => r[6] === "r");
  const roleShare = (idx: number) => {
    const c = [0, 0, 0, 0, 0];
    let n = 0;
    for (const r of withDraft) {
      const role = (r[22] || [])[idx];
      if (role != null && role >= 0) {
        c[role]++;
        n++;
      }
    }
    return n ? c.map((v, i) => [i, v / n] as [number, number]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];
  };
  const flexMap = new Map<string, Set<number>>();
  for (const r of withDraft)
    (r[20] || []).forEach((c, i) => {
      const role = (r[22] || [])[i];
      if (role == null || role < 0) return;
      const s = flexMap.get(c) || new Set<number>();
      s.add(role);
      flexMap.set(c, s);
    });
  // which roles they draft in phase 1 (first three picks) and phase 2 (last two: where counter-picks go)
  const phaseRoles = (from: number, to: number) => {
    const c = [0, 0, 0, 0, 0];
    let n = 0;
    for (const r of withDraft)
      for (let i = from; i < to; i++) {
        const role = (r[22] || [])[i];
        if (role != null && role >= 0) {
          c[role]++;
          n++;
        }
      }
    // share of games in which that role was picked in this phase
    const games = withDraft.length || 1;
    return n ? c.map((v, i) => [i, v / games] as [number, number]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];
  };
  // lane pairs (bot + support, jungle + mid) and champions per role
  const pairs = (ra: number, rb: number): Pair[] => {
    const m = new Map<string, [number, number, number, number]>(); // games, wins, sum of both leads at 15, games with it
    for (const r of withDraft) {
      const roles = r[22] || [];
      const ia = roles.indexOf(ra);
      const ib = roles.indexOf(rb);
      if (ia < 0 || ib < 0) continue;
      const a = (r[20] || [])[ia];
      const b = (r[20] || [])[ib];
      if (!a || !b) continue;
      const k = `${a}\u0000${b}`;
      const x = m.get(k) || [0, 0, 0, 0];
      x[0]++;
      x[1] += r[7];
      const ga = r[24]?.[ia];
      const gb = r[24]?.[ib];
      if (ga != null && gb != null) {
        x[2] += ga + gb;
        x[3]++;
      }
      m.set(k, x);
    }
    return [...m.entries()]
      .filter(([, x]) => x[0] >= 2)
      .sort((p, q) => q[1][0] - p[1][0])
      .slice(0, 5)
      .map(([k, x]) => {
        const [a, b] = k.split("\u0000");
        return [a, b, x[0], x[1], x[3] ? Math.round(x[2] / x[3]) : null];
      });
  };
  // red's R1 + R2 opener pairs
  const openers = new Map<string, [number, number]>();
  for (const r of red) {
    // R1 and R2 are locked in together: the same pair either way round is one opener
    const [a, b] = [r[20][0], r[20][1]].sort((x, y) => x.localeCompare(y));
    const k = `${a}\u0000${b}`;
    const x = openers.get(k) || [0, 0];
    x[0]++;
    x[1] += r[7];
    openers.set(k, x);
  }
  // which role gets the last pick(s), where counter-picks go: R5 on red, B4-B5 on blue
  const lastRoles = (list: TeamGameRow[], idx: number[]) => {
    const c = [0, 0, 0, 0, 0];
    for (const r of list)
      for (const i of idx) {
        const role = (r[22] || [])[i];
        if (role != null && role >= 0) c[role]++;
      }
    return list.length ? c.map((v, i) => [i, v / list.length] as [number, number]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];
  };
  const perRole = ROLES.map(() => new Map<string, number>());
  for (const r of rows)
    (r[20] || []).forEach((c, i) => {
      const role = (r[22] || [])[i];
      if (role != null && role >= 0) perRole[role].set(c, (perRole[role].get(c) || 0) + 1);
    });
  return {
    games: withDraft.length,
    phase1: phaseRoles(0, 3),
    phase2: phaseRoles(3, 5),
    r5: lastRoles(red, [4]),
    b45: lastRoles(blue, [3, 4]),
    r12pairs: [...openers.entries()]
      .filter(([, x]) => x[0] >= 2)
      .sort((p, q) => q[1][0] - p[1][0])
      .slice(0, 4)
      .map(([k, x]) => [...k.split("\u0000"), x[0], x[1], null] as Pair),
    botDuos: pairs(3, 4),
    midJungle: pairs(1, 2),
    /** per role: champions played, and how many of them 2+ times */
    depth: perRole.map((m) => [m.size, [...m.values()].filter((n) => n >= 2).length] as [number, number]),
    b1: tally(blue, (r) => [r[20][0]], 5),
    r12: tally(red, (r) => r[20].slice(0, 2), 5),
    bans1: tally(withDraft, (r) => (r[19] || []).slice(0, 3), 6),
    bans2: tally(withDraft, (r) => (r[19] || []).slice(3, 5), 5),
    firstRole: roleShare(0),
    lastRole: roleShare(4),
    flex: [...flexMap.entries()].filter(([, s]) => s.size > 1).map(([c, s]) => [c, [...s].sort()] as [string, number[]]).slice(0, 8),
  };
}

const List: React.FC<{
  title: string;
  hint?: string;
  list: Count[];
  showWr?: boolean;
  teamName?: string;
  oppSlug?: string;
  rosterSlugs?: string[];
  period?: string;
  isBan?: boolean;
  side?: "b" | "r";
}> = ({
  title,
  hint,
  list,
  showWr,
  teamName,
  oppSlug,
  rosterSlugs,
  period,
  isBan,
  side,
}) => {
  if (!list.length) return null;
  const maxN = Math.max(1, ...list.map(([, n]) => n));
  const periodParam =
    period?.startsWith("y") && period.length === 5
      ? `&year=${encodeURIComponent(period.slice(1))}`
      : period?.startsWith("e:")
        ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}`
        : period?.startsWith("p:")
          ? `&patch=${encodeURIComponent(period.slice(2))}`
          : "";
  const playerParam = `${rosterSlugs?.[0] ? `player=${encodeURIComponent(rosterSlugs[0])}&` : ""}${rosterSlugs?.[1] && rosterSlugs[1] !== rosterSlugs?.[0] ? `vsplayer=${encodeURIComponent(rosterSlugs[1])}&` : ""}`;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-rw-muted" title={hint}>
        {title}
      </div>
      {/* what the numbers are: games (and win rate) */}
      <div className="text-[10px] text-rw-muted mb-1">{showWr ? tl("games · win rate") : tl("games")}</div>
      <ul className="text-xs space-y-1">
        {list.map(([c, n, w]) => {
          const good = n > 0 && w / n >= 0.5;
          const finderQuery = `${teamName ? `team=${encodeURIComponent(teamName)}&` : ""}${oppSlug ? `vs=${encodeURIComponent(oppSlug)}&` : ""}${playerParam}${isBan ? "ban" : "champ"}=${encodeURIComponent(resolveChampSlug(c))}${side ? `&side=${side}` : ""}${periodParam}`;
          return (
            <li key={c} className="flex items-center justify-between gap-2 min-w-0">
              <ChampLink
                name={c}
                size={16}
                query={
                  [
                    teamName ? `team=${encodeURIComponent(teamName)}` : "",
                    period && period !== "all" ? `p=${encodeURIComponent(period)}` : "",
                  ]
                    .filter(Boolean)
                    .join("&") || undefined
                }
              />
              <span className="inline-flex items-center gap-1.5 text-rw-sub tabular-nums shrink-0">
                <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                  <span
                    className={`block h-full rounded-full ${showWr ? "bg-rw-teal/75" : "bg-rw-accent/65"}`}
                    style={{ width: `${Math.max(8, Math.round((n / maxN) * 100))}%` }}
                  />
                </span>
                <HubLink to={{ kind: "finder", query: finderQuery }} className="hover:text-rw-accent hover:underline">
                  {n}
                </HubLink>
                {showWr && (
                  <>
                    <span className="text-rw-muted">·</span>
                    <HubLink
                      to={{ kind: "finder", query: finderQuery }}
                      className={`w-9 text-right hover:underline ${good ? "text-rw-teal font-semibold" : "text-rw-red"}`}
                    >
                      {winRate(w, n)}
                    </HubLink>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const RoleLine: React.FC<{ title: string; shares: [number, number][]; teamSlug?: string; period?: string }> = ({ title, shares, teamSlug, period }) =>
  shares.length ? (
    <>
      <dt className="text-[10px] font-semibold text-rw-muted self-center">{title}</dt>
      <dd className="text-xs text-rw-text flex flex-wrap gap-x-3 gap-y-1">
        {shares.slice(0, 3).map(([r, v]) => {
          const pctVal = Math.round(v * 100);
          const roleQuery = new URLSearchParams({
            ...(period && period !== "all" ? { p: period } : {}),
            ...(ROLES[r] ? { role: ROLES[r] } : {}),
          }).toString();
          return (
            <span key={r} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {teamSlug ? (
                <HubLink
                  to={{
                    kind: "team",
                    slug: teamSlug,
                    tab: "champions",
                    ...(roleQuery ? { query: roleQuery } : {}),
                  }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {roleName(ROLES[r])}
                </HubLink>
              ) : (
                <span>{roleName(ROLES[r])}</span>
              )}
              <span className="w-7 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.min(100, pctVal))}%` }} />
              </span>
              {teamSlug ? (
                <HubLink
                  to={{
                    kind: "team",
                    slug: teamSlug,
                    tab: "champions",
                    ...(roleQuery ? { query: roleQuery } : {}),
                  }}
                  className="tabular-nums text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {pctVal}%
                </HubLink>
              ) : (
                <span className="tabular-nums text-rw-sub">{pctVal}%</span>
              )}
            </span>
          );
        })}
      </dd>
    </>
  ) : null;

/** [champion a, champion b, games, wins, their combined gold lead at 15 or null] */
type Pair = [string, string, number, number, number | null];

const Pairs: React.FC<{
  title: string;
  hint?: string;
  list: Pair[];
  teamName?: string;
  oppSlug?: string;
  rosterSlugs?: string[];
  role?: string;
  period?: string;
  side?: "b" | "r";
}> = ({ title, hint, list, teamName, oppSlug, rosterSlugs, role, period, side }) => {
  if (!list.length) return null;
  const maxN = Math.max(1, ...list.map(([, , n]) => n));
  const periodParam =
    period?.startsWith("y") && period.length === 5
      ? `&year=${encodeURIComponent(period.slice(1))}`
      : period?.startsWith("e:")
        ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}`
        : period?.startsWith("p:")
          ? `&patch=${encodeURIComponent(period.slice(2))}`
          : "";
  const playerParam = `${rosterSlugs?.[0] ? `player=${encodeURIComponent(rosterSlugs[0])}&` : ""}${rosterSlugs?.[1] && rosterSlugs[1] !== rosterSlugs?.[0] ? `vsplayer=${encodeURIComponent(rosterSlugs[1])}&` : ""}`;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-rw-muted mb-1" title={hint}>
        {title}
      </div>
      <ul className="text-xs space-y-1">
        {list.map(([a, b, n, w, gd]) => {
          const good = n > 0 && w / n >= 0.5;
          const finderQuery = `${teamName ? `team=${encodeURIComponent(teamName)}&` : ""}${oppSlug ? `vs=${encodeURIComponent(oppSlug)}&` : ""}${playerParam}champ=${encodeURIComponent(`${resolveChampSlug(a)},${resolveChampSlug(b)}`)}${role ? `&role=${encodeURIComponent(role)}` : ""}${side ? `&side=${side}` : ""}${periodParam}`;
          return (
            <li key={`${a}-${b}`} className="flex items-center justify-between gap-2 min-w-0">
              <span className="flex items-center gap-1 min-w-0 truncate" title={`${champName(a)} + ${champName(b)}`}>
                <ChampLink
                  name={a}
                  size={18}
                  query={
                    [
                      teamName ? `team=${encodeURIComponent(teamName)}` : "",
                      b !== a ? `vschamp=${encodeURIComponent(resolveChampSlug(b))}` : "",
                      period && period !== "all" ? `p=${encodeURIComponent(period)}` : "",
                    ]
                      .filter(Boolean)
                      .join("&") || undefined
                  }
                />
                <span className="text-rw-muted">+</span>
                <ChampLink
                  name={b}
                  size={18}
                  query={
                    [
                      teamName ? `team=${encodeURIComponent(teamName)}` : "",
                      a !== b ? `vschamp=${encodeURIComponent(resolveChampSlug(a))}` : "",
                      period && period !== "all" ? `p=${encodeURIComponent(period)}` : "",
                    ]
                      .filter(Boolean)
                      .join("&") || undefined
                  }
                />
              </span>
              <span className="inline-flex items-center gap-1 text-rw-sub tabular-nums shrink-0">
                <span className="w-7 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                  <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(8, Math.round((n / maxN) * 100))}%` }} />
                </span>
                <HubLink to={{ kind: "finder", query: finderQuery }} className="hover:text-rw-accent hover:underline">
                  {n}
                </HubLink>
                <span className="text-rw-muted">·</span>
                <HubLink
                  to={{ kind: "finder", query: finderQuery }}
                  className={`hover:underline ${good ? "text-rw-teal font-semibold" : "text-rw-red"}`}
                >
                  {winRate(w, n)}
                </HubLink>
                {gd != null && (
                  <>
                    <span className="text-rw-muted">·</span>
                    <HubLink
                      to={{ kind: "finder", query: finderQuery }}
                      className={`hover:underline ${gd >= 0 ? "text-rw-teal" : "text-rw-red"}`}
                      title={tl("Their combined gold lead over the lane opponents at 15 minutes")}
                    >
                      {`${gd > 0 ? "+" : ""}${gd}`}
                    </HubLink>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const DraftTendencies: React.FC<{
  rows: TeamGameRow[];
  teamName?: string;
  teamSlug?: string;
  oppSlug?: string;
  rosterSlugs?: string[];
  period?: string;
  periodLabel?: string;
}> = ({ rows, teamName, teamSlug, oppSlug, rosterSlugs, period, periodLabel }) => {
  const d = useMemo(() => draftTendencies(rows), [rows]);
  if (d.games < 3) return null;
  const resolvedSlug = teamSlug || (teamName ? resolveTeamAlias(teamName) || prettySlug(teamName) : undefined);
  const patchYear =
    period?.startsWith("p:")
      ? rows[0]?.[0] && /^\d{4}/.test(rows[0][0])
        ? rows[0][0].slice(0, 4)
        : undefined
      : undefined;
  const periodParam =
    period?.startsWith("y") && period.length === 5
      ? `&year=${encodeURIComponent(period.slice(1))}`
      : period?.startsWith("e:")
        ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}`
        : period?.startsWith("p:")
          ? `&patch=${encodeURIComponent(period.slice(2))}${patchYear ? `&year=${encodeURIComponent(patchYear)}` : ""}`
          : "";
  const roleStr = (shares: [number, number][]) =>
    shares.length ? shares.slice(0, 2).map(([r, v]) => `${roleName(ROLES[r])} ${Math.round(v * 100)}%`).join(" · ") : "–";
  const champStr = (list: Count[], n = 3) =>
    list.length ? list.slice(0, n).map(([c, g, w]) => `${champName(c)} (${g} · ${winRate(w, g)})`).join(", ") : "–";
  return (
    <div className="@container space-y-2 pt-2 border-t border-rw-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-rw-text">{tl("Draft tendencies")}</h4>
          {resolvedSlug ? (
            <HubLink
              to={{
                kind: "finder",
                query: `team=${encodeURIComponent(resolvedSlug)}${oppSlug ? `&vs=${encodeURIComponent(oppSlug)}` : ""}${
                  rosterSlugs?.[0] ? `&player=${encodeURIComponent(rosterSlugs[0])}` : ""
                }${rosterSlugs?.[1] && rosterSlugs[1] !== rosterSlugs?.[0] ? `&vsplayer=${encodeURIComponent(rosterSlugs[1])}` : ""}${periodParam}`,
              }}
              className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
            >
              {tl("{n} games with the draft order", { n: d.games })}
            </HubLink>
          ) : (
            <span className="text-[10px] text-rw-muted">{tl("{n} games with the draft order", { n: d.games })}</span>
          )}
        </div>
        {teamName && (
          <span className="flex flex-wrap items-center gap-2">
            {resolvedSlug && (() => {
              const topOpeners = Array.from(new Set([...d.b1.map((x) => x[0]), ...d.r12.map((x) => x[0])]));
              const topOpenerSlugs = topOpeners.slice(0, 2).map((c) => resolveChampSlug(c)).filter(Boolean);
              const topOpenerStr = topOpenerSlugs.join(",");
              return (
                <>
                  <HubLink
                    to={{ kind: "prep", a: resolvedSlug, ...(oppSlug ? { b: oppSlug } : {}), ...(period && period !== "all" ? { period } : {}) }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "compare", mode: "team", a: resolvedSlug, ...(oppSlug ? { b: oppSlug } : {}), ...(period && period !== "all" ? { period } : {}) }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        teams: oppSlug ? `${resolvedSlug},${oppSlug}` : resolvedSlug,
                        ...(period && period !== "all" ? { p: period } : {}),
                        ...(topOpenerStr ? { champ: topOpenerStr } : {}),
                        ...(d.firstRole[0] ? { role: ROLES[d.firstRole[0][0]] } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  {topOpenerSlugs[0] && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: new URLSearchParams({
                          champ: topOpenerSlugs[0],
                          ...(topOpenerSlugs[1] ? { vs: topOpenerSlugs[1] } : {}),
                          ...(d.firstRole[0] ? { role: ROLES[d.firstRole[0][0]] } : {}),
                          ...(period?.startsWith("y") && period.length === 5
                            ? { patch: period, year: period.slice(1) }
                            : period?.startsWith("p:")
                              ? { patch: period.slice(2), ...(patchYear ? { year: patchYear } : {}) }
                              : period?.startsWith("e:")
                                ? { event: resolveEventSlug(period.slice(2)) }
                                : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                      data-nocapture="1"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: new URLSearchParams({
                        ...(topOpenerSlugs[0] ? { champ: topOpenerSlugs[0] } : {}),
                        ...(topOpenerSlugs[1] ? { vschamp: topOpenerSlugs[1] } : {}),
                        ...(resolvedSlug ? { team: resolvedSlug } : {}),
                        ...(oppSlug ? { vs: oppSlug } : {}),
                        ...(rosterSlugs?.[0] ? { player: rosterSlugs[0] } : {}),
                        ...(rosterSlugs?.[1] ? { vsplayer: rosterSlugs[1] } : {}),
                        ...(d.firstRole[0] ? { role: ROLES[d.firstRole[0][0]] } : {}),
                        ...(period?.startsWith("y") && period.length === 5
                          ? { year: period.slice(1) }
                          : period?.startsWith("e:")
                            ? { event: resolveEventSlug(period.slice(2)) }
                            : period?.startsWith("p:")
                              ? { patch: period.slice(2), ...(patchYear ? { year: patchYear } : {}) }
                              : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      ...((period && period !== "all") || topOpenerStr || d.firstRole[0]
                        ? {
                            query: new URLSearchParams({
                              ...(period?.startsWith("y") && period.length === 5
                                ? { key: period, year: period.slice(1) }
                                : period?.startsWith("e:")
                                  ? { event: resolveEventSlug(period.slice(2)) }
                                  : period?.startsWith("p:")
                                    ? { key: `p${period.slice(2)}`, patch: period.slice(2), ...(patchYear ? { year: patchYear } : {}) }
                                    : {}),
                              ...(topOpenerStr ? { q: topOpenerStr } : {}),
                              ...(d.firstRole[0] ? { role: ROLES[d.firstRole[0][0]] } : {}),
                            }).toString(),
                          }
                        : {}),
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
                        q: oppSlug ? `${resolvedSlug},${oppSlug}` : resolvedSlug,
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
                        ...(resolvedSlug || teamName ? { q: [resolvedSlug || teamName!, oppSlug, ...(rosterSlugs || [])].filter(Boolean).join(",") } : {}),
                        ...(topOpenerSlugs[0] ? { champ: topOpenerSlugs[0] } : {}),
                        ...(d.firstRole[0] ? { role: ROLES[d.firstRole[0][0]] } : {}),
                        ...(period?.startsWith("y") && period.length === 5 ? { year: period.slice(1) } : patchYear ? { year: patchYear } : {}),
                        ...(period?.startsWith("e:") ? { event: resolveEventSlug(period.slice(2)) } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "team",
                      slug: resolvedSlug,
                      tab: "champions",
                      ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Champions")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `team=${encodeURIComponent(resolvedSlug)}${oppSlug ? `&vs=${encodeURIComponent(oppSlug)}` : ""}${
                        rosterSlugs?.[0] ? `&player=${encodeURIComponent(rosterSlugs[0])}` : ""
                      }${rosterSlugs?.[1] ? `&vsplayer=${encodeURIComponent(rosterSlugs[1])}` : ""}${
                        topOpenerSlugs[0] ? `&champ=${encodeURIComponent(topOpenerSlugs[0])}` : ""
                      }${topOpenerSlugs[1] ? `&vschamp=${encodeURIComponent(topOpenerSlugs[1])}` : ""}${d.firstRole[0] ? `&role=${encodeURIComponent(ROLES[d.firstRole[0][0]])}` : ""}${periodParam}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                </>
              );
            })()}
            <CopyDraftTendenciesPost
              teamName={teamName}
              sub={periodLabel ? `${periodLabel} · ${tl("{n} games", { n: d.games })}` : tl("{n} games", { n: d.games })}
              url={
                resolvedSlug
                  ? hubShareUrl({
                      kind: "team",
                      slug: resolvedSlug,
                      tab: "champions",
                      ...(period && period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}),
                    })
                  : "https://riftwise.gg"
              }
              rows={[
                ...(d.b1.length ? [`${tl("First pick (blue)")}: ${champStr(d.b1, 3)}`] : []),
                ...(d.r12.length ? [`${tl("First picks (red)")}: ${champStr(d.r12, 3)}`] : []),
                ...(d.bans1.length ? [`${tl("Bans, phase 1")}: ${d.bans1.slice(0, 4).map(([c, g]) => `${champName(c)} (${g})`).join(", ")}`] : []),
                ...(d.firstRole.length ? [`${tl("First role locked in")}: ${roleStr(d.firstRole)}`] : []),
                ...(d.flex.length ? [`${tl("Flex picks")}: ${d.flex.slice(0, 4).map(([c]) => champName(c)).join(", ")}`] : []),
              ]}
            />
            <SectionCard
              section={tl("Draft tendencies")}
              name={teamName}
              sub={periodLabel ? `${periodLabel} · ${tl("{n} games", { n: d.games })}` : tl("{n} games", { n: d.games })}
              rows={() =>
                [
                  ...(d.b1.length ? [{ champ: d.b1[0][0], team: teamName, label: tl("First pick (blue)"), sub: champStr(d.b1, 3), value: `${d.b1[0][1]}G` }] : []),
                  ...(d.r12.length ? [{ champ: d.r12[0][0], team: teamName, label: tl("First picks (red)"), sub: champStr(d.r12, 3), value: `${d.r12[0][1]}G` }] : []),
                  ...(d.bans1.length ? [{ champ: d.bans1[0][0], team: teamName, label: tl("Bans, phase 1"), sub: d.bans1.slice(0, 4).map(([c, g]) => `${champName(c)} (${g})`).join(", "), value: `${d.bans1[0][1]}G` }] : []),
                  ...(d.firstRole.length ? [{ team: teamName, label: tl("First role locked in"), value: roleStr(d.firstRole) }] : []),
                  ...(d.r5.length ? [{ team: teamName, label: tl("Last pick on red (R5)"), value: roleStr(d.r5) }] : []),
                  ...(d.b45.length ? [{ team: teamName, label: tl("Last picks on blue (B4-B5)"), value: roleStr(d.b45) }] : []),
                  ...(d.botDuos.length ? [{ champ: d.botDuos[0][0], team: teamName, label: tl("Bot lane pairs"), sub: `${champName(d.botDuos[0][0])} + ${champName(d.botDuos[0][1])}`, value: `${d.botDuos[0][2]}G · ${winRate(d.botDuos[0][3], d.botDuos[0][2])}` }] : []),
                  ...(d.flex.length ? [{ champ: d.flex[0][0], team: teamName, label: tl("Flex picks"), sub: d.flex.slice(0, 4).map(([c]) => champName(c)).join(", "), value: `${d.flex.length}` }] : []),
                ].map((r, idx) => ({ ...r, rank: idx + 1 }))
              }
            />
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-x-6 gap-y-3">
        <List title={tl("First pick (blue)")} hint={tl("Their first pick when on blue side (B1)")} list={d.b1} showWr teamName={resolvedSlug || teamName} oppSlug={oppSlug} rosterSlugs={rosterSlugs} period={period} side="b" />
        <List title={tl("First picks (red)")} hint={tl("Their first two picks when on red side (R1-R2)")} list={d.r12} showWr teamName={resolvedSlug || teamName} oppSlug={oppSlug} rosterSlugs={rosterSlugs} period={period} side="r" />
        <List title={tl("Bans, phase 1")} hint={tl("Their first three bans")} list={d.bans1} teamName={resolvedSlug || teamName} oppSlug={oppSlug} rosterSlugs={rosterSlugs} period={period} isBan />
        <List title={tl("Bans, phase 2")} hint={tl("Their last two bans")} list={d.bans2} teamName={resolvedSlug || teamName} oppSlug={oppSlug} rosterSlugs={rosterSlugs} period={period} isBan />
      </div>
      <dl className="grid grid-cols-1 @md:grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <RoleLine title={tl("First role locked in")} shares={d.firstRole} teamSlug={resolvedSlug} period={period} />
        <RoleLine title={tl("Role kept for last")} shares={d.lastRole} teamSlug={resolvedSlug} period={period} />
        <RoleLine title={tl("Phase 1 picks")} shares={d.phase1} teamSlug={resolvedSlug} period={period} />
        <RoleLine title={tl("Phase 2 picks")} shares={d.phase2} teamSlug={resolvedSlug} period={period} />
        <RoleLine title={tl("Last pick on red (R5)")} shares={d.r5} teamSlug={resolvedSlug} period={period} />
        <RoleLine title={tl("Last picks on blue (B4-B5)")} shares={d.b45} teamSlug={resolvedSlug} period={period} />
      </dl>
      {(d.botDuos.length > 0 || d.midJungle.length > 0 || d.r12pairs.length > 0) && (
        <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-x-6 gap-y-3">
          <Pairs
            title={tl("Jungle + mid pairs")}
            hint={tl("Games · win rate · combined gold lead at 15")}
            list={d.midJungle}
            teamName={resolvedSlug || teamName}
            oppSlug={oppSlug}
            rosterSlugs={rosterSlugs}
            role="Jungle,Mid"
            period={period}
          />
          <Pairs title={tl("Bot lane pairs")} hint={tl("Games · win rate · combined gold lead at 15")} list={d.botDuos} teamName={resolvedSlug || teamName} oppSlug={oppSlug} rosterSlugs={rosterSlugs} role="Bot,Support" period={period} />
          <Pairs title={tl("Red openers (R1 + R2)")} list={d.r12pairs} teamName={resolvedSlug || teamName} oppSlug={oppSlug} rosterSlugs={rosterSlugs} period={period} side="r" />
        </div>
      )}
      <div className="text-xs flex flex-wrap items-baseline gap-x-2 gap-y-0.5" title={tl("Champions each role played in this period (in brackets: 2+ games). In Fearless, a Bo5 needs up to five per role.")}>
        <span className="text-[10px] font-semibold text-rw-muted shrink-0">{tl("Pool depth")}</span>
        {d.depth.map(([n, two], i) => (
          <span key={i} className={`whitespace-nowrap ${n < 5 ? "text-rw-red" : "text-rw-text"}`}>
            {i > 0 ? "· " : ""}
            {resolvedSlug ? (
              <HubLink
                to={{
                  kind: "team",
                  slug: resolvedSlug,
                  tab: "champions",
                  query: new URLSearchParams({
                    ...(period && period !== "all" ? { p: period } : {}),
                    ...(ROLES[i] ? { role: ROLES[i] } : {}),
                  }).toString(),
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {`${roleName(ROLES[i])} ${n} (${two})`}
              </HubLink>
            ) : (
              `${roleName(ROLES[i])} ${n} (${two})`
            )}
          </span>
        ))}
      </div>
      {d.flex.length > 0 && (
        <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[10px] font-semibold text-rw-muted">{tl("Flex picks")}</span>
          {d.flex.map(([c, roles]) => {
            const roleLabel = `(${roles.map((r) => roleName(ROLES[r])).join(" / ")})`;
            return (
              <span key={c} className="flex items-center gap-1">
                <ChampLink
                  name={c}
                  size={16}
                  query={
                    [
                      resolvedSlug ? `team=${encodeURIComponent(resolvedSlug)}` : "",
                      ROLES[roles[0]] ? `role=${encodeURIComponent(ROLES[roles[0]])}` : "",
                      period && period !== "all" ? `p=${encodeURIComponent(period)}` : "",
                    ]
                      .filter(Boolean)
                      .join("&") || undefined
                  }
                />
                {resolvedSlug ? (
                  <HubLink
                    to={{
                      kind: "team",
                      slug: resolvedSlug,
                      tab: "champions",
                      query: `champ=${encodeURIComponent(resolveChampSlug(c))}${ROLES[roles[0]] ? `&role=${encodeURIComponent(ROLES[roles[0]])}` : ""}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                    }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {roleLabel}
                  </HubLink>
                ) : (
                  <span className="text-rw-muted">{roleLabel}</span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

const CopyDraftTendenciesPost: React.FC<{
  teamName: string;
  sub: string;
  url: string;
  rows: string[];
}> = ({ teamName, sub, url, rows }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [`${tl("Draft tendencies")} · ${teamName} (${sub})`];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push(url);
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
