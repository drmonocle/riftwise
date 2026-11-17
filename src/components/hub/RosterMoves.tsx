/**
 * Roster moves and expiring contracts:
 * - RosterMoves: compact section embedded in the News view (recent club transfers since `since`).
 * - MovesPage (/stats/moves): full Stove League hub with Transfers and Expiring contracts tabs, league/role/expiry
 *   filters, recent form ratings, 16:9 broadcast card export, and shareable filtered URLs.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { tl, roleName } from "../../i18n";
import { bare, loadLeagues, loadMoves, normText, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias } from "../../hub/data";
import { normalizeRole } from "../../hub/champAgg";
import type { ExpiringContractRow, RosterMovesFile } from "../../hub/types";
import { currentHubRoute, navigateHub } from "../../hub/route";
import { searchAlias } from "../../searchAliases";
import { STable } from "../STable";
import { card, fmtDate, fmtNum, HubLink, hubShareUrl, Page, PlayerLink, PlayerPhoto, TeamLink, TeamLogo, td, th, useLoad, usePageTitle } from "./ui";
import { RatingBadge } from "./PlayerRating";
import { SectionCard } from "./BroadcastCard";

type MoveRow = RosterMovesFile["list"][number];
const STEP = 50;
const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
const sel = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-xs text-rw-text max-w-full";
const tabBtn = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${on ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`;

function parseTerms(raw: string): string[] {
  return raw
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((s) => normText(searchAlias(s.trim())))
    .filter(Boolean);
}

function matchesMoveTerm(m: MoveRow, t: string, leagueNames: Map<string, string>): boolean {
  const hay = normText(`${m.n} ${m.u} ${m.r || ""} ${m.r ? roleName(m.r) : ""} ${m.from.n} ${m.from.u} ${m.to.n} ${m.to.u} ${m.lu ? leagueNames.get(m.lu) || m.lu : ""}`);
  const hayBare = bare(hay);
  const fromCanon = resolveTeamAlias(m.from.u || m.from.n);
  const toCanon = resolveTeamAlias(m.to.u || m.to.n);
  const lgCanon = m.lu ? resolveLeagueSlug(m.lu) : "";
  const roleCanon = m.r ? normalizeRole(m.r) : null;
  if (hay.includes(t) || (t.length >= 2 && hayBare.includes(bare(t)))) return true;
  if (resolvePlayerSlug(t) === m.u) return true;
  const canonTeam = resolveTeamAlias(t);
  if (canonTeam && (canonTeam === fromCanon || canonTeam === toCanon)) return true;
  const canonLg = resolveLeagueSlug(t);
  if (lgCanon && canonLg && canonLg === lgCanon) return true;
  const canonRole = normalizeRole(t);
  if (roleCanon && canonRole && canonRole === roleCanon) return true;
  return false;
}

function matchesExpiringTerm(e: ExpiringContractRow, t: string, leagueNames: Map<string, string>): boolean {
  const hay = normText(`${e.n} ${e.u} ${e.r || ""} ${e.r ? roleName(e.r) : ""} ${e.t} ${e.tu || ""} ${e.lu ? leagueNames.get(e.lu) || e.lu : ""} ${e.ct}`);
  const hayBare = bare(hay);
  const teamCanon = resolveTeamAlias(e.tu || e.t);
  const lgCanon = e.lu ? resolveLeagueSlug(e.lu) : "";
  const roleCanon = e.r ? normalizeRole(e.r) : null;
  if (hay.includes(t) || (t.length >= 2 && hayBare.includes(bare(t)))) return true;
  if (resolvePlayerSlug(t) === e.u) return true;
  const canonTeam = resolveTeamAlias(t);
  if (canonTeam && teamCanon && canonTeam === teamCanon) return true;
  const canonLg = resolveLeagueSlug(t);
  if (lgCanon && canonLg && canonLg === lgCanon) return true;
  const canonRole = normalizeRole(t);
  if (roleCanon && canonRole && canonRole === roleCanon) return true;
  return false;
}

const isTopLeague = (lu: string | null | undefined, top: Set<string>): boolean => {
  if (!lu) return false;
  return top.has(lu) || top.has(resolveLeagueSlug(lu));
};

const MoveListItem: React.FC<{ m: MoveRow; idx: number; list: MoveRow[]; leagueNames: Map<string, string> }> = ({ m, idx, list, leagueNames }) => {
  const myr = m.d && /^\d{4}/.test(m.d) ? m.d.slice(0, 4) : "";
  const pQ = myr ? `p=y${encodeURIComponent(myr)}` : undefined;
  const pSlug = resolvePlayerSlug(m.u || m.n) || m.u;
  const fromSlug = resolveTeamAlias(m.from.u || m.from.n) || m.from.u;
  const toSlug = resolveTeamAlias(m.to.u || m.to.n) || m.to.u;
  const rivalMove = list.find((x, j) => j !== idx && (resolvePlayerSlug(x.u || x.n) || x.u) !== pSlug);
  const vsPlayerSlug = rivalMove ? resolvePlayerSlug(rivalMove.u || rivalMove.n) || rivalMove.u : "";
  const mRole = m.r ? normalizeRole(m.r) || m.r : "";
  const playerQ =
    new URLSearchParams({
      ...(myr ? { p: `y${myr}` } : {}),
      ...(toSlug ? { team: toSlug } : {}),
      ...(fromSlug && fromSlug !== toSlug ? { q: fromSlug } : {}),
      ...(mRole ? { role: mRole } : {}),
    }).toString() || undefined;
  const fromTeamQList = [toSlug && toSlug !== fromSlug ? toSlug : "", pSlug, vsPlayerSlug].filter(Boolean).join(",");
  const toTeamQList = [fromSlug && fromSlug !== toSlug ? fromSlug : "", pSlug, vsPlayerSlug].filter(Boolean).join(",");
  const fromTeamQ =
    new URLSearchParams({
      ...(myr ? { p: `y${myr}` } : {}),
      ...(fromTeamQList ? { q: fromTeamQList } : {}),
    }).toString() || undefined;
  const toTeamQ =
    new URLSearchParams({
      ...(myr ? { p: `y${myr}` } : {}),
      ...(toTeamQList ? { q: toTeamQList } : {}),
    }).toString() || undefined;

  return (
    <li className="py-1.5 border-b border-rw-border break-inside-avoid flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
      <HubLink
        to={{
          kind: "finder",
          query: new URLSearchParams({
            player: pSlug,
            ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
            team: toSlug,
            ...(fromSlug && fromSlug !== toSlug ? { vs: fromSlug } : {}),
            ...(mRole ? { role: mRole } : {}),
            ...(myr ? { year: myr } : {}),
            ...(m.lu ? { league: resolveLeagueSlug(m.lu) } : {}),
          }).toString(),
        }}
        className="text-rw-muted hover:text-rw-accent hover:underline tabular-nums w-20 shrink-0"
        title={tl("Game finder")}
      >
        {fmtDate(m.d, false)}
      </HubLink>
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <PlayerPhoto name={m.n} team={m.to.n} slug={pSlug} size={18} />
        <PlayerLink name={m.n} u={pSlug} query={playerQ} className="font-semibold text-rw-text hover:text-rw-accent" />
        {m.r && (
          <HubLink
            to={{ kind: "player", slug: pSlug, tab: "stats", ...(playerQ ? { query: playerQ } : {}) }}
            className="text-rw-muted hover:text-rw-accent hover:underline"
          >
            · {roleName(m.r)}
          </HubLink>
        )}
        {m.rt != null && <RatingBadge v={m.rt} />}
      </span>
      <span className="flex items-center gap-1.5 min-w-0 text-rw-sub">
        <span className="inline-flex items-center gap-1 min-w-0">
          <HubLink to={{ kind: "team", slug: fromSlug, ...(fromTeamQ ? { query: fromTeamQ } : {}) }} className="shrink-0">
            <TeamLogo name={m.from.n} sizeClass="w-3.5 h-3.5" />
          </HubLink>
          <TeamLink name={m.from.n} u={fromSlug} query={fromTeamQ} className="hover:text-rw-accent truncate" />
        </span>
        <HubLink
          to={{ kind: "compare", mode: "team", a: fromSlug, b: toSlug, ...(myr ? { period: `y${myr}` } : {}) }}
          className="text-rw-accent hover:opacity-80 shrink-0"
          title={tl("Compare")}
        >
          <ArrowRight className="w-3 h-3" />
        </HubLink>
        <span className="inline-flex items-center gap-1 min-w-0">
          <HubLink to={{ kind: "team", slug: toSlug, ...(toTeamQ ? { query: toTeamQ } : {}) }} className="shrink-0">
            <TeamLogo name={m.to.n} sizeClass="w-3.5 h-3.5" />
          </HubLink>
          <TeamLink name={m.to.n} u={toSlug} query={toTeamQ} className="text-rw-text hover:text-rw-accent truncate" />
        </span>
      </span>
      {m.lu && leagueNames.get(m.lu) && (
        <HubLink
          to={{
            kind: "league",
            slug: resolveLeagueSlug(m.lu),
            ...(myr ? { year: myr } : {}),
            query: `q=${encodeURIComponent([toSlug, fromSlug, pSlug].filter((s, i, a): s is string => Boolean(s) && a.indexOf(s) === i).join(","))}`,
          }}
          className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
        >
          {leagueNames.get(m.lu)}
        </HubLink>
      )}
      <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-[10px]">
        <HubLink to={{ kind: "prep", a: toSlug, b: fromSlug, ...(myr ? { period: `y${myr}` } : {}) }} className="text-rw-muted hover:text-rw-accent hover:underline">
          {tl("Match prep")}
        </HubLink>
        <HubLink
          to={{
            kind: "draft",
            query: `teams=${encodeURIComponent(toSlug)},${encodeURIComponent(fromSlug)}${pQ ? `&${pQ}` : ""}${mRole ? `&role=${encodeURIComponent(mRole)}` : ""}`,
          }}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        >
          {tl("Draft board")}
        </HubLink>
        <HubLink
          to={{
            kind: "counters",
            query: new URLSearchParams({
              player: pSlug,
              ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
              team: toSlug,
              ...(fromSlug && fromSlug !== toSlug ? { vsteam: fromSlug } : {}),
              ...(mRole ? { role: mRole } : {}),
              ...(m.lu ? { league: resolveLeagueSlug(m.lu) } : {}),
              ...(myr ? { patch: `y${myr}`, year: myr } : {}),
            }).toString(),
          }}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        >
          {tl("Counters")}
        </HubLink>
        <HubLink
          to={{
            kind: "items",
            query: new URLSearchParams({
              player: pSlug,
              ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
              team: toSlug,
              ...(fromSlug && fromSlug !== toSlug ? { vs: fromSlug } : {}),
              ...(m.lu ? { league: resolveLeagueSlug(m.lu) } : {}),
              ...(myr ? { year: myr } : {}),
              ...(mRole ? { role: mRole } : {}),
            }).toString(),
          }}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        >
          {tl("Item history")}
        </HubLink>
        <HubLink
          to={{
            kind: "leaders",
            query: new URLSearchParams({
              ...(m.lu ? { league: resolveLeagueSlug(m.lu) } : {}),
              ...(myr ? { year: myr } : {}),
              ...(mRole ? { role: mRole } : {}),
              q: [pSlug, vsPlayerSlug, toSlug, fromSlug].filter((s, i, a): s is string => Boolean(s) && a.indexOf(s) === i).join(","),
            }).toString(),
          }}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        >
          {tl("Leaderboards")}
        </HubLink>
      </span>
    </li>
  );
};

export const RosterMoves: React.FC = () => {
  const moves = useLoad(loadMoves, []);
  const leagues = useLoad(loadLeagues, []);
  const [all, setAll] = useState(false);
  const top = useMemo(() => new Set((leagues.data || []).filter((l) => l.pr).map((l) => l.u)), [leagues.data]);
  const name = useMemo(() => new Map((leagues.data || []).map((l) => [l.u, l.s || l.l])), [leagues.data]);
  const [shown, setShown] = useState(25);
  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;
  const rawUrlQ = useMemo(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("q") || p.get("player") || p.get("team") || p.get("vs") || "";
  }, [routeQuery]);
  const effectiveUrlQ = useMemo(() => {
    const rows = moves.data?.list || [];
    if (!rawUrlQ.trim() || !rows.length) return "";
    const rawTerms = parseTerms(rawUrlQ);
    const matchingTerms = rawTerms.filter((t) => rows.some((m) => matchesMoveTerm(m, t, name)));
    return matchingTerms.join(",");
  }, [rawUrlQ, moves.data, name]);
  const userTypedRef = useRef(false);
  const lastUrlQRef = useRef(rawUrlQ);
  const [search, setSearch] = useState(() => effectiveUrlQ);
  useEffect(() => {
    if (lastUrlQRef.current !== rawUrlQ) {
      lastUrlQRef.current = rawUrlQ;
      userTypedRef.current = false;
    }
    if (!userTypedRef.current) {
      setSearch(effectiveUrlQ);
    }
  }, [rawUrlQ, effectiveUrlQ]);
  if (!moves.data || !moves.data.list.length) return null;
  const terms = parseTerms(search);
  const list = moves.data.list.filter((m) => {
    if (!all && !terms.length && !isTopLeague(m.lu, top)) return false;
    if (terms.length && !terms.some((t) => matchesMoveTerm(m, t, name))) return false;
    return true;
  });
  const expiringCount = moves.data.expiring?.length || 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-rw-border">
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-2">
          <HubLink to={{ kind: "moves" }} className="hover:text-rw-accent hover:underline">
            {tl("Roster moves")}
          </HubLink>
          {expiringCount > 0 && (
            <HubLink to={{ kind: "moves", query: "tab=contracts" }} className="text-[11px] font-medium normal-case tracking-normal text-rw-accent hover:underline">
              {tl("Expiring contracts")} ({fmtNum(expiringCount)}) →
            </HubLink>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-[11px]" role="group" aria-label={tl("Leagues")}>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              userTypedRef.current = true;
              setSearch(e.target.value);
            }}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-40"
          />
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setAll(v)}
              aria-pressed={all === v}
              className={`px-2 py-0.5 rounded-full border ${all === v ? "border-rw-accent text-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
            >
              {v ? tl("All leagues") : tl("Top leagues")}
            </button>
          ))}
          {list.length > 0 && (() => {
            const yr0 = list[0]?.d && /^\d{4}/.test(list[0].d) ? list[0].d.slice(0, 4) : "";
            const lg0 = list[0]?.lu ? resolveLeagueSlug(list[0].lu) : "";
            const role0 = list[0]?.r ? normalizeRole(list[0].r) || list[0].r : "";
            const p0Slug = list[0] ? resolvePlayerSlug(list[0].u || list[0].n) || list[0].u : "";
            const p1Slug = list[1] ? resolvePlayerSlug(list[1].u || list[1].n) || list[1].u : "";
            const to0Slug = list[0] ? resolveTeamAlias(list[0].to.u || list[0].to.n) || list[0].to.u : "";
            const from0Slug = list[0] ? resolveTeamAlias(list[0].from.u || list[0].from.n) || list[0].from.u : "";
            const twoPlayers = Boolean(p0Slug && p1Slug && p0Slug !== p1Slug);
            return (
              <>
                <HubLink
                  to={{
                    kind: "players",
                    ...((role0 || p0Slug)
                      ? { query: new URLSearchParams({ ...(role0 ? { role: role0 } : {}), ...(p0Slug ? { q: twoPlayers ? `${p0Slug},${p1Slug}` : p0Slug } : {}) }).toString() }
                      : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Players")} →
                </HubLink>
                {to0Slug && (
                  <HubLink
                    to={{ kind: "prep", a: to0Slug, ...(from0Slug && from0Slug !== to0Slug ? { b: from0Slug } : {}), ...(yr0 ? { period: `y${yr0}` } : {}) }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "tiers",
                    ...((lg0 || yr0 || role0)
                      ? { query: new URLSearchParams({ ...(lg0 ? { scope: lg0, league: lg0 } : {}), ...(yr0 ? { key: `y${yr0}`, year: yr0 } : {}), ...(role0 ? { role: role0 } : {}) }).toString() }
                      : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <CopyMovesPost
                  title={tl("Roster moves")}
                  sub={all ? tl("All leagues") : tl("Top leagues")}
                  rows={list.slice(0, 6).map((m) => `${m.n}${m.r ? ` (${roleName(m.r)})` : ""}: ${m.from.n} → ${m.to.n} (${fmtDate(m.d, false)})`)}
                  shareUrl={hubShareUrl({ kind: "home" })}
                />
                <SectionCard
                  section={tl("Roster moves")}
                  name={all ? tl("All leagues") : tl("Top leagues")}
                  sub={fmtDate(moves.data.since)}
                  rows={() =>
                    list.slice(0, 12).map((m, idx) => ({
                      rank: idx + 1,
                      team: m.to.n,
                      label: `${m.n}${m.r ? ` (${roleName(m.r)})` : ""}`,
                      sub: `${m.from.n} → ${m.to.n}${m.lu && name.get(m.lu) ? ` · ${name.get(m.lu)}` : ""}`,
                      value: fmtDate(m.d, false),
                    }))
                  }
                />
              </>
            );
          })()}
        </div>
      </div>
      <p className="text-[11px] text-rw-muted">
        {tl("Players who started playing for a new club since {date}, newest first. A move shows once the player has played for the new club.", {
          date: fmtDate(moves.data.since),
        })}
      </p>
      <div className="@container">
        <ul className="text-xs @min-[64rem]:columns-2 gap-x-10">
          {list.slice(0, shown).map((m, idx) => (
            <MoveListItem key={`${m.u}-${m.d}`} m={m} idx={idx} list={list} leagueNames={name} />
          ))}
          {!list.length && <li className="py-2 text-rw-muted">{tl("No moves in the top leagues yet. See every league.")}</li>}
        </ul>
      </div>
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 50)} className="text-[11px] text-rw-accent hover:underline">
          {tl("Show {n} more", { n: Math.min(50, list.length - shown) })}
        </button>
      )}
    </div>
  );
};

// ── Full Stove League Hub (/stats/moves) ─────────────────────────────────

export const MovesPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Roster moves"));
  const moves = useLoad(loadMoves, []);
  const leagues = useLoad(loadLeagues, []);
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const tab = q.get("tab") === "contracts" ? "contracts" : "moves";
  const scope = q.get("scope") === "all" ? "all" : "top";
  const leagueFilter = q.get("league") || "";
  const roleFilter = normalizeRole(q.get("role") || "") || "";
  const yearFilter = q.get("year") || "";
  const urlQ = q.get("q") || "";
  const [search, setSearch] = useState(urlQ);
  const [shown, setShown] = useState(STEP);

  useEffect(() => {
    setSearch(urlQ);
  }, [urlQ]);
  useEffect(() => {
    setShown(STEP);
  }, [tab, scope, leagueFilter, roleFilter, yearFilter, search]);

  const setParam = (key: string, val: string | null) => {
    const next = new URLSearchParams(query || "");
    if (!val) next.delete(key);
    else next.set(key, val);
    const qs = next.toString();
    navigateHub({ kind: "moves", ...(qs ? { query: qs } : {}) }, { replace: true });
  };

  const top = useMemo(() => new Set((leagues.data || []).filter((l) => l.pr).map((l) => l.u)), [leagues.data]);
  const leagueNames = useMemo(() => new Map((leagues.data || []).map((l) => [l.u, l.s || l.l])), [leagues.data]);
  const leagueOptions = useMemo(() => {
    const slugs = new Set<string>();
    const rawRows = tab === "contracts" ? moves.data?.expiring || [] : moves.data?.list || [];
    for (const r of rawRows) {
      if (r.lu) slugs.add(resolveLeagueSlug(r.lu) || r.lu);
    }
    return [...slugs]
      .map((u) => [u, leagueNames.get(u) || u] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [moves.data, tab, leagueNames]);

  const expiryYears = useMemo(() => {
    const ys = new Set<string>();
    for (const e of moves.data?.expiring || []) {
      if (e.ct && /^\d{4}/.test(e.ct)) ys.add(e.ct.slice(0, 4));
    }
    return [...ys].sort();
  }, [moves.data?.expiring]);

  const terms = useMemo(() => parseTerms(search), [search]);

  const filteredMoves = useMemo(() => {
    const rows = moves.data?.list || [];
    return rows.filter((m) => {
      const canonicalLg = m.lu ? resolveLeagueSlug(m.lu) || m.lu : "";
      if (leagueFilter && canonicalLg !== leagueFilter && m.lu !== leagueFilter) return false;
      if (!leagueFilter && scope !== "all" && !terms.length && !isTopLeague(m.lu, top)) return false;
      if (roleFilter && normalizeRole(m.r || "") !== roleFilter) return false;
      if (terms.length && !terms.some((t) => matchesMoveTerm(m, t, leagueNames))) return false;
      return true;
    });
  }, [moves.data?.list, leagueFilter, scope, roleFilter, terms, top, leagueNames]);

  const filteredExpiring = useMemo(() => {
    const rows = moves.data?.expiring || [];
    return rows.filter((e) => {
      const canonicalLg = e.lu ? resolveLeagueSlug(e.lu) || e.lu : "";
      if (leagueFilter && canonicalLg !== leagueFilter && e.lu !== leagueFilter) return false;
      if (!leagueFilter && scope !== "all" && !terms.length && !isTopLeague(e.lu, top)) return false;
      if (roleFilter && normalizeRole(e.r || "") !== roleFilter) return false;
      if (yearFilter && !e.ct.startsWith(yearFilter)) return false;
      if (terms.length && !terms.some((t) => matchesExpiringTerm(e, t, leagueNames))) return false;
      return true;
    });
  }, [moves.data?.expiring, leagueFilter, scope, roleFilter, yearFilter, terms, top, leagueNames]);

  const curYear = String(new Date().getFullYear());
  const nextYear = String(Number(curYear) + 1);
  const shareUrl = hubShareUrl({ kind: "moves", ...(query ? { query } : {}) });
  const totalExpiring = moves.data?.expiring?.length || 0;
  const totalMoves = moves.data?.list.length || 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-head text-xl font-bold text-rw-text leading-tight">{tl("Roster moves")}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setParam("tab", null)} aria-pressed={tab === "moves"} className={tabBtn(tab === "moves")}>
            {tl("Transfers")}
            {totalMoves > 0 && <span className="ml-1.5 opacity-75 font-num">({fmtNum(totalMoves)})</span>}
          </button>
          <button
            type="button"
            onClick={() => setParam("tab", "contracts")}
            aria-pressed={tab === "contracts"}
            className={tabBtn(tab === "contracts")}
          >
            {tl("Expiring contracts")}
            {totalExpiring > 0 && <span className="ml-1.5 opacity-75 font-num">({fmtNum(totalExpiring)})</span>}
          </button>
        </div>
      </div>

      <Page state={moves}>
        {(data) => {
          const activeCount = tab === "contracts" ? filteredExpiring.length : filteredMoves.length;
          const activeTotal = tab === "contracts" ? data.expiring?.length || 0 : data.list.length;
          return (
            <div className="space-y-3">
              <div className={`${card} flex flex-wrap items-center gap-2`}>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => setParam("q", search.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setParam("q", search.trim() || null);
                  }}
                  placeholder={tl("Filter by name or team…")}
                  aria-label={tl("Filter by name or team…")}
                  className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1 text-xs text-rw-text placeholder-rw-muted flex-1 min-w-[11rem]"
                />
                <div className="inline-flex items-center gap-1" role="group" aria-label={tl("Leagues")}>
                  {([
                    ["top", tl("Top leagues")],
                    ["all", tl("All leagues")],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setParam("scope", v === "top" ? null : "all")}
                      aria-pressed={scope === v}
                      className={`px-2 py-1 rounded-lg border text-xs ${scope === v ? "border-rw-accent text-rw-accent bg-rw-accent/10 font-semibold" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {leagueOptions.length > 0 && (
                  <select
                    value={leagueFilter}
                    onChange={(e) => setParam("league", e.target.value || null)}
                    aria-label={tl("League")}
                    className={sel}
                  >
                    <option value="">{tl("Every league")}</option>
                    {leagueOptions.map(([u, label]) => (
                      <option key={u} value={u}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label={tl("Role")}>
                  <button
                    type="button"
                    onClick={() => setParam("role", null)}
                    aria-pressed={!roleFilter}
                    className={`px-2 py-1 rounded-lg border text-xs ${!roleFilter ? "border-rw-accent text-rw-accent bg-rw-accent/10 font-semibold" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
                  >
                    {tl("All roles")}
                  </button>
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setParam("role", roleFilter === r ? null : r)}
                      aria-pressed={roleFilter === r}
                      className={`px-2 py-1 rounded-lg border text-xs ${roleFilter === r ? "border-rw-accent text-rw-accent bg-rw-accent/10 font-semibold" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
                    >
                      {roleName(r)}
                    </button>
                  ))}
                </div>
                {tab === "contracts" && expiryYears.length > 0 && (
                  <select
                    value={yearFilter}
                    onChange={(e) => setParam("year", e.target.value || null)}
                    aria-label={tl("Contract")}
                    className={sel}
                  >
                    <option value="">{tl("Any year")}</option>
                    {expiryYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-rw-muted tabular-nums">
                    {tl("{shown} of {total}", { shown: fmtNum(activeCount), total: fmtNum(activeTotal) })}
                  </span>
                  {tab === "moves" && filteredMoves.length > 0 && (
                    <>
                      <CopyMovesPost
                        title={tl("Roster moves")}
                        sub={leagueFilter ? leagueNames.get(leagueFilter) || leagueFilter : scope === "all" ? tl("All leagues") : tl("Top leagues")}
                        rows={filteredMoves.slice(0, 8).map((m) => `${m.n}${m.r ? ` (${roleName(m.r)})` : ""}: ${m.from.n} → ${m.to.n} (${fmtDate(m.d, false)})`)}
                        shareUrl={shareUrl}
                      />
                      <SectionCard
                        section={tl("Roster moves")}
                        name={leagueFilter ? leagueNames.get(leagueFilter) || leagueFilter : scope === "all" ? tl("All leagues") : tl("Top leagues")}
                        sub={fmtDate(data.since)}
                        rows={() =>
                          filteredMoves.slice(0, 12).map((m, idx) => ({
                            rank: idx + 1,
                            team: m.to.n,
                            label: `${m.n}${m.r ? ` (${roleName(m.r)})` : ""}`,
                            sub: `${m.from.n} → ${m.to.n}${m.lu && leagueNames.get(m.lu) ? ` · ${leagueNames.get(m.lu)}` : ""}`,
                            value: m.rt != null ? `${m.rt.toFixed(1)} · ${fmtDate(m.d, false)}` : fmtDate(m.d, false),
                          }))
                        }
                      />
                    </>
                  )}
                  {tab === "contracts" && filteredExpiring.length > 0 && (
                    <>
                      <CopyMovesPost
                        title={tl("Expiring contracts")}
                        sub={yearFilter || `${curYear}–${nextYear}`}
                        rows={filteredExpiring.slice(0, 8).map((e) => `${e.n}${e.r ? ` (${roleName(e.r)})` : ""} · ${e.t} — ${fmtDate(e.ct)}`)}
                        shareUrl={shareUrl}
                      />
                      <SectionCard
                        section={tl("Expiring contracts")}
                        name={leagueFilter ? leagueNames.get(leagueFilter) || leagueFilter : scope === "all" ? tl("All leagues") : tl("Top leagues")}
                        sub={yearFilter || `${curYear}–${nextYear}`}
                        rows={() =>
                          filteredExpiring.slice(0, 12).map((e, idx) => ({
                            rank: idx + 1,
                            team: e.t,
                            label: `${e.n}${e.r ? ` (${roleName(e.r)})` : ""}`,
                            sub: `${e.t}${e.lu && leagueNames.get(e.lu) ? ` · ${leagueNames.get(e.lu)}` : ""}`,
                            value: fmtDate(e.ct, false),
                          }))
                        }
                      />
                    </>
                  )}
                </div>
              </div>

              {tab === "moves" ? (
                <div className={`${card} space-y-2`}>
                  <p className="text-[11px] text-rw-muted">
                    {tl("Players who started playing for a new club since {date}, newest first. A move shows once the player has played for the new club.", {
                      date: fmtDate(data.since),
                    })}
                  </p>
                  <div className="@container">
                    <ul className="text-xs @min-[64rem]:columns-2 gap-x-10">
                      {filteredMoves.slice(0, shown).map((m, idx) => (
                        <MoveListItem key={`${m.u}-${m.d}`} m={m} idx={idx} list={filteredMoves} leagueNames={leagueNames} />
                      ))}
                      {!filteredMoves.length && (
                        <li className="py-2 text-rw-muted">{tl("No moves in the top leagues yet. See every league.")}</li>
                      )}
                    </ul>
                  </div>
                  {filteredMoves.length > shown && (
                    <button type="button" onClick={() => setShown((n) => n + STEP)} className="text-xs text-rw-accent hover:underline font-semibold">
                      {tl("Show {n} more", { n: fmtNum(Math.min(STEP, filteredMoves.length - shown)) })}
                    </button>
                  )}
                </div>
              ) : (
                <div className={`${card} space-y-2`}>
                  <p className="text-[11px] text-rw-muted">
                    {tl("Active pro players whose listed Leaguepedia contract ends soonest, with recent form and games played.")}
                  </p>
                  {filteredExpiring.length > 0 ? (
                    <STable className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-rw-border">
                          <th className={th}>{tl("Player")}</th>
                          <th className={th}>{tl("Role")}</th>
                          <th className={th}>{tl("Team")}</th>
                          <th className={th}>{tl("League")}</th>
                          <th className={`${th} text-right`}>{tl("Rating")}</th>
                          <th className={`${th} text-right`}>{tl("Games")}</th>
                          <th className={th}>{tl("Contract")}</th>
                          <th className={th} aria-label={tl("Tools")} />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredExpiring.slice(0, shown).map((e) => {
                          const pSlug = resolvePlayerSlug(e.u || e.n) || e.u;
                          const tSlug = e.tu ? resolveTeamAlias(e.tu) || e.tu : resolveTeamAlias(e.t);
                          const soon = e.ct.slice(0, 4) <= curYear;
                          return (
                            <tr key={`${pSlug}-${e.ct}`} className="border-b border-rw-border/60 hover:bg-rw-bg/40">
                              <td className={td}>
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  <PlayerPhoto name={e.n} team={e.t} slug={pSlug} size={20} />
                                  <PlayerLink name={e.n} u={pSlug} className="font-semibold text-rw-text hover:text-rw-accent" />
                                </span>
                              </td>
                              <td className={`${td} text-rw-sub`}>{e.r ? roleName(e.r) : "–"}</td>
                              <td className={td}>
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  <TeamLogo name={e.t} size={15} />
                                  <TeamLink name={e.t} u={tSlug} className="text-rw-text hover:text-rw-accent" />
                                </span>
                              </td>
                              <td className={`${td} text-rw-muted`}>
                                {e.lu && leagueNames.get(e.lu) ? (
                                  <HubLink to={{ kind: "league", slug: resolveLeagueSlug(e.lu) }} className="hover:text-rw-accent hover:underline">
                                    {leagueNames.get(e.lu)}
                                  </HubLink>
                                ) : (
                                  "–"
                                )}
                              </td>
                              <td className={`${td} text-right`}>{e.rt != null ? <RatingBadge v={e.rt} /> : <span className="text-rw-muted">–</span>}</td>
                              <td className={`${td} text-right tabular-nums text-rw-sub`} title={tl("{n} career games", { n: fmtNum(e.g) })}>
                                {fmtNum(e.gy || e.g)}
                              </td>
                              <td className={td}>
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded border text-[11px] tabular-nums ${
                                    soon ? "border-rw-gold/40 bg-rw-gold/10 text-rw-gold font-semibold" : "border-rw-border text-rw-sub"
                                  }`}
                                  title={tl("Contract until {date}", { date: fmtDate(e.ct) })}
                                >
                                  {fmtDate(e.ct)}
                                </span>
                              </td>
                              <td className={td}>
                                <span className="inline-flex items-center gap-2 text-[11px] text-rw-muted">
                                  <HubLink to={{ kind: "compare", mode: "player", a: pSlug }} className="hover:text-rw-accent hover:underline">
                                    {tl("Compare")}
                                  </HubLink>
                                  <HubLink
                                    to={{
                                      kind: "leaders",
                                      query: new URLSearchParams({
                                        ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                                        ...(e.r ? { role: normalizeRole(e.r) || e.r } : {}),
                                        q: pSlug,
                                      }).toString(),
                                    }}
                                    className="hover:text-rw-accent hover:underline"
                                  >
                                    {tl("Leaderboards")}
                                  </HubLink>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </STable>
                  ) : (
                    <p className="text-xs text-rw-muted py-4">{tl("No expiring contracts match those filters.")}</p>
                  )}
                  {filteredExpiring.length > shown && (
                    <button type="button" onClick={() => setShown((n) => n + STEP)} className="text-xs text-rw-accent hover:underline font-semibold">
                      {tl("Show {n} more", { n: fmtNum(Math.min(STEP, filteredExpiring.length - shown)) })}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        }}
      </Page>
    </div>
  );
};

const CopyMovesPost: React.FC<{ title: string; sub: string; rows: string[]; shareUrl: string }> = ({ title, sub, rows, shareUrl }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [`${title} · ${sub}`];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push(shareUrl);
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
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
