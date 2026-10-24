/** Stats hub front page and the tournament browser. */
import React, { useMemo, useState } from "react";
import { HomeStorylines } from "./Storylines";
import { AtStakeToday } from "./AtStake";
import type { Match } from "../../types";
import { Trophy, Swords, Medal, GitCompare, CalendarRange, Crown, Layers, History, ClipboardList, TrendingUp, Search, LayoutGrid, Flame, Crosshair, Globe } from "lucide-react";
import { tl, tn, tk, regionName } from "../../i18n";
import { loadEventsOfYear, loadHubHome, loadHubMeta, loadPatches } from "../../hub/data";
import { useRecentPages } from "../../hub/recent";
import { champName } from "../../champions";
import { ChampIcon } from "./ui";
import type { EventListItem, HubMeta } from "../../hub/types";
import { HubRoute } from "../../hub/route";
import { HubSearch } from "./HubSearch";
import { IS_WEB } from "../../platform";
import { card, EventLink, fmtDate, fmtNum, HubLink, Page, PlayerLink, RevealButton, StandingsFirst, Section, td, th, TeamLink, useHidden, useLoad, usePageTitle } from "./ui";
import { STable } from "../STable";

const QUICK: { to: HubRoute; label: string; sub: string; icon: React.ReactNode }[] = [
  { to: { kind: "rankings" }, label: tk("Power rankings"), sub: tk("Every team, every region, one scale"), icon: <TrendingUp className="w-4 h-4" /> },
  { to: { kind: "best" }, label: tk("Best games"), sub: tk("Highest-rated games and series"), icon: <Flame className="w-4 h-4" /> },
  { to: { kind: "tournaments" }, label: tk("Tournaments"), sub: tk("Every event since 2011"), icon: <CalendarRange className="w-4 h-4" /> },
  { to: { kind: "leagues" }, label: tk("Leagues"), sub: tk("Every season and its champion"), icon: <Layers className="w-4 h-4" /> },
  { to: { kind: "champions" }, label: tk("Champions"), sub: tk("Pick, ban and win rates"), icon: <Swords className="w-4 h-4" /> },
  { to: { kind: "patches" }, label: tk("Patches"), sub: tk("The pro meta on every patch"), icon: <History className="w-4 h-4" /> },
  { to: { kind: "records" }, label: tk("Records"), sub: tk("Fastest, longest, best games"), icon: <Medal className="w-4 h-4" /> },
  { to: { kind: "titles" }, label: tk("Titles"), sub: tk("Every champion, every league"), icon: <Trophy className="w-4 h-4" /> },
  { to: { kind: "compare" }, label: tk("Compare"), sub: tk("Any two teams or players"), icon: <GitCompare className="w-4 h-4" /> },
  { to: { kind: "prep" }, label: tk("Match prep"), sub: tk("Everything before a broadcast"), icon: <ClipboardList className="w-4 h-4" /> },
  { to: { kind: "finder" }, label: tk("Game finder"), sub: tk("Any game by team, champion, player"), icon: <Search className="w-4 h-4" /> },
  { to: { kind: "draft" }, label: tk("Draft board"), sub: tk("Plan a draft with both teams' pools"), icon: <LayoutGrid className="w-4 h-4" /> },
  { to: { kind: "counters" }, label: tk("Counter-picks"), sub: tk("Every pro lane matchup, by champion"), icon: <Crosshair className="w-4 h-4" /> },
  { to: { kind: "worlds" }, label: tk("Worlds, MSI & First Stand"), sub: tk("Winners, records and region stats"), icon: <Globe className="w-4 h-4" /> },
];

