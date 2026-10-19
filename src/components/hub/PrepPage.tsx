/**
 * Match prep: everything an analyst gathers before a broadcast for one matchup, on one page and for any period:
 * storylines (milestones, streaks, head-to-head), recent form, every series between them, team numbers and draft
 * tendencies, and the lanes player against player. Address: /stats/prep?teams=t1,gen-g&p=y2026
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardCopy, GitCompare, Printer } from "lucide-react";
import { tl, tc, roleName, fmtDec } from "../../i18n";
import { MissingFile, winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubPlayer, loadHubTeam, loadPlayerGames, loadPlayerGames2y, loadRatings, loadTeamGames, loadTeamGames2y, loadTeamSeries } from "../../hub/data";
import { chanceContext, matchChance, pct, seriesChance } from "../../hub/winChance";
import { Change } from "./RankingsPage";
import type { HubPlayer, HubTeam, PlayerGameRow, TeamGameRow, TeamSeriesRow } from "../../hub/types";
import { PrepRoute, hubShareUrl, navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { PeriodKey, inPeriod, playerAgg, playerRowRef, teamAgg, teamRowRef } from "../../hub/period";
import { HeadToHeadSeries } from "./Archives";
import { ComparePick, TeamRows, bothOptions } from "./ComparePage";
import { PeriodPicker, defaultPeriod } from "./PeriodStats";
import { StoryLine, StoryList, noteText } from "./Storylines";
import { CaptureContext, card, ChampIcon, fmtDate, HubLink, isFresh, Loading, OeCredit, PlayerPhoto, RevealButton, Section, useHidden, useLoad, usePageTitle, PhotosLink, NERDFINDER_TOGETHER, useRetryAttempt, retryFailedLoads } from "./ui";
import { CaptureFooter, CopyPageImage, ShareButtons } from "./ShareImage";
import { BroadcastCardButton, CardData, PoolLine, fearlessCard, playerCardData, prepOverviewCard } from "./BroadcastCard";
import type { HubRatings } from "../../hub/types";

const sgn = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v}`);

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];

export interface Side {
  team: HubTeam;
  games: TeamGameRow[];
  /** false: only the team's last two years of games so far (Match prep's quick start for big teams) */
  gamesFull?: boolean;
  series: TeamSeriesRow[];
  /** current starters by role (most games in the newest roster year); `full`: the whole career is loaded (not
   *  just the last two years) */
  players: ({ p: HubPlayer; log: PlayerGameRow[]; full: boolean } | null)[];
}

/** The last two years of a player's games (a smaller file) when the build made one, else the whole career. */
async function loadLog(slug: string): Promise<{ log: PlayerGameRow[]; full: boolean }> {
  try {
    return { log: await loadPlayerGames2y(slug), full: false };
  } catch {
    return { log: await loadPlayerGames(slug).catch(() => [] as PlayerGameRow[]), full: true };
  }
}

/** Does this period reach further back than the two-year logs? */
export function needsFullLogs(period: PeriodKey, teamGames: TeamGameRow[]): boolean {
  if (period === "all") return true;
  const cutoff = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  if (period.startsWith("y")) return period.slice(1) < cutoff.slice(0, 4);
  if (period.startsWith("e:")) {
    const first = teamGames.find((r) => r[2] === period.slice(2));
    return !!first && first[0] < cutoff;
  }
  const last = /^last(\d+)$/.exec(period);
  if (last) return Number(last[1]) > 80;
  return false;
}

/** recent: a big team's last two years of games first (Match prep: it opens on this season); the draft board wants
 *  the whole log */
export async function loadSide(slug: string, recent = false): Promise<Side> {
  const [team, series] = await Promise.all([loadHubTeam(slug), loadTeamSeries(slug).catch(() => [] as TeamSeriesRow[])]);
  const short = recent && !!team.g2y;
  const gamesP = (short ? loadTeamGames2y(team.u) : loadTeamGames(team.u)).catch(() => [] as TeamGameRow[]);
  // who played the team's latest games (the build's pick), else the most games in the newest roster year
  const latest = team.roster[0];
  const starters = ROLES.map((r) => {
    const st = team.starters?.find((x) => x[2] === r);
    if (st) return { n: st[0], u: st[1], r, g: 0 };
    return (latest?.p || []).filter((x) => x.r === r && x.u).sort((a, b) => b.g - a.g)[0] || null;
  });
  const [games, players] = await Promise.all([
    gamesP,
    Promise.all(
      starters.map((x) =>
        x && x.u
          ? Promise.all([loadHubPlayer(x.u), loadLog(x.u)])
              .then(([p, l]) => ({ p, log: l.log, full: l.full }))
              .catch(() => null)
          : Promise.resolve(null),
      ),
    ),
  ]);
  return { team, games, gamesFull: !short, series, players };
}

