/**
 * The game being played in a live series, from Riot's live-stats feed (src/liveGame.ts): game clock, gold and
 * gold lead, kills, towers, dragons, barons and inhibitors for both teams, and on demand every player's champion,
 * level, K/D/A, CS, gold, items, kill share and damage share plus a gold-lead graph. Refreshes every 15 seconds
 * while the page is visible. Between games it shows the last game's final numbers.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Castle, ChevronDown, ChevronUp, Crown, Shield, Swords } from "lucide-react";
import type { Match } from "../types";
import { tl, roleName } from "../i18n";
import {
  LiveDetailsParticipant,
  LiveFrame,
  LiveParticipantMeta,
  LiveWindow,
  fetchGoldHistory,
  fetchLiveDetails,
  fetchLiveStart,
  fetchLiveWindow,
} from "../liveGame";
import { champIcon, itemIconById, useDDragon } from "../hub/ddragon";
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

const k = (gold: number) => `${(gold / 1000).toFixed(1)}k`;
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

export const LiveGamePanel: React.FC<{ match: Match; showStats: boolean }> = ({ match, showStats }) => {
  useDDragon();
  // The game in progress, or between games the one that just ended
  const game = useMemo(() => {
    const games = match.games || [];
    return games.find((g) => g.state === "inProgress") || [...games].reverse().find((g) => g.state === "completed") || null;
  }, [match.games]);
  const live = game?.state === "inProgress";
  const [state, setState] = useState<GameState | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<[number, number][] | null>(null);
  const startRef = useRef<Record<string, number>>({});
  // the next game of the series starts with a clean slate (not game 1's numbers and gold graph)
  useEffect(() => {
    setState(null);
    setHistory(null);
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
        }
        // a finished game: ask well past its end, the feed answers with its last frames
        const w = await fetchLiveWindow(game.id, live ? undefined : Date.now() - 60_000);
        const frame = w?.frames?.[w.frames.length - 1];
        if (!alive) return;
        if (!w || !frame) {
          setState(null);
        } else {
          const det = open ? await fetchLiveDetails(game.id, live ? undefined : Date.now() - 60_000).catch(() => null) : null;
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

  // Gold-lead graph: one point a minute, loaded when the details are opened (and kept up to date after)
  useEffect(() => {
    if (!open || !state?.startMs || !game) return;
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
  }, [open, state?.frame, state?.startMs, game?.id]);

  if (!game) return null;
  if (!showStats)
    return <p className="text-[11px] text-rw-muted text-center py-1">{tl("Live game stats are hidden while spoiler mode is on.")}</p>;
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

      {/* Gold and objectives */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamLine side={left} align="left" />
        <div className="text-center">
          <div className={`font-mono font-bold ${lead > 0 ? "text-rw-teal" : lead < 0 ? "text-rw-red" : "text-rw-sub"}`}>
            {lead === 0 ? "=" : `${lead > 0 ? "◀" : ""} ${k(Math.abs(lead))} ${lead < 0 ? "▶" : ""}`}
          </div>
          <div className="text-[9px] text-rw-muted">{tl("gold lead")}</div>
        </div>
        <TeamLine side={right} align="right" />
      </div>
      <div className="h-1.5 rounded overflow-hidden bg-rw-red/60" aria-hidden="true">
        <div className="h-full bg-rw-teal/80" style={{ width: `${share * 100}%` }} />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 mx-auto text-[11px] text-rw-teal hover:underline"
        aria-expanded={open}
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? tl("Hide players") : tl("Players, items and gold graph")}
      </button>

      {open && (
        <div className="space-y-3">
          <Players left={left} right={right} details={state.details} />
          {history && history.length > 1 && <GoldGraph points={history} blueIsLeft={blueIsTeam1} />}
          <p className="text-[10px] text-rw-muted">{tl("From Riot's live stats feed, about a minute behind the broadcast.")}</p>
        </div>
      )}
    </div>
  );
};

type SideInfo = { code: string; t: LiveFrame["blueTeam"]; meta: LiveParticipantMeta[]; color: string };

