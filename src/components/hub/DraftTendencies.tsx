/**
 * How a team drafts, over the chosen period: blue-side first picks, red-side first two picks, phase 1 and phase 2
 * bans, which role they lock in first and keep for last, and flex picks (champions they played in two roles).
 */
import React, { useMemo } from "react";
import { tl, roleName } from "../../i18n";
import { winRate } from "../../stats";
import type { TeamGameRow } from "../../hub/types";
import { ROLES } from "../../hub/champAgg";
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
  return {
    games: withDraft.length,
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
      <div className="text-[10px] uppercase tracking-wider font-bold text-rw-muted mb-1" title={hint}>
        {title}
      </div>
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
    <div className="text-xs">
      <span className="text-[10px] uppercase tracking-wider font-bold text-rw-muted mr-2">{title}</span>
      <span className="text-rw-text">
        {shares
          .slice(0, 3)
          .map(([r, v]) => `${roleName(ROLES[r])} ${Math.round(v * 100)}%`)
          .join(" · ")}
      </span>
    </div>
  ) : null;

export const DraftTendencies: React.FC<{ rows: TeamGameRow[] }> = ({ rows }) => {
  const d = useMemo(() => draftTendencies(rows), [rows]);
  if (d.games < 3) return null;
  return (
    <div className="space-y-2 pt-2 border-t border-rw-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-rw-accent">{tl("Draft tendencies")}</h4>
        <span className="text-[10px] text-rw-muted">{tl("{n} games with the draft order", { n: d.games })}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <List title={tl("First pick (blue)")} hint={tl("Their first pick when on blue side (B1)")} list={d.b1} showWr />
        <List title={tl("First picks (red)")} hint={tl("Their first two picks when on red side (R1-R2)")} list={d.r12} showWr />
        <List title={tl("Bans, phase 1")} hint={tl("Their first three bans")} list={d.bans1} />
        <List title={tl("Bans, phase 2")} hint={tl("Their last two bans")} list={d.bans2} />
      </div>
      <RoleLine title={tl("First role locked in")} shares={d.firstRole} />
      <RoleLine title={tl("Role kept for last")} shares={d.lastRole} />
      {d.flex.length > 0 && (
        <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[10px] uppercase tracking-wider font-bold text-rw-muted">{tl("Flex picks")}</span>
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