/** The same side with every player's whole career loaded. */
async function loadFullLogs(s: Side): Promise<Side> {
  const [games, players] = await Promise.all([
    s.gamesFull === false ? loadTeamGames(s.team.u).catch(() => s.games) : Promise.resolve(s.games),
    Promise.all(
      s.players.map(async (pl) => (!pl || pl.full ? pl : { ...pl, log: await loadPlayerGames(pl.p.u).catch(() => pl.log), full: true })),
    ),
  ]);
  return { ...s, games, gamesFull: true, players };
}

export const PrepPage: React.FC<{ route: PrepRoute }> = ({ route }) => {
  useDDragon();
  const a = route.a || null;
  const b = route.b || null;
  const [sides, setSides] = useState<{ a: Side | null; b: Side | null; failed?: boolean; missing?: boolean }>({ a: null, b: null });
  const attempt = useRetryAttempt(!!sides.failed && !sides.missing);
  useEffect(() => {
    let alive = true;
    setSides({ a: null, b: null });
    if (!a || !b) return;
    Promise.all([loadSide(a, true), loadSide(b, true)])
      .then(([x, y]) => alive && setSides({ a: x, b: y }))
      .catch((e) => alive && setSides({ a: null, b: null, failed: true, missing: e instanceof MissingFile }));
    return () => {
      alive = false;
    };
  }, [a, b, attempt]);
  usePageTitle(sides.a && sides.b ? tl("{a} vs {b}: match prep", { a: sides.a.team.name, b: sides.b.team.name }) : tl("Match prep"));
  const set = (patch: Partial<PrepRoute>) => navigateHub({ kind: "prep", a: a || undefined, b: b || undefined, period: route.period, ...patch }, { replace: true });

  if (!a || !b)
    return (
      <div className="space-y-3">
        <div className={`${card} space-y-2 text-xs`}>
          <p className="text-rw-text font-semibold">{tl("Match prep")}</p>
          <p className="text-rw-sub">{tl("Pick two teams: storylines, form, head-to-head, team numbers, draft tendencies and every lane, on one page.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((k) => (
            <div key={k} className={`${card} min-w-0`}>
              {(k === "a" ? a : b) ? (
                <button type="button" onClick={() => set({ [k]: undefined })} className="text-[11px] text-rw-teal hover:underline">
                  {tl("Change")}
                </button>
              ) : (
                <ComparePick kind="team" autoFocus={k === "a" || !!a} onPick={(slug) => set({ [k]: slug })} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  if (sides.failed)
    return (
      <div className="text-xs text-rw-sub py-6 text-center space-y-2">
        <p>{sides.missing ? tl("We couldn't find one of these teams.") : tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>
        {sides.missing ? null : (
          <button type="button" onClick={retryFailedLoads} className="text-rw-teal hover:underline mr-4">
            {tl("Try again")}
          </button>
        )}
        <button type="button" onClick={() => set({ a: undefined, b: undefined })} className="text-rw-teal hover:underline">
          {tl("Pick the teams again")}
        </button>
      </div>
    );
  if (!sides.a || !sides.b) return <Loading />;
  return <PrepView a={sides.a} b={sides.b} route={route} set={set} onFull={(x, y) => setSides({ a: x, b: y })} />;
};

/** a's chance to win one game, a best-of-three and a best-of-five (null when the two can't be compared). */
function chancesOf(a: HubTeam, b: HubTeam, ratings: HubRatings | undefined | null): [string, number][] | null {
  if (!a.rating || !b.rating || !ratings) return null;
  // second-tier leagues never meet the top ones: only compare teams on the same scale
  if ((a.rating.rank == null || b.rating.rank == null) && a.rating.league !== b.rating.league) return null;
  const adjust = ratings.adjust;
  const p = matchChance(a.rating.r, b.rating.r, chanceContext(a.rating.rank != null, b.rating.rank != null, a.rating.league, b.rating.league), adjust);
  return [
    [tl("One game"), p],
    [tl("Best of 3"), seriesChance(p, 3, adjust)],
    [tl("Best of 5"), seriesChance(p, 5, adjust)],
  ];
}

/** "#3 worldwide · #2 in LCK" */
const rankText = (t: HubTeam) =>
  !t.rating
    ? undefined
    : t.rating.rank != null
      ? tl("#{rank} worldwide · #{lrank} in {league}", { rank: t.rating.rank, lrank: t.rating.lrank, league: t.rating.league || "–" })
      : tl("#{lrank} in {league}", { lrank: t.rating.lrank, league: t.rating.league || "–" });

/** Chances from the power ratings for one game, a best-of-three and a best-of-five, and where each team ranks. */
const WinChances: React.FC<{ a: HubTeam; b: HubTeam; card?: () => CardData }> = ({ a, b, card: overview }) => {
  const ratings = useLoad(loadRatings, []);
  const rows = chancesOf(a, b, ratings.data);
  if (!rows || !ratings.data) return null;
  const acc = ratings.data?.test.all;
  return (
    <Section
      title={tl("Win chances")}
      share={`${a.u}-vs-${b.u}-win-chances`}
      right={overview ? <BroadcastCardButton data={overview} name={`${a.name}-vs-${b.name}-match-prep`} label={tl("Overview card")} /> : undefined}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span className="text-rw-teal truncate">{a.name}</span>
        <span className="text-rw-red truncate text-right">{b.name}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(([label, x]) => (
          <div key={label} className="grid grid-cols-[3rem_1fr_3rem] sm:grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs">
            <span className="tabular-nums font-bold text-rw-teal">{pct(x)}</span>
            <div className="relative h-4 rounded bg-rw-red/70 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-rw-teal/80" style={{ width: `${x * 100}%` }} />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-rw-text font-semibold">{label}</span>
            </div>
            <span className="tabular-nums font-bold text-rw-red text-right">{pct(1 - x)}</span>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-rw-sub">
        {[a, b].map((t) => (
          <p key={t.u}>
            <span className="text-rw-text font-semibold">{t.name}</span>{" "}
            {t.rating!.rank != null
              ? tl("#{rank} of {of} worldwide · #{lrank} in {league} · rating {r}", {
                  rank: t.rating!.rank,
                  of: t.rating!.of,
                  lrank: t.rating!.lrank,
                  league: t.rating!.league || "–",
                  r: t.rating!.r,
                })
              : tl("#{lrank} in {league} · rating {r}", { lrank: t.rating!.lrank, league: t.rating!.league || "–", r: t.rating!.r })}{" "}
            (<Change v={t.rating!.chg30} /> {tl("in 30 days")})
          </p>
        ))}
      </div>
      <p className="text-[10px] text-rw-muted">
        {acc && acc.n > 0
          ? tl("From the power rankings (every pro game since 2011). Since {year}, the higher-rated team won {acc} of games.", {
              year: ratings.data!.test.from.slice(0, 4),
              acc: pct(acc.acc || 0),
            })
          : tl("From the power rankings (every pro game since 2011).")}{" "}
        <HubLink to={{ kind: "rankings" }} className="text-rw-teal hover:underline" >
          {tl("Power rankings")}
        </HubLink>
      </p>
    </Section>
  );
};

/**
 * Printing: mounts a print-only copy of the page straight under <body> (outside the app's scrolling layout, which
 * would cut it at one screen), then opens the print dialog once pictures had a moment to load.
 */
function usePrint(): { on: boolean; start: () => void } {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    document.body.classList.add("rw-printing");
    const done = () => setOn(false);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 900);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("rw-printing");
    };
  }, [on]);
  // clicking again starts over (in case a browser never said the dialog closed)
  return {
    on,
    start: () => {
      setOn(false);
      window.setTimeout(() => setOn(true), 0);
    },
  };
}

const PrepView: React.FC<{ a: Side; b: Side; route: PrepRoute; set: (p: Partial<PrepRoute>) => void; onFull: (a: Side, b: Side) => void }> = ({
  a,
  b,
  route,
  set,
  onFull,
}) => {
  const options = useMemo(() => bothOptions(a.games.map(teamRowRef), b.games.map(teamRowRef)), [a.games, b.games]);
  const period: PeriodKey = route.period && options.some((o) => o.key === route.period) ? route.period : defaultPeriod(options);
  // an older period needs the players' whole careers: fetch them once, then stay on them
  // (also a shared link to an older season, which the two-year lists don't offer yet)
  const notFull = a.gamesFull === false || b.gamesFull === false || [...a.players, ...b.players].some((p) => p && !p.full);
  const askedOlder = !!route.period && !options.some((o) => o.key === route.period);
  const wantFull = notFull && (askedOlder || needsFullLogs(period, [...a.games, ...b.games]));
  useEffect(() => {
    if (!wantFull) return;
    let alive = true;
    Promise.all([loadFullLogs(a), loadFullLogs(b)]).then(([x, y]) => alive && onFull(x, y));
    return () => {
      alive = false;
    };
  }, [wantFull]); // eslint-disable-line react-hooks/exhaustive-deps
  const opt = options.find((o) => o.key === period);
  const periodLabel = !opt || opt.key === "all" ? tl("All time") : opt.group === "basic" ? tl("Last {n} games", { n: opt.label }) : opt.label;
  const ra = useMemo(() => inPeriod(a.games, period, teamRowRef), [a.games, period]);
  const rb = useMemo(() => inPeriod(b.games, period, teamRowRef), [b.games, period]);
  const fresh = [...ra, ...rb].map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`prep:${a.team.u}:${b.team.u}:${period}`, fresh);
  const title = `${a.team.name} vs ${b.team.name}`;
  const printing = usePrint();
  const pageRef = useRef<HTMLDivElement>(null);
  // one-game win chance from the power ratings, for the 16:9 card (same rule as Win chances below)
  const ratings = useLoad(loadRatings, []);
  const chance = useMemo<[number, number] | null>(() => {
    const x = a.team.rating;
    const y = b.team.rating;
    if (!x || !y || !ratings.data) return null;
    if ((x.rank == null || y.rank == null) && x.league !== y.league) return null;
    const p = matchChance(x.r, y.r, chanceContext(x.rank != null, y.rank != null, x.league, y.league), ratings.data.adjust);
    const pa = Math.round(p * 100);
    return [pa, 100 - pa];
  }, [a.team.rating, b.team.rating, ratings.data]);
  // the form squares, head-to-head and storylines show recent results: left out of the card and post while hidden
  const lastTen = (s: Side) => [...s.series].sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, 10);
  const formFresh = [...lastTen(a), ...lastTen(b)].map((r) => r[0]).find((d) => isFresh(d));
  const [formHidden] = useHidden(`prep-form:${a.team.u}:${b.team.u}`, formFresh);
  const meetings = a.series.filter((r) => r[2] === b.team.u);
  const h2hWins = meetings.filter((r) => r[3] > r[4]).length;
  // storylines as plain text (the ones written as text: all of them today) for the card and the post
  const stories = useMemo(
    () =>
      prepLines(a, b)
        // the series record has its own place on the card and in the post
        .filter((l) => l.key !== "h2h" && (typeof l.text === "string" || typeof l.text === "number"))
        .map((l) => (l.who ? `${l.who.name}: ${l.text}` : String(l.text))),
    [a, b],
  );
  const pools = useMemo(() => fearlessPools(a, b, period), [a, b, period]);
  const overview = (): CardData =>
    prepOverviewCard({
      a: { name: a.team.name, rank: rankText(a.team), chg: a.team.rating?.chg30, form: formHidden ? [] : lastTen(a).map((r) => r[3] > r[4]) },
      b: { name: b.team.name, rank: rankText(b.team), chg: b.team.rating?.chg30, form: formHidden ? [] : lastTen(b).map((r) => r[3] > r[4]) },
      chances: chancesOf(a.team, b.team, ratings.data) || [],
      h2h: !formHidden && meetings.length ? [h2hWins, meetings.length - h2hWins] : null,
      stories: formHidden ? [] : stories,
      period: periodLabel,
    });
  // a ready-to-post summary for X: chances, early game, head-to-head, a storyline, the Fearless pinch point, the link
  const postText = () => {
    const lines = [`${a.team.name} vs ${b.team.name} — ${tl("Match prep")} (${periodLabel})`];
    const ch = chancesOf(a.team, b.team, ratings.data);
    // Bo1 55%-45% · Bo3 58%-42% · Bo5 60%-40%
    if (ch) lines.push(`${tl("Win chances")}: ${ch.map(([, p], i) => `${tc("short best of", "Bo{n}", { n: [1, 3, 5][i] })} ${Math.round(p * 100)}%-${Math.round((1 - p) * 100)}%`).join(" · ")}`);
    const ga = teamAgg(ra).tl?.gd15;
    const gb = teamAgg(rb).tl?.gd15;
    if (!hidden && (ga != null || gb != null)) lines.push(`${tl("Gold @15")}: ${a.team.name} ${sgn(ga ?? null)} · ${b.team.name} ${sgn(gb ?? null)}`);
    if (!formHidden && meetings.length) lines.push(`${tl("Head to head (series)")}: ${a.team.name} ${h2hWins}-${meetings.length - h2hWins} ${b.team.name}`);
    if (!formHidden && stories[0]) lines.push(stories[0]);
    if (!hidden && pools.pinch) lines.push(`${tl("Fearless pinch point")}: ${pools.pinch.name} (${pools.pinch.team}, ${roleName(pools.pinch.role)}) · ${tl("{n} with 2+ games", { n: pools.pinch.deep })}`);
    lines.push(hubShareUrl({ kind: "prep", a: a.team.u, b: b.team.u, period }));
    return lines.join("\n");
  };
  const body = (print: boolean) => (
    <>
      <WinChances a={a.team} b={b.team} card={print ? undefined : overview} />
      <PrepStorylines a={a} b={b} />
      <Form a={a} b={b} />
      <HeadToHeadSeries a={a.team.u} b={b.team.u} aName={a.team.name} bName={b.team.name} />
      {hidden ? (
        !print && (
          <div className={`${card} py-4 text-center`}>
            <RevealButton onReveal={reveal} />
          </div>
        )
      ) : (
        <>
          <TeamRows x={a.team} y={b.team} ra={ra} rb={rb} bSlug={b.team.u} career={period === "all"} periodLabel={periodLabel} chance={chance} />
          <Lanes a={a} b={b} period={period} periodLabel={periodLabel} title={title} />
          <FearlessDepth a={a} b={b} period={period} periodLabel={periodLabel} title={title} />
        </>
      )}
    </>
  );

  return (
    <CaptureContext.Provider value={`${title} · ${periodLabel}`}>
    <div className="rw-page" ref={pageRef}>
      <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-rw-accent">{tl("Match prep")}</div>
          <h2 className="text-lg font-bold text-rw-text truncate">
            <HubLink to={{ kind: "team", slug: a.team.u }}>{a.team.name}</HubLink>
            <span className="text-rw-muted font-normal"> vs </span>
            <HubLink to={{ kind: "team", slug: b.team.u }}>{b.team.name}</HubLink>
          </h2>
          {/* only in the copied picture, where the controls are left out */}
          <div className="rw-capture-only text-[11px] text-rw-sub gap-1">
            {periodLabel} · {new Date().toISOString().slice(0, 10)} · RiftWise Pro Stats · riftwise.gg
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs" data-nocapture="1">
          <span className="text-rw-muted">{tl("Stats for")}</span>
          <PeriodPicker options={options} value={period} onChange={(p) => set({ period: p })} />
          <HubLink
            to={{ kind: "compare", mode: "team", a: a.team.u, b: b.team.u, period }}
            className="flex items-center gap-1 min-h-8 px-1.5 rounded text-rw-teal hover:underline"
          >
            <GitCompare className="w-3.5 h-3.5" />
            {tl("Compare")}
          </HubLink>
          {/* icons with their name on hover, to keep the bar short */}
          <button
            type="button"
            onClick={printing.start}
            className="flex items-center gap-1 min-h-8 px-1.5 rounded text-rw-teal hover:text-rw-text"
            title={tl("Print a caster sheet: everything on this page, on paper or as a PDF")}
            aria-label={tl("Print sheet")}
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
          <CopyPageImage target={pageRef} name={`${title} match prep`} iconOnly />
          <CopyPost text={postText} />
        </div>
      </div>

      {body(false)}
      {printing.on &&
        createPortal(
          <div className="rw-sheet space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
              <h1 className="text-xl font-bold">{title}</h1>
              <span className="text-xs">
                {tl("Match prep")} · {periodLabel} · {new Date().toISOString().slice(0, 10)} · RiftWise Pro Stats · riftwise.gg
              </span>
            </div>
            {body(true)}
          </div>,
          document.body,
        )}
    </div>
    </CaptureContext.Provider>
  );
};

/** "Copy post": a ready-to-post summary of the matchup with its link, for X / Twitter or Discord. */
const CopyPost: React.FC<{ text: () => string }> = ({ text }) => {
  const [state, setState] = useState<"" | "copied" | "failed">("");
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(""), 2200);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text()).then(() => setState("copied"), () => setState("failed"))}
      className="flex items-center gap-1 min-h-8 px-1.5 rounded text-rw-teal hover:text-rw-text"
      title={`${tl("Copy post")}: ${tl("Copy a ready-to-post summary with the link, for X or Discord")}`}
      aria-label={tl("Copy post")}
    >
      <ClipboardCopy className="w-3.5 h-3.5" />
      {state === "copied" ? <span className="text-[11px]">{tl("Copied")}</span> : state === "failed" ? <span className="text-[11px]">{tl("Couldn't copy")}</span> : null}
    </button>
  );
};

