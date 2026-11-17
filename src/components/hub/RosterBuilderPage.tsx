/**
 * Pro Roster & Superteam Simulator (/stats/gm): pick any five pro players (or seed from an existing club) and evaluate
 * composite 0-10 rating, Gold% and DMG% economy balance, early-game lane delta, Bo5 Fearless pool depth + multi-role
 * flex picks, and historical teammate chemistry. Shareable via URL (?top=&jg=&mid=&bot=&sup=&p=y2026) and OBS overlay.
 */
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, MonitorPlay, Sparkles, Swords, Users, X } from "lucide-react";
import { tl, roleName, fmtDec } from "../../i18n";
import {
  loadHubPlayer,
  loadHubTeam,
  loadPlayerGames,
  normText,
  resolveChampSlug,
  resolvePlayerSlug,
  resolveTeamAlias,
} from "../../hub/data";
import { normalizeRole } from "../../hub/champAgg";
import { inPeriod, playerAgg, playerRowRef, type PlayerAgg } from "../../hub/period";
import { playerRowLine, rateLine, type RatingFile } from "../../hub/playerRating";
import type { HubPlayer, HubTeam, PlayerGameRow } from "../../hub/types";
import { navigateHub, hubShareUrl } from "../../hub/route";
import { STable } from "../STable";
import { ComparePick } from "./ComparePage";
import { RatingBadge, fmtRating, useRatingFile } from "./PlayerRating";
import { SectionCard } from "./BroadcastCard";
import { card, ChampIcon, fmtDate, fmtNum, HubLink, PlayerLink, PlayerPhoto, TeamLink, TeamLogo, td, th, usePageTitle } from "./ui";

export const ROSTER_ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
export type RosterRole = (typeof ROSTER_ROLES)[number];

const ROLE_PARAM: Record<RosterRole, string> = {
  Top: "top",
  Jungle: "jg",
  Mid: "mid",
  Bot: "bot",
  Support: "sup",
};

const PRESET_TEAMS: { label: string; slug: string }[] = [
  { label: "T1", slug: "t1" },
  { label: "BLG", slug: "bilibili-gaming" },
  { label: "Gen.G", slug: "geng" },
  { label: "HLE", slug: "hanwha-life-esports" },
  { label: "G2", slug: "g2-esports" },
  { label: "FlyQuest", slug: "flyquest" },
];

export interface EconomySlotInput {
  role: string;
  games: number;
  rating: number | null;
  goldShare: number | null;
  dmgShare: number | null;
  gd15: number | null;
}

export interface RosterEconomySummary {
  filled: number;
  ratedCount: number;
  avgRating: number | null;
  grade: "S" | "A" | "B" | "C" | "D" | null;
  totalGoldShare: number | null;
  totalDmgShare: number | null;
  sumGd15: number | null;
  economyStatus: "greedy" | "balanced" | "low-econ" | "incomplete";
}

export function rosterGrade(avg: number | null): "S" | "A" | "B" | "C" | "D" | null {
  if (avg == null) return null;
  if (avg >= 7.2) return "S";
  if (avg >= 6.6) return "A";
  if (avg >= 6.0) return "B";
  if (avg >= 5.4) return "C";
  return "D";
}

export function computeRosterEconomy(slots: EconomySlotInput[]): RosterEconomySummary {
  const filled = slots.length;
  const rated = slots.filter((s) => s.rating != null);
  const avgRating = rated.length ? Number((rated.reduce((sum, s) => sum + s.rating!, 0) / rated.length).toFixed(1)) : null;
  const grade = rosterGrade(avgRating);
  const withGold = slots.filter((s) => s.goldShare != null);
  const withDmg = slots.filter((s) => s.dmgShare != null);
  const withGd = slots.filter((s) => s.gd15 != null);
  const totalGoldShare = withGold.length ? Number(withGold.reduce((sum, s) => sum + s.goldShare!, 0).toFixed(1)) : null;
  const totalDmgShare = withDmg.length ? Number(withDmg.reduce((sum, s) => sum + s.dmgShare!, 0).toFixed(1)) : null;
  const sumGd15 = withGd.length ? Math.round(withGd.reduce((sum, s) => sum + s.gd15!, 0)) : null;
  let economyStatus: RosterEconomySummary["economyStatus"] = "incomplete";
  if (withGold.length >= 5 && totalGoldShare != null) {
    if (totalGoldShare > 103.5) economyStatus = "greedy";
    else if (totalGoldShare < 97.0) economyStatus = "low-econ";
    else economyStatus = "balanced";
  }
  return { filled, ratedCount: rated.length, avgRating, grade, totalGoldShare, totalDmgShare, sumGd15, economyStatus };
}

