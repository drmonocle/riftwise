/**
 * The game being played in a live series, from Riot's live-stats feed (src/liveGame.ts): game clock, gold and
 * gold lead, kills, towers, dragons, barons and inhibitors for both teams, and on demand every player's champion,
 * level, K/D/A, CS, gold, items, kill share and damage share plus a gold-lead graph. Refreshes every 15 seconds
 * while the page is visible. Between games it shows the last game's final numbers.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Game, Match } from "../types";
import { tl, roleName, fmtDec } from "../i18n";
import {
  LiveDetailsParticipant,
  LiveFrame,
  LiveParticipantMeta,
  LiveWindow,
  fetchTimeline,
  timelinePoint,
  type TimelinePoint,
  winChanceFromGold,
  fetchLiveDetails,
  fetchLiveStart,
  fetchLiveWindow,
  feedNow,
} from "../liveGame";
import { champIcon, champNameById, itemIconById, useDDragon } from "../hub/ddragon";
import { champName } from "../champions";
import { useMatchRatings } from "../hub/matchRatings";
import { gameStory } from "../gameStory";
import { smoothPath, useWidth } from "../useWidth";

const POLL_MS = 15_000;
// the gold graph: blue side's colour, and its dragon and baron marks
const BLUE = "#3fa7ff";
const DRAGON = "#f0a04b";
const BARON = "#a970ff";
const ROLE_ORDER = ["top", "jungle", "mid", "bottom", "support"];
const ROLE_LABEL: Record<string, string> = { top: "Top", jungle: "Jungle", mid: "Mid", bottom: "Bot", support: "Support" };
const DRAGON_COLOR: Record<string, string> = {
  infernal: "var(--rw-red)",
  ocean: "#3fa7ff",
  mountain: "#b08a5a",
  cloud: "#d8e2ec",
  hextech: "#4ee6ff",
  chemtech: "#8bd450",
  elder: "var(--rw-text)",
};

const k = (gold: number) => `${fmtDec(gold / 1000)}k`;
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/** "MVK Kratos" -> "Kratos" */
const playerName = (n: string) => n.replace(/^\S+\s+/, "") || n;

function dragonName(type: string): string {
  const names: Record<string, string> = {
    infernal: tl("Infernal drake"),
    ocean: tl("Ocean drake"),
    mountain: tl("Mountain drake"),
    cloud: tl("Cloud drake"),
    hextech: tl("Hextech drake"),
    chemtech: tl("Chemtech drake"),
    elder: tl("Elder dragon"),
  };
  return names[type] || type;
}

interface GameState {
  win: LiveWindow;
  frame: LiveFrame;
  startMs: number | null;
  details: LiveDetailsParticipant[] | null;
}