/** Head-to-head facts plus both teams' and their starters' storylines. */
function prepLines(a: Side, b: Side): StoryLine[] {
  const lines: StoryLine[] = [];
  const meetings = a.series.filter((r) => r[2] === b.team.u).sort((x, y) => (x[0] < y[0] ? 1 : -1));
  if (!meetings.length) {
    lines.push({ key: "first", text: tl("First ever meeting between these teams") });
  } else {
    const [date, , , won, lost, en] = meetings[0];
    const winner = won > lost ? a.team.name : b.team.name;
    lines.push({
      key: "last",
      text: tl("Last meeting: {team} won {score} ({event}, {date})", { team: winner, score: `${Math.max(won, lost)}-${Math.min(won, lost)}`, event: en, date: fmtDate(date) }),
      asOf: date,
    });
    const aWonFirst = meetings[0][3] > meetings[0][4];
    let n = 0;
    for (const m of meetings) {
      if (m[3] > m[4] !== aWonFirst) break;
      n++;
    }
    if (n >= 2) lines.push({ key: "h2hstreak", text: tl("{team} have won the last {n} meetings", { team: aWonFirst ? a.team.name : b.team.name, n }), asOf: date });
    const wa = meetings.filter((m) => m[3] > m[4]).length;
    lines.push({ key: "h2h", text: tl("Series between them: {a} {wa}-{wb} {b}", { a: a.team.name, b: b.team.name, wa, wb: meetings.length - wa }), asOf: date });
  }
  for (const s of [a, b]) {
    for (const [i, nt] of (s.team.notes?.list || []).entries())
      lines.push({ key: `${s.team.u}-${i}`, who: { name: s.team.name, to: { kind: "team", slug: s.team.u } }, text: noteText(nt), asOf: s.team.notes?.asOf });
    for (const pl of s.players)
      if (pl?.p.notes)
        for (const [i, nt] of pl.p.notes.list.entries())
          lines.push({ key: `${pl.p.u}-${i}`, who: { name: pl.p.name, to: { kind: "player", slug: pl.p.u } }, text: noteText(nt), asOf: pl.p.notes.asOf });
  }
  return lines;
}

