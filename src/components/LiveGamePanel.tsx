/**
 * The game being played in a live series, from Riot's live-stats feed (src/liveGame.ts): game clock, gold and
 * gold lead, kills, towers, dragons, barons and inhibitors for both teams, and on demand every player's champion,
 * level, K/D/A, CS, gold, items, kill share and damage share plus a gold-lead graph. Refreshes every 15 seconds
 * while the page is visible. Between games it shows the last game's final numbers.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Game, Match } from "../types";
import { tl, roleName, fmtDec } from "../i18n";
import {
  LiveDetailsParticipant,
  LiveFrame,
  LiveParticipantMeta,
  LiveWindow,
  fetchGoldHistory,
  winChanceFromGold,
  fetchLiveDetails,
  fetchLiveStart,
  fetchLiveWindow,
  feedNow,
} from "../liveGame";
import { champIcon, champNameById, itemIconById, useDDragon } from "../hub/ddragon";
import { champName } from "../champions";

const POLL_MS = 15_000;
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
  const [open, setOpen] = useState(!!startOpen);
  const [history, setHistory] = useState<[number, number][] | null>(null);
  const startRef = useRef<Record<string, number>>({});
  // the game's first frames (who plays what): all there is when Riot switches a game's live stats off
  const firstRef = useRef<Record<string, LiveWindow>>({});
  const [draft, setDraft] = useState<LiveWindow | null>(null);
  // the next game of the series starts with a clean slate (not game 1's numbers and gold graph)
  useEffect(() => {
    setState(null);
    setHistory(null);
    setDraft(null);
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
          if (frame.gameState === "finished") return; // final numbers: no need to keep asking
        }
      } catch {
        if (alive) setFailed(true);
      }
      if (alive && live) timer = window.setTimeout(load, document.hidden ? POLL_MS * 4 : POLL_MS);
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
      fetchGoldHistory(game.id, state.startMs, end).then((pts) => alive && setHistory(pts));
    } else {
      const t = (end - state.startMs) / 60_000;
      const last = history[history.length - 1];
      if (!last || t - last[0] >= 0.25) setHistory([...history, [t, state.frame.blueTeam.totalGold - state.frame.redTeam.totalGold]]);
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
      {history && history.length > 1 && <GoldGraph points={history} blueIsLeft={blueIsTeam1} leftCode={left.code} rightCode={right.code} />}

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
 *  on the left is ahead. */
const GoldGraph: React.FC<{ points: [number, number][]; blueIsLeft: boolean; leftCode: string; rightCode: string }> = ({ points, blueIsLeft, leftCode, rightCode }) => {
  const [mode, setMode] = useState<"gold" | "chance">("gold");
  const W = 600;
  const H = 120;
  const gold = points.map(([t, d]) => [t, blueIsLeft ? d : -d] as [number, number]);
  // win chance as a lead over 50%, on the same "above the line" scale
  const pts = mode === "gold" ? gold : gold.map(([t, d]) => [t, winChanceFromGold(t, d) - 0.5] as [number, number]);
  const maxT = Math.max(...pts.map((p) => p[0]), 1);
  const maxAbs = mode === "gold" ? Math.max(1000, ...pts.map((p) => Math.abs(p[1]))) : 0.5;
  const x = (t: number) => (t / maxT) * W;
  const y = (d: number) => H / 2 - (d / maxAbs) * (H / 2 - 6);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
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
  return (
    <div>
      <div className="flex justify-between text-[10px] text-rw-muted mb-0.5">
        <span className="flex gap-1 items-baseline" role="group" aria-label={tl("Graph")}>
          {tab("gold", tl("Gold lead"))}
          {tab("chance", tl("Win chance"))}
          <span className="text-rw-muted">· {tl("{a} minus {b}", { a: leftCode, b: rightCode })}</span>
        </span>
        <span className="font-mono" title={mode === "chance" ? tl("From the gold lead only, as in pro games since 2023") : undefined}>
          {mode === "gold" ? (
            <>
              {last[1] > 0 ? "+" : ""}
              {k(last[1])}
            </>
          ) : (
            `${leftCode} ${Math.round((last[1] + 0.5) * 100)}%`
          )}
        </span>
      </div>
      {/* an area chart: the side that is ahead fills its half in its colour; faint lines at half and full scale */}
      {(() => {
        const leftColor = blueIsLeft ? "#3fa7ff" : "var(--rw-red)";
        const rightColor = blueIsLeft ? "var(--rw-red)" : "#3fa7ff";
        const area = `M0,${H / 2} ${pts.map((p) => `L${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")} L${x(last[0]).toFixed(1)},${H / 2} Z`;
        const grid = [0.5, 1].map((f) => f * maxAbs);
        const lab = (v: number) => (mode === "gold" ? k(v) : `${Math.round((v + 0.5) * 100)}%`);
        const id = `gg-${leftCode}-${rightCode}`.replace(/[^a-z0-9-]/gi, "");
        return (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none" role="img" aria-label={tl("Gold lead over the game")}>
            <defs>
              <clipPath id={`${id}-top`}>
                <rect x="0" y="0" width={W} height={H / 2} />
              </clipPath>
              <clipPath id={`${id}-bottom`}>
                <rect x="0" y={H / 2} width={W} height={H / 2} />
              </clipPath>
            </defs>
            {grid.map((g) => (
              <g key={g}>
                <line x1="0" x2={W} y1={y(g)} y2={y(g)} style={{ stroke: "var(--rw-border)" }} strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
                <line x1="0" x2={W} y1={y(-g)} y2={y(-g)} style={{ stroke: "var(--rw-border)" }} strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            <path d={area} clipPath={`url(#${id}-top)`} style={{ fill: leftColor, opacity: 0.28 }} />
            <path d={area} clipPath={`url(#${id}-bottom)`} style={{ fill: rightColor, opacity: 0.28 }} />
            <line x1="0" x2={W} y1={H / 2} y2={H / 2} style={{ stroke: "var(--rw-sub)" }} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d={path} fill="none" clipPath={`url(#${id}-top)`} style={{ stroke: leftColor }} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={path} fill="none" clipPath={`url(#${id}-bottom)`} style={{ stroke: rightColor }} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <circle cx={x(last[0])} cy={y(last[1])} r="4" style={{ fill: last[1] >= 0 ? leftColor : rightColor, stroke: "var(--rw-bg)" }} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {grid.map((g) => (
              <g key={`l${g}`} className="font-num" style={{ fill: "var(--rw-muted)", fontSize: 10 }}>
                <text x={4} y={y(g) - 2}>+{lab(g)}</text>
                <text x={4} y={y(-g) + 10}>−{lab(g)}</text>
              </g>
            ))}
          </svg>
        );
      })()}
      <div className="flex justify-between text-[9px] text-rw-muted">
        <span>0:00</span>
        <span>{clock(maxT * 60_000)}</span>
      </div>
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
