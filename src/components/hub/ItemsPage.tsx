/**
 * Item history: has a pro ever finished a game holding an item? Pick a player and an item for the yes or no and every
 * game; a player alone for every item they've finished games with; an item alone for the players who built it most.
 * A champion and a year narrow any of it ("who built Heartsteel on Sion in 2026", TV 2026-10-28).
 * From each game's final inventory (hub/playeritems/ and hub/items/, written by the stats build), so an item sold
 * before the end of a game isn't counted.
 * Address: /stats/items?player=faker&item=heartsteel&champ=sion&year=2026
 */
import React, { useEffect, useId, useMemo, useState } from "react";
import { useWidth } from "../../useWidth";
import type { HubRoute } from "../../hub/route";
import { tl, tc, roleName } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { bare, loadAliases, loadHubIndex, loadHubItem, loadHubItemChamp, loadHubItemYear, loadItemIndex, loadPlayerGames, loadPlayerItems, matchesChampSearch, matchesItemSearch, normText, prettySlug, resolveChampSlug, resolveEventSlug, resolveItemSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, sameChamp, searchAlias } from "../../hub/data";
import { normalizeRole } from "../../hub/champAgg";
import { matchesPeriodEvent } from "../../hub/period";
import type { ItemIndexRow, PlayerGameRow, SearchPlayerRow } from "../../hub/types";
import { navigateHub, hubShareUrl } from "../../hub/route";
import { isFinishedItem, itemName, useDDragon } from "../../hub/ddragon";
import { card, ChampIcon, ChampLink, EventLink, fmtDate, fmtNum, HubLink, ItemIcon, Loading, PlayerLink, PlayerPhoto, ratingTextClass, Section, Stat, td, TeamLink, TeamLogo, th, useHiddenCheck, useLoad, usePageTitle } from "./ui";
import { STable } from "../STable";
import { SectionCard } from "./BroadcastCard";

const playerSlug = (r: SearchPlayerRow) => r[1] || prettySlug(r[0]);
const sel = "bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text";
const chip = "px-2 py-1 rounded-full border border-rw-accent text-rw-accent flex items-center gap-1";
const FIRST_YEAR = 2011;

