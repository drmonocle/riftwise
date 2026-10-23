/**
 * The Worlds, MSI and First Stand pages: headline facts from every game (one year, or every year together), and for
 * Worlds the Swiss stage and knockout pickers with the power ratings' chances (pick by hand, fill with the favourites,
 * roll by the chances or flip a coin, or play the rest out thousands of times). Picks stay on this device.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, Dice5, Eraser, Lock, RefreshCw, Shuffle, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { eventName, eventTitle, stageName, tk, tl } from "../../i18n";
import { loadEventLines, loadHubEvent, loadHubTitles, loadLeague, loadRatings } from "../../hub/data";
import type { EventListItem, HubEvent, HubLeague, HubRatings } from "../../hub/types";
import { hubShareUrl, navigateHub } from "../../hub/route";
import {
  coin, favourites, quarterPairs, rng, roller, runKnockout, runSwiss, simulate,
  withLive, withLiveKo,
  type Fill, type LiveResult, type Picks, type RealSeries, type TeamOdds, type WMatch, type WTeam,
} from "../../hub/worlds";
import type { Match } from "../../types";
import { normalizeTeamCode } from "../../helpers";
import { eventFacts, factText, gamesOf, type Fact } from "../../hub/worldsFacts";
import { detectBracket, realOfStages, runBracket, simulateBracket, type Bracket } from "../../hub/bracket";
import { BroadcastCardButton, SectionCard, chancesCard } from "./BroadcastCard";
import { RegionStats } from "./RegionStats";
import { ChampIcon, Failed, HubLink, Loading, PlayerLink, RevealButton, Section, TeamLink, TeamLogo, useHidden, useLoad, usePageTitle } from "./ui";

/** The three international events with a page of their own; Worlds has had a Swiss stage since 2023. */
export type IntlKind = "worlds" | "msi" | "first-stand";
const INTL: Record<IntlKind, { league: string; name: string; swissFrom: number | null }> = {
  worlds: { league: "world-championship", name: "Worlds", swissFrom: 2023 },
  msi: { league: "mid-season-invitational", name: "MSI", swissFrom: null },
  "first-stand": { league: "first-stand", name: "First Stand", swissFrom: null },
};
const ALL = "all";
const pill = (on: boolean) =>
  `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
    on ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
  }`;
const btn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50 disabled:opacity-50";
const pctText = (p: number) => (p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

// ── saved picks (this device) ─────────────────────────────────────────────

interface Saved {
  seed: number;
  koSeed: number;
  swiss: Picks;
  ko: Picks;
}
const storeKey = (key: string) => `riftwatch_${key.includes("_") ? key : `worlds_${key}`}`;
function loadSaved(year: string): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey(year)) || "null");
    if (s && typeof s.seed === "number") return { seed: s.seed, koSeed: s.koSeed || 1, swiss: s.swiss || {}, ko: s.ko || {} };
  } catch {
    /* fresh */
  }
  return { seed: 1, koSeed: 1, swiss: {}, ko: {} };
}
function useSaved(year: string): [Saved, (s: Saved) => void] {
  const [saved, setSaved] = useState(() => loadSaved(year));
  useEffect(() => setSaved(loadSaved(year)), [year]);
  const put = (s: Saved) => {
    setSaved(s);
    try {
      localStorage.setItem(storeKey(year), JSON.stringify(s));
    } catch {
      /* storage full: picks last this visit */
    }
  };
  return [saved, put];
}

// ── the page ──────────────────────────────────────────────────────────────

type Tab = "facts" | "swiss" | "ko" | "bracket";

/** One stage's games file, and the event it belongs to (for lists over every year). */
interface StageRef {
  u: string;
  n: string;
  end?: string;
  label: string;
}

interface Loaded {
  /** "Worlds 2025", or "Worlds" for every year together */
  name: string;
  year: string;
  all: boolean;
  years: string[];
  stages: StageRef[];
  /** one year: the whole event and its main stage (the pickers' data) */
  parent: HubEvent | null;
  main: HubEvent | null;
  ratings: HubRatings | null;
  league: HubLeague;
}

const realEvents = (lg: HubLeague): (EventListItem & { y: string })[] =>
  lg.events.filter((e) => !e.q && !e.p).sort((a, b) => b.y.localeCompare(a.y) || (b.st || "").localeCompare(a.st || ""));

async function stagesOf(e: EventListItem): Promise<StageRef[]> {
  const label = eventTitle(e.n);
  if (e.c?.length) return e.c.map((u) => ({ u, n: u, end: e.en, label }));
  // builds before the stage list (2026-10-21): the whole event's own file says whether it has stages
  if (!e.c) {
    const p = await loadHubEvent(e.u).catch(() => null);
    if (p?.children?.length) return p.children.map((c) => ({ u: c.u, n: c.n, end: e.en, label }));
  }
  return [{ u: e.u, n: e.n, end: e.en, label }];
}

async function loadIntl(kind: IntlKind, asked: string | undefined): Promise<Loaded> {
  const def = INTL[kind];
  const league = await loadLeague(def.league);
  const evs = realEvents(league);
  const years = [...new Set(evs.map((e) => e.y))];
  if (asked === ALL) {
    const stages = (await Promise.all(evs.map(stagesOf))).flat();
    return { name: eventName(def.name), year: ALL, all: true, years, stages, parent: null, main: null, ratings: null, league };
  }
  const year = asked && years.includes(asked) ? asked : years[0];
  const ev = evs.find((e) => e.y === year);
  if (!ev) throw new Error("no event");
  const parent = await loadHubEvent(ev.u);
  const kids = parent.children?.length ? parent.children : [];
  const full = kids.length ? (await Promise.all(kids.map((k) => loadHubEvent(k.u).catch(() => null)))).filter((x): x is HubEvent => !!x) : [parent];
  const main = full.find((s) => /main/i.test(s.u)) || (kids.length ? null : parent);
  const swiss = def.swissFrom != null && Number(year) >= def.swissFrom;
  const ratings = swiss || kind !== "worlds" ? await loadRatings().catch(() => null) : null;
  const stages = full.map((s) => ({ u: s.u, n: s.n, end: s.end || s.start, label: eventTitle(parent.n) }));
  return { name: eventTitle(parent.n), year, all: false, years, stages, parent, main, ratings, league };
}

