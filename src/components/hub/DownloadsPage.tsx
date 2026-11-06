/**
 * Data downloads: every pro game as CSV (one row per player and one per team, like Oracle's Elixir), per tournament,
 * or a league's whole year joined in the browser from its tournaments. Free; credit RiftWise and Leaguepedia.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { tl, tn } from "../../i18n";
import { load, loadText, statsFileUrl } from "../../stats";
import { IS_WEB, SITE_URL } from "../../platform";
import { navigateHub } from "../../hub/route";
import { card, Failed, fmtNum, Loading, Section, useLoad, usePageTitle } from "./ui";

interface DownloadLeague {
  u: string;
  l: string;
  r: string | null;
  pr: number;
  g: number;
  /** year -> [event slug, name, games, start date] */
  y: Record<string, [string, string, number, string][]>;
}

const loadDownloads = () => load<DownloadLeague[]>("hub/csv/index.json");

/** Save text as a file (web), or open the file's address in the browser (desktop app). */
export async function saveCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One tournament's CSV: downloaded on the web, opened in the browser from the desktop app. */
export async function downloadEventCsv(slug: string, onOpenUrl?: (url: string) => void) {
  if (!IS_WEB && onOpenUrl) {
    onOpenUrl(await statsFileUrl(`hub/csv/${slug}.csv`));
    return;
  }
  await saveCsv(`${slug}.csv`, await loadText(`hub/csv/${slug}.csv`));
}

/** Join multiple tournament CSV files in the browser (up to 6 at a time), keeping the header row once. */
async function joinCsvs(slugs: string[], onProgress?: (done: number, total: number) => void): Promise<string> {
  const raw = new Array<string>(slugs.length).fill("");
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < slugs.length) {
      const idx = next++;
      raw[idx] = await loadText(`hub/csv/${slugs[idx]}.csv`);
      done++;
      onProgress?.(done, slugs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, slugs.length) }, () => worker()));
  const parts: string[] = [];
  for (const text of raw) {
    if (!text) continue;
    parts.push(parts.length === 0 ? text.replace(/\n+$/, "") : text.slice(text.indexOf("\n") + 1).replace(/\n+$/, ""));
  }
  return parts.length ? parts.join("\n") + "\n" : "";
}

/** A whole event's CSV (Worlds = Play-In + Main Event): its stages' files in one, the header once. */
export async function downloadStagesCsv(name: string, slugs: string[], onOpenUrl?: (url: string) => void) {
  if (!IS_WEB && onOpenUrl) {
    onOpenUrl(`${SITE_URL}stats/data`);
    return;
  }
  const csv = await joinCsvs(slugs).catch(() => "");
  if (csv) await saveCsv(`${name}.csv`, csv);
}

export const CSV_COLUMNS =
  "date, league, tournament, stage, patch, series, game, url, side, position (top / jungle / mid / bot / support / team), player, team, opponent, champion, pick_order, result, length_sec, kills, deaths, assists, team_kills, team_deaths, cs, gold, damage, vision, dragons, opp_dragons, barons, opp_barons, towers, opp_towers, heralds, void_grubs, ban1-5, pick1-5";

