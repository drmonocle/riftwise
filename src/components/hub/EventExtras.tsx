/** Tournament page extras: quick facts, team rosters (with subs and coaches), records between regions. */
import React, { useEffect, useMemo, useState } from "react";
import { Flame, Crown, Timer, Swords } from "lucide-react";
import { tl, tk, roleName, regionName } from "../../i18n";
import { bare, loadAliases, normText, prettySlug, resolveChampSlug, resolveLeagueSlug, resolvePlayerSlug, resolveRegionFilter, resolveTeamAlias, searchAlias } from "../../hub/data";
import { normalizeRole } from "../../hub/champAgg";
import { currentHubRoute, hubShareUrl } from "../../hub/route";
import { champName } from "../../champions";
import type {
  EventOverview,
  EventRoster,
  GameRef,
  HubEvent,
} from "../../hub/types";
import {
  ChampIcon,
  HubLink,
  PlayerLink,
  PlayerPhoto,
  Section,
  Stat,
  TeamLink,
  TeamLogo,
  fmtNum,
  RatingBadge,
  td,
  th,
  useLoad,
} from "./ui";
import { RegionFlag } from "./RegionStats";
import { CountryFlag, localCountry } from "./CountryFlag";
import { STable } from "../STable";
import { BroadcastCardButton, SectionCard, type CardData } from "./BroadcastCard";

const mmss = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const tSlug = (name: string, u?: string | null) => u || resolveTeamAlias(name) || prettySlug(name);
const pSlug = (name: string, u?: string | null) => u || resolvePlayerSlug(name) || prettySlug(name);
const DRAKE: Record<string, string> = {
  infernal: tk("Infernal"),
  mountain: tk("Mountain"),
  ocean: tk("Ocean"),
  cloud: tk("Cloud"),
  hextech: tk("Hextech"),
  chemtech: tk("Chemtech"),
  elder: tk("Elder"),
};
const DRAKE_COLOR: Record<string, string> = {
  infernal: "#ef4444",
  mountain: "#d97706",
  ocean: "#0ea5e9",
  cloud: "#a855f7",
  hextech: "#3b82f6",
  chemtech: "#22c55e",
  elder: "#f59e0b",
};

