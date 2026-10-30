/** One series (a "match": Bo1 to Bo5): every game's draft, scoreboard, builds, runes and objectives. */
import React, { useEffect, useMemo, useState } from "react";
import { PlayCircle, Clock, Crown, Star } from "lucide-react";
import { tl, tc, tk, roleName, locale, stageLabel, fmtDec } from "../../i18n";
import { champName } from "../../champions";
import { loadHubSeries } from "../../hub/data";
import type { GamePlayer, HubGame, HubSeries, SideStats } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { RatingBadge } from "./BestPage";
import { RatingBadge as PlayerRatingBadge, fmtRating, useRatingFile } from "./PlayerRating";
import { rateLine } from "../../hub/playerRating";
import { navigateHub } from "../../hub/route";
import { BroadcastCardButton, gameCardData, seriesCardData } from "./BroadcastCard";
import { RiotGamesFor, RiotMatchPage } from "./RiotMatch";
import { RIOT_PREFIX } from "../../hub/riotMatch";
import { card, ChampIcon, EventLink, fmtDate, fmtNum, HubLink, ItemIcon, OeCredit, Page, PlayerLink, RevealButton, RuneIcon, SpellIcon, TeamLink, useHidden, useLoad, usePageTitle, PhotosLink } from "./ui";

const fmtGold = (g?: number) => (g == null ? "–" : `${fmtDec(g / 1000)}k`);
const fmtMin = (m?: number | null) => {
  if (m == null) return "";
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const DRAKE_LABEL: Record<string, string> = {
  infernal: tk("Infernal"), mountain: tk("Mountain"), ocean: tk("Ocean"), cloud: tk("Cloud"), hextech: tk("Hextech"), chemtech: tk("Chemtech"),
};

export const MatchPage: React.FC<{ slug: string; game?: number; onOpenUrl: (url: string) => void }> = ({ slug, game, onOpenUrl }) =>
  // a match the stats hub doesn't have yet: from Riot's feeds
  slug.startsWith(RIOT_PREFIX) ? <RiotMatchPage matchId={slug.slice(RIOT_PREFIX.length)} /> : <HubMatchPage slug={slug} game={game} onOpenUrl={onOpenUrl} />;

const HubMatchPage: React.FC<{ slug: string; game?: number; onOpenUrl: (url: string) => void }> = ({ slug, game, onOpenUrl }) => {
  const state = useLoad(() => loadHubSeries(slug), [slug]);
  usePageTitle(state.data ? `${state.data.a.n} vs ${state.data.b.n} – ${state.data.en}` : null);
  useDDragon();
  return <Page state={state}>{(s) => <SeriesView key={slug} s={s} slug={slug} game={game} onOpenUrl={onOpenUrl} />}</Page>;
};

const SeriesView: React.FC<{ s: HubSeries; slug: string; game?: number; onOpenUrl: (url: string) => void }> = ({ s, slug, game: startGame, onOpenUrl }) => {
  const [hidden, reveal] = useHidden(`series:${slug}`, s.date);
  const withStats = s.games.filter((g) => g.p && g.p.length);
  // opened at one game (/match/<slug>?g=5, from Best games), else the first
  const [gi, setGi] = useState(() => Math.max(0, s.games.findIndex((g) => g.n === startGame)));
  // Back/Forward or a link to another game of this series
  useEffect(() => {
    const i = s.games.findIndex((g) => g.n === startGame);
    if (i >= 0) setGi(i);
  }, [startGame, s.games]);
  // the address (and Copy link) follow the game on screen: /match/<slug>?g=3
  const pick = (i: number) => {
    setGi(i);
    const g = s.games[i];
    if (g) navigateHub({ kind: "match", slug, game: g.n }, { replace: true });
  };
  // spoiler mode shows every game a best-of could have, so a 3-0 doesn't give itself away by having 3 tabs
  const tabs = hidden ? Math.max(s.bo || 0, s.games.length) : s.games.length;
  const game = gi < s.games.length ? s.games[gi] : hidden ? undefined : s.games[s.games.length - 1];
  const scoreA = hidden ? "?" : s.sa;
  const scoreB = hidden ? "?" : s.sb;
  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="text-[11px] text-rw-muted flex flex-wrap gap-x-2">
          <EventLink name={s.en} u={s.e} className="text-rw-accent hover:underline" />
          {s.stage && <span>· {stageLabel(s.stage)}</span>}
          <span>· {fmtDate(s.date)}</span>
          <span>· {tc("series length", "Best of {n}", { n: s.bo })}</span>
          <span>
            ·{" "}
            <PhotosLink
              q={s.en}
              label={tl("Event photos")}
              title={tl("Riot's photos from {event} on NerdFinder", { event: s.en })}
              className="inline-flex items-center gap-1 text-rw-teal hover:underline"
            />
          </span>
          {!hidden && s.r != null && (
            <HubLink to={{ kind: "best", query: "view=series" }} className="ml-auto" title={tl("Series rating: mostly its best game, then its other games")}>
              <RatingBadge r={s.r} />
            </HubLink>
          )}
        </div>
        {/* the page's main heading: both teams and the score */}
        <h1 className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="block text-right min-w-0">
            <TeamLink name={s.a.n} u={s.a.u} className={`text-base sm:text-lg font-bold hover:underline ${!hidden && s.w === 1 ? "text-rw-teal" : "text-rw-text"}`} />
          </span>
          <span className="block text-2xl font-black text-rw-text tabular-nums text-center min-w-[4.5rem]">
            {scoreA} <span className="text-rw-muted/60">–</span> {scoreB}
          </span>
          <span className="block min-w-0">
            <TeamLink name={s.b.n} u={s.b.u} className={`text-base sm:text-lg font-bold hover:underline ${!hidden && s.w === 2 ? "text-rw-teal" : "text-rw-text"}`} />
          </span>
        </h1>
        {hidden && (
          <div className="mt-2 text-center">
            <RevealButton onReveal={reveal} />
          </div>
        )}
        {((!hidden && s.games.some((g) => g.w)) || (s.a.u && s.b.u)) && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
            {s.a.u && s.b.u && (
              <>
                <HubLink
                  to={{ kind: "prep", a: s.a.u, b: s.b.u }}
                  className="px-2.5 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
                >
                  {tl("Match prep")}
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: s.a.u, b: s.b.u }}
                  className="px-2.5 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
                >
                  {tl("Compare")}
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: (() => {
                      const used = !hidden
                        ? Array.from(
                            new Set(
                              s.games.flatMap((g) => [
                                ...(g.t?.blue?.picks || []),
                                ...(g.t?.red?.picks || []),
                                ...(g.p || []).map((p) => p.c || "").filter(Boolean),
                              ]),
                            ),
                          )
                        : [];
                      return `teams=${s.a.u},${s.b.u}${used.length ? `&u=${encodeURIComponent(used.join(","))}` : ""}`;
                    })(),
                  }}
                  className="px-2.5 py-1 rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
                >
                  {tl("Draft board")}
                </HubLink>
              </>
            )}
            {!hidden && s.games.some((g) => g.w) && (
              <BroadcastCardButton data={() => seriesCardData(s)} name={`${s.a.n}-vs-${s.b.n}-series`} label={tl("Overview card")} />
            )}
          </div>
        )}
        {!hidden && s.ff ? (
          <p className="mt-2 text-[11px] text-rw-muted text-center">{tl("Result awarded by forfeit, not by the games played.")}</p>
        ) : null}
      </div>

      {/* no stats in the hub yet (a match from today): every game from Riot's live stats feed instead */}
      {withStats.length === 0 ? (
        <RiotGamesFor
          s={s}
          showStats={!hidden}
          fallback={
            <>
              <p className="text-[11px] text-rw-muted text-center">{tl("Only the results of this series are known: no player stats were recorded for it.")}</p>
              <SeriesGames s={s} tabs={tabs} gi={gi} pick={pick} hidden={hidden} game={game} reveal={reveal} onOpenUrl={onOpenUrl} />
            </>
          }
        />
      ) : (
        <SeriesGames s={s} tabs={tabs} gi={gi} pick={pick} hidden={hidden} game={game} reveal={reveal} onOpenUrl={onOpenUrl} />
      )}
    </div>
  );
};

