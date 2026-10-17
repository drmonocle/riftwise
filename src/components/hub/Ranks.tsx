/**
 * Percentile ranks in a league's season: where a player stands among the same role (or a team among the league's
 * teams) for each stat, e.g. "damage share: better than 92% of LCK mids in 2026, 2nd of 10".
 * Data: hub/leagueyear/<league>/<year>.json (every split and playoffs of the season summed).
 */
import React, { useMemo, useState } from "react";
import { tl, tk, roleName } from "../../i18n";
import { loadLeagueSeason, loadLeagues } from "../../hub/data";
import type { EventPlayer, EventTeamStats, LeagueRow } from "../../hub/types";
import { Loading, Section, useLoad } from "./ui";

interface Metric<T> {
  key: string;
  label: string;
  value: (x: T) => number | null;
  fmt: (v: number) => string;
  /** lower is better (deaths) */
  low?: boolean;
}

const r1 = (v: number) => v.toFixed(1);
const r2 = (v: number) => v.toFixed(2);
const pc = (v: number) => `${(v * 100).toFixed(1)}%`;
const int = (v: number) => String(Math.round(v));
const div = (a: number | undefined, b: number | undefined) =>
  a != null && b ? a / b : null;

const PLAYER_METRICS: Metric<EventPlayer>[] = [
  {
    key: "kda",
    label: "KDA",
    value: (p) => (p.k + p.a) / Math.max(p.d, 1),
    fmt: r2,
  },
  { key: "kp", label: "KP", value: (p) => div(p.k + p.a, p.tk), fmt: pc },
  {
    key: "k",
    label: tk("Kills per game"),
    value: (p) => div(p.k, p.g),
    fmt: r1,
  },
  {
    key: "d",
    label: tk("Deaths per game"),
    value: (p) => div(p.d, p.g),
    fmt: r1,
    low: true,
  },
  {
    key: "csm",
    label: tk("CS per minute"),
    value: (p) => div(p.cs, p.min),
    fmt: r1,
  },
  {
    key: "gpm",
    label: tk("Gold per minute"),
    value: (p) => div(p.gold, p.min),
    fmt: int,
  },
  {
    key: "dpm",
    label: tk("Damage per minute"),
    value: (p) => div(p.dmg, p.min),
    fmt: int,
  },
  { key: "dmgs", label: tk("DMG%"), value: (p) => div(p.sd, p.td), fmt: pc },
  { key: "golds", label: tk("Gold%"), value: (p) => div(p.sg, p.tg), fmt: pc },
  {
    key: "vsm",
    label: tk("Vision score per minute"),
    value: (p) => div(p.vis, p.vmin),
    fmt: r2,
  },
  { key: "wr", label: tk("Win %"), value: (p) => div(p.w, p.g), fmt: pc },
];

