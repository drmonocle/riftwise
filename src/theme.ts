/**
 * Colour themes. Every colour in the app is a theme colour (Tailwind `rw-*` classes, CSS variables `--rw-*`, see
 * App.css); a theme is just a set of values for them on <html data-theme="...">.
 */
export type ThemeName = "rift" | "classic" | "midnight";

export const THEMES: { id: ThemeName; swatch: [string, string, string] }[] = [
  { id: "rift", swatch: ["#120f2b", "#a78bfa", "#2dd4bf"] },
  { id: "classic", swatch: ["#091428", "#c8aa6e", "#0ac8b9"] },
  { id: "midnight", swatch: ["#0d1017", "#7aa2ff", "#22d3ee"] },
];

export const DEFAULT_THEME: ThemeName = "rift";

/** Page background per theme, for the browser / phone status bar. */
const BAR: Record<ThemeName, string> = { rift: "#0c0a1d", classic: "#091428", midnight: "#0b0d12" };

export function applyTheme(name: string | undefined): void {
  const id: ThemeName = THEMES.some((t) => t.id === name) ? (name as ThemeName) : DEFAULT_THEME;
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[id]);
}
