/** Patch history (the pro meta on every patch) and league histories (every season and its winner). */
import React, { useMemo, useState } from "react";
import { Crown } from "lucide-react";
import { tl, tn, regionName } from "../../i18n";
import { loadLeague, loadLeagues, loadPatches } from "../../hub/data";
import type { HubLeague, LeagueRow, LeagueStep, PatchMove, PatchRow } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import {
  card,
  ChampLink,
  EventLink,
  fmtDate,
  fmtNum,
  HubLink,
  Page,
  RevealButton,
  StandingsFirst,
  Section,
  td,
  th,
  TeamLink,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";
import { STable } from "../STable";
import { navigateHub } from "../../hub/route";

// ── Patches ───────────────────────────────────────────────────────────────

export const PatchesPanel: React.FC = () => {
  usePageTitle(tl("Patches"));
  useDDragon();
  const state = useLoad(loadPatches, []);
  const [n, setN] = useState(24);
  return (
    <Page state={state}>
      {(rows: PatchRow[]) => (
        <div className="space-y-3">
          <p className="text-[11px] text-rw-muted">
            {tl(
              "The most picked or banned champions on every patch, newest first (all pro leagues). Percent = presence: picked or banned in that share of games.",
            )}
          </p>
          {rows.slice(0, n).map((p) => (
            <div key={p.p} className={`${card} p-3`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-rw-text">
                  {tl("Patch {patch}", { patch: p.p })}
                </h3>
                <span className="text-[11px] text-rw-muted">
                  {fmtDate(p.from)} – {fmtDate(p.to)} ·{" "}
                  {tn("{n} game", "{n} games", p.g)}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1 text-xs">
                {p.c.map(([c, pk, b, w, pr]) => (
                  <div
                    key={c}
                    className="flex items-center justify-between gap-1 min-w-0"
                  >
                    <ChampLink name={c} size={18} />
                    <span
                      className="text-rw-sub tabular-nums shrink-0"
                      title={tl("{p} picks · {b} bans · {wr}", {
                        p: pk,
                        b,
                        wr: pk ? `${Math.round((w / pk) * 100)}%` : "–",
                      })}
                    >
                      {Math.round(((pr ?? pk + b) / Math.max(p.g, 1)) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
              {p.prev && ((p.up?.length || 0) > 0 || (p.down?.length || 0) > 0) && (
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 mt-2 pt-2 border-t border-rw-border">
                  <Movers title={tl("Rising since {patch}", { patch: p.prev })} list={p.up || []} up />
                  <Movers title={tl("Falling since {patch}", { patch: p.prev })} list={p.down || []} />
                </div>
              )}
            </div>
          ))}
          {rows.length > n && (
            <button
              type="button"
              onClick={() => setN((x) => x + 48)}
              className="text-xs text-rw-teal hover:underline"
            >
              {tl("Show more ({n} left)", { n: rows.length - n })}
            </button>
          )}
        </div>
      )}
    </Page>
  );
};

/** Patch movers: presence before -> now, and the win rate now (5+ picks). */
const Movers: React.FC<{ title: string; list: PatchMove[]; up?: boolean }> = ({ title, list, up }) =>
  list.length ? (
    <div className="min-w-0">
      <div className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${up ? "text-rw-teal" : "text-rw-red"}`}>{title}</div>
      <ul className="text-xs space-y-1">
        {list.map(([c, now, was, w, pk]) => (
          <li key={c} className="flex items-center justify-between gap-2 min-w-0">
            <ChampLink name={c} size={18} />
            <span className="tabular-nums shrink-0 text-rw-sub" title={tl("Presence: picked or banned in this share of games")}>
              {Math.round(was * 100)}% → <span className="text-rw-text font-semibold">{Math.round(now * 100)}%</span>
              {pk >= 5 && <span className="text-rw-muted"> · {tl("{pct} won", { pct: `${Math.round((w / pk) * 100)}%` })}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <div />
  );

/** NA LCS (2013–2018) → LCS (2019–2024) → LTA North (2025) → LCS (2026–): each step links to its league. */
const HistoryChain: React.FC<{ steps: LeagueStep[]; current: string; small?: boolean }> = ({ steps, current, small }) => (
  <div className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 ${small ? "text-[10px] mt-0.5" : "text-xs"} text-rw-muted`}>
    {steps.map((st, i) => (
      <React.Fragment key={`${st.l}-${i}`}>
        {i > 0 && <span aria-hidden="true">→</span>}
        <span className="whitespace-nowrap">
          {st.u && st.u !== current ? (
            <HubLink to={{ kind: "league", slug: st.u }} className="hover:text-rw-accent hover:underline">
              {st.s || st.l}
            </HubLink>
          ) : (
            <span className={st.u === current ? "text-rw-text font-semibold" : ""}>{st.s || st.l}</span>
          )}
          {st.y && <span> ({st.y})</span>}
        </span>
      </React.Fragment>
    ))}
  </div>
);

// ── Leagues ───────────────────────────────────────────────────────────────

type LeagueScope = "current" | "past" | "all";

/**
 * Every league. "Current" (leagues with games this year) comes first, split into international events, main
 * leagues and the rest; "Past main leagues" are the big ones that stopped (NA LCS, EU LCS, LMS...).
 */
export const LeaguesPanel: React.FC = () => {
  usePageTitle(tl("Leagues"));
  const state = useLoad(loadLeagues, []);
  const [scope, setScope] = useState<LeagueScope>("current");
  const [q, setQ] = useState("");
  const labels: Record<LeagueScope, string> = {
    current: tl("Current"),
    past: tl("Past main leagues"),
    all: tl("Everything"),
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-lg border border-rw-border overflow-hidden">
          {(["current", "past", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-2.5 py-1.5 ${scope === s ? "bg-rw-accent text-rw-bg font-bold" : "text-rw-sub hover:text-rw-text"}`}
            >
              {labels[s]}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tl("Filter by name or region…")}
          aria-label={tl("Filter by name or region…")}
          className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-rw-text placeholder-rw-muted flex-1 min-w-[10rem]"
        />
      </div>
      <Page state={state}>{(rows: LeagueRow[]) => <LeagueLists rows={rows} scope={scope} q={q} />}</Page>
    </div>
  );
};

const LeagueLists: React.FC<{ rows: LeagueRow[]; scope: LeagueScope; q: string }> = ({ rows, scope, q }) => {
  const groups = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const match = (l: LeagueRow) => !qq || `${l.s || ""} ${l.l} ${l.r || ""}`.toLowerCase().includes(qq);
    const newest = rows.reduce((m, l) => (l.to && l.to > m ? l.to : m), "");
    const isCurrent = (l: LeagueRow) => !!l.to && l.to >= newest;
    const intl = (l: LeagueRow) => (l.r || "").toLowerCase() === "international";
    const list = rows.filter(match);
    if (scope === "all") return [{ key: "all", title: "", rows: list }];
    if (scope === "past") return [{ key: "past", title: "", rows: list.filter((l) => l.pr && !isCurrent(l)) }];
    const now = list.filter(isCurrent);
    return [
      // the big internationals (Worlds, MSI, First Stand...); show events and invitationals go with the others
      { key: "intl", title: tl("International events"), rows: now.filter((l) => intl(l) && l.pr) },
      { key: "main", title: tl("Main leagues"), rows: now.filter((l) => l.pr && !intl(l)) },
      { key: "other", title: tl("Other leagues this year"), rows: now.filter((l) => !l.pr), limit: 40 },
    ].filter((g) => g.rows.length);
  }, [rows, scope, q]);
  if (!groups.length) return <p className="text-xs text-rw-sub py-4 text-center">{tl("No leagues match.")}</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <LeagueTable key={g.key} title={g.title} rows={g.rows} limit={g.limit} />
      ))}
    </div>
  );
};

const LeagueTable: React.FC<{ title?: string; rows: LeagueRow[]; limit?: number }> = ({ title, rows, limit }) => {
  const [n, setN] = useState(limit || 0);
  const list = n ? rows.slice(0, n) : rows;
  return (
    <div className={`${card} overflow-x-auto space-y-2`}>
      {title && <h3 className="text-xs font-bold uppercase tracking-wider text-rw-accent">{title}</h3>}
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("League")}</th>
            <th className={th}>{tl("Region")}</th>
            <th className={th}>{tl("Years")}</th>
            <th className={th}>{tl("Tournaments")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((l) => (
            <tr key={l.u} className="border-t border-rw-border">
              <td className={`${td} max-w-[22rem]`}>
                <div className="flex items-baseline gap-2 min-w-0">
                  {l.s && <span className="shrink-0 font-bold text-rw-accent">{l.s}</span>}
                  <HubLink to={{ kind: "league", slug: l.u }} className="truncate">
                    {l.l}
                  </HubLink>
                </div>
                {l.h && l.h.length > 1 && <HistoryChain steps={l.h} current={l.u} small />}
              </td>
              <td className={`${td} text-rw-sub`}>{l.r ? regionName(l.r, l.r) : ""}</td>
              <td className={`${td} text-rw-muted`}>{l.from && l.to ? (l.from === l.to ? l.from : `${l.from}–${l.to}`) : ""}</td>
              <td className={`${td} text-rw-sub`}>{l.n}</td>
              <td className={`${td} text-rw-muted`}>{fmtNum(l.g)}</td>
            </tr>
          ))}
        </tbody>
      </STable>
      {n > 0 && rows.length > n && (
        <button type="button" onClick={() => setN(0)} className="text-xs text-rw-teal hover:underline">
          {tl("Show more ({n} left)", { n: rows.length - n })}
        </button>
      )}
    </div>
  );
};

export const LeaguePage: React.FC<{ slug: string; year?: string }> = ({ slug, year }) => {
  const state = useLoad(() => loadLeague(slug), [slug]);
  usePageTitle(state.data ? (year ? `${state.data.l} ${year}` : state.data.l) : undefined);
  return <Page state={state}>{(l) => <LeagueView l={l} year={year} />}</Page>;
};

const LeagueView: React.FC<{ l: HubLeague; year?: string }> = ({ l, year }) => {
  const years = [...new Set(l.events.map((e) => e.y))];
  // /league/<slug>/<year>: one season's tournaments (a year the league didn't play shows them all)
  const season = year && years.includes(year) ? year : undefined;
  const events = season ? l.events.filter((e) => e.y === season) : l.events;
  const pick = (y?: string) => navigateHub({ kind: "league", slug: l.u, year: y }, { replace: true });
  return (
    <div className="rw-page">
      <div className={card}>
        <h2 className="text-lg font-bold text-rw-text">
          {l.s && <span className="text-rw-accent mr-2">{l.s}</span>}
          {l.l}
        </h2>
        <p className="text-[11px] text-rw-sub">
          {[
            l.region ? regionName(l.region, l.region) : null,
            tn("{n} tournament", "{n} tournaments", l.events.length),
            years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : years[0] || null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <HubLink to={{ kind: "best", query: `league=${l.u}` }} className="mt-1 inline-block text-[11px] text-rw-teal hover:underline font-semibold">
          {tl("Best games in this league")}
        </HubLink>
        {l.history && l.history.length > 1 && (
          <div className="mt-2 space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-rw-muted">{tl("History")}</div>
            <HistoryChain steps={l.history} current={l.u} />
          </div>
        )}
      </div>
      {l.titles.length > 0 && (
        <Section title={tl("Most titles")}>
          <ul className="text-xs grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {l.titles.map((t) => (
              <li key={t.t} className="flex justify-between gap-2 min-w-0">
                <span className="truncate">
                  <TeamLink name={t.t} u={t.u} />
                </span>
                <span className="text-rw-accent font-bold shrink-0">{t.n}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-rw-muted">
            {tl(
              "Finals won (playoffs, championships and cups). Teams that changed names count as one.",
            )}
          </p>
        </Section>
      )}
      <Section title={season ? tl("{year} season", { year: season }) : tl("Every tournament")}>
        {years.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label={tl("Season")}>
            {[undefined, ...years].map((y) => (
              <button
                key={y || "all"}
                type="button"
                onClick={() => pick(y)}
                aria-pressed={season === y}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  season === y ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
                }`}
              >
                {y || tl("All seasons")}
              </button>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Tournament")}</th>
                <th className={`${th} hidden sm:table-cell`}>{tl("Dates")}</th>
                <th className={th}>{tl("Winner")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <LeagueEventRow key={e.u} e={e} />
              ))}
            </tbody>
          </STable>
        </div>
      </Section>
    </div>
  );
};

const LeagueEventRow: React.FC<{ e: HubLeague["events"][number] }> = ({
  e,
}) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <tr className="border-t border-rw-border">
      <td className={`${td} max-w-[12rem] sm:max-w-[16rem] truncate`}>
        <EventLink name={e.n} u={e.u} />
      </td>
      <td
        className={`${td} text-rw-muted hidden sm:table-cell whitespace-nowrap`}
        data-sort={e.st}
      >
        {fmtDate(e.st, false)}
        {e.en && e.en !== e.st ? ` – ${fmtDate(e.en)}` : ""}
      </td>
      <td className={`${td} max-w-[10rem] truncate`}>
        {e.w ? (
          hidden ? (
            <RevealButton onReveal={reveal} small />
          ) : (
            <span className="flex items-center gap-1">
              {!e.rs && <Crown className="w-3 h-3 text-rw-accent shrink-0" />}
              <TeamLink name={e.w} u={e.wu} />
              {e.rs ? <StandingsFirst /> : null}
            </span>
          )
        ) : (
          ""
        )}
      </td>
    </tr>
  );
};
