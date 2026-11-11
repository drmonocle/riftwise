/**
 * "Stats for": a player's or team's numbers for any period (all time, last N games, a year, one tournament),
 * worked out from their game log like gol.gg's season / split pages. Spoiler mode hides periods with fresh games.
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, roleName, fmtDec, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { currentHubRoute, hubShareUrl } from "../../hub/route";
import { bare, loadPlayerGames, loadPlayerGames2y, loadTeamGames, loadTeamGames2y, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolveEventSlug, resolveTeamAlias } from "../../hub/data";
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
  winWhen,
  withRequestedPeriod,
} from "../../hub/period";
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

const CopyPeriodTextPost: React.FC<{ buildText: () => string; url?: string }> = ({ buildText, url }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const shareUrl = url || hubShareUrl(currentHubRoute());
    const text = `${buildText()}\n${shareUrl}`;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setState("copied");
        window.setTimeout(() => setState("idle"), 1800);
      })
      .catch(() => {
        setState("failed");
        window.setTimeout(() => setState("idle"), 2200);
      });
  };
  return (
    <button
      type="button"
      data-nocapture="1"
      onClick={copy}
      className="px-2 py-1 rounded border border-rw-border bg-rw-surface text-[11px] font-semibold text-rw-sub hover:text-rw-text hover:border-rw-accent/60 transition-colors"
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

/** A player's early game from Oracle's Elixir: leads over the lane opponent, first blood, warding. */
export const PlayerEarly: React.FC<{
  t: PlayerTl;
  dmgShare: number | null;
  goldShare: number | null;
  leaderTo?: (stat: string) => import("../../hub/route").HubRoute;
  matchesTo?: import("../../hub/route").HubRoute;
}> = ({ t, dmgShare, goldShare, leaderTo, matchesTo }) => {
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
          to={leaderTo ? leaderTo("g15") : matchesTo}
        />
        <Stat
          label="GD@15"
          value={signed(t.gd15)}
          sub={lead(t.csd15, t.xpd15)}
          to={leaderTo ? leaderTo("g15") : matchesTo}
        />
        <Stat
          label="GD@20"
          value={signed(t.gd20)}
          sub={lead(t.csd20, t.xpd20)}
          to={leaderTo ? leaderTo("g15") : matchesTo}
        />
        <Stat
          label={tl("DMG% − Gold%")}
          value={signed(eff)}
          sub={tl("Damage vs. gold share")}
          to={leaderTo ? leaderTo("dmgs") : matchesTo}
        />
        <Stat
          label={tl("First blood")}
          value={pct(t.fbPart)}
          sub={tl("{p} died for it", { p: pct(t.fbVictim) })}
          to={leaderTo ? leaderTo("fbp") : matchesTo}
        />
        <Stat
          label={tl("Wards / min")}
          value={dash(t.wpm)}
          sub={tl("{n} cleared / min", { n: dash(t.wcpm) })}
          to={leaderTo ? leaderTo("vsm") : matchesTo}
        />
        <Stat
          label={tl("Control wards")}
          value={dash(t.cw)}
          sub={tl("bought per game")}
          to={leaderTo ? leaderTo("vsm") : matchesTo}
        />
      </div>
      <OeCredit n={t.n} />
    </div>
  );
};

/** A team's early game from Oracle's Elixir: gold leads, firsts, plates, grubs, vision. */
export const TeamEarly: React.FC<{ t: TeamAgg; to?: import("../../hub/route").HubRoute }> = ({ t: agg, to }) => {
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
          to={to}
        />
        <Stat
          label={tl("Ahead at 15")}
          value={pct(t.lead15)}
          sub={tl("Win {a} ahead · {b} behind", {
            a: winRate(t.ahead[1], t.ahead[0]),
            b: winRate(t.behind[1], t.behind[0]),
          })}
          to={to}
        />
        <Stat
          label={tl("First blood")}
          value={pct(t.fb)}
          sub={tl("First tower {p}", { p: pct(t.ft) })}
          to={to}
        />
        <Stat
          label={tl("First mid tower")}
          value={pct(t.fmt)}
          sub={tl("First to 3 towers {p}", { p: pct(t.f3t) })}
          to={to}
        />
        <Stat
          label={tl("First dragon")}
          value={pct(t.fd)}
          sub={tl("Herald {h} · Baron {b}", { h: pct(t.fh), b: pct(t.fbaron) })}
          to={to}
        />
        <Stat
          label={tl("Turret plates")}
          value={dash(t.plates)}
          sub={
            t.platesLost != null
              ? tl("{n} lost", { n: t.platesLost })
              : undefined
          }
          to={to}
        />
        {t.grubs != null && (
          <Stat
            label={tl("Void grubs")}
            value={t.grubs == null ? "–" : fmtDec(t.grubs)}
            sub={tl("{p} of all grubs", { p: pct(t.grubShare) })}
            to={to}
          />
        )}
        <Stat
          label={tl("VS / min")}
          value={dash(t.vspm)}
          sub={tl("{w} wards · {c} cleared / min", {
            w: dash(t.wpm),
            c: dash(t.wcpm),
          })}
          to={to}
        />
        <Stat
          label={tl("Control wards")}
          value={dash(t.cw)}
          sub={tl("bought per game")}
          to={to}
        />
        <Stat
          label="CKPM"
          value={agg.ckpm == null ? "–" : fmtDec(agg.ckpm, 2)}
          sub={tl("Kills per minute, both teams")}
          to={to}
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

export const Playstyle: React.FC<{ t: TeamAgg; to?: import("../../hub/route").HubRoute }> = ({ t, to }) => {
  const tags = playstyleTags(t);
  if (!tags.length) return null;
  return (
    <div className="space-y-1">
      <Sub>{tl("Playstyle")}</Sub>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((x) => {
          const cls = `px-2 py-1 rounded-full border text-[11px] ${
            x.good === true ? "border-rw-teal/60 text-rw-teal" : x.good === false ? "border-rw-red/60 text-rw-red" : "border-rw-border text-rw-sub"
          }`;
          return to ? (
            <HubLink key={x.tag} to={to} title={x.why} className={`${cls} hover:border-rw-accent`}>
              <span className="font-semibold hover:underline">{x.tag}</span> <span className="text-rw-muted">· {x.why}</span>
            </HubLink>
          ) : (
            <span key={x.tag} title={x.why} className={cls}>
              <span className="font-semibold">{x.tag}</span> <span className="text-rw-muted">· {x.why}</span>
            </span>
          );
        })}
      </div>
      <p className="text-[10px] text-rw-muted">
        <HubLink to={{ kind: "about" }} className="hover:text-rw-accent hover:underline">
          {tl("Compared with every pro team season since 2024: a label means the top or bottom fifth.")}
        </HubLink>
      </p>
    </div>
  );
};