export interface RosterPoolInput {
  slug: string;
  name: string;
  role: string;
  champs: { champ: string; games: number; wins: number }[];
}

export interface RosterFlexResult {
  shallowPools: { slug: string; name: string; role: string; usableCount: number }[];
  flexPicks: {
    champ: string;
    totalGames: number;
    members: { slug: string; name: string; role: string; games: number; wins: number }[];
  }[];
}

export function computeRosterFlexes(pools: RosterPoolInput[]): RosterFlexResult {
  const shallowPools = pools
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      role: p.role,
      usableCount: p.champs.filter((c) => c.games >= 2).length,
    }))
    .filter((p) => p.usableCount < 5);

  const byChamp = new Map<string, Map<string, { slug: string; name: string; role: string; games: number; wins: number }>>();
  for (const p of pools) {
    for (const c of p.champs) {
      if (c.games < 3) continue;
      let holders = byChamp.get(c.champ);
      if (!holders) {
        holders = new Map();
        byChamp.set(c.champ, holders);
      }
      const prev = holders.get(p.slug);
      if (prev) {
        prev.games += c.games;
        prev.wins += c.wins;
      } else {
        holders.set(p.slug, { slug: p.slug, name: p.name, role: p.role, games: c.games, wins: c.wins });
      }
    }
  }

  const flexPicks = [...byChamp.entries()]
    .filter(([, holders]) => holders.size >= 2)
    .map(([champ, holders]) => {
      const members = [...holders.values()].sort((a, b) => b.games - a.games);
      return {
        champ,
        totalGames: members.reduce((sum, m) => sum + m.games, 0),
        members,
      };
    })
    .sort((a, b) => b.members.length - a.members.length || b.totalGames - a.totalGames);

  return { shallowPools, flexPicks };
}

export interface RosterSynergyInput {
  slug: string;
  name: string;
  role: string;
  games: PlayerGameRow[];
}

export interface RosterSynergyPair {
  a: { slug: string; name: string; role: string };
  b: { slug: string; name: string; role: string };
  games: number;
  wins: number;
  winPct: number;
}

function buildPlayerGameKeyMap(rows: PlayerGameRow[]): Map<string, number> {
  const map = new Map<string, number>();
  const occ = new Map<string, number>();
  for (const r of rows) {
    const teamKey = normText(r[7] || "");
    const gn = r[22];
    let key: string;
    if (r[1] && gn != null) {
      key = `${r[1]}#${gn}|${teamKey}`;
    } else {
      const base = `${r[1] || r[0]}|${r[0].slice(0, 10)}|${teamKey}|${normText(r[8] || "")}|${r[6] ? 1 : 0}`;
      const seq = (occ.get(base) || 0) + 1;
      occ.set(base, seq);
      key = `${base}#${seq}`;
    }
    if (!map.has(key)) map.set(key, r[6] ? 1 : 0);
  }
  return map;
}

export function computeRosterSynergy(logsByPlayer: RosterSynergyInput[]): RosterSynergyPair[] {
  const maps = logsByPlayer.map((p) => buildPlayerGameKeyMap(p.games));
  const pairs: RosterSynergyPair[] = [];
  for (let i = 0; i < logsByPlayer.length; i++) {
    for (let j = i + 1; j < logsByPlayer.length; j++) {
      if (logsByPlayer[i].slug === logsByPlayer[j].slug) continue;
      const small = maps[i].size <= maps[j].size ? maps[i] : maps[j];
      const large = maps[i].size <= maps[j].size ? maps[j] : maps[i];
      let games = 0;
      let wins = 0;
      for (const [k, w] of small.entries()) {
        if (large.has(k)) {
          games++;
          wins += w;
        }
      }
      if (games > 0) {
        pairs.push({
          a: { slug: logsByPlayer[i].slug, name: logsByPlayer[i].name, role: logsByPlayer[i].role },
          b: { slug: logsByPlayer[j].slug, name: logsByPlayer[j].name, role: logsByPlayer[j].role },
          games,
          wins,
          winPct: Math.round((wins / games) * 1000) / 10,
        });
      }
    }
  }
  return pairs.sort((x, y) => y.games - x.games || y.winPct - x.winPct);
}

