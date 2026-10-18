/** Full histories, loaded on demand: every series of a team, every game of a player, every meeting of two teams. */
import React, { useMemo, useState } from "react";
import { ListOrdered } from "lucide-react";
import { tl, tn, tc, roleName, stageLabel } from "../../i18n";
import { champName } from "../../champions";
import { loadPlayerGames, loadTeamSeries } from "../../hub/data";
import type { PlayerGameRow, TeamSeriesRow } from "../../hub/types";
import { ChampIcon, EventLink, Failed, fmtDate, HubLink, isFresh, Loading, RevealButton, Section, TeamLink, useHidden, useLoad } from "./ui";

const PAGE = 50;
const btn = "px-2.5 py-1 rounded-lg border border-rw-border hover:border-rw-accent/60 text-rw-accent text-xs font-semibold";
const select = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-xs text-rw-text";

/** A "Show ..." button that turns into the section once pressed (so the file loads only when wanted). */
const OnDemand: React.FC<{ title: string; label: string; children: () => React.ReactNode }> = ({ title, label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <Section title={title}>
      {open ? (
        children()
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${btn} flex items-center gap-1.5`}>
          <ListOrdered className="w-3.5 h-3.5" />
          {label}
        </button>
      )}
    </Section>
  );
};

// ── Team: every series ────────────────────────────────────────────────────

const SeriesList: React.FC<{ rows: TeamSeriesRow[]; teamName: string; spoilerKey: string; showOpp?: boolean }> = ({ rows, teamName, spoilerKey, showOpp = true }) => {
  const [hidden, reveal] = useHidden(spoilerKey, rows.find((r) => isFresh(r[0]))?.[0]);
  const [n, setN] = useState(PAGE);
  return (
    <div className="space-y-2">
      {hidden && (
        <div className="flex items-center gap-2 text-[11px] text-rw-muted">
          {tl("Results from the last two weeks are hidden.")} <RevealButton onReveal={reveal} small />
        </div>
      )}
      <ul className="text-xs space-y-1">
        {rows.slice(0, n).map((r, i) => {
          const hide = hidden && isFresh(r[0]);
          const won = r[3] > r[4];
          return (
            <li key={i} className="flex items-center justify-between gap-2 min-w-0">
              <span className="truncate min-w-0">
                <span className={`font-bold tabular-nums ${hide ? "text-rw-muted" : won ? "text-rw-teal" : "text-rw-red"}`}>
                  {hide ? "?" : `${won ? tc("short result", "W") : tc("short result", "L")} ${r[3]}-${r[4]}`}
                </span>{" "}
                {showOpp && (
                  <>
                    vs <TeamLink name={r[1]} u={r[2]} />{" "}
                  </>
                )}
                {r[9] !== teamName && <span className="text-rw-muted text-[10px]">({tl("as {name}", { name: r[9] })}) </span>}
                <span className="text-rw-muted">
                  · <EventLink name={r[5]} u={r[6]} className="text-rw-muted hover:text-rw-accent hover:underline" />
                  {r[8] ? ` · ${stageLabel(r[8])}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                {fmtDate(r[0])}
                {r[7] && (
                  <HubLink to={{ kind: "match", slug: r[7] }} className="text-rw-teal hover:underline">
                    {tl("Details")}
                  </HubLink>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > n && (
        <button type="button" onClick={() => setN((x) => x + PAGE * 4)} className="text-[11px] text-rw-teal hover:underline">
          {tl("Show more ({n} left)", { n: rows.length - n })}
        </button>
      )}
    </div>
  );
};

const TeamSeriesBody: React.FC<{ slug: string; teamName: string }> = ({ slug, teamName }) => {
  const state = useLoad(() => loadTeamSeries(slug), [slug]);
  const [year, setYear] = useState("all");
  const [q, setQ] = useState("");
  const years = useMemo(() => [...new Set((state.data || []).map((r) => r[0].slice(0, 4)))], [state.data]);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (state.data || []).filter((r) => (year === "all" || r[0].startsWith(year)) && (!qq || r[1].toLowerCase().includes(qq) || r[5].toLowerCase().includes(qq)));
  }, [state.data, year, q]);
  // the same spoiler switch as the list below: while its fresh results are hidden, so is the count of wins
  const [seriesHidden] = useHidden(`teamseries:${slug}:${year}:${q}`, rows.find((r) => isFresh(r[0]))?.[0]);
  if (state.loading) return <Loading />;
  if (state.error || !state.data) return <Failed missing={state.missing} />;
  const won = rows.filter((r) => r[3] > r[4]).length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={tl("Year")} className={select}>
          <option value="all">{tl("All years")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tl("Filter by opponent or tournament…")}
          aria-label={tl("Filter by opponent or tournament…")}
          className={`${select} flex-1 min-w-[10rem] placeholder-rw-muted`}
        />
        <span className="text-[11px] text-rw-sub">
          {tn("{n} series", "{n} series", rows.length)}
          {!seriesHidden && <> · {tl("{w} won", { w: won })}</>}
        </span>
      </div>
      <SeriesList rows={rows} teamName={teamName} spoilerKey={`teamseries:${slug}:${year}:${q}`} />
    </div>
  );
};

export const TeamSeriesArchive: React.FC<{ slug: string; teamName: string }> = ({ slug, teamName }) => (
  <OnDemand title={tl("Every series")} label={tl("Show every series this team played")}>
    {() => <TeamSeriesBody slug={slug} teamName={teamName} />}
  </OnDemand>
);

