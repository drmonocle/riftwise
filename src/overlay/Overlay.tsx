/**
 * Stream overlay & interactive OBS Studio (/overlay):
 *  - /overlay?teams=t1,geng                          Matchup card (win chances, form, H2H, live score) — preserved unchanged
 *  - /overlay?mode=player&player=faker&p=y2026       Player spotlight lower-third
 *  - /overlay?mode=roster&players=a,b,c,d,e&title=.. 5-player lineup strip
 *  - /overlay or /overlay?studio=1                   Interactive OBS URL builder + live preview
 * Options on every widget: &bg=transparent &scale=0.5..3
 */
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, MonitorPlay, X } from "lucide-react";
import { tl, tc, roleName, fmtDec } from "../i18n";
import { fetchSchedule } from "../api";
import { loadHubPlayer, loadHubTeam, loadPlayerGames, loadRatings, loadTeamSeries, resolvePlayerSlug, resolveTeamAlias } from "../hub/data";
import { useDDragon } from "../hub/ddragon";
import { liveRating } from "../hub/liveRatings";
import { inPeriod, playerAgg, playerRowRef } from "../hub/period";
import { playerRowLine, rateLine, type RatingFile } from "../hub/playerRating";
import { loadHubLogos, loadHubPhotos } from "../hub/riotCatalog";
import type { HubPlayer, HubRatings, HubTeam, PlayerGameRow, TeamSeriesRow } from "../hub/types";
import { chanceContext, matchChance, seriesChance } from "../hub/winChance";
import { ComparePick } from "../components/hub/ComparePage";
import { fmtRating, RatingBadge, useRatingFile } from "../components/hub/PlayerRating";
import { ROSTER_ROLES } from "../components/hub/RosterBuilderPage";
import { ChampIcon, fmtNum, PlayerPhoto, TeamLogo } from "../components/hub/ui";
import type { Match } from "../types";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// ── 1. Matchup card (original OBS widget, unchanged DOM/layout) ───────────

