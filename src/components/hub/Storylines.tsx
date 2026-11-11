/**
 * Storylines: milestones within reach, streaks, unbeaten runs (worked out by each stats build into the team / player files and
 * hub/notes.json), written out as sentences a caster can read on air. Spoiler mode hides them while they use fresh games.
 */
import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { tl, tn } from "../../i18n";
import { champName } from "../../champions";
import { load } from "../../stats";
import { bare, matchesChampSearch, normText, prettySlug, resolveChampSlug, resolveEventSlug, resolvePlayerSlug, resolveTeamAlias, searchAlias } from "../../hub/data";
import { matchesPeriodEvent } from "../../hub/period";
import { currentHubRoute, hubShareUrl } from "../../hub/route";
import { ChampIcon, HubLink, PlayerPhoto, RevealButton, Section, TeamLogo, fmtNum, useHidden, useLoad, GRID_COLS, useColumns } from "./ui";
import { SectionCard } from "./BroadcastCard";

export interface Note {
  /** ms milestone, streak (series), side (unbeaten on a side), champ (unbeaten on a champion), evunb (unbeaten at the
   *  event on now), form (wins in the last n games), comeback (wins from 2,500+ gold down at 15), crec (most pro games
   *  on a champion of any player), cms (close to a round number of games on a champion), penta (pentakills this year) */
  k: "ms" | "streak" | "side" | "champ" | "evunb" | "form" | "comeback" | "crec" | "cms" | "penta";
  /** milestone kind */
  s?: "games" | "wins" | "kills" | "assists";
  n: number;
  left?: number;
  /** streak: won (1) or lost (0); form: games won */
  w?: number;
  side?: "b" | "r";
  c?: string;
  y?: string;
  /** evunb: the event, and the games won / lost there */
  e?: string;
  gw?: number;
  gl?: number;
}
export interface Notes {
  asOf: string;
  list: Note[];
}
/** hub/notes.json: a note plus whose it is */
export interface GlobalNote extends Note {
  t: "team" | "player";
  name: string;
  u: string;
  asOf: string;
}

export function notePlainText(nt: Note): string {
  const total = fmtNum(nt.n);
  switch (nt.k) {
    case "ms":
      if (nt.s === "games") return tn("{n} game away from {total} pro games", "{n} games away from {total} pro games", nt.left || 0, { total });
      if (nt.s === "wins") return tn("{n} win away from {total} pro wins", "{n} wins away from {total} pro wins", nt.left || 0, { total });
      if (nt.s === "kills") return tn("{n} kill away from {total} career kills", "{n} kills away from {total} career kills", nt.left || 0, { total });
      return tn("{n} assist away from {total} career assists", "{n} assists away from {total} career assists", nt.left || 0, { total });
    case "streak":
      return nt.w ? tl("Won their last {n} series", { n: nt.n }) : tl("Lost their last {n} series", { n: nt.n });
    case "side":
      return nt.side === "b"
        ? tl("Unbeaten on blue side in {year}: {n}-0", { n: nt.n, year: nt.y || "" })
        : tl("Unbeaten on red side in {year}: {n}-0", { n: nt.n, year: nt.y || "" });
    case "evunb":
      return tl("Unbeaten at {event}: {n}-0 in series, {gw}-{gl} in games", { event: nt.e || "", n: nt.n, gw: nt.gw ?? 0, gl: nt.gl ?? 0 });
    case "form":
      return tl("Won {w} of their last {n} games", { w: nt.w ?? 0, n: nt.n });
    case "comeback":
      return tl("{n} wins in {year} from 2,500+ gold down at 15 minutes", { n: nt.n, year: nt.y || "" });
    case "crec":
      return tl("The most pro games on {champ} of any player: {n}", { champ: champName(nt.c || ""), n: nt.n });
    case "cms":
      return tn("{n} game away from {total} pro games on {champ}", "{n} games away from {total} pro games on {champ}", nt.left || 0, {
        total: fmtNum(nt.n),
        champ: champName(nt.c || ""),
      });
    case "penta":
      return tl("{n} pentakills in {year}", { n: nt.n, year: nt.y || "" });
    case "champ":
      return tl("Unbeaten on {champ} in {year}: {n}-0", { champ: champName(nt.c || ""), n: nt.n, year: nt.y || "" });
  }
  return "";
}

