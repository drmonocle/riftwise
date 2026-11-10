/** The Records and Titles sections of the stats (split from StatsView so each is its own download). */
import React, { useEffect, useRef, useState } from "react";
import { BarChart3, Trophy, Swords, Medal, ArrowLeft, GitCompare, Home, CalendarRange, Layers, History, Database, TrendingUp, Flame, Crosshair } from "lucide-react";
import { AppSettings, Match, CatalogData } from "../../types";
import { IS_WEB } from "../../platform";
import {
  StatsMeta,
  INTERNATIONAL_KINDS,
  loadStatsMeta,
} from "../../stats";
import { tl, tk, tc, eventTitle, fmtDec } from "../../i18n";
import { champName, useChampionNames } from "../../champions";
import { loadHubMeta, loadHubRecords, loadHubTitles, loadRecordsYear, normText, prettySlug } from "../../hub/data";
import type { HubRecords, HubRecordsYear, HubTitle } from "../../hub/types";
import {
  CompareRoute,
  HubRoute,
  PrepRoute,
  canGoBack,
  hubBack,
  hubShareUrl,
  navigateHub,
  useHubRoute,
} from "../../hub/route";
import {
  card,
  ChampIcon,
  CopyLinkButton,
  EventLink,
  Failed,
  fmtDate,
  fmtNum,
  HubLink,
  Loading,
  Page,
  PlayerLink,
  PlayerPhoto,
  RevealButton,
  Section,
  SpoilerProvider,
  td,
  th,
  TeamLink,
  TeamLogo,
  useHidden,
  useLoad,
  usePageTitle,
  CaptureContext,
  OpenUrlContext,
} from "./ui";

import { STable } from "../STable";
import { SectionCard } from "./BroadcastCard";

/** Every pro pentakill: the players with the most, and the newest (spoiler mode hides fresh ones). */
/**
 * Career totals with a choice of games: every pro game (what player pages and storylines count) or only the top leagues
 * and international events (older builds have only those).
 */
