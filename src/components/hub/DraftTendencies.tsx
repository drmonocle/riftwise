/**
 * How a team drafts, over the chosen period: blue-side first picks, red-side first two picks, phase 1 and phase 2
 * bans, which role they lock in first and keep for last, which roles they pick in each phase, flex picks
 * (champions they played in two roles), their most played lane pairs, and how deep each role's pool is (Fearless).
 */
import React, { useMemo } from "react";
import { tl, roleName } from "../../i18n";
import { winRate } from "../../stats";
import type { TeamGameRow } from "../../hub/types";
import { ROLES } from "../../hub/champAgg";
import { champName } from "../../champions";
import { ChampLink } from "./ui";

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

const List: React.FC<{ title: string; hint?: string; list: Count[]; showWr?: boolean }> = ({ title, hint, list, showWr }) =>
  list.length ? (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-rw-muted" title={hint}>
        {title}
      </div>
      {/* what the numbers are: games (and win rate) */}
      <div className="text-[10px] text-rw-muted mb-1">{showWr ? tl("games · win rate") : tl("games")}</div>
      <ul className="text-xs space-y-1">
        {list.map(([c, n, w]) => (
          <li key={c} className="flex justify-between gap-2 min-w-0">
            <ChampLink name={c} size={16} />
            <span className="text-rw-sub tabular-nums shrink-0">
              {n}
              {showWr ? ` · ${winRate(w, n)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

const RoleLine: React.FC<{ title: string; shares: [number, number][] }> = ({ title, shares }) =>
  shares.length ? (
    <>
      <dt className="text-[10px] font-semibold text-rw-muted self-center">{title}</dt>
      <dd className="text-xs text-rw-text flex flex-wrap gap-x-3">
        {shares.slice(0, 3).map(([r, v]) => (
          <span key={r} className="whitespace-nowrap">
            {roleName(ROLES[r])} <span className="tabular-nums text-rw-sub">{Math.round(v * 100)}%</span>
          </span>
        ))}
      </dd>
    </>
  ) : null;

/** [champion a, champion b, games, wins, their combined gold lead at 15 or null] */
type Pair = [string, string, number, number, number | null];

const Pairs: React.FC<{ title: string; hint?: string; list: Pair[] }> = ({ title, hint, list }) =>
  list.length ? (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-rw-muted mb-1" title={hint}>
        {title}
      </div>
      <ul className="text-xs space-y-1">
        {list.map(([a, b, n, w, gd]) => (
          <li key={`${a}-${b}`} className="flex justify-between gap-2 min-w-0">
            <span className="flex items-center gap-1 min-w-0" title={`${champName(a)} + ${champName(b)}`}>
              <ChampLink name={a} size={18} showName={false} />
              <span className="text-rw-muted">+</span>
              <ChampLink name={b} size={18} showName={false} />
            </span>
            <span className="text-rw-sub tabular-nums shrink-0">
              {n} · {winRate(w, n)}
              {gd != null && (
                <span title={tl("Their combined gold lead over the lane opponents at 15 minutes")}>
                  {` · ${gd > 0 ? "+" : ""}${gd}`}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

export const DraftTendencies: React.FC<{ rows: TeamGameRow[] }> = ({ rows }) => {
  const d = useMemo(() => draftTendencies(rows), [rows]);
  if (d.games < 3) return null;
  return (
    <div className="@container space-y-2 pt-2 border-t border-rw-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-rw-text">{tl("Draft tendencies")}</h4>
        <span className="text-[10px] text-rw-muted">{tl("{n} games with the draft order", { n: d.games })}</span>
      </div>
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-x-6 gap-y-3">
        <List title={tl("First pick (blue)")} hint={tl("Their first pick when on blue side (B1)")} list={d.b1} showWr />
        <List title={tl("First picks (red)")} hint={tl("Their first two picks when on red side (R1-R2)")} list={d.r12} showWr />
        <List title={tl("Bans, phase 1")} hint={tl("Their first three bans")} list={d.bans1} />
        <List title={tl("Bans, phase 2")} hint={tl("Their last two bans")} list={d.bans2} />
      </div>
      <dl className="grid grid-cols-1 @md:grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <RoleLine title={tl("First role locked in")} shares={d.firstRole} />
        <RoleLine title={tl("Role kept for last")} shares={d.lastRole} />
        <RoleLine title={tl("Phase 1 picks")} shares={d.phase1} />
        <RoleLine title={tl("Phase 2 picks")} shares={d.phase2} />
        <RoleLine title={tl("Last pick on red (R5)")} shares={d.r5} />
        <RoleLine title={tl("Last picks on blue (B4-B5)")} shares={d.b45} />
      </dl>
      {(d.botDuos.length > 0 || d.midJungle.length > 0 || d.r12pairs.length > 0) && (
        <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-x-6 gap-y-3">
          <Pairs
            title={tl("Jungle + mid pairs")}
            hint={tl("Games · win rate · combined gold lead at 15")}
            list={d.midJungle}
          />
          <Pairs title={tl("Bot lane pairs")} hint={tl("Games · win rate · combined gold lead at 15")} list={d.botDuos} />
          <Pairs title={tl("Red openers (R1 + R2)")} list={d.r12pairs} />
        </div>
      )}
      <div className="text-xs" title={tl("Champions each role played in this period (in brackets: 2+ games). In Fearless, a Bo5 needs up to five per role.")}>
        <span className="text-[10px] font-semibold text-rw-muted mr-2">{tl("Pool depth")}</span>
        <span className="text-rw-text">
          {d.depth.map(([n, two], i) => (
            <span key={i} className={n < 5 ? "text-rw-red" : ""}>
              {i > 0 ? " · " : ""}
              {`${roleName(ROLES[i])} ${n} (${two})`}
            </span>
          ))}
        </span>
      </div>
      {d.flex.length > 0 && (
        <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[10px] font-semibold text-rw-muted">{tl("Flex picks")}</span>
          {d.flex.map(([c, roles]) => (
            <span key={c} className="flex items-center gap-1">
              <ChampLink name={c} size={16} />
              <span className="text-rw-muted">({roles.map((r) => roleName(ROLES[r])).join(" / ")})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
