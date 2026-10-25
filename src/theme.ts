/**
 * Colour themes. Every colour in the app is a theme colour (Tailwind `rw-*` classes, CSS variables `--rw-*`, see
 * App.css); a theme is just a set of values for them on <html data-theme="...">.
 */
export type ThemeName = "rift" | "classic" | "light" | "tsm" | "flyquest" | "t1" | "geng" | "fnatic" | "cloud9";

export const THEMES: { id: ThemeName; swatch: [string, string, string] }[] = [
  { id: "rift", swatch: ["#120f2b", "#a78bfa", "#2dd4bf"] },
  { id: "classic", swatch: ["#091428", "#c8aa6e", "#0ac8b9"] },
  { id: "light", swatch: ["#f6f5fb", "#5b3fd6", "#0d7f72"] },
  // team colours
  { id: "tsm", swatch: ["#121215", "#f2f2f2", "#5ab4f0"] },
  { id: "flyquest", swatch: ["#0b1811", "#3ddc84", "#7dd3fc"] },
  { id: "t1", swatch: ["#150c0e", "#ff3b55", "#e3c27a"] },
  { id: "geng", swatch: ["#14120c", "#d4af37", "#3ec9a7"] },
  { id: "fnatic", swatch: ["#14100c", "#ff6a13", "#35c9b0"] },
  { id: "cloud9", swatch: ["#0c1a29", "#2fb5f0", "#3fd6a2"] },
];

export const DEFAULT_THEME: ThemeName = "rift";

/** Page background per theme, for the browser / phone status bar. */
const BAR: Record<ThemeName, string> = {
  rift: "#0c0a1d",
  classic: "#091428",
  light: "#f6f5fb",
  tsm: "#09090b",
  flyquest: "#06100a",
  t1: "#0b0708",
  geng: "#0b0a07",
  fnatic: "#0a0806",
  cloud9: "#07111c",
};

export function applyTheme(name: string | undefined): void {
  const id: ThemeName = THEMES.some((t) => t.id === name) ? (name as ThemeName) : DEFAULT_THEME;
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[id]);
}
