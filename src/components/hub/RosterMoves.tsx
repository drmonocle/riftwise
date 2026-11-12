/**
 * Roster moves: players who began playing for a new club in the last five months, newest first, from the stats
 * build (hub/moves.json: a player's newest club stint started recently and the one before was another club). Top
 * leagues by default; every league one click away. The build only sees a move once the player has played for the
 * new club, so announced transfers show up with their first game.
 */
import React, { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { tl, roleName } from "../../i18n";
import { bare, loadLeagues, loadMoves, normText, resolveLeagueSlug, resolvePlayerSlug, resolveTeamAlias } from "../../hub/data";
import { normalizeRole } from "../../hub/champAgg";
import { searchAlias } from "../../searchAliases";
import { fmtDate, HubLink, hubShareUrl, PlayerLink, PlayerPhoto, TeamLink, TeamLogo, useLoad } from "./ui";
import { SectionCard } from "./BroadcastCard";

export const RosterMoves: React.FC = () => {
  const moves = useLoad(loadMoves, []);
  const leagues = useLoad(loadLeagues, []);
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState("");
  const top = useMemo(() => new Set((leagues.data || []).filter((l) => l.pr).map((l) => l.u)), [leagues.data]);
  const name = useMemo(() => new Map((leagues.data || []).map((l) => [l.u, l.s || l.l])), [leagues.data]);
  const [shown, setShown] = useState(25);
  if (!moves.data || !moves.data.list.length) return null;
  const terms = search
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((s) => normText(searchAlias(s.trim())))
    .filter(Boolean);
  const list = moves.data.list.filter((m) => {
    if (!all && !terms.length && !(m.lu && top.has(m.lu))) return false;
    if (terms.length) {
      const hay = normText(`${m.n} ${m.u} ${m.r || ""} ${m.r ? roleName(m.r) : ""} ${m.from.n} ${m.from.u} ${m.to.n} ${m.to.u} ${m.lu ? name.get(m.lu) || m.lu : ""}`);
      const hayBare = bare(hay);
      const fromCanon = resolveTeamAlias(m.from.u || m.from.n);
      const toCanon = resolveTeamAlias(m.to.u || m.to.n);
      const lgCanon = m.lu ? resolveLeagueSlug(m.lu) : "";
      const roleCanon = m.r ? normalizeRole(m.r) : null;
      if (
        !terms.some((t) => {
          if (hay.includes(t) || (t.length >= 2 && hayBare.includes(bare(t)))) return true;
          if (resolvePlayerSlug(t) === m.u) return true;
          const canonTeam = resolveTeamAlias(t);
          if (canonTeam && (canonTeam === fromCanon || canonTeam === toCanon)) return true;
          const canonLg = resolveLeagueSlug(t);
          if (lgCanon && canonLg && canonLg === lgCanon) return true;
          const canonRole = normalizeRole(t);
          if (roleCanon && canonRole && canonRole === roleCanon) return true;
          return false;
        })
      )
        return false;
    }
    return true;
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-rw-border">
        <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
          {tl("Roster moves")}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-[11px]" role="group" aria-label={tl("Leagues")}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text w-40"
          />
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setAll(v)}
              aria-pressed={all === v}
              className={`px-2 py-0.5 rounded-full border ${all === v ? "border-rw-accent text-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
            >
              {v ? tl("All leagues") : tl("Top leagues")}
            </button>
          ))}
          {list.length > 0 && (() => {
            const yr0 = list[0]?.d && /^\d{4}/.test(list[0].d) ? list[0].d.slice(0, 4) : "";
            const lg0 = list[0]?.lu ? resolveLeagueSlug(list[0].lu) : "";
            const role0 = list[0]?.r ? normalizeRole(list[0].r) || list[0].r : "";
            const p0Slug = list[0] ? resolvePlayerSlug(list[0].u || list[0].n) || list[0].u : "";
            const p1Slug = list[1] ? resolvePlayerSlug(list[1].u || list[1].n) || list[1].u : "";
            const to0Slug = list[0] ? resolveTeamAlias(list[0].to.u || list[0].to.n) || list[0].to.u : "";
            const from0Slug = list[0] ? resolveTeamAlias(list[0].from.u || list[0].from.n) || list[0].from.u : "";
            const to1Slug = list[1] ? resolveTeamAlias(list[1].to.u || list[1].to.n) || list[1].to.u : "";
            const twoPlayers = Boolean(p0Slug && p1Slug && p0Slug !== p1Slug);
            return (
            <>
              <HubLink
                to={{
                  kind: "players",
                  ...((role0 || p0Slug)
                    ? {
                        query: new URLSearchParams({
                          ...(role0 ? { role: role0 } : {}),
                          ...(p0Slug
                            ? { q: twoPlayers ? `${p0Slug},${p1Slug}` : p0Slug }
                            : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Players")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  ...((lg0 || yr0 || role0 || p0Slug)
                    ? {
                        query: new URLSearchParams({
                          ...(lg0 ? { league: lg0 } : {}),
                          ...(yr0 ? { year: yr0 } : {}),
                          ...(role0 ? { role: role0 } : {}),
                          ...(p0Slug
                            ? { q: [p0Slug, twoPlayers ? p1Slug : "", to0Slug, from0Slug].filter(Boolean).join(",") }
                            : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "rankings",
                  ...((lg0 || to0Slug)
                    ? {
                        query: new URLSearchParams({
                          ...(lg0 ? { league: lg0 } : {}),
                          ...(to0Slug ? { q: [to0Slug, from0Slug && from0Slug !== to0Slug ? from0Slug : "", p0Slug, twoPlayers ? p1Slug : ""].filter(Boolean).join(",") } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Power rankings")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  ...((lg0 || yr0 || role0)
                    ? {
                        query: new URLSearchParams({
                          ...(lg0 ? { scope: lg0, league: lg0 } : {}),
                          ...(yr0 ? { key: `y${yr0}`, year: yr0 } : {}),
                          ...(role0 ? { role: role0 } : {}),
                        }).toString(),
                      }
                    : {}),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "teams",
                  ...(to0Slug
                    ? { query: `q=${encodeURIComponent([to0Slug, from0Slug && from0Slug !== to0Slug ? from0Slug : "", p0Slug, twoPlayers ? p1Slug : ""].filter(Boolean).join(","))}` }
                    : {}),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Teams")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  ...(p0Slug
                    ? {
                        query: new URLSearchParams({
                          player: p0Slug,
                          ...(twoPlayers
                            ? {
                                vsplayer: p1Slug,
                                ...(to0Slug ? { team: to0Slug } : {}),
                                ...(to1Slug && to1Slug !== to0Slug ? { vs: to1Slug } : from0Slug && from0Slug !== to0Slug ? { vs: from0Slug } : {}),
                              }
                            : {
                                ...(to0Slug ? { team: to0Slug } : {}),
                                ...(from0Slug && from0Slug !== to0Slug ? { vs: from0Slug } : {}),
                              }),
                          ...(role0 ? { role: role0 } : {}),
                          ...(yr0 ? { year: yr0 } : {}),
                          ...(lg0 ? { league: lg0 } : {}),
                        }).toString(),
                      }
                    : yr0
                      ? { query: `year=${encodeURIComponent(yr0)}` }
                      : {}),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  ...(p0Slug
                    ? {
                        query: new URLSearchParams({
                          player: p0Slug,
                          ...(twoPlayers ? { vsplayer: p1Slug } : {}),
                          ...(to0Slug ? { team: to0Slug } : {}),
                          ...(twoPlayers && to1Slug && to1Slug !== to0Slug
                            ? { vs: to1Slug }
                            : from0Slug && from0Slug !== to0Slug
                              ? { vs: from0Slug }
                              : {}),
                          ...(lg0 ? { league: lg0 } : {}),
                          ...(yr0 ? { year: yr0 } : {}),
                          ...(role0 ? { role: role0 } : {}),
                        }).toString(),
                      }
                    : yr0
                      ? { query: `year=${encodeURIComponent(yr0)}` }
                      : {}),
                }}
                className="text-rw-sub hover:text-rw-accent hover:underline"
              >
                {tl("Item history")} →
              </HubLink>
              {to0Slug && (
                <>
                  <HubLink
                    to={{ kind: "prep", a: to0Slug, ...(from0Slug && from0Slug !== to0Slug ? { b: from0Slug } : {}), ...(yr0 ? { period: `y${yr0}` } : {}) }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        teams: [to0Slug, from0Slug && from0Slug !== to0Slug ? from0Slug : ""].filter(Boolean).join(","),
                        ...(yr0 ? { p: `y${yr0}` } : {}),
                        ...(role0 ? { role: role0 } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                </>
              )}
              {p0Slug && (
                <HubLink
                  to={{ kind: "compare", mode: "player", a: p0Slug, ...(twoPlayers ? { b: p1Slug } : {}), ...(yr0 ? { period: `y${yr0}` } : {}) }}
                  className="text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </HubLink>
              )}
              <CopyMovesPost
                sub={all ? tl("All leagues") : tl("Top leagues")}
                rows={list.slice(0, 6).map((m) => `${m.n}${m.r ? ` (${roleName(m.r)})` : ""}: ${m.from.n} → ${m.to.n} (${fmtDate(m.d, false)})`)}
              />
              <SectionCard
                section={tl("Roster moves")}
                name={all ? tl("All leagues") : tl("Top leagues")}
                sub={fmtDate(moves.data.since)}
                rows={() =>
                  list.slice(0, 12).map((m, idx) => ({
                    rank: idx + 1,
                    team: m.to.n,
                    label: `${m.n}${m.r ? ` (${roleName(m.r)})` : ""}`,
                    sub: `${m.from.n} → ${m.to.n}${m.lu && name.get(m.lu) ? ` · ${name.get(m.lu)}` : ""}`,
                    value: fmtDate(m.d, false),
                  }))
                }
              />
            </>
            );
          })()}
        </div>
      </div>
      <p className="text-[11px] text-rw-muted">
        {tl("Players who started playing for a new club since {date}, newest first. A move shows once the player has played for the new club.", {
          date: fmtDate(moves.data.since),
        })}
      </p>
      {/* two columns, newest first down each, when the list is wide (one line a move left most of the row empty) */}
      <div className="@container">
      <ul className="text-xs @min-[64rem]:columns-2 gap-x-10">
        {list.slice(0, shown).map((m, idx) => {
          const myr = m.d && /^\d{4}/.test(m.d) ? m.d.slice(0, 4) : "";
          const pQ = myr ? `p=y${encodeURIComponent(myr)}` : undefined;
          const pSlug = resolvePlayerSlug(m.u || m.n) || m.u;
          const fromSlug = resolveTeamAlias(m.from.u || m.from.n) || m.from.u;
          const toSlug = resolveTeamAlias(m.to.u || m.to.n) || m.to.u;
          const rivalMove = list.find((x, j) => j !== idx && (resolvePlayerSlug(x.u || x.n) || x.u) !== pSlug);
          const vsPlayerSlug = rivalMove ? resolvePlayerSlug(rivalMove.u || rivalMove.n) || rivalMove.u : "";
          const mRole = m.r ? normalizeRole(m.r) || m.r : "";
          const playerQ = new URLSearchParams({
            ...(myr ? { p: `y${myr}` } : {}),
            ...(toSlug ? { team: toSlug } : {}),
            ...(fromSlug && fromSlug !== toSlug ? { q: fromSlug } : {}),
            ...(mRole ? { role: mRole } : {}),
          }).toString() || undefined;
          const fromTeamQList = [toSlug && toSlug !== fromSlug ? toSlug : "", pSlug, vsPlayerSlug].filter(Boolean).join(",");
          const toTeamQList = [fromSlug && fromSlug !== toSlug ? fromSlug : "", pSlug, vsPlayerSlug].filter(Boolean).join(",");
          const fromTeamQ = new URLSearchParams({
            ...(myr ? { p: `y${myr}` } : {}),
            ...(fromTeamQList ? { q: fromTeamQList } : {}),
          }).toString() || undefined;
          const toTeamQ = new URLSearchParams({
            ...(myr ? { p: `y${myr}` } : {}),
            ...(toTeamQList ? { q: toTeamQList } : {}),
          }).toString() || undefined;
          return (
          <li key={`${m.u}-${m.d}`} className="py-1.5 border-b border-rw-border break-inside-avoid flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <HubLink
              to={{
                kind: "finder",
                query: new URLSearchParams({
                  player: pSlug,
                  ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
                  team: toSlug,
                  ...(fromSlug && fromSlug !== toSlug ? { vs: fromSlug } : {}),
                  ...(mRole ? { role: mRole } : {}),
                  ...(myr ? { year: myr } : {}),
                  ...(m.lu ? { league: resolveLeagueSlug(m.lu) } : {}),
                }).toString(),
              }}
              className="text-rw-muted hover:text-rw-accent hover:underline tabular-nums w-20 shrink-0"
              title={tl("Game finder")}
            >
              {fmtDate(m.d, false)}
            </HubLink>
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <PlayerPhoto name={m.n} team={m.to.n} slug={pSlug} size={18} />
              <PlayerLink name={m.n} u={pSlug} query={playerQ} className="font-semibold text-rw-text hover:text-rw-accent" />
              {m.r && (
                <HubLink
                  to={{ kind: "player", slug: pSlug, tab: "stats", ...(playerQ ? { query: playerQ } : {}) }}
                  className="text-rw-muted hover:text-rw-accent hover:underline"
                >
                  · {roleName(m.r)}
                </HubLink>
              )}
            </span>
            <span className="flex items-center gap-1.5 min-w-0 text-rw-sub">
              <span className="inline-flex items-center gap-1 min-w-0">
                <HubLink to={{ kind: "team", slug: fromSlug, ...(fromTeamQ ? { query: fromTeamQ } : {}) }} className="shrink-0">
                  <TeamLogo name={m.from.n} sizeClass="w-3.5 h-3.5" />
                </HubLink>
                <TeamLink name={m.from.n} u={fromSlug} query={fromTeamQ} className="hover:text-rw-accent truncate" />
              </span>
              <HubLink
                to={{ kind: "compare", mode: "team", a: fromSlug, b: toSlug, ...(myr ? { period: `y${myr}` } : {}) }}
                className="text-rw-accent hover:opacity-80 shrink-0"
                title={tl("Compare")}
              >
                <ArrowRight className="w-3 h-3" />
              </HubLink>
              <span className="inline-flex items-center gap-1 min-w-0">
                <HubLink to={{ kind: "team", slug: toSlug, ...(toTeamQ ? { query: toTeamQ } : {}) }} className="shrink-0">
                  <TeamLogo name={m.to.n} sizeClass="w-3.5 h-3.5" />
                </HubLink>
                <TeamLink name={m.to.n} u={toSlug} query={toTeamQ} className="text-rw-text hover:text-rw-accent truncate" />
              </span>
            </span>
            {m.lu && name.get(m.lu) && (
              <HubLink
                to={{
                  kind: "league",
                  slug: resolveLeagueSlug(m.lu),
                  ...(myr ? { year: myr } : {}),
                  query: `q=${encodeURIComponent([toSlug, fromSlug, pSlug].filter((s, i, a): s is string => Boolean(s) && a.indexOf(s) === i).join(","))}`,
                }}
                className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
              >
                {name.get(m.lu)}
              </HubLink>
            )}
            <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-[10px]">
              <HubLink
                to={{ kind: "prep", a: toSlug, b: fromSlug, ...(myr ? { period: `y${myr}` } : {}) }}
                className="text-rw-muted hover:text-rw-accent hover:underline"
              >
                {tl("Match prep")}
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(toSlug)},${encodeURIComponent(fromSlug)}${pQ ? `&${pQ}` : ""}${mRole ? `&role=${encodeURIComponent(mRole)}` : ""}`,
                }}
                className="text-rw-muted hover:text-rw-accent hover:underline"
              >
                {tl("Draft board")}
              </HubLink>
              <HubLink
                to={{
                  kind: "items",
                  query: new URLSearchParams({
                    player: pSlug,
                    ...(vsPlayerSlug ? { vsplayer: vsPlayerSlug } : {}),
                    team: toSlug,
                    ...(fromSlug && fromSlug !== toSlug ? { vs: fromSlug } : {}),
                    ...(m.lu ? { league: resolveLeagueSlug(m.lu) } : {}),
                    ...(myr ? { year: myr } : {}),
                    ...(mRole ? { role: mRole } : {}),
                  }).toString(),
                }}
                className="text-rw-muted hover:text-rw-accent hover:underline"
              >
                {tl("Item history")}
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    ...(m.lu ? { league: resolveLeagueSlug(m.lu) } : {}),
                    ...(myr ? { year: myr } : {}),
                    ...(mRole ? { role: mRole } : {}),
                    q: [pSlug, vsPlayerSlug, toSlug, fromSlug].filter((s, i, a): s is string => Boolean(s) && a.indexOf(s) === i).join(","),
                  }).toString(),
                }}
                className="text-rw-muted hover:text-rw-accent hover:underline"
              >
                {tl("Leaderboards")}
              </HubLink>
            </span>
          </li>
          );
        })}
        {!list.length && <li className="py-2 text-rw-muted">{tl("No moves in the top leagues yet. See every league.")}</li>}
      </ul>
      </div>
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 50)} className="text-[11px] text-rw-accent hover:underline">
          {tl("Show {n} more", { n: Math.min(50, list.length - shown) })}
        </button>
      )}
    </div>
  );
};

const CopyMovesPost: React.FC<{ sub: string; rows: string[] }> = ({ sub, rows }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [`${tl("Roster moves")} · ${sub}`];
    for (const r of rows) {
      lines.push(`• ${r}`);
    }
    lines.push(hubShareUrl({ kind: "home" }));
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
