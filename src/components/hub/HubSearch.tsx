/**
 * One search box for every team, player, tournament and champion since 2011, and for the stats pages themselves
 * ("tier list", "draft"). Two names with "vs" between them ("T1 vs Gen.G", "Faker vs Chovy") open Match prep or
 * Compare for the pair; an item ("heartsteel"), or a player and an item ("faker heartsteel"), opens its item history.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users, User, Trophy, Swords, X, Flag, GitCompare, ClipboardList, Compass } from "lucide-react";
import { tl, tk, roleName } from "../../i18n";
import { champName } from "../../champions";
import { isNonLatin } from "../../searchAliases";
import { groupRank, HubHit, HubIndex, HubSearchKind, loadHubIndex, loadHubIndexQuick, loadItemIndex, normText, searchHub } from "../../hub/data";
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
export const hitRoute = (h: HubHit): HubRoute => ({ kind: KIND_ROUTE[h.kind], slug: h.slug }) as HubRoute;

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
  const [index, setIndex] = useState<HubIndex | null>(null);
  const [items, setItems] = useState<ItemIndexRow[] | null>(null);
  // the small lists first (teams, tournaments, champions, leagues), the players when their bigger list arrives
  const [partial, setPartial] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => (index && q.trim() ? searchHub(index, q, big ? 6 : 5) : null), [index, q, big]);
  // a matchup ("t1 vs gen.g") and the stats pages the words name, above the rest
  const shortcuts = useMemo(
    () => (q.trim() ? [...(index ? matchupShortcuts(index, q) : []), ...itemShortcuts(items, index, q), ...pageShortcuts(q)] : []),
    [index, items, q],
  );
  // the group with the best match first (a champion called exactly that, a big tournament, ...)
  const groups = useMemo(() => (results ? [...GROUPS].sort((a, b) => groupRank(results[a.kind]) - groupRank(results[b.kind])) : GROUPS), [results]);
  const flat = useMemo(() => (results ? groups.flatMap((g) => results[g.kind]) : []), [results, groups]);
  const fuzzy = flat.length > 0 && flat.every((h) => h.fuzzy);
  useEffect(() => setActive(0), [q]);

  const done = () => {
    setQ("");
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

  return (
    <div ref={box} className="relative w-full">
      <label
        className={`flex items-center gap-2 bg-rw-bg border border-rw-border focus-within:border-rw-accent/70 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rw-accent/60 rounded-lg ${big ? "px-3 py-2.5" : "px-2.5 py-1.5"}`}
      >
        <Search className={`${big ? "w-4 h-4" : "w-3.5 h-3.5"} text-rw-muted shrink-0`} />
        <input
          value={q}
          autoFocus={autoFocus}
          onFocus={start}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, count - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && active < count) {
              e.preventDefault();
              choose(active);
            } else if (e.key === "Escape") {
              setOpen(false);
              onDone?.();
            }
          }}
          placeholder={placeholder || tl("Search teams, players, tournaments, champions…")}
          aria-label={tl("Search pro stats")}
          // w-full: a text box otherwise keeps a minimum width of its own, and in the header that pushed the buttons
          // on its right off a phone screen
          className={`bg-transparent outline-none text-rw-text placeholder-rw-muted flex-1 min-w-0 w-full ${big ? "text-sm" : "text-xs"}`}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label={tl("Clear")} className="text-rw-muted hover:text-rw-text">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </label>
      {open && q.trim() && (
        <div className="absolute z-40 left-0 right-0 min-w-[min(18rem,calc(100vw-1.5rem))] mt-1 bg-rw-surface border border-rw-accent/40 rounded-lg shadow-2xl max-h-[70vh] overflow-y-auto p-1.5 text-xs">
          {shortcuts.length > 0 && (
            <div className="mb-1">
              {shortcuts.map((s, i) => (
                <HubLink
                  key={s.key}
                  to={s.route}
                  onNavigate={done}
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
                  return (
                    <HubLink
                      key={h.kind + h.slug}
                      to={hitRoute(h)}
                      onNavigate={() => {
                        setQ("");
                        setOpen(false);
                        onDone?.();
                      }}
                      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md min-w-0 ${
                        i === active ? "bg-rw-accent/15 text-rw-text" : "text-rw-text hover:bg-rw-raised"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {h.kind === "champ" && <ChampIcon name={h.name} size={18} />}
                        <span className="font-semibold truncate">{h.kind === "champ" ? champName(h.name) : h.name}</span>
                        {h.matched && <span className="text-rw-muted truncate">({h.kind === "team" ? tl("was {name}", { name: h.matched }) : h.matched})</span>}
                      </span>
                      <span className="text-rw-muted text-[11px] truncate shrink-0 max-w-[50%]">
                        {h.kind === "player"
                          ? [h.role ? roleName(h.role) : "", h.sub, h.year].filter(Boolean).join(" · ")
                          : h.kind === "champ"
                            ? tl("{n} pro picks", { n: fmtNum(h.games) })
                            : h.sub}
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
