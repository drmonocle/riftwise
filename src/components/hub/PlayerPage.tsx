/** Player page: career numbers, bio, tournaments, teams, champion pool, recent games and bests. */
import React, { useState } from "react";
import { Trophy, ExternalLink } from "lucide-react";
import { tl, tk, tc, roleName, eventTitle, regionName, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubPlayer } from "../../hub/data";
import type { HubPlayer } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import { PlayerGamesArchive } from "./Archives";
import { PlayerPeriodStats } from "./PeriodStats";
import { BroadcastCardButton, SectionCard, playerCareerCardData } from "./BroadcastCard";
import { PlayerRanks } from "./Ranks";
import { OwnStorylines } from "./Storylines";
import { localCountry } from "./CountryFlag";
import { CaptureContext, card, ChampIcon, ChampLink, EventLink, fmtDate, fmtNum, HubLink, Page, PlayerPhoto, RevealButton, Section, Stat, td, TeamLink, th, useHidden, useHiddenCheck, useLoad, usePageTitle, PhotosLink } from "./ui";
import { ratingTextClass } from "./BestPage";
import { STable } from "../STable";

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
      {(p) => (
        <CaptureContext.Provider value={p.name}>
          <PlayerView p={p} onOpenUrl={onOpenUrl} />
        </CaptureContext.Provider>
      )}
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
  // the section cards leave out what spoiler mode hides
  const hiddenCheck = useHiddenCheck();
  const cardSub = [p.role ? roleName(p.role) : null, p.club].filter(Boolean).join(" · ") || undefined;
  return (
    <div className="rw-page">
      <div className={card}>
        <div className="flex items-start gap-3">
          <PlayerPhoto name={p.name} team={p.club} slug={p.u} img={p.img} sizeClass="w-14 h-14 lg:w-20 lg:h-20 2xl:w-24 2xl:h-24" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-rw-text">
              {p.name}
              {p.bio.native && (
                <span className="text-rw-sub text-sm font-semibold ml-2">
                  {p.bio.native}
                </span>
              )}
            </h1>
            <p className="text-[11px] text-rw-sub">
              {[
                roleName(p.role),
                p.bio.real,
                localCountry(p.bio.country, p.bio.cc),
                yrs != null ? tl("{n} years old", { n: yrs }) : null,
                p.bio.retired ? tl("Retired") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {p.club && (
              <p className="text-[11px] text-rw-muted">
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
                  <> · {tl("Residency: {region}", { region: regionName(p.bio.res, p.bio.res) })}</>
                )}
              </p>
            )}
            <PhotosLink q={p.name} className="mt-1 inline-flex items-center gap-1 text-[11px] text-rw-teal hover:underline" />
          </div>
        </div>
        {p.bio.fav && p.bio.fav.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1 text-[11px] text-rw-muted">
            {tl("Favorite champions:")}
            {p.bio.fav.map((c) => (
              <ChampLink key={c} name={c} size={16} showName={false} />
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 rw-stats mt-3">
          <Stat
            label={tl("Games")}
            value={`${fmtNum(p.w)}-${fmtNum(p.g - p.w)}`}
            sub={tl("{pct} win rate", { pct: winRate(p.w, p.g) })}
          />
          <Stat
            label={tl("KDA")}
            value={fmtN(p.kda)}
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
          {p.csm != null && <Stat label={tl("CS / min")} value={fmtN(p.csm)} />}
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
              className="text-rw-teal hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <BroadcastCardButton data={() => playerCareerCardData(p)} name={`${p.name}-career`} label={tl("Overview card")} />
        </div>
        {p.bio.soloq && p.bio.soloq.length > 0 && (
          <p className="text-[10px] text-rw-muted mt-2">
            {tl("Solo queue:")} {p.bio.soloq.join(" · ")}
          </p>
        )}
        <p className="text-[10px] text-rw-muted mt-2">
          {tl("All-Star and show matches aren't counted.")}
        </p>
      </div>

      <OwnStorylines notes={p.notes} spoilerKey={`notes:player:${p.u}`} share={`${p.u}-storylines`} />
      <PlayerPeriodStats slug={p.u} has2y={!!p.g2y} who={{ name: p.name, role: p.role ? roleName(p.role) : undefined, club: p.club }} />
      <PlayerRanks slug={p.u} events={p.events} has2y={!!p.g2y} />

      {p.titles.length > 0 && (
        <Section
          title={tl("Titles")}
          right={<SectionCard section={tl("Titles")} name={p.name} sub={tl("{n} titles", { n: p.titles.length })} rows={() => p.titles.map((x) => ({ label: eventTitle(x.t), value: x.date.slice(0, 4) }))} />}
        >
          <ul className="text-xs space-y-1">
            {p.titles.map((x) => (
              <li key={x.t + x.date} className="flex justify-between gap-2">
                <span className="text-rw-text truncate min-w-0">
                  <Trophy
                    className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-rw-accent" : "text-rw-muted"}`}
                  />
                  <EventLink name={eventTitle(x.t)} u={x.e} />
                </span>
                <span className="text-rw-muted shrink-0">
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
            <span className="flex items-center gap-2">
              {p.events.length > 12 && (
                <button
                  type="button"
                  onClick={() => setAllEvents((v) => !v)}
                  className="text-[11px] text-rw-teal hover:underline"
                >
                  {allEvents
                    ? tl("Show fewer")
                    : tl("Show all {n}", { n: p.events.length })}
                </button>
              )}
              <SectionCard
                section={tl("Tournaments")}
                name={p.name}
                sub={cardSub}
                rows={() =>
                  p.events
                    .filter((x) => !hiddenCheck(`player-event:${x.e}`, x.date))
                    .map((x) => ({ label: x.en, sub: `${x.t} · ${x.w}-${x.g - x.w} · KDA ${fmtN(x.kda)}`, value: x.pl ? tl("Place {p}", { p: x.pl }) : undefined }))
                }
              />
            </span>
          }
        >
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
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
            </STable>
          </div>
        </Section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title={tl("Teams")}
          right={<SectionCard section={tl("Teams")} name={p.name} sub={cardSub} rows={() => p.teams.map((x) => ({ label: x.n, sub: `${x.from.slice(0, 4)}–${x.to.slice(0, 4)}`, value: `${x.w}-${x.g - x.w}` }))} />}
        >
          <ul className="text-xs space-y-1">
            {p.teams.map((t) => (
              <li key={t.n} className="flex justify-between gap-2 min-w-0">
                <span className="truncate min-w-0">
                  <TeamLink name={t.n} u={t.u} />
                </span>
                <span className="text-rw-muted shrink-0">
                  {t.from.slice(0, 4)}–{t.to.slice(0, 4)} · {t.w}-{t.g - t.w}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section
          title={tl("By year")}
          right={
            <SectionCard
              section={tl("By year")}
              name={p.name}
              sub={cardSub}
              rows={() => [...p.years].reverse().map((y) => ({ label: y.y, sub: `${y.team} · ${y.w}-${y.g - y.w}`, value: `KDA ${fmtN(y.kda)}` }))}
            />
          }
        >
          <STable className="w-full text-xs">
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
                <tr key={y.y} className="border-t border-rw-border">
                  <td className={`${td} text-rw-text`}>{y.y}</td>
                  <td className={`${td} text-rw-sub max-w-[9rem] truncate`}>
                    {y.team}
                  </td>
                  <td className={`${td} text-rw-sub`}>
                    {y.w}-{y.g - y.w}
                  </td>
                  <td className={`${td} text-rw-sub`}>{fmtN(y.kda)}</td>
                </tr>
              ))}
            </tbody>
          </STable>
        </Section>
      </div>

      <Section
        title={tl("Champion pool")}
        right={
          <span className="flex items-center gap-2">
            {p.champs.length > 15 && (
              <button
                type="button"
                onClick={() => setAllChamps((v) => !v)}
                className="text-[11px] text-rw-teal hover:underline"
              >
                {allChamps
                  ? tl("Show fewer")
                  : tl("Show all {n}", { n: p.champs.length })}
              </button>
            )}
            <SectionCard
              section={tl("Champion pool")}
              name={p.name}
              sub={tl("{n} champions played", { n: p.nChamps })}
              rows={() => p.champs.map((c) => ({ champ: c.c, label: champName(c.c), sub: tl("{g} games · {wr}", { g: c.g, wr: winRate(c.w, c.g) }), value: `KDA ${fmtN(c.kda)}` }))}
            />
          </span>
        }
      >
        <div className="overflow-x-auto">
          <STable className="w-full text-xs">
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
                <tr key={c.c} className="border-t border-rw-border">
                  <td className={`${td} max-w-[10rem]`}>
                    <ChampLink name={c.c} size={18} />
                  </td>
                  <td className={`${td} text-rw-sub`}>{c.g}</td>
                  <td className={`${td} text-rw-sub`}>
                    {winRate(c.w, c.g)}
                  </td>
                  <td className={`${td} text-rw-sub`}>{fmtN(c.kda)}</td>
                  <td className={`${td} text-rw-muted`}>
                    {c.k} / {c.d} / {c.a}
                  </td>
                </tr>
              ))}
            </tbody>
          </STable>
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title={tl("Recent games")}
          right={
            recentHidden ? (
              <RevealButton onReveal={revealRecent} small />
            ) : (
              <SectionCard
                section={tl("Recent games")}
                name={p.name}
                sub={cardSub}
                rows={() => p.recent.map((r) => ({ win: !!r.win, champ: r.c, label: `${r.k}/${r.d}/${r.a} vs ${r.opp}`, sub: r.en, value: fmtDate(r.date, false) }))}
              />
            )
          }
        >
          {recentHidden ? (
            <p className="text-[11px] text-rw-muted italic">
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
                      className={`w-3.5 shrink-0 font-bold ${r.win ? "text-rw-teal" : "text-rw-red"}`}
                    >
                      {r.win
                        ? tc("short result", "W")
                        : tc("short result", "L")}
                    </span>
                    <ChampIcon name={r.c} size={18} />
                    <span className="truncate min-w-0">
                      <span className="text-rw-text tabular-nums">
                        {r.k}/{r.d}/{r.a}
                      </span>{" "}
                      {r.g ? (
                        <HubLink to={{ kind: "match", slug: r.g, game: r.gn }}>
                          vs {r.opp}
                        </HubLink>
                      ) : (
                        <span className="text-rw-sub">vs {r.opp}</span>
                      )}
                    </span>
                  </span>
                  <span className="text-rw-muted shrink-0 flex items-center gap-2">
                    {r.r != null && (
                      <span className={`tabular-nums font-semibold ${ratingTextClass(r.r)}`} title={tl("Game rating")}>
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
        <Section
          title={tl("Career bests")}
          right={
            <SectionCard
              section={tl("Career bests")}
              name={p.name}
              sub={cardSub}
              rows={() => Object.entries(p.best).map(([k, b]) => ({ champ: b.c, label: BEST_LABEL[k] ? tl(BEST_LABEL[k]) : k, sub: `${champName(b.c)} vs ${b.opp}, ${b.date.slice(0, 4)}`, value: fmtNum(b.v) }))}
            />
          }
        >
          <ul className="text-xs space-y-1">
            {Object.entries(p.best).map(([k, b]) => (
              <li key={k} className="flex justify-between gap-2 min-w-0">
                <span className="text-rw-sub shrink-0">
                  {BEST_LABEL[k] ? tl(BEST_LABEL[k]) : k}
                </span>
                <span className="text-rw-text text-right truncate min-w-0">
                  {fmtNum(b.v)}{" "}
                  <span className="text-rw-muted">
                    ({champName(b.c)} vs{" "}
                    {b.g ? (
                      <HubLink
                        to={{ kind: "match", slug: b.g, game: b.gn }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
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
        <Section
          title={tl("Pentakills")}
          right={<SectionCard section={tl("Pentakills")} name={p.name} sub={cardSub} rows={() => p.pentas!.map((x) => ({ champ: x.c, label: x.x > 1 ? `${champName(x.c)} ×${x.x}` : champName(x.c), sub: x.en, value: x.date.slice(0, 4) }))} />}
        >
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
                    {x.x > 1 && <span className="text-rw-accent"> ×{x.x}</span>}
                    <span className="text-rw-muted"> · {x.en}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                  {fmtDate(x.date)}
                  {x.g && (
                    <HubLink
                      to={{ kind: "match", slug: x.g, game: x.gn }}
                      className="text-rw-teal hover:underline"
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
    <tr className="border-t border-rw-border">
      <td className={`${td} max-w-[13rem] truncate`}>
        <EventLink name={x.en} u={x.e} />
      </td>
      <td className={`${td} max-w-[8rem] truncate`}>
        <TeamLink name={x.t} u={x.tu} />
      </td>
      <td
        className={`${td} ${x.pl === "1" ? "text-rw-accent font-bold" : "text-rw-sub"}`}
      >
        {hidden ? <RevealButton onReveal={reveal} small /> : x.pl || "–"}
      </td>
      <td className={`${td} text-rw-sub`}>
        {hidden ? x.g : `${x.w}-${x.g - x.w}`}
      </td>
      <td className={`${td} text-rw-sub`}>{fmtN(x.kda)}</td>
      <td className={`${td} text-rw-sub`}>{x.csm ?? "–"}</td>
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
