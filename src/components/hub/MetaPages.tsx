/** Patch history (the pro meta on every patch) and league histories (every season and its winner). */
import React, { useEffect, useMemo, useState } from "react";
import { Crown, ClipboardCopy } from "lucide-react";
import { tl, tn, regionName } from "../../i18n";
import { loadLeague, loadLeagues, loadPatches, normText, prettySlug } from "../../hub/data";
import type { HubLeague, LeagueRow, LeagueStep, PatchMove, PatchRow } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import {
  card,
  ChampLink,
  EventLink,
  fmtDate,
  fmtNum,
  HubLink,
  Page,
  RevealButton,
  StandingsFirst,
  Section,
  td,
  th,
  TeamLink,
  TeamLogo,
  useHidden,
  useHiddenCheck,
  useLoad,
  usePageTitle,
  FollowFeeds,
} from "./ui";
import { STable } from "../STable";
import { currentHubRoute, hubShareUrl, navigateHub } from "../../hub/route";
import { LeagueSeasonPanel } from "./LeagueSeasonPanel";
import { EntityHero, heroBtn } from "./EntityHero";
import { SectionCard } from "./BroadcastCard";
import { champName } from "../../champions";

// ── Patches ───────────────────────────────────────────────────────────────

const CopyPatchPost: React.FC<{ p: PatchRow }> = ({ p }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines = [
      `${tl("Patch {patch}", { patch: p.p })} (${fmtDate(p.from)} – ${fmtDate(p.to)} · ${tn("{n} game", "{n} games", p.g)})`,
      ...p.c.slice(0, 5).map(([c, pk, b, w, pr], i) => {
        const presPct = Math.round(((pr ?? pk + b) / Math.max(p.g, 1)) * 100);
        const wr = pk ? ` · ${Math.round((w / pk) * 100)}% WR` : "";
        return `#${i + 1} ${champName(c)}: ${presPct}% (${pk}P/${b}B${wr})`;
      }),
      hubShareUrl({ kind: "champions", query: `key=p${p.p}` }),
    ];
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        setState("copied");
        setTimeout(() => setState("idle"), 1600);
      },
      () => {
        setState("failed");
        setTimeout(() => setState("idle"), 2000);
      },
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={tl("Copy a ready-to-post summary with the link, for X or Discord")}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-surface text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