export const DownloadsPage: React.FC<{ onOpenUrl?: (url: string) => void; query?: string }> = ({ onOpenUrl, query }) => {
  usePageTitle(tl("Data downloads"));
  const state = useLoad(loadDownloads, []);
  const params = useMemo(() => new URLSearchParams(query || ""), [query]);
  const qLeague = (params.get("league") || "").toLowerCase();
  const qYear = params.get("year") || "";
  const [league, setLeague] = useState(qLeague);
  const [yearPick, setYearPick] = useState(qYear);
  useEffect(() => {
    if (qLeague) setLeague(qLeague);
    if (qYear) setYearPick(qYear);
  }, [qLeague, qYear]);
  const syncUrl = (nextLeague: string, nextYear: string) => {
    const p = new URLSearchParams();
    if (nextLeague) p.set("league", nextLeague);
    if (nextYear) p.set("year", nextYear);
    navigateHub({ kind: "data", ...(p.toString() ? { query: p.toString() } : {}) }, { replace: true });
  };
  const list = state.data || [];
  const main = list.filter((l) => l.u && l.pr);
  const other = list.filter((l) => !l.pr || !l.u);
  const cur = list.find((l) => l.u === (league || main[0]?.u)) || main[0] || null;
  return (
    <div className="space-y-3 text-xs">
      <div className={`${card} space-y-2`}>
        <p className="text-rw-text font-semibold">{tl("Every pro game as a spreadsheet (CSV), free.")}</p>
        <p className="text-rw-sub">
          {tl("One row per player and one per team for every game, with the champion, pick order, K/D/A, CS, gold, damage, vision, objectives, bans and picks. Opens in Excel, Google Sheets, Python or R.")}
        </p>
        <p className="text-rw-sub">{tl("Free to use. Please credit RiftWise (riftwise.gg) and Leaguepedia (CC BY-SA 3.0).")}</p>
        {!IS_WEB && (
          <button
            type="button"
            onClick={() => onOpenUrl?.(`${SITE_URL}stats/data`)}
            className="text-rw-accent hover:underline font-semibold"
          >
            {tl("Downloads work best in your browser: open this page there")}
          </button>
        )}
      </div>
      {state.loading ? (
        <Loading />
      ) : !state.data ? (
        <Failed />
      ) : (
        <>
          <YearDownloads
            leagues={list}
            year={yearPick}
            onYear={(y) => {
              setYearPick(y);
              syncUrl(league, y);
            }}
            onOpenUrl={onOpenUrl}
          />
          <select
            value={cur?.u || ""}
            onChange={(e) => {
              setLeague(e.target.value);
              syncUrl(e.target.value, yearPick);
            }}
            aria-label={tl("Leagues")}
            className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text max-w-full"
          >
            <optgroup label={tl("Leagues")}>
              {main.map((l) => (
                <option key={l.u} value={l.u}>
                  {l.l} ({fmtNum(l.g)})
                </option>
              ))}
            </optgroup>
            <optgroup label={tl("Other leagues")}>
              {other
                .filter((l) => l.u)
                .map((l) => (
                  <option key={l.u} value={l.u}>
                    {l.l || l.u} ({fmtNum(l.g)})
                  </option>
                ))}
            </optgroup>
          </select>
          {cur && <LeagueYears league={cur} initialYear={qYear} onOpenUrl={onOpenUrl} />}
          <Section title={tl("Columns")}>
            <p className="font-mono text-[11px] text-rw-sub break-words">{CSV_COLUMNS}</p>
            <p className="text-[10px] text-rw-muted">
              {tl("Team rows have position \"team\" and carry the objectives, bans and picks; player rows carry the player's numbers. Empty means not recorded.")}
            </p>
          </Section>
          <Section title={tl("The data behind the pages (JSON)")} id="json">
            <p className="text-xs text-rw-sub">
              {tl("Every stats page reads plain JSON files you can read too. Please credit RiftWise (riftwise.gg) when you use them, and ask for a whole year as CSV above rather than fetching thousands of files.")}
            </p>
            <ul className="font-mono text-[11px] text-rw-sub space-y-0.5 break-words">
              <li>
                <span className="text-rw-text">{SITE_URL}stats/latest.json</span> {tl("→ the current build's version")}
              </li>
              <li>
                <span className="text-rw-text">{SITE_URL}stats/&lt;version&gt;/hub/</span>player/&lt;slug&gt;.json · team/&lt;slug&gt;.json · event/&lt;slug&gt;.json · game/&lt;id&gt;.json · league/&lt;slug&gt;.json · champ/&lt;slug&gt;.json
              </li>
              <li>…/hub/ratings.json · records.json · leagues.json · search/teams.json · search/players.json · csv/index.json</li>
              <li>…/hub/playergames/&lt;slug&gt;.json · teamgames/&lt;slug&gt;.json · leagueyear/&lt;league&gt;/&lt;year&gt;.json · lines/&lt;event&gt;.json</li>
            </ul>
            <p className="text-[10px] text-rw-muted">
              {tl("Slugs are the ones in the page addresses (/player/faker, /team/t1). Files change only when a new build lands (a few times a day), so cache them by version.")}
            </p>
          </Section>
        </>
      )}
    </div>
  );
};

