/**
 * Form over time: games played (bars) and win rate (line) by month, or by quarter / year when the games span
 * longer, for the games a "Stats for" section shows (its period and filters). Drawn at the box's real width,
 * with each month's record under the pointer.
 */
import React, { useId, useState } from "react";
import { tl, locale } from "../../i18n";
import { smoothPath, useWidth } from "../../useWidth";

type Bucket = { key: string; label: string; g: number; w: number };

/** dates (YYYY-MM-DD) and results (1 won) -> buckets, oldest first: months up to 3 years, else quarters up to
 *  8 years, else years */
export function trendBuckets(games: { date: string; won: number }[]): Bucket[] {
  const dated = games.filter((x) => /^\d{4}-\d{2}/.test(x.date));
  if (!dated.length) return [];
  const dates = dated.map((x) => x.date).sort();
  const span = (Number(dates[dates.length - 1].slice(0, 4)) - Number(dates[0].slice(0, 4))) * 12 + Number(dates[dates.length - 1].slice(5, 7)) - Number(dates[0].slice(5, 7));
  const unit = span <= 36 ? "m" : span <= 96 ? "q" : "y";
  const keyOf = (d: string) => (unit === "m" ? d.slice(0, 7) : unit === "q" ? `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}` : d.slice(0, 4));
  const map = new Map<string, Bucket>();
  for (const x of dated) {
    const k = keyOf(x.date);
    const b = map.get(k) || { key: k, label: k, g: 0, w: 0 };
    b.g++;
    b.w += x.won ? 1 : 0;
    map.set(k, b);
  }
  const fmt = new Intl.DateTimeFormat(locale(), { month: "short", year: "2-digit" });
  return [...map.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => ({ ...b, label: unit === "m" ? fmt.format(new Date(`${b.key}-15T12:00:00Z`)) : b.key }));
}

export const TrendChart: React.FC<{ games: { date: string; won: number }[] }> = ({ games }) => {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const buckets = trendBuckets(games);
  if (buckets.length < 3) return null;
  // the win rate on top (its own 0-100% scale), the games each month / quarter / year as small columns under it:
  // two measures, two plots on one time line, never two scales on one plot
  const L = 30;
  const R = 6;
  const T = 6;
  const LH = 76; // win rate plot
  const GAP = 6;
  const GH = 22; // games strip
  const H = T + LH + GAP + GH + 14;
  const pw = Math.max(W - L - R, 60);
  const bw = pw / buckets.length;
  const cx = (i: number) => L + (i + 0.5) * bw;
  const y = (wr: number) => T + LH * (1 - wr);
  const maxG = Math.max(...buckets.map((b) => b.g));
  const colW = Math.max(2, Math.min(18, bw * 0.62));
  // the line only through buckets with 3+ games (one game is 0% or 100%)
  const segs: [number, number][][] = [[]];
  buckets.forEach((b, i) => {
    if (b.g >= 3) segs[segs.length - 1].push([cx(i), y(b.w / b.g)]);
    else if (segs[segs.length - 1].length) segs.push([]);
  });
  const shown = segs.filter((s) => s.length > 1);
  // a few dates along the bottom, spaced so they never run into each other
  const every = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(pw / 64))));
  const h = hover != null ? buckets[hover] : null;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(buckets.length - 1, Math.max(0, Math.floor((e.clientX - r.left - L) / bw))));
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-semibold text-rw-muted">
        <span>{tl("Form over time")}</span>
        <span className="normal-case tracking-normal font-normal flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded bg-rw-accent" /> {tl("Win rate")}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-2.5 rounded-t-sm bg-rw-line" /> {tl("Games")}
          </span>
        </span>
      </div>
      <div ref={box} className="relative select-none">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-pan-y"
          role="img"
          aria-label={tl("Win rate and games over time")}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${id}a`} gradientUnits="userSpaceOnUse" x1={0} y1={T} x2={0} y2={T + LH}>
              <stop offset="0" style={{ stopColor: "var(--rw-accent)", stopOpacity: 0.22 }} />
              <stop offset="1" style={{ stopColor: "var(--rw-accent)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} style={{ stroke: v === 0.5 ? "var(--rw-line)" : "var(--rw-border)" }} strokeWidth={1} />
              <text x={L - 5} y={y(v) + 3} textAnchor="end" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
                {Math.round(v * 100)}%
              </text>
            </g>
          ))}
          {shown.map((s, i) => (
            <path key={`a${i}`} d={`${smoothPath(s)} L${s[s.length - 1][0].toFixed(1)},${T + LH} L${s[0][0].toFixed(1)},${T + LH} Z`} style={{ fill: `url(#${id}a)` }} />
          ))}
          {shown.map((s, i) => (
            <path key={`l${i}`} d={smoothPath(s)} fill="none" style={{ stroke: "var(--rw-accent)" }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {buckets.map((b, i) => {
            const ch = Math.max(1.5, (b.g / maxG) * GH);
            const x0 = cx(i) - colW / 2;
            const y0 = T + LH + GAP + GH - ch;
            const r = Math.min(2, colW / 2, ch);
            return (
              <path
                key={b.key}
                d={`M${x0},${y0 + ch} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + colW - r} Q${x0 + colW},${y0} ${x0 + colW},${y0 + r} V${y0 + ch} Z`}
                style={{ fill: hover === i ? "var(--rw-accent)" : "var(--rw-line)" }}
              />
            );
          })}
          {buckets.map((b, i) =>
            i % every === 0 || i === buckets.length - 1 ? (
              i === buckets.length - 1 || buckets.length - 1 - i >= every / 2 ? (
                <text key={b.key} x={cx(i)} y={H - 3} textAnchor={i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle"} className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
                  {b.label}
                </text>
              ) : null
            ) : null,
          )}
          {h && (
            <g pointerEvents="none">
              <line x1={cx(hover!)} x2={cx(hover!)} y1={T} y2={T + LH} style={{ stroke: "var(--rw-sub)" }} strokeWidth={1} />
              {h.g >= 3 && <circle cx={cx(hover!)} cy={y(h.w / h.g)} r={4} style={{ fill: "var(--rw-accent)", stroke: "var(--rw-surface)" }} strokeWidth={2} />}
            </g>
          )}
        </svg>
        {h && (
          <div
            className="absolute top-0 pointer-events-none rounded border border-rw-border bg-rw-raised px-2 py-1 text-[10px] leading-tight shadow-lg whitespace-nowrap"
            style={{ left: Math.min(Math.max(cx(hover!) - 50, 0), Math.max(W - 100, 0)) }}
          >
            <div className="text-rw-muted">{h.label}</div>
            <div className="font-num font-semibold text-rw-text">
              {h.w}-{h.g - h.w} · {Math.round((h.w / h.g) * 100)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
