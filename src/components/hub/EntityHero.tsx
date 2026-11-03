/**
 * The top of a page about one thing (a player, a team, a tournament, a league, a champion): one lit card with its
 * picture, name and facts, its actions on the right, and its numbers in a strip underneath. The page's tabs hang
 * under it (PageTabs `attached`): a separate element, so they can stay at the top while the page scrolls.
 * Layout: App.css .rw-hero-grid and .rw-hero-stats.
 */
import React from "react";
import type { HubRoute } from "../../hub/route";
import { HubLink } from "./ui";

export interface HeroStat {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** the cell opens this page */
  to?: HubRoute;
  title?: string;
  /** drawn beside the value (a sparkline) */
  corner?: React.ReactNode;
}

/** A button in a page's top card; `primary` for the one most people want. */
export const heroBtn = (primary = false) =>
  `inline-flex items-center justify-center gap-1.5 min-h-9 px-3.5 rounded-lg border text-[13px] font-semibold whitespace-nowrap transition-colors ${
    primary
      ? "bg-rw-accent border-rw-accent text-rw-bg hover:brightness-110"
      : "border-rw-accent/30 bg-rw-accent/10 text-rw-text hover:bg-rw-accent/20 hover:border-rw-accent"
  }`;

/** A quiet text link in a page's top card (Leaguepedia, photos, a calendar feed). */
export const heroLink = "inline-flex items-center gap-1 text-[13px] text-rw-teal hover:underline";

const Cell: React.FC<{ s: HeroStat }> = ({ s }) => {
  const body = (
    <>
      <div className="font-head text-[12px] font-semibold uppercase tracking-[0.06em] text-rw-muted truncate">{s.label}</div>
      <div className="flex items-center gap-2 min-w-0 my-0.5">
        <span className="font-num text-[20px] sm:text-[24px] font-bold leading-tight text-rw-text truncate tabular-nums">{s.value}</span>
        {s.corner && <span className="shrink-0">{s.corner}</span>}
      </div>
      {s.sub != null && s.sub !== "" && <div className="text-[12px] text-rw-sub line-clamp-2">{s.sub}</div>}
    </>
  );
  const cls = "relative block px-4 py-3 sm:px-5 sm:py-4";
  return s.to ? (
    <HubLink to={s.to} className={`${cls} hover:bg-rw-accent/5 transition-colors`} title={s.title}>
      {body}
    </HubLink>
  ) : (
    <div className={cls} title={s.title}>
      {body}
    </div>
  );
};

export const EntityHero: React.FC<{
  /** the photo, logo or champion picture */
  media?: React.ReactNode;
  /** a small line over the name ("Part of Worlds 2026") */
  kicker?: React.ReactNode;
  /** the page's main heading */
  title: React.ReactNode;
  /** facts under the name */
  lines?: React.ReactNode;
  /** under the facts: favourite champions, the stages of a tournament */
  extra?: React.ReactNode;
  /** on the right (on phones: under the numbers): buttons and links */
  aside?: React.ReactNode;
  stats?: (HeroStat | null | false | undefined)[];
  /** small print at the bottom of the card (solo queue names, what isn't counted) */
  foot?: React.ReactNode;
  /** the short version, on a tab other than the Overview: a smaller name */
  compact?: boolean;
  /** the page's tabs hang under it (PageTabs attached): no rounded bottom */
  tabbed?: boolean;
}> = ({ media, kicker, title, lines, extra, aside, stats, foot, compact, tabbed }) => {
  const cells = (stats || []).filter((s): s is HeroStat => !!s);
  const n = cells.length;
  const grid = ["rw-hero-grid", media ? "" : "rw-hero-nomedia", extra ? "" : "rw-hero-noextra"].filter(Boolean).join(" ");
  // columns of the numbers: two on phones, three (or all four) from 640 px, all of them up to six from 1100 px
  const cols = { "--c1": Math.min(2, n), "--c2": n <= 4 ? n : 3, "--c3": Math.min(6, n) } as React.CSSProperties;
  return (
    <section className={`relative bg-rw-panel border border-rw-accent/40 rw-hot ${tabbed ? "rounded-t-xl border-b-0" : "rounded-xl"}`}>
      {/* the accent's glow in the top left corner, inside the rounded corners (no overflow-hidden: menus open out of it) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[inherit] pointer-events-none bg-[radial-gradient(640px_220px_at_0%_0%,color-mix(in_oklab,var(--rw-accent)_14%,transparent),transparent_70%)]"
      />
      <div className={`relative ${grid} ${compact ? "px-4 py-3 sm:px-5 sm:py-4" : "p-4 sm:p-6"}`}>
        {media && <div className="rw-hero-media">{media}</div>}
        <div className="rw-hero-text">
          {kicker && <div className="text-[13px] text-rw-sub mb-1">{kicker}</div>}
          <h1 className={`font-head font-bold leading-none text-rw-text break-words ${compact ? "text-[24px] sm:text-[28px]" : "text-[30px] sm:text-[42px]"}`}>
            {title}
          </h1>
          {lines && <div className="text-[13px] sm:text-[14px] text-rw-sub space-y-0.5 mt-2">{lines}</div>}
        </div>
        {extra && <div className="rw-hero-extra">{extra}</div>}
        {aside && <div className="rw-hero-aside hidden md:flex flex-col items-end gap-2 max-w-[24rem]">{aside}</div>}
      </div>
      {n > 0 && (
        <div className="rw-hero-stats relative" style={cols}>
          {cells.map((s) => (
            <Cell key={s.label} s={s} />
          ))}
        </div>
      )}
      {/* phones: the buttons after the numbers, so the numbers come first (mounted once per width: display none
          keeps the other copy out of reach of the keyboard and screen readers) */}
      {aside && <div className="relative md:hidden flex flex-wrap items-start gap-2 px-4 py-3 border-t border-rw-border">{aside}</div>}
      {foot && <div className="relative px-4 sm:px-6 py-2.5 border-t border-rw-border text-[12px] text-rw-muted space-y-0.5">{foot}</div>}
    </section>
  );
};
