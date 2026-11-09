/**
 * An event's stat cards (src/hub/worldsFacts.ts + eventStats.ts), grouped: the event, teams, players, champions and
 * the draft. Used by the Worlds / MSI / First Stand stats tab and by every tournament page with a lines file (the
 * stats build writes one for those events, so the cards appear and update with the data, nothing to set up per event).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { tl } from "../../i18n";
import { loadEventLines, prettySlug } from "../../hub/data";
import { hubShareUrl } from "../../hub/route";
import { eventFacts, factText, gamesOf, type Fact } from "../../hub/worldsFacts";
import { moreEventFacts } from "../../hub/eventStats";
import { SectionCard } from "./BroadcastCard";
import { ChampIcon, CopyLinkButton, HubLink, PlayerLink, PlayerPhoto, RevealButton, Section, TeamLink, TeamLogo, useHidden, useLoad } from "./ui";

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
          // the id: a "jump to" link's target (the Worlds page's JumpBar)
          <div key={g} className="space-y-2" id={`facts-${g}`}>
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
          <SectionCard
            section={f.title}
            sub={f.headline}
            name={shareId}
            rows={() =>
              f.rows.slice(0, 10).map((r, idx) => ({
                rank: f.plain ? undefined : idx + 1,
                champ: r.champ,
                label: r.label,
                sub: r.sub,
                value: r.value,
              }))
            }
          />
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
        {(() => {
          const parseV = (s: string) => {
            if (!s) return null;
            const m = s.replace(/,/g, "").match(/^([0-9]+(?:\.[0-9]+)?)/);
            return m ? Number(m[1]) : null;
          };
          const nums = !f.plain ? f.rows.map((r) => parseV(r.value)) : [];
          const validNums = nums.filter((v): v is number => v != null && isFinite(v) && v > 0);
          const maxNum = validNums.length >= 2 ? Math.max(...validNums) : 0;
          return f.rows.map((r, i) => {
            const vNum = nums[i];
            const barPct = maxNum > 0 && vNum != null && vNum > 0 ? Math.max(4, Math.min(100, Math.round((vNum / maxNum) * 100))) : 0;
            return (
              <li key={i} className="relative overflow-hidden rounded px-1.5 py-0.5 flex items-start gap-2 min-w-0">
                {barPct > 0 && (
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 rounded"
                    style={{ width: `${barPct}%`, background: i === 0 ? "rgba(216,184,120,0.14)" : "rgba(130,170,255,0.07)" }}
                  />
                )}
                {!f.plain && <span className="relative w-4 text-rw-muted text-right shrink-0">{i + 1}.</span>}
                {r.champ ? (
                  <HubLink to={{ kind: "champ", slug: prettySlug(r.champ) }} className="relative shrink-0">
                    <ChampIcon name={r.champ} size={18} />
                  </HubLink>
                ) : r.player ? (
                  <PlayerPhoto name={r.label} slug={r.player} size={18} />
                ) : r.team ? (
                  <TeamLogo name={r.label} size={16} />
                ) : null}
                <span className="relative min-w-0 flex-1">
                  {r.player ? (
                    <PlayerLink name={r.label} u={r.player} />
                  ) : r.team ? (
                    <TeamLink name={r.label} u={r.team} />
                  ) : r.champ ? (
                    <HubLink to={{ kind: "champ", slug: prettySlug(r.champ) }} className="hover:text-rw-accent hover:underline">
                      {r.label}
                    </HubLink>
                  ) : r.match ? (
                    <HubLink to={{ kind: "match", slug: r.match.slug, game: r.match.game }} className="hover:text-rw-accent hover:underline">
                      {r.label}
                    </HubLink>
                  ) : (
                    <span>{r.label}</span>
                  )}
                  {r.sub && <span className="block text-[11px] text-rw-muted break-words">{r.sub}</span>}
                </span>
                {r.match ? (
                  <HubLink
                    to={{ kind: "match", slug: r.match.slug, game: r.match.game }}
                    className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums"
                  >
                    {r.value}
                  </HubLink>
                ) : (
                  <span className="relative font-bold text-rw-accent shrink-0 tabular-nums">{r.value}</span>
                )}
              </li>
            );
          });
        })()}
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
