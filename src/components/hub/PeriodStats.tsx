/**
 * "Stats for": a player's or team's numbers for any period (all time, last N games, a year, one tournament),
 * worked out from their game log like gol.gg's season / split pages. Spoiler mode hides periods with fresh games.
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, roleName, fmtDec, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { loadPlayerGames, loadPlayerGames2y, loadTeamGames, loadTeamGames2y } from "../../hub/data";
import type { PlayerGameRow, TeamGameRow } from "../../hub/types";
import {
  PeriodKey,
  PeriodOption,
  PlayerTl,
  TeamAgg,
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
import { BroadcastCardButton, playerCardData, teamSoloCardData } from "./BroadcastCard";
import {
  ChampLink,
  Loading,
  OeCredit,
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
  v == null ? "–" : `${fmtDec(v)}%`;
const dash = (v: number | null | undefined, suffix = "") =>
  v == null ? "–" : `${v}${suffix}`;
const signed = (v: number | null | undefined) =>
  v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`;

/** A small heading inside a section. */
const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] uppercase tracking-wider font-bold text-rw-muted">
    {children}
  </div>
);

/** A player's early game from Oracle's Elixir: leads over the lane opponent, first blood, warding. */
export const PlayerEarly: React.FC<{
  t: PlayerTl;
  dmgShare: number | null;
  goldShare: number | null;
}> = ({ t, dmgShare, goldShare }) => {
  const eff =
    dmgShare != null && goldShare != null
      ? Math.round((dmgShare - goldShare) * 10) / 10
      : null;
  const lead = (c: number | null, x: number | null) =>
    tl("CS {c} · XP {x}", { c: signed(c), x: signed(x) });
  return (
    <div className="space-y-1">
      <Sub>{tl("Early game")}</Sub>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat
          label="GD@10"
          value={signed(t.gd10)}
          sub={lead(t.csd10, t.xpd10)}
        />
        <Stat
          label="GD@15"
          value={signed(t.gd15)}
          sub={lead(t.csd15, t.xpd15)}
        />
        <Stat
          label="GD@20"
          value={signed(t.gd20)}
          sub={lead(t.csd20, t.xpd20)}
        />
        <Stat
          label={tl("DMG% − Gold%")}
          value={signed(eff)}
          sub={tl("Damage vs. gold share")}
        />
        <Stat
          label={tl("First blood")}
          value={pct(t.fbPart)}
          sub={tl("{p} died for it", { p: pct(t.fbVictim) })}
        />
        <Stat
          label={tl("Wards / min")}
          value={dash(t.wpm)}
          sub={tl("{n} cleared / min", { n: dash(t.wcpm) })}
        />
        <Stat
          label={tl("Control wards")}
          value={dash(t.cw)}
          sub={tl("bought per game")}
        />
      </div>
      <OeCredit n={t.n} />
    </div>
  );
};

/** A team's early game from Oracle's Elixir: gold leads, firsts, plates, grubs, vision. */
export const TeamEarly: React.FC<{ t: TeamAgg }> = ({ t: agg }) => {
  const t = agg.tl;
  if (!t) return null;
  return (
    <div className="space-y-1">
      <Sub>{tl("Early game")}</Sub>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat
          label="GD@15"
          value={signed(t.gd15)}
          sub={`@10 ${signed(t.gd10)} · @20 ${signed(t.gd20)}`}
        />
        <Stat
          label={tl("Ahead at 15")}
          value={pct(t.lead15)}
          sub={tl("Win {a} ahead · {b} behind", {
            a: winRate(t.ahead[1], t.ahead[0]),
            b: winRate(t.behind[1], t.behind[0]),
          })}
        />
        <Stat
          label={tl("First blood")}
          value={pct(t.fb)}
          sub={tl("First tower {p}", { p: pct(t.ft) })}
        />
        <Stat
          label={tl("First mid tower")}
          value={pct(t.fmt)}
          sub={tl("First to 3 towers {p}", { p: pct(t.f3t) })}
        />
        <Stat
          label={tl("First dragon")}
          value={pct(t.fd)}
          sub={tl("Herald {h} · Baron {b}", { h: pct(t.fh), b: pct(t.fbaron) })}
        />
        <Stat
          label={tl("Turret plates")}
          value={dash(t.plates)}
          sub={
            t.platesLost != null
              ? tl("{n} lost", { n: t.platesLost })
              : undefined
          }
        />
        {t.grubs != null && (
          <Stat
            label={tl("Void grubs")}
            value={t.grubs == null ? "–" : fmtDec(t.grubs)}
            sub={tl("{p} of all grubs", { p: pct(t.grubShare) })}
          />
        )}
        <Stat
          label={tl("VS / min")}
          value={dash(t.vspm)}
          sub={tl("{w} wards · {c} cleared / min", {
            w: dash(t.wpm),
            c: dash(t.wcpm),
          })}
        />
        <Stat
          label={tl("Control wards")}
          value={dash(t.cw)}
          sub={tl("bought per game")}
        />
        <Stat
          label="CKPM"
          value={agg.ckpm == null ? "–" : fmtDec(agg.ckpm, 2)}
          sub={tl("Kills per minute, both teams")}
        />
      </div>
      <OeCredit n={t.n} />
    </div>
  );
};

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
      <span className="rw-capture-only text-xs font-semibold text-rw-text">
        {current ? label(current) : ""}
      </span>
      <select
        data-nocapture="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={tl("Stats for")}
        className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text w-44 sm:w-60 max-w-full"
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

type Who = { name: string; role?: string; club?: string };

/**
 * A game log for the period picker: the last two years first when the build made that smaller file (has2y: the
 * page opens on this season, which is all it needs), the whole log right after, for older periods.
 */
