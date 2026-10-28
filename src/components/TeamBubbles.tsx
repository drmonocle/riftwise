/**
 * The floating team logos behind every page (src/bubbles.ts draws them): the teams in the schedule, international
 * events and the big leagues first, and the reigning MSI and First Stand champions in a ring of their own. The
 * drawing code loads only once the page has settled, never for reduced motion, data saver or the compact window, and
 * Settings can turn it off. The logos are Riot's, from the schedule the app has already loaded.
 */
import React, { useEffect, useMemo, useRef } from "react";
import type { Match } from "../types";
import { riotThumb } from "../riotImage";
import { normalizeTeamCode } from "../helpers";
import { statsReigning } from "../stats";
import type { BubbleTeam, Ring } from "../bubbles";

/** Riot's leagues whose teams float first (the rest fill in after) */
const TOP_LEAGUES = new Set(["worlds", "msi", "first_stand", "lck", "lpl", "lec", "lta_north", "lta_south", "lcs", "lcp", "cblol-brazil"]);
const MAX_TEAMS = 24;
const RINGS: [string, Ring][] = [
  ["MSI", "msi"],
  ["First Stand", "first-stand"],
];

interface Team {
  code: string;
  name: string;
  img: string;
  rank: number;
}

/** The schedule's teams with a logo, one each, the international and big leagues' first. */
function teamsOf(matches: Match[]): Team[] {
  const by = new Map<string, Team>();
  for (const m of matches) {
    const rank = ["worlds", "msi", "first_stand"].includes(m.leagueSlug) ? 0 : TOP_LEAGUES.has(m.leagueSlug) ? 1 : 2;
    for (const [code, name, img] of [
      [m.team1Code, m.team1Name, m.team1Image],
      [m.team2Code, m.team2Name, m.team2Image],
    ] as const) {
      if (!img || !code || code === "TBD") continue;
      const key = normalizeTeamCode(code);
      const old = by.get(key);
      if (!old || rank < old.rank) by.set(key, { code: key, name, img, rank });
    }
  }
  return [...by.values()].sort((a, b) => a.rank - b.rank);
}

export const TeamBubbles: React.FC<{ matches: Match[]; on: boolean }> = ({ matches, on }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const teams = useMemo(() => teamsOf(matches), [matches]);
  // the schedule refreshes every minute or so: start again only when the teams change, not on every refresh
  const sig = teams.map((t) => t.code).join(",");
  useEffect(() => {
    const canvas = ref.current;
    if (!on || !canvas || !teams.length) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    let stop: (() => void) | null = null;
    let gone = false;
    const begin = async () => {
      const [{ startBubbles }, reigning] = await Promise.all([import("../bubbles"), statsReigning()]);
      if (gone) return;
      const ringed: BubbleTeam[] = [];
      const taken = new Set<string>();
      for (const [kind, ring] of RINGS) {
        const r = reigning.find((x) => x.k === kind);
        if (!r) continue;
        const code = normalizeTeamCode(r.c || "");
        const t = teams.find((x) => x.code === code || x.name.toLowerCase() === r.t.toLowerCase());
        // a champion not in today's schedule: lolworlds.com keeps logos by short name
        const img = t ? riotThumb(t.img, 96) : code ? `https://lolworlds.com/logos/${code}.webp` : "";
        if (!img) continue;
        if (t) taken.add(t.code);
        ringed.push({ img, ring, label: `${kind} ${r.y}` });
      }
      const plain = teams.filter((t) => !taken.has(t.code)).slice(0, MAX_TEAMS).map((t) => ({ img: riotThumb(t.img, 96) }));
      stop = startBubbles(canvas, [...ringed, ...plain]);
    };
    // after the page has settled, so the logos never hold up what it shows first
    const idle = "requestIdleCallback" in window; // not in older Safari
    const handle = idle ? window.requestIdleCallback(() => void begin(), { timeout: 3000 }) : window.setTimeout(() => void begin(), 1500);
    return () => {
      gone = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, sig]);
  if (!on) return null;
  // behind everything in the app (the app's root is its own stacking context: App.tsx "isolate")
  return <canvas ref={ref} aria-hidden="true" className="fixed inset-0 w-screen h-screen pointer-events-none -z-10" />;
};
