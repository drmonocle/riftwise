/**
 * A knockout bracket drawn as columns (rounds) with lines joining each match to the match its winner plays next.
 * Used by tournament pages / the 24/7 tab (stats data) and Schedule -> Standings & Brackets (lolesports data).
 *
 * Which match a line goes to: the next round's match that has this match's winner; while the result is hidden
 * (spoilers) or not played yet, the next round's only match with one of its teams (what the boxes already show),
 * otherwise the usual halving (matches 1+2 feed match 1, 3+4 feed 2 ...), and the single match before the last
 * column feeds the final. The winner's line is highlighted only when the winner is shown.
 */
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

export interface BracketItem {
  key: string;
  /** team names or codes as they appear in the boxes ("TBD" is ignored) */
  teams: string[];
  /** the winner, only when the result is shown */
  winner?: string | null;
  node: React.ReactNode;
}

export interface BracketColumn {
  key: string;
  title: React.ReactNode;
  items: BracketItem[];
}

interface Edge {
  from: string;
  to: string;
  on: boolean;
}

const known = (t: string) => !!t && t.toUpperCase() !== "TBD";

export function bracketEdges(columns: BracketColumn[]): Edge[] {
  const edges: Edge[] = [];
  for (let c = 0; c + 1 < columns.length; c++) {
    const cur = columns[c].items;
    const next = columns[c + 1].items;
    cur.forEach((it, i) => {
      let j = -1;
      let on = false;
      const decided = !!it.winner && known(it.winner);
      if (decided) {
        // the winner plays here next; if it isn't in the next column (an upper-bracket winner skipping the lower
        // bracket), there is no line
        j = next.findIndex((n) => n.teams.includes(it.winner!));
        on = j >= 0;
        // the next match isn't filled in yet ("TBD"): the usual two-into-one place
        if (j < 0 && next.length > 0 && next.length * 2 === cur.length && next[Math.floor(i / 2)]?.teams.some((t) => !known(t))) {
          j = Math.floor(i / 2);
          on = false;
        }
      } else {
        const mine = it.teams.filter(known);
        const cand = next.map((n, k) => (n.teams.some((t) => known(t) && mine.includes(t)) ? k : -1)).filter((k) => k >= 0);
        if (cand.length === 1) j = cand[0];
        else if (next.length > 0 && next.length * 2 === cur.length) j = Math.floor(i / 2);
        // the one match before the last column (the final) feeds it
        else if (cur.length === 1 && next.length === 1 && c + 2 === columns.length) j = 0;
      }
      if (j >= 0) edges.push({ from: `${c}:${i}`, to: `${c + 1}:${j}`, on });
    });
  }
  return edges;
}

export const BracketBoard: React.FC<{ columns: BracketColumn[]; colClass?: string; titleClass?: string }> = ({
  columns,
  colClass = "w-48",
  titleClass = "text-[10px] uppercase tracking-wider font-bold text-rw-muted mb-1.5 truncate",
}) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ d: string; on: boolean }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const edges = useMemo(() => bracketEdges(columns), [columns]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const draw = () => {
      const box = el.getBoundingClientRect();
      const at = (k: string) => {
        const n = el.querySelector<HTMLElement>(`[data-bk="${k}"]`);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { l: r.left - box.left, r: r.right - box.left, y: r.top - box.top + r.height / 2 };
      };
      const out: { d: string; on: boolean }[] = [];
      for (const e of edges) {
        const a = at(e.from);
        const b = at(e.to);
        if (!a || !b || b.l <= a.r) continue;
        const mx = (a.r + b.l) / 2;
        const dy = b.y - a.y;
        if (Math.abs(dy) < 1) {
          out.push({ d: `M${a.r},${a.y} H${b.l}`, on: e.on });
          continue;
        }
        // elbow with rounded corners
        const s = dy > 0 ? 1 : -1;
        const rad = Math.min(8, Math.abs(dy) / 2, (b.l - a.r) / 2);
        out.push({
          d: `M${a.r},${a.y} H${mx - rad} Q${mx},${a.y} ${mx},${a.y + s * rad} V${b.y - s * rad} Q${mx},${b.y} ${mx + rad},${b.y} H${b.l}`,
          on: e.on,
        });
      }
      setLines(out);
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [edges]);

  return (
    <div ref={wrap} className="relative flex gap-7 min-w-max items-stretch">
      <svg className="absolute left-0 top-0 pointer-events-none overflow-visible" width={size.w} height={size.h} aria-hidden="true">
        {/* draw the plain lines first so highlighted paths sit on top */}
        {[...lines].sort((x, y) => Number(x.on) - Number(y.on)).map((l, i) => (
          <path
            key={i}
            d={l.d}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={l.on ? 2 : 1.5}
            style={{ stroke: l.on ? "var(--rw-accent)" : "var(--rw-line)", opacity: l.on ? 0.9 : 0.8 }}
          />
        ))}
      </svg>
      {columns.map((col, c) => (
        <div key={col.key} className={`${colClass} flex flex-col`}>
          <div className={titleClass}>{col.title}</div>
          <div className="flex flex-col justify-around flex-1 gap-3">
            {col.items.map((it, i) => (
              <div key={it.key} data-bk={`${c}:${i}`} className="relative">
                {it.node}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
