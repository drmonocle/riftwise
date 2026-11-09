/** Champion page: pro picks, bans and wins by year and patch, builds, matchups, best players and the latest pro games. */
import React, { useMemo, useState } from "react";
import { tl, tc, roleName, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubChamp, prettySlug } from "../../hub/data";
import type { HubChamp } from "../../hub/types";
import { isFinishedItem, useDDragon } from "../../hub/ddragon";
import {
  card,
  ChampIcon,
  ChampLink,
  EventLink,
  fmtDate,
  fmtNum,
  HubLink,
  ItemIcon,
  OeCredit,
  Page,
  PlayerLink,
  PlayerPhoto,
  RevealButton,
  RuneIcon,
  Section,
  SpellIcon,
  Stat,
  td,
  TeamLink,
  TeamLogo,
  th,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";
import { itemName, runeName, spellName } from "../../hub/ddragon";
import { CountersLink } from "./CountersPage";
import { EntityHero, heroBtn } from "./EntityHero";
import { STable } from "../STable";

import { BroadcastCardButton, SectionCard, champCardData } from "./BroadcastCard";
import { WinBar, KdaBar } from "./OpponentChart";
import { ChampVisualOverview } from "./VisualAnalytics";

export const ChampPage: React.FC<{ slug: string }> = ({ slug }) => {
  const state = useLoad(() => loadHubChamp(slug), [slug]);
  usePageTitle(state.data ? champName(state.data.name) : null, state.data?.name);
  useDDragon();
  return <Page state={state}>{(c) => <ChampView c={c} />}</Page>;
};

/** A lead at 15 minutes: "+250" in teal, "-40" in red. */
const signedText = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`);
const Lead: React.FC<{ v: number | null | undefined }> = ({ v }) => (
  <span className={v == null ? "text-rw-muted" : v >= 0 ? "text-rw-teal" : "text-rw-red"}>{signedText(v)}</span>
);

/** Presence (filled line) and win rate (dashed, patches with 5+ picks) over the recent patches, oldest on the left. */
const PatchTrend: React.FC<{ patches: NonNullable<HubChamp["patches"]> }> = ({ patches }) => {
  const list = [...patches].reverse();
  const w = 160;
  const h = 36;
  const x = (i: number) => (list.length > 1 ? (i / (list.length - 1)) * (w - 4) + 2 : w / 2);
  const pres = list.map((p) => (p.pr ?? p.pk + p.b) / Math.max(p.g, 1));
  const top = Math.max(0.05, ...pres);
  const presPts = pres.map((v, i) => `${x(i).toFixed(1)},${(h - 2 - (v / top) * (h - 4)).toFixed(1)}`).join(" ");
  const wrPts = list
    .map((p, i) => (p.pk >= 5 ? `${x(i).toFixed(1)},${(h - 2 - (p.w / p.pk) * (h - 4)).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={tl("Presence and win rate by patch, {from} to {to}", { from: list[0].p, to: list[list.length - 1].p })}
    >
      <title>{tl("Presence (solid) and win rate (dashed) by patch, {from} to {to}", { from: list[0].p, to: list[list.length - 1].p })}</title>
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="var(--rw-border)" strokeDasharray="2 3" />
      <polyline points={presPts} fill="none" stroke="var(--rw-accent)" strokeWidth={2} strokeLinejoin="round" />
      {wrPts && <polyline points={wrPts} fill="none" stroke="var(--rw-teal)" strokeWidth={1.5} strokeDasharray="4 3" />}
    </svg>
  );
};

// "<1%" rather than "0%" for something that did happen, just rarely
const pctOf = (w: number, g: number) => (!g ? "–" : w > 0 && (w / g) * 100 < 0.5 ? "<1%" : `${Math.round((w / g) * 100)}%`);