export const PatchesPanel: React.FC = () => {
  usePageTitle(tl("Patches"));
  useDDragon();
  const state = useLoad(loadPatches, []);
  const [n, setN] = useState(24);
  const [q, setQ] = useState("");
  return (
    <Page state={state}>
      {(rows: PatchRow[]) => {
        const terms = q
          .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
          .map((s) => normText(s.trim()))
          .filter(Boolean);
        const filtered = terms.length
          ? rows.filter((p) =>
              terms.some(
                (term) =>
                  p.p.toLowerCase().includes(term) ||
                  p.c.some(([c]) => normText(champName(c)).includes(term) || normText(c).includes(term)) ||
                  (p.up || []).some(([c]) => normText(champName(c)).includes(term) || normText(c).includes(term)) ||
                  (p.down || []).some(([c]) => normText(champName(c)).includes(term) || normText(c).includes(term)),
              ),
            )
          : rows;
        return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-rw-muted">
              {tl(
                "The most picked or banned champions on every patch, newest first (all pro leagues). Percent = presence: picked or banned in that share of games.",
              )}
            </p>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tl("Search champions…")}
              aria-label={tl("Search champions…")}
              className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1 text-xs text-rw-text w-48"
              data-nocapture="1"
            />
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
          {filtered.slice(0, n).map((p) => (
            <div key={p.p} className={`${card} p-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-bold text-rw-text">
                    <HubLink to={{ kind: "champions", query: `key=p${p.p}` }} className="hover:text-rw-accent hover:underline">
                      {tl("Patch {patch}", { patch: p.p })}
                    </HubLink>
                  </h3>
                  <span className="text-[11px] text-rw-muted">
                    <HubLink to={{ kind: "finder", query: `patch=${encodeURIComponent(p.p)}` }} className="hover:text-rw-accent hover:underline">
                      {fmtDate(p.from)} – {fmtDate(p.to)}
                    </HubLink>{" "}
                    ·{" "}
                    <HubLink to={{ kind: "finder", query: `patch=${encodeURIComponent(p.p)}` }} className="hover:text-rw-accent hover:underline">
                      {tn("{n} game", "{n} games", p.g)}
                    </HubLink>
                  </span>
                </div>
                <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
                  {p.c.length >= 2 && (
                    <HubLink
                      to={{ kind: "counters", query: `champ=${prettySlug(p.c[0][0])}&vs=${encodeURIComponent(p.c[1][0])}` }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Counters")}
                    </HubLink>
                  )}
                  <HubLink to={{ kind: "tiers", query: `key=p${p.p}` }} className="text-rw-accent hover:underline font-semibold">
                    {tl("Pro tier list")}
                  </HubLink>
                  <HubLink to={{ kind: "champions", query: `key=p${p.p}` }} className="text-rw-accent hover:underline font-semibold">
                    {tl("Champions")}
                  </HubLink>
                  <SectionCard
                    section={tl("Patch {patch}", { patch: p.p })}
                    name={`${fmtDate(p.from)} – ${fmtDate(p.to)}`}
                    sub={tn("{n} game", "{n} games", p.g)}
                    rows={() => [
                      ...p.c.slice(0, 10).map(([c, pk, b, w, pr], idx) => ({
                        rank: idx + 1,
                        champ: c,
                        label: champName(c),
                        sub: tl("{p} picks · {b} bans · {wr}", {
                          p: pk,
                          b,
                          wr: pk ? `${Math.round((w / pk) * 100)}%` : "–",
                        }),
                        value: `${Math.round(((pr ?? pk + b) / Math.max(p.g, 1)) * 100)}%`,
                        win: pk >= 5 ? w / pk >= 0.5 : undefined,
                      })),
                      ...(p.up || []).slice(0, 2).map(([c, now, was], uIdx) => ({
                        rank: p.c.slice(0, 10).length + uIdx + 1,
                        champ: c,
                        label: `▲ ${champName(c)}`,
                        sub: p.prev ? tl("Rising since {patch}", { patch: p.prev }) : undefined,
                        value: `${Math.round(was * 100)}% → ${Math.round(now * 100)}%`,
                        win: true,
                      })),
                    ]}
                  />
                  <CopyPatchPost p={p} />
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2 text-xs">
                {p.c.map(([c, pk, b, w, pr]) => {
                  const presPct = Math.min(100, Math.round(((pr ?? pk + b) / Math.max(p.g, 1)) * 100));
                  const pickPct = Math.min(100, Math.round((pk / Math.max(p.g, 1)) * 100));
                  const banPct = Math.min(100 - pickPct, Math.round((b / Math.max(p.g, 1)) * 100));
                  const wrPct = pk ? Math.round((w / pk) * 100) : null;
                  return (
                    <div
                      key={c}
                      className="rounded-lg border border-rw-border/60 bg-rw-bg/40 px-2 py-1.5 space-y-1 min-w-0"
                      title={tl("{p} picks · {b} bans · {wr}", {
                        p: pk,
                        b,
                        wr: wrPct != null ? `${wrPct}%` : "–",
                      })}
                    >
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <ChampLink name={c} size={18} />
                        <HubLink
                          to={{ kind: "finder", query: `patch=${encodeURIComponent(p.p)}&champ=${encodeURIComponent(c)}` }}
                          className="text-rw-text font-semibold tabular-nums shrink-0 hover:text-rw-accent hover:underline"
                          title={tl("Game finder")}
                        >
                          {presPct}%
                        </HubLink>
                      </div>
                      <div className="h-1.5 rounded-full bg-rw-raised overflow-hidden flex">
                        <div className="h-full bg-rw-teal/80" style={{ width: `${pickPct}%` }} />
                        <div className="h-full bg-rw-red/65" style={{ width: `${banPct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-rw-muted tabular-nums">
                        <span>
                          <HubLink
                            to={{ kind: "finder", query: `patch=${encodeURIComponent(p.p)}&champ=${encodeURIComponent(c)}` }}
                            className="hover:text-rw-accent hover:underline"
                          >
                            {pk} {tl("Picks")}
                          </HubLink>{" "}
                          ·{" "}
                          <HubLink
                            to={{ kind: "finder", query: `patch=${encodeURIComponent(p.p)}&ban=${encodeURIComponent(c)}` }}
                            className="hover:text-rw-accent hover:underline"
                          >
                            {b} {tl("Bans")}
                          </HubLink>
                        </span>
                        {wrPct != null && (
                          <HubLink
                            to={{ kind: "finder", query: `patch=${encodeURIComponent(p.p)}&champ=${encodeURIComponent(c)}` }}
                            className={`hover:underline ${pk >= 5 ? (wrPct >= 52 ? "text-rw-teal font-semibold" : wrPct <= 48 ? "text-rw-red" : "text-rw-sub") : "hover:text-rw-accent"}`}
                            title={tl("Game finder")}
                          >
                            {wrPct}%
                          </HubLink>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {p.prev && ((p.up?.length || 0) > 0 || (p.down?.length || 0) > 0) && (
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 mt-2 pt-2 border-t border-rw-border">
                  <Movers title={tl("Rising since {patch}", { patch: p.prev })} list={p.up || []} patch={p.p} up />
                  <Movers title={tl("Falling since {patch}", { patch: p.prev })} list={p.down || []} patch={p.p} />
                </div>
              )}
            </div>
          ))}
          </div>
          {filtered.length > n && (
            <button
              type="button"
              onClick={() => setN((x) => x + 48)}
              className="text-xs text-rw-accent hover:underline"
            >
              {tl("Show more ({n} left)", { n: filtered.length - n })}
            </button>
          )}
        </div>
        );
      }}
    </Page>
  );
};

/** Patch movers: presence before -> now, and the win rate now (5+ picks). */
const Movers: React.FC<{ title: string; list: PatchMove[]; patch: string; up?: boolean }> = ({ title, list, patch, up }) =>
  list.length ? (
    <div className="min-w-0">
      <div className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${up ? "text-rw-teal" : "text-rw-red"}`}>{title}</div>
      <ul className="text-xs space-y-1">
        {list.map(([c, now, was, w, pk]) => {
          const nowPct = Math.round(now * 100);
          const wrPct = pk ? Math.round((w / pk) * 100) : 0;
          return (
            <li key={c} className="space-y-0.5 min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <ChampLink name={c} size={18} />
                <HubLink
                  to={{ kind: "finder", query: `patch=${encodeURIComponent(patch)}&champ=${encodeURIComponent(c)}` }}
                  className="tabular-nums shrink-0 text-rw-sub hover:underline"
                  title={tl("Presence: picked or banned in this share of games")}
                >
                  {Math.round(was * 100)}% → <span className={`font-semibold ${up ? "text-rw-teal" : "text-rw-red"}`}>{nowPct}%</span>
                  {pk >= 5 && (
                    <span className={wrPct >= 53 ? "text-rw-teal font-medium" : wrPct <= 47 ? "text-rw-red" : "text-rw-muted"}>
                      {" "}
                      · {tl("{pct} won", { pct: `${wrPct}%` })}
                    </span>
                  )}
                </HubLink>
              </div>
              <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${up ? "bg-rw-teal/75" : "bg-rw-red/70"}`}
                  style={{ width: `${Math.max(6, Math.min(100, nowPct))}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  ) : (
    <div />
  );

/** NA LCS (2013–2018) → LCS (2019–2024) → LTA North (2025) → LCS (2026–): each step links to its league. */
const HistoryChain: React.FC<{ steps: LeagueStep[]; current: string; small?: boolean }> = ({ steps, current, small }) => (
  <div className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 ${small ? "text-[10px] mt-0.5" : "text-xs"} text-rw-muted`}>
    {steps.map((st, i) => (
      <React.Fragment key={`${st.l}-${i}`}>
        {i > 0 && <span aria-hidden="true">→</span>}
        <span className="whitespace-nowrap">
          {st.u && st.u !== current ? (
            <HubLink to={{ kind: "league", slug: st.u }} className="hover:text-rw-accent hover:underline">
              {st.s || st.l}
              {st.y && <span className="text-rw-muted"> ({st.y})</span>}
            </HubLink>
          ) : (
            <>
              <span className={st.u === current ? "text-rw-text font-semibold" : ""}>{st.s || st.l}</span>
              {st.y && <span> ({st.y})</span>}
            </>
          )}
        </span>
      </React.Fragment>
    ))}
  </div>
);

// ── Leagues ───────────────────────────────────────────────────────────────

type LeagueScope = "current" | "past" | "all";

/**
 * Every league. "Current" (leagues with games this year) comes first, split into international events, main
 * leagues and the rest; "Past main leagues" are the big ones that stopped (NA LCS, EU LCS, LMS...).
 */
export const LeaguesPanel: React.FC = () => {
  usePageTitle(tl("Leagues"));
  const state = useLoad(loadLeagues, []);
  const [scope, setScope] = useState<LeagueScope>("current");
  const [q, setQ] = useState("");
  const labels: Record<LeagueScope, string> = {
    current: tl("Current"),
    past: tl("Past main leagues"),
    all: tl("Everything"),
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-lg border border-rw-border overflow-hidden">
          {(["current", "past", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-2.5 py-1.5 ${scope === s ? "bg-rw-accent text-rw-bg font-bold" : "text-rw-sub hover:text-rw-text"}`}
            >
              {labels[s]}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tl("Filter by name or region…")}
          aria-label={tl("Filter by name or region…")}
          className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1.5 text-rw-text placeholder-rw-muted flex-1 min-w-[10rem]"
        />
      </div>
      <Page state={state}>{(rows: LeagueRow[]) => <LeagueLists rows={rows} scope={scope} q={q} onSetQ={setQ} />}</Page>
    </div>
  );
};

const LeagueLists: React.FC<{ rows: LeagueRow[]; scope: LeagueScope; q: string; onSetQ?: (q: string) => void }> = ({ rows, scope, q, onSetQ }) => {
  const groups = useMemo(() => {
    const terms = q
      .toLowerCase()
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    const match = (l: LeagueRow) => {
      if (!terms.length) return true;
      const hay = `${l.s || ""} ${l.l} ${l.r || ""}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    };
    const newest = rows.reduce((m, l) => (l.to && l.to > m ? l.to : m), "");
    const isCurrent = (l: LeagueRow) => !!l.to && l.to >= newest;
    const intl = (l: LeagueRow) => (l.r || "").toLowerCase() === "international";
    const list = rows.filter(match);
    if (scope === "all") return [{ key: "all", title: "", rows: list }];
    if (scope === "past") return [{ key: "past", title: "", rows: list.filter((l) => l.pr && !isCurrent(l)) }];
    const now = list.filter(isCurrent);
    return [
      // the big internationals (Worlds, MSI, First Stand...); show events and invitationals go with the others
      { key: "intl", title: tl("International events"), rows: now.filter((l) => intl(l) && l.pr) },
      { key: "main", title: tl("Main leagues"), rows: now.filter((l) => l.pr && !intl(l)) },
      { key: "other", title: tl("Other leagues this year"), rows: now.filter((l) => !l.pr), limit: 40 },
    ].filter((g) => g.rows.length);
  }, [rows, scope, q]);
  if (!groups.length) return <p className="text-xs text-rw-sub py-4 text-center">{tl("No leagues match.")}</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <LeagueTable key={g.key} title={g.title} rows={g.rows} limit={g.limit} q={q} onSetQ={onSetQ} />
      ))}
    </div>
  );
};