/** `only`: show that game (a finished match's games on the schedule); `startOpen`: players and items shown at once. */
export const LiveGamePanel: React.FC<{ match: Match; showStats: boolean; only?: Game; startOpen?: boolean }> = ({ match, showStats, only, startOpen }) => {
  useDDragon();
  // The game in progress, or between games the one that just ended
  const game = useMemo(() => {
    if (only) return only;
    const games = match.games || [];
    return games.find((g) => g.state === "inProgress") || [...games].reverse().find((g) => g.state === "completed") || null;
  }, [match.games, only]);
  const live = game?.state === "inProgress";
  const [state, setState] = useState<GameState | null>(null);
  const [failed, setFailed] = useState(false);
  // failed asks in a row: Riot's feed drops one now and then (TV, 2026-10-28, mid-game at Worlds: "no live stats"),
  // so the panel says so only after three, and asks again within seconds in the meantime
  const misses = useRef(0);
  const [open, setOpen] = useState(!!startOpen);
  const [history, setHistory] = useState<TimelinePoint[] | null>(null);
  // the model's chance for team 1 to win a game, before it started (the upset meter's starting point)
  const ratings = useMatchRatings(match);
  const startRef = useRef<Record<string, number>>({});
  // the game's first frames (who plays what): all there is when Riot switches a game's live stats off
  const firstRef = useRef<Record<string, LiveWindow>>({});
  const [draft, setDraft] = useState<LiveWindow | null>(null);
  // the next game of the series starts with a clean slate (not game 1's numbers and gold graph)
  useEffect(() => {
    setState(null);
    setHistory(null);
    setDraft(null);
    setFailed(false);
    misses.current = 0;
  }, [game?.id]);

  useEffect(() => {
    if (!game || !showStats) return;
    let alive = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        if (startRef.current[game.id] == null) {
          const first = await fetchLiveStart(game.id);
          const t = first?.frames?.[0]?.rfc460Timestamp;
          if (t) startRef.current[game.id] = Date.parse(t);
          if (first?.gameMetadata) firstRef.current[game.id] = first;
        }
        // a finished game: ask well past its end, the feed answers with its last frames
        const w = await fetchLiveWindow(game.id, live ? undefined : feedNow() - 60_000);
        const frame = w?.frames?.[w.frames.length - 1];
        if (!alive) return;
        if (!w || !frame) {
          setState(null);
          // the game has started (it has a first frame) but the feed won't give later ones: Riot has switched this
          // game's live stats off (EMEA Masters and other events do). The draft is still worth showing.
          const first = firstRef.current[game.id];
          setDraft(first && startRef.current[game.id] != null ? first : null);
        } else {
          setDraft(null);
          const det = open ? await fetchLiveDetails(game.id, live ? undefined : feedNow() - 60_000).catch(() => null) : null;
          if (!alive) return;
          const players = det?.frames?.[det.frames.length - 1]?.participants ?? null;
          setState((prev) => ({ win: w, frame, startMs: startRef.current[game.id] ?? null, details: players ?? prev?.details ?? null }));
          setFailed(false);
          misses.current = 0;
          if (frame.gameState === "finished") return; // final numbers: no need to keep asking
        }
      } catch {
        if (alive && ++misses.current >= 3) setFailed(true);
      }
      // after a miss: again in five seconds (a finished game too, up to three times); otherwise the usual pace
      if (alive && misses.current > 0 && (live || misses.current < 3)) timer = window.setTimeout(load, 5_000);
      else if (alive && live) timer = window.setTimeout(load, document.hidden ? POLL_MS * 4 : POLL_MS);
    };
    load();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [game, live, open, showStats]);

  // Gold-lead graph: about one point a minute (fewer for long games), loaded with the stats and kept up to date after
  useEffect(() => {
    if (!state?.startMs || !game) return;
    let alive = true;
    const end = Date.parse(state.frame.rfc460Timestamp);
    if (!history) {
      fetchTimeline(game.id, state.startMs, end).then((pts) => alive && setHistory(pts));
    } else {
      const now = timelinePoint(state.frame, state.startMs);
      const last = history[history.length - 1];
      if (!last || now.t - last.t >= 0.25) setHistory([...history, now]);
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.frame, state?.startMs, game?.id]);

  if (!game) return null;
  if (!showStats)
    return <p className="text-[11px] text-rw-muted text-center py-1">{tl("Live game stats are hidden while spoiler mode is on.")}</p>;
  if (!state && draft) return <DraftOnly match={match} win={draft} number={game.number} startMs={startRef.current[game.id] ?? null} live={live} />;
  if (!state)
    return (
      <p className="text-[11px] text-rw-muted text-center pt-2">
        {failed
          ? tl("Live game stats aren't available right now.")
          : live
            ? tl("Game {n}: live stats appear here once the game starts (after champion select).", { n: game.number })
            : null}
      </p>
    );

  const { win, frame } = state;
  // Which side each team plays on this game
  const blueIsTeam1 = match.team1Id
    ? win.gameMetadata.blueTeamMetadata.esportsTeamId === match.team1Id
    : (win.gameMetadata.blueTeamMetadata.participantMetadata[0]?.summonerName || "").toUpperCase().startsWith(match.team1Code.toUpperCase() + " ");
  const sides = [
    { code: blueIsTeam1 ? match.team1Code : match.team2Code, t: frame.blueTeam, meta: win.gameMetadata.blueTeamMetadata.participantMetadata, color: "#3fa7ff" },
    { code: blueIsTeam1 ? match.team2Code : match.team1Code, t: frame.redTeam, meta: win.gameMetadata.redTeamMetadata.participantMetadata, color: "var(--rw-red)" },
  ];
  // Team 1 on the left like the scoreboard above
  const [left, right] = blueIsTeam1 ? sides : [sides[1], sides[0]];
  const lead = left.t.totalGold - right.t.totalGold;
  const share = left.t.totalGold + right.t.totalGold > 0 ? left.t.totalGold / (left.t.totalGold + right.t.totalGold) : 0.5;
  const elapsed = state.startMs ? Date.parse(frame.rfc460Timestamp) - state.startMs : null;
  const finished = frame.gameState === "finished";
  const paused = frame.gameState === "paused";

  return (
    <div className="mt-3 pt-3 border-t border-rw-border/60 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold uppercase tracking-wider text-[10px] text-rw-accent">
          {finished ? tl("Game {n} · final", { n: game.number }) : tl("Game {n} · live", { n: game.number })}
          {elapsed != null && <span className="ml-2 font-mono text-rw-text">{clock(elapsed)}</span>}
          {paused && <span className="ml-2 text-rw-red">{tl("Paused")}</span>}
        </span>
        {win.gameMetadata.patchVersion && (
          <span className="text-[10px] text-rw-muted">{tl("Patch {patch}", { patch: win.gameMetadata.patchVersion.split(".").slice(0, 2).join(".") })}</span>
        )}
      </div>

      {/* Gold and objectives: both teams and the difference */}
      <StatsTable left={left} right={right} minutes={elapsed != null ? elapsed / 60_000 : null} />
      <div className="h-1.5 rounded overflow-hidden bg-rw-red/60" aria-hidden="true" title={tl("Share of the gold")}>
        <div className="h-full bg-rw-teal/80" style={{ width: `${share * 100}%` }} />
      </div>
      {!finished && elapsed != null && elapsed > 60_000 && <ChanceNow leftCode={left.code} rightCode={right.code} minute={elapsed / 60_000} lead={lead} />}
      {!finished && elapsed != null && elapsed > 3 * 60_000 && ratings?.game != null && (
        <UpsetMeter leftCode={left.code} rightCode={right.code} before={ratings.game} now={winChanceFromGold(elapsed / 60_000, lead)} />
      )}
      {history && history.length > 1 && <GoldGraph points={history} blueIsLeft={blueIsTeam1} leftCode={left.code} rightCode={right.code} />}
      {finished && history && <GameStory points={history} left={left.code} right={right.code} blueIsLeft={blueIsTeam1} />}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 mx-auto text-[11px] text-rw-teal hover:underline"
        aria-expanded={open}
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? tl("Hide players") : tl("Players and items")}
      </button>

      {open && (
        <div className="space-y-3">
          <Players left={left} right={right} details={state.details} />
          {!finished && <p className="text-[10px] text-rw-muted">{tl("From Riot's live stats feed, about a minute behind the broadcast.")}</p>}
        </div>
      )}
    </div>
  );
};