const MatchupOverlay: React.FC<{ slugs: [string, string]; transparent: boolean; scale: number; embedded?: boolean }> = ({
  slugs,
  transparent,
  scale,
  embedded,
}) => {
  const [a, setA] = useState<HubTeam | null>(null);
  const [b, setB] = useState<HubTeam | null>(null);
  const [ratings, setRatings] = useState<HubRatings | null>(null);
  const [series, setSeries] = useState<TeamSeriesRow[]>([]);
  const [live, setLive] = useState<Match | null>(null);
  const [error, setError] = useState("");
  const slug0 = slugs[0];
  const slug1 = slugs[1];

  useEffect(() => {
    let alive = true;
    setError("");
    setA(null);
    setB(null);
    loadHubLogos();
    const load = () =>
      Promise.all([loadHubTeam(slug0), loadHubTeam(slug1), loadRatings(), loadTeamSeries(slug0).catch(() => [] as TeamSeriesRow[])])
        .then(([x, y, r, s]) => {
          if (!alive) return;
          setA(x);
          setB(y);
          setRatings(r);
          setSeries(s);
        })
        .catch(() => alive && setError(tl("Couldn't load the stats right now. Check your connection and try again in a minute.")));
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [slug0, slug1]);

  useEffect(() => {
    if (!a || !b) return;
    let alive = true;
    const names = [a, b].map((t) => new Set([norm(t.name), ...(t.codes || []).map(norm)]));
    const tick = () =>
      fetchSchedule(0)
        .then((ms) => {
          if (!alive) return;
          const m =
            ms.find(
              (x) =>
                x.state !== "completed" &&
                [x.team1Name, x.team1Code].some((n) => names[0].has(norm(n || ""))) &&
                [x.team2Name, x.team2Code].some((n) => names[1].has(norm(n || ""))),
            ) ||
            ms.find(
              (x) =>
                x.state !== "completed" &&
                [x.team1Name, x.team1Code].some((n) => names[1].has(norm(n || ""))) &&
                [x.team2Name, x.team2Code].some((n) => names[0].has(norm(n || ""))),
            );
          setLive(m || null);
        })
        .catch(() => {});
    tick();
    const t = setInterval(tick, 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [a, b]);

  const chances = useMemo(() => {
    if (!a?.rating || !b?.rating || !ratings) return null;
    if ((a.rating.rank == null || b.rating.rank == null) && a.rating.league !== b.rating.league) return null;
    const p = matchChance(liveRating(ratings, a.u, a.rating.r), liveRating(ratings, b.u, b.rating.r), chanceContext(a.rating.rank != null, b.rating.rank != null, a.rating.league, b.rating.league), ratings.adjust);
    return [
      [tc("short best of", "Bo{n}", { n: 1 }), p],
      [tc("short best of", "Bo{n}", { n: 3 }), seriesChance(p, 3, ratings.adjust)],
      [tc("short best of", "Bo{n}", { n: 5 }), seriesChance(p, 5, ratings.adjust)],
    ] as [string, number][];
  }, [a, b, ratings]);

  const meetings = useMemo(() => (b ? series.filter((r) => r[2] === b.u) : []), [series, b]);
  const form = (t: HubTeam) => t.recent.slice(0, 10).map((r) => r.us > r.them);
  const bg = transparent ? "transparent" : "var(--rw-bg)";
  if (error) return <div style={{ padding: 24, color: "var(--rw-red)", background: bg }}>{error}</div>;
  if (!a || !b) return <div style={{ padding: 24, color: "var(--rw-muted)", background: bg }}>…</div>;

  const wa = meetings.filter((r) => r[3] > r[4]).length;
  const swapped = !!live && [live.team1Name, live.team1Code].some((n) => norm(n || "") === norm(b.name) || (b.codes || []).some((c) => norm(c) === norm(n || "")));
  const scoreA = live ? (swapped ? live.team2Score : live.team1Score) : null;
  const scoreB = live ? (swapped ? live.team1Score : live.team2Score) : null;
  const side = (t: HubTeam, right: boolean, color: string) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: right ? "right" : "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: right ? "flex-end" : "flex-start" }}>
        {!right && <TeamLogo name={t.name} code={t.codes?.[0]} size={38} />}
        <div style={{ fontSize: t.name.length > 16 ? 24 : t.name.length > 11 ? 28 : 34, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
        {right && <TeamLogo name={t.name} code={t.codes?.[0]} size={38} />}
      </div>
      {t.rating && (
        <div style={{ fontSize: 14, color: "var(--rw-sub)" }}>
          {t.rating.rank != null ? `#${t.rating.rank} · ` : ""}
          {t.rating.league || ""} · {Math.round(liveRating(ratings, t.u, t.rating.r))}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, marginTop: 8, justifyContent: right ? "flex-end" : "flex-start" }}>
        {form(t).map((w, i) => (
          <span
            key={i}
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 800,
              background: "var(--rw-bg)",
              color: w ? "var(--rw-teal)" : "var(--rw-red)",
              border: `2px solid ${w ? "var(--rw-teal)" : "var(--rw-red)"}`,
            }}
          >
            {w ? tc("short result", "W") : tc("short result", "L")}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ background: embedded ? "transparent" : bg, minHeight: embedded ? undefined : "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          width: 760,
          maxWidth: "100%",
          padding: "20px 28px",
          borderRadius: 16,
          background: transparent ? "rgba(12, 10, 29, 0.85)" : "var(--rw-surface)",
          border: "1px solid var(--rw-border)",
          color: "var(--rw-text)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {side(a, false, "var(--rw-side-a)")}
          <div style={{ textAlign: "center", minWidth: 120 }}>
            {live && live.state !== "unstarted" ? (
              <div style={{ fontSize: 44, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: "var(--rw-side-a)" }}>{scoreA}</span> <span style={{ color: "var(--rw-muted)" }}>–</span> <span style={{ color: "var(--rw-side-b)" }}>{scoreB}</span>
              </div>
            ) : (
              <div
                style={{
                  display: "inline-block",
                  fontSize: 18,
                  fontWeight: 900,
                  color: "var(--rw-sub)",
                  padding: "4px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--rw-border)",
                  background: "var(--rw-bg)",
                  letterSpacing: 1.5,
                }}
              >
                VS
              </div>
            )}
            {live && (
              <div style={{ fontSize: 12, color: live.state === "inProgress" ? "var(--rw-red)" : "var(--rw-sub)", fontWeight: 700, marginTop: 4 }}>
                {live.state === "inProgress" ? tl("LIVE") : tc("short best of", "Bo{n}", { n: live.bestOf })}
              </div>
            )}
          </div>
          {side(b, true, "var(--rw-side-b)")}
        </div>
        {chances && (
          <div style={{ marginTop: 16, display: "grid", gap: 6 }}>
            {chances.map(([what, p]) => {
              const pa = Math.round(p * 100);
              const pb = 100 - pa;
              return (
                <div key={what} style={{ display: "grid", gridTemplateColumns: "54px 1fr 54px", alignItems: "center", gap: 10, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: pa >= pb ? "var(--rw-side-a)" : "var(--rw-sub)" }}>{pa}%</span>
                  <div style={{ position: "relative", height: 22, borderRadius: 6, overflow: "hidden", background: "var(--rw-side-b)", border: "1px solid var(--rw-border)" }}>
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${p * 100}%`, background: "var(--rw-side-a)", borderRight: "2px solid var(--rw-bg)" }} />
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span
                        style={{
                          background: "rgba(12, 10, 29, 0.86)",
                          color: "var(--rw-text)",
                          padding: "0 10px",
                          borderRadius: 999,
                          border: "1px solid var(--rw-border)",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {what}
                      </span>
                    </span>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: pb >= pa ? "var(--rw-side-b)" : "var(--rw-sub)", textAlign: "right" }}>{pb}%</span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--rw-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 13, color: "var(--rw-sub)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span>
              {meetings.length ? `${tl("Head to head (series)")}: ${a.name} ${wa}–${meetings.length - wa} ${b.name}` : tl("First ever meeting between these teams")}
            </span>
            {meetings.length > 0 && (
              <span style={{ display: "inline-flex", width: 88, height: 8, borderRadius: 999, overflow: "hidden", background: "var(--rw-side-b)", border: "1px solid var(--rw-border)" }}>
                <span style={{ width: `${Math.round((wa / meetings.length) * 100)}%`, background: "var(--rw-side-a)" }} />
              </span>
            )}
          </span>
          <span style={{ color: "var(--rw-muted)" }}>
            <b style={{ color: "var(--rw-accent)" }}>Rift</b>
            <b style={{ color: "var(--rw-teal)" }}>Wise</b> · <span style={{ color: "var(--rw-teal)" }}>riftwise.gg</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// ── 2. Player Spotlight lower-third (?mode=player&player=faker&p=y2026) ───

function avgPlayerRating(rows: PlayerGameRow[], rf: RatingFile | null): number | null {
  if (!rf || !rows.length) return null;
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = rateLine(playerRowLine(r), rf);
    if (v != null) {
      sum += v;
      n++;
    }
  }
  return n ? Number((sum / n).toFixed(1)) : null;
}

const PlayerOverlay: React.FC<{ slug: string; period: string; transparent: boolean; scale: number; embedded?: boolean }> = ({
  slug,
  period,
  transparent,
  scale,
  embedded,
}) => {
  useDDragon();
  const ratingFile = useRatingFile();
  const [player, setPlayer] = useState<HubPlayer | null>(null);
  const [games, setGames] = useState<PlayerGameRow[]>([]);
  const [error, setError] = useState("");
  const resolved = resolvePlayerSlug(slug);

  useEffect(() => {
    let alive = true;
    setError("");
    setPlayer(null);
    loadHubLogos();
    loadHubPhotos();
    const load = () =>
      Promise.all([loadHubPlayer(resolved), loadPlayerGames(resolved).catch(() => [] as PlayerGameRow[])])
        .then(([pl, gm]) => {
          if (!alive) return;
          setPlayer(pl);
          setGames(gm);
        })
        .catch(() => alive && setError(tl("Couldn't load the stats right now. Check your connection and try again in a minute.")));
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [resolved]);

  const rows = useMemo(() => {
    const sub = inPeriod(games, period, playerRowRef);
    return sub.length ? sub : games;
  }, [games, period]);

  const agg = useMemo(() => (rows.length ? playerAgg(rows) : null), [rows]);
  const rt = useMemo(() => avgPlayerRating(rows, ratingFile), [rows, ratingFile]);
  const bg = transparent ? "transparent" : "var(--rw-bg)";
  if (error) return <div style={{ padding: 24, color: "var(--rw-red)", background: bg }}>{error}</div>;
  if (!player) return <div style={{ padding: 24, color: "var(--rw-muted)", background: bg }}>…</div>;
  const wr = agg && agg.g ? Math.round((agg.w / agg.g) * 100) : Math.round((player.w / Math.max(player.g, 1)) * 100);
  const periodLabel = period === "all" ? tl("All time") : period.startsWith("y") ? period.slice(1) : period;

  return (
    <div style={{ background: embedded ? "transparent" : bg, minHeight: embedded ? undefined : "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          width: 700,
          maxWidth: "100%",
          padding: "18px 24px",
          borderRadius: 16,
          background: transparent ? "rgba(12, 10, 29, 0.88)" : "var(--rw-surface)",
          border: "1px solid var(--rw-border)",
          color: "var(--rw-text)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <PlayerPhoto name={player.name} team={player.club} slug={player.u} img={player.img} size={64} linkFallback={false} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05 }}>{player.name}</span>
              {rt != null && <RatingBadge v={rt} />}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 14, color: "var(--rw-sub)" }}>
              {player.club && <TeamLogo name={player.club} size={18} />}
              <span>{player.club || tl("Free agent")}</span>
              {player.role && <span>· {roleName(player.role)}</span>}
              <span>· {periodLabel}</span>
            </div>
          </div>
          {agg && agg.champs.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {agg.champs.slice(0, 4).map((c) => (
                <div key={c.c} style={{ textAlign: "center" }}>
                  <ChampIcon name={c.c} size={34} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--rw-sub)", fontVariantNumeric: "tabular-nums" }}>
                    {c.g} · {Math.round((c.w / c.g) * 100)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {agg && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rw-border)", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, fontVariantNumeric: "tabular-nums" }}>
            {[
              [tl("Games"), `${fmtNum(agg.g)} (${wr}%)`],
              ["KDA", fmtDec(agg.kda, 1)],
              ["DPM", agg.dpm != null ? fmtNum(agg.dpm) : "–"],
              ["DMG%", agg.dmgShare != null ? `${fmtDec(agg.dmgShare, 1)}%` : "–"],
              ["GD@15", agg.tl?.gd15 != null ? `${agg.tl.gd15 > 0 ? "+" : ""}${fmtNum(agg.tl.gd15)}` : "–"],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--rw-muted)" }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--rw-text)" }}>{val}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", fontSize: 12, color: "var(--rw-muted)" }}>
          <span>
            <b style={{ color: "var(--rw-accent)" }}>Rift</b>
            <b style={{ color: "var(--rw-teal)" }}>Wise</b> · <span style={{ color: "var(--rw-teal)" }}>riftwise.gg</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// ── 3. Five-player lineup bar (?mode=roster&players=a,b,c,d,e&title=...) ─

interface LoadedMember {
  slug: string;
  player: HubPlayer;
  games: PlayerGameRow[];
}

const RosterOverlay: React.FC<{ slugs: string[]; title: string; period: string; transparent: boolean; scale: number; embedded?: boolean }> = ({
  slugs,
  title,
  period,
  transparent,
  scale,
  embedded,
}) => {
  useDDragon();
  const ratingFile = useRatingFile();
  const [members, setMembers] = useState<(LoadedMember | null)[]>([]);
  const [error, setError] = useState("");
  const key = slugs.join(",");

  useEffect(() => {
    let alive = true;
    setError("");
    loadHubLogos();
    loadHubPhotos();
    const load = () =>
      Promise.all(
        slugs.slice(0, 5).map(async (rawSlug) => {
          const s = resolvePlayerSlug(rawSlug);
          try {
            const [player, games] = await Promise.all([loadHubPlayer(s), loadPlayerGames(s).catch(() => [] as PlayerGameRow[])]);
            return { slug: s, player, games } as LoadedMember;
          } catch {
            return null;
          }
        }),
      )
        .then((res) => {
          if (alive) setMembers(res);
        })
        .catch(() => alive && setError(tl("Couldn't load the stats right now. Check your connection and try again in a minute.")));
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const bg = transparent ? "transparent" : "var(--rw-bg)";
  if (error) return <div style={{ padding: 24, color: "var(--rw-red)", background: bg }}>{error}</div>;
  const ready = members.filter((m): m is LoadedMember => Boolean(m));
  if (!ready.length) return <div style={{ padding: 24, color: "var(--rw-muted)", background: bg }}>…</div>;

  const cards = ready.map((m, idx) => {
    const sub = inPeriod(m.games, period, playerRowRef);
    const rows = sub.length ? sub : m.games;
    const agg = rows.length ? playerAgg(rows) : null;
    const rt = avgPlayerRating(rows, ratingFile);
    return { ...m, agg, rt, slotRole: m.player.role || ROSTER_ROLES[idx] || "" };
  });
  const rated = cards.filter((c) => c.rt != null);
  const avgRt = rated.length ? Number((rated.reduce((s, c) => s + c.rt!, 0) / rated.length).toFixed(1)) : null;
  const periodLabel = period === "all" ? tl("All time") : period.startsWith("y") ? period.slice(1) : period;

  return (
    <div style={{ background: embedded ? "transparent" : bg, minHeight: embedded ? undefined : "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          width: 920,
          maxWidth: "100%",
          padding: "18px 24px",
          borderRadius: 16,
          background: transparent ? "rgba(12, 10, 29, 0.88)" : "var(--rw-surface)",
          border: "1px solid var(--rw-border)",
          color: "var(--rw-text)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 900 }}>{title || tl("Roster builder")}</span>
            <span style={{ fontSize: 12, color: "var(--rw-sub)" }}>· {periodLabel}</span>
          </div>
          {avgRt != null && <RatingBadge v={avgRt} />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(5, cards.length)}, minmax(0, 1fr))`, gap: 12 }}>
          {cards.map((c) => (
            <div
              key={c.slug}
              style={{
                background: "rgba(9, 8, 22, 0.65)",
                border: "1px solid var(--rw-border)",
                borderRadius: 12,
                padding: "10px 12px",
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--rw-accent)" }}>
                  {c.slotRole ? roleName(c.slotRole) : ""}
                </span>
                {c.rt != null && <RatingBadge v={c.rt} />}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <PlayerPhoto name={c.player.name} team={c.player.club} slug={c.slug} img={c.player.img} size={36} linkFallback={false} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.player.name}</div>
                  <div style={{ fontSize: 11, color: "var(--rw-sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.player.club || tl("Free agent")}</div>
                </div>
              </div>
              {c.agg && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--rw-border)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "var(--rw-sub)" }}>
                    {fmtNum(c.agg.g)} · {fmtDec(c.agg.kda, 1)} KDA
                  </span>
                  {c.agg.champs[0] && <ChampIcon name={c.agg.champs[0].c} size={18} />}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", fontSize: 12, color: "var(--rw-muted)" }}>
          <span>
            <b style={{ color: "var(--rw-accent)" }}>Rift</b>
            <b style={{ color: "var(--rw-teal)" }}>Wise</b> · <span style={{ color: "var(--rw-teal)" }}>riftwise.gg</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// ── 4. Interactive OBS Overlay Studio (/overlay or ?studio=1) ─────────────

type OverlayMode = "teams" | "player" | "roster";

const OverlayStudio: React.FC<{
  initMode: OverlayMode;
  initTeams: string[];
  initPlayer: string;
  initRoster: string[];
  initTitle: string;
  initPeriod: string;
  initTransparent: boolean;
  initScale: number;
}> = ({ initMode, initTeams, initPlayer, initRoster, initTitle, initPeriod, initTransparent, initScale }) => {
  const [mode, setMode] = useState<OverlayMode>(initMode);
  const [teamA, setTeamA] = useState(initTeams[0] || "t1");
  const [teamB, setTeamB] = useState(initTeams[1] || "geng");
  const [playerSlug, setPlayerSlug] = useState(initPlayer || "faker");
  const [rosterSlugs, setRosterSlugs] = useState<string[]>(
    initRoster.length ? initRoster.slice(0, 5) : ["doran", "oner", "faker", "peyz", "keria"],
  );
  const [rosterTitle, setRosterTitle] = useState(initTitle || "");
  const [period, setPeriod] = useState(initPeriod || `y${new Date().getFullYear()}`);
  const [transparent, setTransparent] = useState(initTransparent);
  const [scale, setScale] = useState(initScale || 1);
  const [copied, setCopied] = useState(false);

  const builtUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (mode === "teams") {
      p.set("teams", `${resolveTeamAlias(teamA) || teamA},${resolveTeamAlias(teamB) || teamB}`);
    } else if (mode === "player") {
      p.set("mode", "player");
      p.set("player", resolvePlayerSlug(playerSlug));
      p.set("p", period);
    } else {
      p.set("mode", "roster");
      p.set("players", rosterSlugs.map((s) => resolvePlayerSlug(s)).join(","));
      if (rosterTitle.trim()) p.set("title", rosterTitle.trim());
      p.set("p", period);
    }
    if (transparent) p.set("bg", "transparent");
    if (scale !== 1) p.set("scale", String(scale));
    return `${window.location.origin}/overlay?${p.toString()}`;
  }, [mode, teamA, teamB, playerSlug, rosterSlugs, rosterTitle, period, transparent, scale]);

  const copyUrl = () => {
    navigator.clipboard
      .writeText(builtUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="min-h-screen bg-rw-bg text-rw-text p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <a href="/" className="inline-flex items-center gap-1 text-xs text-rw-accent hover:underline mb-1">
              <ArrowLeft className="w-3.5 h-3.5" /> RiftWise
            </a>
            <h1 className="font-head text-2xl font-bold text-rw-text flex items-center gap-2">
              <MonitorPlay className="w-5 h-5 text-rw-accent" />
              {tl("OBS stream overlay")}
            </h1>
            <p className="text-xs text-rw-sub">
              {tl("Choose teams or players, adjust transparency and scale, then paste the URL into an OBS Browser Source.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ["teams", tl("Matchup")],
                ["player", tl("Player card")],
                ["roster", tl("5-player roster")],
              ] as [OverlayMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-3 py-1.5 rounded-lg border font-semibold ${
                  mode === m ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-rw-panel border border-rw-border rounded-xl p-4 space-y-4">
          {mode === "teams" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-rw-text">{tl("Side A")}: <span className="text-rw-accent">{teamA}</span></div>
                  <ComparePick kind="team" onPick={setTeamA} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-rw-text">{tl("Side B")}: <span className="text-rw-accent">{teamB}</span></div>
                  <ComparePick kind="team" onPick={setTeamB} />
                </div>
              </div>
              <p className="text-[11px] text-rw-muted">{tl("Add the two teams to the address: /overlay?teams=t1,geng")}</p>
            </div>
          )}

          {mode === "player" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-rw-text">{tl("Player")}: <span className="text-rw-accent">{playerSlug}</span></div>
                <ComparePick kind="player" onPick={setPlayerSlug} />
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="font-semibold text-rw-text">{tl("Period")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {[String(new Date().getFullYear()), String(new Date().getFullYear() - 1)].map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setPeriod(`y${y}`)}
                      className={`px-2.5 py-1 rounded-lg border ${period === `y${y}` ? "border-rw-accent text-rw-accent" : "border-rw-border text-rw-sub"}`}
                    >
                      {y}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPeriod("all")}
                    className={`px-2.5 py-1 rounded-lg border ${period === "all" ? "border-rw-accent text-rw-accent" : "border-rw-border text-rw-sub"}`}
                  >
                    {tl("All time")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === "roster" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={rosterTitle}
                  onChange={(e) => setRosterTitle(e.target.value)}
                  placeholder={tl("Roster title (optional)")}
                  aria-label={tl("Roster title (optional)")}
                  className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-xs text-rw-text flex-1 min-w-[12rem]"
                />
                <div className="flex flex-wrap gap-1 text-xs">
                  {rosterSlugs.map((s, idx) => (
                    <span key={`${s}-${idx}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rw-border bg-rw-bg">
                      <span className="font-semibold">{s}</span>
                      {rosterSlugs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setRosterSlugs((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label={tl("Clear")}
                          className="text-rw-muted hover:text-rw-red"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              {rosterSlugs.length < 5 && (
                <div className="max-w-xs">
                  <ComparePick kind="player" onPick={(s) => setRosterSlugs((prev) => [...prev.slice(0, 4), s])} />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-rw-border text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              <span>{tl("Transparent background (OBS)")}</span>
            </label>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-rw-muted">{tl("Scale")}</span>
              {[0.75, 1, 1.25, 1.5].map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setScale(sc)}
                  className={`px-2 py-0.5 rounded border tabular-nums ${scale === sc ? "border-rw-accent text-rw-accent font-semibold" : "border-rw-border text-rw-sub"}`}
                >
                  {sc}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input
              readOnly
              value={builtUrl}
              aria-label="OBS Browser Source URL"
              className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-rw-sub flex-1 min-w-[14rem]"
            />
            <button
              type="button"
              onClick={copyUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? tl("Copied") : tl("Copy link")}
            </button>
            <a
              href={builtUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rw-border hover:border-rw-accent text-xs font-semibold"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {tl("Open")}
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-rw-border bg-[radial-gradient(#262146_1px,transparent_1px)] [background-size:16px_16px] p-4 overflow-x-auto">
          {mode === "teams" && <MatchupOverlay slugs={[teamA, teamB]} transparent={transparent} scale={1} embedded />}
          {mode === "player" && <PlayerOverlay slug={playerSlug} period={period} transparent={transparent} scale={1} embedded />}
          {mode === "roster" && <RosterOverlay slugs={rosterSlugs} title={rosterTitle} period={period} transparent={transparent} scale={1} embedded />}
        </div>
      </div>
    </div>
  );
};

// ── Main entry point ──────────────────────────────────────────────────────

const q = new URLSearchParams(window.location.search);
const SLUGS = (q.get("teams") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const MODE_PARAM = (q.get("mode") || "").toLowerCase();
const PLAYER_PARAM = (q.get("player") || "").trim().toLowerCase();
const PLAYERS_PARAM = (q.get("players") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const TITLE_PARAM = q.get("title") || "";
const PERIOD_PARAM = q.get("p") || `y${new Date().getFullYear()}`;
const STUDIO = q.get("studio") === "1";
const TRANSPARENT = q.get("bg") === "transparent";
const SCALE = Math.min(3, Math.max(0.5, Number(q.get("scale")) || 1));

export const Overlay: React.FC = () => {
  if (!STUDIO) {
    if (MODE_PARAM === "player" || (!MODE_PARAM && !SLUGS.length && PLAYER_PARAM)) {
      if (PLAYER_PARAM) return <PlayerOverlay slug={PLAYER_PARAM} period={PERIOD_PARAM} transparent={TRANSPARENT} scale={SCALE} />;
    }
    if (MODE_PARAM === "roster" || (!MODE_PARAM && !SLUGS.length && PLAYERS_PARAM.length > 0)) {
      if (PLAYERS_PARAM.length > 0) {
        return <RosterOverlay slugs={PLAYERS_PARAM} title={TITLE_PARAM} period={PERIOD_PARAM} transparent={TRANSPARENT} scale={SCALE} />;
      }
    }
    if (SLUGS.length >= 2) {
      return <MatchupOverlay slugs={[SLUGS[0], SLUGS[1]]} transparent={TRANSPARENT} scale={SCALE} />;
    }
  }

  const initMode: OverlayMode =
    MODE_PARAM === "player" || (!SLUGS.length && PLAYER_PARAM)
      ? "player"
      : MODE_PARAM === "roster" || (!SLUGS.length && PLAYERS_PARAM.length > 0)
        ? "roster"
        : "teams";

  return (
    <OverlayStudio
      initMode={initMode}
      initTeams={SLUGS}
      initPlayer={PLAYER_PARAM}
      initRoster={PLAYERS_PARAM}
      initTitle={TITLE_PARAM}
      initPeriod={PERIOD_PARAM}
      initTransparent={TRANSPARENT}
      initScale={SCALE}
    />
  );
};
