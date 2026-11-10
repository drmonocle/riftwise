/** Tournament page extras: quick facts, team rosters (with subs and coaches), records between regions. */
import React, { useMemo, useState } from "react";
import { Flame, Crown, Timer, Swords } from "lucide-react";
import { tl, tk, roleName, regionName } from "../../i18n";
import { prettySlug } from "../../hub/data";
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
} from "./ui";
import { RegionFlag } from "./RegionStats";
import { CountryFlag, localCountry } from "./CountryFlag";
import { STable } from "../STable";
import { BroadcastCardButton, SectionCard, type CardData } from "./BroadcastCard";

const mmss = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
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
}> = ({ label, r, value }) =>
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
            <HubLink to={{ kind: "team", slug: prettySlug(r.a) }} className="shrink-0 hover:opacity-80" title={r.a}>
              <TeamLogo name={r.a} size={13} />
            </HubLink>
            <TeamLink name={r.a} />
            <HubLink
              to={{ kind: "compare", mode: "team", a: prettySlug(r.a), b: prettySlug(r.b) }}
              className="text-rw-muted hover:text-rw-accent hover:underline"
              title={tl("Compare")}
            >
              vs
            </HubLink>
            <HubLink to={{ kind: "team", slug: prettySlug(r.b) }} className="shrink-0 hover:opacity-80" title={r.b}>
              <TeamLogo name={r.b} size={13} />
            </HubLink>
            <TeamLink name={r.b} />
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
  const yr = year && /^\d{4}$/.test(year) ? year : slug && /\d{4}/.test(slug) ? /\d{4}/.exec(slug)![0] : undefined;
  const tiersQuery =
    new URLSearchParams({
      ...(leagueSlug ? { league: leagueSlug } : {}),
      ...(yr ? { year: yr } : {}),
    }).toString() || undefined;
  return (
    <Section
      title={tl("Tournament stats")}
      share="tournament-facts"
      right={
        !hidden ? (
          <span className="flex flex-wrap items-center gap-2">
            {featGame?.a && featGame?.b && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: prettySlug(featGame.a),
                    b: prettySlug(featGame.b),
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
                    query: `teams=${encodeURIComponent(prettySlug(featGame.a))},${encodeURIComponent(prettySlug(featGame.b))}${slug ? `&p=e:${encodeURIComponent(slug)}` : ""}`,
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
                    a: prettySlug(featGame.a),
                    b: prettySlug(featGame.b),
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
                <HubLink
                  to={{ kind: "records" }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Records")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(yr ? { year: yr } : {}),
                      event: slug,
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{ kind: "draft", query: `p=e:${encodeURIComponent(slug)}` }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "tiers", query: tiersQuery }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{ kind: "rankings", ...(leagueSlug ? { query: `league=${encodeURIComponent(leagueSlug)}` } : {}) }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `event=${encodeURIComponent(slug)}${featGame?.a ? `&team=${encodeURIComponent(prettySlug(featGame.a))}${featGame.b ? `&vs=${encodeURIComponent(prettySlug(featGame.b))}` : ""}` : ""}`,
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
          to={slug ? { kind: "finder", query: `event=${encodeURIComponent(slug)}` } : undefined}
        />
        <Stat
          label={tl("Avg game")}
          value={o.min ? mmss(o.min) : "–"}
          to={slug && o.min ? { kind: "finder", query: `event=${encodeURIComponent(slug)}` } : undefined}
        />
        <Stat
          label={tl("Kills / game")}
          value={o.kills || "–"}
          to={slug && o.kills ? { kind: "finder", query: `event=${encodeURIComponent(slug)}` } : undefined}
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
          to={slug && !hidden && sideTotal > 0 ? { kind: "finder", query: `event=${encodeURIComponent(slug)}&side=b` } : undefined}
        />
      </div>
      {!hidden && sideTotal > 0 && (
        <div className="rounded-lg border border-rw-border bg-rw-bg/50 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            {slug ? (
              <HubLink
                to={{ kind: "finder", query: `event=${encodeURIComponent(slug)}&side=b` }}
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
                to={{ kind: "finder", query: `event=${encodeURIComponent(slug)}&side=r` }}
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
                    <HubLink to={{ kind: "team", slug: prettySlug(o.best.a) }} className="shrink-0 hover:opacity-80" title={o.best.a}>
                      <TeamLogo name={o.best.a} size={13} />
                    </HubLink>
                    <TeamLink name={o.best.a} />
                    <HubLink
                      to={{ kind: "compare", mode: "team", a: prettySlug(o.best.a), b: prettySlug(o.best.b) }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                      title={tl("Compare")}
                    >
                      vs
                    </HubLink>
                    <HubLink to={{ kind: "team", slug: prettySlug(o.best.b) }} className="shrink-0 hover:opacity-80" title={o.best.b}>
                      <TeamLogo name={o.best.b} size={13} />
                    </HubLink>
                    <TeamLink name={o.best.b} />
                  </span>
                )}
              </span>
            </li>
          )}
          <GameLine
            label={tl("Shortest game")}
            r={o.short}
            value={o.short ? mmss(o.short.v) : ""}
          />
          <GameLine
            label={tl("Longest game")}
            r={o.long}
            value={o.long ? mmss(o.long.v) : ""}
          />
          <GameLine
            label={tl("Most kills in a game")}
            r={o.bloody}
            value={o.bloody ? tl("{n} kills", { n: o.bloody.v }) : ""}
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
                <HubLink to={{ kind: "player", slug: o.farm.u || prettySlug(o.farm.n) }} className="shrink-0 hover:opacity-80" title={o.farm.n}>
                  <PlayerPhoto name={o.farm.n} slug={o.farm.u ?? undefined} size={15} />
                </HubLink>
                <PlayerLink name={o.farm.n} u={o.farm.u} />
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
                to={{ kind: "finder", query: `event=${encodeURIComponent(slug)}` }}
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
                    to={{ kind: "finder", query: `event=${encodeURIComponent(slug)}` }}
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
              {o.pentas[0] && (
                <>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "player",
                      a: o.pentas[0].u || prettySlug(o.pentas[0].n),
                      ...(o.pentas[1] && (o.pentas[1].u || prettySlug(o.pentas[1].n)) !== (o.pentas[0].u || prettySlug(o.pentas[0].n))
                        ? { b: o.pentas[1].u || prettySlug(o.pentas[1].n) }
                        : {}),
                      ...(slug ? { period: `e:${slug}` } : {}),
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  {o.pentas[0].c && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(prettySlug(o.pentas[0].c))}${o.pentas[1]?.c && o.pentas[1].c !== o.pentas[0].c ? `&vs=${encodeURIComponent(prettySlug(o.pentas[1].c))}` : ""}`,
                      }}
                      className="text-[11px] text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: `player=${encodeURIComponent(o.pentas[0].u || prettySlug(o.pentas[0].n))}${o.pentas[0].c ? `&champ=${encodeURIComponent(prettySlug(o.pentas[0].c))}` : ""}${yr ? `&year=${yr}` : ""}`,
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
                        ...(leagueSlug ? { league: leagueSlug } : {}),
                        ...(yr ? { year: yr } : {}),
                        event: slug,
                        ...(o.pentas[0]?.c ? { champ: o.pentas[0].c } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `event=${encodeURIComponent(slug)}${o.pentas[0] ? `&player=${encodeURIComponent(o.pentas[0].u || o.pentas[0].n)}${o.pentas[0].c ? `&champ=${encodeURIComponent(o.pentas[0].c)}` : ""}` : ""}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                </>
              )}
              <HubLink to={{ kind: "records" }} className="text-[11px] text-rw-accent hover:underline">
                {tl("Records")} →
              </HubLink>
              <HubLink to={{ kind: "tiers", query: tiersQuery }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink to={{ kind: "rankings", ...(leagueSlug ? { query: `league=${encodeURIComponent(leagueSlug)}` } : {}) }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Power rankings")} →
              </HubLink>
            </span>
          </div>
          <ul className="space-y-1">
            {o.pentas.map((p, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <HubLink to={{ kind: "champ", slug: prettySlug(p.c) }} className="hover:opacity-80" title={champName(p.c)}>
                  <ChampIcon name={p.c} size={16} />
                </HubLink>
                <HubLink to={{ kind: "player", slug: p.u || prettySlug(p.n) }} className="shrink-0 hover:opacity-80" title={p.n}>
                  <PlayerPhoto name={p.n} slug={p.u ?? undefined} size={16} />
                </HubLink>
                <PlayerLink name={p.n} u={p.u} />
                {p.x > 1 &&
                  (p.g ? (
                    <HubLink to={{ kind: "match", slug: p.g, game: p.gn }} className="text-rw-accent hover:underline">
                      ×{p.x}
                    </HubLink>
                  ) : (
                    <span className="text-rw-accent">×{p.x}</span>
                  ))}
                {p.g && (
                  <HubLink
                    to={{ kind: "match", slug: p.g, game: p.gn }}
                    className="text-rw-accent hover:underline ml-1"
                  >
                    {tl("Details")}
                  </HubLink>
                )}
              </li>
            ))}
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
            <span className="flex items-center gap-2">
              {o.mvp.length >= 1 && (
                <>
                  <HubLink
                    to={{
                      kind: "compare",
                      mode: "player",
                      a: o.mvp[0].u || prettySlug(o.mvp[0].n),
                      ...(o.mvp[1] ? { b: o.mvp[1].u || prettySlug(o.mvp[1].n) } : {}),
                      period: slug ? `e:${slug}` : undefined,
                    }}
                    className="text-[11px] text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "items", query: `player=${encodeURIComponent(o.mvp[0].u || prettySlug(o.mvp[0].n))}${yr ? `&year=${yr}` : ""}` }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                </>
              )}
              <HubLink
                to={{
                  kind: "leaders",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(yr ? { year: yr } : {}),
                      ...(slug ? { event: slug } : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Leaderboards")} →
              </HubLink>
              {slug && (
                <HubLink
                  to={{ kind: "finder", query: `event=${encodeURIComponent(slug)}${o.mvp[0]?.u ? `&player=${encodeURIComponent(o.mvp[0].u)}` : ""}` }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
              )}
              <HubLink to={{ kind: "tiers", query: tiersQuery }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink to={{ kind: "rankings", ...(leagueSlug ? { query: `league=${encodeURIComponent(leagueSlug)}` } : {}) }} className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline">
                {tl("Power rankings")} →
              </HubLink>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const maxM = Math.max(1, ...o.mvp.map((m) => m.v));
              return o.mvp.map((m) => (
                <span key={m.n} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-rw-border bg-rw-bg/50">
                  <HubLink to={{ kind: "player", slug: m.u || prettySlug(m.n) }} className="shrink-0 hover:opacity-80" title={m.n}>
                    <PlayerPhoto name={m.n} slug={m.u ?? undefined} size={16} />
                  </HubLink>
                  <PlayerLink name={m.n} u={m.u} />
                  <span className="w-6 h-1 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                    <span className="h-full bg-rw-accent/85 rounded-full" style={{ width: `${Math.round((m.v / maxM) * 100)}%` }} />
                  </span>
                  {slug ? (
                    <HubLink
                      to={{ kind: "finder", query: `event=${encodeURIComponent(slug)}&player=${encodeURIComponent(m.u || m.n)}` }}
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
export const EventRosters: React.FC<{ rosters: EventRoster[]; eventSlug?: string; leagueSlug?: string | null; year?: string }> = ({
  rosters,
  eventSlug,
  leagueSlug,
  year,
}) => {
  const [open, setOpen] = useState(rosters.length <= 4);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const yr = year && /^\d{4}$/.test(year) ? year : eventSlug && /\d{4}/.test(eventSlug) ? /\d{4}/.exec(eventSlug)![0] : undefined;
  const filteredRosters = useMemo(() => {
    if (!q) return rosters;
    const terms = q.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => s.trim()).filter(Boolean);
    return rosters.filter((t) => {
      const hay = `${t.t} ${t.u || ""} ${t.r || ""} ${t.r ? regionName(t.r, t.r) : ""} ${t.p.map(([n, u, r]) => `${n} ${u || ""} ${r || ""}`).join(" ")}`.toLowerCase();
      return terms.some((term) => hay.includes(term));
    });
  }, [rosters, q]);
  const shownRosters = open || q ? filteredRosters : filteredRosters.slice(0, 4);
  return (
    <Section
      title={tl("Team rosters")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {rosters.length > 4 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-40"
            />
          )}
          {filteredRosters.length >= 1 && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: filteredRosters[0].u || prettySlug(filteredRosters[0].t),
                  ...(filteredRosters[1] ? { b: filteredRosters[1].u || prettySlug(filteredRosters[1].t) } : {}),
                  period: eventSlug ? `e:${eventSlug}` : undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(filteredRosters[0].u || prettySlug(filteredRosters[0].t))}${filteredRosters[1] ? `,${encodeURIComponent(filteredRosters[1].u || prettySlug(filteredRosters[1].t))}` : ""}${eventSlug ? `&p=e:${encodeURIComponent(eventSlug)}` : ""}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: filteredRosters[0].u || prettySlug(filteredRosters[0].t),
                  ...(filteredRosters[1] ? { b: filteredRosters[1].u || prettySlug(filteredRosters[1].t) } : {}),
                  period: eventSlug ? `e:${eventSlug}` : undefined,
                }}
                className="text-[11px] text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
            </>
          )}
          {filteredRosters.length > 0 && (
            <>
              <HubLink
                to={{ kind: "teams" }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Teams")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(yr ? { year: yr } : {}),
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString() || undefined,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{ kind: "rankings", ...(leagueSlug ? { query: `league=${encodeURIComponent(leagueSlug)}` } : {}) }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query:
                    new URLSearchParams({
                      ...(leagueSlug ? { league: leagueSlug } : {}),
                      ...(yr ? { year: yr } : {}),
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
                    query: `event=${encodeURIComponent(eventSlug)}${
                      q.trim() && filteredRosters.length === 1
                        ? `&team=${encodeURIComponent(filteredRosters[0].u || prettySlug(filteredRosters[0].t))}`
                        : q.trim() && filteredRosters.length >= 2
                          ? `&team=${encodeURIComponent(filteredRosters[0].u || prettySlug(filteredRosters[0].t))}&vs=${encodeURIComponent(filteredRosters[1].u || prettySlug(filteredRosters[1].t))}`
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
              <HubLink to={{ kind: "team", slug: t.u || prettySlug(t.t) }} className="shrink-0 hover:opacity-80" title={t.t}>
                <TeamLogo name={t.t} size={16} />
              </HubLink>
              <TeamLink name={t.t} u={t.u} />
              {t.r && (
                <HubLink to={{ kind: "leagues" }} className="text-rw-muted hover:text-rw-accent hover:underline text-[10px] ml-0.5">
                  {regionName(t.r, t.r)}
                </HubLink>
              )}
              {eventSlug && (
                <HubLink
                  to={{ kind: "finder", query: `event=${encodeURIComponent(eventSlug)}&team=${encodeURIComponent(t.u || t.t)}` }}
                  className="ml-auto text-[10px] font-normal text-rw-muted hover:text-rw-accent hover:underline shrink-0"
                  title={tl("Game finder")}
                >
                  {tl("Games")} →
                </HubLink>
              )}
            </div>
            <ul className="space-y-1">
              {t.p.map(([n, u, role, flag], i) => (
                <li key={i} className="flex items-center justify-between gap-2 min-w-0">
                  <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                    <HubLink to={{ kind: "player", slug: u || prettySlug(n) }} className="shrink-0 hover:opacity-80" title={n}>
                      <PlayerPhoto name={n} team={t.t} slug={u ?? undefined} size={16} />
                    </HubLink>
                    <PlayerLink name={n} u={u} />
                  </span>
                  <span className="inline-flex items-center gap-1 text-rw-muted shrink-0 text-[10px]">
                    {role ? (
                      /coach/i.test(role) ? (
                        tl("Coach")
                      ) : u ? (
                        <HubLink
                          to={{
                            kind: "player",
                            slug: u,
                            tab: "stats",
                            ...(eventSlug ? { query: `p=e:${encodeURIComponent(eventSlug)}` } : {}),
                          }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Stats")}
                        >
                          {roleName(role)}
                        </HubLink>
                      ) : (
                        roleName(role)
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
              ))}
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
  return (
    <Section
      title={tl("Region vs region")}
      right={
        <span className="flex flex-wrap items-center gap-2">
          <HubLink
            to={{ kind: "rankings", ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}) }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Power rankings")} →
          </HubLink>
          <HubLink
            to={{ kind: "draft", query: `p=e:${encodeURIComponent(e.u)}` }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Draft board")} →
          </HubLink>
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
                ...(e.lu ? { league: e.lu } : {}),
                ...((e.start || e.end) && /^\d{4}/.test(e.start || e.end || "") ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
                event: e.u,
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
              ...((e.start || e.end) && /^\d{4}/.test(e.start || e.end || "") ? { query: `year=${(e.start || e.end || "").slice(0, 4)}` } : {}),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Best games")} →
          </HubLink>
          <HubLink
            to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}` }}
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
                  ...(e.lu ? { league: e.lu } : {}),
                  ...((e.start || e.end) && /^\d{4}/.test(e.start || e.end || "") ? { year: (e.start || e.end || "").slice(0, 4) } : {}),
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
                  <HubLink to={{ kind: "leagues" }} className="inline-flex items-center gap-1.5 flex-wrap hover:text-rw-accent">
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
                      to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}` }}
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