/** The game tabs and the game on screen. */
const SeriesGames: React.FC<{
  s: HubSeries;
  tabs: number;
  gi: number;
  pick: (i: number) => void;
  hidden: boolean;
  game: HubGame | undefined;
  reveal: () => void;
  onOpenUrl: (url: string) => void;
}> = ({ s, tabs, gi, pick, hidden, game, reveal, onOpenUrl }) => {
  const gamePicks = !hidden && tabs > 1
    ? s.games.map((g, i) => {
        const aBlue = g.blue === "a";
        const aPicks =
          g.t?.blue?.picks?.length && g.t?.red?.picks?.length
            ? aBlue
              ? g.t.blue.picks
              : g.t.red.picks
            : (g.p || []).filter((p) => p.s === (aBlue ? 1 : 2) && p.c).map((p) => p.c!);
        const bPicks =
          g.t?.blue?.picks?.length && g.t?.red?.picks?.length
            ? aBlue
              ? g.t.red.picks
              : g.t.blue.picks
            : (g.p || []).filter((p) => p.s !== (aBlue ? 1 : 2) && p.c).map((p) => p.c!);
        return { i, n: g.n, w: g.w, aPicks, bPicks };
      }).filter((x) => x.aPicks.length > 0 && x.bPicks.length > 0)
    : [];
  return (
    <>
      {tabs > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {Array.from({ length: tabs }, (_, i) => s.games[i]).map((g, i) => (
            <button
              key={g ? g.n : `slot-${i}`}
              type="button"
              role="tab"
              aria-selected={i === gi}
              onClick={() => pick(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                i === gi ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
              }`}
            >
              {tl("Game {n}", { n: g ? g.n : i + 1 })}
              {!hidden && g?.w ? <span className="ml-1 opacity-90">({g.w === 1 ? s.a.c || s.a.n : s.b.c || s.b.n})</span> : null}
              {!hidden && g?.r != null ? <span className="ml-1.5 tabular-nums opacity-90">· {g.r.toFixed(0)}</span> : null}
            </button>
          ))}
        </div>
      )}
      {gamePicks.length > 1 && (
        <div className={`${card} !py-2 flex flex-wrap items-center gap-2 text-[11px]`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">{tl("Fearless")}</span>
          {gamePicks.map((gp) => (
            <button
              key={gp.n}
              type="button"
              onClick={() => pick(gp.i)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${
                gp.i === gi ? "border-rw-accent bg-rw-accent/10" : "border-rw-border/70 hover:border-rw-accent/50"
              }`}
            >
              <span className="text-[10px] font-semibold text-rw-sub">{tc("short game", "G{n}", { n: gp.n })}</span>
              <span className={`inline-flex items-center gap-0.5 ${gp.w === 2 ? "opacity-60" : ""}`}>
                {gp.aPicks.map((c) => (
                  <ChampIcon key={`a-${c}`} name={c} size={15} />
                ))}
              </span>
              <span className="text-[9px] text-rw-muted">vs</span>
              <span className={`inline-flex items-center gap-0.5 ${gp.w === 1 ? "opacity-60" : ""}`}>
                {gp.bPicks.map((c) => (
                  <ChampIcon key={`b-${c}`} name={c} size={15} />
                ))}
              </span>
            </button>
          ))}
        </div>
      )}

      {game ? (
        <GameView s={s} g={game} hidden={hidden} onReveal={reveal} onOpenUrl={onOpenUrl} />
      ) : (
        hidden && (
          <div className={`${card} py-4 text-center space-y-2`}>
            <p className="text-[11px] text-rw-muted">{tl("Hidden while spoiler mode is on.")}</p>
            <RevealButton onReveal={reveal} />
          </div>
        )
      )}
    </>
  );
};

