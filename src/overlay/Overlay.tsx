/**
 * Stream overlay (riftwise.gg/overlay?teams=t1,geng): one card for a browser source in OBS, with the matchup's win
 * chances, form, head-to-head and, while they play, the live score. No header, no buttons; refreshes by itself.
 * Options: &bg=transparent (see-through background) &scale=1.5 (bigger text)
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, tc } from "../i18n";
import { fetchSchedule } from "../api";
import { loadHubTeam, loadRatings, loadTeamSeries } from "../hub/data";
import type { HubRatings, HubTeam, TeamSeriesRow } from "../hub/types";
import type { Match } from "../types";
import { chanceContext, matchChance, seriesChance } from "../hub/winChance";
import { liveRating } from "../hub/liveRatings";

const q = new URLSearchParams(window.location.search);
const SLUGS = (q.get("teams") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const TRANSPARENT = q.get("bg") === "transparent";
const SCALE = Math.min(3, Math.max(0.5, Number(q.get("scale")) || 1));

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export const Overlay: React.FC = () => {
  const [a, setA] = useState<HubTeam | null>(null);
  const [b, setB] = useState<HubTeam | null>(null);
  const [ratings, setRatings] = useState<HubRatings | null>(null);
  const [series, setSeries] = useState<TeamSeriesRow[]>([]);
  const [live, setLive] = useState<Match | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (SLUGS.length < 2) return;
    let alive = true;
    const load = () =>
      Promise.all([loadHubTeam(SLUGS[0]), loadHubTeam(SLUGS[1]), loadRatings(), loadTeamSeries(SLUGS[0]).catch(() => [] as TeamSeriesRow[])])
        .then(([x, y, r, s]) => {
          if (!alive) return;
          setA(x);
          setB(y);
          setRatings(r);
          setSeries(s);
        })
        .catch(() => alive && setError(tl("Couldn't load the stats right now. Check your connection and try again in a minute.")));
    load();
    const t = setInterval(load, 10 * 60 * 1000); // the stats change once a day; this just picks the new build up
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  // the live score, from the same schedule the app shows (every minute)
  useEffect(() => {
    if (!a || !b) return;
    let alive = true;
    const names = [a, b].map((t) => new Set([norm(t.name), ...(t.codes || []).map(norm)]));
    const tick = () =>
      fetchSchedule(0)
        .then((ms) => {
          if (!alive) return;
          const m = ms.find(
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
  const bg = TRANSPARENT ? "transparent" : "var(--rw-bg)";
  if (SLUGS.length < 2)
    return (
      <div style={{ padding: 24, color: "var(--rw-text)", background: bg, fontFamily: "inherit" }}>
        <p>{tl("Add the two teams to the address: /overlay?teams=t1,geng")}</p>
      </div>
    );
  if (error) return <div style={{ padding: 24, color: "var(--rw-red)", background: bg }}>{error}</div>;
  if (!a || !b) return <div style={{ padding: 24, color: "var(--rw-muted)", background: bg }}>…</div>;
  const wa = meetings.filter((r) => r[3] > r[4]).length;
  const swapped = !!live && [live.team1Name, live.team1Code].some((n) => norm(n || "") === norm(b.name) || (b.codes || []).some((c) => norm(c) === norm(n || "")));
  const scoreA = live ? (swapped ? live.team2Score : live.team1Score) : null;
  const scoreB = live ? (swapped ? live.team1Score : live.team2Score) : null;
  const side = (t: HubTeam, right: boolean, color: string) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: right ? "right" : "left" }}>
      <div style={{ fontSize: t.name.length > 16 ? 24 : t.name.length > 11 ? 28 : 34, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
      {t.rating && (
        <div style={{ fontSize: 14, color: "var(--rw-sub)" }}>
          {t.rating.rank != null ? `#${t.rating.rank} · ` : ""}
          {t.rating.league || ""} · {t.rating.r}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, marginTop: 8, justifyContent: right ? "flex-end" : "flex-start" }}>
        {form(t).map((w, i) => (
          <span
            key={i}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 800,
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
    <div style={{ background: bg, minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
      <div
        style={{
          transform: `scale(${SCALE})`,
          transformOrigin: "top center",
          width: 760,
          maxWidth: "100%",
          padding: "20px 28px",
          borderRadius: 16,
          background: TRANSPARENT ? "rgba(12, 10, 29, 0.85)" : "var(--rw-surface)",
          border: "1px solid var(--rw-border)",
          color: "var(--rw-text)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {side(a, false, "var(--rw-accent)")}
          <div style={{ textAlign: "center", minWidth: 120 }}>
            {live && live.state !== "unstarted" ? (
              <div style={{ fontSize: 44, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                {scoreA} <span style={{ color: "var(--rw-muted)" }}>–</span> {scoreB}
              </div>
            ) : (
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--rw-muted)" }}>VS</div>
            )}
            {live && (
              <div style={{ fontSize: 12, color: live.state === "inProgress" ? "var(--rw-red)" : "var(--rw-sub)", fontWeight: 700 }}>
                {live.state === "inProgress" ? tl("LIVE") : tc("short best of", "Bo{n}", { n: live.bestOf })}
              </div>
            )}
          </div>
          {side(b, true, "var(--rw-teal)")}
        </div>
        {chances && (
          <div style={{ marginTop: 16, display: "grid", gap: 6 }}>
            {chances.map(([what, p]) => (
              <div key={what} style={{ display: "grid", gridTemplateColumns: "54px 1fr 54px", alignItems: "center", gap: 10, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "var(--rw-accent)" }}>{Math.round(p * 100)}%</span>
                <div style={{ position: "relative", height: 18, borderRadius: 4, overflow: "hidden", background: "var(--rw-teal)" }}>
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${p * 100}%`, background: "var(--rw-accent)", borderRight: "2px solid var(--rw-bg)" }} />
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "var(--rw-bg)" }}>
                    {what}
                  </span>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: "var(--rw-teal)", textAlign: "right" }}>{Math.round((1 - p) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, color: "var(--rw-sub)" }}>
          <span>
            {meetings.length ? `${tl("Head to head (series)")}: ${a.name} ${wa}–${meetings.length - wa} ${b.name}` : tl("First ever meeting between these teams")}
          </span>
          <span style={{ color: "var(--rw-muted)" }}>
            <b style={{ color: "var(--rw-accent)" }}>RiftWise</b> · riftwise.gg
          </span>
        </div>
      </div>
    </div>
  );
};