export function noteText(nt: Note, who?: { kind: "team" | "player"; slug: string }): React.ReactNode {
  const plain = notePlainText(nt);
  if ((nt.k === "champ" || nt.k === "crec" || nt.k === "cms") && nt.c) {
    const yr = nt.y ? `&year=${encodeURIComponent(nt.y)}` : "";
    const textNode = who ? (
      <HubLink
        to={{
          kind: "finder",
          query: `${who.kind}=${encodeURIComponent(who.slug)}&champ=${encodeURIComponent(resolveChampSlug(nt.c))}${yr}`,
        }}
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    ) : (
      <HubLink
        to={{ kind: "champ", slug: resolveChampSlug(nt.c), ...(nt.y ? { query: `p=y${encodeURIComponent(nt.y)}` } : {}) }}
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    );
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        <HubLink
          to={{ kind: "champ", slug: resolveChampSlug(nt.c), ...(nt.y ? { query: `p=y${encodeURIComponent(nt.y)}` } : {}) }}
          title={champName(nt.c)}
        >
          <ChampIcon name={nt.c} size={16} />
        </HubLink>
        {textNode}
      </span>
    );
  }
  if (nt.k === "side" && who?.kind === "team" && nt.side) {
    const yr = nt.y ? `&year=${encodeURIComponent(nt.y)}` : "";
    return (
      <HubLink
        to={{ kind: "finder", query: `team=${encodeURIComponent(who.slug)}&side=${nt.side}${yr}` }}
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    );
  }
  if (nt.k === "comeback" && who) {
    const yr = nt.y ? `&year=${encodeURIComponent(nt.y)}` : "";
    return (
      <HubLink
        to={{ kind: "finder", query: `${who.kind}=${encodeURIComponent(who.slug)}&result=w${yr}` }}
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    );
  }
  if (nt.k === "form" && nt.n > 0 && nt.w != null) {
    const pct = Math.round((nt.w / nt.n) * 100);
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        {who ? (
          <HubLink
            to={{ kind: "finder", query: `${who.kind}=${encodeURIComponent(who.slug)}${nt.y ? `&year=${encodeURIComponent(nt.y)}` : ""}` }}
            className="hover:text-rw-accent hover:underline"
          >
            {plain}
          </HubLink>
        ) : (
          <span>{plain}</span>
        )}
        <span className="inline-block w-8 h-1 rounded-full bg-rw-border/80 overflow-hidden shrink-0" aria-hidden="true">
          <span
            className={`block h-full rounded-full ${pct >= 65 ? "bg-rw-teal" : "bg-rw-accent"}`}
            style={{ width: `${Math.max(8, pct)}%` }}
          />
        </span>
      </span>
    );
  }
  if (nt.k === "evunb" && nt.e) {
    const evSlug = resolveEventSlug(nt.e);
    return (
      <HubLink
        to={
          evSlug
            ? {
                kind: "event",
                slug: evSlug,
                ...(who?.kind === "team" ? { query: `team=${encodeURIComponent(who.slug)}` } : {}),
              }
            : { kind: "tournaments", query: `q=${encodeURIComponent(nt.e)}` }
        }
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    );
  }
  if (nt.k === "penta") {
    return (
      <HubLink
        to={{ kind: "records", ...(nt.y ? { query: `year=${encodeURIComponent(nt.y)}` } : {}) }}
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    );
  }
  if (nt.k === "streak" && who) {
    return (
      <HubLink
        to={{ kind: who.kind, slug: who.slug, tab: "matches", ...(nt.y ? { query: `p=y${encodeURIComponent(nt.y)}` } : {}) }}
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    );
  }
  if (nt.k === "ms" && who) {
    if (nt.s === "games" || nt.s === "wins") {
      return (
        <HubLink
          to={{ kind: "finder", query: `${who.kind}=${encodeURIComponent(who.slug)}${nt.s === "wins" ? "&result=w" : ""}${nt.y ? `&year=${encodeURIComponent(nt.y)}` : ""}` }}
          className="hover:text-rw-accent hover:underline"
        >
          {plain}
        </HubLink>
      );
    }
    return (
      <HubLink
        to={{ kind: who.kind, slug: who.slug, tab: "stats", ...(nt.y ? { query: `p=y${encodeURIComponent(nt.y)}` } : {}) }}
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    );
  }
  return plain || null;
}