/** Riot's schedule for this event, with the stats' team pages (matched by code or name). */
function liveResults(schedule: Match[] | undefined, leagueSlug: string, teams: WTeam[]): LiveResult[] {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const code = (c: string) => norm(normalizeTeamCode(c));
  // the code (TLAW = TL), the name, else the one team whose name starts Riot's ("Team Liquid Alienware")
  const find = (c: string, name: string) => {
    const lead = teams.filter((t) => norm(t.n).length >= 3 && norm(name).startsWith(norm(t.n)));
    return teams.find((t) => code(t.c) === code(c))?.u || teams.find((t) => norm(t.n) === norm(name))?.u || (lead.length === 1 ? lead[0].u : null);
  };
  const out: LiveResult[] = [];
  for (const m of schedule || []) {
    if (m.leagueSlug !== leagueSlug) continue;
    const a = find(m.team1Code, m.team1Name);
    const b = find(m.team2Code, m.team2Name);
    if (!a || !b || a === b) continue;
    const done = m.state === "completed" && m.team1Score !== m.team2Score;
    out.push({ a, b, w: done ? (m.team1Score > m.team2Score ? 1 : 2) : 0, sa: done ? m.team1Score : undefined, sb: done ? m.team2Score : undefined, bo: m.bestOf || 1, block: m.blockName || "", date: m.startTimeUtc });
  }
  return out;
}

