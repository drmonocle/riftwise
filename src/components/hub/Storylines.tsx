/**
 * Storylines: milestones within reach, streaks, unbeaten runs (worked out by each stats build into the team / player files and
 * hub/notes.json), written out as sentences a caster can read on air. Spoiler mode hides them while they use fresh games.
 */
import React from "react";
import { Sparkles } from "lucide-react";
import { tl, tn } from "../../i18n";
import { champName } from "../../champions";
import { load } from "../../stats";
import { ChampIcon, HubLink, RevealButton, Section, fmtNum, useHidden, useLoad } from "./ui";

export interface Note {
  k: "ms" | "streak" | "side" | "champ";
  /** milestone kind */
  s?: "games" | "wins" | "kills" | "assists";
  n: number;
  left?: number;
  /** streak: won (1) or lost (0) */
  w?: number;
  side?: "b" | "r";
  c?: string;
  y?: string;
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
export const StoryBullets: React.FC<{ lines: StoryLine[]; spoilerKey: string }> = ({ lines, spoilerKey }) => {
  const newest = lines.map((l) => l.asOf || "").sort().pop();
  const [hidden, reveal] = useHidden(spoilerKey, newest || undefined);
  if (hidden)
    return (
      <div className="py-2 text-center">
        <RevealButton onReveal={reveal} />
      </div>
    );
  return (
    <ul className="text-xs space-y-1.5">
      {lines.map((l) => (
        <li key={l.key} className="flex items-start gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-[#c8aa6e] shrink-0 mt-0.5" />
          <span className="min-w-0">
            {l.who && (
              <>
                <HubLink to={l.who.to} className="text-[#f0e6d2] font-semibold hover:underline">
                  {l.who.name}
                </HubLink>
                {": "}
              </>
            )}
            <span className="text-[#9bb3c9]">{l.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};

/** A titled card of storylines (nothing when there are none). */
export const StoryList: React.FC<{ title?: string; lines: StoryLine[]; spoilerKey: string; share?: string; right?: React.ReactNode }> = ({
  title,
  lines,
  spoilerKey,
  share,
  right,
}) =>
  lines.length ? (
    <Section title={title || tl("Storylines")} share={share} right={right}>
      <StoryBullets lines={lines} spoilerKey={spoilerKey} />
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
  const rows = (state.data || []).slice(0, 12);
  return (
    <StoryList
      title={tl("Storylines")}
      spoilerKey="home-notes"
      share="riftwatch-storylines"
      lines={rows.map((r, i) => ({ key: `${r.u}-${i}`, who: { name: r.name, to: { kind: r.t, slug: r.u } }, text: noteText(r), asOf: r.asOf }))}
    />
  );
};
