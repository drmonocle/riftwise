/**
 * Data downloads: every pro game as CSV (one row per player and one per team, like Oracle's Elixir), per tournament,
 * or a league's whole year joined in the browser from its tournaments. Free; credit RiftWise and Leaguepedia.
 */
import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { tl, tn } from "../../i18n";
import { load, loadText, statsFileUrl } from "../../stats";
import { IS_WEB } from "../../platform";
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

export const CSV_COLUMNS =
  "date, league, tournament, stage, patch, series, game, url, side, position (top / jungle / mid / bot / support / team), player, team, opponent, champion, pick_order, result, length_sec, kills, deaths, assists, team_kills, team_deaths, cs, gold, damage, vision, dragons, opp_dragons, barons, opp_barons, towers, opp_towers, heralds, void_grubs, ban1-5, pick1-5";

export const DownloadsPage: React.FC<{ onOpenUrl?: (url: string) => void }> = ({ onOpenUrl }) => {
  usePageTitle(tl("Data downloads"));
  const state = useLoad(loadDownloads, []);
  const [league, setLeague] = useState("");
  const list = state.data || [];
  const main = list.filter((l) => l.u && l.pr);
  const other = list.filter((l) => !l.pr || !l.u);
  const cur = list.find((l) => l.u === (league || main[0]?.u)) || null;
  return (
    <div className="space-y-3 text-xs">
      <div className={`${card} space-y-2`}>
        <p className="text-rw-text font-semibold">{tl("Every pro game as a spreadsheet (CSV), free.")}</p>
        <p className="text-rw-sub">
          {tl("One row per player and one per team for every game, with the champion, pick order, K/D/A, CS, gold, damage, vision, objectives, bans and picks. Opens in Excel, Google Sheets, Python or R.")}
        </p>
        <p className="text-rw-sub">{tl("Free to use. Please credit RiftWise (lolworlds.com/riftwise) and Leaguepedia (CC BY-SA 3.0).")}</p>
        {!IS_WEB && (
          <button
            type="button"
            onClick={() => onOpenUrl?.("https://lolworlds.com/riftwise/stats/data")}
            className="text-rw-teal hover:underline font-semibold"
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
          <select
            value={cur?.u || ""}
            onChange={(e) => setLeague(e.target.value)}
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
          {cur && <LeagueYears league={cur} onOpenUrl={onOpenUrl} />}
          <Section title={tl("Columns")}>
            <p className="font-mono text-[11px] text-rw-sub break-words">{CSV_COLUMNS}</p>
            <p className="text-[10px] text-rw-muted">
              {tl("Team rows have position \"team\" and carry the objectives, bans and picks; player rows carry the player's numbers. Empty means not recorded.")}
            </p>
          </Section>
        </>
      )}
    </div>
  );
};

const LeagueYears: React.FC<{ league: DownloadLeague; onOpenUrl?: (url: string) => void }> = ({ league, onOpenUrl }) => {
  const years = useMemo(() => Object.keys(league.y).sort().reverse(), [league]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>("");
  const wholeYear = async (y: string) => {
    if (!IS_WEB && onOpenUrl) {
      onOpenUrl("https://lolworlds.com/riftwise/stats/data");
      return;
    }
    const evs = league.y[y];
    const parts: string[] = [];
    try {
      for (let i = 0; i < evs.length; i++) {
        setBusy(tl("Downloading {n} of {m}…", { n: i + 1, m: evs.length }));
        const text = await loadText(`hub/csv/${evs[i][0]}.csv`);
        parts.push(i === 0 ? text.replace(/\n+$/, "") : text.slice(text.indexOf("\n") + 1).replace(/\n+$/, ""));
      }
      await saveCsv(`${league.u}-${y}.csv`, parts.filter(Boolean).join("\n") + "\n");
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
                className="flex items-center gap-1 px-2 py-1 rounded border border-rw-border text-rw-teal hover:border-rw-teal"
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
                    <button type="button" onClick={() => downloadEventCsv(slug, onOpenUrl)} className="text-rw-teal hover:underline shrink-0">
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
