/**
 * "Stats for": a player's or team's numbers for any period (all time, last N games, a year, one tournament),
 * worked out from their game log like gol.gg's season / split pages. Spoiler mode hides periods with fresh games.
 */
import React, { useMemo, useState } from "react";
import { tl, roleName } from "../../i18n";
import { winRate } from "../../stats";
import { loadPlayerGames, loadTeamGames } from "../../hub/data";
import type { PlayerGameRow, TeamGameRow } from "../../hub/types";
import {
  PeriodKey,
  PeriodOption,
  inPeriod,
  periodOptions,
  playerAgg,
  playerRowRef,
  teamAgg,
  teamRowRef,
} from "../../hub/period";
import { useDDragon } from "../../hub/ddragon";
import { SortTable, type Column } from "./SortTable";
import { DraftTendencies } from "./DraftTendencies";
import {
  ChampLink,
  Loading,
  RevealButton,
  Section,
  Stat,
  fmtNum,
  isFresh,
  useHidden,
  useLoad,
} from "./ui";

/** a share in percent, one decimal like gol.gg ("61.0%") */
const pct = (v: number | null | undefined) =>
  v == null ? "–" : `${v.toFixed(1)}%`;
const dash = (v: number | null | undefined, suffix = "") =>
  v == null ? "–" : `${v}${suffix}`;
