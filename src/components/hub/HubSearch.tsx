/**
 * One search box for every team, player, tournament and champion since 2011, and for the stats pages themselves
 * ("tier list", "draft"). Two names with "vs" between them ("T1 vs Gen.G", "Faker vs Chovy") open Match prep or
 * Compare for the pair; an item ("heartsteel"), or a player and an item ("faker heartsteel"), opens its item history.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users, User, Trophy, Swords, X, Flag, GitCompare, ClipboardList, Compass } from "lucide-react";
import { tl, tk, roleName, fmtN } from "../../i18n";
import { champName } from "../../champions";
import { isNonLatin } from "../../searchAliases";
import { winRate } from "../../stats";
import { groupRank, HubHit, HubIndex, HubSearchKind, loadHubIndex, loadHubIndexQuick, loadHubPlayer, loadHubTeam, loadItemIndex, normText, searchHub } from "../../hub/data";
import type { ItemIndexRow } from "../../hub/types";
import { itemName } from "../../hub/ddragon";
import { HubRoute, navigateHub } from "../../hub/route";
import { ChampIcon, fmtNum, HubLink, ItemIcon } from "./ui";
import { MENU_ITEMS } from "./menu";

/** A result that isn't a team, player... page: a matchup (Match prep, Compare) or one of the stats pages. */
interface Shortcut {
  key: string;
  route: HubRoute;
  label: string;
  sub: string;
  icon: React.ReactNode;
  /** Text to fill into the search box when Tab / scroll-fill is used on this shortcut. */
  fillText?: string;
}

/** "a vs b" (also "a v b", "a versus b", "a x b", "a - b") */
const VS = /^(.+?)\s+(?:vs\.?|v\.?|versus|x|[-–])\s+(.+)$/i;

/** The pair in "a vs b" when both sides are teams, or both are players: Match prep and Compare for them. */
export function matchupShortcuts(index: HubIndex, q: string): Shortcut[] {
  const m = VS.exec(q.trim());
  if (!m) return [];
  const [ha, hb] = [m[1], m[2]].map((side) => searchHub(index, side, 1));
  const good = (h: HubHit | undefined) => !!h && (h.score ?? 9) <= 1.5;
  const ta = ha.team[0];
  const tb = hb.team[0];
  const pa = ha.player[0];
  const pb = hb.player[0];
  // teams when both sides name one (the better match of the two kinds wins a tie: "faker" is a player)
  const teams = good(ta) && good(tb) && ta.slug !== tb.slug && !((pa?.score ?? 9) < (ta.score ?? 9) && (pb?.score ?? 9) < (tb.score ?? 9));
  if (teams) {
    return [
      { key: "prep", route: { kind: "prep", a: ta.slug, b: tb.slug }, label: tl("Match prep: {a} vs {b}", { a: ta.name, b: tb.name }), sub: tl("Form, head-to-head, drafts and every lane"), icon: <ClipboardList className="w-3.5 h-3.5" /> },
      { key: "draft", route: { kind: "draft", query: `teams=${encodeURIComponent(ta.slug)},${encodeURIComponent(tb.slug)}` }, label: `${tl("Draft board")}: ${ta.name} vs ${tb.name}`, sub: `${tl("Champion pool")} · ${tl("Fearless")}`, icon: <Swords className="w-3.5 h-3.5" /> },
      { key: "compare", route: { kind: "compare", mode: "team", a: ta.slug, b: tb.slug }, label: tl("Compare {a} and {b}", { a: ta.name, b: tb.name }), sub: tl("Side by side, over any period"), icon: <GitCompare className="w-3.5 h-3.5" /> },
    ];
  }
  if (good(pa) && good(pb) && pa.slug !== pb.slug)
    return [
      { key: "compare", route: { kind: "compare", mode: "player", a: pa.slug, b: pb.slug }, label: tl("Compare {a} and {b}", { a: pa.name, b: pb.name }), sub: tl("Side by side, over any period"), icon: <GitCompare className="w-3.5 h-3.5" /> },
    ];
  return [];
}

/** The stats pages a search names ("tier list", "rankings", "draft"), by their name in the reader's language or a
 *  few English words (menu.tsx), best first. */
