/** Stats hub front page and the tournament browser. */
import React, { useMemo, useState } from "react";
import { Trophy, Swords, Medal, GitCompare, CalendarRange, Crown, Layers, History } from "lucide-react";
import { tl, tn, tk, regionName } from "../../i18n";
import { loadEventsOfYear, loadHubHome, loadHubMeta } from "../../hub/data";
import type { EventListItem, HubMeta } from "../../hub/types";
import { HubRoute } from "../../hub/route";
import { HubSearch } from "./HubSearch";
import { card, EventLink, fmtDate, fmtNum, HubLink, Page, PlayerLink, RevealButton, Section, td, th, TeamLink, useHidden, useLoad, usePageTitle } from "./ui";

const QUICK: { to: HubRoute; label: string; sub: string; icon: React.ReactNode }[] = [
  { to: { kind: "tournaments" }, label: tk("Tournaments"), sub: tk("Every event since 2011"), icon: <CalendarRange className="w-4 h-4" /> },
  { to: { kind: "leagues" }, label: tk("Leagues"), sub: tk("Every season and its champion"), icon: <Layers className="w-4 h-4" /> },
  { to: { kind: "champions" }, label: tk("Champions"), sub: tk("Pick, ban and win rates"), icon: <Swords className="w-4 h-4" /> },
  { to: { kind: "patches" }, label: tk("Patches"), sub: tk("The pro meta on every patch"), icon: <History className="w-4 h-4" /> },
  { to: { kind: "records" }, label: tk("Records"), sub: tk("Fastest, longest, best games"), icon: <Medal className="w-4 h-4" /> },
  { to: { kind: "titles" }, label: tk("Titles"), sub: tk("Every champion, every league"), icon: <Trophy className="w-4 h-4" /> },
  { to: { kind: "compare" }, label: tk("Compare"), sub: tk("Any two teams or players"), icon: <GitCompare className="w-4 h-4" /> },
];

export const HubHome: React.FC = () => {
  usePageTitle(tl("Pro Stats"));
  const meta = useLoad(loadHubMeta, []);
  const home = useLoad(loadHubHome, []);
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <h2 className="text-base font-bold text-[#f0e6d2]">{tl("Every pro League of Legends game, in one place")}</h2>
        {meta.data && (
          <p className="text-[11px] text-[#9bb3c9]">
            {tl("{games} games · {events} tournaments · {players} players · {teams} teams · 2011 to today", {
              games: fmtNum(meta.data.games),
              events: fmtNum(meta.data.events),
              players: fmtNum(meta.data.players),
              teams: fmtNum(meta.data.teams),
            })}
          </p>
        )}
        <HubSearch big />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {QUICK.map((q) => (
          <HubLink key={q.label} to={q.to} className={`${card} p-3 hover:border-[#c8aa6e]/60 transition-colors block`}>
            <div className="flex items-center gap-1.5 text-[#c8aa6e] font-bold text-xs">
              {q.icon}
              {tl(q.label)}
            </div>
            <div className="text-[10px] text-[#7e8e9f] mt-0.5">{tl(q.sub)}</div>
          </HubLink>
        ))}
      </div>

      <Page state={home}>
        {(h) => (
          <div className="grid gap-3 md:grid-cols-2">
            {h.now && h.now.length > 0 && (
              <Section title={tl("Happening now")}>
                <ul className="text-xs space-y-1.5">
                  {h.now.map((e) => (
                    <li key={e.u} className="flex items-center justify-between gap-2 min-w-0">
                      <EventLink name={e.n} u={e.u} />
                      <span className="text-[#7e8e9f] shrink-0">
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
              <table className="w-full text-xs">
                <tbody>
                  {h.busiest.map((p, i) => (
                    <tr key={p.n + i} className="border-t border-[#1e282d] first:border-0">
                      <td className={td}>
                        <PlayerLink name={p.n} u={p.u} />
                      </td>
                      <td className={`${td} text-[#9bb3c9]`}>{tn("{n} game", "{n} games", p.g)}</td>
                      <td className={`${td} text-[#7e8e9f]`}>{tl("KDA {n}", { n: p.kda })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>
        )}
      </Page>
      <p className="text-[10px] text-[#7e8e9f] text-center">
        {tl("Data: Leaguepedia (CC BY-SA 3.0), rebuilt every night. Game statistics belong to Riot Games.")}
      </p>
    </div>
  );
};

const LatestRow: React.FC<{ e: EventListItem }> = ({ e }) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <li className="flex items-center justify-between gap-2 min-w-0">
      <span className="truncate min-w-0">
        <EventLink name={e.n} u={e.u} />
        <span className="text-[#7e8e9f]"> · {fmtDate(e.en, false)}</span>
      </span>
      {e.w && (
        <span className="shrink-0 flex items-center gap-1 text-[#c8aa6e]">
          <Crown className="w-3 h-3" />
          {hidden ? <RevealButton onReveal={reveal} small /> : <TeamLink name={e.w} u={e.wu} className="text-[#c8aa6e] hover:underline" />}
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
          className="bg-[#091428] border border-[#1e282d] rounded-lg px-2 py-1.5 text-[#f0e6d2]"
        >
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-[#1e282d] overflow-hidden">
          {(["main", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-2.5 py-1.5 ${scope === s ? "bg-[#c8aa6e] text-[#091428] font-bold" : "text-[#9bb3c9]"}`}
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
          className="bg-[#091428] border border-[#1e282d] rounded-lg px-2.5 py-1.5 text-[#f0e6d2] placeholder-[#7e8e9f] flex-1 min-w-[10rem]"
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
  if (rows.length === 0) return <p className="text-xs text-[#9bb3c9] py-6 text-center">{tl("No tournaments match.")}</p>;
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Tournament")}</th>
            <th className={th}>{tl("Dates")}</th>
            <th className={th}>{tl("Region")}</th>
            <th className={th}>{tl("Winner")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <BrowseRow key={e.u} e={e} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

const BrowseRow: React.FC<{ e: EventListItem }> = ({ e }) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <tr className="border-t border-[#1e282d]">
      <td className={`${td} max-w-[16rem] truncate`}>
        <EventLink name={e.n} u={e.u} />
      </td>
      <td className={`${td} text-[#7e8e9f]`}>
        {fmtDate(e.st, false)}
        {e.en && e.en !== e.st ? ` – ${fmtDate(e.en, false)}` : ""}
      </td>
      <td className={`${td} text-[#9bb3c9] max-w-[8rem] truncate`}>{e.r ? regionName(e.r, e.r) : ""}</td>
      <td className={`${td} max-w-[10rem] truncate`}>{e.w ? hidden ? <RevealButton onReveal={reveal} small /> : <TeamLink name={e.w} u={e.wu} /> : ""}</td>
      <td className={`${td} text-[#7e8e9f]`}>{e.g || ""}</td>
    </tr>
  );
};
