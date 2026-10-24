/** Building blocks shared by the stats hub pages. */
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Check, Clock, Eye, Link2, SearchX, Camera, RefreshCw } from "lucide-react";
import { MissingFile } from "../../stats";
import { tl, locale } from "../../i18n";
import { champName } from "../../champions";
import { HubRoute, currentHubRoute, hubPath, navigateHub } from "../../hub/route";
import { rememberRecent } from "../../hub/recent";
import { champIcon, itemIcon, itemName, runeIcon, runeName, spellIcon, spellName } from "../../hub/ddragon";
import { prefetchHub, prettySlug } from "../../hub/data";
import { IS_WEB } from "../../platform";
import { CaptureFooter, ShareButtons } from "./ShareImage";
import { usePlayerPicture, useTeamLogo } from "../../hub/riotCatalog";
import { ddragonThumb, riotThumb } from "../../riotImage";
import { allRevealed, setRevealed, useRevealedVersion } from "../../revealed";

export const card = "bg-rw-surface border border-rw-border rounded-xl p-4";
export const th = "text-left font-semibold text-rw-muted py-1.5 pr-3 whitespace-nowrap";
export const td = "py-1.5 pr-3 whitespace-nowrap";

export const fmtNum = (n: number) => n.toLocaleString(locale());

