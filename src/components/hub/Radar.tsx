/**
 * A radar ("spider") chart of two sides on the same axes, each 0-100 (a percentile: 50 is average, the edge is the
 * best). Compare draws teams on their league-season percentiles and players on the parts of the RiftWise rating.
 */
import React from "react";
import { tl } from "../../i18n";

export interface RadarSide {
  name: string;
  /** one 0-100 value per axis (null: not known, drawn at the middle) */
  values: (number | null)[];
}

// the chart's box, its centre and the outer ring's radius (labels sit outside the ring, at 125%)
const SIZE = 300;
const C = SIZE / 2;
const R = 86;

export const Radar: React.FC<{ axes: string[]; sides: [RadarSide, RadarSide]; note?: string }> = ({ axes, sides, note }) => {
  const n = axes.length;
  if (n < 3) return null;
  const at = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const r = (Math.max(0, Math.min(125, v)) / 100) * R;
    return [C + r * Math.cos(ang), C + r * Math.sin(ang)] as const;
  };
  const shape = (vals: (number | null)[]) => vals.map((v, i) => at(i, Math.min(100, v ?? 50)).join(",")).join(" ");
  const cls = ["fill-rw-accent/20 stroke-rw-accent", "fill-rw-teal/20 stroke-rw-teal"];
  const dot = ["fill-rw-accent", "fill-rw-teal"];
  return (
    <figure className="flex flex-col items-center gap-1" aria-label={tl("{a} and {b} on the same scale", { a: sides[0].name, b: sides[1].name })}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[22rem] h-auto overflow-visible" role="img">
        {[25, 50, 75, 100].map((ring) => (
          <polygon
            key={ring}
            points={axes.map((_, i) => at(i, ring).join(",")).join(" ")}
            className={`fill-none ${ring === 50 ? "stroke-rw-line" : "stroke-rw-border"}`}
            strokeWidth={ring === 50 ? 1 : 0.75}
            strokeDasharray={ring === 50 ? "3 3" : undefined}
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = at(i, 100);
          return <line key={i} x1={C} y1={C} x2={x} y2={y} className="stroke-rw-border" strokeWidth={0.75} />;
        })}
        {sides.map((s, k) => (
          <g key={s.name + k}>
            <polygon points={shape(s.values)} className={cls[k]} strokeWidth={1.5} strokeLinejoin="round" />
            {s.values.map((v, i) => {
              const [x, y] = at(i, Math.min(100, v ?? 50));
              return <circle key={i} cx={x} cy={y} r={2.2} className={dot[k]} />;
            })}
          </g>
        ))}
        {axes.map((a, i) => {
          const [x, y] = at(i, 125);
          const anchor = Math.abs(x - C) < 6 ? "middle" : x > C ? "start" : "end";
          return (
            <text key={a} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fill-rw-sub text-[9px]">
              {a}
            </text>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
        {sides.map((s, k) => (
          <span key={s.name + k} className="flex items-center gap-1.5 text-rw-text">
            <span className={`w-2.5 h-2.5 rounded-sm ${k ? "bg-rw-teal" : "bg-rw-accent"}`} aria-hidden="true" />
            {s.name}
          </span>
        ))}
      </figcaption>
      {note && <p className="text-[10px] text-rw-muted text-center max-w-[24rem]">{note}</p>}
    </figure>
  );
};