const TeamLine: React.FC<{ side: SideInfo; align: "left" | "right" }> = ({ side, align }) => (
  <div className={`min-w-0 space-y-0.5 ${align === "right" ? "text-right" : ""}`}>
    <div className={`flex items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: side.color }} title={side.color === "#3fa7ff" ? tl("Blue side") : tl("Red side")} />
      <span className="font-bold text-rw-text">{side.code}</span>
      <span className="font-mono text-rw-accent">{k(side.t.totalGold)}</span>
    </div>
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-rw-sub ${align === "right" ? "justify-end" : ""}`}>
      <span className="flex items-center gap-0.5" title={tl("Kills")}>
        <Swords className="w-3 h-3" /> {side.t.totalKills}
      </span>
      <span className="flex items-center gap-0.5" title={tl("Towers")}>
        <Castle className="w-3 h-3" /> {side.t.towers}
      </span>
      <span className="flex items-center gap-0.5" title={tl("Barons")}>
        <Crown className="w-3 h-3" /> {side.t.barons}
      </span>
      <span className="flex items-center gap-0.5" title={tl("Inhibitors")}>
        <Shield className="w-3 h-3" /> {side.t.inhibitors}
      </span>
      <span className="flex items-center gap-0.5" title={tl("Dragons")}>
        {side.t.dragons.length === 0 ? (
          <span className="text-rw-muted">{tl("No dragons")}</span>
        ) : (
          side.t.dragons.map((d, i) => (
            <span key={i} className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: DRAGON_COLOR[d] || "var(--rw-muted)" }} title={dragonName(d)} />
          ))
        )}
      </span>
    </div>
  </div>
);

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
      <table className="w-full text-[11px] min-w-[28rem] table-fixed">
        <tbody>
          {ROLE_ORDER.map((role, i) => (
            <tr key={role} className="border-t border-rw-border/60">
              <PlayerCells p={l[i]} align="left" />
              <td className="px-1 text-center text-[9px] uppercase text-rw-muted w-12">{roleName(ROLE_LABEL[role])}</td>
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
            <img src={icon} alt={champName(p.meta.championId)} title={champName(p.meta.championId)} width={28} height={28} className="rounded" />
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
          <div className="text-[10px] text-rw-sub font-mono whitespace-nowrap">
            {p.frame.creepScore} CS · {k(p.frame.totalGold)}
            {p.det && (
              <span className="text-rw-muted">
                {" "}
                · KP {Math.round(p.det.killParticipation * 100)}% · DMG {Math.round(p.det.championDamageShare * 100)}%
              </span>
            )}
          </div>
          {items.length > 0 && (
            <div className={`flex gap-0.5 ${right ? "justify-end" : ""}`}>
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

/** Gold lead over the game: above the line = the team on the left is ahead. */
const GoldGraph: React.FC<{ points: [number, number][]; blueIsLeft: boolean }> = ({ points, blueIsLeft }) => {
  const W = 600;
  const H = 120;
  const pts = points.map(([t, d]) => [t, blueIsLeft ? d : -d] as [number, number]);
  const maxT = Math.max(...pts.map((p) => p[0]), 1);
  const maxAbs = Math.max(1000, ...pts.map((p) => Math.abs(p[1])));
  const x = (t: number) => (t / maxT) * W;
  const y = (d: number) => H / 2 - (d / maxAbs) * (H / 2 - 6);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div>
      <div className="flex justify-between text-[10px] text-rw-muted mb-0.5">
        <span>{tl("Gold lead")}</span>
        <span className="font-mono">
          {last[1] > 0 ? "+" : ""}
          {k(last[1])}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none" role="img" aria-label={tl("Gold lead over the game")}>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} style={{ stroke: "var(--rw-border)" }} strokeWidth="1" />
        <path d={path} fill="none" style={{ stroke: "var(--rw-accent)" }} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[9px] text-rw-muted">
        <span>0:00</span>
        <span>{clock(maxT * 60_000)}</span>
      </div>
    </div>
  );
};