/** 2025-11-09 -> "Nov 9, 2025" in the reader's language. */
export function fmtDate(date: string | undefined, withYear = true): string {
  if (!date) return "";
  const d = new Date(date.length <= 10 ? `${date}T12:00:00Z` : `${date.replace(" ", "T")}Z`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString(locale(), { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

export const fmtUsd = (n: number) => n.toLocaleString(locale(), { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// ── Loading files ─────────────────────────────────────────────────────────

export interface Loaded<T> {
  data: T | null;
  error: boolean;
  missing: boolean;
  loading: boolean;
}

/** "Try again" on a failed page: every load that failed (and only those) runs again. */
const RETRY_EVENT = "riftwise-stats-retry";
export const retryFailedLoads = () => window.dispatchEvent(new Event(RETRY_EVENT));

/** A number that goes up when "Try again" is pressed while `failed`: put it in a loader's dependencies. */
export function useRetryAttempt(failed: boolean): number {
  const [attempt, setAttempt] = useState(0);
  const f = useRef(failed);
  f.current = failed;
  useEffect(() => {
    const again = () => f.current && setAttempt((n) => n + 1);
    window.addEventListener(RETRY_EVENT, again);
    return () => window.removeEventListener(RETRY_EVENT, again);
  }, []);
  return attempt;
}

export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: false, missing: false, loading: true });
  const attempt = useRetryAttempt(state.error && !state.missing);
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: false, missing: false, loading: true });
    fn()
      .then((data) => alive && setState({ data, error: false, missing: false, loading: false }))
      .catch((e) => alive && setState({ data: null, error: true, missing: e instanceof MissingFile, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return state;
}

export const Loading: React.FC = () => {
  // most files arrive in well under a quarter second: only then say we're loading (no flash on every click)
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 250);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="py-10 text-center text-xs text-rw-sub min-h-[6rem]" role="status" aria-busy="true">
      {slow && (
        <>
          <Clock className="w-4 h-4 inline mr-1.5 text-rw-teal animate-pulse" />
          {tl("Loading…")}
        </>
      )}
    </div>
  );
};

// a link the pointer only passes over isn't fetched: wait a moment first
let prefetchTimer = 0;
function prefetchSoon(to: HubRoute) {
  window.clearTimeout(prefetchTimer);
  prefetchTimer = window.setTimeout(() => prefetchHub(to), 80);
}

export const Failed: React.FC<{ missing?: boolean }> = ({ missing }) =>
  missing ? (
    <div className="py-10 text-center text-xs text-rw-sub space-y-2">
      <SearchX className="w-5 h-5 mx-auto text-rw-muted" />
      <p>{tl("We couldn't find that page. It may have been renamed: try the search above.")}</p>
      <HubLink to={{ kind: "home" }} className="text-rw-teal hover:underline">
        {tl("Go to the stats home page")}
      </HubLink>
    </div>
  ) : (
    <div className="py-10 text-center text-xs text-rw-red space-y-3">
      <p>{tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>
      <button
        type="button"
        onClick={retryFailedLoads}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rw-border text-rw-text hover:border-rw-accent/60 font-semibold"
      >
        <RefreshCw className="w-3.5 h-3.5" /> {tl("Try again")}
      </button>
    </div>
  );

/** Shows the loading / failed state, or the page once its file has arrived. */
export function Page<T>({ state, children }: { state: Loaded<T>; children: (data: T) => React.ReactNode }) {
  if (state.loading) return <Loading />;
  if (state.error || !state.data) return <Failed missing={state.missing} />;
  return <>{children(state.data)}</>;
}

// ── Layout ────────────────────────────────────────────────────────────────

export const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({ label, value, sub }) => (
  <div className="bg-rw-bg border border-rw-border rounded-lg px-3 py-2 min-w-0">
    <div className="text-[10px] text-rw-muted font-semibold truncate">{label}</div>
    <div className="text-base font-bold text-rw-text truncate tabular-nums">{value}</div>
    {sub && (
      <div className="text-[10px] text-rw-sub line-clamp-2" title={typeof sub === "string" ? sub : undefined}>
        {sub}
      </div>
    )}
  </div>
);

/** The credit Oracle's Elixir's data asks for (free for non-commercial use with credit), under every early-game block. */
export const OeCredit: React.FC<{ n?: number }> = ({ n }) => (
  <p className="text-[10px] text-rw-muted">
    {n != null ? tl("Early-game numbers from {n} games with timelines.", { n: fmtNum(n) }) + " " : ""}
    {tl("Data: Oracle's Elixir (oracleselixir.com) by Tim Sevenhuysen.")}
  </p>
);

/** A titled card. With `share` (a file name) it gets Copy image / Save image buttons and a RiftWise footer in the picture. */
/**
 * What a page is about ("T1 vs Gen.G · 2026", "Faker"): a section's copied picture shows it on top, so a screenshot
 * posted on its own still says whose numbers these are.
 */
export const CaptureContext = createContext<string | null>(null);

export const Section: React.FC<{
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  id?: string;
  share?: string;
  /** overrides the page's CaptureContext for this section */
  captureContext?: string;
}> = ({ title, children, right, id, share, captureContext }) => {
  const ref = useRef<HTMLElement>(null);
  const pageContext = useContext(CaptureContext);
  const context = captureContext ?? pageContext;
  return (
    <section ref={ref} className="bg-rw-surface border border-rw-border rounded-lg min-w-0" id={id}>
      {share && context && <div className="rw-capture-only rw-section-context px-3 pt-2 text-sm font-extrabold text-rw-text">{context}</div>}
      {/* a flat panel: the header strip (title left, the section's controls and tools right) over a hairline */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-rw-border">
        <h3 className={sectionTitle}>{title}</h3>
        {(right || share) && (
          <span className="flex flex-wrap items-center justify-end gap-2 min-w-0 ml-auto">
            {right}
            {share && <ShareButtons target={ref} name={share} />}
          </span>
        )}
      </div>
      <div className="p-3 space-y-2 min-w-0">
        {children}
        {share && <CaptureFooter />}
      </div>
    </section>
  );
};

/** A section title: small condensed capitals in the text colour, no icon (every section heading looks the same). */
export const sectionTitle = "font-head text-xs font-semibold uppercase tracking-wider text-rw-text";

/**
 * How many side-by-side columns the window has room for (1 on a phone, 2 from 768 px, 3 from 1280 px, 4 from
 * 1800 px), matching the GRID_COLS classes below. Follows the window as it is resized.
 */
export function useColumns(): number {
  const query = () =>
    typeof window === "undefined" ? 1 : window.innerWidth >= 1800 ? 4 : window.innerWidth >= 1280 ? 3 : window.innerWidth >= 768 ? 2 : 1;
  const [n, setN] = useState(query);
  useEffect(() => {
    const on = () => setN(query());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return n;
}

/** The grid that goes with useColumns(). */
export const GRID_COLS = "grid md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4";

/** Sets the browser tab's title while a page is open. */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    rememberRecent(currentHubRoute(), title);
    if (!IS_WEB) return;
    const before = document.title;
    document.title = `${title} | RiftWise`;
    return () => {
      document.title = before;
    };
  }, [title]);
}

// ── Links ─────────────────────────────────────────────────────────────────

/**
 * A link to a hub page. On the web it is a real link (open in new tab works, search engines follow
 * it); a plain click stays inside the app.
 */
export const HubLink: React.FC<{ to: HubRoute; className?: string; title?: string; onNavigate?: () => void; children: React.ReactNode }> = ({
  to,
  className,
  title,
  onNavigate,
  children,
}) => (
  <a
    href={IS_WEB ? hubPath(to) : "#"}
    title={title}
    className={className ?? "text-rw-text hover:text-rw-accent hover:underline"}
    onMouseEnter={() => prefetchSoon(to)}
    onFocus={() => prefetchSoon(to)}
    onTouchStart={() => prefetchHub(to)}
    onClick={(e) => {
      if (IS_WEB && (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0)) return;
      e.preventDefault();
      navigateHub(to);
      onNavigate?.();
    }}
  >
    {children}
  </a>
);

/** Team name, linked to its page when it has one. */
export const TeamLink: React.FC<{ name: string; u?: string | null; className?: string }> = ({ name, u, className }) =>
  u ? (
    <HubLink to={{ kind: "team", slug: u }} className={className}>
      {name}
    </HubLink>
  ) : (
    <span className="text-rw-sub">{name}</span>
  );

export const PlayerLink: React.FC<{ name: string; u?: string | null; className?: string }> = ({ name, u, className }) =>
  u ? (
    <HubLink to={{ kind: "player", slug: u }} className={className}>
      {name}
    </HubLink>
  ) : (
    <span className="text-rw-sub">{name}</span>
  );

export const EventLink: React.FC<{ name: string; u?: string | null; className?: string }> = ({ name, u, className }) =>
  u ? (
    <HubLink to={{ kind: "event", slug: u }} className={className}>
      {name}
    </HubLink>
  ) : (
    <span className="text-rw-sub">{name}</span>
  );

// ── Pictures ──────────────────────────────────────────────────────────────

const Pic: React.FC<{ src: string | null; alt: string; size: number; round?: boolean; fallback?: string; className?: string }> = ({
  src,
  alt,
  size,
  round,
  fallback,
  className,
}) => {
  // pictures that failed (a new picture gets its own try): the small resized icon first, then the full one
  const [failed, setFailed] = useState<string[]>([]);
  const shown = src ? [ddragonThumb(src, size), src].find((u) => !failed.includes(u)) : undefined;
  const style = { width: size, height: size };
  if (!src || !shown)
    return (
      <span
        style={style}
        title={alt}
        className={`inline-flex items-center justify-center shrink-0 bg-rw-border text-rw-sub text-[9px] font-bold ${round ? "rounded-full" : "rounded"} ${className || ""}`}
      >
        {(fallback ?? alt).slice(0, 2)}
      </span>
    );
  return (
    <img
      src={shown}
      data-full={shown !== src ? src : undefined}
      alt={alt}
      title={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed((f) => [...f, shown])}
      className={`inline-block shrink-0 ${round ? "rounded-full" : "rounded"} ${className || ""}`}
      style={style}
    />
  );
};

export const ChampIcon: React.FC<{ name?: string; size?: number; className?: string }> = ({ name, size = 22, className }) =>
  name ? <Pic src={champIcon(name)} alt={champName(name)} size={size} className={className} /> : null;

export const ItemIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 20 }) => <Pic src={itemIcon(name)} alt={itemName(name)} size={size} />;
export const SpellIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => <Pic src={spellIcon(name)} alt={spellName(name)} size={size} />;
export const RuneIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 18 }) => <Pic src={runeIcon(name)} alt={runeName(name)} size={size} round />;

