/**
 * Match overview: a quick look at an upcoming or live match from the Live and Schedule tabs, without leaving them.
 * Ranks, win chances (this match's best-of first), each team's last five series, the head-to-head and the top
 * storylines, plus Match prep's 16:9 overview card. Loaded only when someone opens it.
 */
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, X } from "lucide-react";
import type { Match } from "../../types";
import { tl, tc } from "../../i18n";
import { loadHubTeam, loadRatings, loadTeamSeries } from "../../hub/data";
import type { TeamSeriesRow } from "../../hub/types";
import { pct } from "../../hub/winChance";
import { navigateHub } from "../../hub/route";
import { Change } from "./RankingsPage";
import { chancesOf, prepLines, rankText, type Side } from "./PrepPage";
import { BroadcastCardButton, prepOverviewCard } from "./BroadcastCard";
import { isFresh, Loading, RevealButton, useHidden, useLoad } from "./ui";

const lastSeries = (s: Side, n: number) => [...s.series].sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, n);

async function loadLite(slug: string): Promise<Side> {
  const [team, series] = await Promise.all([loadHubTeam(slug), loadTeamSeries(slug).catch(() => [] as TeamSeriesRow[])]);
  return { team, series, games: [], players: [] };
}

export const MatchOverview: React.FC<{ match: Match; a: string; b: string; onClose: () => void; onPrep: () => void }> = ({ match, a, b, onClose, onPrep }) => {
  const [sides, setSides] = useState<[Side, Side] | null | "failed">(null);
  useEffect(() => {
    let alive = true;
    Promise.all([loadLite(a), loadLite(b)])
      .then((x) => alive && setSides(x as [Side, Side]))
      .catch(() => alive && setSides("failed"));
    return () => {
      alive = false;
    };
  }, [a, b]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  // on top of everything (outside the match card), and clicks inside never reach the card under it
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tl("Match overview")}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-rw-surface border border-rw-border rounded-xl p-4 space-y-3 text-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-rw-accent">
            {tl("Match overview")} · {match.leagueName} · {tc("short best of", "Bo{n}", { n: match.bestOf })}
          </h3>
          <button type="button" onClick={onClose} aria-label={tl("Close")} className="p-1 text-rw-muted hover:text-rw-text">
            <X className="w-4 h-4" />
          </button>
        </div>
        {sides === "failed" ? (
          <p className="text-rw-sub text-center py-4">{tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>
        ) : !sides ? (
          <Loading />
        ) : (
          <Body x={sides[0]} y={sides[1]} match={match} onPrep={onPrep} />
        )}
      </div>
    </div>,
    document.body,
  );
};

const Body: React.FC<{ x: Side; y: Side; match: Match; onPrep: () => void }> = ({ x, y, match, onPrep }) => {
  const ratings = useLoad(loadRatings, []);
  const chances = chancesOf(x.team, y.team, ratings.data);
  // this match's best-of first: one game, best of 3 or best of 5
  const mine = match.bestOf >= 5 ? 2 : match.bestOf >= 3 ? 1 : 0;
  // recent results are spoilers: the same rule (and the same reveal) as Match prep's form
  const fresh = [...lastSeries(x, 10), ...lastSeries(y, 10)].map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`prep-form:${x.team.u}:${y.team.u}`, fresh);
  const meetings = x.series.filter((r) => r[2] === y.team.u);
  const h2hWins = meetings.filter((r) => r[3] > r[4]).length;
  const lines = useMemo(() => prepLines(x, y), [x, y]);
  const last = lines.find((l) => l.key === "last" || l.key === "first");
  const stories = lines
    .filter((l) => l.key !== "h2h" && l.key !== "last" && l.key !== "first" && (typeof l.text === "string" || typeof l.text === "number"))
    .map((l) => (l.who ? `${l.who.name}: ${l.text}` : String(l.text)));
  const card = () =>
    prepOverviewCard({
      a: { name: x.team.name, rank: rankText(x.team), chg: x.team.rating?.chg30, form: hidden ? [] : lastSeries(x, 10).map((r) => r[3] > r[4]) },
      b: { name: y.team.name, rank: rankText(y.team), chg: y.team.rating?.chg30, form: hidden ? [] : lastSeries(y, 10).map((r) => r[3] > r[4]) },
      chances: chances || [],
      h2h: !hidden && meetings.length ? [h2hWins, meetings.length - h2hWins] : null,
      stories: hidden ? [] : stories,
      period: match.leagueName,
    });
  const team = (s: Side, right: boolean) => (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`text-sm font-extrabold truncate ${right ? "text-rw-red" : "text-rw-teal"}`}>{s.team.name}</div>
      {s.team.rating && (
        <div className="text-[11px] text-rw-sub">
          {rankText(s.team)} · <Change v={s.team.rating.chg30} /> {tl("in 30 days")}
        </div>
      )}
      {!hidden && (
        <div className={`flex gap-1 mt-1 ${right ? "justify-end" : ""}`} aria-label={tl("Last 5 series")}>
          {lastSeries(s, 5).map((r, i) => {
            const won = r[3] > r[4];
            return (
              <span
                key={i}
                title={`${won ? tl("Won") : tl("Lost")} ${r[3]}-${r[4]}`}
                className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center border ${won ? "border-rw-teal text-rw-teal" : "border-rw-red text-rw-red"}`}
              >
                {won ? tc("short result", "W") : tc("short result", "L")}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {team(x, false)}
        {team(y, true)}
      </div>
      {chances && (
        <div className="space-y-1.5">
          {[chances[mine], ...chances.filter((_, i) => i !== mine)].map(([label, p], i) => (
            <div key={label} className={`grid grid-cols-[3rem_1fr_3rem] items-center gap-2 ${i === 0 ? "" : "opacity-70"}`}>
              <span className="tabular-nums font-bold text-rw-teal">{pct(p)}</span>
              <div className={`relative rounded bg-rw-red/70 overflow-hidden ${i === 0 ? "h-5" : "h-3.5"}`}>
                <div className="absolute inset-y-0 left-0 bg-rw-teal/80" style={{ width: `${p * 100}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-rw-text font-semibold">
                  {label}
                  {i === 0 ? ` · ${tl("this match")}` : ""}
                </span>
              </div>
              <span className="tabular-nums font-bold text-rw-red text-right">{pct(1 - p)}</span>
            </div>
          ))}
        </div>
      )}
      {hidden ? (
        <div className="text-center py-1">
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex justify-between gap-2 border-t border-rw-border pt-2">
            <span className="text-rw-sub">{tl("Head to head (series)")}</span>
            <span className="font-bold tabular-nums">
              {meetings.length ? (
                <>
                  <span className="text-rw-teal">{h2hWins}</span> – <span className="text-rw-red">{meetings.length - h2hWins}</span>
                </>
              ) : (
                "–"
              )}
            </span>
          </div>
          {last && <p className="text-[11px] text-rw-sub">{last.text}</p>}
          {stories.length > 0 && (
            <ul className="space-y-1 border-t border-rw-border pt-2">
              {stories.slice(0, 3).map((t, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-rw-accent">•</span>
                  <span className="text-rw-text">{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rw-border pt-3">
        <button
          type="button"
          onClick={onPrep}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          {tl("Full match prep")}
        </button>
        <BroadcastCardButton data={card} name={`${x.team.name}-vs-${y.team.name}-overview`} label={tl("Overview card")} />
      </div>
    </>
  );
};
