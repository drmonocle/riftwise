/**
 * Item history: has a pro ever finished a game holding an item? Pick a player and an item for the yes or no and every
 * game; a player alone for every item they've finished games with; an item alone for the players who built it most.
 * A champion and a year narrow any of it ("who built Heartsteel on Sion in 2026", TV 2026-10-28).
 * From each game's final inventory (hub/playeritems/ and hub/items/, written by the stats build), so an item sold
 * before the end of a game isn't counted.
 * Address: /stats/items?player=faker&item=heartsteel&champ=sion&year=2026
 */
import React, { useId, useMemo, useState } from "react";
import { useWidth } from "../../useWidth";
import type { HubRoute } from "../../hub/route";
import { tl, tc } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubIndex, loadHubItem, loadHubItemChamp, loadHubItemYear, loadItemIndex, loadPlayerGames, loadPlayerItems, normText, prettySlug } from "../../hub/data";
import type { ItemIndexRow, PlayerGameRow, SearchPlayerRow } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { isFinishedItem, itemName, useDDragon } from "../../hub/ddragon";
import { card, ChampIcon, fmtDate, fmtNum, HubLink, ItemIcon, Loading, PlayerLink, Section, Stat, td, th, useHiddenCheck, useLoad, usePageTitle } from "./ui";
import { STable } from "../STable";

const playerSlug = (r: SearchPlayerRow) => r[1] || prettySlug(r[0]);
const sel = "bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text";
const chip = "px-2 py-1 rounded-full border border-rw-accent text-rw-accent flex items-center gap-1";
const FIRST_YEAR = 2011;

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

/** What a champion and a year narrow the games to: "Only games on Sion in 2026" (null without either). */
function scopeText(champ: string, year: string): string | null {
  if (champ && year) return tl("Only games on {champ} in {year}", { champ, year });
  if (champ) return tl("Only games on {champ}", { champ });
  if (year) return tl("Only games in {year}", { year });
  return null;
}

/** The address's player, item, champion and year (champion and item as their page names: sion, heartsteel). */
interface Picks {
  player: string;
  item: string;
  champ: string;
  year: string;
}