const LeagueTable: React.FC<{ title?: string; rows: LeagueRow[]; limit?: number; q?: string; onSetQ?: (q: string) => void }> = ({ title, rows, limit, q = "", onSetQ }) => {
  const [n, setN] = useState(limit || 0);
  const list = n ? rows.slice(0, n) : rows;
  const maxG = Math.max(1, ...list.map((l) => l.g || 0));
  const maxN = Math.max(1, ...list.map((l) => l.n || 0));
  return (
    <div className={`${card} overflow-x-auto space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        {title ? <h3 className="text-xs font-semibold uppercase tracking-wider text-rw-text">{title}</h3> : <span />}
        {list.length > 0 && (
          <SectionCard
            section={title || tl("Leagues")}
            name={tl("Leagues")}
            rows={() =>
              list.slice(0, 12).map((l, idx) => ({
                rank: idx + 1,
                label: l.s ? `${l.s} · ${l.l}` : l.l,
                sub: [l.r ? regionName(l.r, l.r) : "", l.from && l.to ? (l.from === l.to ? l.from : `${l.from}–${l.to}`) : ""].filter(Boolean).join(" · "),
                value: `${fmtNum(l.g)} ${tl("Games")}`,
                win: true,
              }))
            }
          />
        )}
      </div>
      <STable className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("League")}</th>
            <th className={th}>{tl("Region")}</th>
            <th className={th}>{tl("Years")}</th>
            <th className={th}>{tl("Tournaments")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((l) => {
            const gPct = Math.max(6, Math.round(((l.g || 0) / maxG) * 100));
            const nPct = Math.max(6, Math.round(((l.n || 0) / maxN) * 100));
            return (
              <tr key={l.u} className="border-t border-rw-border">
                <td className={`${td} max-w-[22rem]`} data-sort={l.s || l.l}>
                  <HubLink to={{ kind: "league", slug: l.u }} className="flex items-baseline gap-2 min-w-0 hover:underline">
                    {l.s && <span className="shrink-0 font-bold text-rw-accent">{l.s}</span>}
                    <span className="truncate">{l.l}</span>
                  </HubLink>
                  {l.h && l.h.length > 1 && <HistoryChain steps={l.h} current={l.u} small />}
                </td>
                <td className={`${td} text-rw-sub`} data-sort={l.r ? regionName(l.r, l.r) : ""}>
                  {l.r ? (
                    onSetQ ? (
                      <button
                        type="button"
                        onClick={() => onSetQ(q.trim().toLowerCase() === l.r!.toLowerCase() ? "" : l.r!)}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {regionName(l.r, l.r)}
                      </button>
                    ) : (
                      regionName(l.r, l.r)
                    )
                  ) : (
                    ""
                  )}
                </td>
                <td className={`${td} text-rw-muted`} data-sort={l.from || ""}>
                  {l.from && l.to ? (
                    <HubLink to={{ kind: "league", slug: l.u }} className="hover:text-rw-accent hover:underline">
                      {l.from === l.to ? l.from : `${l.from}–${l.to}`}
                    </HubLink>
                  ) : (
                    ""
                  )}
                </td>
                <td className={`${td} text-rw-sub tabular-nums`} data-sort={l.n}>
                  <span className="inline-flex items-center gap-1.5">
                    <HubLink to={{ kind: "league", slug: l.u }} className="hover:text-rw-accent hover:underline">
                      {l.n}
                    </HubLink>
                    <span className="hidden sm:inline-block w-8 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                      <span className="block h-full rounded-full bg-rw-teal/65" style={{ width: `${nPct}%` }} />
                    </span>
                  </span>
                </td>
                <td className={`${td} text-rw-muted tabular-nums`} data-sort={l.g}>
                  <span className="inline-flex items-center gap-1.5">
                    {l.g > 0 ? (
                      <HubLink to={{ kind: "finder", query: `league=${encodeURIComponent(l.u)}` }} className="hover:text-rw-accent hover:underline">
                        {fmtNum(l.g)}
                      </HubLink>
                    ) : (
                      <span>{fmtNum(l.g)}</span>
                    )}
                    <span className="hidden sm:inline-block w-10 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                      <span className="block h-full rounded-full bg-rw-accent/65" style={{ width: `${gPct}%` }} />
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </STable>
      {n > 0 && rows.length > n && (
        <button type="button" onClick={() => setN(0)} className="text-xs text-rw-accent hover:underline">
          {tl("Show more ({n} left)", { n: rows.length - n })}
        </button>
      )}
    </div>
  );
};

export const LeaguePage: React.FC<{ slug: string; year?: string }> = ({ slug, year }) => {
  const state = useLoad(
    () =>
      loadLeague(slug).then((l) => {
        const now = currentHubRoute();
        if (l.u && l.u !== slug && now.kind === "league" && now.slug === slug)
          navigateHub({ kind: "league", slug: l.u, ...(now.year ? { year: now.year } : {}) }, { replace: true });
        return l;
      }),
    [slug],
  );
  usePageTitle(state.data ? (year ? `${state.data.l} ${year}` : state.data.l) : undefined, state.data?.l);
  return <Page state={state}>{(l) => <LeagueView l={l} year={year} />}</Page>;
};

const LeagueView: React.FC<{ l: HubLeague; year?: string }> = ({ l, year }) => {
  const years = [...new Set(l.events.map((e) => e.y))];
  const totalGames = useMemo(() => l.events.reduce((s, e) => s + (e.g || 0), 0), [l.events]);
  const maxTitles = useMemo(() => Math.max(1, ...l.titles.map((t) => t.n)), [l.titles]);
  // /league/<slug>/<year>: one season's tournaments (a year the league didn't play shows them all)
  const season = year && years.includes(year) ? year : undefined;
  const events = season ? l.events.filter((e) => e.y === season) : l.events;
  const pick = (y?: string) => navigateHub({ kind: "league", slug: l.u, year: y }, { replace: true });
  return (
    <div className="space-y-3">
      <EntityHero
        title={
          <>
            {l.s && <span className="text-rw-accent mr-3">{l.s}</span>}
            {l.l}
          </>
        }
        lines={
          <p className="flex flex-wrap items-center gap-x-2">
            {l.region && (
              <>
                <HubLink to={{ kind: "leagues" }} className="hover:text-rw-accent hover:underline">
                  {regionName(l.region, l.region)}
                </HubLink>
                <span aria-hidden="true">·</span>
              </>
            )}
            <HubLink
              to={{ kind: "tournaments", ...(season || years[0] ? { year: season || years[0] } : {}) }}
              className="hover:text-rw-accent hover:underline"
            >
              {tn("{n} tournament", "{n} tournaments", l.events.length)}
            </HubLink>
            {(years.length > 1 || years[0]) && (
              <>
                <span aria-hidden="true">·</span>
                <HubLink
                  to={{ kind: "league", slug: l.u, ...(years[0] ? { year: years[0] } : {}) }}
                  className="hover:text-rw-accent hover:underline"
                >
                  {years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : years[0]}
                </HubLink>
              </>
            )}
          </p>
        }
        extra={
          l.history && l.history.length > 1 ? (
            <div className="space-y-0.5">
              <div className="font-head text-[12px] font-bold uppercase tracking-[0.12em] text-rw-muted">{tl("History")}</div>
              <HistoryChain steps={l.history} current={l.u} />
            </div>
          ) : undefined
        }
        aside={
          <>
            {totalGames >= 20 && (
              <HubLink to={{ kind: "best", query: `league=${l.u}` }} className={heroBtn(true)}>
                {tl("Best games in this league")}
              </HubLink>
            )}
            {(!l.seasons || l.seasons.length > 0) && totalGames > 0 && (
              <HubLink
                to={{
                  kind: "leaders",
                  query: `league=${l.u}${season && (!l.seasons || l.seasons.includes(season)) ? `&year=${season}` : ""}`,
                }}
                className={heroBtn()}
              >
                {tl("Full leaderboard")}
              </HubLink>
            )}
            {totalGames > 0 && (
              <HubLink to={{ kind: "champions", query: `league=${l.u}${season ? `&year=${season}` : ""}` }} className={heroBtn()}>
                {tl("Champion picks")}
              </HubLink>
            )}
            {totalGames > 0 && (
              <HubLink to={{ kind: "finder", query: `league=${l.u}${season ? `&year=${season}` : ""}` }} className={heroBtn()}>
                {tl("Game finder")}
              </HubLink>
            )}
            <CopyLeaguePost l={l} season={season} />
            {/* a league still playing: its own calendar and results feed (Riot names its leagues by the short name) */}
            {l.primary && l.s && years[0] && Number(years[0]) >= new Date().getFullYear() - 1 && <FollowFeeds leagues={[l.s]} />}
          </>
        }
        stats={[
          { label: tl("Tournaments"), value: fmtNum(l.events.length), to: { kind: "tournaments", ...(season || years[0] ? { year: season || years[0] } : {}) } },
          totalGames > 0
            ? {
                label: tl("Games"),
                value: fmtNum(totalGames),
                to: { kind: "finder", query: `league=${encodeURIComponent(l.u)}${season ? `&year=${encodeURIComponent(season)}` : ""}` },
              }
            : null,
          years.length > 0
            ? {
                label: tl("Years"),
                value: years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : years[0],
                to: { kind: "league", slug: l.u, year: years[0] },
              }
            : null,
          l.titles.length > 0
            ? {
                label: tl("Most titles"),
                value: `${l.titles[0].t} (${l.titles[0].n})`,
                icon: <TeamLogo name={l.titles[0].t} size={20} />,
                to: l.titles[0].u ? { kind: "team", slug: l.titles[0].u } : undefined,
              }
            : null,
        ]}
      />
      {/* the chosen season, else the newest one that has a whole-season file (l.seasons, builds since 0.7.45) */}
      {(() => {
        const y = season || years.find((x) => !l.seasons || l.seasons.includes(x));
        return y && (!l.seasons || l.seasons.includes(y)) ? <LeagueSeasonPanel league={l.u} year={y} name={l.s || l.l} /> : null;
      })()}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] items-start [&>*:only-child]:col-span-full">
        {l.titles.length > 0 && (
          <Section
            title={tl("Most titles")}
            right={
              <span className="flex items-center gap-2 text-[11px]" data-nocapture="1">
                {l.titles.length >= 2 && (
                  <>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a: l.titles[0].u || prettySlug(l.titles[0].t),
                        b: l.titles[1].u || prettySlug(l.titles[1].t),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "prep",
                        a: l.titles[0].u || prettySlug(l.titles[0].t),
                        b: l.titles[1].u || prettySlug(l.titles[1].t),
                      }}
                      className="text-rw-accent hover:underline font-semibold"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                  </>
                )}
                <SectionCard
                  section={tl("Most titles")}
                  sub={l.l}
                  name={`${l.u}-most-titles`}
                  rows={() =>
                    l.titles.slice(0, 10).map((t, idx) => ({
                      rank: idx + 1,
                      team: t.t,
                      label: t.t,
                      value: String(t.n),
                      win: true,
                    }))
                  }
                />
              </span>
            }
          >
            <ul className="text-xs space-y-1.5">
              {l.titles.map((t) => (
                <li key={t.t} className="space-y-0.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                      <HubLink to={{ kind: "team", slug: t.u || prettySlug(t.t) }} title={t.t} className="shrink-0">
                        <TeamLogo name={t.t} size={16} />
                      </HubLink>
                      <TeamLink name={t.t} u={t.u} />
                    </span>
                    <HubLink
                      to={t.u ? { kind: "team", slug: t.u, tab: "history" } : { kind: "titles" }}
                      className="text-rw-accent font-bold tabular-nums shrink-0 hover:underline"
                    >
                      {t.n}
                    </HubLink>
                  </div>
                  <div className="h-1.5 rounded-full bg-rw-raised overflow-hidden">
                    <div className="h-full rounded-full bg-rw-accent/75" style={{ width: `${Math.max(6, Math.round((t.n / maxTitles) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-rw-muted">
              {tl(
                "Finals won (playoffs, championships and cups). Teams that changed names count as one.",
              )}
            </p>
          </Section>
        )}
        <LeagueEventsSection l={l} season={season} years={years} events={events} pick={pick} />
      </div>
    </div>
  );
};

const CopyLeaguePost: React.FC<{ l: HubLeague; season?: string }> = ({ l, season }) => {
  const [state, setState] = useState<"" | "copied" | "failed">("");
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(""), 2200);
    return () => clearTimeout(t);
  }, [state]);
  const text = () => {
    const years = [...new Set(l.events.map((e) => e.y))];
    const span = years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : years[0] || "";
    const lines = [
      `${l.s ? `${l.s} — ` : ""}${l.l}${season ? ` (${season})` : span ? ` (${span})` : ""} · ${tn("{n} tournament", "{n} tournaments", l.events.length)}`,
    ];
    if (l.titles.length > 0) {
      lines.push(
        `${tl("Most titles")}: ${l.titles
          .slice(0, 4)
          .map((t) => `${t.t} (${t.n})`)
          .join(" · ")}`,
      );
    }
    lines.push(hubShareUrl({ kind: "league", slug: l.u, ...(season ? { year: season } : {}) }));
    return lines.join("\n");
  };
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text()).then(() => setState("copied"), () => setState("failed"))}
      className={heroBtn()}
      title={`${tl("Copy post")}: ${tl("Copy a ready-to-post summary with the link, for X or Discord")}`}
      aria-label={tl("Copy post")}
    >
      <ClipboardCopy className="w-3.5 h-3.5" />
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

