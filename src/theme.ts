/**
 * Colour themes. Every colour in the app is a theme colour (Tailwind `rw-*` classes, CSS variables `--rw-*`, see
 * App.css); a theme is just a set of values for them on <html data-theme="...">.
 */
export type ThemeName = "rift" | "classic" | "midnight" | "scoreboard" | "light" | "tsm" | "flyquest" | "t1";

export const THEMES: { id: ThemeName; swatch: [string, string, string] }[] = [
  { id: "rift", swatch: ["#120f2b", "#a78bfa", "#2dd4bf"] },
  { id: "classic", swatch: ["#091428", "#c8aa6e", "#0ac8b9"] },
  { id: "midnight", swatch: ["#0d1017", "#7aa2ff", "#22d3ee"] },
  { id: "scoreboard", swatch: ["#0b0c0e", "#e7e8ea", "#2dd4bf"] },
  { id: "light", swatch: ["#f6f5fb", "#5b3fd6", "#0d7f72"] },
  // team colours
  { id: "tsm", swatch: ["#121215", "#f2f2f2", "#5ab4f0"] },
  { id: "flyquest", swatch: ["#0b1811", "#3ddc84", "#7dd3fc"] },
  { id: "t1", swatch: ["#150c0e", "#ff3b55", "#e3c27a"] },
];

export const DEFAULT_THEME: ThemeName = "rift";

/** Page background per theme, for the browser / phone status bar. */
const BAR: Record<ThemeName, string> = {
  rift: "#0c0a1d",
  classic: "#091428",
  midnight: "#0b0d12",
  scoreboard: "#0b0c0e",
  light: "#f6f5fb",
  tsm: "#09090b",
  flyquest: "#06100a",
  t1: "#0b0708",
};

export function applyTheme(name: string | undefined): void {
  const id: ThemeName = THEMES.some((t) => t.id === name) ? (name as ThemeName) : DEFAULT_THEME;
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[id]);
}
