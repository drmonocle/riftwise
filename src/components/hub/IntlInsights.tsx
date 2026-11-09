/**
 * The Worlds / MSI / First Stand pages' extra facts (src/hub/intlInsights.ts): upsets, comebacks, the Swiss stage,
 * Cinderella runs, and for every year together finals, players' titles, each year in numbers, regions year by year
 * and how the host did. Shown under the facts on the Facts tab.
 */
import React, { useMemo, useState } from "react";
import { tl } from "../../i18n";
import { champName } from "../../champions";
import { prettySlug } from "../../hub/data";
import type { EventLines } from "../../hub/worldsFacts";
import { cinderella, comebacks, editionYear, finals, finalsRecords, hosts, playerTitles, runs, swissRuns, upsets, yearLines, type FileRef, type Run } from "../../hub/intlInsights";
import { ChampIcon, HubLink, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo } from "./ui";
import { STable } from "../STable";
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
        right={
          <span className="flex items-center gap-2">
            <CopyInsightPost
              title={`${tl("Biggest upsets")} · ${name}`}
              rows={up.games.slice(0, 5).map((u) => `${u.winner} ${tl("beat")} ${u.loser} (${u.chance}%) · ${all ? yearOnly(u.year) + " · " : ""}${u.stage}`)}
            />
            <SectionCard section={tl("Biggest upsets")} name={name} rows={() => up.games.map((u) => ({ label: `${u.winner} beat ${u.loser}`, sub: `${all ? yearOnly(u.year) + " · " : ""}${u.stage} · ${tl("Game {n}", { n: u.n ?? 1 })}`, value: `${u.chance}%` }))} />
          </span>
        }
      >
        <p className="text-[11px] text-rw-muted">{tl("Wins by the team the power ratings gave the smallest chance before the game.")}</p>
        <List>
          {up.games.map((u, i) => (
            <Item
              key={i}
              left={
                <HubLink to={{ kind: "match", slug: u.series, game: u.n }} className="inline-flex items-center gap-1 text-rw-text hover:text-rw-accent">
                  <TeamLogo name={u.winner} size={14} />
                  <span>{u.winner}</span>
                  <span className="text-rw-muted">{tl("beat")}</span>
                  <TeamLogo name={u.loser} size={14} />
                  <span>{u.loser}</span>
                </HubLink>
              }
              sub={`${all ? yearOnly(u.year) + " · " : ""}${u.stage} · ${tl("Game {n}", { n: u.n ?? 1 })}`}
              right={
                <HubLink to={{ kind: "match", slug: u.series, game: u.n }} className="hover:underline">
                  {u.chance}%
                </HubLink>
              }
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
                    <HubLink to={{ kind: "match", slug: u.series }} className="inline-flex items-center gap-1 text-rw-text hover:text-rw-accent">
                      <TeamLogo name={u.winner} size={14} />
                      <span>{u.winner} {u.score}</span>
                      <TeamLogo name={u.loser} size={14} />
                      <span>{u.loser}</span>
                    </HubLink>
                  }
                  sub={`${all ? yearOnly(u.year) + " · " : ""}${u.stage}`}
                  right={
                    <HubLink to={{ kind: "match", slug: u.series }} className="hover:underline">
                      {u.chance}%
                    </HubLink>
                  }
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
        right={
          <span className="flex items-center gap-2">
            <CopyInsightPost
              title={`${tl("Biggest comebacks")} · ${name}`}
              rows={cb.slice(0, 5).map((c) => `${c.winner} ${tl("beat")} ${c.loser} (−${k(c.behind)} @15) · ${all ? yearOnly(c.year) + " · " : ""}${c.stage}`)}
            />
            <SectionCard section={tl("Biggest comebacks")} name={name} rows={() => cb.map((c) => ({ label: `${c.winner} beat ${c.loser}`, sub: `${all ? yearOnly(c.year) + " · " : ""}${c.stage}`, value: `-${k(c.behind)}` }))} />
          </span>
        }
      >
        <p className="text-[11px] text-rw-muted">{tl("Games won from furthest behind in gold at 15 minutes.")}</p>
        <List>
          {(() => {
            const maxBehind = Math.max(1, ...cb.map((c) => c.behind));
            return cb.map((c, i) => (
              <Item
                key={i}
                left={
                  <HubLink to={{ kind: "match", slug: c.series, game: c.n }} className="inline-flex items-center gap-1 text-rw-text hover:text-rw-accent">
                    <TeamLogo name={c.winner} size={14} />
                    <span>{c.winner}</span>
                    <span className="text-rw-muted">{tl("beat")}</span>
                    <TeamLogo name={c.loser} size={14} />
                    <span>{c.loser}</span>
                  </HubLink>
                }
                sub={`${all ? yearOnly(c.year) + " · " : ""}${c.stage} · ${tl("Game {n}", { n: c.n })}`}
                right={
                  <HubLink to={{ kind: "match", slug: c.series, game: c.n }} className="inline-flex items-center gap-1.5 hover:underline">
                    <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                      <span className="h-full bg-rw-red/80 rounded-full" style={{ width: `${Math.round((c.behind / maxBehind) * 100)}%` }} />
                    </span>
                    <span>−{k(c.behind)}</span>
                  </HubLink>
                }
              />
            ));
          })()}
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
            {(() => {
              const swissList = (list: typeof clean) =>
                list.length ? (
                  <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 align-middle">
                    {list.map((r, i) => (
                      <span key={`${r.u}-${r.year}-${i}`} className="inline-flex items-center gap-1">
                        <TeamLogo name={r.team} size={13} />
                        <TeamLink name={r.team} u={r.u} className="text-rw-text hover:text-rw-accent" />
                        <span className="text-rw-muted">({yearOnly(r.year)})</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  "–"
                );
              return (
                <>
                  <p>
                    <span className="font-bold text-rw-teal mr-1.5">3-0:</span>
                    {swissList(clean)}
                  </p>
                  <p>
                    <span className="font-bold text-rw-red mr-1.5">0-3:</span>
                    {swissList(swept)}
                  </p>
                  <p>
                    <span className="font-bold text-rw-accent mr-1.5">{tl("Escaped from 0-2:")}</span>
                    {swissList(escaped)}
                  </p>
                </>
              );
            })()}
            {at12.length > 0 && <p className="text-rw-sub">{tl("Teams at 1-2 that still went through: {n} of {of}", { n: at12Through, of: at12.length })}</p>}
          </div>
        ) : (
          <List>
            {sorted.map((r) => (
              <li key={r.u} className="flex items-center justify-between gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                  <TeamLogo name={r.team} size={15} />
                  <TeamLink name={r.team} u={r.u} className="text-rw-text hover:text-rw-accent truncate" />
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
      left={
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <TeamLogo name={r.team} size={15} />
          <TeamLink name={r.team} u={r.u} className="text-rw-text hover:text-rw-accent truncate" />
        </span>
      }
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
          {fin.mostReached.slice(0, 6).map((r) => {
            const wrPct = r.n > 0 ? Math.round((r.won / r.n) * 100) : 0;
            return (
              <Item
                key={r.u}
                left={
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <TeamLogo name={r.name} size={15} />
                    <TeamLink name={r.name} u={r.u} className="text-rw-text hover:text-rw-accent truncate" />
                  </span>
                }
                sub={tl("{w} won · {l} lost", { w: r.won, l: r.n - r.won })}
                right={
                  <span className="inline-flex items-center gap-1.5">
                    {r.n > 0 && (
                      <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                        <span className="h-full bg-rw-teal/85" style={{ width: `${wrPct}%` }} />
                        <span className="h-full bg-rw-red/75" style={{ width: `${100 - wrPct}%` }} />
                      </span>
                    )}
                    <span>{r.n}</span>
                  </span>
                }
              />
            );
          })}
        </List>
        {fin.mostLost.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Most finals lost")}</h4>
            <List>
              {fin.mostLost.slice(0, 5).map((r) => (
                <Item
                  key={r.u}
                  left={
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <TeamLogo name={r.name} size={15} />
                      <TeamLink name={r.name} u={r.u} className="text-rw-text hover:text-rw-accent truncate" />
                    </span>
                  }
                  sub={r.years.map(yearOnly).join(", ")}
                  right={r.n}
                />
              ))}
            </List>
          </>
        )}
        {fin.repeats.length > 0 && (
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rw-muted pt-2">{tl("Rematches in the final")}</h4>
            <List>
              {fin.repeats.map((l, i) => (
                <Item
                  key={i}
                  left={
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <TeamLogo name={l[0].winner} size={14} />
                      <TeamLink name={l[0].winner} className="text-rw-text hover:text-rw-accent hover:underline" />
                      <span className="text-rw-muted">vs</span>
                      <TeamLogo name={l[0].loser} size={14} />
                      <TeamLink name={l[0].loser} className="text-rw-text hover:text-rw-accent hover:underline" />
                    </span>
                  }
                  sub={l.map((f) => `${yearOnly(f.year)}: ${f.winner} ${f.score}`).join(" · ")}
                  right={`×${l.length}`}
                />
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
        right={
          <span className="flex items-center gap-2">
            <CopyInsightPost
              title={`${tl("Players with the most titles")} · ${name}`}
              rows={titles.slice(0, 6).map((p) => `${p.name}: ${tl("{n} titles", { n: p.titles.length })} (${p.titles.map(yearOnly).sort().join(", ")})`)}
            />
            <SectionCard section={tl("Players with the most titles")} name={name} rows={() => titles.map((p) => ({ label: p.name, sub: p.titles.map(yearOnly).join(", "), value: tl("{n} titles", { n: p.titles.length }) }))} />
          </span>
        }
      >
        <List>
          {(() => {
            const maxTitles = Math.max(1, ...titles.map((p) => p.titles.length));
            return titles.map((p) => (
              <Item
                key={p.u || p.name}
                left={
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <PlayerPhoto name={p.name} slug={p.u ?? undefined} size={18} />
                    <PlayerLink name={p.name} u={p.u} className="text-rw-text hover:text-rw-accent truncate" />
                  </span>
                }
                sub={`${p.titles.map(yearOnly).sort().join(", ")} · ${tl("{n} finals", { n: p.finals })}`}
                right={
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden inline-flex shrink-0">
                      <span className="h-full bg-rw-accent/85 rounded-full" style={{ width: `${Math.round((p.titles.length / maxTitles) * 100)}%` }} />
                    </span>
                    <span>{p.titles.length}</span>
                  </span>
                }
              />
            ));
          })()}
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
                {h.team && (
                  <span className="inline-flex items-center gap-1 truncate text-rw-muted">
                    <span>·</span>
                    <TeamLogo name={h.team} size={14} />
                    <TeamLink name={h.team} className="truncate text-rw-muted hover:text-rw-accent hover:underline" />
                  </span>
                )}
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
            <span className="flex items-center gap-2">
              <CopyInsightPost
                title={`${tl("Year by year")} · ${name}`}
                rows={ys.slice(0, 6).map((y) => `${yearOnly(y.year)}: ${y.games}G · ${mmss(y.min)} · ${y.top ? champName(y.top[0]) : "–"}`)}
              />
              <SectionCard
                section={tl("Year by year")}
                name={name}
                rows={() => ys.map((y) => ({ label: yearOnly(y.year), sub: `${y.top ? champName(y.top[0]) : "–"} · ${tl("blue {p}%", { p: y.blue ?? "–" })}`, value: mmss(y.min) }))}
              />
            </span>
          }
        >
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
              <thead className="text-[10px] text-rw-muted">
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
                {(() => {
                  const maxG = Math.max(1, ...ys.map((y) => y.games));
                  return ys.map((y) => (
                    <tr key={y.year} className="border-t border-rw-border whitespace-nowrap">
                      <td className="px-2 py-1 text-rw-text font-semibold" data-sort={editionYear(y.year) || 0}>{yearOnly(y.year)}</td>
                      <td className="px-2 py-1 text-right tabular-nums" data-sort={y.games}>
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <span className="w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                            <span className="h-full bg-rw-accent/75 rounded-full" style={{ width: `${Math.round((y.games / maxG) * 100)}%` }} />
                          </span>
                          <span className="w-7 text-right">{y.games}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums" data-sort={y.blue ?? -1}>
                        {y.blue == null ? (
                          "–"
                        ) : (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span className="w-10 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                              <span className="h-full" style={{ width: `${y.blue}%`, background: "#4a9eff" }} />
                              <span className="h-full" style={{ width: `${100 - y.blue}%`, background: "var(--rw-red)" }} />
                            </span>
                            <span className="w-8 text-right">{y.blue}%</span>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums" data-sort={y.min ?? -1}>{mmss(y.min)}</td>
                      <td className="px-2 py-1 text-right tabular-nums" data-sort={y.kills ?? -1}>{y.kills ?? "–"}</td>
                      <td className="px-2 py-1">
                        {y.top ? (
                          <HubLink to={{ kind: "champ", slug: prettySlug(y.top[0]) }} className="flex items-center gap-1 hover:text-rw-accent">
                            <ChampIcon name={y.top[0]} size={16} />
                            {champName(y.top[0])} <span className="text-rw-muted">· {y.top[1]}</span>
                          </HubLink>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {y.best ? (
                          <HubLink to={{ kind: "champ", slug: prettySlug(y.best[0]) }} className="flex items-center gap-1 hover:text-rw-accent">
                            <ChampIcon name={y.best[0]} size={16} />
                            {champName(y.best[0])}{" "}
                            <span className="text-rw-muted">
                              · {y.best[2]}-{y.best[1] - y.best[2]}
                            </span>
                          </HubLink>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-rw-sub" data-sort={y.newTeams * 100 + y.newPlayers}>{tl("{t} teams · {p} players", { t: y.newTeams, p: y.newPlayers })}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </STable>
          </div>
        </Section>
      )}
      {trend && trend.regions.length > 0 && trend.years.length > 1 && (
        <Section
          title={tl("Regions year by year")}
          right={
            <span className="flex items-center gap-2">
              <CopyInsightPost
                title={`${tl("Regions year by year")} · ${name}`}
                rows={trend.regions.slice(0, 6).map((code) => {
                  const rows = trend.years.map((y) => y.rows.find((x) => x.code === code)).filter((x): x is NonNullable<typeof x> => !!x);
                  const w = rows.reduce((s, r) => s + r.ow, 0);
                  const l = rows.reduce((s, r) => s + r.ol, 0);
                  return `${regionLabel(code)}: ${w}-${l} (${w + l > 0 ? `${Math.round((w / (w + l)) * 100)}%` : "–"})`;
                })}
              />
              <SectionCard
                section={tl("Regions year by year")}
                name={name}
                rows={() =>
                  trend.regions.map((code) => {
                    const rows = trend.years.map((y) => y.rows.find((x) => x.code === code)).filter((x): x is NonNullable<typeof x> => !!x);
                    const w = rows.reduce((s, r) => s + r.ow, 0);
                    const l = rows.reduce((s, r) => s + r.ol, 0);
                    return {
                      label: regionLabel(code),
                      sub: `${w}-${l}`,
                      value: w + l > 0 ? `${Math.round((w / (w + l)) * 100)}%` : "–",
                      win: w >= l,
                    };
                  })
                }
              />
            </span>
          }
        >
          <p className="text-[11px] text-rw-muted">{tl("Each region's series win rate against other regions.")}</p>
          <div className="overflow-x-auto">
            <STable className="w-full text-xs">
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
                          data-sort={pct ?? -1}
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
            </STable>
          </div>
        </Section>
      )}
    </>
  );
};

const CopyInsightPost: React.FC<{ title: string; rows: string[] }> = ({ title, rows }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const lines: string[] = [title];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push(window.location.href);
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {copied ? tl("Copied") : tl("Copy post")}
    </button>
  );
};