const GameView: React.FC<{ s: HubSeries; g: HubGame; hidden: boolean; onReveal: () => void; onOpenUrl: (url: string) => void }> = ({
  s,
  g,
  hidden,
  onReveal,
  onOpenUrl,
}) => {
  const blueTeam = g.blue === "a" ? s.a : s.b;
  const redTeam = g.blue === "a" ? s.b : s.a;
  const blueWon = (g.w === 1 && g.blue === "a") || (g.w === 2 && g.blue === "b");
  const redWon = g.w !== 0 && !blueWon;
  const blue = g.p?.filter((p) => p.s === 1) || [];
  const red = g.p?.filter((p) => p.s === 2) || [];
  // each player's rating for this game (src/hub/playerRating.ts), and the best of the ten
  const ratingFile = useRatingFile();
  const ratings = useMemo(() => {
    const m = new Map<GamePlayer, number>();
    if (!ratingFile || !g.p || !g.min || !g.w) return m;
    const year = (g.date || s.date || "").slice(0, 4);
    const sum = (side: number, f: (p: GamePlayer) => number | undefined) => (g.p || []).filter((p) => p.s === side).reduce((a, p) => a + (f(p) || 0), 0);
    for (const p of g.p) {
      const v = rateLine(
        {
          year,
          role: p.r || "",
          won: p.s === 1 ? blueWon : redWon,
          k: p.k,
          d: p.d,
          a: p.a,
          cs: p.cs,
          gold: p.gd,
          dmg: p.dm,
          vision: p.v,
          min: g.min,
          teamK: sum(p.s, (x) => x.k),
          teamDmg: p.dm != null ? sum(p.s, (x) => x.dm) : null,
          teamGold: p.gd != null ? sum(p.s, (x) => x.gd) : null,
          teamVision: p.v != null ? sum(p.s, (x) => x.v) : null,
        },
        ratingFile,
      );
      if (v != null) m.set(p, v);
    }
    return m;
  }, [ratingFile, g, s.date, blueWon, redWon]);
  const top = [...ratings.entries()].sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-rw-muted">
          <span className="flex items-center gap-2">
            {g.min != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {hidden ? "–" : fmtMin(g.min)}
              </span>
            )}
            {g.patch && <span>{tl("Patch {patch}", { patch: g.patch })}</span>}
            {g.date && <span>{new Date(`${g.date.replace(" ", "T")}Z`).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })}</span>}
            {g.ff ? <span className="text-rw-accent">{tl("Forfeit")}</span> : null}
            {g.mvp && !hidden && (
              <span className="flex items-center gap-1 text-rw-accent">
                <Crown className="w-3 h-3" />
                {tl("Player of the Game:")} <PlayerLink name={g.mvp.n} u={g.mvp.u} className="text-rw-accent hover:underline font-semibold" />
              </span>
            )}
            {top && !hidden && (
              <span className="flex items-center gap-1 text-rw-teal" title={tl("RiftWise rating: how well they played this game (6 is average)")}>
                <Star className="w-3 h-3 fill-current" />
                {tl("Top rated:")} <PlayerLink name={top[0].n} u={top[0].u} className="text-rw-teal hover:underline font-semibold" />
                <span className="tabular-nums">{fmtRating(top[1])}</span>
              </span>
            )}
          </span>
          {!hidden && g.t && (
            <BroadcastCardButton data={() => gameCardData(s, g)} name={`${s.a.n}-vs-${s.b.n}-game-${g.n}`} label={tl("Game card")} />
          )}
          {(g.vod || g.vpb || g.vgs) && (
            <span className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  [g.vpb, tl("Watch the draft")],
                  [g.vgs, tl("Watch from game start")],
                  [g.vod, g.vpb || g.vgs ? tl("Full VOD") : tl("Watch this game")],
                ] as [string | undefined, string][]
              )
                .filter(([url]) => !!url)
                .map(([url, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onOpenUrl(url!)}
                    className="flex items-center gap-1 px-2.5 py-1.5 min-h-8 rounded-md bg-rw-red/15 border border-rw-red/50 text-rw-text hover:bg-rw-red/25 font-semibold"
                  >
                    <PlayCircle className="w-3.5 h-3.5 text-rw-red" />
                    {label}
                  </button>
                ))}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* spoiler mode: the draft only (kills, gold and objectives give the result away) */}
          <SideHeader name={blueTeam.n} u={blueTeam.u} side="blue" won={!hidden && blueWon} st={hidden ? undefined : g.t?.blue} />
          <SideHeader name={redTeam.n} u={redTeam.u} side="red" won={!hidden && redWon} st={hidden ? undefined : g.t?.red} right />
        </div>
        {(g.t?.blue?.picks?.length || g.t?.blue?.bans?.length) && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-rw-border">
            <Draft st={g.t?.blue} side="blue" />
            <Draft st={g.t?.red} side="red" right />
          </div>
        )}
      </div>

      {hidden && (blue.length > 0 || red.length > 0) && (
        <div className={`${card} py-4 text-center space-y-2`}>
          <p className="text-[11px] text-rw-muted">{tl("Player stats are hidden while spoiler mode is on.")}</p>
          <RevealButton onReveal={onReveal} />
        </div>
      )}
      {!hidden && (blue.length > 0 || red.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Scoreboard name={blueTeam.n} side="blue" players={blue} hidden={hidden} won={blueWon} minutes={g.min} ratings={ratings} top={top?.[0]} />
          <Scoreboard name={redTeam.n} side="red" players={red} hidden={hidden} won={redWon} minutes={g.min} ratings={ratings} top={top?.[0]} />
        </div>
      )}
      {!hidden && <Leads g={g} blueName={blueTeam.n} redName={redTeam.n} blue={blue} red={red} />}
      {!hidden && <PlayerBars blueName={blueTeam.n} redName={redTeam.n} blue={blue} red={red} minutes={g.min ?? undefined} />}
      {g.st !== "f" && !g.p && (
        <p className="text-[11px] text-rw-muted text-center">
          {g.st === "r" ? tl("Only the result of this game is known.") : tl("No result or stats were recorded for this game.")}
        </p>
      )}
    </div>
  );
};

