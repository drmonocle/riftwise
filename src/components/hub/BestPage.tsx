/**
 * Best games: every pro game since 2011 rated 0-100 (MEPI, the catalog's game rating: action and pace, how close it
 * was, length, what was at stake, series drama, comebacks, rivalries), as a ranked list of games or of series,
 * all time or by year and league. Every row opens the match page at that game.
 * Address: /stats/best?view=series&year=2025&league=lol-champions-korea
 */
import React, { useMemo } from "react";
import { PlayCircle } from "lucide-react";
import { tl, tn } from "../../i18n";
import { loadBest, loadBestIndex } from "../../hub/data";
import type { BestGame, BestSeries } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { card, EventLink, Failed, fmtDate, HubLink, Loading, useHiddenCheck, useLoad, usePageTitle } from "./ui";

/** S 90+, A 80+, B 70+, C 55+, D below */
export function ratingTier(r: number): "S" | "A" | "B" | "C" | "D" {
  return r >= 90 ? "S" : r >= 80 ? "A" : r >= 70 ? "B" : r >= 55 ? "C" : "D";
}
const TIER_CLASS: Record<string, string> = {
  S: "bg-amber-400/20 text-amber-300 border-amber-400/50",
  A: "bg-rw-accent/20 text-rw-accent border-rw-accent/50",
  B: "bg-rw-teal/15 text-rw-teal border-rw-teal/40",
  C: "bg-rw-raised text-rw-sub border-rw-border",
  D: "bg-rw-raised text-rw-muted border-rw-border",
};

