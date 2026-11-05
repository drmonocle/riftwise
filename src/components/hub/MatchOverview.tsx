/**
 * Match overview: a quick look at an upcoming or live match from the Live and Schedule tabs, without leaving them.
 * Ranks, win chances (this match's best-of first), each team's last five series, the head-to-head and the top
 * storylines, plus Match prep's 16:9 overview card. Loaded only when someone opens it.
 */
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, X } from "lucide-react";
import type { Match } from "../../types";
import { tl, tc, roleName } from "../../i18n";
import { loadHubTeam, loadRatings, loadTeamSeries } from "../../hub/data";
import type { HubTeam, TeamSeriesRow } from "../../hub/types";
import { pct } from "../../hub/winChance";
import { navigateHub } from "../../hub/route";
import { Change } from "./RankingsPage";
import { chancesOf, prepLines, rankText, type Side } from "./PrepPage";
import { BroadcastCardButton, prepOverviewCard } from "./BroadcastCard";
import { fmtDate, isFresh, Loading, RevealButton, useHidden, useLoad } from "./ui";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
const ROLE_SHORT: Record<string, string> = { Top: "TOP", Jungle: "JGL", Mid: "MID", Bot: "BOT", Support: "SUP" };

export function teamStarter(t: HubTeam, role: string): { n: string; u: string } | null {
  const st = t.starters?.find((x) => x[2] === role);
  if (st && st[1]) return { n: st[0], u: st[1] };
  const p = (t.roster[0]?.p || []).filter((x) => x.r === role && x.u).sort((a, b) => b.g - a.g)[0];
  return p && p.u ? { n: p.n, u: p.u } : null;
}

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
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rw-text">
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
          <Body x={sides[0]} y={sides[1]} match={match} onClose={onClose} onPrep={onPrep} />
        )}
      </div>
    </div>,
    document.body,
  );
};

