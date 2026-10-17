/** Building blocks shared by the stats hub pages. */
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Check, Clock, Eye, Link2, SearchX } from "lucide-react";
import { MissingFile } from "../../stats";
import { tl, locale } from "../../i18n";
import { champName } from "../../champions";
import { HubRoute, hubPath, navigateHub } from "../../hub/route";
import { champIcon, itemIcon, runeIcon, spellIcon } from "../../hub/ddragon";
import { prettySlug } from "../../hub/data";
import { IS_WEB } from "../../platform";
import { CaptureFooter, ShareButtons } from "./ShareImage";
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

export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: false, missing: false, loading: true });
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
  }, deps);
  return state;
}

export const Loading: React.FC = () => (
  <div className="py-10 text-center text-xs text-rw-sub" role="status">
    <Clock className="w-4 h-4 inline mr-1.5 text-rw-teal animate-pulse" />
    {tl("Loading…")}
  </div>
);

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
    <div className="py-10 text-center text-xs text-rw-red">
      {tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}
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
    <div className="text-[10px] uppercase tracking-wider text-rw-muted font-semibold truncate">{label}</div>
    <div className="text-base font-bold text-rw-text truncate">{value}</div>
    {sub && (
      <div className="text-[10px] text-rw-sub truncate" title={typeof sub === "string" ? sub : undefined}>
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
export const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode; id?: string; share?: string }> = ({
  title,
  children,
  right,
  id,
  share,
}) => {
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} className={`${card} space-y-2 min-w-0`} id={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-rw-accent">{title}</h3>
        {(right || share) && (
          <span className="flex flex-wrap items-center justify-end gap-2 min-w-0 ml-auto">
            {right}
            {share && <ShareButtons target={ref} name={share} />}
          </span>
        )}
      </div>
      {children}
      {share && <CaptureFooter />}
    </section>
  );
};

/** Sets the browser tab's title while a page is open. */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title || !IS_WEB) return;
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
  // the picture that failed (a new picture gets its own try)
  const [failed, setFailed] = useState<string | null>(null);
  const broken = !!src && failed === src;
  const style = { width: size, height: size };
  if (!src || broken)
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
      src={src}
      alt={alt}
      title={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(src)}
      className={`inline-block shrink-0 ${round ? "rounded-full" : "rounded"} ${className || ""}`}
      style={style}
    />
  );
};

export const ChampIcon: React.FC<{ name?: string; size?: number; className?: string }> = ({ name, size = 22, className }) =>
  name ? <Pic src={champIcon(name)} alt={champName(name)} size={size} className={className} /> : null;

export const ItemIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 20 }) => <Pic src={itemIcon(name)} alt={name} size={size} />;
export const SpellIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => <Pic src={spellIcon(name)} alt={name} size={size} />;
export const RuneIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 18 }) => <Pic src={runeIcon(name)} alt={name} size={size} round />;

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

/** Copies the page's web address (lolworlds.com/riftwise/...), also from the desktop app. */
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
