/**
 * Between-games & pre-gold-graph Fearless Draft + Next-Game Potential Picks preview for LiveView / LiveGamePanel.
 * Shows after a game finishes in a Bo3/Bo5 series (and during champion select / loading of the next game until the
 * live gold graph appears):
 *   1. Fearless Draft locks (every champion picked in Games 1..N-1 by both teams, unavailable for the rest of the series)
 *   2. Likely bans for Game N (each team's usual bans + the opponent's top remaining comfort threats)
 *   3. Potential picks by role for Game N (each starter's best remaining season comfort picks + career pocket picks
 *      when Fearless pinches their pool in Game 3, Game 4, or Game 5)
 *   4. 1-click handoff to the interactive Draft Board with all Fearless locks pre-loaded.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Swords, ShieldBan, Lightbulb, Sparkles } from "lucide-react";
import type { Match } from "../types";
import { tl, roleName } from "../i18n";
import { winRate } from "../stats";
import { champName } from "../champions";
import { fetchLiveStart, type LiveParticipantMeta, type LiveWindow } from "../liveGame";
import { champNameById, useDDragon } from "../hub/ddragon";
import { findHubTeam, loadHubIndex, loadHubIndexQuick } from "../hub/data";
import { teamRowRef } from "../hub/period";
import { bothOptions } from "./hub/ComparePage";
import { defaultPeriod } from "./hub/PeriodStats";
import { loadSide, type Side } from "./hub/PrepPage";
import { pool, comfort, champOf, type Pool } from "./hub/DraftPage";
import { ChampIcon, HubLink } from "./hub/ui";

const ROLE_ORDER = ["top", "jungle", "mid", "bottom", "support"];
const ROLE_LABELS = ["Top", "Jungle", "Mid", "Bot", "Support"];

const playerName = (n: string) => n.replace(/^\S+\s+/, "") || n;

// Module-level caches so polling LiveGamePanel every 15s never re-fetches completed game windows or Hub team sides
const windowCache = new Map<string, Promise<LiveWindow | null>>();
const sideCache = new Map<string, Promise<Side | null>>();

function getCachedStart(gameId: string): Promise<LiveWindow | null> {
  if (!windowCache.has(gameId)) {
    windowCache.set(
      gameId,
      fetchLiveStart(gameId).catch(() => null),
    );
  }
  return windowCache.get(gameId)!;
}

function getCachedSide(slug: string): Promise<Side | null> {
  if (!sideCache.has(slug)) {
    sideCache.set(
      slug,
      loadSide(slug, true).catch(() => null),
    );
  }
  return sideCache.get(slug)!;
}

export interface EarlierGamePicks {
  number: number;
  team1: { c: string; player: string; role: string }[];
  team2: { c: string; player: string; role: string }[];
}

export function extractGamePicks(match: Match, win: LiveWindow, number: number): EarlierGamePicks | null {
  const meta = win.gameMetadata;
  if (!meta?.blueTeamMetadata || !meta?.redTeamMetadata) return null;
  const blueIsTeam1 = match.team1Id
    ? meta.blueTeamMetadata.esportsTeamId === match.team1Id
    : (meta.blueTeamMetadata.participantMetadata[0]?.summonerName || "").toUpperCase().startsWith(match.team1Code.toUpperCase() + " ");
  const t1Meta = blueIsTeam1 ? meta.blueTeamMetadata.participantMetadata : meta.redTeamMetadata.participantMetadata;
  const t2Meta = blueIsTeam1 ? meta.redTeamMetadata.participantMetadata : meta.blueTeamMetadata.participantMetadata;
  const mapSide = (list: LiveParticipantMeta[]) =>
    [...list]
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
      .map((p) => ({
        c: champNameById(p.championId),
        player: playerName(p.summonerName),
        role: p.role,
      }))
      .filter((x) => !!x.c);
  const team1 = mapSide(t1Meta);
  const team2 = mapSide(t2Meta);
  if (team1.length === 0 && team2.length === 0) return null;
  return { number, team1, team2 };
}

export const LiveNextGamePreview: React.FC<{
  match: Match;
  nextGameNum: number;
  currentWin?: LiveWindow | null;
  currentGameNum?: number;
}> = ({ match, nextGameNum, currentWin, currentGameNum }) => {
  useDDragon();
  const [earlier, setEarlier] = useState<EarlierGamePicks[]>([]);
  const [sides, setSides] = useState<{ a: Side | null; b: Side | null }>({ a: null, b: null });

  // 1. Load Fearless picks from all earlier games (1 .. nextGameNum - 1)
  useEffect(() => {
    let alive = true;
    const prevGames = (match.games || [])
      .filter((g) => g.number < nextGameNum && (g.state === "completed" || g.state === "inProgress" || g.number === currentGameNum))
      .sort((a, b) => a.number - b.number);

    Promise.all(
      prevGames.map(async (g) => {
        const w = g.number === currentGameNum && currentWin ? currentWin : await getCachedStart(g.id);
        return w ? extractGamePicks(match, w, g.number) : null;
      }),
    ).then((list) => {
      if (!alive) return;
      setEarlier(list.filter((x): x is EarlierGamePicks => !!x));
    });
    return () => {
      alive = false;
    };
  }, [match, nextGameNum, currentWin, currentGameNum]);

  // 2. Load both teams' Hub sides for potential picks & bans
  useEffect(() => {
    let alive = true;
    const resolveTeams = async () => {
      try {
        let idx = await loadHubIndexQuick().catch(() => null);
        if (!idx) idx = await loadHubIndex().catch(() => null);
        if (!idx || !alive) return;
        const slugA = findHubTeam(idx, match.team1Name, match.team1Code);
        const slugB = findHubTeam(idx, match.team2Name, match.team2Code);
        if (!slugA || !slugB) return;
        const [a, b] = await Promise.all([getCachedSide(slugA), getCachedSide(slugB)]);
        if (alive) setSides({ a, b });
      } catch {
        /* ignore */
      }
    };
    resolveTeams();
    return () => {
      alive = false;
    };
  }, [match.team1Name, match.team1Code, match.team2Name, match.team2Code]);

  // Set of all champions locked by Fearless Draft in earlier games of the series
  const fearlessUsed = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const g of earlier) {
      for (const p of [...g.team1, ...g.team2]) {
        const key = p.c.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(p.c);
        }
      }
    }
    return out;
  }, [earlier]);

  const lockedLower = useMemo(() => {
    const s = new Set<string>();
    for (const c of fearlessUsed) {
      s.add(c.toLowerCase());
      s.add(champName(c).toLowerCase());
    }
    return s;
  }, [fearlessUsed]);

  const isLocked = (c: string) => lockedLower.has(c.toLowerCase()) || lockedLower.has(champName(c).toLowerCase());

  const draftIntel = useMemo(() => {
    if (!sides.a || !sides.b) return null;
    const options = bothOptions(sides.a.games.map(teamRowRef), sides.b.games.map(teamRowRef));
    const period = defaultPeriod(options);
    const poolA = pool(sides.a, period);
    const poolB = pool(sides.b, period);

    const computeBans = (me: Pool, them: Pool) => {
      const candidates = new Map<string, { c: string; score: number; label: string; why: string }>();
      // Opponent's highest-comfort still-open threats
      for (const [c, [g, w]] of them.picks.entries()) {
        if (isLocked(c) || g < 2) continue;
        const who = champOf(c, them);
        const myBans = me.bans.get(c) || 0;
        const sc = comfort(g, w) * (1 + Math.min(w / Math.max(g, 1), 1)) + myBans * 1.5;
        const label = who ? `${who.name} ${who.g}G (${winRate(who.w, who.g)})` : `${g}G (${winRate(w, g)})`;
        const why = [
          who ? `${who.name}: ${who.g}G, ${winRate(who.w, who.g)} WR` : `${g}G, ${winRate(w, g)} WR`,
          myBans > 0 ? tl("you banned it {n} times", { n: myBans }) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        candidates.set(c, { c, score: sc, label, why });
      }
      // This team's own frequent bans that are still open
      for (const [c, cnt] of me.bans.entries()) {
        if (isLocked(c) || cnt < 2 || candidates.has(c)) continue;
        candidates.set(c, {
          c,
          score: cnt * 2.2,
          label: `${cnt}× ${tl("Bans")}`,
          why: tl("you banned it {n} times", { n: cnt }),
        });
      }
      return [...candidates.values()].sort((x, y) => y.score - x.score).slice(0, 5);
    };

    const computeRolePicks = (p: Pool) =>
      ROLE_LABELS.map((roleLabel, roleIdx) => {
        const pl = p.byPlayer.find((x) => x.role === roleIdx);
        if (!pl) return { roleLabel, player: null, u: null, open: [] };
        const seasonOpen = pl.champs
          .filter((x) => x.g > 0 && !isLocked(x.c))
          .sort((a, b) => comfort(b.g, b.w) - comfort(a.g, a.w) || b.g - a.g)
          .slice(0, 3)
          .map((x) => ({
            c: x.c,
            g: x.g,
            w: x.w,
            pocket: false,
          }));
        const needed = Math.max(0, 3 - seasonOpen.length);
        const pocketOpen =
          needed > 0
            ? pl.champs
                .filter((x) => x.g === 0 && x.cg >= 3 && !isLocked(x.c))
                .sort((a, b) => comfort(b.cg, b.cw) - comfort(a.cg, a.cw))
                .slice(0, needed)
                .map((x) => ({
                  c: x.c,
                  g: x.cg,
                  w: x.cw,
                  pocket: true,
                }))
            : [];
        return {
          roleLabel,
          player: pl.name,
          u: pl.u,
          open: [...seasonOpen, ...pocketOpen],
        };
      });

    return {
      period,
      slugA: sides.a.team.u,
      slugB: sides.b.team.u,
      bansA: computeBans(poolA, poolB),
      bansB: computeBans(poolB, poolA),
      rolesA: computeRolePicks(poolA),
      rolesB: computeRolePicks(poolB),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sides.a, sides.b, lockedLower]);

  if (earlier.length === 0 && !draftIntel) return null;

  const draftQuery = draftIntel
    ? `teams=${encodeURIComponent(draftIntel.slugA)},${encodeURIComponent(draftIntel.slugB)}${
        fearlessUsed.length ? `&u=${encodeURIComponent(fearlessUsed.join(","))}` : ""
      }`
    : "";

  return (
    <div
      data-testid="live-next-game-preview"
      className="mt-3 rounded-lg border border-rw-accent/40 bg-rw-bg/80 p-3 space-y-3 text-xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-rw-border/60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-rw-accent bg-rw-accent/15 border border-rw-accent/40 px-2 py-0.5 rounded">
            <Sparkles className="w-3 h-3" />
            {tl("Game {n}", { n: nextGameNum })} · {tl("Draft board")}
          </span>
          {fearlessUsed.length > 0 && (
            <span
              className="text-[11px] text-rw-sub font-medium"
              title={tl("Fearless: champions picked in earlier games of the series can't be picked again")}
            >
              {tl("Fearless")} ({fearlessUsed.length})
            </span>
          )}
        </div>
        {draftIntel && (
          <HubLink
            to={{ kind: "draft", query: draftQuery }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rw-teal hover:underline"
          >
            <Swords className="w-3.5 h-3.5" />
            {tl("Draft board")} →
          </HubLink>
        )}
      </div>

      {/* 1. Fearless Draft Locks from Earlier Games */}
      {earlier.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-rw-sub">
            <ShieldBan className="w-3.5 h-3.5 text-rw-red" />
            <span>
              {tl("Fearless")} · {tl("Used in earlier games:")}
            </span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {earlier.map((g) => (
              <div
                key={g.number}
                className="flex items-center justify-between gap-2 rounded border border-rw-border/70 bg-rw-surface/70 px-2.5 py-1.5"
              >
                <span className="font-mono text-[10px] font-bold text-rw-muted shrink-0">
                  {tl("Game {n}", { n: g.number })}
                </span>
                <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[10px] font-bold text-rw-teal">{match.team1Code}</span>
                    {g.team1.map((p) => (
                      <span key={p.c} title={`${champName(p.c)} (${p.player})`} className="opacity-75 grayscale-[35%]">
                        <ChampIcon name={p.c} size={18} />
                      </span>
                    ))}
                  </span>
                  <span className="text-rw-border">·</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[10px] font-bold text-rw-red">{match.team2Code}</span>
                    {g.team2.map((p) => (
                      <span key={p.c} title={`${champName(p.c)} (${p.player})`} className="opacity-75 grayscale-[35%]">
                        <ChampIcon name={p.c} size={18} />
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Likely Bans & Priority Threats for Next Game */}
      {draftIntel && (draftIntel.bansA.length > 0 || draftIntel.bansB.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-rw-sub">
            <Lightbulb className="w-3.5 h-3.5 text-rw-accent" />
            <span>
              {tl("Threats to ban")} · {tl("Their usual bans")}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { code: match.team1Code, slug: draftIntel.slugA, bans: draftIntel.bansA, tone: "text-rw-teal" },
              { code: match.team2Code, slug: draftIntel.slugB, bans: draftIntel.bansB, tone: "text-rw-red" },
            ].map((side) => (
              <div key={side.code} className="rounded border border-rw-border/70 bg-rw-surface/60 px-2.5 py-1.5 space-y-1">
                <div className="text-[10px] font-bold flex items-center justify-between">
                  <span className={side.tone}>
                    {side.code} · {tl("Threats to ban")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {side.bans.map((b) => (
                    <HubLink
                      key={b.c}
                      to={{ kind: "team", slug: side.slug, tab: "champions", query: `champ=${encodeURIComponent(b.c)}` }}
                      title={b.why}
                      className="inline-flex items-center gap-1 rounded border border-rw-border bg-rw-bg px-1.5 py-0.5 text-[10px] hover:border-rw-accent"
                    >
                      <ChampIcon name={b.c} size={15} />
                      <span className="font-medium text-rw-text">{champName(b.c)}</span>
                      <span className="text-rw-muted tabular-nums">{b.label}</span>
                    </HubLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Potential Picks by Role (Open Comfort Pools + Pocket Picks) */}
      {draftIntel && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider font-semibold text-rw-sub">
            <span>
              {tl("Comfort picks")} · {tl("Most picked, still open")}
            </span>
            <span className="text-[9px] font-normal normal-case text-rw-muted">
              {tl("pocket pick")}
            </span>
          </div>
          <div className="divide-y divide-rw-border/50 rounded border border-rw-border/70 bg-rw-surface/60 px-2.5 py-1">
            {ROLE_LABELS.map((rLabel, idx) => {
              const ra = draftIntel.rolesA[idx];
              const rb = draftIntel.rolesB[idx];
              if (!ra && !rb) return null;
              const renderPicks = (
                row: typeof ra,
                teamSlug: string,
                alignRight: boolean,
              ) => (
                <div className={`flex flex-wrap items-center gap-1 min-w-0 ${alignRight ? "justify-end" : ""}`}>
                  {row.player && (
                    <span className={`font-semibold text-rw-text text-[11px] shrink-0 ${alignRight ? "order-last ml-1" : "mr-1"}`}>
                      {row.u ? (
                        <HubLink to={{ kind: "player", slug: row.u, tab: "champions" }} className="hover:text-rw-accent">
                          {row.player}
                        </HubLink>
                      ) : (
                        row.player
                      )}
                    </span>
                  )}
                  {row.open.map((pk) => (
                    <HubLink
                      key={pk.c}
                      to={
                        row.u
                          ? { kind: "player", slug: row.u, tab: "champions", query: `champ=${encodeURIComponent(pk.c)}` }
                          : { kind: "team", slug: teamSlug, tab: "champions", query: `champ=${encodeURIComponent(pk.c)}` }
                      }
                      title={
                        pk.pocket
                          ? `${champName(pk.c)} · ${tl("pocket pick")} (${pk.g}G · ${winRate(pk.w, pk.g)})`
                          : `${champName(pk.c)} (${pk.g}G · ${winRate(pk.w, pk.g)})`
                      }
                      className={`inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] hover:border-rw-accent ${
                        pk.pocket ? "border-dashed border-rw-border/80 bg-rw-bg/50" : "border-rw-border bg-rw-bg"
                      }`}
                    >
                      <ChampIcon name={pk.c} size={15} />
                      <span className="text-rw-text hidden sm:inline">{champName(pk.c)}</span>
                      <span className="text-rw-muted tabular-nums text-[9px]">
                        {pk.g}G {winRate(pk.w, pk.g)}
                      </span>
                    </HubLink>
                  ))}
                </div>
              );
              return (
                <div key={rLabel} className="py-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  {renderPicks(ra, draftIntel.slugA, false)}
                  <span className="text-[9px] uppercase font-mono text-rw-muted text-center w-12 shrink-0">
                    {roleName(rLabel)}
                  </span>
                  {renderPicks(rb, draftIntel.slugB, true)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
