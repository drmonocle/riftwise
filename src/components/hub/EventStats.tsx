/**
 * An event's stat cards (src/hub/worldsFacts.ts + eventStats.ts), grouped: the event, teams, players, champions and
 * the draft. Used by the Worlds / MSI / First Stand stats tab and by every tournament page with a lines file (the
 * stats build writes one for those events, so the cards appear and update with the data, nothing to set up per event).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { tl } from "../../i18n";
import { loadEventLines } from "../../hub/data";
import { hubShareUrl } from "../../hub/route";
import { eventFacts, factText, gamesOf, type Fact } from "../../hub/worldsFacts";
import { moreEventFacts } from "../../hub/eventStats";
import { ChampIcon, CopyLinkButton, HubLink, PlayerLink, RevealButton, Section, TeamLink, useHidden, useLoad } from "./ui";

const btn =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50 disabled:opacity-50";

/** Every card for these games: the event in numbers first, then the rest in their groups. */
export function allFacts(files: Parameters<typeof gamesOf>[0], labels: Parameters<typeof gamesOf>[1], name: string): Fact[] {
  const games = gamesOf(files, labels);
  return [...eventFacts(games, name), ...moreEventFacts(games, name)];
}

type Group = "event" | "teams" | "players" | "champs";
const GROUP_OF: Record<string, Group> = {
  totals: "event", titles: "event", fast: "event", long: "event", comebacks: "event", upsets: "event",
  towers: "teams", "team-game-kills": "teams", "team-kpg": "teams", "team-dpg": "teams", "team-fast": "teams",
  "team-dragons": "teams", "team-barons": "teams", "team-fb": "teams", "team-ft": "teams",
  "champ-worst": "champs", "champ-best": "champs", "champ-picked": "champs", "champ-banned": "champs", "champ-presence": "champs", "champ-flex": "champs",
};
const groupOf = (f: Fact): Group => GROUP_OF[f.id] || "players";

/** The cards under a heading per group (a group with no cards is left out). */
export const FactGroups: React.FC<{ facts: Fact[]; link: string; shareId: (f: Fact) => string }> = ({ facts, link, shareId }) => {
  const titles: Record<Group, string> = {
    event: tl("The event"),
    teams: tl("Teams"),
    players: tl("Players"),
    champs: tl("Champions and the draft"),
  };
  // a link to one card (riftwise.gg/stats/worlds/2026#worlds-2026-totals) opens the page scrolled to it
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !facts.some((f) => shareId(f) === id)) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts.length]);
  return (
    <div className="space-y-4">
      {(["event", "teams", "players", "champs"] as Group[]).map((g) => {
        // the event in numbers leads its group
        const list = facts.filter((f) => groupOf(f) === g).sort((a, b) => Number(b.id === "totals") - Number(a.id === "totals"));
        if (!list.length) return null;
        return (
          <div key={g} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rw-text flex items-center gap-2">
              {titles[g]}
              <span className="flex-1 h-px bg-rw-border" />
            </h2>
            <div className="grid gap-3 md:grid-cols-2 3xl:grid-cols-3">
              {list.map((f) => (
                <FactCard key={f.id} f={f} link={link} shareId={shareId(f)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const FactCard: React.FC<{ f: Fact; link: string; shareId: string }> = ({ f, link, shareId }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(factText(f, link))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <Section
      title={f.title}
      id={shareId}
      share={shareId}
      right={
        <span className="flex items-center gap-1">
          <CopyLinkButton url={`${link}#${shareId}`} />
          <button type="button" className={btn} onClick={copy} aria-label={tl("Copy as text")}>
            {copied ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <Copy className="w-3.5 h-3.5" />}
            {tl("Text")}
          </button>
        </span>
      }
    >
      <p className="text-sm font-semibold text-rw-text leading-snug">{f.headline}</p>
      <ol className="text-xs space-y-1.5">
        {f.rows.map((r, i) => (
          <li key={i} className="flex items-start gap-2 min-w-0">
            {!f.plain && <span className="w-4 text-rw-muted text-right shrink-0">{i + 1}.</span>}
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
            <span className="font-bold text-rw-accent shrink-0 tabular-nums">{r.value}</span>
          </li>
        ))}
      </ol>
      {f.note && <p className="text-[10px] text-rw-muted">{f.note}</p>}
    </Section>
  );
};

/** A tournament page's stats, from its lines file (the stats build writes one for events played into last year on). */
export const EventStatsSection: React.FC<{ slug: string; name: string; end?: string }> = ({ slug, name, end }) => {
  const lines = useLoad(() => loadEventLines(slug).catch(() => null), [slug]);
  const [hidden, reveal] = useHidden(`event-stats:${slug}`, end);
  const facts = useMemo(() => (lines.data ? allFacts([lines.data], [], name) : []), [lines.data, name]);
  if (!facts.length) return null;
  if (hidden)
    return (
      <Section title={tl("Stats")}>
        <p className="text-xs text-rw-sub flex items-center gap-2">
          {tl("Hidden while spoiler mode is on.")} <RevealButton onReveal={reveal} />
        </p>
      </Section>
    );
  return <FactGroups facts={facts} link={hubShareUrl({ kind: "event", slug })} shareId={(f) => `${slug}-${f.id}`} />;
};