export const RatingBadge: React.FC<{ r: number; className?: string }> = ({ r, className = "" }) => {
  const t = ratingTier(r);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${TIER_CLASS[t]} ${className}`}
      title={tl("Game rating {r} of 100 (tier {t})", { r: r.toFixed(1), t })}
    >
      {r.toFixed(1)}
      <span className="opacity-70">{t}</span>
    </span>
  );
};

const sel = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text";
const tabBtn = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-semibold border ${on ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`;

export const BestPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Best games"));
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const view = q.get("view") === "series" ? "series" : "games";
  const league = q.get("league") || "";
  const index = useLoad(loadBestIndex, []);
  const lgRow = index.data?.leagues.find((l) => l[0] === league);
  const years = (lgRow ? lgRow[4] : index.data?.years) || [];
  const year = q.get("year") && years.includes(q.get("year")!) ? q.get("year")! : "";
  const file = useLoad(() => loadBest(year || undefined, league || undefined), [year, league]);
  const hiddenCheck = useHiddenCheck();

  const setQ = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    navigateHub({ kind: "best", query: next.toString() }, { replace: true });
  };

  const main = index.data?.leagues.filter((l) => l[3]) || [];
  const other = index.data?.leagues.filter((l) => !l[3]) || [];
  const rows: (BestGame | BestSeries)[] = (view === "series" ? file.data?.s : file.data?.g) || [];
  // spoiler mode: games of the last days stay off the list (their rating says how close they were)
  const shown = rows.filter((r) => !hiddenCheck("best", view === "series" ? (r as BestSeries)[2] : (r as BestGame)[3]));
  const held = rows.length - shown.length;

  return (
    <div className="space-y-3">
      <div className={card}>
        <h2 className="text-lg font-bold text-rw-text">{tl("Best games")}</h2>
        <p className="text-[11px] text-rw-sub mt-1 leading-relaxed">
          {tl(
            "Every pro game since 2011 rated from 0 to 100: action and pace, how close it was, its length, what was at stake (a Worlds final counts most), the series drama (a deciding game 5), comebacks and rivalries. A series is rated by its best game.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex gap-1.5" role="tablist">
            <button type="button" role="tab" aria-selected={view === "games"} className={tabBtn(view === "games")} onClick={() => setQ({ view: undefined })}>
              {tl("Games")}
            </button>
            <button type="button" role="tab" aria-selected={view === "series"} className={tabBtn(view === "series")} onClick={() => setQ({ view: "series" })}>
              {tl("Series")}
            </button>
          </div>
          <select value={year} onChange={(e) => setQ({ year: e.target.value })} aria-label={tl("Year")} className={sel}>
            <option value="">{tl("All time")}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select value={league} onChange={(e) => setQ({ league: e.target.value })} aria-label={tl("Leagues")} className={sel}>
            <option value="">{tl("All leagues")}</option>
            {main.length > 0 && (
              <optgroup label={tl("Main leagues")}>
                {main.map((l) => (
                  <option key={l[0]} value={l[0]}>
                    {l[2] && l[2] !== l[1] ? `${l[2]} · ${l[1]}` : l[1]}
                  </option>
                ))}
              </optgroup>
            )}
            {other.length > 0 && (
              <optgroup label={tl("Other leagues")}>
                {other.map((l) => (
                  <option key={l[0]} value={l[0]}>
                    {l[2] && l[2] !== l[1] ? `${l[2]} · ${l[1]}` : l[1]}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <p className="mt-2 text-[10px] text-rw-muted flex flex-wrap gap-x-2 gap-y-1 items-center">
          <span>{tl("Tiers:")}</span>
          {([95, 85, 75, 60, 40] as const).map((r) => (
            <span key={r} className="inline-flex items-center gap-1">
              <RatingBadge r={r} className="!py-0" />
              <span>{{ 95: "90+", 85: "80+", 75: "70+", 60: "55+", 40: tl("below 55") }[r]}</span>
            </span>
          ))}
        </p>
      </div>

      <div className={card}>
        {file.loading || index.loading ? (
          <Loading />
        ) : file.error ? (
          <Failed />
        ) : shown.length === 0 ? (
          <p className="text-xs text-rw-muted">{tl("No rated games here yet.")}</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <tbody>
                {shown.map((r, i) =>
                  view === "series" ? (
                    <SeriesRow key={r[1]} r={r as BestSeries} rank={i + 1} />
                  ) : (
                    <GameRow key={`${r[1]}-${r[2]}`} r={r as BestGame} rank={i + 1} />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        {held > 0 && (
          <p className="mt-2 text-[10px] text-rw-muted">
            {tn("{n} recent game is left out while spoiler mode is on.", "{n} recent games are left out while spoiler mode is on.", held)}
          </p>
        )}
      </div>
    </div>
  );
};

const Team: React.FC<{ name: string; won: boolean }> = ({ name, won }) => (
  <span className={won ? "font-bold text-rw-teal" : "text-rw-text"}>{name}</span>
);

const GameRow: React.FC<{ r: BestGame; rank: number }> = ({ r, rank }) => {
  const [rating, slug, n, date, en, eslug, stage, a, , b, , w, min, ka, kb, vod] = r;
  return (
    <tr className="border-t border-rw-border/60 first:border-t-0 hover:bg-rw-raised/50">
      <td className="py-2 pr-2 text-rw-muted tabular-nums w-8 text-right">{rank}</td>
      <td className="py-2 pr-3 w-16">
        <RatingBadge r={rating} />
      </td>
      <td className="py-2 pr-3 min-w-[12rem]">
        <HubLink to={{ kind: "match", slug, game: n }} className="hover:underline">
          <Team name={a} won={w === 1} /> <span className="text-rw-muted">vs</span> <Team name={b} won={w === 2} />
          <span className="text-rw-sub"> · {tl("Game {n}", { n })}</span>
        </HubLink>
        <div className="text-[10px] text-rw-muted mt-0.5 flex flex-wrap gap-x-2">
          {ka != null && kb != null && <span className="tabular-nums">{tl("{a}–{b} kills", { a: ka, b: kb })}</span>}
          {min ? <span className="tabular-nums">{tl("{n} min", { n: Math.round(min) })}</span> : null}
          {vod ? (
            <span className="inline-flex items-center gap-0.5 text-rw-sub">
              <PlayCircle className="w-3 h-3" /> {tl("VOD")}
            </span>
          ) : null}
        </div>
      </td>
      <td className="py-2 pr-3 min-w-[10rem]">
        <EventLink name={en} u={eslug} className="text-rw-sub hover:text-rw-accent hover:underline" />
        {stage && <div className="text-[10px] text-rw-muted">{stage}</div>}
      </td>
      <td className="py-2 pr-1 text-rw-muted whitespace-nowrap text-right">{fmtDate(date)}</td>
    </tr>
  );
};

const SeriesRow: React.FC<{ r: BestSeries; rank: number }> = ({ r, rank }) => {
  const [rating, slug, date, en, eslug, stage, a, , b, , wa, wb, bestN, games] = r;
  return (
    <tr className="border-t border-rw-border/60 first:border-t-0 hover:bg-rw-raised/50">
      <td className="py-2 pr-2 text-rw-muted tabular-nums w-8 text-right">{rank}</td>
      <td className="py-2 pr-3 w-16">
        <RatingBadge r={rating} />
      </td>
      <td className="py-2 pr-3 min-w-[12rem]">
        <HubLink to={{ kind: "match", slug }} className="hover:underline">
          <Team name={a} won={wa > wb} /> <span className="tabular-nums text-rw-text font-semibold">{wa}–{wb}</span>{" "}
          <Team name={b} won={wb > wa} />
        </HubLink>
        <div className="text-[10px] text-rw-muted mt-0.5">
          {tn("{n} game", "{n} games", games)} ·{" "}
          <HubLink to={{ kind: "match", slug, game: bestN }} className="hover:underline hover:text-rw-accent">
            {tl("best: game {n}", { n: bestN })}
          </HubLink>
        </div>
      </td>
      <td className="py-2 pr-3 min-w-[10rem]">
        <EventLink name={en} u={eslug} className="text-rw-sub hover:text-rw-accent hover:underline" />
        {stage && <div className="text-[10px] text-rw-muted">{stage}</div>}
      </td>
      <td className="py-2 pr-1 text-rw-muted whitespace-nowrap text-right">{fmtDate(date)}</td>
    </tr>
  );
};
