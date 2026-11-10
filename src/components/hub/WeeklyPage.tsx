/**
 * The week in pro League (/stats/weekly): the last seven days' biggest upsets, who moved in the power rankings,
 * all-time records set, the best games and every result in the top leagues and international events. Built every
 * night by the stats build (hub/weekly.json). An overview card for X and "Copy for Reddit" (Markdown) make the
 * weekly post with no writing.
 */
import React, { useState } from "react";
import { ClipboardCopy, Check } from "lucide-react";
import { tl, tn, locale, roleName } from "../../i18n";
import { champName } from "../../champions";
import { loadWeekly, prettySlug, resolveLeagueSlug } from "../../hub/data";
import type { HubWeekly } from "../../hub/types";
import { SITE_URL } from "../../platform";
import { card, ChampIcon, ChampLink, EventLink, fmtDate, HubLink, Page, PlayerLink, PlayerPhoto, RevealButton, Section, TeamLink, TeamLogo, th, td, useHidden, useLoad, usePageTitle } from "./ui";
import { STable } from "../STable";
import { BroadcastCardButton, listCard, SectionCard } from "./BroadcastCard";
import { fmtRating, RatingBadge } from "./PlayerRating";

// the records worth naming, with the Records page's titles
const RECORD_TITLES: Record<string, string> = {
  "game/fastest": "Fastest wins",
  "game/longest": "Longest games",
  "game/bloodiest": "Most kills in a game",
  "game/comebacks": "Won with the biggest gold deficit (end of game)",
  "player/kills": "Most kills by one player",
  "player/assists": "Most assists by one player",
  "player/dmg": "Most damage in a game",
  "player/cs": "Most CS in a game",
  "player/perfect": "Best deathless games (kills + assists)",
  "team/streaks": "Longest win streaks",
};
const mmss = (m: number) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;
const recordValue = (k: string, v: number) => (k === "fastest" || k === "longest" ? mmss(v) : k === "comebacks" ? `${(v / 1000).toFixed(1)}k` : String(v));
const recordWho = (r: Record<string, string | number>) => String(r.pl ? `${r.pl}${r.team ? ` (${r.team})` : ""}` : r.w || r.team || "");

/** The week as Markdown for a Reddit post (English: the post is for r/leagueoflegends and r/lolesports). */
function markdown(w: HubWeekly): string {
  const L: string[] = [`# The week in pro League: ${w.from} to ${w.to}`, "", `${w.series} series, ${w.games} games in the top leagues and international events.`, ""];
  if (w.upsets.length) {
    L.push("## Biggest upsets", "");
    for (const u of w.upsets) L.push(`- **${u.w}** beat ${u.l} ${u.s} (${Math.round(u.p * 100)}% before game 1) · ${u.t}`);
    L.push("");
  }
  if (w.movers.length) {
    L.push("## Power rankings movers", "");
    for (const m of w.movers.slice(0, 6)) L.push(`- ${m.n} (${m.lg}): ${m.chg > 0 ? "+" : ""}${m.chg} to ${m.r}`);
    L.push("");
  }
  if (w.records.length) {
    L.push("## All-time records set", "");
    for (const r of w.records) L.push(`- ${RECORD_TITLES[`${r.s}/${r.k}`] || r.k}: ${recordValue(r.k, Number(r.r.v))} · ${recordWho(r.r)}`);
    L.push("");
  }
  if (w.best.length) {
    L.push("## Best games (game rating 0-100)", "");
    for (const b of w.best) L.push(`- ${b.r}: ${b.a} vs ${b.b}, game ${b.gn} · ${b.t} · ${SITE_URL}match/${b.g}?g=${b.gn}`);
    L.push("");
  }
  if (w.players?.length) {
    L.push("## Players of the week (RiftWise rating, 6 is an average game)", "");
    for (const p of w.players) L.push(`- **${p.n}**${p.t ? ` (${p.t})` : ""}: ${p.rt.toFixed(1)} over ${p.g} games`);
    L.push("");
  }
  if (w.champs?.length) {
    L.push("## Most picked or banned", "");
    for (const [c, pk, bn, wn] of w.champs.slice(0, 5)) L.push(`- ${c}: ${pk} picks (${pk ? Math.round((wn / pk) * 100) : 0}% wins), ${bn} bans`);
    L.push("");
  }
  L.push(`Every result, chance and record: ${SITE_URL}stats/weekly`);
  return L.join("\n");
}

