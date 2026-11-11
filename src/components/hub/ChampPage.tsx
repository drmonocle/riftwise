/** Champion page: pro picks, bans and wins by year and patch, builds, matchups, best players and the latest pro games. */
import React, { useEffect, useMemo, useState } from "react";
import { tl, tc, roleName, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { bare, loadAliases, loadHubChamp, matchesChampSearch, matchesItemSearch, normText, prettySlug, resolveChampSlug, resolveEventSlug, resolveItemSlug, resolvePlayerSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
import { matchesPeriodEvent } from "../../hub/period";
import { normalizeRole } from "../../hub/champAgg";
import { currentHubRoute, hubShareUrl, navigateHub } from "../../hub/route";
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

export const ChampPage: React.FC<{ slug: string; query?: string }> = ({ slug, query }) => {
  const state = useLoad(
    () =>
      loadHubChamp(slug).then((c) => {
        const now = currentHubRoute();
        if (c.u && c.u !== slug && now.kind === "champ" && now.slug === slug)
          navigateHub({ kind: "champ", slug: c.u, ...("query" in now && now.query ? { query: now.query } : {}) }, { replace: true });
        return c;
      }),
    [slug],
  );
  usePageTitle(state.data ? champName(state.data.name) : null, state.data?.name);
  useDDragon();
  return <Page state={state}>{(c) => <ChampView c={c} query={query} />}</Page>;
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

const ChampView: React.FC<{ c: HubChamp; query?: string }> = ({ c, query }) => {
  const ddReady = useDDragon();
  const aliases = useLoad(loadAliases, []);
  const qParams = useMemo(() => new URLSearchParams(query || ""), [query]);
  const rawP = qParams.get("p") || qParams.get("period") || "";
  const qYear =
    /^y:?(\d{4})$/.exec(rawP)?.[1] ||
    (/^\d{4}$/.test(rawP) ? rawP : "") ||
    (/^\d{4}$/.test(qParams.get("year") || "") ? qParams.get("year")! : "");
  const qPatch =
    /^p:?(\d+\.\d+)$/.exec(rawP)?.[1] ||
    (qParams.get("patch") || "").replace(/^p:?/i, "");
  const qEvent =
    qParams.get("event") ? resolveEventSlug(qParams.get("event")!) : /^e:(.+)$/.exec(rawP)?.[1] ? resolveEventSlug(/^e:(.+)$/.exec(rawP)![1]) : "";
  const qRole = normalizeRole(qParams.get("role"));
  const qVs = qParams.get("vs") || "";
  const qFilter = qParams.get("player") || qParams.get("team") || qParams.get("event") || qParams.get("q") || "";
  const qSpan = qParams.get("span") || (rawP === "12m" || rawP === "all" ? rawP : "");
  const qItem = qParams.get("item") || "";
  const qKeystone = qParams.get("keystone") || "";
  const [recentHidden, revealRecent] = useHidden(`champ-recent:${c.u}`, c.recent[0]?.date);
  const teamByPlayer = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of c.recent) {
      if (r.team && (r.u || r.n) && !m.has(r.u || r.n)) {
        m.set(r.u || r.n, r.team);
      }
    }
    return m;
  }, [c.recent]);
  const maxYear = Math.max(1, ...c.years.map((y) => y.p + y.b));
  const totalRoles = c.roles.reduce((s, r) => s + r.p, 0) || 1;
  const mainRoles = c.roles.filter((r) => r.p / totalRoles >= 0.1).map((r) => r.r);
  // the champion's roles in order of how often it's played there, with matchups in either list
  const roleKeys = mainRoles.filter((r) => (c.matchups?.[r]?.length || 0) > 0 || (c.matchups12?.[r]?.length || 0) > 0);
  const [muRole, setMuRole] = useState(() => (qRole && roleKeys.includes(qRole) ? qRole : roleKeys[0] || ""));
  const [muSearch, setMuSearch] = useState(qVs);
  const [duoSearch, setDuoSearch] = useState("");
  const [playerSearch, setPlayerSearch] = useState(qFilter);
  const [recentSearch, setRecentSearch] = useState(qFilter);
  // this meta (last 12 months) first when there is one
  const [muRecentPick, setMuRecent] = useState(() =>
    qSpan === "all" ? false : qSpan === "12m" ? true : Object.keys(c.matchups12 || {}).length > 0,
  );
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
  const [buildRole, setBuildRole] = useState(() => (qRole && buildRoles.includes(qRole) ? qRole : ""));
  const [playersRecent, setPlayersRecent] = useState(() => qSpan === "12m");
  const resolveInitialUsed = (): { kind: "item" | "key" | "spells"; v: string } | null => {
    if (qItem) {
      const target = resolveItemSlug(qItem);
      const fromBuild = (c.builds?.items || []).find(([it]) => prettySlug(it) === target || matchesItemSearch(it, itemName(it), qItem))?.[0];
      if (fromBuild) return { kind: "item", v: fromBuild };
      for (const r of c.recent) {
        const hit = (r.it || []).find((it) => prettySlug(it) === target || matchesItemSearch(it, itemName(it), qItem));
        if (hit) return { kind: "item", v: hit };
      }
    }
    if (qKeystone) {
      const target = prettySlug(qKeystone);
      const fromBuild = (c.builds?.keys || []).find(([k]) => prettySlug(k) === target || normText(runeName(k)) === normText(qKeystone))?.[0];
      if (fromBuild) return { kind: "key", v: fromBuild };
      for (const r of c.recent) {
        if (r.ks && (prettySlug(r.ks) === target || normText(runeName(r.ks)) === normText(qKeystone))) return { kind: "key", v: r.ks };
      }
    }
    return null;
  };
  // a build part picked in "Pro builds": the latest games narrow to the ones that used it
  const [usedOnly, setUsed] = useState<{ kind: "item" | "key" | "spells"; v: string } | null>(resolveInitialUsed);
  useEffect(() => {
    if (qRole && roleKeys.includes(qRole)) setMuRole(qRole);
    else if (!qRole && roleKeys[0]) setMuRole(roleKeys[0]);
    if (qRole && buildRoles.includes(qRole)) setBuildRole(qRole);
    else if (!qRole) setBuildRole("");
    setMuSearch(qVs);
    setPlayerSearch(qFilter);
    setRecentSearch(qFilter);
    if (qSpan === "all") {
      setMuRecent(false);
      setPlayersRecent(false);
    } else if (qSpan === "12m") {
      setMuRecent(true);
      setPlayersRecent(true);
    }
    if (qItem || qKeystone) setUsed(resolveInitialUsed());
  }, [qRole, qVs, qFilter, qSpan, qItem, qKeystone, c.u]); // eslint-disable-line react-hooks/exhaustive-deps
  const syncChampRole = (r: string) => {
    const nextQ = new URLSearchParams(query || "");
    if (r) nextQ.set("role", r);
    else nextQ.delete("role");
    const qs = nextQ.toString();
    navigateHub({ kind: "champ", slug: c.u, ...(qs ? { query: qs } : {}) }, { replace: true });
  };
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
  const pickUsed = (kind: "item" | "key" | "spells", v: string) => {
    setUsed((u) => (u && u.kind === kind && u.v === v ? null : { kind, v }));
    window.setTimeout(() => document.getElementById("champ-latest")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };
  const teamSlug = (n: string) => resolveTeamAlias(n, aliases.data?.team) || prettySlug(n);
  const cSlug = c.u || resolveChampSlug(c.name);
  const matchesChampPlayerRow = (p: { n: string; u: string | null }, t: string) => {
    const qAlias = searchAlias(t);
    const pSlug = p.u || resolvePlayerSlug(p.n);
    const pTeam = teamByPlayer.get(p.u || p.n) || "";
    const hay = `${normText(p.n)} ${normText(p.u || "")} ${normText(pTeam)}`;
    const canonTeam = resolveTeamAlias(aliases.data?.team[t] || t, aliases.data?.team) || (qAlias ? resolveTeamAlias(qAlias, aliases.data?.team) : "") || prettySlug(t);
    const pTeamSlug = pTeam ? teamSlug(pTeam) : "";
    return (
      hay.includes(t) ||
      Boolean(qAlias && hay.includes(qAlias)) ||
      (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
      Boolean(qAlias && bare(qAlias).length >= 2 && bare(hay).includes(bare(qAlias))) ||
      (!!t && resolvePlayerSlug(t) === pSlug) ||
      Boolean(qAlias && resolvePlayerSlug(qAlias) === pSlug) ||
      Boolean(pTeamSlug && canonTeam === pTeamSlug)
    );
  };
  const matchesChampRecentGame = (r: (typeof c.recent)[number], t: string) => {
    const qAlias = searchAlias(t);
    const pSlug = r.u || resolvePlayerSlug(r.n);
    const hay = normText(`${r.n} ${r.u || ""} ${r.team || ""} ${r.opp || ""} ${r.en || ""} ${r.r || ""} ${r.date || ""}`);
    const canonTeam = resolveTeamAlias(aliases.data?.team[t] || t, aliases.data?.team) || (qAlias ? resolveTeamAlias(qAlias, aliases.data?.team) : "") || prettySlug(t);
    const rTeamSlug = r.team ? teamSlug(r.team) : "";
    const rOppSlug = r.opp ? teamSlug(r.opp) : "";
    const qRole = normalizeRole(t) || (qAlias ? normalizeRole(qAlias) : null);
    return (
      hay.includes(t) ||
      Boolean(qAlias && hay.includes(qAlias)) ||
      (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
      Boolean(qAlias && bare(qAlias).length >= 2 && bare(hay).includes(bare(qAlias))) ||
      (!!t && resolvePlayerSlug(t) === pSlug) ||
      Boolean(qAlias && resolvePlayerSlug(qAlias) === pSlug) ||
      Boolean(rTeamSlug && canonTeam === rTeamSlug) ||
      Boolean(rOppSlug && canonTeam === rOppSlug) ||
      Boolean(r.r && qRole && qRole === normalizeRole(r.r)) ||
      Boolean(r.en && (matchesPeriodEvent(prettySlug(r.en), r.en, t) || (qAlias ? matchesPeriodEvent(prettySlug(r.en), r.en, qAlias) : false))) ||
      Boolean((r.it || []).some((it) => matchesItemSearch(it, itemName(it), t) || Boolean(qAlias && matchesItemSearch(it, itemName(it), qAlias)))) ||
      Boolean(r.ks && (normText(runeName(r.ks)).includes(t) || normText(r.ks).includes(t) || Boolean(qAlias && normText(runeName(r.ks)).includes(qAlias)))) ||
      Boolean((r.sp || []).some((sp) => normText(spellName(sp)).includes(t) || normText(sp).includes(t) || Boolean(qAlias && normText(spellName(sp)).includes(qAlias))))
    );
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
                .map((r, i) => (
                  <React.Fragment key={r.r}>
                    {i > 0 && " · "}
                    <HubLink
                      to={{ kind: "finder", query: `champ=${encodeURIComponent(cSlug)}&role=${encodeURIComponent(r.r)}` }}
                      className="hover:text-rw-accent hover:underline"
                    >
                      {`${roleName(r.r)} ${Math.round((r.p / totalRoles) * 100)}%`}
                    </HubLink>
                  </React.Fragment>
                ))}
            </p>
          }
          aside={
            <div className="flex flex-wrap gap-2 md:justify-end">
              <CountersLink slug={c.u} role={c.roles[0]?.r} patch={qPatch} year={qYear} event={qEvent} className={heroBtn(true)} />
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(qEvent ? { event: qEvent } : qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                    ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                    q: c.u,
                  }).toString(),
                }}
                className={heroBtn()}
              >
                {tl("Pro tier list")}
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `champ=${encodeURIComponent(cSlug)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                }}
                className={heroBtn()}
              >
                {tl("Game finder")}
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: `champ=${encodeURIComponent(cSlug)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                }}
                className={heroBtn()}
              >
                {tl("Item history")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    champ: c.u,
                    ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                    ...(qEvent ? { p: `e:${qEvent}` } : qPatch ? { p: `p:${qPatch}` } : qYear ? { p: `y${qYear}` } : {}),
                  }).toString(),
                }}
                className={heroBtn()}
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    champ: cSlug,
                    ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                    ...(qEvent ? { event: qEvent } : qYear ? { year: qYear } : {}),
                  }).toString(),
                }}
                className={heroBtn()}
              >
                {tl("Player leaderboards")}
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...(c.recent[0]?.team
                    ? {
                        query: `q=${encodeURIComponent(teamSlug(c.recent[0].team))}${
                          c.recent[0].opp ? `,${encodeURIComponent(teamSlug(c.recent[0].opp))}` : ""
                        }`,
                      }
                    : {}),
                }}
                className={heroBtn()}
              >
                {tl("Power rankings")}
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
              to: { kind: "finder", query: `champ=${encodeURIComponent(cSlug)}` },
            },
            {
              label: tl("Bans"),
              value: fmtNum(c.b),
              bar: c.p + c.b > 0 ? { pct: Math.round((c.b / (c.p + c.b)) * 100), tone: "red" } : undefined,
              to: { kind: "finder", query: `ban=${encodeURIComponent(cSlug)}` },
            },
            {
              label: tl("Win %"),
              value: winRate(c.w, c.p),
              bar: c.p > 0 ? { pct: Math.round((c.w / c.p) * 100), tone: c.w / c.p >= 0.5 ? "teal" : "red" } : undefined,
              to: { kind: "finder", query: `champ=${encodeURIComponent(cSlug)}&result=w` },
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
                  to: { kind: "finder", query: `champ=${encodeURIComponent(cSlug)}&side=b` },
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
                      onClick={() => {
                        setBuildRole(r);
                        syncChampRole(r);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        r === buildRole ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
                      }`}
                    >
                      {r ? roleName(r) : tl("All roles")}
                    </button>
                  ))}
                </span>
              )}
              <HubLink
                to={{
                  kind: "items",
                  query: `champ=${encodeURIComponent(cSlug)}${
                    usedOnly?.kind === "item"
                      ? `&item=${encodeURIComponent(resolveItemSlug(usedOnly.v))}`
                      : items[0]
                        ? `&item=${encodeURIComponent(resolveItemSlug(items[0][0]))}`
                        : ""
                  }`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "counters",
                  query: `champ=${encodeURIComponent(c.u)}${
                    buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""
                  }${qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                    ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                    q: c.u,
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    champ: c.u,
                    ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                    ...(qPatch ? { p: `p:${qPatch}` } : qYear ? { p: `y${qYear}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "finder", query: `champ=${encodeURIComponent(cSlug)}${buildRole ? `&role=${encodeURIComponent(buildRole)}` : ""}${qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    champ: cSlug,
                    ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                    ...(qYear ? { year: qYear } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...(c.recent[0]?.team ? { query: `q=${encodeURIComponent(teamSlug(c.recent[0].team))}` } : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <SectionCard
                section={tl("Pro builds in the last 12 months")}
                name={champName(c.name)}
                sub={[buildRole ? roleName(buildRole) : tl("All roles"), `${fmtNum(activeBuilds.g)}G`].join(" · ")}
                rows={() => [
                  ...items.slice(0, 6).map(([it, g, w], idx) => ({
                    rank: idx + 1,
                    champ: c.name,
                    label: itemName(it),
                    sub: `${tl("Items")} · ${pctOf(g, activeBuilds.g)}`,
                    value: pctOf(w, g),
                    win: w / Math.max(g, 1) >= 0.5,
                  })),
                  ...activeBuilds.keys.slice(0, 3).map(([k, g, w], kIdx) => ({
                    rank: items.slice(0, 6).length + kIdx + 1,
                    champ: c.name,
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
            <HubLink
              to={{ kind: "items", query: `champ=${encodeURIComponent(cSlug)}` }}
              className="hover:text-rw-accent hover:underline"
            >
              {tl("From {n} pro games since {date}. Share of games and win rate.", { n: fmtNum(activeBuilds.g), date: fmtDate(c.builds.since) })}
            </HubLink>
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
            <HubLink
              to={{
                kind: "items",
                query: new URLSearchParams({
                  champ: cSlug,
                  ...(usedOnly?.kind === "item" ? { item: resolveItemSlug(usedOnly.v) } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline"
            >
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
              {(muRows.length >= 10 || Boolean(muSearch.trim())) && (
                <input
                  type="search"
                  value={muSearch}
                  onChange={(e) => setMuSearch(e.target.value)}
                  placeholder={tl("Search champions…")}
                  aria-label={tl("Search champions…")}
                  className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
                />
              )}
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
              {(() => {
                const terms = muSearch
                  .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                  .map((t) => normText(t))
                  .filter(Boolean);
                const hit = terms.length ? muRows.find(([oc]) => terms.some((t) => matchesChampSearch(oc, t))) : undefined;
                return (
                  <>
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(c.u)}${hit ? `&vs=${encodeURIComponent(resolveChampSlug(hit[0]))}` : ""}${muRole ? `&role=${encodeURIComponent(muRole)}` : ""}${qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Counter-pick finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: `champ=${encodeURIComponent(c.u)}${qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          ...(qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                          ...(muRole ? { role: muRole } : {}),
                          q: hit ? `${c.u},${resolveChampSlug(hit[0])}` : c.u,
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          champ: c.u,
                          ...(muRole ? { role: muRole } : {}),
                          ...(qPatch ? { p: `p:${qPatch}` } : qYear ? { p: `y${qYear}` } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `champ=${encodeURIComponent(cSlug)}${hit ? `&vschamp=${encodeURIComponent(resolveChampSlug(hit[0]))}` : ""}${muRole ? `&role=${encodeURIComponent(muRole)}` : ""}${qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          champ: cSlug,
                          ...(muRole ? { role: muRole } : {}),
                          ...(qYear ? { year: qYear } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        ...(c.recent[0]?.team ? { query: `q=${encodeURIComponent(teamSlug(c.recent[0].team))}` } : {}),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                  </>
                );
              })()}
              <SectionCard
                section={`${tl("Matchups")} · ${roleName(muRole)}`}
                name={champName(c.name)}
                sub={muRecent ? tl("Last 12 months") : tl("All time")}
                rows={() => {
                  const terms = muSearch
                    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                    .map((t) => normText(t))
                    .filter(Boolean);
                  const shownMu = terms.length
                    ? muRows.filter(([oc]) => terms.some((t) => matchesChampSearch(oc, t)))
                    : muRows;
                  return shownMu.slice(0, 8).map(([oc, g, w, , gd], idx) => ({
                    rank: idx + 1,
                    champ: oc,
                    label: `vs ${champName(oc)}`,
                    sub: gd != null ? `${tl("Games")}: ${g} · GD@15 ${signedText(gd)}` : `${tl("Games")}: ${g}`,
                    value: pctOf(w, g),
                    tone: w / g >= 0.5 ? ("good" as const) : ("bad" as const),
                  }));
                }}
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
                  onClick={() => {
                    setMuRole(r);
                    syncChampRole(r === roleKeys[0] && !buildRole ? "" : r);
                  }}
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
              <HubLink
                to={{
                  kind: "counters",
                  query: `champ=${encodeURIComponent(c.u)}&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                }}
                className="hover:text-rw-accent hover:underline"
              >
                {tl("In lane at 15 minutes: {gd} gold, {cs} CS, {xp} XP against the other {role}; ahead in {p} of games.", {
                  gd: signedText(laneNow[3]),
                  cs: signedText(laneNow[4]),
                  xp: signedText(laneNow[5]),
                  role: roleName(muRole),
                  p: pctOf(laneNow[6], laneNow[2]),
                })}
              </HubLink>
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
                      <HubLink
                        to={{
                          kind: "counters",
                          query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                        }}
                        className="flex items-center gap-2 shrink-0 tabular-nums text-[11px] hover:underline"
                        title={tl("Counter-pick finder")}
                      >
                        <span className={`font-bold ${w / g >= 0.5 ? "text-rw-teal" : "text-rw-red"}`}>{pctOf(w, g)}</span>
                        <span className="text-rw-muted">({w}–{g - w})</span>
                        {gd != null && (
                          <span className={`text-[10px] ${gd >= 0 ? "text-rw-teal" : "text-rw-red"}`} title="GD@15">
                            {signedText(gd)}
                          </span>
                        )}
                      </HubLink>
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
                const terms = muSearch
                  .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                  .map((t) => normText(t))
                  .filter(Boolean);
                const shownMu = terms.length
                  ? muRows.filter(([oc]) => terms.some((t) => matchesChampSearch(oc, t)))
                  : muRows;
                return shownMu.map(([oc, g, w, tn, gd, cs, xp, ahead]) => (
                  <tr key={oc} className="border-t border-rw-border">
                    <td className={`${td} max-w-[10rem]`} data-sort={champName(oc)}>
                      <ChampLink name={oc} size={16} />
                    </td>
                    <td className={`${td} text-rw-sub`} data-sort={g}>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                          <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((g / maxMuG) * 100))}%` }} />
                        </span>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `champ=${encodeURIComponent(cSlug)}&vschamp=${encodeURIComponent(resolveChampSlug(oc))}${muRole ? `&role=${encodeURIComponent(muRole)}` : ""}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                          }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {g}
                        </HubLink>
                      </span>
                    </td>
                    <td className={td} data-sort={g ? w / g : 0}>
                      <HubLink
                        to={{
                          kind: "counters",
                          query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                        }}
                        className="hover:opacity-90"
                        title={tl("Counter-pick finder")}
                      >
                        <WinBar w={w} g={g} />
                      </HubLink>
                    </td>
                    {muLane && (
                      <>
                        <td className={td} data-sort={gd ?? ""}>
                          {gd != null ? (
                            <HubLink
                              to={{
                                kind: "counters",
                                query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                              }}
                              className="hover:underline"
                              title={tl("Counter-pick finder")}
                            >
                              <Lead v={gd} />
                            </HubLink>
                          ) : (
                            <Lead v={gd} />
                          )}
                        </td>
                        <td className={td} data-sort={cs ?? ""}>
                          {cs != null ? (
                            <HubLink
                              to={{
                                kind: "counters",
                                query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                              }}
                              className="hover:underline"
                              title={tl("Counter-pick finder")}
                            >
                              <Lead v={cs} />
                            </HubLink>
                          ) : (
                            <Lead v={cs} />
                          )}
                        </td>
                        <td className={td} data-sort={xp ?? ""}>
                          {xp != null ? (
                            <HubLink
                              to={{
                                kind: "counters",
                                query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                              }}
                              className="hover:underline"
                              title={tl("Counter-pick finder")}
                            >
                              <Lead v={xp} />
                            </HubLink>
                          ) : (
                            <Lead v={xp} />
                          )}
                        </td>
                        <td
                          className={`${td} ${tn && ahead != null ? (ahead / tn >= 0.5 ? "text-rw-teal" : "text-rw-red") : "text-rw-muted"}`}
                          data-sort={tn && ahead != null ? ahead / tn : ""}
                          title={tn ? tl("{n} games with timelines", { n: tn }) : undefined}
                        >
                          {tn && ahead != null ? (
                            <HubLink
                              to={{
                                kind: "counters",
                                query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                              }}
                              className="hover:underline"
                            >
                              {pctOf(ahead, tn)}
                            </HubLink>
                          ) : (
                            "–"
                          )}
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
            <span className="flex flex-wrap items-center gap-2">
              {((c.duos || []).length > 10 || Boolean(duoSearch.trim())) && (
                <input
                  type="search"
                  value={duoSearch}
                  onChange={(e) => setDuoSearch(e.target.value)}
                  placeholder={tl("Search champions…")}
                  aria-label={tl("Search champions…")}
                  className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
                />
              )}
              {(() => {
                const terms = duoSearch
                  .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                  .map((t) => normText(t))
                  .filter(Boolean);
                const allDuos = c.duos || [];
                const duos = terms.length
                  ? allDuos.filter(([pc]) => terms.some((t) => matchesChampSearch(pc, t)))
                  : allDuos;
                const topDuo = duos[0] || allDuos[0];
                return (
                  <>
                    {topDuo && (
                      <HubLink
                        to={{
                          kind: "counters",
                          query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(topDuo[0]))}${qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Counters")} →
                      </HubLink>
                    )}
                    <HubLink
                      to={{ kind: "items", query: `champ=${encodeURIComponent(cSlug)}${qYear ? `&year=${encodeURIComponent(qYear)}` : ""}` }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "draft", query: `champ=${encodeURIComponent(c.u)}&role=Bot${qPatch ? `&p=p:${encodeURIComponent(qPatch)}` : qYear ? `&p=y${encodeURIComponent(qYear)}` : ""}` }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          role: "Bot",
                          ...(qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                          q: topDuo ? `${c.u},${resolveChampSlug(topDuo[0])}` : c.u,
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `champ=${encodeURIComponent(topDuo ? `${cSlug},${resolveChampSlug(topDuo[0])}` : cSlug)}${qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          champ: cSlug,
                          role: "Bot",
                          ...(qYear ? { year: qYear } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "rankings" }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                    <SectionCard
                      section={tl("Bot lane partners")}
                      name={champName(c.name)}
                      rows={() =>
                        duos.slice(0, 12).map(([pc, g, w], idx) => ({
                          rank: idx + 1,
                          champ: pc,
                          label: champName(pc),
                          sub: `${g}G`,
                          value: pctOf(w, g),
                          win: w / g >= 0.5,
                        }))
                      }
                    />
                  </>
                );
              })()}
            </span>
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
                const terms = duoSearch
                  .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                  .map((t) => normText(t))
                  .filter(Boolean);
                const allDuos = c.duos || [];
                const duos = terms.length
                  ? allDuos.filter(([pc]) => terms.some((t) => matchesChampSearch(pc, t)))
                  : allDuos.slice(0, 15);
                const maxDuoG = Math.max(1, ...duos.map((x) => x[1]));
                return duos.map(([pc, g, w]) => (
                  <tr key={pc} className="border-t border-rw-border">
                    <td className={`${td} max-w-[10rem]`} data-sort={champName(pc)}>
                      <ChampLink name={pc} size={16} />
                    </td>
                    <td className={`${td} text-rw-sub`} data-sort={g}>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                          <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((g / maxDuoG) * 100))}%` }} />
                        </span>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `champ=${encodeURIComponent(`${cSlug},${resolveChampSlug(pc)}`)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                          }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {g}
                        </HubLink>
                      </span>
                    </td>
                    <td className={td} data-sort={g ? w / g : 0}>
                      <HubLink
                        to={{
                          kind: "finder",
                          query: `champ=${encodeURIComponent(`${cSlug},${resolveChampSlug(pc)}`)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                        }}
                        className="hover:opacity-90"
                        title={tl("Game finder")}
                      >
                        <WinBar w={w} g={g} />
                      </HubLink>
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
            {((playersRecent ? recentPlayersList : c.players).length >= 10 || Boolean(playerSearch.trim())) && (
              <input
                type="search"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder={tl("Filter by name or team…")}
                aria-label={tl("Filter by name or team…")}
                className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
              />
            )}
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
            {(() => {
              const allPlayers = playersRecent ? recentPlayersList : c.players;
              const terms = playerSearch
                .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                .map((t) => normText(t))
                .filter(Boolean);
              const pList = terms.length
                ? allPlayers.filter((p) => terms.some((t) => matchesChampPlayerRow(p, t)))
                : allPlayers.slice(0, 25);
              const t0 = pList[0] ? teamByPlayer.get(pList[0].u || pList[0].n) || "" : "";
              const t1 = pList[1] ? teamByPlayer.get(pList[1].u || pList[1].n) || "" : "";
              return (
                <>
                  {t0 && (
                    <>
                      <HubLink
                        to={{
                          kind: "prep",
                          a: teamSlug(t0),
                          ...(t1 && teamSlug(t1) !== teamSlug(t0) ? { b: teamSlug(t1) } : {}),
                          ...(playersRecent ? { period: "12m" } : qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Match prep")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "draft",
                          query: `teams=${encodeURIComponent(teamSlug(t0))}${t1 && teamSlug(t1) !== teamSlug(t0) ? `,${encodeURIComponent(teamSlug(t1))}` : ""}${playersRecent ? "&p=12m" : qEvent ? `&p=e:${encodeURIComponent(qEvent)}` : qPatch ? `&p=p:${encodeURIComponent(qPatch)}` : qYear ? `&p=y${encodeURIComponent(qYear)}` : ""}`,
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Draft board")} →
                      </HubLink>
                    </>
                  )}
                  {pList.length >= 1 && pList[0].u && (
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "player",
                        a: pList[0].u,
                        ...(pList[1]?.u ? { b: pList[1].u } : {}),
                        period: playersRecent ? "12m" : qEvent ? `e:${qEvent}` : qPatch ? `p:${qPatch}` : qYear ? `y${qYear}` : undefined,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                  )}
                  {pList.length >= 1 && pList[0].u && (
                    <HubLink
                      to={{
                        kind: "items",
                        query: `player=${encodeURIComponent(pList[0].u)}&champ=${encodeURIComponent(cSlug)}${!playersRecent && qEvent ? `&event=${encodeURIComponent(qEvent)}` : !playersRecent && qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                  )}
                  {pList.length >= 1 && (
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `player=${encodeURIComponent(pList[0].u || resolvePlayerSlug(pList[0].n))}&champ=${encodeURIComponent(cSlug)}${!playersRecent && qEvent ? `&event=${encodeURIComponent(qEvent)}` : !playersRecent && qPatch ? `&patch=${encodeURIComponent(qPatch)}` : !playersRecent && qYear ? `&year=${encodeURIComponent(qYear)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        champ: cSlug,
                        ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                        ...(!playersRecent && qEvent ? { event: qEvent } : !playersRecent && qYear ? { year: qYear } : {}),
                        ...(playerSearch.trim() && pList[0]
                          ? {
                              q: `${pList[0].u || resolvePlayerSlug(pList[0].n)}${pList[1] ? `,${pList[1].u || resolvePlayerSlug(pList[1].n)}` : ""}`,
                            }
                          : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(!playersRecent && qEvent
                          ? { event: qEvent }
                          : !playersRecent && qPatch
                            ? { key: `p${qPatch}`, patch: qPatch }
                            : !playersRecent && qYear
                              ? { key: `y${qYear}`, year: qYear }
                              : {}),
                        ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                        q: c.u,
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      ...(playerSearch.trim() && t0
                        ? { query: `q=${encodeURIComponent(teamSlug(t0))}${t1 && teamSlug(t1) !== teamSlug(t0) ? `,${encodeURIComponent(teamSlug(t1))}` : ""}` }
                        : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <SectionCard
                    section={tl("Most games on {champion}", { champion: champName(c.name) })}
                    name={champName(c.name)}
                    sub={playersRecent ? tl("Last 12 months") : tl("All time")}
                    rows={() =>
                      pList.slice(0, 12).map((p, idx) => ({
                        rank: idx + 1,
                        champ: c.name,
                        team: teamByPlayer.get(p.u || p.n),
                        label: p.n,
                        sub: `${p.g}G · ${fmtN(p.kda)} ${tl("KDA")}`,
                        value: winRate(p.w, p.g),
                        win: p.w / Math.max(1, p.g) >= 0.5,
                      }))
                    }
                  />
                </>
              );
            })()}
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
              const allPlayers = playersRecent ? recentPlayersList : c.players;
              const terms = playerSearch
                .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                .map((t) => normText(t))
                .filter(Boolean);
              const pList = terms.length
                ? allPlayers.filter((p) => terms.some((t) => matchesChampPlayerRow(p, t)))
                : allPlayers.slice(0, 25);
              const maxPG = Math.max(1, ...pList.map((x) => x.g));
              return pList.map((p) => {
                const pTeam = teamByPlayer.get(p.u || p.n);
                return (
                <tr key={p.n + p.u} className="border-t border-rw-border">
                  <td className={td} data-sort={p.n}>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <HubLink
                        to={{
                          kind: "player",
                          slug: p.u || resolvePlayerSlug(p.n),
                          ...(playersRecent ? { query: "p=12m" } : qYear ? { query: `p=y${qYear}` } : {}),
                        }}
                        className="shrink-0 hover:opacity-80"
                        title={p.n}
                      >
                        <PlayerPhoto name={p.n} team={pTeam} slug={p.u ?? undefined} size={20} />
                      </HubLink>
                      {pTeam && (
                        <HubLink
                          to={{
                            kind: "team",
                            slug: teamSlug(pTeam),
                            ...(playersRecent ? { query: "p=12m" } : qYear ? { query: `p=y${qYear}` } : {}),
                          }}
                          className="shrink-0 hover:opacity-80"
                          title={pTeam}
                        >
                          <TeamLogo name={pTeam} size={13} />
                        </HubLink>
                      )}
                      <PlayerLink name={p.n} u={p.u} query={playersRecent ? "p=12m" : qYear ? `p=y${qYear}` : undefined} />
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
                            ? { kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(cSlug)}${playersRecent ? "&p=12m" : ""}` }
                            : { kind: "finder", query: `player=${encodeURIComponent(resolvePlayerSlug(p.n))}&champ=${encodeURIComponent(cSlug)}` }
                        }
                        className="hover:text-rw-accent hover:underline"
                        title={tl("Game finder")}
                      >
                        {p.g}
                      </HubLink>
                    </span>
                  </td>
                  <td className={td} data-sort={p.g ? p.w / p.g : 0}>
                    <HubLink
                      to={
                        p.u
                          ? { kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(cSlug)}${playersRecent ? "&p=12m" : ""}` }
                          : { kind: "finder", query: `player=${encodeURIComponent(resolvePlayerSlug(p.n))}&champ=${encodeURIComponent(cSlug)}` }
                      }
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      <WinBar w={p.w} g={p.g} />
                    </HubLink>
                  </td>
                  <td className={td} data-sort={p.kda}>
                    <HubLink
                      to={
                        p.u
                          ? { kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(cSlug)}${playersRecent ? "&p=12m" : ""}` }
                          : { kind: "finder", query: `player=${encodeURIComponent(resolvePlayerSlug(p.n))}&champ=${encodeURIComponent(cSlug)}` }
                      }
                      className="inline-flex hover:opacity-85"
                      title={tl("Game finder")}
                    >
                      <KdaBar kda={p.kda} />
                    </HubLink>
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
              {(c.recent.length >= 8 || Boolean(recentSearch.trim())) && (
                <input
                  type="search"
                  value={recentSearch}
                  onChange={(e) => setRecentSearch(e.target.value)}
                  placeholder={tl("Filter by name or team…")}
                  aria-label={tl("Filter by name or team…")}
                  className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-36"
                />
              )}
              {usedOnly && (
                <button type="button" onClick={() => setUsed(null)} className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-rw-accent text-rw-accent text-[11px]" title={tl("Show every game")}>
                  {tl("With {name}", { name: usedName })} ✕
                </button>
              )}
              {(() => {
                const rTerms = recentSearch
                  .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                  .map((t) => normText(t))
                  .filter(Boolean);
                const r0 = c.recent.find((r) => {
                  if (!usedIn(r)) return false;
                  if (!rTerms.length) return true;
                  return rTerms.some((t) => matchesChampRecentGame(r, t));
                });
                const r0Year = /^\d{4}$/.test((r0?.date || "").slice(0, 4)) ? (r0!.date || "").slice(0, 4) : "";
                return (
                  <>
                    {r0?.team && r0?.opp ? (
                      <>
                        <HubLink
                          to={{
                            kind: "prep",
                            a: teamSlug(r0.team),
                            b: teamSlug(r0.opp),
                            ...(r0Year ? { period: `y${r0Year}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Match prep")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "compare",
                            mode: "team",
                            a: teamSlug(r0.team),
                            b: teamSlug(r0.opp),
                            ...(r0Year ? { period: `y${r0Year}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Compare")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "draft",
                            query: `teams=${encodeURIComponent(teamSlug(r0.team))},${encodeURIComponent(teamSlug(r0.opp))}${r0Year ? `&p=y${encodeURIComponent(r0Year)}` : ""}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Draft board")} →
                        </HubLink>
                      </>
                    ) : (
                      <HubLink
                        to={{ kind: "draft", ...(r0Year ? { query: `p=y${encodeURIComponent(r0Year)}` } : {}) }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Draft board")} →
                      </HubLink>
                    )}
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(c.u)}${
                          buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""
                        }${r0Year ? `&patch=y${encodeURIComponent(r0Year)}&year=${encodeURIComponent(r0Year)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: `champ=${encodeURIComponent(cSlug)}${
                          usedOnly?.kind === "item" ? `&item=${encodeURIComponent(resolveItemSlug(usedOnly.v))}` : ""
                        }${r0Year ? `&year=${encodeURIComponent(r0Year)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          ...(r0Year ? { key: `y${r0Year}`, year: r0Year } : {}),
                          ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                          q: c.u,
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          champ: cSlug,
                          ...(r0Year ? { year: r0Year } : {}),
                          ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                          ...(recentSearch.trim() && r0 ? { q: r0.u || resolvePlayerSlug(r0.n) } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: new URLSearchParams({
                          champ: cSlug,
                          ...(recentSearch.trim() && r0 ? { player: r0.u || resolvePlayerSlug(r0.n) } : {}),
                          ...(r0Year ? { year: r0Year } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        ...(r0?.team
                          ? {
                              query: `q=${encodeURIComponent(teamSlug(r0.team))}${
                                r0.opp ? `,${encodeURIComponent(teamSlug(r0.opp))}` : ""
                              }`,
                            }
                          : {}),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                  </>
                );
              })()}
              <SectionCard
                section={tl("Latest pro games")}
                name={champName(c.name)}
                sub={usedOnly ? tl("With {name}", { name: usedName }) : undefined}
                rows={() => {
                  const rTerms = recentSearch
                    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                    .map((t) => normText(t))
                    .filter(Boolean);
                  return c.recent
                    .filter(usedIn)
                    .filter((r) => !rTerms.length || rTerms.some((t) => matchesChampRecentGame(r, t)))
                    .slice(0, 10)
                    .map((r, idx) => ({
                      rank: idx + 1,
                      win: !!r.win,
                      champ: c.name,
                      team: r.team || r.opp,
                      label: `${r.n} (${r.k}/${r.d}/${r.a}) vs ${r.opp}`,
                      sub: r.en,
                      value: fmtDate(r.date, false),
                    }));
                }}
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
            {(() => {
              const rTerms = recentSearch
                .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                .map((t) => normText(t))
                .filter(Boolean);
              return c.recent
                .filter(usedIn)
                .filter((r) => !rTerms.length || rTerms.some((t) => matchesChampRecentGame(r, t)))
                .map((r, i) => (
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
                    <HubLink
                      to={{
                        kind: "player",
                        slug: r.u || resolvePlayerSlug(r.n),
                        ...(/^\d{4}$/.test((r.date || "").slice(0, 4)) ? { query: `p=y${(r.date || "").slice(0, 4)}` } : {}),
                      }}
                      className="shrink-0 hover:opacity-80"
                      title={r.n}
                    >
                      <PlayerPhoto name={r.n} team={r.team} slug={r.u ?? undefined} size={16} />
                    </HubLink>
                    {r.team && (
                      <HubLink
                        to={{
                          kind: "team",
                          slug: teamSlug(r.team),
                          ...(/^\d{4}$/.test((r.date || "").slice(0, 4)) ? { query: `p=y${(r.date || "").slice(0, 4)}` } : {}),
                        }}
                        className="shrink-0 hover:opacity-80"
                        title={r.team}
                      >
                        <TeamLogo name={r.team} size={13} />
                      </HubLink>
                    )}
                    <PlayerLink
                      name={r.n}
                      u={r.u}
                      query={/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `p=y${(r.date || "").slice(0, 4)}` : undefined}
                    />
                    {r.g ? (
                      <HubLink to={{ kind: "match", slug: r.g, game: r.gn }} className="text-rw-sub hover:text-rw-accent hover:underline tabular-nums shrink-0">
                        {r.k}/{r.d}/{r.a}
                      </HubLink>
                    ) : (
                      <span className="text-rw-sub tabular-nums shrink-0">{r.k}/{r.d}/{r.a}</span>
                    )}
                    {r.team && r.opp ? (
                      <HubLink
                        to={{
                          kind: "compare",
                          mode: "team",
                          a: teamSlug(r.team),
                          b: teamSlug(r.opp),
                          period: /^\d{4}$/.test((r.date || "").slice(0, 4)) ? `y${(r.date || "").slice(0, 4)}` : undefined,
                        }}
                        className="text-rw-muted hover:text-rw-accent hover:underline shrink-0"
                        title={tl("Compare")}
                      >
                        vs
                      </HubLink>
                    ) : (
                      <span className="text-rw-muted shrink-0">vs</span>
                    )}
                    <HubLink
                      to={{
                        kind: "team",
                        slug: teamSlug(r.opp),
                        ...(/^\d{4}$/.test((r.date || "").slice(0, 4)) ? { query: `p=y${(r.date || "").slice(0, 4)}` } : {}),
                      }}
                      className="shrink-0 hover:opacity-80"
                      title={r.opp}
                    >
                      <TeamLogo name={r.opp} size={14} />
                    </HubLink>
                    <TeamLink
                      name={r.opp}
                      query={/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `p=y${(r.date || "").slice(0, 4)}` : undefined}
                      className="truncate"
                    />
                  </span>
                  <span className="flex items-center gap-2 text-rw-muted shrink-0">
                    {r.team && r.opp && (
                      <>
                        <HubLink
                          to={{
                            kind: "prep",
                            a: teamSlug(r.team),
                            b: teamSlug(r.opp),
                            ...(/^\d{4}$/.test((r.date || "").slice(0, 4)) ? { period: `y${(r.date || "").slice(0, 4)}` } : {}),
                          }}
                          className="hidden sm:inline text-[10px] hover:text-rw-accent hover:underline"
                        >
                          {tl("Match prep")}
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "draft",
                            query: `teams=${encodeURIComponent(teamSlug(r.team))},${encodeURIComponent(teamSlug(r.opp))}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&p=y${(r.date || "").slice(0, 4)}` : ""}`,
                          }}
                          className="hidden md:inline text-[10px] hover:text-rw-accent hover:underline"
                        >
                          {tl("Draft board")}
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `team=${encodeURIComponent(teamSlug(r.team))}&vs=${encodeURIComponent(teamSlug(r.opp))}&champ=${encodeURIComponent(cSlug)}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&year=${(r.date || "").slice(0, 4)}` : ""}`,
                          }}
                          className="hidden md:inline text-[10px] hover:text-rw-accent hover:underline"
                        >
                          {tl("Game finder")}
                        </HubLink>
                      </>
                    )}
                    {r.g ? (
                      <HubLink to={{ kind: "match", slug: r.g, game: r.gn }} className="hover:text-rw-text hover:underline">
                        {fmtDate(r.date, false)}
                      </HubLink>
                    ) : (
                      fmtDate(r.date, false)
                    )}
                  </span>
                </div>
                {r.it && r.it.length > 0 && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {r.ks && <RuneIcon name={r.ks} size={18} />}
                    {r.stt && <RuneIcon name={r.stt} size={14} />}
                    <span className="w-1" />
                    {r.it.map((it, j) => (
                      <HubLink
                        key={j}
                        to={{
                          kind: "items",
                          query: `item=${encodeURIComponent(resolveItemSlug(it))}&champ=${encodeURIComponent(cSlug)}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&year=${(r.date || "").slice(0, 4)}` : ""}`,
                        }}
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
            ));
            })()}
          </ul>
        )}
      </Section>

      {/* the champion's history in pro play after what most people come for (TV, 2026-10-28): builds, matchups, who
          plays it and its latest games first */}
      {c.slots && Object.keys(c.slots).length > 0 && (
        <Section
          title={tl("By pick order")}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {(() => {
                const rTerms = recentSearch
                  .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                  .map((t) => normText(t))
                  .filter(Boolean);
                const r0 = c.recent.find((r) => {
                  if (!usedIn(r)) return false;
                  if (!rTerms.length) return true;
                  return rTerms.some((t) => matchesChampRecentGame(r, t));
                });
                const r0Year = /^\d{4}$/.test((r0?.date || "").slice(0, 4)) ? (r0!.date || "").slice(0, 4) : "";
                return r0?.team && r0?.opp ? (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: teamSlug(r0.team),
                        b: teamSlug(r0.opp),
                        ...(r0Year ? { period: `y${r0Year}` } : {}),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a: teamSlug(r0.team),
                        b: teamSlug(r0.opp),
                        ...(r0Year ? { period: `y${r0Year}` } : {}),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(teamSlug(r0.team))},${encodeURIComponent(teamSlug(r0.opp))}${r0Year ? `&p=y${encodeURIComponent(r0Year)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                  </>
                ) : (
                  <HubLink
                    to={{ kind: "draft", ...(r0Year ? { query: `p=y${encodeURIComponent(r0Year)}` } : {}) }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                );
              })()}
              <HubLink
                to={{
                  kind: "counters",
                  query: `champ=${encodeURIComponent(c.u)}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
              <HubLink
                to={{ kind: "items", query: `champ=${encodeURIComponent(cSlug)}${qYear ? `&year=${encodeURIComponent(qYear)}` : ""}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                    ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                    q: c.u,
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{ kind: "finder", query: `champ=${encodeURIComponent(cSlug)}${qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&year=${encodeURIComponent(qYear)}` : ""}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    champ: cSlug,
                    ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                    ...(qYear ? { year: qYear } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...(c.recent[0]?.team
                    ? {
                        query: `q=${encodeURIComponent(teamSlug(c.recent[0].team))}${
                          c.recent[0].opp ? `,${encodeURIComponent(teamSlug(c.recent[0].opp))}` : ""
                        }`,
                      }
                    : {}),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <SectionCard
                section={tl("By pick order")}
                name={champName(c.name)}
                rows={() =>
                  Object.entries(c.slots!).map(([slot, [g, w]], idx) => ({
                    rank: idx + 1,
                    champ: c.name,
                    label: slot,
                    sub: tl("{n} games", { n: fmtNum(g) }),
                    value: g >= 5 ? pctOf(w, g) : "–",
                    win: g >= 5 ? w / g >= 0.5 : undefined,
                  }))
                }
              />
            </span>
          }
        >
          <p className="text-[11px] text-rw-muted">{tl("Games and win rate by where it was picked in the draft (B = blue side, R = red side), every pro game with the pick order known.")}</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {Object.entries(c.slots).map(([slot, [g, w]]) => {
              const wrPct = g > 0 ? Math.round((w / g) * 100) : 0;
              const good = g >= 5 && w / g >= 0.5;
              const side = slot.startsWith("B") ? "b" : slot.startsWith("R") ? "r" : "";
              return (
                <HubLink
                  key={slot}
                  to={{ kind: "finder", query: `champ=${encodeURIComponent(cSlug)}${side ? `&side=${side}` : ""}` }}
                  title={tl("Game finder")}
                  className="rounded-lg border border-rw-border bg-rw-bg px-2 py-1.5 text-center space-y-1 hover:border-rw-accent/60 hover:bg-rw-raised/40 transition-colors"
                >
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
                </HubLink>
              );
            })}
          </div>
        </Section>
      )}

      {c.patches && c.patches.length > 0 && (
        <Section
          title={tl("Recent patches")}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {c.patches.length >= 3 && <PatchTrend patches={c.patches} />}
              <HubLink
                to={{ kind: "counters", query: `champ=${encodeURIComponent(c.u)}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${c.patches[0]?.p ? `&patch=${encodeURIComponent(c.patches[0].p)}` : ""}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
              <HubLink
                to={{ kind: "items", query: `champ=${encodeURIComponent(cSlug)}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(c.patches[0]?.p ? { key: `p${c.patches[0].p}`, patch: c.patches[0].p } : {}),
                    ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                    q: c.u,
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    champ: c.u,
                    ...(c.patches[0]?.p ? { p: `p:${c.patches[0].p}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "champions",
                  query: new URLSearchParams({
                    ...(c.patches[0]?.p ? { key: `p${c.patches[0].p}`, patch: c.patches[0].p } : {}),
                    q: c.u,
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Champions")} →
              </HubLink>
              <HubLink
                to={{ kind: "patches", query: `q=${encodeURIComponent(cSlug)}` }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Patches")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `champ=${encodeURIComponent(cSlug)}${c.patches[0]?.p ? `&patch=${encodeURIComponent(c.patches[0].p)}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    champ: cSlug,
                    ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{ kind: "rankings" }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <SectionCard
                section={tl("Recent patches")}
                name={champName(c.name)}
                rows={() =>
                  c.patches!.map((p, idx) => {
                    const pres = (p.pr ?? p.pk + p.b) / Math.max(p.g, 1);
                    return {
                      rank: idx + 1,
                      champ: c.name,
                      label: `${tl("Patch")} ${p.p}`,
                      sub: `${p.pk} ${tl("Picks")} · ${p.b} ${tl("Bans")}`,
                      value: `${Math.round(pres * 100)}% · ${p.pk ? pctOf(p.w, p.pk) : "–"}`,
                      win: p.pk >= 5 ? p.w / p.pk >= 0.5 : undefined,
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
                <div
                  key={p.p}
                  className={`grid grid-cols-[3.5rem_1fr_2.5rem_auto] items-center gap-2 text-xs rounded px-1 -mx-1 ${
                    qPatch && p.p === qPatch ? "bg-rw-accent/15 ring-1 ring-rw-accent/50" : ""
                  }`}
                >
                  <HubLink
                    to={{ kind: "champions", query: `key=p${encodeURIComponent(p.p)}&patch=${encodeURIComponent(p.p)}&q=${encodeURIComponent(c.u)}` }}
                    className="text-rw-text hover:text-rw-accent hover:underline font-semibold"
                  >
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
                  <HubLink
                    to={{ kind: "finder", query: `champ=${encodeURIComponent(cSlug)}&patch=${encodeURIComponent(p.p)}` }}
                    className="text-rw-sub hover:text-rw-accent hover:underline tabular-nums text-right leading-tight sm:whitespace-nowrap sm:min-w-56"
                    title={tl("Game finder")}
                  >
                    {tl("{pres} presence · {p} picks · {wr}", { pres: `${Math.round(pres * 100)}%`, p: p.pk, wr: p.pk ? pctOf(p.w, p.pk) : "–" })}
                  </HubLink>
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
          <span className="flex flex-wrap items-center gap-2">
            {(() => {
              const latestY = c.years[c.years.length - 1]?.y;
              return (
                <>
                  <HubLink
                    to={{ kind: "counters", query: `champ=${encodeURIComponent(c.u)}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${latestY ? `&patch=y${encodeURIComponent(latestY)}&year=${encodeURIComponent(latestY)}` : ""}` }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "items",
                      query: `champ=${encodeURIComponent(cSlug)}${latestY ? `&year=${encodeURIComponent(latestY)}` : ""}`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(latestY ? { key: `y${latestY}`, year: latestY } : {}),
                        ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                        q: c.u,
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        champ: c.u,
                        ...(latestY ? { p: `y${latestY}` } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "champions",
                      query: new URLSearchParams({
                        ...(latestY ? { key: `y${latestY}`, year: latestY } : {}),
                        q: c.u,
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Champions")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `champ=${encodeURIComponent(cSlug)}${latestY ? `&year=${encodeURIComponent(latestY)}` : ""}`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        champ: cSlug,
                        ...(latestY ? { year: latestY } : {}),
                        ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "rankings" }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                </>
              );
            })()}
            <BroadcastCardButton data={() => champCardData(c, champName(c.name))} name={`${c.u}-pro-play`} label={tl("Overview card")} />
            <SectionCard
              section={tl("By year")}
              name={champName(c.name)}
              rows={() =>
                [...c.years].reverse().map((y, idx) => ({
                  rank: idx + 1,
                  champ: c.name,
                  label: y.y,
                  sub: `${fmtNum(y.p)} ${tl("Picks")} · ${fmtNum(y.b)} ${tl("Bans")}`,
                  value: y.p ? winRate(y.w, y.p) : "–",
                  win: y.p ? y.w / y.p >= 0.5 : undefined,
                }))
              }
            />
          </span>
        }
      >
        <div className="space-y-1">
          {c.years.map((y) => (
            <div
              key={y.y}
              className={`grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-xs rounded px-1 -mx-1 ${
                qYear && y.y === qYear ? "bg-rw-accent/15 ring-1 ring-rw-accent/50" : ""
              }`}
            >
              <HubLink
                to={{ kind: "champions", query: `key=y${encodeURIComponent(y.y)}&year=${encodeURIComponent(y.y)}&q=${encodeURIComponent(c.u)}` }}
                className="text-rw-text hover:text-rw-accent hover:underline font-semibold"
              >
                {y.y}
              </HubLink>
              <div className="h-3 bg-rw-bg rounded overflow-hidden flex" title={`${y.p} / ${y.b}`}>
                <div className="bg-rw-teal/70" style={{ width: `${(y.p / maxYear) * 100}%` }} />
                <div className="bg-rw-red/50" style={{ width: `${(y.b / maxYear) * 100}%` }} />
              </div>
              <HubLink
                to={{ kind: "finder", query: `champ=${encodeURIComponent(cSlug)}&year=${encodeURIComponent(y.y)}` }}
                className="text-rw-sub hover:text-rw-accent hover:underline tabular-nums text-right shrink-0 whitespace-nowrap min-w-44"
                title={tl("Game finder")}
              >
                {tl("{p} picks · {b} bans · {wr}", { p: fmtNum(y.p), b: fmtNum(y.b), wr: y.p ? winRate(y.w, y.p) : "–" })}
              </HubLink>
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
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
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
    lines.push(hubShareUrl({ kind: "champ", slug: c.u }));
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        setState("failed");
        setTimeout(() => setState("idle"), 2400);
      });
  };
  return (
    <button type="button" onClick={copy} className={heroBtn()} title={tl("Copy post")}>
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};