export const HubHome: React.FC<{ schedule?: Match[] }> = ({ schedule }) => {
  usePageTitle(tl("Pro Stats"));
  const meta = useLoad(loadHubMeta, []);
  const home = useLoad(loadHubHome, []);
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <h1 className="text-base font-bold text-rw-text">{tl("Every pro League of Legends game, in one place")}</h1>
        {meta.data && (
          <p className="text-[11px] text-rw-sub">
            {tl("{games} games · {events} tournaments · {players} players · {teams} teams · 2011 to today", {
              games: fmtNum(meta.data.games),
              events: fmtNum(meta.data.events),
              players: fmtNum(meta.data.players),
              teams: fmtNum(meta.data.teams),
            })}{" "}
            <HubLink to={{ kind: "about" }} className="text-rw-muted hover:text-rw-accent hover:underline">
              {tl("(games with a result; players and teams with full scoreboards)")}
            </HubLink>
          </p>
        )}
        <HubSearch big initial={IS_WEB ? new URLSearchParams(window.location.search).get("q") || "" : ""} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {QUICK.map((q) => (
          <HubLink key={q.label} to={q.to} className={`${card} p-3 hover:border-rw-accent/60 transition-colors block`}>
            <div className="flex items-center gap-1.5 text-rw-accent font-bold text-xs">
              {q.icon}
              {tl(q.label)}
            </div>
            <div className="text-[10px] text-rw-muted mt-0.5">{tl(q.sub)}</div>
          </HubLink>
        ))}
      </div>

      <RecentPages />
      {schedule && schedule.length > 0 && <AtStakeToday schedule={schedule} />}
      <HomeStorylines />
      <PatchChanges />

      <Page state={home}>
        {(h) => (
          <div className="grid gap-3 md:grid-cols-2">
            {h.now && h.now.length > 0 && (
              <Section title={tl("Happening now")}>
                <ul className="text-xs space-y-1.5">
                  {h.now.map((e) => (
                    <li key={e.u} className="flex items-center justify-between gap-2 min-w-0">
                      <EventLink name={e.n} u={e.u} />
                      <span className="text-rw-muted shrink-0">
                        {fmtDate(e.st, false)} – {fmtDate(e.en, false)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section title={tl("Latest tournaments")}>
              <ul className="text-xs space-y-1.5">
                {h.latest.map((e) => (
                  <LatestRow key={e.u} e={e} />
                ))}
              </ul>
            </Section>
            <Section title={tl("Most games in {year}", { year: h.year })}>
              <STable className="w-full text-xs">
                <tbody>
                  {h.busiest.map((p, i) => (
                    <tr key={p.n + i} className="border-t border-rw-border first:border-0">
                      <td className={td}>
                        <PlayerLink name={p.n} u={p.u} />
                      </td>
                      <td className={`${td} text-rw-sub`}>{tn("{n} game", "{n} games", p.g)}</td>
                      <td className={`${td} text-rw-muted`}>{tl("KDA {n}", { n: p.kda })}</td>
                    </tr>
                  ))}
                </tbody>
              </STable>
            </Section>
          </div>
        )}
      </Page>
      <p className="text-[10px] text-rw-muted text-center">
        {tl("Data: Leaguepedia (CC BY-SA 3.0), updated through the day. Game statistics belong to Riot Games.")}
      </p>
    </div>
  );
};

/** The pages opened last on this device, as chips. */
const RecentPages: React.FC = () => {
  const recent = useRecentPages();
  if (!recent.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-rw-muted uppercase tracking-wider font-bold text-[10px] mr-1">{tl("Recently viewed")}</span>
      {recent.slice(0, 8).map((r) => (
        <HubLink key={hubPathOf(r.route)} to={r.route} className="px-2 py-0.5 rounded-full border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-line max-w-[14rem] truncate">
          {r.title}
        </HubLink>
      ))}
    </div>
  );
};
const hubPathOf = (r: HubRoute) => JSON.stringify(r);

/** One line on the newest patch: the champions that rose and fell the most against the patch before. */
const PatchChanges: React.FC = () => {
  const state = useLoad(loadPatches, []);
  const p = (state.data || []).find((x) => (x.up && x.up.length) || (x.down && x.down.length));
  if (!p) return null;
  const list = (moves: NonNullable<typeof p.up>, up: boolean) =>
    moves.slice(0, 4).map(([c, now, was]) => (
      <span key={c} className="inline-flex items-center gap-1 mr-2 whitespace-nowrap">
        <ChampIcon name={c} size={16} />
        <span className="text-rw-text">{champName(c)}</span>
        <span className={`tabular-nums ${up ? "text-rw-teal" : "text-rw-red"}`}>
          {up ? "▲" : "▼"} {Math.round(Math.abs(now - was) * 100)}%
        </span>
      </span>
    ));
  return (
    <Section title={tl("What changed on patch {patch}", { patch: p.p })} right={<HubLink to={{ kind: "patches" }} className="text-[11px] text-rw-teal hover:underline">{tl("Patches")}</HubLink>}>
      <div className="text-xs space-y-1">
        {p.up && p.up.length > 0 && (
          <div className="flex flex-wrap items-center gap-y-1">
            <span className="text-rw-muted mr-2">{tl("Up")}</span>
            {list(p.up, true)}
          </div>
        )}
        {p.down && p.down.length > 0 && (
          <div className="flex flex-wrap items-center gap-y-1">
            <span className="text-rw-muted mr-2">{tl("Down")}</span>
            {list(p.down, false)}
          </div>
        )}
        <p className="text-[10px] text-rw-muted">{tl("Pick-or-ban rate against patch {prev}", { prev: p.prev || "" })}</p>
      </div>
    </Section>
  );
};

const LatestRow: React.FC<{ e: EventListItem }> = ({ e }) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <li className="flex items-center justify-between gap-2 min-w-0">
      <span className="truncate min-w-0">
        <EventLink name={e.n} u={e.u} />
        <span className="text-rw-muted"> · {fmtDate(e.en, false)}</span>
      </span>
      {e.w && (
        <span className="shrink-0 flex items-center gap-1 text-rw-accent">
          {!e.rs && <Crown className="w-3 h-3" />}
          {hidden ? <RevealButton onReveal={reveal} small /> : <TeamLink name={e.w} u={e.wu} className="text-rw-accent hover:underline" />}
          {e.rs ? <span className="hidden sm:inline"><StandingsFirst /></span> : null}
        </span>
      )}
    </li>
  );
};

// ── Tournament browser ────────────────────────────────────────────────────

export const EventsBrowse: React.FC<{ year?: string; meta: HubMeta | null; onYear: (y: string) => void }> = ({ year, meta, onYear }) => {
  const years = meta?.years || [];
  const thisYear = String(new Date().getFullYear());
  const y = year || (years.includes(thisYear) ? thisYear : years[0]) || thisYear;
  usePageTitle(tl("Tournaments in {year}", { year: y }));
  const state = useLoad(() => loadEventsOfYear(y), [y]);
  const [scope, setScope] = useState<"main" | "all">("main");
  const [q, setQ] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={y}
          onChange={(e) => onYear(e.target.value)}
          aria-label={tl("Year")}
          className="bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-rw-text"
        >
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-rw-border overflow-hidden">
          {(["main", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-2.5 py-1.5 ${scope === s ? "bg-rw-accent text-rw-bg font-bold" : "text-rw-sub"}`}
            >
              {s === "main" ? tl("Main leagues & internationals") : tl("Everything")}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tl("Filter by name or league…")}
          aria-label={tl("Filter by name or league…")}
          className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-rw-text placeholder-rw-muted flex-1 min-w-[10rem]"
        />
      </div>
      <Page state={state}>{(list) => <EventsTable list={list} scope={scope} q={q} />}</Page>
    </div>
  );
};

const EventsTable: React.FC<{ list: EventListItem[]; scope: "main" | "all"; q: string }> = ({ list, scope, q }) => {
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return list.filter((e) => {
      if (qq) return `${e.n} ${e.l || ""} ${e.r || ""}`.toLowerCase().includes(qq);
      if (e.p) return false; // stages are listed on their event's page
      return scope === "all" || (e.lv === "Primary" && !e.q);
    });
  }, [list, scope, q]);
  if (rows.length === 0) return <p className="text-xs text-rw-sub py-6 text-center">{tl("No tournaments match.")}</p>;
  return (
    <div className={`${card} overflow-x-auto`}>
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Tournament")}</th>
            <th className={th}>{tl("Dates")}</th>
            <th className={`${th} hidden sm:table-cell`}>{tl("Region")}</th>
            <th className={th}>{tl("Winner")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <BrowseRow key={e.u} e={e} />
          ))}
        </tbody>
      </STable>
    </div>
  );
};

const BrowseRow: React.FC<{ e: EventListItem }> = ({ e }) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <tr className="border-t border-rw-border">
      <td className={`${td} max-w-[16rem] truncate`}>
        <EventLink name={e.n} u={e.u} />
      </td>
      <td className={`${td} text-rw-muted`} data-sort={e.st}>
        {fmtDate(e.st, false)}
        {e.en && e.en !== e.st ? ` – ${fmtDate(e.en, false)}` : ""}
      </td>
      <td className={`${td} text-rw-sub max-w-[8rem] truncate hidden sm:table-cell`}>{e.r ? regionName(e.r, e.r) : ""}</td>
      <td className={`${td} max-w-[18rem] truncate`}>
        {e.w ? hidden ? <RevealButton onReveal={reveal} small /> : <TeamLink name={e.w} u={e.wu} /> : ""}
        {e.w && !hidden && e.rs ? <> <StandingsFirst /></> : null}
      </td>
      <td className={`${td} text-rw-muted`}>{e.g || ""}</td>
    </tr>
  );
};
