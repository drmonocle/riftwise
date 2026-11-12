/** Champion page: pro picks, bans and wins by year and patch, builds, matchups, best players and the latest pro games. */
import React, { useEffect, useMemo, useState } from "react";
import { tl, tc, roleName, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { bare, loadAliases, loadHubChamp, matchesChampSearch, matchesItemSearch, normText, prettySlug, resolveChampSlug, resolveEventSlug, resolveItemSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
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
  const qLeague = qParams.get("league") ? resolveLeagueSlug(qParams.get("league")!) : "";
  const qRole = normalizeRole(qParams.get("role"));
  const rawVsParam = qParams.get("vs") || "";
  const rawVsChampParam = qParams.get("vschamp") || "";
  const rawVsTeamParam = qParams.get("vsteam") || "";
  const hasTeamParam = Boolean(qParams.get("team"));
  const vsMatchesChamp = useMemo(() => {
    if (!rawVsParam) return false;
    const t = normText(rawVsParam);
    const allMu = [
      ...Object.values(c.matchups || {}).flatMap((l) => l.map((r) => r[0])),
      ...Object.values(c.matchups12 || {}).flatMap((l) => l.map((r) => r[0])),
      ...(c.duos || []).map((r) => r[0]),
    ];
    return allMu.some((oc) => matchesChampSearch(oc, t));
  }, [rawVsParam, c.matchups, c.matchups12, c.duos]);
  const qVs = rawVsChampParam || (hasTeamParam && !vsMatchesChamp ? "" : rawVsParam);
  const qVsTeam = rawVsTeamParam || (hasTeamParam && (Boolean(rawVsChampParam) || !vsMatchesChamp) ? rawVsParam : "");
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
  const vsTerms = useMemo(
    () =>
      qVs
        .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
        .map((t) => normText(t))
        .filter(Boolean),
    [qVs],
  );
  const mu12HasVs = useMemo(
    () =>
      vsTerms.length > 0 &&
      (c.matchups12?.[muRole] || []).some(([oc]) => vsTerms.some((t) => matchesChampSearch(oc, t))),
    [vsTerms, c.matchups12, muRole],
  );
  const muAllHasVs = useMemo(
    () =>
      vsTerms.length > 0 &&
      (c.matchups?.[muRole] || []).some(([oc]) => vsTerms.some((t) => matchesChampSearch(oc, t))),
    [vsTerms, c.matchups, muRole],
  );
  const resolveInitialMuRecent = () => {
    if (qSpan === "all") return false;
    if (qSpan === "12m") return true;
    if (vsTerms.length > 0 && !mu12HasVs && muAllHasVs) return false;
    return Object.keys(c.matchups12 || {}).length > 0;
  };
  // this meta (last 12 months) first when there is one
  const [muRecentPick, setMuRecent] = useState(resolveInitialMuRecent);
  // the last 12 months have no matchups in this role: show all time
  const muRecent = muRecentPick && (c.matchups12?.[muRole]?.length || 0) > 0;
  const muRows = ((muRecent ? c.matchups12 : c.matchups) || {})[muRole] || [];
  const validMuSearch = useMemo(() => {
    if (!vsTerms.length) return "";
    const activeRows = ((muRecent ? c.matchups12 : c.matchups) || {})[muRole] || [];
    const matching = vsTerms.filter((t) => activeRows.some(([oc]) => matchesChampSearch(oc, t)));
    return matching.join(", ");
  }, [vsTerms, muRecent, c.matchups12, c.matchups, muRole]);
  const validDuoSearch = useMemo(() => {
    if (!vsTerms.length || !c.duos?.length) return "";
    const matching = vsTerms.filter((t) => (c.duos || []).some(([pc]) => matchesChampSearch(pc, t)));
    return matching.join(", ");
  }, [vsTerms, c.duos]);
  const [muSearch, setMuSearch] = useState(validMuSearch);
  const [duoSearch, setDuoSearch] = useState(validDuoSearch);
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
    const qRoleTerm = normalizeRole(t) || (qAlias ? normalizeRole(qAlias) : null);
    return (
      hay.includes(t) ||
      Boolean(qAlias && hay.includes(qAlias)) ||
      (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
      Boolean(qAlias && bare(qAlias).length >= 2 && bare(hay).includes(bare(qAlias))) ||
      (!!t && resolvePlayerSlug(t) === pSlug) ||
      Boolean(qAlias && resolvePlayerSlug(qAlias) === pSlug) ||
      Boolean(rTeamSlug && canonTeam === rTeamSlug) ||
      Boolean(rOppSlug && canonTeam === rOppSlug) ||
      Boolean(r.r && qRoleTerm && qRoleTerm === normalizeRole(r.r)) ||
      Boolean(r.en && (matchesPeriodEvent(prettySlug(r.en), r.en, t) || (qAlias ? matchesPeriodEvent(prettySlug(r.en), r.en, qAlias) : false))) ||
      Boolean((r.it || []).some((it) => matchesItemSearch(it, itemName(it), t) || Boolean(qAlias && matchesItemSearch(it, itemName(it), qAlias)))) ||
      Boolean(r.ks && (normText(runeName(r.ks)).includes(t) || normText(r.ks).includes(t) || Boolean(qAlias && normText(runeName(r.ks)).includes(qAlias)))) ||
      Boolean((r.sp || []).some((sp) => normText(spellName(sp)).includes(t) || normText(sp).includes(t) || Boolean(qAlias && normText(spellName(sp)).includes(qAlias))))
    );
  };
  const candidateTerms = useMemo(() => {
    const raw = [
      qParams.get("player"),
      qParams.get("vsplayer"),
      qParams.get("team"),
      qParams.get("vsteam"),
      qVsTeam,
      qParams.get("event"),
      ...(qParams.get("q") || "").split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i),
    ]
      .map((x) => normText(x || ""))
      .filter(Boolean);
    return [...new Set(raw)];
  }, [query, qVsTeam]); // eslint-disable-line react-hooks/exhaustive-deps
  const playerMatchesAll = useMemo(
    () => candidateTerms.filter((t) => c.players.some((p) => matchesChampPlayerRow(p, t))),
    [candidateTerms, c.players, teamByPlayer, aliases.data], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const playerMatches12 = useMemo(
    () => candidateTerms.filter((t) => recentPlayersList.some((p) => matchesChampPlayerRow(p, t))),
    [candidateTerms, recentPlayersList, teamByPlayer, aliases.data], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const resolveInitialPlayersRecent = () => {
    if (qSpan === "12m") return true;
    if (qSpan === "all") return false;
    if (candidateTerms.length > 0 && playerMatchesAll.length === 0 && playerMatches12.length > 0) return true;
    return false;
  };
  const [playersRecent, setPlayersRecent] = useState(resolveInitialPlayersRecent);
  const validPlayerSearch = useMemo(
    () => (playersRecent ? playerMatches12 : playerMatchesAll).join(", "),
    [playersRecent, playerMatches12, playerMatchesAll],
  );
  const [playerSearch, setPlayerSearch] = useState(validPlayerSearch);
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
  const usedIn = (r: (typeof c.recent)[number]) =>
    (!buildRole || !r.r || r.r === buildRole) &&
    (!usedOnly ||
      (usedOnly.kind === "item"
        ? (r.it || []).includes(usedOnly.v)
        : usedOnly.kind === "key"
          ? r.ks === usedOnly.v
          : [...(r.sp || [])].sort().join(" + ") === usedOnly.v.split(" + ").sort().join(" + ")));
  const validRecentSearch = useMemo(() => {
    if (!candidateTerms.length) return "";
    const pool = c.recent.filter(usedIn);
    const matching = candidateTerms.filter((t) => pool.some((r) => matchesChampRecentGame(r, t)));
    return matching.join(", ");
  }, [candidateTerms, c.recent, buildRole, usedOnly, aliases.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [recentSearch, setRecentSearch] = useState(validRecentSearch);
  useEffect(() => {
    setMuSearch(validMuSearch);
  }, [validMuSearch]);
  useEffect(() => {
    setDuoSearch(validDuoSearch);
  }, [validDuoSearch]);
  useEffect(() => {
    setPlayerSearch(validPlayerSearch);
  }, [validPlayerSearch]);
  useEffect(() => {
    setRecentSearch(validRecentSearch);
  }, [validRecentSearch]);
  useEffect(() => {
    if (qRole && roleKeys.includes(qRole)) setMuRole(qRole);
    else if (!qRole && roleKeys[0]) setMuRole(roleKeys[0]);
    if (qRole && buildRoles.includes(qRole)) setBuildRole(qRole);
    else if (!qRole) setBuildRole("");
    setMuRecent(resolveInitialMuRecent());
    setPlayersRecent(resolveInitialPlayersRecent());
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
  const pickUsed = (kind: "item" | "key" | "spells", v: string) => {
    setUsed((u) => (u && u.kind === kind && u.v === v ? null : { kind, v }));
    window.setTimeout(() => document.getElementById("champ-latest")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };
  const usedName = usedOnly ? (usedOnly.kind === "item" ? itemName(usedOnly.v) : usedOnly.kind === "key" ? runeName(usedOnly.v) : usedOnly.v.split(" + ").map(spellName).join(" + ")) : "";
  const pickRow = (on: boolean) =>
    `flex items-center gap-2 min-w-0 w-full text-left rounded px-1 -mx-1 hover:bg-rw-raised ${on ? "ring-1 ring-rw-accent bg-rw-accent/10" : ""}`;
  const maxPatch = Math.max(1, ...(c.patches || []).map((p) => (p.pr ?? p.pk + p.b) / Math.max(p.g, 1)));
  const heroRole = qRole || c.roles[0]?.r || "";
  const vsHeroSlug = qVs ? resolveChampSlug(qVs) : muRows[0]?.[0] ? resolveChampSlug(muRows[0][0]) : "";
  const heroChamps = [c.u, vsHeroSlug].filter((x, i, a) => x && a.indexOf(x) === i).join(",");
  const qPlayerSlug = qParams.get("player") ? resolvePlayerSlug(prettySlug(qParams.get("player")!)) : "";
  const qVsPlayerSlug = qParams.get("vsplayer") ? resolvePlayerSlug(prettySlug(qParams.get("vsplayer")!)) : "";
  const qTeamSlug = qParams.get("team") ? teamSlug(qParams.get("team")!) : "";
  const qVsTeamSlug = qVsTeam ? teamSlug(qVsTeam) : "";
  const topPlayerSlugs = [
    ...new Set(
      [
        qPlayerSlug,
        qVsPlayerSlug,
        ...[...c.players, ...c.recent].map((p) => p.u || (p.n ? resolvePlayerSlug(p.n) : "")),
      ].filter(Boolean),
    ),
  ].slice(0, 2);
  const topPlayerSlug = topPlayerSlugs[0] || "";
  const vsPlayerSlug = topPlayerSlugs[1] || "";
  const topPlayersQuery = topPlayerSlugs.join(",");
  const heroTeamSlugs = [
    ...new Set(
      [
        qTeamSlug,
        qVsTeamSlug,
        c.recent[0]?.team ? teamSlug(c.recent[0].team) : "",
        c.recent[0]?.opp ? teamSlug(c.recent[0].opp) : "",
        ...c.recent.slice(1, 5).flatMap((r) => [r.team ? teamSlug(r.team) : "", r.opp ? teamSlug(r.opp) : ""]),
        ...c.players.slice(0, 4).map((p) => {
          const t = teamByPlayer.get(p.u || p.n);
          return t ? teamSlug(t) : "";
        }),
      ].filter(Boolean),
    ),
  ].slice(0, 2);
  const heroTeam0 = heroTeamSlugs[0] || "";
  const heroTeam1 = heroTeamSlugs[1] || "";
  const heroTeamsQuery = heroTeamSlugs.join(",");
  const heroLeadersQuery = [...new Set([...topPlayerSlugs, ...heroTeamSlugs])].join(",");
  const heroPeriodQuery = `${qLeague ? `&league=${encodeURIComponent(qLeague)}` : ""}${
    qEvent
      ? `&event=${encodeURIComponent(qEvent)}`
      : qPatch
        ? `&patch=${encodeURIComponent(qPatch)}`
        : qYear
          ? `&year=${encodeURIComponent(qYear)}`
          : ""
  }`;
  const heroFinderExtra = `${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${
    heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""
  }${topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""}${
    vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""
  }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
    heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""
  }${heroPeriodQuery}`;
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
                      to={{
                        kind: "finder",
                        query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}&role=${encodeURIComponent(r.r)}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                          heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                        }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
                      }}
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
              {heroTeam0 && (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: heroTeam0,
                      ...(heroTeam1 ? { b: heroTeam1 } : {}),
                      ...(qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Match prep")}
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: heroTeam0,
                      ...(heroTeam1 ? { b: heroTeam1 } : {}),
                      ...(qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                    }}
                    className={heroBtn()}
                  >
                    {tl("Compare")}
                  </HubLink>
                </>
              )}
              <CountersLink
                slug={c.u}
                vs={vsHeroSlug || undefined}
                role={heroRole || undefined}
                player={topPlayerSlug || undefined}
                team={heroTeam0 || undefined}
                vsteam={heroTeam1 || undefined}
                patch={qPatch}
                year={qYear}
                event={qEvent}
                className={heroBtn(true)}
              />
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(qLeague ? { league: qLeague } : {}),
                    ...(qEvent ? { event: qEvent } : qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                    ...(heroRole ? { role: heroRole } : {}),
                    q: heroChamps,
                  }).toString(),
                }}
                className={heroBtn()}
              >
                {tl("Pro tier list")}
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}${
                    topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                  }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                    heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                  }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
                }}
                className={heroBtn()}
              >
                {tl("Game finder")}
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}${
                    topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                  }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                    heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                  }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
                }}
                className={heroBtn()}
              >
                {tl("Item history")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    ...(heroTeamsQuery ? { teams: heroTeamsQuery } : {}),
                    champ: heroChamps,
                    ...(heroRole ? { role: heroRole } : {}),
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
                    ...(heroRole ? { role: heroRole } : {}),
                    ...(qLeague ? { league: qLeague } : {}),
                    ...(qEvent ? { event: qEvent } : qYear ? { year: qYear } : {}),
                    ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                  }).toString(),
                }}
                className={heroBtn()}
              >
                {tl("Player leaderboards")}
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...(qLeague || heroLeadersQuery
                    ? {
                        query: new URLSearchParams({
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                        }).toString(),
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
              to: { kind: "finder", query: `champ=${encodeURIComponent(cSlug)}${heroFinderExtra}` },
            },
            {
              label: tl("Bans"),
              value: fmtNum(c.b),
              bar: c.p + c.b > 0 ? { pct: Math.round((c.b / (c.p + c.b)) * 100), tone: "red" } : undefined,
              to: {
                kind: "finder",
                query: `ban=${encodeURIComponent(cSlug)}${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                  heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""
                }${heroPeriodQuery}`,
              },
            },
            {
              label: tl("Win %"),
              value: winRate(c.w, c.p),
              bar: c.p > 0 ? { pct: Math.round((c.w / c.p) * 100), tone: c.w / c.p >= 0.5 ? "teal" : "red" } : undefined,
              to: { kind: "finder", query: `champ=${encodeURIComponent(cSlug)}&result=w${heroFinderExtra}` },
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
                  to: { kind: "finder", query: `champ=${encodeURIComponent(cSlug)}&side=b${heroFinderExtra}` },
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
              {heroTeam0 && (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: heroTeam0,
                      ...(heroTeam1 ? { b: heroTeam1 } : {}),
                      ...(qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: heroTeam0,
                      ...(heroTeam1 ? { b: heroTeam1 } : {}),
                      ...(qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                </>
              )}
              <HubLink
                to={{
                  kind: "items",
                  query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${
                    usedOnly?.kind === "item"
                      ? `&item=${encodeURIComponent(resolveItemSlug(usedOnly.v))}`
                      : items[0]
                        ? `&item=${encodeURIComponent(resolveItemSlug(items[0][0]))}`
                        : ""
                  }${buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""}${
                    topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                  }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                    heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                  }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "counters",
                  query: `champ=${encodeURIComponent(c.u)}${vsHeroSlug && vsHeroSlug !== c.u ? `&vs=${encodeURIComponent(vsHeroSlug)}` : ""}${
                    topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                  }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                    heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                  }${buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""}${
                    qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""
                  }`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(qLeague ? { league: qLeague } : {}),
                    ...(qEvent ? { event: qEvent } : qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                    ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                    q: heroChamps,
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
                    ...(heroTeamsQuery ? { teams: heroTeamsQuery } : {}),
                    champ: heroChamps,
                    ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                    ...(qEvent ? { p: `e:${qEvent}` } : qPatch ? { p: `p:${qPatch}` } : qYear ? { p: `y${qYear}` } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${
                    buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""
                  }${topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""}${
                    vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""
                  }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                    heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""
                  }${heroPeriodQuery}`,
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
                    ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                    ...(qLeague ? { league: qLeague } : {}),
                    ...(qEvent ? { event: qEvent } : qYear ? { year: qYear } : {}),
                    ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...(qLeague || heroLeadersQuery
                    ? {
                        query: new URLSearchParams({
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                        }).toString(),
                      }
                    : {}),
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
              to={{
                kind: "items",
                query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${
                  usedOnly?.kind === "item"
                    ? `&item=${encodeURIComponent(resolveItemSlug(usedOnly.v))}`
                    : items[0]
                      ? `&item=${encodeURIComponent(resolveItemSlug(items[0][0]))}`
                      : ""
                }${buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""}${
                  topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                  heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
              }}
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
                  ...(vsHeroSlug && vsHeroSlug !== cSlug ? { vschamp: vsHeroSlug } : {}),
                  ...(usedOnly?.kind === "item" ? { item: resolveItemSlug(usedOnly.v) } : items[0] ? { item: resolveItemSlug(items[0][0]) } : {}),
                  ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                  ...(topPlayerSlug ? { player: topPlayerSlug } : {}),
                  ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
                  ...(heroTeam0 ? { team: heroTeam0 } : {}),
                  ...(heroTeam1 ? { vs: heroTeam1 } : {}),
                  ...(qLeague ? { league: qLeague } : {}),
                  ...(qEvent ? { event: qEvent } : qPatch ? { patch: qPatch } : qYear ? { year: qYear } : {}),
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
                const hitSlug = hit ? resolveChampSlug(hit[0]) : muRows[0]?.[0] ? resolveChampSlug(muRows[0][0]) : "";
                return (
                  <>
                    {heroTeam0 && (
                      <>
                        <HubLink
                          to={{
                            kind: "prep",
                            a: heroTeam0,
                            ...(heroTeam1 ? { b: heroTeam1 } : {}),
                            ...(qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Match prep")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "compare",
                            mode: "team",
                            a: heroTeam0,
                            ...(heroTeam1 ? { b: heroTeam1 } : {}),
                            ...(qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Compare")} →
                        </HubLink>
                      </>
                    )}
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(c.u)}${hitSlug ? `&vs=${encodeURIComponent(hitSlug)}` : ""}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                          heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                        }${muRole ? `&role=${encodeURIComponent(muRole)}` : ""}${
                          qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""
                        }`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Counter-pick finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: `champ=${encodeURIComponent(c.u)}${hitSlug ? `&vschamp=${encodeURIComponent(hitSlug)}` : ""}${muRole ? `&role=${encodeURIComponent(muRole)}` : ""}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                          heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                        }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(qEvent ? { event: qEvent } : qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                          ...(muRole ? { role: muRole } : {}),
                          q: hitSlug ? `${c.u},${hitSlug}` : c.u,
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
                          ...(heroTeamsQuery ? { teams: heroTeamsQuery } : {}),
                          champ: hitSlug ? `${c.u},${hitSlug}` : c.u,
                          ...(muRole ? { role: muRole } : {}),
                          ...(qEvent ? { p: `e:${qEvent}` } : qPatch ? { p: `p:${qPatch}` } : qYear ? { p: `y${qYear}` } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `champ=${encodeURIComponent(cSlug)}${hitSlug ? `&vschamp=${encodeURIComponent(hitSlug)}` : ""}${muRole ? `&role=${encodeURIComponent(muRole)}` : ""}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                          heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                        }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
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
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(qEvent ? { event: qEvent } : qYear ? { year: qYear } : {}),
                          ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        ...(qLeague || heroLeadersQuery
                          ? {
                              query: new URLSearchParams({
                                ...(qLeague ? { league: qLeague } : {}),
                                ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                              }).toString(),
                            }
                          : {}),
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
                  query: `champ=${encodeURIComponent(c.u)}${vsHeroSlug && vsHeroSlug !== c.u ? `&vs=${encodeURIComponent(vsHeroSlug)}` : ""}${
                    topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                  }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                    heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                  }&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
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
                      <ChampLink
                        name={oc}
                        size={18}
                        query={new URLSearchParams({
                          vs: cSlug,
                          vschamp: cSlug,
                          ...(muRole ? { role: muRole } : {}),
                          ...(topPlayerSlug ? { player: topPlayerSlug } : {}),
                          ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
                          ...(heroTeam0 ? { team: heroTeam0 } : {}),
                          ...(heroTeam1 ? { vsteam: heroTeam1 } : {}),
                          ...(muRecent ? { span: "12m" } : {}),
                          ...(qEvent ? { event: qEvent, p: `e:${qEvent}` } : qPatch ? { patch: qPatch, p: `p:${qPatch}` } : qYear ? { year: qYear, p: `y${qYear}` } : {}),
                        }).toString()}
                      />
                      <HubLink
                        to={{
                          kind: "counters",
                          query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}${
                            topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                          }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                            heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                          }&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
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
                      <ChampLink
                        name={oc}
                        size={16}
                        query={new URLSearchParams({
                          vs: cSlug,
                          vschamp: cSlug,
                          ...(muRole ? { role: muRole } : {}),
                          ...(topPlayerSlug ? { player: topPlayerSlug } : {}),
                          ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
                          ...(heroTeam0 ? { team: heroTeam0 } : {}),
                          ...(heroTeam1 ? { vsteam: heroTeam1 } : {}),
                          ...(muRecent ? { span: "12m" } : {}),
                          ...(qEvent ? { event: qEvent, p: `e:${qEvent}` } : qPatch ? { patch: qPatch, p: `p:${qPatch}` } : qYear ? { year: qYear, p: `y${qYear}` } : {}),
                        }).toString()}
                      />
                    </td>
                    <td className={`${td} text-rw-sub`} data-sort={g}>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                          <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((g / maxMuG) * 100))}%` }} />
                        </span>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `champ=${encodeURIComponent(cSlug)}&vschamp=${encodeURIComponent(resolveChampSlug(oc))}${muRole ? `&role=${encodeURIComponent(muRole)}` : ""}${
                              topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                            }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                              heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                            }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
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
                          query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                          heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                        }&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
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
                                query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                          heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                        }&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
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
                                query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                          heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                        }&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
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
                                query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                          heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                        }&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
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
                                query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(oc))}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                          heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                        }&role=${encodeURIComponent(muRole)}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
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
                    {heroTeam0 && (
                      <>
                        <HubLink
                          to={{
                            kind: "prep",
                            a: heroTeam0,
                            ...(heroTeam1 ? { b: heroTeam1 } : {}),
                            ...(qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Match prep")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "compare",
                            mode: "team",
                            a: heroTeam0,
                            ...(heroTeam1 ? { b: heroTeam1 } : {}),
                            ...(qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Compare")} →
                        </HubLink>
                      </>
                    )}
                    {topDuo && (
                      <HubLink
                        to={{
                          kind: "counters",
                          query: `champ=${encodeURIComponent(c.u)}&vs=${encodeURIComponent(resolveChampSlug(topDuo[0]))}${
                            topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                          }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                            heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""
                          }&role=Bot${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Counters")} →
                      </HubLink>
                    )}
                    <HubLink
                      to={{
                        kind: "items",
                        query: `champ=${encodeURIComponent(cSlug)}${topDuo ? `&vschamp=${encodeURIComponent(resolveChampSlug(topDuo[0]))}` : ""}&role=Bot${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                          heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                        }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `${
                          heroTeamsQuery
                            ? `teams=${heroTeamSlugs.map(encodeURIComponent).join(",")}&`
                            : ""
                        }champ=${encodeURIComponent(topDuo ? `${c.u},${resolveChampSlug(topDuo[0])}` : c.u)}&role=Bot${qEvent ? `&p=e:${encodeURIComponent(qEvent)}` : qPatch ? `&p=p:${encodeURIComponent(qPatch)}` : qYear ? `&p=y${encodeURIComponent(qYear)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          role: "Bot",
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(qEvent ? { event: qEvent } : qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
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
                        query: `champ=${encodeURIComponent(topDuo ? `${cSlug},${resolveChampSlug(topDuo[0])}` : cSlug)}&role=Bot${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                          heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                        }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
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
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(qEvent ? { event: qEvent } : qYear ? { year: qYear } : {}),
                          ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        ...(qLeague || heroLeadersQuery
                          ? {
                              query: new URLSearchParams({
                                ...(qLeague ? { league: qLeague } : {}),
                                ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                              }).toString(),
                            }
                          : {}),
                      }}
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
                      <ChampLink
                        name={pc}
                        size={16}
                        query={
                          new URLSearchParams({
                            vs: cSlug,
                            vschamp: cSlug,
                            role: "Bot",
                            ...(topPlayerSlug ? { player: topPlayerSlug } : {}),
                            ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
                            ...(heroTeam0 ? { team: heroTeam0 } : {}),
                            ...(heroTeam1 ? { vsteam: heroTeam1 } : {}),
                            ...(qEvent ? { event: qEvent, p: `e:${qEvent}` } : qPatch ? { patch: qPatch, p: `p:${qPatch}` } : qYear ? { year: qYear, p: `y${qYear}` } : {}),
                          }).toString() || undefined
                        }
                      />
                    </td>
                    <td className={`${td} text-rw-sub`} data-sort={g}>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                          <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((g / maxDuoG) * 100))}%` }} />
                        </span>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `champ=${encodeURIComponent(`${cSlug},${resolveChampSlug(pc)}`)}&role=Bot${
                              topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                            }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                              heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                            }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
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
                          query: `champ=${encodeURIComponent(`${cSlug},${resolveChampSlug(pc)}`)}&role=Bot${
                            topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                          }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                            heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                          }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
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
              const pSlugs = [
                ...new Set(
                  [...pList, ...allPlayers]
                    .map((p) => p.u || (p.n ? resolvePlayerSlug(p.n) : ""))
                    .filter(Boolean),
                ),
              ].slice(0, 2);
              const tSlugs = [
                ...new Set(
                  [
                    ...pList.map((p) => {
                      const t = teamByPlayer.get(p.u || p.n);
                      return t ? teamSlug(t) : "";
                    }),
                    heroTeam0,
                    heroTeam1,
                  ].filter(Boolean),
                ),
              ].slice(0, 2);
              const t0 = tSlugs[0] || "";
              const t1 = tSlugs[1] || "";
              return (
                <>
                  {t0 && (
                    <>
                      <HubLink
                        to={{
                          kind: "prep",
                          a: t0,
                          ...(t1 ? { b: t1 } : {}),
                          ...(playersRecent ? { period: "12m" } : qEvent ? { period: `e:${qEvent}` } : qPatch ? { period: `p:${qPatch}` } : qYear ? { period: `y${qYear}` } : {}),
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Match prep")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "draft",
                          query: `teams=${encodeURIComponent(t0)}${t1 ? `,${encodeURIComponent(t1)}` : ""}&champ=${encodeURIComponent(heroChamps)}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}${playersRecent ? "&p=12m" : qEvent ? `&p=e:${encodeURIComponent(qEvent)}` : qPatch ? `&p=p:${encodeURIComponent(qPatch)}` : qYear ? `&p=y${encodeURIComponent(qYear)}` : ""}`,
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Draft board")} →
                      </HubLink>
                    </>
                  )}
                  <HubLink
                    to={{
                      kind: "counters",
                      query: `champ=${encodeURIComponent(c.u)}${vsHeroSlug && vsHeroSlug !== c.u ? `&vs=${encodeURIComponent(vsHeroSlug)}` : ""}${
                        c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""
                      }${pSlugs[0] ? `&player=${encodeURIComponent(pSlugs[0])}` : ""}${t0 ? `&team=${encodeURIComponent(t0)}` : ""}${t1 ? `&vsteam=${encodeURIComponent(t1)}` : ""}${!playersRecent && qEvent ? `&event=${encodeURIComponent(qEvent)}` : !playersRecent && qPatch ? `&patch=${encodeURIComponent(qPatch)}` : !playersRecent && qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                  {pSlugs[0] && (
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "player",
                        a: pSlugs[0],
                        ...(pSlugs[1] ? { b: pSlugs[1] } : {}),
                        period: playersRecent ? "12m" : qEvent ? `e:${qEvent}` : qPatch ? `p:${qPatch}` : qYear ? `y${qYear}` : undefined,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                  )}
                  {pSlugs[0] && (
                    <HubLink
                      to={{
                        kind: "items",
                        query: `player=${encodeURIComponent(pSlugs[0])}${
                          pSlugs[1] ? `&vsplayer=${encodeURIComponent(pSlugs[1])}` : ""
                        }${t0 ? `&team=${encodeURIComponent(t0)}` : ""}${
                          t1 ? `&vs=${encodeURIComponent(t1)}` : ""
                        }${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}&champ=${encodeURIComponent(cSlug)}${
                          vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""
                        }${!playersRecent ? heroPeriodQuery : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                  )}
                  {pSlugs[0] && (
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `player=${encodeURIComponent(pSlugs[0])}${
                          pSlugs[1] ? `&vsplayer=${encodeURIComponent(pSlugs[1])}` : ""
                        }${t0 ? `&team=${encodeURIComponent(t0)}` : ""}${
                          t1 ? `&vs=${encodeURIComponent(t1)}` : ""
                        }${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}&champ=${encodeURIComponent(cSlug)}${
                          vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""
                        }${!playersRecent ? heroPeriodQuery : ""}`,
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
                        ...(!playersRecent && qLeague ? { league: qLeague } : {}),
                        ...(!playersRecent && qEvent ? { event: qEvent } : !playersRecent && qYear ? { year: qYear } : {}),
                        ...(pSlugs.length || tSlugs.length ? { q: [...new Set([...pSlugs, ...tSlugs])].join(",") } : {}),
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
                        ...(!playersRecent && qLeague ? { league: qLeague } : {}),
                        ...(!playersRecent && qEvent
                          ? { event: qEvent }
                          : !playersRecent && qPatch
                            ? { key: `p${qPatch}`, patch: qPatch }
                            : !playersRecent && qYear
                              ? { key: `y${qYear}`, year: qYear }
                              : {}),
                        ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                        q: heroChamps,
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      ...(qLeague || tSlugs.length || pSlugs.length
                        ? {
                            query: new URLSearchParams({
                              ...(qLeague ? { league: qLeague } : {}),
                              ...(tSlugs.length || pSlugs.length ? { q: [...new Set([...tSlugs, ...pSlugs])].join(",") } : {}),
                            }).toString(),
                          }
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
                const pSlugVal = p.u || resolvePlayerSlug(p.n);
                const pTeam = teamByPlayer.get(p.u || p.n);
                const pTeamSlugVal = pTeam ? teamSlug(pTeam) : "";
                const pOppSlug = heroTeam1 && heroTeam1 !== pTeamSlugVal ? heroTeam1 : heroTeam0 && heroTeam0 !== pTeamSlugVal ? heroTeam0 : "";
                const pOppPlayerSlug = vsPlayerSlug && vsPlayerSlug !== pSlugVal ? vsPlayerSlug : topPlayerSlug && topPlayerSlug !== pSlugVal ? topPlayerSlug : "";
                const pRowQ = [pOppSlug, pOppPlayerSlug].filter(Boolean).join(",");
                const pPeriodQ = playersRecent
                  ? "p=12m"
                  : qEvent
                    ? `p=e:${encodeURIComponent(qEvent)}`
                    : qPatch
                      ? `p=p:${encodeURIComponent(qPatch)}`
                      : qYear
                        ? `p=y${encodeURIComponent(qYear)}`
                        : "";
                const pTabQuery = `champ=${encodeURIComponent(cSlug)}${pTeamSlugVal ? `&team=${encodeURIComponent(pTeamSlugVal)}` : ""}${pRowQ ? `&q=${encodeURIComponent(pRowQ)}` : ""}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}${pPeriodQ ? `&${pPeriodQ}` : ""}`;
                const pRowTo = p.u
                  ? ({ kind: "player", slug: p.u, tab: "champions", query: pTabQuery } as const)
                  : ({
                      kind: "finder",
                      query: `player=${encodeURIComponent(pSlugVal)}${pOppPlayerSlug ? `&vsplayer=${encodeURIComponent(pOppPlayerSlug)}` : ""}${pTeamSlugVal ? `&team=${encodeURIComponent(pTeamSlugVal)}` : ""}${pOppSlug ? `&vs=${encodeURIComponent(pOppSlug)}` : ""}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}&champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${!playersRecent ? heroPeriodQuery : ""}`,
                    } as const);
                return (
                <tr key={p.n + p.u} className="border-t border-rw-border">
                  <td className={td} data-sort={p.n}>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <HubLink
                        to={{
                          kind: "player",
                          slug: pSlugVal,
                          query: pTabQuery,
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
                            slug: pTeamSlugVal,
                            query: `champ=${encodeURIComponent(cSlug)}&player=${encodeURIComponent(pSlugVal)}&q=${encodeURIComponent([pSlugVal, pOppSlug].filter(Boolean).join(","))}${pPeriodQ ? `&${pPeriodQ}` : ""}`,
                          }}
                          className="shrink-0 hover:opacity-80"
                          title={pTeam}
                        >
                          <TeamLogo name={pTeam} size={13} />
                        </HubLink>
                      )}
                      <PlayerLink name={p.n} u={p.u} query={pTabQuery} />
                    </span>
                  </td>
                  <td className={`${td} text-rw-sub`} data-sort={p.g}>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
                        <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((p.g / maxPG) * 100))}%` }} />
                      </span>
                      <HubLink
                        to={pRowTo}
                        className="hover:text-rw-accent hover:underline"
                        title={tl("Game finder")}
                      >
                        {p.g}
                      </HubLink>
                    </span>
                  </td>
                  <td className={td} data-sort={p.g ? p.w / p.g : 0}>
                    <HubLink
                      to={pRowTo}
                      className="hover:opacity-90"
                      title={tl("Game finder")}
                    >
                      <WinBar w={p.w} g={p.g} />
                    </HubLink>
                  </td>
                  <td className={td} data-sort={p.kda}>
                    <HubLink
                      to={pRowTo}
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
                const rList = c.recent.filter((r) => {
                  if (!usedIn(r)) return false;
                  if (!rTerms.length) return true;
                  return rTerms.some((t) => matchesChampRecentGame(r, t));
                });
                const r0 = rList[0];
                const r0Year = /^\d{4}$/.test((r0?.date || "").slice(0, 4)) ? (r0!.date || "").slice(0, 4) : "";
                const rPlayers = [
                  ...new Set(
                    [...rList.map((r) => r.u || resolvePlayerSlug(r.n)), ...topPlayerSlugs].filter(Boolean),
                  ),
                ].slice(0, 2);
                const rTeams = [
                  ...new Set(
                    [
                      r0?.team ? teamSlug(r0.team) : "",
                      r0?.opp ? teamSlug(r0.opp) : "",
                      ...rList.slice(1, 5).flatMap((r) => [r.team ? teamSlug(r.team) : "", r.opp ? teamSlug(r.opp) : ""]),
                      heroTeam0,
                      heroTeam1,
                    ].filter(Boolean),
                  ),
                ].slice(0, 2);
                const rt0 = rTeams[0] || "";
                const rt1 = rTeams[1] || "";
                return (
                  <>
                    {rt0 ? (
                      <>
                        <HubLink
                          to={{
                            kind: "prep",
                            a: rt0,
                            ...(rt1 ? { b: rt1 } : {}),
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
                            a: rt0,
                            ...(rt1 ? { b: rt1 } : {}),
                            ...(r0Year ? { period: `y${r0Year}` } : {}),
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Compare")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "draft",
                            query: `teams=${rTeams.map(encodeURIComponent).join(",")}&champ=${encodeURIComponent(heroChamps)}${buildRole || heroRole ? `&role=${encodeURIComponent(buildRole || heroRole)}` : ""}${r0Year ? `&p=y${encodeURIComponent(r0Year)}` : ""}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Draft board")} →
                        </HubLink>
                      </>
                    ) : (
                      <HubLink
                        to={{
                          kind: "draft",
                          query: `champ=${encodeURIComponent(heroChamps)}${buildRole || heroRole ? `&role=${encodeURIComponent(buildRole || heroRole)}` : ""}${r0Year ? `&p=y${encodeURIComponent(r0Year)}` : ""}`,
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Draft board")} →
                      </HubLink>
                    )}
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(c.u)}${vsHeroSlug && vsHeroSlug !== c.u ? `&vs=${encodeURIComponent(vsHeroSlug)}` : ""}${
                          buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""
                        }${rPlayers[0] ? `&player=${encodeURIComponent(rPlayers[0])}` : ""}${rt0 ? `&team=${encodeURIComponent(rt0)}` : ""}${rt1 ? `&vsteam=${encodeURIComponent(rt1)}` : ""}${r0Year ? `&patch=y${encodeURIComponent(r0Year)}&year=${encodeURIComponent(r0Year)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: new URLSearchParams({
                          champ: cSlug,
                          ...(vsHeroSlug && vsHeroSlug !== cSlug ? { vschamp: vsHeroSlug } : {}),
                          ...(usedOnly?.kind === "item" ? { item: resolveItemSlug(usedOnly.v) } : {}),
                          ...(rPlayers[0] ? { player: rPlayers[0] } : {}),
                          ...(rPlayers[1] ? { vsplayer: rPlayers[1] } : {}),
                          ...(rt0 ? { team: rt0 } : {}),
                          ...(rt1 ? { vs: rt1 } : {}),
                          ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(r0Year ? { year: r0Year } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(r0Year ? { key: `y${r0Year}`, year: r0Year } : {}),
                          ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                          q: heroChamps,
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
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(r0Year ? { year: r0Year } : {}),
                          ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                          ...(rPlayers.length || rTeams.length ? { q: [...new Set([...rPlayers, ...rTeams])].join(",") } : {}),
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
                          ...(vsHeroSlug && vsHeroSlug !== cSlug ? { vschamp: vsHeroSlug } : {}),
                          ...(rPlayers[0] ? { player: rPlayers[0] } : {}),
                          ...(rPlayers[1] ? { vsplayer: rPlayers[1] } : {}),
                          ...(rt0 ? { team: rt0 } : {}),
                          ...(rt1 ? { vs: rt1 } : {}),
                          ...(buildRole || c.roles[0]?.r ? { role: buildRole || c.roles[0].r } : {}),
                          ...(qLeague ? { league: qLeague } : {}),
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
                        ...(qLeague || rTeams.length || rPlayers.length
                          ? {
                              query: new URLSearchParams({
                                ...(qLeague ? { league: qLeague } : {}),
                                ...(rTeams.length || rPlayers.length ? { q: [...new Set([...rTeams, ...rPlayers])].join(",") } : {}),
                              }).toString(),
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
                        query: `champ=${encodeURIComponent(cSlug)}${r.team ? `&team=${encodeURIComponent(teamSlug(r.team))}` : ""}${r.opp ? `&q=${encodeURIComponent(teamSlug(r.opp))}` : ""}${r.r ? `&role=${encodeURIComponent(r.r)}` : ""}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&p=y${(r.date || "").slice(0, 4)}` : ""}`,
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
                          query: `champ=${encodeURIComponent(cSlug)}&player=${encodeURIComponent(r.u || resolvePlayerSlug(r.n))}&q=${encodeURIComponent([r.u || resolvePlayerSlug(r.n), r.opp ? teamSlug(r.opp) : ""].filter(Boolean).join(","))}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&p=y${(r.date || "").slice(0, 4)}` : ""}`,
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
                      query={`champ=${encodeURIComponent(cSlug)}${r.team ? `&team=${encodeURIComponent(teamSlug(r.team))}` : ""}${r.opp ? `&q=${encodeURIComponent(teamSlug(r.opp))}` : ""}${r.r ? `&role=${encodeURIComponent(r.r)}` : ""}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&p=y${(r.date || "").slice(0, 4)}` : ""}`}
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
                        query: `champ=${encodeURIComponent(cSlug)}&q=${encodeURIComponent([r.team ? teamSlug(r.team) : "", r.u || resolvePlayerSlug(r.n)].filter(Boolean).join(","))}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&p=y${(r.date || "").slice(0, 4)}` : ""}`,
                      }}
                      className="shrink-0 hover:opacity-80"
                      title={r.opp}
                    >
                      <TeamLogo name={r.opp} size={14} />
                    </HubLink>
                    <TeamLink
                      name={r.opp}
                      query={`champ=${encodeURIComponent(cSlug)}&q=${encodeURIComponent([r.team ? teamSlug(r.team) : "", r.u || resolvePlayerSlug(r.n)].filter(Boolean).join(","))}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&p=y${(r.date || "").slice(0, 4)}` : ""}`}
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
                            query: `teams=${encodeURIComponent(teamSlug(r.team))},${encodeURIComponent(teamSlug(r.opp))}&champ=${encodeURIComponent(heroChamps)}${
                              buildRole || heroRole ? `&role=${encodeURIComponent(buildRole || heroRole)}` : ""
                            }${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&p=y${(r.date || "").slice(0, 4)}` : ""}`,
                          }}
                          className="hidden md:inline text-[10px] hover:text-rw-accent hover:underline"
                        >
                          {tl("Draft board")}
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "items",
                            query: `player=${encodeURIComponent(r.u || resolvePlayerSlug(r.n))}${vsPlayerSlug && vsPlayerSlug !== (r.u || resolvePlayerSlug(r.n)) ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}&team=${encodeURIComponent(teamSlug(r.team))}&vs=${encodeURIComponent(teamSlug(r.opp))}${
                              buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""
                            }&champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&year=${(r.date || "").slice(0, 4)}` : ""}`,
                          }}
                          className="hidden md:inline text-[10px] hover:text-rw-accent hover:underline"
                        >
                          {tl("Item history")}
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `player=${encodeURIComponent(r.u || resolvePlayerSlug(r.n))}${vsPlayerSlug && vsPlayerSlug !== (r.u || resolvePlayerSlug(r.n)) ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}&team=${encodeURIComponent(teamSlug(r.team))}&vs=${encodeURIComponent(teamSlug(r.opp))}${
                              buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""
                            }&champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&year=${(r.date || "").slice(0, 4)}` : ""}`,
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
                          query: `item=${encodeURIComponent(resolveItemSlug(it))}&player=${encodeURIComponent(r.u || resolvePlayerSlug(r.n))}${
                            vsPlayerSlug && vsPlayerSlug !== (r.u || resolvePlayerSlug(r.n)) ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""
                          }${
                            r.team ? `&team=${encodeURIComponent(teamSlug(r.team))}` : ""
                          }${r.opp ? `&vs=${encodeURIComponent(teamSlug(r.opp))}` : ""}${
                            buildRole || c.roles[0]?.r ? `&role=${encodeURIComponent(buildRole || c.roles[0].r)}` : ""
                          }&champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${/^\d{4}$/.test((r.date || "").slice(0, 4)) ? `&year=${(r.date || "").slice(0, 4)}` : ""}`,
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
                  <EventLink
                    name={r.en}
                    query={
                      new URLSearchParams({
                        q: [
                          r.u || resolvePlayerSlug(r.n),
                          r.team ? teamSlug(r.team) : "",
                          r.opp ? teamSlug(r.opp) : "",
                        ]
                          .filter(Boolean)
                          .join(","),
                        champ: cSlug,
                      }).toString() || undefined
                    }
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  />
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
                const rTeams = [
                  ...new Set(
                    [r0?.team ? teamSlug(r0.team) : "", r0?.opp ? teamSlug(r0.opp) : "", heroTeam0, heroTeam1].filter(Boolean),
                  ),
                ].slice(0, 2);
                return rTeams[0] ? (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: rTeams[0],
                        ...(rTeams[1] ? { b: rTeams[1] } : {}),
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
                        a: rTeams[0],
                        ...(rTeams[1] ? { b: rTeams[1] } : {}),
                        ...(r0Year ? { period: `y${r0Year}` } : {}),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${rTeams.map(encodeURIComponent).join(",")}&champ=${encodeURIComponent(heroChamps)}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}${r0Year ? `&p=y${encodeURIComponent(r0Year)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                  </>
                ) : (
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `champ=${encodeURIComponent(heroChamps)}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}${r0Year ? `&p=y${encodeURIComponent(r0Year)}` : ""}`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                );
              })()}
              <HubLink
                to={{
                  kind: "counters",
                  query: `champ=${encodeURIComponent(c.u)}${vsHeroSlug && vsHeroSlug !== c.u ? `&vs=${encodeURIComponent(vsHeroSlug)}` : ""}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""}${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""}${qEvent ? `&event=${encodeURIComponent(qEvent)}` : qPatch ? `&patch=${encodeURIComponent(qPatch)}` : qYear ? `&patch=y${encodeURIComponent(qYear)}&year=${encodeURIComponent(qYear)}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${
                    topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                  }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                    heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                  }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    ...(qLeague ? { league: qLeague } : {}),
                    ...(qEvent ? { event: qEvent } : qPatch ? { key: `p${qPatch}`, patch: qPatch } : qYear ? { key: `y${qYear}`, year: qYear } : {}),
                    ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                    q: heroChamps,
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${
                    topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                  }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                    heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                  }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${heroPeriodQuery}`,
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
                    ...(qLeague ? { league: qLeague } : {}),
                    ...(qEvent ? { event: qEvent } : qYear ? { year: qYear } : {}),
                    ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...(qLeague || heroLeadersQuery
                    ? {
                        query: new URLSearchParams({
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                        }).toString(),
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
                  to={{ kind: "finder", query: `champ=${encodeURIComponent(cSlug)}${side ? `&side=${side}` : ""}${heroFinderExtra}` }}
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
              {heroTeam0 && (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: heroTeam0,
                      ...(heroTeam1 ? { b: heroTeam1 } : {}),
                      ...(c.patches[0]?.p ? { period: `p:${c.patches[0].p}` } : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "team",
                      a: heroTeam0,
                      ...(heroTeam1 ? { b: heroTeam1 } : {}),
                      ...(c.patches[0]?.p ? { period: `p:${c.patches[0].p}` } : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                </>
              )}
              {(() => {
                const p0 = c.patches[0]?.p || "";
                const p0Yr = p0 && /^\d+\./.test(p0) ? String(2010 + Number(p0.split(".")[0])) : "";
                return (
                  <>
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(c.u)}${vsHeroSlug && vsHeroSlug !== c.u ? `&vs=${encodeURIComponent(vsHeroSlug)}` : ""}${
                          c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""
                        }${topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""}${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""}${p0 ? `&patch=${encodeURIComponent(p0)}` : ""}${p0Yr ? `&year=${encodeURIComponent(p0Yr)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                          heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                        }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${
                          qLeague ? `&league=${encodeURIComponent(qLeague)}` : ""
                        }${p0 ? `&patch=${encodeURIComponent(p0)}` : ""}${p0Yr ? `&year=${encodeURIComponent(p0Yr)}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(p0 ? { key: `p${p0}`, patch: p0 } : {}),
                          ...(p0Yr ? { year: p0Yr } : {}),
                          ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                          q: heroChamps,
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
                          ...(heroTeamsQuery ? { teams: heroTeamsQuery } : {}),
                          champ: heroChamps,
                          ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                          ...(p0 ? { p: `p:${p0}` } : {}),
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
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(p0 ? { key: `p${p0}`, patch: p0 } : {}),
                          ...(p0Yr ? { year: p0Yr } : {}),
                          ...(heroRole ? { role: heroRole } : {}),
                          q: heroChamps,
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Champions")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "patches", query: `q=${encodeURIComponent(heroChamps)}` }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Patches")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}${
                          topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                        }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                          heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                        }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${
                          qLeague ? `&league=${encodeURIComponent(qLeague)}` : ""
                        }${
                          p0 ? `&patch=${encodeURIComponent(p0)}` : ""
                        }${p0Yr ? `&year=${encodeURIComponent(p0Yr)}` : ""}`,
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
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(p0Yr ? { year: p0Yr } : {}),
                          ...(heroRole ? { role: heroRole } : {}),
                          ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                  </>
                );
              })()}
              <HubLink
                to={{
                  kind: "rankings",
                  ...(qLeague || heroLeadersQuery
                    ? {
                        query: new URLSearchParams({
                          ...(qLeague ? { league: qLeague } : {}),
                          ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
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
              const pYr = /^\d+\./.test(p.p) ? String(2010 + Number(p.p.split(".")[0])) : "";
              return (
                <div
                  key={p.p}
                  className={`grid grid-cols-[3.5rem_1fr_2.5rem_auto] items-center gap-2 text-xs rounded px-1 -mx-1 ${
                    qPatch && p.p === qPatch ? "bg-rw-accent/15 ring-1 ring-rw-accent/50" : ""
                  }`}
                >
                  <HubLink
                    to={{
                      kind: "champions",
                      query: `key=p${encodeURIComponent(p.p)}&patch=${encodeURIComponent(p.p)}${pYr ? `&year=${encodeURIComponent(pYr)}` : ""}${
                        heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""
                      }&q=${encodeURIComponent(heroChamps)}`,
                    }}
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
                    to={{
                      kind: "finder",
                      query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${
                        heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""
                      }${topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""}${
                        vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""
                      }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                        heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""
                      }&patch=${encodeURIComponent(p.p)}${pYr ? `&year=${encodeURIComponent(pYr)}` : ""}`,
                    }}
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
                  {heroTeam0 && (
                    <>
                      <HubLink
                        to={{
                          kind: "prep",
                          a: heroTeam0,
                          ...(heroTeam1 ? { b: heroTeam1 } : {}),
                          ...(latestY ? { period: `y${latestY}` } : {}),
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Match prep")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "compare",
                          mode: "team",
                          a: heroTeam0,
                          ...(heroTeam1 ? { b: heroTeam1 } : {}),
                          ...(latestY ? { period: `y${latestY}` } : {}),
                        }}
                        className="text-[11px] text-rw-accent hover:underline"
                      >
                        {tl("Compare")} →
                      </HubLink>
                    </>
                  )}
                  <HubLink
                    to={{ kind: "counters", query: `champ=${encodeURIComponent(c.u)}${vsHeroSlug && vsHeroSlug !== c.u ? `&vs=${encodeURIComponent(vsHeroSlug)}` : ""}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""}${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${heroTeam1 ? `&vsteam=${encodeURIComponent(heroTeam1)}` : ""}${latestY ? `&patch=y${encodeURIComponent(latestY)}&year=${encodeURIComponent(latestY)}` : ""}` }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "items",
                      query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${c.roles[0]?.r ? `&role=${encodeURIComponent(c.roles[0].r)}` : ""}${
                        topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                      }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                        heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                      }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${
                        qLeague ? `&league=${encodeURIComponent(qLeague)}` : ""
                      }${latestY ? `&year=${encodeURIComponent(latestY)}` : ""}`,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        ...(qLeague ? { league: qLeague } : {}),
                        ...(latestY ? { key: `y${latestY}`, year: latestY } : {}),
                        ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
                        q: heroChamps,
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
                        ...(heroTeamsQuery ? { teams: heroTeamsQuery } : {}),
                        champ: heroChamps,
                        ...(c.roles[0]?.r ? { role: c.roles[0].r } : {}),
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
                        ...(qLeague ? { league: qLeague } : {}),
                        ...(latestY ? { key: `y${latestY}`, year: latestY } : {}),
                        ...(heroRole ? { role: heroRole } : {}),
                        q: heroChamps,
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Champions")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}${
                        topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""
                      }${vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""}${
                        heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""
                      }${heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""}${
                        qLeague ? `&league=${encodeURIComponent(qLeague)}` : ""
                      }${
                        latestY ? `&year=${encodeURIComponent(latestY)}` : ""
                      }`,
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
                        ...(qLeague ? { league: qLeague } : {}),
                        ...(latestY ? { year: latestY } : {}),
                        ...(heroRole ? { role: heroRole } : {}),
                        ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      ...(qLeague || heroLeadersQuery
                        ? {
                            query: new URLSearchParams({
                              ...(qLeague ? { league: qLeague } : {}),
                              ...(heroLeadersQuery ? { q: heroLeadersQuery } : {}),
                            }).toString(),
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
                to={{
                  kind: "champions",
                  query: `key=y${encodeURIComponent(y.y)}&year=${encodeURIComponent(y.y)}${heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""}&q=${encodeURIComponent(heroChamps)}`,
                }}
                className="text-rw-text hover:text-rw-accent hover:underline font-semibold"
              >
                {y.y}
              </HubLink>
              <div className="h-3 bg-rw-bg rounded overflow-hidden flex" title={`${y.p} / ${y.b}`}>
                <div className="bg-rw-teal/70" style={{ width: `${(y.p / maxYear) * 100}%` }} />
                <div className="bg-rw-red/50" style={{ width: `${(y.b / maxYear) * 100}%` }} />
              </div>
              <HubLink
                to={{
                  kind: "finder",
                  query: `champ=${encodeURIComponent(cSlug)}${vsHeroSlug && vsHeroSlug !== cSlug ? `&vschamp=${encodeURIComponent(vsHeroSlug)}` : ""}${
                    heroRole ? `&role=${encodeURIComponent(heroRole)}` : ""
                  }${topPlayerSlug ? `&player=${encodeURIComponent(topPlayerSlug)}` : ""}${
                    vsPlayerSlug ? `&vsplayer=${encodeURIComponent(vsPlayerSlug)}` : ""
                  }${heroTeam0 ? `&team=${encodeURIComponent(heroTeam0)}` : ""}${
                    heroTeam1 ? `&vs=${encodeURIComponent(heroTeam1)}` : ""
                  }&year=${encodeURIComponent(y.y)}`,
                }}
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


