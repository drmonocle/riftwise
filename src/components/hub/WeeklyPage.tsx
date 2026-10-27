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
import { loadWeekly } from "../../hub/data";
import type { HubWeekly } from "../../hub/types";
import { SITE_URL } from "../../platform";
import { card, ChampLink, EventLink, fmtDate, HubLink, Page, PlayerLink, RevealButton, Section, TeamLink, th, td, useHidden, useLoad, usePageTitle } from "./ui";
import { BroadcastCardButton, listCard } from "./BroadcastCard";
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
      <div className={card}>
        <h1 className="text-lg font-bold text-rw-text">{tl("The week in pro League")}</h1>
        <p className="text-[11px] text-rw-sub">
          {range} · {tn("{n} series", "{n} series", w.series)} · {tn("{n} game", "{n} games", w.games)} · {tl("top leagues and international events")}
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
          <CopyMarkdown w={w} />
        </div>
      </div>
      {hidden ? (
        <div className={`${card} flex items-center gap-3 text-xs text-rw-sub`}>
          <span>{tl("Spoiler mode is on, so the week's results stay hidden.")}</span>
          <RevealButton onReveal={reveal} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title={tl("Biggest upsets")} share="weekly-upsets">
            {w.upsets.length ? (
              <ol className="text-xs space-y-1.5">
                {w.upsets.map((u) => (
                  <li key={u.g} className="min-w-0">
                    <div className="truncate">
                      <span className="text-rw-accent font-bold mr-1">{pct(u.p)}</span>
                      <HubLink to={{ kind: "match", slug: u.g }}>{tl("{w} beat {l}", { w: u.w, l: u.l })}</HubLink> <span className="text-rw-sub">{u.s}</span>
                    </div>
                    <div className="text-[10px] text-rw-muted truncate">
                      <EventLink name={u.t} u={u.e} className="text-rw-muted hover:text-rw-accent hover:underline" /> · {fmtDate(u.date)}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-rw-sub">{tl("No upsets this week: the favourites won.")}</p>
            )}
            <p className="text-[10px] text-rw-muted">{tl("The winner's chance before game 1, from the power rankings.")}</p>
          </Section>
          <Section title={tl("Power rankings movers")} share="weekly-movers">
            {w.movers.length ? (
              <ol className="text-xs space-y-1">
                {w.movers.map((m) => (
                  <li key={m.u} className="flex items-baseline justify-between gap-2 min-w-0">
                    <span className="truncate">
                      <TeamLink name={m.n} u={m.u} /> <span className="text-[10px] text-rw-muted">{m.lg}</span>
                    </span>
                    <span className="font-num tabular-nums shrink-0">
                      <span className={m.chg > 0 ? "text-rw-teal font-bold" : "text-rw-red font-bold"}>
                        {m.chg > 0 ? "▲" : "▼"}
                        {Math.abs(m.chg)}
                      </span>{" "}
                      <span className="text-rw-muted">{m.r.toLocaleString(locale())}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-rw-sub">{tl("Not enough rating history yet.")}</p>
            )}
          </Section>
          {w.records.length > 0 && (
            <Section title={tl("All-time records set")} share="weekly-records">
              <ol className="text-xs space-y-1.5">
                {w.records.map((r) => (
                  <li key={`${r.s}/${r.k}`} className="min-w-0">
                    <div className="truncate text-rw-text">{tl(RECORD_TITLES[`${r.s}/${r.k}`] || r.k)}</div>
                    <div className="text-[10px] text-rw-muted truncate">
                      <span className="text-rw-accent font-bold">{recordValue(r.k, Number(r.r.v))}</span> · {recordWho(r.r)}
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
          <Section title={tl("Best games")} share="weekly-best">
            {w.best.length ? (
              <ol className="text-xs space-y-1.5">
                {w.best.map((b) => (
                  <li key={`${b.g}-${b.gn}`} className="min-w-0">
                    <div className="truncate">
                      <span className="text-rw-accent font-bold mr-1">{b.r}</span>
                      <HubLink to={{ kind: "match", slug: b.g, game: b.gn }}>{tl("{a} vs {b}, game {n}", { a: b.a, b: b.b, n: b.gn })}</HubLink>
                    </div>
                    <div className="text-[10px] text-rw-muted truncate">
                      <EventLink name={b.t} u={b.e} className="text-rw-muted hover:text-rw-accent hover:underline" /> · {fmtDate(b.date)}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-rw-sub">{tl("No rated games yet this week.")}</p>
            )}
          </Section>
          {w.players && w.players.length > 0 && (
            <Section title={tl("Players of the week")} share="weekly-players">
              <ol className="text-xs space-y-1.5">
                {w.players.map((p, i) => (
                  <li key={p.u || p.n} className="min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="truncate min-w-0">
                        <span className="text-rw-muted mr-1 tabular-nums">{i + 1}.</span>
                        <PlayerLink name={p.n} u={p.u} />
                        <span className="text-rw-muted"> · {[p.r ? roleName(p.r) : "", p.t].filter(Boolean).join(" · ")}</span>
                      </span>
                      <RatingBadge v={p.rt} title={tl("Average RiftWise rating over {n} games (6 is an average game)", { n: p.g })} />
                    </div>
                    {p.best && (
                      <div className="text-[10px] text-rw-muted truncate">
                        {tl("Best: {rating} on {champion} vs {team}", { rating: fmtRating(p.best.rt), champion: champName(p.best.c), team: p.best.opp })}
                        {" · "}
                        <HubLink to={{ kind: "match", slug: p.best.g, game: p.best.gn }}>{tl("the game")}</HubLink>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <p className="text-[10px] text-rw-muted">
                {tl("Two games or more.")}{" "}
                <HubLink to={{ kind: "about" }} className="text-rw-teal hover:underline">
                  {tl("How the rating works")}
                </HubLink>
              </p>
            </Section>
          )}
          {w.champs && w.champs.length > 0 && (
            <Section title={tl("Picks and bans this week")} share="weekly-champs">
              <table className="w-full text-xs">
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
                  {w.champs.map(([c, pk, bn, wn]) => (
                    <tr key={c} className="border-t border-rw-border">
                      <td className={`${td} max-w-[9rem]`}>
                        <ChampLink name={c} size={18} />
                      </td>
                      <td className={`${td} tabular-nums text-rw-sub`}>{w.champGames ? `${Math.round(((pk + bn) / w.champGames) * 100)}%` : "–"}</td>
                      <td className={`${td} tabular-nums text-rw-sub`}>{pk}</td>
                      <td className={`${td} tabular-nums text-rw-sub`}>{bn}</td>
                      <td className={`${td} tabular-nums text-rw-sub`}>{pk ? `${Math.round((wn / pk) * 100)}%` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-rw-muted">{tn("Picked or banned in the week's {n} game.", "Picked or banned in the week's {n} games.", w.champGames || 0)}</p>
            </Section>
          )}
          <div className="md:col-span-2">
            <Section title={tl("Every result")} share="weekly-results">
              <ul className="text-xs divide-y divide-rw-border/60">
                {w.results.map((r) => (
                  <li key={r.g} className="flex items-center gap-2 py-1 min-w-0">
                    <span className="w-14 shrink-0 text-[10px] text-rw-muted">{fmtDate(r.date, false)}</span>
                    <span className={`flex-1 min-w-0 text-right truncate ${r.sa > r.sb ? "font-bold text-rw-text" : "text-rw-sub"}`}>
                      <TeamLink name={r.a} u={r.au} />
                    </span>
                    <HubLink to={{ kind: "match", slug: r.g }} className="font-num tabular-nums font-bold w-10 text-center shrink-0 hover:text-rw-accent">
                      {r.sa}–{r.sb}
                    </HubLink>
                    <span className={`flex-1 min-w-0 truncate ${r.sb > r.sa ? "font-bold text-rw-text" : "text-rw-sub"}`}>
                      <TeamLink name={r.b} u={r.bu} />
                    </span>
                    <span className="hidden sm:block w-48 shrink-0 truncate text-[10px] text-rw-muted">
                      <EventLink name={r.t} u={r.e} className="text-rw-muted hover:text-rw-accent hover:underline" />
                    </span>
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
