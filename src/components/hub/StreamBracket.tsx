/**
 * Groups, standings and bracket of the tournament the 24/7 stream is replaying, without spoilers:
 * a series shows its result only once the stream has finished airing it.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Trophy, Eye } from "lucide-react";
import { StreamEvent } from "../../types";
import { tl, locale } from "../../i18n";
import { streamEventTitle } from "../../helpers";
import { loadEventsOfYear, loadHubEvent } from "../../hub/data";
import type { HubEvent, SeriesRow } from "../../hub/types";
import { Bracket, SeriesBox, Standings, stageLabel } from "./EventPage";
import { EventLink, HubLink } from "./ui";

const LEAGUE: Record<string, string> = { Worlds: "World Championship", MSI: "Mid-Season Invitational", "First Stand": "First Stand" };
const ts = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
const pairKey = (a?: string | null, b?: string | null) => [String(a || "").toUpperCase(), String(b || "").toUpperCase()].sort().join("|");

/** The tournament the stream is on (or last showed, or shows next). */
function streamTournament(events: StreamEvent[], now: number): { event: string; season: string; year: string } | null {
  const matches = events.filter((e) => e.type !== "special" && e.utcIso).sort((a, b) => ts(a.utcIso) - ts(b.utcIso));
  const aired = matches.filter((e) => ts(e.utcIso) <= now);
  const e = aired[aired.length - 1] || matches[0];
  const year = e && /\b(20\d\d)\b/.exec(e.season || "")?.[1];
  return e && year ? { event: e.event, season: e.season, year } : null;
}

export const StreamBracket: React.FC<{ events: StreamEvent[]; now: number }> = ({ events, now }) => {
  const which = useMemo(() => streamTournament(events, now), [events, now]);
  const [stages, setStages] = useState<HubEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!which || !LEAGUE[which.event]) return;
    let alive = true;
    setStages(null);
    (async () => {
      const list = await loadEventsOfYear(which.year);
      const league = LEAGUE[which.event];
      const parent = list.find((e) => e.l === league && (e.kids || 0) > 0 && !e.p);
      let slugs: string[];
      if (parent) {
        const p = await loadHubEvent(parent.u);
        slugs = (p.children || []).map((c) => c.u);
      } else {
        slugs = list.filter((e) => e.l === league && !e.q && !e.p && (e.g || 0) > 0).map((e) => e.u);
      }
      const loaded = await Promise.all(slugs.map((s) => loadHubEvent(s).catch(() => null)));
      if (alive) {
        const ok = loaded.filter((x): x is HubEvent => !!x && !!x.stages?.length);
        setStages(ok);
        setTab(Math.max(0, ok.length - 1));
      }
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [which?.event, which?.year]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which series the stream has finished airing, and when the others air
  const airing = useMemo(() => {
    if (!which || !stages) return null;
    const mine = events
      .filter((e) => e.event === which.event && e.season === which.season)
      .sort((a, b) => ts(a.utcIso) - ts(b.utcIso));
    const all = [...events].sort((a, b) => ts(a.utcIso) - ts(b.utcIso));
    const nextStart = (e: StreamEvent) => {
      const i = all.indexOf(e);
      return i >= 0 && i + 1 < all.length ? ts(all[i + 1].utcIso) : Infinity;
    };
    // The k-th time two teams appear on the stream is the k-th time they met in the tournament
    const streamByPair = new Map<string, StreamEvent[]>();
    for (const e of mine) {
      if (e.type === "special" || !e.team1 || !e.team2) continue;
      const k = pairKey(e.team1, e.team2);
      streamByPair.set(k, [...(streamByPair.get(k) || []), e]);
    }
    const seriesByPair = new Map<string, SeriesRow[]>();
    for (const ev of stages)
      for (const st of ev.stages || [])
        for (const r of st.series) {
          const k = pairKey(r.ac || r.a, r.bc || r.b);
          seriesByPair.set(k, [...(seriesByPair.get(k) || []), r]);
        }
    const status = new Map<SeriesRow, { aired: boolean; at?: string }>();
    for (const [k, rows] of seriesByPair) {
      rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const onStream = streamByPair.get(k) || [];
      rows.forEach((r, i) => {
        const e = onStream[i];
        status.set(r, e ? { aired: nextStart(e) <= now, at: e.utcIso } : { aired: false });
      });
    }
    const shows = mine.filter((e) => e.type !== "special");
    const streamDone = shows.length > 0 && shows.every((e) => nextStart(e) <= now);
    return { status, streamDone };
  }, [events, stages, which, now]);

  if (!which || !LEAGUE[which.event] || failed) return null;
  if (!stages || !airing) return null;
  if (stages.length === 0) return null;

  const ev = stages[Math.min(tab, stages.length - 1)];
  const hide = (r: SeriesRow) => !showAll && !airing.streamDone && !airing.status.get(r)?.aired;
  const note = (r: SeriesRow) => {
    const s = airing.status.get(r);
    if (!hide(r)) return undefined;
    if (s?.at) {
      const d = new Date(s.at);
      return ts(s.at) > now
        ? tl("On the stream {when}", { when: d.toLocaleString(locale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })
        : tl("Airing now");
    }
    return tl("Not on the stream");
  };
  const bracket = (ev.stages || []).filter((s) => s.kind === "bracket");
  const lists = (ev.stages || []).filter((s) => s.kind === "list");
  const listDone = lists.every((s) => s.series.every((r) => !hide(r)));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-rw-accent flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5" />
          {tl("{event}: bracket and standings", { event: streamEventTitle({ event: which.event, season: which.season } as StreamEvent) })}
        </h3>
        {!airing.streamDone && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-rw-accent hover:underline"
          >
            <Eye className="w-3 h-3" />
            {showAll ? tl("Hide results the stream hasn't shown yet") : tl("Show all results")}
          </button>
        )}
      </div>
      <p className="text-[11px] text-rw-muted">
        {airing.streamDone
          ? tl("The stream has shown this whole event, so every result is visible.")
          : tl("Results show up here once the stream has aired them, so nothing is spoiled.")}
      </p>
      {stages.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {stages.map((s, i) => (
            <button
              key={s.u}
              type="button"
              onClick={() => setTab(i)}
              className={`px-2.5 py-1 rounded-lg text-xs border ${
                i === tab ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
              }`}
            >
              {s.n}
            </button>
          ))}
        </div>
      )}
      {bracket.length > 0 && <Bracket stages={bracket} hide={hide} note={note} />}
      {ev.standings && ev.standings.length > 0 && (
        <div className={`grid gap-3 ${ev.standings.length > 1 ? "md:grid-cols-2" : ""}`}>
          {ev.standings.map((t, i) => (
            <Standings
              key={i}
              name={t.name === "Standings" ? tl("Standings") : tl("Group {name}", { name: t.name.replace(/^Group /, "") })}
              rows={t.rows}
              hideAll={!showAll && !airing.streamDone && !listDone}
            />
          ))}
        </div>
      )}
      {lists.map((st) => (
        <div key={st.name} className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-rw-muted">{stageLabel(st.name)}</div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {st.series.map((r, i) => (
              <SeriesBox key={i} r={r} hideResult={hide(r)} note={note(r)} />
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-rw-muted">
        <EventLink name={tl("Full stats for {event}", { event: ev.n })} u={ev.u} className="text-rw-teal hover:underline" />
        {" · "}
        <HubLink to={{ kind: "home" }} className="text-rw-teal hover:underline">
          {tl("Pro Stats")}
        </HubLink>
      </p>
    </section>
  );
};