const signed = (v: number | null) =>
  v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`;

/** The period select (shared with Compare). */
export const PeriodPicker: React.FC<{
  options: PeriodOption[];
  value: PeriodKey;
  onChange: (k: PeriodKey) => void;
}> = ({ options, value, onChange }) => {
  const basic = options.filter((o) => o.group === "basic");
  const years = options.filter((o) => o.group === "year");
  const events = options.filter((o) => o.group === "event");
  const label = (o: PeriodOption) =>
    o.key === "all"
      ? tl("All time")
      : o.group === "basic"
        ? tl("Last {n} games", { n: o.label })
        : o.label;
  const current = options.find((o) => o.key === value);
  return (
    <>
      {/* pictures ("Save as image") can't show a dropdown's choice, so they get it as text */}
      <span className="rw-capture-only text-xs font-semibold text-[#f0e6d2]">
        {current ? label(current) : ""}
      </span>
      <select
        data-nocapture="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={tl("Stats for")}
        className="bg-[#091428] border border-[#1e282d] rounded-lg px-2 py-1.5 text-xs text-[#f0e6d2] w-44 sm:w-60 max-w-full"
      >
        {basic.map((o) => (
          <option key={o.key} value={o.key}>
            {label(o)}
          </option>
        ))}
        {years.length > 0 && (
          <optgroup label={tl("Years")}>
            {years.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        {events.length > 0 && (
          <optgroup label={tl("Tournaments")}>
            {events.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </>
  );
};

/** Default period: the newest year in the log (this season), else all time. */
export const defaultPeriod = (opts: PeriodOption[]): PeriodKey =>
  opts.find((o) => o.group === "year")?.key || "all";

// ── players ───────────────────────────────────────────────────────────────

export const PlayerPeriodStats: React.FC<{ slug: string }> = ({ slug }) => {
  const state = useLoad(() => loadPlayerGames(slug), [slug]);
  if (state.loading) return null;
  if (!state.data || !state.data.length) return null;
  return <PlayerPeriodView slug={slug} rows={state.data} />;
};

const PlayerPeriodView: React.FC<{ slug: string; rows: PlayerGameRow[] }> = ({
  slug,
  rows,
}) => {
  useDDragon();
  const options = useMemo(() => periodOptions(rows.map(playerRowRef)), [rows]);
  const [period, setPeriod] = useState<PeriodKey>(() => defaultPeriod(options));
  const sel = useMemo(
    () => inPeriod(rows, period, playerRowRef),
    [rows, period],
  );
  const agg = useMemo(() => playerAgg(sel), [sel]);
  const [hidden, reveal] = useHidden(
    `period:p:${slug}:${period}`,
    sel.find((r) => isFresh(r[0]))?.[0],
  );
  const detail = agg.csm != null;
  const cols: Column<(typeof agg.champs)[number]>[] = [
    {
      key: "c",
      label: tl("Champion"),
      value: (c) => c.c,
      render: (c) => <ChampLink name={c.c} size={18} />,
    },
    { key: "g", label: tl("Games"), value: (c) => c.g },
    {
      key: "w",
      label: tl("Win %"),
      value: (c) => (hidden ? null : c.w / c.g),
      render: (c) => (hidden ? "–" : winRate(c.w, c.g)),
    },
    { key: "kda", label: tl("KDA"), value: (c) => c.kda },
    {
      key: "kdaa",
      label: "K / D / A",
      value: (c) => c.k / c.g,
      render: (c) =>
        `${(c.k / c.g).toFixed(1)} / ${(c.d / c.g).toFixed(1)} / ${(c.a / c.g).toFixed(1)}`,
    },
    ...(detail
      ? ([
          {
            key: "csm",
            label: tl("CS/m"),
            title: tl("CS per minute"),
            value: (c) => c.csm,
          },
          {
            key: "dpm",
            label: tl("DPM"),
            title: tl("Damage per minute"),
            value: (c) => c.dpm,
          },
        ] as Column<(typeof agg.champs)[number]>[])
      : []),
  ];
  return (
    <Section
      title={tl("Stats for")}
      right={
        <PeriodPicker options={options} value={period} onChange={setPeriod} />
      }
      share={`${slug}-${period}`}
    >
      {hidden ? (
        <div className="py-3 text-center">
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat
              label={tl("Games")}
              value={`${agg.w}-${agg.g - agg.w}`}
              sub={tl("{p} win rate", { p: winRate(agg.w, agg.g) })}
            />
            <Stat
              label={tl("KDA")}
              value={agg.kda}
              sub={`${(agg.k / Math.max(agg.g, 1)).toFixed(1)} / ${(agg.d / Math.max(agg.g, 1)).toFixed(1)} / ${(agg.a / Math.max(agg.g, 1)).toFixed(1)}`}
            />
            <Stat
              label="KP"
              value={pct(agg.kp)}
              sub={tl("Kill participation")}
            />
            <Stat
              label={tl("CS / min")}
              value={dash(agg.csm)}
              sub={
                agg.gpm != null
                  ? tl("{n} gold / min", { n: fmtNum(agg.gpm) })
                  : undefined
              }
            />
            <Stat
              label={tl("Damage / min")}
              value={agg.dpm != null ? fmtNum(agg.dpm) : "–"}
              sub={
                agg.dmgShare != null
                  ? tl("{p} of team damage", { p: pct(agg.dmgShare) })
                  : undefined
              }
            />
            <Stat
              label={tl("Gold%")}
              value={pct(agg.goldShare)}
              sub={tl("Share of the team's gold")}
            />
            <Stat
              label={tl("VS / min")}
              value={dash(agg.vsm)}
              sub={
                agg.visShare != null
                  ? tl("{p} of team vision", { p: pct(agg.visShare) })
                  : undefined
              }
            />
            <Stat
              label={tl("Champions")}
              value={agg.champs.length}
              sub={agg.roles
                .slice(0, 2)
                .map((r) => roleName(r))
                .join(" · ")}
            />
          </div>
          <SortTable
            rows={agg.champs}
            columns={cols}
            initial={{ key: "g", desc: true }}
            rowKey={(c) => c.c}
            copyName={`${slug}-champions`}
          />
          <p className="text-[10px] text-[#7e8e9f]">
            {tl("Games with a full scoreboard only.")}
          </p>
        </>
      )}
    </Section>
  );
};

// ── teams ─────────────────────────────────────────────────────────────────

export const TeamPeriodStats: React.FC<{ slug: string }> = ({ slug }) => {
  const state = useLoad(() => loadTeamGames(slug), [slug]);
  if (state.loading) return <Loading />;
  if (!state.data || !state.data.length) return null;
  return <TeamPeriodView slug={slug} rows={state.data} />;
};

const ChampCounts: React.FC<{ title: string; list: [string, number][] }> = ({
  title,
  list,
}) =>
  list.length ? (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-bold text-[#7e8e9f] mb-1">
        {title}
      </div>
      <ul className="text-xs space-y-1">
        {list.map(([c, n]) => (
          <li key={c} className="flex justify-between gap-2 min-w-0">
            <ChampLink name={c} size={16} />
            <span className="text-[#9bb3c9] tabular-nums shrink-0">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

const TeamPeriodView: React.FC<{ slug: string; rows: TeamGameRow[] }> = ({
  slug,
  rows,
}) => {
  useDDragon();
  const options = useMemo(() => periodOptions(rows.map(teamRowRef)), [rows]);
  const [period, setPeriod] = useState<PeriodKey>(() => defaultPeriod(options));
  const sel = useMemo(() => inPeriod(rows, period, teamRowRef), [rows, period]);
  const t = useMemo(() => teamAgg(sel), [sel]);
  const [hidden, reveal] = useHidden(
    `period:t:${slug}:${period}`,
    sel.find((r) => isFresh(r[0]))?.[0],
  );
  return (
    <Section
      title={tl("Stats for")}
      right={
        <PeriodPicker options={options} value={period} onChange={setPeriod} />
      }
      share={`${slug}-${period}`}
    >
      {hidden ? (
        <div className="py-3 text-center">
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat
              label={tl("Games")}
              value={`${t.w}-${t.g - t.w}`}
              sub={tl("{p} win rate", { p: winRate(t.w, t.g) })}
            />
            <Stat
              label={tl("Blue / red side")}
              value={`${winRate(t.blue[1], t.blue[0])} / ${winRate(t.red[1], t.red[0])}`}
              sub={tl("{b} blue games · {r} red", {
                b: t.blue[0],
                r: t.red[0],
              })}
            />
            <Stat
              label={tl("Avg game")}
              value={t.min != null ? tl("{n} min", { n: t.min }) : "–"}
            />
            <Stat
              label={tl("Kills / game")}
              value={dash(t.kills)}
              sub={
                t.deaths != null ? tl("{n} deaths", { n: t.deaths }) : undefined
              }
            />
            <Stat
              label={tl("Gold diff / game")}
              value={signed(t.gd)}
              sub={
                t.gdm != null
                  ? tl("{n} per minute", { n: signed(t.gdm) })
                  : undefined
              }
            />
            <Stat
              label={tl("GPM")}
              value={t.gpm != null ? fmtNum(t.gpm) : "–"}
              sub={tl("Team gold per minute")}
            />
            <Stat
              label={tl("DRA%")}
              value={pct(t.dragShare)}
              sub={tl("Share of all dragons taken in their games")}
            />
            <Stat
              label={tl("Baron%")}
              value={pct(t.baronShare)}
              sub={tl("Share of all barons taken in their games")}
            />
            <Stat
              label={tl("Towers")}
              value={dash(t.towers)}
              sub={
                t.towersLost != null
                  ? tl("{n} lost", { n: t.towersLost })
                  : undefined
              }
            />
            <Stat
              label={tl("Champions")}
              value={t.nPicks}
              sub={tl("different champions picked")}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {t.picks.length > 0 && (
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#7e8e9f] mb-1">
                  {tl("Most picked champions")}
                </div>
                <ul className="text-xs space-y-1">
                  {t.picks.map(([c, n, w]) => (
                    <li
                      key={c}
                      className="flex items-center justify-between gap-2 min-w-0"
                    >
                      <ChampLink name={c} size={16} />
                      <span className="text-[#9bb3c9] tabular-nums shrink-0">
                        {n} · {winRate(w, n)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ChampCounts title={tl("Most banned by them")} list={t.bans} />
            <ChampCounts
              title={tl("Most banned against them")}
              list={t.bansVs}
            />
          </div>
          <DraftTendencies rows={sel} />
          {t.sg < t.g && (
            <p className="text-[10px] text-[#7e8e9f]">
              {tl(
                "Kills, gold and objectives: games with a full scoreboard only.",
              )}
            </p>
          )}
        </>
      )}
    </Section>
  );
};
