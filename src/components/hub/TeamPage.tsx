/** Team page: record, titles, tournaments with placements, roster by year, rivals and champions. */
import React, { useState } from "react";
import { Trophy } from "lucide-react";
import { tl, roleName, regionName, eventTitle } from "../../i18n";
import { winRate } from "../../stats";
import { loadHubTeam } from "../../hub/data";
import type { HubTeam } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { TeamSeriesArchive } from "./Archives";
import { TeamPeriodStats } from "./PeriodStats";
import { TeamRanks } from "./Ranks";
import { OwnStorylines } from "./Storylines";
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

export const TeamPage: React.FC<{ slug: string }> = ({ slug }) => {
  const state = useLoad(() => loadHubTeam(slug), [slug]);
  usePageTitle(state.data?.name);
  useDDragon();
  return <Page state={state}>{(t) => <TeamView t={t} />}</Page>;
};

const TeamView: React.FC<{ t: HubTeam }> = ({ t }) => {
  const worlds = t.titles.filter((x) => x.kind === "Worlds").length;
  const msi = t.titles.filter((x) => x.kind === "MSI").length;
  const firstStand = t.titles.filter((x) => x.kind === "First Stand").length;
  const oldNames = t.names.filter((n) => n.n !== t.name);
  const [allEvents, setAllEvents] = useState(false);
  const [recentHidden, revealRecent] = useHidden(`team-recent:${t.u}`, t.recent[0]?.date);
  const events = allEvents ? t.events : t.events.slice(0, 15);
  return (
    <div className="space-y-3">
      <div className={card}>
        <h2 className="text-lg font-bold text-[#f0e6d2]">
          {t.name}
          {t.codes.length > 0 && <span className="text-[#7e8e9f] text-sm font-semibold ml-2">{t.codes.slice(0, 3).join(" · ")}</span>}
        </h2>
        <p className="text-[11px] text-[#7e8e9f]">
          {[t.region ? regionName(t.region, t.region) : null, tl("Pro games from {from} to {to}", { from: fmtDate(t.from), to: fmtDate(t.to) }), t.disbanded ? tl("Disbanded") : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {oldNames.length > 0 && (
          <p className="text-[11px] text-[#9bb3c9] mt-1">
            {tl("Also played as:")}{" "}
            {oldNames.map((n, i) => (
              <span key={n.n + n.from}>
                {i > 0 && ", "}
                <span className="text-[#f0e6d2]">{n.n}</span> ({n.from.slice(0, 4)}
                {n.to.slice(0, 4) !== n.from.slice(0, 4) ? `–${n.to.slice(0, 4)}` : ""})
              </span>
            ))}
            {". "}
            {tl("All of it counts here.")}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <Stat label={tl("Games")} value={`${fmtNum(t.w)}-${fmtNum(t.g - t.w)}`} sub={tl("{pct} win rate", { pct: winRate(t.w, t.g) })} />
          <Stat label={tl("Series")} value={`${t.sw}-${t.sg - t.sw}`} sub={tl("{pct} won", { pct: winRate(t.sw, t.sg) })} />
          <Stat
            label={tl("Titles")}
            value={t.titles.length}
            sub={
              worlds || msi || firstStand
                ? [tl("{n} Worlds", { n: worlds }), tl("{n} MSI", { n: msi }), firstStand ? tl("{n} First Stand", { n: firstStand }) : ""].filter(Boolean).join(" · ")
                : tl("finals won")
            }
          />
          <Stat label={tl("Best streak")} value={t.bestStreak ? tl("{n} wins", { n: t.bestStreak.n }) : "–"} sub={t.bestStreak ? fmtDate(t.bestStreak.date) : undefined} />
          <Stat label={tl("Avg game")} value={tl("{n} min", { n: t.avgMin })} />
          {t.kills != null && <Stat label={tl("Kills / game")} value={t.kills} sub={tl("{n} deaths", { n: t.deaths ?? 0 })} />}
          {t.obj && <Stat label={tl("Dragons / game")} value={t.obj.dragons} sub={tl("{n} barons", { n: t.obj.barons })} />}
          {t.earnings ? <Stat label={tl("Prize money")} value={fmtUsd(t.earnings)} sub={tl("as listed in US dollars")} /> : null}
          {t.sides && t.sides[0] + t.sides[2] > 0 && (
            <Stat
              label={tl("Blue / red side")}
              value={`${winRate(t.sides[1], t.sides[0])} / ${winRate(t.sides[3], t.sides[2])}`}
              sub={tl("{b} blue games · {r} red", { b: fmtNum(t.sides[0]), r: fmtNum(t.sides[2]) })}
            />
          )}
          {t.obj && (
            <Stat
              label={tl("Gold diff / game")}
              value={`${t.obj.golddiff >= 0 ? "+" : ""}${fmtNum(Math.round(t.obj.golddiff))}`}
              sub={tl("{n} towers", { n: t.obj.towers })}
            />
          )}
        </div>
      </div>

      <OwnStorylines notes={t.notes} spoilerKey={`notes:team:${t.u}`} share={`${t.u}-storylines`} />
      <TeamPeriodStats slug={t.u} />
      <TeamRanks slug={t.u} events={t.events} />

      {t.titles.length > 0 && (
        <Section title={tl("Titles")}>
          <ul className="text-xs space-y-1">
            {t.titles.map((x) => (
              <li key={x.t + x.date} className="flex justify-between gap-2">
                <span className="text-[#f0e6d2] min-w-0 truncate">
                  <Trophy className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-[#c8aa6e]" : "text-[#7e8e9f]"}`} />
                  <EventLink name={eventTitle(x.t)} u={x.e} />
                  {x.as !== t.name && <span className="text-[#7e8e9f]"> ({tl("as {name}", { name: x.as })})</span>}
                </span>
                <span className="text-[#7e8e9f] shrink-0">
                  {x.score} vs {x.l}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Section title={tl("Recent series")} right={recentHidden ? <RevealButton onReveal={revealRecent} small /> : undefined}>
          {recentHidden ? (
            <p className="text-[11px] text-[#7e8e9f] italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <ul className="text-xs space-y-1">
              {t.recent.map((r, i) => (
                <li key={i} className="flex justify-between gap-2 min-w-0">
                  <span className="truncate min-w-0">
                    <span className={r.us > r.them ? "text-[#0ac8b9] font-bold" : "text-[#e84057] font-bold"}>
                      {r.us > r.them ? "W" : "L"} {r.us}-{r.them}
                    </span>{" "}
                    {r.g ? (
                      <HubLink to={{ kind: "match", slug: r.g }}>vs {r.opp}</HubLink>
                    ) : (
                      <span className="text-[#f0e6d2]">vs {r.opp}</span>
                    )}
                    <span className="text-[#7e8e9f]"> · {r.en}</span>
                  </span>
                  <span className="text-[#7e8e9f] shrink-0">{fmtDate(r.date, false)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={tl("By year")}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Year")}</th>
                <th className={th}>{tl("Record")}</th>
                <th className={th}>{tl("Win %")}</th>
              </tr>
            </thead>
            <tbody>
              {t.years.map((y) => (
                <tr key={y.y} className="border-t border-[#1e282d]">
                  <td className={`${td} text-[#f0e6d2]`}>
                    {y.y}
                    {y.as !== t.name && <span className="text-[#7e8e9f] text-[10px]"> as {y.as}</span>}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {y.w}-{y.g - y.w}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{winRate(y.w, y.g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      {t.events.length > 0 && (
        <Section
          title={tl("Tournaments")}
          right={
            t.events.length > 15 ? (
              <button type="button" onClick={() => setAllEvents((v) => !v)} className="text-[11px] text-[#0ac8b9] hover:underline">
                {allEvents ? tl("Show fewer") : tl("Show all {n}", { n: t.events.length })}
              </button>
            ) : undefined
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>{tl("Tournament")}</th>
                  <th className={th}>{tl("Place")}</th>
                  <th className={th}>{tl("Series")}</th>
                  <th className={th}>{tl("Games")}</th>
                  <th className={th}>{tl("Prize")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((x) => (
                  <EventRow key={x.e} x={x} teamName={t.name} />
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <TeamSeriesArchive slug={t.u} teamName={t.name} />

      <Section title={tl("Roster")}>
        <div className="space-y-2">
          {t.roster.map((yr) => (
            <div key={yr.y} className="text-xs">
              <span className="text-[#7e8e9f] font-semibold mr-2">{yr.y}</span>
              {yr.p.map((p, i) => (
                <span key={p.n + i}>
                  {i > 0 && <span className="text-[#3a4a5a]"> · </span>}
                  <PlayerLink name={p.n} u={p.u} />
                  <span className="text-[#7e8e9f]"> {roleName(p.r)}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title={tl("Against other teams")}>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Opponent")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
                <th className={th}>{tl("Last met")}</th>
              </tr>
            </thead>
            <tbody>
              {t.opps.map((o) => (
                <tr key={o.n} className="border-t border-[#1e282d]">
                  <td className={td}>
                    <TeamLink name={o.n} u={o.u} />
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {o.w}-{o.g - o.w}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{winRate(o.w, o.g)}</td>
                  <td className={`${td} text-[#7e8e9f]`}>{fmtDate(o.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title={tl("Most picked champions")}>
          <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
            {t.champs.map((c) => (
              <li key={c.c} className="flex justify-between gap-1 min-w-0">
                <ChampLink name={c.c} size={16} />
                <span className="text-[#7e8e9f] shrink-0">
                  {c.g} · {winRate(c.w, c.g)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={tl("Most banned by them")}>
          <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
            {t.bans.map((c) => (
              <li key={c.c} className="flex justify-between gap-1 min-w-0">
                <ChampLink name={c.c} size={16} />
                <span className="text-[#7e8e9f] shrink-0">{c.g}</span>
              </li>
            ))}
          </ul>
        </Section>
        {t.bansVs && t.bansVs.length > 0 && (
          <Section title={tl("Most banned against them")}>
            <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
              {t.bansVs.map((c) => (
                <li key={c.c} className="flex justify-between gap-1 min-w-0">
                  <ChampLink name={c.c} size={16} />
                  <span className="text-[#7e8e9f] shrink-0">{c.g}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
};

const EventRow: React.FC<{ x: HubTeam["events"][number]; teamName: string }> = ({ x, teamName }) => {
  const [hidden, reveal] = useHidden(`team-event:${x.e}`, x.date);
  return (
    <tr className="border-t border-[#1e282d]">
      <td className={`${td} max-w-[14rem] truncate`}>
        <EventLink name={x.en} u={x.e} />
        {x.as && x.as !== teamName && <span className="text-[#7e8e9f] text-[10px]"> {tl("as {name}", { name: x.as })}</span>}
      </td>
      <td className={`${td} ${x.pl === "1" ? "text-[#c8aa6e] font-bold" : "text-[#9bb3c9]"}`}>
        {hidden ? <RevealButton onReveal={reveal} small /> : x.pl || "–"}
      </td>
      <td className={`${td} text-[#9bb3c9]`}>{hidden ? "–" : `${x.sw}-${x.sg - x.sw}`}</td>
      <td className={`${td} text-[#9bb3c9]`}>{hidden ? "–" : `${x.w}-${x.g - x.w}`}</td>
      <td className={`${td} text-[#7e8e9f]`}>{x.usd && !hidden ? fmtUsd(x.usd) : ""}</td>
    </tr>
  );
};

