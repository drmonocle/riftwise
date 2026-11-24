/**
 * Stream overlay & embeddable stats cards (/overlay and /embed):
 *  - ?teams=t1,geng                          Matchup card (win chances, form, H2H, live score) — preserved unchanged
 *  - ?mode=player&player=faker&p=y2026       Player spotlight lower-third
 *  - ?mode=roster&players=a,b,c,d,e&title=.. 5-player lineup strip
 *  - ?mode=rankings&league=lck&n=8           Global or regional Elo power rankings card
 *  - ?studio=1 (or bare /overlay, /embed)    Interactive OBS & <iframe> studio + live preview
 * Options on every widget: &bg=transparent &scale=0.5..3
 */
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Code2, Copy, ExternalLink, MonitorPlay, X } from "lucide-react";
import { tl, tc, roleName, fmtDec, tn } from "../i18n";
import { SITE_URL } from "../platform";
import { EMPTY_CATALOG, fetchLiveCatalog, fetchSchedule, loadBundledCatalog, loadCachedCatalog } from "../api";
import { pickemBoard, type PickemBoard as PickemBoardData } from "../sync";
import { loadAliases, loadHubPlayer, loadHubTeam, loadPlayerGames, loadRatings, loadTeamSeries, resolveChampSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias } from "../hub/data";
import { useDDragon } from "../hub/ddragon";
import { liveRating } from "../hub/liveRatings";
import { inPeriod, playerAgg, playerRowRef } from "../hub/period";
import { loadRatingFile, type RatingFile } from "../hub/playerRating";
import { BASE } from "../hub/route";
import { loadHubLogos, loadHubPhotos, RiotCatalogContext, useTeamLogo } from "../hub/riotCatalog";
import type { HubPlayer, HubRatings, HubTeam, PlayerGameRow, TeamSeriesRow } from "../hub/types";
import { chanceContext, matchChance, seriesChance } from "../hub/winChance";
import { ComparePick } from "../components/hub/ComparePage";
import { fmtRating, RatingBadge, useRatingFile } from "../components/hub/PlayerRating";
import {
  avgRatingInPeriod,
  computeRosterDelta,
  computeRosterEconomy,
  computeRosterFlexes,
  computeRosterSynergy,
  ROSTER_ROLES,
  teamLineupForPeriod,
  type RosterDeltaSlotInput,
  type RosterRole,
} from "../components/hub/RosterBuilderPage";
import { ChampIcon, fmtNum, PlayerPhoto, TeamLogo } from "../components/hub/ui";
import type { CatalogData, Match } from "../types";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const IS_EMBED = typeof window !== "undefined" && /^(?:\/(?:es|pt-br|ko|vi|zh-cn|zh-tw|ja|fr|de|tr))?\/embed\/?$/i.test(window.location.pathname);
const siteLink = (path = ""): string => `${SITE_URL}${BASE.slice(1)}${path.replace(/^\//, "")}`;