export function pageShortcuts(q: string, limit = 3): Shortcut[] {
  const w = normText(q.trim());
  if (w.length < 3) return [];
  const scored: [number, (typeof MENU_ITEMS)[number]][] = [];
  for (const it of MENU_ITEMS) {
    if (it.kind === "home") continue;
    const names = [normText(tl(it.label)), normText(it.label), ...(it.also || []).map(normText)];
    const s = names.reduce((best, n) => Math.min(best, n === w ? 0 : n.startsWith(w) ? 1 : n.includes(w) ? 2 : w.startsWith(n) && n.length >= 4 ? 2.5 : 9), 9);
    if (s < 9) scored.push([s, it]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, it]) => ({ key: `page-${it.kind}`, route: { kind: it.kind } as HubRoute, label: tl(it.label), sub: tl(it.sub), icon: <Compass className="w-3.5 h-3.5" /> }));
}

/**
 * The items a search names, for the item history: the whole name in the search, or the search the start of a name
 * ("heart" -> Heartsteel); with a player's name beside it ("faker heartsteel", "has faker built rabadon's deathcap"),
 * that player's games with it.
 */
export function itemShortcuts(items: ItemIndexRow[] | null, index: HubIndex | null, q: string, limit = 2): Shortcut[] {
  // apostrophes and dots don't count ("rabadons deathcap")
  const flat = (s: string) => normText(s).replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const w = flat(q)
    .replace(/\b(has|did|ever|built|build|buy|bought|item|items)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!items || w.length < 3) return [];
  const words = w.split(" ");
  // the search split in two: one side the start of an item's name ("rabadon"), the other a player ("faker")
  const splits: [string, string][] = [];
  for (let i = 1; i < words.length; i++) {
    const head = words.slice(0, i).join(" ");
    const tail = words.slice(i).join(" ");
    splits.push([tail, head], [head, tail]);
  }
  // once per side of the search, only when an item fits the other side (a whole search over every player each time)
  const seen = new Map<string, HubHit | undefined>();
  const playerOf = (rest: string) => {
    if (!seen.has(rest)) {
      const p = rest && index ? searchHub(index, rest, 1).player[0] : undefined;
      seen.set(rest, p && (p.score ?? 9) <= 1.5 ? p : undefined);
    }
    return seen.get(rest);
  };
  const hits: { r: ItemIndexRow; s: number; len: number; p?: HubHit }[] = [];
  for (const r of items) {
    let best: { s: number; len: number; p?: HubHit } | null = null;
    for (const n of new Set([flat(r[0]), flat(itemName(r[0]))])) {
      // the whole search: the item's name or its start
      if (n === w || n.startsWith(w)) {
        const s = n === w ? 0 : 1;
        if (!best || s < best.s) best = { s, len: n.length };
        continue;
      }
      // an item and a player
      for (const [part, rest] of splits) {
        if (part.length < 4 || !n.startsWith(part)) continue;
        const p = playerOf(rest);
        if (p && (!best || best.s > 2)) best = { s: 2, len: part.length, p };
      }
    }
    if (best) hits.push({ r, ...best });
  }
  hits.sort((a, b) => a.s - b.s || b.len - a.len || b.r[2] - a.r[2]);
  return hits.slice(0, limit).map(({ r, p }) => {
    const label = itemName(r[0]);
    const icon = <ItemIcon name={r[0]} size={16} />;
    if (p)
      return { key: `item-${r[1]}-${p.slug}`, route: { kind: "items", query: `player=${p.slug}&item=${r[1]}` }, label: `${p.name} · ${label}`, sub: tl("Has a pro ever built it?"), icon };
    return { key: `item-${r[1]}`, route: { kind: "items", query: `item=${r[1]}` }, label, sub: `${tl("Item history")} · ${tl("{n} games", { n: fmtNum(r[2]) })}`, icon };
  });
}

const KIND_ROUTE: Record<HubSearchKind, HubRoute["kind"]> = { team: "team", player: "player", event: "event", champ: "champ", league: "league" };
export const hitRoute = (h: HubHit): HubRoute =>
  ({
    kind: KIND_ROUTE[h.kind],
    slug: h.slug,
    ...(h.kind === "team" && h.matched ? { query: `as=${encodeURIComponent(h.matched)}` } : {}),
  }) as HubRoute;