type SideInfo = { code: string; t: LiveFrame["blueTeam"]; meta: LiveParticipantMeta[]; color: string };

/** Both teams' gold, kills, towers, dragons (by type), barons, inhibitors and CS, and the left team's difference. */
const StatsTable: React.FC<{ left: SideInfo; right: SideInfo; minutes: number | null }> = ({ left, right, minutes }) => {
  const cs = (x: SideInfo) => x.t.participants.reduce((sum, p) => sum + (p.creepScore || 0), 0);
  const cols: { key: string; label: string; title: string; v: (x: SideInfo) => number; fmt?: (n: number) => string; extra?: (x: SideInfo) => React.ReactNode }[] = [
    { key: "gold", label: tl("Gold"), title: tl("Team gold"), v: (x) => x.t.totalGold, fmt: (n) => k(n) },
    { key: "kills", label: tl("Kills"), title: tl("Kills"), v: (x) => x.t.totalKills },
    { key: "towers", label: tl("Towers"), title: tl("Towers"), v: (x) => x.t.towers },
    {
      key: "dragons",
      label: tl("Dragons"),
      title: tl("Dragons"),
      v: (x) => x.t.dragons.length,
      extra: (x) =>
        x.t.dragons.map((d, i) => (
          <span key={i} className="w-2 h-2 rounded-full inline-block ml-0.5 align-middle" style={{ background: DRAGON_COLOR[d] || "var(--rw-muted)" }} title={dragonName(d)} />
        )),
    },
    { key: "barons", label: tl("Barons"), title: tl("Barons"), v: (x) => x.t.barons },
    { key: "inhibitors", label: tl("Inhib."), title: tl("Inhibitors"), v: (x) => x.t.inhibitors },
    {
      key: "cs",
      label: minutes ? tl("CS/min") : "CS",
      title: minutes ? tl("Team CS per minute") : tl("Team CS"),
      v: (x) => (minutes ? cs(x) / minutes : cs(x)),
      fmt: (n) => (minutes ? fmtDec(n) : String(n)),
    },
  ];
  const sign = (n: number, fmt?: (n: number) => string) => (n === 0 ? "0" : `${n > 0 ? "+" : "−"}${fmt ? fmt(Math.abs(n)) : Math.abs(n)}`);
  const cell = "px-2 py-1.5 text-right font-num tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[22rem] border border-rw-border rounded-md">
        <thead>
          <tr className="font-head text-[10px] uppercase tracking-wider text-rw-muted bg-rw-bg/60">
            <th className="px-2 py-1.5 text-left font-normal" />
            {cols.map((c) => (
              <th key={c.key} className="px-2 py-1.5 text-right font-normal" title={c.title}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[left, right].map((x, i) => {
            const other = i === 0 ? right : left;
            return (
              <tr key={x.code} className="border-t border-rw-border/60">
                <td className="px-2 py-1.5 text-left font-bold text-rw-text whitespace-nowrap" style={{ boxShadow: `inset 3px 0 0 ${x.color}` }} title={x.color === "#3fa7ff" ? tl("Blue side") : tl("Red side")}>
                  {x.code}
                </td>
                {cols.map((c) => {
                  const ahead = c.v(x) > c.v(other);
                  return (
                    <td key={c.key} className={`${cell} ${ahead ? "text-rw-teal font-bold" : "text-rw-sub"}`}>
                      {c.fmt ? c.fmt(c.v(x)) : c.v(x)}
                      {c.extra?.(x)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="border-t border-rw-border text-rw-sub bg-rw-bg/40 text-[11px]">
            <td className="px-1.5 py-1 text-left whitespace-nowrap" title={tl("{a} minus {b}", { a: left.code, b: right.code })}>
              {tl("Diff ({team})", { team: left.code })}
            </td>
            {cols.map((c) => {
              const d = c.v(left) - c.v(right);
              return (
                <td key={c.key} className={`${cell} ${d > 0 ? "text-rw-teal" : d < 0 ? "text-rw-red" : "text-rw-muted"}`}>
                  {sign(c.key === "cs" && minutes ? Math.round(d * 10) / 10 : d, c.fmt)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

/**
 * The upset meter: how far the game has swung from what the model expected. The underdog's chance before the game
 * (power rankings, hub/matchRatings.ts) against its chance now from the gold lead (winChanceFromGold).
 */
const UpsetMeter: React.FC<{ leftCode: string; rightCode: string; before: number; now: number }> = ({ leftCode, rightCode, before, now }) => {
  if (Math.abs(before - 0.5) < 0.05) return null; // a coin flip has no underdog
  const leftIsDog = before < 0.5;
  const dog = leftIsDog ? leftCode : rightCode;
  const pre = leftIsDog ? before : 1 - before;
  const cur = leftIsDog ? now : 1 - now;
  const swing = Math.round((cur - pre) * 100);
  const label = cur > 0.5 ? tl("Upset on") : swing >= 15 ? tl("Upset brewing") : swing <= -15 ? tl("Favourite pulling away") : tl("Going as expected");
  const hot = cur > 0.5 || swing >= 15;
  return (
    <div className="space-y-0.5" title={tl("The underdog's chance before the game, from the power rankings, against its chance now from the gold lead.")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[10px] text-rw-sub">
        <span className="uppercase tracking-wider font-semibold">
          {tl("Upset meter")} · <span className={hot ? "text-rw-accent" : "text-rw-sub"}>{label}</span>
        </span>
        <span className="text-rw-muted">
          {tl("{team}: {before} before the game, {now} now", { team: dog, before: `${Math.round(pre * 100)}%`, now: `${Math.round(cur * 100)}%` })}
        </span>
      </div>
      {/* the underdog's chance now, with a tick where it started */}
      <div className="relative h-2 rounded-sm bg-rw-border overflow-hidden" aria-hidden="true">
        <div className={`h-full ${hot ? "bg-rw-accent" : "bg-rw-sub/60"}`} style={{ width: `${cur * 100}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-rw-text" style={{ left: `${pre * 100}%` }} />
      </div>
    </div>
  );
};

/** After the game: what happened, in a few sentences (gameStory.ts; rules over the sampled frames, no AI). */
const GameStory: React.FC<{ points: TimelinePoint[]; left: string; right: string; blueIsLeft: boolean }> = ({ points, left, right, blueIsLeft }) => {
  const lines = useMemo(() => gameStory(points, left, right, blueIsLeft), [points, left, right, blueIsLeft]);
  if (!lines.length) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-rw-sub">{tl("Game story")}</div>
      <p className="text-xs text-rw-text leading-relaxed">{lines.join(" ")}</p>
    </div>
  );
};

/** "Win chance right now": the chance the gold lead at this minute has given in pro games (liveGame.ts). */
const ChanceNow: React.FC<{ leftCode: string; rightCode: string; minute: number; lead: number }> = ({ leftCode, rightCode, minute, lead }) => {
  const p = winChanceFromGold(minute, lead);
  const a = Math.round(p * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[10px] text-rw-sub">
        <span className="uppercase tracking-wider font-semibold">{tl("Win chance right now")}</span>
        <span className="text-rw-muted" title={tl("P = 1 / (1 + e^(−a × gold lead)), a = 0.0098 / (minute + 2.3): fitted on about 37,000 pro games since 2023 with gold at 10, 15 and 20 minutes (Oracle's Elixir). Gold only: towers, dragons and barons count through the gold they bring.")}>
          {tl("from the gold lead at this minute · ~37,000 pro games since 2023")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono tabular-nums font-bold text-rw-teal w-16 text-right whitespace-nowrap">
          {leftCode} {a}%
        </span>
        <div className="flex-1 h-2 rounded-sm overflow-hidden bg-rw-red/70" role="img" aria-label={`${leftCode} ${a}% · ${rightCode} ${100 - a}%`}>
          <div className="h-full bg-rw-teal" style={{ width: `${a}%` }} />
        </div>
        <span className="font-mono tabular-nums font-bold text-rw-red w-16 whitespace-nowrap">
          {100 - a}% {rightCode}
        </span>
      </div>
    </div>
  );
};

const Players: React.FC<{ left: SideInfo; right: SideInfo; details: LiveDetailsParticipant[] | null }> = ({ left, right, details }) => {
  const byRole = (side: SideInfo) =>
    ROLE_ORDER.map((role) => {
      const meta = side.meta.find((p) => p.role === role);
      const frame = meta ? side.t.participants.find((p) => p.participantId === meta.participantId) : undefined;
      const det = meta && details ? details.find((d) => d.participantId === meta.participantId) : undefined;
      return { meta, frame, det };
    });
  const l = byRole(left);
  const r = byRole(right);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] min-w-[20rem] table-fixed">
        <colgroup>
          <col />
          <col className="w-12" />
          <col />
        </colgroup>
        <tbody>
          {ROLE_ORDER.map((role, i) => (
            <tr key={role} className="border-t border-rw-border/60">
              <PlayerCells p={l[i]} align="left" />
              <td className="px-1 text-center text-[9px] uppercase text-rw-muted min-w-12 whitespace-nowrap">{roleName(ROLE_LABEL[role])}</td>
              <PlayerCells p={r[i]} align="right" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

type PlayerRow = { meta?: LiveParticipantMeta; frame?: LiveFrame["blueTeam"]["participants"][number]; det?: LiveDetailsParticipant };

const PlayerCells: React.FC<{ p: PlayerRow; align: "left" | "right" }> = ({ p, align }) => {
  if (!p.meta || !p.frame) return <td className="py-1" />;
  const icon = champIcon(p.meta.championId);
  const items = (p.det?.items || []).filter((id) => id > 0).slice(0, 7);
  const right = align === "right";
  const health = p.frame.maxHealth > 0 ? p.frame.currentHealth / p.frame.maxHealth : null;
  return (
    <td className="py-1.5 align-top">
      <div className={`flex items-start gap-2 ${right ? "flex-row-reverse text-right" : ""}`}>
        <div className="relative shrink-0">
          {icon ? (
            <img src={icon} alt={champName(champNameById(p.meta.championId))} title={champName(champNameById(p.meta.championId))} width={28} height={28} className="rounded" />
          ) : (
            <span className="w-7 h-7 inline-block rounded bg-rw-border" />
          )}
          <span className="absolute -bottom-1 -right-1 text-[8px] bg-rw-bg rounded px-0.5 text-rw-text">{p.frame.level}</span>
          {health != null && health < 1 && (
            <span className="absolute -bottom-0.5 left-0 h-0.5 rounded bg-rw-teal" style={{ width: `${Math.max(0, health) * 100}%` }} />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className={`flex items-baseline gap-2 ${right ? "flex-row-reverse" : ""}`}>
            <span className="font-semibold text-rw-text truncate">{playerName(p.meta.summonerName)}</span>
            <span className="font-mono font-bold text-rw-text shrink-0">
              {p.frame.kills}/{p.frame.deaths}/{p.frame.assists}
            </span>
          </div>
          <div className="text-[10px] text-rw-sub font-mono">
            <span className="whitespace-nowrap">
              {p.frame.creepScore} CS · {k(p.frame.totalGold)}
            </span>
            {p.det && (
              <>
                {" "}
                <span className="text-rw-muted whitespace-nowrap">· KP {Math.round(p.det.killParticipation * 100)}%</span>{" "}
                <span className="text-rw-muted whitespace-nowrap">· DMG {Math.round(p.det.championDamageShare * 100)}%</span>
              </>
            )}
          </div>
          {items.length > 0 && (
            <div className={`flex flex-wrap gap-0.5 ${right ? "justify-end" : ""}`}>
              {items.map((id, i) => {
                const src = itemIconById(id);
                return src ? <img key={`${id}-${i}`} src={src} alt="" width={18} height={18} className="rounded" /> : null;
              })}
            </div>
          )}
        </div>
      </div>
    </td>
  );
};

/** Gold lead over the game, or the win chance it gives (liveGame.ts winChanceFromGold): above the line = the team
 *  on the left is ahead. Drawn at the box's real width (TV, 2026-10-28: the stretched one "just looks ugly"): a
 *  smooth line in the leading side's colour over a fill that fades toward the middle, clean gridlines (±1k, 2k, 5k...),
 *  the minutes along the bottom, the dragons and barons each side took on its own edge, and any minute's lead and
 *  kills under the pointer. */
const GoldGraph: React.FC<{ points: TimelinePoint[]; blueIsLeft: boolean; leftCode: string; rightCode: string }> = ({ points, blueIsLeft, leftCode, rightCode }) => {
  const [mode, setMode] = useState<"gold" | "chance">("gold");
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const lead = (p: TimelinePoint) => (blueIsLeft ? p.lead : -p.lead);
  // win chance as a lead over 50%, on the same "above the line" scale
  const val = (p: TimelinePoint) => (mode === "gold" ? lead(p) : winChanceFromGold(p.t, lead(p)) - 0.5);
  const leftSnap = (p: TimelinePoint) => (blueIsLeft ? p.blue : p.red);
  const rightSnap = (p: TimelinePoint) => (blueIsLeft ? p.red : p.blue);
  const leftColor = blueIsLeft ? BLUE : "var(--rw-red)";
  const rightColor = blueIsLeft ? "var(--rw-red)" : BLUE;
  // the plot inside room for the scale (left), the objective marks (top and bottom edges) and the minutes (below)
  const L = 36;
  const R = 10;
  const T = 14;
  const PH = 112;
  const B = 14;
  const H = T + PH + B + 14;
  const pw = Math.max(W - L - R, 60);
  const maxT = Math.max(points[points.length - 1].t, 1);
  // the scale: the next clean number past the biggest lead (a 10.5k lead gets ±12k), gridlines at half and full
  const peak = mode === "gold" ? Math.max(1000, ...points.map((p) => Math.abs(lead(p)))) : 0.5;
  const range = mode === "gold" ? [2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000].find((s) => s >= peak * 1.08) || 40000 : 0.5;
  const step = range / 2;
  const x = (t: number) => L + (t / maxT) * pw;
  const y = (v: number) => T + PH / 2 - (v / range) * (PH / 2);
  const zero = y(0);
  const xy = points.map((p) => [x(p.t), y(val(p))] as [number, number]);
  const line = smoothPath(xy);
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${zero} L${xy[0][0].toFixed(1)},${zero} Z`;
  const ticks: number[] = [];
  for (let v = step; v <= range + 1e-9; v += step) ticks.push(v);
  const minuteStep = maxT <= 24 ? 5 : 10;
  const minutes: number[] = [];
  for (let m = minuteStep; m < maxT - 1; m += minuteStep) minutes.push(m);
  const lab = (v: number) => (mode === "gold" ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Number((Math.abs(v) / 1000).toFixed(1))}k` : `${Math.round((v + 0.5) * 100)}%`);
  // dragons and barons: each one a side took between two points, on that side's edge
  const marks: { t: number; kind: "dragon" | "baron"; left: boolean }[] = [];
  for (let i = 1; i < points.length; i++)
    for (const left of [true, false]) {
      const [a, b] = left ? [leftSnap(points[i - 1]), leftSnap(points[i])] : [rightSnap(points[i - 1]), rightSnap(points[i])];
      for (let n = a.d; n < b.d; n++) marks.push({ t: points[i].t, kind: "dragon", left });
      for (let n = a.b; n < b.b; n++) marks.push({ t: points[i].t, kind: "baron", left });
    }
  const last = points[points.length - 1];
  const h = hover != null ? points[hover] : null;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left - L) / pw) * maxT;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
    setHover(best);
  };
  const tab = (m: "gold" | "chance", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`px-1.5 rounded ${mode === m ? "text-rw-accent font-semibold" : "hover:text-rw-text"}`}
    >
      {label}
    </button>
  );
  const ahead = (v: number) => (mode === "gold" ? (v >= 0 ? `${leftCode} +${k(v)}` : `${rightCode} +${k(-v)}`) : `${leftCode} ${Math.round((v + 0.5) * 100)}%`);
  return (
    <div>
      <div className="flex justify-between text-[10px] text-rw-muted mb-0.5">
        <span className="flex gap-1 items-baseline" role="group" aria-label={tl("Graph")}>
          {tab("gold", tl("Gold lead"))}
          {tab("chance", tl("Win chance"))}
          <span className="text-rw-muted">· {tl("{a} minus {b}", { a: leftCode, b: rightCode })}</span>
        </span>
        <span className="font-mono text-rw-text" title={mode === "chance" ? tl("From the gold lead only, as in pro games since 2023") : undefined}>
          {ahead(val(last))}
        </span>
      </div>
      <div ref={box} className="relative select-none">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-pan-y"
          role="img"
          aria-label={tl("Gold lead over the game")}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={`${id}t`}>
              <rect x={0} y={0} width={W} height={zero} />
            </clipPath>
            <clipPath id={`${id}b`}>
              <rect x={0} y={zero} width={W} height={H - zero} />
            </clipPath>
            <linearGradient id={`${id}gt`} gradientUnits="userSpaceOnUse" x1={0} y1={T} x2={0} y2={zero}>
              <stop offset="0" style={{ stopColor: leftColor, stopOpacity: 0.42 }} />
              <stop offset="1" style={{ stopColor: leftColor, stopOpacity: 0.03 }} />
            </linearGradient>
            <linearGradient id={`${id}gb`} gradientUnits="userSpaceOnUse" x1={0} y1={zero} x2={0} y2={T + PH}>
              <stop offset="0" style={{ stopColor: rightColor, stopOpacity: 0.03 }} />
              <stop offset="1" style={{ stopColor: rightColor, stopOpacity: 0.42 }} />
            </linearGradient>
          </defs>
          {/* which half is whose: the team's name in its top / bottom corner, beside a dot in its colour */}
          <circle cx={L + 8} cy={T + 9} r={3} style={{ fill: leftColor }} />
          <text x={L + 15} y={T + 12} style={{ fill: "var(--rw-sub)", fontSize: 10, fontWeight: 600 }}>
            {leftCode} ▲
          </text>
          <circle cx={L + 8} cy={T + PH - 9} r={3} style={{ fill: rightColor }} />
          <text x={L + 15} y={T + PH - 6} style={{ fill: "var(--rw-sub)", fontSize: 10, fontWeight: 600 }}>
            {rightCode} ▼
          </text>
          {ticks.map((v) => (
            <g key={v}>
              {[v, -v].map((g) => (
                <line key={g} x1={L} x2={L + pw} y1={y(g)} y2={y(g)} style={{ stroke: "var(--rw-border)" }} strokeWidth={1} opacity={0.7} />
              ))}
              <text x={L - 6} y={y(v) + 3} textAnchor="end" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
                {lab(v)}
              </text>
              <text x={L - 6} y={y(-v) + 3} textAnchor="end" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
                {lab(-v)}
              </text>
            </g>
          ))}
          <text x={L - 6} y={zero + 3} textAnchor="end" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
            {mode === "gold" ? "0" : "50%"}
          </text>
          {minutes.map((m) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={T} y2={T + PH} style={{ stroke: "var(--rw-border)" }} strokeWidth={1} opacity={0.35} />
              <text x={x(m)} y={H - 3} textAnchor="middle" className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 9 }}>
                {m}:00
              </text>
            </g>
          ))}
          <path d={area} clipPath={`url(#${id}t)`} style={{ fill: `url(#${id}gt)` }} />
          <path d={area} clipPath={`url(#${id}b)`} style={{ fill: `url(#${id}gb)` }} />
          <line x1={L} x2={L + pw} y1={zero} y2={zero} style={{ stroke: "var(--rw-line)" }} strokeWidth={1} />
          <path d={line} fill="none" clipPath={`url(#${id}t)`} style={{ stroke: leftColor }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={line} fill="none" clipPath={`url(#${id}b)`} style={{ stroke: rightColor }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {marks.map((mk, i) => {
            const cx = x(mk.t);
            const cy = mk.left ? T - 7 : T + PH + 7;
            const fill = mk.kind === "baron" ? BARON : DRAGON;
            return mk.kind === "baron" ? (
              <circle key={i} cx={cx} cy={cy} r={4} style={{ fill, stroke: "var(--rw-surface)" }} strokeWidth={1.5}>
                <title>{`${mk.left ? leftCode : rightCode}: ${tl("Baron")} · ${clock(mk.t * 60_000)}`}</title>
              </circle>
            ) : (
              <rect key={i} x={cx - 3.5} y={cy - 3.5} width={7} height={7} transform={`rotate(45 ${cx} ${cy})`} style={{ fill, stroke: "var(--rw-surface)" }} strokeWidth={1.5}>
                <title>{`${mk.left ? leftCode : rightCode}: ${tl("Dragon")} · ${clock(mk.t * 60_000)}`}</title>
              </rect>
            );
          })}
          {h && (
            <g pointerEvents="none">
              <line x1={x(h.t)} x2={x(h.t)} y1={T} y2={T + PH} style={{ stroke: "var(--rw-sub)" }} strokeWidth={1} />
              <circle cx={x(h.t)} cy={y(val(h))} r={4.5} style={{ fill: val(h) >= 0 ? leftColor : rightColor, stroke: "var(--rw-surface)" }} strokeWidth={2} />
            </g>
          )}
          {!h && <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={4.5} style={{ fill: val(last) >= 0 ? leftColor : rightColor, stroke: "var(--rw-surface)" }} strokeWidth={2} />}
        </svg>
        {h && (
          <div
            className="absolute top-0 pointer-events-none rounded border border-rw-border bg-rw-raised px-2 py-1 text-[10px] leading-tight shadow-lg whitespace-nowrap"
            style={{ left: Math.min(Math.max(x(h.t) - 60, 0), Math.max(W - 120, 0)) }}
          >
            <div className="font-num text-rw-muted">{clock(h.t * 60_000)}</div>
            <div className="font-num font-semibold text-rw-text">{ahead(val(h))}</div>
            <div className="text-rw-sub">
              {tl("Kills")} {leftSnap(h).k}–{rightSnap(h).k}
            </div>
          </div>
        )}
      </div>
      {marks.length > 0 && (
        <div className="flex justify-end gap-3 text-[9px] text-rw-muted mt-0.5">
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rotate-45" style={{ background: DRAGON }} /> {tl("Dragon")}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: BARON }} /> {tl("Baron")}
          </span>
        </div>
      )}
    </div>
  );
};

/** A game whose live stats Riot doesn't publish: how long it has been on and who plays what (its first frames). */
const DraftOnly: React.FC<{ match: Match; win: LiveWindow; number: number; startMs: number | null; live: boolean }> = ({ match, win, number, startMs, live }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [live]);
  const meta = win.gameMetadata;
  const blueIsTeam1 = match.team1Id
    ? meta.blueTeamMetadata.esportsTeamId === match.team1Id
    : (meta.blueTeamMetadata.participantMetadata[0]?.summonerName || "").toUpperCase().startsWith(match.team1Code.toUpperCase() + " ");
  const blue = { code: blueIsTeam1 ? match.team1Code : match.team2Code, meta: meta.blueTeamMetadata.participantMetadata };
  const red = { code: blueIsTeam1 ? match.team2Code : match.team1Code, meta: meta.redTeamMetadata.participantMetadata };
  const [left, right] = blueIsTeam1 ? [blue, red] : [red, blue];
  const byRole = (m: LiveParticipantMeta[]) => [...m].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const l = byRole(left.meta);
  const r = byRole(right.meta);
  return (
    <div className="mt-3 pt-3 border-t border-rw-border/60 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold uppercase tracking-wider text-[10px] text-rw-accent">
          {tl("Game {n} · live", { n: number })}
          {live && startMs != null && <span className="ml-2 font-mono text-rw-text">{clock(now - startMs)}</span>}
        </span>
        <span className="text-[10px] text-rw-muted">{tl("Riot isn't sharing live stats for this game. Here is the draft.")}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1 items-center">
        <span className="font-bold text-rw-text">{left.code}</span>
        <span />
        <span className="font-bold text-rw-text text-right">{right.code}</span>
        {l.map((p, i) => {
          const q = r[i];
          const cell = (x: LiveParticipantMeta | undefined, right: boolean) => {
            if (!x) return <span />;
            const icon = champIcon(x.championId);
            return (
              <span className={`flex items-center gap-1.5 min-w-0 ${right ? "flex-row-reverse text-right" : ""}`}>
                {icon && <img src={icon} alt="" width={24} height={24} className="rounded shrink-0" />}
                <span className="min-w-0">
                  <span className="block truncate text-rw-text">{champName(champNameById(x.championId))}</span>
                  <span className="block truncate text-[10px] text-rw-muted">{playerName(x.summonerName)}</span>
                </span>
              </span>
            );
          };
          return (
            <React.Fragment key={i}>
              {cell(p, false)}
              <span className="text-[10px] text-rw-muted text-center w-12">{roleName(ROLE_LABEL[p.role] || p.role)}</span>
              {cell(q, true)}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
