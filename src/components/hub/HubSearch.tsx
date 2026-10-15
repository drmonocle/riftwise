/** One search box for every team, player, tournament and champion since 2011. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users, User, Trophy, Swords, X } from "lucide-react";
import { tl, tk, roleName } from "../../i18n";
import { champName } from "../../champions";
import { isNonLatin } from "../../searchAliases";
import { HubHit, HubIndex, HubSearchKind, loadHubIndex, searchHub } from "../../hub/data";
import { HubRoute, navigateHub } from "../../hub/route";
import { ChampIcon, fmtNum, HubLink } from "./ui";

const KIND_ROUTE: Record<HubSearchKind, HubRoute["kind"]> = { team: "team", player: "player", event: "event", champ: "champ" };
export const hitRoute = (h: HubHit): HubRoute => ({ kind: KIND_ROUTE[h.kind], slug: h.slug }) as HubRoute;

const GROUPS: { kind: HubSearchKind; label: string; icon: React.ReactNode }[] = [
  { kind: "team", label: tk("Teams"), icon: <Users className="w-3 h-3" /> },
  { kind: "player", label: tk("Players"), icon: <User className="w-3 h-3" /> },
  { kind: "event", label: tk("Tournaments"), icon: <Trophy className="w-3 h-3" /> },
  { kind: "champ", label: tk("Champions"), icon: <Swords className="w-3 h-3" /> },
];

export const HubSearch: React.FC<{ autoFocus?: boolean; onDone?: () => void; big?: boolean; placeholder?: string }> = ({ autoFocus, onDone, big, placeholder }) => {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<HubIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const start = () => {
    setOpen(true);
    if (!index && !failed)
      loadHubIndex()
        .then(setIndex)
        .catch(() => setFailed(true));
  };
  useEffect(() => {
    if (autoFocus) start();
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
  const flat = useMemo(() => (results ? GROUPS.flatMap((g) => results[g.kind]) : []), [results]);
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
        className={`flex items-center gap-2 bg-[#091428] border border-[#1e282d] focus-within:border-[#c8aa6e]/70 rounded-lg ${big ? "px-3 py-2.5" : "px-2.5 py-1.5"}`}
      >
        <Search className={`${big ? "w-4 h-4" : "w-3.5 h-3.5"} text-[#7e8e9f] shrink-0`} />
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
          className={`bg-transparent outline-none text-[#f0e6d2] placeholder-[#7e8e9f] flex-1 min-w-0 ${big ? "text-sm" : "text-xs"}`}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label={tl("Clear")} className="text-[#7e8e9f] hover:text-[#f0e6d2]">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </label>
      {open && q.trim() && (
        <div className="absolute z-40 left-0 right-0 mt-1 bg-[#0a1420] border border-[#c8aa6e]/40 rounded-lg shadow-2xl max-h-[70vh] overflow-y-auto p-1.5 text-xs">
          {failed ? (
            <p className="p-3 text-[#e84057]">{tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>
          ) : !index ? (
            <p className="p-3 text-[#9bb3c9]">{tl("Loading…")}</p>
          ) : flat.length === 0 ? (
            <p className="p-3 text-[#9bb3c9]">
              {tl("Nothing matches \"{q}\".", { q })}
              {isNonLatin(q) ? " " + tl("Names here use English letters. Try the in-game name, like Faker or T1.") : ""}
            </p>
          ) : (
            GROUPS.filter((g) => results![g.kind].length).map((g) => (
              <div key={g.kind} className="mb-1 last:mb-0">
                <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider font-bold text-[#7e8e9f] flex items-center gap-1">
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
                        i === active ? "bg-[#c8aa6e]/15 text-[#f0e6d2]" : "text-[#f0e6d2] hover:bg-[#121e2d]"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {h.kind === "champ" && <ChampIcon name={h.name} size={18} />}
                        <span className="font-semibold truncate">{h.kind === "champ" ? champName(h.name) : h.name}</span>
                        {h.matched && <span className="text-[#7e8e9f] truncate">({h.kind === "team" ? tl("was {name}", { name: h.matched }) : h.matched})</span>}
                      </span>
                      <span className="text-[#7e8e9f] text-[11px] truncate shrink-0 max-w-[50%]">
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
            ))
          )}
        </div>
      )}
    </div>
  );
};
