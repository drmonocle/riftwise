/** Player page: career numbers, bio, tournaments, teams, champion pool, recent games and bests. */
import React, { useState } from "react";
import { Trophy, ExternalLink } from "lucide-react";
import { tl, tk, tc, roleName, eventTitle } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubPlayer } from "../../hub/data";
import type { HubPlayer } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { PlayerGamesArchive } from "./Archives";
import { PlayerPeriodStats } from "./PeriodStats";
import {
  card,
  ChampIcon,
  ChampLink,
  EventLink,
  fmtDate,
  fmtNum,
  HubLink,
  Page,
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

const BEST_LABEL: Record<string, string> = {
  kills: tk("Most kills"),
  assists: tk("Most assists"),
  dmg: tk("Most damage"),
  cs: tk("Most CS"),
};

export const PlayerPage: React.FC<{
  slug: string;
  onOpenUrl: (url: string) => void;
}> = ({ slug, onOpenUrl }) => {
  const state = useLoad(() => loadHubPlayer(slug), [slug]);
  usePageTitle(state.data?.name);
  useDDragon();
  return (
    <Page state={state}>
      {(p) => <PlayerView p={p} onOpenUrl={onOpenUrl} />}
    </Page>
  );
};

function age(born?: string): number | null {
  if (!born || !/^\d{4}-\d{2}-\d{2}$/.test(born)) return null;
  const b = new Date(`${born}T00:00:00Z`);
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (
    now.getUTCMonth() < b.getUTCMonth() ||
    (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())
  )
    a--;
  return a;
}

const PlayerView: React.FC<{
  p: HubPlayer;
  onOpenUrl: (url: string) => void;
}> = ({ p, onOpenUrl }) => {
  const [allEvents, setAllEvents] = useState(false);
  const [allChamps, setAllChamps] = useState(false);
  const [recentHidden, revealRecent] = useHidden(
    `player-recent:${p.u}`,
    p.recent[0]?.date,
  );
  const yrs = age(p.bio.born);
  const links: [string, string][] = [];
  if (p.bio.twitter)
    links.push([
      "X / Twitter",
      p.bio.twitter.startsWith("http")
        ? p.bio.twitter
        : `https://x.com/${p.bio.twitter}`,
    ]);
  if (p.bio.stream) links.push([tl("Stream"), p.bio.stream]);
  if (p.bio.youtube) links.push(["YouTube", p.bio.youtube]);
  links.push([
    "Leaguepedia",
    `https://lol.fandom.com/wiki/${encodeURIComponent(p.page.replace(/ /g, "_"))}`,
  ]);
  const events = allEvents ? p.events : p.events.slice(0, 12);
  return (
    <div className="space-y-3">
      <div className={card}>
        <h2 className="text-lg font-bold text-[#f0e6d2]">
          {p.name}
          {p.bio.native && (
            <span className="text-[#9bb3c9] text-sm font-semibold ml-2">
              {p.bio.native}
            </span>
          )}
        </h2>
        <p className="text-[11px] text-[#9bb3c9]">
          {[
            roleName(p.role),
            p.bio.real,
            p.bio.country,
            yrs != null ? tl("{n} years old", { n: yrs }) : null,
            p.bio.retired ? tl("Retired") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {p.club && (
          <p className="text-[11px] text-[#7e8e9f]">
            <TeamLink name={p.club} u={p.clubU} />{" "}
            {tl("(last game {date})", { date: fmtDate(p.clubTo) })}
            {p.bio.contract && (
              <>
                {" "}
                ·{" "}
                {tl("Contract until {date}", { date: fmtDate(p.bio.contract) })}
              </>
            )}
            {p.bio.res && (
              <> · {tl("Residency: {region}", { region: p.bio.res })}</>
            )}
          </p>
        )}
        {p.bio.fav && p.bio.fav.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1 text-[11px] text-[#7e8e9f]">
            {tl("Favorite champions:")}
            {p.bio.fav.map((c) => (
              <ChampLink key={c} name={c} size={16} showName={false} />
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <Stat
            label={tl("Games")}
            value={`${fmtNum(p.w)}-${fmtNum(p.g - p.w)}`}
            sub={tl("{pct} win rate", { pct: winRate(p.w, p.g) })}
          />
          <Stat
            label={tl("KDA")}
            value={p.kda}
            sub={`${fmtNum(p.k)} / ${fmtNum(p.d)} / ${fmtNum(p.a)}`}
          />
          <Stat
            label={tl("Champions")}
            value={p.nChamps}
            sub={
              p.champs[0]
                ? tl("most: {champion}", { champion: champName(p.champs[0].c) })
                : undefined
            }
          />
          <Stat
            label={tl("Titles")}
            value={p.titles.length}
            sub={`${tl("{n} Worlds", { n: p.titles.filter((x) => x.kind === "Worlds").length })} · ${tl("{n} MSI", { n: p.titles.filter((x) => x.kind === "MSI").length })}`}
          />
          {p.csm != null && <Stat label={tl("CS / min")} value={p.csm} />}
          {p.gpm != null && (
            <Stat label={tl("Gold / min")} value={fmtNum(p.gpm)} />
          )}
          {p.dpm != null && (
            <Stat label={tl("Damage / min")} value={fmtNum(p.dpm)} />
          )}
          {p.mvp ? (
            <Stat
              label={tl("Player of the Game")}
              value={fmtNum(p.mvp)}
              sub={tl("awards (where recorded)")}
            />
          ) : null}
          {p.pentas && p.pentas.length > 0 && (
            <Stat
              label={tl("Pentakills")}
              value={p.pentas.reduce((s, x) => s + x.x, 0)}
              sub={tl("fully recorded from 2018")}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
          {links.map(([label, url]) => (
            <button
              key={label}
              type="button"
              onClick={() => onOpenUrl(url)}
              className="text-[#0ac8b9] hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
        {p.bio.soloq && p.bio.soloq.length > 0 && (
          <p className="text-[10px] text-[#7e8e9f] mt-2">
            {tl("Solo queue:")} {p.bio.soloq.join(" · ")}
          </p>
        )}
        <p className="text-[10px] text-[#7e8e9f] mt-2">
          {tl("All-Star and show matches aren't counted.")}
        </p>
      </div>

      <PlayerPeriodStats slug={p.u} />

      {p.titles.length > 0 && (
        <Section title={tl("Titles")}>
          <ul className="text-xs space-y-1">
            {p.titles.map((x) => (
              <li key={x.t + x.date} className="flex justify-between gap-2">
                <span className="text-[#f0e6d2] truncate min-w-0">
                  <Trophy
                    className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-[#c8aa6e]" : "text-[#7e8e9f]"}`}
                  />
                  <EventLink name={eventTitle(x.t)} u={x.e} />
                </span>
                <span className="text-[#7e8e9f] shrink-0">
                  {fmtDate(x.date)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.events.length > 0 && (
        <Section
          title={tl("Tournaments")}
          right={
            p.events.length > 12 ? (
              <button
                type="button"
                onClick={() => setAllEvents((v) => !v)}
                className="text-[11px] text-[#0ac8b9] hover:underline"
              >
                {allEvents
                  ? tl("Show fewer")
                  : tl("Show all {n}", { n: p.events.length })}
              </button>
            ) : undefined
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>{tl("Tournament")}</th>
                  <th className={th}>{tl("Team")}</th>
                  <th className={th}>{tl("Place")}</th>
                  <th className={th}>{tl("Games")}</th>
                  <th className={th}>{tl("KDA")}</th>
                  <th className={th}>{tl("CS / min")}</th>
                  <th className={th}>{tl("Champions")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((x) => (
                  <PlayerEventRow key={x.e} x={x} />
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Section title={tl("Teams")}>
          <ul className="text-xs space-y-1">
            {p.teams.map((t) => (
              <li key={t.n} className="flex justify-between gap-2 min-w-0">
                <span className="truncate min-w-0">
                  <TeamLink name={t.n} u={t.u} />
                </span>
                <span className="text-[#7e8e9f] shrink-0">
                  {t.from.slice(0, 4)}–{t.to.slice(0, 4)} · {t.w}-{t.g - t.w}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={tl("By year")}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Year")}</th>
                <th className={th}>{tl("Team")}</th>
                <th className={th}>{tl("Record")}</th>
                <th className={th}>{tl("KDA")}</th>
              </tr>
            </thead>
            <tbody>
              {p.years.map((y) => (
                <tr key={y.y} className="border-t border-[#1e282d]">
                  <td className={`${td} text-[#f0e6d2]`}>{y.y}</td>
                  <td className={`${td} text-[#9bb3c9] max-w-[9rem] truncate`}>
                    {y.team}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {y.w}-{y.g - y.w}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{y.kda}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section
        title={tl("Champion pool")}
        right={
          p.champs.length > 15 ? (
            <button
              type="button"
              onClick={() => setAllChamps((v) => !v)}
              className="text-[11px] text-[#0ac8b9] hover:underline"
            >
              {allChamps
                ? tl("Show fewer")
                : tl("Show all {n}", { n: p.champs.length })}
            </button>
          ) : undefined
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Champion")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
                <th className={th}>{tl("KDA")}</th>
                <th className={th}>K / D / A</th>
              </tr>
            </thead>
            <tbody>
              {(allChamps ? p.champs : p.champs.slice(0, 15)).map((c) => (
                <tr key={c.c} className="border-t border-[#1e282d]">
                  <td className={`${td} max-w-[10rem]`}>
                    <ChampLink name={c.c} size={18} />
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.g}</td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {winRate(c.w, c.g)}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.kda}</td>
                  <td className={`${td} text-[#7e8e9f]`}>
                    {c.k} / {c.d} / {c.a}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title={tl("Recent games")}
          right={
            recentHidden ? (
              <RevealButton onReveal={revealRecent} small />
            ) : undefined
          }
        >
          {recentHidden ? (
            <p className="text-[11px] text-[#7e8e9f] italic">
              {tl("Hidden while spoiler mode is on.")}
            </p>
          ) : (
            <ul className="text-xs space-y-1.5">
              {p.recent.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 min-w-0"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-3.5 shrink-0 font-bold ${r.win ? "text-[#0ac8b9]" : "text-[#e84057]"}`}
                    >
                      {r.win
                        ? tc("short result", "W")
                        : tc("short result", "L")}
                    </span>
                    <ChampIcon name={r.c} size={18} />
                    <span className="truncate min-w-0">
                      <span className="text-[#f0e6d2] tabular-nums">
                        {r.k}/{r.d}/{r.a}
                      </span>{" "}
                      {r.g ? (
                        <HubLink to={{ kind: "match", slug: r.g }}>
                          vs {r.opp}
                        </HubLink>
                      ) : (
                        <span className="text-[#9bb3c9]">vs {r.opp}</span>
                      )}
                    </span>
                  </span>
                  <span className="text-[#7e8e9f] shrink-0">
                    {fmtDate(r.date, false)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={tl("Career bests")}>
          <ul className="text-xs space-y-1">
            {Object.entries(p.best).map(([k, b]) => (
              <li key={k} className="flex justify-between gap-2 min-w-0">
                <span className="text-[#9bb3c9] shrink-0">
                  {BEST_LABEL[k] ? tl(BEST_LABEL[k]) : k}
                </span>
                <span className="text-[#f0e6d2] text-right truncate min-w-0">
                  {fmtNum(b.v)}{" "}
                  <span className="text-[#7e8e9f]">
                    ({champName(b.c)} vs{" "}
                    {b.g ? (
                      <HubLink
                        to={{ kind: "match", slug: b.g }}
                        className="text-[#7e8e9f] hover:text-[#c8aa6e] hover:underline"
                      >
                        {b.opp}
                      </HubLink>
                    ) : (
                      b.opp
                    )}
                    , {b.date.slice(0, 4)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {p.pentas && p.pentas.length > 0 && (
        <Section title={tl("Pentakills")}>
          <ul className="text-xs space-y-1">
            {p.pentas.map((x, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 min-w-0"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <ChampIcon name={x.c} size={18} />
                  <span className="truncate">
                    {champName(x.c)}
                    {x.x > 1 && <span className="text-[#c8aa6e]"> ×{x.x}</span>}
                    <span className="text-[#7e8e9f]"> · {x.en}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-[#7e8e9f]">
                  {fmtDate(x.date)}
                  {x.g && (
                    <HubLink
                      to={{ kind: "match", slug: x.g }}
                      className="text-[#0ac8b9] hover:underline"
                    >
                      {tl("Details")}
                    </HubLink>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <PlayerGamesArchive slug={p.u} />
    </div>
  );
};

const PlayerEventRow: React.FC<{ x: HubPlayer["events"][number] }> = ({
  x,
}) => {
  const [hidden, reveal] = useHidden(`player-event:${x.e}`, x.date);
  return (
    <tr className="border-t border-[#1e282d]">
      <td className={`${td} max-w-[13rem] truncate`}>
        <EventLink name={x.en} u={x.e} />
      </td>
      <td className={`${td} max-w-[8rem] truncate`}>
        <TeamLink name={x.t} u={x.tu} />
      </td>
      <td
        className={`${td} ${x.pl === "1" ? "text-[#c8aa6e] font-bold" : "text-[#9bb3c9]"}`}
      >
        {hidden ? <RevealButton onReveal={reveal} small /> : x.pl || "–"}
      </td>
      <td className={`${td} text-[#9bb3c9]`}>
        {hidden ? x.g : `${x.w}-${x.g - x.w}`}
      </td>
      <td className={`${td} text-[#9bb3c9]`}>{x.kda}</td>
      <td className={`${td} text-[#9bb3c9]`}>{x.csm ?? "–"}</td>
      <td className={td}>
        <span className="flex gap-0.5">
          {x.c.map((c) => (
            <ChampIcon key={c} name={c} size={16} />
          ))}
        </span>
      </td>
    </tr>
  );
};