// ── Early-game leads (Oracle's Elixir): the team's gold and XP lead at 10 / 15 / 20 minutes and each lane at 15 ──

const BLUE = "#4a9eff";
const RED = "var(--rw-red)";
const kfmt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v) >= 1000 ? `${fmtDec(Math.abs(v) / 1000)}k` : Math.abs(v)}`;

/** One row: a bar from the middle toward the side that leads (blue left, red right), its size against `max`. The row's
 *  label (the minute, the lane) sits on its own line above the bar, so it never lands on the bar or its number. */
const LeadBar: React.FC<{ label: React.ReactNode; left?: React.ReactNode; right?: React.ReactNode; v: number; max: number; tip: string }> = ({
  label,
  left,
  right,
  v,
  max,
  tip,
}) => {
  const w = max ? Math.min(50, (Math.abs(v) / max) * 50) : 0;
  const blueAhead = v > 0;
  // a long bar carries its number inside, so the number never runs into the names beside the chart
  const inside = w > 30;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-end gap-2 text-[11px]" title={tip}>
      <span className="truncate text-right text-rw-sub leading-5">{left}</span>
      <div>
        <div className="text-center text-[9px] leading-3 text-rw-muted truncate">{label}</div>
        <div className="relative h-5">
          <div className="absolute inset-y-0 left-1/2 w-px bg-rw-line" />
          {v !== 0 && (
            <div
              className="absolute top-1 bottom-1"
              style={{
                background: blueAhead ? BLUE : RED,
                width: `${w}%`,
                ...(blueAhead ? { right: "50%", borderRadius: "4px 0 0 4px" } : { left: "50%", borderRadius: "0 4px 4px 0" }),
              }}
            />
          )}
          <span
            className={`absolute inset-y-0 flex items-center tabular-nums font-semibold ${inside ? "text-white" : "text-rw-text"}`}
            style={inside ? (blueAhead ? { right: "calc(50% + 6px)" } : { left: "calc(50% + 6px)" }) : blueAhead ? { right: `calc(50% + ${w}% + 4px)` } : { left: `calc(50% + ${w}% + 4px)` }}
          >
            {v === 0 ? "0" : kfmt(Math.abs(v))}
          </span>
        </div>
      </div>
      <span className="truncate text-rw-sub leading-5">{right}</span>
    </div>
  );
};

const ROLE_ORDER = ["Top", "Jungle", "Mid", "Bot", "Support"];

type BarMetric = "dm" | "gd" | "cs" | "v";

/**
 * Each lane's two players side by side for one number from the scoreboard (damage to champions, gold, CS, vision):
 * blue's bar grows left, red's right, all on one scale. Needs only the scoreboard, so a game has it as soon as
 * Leaguepedia does (the leads above need Oracle's Elixir, a day or two later).
 */
const PlayerBars: React.FC<{ blueName: string; redName: string; blue: GamePlayer[]; red: GamePlayer[]; minutes?: number }> = ({
  blueName,
  redName,
  blue,
  red,
  minutes,
}) => {
  const [metric, setMetric] = useState<BarMetric>("dm");
  const metrics: [BarMetric, string][] = [
    ["dm", tl("Damage")],
    ["gd", tl("Gold")],
    ["cs", "CS"],
    ["v", tl("Vision")],
  ];
  const have = metrics.filter(([k]) => [...blue, ...red].some((p) => p[k] != null));
  const m = have.some(([k]) => k === metric) ? metric : have[0]?.[0];
  if (!m || blue.length !== 5 || red.length !== 5) return null;
  const rows = ROLE_ORDER.map((r, i) => ({ r, b: blue.find((p) => p.r === r) || blue[i], o: red.find((p) => p.r === r) || red[i] }));
  const max = Math.max(1, ...rows.flatMap((x) => [x.b[m] || 0, x.o[m] || 0]));
  const total = (list: GamePlayer[]) => list.reduce((t, p) => t + (p[m] || 0), 0);
  const fmt = (v: number | undefined) => (v == null ? "–" : m === "dm" || m === "gd" ? fmtGold(v) : String(v));
  const perMin = (v: number | undefined) => (v != null && minutes ? (m === "cs" ? fmtDec(v / minutes) : Math.round(v / minutes)) : null);
  const side = (p: GamePlayer, right: boolean) => {
    const v = p[m];
    const w = v ? (v / max) * 100 : 0;
    return (
      <div className={`flex items-center gap-2 min-w-0 ${right ? "" : "flex-row-reverse"}`}>
        <span className={`text-[11px] tabular-nums font-semibold text-rw-text w-11 shrink-0 ${right ? "" : "text-right"}`}>{fmt(v)}</span>
        <div className={`flex-1 h-3 flex ${right ? "" : "justify-end"}`}>
          <div className={right ? "rounded-r" : "rounded-l"} style={{ width: `${w}%`, background: right ? RED : BLUE }} />
        </div>
      </div>
    );
  };
  return (
    <div className={`${card} space-y-1.5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rw-text">{tl("Player by player")}</h3>
        <div className="flex gap-1" role="group" aria-label={tl("Show")}>
          {have.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMetric(k)}
              aria-pressed={m === k}
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                m === k ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 text-[10px] uppercase tracking-wider font-bold">
        <span className="truncate text-right" style={{ color: BLUE }}>
          {blueName} · {fmt(total(blue))}
        </span>
        <span />
        <span className="truncate" style={{ color: RED }}>
          {redName} · {fmt(total(red))}
        </span>
      </div>
      {rows.map(({ r, b, o }) => (
        <div
          key={r}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3"
          title={`${roleName(r)}: ${b.n} ${fmt(b[m])}${perMin(b[m]) != null ? ` (${perMin(b[m])}/min)` : ""} · ${o.n} ${fmt(o[m])}${
            perMin(o[m]) != null ? ` (${perMin(o[m])}/min)` : ""
          }`}
        >
          <div className="min-w-0">
            <div className="text-[10px] text-rw-sub truncate text-right">
              {b.c && <ChampIcon name={b.c} size={14} />} {b.n}
            </div>
            {side(b, false)}
          </div>
          {b.u && o.u ? (
            <HubLink
              to={{ kind: "compare", mode: "player", a: b.u, b: o.u }}
              className="text-[9px] text-rw-muted hover:text-rw-teal hover:underline text-center w-12"
              title={`${tl("Compare")}: ${b.n} vs ${o.n}`}
            >
              {roleName(r)}
            </HubLink>
          ) : (
            <span className="text-[9px] text-rw-muted text-center w-12">{roleName(r)}</span>
          )}
          <div className="min-w-0">
            <div className="text-[10px] text-rw-sub truncate">
              {o.n} {o.c && <ChampIcon name={o.c} size={14} />}
            </div>
            {side(o, true)}
          </div>
        </div>
      ))}
    </div>
  );
};