/** The players whose name fits what was typed, best fit first, then most games. */
function findPlayers(rows: SearchPlayerRow[], typed: string, n = 8): SearchPlayerRow[] {
  const q = normText(typed.trim());
  if (!q) return [];
  const qAlias = searchAlias(q);
  const qPlayer = resolvePlayerSlug(qAlias || q);
  const fit = (r: SearchPlayerRow) => {
    const s = normText(r[0]);
    const u = playerSlug(r);
    return s === q || (qAlias && s === qAlias) || u === qPlayer
      ? 0
      : s.startsWith(q) || (qAlias && s.startsWith(qAlias))
        ? 1
        : s.includes(q) || (qAlias && s.includes(qAlias))
          ? 2
          : r[6] && (normText(r[6]).includes(q) || (qAlias && normText(r[6]).includes(qAlias)))
            ? 3
            : -1;
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

/** The address's player, item, champion, year and event (champion and item as their page names: sion, heartsteel). */
interface Picks {
  player: string;
  vsplayer?: string;
  item: string;
  champ: string;
  vschamp?: string;
  year: string;
  event?: string;
  patch?: string;
  vs?: string;
  team?: string;
  role?: string;
  league?: string;
}

export const ItemsPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Item history"));
  useDDragon();
  const q = new URLSearchParams(query || "");
  const rawP = (q.get("p") || q.get("period") || "").trim();
  const pYr = /^y:?(\d{4})$/.exec(rawP)?.[1] || (/^\d{4}$/.test(rawP) ? rawP : "");
  const pEv = rawP.startsWith("e:") ? rawP.slice(2) : "";
  const pPatch = rawP.startsWith("p:") ? rawP.slice(2) : "";
  const rawPatchParam = (q.get("patch") || pPatch || "").trim().replace(/^p:/, "");
  const patchYr = /^y:?(\d{4})$/.exec(rawPatchParam)?.[1] || "";
  const cleanPatch = patchYr ? "" : rawPatchParam;
  const rawEvent = q.get("event") || pEv || "";
  const canonEvent = rawEvent ? resolveEventSlug(rawEvent) : "";
  const evYr = canonEvent ? /(?:^|-)(20\d{2})(?:-|$)/.exec(canonEvent)?.[1] || "" : "";
  const rawVs = (q.get("vs") || q.get("opp") || "").trim();
  const canonVs = rawVs ? resolveTeamAlias(rawVs) || prettySlug(rawVs) : "";
  const rawTeam = (q.get("team") || "").trim();
  const canonTeam = rawTeam ? resolveTeamAlias(rawTeam) || prettySlug(rawTeam) : "";
  const canonRole = normalizeRole(q.get("role"));
  const rawLeague = (q.get("league") || "").trim();
  const canonLeague = rawLeague ? resolveLeagueSlug(rawLeague) : "";
  const canonPlayer = resolvePlayerSlug(prettySlug(q.get("player") || ""));
  const canonVsPlayer = resolvePlayerSlug(prettySlug(q.get("vsplayer") || ""));
  const canonChamp = resolveChampSlug(q.get("champ") || "");
  const canonVsChamp = resolveChampSlug(q.get("vschamp") || "");
  const picks: Picks = {
    player: canonPlayer,
    vsplayer: canonVsPlayer && canonVsPlayer !== canonPlayer ? canonVsPlayer : undefined,
    item: resolveItemSlug(q.get("item") || ""),
    champ: canonChamp,
    vschamp: canonVsChamp && canonVsChamp !== canonChamp ? canonVsChamp : undefined,
    year: q.get("year") || pYr || patchYr || evYr || "",
    event: canonEvent || undefined,
    patch: cleanPatch || undefined,
    vs: canonVs || undefined,
    team: canonTeam || undefined,
    role: canonRole || undefined,
    league: canonLeague || undefined,
  };
  const { player, vsplayer, item, champ, vschamp, year, event, patch, vs, team, role, league } = picks;
  const queryWith = (upd: Partial<Record<keyof Picks, string | undefined>>) => {
    const next = new URLSearchParams(query || "");
    if ("year" in upd || "event" in upd || "patch" in upd) {
      next.delete("p");
      next.delete("period");
    }
    if ("vs" in upd) next.delete("opp");
    for (const [k, v] of Object.entries(upd)) v ? next.set(k, v) : next.delete(k);
    return next.toString();
  };
  const set = (upd: Partial<Record<keyof Picks, string | undefined>>) => navigateHub({ kind: "items", query: queryWith(upd) }, { replace: true });
  const items = useLoad(loadItemIndex, []);
  const people = useLoad(loadHubIndex, []);
  const [typed, setTyped] = useState("");
  const found = useMemo(() => findPlayers(people.data?.players || [], typed), [people.data, typed]);
  const who = useMemo(() => (people.data?.players || []).find((r) => playerSlug(r) === player), [people.data, player]);
  const vsWho = useMemo(() => (people.data?.players || []).find((r) => playerSlug(r) === vsplayer), [people.data, vsplayer]);
  const itemRow = useMemo(
    () => (items.data || []).find((r) => r[1] === item || (item && r[1].replace(/-/g, "") === item.replace(/-/g, ""))),
    [items.data, item],
  );
  const resolvedItem = itemRow?.[1] || item;
  const resolvedPicks: Picks = { ...picks, item: resolvedItem };
  const champs = useMemo(() => [...(people.data?.champs || [])].sort((a, b) => champName(a[0]).localeCompare(champName(b[0]))), [people.data]);
  const champRow = useMemo(() => champs.find((r) => sameChamp(r[1] || r[0], champ) || sameChamp(r[0], champ)), [champs, champ]);
  const champLabel = champRow ? champName(champRow[0]) : champ;
  const vsChampRow = useMemo(
    () => (vschamp ? champs.find((r) => sameChamp(r[1] || r[0], vschamp) || sameChamp(r[0], vschamp)) : undefined),
    [champs, vschamp],
  );
  const vsChampLabel = vsChampRow ? champName(vsChampRow[0]) : vschamp || "";
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
                if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey && typed.trim())) && found[0]) {
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
                      className="w-full text-left px-2 py-1 hover:bg-rw-bg flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <PlayerPhoto name={r[0]} team={r[2] || undefined} slug={playerSlug(r)} size={16} linkFallback={false} />
                        <span className="truncate text-rw-text">{r[0]}</span>
                      </span>
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
              const raw = e.target.value.trim();
              const v = normText(raw);
              const aliasSlug = raw.length >= 2 ? resolveItemSlug(raw) : "";
              const isAlias = aliasSlug && aliasSlug !== prettySlug(raw);
              const hit = (items.data || []).find(
                (r) =>
                  normText(r[0]) === v ||
                  normText(itemName(r[0])) === v ||
                  (isAlias && (r[1] === aliasSlug || r[1].replace(/-/g, "") === aliasSlug.replace(/-/g, ""))),
              );
              if (hit) set({ item: hit[1] });
            }}
            onBlur={(e) => {
              const v = (e.currentTarget.value || "").trim();
              if (!v) return;
              const hit = (items.data || []).find((r) => matchesItemSearch(r[0], itemName(r[0]), v));
              if (hit && hit[1] !== item) set({ item: hit[1] });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey && e.currentTarget.value.trim())) {
                const v = (e.currentTarget.value || "").trim();
                const hit = (items.data || []).find((r) => matchesItemSearch(r[0], itemName(r[0]), v));
                if (hit) set({ item: hit[1] });
              }
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
              const raw = e.target.value.trim();
              const v = normText(raw);
              const aliasSlug = raw.length >= 2 ? resolveChampSlug(raw) : "";
              const isAlias = aliasSlug && aliasSlug !== prettySlug(raw);
              const hit = champs.find(
                (r) =>
                  normText(r[0]) === v ||
                  normText(champName(r[0])) === v ||
                  (isAlias && (r[1] === aliasSlug || prettySlug(r[0]) === aliasSlug)),
              );
              if (hit) set({ champ: hit[1] || prettySlug(hit[0]) });
            }}
            onBlur={(e) => {
              const v = (e.currentTarget.value || "").trim();
              if (!v) return;
              const hit = champs.find((r) => matchesChampSearch(r[0], v));
              if (hit && (hit[1] || prettySlug(hit[0])) !== champ) set({ champ: hit[1] || prettySlug(hit[0]) });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey && e.currentTarget.value.trim())) {
                const v = (e.currentTarget.value || "").trim();
                const hit = champs.find((r) => matchesChampSearch(r[0], v));
                if (hit) set({ champ: hit[1] || prettySlug(hit[0]) });
              }
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
          {(player || vsplayer || item || champ || vschamp || year || event || patch || vs || team || role || league) && (
            <span className="flex flex-wrap gap-1.5 items-center">
              {who && (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => set({ player: undefined })} className={chip} title={tl("Clear")}>
                    {who[0]} ✕
                  </button>
                  <HubLink
                    to={{
                      kind: "player",
                      slug: player,
                      query: new URLSearchParams({
                        ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                        ...(team ? { team } : {}),
                        ...(vs || vsplayer ? { q: vs || vsplayer } : {}),
                        ...(role ? { role } : {}),
                        ...(champ ? { champ } : {}),
                      }).toString() || undefined,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                    title={who[0]}
                  >
                    →
                  </HubLink>
                </span>
              )}
              {vsplayer && (
                <span className="flex items-center gap-1">
                  {player && (
                    <button
                      type="button"
                      onClick={() => set({ player: vsplayer, vsplayer: player, ...(team && vs ? { team: vs, vs: team } : {}) })}
                      className={chip}
                      title={`⇄ ${vsWho?.[0] || vsplayer}`}
                    >
                      ⇄
                    </button>
                  )}
                  <button type="button" onClick={() => set({ vsplayer: undefined })} className={chip} title={tl("Clear")}>
                    {tl("vs")} {vsWho?.[0] || vsplayer} ✕
                  </button>
                  <HubLink
                    to={{
                      kind: "player",
                      slug: vsplayer,
                      query: new URLSearchParams({
                        ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                        ...(vs ? { team: vs } : {}),
                        ...(team || player ? { q: team || player } : {}),
                        ...(role ? { role } : {}),
                        ...(vschamp ? { champ: vschamp } : {}),
                      }).toString() || undefined,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                    title={vsWho?.[0] || vsplayer}
                  >
                    →
                  </HubLink>
                </span>
              )}
              {itemRow && (
                <button type="button" onClick={() => set({ item: undefined })} className={chip} title={tl("Clear")}>
                  <ItemIcon name={itemRow[0]} size={16} /> {itemName(itemRow[0])} ✕
                </button>
              )}
              {champ && (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => set({ champ: undefined })} className={chip} title={tl("Clear")}>
                    {champRow && <ChampIcon name={champRow[0]} size={16} />} {champLabel} ✕
                  </button>
                  <HubLink
                    to={{
                      kind: "champ",
                      slug: champ,
                      query: new URLSearchParams({
                        ...(event ? { event } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}`, year } : {}),
                        ...(vschamp && vschamp !== champ ? { vschamp } : {}),
                        ...(player ? { player } : {}),
                        ...(team ? { team } : {}),
                        ...(vs ? { vs } : {}),
                        ...(role ? { role } : {}),
                      }).toString() || undefined,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                    title={champLabel}
                  >
                    →
                  </HubLink>
                </span>
              )}
              {vschamp && (
                <span className="flex items-center gap-1">
                  {champ && (
                    <button
                      type="button"
                      onClick={() => set({ champ: vschamp, vschamp: champ })}
                      className={chip}
                      title={`⇄ ${vsChampLabel}`}
                    >
                      ⇄
                    </button>
                  )}
                  <button type="button" onClick={() => set({ vschamp: undefined })} className={chip} title={tl("Clear")}>
                    {tl("vs")} {vsChampRow && <ChampIcon name={vsChampRow[0]} size={16} />} {vsChampLabel} ✕
                  </button>
                  <HubLink
                    to={{
                      kind: "champ",
                      slug: vschamp,
                      query: new URLSearchParams({
                        ...(event ? { event } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}`, year } : {}),
                        ...(champ && champ !== vschamp ? { vschamp: champ } : {}),
                        ...(vsplayer ? { player: vsplayer } : {}),
                        ...(vs ? { team: vs } : {}),
                        ...(team ? { vs: team } : {}),
                        ...(role ? { role } : {}),
                      }).toString() || undefined,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                    title={vsChampLabel}
                  >
                    →
                  </HubLink>
                </span>
              )}
              {role && (
                <button type="button" onClick={() => set({ role: undefined })} className={chip} title={tl("Clear")}>
                  {roleName(role)} ✕
                </button>
              )}
              {year && (
                <button type="button" onClick={() => set({ year: undefined })} className={chip} title={tl("Clear")}>
                  {year} ✕
                </button>
              )}
              {patch && (
                <button type="button" onClick={() => set({ patch: undefined })} className={chip} title={tl("Clear")}>
                  {tl("Patch")} {patch} ✕
                </button>
              )}
              {event && (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => set({ event: undefined })} className={chip} title={tl("Clear")}>
                    {event} ✕
                  </button>
                  <HubLink
                    to={{
                      kind: "event",
                      slug: event,
                      ...((team || vs || player)
                        ? { query: `q=${encodeURIComponent([team, vs && vs !== team ? vs : ""].filter(Boolean).join(",") || player)}` }
                        : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                    title={event}
                  >
                    →
                  </HubLink>
                </span>
              )}
              {league && (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => set({ league: undefined })} className={chip} title={tl("Clear")}>
                    {league} ✕
                  </button>
                  <HubLink
                    to={{
                      kind: "league",
                      slug: league,
                      ...(year ? { year } : {}),
                      ...((team || vs || player)
                        ? { query: `q=${encodeURIComponent([team, vs && vs !== team ? vs : ""].filter(Boolean).join(",") || player)}` }
                        : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                    title={league}
                  >
                    →
                  </HubLink>
                </span>
              )}
              {vs && (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => set({ vs: undefined })} className={chip} title={tl("Clear")}>
                    {tl("vs")} {vs} ✕
                  </button>
                  <HubLink
                    to={{
                      kind: "team",
                      slug: vs,
                      query: new URLSearchParams({
                        ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                        ...(team || vsplayer ? { q: team && team !== vs ? team : vsplayer } : {}),
                      }).toString() || undefined,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                    title={vs}
                  >
                    →
                  </HubLink>
                </span>
              )}
              {team && (
                <span className="flex flex-wrap items-center gap-1">
                  <button type="button" onClick={() => set({ team: undefined })} className={chip} title={tl("Clear")}>
                    {team} ✕
                  </button>
                  <HubLink
                    to={{
                      kind: "team",
                      slug: team,
                      query: new URLSearchParams({
                        ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                        ...(vs || player ? { q: vs && vs !== team ? vs : player } : {}),
                      }).toString() || undefined,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                    title={team}
                  >
                    →
                  </HubLink>
                  {!player &&
                    (people.data?.players || [])
                      .filter((r) => r[2] && (resolveTeamAlias(r[2]) || prettySlug(r[2])) === team)
                      .slice(0, 6)
                      .map((r) => (
                        <button
                          key={playerSlug(r)}
                          type="button"
                          onClick={() => set({ player: playerSlug(r) })}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:border-rw-accent hover:text-rw-text"
                        >
                          <PlayerPhoto name={r[0]} team={r[2] || undefined} slug={playerSlug(r)} size={14} linkFallback={false} />
                          <span>{r[0]}</span>
                        </button>
                      ))}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      {player ? (
        <PlayerItemsView slug={player} name={who?.[0] || player} picks={resolvedPicks} champLabel={champLabel} scope={scope} itemTitle={itemRow?.[0]} onItem={(s) => set({ item: s })} />
      ) : resolvedItem && champ ? (
        <ItemChampView picks={resolvedPicks} champLabel={champLabel} players={people.data?.players} onPlayer={(s) => set({ player: s })} initialSearch={vsplayer || team || q.get("q") || ""} />
      ) : resolvedItem && year ? (
        <ItemYearView picks={resolvedPicks} players={people.data?.players} onPlayer={(s) => set({ player: s })} onChamp={(c) => set({ champ: resolveChampSlug(c) })} initialSearch={vsplayer || team || q.get("q") || ""} />
      ) : resolvedItem ? (
        <ItemPlayersView slug={resolvedItem} picks={resolvedPicks} players={people.data?.players} onPlayer={(s) => set({ player: s })} onChamp={(c) => set({ champ: resolveChampSlug(c) })} onYear={(y) => set({ year: y })} initialSearch={vsplayer || team || q.get("q") || ""} />
      ) : (
        <ItemStats
          loading={items.loading}
          rows={items.data ?? undefined}
          scope={scope}
          champ={champ}
          vschamp={vschamp}
          year={year}
          event={event}
          patch={patch}
          team={team}
          vs={vs}
          role={role}
          league={league}
          to={(slug) => ({ kind: "items", query: queryWith({ item: slug }) })}
        />
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
  const { vsplayer, item, champ, vschamp, year, event, patch, vs, team, role, league } = picks;
  const mine = useLoad(() => loadPlayerItems(slug), [slug]);
  const log = useLoad(() => loadPlayerGames(slug), [slug]);
  const [filter, setFilter] = useState("");
  const [finishedOnly, setFinishedOnly] = useState(true);
  if (mine.loading || log.loading) return <Loading />;
  if (!mine.data || !log.data) return <p className="text-xs text-rw-sub rw-span">{tl("No item history for this player yet.")}</p>;
  const rows = log.data;
  const keep = (r: PlayerGameRow) =>
    (!champ || sameChamp(r[2], champ)) &&
    (!year || r[0].startsWith(year)) &&
    (!patch || r[24] === patch) &&
    (!vs || (r[8] ? (resolveTeamAlias(r[8]) || prettySlug(r[8])) === vs : false)) &&
    (!team || (r[7] ? (resolveTeamAlias(r[7]) || prettySlug(r[7])) === team : false)) &&
    (!event || (r[11] ? matchesPeriodEvent(r[11], r[9], event) : normText(r[9] || "").includes(normText(event))));
  const games = (pos: number[]) => pos.map((i) => rows[i]).filter((r): r is PlayerGameRow => !!r && keep(r));
  const counted = champ || year || event || patch || vs || team ? rows.filter(keep).length : rows.length;
  const whoBuilt = (label: string) => (
    <HubLink
      to={{
        kind: "items",
        query: new URLSearchParams({
          item,
          ...(vsplayer ? { vsplayer } : {}),
          ...(champ ? { champ } : {}),
          ...(vschamp ? { vschamp } : {}),
          ...(year ? { year } : {}),
          ...(event ? { event } : {}),
          ...(patch ? { patch } : {}),
          ...(team ? { team } : {}),
          ...(vs ? { vs } : {}),
          ...(role ? { role } : {}),
          ...(league ? { league } : {}),
        }).toString(),
      }}
      className="text-[11px] text-rw-accent hover:underline"
    >
      {champ ? tl("Who built {item} on {champ}", { item: label, champ: champLabel }) : tl("Who built {item} most", { item: label })}
    </HubLink>
  );
  if (item) {
    const hit = mine.data.find(([it]) => resolveItemSlug(it) === item || prettySlug(it) === item || prettySlug(it).replace(/-/g, "") === item.replace(/-/g, ""));
    const label = itemName(hit?.[0] || itemTitle || item);
    const g = hit ? games(hit[1]) : [];
    const primaryTeam = team || (g[0]?.[7] ? resolveTeamAlias(g[0][7]) || prettySlug(g[0][7]) : "");
    const primaryVs = vs || (g[0]?.[8] ? resolveTeamAlias(g[0][8]) || prettySlug(g[0][8]) : "");
    if (!g.length)
      return (
        <Section title={label}>
          {scope && <p className="text-[11px] text-rw-accent">{scope}</p>}
          <p className="text-sm text-rw-text">
            <span className="font-bold text-rw-red">{tl("No.")}</span>{" "}
            <HubLink
              to={{
                kind: "finder",
                query: `player=${encodeURIComponent(slug)}${vsplayer ? `&vsplayer=${encodeURIComponent(vsplayer)}` : ""}${champ ? `&champ=${encodeURIComponent(champ)}` : ""}${vschamp ? `&vschamp=${encodeURIComponent(vschamp)}` : ""}${role ? `&role=${encodeURIComponent(role)}` : ""}${year ? `&year=${encodeURIComponent(year)}` : ""}${event ? `&event=${encodeURIComponent(event)}` : ""}${patch ? `&patch=${encodeURIComponent(patch)}` : ""}${vs ? `&vs=${encodeURIComponent(vs)}` : ""}${team ? `&team=${encodeURIComponent(team)}` : ""}`,
              }}
              className="hover:text-rw-accent hover:underline"
              title={tl("Game finder")}
            >
              {tl("None of {player}'s {n} pro games with a full scoreboard ended with {item}.", { player: name, n: fmtNum(counted), item: label })}
            </HubLink>
          </p>
          {whoBuilt(label)}
        </Section>
      );
    return (
      <Section
        title={label}
        right={
          <span className="flex flex-wrap items-center gap-2">
            <HubLink
              to={{
                kind: "compare",
                mode: "player",
                a: slug,
                ...(vsplayer && vsplayer !== slug ? { b: vsplayer } : {}),
                ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : year ? { period: `y${year}` } : {}),
              }}
              className="text-[11px] text-rw-accent hover:underline font-semibold"
              data-nocapture="1"
            >
              {tl("Compare")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: `player=${encodeURIComponent(slug)}${vsplayer ? `&vsplayer=${encodeURIComponent(vsplayer)}` : ""}${champ ? `&champ=${encodeURIComponent(champ)}` : ""}${vschamp ? `&vschamp=${encodeURIComponent(vschamp)}` : ""}${role ? `&role=${encodeURIComponent(role)}` : ""}${year ? `&year=${encodeURIComponent(year)}` : ""}${event ? `&event=${encodeURIComponent(event)}` : ""}${patch ? `&patch=${encodeURIComponent(patch)}` : ""}${vs ? `&vs=${encodeURIComponent(vs)}` : ""}${team ? `&team=${encodeURIComponent(team)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
              }}
              className="text-[11px] text-rw-accent hover:underline font-semibold"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            {(champ || g[0]?.[2]) && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: resolveChampSlug(champ || g[0][2]),
                    ...(vschamp ? { vs: vschamp } : {}),
                    ...(role ? { role } : {}),
                    ...(event ? { event } : patch ? { patch } : year ? { patch: `y${year}`, year } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  q: [slug, vsplayer, primaryTeam].filter(Boolean).join(","),
                  ...(champ ? { champ: resolveChampSlug(champ) } : g[0]?.[2] ? { champ: resolveChampSlug(g[0][2]) } : {}),
                  ...(role ? { role } : {}),
                  ...(year ? { year } : {}),
                  ...(event ? { event } : {}),
                  ...(league ? { league } : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  ...(league ? { scope: league, league } : {}),
                  ...(year ? { key: `y${year}`, year } : patch ? { key: `p${patch}`, patch } : {}),
                  ...(event ? { event } : {}),
                  ...(role ? { role } : {}),
                  ...(champ || g[0]?.[2]
                    ? { q: [resolveChampSlug(champ || g[0][2]), vschamp].filter(Boolean).join(",") }
                    : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            {primaryTeam && (
              <HubLink
                to={{
                  kind: "prep",
                  a: primaryTeam,
                  ...(primaryVs && primaryVs !== primaryTeam ? { b: primaryVs } : {}),
                  ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : year ? { period: `y${year}` } : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Match prep")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "draft",
                query: new URLSearchParams({
                  ...(primaryTeam ? { teams: `${primaryTeam}${primaryVs && primaryVs !== primaryTeam ? `,${primaryVs}` : ""}` } : {}),
                  ...(champ || g[0]?.[2]
                    ? { champ: [resolveChampSlug(champ || g[0][2]), vschamp].filter(Boolean).join(",") }
                    : {}),
                  ...(role ? { role } : {}),
                  ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                ...(primaryTeam
                  ? { query: `q=${encodeURIComponent([primaryTeam, primaryVs && primaryVs !== primaryTeam ? primaryVs : ""].filter(Boolean).join(","))}` }
                  : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <CopyItemsPost
              title={`${name} · ${label}`}
              sub={`${fmtNum(g.length)}G${scope ? ` · ${scope}` : ""}`}
              rows={g.slice(0, 5).map((r) => `${r[6] ? tc("short result", "W") : tc("short result", "L")} ${champName(r[2])} (${r[3]}/${r[4]}/${r[5]}) ${tl("vs")} ${r[8]} · ${fmtDate(r[0], false)}`)}
              picks={picks}
            />
            <SectionCard
              section={tl("Item history")}
              name={`${name} · ${label}`}
              sub={`${fmtNum(g.length)}G${scope ? ` · ${scope}` : ""}`}
              rows={() =>
                g.slice(0, 12).map((r, idx) => ({
                  rank: idx + 1,
                  champ: r[2],
                  team: r[7] || r[8],
                  label: `${champName(r[2])} ${tl("vs")} ${r[8]}`,
                  sub: `${r[9]} · ${fmtDate(r[0], false)}`,
                  value: `${r[3]}/${r[4]}/${r[5]}`,
                  win: Boolean(r[6]),
                }))
              }
            />
            <ItemIcon name={hit![0]} size={22} />
          </span>
        }
      >
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
        <ChampSpread games={g} picks={picks} />
        <GameList games={g} spoilerKey={`items:${slug}`} />
        {whoBuilt(label)}
      </Section>
    );
  }
  const fTerms = filter
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((t) => normText(t.trim()))
    .filter(Boolean);
  const list = mine.data
    .filter(([it]) => !finishedOnly || isFinishedItem(it))
    .map(([it, pos]) => [it, games(pos)] as const)
    .filter(
      ([it, g]) =>
        g.length > 0 &&
        (!fTerms.length ||
          fTerms.some(
            (f) =>
              matchesItemSearch(it, itemName(it), f) ||
              g.some((r) => matchesChampSearch(r[2], f)),
          )),
    )
    .sort((a, b) => b[1].length - a[1].length);
  const listTeam = team || (list[0]?.[1]?.[0]?.[7] ? resolveTeamAlias(list[0][1][0][7]) || prettySlug(list[0][1][0][7]) : "");
  const listVs = vs || (list[0]?.[1]?.[0]?.[8] ? resolveTeamAlias(list[0][1][0][8]) || prettySlug(list[0][1][0][8]) : "");
  return (
    <Section
      title={tl("Every item {player} finished pro games with", { player: name })}
      right={
        list.length > 0 ? (
          <span className="flex flex-wrap items-center gap-2">
            {(champ || list[0]?.[1]?.[0]?.[2]) && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: resolveChampSlug(champ || list[0][1][0][2]),
                    ...(vschamp ? { vs: vschamp } : {}),
                    ...(role ? { role } : {}),
                    ...(event ? { event } : patch ? { patch } : year ? { patch: `y${year}`, year } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline font-semibold"
                data-nocapture="1"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "compare",
                mode: "player",
                a: slug,
                ...(vsplayer && vsplayer !== slug ? { b: vsplayer } : {}),
                ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : year ? { period: `y${year}` } : {}),
              }}
              className="text-[11px] text-rw-accent hover:underline font-semibold"
              data-nocapture="1"
            >
              {tl("Compare")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: `player=${encodeURIComponent(slug)}${vsplayer ? `&vsplayer=${encodeURIComponent(vsplayer)}` : ""}${champ ? `&champ=${encodeURIComponent(champ)}` : ""}${vschamp ? `&vschamp=${encodeURIComponent(vschamp)}` : ""}${role ? `&role=${encodeURIComponent(role)}` : ""}${year ? `&year=${encodeURIComponent(year)}` : ""}${event ? `&event=${encodeURIComponent(event)}` : ""}${patch ? `&patch=${encodeURIComponent(patch)}` : ""}${vs ? `&vs=${encodeURIComponent(vs)}` : ""}${team ? `&team=${encodeURIComponent(team)}` : ""}${league ? `&league=${encodeURIComponent(league)}` : ""}`,
              }}
              className="text-[11px] text-rw-accent hover:underline font-semibold"
              data-nocapture="1"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query: new URLSearchParams({
                  q: [slug, vsplayer, listTeam].filter(Boolean).join(","),
                  ...(champ ? { champ: resolveChampSlug(champ) } : list[0]?.[1]?.[0]?.[2] ? { champ: resolveChampSlug(list[0][1][0][2]) } : {}),
                  ...(role ? { role } : {}),
                  ...(year ? { year } : {}),
                  ...(event ? { event } : {}),
                  ...(league ? { league } : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  ...(league ? { scope: league, league } : {}),
                  ...(year ? { key: `y${year}`, year } : patch ? { key: `p${patch}`, patch } : {}),
                  ...(event ? { event } : {}),
                  ...(role ? { role } : {}),
                  ...(champ || list[0]?.[1]?.[0]?.[2]
                    ? { q: [resolveChampSlug(champ || list[0][1][0][2]), vschamp].filter(Boolean).join(",") }
                    : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Pro tier list")} →
            </HubLink>
            {listTeam && (
              <HubLink
                to={{
                  kind: "prep",
                  a: listTeam,
                  ...(listVs && listVs !== listTeam ? { b: listVs } : {}),
                  ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : year ? { period: `y${year}` } : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Match prep")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "draft",
                query: new URLSearchParams({
                  ...(listTeam ? { teams: `${listTeam}${listVs && listVs !== listTeam ? `,${listVs}` : ""}` } : {}),
                  ...(champ || list[0]?.[1]?.[0]?.[2]
                    ? { champ: [resolveChampSlug(champ || list[0][1][0][2]), vschamp].filter(Boolean).join(",") }
                    : {}),
                  ...(role ? { role } : {}),
                  ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                }).toString(),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                ...(listTeam
                  ? { query: `q=${encodeURIComponent([listTeam, listVs && listVs !== listTeam ? listVs : ""].filter(Boolean).join(","))}` }
                  : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Power rankings")} →
            </HubLink>
            <CopyItemsPost
              title={tl("Every item {player} finished pro games with", { player: name })}
              sub={scope || undefined}
              rows={list.slice(0, 5).map(([it, g]) => {
                const won = g.filter((r) => r[6]).length;
                return `${itemName(it)}: ${fmtNum(g.length)}G (${winRate(won, g.length)})`;
              })}
              picks={picks}
            />
            <SectionCard
              section={tl("Item history")}
              name={name}
              sub={scope || undefined}
              rows={() =>
                list.slice(0, 12).map(([it, g], idx) => {
                  const won = g.filter((r) => r[6]).length;
                  return {
                    rank: idx + 1,
                    champ: g[0]?.[2],
                    team: g[0]?.[7] || undefined,
                    label: itemName(it),
                    sub: `${fmtNum(g.length)}G${g[0] ? ` · ${fmtDate(g[0][0], false)}` : ""}`,
                    value: winRate(won, g.length),
                    win: g.length ? won / g.length >= 0.5 : undefined,
                  };
                })
              }
            />
          </span>
        ) : undefined
      }
    >
      {scope && <p className="text-[11px] text-rw-accent">{scope}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tl("Find an item…")} aria-label={tl("Find an item")} className={`${sel} w-48`} />
        <label className="flex items-center gap-1.5 text-rw-sub">
          <input type="checkbox" checked={finishedOnly} onChange={(e) => setFinishedOnly(e.target.checked)} />
          {tl("Finished items only")}
        </label>
        <HubLink
          to={{
            kind: "finder",
            query: `player=${encodeURIComponent(slug)}${vsplayer ? `&vsplayer=${encodeURIComponent(vsplayer)}` : ""}${champ ? `&champ=${encodeURIComponent(champ)}` : ""}${role ? `&role=${encodeURIComponent(role)}` : ""}${year ? `&year=${encodeURIComponent(year)}` : ""}${event ? `&event=${encodeURIComponent(event)}` : ""}${patch ? `&patch=${encodeURIComponent(patch)}` : ""}${vs ? `&vs=${encodeURIComponent(vs)}` : ""}${team ? `&team=${encodeURIComponent(team)}` : ""}`,
          }}
          className="text-rw-muted hover:text-rw-accent hover:underline"
          title={tl("Game finder")}
        >
          {tl("{n} pro games with a full scoreboard", { n: fmtNum(counted) })}
        </HubLink>
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
          {(() => {
            const maxG = Math.max(1, ...list.map(([, g]) => g.length));
            return list.map(([it, g]) => {
              const won = g.filter((r) => r[6]).length;
              const wr = g.length ? won / g.length : 0;
              const wrTone = g.length >= 3 ? (wr >= 0.55 ? "text-rw-teal font-semibold" : wr <= 0.45 ? "text-rw-red" : "text-rw-text") : "text-rw-sub";
              return (
                <tr key={it} className="border-t border-rw-border">
                  <td className={`${td} max-w-[14rem]`} data-sort={itemName(it)}>
                    <button type="button" onClick={() => onItem(resolveItemSlug(it))} className="flex items-center gap-1.5 min-w-0 text-left hover:text-rw-accent" title={tl("Show the games")}>
                      <ItemIcon name={it} size={18} />
                      <span className="truncate">{itemName(it)}</span>
                    </button>
                  </td>
                  <td className={`${td} tabular-nums text-rw-sub w-24`} data-sort={g.length}>
                    <button type="button" onClick={() => onItem(resolveItemSlug(it))} className="hover:text-rw-accent hover:underline" title={tl("Show the games")}>
                      {fmtNum(g.length)}
                    </button>
                    <span className="block h-1 mt-0.5 rounded-sm bg-rw-accent/55" style={{ width: `${Math.max(4, Math.round((g.length / maxG) * 100))}%` }} aria-hidden="true" />
                  </td>
                  <td className={`${td} tabular-nums ${wrTone}`} data-sort={wr}>
                    <div className="min-w-[3.25rem] space-y-0.5">
                      <div>
                        <button type="button" onClick={() => onItem(resolveItemSlug(it))} className="hover:underline" title={tl("Show the games")}>
                          {winRate(won, g.length)}
                        </button>
                      </div>
                      {g.length >= 2 && (
                        <div className="h-1 w-10 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                          <div
                            className={`h-full rounded-full ${wr >= 0.55 ? "bg-rw-teal/80" : wr <= 0.45 ? "bg-rw-red/75" : "bg-rw-sub/55"}`}
                            style={{ width: `${Math.max(6, Math.min(100, Math.round(wr * 100)))}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className={`${td} max-sm:hidden`}>
                    <span className="flex gap-0.5">
                      {topChamps(g, 4).map(([c]) => (
                        <HubLink
                          key={c}
                          to={{
                            kind: "items",
                            query: new URLSearchParams({
                              player: slug,
                              ...(vsplayer ? { vsplayer } : {}),
                              item: resolveItemSlug(it),
                              champ: resolveChampSlug(c),
                              ...(role ? { role } : {}),
                              ...(year ? { year } : {}),
                              ...(event ? { event } : {}),
                              ...(patch ? { patch } : {}),
                              ...(vs ? { vs } : {}),
                              ...(team ? { team } : {}),
                            }).toString(),
                          }}
                          title={`${name} · ${itemName(it)} · ${champName(c)}`}
                        >
                          <ChampIcon name={c} size={16} />
                        </HubLink>
                      ))}
                    </span>
                  </td>
                  <td className={`${td} text-rw-muted whitespace-nowrap`} data-sort={g[0]?.[0] || ""}>
                    {g[0] ? (
                      g[0][1] ? (
                        <HubLink
                          to={{ kind: "match", slug: g[0][1], ...(g[0][22] ? { game: g[0][22] } : {}) }}
                          className="hover:text-rw-accent hover:underline"
                        >
                          {fmtDate(g[0][0], false)}
                        </HubLink>
                      ) : (
                        fmtDate(g[0][0], false)
                      )
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              );
            });
          })()}
        </tbody>
      </STable>
      {!list.length && <p className="text-[11px] text-rw-muted">{tl("No item fits.")}</p>}
    </Section>
  );
};

/** One item's players, most games first, with the champions and years it was built on and in; picking one narrows. */
const ItemPlayersView: React.FC<{
  slug: string;
  picks: Picks;
  players?: SearchPlayerRow[];
  onPlayer: (slug: string) => void;
  onChamp: (champ: string) => void;
  onYear: (year: string) => void;
  initialSearch?: string;
}> = ({
  slug,
  picks,
  players,
  onPlayer,
  onChamp,
  onYear,
  initialSearch = "",
}) => {
  const { vschamp, event, patch, vs, team, role, league } = picks;
  const st = useLoad(() => loadHubItem(slug), [slug]);
  const aliases = useLoad(loadAliases, []);
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);
  const teamBySlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of players || []) {
      if (r[2]) m.set(playerSlug(r), r[2]);
    }
    return m;
  }, [players]);
  if (st.loading) return <Loading />;
  if (!st.data) return <p className="text-xs text-rw-sub rw-span">{tl("No pro game in the stats ended with this item.")}</p>;
  const it = st.data;
  const top = it.c?.[0];
  const terms = search
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const filteredPlayers = terms.length
    ? it.players.filter(([n, u]) => {
        const pTeam = teamBySlug.get(u) || "";
        const hay = `${n} ${u} ${pTeam}`.toLowerCase();
        return terms.some((t) => {
          const tAlias = searchAlias(t);
          return (
            hay.includes(t) ||
            (tAlias ? hay.includes(tAlias) : false) ||
            (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
            resolvePlayerSlug(t) === u ||
            (tAlias ? resolvePlayerSlug(tAlias) === u : false) ||
            Boolean(pTeam && resolveTeamAlias(t, aliases.data?.team) === resolveTeamAlias(pTeam, aliases.data?.team)) ||
            Boolean(pTeam && tAlias && resolveTeamAlias(tAlias, aliases.data?.team) === resolveTeamAlias(pTeam, aliases.data?.team))
          );
        });
      })
    : it.players;
  const topTeamA = team || (filteredPlayers[0] && teamBySlug.get(filteredPlayers[0][1]) ? resolveTeamAlias(teamBySlug.get(filteredPlayers[0][1])!, aliases.data?.team) || prettySlug(teamBySlug.get(filteredPlayers[0][1])!) : "");
  const topTeamB = vs || (filteredPlayers[1] && teamBySlug.get(filteredPlayers[1][1]) ? resolveTeamAlias(teamBySlug.get(filteredPlayers[1][1])!, aliases.data?.team) || prettySlug(teamBySlug.get(filteredPlayers[1][1])!) : "");
  return (
    <Section
      title={tl("Who built {item} most", { item: itemName(it.n) })}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {it.players.length > 8 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              className="bg-rw-bg border border-rw-border rounded-lg px-2 py-0.5 text-xs text-rw-text placeholder:text-rw-muted w-36 focus:border-rw-accent focus:outline-none"
            />
          )}
          {filteredPlayers.length >= 1 && (
            <>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "player",
                  a: filteredPlayers[0][1],
                  ...(filteredPlayers[1] ? { b: filteredPlayers[1][1] } : {}),
                  ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : {}),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    player: filteredPlayers[0][1],
                    ...(filteredPlayers[1]?.[1] && filteredPlayers[1][1] !== filteredPlayers[0][1]
                      ? { vsplayer: filteredPlayers[1][1] }
                      : {}),
                    ...(vschamp ? { vschamp } : {}),
                    ...(role ? { role } : {}),
                    ...(event ? { event } : {}),
                    ...(patch ? { patch } : {}),
                    ...(team ? { team } : {}),
                    ...(vs ? { vs } : {}),
                    ...(league ? { league } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              {it.c?.[0] && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: resolveChampSlug(it.c[0][0]),
                      ...(vschamp
                        ? { vs: vschamp }
                        : it.c?.[1] && resolveChampSlug(it.c[1][0]) !== resolveChampSlug(it.c[0][0])
                          ? { vs: resolveChampSlug(it.c[1][0]) }
                          : {}),
                      ...(role ? { role } : {}),
                      ...(event ? { event } : patch ? { patch } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    ...(it.c?.[0] ? { champ: resolveChampSlug(it.c[0][0]) } : {}),
                    ...(role ? { role } : {}),
                    ...(event ? { event } : {}),
                    ...(league ? { league } : {}),
                    q: filteredPlayers.slice(0, 2).map((p) => p[1] || p[0]).join(","),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(league ? { scope: league, league } : {}),
                    ...(patch ? { key: `p${patch}`, patch } : {}),
                    ...(event ? { event } : {}),
                    ...(role ? { role } : {}),
                    ...(it.c?.[0]
                      ? {
                          q: [
                            resolveChampSlug(it.c[0][0]),
                            vschamp || (it.c?.[1] ? resolveChampSlug(it.c[1][0]) : ""),
                          ]
                            .filter(Boolean)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .join(","),
                        }
                      : {}),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              {topTeamA && (
                <HubLink
                  to={{
                    kind: "prep",
                    a: topTeamA,
                    ...(topTeamB && topTeamB !== topTeamA ? { b: topTeamB } : {}),
                    ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    ...(topTeamA ? { teams: `${topTeamA}${topTeamB && topTeamB !== topTeamA ? `,${topTeamB}` : ""}` } : {}),
                    ...(it.c?.[0]
                      ? {
                          champ: [
                            resolveChampSlug(it.c[0][0]),
                            vschamp || (it.c?.[1] ? resolveChampSlug(it.c[1][0]) : ""),
                          ]
                            .filter(Boolean)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .join(","),
                        }
                      : {}),
                    ...(role ? { role } : {}),
                    ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : {}),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...((topTeamA || league)
                    ? {
                        query: new URLSearchParams({
                          ...(league ? { league } : {}),
                          ...(topTeamA ? { q: [topTeamA, topTeamB && topTeamB !== topTeamA ? topTeamB : ""].filter(Boolean).join(",") } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    ...(vschamp ? { vschamp } : {}),
                    ...(event ? { event } : {}),
                    ...(patch ? { patch } : {}),
                    ...(team ? { team } : {}),
                    ...(vs ? { vs } : {}),
                    ...(role ? { role } : {}),
                    ...(league ? { league } : {}),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Item stats")} →
              </HubLink>
            </>
          )}
          <CopyItemsPost
            title={tl("Who built {item} most", { item: itemName(it.n) })}
            sub={`${fmtNum(it.g)}G · ${fmtNum(it.np)} ${tl("Players")}`}
            rows={filteredPlayers.slice(0, 5).map(([n, , g, last], i) => `#${i + 1} ${n}: ${fmtNum(g)}G (${fmtDate(last, false)})`)}
            picks={picks}
          />
          <SectionCard
            section={tl("Who built {item} most", { item: itemName(it.n) })}
            name={itemName(it.n)}
            sub={`${fmtNum(it.g)}G · ${fmtNum(it.np)} ${tl("Players")}`}
            rows={() =>
              filteredPlayers.slice(0, 12).map(([n, u, g, last], i) => ({
                rank: i + 1,
                champ: it.c?.[0]?.[0],
                team: teamBySlug.get(u),
                label: n,
                sub: fmtDate(last, false),
                value: `${fmtNum(g)}G`,
                win: true,
              }))
            }
          />
          <ItemIcon name={it.n} size={22} />
        </span>
      }
    >
      {/* the item at a glance, then its years as columns (a column opens that year) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 rw-stats">
        <Stat
          label={tl("Games")}
          value={fmtNum(it.g)}
          sub={tl("ended with it")}
          to={{
            kind: "finder",
            query:
              new URLSearchParams({
                ...(top ? { champ: resolveChampSlug(top[0]) } : {}),
                ...(vschamp ? { vschamp } : {}),
                ...(role ? { role } : {}),
                ...(event ? { event } : {}),
                ...(patch ? { patch } : {}),
                ...(team ? { team } : {}),
                ...(vs ? { vs } : {}),
                ...(league ? { league } : {}),
              }).toString() || undefined,
          }}
        />
        <Stat
          label={tl("Players")}
          value={fmtNum(it.np)}
          to={{
            kind: "items",
            query:
              new URLSearchParams({
                ...(vschamp ? { vschamp } : {}),
                ...(role ? { role } : {}),
                ...(event ? { event } : {}),
                ...(patch ? { patch } : {}),
                ...(team ? { team } : {}),
                ...(vs ? { vs } : {}),
                ...(league ? { league } : {}),
              }).toString() || undefined,
          }}
        />
        {it.w != null && (
          <Stat
            label={tl("Win %")}
            value={winRate(it.w, it.g)}
            sub={tl("{n} won", { n: fmtNum(it.w) })}
            to={{
              kind: "items",
              query:
                new URLSearchParams({
                  ...(vschamp ? { vschamp } : {}),
                  ...(role ? { role } : {}),
                  ...(event ? { event } : {}),
                  ...(patch ? { patch } : {}),
                  ...(team ? { team } : {}),
                  ...(vs ? { vs } : {}),
                  ...(league ? { league } : {}),
                }).toString() || undefined,
            }}
          />
        )}
        {top && (
          <Stat
            label={tl("Most built on")}
            value={
              <ChampLink
                name={top[0]}
                size={18}
                query={
                  new URLSearchParams({
                    ...(event ? { event } : patch ? { p: `p:${patch}` } : {}),
                    ...(vschamp ? { vschamp } : it.c?.[1]?.[0] ? { vschamp: resolveChampSlug(it.c[1][0]) } : {}),
                    ...(role ? { role } : {}),
                    ...(team ? { team } : topTeamA ? { team: topTeamA } : {}),
                    ...(vs ? { vs } : topTeamB && topTeamB !== topTeamA ? { vs: topTeamB } : {}),
                  }).toString() || undefined
                }
              />
            }
            sub={tl("{n} games", { n: fmtNum(top[1]) })}
            to={{
              kind: "items",
              query: new URLSearchParams({
                item: slug,
                champ: resolveChampSlug(top[0]),
                ...(vschamp ? { vschamp } : {}),
                ...(role ? { role } : {}),
                ...(event ? { event } : {}),
                ...(patch ? { patch } : {}),
                ...(team ? { team } : {}),
                ...(vs ? { vs } : {}),
                ...(league ? { league } : {}),
              }).toString(),
            }}
          />
        )}
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
          {(() => {
            const maxG = Math.max(1, it.players[0]?.[2] || 1);
            const topChampSlug = top ? resolveChampSlug(top[0]) : undefined;
            const topA = filteredPlayers[0]?.[1] || "";
            const topB = filteredPlayers[1]?.[1] || "";
            return filteredPlayers.map(([n, u, g, last]) => {
              const pTeam = teamBySlug.get(u);
              const pTeamSlug = pTeam ? resolveTeamAlias(pTeam, aliases.data?.team) || prettySlug(pTeam) : "";
              const rivalTeamSlug = vs && vs !== pTeamSlug ? vs : topTeamA && topTeamA !== pTeamSlug ? topTeamA : topTeamB && topTeamB !== pTeamSlug ? topTeamB : "";
              const playerRowQ = new URLSearchParams({
                ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : {}),
                ...(pTeamSlug ? { team: pTeamSlug } : {}),
                ...(rivalTeamSlug ? { q: rivalTeamSlug } : topA && topA !== u ? { q: topA } : topB && topB !== u ? { q: topB } : {}),
                ...(role ? { role } : {}),
                ...(topChampSlug ? { champ: topChampSlug } : {}),
              }).toString() || undefined;
              const teamRowQ = new URLSearchParams({
                ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : {}),
                q: rivalTeamSlug || u,
              }).toString();
              return (
                <tr key={u} className="border-t border-rw-border">
                  <td className={td} data-sort={n}>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <HubLink to={{ kind: "player", slug: u, ...(playerRowQ ? { query: playerRowQ } : {}) }} title={n} className="shrink-0">
                        <PlayerPhoto name={n} team={pTeam} slug={u} size={16} />
                      </HubLink>
                      <PlayerLink name={n} u={u} query={playerRowQ} />
                      {pTeam && (
                        <HubLink
                          to={{
                            kind: "team",
                            slug: pTeamSlug,
                            query: teamRowQ,
                          }}
                          title={pTeam}
                        >
                          <TeamLogo name={pTeam} size={13} />
                        </HubLink>
                      )}
                    </span>
                  </td>
                  <td className={`${td} tabular-nums text-rw-sub w-28`} data-sort={g}>
                    <button type="button" onClick={() => onPlayer(u)} className="hover:text-rw-accent hover:underline" title={tl("Their games")}>
                      {fmtNum(g)}
                    </button>
                    <span className="block h-1 mt-0.5 rounded-sm bg-rw-accent/55" style={{ width: `${Math.max(4, Math.round((g / maxG) * 100))}%` }} aria-hidden="true" />
                  </td>
                  <td className={`${td} text-rw-muted whitespace-nowrap`} data-sort={last}>
                    <button type="button" onClick={() => onPlayer(u)} className="hover:text-rw-accent hover:underline" title={tl("Their games")}>
                      {fmtDate(last, false)}
                    </button>
                  </td>
                  <td className={`${td} text-right`}>
                    <TheirGames onClick={() => onPlayer(u)} />
                  </td>
                </tr>
              );
            });
          })()}
        </tbody>
      </STable>
    </Section>
  );
};

/** One item on one champion: every player who finished a game with it on that champion (in a year, when one is picked). */
const ItemChampView: React.FC<{ picks: Picks; champLabel: string; players?: SearchPlayerRow[]; onPlayer: (slug: string) => void; initialSearch?: string }> = ({ picks, champLabel, players, onPlayer, initialSearch = "" }) => {
  const { item, champ, vschamp, year, event, patch, vs, team, role, league } = picks;
  const st = useLoad(() => loadHubItemChamp(item, champ), [item, champ]);
  const head = useLoad(() => loadHubItem(item), [item]);
  const aliases = useLoad(loadAliases, []);
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);
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
  const terms = search
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const filteredRows = terms.length
    ? rows.filter((r) => {
        const p = players?.[r.k];
        if (!p) return false;
        const u = playerSlug(p);
        const hay = `${p[0]} ${p[2] || ""} ${u}`.toLowerCase();
        return terms.some((t) => {
          const tAlias = searchAlias(t);
          return (
            hay.includes(t) ||
            (tAlias ? hay.includes(tAlias) : false) ||
            (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
            resolvePlayerSlug(t) === u ||
            (tAlias ? resolvePlayerSlug(tAlias) === u : false) ||
            Boolean(p[2] && resolveTeamAlias(t, aliases.data?.team) === resolveTeamAlias(p[2], aliases.data?.team)) ||
            Boolean(p[2] && tAlias && resolveTeamAlias(tAlias, aliases.data?.team) === resolveTeamAlias(p[2], aliases.data?.team))
          );
        });
      })
    : rows;
  const shown = all || terms.length ? filteredRows : filteredRows.slice(0, 100);
  const topA = filteredRows[0] && players?.[filteredRows[0].k] ? playerSlug(players[filteredRows[0].k]) : "";
  const topB = filteredRows[1] && players?.[filteredRows[1].k] ? playerSlug(players[filteredRows[1].k]) : "";
  const topTeamA = team || (filteredRows[0] && players?.[filteredRows[0].k]?.[2] ? resolveTeamAlias(players[filteredRows[0].k][2]!, aliases.data?.team) || prettySlug(players[filteredRows[0].k][2]!) : "");
  const topTeamB = vs || (filteredRows[1] && players?.[filteredRows[1].k]?.[2] ? resolveTeamAlias(players[filteredRows[1].k][2]!, aliases.data?.team) || prettySlug(players[filteredRows[1].k][2]!) : "");
  return (
    <Section
      title={title}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {rows.length > 8 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              className="bg-rw-bg border border-rw-border rounded-lg px-2 py-0.5 text-xs text-rw-text placeholder:text-rw-muted w-36 focus:border-rw-accent focus:outline-none"
            />
          )}
          {topA && (
            <>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "player",
                  a: topA,
                  ...(topB ? { b: topB } : {}),
                  period: event ? `e:${event}` : patch ? `p:${patch}` : year ? `y${year}` : undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    player: topA,
                    ...(topB && topB !== topA ? { vsplayer: topB } : {}),
                    ...(champ ? { champ } : {}),
                    ...(vschamp ? { vschamp } : {}),
                    ...(role ? { role } : {}),
                    ...(year ? { year } : {}),
                    ...(event ? { event } : {}),
                    ...(patch ? { patch } : {}),
                    ...(team ? { team } : {}),
                    ...(vs ? { vs } : {}),
                    ...(league ? { league } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              {champ && (
                <>
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        champ,
                        ...(vschamp ? { vs: vschamp } : {}),
                        ...(role ? { role } : {}),
                        ...(event ? { event } : patch ? { patch } : year ? { patch: `y${year}`, year } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "champ",
                      slug: champ,
                      query: new URLSearchParams({
                        ...(event ? { event } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}`, year } : {}),
                        ...(vschamp && vschamp !== champ ? { vschamp } : {}),
                        ...(topA ? { player: topA } : {}),
                        ...(topTeamA ? { team: topTeamA } : {}),
                        ...(topTeamB && topTeamB !== topTeamA ? { vs: topTeamB } : {}),
                        ...(role ? { role } : {}),
                      }).toString() || undefined,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Champions")} →
                  </HubLink>
                </>
              )}
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    ...(champ ? { champ } : {}),
                    ...(role ? { role } : {}),
                    ...(year ? { year } : {}),
                    ...(event ? { event } : {}),
                    ...(league ? { league } : {}),
                    q: [topA, topB].filter(Boolean).join(","),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(league ? { scope: league, league } : {}),
                    ...(patch ? { key: `p${patch}`, patch } : year ? { key: `y${year}`, year } : {}),
                    ...(event ? { event } : {}),
                    ...(role ? { role } : {}),
                    ...(champ ? { q: [champ, vschamp].filter(Boolean).join(",") } : {}),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              {topTeamA && (
                <HubLink
                  to={{
                    kind: "prep",
                    a: topTeamA,
                    ...(topTeamB && topTeamB !== topTeamA ? { b: topTeamB } : {}),
                    ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : year ? { period: `y${year}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    ...(topTeamA ? { teams: `${topTeamA}${topTeamB && topTeamB !== topTeamA ? `,${topTeamB}` : ""}` } : {}),
                    ...(champ ? { champ: [champ, vschamp].filter(Boolean).join(",") } : {}),
                    ...(role ? { role } : {}),
                    ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...((topTeamA || league)
                    ? {
                        query: new URLSearchParams({
                          ...(league ? { league } : {}),
                          ...(topTeamA ? { q: [topTeamA, topTeamB && topTeamB !== topTeamA ? topTeamB : ""].filter(Boolean).join(",") } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
            </>
          )}
          {rows.length > 0 && (
            <>
              <CopyItemsPost
                title={title}
                sub={`${fmtNum(total)}G · ${fmtNum(rows.length)} ${tl("Players")}`}
                rows={filteredRows.slice(0, 5).map((r, i) => `#${i + 1} ${players?.[r.k]?.[0] || "–"}: ${fmtNum(r.g)}G (${yearSpan(r.ys)})`)}
                picks={picks}
              />
              <SectionCard
                section={title}
                name={`${label} · ${champLabel}`}
                sub={`${fmtNum(total)}G · ${fmtNum(rows.length)} ${tl("Players")}`}
                rows={() =>
                  filteredRows.slice(0, 12).map((r, i) => ({
                    rank: i + 1,
                    champ: head.data?.c?.find(([c]) => sameChamp(c, champ))?.[0] || champLabel || champ,
                    team: players?.[r.k]?.[2] || undefined,
                    label: players?.[r.k]?.[0] || "–",
                    sub: yearSpan(r.ys),
                    value: `${fmtNum(r.g)}G`,
                    win: true,
                  }))
                }
              />
            </>
          )}
          {head.data && <ItemIcon name={head.data.n} size={22} />}
        </span>
      }
    >
      {!rows.length ? (
        <p className="text-sm text-rw-text">
          <span className="font-bold text-rw-red">{tl("No.")}</span> {tl("No pro game in the stats ended with this item.")}
        </p>
      ) : (
        <>
          <p className="text-sm text-rw-text">
            <span className="font-bold text-rw-teal">{tl("Yes.")}</span>{" "}
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  champ,
                  ...(vschamp ? { vschamp } : {}),
                  ...(role ? { role } : {}),
                  ...(year ? { year } : {}),
                  ...(event ? { event } : {}),
                  ...(patch ? { patch } : {}),
                  ...(team ? { team } : {}),
                  ...(vs ? { vs } : {}),
                  ...(league ? { league } : {}),
                }).toString(),
              }}
              className="hover:text-rw-accent hover:underline"
            >
              {tl("{g} pro games by {p} players ended with it.", { g: fmtNum(total), p: fmtNum(rows.length) })}
            </HubLink>
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
              {(() => {
                const maxG = Math.max(1, shown[0]?.g || 1);
                return shown.map((r) => {
                  const p = players?.[r.k];
                  const u = p ? playerSlug(p) : "";
                  const pTeamSlug = p?.[2] ? resolveTeamAlias(p[2], aliases.data?.team) || prettySlug(p[2]) : "";
                  const rivalTeamSlug = vs && vs !== pTeamSlug ? vs : topTeamA && topTeamA !== pTeamSlug ? topTeamA : topTeamB && topTeamB !== pTeamSlug ? topTeamB : "";
                  const playerPeriodQ = new URLSearchParams({
                    ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                    ...(pTeamSlug ? { team: pTeamSlug } : {}),
                    ...(rivalTeamSlug ? { q: rivalTeamSlug } : topA && topA !== u ? { q: topA } : topB && topB !== u ? { q: topB } : {}),
                    ...(role ? { role } : {}),
                    ...(champ ? { champ: resolveChampSlug(champ) } : {}),
                  }).toString() || undefined;
                  const teamPeriodQ = new URLSearchParams({
                    ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                    ...(rivalTeamSlug || u ? { q: rivalTeamSlug || u } : {}),
                  }).toString() || undefined;
                  return (
                    <tr key={r.k} className="border-t border-rw-border">
                      <td className={td} data-sort={p ? p[0] : ""}>
                        {p ? (
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <HubLink to={{ kind: "player", slug: u, ...(playerPeriodQ ? { query: playerPeriodQ } : {}) }} title={p[0]} className="shrink-0">
                              <PlayerPhoto name={p[0]} team={p[2] || undefined} slug={u} size={16} />
                            </HubLink>
                            <PlayerLink name={p[0]} u={u} query={playerPeriodQ} />
                            {p[2] && (
                              <HubLink
                                to={{
                                  kind: "team",
                                  slug: pTeamSlug,
                                  ...(teamPeriodQ ? { query: teamPeriodQ } : {}),
                                }}
                                title={p[2]}
                                className="shrink-0"
                              >
                                <TeamLogo name={p[2]} size={13} />
                              </HubLink>
                            )}
                          </span>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className={`${td} tabular-nums text-rw-sub w-28`} data-sort={r.g}>
                        {u ? (
                          <button type="button" onClick={() => onPlayer(u)} className="hover:text-rw-accent hover:underline" title={tl("Their games")}>
                            {fmtNum(r.g)}
                          </button>
                        ) : (
                          fmtNum(r.g)
                        )}
                        <span className="block h-1 mt-0.5 rounded-sm bg-rw-accent/55" style={{ width: `${Math.max(4, Math.round((r.g / maxG) * 100))}%` }} aria-hidden="true" />
                      </td>
                      <td className={`${td} text-rw-muted max-sm:hidden`} data-sort={r.ys[r.ys.length - 1] || 0}>
                        {u ? (
                          <button type="button" onClick={() => onPlayer(u)} className="hover:text-rw-accent hover:underline" title={tl("Their games")}>
                            {yearSpan(r.ys)}
                          </button>
                        ) : (
                          yearSpan(r.ys)
                        )}
                      </td>
                      <td className={`${td} text-right`}>{u && <TheirGames onClick={() => onPlayer(u)} />}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </STable>
          {filteredRows.length > shown.length && (
            <button type="button" onClick={() => setAll(true)} className="text-[11px] text-rw-accent hover:underline">
              {tl("Show all {n}", { n: filteredRows.length })}
            </button>
          )}
        </>
      )}
    </Section>
  );
};

/** One item in one year: the players with the most games and the champions it was built on that year. */
const ItemYearView: React.FC<{ picks: Picks; players?: SearchPlayerRow[]; onPlayer: (slug: string) => void; onChamp: (champ: string) => void; initialSearch?: string }> = ({
  picks,
  players,
  onPlayer,
  onChamp,
  initialSearch = "",
}) => {
  const { item, vschamp, year, event, patch, vs, team, role, league } = picks;
  const st = useLoad(() => loadHubItemYear(item, year), [item, year]);
  const head = useLoad(() => loadHubItem(item), [item]);
  const aliases = useLoad(loadAliases, []);
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);
  if (st.loading || head.loading) return <Loading />;
  const label = itemName(head.data?.n || item);
  const y = st.data;
  const terms = search
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const filteredP = y
    ? terms.length
      ? y.p.filter(([k]) => {
          const p = players?.[k];
          if (!p) return false;
          const u = playerSlug(p);
          const hay = `${p[0]} ${p[2] || ""} ${u}`.toLowerCase();
          return terms.some((t) => {
            const tAlias = searchAlias(t);
            return (
              hay.includes(t) ||
              (tAlias ? hay.includes(tAlias) : false) ||
              (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
              resolvePlayerSlug(t) === u ||
              (tAlias ? resolvePlayerSlug(tAlias) === u : false) ||
              Boolean(p[2] && resolveTeamAlias(t, aliases.data?.team) === resolveTeamAlias(p[2], aliases.data?.team)) ||
              Boolean(p[2] && tAlias && resolveTeamAlias(tAlias, aliases.data?.team) === resolveTeamAlias(p[2], aliases.data?.team))
            );
          });
        })
      : y.p
    : [];
  const topA = filteredP[0] && players?.[filteredP[0][0]] ? playerSlug(players[filteredP[0][0]]) : "";
  const topB = filteredP[1] && players?.[filteredP[1][0]] ? playerSlug(players[filteredP[1][0]]) : "";
  const topTeamA = team || (filteredP[0] && players?.[filteredP[0][0]]?.[2] ? resolveTeamAlias(players[filteredP[0][0]][2]!, aliases.data?.team) || prettySlug(players[filteredP[0][0]][2]!) : "");
  const topTeamB = vs || (filteredP[1] && players?.[filteredP[1][0]]?.[2] ? resolveTeamAlias(players[filteredP[1][0]][2]!, aliases.data?.team) || prettySlug(players[filteredP[1][0]][2]!) : "");
  return (
    <Section
      title={tl("Who built {item} in {year}", { item: label, year })}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {y && y.p.length > 8 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              className="bg-rw-bg border border-rw-border rounded-lg px-2 py-0.5 text-xs text-rw-text placeholder:text-rw-muted w-36 focus:border-rw-accent focus:outline-none"
            />
          )}
          {topA && (
            <>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "player",
                  a: topA,
                  ...(topB ? { b: topB } : {}),
                  period: event ? `e:${event}` : patch ? `p:${patch}` : year ? `y${year}` : undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    player: topA,
                    ...(topB && topB !== topA ? { vsplayer: topB } : {}),
                    ...(vschamp ? { vschamp } : {}),
                    ...(role ? { role } : {}),
                    ...(year ? { year } : {}),
                    ...(event ? { event } : {}),
                    ...(patch ? { patch } : {}),
                    ...(team ? { team } : {}),
                    ...(vs ? { vs } : {}),
                    ...(league ? { league } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              {y?.c[0] && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: resolveChampSlug(y.c[0][0]),
                      ...(vschamp
                        ? { vs: vschamp }
                        : y.c?.[1] && resolveChampSlug(y.c[1][0]) !== resolveChampSlug(y.c[0][0])
                          ? { vs: resolveChampSlug(y.c[1][0]) }
                          : {}),
                      ...(role ? { role } : {}),
                      ...(event ? { event } : patch ? { patch } : year ? { patch: `y${year}`, year } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "champions",
                  query: new URLSearchParams({
                    ...(league ? { scope: league, league } : {}),
                    ...(patch ? { key: `p${patch}`, patch } : year ? { key: `y${year}`, year } : {}),
                    ...(event ? { event } : {}),
                    ...(role ? { role } : {}),
                    ...(y?.c?.[0]
                      ? {
                          q: [
                            resolveChampSlug(y.c[0][0]),
                            vschamp || (y.c?.[1] ? resolveChampSlug(y.c[1][0]) : ""),
                          ]
                            .filter(Boolean)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .join(","),
                        }
                      : {}),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Champions")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    ...(year ? { year } : {}),
                    ...(event ? { event } : {}),
                    ...(role ? { role } : {}),
                    ...(league ? { league } : {}),
                    ...(y?.c?.[0] ? { champ: resolveChampSlug(y.c[0][0]) } : {}),
                    q: [topA, topB].filter(Boolean).join(","),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(league ? { scope: league, league } : {}),
                    ...(patch ? { key: `p${patch}`, patch } : year ? { key: `y${year}`, year } : {}),
                    ...(event ? { event } : {}),
                    ...(role ? { role } : {}),
                    ...(y?.c?.[0]
                      ? {
                          q: [
                            resolveChampSlug(y.c[0][0]),
                            vschamp || (y.c?.[1] ? resolveChampSlug(y.c[1][0]) : ""),
                          ]
                            .filter(Boolean)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .join(","),
                        }
                      : {}),
                  }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              {topTeamA && (
                <HubLink
                  to={{
                    kind: "prep",
                    a: topTeamA,
                    ...(topTeamB && topTeamB !== topTeamA ? { b: topTeamB } : {}),
                    ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : year ? { period: `y${year}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    ...(topTeamA ? { teams: `${topTeamA}${topTeamB && topTeamB !== topTeamA ? `,${topTeamB}` : ""}` } : {}),
                    ...(y?.c?.[0]
                      ? {
                          champ: [
                            resolveChampSlug(y.c[0][0]),
                            vschamp || (y.c?.[1] ? resolveChampSlug(y.c[1][0]) : ""),
                          ]
                            .filter(Boolean)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .join(","),
                        }
                      : {}),
                    ...(role ? { role } : {}),
                    ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...((topTeamA || league)
                    ? {
                        query: new URLSearchParams({
                          ...(league ? { league } : {}),
                          ...(topTeamA ? { q: [topTeamA, topTeamB && topTeamB !== topTeamA ? topTeamB : ""].filter(Boolean).join(",") } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
            </>
          )}
          {y && y.p.length > 0 && (
            <>
              <CopyItemsPost
                title={tl("Who built {item} in {year}", { item: label, year })}
                sub={`${fmtNum(y.g)}G · ${fmtNum(y.np)} ${tl("Players")}`}
                rows={filteredP.slice(0, 5).map(([k, g], i) => `#${i + 1} ${players?.[k]?.[0] || "–"}: ${fmtNum(g)}G`)}
                picks={picks}
              />
              <SectionCard
                section={tl("Who built {item} in {year}", { item: label, year })}
                name={`${label} · ${year}`}
                sub={`${fmtNum(y.g)}G · ${fmtNum(y.np)} ${tl("Players")}`}
                rows={() =>
                  filteredP.slice(0, 12).map(([k, g], i) => ({
                    rank: i + 1,
                    champ: y.c[0]?.[0],
                    team: players?.[k]?.[2] || undefined,
                    label: players?.[k]?.[0] || "–",
                    value: `${fmtNum(g)}G`,
                    win: true,
                  }))
                }
              />
            </>
          )}
          {head.data && <ItemIcon name={head.data.n} size={22} />}
        </span>
      }
    >
      {!y ? (
        <p className="text-sm text-rw-text">
          <span className="font-bold text-rw-red">{tl("No.")}</span> {tl("No pro game in the stats ended with this item.")}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-rw-muted">
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  year,
                  ...(y.c?.[0] ? { champ: resolveChampSlug(y.c[0][0]) } : {}),
                  ...(vschamp ? { vschamp } : {}),
                  ...(role ? { role } : {}),
                  ...(event ? { event } : {}),
                  ...(patch ? { patch } : {}),
                  ...(team ? { team } : {}),
                  ...(vs ? { vs } : {}),
                  ...(league ? { league } : {}),
                }).toString(),
              }}
              className="hover:text-rw-accent hover:underline"
            >
              {tl("{g} pro games by {p} players ended with it.", { g: fmtNum(y.g), p: fmtNum(y.np) })}
            </HubLink>
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
              {(() => {
                const maxG = Math.max(1, y.p[0]?.[1] || 1);
                const topYearChampSlug = y.c?.[0]?.[0] ? resolveChampSlug(y.c[0][0]) : undefined;
                return filteredP.map(([k, g]) => {
                  const p = players?.[k];
                  const u = p ? playerSlug(p) : "";
                  const pTeamSlug = p?.[2] ? resolveTeamAlias(p[2], aliases.data?.team) || prettySlug(p[2]) : "";
                  const rivalTeamSlug = vs && vs !== pTeamSlug ? vs : topTeamA && topTeamA !== pTeamSlug ? topTeamA : topTeamB && topTeamB !== pTeamSlug ? topTeamB : "";
                  const rowPlayerQ = new URLSearchParams({
                    ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                    ...(pTeamSlug ? { team: pTeamSlug } : {}),
                    ...(rivalTeamSlug ? { q: rivalTeamSlug } : topA && topA !== u ? { q: topA } : topB && topB !== u ? { q: topB } : {}),
                    ...(role ? { role } : {}),
                    ...(topYearChampSlug ? { champ: topYearChampSlug } : {}),
                  }).toString() || undefined;
                  const rowTeamQ = new URLSearchParams({
                    ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                    ...(rivalTeamSlug || u ? { q: rivalTeamSlug || u } : {}),
                  }).toString() || undefined;
                  return (
                    <tr key={k} className="border-t border-rw-border">
                      <td className={td} data-sort={p ? p[0] : ""}>
                        {p ? (
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <HubLink to={{ kind: "player", slug: u, ...(rowPlayerQ ? { query: rowPlayerQ } : {}) }} title={p[0]} className="shrink-0">
                              <PlayerPhoto name={p[0]} team={p[2] || undefined} slug={u} size={16} />
                            </HubLink>
                            <PlayerLink name={p[0]} u={u} query={rowPlayerQ} />
                            {p[2] && (
                              <HubLink
                                to={{
                                  kind: "team",
                                  slug: pTeamSlug,
                                  ...(rowTeamQ ? { query: rowTeamQ } : {}),
                                }}
                                title={p[2]}
                                className="shrink-0"
                              >
                                <TeamLogo name={p[2]} size={13} />
                              </HubLink>
                            )}
                          </span>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className={`${td} tabular-nums text-rw-sub w-28`} data-sort={g}>
                        {u ? (
                          <button type="button" onClick={() => onPlayer(u)} className="hover:text-rw-accent hover:underline" title={tl("Their games")}>
                            {fmtNum(g)}
                          </button>
                        ) : (
                          fmtNum(g)
                        )}
                        <span className="block h-1 mt-0.5 rounded-sm bg-rw-accent/55" style={{ width: `${Math.max(4, Math.round((g / maxG) * 100))}%` }} aria-hidden="true" />
                      </td>
                      <td className={`${td} text-right`}>{u && <TheirGames onClick={() => onPlayer(u)} />}</td>
                    </tr>
                  );
                });
              })()}
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
const ItemStats: React.FC<{
  loading: boolean;
  rows?: ItemIndexRow[];
  scope: string | null;
  champ?: string;
  vschamp?: string;
  year?: string;
  event?: string;
  patch?: string;
  team?: string;
  vs?: string;
  role?: string;
  league?: string;
  to: (slug: string) => HubRoute;
}> = ({ loading, rows, scope, champ, vschamp, year, event, patch, team, vs, role, league, to }) => {
  const [filter, setFilter] = useState("");
  const [finishedOnly, setFinishedOnly] = useState(true);
  const [all, setAll] = useState(false);
  const terms = filter
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((t) => normText(t))
    .filter(Boolean);
  const baseList = (rows || []).filter(
    (r) =>
      (!finishedOnly || isFinishedItem(r[0])) &&
      (!terms.length ||
        terms.some(
          (t) =>
            matchesItemSearch(r[0], itemName(r[0]), t) ||
            (r[5] || []).some((c) => matchesChampSearch(c, t)),
        )),
  );
  const list = champ
    ? [...baseList].sort((a, b) => {
        const aHit = (a[5] || []).some((c) => sameChamp(c, champ)) ? 1 : 0;
        const bHit = (b[5] || []).some((c) => sameChamp(c, champ)) ? 1 : 0;
        return bHit - aHit || b[2] - a[2];
      })
    : baseList;
  const max = Math.max(1, ...list.map((r) => r[2]));
  const shown = all || terms.length ? list : list.slice(0, 60);
  const activeChamp = champ ? resolveChampSlug(champ) : shown[0]?.[5]?.[0] ? resolveChampSlug(shown[0][5][0]) : "";
  return (
    <Section
      title={tl("Item stats")}
      right={
        shown.length > 0 ? (
          <span className="flex flex-wrap items-center gap-2">
            {team && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: team,
                    ...(vs && vs !== team ? { b: vs } : {}),
                    ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : year ? { period: `y${year}` } : {}),
                  }}
                  className="text-[11px] text-rw-accent hover:underline font-semibold"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: team,
                    ...(vs && vs !== team ? { b: vs } : {}),
                    ...(event ? { period: `e:${event}` } : patch ? { period: `p:${patch}` } : year ? { period: `y${year}` } : {}),
                  }}
                  className="text-[11px] text-rw-accent hover:underline font-semibold"
                >
                  {tl("Compare")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{
                kind: "champions",
                query: new URLSearchParams({
                  ...(league ? { scope: league, league } : {}),
                  ...(patch ? { key: `p${patch}`, patch } : year ? { key: `y${year}`, year } : {}),
                  ...(event ? { event } : {}),
                  ...(role ? { role } : {}),
                  ...(activeChamp ? { q: [activeChamp, vschamp].filter(Boolean).join(",") } : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Champions")} →
            </HubLink>
            <HubLink
              to={{
                kind: "counters",
                query: new URLSearchParams({
                  ...(activeChamp ? { champ: resolveChampSlug(activeChamp) } : {}),
                  ...(vschamp ? { vs: vschamp } : {}),
                  ...(role ? { role } : {}),
                  ...(event ? { event } : patch ? { patch } : year ? { patch: `y${year}`, year } : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Counters")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                query: new URLSearchParams({
                  ...(league ? { scope: league, league } : {}),
                  ...(patch ? { key: `p${patch}`, patch } : year ? { key: `y${year}`, year } : {}),
                  ...(event ? { event } : {}),
                  ...(role ? { role } : {}),
                  ...(activeChamp ? { q: [activeChamp, vschamp].filter(Boolean).join(",") } : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                query:
                  new URLSearchParams({
                    ...(year ? { year } : {}),
                    ...(event ? { event } : {}),
                    ...(role ? { role } : {}),
                    ...(league ? { league } : {}),
                    ...(activeChamp ? { champ: activeChamp } : {}),
                    ...(team ? { q: [team, vs && vs !== team ? vs : ""].filter(Boolean).join(",") } : {}),
                  }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{
                kind: "draft",
                query: new URLSearchParams({
                  ...(team ? { teams: `${team}${vs && vs !== team ? `,${vs}` : ""}` } : {}),
                  ...(event ? { p: `e:${event}` } : patch ? { p: `p:${patch}` } : year ? { p: `y${year}` } : {}),
                  ...(activeChamp ? { champ: [activeChamp, vschamp].filter(Boolean).join(",") } : {}),
                  ...(role ? { role } : {}),
                }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query:
                  new URLSearchParams({
                    ...(activeChamp ? { champ: activeChamp } : {}),
                    ...(vschamp ? { vschamp } : {}),
                    ...(role ? { role } : {}),
                    ...(year ? { year } : {}),
                    ...(event ? { event } : {}),
                    ...(patch ? { patch } : {}),
                    ...(team ? { team } : {}),
                    ...(vs ? { vs } : {}),
                    ...(league ? { league } : {}),
                  }).toString() || undefined,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "rankings",
                ...((team || league)
                  ? {
                      query: new URLSearchParams({
                        ...(league ? { league } : {}),
                        ...(team ? { q: [team, vs && vs !== team ? vs : ""].filter(Boolean).join(",") } : {}),
                      }).toString(),
                    }
                  : {}),
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            <CopyItemsPost
              title={tl("Item stats")}
              sub={scope || undefined}
              rows={shown.slice(0, 5).map((r, i) => `#${i + 1} ${itemName(r[0])}: ${fmtNum(r[2])}G${r[4] != null ? ` (${winRate(r[4], r[2])})` : ""}`)}
              picks={{ player: "", item: "", champ: champ || "", vschamp, year: year || "", event, patch, vs, team, role, league }}
            />
            <SectionCard
              section={tl("Item stats")}
              name={tl("Item history")}
              sub={scope || undefined}
              rows={() =>
                shown.slice(0, 12).map((r, i) => ({
                  rank: i + 1,
                  champ: r[5]?.[0],
                  label: itemName(r[0]),
                  sub: `${fmtNum(r[2])}G · ${fmtNum(r[3])} ${tl("Players")}`,
                  value: r[4] != null ? winRate(r[4], r[2]) : `${fmtNum(r[2])}G`,
                  win: r[4] != null && r[2] ? r[4] / r[2] >= 0.5 : true,
                }))
              }
            />
          </span>
        ) : undefined
      }
    >
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
                  <td className={`${td} max-w-[15rem]`} data-sort={itemName(r[0])}>
                    <HubLink to={to(r[1])} className="flex items-center gap-1.5 min-w-0 hover:text-rw-accent">
                      <ItemIcon name={r[0]} size={20} />
                      <span className="truncate">{itemName(r[0])}</span>
                    </HubLink>
                  </td>
                  {/* the number over a thin bar of its share of the most built item's games */}
                  <td className={`${td} tabular-nums text-rw-sub w-28`} data-sort={r[2]}>
                    <HubLink to={to(r[1])} className="hover:text-rw-accent hover:underline">
                      {fmtNum(r[2])}
                    </HubLink>
                    <span className="block h-1 mt-0.5 rounded-sm bg-rw-accent/50" style={{ width: `${Math.max(2, (r[2] / max) * 100)}%` }} aria-hidden="true" />
                  </td>
                  <td className={`${td} tabular-nums text-rw-sub max-sm:hidden w-24`} data-sort={r[3]}>
                    <HubLink to={to(r[1])} className="hover:text-rw-accent hover:underline">
                      {fmtNum(r[3])}
                    </HubLink>
                    <span className="block h-1 mt-0.5 rounded-sm bg-rw-sub/45" style={{ width: `${Math.max(4, Math.min(100, Math.round((r[3] / Math.max(1, shown[0]?.[3] || 1)) * 100)))}%` }} aria-hidden="true" />
                  </td>
                  <td className={`${td} tabular-nums`} data-sort={r[4] != null && r[2] ? r[4] / r[2] : 0}>
                    {r[4] != null && r[2] ? (
                      (() => {
                        const wr = r[4] / r[2];
                        const tone = r[2] >= 10 ? (wr >= 0.55 ? "text-rw-teal font-semibold" : wr <= 0.45 ? "text-rw-red" : "text-rw-text") : "text-rw-sub";
                        return (
                          <HubLink to={to(r[1])} className="block min-w-[3.25rem] space-y-0.5 hover:opacity-90">
                            <span className={`${tone} hover:underline`}>{winRate(r[4], r[2])}</span>
                            {r[2] >= 5 && (
                              <div className="h-1 w-10 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                                <div
                                  className={`h-full rounded-full ${wr >= 0.55 ? "bg-rw-teal/80" : wr <= 0.45 ? "bg-rw-red/75" : "bg-rw-sub/55"}`}
                                  style={{ width: `${Math.max(6, Math.min(100, Math.round(wr * 100)))}%` }}
                                />
                              </div>
                            )}
                          </HubLink>
                        );
                      })()
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className={`${td} max-sm:hidden`}>
                    <span className="flex gap-0.5">
                      {(r[5] || []).map((c) => (
                        <HubLink
                          key={c}
                          to={{
                            kind: "items",
                            query: new URLSearchParams({
                              item: r[1],
                              champ: resolveChampSlug(c),
                              ...(vschamp ? { vschamp } : {}),
                              ...(role ? { role } : {}),
                              ...(year ? { year } : {}),
                              ...(event ? { event } : {}),
                              ...(patch ? { patch } : {}),
                              ...(team ? { team } : {}),
                              ...(vs ? { vs } : {}),
                              ...(league ? { league } : {}),
                            }).toString(),
                          }}
                          title={`${itemName(r[0])} · ${champName(c)}`}
                        >
                          <ChampIcon name={c} size={18} />
                        </HubLink>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </STable>
          {list.length > shown.length && (
            <button type="button" onClick={() => setAll(true)} className="text-[11px] text-rw-accent hover:underline">
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
  <button type="button" onClick={onClick} className="text-rw-accent hover:underline">
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
const ChampSpread: React.FC<{ games: PlayerGameRow[]; picks?: Picks }> = ({ games, picks }) => (
  <div className="flex flex-wrap gap-2 text-[11px] text-rw-sub">
    {topChamps(games, 8).map(([c, n]) => (
      <HubLink
        key={c}
        to={
          picks?.player && picks?.item && !picks.champ
            ? {
                kind: "items",
                query: new URLSearchParams({
                  player: picks.player,
                  ...(picks.vsplayer ? { vsplayer: picks.vsplayer } : {}),
                  item: picks.item,
                  champ: resolveChampSlug(c),
                  ...(picks.role ? { role: picks.role } : {}),
                  ...(picks.year ? { year: picks.year } : {}),
                  ...(picks.event ? { event: picks.event } : {}),
                  ...(picks.patch ? { patch: picks.patch } : {}),
                  ...(picks.vs ? { vs: picks.vs } : {}),
                  ...(picks.team ? { team: picks.team } : {}),
                }).toString(),
              }
            : {
                kind: "champ",
                slug: resolveChampSlug(c),
                query:
                  new URLSearchParams({
                    ...(picks?.event
                      ? { event: picks.event }
                      : picks?.patch
                        ? { p: `p:${picks.patch}` }
                        : picks?.year
                          ? { p: `y${picks.year}`, year: picks.year }
                          : {}),
                    ...(picks?.vschamp && picks.vschamp !== resolveChampSlug(c) ? { vschamp: picks.vschamp } : {}),
                    ...(picks?.player ? { player: picks.player } : {}),
                    ...(picks?.team ? { team: picks.team } : {}),
                    ...(picks?.vs ? { vs: picks.vs } : {}),
                    ...(picks?.role ? { role: picks.role } : {}),
                  }).toString() || undefined,
              }
        }
        className="flex items-center gap-1 hover:text-rw-accent"
      >
        <ChampIcon name={c} size={16} /> {champName(c)} {n}
      </HubLink>
    ))}
  </div>
);

/** The games, newest first: result, champion, KDA, opponent and event, each linked to its match page. */
const GameList: React.FC<{ games: PlayerGameRow[]; spoilerKey: string }> = ({ games, spoilerKey }) => {
  const hiddenNow = useHiddenCheck();
  const aliases = useLoad(loadAliases, []);
  const [all, setAll] = useState(false);
  const [gameFilter, setGameFilter] = useState("");
  const gTerms = gameFilter
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((t) => normText(t.trim()))
    .filter(Boolean);
  const filteredGames = gTerms.length
    ? games.filter((r) => {
        const hay = normText(`${champName(r[2])} ${r[2]} ${r[7] || ""} ${r[8] || ""} ${r[9] || ""}`);
        return gTerms.some((t) => {
          const tAlias = searchAlias(t);
          const canonTeam = resolveTeamAlias(t, aliases.data?.team);
          const canonAliasTeam = tAlias ? resolveTeamAlias(tAlias, aliases.data?.team) : "";
          const r7Canon = r[7] ? resolveTeamAlias(r[7], aliases.data?.team) : "";
          const r8Canon = r[8] ? resolveTeamAlias(r[8], aliases.data?.team) : "";
          return (
            hay.includes(t) ||
            (tAlias ? hay.includes(tAlias) : false) ||
            (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
            matchesChampSearch(r[2], t) ||
            Boolean(r7Canon && (canonTeam === r7Canon || (canonAliasTeam && canonAliasTeam === r7Canon))) ||
            Boolean(r8Canon && (canonTeam === r8Canon || (canonAliasTeam && canonAliasTeam === r8Canon))) ||
            Boolean(r[11] && matchesPeriodEvent(r[11], r[9], t))
          );
        });
      })
    : games;
  const shown = all || gTerms.length ? filteredGames : filteredGames.slice(0, 50);
  const tSlug = (name?: string) => (name ? resolveTeamAlias(name, aliases.data?.team) || prettySlug(name) : "");
  return (
    <>
      {games.length >= 10 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="search"
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded-lg px-2 py-0.5 text-xs text-rw-text placeholder:text-rw-muted w-44 focus:border-rw-accent focus:outline-none"
          />
          {gTerms.length > 0 && filteredGames[0]?.[7] && filteredGames[0]?.[8] && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: tSlug(filteredGames[0][7]),
                  b: tSlug(filteredGames[0][8]),
                  ...(filteredGames[0][11]
                    ? { period: `e:${filteredGames[0][11]}` }
                    : filteredGames[0][24]
                      ? { period: `p:${filteredGames[0][24]}` }
                      : /^\d{4}$/.test((filteredGames[0][0] || "").slice(0, 4))
                        ? { period: `y${(filteredGames[0][0] || "").slice(0, 4)}` }
                        : {}),
                }}
                className="text-[11px] text-rw-accent hover:underline font-semibold"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: tSlug(filteredGames[0][7]),
                  b: tSlug(filteredGames[0][8]),
                  ...(filteredGames[0][11]
                    ? { period: `e:${filteredGames[0][11]}` }
                    : filteredGames[0][24]
                      ? { period: `p:${filteredGames[0][24]}` }
                      : /^\d{4}$/.test((filteredGames[0][0] || "").slice(0, 4))
                        ? { period: `y${(filteredGames[0][0] || "").slice(0, 4)}` }
                        : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(tSlug(filteredGames[0][7]))},${encodeURIComponent(tSlug(filteredGames[0][8]))}${filteredGames[0][2] ? `&champ=${encodeURIComponent(resolveChampSlug(filteredGames[0][2]))}` : ""}${filteredGames[0][11] ? `&p=e:${encodeURIComponent(filteredGames[0][11])}` : filteredGames[0][24] ? `&p=p:${encodeURIComponent(filteredGames[0][24])}` : /^\d{4}$/.test((filteredGames[0][0] || "").slice(0, 4)) ? `&p=y${encodeURIComponent((filteredGames[0][0] || "").slice(0, 4))}` : ""}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `team=${encodeURIComponent(tSlug(filteredGames[0][7]))}&vs=${encodeURIComponent(tSlug(filteredGames[0][8]))}${filteredGames[0][2] ? `&champ=${encodeURIComponent(resolveChampSlug(filteredGames[0][2]))}` : ""}${filteredGames[0][11] ? `&event=${encodeURIComponent(filteredGames[0][11])}` : ""}${filteredGames[0][24] ? `&patch=${encodeURIComponent(filteredGames[0][24])}` : ""}${/^\d{4}$/.test((filteredGames[0][0] || "").slice(0, 4)) ? `&year=${encodeURIComponent((filteredGames[0][0] || "").slice(0, 4))}` : ""}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
            </>
          )}
        </div>
      )}
      <ul className="text-xs space-y-1">
        {shown.map((r, i) => {
          const hide = hiddenNow(spoilerKey, r[0]);
          return (
            <li key={i} className="flex items-center justify-between gap-2 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                {!hide && r[1] ? (
                  <HubLink
                    to={{ kind: "match", slug: r[1], ...(r[22] ? { game: r[22] } : {}) }}
                    className={`w-3.5 shrink-0 font-bold hover:underline ${r[6] ? "text-rw-teal" : "text-rw-red"}`}
                  >
                    {r[6] ? tc("short result", "W") : tc("short result", "L")}
                  </HubLink>
                ) : (
                  <span className={`w-3.5 shrink-0 font-bold ${hide ? "text-rw-muted" : r[6] ? "text-rw-teal" : "text-rw-red"}`}>
                    {hide ? "?" : r[6] ? tc("short result", "W") : tc("short result", "L")}
                  </span>
                )}
                <HubLink
                  to={{
                    kind: "champ",
                    slug: resolveChampSlug(r[2]),
                    query: new URLSearchParams({
                      ...(r[11]
                        ? { event: r[11] }
                        : r[24]
                          ? { p: `p:${r[24]}` }
                          : /^\d{4}$/.test((r[0] || "").slice(0, 4))
                            ? { p: `y${(r[0] || "").slice(0, 4)}`, year: (r[0] || "").slice(0, 4) }
                            : {}),
                      ...(r[7] ? { team: tSlug(r[7]) } : {}),
                      ...(r[8] ? { vs: tSlug(r[8]) } : {}),
                    }).toString() || undefined,
                  }}
                  className="shrink-0"
                >
                  <ChampIcon name={r[2]} size={18} />
                </HubLink>
                <span className="truncate min-w-0 inline-flex items-center gap-1">
                  {r[1] ? (
                    <HubLink
                      to={{ kind: "match", slug: r[1], ...(r[22] ? { game: r[22] } : {}) }}
                      className="text-rw-text hover:text-rw-accent hover:underline tabular-nums shrink-0"
                    >
                      {hide ? "–" : `${r[3]}/${r[4]}/${r[5]}`}
                    </HubLink>
                  ) : (
                    <span className="text-rw-text tabular-nums shrink-0">{hide ? "–" : `${r[3]}/${r[4]}/${r[5]}`}</span>
                  )}
                  {r[7] && (
                    <HubLink
                      to={{
                        kind: "team",
                        slug: tSlug(r[7]),
                        query: new URLSearchParams({
                          ...(r[11]
                            ? { p: `e:${r[11]}` }
                            : r[24]
                              ? { p: `p:${r[24]}` }
                              : /^\d{4}$/.test((r[0] || "").slice(0, 4))
                                ? { p: `y${(r[0] || "").slice(0, 4)}` }
                                : {}),
                          ...(r[8] ? { q: tSlug(r[8]) } : {}),
                        }).toString() || undefined,
                      }}
                      title={r[7]}
                      className="shrink-0"
                    >
                      <TeamLogo name={r[7]} size={13} />
                    </HubLink>
                  )}
                  {r[7] && r[8] ? (
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a: tSlug(r[7]),
                        b: tSlug(r[8]),
                        period: r[11]
                          ? `e:${r[11]}`
                          : r[24]
                            ? `p:${r[24]}`
                            : /^\d{4}$/.test((r[0] || "").slice(0, 4))
                              ? `y${(r[0] || "").slice(0, 4)}`
                              : undefined,
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline shrink-0"
                      title={tl("Compare")}
                    >
                      {tl("vs")}
                    </HubLink>
                  ) : (
                    <span className="text-rw-muted shrink-0">{tl("vs")}</span>
                  )}
                  <HubLink
                    to={{
                      kind: "team",
                      slug: tSlug(r[8]),
                      query: new URLSearchParams({
                        ...(r[11]
                          ? { p: `e:${r[11]}` }
                          : r[24]
                            ? { p: `p:${r[24]}` }
                            : /^\d{4}$/.test((r[0] || "").slice(0, 4))
                              ? { p: `y${(r[0] || "").slice(0, 4)}` }
                              : {}),
                        ...(r[7] ? { q: tSlug(r[7]) } : {}),
                      }).toString() || undefined,
                    }}
                    title={r[8]}
                    className="shrink-0"
                  >
                    <TeamLogo name={r[8]} size={13} />
                  </HubLink>
                  <TeamLink
                    name={r[8]}
                    query={
                      new URLSearchParams({
                        ...(r[11]
                          ? { p: `e:${r[11]}` }
                          : r[24]
                            ? { p: `p:${r[24]}` }
                            : /^\d{4}$/.test((r[0] || "").slice(0, 4))
                              ? { p: `y${(r[0] || "").slice(0, 4)}` }
                              : {}),
                        ...(r[7] ? { q: tSlug(r[7]) } : {}),
                      }).toString() || undefined
                    }
                    className="truncate"
                  />
                  <span className="text-rw-muted truncate">
                    {" · "}
                    <EventLink
                      name={r[9]}
                      u={r[11]}
                      query={
                        r[7] || r[8]
                          ? `q=${encodeURIComponent([tSlug(r[7]), tSlug(r[8])].filter(Boolean).join(","))}`
                          : undefined
                      }
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                    />
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2 text-rw-muted shrink-0">
                {!hide && r[23] != null &&
                  (r[1] ? (
                    <HubLink
                      to={{ kind: "match", slug: r[1], ...(r[22] ? { game: r[22] } : {}) }}
                      className={`tabular-nums font-semibold hover:underline ${ratingTextClass(r[23])}`}
                      title={tl("Game rating")}
                    >
                      {r[23].toFixed(0)}
                    </HubLink>
                  ) : (
                    <span className={`tabular-nums font-semibold ${ratingTextClass(r[23])}`} title={tl("Game rating")}>
                      {r[23].toFixed(0)}
                    </span>
                  ))}
                {r[7] && r[8] && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: tSlug(r[7]),
                        b: tSlug(r[8]),
                        ...(r[11]
                          ? { period: `e:${r[11]}` }
                          : r[24]
                            ? { period: `p:${r[24]}` }
                            : /^\d{4}$/.test((r[0] || "").slice(0, 4))
                              ? { period: `y${(r[0] || "").slice(0, 4)}` }
                              : {}),
                      }}
                      className="hidden sm:inline text-[10px] hover:text-rw-accent hover:underline"
                    >
                      {tl("Match prep")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(tSlug(r[7]))},${encodeURIComponent(tSlug(r[8]))}${r[2] ? `&champ=${encodeURIComponent(resolveChampSlug(r[2]))}` : ""}${r[11] ? `&p=e:${encodeURIComponent(r[11])}` : r[24] ? `&p=p:${encodeURIComponent(r[24])}` : /^\d{4}$/.test((r[0] || "").slice(0, 4)) ? `&p=y${encodeURIComponent((r[0] || "").slice(0, 4))}` : ""}`,
                      }}
                      className="hidden sm:inline text-[10px] hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `team=${encodeURIComponent(tSlug(r[7]))}&vs=${encodeURIComponent(tSlug(r[8]))}${r[2] ? `&champ=${encodeURIComponent(resolveChampSlug(r[2]))}` : ""}${r[11] ? `&event=${encodeURIComponent(r[11])}` : ""}${r[24] ? `&patch=${encodeURIComponent(r[24])}` : ""}${/^\d{4}$/.test((r[0] || "").slice(0, 4)) ? `&year=${encodeURIComponent((r[0] || "").slice(0, 4))}` : ""}`,
                      }}
                      className="hidden sm:inline text-[10px] hover:text-rw-accent hover:underline"
                    >
                      {tl("Game finder")}
                    </HubLink>
                  </>
                )}
                {r[1] ? (
                  <HubLink
                    to={{ kind: "match", slug: r[1], ...(r[22] ? { game: r[22] } : {}) }}
                    className="hover:text-rw-accent hover:underline"
                  >
                    {fmtDate(r[0], false)}
                  </HubLink>
                ) : (
                  <span>{fmtDate(r[0], false)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {filteredGames.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="text-[11px] text-rw-accent hover:underline">
          {tl("Show all {n}", { n: filteredGames.length })}
        </button>
      )}
    </>
  );
};

const CopyItemsPost: React.FC<{
  title: string;
  sub?: string;
  rows: string[];
  picks: Picks;
}> = ({ title, sub, rows, picks }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [`${title}${sub ? ` (${sub})` : ""}`];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    const qs = new URLSearchParams();
    if (picks.player) qs.set("player", picks.player);
    if (picks.vsplayer) qs.set("vsplayer", picks.vsplayer);
    if (picks.item) qs.set("item", picks.item);
    if (picks.champ) qs.set("champ", picks.champ);
    if (picks.vschamp) qs.set("vschamp", picks.vschamp);
    if (picks.role) qs.set("role", picks.role);
    if (picks.year) qs.set("year", picks.year);
    if (picks.event) qs.set("event", picks.event);
    if (picks.patch) qs.set("patch", picks.patch);
    if (picks.vs) qs.set("vs", picks.vs);
    if (picks.team) qs.set("team", picks.team);
    if (picks.league) qs.set("league", picks.league);
    lines.push(hubShareUrl({ kind: "items", query: qs.toString() || undefined }));
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        setState("failed");
        setTimeout(() => setState("idle"), 2400);
      });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
