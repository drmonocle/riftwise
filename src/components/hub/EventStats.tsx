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
export const FactGroups: React.FC<{ facts: Fact[]; link: string; shareId: (f: Fact) => string; eventSlug?: string }> = ({ facts, link, shareId, eventSlug }) => {
  const [search, setSearch] = useState("");
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
  const terms = search
    .trim()
    .toLowerCase()
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const filteredFacts = useMemo(() => {
    if (!terms.length) return facts;
    return facts
      .map((f) => {
        const cardMatch = terms.some((t) => `${f.title} ${f.headline}`.toLowerCase().includes(t));
        if (cardMatch) return f;
        const matchingRows = f.rows.filter((r) => {
          const hay = `${r.label} ${r.value} ${r.sub || ""} ${r.player || ""} ${r.team || ""} ${r.champ || ""}`.toLowerCase();
          return terms.some((t) => hay.includes(t));
        });
        if (!matchingRows.length) return null;
        return { ...f, rows: matchingRows };
      })
      .filter((f): f is Fact => f !== null);
  }, [facts, terms.join("|")]);
  return (
    <div className="space-y-4">
      {facts.length > 6 && (
        <div className="flex flex-wrap items-center justify-between gap-2" data-nocapture="1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold">
            <HubLink to={{ kind: "records" }} className="text-rw-accent hover:underline">
              {tl("Records")} →
            </HubLink>
            <HubLink
              to={{ kind: "leaders", ...(eventSlug ? { query: `event=${encodeURIComponent(eventSlug)}` } : {}) }}
              className="text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </HubLink>
            <HubLink
              to={{ kind: "champions", ...(eventSlug ? { query: `event=${encodeURIComponent(eventSlug)}` } : {}) }}
              className="text-rw-accent hover:underline"
            >
              {tl("Champions")} →
            </HubLink>
            <HubLink to={{ kind: "tiers" }} className="text-rw-accent hover:underline">
              {tl("Pro tier list")} →
            </HubLink>
            <HubLink
              to={{ kind: "draft", ...(eventSlug ? { query: `p=e:${encodeURIComponent(eventSlug)}` } : {}) }}
              className="text-rw-accent hover:underline"
            >
              {tl("Draft board")} →
            </HubLink>
            <HubLink to={{ kind: "rankings" }} className="text-rw-accent hover:underline">
              {tl("Power rankings")} →
            </HubLink>
            <HubLink
              to={{ kind: "finder", ...(eventSlug ? { query: `event=${encodeURIComponent(eventSlug)}` } : {}) }}
              className="text-rw-accent hover:underline"
            >
              {tl("Game finder")} →
            </HubLink>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded-lg px-2.5 py-1 text-xs text-rw-text w-48"
          />
        </div>
      )}
      {(["event", "teams", "players", "champs"] as Group[]).map((g) => {
        // the event in numbers leads its group
        const list = filteredFacts.filter((f) => groupOf(f) === g).sort((a, b) => Number(b.id === "totals") - Number(a.id === "totals"));
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
                <FactCard key={f.id} f={f} link={link} shareId={shareId(f)} eventSlug={eventSlug} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const FactCard: React.FC<{ f: Fact; link: string; shareId: string; eventSlug?: string }> = ({ f, link, shareId, eventSlug }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    navigator.clipboard
      ?.writeText(factText(f, link))
      .then(() => {
        setState("copied");
        window.setTimeout(() => setState("idle"), 1500);
      })
      .catch(() => {
        setState("failed");
        window.setTimeout(() => setState("idle"), 2000);
      });
  };
  return (
    <Section
      title={f.title}
      id={shareId}
      share={shareId}
      right={
        <span className="flex items-center gap-1">
          {f.rows.length >= 2 &&
            (f.rows[0].player && f.rows[1].player && f.rows[0].player !== f.rows[1].player ? (
              <>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "player",
                    a: f.rows[0].player,
                    b: f.rows[1].player,
                    ...(eventSlug ? { period: `e:${eventSlug}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: `player=${encodeURIComponent(f.rows[0].player)}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    ...(eventSlug ? { query: `event=${encodeURIComponent(eventSlug)}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      player: f.rows[0].player,
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
              </>
            ) : !f.rows[0].player && !f.rows[0].champ && f.rows[0].team && f.rows[1].team && f.rows[0].team !== f.rows[1].team ? (
              <>
                <HubLink
                  to={{
                    kind: "prep",
                    a: f.rows[0].team,
                    b: f.rows[1].team,
                    ...(eventSlug ? { period: `e:${eventSlug}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(f.rows[0].team)},${encodeURIComponent(f.rows[1].team)}${eventSlug ? `&p=e:${encodeURIComponent(eventSlug)}` : ""}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "compare",
                    mode: "team",
                    a: f.rows[0].team,
                    b: f.rows[1].team,
                    ...(eventSlug ? { period: `e:${eventSlug}` } : {}),
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Compare")} →
                </HubLink>
                <HubLink
                  to={{ kind: "rankings" }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      team: f.rows[0].team,
                      vs: f.rows[1].team,
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
              </>
            ) : f.rows[0].champ && f.rows[1].champ && f.rows[0].champ !== f.rows[1].champ ? (
              <>
                <HubLink
                  to={{
                    kind: "counters",
                    query: `champ=${prettySlug(f.rows[0].champ)}&vs=${encodeURIComponent(f.rows[1].champ)}`,
                  }}
                  className="text-[11px] font-semibold text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Counters")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "items",
                    query: `champ=${encodeURIComponent(prettySlug(f.rows[0].champ))}`,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{ kind: "tiers" }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Pro tier list")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    ...(eventSlug ? { query: `p=e:${encodeURIComponent(eventSlug)}` } : {}),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Draft board")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      champ: f.rows[0].champ,
                      ...(eventSlug ? { event: eventSlug } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline mr-1"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
              </>
            ) : null)}
          <SectionCard
            section={f.title}
            sub={f.headline}
            name={shareId}
            rows={() =>
              f.rows.slice(0, 10).map((r, idx) => ({
                rank: f.plain ? undefined : idx + 1,
                champ: r.champ,
                team: !r.champ && r.team ? r.team : undefined,
                label: r.label,
                sub: r.sub,
                value: r.value,
              }))
            }
          />
          <CopyLinkButton url={`${link}#${shareId}`} />
          <button type="button" className={btn} onClick={copy} aria-label={tl("Copy as text")}>
            {state === "copied" ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <Copy className="w-3.5 h-3.5" />}
            {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Text")}
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
                  <HubLink to={{ kind: "player", slug: r.player }} className="relative shrink-0">
                    <PlayerPhoto
                      name={r.team && /^[A-Z0-9]{2,6}\s+\S/.test(r.label) ? r.label.replace(/^[A-Z0-9]{2,6}\s+/, "") : r.label}
                      team={r.team ?? undefined}
                      slug={r.player}
                      size={18}
                    />
                  </HubLink>
                ) : r.team ? (
                  <HubLink to={{ kind: "team", slug: r.team }} className="relative shrink-0">
                    <TeamLogo name={r.team} code={r.label.length <= 5 && !/\s/.test(r.label) ? r.label : undefined} size={16} />
                  </HubLink>
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
                ) : r.player ? (
                  <HubLink to={{ kind: "player", slug: r.player }} className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums">
                    {r.value}
                  </HubLink>
                ) : r.team ? (
                  <HubLink to={{ kind: "team", slug: r.team }} className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums">
                    {r.value}
                  </HubLink>
                ) : r.champ ? (
                  <HubLink to={{ kind: "champ", slug: prettySlug(r.champ) }} className="relative font-bold text-rw-accent hover:underline shrink-0 tabular-nums">
                    {r.value}
                  </HubLink>
                ) : eventSlug ? (
                  <HubLink
                    to={{ kind: "finder", query: `event=${encodeURIComponent(eventSlug)}` }}
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
  return <FactGroups facts={facts} link={hubShareUrl({ kind: "event", slug })} shareId={(f) => `${slug}-${f.id}`} eventSlug={slug} />;
};
