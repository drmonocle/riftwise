/**
 * Compare two teams or two players over any period (all time, last N games, a year, a tournament), side by side,
 * with the better number highlighted and their head-to-head. The choice lives in the address
 * (/riftwise/stats/compare?teams=t1,gen-g&p=y2026) so it can be shared.
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, roleName } from "../../i18n";
import { winRate } from "../../stats";
import { HubHit, HubIndex, loadHubIndex, loadHubPlayer, loadHubTeam, loadPlayerGames, loadTeamGames, searchHub } from "../../hub/data";
import type { HubPlayer, HubTeam, PlayerGameRow, TeamGameRow } from "../../hub/types";
import { CompareRoute, navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import {
  PeriodKey,
  PeriodOption,
  inPeriod,
  periodOptions,
  playerAgg,
  playerHeadToHead,
  playerRowRef,
  teamAgg,
  teamHeadToHead,
  teamRowRef,
} from "../../hub/period";
import { HeadToHeadSeries } from "./Archives";
import { PeriodPicker } from "./PeriodStats";
import { DraftTendencies } from "./DraftTendencies";
import { card, ChampLink, fmtNum, HubLink, isFresh, RevealButton, Section, td, useHidden, usePageTitle } from "./ui";

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
        className="w-full bg-[#091428] border border-[#1e282d] rounded-lg px-2.5 py-1.5 text-xs text-[#f0e6d2] placeholder-[#7e8e9f]"
      />
      {hits.map((h, i) => (
        <button
          key={h.slug}
          type="button"
          onClick={() => pick(h)}
          onMouseEnter={() => setSel(i)}
          className={`w-full flex justify-between gap-2 px-2 py-1 rounded text-left text-xs min-w-0 ${
            i === sel ? "bg-[#121e2d]" : "bg-[#091428] hover:bg-[#121e2d]"
          }`}
        >
          <span className="text-[#f0e6d2] font-semibold truncate">{h.name}</span>
          <span className="text-[#7e8e9f] truncate shrink-0 max-w-[50%]">{h.sub}</span>
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
  const cls = (side: "a" | "b") => (win === side ? "text-[#0ac8b9]" : "text-[#f0e6d2]");
  return (
    <tr className="border-t border-[#1e282d]">
      <td className={`${td} text-right font-semibold w-2/5 tabular-nums ${cls("a")}`}>{a}</td>
      <td className={`${td} text-center text-[#7e8e9f] text-[11px]`}>{label}</td>
      <td className={`${td} font-semibold w-2/5 tabular-nums ${cls("b")}`}>{b}</td>
    </tr>
  );
};

/** a share in percent, one decimal like gol.gg ("61.0%") */
const pct = (v: number | null | undefined) => (v == null ? "–" : `${v.toFixed(1)}%`);
const d = (v: number | null | undefined, suffix = "") => (v == null ? "–" : `${v}${suffix}`);
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
  const set = (patch: Partial<CompareRoute>) => navigateHub({ kind: "compare", mode, a: a || undefined, b: b || undefined, period: route.period, ...patch }, { replace: true });

  const [info, setInfo] = useState<{ a: HubTeam | HubPlayer | null; b: HubTeam | HubPlayer | null }>({ a: null, b: null });
  const [logs, setLogs] = useState<{ a: (TeamGameRow | PlayerGameRow)[] | null; b: (TeamGameRow | PlayerGameRow)[] | null }>({ a: null, b: null });
  useEffect(() => {
    let alive = true;
    const loadInfo = (s: string | null) => (s ? (mode === "team" ? loadHubTeam(s) : loadHubPlayer(s)).catch(() => null) : Promise.resolve(null));
    const loadLog = (s: string | null) =>
      s ? (mode === "team" ? loadTeamGames(s) : loadPlayerGames(s)).catch(() => [] as (TeamGameRow | PlayerGameRow)[]) : Promise.resolve(null);
    Promise.all([loadInfo(a), loadInfo(b), loadLog(a), loadLog(b)]).then(([ia, ib, la, lb]) => {
      if (!alive) return;
      setInfo({ a: ia, b: ib });
      setLogs({ a: la, b: lb });
    });
    return () => {
      alive = false;
    };
  }, [mode, a, b]);

  const ready = !!(a && b && info.a && info.b && logs.a && logs.b);
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["team", "player"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => navigateHub({ kind: "compare", mode: k }, { replace: true })}
            className={`px-2.5 py-1.5 rounded-lg border ${
              mode === k ? "bg-[#c8aa6e] text-[#091428] font-bold border-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9]"
            }`}
          >
            {k === "team" ? tl("Teams") : tl("Players")}
          </button>
        ))}
        {ready && mode === "team" && (
          <HubLink to={{ kind: "prep", a: a!, b: b!, period: route.period }} className="text-[#0ac8b9] hover:underline">
            {tl("Match prep")}
          </HubLink>
        )}
        {ready && (
          <span className="flex items-center gap-1.5 ml-auto min-w-0">
            <span className="text-[#7e8e9f]">{tl("Stats for")}</span>
            <PeriodPicker options={options} value={period} onChange={(p) => set({ period: p })} />
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            { s: a, i: info.a, key: "a" as const },
            { s: b, i: info.b, key: "b" as const },
          ]
        ).map((side) => (
          <div key={side.key} className={`${card} space-y-1 min-w-0`}>
            {side.s && side.i && (
              <div className="text-sm font-bold truncate">
                <HubLink to={{ kind: mode, slug: side.s }}>{side.i.name}</HubLink>
              </div>
            )}
            {side.s ? (
              <button type="button" onClick={() => set({ [side.key]: undefined })} className="text-[11px] text-[#0ac8b9] hover:underline">
                {tl("Change")}
              </button>
            ) : (
              <ComparePick kind={mode} autoFocus={side.key === "a" || !!a} onPick={(slug) => set({ [side.key]: slug })} />
            )}
          </div>
        ))}
      </div>
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
    </div>
  );
};