const Leads: React.FC<{ g: HubGame; blueName: string; redName: string; blue: GamePlayer[]; red: GamePlayer[] }> = ({ g, blueName, redName, blue, red }) => {
  const t = g.t?.blue;
  // the team's XP lead: its five players' leads over their lane opponents add up to it
  const xpAt = (key: "x10" | "x15" | "x20") => (blue.length === 5 && blue.every((p) => p[key] != null) ? blue.reduce((s, p) => s + (p[key] as number), 0) : null);
  const gold = ([[10, t?.g10], [15, t?.g15], [20, t?.g20]] as [number, number | undefined][]).filter((x): x is [number, number] => x[1] != null);
  const xp = ([[10, xpAt("x10")], [15, t?.x15 ?? xpAt("x15")], [20, xpAt("x20")]] as [number, number | null | undefined][]).filter(
    (x): x is [number, number] => x[1] != null,
  );
  const lanes = ROLE_ORDER.map((r) => ({ r, b: blue.find((p) => p.r === r), o: red.find((p) => p.r === r) })).filter((x) => x.b?.g15 != null && x.o);
  if (!gold.length && !lanes.length) return null;
  const maxGold = Math.max(1000, ...gold.map((x) => Math.abs(x[1])));
  const maxXp = Math.max(1000, ...xp.map((x) => Math.abs(x[1])));
  const maxLane = Math.max(500, ...lanes.map((x) => Math.abs(x.b!.g15 as number)));
  const head = (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] gap-2 text-[10px] uppercase tracking-wider font-bold">
      <span className="truncate text-right" style={{ color: BLUE }}>
        {blueName}
      </span>
      <span />
      <span className="truncate" style={{ color: RED }}>
        {redName}
      </span>
    </div>
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {gold.length > 0 && (
        <div className={`${card} space-y-1.5`}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rw-text">{tl("Gold and XP lead")}</h3>
          {head}
          {gold.map(([m, v]) => (
            <LeadBar key={`g${m}`} label={tl("{n} min", { n: m })} left={m === gold[0][0] ? tl("Gold") : undefined} v={v} max={maxGold}
              tip={tl("Gold lead at {n} minutes: {lead}", { n: m, lead: `${v >= 0 ? blueName : redName} ${kfmt(Math.abs(v))}` })} />
          ))}
          {xp.map(([m, v]) => (
            <LeadBar key={`x${m}`} label={tl("{n} min", { n: m })} left={m === xp[0][0] ? "XP" : undefined} v={v} max={maxXp}
              tip={tl("XP lead at {n} minutes: {lead}", { n: m, lead: `${v >= 0 ? blueName : redName} ${kfmt(Math.abs(v))}` })} />
          ))}
          <OeCredit />
        </div>
      )}
      {lanes.length > 0 && (
        <div className={`${card} space-y-1.5`}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rw-text">{tl("Gold lead in each lane at 15 minutes")}</h3>
          {head}
          {lanes.map(({ r, b, o }) => (
            <LeadBar
              key={r}
              label={roleName(r)}
              left={b!.n}
              right={o!.n}
              v={b!.g15 as number}
              max={maxLane}
              tip={tl("{role} at 15 minutes: {lead}", {
                role: roleName(r),
                lead: `${(b!.g15 as number) >= 0 ? b!.n : o!.n} ${kfmt(Math.abs(b!.g15 as number))}`,
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SideHeader: React.FC<{ name: string; u: string | null; side: "blue" | "red"; won: boolean; st?: SideStats; right?: boolean }> = ({
  name,
  u,
  side,
  won,
  st,
  right,
}) => {
  const color = side === "blue" ? "#4a9eff" : "var(--rw-red)";
  const obj: [string, React.ReactNode][] = [];
  if (st?.k != null) obj.push([tl("Kills"), st.k]);
  if (st?.gold != null) obj.push([tl("Gold"), fmtGold(st.gold)]);
  if (st?.towers != null) obj.push([tl("Towers"), st.towers]);
  if (st?.drag != null) obj.push([tl("Dragons"), st.drag]);
  if (st?.barons != null) obj.push([tl("Barons"), st.barons]);
  if (st?.grubs) obj.push([tl("Void grubs"), st.grubs]);
  if (st?.heralds) obj.push([tl("Heralds"), st.heralds]);
  if (st?.atakhan) obj.push([tl("Atakhan"), st.atakhan]);
  if (st?.elders) obj.push([tl("Elders"), st.elders]);
  if (st?.pl != null) obj.push([tl("Plates"), st.pl]);
  if (st?.g15 != null) obj.push(["GD@15", sgn(st.g15)]);
  const firsts = [st?.fb === 1 ? tl("First blood") : null, st?.ft === 1 ? tl("First tower") : null].filter((x): x is string => !!x);
  const drakes = st?.drakes ? Object.entries(st.drakes).map(([k, n]) => `${tl(DRAKE_LABEL[k] || k)}${n && n > 1 ? ` ×${n}` : ""}`) : [];
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`flex items-center gap-2 ${right ? "justify-end" : ""}`}>
        <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color }}>
          {side === "blue" ? tl("Blue side") : tl("Red side")}
        </span>
        {won && <span className="text-[10px] font-bold text-rw-teal">{tc("short result", "W")}</span>}
      </div>
      <TeamLink name={name} u={u} className="text-sm font-bold text-rw-text hover:underline" />
      {obj.length > 0 && (
        <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] ${right ? "justify-end" : ""}`}>
          {obj.map(([l, v]) => (
            <span key={l} className="text-rw-muted">
              {l} <span className="text-rw-text font-semibold">{v}</span>
            </span>
          ))}
        </div>
      )}
      {drakes.length > 0 && <div className="text-[10px] text-rw-muted mt-0.5">{drakes.join(" · ")}</div>}
      {firsts.length > 0 && (
        <div className={`mt-1 flex flex-wrap gap-1 ${right ? "justify-end" : ""}`}>
          {firsts.map((f) => (
            <span key={f} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rw-accent/15 border border-rw-accent/40 text-rw-text">
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/** +1,234 / -56 */
const sgn = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`);

// Draft order: blue picks 1st, 4th, 5th, 8th, 9th; red 2nd, 3rd, 6th, 7th, 10th. Bans and picks come in two phases (3 + 2).
const PICK_NO: Record<"blue" | "red", number[]> = { blue: [1, 4, 5, 8, 9], red: [2, 3, 6, 7, 10] };

const Draft: React.FC<{ st?: SideStats; side: "blue" | "red"; right?: boolean }> = ({ st, side, right }) => (
  <div className={`space-y-1.5 min-w-0 ${right ? "text-right" : ""}`}>
    {st?.bans && st.bans.length > 0 && (
      <div className={`flex flex-wrap items-center gap-1 ${right ? "justify-end" : ""}`}>
        <span className="text-[10px] text-rw-muted uppercase mr-1">{tl("Bans")}</span>
        {st.bans.map((c, i) => (
          <span key={i} className={`opacity-60 grayscale ${i === 3 ? "ml-2" : ""}`} title={tl("Ban {n}", { n: i + 1 })}>
            <ChampIcon name={c} size={20} />
          </span>
        ))}
      </div>
    )}
    {st?.picks && st.picks.length > 0 && (
      <div className={`flex flex-wrap items-start gap-1 ${right ? "justify-end" : ""}`}>
        <span className="text-[10px] text-rw-muted uppercase mr-1 mt-1.5">{tl("Picks")}</span>
        {st.picks.map((c, i) => (
          <span key={i} className={`flex flex-col items-center ${i === 3 ? "ml-2" : ""}`} title={tl("Pick {n} of the draft", { n: PICK_NO[side][i] ?? i + 1 })}>
            <ChampIcon name={c} size={24} />
            <span className="text-[9px] text-rw-muted tabular-nums leading-tight">{`${side === "blue" ? "B" : "R"}${i + 1}`}</span>
          </span>
        ))}
      </div>
    )}
  </div>
);

const Scoreboard: React.FC<{
  name: string;
  side: "blue" | "red";
  players: GamePlayer[];
  hidden: boolean;
  won: boolean;
  minutes?: number | null;
  ratings?: Map<GamePlayer, number>;
  top?: GamePlayer;
}> = ({ name, side, players, hidden, won, minutes, ratings, top }) => {
  const color = side === "blue" ? "#4a9eff" : "var(--rw-red)";
  const totalK = players.reduce((s, p) => s + p.k, 0);
  const totalDmg = players.reduce((s, p) => s + (p.dm || 0), 0);
  const totalGold = players.reduce((s, p) => s + (p.gd || 0), 0);
  return (
    <section className={`${card} p-3 min-w-0`} style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <h3 className="text-xs font-bold text-rw-text mb-2 flex items-center gap-2">
        <span className="w-1 h-3.5 rounded-sm shrink-0" style={{ background: color }} aria-hidden="true" />
        {name}
        {!hidden && won && <span className="text-[10px] text-rw-teal">{tl("Victory")}</span>}
      </h3>
      <div className="space-y-2">
        {players.map((p, i) => (
          <PlayerRow key={i} p={p} teamKills={totalK} teamDmg={totalDmg} teamGold={totalGold} minutes={minutes} rating={ratings?.get(p)} top={p === top} />
        ))}
      </div>
    </section>
  );
};

const PlayerRow: React.FC<{ p: GamePlayer; teamKills: number; teamDmg: number; teamGold: number; minutes?: number | null; rating?: number; top?: boolean }> = ({
  p,
  teamKills,
  teamDmg,
  teamGold,
  minutes,
  rating,
  top,
}) => {
  const kp = teamKills ? Math.round(((p.k + p.a) / teamKills) * 100) : null;
  const csm = p.cs != null && minutes ? fmtDec(p.cs / minutes) : null;
  return (
    <div className="border-t border-rw-border pt-2 first:border-0 first:pt-0 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        {p.c && <ChampIcon name={p.c} size={30} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <PlayerLink name={p.n} u={p.u} className="font-semibold text-rw-text hover:text-rw-accent hover:underline truncate" />
            {p.r && <span className="text-[10px] text-rw-muted shrink-0">{roleName(p.r)}</span>}
          </div>
          <div className="text-[10px] text-rw-muted truncate">
            {p.c ? (
              p.u ? (
                <HubLink
                  to={{ kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(p.c)}` }}
                  className="hover:text-rw-teal hover:underline"
                  title={`${p.n} · ${champName(p.c)}`}
                >
                  {champName(p.c)}
                </HubLink>
              ) : (
                champName(p.c)
              )
            ) : (
              ""
            )}
          </div>
        </div>
        {rating != null && <PlayerRatingBadge v={rating} top={top} />}
        <div className="text-right shrink-0">
          <div className="font-bold text-rw-text tabular-nums">
            {p.k}/{p.d}/{p.a}
          </div>
          <div className="text-[10px] text-rw-muted tabular-nums">
            {p.cs != null && <>{tl("{n} CS", { n: p.cs })}{csm ? ` (${csm})` : ""}</>}
            {kp != null && <> · {tl("{pct} KP", { pct: `${kp}%` })}</>}
          </div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {p.it && p.it.length > 0 && (
          <span className="flex items-center gap-0.5">
            {p.it.map((it, i) => (
              <ItemIcon key={i} name={it} size={20} />
            ))}
            {p.tr && <ItemIcon name={p.tr} size={16} />}
          </span>
        )}
        {p.sp && p.sp.length > 0 && (
          <span className="flex items-center gap-0.5">
            {p.sp.map((sp, i) => (
              <SpellIcon key={i} name={sp} />
            ))}
          </span>
        )}
        {p.ks && (
          <span className="flex items-center gap-0.5" title={(p.rn || [p.ks]).join(", ")}>
            <RuneIcon name={p.ks} size={20} />
            {p.stt && <RuneIcon name={p.stt} size={14} />}
          </span>
        )}
        <span className="text-[10px] text-rw-muted tabular-nums">
          {p.gd != null && (
            <>
              {tl("{n} gold", { n: fmtNum(p.gd) })}
              {teamGold ? ` (${Math.round((p.gd / teamGold) * 100)}%)` : ""}
            </>
          )}
          {p.dm != null && (
            <>
              {" · "}
              {tl("{n} dmg", { n: fmtNum(p.dm) })}
              {teamDmg ? ` (${Math.round((p.dm / teamDmg) * 100)}%)` : ""}
            </>
          )}
          {p.v != null && <> · {tl("{n} vision", { n: p.v })}</>}
        </span>
      </div>
      {(() => {
        const bits = [
          minutes && p.dm != null ? `${fmtNum(Math.round(p.dm / minutes))} ${tl("DPM")}` : null,
          minutes && p.v != null ? `${fmtDec(p.v / minutes, 2)} ${tl("VS/m")}` : null,
          p.g15 != null ? `@15 ${sgn(p.g15)} ${tl("gold")} · ${sgn(p.c15)} CS · ${sgn(p.x15)} XP` : null,
        ].filter(Boolean);
        return bits.length ? (
          <div className="mt-0.5 text-[10px] text-rw-muted tabular-nums" title={p.g15 != null ? tl("Lead over the lane opponent at 15 minutes (Oracle's Elixir)") : undefined}>
            {bits.join(" · ")}
          </div>
        ) : null;
      })()}
    </div>
  );
};

