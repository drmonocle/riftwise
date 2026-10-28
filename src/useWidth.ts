/**
 * A box's width in CSS pixels, kept up to date as it resizes (one ResizeObserver per box). Charts draw their SVG at
 * this real size, so text, dots and lines keep their shape at any window width (a viewBox stretched with
 * preserveAspectRatio="none" squashed the gold graph's labels and turned its dots into ovals).
 */
import { useLayoutEffect, useRef, useState } from "react";

export function useWidth<T extends HTMLElement>(initial = 600): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth) setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w) setWidth((old) => (old === w ? old : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** A smooth line through points in x order that never overshoots them (monotone cubic, Fritsch–Carlson). */
export function smoothPath(p: [number, number][]): string {
  const f = (v: number) => v.toFixed(1);
  if (p.length < 3) return p.map(([a, b], i) => `${i ? "L" : "M"}${f(a)},${f(b)}`).join(" ");
  const n = p.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0] || 1));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let s = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3;
    s += ` C${f(p[i][0] + h)},${f(p[i][1] + m[i] * h)} ${f(p[i + 1][0] - h)},${f(p[i + 1][1] - m[i + 1] * h)} ${f(p[i + 1][0])},${f(p[i + 1][1])}`;
  }
  return s;
}