export const TeamRows: React.FC<{ x: HubTeam; y: HubTeam; ra: TeamGameRow[]; rb: TeamGameRow[]; bSlug: string; career: boolean; periodLabel: string }> = ({
  x,
  y,
  ra,
  rb,
  bSlug,
  career,
  periodLabel,
}) => {
  const A = useMemo(() => teamAgg(ra), [ra]);
  const B = useMemo(() => teamAgg(rb), [rb]);
  const h2h = useMemo(() => teamHeadToHead(ra, bSlug), [ra, bSlug]);
  const wr = (w: number, g: number) => (g ? w / g : null);
  return (
    <>
      <Section title={`${x.name} vs ${y.name}`} right={<span className="text-[11px] text-[#9bb3c9]">{periodLabel}</span>} share={`${x.name}-vs-${y.name}-${periodLabel}`}>
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
      </Section>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { n: x.name, t: A, rows: ra },
          { n: y.name, t: B, rows: rb },
        ].map((s) => (
          <Section key={s.n} title={tl("Most picked: {team}", { team: s.n })} share={`${s.n}-draft-${periodLabel}`}>
            <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
              {s.t.picks.slice(0, 10).map(([c, n, w]) => (
                <li key={c} className="flex justify-between gap-1 min-w-0">
                  <ChampLink name={c} size={16} />
                  <span className="text-[#7e8e9f] shrink-0 tabular-nums">
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
      <Section title={`${x.name} vs ${y.name}`} right={<span className="text-[11px] text-[#9bb3c9]">{periodLabel}</span>} share={`${x.name}-vs-${y.name}-${periodLabel}`}>
        <table className="w-full text-xs">
          <tbody>
            <Row label={tl("Role")} a={A.roles[0] ? roleName(A.roles[0]) : "–"} b={B.roles[0] ? roleName(B.roles[0]) : "–"} />
            {h2h.g > 0 && <Row label={career ? tl("Head to head (games)") : tl("Head to head this period (games)")} a={h2h.w} b={h2h.g - h2h.w} va={h2h.w} vb={h2h.g - h2h.w} />}
            <Row label={tl("Games won")} a={`${A.w}-${A.g - A.w}`} b={`${B.w}-${B.g - B.w}`} />
            <Row label={tl("Win rate")} a={winRate(A.w, A.g)} b={winRate(B.w, B.g)} va={wr(A.w, A.g)} vb={wr(B.w, B.g)} />
            <Row label={tl("KDA")} a={A.kda} b={B.kda} va={A.kda} vb={B.kda} />
            <Row label="K / D / A" a={pg(A)} b={pg(B)} />
            <Row label="KP" a={pct(A.kp)} b={pct(B.kp)} va={A.kp} vb={B.kp} />
            <Row label={tl("CS / min")} a={d(A.csm)} b={d(B.csm)} va={A.csm} vb={B.csm} />
            <Row label={tl("GPM")} a={A.gpm != null ? fmtNum(A.gpm) : "–"} b={B.gpm != null ? fmtNum(B.gpm) : "–"} va={A.gpm} vb={B.gpm} />
            <Row label={tl("Damage / min")} a={A.dpm != null ? fmtNum(A.dpm) : "–"} b={B.dpm != null ? fmtNum(B.dpm) : "–"} va={A.dpm} vb={B.dpm} />
            <Row label={tl("DMG%")} a={pct(A.dmgShare)} b={pct(B.dmgShare)} va={A.dmgShare} vb={B.dmgShare} />
            <Row label={tl("Gold%")} a={pct(A.goldShare)} b={pct(B.goldShare)} va={A.goldShare} vb={B.goldShare} />
            <Row label={tl("VS / min")} a={d(A.vsm)} b={d(B.vsm)} va={A.vsm} vb={B.vsm} />
            <Row label={tl("Champions played")} a={A.champs.length} b={B.champs.length} />
            {career && (
              <>
                <Row label={tl("Titles")} a={x.titles.length} b={y.titles.length} va={x.titles.length} vb={y.titles.length} />
                <Row label={tl("Worlds")} a={x.titles.filter((t) => t.kind === "Worlds").length} b={y.titles.filter((t) => t.kind === "Worlds").length} />
              </>
            )}
          </tbody>
        </table>
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
                  <span className="text-[#7e8e9f] shrink-0 tabular-nums">
                    {c.g} · {winRate(c.w, c.g)} · {c.kda} KDA
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>
      {shared.length > 0 && (
        <Section title={tl("Champions both played")}>
          <table className="w-full text-xs">
            <tbody>
              {shared.map(({ c, o }) => (
                <tr key={c.c} className="border-t border-[#1e282d]">
                  <td className={`${td} text-right tabular-nums w-2/5`}>
                    {c.g} · {winRate(c.w, c.g)} · {c.kda}
                  </td>
                  <td className={`${td} text-center`}>
                    <span className="inline-flex justify-center">
                      <ChampLink name={c.c} size={16} />
                    </span>
                  </td>
                  <td className={`${td} tabular-nums w-2/5`}>
                    {o.g} · {winRate(o.w, o.g)} · {o.kda}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-[#7e8e9f]">{tl("Games · win rate · KDA")}</p>
        </Section>
      )}
    </>
  );
};
