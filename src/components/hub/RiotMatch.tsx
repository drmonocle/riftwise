/**
 * Match pages from Riot's feeds, until the stats hub has the match: every game's final numbers (or the live game) from
 * the live stats feed, right after it ends. RiotMatchPage is /match/riot-<Riot match id>; RiotGames fills a hub series
 * that has no stats yet. Both ask again every minute while the match is on.
 */
import React, { useEffect, useState } from "react";
import type { Match } from "../../types";
import { tl, tc, stageLabel } from "../../i18n";
import { LiveGamePanel } from "../LiveGamePanel";
import { MatchOverviewButton } from "../MatchOverviewButton";
import { MatchPrepButton } from "../MatchPrepButton";
import { riotMatchById, riotMatchFor } from "../../hub/riotMatch";
import { findSeriesSlug } from "../../hub/seriesLookup";
import { navigateHub } from "../../hub/route";
import { prettySlug } from "../../hub/data";
import type { HubSeries } from "../../hub/types";
import { card, fmtDate, HubLink, Loading, RevealButton, TeamLogo, useHidden, usePageTitle } from "./ui";

const CopyRiotMatchPost: React.FC<{ match: Match }> = ({ match }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = typeof window !== "undefined" ? window.location.href : "https://riftwise.gg";
    const head = `${match.team1Name} ${match.team1Score}–${match.team2Score} ${match.team2Name} (${match.leagueName}${match.blockName ? ` · ${stageLabel(match.blockName)}` : ""} · ${fmtDate(match.startTimeUtc.slice(0, 10))})`;
    const text = `${head}\n${url}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      type="button"
      data-nocapture="1"
      onClick={copy}
      className="px-2 py-1 rounded border border-rw-border bg-rw-surface text-[11px] font-semibold text-rw-sub hover:text-rw-text hover:border-rw-accent/60 transition-colors"
    >
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};

const REFRESH_MS = 60_000;

/** Riot's match, asked again every minute while it isn't over (null: not found; undefined: still asking). */
function useRiotMatch(find: () => Promise<Match | null>, key: string): Match | null | undefined {
  const [m, setM] = useState<Match | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    // not found or a failed request (a slow schedule, a hiccup at Riot): ask again a few times before giving up
    let misses = 0;
    const missed = () => {
      if (!alive) return;
      if (++misses <= 3) timer = window.setTimeout(load, 5_000 * misses);
      else setM((prev) => (prev === undefined ? null : prev));
    };
    const load = () =>
      find()
        .then((x) => {
          if (!alive) return;
          if (!x || !x.games.length) return missed();
          misses = 0;
          setM(x);
          if (x.state !== "completed" || x.games.some((g) => g.state === "inProgress")) timer = window.setTimeout(load, REFRESH_MS);
        })
        .catch(missed);
    load();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return m;
}

/** Each played (or live) game of the match from the live stats feed. */
export const RiotGames: React.FC<{ match: Match; showStats: boolean }> = ({ match, showStats }) => {
  const games = match.games.filter((g) => g.state === "completed" || g.state === "inProgress");
  if (!games.length) return <p className="text-[11px] text-rw-muted text-center">{tl("Live game stats aren't available right now.")}</p>;
  return (
    <div className={`${card} space-y-2`}>
      {games.map((g) => (
        <LiveGamePanel key={g.id} match={match} only={g} showStats={showStats} startOpen />
      ))}
      <p className="text-[10px] text-rw-muted pt-1">{tl("From Riot's live stats feed. The full stats page for this match (runes, builds and more) comes with the next stats update.")}</p>
    </div>
  );
};

/** A hub series without stats yet: its games from Riot's feed (when the match is recent enough to be there). */
export const RiotGamesFor: React.FC<{ s: HubSeries; showStats: boolean; fallback: React.ReactNode }> = ({ s, showStats, fallback }) => {
  const m = useRiotMatch(() => riotMatchFor(s), `${s.a.n}|${s.b.n}|${s.date}`);
  if (m === undefined) return <Loading />;
  if (!m || !m.games.some((g) => g.state === "completed" || g.state === "inProgress")) return <>{fallback}</>;
  return <RiotGames match={m} showStats={showStats} />;
};

/** /match/riot-<id>: a match the stats hub doesn't have yet. */
export const RiotMatchPage: React.FC<{ matchId: string }> = ({ matchId }) => {
  const m = useRiotMatch(() => riotMatchById(matchId), matchId);
  usePageTitle(m ? `${m.team1Name} vs ${m.team2Name} – ${m.leagueName}` : null);
  // the same reveal as the score on the schedule ("YYYY-MM-DD HH:MM:SS": the stats' date form)
  const [hidden, reveal] = useHidden(`match:${matchId}`, m?.startTimeUtc.slice(0, 19).replace("T", " "));
  // once the stats update has the series, its full page takes over
  useEffect(() => {
    if (!m || m.state !== "completed") return;
    let alive = true;
    findSeriesSlug(m)
      .then((slug) => alive && slug && navigateHub({ kind: "match", slug }, { replace: true }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [m?.state, m?.matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (m === undefined) return <Loading />;
  if (!m) return <p className="text-xs text-rw-sub py-6 text-center">{tl("This match isn't in the current schedule window.")}</p>;
  const live = m.state === "inProgress";
  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="text-[11px] text-rw-muted flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap gap-x-2">
            <HubLink to={{ kind: "league", slug: prettySlug(m.leagueSlug || m.leagueName) }} className="text-rw-accent hover:underline">
              {m.leagueName}
            </HubLink>
            {m.blockName && (
              <span>
                ·{" "}
                <HubLink
                  to={{ kind: "league", slug: prettySlug(m.leagueSlug || m.leagueName) }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {stageLabel(m.blockName)}
                </HubLink>
              </span>
            )}
            <span>
              ·{" "}
              <HubLink
                to={{
                  kind: "finder",
                  query: `team=${encodeURIComponent(prettySlug(m.team1Name))}&vs=${encodeURIComponent(prettySlug(m.team2Name))}`,
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {fmtDate(m.startTimeUtc.slice(0, 10))}
              </HubLink>
            </span>
            <span>
              ·{" "}
              <HubLink
                to={{ kind: "prep", a: prettySlug(m.team1Name), b: prettySlug(m.team2Name) }}
                className="hover:text-rw-accent hover:underline"
                title={tl("Match prep")}
              >
                {tc("series length", "Best of {n}", { n: m.bestOf })}
              </HubLink>
            </span>
            {live && <span className="text-rw-red font-bold">· {tl("LIVE")}</span>}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            {!hidden && <CopyRiotMatchPost match={m} />}
            <MatchOverviewButton match={m} />
            <MatchPrepButton match={m} />
            <HubLink
              to={{ kind: "draft", query: `teams=${encodeURIComponent(prettySlug(m.team1Name))},${encodeURIComponent(prettySlug(m.team2Name))}` }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
            >
              {tl("Draft board")}
            </HubLink>
            <HubLink
              to={{ kind: "compare", mode: "team", a: prettySlug(m.team1Name), b: prettySlug(m.team2Name) }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
            >
              {tl("Compare")}
            </HubLink>
            <HubLink
              to={{ kind: "finder", query: `team=${encodeURIComponent(prettySlug(m.team1Name))}&vs=${encodeURIComponent(prettySlug(m.team2Name))}` }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
            >
              {tl("Game finder")}
            </HubLink>
          </span>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className={`text-right text-base sm:text-lg font-bold truncate ${!hidden && m.team1Score > m.team2Score && !live ? "text-rw-teal" : "text-rw-text"}`}>
            <HubLink to={{ kind: "team", slug: prettySlug(m.team1Name) }} className="inline-flex items-center justify-end gap-2 hover:text-rw-accent max-w-full">
              <span className="sm:hidden truncate">{m.team1Code}</span>
              <span className="hidden sm:inline truncate">{m.team1Name}</span>
              <TeamLogo name={m.team1Name} code={m.team1Code} src={m.team1Image} size={22} />
            </HubLink>
          </div>
          <div className="flex flex-col items-center gap-1 min-w-[4.5rem]">
            <div className="text-2xl font-black text-rw-text tabular-nums text-center leading-none">
              {hidden ? (
                <>
                  ? <span className="text-rw-muted/60">–</span> ?
                </>
              ) : (
                <HubLink
                  to={{ kind: "compare", mode: "team", a: prettySlug(m.team1Name), b: prettySlug(m.team2Name) }}
                  className="hover:text-rw-accent hover:underline"
                  title={tl("Compare")}
                >
                  {m.team1Score} <span className="text-rw-muted/60">–</span> {m.team2Score}
                </HubLink>
              )}
            </div>
            {!hidden && (m.team1Score ?? 0) + (m.team2Score ?? 0) > 0 && (
              <span className="w-12 h-1 rounded-full bg-rw-border/70 overflow-hidden flex gap-[1px]" aria-hidden="true">
                <span
                  className="h-full bg-rw-teal/80"
                  style={{ width: `${Math.round(((m.team1Score ?? 0) / ((m.team1Score ?? 0) + (m.team2Score ?? 0))) * 100)}%` }}
                />
                <span className="h-full flex-1 bg-rw-rose/70" />
              </span>
            )}
          </div>
          <div className={`text-base sm:text-lg font-bold truncate ${!hidden && m.team2Score > m.team1Score && !live ? "text-rw-teal" : "text-rw-text"}`}>
            <HubLink to={{ kind: "team", slug: prettySlug(m.team2Name) }} className="inline-flex items-center gap-2 hover:text-rw-accent max-w-full">
              <TeamLogo name={m.team2Name} code={m.team2Code} src={m.team2Image} size={22} />
              <span className="sm:hidden truncate">{m.team2Code}</span>
              <span className="hidden sm:inline truncate">{m.team2Name}</span>
            </HubLink>
          </div>
        </div>
        {hidden && (
          <div className="mt-2 text-center">
            <RevealButton onReveal={reveal} />
          </div>
        )}
      </div>
      <RiotGames match={m} showStats={!hidden} />
    </div>
  );
};
