/**
 * Getting around a long page: PageTabs splits a team's, player's or tournament's page into tabs with their own
 * addresses (/team/t1/matches), JumpBar keeps a row of "jump to" links over one long page (Worlds). Both stay at the
 * top while the page scrolls under them.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tl } from "../../i18n";
import type { HubRoute } from "../../hub/route";
import { fmtNum, HubLink } from "./ui";

/** The element that scrolls the page (the stats tab's own scroller; the window when there is none). */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === "auto" || y === "scroll") return p;
  }
  return null;
}

const chip = (on: boolean) =>
  `relative flex items-center gap-1.5 px-2.5 min-h-9 text-xs font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors ${
    on ? "text-rw-accent border-rw-accent" : "text-rw-sub border-transparent hover:text-rw-text"
  }`;
// -top-4: flush with the top of the stats tab's scroller (its p-4 padding would leave a strip where the page shows
// through above the row); pt-1 keeps the labels off the very edge
const stuck = "sticky -top-4 z-20 bg-rw-bg/95 backdrop-blur border-b border-rw-border pt-1";
const rowCls = "flex gap-0.5 overflow-x-auto [scrollbar-width:none]";
/** how tall the sticky block is that a row sits in (the tabs and a jump row under them stick together) */
const stuckHeight = (el: HTMLElement | null) => (el?.closest<HTMLElement>(".sticky") || el)?.offsetHeight || 0;

export interface PageTab {
  /** "" for the Overview (the page's own address) */
  key: string;
  label: string;
  /** a number shown after the label (games, series...) */
  count?: number;
}

/**
 * Tabs of one page. Switching tabs keeps the page where it is when the tabs are in view, and brings the tabs to the
 * top when they had scrolled away, so the new tab starts right under them. `below`: a row that sticks with the tabs
 * (a long tab's JumpBar, bare).
 */
export const PageTabs: React.FC<{ tabs: PageTab[]; active: string; to: (key: string) => HubRoute; below?: React.ReactNode }> = ({
  tabs,
  active,
  to,
  below,
}) => {
  const spot = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const sc = scrollerOf(spot.current);
    if (!sc || !spot.current) return;
    const above = spot.current.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    if (above < 0) sc.scrollTop += above;
  }, [active]);
  // phones: the open tab in view in the sideways row
  const at = tabs.findIndex((t) => t.key === active);
  useEffect(() => {
    const r = row.current;
    const on = r?.children[at] as HTMLElement | undefined;
    // (the row is relative: the tabs' offsetParent)
    if (r && on && r.scrollWidth > r.clientWidth) r.scrollLeft = on.offsetLeft - (r.clientWidth - on.offsetWidth) / 2;
  }, [at]);
  if (tabs.length < 2) return null;
  return (
    <>
      <div ref={spot} aria-hidden="true" />
      <div className={stuck} data-nocapture="1">
        <nav ref={row} className={`relative ${rowCls}`} aria-label={tl("Page sections")}>
          {tabs.map((t) => (
            <HubLink key={t.key || "overview"} to={to(t.key)} className={chip(t.key === active)}>
              {tl(t.label)}
              {t.count != null && t.count > 0 && <span className="text-[10px] font-normal text-rw-muted tabular-nums">{fmtNum(t.count)}</span>}
            </HubLink>
          ))}
        </nav>
        {below}
      </div>
    </>
  );
};

export interface JumpItem {
  id: string;
  label: string;
}

/**
 * "Jump to" links over a long page: each one scrolls to its part of the page (and puts #id in the address, so the
 * link can be shared); the part in view is marked. Items whose part isn't on the page (yet) are left out.
 * `bare`: a row under a long tab's PageTabs, sticking with them (no sticky block of its own).
 */
export const JumpBar: React.FC<{ items: JumpItem[]; bare?: boolean }> = ({ items, bare }) => {
  const row = useRef<HTMLElement>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const ids = items.map((i) => i.id).join("|");
  useEffect(() => {
    const sc = scrollerOf(row.current);
    if (!sc) return;
    let frame = 0;
    const look = () => {
      frame = 0;
      // a part counts once it shows something (an empty box, or one whose data hasn't come, has no height)
      const here = items.filter((i) => (document.getElementById(i.id)?.offsetHeight || 0) > 0).map((i) => i.id);
      setPresent((p) => (p.join("|") === here.join("|") ? p : here));
      const line = sc.getBoundingClientRect().top + stuckHeight(row.current) + 24;
      let on: string | null = null;
      for (const id of here) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) on = id;
      }
      setCurrent(on);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(look);
    };
    look();
    // the page's parts arrive with their data: look again for a while
    const poll = window.setInterval(look, 700);
    const stop = window.setTimeout(() => window.clearInterval(poll), 15000);
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      window.clearInterval(poll);
      window.clearTimeout(stop);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  // a shared link (riftwise.gg/stats/worlds/2026#jump-players) opens at its part once that part is there
  useEffect(() => {
    const want = decodeURIComponent(window.location.hash.slice(1));
    if (want && present.includes(want)) go(want, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present.join("|")]);
  const go = (id: string, smooth = true) => {
    const sc = scrollerOf(row.current);
    const el = document.getElementById(id);
    if (!sc || !el) return;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - stuckHeight(row.current) - 8;
    // instant for "reduce motion"; and where a smooth scroll doesn't run at all (a page in the background), the jump
    // happens anyway
    const still = smooth && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = sc.scrollTop;
    sc.scrollTo({ top, behavior: still ? "smooth" : "auto" });
    if (still) window.setTimeout(() => sc.scrollTop === from && Math.abs(from - top) > 4 && sc.scrollTo({ top, behavior: "auto" }), 400);
    if (smooth) window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${id}`);
  };
  const shown = items.filter((i) => present.includes(i.id));
  if (shown.length < 2) return <nav ref={row} className="hidden" />;
  return (
    <nav ref={row} className={bare ? `${rowCls} border-t border-rw-border/60` : `${stuck} ${rowCls}`} aria-label={tl("Jump to")} data-nocapture="1">
      <span className="flex items-center px-2 text-[10px] font-semibold uppercase tracking-wider text-rw-muted shrink-0">{tl("Jump to")}</span>
      {shown.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          onClick={(e) => {
            e.preventDefault();
            go(i.id);
          }}
          className={chip(i.id === current)}
        >
          {tl(i.label)}
        </a>
      ))}
    </nav>
  );
};