/** Champion picture + name, linked to the champion page. */
export const ChampLink: React.FC<{ name: string; size?: number; showName?: boolean }> = ({ name, size = 20, showName = true }) => (
  <HubLink to={{ kind: "champ", slug: prettySlug(name) }} className="inline-flex items-center gap-1.5 min-w-0 text-rw-text hover:text-rw-accent">
    <ChampIcon name={name} size={size} />
    {showName && <span className="truncate">{champName(name)}</span>}
  </HubLink>
);

// ── Spoilers ──────────────────────────────────────────────────────────────

/** How long a result counts as fresh enough to hide in spoiler mode. */
const FRESH_DAYS = 14;
export const isFresh = (date: string | undefined) =>
  !!date && Date.now() - new Date(date.length <= 10 ? `${date}T00:00:00Z` : `${date.replace(" ", "T")}Z`).getTime() < FRESH_DAYS * 86400_000;

const SpoilerContext = createContext<{ on: boolean; revealed: Set<string>; reveal: (k: string) => void }>({
  on: false,
  revealed: new Set(),
  reveal: () => {},
});

export const SpoilerProvider: React.FC<{ on: boolean; children: React.ReactNode }> = ({ on, children }) => {
  // revealed results are remembered on this device (src/revealed.ts) and synced with cloud sync
  useRevealedVersion();
  const revealed = new Set(Object.keys(allRevealed()));
  return <SpoilerContext.Provider value={{ on, revealed, reveal: (k) => setRevealed(k, true) }}>{children}</SpoilerContext.Provider>;
};

