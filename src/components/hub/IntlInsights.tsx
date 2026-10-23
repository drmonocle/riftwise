/**
 * The Worlds / MSI / First Stand pages' extra facts (src/hub/intlInsights.ts): upsets, comebacks, the Swiss stage,
 * Cinderella runs, and for every year together finals, players' titles, each year in numbers, regions year by year
 * and how the host did. Shown under the facts on the Facts tab.
 */
import React, { useMemo } from "react";
import { tl } from "../../i18n";
import { champName } from "../../champions";
import type { EventLines } from "../../hub/worldsFacts";
import { cinderella, comebacks, editionYear, finals, finalsRecords, hosts, playerTitles, runs, swissRuns, upsets, yearLines, type FileRef, type Run } from "../../hub/intlInsights";
import { ChampIcon, HubLink, PlayerLink, Section, TeamLink } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { RegionFlag, regionLabel, regionStats } from "./RegionStats";

const mmss = (m: number | null) => {
  if (m == null) return "–";
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const k = (v: number) => `${(v / 1000).toFixed(1)}k`;
const yearOnly = (label: string) => String(editionYear(label) || label);
const placeText = (p: number | string | null | undefined) => {
  const n = typeof p === "number" ? p : Number(/^\d+/.exec(p || "")?.[0] || NaN);
  if (p == null || Number.isNaN(n)) return "–";
  return n === 1 ? tl("Won it") : n === 2 ? tl("Final") : n <= 4 ? tl("Semifinal") : n <= 8 ? tl("Quarterfinal") : tl("Top {n}", { n });
};

const List: React.FC<{ children: React.ReactNode }> = ({ children }) => <ul className="text-xs space-y-1">{children}</ul>;
const Item: React.FC<{ left: React.ReactNode; right: React.ReactNode; sub?: React.ReactNode }> = ({ left, right, sub }) => (
  <li className="flex justify-between gap-2 min-w-0">
    <span className="min-w-0">
      <span className="block truncate">{left}</span>
      {sub && <span className="block text-[10px] text-rw-muted truncate">{sub}</span>}
    </span>
    <span className="shrink-0 tabular-nums font-semibold text-rw-accent">{right}</span>
  </li>
);

export const IntlInsights: React.FC<{ files: (EventLines | null)[]; years: string[]; stages: string[]; all: boolean; name: string }> = ({
  files,
  years,
  stages,
  all,
  name,
}) => {
  const refs = useMemo<FileRef[]>(
    () => files.map((f, i) => (f ? { f, year: years[i], stage: stages[i] } : null)).filter((x): x is FileRef => !!x),
    [files, years, stages],
  );
  const up = useMemo(() => upsets(refs), [refs]);
  const cb = useMemo(() => comebacks(refs), [refs]);
  const sw = useMemo(() => swissRuns(refs), [refs]);
  const rn = useMemo(() => runs(refs), [refs]);
  const cind = useMemo(() => cinderella(rn), [rn]);
  const fin = useMemo(() => (all ? finalsRecords(finals(refs)) : null), [refs, all]);
  const titles = useMemo(() => (all ? playerTitles(refs).slice(0, 12) : []), [refs, all]);
  const ys = useMemo(() => (all ? yearLines(refs) : []), [refs, all]);
  const hs = useMemo(() => (all ? hosts(refs) : []), [refs, all]);
  // each region's record against other regions, year by year (the regions with the most such series)
  const trend = useMemo(() => {
    if (!all) return null;
    const yearsList = [...new Set(refs.map((r) => r.year))].sort((a, b) => editionYear(a) - editionYear(b));
    const per = yearsList.map((y) => {
      const sub = refs.filter((r) => r.year === y);
      return { y, rows: regionStats(sub.map((r) => r.f), sub.map((r) => r.year)).list };
    });
    const totals = new Map<string, number>();
    for (const p of per) for (const r of p.rows) totals.set(r.code, (totals.get(r.code) || 0) + r.ow + r.ol);
    const regions = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
    return { years: per, regions };
  }, [refs, all]);

  const sections: React.ReactNode[] = [];

  if (up.games.length)
    sections.push(
      <Section
        key="upsets"
        title={tl("Biggest upsets")}
        right={<SectionCard section={tl("Biggest upsets")} name={name} rows={() => up.games.map((u) => ({ label: `${u.winner} beat ${u.loser}`, sub: `${all ? yearOnly(u.year) + " · " : ""}${u.stage} · ${tl("Game {n}", { n: u.n ?? 1 })}`, value: `${u.chance}%` }))} />}
      >
        <p className="text-[11px] text-rw-muted">{tl("Wins by the team the power ratings gave the smallest chance before the game.")}</p>
        <List>
          {up.games.map((u, i) => (
            <Item
              key={i}
              left={
                <HubLink to={{ kind: "match", slug: u.series, game: u.n }} className="text-rw-text hover:text-rw-accent">
                  {u.winner} <span className="text-rw-muted">{tl("beat")}</span> {u.loser}
                </HubLink>
              }
              sub={`${all ? yearOnly(u.year) + " · " : ""}${u.stage} · ${tl("Game {n}", { n: u.n ?? 1 })}`}
              right={`${u.chance}%`}
            />
          ))}
        </List>
        {up.series.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Series upsets")}</h4>
            <List>
              {up.series.slice(0, 5).map((u, i) => (
                <Item
                  key={i}
                  left={
                    <HubLink to={{ kind: "match", slug: u.series }} className="text-rw-text hover:text-rw-accent">
                      {u.winner} {u.score} {u.loser}
                    </HubLink>
                  }
                  sub={`${all ? yearOnly(u.year) + " · " : ""}${u.stage}`}
                  right={`${u.chance}%`}
                />
              ))}
            </List>
          </>
        )}
      </Section>,
    );

  if (cb.length)
    sections.push(
      <Section
        key="comebacks"
        title={tl("Biggest comebacks")}
        right={<SectionCard section={tl("Biggest comebacks")} name={name} rows={() => cb.map((c) => ({ label: `${c.winner} beat ${c.loser}`, sub: `${all ? yearOnly(c.year) + " · " : ""}${c.stage}`, value: `-${k(c.behind)}` }))} />}
      >
        <p className="text-[11px] text-rw-muted">{tl("Games won from furthest behind in gold at 15 minutes.")}</p>
        <List>
          {cb.map((c, i) => (
            <Item
              key={i}
              left={
                <HubLink to={{ kind: "match", slug: c.series, game: c.n }} className="text-rw-text hover:text-rw-accent">
                  {c.winner} <span className="text-rw-muted">{tl("beat")}</span> {c.loser}
                </HubLink>
              }
              sub={`${all ? yearOnly(c.year) + " · " : ""}${c.stage} · ${tl("Game {n}", { n: c.n })}`}
              right={`−${k(c.behind)}`}
            />
          ))}
        </List>
      </Section>,
    );

  if (sw.length) {
    const sorted = [...sw].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.team.localeCompare(b.team));
    const clean = sorted.filter((r) => r.wins === 3 && r.losses === 0);
    const swept = sorted.filter((r) => r.wins === 0 && r.losses === 3);
    const escaped = sorted.filter((r) => r.path.startsWith("LL") && r.wins === 3);
    // 1-2 after three rounds: one more loss and they're out
    const at12 = sw.filter((r) => r.path.length >= 3 && r.path.slice(0, 3).replace(/L/g, "").length === 1);
    const at12Through = at12.filter((r) => r.wins === 3).length;
    const chip = (path: string) => (
      <span className="inline-flex gap-0.5 align-middle">
        {path.split("").map((c, i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-sm text-[8px] font-bold flex items-center justify-center ${c === "W" ? "bg-rw-teal/30 text-rw-teal" : "bg-rw-red/30 text-rw-red"}`}>
            {c}
          </span>
        ))}
      </span>
    );
    sections.push(
      <Section
        key="swiss"
        title={tl("Swiss stage")}
        right={<SectionCard section={tl("Swiss stage")} name={name} rows={() => sorted.map((r) => ({ label: `${all ? yearOnly(r.year) + " · " : ""}${r.team}`, sub: r.path.split("").join(" "), value: `${r.wins}-${r.losses}` }))} />}
      >
        {all ? (
          <div className="space-y-2 text-xs">
            <p>
              <span className="font-bold text-rw-teal">3-0:</span> {clean.map((r) => `${r.team} (${yearOnly(r.year)})`).join(", ") || "–"}
            </p>
            <p>
              <span className="font-bold text-rw-red">0-3:</span> {swept.map((r) => `${r.team} (${yearOnly(r.year)})`).join(", ") || "–"}
            </p>
            <p>
              <span className="font-bold text-rw-accent">{tl("Escaped from 0-2:")}</span> {escaped.map((r) => `${r.team} (${yearOnly(r.year)})`).join(", ") || "–"}
            </p>
            {at12.length > 0 && <p className="text-rw-sub">{tl("Teams at 1-2 that still went through: {n} of {of}", { n: at12Through, of: at12.length })}</p>}
          </div>
        ) : (
          <List>
            {sorted.map((r) => (
              <li key={r.u} className="flex items-center justify-between gap-2 min-w-0">
                <span className="truncate min-w-0">
                  <TeamLink name={r.team} u={r.u} className="text-rw-text hover:text-rw-accent" />
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {chip(r.path)}
                  <span className={`tabular-nums font-bold w-8 text-right ${r.wins === 3 ? "text-rw-teal" : r.losses === 3 ? "text-rw-red" : "text-rw-sub"}`}>
                    {r.wins}-{r.losses}
                  </span>
                </span>
              </li>
            ))}
          </List>
        )}
      </Section>,
    );
  }

  const runRow = (r: Run, i: number, show: "chance" | "place") => (
    <Item
      key={i}
      left={<TeamLink name={r.team} u={r.u} className="text-rw-text hover:text-rw-accent" />}
      sub={`${all ? yearOnly(r.year) + " · " : ""}${placeText(r.place)}${r.chance != null ? ` · ${tl("avg. chance {p}%", { p: r.chance })}` : ""}`}
      right={show === "chance" && r.chance != null ? `${r.chance}%` : placeText(r.place)}
    />
  );
  if (cind.playIn.length || cind.underdogs.length || (all && cind.debuts.length))
    sections.push(
      <Section
        key="cinderella"
        title={tl("Cinderella runs")}
        right={
          <SectionCard
            section={tl("Cinderella runs")}
            name={name}
            rows={() => [
              ...cind.playIn.slice(0, 4).map((r) => ({ label: `${r.team} · ${tl("from the Play-In")}`, sub: all ? yearOnly(r.year) : undefined, value: placeText(r.place) })),
              ...cind.underdogs.slice(0, 4).map((r) => ({ label: `${r.team} · ${tl("underdog")}`, sub: all ? yearOnly(r.year) : undefined, value: placeText(r.place) })),
              ...(all ? cind.debuts.slice(0, 4).map((r) => ({ label: `${r.team} · ${tl("debut")}`, sub: yearOnly(r.year), value: placeText(r.place) })) : []),
            ]}
          />
        }
      >
        {cind.playIn.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">{tl("From the Play-In")}</h4>
            <List>{cind.playIn.map((r, i) => runRow(r, i, "place"))}</List>
          </>
        )}
        {cind.underdogs.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Underdogs who went deep")}</h4>
            <List>{cind.underdogs.map((r, i) => runRow(r, i, "chance"))}</List>
          </>
        )}
        {all && cind.debuts.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Best debuts")}</h4>
            <List>{cind.debuts.map((r, i) => runRow(r, i, "place"))}</List>
          </>
        )}
      </Section>,
    );

  if (fin && (fin.mostReached.length || fin.repeats.length))
    sections.push(
      <Section
        key="finals"
        title={tl("Finals")}
        right={<SectionCard section={tl("Most finals")} name={name} rows={() => fin.mostReached.map((r) => ({ label: r.name, sub: tl("{w} won · {l} lost", { w: r.won, l: r.n - r.won }), value: String(r.n) }))} />}
      >
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted">{tl("Most finals")}</h4>
        <List>
          {fin.mostReached.slice(0, 6).map((r) => (
            <Item key={r.u} left={<TeamLink name={r.name} u={r.u} className="text-rw-text hover:text-rw-accent" />} sub={tl("{w} won · {l} lost", { w: r.won, l: r.n - r.won })} right={r.n} />
          ))}
        </List>
        {fin.mostLost.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Most finals lost")}</h4>
            <List>
              {fin.mostLost.slice(0, 5).map((r) => (
                <Item key={r.u} left={<TeamLink name={r.name} u={r.u} className="text-rw-text hover:text-rw-accent" />} sub={r.years.map(yearOnly).join(", ")} right={r.n} />
              ))}
            </List>
          </>
        )}
        {fin.repeats.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Rematches in the final")}</h4>
            <List>
              {fin.repeats.map((l, i) => (
                <Item key={i} left={`${l[0].winner} vs ${l[0].loser}`} sub={l.map((f) => `${yearOnly(f.year)}: ${f.winner} ${f.score}`).join(" · ")} right={`×${l.length}`} />
              ))}
            </List>
          </>
        )}
      </Section>,
    );

  if (titles.length)
    sections.push(
      <Section
        key="players"
        title={tl("Players with the most titles")}
        right={<SectionCard section={tl("Players with the most titles")} name={name} rows={() => titles.map((p) => ({ label: p.name, sub: p.titles.map(yearOnly).join(", "), value: tl("{n} titles", { n: p.titles.length }) }))} />}
      >
        <List>
          {titles.map((p) => (
            <Item
              key={p.u || p.name}
              left={<PlayerLink name={p.name} u={p.u} className="text-rw-text hover:text-rw-accent" />}
              sub={`${p.titles.map(yearOnly).sort().join(", ")} · ${tl("{n} finals", { n: p.finals })}`}
              right={p.titles.length}
            />
          ))}
        </List>
      </Section>,
    );

  if (hs.length)
    sections.push(
      <Section
        key="hosts"
        title={tl("Home region")}
        right={<SectionCard section={tl("Home region")} name={name} rows={() => hs.map((h) => ({ label: `${yearOnly(h.year)} · ${h.country}`, sub: h.team || undefined, value: placeText(h.best) }))} />}
      >
        <p className="text-[11px] text-rw-muted">
          {tl("How the host region's best team did. Home wins: {n} of {of}.", { n: hs.filter((h) => h.best === 1).length, of: hs.filter((h) => h.region).length })}
        </p>
        <List>
          {hs.map((h) => (
            <li key={h.year} className="flex items-center justify-between gap-2 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="tabular-nums text-rw-muted w-9">{yearOnly(h.year)}</span>
                {h.region && <RegionFlag code={h.region} />}
                <span className="truncate text-rw-text">{h.country}</span>
                {h.team && <span className="truncate text-rw-muted">· {h.team}</span>}
              </span>
              <span className={`shrink-0 font-semibold ${h.best === 1 ? "text-rw-accent" : "text-rw-sub"}`}>{h.region ? placeText(h.best) : "–"}</span>
            </li>
          ))}
        </List>
      </Section>,
    );

  return (
    <>
      {sections.length > 0 && <div className="grid gap-3 md:grid-cols-2">{sections}</div>}
      {all && ys.length > 0 && (
        <Section
          title={tl("Year by year")}
          right={
            <SectionCard
              section={tl("Year by year")}
              name={name}
              rows={() => ys.map((y) => ({ label: yearOnly(y.year), sub: `${y.top ? champName(y.top[0]) : "–"} · ${tl("blue {p}%", { p: y.blue ?? "–" })}`, value: mmss(y.min) }))}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-rw-muted">
                <tr>
                  <th className="px-2 py-1 text-left">{tl("Year")}</th>
                  <th className="px-2 py-1 text-right">{tl("Games")}</th>
                  <th className="px-2 py-1 text-right">{tl("Blue side wins")}</th>
                  <th className="px-2 py-1 text-right">{tl("Avg game")}</th>
                  <th className="px-2 py-1 text-right">{tl("Kills / game")}</th>
                  <th className="px-2 py-1 text-left">{tl("Most picked")}</th>
                  <th className="px-2 py-1 text-left">{tl("Best win rate")}</th>
                  <th className="px-2 py-1 text-right" title={tl("Teams and players at their first edition")}>
                    {tl("Debuts")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ys.map((y) => (
                  <tr key={y.year} className="border-t border-rw-border whitespace-nowrap">
                    <td className="px-2 py-1 text-rw-text font-semibold">{yearOnly(y.year)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{y.games}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{y.blue == null ? "–" : `${y.blue}%`}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{mmss(y.min)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{y.kills ?? "–"}</td>
                    <td className="px-2 py-1">
                      {y.top ? (
                        <span className="flex items-center gap-1">
                          <ChampIcon name={y.top[0]} size={16} />
                          {champName(y.top[0])} <span className="text-rw-muted">· {y.top[1]}</span>
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {y.best ? (
                        <span className="flex items-center gap-1">
                          <ChampIcon name={y.best[0]} size={16} />
                          {champName(y.best[0])}{" "}
                          <span className="text-rw-muted">
                            · {y.best[2]}-{y.best[1] - y.best[2]}
                          </span>
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-rw-sub">{tl("{t} teams · {p} players", { t: y.newTeams, p: y.newPlayers })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {trend && trend.regions.length > 0 && trend.years.length > 1 && (
        <Section title={tl("Regions year by year")}>
          <p className="text-[11px] text-rw-muted">{tl("Each region's series win rate against other regions.")}</p>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead className="text-[10px] text-rw-muted">
                <tr>
                  <th className="px-2 py-1 text-left">{tl("Region")}</th>
                  {trend.years.map((y) => (
                    <th key={y.y} className="px-1.5 py-1 text-center tabular-nums">
                      {yearOnly(y.y).slice(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trend.regions.map((code) => (
                  <tr key={code} className="border-t border-rw-border">
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <RegionFlag code={code} />
                        {regionLabel(code)}
                      </span>
                    </td>
                    {trend.years.map((y) => {
                      const r = y.rows.find((x) => x.code === code);
                      const n = r ? r.ow + r.ol : 0;
                      const pct = n ? Math.round((r!.ow / n) * 100) : null;
                      return (
                        <td
                          key={y.y}
                          className="px-1.5 py-1 text-center tabular-nums"
                          title={r ? `${r.ow}-${r.ol}` : undefined}
                          style={pct == null ? undefined : { background: `color-mix(in srgb, ${pct >= 50 ? "var(--rw-teal)" : "var(--rw-red)"} ${Math.round(Math.abs(pct - 50) * 1.2)}%, transparent)` }}
                        >
                          {pct == null ? <span className="text-rw-muted">·</span> : pct}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
};