/** Whole-year bulk CSV across main leagues or all leagues, so researchers can grab an entire year in one click. */
const YearDownloads: React.FC<{
  leagues: DownloadLeague[];
  year: string;
  onYear: (y: string) => void;
  onOpenUrl?: (url: string) => void;
}> = ({ leagues, year, onYear, onOpenUrl }) => {
  const allYears = useMemo(() => {
    const s = new Set<string>();
    for (const l of leagues) for (const y of Object.keys(l.y)) if (/^\d{4}$/.test(y)) s.add(y);
    return [...s].sort().reverse();
  }, [leagues]);
  const activeYear = (year && allYears.includes(year) ? year : allYears[0]) || "";
  const { mainEvs, mainGames, allEvs, allGames } = useMemo(() => {
    const collect = (onlyMain: boolean) => {
      const seen = new Map<string, [string, string, number, string]>();
      for (const l of leagues) {
        if (!l.u || (onlyMain && !l.pr)) continue;
        for (const e of l.y[activeYear] || []) {
          if (!seen.has(e[0])) seen.set(e[0], e);
        }
      }
      const evs = [...seen.values()].sort((a, b) => (a[3] || "").localeCompare(b[3] || "") || a[0].localeCompare(b[0]));
      return { evs, games: evs.reduce((s, e) => s + e[2], 0) };
    };
    const m = collect(true);
    const a = collect(false);
    return { mainEvs: m.evs, mainGames: m.games, allEvs: a.evs, allGames: a.games };
  }, [leagues, activeYear]);
  const [busy, setBusy] = useState("");
  const runYear = async (label: string, evs: [string, string, number, string][]) => {
    if (!IS_WEB && onOpenUrl) {
      onOpenUrl(`${SITE_URL}stats/data?year=${encodeURIComponent(activeYear)}`);
      return;
    }
    try {
      const csv = await joinCsvs(
        evs.map((e) => e[0]),
        (n, m) => setBusy(tl("Downloading {n} of {m}…", { n, m })),
      );
      if (csv) await saveCsv(`${label}-${activeYear}.csv`, csv);
      setBusy("");
    } catch {
      setBusy(tl("Download failed. Try again in a minute."));
    }
  };
  if (!activeYear) return null;
  return (
    <div className={`${card} space-y-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-rw-text">{tl("Whole year (CSV)")}</h3>
          <select
            value={activeYear}
            onChange={(e) => onYear(e.target.value)}
            aria-label={tl("Year")}
            className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-xs font-semibold text-rw-text"
          >
            {allYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {busy && <span className="text-[11px] text-rw-accent">{busy}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {mainEvs.length > 0 && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => runYear("riftwise-main", mainEvs)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rw-accent/40 bg-rw-accent/10 text-rw-accent hover:border-rw-accent font-semibold disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {tl("Main leagues")} {activeYear} ({tn("{n} game", "{n} games", mainGames)})
            </span>
          </button>
        )}
        {allEvs.length > 0 && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => runYear("riftwise-all", allEvs)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rw-border text-rw-text hover:border-rw-accent disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-rw-accent" />
            <span>
              {tl("Every league")} {activeYear} ({tn("{n} game", "{n} games", allGames)})
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

const LeagueYears: React.FC<{ league: DownloadLeague; initialYear?: string; onOpenUrl?: (url: string) => void }> = ({ league, initialYear, onOpenUrl }) => {
  const years = useMemo(() => Object.keys(league.y).sort().reverse(), [league]);
  const [open, setOpen] = useState<string | null>(initialYear || null);
  useEffect(() => {
    if (initialYear && league.y[initialYear]) setOpen(initialYear);
  }, [initialYear, league]);
  const [busy, setBusy] = useState<string>("");
  const wholeYear = async (y: string) => {
    if (!IS_WEB && onOpenUrl) {
      onOpenUrl(`${SITE_URL}stats/data?league=${encodeURIComponent(league.u)}&year=${encodeURIComponent(y)}`);
      return;
    }
    const evs = league.y[y];
    try {
      const csv = await joinCsvs(
        evs.map((e) => e[0]),
        (n, m) => setBusy(tl("Downloading {n} of {m}…", { n, m })),
      );
      if (csv) await saveCsv(`${league.u}-${y}.csv`, csv);
      setBusy("");
    } catch {
      setBusy(tl("Download failed. Try again in a minute."));
    }
  };
  return (
    <div className={`${card} space-y-1`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-rw-text">{league.l || league.u}</h3>
        {busy && <span className="text-[11px] text-rw-accent">{busy}</span>}
      </div>
      {years.map((y) => {
        const evs = league.y[y];
        const games = evs.reduce((s, e) => s + e[2], 0);
        return (
          <div key={y} className="border-t border-rw-border py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => setOpen(open === y ? null : y)} className="text-left">
                <span className="font-bold text-rw-text">{y}</span>{" "}
                <span className="text-rw-muted">
                  · {tn("{n} game", "{n} games", games)} · {tn("{n} tournament", "{n} tournaments", evs.length)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => wholeYear(y)}
                className="flex items-center gap-1 px-2 py-1 rounded border border-rw-border text-rw-accent hover:border-rw-accent"
              >
                <Download className="w-3 h-3" />
                {tl("Whole year (CSV)")}
              </button>
            </div>
            {open === y && (
              <ul className="mt-1 space-y-0.5 pl-2">
                {evs.map(([slug, name, g]) => (
                  <li key={slug} className="flex items-center justify-between gap-2">
                    <span className="truncate text-rw-sub">
                      {name} <span className="text-rw-muted">· {tn("{n} game", "{n} games", g)}</span>
                    </span>
                    <button type="button" onClick={() => downloadEventCsv(slug, onOpenUrl)} className="text-rw-accent hover:underline shrink-0">
                      CSV
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
};