interface LoadedSlot {
  slug: string;
  player: HubPlayer;
  games: PlayerGameRow[];
}

function teamStartersByRole(team: HubTeam): Partial<Record<RosterRole, string>> {
  const out: Partial<Record<RosterRole, string>> = {};
  for (const [name, slug, rawRole] of team.starters || []) {
    const r = normalizeRole(rawRole) as RosterRole | null;
    if (r && !out[r]) out[r] = slug || resolvePlayerSlug(name);
  }
  const recent = team.roster?.[0]?.p || [];
  for (const m of recent) {
    const r = normalizeRole(m.r || "") as RosterRole | null;
    if (r && !out[r]) out[r] = m.u || resolvePlayerSlug(m.n);
  }
  return out;
}

function avgRatingInPeriod(rows: PlayerGameRow[], ratingFile: RatingFile | null): number | null {
  if (!ratingFile || !rows.length) return null;
  let sum = 0;
  let n = 0;
  for (const row of rows) {
    const v = rateLine(playerRowLine(row), ratingFile);
    if (v != null) {
      sum += v;
      n++;
    }
  }
  return n ? Number((sum / n).toFixed(1)) : null;
}

export const RosterBuilderPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Roster builder"));
  const ratingFile = useRatingFile();
  const q = useMemo(() => new URLSearchParams(query || ""), [query]);
  const thisYear = String(new Date().getFullYear());
  const prevYear = String(Number(thisYear) - 1);
  const rawPeriod = q.get("p") || `y${thisYear}`;
  const period = /^y\d{4}$|^all$|^last\d+$/.test(rawPeriod) ? rawPeriod : `y${thisYear}`;
  const teamSeed = q.get("team") || "";

  const slotSlugs = useMemo(
    () =>
      Object.fromEntries(
        ROSTER_ROLES.map((r) => {
          const val = q.get(ROLE_PARAM[r]) || "";
          return [r, val ? resolvePlayerSlug(val) : ""];
        }),
      ) as Record<RosterRole, string>,
    [q],
  );

  const [loaded, setLoaded] = useState<Record<string, LoadedSlot>>({});
  const [loadingSlug, setLoadingSlug] = useState<Set<string>>(() => new Set());
  const [teamLoading, setTeamLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(query || "");
    for (const [k, v] of Object.entries(updates)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    navigateHub({ kind: "gm", ...(qs ? { query: qs } : {}) }, { replace: true });
  };

  const applyTeamPreset = async (rawTeamSlug: string) => {
    const slug = resolveTeamAlias(rawTeamSlug) || rawTeamSlug;
    setTeamLoading(slug);
    try {
      const t = await loadHubTeam(slug);
      const map = teamStartersByRole(t);
      const updates: Record<string, string | null> = { team: null };
      for (const r of ROSTER_ROLES) updates[ROLE_PARAM[r]] = map[r] || null;
      setParams(updates);
    } catch {
      // ignore missing/unbuilt teams cleanly
    } finally {
      setTeamLoading(null);
    }
  };

  useEffect(() => {
    if (teamSeed && ROSTER_ROLES.every((r) => !slotSlugs[r])) {
      applyTeamPreset(teamSeed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSeed]);

  useEffect(() => {
    const wanted = [...new Set(ROSTER_ROLES.map((r) => slotSlugs[r]).filter(Boolean))];
    const missing = wanted.filter((s) => !loaded[s]);
    if (!missing.length) return;
    let alive = true;
    setLoadingSlug((prev) => new Set([...prev, ...missing]));
    for (const slug of missing) {
      Promise.all([loadHubPlayer(slug), loadPlayerGames(slug).catch(() => [] as PlayerGameRow[])])
        .then(([player, games]) => {
          if (!alive) return;
          setLoaded((prev) => ({ ...prev, [slug]: { slug, player, games } }));
        })
        .catch(() => {})
        .finally(() => {
          if (!alive) return;
          setLoadingSlug((prev) => {
            const next = new Set(prev);
            next.delete(slug);
            return next;
          });
        });
    }
    return () => {
      alive = false;
    };
  }, [slotSlugs, loaded]);

  const roleEntries = useMemo(() => {
    return ROSTER_ROLES.map((role) => {
      const slug = slotSlugs[role];
      const entry = slug ? loaded[slug] : undefined;
      const periodGames = entry ? inPeriod(entry.games, period, playerRowRef) : [];
      const fallbackGames = entry && periodGames.length === 0 ? entry.games : periodGames;
      const agg: PlayerAgg | null = entry && fallbackGames.length > 0 ? playerAgg(fallbackGames) : null;
      const rt = entry ? avgRatingInPeriod(fallbackGames, ratingFile) : null;
      return {
        role,
        slug,
        entry,
        usingCareerFallback: Boolean(entry && period !== "all" && periodGames.length === 0 && entry.games.length > 0),
        periodGames: fallbackGames,
        agg,
        rt,
      };
    });
  }, [slotSlugs, loaded, period, ratingFile]);

  const filledEntries = roleEntries.filter((x) => Boolean(x.entry && x.agg));

  const economy = useMemo(
    () =>
      computeRosterEconomy(
        filledEntries.map((x) => ({
          role: x.role,
          games: x.agg!.g,
          rating: x.rt,
          goldShare: x.agg!.goldShare,
          dmgShare: x.agg!.dmgShare,
          gd15: x.agg!.tl?.gd15 ?? null,
        })),
      ),
    [filledEntries],
  );

  const flexReport = useMemo(
    () =>
      computeRosterFlexes(
        filledEntries.map((x) => ({
          slug: x.slug,
          name: x.entry!.player.name,
          role: x.role,
          champs: x.agg!.champs.map((c) => ({ champ: c.c, games: c.g, wins: c.w })),
        })),
      ),
    [filledEntries],
  );

  const synergyPairs = useMemo(
    () =>
      computeRosterSynergy(
        filledEntries.map((x) => ({
          slug: x.slug,
          name: x.entry!.player.name,
          role: x.role,
          games: x.entry!.games,
        })),
      ),
    [filledEntries],
  );

  const rosterPlayersParam = ROSTER_ROLES.map((r) => slotSlugs[r]).filter(Boolean).join(",");
  const periodLabel = period === "all" ? tl("All time") : period.startsWith("y") ? period.slice(1) : period;
  const shareUrl = hubShareUrl({ kind: "gm", ...(query ? { query } : {}) });

  const copyPost = () => {
    const lines = [
      `${tl("Roster builder")} (${periodLabel})${economy.avgRating != null ? ` · ${fmtRating(economy.avgRating)} (${economy.grade})` : ""}`,
      ...filledEntries.map(
        (x) =>
          `• ${roleName(x.role)}: ${x.entry!.player.name}${x.entry!.player.club ? ` (${x.entry!.player.club})` : ""}${x.rt != null ? ` · ${fmtRating(x.rt)}` : ""}`,
      ),
      shareUrl,
    ];
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-head text-xl font-bold text-rw-text leading-tight">{tl("Roster builder")}</h1>
          <p className="text-[11px] text-rw-muted">
            {tl("Choose any five pro players to check composite form, Gold% and DMG% fit, Fearless flex depth and teammate history.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            [`y${thisYear}`, thisYear],
            [`y${prevYear}`, prevYear],
            ["all", tl("All time")],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setParams({ p: val })}
              aria-pressed={period === val}
              className={`px-2.5 py-1 rounded-lg border font-semibold ${
                period === val ? "border-rw-accent bg-rw-accent/15 text-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick-fill bar */}
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-rw-muted">{tl("Load a club")}</span>
        {PRESET_TEAMS.map((t) => (
          <button
            key={t.slug}
            type="button"
            disabled={teamLoading === t.slug}
            onClick={() => applyTeamPreset(t.slug)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-rw-border bg-rw-bg hover:border-rw-accent text-xs text-rw-text transition-colors"
          >
            <TeamLogo name={t.label} size={14} />
            <span>{t.label}</span>
          </button>
        ))}
        <div className="w-44 min-w-[9rem]">
          <ComparePick kind="team" onPick={(slug) => applyTeamPreset(slug)} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {filledEntries.length >= 2 && (
            <>
              <button
                type="button"
                onClick={copyPost}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? tl("Copied") : tl("Copy post")}
              </button>
              <SectionCard
                section={tl("Roster builder")}
                name={periodLabel}
                sub={economy.avgRating != null ? `${fmtRating(economy.avgRating)} · ${economy.grade}` : undefined}
                rows={() =>
                  filledEntries.map((x, idx) => ({
                    rank: idx + 1,
                    team: x.entry!.player.club,
                    label: `${x.entry!.player.name} · ${roleName(x.role)}`,
                    sub: `${x.agg!.g} ${tl("Games")} · ${Math.round((x.agg!.w / x.agg!.g) * 100)}% WR · ${fmtDec(x.agg!.kda, 1)} KDA`,
                    value: x.rt != null ? fmtRating(x.rt) : "–",
                  }))
                }
              />
              <a
                href={`/overlay?mode=roster&players=${encodeURIComponent(rosterPlayersParam)}&p=${encodeURIComponent(period)}&studio=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rw-accent/50 bg-rw-accent/10 text-rw-accent hover:bg-rw-accent hover:text-rw-bg font-semibold transition-colors"
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                {tl("OBS overlay")} →
              </a>
            </>
          )}
          {ROSTER_ROLES.some((r) => Boolean(slotSlugs[r])) && (
            <button
              type="button"
              onClick={() => setParams({ top: null, jg: null, mid: null, bot: null, sup: null, team: null })}
              className="px-2.5 py-1 rounded-lg border border-rw-border text-rw-muted hover:text-rw-text"
            >
              {tl("Clear")}
            </button>
          )}
        </div>
      </div>

      {/* 5 role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-stretch">
        {roleEntries.map(({ role, slug, entry, agg, rt, periodGames, usingCareerFallback }) => {
          const isBusy = Boolean(slug && loadingSlug.has(slug));
          const wr = agg && agg.g ? Math.round((agg.w / agg.g) * 100) : null;
          return (
            <div key={role} className={`${card} flex flex-col gap-2 min-w-0`}>
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-rw-border/70">
                <span className="text-[11px] font-head font-bold uppercase tracking-wider text-rw-accent">{roleName(role)}</span>
                {slug && (
                  <button
                    type="button"
                    onClick={() => setParams({ [ROLE_PARAM[role]]: null })}
                    aria-label={tl("Clear")}
                    className="text-rw-muted hover:text-rw-red p-0.5 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {!slug && <ComparePick kind="player" onPick={(picked) => setParams({ [ROLE_PARAM[role]]: picked })} />}

              {slug && isBusy && !entry && (
                <div className="py-6 text-center text-xs text-rw-muted">{tl("Loading…")}</div>
              )}

              {entry && (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <PlayerPhoto name={entry.player.name} team={entry.player.club} slug={entry.slug} img={entry.player.img} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <PlayerLink name={entry.player.name} u={entry.slug} className="font-bold text-sm text-rw-text hover:text-rw-accent truncate" />
                        {rt != null && <RatingBadge v={rt} />}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-rw-sub truncate">
                        {entry.player.club && <TeamLogo name={entry.player.club} size={13} />}
                        {entry.player.club ? (
                          <TeamLink name={entry.player.club} u={entry.player.clubU} className="hover:text-rw-accent truncate" />
                        ) : (
                          <span>{tl("Free agent")}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {entry.player.bio.contract && (
                    <div className="text-[10px] text-rw-muted">
                      <span className="inline-block px-1.5 py-0.5 rounded border border-rw-border bg-rw-bg/60">
                        {tl("Contract until {date}", { date: fmtDate(entry.player.bio.contract) })}
                      </span>
                    </div>
                  )}

                  {agg ? (
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] pt-1 border-t border-rw-border/60 tabular-nums">
                      <div className="text-rw-muted">{tl("Games")}</div>
                      <div className="text-right font-semibold text-rw-text">
                        {fmtNum(periodGames.length)}
                        {wr != null ? ` (${wr}%)` : ""}
                        {usingCareerFallback ? " *" : ""}
                      </div>
                      <div className="text-rw-muted">KDA</div>
                      <div className="text-right font-semibold text-rw-text">{fmtDec(agg.kda, 1)}</div>
                      <div className="text-rw-muted">DPM</div>
                      <div className="text-right text-rw-sub">{agg.dpm != null ? fmtNum(agg.dpm) : "–"}</div>
                      <div className="text-rw-muted">Gold%</div>
                      <div className="text-right text-rw-sub">{agg.goldShare != null ? `${fmtDec(agg.goldShare, 1)}%` : "–"}</div>
                      <div className="text-rw-muted">DMG%</div>
                      <div className="text-right text-rw-sub">{agg.dmgShare != null ? `${fmtDec(agg.dmgShare, 1)}%` : "–"}</div>
                      <div className="text-rw-muted">GD@15</div>
                      <div className={`text-right font-semibold ${(agg.tl?.gd15 || 0) > 0 ? "text-rw-teal" : (agg.tl?.gd15 || 0) < 0 ? "text-rw-red" : "text-rw-sub"}`}>
                        {agg.tl?.gd15 != null ? `${agg.tl.gd15 > 0 ? "+" : ""}${fmtNum(agg.tl.gd15)}` : "–"}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-rw-muted">{tl("No games recorded.")}</p>
                  )}

                  {agg && agg.champs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1 mt-auto">
                      {agg.champs.slice(0, 4).map((c) => (
                        <HubLink
                          key={c.c}
                          to={{ kind: "champ", slug: resolveChampSlug(c.c) }}
                          title={`${c.c}: ${c.g} (${Math.round((c.w / c.g) * 100)}%)`}
                          className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-rw-bg border border-rw-border/70 text-[10px] text-rw-sub hover:border-rw-accent"
                        >
                          <ChampIcon name={c.c} size={15} />
                          <span className="tabular-nums">{c.g}</span>
                        </HubLink>
                      ))}
                    </div>
                  )}

                  <div className="pt-1 border-t border-rw-border/50">
                    <ComparePick kind="player" onPick={(picked) => setParams({ [ROLE_PARAM[role]]: picked })} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Diagnostic panels */}
      {filledEntries.length >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 1. Rating & Economy Fit */}
          <section className={`${card} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-rw-text flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-rw-accent" />
                {tl("Rating & resource fit")}
              </h2>
              {economy.avgRating != null && (
                <div className="inline-flex items-center gap-1.5">
                  <RatingBadge v={economy.avgRating} />
                  {economy.grade && (
                    <span className="px-1.5 py-0.5 rounded bg-rw-accent/15 border border-rw-accent/40 text-rw-accent font-head font-bold text-xs">
                      {economy.grade}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-rw-muted">{tl("Combined Gold%")}</span>
                <span className="font-num font-bold text-rw-text">
                  {economy.totalGoldShare != null ? `${fmtDec(economy.totalGoldShare, 1)}%` : "–"}
                </span>
              </div>
              {economy.totalGoldShare != null && (
                <div className="h-2 rounded-full bg-rw-bg border border-rw-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      economy.economyStatus === "balanced"
                        ? "bg-rw-teal"
                        : economy.economyStatus === "greedy"
                          ? "bg-rw-red"
                          : "bg-rw-gold"
                    }`}
                    style={{ width: `${Math.min(100, (economy.totalGoldShare / 120) * 100)}%` }}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-rw-muted">{tl("Combined DMG%")}</span>
                <span className="font-num font-bold text-rw-text">
                  {economy.totalDmgShare != null ? `${fmtDec(economy.totalDmgShare, 1)}%` : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-rw-muted">{tl("Combined GD@15")}</span>
                <span
                  className={`font-num font-bold ${(economy.sumGd15 || 0) > 0 ? "text-rw-teal" : (economy.sumGd15 || 0) < 0 ? "text-rw-red" : "text-rw-sub"}`}
                >
                  {economy.sumGd15 != null ? `${economy.sumGd15 > 0 ? "+" : ""}${fmtNum(economy.sumGd15)}` : "–"}
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-rw-border/60 text-[11px]">
              {economy.economyStatus === "balanced" && (
                <p className="text-rw-teal flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{tl("Balanced gold economy (near 100% combined Gold%). Carries and low-econ roles fit together.")}</span>
                </p>
              )}
              {economy.economyStatus === "greedy" && (
                <p className="text-rw-gold flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{tl("Resource-heavy lineup (>103.5% combined Gold%). Multiple players expect heavy funnel and wave priority.")}</span>
                </p>
              )}
              {economy.economyStatus === "low-econ" && (
                <p className="text-rw-sub flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rw-muted" />
                  <span>{tl("Low-economy lineup (<97% combined Gold%). Heavy utility profile with room for a primary carry.")}</span>
                </p>
              )}
              {economy.economyStatus === "incomplete" && (
                <p className="text-rw-muted">{tl("Fill all 5 roles with scoreboard stats to check full Gold% resource balance.")}</p>
              )}
            </div>
          </section>

          {/* 2. Bo5 Fearless & Flex Pick Matrix */}
          <section className={`${card} space-y-3`}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rw-text flex items-center gap-1.5">
              <Swords className="w-3.5 h-3.5 text-rw-accent" />
              {tl("Bo5 Fearless & flex depth")}
            </h2>
            {flexReport.flexPicks.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[11px] text-rw-muted">{tl("Multi-role flex picks (3+ games by two or more members)")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {flexReport.flexPicks.slice(0, 10).map((f) => (
                    <HubLink
                      key={f.champ}
                      to={{ kind: "champ", slug: resolveChampSlug(f.champ) }}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rw-bg border border-rw-border hover:border-rw-accent text-[11px]"
                    >
                      <ChampIcon name={f.champ} size={18} />
                      <span className="font-semibold text-rw-text">{f.champ}</span>
                      <span className="text-rw-muted">
                        ({f.members.map((m) => `${roleName(m.role)}: ${m.games}`).join(" · ")})
                      </span>
                    </HubLink>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-rw-muted">{tl("No shared multi-role flex champions with 3+ games yet in this period.")}</p>
            )}
            <div className="pt-2 border-t border-rw-border/60 text-[11px]">
              {flexReport.shallowPools.length > 0 ? (
                <p className="text-rw-gold flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {tl("Fearless pinch watch (<5 picks with 2+ games):")}{" "}
                    {flexReport.shallowPools.map((s) => `${s.name} (${s.usableCount})`).join(", ")}
                  </span>
                </p>
              ) : (
                <p className="text-rw-teal flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{tl("All filled roles have 5+ proven champions (2+ games) for deep Bo5 Fearless drafts.")}</span>
                </p>
              )}
            </div>
          </section>

          {/* 3. Teammate Chemistry Matrix */}
          <section className={`${card} space-y-3`}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rw-text flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-rw-accent" />
              {tl("Teammate chemistry")}
            </h2>
            {synergyPairs.length > 0 ? (
              <STable className="w-full text-xs">
                <thead>
                  <tr className="border-b border-rw-border">
                    <th className={th}>{tl("Pair")}</th>
                    <th className={`${th} text-right`}>{tl("Games")}</th>
                    <th className={`${th} text-right`}>{tl("Win%")}</th>
                  </tr>
                </thead>
                <tbody>
                  {synergyPairs.slice(0, 10).map((pair) => (
                    <tr key={`${pair.a.slug}-${pair.b.slug}`} className="border-b border-rw-border/60">
                      <td className={td}>
                        <PlayerLink name={pair.a.name} u={pair.a.slug} className="font-semibold text-rw-text hover:text-rw-accent" />
                        <span className="text-rw-muted"> + </span>
                        <PlayerLink name={pair.b.name} u={pair.b.slug} className="font-semibold text-rw-text hover:text-rw-accent" />
                      </td>
                      <td className={`${td} text-right tabular-nums text-rw-sub`}>{fmtNum(pair.games)}</td>
                      <td className={`${td} text-right tabular-nums font-semibold ${pair.winPct >= 55 ? "text-rw-teal" : pair.winPct < 45 ? "text-rw-red" : "text-rw-text"}`}>
                        {fmtDec(pair.winPct, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </STable>
            ) : (
              <p className="text-[11px] text-rw-muted">{tl("None of these selected players have shared an official pro match together yet.")}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