const Body: React.FC<{ x: Side; y: Side; match: Match; onClose: () => void; onPrep: () => void }> = ({ x, y, match, onClose, onPrep }) => {
  const ratings = useLoad(loadRatings, []);
  const chances = chancesOf(x.team, y.team, ratings.data);
  // this match's best-of first: one game, best of 3 or best of 5
  const mine = match.bestOf >= 5 ? 2 : match.bestOf >= 3 ? 1 : 0;
  // recent results are spoilers: the same rule (and the same reveal) as Match prep's form
  const fresh = [...lastSeries(x, 10), ...lastSeries(y, 10)].map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`prep-form:${x.team.u}:${y.team.u}`, fresh);
  const meetings = useMemo(() => [...x.series].filter((r) => r[2] === y.team.u).sort((a, b) => (a[0] < b[0] ? 1 : -1)), [x.series, y.team.u]);
  const h2hWins = meetings.filter((r) => r[3] > r[4]).length;
  const lines = useMemo(() => prepLines(x, y), [x, y]);
  const last = lines.find((l) => l.key === "last" || l.key === "first");
  const stories = lines
    .filter((l) => l.key !== "h2h" && l.key !== "last" && l.key !== "first" && (typeof l.text === "string" || typeof l.text === "number"))
    .map((l) => (l.who ? `${l.who.name}: ${l.text}` : String(l.text)));
  const lanePairs = useMemo(
    () => ROLES.map((r) => ({ role: r, a: teamStarter(x.team, r), b: teamStarter(y.team, r) })),
    [x.team, y.team],
  );
  const hasLanePairs = lanePairs.filter((lp) => lp.a && lp.b).length >= 3;
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
      <div className={`text-sm font-extrabold truncate ${right ? "text-rw-side-b" : "text-rw-side-a"}`}>{s.team.name}</div>
      {s.team.rating && (
        <div className="text-[11px] text-rw-sub">
          {rankText(s.team)} · <Change v={s.team.rating.chg30} /> {tl("in 30 days")}
        </div>
      )}
      {!hidden && (
        <div className={`flex gap-1 mt-1 ${right ? "justify-end" : ""}`} aria-label={tl("Last 5 series")}>
          {lastSeries(s, 5).map((r, i) => {
            const won = r[3] > r[4];
            const tip = `${won ? tl("Won") : tl("Lost")} ${r[3]}-${r[4]} vs ${r[1]} · ${r[5]} · ${fmtDate(r[0])}`;
            const cls = `w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center border ${
              won ? "border-rw-teal text-rw-teal" : "border-rw-red text-rw-red"
            }`;
            return r[7] ? (
              <button
                key={i}
                type="button"
                title={tip}
                onClick={() => {
                  onClose();
                  navigateHub({ kind: "match", slug: r[7]! });
                }}
                className={`${cls} hover:ring-1 hover:ring-rw-accent`}
              >
                {won ? tc("short result", "W") : tc("short result", "L")}
              </button>
            ) : (
              <span key={i} title={tip} className={cls}>
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
              <span className="tabular-nums font-bold text-rw-side-a">{pct(p)}</span>
              <div className={`relative rounded bg-rw-side-b/70 overflow-hidden ${i === 0 ? "h-5" : "h-3.5"}`}>
                <div className="absolute inset-y-0 left-0 bg-rw-side-a/80" style={{ width: `${p * 100}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-rw-text font-semibold">
                  {label}
                  {i === 0 ? ` · ${tl("this match")}` : ""}
                </span>
              </div>
              <span className="tabular-nums font-bold text-rw-side-b text-right">{pct(1 - p)}</span>
            </div>
          ))}
        </div>
      )}
      {hasLanePairs && (
        <div className="border-t border-rw-border pt-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-rw-muted uppercase tracking-wider font-semibold">
            <span>{tl("Lane by lane")}</span>
            <span>{tl("Compare")} →</span>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {lanePairs.map(({ role, a, b }) => {
              if (!a || !b) return null;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    onClose();
                    navigateHub({ kind: "compare", mode: "player", a: a.u, b: b.u });
                  }}
                  title={tl("Compare {a} and {b}", { a: a.n, b: b.n })}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 py-1 rounded border border-rw-border/80 bg-rw-bg/70 hover:border-rw-accent/60 text-[11px] transition-colors"
                >
                  <span className="font-semibold text-rw-side-a truncate text-right">{a.n}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-rw-accent px-1.5 py-0.5 rounded bg-rw-accent/10 min-w-10 text-center">
                    {ROLE_SHORT[role] || roleName(role)}
                  </span>
                  <span className="font-semibold text-rw-side-b truncate text-left">{b.n}</span>
                </button>
              );
            })}
          </div>
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
                  <span className="text-rw-side-a">{h2hWins}</span> – <span className="text-rw-side-b">{meetings.length - h2hWins}</span>
                </>
              ) : (
                "–"
              )}
            </span>
          </div>
          {meetings.length > 0 ? (
            <ul className="space-y-1 text-[11px]">
              {meetings.slice(0, 4).map((r, i) => {
                const wonA = r[3] > r[4];
                const content = (
                  <>
                    <span className="font-mono tabular-nums shrink-0">
                      <span className={wonA ? "text-rw-side-a font-bold" : "text-rw-sub"}>{r[3]}</span>
                      <span className="text-rw-muted">–</span>
                      <span className={!wonA ? "text-rw-side-b font-bold" : "text-rw-sub"}>{r[4]}</span>
                    </span>
                    <span className="text-rw-sub truncate min-w-0 flex-1">
                      {r[5]}
                      {r[8] ? <span className="text-rw-muted"> · {r[8]}</span> : null}
                    </span>
                    <span className="text-rw-muted shrink-0 tabular-nums">{fmtDate(r[0])}</span>
                  </>
                );
                return (
                  <li key={`${r[0]}-${r[7] || i}`}>
                    {r[7] ? (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          navigateHub({ kind: "match", slug: r[7]! });
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1 rounded border border-rw-border/60 bg-rw-bg/50 hover:border-rw-accent/60 text-left transition-colors"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-0.5">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            last && <p className="text-[11px] text-rw-sub">{last.text}</p>
          )}
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