/**
 * A player + champion ("faker azir", "chovy ahri") or team + champion ("t1 ryze") query: opens the player's or
 * team's Champions tab directly (with ?champ= for that specific champion's page/game log) and shows their career record once loaded.
 */
export function champPairShortcuts(
  index: HubIndex | null,
  q: string,
  pairStats?: Record<string, string>,
): { shortcuts: Shortcut[]; pairs: { kind: "player" | "team"; slug: string; champ: string; key: string }[] } {
  if (!index || VS.test(q.trim())) return { shortcuts: [], pairs: [] };
  const words = q
    .trim()
    .replace(/\b(on|with|playing|as)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  if (words.length < 2 || words.length > 5) return { shortcuts: [], pairs: [] };
  const out: Shortcut[] = [];
  const pairs: { kind: "player" | "team"; slug: string; champ: string; key: string }[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ");
    const right = words.slice(i).join(" ");
    for (const [whoPart, champPart] of [
      [left, right],
      [right, left],
    ] as const) {
      if (whoPart.length < 2 || champPart.length < 1) continue;
      const wh = searchHub(index, whoPart, 1);
      const pl = wh.player[0];
      const tm = wh.team[0];
      const bestPl = pl && (pl.score ?? 9) <= 1;
      const bestTm = tm && (tm.score ?? 9) <= 1;
      if (!bestPl && !bestTm) continue;
      // When the player or team name is an exact/code match (like after Tab-filling "G2 Esports " or typing "T1 r"),
      // allow 1+ char champion prefixes ("T1 r" -> Ryze, Rumble, Renekton).
      if (champPart.length === 1 && (pl?.score ?? 9) > 0.5 && (tm?.score ?? 9) > 0.5) continue;
      const champs = searchHub(index, champPart, 3).champ.filter((c) => (c.score ?? 9) <= 1);
      for (const ch of champs) {
        if (bestPl && (!bestTm || (pl.score ?? 9) <= (tm.score ?? 9))) {
          const key = `p-${pl.slug}-${ch.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push({ kind: "player", slug: pl.slug, champ: ch.name, key });
          out.push({
            key: `cp-${key}`,
            route: { kind: "player", slug: pl.slug, tab: "champions", query: `champ=${encodeURIComponent(ch.name)}` },
            label: `${pl.name} · ${champName(ch.name)}`,
            sub: pairStats?.[key] ?? tl("Champion pool"),
            icon: <ChampIcon name={ch.name} size={16} />,
            fillText: `${pl.name} ${champName(ch.name)}`,
          });
        } else if (bestTm) {
          const key = `t-${tm.slug}-${ch.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push({ kind: "team", slug: tm.slug, champ: ch.name, key });
          const qParts = [
            tm.matched ? `as=${encodeURIComponent(tm.matched)}` : "",
            `champ=${encodeURIComponent(ch.name)}`,
          ].filter(Boolean);
          out.push({
            key: `cp-${key}`,
            route: { kind: "team", slug: tm.slug, tab: "champions", query: qParts.join("&") },
            label: `${tm.name} · ${champName(ch.name)}`,
            sub: pairStats?.[key] ?? tl("Champion pool"),
            icon: <ChampIcon name={ch.name} size={16} />,
            fillText: `${tm.name} ${champName(ch.name)}`,
          });
        }
      }
    }
  }
  return { shortcuts: out.slice(0, 4), pairs: pairs.slice(0, 4) };
}

const GROUPS: { kind: HubSearchKind; label: string; icon: React.ReactNode }[] = [
  { kind: "team", label: tk("Teams"), icon: <Users className="w-3 h-3" /> },
  { kind: "player", label: tk("Players"), icon: <User className="w-3 h-3" /> },
  { kind: "league", label: tk("Leagues"), icon: <Flag className="w-3 h-3" /> },
  { kind: "event", label: tk("Tournaments"), icon: <Trophy className="w-3 h-3" /> },
  { kind: "champ", label: tk("Champions"), icon: <Swords className="w-3 h-3" /> },
];

/** `initial`: a search to start with, typed in and open (riftwise.gg/stats?q=faker, where the 404 page's box lands). */
export const HubSearch: React.FC<{ autoFocus?: boolean; onDone?: () => void; big?: boolean; placeholder?: string; initial?: string }> = ({
  autoFocus,
  onDone,
  big,
  placeholder,
  initial,
}) => {
  const [q, setQ] = useState(initial || "");
  // When scrolling over options (ArrowDown/ArrowUp or mouse hover), fills the name into the input box
  // without wiping the current search results list until the user types their next character (like a champion name).
  const [preview, setPreview] = useState<string | null>(null);
  const [index, setIndex] = useState<HubIndex | null>(null);
  const [items, setItems] = useState<ItemIndexRow[] | null>(null);
  // the small lists first (teams, tournaments, champions, leagues), the players when their bigger list arrives
  const [partial, setPartial] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMouse = useRef<{ x: number; y: number }>({ x: -1, y: -1 });

  const start = () => {
    setOpen(true);
    if (!index && !failed) {
      let full = false;
      loadHubIndexQuick()
        .then((q) => {
          if (full) return;
          setIndex(q);
          setPartial(true);
        })
        .catch(() => {});
      loadHubIndex()
        .then((x) => {
          full = true;
          setIndex(x);
          setPartial(false);
        })
        .catch(() => setFailed(true));
      // the item names (~27 KB), for "heartsteel" and "faker heartsteel"
      loadItemIndex()
        .then(setItems)
        .catch(() => {});
    }
  };
  useEffect(() => {
    if (autoFocus || initial) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setPreview(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => (index && q.trim() ? searchHub(index, q, big ? 6 : 5) : null), [index, q, big]);
  const [pairStats, setPairStats] = useState<Record<string, string>>({});
  const champPairs = useMemo(() => (q.trim() ? champPairShortcuts(index, q, pairStats) : { shortcuts: [], pairs: [] }), [index, q, pairStats]);
  useEffect(() => {
    let alive = true;
    for (const pr of champPairs.pairs) {
      if (pairStats[pr.key] !== undefined) continue;
      if (pr.kind === "player") {
        loadHubPlayer(pr.slug)
          .then((p) => {
            if (!alive) return;
            const c = p.champs.find((x) => x.c.toLowerCase() === pr.champ.toLowerCase());
            const txt = c ? `${c.g}G · ${c.w}W-${c.g - c.w}L (${winRate(c.w, c.g)}) · KDA ${fmtN(c.kda)}` : tl("{n} games", { n: 0 });
            setPairStats((prev) => ({ ...prev, [pr.key]: txt }));
          })
          .catch(() => {});
      } else {
        loadHubTeam(pr.slug)
          .then((t) => {
            if (!alive) return;
            const c = t.champs.find((x) => x.c.toLowerCase() === pr.champ.toLowerCase());
            const txt = c ? `${c.g}G · ${c.w}W-${c.g - c.w}L (${winRate(c.w, c.g)})` : tl("{n} games", { n: 0 });
            setPairStats((prev) => ({ ...prev, [pr.key]: txt }));
          })
          .catch(() => {});
      }
    }
    return () => {
      alive = false;
    };
  }, [champPairs.pairs, pairStats]);

  // When a player or team name is filled in with a trailing space ("Faker " or "T1 "), load their top signature champions
  // so the user can either type any champion name or immediately pick one of their most-played champions.
  const [entityChamps, setEntityChamps] = useState<Record<string, Shortcut[]>>({});
  const filledEntity = useMemo(() => {
    const activeText = preview ?? q;
    if (!index || !/\s$/.test(activeText) || VS.test(activeText.trim())) return null;
    const trimmed = activeText.trim();
    if (!trimmed) return null;
    const hit = searchHub(index, trimmed, 1);
    const pl = hit.player[0];
    const tm = hit.team[0];
    if (pl && (pl.score ?? 9) <= 0.5 && (!tm || (pl.score ?? 9) <= (tm.score ?? 9))) {
      return { kind: "player" as const, slug: pl.slug, name: pl.name, key: `ep-${pl.slug}` };
    }
    if (tm && (tm.score ?? 9) <= 0.5) {
      return { kind: "team" as const, slug: tm.slug, name: tm.name, matched: tm.matched, key: `et-${tm.slug}` };
    }
    return null;
  }, [index, q, preview]);

  useEffect(() => {
    if (!filledEntity || entityChamps[filledEntity.key]) return;
    let alive = true;
    if (filledEntity.kind === "player") {
      loadHubPlayer(filledEntity.slug)
        .then((p) => {
          if (!alive) return;
          const top: Shortcut[] = p.champs.slice(0, 4).map((c) => ({
            key: `top-p-${p.u}-${c.c}`,
            route: { kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(c.c)}` },
            label: `${p.name} · ${champName(c.c)}`,
            sub: `${c.g}G · ${c.w}W-${c.g - c.w}L (${winRate(c.w, c.g)}) · KDA ${fmtN(c.kda)}`,
            icon: <ChampIcon name={c.c} size={16} />,
            fillText: `${p.name} ${champName(c.c)}`,
          }));
          setEntityChamps((prev) => ({ ...prev, [filledEntity.key]: top }));
        })
        .catch(() => {});
    } else {
      loadHubTeam(filledEntity.slug)
        .then((t) => {
          if (!alive) return;
          const top: Shortcut[] = t.champs.slice(0, 4).map((c) => {
            const qParts = [
              filledEntity.matched ? `as=${encodeURIComponent(filledEntity.matched)}` : "",
              `champ=${encodeURIComponent(c.c)}`,
            ].filter(Boolean);
            return {
              key: `top-t-${t.u}-${c.c}`,
              route: { kind: "team", slug: t.u, tab: "champions", query: qParts.join("&") },
              label: `${t.name} · ${champName(c.c)}`,
              sub: `${c.g}G · ${c.w}W-${c.g - c.w}L (${winRate(c.w, c.g)})`,
              icon: <ChampIcon name={c.c} size={16} />,
              fillText: `${t.name} ${champName(c.c)}`,
            };
          });
          setEntityChamps((prev) => ({ ...prev, [filledEntity.key]: top }));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [filledEntity, entityChamps]);

  // a matchup ("t1 vs gen.g"), player/team + champion ("faker azir"), top champions when a player/team is filled ("Faker "), item history, and stats pages
  const topEntityShortcuts = filledEntity && champPairs.shortcuts.length === 0 ? entityChamps[filledEntity.key] || [] : [];
  const shortcuts = useMemo(
    () =>
      q.trim()
        ? [
            ...(index ? matchupShortcuts(index, q) : []),
            ...champPairs.shortcuts,
            ...topEntityShortcuts,
            ...itemShortcuts(items, index, q),
            ...pageShortcuts(q),
          ]
        : [],
    [index, items, q, champPairs.shortcuts, topEntityShortcuts],
  );
  // the group with the best match first (a champion called exactly that, a big tournament, ...)
  const groups = useMemo(() => (results ? [...GROUPS].sort((a, b) => groupRank(results[a.kind]) - groupRank(results[b.kind])) : GROUPS), [results]);
  const flat = useMemo(() => (results ? groups.flatMap((g) => results[g.kind]) : []), [results, groups]);
  const fuzzy = flat.length > 0 && flat.every((h) => h.fuzzy);
  useEffect(() => setActive(0), [q]);

  const done = () => {
    setQ("");
    setPreview(null);
    setOpen(false);
    onDone?.();
  };
  const go = (h: HubHit) => {
    navigateHub(hitRoute(h));
    done();
  };
  /** the highlighted line: the shortcuts first, then the hits */
  const choose = (i: number) => {
    if (i < shortcuts.length) {
      navigateHub(shortcuts[i].route);
      done();
    } else if (flat[i - shortcuts.length]) go(flat[i - shortcuts.length]);
  };
  const count = shortcuts.length + flat.length;

  /** What text to fill into the search box when scrolling over or pressing Tab on a hit. */
  const fillForHit = (h: HubHit): string | null => {
    if (h.kind === "team" || h.kind === "player") {
      const vsMatch = /^(.+?\s+(?:vs\.?|v\.?|versus|x|[-–])\s*).*$/i.exec(q);
      if (vsMatch) return `${vsMatch[1]}${h.name}`;
      return `${h.name} `;
    }
    if (h.kind === "champ") {
      return `${champName(h.name)} `;
    }
    return null;
  };

  /** Fill text for any index `i` in the dropdown (`shortcuts` + `flat`). */
  const fillForIndex = (i: number): string | null => {
    if (i < 0 || i >= count) return null;
    if (i < shortcuts.length) return shortcuts[i].fillText || null;
    const h = flat[i - shortcuts.length];
    return h ? fillForHit(h) : null;
  };

  /** Preview a filled name in the search box (on ArrowDown/Up or mouse hover) with caret placed at the end. */
  const applyPreview = (fill: string | null) => {
    setPreview(fill);
    if (fill) {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          if (document.activeElement !== el) el.focus();
          el.setSelectionRange(fill.length, fill.length);
        }
      });
    }
  };

  /** Commit a filled name into `q` and focus the input at the end so the user can immediately type a champion name. */
  const commitFill = (text: string) => {
    setQ(text);
    setPreview(null);
    setOpen(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(text.length, text.length);
      }
    });
  };

  const displayValue = preview ?? q;

  return (
    <div ref={box} className="relative w-full">
      <label
        className={`flex items-center gap-2 bg-rw-bg border border-rw-border focus-within:border-rw-accent/70 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rw-accent/60 rounded-lg ${big ? "px-3 py-2.5" : "px-2.5 py-1.5"}`}
      >
        <Search className={`${big ? "w-4 h-4" : "w-3.5 h-3.5"} text-rw-muted shrink-0`} />
        <input
          ref={inputRef}
          value={displayValue}
          autoFocus={autoFocus}
          onFocus={start}
          onChange={(e) => {
            setQ(e.target.value);
            setPreview(null);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab" && open && (q.trim() || preview)) {
              const target =
                preview ||
                fillForIndex(active) ||
                (() => {
                  const firstWho = flat.find((h) => h.kind === "team" || h.kind === "player" || h.kind === "champ");
                  return firstWho ? fillForHit(firstWho) : null;
                })();
              if (target) {
                e.preventDefault();
                commitFill(target);
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (count > 0) {
                const next = Math.min(active + 1, count - 1);
                setActive(next);
                applyPreview(fillForIndex(next));
              }
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (count > 0) {
                const next = Math.max(active - 1, 0);
                setActive(next);
                applyPreview(fillForIndex(next));
              }
            } else if (e.key === "Enter" && active < count) {
              e.preventDefault();
              choose(active);
            } else if (e.key === "Escape") {
              if (preview) {
                setPreview(null);
              } else {
                setOpen(false);
                onDone?.();
              }
            }
          }}
          placeholder={placeholder || tl("Search teams, players, tournaments, champions…")}
          aria-label={tl("Search pro stats")}
          // w-full: a text box otherwise keeps a minimum width of its own, and in the header that pushed the buttons
          // on its right off a phone screen
          className={`bg-transparent outline-none text-rw-text placeholder-rw-muted flex-1 min-w-0 w-full ${big ? "text-sm" : "text-xs"}`}
        />
        {displayValue && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setPreview(null);
            }}
            aria-label={tl("Clear")}
            className="text-rw-muted hover:text-rw-text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </label>
      {open && q.trim() && (
        <div
          className="absolute z-40 left-0 right-0 min-w-[min(18rem,calc(100vw-1.5rem))] mt-1 bg-rw-surface border border-rw-accent/40 rounded-lg shadow-2xl max-h-[70vh] overflow-y-auto p-1.5 text-xs"
          onMouseLeave={() => {
            if (preview) setPreview(null);
          }}
        >
          {filledEntity && (
            <div className="px-2 py-1 mb-1 rounded bg-rw-accent/10 border border-rw-accent/25 text-[11px] text-rw-sub flex items-center justify-between gap-2">
              <span>
                <span className="font-semibold text-rw-text">{filledEntity.name}</span> · {tl("Search champions…")}
              </span>
              <span className="text-[10px] font-mono text-rw-accent shrink-0">Enter ↵</span>
            </div>
          )}
          {shortcuts.length > 0 && (
            <div className="mb-1">
              {shortcuts.map((s, i) => (
                <HubLink
                  key={s.key}
                  to={s.route}
                  onNavigate={done}
                  onMouseMove={(e) => {
                    if (e.clientX === lastMouse.current.x && e.clientY === lastMouse.current.y) return;
                    lastMouse.current = { x: e.clientX, y: e.clientY };
                    setActive(i);
                    if (s.fillText) applyPreview(s.fillText);
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md min-w-0 ${i === active ? "bg-rw-accent/15 text-rw-text" : "text-rw-text hover:bg-rw-raised"}`}
                >
                  <span className="text-rw-accent shrink-0">{s.icon}</span>
                  {/* the label keeps its room ("Match prep: T1 vs Gen.G"); the hint gives way */}
                  <span className="font-semibold truncate shrink-0 max-w-[80%]">{s.label}</span>
                  <span className="text-rw-muted text-[11px] truncate ml-auto min-w-0">{s.sub}</span>
                </HubLink>
              ))}
            </div>
          )}
          {failed ? (
            <p className="p-3 text-rw-red">{tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>
          ) : !index || (partial && (flat.length === 0 || fuzzy)) ? (
            <p className="p-3 text-rw-sub">{tl("Loading…")}</p>
          ) : flat.length === 0 && shortcuts.length > 0 ? null : flat.length === 0 ? (
            <p className="p-3 text-rw-sub">
              {tl("Nothing matches \"{q}\".", { q })}
              {isNonLatin(q) ? " " + tl("Names here use English letters. Try the in-game name, like Faker or T1.") : ""}
            </p>
          ) : (
            <>
            {fuzzy && <p className="px-2 pt-1 text-rw-sub">{tl("No exact match. Closest names:")}</p>}
            {groups.filter((g) => results![g.kind].length).map((g) => (
              <div key={g.kind} className="mb-1 last:mb-0">
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold text-rw-muted flex items-center gap-1">
                  {g.icon}
                  {tl(g.label)}
                </div>
                {results![g.kind].map((h) => {
                  const i = shortcuts.length + flat.indexOf(h);
                  const fill = fillForHit(h);
                  const canChain = h.kind === "team" || h.kind === "player";
                  return (
                    <HubLink
                      key={h.kind + h.slug}
                      to={hitRoute(h)}
                      onNavigate={() => {
                        setQ("");
                        setPreview(null);
                        setOpen(false);
                        onDone?.();
                      }}
                      onMouseMove={(e) => {
                        if (e.clientX === lastMouse.current.x && e.clientY === lastMouse.current.y) return;
                        lastMouse.current = { x: e.clientX, y: e.clientY };
                        setActive(i);
                        if (fill) applyPreview(fill);
                      }}
                      className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md min-w-0 ${
                        i === active ? "bg-rw-accent/15 text-rw-text" : "text-rw-text hover:bg-rw-raised"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {h.kind === "champ" && <ChampIcon name={h.name} size={18} />}
                        <span className="font-semibold truncate">{h.kind === "champ" ? champName(h.name) : h.name}</span>
                        {h.matched && <span className="text-rw-muted truncate">({h.kind === "team" ? tl("was {name}", { name: h.matched }) : h.matched})</span>}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0 max-w-[55%] min-w-0">
                        <span className="text-rw-muted text-[11px] truncate">
                          {h.kind === "player"
                            ? [h.role ? roleName(h.role) : "", h.sub, h.year].filter(Boolean).join(" · ")
                            : h.kind === "champ"
                              ? tl("{n} pro picks", { n: fmtNum(h.games) })
                              : h.sub}
                        </span>
                        {canChain && fill && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              commitFill(fill);
                            }}
                            title={`${h.name} · ${tl("Search champions…")} (Tab)`}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors shrink-0 ${
                              i === active
                                ? "border-rw-accent/50 bg-rw-accent/15 text-rw-accent"
                                : "border-rw-border bg-rw-bg/70 text-rw-muted opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            Tab ↹
                          </button>
                        )}
                      </span>
                    </HubLink>
                  );
                })}
              </div>
            ))}
            {partial && <p className="px-2 pb-1 text-[11px] text-rw-muted">{tl("Players are still loading…")}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
};
