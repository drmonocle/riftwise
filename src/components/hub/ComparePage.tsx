/**
 * Compare two teams or two players over any period (all time, last N games, a year, a tournament), side by side,
 * with the better number highlighted and their head-to-head. The choice lives in the address
 * (/stats/compare?teams=t1,gen-g&p=y2026) so it can be shared.
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, tc, tn, roleName, fmtDec, locale, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { HubHit, HubIndex, loadHubIndex, loadHubPlayer, loadHubTeam, loadPlayerGames, loadTeamGames, searchHub } from "../../hub/data";
import type { HubPlayer, HubTeam, PlayerGameRow, TeamGameRow } from "../../hub/types";
import { CompareRoute, navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import {
  PeriodKey,
  PeriodOption,
  type PlayerAgg,
  type TeamAgg,
  inPeriod,
  periodOptions,
  playerAgg,
  playerHeadToHead,
  playerMeetings,
  playerRowRef,
  teamAgg,
  teamHeadToHead,
  teamRowRef,
} from "../../hub/period";
import { HeadToHeadSeries } from "./Archives";
import { PeriodPicker } from "./PeriodStats";
import { DraftTendencies, draftTendencies } from "./DraftTendencies";
import { BroadcastCardButton, draftCard, playerCardData, teamCardData } from "./BroadcastCard";
import { CaptureContext, card, ChampIcon, ChampLink, EventLink, fmtDate, fmtNum, HubLink, isFresh, Loading, OeCredit, PlayerPhoto, RevealButton, Section, td, TeamLogo, useHidden, usePageTitle } from "./ui";
import { STable } from "../STable";

type Mode = "team" | "player";

/** Team / player picker: type, then Enter (or a click) picks; arrow keys move through the list. */
export const ComparePick: React.FC<{ kind: Mode; onPick: (slug: string) => void; autoFocus?: boolean }> = ({ kind, onPick, autoFocus }) => {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<HubIndex | null>(null);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    loadHubIndex()
      .then(setIndex)
      .catch(() => {});
  }, []);
  const hits: HubHit[] = index && q.trim() ? searchHub(index, q, 6)[kind] : [];
  const pick = (h: HubHit | undefined) => {
    if (!h) return;
    onPick(h.slug);
    setQ("");
    setSel(0);
  };
  const label = kind === "team" ? tl("Pick a team…") : tl("Pick a player…");
  return (
    <div className="space-y-1">
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            pick(hits[sel] || hits[0]);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(s + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(s - 1, 0));
          }
        }}
        placeholder={label}
        aria-label={label}
        className="w-full bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-xs text-rw-text placeholder-rw-muted"
      />
      {hits.map((h, i) => (
        <button
          key={h.slug}
          type="button"
          onClick={() => pick(h)}
          onMouseEnter={() => setSel(i)}
          className={`w-full flex justify-between gap-2 px-2 py-1 rounded text-left text-xs min-w-0 ${
            i === sel ? "bg-rw-raised" : "bg-rw-bg hover:bg-rw-raised"
          }`}
        >
          <span className="text-rw-text font-semibold truncate">{h.name}</span>
          <span className="text-rw-muted truncate shrink-0 max-w-[50%]">{h.sub}</span>
        </button>
      ))}
    </div>
  );
};

/** One compared number; "better" says which side to highlight (higher or lower is better). */
const Row: React.FC<{
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  va?: number | null;
  vb?: number | null;
  better?: "high" | "low";
}> = ({ label, a, b, va, vb, better = "high" }) => {
  const win = va != null && vb != null && va !== vb ? ((va > vb) === (better === "high") ? "a" : "b") : null;
  const cls = (side: "a" | "b") => (win === side ? "text-rw-teal" : "text-rw-text");
  // a bar from each number toward the outside, as long as its share of the pair (plain counts and rates only)
  const bars = va != null && vb != null && va >= 0 && vb >= 0 && va + vb > 0;
  const bar = (v: number, side: "a" | "b") => (
    <span className={`flex-1 flex ${side === "a" ? "justify-end" : "justify-start"}`} aria-hidden="true">
      <span
        className={`h-1.5 ${side === "a" ? "rounded-l" : "rounded-r"} ${win === side ? "bg-rw-teal/70" : "bg-rw-line"}`}
        style={{ width: `${(v / Math.max(va as number, vb as number)) * 100}%` }}
      />
    </span>
  );
  return (
    <tr className="border-t border-rw-border">
      <td className={`${td} font-semibold w-2/5 tabular-nums ${cls("a")}`}>
        <span className="flex items-center justify-end gap-3">
          {bars && bar(va as number, "a")}
          <span className="text-right">{a}</span>
        </span>
      </td>
      {/* the label may wrap (long ones like "Win rate when behind at 15" would push a phone screen sideways) */}
      <td className="py-1.5 px-1 text-center text-rw-muted text-[11px] leading-tight">{label}</td>
      <td className={`${td} font-semibold w-2/5 tabular-nums ${cls("b")}`}>
        <span className="flex items-center gap-3">
          <span>{b}</span>
          {bars && bar(vb as number, "b")}
        </span>
      </td>
    </tr>
  );
};

