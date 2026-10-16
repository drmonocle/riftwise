/** Tournament page: results and prize money, standings, bracket, every series, leaders and champions. */
import React, { useMemo, useState } from "react";
import { Trophy, MapPin, CalendarDays, Coins, Download } from "lucide-react";
import { downloadEventCsv } from "./DownloadsPage";
import { tl, tn, tk, regionName, stageName } from "../../i18n";
import { winRate } from "../../stats";
import { loadHubEvent } from "../../hub/data";
import type { HubEvent, SeriesRow, Stage, StandingRow } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { EventPlayerStats, EventTeamStatsTable } from "./EventTables";
import { EventFacts, EventRosters, RegionalRecords } from "./EventExtras";
import {
  card,
  ChampLink,
  EventLink,
  fmtDate,
  fmtNum,
  fmtUsd,
  HubLink,
  Page,
  PlayerLink,
  RevealButton,
  Section,
  Stat,
  td,
  th,
  TeamLink,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";

export const EventPage: React.FC<{ slug: string; onOpenUrl?: (url: string) => void }> = ({ slug, onOpenUrl }) => {
  const state = useLoad(() => loadHubEvent(slug), [slug]);
  usePageTitle(state.data?.n);
  useDDragon();
  return <Page state={state}>{(e) => <EventView e={e} onOpenUrl={onOpenUrl} />}</Page>;
};

const EventView: React.FC<{ e: HubEvent; onOpenUrl?: (url: string) => void }> = ({ e, onOpenUrl }) => {
  const [resultsHidden, revealResults] = useHidden(`event:${e.u}`, e.end);
  const stages = e.stages || [];
  const bracket = stages.filter((s) => s.kind === "bracket");
  const lists = stages.filter((s) => s.kind === "list");
  return (
    <div className="space-y-3">
      <div className={card}>
        {e.parent && (
          <p className="text-[11px] text-[#7e8e9f] mb-1">
            {tl("Part of")} <EventLink name={e.parent.n} u={e.parent.u} className="text-[#c8aa6e] hover:underline" />
          </p>
        )}
        <h2 className="text-lg font-bold text-[#f0e6d2]">{e.n}</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#9bb3c9] mt-1">
          {(e.start || e.end) && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {fmtDate(e.start)}
              {e.end && e.end !== e.start ? ` – ${fmtDate(e.end)}` : ""}
            </span>
          )}
          {e.league &&
            (e.lu ? (
              <HubLink to={{ kind: "league", slug: e.lu }} className="text-[#9bb3c9] hover:text-[#c8aa6e] hover:underline">
                {e.league}
              </HubLink>
            ) : (
              <span>{e.league}</span>
            ))}
          {e.region && <span>{regionName(e.region, e.region)}</span>}
          {(e.country || e.type) && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {[e.country, e.type === "Online" ? tl("Online") : e.type === "Offline" ? tl("On stage") : e.type].filter(Boolean).join(" · ")}
            </span>
          )}
          {e.prize && (
            <span className="flex items-center gap-1">
              <Coins className="w-3 h-3" />
              {tl("Prize pool {amount}", { amount: e.prize })}
            </span>
          )}
        </div>
        {(e.siblings?.length || 0) > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {e.siblings!.map((s) => (
              <HubLink
                key={s.u}
                to={{ kind: "event", slug: s.u }}
                className={`px-2.5 py-1 rounded-lg text-xs border ${
                  s.u === e.u ? "bg-[#c8aa6e] text-[#091428] font-bold border-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2]"
                }`}
              >
                {s.n}
              </HubLink>
            ))}
          </div>
        )}
        {(e.games || 0) > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Stat label={tl("Games")} value={fmtNum(e.games || 0)} sub={e.statsGames ? tl("{n} with full stats", { n: fmtNum(e.statsGames) }) : undefined} />
            <Stat label={tl("Series")} value={fmtNum(e.series || 0)} />
            <Stat label={tl("Teams")} value={e.teams?.length || "–"} />
          </div>
        )}
        {(e.games || 0) > 0 && !e.whole && (
          <button
            type="button"
            onClick={() => downloadEventCsv(e.u, onOpenUrl).catch(() => {})}
            className="mt-2 flex items-center gap-1 text-[11px] text-[#0ac8b9] hover:underline"
          >
            <Download className="w-3 h-3" />
            {tl("Download every game (CSV)")}
          </button>
        )}
      </div>

      {e.children && e.children.length > 0 && (
        <Section title={tl("Stages")}>
          <ul className="text-xs space-y-1">
            {e.children.map((c) => (
              <li key={c.u}>
                <EventLink name={c.n} u={c.u} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {e.results && e.results.length > 0 && (
        <Section
          title={e.resultsFrom === "event" ? tl("Final standings (whole event)") : tl("Final standings")}
          right={resultsHidden ? <RevealButton onReveal={revealResults} small /> : undefined}
        >
          {resultsHidden ? (
            <p className="text-[11px] text-[#7e8e9f] italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {e.results.slice(0, 32).map((r, i) => (
                  <tr key={i} className="border-t border-[#1e282d] first:border-0">
                    <td className={`${td} w-12 font-bold ${r.p === "1" ? "text-[#c8aa6e]" : "text-[#9bb3c9]"}`}>
                      {r.p === "1" && <Trophy className="w-3 h-3 inline mr-1" />}
                      {r.p}
                    </td>
                    <td className={td}>
                      <TeamLink name={r.t} u={r.u} />
                    </td>
                    <td className={`${td} text-right text-[#7e8e9f]`}>{r.usd ? fmtUsd(r.usd) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {e.overview && <EventFacts o={e.overview} hidden={resultsHidden} />}

      {bracket.length > 0 && <Bracket stages={bracket} />}

      {e.standings && e.standings.length > 0 && (
        <div className={`grid gap-3 ${e.standings.length > 1 ? "md:grid-cols-2" : ""}`}>
          {e.standings.map((t, i) => (
            <Standings key={i} name={t.name === "Standings" ? tl("Standings") : tl("Group {name}", { name: t.name.replace(/^Group /, "") })} rows={t.rows} end={e.end} />
          ))}
        </div>
      )}

      {lists.length > 0 && <StageLists stages={lists} />}

      {e.leaders && Object.keys(e.leaders).length > 0 && <Leaders e={e} />}

      <EventPlayerStats e={e} hidden={resultsHidden} />
      <EventTeamStatsTable e={e} hidden={resultsHidden} />
      <RegionalRecords e={e} hidden={resultsHidden} />

      <div className="grid gap-3 md:grid-cols-2">
        {e.champs && e.champs.length > 0 && <EventChamps e={e} />}
        {e.teams && e.teams.length > 0 && (
          <Section title={tl("Teams")}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>{tl("Team")}</th>
                  <th className={th}>{tl("Series")}</th>
                  <th className={th}>{tl("Games")}</th>
                </tr>
              </thead>
              <tbody>
                {e.teams.map((t) => (
                  <tr key={t.t} className="border-t border-[#1e282d]">
                    <td className={`${td} max-w-[12rem] truncate`}>
                      <TeamLink name={t.t} u={t.u} />
                    </td>
                    <td className={`${td} text-[#9bb3c9]`}>{resultsHidden ? "–" : `${t.sw}-${t.sg - t.sw}`}</td>
                    <td className={`${td} text-[#9bb3c9]`}>{resultsHidden ? "–" : `${t.w}-${t.g - t.w}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
      {e.rosters && e.rosters.length > 0 && <EventRosters rosters={e.rosters} />}
    </div>
  );
};

// ── Series boxes ──────────────────────────────────────────────────────────

/** One series as two team lines with scores; links to its match page. */
export const SeriesBox: React.FC<{ r: SeriesRow; hideResult?: boolean; note?: React.ReactNode; compact?: boolean }> = ({ r, hideResult, note, compact }) => {
  const [hiddenBySpoiler, reveal] = useHidden(`series:${r.g || r.a + r.b + r.date}`, r.date);
  const hidden = hideResult || hiddenBySpoiler;
  const played = r.sa != null && r.sb != null;
  const line = (name: string, u: string | null, score: number | null, won: boolean) => (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className={`truncate ${!hidden && won ? "text-[#f0e6d2] font-bold" : "text-[#9bb3c9]"}`}>
        <TeamLink name={name} u={u} className={!hidden && won ? "text-[#f0e6d2] font-bold hover:underline" : "text-[#9bb3c9] hover:text-[#f0e6d2] hover:underline"} />
      </span>
      <span className={`tabular-nums font-bold ${!hidden && won ? "text-[#0ac8b9]" : "text-[#7e8e9f]"}`}>{played ? (hidden ? "?" : score) : ""}</span>
    </div>
  );
  return (
    <div className={`bg-[#091428] border border-[#1e282d] rounded-lg ${compact ? "px-2 py-1" : "px-2.5 py-1.5"} text-xs min-w-0`}>
      {line(r.a, r.au, r.sa, r.w === 1)}
      {line(r.b, r.bu, r.sb, r.w === 2)}
      <div className="flex items-center justify-between gap-2 mt-0.5 text-[10px] text-[#7e8e9f]">
        <span className="truncate">{note ?? fmtDate(r.date, false)}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {hiddenBySpoiler && !hideResult && played && <RevealButton onReveal={reveal} small />}
          {r.g && !hideResult && (
            <HubLink to={{ kind: "match", slug: r.g }} className="text-[#0ac8b9] hover:underline">
              {tl("Details")}
            </HubLink>
          )}
        </span>
      </div>
    </div>
  );
};

/** Knockout rounds as bracket columns (quarterfinals → semifinals → final). */
export const Bracket: React.FC<{ stages: Stage[]; hide?: (r: SeriesRow) => boolean; note?: (r: SeriesRow) => React.ReactNode; title?: string }> = ({
  stages,
  hide,
  note,
  title,
}) => (
  <Section title={title || tl("Bracket")}>
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="flex gap-3 min-w-max items-stretch">
        {stages.map((st) => (
          <div key={st.name} className="w-48 flex flex-col">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#7e8e9f] mb-1.5 truncate">{stageLabel(st.name)}</div>
            <div className="flex flex-col justify-around flex-1 gap-2">
              {st.series.map((r, i) => (
                <SeriesBox key={i} r={r} hideResult={hide?.(r)} note={note?.(r)} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </Section>
);

/** Stage names from Leaguepedia ("Week 3", "Round 1", "Quarterfinals") in the reader's language where we can. */
export function stageLabel(name: string): string {
  let m = /^Week (\d+)$/i.exec(name);
  if (m) return tl("Week {n}", { n: m[1] });
  m = /^Swiss Round (\d+)$/i.exec(name);
  if (m) return stageName(`Round ${m[1]}`);
  m = /^Group ([A-Z0-9]+)$/i.exec(name);
  if (m) return tl("Group {name}", { name: m[1] });
  if (/^(third|3rd)[- ]place match$/i.test(name)) return tl("Third-place match");
  return stageName(name);
}

const StageLists: React.FC<{ stages: Stage[] }> = ({ stages }) => {
  // Long leagues: one stage at a time, newest first
  const [i, setI] = useState(stages.length - 1);
  const st = stages[Math.min(i, stages.length - 1)];
  return (
    <Section title={tl("Matches")}>
      {stages.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {stages.map((s, k) => (
            <button
              key={s.name + k}
              type="button"
              onClick={() => setI(k)}
              className={`px-2 py-1 rounded text-[11px] border ${
                k === i ? "bg-[#c8aa6e] text-[#091428] font-bold border-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2]"
              }`}
            >
              {stageLabel(s.name) || tl("Matches")}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {st.series.map((r, k) => (
          <SeriesBox key={k} r={r} />
        ))}
      </div>
    </Section>
  );
};

export const Standings: React.FC<{ name: string; rows: StandingRow[]; end?: string; hideAll?: boolean }> = ({ name, rows, end, hideAll }) => {
  const [hidden, reveal] = useHidden(`standings:${name}:${rows.map((r) => r.t).join()}`, end);
  const hide = hideAll || hidden;
  const ties = rows.some((r) => r.st);
  return (
    <Section title={name} right={hidden && !hideAll ? <RevealButton onReveal={reveal} small /> : undefined}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className={`${th} w-6`}>#</th>
            <th className={th}>{tl("Team")}</th>
            <th className={th}>{tl("Series")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.t + i} className="border-t border-[#1e282d]">
              <td className={`${td} text-[#7e8e9f]`}>{hide ? "–" : r.pl ?? i + 1}</td>
              <td className={`${td} max-w-[11rem] truncate`}>
                <TeamLink name={r.t} u={r.u} />
              </td>
              <td className={`${td} text-[#9bb3c9] tabular-nums`}>{hide ? "–" : `${r.sw ?? 0}-${r.sl ?? 0}${ties ? `-${r.st ?? 0}` : ""}`}</td>
              <td className={`${td} text-[#7e8e9f] tabular-nums`}>{hide || r.gw == null ? "–" : `${r.gw}-${r.gl ?? 0}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
};

const LEADER_TITLES: Record<string, string> = {
  kda: tk("Best KDA"),
  kills: tk("Kills per game"),
  csm: tk("CS per minute"),
  dpm: tk("Damage per minute"),
  pool: tk("Most champions played"),
};

const Leaders: React.FC<{ e: HubEvent }> = ({ e }) => {
  const keys = (["kda", "kills", "csm", "dpm", "pool"] as const).filter((k) => e.leaders?.[k]?.length);
  const [k, setK] = useState<(typeof keys)[number]>(keys[0]);
  const rows = e.leaders?.[k] || [];
  return (
    <Section title={tl("Player leaders")}>
      <div className="flex flex-wrap gap-1">
        {keys.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setK(x)}
            className={`px-2 py-1 rounded text-[11px] border ${
              x === k ? "bg-[#c8aa6e] text-[#091428] font-bold border-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2]"
            }`}
          >
            {tl(LEADER_TITLES[x])}
          </button>
        ))}
      </div>
      <ol className="text-xs space-y-1">
        {rows.map((r, i) => (
          <li key={r.n + i} className="flex items-center justify-between gap-2 min-w-0">
            <span className="truncate min-w-0">
              <span className="text-[#7e8e9f] mr-1.5 tabular-nums">{i + 1}.</span>
              <PlayerLink name={r.n} u={r.u} />
              <span className="text-[#7e8e9f]"> · {r.t}</span>
            </span>
            <span className="shrink-0 text-[#9bb3c9] tabular-nums">
              <span className="text-[#c8aa6e] font-bold">{fmtNum(r.v)}</span> · {tn("{n} game", "{n} games", r.g)}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-[#7e8e9f]">{tl("Players who played at least 40% of the most games anyone played here.")}</p>
    </Section>
  );
};

const EventChamps: React.FC<{ e: HubEvent }> = ({ e }) => {
  const games = e.statsGames || 0;
  const rows = useMemo(() => (e.champs || []).slice(0, 20), [e.champs]);
  // the Champions page with this tournament picked: every champion, by patch / side / role, blind picks
  const year = (e.start || e.end || "").slice(0, 4);
  const more =
    e.lu && /^\d{4}$/.test(year) ? (
      <HubLink
        to={{ kind: "champions", query: new URLSearchParams({ league: e.lu, year, ...(e.whole ? {} : { event: e.u }) }).toString() }}
        className="text-[11px] text-[#0ac8b9] hover:underline"
      >
        {tl("Every champion, with filters")}
      </HubLink>
    ) : undefined;
  return (
    <Section title={tl("Champions")} right={more}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Champion")}</th>
            <th className={th}>{tl("Presence")}</th>
            <th className={th}>{tl("Picks")}</th>
            <th className={th}>{tl("Bans")}</th>
            <th className={th}>{tl("Win %")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.c} className="border-t border-[#1e282d]">
              <td className={`${td} max-w-[9rem]`}>
                <ChampLink name={c.c} size={18} />
              </td>
              <td className={`${td} text-[#9bb3c9]`}>{games ? `${Math.round(((c.p + c.b) / games) * 100)}%` : "–"}</td>
              <td className={`${td} text-[#9bb3c9]`}>{c.p}</td>
              <td className={`${td} text-[#9bb3c9]`}>{c.b}</td>
              <td className={`${td} text-[#9bb3c9]`}>{c.p ? winRate(c.w, c.p) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
};

