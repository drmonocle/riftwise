/**
 * Storylines: milestones within reach, streaks, unbeaten runs (worked out by each stats build into the team / player files and
 * hub/notes.json), written out as sentences a caster can read on air. Spoiler mode hides them while they use fresh games.
 */
import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { tl, tn } from "../../i18n";
import { champName } from "../../champions";
import { load } from "../../stats";
import { prettySlug } from "../../hub/data";
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
          query: `${who.kind}=${encodeURIComponent(who.slug)}&champ=${encodeURIComponent(nt.c)}${yr}`,
        }}
        className="hover:text-rw-accent hover:underline"
      >
        {plain}
      </HubLink>
    ) : (
      <HubLink to={{ kind: "champ", slug: prettySlug(nt.c) }} className="hover:text-rw-accent hover:underline">
        {plain}
      </HubLink>
    );
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        <HubLink to={{ kind: "champ", slug: prettySlug(nt.c) }} title={champName(nt.c)}>
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
            to={{ kind: "finder", query: `${who.kind}=${encodeURIComponent(who.slug)}` }}
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
    return (
      <HubLink
        to={{ kind: "tournaments", query: `q=${encodeURIComponent(nt.e)}` }}
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
  if (nt.k === "streak" && who?.kind === "team") {
    return (
      <HubLink to={{ kind: "team", slug: who.slug, tab: "matches" }} className="hover:text-rw-accent hover:underline">
        {plain}
      </HubLink>
    );
  }
  if (nt.k === "ms" && who) {
    if (nt.s === "games" || nt.s === "wins") {
      return (
        <HubLink
          to={{ kind: "finder", query: `${who.kind}=${encodeURIComponent(who.slug)}${nt.s === "wins" ? "&result=w" : ""}` }}
          className="hover:text-rw-accent hover:underline"
        >
          {plain}
        </HubLink>
      );
    }
    return (
      <HubLink to={{ kind: who.kind, slug: who.slug, tab: "stats" }} className="hover:text-rw-accent hover:underline">
        {plain}
      </HubLink>
    );
  }
  return plain || null;
}

export interface StoryLine {
  key: string;
  who?: { name: string; team?: string; to: { kind: "team" | "player"; slug: string } };
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
  if (!lines.length) return null;
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
    />
  ) : null;

/** Stats home: the most notable storylines of teams and players who played in the last 30 days. */
export const HomeStorylines: React.FC = () => {
  const state = useLoad(() => load<GlobalNote[]>("hub/notes.json"), []);
  // more of them as the window gets wider: 8 in one column, 6 more for each column after
  const cols = useColumns();
  const rows = (state.data || []).slice(0, 8 + (cols - 1) * 6);
  return (
    <StoryList
      title={tl("Storylines")}
      spoilerKey="home-notes"
      share="riftwise-storylines"
      columns
      lines={rows.map((r, i) => ({
        key: `${r.u}-${i}`,
        who: { name: r.name, to: { kind: r.t, slug: r.u } },
        text: noteText(r, { kind: r.t, slug: r.u }),
        plain: notePlainText(r),
        champ: r.c,
        asOf: r.asOf,
      }))}
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