/** a share in percent, one decimal like gol.gg ("61.0%") */
const pct = (v: number | null | undefined) => (v == null ? "–" : `${fmtDec(v)}%`);
const d = (v: number | null | undefined, suffix = "") => (v == null ? "–" : `${fmtN(v)}${suffix}`);
const sgn = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`);
const perGame = (n: number, g: number) => (g ? Number((n / g).toFixed(1)) : null);

/** Choices both logs offer: all, last N, years and tournaments of either, newest first. */
export function bothOptions(a: { date: string; e: string; en: string }[], b: { date: string; e: string; en: string }[]): PeriodOption[] {
  const merged = [...a, ...b].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const opts = periodOptions(merged, 80);
  const n = Math.min(a.length, b.length);
  return opts.filter((o) => !/^last(\d+)$/.test(o.key) || Number(o.key.slice(4)) < n);
}

export const ComparePage: React.FC<{ route: CompareRoute }> = ({ route }) => {
  usePageTitle(tl("Compare"));
  useDDragon();
  const mode: Mode = route.mode || "team";
  const a = route.a || null;
  const b = route.b || null;
  const set = (patch: Partial<CompareRoute>) =>
    navigateHub({ kind: "compare", mode, a: a || undefined, b: b || undefined, period: route.period, more: route.more, ...patch }, { replace: true });
  // three or more: a table with a column each
  if (route.more && route.more.length && a && b) return <MultiCompare mode={mode} slugs={[a, b, ...route.more]} period={route.period} set={set} />;

  // what the loaded files are for: switching players -> teams (or new names) mustn't read the old files as the new
  // kind for a moment (player rows as team rows broke the page)
  const forKey = `${mode}|${a}|${b}`;
  const [info, setInfo] = useState<{ key: string; a: HubTeam | HubPlayer | null; b: HubTeam | HubPlayer | null }>({ key: "", a: null, b: null });
  const [logs, setLogs] = useState<{ key: string; a: (TeamGameRow | PlayerGameRow)[] | null; b: (TeamGameRow | PlayerGameRow)[] | null }>({ key: "", a: null, b: null });
  useEffect(() => {
    let alive = true;
    const loadInfo = (s: string | null) => (s ? (mode === "team" ? loadHubTeam(s) : loadHubPlayer(s)).catch(() => null) : Promise.resolve(null));
    const loadLog = (s: string | null) =>
      s ? (mode === "team" ? loadTeamGames(s) : loadPlayerGames(s)).catch(() => [] as (TeamGameRow | PlayerGameRow)[]) : Promise.resolve(null);
    Promise.all([loadInfo(a), loadInfo(b), loadLog(a), loadLog(b)]).then(([ia, ib, la, lb]) => {
      if (!alive) return;
      setInfo({ key: forKey, a: ia, b: ib });
      setLogs({ key: forKey, a: la, b: lb });
    });
    return () => {
      alive = false;
    };
  }, [mode, a, b]);

  const ready = !!(a && b && info.key === forKey && logs.key === forKey && info.a && info.b && logs.a && logs.b);
  const refs = (rows: (TeamGameRow | PlayerGameRow)[]) =>
    mode === "team" ? (rows as TeamGameRow[]).map(teamRowRef) : (rows as PlayerGameRow[]).map(playerRowRef);
  const options = useMemo(() => (ready ? bothOptions(refs(logs.a!), refs(logs.b!)) : []), [ready, logs]); // eslint-disable-line react-hooks/exhaustive-deps
  const period: PeriodKey = route.period && options.some((o) => o.key === route.period) ? route.period : "all";

  const selA = useMemo(
    () => (ready ? (mode === "team" ? inPeriod(logs.a as TeamGameRow[], period, teamRowRef) : inPeriod(logs.a as PlayerGameRow[], period, playerRowRef)) : []),
    [ready, logs.a, period, mode],
  );
  const selB = useMemo(
    () => (ready ? (mode === "team" ? inPeriod(logs.b as TeamGameRow[], period, teamRowRef) : inPeriod(logs.b as PlayerGameRow[], period, playerRowRef)) : []),
    [ready, logs.b, period, mode],
  );
  const opt = options.find((o) => o.key === period);
  const periodLabel = !opt || opt.key === "all" ? tl("All time") : opt.group === "basic" ? tl("Last {n} games", { n: opt.label }) : opt.label;
  const freshDate = [...selA, ...selB].map((r) => r[0]).find((x) => isFresh(x));
  const [hidden, reveal] = useHidden(`compare:${mode}:${a}:${b}:${period}`, freshDate);

  return (
    <CaptureContext.Provider value={ready ? `${info.a!.name} vs ${info.b!.name} · ${periodLabel}` : null}>
    <div className="rw-page">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["team", "player"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => navigateHub({ kind: "compare", mode: k }, { replace: true })}
            className={`px-2.5 py-1.5 rounded-lg border ${
              mode === k ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
            }`}
          >
            {k === "team" ? tl("Teams") : tl("Players")}
          </button>
        ))}
        {ready && mode === "team" && (
          <HubLink to={{ kind: "prep", a: a!, b: b!, period: route.period }} className="text-rw-teal hover:underline">
            {tl("Match prep")}
          </HubLink>
        )}
        {ready && (
          <span className="flex items-center gap-1.5 ml-auto min-w-0">
            <span className="text-rw-muted">{tl("Stats for")}</span>
            <PeriodPicker options={options} value={period} onChange={(p) => set({ period: p })} />
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            { s: a, i: info.key === forKey ? info.a : null, key: "a" as const },
            { s: b, i: info.key === forKey ? info.b : null, key: "b" as const },
          ]
        ).map((side) => (
          <div key={side.key} className={`${card} space-y-1 min-w-0`}>
            {side.s && side.i && (
              <div className="text-sm font-bold truncate">
                <HubLink to={{ kind: mode, slug: side.s }}>{side.i.name}</HubLink>
              </div>
            )}
            {side.s ? (
              <button type="button" onClick={() => set({ [side.key]: undefined })} className="text-[11px] text-rw-teal hover:underline">
                {tl("Change")}
              </button>
            ) : (
              <ComparePick kind={mode} autoFocus={side.key === "a" || !!a} onPick={(slug) => set({ [side.key]: slug })} />
            )}
          </div>
        ))}
      </div>
      {ready && (
        <details className="text-xs">
          <summary className="cursor-pointer text-rw-teal hover:underline">{tl("Compare a third one too")}</summary>
          <div className={`${card} mt-2 max-w-md`}>
            <ComparePick kind={mode} autoFocus onPick={(slug) => set({ more: [slug] })} />
          </div>
        </details>
      )}
      {ready &&
        (hidden ? (
          <div className={`${card} py-4 text-center`}>
            <RevealButton onReveal={reveal} />
          </div>
        ) : mode === "team" ? (
          <TeamRows x={info.a as HubTeam} y={info.b as HubTeam} ra={selA as TeamGameRow[]} rb={selB as TeamGameRow[]} bSlug={b!} career={period === "all"} periodLabel={periodLabel} />
        ) : (
          <PlayerRows x={info.a as HubPlayer} y={info.b as HubPlayer} ra={selA as PlayerGameRow[]} rb={selB as PlayerGameRow[]} career={period === "all"} periodLabel={periodLabel} />
        ))}
      {mode === "team" && ready && <HeadToHeadSeries a={a!} b={b!} aName={info.a!.name} bName={info.b!.name} />}
      {mode === "player" && ready && (
        <PlayerHeadToHead a={logs.a as PlayerGameRow[]} b={logs.b as PlayerGameRow[]} aName={info.a!.name} bName={info.b!.name} spoilerKey={`h2hp:${a}:${b}`} />
      )}
    </div>
    </CaptureContext.Provider>
  );
};

export const TeamRows: React.FC<{
  x: HubTeam;
  y: HubTeam;
  ra: TeamGameRow[];
  rb: TeamGameRow[];
  bSlug: string;
  career: boolean;
  periodLabel: string;
  /** win chance of x and y in percent (Match prep), for the 16:9 card */
  chance?: [number, number] | null;
}> = ({ x, y, ra, rb, bSlug, career, periodLabel, chance }) => {
  const A = useMemo(() => teamAgg(ra), [ra]);
  const B = useMemo(() => teamAgg(rb), [rb]);
  const h2h = useMemo(() => teamHeadToHead(ra, bSlug), [ra, bSlug]);
  const drafts = useMemo(() => ({ A: draftTendencies(ra), B: draftTendencies(rb) }), [ra, rb]);
  const wr = (w: number, g: number) => (g ? w / g : null);
  return (
    <>
      <Section
        title={`${x.name} vs ${y.name}`}
        right={
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-rw-sub">{periodLabel}</span>
            <BroadcastCardButton data={() => teamCardData(x, y, A, B, periodLabel, chance)} name={`${x.name}-vs-${y.name}`} />
            {drafts.A.games >= 3 && drafts.B.games >= 3 && (
              <BroadcastCardButton
                data={() => draftCard({ aName: x.name, bName: y.name, A: drafts.A, B: drafts.B, period: periodLabel })}
                name={`${x.name}-vs-${y.name}-drafts`}
                label={tl("Draft card")}
              />
            )}
          </span>
        }
        share={`${x.name}-vs-${y.name}-${periodLabel}`}
      >
        <div className="flex items-center justify-between gap-3 text-sm font-bold">
          <span className="flex items-center gap-2 min-w-0">
            <TeamLogo name={x.name} sizeClass="w-9 h-9 lg:w-12 lg:h-12 2xl:w-16 2xl:h-16" />
            <span className="truncate">{x.name}</span>
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate text-right">{y.name}</span>
            <TeamLogo name={y.name} sizeClass="w-9 h-9 lg:w-12 lg:h-12 2xl:w-16 2xl:h-16" />
          </span>
        </div>
        <table className="w-full text-xs">
          <tbody>
            <Row label={career ? tl("Head to head (games)") : tl("Head to head this period (games)")} a={h2h.g ? h2h.w : "–"} b={h2h.g ? h2h.g - h2h.w : "–"} va={h2h.g ? h2h.w : null} vb={h2h.g ? h2h.g - h2h.w : null} />
            <Row label={tl("Games won")} a={`${A.w}-${A.g - A.w}`} b={`${B.w}-${B.g - B.w}`} />
            <Row label={tl("Win rate")} a={winRate(A.w, A.g)} b={winRate(B.w, B.g)} va={wr(A.w, A.g)} vb={wr(B.w, B.g)} />
            <Row label={tl("Blue side wins")} a={`${winRate(A.blue[1], A.blue[0])} (${A.blue[0]})`} b={`${winRate(B.blue[1], B.blue[0])} (${B.blue[0]})`} va={wr(A.blue[1], A.blue[0])} vb={wr(B.blue[1], B.blue[0])} />
            <Row label={tl("Red side wins")} a={`${winRate(A.red[1], A.red[0])} (${A.red[0]})`} b={`${winRate(B.red[1], B.red[0])} (${B.red[0]})`} va={wr(A.red[1], A.red[0])} vb={wr(B.red[1], B.red[0])} />
            <Row label={tl("Avg game (min)")} a={d(A.min)} b={d(B.min)} />
            <Row label={tl("Kills / game")} a={d(A.kills)} b={d(B.kills)} va={A.kills} vb={B.kills} />
            <Row label={tl("Deaths / game")} a={d(A.deaths)} b={d(B.deaths)} va={A.deaths} vb={B.deaths} better="low" />
            <Row label={tl("Gold diff / game")} a={sgn(A.gd)} b={sgn(B.gd)} va={A.gd} vb={B.gd} />
            <Row label={tl("GD/m")} a={sgn(A.gdm)} b={sgn(B.gdm)} va={A.gdm} vb={B.gdm} />
            <Row label={tl("GPM")} a={A.gpm != null ? fmtNum(A.gpm) : "–"} b={B.gpm != null ? fmtNum(B.gpm) : "–"} va={A.gpm} vb={B.gpm} />
            <Row label={tl("DRA%")} a={pct(A.dragShare)} b={pct(B.dragShare)} va={A.dragShare} vb={B.dragShare} />
            <Row label={tl("Baron%")} a={pct(A.baronShare)} b={pct(B.baronShare)} va={A.baronShare} vb={B.baronShare} />
            <Row label={tl("Towers")} a={d(A.towers)} b={d(B.towers)} va={A.towers} vb={B.towers} />
            <Row label={tl("Towers lost per game")} a={d(A.towersLost)} b={d(B.towersLost)} va={A.towersLost} vb={B.towersLost} better="low" />
            <Row label="CKPM" a={d(A.ckpm)} b={d(B.ckpm)} />
            {(A.tl || B.tl) && (
              <>
                <Row label="GD@10" a={sgn(A.tl?.gd10 ?? null)} b={sgn(B.tl?.gd10 ?? null)} va={A.tl?.gd10 ?? null} vb={B.tl?.gd10 ?? null} />
                <Row label="GD@15" a={sgn(A.tl?.gd15 ?? null)} b={sgn(B.tl?.gd15 ?? null)} va={A.tl?.gd15 ?? null} vb={B.tl?.gd15 ?? null} />
                <Row label={tl("Ahead at 15")} a={pct(A.tl?.lead15 ?? null)} b={pct(B.tl?.lead15 ?? null)} va={A.tl?.lead15 ?? null} vb={B.tl?.lead15 ?? null} />
                <Row
                  label={tl("Win rate when ahead at 15")}
                  a={A.tl ? winRate(A.tl.ahead[1], A.tl.ahead[0]) : "–"}
                  b={B.tl ? winRate(B.tl.ahead[1], B.tl.ahead[0]) : "–"}
                  va={A.tl ? wr(A.tl.ahead[1], A.tl.ahead[0]) : null}
                  vb={B.tl ? wr(B.tl.ahead[1], B.tl.ahead[0]) : null}
                />
                <Row
                  label={tl("Win rate when behind at 15")}
                  a={A.tl ? winRate(A.tl.behind[1], A.tl.behind[0]) : "–"}
                  b={B.tl ? winRate(B.tl.behind[1], B.tl.behind[0]) : "–"}
                  va={A.tl ? wr(A.tl.behind[1], A.tl.behind[0]) : null}
                  vb={B.tl ? wr(B.tl.behind[1], B.tl.behind[0]) : null}
                />
                <Row label={tl("First blood")} a={pct(A.tl?.fb ?? null)} b={pct(B.tl?.fb ?? null)} va={A.tl?.fb ?? null} vb={B.tl?.fb ?? null} />
                <Row label={tl("First tower")} a={pct(A.tl?.ft ?? null)} b={pct(B.tl?.ft ?? null)} va={A.tl?.ft ?? null} vb={B.tl?.ft ?? null} />
                <Row label={tl("First dragon")} a={pct(A.tl?.fd ?? null)} b={pct(B.tl?.fd ?? null)} va={A.tl?.fd ?? null} vb={B.tl?.fd ?? null} />
                <Row label={tl("Turret plates")} a={d(A.tl?.plates ?? null)} b={d(B.tl?.plates ?? null)} va={A.tl?.plates ?? null} vb={B.tl?.plates ?? null} />
                {(A.tl?.grubs != null || B.tl?.grubs != null) && (
                  <Row label={tl("Void grubs")} a={d(A.tl?.grubs ?? null)} b={d(B.tl?.grubs ?? null)} va={A.tl?.grubs ?? null} vb={B.tl?.grubs ?? null} />
                )}
                <Row label={tl("VS / min")} a={d(A.tl?.vspm ?? null)} b={d(B.tl?.vspm ?? null)} va={A.tl?.vspm ?? null} vb={B.tl?.vspm ?? null} />
              </>
            )}
            {career && (
              <>
                <Row label={tl("Titles")} a={x.titles.length} b={y.titles.length} va={x.titles.length} vb={y.titles.length} />
                <Row
                  label={tl("Worlds")}
                  a={x.titles.filter((t) => t.kind === "Worlds").length}
                  b={y.titles.filter((t) => t.kind === "Worlds").length}
                />
              </>
            )}
          </tbody>
        </table>
        {(A.tl || B.tl) && <OeCredit />}
      </Section>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { n: x.name, t: A, rows: ra },
          { n: y.name, t: B, rows: rb },
        ].map((s) => (
          <Section key={s.n} title={tl("Most picked: {team}", { team: s.n })} share={`${s.n}-draft-${periodLabel}`}>
            <ul className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {s.t.picks.slice(0, 10).map(([c, n, w]) => (
                <li key={c} className="flex justify-between gap-2 min-w-0">
                  <ChampLink name={c} size={16} />
                  <span
                    className="text-rw-muted shrink-0 tabular-nums"
                    title={`${tn("{n} game", "{n} games", n)} · ${tl("{pct} win rate", { pct: winRate(w, n) })}`}
                  >
                    {n} · {winRate(w, n)}
                  </span>
                </li>
              ))}
            </ul>
            <DraftTendencies rows={s.rows} />
          </Section>
        ))}
      </div>
    </>
  );
};

const PlayerRows: React.FC<{ x: HubPlayer; y: HubPlayer; ra: PlayerGameRow[]; rb: PlayerGameRow[]; career: boolean; periodLabel: string }> = ({
  x,
  y,
  ra,
  rb,
  career,
  periodLabel,
}) => {
  const A = useMemo(() => playerAgg(ra), [ra]);
  const B = useMemo(() => playerAgg(rb), [rb]);
  const h2h = useMemo(() => playerHeadToHead(ra, rb), [ra, rb]);
  const shared = useMemo(() => {
    const mb = new Map(B.champs.map((c) => [c.c, c]));
    return A.champs.filter((c) => mb.has(c.c)).slice(0, 8).map((c) => ({ c, o: mb.get(c.c)! }));
  }, [A, B]);
  const wr = (w: number, g: number) => (g ? w / g : null);
  const pg = (p: typeof A) => `${perGame(p.k, p.g) ?? "–"} / ${perGame(p.d, p.g) ?? "–"} / ${perGame(p.a, p.g) ?? "–"}`;
  return (
    <>
      <Section
        title={`${x.name} vs ${y.name}`}
        right={
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-rw-sub">{periodLabel}</span>
            <BroadcastCardButton
              data={() =>
                playerCardData(
                  { name: x.name, role: x.role ? roleName(x.role) : undefined, club: x.club },
                  A,
                  periodLabel,
                  { name: y.name, role: y.role ? roleName(y.role) : undefined, club: y.club },
                  B,
                )
              }
              name={`${x.name}-vs-${y.name}`}
            />
          </span>
        }
        share={`${x.name}-vs-${y.name}-${periodLabel}`}
      >
        <div className="flex items-center justify-between gap-3 text-sm font-bold">
          <span className="flex items-center gap-2 min-w-0">
            <PlayerPhoto name={x.name} team={x.club} slug={x.u} img={x.img} sizeClass="w-11 h-11 lg:w-16 lg:h-16 2xl:w-20 2xl:h-20" />
            <span className="truncate">{x.name}</span>
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate text-right">{y.name}</span>
            <PlayerPhoto name={y.name} team={y.club} slug={y.u} img={y.img} sizeClass="w-11 h-11 lg:w-16 lg:h-16 2xl:w-20 2xl:h-20" />
          </span>
        </div>
        <table className="w-full text-xs">
          <tbody>
            <Row label={tl("Role")} a={A.roles[0] ? roleName(A.roles[0]) : "–"} b={B.roles[0] ? roleName(B.roles[0]) : "–"} />
            {h2h.g > 0 && <Row label={career ? tl("Head to head (games)") : tl("Head to head this period (games)")} a={h2h.w} b={h2h.g - h2h.w} va={h2h.w} vb={h2h.g - h2h.w} />}
            <Row label={tl("Games won")} a={`${A.w}-${A.g - A.w}`} b={`${B.w}-${B.g - B.w}`} />
            <Row label={tl("Win rate")} a={winRate(A.w, A.g)} b={winRate(B.w, B.g)} va={wr(A.w, A.g)} vb={wr(B.w, B.g)} />
            <Row label={tl("KDA")} a={fmtN(A.kda)} b={fmtN(B.kda)} va={A.kda} vb={B.kda} />
            <Row label="K / D / A" a={pg(A)} b={pg(B)} />
            <Row label="KP" a={pct(A.kp)} b={pct(B.kp)} va={A.kp} vb={B.kp} />
            <Row label={tl("CS / min")} a={d(A.csm)} b={d(B.csm)} va={A.csm} vb={B.csm} />
            <Row label={tl("GPM")} a={A.gpm != null ? fmtNum(A.gpm) : "–"} b={B.gpm != null ? fmtNum(B.gpm) : "–"} va={A.gpm} vb={B.gpm} />
            <Row label={tl("Damage / min")} a={A.dpm != null ? fmtNum(A.dpm) : "–"} b={B.dpm != null ? fmtNum(B.dpm) : "–"} va={A.dpm} vb={B.dpm} />
            <Row label={tl("DMG%")} a={pct(A.dmgShare)} b={pct(B.dmgShare)} va={A.dmgShare} vb={B.dmgShare} />
            <Row label={tl("Gold%")} a={pct(A.goldShare)} b={pct(B.goldShare)} va={A.goldShare} vb={B.goldShare} />
            <Row label={tl("VS / min")} a={d(A.vsm)} b={d(B.vsm)} va={A.vsm} vb={B.vsm} />
            {(A.tl || B.tl) && (
              <>
                <Row label="GD@15" a={sgn(A.tl?.gd15 ?? null)} b={sgn(B.tl?.gd15 ?? null)} va={A.tl?.gd15 ?? null} vb={B.tl?.gd15 ?? null} />
                <Row label="CSD@15" a={sgn(A.tl?.csd15 ?? null)} b={sgn(B.tl?.csd15 ?? null)} va={A.tl?.csd15 ?? null} vb={B.tl?.csd15 ?? null} />
                <Row label="XPD@15" a={sgn(A.tl?.xpd15 ?? null)} b={sgn(B.tl?.xpd15 ?? null)} va={A.tl?.xpd15 ?? null} vb={B.tl?.xpd15 ?? null} />
                <Row label={tl("First blood involvement")} a={pct(A.tl?.fbPart ?? null)} b={pct(B.tl?.fbPart ?? null)} va={A.tl?.fbPart ?? null} vb={B.tl?.fbPart ?? null} />
                <Row
                  label={tl("Died for first blood")}
                  a={pct(A.tl?.fbVictim ?? null)}
                  b={pct(B.tl?.fbVictim ?? null)}
                  va={A.tl?.fbVictim ?? null}
                  vb={B.tl?.fbVictim ?? null}
                  better="low"
                />
                <Row label={tl("Wards / min")} a={d(A.tl?.wpm ?? null)} b={d(B.tl?.wpm ?? null)} va={A.tl?.wpm ?? null} vb={B.tl?.wpm ?? null} />
                <Row label={tl("Wards cleared / min")} a={d(A.tl?.wcpm ?? null)} b={d(B.tl?.wcpm ?? null)} va={A.tl?.wcpm ?? null} vb={B.tl?.wcpm ?? null} />
              </>
            )}
            <Row label={tl("Champions played")} a={A.champs.length} b={B.champs.length} />
            {career && (
              <>
                <Row label={tl("Titles")} a={x.titles.length} b={y.titles.length} va={x.titles.length} vb={y.titles.length} />
                <Row label={tl("Worlds")} a={x.titles.filter((t) => t.kind === "Worlds").length} b={y.titles.filter((t) => t.kind === "Worlds").length} />
              </>
            )}
          </tbody>
        </table>
        {(A.tl || B.tl) && <OeCredit />}
      </Section>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { n: x.name, p: A },
          { n: y.name, p: B },
        ].map((s) => (
          <Section key={s.n} title={tl("Champions: {player}", { player: s.n })}>
            <ul className="text-xs space-y-1">
              {s.p.champs.slice(0, 8).map((c) => (
                <li key={c.c} className="flex justify-between gap-2 min-w-0">
                  <ChampLink name={c.c} size={16} />
                  <span className="text-rw-muted shrink-0 tabular-nums">
                    {c.g} · {winRate(c.w, c.g)} · {fmtN(c.kda)} KDA
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>
      {shared.length > 0 && (
        <Section title={tl("Champions both played")}>
          <STable className="w-full text-xs">
            <tbody>
              {shared.map(({ c, o }) => (
                <tr key={c.c} className="border-t border-rw-border">
                  <td className={`${td} text-right tabular-nums w-2/5`}>
                    {c.g} · {winRate(c.w, c.g)} · {fmtN(c.kda)}
                  </td>
                  <td className={`${td} text-center`}>
                    <span className="inline-flex justify-center">
                      <ChampLink name={c.c} size={16} />
                    </span>
                  </td>
                  <td className={`${td} tabular-nums w-2/5`}>
                    {o.g} · {winRate(o.w, o.g)} · {fmtN(o.kda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </STable>
          <p className="text-[10px] text-rw-muted">{tl("Games · win rate · KDA")}</p>
        </Section>
      )}
    </>
  );
};

/**
 * Every game two players played against each other (all time): the record, the lane gold lead at 15 minutes when
 * they faced each other in lane, their most common champion matchups and the games themselves.
 */
const PlayerHeadToHead: React.FC<{ a: PlayerGameRow[]; b: PlayerGameRow[]; aName: string; bName: string; spoilerKey: string }> = ({
  a,
  b,
  aName,
  bName,
  spoilerKey,
}) => {
  const meetings = useMemo(() => playerMeetings(a, b), [a, b]);
  const [hidden, reveal] = useHidden(spoilerKey, meetings.find((m) => isFresh(m.a[0]))?.a[0]);
  const [n, setN] = useState(10);
  const shown = hidden ? meetings.filter((m) => !isFresh(m.a[0])) : meetings;
  const s = useMemo(() => {
    const w = shown.filter((m) => m.a[6]).length;
    // lane leads only when they played the same role (then each one's lead is over the other)
    const lane = shown.filter((m) => m.a[10] && m.a[10] === m.b[10] && m.a[21]?.[3] != null);
    const gd15 = lane.length ? lane.reduce((t, m) => t + (m.a[21]![3] as number), 0) / lane.length : null;
    const pairs = new Map<string, { ca: string; cb: string; g: number; w: number }>();
    for (const m of shown) {
      const k = `${m.a[2]}|${m.b[2]}`;
      const x = pairs.get(k) || { ca: m.a[2], cb: m.b[2], g: 0, w: 0 };
      x.g++;
      x.w += m.a[6] ? 1 : 0;
      pairs.set(k, x);
    }
    const series = new Map<string, number>();
    for (const m of shown) series.set(m.a[1], (series.get(m.a[1]) || 0) + (m.a[6] ? 1 : -1));
    const sw = [...series.values()].filter((v) => v > 0).length;
    const sl = [...series.values()].filter((v) => v < 0).length;
    return { w, l: shown.length - w, gd15, lane: lane.length, top: [...pairs.values()].sort((x, y) => y.g - x.g).slice(0, 5), sw, sl };
  }, [shown]);
  if (meetings.length === 0) return null;
  return (
    <Section title={tl("Head to head")} right={hidden ? <RevealButton onReveal={reveal} small /> : undefined}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className={`${card} py-2`}>
          <div className="text-[10px] uppercase tracking-wider text-rw-muted">{tl("Games")}</div>
          <div className="font-bold text-rw-text tabular-nums">
            {aName} {s.w} – {s.l} {bName}
          </div>
        </div>
        <div className={`${card} py-2`}>
          <div className="text-[10px] uppercase tracking-wider text-rw-muted">{tl("Series")}</div>
          <div className="font-bold text-rw-text tabular-nums">
            {s.sw} – {s.sl}
          </div>
        </div>
        {s.gd15 != null && (
          <div className={`${card} py-2`} title={tl("{name}'s gold lead over the other at 15 minutes, in the {n} games they faced each other in lane", { name: aName, n: s.lane })}>
            <div className="text-[10px] uppercase tracking-wider text-rw-muted">{tl("Gold lead at 15 in lane")}</div>
            <div className={`font-bold tabular-nums ${s.gd15 >= 0 ? "text-rw-teal" : "text-rw-red"}`}>
              {s.gd15 >= 0 ? "+" : ""}
              {fmtNum(Math.round(s.gd15))}
            </div>
          </div>
        )}
      </div>
      {s.top.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider font-bold text-rw-muted">{tl("Most common champion matchups")}</div>
          <ul className="text-xs grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {s.top.map((p) => (
              <li key={p.ca + p.cb} className="flex items-center gap-1.5 min-w-0">
                <ChampIcon name={p.ca} size={18} />
                <ChampIcon name={p.cb} size={18} />
                <span className="truncate text-rw-sub">
                  <ChampLink name={p.ca} /> vs <ChampLink name={p.cb} />
                </span>
                <span className="ml-auto tabular-nums text-rw-text">{p.w}–{p.g - p.w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="text-xs space-y-1">
        {shown.slice(0, n).map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-2 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className={`w-3.5 shrink-0 font-bold ${m.a[6] ? "text-rw-teal" : "text-rw-red"}`}>
                {m.a[6] ? tc("short result", "W") : tc("short result", "L")}
              </span>
              <ChampIcon name={m.a[2]} size={18} />
              <span className="tabular-nums text-rw-text">{m.a[3]}/{m.a[4]}/{m.a[5]}</span>
              <span className="text-rw-muted">vs</span>
              <ChampIcon name={m.b[2]} size={18} />
              <span className="tabular-nums text-rw-sub">{m.b[3]}/{m.b[4]}/{m.b[5]}</span>
              <span className="truncate text-rw-muted">
                · <EventLink name={m.a[9]} u={m.a[11]} className="text-rw-muted hover:text-rw-accent hover:underline" />
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0 text-rw-muted">
              {fmtDate(m.a[0])}
              <HubLink to={{ kind: "match", slug: m.a[1], game: m.a[22] || undefined }} className="text-rw-teal hover:underline">
                {tl("Details")}
              </HubLink>
            </span>
          </li>
        ))}
      </ul>
      {shown.length > n && (
        <button type="button" onClick={() => setN((x) => x + 20)} className="text-[11px] text-rw-teal hover:underline">
          {tl("Show more ({n} left)", { n: shown.length - n })}
        </button>
      )}
    </Section>
  );
};

// ── Three or more side by side ────────────────────────────────────────────────────────────────────────────

type Loaded = { slug: string; info: HubTeam | HubPlayer; log: (TeamGameRow | PlayerGameRow)[] };

/** Up to eight teams or players in one table: one column each, the best number of every row lit up. */
const MultiCompare: React.FC<{ mode: Mode; slugs: string[]; period?: string; set: (p: Partial<CompareRoute>) => void }> = ({ mode, slugs, period: wanted, set }) => {
  // tagged with what they were loaded for (see ComparePage: old files mustn't be read as the new kind)
  const forKey = `${mode}|${slugs.join(",")}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: Loaded[] } | null>(null);
  const rows = loaded && loaded.key === forKey ? loaded.rows : null;
  useEffect(() => {
    let alive = true;
    Promise.all(
      slugs.map(async (slug) => {
        try {
          const info = await (mode === "team" ? loadHubTeam(slug) : loadHubPlayer(slug));
          const log = await (mode === "team" ? loadTeamGames(slug) : loadPlayerGames(slug)).catch(() => [] as (TeamGameRow | PlayerGameRow)[]);
          return { slug, info, log } as Loaded;
        } catch {
          return null;
        }
      }),
    ).then((xs) => alive && setLoaded({ key: forKey, rows: xs.filter((x): x is Loaded => !!x) }));
    return () => {
      alive = false;
    };
  }, [mode, slugs.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const refs = (log: (TeamGameRow | PlayerGameRow)[]) => (mode === "team" ? (log as TeamGameRow[]).map(teamRowRef) : (log as PlayerGameRow[]).map(playerRowRef));
  // periods every column can show: all logs merged; "last N" only when each has that many games
  const options = useMemo(() => {
    if (!rows || !rows.length) return [];
    const merged = rows.flatMap((r) => refs(r.log)).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    const n = Math.min(...rows.map((r) => r.log.length));
    return periodOptions(merged, 80).filter((o) => !/^last(\d+)$/.test(o.key) || Number(o.key.slice(4)) < n);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const period: PeriodKey = wanted && options.some((o) => o.key === wanted) ? wanted : "all";
  const opt = options.find((o) => o.key === period);
  const periodLabel = !opt || opt.key === "all" ? tl("All time") : opt.group === "basic" ? tl("Last {n} games", { n: opt.label }) : opt.label;
  const aggs = useMemo(
    () =>
      (rows || []).map((r) =>
        mode === "team" ? teamAgg(inPeriod(r.log as TeamGameRow[], period, teamRowRef)) : playerAgg(inPeriod(r.log as PlayerGameRow[], period, playerRowRef)),
      ),
    [rows, period, mode],
  );
  const remove = (slug: string) => {
    const left = slugs.filter((s) => s !== slug);
    set({ a: left[0], b: left[1], more: left.slice(2).length ? left.slice(2) : undefined });
  };
  if (!rows) return <Loading />;
  const wr = (w: number, g: number) => (g ? (w / g) * 100 : null);
  // [label, value per column, lower is better]
  const lines: [string, (number | null)[], boolean?][] =
    mode === "team"
      ? (() => {
          const A = aggs as TeamAgg[];
          return [
            [tl("Games"), A.map((x) => x.g)],
            [tl("Win rate"), A.map((x) => wr(x.w, x.g))],
            [tl("Blue side wins"), A.map((x) => wr(x.blue[1], x.blue[0]))],
            [tl("Red side wins"), A.map((x) => wr(x.red[1], x.red[0]))],
            [tl("Avg game (min)"), A.map((x) => x.min)],
            [tl("Kills / game"), A.map((x) => x.kills)],
            [tl("Deaths / game"), A.map((x) => x.deaths), true],
            [tl("Gold diff / game"), A.map((x) => x.gd)],
            ["GD@15", A.map((x) => x.tl?.gd15 ?? null)],
            [tl("First blood"), A.map((x) => x.tl?.fb ?? null)],
            ["DRA%", A.map((x) => x.dragShare)],
            [tl("Baron%"), A.map((x) => x.baronShare)],
            [tl("Towers"), A.map((x) => x.towers)],
            [tl("Champion pool"), A.map((x) => x.nPicks)],
          ];
        })()
      : (() => {
          const A = aggs as PlayerAgg[];
          return [
            [tl("Games"), A.map((x) => x.g)],
            [tl("Win rate"), A.map((x) => wr(x.w, x.g))],
            ["KDA", A.map((x) => x.kda)],
            ["KP", A.map((x) => x.kp)],
            [tl("CS / min"), A.map((x) => x.csm)],
            [tl("Damage / min"), A.map((x) => x.dpm)],
            ["DMG%", A.map((x) => x.dmgShare)],
            ["GD@15", A.map((x) => x.tl?.gd15 ?? null)],
            ["CSD@15", A.map((x) => x.tl?.csd15 ?? null)],
            [tl("VS / min"), A.map((x) => x.vsm)],
            [tl("Champion pool"), A.map((x) => x.champs.length)],
          ];
        })();
  const pct = (label: string) => /rate|wins|%|blood|KP/.test(label);
  const fmt = (label: string, v: number | null) =>
    v == null ? "–" : pct(label) ? `${fmtDec(v)}%` : /GD@15|Gold diff/.test(label) ? `${v > 0 ? "+" : ""}${fmtNum(Math.round(v))}` : /KDA|CS|VS|min\)/.test(label) ? Number(v.toFixed(2)).toLocaleString(locale()) : fmtNum(Math.round(v));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {rows.map((r) => (
          <span key={r.slug} className={`${card} py-1 px-2 flex items-center gap-2`}>
            <HubLink to={{ kind: mode, slug: r.slug }} className="font-bold">
              {r.info.name}
            </HubLink>
            <button type="button" onClick={() => remove(r.slug)} className="text-rw-muted hover:text-rw-red" aria-label={tl("Remove")} title={tl("Remove")}>
              ×
            </button>
          </span>
        ))}
        {slugs.length < 8 && (
          <details>
            <summary className="cursor-pointer text-rw-teal hover:underline">{tl("Add another")}</summary>
            <div className={`${card} mt-2 max-w-md`}>
              <ComparePick kind={mode} autoFocus onPick={(slug) => set({ more: [...slugs.slice(2), slug] })} />
            </div>
          </details>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-rw-muted">{tl("Stats for")}</span>
          <PeriodPicker options={options} value={period} onChange={(p) => set({ period: p })} />
        </span>
      </div>
      <Section title={`${tl("Compare")} · ${periodLabel}`} share={`riftwise-compare-${slugs.join("-")}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left py-1.5 pr-2 text-rw-muted font-semibold"></th>
                {rows.map((r) => (
                  <th key={r.slug} className="text-right py-1.5 px-2 font-bold text-rw-text whitespace-nowrap">
                    {r.info.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines
                .filter(([, vs]) => vs.some((v) => v != null))
                .map(([label, vs, low]) => {
                  const known = vs.filter((v): v is number => v != null);
                  const best = known.length > 1 ? (low ? Math.min(...known) : Math.max(...known)) : null;
                  return (
                    <tr key={label} className="border-t border-rw-border">
                      <td className="py-1.5 pr-2 text-rw-muted whitespace-nowrap">{label}</td>
                      {vs.map((v, i) => (
                        <td key={i} className={`py-1.5 px-2 text-right tabular-nums ${best != null && v === best ? "text-rw-teal font-bold" : "text-rw-text"}`}>
                          {fmt(label, v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {aggs.some((x) => x.tl) && <OeCredit />}
      </Section>
    </>
  );
};
