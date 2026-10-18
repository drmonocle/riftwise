/**
 * Storylines: milestones within reach, streaks, unbeaten runs (worked out by each stats build into the team / player files and
 * hub/notes.json), written out as sentences a caster can read on air. Spoiler mode hides them while they use fresh games.
 */
import React from "react";
import { Sparkles } from "lucide-react";
import { tl, tn } from "../../i18n";
import { champName } from "../../champions";
import { load } from "../../stats";
import { ChampIcon, HubLink, RevealButton, Section, fmtNum, useHidden, useLoad, GRID_COLS, useColumns } from "./ui";

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

export function noteText(nt: Note): React.ReactNode {
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
      return (
        <span className="inline-flex items-center gap-1 flex-wrap">
          <ChampIcon name={nt.c} size={16} />
          {tl("Unbeaten on {champ} in {year}: {n}-0", { champ: champName(nt.c || ""), n: nt.n, year: nt.y || "" })}
        </span>
      );
  }
  return null;
}

export interface StoryLine {
  key: string;
  who?: { name: string; to: { kind: "team" | "player"; slug: string } };
  text: React.ReactNode;
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
                <HubLink to={l.who.to} className="text-rw-text font-semibold hover:underline">
                  {l.who.name}
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
}> = ({ title, lines, spoilerKey, share, right, columns }) =>
  lines.length ? (
    <Section title={title || tl("Storylines")} share={share} right={right}>
      <StoryBullets lines={lines} spoilerKey={spoilerKey} columns={columns} />
    </Section>
  ) : null;

/** A team's or player's own storylines (their page). */
export const OwnStorylines: React.FC<{ notes?: Notes; spoilerKey: string; share?: string }> = ({ notes, spoilerKey, share }) =>
  notes && notes.list.length ? (
    <StoryList lines={notes.list.map((nt, i) => ({ key: String(i), text: noteText(nt), asOf: notes.asOf }))} spoilerKey={spoilerKey} share={share} />
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
      lines={rows.map((r, i) => ({ key: `${r.u}-${i}`, who: { name: r.name, to: { kind: r.t, slug: r.u } }, text: noteText(r), asOf: r.asOf }))}
    />
  );
};