export const WorldsPage: React.FC<{ kind?: IntlKind; year?: string; schedule?: Match[] }> = ({ kind = "worlds", year: asked, schedule }) => {
  const def = INTL[kind];
  const state = useLoad(() => loadIntl(kind, asked), [kind, asked]);
  const [tab, setTab] = useState<Tab>("facts");
  const d = state.data;
  const title = d ? (d.all ? tl("{event}: every year", { event: d.name }) : d.name) : eventName(def.name);
  usePageTitle(title);
  const thisYear = String(new Date().getFullYear());
  const swissYear = !!d && !d.all && def.swissFrom != null && Number(d.year) >= def.swissFrom;
  // MSI's double elimination and First Stand's groups: a picker when the year uses that format
  const bracket = useMemo(() => (d && !d.all && kind !== "worlds" && d.main ? detectBracket(kind, d.main.stages || []) : null), [d, kind]);
  useEffect(() => {
    if (!swissYear && !bracket) setTab("facts");
  }, [swissYear, bracket]);
  // this year's Worlds opens on the Swiss picker (the stage being played); other years on the facts
  useEffect(() => {
    if (swissYear && d?.year === thisYear) setTab("swiss");
  }, [swissYear, d?.year, thisYear]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-extrabold text-rw-text flex items-center gap-2 mr-auto">
          <Trophy className="w-5 h-5 text-rw-accent" />
          {title}
        </h2>
        {d && (
          <label className="text-xs text-rw-sub flex items-center gap-1.5">
            {tl("Year")}
            <select
              value={d.year}
              onChange={(e) => navigateHub({ kind, year: e.target.value === d.years[0] ? undefined : e.target.value }, { replace: true })}
              className="bg-rw-surface border border-rw-border rounded-lg px-2 py-1 text-xs text-rw-text"
            >
              <option value={ALL}>{tl("All years")}</option>
              {d.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "facts"} className={pill(tab === "facts")} onClick={() => setTab("facts")}>
          <Sparkles className="w-3.5 h-3.5" />
          {tl("Facts")}
        </button>
        {swissYear && (
          <>
            <button type="button" role="tab" aria-selected={tab === "swiss"} className={pill(tab === "swiss")} onClick={() => setTab("swiss")}>
              <Shuffle className="w-3.5 h-3.5" />
              {tl("Swiss stage picker")}
            </button>
            <button type="button" role="tab" aria-selected={tab === "ko"} className={pill(tab === "ko")} onClick={() => setTab("ko")}>
              <Trophy className="w-3.5 h-3.5" />
              {tl("Knockout picker")}
            </button>
          </>
        )}
        {bracket && (
          <button type="button" role="tab" aria-selected={tab === "bracket"} className={pill(tab === "bracket")} onClick={() => setTab("bracket")}>
            <Trophy className="w-3.5 h-3.5" />
            {tl("Bracket picker")}
          </button>
        )}
        {d?.parent && (
          <HubLink to={{ kind: "event", slug: d.parent.u }} className={`${btn} ml-auto`}>
            {tl("Bracket, standings and every series")}
          </HubLink>
        )}
      </div>
      {state.error ? (
        <p className="text-xs text-rw-sub">{tl("Not in the stats yet.")}</p>
      ) : !d ? (
        <Loading />
      ) : tab === "bracket" && bracket && kind !== "worlds" ? (
        <BracketPicker d={d} kind={kind} br={bracket} live={d.year === thisYear} />
      ) : tab === "facts" || !swissYear ? (
        <FactsTab d={d} kind={kind} />
      ) : (
        <Pickers d={d} year={d.year} tab={tab} live={d.year === thisYear} schedule={d.year === thisYear ? schedule : undefined} />
      )}
    </div>
  );
};

// ── facts ─────────────────────────────────────────────────────────────────

const FactsTab: React.FC<{ d: Loaded; kind: IntlKind }> = ({ d, kind }) => {
  const [stage, setStage] = useState<string>("all");
  useEffect(() => setStage("all"), [d]);
  const lines = useLoad(() => Promise.all(d.stages.map((s) => loadEventLines(s.u).catch(() => null))), [d.stages.map((s) => s.u).join()]);
  const last = d.stages.map((s) => s.end || "").sort().pop();
  const [hidden, reveal] = useHidden(`worlds-facts:${kind}:${d.year}`, last);
  const facts = useMemo<Fact[]>(() => {
    if (!lines.data) return [];
    const files = lines.data.map((f, i) => (stage === "all" || d.stages[i].u === stage ? f : null));
    const name = stage === "all" ? d.name : eventTitle(d.stages.find((s) => s.u === stage)?.n || d.name);
    const out = eventFacts(gamesOf(files, d.all ? d.stages.map((s) => s.label) : []), name);
    if (d.all && d.league.titles?.length) {
      const t = d.league.titles.slice(0, 5);
      out.unshift({
        id: "titles", title: tl("Most titles"),
        headline: tl("{team} has won {event} {n} times", { team: t[0].t, event: d.name, n: t[0].n }),
        rows: t.map((x) => ({ label: x.t, team: x.u, value: String(x.n) })),
      });
    }
    return out;
  }, [lines.data, stage, d]);
  // the region table follows the stage picked, like the facts
  const shownFiles = useMemo(() => (lines.data || []).map((f, i) => (stage === "all" || d.stages[i].u === stage ? f : null)), [lines.data, stage, d]);
  const years = useMemo(() => d.stages.map((s) => s.label), [d]);
  if (lines.error) return <Failed />;
  if (!lines.data) return <Loading />;
  if (hidden)
    return (
      <p className="text-xs text-rw-sub flex items-center gap-2">
        {tl("Hidden while spoiler mode is on.")} <RevealButton onReveal={reveal} />
      </p>
    );
  const parentName = d.parent?.n || "";
  return (
    <div className="space-y-3">
      {!d.all && d.stages.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={pill(stage === "all")} onClick={() => setStage("all")}>
            {tl("Whole event")}
          </button>
          {d.stages.map((s) => (
            <button key={s.u} type="button" className={pill(stage === s.u)} onClick={() => setStage(s.u)}>
              {stageName(s.n.replace(parentName, "").trim()) || eventTitle(s.n)}
            </button>
          ))}
        </div>
      )}
      {d.all && <p className="text-[11px] text-rw-muted">{tl("Every edition together, {from} to {to}.", { from: d.years[d.years.length - 1], to: d.years[0] })}</p>}
      {d.all && <Winners kind={kind} name={d.name} />}
      {!facts.length ? (
        <p className="text-xs text-rw-sub">{tl("No games with full stats yet. Facts show up as soon as the first games are in.")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {facts.map((f) => (
            <FactCard key={f.id} f={f} kind={kind} year={d.year} />
          ))}
        </div>
      )}
      <RegionStats files={shownFiles} years={years} all={d.all} name={d.name} />
      {!d.all && <Winners kind={kind} name={eventName(INTL[kind].name)} current={d.year} />}
    </div>
  );
};

/** Every edition's champion in order: the final's score, the runner-up, and the teams that won it back to back. */
const Winners: React.FC<{ kind: IntlKind; name: string; current?: string }> = ({ kind, name, current }) => {
  const titles = useLoad(loadHubTitles, []);
  const list = useMemo(
    () =>
      (titles.data || [])
        // event pages are named worlds-…, msi-…, first-stand-…
        .filter((x) => (x.e || "").startsWith(`${kind}-`))
        .map((x) => ({ ...x, y: x.date.slice(0, 4) }))
        .sort((a, b) => b.y.localeCompare(a.y)),
    [titles.data, kind],
  );
  // a title that's still a spoiler (spoiler mode, the event just ended) stays out until revealed
  const [hidden, reveal] = useHidden(`worlds-facts:${kind}:${list[0]?.y || ""}`, list[0]?.date);
  if (!list.length) return null;
  const shown = hidden ? list.slice(1) : list;
  // back-to-back and longer runs by the same organisation (its stats page, whatever it was called then)
  const runs: { team: string; from: string; to: string; n: number }[] = [];
  const old = [...shown].reverse();
  for (let i = 0; i < old.length; ) {
    let j = i;
    while (j + 1 < old.length && old[j + 1].u && old[j + 1].u === old[i].u && Number(old[j + 1].y) - Number(old[j].y) <= 2) j++;
    if (j > i) runs.push({ team: old[j].as, from: old[i].y, to: old[j].y, n: j - i + 1 });
    i = j + 1;
  }
  return (
    <Section
      title={tl("Champions")}
      share={`${kind}-champions`}
      right={
        <SectionCard
          section={tl("Champions")}
          name={name}
          rows={() => shown.map((x) => ({ label: `${x.y} · ${x.as}`, sub: tl("{score} vs {team}", { score: x.score, team: x.l }) }))}
        />
      }
    >
      {hidden && (
        <p className="text-[11px] text-rw-muted flex items-center gap-2">
          {tl("The newest winner is hidden while spoiler mode is on.")} <RevealButton onReveal={reveal} small />
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-rw-muted">
            <tr>
              <th className="px-2 py-1 text-left">{tl("Year")}</th>
              <th className="px-2 py-1 text-left">{tl("Champion")}</th>
              <th className="px-2 py-1 text-center">{tl("Final")}</th>
              <th className="px-2 py-1 text-left">{tl("Runner-up")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.e || x.y} className={`border-t border-rw-border ${x.y === current ? "bg-rw-accent/10" : ""}`}>
                <td className="px-2 py-1 tabular-nums">
                  {x.e ? (
                    <HubLink to={{ kind: "event", slug: x.e }} className="text-rw-sub hover:text-rw-accent hover:underline">
                      {x.y}
                    </HubLink>
                  ) : (
                    x.y
                  )}
                </td>
                <td className="px-2 py-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Trophy className="w-3 h-3 text-rw-accent shrink-0" />
                    <TeamLink name={x.as} u={x.u} className="font-semibold text-rw-text hover:text-rw-accent truncate" />
                  </span>
                </td>
                <td className="px-2 py-1 text-center tabular-nums font-bold">{x.score}</td>
                <td className="px-2 py-1 text-rw-sub">{x.l}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {runs.length > 0 && (
        <p className="text-[11px] text-rw-sub">
          {tl("Won it in a row:")}{" "}
          {runs
            .slice()
            .reverse()
            .map((r) => `${r.team} (${r.from}–${r.to}, ${r.n})`)
            .join(" · ")}
        </p>
      )}
    </Section>
  );
};


const FactCard: React.FC<{ f: Fact; kind: IntlKind; year: string }> = ({ f, kind, year }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(factText(f, hubShareUrl({ kind, year })))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <Section
      title={f.title}
      share={`${kind}-${year}-${f.id}`}
      right={
        <button type="button" className={btn} onClick={copy} aria-label={tl("Copy as text")}>
          {copied ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <Copy className="w-3.5 h-3.5" />}
          {tl("Text")}
        </button>
      }
    >
      <p className="text-sm font-semibold text-rw-text leading-snug">{f.headline}</p>
      <ol className="text-xs space-y-1.5">
        {f.rows.map((r, i) => (
          <li key={i} className="flex items-start gap-2 min-w-0">
            <span className="w-4 text-rw-muted text-right shrink-0">{i + 1}.</span>
            {r.champ && <ChampIcon name={r.champ} size={18} className="shrink-0" />}
            <span className="min-w-0 flex-1">
              {r.player ? (
                <PlayerLink name={r.label} u={r.player} />
              ) : r.team ? (
                <TeamLink name={r.label} u={r.team} />
              ) : r.match ? (
                <HubLink to={{ kind: "match", slug: r.match.slug, game: r.match.game }} className="hover:text-rw-accent hover:underline">
                  {r.label}
                </HubLink>
              ) : (
                <span>{r.label}</span>
              )}
              {r.sub && <span className="block text-[11px] text-rw-muted break-words">{r.sub}</span>}
            </span>
            <span className="font-bold text-rw-accent shrink-0">{r.value}</span>
          </li>
        ))}
      </ol>
      {f.note && <p className="text-[10px] text-rw-muted">{f.note}</p>}
    </Section>
  );
};

// ── pickers ───────────────────────────────────────────────────────────────

function teamsOf(main: HubEvent, ratings: HubRatings | null): WTeam[] {
  const rows = new Map((ratings?.teams || []).map((r) => [r[0], r]));
  const codes = new Map<string, string>();
  for (const st of main.stages || [])
    for (const s of st.series || []) {
      if (s.au && s.ac) codes.set(s.au, s.ac);
      if (s.bu && s.bc) codes.set(s.bu, s.bc);
    }
  const list = (main.teams || []).filter((t) => t.u);
  // Leaguepedia's notes ("LYON (2024 American Team)") tell teams apart across all of LoL; within one event the bare
  // name is enough, unless two of its teams would then share it
  const bare = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, "");
  const count = new Map<string, number>();
  for (const t of list) count.set(bare(t.t), (count.get(bare(t.t)) || 0) + 1);
  const nameOf = (n: string) => (count.get(bare(n)) === 1 ? bare(n) : n);
  return list
    .map((t) => {
      const r = rows.get(t.u as string);
      return { u: t.u as string, n: nameOf(t.t), c: codes.get(t.u as string) || r?.[2] || t.t.slice(0, 3).toUpperCase(), r: r?.[5] ?? 1500, league: r?.[3] || "", img: t.img };
    });
}

function realOf(main: HubEvent, re: RegExp, round: (name: string) => number): RealSeries[] {
  return (main.stages || [])
    .filter((st) => re.test(st.name || ""))
    .flatMap((st) =>
      (st.series || [])
        .filter((s) => s.au && s.bu)
        .map((s) => ({ round: round(st.name || ""), a: s.au as string, b: s.bu as string, bo: s.bo || 1, w: s.w || 0, sa: s.sa, sb: s.sb, date: s.date })),
    );
}

const Pickers: React.FC<{ d: Loaded; year: string; tab: Tab; live: boolean; schedule?: Match[] }> = ({ d, year, tab, live, schedule }) => {
  const [saved, setSaved] = useSaved(year);
  const [odds, setOdds] = useState<Record<string, TeamOdds> | null>(null);
  const [running, setRunning] = useState(false);
  const [keepPicks, setKeepPicks] = useState(false);
  const main = d.main;
  const teams = useMemo(() => (main ? teamsOf(main, d.ratings) : []), [main, d.ratings]);
  // Riot's live schedule on top of the stats: results within a minute or so of the end, and Riot's next-round draw
  const riot = useMemo(() => liveResults(schedule, "worlds", teams), [schedule, teams]);
  const real = useMemo(() => withLive(main ? realOf(main, /^round \d/i, (n) => Number(/\d+/.exec(n)?.[0] || 0)) : [], riot), [main, riot]);
  const realKo = useMemo(
    () => withLiveKo(main ? realOf(main, /quarter|semi|final/i, (n) => (/quarter/i.test(n) ? 1 : /semi/i.test(n) ? 2 : 3)) : [], riot),
    [main, riot],
  );
  const adjust = d.ratings?.adjust;
  const swiss = useMemo(() => runSwiss(teams, real, saved.swiss, saved.seed, adjust), [teams, real, saved.swiss, saved.seed, adjust]);
  const pairs = useMemo(() => (swiss.done ? quarterPairs(swiss.rec, saved.koSeed, realKo.filter((s) => s.round === 1)) : []), [swiss, saved.koSeed, realKo]);
  const ko = useMemo(() => (pairs.length === 4 ? runKnockout(teams, pairs, realKo, saved.ko, adjust) : null), [teams, pairs, realKo, saved.ko, adjust]);
  const byU = useMemo(() => new Map(teams.map((t) => [t.u, t])), [teams]);
  useEffect(() => setOdds(null), [year, keepPicks, saved]);

  if (!main || teams.length < 16 || !real.some((s) => s.round === 1))
    return <p className="text-xs text-rw-sub">{tl("The Swiss stage draw isn't in the stats yet. The picker opens once Round 1 is drawn.")}</p>;

  const pickSwiss = (m: WMatch, u: string) => {
    if (m.from === "real") return;
    const next = { ...saved.swiss };
    if (next[m.key] === u) delete next[m.key];
    else next[m.key] = u;
    setSaved({ ...saved, swiss: next });
  };
  const pickKo = (m: WMatch, u: string) => {
    if (m.from === "real") return;
    const next = { ...saved.ko };
    if (next[m.key] === u) delete next[m.key];
    else next[m.key] = u;
    setSaved({ ...saved, ko: next });
  };
  // fill every open match (later rounds are drawn as the earlier ones fill), then keep those as picks
  const fillSwiss = (fill: Fill) => {
    const s = runSwiss(teams, real, saved.swiss, saved.seed, adjust, fill);
    const picks = { ...saved.swiss };
    for (const m of s.rounds.flat()) if (m.from === "fill") picks[m.key] = m.w === 1 ? m.a : m.b;
    setSaved({ ...saved, swiss: picks });
  };
  const fillKo = (fill: Fill) => {
    if (pairs.length !== 4) return;
    const k = runKnockout(teams, pairs, realKo, saved.ko, adjust, fill);
    const picks = { ...saved.ko };
    for (const m of [...k.qf, ...k.sf, ...(k.final ? [k.final] : [])]) if (m.from === "fill") picks[m.key] = m.w === 1 ? m.a : m.b;
    setSaved({ ...saved, ko: picks });
  };
  const runOdds = () => {
    setRunning(true);
    window.setTimeout(() => {
      setOdds(simulate(teams, real, realKo, adjust, 10000, keepPicks ? { ...saved.swiss, ...saved.ko } : {}, Date.now() % 100000));
      setRunning(false);
    }, 30);
  };
  const seed = () => Math.floor(Math.random() * 2 ** 31);
  const fills = (onFill: (f: Fill) => void, clear: () => void, redraw: (() => void) | null) => (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={btn} onClick={() => onFill(favourites)} title={tl("Every open match goes to the team with the better chance")}>
        <TrendingUp className="w-3.5 h-3.5" />
        {tl("Favourites")}
      </button>
      <button type="button" className={btn} onClick={() => onFill(roller(rng(seed())))} title={tl("Every open match is rolled by its chances: a 70% favourite wins 7 times in 10")}>
        <Dice5 className="w-3.5 h-3.5" />
        {tl("Roll by chances")}
      </button>
      <button type="button" className={btn} onClick={() => onFill(coin(rng(seed())))}>
        <Shuffle className="w-3.5 h-3.5" />
        {tl("Coin flip")}
      </button>
      {redraw && (
        <button type="button" className={btn} onClick={redraw} title={tl("A new random draw for the rounds Riot hasn't drawn yet")}>
          <RefreshCw className="w-3.5 h-3.5" />
          {tl("Redraw")}
        </button>
      )}
      <button type="button" className={btn} onClick={clear}>
        <Eraser className="w-3.5 h-3.5" />
        {tl("Clear my picks")}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {!live && <p className="text-[11px] text-rw-muted">{tl("Chances use today's power ratings, not the ones from that year.")}</p>}
      {tab === "swiss" ? (
        <>
          <Section title={tl("Swiss stage")} share={`worlds-${year}-swiss`}>
            <p className="text-[11px] text-rw-muted">
              {tl("Tap a team to pick it. Played matches are locked in. 3 wins goes through, 3 losses goes out; matches that decide either are best of 3.")}
            </p>
            {fills(fillSwiss, () => setSaved({ ...saved, swiss: {} }), () => setSaved({ ...saved, seed: seed() }))}
            <div className="grid gap-3 lg:grid-cols-5 sm:grid-cols-2">
              {swiss.rounds.map((r, i) => (
                <div key={i} className="space-y-1.5 min-w-0">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-rw-sub">{tl("Round {n}", { n: i + 1 })}</h4>
                  {/* phones: two matches side by side */}
                  <div className="grid grid-cols-2 sm:grid-cols-1 gap-1.5">
                    {r.map((m) => (
                      <MatchBox key={m.key} m={m} byU={byU} onPick={(u) => pickSwiss(m, u)} />
                    ))}
                  </div>
                </div>
              ))}
              {swiss.waiting > 0 && (
                <p className="text-[11px] text-rw-muted self-start">{tl("Pick every match of round {n} to draw the next one.", { n: swiss.waiting - 1 })}</p>
              )}
            </div>
            <Records rec={swiss.rec} byU={byU} />
          </Section>
        </>
      ) : (
        <Section title={tl("Knockouts")} share={`worlds-${year}-knockouts`}>
          {!swiss.done ? (
            <p className="text-xs text-rw-sub">
              {tl("Finish the Swiss stage first: pick every match, or use Favourites or Roll by chances there.")}{" "}
              <button type="button" className="text-rw-teal hover:underline" onClick={() => fillSwiss(favourites)}>
                {tl("Fill the Swiss stage with the favourites")}
              </button>
            </p>
          ) : (
            <>
              <p className="text-[11px] text-rw-muted">{tl("The two 3-0 teams draw 3-2 teams; the other four are paired at random. Every match is best of 5.")}</p>
              {fills(
                fillKo,
                () => setSaved({ ...saved, ko: {} }),
                realKo.some((s) => s.round === 1) ? null : () => setSaved({ ...saved, koSeed: seed(), ko: {} }),
              )}
              {ko && <Bracket ko={ko} byU={byU} onPick={pickKo} />}
            </>
          )}
        </Section>
      )}
      <Section
        title={tl("Chances from here")}
        share={`worlds-${year}-chances`}
        right={
          odds ? (
            <BroadcastCardButton
              data={() =>
                chancesCard({
                  title: tl("Chances from here"),
                  subtitle: d.name,
                  cols: ["3-0", tl("Through"), tl("Semifinal"), tl("Final"), tl("Wins Worlds")],
                  rows: teams
                    .slice()
                    .sort((a, b) => odds[b.u].win - odds[a.u].win || odds[b.u].adv - odds[a.u].adv)
                    .map((t) => ({ name: t.n, v: [odds[t.u].r30, odds[t.u].adv, odds[t.u].sf, odds[t.u].final, odds[t.u].win].map(pctText) })),
                  note: tl("10,000 runs"),
                })
              }
              name={`worlds-${year}-chances`}
              label={tl("Overview card")}
            />
          ) : undefined
        }
      >
        <p className="text-[11px] text-rw-muted">
          {tl("Plays the rest of Worlds 10,000 times, each open match rolled by its chances, and counts how far each team gets.")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={pill(false)} onClick={runOdds} disabled={running}>
            <Dice5 className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
            {running ? tl("Playing it out…") : tl("Run 10,000 times")}
          </button>
          <label className="text-xs text-rw-sub flex items-center gap-1.5">
            <input type="checkbox" checked={keepPicks} onChange={(e) => setKeepPicks(e.target.checked)} />
            {tl("Keep my picks")}
          </label>
        </div>
        {odds && <OddsTable odds={odds} teams={teams} />}
      </Section>
    </div>
  );
};

const TeamButton: React.FC<{ u: string; t?: WTeam; won: boolean; lost: boolean; p: number; locked: boolean; score?: number | null; onPick: () => void }> = ({
  u, t, won, lost, p, locked, score, onPick,
}) => (
  <button
    type="button"
    disabled={locked}
    onClick={onPick}
    aria-pressed={won}
    className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left min-w-0 ${
      won ? "bg-rw-accent/15 text-rw-text font-semibold" : lost ? "text-rw-muted" : "text-rw-sub hover:bg-rw-surface hover:text-rw-text"
    } ${locked ? "cursor-default" : ""}`}
  >
    <TeamLogo name={t?.n || u} code={t?.c} src={t?.img} size={18} className="shrink-0" />
    <span className="truncate flex-1" title={t?.n}>
      {t?.c || u}
    </span>
    {score != null ? <span className="font-bold">{score}</span> : <span className="text-[10px] text-rw-muted">{pctText(p)}</span>}
  </button>
);

const MatchBox: React.FC<{ m: WMatch; byU: Map<string, WTeam>; onPick: (u: string) => void }> = ({ m, byU, onPick }) => {
  const locked = m.from === "real";
  return (
    <div className={`rounded-lg border ${m.from === "pick" ? "border-rw-accent/50" : "border-rw-border"} bg-rw-deep/40 p-1 space-y-0.5`}>
      <div className="flex items-center justify-between px-1 text-[10px] text-rw-muted">
        <span>{tl("Best of {n}", { n: m.bo })}</span>
        {locked ? <Lock className="w-3 h-3" aria-label={tl("Played")} /> : m.drawn ? <span>{tl("drawn here")}</span> : null}
      </div>
      <TeamButton u={m.a} t={byU.get(m.a)} won={m.w === 1} lost={m.w === 2} p={m.p} locked={locked} score={locked ? m.sa : undefined} onPick={() => onPick(m.a)} />
      <TeamButton u={m.b} t={byU.get(m.b)} won={m.w === 2} lost={m.w === 1} p={1 - m.p} locked={locked} score={locked ? m.sb : undefined} onPick={() => onPick(m.b)} />
    </div>
  );
};

const Records: React.FC<{ rec: Record<string, [number, number]>; byU: Map<string, WTeam> }> = ({ rec, byU }) => {
  const groups = ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"].map((k) => ({ k, us: Object.keys(rec).filter((u) => rec[u].join("-") === k) })).filter((g) => g.us.length);
  if (!groups.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6 pt-1">
      {groups.map((g) => (
        <div key={g.k} className="min-w-0">
          <div className={`text-[11px] font-bold ${g.k.startsWith("3") ? "text-rw-teal" : "text-rw-red"}`}>
            {g.k} {g.k.startsWith("3") ? tl("through") : tl("out")}
          </div>
          <div className="text-xs text-rw-sub">{g.us.map((u) => byU.get(u)?.c || u).join(", ")}</div>
        </div>
      ))}
    </div>
  );
};

const Bracket: React.FC<{ ko: ReturnType<typeof runKnockout>; byU: Map<string, WTeam>; onPick: (m: WMatch, u: string) => void }> = ({ ko, byU, onPick }) => {
  const col = (title: string, ms: WMatch[]) => (
    <div className="space-y-2 min-w-0">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-rw-sub">{title}</h4>
      {ms.map((m) => (
        <MatchBox key={m.key} m={m} byU={byU} onPick={(u) => onPick(m, u)} />
      ))}
    </div>
  );
  const champ = ko.champion ? byU.get(ko.champion) : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-start">
      {col(tl("Quarterfinals"), ko.qf)}
      {col(tl("Semifinals"), ko.sf)}
      {col(tl("Final"), ko.final ? [ko.final] : [])}
      <div className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-rw-sub">{tl("World champion")}</h4>
        {champ ? (
          <div className="rounded-lg border border-rw-accent/60 bg-rw-accent/10 p-3 flex items-center gap-2">
            <TeamLogo name={champ.n} code={champ.c} src={champ.img} size={32} />
            <TeamLink name={champ.n} u={champ.u} className="font-extrabold text-rw-text hover:text-rw-accent" />
          </div>
        ) : (
          <p className="text-[11px] text-rw-muted">{tl("Pick the final to crown one.")}</p>
        )}
      </div>
    </div>
  );
};

const OddsTable: React.FC<{ odds: Record<string, TeamOdds>; teams: WTeam[] }> = ({ odds, teams }) => {
  const rows = teams.slice().sort((a, b) => odds[b.u].win - odds[a.u].win || odds[b.u].adv - odds[a.u].adv);
  const cell = "px-2 py-1 text-right tabular-nums";
  return (
    <div className="overflow-x-auto max-w-full">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-rw-muted">
          <tr>
            <th className="px-2 py-1 text-left">{tl("Team")}</th>
            <th className={cell}>3-0</th>
            <th className={cell}>{tl("Through")}</th>
            <th className={cell}>{tl("Semifinal")}</th>
            <th className={cell}>{tl("Final")}</th>
            <th className={cell}>{tl("Wins Worlds")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const o = odds[t.u];
            return (
              <tr key={t.u} className="border-t border-rw-border">
                <td className="px-2 py-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <TeamLogo name={t.n} code={t.c} src={t.img} size={16} className="shrink-0" />
                    <TeamLink name={t.n} u={t.u} className="truncate hover:text-rw-accent" />
                  </span>
                </td>
                <td className={cell}>{pctText(o.r30)}</td>
                <td className={cell}>{pctText(o.adv)}</td>
                <td className={cell}>{pctText(o.sf)}</td>
                <td className={cell}>{pctText(o.final)}</td>
                <td className={`${cell} font-bold text-rw-accent`}>{pctText(o.win)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── MSI and First Stand bracket picker ────────────────────────────────────

const COL_LABELS: Record<string, string> = {
  "Upper round 1": tk("Upper round 1"), "Lower round 1": tk("Lower round 1"), "Upper semifinals": tk("Upper semifinals"),
  "Lower round 2": tk("Lower round 2"), "Lower round 3": tk("Lower round 3"), "Upper final": tk("Upper final"),
  "Lower final": tk("Lower final"), "Grand final": tk("Grand final"), "Group A": tk("Group A"), "Group B": tk("Group B"),
  Semifinals: tk("Semifinals"), Final: tk("Final"), Semifinal: tk("Semifinal"),
};

const BracketPicker: React.FC<{ d: Loaded; kind: "msi" | "first-stand"; br: Bracket; live: boolean }> = ({ d, kind, br, live }) => {
  const [saved, setSaved] = useSaved(`${kind}_${d.year}`);
  const [odds, setOdds] = useState<Record<string, number[]> | null>(null);
  const [running, setRunning] = useState(false);
  const [keepPicks, setKeepPicks] = useState(false);
  const main = d.main as HubEvent;
  const teams = useMemo(() => teamsOf(main, d.ratings), [main, d.ratings]);
  const byU = useMemo(() => new Map(teams.map((t) => [t.u, t])), [teams]);
  const real = useMemo(() => realOfStages(main.stages || [], kind), [main, kind]);
  const adjust = d.ratings?.adjust;
  const res = useMemo(() => runBracket(br, teams, real, saved.ko, adjust), [br, teams, real, saved.ko, adjust]);
  useEffect(() => setOdds(null), [saved, keepPicks]);
  const pick = (m: WMatch, u: string) => {
    if (m.from === "real") return;
    const next = { ...saved.ko };
    if (next[m.key] === u) delete next[m.key];
    else next[m.key] = u;
    setSaved({ ...saved, ko: next });
  };
  const fill = (fl: Fill) => {
    const r = runBracket(br, teams, real, saved.ko, adjust, fl);
    const picks = { ...saved.ko };
    for (const m of r.matches) if (m.from === "fill") picks[m.key] = m.w === 1 ? m.a : m.b;
    setSaved({ ...saved, ko: picks });
  };
  const seed = () => Math.floor(Math.random() * 2 ** 31);
  const cols = [...new Set(br.nodes.map((n) => n.col))];
  const champ = res.champion ? byU.get(res.champion) : null;
  const runOdds = () => {
    setRunning(true);
    window.setTimeout(() => {
      setOdds(simulateBracket(br, teams, real, adjust, 10000, keepPicks ? saved.ko : {}, Date.now() % 100000));
      setRunning(false);
    }, 30);
  };
  return (
    <div className="space-y-4">
      {!live && <p className="text-[11px] text-rw-muted">{tl("Chances use today's power ratings, not the ones from that year.")}</p>}
      <Section title={tl("Bracket picker")} share={`${kind}-${d.year}-bracket`}>
        <p className="text-[11px] text-rw-muted">
          {kind === "msi"
            ? tl("Double elimination: a team is out after its second loss; upper-bracket losers drop to the lower bracket. Every match is best of {n}.", { n: br.nodes[0].bo })
            : tl("Two groups of four: the winners' match decides 1st, a decider between its loser and the losers' match winner decides 2nd. 1st of each group meets 2nd of the other. Every match is best of {n}.", { n: br.nodes[0].bo })}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn} onClick={() => fill(favourites)} title={tl("Every open match goes to the team with the better chance")}>
            <TrendingUp className="w-3.5 h-3.5" />
            {tl("Favourites")}
          </button>
          <button type="button" className={btn} onClick={() => fill(roller(rng(seed())))} title={tl("Every open match is rolled by its chances: a 70% favourite wins 7 times in 10")}>
            <Dice5 className="w-3.5 h-3.5" />
            {tl("Roll by chances")}
          </button>
          <button type="button" className={btn} onClick={() => fill(coin(rng(seed())))}>
            <Shuffle className="w-3.5 h-3.5" />
            {tl("Coin flip")}
          </button>
          <button type="button" className={btn} onClick={() => setSaved({ ...saved, ko: {} })}>
            <Eraser className="w-3.5 h-3.5" />
            {tl("Clear my picks")}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-start">
          {cols.map((c) => {
            const ms = res.matches.filter((m) => m.col === c);
            return (
              <div key={c} className="space-y-2 min-w-0">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-rw-sub">{tl(COL_LABELS[c] || c)}</h4>
                {ms.length ? (
                  ms.map((m) => <MatchBox key={m.id} m={m} byU={byU} onPick={(u) => pick(m, u)} />)
                ) : (
                  <p className="text-[11px] text-rw-muted">{tl("Waiting on earlier picks.")}</p>
                )}
              </div>
            );
          })}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-rw-sub">{tl("Champion")}</h4>
            {champ ? (
              <div className="rounded-lg border border-rw-accent/60 bg-rw-accent/10 p-3 flex items-center gap-2">
                <TeamLogo name={champ.n} code={champ.c} src={champ.img} size={32} />
                <TeamLink name={champ.n} u={champ.u} className="font-extrabold text-rw-text hover:text-rw-accent" />
              </div>
            ) : (
              <p className="text-[11px] text-rw-muted">{tl("Pick the final to crown one.")}</p>
            )}
          </div>
        </div>
      </Section>
      <Section
        title={tl("Chances from here")}
        share={`${kind}-${d.year}-chances`}
        right={
          odds ? (
            <BroadcastCardButton
              data={() =>
                chancesCard({
                  title: tl("Chances from here"),
                  subtitle: d.name,
                  cols: [...br.reach.map(([l]) => tl(COL_LABELS[l] || l)), tl("Wins")],
                  rows: teams
                    .filter((t) => odds[t.u] && odds[t.u].some((x) => x > 0))
                    .sort((a, b) => odds[b.u][br.reach.length] - odds[a.u][br.reach.length])
                    .map((t) => ({ name: t.n, v: odds[t.u].map(pctText) })),
                  note: tl("10,000 runs"),
                })
              }
              name={`${kind}-${d.year}-chances`}
              label={tl("Overview card")}
            />
          ) : undefined
        }
      >
        <p className="text-[11px] text-rw-muted">{tl("Plays the rest of the event 10,000 times, each open match rolled by its chances, and counts how far each team gets.")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={pill(false)} onClick={runOdds} disabled={running}>
            <Dice5 className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
            {running ? tl("Playing it out…") : tl("Run 10,000 times")}
          </button>
          <label className="text-xs text-rw-sub flex items-center gap-1.5">
            <input type="checkbox" checked={keepPicks} onChange={(e) => setKeepPicks(e.target.checked)} />
            {tl("Keep my picks")}
          </label>
        </div>
        {odds && (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-rw-muted">
                <tr>
                  <th className="px-2 py-1 text-left">{tl("Team")}</th>
                  {br.reach.map(([l]) => (
                    <th key={l} className="px-2 py-1 text-right">{tl(COL_LABELS[l] || l)}</th>
                  ))}
                  <th className="px-2 py-1 text-right">{tl("Wins")}</th>
                </tr>
              </thead>
              <tbody>
                {teams
                  .filter((t) => odds[t.u] && odds[t.u].some((x) => x > 0))
                  .sort((a, b) => odds[b.u][br.reach.length] - odds[a.u][br.reach.length])
                  .map((t) => (
                    <tr key={t.u} className="border-t border-rw-border">
                      <td className="px-2 py-1">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <TeamLogo name={t.n} code={t.c} src={t.img} size={16} className="shrink-0" />
                          <TeamLink name={t.n} u={t.u} className="truncate hover:text-rw-accent" />
                        </span>
                      </td>
                      {odds[t.u].map((x, k) => (
                        <td key={k} className={`px-2 py-1 text-right tabular-nums ${k === br.reach.length ? "font-bold text-rw-accent" : ""}`}>
                          {pctText(x)}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
};