function useGameLog<T>(slug: string, has2y: boolean | undefined, recent: (s: string) => Promise<T[]>, full: (s: string) => Promise<T[]>) {
  const first = useLoad(() => (has2y ? recent(slug) : full(slug)), [slug, has2y]);
  const [all, setAll] = useState<{ slug: string; rows: T[] } | null>(null);
  useEffect(() => {
    if (!has2y || !first.data) return;
    let alive = true;
    full(slug)
      .then((rows) => alive && setAll({ slug, rows }))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, has2y, first.data]);
  return { loading: first.loading, rows: all && all.slug === slug ? all.rows : first.data };
}

export const PlayerPeriodStats: React.FC<{ slug: string; who?: Who; has2y?: boolean }> = ({ slug, who, has2y }) => {
  const { loading, rows } = useGameLog(slug, has2y, loadPlayerGames2y, loadPlayerGames);
  if (loading) return null;
  if (!rows || !rows.length) return null;
  return <PlayerPeriodView slug={slug} rows={rows} who={who} />;
};

const PlayerPeriodView: React.FC<{ slug: string; rows: PlayerGameRow[]; who?: Who }> = ({
  slug,
  rows,
  who,
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
        `${fmtDec(c.k / c.g)} / ${fmtDec(c.d / c.g)} / ${fmtDec(c.a / c.g)}`,
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
    ...(agg.tl
      ? ([
          {
            key: "gd15",
            label: "GD@15",
            title: tl("Gold lead over the lane opponent at 15 minutes"),
            value: (c) => c.gd15,
            render: (c) => signed(c.gd15),
          },
          {
            key: "csd15",
            label: "CSD@15",
            title: tl("CS lead over the lane opponent at 15 minutes"),
            value: (c) => c.csd15,
            render: (c) => signed(c.csd15),
          },
        ] as Column<(typeof agg.champs)[number]>[])
      : []),
  ];
  const periodText = (() => {
    const o = options.find((x) => x.key === period);
    return !o || o.key === "all" ? tl("All time") : o.group === "basic" ? tl("Last {n} games", { n: o.label }) : o.label;
  })();
  return (
    <Section
      title={tl("Stats for")}
      right={
        <>
          <PeriodPicker options={options} value={period} onChange={setPeriod} />
          {who && !hidden && (
            <BroadcastCardButton data={() => playerCardData(who, agg, periodText)} name={`${who.name}-${period}`} />
          )}
        </>
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
              value={fmtN(agg.kda)}
              sub={`${fmtDec(agg.k / Math.max(agg.g, 1))} / ${fmtDec(agg.d / Math.max(agg.g, 1))} / ${fmtDec(agg.a / Math.max(agg.g, 1))}`}
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
          {agg.tl && (
            <PlayerEarly
              t={agg.tl}
              dmgShare={agg.dmgShare}
              goldShare={agg.goldShare}
            />
          )}
          <SortTable
            rows={agg.champs}
            columns={cols}
            initial={{ key: "g", desc: true }}
            rowKey={(c) => c.c}
            copyName={`${slug}-champions`}
          />
          <p className="text-[10px] text-rw-muted">
            {tl("Games with a full scoreboard only.")}
          </p>
        </>
      )}
    </Section>
  );
};

// ── teams ─────────────────────────────────────────────────────────────────

export const TeamPeriodStats: React.FC<{ slug: string; has2y?: boolean; who?: { name: string; sub?: string } }> = ({ slug, has2y, who }) => {
  const { loading, rows } = useGameLog(slug, has2y, loadTeamGames2y, loadTeamGames);
  if (loading) return <Loading />;
  if (!rows || !rows.length) return null;
  return <TeamPeriodView slug={slug} rows={rows} who={who} />;
};

const ChampCounts: React.FC<{ title: string; list: [string, number][] }> = ({
  title,
  list,
}) =>
  list.length ? (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-bold text-rw-muted mb-1">
        {title}
      </div>
      <ul className="text-xs space-y-1">
        {list.map(([c, n]) => (
          <li key={c} className="flex justify-between gap-2 min-w-0">
            <ChampLink name={c} size={16} />
            <span className="text-rw-sub tabular-nums shrink-0">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

const TeamPeriodView: React.FC<{ slug: string; rows: TeamGameRow[]; who?: { name: string; sub?: string } }> = ({
  slug,
  rows,
  who,
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
        <>
          <PeriodPicker options={options} value={period} onChange={setPeriod} />
          {who && !hidden && (
            <BroadcastCardButton
              data={() => {
                const o = options.find((x) => x.key === period);
                const label = !o || o.key === "all" ? tl("All time") : o.group === "basic" ? tl("Last {n} games", { n: o.label }) : o.label;
                return teamSoloCardData(who, t, label);
              }}
              name={`${who.name}-${period}`}
              label={tl("Overview card")}
            />
          )}
        </>
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
              value={t.min != null ? tl("{n} min", { n: fmtN(t.min) }) : "–"}
              sub={
                t.minWin != null && t.minLoss != null
                  ? tl("Wins {a} · losses {b} min", { a: fmtDec(t.minWin), b: fmtDec(t.minLoss) })
                  : undefined
              }
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
          <TeamEarly t={t} />
          <div className="grid sm:grid-cols-3 gap-4">
            {t.picks.length > 0 && (
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-bold text-rw-muted mb-1">
                  {tl("Most picked champions")}
                </div>
                <ul className="text-xs space-y-1">
                  {t.picks.map(([c, n, w]) => (
                    <li
                      key={c}
                      className="flex items-center justify-between gap-2 min-w-0"
                    >
                      <ChampLink name={c} size={16} />
                      <span className="text-rw-sub tabular-nums shrink-0">
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
            <p className="text-[10px] text-rw-muted">
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