const CopyMarkdown: React.FC<{ w: HubWeekly }> = ({ w }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(markdown(w)).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        })
      }
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
    >
      {done ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
      {done ? tl("Copied") : tl("Copy for Reddit")}
    </button>
  );
};

/** Short summary for X / Discord (with canonical link). */
const CopyWeeklyPost: React.FC<{ w: HubWeekly; range: string }> = ({ w, range }) => {
  const [done, setDone] = useState(false);
  const text = () => {
    const lines = [
      `${tl("The week in pro League")} (${range}) — ${tn("{n} series", "{n} series", w.series)}, ${tn("{n} game", "{n} games", w.games)}`,
    ];
    if (w.upsets[0]) {
      const u = w.upsets[0];
      lines.push(`${tl("Biggest upsets")}: ${tl("{w} beat {l}", { w: u.w, l: u.l })} ${u.s} (${Math.round(u.p * 100)}%)`);
    }
    if (w.movers[0]) {
      const m = w.movers[0];
      lines.push(`${tl("Power rankings movers")}: ${m.n} (${m.chg > 0 ? "+" : ""}${m.chg} → ${m.r})`);
    }
    if (w.best[0]) {
      const b = w.best[0];
      lines.push(`${tl("Best games")}: ${b.a} vs ${b.b} (${b.r})`);
    }
    if (w.players?.[0]) {
      const p = w.players[0];
      lines.push(`${tl("Players of the week")}: ${p.n} (${p.rt.toFixed(1)})`);
    }
    lines.push(`${SITE_URL}stats/weekly`);
    return lines.join("\n");
  };
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text()).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        })
      }
      title={`${tl("Copy post")}: ${tl("Copy a ready-to-post summary with the link, for X or Discord")}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
    >
      {done ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
      {done ? tl("Copied") : tl("Copy post")}
    </button>
  );
};

export const WeeklyPage: React.FC = () => {
  usePageTitle(tl("The week in pro League"));
  const state = useLoad(loadWeekly, []);
  // the results are spoilers: hidden in spoiler mode until revealed, like a team's recent games
  const [hidden, reveal] = useHidden("weekly", state.data?.to);
  return <Page state={state}>{(w) => <Week w={w} hidden={hidden} reveal={reveal} />}</Page>;
};

const Week: React.FC<{ w: HubWeekly; hidden: boolean; reveal: () => void }> = ({ w, hidden, reveal }) => {
  const range = `${fmtDate(w.from, false)} – ${fmtDate(w.to)}`;
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  return (
    <div className="rw-page">
      <div className={`rw-span ${card}`}>
        <h1 className="text-lg font-bold text-rw-text">{tl("The week in pro League")}</h1>
        <p className="text-[11px] text-rw-sub">
          <HubLink to={{ kind: "finder" }} className="hover:text-rw-accent hover:underline">
            {range}
          </HubLink>{" "}
          ·{" "}
          <HubLink to={{ kind: "finder" }} className="hover:text-rw-accent hover:underline">
            {tn("{n} series", "{n} series", w.series)}
          </HubLink>{" "}
          ·{" "}
          <HubLink to={{ kind: "finder" }} className="hover:text-rw-accent hover:underline">
            {tn("{n} game", "{n} games", w.games)}
          </HubLink>{" "}
          · {tl("top leagues and international events")}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <BroadcastCardButton
            data={() =>
              listCard({
                section: tl("The week in pro League"),
                name: range,
                sub: tn("{n} series", "{n} series", w.series),
                rows: [
                  ...w.upsets.slice(0, 3).map((u) => ({ label: tl("{w} beat {l}", { w: u.w, l: u.l }), sub: `${u.s} · ${u.t}`, value: pct(u.p) })),
                  ...w.movers.slice(0, 3).map((m) => ({ label: m.n, sub: m.lg, value: `${m.chg > 0 ? "+" : ""}${m.chg}` })),
                  ...w.best.slice(0, 3).map((b) => ({ label: `${b.a} vs ${b.b}`, sub: b.t, value: String(b.r) })),
                ],
              })
            }
            name={`riftwise-week-${w.to}`}
            label={tl("Overview card")}
          />
          <CopyWeeklyPost w={w} range={range} />
          <CopyMarkdown w={w} />
        </div>
      </div>
      {hidden ? (
        <div className={`rw-span ${card} flex items-center gap-3 text-xs text-rw-sub`}>
          <span>{tl("Spoiler mode is on, so the week's results stay hidden.")}</span>
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <div className="rw-span grid gap-3 md:grid-cols-2 3xl:grid-cols-3 items-start">
          <Section
            title={tl("Biggest upsets")}
            right={
              w.upsets.length > 0 ? (
                <SectionCard
                  section={tl("Biggest upsets")}
                  name={range}
                  rows={() =>
                    w.upsets.map((u) => ({
                      label: `${tl("{w} beat {l}", { w: u.w, l: u.l })} (${u.s})`,
                      sub: `${u.t} · ${fmtDate(u.date)}`,
                      value: pct(u.p),
                      win: true,
                    }))
                  }
                />
              ) : undefined
            }
            share="weekly-upsets"
          >
            {w.upsets.length ? (
              <ol className="text-xs space-y-1.5">
                {w.upsets.map((u) => {
                  const winPct = Math.max(4, Math.min(96, Math.round(u.p * 100)));
                  return (
                    <li key={u.g} className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <HubLink to={{ kind: "match", slug: u.g }} className="text-rw-accent font-bold tabular-nums shrink-0 hover:underline">
                          {pct(u.p)}
                        </HubLink>
                        <HubLink to={{ kind: "team", slug: prettySlug(u.w) }} title={u.w} className="shrink-0">
                          <TeamLogo name={u.w} size={14} />
                        </HubLink>
                        <span className="truncate min-w-0">
                          <HubLink to={{ kind: "match", slug: u.g }}>{tl("{w} beat {l}", { w: u.w, l: u.l })}</HubLink>{" "}
                          <HubLink to={{ kind: "match", slug: u.g }} className="text-rw-sub hover:text-rw-accent hover:underline">
                            {u.s}
                          </HubLink>
                        </span>
                        <HubLink to={{ kind: "team", slug: prettySlug(u.l) }} title={u.l} className="shrink-0">
                          <TeamLogo name={u.l} size={14} />
                        </HubLink>
                      </div>
                      <div className="text-[10px] text-rw-muted truncate">
                        <EventLink name={u.t} u={u.e} className="text-rw-muted hover:text-rw-accent hover:underline" /> ·{" "}
                        <HubLink to={{ kind: "match", slug: u.g }} className="hover:text-rw-accent hover:underline">
                          {fmtDate(u.date)}
                        </HubLink>
                      </div>
                      <div className="h-1 rounded-full bg-rw-raised overflow-hidden flex" aria-hidden="true">
                        <div className="h-full bg-rw-accent/85" style={{ width: `${winPct}%` }} />
                        <div className="h-full bg-rw-sub/25" style={{ width: `${100 - winPct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-xs text-rw-sub">{tl("No upsets this week: the favourites won.")}</p>
            )}
            <p className="text-[10px] text-rw-muted">{tl("The winner's chance before game 1, from the power rankings.")}</p>
          </Section>
          <Section
            title={tl("Power rankings movers")}
            right={
              w.movers.length > 0 ? (
                <SectionCard
                  section={tl("Power rankings movers")}
                  name={range}
                  rows={() =>
                    w.movers.map((m) => ({
                      label: m.n,
                      sub: `${m.lg} · ${m.r.toLocaleString(locale())}`,
                      value: `${m.chg > 0 ? "▲" : "▼"}${Math.abs(m.chg)}`,
                      win: m.chg > 0,
                    }))
                  }
                />
              ) : undefined
            }
            share="weekly-movers"
          >
            {w.movers.length ? (
              (() => {
                const maxChg = Math.max(1, ...w.movers.map((m) => Math.abs(m.chg)));
                return (
                  <ol className="text-xs space-y-1.5">
                    {w.movers.map((m) => (
                      <li key={m.u} className="space-y-0.5 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 min-w-0">
                          <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                            <HubLink to={{ kind: "team", slug: m.u }} title={m.n} className="shrink-0">
                              <TeamLogo name={m.n} size={15} />
                            </HubLink>
                            <TeamLink name={m.n} u={m.u} />{" "}
                            <HubLink to={{ kind: "league", slug: resolveLeagueSlug(m.lg) }} className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline">
                              {m.lg}
                            </HubLink>
                          </span>
                          <span className="font-num tabular-nums shrink-0">
                            <HubLink
                              to={{ kind: "team", slug: m.u, tab: "matches" }}
                              className={m.chg > 0 ? "text-rw-teal font-bold hover:underline" : "text-rw-red font-bold hover:underline"}
                            >
                              {m.chg > 0 ? "▲" : "▼"}
                              {Math.abs(m.chg)}
                            </HubLink>{" "}
                            <HubLink
                              to={{ kind: "rankings", ...(m.lg ? { query: `league=${encodeURIComponent(m.lg)}` } : {}) }}
                              className="text-rw-muted hover:text-rw-accent hover:underline"
                            >
                              {m.r.toLocaleString(locale())}
                            </HubLink>
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                          <div
                            className={`h-full rounded-full ${m.chg > 0 ? "bg-rw-teal/75" : "bg-rw-red/65"}`}
                            style={{ width: `${Math.max(8, Math.round((Math.abs(m.chg) / maxChg) * 100))}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              })()
            ) : (
              <p className="text-xs text-rw-sub">{tl("Not enough rating history yet.")}</p>
            )}
          </Section>
          {w.records.length > 0 && (
            <Section
              title={tl("All-time records set")}
              right={
                <SectionCard
                  section={tl("All-time records set")}
                  name={range}
                  rows={() =>
                    w.records.map((r) => ({
                      label: tl(RECORD_TITLES[`${r.s}/${r.k}`] || r.k),
                      sub: recordWho(r.r),
                      value: recordValue(r.k, Number(r.r.v)),
                      win: true,
                    }))
                  }
                />
              }
              share="weekly-records"
            >
              <ol className="text-xs space-y-1.5">
                {w.records.map((r) => (
                  <li key={`${r.s}/${r.k}`} className="min-w-0">
                    <div className="truncate text-rw-text">
                      <HubLink to={{ kind: "records" }} className="hover:text-rw-accent hover:underline">
                        {tl(RECORD_TITLES[`${r.s}/${r.k}`] || r.k)}
                      </HubLink>
                    </div>
                    <div className="text-[10px] text-rw-muted truncate">
                      <HubLink
                        to={r.r.g ? { kind: "match", slug: String(r.r.g), game: Number(r.r.gn) || undefined } : { kind: "records" }}
                        className="text-rw-accent font-bold hover:underline"
                      >
                        {recordValue(r.k, Number(r.r.v))}
                      </HubLink>{" "}
                      ·{" "}
                      {r.r.pl ? (
                        <>
                          <PlayerLink name={String(r.r.pl)} className="text-rw-sub hover:text-rw-accent hover:underline" />
                          {r.r.team ? (
                            <>
                              {" ("}
                              <TeamLink name={String(r.r.team)} className="text-rw-muted hover:text-rw-accent hover:underline" />
                              {")"}
                            </>
                          ) : null}
                        </>
                      ) : r.r.w || r.r.team ? (
                        <TeamLink name={String(r.r.w || r.r.team)} className="text-rw-sub hover:text-rw-accent hover:underline" />
                      ) : (
                        recordWho(r.r)
                      )}
                      {r.r.g ? (
                        <>
                          {" · "}
                          <HubLink to={{ kind: "match", slug: String(r.r.g), game: Number(r.r.gn) || undefined }}>{tl("the game")}</HubLink>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          <Section
            title={tl("Best games")}
            right={
              w.best.length > 0 ? (
                <SectionCard
                  section={tl("Best games")}
                  name={range}
                  rows={() =>
                    w.best.map((b) => ({
                      label: tl("{a} vs {b}, game {n}", { a: b.a, b: b.b, n: b.gn }),
                      sub: `${b.t} · ${fmtDate(b.date)}`,
                      value: String(b.r),
                      win: true,
                    }))
                  }
                />
              ) : undefined
            }
            share="weekly-best"
          >
            {w.best.length ? (
              <ol className="text-xs space-y-1.5">
                {w.best.map((b) => (
                  <li key={`${b.g}-${b.gn}`} className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <HubLink to={{ kind: "match", slug: b.g, game: b.gn }} className="text-rw-accent font-bold tabular-nums shrink-0 hover:underline">
                        {b.r}
                      </HubLink>
                      <HubLink to={{ kind: "team", slug: prettySlug(b.a) }} title={b.a} className="shrink-0">
                        <TeamLogo name={b.a} size={14} />
                      </HubLink>
                      <HubLink to={{ kind: "match", slug: b.g, game: b.gn }} className="truncate">
                        {tl("{a} vs {b}, game {n}", { a: b.a, b: b.b, n: b.gn })}
                      </HubLink>
                      <HubLink to={{ kind: "team", slug: prettySlug(b.b) }} title={b.b} className="shrink-0">
                        <TeamLogo name={b.b} size={14} />
                      </HubLink>
                    </div>
                    <div className="text-[10px] text-rw-muted truncate">
                      <EventLink name={b.t} u={b.e} className="text-rw-muted hover:text-rw-accent hover:underline" /> ·{" "}
                      <HubLink to={{ kind: "match", slug: b.g, game: b.gn }} className="hover:text-rw-accent hover:underline">
                        {fmtDate(b.date)}
                      </HubLink>
                    </div>
                    <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-full bg-rw-accent/75" style={{ width: `${Math.max(10, Math.min(100, b.r))}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-rw-sub">{tl("No rated games yet this week.")}</p>
            )}
          </Section>
          {w.players && w.players.length > 0 && (
            <Section
              title={tl("Players of the week")}
              right={
                <SectionCard
                  section={tl("Players of the week")}
                  name={range}
                  rows={() =>
                    w.players!.map((p, i) => ({
                      label: `#${i + 1} · ${p.n}`,
                      sub: [p.r ? roleName(p.r) : "", p.t, `${p.g}G`].filter(Boolean).join(" · "),
                      value: fmtRating(p.rt),
                      win: true,
                    }))
                  }
                />
              }
              share="weekly-players"
            >
              <ol className="text-xs space-y-1.5">
                {w.players.map((p, i) => (
                  <li key={p.u || p.n} className="space-y-0.5 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                        <span className="text-rw-muted tabular-nums">{i + 1}.</span>
                        <HubLink to={{ kind: "player", slug: p.u || prettySlug(p.n) }} title={p.n} className="shrink-0">
                          <PlayerPhoto name={p.n} team={p.t} slug={p.u ?? undefined} size={18} />
                        </HubLink>
                        <PlayerLink name={p.n} u={p.u} />
                        {p.t && (
                          <HubLink to={{ kind: "team", slug: prettySlug(p.t) }} title={p.t} className="shrink-0">
                            <TeamLogo name={p.t} size={13} />
                          </HubLink>
                        )}
                        <span className="text-rw-muted truncate">
                          {p.r ? (
                            <>
                              {"· "}
                              <HubLink to={{ kind: "player", slug: p.u || prettySlug(p.n), tab: "stats" }} className="hover:text-rw-accent hover:underline">
                                {roleName(p.r)}
                              </HubLink>
                            </>
                          ) : (
                            ""
                          )}
                          {p.t ? (
                            <>
                              {" · "}
                              <TeamLink name={p.t} className="text-rw-muted hover:text-rw-accent hover:underline" />
                            </>
                          ) : null}
                        </span>
                      </span>
                      <HubLink
                        to={{ kind: "player", slug: p.u || prettySlug(p.n), tab: "matches" }}
                        className="shrink-0 hover:opacity-85"
                        title={tl("Recent games")}
                      >
                        <RatingBadge v={p.rt} title={tl("Average RiftWise rating over {n} games (6 is an average game)", { n: p.g })} />
                      </HubLink>
                    </div>
                    {p.best && (
                      <div className="flex items-center gap-1 text-[10px] text-rw-muted truncate">
                        <HubLink to={{ kind: "champ", slug: prettySlug(p.best.c) }} title={champName(p.best.c)} className="shrink-0">
                          <ChampIcon name={p.best.c} size={12} />
                        </HubLink>
                        <span className="truncate">
                          <HubLink to={{ kind: "match", slug: p.best.g, game: p.best.gn }} className="hover:text-rw-accent hover:underline">
                            {tl("Best: {rating} on {champion} vs {team}", { rating: fmtRating(p.best.rt), champion: champName(p.best.c), team: p.best.opp })}
                          </HubLink>
                          {" · "}
                          <HubLink to={{ kind: "match", slug: p.best.g, game: p.best.gn }}>{tl("the game")}</HubLink>
                        </span>
                        <HubLink to={{ kind: "team", slug: prettySlug(p.best.opp) }} title={p.best.opp} className="shrink-0">
                          <TeamLogo name={p.best.opp} size={12} />
                        </HubLink>
                      </div>
                    )}
                    <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-rw-teal/75"
                        style={{ width: `${Math.max(10, Math.min(100, Math.round((p.rt / 10) * 100)))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-[10px] text-rw-muted">
                {tl("Two games or more.")}{" "}
                <HubLink to={{ kind: "about" }} className="text-rw-accent hover:underline">
                  {tl("How the rating works")}
                </HubLink>
              </p>
            </Section>
          )}
          {w.champs && w.champs.length > 0 && (
            <Section
              title={tl("Picks and bans this week")}
              right={
                <SectionCard
                  section={tl("Picks and bans this week")}
                  name={range}
                  rows={() =>
                    w.champs!.slice(0, 12).map(([c, pk, bn, wn]) => ({
                      label: champName(c),
                      sub: `${pk} ${tl("Picks")} · ${bn} ${tl("Bans")}`,
                      value: `${w.champGames ? `${Math.round(((pk + bn) / w.champGames) * 100)}%` : "–"}${pk ? ` · ${Math.round((wn / pk) * 100)}%` : ""}`,
                      win: pk >= 3 ? wn / pk >= 0.5 : undefined,
                    }))
                  }
                />
              }
              share="weekly-champs"
            >
              <STable className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={th}>{tl("Champion")}</th>
                    <th className={th}>{tl("Presence")}</th>
                    <th className={th}>{tl("Picks")}</th>
                    <th className={th}>{tl("Bans")}</th>
                    <th className={th}>{tl("Win %")}</th>
                  </tr>
                </thead>
                <tbody>
                  {w.champs.map(([c, pk, bn, wn]) => {
                    const cg = Math.max(w.champGames || 1, 1);
                    const presPct = w.champGames ? Math.min(100, Math.round(((pk + bn) / cg) * 100)) : null;
                    const pickW = Math.min(100, Math.round((pk / cg) * 100));
                    const banW = Math.min(100 - pickW, Math.round((bn / cg) * 100));
                    const wrPct = pk ? Math.round((wn / pk) * 100) : null;
                    const wrTone = pk >= 3 && wrPct != null ? (wrPct >= 53 ? "text-rw-teal font-semibold" : wrPct <= 47 ? "text-rw-red" : "text-rw-text") : "text-rw-sub";
                    return (
                      <tr key={c} className="border-t border-rw-border">
                        <td className={`${td} max-w-[9rem]`} data-sort={champName(c)}>
                          <ChampLink name={c} size={18} />
                        </td>
                        <td className={`${td} tabular-nums`} data-sort={presPct ?? -1}>
                          {presPct != null ? (
                            <HubLink
                              to={{ kind: "finder", query: `${pk > 0 ? "champ" : "ban"}=${encodeURIComponent(c)}` }}
                              className="block min-w-[3.75rem] space-y-0.5 hover:opacity-90"
                              title={tl("Game finder")}
                            >
                              <div className="font-semibold text-rw-text hover:text-rw-accent">{presPct}%</div>
                              <div className="h-1 rounded-full bg-rw-raised overflow-hidden flex" aria-hidden="true">
                                <div className="h-full bg-rw-teal/80" style={{ width: `${pickW}%` }} />
                                <div className="h-full bg-rw-red/65" style={{ width: `${banW}%` }} />
                              </div>
                            </HubLink>
                          ) : (
                            "–"
                          )}
                        </td>
                        <td className={`${td} tabular-nums text-rw-sub`} data-sort={pk}>
                          {pk > 0 ? (
                            <HubLink
                              to={{ kind: "finder", query: `champ=${encodeURIComponent(c)}` }}
                              className="hover:text-rw-accent hover:underline"
                              title={tl("Game finder")}
                            >
                              {pk}
                            </HubLink>
                          ) : (
                            pk
                          )}
                        </td>
                        <td className={`${td} tabular-nums text-rw-sub`} data-sort={bn}>
                          {bn > 0 ? (
                            <HubLink
                              to={{ kind: "finder", query: `ban=${encodeURIComponent(c)}` }}
                              className="hover:text-rw-accent hover:underline"
                              title={tl("Game finder")}
                            >
                              {bn}
                            </HubLink>
                          ) : (
                            bn
                          )}
                        </td>
                        <td className={`${td} tabular-nums`} data-sort={wrPct ?? -1}>
                          {wrPct != null ? (
                            <HubLink
                              to={{ kind: "finder", query: `champ=${encodeURIComponent(c)}` }}
                              className="block min-w-[3.25rem] space-y-0.5 hover:opacity-90"
                              title={tl("Game finder")}
                            >
                              <div className={`${wrTone} hover:underline`}>{wrPct}%</div>
                              {pk >= 3 && (
                                <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                                  <div className={`h-full rounded-full ${wrPct >= 50 ? "bg-rw-teal/75" : "bg-rw-red/65"}`} style={{ width: `${Math.max(6, wrPct)}%` }} />
                                </div>
                              )}
                            </HubLink>
                          ) : (
                            "–"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </STable>
              <p className="text-[10px] text-rw-muted">
                <HubLink to={{ kind: "champions" }} className="hover:text-rw-accent hover:underline">
                  {tn("Picked or banned in the week's {n} game.", "Picked or banned in the week's {n} games.", w.champGames || 0)}
                </HubLink>
              </p>
            </Section>
          )}
          <div className="md:col-span-2">
            <Section title={tl("Every result")} share="weekly-results">
              <ul className="text-xs divide-y divide-rw-border/60">
                {w.results.map((r) => (
                  <li key={r.g} className="flex items-center gap-2 py-1 min-w-0">
                    <HubLink to={{ kind: "match", slug: r.g }} className="w-14 shrink-0 text-[10px] text-rw-muted hover:text-rw-accent hover:underline">
                      {fmtDate(r.date, false)}
                    </HubLink>
                    <span className={`flex-1 min-w-0 flex items-center justify-end gap-1.5 text-right ${r.sa > r.sb ? "font-bold text-rw-text" : "text-rw-sub"}`}>
                      <span className="truncate">
                        <TeamLink name={r.a} u={r.au} />
                      </span>
                      <HubLink to={{ kind: "team", slug: r.au || prettySlug(r.a) }} title={r.a} className="shrink-0">
                        <TeamLogo name={r.a} size={15} />
                      </HubLink>
                    </span>
                    <HubLink to={{ kind: "match", slug: r.g }} className="inline-flex flex-col items-center justify-center w-11 shrink-0 hover:text-rw-accent gap-0.5">
                      <span className="font-num tabular-nums font-bold text-center leading-none">
                        {r.sa}–{r.sb}
                      </span>
                      {r.sa + r.sb > 0 && (
                        <span className="w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden flex" aria-hidden="true">
                          <span
                            className={`h-full ${r.sa > r.sb ? "bg-rw-teal/85" : "bg-rw-sub/55"}`}
                            style={{ width: `${Math.round((r.sa / (r.sa + r.sb)) * 100)}%` }}
                          />
                          <span
                            className={`h-full ${r.sb > r.sa ? "bg-rw-teal/85" : "bg-rw-sub/35"}`}
                            style={{ width: `${100 - Math.round((r.sa / (r.sa + r.sb)) * 100)}%` }}
                          />
                        </span>
                      )}
                    </HubLink>
                    <span className={`flex-1 min-w-0 flex items-center gap-1.5 ${r.sb > r.sa ? "font-bold text-rw-text" : "text-rw-sub"}`}>
                      <HubLink to={{ kind: "team", slug: r.bu || prettySlug(r.b) }} title={r.b} className="shrink-0">
                        <TeamLogo name={r.b} size={15} />
                      </HubLink>
                      <span className="truncate">
                        <TeamLink name={r.b} u={r.bu} />
                      </span>
                    </span>
                    <span className="hidden sm:block w-48 shrink-0 truncate text-[10px] text-rw-muted">
                      <EventLink name={r.t} u={r.e} className="text-rw-muted hover:text-rw-accent hover:underline" />
                    </span>
                    {r.au && r.bu && (
                      <span className="hidden md:inline-flex items-center gap-1.5 shrink-0 text-[10px]">
                        <HubLink
                          to={{
                            kind: "prep",
                            a: r.au,
                            b: r.bu,
                            ...(/^\d{4}$/.test((r.date || "").slice(0, 4)) ? { period: `y${(r.date || "").slice(0, 4)}` } : {}),
                          }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                        >
                          {tl("Match prep")}
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "compare",
                            mode: "team",
                            a: r.au,
                            b: r.bu,
                            ...(/^\d{4}$/.test((r.date || "").slice(0, 4)) ? { period: `y${(r.date || "").slice(0, 4)}` } : {}),
                          }}
                          className="text-rw-muted hover:text-rw-accent hover:underline"
                        >
                          {tl("Compare")}
                        </HubLink>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
};