const BrandFoot: React.FC<{ linkOut?: boolean; href?: string }> = ({ linkOut, href }) => {
  const inner = (
    <span style={{ color: "var(--rw-muted)" }}>
      <b style={{ color: "var(--rw-accent)" }}>Rift</b>
      <b style={{ color: "var(--rw-teal)" }}>Wise</b> · <span style={{ color: "var(--rw-teal)" }}>riftwise.gg</span>
    </span>
  );
  return linkOut ? (
    <a href={href || SITE_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
      {inner}
    </a>
  ) : (
    inner
  );
};

// ── 1. Matchup card (original OBS widget, unchanged DOM/layout) ───────────

const MatchupOverlay: React.FC<{ slugs: [string, string]; transparent: boolean; scale: number; embedded?: boolean; linkOut?: boolean }> = ({
  slugs,
  transparent,
  scale,
  embedded,
  linkOut,
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
        <div style={{ fontSize: t.name.length > 16 ? 24 : t.name.length > 11 ? 28 : 34, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {linkOut && t.u ? (
            <a href={siteLink(`team/${encodeURIComponent(t.u)}`)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
              {t.name}
            </a>
          ) : (
            t.name
          )}
        </div>
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
          <BrandFoot linkOut={linkOut} />
        </div>
      </div>
    </div>
  );
};

// ── 2. Player Spotlight lower-third (?mode=player&player=faker&p=y2026) ───

const avgPlayerRating = avgRatingInPeriod;

const PlayerOverlay: React.FC<{ slug: string; period: string; transparent: boolean; scale: number; embedded?: boolean; linkOut?: boolean }> = ({
  slug,
  period,
  transparent,
  scale,
  embedded,
  linkOut,
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
              <span style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05 }}>
                {linkOut ? (
                  <a href={siteLink(`player/${encodeURIComponent(resolved)}`)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                    {player.name}
                  </a>
                ) : (
                  player.name
                )}
              </span>
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
          <BrandFoot linkOut={linkOut} href={siteLink(`player/${encodeURIComponent(resolved)}`)} />
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

const RosterOverlay: React.FC<{ slugs: string[]; title: string; period: string; transparent: boolean; scale: number; embedded?: boolean; linkOut?: boolean }> = ({
  slugs,
  title,
  period,
  transparent,
  scale,
  embedded,
  linkOut,
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
                  <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {linkOut ? (
                      <a href={siteLink(`player/${encodeURIComponent(c.slug)}`)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                        {c.player.name}
                      </a>
                    ) : (
                      c.player.name
                    )}
                  </div>
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
          <BrandFoot linkOut={linkOut} href={siteLink(`stats/gm?players=${encodeURIComponent(cards.map((c) => c.slug).join(","))}`)} />
        </div>
      </div>
    </div>
  );
};

// ── 3b. 16:9 Roster Report Card (?mode=report&team=t1&players=...&vs=t1&vp=y2026) ──

interface ReportLoadedPlayer {
  slug: string;
  player: HubPlayer | null;
  games: PlayerGameRow[];
}

interface ReportOverlayProps {
  teamParam: string;
  roleSlugs: Partial<Record<RosterRole, string>>;
  playersList: string[];
  vsParam: string;
  vp: string;
  period: string;
  newSlugs: string[];
  title: string;
  transparent: boolean;
  scale: number;
  linkOut?: boolean;
  catalogReady: boolean;
}

const ReportWatermark: React.FC<{ name: string; code?: string }> = ({ name, code }) => {
  const logo = useTeamLogo(name, code);
  if (!logo) return null;
  const httpsLogo = logo.replace(/^http:\/\//, "https://");
  return (
    <img
      src={httpsLogo}
      alt=""
      aria-hidden
      style={{
        position: "absolute",
        right: -90,
        top: 120,
        width: 640,
        height: 640,
        objectFit: "contain",
        opacity: 0.06,
        filter: "blur(1.5px)",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
};

const ReportOverlay: React.FC<ReportOverlayProps> = ({
  teamParam,
  roleSlugs,
  playersList,
  vsParam,
  vp,
  period,
  newSlugs,
  title,
  transparent,
  scale,
  linkOut,
  catalogReady,
}) => {
  useDDragon();
  const [ratingFile, setRatingFile] = useState<RatingFile | null>(null);
  const [teamObj, setTeamObj] = useState<HubTeam | null>(null);
  const [vsTeamObj, setVsTeamObj] = useState<HubTeam | null>(null);
  const [resolvedSlots, setResolvedSlots] = useState<Record<RosterRole, string>>({
    Top: "",
    Jungle: "",
    Mid: "",
    Bot: "",
    Support: "",
  });
  const [playerData, setPlayerData] = useState<Record<string, ReportLoadedPlayer>>({});
  const [dataSettled, setDataSettled] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  const slotsSig = ROSTER_ROLES.map((r) => roleSlugs[r] || "").join("|") + "::" + playersList.join(",");

  useEffect(() => {
    let alive = true;
    setError("");
    setDataSettled(false);
    setReady(false);

    (async () => {
      try {
        await Promise.all([loadAliases(), loadHubLogos(), loadHubPhotos()]);
        const rf = await loadRatingFile().catch(() => null);
        if (!alive) return;
        setRatingFile(rf);

        const normTeam = teamParam ? resolveTeamAlias(teamParam) || teamParam : "";
        const normVs = vsParam ? resolveTeamAlias(vsParam) || vsParam : "";
        const [loadedTeam, loadedVs] = await Promise.all([
          normTeam ? loadHubTeam(normTeam).catch(() => null) : Promise.resolve(null),
          normVs
            ? normVs === normTeam
              ? Promise.resolve(null)
              : loadHubTeam(normVs).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!alive) return;
        const effectiveVs = normVs && normVs === normTeam ? loadedTeam : loadedVs;
        setTeamObj(loadedTeam);
        setVsTeamObj(effectiveVs);

        const baseFallback = loadedTeam ? teamLineupForPeriod(loadedTeam, period) : {};
        const nextSlots = {} as Record<RosterRole, string>;
        const hasAnyExplicit = ROSTER_ROLES.some((r) => Boolean(roleSlugs[r])) || playersList.length > 0;
        ROSTER_ROLES.forEach((role, idx) => {
          const explicit = roleSlugs[role] || playersList[idx] || "";
          const raw = explicit || (!hasAnyExplicit ? baseFallback[role] || "" : "");
          nextSlots[role] = raw ? resolvePlayerSlug(raw) : "";
        });
        setResolvedSlots(nextSlots);

        const baseLineup = effectiveVs ? teamLineupForPeriod(effectiveVs, vp) : {};
        const wanted = [...new Set([...ROSTER_ROLES.map((r) => nextSlots[r]), ...ROSTER_ROLES.map((r) => baseLineup[r] || "")].filter(Boolean))];
        const entries = await Promise.all(
          wanted.map(async (slug): Promise<[string, ReportLoadedPlayer]> => {
            try {
              const [player, games] = await Promise.all([loadHubPlayer(slug), loadPlayerGames(slug).catch(() => [] as PlayerGameRow[])]);
              return [slug, { slug, player, games }];
            } catch {
              return [slug, { slug, player: null, games: [] }];
            }
          }),
        );
        if (!alive) return;
        setPlayerData(Object.fromEntries(entries));
        setDataSettled(true);
      } catch {
        if (alive) {
          setError(tl("Couldn't load the stats right now. Check your connection and try again in a minute."));
          setDataSettled(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamParam, vsParam, vp, period, slotsSig]);

  useEffect(() => {
    if (!dataSettled || !catalogReady) return;
    let alive = true;
    const deadline = Date.now() + 2500;
    const checkImages = () => {
      if (!alive) return;
      const imgs = cardRef.current ? Array.from(cardRef.current.querySelectorAll("img")) : [];
      const allDone = imgs.every((img) => img.complete);
      if (allDone || Date.now() >= deadline) {
        requestAnimationFrame(() => requestAnimationFrame(() => alive && setReady(true)));
        return;
      }
      window.setTimeout(checkImages, 50);
    };
    const t = window.setTimeout(checkImages, 40);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [dataSettled, catalogReady]);

  const explicitNewSet = useMemo(() => new Set(newSlugs.map((s) => resolvePlayerSlug(s))), [newSlugs]);
  const baseLineup = useMemo(() => (vsTeamObj ? teamLineupForPeriod(vsTeamObj, vp) : {}), [vsTeamObj, vp]);

  const roleCards = useMemo(() => {
    return ROSTER_ROLES.map((role) => {
      const slug = resolvedSlots[role];
      const rec = slug ? playerData[slug] : undefined;
      const player = rec?.player ?? null;
      const games = rec?.games ?? [];
      const sub = inPeriod(games, period, playerRowRef);
      const usedGames = sub.length ? sub : games;
      const fallback = Boolean(player && period !== "all" && sub.length === 0 && games.length > 0);
      const agg = usedGames.length ? playerAgg(usedGames) : null;
      const rt = avgRatingInPeriod(usedGames, ratingFile);

      const baseSlug = baseLineup[role] ? resolvePlayerSlug(baseLineup[role]!) : "";
      const teamCanon = teamObj ? resolveTeamAlias(teamObj.u) || teamObj.u : "";
      const playerClubCanon = player?.clubU ? resolveTeamAlias(player.clubU) || player.clubU : "";
      const playedForTeamInPeriod = Boolean(
        teamObj &&
          usedGames.some((g) => {
            const gt = resolveTeamAlias(g[7] || "") || g[7].toLowerCase();
            return gt === teamCanon || g[7].toLowerCase() === teamObj.name.toLowerCase();
          }),
      );
      const isNew =
        Boolean(slug) &&
        (explicitNewSet.has(slug) ||
          (Boolean(baseSlug) && baseSlug !== slug) ||
          (Boolean(teamObj) && !explicitNewSet.size && Boolean(playerClubCanon && playerClubCanon !== teamCanon && !playedForTeamInPeriod)));

      const contractDate = (slug && teamObj?.contracts?.[slug]) || player?.bio?.contract || "";
      const contractYY = /^\d{4}/.test(contractDate) ? `'${contractDate.slice(2, 4)}` : "";

      return { role, slug, player, games, agg, rt, fallback, isNew, baseSlug, contractYY };
    });
  }, [resolvedSlots, playerData, period, ratingFile, baseLineup, teamObj, explicitNewSet]);

  const filledCards = useMemo(() => roleCards.filter((c) => Boolean(c.player && c.agg)), [roleCards]);

  const economy = useMemo(
    () =>
      computeRosterEconomy(
        filledCards.map((c) => ({
          role: c.role,
          games: c.agg!.g,
          rating: c.rt,
          goldShare: c.agg!.goldShare,
          dmgShare: c.agg!.dmgShare,
          gd15: c.agg!.tl?.gd15 ?? null,
        })),
      ),
    [filledCards],
  );

  const flexReport = useMemo(
    () =>
      computeRosterFlexes(
        filledCards.map((c) => ({
          slug: c.slug,
          name: c.player!.name,
          role: c.role,
          champs: c.agg!.champs.map((ch) => ({ champ: ch.c, games: ch.g, wins: ch.w })),
        })),
      ),
    [filledCards],
  );

  const synergyPairs = useMemo(
    () =>
      computeRosterSynergy(
        filledCards.map((c) => ({
          slug: c.slug,
          name: c.player!.name,
          role: c.role,
          games: c.games,
        })),
      ),
    [filledCards],
  );

  const deltaSummary = useMemo(() => {
    if (!vsTeamObj) return null;
    const currMap = {} as Partial<Record<RosterRole, RosterDeltaSlotInput | null>>;
    const baseMap = {} as Partial<Record<RosterRole, RosterDeltaSlotInput | null>>;
    for (const c of roleCards) {
      currMap[c.role] =
        c.player && c.agg
          ? {
              role: c.role,
              slug: c.slug,
              name: c.player.name,
              games: c.agg.g,
              rating: c.rt,
              kda: c.agg.kda,
              dpm: c.agg.dpm,
              goldShare: c.agg.goldShare,
              gd15: c.agg.tl?.gd15 ?? null,
            }
          : null;
      const bRec = c.baseSlug ? playerData[c.baseSlug] : undefined;
      if (bRec?.player) {
        const bSub = inPeriod(bRec.games, vp, playerRowRef);
        const bUsed = bSub.length ? bSub : bRec.games;
        const bAgg = bUsed.length ? playerAgg(bUsed) : null;
        baseMap[c.role] = bAgg
          ? {
              role: c.role,
              slug: c.baseSlug,
              name: bRec.player.name,
              games: bAgg.g,
              rating: avgRatingInPeriod(bUsed, ratingFile),
              kda: bAgg.kda,
              dpm: bAgg.dpm,
              goldShare: bAgg.goldShare,
              gd15: bAgg.tl?.gd15 ?? null,
            }
          : null;
      } else {
        baseMap[c.role] = null;
      }
    }
    return computeRosterDelta(currMap, baseMap, period === vp);
  }, [vsTeamObj, roleCards, playerData, vp, period, ratingFile]);

  const bg = transparent ? "transparent" : "var(--rw-bg)";
  if (error) return <div style={{ padding: 24, color: "var(--rw-red)", background: bg }}>{error}</div>;
  if (!dataSettled) return <div style={{ padding: 24, color: "var(--rw-muted)", background: bg }}>…</div>;

  const periodLabel = period === "all" ? tl("All time") : period.startsWith("y") ? period.slice(1) : period;
  const vpLabel = vp === "all" ? tl("All time") : vp.startsWith("y") ? vp.slice(1) : vp;
  const headerTitle = title || (teamObj ? teamObj.name : tl("Roster builder"));
  const gmParams = new URLSearchParams({ p: period });
  for (const c of roleCards) {
    if (c.slug) gmParams.set(c.role === "Jungle" ? "jg" : c.role === "Support" ? "sup" : c.role.toLowerCase(), c.slug);
  }
  if (vsTeamObj) {
    gmParams.set("vs", vsTeamObj.u);
    gmParams.set("vp", vp);
  }
  const gmHref = siteLink(`stats/gm?${gmParams.toString()}`);

  const econLabel =
    economy.economyStatus === "balanced"
      ? tl("Balanced")
      : economy.economyStatus === "greedy"
        ? tl("Greedy")
        : economy.economyStatus === "low-econ"
          ? tl("Low-econ")
          : tl("Incomplete");
  const econColor =
    economy.economyStatus === "balanced"
      ? "var(--rw-teal)"
      : economy.economyStatus === "greedy"
        ? "var(--rw-red)"
        : "var(--rw-sub)";
  const gradeColor =
    economy.grade === "S"
      ? "var(--rw-teal)"
      : economy.grade === "A"
        ? "var(--rw-accent)"
        : economy.grade === "B"
          ? "var(--rw-text)"
          : "var(--rw-sub)";

  return (
    <div style={{ background: bg, minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
      <div
        id="rw-roster-report-card"
        ref={cardRef}
        data-ready={ready ? "1" : "0"}
        style={{
          position: "relative",
          overflow: "hidden",
          isolation: "isolate",
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top center",
          width: 1600,
          height: 900,
          boxSizing: "border-box",
          padding: "28px 44px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          color: "var(--rw-text)",
          fontFamily: "inherit",
          background: "linear-gradient(135deg, var(--rw-surface) 0%, var(--rw-bg) 74%)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, var(--rw-accent) 0%, var(--rw-teal) 100%)",
            zIndex: 2,
          }}
        />
        {teamObj && <ReportWatermark name={teamObj.name} code={teamObj.codes?.[0]} />}

        {/* Header */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, minHeight: 74 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
            {teamObj && <TeamLogo name={teamObj.name} code={teamObj.codes?.[0]} size={64} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2.2, textTransform: "uppercase", color: "var(--rw-accent)" }}>
                  {tl("Roster report card")}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 999, border: "1px solid var(--rw-border)", background: "rgba(9, 8, 22, 0.72)", color: "var(--rw-teal)" }}>
                  {periodLabel}
                </span>
                {teamObj?.rating?.league && (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 999, border: "1px solid var(--rw-border)", background: "rgba(9, 8, 22, 0.72)", color: "var(--rw-sub)" }}>
                    {teamObj.rating.league}
                    {teamObj.rating.rank != null ? ` · #${teamObj.rating.rank}` : ""}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.08, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {headerTitle}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            {deltaSummary && deltaSummary.comparedRoles > 0 && (deltaSummary.netRatingDelta != null || deltaSummary.netGd15Delta != null) && (
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  background: "rgba(9, 8, 22, 0.72)",
                  border: "1px solid var(--rw-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--rw-muted)" }}>
                  {tl("Baseline")} ({vpLabel})
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 800 }}>
                  {deltaSummary.netRatingDelta != null && (
                    <span style={{ color: deltaSummary.netRatingDelta > 0 ? "var(--rw-teal)" : deltaSummary.netRatingDelta < 0 ? "var(--rw-red)" : "var(--rw-sub)" }}>
                      {deltaSummary.netRatingDelta > 0 ? `+${fmtDec(deltaSummary.netRatingDelta, 1)}` : fmtDec(deltaSummary.netRatingDelta, 1)} {tl("Rating")}
                    </span>
                  )}
                  {deltaSummary.netGd15Delta != null && (
                    <span style={{ color: deltaSummary.netGd15Delta > 0 ? "var(--rw-teal)" : deltaSummary.netGd15Delta < 0 ? "var(--rw-red)" : "var(--rw-sub)" }}>
                      {deltaSummary.netGd15Delta > 0 ? `+${fmtNum(deltaSummary.netGd15Delta)}` : fmtNum(deltaSummary.netGd15Delta)} GD@15
                    </span>
                  )}
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "8px 14px 8px 18px",
                borderRadius: 14,
                background: "rgba(9, 8, 22, 0.78)",
                border: "1px solid var(--rw-line)",
              }}
            >
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--rw-muted)" }}>
                  {tl("Rating")}
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: "tabular-nums", color: "var(--rw-text)" }}>
                  {economy.avgRating != null ? fmtRating(economy.avgRating) : "–"}
                </div>
              </div>
              {economy.grade && (
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 30,
                    fontWeight: 900,
                    background: "rgba(179, 157, 255, 0.14)",
                    border: `2px solid ${gradeColor}`,
                    color: gradeColor,
                  }}
                >
                  {economy.grade}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5 Role Columns */}
        <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14 }}>
          {roleCards.map((c) => {
            const p = c.player;
            const agg = c.agg;
            const wr = agg && agg.g ? Math.round((agg.w / agg.g) * 100) : null;
            const dRow = deltaSummary?.rows.find((r) => r.role === c.role);
            const subLabel = c.isNew
              ? p?.club || tl("Free agent")
              : teamObj && p
                ? tl("Returning")
                : p?.club || tl("Free agent");
            const showPredDelta = Boolean(dRow?.baseline && dRow.baseline.slug !== c.slug && dRow.dRating != null);

            return (
              <div
                key={c.role}
                style={{
                  background: "rgba(9, 8, 22, 0.74)",
                  border: c.isNew ? "1px solid rgba(224, 184, 107, 0.65)" : "1px solid var(--rw-border)",
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--rw-border)" }}>
                  <span style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.4, color: "var(--rw-accent)" }}>
                    {roleName(c.role)}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {c.isNew && (
                      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.9, padding: "2px 8px", borderRadius: 999, background: "rgba(224, 184, 107, 0.2)", border: "1px solid var(--rw-teal)", color: "var(--rw-teal)" }}>
                        NEW
                      </span>
                    )}
                    {c.contractYY && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 6, border: "1px solid var(--rw-border)", color: "var(--rw-muted)", fontVariantNumeric: "tabular-nums" }}>
                        {c.contractYY}
                      </span>
                    )}
                  </div>
                </div>

                {p ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, minWidth: 0 }}>
                      <div style={{ borderRadius: "50%", padding: 2, background: c.isNew ? "var(--rw-teal)" : "var(--rw-accent)", flexShrink: 0 }}>
                        <PlayerPhoto name={p.name} team={p.club} slug={c.slug} img={p.img} size={70} linkFallback={false} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {linkOut ? (
                            <a href={siteLink(`player/${encodeURIComponent(c.slug)}`)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                              {p.name}
                            </a>
                          ) : (
                            p.name
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 12, color: c.isNew ? "var(--rw-teal)" : "var(--rw-sub)", fontWeight: c.isNew ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.isNew && p.club && <TeamLogo name={p.club} size={14} />}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{subLabel}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        padding: "7px 10px",
                        borderRadius: 10,
                        background: "rgba(21, 18, 48, 0.78)",
                        border: "1px solid var(--rw-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {c.rt != null ? <RatingBadge v={c.rt} /> : <span style={{ fontSize: 12, color: "var(--rw-muted)" }}>–</span>}
                      {showPredDelta ? (
                        <span style={{ fontSize: 11, fontWeight: 800, color: dRow!.dRating! > 0 ? "var(--rw-teal)" : dRow!.dRating! < 0 ? "var(--rw-red)" : "var(--rw-sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {dRow!.dRating! > 0 ? `+${fmtDec(dRow!.dRating!, 1)}` : fmtDec(dRow!.dRating!, 1)} vs {dRow!.baseline!.name}
                        </span>
                      ) : (
                        agg && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--rw-sub)" }}>
                            {fmtNum(agg.g)}G{wr != null ? ` · ${wr}%` : ""}
                            {c.fallback ? " *" : ""}
                          </span>
                        )
                      )}
                    </div>

                    {agg && (
                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr auto", rowGap: 9, columnGap: 10, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                        {[
                          [tl("Games"), `${fmtNum(agg.g)}${wr != null ? ` (${wr}%)` : ""}`, "var(--rw-text)"],
                          ["KDA", fmtDec(agg.kda, 1), "var(--rw-text)"],
                          ["DPM", agg.dpm != null ? fmtNum(agg.dpm) : "–", "var(--rw-sub)"],
                          ["Gold%", agg.goldShare != null ? `${fmtDec(agg.goldShare, 1)}%` : "–", "var(--rw-sub)"],
                          ["DMG%", agg.dmgShare != null ? `${fmtDec(agg.dmgShare, 1)}%` : "–", "var(--rw-sub)"],
                          [
                            "GD@15",
                            agg.tl?.gd15 != null ? `${agg.tl.gd15 > 0 ? "+" : ""}${fmtNum(agg.tl.gd15)}` : "–",
                            (agg.tl?.gd15 || 0) > 0 ? "var(--rw-teal)" : (agg.tl?.gd15 || 0) < 0 ? "var(--rw-red)" : "var(--rw-sub)",
                          ],
                        ].map(([k, v, col]) => (
                          <React.Fragment key={k}>
                            <span style={{ color: "var(--rw-muted)", fontWeight: 600 }}>{k}</span>
                            <span style={{ textAlign: "right", fontWeight: 800, color: col }}>{v}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}

                    {agg && agg.champs.length > 0 && (
                      <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--rw-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {agg.champs.slice(0, 3).map((ch) => (
                            <div
                              key={ch.c}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "3px 7px",
                                borderRadius: 8,
                                background: "rgba(21, 18, 48, 0.85)",
                                border: "1px solid var(--rw-border)",
                                fontSize: 11,
                                fontWeight: 700,
                                fontVariantNumeric: "tabular-nums",
                                color: "var(--rw-sub)",
                              }}
                            >
                              <ChampIcon name={ch.c} size={22} />
                              <span>{ch.g}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ marginTop: 24, fontSize: 13, color: "var(--rw-muted)" }}>—</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom 3 Analyst Summary Panels */}
        <div style={{ position: "relative", zIndex: 1, height: 162, display: "grid", gridTemplateColumns: "1.05fr 1fr 1.15fr", gap: 14 }}>
          {/* 1. Economy & Resource Fit */}
          <div style={{ background: "rgba(9, 8, 22, 0.74)", border: "1px solid var(--rw-border)", borderRadius: 14, padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--rw-accent)" }}>
                {tl("Rating & resource fit")}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999, border: `1px solid ${econColor}`, color: econColor }}>
                {econLabel}
              </span>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: "var(--rw-muted)" }}>{tl("Combined Gold%")}</span>
                <span style={{ fontWeight: 800 }}>{economy.totalGoldShare != null ? `${fmtDec(economy.totalGoldShare, 1)}%` : "–"}</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.07)", border: "1px solid var(--rw-border)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${economy.totalGoldShare != null ? Math.min(100, (economy.totalGoldShare / 120) * 100) : 0}%`,
                    background: econColor,
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingTop: 8, borderTop: "1px solid var(--rw-border)", fontVariantNumeric: "tabular-nums" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--rw-muted)" }}>{tl("Combined DMG%")}</div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{economy.totalDmgShare != null ? `${fmtDec(economy.totalDmgShare, 1)}%` : "–"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--rw-muted)" }}>{tl("Combined GD@15")}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: (economy.sumGd15 || 0) > 0 ? "var(--rw-teal)" : (economy.sumGd15 || 0) < 0 ? "var(--rw-red)" : "var(--rw-sub)" }}>
                  {economy.sumGd15 != null ? `${economy.sumGd15 > 0 ? "+" : ""}${fmtNum(economy.sumGd15)}` : "–"}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Duo Chemistry */}
          <div style={{ background: "rgba(9, 8, 22, 0.74)", border: "1px solid var(--rw-border)", borderRadius: 14, padding: "12px 16px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--rw-accent)", marginBottom: 8 }}>
              {tl("Teammate chemistry")}
            </div>
            {synergyPairs.length > 0 ? (
              <div style={{ display: "grid", gap: 6, fontVariantNumeric: "tabular-nums" }}>
                {synergyPairs.slice(0, 3).map((pair) => (
                  <div
                    key={`${pair.a.slug}-${pair.b.slug}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "5px 10px",
                      borderRadius: 8,
                      background: "rgba(21, 18, 48, 0.72)",
                      border: "1px solid var(--rw-border)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {pair.a.name} + {pair.b.name}
                    </span>
                    <span style={{ whiteSpace: "nowrap", fontWeight: 800 }}>
                      <span style={{ color: "var(--rw-sub)", fontWeight: 600 }}>{fmtNum(pair.games)}G · </span>
                      <span style={{ color: pair.winPct >= 55 ? "var(--rw-teal)" : pair.winPct < 45 ? "var(--rw-red)" : "var(--rw-text)" }}>
                        {fmtDec(pair.winPct, 1)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--rw-muted)", margin: "auto 0", lineHeight: 1.45 }}>
                {tl("None of these selected players have shared an official pro match together yet.")}
              </p>
            )}
          </div>

          {/* 3. Bo5 Fearless & Flex Depth */}
          <div style={{ background: "rgba(9, 8, 22, 0.74)", border: "1px solid var(--rw-border)", borderRadius: 14, padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--rw-accent)" }}>
              {tl("Bo5 Fearless & flex depth")}
            </div>
            {flexReport.flexPicks.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, overflow: "hidden", maxHeight: 74 }}>
                {flexReport.flexPicks.slice(0, 6).map((f) => (
                  <span
                    key={f.champ}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 9px",
                      borderRadius: 8,
                      background: "rgba(21, 18, 48, 0.85)",
                      border: "1px solid var(--rw-border)",
                      fontSize: 12,
                    }}
                  >
                    <ChampIcon name={f.champ} size={20} />
                    <span style={{ fontWeight: 800 }}>{f.champ}</span>
                    <span style={{ color: "var(--rw-muted)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{f.totalGames}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--rw-muted)" }}>
                {tl("No shared multi-role flex champions with 3+ games yet in this period.")}
              </div>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, paddingTop: 7, borderTop: "1px solid var(--rw-border)", color: flexReport.shallowPools.length > 0 ? "var(--rw-red)" : "var(--rw-teal)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {flexReport.shallowPools.length > 0
                ? `${tl("Fearless pinch watch (<5 picks with 2+ games):")} ${flexReport.shallowPools.map((s) => `${s.name} (${s.usableCount})`).join(", ")}`
                : tl("All filled roles have 5+ proven champions (2+ games) for deep Bo5 Fearless drafts.")}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--rw-border)", paddingTop: 10, fontSize: 13, color: "var(--rw-muted)" }}>
          <BrandFoot linkOut={linkOut} href={gmHref} />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            Leaguepedia (CC BY-SA 3.0) · Oracle's Elixir · {new Date().toISOString().slice(0, 10)}
          </span>
        </div>
      </div>
    </div>
  );
};

// ── 4. Power rankings card (?mode=rankings&league=lck&n=8) ──────────────

const RankingsOverlay: React.FC<{ league: string; count: number; transparent: boolean; scale: number; embedded?: boolean; linkOut?: boolean }> = ({
  league,
  count,
  transparent,
  scale,
  embedded,
  linkOut,
}) => {
  const [data, setData] = useState<HubRatings | null>(null);
  const [error, setError] = useState("");
  const capped = Math.min(15, Math.max(3, count || 8));

  useEffect(() => {
    let alive = true;
    setError("");
    loadHubLogos();
    const load = () =>
      loadRatings()
        .then((r) => {
          if (alive) setData(r);
        })
        .catch(() => alive && setError(tl("Couldn't load the stats right now. Check your connection and try again in a minute.")));
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const bg = transparent ? "transparent" : "var(--rw-bg)";
  if (error) return <div style={{ padding: 24, color: "var(--rw-red)", background: bg }}>{error}</div>;
  if (!data) return <div style={{ padding: 24, color: "var(--rw-muted)", background: bg }}>…</div>;

  const low = league.trim().toLowerCase();
  const slug = low ? resolveLeagueSlug(low).toLowerCase() : "";
  const matched = low
    ? data.teams.filter(
        (r) =>
          (r[3] && r[3].toLowerCase() === low) ||
          (r[4] && (r[4].toLowerCase() === low || r[4].toLowerCase() === slug)) ||
          (r[10] && r[10].toLowerCase() === low),
      )
    : [];
  const rows = (matched.length ? matched : data.teams.filter((r) => r[9] === 1)).slice(0, capped);
  const maxR = Math.max(1500, ...rows.map((r) => r[5]));
  const minR = Math.min(...rows.map((r) => r[5])) - 40;
  const scopeLabel = matched.length ? matched[0][10] || matched[0][3] : tl("Global");
  const rankingsHref = siteLink(`stats/rankings${matched.length && matched[0][4] ? `?league=${encodeURIComponent(matched[0][4])}` : ""}`);

  return (
    <div style={{ background: embedded ? "transparent" : bg, minHeight: embedded ? undefined : "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          width: 680,
          maxWidth: "100%",
          padding: "18px 24px",
          borderRadius: 16,
          background: transparent ? "rgba(12, 10, 29, 0.88)" : "var(--rw-surface)",
          border: "1px solid var(--rw-border)",
          color: "var(--rw-text)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 900 }}>{tl("Power rankings")}</span>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--rw-border)", background: "rgba(9, 8, 22, 0.7)", color: "var(--rw-accent)" }}>
              {scopeLabel}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--rw-muted)", fontVariantNumeric: "tabular-nums" }}>{data.asof}</span>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((r, i) => {
            const pctW = Math.max(8, Math.min(100, Math.round(((r[5] - minR) / Math.max(1, maxR - minR)) * 100)));
            const chg = r[6];
            return (
              <div
                key={r[0] || `${r[1]}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto 48px 54px",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  borderRadius: 10,
                  background: "rgba(9, 8, 22, 0.65)",
                  border: "1px solid var(--rw-border)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: i === 0 ? "var(--rw-accent)" : "var(--rw-muted)" }}>#{i + 1}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <TeamLogo name={r[1]} code={r[2]} size={20} />
                  <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {linkOut && r[0] ? (
                      <a href={siteLink(`team/${encodeURIComponent(r[0])}`)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                        {r[1]}
                      </a>
                    ) : (
                      r[1]
                    )}
                  </span>
                  {!matched.length && (r[10] || r[3]) && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--rw-muted)", whiteSpace: "nowrap" }}>{r[10] || r[3]}</span>
                  )}
                </div>
                <div style={{ width: 92, height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div style={{ width: `${pctW}%`, height: "100%", borderRadius: 999, background: i < 3 ? "var(--rw-accent)" : "var(--rw-teal)" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, textAlign: "right", color: chg == null || chg === 0 ? "var(--rw-muted)" : chg > 0 ? "var(--rw-teal)" : "var(--rw-red)" }}>
                  {chg == null ? "–" : chg > 0 ? `+${chg}` : chg}
                </span>
                <span style={{ fontSize: 14, fontWeight: 900, textAlign: "right", color: "var(--rw-text)" }}>{fmtNum(Math.round(r[5]))}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", fontSize: 12, color: "var(--rw-muted)" }}>
          <BrandFoot linkOut={linkOut} href={rankingsHref} />
        </div>
      </div>
    </div>
  );
};

// ── 4b. Pick'Em leaderboard card (?mode=pickem&event=season-2026&group=CODE&n=8) ────

const PickemOverlay: React.FC<{ event: string; group?: string; count: number; transparent: boolean; scale: number; embedded?: boolean; linkOut?: boolean }> = ({
  event,
  group,
  count,
  transparent,
  scale,
  embedded,
  linkOut,
}) => {
  const [data, setData] = useState<PickemBoardData | null>(null);
  const [error, setError] = useState("");
  const capped = Math.min(12, Math.max(3, count || 8));

  useEffect(() => {
    let alive = true;
    setError("");
    const load = () =>
      pickemBoard(event, group || undefined)
        .then((b) => {
          if (alive) setData(b);
        })
        .catch(() => alive && setError(tl("Couldn't load the stats right now. Check your connection and try again in a minute.")));
    load();
    const t = setInterval(load, 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [event, group]);

  const bg = transparent ? "transparent" : "var(--rw-bg)";
  if (error) return <div style={{ padding: 24, color: "var(--rw-red)", background: bg }}>{error}</div>;
  if (!data) return <div style={{ padding: 24, color: "var(--rw-muted)", background: bg }}>…</div>;

  const rows = (data.rows || []).slice(0, capped);
  const maxScore = Math.max(1, ...rows.map((r) => r.score));
  const evBase = event.replace(/-\d{4}$/, "");
  const linkPath = evBase === "worlds" || evBase === "msi" || evBase === "first-stand"
    ? `stats/${evBase}`
    : `stats/pickem?league=${encodeURIComponent(evBase)}${group ? `&group=${encodeURIComponent(group)}` : ""}`;

  return (
    <div style={{ background: embedded ? "transparent" : bg, minHeight: embedded ? undefined : "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          width: 440,
          maxWidth: "100%",
          padding: "18px 22px",
          borderRadius: 16,
          background: transparent ? "rgba(12, 10, 29, 0.88)" : "var(--rw-surface)",
          border: "1px solid var(--rw-border)",
          color: "var(--rw-text)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 900 }}>{tl("Pick'Em")}</span>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--rw-border)", background: "rgba(9, 8, 22, 0.7)", color: "var(--rw-accent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {data.group?.name || event.toUpperCase()}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--rw-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {data.group ? data.group.code : tn("{n} player entered", "{n} players entered", data.players)}
          </span>
        </div>
        {rows.length > 0 ? (
          <div style={{ display: "grid", gap: 6 }}>
            {rows.map((r, i) => {
              const barPct = Math.max(8, Math.round((r.score / maxScore) * 100));
              return (
                <div
                  key={`${r.rank}-${r.name}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr auto 74px 40px",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 10,
                    background: "rgba(9, 8, 22, 0.65)",
                    border: "1px solid var(--rw-border)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: r.rank === 1 ? "var(--rw-accent)" : "var(--rw-muted)" }}>#{r.rank}</span>
                  <span style={{ fontSize: 13, fontWeight: r.rank === 1 ? 800 : 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontStyle: r.name ? "normal" : "italic", color: r.name ? "var(--rw-text)" : "var(--rw-muted)" }}>
                    {r.name || tl("Hidden player")}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--rw-muted)" }}>{r.right}/{r.scored}</span>
                  <div style={{ width: 74, height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${barPct}%`, height: "100%", borderRadius: 999, background: r.rank <= 3 ? "var(--rw-accent)" : "var(--rw-teal)" }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, textAlign: "right", color: "var(--rw-accent)" }}>{r.score}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--rw-muted)", margin: "8px 0" }}>{tl("Nobody has entered yet. Be the first.")}</p>
        )}
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", fontSize: 12, color: "var(--rw-muted)" }}>
          <BrandFoot linkOut={linkOut} href={siteLink(linkPath)} />
        </div>
      </div>
    </div>
  );
};

// ── 5. Interactive OBS & Embed Studio (/overlay or /embed?studio=1) ──────

type OverlayMode = "teams" | "player" | "roster" | "rankings" | "pickem";
const RANKING_LEAGUES: [string, string][] = [
  ["", "Global"],
  ["lck", "LCK"],
  ["lpl", "LPL"],
  ["lec", "LEC"],
  ["lcs", "LCS"],
];
const PICKEM_EVENTS = ["season-2026", "lck-2026", "lpl-2026", "lec-2026", "lcs-2026", "worlds-2026"];

const OverlayStudio: React.FC<{
  initMode: OverlayMode;
  initTeams: string[];
  initPlayer: string;
  initRoster: string[];
  initTitle: string;
  initPeriod: string;
  initLeague: string;
  initCount: number;
  initEvent: string;
  initGroup: string;
  initTransparent: boolean;
  initScale: number;
}> = ({ initMode, initTeams, initPlayer, initRoster, initTitle, initPeriod, initLeague, initCount, initEvent, initGroup, initTransparent, initScale }) => {
  const [mode, setMode] = useState<OverlayMode>(initMode);
  const [teamA, setTeamA] = useState(initTeams[0] || "t1");
  const [teamB, setTeamB] = useState(initTeams[1] || "geng");
  const [playerSlug, setPlayerSlug] = useState(initPlayer || "faker");
  const [rosterSlugs, setRosterSlugs] = useState<string[]>(
    initRoster.length ? initRoster.slice(0, 5) : ["doran", "oner", "faker", "peyz", "keria"],
  );
  const [rosterTitle, setRosterTitle] = useState(initTitle || "");
  const [period, setPeriod] = useState(initPeriod || `y${new Date().getFullYear()}`);
  const [rankLeague, setRankLeague] = useState(initLeague);
  const [rankCount, setRankCount] = useState(Math.min(15, Math.max(3, initCount || 8)));
  const [pickemEvent, setPickemEvent] = useState(initEvent || "season-2026");
  const [pickemGroup, setPickemGroup] = useState(initGroup || "");
  const [transparent, setTransparent] = useState(initTransparent);
  const [scale, setScale] = useState(initScale || 1);
  const [copiedObs, setCopiedObs] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (mode === "teams") {
      p.set("teams", `${resolveTeamAlias(teamA) || teamA},${resolveTeamAlias(teamB) || teamB}`);
    } else if (mode === "player") {
      p.set("mode", "player");
      p.set("player", resolvePlayerSlug(playerSlug));
      p.set("p", period);
    } else if (mode === "roster") {
      p.set("mode", "roster");
      p.set("players", rosterSlugs.map((s) => resolvePlayerSlug(s)).join(","));
      if (rosterTitle.trim()) p.set("title", rosterTitle.trim());
      p.set("p", period);
    } else if (mode === "rankings") {
      p.set("mode", "rankings");
      if (rankLeague.trim()) p.set("league", rankLeague.trim());
      p.set("n", String(rankCount));
    } else {
      p.set("mode", "pickem");
      p.set("event", pickemEvent);
      const grp = pickemGroup.trim().toUpperCase();
      if (/^[A-HJ-NP-Z2-9]{6}$/.test(grp)) p.set("group", grp);
      p.set("n", String(rankCount));
    }
    if (transparent) p.set("bg", "transparent");
    if (scale !== 1) p.set("scale", String(scale));
    return p.toString();
  }, [mode, teamA, teamB, playerSlug, rosterSlugs, rosterTitle, period, rankLeague, rankCount, pickemEvent, pickemGroup, transparent, scale]);

  const builtUrl = `${window.location.origin}${BASE}overlay?${queryString}`;
  const embedUrl = `${window.location.origin}${BASE}embed?${queryString}`;
  const embedHeight = mode === "teams" ? 310 : mode === "player" ? 230 : mode === "roster" ? 250 : 96 + rankCount * 38;
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="${embedHeight}" style="border:0;border-radius:16px;overflow:hidden" loading="lazy" title="RiftWise"></iframe>`;

  const copyText = (txt: string, mark: (v: boolean) => void) => {
    navigator.clipboard
      .writeText(txt)
      .then(() => {
        mark(true);
        setTimeout(() => mark(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="min-h-screen bg-rw-bg text-rw-text p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <a href={BASE} className="inline-flex items-center gap-1 text-xs text-rw-accent hover:underline mb-1">
              <ArrowLeft className="w-3.5 h-3.5" /> RiftWise
            </a>
            <h1 className="font-head text-2xl font-bold text-rw-text flex items-center gap-2">
              <MonitorPlay className="w-5 h-5 text-rw-accent" />
              {IS_EMBED ? tl("Embed & OBS studio") : tl("OBS stream overlay")}
            </h1>
            <p className="text-xs text-rw-sub">
              {tl("Choose teams, players or power rankings, then copy an OBS Browser Source URL or a responsive <iframe> embed.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ["teams", tl("Matchup")],
                ["player", tl("Player card")],
                ["roster", tl("5-player roster")],
                ["rankings", tl("Power rankings")],
                ["pickem", tl("Pick'Em")],
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

          {mode === "rankings" && (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-rw-text">{tl("League")}:</span>
                {RANKING_LEAGUES.map(([val, label]) => (
                  <button
                    key={val || "global"}
                    type="button"
                    onClick={() => setRankLeague(val)}
                    aria-pressed={rankLeague === val}
                    className={`px-2.5 py-1 rounded-lg border ${rankLeague === val ? "border-rw-accent text-rw-accent font-semibold" : "border-rw-border text-rw-sub"}`}
                  >
                    {val ? label : tl(label)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-rw-muted">{tl("Show")}:</span>
                {[5, 8, 10].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setRankCount(cnt)}
                    aria-pressed={rankCount === cnt}
                    className={`px-2 py-1 rounded-lg border tabular-nums ${rankCount === cnt ? "border-rw-accent text-rw-accent font-semibold" : "border-rw-border text-rw-sub"}`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "pickem" && (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-rw-text">{tl("Pick'Em")}:</span>
                {PICKEM_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => setPickemEvent(ev)}
                    aria-pressed={pickemEvent === ev}
                    className={`px-2.5 py-1 rounded-lg border font-num uppercase ${pickemEvent === ev ? "border-rw-accent text-rw-accent font-semibold" : "border-rw-border text-rw-sub"}`}
                  >
                    {ev.replace(/-20\d\d$/, "")}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={pickemGroup}
                maxLength={6}
                onChange={(e) => setPickemGroup(e.target.value.toUpperCase())}
                placeholder={tl("6-letter invite code")}
                aria-label={tl("6-letter invite code")}
                className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1 text-xs font-num uppercase tracking-wider text-rw-text w-40"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-rw-muted">{tl("Show")}:</span>
                {[5, 8, 10].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setRankCount(cnt)}
                    aria-pressed={rankCount === cnt}
                    className={`px-2 py-1 rounded-lg border tabular-nums ${rankCount === cnt ? "border-rw-accent text-rw-accent font-semibold" : "border-rw-border text-rw-sub"}`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
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

          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={builtUrl}
                aria-label="OBS Browser Source URL"
                className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-rw-sub flex-1 min-w-[14rem]"
              />
              <button
                type="button"
                onClick={() => copyText(builtUrl, setCopiedObs)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs"
              >
                {copiedObs ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedObs ? tl("Copied") : tl("Copy link")}
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
            <div className="flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={embedCode}
                aria-label={tl("Website <iframe> embed")}
                className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-rw-muted flex-1 min-w-[14rem]"
              />
              <button
                type="button"
                onClick={() => copyText(embedCode, setCopiedEmbed)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rw-accent/60 text-rw-accent hover:bg-rw-accent hover:text-rw-bg font-bold text-xs transition-colors"
              >
                {copiedEmbed ? <Check className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
                {copiedEmbed ? tl("Copied") : tl("Copy <iframe>")}
              </button>
              <a
                href={embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rw-border hover:border-rw-accent text-xs font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {tl("Open")}
              </a>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-rw-border bg-[radial-gradient(#262146_1px,transparent_1px)] [background-size:16px_16px] p-4 overflow-x-auto">
          {mode === "teams" && <MatchupOverlay slugs={[teamA, teamB]} transparent={transparent} scale={1} embedded linkOut={IS_EMBED} />}
          {mode === "player" && <PlayerOverlay slug={playerSlug} period={period} transparent={transparent} scale={1} embedded linkOut={IS_EMBED} />}
          {mode === "roster" && <RosterOverlay slugs={rosterSlugs} title={rosterTitle} period={period} transparent={transparent} scale={1} embedded linkOut={IS_EMBED} />}
          {mode === "rankings" && <RankingsOverlay league={rankLeague} count={rankCount} transparent={transparent} scale={1} embedded linkOut={IS_EMBED} />}
          {mode === "pickem" && (
            <PickemOverlay
              event={pickemEvent}
              group={/^[A-HJ-NP-Z2-9]{6}$/.test(pickemGroup.trim().toUpperCase()) ? pickemGroup.trim().toUpperCase() : undefined}
              count={rankCount}
              transparent={transparent}
              scale={1}
              embedded
              linkOut={IS_EMBED}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main entry point ──────────────────────────────────────────────────────

const q = new URLSearchParams(window.location.search);
const SLUGS = (q.get("teams") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const MODE_PARAM = (q.get("mode") || "").toLowerCase();
const TEAM_PARAM = (q.get("team") || "").trim().toLowerCase();
const VS_PARAM = (q.get("vs") || "").trim().toLowerCase();
const VP_PARAM = q.get("vp") || "y2026";
const NEW_PARAM = (q.get("new") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const ROLE_SLUGS_PARAM: Partial<Record<RosterRole, string>> = {
  Top: (q.get("top") || "").trim().toLowerCase(),
  Jungle: (q.get("jg") || "").trim().toLowerCase(),
  Mid: (q.get("mid") || "").trim().toLowerCase(),
  Bot: (q.get("bot") || "").trim().toLowerCase(),
  Support: (q.get("sup") || "").trim().toLowerCase(),
};
const PLAYER_PARAM = (q.get("player") || "").trim().toLowerCase();
const PLAYERS_PARAM = (q.get("players") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const TITLE_PARAM = q.get("title") || "";
const PERIOD_PARAM = q.get("p") || `y${new Date().getFullYear()}`;
const LEAGUE_PARAM = q.get("league") || "";
const COUNT_PARAM = Number(q.get("n")) || 8;
const EVENT_PARAM = q.get("event") || "season-2026";
const GROUP_PARAM = (q.get("group") || "").trim().toUpperCase();
const STUDIO = q.get("studio") === "1";
const TRANSPARENT = q.get("bg") === "transparent";
const SCALE = Math.min(3, Math.max(0.5, Number(q.get("scale")) || 1));

export const Overlay: React.FC = () => {
  const [catalog, setCatalog] = useState<CatalogData>(() => loadCachedCatalog() ?? EMPTY_CATALOG);
  const [catalogReady, setCatalogReady] = useState<boolean>(() => {
    const cached = loadCachedCatalog();
    return Boolean(cached && cached.teams.length > 0);
  });

  useEffect(() => {
    let alive = true;
    const cached = loadCachedCatalog();
    if (cached && cached.teams.length > 0) {
      setCatalogReady(true);
      return;
    }
    fetchLiveCatalog(cached ?? undefined)
      .catch(() => null)
      .then((updated) => {
        if (!alive) return;
        if (updated) {
          setCatalog(updated);
          return null;
        }
        return loadBundledCatalog().then((b) => alive && setCatalog((p) => (p.teams.length ? p : b)));
      })
      .catch(() => {})
      .finally(() => alive && setCatalogReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const wrap = (node: React.ReactNode) => <RiotCatalogContext.Provider value={catalog}>{node}</RiotCatalogContext.Provider>;

  if (!STUDIO) {
    if (MODE_PARAM === "report") {
      return wrap(
        <ReportOverlay
          teamParam={TEAM_PARAM}
          roleSlugs={ROLE_SLUGS_PARAM}
          playersList={PLAYERS_PARAM}
          vsParam={VS_PARAM}
          vp={VP_PARAM}
          period={PERIOD_PARAM}
          newSlugs={NEW_PARAM}
          title={TITLE_PARAM}
          transparent={TRANSPARENT}
          scale={SCALE}
          linkOut={IS_EMBED}
          catalogReady={catalogReady}
        />,
      );
    }
    if (MODE_PARAM === "pickem") {
      return wrap(
        <PickemOverlay
          event={EVENT_PARAM}
          group={/^[A-HJ-NP-Z2-9]{6}$/.test(GROUP_PARAM) ? GROUP_PARAM : undefined}
          count={COUNT_PARAM}
          transparent={TRANSPARENT}
          scale={SCALE}
          linkOut={IS_EMBED}
        />,
      );
    }
    if (MODE_PARAM === "rankings" || (!MODE_PARAM && !SLUGS.length && !PLAYER_PARAM && !PLAYERS_PARAM.length && LEAGUE_PARAM)) {
      return wrap(<RankingsOverlay league={LEAGUE_PARAM} count={COUNT_PARAM} transparent={TRANSPARENT} scale={SCALE} linkOut={IS_EMBED} />);
    }
    if (MODE_PARAM === "player" || (!MODE_PARAM && !SLUGS.length && PLAYER_PARAM)) {
      if (PLAYER_PARAM) return wrap(<PlayerOverlay slug={PLAYER_PARAM} period={PERIOD_PARAM} transparent={TRANSPARENT} scale={SCALE} linkOut={IS_EMBED} />);
    }
    if (MODE_PARAM === "roster" || (!MODE_PARAM && !SLUGS.length && PLAYERS_PARAM.length > 0)) {
      if (PLAYERS_PARAM.length > 0) {
        return wrap(<RosterOverlay slugs={PLAYERS_PARAM} title={TITLE_PARAM} period={PERIOD_PARAM} transparent={TRANSPARENT} scale={SCALE} linkOut={IS_EMBED} />);
      }
    }
    if (SLUGS.length >= 2) {
      return wrap(<MatchupOverlay slugs={[SLUGS[0], SLUGS[1]]} transparent={TRANSPARENT} scale={SCALE} linkOut={IS_EMBED} />);
    }
  }

  const initMode: OverlayMode =
    MODE_PARAM === "pickem"
      ? "pickem"
      : MODE_PARAM === "rankings" || (!MODE_PARAM && !SLUGS.length && !PLAYER_PARAM && !PLAYERS_PARAM.length && LEAGUE_PARAM)
        ? "rankings"
        : MODE_PARAM === "player" || (!MODE_PARAM && !SLUGS.length && PLAYER_PARAM)
          ? "player"
          : MODE_PARAM === "roster" || (!MODE_PARAM && !SLUGS.length && PLAYERS_PARAM.length > 0)
            ? "roster"
            : "teams";

  return wrap(
    <OverlayStudio
      initMode={initMode}
      initTeams={SLUGS}
      initPlayer={PLAYER_PARAM}
      initRoster={PLAYERS_PARAM}
      initTitle={TITLE_PARAM}
      initPeriod={PERIOD_PARAM}
      initLeague={LEAGUE_PARAM}
      initCount={COUNT_PARAM}
      initEvent={EVENT_PARAM}
      initGroup={GROUP_PARAM}
      initTransparent={TRANSPARENT}
      initScale={SCALE}
    />,
  );
};
