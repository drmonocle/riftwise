/**
 * Playoff chances on a tournament page while its league table is still being played (hub/playoffOdds.ts): each
 * team's chance to finish first and in the top N. The cut line is the viewer's choice: leagues send different
 * numbers of teams to their playoffs. Hidden like the standings in spoiler mode (the records are results).
 */
import React, { useMemo, useState } from "react";
import { tl } from "../../i18n";
import { loadRatings } from "../../hub/data";
import { hubShareUrl } from "../../hub/route";
import type { HubEvent } from "../../hub/types";
import { playoffOdds } from "../../hub/playoffOdds";
import { chanceShade } from "../SwissStandings";
import { SectionCard } from "./BroadcastCard";
import { fmtNum, HubLink, RevealButton, Section, TeamLink, TeamLogo, useHidden, useLoad } from "./ui";
import { STable } from "../STable";

const pctText = (p: number) => (p === 0 ? "0%" : p < 0.005 ? "<1%" : p > 0.995 && p < 1 ? ">99%" : `${Math.round(p * 100)}%`);

export const PlayoffChances: React.FC<{ e: HubEvent }> = ({ e }) => {
  const ratings = useLoad(loadRatings, []);
  const today = new Date().toISOString().slice(0, 10);
  const odds = useMemo(() => (ratings.data ? playoffOdds(e, ratings.data, today) : null), [e, ratings.data, today]);
  const [pick, setPick] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [hidden, reveal] = useHidden(`playoffs:${e.u}`, e.end);
  if (!odds) return null;
  const cut = pick != null && odds.cuts.includes(pick) ? pick : odds.cut;
  const ci = odds.cuts.indexOf(cut);
  const rows = [...odds.rows].sort((a, b) => b.top[ci] - a.top[ci] || b.first - a.first || b.sw - a.sw);
  const terms = search
    .trim()
    .toLowerCase()
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const filteredRows = terms.length
    ? rows.filter((r) => terms.some((q) => r.name.toLowerCase().includes(q) || r.u.toLowerCase().includes(q)))
    : rows;
  const unrated = odds.rows.filter((r) => r.unrated).length;
  const th = "px-1.5 sm:px-2 py-1 font-normal text-[10px] text-rw-muted whitespace-nowrap";
  const seg = (on: boolean) => `px-2 py-1 pointer-coarse:min-h-9 max-sm:min-h-9 ${on ? "bg-rw-accent/15 text-rw-text" : "text-rw-sub hover:text-rw-text"}`;
  return (
    <Section
      title={tl("Playoff chances")}
      right={
        hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            {rows.length > 6 && (
              <input
                type="search"
                value={search}
                onChange={(ev) => setSearch(ev.target.value)}
                placeholder={tl("Filter by name or team…")}
                aria-label={tl("Filter by name or team…")}
                data-nocapture="1"
                className="bg-rw-bg border border-rw-border rounded-md px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-36"
              />
            )}
            <span data-nocapture="1" className="flex rounded border border-rw-border divide-x divide-rw-border overflow-hidden text-[11px]" role="group" aria-label={tl("Cut line")}>
              {odds.cuts.map((k) => (
                <button key={k} type="button" aria-pressed={k === cut} onClick={() => setPick(k)} className={seg(k === cut)}>
                  {tl("Top {n}", { n: k })}
                </button>
              ))}
            </span>
            {filteredRows.length >= 2 && (
              <>
                <HubLink
                  data-nocapture="1"
                  to={{ kind: "prep", a: filteredRows[0].u, b: filteredRows[1].u, period: `e:${e.u}` }}
                  className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
                  title={tl("Match prep")}
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  data-nocapture="1"
                  to={{ kind: "draft", query: `teams=${encodeURIComponent(filteredRows[0].u)},${encodeURIComponent(filteredRows[1].u)}&p=${encodeURIComponent(`e:${e.u}`)}` }}
                  className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
                  title={tl("Draft board")}
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  data-nocapture="1"
                  to={{ kind: "compare", mode: "team", a: filteredRows[0].u, b: filteredRows[1].u, period: `e:${e.u}` }}
                  className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60"
                  title={tl("Compare {a} and {b}", { a: filteredRows[0].name, b: filteredRows[1].name })}
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  data-nocapture="1"
                  to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}` }}
                  className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-accent hover:border-rw-accent/60"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  data-nocapture="1"
                  to={{ kind: "rankings" }}
                  className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-accent hover:border-rw-accent/60"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  data-nocapture="1"
                  to={{ kind: "leaders", query: `event=${encodeURIComponent(e.u)}` }}
                  className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-accent hover:border-rw-accent/60"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  data-nocapture="1"
                  to={{ kind: "tiers" }}
                  className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-accent hover:border-rw-accent/60"
                >
                  {tl("Pro tier list")} →
                </HubLink>
              </>
            )}
            <CopyPlayoffOddsPost
              eventName={e.n}
              slug={e.u}
              cut={cut}
              rows={filteredRows.slice(0, 8).map((r, idx) => `#${idx + 1} ${r.name} (${r.sw}-${r.sl}): ${tl("Top {n}", { n: cut })} ${pctText(r.top[ci])} · #1 ${pctText(r.first)}`)}
            />
            <SectionCard
              section={tl("Playoff chances")}
              sub={`${e.n} · ${tl("Top {n}", { n: cut })}`}
              name={`${e.u}-playoff-chances-top-${cut}`}
              rows={() =>
                filteredRows.slice(0, 10).map((r, idx) => ({
                  rank: idx + 1,
                  team: r.name,
                  label: r.name,
                  sub: `${r.sw}-${r.sl} · #1 ${pctText(r.first)}`,
                  value: pctText(r.top[ci]),
                  win: r.top[ci] >= 0.5,
                }))
              }
            />
          </span>
        )
      }
      share={`${e.u}-playoff-chances`}
    >
      {hidden ? (
        <p className="text-xs text-rw-muted">{tl("Hidden while spoiler mode is on.")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            {/* fixed layout: the number columns keep their width, the team names take the rest and truncate (phones) */}
            <STable className="w-full text-xs table-fixed">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>{tl("Team")}</th>
                  <th className={`${th} text-right w-10 sm:w-16`}>{tl("Series")}</th>
                  <th className={`${th} text-right w-12 max-sm:hidden`} title={tl("Series still to play")}>{tl("Left")}</th>
                  <th className={`${th} text-right w-10 sm:w-24`} title={tl("First place")}>
                    <span className="sm:hidden">#1</span>
                    <span className="max-sm:hidden">{tl("First place")}</span>
                  </th>
                  <th className={`${th} text-right w-16`}>{tl("Top {n}", { n: cut })}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.u} className="border-t border-rw-border">
                    <td className="px-1.5 sm:px-2 py-1 truncate" data-sort={r.name}>
                      <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                        <HubLink to={{ kind: "team", slug: r.u }} className="shrink-0 hover:opacity-80" title={r.name}>
                          <TeamLogo name={r.name} size={15} />
                        </HubLink>
                        <TeamLink name={r.name} u={r.u} className="truncate" />
                        {r.unrated && <span className="text-rw-muted shrink-0" title={tl("No power rating yet: played at the table's median rating")}> *</span>}
                      </span>
                    </td>
                    <td className="px-1.5 sm:px-2 py-1 text-right tabular-nums text-rw-sub whitespace-nowrap" data-sort={r.sw * 100 - r.sl}>
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {r.sw + r.sl > 0 && (
                          <span className="w-8 h-1.5 rounded-full bg-rw-border/60 overflow-hidden hidden sm:inline-flex shrink-0">
                            <span className="h-full bg-rw-teal/85" style={{ width: `${Math.round((r.sw / (r.sw + r.sl)) * 100)}%` }} />
                            <span className="h-full bg-rw-red/75" style={{ width: `${100 - Math.round((r.sw / (r.sw + r.sl)) * 100)}%` }} />
                          </span>
                        )}
                        <HubLink
                          to={{ kind: "finder", query: new URLSearchParams({ event: e.u, team: r.u }).toString() }}
                          className="hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {r.sw}-{r.sl}
                        </HubLink>
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-rw-muted max-sm:hidden" data-sort={r.left}>
                      <HubLink
                        to={{ kind: "event", slug: e.u, tab: "matches" }}
                        className="hover:text-rw-accent hover:underline"
                        title={tl("Matches")}
                      >
                        {r.left}
                      </HubLink>
                    </td>
                    <td className="px-1 py-0.5 text-right" data-sort={r.first}>
                      <HubLink
                        to={{ kind: "team", slug: r.u, tab: "stats", query: `p=e:${encodeURIComponent(e.u)}` }}
                        className="hover:underline"
                        title={tl("Stats")}
                      >
                        <span className="inline-block min-w-[3rem] rounded-sm px-1.5 py-0.5 text-center tabular-nums text-rw-sub" style={chanceShade(r.first)}>
                          {pctText(r.first)}
                        </span>
                      </HubLink>
                    </td>
                    <td className="px-1 py-0.5 text-right" data-sort={r.top[ci]}>
                      <HubLink
                        to={{ kind: "team", slug: r.u, tab: "stats", query: `p=e:${encodeURIComponent(e.u)}` }}
                        className="hover:underline"
                        title={tl("Stats")}
                      >
                        <span className="inline-block min-w-[3rem] rounded-sm px-1.5 py-0.5 text-center tabular-nums text-rw-text" style={chanceShade(r.top[ci])}>
                          {pctText(r.top[ci])}
                        </span>
                      </HubLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </STable>
          </div>
          <p className="text-[10px] text-rw-muted">
            {tl(
              "The {n} series still to play, each played out {runs} times with the power ratings (best of 3 and 5 from the one-game chance). Ties on series wins go to game difference, then by lot: the league's own tiebreakers aren't modelled. Pick the cut line the league uses; as of the last stats update.",
              { n: odds.open, runs: fmtNum(odds.runs) },
            )}
            {` ${tl("Records come from the series list below; the standings table can differ for a while as results come in.")}`}
            {unrated > 0 && ` ${tl("* No power rating yet: played at the table's median rating")}`}
          </p>
        </>
      )}
    </Section>
  );
};

const CopyPlayoffOddsPost: React.FC<{
  eventName: string;
  slug: string;
  cut: number;
  rows: string[];
}> = ({ eventName, slug, cut, rows }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [`${tl("Playoff chances")} · ${eventName} (${tl("Top {n}", { n: cut })})`];
    for (const r of rows) {
      lines.push(r);
    }
    lines.push(hubShareUrl({ kind: "event", slug }));
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
      data-nocapture="1"
      onClick={copy}
      className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