/** True when this result should stay hidden (spoiler mode on, recent, not revealed yet). */
/** useHidden's test for many items at once (a bracket deciding which lines it may highlight). */
export function useHiddenCheck(): (key: string, date: string | undefined) => boolean {
  const ctx = useContext(SpoilerContext);
  return (key, date) => ctx.on && isFresh(date) && !ctx.revealed.has(key);
}

export function useHidden(key: string, date: string | undefined): [boolean, () => void] {
  const ctx = useContext(SpoilerContext);
  const hidden = ctx.on && isFresh(date) && !ctx.revealed.has(key);
  return [hidden, () => ctx.reveal(key)];
}

/** note next to a regular season's first-placed team: the playoffs decide the title */
export const StandingsFirst: React.FC = () => <span className="text-[10px] text-rw-muted whitespace-nowrap">{tl("1st in standings")}</span>;

export const RevealButton: React.FC<{ onReveal: () => void; small?: boolean }> = ({ onReveal, small }) => (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onReveal();
    }}
    className={`inline-flex items-center gap-1 rounded border border-rw-accent/50 text-rw-accent hover:bg-rw-accent/10 ${small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
  >
    <Eye className="w-3 h-3" />
    {tl("Reveal")}
  </button>
);

/** Copies the page's web address (riftwise.gg/...), also from the desktop app. */
export const CopyLinkButton: React.FC<{ url: string }> = ({ url }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) setCopied(true);
      else window.prompt(tl("Copy this link:"), url);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`flex items-center gap-1 min-h-8 px-1.5 rounded text-xs shrink-0 ${copied ? "text-rw-teal" : "text-rw-muted hover:text-rw-accent"}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
      {copied ? tl("Link copied") : tl("Copy link")}
    </button>
  );
};

/**
 * A pro's photo: Riot's for current pros, Leaguepedia's for the others (through the stats build, see
 * hub/riotCatalog.ts), else their initials. Riot's pictures are left out of copied pictures: Riot's image server
 * doesn't allow that.
 */
