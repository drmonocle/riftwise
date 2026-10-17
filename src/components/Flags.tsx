/**
 * Small flags for the language picker, drawn here (Windows shows flag emoji as two letters). English is the
 * US and UK flags cut in half diagonally. Each is 3:2 (30 x 20 units), simplified to read at 18 pixels wide.
 */
import React from "react";
import type { Lang } from "../i18n";

/** Points of a five-pointed star around (cx, cy), outer radius r, turned by rot degrees. */
function star(cx: number, cy: number, r: number, rot = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = ((rot - 90 + i * 36) * Math.PI) / 180;
    const len = i % 2 ? r * 0.382 : r;
    pts.push(`${(cx + len * Math.cos(rad)).toFixed(2)},${(cy + len * Math.sin(rad)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const US = (
  <>
    {Array.from({ length: 7 }, (_, i) => (
      <rect key={i} y={(i * 20) / 7} width="30" height={20 / 7} fill={i % 2 ? "#fff" : "#b22234"} />
    ))}
    <rect width="13" height={(20 / 7) * 4} fill="#3c3b6e" />
    {[2.2, 6.5, 10.8].map((x) => [2.2, 5.7, 9.2].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.85" fill="#fff" />))}
  </>
);

const UK = (
  <>
    <rect width="30" height="20" fill="#012169" />
    <path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" strokeWidth="4" />
    <path d="M0,0 L30,20 M30,0 L0,20" stroke="#c8102e" strokeWidth="1.6" />
    <path d="M15,0 V20 M0,10 H30" stroke="#fff" strokeWidth="6" />
    <path d="M15,0 V20 M0,10 H30" stroke="#c8102e" strokeWidth="3.4" />
  </>
);

// English: the US flag top left, the UK flag bottom right (id: unique per flag on the page)
const english = (id: string) => (
  <>
    <defs>
      <clipPath id={`${id}us`}>
        <path d="M0,0 H30 L0,20 Z" />
      </clipPath>
      <clipPath id={`${id}uk`}>
        <path d="M30,0 V20 H0 Z" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}us)`}>{US}</g>
    <g clipPath={`url(#${id}uk)`}>{UK}</g>
    <path d="M30,0 L0,20" stroke="#fff" strokeWidth="0.8" />
  </>
);

const FLAGS: Record<Exclude<Lang, "en">, React.ReactNode> = {
  es: (
    <>
      <rect width="30" height="20" fill="#aa151b" />
      <rect y="5" width="30" height="10" fill="#f1bf00" />
    </>
  ),
  "pt-BR": (
    <>
      <rect width="30" height="20" fill="#009c3b" />
      <path d="M15,2 L28,10 L15,18 L2,10 Z" fill="#ffdf00" />
      <circle cx="15" cy="10" r="4.6" fill="#002776" />
      <path d="M10.6,9 Q15,7.6 19.5,10.6" stroke="#fff" strokeWidth="0.9" fill="none" />
    </>
  ),
  ko: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <g transform="rotate(33.7 15 10)">
        <path d="M10,10 A5,5 0 0 1 20,10 A2.5,2.5 0 0 1 15,10 A2.5,2.5 0 0 0 10,10 Z" fill="#cd2e3a" />
        <path d="M10,10 A5,5 0 0 0 20,10 A2.5,2.5 0 0 1 15,10 A2.5,2.5 0 0 0 10,10 Z" fill="#0047a0" />
      </g>
      {/* the four trigrams, as three short bars at each corner */}
      {[
        [5, 4, -33.7],
        [25, 16, -33.7],
        [25, 4, 33.7],
        [5, 16, 33.7],
      ].map(([x, y, a]) => (
        <g key={`${x}-${y}`} transform={`rotate(${a} ${x} ${y})`} fill="#000">
          <rect x={x - 2.4} y={y - 2} width="4.8" height="0.9" />
          <rect x={x - 2.4} y={y - 0.45} width="4.8" height="0.9" />
          <rect x={x - 2.4} y={y + 1.1} width="4.8" height="0.9" />
        </g>
      ))}
    </>
  ),
  vi: (
    <>
      <rect width="30" height="20" fill="#da251d" />
      <polygon points={star(15, 10.4, 6)} fill="#ff0" />
    </>
  ),
  "zh-CN": (
    <>
      <rect width="30" height="20" fill="#de2910" />
      <polygon points={star(5, 5, 3)} fill="#ffde00" />
      <polygon points={star(10, 2, 1, 23)} fill="#ffde00" />
      <polygon points={star(12, 4, 1, 45)} fill="#ffde00" />
      <polygon points={star(12, 7, 1, 0)} fill="#ffde00" />
      <polygon points={star(10, 9, 1, 21)} fill="#ffde00" />
    </>
  ),
  "zh-TW": (
    <>
      <rect width="30" height="20" fill="#fe0000" />
      <rect width="15" height="10" fill="#000095" />
      <polygon
        points={Array.from({ length: 24 }, (_, i) => {
          const a = ((i * 15 - 90) * Math.PI) / 180;
          const r = i % 2 ? 2.4 : 3.8;
          return `${(7.5 + r * Math.cos(a)).toFixed(2)},${(5 + r * Math.sin(a)).toFixed(2)}`;
        }).join(" ")}
        fill="#fff"
      />
      <circle cx="7.5" cy="5" r="2.1" fill="#000095" />
      <circle cx="7.5" cy="5" r="1.75" fill="#fff" />
    </>
  ),
  ja: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <circle cx="15" cy="10" r="6" fill="#bc002d" />
    </>
  ),
  fr: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#002395" />
      <rect x="20" width="10" height="20" fill="#ed2939" />
    </>
  ),
  de: (
    <>
      <rect width="30" height="20" fill="#000" />
      <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
      <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
    </>
  ),
  tr: (
    <>
      <rect width="30" height="20" fill="#e30a17" />
      <circle cx="11" cy="10" r="5" fill="#fff" />
      <circle cx="12.25" cy="10" r="4" fill="#e30a17" />
      <polygon points={star(17.6, 10, 2.5, -18)} fill="#fff" />
    </>
  ),
};

export const Flag: React.FC<{ lang: Lang; className?: string }> = ({ lang, className }) => {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden="true" focusable="false">
      {lang === "en" ? english(`rwf${id}`) : FLAGS[lang]}
      <rect width="30" height="20" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
    </svg>
  );
};
