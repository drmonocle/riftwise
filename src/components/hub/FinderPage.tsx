/**
 * Game finder: every game of a league's year (hub/champgames/<league>/<year>.json), narrowed by tournament, patch,
 * team, opponent, side, result, champions (with / against / banned), player and game length. Conditions are about
 * one side of the game ("T1 on red with Azir against Orianna, and lost"); a game matches when either side does.
 * Filters live in the address: /riftwise/stats/finder?league=lck&year=2026&team=T1&champ=Azir
 */
import React, { useMemo, useRef, useState } from "react";
import { tl, tn } from "../../i18n";
import { champName } from "../../champions";
import { loadChampGames, loadChampIndex } from "../../hub/data";
import type { ChampGame, ChampPick } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { patchCompare } from "../../hub/champAgg";
import { TableExport } from "./SortTable";
import {
  card,
  ChampIcon,
  fmtDate,
  fmtNum,
  HubLink,
  isFresh,
  Loading,
  Failed,
  RevealButton,
  td,
  th,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";

const sel =
  "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text max-w-[12rem]";
const num =
  "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text w-16";
type Q = URLSearchParams;
type SetQ = (p: Record<string, string | undefined>) => void;

/** The side of `g` that meets every condition (0 blue, 1 red), or -1. */
function matchSide(g: ChampGame, q: Q, eventIdx: number | null): number {
  if (eventIdx != null && g[2] !== eventIdx) return -1;
  const patch = q.get("patch");
  if (patch && g[1] !== patch) return -1;
  const minLen = Number(q.get("min") || 0);
  const maxLen = Number(q.get("max") || 0);
  if (minLen && (g[4] == null || g[4] < minLen)) return -1;
  if (maxLen && (g[4] == null || g[4] > maxLen)) return -1;
  const ban = q.get("ban");
  if (ban && !g[7].includes(ban) && !g[8].includes(ban)) return -1;
  const team = q.get("team");
  const vs = q.get("vs");
  const side = q.get("side");
  const result = q.get("result");
  const champs = (q.get("champ") || "").split(",").filter(Boolean);
  const vsChamp = q.get("vschamp");
  const player = q.get("player");
  for (const s of [0, 1]) {
    const mine = s === 0 ? g[5] : g[6];
    const theirs = s === 0 ? g[6] : g[5];
    const myTeam = s === 0 ? g[10] : g[11];
    const theirTeam = s === 0 ? g[11] : g[10];
    const won = s === 0 ? g[3] === 1 : g[3] === 0;
    if (team && myTeam !== team) continue;
    if (vs && theirTeam !== vs) continue;
    if (side && side !== (s === 0 ? "b" : "r")) continue;
    if (result && (result === "w") !== won) continue;
    if (champs.some((c) => !mine.some((p) => p[0] === c))) continue;
    if (vsChamp && !theirs.some((p) => p[0] === vsChamp)) continue;
    if (player && !mine.some((p) => p[9] === player || p[8] === player))
      continue;
    return s;
  }
  return -1;
}

export const FinderPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Game finder"));
  useDDragon();
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const setQ: SetQ = (patch) => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    navigateHub({ kind: "finder", query: next.toString() }, { replace: true });
  };
  const index = useLoad(loadChampIndex, []);
  const leagues = index.data || [];
  const league = q.get("league") || leagues.find((l) => l.pr)?.u || "";
  const years = Object.keys(leagues.find((l) => l.u === league)?.y || {})
    .sort()
    .reverse();
  const year =
    q.get("year") && years.includes(q.get("year")!)
      ? q.get("year")!
      : years[0] || "";
  const file = useLoad(
    () =>
      league && year
        ? loadChampGames(league, year)
        : Promise.reject(new Error("no league")),
    [league, year],
  );

  if (index.error) return <Failed />;
  if (!index.data) return <Loading />;
  const main = leagues.filter((l) => l.pr);
  const other = leagues.filter(
    (l) => !l.pr && Object.values(l.y).reduce((s, n) => s + n, 0) >= 100,
  );
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-2 text-xs`}>
        <h2 className="text-base font-bold text-rw-text">
          {tl("Game finder")}
        </h2>
        <p className="text-rw-sub">
          {tl(
            'Find games by team, champion, player, side, result, patch and length. Conditions are about one team in the game: "T1 on red with Azir, against Orianna, lost".',
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={league}
            onChange={(e) =>
              setQ({
                league: e.target.value,
                year: undefined,
                event: undefined,
                patch: undefined,
              })
            }
            aria-label={tl("League")}
            className={sel}
          >
            <optgroup label={tl("Leagues")}>
              {main.map((l) => (
                <option key={l.u} value={l.u}>
                  {l.l}
                </option>
              ))}
            </optgroup>
            {other.length > 0 && (
              <optgroup label={tl("Other leagues")}>
                {other.map((l) => (
                  <option key={l.u} value={l.u}>
                    {l.l}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select
            value={year}
            onChange={(e) =>
              setQ({ year: e.target.value, event: undefined, patch: undefined })
            }
            aria-label={tl("Year")}
            className={sel}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {q.toString().replace(/(^|&)(league|year)=[^&]*/g, "") !== "" && (
            <button
              type="button"
              onClick={() =>
                navigateHub(
                  {
                    kind: "finder",
                    query: new URLSearchParams({ league, year }).toString(),
                  },
                  { replace: true },
                )
              }
              className="text-rw-teal hover:underline"
            >
              {tl("Clear filters")}
            </button>
          )}
        </div>
      </div>
      {file.error ? (
        <Failed />
      ) : !file.data ? (
        <Loading />
      ) : (
        <FinderBody
          games={file.data.games}
          events={file.data.events}
          q={q}
          setQ={setQ}
          name={`riftwise-games-${league}-${year}`}
        />
      )}
    </div>
  );
};

const FinderBody: React.FC<{
  games: ChampGame[];
  events: [string, string][];
  q: Q;
  setQ: SetQ;
  name: string;
}> = ({ games, events, q, setQ, name }) => {
  const opts = useMemo(() => {
    const teams = new Set<string>();
    const champs = new Set<string>();
    const players = new Map<string, string>(); // slug or name -> name
    const patches = new Set<string>();
    for (const g of games) {
      if (g[10]) teams.add(g[10]);
      if (g[11]) teams.add(g[11]);
      if (g[1]) patches.add(g[1]);
      for (const p of [...g[5], ...g[6]]) {
        champs.add(p[0]);
        if (p[8]) players.set(p[9] || p[8], p[8]);
      }
      for (const c of [...g[7], ...g[8]]) champs.add(c);
    }
    const byName = (a: string, b: string) => a.localeCompare(b);
    return {
      teams: [...teams].sort(byName),
      champs: [...champs].sort((a, b) =>
        champName(a).localeCompare(champName(b)),
      ),
      players: [...players.entries()].sort((a, b) => byName(a[1], b[1])),
      patches: [...patches].sort(patchCompare),
    };
  }, [games]);
  const eventSlug = q.get("event");
  const eventIdx = eventSlug ? events.findIndex(([s]) => s === eventSlug) : -1;
  const found = useMemo(() => {
    const out: { g: ChampGame; s: number }[] = [];
    for (const g of games) {
      const s = matchSide(g, q, eventIdx >= 0 ? eventIdx : null);
      if (s >= 0) out.push({ g, s });
    }
    return out.sort((a, b) => (a.g[0] < b.g[0] ? 1 : a.g[0] > b.g[0] ? -1 : 0));
  }, [games, q, eventIdx]);
  const [limit, setLimit] = useState(100);
  const tableRef = useRef<HTMLTableElement>(null);
  const won = found.filter(({ g, s }) =>
    s === 0 ? g[3] === 1 : g[3] === 0,
  ).length;
  const mins = found.map(({ g }) => g[4]).filter((m): m is number => m != null);
  const avg = mins.length
    ? mins.reduce((a, b) => a + b, 0) / mins.length
    : null;
  const newest = found[0]?.g[0];
  const [hidden, reveal] = useHidden(
    `finder:${q.toString()}`,
    newest && isFresh(newest) ? newest : undefined,
  );
  const sideCond = !!(
    q.get("team") ||
    q.get("vs") ||
    q.get("side") ||
    q.get("result") ||
    q.get("champ") ||
    q.get("vschamp") ||
    q.get("player")
  );

  const champSel = (
    label: string,
    list: string[],
    value: string,
    onChange: (v: string) => void,
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={sel}
    >
      <option value="">{label}</option>
      {list.map((c) => (
        <option key={c} value={c}>
          {champName(c)}
        </option>
      ))}
    </select>
  );
  const champs = (q.get("champ") || "").split(",").filter(Boolean);
  const setChamp = (i: number, v: string) => {
    const next = [...champs];
    if (v) next[i] = v;
    else next.splice(i, 1);
    setQ({ champ: next.filter(Boolean).join(",") || undefined });
  };

  return (
    <>
      <div className={`${card} space-y-2 text-xs`}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={eventSlug || ""}
            onChange={(e) => setQ({ event: e.target.value || undefined })}
            aria-label={tl("Tournaments")}
            className={sel}
          >
            <option value="">{tl("All tournaments")}</option>
            {events.map(([slug, n]) => (
              <option key={slug} value={slug}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={q.get("patch") || ""}
            onChange={(e) => setQ({ patch: e.target.value || undefined })}
            aria-label={tl("Patches")}
            className={sel}
          >
            <option value="">{tl("All patches")}</option>
            {opts.patches.map((p) => (
              <option key={p} value={p}>
                {tl("Patch {patch}", { patch: p })}
              </option>
            ))}
          </select>
          {champSel(tl("Banned: any"), opts.champs, q.get("ban") || "", (v) =>
            setQ({ ban: v || undefined }),
          )}
          <span className="flex items-center gap-1 text-rw-sub">
            {tl("Length (min)")}
            <input
              type="number"
              min={0}
              value={q.get("min") || ""}
              onChange={(e) => setQ({ min: e.target.value || undefined })}
              placeholder={tl("from")}
              aria-label={tl("Shortest game (minutes)")}
              className={num}
            />
            <input
              type="number"
              min={0}
              value={q.get("max") || ""}
              onChange={(e) => setQ({ max: e.target.value || undefined })}
              placeholder={tl("to")}
              aria-label={tl("Longest game (minutes)")}
              className={num}
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rw-border">
          <span className="text-[10px] uppercase tracking-wider font-bold text-rw-accent">
            {tl("One team in the game")}
          </span>
          <select
            value={q.get("team") || ""}
            onChange={(e) => setQ({ team: e.target.value || undefined })}
            aria-label={tl("Team")}
            className={sel}
          >
            <option value="">{tl("Team: any")}</option>
            {opts.teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={q.get("vs") || ""}
            onChange={(e) => setQ({ vs: e.target.value || undefined })}
            aria-label={tl("Opponent")}
            className={sel}
          >
            <option value="">{tl("Against: anyone")}</option>
            {opts.teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={q.get("side") || ""}
            onChange={(e) => setQ({ side: e.target.value || undefined })}
            aria-label={tl("Side")}
            className={sel}
          >
            <option value="">{tl("Both sides")}</option>
            <option value="b">{tl("Blue side")}</option>
            <option value="r">{tl("Red side")}</option>
          </select>
          <select
            value={q.get("result") || ""}
            onChange={(e) => setQ({ result: e.target.value || undefined })}
            aria-label={tl("Result")}
            className={sel}
          >
            <option value="">{tl("Won or lost")}</option>
            <option value="w">{tl("Won")}</option>
            <option value="l">{tl("Lost")}</option>
          </select>
          <select
            value={q.get("player") || ""}
            onChange={(e) => setQ({ player: e.target.value || undefined })}
            aria-label={tl("Player")}
            className={sel}
          >
            <option value="">{tl("Player: any")}</option>
            {opts.players.map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
          {champSel(tl("With champion"), opts.champs, champs[0] || "", (v) =>
            setChamp(0, v),
          )}
          {champs.length > 0 &&
            champSel(tl("and champion"), opts.champs, champs[1] || "", (v) =>
              setChamp(1, v),
            )}
          {champSel(
            tl("Against champion"),
            opts.champs,
            q.get("vschamp") || "",
            (v) => setQ({ vschamp: v || undefined }),
          )}
        </div>
      </div>

      <div className={`${card} space-y-2`}>
        <p className="text-xs text-rw-text">
          {tn("{n} game", "{n} games", found.length, {
            n: fmtNum(found.length),
          })}
          {found.length > 0 && sideCond && !hidden && (
            <span className="text-rw-sub">
              {" · "}
              {tl("won {w}, lost {l} ({pct})", {
                w: won,
                l: found.length - won,
                pct: `${Math.round((won / found.length) * 100)}%`,
              })}
            </span>
          )}
          {avg != null && (
            <span className="text-rw-sub">
              {" "}
              · {tl("average {n} min", { n: avg.toFixed(1) })}
            </span>
          )}
        </p>
        {hidden ? (
          <div className="py-2 text-center">
            <RevealButton onReveal={reveal} />
          </div>
        ) : found.length > 0 ? (
          <>
            <TableExport tableRef={tableRef} name={name} />
            <div className="overflow-x-auto">
              <table ref={tableRef} className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={th}>{tl("Date")}</th>
                    <th className={th}>{tl("Tournament")}</th>
                    <th className={th}>{tl("Blue")}</th>
                    <th className={th}>{tl("Red")}</th>
                    <th className={th}>{tl("Winner")}</th>
                    <th className={th}>{tl("Patch")}</th>
                    <th className={th}>{tl("Min")}</th>
                    <th className={th}>{tl("Blue picks")}</th>
                    <th className={th}>{tl("Red picks")}</th>
                  </tr>
                </thead>
                <tbody>
                  {found.slice(0, limit).map(({ g, s }, i) => (
                    <tr
                      key={`${g[0]}-${g[14] || i}-${g[15] || 0}-${i}`}
                      className="border-t border-rw-border"
                    >
                      <td className={`${td} text-rw-sub`}>
                        {g[14] ? (
                          <HubLink
                            to={{ kind: "match", slug: g[14] }}
                            className="hover:text-rw-accent hover:underline"
                          >
                            {fmtDate(g[0])}
                            {g[15] ? ` · G${g[15]}` : ""}
                          </HubLink>
                        ) : (
                          fmtDate(g[0])
                        )}
                      </td>
                      <td
                        className={`${td} text-rw-muted max-w-[12rem] truncate`}
                      >
                        {events[g[2]]?.[1] || ""}
                      </td>
                      <TeamCell
                        name={g[10]}
                        u={g[12]}
                        focus={sideCond && s === 0}
                        won={g[3] === 1}
                      />
                      <TeamCell
                        name={g[11]}
                        u={g[13]}
                        focus={sideCond && s === 1}
                        won={g[3] === 0}
                      />
                      <td className={`${td} font-semibold text-rw-text`}>
                        {(g[3] === 1 ? g[10] : g[11]) ||
                          (g[3] === 1 ? tl("Blue") : tl("Red"))}
                      </td>
                      <td className={`${td} text-rw-sub`}>{g[1]}</td>
                      <td className={`${td} text-rw-sub tabular-nums`}>
                        {g[4] != null ? g[4].toFixed(1) : ""}
                      </td>
                      <Picks list={g[5]} />
                      <Picks list={g[6]} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {found.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + 200)}
                className="text-xs text-rw-teal hover:underline"
              >
                {tl("Show more ({n} left)", { n: found.length - limit })}
              </button>
            )}
            <p className="text-[10px] text-rw-muted">
              {tl(
                "Copy and CSV take the games shown; show more first to include them all.",
              )}
            </p>
          </>
        ) : (
          <p className="text-xs text-rw-sub">
            {tl("No games match. Try fewer filters.")}
          </p>
        )}
      </div>
    </>
  );
};

const TeamCell: React.FC<{
  name?: string;
  u?: string | null;
  focus: boolean;
  won: boolean;
}> = ({ name, u, focus, won }) => (
  <td
    className={`${td} ${won ? "text-rw-text font-semibold" : "text-rw-sub"} ${focus ? "underline decoration-rw-accent decoration-2 underline-offset-4" : ""}`}
  >
    {u ? (
      <HubLink to={{ kind: "team", slug: u }} className="hover:text-rw-accent">
        {name}
      </HubLink>
    ) : (
      name || "–"
    )}
  </td>
);

const Picks: React.FC<{ list: ChampPick[] }> = ({ list }) => (
  <td className={td}>
    <span className="flex gap-0.5">
      {list.map((p, i) => (
        <span
          key={`${p[0]}-${i}`}
          title={p[8] ? `${p[8]}: ${champName(p[0])}` : champName(p[0])}
        >
          <ChampIcon name={p[0]} size={20} />
        </span>
      ))}
    </span>
  </td>
);