const TEAM_METRICS: Metric<EventTeamStats>[] = [
  { key: "wr", label: tk("Win %"), value: (t) => div(t.w, t.g), fmt: pc },
  {
    key: "gdm",
    label: tk("GD/m"),
    value: (t) => div(t.gd, t.min),
    fmt: (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`,
  },
  {
    key: "gpm",
    label: tk("GPM"),
    value: (t) => (t.gold ? div(t.gold, t.min) : null),
    fmt: int,
  },
  { key: "kd", label: "K:D", value: (t) => t.k / Math.max(t.d, 1), fmt: r2 },
  {
    key: "k",
    label: tk("Kills per game"),
    value: (t) => div(t.k, t.g),
    fmt: r1,
  },
  {
    key: "drap",
    label: tk("DRA%"),
    value: (t) => (t.odrag != null ? div(t.drag, t.drag + t.odrag) : null),
    fmt: pc,
  },
  {
    key: "barp",
    label: tk("Baron%"),
    value: (t) => (t.obar != null ? div(t.bar, t.bar + t.obar) : null),
    fmt: pc,
  },
  {
    key: "tow",
    label: tk("Towers per game"),
    value: (t) => div(t.tow, t.g),
    fmt: r1,
  },
  {
    key: "tl",
    label: tk("Towers lost per game"),
    value: (t) => (t.tl != null ? div(t.tl, t.g) : null),
    fmt: r1,
    low: true,
  },
];

/** Rank and "better than X%" of `me` among `peers` for one metric. */
function place<T>(
  m: Metric<T>,
  me: T,
  peers: T[],
): { v: number; rank: number; of: number; pct: number } | null {
  const v = m.value(me);
  if (v == null || !isFinite(v)) return null;
  const vals = peers
    .map((p) => m.value(p))
    .filter((x): x is number => x != null && isFinite(x));
  if (vals.length < 3) return null;
  const better = vals.filter((x) => (m.low ? x < v : x > v)).length;
  const worse = vals.filter((x) => (m.low ? x > v : x < v)).length;
  const ties = vals.length - better - worse - 1;
  return {
    v,
    rank: better + 1,
    of: vals.length,
    pct: Math.round(
      ((worse + Math.max(ties, 0) / 2) / Math.max(vals.length - 1, 1)) * 100,
    ),
  };
}

const Bars: React.FC<{
  rows: {
    label: string;
    text: string;
    rank: number;
    of: number;
    pct: number;
  }[];
}> = ({ rows }) => (
  <ul className="space-y-1.5 text-xs">
    {rows.map((r) => (
      <li
        key={r.label}
        className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-2 min-w-0"
      >
        <span className="text-rw-sub truncate" title={r.label}>
          {r.label}
        </span>
        <span className="h-2 rounded bg-rw-border overflow-hidden">
          <span
            className="block h-full rounded"
            style={{
              width: `${Math.max(r.pct, 3)}%`,
              background:
                r.pct >= 75 ? "var(--rw-teal)" : r.pct >= 40 ? "var(--rw-accent)" : "var(--rw-red)",
            }}
          />
        </span>
        <span className="tabular-nums text-rw-text whitespace-nowrap">
          {r.text}{" "}
          <span className="text-rw-muted">
            · {tl("{n} of {m}", { n: r.rank, m: r.of })}
          </span>
        </span>
      </li>
    ))}
  </ul>
);

/** The league seasons someone played: [league slug, year, games], most games last year first. */
function seasonsOf(
  events: { lu?: string; date: string; g: number }[],
): [string, string, number][] {
  const m = new Map<string, number>();
  for (const e of events) {
    const y = (e.date || "").slice(0, 4);
    if (!e.lu || !/^\d{4}$/.test(y)) continue;
    const k = `${e.lu}|${y}`;
    m.set(k, (m.get(k) || 0) + e.g);
  }
  return [...m.entries()]
    .map(([k, g]) => [...k.split("|"), g] as [string, string, number])
    .sort((a, b) => (a[1] !== b[1] ? (a[1] < b[1] ? 1 : -1) : b[2] - a[2]));
}

const SeasonPicker: React.FC<{
  seasons: [string, string, number][];
  value: string;
  onChange: (v: string) => void;
  names: Map<string, string>;
}> = ({ seasons, value, onChange, names }) => (
  <>
    <span className="rw-capture-only text-xs font-semibold text-rw-text">
      {(() => {
        const [lu, y] = value.split("|");
        return `${(names.get(lu) || lu).replace(/\s\d{4}$/, "")} ${y}`;
      })()}
    </span>
    <select
      data-nocapture="1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={tl("Season")}
      className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text w-44 sm:w-56 max-w-full"
    >
      {seasons.map(([lu, y]) => (
        <option key={`${lu}|${y}`} value={`${lu}|${y}`}>
          {/* some league names carry a year ("Asian Games 2018"): show the season's year instead */}
          {`${(names.get(lu) || lu).replace(/\s\d{4}$/, "")} ${y}`}
        </option>
      ))}
    </select>
  </>
);

const useLeagueNames = () => {
  const leagues = useLoad(loadLeagues, []);
  return useMemo(
    () => new Map((leagues.data || []).map((l: LeagueRow) => [l.u, l.l])),
    [leagues.data],
  );
};

export const PlayerRanks: React.FC<{
  slug: string;
  events: { lu?: string; date: string; g: number }[];
}> = ({ slug, events }) => {
  const seasons = useMemo(
    () => seasonsOf(events).filter((s) => s[2] >= 5),
    [events],
  );
  const [pick, setPick] = useState(() =>
    seasons[0] ? `${seasons[0][0]}|${seasons[0][1]}` : "",
  );
  const names = useLeagueNames();
  const [lu, year] = pick.split("|");
  const state = useLoad(
    () =>
      lu && year
        ? loadLeagueSeason(lu, year)
        : Promise.reject(new Error("none")),
    [lu, year],
  );
  if (!seasons.length) return null;
  const season = state.data;
  const me = season?.players.find((p) => p.u === slug);
  let body: React.ReactNode = <Loading />;
  if (state.error)
    body = (
      <p className="text-xs text-rw-muted">
        {tl("No season numbers for this league yet.")}
      </p>
    );
  else if (season && !me)
    body = (
      <p className="text-xs text-rw-muted">
        {tl("Not enough games with a full scoreboard in this season.")}
      </p>
    );
  else if (season && me) {
    const same = season.players.filter((p) => p.r === me.r);
    const maxG = Math.max(...same.map((p) => p.g));
    const minG = Math.max(5, Math.ceil(maxG * 0.3));
    const peers = same.filter((p) => p.g >= minG || p.u === slug);
    const rows = PLAYER_METRICS.map((m) => {
      const r = place(m, me, peers);
      return (
        r && {
          label: tl(m.label),
          text: m.fmt(r.v),
          rank: r.rank,
          of: r.of,
          pct: r.pct,
        }
      );
    }).filter((x): x is NonNullable<typeof x> => !!x);
    body =
      me.g < minG ? (
        <p className="text-xs text-rw-muted">
          {tl("Not enough games in this season to rank ({n} played).", {
            n: me.g,
          })}
        </p>
      ) : (
        <>
          <Bars rows={rows} />
          <p className="text-[10px] text-rw-muted">
            {tl(
              "Compared with the {n} {role} players with {g}+ games in {league} {year} (all splits and playoffs).",
              {
                n: peers.length,
                role: roleName(me.r),
                g: minG,
                league: (names.get(lu) || lu).replace(/\s\d{4}$/, ""),
                year,
              },
            )}
          </p>
        </>
      );
  }
  return (
    <Section
      title={tl("League ranks")}
      right={
        <SeasonPicker
          seasons={seasons}
          value={pick}
          onChange={setPick}
          names={names}
        />
      }
      share={`${slug}-ranks-${lu}-${year}`}
    >
      {body}
    </Section>
  );
};

export const TeamRanks: React.FC<{
  slug: string;
  events: { lu?: string; date: string; g: number }[];
}> = ({ slug, events }) => {
  const seasons = useMemo(
    () => seasonsOf(events).filter((s) => s[2] >= 5),
    [events],
  );
  const [pick, setPick] = useState(() =>
    seasons[0] ? `${seasons[0][0]}|${seasons[0][1]}` : "",
  );
  const names = useLeagueNames();
  const [lu, year] = pick.split("|");
  const state = useLoad(
    () =>
      lu && year
        ? loadLeagueSeason(lu, year)
        : Promise.reject(new Error("none")),
    [lu, year],
  );
  if (!seasons.length) return null;
  const season = state.data;
  const me = season?.teamStats.find((t) => t.u === slug);
  let body: React.ReactNode = <Loading />;
  if (state.error)
    body = (
      <p className="text-xs text-rw-muted">
        {tl("No season numbers for this league yet.")}
      </p>
    );
  else if (season && !me)
    body = (
      <p className="text-xs text-rw-muted">
        {tl("Not enough games with a full scoreboard in this season.")}
      </p>
    );
  else if (season && me) {
    const maxG = Math.max(...season.teamStats.map((t) => t.g));
    const peers = season.teamStats.filter(
      (t) => t.g >= Math.max(3, Math.ceil(maxG * 0.3)) || t.u === slug,
    );
    const rows = TEAM_METRICS.map((m) => {
      const r = place(m, me, peers);
      return (
        r && {
          label: tl(m.label),
          text: m.fmt(r.v),
          rank: r.rank,
          of: r.of,
          pct: r.pct,
        }
      );
    }).filter((x): x is NonNullable<typeof x> => !!x);
    body = (
      <>
        <Bars rows={rows} />
        <p className="text-[10px] text-rw-muted">
          {tl(
            "Compared with the {n} teams of {league} {year} (all splits and playoffs).",
            {
              n: peers.length,
              league: (names.get(lu) || lu).replace(/\s\d{4}$/, ""),
              year,
            },
          )}
        </p>
      </>
    );
  }
  return (
    <Section
      title={tl("League ranks")}
      right={
        <SeasonPicker
          seasons={seasons}
          value={pick}
          onChange={setPick}
          names={names}
        />
      }
      share={`${slug}-ranks-${lu}-${year}`}
    >
      {body}
    </Section>
  );
};