const PrepStorylines: React.FC<{ a: Side; b: Side }> = ({ a, b }) => (
  <StoryList lines={prepLines(a, b)} spoilerKey={`prep-notes:${a.team.u}:${b.team.u}`} share={`${a.team.name}-vs-${b.team.name}-storylines`} />
);

/** Each team's last 10 series. */
const Form: React.FC<{ a: Side; b: Side }> = ({ a, b }) => {
  const last = (s: Side) => [...s.series].sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, 10);
  const la = last(a);
  const lb = last(b);
  const fresh = [...la, ...lb].map((r) => r[0]).find((d) => isFresh(d));
  const [hidden, reveal] = useHidden(`prep-form:${a.team.u}:${b.team.u}`, fresh);
  return (
    <Section title={tl("Form: last 10 series")} share={`${a.team.name}-vs-${b.team.name}-form`}>
      {hidden ? (
        <div className="py-2 text-center">
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <div className="space-y-2">
          {[
            { s: a, rows: la },
            { s: b, rows: lb },
          ].map(({ s, rows }) => {
            const w = rows.filter((r) => r[3] > r[4]).length;
            return (
              <div key={s.team.u} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="w-32 truncate font-semibold text-rw-text">{s.team.name}</span>
                <span className="text-rw-sub w-10 tabular-nums">
                  {w}-{rows.length - w}
                </span>
                {rows.map((r) => {
                  const won = r[3] > r[4];
                  return (
                    <span
                      key={`${r[0]}-${r[7]}-${r[1]}`}
                      title={`${won ? tc("short result", "W") : tc("short result", "L")} ${r[3]}-${r[4]} vs ${r[1]} · ${r[5]} · ${fmtDate(r[0])}`}
                      className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                        won ? "bg-rw-teal/20 text-rw-teal" : "bg-rw-red/20 text-rw-red"
                      }`}
                    >
                      {won ? tc("short result", "W") : tc("short result", "L")}
                    </span>
                  );
                })}
              </div>
            );
          })}
          <p className="text-[10px] text-rw-muted">{tl("Newest first; hover a square for the opponent and score.")}</p>
        </div>
      )}
    </Section>
  );
};

/**
 * Fearless pool depth: each starter's champions in the period, most played first. In a Fearless Bo5 every champion
 * a team picks is gone for the rest of the series, so a role needs up to five; the shallowest pool (fewest
 * champions with 2+ games) is where the other team can squeeze in games 3-5.
 */
/** Each starter's champions in the period (most played first), and the shallowest pool of all ten. */
function fearlessPools(a: Side, b: Side, period: PeriodKey) {
  const of = (pl: Side["players"][number]) => {
    if (!pl) return null;
    const m = new Map<string, [number, number]>();
    for (const g of inPeriod(pl.log, period, playerRowRef)) {
      if (!g[2]) continue;
      const x = m.get(g[2]) || [0, 0];
      x[0]++;
      x[1] += g[6];
      m.set(g[2], x);
    }
    const list = [...m.entries()].sort((p, q) => q[1][0] - p[1][0]);
    return { name: pl.p.name, list, deep: list.filter(([, x]) => x[0] >= 2).length };
  };
  const pa = a.players.map(of);
  const pb = b.players.map(of);
  const all = [...pa, ...pb].filter((x): x is NonNullable<typeof x> => !!x && x.list.length > 0);
  const minDeep = all.length ? Math.min(...all.map((x) => x.deep)) : 0;
  let pinch: { name: string; team: string; role: string; deep: number } | null = null;
  ROLES.forEach((role, i) => {
    for (const [x, team] of [[pa[i], a.team.name], [pb[i], b.team.name]] as const)
      if (!pinch && x && x.list.length > 0 && x.deep === minDeep) pinch = { name: x.name, team, role, deep: x.deep };
  });
  return { a: pa, b: pb, enough: all.length >= 4, minDeep, pinch: pinch as { name: string; team: string; role: string; deep: number } | null };
}

export const FearlessDepth: React.FC<{ a: Side; b: Side; period: PeriodKey; periodLabel: string; title: string }> = ({
  a,
  b,
  period,
  periodLabel,
  title,
}) => {
  const pools = useMemo(() => fearlessPools(a, b, period), [a, b, period]);
  if (!pools.enough) return null;
  const minDeep = pools.minDeep;
  const line = (x: (typeof pools.a)[number]): PoolLine | null => (x ? { name: x.name, list: x.list.map(([c, [g]]) => [c, g]), deep: x.deep } : null);
  const cell = (x: (typeof pools.a)[number], right: boolean) =>
    !x ? (
      <span className="text-rw-muted">–</span>
    ) : (
      <div className={`min-w-0 space-y-1 ${right ? "text-right" : ""}`}>
        <div className={`text-[11px] ${x.deep === minDeep ? "text-rw-red font-bold" : "text-rw-sub"}`}>
          {x.name} · {tl("{n} with 2+ games", { n: x.deep })}
          {x.deep === minDeep && ` · ${tl("pinch point")}`}
        </div>
        <div className={`flex flex-wrap gap-1 ${right ? "justify-end" : ""}`}>
          {x.list.slice(0, 10).map(([c, [g, w]]) => (
            <span key={c} className={`flex items-center gap-0.5 text-[10px] ${g >= 2 ? "text-rw-sub" : "text-rw-muted opacity-60"}`} title={`${champName(c)} · ${g} · ${winRate(w, g)}`}>
              <ChampIcon name={c} size={18} />
              {g}
            </span>
          ))}
          {x.list.length > 10 && <span className="text-[10px] text-rw-muted self-center">+{x.list.length - 10}</span>}
        </div>
      </div>
    );
  return (
    <Section
      title={tl("Fearless pool depth")}
      right={
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-rw-sub">{periodLabel}</span>
          <BroadcastCardButton
            data={() =>
              fearlessCard({
                aName: a.team.name,
                bName: b.team.name,
                rows: ROLES.map((role, i) => ({ role, a: line(pools.a[i]), b: line(pools.b[i]) })),
                period: periodLabel,
              })
            }
            name={`${title}-fearless`}
          />
        </span>
      }
      share={`${title}-fearless-${periodLabel}`}
    >
      <ul className="divide-y divide-rw-border">
        {ROLES.map((r, i) => (
          <li key={r} className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 py-2">
            {cell(pools.a[i], false)}
            <span className="text-[10px] uppercase tracking-wider font-bold text-rw-accent text-center min-w-14 px-1 whitespace-nowrap pt-0.5">{roleName(r)}</span>
            {cell(pools.b[i], true)}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-rw-muted">
        {tl("In Fearless, champions a team picks are gone for the rest of the series, so a Bo5 can need five per role. Red = the shallowest pool (fewest champions with 2+ games): the place to target in games 3-5.")}
      </p>
    </Section>
  );
};

/** Lane by lane: each team's starter, their numbers in the period and most played champions. */
const Lanes: React.FC<{ a: Side; b: Side; period: PeriodKey; periodLabel: string; title: string }> = ({ a, b, period, periodLabel, title }) => {
  const stats = (pl: Side["players"][number]) => {
    if (!pl) return null;
    const rows = inPeriod(pl.log, period, playerRowRef);
    return rows.length ? playerAgg(rows) : null;
  };
  // one lane as a side-by-side table: a stat per row, the better number lit up
  const fmt1 = (v: number) => fmtDec(v);
  const lane = (r: string, pa: Side["players"][number], pb: Side["players"][number]) => {
    const sa = stats(pa);
    const sb = stats(pb);
    type Line = [string, number | null | undefined, number | null | undefined, (v: number) => string, string?];
    const wr = (x: typeof sa) => (x && x.g ? (x.w / x.g) * 100 : null);
    const lines: Line[] = [
      [tl("Games"), sa?.g, sb?.g, (v) => String(v)],
      [tl("Win rate"), wr(sa), wr(sb), (v) => `${Math.round(v)}%`],
      ["KDA", sa?.kda, sb?.kda, (v) => fmtDec(v, 2)],
      ["KP", sa?.kp, sb?.kp, (v) => `${Math.round(v)}%`, tl("Kill participation")],
      [tl("CS/m"), sa?.csm, sb?.csm, fmt1],
      [tl("DPM"), sa?.dpm, sb?.dpm, (v) => String(Math.round(v))],
      [tl("DMG%"), sa?.dmgShare, sb?.dmgShare, (v) => `${Math.round(v)}%`],
      [tl("Gold @15"), sa?.tl?.gd15, sb?.tl?.gd15, (v) => sgn(v), tl("Average lead over the lane opponent at 15 minutes")],
      [tl("CS @15"), sa?.tl?.csd15, sb?.tl?.csd15, (v) => sgn(v)],
      [tl("XP @15"), sa?.tl?.xpd15, sb?.tl?.xpd15, (v) => sgn(v)],
    ];
    const pool = (x: typeof sa) => (x ? `${x.champs.length} (${x.champs.filter((c) => c.g >= 2).length})` : "–");
    const icons = (x: typeof sa, right: boolean) =>
      x ? (
        <div className={`flex gap-1 flex-wrap ${right ? "" : "justify-end"}`}>
          {x.champs.slice(0, 4).map((c) => (
            <span key={c.c} className="flex items-center gap-0.5 text-[10px] text-rw-sub" title={`${champName(c.c)} · ${c.g} · ${winRate(c.w, c.g)}`}>
              <ChampIcon name={c.c} size={18} />
              {c.g}
            </span>
          ))}
        </div>
      ) : null;
    const name = (pl: Side["players"][number], right: boolean) =>
      pl ? (
        <span className={`flex items-center gap-1.5 min-w-0 ${right ? "" : "flex-row-reverse"}`}>
          <HubLink to={{ kind: "player", slug: pl.p.u }} className={`text-sm font-bold text-rw-text hover:underline truncate ${right ? "" : "text-right"}`}>
            {pl.p.name}
          </HubLink>
          <PhotosLink q={pl.p.name} iconOnly className="text-rw-muted hover:text-rw-teal shrink-0" />
        </span>
      ) : (
        <span className="text-rw-muted">–</span>
      );
    const val = "tabular-nums text-[11px] py-0.5";
    const laneCard = (): CardData | null =>
      pa && pb && sa && sb
        ? playerCardData({ name: pa.p.name, role: roleName(r), club: a.team.name }, sa, periodLabel, { name: pb.p.name, role: roleName(r), club: b.team.name }, sb)
        : null;
    return (
      <LaneBlock
        label={`${pa?.p.name || "–"} vs ${pb?.p.name || "–"} · ${roleName(r)}`}
        name={`${title}-${r}-${periodLabel}`}
        card={laneCard}
        left={pa ? <PlayerPhoto name={pa.p.name} team={a.team.name} slug={pa.p.u} sizeClass="w-16 h-16 lg:w-24 lg:h-24 2xl:w-32 2xl:h-32" /> : null}
        right={pb ? <PlayerPhoto name={pb.p.name} team={b.team.name} slug={pb.p.u} sizeClass="w-16 h-16 lg:w-24 lg:h-24 2xl:w-32 2xl:h-32" /> : null}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0 flex justify-end">{name(pa, false)}</div>
          <span className="text-[10px] uppercase tracking-wider font-bold text-rw-accent text-center min-w-16 px-1 whitespace-nowrap">{roleName(r)}</span>
          <div className="min-w-0 flex">{name(pb, true)}</div>
        </div>
        {sa || sb ? (
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] gap-x-3">
            {lines
              .filter(([, va, vb]) => va != null || vb != null)
              .map(([label, va, vb, f, hint]) => {
                const better = va != null && vb != null && va !== vb ? (va > vb ? "a" : "b") : null;
                return (
                  <React.Fragment key={label}>
                    <span className={`${val} text-right ${better === "a" ? "text-rw-teal font-semibold" : "text-rw-sub"}`}>{va != null ? f(va) : "–"}</span>
                    <span className={`${val} text-rw-muted text-center w-16`} title={hint}>
                      {label}
                    </span>
                    <span className={`${val} ${better === "b" ? "text-rw-teal font-semibold" : "text-rw-sub"}`}>{vb != null ? f(vb) : "–"}</span>
                  </React.Fragment>
                );
              })}
            <span className={`${val} text-right text-rw-sub`}>{pool(sa)}</span>
            <span className={`${val} text-rw-muted text-center w-16`} title={tl("Champions played in this period (in brackets: 2+ games)")}>
              {tl("Pool")}
            </span>
            <span className={`${val} text-rw-sub`}>{pool(sb)}</span>
          </div>
        ) : (
          <div className="text-[11px] text-rw-muted text-center">{tl("No games in this period")}</div>
        )}
        <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] gap-x-3">
          {icons(sa, false) || <span />}
          <span className="w-16" />
          {icons(sb, true) || <span />}
        </div>
      </LaneBlock>
    );
  };
  return (
    <Section title={tl("Lane by lane")} right={<span className="text-[11px] text-rw-sub">{periodLabel}</span>} share={`${title}-lanes-${periodLabel}`}>
      <ul className="divide-y divide-rw-border">
        {ROLES.map((r, i) => (
          <li key={r}>{lane(r, a.players[i], b.players[i])}</li>
        ))}
      </ul>
      <p className="text-[10px] text-rw-muted">{tl("Starters: the players with the most games in each team's newest roster. The better number of each pair is highlighted; champions with games played.")}</p>
      <p className="text-[10px] text-rw-muted" data-nocapture="1">
        {tl("Photos: the camera by a name opens Riot's event photos of that player on NerdFinder.")}{" "}
        <PhotosLink
          q=""
          url={NERDFINDER_TOGETHER}
          label={tl("Find two players in the same photo")}
          title={tl("NerdFinder's Together search: pick two players and see every photo they're both in")}
          className="inline-flex items-center gap-1 text-rw-teal hover:underline"
        />
      </p>
      <OeCredit />
    </Section>
  );
};

/**
 * One lane of "Lane by lane", with its own picture (just this 1v1, named on top) and 16:9 card, for posting about one
 * matchup without the other four.
 */
const LaneBlock: React.FC<{
  label: string;
  name: string;
  card: () => CardData | null;
  /** the two players' photos, on the outer sides (from a medium-wide window on) */
  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, name, card, left, right, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const data = card();
  return (
    <div className="flex items-center justify-center gap-6 lg:gap-12">
      <div className="hidden md:flex w-16 lg:w-24 2xl:w-32 justify-center">{left}</div>
      <div ref={ref} className="relative py-2.5 w-full max-w-lg">
        <div className="rw-capture-only rw-section-context text-sm font-extrabold text-rw-text pb-1">{label}</div>
        <div className="absolute right-0 top-2 flex items-center gap-1" data-nocapture="1">
          {data && <BroadcastCardButton data={() => card() as CardData} name={name} label={tl("Lane card")} compact />}
          <ShareButtons target={ref} name={name} />
        </div>
        {children}
        <CaptureFooter />
      </div>
      <div className="hidden md:flex w-16 lg:w-24 2xl:w-32 justify-center">{right}</div>
    </div>
  );
};
