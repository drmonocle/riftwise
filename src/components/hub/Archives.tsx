/** Full histories: every series of a team, every game of a player, every meeting of two teams. */
import React, { useEffect, useMemo, useState } from "react";
import { tl, tn, tc, roleName, stageLabel, fmtDec } from "../../i18n";
import { champName } from "../../champions";
import { loadPlayerGames, loadPlayerItems, loadTeamSeries, prettySlug } from "../../hub/data";
import { hubShareUrl } from "../../hub/route";
import { inPeriod, playerRowRef, type PeriodKey } from "../../hub/period";
import type { PlayerGameRow, TeamSeriesRow } from "../../hub/types";
import { isFinishedItem, itemName } from "../../hub/ddragon";
import { SectionCard } from "./BroadcastCard";
import { KdaBar, WinBar } from "./OpponentChart";
import { ChampIcon, EventLink, Failed, fmtDate, HubLink, isFresh, ItemIcon, Loading, ratingTextClass, RevealButton, Section, TeamLink, TeamLogo, useHidden, useLoad } from "./ui";

const PAGE = 50;
const select = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1 text-xs text-rw-text";

// ── Team: every series ────────────────────────────────────────────────────

const SeriesList: React.FC<{ rows: TeamSeriesRow[]; teamName: string; teamSlug?: string; spoilerKey: string; showOpp?: boolean }> = ({
  rows,
  teamName,
  teamSlug,
  spoilerKey,
  showOpp = true,
}) => {
  const [hidden, reveal] = useHidden(spoilerKey, rows.find((r) => isFresh(r[0]))?.[0]);
  const [n, setN] = useState(25);
  return (
    <div className="space-y-2">
      {hidden && (
        <div className="flex items-center gap-2 text-[11px] text-rw-muted">
          {tl("Results from the last two weeks are hidden.")} <RevealButton onReveal={reveal} small />
        </div>
      )}
      <ul className="text-xs space-y-1">
        {rows.slice(0, n).map((r, i) => {
          const hide = hidden && isFresh(r[0]);
          const won = r[3] > r[4];
          return (
            <li key={i} className="flex items-center justify-between gap-2 min-w-0">
              <span className="truncate min-w-0">
                {!hide && r[7] ? (
                  <HubLink
                    to={{ kind: "match", slug: r[7] }}
                    className={`font-bold tabular-nums hover:underline ${won ? "text-rw-teal" : "text-rw-red"}`}
                  >
                    {`${won ? tc("short result", "W") : tc("short result", "L")} ${r[3]}-${r[4]}`}
                  </HubLink>
                ) : (
                  <span className={`font-bold tabular-nums ${hide ? "text-rw-muted" : won ? "text-rw-teal" : "text-rw-red"}`}>
                    {hide ? "?" : `${won ? tc("short result", "W") : tc("short result", "L")} ${r[3]}-${r[4]}`}
                  </span>
                )}{" "}
                {showOpp && (
                  <>
                    {r[2] && teamName ? (
                      <HubLink
                        to={{
                          kind: "compare",
                          mode: "team",
                          a: teamSlug || prettySlug(teamName),
                          b: r[2],
                          period: /^\d{4}/.test(r[0]) ? `y${r[0].slice(0, 4)}` : undefined,
                        }}
                        className="text-rw-muted hover:text-rw-accent hover:underline"
                        title={tl("Compare")}
                      >
                        vs
                      </HubLink>
                    ) : (
                      "vs"
                    )}{" "}
                    <span className="inline-flex items-center gap-1 align-baseline">
                      <HubLink to={{ kind: "team", slug: r[2] || prettySlug(r[1]) }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
                        <TeamLogo name={r[1]} size={13} />
                      </HubLink>
                      <TeamLink name={r[1]} u={r[2]} />
                    </span>{" "}
                  </>
                )}
                {r[9] !== teamName && (
                  <span className="text-rw-muted text-[10px]">
                    (
                    {teamSlug && /^\d{4}/.test(r[0]) ? (
                      <HubLink
                        to={{ kind: "team", slug: teamSlug, tab: "stats", query: `p=y${r[0].slice(0, 4)}` }}
                        className="hover:text-rw-accent hover:underline"
                      >
                        {tl("as {name}", { name: r[9] })}
                      </HubLink>
                    ) : (
                      tl("as {name}", { name: r[9] })
                    )}
                    ){" "}
                  </span>
                )}
                <span className="text-rw-muted">
                  · <EventLink name={r[5]} u={r[6]} className="text-rw-muted hover:text-rw-accent hover:underline" />
                  {r[8] ? (
                    r[6] ? (
                      <>
                        {" · "}
                        <HubLink to={{ kind: "event", slug: r[6] }} className="hover:text-rw-accent hover:underline">
                          {stageLabel(r[8])}
                        </HubLink>
                      </>
                    ) : (
                      ` · ${stageLabel(r[8])}`
                    )
                  ) : (
                    ""
                  )}
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                {!hide && r[10] != null &&
                  (r[7] ? (
                    <HubLink
                      to={{ kind: "match", slug: r[7] }}
                      className={`tabular-nums font-semibold hover:underline ${ratingTextClass(r[10])}`}
                      title={tl("Series rating")}
                    >
                      {r[10].toFixed(0)}
                    </HubLink>
                  ) : (
                    <span className={`tabular-nums font-semibold ${ratingTextClass(r[10])}`} title={tl("Series rating")}>
                      {r[10].toFixed(0)}
                    </span>
                  ))}
                {r[7] ? (
                  <HubLink to={{ kind: "match", slug: r[7] }} className="hover:text-rw-text hover:underline">
                    {fmtDate(r[0])}
                  </HubLink>
                ) : (
                  fmtDate(r[0])
                )}
                {showOpp && r[2] && teamName && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: teamSlug || prettySlug(teamName),
                        b: r[2],
                        period: /^\d{4}/.test(r[0]) ? `y${r[0].slice(0, 4)}` : undefined,
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Match prep")}
                    >
                      {tl("Match prep")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(teamSlug || prettySlug(teamName))},${encodeURIComponent(r[2])}${/^\d{4}/.test(r[0]) ? `&p=y${r[0].slice(0, 4)}` : ""}`,
                      }}
                      className="hidden sm:inline text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Draft board")}
                    >
                      {tl("Draft board")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `team=${encodeURIComponent(teamSlug || prettySlug(teamName))}&vs=${encodeURIComponent(r[2])}${/^\d{4}/.test(r[0]) ? `&year=${r[0].slice(0, 4)}` : ""}`,
                      }}
                      className="hidden sm:inline text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Game finder")}
                    >
                      {tl("Game finder")}
                    </HubLink>
                  </>
                )}
                {r[7] && (
                  <HubLink to={{ kind: "match", slug: r[7] }} className="text-rw-accent hover:underline">
                    {tl("Details")}
                  </HubLink>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > n && (
        <button type="button" onClick={() => setN((x) => x + PAGE * 4)} className="text-[11px] text-rw-accent hover:underline">
          {tl("Show more ({n} left)", { n: rows.length - n })}
        </button>
      )}
    </div>
  );
};

const TeamSeriesBody: React.FC<{ slug: string; teamName: string }> = ({ slug, teamName }) => {
  const state = useLoad(() => loadTeamSeries(slug), [slug]);
  const [year, setYear] = useState("all");
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"d" | "r">("d");
  const years = useMemo(() => [...new Set((state.data || []).map((r) => r[0].slice(0, 4)))], [state.data]);
  const rows = useMemo(() => {
    const terms = q
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return (state.data || []).filter(
      (r) =>
        (year === "all" || r[0].startsWith(year)) &&
        (!terms.length ||
          terms.some(
            (qq) =>
              r[1].toLowerCase().includes(qq) ||
              (r[2] || "").toLowerCase().includes(qq) ||
              r[5].toLowerCase().includes(qq) ||
              (r[6] || "").toLowerCase().includes(qq),
          )),
    );
  }, [state.data, year, q]);
  // the same spoiler switch as the list below: while its fresh results are hidden, so is the count of wins
  const [seriesHidden] = useHidden(`teamseries:${slug}:${year}:${q}`, rows.find((r) => isFresh(r[0]))?.[0]);
  // best-rated first; results still hidden by spoiler mode stay out so the order gives nothing away
  const shown = useMemo(
    () => (order === "r" ? rows.filter((r) => r[10] != null && !(seriesHidden && isFresh(r[0]))).sort((x, y) => (y[10] || 0) - (x[10] || 0)) : rows),
    [rows, order, seriesHidden],
  );
  if (state.loading) return <Loading />;
  if (state.error || !state.data) return <Failed missing={state.missing} />;
  const won = rows.filter((r) => r[3] > r[4]).length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={tl("Year")} className={select}>
          <option value="all">{tl("All years")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={order} onChange={(e) => setOrder(e.target.value as "d" | "r")} aria-label={tl("Order")} className={select}>
          <option value="d">{tl("Newest first")}</option>
          <option value="r">{tl("Top rated")}</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tl("Filter by opponent or tournament…")}
          aria-label={tl("Filter by opponent or tournament…")}
          className={`${select} flex-1 min-w-[10rem] placeholder-rw-muted`}
        />
        <HubLink
          to={{
            kind: "finder",
            query: `team=${encodeURIComponent(slug)}${q.trim() && shown[0]?.[2] ? `&vs=${encodeURIComponent(shown[0][2])}` : ""}${year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
          }}
          className="inline-flex items-center gap-2 text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
          title={!seriesHidden && rows.length > 0 ? tl("{w} won", { w: won }) : tl("Game finder")}
        >
          <span>{tn("{n} series", "{n} series", rows.length)}</span>
          {!seriesHidden && rows.length > 0 && <WinBar w={won} g={rows.length} showRecord />}
        </HubLink>
        {!seriesHidden && shown.length > 0 && (
          <>
            {shown[0]?.[2] && (
              <>
                <HubLink
                  to={{ kind: "prep", a: slug, b: shown[0][2], period: year !== "all" ? `y${year}` : undefined }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{ kind: "compare", mode: "team", a: slug, b: shown[0][2], period: year !== "all" ? `y${year}` : undefined }}
                  className="text-[11px] text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(slug)},${encodeURIComponent(shown[0][2])}${year !== "all" ? `&p=y${encodeURIComponent(year)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{ kind: "rankings" }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{ kind: "tiers", ...(year !== "all" ? { query: `key=y${encodeURIComponent(year)}` } : {}) }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{ kind: "leaders", ...(year !== "all" ? { query: `year=${encodeURIComponent(year)}` } : {}) }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
              </>
            )}
            <CopyArchivePost
              title={`${tl("Every series")} · ${teamName}${year !== "all" ? ` (${year})` : ""}`}
              sub={`${tn("{n} series", "{n} series", rows.length)} · ${tl("{w} won", { w: won })}`}
              rows={shown.slice(0, 5).map((r) => `${r[3] > r[4] ? tc("short result", "W") : tc("short result", "L")} ${r[3]}-${r[4]} vs ${r[1]} · ${r[5]} (${fmtDate(r[0])})`)}
              url={hubShareUrl({ kind: "team", slug, tab: "matches" })}
            />
            <SectionCard
              section={`${tl("Every series")} · ${teamName}`}
              sub={`${tn("{n} series", "{n} series", rows.length)} · ${tl("{w} won", { w: won })}`}
              name={`${slug}-series-${year}`}
              rows={() =>
                shown.slice(0, 10).map((r, idx) => ({
                  rank: idx + 1,
                  team: r[1],
                  label: `${teamName} vs ${r[1]}`,
                  sub: `${r[5]} · ${fmtDate(r[0])}`,
                  value: `${r[3]}-${r[4]}`,
                  win: r[3] > r[4],
                }))
              }
            />
          </>
        )}
      </div>
      <SeriesList rows={shown} teamName={teamName} teamSlug={slug} spoilerKey={`teamseries:${slug}:${year}:${q}`} />
    </div>
  );
};

export const TeamSeriesArchive: React.FC<{ slug: string; teamName: string }> = ({ slug, teamName }) => (
  <Section
    title={tl("Every series")}
    right={
      <span className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-rw-muted">{tl("Show every series this team played")}</span>
        <HubLink to={{ kind: "prep", a: slug }} className="text-rw-accent hover:underline">
          {tl("Match prep")} →
        </HubLink>
        <HubLink to={{ kind: "draft", query: `teams=${encodeURIComponent(slug)}` }} className="text-rw-accent hover:underline">
          {tl("Draft board")} →
        </HubLink>
        <HubLink to={{ kind: "compare", mode: "team", a: slug }} className="text-rw-accent hover:underline">
          {tl("Compare")} →
        </HubLink>
        <HubLink to={{ kind: "rankings" }} className="text-rw-accent hover:underline">
          {tl("Power rankings")} →
        </HubLink>
        <HubLink to={{ kind: "tiers" }} className="text-rw-accent hover:underline">
          {tl("Pro tier list")} →
        </HubLink>
        <HubLink to={{ kind: "finder", query: `team=${encodeURIComponent(slug)}` }} className="text-rw-accent hover:underline">
          {tl("Game finder")} →
        </HubLink>
        <HubLink to={{ kind: "leaders" }} className="text-rw-accent hover:underline">
          {tl("Player leaderboards")} →
        </HubLink>
      </span>
    }
  >
    <TeamSeriesBody slug={slug} teamName={teamName} />
  </Section>
);

// ── Compare: every meeting of two teams ───────────────────────────────────

export const HeadToHeadSeries: React.FC<{ a: string; b: string; aName: string; bName: string }> = ({ a, b, aName, bName }) => {
  const state = useLoad(() => loadTeamSeries(a), [a]);
  const all = useMemo(() => (state.data || []).filter((r) => r[2] === b), [state.data, b]);
  // narrow to one event or one year
  const [event, setEvent] = useState("all");
  const [year, setYear] = useState("all");
  const events = useMemo(() => [...new Map(all.map((r) => [r[6], r[5]])).entries()], [all]);
  const years = useMemo(() => [...new Set(all.map((r) => r[0].slice(0, 4)))], [all]);
  const rows = useMemo(() => all.filter((r) => (event === "all" || r[6] === event) && (year === "all" || r[0].startsWith(year))), [all, event, year]);
  const [hidden] = useHidden(`h2h:${a}:${b}`, rows.find((r) => isFresh(r[0]))?.[0]);
  if (state.loading) return <Loading />;
  if (state.error) return null;
  const wa = rows.filter((r) => r[3] > r[4]).length;
  const ga = rows.reduce((t, r) => t + r[3], 0);
  const gb = rows.reduce((t, r) => t + r[4], 0);
  return (
    <Section
      title={tl("Every series between them")}
      right={
        !hidden && rows.length > 0 ? (
          <span className="flex flex-wrap items-center gap-2 text-[11px]">
            <HubLink
              to={{
                kind: "prep",
                a,
                b,
                period: event !== "all" ? `e:${event}` : year !== "all" ? `y${year}` : undefined,
              }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Match prep")} →
            </HubLink>
            <HubLink
              to={{
                kind: "compare",
                mode: "team",
                a,
                b,
                period: event !== "all" ? `e:${event}` : year !== "all" ? `y${year}` : undefined,
              }}
              className="text-rw-muted hover:text-rw-accent hover:underline"
            >
              {tl("Compare")} →
            </HubLink>
            <HubLink
              to={{
                kind: "draft",
                query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}${event !== "all" ? `&p=e:${encodeURIComponent(event)}` : year !== "all" ? `&p=y${encodeURIComponent(year)}` : ""}`,
              }}
              className="text-rw-muted hover:text-rw-accent hover:underline"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink
              to={{ kind: "rankings" }}
              className="text-rw-muted hover:text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{
                kind: "tiers",
                ...(year !== "all" ? { query: `key=y${encodeURIComponent(year)}` } : {}),
              }}
              className="text-rw-muted hover:text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{
                kind: "finder",
                query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}${event !== "all" ? `&event=${encodeURIComponent(event)}` : year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
              }}
              className="text-rw-muted hover:text-rw-accent hover:underline"
            >
              {tl("Game finder")} →
            </HubLink>
            <HubLink
              to={{
                kind: "leaders",
                ...(event !== "all" ? { query: `event=${encodeURIComponent(event)}` } : year !== "all" ? { query: `year=${encodeURIComponent(year)}` } : {}),
              }}
              className="text-rw-muted hover:text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <CopyArchivePost
              title={`${aName} vs ${bName}`}
              sub={`${aName} ${wa} – ${rows.length - wa} ${bName} · ${tl("Games {a}–{b}", { a: ga, b: gb })}`}
              rows={rows.slice(0, 5).map((r) => `${aName} ${r[3]}–${r[4]} ${bName} · ${r[5]} (${fmtDate(r[0])})`)}
              url={hubShareUrl({
                kind: "compare",
                mode: "team",
                a,
                b,
                ...(event !== "all" ? { period: `e:${event}` } : year !== "all" ? { period: `y${year}` } : {}),
              })}
            />
            <SectionCard
              section={tl("Every series between them")}
              sub={`${aName} ${wa} – ${rows.length - wa} ${bName} · ${tl("Games {a}–{b}", { a: ga, b: gb })}`}
              name={`h2h-series-${a}-vs-${b}`}
              rows={() =>
                rows.slice(0, 10).map((r, idx) => ({
                  rank: idx + 1,
                  team: r[3] > r[4] ? aName : bName,
                  label: `${aName} ${r[3]} – ${r[4]} ${bName}`,
                  sub: `${r[5]} · ${fmtDate(r[0])}`,
                  value: r[3] > r[4] ? aName : bName,
                  win: r[3] > r[4],
                }))
              }
            />
          </span>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-xs text-rw-sub">{tl("These two teams have never played each other.")}</p>
      ) : (
        <>
          {hidden ? (
            <p className="text-sm font-bold text-rw-text">{tn("{n} series", "{n} series", rows.length)}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-rw-border bg-rw-bg/60 px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between text-xs font-bold tabular-nums">
                  <span className="inline-flex items-center gap-1.5 text-rw-side-a truncate min-w-0">
                    <HubLink to={{ kind: "team", slug: a }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
                      <TeamLogo name={aName} size={15} />
                    </HubLink>
                    <TeamLink name={aName} u={a} className="truncate hover:underline" />{" "}
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}${event !== "all" ? `&event=${encodeURIComponent(event)}` : year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
                      }}
                      className="hover:underline"
                    >
                      {wa}
                    </HubLink>
                  </span>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}${event !== "all" ? `&event=${encodeURIComponent(event)}` : year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
                    }}
                    className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted hover:text-rw-accent hover:underline"
                  >
                    {tl("Series")}
                  </HubLink>
                  <span className="inline-flex items-center justify-end gap-1.5 text-rw-side-b truncate text-right min-w-0">
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `team=${encodeURIComponent(b)}&vs=${encodeURIComponent(a)}${event !== "all" ? `&event=${encodeURIComponent(event)}` : year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
                      }}
                      className="hover:underline"
                    >
                      {rows.length - wa}
                    </HubLink>{" "}
                    <TeamLink name={bName} u={b} className="truncate hover:underline" />
                    <HubLink to={{ kind: "team", slug: b }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
                      <TeamLogo name={bName} size={15} />
                    </HubLink>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-rw-raised overflow-hidden flex gap-[2px]">
                  <div className="h-full bg-rw-side-a/85" style={{ width: `${Math.round((wa / Math.max(1, rows.length)) * 100)}%` }} />
                  <div className="h-full flex-1 bg-rw-side-b/85" />
                </div>
              </div>
              {ga + gb > 0 && (
                <div className="rounded-lg border border-rw-border bg-rw-bg/60 px-2.5 py-2 space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold tabular-nums">
                    <span className="inline-flex items-center gap-1.5 text-rw-side-a truncate min-w-0">
                      <HubLink to={{ kind: "team", slug: a }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
                        <TeamLogo name={aName} size={15} />
                      </HubLink>
                      <TeamLink name={aName} u={a} className="truncate hover:underline" />{" "}
                      <HubLink
                        to={{
                          kind: "finder",
                          query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}${event !== "all" ? `&event=${encodeURIComponent(event)}` : year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
                        }}
                        className="hover:underline"
                      >
                        {ga}
                      </HubLink>
                    </span>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}${event !== "all" ? `&event=${encodeURIComponent(event)}` : year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
                      }}
                      className="text-[10px] font-semibold uppercase tracking-wider text-rw-muted hover:text-rw-accent hover:underline"
                    >
                      {tl("Games")}
                    </HubLink>
                    <span className="inline-flex items-center justify-end gap-1.5 text-rw-side-b truncate text-right min-w-0">
                      <HubLink
                        to={{
                          kind: "finder",
                          query: `team=${encodeURIComponent(b)}&vs=${encodeURIComponent(a)}${event !== "all" ? `&event=${encodeURIComponent(event)}` : year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
                        }}
                        className="hover:underline"
                      >
                        {gb}
                      </HubLink>{" "}
                      <TeamLink name={bName} u={b} className="truncate hover:underline" />
                      <HubLink to={{ kind: "team", slug: b }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
                        <TeamLogo name={bName} size={15} />
                      </HubLink>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-rw-raised overflow-hidden flex gap-[2px]">
                    <div className="h-full bg-rw-side-a/85" style={{ width: `${Math.round((ga / Math.max(1, ga + gb)) * 100)}%` }} />
                    <div className="h-full flex-1 bg-rw-side-b/85" />
                  </div>
                </div>
              )}
            </div>
          )}
          {all.length > 3 && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={tl("Year")} className={select}>
                <option value="all">{tl("All years")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select value={event} onChange={(e) => setEvent(e.target.value)} aria-label={tl("Tournament")} className={`${select} max-w-[16rem]`}>
                <option value="all">{tl("Every tournament")}</option>
                {events.map(([u, n]) => (
                  <option key={u} value={u}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-rw-muted">{tl("The number before the date is the series rating: how good it was to watch, 0-100.")}</span>
            </div>
          )}
          <SeriesList rows={rows} teamName={aName} teamSlug={a} spoilerKey={`h2h:${a}:${b}`} showOpp={false} />
        </>
      )}
    </Section>
  );
};

// ── Player: every game ────────────────────────────────────────────────────

/** `champ`: open on that champion's games (the Champions tab's "Every game" button). Each game shows the items the
 *  player ended it with (hub/playeritems/: the finished ones first). */
const PlayerGamesBody: React.FC<{ slug: string; playerName?: string; champ?: string; year?: string; period?: PeriodKey }> = ({
  slug,
  playerName,
  champ: startChamp,
  year: startYear,
  period,
}) => {
  const displayName = playerName || slug;
  const state = useLoad(() => loadPlayerGames(slug), [slug]);
  const owned = useLoad(() => loadPlayerItems(slug).catch(() => null), [slug]);
  const [year, setYear] = useState(startYear || "all");
  const [champ, setChamp] = useState(startChamp || "all");
  const [opp, setOpp] = useState("all");
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"d" | "r">("d");
  const [n, setN] = useState(PAGE);
  useEffect(() => {
    if (startChamp) {
      setChamp(startChamp);
      setN(PAGE);
    }
  }, [startChamp]);
  useEffect(() => {
    if (startYear) {
      setYear(startYear);
      setN(PAGE);
    }
  }, [startYear]);
  const rawData = state.data || [];
  const data = useMemo(
    () => (period && period !== "all" && !/^y\d{4}$/.test(period) ? inPeriod(rawData, period, playerRowRef) : rawData),
    [rawData, period],
  );
  // each game's final items: playeritems lists, for every item, the rows of this log it was in
  const itemsOf = useMemo(() => {
    const m = new Map<PlayerGameRow, string[]>();
    for (const [it, pos] of owned.data || []) for (const p of pos) if (rawData[p]) m.set(rawData[p], [...(m.get(rawData[p]) || []), it]);
    for (const [r, its] of m) m.set(r, [...its].sort((a, b) => Number(isFinishedItem(b)) - Number(isFinishedItem(a))));
    return m;
  }, [owned.data, rawData]);
  const years = useMemo(() => [...new Set(data.map((r) => r[0].slice(0, 4)))], [data]);
  const champs = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of data) if (r[2]) count.set(r[2], (count.get(r[2]) || 0) + 1);
    return [...count.entries()].sort((x, y) => y[1] - x[1]);
  }, [data]);
  const opps = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of data) if (r[8]) count.set(r[8], (count.get(r[8]) || 0) + 1);
    return [...count.entries()].sort((x, y) => y[1] - x[1]);
  }, [data]);
  const rows = useMemo(() => {
    const terms = q
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return data.filter(
      (r: PlayerGameRow) =>
        (year === "all" || r[0].startsWith(year)) &&
        (champ === "all" || r[2] === champ) &&
        (opp === "all" || r[8] === opp) &&
        (!terms.length ||
          terms.some((term) => {
            const hay = `${r[2] || ""} ${champName(r[2] || "")} ${r[7] || ""} ${r[8] || ""} ${r[9] || ""} ${r[10] || ""}`.toLowerCase();
            return hay.includes(term);
          })),
    );
  }, [data, year, champ, opp, q]);
  const [hidden, reveal] = useHidden(`playergames:${slug}:${year}:${champ}:${opp}:${q}`, rows.find((r) => isFresh(r[0]))?.[0]);
  const shown = useMemo(
    () => (order === "r" ? rows.filter((r) => r[23] != null && !(hidden && isFresh(r[0]))).sort((x, y) => (y[23] || 0) - (x[23] || 0)) : rows),
    [rows, order, hidden],
  );
  if (state.loading) return <Loading />;
  if (state.error || !state.data) return <Failed missing={state.missing} />;
  const won = rows.filter((r) => r[6]).length;
  const k = rows.reduce((s, r) => s + r[3], 0);
  const d = rows.reduce((s, r) => s + r[4], 0);
  const a = rows.reduce((s, r) => s + r[5], 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => { setYear(e.target.value); setN(PAGE); }} aria-label={tl("Year")} className={select}>
          <option value="all">{tl("All years")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={champ} onChange={(e) => { setChamp(e.target.value); setN(PAGE); }} aria-label={tl("Champion")} className={select}>
          <option value="all">{tl("All champions")}</option>
          {champs.map(([c, cnt]) => (
            <option key={c} value={c}>
              {champName(c)} ({cnt})
            </option>
          ))}
        </select>
        <select value={opp} onChange={(e) => { setOpp(e.target.value); setN(PAGE); }} aria-label={tl("Opponent")} className={`${select} max-w-[13rem]`}>
          <option value="all">{tl("Against: anyone")}</option>
          {opps.map(([o, cnt]) => (
            <option key={o} value={o}>
              {o} ({cnt})
            </option>
          ))}
        </select>
        <select value={order} onChange={(e) => setOrder(e.target.value as "d" | "r")} aria-label={tl("Order")} className={select}>
          <option value="d">{tl("Newest first")}</option>
          <option value="r">{tl("Top rated")}</option>
        </select>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setN(PAGE);
          }}
          placeholder={tl("Filter by opponent or tournament…")}
          aria-label={tl("Filter by opponent or tournament…")}
          className={`${select} flex-1 min-w-[10rem] placeholder-rw-muted`}
        />
        <HubLink
          to={{
            kind: "finder",
            query: `player=${encodeURIComponent(slug)}${champ !== "all" ? `&champ=${encodeURIComponent(champ)}` : ""}${year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}${opp !== "all" ? `&vs=${encodeURIComponent(prettySlug(opp))}` : ""}`,
          }}
          className="inline-flex flex-wrap items-center gap-2 text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
          title={!hidden && rows.length > 0 ? tl("KDA {n}", { n: fmtDec((k + a) / Math.max(d, 1), 2) }) : tl("Game finder")}
        >
          <span>{tn("{n} game", "{n} games", rows.length)}</span>
          {!hidden && rows.length > 0 && <WinBar w={won} g={rows.length} />}
          {!hidden && rows.length > 0 && <KdaBar kda={Number(((k + a) / Math.max(d, 1)).toFixed(2))} />}
        </HubLink>
        {!hidden && shown.length > 0 && (
          <>
            <HubLink
              to={{
                kind: "compare",
                mode: "player",
                a: slug,
                ...(year !== "all" ? { period: `y${year}` } : {}),
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Compare")} →
            </HubLink>
            <HubLink
              to={{
                kind: "items",
                query: new URLSearchParams({ player: slug, ...(champ !== "all" ? { champ: prettySlug(champ) } : {}) }).toString(),
              }}
              className="text-[11px] text-rw-accent hover:underline"
            >
              {tl("Item history")} →
            </HubLink>
            {champ !== "all" && (
              <HubLink
                to={{ kind: "counters", query: `champ=${prettySlug(champ)}` }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Counters")} →
              </HubLink>
            )}
            {shown[0]?.[7] && shown[0]?.[8] && (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: prettySlug(shown[0][7]),
                    b: prettySlug(shown[0][8]),
                    ...(year !== "all" ? { period: `y${year}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(prettySlug(shown[0][7]))},${encodeURIComponent(prettySlug(shown[0][8]))}${year !== "all" ? `&p=y${encodeURIComponent(year)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </HubLink>
              </>
            )}
            <HubLink
              to={{ kind: "leaders", ...(year !== "all" ? { query: `year=${encodeURIComponent(year)}` } : {}) }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{ kind: "tiers", ...(year !== "all" ? { query: `key=y${encodeURIComponent(year)}` } : {}) }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{ kind: "rankings" }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </HubLink>
            <CopyArchivePost
              title={`${tl("Every game")} · ${displayName}${champ !== "all" ? ` · ${champName(champ)}` : ""}${year !== "all" ? ` (${year})` : ""}`}
              sub={`${tn("{n} game", "{n} games", rows.length)} · ${Math.round((won / rows.length) * 100)}% · KDA ${fmtDec((k + a) / Math.max(d, 1), 2)}`}
              rows={shown.slice(0, 5).map((r) => `${r[6] ? tc("short result", "W") : tc("short result", "L")} ${champName(r[2])} (${r[3]}/${r[4]}/${r[5]}) vs ${r[8]} · ${r[9]} (${fmtDate(r[0])})`)}
              url={hubShareUrl({
                kind: "player",
                slug,
                tab: champ !== "all" ? "champions" : "matches",
                query:
                  [
                    champ !== "all" ? `champ=${encodeURIComponent(champ)}` : "",
                    year !== "all" ? `p=y${encodeURIComponent(year)}` : "",
                  ]
                    .filter(Boolean)
                    .join("&") || undefined,
              })}
            />
            <SectionCard
              section={`${tl("Every game")} · ${displayName}`}
              sub={`${tn("{n} game", "{n} games", rows.length)} · ${Math.round((won / rows.length) * 100)}%`}
              name={`${slug}-games-${year}-${champ}`}
              rows={() =>
                shown.slice(0, 10).map((r, idx) => ({
                  rank: idx + 1,
                  champ: r[2],
                  team: r[7] || r[8],
                  label: `${champName(r[2])} (${r[3]}/${r[4]}/${r[5]}) vs ${r[8]}`,
                  sub: `${r[9]} · ${fmtDate(r[0])}`,
                  value: r[6] ? tc("short result", "W") : tc("short result", "L"),
                  win: Boolean(r[6]),
                }))
              }
            />
          </>
        )}
        {hidden && <RevealButton onReveal={reveal} small />}
      </div>
      <ul className="text-xs space-y-1">
        {shown.slice(0, n).map((r, i) => {
          const hide = hidden && isFresh(r[0]);
          const its = itemsOf.get(r);
          return (
            <li key={i} className="min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                {!hide && r[1] ? (
                  <HubLink
                    to={{ kind: "match", slug: r[1], game: r[22] || undefined }}
                    className={`w-3.5 shrink-0 font-bold hover:underline ${r[6] ? "text-rw-teal" : "text-rw-red"}`}
                  >
                    {r[6] ? tc("short result", "W") : tc("short result", "L")}
                  </HubLink>
                ) : (
                  <span className={`w-3.5 shrink-0 font-bold ${hide ? "text-rw-muted" : r[6] ? "text-rw-teal" : "text-rw-red"}`}>
                    {hide ? "?" : r[6] ? tc("short result", "W") : tc("short result", "L")}
                  </span>
                )}
                <HubLink to={{ kind: "champ", slug: prettySlug(r[2]) }} className="hover:opacity-80" title={champName(r[2])}>
                  <ChampIcon name={r[2]} size={18} />
                </HubLink>
                <span className="truncate min-w-0">
                  {!hide && r[1] ? (
                    <HubLink
                      to={{ kind: "match", slug: r[1], game: r[22] || undefined }}
                      className="text-rw-text tabular-nums hover:text-rw-accent hover:underline"
                    >
                      {`${r[3]}/${r[4]}/${r[5]}`}
                    </HubLink>
                  ) : (
                    <span className="text-rw-text tabular-nums">{hide ? "?/?/?" : `${r[3]}/${r[4]}/${r[5]}`}</span>
                  )}{" "}
                  <span className="text-rw-sub inline-flex items-center gap-1 align-baseline">
                    {r[7] && (
                      <HubLink to={{ kind: "team", slug: prettySlug(r[7]) }} title={r[7]} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
                        <TeamLogo name={r[7]} size={13} />
                      </HubLink>
                    )}
                    <HubLink
                      to={{
                        kind: "finder",
                        query: `player=${encodeURIComponent(slug)}&vs=${encodeURIComponent(prettySlug(r[8]))}${champ !== "all" ? `&champ=${encodeURIComponent(champ)}` : ""}${year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}`,
                      }}
                      className="text-rw-muted hover:text-rw-accent hover:underline"
                      title={tl("Game finder")}
                    >
                      vs
                    </HubLink>
                    <HubLink to={{ kind: "team", slug: prettySlug(r[8]) }} className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent">
                      <TeamLogo name={r[8]} size={13} />
                    </HubLink>
                    <TeamLink name={r[8]} />
                    {r[10] ? (
                      <>
                        {" · "}
                        <HubLink
                          to={{ kind: "finder", query: `player=${encodeURIComponent(slug)}&role=${encodeURIComponent(r[10])}${year !== "all" ? `&year=${encodeURIComponent(year)}` : ""}` }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {roleName(r[10])}
                        </HubLink>
                      </>
                    ) : (
                      ""
                    )}
                  </span>{" "}
                  <span className="text-rw-muted">
                    · <EventLink name={r[9]} u={r[11]} className="text-rw-muted hover:text-rw-accent hover:underline" />
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0 text-rw-muted">
                {!hide && r[23] != null && (
                  r[1] ? (
                    <HubLink
                      to={{ kind: "match", slug: r[1], game: r[22] || undefined }}
                      className={`tabular-nums font-semibold hover:underline ${ratingTextClass(r[23])}`}
                      title={tl("Game rating")}
                    >
                      {r[23].toFixed(0)}
                    </HubLink>
                  ) : (
                    <span className={`tabular-nums font-semibold ${ratingTextClass(r[23])}`} title={tl("Game rating")}>
                      {r[23].toFixed(0)}
                    </span>
                  )
                )}
                {r[1] ? (
                  <HubLink to={{ kind: "match", slug: r[1], game: r[22] || undefined }} className="hover:text-rw-text hover:underline">
                    {fmtDate(r[0])}
                  </HubLink>
                ) : (
                  fmtDate(r[0])
                )}
                {r[2] && (
                  <>
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(prettySlug(r[2]))}${r[10] ? `&role=${encodeURIComponent(r[10])}` : ""}`,
                      }}
                      className="hidden sm:inline text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Counters")}
                    >
                      {tl("Counters")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "items",
                        query: `player=${encodeURIComponent(slug)}&champ=${encodeURIComponent(prettySlug(r[2]))}`,
                      }}
                      className="hidden sm:inline text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Item history")}
                    >
                      {tl("Item history")}
                    </HubLink>
                  </>
                )}
                {r[7] && r[8] && (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: prettySlug(r[7]),
                        b: prettySlug(r[8]),
                        ...(/^\d{4}/.test(r[0]) ? { period: `y${r[0].slice(0, 4)}` } : {}),
                      }}
                      className="hidden sm:inline text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Match prep")}
                    >
                      {tl("Match prep")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(prettySlug(r[7]))},${encodeURIComponent(prettySlug(r[8]))}${/^\d{4}/.test(r[0]) ? `&p=y${r[0].slice(0, 4)}` : ""}`,
                      }}
                      className="hidden sm:inline text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Draft board")}
                    >
                      {tl("Draft board")}
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a: prettySlug(r[7]),
                        b: prettySlug(r[8]),
                        ...(/^\d{4}/.test(r[0]) ? { period: `y${r[0].slice(0, 4)}` } : {}),
                      }}
                      className="hidden sm:inline text-rw-sub hover:text-rw-accent hover:underline"
                      title={tl("Compare")}
                    >
                      {tl("Compare")}
                    </HubLink>
                  </>
                )}
                {r[1] && (
                  <HubLink to={{ kind: "match", slug: r[1], game: r[22] || undefined }} className="text-rw-accent hover:underline">
                    {tl("Details")}
                  </HubLink>
                )}
              </span>
            </div>
            {its && its.length > 0 && (
              <div className="flex flex-wrap items-center gap-0.5 mt-0.5 pl-5" aria-label={tl("Items")}>
                {its.map((it) => (
                  <HubLink
                    key={it}
                    to={{ kind: "items", query: new URLSearchParams({ player: slug, item: prettySlug(it), ...(r[2] ? { champ: prettySlug(r[2]) } : {}) }).toString() }}
                    className="hover:opacity-80"
                    title={itemName(it)}
                  >
                    <ItemIcon name={it} size={18} />
                  </HubLink>
                ))}
              </div>
            )}
            </li>
          );
        })}
      </ul>
      {shown.length > n && (
        <button type="button" onClick={() => setN((x) => x + PAGE * 4)} className="text-[11px] text-rw-accent hover:underline">
          {tl("Show more ({n} left)", { n: shown.length - n })}
        </button>
      )}
    </div>
  );
};

export const PlayerGamesArchive: React.FC<{ slug: string; playerName?: string }> = ({ slug, playerName }) => (
  <Section
    title={tl("Every game")}
    right={
      <span className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-rw-muted">{tl("Show every game, with filters for year and champion")}</span>
        <HubLink to={{ kind: "compare", mode: "player", a: slug }} className="text-rw-accent hover:underline">
          {tl("Compare")} →
        </HubLink>
        <HubLink to={{ kind: "items", query: `player=${encodeURIComponent(slug)}` }} className="text-rw-accent hover:underline">
          {tl("Item history")} →
        </HubLink>
        <HubLink to={{ kind: "tiers" }} className="text-rw-accent hover:underline">
          {tl("Pro tier list")} →
        </HubLink>
        <HubLink to={{ kind: "leaders" }} className="text-rw-accent hover:underline">
          {tl("Player leaderboards")} →
        </HubLink>
        <HubLink to={{ kind: "finder", query: `player=${encodeURIComponent(slug)}` }} className="text-rw-accent hover:underline">
          {tl("Game finder")} →
        </HubLink>
        <HubLink to={{ kind: "rankings" }} className="text-rw-accent hover:underline">
          {tl("Power rankings")} →
        </HubLink>
      </span>
    }
  >
    <PlayerGamesBody slug={slug} playerName={playerName} />
  </Section>
);

/** Every game of a player on one champion, open at once (the Champions tab, after a champion is picked). */
export const PlayerChampGames: React.FC<{ slug: string; playerName?: string; champ: string; year?: string; period?: PeriodKey; onClose: () => void }> = ({
  slug,
  playerName,
  champ,
  year,
  period,
  onClose,
}) => (
  <Section
    title={tl("Every game on {champ}", { champ: champName(champ) })}
    right={
      <span className="flex flex-wrap items-center gap-2 text-[11px]">
        <HubLink to={{ kind: "compare", mode: "player", a: slug }} className="text-rw-accent hover:underline">
          {tl("Compare")} →
        </HubLink>
        <HubLink to={{ kind: "counters", query: `champ=${encodeURIComponent(prettySlug(champ))}` }} className="text-rw-accent hover:underline">
          {tl("Counters")} →
        </HubLink>
        <HubLink to={{ kind: "items", query: `player=${encodeURIComponent(slug)}&champ=${encodeURIComponent(prettySlug(champ))}` }} className="text-rw-accent hover:underline">
          {tl("Item history")} →
        </HubLink>
        <HubLink to={{ kind: "leaders" }} className="text-rw-accent hover:underline">
          {tl("Player leaderboards")} →
        </HubLink>
        <HubLink to={{ kind: "tiers" }} className="text-rw-accent hover:underline">
          {tl("Pro tier list")} →
        </HubLink>
        <HubLink to={{ kind: "rankings" }} className="text-rw-accent hover:underline">
          {tl("Power rankings")} →
        </HubLink>
        <HubLink to={{ kind: "finder", query: `player=${encodeURIComponent(slug)}&champ=${encodeURIComponent(champ)}` }} className="text-rw-accent hover:underline">
          {tl("Game finder")} →
        </HubLink>
        <button type="button" onClick={onClose} className="text-rw-accent hover:underline">
          {tl("Close")}
        </button>
      </span>
    }
  >
    <PlayerGamesBody slug={slug} playerName={playerName} champ={champ} year={year} period={period} />
  </Section>
);

const CopyArchivePost: React.FC<{
  title: string;
  sub: string;
  rows: string[];
  url: string;
}> = ({ title, sub, rows, url }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [`${title} (${sub})`];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push(url);
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        setState("failed");
        setTimeout(() => setState("idle"), 2400);
      });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