const ChampView: React.FC<{ c: HubChamp }> = ({ c }) => {
  const ddReady = useDDragon();
  const [recentHidden, revealRecent] = useHidden(`champ-recent:${c.u}`, c.recent[0]?.date);
  const maxYear = Math.max(1, ...c.years.map((y) => y.p + y.b));
  const totalRoles = c.roles.reduce((s, r) => s + r.p, 0) || 1;
  const mainRoles = c.roles.filter((r) => r.p / totalRoles >= 0.1).map((r) => r.r);
  // the champion's roles in order of how often it's played there, with matchups in either list
  const roleKeys = mainRoles.filter((r) => (c.matchups?.[r]?.length || 0) > 0 || (c.matchups12?.[r]?.length || 0) > 0);
  const [muRole, setMuRole] = useState(roleKeys[0] || "");
  // this meta (last 12 months) first when there is one
  const [muRecentPick, setMuRecent] = useState(() => Object.keys(c.matchups12 || {}).length > 0);
  // the last 12 months have no matchups in this role: show all time
  const muRecent = muRecentPick && (c.matchups12?.[muRole]?.length || 0) > 0;
  const muRows = ((muRecent ? c.matchups12 : c.matchups) || {})[muRole] || [];
  const muLane = muRows.some((m) => m.length > 3);
  const laneNow = (muRecent ? c.lane12 : c.lane)?.[muRole];
  const showDuos = mainRoles.some((r) => r === "Bot" || r === "Support") && (c.duos || []).length > 0;
  const buildRoles = useMemo(() => {
    if (c.builds?.byRole) return Object.keys(c.builds.byRole);
    const counts = new Map<string, number>();
    for (const r of c.recent) if (r.r) counts.set(r.r, (counts.get(r.r) || 0) + 1);
    return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([r]) => r);
  }, [c.builds, c.recent]);
  const [buildRole, setBuildRole] = useState("");
  const activeBuilds = useMemo(() => {
    if (!c.builds) return null;
    if (!buildRole) return c.builds;
    if (c.builds.byRole?.[buildRole]) return { ...c.builds, ...c.builds.byRole[buildRole] };
    // Fallback from recent games if byRole isn't in an older JSON yet
    const rg = c.recent.filter((r) => r.r === buildRole);
    if (!rg.length) return c.builds;
    const itMap = new Map<string, [number, number]>();
    const ksMap = new Map<string, [number, number]>();
    const spMap = new Map<string, [number, number]>();
    for (const r of rg) {
      for (const it of new Set(r.it || [])) {
        const cur = itMap.get(it) || [0, 0];
        itMap.set(it, [cur[0] + 1, cur[1] + (r.win ? 1 : 0)]);
      }
      if (r.ks) {
        const cur = ksMap.get(r.ks) || [0, 0];
        ksMap.set(r.ks, [cur[0] + 1, cur[1] + (r.win ? 1 : 0)]);
      }
      if (r.sp && r.sp.length === 2) {
        const pair = [...r.sp].sort().join(" + ");
        const cur = spMap.get(pair) || [0, 0];
        spMap.set(pair, [cur[0] + 1, cur[1] + (r.win ? 1 : 0)]);
      }
    }
    const toList = (m: Map<string, [number, number]>, lim: number): [string, number, number][] =>
      [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, lim).map(([k, [g, w]]) => [k, g, w]);
    return { since: c.builds.since, g: rg.length, items: toList(itMap, 18), keys: toList(ksMap, 6), spells: toList(spMap, 6) };
  }, [c.builds, c.recent, buildRole]);
  const items = useMemo(() => (activeBuilds?.items || []).filter(([it]) => isFinishedItem(it)).slice(0, 8), [activeBuilds, ddReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const [playersRecent, setPlayersRecent] = useState(false);
  const recentPlayersList = useMemo(() => {
    if (c.players12 && c.players12.length > 0) return c.players12;
    const byP = new Map<string, { n: string; u: string | null; g: number; w: number; k: number; d: number; a: number }>();
    for (const r of c.recent) {
      const key = r.u || r.n.toLowerCase();
      const cur = byP.get(key) || { n: r.n, u: r.u, g: 0, w: 0, k: 0, d: 0, a: 0 };
      cur.g++;
      cur.w += r.win ? 1 : 0;
      cur.k += r.k;
      cur.d += r.d;
      cur.a += r.a;
      byP.set(key, cur);
    }
    return [...byP.values()]
      .sort((a, b) => b.g - a.g || b.w - a.w)
      .map((p) => ({ n: p.n, u: p.u, g: p.g, w: p.w, kda: Number(((p.k + p.a) / Math.max(p.d, 1)).toFixed(2)) }));
  }, [c.players12, c.recent]);
  // a build part picked in "Pro builds": the latest games narrow to the ones that used it
  const [usedOnly, setUsed] = useState<{ kind: "item" | "key" | "spells"; v: string } | null>(null);
  const pickUsed = (kind: "item" | "key" | "spells", v: string) => {
    setUsed((u) => (u && u.kind === kind && u.v === v ? null : { kind, v }));
    window.setTimeout(() => document.getElementById("champ-latest")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };
  const usedIn = (r: (typeof c.recent)[number]) =>
    (!buildRole || !r.r || r.r === buildRole) &&
    (!usedOnly ||
      (usedOnly.kind === "item"
        ? (r.it || []).includes(usedOnly.v)
        : usedOnly.kind === "key"
          ? r.ks === usedOnly.v
          : [...(r.sp || [])].sort().join(" + ") === usedOnly.v.split(" + ").sort().join(" + ")));
  const usedName = usedOnly ? (usedOnly.kind === "item" ? itemName(usedOnly.v) : usedOnly.kind === "key" ? runeName(usedOnly.v) : usedOnly.v.split(" + ").map(spellName).join(" + ")) : "";
  const pickRow = (on: boolean) =>
    `flex items-center gap-2 min-w-0 w-full text-left rounded px-1 -mx-1 hover:bg-rw-raised ${on ? "ring-1 ring-rw-accent bg-rw-accent/10" : ""}`;
  const maxPatch = Math.max(1, ...(c.patches || []).map((p) => (p.pr ?? p.pk + p.b) / Math.max(p.g, 1)));
  return (
    <div className="rw-page">
      <div className="rw-span">
        <EntityHero
          media={<ChampIcon name={c.name} size={84} className="!rounded-xl border-2 border-rw-accent/40 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" />}
          title={champName(c.name)}
          lines={
            <p>
              {c.roles
                .filter((r) => r.p / totalRoles >= 0.05)
                .map((r) => `${roleName(r.r)} ${Math.round((r.p / totalRoles) * 100)}%`)
                .join(" · ")}
            </p>
          }
          aside={
            <div className="flex flex-wrap gap-2 md:justify-end">
              <CountersLink slug={c.u} className={heroBtn(true)} />
              <HubLink to={{ kind: "finder", query: `champ=${encodeURIComponent(c.name)}` }} className={heroBtn()}>
                {tl("Game finder")}
              </HubLink>
              <HubLink to={{ kind: "items", query: `champ=${prettySlug(c.name)}` }} className={heroBtn()}>
                {tl("Item history")}
              </HubLink>
              <BroadcastCardButton hero data={() => champCardData(c, champName(c.name))} name={`${c.u}-pro-play`} label={tl("Overview card")} />
              <CopyChampPost c={c} />
            </div>
          }
          stats={[
            {
              label: tl("Picks"),
              value: fmtNum(c.p),
              bar: c.p + c.b > 0 ? { pct: Math.round((c.p / (c.p + c.b)) * 100), tone: "teal" } : undefined,
            },
            {
              label: tl("Bans"),
              value: fmtNum(c.b),
              bar: c.p + c.b > 0 ? { pct: Math.round((c.b / (c.p + c.b)) * 100), tone: "red" } : undefined,
            },
            {
              label: tl("Win %"),
              value: winRate(c.w, c.p),
              bar: c.p > 0 ? { pct: Math.round((c.w / c.p) * 100), tone: c.w / c.p >= 0.5 ? "teal" : "red" } : undefined,
            },
            c.side && c.side[0] + c.side[2] > 0
              ? {
                  label: tl("Blue / red side"),
                  value: `${pctOf(c.side[1], c.side[0])} / ${pctOf(c.side[3], c.side[2])}`,
                  sub: tl("win rate on each side"),
                  bar: {
                    split: [c.side[0] ? c.side[1] / c.side[0] : 0, c.side[2] ? c.side[3] / c.side[2] : 0],
                    splitColors: ["bg-[#4a9eff]/85", "bg-rw-red/80"],
                  },
                }
              : null,
          ]}
        />
      </div>

      <ChampVisualOverview c={c} />

      {c.builds && c.builds.g > 0 && activeBuilds && (
        <Section
          title={tl("Pro builds in the last 12 months")}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {buildRoles.length > 1 && (
                <span className="flex flex-wrap gap-1">
                  {["", ...buildRoles].map((r) => (
                    <button
                      key={r || "all"}
                      type="button"
                      onClick={() => setBuildRole(r)}
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        r === buildRole ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
                      }`}
                    >
                      {r ? roleName(r) : tl("All roles")}
                    </button>
                  ))}
                </span>
              )}
              <SectionCard
                section={tl("Pro builds in the last 12 months")}
                name={champName(c.name)}
                sub={[buildRole ? roleName(buildRole) : tl("All roles"), `${fmtNum(activeBuilds.g)}G`].join(" · ")}
                rows={() => [
                  ...items.slice(0, 6).map(([it, g, w]) => ({
                    label: itemName(it),
                    sub: `${tl("Items")} · ${pctOf(g, activeBuilds.g)}`,
                    value: pctOf(w, g),
                    win: w / Math.max(g, 1) >= 0.5,
                  })),
                  ...activeBuilds.keys.slice(0, 3).map(([k, g, w]) => ({
                    label: runeName(k),
                    sub: `${tl("Keystones")} · ${pctOf(g, activeBuilds.g)}`,
                    value: pctOf(w, g),
                    win: w / Math.max(g, 1) >= 0.5,
                  })),
                ]}
              />
            </span>
          }
        >
          <p className="text-[11px] text-rw-muted">
            {tl("From {n} pro games since {date}. Share of games and win rate.", { n: fmtNum(activeBuilds.g), date: fmtDate(c.builds.since) })}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Items")}</div>
              <ul className="space-y-1.5 text-xs">
                {items.map(([it, g, w]) => {
                  const sharePct = Math.min(100, Math.round((g / Math.max(1, activeBuilds.g)) * 100));
                  const wrColor = g >= 5 ? (w / g >= 0.52 ? "text-rw-teal font-semibold" : w / g <= 0.48 ? "text-rw-red" : "text-rw-sub") : "text-rw-muted";
                  return (
                    <li key={it}>
                      <button type="button" onClick={() => pickUsed("item", it)} className={pickRow(usedOnly?.kind === "item" && usedOnly.v === it)} title={tl("Show the latest pro games with it")}>
                        <ItemIcon name={it} size={22} />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-rw-text">{itemName(it)}</span>
                            <span className="flex items-center gap-2 shrink-0 tabular-nums">
                              <span className="text-rw-sub">{pctOf(g, activeBuilds.g)}</span>
                              <span className={`${wrColor} w-10 text-right`}>{pctOf(w, g)}</span>
                            </span>
                          </span>
                          <span className="block h-1 mt-0.5 rounded-full bg-rw-raised overflow-hidden">
                            <span className="block h-full rounded-full bg-rw-accent/80" style={{ width: `${Math.max(4, sharePct)}%` }} />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Keystones")}</div>
              <ul className="space-y-1.5 text-xs">
                {activeBuilds.keys.map(([k, g, w]) => {
                  const sharePct = Math.min(100, Math.round((g / Math.max(1, activeBuilds.g)) * 100));
                  const wrColor = g >= 5 ? (w / g >= 0.52 ? "text-rw-teal font-semibold" : w / g <= 0.48 ? "text-rw-red" : "text-rw-sub") : "text-rw-muted";
                  return (
                    <li key={k}>
                      <button type="button" onClick={() => pickUsed("key", k)} className={pickRow(usedOnly?.kind === "key" && usedOnly.v === k)} title={tl("Show the latest pro games with it")}>
                        <RuneIcon name={k} size={22} />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-rw-text">{runeName(k)}</span>
                            <span className="flex items-center gap-2 shrink-0 tabular-nums">
                              <span className="text-rw-sub">{pctOf(g, activeBuilds.g)}</span>
                              <span className={`${wrColor} w-10 text-right`}>{pctOf(w, g)}</span>
                            </span>
                          </span>
                          <span className="block h-1 mt-0.5 rounded-full bg-rw-raised overflow-hidden">
                            <span className="block h-full rounded-full bg-rw-accent/80" style={{ width: `${Math.max(4, sharePct)}%` }} />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Summoner spells")}</div>
              <ul className="space-y-1.5 text-xs">
                {activeBuilds.spells.map(([sp, g, w]) => {
                  const sharePct = Math.min(100, Math.round((g / Math.max(1, activeBuilds.g)) * 100));
                  const wrColor = g >= 5 ? (w / g >= 0.52 ? "text-rw-teal font-semibold" : w / g <= 0.48 ? "text-rw-red" : "text-rw-sub") : "text-rw-muted";
                  return (
                    <li key={sp}>
                      <button type="button" onClick={() => pickUsed("spells", sp)} className={pickRow(usedOnly?.kind === "spells" && usedOnly.v === sp)} title={tl("Show the latest pro games with it")}>
                        <span className="flex gap-0.5 shrink-0">
                          {sp.split(" + ").map((x) => (
                            <SpellIcon key={x} name={x} size={20} />
                          ))}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-rw-text">{sp.split(" + ").map(spellName).join(" + ")}</span>
                            <span className="flex items-center gap-2 shrink-0 tabular-nums">
                              <span className="text-rw-sub">{pctOf(g, activeBuilds.g)}</span>
                              <span className={`${wrColor} w-10 text-right`}>{pctOf(w, g)}</span>
                            </span>
                          </span>
                          <span className="block h-1 mt-0.5 rounded-full bg-rw-raised overflow-hidden">
                            <span className="block h-full rounded-full bg-rw-accent/80" style={{ width: `${Math.max(4, sharePct)}%` }} />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <p className="text-[10px] text-rw-muted">
            {tl("Click an item, keystone or spell pair to see the latest pro games that used it.")}{" "}
            <HubLink to={{ kind: "items", ...(usedOnly?.kind === "item" ? { query: `item=${prettySlug(usedOnly.v)}` } : {}) }} className="text-rw-accent hover:underline">
              {tl("Has a pro ever built it? Item history")}
            </HubLink>
          </p>
        </Section>
      )}

      {roleKeys.length > 0 && (
        <Section
          title={tl("Matchups")}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {c.matchups12 && (
                <span className="flex gap-1">
                  {[true, false].map((recent) => (
                    <button
                      key={String(recent)}
                      type="button"
                      onClick={() => setMuRecent(recent)}
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        recent === muRecent ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
                      }`}
                    >
                      {recent ? tl("Last 12 months") : tl("All time")}
                    </button>
                  ))}
                </span>
              )}
              <CountersLink slug={c.u} className="text-[11px] text-rw-accent hover:underline" />
              <SectionCard
                section={`${tl("Matchups")} · ${roleName(muRole)}`}
                name={champName(c.name)}
                sub={muRecent ? tl("Last 12 months") : tl("All time")}
                rows={() =>
                  muRows.slice(0, 8).map(([oc, g, w, , gd]) => ({
                    label: `vs ${champName(oc)}`,
                    sub: gd != null ? `${tl("Games")}: ${g} · GD@15 ${signedText(gd)}` : `${tl("Games")}: ${g}`,
                    value: pctOf(w, g),
                    tone: w / g >= 0.5 ? ("good" as const) : ("bad" as const),
                  }))
                }
              />
            </span>
          }
        >
          {roleKeys.length > 1 && (
            <div className="flex gap-1">
              {roleKeys.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setMuRole(r)}
                  className={`px-2 py-0.5 rounded text-[11px] border ${
                    r === muRole ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
                  }`}
                >
                  {roleName(r)}
                </button>
              ))}
            </div>
          )}
          {laneNow && laneNow.length > 2 && (
            <p className="text-[11px] text-rw-sub">
              {tl("In lane at 15 minutes: {gd} gold, {cs} CS, {xp} XP against the other {role}; ahead in {p} of games.", {
                gd: signedText(laneNow[3]),
                cs: signedText(laneNow[4]),
                xp: signedText(laneNow[5]),
                role: roleName(muRole),
                p: pctOf(laneNow[6], laneNow[2]),
              })}
            </p>
          )}
          {muRows.length >= 2 && (() => {
            const minG = muRows.filter(([, g]) => g >= (muRecent ? 3 : 5));
            const poolRows = minG.length >= 4 ? minG : muRows;
            const byWrDesc = [...poolRows].sort((a, b) => b[2] / b[1] - a[2] / a[1] || b[1] - a[1]);
            const byWrAsc = [...poolRows].sort((a, b) => a[2] / a[1] - b[2] / b[1] || b[1] - a[1]);
            const bestList = byWrDesc.filter(([, g, w]) => w / g >= 0.5).slice(0, 3);
            const worstList = byWrAsc.filter(([, g, w]) => w / g <= 0.5).slice(0, 3);
            if (!bestList.length && !worstList.length) return null;
            const renderBox = (heading: string, list: typeof muRows, good: boolean) => (
              <div className="rounded-lg border border-rw-border bg-rw-bg/70 p-2.5 space-y-1.5 min-w-0">
                <div className={`text-[10px] font-bold uppercase tracking-wider ${good ? "text-rw-teal" : "text-rw-red"}`}>{heading}</div>
                <ul className="space-y-1 text-xs">
                  {list.map(([oc, g, w, , gd]) => (
                    <li key={oc} className="flex items-center justify-between gap-2 min-w-0">
                      <ChampLink name={oc} size={18} />
                      <span className="flex items-center gap-2 shrink-0 tabular-nums text-[11px]">
                        <span className={`font-bold ${w / g >= 0.5 ? "text-rw-teal" : "text-rw-red"}`}>{pctOf(w, g)}</span>
                        <span className="text-rw-muted">({w}–{g - w})</span>
                        {gd != null && (
                          <span className={`text-[10px] ${gd >= 0 ? "text-rw-teal" : "text-rw-red"}`} title="GD@15">
                            {signedText(gd)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
            return (
              <div className="grid gap-2 sm:grid-cols-2">
                {bestList.length > 0 && renderBox(`${tl("Matchups")} · ${tl("Win %")}`, bestList, true)}
                {worstList.length > 0 && renderBox(tl("Counters"), worstList, false)}
              </div>
            );
          })()}
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Against")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
                {muLane && (
                  <>
                    <th className={th} title={tl("Gold lead over the lane opponent at 15 minutes")}>
                      GD@15
                    </th>
                    <th className={th} title={tl("CS lead over the lane opponent at 15 minutes")}>
                      CSD@15
                    </th>
                    <th className={th} title={tl("XP lead over the lane opponent at 15 minutes")}>
                      XPD@15
                    </th>
                    <th className={th} title={tl("Games ahead in gold at 15 minutes")}>
                      {tl("Lane %")}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const maxMuG = Math.max(1, ...muRows.map((x) => x[1]));
                return muRows.map(([oc, g, w, tn, gd, cs, xp, ahead]) => (
                  <tr key={oc} className="border-t border-rw-border">
                    <td className={`${td} max-w-[10rem]`}>
                      <ChampLink name={oc} size={16} />
                    </td>
                    <td className={`${td} text-rw-sub`} data-sort={g}>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                          <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((g / maxMuG) * 100))}%` }} />
                        </span>
                        <HubLink
                          to={{ kind: "finder", query: `champ=${encodeURIComponent(c.name)}&vschamp=${encodeURIComponent(oc)}` }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {g}
                        </HubLink>
                      </span>
                    </td>
                    <td className={td} data-sort={g ? w / g : 0}>
                      <WinBar w={w} g={g} />
                    </td>
                    {muLane && (
                      <>
                        <td className={td} data-sort={gd ?? ""}>
                          <Lead v={gd} />
                        </td>
                        <td className={td} data-sort={cs ?? ""}>
                          <Lead v={cs} />
                        </td>
                        <td className={td} data-sort={xp ?? ""}>
                          <Lead v={xp} />
                        </td>
                        <td
                          className={`${td} ${tn && ahead != null ? (ahead / tn >= 0.5 ? "text-rw-teal" : "text-rw-red") : "text-rw-muted"}`}
                          data-sort={tn && ahead != null ? ahead / tn : ""}
                          title={tn ? tl("{n} games with timelines", { n: tn }) : undefined}
                        >
                          {tn && ahead != null ? pctOf(ahead, tn) : "–"}
                        </td>
                      </>
                    )}
                  </tr>
                ));
              })()}
            </tbody>
          </STable>
          <p className="text-[10px] text-rw-muted">
            {muRecent
              ? tl("Against the champion in the same role, last 12 months, 2+ games.")
              : tl("Against the champion in the same role, all pro games, 3+ games.")}
          </p>
          {muLane && <OeCredit />}
        </Section>
      )}
      {showDuos && (
        <Section
          title={tl("Bot lane partners")}
          right={
            <SectionCard
              section={tl("Bot lane partners")}
              name={champName(c.name)}
              rows={() =>
                (c.duos || []).slice(0, 12).map(([pc, g, w]) => ({
                  label: champName(pc),
                  sub: `${g}G`,
                  value: pctOf(w, g),
                  win: w / g >= 0.5,
                }))
              }
            />
          }
          share={`${c.u}-bot-duos`}
        >
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("With")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const duos = (c.duos || []).slice(0, 15);
                const maxDuoG = Math.max(1, ...duos.map((x) => x[1]));
                return duos.map(([pc, g, w]) => (
                  <tr key={pc} className="border-t border-rw-border">
                    <td className={`${td} max-w-[10rem]`}>
                      <ChampLink name={pc} size={16} />
                    </td>
                    <td className={`${td} text-rw-sub`} data-sort={g}>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                          <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((g / maxDuoG) * 100))}%` }} />
                        </span>
                        <HubLink
                          to={{ kind: "finder", query: `champ=${encodeURIComponent(`${c.name},${pc}`)}` }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {g}
                        </HubLink>
                      </span>
                    </td>
                    <td className={td} data-sort={g ? w / g : 0}>
                      <WinBar w={w} g={g} />
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </STable>
        </Section>
      )}

      <Section
        title={tl("Most games on {champion}", { champion: champName(c.name) })}
        right={
          <span className="flex flex-wrap items-center gap-2">
            {recentPlayersList.length > 0 && (
              <span className="flex gap-1">
                {[false, true].map((recent) => (
                  <button
                    key={String(recent)}
                    type="button"
                    onClick={() => setPlayersRecent(recent)}
                    className={`px-2 py-0.5 rounded text-[11px] border ${
                      recent === playersRecent ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
                    }`}
                  >
                    {recent ? tl("Last 12 months") : tl("All time")}
                  </button>
                ))}
              </span>
            )}
            <SectionCard
              section={tl("Most games on {champion}", { champion: champName(c.name) })}
              name={champName(c.name)}
              sub={playersRecent ? tl("Last 12 months") : tl("All time")}
              rows={() =>
                (playersRecent ? recentPlayersList : c.players).slice(0, 12).map((p) => ({
                  label: p.n,
                  sub: `${p.g}G · ${fmtN(p.kda)} ${tl("KDA")}`,
                  value: winRate(p.w, p.g),
                  win: p.w / Math.max(1, p.g) >= 0.5,
                }))
              }
            />
          </span>
        }
      >
        <STable className="w-full text-xs">
          <thead>
            <tr>
              <th className={th}>{tl("Player")}</th>
              <th className={th}>{tl("Games")}</th>
              <th className={th}>{tl("Win %")}</th>
              <th className={th}>{tl("KDA")}</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const pList = (playersRecent ? recentPlayersList : c.players).slice(0, 25);
              const maxPG = Math.max(1, ...pList.map((x) => x.g));
              const teamByPlayer = new Map<string, string>();
              for (const r of c.recent) {
                if (r.team && (r.u || r.n) && !teamByPlayer.has(r.u || r.n)) {
                  teamByPlayer.set(r.u || r.n, r.team);
                }
              }
              return pList.map((p) => {
                const pTeam = teamByPlayer.get(p.u || p.n);
                return (
                <tr key={p.n + p.u} className="border-t border-rw-border">
                  <td className={td}>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <PlayerPhoto name={p.n} team={pTeam} slug={p.u ?? undefined} size={20} />
                      {pTeam && <TeamLogo name={pTeam} size={13} />}
                      <PlayerLink name={p.n} u={p.u} />
                    </span>
                  </td>
                  <td className={`${td} text-rw-sub`} data-sort={p.g}>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                        <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((p.g / maxPG) * 100))}%` }} />
                      </span>
                      <HubLink
                        to={
                          p.u
                            ? { kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(c.name)}` }
                            : { kind: "finder", query: `player=${encodeURIComponent(p.n)}&champ=${encodeURIComponent(c.name)}` }
                        }
                        className="hover:text-rw-accent hover:underline"
                        title={tl("Game finder")}
                      >
                        {p.g}
                      </HubLink>
                    </span>
                  </td>
                  <td className={td} data-sort={p.g ? p.w / p.g : 0}>
                    <WinBar w={p.w} g={p.g} />
                  </td>
                  <td className={td} data-sort={p.kda}>
                    <KdaBar kda={p.kda} />
                  </td>
                </tr>
                );
              });
            })()}
          </tbody>
        </STable>
      </Section>
      <Section
        title={tl("Latest pro games")}
        right={
          recentHidden ? (
            <RevealButton onReveal={revealRecent} small />
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              {usedOnly && (
                <button type="button" onClick={() => setUsed(null)} className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-rw-accent text-rw-accent text-[11px]" title={tl("Show every game")}>
                  {tl("With {name}", { name: usedName })} ✕
                </button>
              )}
              <SectionCard
                section={tl("Latest pro games")}
                name={champName(c.name)}
                sub={usedOnly ? tl("With {name}", { name: usedName }) : undefined}
                rows={() =>
                  c.recent
                    .filter(usedIn)
                    .slice(0, 10)
                    .map((r) => ({
                      win: !!r.win,
                      champ: c.name,
                      label: `${r.n} (${r.k}/${r.d}/${r.a}) vs ${r.opp}`,
                      sub: r.en,
                      value: fmtDate(r.date, false),
                    }))
                }
              />
            </span>
          )
        }
      >
        <span id="champ-latest" />
        {recentHidden ? (
          <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
        ) : (
          <ul className="text-xs space-y-2">
            {usedOnly && !c.recent.some(usedIn) && <li className="text-rw-muted">{tl("None of the latest games used it.")}</li>}
            {c.recent.filter(usedIn).map((r, i) => (
              <li key={i} className="min-w-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                    {r.g ? (
                      <HubLink
                        to={{ kind: "match", slug: r.g, game: r.gn }}
                        className={`font-bold shrink-0 hover:underline ${r.win ? "text-rw-teal" : "text-rw-red"}`}
                      >
                        {r.win ? tc("short result", "W") : tc("short result", "L")}
                      </HubLink>
                    ) : (
                      <span className={`font-bold shrink-0 ${r.win ? "text-rw-teal" : "text-rw-red"}`}>
                        {r.win ? tc("short result", "W") : tc("short result", "L")}
                      </span>
                    )}
                    <PlayerPhoto name={r.n} team={r.team} slug={r.u ?? undefined} size={16} />
                    {r.team && <TeamLogo name={r.team} size={13} />}
                    <PlayerLink name={r.n} u={r.u} />
                    {r.g ? (
                      <HubLink to={{ kind: "match", slug: r.g, game: r.gn }} className="text-rw-sub hover:text-rw-accent hover:underline tabular-nums shrink-0">
                        {r.k}/{r.d}/{r.a}
                      </HubLink>
                    ) : (
                      <span className="text-rw-sub tabular-nums shrink-0">{r.k}/{r.d}/{r.a}</span>
                    )}
                    <span className="text-rw-muted shrink-0">vs</span>
                    <TeamLogo name={r.opp} size={14} />
                    <TeamLink name={r.opp} className="truncate" />
                  </span>
                  <span className="text-rw-muted shrink-0">{fmtDate(r.date, false)}</span>
                </div>
                {r.it && r.it.length > 0 && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {r.ks && <RuneIcon name={r.ks} size={18} />}
                    {r.stt && <RuneIcon name={r.stt} size={14} />}
                    <span className="w-1" />
                    {r.it.map((it, j) => (
                      <HubLink
                        key={j}
                        to={{ kind: "items", query: `item=${prettySlug(it)}&champ=${prettySlug(c.name)}` }}
                        title={itemName(it)}
                      >
                        <ItemIcon name={it} size={18} />
                      </HubLink>
                    ))}
                    <span className="w-1" />
                    {(r.sp || []).map((sp) => (
                      <SpellIcon key={sp} name={sp} size={14} />
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-rw-muted truncate">
                  <EventLink name={r.en} className="text-rw-muted hover:text-rw-accent hover:underline" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* the champion's history in pro play after what most people come for (TV, 2026-10-28): builds, matchups, who
          plays it and its latest games first */}
      {c.slots && Object.keys(c.slots).length > 0 && (
        <Section
          title={tl("By pick order")}
          right={
            <SectionCard
              section={tl("By pick order")}
              name={champName(c.name)}
              rows={() =>
                Object.entries(c.slots!).map(([slot, [g, w]]) => ({
                  label: slot,
                  sub: tl("{n} games", { n: fmtNum(g) }),
                  value: g >= 5 ? pctOf(w, g) : "–",
                  win: g >= 5 ? w / g >= 0.5 : undefined,
                }))
              }
            />
          }
        >
          <p className="text-[11px] text-rw-muted">{tl("Games and win rate by where it was picked in the draft (B = blue side, R = red side), every pro game with the pick order known.")}</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {Object.entries(c.slots).map(([slot, [g, w]]) => {
              const wrPct = g > 0 ? Math.round((w / g) * 100) : 0;
              const good = g >= 5 && w / g >= 0.5;
              return (
                <div key={slot} className="rounded-lg border border-rw-border bg-rw-bg px-2 py-1.5 text-center space-y-1">
                  <div className={`text-xs font-bold ${slot.startsWith("B") ? "text-[#4a9eff]" : "text-rw-red"}`}>{slot}</div>
                  <div className={`text-sm font-semibold tabular-nums ${g >= 5 ? (good ? "text-rw-teal" : "text-rw-red") : "text-rw-text"}`}>
                    {g >= 5 ? pctOf(w, g) : "–"}
                  </div>
                  {g >= 5 && (
                    <div className="h-1 bg-rw-raised rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${good ? "bg-rw-teal/80" : "bg-rw-red/75"}`} style={{ width: `${Math.max(6, wrPct)}%` }} />
                    </div>
                  )}
                  <div className="text-[10px] text-rw-muted">{tl("{n} games", { n: fmtNum(g) })}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {c.patches && c.patches.length > 0 && (
        <Section
          title={tl("Recent patches")}
          right={
            <span className="flex items-center gap-2">
              {c.patches.length >= 3 && <PatchTrend patches={c.patches} />}
              <SectionCard
                section={tl("Recent patches")}
                name={champName(c.name)}
                rows={() =>
                  c.patches!.map((p) => {
                    const pres = (p.pr ?? p.pk + p.b) / Math.max(p.g, 1);
                    return {
                      label: `${tl("Patch")} ${p.p}`,
                      sub: `${p.pk} ${tl("Picks")} · ${p.b} ${tl("Bans")}`,
                      value: `${Math.round(pres * 100)}% · ${p.pk ? pctOf(p.w, p.pk) : "–"}`,
                    };
                  })
                }
              />
            </span>
          }
        >
          <div className="space-y-1">
            {c.patches.map((p, i) => {
              const pres = (p.pr ?? p.pk + p.b) / Math.max(p.g, 1);
              const before = c.patches![i + 1];
              const d = before ? Math.round((pres - (before.pr ?? before.pk + before.b) / Math.max(before.g, 1)) * 100) : null;
              return (
                <div key={p.p} className="grid grid-cols-[3.5rem_1fr_2.5rem_auto] items-center gap-2 text-xs">
                  <HubLink to={{ kind: "champions", query: `key=p${encodeURIComponent(p.p)}` }} className="text-rw-text hover:text-rw-accent hover:underline font-semibold">
                    {p.p}
                  </HubLink>
                  <div className="h-2.5 bg-rw-bg rounded overflow-hidden">
                    <div className="h-full bg-rw-accent/70" style={{ width: `${(pres / maxPatch) * 100}%` }} />
                  </div>
                  <span
                    className={`tabular-nums text-right text-[10px] ${d == null || d === 0 ? "text-rw-muted" : d > 0 ? "text-rw-teal" : "text-rw-red"}`}
                    title={before ? tl("Change in presence against {patch}, in points", { patch: before.p }) : undefined}
                  >
                    {d == null ? "" : d === 0 ? "=" : `${d > 0 ? "+" : ""}${d}`}
                  </span>
                  <span className="text-rw-sub tabular-nums text-right leading-tight sm:whitespace-nowrap sm:min-w-56">
                    {tl("{pres} presence · {p} picks · {wr}", { pres: `${Math.round(pres * 100)}%`, p: p.pk, wr: p.pk ? pctOf(p.w, p.pk) : "–" })}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-rw-muted">{tl("Presence = picked or banned in that share of games (all leagues).")}</p>
        </Section>
      )}

      <Section
        title={tl("By year")}
        right={
          <span className="flex items-center gap-2">
            <BroadcastCardButton data={() => champCardData(c, champName(c.name))} name={`${c.u}-pro-play`} label={tl("Overview card")} />
            <SectionCard
              section={tl("By year")}
              name={champName(c.name)}
              rows={() =>
                [...c.years].reverse().map((y) => ({
                  label: y.y,
                  sub: `${fmtNum(y.p)} ${tl("Picks")} · ${fmtNum(y.b)} ${tl("Bans")}`,
                  value: y.p ? winRate(y.w, y.p) : "–",
                }))
              }
            />
          </span>
        }
      >
        <div className="space-y-1">
          {c.years.map((y) => (
            <div key={y.y} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-xs">
              <HubLink to={{ kind: "champions", query: `key=y${encodeURIComponent(y.y)}` }} className="text-rw-text hover:text-rw-accent hover:underline font-semibold">
                {y.y}
              </HubLink>
              <div className="h-3 bg-rw-bg rounded overflow-hidden flex" title={`${y.p} / ${y.b}`}>
                <div className="bg-rw-teal/70" style={{ width: `${(y.p / maxYear) * 100}%` }} />
                <div className="bg-rw-red/50" style={{ width: `${(y.b / maxYear) * 100}%` }} />
              </div>
              <span className="text-rw-sub tabular-nums text-right shrink-0 whitespace-nowrap min-w-44">
                {tl("{p} picks · {b} bans · {wr}", { p: fmtNum(y.p), b: fmtNum(y.b), wr: y.p ? winRate(y.w, y.p) : "–" })}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-rw-muted">
          <span className="inline-block w-2 h-2 bg-rw-teal/70 mr-1" />
          {tl("Picks")} <span className="inline-block w-2 h-2 bg-rw-red/50 ml-2 mr-1" />
          {tl("Bans")}
        </p>
      </Section>
    </div>
  );
};

const CopyChampPost: React.FC<{ c: HubChamp }> = ({ c }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const label = champName(c.name);
    const totalRoles = c.roles.reduce((s, r) => s + r.p, 0) || 1;
    const roleStr = c.roles
      .filter((r) => r.p / totalRoles >= 0.05)
      .map((r) => `${roleName(r.r)} ${Math.round((r.p / totalRoles) * 100)}%`)
      .join(" · ");
    const lines: string[] = [
      `${label}${roleStr ? ` (${roleStr})` : ""}`,
      `${tl("Picks")}: ${fmtNum(c.p)} · ${tl("Bans")}: ${fmtNum(c.b)} · ${tl("Win %")}: ${winRate(c.w, c.p)}`,
    ];
    if (c.players.length > 0) {
      lines.push(
        `${tl("Most games on {champion}", { champion: label })}: ${c.players
          .slice(0, 4)
          .map((p) => `${p.n} (${p.g}G · ${winRate(p.w, p.g)})`)
          .join(", ")}`,
      );
    }
    lines.push(`https://riftwise.gg/champion/${c.u}`);
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <button type="button" onClick={copy} className={heroBtn()} title={tl("Copy post")}>
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};