/** Win rate by what happened early: each first objective got or given up, and the gold lead at 15 in four bands. */
export const WinWhen: React.FC<{ rows: TeamGameRow[]; teamName?: string; teamSlug?: string; period?: string; periodLabel?: string }> = ({
  rows,
  teamName,
  teamSlug,
  period,
  periodLabel,
}) => {
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
  const finderQuery = teamSlug
    ? `team=${encodeURIComponent(teamSlug)}${
        period && /^y\d{4}$/.test(period)
          ? `&year=${encodeURIComponent(period.slice(1))}`
          : period?.startsWith("e:")
            ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}`
            : period?.startsWith("p:")
              ? `&patch=${encodeURIComponent(period.slice(2))}`
              : ""
      }`
    : "";
  const wrCell = ([g, w]: [number, number]) => {
    if (!g) return <span className="text-rw-muted">–</span>;
    const pctVal = Math.round((w / g) * 100);
    const good = w / g >= 0.5;
    const inner = (
      <>
        <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
          <span className={`block h-full rounded-full ${good ? "bg-rw-teal/80" : "bg-rw-red/75"}`} style={{ width: `${Math.max(4, pctVal)}%` }} />
        </span>
        <span>
          <span className={`font-semibold ${good ? "text-rw-teal" : "text-rw-red"}`}>{pctVal}%</span>
          <span className="text-rw-muted text-[10px]"> ({g})</span>
        </span>
      </>
    );
    return finderQuery ? (
      <HubLink
        to={{ kind: "finder", query: finderQuery }}
        className="inline-flex items-center justify-end gap-1.5 font-mono tabular-nums hover:underline"
        title={tl("Game finder")}
      >
        {inner}
      </HubLink>
    ) : (
      <span className="inline-flex items-center justify-end gap-1.5 font-mono tabular-nums">
        {inner}
      </span>
    );
  };
  const wrStr = ([g, w]: [number, number]) => (g ? `${Math.round((w / g) * 100)}% (${g}G)` : "–");
  const th = "px-2 py-1 font-normal text-[10px] text-rw-muted";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Sub>{tl("Win rate when…")}</Sub>
        <div className="flex flex-wrap items-center gap-1.5" data-nocapture="1">
          {teamSlug && (
            <>
              <HubLink
                to={{ kind: "prep", a: teamSlug, ...(period && period !== "all" ? { period } : {}) }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(teamSlug)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "compare", mode: "team", a: teamSlug, ...(period && period !== "all" ? { period } : {}) }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...(teamSlug ? { query: `q=${encodeURIComponent(teamSlug)}` } : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  ...(period && /^y\d{4}$/.test(period)
                    ? { query: `key=${encodeURIComponent(period)}` }
                    : period?.startsWith("p:")
                      ? { query: `key=p${encodeURIComponent(period.slice(2))}` }
                      : period?.startsWith("e:")
                        ? { query: `event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}` }
                        : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              {finderQuery && (
                <HubLink
                  to={{ kind: "finder", query: finderQuery }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    q: teamSlug || teamName || "",
                    ...(period && /^y\d{4}$/.test(period)
                      ? { year: period.slice(1) }
                      : period?.startsWith("e:")
                        ? { event: resolveEventSlug(period.slice(2)) }
                        : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
            </>
          )}
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
            rows={() =>
              [
                ...d.firsts.map((x) => ({
                  team: teamName,
                  label: label[x.key],
                  sub: `${tl("Opponent got it")}: ${wrStr(x.lost)}`,
                  value: wrStr(x.got),
                  win: x.got[0] > 0 ? x.got[1] / x.got[0] >= 0.5 : undefined,
                })),
                ...d.gold.map((x) => ({
                  team: teamName,
                  label: `${tl("Gold at 15 minutes")} · ${label[x.key]}`,
                  value: wrStr([x.g, x.w]),
                  win: x.g > 0 ? x.w / x.g >= 0.5 : undefined,
                })),
              ].map((row, idx) => ({ rank: idx + 1, ...row }))
            }
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
                <td className="px-2 py-1 text-rw-sub" data-sort={label[x.key]}>
                  {finderQuery ? (
                    <HubLink to={{ kind: "finder", query: finderQuery }} className="hover:text-rw-accent hover:underline">
                      {label[x.key]}
                    </HubLink>
                  ) : (
                    label[x.key]
                  )}
                </td>
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
                <td className="px-2 py-1 text-rw-sub" data-sort={label[x.key]}>
                  {finderQuery ? (
                    <HubLink to={{ kind: "finder", query: finderQuery }} className="hover:text-rw-accent hover:underline">
                      {label[x.key]}
                    </HubLink>
                  ) : (
                    label[x.key]
                  )}
                </td>
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
}> = ({ options: rawOptions, value, onChange }) => {
  const options = useMemo(() => withRequestedPeriod(rawOptions, value), [rawOptions, value]);
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
}> = ({ options: rawOptions, value, onChange }) => {
  const options = useMemo(() => withRequestedPeriod(rawOptions, value), [rawOptions, value]);
  const topYear = options.find((o) => o.group === "year");
  const topPatch = options.find((o) => o.group === "patch");
  const topEvent = options.find((o) => o.group === "event");
  const last20 = options.find((o) => o.key === "last20");
  const current = options.find((o) => o.key === value);
  const pills: { key: PeriodKey; label: string }[] = [
    { key: "all", label: tl("All time") },
    ...(last20 ? [{ key: "last20", label: tl("Last {n} games", { n: "20" }) }] : []),
    ...(topYear ? [{ key: topYear.key, label: topYear.label }] : []),
    ...(topPatch ? [{ key: topPatch.key, label: `${tl("Patch")} ${topPatch.label}` }] : []),
    ...(topEvent ? [{ key: topEvent.key, label: topEvent.label }] : []),
  ];
  if (current && !pills.some((p) => p.key === current.key)) {
    pills.push({
      key: current.key,
      label:
        current.group === "basic"
          ? tl("Last {n} games", { n: current.label })
          : current.group === "patch"
            ? `${tl("Patch")} ${current.label}`
            : current.label,
    });
  }
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

/** Default period: ?p= (or ?y=YYYY) from the address if present, "all" for inactive/disbanded teams/players, else the newest year. */
export const defaultPeriod = (opts: PeriodOption[], preferAll = false, query?: string): PeriodKey => {
  const search = query ?? (typeof window !== "undefined" ? window.location.search : "");
  if (search) {
    const params = new URLSearchParams(search);
    const rawY = params.get("y") || params.get("year");
    const rawEv = params.get("event");
    const rawPatch = params.get("patch");
    const evSlug = rawEv ? resolveEventSlug(rawEv.startsWith("e:") ? rawEv.slice(2) : rawEv) : null;
    const p =
      params.get("p") ||
      params.get("period") ||
      (rawY && /^\d{4}$/.test(rawY) ? `y${rawY}` : evSlug ? `e:${evSlug}` : rawPatch ? (rawPatch.startsWith("p:") ? rawPatch : `p:${rawPatch}`) : null);
    if (p && (opts.some((o) => o.key === p) || /^(all|last\d+|y\d{4}|p:.+|e:.+)$/.test(p))) return p;
  }
  if (preferAll) return "all";
  return opts.find((o) => o.group === "year")?.key || "all";
};

const teamSlug = (name: string): string => resolveTeamAlias(name) || prettySlug(name);

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

export const PlayerPeriodStats: React.FC<{ slug: string; who?: Who; has2y?: boolean; preferAll?: boolean; query?: string }> = ({
  slug,
  who,
  has2y,
  preferAll,
  query,
}) => {
  const { loading, rows } = useGameLog(slug, has2y, loadPlayerGames2y, loadPlayerGames);
  if (loading) return null;
  if (!rows || !rows.length) return null;
  return <PlayerPeriodView slug={slug} rows={rows} who={who} preferAll={preferAll} query={query} />;
};

const PlayerPeriodView: React.FC<{ slug: string; rows: PlayerGameRow[]; who?: Who; preferAll?: boolean; query?: string }> = ({
  slug,
  rows,
  who,
  preferAll,
  query,
}) => {
  useDDragon();
  const refs = useMemo(() => rows.map(playerRowRef), [rows]);
  const baseOptions = useMemo(() => periodOptions(refs), [refs]);
  const [period, setPeriod] = useState<PeriodKey>(() => defaultPeriod(baseOptions, preferAll, query));
  useEffect(() => {
    if (!query) return;
    setPeriod(defaultPeriod(baseOptions, preferAll, query));
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => withRequestedPeriod(baseOptions, period, refs), [baseOptions, period, refs]);
  const [only, setOnly] = useState<GameOnly>("");
  const [champSearch, setChampSearch] = useState(() => {
    const q = new URLSearchParams(query ?? (typeof window !== "undefined" ? window.location.search : ""));
    return q.get("champ") || q.get("q") || "";
  });
  useEffect(() => {
    if (!query) return;
    const q = new URLSearchParams(query);
    const c = q.get("champ") || q.get("q");
    if (c != null) setChampSearch(c);
  }, [query]);
  const sel = useMemo(
    () => inPeriod(rows, period, playerRowRef).filter((r) => (only === "w" ? r[6] === 1 : only === "l" ? r[6] === 0 : true)),
    [rows, period, only],
  );
  const agg = useMemo(() => playerAgg(sel), [sel]);
  const filteredChamps = useMemo(() => {
    const terms = champSearch
      .trim()
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s.trim()))
      .filter(Boolean);
    if (!terms.length) return agg.champs;
    return agg.champs.filter((c) => {
      const hay = normText(`${c.c} ${champName(c.c)} ${prettySlug(c.c)}`);
      return terms.some(
        (t) =>
          hay.includes(t) ||
          (bare(t).length >= 2 && bare(hay).includes(bare(t))) ||
          matchesChampSearch(c.c, t),
      );
    });
  }, [agg.champs, champSearch]);
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
  const pQuery = period !== "all" ? `p=${encodeURIComponent(period)}` : undefined;
  const champTabQuery = (c: string) => `champ=${encodeURIComponent(resolveChampSlug(c))}${pQuery ? `&${pQuery}` : ""}`;
  const cols: Column<(typeof agg.champs)[number]>[] = [
    {
      key: "c",
      label: tl("Champion"),
      value: (c) => champName(c.c),
      render: (c) => <ChampLink name={c.c} size={18} query={pQuery} />,
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
            to={{ kind: "player", slug, tab: "champions", query: champTabQuery(c.c) }}
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
      render: (c) =>
        hidden ? (
          "–"
        ) : (
          <HubLink
            to={{ kind: "player", slug, tab: "champions", query: champTabQuery(c.c) }}
            className="inline-flex hover:opacity-85"
          >
            <WinBar w={c.w} g={c.g} />
          </HubLink>
        ),
    },
    {
      key: "kda",
      label: tl("KDA"),
      value: (c) => c.kda,
      render: (c) => (
        <HubLink
          to={{ kind: "player", slug, tab: "champions", query: champTabQuery(c.c) }}
          className="inline-flex hover:opacity-85"
          title={tl("Every game")}
        >
          <KdaBar kda={c.kda} />
        </HubLink>
      ),
    },
    {
      key: "kdaa",
      label: "K / D / A",
      value: (c) => c.k / c.g,
      render: (c) => (
        <HubLink
          to={{ kind: "player", slug, tab: "champions", query: champTabQuery(c.c) }}
          className="hover:text-rw-accent hover:underline"
          title={tl("Every game")}
        >
          {`${fmtDec(c.k / c.g)} / ${fmtDec(c.d / c.g)} / ${fmtDec(c.a / c.g)}`}
        </HubLink>
      ),
    },
    ...(detail
      ? ([
          {
            key: "csm",
            label: tl("CS/m"),
            title: tl("CS per minute"),
            value: (c) => c.csm,
            render: (c) =>
              c.csm != null ? (
                <HubLink
                  to={{ kind: "player", slug, tab: "champions", query: champTabQuery(c.c) }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {c.csm}
                </HubLink>
              ) : (
                "–"
              ),
          },
          {
            key: "dpm",
            label: tl("DPM"),
            title: tl("Damage per minute"),
            value: (c) => c.dpm,
            render: (c) =>
              c.dpm != null ? (
                <HubLink
                  to={{ kind: "player", slug, tab: "champions", query: champTabQuery(c.c) }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {fmtNum(c.dpm)}
                </HubLink>
              ) : (
                "–"
              ),
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
            render: (c) =>
              c.gd15 != null ? (
                <HubLink
                  to={{ kind: "player", slug, tab: "champions", query: champTabQuery(c.c) }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {signed(c.gd15)}
                </HubLink>
              ) : (
                "–"
              ),
          },
          {
            key: "csd15",
            label: "CSD@15",
            title: tl("CS lead over the lane opponent at 15 minutes"),
            value: (c) => c.csd15,
            render: (c) =>
              c.csd15 != null ? (
                <HubLink
                  to={{ kind: "player", slug, tab: "champions", query: champTabQuery(c.c) }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {signed(c.csd15)}
                </HubLink>
              ) : (
                "–"
              ),
          },
        ] as Column<(typeof agg.champs)[number]>[])
      : []),
  ];
  const periodText = (() => {
    const o = options.find((x) => x.key === period);
    return !o || o.key === "all"
      ? tl("All time")
      : o.group === "basic"
        ? tl("Last {n} games", { n: o.label })
        : o.group === "patch"
          ? `${tl("Patch")} ${o.label}`
          : o.label;
  })();
  const topFilteredChamp = filteredChamps[0] || agg.champs[0];
  const secFilteredChamp = filteredChamps[1] || (topFilteredChamp && agg.champs[0] && agg.champs[0].c !== topFilteredChamp.c ? agg.champs[0] : agg.champs[1]);
  const singleFilteredChamp = filteredChamps.length === 1 ? filteredChamps[0] : agg.champs.length === 1 ? agg.champs[0] : undefined;
  const leaderTo = (stat: string): import("../../hub/route").HubRoute => ({
    kind: "leaders",
    query: new URLSearchParams({
      stat,
      q: slug,
      ...(agg.roles[0] ? { role: agg.roles[0] } : {}),
      ...(singleFilteredChamp ? { champ: resolveChampSlug(singleFilteredChamp.c) } : {}),
      ...(/^y\d{4}$/.test(period) ? { year: period.slice(1) } : period.startsWith("e:") ? { event: resolveEventSlug(period.slice(2)) } : {}),
    }).toString(),
  });
  return (
    <Section
      title={tl("Stats for")}
      right={
        <>
          <PeriodPicker options={options} value={period} onChange={setPeriod} />
          <OnlyPicker value={only} onChange={setOnly} />
          {!hidden && (
            <>
              <HubLink
                to={{ kind: "compare", mode: "player", a: slug, ...(period !== "all" ? { period } : {}) }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    player: slug,
                    ...(singleFilteredChamp ? { champ: resolveChampSlug(singleFilteredChamp.c) } : {}),
                    ...(/^y\d{4}$/.test(period)
                      ? { year: period.slice(1) }
                      : period.startsWith("e:")
                        ? { event: resolveEventSlug(period.slice(2)) }
                        : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `player=${encodeURIComponent(slug)}${singleFilteredChamp ? `&champ=${encodeURIComponent(resolveChampSlug(singleFilteredChamp.c))}` : ""}${
                    /^y\d{4}$/.test(period)
                      ? `&year=${encodeURIComponent(period.slice(1))}`
                      : period.startsWith("e:")
                        ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}`
                        : period.startsWith("p:")
                          ? `&patch=${encodeURIComponent(period.slice(2))}`
                          : ""
                  }`,
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              {topFilteredChamp && (
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${encodeURIComponent(resolveChampSlug(topFilteredChamp.c))}${secFilteredChamp ? `&vs=${encodeURIComponent(resolveChampSlug(secFilteredChamp.c))}` : ""}${agg.roles[0] ? `&role=${encodeURIComponent(agg.roles[0])}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Counters")} →
                </HubLink>
              )}
              {who?.club && (
                <>
                  <HubLink
                    to={{
                      kind: "prep",
                      a: teamSlug(who.club),
                      ...(period !== "all" ? { period } : {}),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        teams: teamSlug(who.club),
                        ...(period !== "all" ? { p: period } : {}),
                        ...(agg.roles[0] ? { role: agg.roles[0] } : {}),
                        ...(topFilteredChamp ? { champ: resolveChampSlug(topFilteredChamp.c) } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                </>
              )}
              <HubLink
                to={leaderTo("kda")}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  ...(agg.roles[0] || topFilteredChamp || /^y\d{4}$/.test(period) || period.startsWith("p:") || period.startsWith("e:")
                    ? {
                        query: new URLSearchParams({
                          ...(agg.roles[0] ? { role: agg.roles[0] } : {}),
                          ...(topFilteredChamp ? { q: resolveChampSlug(topFilteredChamp.c) } : {}),
                          ...(/^y\d{4}$/.test(period)
                            ? { key: period }
                            : period.startsWith("p:")
                              ? { key: `p${period.slice(2)}` }
                              : period.startsWith("e:")
                                ? { event: resolveEventSlug(period.slice(2)) }
                                : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...(who?.club ? { query: `q=${encodeURIComponent(teamSlug(who.club))}` } : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <CopyPeriodTextPost
              url={hubShareUrl({
                kind: "player",
                slug,
                tab: "stats",
                ...(period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}),
              })}
              buildText={() => {
                const head = `${who?.name || slug} — ${tl("Stats for")} ${periodText} (${agg.w}-${agg.g - agg.w}, ${winRate(agg.w, agg.g)})`;
                const stats = `KDA ${fmtN(agg.kda)}${agg.csm != null ? ` · CS/m ${agg.csm}` : ""}${agg.dpm != null ? ` · DPM ${fmtNum(agg.dpm)}` : ""}${agg.tl?.gd15 != null ? ` · GD@15 ${signed(agg.tl.gd15)}` : ""}`;
                const champs = agg.champs
                  .slice(0, 5)
                  .map((c) => `• ${champName(c.c)}: ${c.w}-${c.g - c.w} (${winRate(c.w, c.g)}, KDA ${fmtN(c.kda)})`);
                return [head, stats, ...champs].join("\n");
              }}
            />
            </>
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
              to={{ kind: "player", slug, tab: "matches", ...(pQuery ? { query: pQuery } : {}) }}
            />
            {rated && (
              <Stat
                label={tl("Rating")}
                value={fmtRating(rated.avg)}
                sub={tl("best {r} · 6 is an average game", { r: fmtRating(rated.best) })}
                to={leaderTo("rating")}
              />
            )}
            <Stat
              label={tl("KDA")}
              value={fmtN(agg.kda)}
              sub={`${fmtDec(agg.k / Math.max(agg.g, 1))} / ${fmtDec(agg.d / Math.max(agg.g, 1))} / ${fmtDec(agg.a / Math.max(agg.g, 1))}`}
              to={leaderTo("kda")}
            />
            <Stat
              label="KP"
              value={pct(agg.kp)}
              sub={tl("Kill participation")}
              to={leaderTo("kp")}
            />
            <Stat
              label={tl("CS / min")}
              value={dash(agg.csm)}
              sub={
                agg.gpm != null
                  ? tl("{n} gold / min", { n: fmtNum(agg.gpm) })
                  : undefined
              }
              to={leaderTo("csm")}
            />
            <Stat
              label={tl("Damage / min")}
              value={agg.dpm != null ? fmtNum(agg.dpm) : "–"}
              sub={
                agg.dmgShare != null
                  ? tl("{p} of team damage", { p: pct(agg.dmgShare) })
                  : undefined
              }
              to={leaderTo("dpm")}
            />
            <Stat
              label={tl("Gold%")}
              value={pct(agg.goldShare)}
              sub={tl("Share of the team's gold")}
              to={leaderTo("golds")}
            />
            <Stat
              label={tl("VS / min")}
              value={dash(agg.vsm)}
              sub={
                agg.visShare != null
                  ? tl("{p} of team vision", { p: pct(agg.visShare) })
                  : undefined
              }
              to={leaderTo("vsm")}
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
                leaderTo={leaderTo}
                matchesTo={{ kind: "player", slug, tab: "matches", ...(pQuery ? { query: pQuery } : {}) }}
              />
            )}
          </div>
          {agg.champs.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Sub>{tl("Champions")}</Sub>
                {(agg.champs.length >= 10 || Boolean(champSearch.trim())) && (
                  <input
                    type="search"
                    value={champSearch}
                    onChange={(e) => setChampSearch(e.target.value)}
                    placeholder={tl("Search champions…")}
                    aria-label={tl("Search champions…")}
                    className="bg-rw-bg border border-rw-border rounded-md px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-36"
                  />
                )}
              </div>
              <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
                {filteredChamps[0] && (
                  <HubLink
                    to={{
                      kind: "counters",
                      query: `champ=${encodeURIComponent(resolveChampSlug(filteredChamps[0].c))}${filteredChamps[1] ? `&vs=${encodeURIComponent(resolveChampSlug(filteredChamps[1].c))}` : ""}${agg.roles[0] ? `&role=${encodeURIComponent(agg.roles[0])}` : ""}`,
                    }}
                    className="text-rw-accent hover:underline font-semibold"
                  >
                    {tl("Counters")} →
                  </HubLink>
                )}
                <HubLink
                  to={{
                    kind: "items",
                    query: `player=${encodeURIComponent(slug)}${filteredChamps[0] ? `&champ=${encodeURIComponent(resolveChampSlug(filteredChamps[0].c))}` : ""}${/^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : period.startsWith("e:") ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}` : ""}`,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: `player=${encodeURIComponent(slug)}${filteredChamps.length === 1 ? `&champ=${encodeURIComponent(resolveChampSlug(filteredChamps[0].c))}` : ""}${/^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : period.startsWith("e:") ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}` : period.startsWith("p:") ? `&patch=${encodeURIComponent(period.slice(2))}` : ""}`,
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    ...(agg.roles[0] || filteredChamps[0] || /^y\d{4}$/.test(period) || period.startsWith("p:") || period.startsWith("e:")
                      ? {
                          query: new URLSearchParams({
                            ...(agg.roles[0] ? { role: agg.roles[0] } : {}),
                            ...(filteredChamps[0] ? { q: resolveChampSlug(filteredChamps[0].c) } : {}),
                            ...(/^y\d{4}$/.test(period)
                              ? { key: period }
                              : period.startsWith("p:")
                                ? { key: `p${period.slice(2)}` }
                                : period.startsWith("e:")
                                  ? { event: resolveEventSlug(period.slice(2)) }
                                  : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      stat: "kda",
                      q: slug,
                      ...(agg.roles[0] ? { role: agg.roles[0] } : {}),
                      ...(filteredChamps[0] ? { champ: resolveChampSlug(filteredChamps[0].c) } : {}),
                      ...(/^y\d{4}$/.test(period) ? { year: period.slice(1) } : period.startsWith("e:") ? { event: resolveEventSlug(period.slice(2)) } : {}),
                    }).toString(),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "player", a: slug, ...(period !== "all" ? { period } : {}) }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                {who?.club && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: teamSlug(who.club),
                        ...(period !== "all" ? { period } : {}),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          teams: teamSlug(who.club),
                          ...(period !== "all" ? { p: period } : {}),
                          ...(agg.roles[0] ? { role: agg.roles[0] } : {}),
                          ...(filteredChamps[0] ? { champ: resolveChampSlug(filteredChamps[0].c) } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{
                    kind: "rankings",
                    ...(who?.club ? { query: `q=${encodeURIComponent(teamSlug(who.club))}` } : {}),
                  }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <SectionCard
                  section={who ? `${who.name} · ${tl("Champions")}` : tl("Champions")}
                  sub={periodText}
                  name={`${slug}-champions-${period}`}
                  rows={() =>
                    filteredChamps.slice(0, 10).map((c, idx) => ({
                      rank: idx + 1,
                      champ: c.c,
                      team: who?.club || undefined,
                      label: champName(c.c),
                      sub: `${c.g}G · KDA ${fmtN(c.kda)}${c.gd15 != null ? ` · GD@15 ${signed(c.gd15)}` : ""}`,
                      value: winRate(c.w, c.g),
                      win: c.g > 0 ? c.w / c.g >= 0.5 : undefined,
                    }))
                  }
                />
              </span>
            </div>
          )}
          <SortTable
            rows={filteredChamps}
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
            period={period}
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

export const TeamPeriodStats: React.FC<{ slug: string; has2y?: boolean; who?: TeamWho; preferAll?: boolean; query?: string }> = ({
  slug,
  has2y,
  who,
  preferAll,
  query,
}) => {
  const { loading, rows } = useGameLog(slug, has2y, loadTeamGames2y, loadTeamGames);
  if (loading) return <Loading />;
  if (!rows || !rows.length) return null;
  return <TeamPeriodView slug={slug} rows={rows} who={who} preferAll={preferAll} query={query} />;
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
        {slug ? (
          <HubLink
            to={{ kind: "draft", query: `teams=${encodeURIComponent(slug)}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}` }}
            className="hover:text-rw-accent hover:underline"
          >
            {title}
          </HubLink>
        ) : (
          title
        )}
      </div>
      <ul className="text-xs space-y-1">
        {list.map(([c, n]) => (
          <li key={c} className="flex items-center justify-between gap-2 min-w-0">
            <ChampLink name={c} size={16} query={period && period !== "all" ? `p=${encodeURIComponent(period)}` : undefined} />
            <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums">
              <span className="w-10 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block">
                <span
                  className={`block h-full rounded-full ${tone === "banVs" ? "bg-rw-red/70" : "bg-rw-accent/65"}`}
                  style={{ width: `${Math.max(8, Math.round((n / maxN) * 100))}%` }}
                />
              </span>
              {slug ? (
                <HubLink
                  to={{ kind: "team", slug, tab: "champions", query: `champ=${encodeURIComponent(resolveChampSlug(c))}${period && period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}` }}
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

const TeamPeriodView: React.FC<{ slug: string; rows: TeamGameRow[]; who?: TeamWho; preferAll?: boolean; query?: string }> = ({
  slug,
  rows,
  who,
  preferAll,
  query,
}) => {
  useDDragon();
  const refs = useMemo(() => rows.map(teamRowRef), [rows]);
  const baseOptions = useMemo(() => periodOptions(refs), [refs]);
  const [period, setPeriod] = useState<PeriodKey>(() => defaultPeriod(baseOptions, preferAll, query));
  useEffect(() => {
    if (!query) return;
    setPeriod(defaultPeriod(baseOptions, preferAll, query));
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => withRequestedPeriod(baseOptions, period, refs), [baseOptions, period, refs]);
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
    return !o || o.key === "all"
      ? tl("All time")
      : o.group === "basic"
        ? tl("Last {n} games", { n: o.label })
        : o.group === "patch"
          ? `${tl("Patch")} ${o.label}`
          : o.label;
  })();
  const teamFinderTo: import("../../hub/route").HubRoute = {
    kind: "finder",
    query: `team=${encodeURIComponent(slug)}${
      /^y\d{4}$/.test(period)
        ? `&year=${encodeURIComponent(period.slice(1))}`
        : period.startsWith("e:")
          ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}`
          : period.startsWith("p:")
            ? `&patch=${encodeURIComponent(period.slice(2))}`
            : ""
    }`,
  };
  return (
    <Section
      title={tl("Stats for")}
      right={
        <>
          <PeriodPicker options={options} value={period} onChange={setPeriod} />
          <OnlyPicker value={only} onChange={setOnly} sides />
          {!hidden && (
            <>
              <HubLink
                to={{ kind: "prep", a: slug, ...(period !== "all" ? { period } : {}) }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    teams: slug,
                    ...(period !== "all" ? { p: period } : {}),
                    ...(t.picks[0] ? { champ: resolveChampSlug(t.picks[0][0]) } : {}),
                  }).toString(),
                }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "compare", mode: "team", a: slug, ...(period !== "all" ? { period } : {}) }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
              >
                {tl("Compare")} →
              </HubLink>
              <HubLink to={teamFinderTo} className="text-[11px] font-semibold text-rw-accent hover:underline">
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "champions",
                  ...(t.picks[0] || /^y\d{4}$/.test(period) || period.startsWith("p:") || period.startsWith("e:")
                    ? {
                        query: new URLSearchParams({
                          ...(t.picks[0] ? { q: resolveChampSlug(t.picks[0][0]) } : {}),
                          ...(/^y\d{4}$/.test(period)
                            ? { year: period.slice(1) }
                            : period.startsWith("p:")
                              ? { patch: period.slice(2) }
                              : period.startsWith("e:")
                                ? { event: resolveEventSlug(period.slice(2)) }
                                : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Champions")} →
              </HubLink>
              {t.picks[0] && (
                <>
                  <HubLink
                    to={{
                      kind: "counters",
                      query: `champ=${encodeURIComponent(resolveChampSlug(t.picks[0][0]))}${t.picks[1] ? `&vs=${encodeURIComponent(resolveChampSlug(t.picks[1][0]))}` : ""}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Counters")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "items",
                      query: `champ=${encodeURIComponent(resolveChampSlug(t.picks[0][0]))}${/^y\d{4}$/.test(period) ? `&year=${encodeURIComponent(period.slice(1))}` : period.startsWith("e:") ? `&event=${encodeURIComponent(resolveEventSlug(period.slice(2)))}` : ""}`,
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                </>
              )}
              <HubLink
                to={{
                  kind: "tiers",
                  ...(t.picks[0] || /^y\d{4}$/.test(period) || period.startsWith("p:") || period.startsWith("e:")
                    ? {
                        query: new URLSearchParams({
                          ...(t.picks[0] ? { q: resolveChampSlug(t.picks[0][0]) } : {}),
                          ...(/^y\d{4}$/.test(period)
                            ? { key: period }
                            : period.startsWith("p:")
                              ? { key: `p${period.slice(2)}` }
                              : period.startsWith("e:")
                                ? { event: resolveEventSlug(period.slice(2)) }
                                : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{ kind: "rankings", query: `q=${encodeURIComponent(slug)}` }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    q: slug,
                    ...(t.picks[0] ? { champ: resolveChampSlug(t.picks[0][0]) } : {}),
                    ...(/^y\d{4}$/.test(period)
                      ? { year: period.slice(1) }
                      : period.startsWith("e:")
                        ? { event: resolveEventSlug(period.slice(2)) }
                        : {}),
                  }).toString(),
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <CopyPeriodTextPost
              url={hubShareUrl({
                kind: "team",
                slug,
                tab: "stats",
                ...(period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}),
              })}
              buildText={() => {
                const head = `${who?.name || slug} — ${tl("Stats for")} ${periodText} (${t.w}-${t.g - t.w}, ${winRate(t.w, t.g)})`;
                const stats = `Blue ${winRate(t.blue[1], t.blue[0])} / Red ${winRate(t.red[1], t.red[0])}${t.tl?.gd15 != null ? ` · GD@15 ${signed(t.tl.gd15)}` : ""}${t.dragShare != null ? ` · DRA% ${pct(t.dragShare)}` : ""}${t.baronShare != null ? ` · Baron% ${pct(t.baronShare)}` : ""}`;
                const picks = t.picks
                  .slice(0, 5)
                  .map(([c, n, w]) => `• ${champName(c)}: ${n}G (${winRate(w, n)})`);
                return [head, stats, ...picks].join("\n");
              }}
            />
            </>
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
              to={{ kind: "team", slug, tab: "matches", ...(period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
            />
            <Stat
              label={tl("Blue / red side")}
              value={`${winRate(t.blue[1], t.blue[0])} / ${winRate(t.red[1], t.red[0])}`}
              sub={tl("{b} blue games · {r} red", {
                b: t.blue[0],
                r: t.red[0],
              })}
              to={teamFinderTo}
            />
            <Stat
              label={tl("Avg game")}
              value={t.min != null ? tl("{n} min", { n: fmtN(t.min) }) : "–"}
              sub={
                t.minWin != null && t.minLoss != null
                  ? tl("Wins {a} · losses {b} min", { a: fmtDec(t.minWin), b: fmtDec(t.minLoss) })
                  : undefined
              }
              to={teamFinderTo}
            />
            <Stat
              label={tl("Kills / game")}
              value={dash(t.kills)}
              sub={
                t.deaths != null ? tl("{n} deaths", { n: t.deaths }) : undefined
              }
              to={teamFinderTo}
            />
            <Stat
              label={tl("Gold diff / game")}
              value={signed(t.gd)}
              sub={
                t.gdm != null
                  ? tl("{n} per minute", { n: signed(t.gdm) })
                  : undefined
              }
              to={teamFinderTo}
            />
            <Stat
              label={tl("GPM")}
              value={t.gpm != null ? fmtNum(t.gpm) : "–"}
              sub={tl("Team gold per minute")}
              to={teamFinderTo}
            />
            <Stat
              label={tl("DRA%")}
              value={pct(t.dragShare)}
              sub={tl("Share of all dragons taken in their games")}
              to={teamFinderTo}
            />
            <Stat
              label={tl("Baron%")}
              value={pct(t.baronShare)}
              sub={tl("Share of all barons taken in their games")}
              to={teamFinderTo}
            />
            <Stat
              label={tl("Towers")}
              value={dash(t.towers)}
              sub={
                t.towersLost != null
                  ? tl("{n} lost", { n: t.towersLost })
                  : undefined
              }
              to={teamFinderTo}
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
              <TeamEarly t={t} to={teamFinderTo} />
              <Playstyle t={t} to={teamFinderTo} />
              <WinWhen rows={sel} teamName={who?.name} teamSlug={slug} period={period} periodLabel={periodText} />
            </div>
            <div className="space-y-4 min-w-0">
              <div className="grid sm:grid-cols-3 gap-4">
                {t.picks.length > 0 && (() => {
                  const maxPickN = Math.max(1, ...t.picks.map(([, n]) => n));
                  return (
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-rw-muted mb-1">
                        <HubLink
                          to={{ kind: "team", slug, tab: "champions", ...(period !== "all" ? { query: `p=${encodeURIComponent(period)}` } : {}) }}
                          className="hover:text-rw-accent hover:underline"
                        >
                          {tl("Most picked champions")}
                        </HubLink>
                      </div>
                      <ul className="text-xs space-y-1">
                        {t.picks.map(([c, n, w]) => {
                          const good = n > 0 && w / n >= 0.5;
                          const pickQ = `champ=${encodeURIComponent(resolveChampSlug(c))}${period !== "all" ? `&p=${encodeURIComponent(period)}` : ""}`;
                          return (
                            <li
                              key={c}
                              className="flex items-center justify-between gap-2 min-w-0"
                            >
                              <ChampLink name={c} size={16} query={period !== "all" ? `p=${encodeURIComponent(period)}` : undefined} />
                              <span className="inline-flex items-center gap-1.5 text-rw-sub tabular-nums shrink-0">
                                <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block">
                                  <span
                                    className="block h-full bg-rw-teal/75 rounded-full"
                                    style={{ width: `${Math.max(8, Math.round((n / maxPickN) * 100))}%` }}
                                  />
                                </span>
                                <HubLink
                                  to={{ kind: "team", slug, tab: "champions", query: pickQ }}
                                  className="hover:text-rw-accent hover:underline"
                                >
                                  {n}
                                </HubLink>
                                <span className="text-rw-muted">·</span>
                                <HubLink
                                  to={{ kind: "team", slug, tab: "champions", query: pickQ }}
                                  className={`w-9 text-right hover:underline ${good ? "text-rw-teal font-semibold" : "text-rw-red"}`}
                                >
                                  {winRate(w, n)}
                                </HubLink>
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
              <DraftTendencies rows={sel} teamName={who?.name} teamSlug={slug} period={period} periodLabel={periodText} />
              <TrendChart games={sel.map((r) => ({ date: r[0], won: r[7] }))} />
            </div>
          </div>
          <TeamPeriodOpponents
            teamSlug={slug}
            teamName={who?.name || slug}
            rows={sel}
            cardSub={periodText}
            period={period}
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
