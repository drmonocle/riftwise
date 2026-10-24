/**
 * Form over time: games played (bars) and win rate (line) by month, or by quarter / year when the games span
 * longer, for the games a "Stats for" section shows (its period and filters).
 */
import React from "react";
import { tl, locale } from "../../i18n";

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
  const buckets = trendBuckets(games);
  if (buckets.length < 3) return null;
  const W = 600;
  const H = 120;
  const top = 8;
  const bottom = 2;
  const ih = H - top - bottom;
  const bw = W / buckets.length;
  const maxG = Math.max(...buckets.map((b) => b.g));
  const y = (wr: number) => top + ih * (1 - wr);
  // the line only through buckets with 3+ games (one game is 0% or 100%)
  const pts = buckets.map((b, i) => (b.g >= 3 ? `${(i + 0.5) * bw},${y(b.w / b.g)}` : null));
  const segs: string[][] = [[]];
  for (const p of pts) {
    if (p) segs[segs.length - 1].push(p);
    else if (segs[segs.length - 1].length) segs.push([]);
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-semibold text-rw-muted">
        <span>{tl("Form over time")}</span>
        <span className="normal-case tracking-normal font-normal flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-rw-accent" /> {tl("Win rate")}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-rw-border" /> {tl("Games")}
          </span>
        </span>
      </div>
      {/* stretched to the width (preserveAspectRatio none): the labels are page text, the lines keep their thickness */}
      <div className="relative">
      <span className="absolute left-0 text-[9px] text-rw-muted" style={{ top: `calc(${(y(0.5) / H) * 100}% - 13px)` }}>
        50%
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-24" role="img" aria-label={tl("Win rate and games over time")}>
        <line x1={0} x2={W} y1={y(0.5)} y2={y(0.5)} stroke="var(--rw-line)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        {buckets.map((b, i) => {
          const h = (b.g / maxG) * ih * 0.6;
          return (
            <g key={b.key}>
              <rect x={i * bw + bw * 0.15} width={bw * 0.7} y={top + ih - h} height={h} fill="var(--rw-border)" rx={1.5}>
                <title>{`${b.label}: ${b.w}-${b.g - b.w}${b.g ? ` (${Math.round((b.w / b.g) * 100)}%)` : ""}`}</title>
              </rect>
            </g>
          );
        })}
        {segs
          .filter((s) => s.length > 1)
          .map((s, i) => (
            <polyline key={i} points={s.join(" ")} fill="none" stroke="var(--rw-accent)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
      </svg>
      </div>
      <div className="flex justify-between text-[9px] text-rw-muted">
        <span>{buckets[0].label}</span>
        <span>{buckets[buckets.length - 1].label}</span>
      </div>
    </div>
  );
};
