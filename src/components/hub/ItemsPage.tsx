/**
 * Item history: has a pro ever finished a game holding an item? Pick a player and an item for the yes or no and every
 * game; a player alone for every item they've finished games with; an item alone for the players who built it most.
 * From each game's final inventory (hub/playeritems/ and hub/items/, written by the stats build), so an item sold
 * before the end of a game isn't counted.
 * Address: /stats/items?player=faker&item=heartsteel
 */
import React, { useMemo, useState } from "react";
import { tl, tc } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubIndex, loadHubItem, loadItemIndex, loadPlayerGames, loadPlayerItems, normText, prettySlug } from "../../hub/data";
import type { PlayerGameRow, SearchPlayerRow } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { isFinishedItem, itemName, useDDragon } from "../../hub/ddragon";
import { card, ChampIcon, fmtDate, fmtNum, HubLink, ItemIcon, Loading, PlayerLink, Section, td, th, useHiddenCheck, useLoad, usePageTitle } from "./ui";
import { STable } from "../STable";

const playerSlug = (r: SearchPlayerRow) => r[1] || prettySlug(r[0]);
const sel = "bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text";

/** The players whose name fits what was typed, best fit first, then most games. */
function findPlayers(rows: SearchPlayerRow[], typed: string, n = 8): SearchPlayerRow[] {
  const q = normText(typed.trim());
  if (!q) return [];
  const fit = (r: SearchPlayerRow) => {
    const s = normText(r[0]);
    return s === q ? 0 : s.startsWith(q) ? 1 : s.includes(q) ? 2 : r[6] && normText(r[6]).includes(q) ? 3 : -1;
  };
  return rows
    .map((r) => [fit(r), r] as const)
    .filter(([f]) => f >= 0)
    .sort((a, b) => a[0] - b[0] || b[1][3] - a[1][3])
    .slice(0, n)
    .map(([, r]) => r);
}