export interface StoryLine {
  key: string;
  who?: { name: string; team?: string; to: { kind: "team" | "player"; slug: string; query?: string } };
  text: React.ReactNode;
  plain?: string;
  champ?: string;
  team?: string;
  /** newest game the line depends on (spoiler mode) */
  asOf?: string;
}

/** The lines themselves; with spoiler mode, hidden behind Reveal while any of them uses games from the last two weeks. */
export const StoryBullets: React.FC<{ lines: StoryLine[]; spoilerKey: string; columns?: boolean }> = ({ lines, spoilerKey, columns }) => {
  const newest = lines.map((l) => l.asOf || "").sort().pop();
  const [hidden, reveal] = useHidden(spoilerKey, newest || undefined);
  if (hidden)
    return (
      <div className="py-2 text-center">
        <RevealButton onReveal={reveal} />
      </div>
    );
  return (
    <ul className={`text-xs ${columns ? `${GRID_COLS} gap-x-6 gap-y-1.5` : "space-y-1.5"}`}>
      {lines.map((l) => (
        <li key={l.key} className="flex items-start gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-rw-accent shrink-0 mt-0.5" />
          <span className="min-w-0">
            {l.who && (
              <>
                <HubLink to={l.who.to} className="inline-flex items-center gap-1 text-rw-text font-semibold hover:underline">
                  {l.who.to.kind === "team" && <TeamLogo name={l.who.name} sizeClass="w-3.5 h-3.5" />}
                  {l.who.to.kind === "player" && <PlayerPhoto name={l.who.name} team={l.who.team} slug={l.who.to.slug} size={15} linkFallback={false} />}
                  <span>{l.who.name}</span>
                </HubLink>
                {": "}
              </>
            )}
            <span className="text-rw-sub">{l.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};

/** A titled card of storylines (nothing when there are none). */
export const StoryList: React.FC<{
  title?: string;
  lines: StoryLine[];
  spoilerKey: string;
  share?: string;
  right?: React.ReactNode;
  /** side by side as the window gets wider */
  columns?: boolean;
}> = ({ title, lines, spoilerKey, share, right, columns }) => {
  const newest = lines.map((l) => l.asOf || "").sort().pop();
  const [hidden] = useHidden(spoilerKey, newest || undefined);
  if (!lines.length && !right) return null;
  const plainLines = lines.filter((l) => l.plain);
  return (
    <Section
      title={title || tl("Storylines")}
      share={share}
      right={
        right || (!hidden && plainLines.length > 0) ? (
          <span className="flex items-center gap-2">
            {right}
            {!hidden && plainLines.length > 0 && (
              <>
                <SectionCard
                  section={title || tl("Storylines")}
                  name={share || "storylines"}
                  rows={() =>
                    plainLines.slice(0, 10).map((l, idx) => ({
                      rank: idx + 1,
                      champ: l.champ,
                      team: !l.champ ? l.team || l.who?.team || (l.who?.to.kind === "team" ? l.who.name : undefined) : undefined,
                      label: l.who ? l.who.name : l.plain!,
                      sub: l.who ? l.plain : undefined,
                    }))
                  }
                />
                <CopyStorylinesPost title={title || tl("Storylines")} lines={plainLines} />
              </>
            )}
          </span>
        ) : undefined
      }
    >
      <StoryBullets lines={lines} spoilerKey={spoilerKey} columns={columns} />
    </Section>
  );
};

/** A team's or player's own storylines (their page). */
export const OwnStorylines: React.FC<{
  notes?: Notes;
  spoilerKey: string;
  share?: string;
  who?: { kind: "team" | "player"; slug: string; team?: string };
}> = ({ notes, spoilerKey, share, who }) =>
  notes && notes.list.length ? (
    <StoryList
      lines={notes.list.map((nt, i) => ({
        key: String(i),
        text: noteText(nt, who),
        plain: notePlainText(nt),
        champ: nt.c,
        team: who?.team || (who?.kind === "team" ? who.slug : undefined),
        asOf: notes.asOf,
      }))}
      spoilerKey={spoilerKey}
      share={share}
      right={
        who ? (
          <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
            {(() => {
              const noteChamp = notes.list.find((nt) => nt.c)?.c;
              const noteYr = notes.list.find((nt) => nt.y)?.y;
              const rawNoteEv = notes.list.find((nt) => nt.e)?.e;
              const noteEv = rawNoteEv ? resolveEventSlug(rawNoteEv) : undefined;
              return who.kind === "team" ? (
                <>
                  <HubLink
                    to={{ kind: "prep", a: who.slug, ...(noteYr ? { period: `y${noteYr}` } : noteEv ? { period: `e:${noteEv}` } : {}) }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        teams: who.slug,
                        ...(noteYr ? { p: `y${noteYr}` } : noteEv ? { p: `e:${noteEv}` } : {}),
                        ...(noteChamp ? { champ: resolveChampSlug(noteChamp) } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "compare", mode: "team", a: who.slug, ...(noteYr ? { period: `y${noteYr}` } : noteEv ? { period: `e:${noteEv}` } : {}) }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  {noteChamp && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: new URLSearchParams({
                          champ: resolveChampSlug(noteChamp),
                          ...(noteYr ? { patch: `y${noteYr}`, year: String(noteYr) } : noteEv ? { event: noteEv } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: new URLSearchParams({
                        team: who.slug,
                        ...(noteChamp ? { champ: resolveChampSlug(noteChamp) } : {}),
                        ...(noteYr ? { year: String(noteYr) } : {}),
                        ...(noteEv ? { event: noteEv } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: new URLSearchParams({
                        team: who.slug,
                        ...(noteYr ? { year: String(noteYr) } : {}),
                        ...(noteEv ? { event: noteEv } : {}),
                        ...(noteChamp ? { champ: resolveChampSlug(noteChamp) } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "rankings", query: `q=${encodeURIComponent(who.slug)}` }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      ...(noteYr || noteEv || noteChamp
                        ? {
                            query: new URLSearchParams({
                              ...(noteYr ? { key: `y${noteYr}`, year: String(noteYr) } : noteEv ? { event: noteEv } : {}),
                              ...(noteChamp ? { q: resolveChampSlug(noteChamp) } : {}),
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
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(noteYr ? { year: String(noteYr) } : {}),
                        ...(noteEv ? { event: noteEv } : {}),
                        ...(noteChamp ? { champ: resolveChampSlug(noteChamp) } : {}),
                        q: who.slug,
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                </>
              ) : (
                <>
                  {who.team && (() => {
                    const whoTeamSlug = resolveTeamAlias(who.team) || prettySlug(who.team);
                    return (
                      <>
                        <HubLink
                          to={{ kind: "prep", a: whoTeamSlug, ...(noteYr ? { period: `y${noteYr}` } : noteEv ? { period: `e:${noteEv}` } : {}) }}
                          className="text-rw-sub hover:text-rw-accent hover:underline"
                        >
                          {tl("Match prep")} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "draft",
                            query: new URLSearchParams({
                              teams: whoTeamSlug,
                              ...(noteYr ? { p: `y${noteYr}` } : noteEv ? { p: `e:${noteEv}` } : {}),
                              ...(noteChamp ? { champ: resolveChampSlug(noteChamp) } : {}),
                            }).toString(),
                          }}
                          className="text-rw-sub hover:text-rw-accent hover:underline"
                        >
                          {tl("Draft board")} →
                        </HubLink>
                      </>
                    );
                  })()}
                  <HubLink
                    to={{ kind: "compare", mode: "player", a: who.slug, ...(noteYr ? { period: `y${noteYr}` } : noteEv ? { period: `e:${noteEv}` } : {}) }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </HubLink>
                  {noteChamp && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: new URLSearchParams({
                          champ: resolveChampSlug(noteChamp),
                          ...(noteYr ? { patch: `y${noteYr}`, year: String(noteYr) } : noteEv ? { event: noteEv } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      query: new URLSearchParams({
                        player: who.slug,
                        ...(who.team ? { team: resolveTeamAlias(who.team) || prettySlug(who.team) } : {}),
                        ...(noteChamp ? { champ: resolveChampSlug(noteChamp) } : {}),
                        ...(noteYr ? { year: String(noteYr) } : {}),
                        ...(noteEv ? { event: noteEv } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      query: new URLSearchParams({
                        player: who.slug,
                        ...(who.team ? { team: resolveTeamAlias(who.team) || prettySlug(who.team) } : {}),
                        ...(noteYr ? { year: String(noteYr) } : {}),
                        ...(noteEv ? { event: noteEv } : {}),
                        ...(noteChamp ? { champ: resolveChampSlug(noteChamp) } : {}),
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        ...(noteYr ? { year: String(noteYr) } : {}),
                        ...(noteEv ? { event: noteEv } : {}),
                        ...(noteChamp ? { champ: resolveChampSlug(noteChamp) } : {}),
                        q: who.slug,
                      }).toString(),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "rankings",
                      ...(who.team ? { query: `q=${encodeURIComponent(resolveTeamAlias(who.team) || prettySlug(who.team))}` } : {}),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      ...(noteYr || noteEv || noteChamp
                        ? {
                            query: new URLSearchParams({
                              ...(noteYr ? { key: `y${noteYr}`, year: String(noteYr) } : noteEv ? { event: noteEv } : {}),
                              ...(noteChamp ? { q: resolveChampSlug(noteChamp) } : {}),
                            }).toString(),
                          }
                        : {}),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                </>
              );
            })()}
          </span>
        ) : undefined
      }
    />
  ) : null;

/** Stats home: the most notable storylines of teams and players who played in the last 30 days. */
export const HomeStorylines: React.FC = () => {
  const state = useLoad(() => load<GlobalNote[]>("hub/notes.json"), []);
  const [search, setSearch] = useState("");
  // more of them as the window gets wider: 8 in one column, 6 more for each column after
  const cols = useColumns();
  const all = state.data || [];
  const q = normText(search);
  const terms = q ? q.split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i).map((s) => normText(s)).filter(Boolean) : [];
  const rows = terms.length
    ? all.filter((r) => {
        const hay = normText(`${r.name} ${r.u} ${r.c || ""} ${r.c ? champName(r.c) : ""} ${r.e || ""} ${notePlainText(r)}`);
        const hayBare = bare(hay);
        const rTeam = r.t === "team" ? resolveTeamAlias(r.u || r.name) : "";
        const rPlayer = r.t === "player" ? r.u || resolvePlayerSlug(r.name) : "";
        return terms.some((t) => {
          const tb = bare(t);
          const ta = searchAlias(t);
          const qTeam = rTeam ? resolveTeamAlias(t) : "";
          const qPlayer = rPlayer ? resolvePlayerSlug(t) : "";
          return (
            hay.includes(t) ||
            (tb.length >= 2 && hayBare.includes(tb)) ||
            (ta ? hay.includes(ta) || hayBare.includes(bare(ta)) : false) ||
            (r.c ? matchesChampSearch(r.c, t) : false) ||
            Boolean(qTeam && qTeam === rTeam) ||
            Boolean(qPlayer && qPlayer === rPlayer) ||
            Boolean(r.e && matchesPeriodEvent(r.e, undefined, t))
          );
        });
      })
    : all.slice(0, 8 + (cols - 1) * 6);
  if (!all.length) return null;
  return (
    <StoryList
      title={tl("Storylines")}
      spoilerKey="home-notes"
      share="riftwise-storylines"
      columns
      right={
        all.length > 6 ? (
          <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
            {terms.length === 0 && (() => {
              const topTeams = Array.from(new Set(all.filter((r) => r.t === "team").map((r) => r.u || resolveTeamAlias(r.name) || prettySlug(r.name))));
              const topPlayers = Array.from(new Set(all.filter((r) => r.t === "player").map((r) => r.u || resolvePlayerSlug(r.name) || prettySlug(r.name))));
              const topChamps = Array.from(new Set(all.map((r) => r.c).filter(Boolean) as string[]));
              return (
                <>
                  {topTeams.length >= 1 && (
                    <>
                      <HubLink to={{ kind: "prep", a: topTeams[0], ...(topTeams[1] ? { b: topTeams[1] } : {}) }} className="text-rw-sub hover:text-rw-accent hover:underline">
                        {tl("Match prep")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "draft",
                          query: new URLSearchParams({
                            teams: [topTeams[0], topTeams[1]].filter(Boolean).join(","),
                            ...(topChamps[0] ? { champ: resolveChampSlug(topChamps[0]) } : {}),
                          }).toString(),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Draft board")} →
                      </HubLink>
                      <HubLink to={{ kind: "compare", mode: "team", a: topTeams[0], ...(topTeams[1] ? { b: topTeams[1] } : {}) }} className="text-rw-sub hover:text-rw-accent hover:underline">
                        {tl("Compare")} →
                      </HubLink>
                    </>
                  )}
                  {topChamps[0] && (
                    <HubLink
                      to={{
                        kind: "counters",
                        query: `champ=${encodeURIComponent(resolveChampSlug(topChamps[0]))}${topChamps[1] ? `&vs=${encodeURIComponent(resolveChampSlug(topChamps[1]))}` : ""}`,
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Counters")} →
                    </HubLink>
                  )}
                  <HubLink
                    to={{
                      kind: "items",
                      ...(topTeams[0] || topPlayers[0] || topChamps[0]
                        ? {
                            query: new URLSearchParams({
                              ...(topTeams[0]
                                ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) }
                                : topPlayers[0]
                                  ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) }
                                  : {}),
                              ...(topChamps[0] ? { champ: resolveChampSlug(topChamps[0]) } : {}),
                            }).toString(),
                          }
                        : {}),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "records",
                      ...(topTeams[0] || topPlayers[0]
                        ? { query: `q=${encodeURIComponent(topTeams[0] || topPlayers[0])}` }
                        : {}),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Records")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      ...(topPlayers[0] || topTeams[0] || topChamps[0]
                        ? {
                            query: new URLSearchParams({
                              ...(topPlayers[0] || topTeams[0] ? { q: [topPlayers[0], topTeams[0]].filter(Boolean).join(",") } : {}),
                              ...(topChamps[0] ? { champ: resolveChampSlug(topChamps[0]) } : {}),
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
                      ...(topTeams[0]
                        ? { query: `q=${encodeURIComponent([topTeams[0], topTeams[1]].filter(Boolean).join(","))}` }
                        : {}),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      ...(topChamps[0] ? { query: `q=${encodeURIComponent(resolveChampSlug(topChamps[0]))}` } : {}),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "best",
                      ...(topTeams[0]
                        ? { query: `q=${encodeURIComponent([topTeams[0], topTeams[1]].filter(Boolean).join(","))}` }
                        : {}),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Best games")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "finder",
                      ...(topTeams[0] || topPlayers[0] || topChamps[0]
                        ? {
                            query: new URLSearchParams({
                              ...(topTeams[0]
                                ? { team: topTeams[0], ...(topTeams[1] ? { vs: topTeams[1] } : {}) }
                                : topPlayers[0]
                                  ? { player: topPlayers[0], ...(topPlayers[1] ? { vsplayer: topPlayers[1] } : {}) }
                                  : {}),
                              ...(topChamps[0] ? { champ: resolveChampSlug(topChamps[0]) } : {}),
                            }).toString(),
                          }
                        : {}),
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </HubLink>
                </>
              );
            })()}
            {terms.length > 0 && (() => {
              const filteredChamp = rows.find((r) => r.c)?.c;
              const filteredYr = rows.find((r) => r.y)?.y;
              const rawFilteredEv = rows.find((r) => r.e)?.e;
              const filteredEv = rawFilteredEv ? resolveEventSlug(rawFilteredEv) : undefined;
              const teamSlugs = Array.from(new Set(rows.filter((r) => r.t === "team").map((r) => r.u || resolveTeamAlias(r.name) || prettySlug(r.name))));
              if (teamSlugs.length >= 1) {
                const a = teamSlugs[0];
                const b = teamSlugs[1];
                return (
                  <>
                    <HubLink
                      to={{
                        kind: "prep",
                        a,
                        ...(b ? { b } : {}),
                        ...(filteredYr ? { period: `y${filteredYr}` } : filteredEv ? { period: `e:${filteredEv}` } : {}),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          teams: [a, b].filter(Boolean).join(","),
                          ...(filteredYr ? { p: `y${filteredYr}` } : filteredEv ? { p: `e:${filteredEv}` } : {}),
                          ...(filteredChamp ? { champ: resolveChampSlug(filteredChamp) } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "team",
                        a,
                        ...(b ? { b } : {}),
                        ...(filteredYr ? { period: `y${filteredYr}` } : filteredEv ? { period: `e:${filteredEv}` } : {}),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    {filteredChamp && (
                      <HubLink
                        to={{
                          kind: "counters",
                          query: new URLSearchParams({
                            champ: resolveChampSlug(filteredChamp),
                            ...(filteredYr ? { patch: `y${filteredYr}`, year: String(filteredYr) } : filteredEv ? { event: filteredEv } : {}),
                          }).toString(),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Counters")} →
                      </HubLink>
                    )}
                    <HubLink
                      to={{
                        kind: "items",
                        query: new URLSearchParams({
                          team: a,
                          ...(b ? { vs: b } : {}),
                          ...(filteredYr ? { year: String(filteredYr) } : {}),
                          ...(filteredEv ? { event: filteredEv } : {}),
                          ...(filteredChamp ? { champ: resolveChampSlug(filteredChamp) } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: new URLSearchParams({
                          team: a,
                          ...(b ? { vs: b } : {}),
                          ...(filteredYr ? { year: String(filteredYr) } : {}),
                          ...(filteredEv ? { event: filteredEv } : {}),
                          ...(filteredChamp ? { champ: resolveChampSlug(filteredChamp) } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "rankings",
                        query: `q=${encodeURIComponent(a)}${b ? `,${encodeURIComponent(b)}` : ""}`,
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        ...(filteredYr || filteredEv || filteredChamp
                          ? {
                              query: new URLSearchParams({
                                ...(filteredYr ? { key: `y${filteredYr}`, year: String(filteredYr) } : filteredEv ? { event: filteredEv } : {}),
                                ...(filteredChamp ? { q: resolveChampSlug(filteredChamp) } : {}),
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
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(filteredYr ? { year: String(filteredYr) } : {}),
                          ...(filteredEv ? { event: filteredEv } : {}),
                          ...(filteredChamp ? { champ: resolveChampSlug(filteredChamp) } : {}),
                          q: [a, b].filter(Boolean).join(","),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                  </>
                );
              }
              const playerSlugs = Array.from(new Set(rows.filter((r) => r.t === "player").map((r) => r.u || resolvePlayerSlug(r.name) || prettySlug(r.name))));
              if (playerSlugs.length >= 1) {
                return (
                  <>
                    <HubLink
                      to={{
                        kind: "compare",
                        mode: "player",
                        a: playerSlugs[0],
                        ...(playerSlugs[1] ? { b: playerSlugs[1] } : {}),
                        ...(filteredYr ? { period: `y${filteredYr}` } : filteredEv ? { period: `e:${filteredEv}` } : {}),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Compare")} →
                    </HubLink>
                    {filteredChamp && (
                      <HubLink
                        to={{
                          kind: "counters",
                          query: new URLSearchParams({
                            champ: resolveChampSlug(filteredChamp),
                            ...(filteredYr ? { patch: `y${filteredYr}`, year: String(filteredYr) } : filteredEv ? { event: filteredEv } : {}),
                          }).toString(),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Counters")} →
                      </HubLink>
                    )}
                    <HubLink
                      to={{
                        kind: "items",
                        query: new URLSearchParams({
                          player: playerSlugs[0],
                          ...(playerSlugs[1] ? { vsplayer: playerSlugs[1] } : {}),
                          ...(filteredChamp ? { champ: resolveChampSlug(filteredChamp) } : {}),
                          ...(filteredYr ? { year: String(filteredYr) } : {}),
                          ...(filteredEv ? { event: filteredEv } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "finder",
                        query: new URLSearchParams({
                          player: playerSlugs[0],
                          ...(playerSlugs[1] ? { vsplayer: playerSlugs[1] } : {}),
                          ...(filteredYr ? { year: String(filteredYr) } : {}),
                          ...(filteredEv ? { event: filteredEv } : {}),
                          ...(filteredChamp ? { champ: resolveChampSlug(filteredChamp) } : {}),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(filteredYr ? { year: String(filteredYr) } : {}),
                          ...(filteredEv ? { event: filteredEv } : {}),
                          ...(filteredChamp ? { champ: resolveChampSlug(filteredChamp) } : {}),
                          q: [playerSlugs[0], playerSlugs[1]].filter(Boolean).join(","),
                        }).toString(),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink to={{ kind: "rankings" }} className="text-rw-sub hover:text-rw-accent hover:underline">
                      {tl("Power rankings")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        ...(filteredYr || filteredEv || filteredChamp
                          ? {
                              query: new URLSearchParams({
                                ...(filteredYr ? { key: `y${filteredYr}`, year: String(filteredYr) } : filteredEv ? { event: filteredEv } : {}),
                                ...(filteredChamp ? { q: resolveChampSlug(filteredChamp) } : {}),
                              }).toString(),
                            }
                          : {}),
                      }}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                  </>
                );
              }
              return null;
            })()}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              data-nocapture="1"
              className="bg-rw-bg border border-rw-border rounded-md px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-36"
            />
          </span>
        ) : undefined
      }
      lines={rows.map((r, i) => {
        const entitySlug = r.t === "team" ? r.u || resolveTeamAlias(r.name) || prettySlug(r.name) : r.u || resolvePlayerSlug(r.name) || prettySlug(r.name);
        return {
          key: `${entitySlug}-${i}`,
          who: {
            name: r.name,
            to: {
              kind: r.t,
              slug: entitySlug,
              ...(r.y ? { query: `p=y${encodeURIComponent(r.y)}` } : r.e ? { query: `p=e:${encodeURIComponent(resolveEventSlug(r.e))}` } : {}),
            },
          },
          text: noteText(r, { kind: r.t, slug: entitySlug }),
          plain: notePlainText(r),
          champ: r.c,
          asOf: r.asOf,
        };
      })}
    />
  );
};

const CopyStorylinesPost: React.FC<{ title: string; lines: StoryLine[] }> = ({ title, lines }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const out = [
      title,
      ...lines.slice(0, 5).map((l) => `• ${l.who ? `${l.who.name}: ` : ""}${l.plain}`),
      hubShareUrl(currentHubRoute()),
    ];
    navigator.clipboard?.writeText(out.join("\n")).then(
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
