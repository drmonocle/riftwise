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
  teamRowRef, winWhen } from "../../hub/period";
import { useDDragon } from "../../hub/ddragon";
import { SortTable, type Column } from "./SortTable";
import { TrendChart } from "./TrendChart";
import { DraftTendencies } from "./DraftTendencies";
import { BroadcastCardButton, SectionCard, playerCardData, teamSoloCardData, type RosterPlayer } from "./BroadcastCard";
import { fmtRating, useRatingFile } from "./PlayerRating";
import { playerRowLine, rateLine } from "../../hub/playerRating";
import { KdaBar, PlayerOpponents, TeamPeriodOpponents, WinBar } from "./OpponentChart";
import {
  ChampLink,
  HubLink,
  Loading,
  OeCredit,
  RevealButton,
  STable,
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
  <div className="text-[10px] font-semibold text-rw-muted">
    {children}
  </div>
);

const CopyPeriodTextPost: React.FC<{ buildText: () => string }> = ({ buildText }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = typeof window !== "undefined" ? window.location.href : "https://riftwise.gg";
    const text = `${buildText()}\n${url}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      type="button"
      data-nocapture="1"
      onClick={copy}
      className="px-2 py-1 rounded border border-rw-border bg-rw-surface text-[11px] font-semibold text-rw-sub hover:text-rw-text hover:border-rw-accent/60 transition-colors"
    >
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};

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
      <div className="grid grid-cols-2 sm:grid-cols-5 rw-stats">
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
      <div className="grid grid-cols-2 sm:grid-cols-5 rw-stats">
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

/**
 * How a team plays, in words: a label where it is among the top or bottom fifth of pro team seasons since 2024
 * (1,292 seasons of 20+ games: gold lead at 15, game length, kills per minute, dragon share, first towers), plus
 * comebacks and closing speed. Needs 15+ games.
 */
export function playstyleTags(t: TeamAgg): { tag: string; why: string; good?: boolean }[] {
  if (t.g < 15) return [];
  const out: { tag: string; why: string; good?: boolean }[] = [];
  const e = t.tl;
  if (e?.gd15 != null && e.n >= 10) {
    if (e.gd15 >= 630) out.push({ tag: tl("Strong early game"), why: tl("{n} gold ahead at 15 minutes on average", { n: `+${fmtNum(e.gd15)}` }), good: true });
    else if (e.gd15 <= -810) out.push({ tag: tl("Slow starters"), why: tl("{n} gold behind at 15 minutes on average", { n: fmtNum(-e.gd15) }), good: false });
  }
  // the top fifth of team seasons won 37.5%+ of the games they were behind in at 15 (the middle one 25%)
  if (e && e.behind[0] >= 8 && e.behind[1] / e.behind[0] >= 0.375)
    out.push({ tag: tl("Comes back from behind"), why: tl("Won {p} of games while behind at 15", { p: winRate(e.behind[1], e.behind[0]) }), good: true });
  if (t.min != null) {
    if (t.min >= 32.8) out.push({ tag: tl("Long games"), why: tl("{n} min on average", { n: fmtN(t.min) }) });
    else if (t.min <= 30.3) out.push({ tag: tl("Short games"), why: tl("{n} min on average", { n: fmtN(t.min) }) });
  }
  if (t.minWin != null && t.minLoss != null && t.minLoss - t.minWin >= 3)
    out.push({ tag: tl("Closes fast"), why: tl("Wins last {a} min, losses {b} min", { a: fmtDec(t.minWin), b: fmtDec(t.minLoss) }), good: true });
  if (t.ckpm != null) {
    if (t.ckpm >= 1.23) out.push({ tag: tl("Bloody games"), why: tl("{n} kills a minute, both teams", { n: fmtDec(t.ckpm, 2) }) });
    else if (t.ckpm <= 0.92) out.push({ tag: tl("Low-kill games"), why: tl("{n} kills a minute, both teams", { n: fmtDec(t.ckpm, 2) }) });
  }
  if (t.dragShare != null) {
    if (t.dragShare >= 56) out.push({ tag: tl("Dragon-focused"), why: tl("Takes {p} of the dragons", { p: `${fmtDec(t.dragShare)}%` }), good: true });
    else if (t.dragShare <= 43) out.push({ tag: tl("Gives up dragons"), why: tl("Takes {p} of the dragons", { p: `${fmtDec(t.dragShare)}%` }), good: false });
  }
  if (e?.ft != null && e.ft >= 59) out.push({ tag: tl("Early towers"), why: tl("First tower in {p} of games", { p: `${fmtDec(e.ft)}%` }), good: true });
  return out;
}

export const Playstyle: React.FC<{ t: TeamAgg }> = ({ t }) => {
  const tags = playstyleTags(t);
  if (!tags.length) return null;
  return (
    <div className="space-y-1">
      <Sub>{tl("Playstyle")}</Sub>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((x) => (
          <span
            key={x.tag}
            title={x.why}
            className={`px-2 py-1 rounded-full border text-[11px] ${
              x.good === true ? "border-rw-teal/60 text-rw-teal" : x.good === false ? "border-rw-red/60 text-rw-red" : "border-rw-border text-rw-sub"
            }`}
          >
            <span className="font-semibold">{x.tag}</span> <span className="text-rw-muted">· {x.why}</span>
          </span>
        ))}
      </div>
      <p className="text-[10px] text-rw-muted">{tl("Compared with every pro team season since 2024: a label means the top or bottom fifth.")}</p>
    </div>
  );
};

/** Win rate by what happened early: each first objective got or given up, and the gold lead at 15 in four bands. */
export const WinWhen: React.FC<{ rows: TeamGameRow[]; teamName?: string; periodLabel?: string }> = ({ rows, teamName, periodLabel }) => {
  const d = useMemo(() => winWhen(rows), [rows]);
  if (d.n < 10) return null;
  const label: Record<string, string> = {
    fb: tl("First blood"),
    ft: tl("First tower"),
    f3t: tl("First to 3 towers"),
    fd: tl("First dragon"),
    fh: tl("First herald"),
    fbaron: tl("First baron"),
    a2: tl("2,000+ gold ahead"),
    a0: tl("Ahead, under 2,000"),
    b0: tl("Behind, under 2,000"),
    b2: tl("2,000+ gold behind"),
  };
  const wrCell = ([g, w]: [number, number]) => {
    if (!g) return <span className="text-rw-muted">–</span>;
    const pctVal = Math.round((w / g) * 100);
    const good = w / g >= 0.5;
    return (
      <span className="inline-flex items-center justify-end gap-1.5 font-mono tabular-nums">
        <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
          <span className={`block h-full rounded-full ${good ? "bg-rw-teal/80" : "bg-rw-red/75"}`} style={{ width: `${Math.max(4, pctVal)}%` }} />
        </span>
        <span>
          <span className={`font-semibold ${good ? "text-rw-teal" : "text-rw-red"}`}>{pctVal}%</span>
          <span className="text-rw-muted text-[10px]"> ({g})</span>
        </span>
      </span>
    );
  };
  const wrStr = ([g, w]: [number, number]) => (g ? `${Math.round((w / g) * 100)}% (${g}G)` : "–");
  const th = "px-2 py-1 font-normal text-[10px] text-rw-muted";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Sub>{tl("Win rate when…")}</Sub>
        <div className="flex flex-wrap items-center gap-1.5">
          <CopyPeriodTextPost
            buildText={() => {
              const head = `${teamName ? `${teamName} · ` : ""}${tl("Win rate when…")}${periodLabel ? ` (${periodLabel})` : ""}`;
              const lines = [
                ...d.firsts.map((x) => `• ${label[x.key]}: ${wrStr(x.got)} (${tl("Opponent got it")}: ${wrStr(x.lost)})`),
                ...d.gold.map((x) => `• ${tl("Gold at 15 minutes")} · ${label[x.key]}: ${wrStr([x.g, x.w])}`),
              ];
              return [head, ...lines].join("\n");
            }}
          />
          <SectionCard
            section={teamName ? `${teamName} · ${tl("Win rate when…")}` : tl("Win rate when…")}
            sub={periodLabel}
            name={`${teamName || "team"}-win-when`}
            rows={() => [
              ...d.firsts.map((x) => ({
                label: label[x.key],
                sub: `${tl("Opponent got it")}: ${wrStr(x.lost)}`,
                value: wrStr(x.got),
                win: x.got[0] > 0 ? x.got[1] / x.got[0] >= 0.5 : undefined,
              })),
              ...d.gold.map((x) => ({
                label: `${tl("Gold at 15 minutes")} · ${label[x.key]}`,
                value: wrStr([x.g, x.w]),
                win: x.g > 0 ? x.w / x.g >= 0.5 : undefined,
              })),
            ]}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 items-start">
        <STable className="w-full text-xs">
          <thead>
            <tr>
              <th className={`${th} text-left`} />
              <th className={`${th} text-right`}>{tl("They got it")}</th>
              <th className={`${th} text-right`}>{tl("Opponent got it")}</th>
            </tr>
          </thead>
          <tbody>
            {d.firsts.map((x) => (
              <tr key={x.key} className="border-t border-rw-border/60">
                <td className="px-2 py-1 text-rw-sub" data-sort={label[x.key]}>{label[x.key]}</td>
                <td className="px-2 py-1 text-right" data-sort={x.got[0] ? x.got[1] / x.got[0] : -1}>{wrCell(x.got)}</td>
                <td className="px-2 py-1 text-right" data-sort={x.lost[0] ? x.lost[1] / x.lost[0] : -1}>{wrCell(x.lost)}</td>
              </tr>
            ))}
          </tbody>
        </STable>
        <STable className="w-full text-xs">
          <thead>
            <tr>
              <th className={`${th} text-left`}>{tl("Gold at 15 minutes")}</th>
              <th className={`${th} text-right`}>{tl("Win rate")}</th>
            </tr>
          </thead>
          <tbody>
            {d.gold.map((x) => (
              <tr key={x.key} className="border-t border-rw-border/60">
                <td className="px-2 py-1 text-rw-sub" data-sort={label[x.key]}>{label[x.key]}</td>
                <td className="px-2 py-1 text-right" data-sort={x.g ? x.w / x.g : -1}>{wrCell([x.g, x.w])}</td>
              </tr>
            ))}
          </tbody>
        </STable>
      </div>
      <p className="text-[10px] text-rw-muted">
        {tl("Win rate (games in brackets) over the {n} games of this period with timelines (Oracle's Elixir). From 2,000+ behind at 15 is their comeback rate.", { n: d.n })}
      </p>
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
  const patches = options.filter((o) => o.group === "patch");
  const events = options.filter((o) => o.group === "event");
  const label = (o: PeriodOption) =>
    o.key === "all"
      ? tl("All time")
      : o.group === "basic"
        ? tl("Last {n} games", { n: o.label })
        : o.group === "patch"
          ? `${tl("Patch")} ${o.label}`
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
        {patches.length > 0 && (
          <optgroup label={tl("Patch")}>
            {patches.map((o) => (
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

/** Quick 1-click period pills (All time, Last 20, newest year, newest tournament) beside PeriodPicker. */
export const QuickPeriods: React.FC<{
  options: PeriodOption[];
  value: PeriodKey;
  onChange: (k: PeriodKey) => void;
}> = ({ options, value, onChange }) => {
  const topYear = options.find((o) => o.group === "year");
  const topPatch = options.find((o) => o.group === "patch");
  const topEvent = options.find((o) => o.group === "event");
  const last20 = options.find((o) => o.key === "last20");
  const pills: { key: PeriodKey; label: string }[] = [
    { key: "all", label: tl("All time") },
    ...(last20 ? [{ key: "last20", label: tl("Last {n} games", { n: "20" }) }] : []),
    ...(topYear ? [{ key: topYear.key, label: topYear.label }] : []),
    ...(topPatch ? [{ key: topPatch.key, label: `${tl("Patch")} ${topPatch.label}` }] : []),
    ...(topEvent ? [{ key: topEvent.key, label: topEvent.label }] : []),
  ];
  return (
    <div data-nocapture="1" className="flex flex-wrap items-center gap-1 text-[11px]">
      {pills.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={`px-2 py-0.5 rounded-full border truncate max-w-[12rem] ${
            value === p.key
              ? "border-rw-accent bg-rw-accent/15 text-rw-text font-semibold"
              : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
};

/** Narrows the period's games: wins or losses only, and for a team blue or red side only. */
type GameOnly = "" | "w" | "l" | "b" | "r";
const OnlyPicker: React.FC<{ value: GameOnly; onChange: (v: GameOnly) => void; sides?: boolean }> = ({ value, onChange, sides }) => (
  <>
    <span className="rw-capture-only text-xs text-rw-sub">{value ? onlyText(value) : ""}</span>
    <select
      data-nocapture="1"
      value={value}
      onChange={(e) => onChange(e.target.value as GameOnly)}
      aria-label={tl("Which games")}
      className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text max-w-full"
    >
      <option value="">{tl("Every game")}</option>
      <option value="w">{tl("Wins only")}</option>
      <option value="l">{tl("Losses only")}</option>
      {sides && <option value="b">{tl("Blue side only")}</option>}
      {sides && <option value="r">{tl("Red side only")}</option>}
    </select>
  </>
);
const onlyText = (v: GameOnly) =>
  ({ "": "", w: tl("Wins only"), l: tl("Losses only"), b: tl("Blue side only"), r: tl("Red side only") })[v];

/** Default period: ?p= from the address if present, "all" for inactive/disbanded teams/players, else the newest year. */
export const defaultPeriod = (opts: PeriodOption[], preferAll = false): PeriodKey => {
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("p");
    if (p && (opts.some((o) => o.key === p) || /^(all|last\d+|y\d{4}|p:.+|e:.+)$/.test(p))) return p;
  }
  if (preferAll) return "all";
  return opts.find((o) => o.group === "year")?.key || "all";
};

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

