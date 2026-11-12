/** gol.gg-style stat tables for one tournament: every player and every team, sortable by any column. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { tl, roleName } from "../../i18n";
import { bare, loadAliases, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
import { hubShareUrl } from "../../hub/route";
import { champName } from "../../champions";
import type { EventPlayer, EventTeamStats, HubEvent } from "../../hub/types";
import { ChampIcon, HubLink, OeCredit, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo, fmtNum, useLoad } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { Column, SortTable, per } from "./SortTable";
import { WinBar, KdaBar } from "./OpponentChart";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const tSlug = (name: string, u?: string | null) => u || resolveTeamAlias(name) || prettySlug(name);
const pSlug = (name: string, u?: string | null) => u || resolvePlayerSlug(name) || prettySlug(name);
const ROLE_ALIASES: Record<string, string> = {
  top: "Top",
  t: "Top",
  jungle: "Jungle",
  jg: "Jungle",
  jng: "Jungle",
  j: "Jungle",
  mid: "Mid",
  middle: "Mid",
  m: "Mid",
  bot: "Bot",
  bottom: "Bot",
  adc: "Bot",
  b: "Bot",
  support: "Support",
  sup: "Support",
  supp: "Support",
  s: "Support",
};
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);
const signed = (v: number | null) => (v == null ? "–" : <span className={v >= 0 ? "text-rw-teal" : "text-rw-red"}>{`${v > 0 ? "+" : ""}${fmtNum(v)}`}</span>);
const shareTone = (v: number | null, hi = 0.52, lo = 0.48) => {
  if (v == null) return "–";
  const c = v >= hi ? "text-rw-teal font-semibold" : v <= lo ? "text-rw-red" : "";
  return <span className={c}>{pct(v)}</span>;
};

/** Oracle's Elixir columns for the player table (leads over the lane opponent at 15, first blood). */
const playerEarlyCols = (wrap: (p: EventPlayer, node: React.ReactNode) => React.ReactNode): Column<EventPlayer>[] => [
  { key: "g15", label: "GD@15", title: tl("Gold lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? per(p.g15 || 0, p.tn, 0) : null), render: (p) => (p.tn ? wrap(p, signed(per(p.g15 || 0, p.tn, 0))) : "–") },
  { key: "c15", label: "CSD@15", title: tl("CS lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? per(p.c15 || 0, p.tn, 1) : null), render: (p) => (p.tn ? wrap(p, signed(per(p.c15 || 0, p.tn, 1))) : "–") },
  { key: "x15", label: "XPD@15", title: tl("XP lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? per(p.x15 || 0, p.tn, 0) : null), render: (p) => (p.tn ? wrap(p, signed(per(p.x15 || 0, p.tn, 0))) : "–") },
  { key: "fbp", label: tl("FB%"), title: tl("Took part in first blood (kill or assist)"), value: (p) => (p.fbn ? per(p.fbp || 0, p.fbn, 3) : null), render: (p) => (p.fbn ? wrap(p, shareTone(per(p.fbp || 0, p.fbn, 3), 0.3, 0.12)) : "–") },
];

/** Oracle's Elixir columns for the team table. */
const teamEarlyCols = (wrap: (t: EventTeamStats, node: React.ReactNode) => React.ReactNode): Column<EventTeamStats>[] => [
  { key: "g15", label: "GD@15", title: tl("Gold lead at 15 minutes"), value: (t) => (t.tn ? per(t.g15 || 0, t.tn, 0) : null), render: (t) => (t.tn ? wrap(t, signed(per(t.g15 || 0, t.tn, 0))) : "–") },
  { key: "fb", label: tl("FB%"), title: tl("First blood rate"), value: (t) => (t.fbn ? per(t.fb || 0, t.fbn, 3) : null), render: (t) => (t.fbn ? wrap(t, shareTone(per(t.fb || 0, t.fbn, 3))) : "–") },
  { key: "ft", label: tl("FT%"), title: tl("First tower rate"), value: (t) => (t.fbn ? per(t.ft || 0, t.fbn, 3) : null), render: (t) => (t.fbn ? wrap(t, shareTone(per(t.ft || 0, t.fbn, 3))) : "–") },
  { key: "pl", label: tl("Plates"), title: tl("Turret plates taken per game"), value: (t) => (t.pln ? per(t.pl || 0, t.pln, 1) : null), render: (t) => (t.pln ? wrap(t, per(t.pl || 0, t.pln, 1)) : "–") },
];

export const EventPlayerStats: React.FC<{ e: HubEvent; hidden?: boolean; initialSearch?: string; initialRole?: string }> = ({
  e,
  hidden,
  initialSearch = "",
  initialRole,
}) => {
  const players = hidden ? [] : e.players || [];
  const aliases = useLoad(loadAliases, []);
  const normInitRole = initialRole ? ROLE_ALIASES[initialRole.toLowerCase()] || initialRole : "";
  const validRole = normInitRole && ROLES.some((r) => r.toLowerCase() === normInitRole.toLowerCase())
    ? ROLES.find((r) => r.toLowerCase() === normInitRole.toLowerCase())!
    : "All";
  const [role, setRole] = useState(validRole);
  const matchEventPlayer = (p: EventPlayer, term: string) => {
    const qAlias = searchAlias(term);
    const hay = normText(`${p.n} ${p.u || ""} ${p.t} ${p.tu || ""} ${p.r || ""}`);
    const pTeamSlug = p.t ? resolveTeamAlias(aliases.data?.team[(p.tu || p.t).toLowerCase()] || p.tu || p.t) || prettySlug(p.t) : "";
    const canonTerm = resolveTeamAlias(aliases.data?.team[term] || term) || (qAlias ? resolveTeamAlias(aliases.data?.team[qAlias] || qAlias) : "") || prettySlug(qAlias || term);
    const termRole = ROLE_ALIASES[term] || (qAlias ? ROLE_ALIASES[qAlias] : "") || "";
    const ps = pSlug(p.n, p.u);
    return (
      hay.includes(term) ||
      Boolean(qAlias && hay.includes(qAlias)) ||
      (bare(term).length >= 2 && bare(hay).includes(bare(term))) ||
      Boolean(qAlias && bare(qAlias).length >= 2 && bare(hay).includes(bare(qAlias))) ||
      resolvePlayerSlug(term) === ps ||
      Boolean(qAlias && resolvePlayerSlug(qAlias) === ps) ||
      Boolean(pTeamSlug && canonTerm && canonTerm === pTeamSlug) ||
      Boolean(termRole && p.r === termRole) ||
      (p.c || []).some((c) => matchesChampSearch(c, term) || (qAlias ? matchesChampSearch(c, qAlias) : false))
    );
  };
  const effectiveInitialSearch = useMemo(() => {
    const terms = initialSearch
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s))
      .filter(Boolean);
    if (!terms.length || !players.length) return "";
    const matchingTerms = terms.filter((t) => players.some((p) => matchEventPlayer(p, t)));
    return matchingTerms.length === terms.length ? initialSearch : matchingTerms.join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch, players, aliases.data]);
  const [search, setSearch] = useState(effectiveInitialSearch);
  const userTyped = useRef(false);
  const lastInitial = useRef(initialSearch);
  useEffect(() => {
    setRole(validRole);
  }, [validRole]);
  useEffect(() => {
    if (lastInitial.current !== initialSearch) {
      lastInitial.current = initialSearch;
      userTyped.current = false;
    }
    if (!userTyped.current) setSearch(effectiveInitialSearch);
  }, [initialSearch, effectiveInitialSearch]);
  const maxG = Math.max(0, ...players.map((p) => p.g));
  const [regular, setRegular] = useState(true);
  const minG = Math.max(2, Math.ceil(maxG * 0.4));
  const rows = useMemo(() => {
    const terms = search
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s))
      .filter(Boolean);
    const matchRows = (useRole: string, useRegular: boolean, useTerms: string[]) =>
      players.filter(
        (p) =>
          (useRole === "All" || p.r === useRole) &&
          (!useRegular || p.g >= minG || maxG < 3) &&
          (!useTerms.length || useTerms.some((term) => matchEventPlayer(p, term))),
      );
    let res = matchRows(role, regular, terms);
    if (res.length === 0 && regular && terms.length > 0) res = matchRows(role, false, terms);
    if (res.length === 0 && role !== "All" && terms.length > 0) res = matchRows("All", false, terms);
    if (res.length === 0 && terms.length > 0 && search === effectiveInitialSearch) res = matchRows(role, regular, []);
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, role, regular, minG, maxG, search, effectiveInitialSearch, aliases.data]);
  if (players.length === 0) return null;
  const evYr = /^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? (e.start || e.end || "").slice(0, 4) : "";
  const evLg = e.lu ? resolveLeagueSlug(e.lu) : "";
  const pFinderQuery = (p: EventPlayer, champOverride?: string) => {
    const ps = pSlug(p.n, p.u);
    const pts = p.t ? tSlug(p.t, p.tu) : "";
    const rival =
      rows.find((x) => x.r === p.r && pSlug(x.n, x.u) !== ps) ||
      rows.find((x) => pSlug(x.n, x.u) !== ps) ||
      players.find((x) => x.r === p.r && pSlug(x.n, x.u) !== ps);
    const rivalSlug = rival ? pSlug(rival.n, rival.u) : "";
    const rivalTeamSlug = rival?.t && tSlug(rival.t, rival.tu) !== pts ? tSlug(rival.t, rival.tu) : "";
    return new URLSearchParams({
      event: e.u,
      ...(evLg ? { league: evLg } : {}),
      ...(evYr ? { year: evYr } : {}),
      player: ps,
      ...(rivalSlug ? { vsplayer: rivalSlug } : {}),
      ...(pts ? { team: pts } : {}),
      ...(rivalTeamSlug ? { vs: rivalTeamSlug } : {}),
      ...(p.r ? { role: p.r } : {}),
      ...(champOverride ? { champ: resolveChampSlug(champOverride) } : p.c?.[0] ? { champ: resolveChampSlug(p.c[0]) } : {}),
    }).toString();
  };
  const pPageQuery = (p: EventPlayer, opts?: { champ?: string; includeDefaultChamp?: boolean }) => {
    const ps = pSlug(p.n, p.u);
    const rival =
      rows.find((x) => x.r === p.r && pSlug(x.n, x.u) !== ps) ||
      rows.find((x) => pSlug(x.n, x.u) !== ps) ||
      players.find((x) => x.r === p.r && pSlug(x.n, x.u) !== ps);
    const rivalSlug = rival ? pSlug(rival.n, rival.u) : "";
    return new URLSearchParams({
      p: `e:${e.u}`,
      ...(p.r ? { role: p.r } : {}),
      ...(p.t ? { team: tSlug(p.t, p.tu) } : {}),
      ...(rivalSlug ? { q: rivalSlug } : {}),
      ...(opts?.champ
        ? { champ: resolveChampSlug(opts.champ) }
        : p.c?.[0]
          ? { champ: resolveChampSlug(p.c[0]) }
          : {}),
    }).toString();
  };
  const pStatLink = (p: EventPlayer, node: React.ReactNode) =>
    node == null || node === "–" ? (
      "–"
    ) : (
      <HubLink
        to={
          p.u
            ? { kind: "player", slug: p.u, tab: "stats", query: pPageQuery(p, { includeDefaultChamp: true }) }
            : { kind: "finder", query: pFinderQuery(p) }
        }
        className="hover:text-rw-accent hover:underline"
        title={tl("Stats")}
      >
        {node}
      </HubLink>
    );
  const cols: Column<EventPlayer>[] = [
    {
      key: "n",
      label: tl("Player"),
      value: (p) => p.n.toLowerCase(),
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <HubLink to={{ kind: "player", slug: pSlug(p.n, p.u), query: pPageQuery(p) }} className="shrink-0 hover:opacity-80" title={p.n}>
            <PlayerPhoto name={p.n} team={p.t} slug={p.u ?? undefined} size={18} />
          </HubLink>
          <PlayerLink name={p.n} u={p.u} query={pPageQuery(p)} />
        </span>
      ),
    },
    {
      key: "t",
      label: tl("Team"),
      value: (p) => p.t.toLowerCase(),
      render: (p) => {
        const ptQ = new URLSearchParams({
          p: `e:${e.u}`,
          q: pSlug(p.n, p.u),
          ...(p.c?.[0] ? { champ: resolveChampSlug(p.c[0]) } : {}),
        }).toString();
        return (
          <span className="inline-flex items-center gap-1.5 max-w-[9rem] truncate align-bottom">
            <HubLink to={{ kind: "team", slug: tSlug(p.t, p.tu), query: ptQ }} className="shrink-0 hover:opacity-80" title={p.t}>
              <TeamLogo name={p.t} size={14} />
            </HubLink>
            <TeamLink name={p.t} u={p.tu} query={ptQ} className="truncate" />
          </span>
        );
      },
    },
    {
      key: "r",
      label: tl("Role"),
      value: (p) => ROLES.indexOf(p.r),
      render: (p) => (
        <button
          type="button"
          onClick={() => setRole(role === p.r ? "All" : p.r)}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        >
          {roleName(p.r)}
        </button>
      ),
    },
    {
      key: "g",
      label: tl("Games"),
      value: (p) => p.g,
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
            <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(8, Math.round((p.g / Math.max(1, maxG)) * 100))}%` }} />
          </span>
          <HubLink
            to={{ kind: "finder", query: pFinderQuery(p) }}
            className="hover:text-rw-accent hover:underline"
          >
            {p.g}
          </HubLink>
        </span>
      ),
    },
    {
      key: "wr",
      label: tl("Win %"),
      value: (p) => per(p.w, p.g, 3),
      render: (p) => (
        <HubLink
          to={{ kind: "finder", query: pFinderQuery(p) }}
          className="hover:opacity-90"
          title={tl("Game finder")}
        >
          <WinBar w={p.w} g={p.g} />
        </HubLink>
      ),
    },
    {
      key: "kda",
      label: tl("KDA"),
      value: (p) => per(p.k + p.a, Math.max(p.d, 1), 2),
      render: (p) =>
        p.u ? (
          <HubLink
            to={{ kind: "player", slug: p.u, tab: "stats", query: pPageQuery(p, { includeDefaultChamp: true }) }}
            className="inline-flex hover:opacity-85"
            title={tl("Stats")}
          >
            <KdaBar kda={per(p.k + p.a, Math.max(p.d, 1), 2) ?? 0} />
          </HubLink>
        ) : (
          <KdaBar kda={per(p.k + p.a, Math.max(p.d, 1), 2) ?? 0} />
        ),
    },
    { key: "k", label: "K", title: tl("Kills per game"), value: (p) => per(p.k, p.g), render: (p) => pStatLink(p, per(p.k, p.g)) },
    { key: "d", label: "D", title: tl("Deaths per game"), value: (p) => per(p.d, p.g), render: (p) => pStatLink(p, per(p.d, p.g)) },
    { key: "a", label: "A", title: tl("Assists per game"), value: (p) => per(p.a, p.g), render: (p) => pStatLink(p, per(p.a, p.g)) },
    { key: "kp", label: "KP", title: tl("Kill participation"), value: (p) => per(p.k + p.a, p.tk, 3), render: (p) => (p.tk ? pStatLink(p, shareTone(per(p.k + p.a, p.tk, 3), 0.72, 0.58)) : "–") },
    { key: "csm", label: tl("CS/m"), title: tl("CS per minute"), value: (p) => per(p.cs, p.min), render: (p) => pStatLink(p, per(p.cs, p.min)) },
    { key: "gpm", label: tl("GPM"), title: tl("Gold per minute"), value: (p) => per(p.gold, p.min, 0), render: (p) => pStatLink(p, per(p.gold, p.min, 0)) },
    { key: "dpm", label: tl("DPM"), title: tl("Damage per minute"), value: (p) => (p.dmg ? per(p.dmg, p.dm ?? p.min, 0) : null), render: (p) => (p.dmg ? pStatLink(p, per(p.dmg, p.dm ?? p.min, 0)) : "–") },
    { key: "vpm", label: tl("VS/m"), title: tl("Vision score per minute"), value: (p) => per(p.vis, p.vmin, 2), render: (p) => pStatLink(p, per(p.vis, p.vmin, 2)) },
    { key: "dmgs", label: tl("DMG%"), title: tl("Share of the team's damage to champions"), value: (p) => (p.td ? per(p.sd || 0, p.td, 3) : null), render: (p) => (p.td ? pStatLink(p, shareTone(per(p.sd || 0, p.td, 3), 0.26, 0.1)) : "–") },
    { key: "golds", label: tl("Gold%"), title: tl("Share of the team's gold"), value: (p) => (p.tg ? per(p.sg || 0, p.tg, 3) : null), render: (p) => (p.tg ? pStatLink(p, pct(per(p.sg || 0, p.tg, 3))) : "–") },
    { key: "viss", label: tl("VS%"), title: tl("Share of the team's vision score"), value: (p) => (p.tv ? per(p.sv || 0, p.tv, 3) : null), render: (p) => (p.tv ? pStatLink(p, pct(per(p.sv || 0, p.tv, 3))) : "–") },
    {
      key: "nc",
      label: tl("Champions"),
      value: (p) => p.nc,
      render: (p) => (
        <span className="flex items-center gap-0.5">
          {p.c.map((c) => (
            <HubLink
              key={c}
              to={
                p.u
                  ? {
                      kind: "player",
                      slug: p.u,
                      tab: "champions",
                      query: pPageQuery(p, { champ: c }),
                    }
                  : { kind: "finder", query: pFinderQuery(p, c) }
              }
              className="hover:opacity-80"
              title={`${p.n} · ${champName(c)}`}
            >
              <ChampIcon name={c} size={16} />
            </HubLink>
          ))}
          {p.nc > p.c.length && (
            <HubLink
              to={
                p.u
                  ? {
                      kind: "player",
                      slug: p.u,
                      tab: "champions",
                      query: pPageQuery(p),
                    }
                  : { kind: "finder", query: pFinderQuery(p) }
              }
              className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline ml-0.5"
            >
              +{p.nc - p.c.length}
            </HubLink>
          )}
        </span>
      ),
    },
  ];
  if (players.some((p) => p.mvp))
    cols.splice(5, 0, {
      key: "mvp",
      label: tl("POG"),
      title: tl("Player of the Game awards"),
      value: (p) => p.mvp || 0,
      render: (p) =>
        p.mvp ? (
          <HubLink
            to={{ kind: "finder", query: pFinderQuery(p) }}
            className="hover:text-rw-accent hover:underline font-semibold"
          >
            {p.mvp}
          </HubLink>
        ) : (
          0
        ),
    });
  const early = players.some((p) => p.tn || p.fbn);
  if (early) cols.splice(cols.length - 1, 0, ...playerEarlyCols(pStatLink));
  const roleFallbackPlayers = rows[0] ? players.filter((p) => p.r === rows[0].r) : [];
  const topTeams = Array.from(
    new Set(
      [...rows, ...roleFallbackPlayers, ...players]
        .map((r) => (r.t ? tSlug(r.t, r.tu) : ""))
        .filter(Boolean),
    ),
  ).slice(0, 2);
  const topPlayers = Array.from(
    new Set(
      [...rows, ...roleFallbackPlayers, ...players]
        .map((r) => pSlug(r.n, r.u))
        .filter(Boolean),
    ),
  ).slice(0, 2);
  const topChamps = Array.from(
    new Set(
      [
        ...rows.flatMap((r) => (r.c || []).slice(0, 2)),
        ...roleFallbackPlayers.flatMap((r) => (r.c || []).slice(0, 2)),
        ...(e.champs || []).map((c) => c.c),
      ]
        .map((c) => resolveChampSlug(c))
        .filter(Boolean),
    ),
  ).slice(0, 2);
  const activeRole =
    role !== "All"
      ? role
      : rows.length >= 1 && rows.every((r) => r.r && r.r === rows[0].r)
        ? rows[0].r
        : "";
  return (
    <Section
      title={tl("Player stats")}
      share={`${e.u}-players`}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {topTeams[0] && (
            <HubLink
              to={{
                kind: "prep",
                a: topTeams[0],
                ...(topTeams[1] ? { b: topTeams[1] } : {}),
                period: `e:${e.u}`,
              }}
              className="text-[11px] text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Match prep")} →
            </HubLink>
          )}
          {topPlayers[0] && (
            <>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "player",
                  a: topPlayers[0],
                  ...(topPlayers[1] ? { b: topPlayers[1] } : {}),
                  period: `e:${e.u}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    player: topPlayers[0],
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    ...(topTeams[0] ? { team: topTeams[0] } : {}),
                    ...(topTeams[1] ? { vs: topTeams[1] } : {}),
                    ...(activeRole ? { role: activeRole } : rows[0]?.r ? { role: rows[0].r } : {}),
                    ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                    ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                    ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                    event: e.u,
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Item history")} →
              </HubLink>
              {topChamps[0] && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: topChamps[0],
                      ...(topChamps[1] ? { vs: topChamps[1] } : {}),
                      ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                      ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                      ...(topTeams[0] ? { team: topTeams[0] } : {}),
                      ...(topTeams[1] ? { vsteam: topTeams[1] } : {}),
                      ...(activeRole ? { role: activeRole } : {}),
                      ...(evLg ? { league: evLg } : {}),
                      event: e.u,
                      ...(evYr ? { patch: `y${evYr}`, year: evYr } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
            </>
          )}
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                ...((e.start || e.end || "").slice(0, 4) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                event: e.u,
                ...(activeRole ? { role: activeRole } : {}),
                ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                ...(topPlayers.length || topTeams.length ? { q: [...topPlayers, ...topTeams].filter(Boolean).join(",") } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Leaderboards")} →
          </HubLink>
          <HubLink
            to={{
              kind: "champions",
              query: new URLSearchParams({
                ...(e.lu ? { scope: resolveLeagueSlug(e.lu), league: resolveLeagueSlug(e.lu) } : {}),
                ...((e.start || e.end || "").slice(0, 4) ? { key: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) } : {}),
                event: e.u,
                ...(activeRole ? { role: activeRole } : {}),
                ...(topChamps.length ? { q: topChamps.join(",") } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Champions")} →
          </HubLink>
          <HubLink
            to={{
              kind: "tiers",
              query: new URLSearchParams({
                ...(e.lu ? { scope: resolveLeagueSlug(e.lu), league: resolveLeagueSlug(e.lu) } : {}),
                ...((e.start || e.end || "").slice(0, 4) ? { key: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) } : {}),
                event: e.u,
                ...(activeRole ? { role: activeRole } : {}),
                ...(topChamps.length ? { q: topChamps.join(",") } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink
            to={{
              kind: "draft",
              query: `${topTeams.length ? `teams=${topTeams.map(encodeURIComponent).join(",")}&` : ""}p=e:${encodeURIComponent(e.u)}${activeRole ? `&role=${encodeURIComponent(activeRole)}` : ""}${
                topChamps.length ? `&champ=${encodeURIComponent(topChamps.join(","))}` : ""
              }`,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Draft board")} →
          </HubLink>
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                event: e.u,
                ...(evLg ? { league: evLg } : {}),
                ...(evYr ? { year: evYr } : {}),
                ...(activeRole ? { role: activeRole } : rows[0]?.r ? { role: rows[0].r } : {}),
                ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                ...(topTeams[0] ? { team: topTeams[0] } : {}),
                ...(topTeams[1] ? { vs: topTeams[1] } : {}),
                ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Game finder")} →
          </HubLink>
          <HubLink
            to={{
              kind: "rankings",
              query:
                new URLSearchParams({
                  ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                  ...(topTeams.length || topPlayers.length
                    ? { q: [...topTeams, ...topPlayers].filter(Boolean).join(",") }
                    : {}),
                }).toString() || undefined,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Power rankings")} →
          </HubLink>
          <CopyEventTablePost
            title={`${tl("Player stats")} · ${e.n} (${role === "All" ? tl("All roles") : roleName(role)})`}
            rows={[...rows]
              .sort((a, b) => (per(b.k + b.a, Math.max(b.d, 1), 2) || 0) - (per(a.k + a.a, Math.max(a.d, 1), 2) || 0))
              .slice(0, 6)
              .map((p, idx) => `#${idx + 1} ${p.n} (${p.t}, ${roleName(p.r)}): ${per(p.k + p.a, Math.max(p.d, 1), 2) ?? "–"} KDA · ${pct(per(p.w, p.g, 3))}`)}
            url={hubShareUrl({
              kind: "event",
              slug: e.u,
              tab: "stats",
              query:
                new URLSearchParams({
                  ...(role !== "All" ? { role } : {}),
                  ...(search.trim() ? { q: search.trim() } : {}),
                }).toString() || undefined,
            })}
          />
          <SectionCard
            section={tl("Player stats")}
            sub={`${e.n} · ${role === "All" ? tl("All roles") : roleName(role)}`}
            name={`${e.u}-player-stats-${role}`}
            rows={() =>
              [...rows]
                .sort((a, b) => (per(b.k + b.a, Math.max(b.d, 1), 2) || 0) - (per(a.k + a.a, Math.max(a.d, 1), 2) || 0))
                .slice(0, 10)
                .map((p, idx) => ({
                  rank: idx + 1,
                  champ: p.c?.[0],
                  team: p.t,
                  label: p.n,
                  sub: `${p.t} · ${roleName(p.r)} · ${pct(per(p.w, p.g, 3))}`,
                  value: `${per(p.k + p.a, Math.max(p.d, 1), 2) ?? "–"} KDA`,
                  win: p.g >= 2 ? p.w / p.g >= 0.5 : undefined,
                }))
            }
          />
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {["All", ...ROLES].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`px-2 py-1 rounded border ${role === r ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
          >
            {r === "All" ? tl("All roles") : roleName(r)}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(ev) => {
            userTyped.current = true;
            setSearch(ev.target.value);
          }}
          placeholder={tl("Filter by name or team…")}
          aria-label={tl("Filter by name or team…")}
          className="bg-rw-bg border border-rw-border rounded px-2 py-1 text-[11px] text-rw-text w-40"
        />
        {(rows.length === 2 || (search.trim() && rows.length >= 2)) && (
          <>
            <HubLink
              to={{ kind: "compare", mode: "player", a: pSlug(rows[0].n, rows[0].u), b: pSlug(rows[1].n, rows[1].u), period: `e:${e.u}` }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Compare")} →
            </HubLink>
            {rows[0].t !== rows[1].t && (
              <>
                <HubLink
                  to={{ kind: "prep", a: tSlug(rows[0].t, rows[0].tu), b: tSlug(rows[1].t, rows[1].tu), period: `e:${e.u}` }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      teams: `${tSlug(rows[0].t, rows[0].tu)},${tSlug(rows[1].t, rows[1].tu)}`,
                      p: `e:${e.u}`,
                      ...(role !== "All" ? { role } : rows[0].r ? { role: rows[0].r } : {}),
                      ...(rows[0].c?.[0]
                        ? {
                            champ: [
                              resolveChampSlug(rows[0].c[0]),
                              rows[1].c?.[0] && rows[1].c[0] !== rows[0].c[0] ? resolveChampSlug(rows[1].c[0]) : "",
                            ]
                              .filter(Boolean)
                              .join(","),
                          }
                        : {}),
                    }).toString(),
                  }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Draft board")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{
                kind: "items",
                query: new URLSearchParams({
                  player: pSlug(rows[0].n, rows[0].u),
                  ...(pSlug(rows[1].n, rows[1].u) !== pSlug(rows[0].n, rows[0].u)
                    ? { vsplayer: pSlug(rows[1].n, rows[1].u) }
                    : {}),
                  event: e.u,
                  ...(rows[0].t ? { team: tSlug(rows[0].t, rows[0].tu) } : {}),
                  ...(rows[1].t && rows[1].t !== rows[0].t ? { vs: tSlug(rows[1].t, rows[1].tu) } : {}),
                  ...(rows[0].c?.[0] ? { champ: resolveChampSlug(rows[0].c[0]) } : {}),
                  ...(rows[1].c?.[0] && rows[1].c[0] !== rows[0].c?.[0]
                    ? { vschamp: resolveChampSlug(rows[1].c[0]) }
                    : topChamps[1] && topChamps[1] !== (rows[0].c?.[0] ? resolveChampSlug(rows[0].c[0]) : "")
                      ? { vschamp: topChamps[1] }
                      : {}),
                  ...(role !== "All" ? { role } : rows[0].r ? { role: rows[0].r } : {}),
                  ...(evLg ? { league: evLg } : {}),
                  ...(evYr ? { year: evYr } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Item history")} →
            </HubLink>
            {(rows[0].c?.[0] || topChamps[0]) && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: rows[0].c?.[0] ? resolveChampSlug(rows[0].c[0]) : topChamps[0],
                    ...(rows[1].c?.[0] && rows[1].c[0] !== rows[0].c?.[0]
                      ? { vs: resolveChampSlug(rows[1].c[0]) }
                      : topChamps[1]
                        ? { vs: topChamps[1] }
                        : {}),
                    player: pSlug(rows[0].n, rows[0].u),
                    ...(pSlug(rows[1].n, rows[1].u) !== pSlug(rows[0].n, rows[0].u)
                      ? { vsplayer: pSlug(rows[1].n, rows[1].u) }
                      : {}),
                    ...(rows[0].t ? { team: tSlug(rows[0].t, rows[0].tu) } : {}),
                    ...(rows[1].t && rows[1].t !== rows[0].t ? { vsteam: tSlug(rows[1].t, rows[1].tu) } : {}),
                    ...(role !== "All" ? { role } : rows[0].r ? { role: rows[0].r } : {}),
                    ...(evLg ? { league: evLg } : {}),
                    event: e.u,
                    ...(evYr ? { patch: `y${evYr}`, year: evYr } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  event: e.u,
                  ...(evLg ? { league: evLg } : {}),
                  ...(evYr ? { year: evYr } : {}),
                  player: pSlug(rows[0].n, rows[0].u),
                  ...(pSlug(rows[1].n, rows[1].u) !== pSlug(rows[0].n, rows[0].u)
                    ? { vsplayer: pSlug(rows[1].n, rows[1].u) }
                    : {}),
                  ...(rows[0].t ? { team: tSlug(rows[0].t, rows[0].tu) } : {}),
                  ...(rows[1].t && rows[1].t !== rows[0].t ? { vs: tSlug(rows[1].t, rows[1].tu) } : {}),
                  ...(rows[0].c?.[0] ? { champ: resolveChampSlug(rows[0].c[0]) } : {}),
                  ...(rows[1].c?.[0] && rows[1].c[0] !== rows[0].c?.[0] ? { vschamp: resolveChampSlug(rows[1].c[0]) } : {}),
                  ...(role !== "All" ? { role } : rows[0].r ? { role: rows[0].r } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Game finder")} →
            </HubLink>
          </>
        )}
        {search.trim() && rows.length === 1 && (
          <>
            <HubLink
              to={{
                kind: "compare",
                mode: "player",
                a: pSlug(rows[0].n, rows[0].u),
                ...(topPlayers[1] ? { b: topPlayers[1] } : {}),
                period: `e:${e.u}`,
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Compare")} →
            </HubLink>
            {rows[0].t && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: tSlug(rows[0].t, rows[0].tu),
                    ...(topTeams[1] ? { b: topTeams[1] } : {}),
                    period: `e:${e.u}`,
                  }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      teams: topTeams.join(","),
                      p: `e:${e.u}`,
                      ...(role !== "All" ? { role } : rows[0].r ? { role: rows[0].r } : {}),
                      ...(topChamps.length ? { champ: topChamps.join(",") } : {}),
                    }).toString(),
                  }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Draft board")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{
                kind: "items",
                query: new URLSearchParams({
                  player: pSlug(rows[0].n, rows[0].u),
                  ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                  event: e.u,
                  ...(evLg ? { league: evLg } : {}),
                  ...(evYr ? { year: evYr } : {}),
                  ...(rows[0].t ? { team: tSlug(rows[0].t, rows[0].tu) } : {}),
                  ...(topTeams[1] ? { vs: topTeams[1] } : {}),
                  ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                  ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                  ...(role !== "All" ? { role } : rows[0].r ? { role: rows[0].r } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Item history")} →
            </HubLink>
            {topChamps[0] && (
              <HubLink
                to={{
                  kind: "counters",
                  query: new URLSearchParams({
                    champ: topChamps[0],
                    ...(topChamps[1] ? { vs: topChamps[1] } : {}),
                    player: pSlug(rows[0].n, rows[0].u),
                    ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                    ...(rows[0].t ? { team: tSlug(rows[0].t, rows[0].tu) } : {}),
                    ...(topTeams[1] ? { vsteam: topTeams[1] } : {}),
                    ...(role !== "All" ? { role } : rows[0].r ? { role: rows[0].r } : {}),
                    ...(evLg ? { league: evLg } : {}),
                    event: e.u,
                    ...(evYr ? { patch: `y${evYr}`, year: evYr } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  event: e.u,
                  ...(evLg ? { league: evLg } : {}),
                  ...(evYr ? { year: evYr } : {}),
                  player: pSlug(rows[0].n, rows[0].u),
                  ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                  ...(rows[0].t ? { team: tSlug(rows[0].t, rows[0].tu) } : {}),
                  ...(topTeams[1] ? { vs: topTeams[1] } : {}),
                  ...(topChamps[0] ? { champ: topChamps[0] } : {}),
                  ...(topChamps[1] ? { vschamp: topChamps[1] } : {}),
                  ...(role !== "All" ? { role } : rows[0].r ? { role: rows[0].r } : {}),
                }).toString(),
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Game finder")} →
            </HubLink>
          </>
        )}
        {maxG >= 3 && (
          <label className="flex items-center gap-1 ml-auto text-rw-sub cursor-pointer">
            <input type="checkbox" checked={regular} onChange={(ev) => setRegular(ev.target.checked)} />
            {tl("Only players with {n}+ games", { n: minG })}
          </label>
        )}
      </div>
      <SortTable rows={rows} columns={cols} initial={{ key: "kda", desc: true }} rowKey={(p, i) => `${p.u || p.n}-${p.t}-${i}`} copyName={`${e.u}-players`} />
      <p className="text-[10px] text-rw-muted">{tl("Click a column to sort. K / D / A are per game; KP = kill participation.")}</p>
      {early && <OeCredit />}
    </Section>
  );
};

export const EventTeamStatsTable: React.FC<{ e: HubEvent; hidden?: boolean; initialSearch?: string }> = ({ e, hidden, initialSearch = "" }) => {
  const teams = e.teamStats || [];
  const aliases = useLoad(loadAliases, []);
  const teamPlayerTextBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of e.players || []) {
      const ts = p.t ? tSlug(p.t, p.tu) : "";
      if (!ts) continue;
      const prev = map.get(ts) || "";
      map.set(ts, `${prev} ${p.n} ${p.u || ""} ${pSlug(p.n, p.u)}`);
    }
    for (const r of e.rosters || []) {
      const ts = tSlug(r.t, r.u);
      if (!ts) continue;
      const prev = map.get(ts) || "";
      const pStr = r.p.map(([n, u]) => `${n} ${u || ""} ${pSlug(n, u)}`).join(" ");
      map.set(ts, `${prev} ${pStr}`);
    }
    return map;
  }, [e.players, e.rosters]);
  const matchEventTeamStats = (t: EventTeamStats, term: string) => {
    const ts = resolveTeamAlias(aliases.data?.team[(t.u || t.t).toLowerCase()] || t.u || t.t) || prettySlug(t.t);
    const hay = normText(`${t.t} ${t.u || ""} ${ts} ${teamPlayerTextBySlug.get(ts) || ""}`);
    const qAlias = searchAlias(term);
    if (hay.includes(term) || (bare(term).length >= 2 && bare(hay).includes(bare(term)))) return true;
    if (qAlias && (hay.includes(qAlias) || (bare(qAlias).length >= 2 && bare(hay).includes(bare(qAlias))))) return true;
    const canonTerm = resolveTeamAlias(aliases.data?.team[term] || term) || (qAlias ? resolveTeamAlias(aliases.data?.team[qAlias] || qAlias) : "") || prettySlug(qAlias || term);
    return Boolean(canonTerm && canonTerm === ts);
  };
  const effectiveInitialSearch = useMemo(() => {
    const terms = initialSearch
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s))
      .filter(Boolean);
    if (!terms.length || !teams.length) return "";
    const matchingTerms = terms.filter((term) => teams.some((t) => matchEventTeamStats(t, term)));
    return matchingTerms.length === terms.length ? initialSearch : matchingTerms.join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch, teams, aliases.data, teamPlayerTextBySlug]);
  const [search, setSearch] = useState(effectiveInitialSearch);
  const userTyped = useRef(false);
  const lastInitial = useRef(initialSearch);
  useEffect(() => {
    if (lastInitial.current !== initialSearch) {
      lastInitial.current = initialSearch;
      userTyped.current = false;
    }
    if (!userTyped.current) setSearch(effectiveInitialSearch);
  }, [initialSearch, effectiveInitialSearch]);
  const rows = useMemo(() => {
    const terms = search
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s))
      .filter(Boolean);
    return !terms.length
      ? teams
      : teams.filter((t) => terms.some((term) => matchEventTeamStats(t, term)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, search, aliases.data, teamPlayerTextBySlug]);
  if (teams.length === 0 || hidden) return null;
  const maxTeamG = Math.max(1, ...teams.map((t) => t.g));
  const evYr = /^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? (e.start || e.end || "").slice(0, 4) : "";
  const evLg = e.lu ? resolveLeagueSlug(e.lu) : "";
  const pair =
    rows.length === 2 || (search.trim() && rows.length >= 2)
      ? [tSlug(rows[0].t, rows[0].u), tSlug(rows[1].t, rows[1].u)]
      : null;
  const tPageQuery = (t: EventTeamStats) => {
    const ts = tSlug(t.t, t.u);
    const vsTeam =
      (pair ? (pair[0] === ts ? pair[1] : pair[1] === ts ? pair[0] : "") : "") ||
      rows.map((r) => tSlug(r.t, r.u)).find((s) => Boolean(s) && s !== ts) ||
      "";
    const tPlayer = (e.players || []).filter((p) => tSlug(p.t, p.tu) === ts).sort((a, b) => b.g - a.g)[0];
    const tpSlug = tPlayer ? pSlug(tPlayer.n, tPlayer.u) : "";
    const topEvChamp = e.champs?.[0]?.c ? resolveChampSlug(e.champs[0].c) : "";
    return new URLSearchParams({
      p: `e:${e.u}`,
      ...(vsTeam ? { q: vsTeam } : tpSlug ? { q: tpSlug } : {}),
      ...(topEvChamp ? { champ: topEvChamp } : {}),
    }).toString();
  };
  const tFinderQuery = (t: EventTeamStats, side?: "b" | "r") => {
    const ts = tSlug(t.t, t.u);
    const vsTeam =
      (pair ? (pair[0] === ts ? pair[1] : pair[1] === ts ? pair[0] : "") : "") ||
      rows.map((r) => tSlug(r.t, r.u)).find((s) => Boolean(s) && s !== ts) ||
      "";
    const tPlayer = (e.players || []).filter((p) => tSlug(p.t, p.tu) === ts).sort((a, b) => b.g - a.g)[0];
    const tpSlug = tPlayer ? pSlug(tPlayer.n, tPlayer.u) : "";
    const topEvChamp = e.champs?.[0]?.c ? resolveChampSlug(e.champs[0].c) : "";
    return new URLSearchParams({
      event: e.u,
      ...(evLg ? { league: evLg } : {}),
      ...(evYr ? { year: evYr } : {}),
      team: ts,
      ...(vsTeam ? { vs: vsTeam } : {}),
      ...(tpSlug ? { player: tpSlug } : {}),
      ...(topEvChamp ? { champ: topEvChamp } : {}),
      ...(side ? { side } : {}),
    }).toString();
  };
  const tStatLink = (t: EventTeamStats, node: React.ReactNode) =>
    node == null || node === "–" ? (
      "–"
    ) : (
      <HubLink
        to={{ kind: "team", slug: tSlug(t.t, t.u), tab: "stats", query: tPageQuery(t) }}
        className="hover:text-rw-accent hover:underline"
        title={tl("Stats")}
      >
        {node}
      </HubLink>
    );
  const all: Column<EventTeamStats>[] = [
    {
      key: "t",
      label: tl("Team"),
      value: (t) => t.t.toLowerCase(),
      render: (t) => {
        const tq = tPageQuery(t);
        return (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <HubLink to={{ kind: "team", slug: tSlug(t.t, t.u), query: tq }} className="shrink-0 hover:opacity-80" title={t.t}>
              <TeamLogo name={t.t} size={15} />
            </HubLink>
            <TeamLink name={t.t} u={t.u} query={tq} />
          </span>
        );
      },
    },
    {
      key: "g",
      label: tl("Games"),
      value: (t) => t.g,
      render: (t) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
            <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(8, Math.round((t.g / maxTeamG) * 100))}%` }} />
          </span>
          <HubLink
            to={{ kind: "finder", query: tFinderQuery(t) }}
            className="hover:text-rw-accent hover:underline"
          >
            {t.g}
          </HubLink>
        </span>
      ),
    },
    {
      key: "wr",
      label: tl("Win %"),
      value: (t) => per(t.w, t.g, 3),
      render: (t) => (
        <HubLink
          to={{ kind: "finder", query: tFinderQuery(t) }}
          className="hover:opacity-90"
          title={tl("Game finder")}
        >
          <WinBar w={t.w} g={t.g} />
        </HubLink>
      ),
    },
    {
      key: "min",
      label: tl("Avg game"),
      value: (t) => per(t.min, t.g),
      render: (t) => tStatLink(t, tl("{n} min", { n: per(t.min, t.g) ?? "–" })),
    },
    {
      key: "kd",
      label: "K:D",
      title: tl("Kills per death"),
      value: (t) => per(t.k, Math.max(t.d, 1), 2),
      render: (t) => {
        const v = per(t.k, Math.max(t.d, 1), 2);
        if (v == null) return "–";
        return (
          <HubLink
            to={{ kind: "team", slug: tSlug(t.t, t.u), tab: "stats", query: tPageQuery(t) }}
            className={`hover:underline ${v >= 1.15 ? "text-rw-teal font-semibold" : v <= 0.85 ? "text-rw-red" : ""}`}
            title={tl("Stats")}
          >
            {v}
          </HubLink>
        );
      },
    },
    { key: "k", label: tl("Kills"), title: tl("Kills per game"), value: (t) => per(t.k, t.g), render: (t) => tStatLink(t, per(t.k, t.g)) },
    { key: "d", label: tl("Deaths"), title: tl("Deaths per game"), value: (t) => per(t.d, t.g), render: (t) => tStatLink(t, per(t.d, t.g)) },
    { key: "gpm", label: tl("GPM"), title: tl("Team gold per minute"), value: (t) => (t.gold ? per(t.gold, t.min, 0) : null), render: (t) => (t.gold ? tStatLink(t, per(t.gold, t.min, 0)) : "–") },
    {
      key: "gdm",
      label: tl("GD/m"),
      title: tl("Gold difference per minute, end of game"),
      value: (t) => per(t.gd, t.min, 0),
      render: (t) => {
        const v = per(t.gd, t.min, 0) ?? 0;
        return tStatLink(t, <span className={v >= 0 ? "text-rw-teal" : "text-rw-red"}>{`${v >= 0 ? "+" : ""}${v}`}</span>);
      },
    },
    {
      key: "blue",
      label: tl("Blue%"),
      title: tl("Share of games on blue side"),
      value: (t) => (t.blue != null ? per(t.blue, t.g, 3) : null),
      render: (t) =>
        t.blue != null ? (
          t.blue > 0 ? (
            <HubLink
              to={{ kind: "finder", query: tFinderQuery(t, "b") }}
              className="hover:text-rw-accent hover:underline"
            >
              {pct(per(t.blue, t.g, 3))}
            </HubLink>
          ) : (
            pct(per(t.blue, t.g, 3))
          )
        ) : (
          "–"
        ),
    },
    {
      key: "gd",
      label: tl("Gold diff"),
      title: tl("Gold difference per game, end of game"),
      value: (t) => per(t.gd, t.g, 0),
      render: (t) => {
        const v = per(t.gd, t.g, 0) ?? 0;
        return (
          <HubLink
            to={{ kind: "team", slug: tSlug(t.t, t.u), tab: "stats", query: tPageQuery(t) }}
            className={`hover:underline ${v >= 0 ? "text-rw-teal" : "text-rw-red"}`}
            title={tl("Stats")}
          >
            {`${v >= 0 ? "+" : ""}${fmtNum(v)}`}
          </HubLink>
        );
      },
    },
    { key: "drag", label: tl("Dragons"), title: tl("Dragons per game"), value: (t) => per(t.drag, t.g, 2), render: (t) => tStatLink(t, per(t.drag, t.g, 2)) },
    { key: "drap", label: tl("DRA%"), title: tl("Share of all dragons taken in their games"), value: (t) => (t.odrag != null && t.drag + t.odrag ? per(t.drag, t.drag + t.odrag, 3) : null), render: (t) => (t.odrag != null && t.drag + t.odrag ? tStatLink(t, shareTone(per(t.drag, t.drag + t.odrag, 3))) : "–") },
    { key: "bar", label: tl("Barons"), title: tl("Barons per game"), value: (t) => per(t.bar, t.g, 2), render: (t) => tStatLink(t, per(t.bar, t.g, 2)) },
    { key: "barp", label: tl("Baron%"), title: tl("Share of all barons taken in their games"), value: (t) => (t.obar != null && t.bar + t.obar ? per(t.bar, t.bar + t.obar, 3) : null), render: (t) => (t.obar != null && t.bar + t.obar ? tStatLink(t, shareTone(per(t.bar, t.bar + t.obar, 3))) : "–") },
    { key: "tow", label: tl("Towers"), title: tl("Towers per game"), value: (t) => per(t.tow, t.g, 1), render: (t) => tStatLink(t, per(t.tow, t.g, 1)) },
    { key: "tl", label: tl("Lost"), title: tl("Towers lost per game"), value: (t) => (t.tl != null ? per(t.tl, t.g, 1) : null), render: (t) => (t.tl != null ? tStatLink(t, per(t.tl, t.g, 1)) : "–") },
    { key: "csm", label: tl("CS/m"), title: tl("Team CS per minute"), value: (t) => (t.pmin ? per(t.cs || 0, t.pmin, 1) : null), render: (t) => (t.pmin ? tStatLink(t, per(t.cs || 0, t.pmin, 1)) : "–") },
    { key: "dpm", label: tl("DPM"), title: tl("Team damage per minute"), value: (t) => (t.pmin ? per(t.dmg || 0, t.pmin, 0) : null), render: (t) => (t.pmin ? tStatLink(t, per(t.dmg || 0, t.pmin, 0)) : "–") },
    { key: "grub", label: tl("Void grubs"), title: tl("Void grubs per game"), value: (t) => per(t.grub, t.g, 1), render: (t) => tStatLink(t, per(t.grub, t.g, 1)) },
  ];
  // Void grubs only exist since 2024
  const cols = all.filter((c) => c.key !== "grub" || teams.some((t) => t.grub > 0));
  const early = teams.some((t) => t.tn || t.fbn || t.pln);
  if (early) cols.push(...teamEarlyCols(tStatLink));
  const topTeam0 = rows[0] ? tSlug(rows[0].t, rows[0].u) : "";
  const topTeam1 =
    [...rows, ...teams]
      .map((t) => tSlug(t.t, t.u))
      .find((s) => Boolean(s) && s !== topTeam0) || "";
  const evChamps = Array.from(new Set((e.champs || []).map((c) => resolveChampSlug(c.c)).filter(Boolean))).slice(0, 2);
  const teamPlayers = Array.from(
    new Set(
      [
        ...(e.players || [])
          .filter((p) => {
            const pt = p.t ? tSlug(p.t, p.tu) : "";
            return pt === topTeam0 || (topTeam1 && pt === topTeam1);
          })
          .map((p) => pSlug(p.n, p.u)),
        ...(e.players || []).map((p) => pSlug(p.n, p.u)),
      ].filter(Boolean),
    ),
  ).slice(0, 2);
  return (
    <Section
      title={tl("Team stats")}
      share={`${e.u}-teams`}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {topTeam0 && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: topTeam0,
                  ...(topTeam1 ? { b: topTeam1 } : {}),
                  period: `e:${e.u}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: topTeam0,
                  ...(topTeam1 ? { b: topTeam1 } : {}),
                  period: `e:${e.u}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                    ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                    team: topTeam0,
                    ...(topTeam1 ? { vs: topTeam1 } : {}),
                    ...(evChamps[0] ? { champ: evChamps[0] } : {}),
                    ...(evChamps[1] ? { vschamp: evChamps[1] } : {}),
                    ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Item history")} →
              </HubLink>
              {evChamps[0] && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: new URLSearchParams({
                      champ: evChamps[0],
                      ...(evChamps[1] ? { vs: evChamps[1] } : {}),
                      ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                      ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                      team: topTeam0,
                      ...(topTeam1 ? { vsteam: topTeam1 } : {}),
                      ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                      event: e.u,
                      ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4))
                        ? { patch: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) }
                        : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
            </>
          )}
          <HubLink
            to={{
              kind: "champions",
              query: new URLSearchParams({
                ...(e.lu ? { scope: resolveLeagueSlug(e.lu), league: resolveLeagueSlug(e.lu) } : {}),
                ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { key: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) } : {}),
                event: e.u,
                ...(evChamps.length ? { q: evChamps.join(",") } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Champions")} →
          </HubLink>
          <HubLink
            to={{
              kind: "tiers",
              query: new URLSearchParams({
                ...(e.lu ? { scope: resolveLeagueSlug(e.lu), league: resolveLeagueSlug(e.lu) } : {}),
                ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { key: `y${(e.start || e.end || "").slice(0, 4)}`, year: (e.start || e.end || "").slice(0, 4) } : {}),
                event: e.u,
                ...(evChamps.length ? { q: evChamps.join(",") } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink
            to={{
              kind: "rankings",
              query:
                new URLSearchParams({
                  ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                  ...(topTeam0 || teamPlayers.length
                    ? { q: [topTeam0, topTeam1, ...teamPlayers].filter(Boolean).join(",") }
                    : {}),
                }).toString() || undefined,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Power rankings")} →
          </HubLink>
          <HubLink
            to={{
              kind: "draft",
              query: `${topTeam0 ? `teams=${encodeURIComponent(topTeam0)}${topTeam1 ? `,${encodeURIComponent(topTeam1)}` : ""}&` : ""}p=e:${encodeURIComponent(e.u)}${evChamps.length ? `&champ=${encodeURIComponent(evChamps.join(","))}` : ""}`,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Draft board")} →
          </HubLink>
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                event: e.u,
                ...(evLg ? { league: evLg } : {}),
                ...(evYr ? { year: evYr } : {}),
                ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                ...(topTeam0 ? { team: topTeam0 } : {}),
                ...(topTeam1 ? { vs: topTeam1 } : {}),
                ...(evChamps[0] ? { champ: evChamps[0] } : {}),
                ...(evChamps[1] ? { vschamp: evChamps[1] } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Game finder")} →
          </HubLink>
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                event: e.u,
                ...(evChamps[0] ? { champ: evChamps[0] } : {}),
                ...(topTeam0 || teamPlayers.length
                  ? { q: [topTeam0, topTeam1, ...teamPlayers].filter(Boolean).join(",") }
                  : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Player leaderboards")} →
          </HubLink>
          <CopyEventTablePost
            title={`${tl("Team stats")} · ${e.n}`}
            rows={[...rows]
              .sort((a, b) => (per(b.w, b.g, 3) || 0) - (per(a.w, a.g, 3) || 0))
              .slice(0, 6)
              .map((t, idx) => `#${idx + 1} ${t.t}: ${t.w}-${t.g - t.w} (${pct(per(t.w, t.g, 3))}) · ${per(t.min, t.g) ?? "–"}m`)}
            url={hubShareUrl({
              kind: "event",
              slug: e.u,
              tab: "stats",
              ...(search.trim() ? { query: `q=${encodeURIComponent(search.trim())}` } : {}),
            })}
          />
          <SectionCard
            section={tl("Team stats")}
            sub={e.n}
            name={`${e.u}-team-stats`}
            rows={() =>
              [...rows]
                .sort((a, b) => (per(b.w, b.g, 3) || 0) - (per(a.w, a.g, 3) || 0))
                .slice(0, 10)
                .map((t, idx) => ({
                  rank: idx + 1,
                  team: t.t,
                  label: t.t,
                  sub: `${t.w}-${t.g - t.w} · ${per(t.min, t.g) ?? "–"} min`,
                  value: pct(per(t.w, t.g, 3)),
                  win: t.g > 0 ? t.w / t.g >= 0.5 : undefined,
                }))
            }
          />
        </span>
      }
    >
      {(teams.length > 2 || Boolean(search.trim())) && (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-nocapture="1">
          <input
            type="search"
            value={search}
            onChange={(ev) => {
              userTyped.current = true;
              setSearch(ev.target.value);
            }}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded px-2 py-1 text-[11px] text-rw-text w-44"
          />
          {pair && (
            <span className="flex items-center gap-2 text-[11px]">
              <HubLink to={{ kind: "prep", a: pair[0], b: pair[1], period: `e:${e.u}` }} className="text-rw-accent hover:underline font-semibold">
                {tl("Match prep")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(pair[0])},${encodeURIComponent(pair[1])}&p=e:${encodeURIComponent(e.u)}${evChamps.length ? `&champ=${encodeURIComponent(evChamps.join(","))}` : ""}`,
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Draft board")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink to={{ kind: "compare", mode: "team", a: pair[0], b: pair[1], period: `e:${e.u}` }} className="text-rw-accent hover:underline font-semibold">
                {tl("Compare")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                    ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                    team: pair[0],
                    vs: pair[1],
                    ...(evChamps[0] ? { champ: evChamps[0] } : {}),
                    ...(evChamps[1] ? { vschamp: evChamps[1] } : {}),
                    ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Item history")}
              </HubLink>
              {evChamps[0] && (
                <>
                  <span className="text-rw-muted">·</span>
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        champ: evChamps[0],
                        ...(evChamps[1] ? { vs: evChamps[1] } : {}),
                        ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                        ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                        team: pair[0],
                        vsteam: pair[1],
                        ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                        event: e.u,
                        ...(evYr ? { patch: `y${evYr}`, year: evYr } : {}),
                      }).toString(),
                    }}
                    className="text-rw-accent hover:underline font-semibold"
                  >
                    {tl("Counters")}
                  </HubLink>
                </>
              )}
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(evLg ? { league: evLg } : {}),
                    ...(evYr ? { year: evYr } : {}),
                    ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                    ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                    team: pair[0],
                    vs: pair[1],
                    ...(evChamps[0] ? { champ: evChamps[0] } : {}),
                    ...(evChamps[1] ? { vschamp: evChamps[1] } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Game finder")}
              </HubLink>
            </span>
          )}
          {search.trim() && rows.length === 1 && (
            <span className="flex items-center gap-2 text-[11px]">
              <HubLink
                to={{ kind: "prep", a: topTeam0, ...(topTeam1 ? { b: topTeam1 } : {}), period: `e:${e.u}` }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Match prep")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(topTeam0)}${topTeam1 ? `,${encodeURIComponent(topTeam1)}` : ""}&p=e:${encodeURIComponent(e.u)}${evChamps.length ? `&champ=${encodeURIComponent(evChamps.join(","))}` : ""}`,
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Draft board")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{ kind: "compare", mode: "team", a: topTeam0, ...(topTeam1 ? { b: topTeam1 } : {}), period: `e:${e.u}` }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Compare")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                    ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                    team: topTeam0,
                    ...(topTeam1 ? { vs: topTeam1 } : {}),
                    ...(evChamps[0] ? { champ: evChamps[0] } : {}),
                    ...(evChamps[1] ? { vschamp: evChamps[1] } : {}),
                    ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                    ...(/^\d{4}$/.test((e.start || e.end || "").slice(0, 4)) ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Item history")}
              </HubLink>
              {evChamps[0] && (
                <>
                  <span className="text-rw-muted">·</span>
                  <HubLink
                    to={{
                      kind: "counters",
                      query: new URLSearchParams({
                        champ: evChamps[0],
                        ...(evChamps[1] ? { vs: evChamps[1] } : {}),
                        ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                        ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                        team: topTeam0,
                        ...(topTeam1 ? { vsteam: topTeam1 } : {}),
                        ...(e.lu ? { league: resolveLeagueSlug(e.lu) } : {}),
                        event: e.u,
                        ...(evYr ? { patch: `y${evYr}`, year: evYr } : {}),
                      }).toString(),
                    }}
                    className="text-rw-accent hover:underline font-semibold"
                  >
                    {tl("Counters")}
                  </HubLink>
                </>
              )}
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{
                  kind: "finder",
                  query: new URLSearchParams({
                    event: e.u,
                    ...(evLg ? { league: evLg } : {}),
                    ...(evYr ? { year: evYr } : {}),
                    ...(teamPlayers[0] ? { player: teamPlayers[0] } : {}),
                    ...(teamPlayers[1] ? { vsplayer: teamPlayers[1] } : {}),
                    team: topTeam0,
                    ...(topTeam1 ? { vs: topTeam1 } : {}),
                    ...(evChamps[0] ? { champ: evChamps[0] } : {}),
                    ...(evChamps[1] ? { vschamp: evChamps[1] } : {}),
                  }).toString(),
                }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Game finder")}
              </HubLink>
            </span>
          )}
        </div>
      )}
      <SortTable rows={rows} columns={cols} initial={{ key: "wr", desc: true }} rowKey={(t, i) => `${t.t}-${i}`} copyName={`${e.u}-teams`} />
      <p className="text-[10px] text-rw-muted">{tl("Per game, games with a full scoreboard only.")}</p>
      {early && <OeCredit />}
    </Section>
  );
};

const CopyEventTablePost: React.FC<{
  title: string;
  rows: string[];
  url: string;
}> = ({ title, rows, url }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [title];
    for (const r of rows) {
      lines.push(r);
    }
    lines.push(url);
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
      data-nocapture="1"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
