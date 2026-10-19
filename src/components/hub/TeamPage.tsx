/** Team page: record, titles, tournaments with placements, roster by year, rivals and champions. */
import React, { useState } from "react";
import { Trophy } from "lucide-react";
import { tl, roleName, regionName, eventTitle, tc } from "../../i18n";
import { winRate } from "../../stats";
import { loadHubTeam } from "../../hub/data";
import { currentHubRoute, navigateHub } from "../../hub/route";
import type { HubTeam } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { TeamSeriesArchive } from "./Archives";
import { TeamPeriodStats } from "./PeriodStats";
import { TeamRanks } from "./Ranks";
import { OwnStorylines } from "./Storylines";
import { CaptureContext, card, ChampLink, EventLink, fmtDate, fmtNum, fmtUsd, HubLink, Page, PlayerLink, RevealButton, Section, Stat, td, TeamLink, th, useHidden, useLoad, usePageTitle, PhotosLink } from "./ui";
import { ratingTextClass } from "./BestPage";
import { Sparkline } from "./Sparkline";
import { STable } from "../STable";

export const TeamPage: React.FC<{ slug: string }> = ({ slug }) => {
  // reached by an old or short address (/team/hle): show the team's own address, once this team's file is in and
  // only while its page is still the one open (moving to another team mustn't bounce back)
  const state = useLoad(
    () =>
      loadHubTeam(slug).then((t) => {
        const now = currentHubRoute();
        if (t.u && t.u !== slug && now.kind === "team" && now.slug === slug) navigateHub({ kind: "team", slug: t.u }, { replace: true });
        return t;
      }),
    [slug],
  );
  usePageTitle(state.data?.name);
  useDDragon();
  return (
    <Page state={state}>
      {(t) => (
        <CaptureContext.Provider value={t.name}>
          <TeamView t={t} />
        </CaptureContext.Provider>
      )}
    </Page>
  );
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
    <div className="rw-page">
      <div className={card}>
        <h2 className="text-lg font-bold text-rw-text">
          {t.name}
          {t.codes.length > 0 && <span className="text-rw-muted text-sm font-semibold ml-2">{t.codes.slice(0, 3).join(" · ")}</span>}
        </h2>
        <p className="text-[11px] text-rw-muted">
          {[t.region ? regionName(t.region, t.region) : null, tl("Pro games from {from} to {to}", { from: fmtDate(t.from), to: fmtDate(t.to) }), t.disbanded ? tl("Disbanded") : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <PhotosLink q={t.name} className="mt-1 inline-flex items-center gap-1 text-[11px] text-rw-teal hover:underline" />
        {oldNames.length > 0 && (
          <p className="text-[11px] text-rw-sub mt-1">
            {tl("Also played as:")}{" "}
            {oldNames.map((n, i) => (
              <span key={n.n + n.from}>
                {i > 0 && ", "}
                <span className="text-rw-text">{n.n}</span> ({n.from.slice(0, 4)}
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
          {t.rating && (
            <HubLink to={{ kind: "rankings" }} className="block hover:opacity-80 relative">
              {t.rh && t.rh.length > 1 && (
                <span className="absolute right-2 top-2" title={tl("Rating over the last year")}>
                  <Sparkline points={t.rh} width={72} height={22} />
                </span>
              )}
              <Stat
                label={tl("Power ranking")}
                value={`#${t.rating.rank ?? t.rating.lrank}`}
                sub={
                  t.rating.rank != null
                    ? tl("#{lrank} in {league} · rating {r}", { lrank: t.rating.lrank, league: t.rating.league || "–", r: t.rating.r })
                    : tl("in {league} · rating {r}", { league: t.rating.league || "–", r: t.rating.r })
                }
              />
            </HubLink>
          )}
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
      <TeamPeriodStats slug={t.u} has2y={!!t.g2y} />
      <TeamRanks slug={t.u} events={t.events} />

      {t.titles.length > 0 && (
        <Section title={tl("Titles")}>
          <ul className="text-xs space-y-1">
            {t.titles.map((x) => (
              <li key={x.t + x.date} className="flex justify-between gap-2">
                <span className="text-rw-text min-w-0 truncate">
                  <Trophy className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-rw-accent" : "text-rw-muted"}`} />
                  <EventLink name={eventTitle(x.t)} u={x.e} />
                  {x.as !== t.name && <span className="text-rw-muted"> ({tl("as {name}", { name: x.as })})</span>}
                </span>
                <span className="text-rw-muted shrink-0">
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
            <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <ul className="text-xs space-y-1">
              {t.recent.map((r, i) => (
                <li key={i} className="flex justify-between gap-2 min-w-0">
                  <span className="truncate min-w-0">
                    <span className={r.us > r.them ? "text-rw-teal font-bold" : "text-rw-red font-bold"}>
                      {r.us > r.them ? tc("short result", "W") : tc("short result", "L")} {r.us}-{r.them}
                    </span>{" "}
                    {r.g ? (
                      <HubLink to={{ kind: "match", slug: r.g }}>vs {r.opp}</HubLink>
                    ) : (
                      <span className="text-rw-text">vs {r.opp}</span>
                    )}
                    <span className="text-rw-muted"> · {r.en}</span>
                  </span>
                  <span className="text-rw-muted shrink-0 flex items-center gap-2">
                    {r.r != null && (
                      <span className={`tabular-nums font-semibold ${ratingTextClass(r.r)}`} title={tl("Series rating")}>
                        {r.r.toFixed(0)}
                      </span>
                    )}
                    {fmtDate(r.date, false)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={tl("By year")}>
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Year")}</th>
                <th className={th}>{tl("Record")}</th>
                <th className={th}>{tl("Win %")}</th>
              </tr>
            </thead>
            <tbody>
              {t.years.map((y) => (
                <tr key={y.y} className="border-t border-rw-border">
                  <td className={`${td} text-rw-text`}>
                    {y.y}
                    {y.as !== t.name && <span className="text-rw-muted text-[10px]"> {tl("as {name}", { name: y.as })}</span>}
                  </td>
                  <td className={`${td} text-rw-sub`}>
                    {y.w}-{y.g - y.w}
                  </td>
                  <td className={`${td} text-rw-sub`}>{winRate(y.w, y.g)}</td>
                </tr>
              ))}
            </tbody>
          </STable>
        </Section>
      </div>

      {t.events.length > 0 && (
        <Section
          title={tl("Tournaments")}
          right={
            t.events.length > 15 ? (
              <button type="button" onClick={() => setAllEvents((v) => !v)} className="text-[11px] text-rw-teal hover:underline">
                {allEvents ? tl("Show fewer") : tl("Show all {n}", { n: t.events.length })}
              </button>
            ) : undefined
          }
        >
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
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
            </STable>
          </div>
        </Section>
      )}

      <TeamSeriesArchive slug={t.u} teamName={t.name} />

      <Section title={tl("Roster")}>
        <div className="space-y-2">
          {t.roster.map((yr) => (
            <div key={yr.y} className="text-xs">
              <span className="text-rw-muted font-semibold mr-2">{yr.y}</span>
              {yr.p.map((p, i) => (
                <span key={p.n + i}>
                  {i > 0 && <span className="text-rw-muted/60"> · </span>}
                  <PlayerLink name={p.n} u={p.u} />
                  <span className="text-rw-muted"> {roleName(p.r)}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title={tl("Against other teams")}>
        <div className="overflow-x-auto max-h-96">
          <STable className="w-full text-xs">
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
                <tr key={o.n} className="border-t border-rw-border">
                  <td className={td}>
                    <TeamLink name={o.n} u={o.u} />
                  </td>
                  <td className={`${td} text-rw-sub`}>
                    {o.w}-{o.g - o.w}
                  </td>
                  <td className={`${td} text-rw-sub`}>{winRate(o.w, o.g)}</td>
                  <td className={`${td} text-rw-muted`} data-sort={o.last}>{fmtDate(o.last)}</td>
                </tr>
              ))}
            </tbody>
          </STable>
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title={tl("Most picked champions")}>
          <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
            {t.champs.map((c) => (
              <li key={c.c} className="flex justify-between gap-1 min-w-0">
                <ChampLink name={c.c} size={16} />
                <span className="text-rw-muted shrink-0">
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
                <span className="text-rw-muted shrink-0">{c.g}</span>
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
                  <span className="text-rw-muted shrink-0">{c.g}</span>
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
    <tr className="border-t border-rw-border">
      <td className={`${td} max-w-[14rem] truncate`}>
        <EventLink name={x.en} u={x.e} />
        {x.as && x.as !== teamName && <span className="text-rw-muted text-[10px]"> {tl("as {name}", { name: x.as })}</span>}
      </td>
      <td className={`${td} ${x.pl === "1" ? "text-rw-accent font-bold" : "text-rw-sub"}`}>
        {hidden ? <RevealButton onReveal={reveal} small /> : x.pl || "–"}
      </td>
      <td className={`${td} text-rw-sub`}>{hidden ? "–" : `${x.sw}-${x.sg - x.sw}`}</td>
      <td className={`${td} text-rw-sub`}>{hidden ? "–" : `${x.w}-${x.g - x.w}`}</td>
      <td className={`${td} text-rw-muted`} data-sort={x.usd && !hidden ? x.usd : 0}>{x.usd && !hidden ? fmtUsd(x.usd) : ""}</td>
    </tr>
  );
};