export const PlayerPeriodStats: React.FC<{ slug: string; who?: Who; has2y?: boolean; preferAll?: boolean }> = ({ slug, who, has2y, preferAll }) => {
  const { loading, rows } = useGameLog(slug, has2y, loadPlayerGames2y, loadPlayerGames);
  if (loading) return null;
  if (!rows || !rows.length) return null;
  return <PlayerPeriodView slug={slug} rows={rows} who={who} preferAll={preferAll} />;
};

const PlayerPeriodView: React.FC<{ slug: string; rows: PlayerGameRow[]; who?: Who; preferAll?: boolean }> = ({
  slug,
  rows,
  who,
  preferAll,
}) => {
  useDDragon();
  const options = useMemo(() => periodOptions(rows.map(playerRowRef)), [rows]);
  const [period, setPeriod] = useState<PeriodKey>(() => defaultPeriod(options, preferAll));
  const [only, setOnly] = useState<GameOnly>("");
  const sel = useMemo(
    () => inPeriod(rows, period, playerRowRef).filter((r) => (only === "w" ? r[6] === 1 : only === "l" ? r[6] === 0 : true)),
    [rows, period, only],
  );
  const agg = useMemo(() => playerAgg(sel), [sel]);
  // the period's average RiftWise rating (src/hub/playerRating.ts), and its best game
  const ratingFile = useRatingFile();
  const rated = useMemo(() => {
    if (!ratingFile) return null;
    const vs = sel.map((r) => rateLine(playerRowLine(r), ratingFile)).filter((v): v is number => v != null);
    return vs.length ? { avg: vs.reduce((s, v) => s + v, 0) / vs.length, best: Math.max(...vs), n: vs.length } : null;
  }, [sel, ratingFile]);
  const [hidden, reveal] = useHidden(
    `period:p:${slug}:${period}`,
    sel.find((r) => isFresh(r[0]))?.[0],
  );
  const detail = agg.csm != null;
  const maxChampG = Math.max(1, ...agg.champs.map((c) => c.g));
  const cols: Column<(typeof agg.champs)[number]>[] = [
    {
      key: "c",
      label: tl("Champion"),
      value: (c) => c.c,
      render: (c) => <ChampLink name={c.c} size={18} />,
    },
    {
      key: "g",
      label: tl("Games"),
      value: (c) => c.g,
      render: (c) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
            <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(6, Math.round((c.g / maxChampG) * 100))}%` }} />
          </span>
          <HubLink
            to={{ kind: "player", slug, tab: "champions", query: `champ=${encodeURIComponent(c.c)}&p=${encodeURIComponent(period)}` }}
            className="hover:text-rw-accent hover:underline"
          >
            {c.g}
          </HubLink>
        </span>
      ),
    },
    {
      key: "w",
      label: tl("Win %"),
      value: (c) => (hidden ? null : c.w / c.g),
      render: (c) => (hidden ? "–" : <WinBar w={c.w} g={c.g} />),
    },
    {
      key: "kda",
      label: tl("KDA"),
      value: (c) => c.kda,
      render: (c) => <KdaBar kda={c.kda} />,
    },
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
          <OnlyPicker value={only} onChange={setOnly} />
          {!hidden && (
            <CopyPeriodTextPost
              buildText={() => {
                const head = `${who?.name || slug} — ${tl("Stats for")} ${periodText} (${agg.w}-${agg.g - agg.w}, ${winRate(agg.w, agg.g)})`;
                const stats = `KDA ${fmtN(agg.kda)}${agg.csm != null ? ` · CS/m ${agg.csm}` : ""}${agg.dpm != null ? ` · DPM ${fmtNum(agg.dpm)}` : ""}${agg.tl?.gd15 != null ? ` · GD@15 ${signed(agg.tl.gd15)}` : ""}`;
                const champs = agg.champs
                  .slice(0, 5)
                  .map((c) => `• ${c.c}: ${c.w}-${c.g - c.w} (${winRate(c.w, c.g)}, KDA ${fmtN(c.kda)})`);
                return [head, stats, ...champs].join("\n");
              }}
            />
          )}
          {who && !hidden && (
            <BroadcastCardButton data={() => playerCardData({ ...who, slug }, agg, periodText)} name={`${who.name}-${period}`} />
          )}
        </>
      }
      share={`${slug}-${period}`}
    >
      <QuickPeriods options={options} value={period} onChange={setPeriod} />
      {hidden ? (
        <div className="py-3 text-center">
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 rw-stats">
            <Stat
              label={tl("Games")}
              value={`${agg.w}-${agg.g - agg.w}`}
              sub={tl("{p} win rate", { p: winRate(agg.w, agg.g) })}
              to={{ kind: "player", slug, tab: "matches" }}
            />
            {rated && (
              <Stat
                label={tl("Rating")}
                value={fmtRating(rated.avg)}
                sub={tl("best {r} · 6 is an average game", { r: fmtRating(rated.best) })}
                to={{ kind: "leaders" }}
              />
            )}
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
              to={{ kind: "player", slug, tab: "champions", ...(period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2 items-start [&>*:only-child]:col-span-full">
            <TrendChart games={sel.map((r) => ({ date: r[0], won: r[6] }))} />
            {agg.tl && (
              <PlayerEarly
                t={agg.tl}
                dmgShare={agg.dmgShare}
                goldShare={agg.goldShare}
              />
            )}
          </div>
          {agg.champs.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <Sub>{tl("Champions")}</Sub>
              <SectionCard
                section={who ? `${who.name} · ${tl("Champions")}` : tl("Champions")}
                sub={periodText}
                name={`${slug}-champions-${period}`}
                rows={() =>
                  agg.champs.slice(0, 10).map((c, idx) => ({
                    rank: idx + 1,
                    champ: c.c,
                    label: c.c,
                    sub: `${c.g}G · KDA ${fmtN(c.kda)}${c.gd15 != null ? ` · GD@15 ${signed(c.gd15)}` : ""}`,
                    value: winRate(c.w, c.g),
                  }))
                }
              />
            </div>
          )}
          <SortTable
            rows={agg.champs}
            columns={cols}
            initial={{ key: "g", desc: true }}
            rowKey={(c) => c.c}
            copyName={`${slug}-champions`}
          />
          <PlayerOpponents
            slug={slug}
            name={who?.name || slug}
            rows={sel}
            cardSub={periodText}
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

type TeamWho = { name: string; sub?: string; code?: string; roster?: RosterPlayer[] };

export const TeamPeriodStats: React.FC<{ slug: string; has2y?: boolean; who?: TeamWho; preferAll?: boolean }> = ({ slug, has2y, who, preferAll }) => {
  const { loading, rows } = useGameLog(slug, has2y, loadTeamGames2y, loadTeamGames);
  if (loading) return <Loading />;
  if (!rows || !rows.length) return null;
  return <TeamPeriodView slug={slug} rows={rows} who={who} preferAll={preferAll} />;
};

const ChampCounts: React.FC<{ title: string; list: [string, number][]; tone?: "ban" | "banVs"; slug?: string; period?: string }> = ({
  title,
  list,
  tone = "ban",
  slug,
  period,
}) => {
  if (!list.length) return null;
  const maxN = Math.max(1, ...list.map(([, n]) => n));
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-rw-muted mb-1">
        {title}
      </div>
      <ul className="text-xs space-y-1">
        {list.map(([c, n]) => (
          <li key={c} className="flex items-center justify-between gap-2 min-w-0">
            <ChampLink name={c} size={16} />
            <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums">
              <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block">
                <span
                  className={`block h-full rounded-full ${tone === "banVs" ? "bg-rw-red/70" : "bg-rw-accent/65"}`}
                  style={{ width: `${Math.max(8, Math.round((n / maxN) * 100))}%` }}
                />
              </span>
              {slug ? (
                <HubLink
                  to={{ kind: "team", slug, tab: "champions", query: `champ=${encodeURIComponent(c)}${period ? `&p=${encodeURIComponent(period)}` : ""}` }}
                  className="text-rw-sub w-5 text-right hover:text-rw-accent hover:underline"
                >
                  {n}
                </HubLink>
              ) : (
                <span className="text-rw-sub w-5 text-right">{n}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const TeamPeriodView: React.FC<{ slug: string; rows: TeamGameRow[]; who?: TeamWho; preferAll?: boolean }> = ({
  slug,
  rows,
  who,
  preferAll,
}) => {
  useDDragon();
  const options = useMemo(() => periodOptions(rows.map(teamRowRef)), [rows]);
  const [period, setPeriod] = useState<PeriodKey>(() => defaultPeriod(options, preferAll));
  const [only, setOnly] = useState<GameOnly>("");
  const sel = useMemo(
    () =>
      inPeriod(rows, period, teamRowRef).filter((r) =>
        only === "w" ? r[7] === 1 : only === "l" ? r[7] === 0 : only === "b" || only === "r" ? r[6] === only : true,
      ),
    [rows, period, only],
  );
  const t = useMemo(() => teamAgg(sel), [sel]);
  const [hidden, reveal] = useHidden(
    `period:t:${slug}:${period}`,
    sel.find((r) => isFresh(r[0]))?.[0],
  );
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
          <OnlyPicker value={only} onChange={setOnly} sides />
          {!hidden && (
            <CopyPeriodTextPost
              buildText={() => {
                const head = `${who?.name || slug} — ${tl("Stats for")} ${periodText} (${t.w}-${t.g - t.w}, ${winRate(t.w, t.g)})`;
                const stats = `Blue ${winRate(t.blue[1], t.blue[0])} / Red ${winRate(t.red[1], t.red[0])}${t.tl?.gd15 != null ? ` · GD@15 ${signed(t.tl.gd15)}` : ""}${t.dragShare != null ? ` · DRA% ${pct(t.dragShare)}` : ""}${t.baronShare != null ? ` · Baron% ${pct(t.baronShare)}` : ""}`;
                const picks = t.picks
                  .slice(0, 5)
                  .map(([c, n, w]) => `• ${c}: ${n}G (${winRate(w, n)})`);
                return [head, stats, ...picks].join("\n");
              }}
            />
          )}
          {who && !hidden && (
            <BroadcastCardButton
              data={() => teamSoloCardData(who, t, periodText)}
              name={`${who.name}-${period}`}
              label={tl("Overview card")}
            />
          )}
        </>
      }
      share={`${slug}-${period}`}
    >
      <QuickPeriods options={options} value={period} onChange={setPeriod} />
      {hidden ? (
        <div className="py-3 text-center">
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 rw-stats">
            <Stat
              label={tl("Games")}
              value={`${t.w}-${t.g - t.w}`}
              sub={tl("{p} win rate", { p: winRate(t.w, t.g) })}
              to={{ kind: "team", slug, tab: "matches" }}
            />
            <Stat
              label={tl("Blue / red side")}
              value={`${winRate(t.blue[1], t.blue[0])} / ${winRate(t.red[1], t.red[0])}`}
              sub={tl("{b} blue games · {r} red", {
                b: t.blue[0],
                r: t.red[0],
              })}
              to={{ kind: "finder", query: `team=${encodeURIComponent(slug)}` }}
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
              to={{ kind: "team", slug, tab: "champions", ...(period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2 items-start">
            <div className="space-y-4 min-w-0">
              <TeamEarly t={t} />
              <Playstyle t={t} />
              <WinWhen rows={sel} teamName={who?.name} periodLabel={periodText} />
            </div>
            <div className="space-y-4 min-w-0">
              <div className="grid sm:grid-cols-3 gap-4">
                {t.picks.length > 0 && (() => {
                  const maxPickN = Math.max(1, ...t.picks.map(([, n]) => n));
                  return (
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-rw-muted mb-1">
                        {tl("Most picked champions")}
                      </div>
                      <ul className="text-xs space-y-1">
                        {t.picks.map(([c, n, w]) => {
                          const good = n > 0 && w / n >= 0.5;
                          return (
                            <li
                              key={c}
                              className="flex items-center justify-between gap-2 min-w-0"
                            >
                              <ChampLink name={c} size={16} />
                              <span className="inline-flex items-center gap-1.5 text-rw-sub tabular-nums shrink-0">
                                <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block">
                                  <span
                                    className="block h-full bg-rw-teal/75 rounded-full"
                                    style={{ width: `${Math.max(8, Math.round((n / maxPickN) * 100))}%` }}
                                  />
                                </span>
                                <HubLink
                                  to={{ kind: "team", slug, tab: "champions", query: `champ=${encodeURIComponent(c)}&p=${encodeURIComponent(period)}` }}
                                  className="hover:text-rw-accent hover:underline"
                                >
                                  {n}
                                </HubLink>
                                <span className="text-rw-muted">·</span>
                                <span className={`w-9 text-right ${good ? "text-rw-teal font-semibold" : "text-rw-red"}`}>
                                  {winRate(w, n)}
                                </span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}
                <ChampCounts title={tl("Most banned by them")} list={t.bans} tone="ban" slug={slug} period={period} />
                <ChampCounts
                  title={tl("Most banned against them")}
                  list={t.bansVs}
                  tone="banVs"
                  slug={slug}
                  period={period}
                />
              </div>
              <DraftTendencies rows={sel} teamName={who?.name} periodLabel={periodText} />
              <TrendChart games={sel.map((r) => ({ date: r[0], won: r[7] }))} />
            </div>
          </div>
          <TeamPeriodOpponents
            teamSlug={slug}
            teamName={who?.name || slug}
            rows={sel}
            cardSub={periodText}
          />
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