export const ItemsPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Item history"));
  useDDragon();
  const q = new URLSearchParams(query || "");
  const picks: Picks = { player: q.get("player") || "", item: q.get("item") || "", champ: q.get("champ") || "", year: q.get("year") || "" };
  const { player, item, champ, year } = picks;
  const queryWith = (patch: Partial<Record<keyof Picks, string | undefined>>) => {
    const next = new URLSearchParams(query || "");
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    return next.toString();
  };
  const set = (patch: Partial<Record<keyof Picks, string | undefined>>) => navigateHub({ kind: "items", query: queryWith(patch) }, { replace: true });
  const items = useLoad(loadItemIndex, []);
  const people = useLoad(loadHubIndex, []);
  const [typed, setTyped] = useState("");
  const found = useMemo(() => findPlayers(people.data?.players || [], typed), [people.data, typed]);
  const who = useMemo(() => (people.data?.players || []).find((r) => playerSlug(r) === player), [people.data, player]);
  const itemRow = useMemo(() => (items.data || []).find((r) => r[1] === item), [items.data, item]);
  const champs = useMemo(() => [...(people.data?.champs || [])].sort((a, b) => champName(a[0]).localeCompare(champName(b[0]))), [people.data]);
  const champRow = useMemo(() => champs.find((r) => prettySlug(r[0]) === champ), [champs, champ]);
  const champLabel = champRow ? champName(champRow[0]) : champ;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => String(thisYear - i));
  const scope = scopeText(champLabel, year);
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-2`}>
        <h1 className="text-lg font-bold text-rw-text">{tl("Item history")}</h1>
        <p className="text-[11px] text-rw-sub">
          {tl("Has a pro ever built it? Pick a player and an item: every pro game they finished holding it. A player alone shows every item they've finished games with; an item alone, the players who built it most. From the final inventory of every pro game with a full scoreboard, so an item sold before the end doesn't count.")}{" "}
          {tl("A champion and a year narrow any of it.")}
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
            key={`item:${item}`}
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
          <input
            list="rw-champ-list"
            placeholder={champRow ? champLabel : tl("Champion…")}
            aria-label={tl("Champion")}
            key={`champ:${champ}`}
            onChange={(e) => {
              const v = normText(e.target.value.trim());
              const hit = champs.find((r) => normText(r[0]) === v || normText(champName(r[0])) === v);
              if (hit) set({ champ: prettySlug(hit[0]) });
            }}
            className={`${sel} w-40`}
          />
          <datalist id="rw-champ-list">
            {champs.map((r) => (
              <option key={r[1]} value={champName(r[0])} />
            ))}
          </datalist>
          <select value={year} onChange={(e) => set({ year: e.target.value || undefined })} aria-label={tl("Year")} className={sel}>
            <option value="">{tl("Any year")}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {(player || item || champ || year) && (
            <span className="flex flex-wrap gap-1.5 items-center">
              {who && (
                <button type="button" onClick={() => set({ player: undefined })} className={chip} title={tl("Clear")}>
                  {who[0]} ✕
                </button>
              )}
              {itemRow && (
                <button type="button" onClick={() => set({ item: undefined })} className={chip} title={tl("Clear")}>
                  <ItemIcon name={itemRow[0]} size={16} /> {itemName(itemRow[0])} ✕
                </button>
              )}
              {champ && (
                <button type="button" onClick={() => set({ champ: undefined })} className={chip} title={tl("Clear")}>
                  {champRow && <ChampIcon name={champRow[0]} size={16} />} {champLabel} ✕
                </button>
              )}
              {year && (
                <button type="button" onClick={() => set({ year: undefined })} className={chip} title={tl("Clear")}>
                  {year} ✕
                </button>
              )}
            </span>
          )}
        </div>
      </div>
      {player ? (
        <PlayerItemsView slug={player} name={who?.[0] || player} picks={picks} champLabel={champLabel} scope={scope} itemTitle={itemRow?.[0]} onItem={(s) => set({ item: s })} />
      ) : item && champ ? (
        <ItemChampView picks={picks} champLabel={champLabel} players={people.data?.players} onPlayer={(s) => set({ player: s })} />
      ) : item && year ? (
        <ItemYearView picks={picks} players={people.data?.players} onPlayer={(s) => set({ player: s })} onChamp={(c) => set({ champ: prettySlug(c) })} />
      ) : item ? (
        <ItemPlayersView slug={item} onPlayer={(s) => set({ player: s })} onChamp={(c) => set({ champ: prettySlug(c) })} onYear={(y) => set({ year: y })} />
      ) : (
        <ItemStats loading={items.loading} rows={items.data ?? undefined} scope={scope} to={(slug) => ({ kind: "items", query: queryWith({ item: slug }) })} />
      )}
    </div>
  );
};

/** One player's items: every item with its games, or one item's yes or no and the games (on a champion, in a year). */
const PlayerItemsView: React.FC<{
  slug: string;
  name: string;
  picks: Picks;
  champLabel: string;
  scope: string | null;
  itemTitle?: string;
  onItem: (slug: string) => void;
}> = ({ slug, name, picks, champLabel, scope, itemTitle, onItem }) => {
  const { item, champ, year } = picks;
  const mine = useLoad(() => loadPlayerItems(slug), [slug]);
  const log = useLoad(() => loadPlayerGames(slug), [slug]);
  const [filter, setFilter] = useState("");
  const [finishedOnly, setFinishedOnly] = useState(true);
  if (mine.loading || log.loading) return <Loading />;
  if (!mine.data || !log.data) return <p className="text-xs text-rw-sub rw-span">{tl("No item history for this player yet.")}</p>;
  const rows = log.data;
  const keep = (r: PlayerGameRow) => (!champ || prettySlug(r[2]) === champ) && (!year || r[0].startsWith(year));
  const games = (pos: number[]) => pos.map((i) => rows[i]).filter((r): r is PlayerGameRow => !!r && keep(r));
  const counted = champ || year ? rows.filter(keep).length : rows.length;
  const whoBuilt = (label: string) => (
    <HubLink to={{ kind: "items", query: new URLSearchParams({ item, ...(champ ? { champ } : {}), ...(year ? { year } : {}) }).toString() }} className="text-[11px] text-rw-teal hover:underline">
      {champ ? tl("Who built {item} on {champ}", { item: label, champ: champLabel }) : tl("Who built {item} most", { item: label })}
    </HubLink>
  );
  if (item) {
    const hit = mine.data.find(([it]) => prettySlug(it) === item);
    const label = itemName(hit?.[0] || itemTitle || item);
    const g = hit ? games(hit[1]) : [];
    if (!g.length)
      return (
        <Section title={label}>
          {scope && <p className="text-[11px] text-rw-accent">{scope}</p>}
          <p className="text-sm text-rw-text">
            <span className="font-bold text-rw-red">{tl("No.")}</span>{" "}
            {tl("None of {player}'s {n} pro games with a full scoreboard ended with {item}.", { player: name, n: fmtNum(counted), item: label })}
          </p>
          {whoBuilt(label)}
        </Section>
      );
    return (
      <Section title={label} right={<ItemIcon name={hit![0]} size={22} />}>
        {scope && <p className="text-[11px] text-rw-accent">{scope}</p>}
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
        {whoBuilt(label)}
      </Section>
    );
  }
  const f = normText(filter.trim());
  const list = mine.data
    .filter(([it]) => (!finishedOnly || isFinishedItem(it)) && (!f || normText(itemName(it)).includes(f) || normText(it).includes(f)))
    .map(([it, pos]) => [it, games(pos)] as const)
    .filter(([, g]) => g.length > 0)
    .sort((a, b) => b[1].length - a[1].length);
  return (
    <Section title={tl("Every item {player} finished pro games with", { player: name })}>
      {scope && <p className="text-[11px] text-rw-accent">{scope}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tl("Find an item…")} aria-label={tl("Find an item")} className={`${sel} w-48`} />
        <label className="flex items-center gap-1.5 text-rw-sub">
          <input type="checkbox" checked={finishedOnly} onChange={(e) => setFinishedOnly(e.target.checked)} />
          {tl("Finished items only")}
        </label>
        <span className="text-rw-muted">{tl("{n} pro games with a full scoreboard", { n: fmtNum(counted) })}</span>
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
          {list.map(([it, g]) => {
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

/** One item's players, most games first, with the champions and years it was built on and in; picking one narrows. */
const ItemPlayersView: React.FC<{ slug: string; onPlayer: (slug: string) => void; onChamp: (champ: string) => void; onYear: (year: string) => void }> = ({
  slug,
  onPlayer,
  onChamp,
  onYear,
}) => {
  const st = useLoad(() => loadHubItem(slug), [slug]);
  if (st.loading) return <Loading />;
  if (!st.data) return <p className="text-xs text-rw-sub rw-span">{tl("No pro game in the stats ended with this item.")}</p>;
  const it = st.data;
  const top = it.c?.[0];
  return (
    <Section title={tl("Who built {item} most", { item: itemName(it.n) })} right={<ItemIcon name={it.n} size={22} />}>
      {/* the item at a glance, then its years as columns (a column opens that year) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 rw-stats">
        <Stat label={tl("Games")} value={fmtNum(it.g)} sub={tl("ended with it")} />
        <Stat label={tl("Players")} value={fmtNum(it.np)} />
        {it.w != null && <Stat label={tl("Win %")} value={winRate(it.w, it.g)} sub={tl("{n} won", { n: fmtNum(it.w) })} />}
        {top && <Stat label={tl("Most built on")} value={champName(top[0])} sub={tl("{n} games", { n: fmtNum(top[1]) })} />}
      </div>
      {it.y && it.y.length > 1 && <YearBars years={it.y} onYear={onYear} />}
      <PickChips label={tl("Champions")} rows={(it.c || []).slice(0, 24).map(([c, g]) => ({ key: c, champ: c, text: champName(c), n: g, pick: () => onChamp(c) }))} />
      {it.np > it.players.length && <p className="text-[11px] text-rw-muted">{tl("The {n} with the most games:", { n: it.players.length })}</p>}
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
                <TheirGames onClick={() => onPlayer(u)} />
              </td>
            </tr>
          ))}
        </tbody>
      </STable>
    </Section>
  );
};

/** One item on one champion: every player who finished a game with it on that champion (in a year, when one is picked). */
const ItemChampView: React.FC<{ picks: Picks; champLabel: string; players?: SearchPlayerRow[]; onPlayer: (slug: string) => void }> = ({ picks, champLabel, players, onPlayer }) => {
  const { item, champ, year } = picks;
  const st = useLoad(() => loadHubItemChamp(item, champ), [item, champ]);
  const head = useLoad(() => loadHubItem(item), [item]);
  const [all, setAll] = useState(false);
  if (st.loading || head.loading) return <Loading />;
  const label = itemName(head.data?.n || item);
  const title = year ? tl("Who built {item} on {champ} in {year}", { item: label, champ: champLabel, year }) : tl("Who built {item} on {champ}", { item: label, champ: champLabel });
  const y2 = year ? Number(year) - 2000 : null;
  // each player's games (that year's, when a year is picked) and the years they built it in
  const rows = (st.data?.p || [])
    .map((r) => {
      const ys: number[] = [];
      let inYear = 0;
      for (let i = 2; i + 1 < r.length; i += 2) {
        ys.push(r[i] + 2000);
        if (r[i] === y2) inYear = r[i + 1];
      }
      return { k: r[0], g: y2 == null ? r[1] : inYear, ys };
    })
    .filter((r) => r.g > 0)
    .sort((a, b) => b.g - a.g || a.k - b.k);
  const total = rows.reduce((s, r) => s + r.g, 0);
  const shown = all ? rows : rows.slice(0, 100);
  return (
    <Section title={title} right={head.data ? <ItemIcon name={head.data.n} size={22} /> : undefined}>
      {!rows.length ? (
        <p className="text-sm text-rw-text">
          <span className="font-bold text-rw-red">{tl("No.")}</span> {tl("No pro game in the stats ended with this item.")}
        </p>
      ) : (
        <>
          <p className="text-sm text-rw-text">
            <span className="font-bold text-rw-teal">{tl("Yes.")}</span> {tl("{g} pro games by {p} players ended with it.", { g: fmtNum(total), p: fmtNum(rows.length) })}
          </p>
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Player")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={`${th} max-sm:hidden`}>{tl("Years")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const p = players?.[r.k];
                const u = p ? playerSlug(p) : "";
                return (
                  <tr key={r.k} className="border-t border-rw-border">
                    <td className={td}>{p ? <PlayerLink name={p[0]} u={u} /> : "–"}</td>
                    <td className={`${td} tabular-nums text-rw-sub`}>{fmtNum(r.g)}</td>
                    <td className={`${td} text-rw-muted max-sm:hidden`}>{yearSpan(r.ys)}</td>
                    <td className={`${td} text-right`}>{u && <TheirGames onClick={() => onPlayer(u)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </STable>
          {rows.length > shown.length && (
            <button type="button" onClick={() => setAll(true)} className="text-[11px] text-rw-teal hover:underline">
              {tl("Show all {n}", { n: rows.length })}
            </button>
          )}
        </>
      )}
    </Section>
  );
};

/** One item in one year: the players with the most games and the champions it was built on that year. */
const ItemYearView: React.FC<{ picks: Picks; players?: SearchPlayerRow[]; onPlayer: (slug: string) => void; onChamp: (champ: string) => void }> = ({
  picks,
  players,
  onPlayer,
  onChamp,
}) => {
  const { item, year } = picks;
  const st = useLoad(() => loadHubItemYear(item, year), [item, year]);
  const head = useLoad(() => loadHubItem(item), [item]);
  if (st.loading || head.loading) return <Loading />;
  const label = itemName(head.data?.n || item);
  const y = st.data;
  return (
    <Section title={tl("Who built {item} in {year}", { item: label, year })} right={head.data ? <ItemIcon name={head.data.n} size={22} /> : undefined}>
      {!y ? (
        <p className="text-sm text-rw-text">
          <span className="font-bold text-rw-red">{tl("No.")}</span> {tl("No pro game in the stats ended with this item.")}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-rw-muted">
            {tl("{g} pro games by {p} players ended with it.", { g: fmtNum(y.g), p: fmtNum(y.np) })}
            {y.np > y.p.length ? ` ${tl("The {n} with the most games:", { n: y.p.length })}` : ""}
          </p>
          <PickChips label={tl("Champions")} rows={y.c.slice(0, 24).map(([c, g]) => ({ key: c, champ: c, text: champName(c), n: g, pick: () => onChamp(c) }))} />
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Player")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {y.p.map(([k, g]) => {
                const p = players?.[k];
                const u = p ? playerSlug(p) : "";
                return (
                  <tr key={k} className="border-t border-rw-border">
                    <td className={td}>{p ? <PlayerLink name={p[0]} u={u} /> : "–"}</td>
                    <td className={`${td} tabular-nums text-rw-sub`}>{fmtNum(g)}</td>
                    <td className={`${td} text-right`}>{u && <TheirGames onClick={() => onPlayer(u)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </STable>
        </>
      )}
    </Section>
  );
};

/**
 * Item stats (the page with nothing picked): every item pro games ended with, most games first, with its players,
 * win rate and the champions it's built on most; a filter and "finished items only" (the default). A row opens who
 * built it.
 */
const ItemStats: React.FC<{ loading: boolean; rows?: ItemIndexRow[]; scope: string | null; to: (slug: string) => HubRoute }> = ({ loading, rows, scope, to }) => {
  const [filter, setFilter] = useState("");
  const [finishedOnly, setFinishedOnly] = useState(true);
  const [all, setAll] = useState(false);
  const f = normText(filter.trim());
  const list = (rows || []).filter((r) => (!finishedOnly || isFinishedItem(r[0])) && (!f || normText(itemName(r[0])).includes(f) || normText(r[0]).includes(f)));
  const max = Math.max(1, ...list.map((r) => r[2]));
  const shown = all || f ? list : list.slice(0, 60);
  return (
    <Section title={tl("Item stats")}>
      {scope && (
        <p className="text-[11px] text-rw-sub">
          <span className="text-rw-accent">{scope}</span> · {tl("Pick an item to see who built it.")}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : !rows ? (
        <p className="text-xs text-rw-sub">{tl("Not in the stats yet.")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tl("Find an item…")} aria-label={tl("Find an item")} className={`${sel} w-48`} />
            <label className="flex items-center gap-1.5 text-rw-sub">
              <input type="checkbox" checked={finishedOnly} onChange={(e) => setFinishedOnly(e.target.checked)} />
              {tl("Finished items only")}
            </label>
          </div>
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Item")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={`${th} max-sm:hidden`}>{tl("Players")}</th>
                <th className={th}>{tl("Win %")}</th>
                <th className={`${th} max-sm:hidden`}>{tl("Champions")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r[1]} className="border-t border-rw-border">
                  <td className={`${td} max-w-[15rem]`}>
                    <HubLink to={to(r[1])} className="flex items-center gap-1.5 min-w-0 hover:text-rw-accent">
                      <ItemIcon name={r[0]} size={20} />
                      <span className="truncate">{itemName(r[0])}</span>
                    </HubLink>
                  </td>
                  {/* the number over a thin bar of its share of the most built item's games */}
                  <td className={`${td} tabular-nums text-rw-sub w-28`} data-sort={r[2]}>
                    {fmtNum(r[2])}
                    <span className="block h-1 mt-0.5 rounded-sm bg-rw-accent/50" style={{ width: `${Math.max(2, (r[2] / max) * 100)}%` }} aria-hidden="true" />
                  </td>
                  <td className={`${td} tabular-nums text-rw-sub max-sm:hidden`} data-sort={r[3]}>
                    {fmtNum(r[3])}
                  </td>
                  <td className={`${td} tabular-nums text-rw-sub`} data-sort={r[4] != null && r[2] ? r[4] / r[2] : 0}>
                    {r[4] != null ? winRate(r[4], r[2]) : "–"}
                  </td>
                  <td className={`${td} max-sm:hidden`}>
                    <span className="flex gap-0.5">
                      {(r[5] || []).map((c) => (
                        <ChampIcon key={c} name={c} size={18} />
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </STable>
          {list.length > shown.length && (
            <button type="button" onClick={() => setAll(true)} className="text-[11px] text-rw-teal hover:underline">
              {tl("Show all {n}", { n: list.length })}
            </button>
          )}
          {!list.length && <p className="text-[11px] text-rw-muted">{tl("No item fits.")}</p>}
          <p className="text-[10px] text-rw-muted">{tl("Win %: the games that ended with the item in a player's inventory. Winning teams finish more items, so most sit above 50%.")}</p>
        </>
      )}
    </Section>
  );
};

/** Games each year that ended with the item, as columns (a year without any is an empty slot); a column opens that
 *  year, and its games, players and win rate show under the pointer. */
const YearBars: React.FC<{ years: [string, number, number, number?][]; onYear: (year: string) => void }> = ({ years, onYear }) => {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const first = Number(years[0][0]);
  const last = Number(years[years.length - 1][0]);
  const all: [string, number, number, number?][] = Array.from({ length: last - first + 1 }, (_, i) => String(first + i)).map((y) => years.find((r) => r[0] === y) || [y, 0, 0]);
  const T = 16;
  const PH = 64;
  const H = T + PH + 16;
  const bw = W / all.length;
  const colW = Math.max(4, Math.min(28, bw * 0.62));
  const max = Math.max(1, ...all.map((r) => r[1]));
  const every = Math.max(1, Math.ceil(all.length / Math.max(2, Math.floor(W / 44))));
  const peak = all.findIndex((r) => r[1] === max);
  const h = hover != null ? all[hover] : null;
  // the column under the pointer: its whole slot counts, not just the bar
  const slot = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) =>
    Math.min(all.length - 1, Math.max(0, Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / bw)));
  return (
    <div ref={box} className="relative select-none">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className={`block w-full touch-pan-y ${h && h[1] ? "cursor-pointer" : ""}`}
        role="img"
        aria-label={tl("By year")}
        onPointerMove={(e) => setHover(slot(e))}
        onPointerDown={(e) => setHover(slot(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const r = all[slot(e)];
          if (r && r[1]) onYear(r[0]);
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--rw-accent)" }} />
            <stop offset="1" style={{ stopColor: "var(--rw-accent-2)" }} />
          </linearGradient>
        </defs>
        <line x1={0} x2={W} y1={T + PH + 0.5} y2={T + PH + 0.5} style={{ stroke: "var(--rw-border)" }} />
        {all.map((r, i) => {
          const ch = r[1] ? Math.max(2, (r[1] / max) * PH) : 0;
          const x0 = i * bw + (bw - colW) / 2;
          const y0 = T + PH - ch;
          const rad = Math.min(4, colW / 2, ch);
          return (
            <g key={r[0]}>
              {ch > 0 && (
                <path
                  d={`M${x0},${T + PH} V${y0 + rad} Q${x0},${y0} ${x0 + rad},${y0} H${x0 + colW - rad} Q${x0 + colW},${y0} ${x0 + colW},${y0 + rad} V${T + PH} Z`}
                  style={{ fill: `url(#${id})`, opacity: hover == null || hover === i ? 1 : 0.45 }}
                />
              )}
              {i === peak && hover == null && (
                <text x={i * bw + bw / 2} y={y0 - 4} textAnchor="middle" className="font-num" style={{ fill: "var(--rw-sub)", fontSize: 9 }}>
                  {fmtNum(r[1])}
                </text>
              )}
              {(i % every === 0 || i === all.length - 1) && (
                <text x={i * bw + bw / 2} y={H - 3} textAnchor="middle" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
                  {all.length > 8 ? `'${r[0].slice(2)}` : r[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && (
        <div
          className="absolute top-0 pointer-events-none rounded border border-rw-border bg-rw-raised px-2 py-1 text-[10px] leading-tight shadow-lg whitespace-nowrap"
          style={{ left: Math.min(Math.max(hover! * bw + bw / 2 - 55, 0), Math.max(W - 110, 0)) }}
        >
          <div className="font-num font-semibold text-rw-text">{h[0]}</div>
          <div className="text-rw-sub">
            {tl("{n} games", { n: fmtNum(h[1]) })}
            {h[1] > 0 && h[3] != null ? ` · ${winRate(h[3], h[1])}` : ""}
          </div>
          {h[2] > 0 && <div className="text-rw-muted">{tl("{n} players", { n: fmtNum(h[2]) })}</div>}
        </div>
      )}
    </div>
  );
};

const TheirGames: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="text-rw-teal hover:underline">
    {tl("Their games")}
  </button>
);

/** A row of picks with their game counts ("On: Sion 120 · Ornn 80"), each narrowing the list. */
const PickChips: React.FC<{ label: string; rows: { key: string; text: string; n: number; champ?: string; pick: () => void }[] }> = ({ label, rows }) =>
  rows.length > 1 ? (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-rw-muted">{label}</span>
      {rows.map((r) => (
        <button key={r.key} type="button" onClick={r.pick} className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-rw-border text-rw-sub hover:border-rw-accent hover:text-rw-text">
          {r.champ && <ChampIcon name={r.champ} size={14} />}
          {r.text} <span className="text-rw-muted tabular-nums">{fmtNum(r.n)}</span>
        </button>
      ))}
    </div>
  ) : null;

/** "2019–2021, 2024" from the years a player built it in */
function yearSpan(ys: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ys.length; ) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++;
    out.push(j > i ? `${ys[i]}–${ys[j]}` : String(ys[i]));
    i = j + 1;
  }
  return out.join(", ");
}

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