const GameLine: React.FC<{
  label: string;
  r: GameRef | null;
  value: string;
  slug?: string;
}> = ({ label, r, value, slug }) =>
  r ? (
    <li className="flex flex-wrap items-baseline justify-between gap-x-2 min-w-0">
      <span className="text-rw-sub shrink-0">{label}</span>
      <span className="min-w-0 text-right inline-flex items-center gap-1 flex-wrap justify-end">
        {r.g ? (
          <HubLink to={{ kind: "match", slug: r.g, game: r.n }} className="text-rw-accent font-bold hover:underline">
            {value}
          </HubLink>
        ) : (
          <span className="text-rw-accent font-bold">{value}</span>
        )}
        {r.g ? (
          <HubLink to={{ kind: "match", slug: r.g, game: r.n }} className="inline-flex items-center gap-1">
            <TeamLogo name={r.a} size={13} />
            <span>{r.a} vs</span>
            <TeamLogo name={r.b} size={13} />
            <span>{r.b}</span>
          </HubLink>
        ) : (
          <span className="text-rw-text inline-flex items-center gap-1">
            {(() => {
              const qa = new URLSearchParams({
                ...(slug ? { p: `e:${slug}` } : {}),
                ...(r.b ? { q: tSlug(r.b) } : {}),
              }).toString();
              const qb = new URLSearchParams({
                ...(slug ? { p: `e:${slug}` } : {}),
                ...(r.a ? { q: tSlug(r.a) } : {}),
              }).toString();
              return (
                <>
                  <HubLink
                    to={{ kind: "team", slug: tSlug(r.a), ...(qa ? { query: qa } : {}) }}
                    className="shrink-0 hover:opacity-80"
                    title={r.a}
                  >
                    <TeamLogo name={r.a} size={13} />
                  </HubLink>
                  <TeamLink name={r.a} query={qa || undefined} />
                  <HubLink
                    to={{ kind: "compare", mode: "team", a: tSlug(r.a), b: tSlug(r.b), ...(slug ? { period: `e:${slug}` } : {}) }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                    title={tl("Compare")}
                  >
                    vs
                  </HubLink>
                  <HubLink
                    to={{ kind: "team", slug: tSlug(r.b), ...(qb ? { query: qb } : {}) }}
                    className="shrink-0 hover:opacity-80"
                    title={r.b}
                  >
                    <TeamLogo name={r.b} size={13} />
                  </HubLink>
                  <TeamLink name={r.b} query={qb || undefined} />
                </>
              );
            })()}
          </span>
        )}
      </span>
    </li>
  ) : null;

/** gol.gg-style "tournament data": averages, side wins, dragons, notable games, pentakills, Player of the Game. */
export const EventFacts: React.FC<{ o: EventOverview; slug?: string; leagueSlug?: string | null; year?: string; hidden?: boolean; card?: { data: () => CardData; name: string } }> = ({
  o,
  slug,
  leagueSlug,
  year,
  hidden,
  card,
}) => {
  const sideTotal = o.blue + o.red;
  const bluePct = sideTotal > 0 ? Math.round((o.blue / sideTotal) * 100) : 50;
  const redPct = sideTotal > 0 ? 100 - bluePct : 50;
  const drakes = Object.entries(o.drakes).sort((a, b) => b[1] - a[1]);
  const totalDrakes = drakes.reduce((s, [, n]) => s + n, 0) || 1;
  const featGame = o.best || o.bloody || o.long || o.short;
  const featTeams = Array.from(
    new Set(
      [o.best?.a, o.best?.b, o.bloody?.a, o.bloody?.b, o.long?.a, o.long?.b, o.short?.a, o.short?.b]
        .map((x) => (x ? tSlug(x) : ""))
        .filter(Boolean),
    ),
  ).slice(0, 2);
  const yr = year && /^\d{4}$/.test(year) ? year : slug && /\d{4}/.test(slug) ? /\d{4}/.exec(slug)![0] : undefined;
  const normLg = leagueSlug ? resolveLeagueSlug(leagueSlug) : "";
  const evQ = slug ? `p=e:${encodeURIComponent(slug)}` : undefined;
  const evBaseFinderQuery = slug
    ? `event=${encodeURIComponent(slug)}${normLg ? `&league=${encodeURIComponent(normLg)}` : ""}${yr ? `&year=${encodeURIComponent(yr)}` : ""}`
    : "";
  const pentaPlayers = Array.from(new Set((o.pentas || []).map((p) => pSlug(p.n, p.u)).filter(Boolean))).slice(0, 2);
  const pentaChamps = Array.from(new Set((o.pentas || []).map((p) => (p.c ? resolveChampSlug(p.c) : "")).filter(Boolean))).slice(0, 2);
  const mvpPlayers = Array.from(new Set((o.mvp || []).map((m) => pSlug(m.n, m.u)).filter(Boolean))).slice(0, 2);
  const topPlayers = Array.from(
    new Set([...mvpPlayers, ...pentaPlayers, ...(o.farm ? [pSlug(o.farm.n, o.farm.u)] : [])].filter(Boolean)),
  ).slice(0, 2);
  const tiersQuery =
    new URLSearchParams({
      ...(normLg ? { scope: normLg, league: normLg } : {}),
      ...(yr ? { key: `y${yr}`, year: yr } : {}),
      ...(slug ? { event: slug } : {}),
      ...(pentaChamps.length ? { q: pentaChamps.join(",") } : {}),
    }).toString() || undefined;
  return (
    <Section
      title={tl("Tournament stats")}
      share="tournament-facts"
      right={
        !hidden ? (
          <span className="flex flex-wrap items-center gap-2">
            {featTeams[0] && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: featTeams[0],
                    ...(featTeams[1] ? { b: featTeams[1] } : {}),
                    ...(slug ? { period: `e:${slug}` } : {}),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(featTeams[0])}${featTeams[1] ? `,${encodeURIComponent(featTeams[1])}` : ""}${slug ? `&p=e:${encodeURIComponent(slug)}` : ""}${pentaChamps.length ? `&champ=${encodeURIComponent(pentaChamps.join(","))}` : ""}`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: featTeams[0],
                    ...(featTeams[1] ? { b: featTeams[1] } : {}),
                    ...(slug ? { period: `e:${slug}` } : {}),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
              </>
            )}
            {slug && (
              <>
                {pentaChamps[0] && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: `champ=${encodeURIComponent(pentaChamps[0])}${pentaChamps[1] ? `&vs=${encodeURIComponent(pentaChamps[1])}` : ""}&event=${encodeURIComponent(slug)}${yr ? `&patch=y${yr}&year=${yr}` : ""}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Counters")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "records",
                    query:
                      new URLSearchParams({
                        ...(yr ? { year: yr } : {}),
                        ...(slug ? { q: slug } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Records")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(normLg ? { league: normLg } : {}),
                      ...(yr ? { year: yr } : {}),
                      event: slug,
                      ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                      ...(featTeams.length || topPlayers.length
                        ? { q: [...featTeams, ...topPlayers].filter(Boolean).join(",") }
                        : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                {!featTeams[0] && (
                  <HubLink
                    to={{
                      kind: "draft",
                      query: `p=e:${encodeURIComponent(slug)}${pentaChamps.length ? `&champ=${encodeURIComponent(pentaChamps.join(","))}` : ""}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                )}
                <HubLink
                  to={{ kind: "tiers", query: tiersQuery }}
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
                        ...(normLg ? { league: normLg } : {}),
                        ...(featTeams.length ? { q: featTeams.join(",") } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      event: slug,
                      ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                      ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                      ...(featTeams[0] ? { team: featTeams[0] } : {}),
                      ...(featTeams[1] ? { vs: featTeams[1] } : {}),
                      ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                      ...(pentaChamps[1] ? { vschamp: pentaChamps[1] } : {}),
                      ...(normLg ? { league: normLg } : {}),
                      ...(yr ? { year: yr } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      event: slug,
                      ...(normLg ? { league: normLg } : {}),
                      ...(yr ? { year: yr } : {}),
                      ...(topPlayers[0] ? { player: topPlayers[0] } : {}),
                      ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}),
                      ...(featTeams[0] ? { team: featTeams[0] } : {}),
                      ...(featTeams[1] ? { vs: featTeams[1] } : {}),
                      ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                      ...(pentaChamps[1] ? { vschamp: pentaChamps[1] } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
              </>
            )}
            <CopyExtrasPost
              title={tl("Tournament stats")}
              rows={[
                `${tl("Games")}: ${fmtNum(o.g)}${o.min ? ` · ${tl("Avg game")}: ${mmss(o.min)}` : ""}${o.kills ? ` · ${tl("Kills / game")}: ${o.kills}` : ""}`,
                ...(sideTotal ? [`${tl("Blue side wins")}: ${Math.round((o.blue / sideTotal) * 100)}% (${o.blue}-${o.red})`] : []),
                ...(o.short ? [`${tl("Shortest game")}: ${mmss(o.short.v)} (${o.short.a} vs ${o.short.b})`] : []),
                ...(o.long ? [`${tl("Longest game")}: ${mmss(o.long.v)} (${o.long.a} vs ${o.long.b})`] : []),
                ...(o.bloody ? [`${tl("Most kills in a game")}: ${o.bloody.v} (${o.bloody.a} vs ${o.bloody.b})`] : []),
              ]}
            />
            {card && <BroadcastCardButton data={card.data} name={card.name} label={tl("Overview card")} />}
          </span>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 rw-stats">
        <Stat
          label={tl("Games")}
          value={fmtNum(o.g)}
          to={slug ? { kind: "finder", query: evBaseFinderQuery } : undefined}
        />
        <Stat
          label={tl("Avg game")}
          value={o.min ? mmss(o.min) : "–"}
          to={slug && o.min ? { kind: "finder", query: evBaseFinderQuery } : undefined}
        />
        <Stat
          label={tl("Kills / game")}
          value={o.kills || "–"}
          to={slug && o.kills ? { kind: "finder", query: evBaseFinderQuery } : undefined}
        />
        <Stat
          label={tl("Blue side wins")}
          value={
            hidden || !sideTotal
              ? "–"
              : `${Math.round((o.blue / sideTotal) * 100)}%`
          }
          sub={
            hidden || !sideTotal
              ? undefined
              : tl("{b} blue · {r} red", { b: o.blue, r: o.red })
          }
          to={slug && !hidden && sideTotal > 0 ? { kind: "finder", query: `${evBaseFinderQuery}&side=b` } : undefined}
        />
      </div>
      {!hidden && sideTotal > 0 && (
        <div className="rounded-lg border border-rw-border bg-rw-bg/50 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            {slug ? (
              <HubLink
                to={{ kind: "finder", query: `${evBaseFinderQuery}&side=b` }}
                className="font-bold flex items-center gap-1.5 text-[#4a9eff] hover:underline"
                title={tl("Game finder")}
              >
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#4a9eff" }} />
                {tl("Blue side")} · {bluePct}% <span className="text-rw-muted font-normal">({o.blue})</span>
              </HubLink>
            ) : (
              <span className="font-bold flex items-center gap-1.5" style={{ color: "#4a9eff" }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#4a9eff" }} />
                {tl("Blue side")} · {bluePct}% <span className="text-rw-muted font-normal">({o.blue})</span>
              </span>
            )}
            {slug ? (
              <HubLink
                to={{ kind: "finder", query: `${evBaseFinderQuery}&side=r` }}
                className="font-bold flex items-center gap-1.5 text-rw-red hover:underline"
                title={tl("Game finder")}
              >
                <span className="text-rw-muted font-normal">({o.red})</span> {redPct}% · {tl("Red side")}
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--rw-red)" }} />
              </HubLink>
            ) : (
              <span className="font-bold flex items-center gap-1.5" style={{ color: "var(--rw-red)" }}>
                <span className="text-rw-muted font-normal">({o.red})</span> {redPct}% · {tl("Red side")}
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--rw-red)" }} />
              </span>
            )}
          </div>
          <div className="relative h-2 rounded-full bg-rw-raised overflow-hidden flex">
            <div className="h-full" style={{ width: `${bluePct}%`, background: "#4a9eff" }} />
            <div className="h-full" style={{ width: `${redPct}%`, background: "var(--rw-red)" }} />
            <div className="absolute inset-y-0 left-1/2 w-0.5 -ml-px bg-rw-bg/90" />
          </div>
        </div>
      )}
      {!hidden && (
        <ul className="text-xs space-y-1 mt-1">
          {o.best && (
            <li className="flex flex-wrap items-baseline justify-between gap-x-2 min-w-0">
              <span className="text-rw-sub shrink-0">{tl("Best game")}</span>
              <span className="min-w-0 text-right inline-flex items-center gap-1 flex-wrap justify-end">
                <RatingBadge r={o.best.v} />
                {o.best.g ? (
                  <HubLink to={{ kind: "match", slug: o.best.g, game: o.best.n }} className="inline-flex items-center gap-1">
                    <TeamLogo name={o.best.a} size={13} />
                    <span>{o.best.a} vs</span>
                    <TeamLogo name={o.best.b} size={13} />
                    <span>{o.best.b} · {tl("Game {n}", { n: o.best.n })}</span>
                  </HubLink>
                ) : (
                  <span className="text-rw-text inline-flex items-center gap-1">
                    {(() => {
                      const qa = new URLSearchParams({
                        ...(slug ? { p: `e:${slug}` } : yr ? { p: `y${yr}` } : {}),
                        ...(o.best.b ? { q: tSlug(o.best.b) } : {}),
                      }).toString();
                      const qb = new URLSearchParams({
                        ...(slug ? { p: `e:${slug}` } : yr ? { p: `y${yr}` } : {}),
                        ...(o.best.a ? { q: tSlug(o.best.a) } : {}),
                      }).toString();
                      return (
                        <>
                          <HubLink to={{ kind: "team", slug: tSlug(o.best.a), ...(qa ? { query: qa } : {}) }} className="shrink-0 hover:opacity-80" title={o.best.a}>
                            <TeamLogo name={o.best.a} size={13} />
                          </HubLink>
                          <TeamLink name={o.best.a} query={qa || undefined} />
                          <HubLink
                            to={{ kind: "compare", mode: "team", a: tSlug(o.best.a), b: tSlug(o.best.b), ...(slug ? { period: `e:${slug}` } : {}) }}
                            className="text-rw-muted hover:text-rw-accent hover:underline"
                            title={tl("Compare")}
                          >
                            vs
                          </HubLink>
                          <HubLink to={{ kind: "team", slug: tSlug(o.best.b), ...(qb ? { query: qb } : {}) }} className="shrink-0 hover:opacity-80" title={o.best.b}>
                            <TeamLogo name={o.best.b} size={13} />
                          </HubLink>
                          <TeamLink name={o.best.b} query={qb || undefined} />
                        </>
                      );
                    })()}
                  </span>
                )}
              </span>
            </li>
          )}
          <GameLine
            label={tl("Shortest game")}
            r={o.short}
            value={o.short ? mmss(o.short.v) : ""}
            slug={slug}
          />
          <GameLine
            label={tl("Longest game")}
            r={o.long}
            value={o.long ? mmss(o.long.v) : ""}
            slug={slug}
          />
          <GameLine
            label={tl("Most kills in a game")}
            r={o.bloody}
            value={o.bloody ? tl("{n} kills", { n: o.bloody.v }) : ""}
            slug={slug}
          />
          {o.farm && (
            <li className="flex flex-wrap items-baseline justify-between gap-x-2 min-w-0">
              <span className="text-rw-sub shrink-0">
                {tl("Best farming game")}
              </span>
              <span className="min-w-0 text-right inline-flex items-center gap-1 flex-wrap justify-end">
                {o.farm.g ? (
                  <HubLink to={{ kind: "match", slug: o.farm.g, game: o.farm.gn }} className="text-rw-accent font-bold hover:underline">
                    {tl("{n} CS/min", { n: o.farm.v })}
                  </HubLink>
                ) : (
                  <span className="text-rw-accent font-bold">
                    {tl("{n} CS/min", { n: o.farm.v })}
                  </span>
                )}
                <HubLink to={{ kind: "player", slug: pSlug(o.farm.n, o.farm.u), ...(evQ ? { query: evQ } : {}) }} className="shrink-0 hover:opacity-80" title={o.farm.n}>
                  <PlayerPhoto name={o.farm.n} slug={o.farm.u ?? undefined} size={15} />
                </HubLink>
                <PlayerLink name={o.farm.n} u={o.farm.u} query={evQ} />
                {o.farm.g ? (
                  <HubLink
                    to={{ kind: "match", slug: o.farm.g, game: o.farm.gn }}
                    className="text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    ({o.farm.cs} CS, {mmss(o.farm.min)})
                  </HubLink>
                ) : (
                  <span className="text-rw-muted">
                    ({o.farm.cs} CS, {mmss(o.farm.min)})
                  </span>
                )}
                {o.farm.g && (
                  <HubLink
                    to={{ kind: "match", slug: o.farm.g, game: o.farm.gn }}
                    className="text-rw-accent hover:underline"
                  >
                    {tl("Details")}
                  </HubLink>
                )}
              </span>
            </li>
          )}
        </ul>
      )}
      {drakes.length > 0 && (
        <div className="rounded-lg border border-rw-border bg-rw-bg/40 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-rw-muted flex items-center gap-1 font-semibold">
              <Flame className="w-3 h-3 text-rw-accent" />
              {tl("Dragons taken:")}
            </span>
            {slug ? (
              <HubLink
                to={{ kind: "finder", query: evBaseFinderQuery }}
                className="font-mono text-rw-sub tabular-nums hover:text-rw-accent hover:underline"
                title={tl("Game finder")}
              >
                {fmtNum(totalDrakes)}
              </HubLink>
            ) : (
              <span className="font-mono text-rw-sub tabular-nums">{fmtNum(totalDrakes)}</span>
            )}
          </div>
          <div className="h-2 rounded-full bg-rw-raised overflow-hidden flex gap-px">
            {drakes.map(([k, n]) => (
              <div
                key={k}
                className="h-full"
                style={{
                  width: `${Math.max(2, (n / totalDrakes) * 100)}%`,
                  background: DRAKE_COLOR[k.toLowerCase()] || "var(--rw-accent)",
                }}
                title={`${tl(DRAKE[k] || k)}: ${n} (${Math.round((n / totalDrakes) * 100)}%)`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-rw-sub">
            {drakes.map(([k, n]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: DRAKE_COLOR[k.toLowerCase()] || "var(--rw-accent)" }}
                />
                {tl(DRAKE[k] || k)}{" "}
                {slug ? (
                  <HubLink
                    to={{ kind: "finder", query: evBaseFinderQuery }}
                    className="text-rw-text font-semibold tabular-nums hover:text-rw-accent hover:underline"
                    title={tl("Game finder")}
                  >
                    {n}
                  </HubLink>
                ) : (
                  <span className="text-rw-text font-semibold tabular-nums">{n}</span>
                )}
                <span className="text-rw-muted text-[10px] tabular-nums">({Math.round((n / totalDrakes) * 100)}%)</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {!hidden && o.pentas.length > 0 && (
        <div className="text-xs">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-rw-muted flex items-center gap-1">
              <Swords className="w-3 h-3" />
              {tl("Pentakills")}
            </span>
            <span className="flex items-center gap-2">
              {pentaPlayers[0] && (
                <>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "player",
                      a: pentaPlayers[0],
                      ...(pentaPlayers[1] ? { b: pentaPlayers[1] } : {}),
                      ...(slug ? { period: `e:${slug}` } : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  {pentaChamps[0] && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(pentaChamps[0])}${pentaChamps[1] ? `&vs=${encodeURIComponent(pentaChamps[1])}` : ""}${slug ? `&event=${encodeURIComponent(slug)}` : ""}${yr ? `&patch=y${yr}&year=${yr}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: new URLSearchParams({
                        player: pentaPlayers[0],
                        ...(pentaPlayers[1] ? { vsplayer: pentaPlayers[1] } : {}),
                        ...(featGame?.a ? { team: tSlug(featGame.a) } : {}),
                        ...(featGame?.b && tSlug(featGame.b) !== tSlug(featGame.a) ? { vs: tSlug(featGame.b) } : {}),
                        ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                        ...(pentaChamps[1] ? { vschamp: pentaChamps[1] } : {}),
                        ...(normLg ? { league: normLg } : {}),
                        ...(yr ? { year: yr } : {}),
                        ...(slug ? { event: slug } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                </>
              )}
              {slug && (
                <>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(normLg ? { league: normLg } : {}),
                        ...(yr ? { year: yr } : {}),
                        event: slug,
                        ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                        ...(pentaPlayers.length || featTeams.length
                          ? { q: [...pentaPlayers, ...featTeams].filter(Boolean).join(",") }
                          : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: new URLSearchParams({
                        event: slug,
                        ...(normLg ? { league: normLg } : {}),
                        ...(yr ? { year: yr } : {}),
                        ...(pentaPlayers[0] ? { player: pentaPlayers[0] } : {}),
                        ...(pentaPlayers[1] ? { vsplayer: pentaPlayers[1] } : {}),
                        ...(featTeams[0] ? { team: featTeams[0] } : {}),
                        ...(featTeams[1] ? { vs: featTeams[1] } : {}),
                        ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                        ...(pentaChamps[1] ? { vschamp: pentaChamps[1] } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                </>
              )}
              <HubLink
                to={{
                  kind: "records",
                  query: new URLSearchParams({
                    q: "pentakill",
                    ...(yr ? { year: yr } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Records")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query:
                    new URLSearchParams({
                      ...(normLg ? { scope: normLg, league: normLg } : {}),
                      ...(yr ? { key: `y${yr}`, year: yr } : {}),
                      ...(slug ? { event: slug } : {}),
                      ...(pentaChamps.length ? { q: pentaChamps.join(",") } : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              {(slug || yr || pentaChamps[0]) && (
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      ...(slug ? { p: `e:${slug}` } : yr ? { p: `y${yr}` } : {}),
                      ...(featGame?.a ? { teams: [tSlug(featGame.a), featGame.b ? tSlug(featGame.b) : ""].filter(Boolean).join(",") } : {}),
                      ...(pentaChamps.length ? { champ: pentaChamps.join(",") } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "rankings",
                  query:
                    new URLSearchParams({
                      ...(normLg ? { league: normLg } : {}),
                      ...(featGame?.a
                        ? {
                            q: [tSlug(featGame.a), featGame.b ? tSlug(featGame.b) : ""]
                              .filter(Boolean)
                              .join(","),
                          }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
            </span>
          </div>
          <ul className="space-y-1">
            {o.pentas.map((p, i) => {
              const pFinderQ = slug
                ? new URLSearchParams({
                    event: slug,
                    ...(normLg ? { league: normLg } : {}),
                    ...(yr ? { year: yr } : {}),
                    player: pSlug(p.n, p.u),
                    ...(p.c ? { champ: resolveChampSlug(p.c) } : {}),
                  }).toString()
                : "";
              return (
                <li key={i} className="flex items-center gap-1.5">
                  <HubLink
                    to={{
                      kind: "champ",
                      slug: resolveChampSlug(p.c),
                      query: new URLSearchParams({
                        ...(slug ? { p: `e:${slug}` } : yr ? { p: `y${yr}` } : {}),
                        player: pSlug(p.n, p.u),
                      }).toString(),
                    }}
                    className="hover:opacity-80"
                    title={champName(p.c)}
                  >
                    <ChampIcon name={p.c} size={16} />
                  </HubLink>
                  {(() => {
                    const pentaPQ = new URLSearchParams({
                      ...(slug ? { p: `e:${slug}` } : yr ? { p: `y${yr}` } : {}),
                      ...(p.c ? { champ: resolveChampSlug(p.c) } : {}),
                    }).toString();
                    return (
                      <>
                        <HubLink to={{ kind: "player", slug: pSlug(p.n, p.u), ...(pentaPQ ? { query: pentaPQ } : {}) }} className="shrink-0 hover:opacity-80" title={p.n}>
                          <PlayerPhoto name={p.n} slug={p.u ?? undefined} size={16} />
                        </HubLink>
                        <PlayerLink name={p.n} u={p.u} query={pentaPQ || undefined} />
                      </>
                    );
                  })()}
                  {p.x > 1 &&
                    (p.g ? (
                      <HubLink to={{ kind: "match", slug: p.g, game: p.gn }} className="text-rw-accent hover:underline">
                        ×{p.x}
                      </HubLink>
                    ) : pFinderQ ? (
                      <HubLink to={{ kind: "finder", query: pFinderQ }} className="text-rw-accent hover:underline" title={tl("Game finder")}>
                        ×{p.x}
                      </HubLink>
                    ) : (
                      <span className="text-rw-accent">×{p.x}</span>
                    ))}
                  {p.g ? (
                    <HubLink
                      to={{ kind: "match", slug: p.g, game: p.gn }}
                      className="text-rw-accent hover:underline ml-1"
                    >
                      {tl("Details")}
                    </HubLink>
                  ) : pFinderQ ? (
                    <HubLink
                      to={{ kind: "finder", query: pFinderQ }}
                      className="text-rw-accent hover:underline ml-1"
                    >
                      {tl("Game finder")}
                    </HubLink>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!hidden && o.mvp.length > 0 && (
        <div className="text-xs">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-rw-muted flex items-center gap-1">
              <Crown className="w-3 h-3" />
              {tl("Most Player of the Game awards")}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {featTeams[0] && (
                <HubLink
                  to={{
                    kind: "prep",
                    a: featTeams[0],
                    ...(featTeams[1] ? { b: featTeams[1] } : {}),
                    ...(slug ? { period: `e:${slug}` } : yr ? { period: `y${yr}` } : {}),
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
              )}
              {mvpPlayers[0] && (
                <>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "player",
                      a: mvpPlayers[0],
                      ...(mvpPlayers[1] ? { b: mvpPlayers[1] } : {}),
                      period: slug ? `e:${slug}` : yr ? `y${yr}` : undefined,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  {pentaChamps[0] && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(pentaChamps[0])}${pentaChamps[1] ? `&vs=${encodeURIComponent(pentaChamps[1])}` : ""}${slug ? `&event=${encodeURIComponent(slug)}` : ""}${yr ? `&patch=y${yr}&year=${yr}` : ""}`,
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: new URLSearchParams({
                        player: mvpPlayers[0],
                        ...(mvpPlayers[1] ? { vsplayer: mvpPlayers[1] } : {}),
                        ...(featTeams[0] ? { team: featTeams[0] } : {}),
                        ...(featTeams[1] ? { vs: featTeams[1] } : {}),
                        ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                        ...(pentaChamps[1] ? { vschamp: pentaChamps[1] } : {}),
                        ...(normLg ? { league: normLg } : {}),
                        ...(yr ? { year: yr } : {}),
                        ...(slug ? { event: slug } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                </>
              )}
              {(slug || yr || featTeams[0] || pentaChamps[0]) && (
                <HubLink
                  to={{
                    kind: "draft",
                    query: new URLSearchParams({
                      ...(slug ? { p: `e:${slug}` } : yr ? { p: `y${yr}` } : {}),
                      ...(featTeams.length ? { teams: featTeams.join(",") } : {}),
                      ...(pentaChamps.length ? { champ: pentaChamps.join(",") } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "leaders",
                  query:
                    new URLSearchParams({
                      ...(normLg ? { league: normLg } : {}),
                      ...(yr ? { year: yr } : {}),
                      ...(slug ? { event: slug } : {}),
                      ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                      ...(mvpPlayers.length || featTeams.length
                        ? { q: [...mvpPlayers, ...featTeams].filter(Boolean).join(",") }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Leaderboards")} →
              </HubLink>
              {slug && (
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      event: slug,
                      ...(normLg ? { league: normLg } : {}),
                      ...(yr ? { year: yr } : {}),
                      ...(mvpPlayers[0] ? { player: mvpPlayers[0] } : {}),
                      ...(mvpPlayers[1] ? { vsplayer: mvpPlayers[1] } : {}),
                      ...(featTeams[0] ? { team: featTeams[0] } : {}),
                      ...(featTeams[1] ? { vs: featTeams[1] } : {}),
                      ...(pentaChamps[0] ? { champ: pentaChamps[0] } : {}),
                      ...(pentaChamps[1] ? { vschamp: pentaChamps[1] } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
              )}
              <HubLink to={{ kind: "tiers", query: tiersQuery }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  query:
                    new URLSearchParams({
                      ...(normLg ? { league: normLg } : {}),
                      ...(featGame?.a
                        ? {
                            q: [tSlug(featGame.a), featGame.b ? tSlug(featGame.b) : ""]
                              .filter(Boolean)
                              .join(","),
                          }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const maxM = Math.max(1, ...o.mvp.map((m) => m.v));
              return o.mvp.map((m) => (
                <span key={m.n} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-rw-border bg-rw-bg/50">
                  <HubLink to={{ kind: "player", slug: pSlug(m.n, m.u), ...(evQ ? { query: evQ } : {}) }} className="shrink-0 hover:opacity-80" title={m.n}>
                    <PlayerPhoto name={m.n} slug={m.u ?? undefined} size={16} />
                  </HubLink>
                  <PlayerLink name={m.n} u={m.u} query={evQ} />
                  <span className="w-6 h-1 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                    <span className="h-full bg-rw-accent/85 rounded-full" style={{ width: `${Math.round((m.v / maxM) * 100)}%` }} />
                  </span>
                  {slug ? (
                    <HubLink
                      to={{ kind: "finder", query: `${evBaseFinderQuery}&player=${encodeURIComponent(pSlug(m.n, m.u))}` }}
                      className="text-rw-accent font-bold tabular-nums hover:underline"
                      title={tl("Game finder")}
                    >
                      {m.v}
                    </HubLink>
                  ) : (
                    <span className="text-rw-accent font-bold tabular-nums">{m.v}</span>
                  )}
                </span>
              ));
            })()}
          </div>
        </div>
      )}
      <p className="text-[10px] text-rw-muted flex items-center gap-1">
        <Timer className="w-3 h-3" />
        {tl("Games with a full scoreboard only.")}
      </p>
    </Section>
  );
};

/** Every team's roster for the tournament, including substitutes and coaches (Leaguepedia's rosters). */
export const EventRosters: React.FC<{ rosters: EventRoster[]; eventSlug?: string; leagueSlug?: string | null; year?: string; initialSearch?: string }> = ({
  rosters,
  eventSlug,
  leagueSlug,
  year,
  initialSearch = "",
}) => {
  const [open, setOpen] = useState(rosters.length <= 4);
  const [search, setSearch] = useState(initialSearch);
  const aliases = useLoad(loadAliases, []);
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);
  const q = normText(search);
  const yr = year && /^\d{4}$/.test(year) ? year : eventSlug && /\d{4}/.test(eventSlug) ? /\d{4}/.exec(eventSlug)![0] : undefined;
  const filteredRosters = useMemo(() => {
    if (!q) return rosters;
    const terms = q.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => normText(s)).filter(Boolean);
    return rosters.filter((t) => {
      const hay = normText(
        `${t.t} ${t.u || ""} ${t.r || ""} ${t.r ? regionName(t.r, t.r) : ""} ${t.p
          .map(([n, u, r, flag]) => `${n} ${u || ""} ${r || ""} ${flag || ""} ${flag ? localCountry(flag) : ""}`)
          .join(" ")}`,
      );
      const teamS = resolveTeamAlias(aliases.data?.team[(t.u || t.t).toLowerCase()] || t.u || t.t) || prettySlug(t.t);
      const rowReg = t.r ? resolveRegionFilter(t.r) : null;
      return terms.some((term) => {
        const qAlias = searchAlias(term);
        if (hay.includes(term) || (bare(term).length >= 2 && bare(hay).includes(bare(term)))) return true;
        if (qAlias && (hay.includes(qAlias) || (bare(qAlias).length >= 2 && bare(hay).includes(bare(qAlias))))) return true;
        const canonTerm = resolveTeamAlias(aliases.data?.team[term] || term) || (qAlias ? resolveTeamAlias(aliases.data?.team[qAlias] || qAlias) : "") || prettySlug(qAlias || term);
        if (canonTerm && canonTerm === teamS) return true;
        const canonReg = resolveRegionFilter(term) || (qAlias ? resolveRegionFilter(qAlias) : null);
        if (rowReg && canonReg && canonReg === rowReg) return true;
        const qRole = normalizeRole(term) || (qAlias ? normalizeRole(qAlias) : null);
        if (qRole && t.p.some(([, , r]) => normalizeRole(r) === qRole)) return true;
        const pTerm = resolvePlayerSlug(term);
        const pAlias = qAlias ? resolvePlayerSlug(qAlias) : "";
        return t.p.some(([n, u]) => {
          const ps = pSlug(n, u);
          return pTerm === ps || (pAlias ? pAlias === ps : false);
        });
      });
    });
  }, [rosters, q, aliases.data]);
  const shownRosters = open || q ? filteredRosters : filteredRosters.slice(0, 4);
  const qRole = q ? normalizeRole(q) || (searchAlias(q) ? normalizeRole(searchAlias(q)) : null) : null;
  const normLg = leagueSlug ? resolveLeagueSlug(leagueSlug) : "";
  const pickPlayer = (tr?: EventRoster, exclude?: string | null) => {
    if (!tr) return null;
    const byRole = qRole ? tr.p.find(([n, u, r]) => normalizeRole(r) === qRole && pSlug(n, u) !== exclude) : null;
    const starter = byRole || tr.p.find(([n, u, r]) => !/coach/i.test(r || "") && pSlug(n, u) !== exclude);
    return starter ? pSlug(starter[0], starter[1]) : null;
  };
  const rTeams = useMemo(() => {
    const out: string[] = [];
    for (const t of [...filteredRosters, ...rosters]) {
      const s = tSlug(t.t, t.u);
      if (s && !out.includes(s)) out.push(s);
      if (out.length >= 2) break;
    }
    return out;
  }, [filteredRosters, rosters]);
  const rTeam0 = rTeams[0] || "";
  const rTeam1 = rTeams[1] || "";
  const rPeriod = eventSlug ? `e:${eventSlug}` : yr ? `y${yr}` : undefined;
  const rPeriodQ = rPeriod ? `p=${encodeURIComponent(rPeriod)}` : undefined;
  const topRosterP1 = pickPlayer(filteredRosters[0]);
  const topRosterP2 =
    pickPlayer(filteredRosters[1], topRosterP1) ||
    pickPlayer(
      rosters.find((r) => tSlug(r.t, r.u) === rTeam1),
      topRosterP1,
    ) ||
    pickPlayer(filteredRosters[0], topRosterP1);
  return (
    <Section
      title={tl("Team rosters")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {(rosters.length > 4 || Boolean(search.trim())) && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-40"
            />
          )}
          {filteredRosters.length >= 1 && rTeam0 && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: rTeam0,
                  ...(rTeam1 ? { b: rTeam1 } : {}),
                  period: rPeriod,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(rTeams.join(","))}${rPeriodQ ? `&${rPeriodQ}` : ""}${qRole ? `&role=${encodeURIComponent(qRole)}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: rTeam0,
                  ...(rTeam1 ? { b: rTeam1 } : {}),
                  period: rPeriod,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    ...(eventSlug ? { event: eventSlug } : {}),
                    ...(topRosterP1 ? { player: topRosterP1 } : {}),
                    ...(topRosterP2 && topRosterP2 !== topRosterP1 ? { vsplayer: topRosterP2 } : {}),
                    team: rTeam0,
                    ...(rTeam1 ? { vs: rTeam1 } : {}),
                    ...(qRole ? { role: qRole } : {}),
                    ...(normLg ? { league: normLg } : {}),
                    ...(yr ? { year: yr } : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
            </>
          )}
          {filteredRosters.length > 0 && (
            <>
              <HubLink
                to={{
                  kind: "teams",
                  ...(rTeams.length >= 1
                    ? { query: `q=${encodeURIComponent(rTeams.join(","))}` }
                    : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Teams")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query:
                    new URLSearchParams({
                      ...(normLg ? { league: normLg } : {}),
                      ...(yr ? { year: yr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(qRole ? { role: qRole } : {}),
                      ...(rTeams.length >= 1 || topRosterP1
                        ? { q: [rTeam0, rTeam1, topRosterP1 || "", topRosterP2 || ""].filter(Boolean).join(",") }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  query:
                    new URLSearchParams({
                      ...(normLg ? { league: normLg } : {}),
                      ...(rTeams.length >= 1
                        ? {
                            q: rTeams.join(","),
                          }
                        : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query:
                    new URLSearchParams({
                      ...(normLg ? { scope: normLg, league: normLg } : {}),
                      ...(yr ? { key: `y${yr}`, year: yr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                      ...(qRole ? { role: qRole } : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              {eventSlug && (
                <HubLink
                  to={{
                    kind: "finder",
                    query: `event=${encodeURIComponent(eventSlug)}${normLg ? `&league=${encodeURIComponent(normLg)}` : ""}${yr ? `&year=${encodeURIComponent(yr)}` : ""}${qRole ? `&role=${encodeURIComponent(qRole)}` : ""}${
                      topRosterP1 ? `&player=${encodeURIComponent(topRosterP1)}${topRosterP2 && topRosterP2 !== topRosterP1 ? `&vsplayer=${encodeURIComponent(topRosterP2)}` : ""}` : ""
                    }${
                      rTeam0
                        ? `&team=${encodeURIComponent(rTeam0)}${
                            rTeam1 && rTeam1 !== rTeam0
                              ? `&vs=${encodeURIComponent(rTeam1)}`
                              : ""
                          }`
                        : ""
                    }`,
                  }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
              )}
              <CopyExtrasPost
                title={tl("Team rosters")}
                rows={filteredRosters.slice(0, 6).map((t) => {
                  const starters = t.p
                    .filter(([, , r]) => !/coach/i.test(r || ""))
                    .slice(0, 5)
                    .map(([n]) => n)
                    .join(" · ");
                  return `${t.t}${t.r ? ` (${regionName(t.r, t.r)})` : ""}: ${starters}`;
                })}
              />
              <SectionCard
                section={tl("Team rosters")}
                name={tl("Team rosters")}
                rows={() =>
                  filteredRosters.slice(0, 12).map((t, idx) => ({
                    rank: idx + 1,
                    team: t.t,
                    label: t.t,
                    sub: t.r ? regionName(t.r, t.r) : undefined,
                    value: t.p
                      .filter(([, , r]) => !/coach/i.test(r || ""))
                      .slice(0, 5)
                      .map(([n]) => n)
                      .join(" · "),
                  }))
                }
              />
            </>
          )}
          {rosters.length > 4 && !q && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {open
                ? tl("Show fewer")
                : tl("Show all {n}", { n: rosters.length })}
            </button>
          )}
        </span>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shownRosters.map((t) => (
          <div
            key={t.t}
            className="bg-rw-bg border border-rw-border rounded-lg p-2 text-xs min-w-0"
          >
            <div className="font-semibold mb-1.5 flex items-center gap-1.5 truncate">
              {(() => {
                const ts = tSlug(t.t, t.u);
                const vsRTeam = rTeam0 && rTeam1 ? (rTeam0 === ts ? rTeam1 : rTeam1 === ts ? rTeam0 : "") : "";
                const st0 = t.p.find(([, , r]) => !/coach/i.test(r || ""));
                const st0Slug = st0 ? pSlug(st0[0], st0[1]) : "";
                const rTeamQ = new URLSearchParams({
                  ...(rPeriod ? { p: rPeriod } : {}),
                  ...(vsRTeam ? { q: vsRTeam } : st0Slug ? { q: st0Slug } : {}),
                }).toString();
                return (
                  <>
                    <HubLink
                      to={{ kind: "team", slug: ts, ...(rTeamQ ? { query: rTeamQ } : {}) }}
                      className="shrink-0 hover:opacity-80"
                      title={t.t}
                    >
                      <TeamLogo name={t.t} size={16} />
                    </HubLink>
                    <TeamLink name={t.t} u={t.u} query={rTeamQ || undefined} />
                  </>
                );
              })()}
              {t.r && (
                <HubLink to={{ kind: "leagues", query: `q=${encodeURIComponent(t.r)}` }} className="text-rw-muted hover:text-rw-accent hover:underline text-[10px] ml-0.5">
                  {regionName(t.r, t.r)}
                </HubLink>
              )}
              {(eventSlug || yr || normLg) && (
                <HubLink
                  to={{
                    kind: "finder",
                    query: (() => {
                      const st = t.p.filter(([, , r]) => !/coach/i.test(r || "")).map(([n, u]) => pSlug(n, u)).filter(Boolean);
                      return new URLSearchParams({
                        ...(eventSlug ? { event: eventSlug } : {}),
                        ...(normLg ? { league: normLg } : {}),
                        ...(yr ? { year: yr } : {}),
                        team: tSlug(t.t, t.u),
                        ...(st[0] ? { player: st[0] } : {}),
                        ...(st[1] && st[1] !== st[0] ? { vsplayer: st[1] } : {}),
                      }).toString();
                    })(),
                  }}
                  className="ml-auto text-[10px] font-normal text-rw-muted hover:text-rw-accent hover:underline shrink-0"
                  title={tl("Game finder")}
                >
                  {tl("Games")} →
                </HubLink>
              )}
            </div>
            <ul className="space-y-1">
              {t.p.map(([n, u, role, flag], i) => {
                const isCoach = /coach/i.test(role || "");
                const normRole = !isCoach && role ? normalizeRole(role) || role : undefined;
                const pQ =
                  new URLSearchParams({
                    ...(rPeriod ? { p: rPeriod } : {}),
                    team: tSlug(t.t, t.u),
                    ...(normRole ? { role: normRole } : {}),
                  }).toString() || undefined;
                return (
                  <li key={i} className="flex items-center justify-between gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                      <HubLink
                        to={{ kind: "player", slug: pSlug(n, u), ...(pQ ? { query: pQ } : {}) }}
                        className="shrink-0 hover:opacity-80"
                        title={n}
                      >
                        <PlayerPhoto name={n} team={t.t} slug={u ?? undefined} size={16} />
                      </HubLink>
                      <PlayerLink name={n} u={u} query={pQ} />
                    </span>
                    <span className="inline-flex items-center gap-1 text-rw-muted shrink-0 text-[10px]">
                      {role ? (
                        isCoach ? (
                          tl("Coach")
                        ) : (
                          <HubLink
                            to={{
                              kind: "player",
                              slug: pSlug(n, u),
                              tab: "stats",
                              ...(pQ ? { query: pQ } : {}),
                            }}
                            className="hover:text-rw-accent hover:underline"
                            title={tl("Stats")}
                          >
                            {roleName(role)}
                          </HubLink>
                        )
                      ) : (
                        ""
                      )}
                      {flag ? (
                        <>
                          {role ? " · " : ""}
                          <CountryFlag cc={flag} />
                          <span>{localCountry(flag)}</span>
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
};

/** International events: how each region did against each other region (series). */
export const RegionalRecords: React.FC<{ e: HubEvent; hidden?: boolean }> = ({
  e,
  hidden,
}) => {
  if (!e.regions || e.regions.length === 0 || hidden) return null;
  const lgSlug = e.lu ? resolveLeagueSlug(e.lu) : "";
  const regPair = (codeA?: string, codeB?: string): [string, string] => {
    const aTeams = (e.rosters || []).filter((tr) => tr.r === codeA).map((tr) => tSlug(tr.t, tr.u)).filter(Boolean);
    const bTeams = (e.rosters || []).filter((tr) => tr.r === codeB).map((tr) => tSlug(tr.t, tr.u)).filter(Boolean);
    const tA = aTeams[0] || "";
    const tB = bTeams.find((t) => t !== tA) || "";
    return [tA, tB];
  };
  const [topTeamA, topTeamB] = regPair(e.regions[0]?.a, e.regions[0]?.b);
  const regPlayers = (() => {
    const out: string[] = [];
    for (const t of [topTeamA, topTeamB]) {
      if (!t) continue;
      const pFromStats = (e.players || []).find((p) => tSlug(p.t, p.tu) === t);
      if (pFromStats) {
        const ps = pSlug(pFromStats.n, pFromStats.u);
        if (ps && !out.includes(ps)) out.push(ps);
        continue;
      }
      const rFromRosters = (e.rosters || []).find((tr) => tSlug(tr.t, tr.u) === t);
      const st = rFromRosters?.p.find(([, , r]) => !/coach/i.test(r || ""));
      if (st) {
        const ps = pSlug(st[0], st[1]);
        if (ps && !out.includes(ps)) out.push(ps);
      }
    }
    for (const p of e.players || []) {
      if (out.length >= 2) break;
      const ps = pSlug(p.n, p.u);
      if (ps && !out.includes(ps)) out.push(ps);
    }
    return out.slice(0, 2);
  })();
  const regChamps = (() => {
    const out: string[] = [];
    for (const c of e.champs || []) {
      const cs = resolveChampSlug(c.c);
      if (cs && !out.includes(cs)) out.push(cs);
      if (out.length >= 2) break;
    }
    return out;
  })();
  const evYr = (e.start || e.end) && /^\d{4}/.test(e.start || e.end || "") ? (e.start || e.end || "").slice(0, 4) : "";
  return (
    <Section
      title={tl("Region vs region")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {topTeamA && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: topTeamA,
                  ...(topTeamB && topTeamB !== topTeamA ? { b: topTeamB } : {}),
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
                  a: topTeamA,
                  ...(topTeamB && topTeamB !== topTeamA ? { b: topTeamB } : {}),
                  period: `e:${e.u}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Compare")} →
              </HubLink>
            </>
          )}
          <HubLink
            to={{
              kind: "rankings",
              query:
                new URLSearchParams({
                  ...(lgSlug ? { league: lgSlug } : {}),
                  ...(topTeamA ? { q: [topTeamA, topTeamB && topTeamB !== topTeamA ? topTeamB : ""].filter(Boolean).join(",") } : {}),
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
              query: `${topTeamA ? `teams=${encodeURIComponent(topTeamA)}${topTeamB && topTeamB !== topTeamA ? `,${encodeURIComponent(topTeamB)}` : ""}&` : ""}p=e:${encodeURIComponent(e.u)}${regChamps.length >= 1 ? `&champ=${encodeURIComponent(regChamps.join(","))}` : ""}`,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Draft board")} →
          </HubLink>
          {regChamps[0] && (
            <HubLink
              to={{
                kind: "counters",
                query: `champ=${encodeURIComponent(regChamps[0])}${regChamps[1] ? `&vs=${encodeURIComponent(regChamps[1])}` : ""}&event=${encodeURIComponent(e.u)}${evYr ? `&patch=y${evYr}&year=${evYr}` : ""}`,
              }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Counters")} →
            </HubLink>
          )}
          <HubLink
            to={{ kind: "leagues" }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Leagues")} →
          </HubLink>
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                ...(lgSlug ? { league: lgSlug } : {}),
                ...(evYr ? { year: evYr } : {}),
                event: e.u,
                ...(regChamps[0] ? { champ: regChamps[0] } : {}),
                ...(topTeamA || regPlayers[0]
                  ? { q: [topTeamA, topTeamB && topTeamB !== topTeamA ? topTeamB : "", ...regPlayers].filter(Boolean).join(",") }
                  : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Player leaderboards")} →
          </HubLink>
          <HubLink
            to={{
              kind: "best",
              query:
                new URLSearchParams({
                  ...(lgSlug ? { league: lgSlug } : {}),
                  ...(e.u ? { event: e.u } : {}),
                  ...(evYr ? { year: evYr } : {}),
                  ...(topTeamA ? { q: [topTeamA, topTeamB && topTeamB !== topTeamA ? topTeamB : ""].filter(Boolean).join(",") } : {}),
                }).toString() || undefined,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Best games")} →
          </HubLink>
          <HubLink
            to={{
              kind: "items",
              query: new URLSearchParams({
                ...(lgSlug ? { league: lgSlug } : {}),
                ...(evYr ? { year: evYr } : {}),
                event: e.u,
                ...(regPlayers[0] ? { player: regPlayers[0] } : {}),
                ...(regPlayers[1] ? { vsplayer: regPlayers[1] } : {}),
                ...(topTeamA ? { team: topTeamA } : {}),
                ...(topTeamB && topTeamB !== topTeamA ? { vs: topTeamB } : {}),
                ...(regChamps[0] ? { champ: regChamps[0] } : {}),
                ...(regChamps[1] ? { vschamp: regChamps[1] } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Item history")} →
          </HubLink>
          <HubLink
            to={{
              kind: "finder",
              query: new URLSearchParams({
                ...(lgSlug ? { league: lgSlug } : {}),
                event: e.u,
                ...(regPlayers[0] ? { player: regPlayers[0] } : {}),
                ...(regPlayers[1] ? { vsplayer: regPlayers[1] } : {}),
                ...(topTeamA ? { team: topTeamA } : {}),
                ...(topTeamB && topTeamB !== topTeamA ? { vs: topTeamB } : {}),
                ...(regChamps[0] ? { champ: regChamps[0] } : {}),
                ...(regChamps[1] ? { vschamp: regChamps[1] } : {}),
                ...(evYr ? { year: evYr } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Game finder")} →
          </HubLink>
          <HubLink
            to={{
              kind: "tiers",
              query:
                new URLSearchParams({
                  ...(lgSlug ? { scope: lgSlug, league: lgSlug } : {}),
                  ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                  event: e.u,
                  ...(regChamps.length >= 1 ? { q: regChamps.join(",") } : {}),
                }).toString() || undefined,
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <CopyExtrasPost
            title={`${tl("Region vs region")} · ${e.n}`}
            rows={e.regions.slice(0, 8).map((r) => `${regionName(r.a, r.a)} ${r.wa} – ${r.wb} ${regionName(r.b, r.b)}`)}
          />
          <SectionCard
            section={tl("Region vs region")}
            sub={e.n}
            name={`${e.u}-regions`}
            rows={() =>
              e.regions!.slice(0, 10).map((r, idx) => ({
                rank: idx + 1,
                label: `${regionName(r.a, r.a)} vs ${regionName(r.b, r.b)}`,
                value: `${r.wa} – ${r.wb}`,
                win: r.wa + r.wb > 0 ? r.wa >= r.wb : undefined,
              }))
            }
          />
        </span>
      }
    >
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Regions")}</th>
            <th className={th}>{tl("Series")}</th>
          </tr>
        </thead>
        <tbody>
          {e.regions.map((r) => {
            const total = r.wa + r.wb;
            const pctA = total > 0 ? Math.round((r.wa / total) * 100) : 50;
            return (
              <tr key={r.a + r.b} className="border-t border-rw-border">
                <td className={`${td} text-rw-text`} data-sort={regionName(r.a, r.a)}>
                  <HubLink
                    to={{ kind: "leagues", query: `q=${encodeURIComponent(`${r.a}, ${r.b}`)}` }}
                    className="inline-flex items-center gap-1.5 flex-wrap hover:text-rw-accent"
                  >
                    <RegionFlag code={r.a} />
                    <span className="hover:underline">{regionName(r.a, r.a)}</span>
                    <span className="text-rw-muted">vs</span>
                    <RegionFlag code={r.b} />
                    <span className="hover:underline">{regionName(r.b, r.b)}</span>
                  </HubLink>
                </td>
                <td className={`${td} tabular-nums`} data-sort={r.wa - r.wb}>
                  <span className="inline-flex items-center gap-2">
                    <HubLink
                      to={{
                        kind: "finder",
                        query: (() => {
                          const [rA, rB] = regPair(r.a, r.b);
                          const pFor = (ts: string) => {
                            if (!ts) return "";
                            const ps = (e.players || []).find((p) => tSlug(p.t, p.tu) === ts);
                            if (ps) return pSlug(ps.n, ps.u);
                            const tr = (e.rosters || []).find((x) => tSlug(x.t, x.u) === ts);
                            const st = tr?.p.find(([, , rl]) => !/coach/i.test(rl || ""));
                            return st ? pSlug(st[0], st[1]) : "";
                          };
                          const pA = pFor(rA);
                          const pB = pFor(rB);
                          return new URLSearchParams({
                            event: e.u,
                            ...(lgSlug ? { league: lgSlug } : {}),
                            ...(evYr ? { year: evYr } : {}),
                            ...(rA ? { team: rA } : {}),
                            ...(rB ? { vs: rB } : {}),
                            ...(pA ? { player: pA } : {}),
                            ...(pB && pB !== pA ? { vsplayer: pB } : {}),
                          }).toString();
                        })(),
                      }}
                      className="hover:underline"
                      title={tl("Game finder")}
                    >
                      <span
                        className={
                          r.wa > r.wb ? "text-rw-teal font-bold" : "text-rw-sub"
                        }
                      >
                        {r.wa}
                      </span>
                      <span className="text-rw-muted"> – </span>
                      <span
                        className={
                          r.wb > r.wa ? "text-rw-teal font-bold" : "text-rw-sub"
                        }
                      >
                        {r.wb}
                      </span>
                    </HubLink>
                    {total > 0 && (
                      <>
                        <span className="w-16 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                          <span className={`h-full ${r.wa > r.wb ? "bg-rw-teal/85" : "bg-rw-sub/65"}`} style={{ width: `${pctA}%` }} />
                          <span className={`h-full ${r.wb > r.wa ? "bg-rw-teal/85" : "bg-rw-sub/65"}`} style={{ width: `${100 - pctA}%` }} />
                        </span>
                        <span className="text-[11px] text-rw-muted font-mono">({pctA}%)</span>
                      </>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </STable>
    </Section>
  );
};

const CopyExtrasPost: React.FC<{ title: string; rows: string[] }> = ({ title, rows }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [title];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push(hubShareUrl(currentHubRoute()));
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