const LeagueEventsSection: React.FC<{
  l: HubLeague;
  season?: string;
  years: string[];
  events: HubLeague["events"];
  pick: (y?: string) => void;
}> = ({ l, season, years, events, pick }) => {
  const isHidden = useHiddenCheck();
  const [evSearch, setEvSearch] = useState("");
  const shownEvents = useMemo(() => {
    const terms = evSearch
      .toLowerCase()
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!terms.length) return events;
    return events.filter((e) => {
      const hay = `${e.n} ${e.w || ""} ${e.y || ""}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    });
  }, [events, evSearch]);
  return (
    <Section
      title={season ? tl("{year} season", { year: season }) : tl("Every tournament")}
      right={
        events.length > 0 ? (
          <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
            {events.length > 10 && (
              <input
                value={evSearch}
                onChange={(e) => setEvSearch(e.target.value)}
                placeholder={tl("Filter by name or team…")}
                aria-label={tl("Filter by name or team…")}
                className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted w-40"
              />
            )}
            <SectionCard
              section={season ? tl("{year} season", { year: season }) : tl("Every tournament")}
              name={l.s || l.l}
              sub={l.l}
              rows={() =>
                shownEvents.slice(0, 12).map((e, idx) => {
                  const hide = isHidden(`event:${e.u}`, e.en);
                  return {
                    rank: idx + 1,
                    team: e.w && !hide ? e.w : undefined,
                    label: e.n,
                    sub: [fmtDate(e.st, false), e.en && e.en !== e.st ? fmtDate(e.en, false) : ""].filter(Boolean).join(" – "),
                    value: e.w && !hide ? e.w : fmtDate(e.st, false),
                    win: Boolean(e.w && !hide),
                  };
                })
              }
            />
          </span>
        ) : undefined
      }
    >
      {years.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label={tl("Season")}>
          {[undefined, ...years].map((y) => (
            <button
              key={y || "all"}
              type="button"
              onClick={() => pick(y)}
              aria-pressed={season === y}
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                season === y ? "bg-rw-accent text-rw-bg border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
              }`}
            >
              {y || tl("All seasons")}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <STable className="w-full text-xs">
          <thead>
            <tr>
              <th className={th}>{tl("Tournament")}</th>
              <th className={`${th} hidden sm:table-cell`}>{tl("Dates")}</th>
              <th className={th}>{tl("Winner")}</th>
            </tr>
          </thead>
          <tbody>
            {shownEvents.map((e) => (
              <LeagueEventRow key={e.u} e={e} />
            ))}
          </tbody>
        </STable>
      </div>
    </Section>
  );
};

const LeagueEventRow: React.FC<{ e: HubLeague["events"][number] }> = ({
  e,
}) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <tr className="border-t border-rw-border">
      <td className={`${td} max-w-[12rem] sm:max-w-[16rem] truncate`} data-sort={e.n}>
        <EventLink name={e.n} u={e.u} />
      </td>
      <td
        className={`${td} text-rw-muted hidden sm:table-cell whitespace-nowrap`}
        data-sort={e.st}
      >
        <EventLink
          name={`${fmtDate(e.st, false)}${e.en && e.en !== e.st ? ` – ${fmtDate(e.en)}` : ""}`}
          u={e.u}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        />
      </td>
      <td className={`${td} max-w-[18rem] truncate`} data-sort={hidden ? "" : e.w || ""}>
        {e.w ? (
          hidden ? (
            <RevealButton onReveal={reveal} small />
          ) : (
            <span className="flex items-center gap-1.5">
              {!e.rs && <Crown className="w-3 h-3 text-rw-accent shrink-0" />}
              <HubLink to={{ kind: "team", slug: e.wu || prettySlug(e.w) }} title={e.w} className="shrink-0">
                <TeamLogo name={e.w} size={15} />
              </HubLink>
              <TeamLink name={e.w} u={e.wu} />
              {e.rs ? <StandingsFirst /> : null}
            </span>
          )
        ) : (
          ""
        )}
      </td>
    </tr>
  );
};
