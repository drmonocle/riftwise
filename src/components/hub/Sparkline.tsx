/** A small line of a number over time (a team's power rating), drawn as SVG: no library, no layout cost. A smooth
 *  line over a fill that fades to nothing, and a ringed dot on today's value. */
import React, { useId } from "react";
import { smoothPath } from "../../useWidth";

export const Sparkline: React.FC<{
  /** [date, value] in date order */
  points: [string, number][];
  width?: number;
  height?: number;
  className?: string;
  /** colour of the line: up = teal, down = red, flat = muted (worked out from first to last point) */
  tone?: "auto" | "accent";
}> = ({ points, width = 120, height = 28, className = "", tone = "auto" }) => {
  const id = useId().replace(/[^a-z0-9]/gi, "");
  if (points.length < 2) return null;
  const vals = points.map((p) => p[1]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, 1);
  const pad = 4;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2);
  const d = smoothPath(points.map((p, i) => [x(i), y(p[1])]));
  const delta = vals[vals.length - 1] - vals[0];
  const color = tone === "accent" ? "var(--rw-accent)" : delta > 0 ? "var(--rw-teal)" : delta < 0 ? "var(--rw-red)" : "var(--rw-muted)";
  const last = points[points.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`${points[0][0]} ${vals[0]} → ${last[0]} ${last[1]}`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${d} L${x(points.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`} style={{ fill: `url(#${id})` }} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last[1])} r="3" fill={color} style={{ stroke: "var(--rw-surface)" }} strokeWidth="1.5" />
    </svg>
  );
};
