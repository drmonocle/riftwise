/** One search box for every team, player, tournament and champion since 2011. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users, User, Trophy, Swords, X, Flag } from "lucide-react";
import { tl, tk, roleName } from "../../i18n";
import { champName } from "../../champions";
import { isNonLatin } from "../../searchAliases";
import { groupRank, HubHit, HubIndex, HubSearchKind, loadHubIndex, loadHubIndexQuick, searchHub } from "../../hub/data";
import { HubRoute, navigateHub } from "../../hub/route";
import { ChampIcon, fmtNum, HubLink } from "./ui";

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
  // the group with the best match first (a champion called exactly that, a big tournament, ...)
  const groups = useMemo(() => (results ? [...GROUPS].sort((a, b) => groupRank(results[a.kind]) - groupRank(results[b.kind])) : GROUPS), [results]);
  const flat = useMemo(() => (results ? groups.flatMap((g) => results[g.kind]) : []), [results, groups]);
  const fuzzy = flat.length > 0 && flat.every((h) => h.fuzzy);
  useEffect(() => setActive(0), [q]);

  const go = (h: HubHit) => {
    navigateHub(hitRoute(h));
    setQ("");
    setOpen(false);
    onDone?.();
  };

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
              setActive((a) => Math.min(a + 1, flat.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && flat[active]) {
              e.preventDefault();
              go(flat[active]);
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
          {failed ? (
            <p className="p-3 text-rw-red">{tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>
          ) : !index || (partial && (flat.length === 0 || fuzzy)) ? (
            <p className="p-3 text-rw-sub">{tl("Loading…")}</p>
          ) : flat.length === 0 ? (
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
                  const i = flat.indexOf(h);
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