// ── Compare: every meeting of two teams ───────────────────────────────────

export const HeadToHeadSeries: React.FC<{ a: string; b: string; aName: string; bName: string }> = ({ a, b, aName, bName }) => {
  const state = useLoad(() => loadTeamSeries(a), [a]);
  const rows = useMemo(() => (state.data || []).filter((r) => r[2] === b), [state.data, b]);
  const [hidden] = useHidden(`h2h:${a}:${b}`, rows.find((r) => isFresh(r[0]))?.[0]);
  if (state.loading) return <Loading />;
  if (state.error) return null;
  const wa = rows.filter((r) => r[3] > r[4]).length;
  return (
    <Section title={tl("Every series between them")}>
      {rows.length === 0 ? (
        <p className="text-xs text-rw-sub">{tl("These two teams have never played each other.")}</p>
      ) : (
        <>
          <p className="text-sm font-bold text-rw-text">
            {hidden ? tn("{n} series", "{n} series", rows.length) : `${aName} ${wa} – ${rows.length - wa} ${bName}`}
          </p>
          <SeriesList rows={rows} teamName={aName} spoilerKey={`h2h:${a}:${b}`} showOpp={false} />
        </>
      )}
    </Section>
  );
};

// ── Player: every game ────────────────────────────────────────────────────

const PlayerGamesBody: React.FC<{ slug: string }> = ({ slug }) => {
  const state = useLoad(() => loadPlayerGames(slug), [slug]);
  const [year, setYear] = useState("all");
  const [champ, setChamp] = useState("all");
  const [n, setN] = useState(PAGE);
  const data = state.data || [];
  const years = useMemo(() => [...new Set(data.map((r) => r[0].slice(0, 4)))], [data]);
  const champs = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of data) if (r[2]) count.set(r[2], (count.get(r[2]) || 0) + 1);
    return [...count.entries()].sort((x, y) => y[1] - x[1]);
  }, [data]);
  const rows = useMemo(() => data.filter((r: PlayerGameRow) => (year === "all" || r[0].startsWith(year)) && (champ === "all" || r[2] === champ)), [data, year, champ]);
  const [hidden, reveal] = useHidden(`playergames:${slug}:${year}:${champ}`, rows.find((r) => isFresh(r[0]))?.[0]);
  if (state.loading) return <Loading />;
  if (state.error || !state.data) return <Failed missing={state.missing} />;
  const won = rows.filter((r) => r[6]).length;
  const k = rows.reduce((s, r) => s + r[3], 0);
  const d = rows.reduce((s, r) => s + r[4], 0);
  const a = rows.reduce((s, r) => s + r[5], 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => { setYear(e.target.value); setN(PAGE); }} aria-label={tl("Year")} className={select}>
          <option value="all">{tl("All years")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={champ} onChange={(e) => { setChamp(e.target.value); setN(PAGE); }} aria-label={tl("Champion")} className={select}>
          <option value="all">{tl("All champions")}</option>
          {champs.map(([c, cnt]) => (
            <option key={c} value={c}>
              {champName(c)} ({cnt})
            </option>
          ))}
        </select>
        <span className="text-[11px] text-rw-sub">
          {tn("{n} game", "{n} games", rows.length)}
          {!hidden && rows.length > 0 && <> · {tl("{pct} win rate", { pct: `${Math.round((won / rows.length) * 100)}%` })}</>}
          {!hidden && rows.length > 0 && <> · {tl("KDA {n}", { n: ((k + a) / Math.max(d, 1)).toFixed(2) })}</>}
        </span>
        {hidden && <RevealButton onReveal={reveal} small />}
      </div>
      <ul className="text-xs space-y-1">
        {rows.slice(0, n).map((r, i) => {
          const hide = hidden && isFresh(r[0]);
          return (
            <li key={i} className="flex items-center justify-between gap-2 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`w-3.5 shrink-0 font-bold ${hide ? "text-rw-muted" : r[6] ? "text-rw-teal" : "text-rw-red"}`}>
                  {hide ? "?" : r[6] ? tc("short result", "W") : tc("short result", "L")}
                </span>
                <ChampIcon name={r[2]} size={18} />
                <span className="truncate min-w-0">
                  <span className="text-rw-text tabular-nums">{hide ? "?/?/?" : `${r[3]}/${r[4]}/${r[5]}`}</span>{" "}
                  <span className="text-rw-sub">
                    vs {r[8]}
                    {r[10] ? ` · ${roleName(r[10])}` : ""}
                  </span>{" "}
                  <span className="text-rw-muted">
                    · <EventLink name={r[9]} u={r[11]} className="text-rw-muted hover:text-rw-accent hover:underline" />
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                {fmtDate(r[0])}
                {r[1] && (
                  <HubLink to={{ kind: "match", slug: r[1] }} className="text-rw-teal hover:underline">
                    {tl("Details")}
                  </HubLink>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > n && (
        <button type="button" onClick={() => setN((x) => x + PAGE * 4)} className="text-[11px] text-rw-teal hover:underline">
          {tl("Show more ({n} left)", { n: rows.length - n })}
        </button>
      )}
    </div>
  );
};

export const PlayerGamesArchive: React.FC<{ slug: string }> = ({ slug }) => (
  <OnDemand title={tl("Every game")} label={tl("Show every game, with filters for year and champion")}>
    {() => <PlayerGamesBody slug={slug} />}
  </OnDemand>
);