const CareerRecords: React.FC<{
  r: HubRecords;
  list: (title: string, rows: HubRecords["career"]["games"], scopeLabel?: string) => React.ReactNode;
}> = ({ r, list }) => {
  const [all, setAll] = useState(true);
  const c = all && r.careerAll ? r.careerAll : r.career;
  const scopeLabel = all && r.careerAll ? tl("All pro games") : tl("Top leagues & internationals");
  const cards = [
    list(tl("Most pro games"), c.games, scopeLabel),
    list(tl("Most career kills"), c.kills, scopeLabel),
    list(tl("Most career assists"), c.assists, scopeLabel),
    list(tl("Biggest champion pools"), c.pool, scopeLabel),
  ].filter(Boolean);
  if (!cards.length) return null;
  const pill = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-semibold border ${on ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rw-text">{tl("Career totals")}</h3>
        {r.careerAll && (
          <div className="flex gap-1" role="group" aria-label={tl("Games counted")}>
            <button type="button" className={pill(all)} aria-pressed={all} onClick={() => setAll(true)}>
              {tl("All pro games")}
            </button>
            <button type="button" className={pill(!all)} aria-pressed={!all} onClick={() => setAll(false)}>
              {tl("Top leagues & internationals")}
            </button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-rw-muted">
        {all && r.careerAll
          ? tl("Every pro game except All-Star and show matches, like the player pages.")
          : tl("Only top leagues and international events (Worlds, MSI, First Stand).")}
      </p>
      <div className="grid gap-3 md:grid-cols-2 3xl:grid-cols-4 items-start">
        {cards}
      </div>
    </div>
  );
};

/** file name of a records card: "records-fastest-wins" */
const shareName = (title: string) => "records-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const PentakillRecords: React.FC<{ p: NonNullable<HubRecords["pentas"]>; matchText?: (s: string) => boolean }> = ({
  p,
  matchText,
}) => {
  const [n, setN] = useState(8);
  const mostRows = matchText ? p.most.filter((x) => matchText(`${x.n} ${x.u || ""}`)) : p.most;
  const recentRows = matchText
    ? p.recent.filter((x) => matchText(`${x.n} ${x.u || ""} ${x.c} ${champName(x.c)} ${x.a} ${x.b} ${x.t} ${x.e || ""}`))
    : p.recent;
  const maxPenta = Math.max(1, p.most[0]?.v || 1);
  return (
    <>
      {mostRows.length > 0 && (
      <Section
        title={tl("Most pentakills")}
        right={
          <span className="flex items-center gap-2 text-[11px]" data-nocapture="1">
            {mostRows.length >= 2 && (
              <HubLink
                to={{
                  kind: "compare",
                  mode: "player",
                  a: mostRows[0].u || prettySlug(mostRows[0].n),
                  b: mostRows[1].u || prettySlug(mostRows[1].n),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Compare")} →
              </HubLink>
            )}
            <SectionCard
              section={tl("Most pentakills")}
              name={tl("Records")}
              rows={() => mostRows.slice(0, 12).map((x, i) => ({ rank: i + 1, label: x.n, value: String(x.v), win: true }))}
            />
          </span>
        }
        share="records-most-pentakills"
      >
        <ol className="text-xs space-y-1.5">
          {mostRows.map((x, i) => (
            <li key={i} className="space-y-0.5 min-w-0">
              <div className="flex justify-between gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <HubLink to={{ kind: "player", slug: x.u || prettySlug(x.n) }} title={x.n} className="shrink-0">
                    <PlayerPhoto name={x.n} slug={x.u ?? undefined} size={16} />
                  </HubLink>
                  <PlayerLink name={x.n} u={x.u} />
                </span>
                <HubLink
                  to={{ kind: "player", slug: x.u || prettySlug(x.n) }}
                  className="text-rw-accent font-bold tabular-nums hover:underline"
                >
                  {x.v}
                </HubLink>
              </div>
              <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-rw-accent/70" style={{ width: `${Math.max(8, Math.round((x.v / maxPenta) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ol>
        <p className="text-[10px] text-rw-muted">
          {tl(
            "{n} pentakills recorded by Leaguepedia. Complete from 2018 on; earlier years only partly, so older players are undercounted.",
            {
              n: fmtNum(p.total),
            },
          )}
        </p>
      </Section>
      )}
      {recentRows.length > 0 && (
      <Section
        title={tl("Latest pentakills")}
        right={
          recentRows.length > 0 ? (
            <SectionCard
              section={tl("Latest pentakills")}
              name={tl("Records")}
              rows={() =>
                recentRows.slice(0, 10).map((x, idx) => ({
                  rank: idx + 1,
                  champ: x.c,
                  team: x.a,
                  label: `${x.n} (${champName(x.c)})`,
                  sub: `${x.a} vs ${x.b} · ${x.t} · ${fmtDate(x.date)}`,
                  value: x.x > 1 ? `×${x.x}` : "5K",
                  win: true,
                }))
              }
            />
          ) : undefined
        }
        share="records-latest-pentakills"
      >
        <ol className="text-xs space-y-1.5">
          {recentRows.slice(0, n).map((x, i) => (
            <PentaRow key={i} x={x} />
          ))}
        </ol>
        {recentRows.length > n && (
          <button
            type="button"
            onClick={() => setN((v) => v + 30)}
            className="text-xs text-rw-accent hover:underline"
          >
            {tl("Show more ({n} left)", { n: recentRows.length - n })}
          </button>
        )}
      </Section>
      )}
    </>
  );
};

const PentaRow: React.FC<{
  x: NonNullable<HubRecords["pentas"]>["recent"][number];
}> = ({ x }) => {
  const [hidden, reveal] = useHidden(`penta:${x.g}:${x.n}`, x.date);
  return (
    <li className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <>
            <HubLink to={{ kind: "champ", slug: prettySlug(x.c) }} title={champName(x.c)}>
              <ChampIcon name={x.c} size={18} />
            </HubLink>
            <HubLink to={{ kind: "player", slug: x.u || prettySlug(x.n) }} title={x.n} className="shrink-0">
              <PlayerPhoto name={x.n} slug={x.u ?? undefined} size={16} />
            </HubLink>
            <span className="truncate">
              <PlayerLink name={x.n} u={x.u} />{" "}
              <HubLink to={{ kind: "champ", slug: prettySlug(x.c) }} className="text-rw-sub hover:text-rw-accent hover:underline">
                {champName(x.c)}
              </HubLink>
              {x.x > 1 && (
                x.g ? (
                  <HubLink
                    to={{ kind: "match", slug: x.g, game: x.gn }}
                    className="text-rw-accent hover:underline"
                  >
                    {" "}×{x.x}
                  </HubLink>
                ) : (
                  <span className="text-rw-accent"> ×{x.x}</span>
                )
              )}{" "}
              <span className="inline-flex items-center gap-1 text-rw-sub">
                <HubLink to={{ kind: "team", slug: prettySlug(x.a) }} title={x.a} className="shrink-0">
                  <TeamLogo name={x.a} size={13} />
                </HubLink>
                <TeamLink name={x.a} />
                {x.g ? (
                  <HubLink
                    to={{ kind: "match", slug: x.g, game: x.gn }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    vs
                  </HubLink>
                ) : (
                  <span>vs</span>
                )}
                <HubLink to={{ kind: "team", slug: prettySlug(x.b) }} title={x.b} className="shrink-0">
                  <TeamLogo name={x.b} size={13} />
                </HubLink>
                <TeamLink name={x.b} />
              </span>
            </span>
          </>
        )}
      </div>
      <div className="text-[10px] text-rw-muted truncate">
        <EventLink
          name={x.t}
          u={x.e}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        />{" "}
        ·{" "}
        {x.g ? (
          <HubLink
            to={{ kind: "match", slug: x.g, game: x.gn }}
            className="text-rw-muted hover:text-rw-accent hover:underline"
          >
            {fmtDate(x.date)}
          </HubLink>
        ) : (
          fmtDate(x.date)
        )}
      </div>
    </li>
  );
};

/** Minutes as m:ss (records are kept to the second) */
const mmss = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/**
 * Closest to falling: each record next to the best of the year so far, nearest first (as a share of the record;
 * for the fastest win, the record's time over this year's).
 */
const ClosestToFalling: React.FC<{ all: HubRecords; year: HubRecordsYear; label: string }> = ({ all, year, label }) => {
  type Row = {
    title: string;
    rec: number;
    best: number;
    recBy: string;
    bestBy: string;
    fmt: (v: number) => string;
    lower?: boolean;
    recTo?: { kind: "match"; slug: string; game?: number };
    bestTo?: { kind: "match"; slug: string; game?: number };
  };
  const g = (title: string, a: HubRecords["game"]["fastest"], b: HubRecords["game"]["fastest"], fmt: (v: number) => string, lower = false): Row | null =>
    a[0] && b[0]
      ? {
          title,
          rec: a[0].v,
          best: b[0].v,
          recBy: a[0].w,
          bestBy: b[0].w,
          fmt,
          lower,
          recTo: a[0].g ? { kind: "match", slug: a[0].g, game: a[0].gn } : undefined,
          bestTo: b[0].g ? { kind: "match", slug: b[0].g, game: b[0].gn } : undefined,
        }
      : null;
  const p = (title: string, a: HubRecords["player"]["kills"], b: HubRecords["player"]["kills"]): Row | null =>
    a[0] && b[0]
      ? {
          title,
          rec: a[0].v,
          best: b[0].v,
          recBy: a[0].pl,
          bestBy: b[0].pl,
          fmt: fmtNum,
          recTo: a[0].g ? { kind: "match", slug: a[0].g, game: a[0].gn } : undefined,
          bestTo: b[0].g ? { kind: "match", slug: b[0].g, game: b[0].gn } : undefined,
        }
      : null;
  const rows = [
    g(tl("Fastest wins"), all.game.fastest, year.game.fastest, mmss, true),
    g(tl("Longest games"), all.game.longest, year.game.longest, mmss),
    g(tl("Most kills in a game"), all.game.bloodiest, year.game.bloodiest, (v) => tl("{n} kills", { n: v })),
    p(tl("Most kills by one player"), all.player.kills, year.player.kills),
    p(tl("Most assists by one player"), all.player.assists, year.player.assists),
    p(tl("Most damage in a game"), all.player.dmg, year.player.dmg),
    p(tl("Most CS in a game"), all.player.cs, year.player.cs),
  ]
    .filter((r): r is Row => !!r)
    .map((r) => ({ ...r, share: r.lower ? r.rec / r.best : r.best / r.rec }))
    .sort((a, b) => b.share - a.share);
  if (!rows.length) return null;
  return (
    <Section
      title={tl("Closest to falling")}
      right={
        <SectionCard
          section={tl("Closest to falling")}
          name={label}
          rows={() =>
            rows.map((r, idx) => ({
              rank: idx + 1,
              label: r.title,
              sub: tl("Record {value} ({who}) · best this year {best} ({by})", { value: r.fmt(r.rec), who: r.recBy, best: r.fmt(r.best), by: r.bestBy }),
              value: `${Math.round(r.share * 100)}%`,
              win: r.share >= 1,
            }))
          }
        />
      }
      share="records-closest-to-falling"
    >
      <p className="text-[11px] text-rw-muted">{tl("Each record next to the best of {year} so far.", { year: label })}</p>
      <ol className="text-xs space-y-1.5">
        {rows.map((r) => (
          <li key={r.title} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-rw-text">{r.title}</span>
              {r.bestTo ? (
                <HubLink
                  to={r.bestTo}
                  className={`font-num tabular-nums font-bold shrink-0 hover:underline ${r.share >= 1 ? "text-rw-teal" : "text-rw-accent"}`}
                >
                  {Math.round(r.share * 100)}%
                </HubLink>
              ) : (
                <span className={`font-num tabular-nums font-bold shrink-0 ${r.share >= 1 ? "text-rw-teal" : "text-rw-accent"}`}>{Math.round(r.share * 100)}%</span>
              )}
            </div>
            <div className="text-[10px] text-rw-muted truncate">
              {r.recTo ? (
                <HubLink to={r.recTo} className="hover:text-rw-accent hover:underline">
                  {tl("Record {value} ({who}) · best this year {best} ({by})", { value: r.fmt(r.rec), who: r.recBy, best: r.fmt(r.best), by: r.bestBy })}
                </HubLink>
              ) : (
                tl("Record {value} ({who}) · best this year {best} ({by})", { value: r.fmt(r.rec), who: r.recBy, best: r.fmt(r.best), by: r.bestBy })
              )}
            </div>
            <div className="h-1 mt-0.5 rounded bg-rw-border overflow-hidden" aria-hidden="true">
              <div className="h-full bg-rw-accent" style={{ width: `${Math.min(100, r.share * 100)}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
};

// ── Records ───────────────────────────────────────────────────────────────

export const RecordsPanel: React.FC = () => {
  usePageTitle(tl("Records"));
  const state = useLoad<HubRecords>(loadHubRecords, []);
  const route = useHubRoute();
  const q = new URLSearchParams(route.kind === "records" && "query" in route ? route.query || "" : "");
  // all time, or one year (its own file; team streaks, titles and career totals are all-time only)
  const year = q.get("year") || "all";
  const [search, setSearch] = useState(() => q.get("q") || "");
  const setRecordsUrl = (nextYear: string, nextQ: string) => {
    const next = new URLSearchParams(q);
    if (!nextYear || nextYear === "all") next.delete("year");
    else next.set("year", nextYear);
    if (nextQ.trim()) next.set("q", nextQ.trim());
    else next.delete("q");
    const qs = next.toString();
    navigateHub({ kind: "records", ...(qs ? { query: qs } : {}) }, { replace: true });
  };
  const setYear = (y: string) => setRecordsUrl(y, search);
  const yearState = useLoad(() => (year === "all" ? Promise.resolve(null) : loadRecordsYear(year)), [year]);
  // this year's file too, for "Closest to falling" on the all-time view
  const thisYear = String(new Date().getFullYear());
  const thisYearState = useLoad(() => loadRecordsYear(thisYear).catch(() => null), [thisYear]);
  const terms = search
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((s) => normText(s.trim()))
    .filter(Boolean);
  const matchText = terms.length
    ? (s: string) => {
        const hay = normText(s);
        return terms.some((t) => hay.includes(t));
      }
    : undefined;
  return (
    <Page state={state}>
      {(all) => {
        const y = year !== "all" ? yearState.data : null;
        const r: HubRecords = y ? { ...all, game: y.game, player: y.player, pentas: y.pentas } : all;
        const btn = (on: boolean) =>
          `px-2 py-1 rounded text-xs font-semibold border ${on ? "border-rw-accent text-rw-accent bg-rw-accent/10" : "border-rw-border text-rw-sub hover:text-rw-text"}`;
        const yearPick = all.years && all.years.length > 0 && (
          <span className="flex items-center gap-1.5">
            <button type="button" className={btn(year === "all")} onClick={() => setYear("all")}>
              {tl("All time")}
            </button>
            {all.years.includes(thisYear) && (
              <button type="button" className={btn(year === thisYear)} onClick={() => setYear(thisYear)}>
                {tl("This year")}
              </button>
            )}
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label={tl("Year")}
            className="bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text"
          >
            <option value="all">{tl("All time")}</option>
            {all.years.map((yy) => (
              <option key={yy} value={yy}>
                {yy}
              </option>
            ))}
          </select>
          </span>
        );
        const recScopeLabel = year === "all" ? tl("All time") : year;
        const gameList = (
          title: string,
          rawRows: HubRecords["game"]["fastest"],
          fmt: (v: number) => string,
        ) => {
          const rows = matchText
            ? rawRows.filter((g) => matchText(`${g.w} ${g.a} ${g.b} ${g.t} ${g.e || ""} ${title}`))
            : rawRows;
          if (!rows.length) return null;
          const minV = Math.min(...rows.map((g) => g.v || 1));
          const maxV = Math.max(1, ...rows.map((g) => g.v || 1));
          const lowerIsBetter = rawRows.length > 1 && rawRows[0].v < rawRows[rawRows.length - 1].v;
          return (
            <Section
              title={title}
              right={
                rows.length > 0 ? (
                  <SectionCard
                    section={title}
                    name={recScopeLabel}
                    rows={() =>
                      rows.slice(0, 10).map((g, i) => ({
                        rank: i + 1,
                        team: g.w,
                        label: tl("{w} beat {l}", { w: g.w, l: g.w === g.a ? g.b : g.a }),
                        sub: `${g.t} · ${fmtDate(g.date)}`,
                        value: fmt(g.v),
                        win: true,
                      }))
                    }
                  />
                ) : undefined
              }
              share={shareName(title)}
            >
              <ol className="text-xs space-y-1.5">
                {rows.map((g, i) => {
                  const barPct = lowerIsBetter
                    ? Math.max(8, Math.min(100, Math.round((minV / Math.max(g.v, 0.01)) * 100)))
                    : Math.max(8, Math.min(100, Math.round((g.v / maxV) * 100)));
                  return (
                    <li key={i} className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {g.g ? (
                          <HubLink
                            to={{ kind: "match", slug: g.g, game: g.gn }}
                            className="text-rw-accent font-bold tabular-nums shrink-0 hover:underline"
                          >
                            {fmt(g.v)}
                          </HubLink>
                        ) : (
                          <span className="text-rw-accent font-bold tabular-nums shrink-0">
                            {fmt(g.v)}
                          </span>
                        )}
                        <HubLink to={{ kind: "team", slug: prettySlug(g.w) }} title={g.w} className="shrink-0">
                          <TeamLogo name={g.w} size={14} />
                        </HubLink>
                        <span className="truncate min-w-0">
                          {g.g ? (
                            <HubLink to={{ kind: "match", slug: g.g, game: g.gn }}>
                              {tl("{w} beat {l}", {
                                w: g.w,
                                l: g.w === g.a ? g.b : g.a,
                              })}
                            </HubLink>
                          ) : (
                            <span className="text-rw-text">
                              {tl("{w} beat {l}", {
                                w: g.w,
                                l: g.w === g.a ? g.b : g.a,
                              })}
                            </span>
                          )}
                        </span>
                        <HubLink to={{ kind: "team", slug: prettySlug(g.w === g.a ? g.b : g.a) }} title={g.w === g.a ? g.b : g.a} className="shrink-0">
                          <TeamLogo name={g.w === g.a ? g.b : g.a} size={14} />
                        </HubLink>
                      </div>
                      <div className="text-[10px] text-rw-muted truncate">
                        <EventLink
                          name={g.t}
                          u={g.e}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                        />{" "}
                        ·{" "}
                        {g.g ? (
                          <HubLink
                            to={{ kind: "match", slug: g.g, game: g.gn }}
                            className="text-rw-muted hover:text-rw-accent hover:underline"
                          >
                            {fmtDate(g.date)}
                          </HubLink>
                        ) : (
                          fmtDate(g.date)
                        )}
                      </div>
                      <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full bg-rw-accent/70" style={{ width: `${barPct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Section>
          );
        };
        const playerList = (
          title: string,
          rawRows: HubRecords["player"]["kills"],
          fmt: (v: number) => string = fmtNum,
        ) => {
          const rows = matchText
            ? rawRows.filter((p) => matchText(`${p.pl} ${p.u || ""} ${p.c} ${champName(p.c)} ${p.opp} ${p.t} ${p.e || ""} ${title}`))
            : rawRows;
          if (!rows.length) return null;
          const maxV = Math.max(1, rawRows[0]?.v || 1);
          return (
            <Section
              title={title}
              right={
                rows.length > 0 ? (
                  <SectionCard
                    section={title}
                    name={recScopeLabel}
                    rows={() =>
                      rows.slice(0, 10).map((p, i) => ({
                        rank: i + 1,
                        champ: p.c,
                        label: `${p.pl} (${champName(p.c)})`,
                        sub: `${p.kda} vs ${p.opp} · ${p.t} · ${fmtDate(p.date)}`,
                        value: fmt(p.v),
                        win: true,
                      }))
                    }
                  />
                ) : undefined
              }
              share={shareName(title)}
            >
              <ol className="text-xs space-y-1.5">
                {rows.map((p, i) => {
                  const barPct = Math.max(8, Math.min(100, Math.round((p.v / maxV) * 100)));
                  return (
                    <li key={i} className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <HubLink to={{ kind: "champ", slug: prettySlug(p.c) }} title={champName(p.c)} className="shrink-0">
                          <ChampIcon name={p.c} size={18} />
                        </HubLink>
                        <HubLink to={{ kind: "player", slug: p.u || prettySlug(p.pl) }} title={p.pl} className="shrink-0">
                          <PlayerPhoto name={p.pl} slug={p.u ?? undefined} size={16} />
                        </HubLink>
                        <div className="truncate min-w-0">
                          {p.g ? (
                            <HubLink
                              to={{ kind: "match", slug: p.g, game: p.gn }}
                              className="text-rw-accent font-bold mr-1 tabular-nums hover:underline"
                            >
                              {fmt(p.v)}
                            </HubLink>
                          ) : (
                            <span className="text-rw-accent font-bold mr-1 tabular-nums">
                              {fmt(p.v)}
                            </span>
                          )}
                          <PlayerLink name={p.pl} u={p.u} />
                          <span className="text-rw-sub">
                            {" "}
                            <HubLink to={{ kind: "champ", slug: prettySlug(p.c) }} className="hover:text-rw-accent hover:underline">
                              {champName(p.c)}
                            </HubLink>{" "}
                            {p.g ? (
                              <HubLink
                                to={{ kind: "match", slug: p.g, game: p.gn }}
                                className="text-rw-sub hover:text-rw-accent hover:underline"
                              >
                                {p.kda}
                              </HubLink>
                            ) : (
                              p.kda
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-rw-muted truncate">
                        {p.u ? (
                          <HubLink
                            to={{
                              kind: "finder",
                              query: `player=${encodeURIComponent(p.u)}&vs=${encodeURIComponent(prettySlug(p.opp))}`,
                            }}
                            className="hover:text-rw-accent hover:underline"
                            title={tl("Game finder")}
                          >
                            vs
                          </HubLink>
                        ) : (
                          <span>vs</span>
                        )}
                        <HubLink to={{ kind: "team", slug: prettySlug(p.opp) }} title={p.opp} className="shrink-0">
                          <TeamLogo name={p.opp} size={12} />
                        </HubLink>
                        <span className="truncate">
                          <TeamLink name={p.opp} className="text-rw-muted hover:text-rw-accent hover:underline" /> ·{" "}
                          <EventLink
                            name={p.t}
                            u={p.e}
                            className="text-rw-muted hover:text-rw-accent hover:underline"
                          />{" "}
                          ·{" "}
                          {p.g ? (
                            <HubLink
                              to={{ kind: "match", slug: p.g, game: p.gn }}
                              className="text-rw-muted hover:text-rw-accent hover:underline"
                            >
                              {fmtDate(p.date)}
                            </HubLink>
                          ) : (
                            fmtDate(p.date)
                          )}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full bg-rw-accent/70" style={{ width: `${barPct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Section>
          );
        };
        const careerList = (
          title: string,
          rawRows: HubRecords["career"]["games"],
          scopeLabel?: string,
        ) => {
          const rows = matchText
            ? rawRows.filter((p) => matchText(`${p.pl} ${p.u || ""} ${title}`))
            : rawRows;
          if (!rows.length) return null;
          const maxV = Math.max(1, rawRows[0]?.v || 1);
          return (
            <Section
              title={title}
              right={
                rows.length > 0 ? (
                  <span className="flex items-center gap-2 text-[11px]" data-nocapture="1">
                    {rows.length >= 2 && (
                      <HubLink
                        to={{
                          kind: "compare",
                          mode: "player",
                          a: rows[0].u || prettySlug(rows[0].pl),
                          b: rows[1].u || prettySlug(rows[1].pl),
                        }}
                        className="text-rw-accent hover:underline font-semibold"
                      >
                        {tl("Compare")} →
                      </HubLink>
                    )}
                    <SectionCard
                      section={title}
                      name={tl("Career totals")}
                      sub={scopeLabel}
                      rows={() => rows.slice(0, 12).map((p, i) => ({ rank: i + 1, label: p.pl, value: fmtNum(p.v), win: true }))}
                    />
                  </span>
                ) : undefined
              }
              share={shareName(title)}
            >
              <ol className="text-xs space-y-1.5">
                {rows.map((p, i) => (
                  <li key={i} className="space-y-0.5 min-w-0">
                    <div className="flex justify-between gap-2 min-w-0">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <HubLink to={{ kind: "player", slug: p.u || prettySlug(p.pl) }} title={p.pl} className="shrink-0">
                          <PlayerPhoto name={p.pl} slug={p.u ?? undefined} size={16} />
                        </HubLink>
                        <PlayerLink name={p.pl} u={p.u} />
                      </span>
                      <HubLink
                        to={
                          title === tl("Most pro games")
                            ? { kind: "finder", query: `player=${encodeURIComponent(p.u || p.pl)}` }
                            : {
                                kind: "player",
                                slug: p.u || prettySlug(p.pl),
                                ...(title === tl("Biggest champion pools") ? { tab: "champions" } : { tab: "stats" }),
                              }
                        }
                        className="text-rw-accent font-bold tabular-nums hover:underline"
                      >
                        {fmtNum(p.v)}
                      </HubLink>
                    </div>
                    <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-full bg-rw-accent/70" style={{ width: `${Math.max(8, Math.round((p.v / maxV) * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          );
        };
        const streakRows = matchText
          ? r.team.streaks.filter((t) => matchText(`${t.team} ${t.u || ""}`))
          : r.team.streaks;
        const titleRecordRows = matchText
          ? r.team.titles.filter((t) => matchText(`${t.team} ${t.u || ""}`))
          : r.team.titles;
        return (
          <CaptureContext.Provider value={year === "all" ? tl("All-time pro records") : tl("{year} records", { year })}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-lg font-bold text-rw-text">{year === "all" ? tl("Records") : tl("{year} records", { year })}</h1>
              <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setRecordsUrl(year, e.target.value);
                  }}
                  placeholder={tl("Filter by name or team…")}
                  aria-label={tl("Filter by name or team…")}
                  className="bg-rw-bg border border-rw-border rounded px-2.5 py-1 text-xs text-rw-text w-44"
                />
                {yearPick}
                <CopyRecordsPost year={year} r={r} />
              </span>
            </div>
            {year !== "all" && yearState.loading && <Loading />}
            <p className="text-[11px] text-rw-muted">
              {tl(
                "Top leagues and international events only. Games shorter than 14 minutes are skipped, and a game only counts when its numbers agree across Leaguepedia's tables.",
              )}{" "}
              {tl("The top records were checked against Leaguepedia.")}
            </p>
            <div className="grid gap-3 md:grid-cols-2 3xl:grid-cols-3 items-start">
              {year === "all" && !matchText && thisYearState.data && <ClosestToFalling all={all} year={thisYearState.data} label={thisYear} />}
              {gameList(tl("Fastest wins"), r.game.fastest, mmss)}
              {gameList(tl("Longest games"), r.game.longest, mmss)}
              {gameList(tl("Most kills in a game"), r.game.bloodiest, (v) =>
                tl("{n} kills", { n: v }),
              )}
              {gameList(
                tl("Won with the biggest gold deficit (end of game)"),
                r.game.comebacks,
                (v) => `${fmtDec(v / 1000)}k`,
              )}
              {playerList(tl("Most kills by one player"), r.player.kills)}
              {playerList(tl("Most assists by one player"), r.player.assists)}
              {playerList(
                tl("Best deathless games (kills + assists)"),
                r.player.perfect,
              )}
              {playerList(tl("Most damage in a game"), r.player.dmg)}
              {playerList(tl("Most CS in a game"), r.player.cs)}
              {r.pentas && r.pentas.recent.length > 0 && (
                <PentakillRecords p={r.pentas} matchText={matchText} />
              )}
              {year === "all" && streakRows.length > 0 && (
              <Section
                title={tl("Longest win streaks")}
                right={
                  streakRows.length > 0 ? (
                    <span className="flex items-center gap-2 text-[11px]" data-nocapture="1">
                      {streakRows.length >= 2 && (
                        <>
                          <HubLink
                            to={{
                              kind: "compare",
                              mode: "team",
                              a: streakRows[0].u || prettySlug(streakRows[0].team),
                              b: streakRows[1].u || prettySlug(streakRows[1].team),
                            }}
                            className="text-rw-accent hover:underline font-semibold"
                          >
                            {tl("Compare")} →
                          </HubLink>
                          <HubLink
                            to={{
                              kind: "prep",
                              a: streakRows[0].u || prettySlug(streakRows[0].team),
                              b: streakRows[1].u || prettySlug(streakRows[1].team),
                            }}
                            className="text-rw-accent hover:underline font-semibold"
                          >
                            {tl("Match prep")} →
                          </HubLink>
                        </>
                      )}
                      <SectionCard
                        section={tl("Longest win streaks")}
                        name={tl("Records")}
                        rows={() =>
                          streakRows.slice(0, 10).map((t, i) => ({
                            rank: i + 1,
                            team: t.team,
                            label: t.team,
                            sub: tl("ended {date}", { date: fmtDate(t.date) }),
                            value: tl("{n} games", { n: t.v }),
                            win: true,
                          }))
                        }
                      />
                    </span>
                  ) : undefined
                }
                share="records-longest-win-streaks"
              >
                <ol className="text-xs space-y-1.5">
                  {(() => {
                    const maxStreak = Math.max(1, r.team.streaks[0]?.v || 1);
                    return streakRows.map((t, i) => (
                      <li key={i} className="space-y-0.5 min-w-0">
                        <div className="flex justify-between gap-2 min-w-0">
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <HubLink to={{ kind: "team", slug: t.u || prettySlug(t.team) }} title={t.team} className="shrink-0">
                              <TeamLogo name={t.team} size={15} />
                            </HubLink>
                            <TeamLink name={t.team} u={t.u} />
                          </span>
                          <span className="text-rw-muted shrink-0">
                            <HubLink
                              to={{ kind: "team", slug: t.u || prettySlug(t.team), tab: "matches" }}
                              className="text-rw-accent font-bold tabular-nums hover:underline"
                            >
                              {tl("{n} games", { n: t.v })}
                            </HubLink>{" "}
                            ·{" "}
                            <HubLink
                              to={{ kind: "team", slug: t.u || prettySlug(t.team), tab: "matches" }}
                              className="hover:text-rw-accent hover:underline"
                            >
                              {tl("ended {date}", { date: fmtDate(t.date) })}
                            </HubLink>
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                          <div className="h-full rounded-full bg-rw-teal/75" style={{ width: `${Math.max(8, Math.round((t.v / maxStreak) * 100))}%` }} />
                        </div>
                      </li>
                    ));
                  })()}
                </ol>
              </Section>
              )}
              {year === "all" && titleRecordRows.length > 0 && (
              <Section
                title={tl(
                  "Most international titles (Worlds, MSI, First Stand)",
                )}
                right={
                  titleRecordRows.length > 0 ? (
                    <span className="flex items-center gap-2 text-[11px]" data-nocapture="1">
                      {titleRecordRows.length >= 2 && (
                        <>
                          <HubLink
                            to={{
                              kind: "compare",
                              mode: "team",
                              a: titleRecordRows[0].u || prettySlug(titleRecordRows[0].team),
                              b: titleRecordRows[1].u || prettySlug(titleRecordRows[1].team),
                            }}
                            className="text-rw-accent hover:underline font-semibold"
                          >
                            {tl("Compare")} →
                          </HubLink>
                          <HubLink
                            to={{
                              kind: "prep",
                              a: titleRecordRows[0].u || prettySlug(titleRecordRows[0].team),
                              b: titleRecordRows[1].u || prettySlug(titleRecordRows[1].team),
                            }}
                            className="text-rw-accent hover:underline font-semibold"
                          >
                            {tl("Match prep")} →
                          </HubLink>
                        </>
                      )}
                      <SectionCard
                        section={tl("Most international titles (Worlds, MSI, First Stand)")}
                        name={tl("Records")}
                        rows={() =>
                          titleRecordRows.slice(0, 10).map((t, i) => ({
                            rank: i + 1,
                            team: t.team,
                            label: t.team,
                            sub: t.worlds ? tl("{n} Worlds", { n: t.worlds }) : undefined,
                            value: tl("{n} total", { n: t.v }),
                            win: true,
                          }))
                        }
                      />
                    </span>
                  ) : undefined
                }
                share="records-most-international-titles"
              >
                <ol className="text-xs space-y-1.5">
                  {(() => {
                    const maxTitles = Math.max(1, r.team.titles[0]?.v || 1);
                    return titleRecordRows.map((t, i) => (
                      <li key={i} className="space-y-0.5 min-w-0">
                        <div className="flex justify-between gap-2 min-w-0">
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <HubLink to={{ kind: "team", slug: t.u || prettySlug(t.team) }} title={t.team} className="shrink-0">
                              <TeamLogo name={t.team} size={15} />
                            </HubLink>
                            <TeamLink name={t.team} u={t.u} />
                          </span>
                          <span className="text-rw-muted shrink-0">
                            {t.worlds ? (
                              <>
                                <HubLink
                                  to={{ kind: "titles", query: `kind=Worlds&q=${encodeURIComponent(t.team)}` }}
                                  className="text-rw-sub hover:text-rw-accent hover:underline tabular-nums"
                                >
                                  {tl("{n} Worlds", { n: t.worlds })}
                                </HubLink>{" "}
                                ·{" "}
                              </>
                            ) : null}
                            <HubLink
                              to={{ kind: "titles", query: `q=${encodeURIComponent(t.team)}` }}
                              className="text-rw-accent font-bold tabular-nums hover:underline"
                            >
                              {tl("{n} total", { n: t.v })}
                            </HubLink>
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                          <div className="h-full rounded-full bg-rw-accent/75" style={{ width: `${Math.max(8, Math.round((t.v / maxTitles) * 100))}%` }} />
                        </div>
                      </li>
                    ));
                  })()}
                </ol>
              </Section>
              )}
            </div>
            {year === "all" && <CareerRecords r={r} list={careerList} />}
          </div>
          </CaptureContext.Provider>
        );
      }}
    </Page>
  );
};

// ── Titles ────────────────────────────────────────────────────────────────


const TITLE_FILTERS = [
  { key: "International", label: tk("Worlds, MSI & First Stand") },
  { key: "Worlds", label: tk("Worlds") },
  { key: "Leagues", label: tk("League titles") },
  { key: "All", label: tk("Everything") },
] as const;

export const TitlesPanel: React.FC = () => {
  usePageTitle(tl("Titles"));
  const state = useLoad<HubTitle[]>(loadHubTitles, []);
  const route = useHubRoute();
  const q = new URLSearchParams(route.kind === "titles" && "query" in route ? route.query || "" : "");
  const kindParam = q.get("kind") as (typeof TITLE_FILTERS)[number]["key"] | null;
  const kind: (typeof TITLE_FILTERS)[number]["key"] =
    kindParam && TITLE_FILTERS.some((f) => f.key === kindParam) ? kindParam : "International";
  const [search, setSearch] = useState(() => q.get("q") || "");
  const setTitleUrl = (nextKind: string, nextQ: string) => {
    const next = new URLSearchParams();
    if (nextKind && nextKind !== "International") next.set("kind", nextKind);
    if (nextQ.trim()) next.set("q", nextQ.trim());
    const qs = next.toString();
    navigateHub({ kind: "titles", ...(qs ? { query: qs } : {}) }, { replace: true });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {TITLE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setTitleUrl(f.key, search)}
            className={`px-2.5 py-1.5 rounded-lg border ${
              kind === f.key
                ? "bg-rw-accent text-rw-bg font-bold border-rw-accent"
                : "border-rw-border text-rw-sub"
            }`}
          >
            {tl(f.label)}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setTitleUrl(kind, e.target.value);
          }}
          placeholder={tl("Filter by name or team…")}
          aria-label={tl("Filter by name or team…")}
          className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-xs text-rw-text w-48"
        />
      </div>
      <Page state={state}>
        {(data) => {
          const terms = search
            .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
            .map((s) => normText(s.trim()))
            .filter(Boolean);
          const rows = data
            .filter((x) =>
              kind === "All"
                ? true
                : kind === "International"
                  ? INTERNATIONAL_KINDS.includes(x.kind)
                  : kind === "Worlds"
                    ? x.kind === "Worlds"
                    : x.kind === "Regional",
            )
            .filter(
              (x) =>
                !terms.length ||
                terms.some(
                  (t) =>
                    normText(eventTitle(x.t)).includes(t) ||
                    normText(x.t).includes(t) ||
                    normText(x.w).includes(t) ||
                    normText(x.as).includes(t) ||
                    normText(x.l).includes(t) ||
                    (x.u && normText(x.u).includes(t)),
                ),
            )
            .slice(0, 300);
          return (
            <div className={`${card} space-y-2 overflow-x-auto`}>
              {rows.length > 0 && (
                <div className="flex items-center justify-end gap-2" data-nocapture="1">
                  <SectionCard
                    section={tl("Titles")}
                    name={tl(TITLE_FILTERS.find((f) => f.key === kind)?.label || kind)}
                    sub={search.trim() || undefined}
                    rows={() =>
                      rows.slice(0, 12).map((x, idx) => ({
                        rank: idx + 1,
                        team: x.as,
                        label: `${x.as} · ${eventTitle(x.t)}`,
                        sub: `${x.score} vs ${x.l} · ${fmtDate(x.date)}`,
                        value: x.score,
                        win: true,
                      }))
                    }
                  />
                  <CopyTitlesPost
                    title={`${tl("Titles")} · ${tl(TITLE_FILTERS.find((f) => f.key === kind)?.label || kind)}`}
                    rows={rows}
                    kind={kind}
                    search={search}
                  />
                </div>
              )}
              <STable className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={th}>{tl("Event")}</th>
                    <th className={th}>{tc("title winner", "Champion")}</th>
                    <th className={th}>{tc("title match", "Final")}</th>
                    <th className={th}>{tl("Date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => (
                    <tr
                      key={x.t + x.date}
                      className="border-t border-rw-border"
                    >
                      <td className={`${td} max-w-[14rem] truncate`} data-sort={eventTitle(x.t)}>
                        <Trophy
                          className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-rw-accent" : "text-rw-muted"}`}
                        />
                        <EventLink name={eventTitle(x.t)} u={x.e} />
                      </td>
                      <td className={td} data-sort={x.as}>
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <HubLink to={{ kind: "team", slug: x.u || prettySlug(x.as) }} title={x.as} className="shrink-0">
                            <TeamLogo name={x.as} size={16} />
                          </HubLink>
                          <TeamLink name={x.as} u={x.u} />
                        </span>
                        {x.as !== x.w && (
                          <span className="text-rw-muted text-[10px]">
                            {" "}
                            (
                            <HubLink
                              to={{ kind: "team", slug: x.u || prettySlug(x.w) }}
                              className="hover:text-rw-accent hover:underline"
                            >
                              {tl("now {team}", { team: x.w })}
                            </HubLink>
                            )
                          </span>
                        )}
                      </td>
                       <td
                        className={`${td} text-rw-sub`}
                        data-sort={(() => {
                          const m = /^(\d+)\s*[–-]\s*(\d+)$/.exec(x.score || "");
                          return m ? Number(m[1]) * 100 - Number(m[2]) : 0;
                        })()}
                       >
                        {(() => {
                          const m = /^(\d+)\s*[–-]\s*(\d+)$/.exec(x.score || "");
                          const sw = m ? Number(m[1]) : 0;
                          const sl = m ? Number(m[2]) : 0;
                          const wPct = sw + sl > 0 ? Math.round((sw / (sw + sl)) * 100) : 0;
                          return (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1">
                                <span>
                                  {x.e ? (
                                    <EventLink name={x.score} u={x.e} className="font-semibold text-rw-text hover:text-rw-accent hover:underline tabular-nums" />
                                  ) : (
                                    x.score
                                  )}{" "}
                                  {x.l ? (
                                    <HubLink
                                      to={{
                                        kind: "compare",
                                        mode: "team",
                                        a: x.u || prettySlug(x.as),
                                        b: prettySlug(x.l),
                                        ...(/^\d{4}$/.test((x.date || "").slice(0, 4)) ? { period: `y${(x.date || "").slice(0, 4)}` } : {}),
                                      }}
                                      className="text-rw-muted hover:text-rw-accent hover:underline"
                                      title={tl("Compare")}
                                    >
                                      vs
                                    </HubLink>
                                  ) : (
                                    "vs"
                                  )}
                                </span>
                                <HubLink to={{ kind: "team", slug: prettySlug(x.l) }} title={x.l} className="shrink-0">
                                  <TeamLogo name={x.l} size={14} />
                                </HubLink>
                                <TeamLink name={x.l} />
                              </span>
                              {sw + sl > 0 && (
                                <span className="hidden sm:inline-flex w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                                  <span className="h-full bg-rw-teal/85" style={{ width: `${wPct}%` }} />
                                  <span className="h-full bg-rw-red/70" style={{ width: `${100 - wPct}%` }} />
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td className={`${td} text-rw-muted`} data-sort={x.date}>
                        {x.e ? (
                          <EventLink name={fmtDate(x.date)} u={x.e} className="text-rw-muted hover:text-rw-accent hover:underline" />
                        ) : (
                          fmtDate(x.date)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </STable>
            </div>
          );
        }}
      </Page>
    </div>
  );
};

const CopyRecordsPost: React.FC<{ year: string; r: HubRecords }> = ({ year, r }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const f = r.game.fastest[0];
    const l = r.game.longest[0];
    const k = r.player.kills[0];
    const d = r.player.dmg[0];
    const p = r.pentas?.most[0];
    const lines = [
      year === "all" ? tl("All-time pro records") : tl("{year} records", { year }),
      f ? `${tl("Fastest wins")}: ${mmss(f.v)} — ${tl("{w} beat {l}", { w: f.w, l: f.w === f.a ? f.b : f.a })} (${f.t})` : null,
      l ? `${tl("Longest games")}: ${mmss(l.v)} — ${tl("{w} beat {l}", { w: l.w, l: l.w === l.a ? l.b : l.a })} (${l.t})` : null,
      k ? `${tl("Most kills by one player")}: ${fmtNum(k.v)} — ${k.pl} (${champName(k.c)}, ${k.kda} vs ${k.opp})` : null,
      d ? `${tl("Most damage in a game")}: ${fmtNum(d.v)} — ${d.pl} (${champName(d.c)} vs ${d.opp})` : null,
      p && year === "all" ? `${tl("Most pentakills")}: ${p.v} — ${p.n}` : null,
      hubShareUrl({ kind: "records", ...(year !== "all" ? { query: `year=${year}` } : {}) }),
    ].filter((x): x is string => !!x);
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        setState("copied");
        setTimeout(() => setState("idle"), 1600);
      },
      () => {
        setState("failed");
        setTimeout(() => setState("idle"), 2000);
      },
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={tl("Copy a ready-to-post summary with the link, for X or Discord")}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-surface text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

const CopyTitlesPost: React.FC<{ title: string; rows: HubTitle[]; kind: string; search: string }> = ({ title, rows, kind, search }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const q = new URLSearchParams();
    if (kind && kind !== "International") q.set("kind", kind);
    if (search.trim()) q.set("q", search.trim());
    const qs = q.toString();
    const lines = [
      title,
      ...rows.slice(0, 5).map((x) => `${eventTitle(x.t)}: ${x.as} (${x.score} vs ${x.l})`),
      hubShareUrl({ kind: "titles", ...(qs ? { query: qs } : {}) }),
    ];
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        setState("copied");
        setTimeout(() => setState("idle"), 1600);
      },
      () => {
        setState("failed");
        setTimeout(() => setState("idle"), 2000);
      },
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={tl("Copy a ready-to-post summary with the link, for X or Discord")}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-surface text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