export const ItemsPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Item history"));
  useDDragon();
  const q = new URLSearchParams(query || "");
  const player = q.get("player") || "";
  const item = q.get("item") || "";
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query || "");
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    navigateHub({ kind: "items", query: next.toString() }, { replace: true });
  };
  const items = useLoad(loadItemIndex, []);
  const people = useLoad(loadHubIndex, []);
  const [typed, setTyped] = useState("");
  const found = useMemo(() => findPlayers(people.data?.players || [], typed), [people.data, typed]);
  const who = useMemo(() => (people.data?.players || []).find((r) => playerSlug(r) === player), [people.data, player]);
  const itemRow = useMemo(() => (items.data || []).find((r) => r[1] === item), [items.data, item]);
  return (
    <div className="rw-page">
      <div className={`${card} space-y-2 rw-span`}>
        <h1 className="text-lg font-bold text-rw-text">{tl("Item history")}</h1>
        <p className="text-[11px] text-rw-sub">
          {tl("Has a pro ever built it? Pick a player and an item: every pro game they finished holding it. A player alone shows every item they've finished games with; an item alone, the players who built it most. From the final inventory of every pro game with a full scoreboard, so an item sold before the end doesn't count.")}
        </p>
        <div className="flex flex-wrap items-start gap-2 text-xs">
          <div className="relative">
            <input
              type="search"
              value={typed}
              placeholder={who ? who[0] : tl("Player…")}
              aria-label={tl("Player")}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && found[0]) {
                  set({ player: playerSlug(found[0]) });
                  setTyped("");
                }
              }}
              className={`${sel} w-52`}
            />
            {found.length > 0 && (
              <ul className="absolute z-20 mt-1 w-64 max-w-[80vw] rounded-lg border border-rw-border bg-rw-surface shadow-lg py-1">
                {found.map((r) => (
                  <li key={playerSlug(r)}>
                    <button
                      type="button"
                      onClick={() => {
                        set({ player: playerSlug(r) });
                        setTyped("");
                      }}
                      className="w-full text-left px-2 py-1 hover:bg-rw-bg flex justify-between gap-2"
                    >
                      <span className="truncate text-rw-text">{r[0]}</span>
                      <span className="text-rw-muted shrink-0">
                        {r[2] || r[4]} · {tl("{n} games", { n: fmtNum(r[3]) })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input
            list="rw-item-list"
            placeholder={itemRow ? itemName(itemRow[0]) : tl("Item…")}
            aria-label={tl("Item")}
            key={item}
            onChange={(e) => {
              const v = normText(e.target.value.trim());
              const hit = (items.data || []).find((r) => normText(r[0]) === v || normText(itemName(r[0])) === v);
              if (hit) set({ item: hit[1] });
            }}
            className={`${sel} w-56`}
          />
          <datalist id="rw-item-list">
            {(items.data || []).map((r) => (
              <option key={r[1]} value={itemName(r[0])} />
            ))}
          </datalist>
          {(player || item) && (
            <span className="flex flex-wrap gap-1.5 items-center">
              {who && (
                <button type="button" onClick={() => set({ player: undefined })} className="px-2 py-1 rounded-full border border-rw-accent text-rw-accent" title={tl("Clear")}>
                  {who[0]} ✕
                </button>
              )}
              {itemRow && (
                <button type="button" onClick={() => set({ item: undefined })} className="px-2 py-1 rounded-full border border-rw-accent text-rw-accent flex items-center gap-1" title={tl("Clear")}>
                  <ItemIcon name={itemRow[0]} size={16} /> {itemName(itemRow[0])} ✕
                </button>
              )}
            </span>
          )}
        </div>
      </div>
      {player ? (
        <PlayerItemsView slug={player} name={who?.[0] || player} item={item} itemTitle={itemRow?.[0]} onItem={(s) => set({ item: s })} />
      ) : item ? (
        <ItemPlayersView slug={item} onPlayer={(s) => set({ player: s })} />
      ) : (
        <Section title={tl("Most built items")}>
          {items.loading ? (
            <Loading />
          ) : !items.data ? (
            <p className="text-xs text-rw-sub">{tl("Not in the stats yet.")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(items.data || [])
                .filter((r) => isFinishedItem(r[0]))
                .slice(0, 60)
                .map((r) => (
                  <HubLink key={r[1]} to={{ kind: "items", query: `item=${r[1]}` }} className="flex items-center gap-1 px-2 py-1 rounded border border-rw-border text-xs hover:border-rw-accent">
                    <ItemIcon name={r[0]} size={18} /> {itemName(r[0])}
                  </HubLink>
                ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
};

/** One player's items: every item with its games, or one item's yes or no and the games. */
const PlayerItemsView: React.FC<{ slug: string; name: string; item: string; itemTitle?: string; onItem: (slug: string) => void }> = ({ slug, name, item, itemTitle, onItem }) => {
  const mine = useLoad(() => loadPlayerItems(slug), [slug]);
  const log = useLoad(() => loadPlayerGames(slug), [slug]);
  const [filter, setFilter] = useState("");
  const [finishedOnly, setFinishedOnly] = useState(true);
  if (mine.loading || log.loading) return <Loading />;
  if (!mine.data || !log.data) return <p className="text-xs text-rw-sub rw-span">{tl("No item history for this player yet.")}</p>;
  const rows = log.data;
  const games = (pos: number[]) => pos.map((i) => rows[i]).filter((r): r is PlayerGameRow => !!r);
  if (item) {
    const hit = mine.data.find(([it]) => prettySlug(it) === item);
    const label = itemName(hit?.[0] || itemTitle || item);
    if (!hit)
      return (
        <Section title={label}>
          <p className="text-sm text-rw-text">
            <span className="font-bold text-rw-red">{tl("No.")}</span>{" "}
            {tl("None of {player}'s {n} pro games with a full scoreboard ended with {item}.", { player: name, n: fmtNum(rows.length), item: label })}
          </p>
          <HubLink to={{ kind: "items", query: `item=${item}` }} className="text-[11px] text-rw-teal hover:underline">
            {tl("Who built {item} most", { item: label })}
          </HubLink>
        </Section>
      );
    const g = games(hit[1]);
    return (
      <Section title={label} right={<ItemIcon name={hit[0]} size={22} />}>
        <p className="text-sm text-rw-text">
          <span className="font-bold text-rw-teal">{tl("Yes.")}</span>{" "}
          {tl("{player} finished {n} pro games holding {item}: first on {first}, last on {last}.", {
            player: name,
            n: fmtNum(g.length),
            item: label,
            first: fmtDate(g[g.length - 1][0]),
            last: fmtDate(g[0][0]),
          })}
        </p>
        <ChampSpread games={g} />
        <GameList games={g} spoilerKey={`items:${slug}`} />
        <HubLink to={{ kind: "items", query: `item=${item}` }} className="text-[11px] text-rw-teal hover:underline">
          {tl("Who built {item} most", { item: label })}
        </HubLink>
      </Section>
    );
  }
  const f = normText(filter.trim());
  const list = mine.data.filter(([it]) => (!finishedOnly || isFinishedItem(it)) && (!f || normText(itemName(it)).includes(f) || normText(it).includes(f)));
  return (
    <Section title={tl("Every item {player} finished pro games with", { player: name })}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tl("Find an item…")} aria-label={tl("Find an item")} className={`${sel} w-48`} />
        <label className="flex items-center gap-1.5 text-rw-sub">
          <input type="checkbox" checked={finishedOnly} onChange={(e) => setFinishedOnly(e.target.checked)} />
          {tl("Finished items only")}
        </label>
        <span className="text-rw-muted">{tl("{n} pro games with a full scoreboard", { n: fmtNum(rows.length) })}</span>
      </div>
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Item")}</th>
            <th className={th}>{tl("Games")}</th>
            <th className={th}>{tl("Win %")}</th>
            <th className={`${th} max-sm:hidden`}>{tl("Champions")}</th>
            <th className={th}>{tl("Last")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map(([it, pos]) => {
            const g = games(pos);
            const won = g.filter((r) => r[6]).length;
            return (
              <tr key={it} className="border-t border-rw-border">
                <td className={`${td} max-w-[14rem]`}>
                  <button type="button" onClick={() => onItem(prettySlug(it))} className="flex items-center gap-1.5 min-w-0 text-left hover:text-rw-accent" title={tl("Show the games")}>
                    <ItemIcon name={it} size={18} />
                    <span className="truncate">{itemName(it)}</span>
                  </button>
                </td>
                <td className={`${td} tabular-nums text-rw-sub`} data-sort={g.length}>
                  {fmtNum(g.length)}
                </td>
                <td className={`${td} tabular-nums text-rw-sub`} data-sort={g.length ? won / g.length : 0}>
                  {winRate(won, g.length)}
                </td>
                <td className={`${td} max-sm:hidden`}>
                  <span className="flex gap-0.5">
                    {topChamps(g, 4).map(([c]) => (
                      <ChampIcon key={c} name={c} size={16} />
                    ))}
                  </span>
                </td>
                <td className={`${td} text-rw-muted whitespace-nowrap`} data-sort={g[0]?.[0] || ""}>
                  {g[0] ? fmtDate(g[0][0], false) : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </STable>
      {!list.length && <p className="text-[11px] text-rw-muted">{tl("No item fits.")}</p>}
    </Section>
  );
};

/** One item's players, most games first; picking one opens their games with it. */
const ItemPlayersView: React.FC<{ slug: string; onPlayer: (slug: string) => void }> = ({ slug, onPlayer }) => {
  const st = useLoad(() => loadHubItem(slug), [slug]);
  if (st.loading) return <Loading />;
  if (!st.data) return <p className="text-xs text-rw-sub rw-span">{tl("No pro game in the stats ended with this item.")}</p>;
  const it = st.data;
  return (
    <Section title={tl("Who built {item} most", { item: itemName(it.n) })} right={<ItemIcon name={it.n} size={22} />}>
      <p className="text-[11px] text-rw-muted">
        {tl("{g} pro games by {p} players ended with it.", { g: fmtNum(it.g), p: fmtNum(it.np) })}
        {it.np > it.players.length ? ` ${tl("The {n} with the most games:", { n: it.players.length })}` : ""}
      </p>
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Player")}</th>
            <th className={th}>{tl("Games")}</th>
            <th className={th}>{tl("Last")}</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {it.players.map(([n, u, g, last]) => (
            <tr key={u} className="border-t border-rw-border">
              <td className={td}>
                <PlayerLink name={n} u={u} />
              </td>
              <td className={`${td} tabular-nums text-rw-sub`}>{fmtNum(g)}</td>
              <td className={`${td} text-rw-muted whitespace-nowrap`} data-sort={last}>
                {fmtDate(last, false)}
              </td>
              <td className={`${td} text-right`}>
                <button type="button" onClick={() => onPlayer(u)} className="text-rw-teal hover:underline">
                  {tl("Their games")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </STable>
    </Section>
  );
};

const topChamps = (games: PlayerGameRow[], n: number): [string, number][] => {
  const c = new Map<string, number>();
  for (const r of games) if (r[2]) c.set(r[2], (c.get(r[2]) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
};

/** Which champions the games were on. */
const ChampSpread: React.FC<{ games: PlayerGameRow[] }> = ({ games }) => (
  <div className="flex flex-wrap gap-2 text-[11px] text-rw-sub">
    {topChamps(games, 8).map(([c, n]) => (
      <span key={c} className="flex items-center gap-1">
        <ChampIcon name={c} size={16} /> {champName(c)} {n}
      </span>
    ))}
  </div>
);

/** The games, newest first: result, champion, KDA, opponent and event, each linked to its match page. */
const GameList: React.FC<{ games: PlayerGameRow[]; spoilerKey: string }> = ({ games, spoilerKey }) => {
  const hiddenNow = useHiddenCheck();
  const [all, setAll] = useState(false);
  const shown = all ? games : games.slice(0, 50);
  return (
    <>
      <ul className="text-xs space-y-1">
        {shown.map((r, i) => {
          const hide = hiddenNow(spoilerKey, r[0]);
          return (
            <li key={i} className="flex items-center justify-between gap-2 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`w-3.5 shrink-0 font-bold ${hide ? "text-rw-muted" : r[6] ? "text-rw-teal" : "text-rw-red"}`}>
                  {hide ? "?" : r[6] ? tc("short result", "W") : tc("short result", "L")}
                </span>
                <ChampIcon name={r[2]} size={18} />
                <span className="truncate min-w-0">
                  <span className="text-rw-text tabular-nums">{hide ? "–" : `${r[3]}/${r[4]}/${r[5]}`}</span>{" "}
                  <HubLink to={{ kind: "match", slug: r[1], ...(r[22] ? { game: r[22] } : {}) }}>
                    {tl("vs")} {r[8]}
                  </HubLink>
                  <span className="text-rw-muted"> · {r[9]}</span>
                </span>
              </span>
              <span className="text-rw-muted shrink-0">{fmtDate(r[0], false)}</span>
            </li>
          );
        })}
      </ul>
      {games.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="text-[11px] text-rw-teal hover:underline">
          {tl("Show all {n}", { n: games.length })}
        </button>
      )}
    </>
  );
};