export const PlayerPhoto: React.FC<{
  name: string;
  team?: string;
  /** the player's page slug: finds the Leaguepedia photo (without it, the slug made from the name is tried) */
  slug?: string;
  /** Riot's photo from the player's page file (HubPlayer.img) */
  img?: string;
  size?: number;
  /** Tailwind size classes instead of a fixed size ("w-16 h-16 lg:w-24 lg:h-24"): the photo grows with the window */
  sizeClass?: string;
  className?: string;
}> = ({ name, team, slug, img, size = 56, sizeClass, className = "" }) => {
  const pic = usePlayerPicture(name, team, slug, img);
  const [broken, setBroken] = useState<string[]>([]); // addresses that failed to load
  const box = sizeClass ? undefined : { width: size, height: size };
  const sz = sizeClass || "";
  // Riot's photo through Riot's resizer (a 13th of the download), the full picture if that fails, then initials
  const src = pic ? [riotThumb(pic.src), pic.src].find((u) => !broken.includes(u)) : undefined;
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken((b) => [...b, src])}
      // our own copy may go into copied pictures (the stats host allows cross-origin reads)
      {...(pic?.from === "riot" ? { "data-nocapture": "1" } : { crossOrigin: "anonymous" as const })}
      style={box}
      className={`rounded-full object-cover object-top bg-rw-raised border border-rw-border shrink-0 ${sz} ${className}`}
    />
  ) : (
    <span
      data-nocapture="1"
      style={{ ...box, fontSize: sizeClass ? undefined : size / 3 }}
      className={`rounded-full bg-rw-raised border border-rw-border text-rw-muted font-bold flex items-center justify-center shrink-0 ${sz} ${sizeClass ? "text-base lg:text-xl" : ""} ${className}`}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
};

/** A team's logo from Riot (teams in Riot's list), else nothing. Left out of copied pictures. */
/** `src`: a logo the stats files already carry, used until (or unless) Riot's team list has one. */
export const TeamLogo: React.FC<{ name: string; code?: string; src?: string; size?: number; sizeClass?: string; className?: string }> = ({ name, code, src: given, size = 40, sizeClass, className = "" }) => {
  const logo = useTeamLogo(name, code) || given;
  const [broken, setBroken] = useState<string[]>([]); // addresses that failed to load
  // Riot's logo through Riot's resizer (big enough for the largest size here), the original if that fails, then none
  const src = logo ? [riotThumb(logo, 160), logo].find((u) => !broken.includes(u)) : undefined;
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken((b) => [...b, src])}
      data-nocapture="1"
      style={sizeClass ? undefined : { width: size, height: size }}
      className={`object-contain shrink-0 ${sizeClass || ""} ${className}`}
    />
  );
};

/** Opens an outside link (the desktop app hands it to the browser); StatsView provides it. */
export const OpenUrlContext = createContext<((url: string) => void) | null>(null);

/**
 * NerdFinder (nerdfinder.gg, by Alessandra Ogawa, Gabriela Albuquerque and Pedro Fracassi): a search engine for Riot's
 * LoL Esports event photos, by who is in them. A plain link to its search: nothing is loaded from it.
 */
export const nerdfinderSearch = (q: string) => `https://nerdfinder.gg/search?q=${encodeURIComponent(q)}`;
export const NERDFINDER_TOGETHER = "https://nerdfinder.gg/together";

export const PhotosLink: React.FC<{ q: string; url?: string; label?: string; title?: string; className?: string; iconOnly?: boolean }> = ({
  q,
  url,
  label,
  title,
  className,
  iconOnly,
}) => {
  const open = useContext(OpenUrlContext);
  const href = url || nerdfinderSearch(q);
  const text = label ?? tl("Photos");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-nocapture="1"
      onClick={(e) => {
        if (!IS_WEB && open) {
          e.preventDefault();
          open(href);
        }
      }}
      title={title || tl("Riot's event photos of {name} on NerdFinder", { name: q })}
      aria-label={iconOnly ? title || tl("Riot's event photos of {name} on NerdFinder", { name: q }) : undefined}
      className={className ?? "inline-flex items-center gap-1 text-[11px] text-rw-teal hover:underline"}
    >
      <Camera className="w-3.5 h-3.5 shrink-0" />
      {!iconOnly && text}
    </a>
  );
};
