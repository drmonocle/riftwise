/**
 * Pro Roster & Superteam Simulator (/stats/gm): pick any five pro players (or seed from an existing club) and evaluate
 * composite 0-10 rating, Gold% and DMG% economy balance, early-game lane delta, Bo5 Fearless pool depth + multi-role
 * flex picks, and historical teammate chemistry. Shareable via URL (?top=&jg=&mid=&bot=&sup=&p=y2026) and OBS overlay.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, GitCompare, MonitorPlay, Sparkles, Swords, Users, X } from "lucide-react";
import { tl, roleName, fmtDec } from "../../i18n";
import { MissingFile } from "../../stats";
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
import { BASE, navigateHub, hubShareUrl } from "../../hub/route";
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

/** Resolve a club's 5-role lineup for a target period (`y2025`, `all`, etc.), preferring that season's most-played starter per role. */
export function teamLineupForPeriod(team: HubTeam, period: string): Partial<Record<RosterRole, string>> {
  const out: Partial<Record<RosterRole, string>> = {};
  const ym = /^y(\d{4})$/.exec(period);
  if (ym) {
    const yr = team.roster?.find((x) => x.y === ym[1]);
    if (yr?.p?.length) {
      for (const m of [...yr.p].sort((a, b) => b.g - a.g)) {
        const r = normalizeRole(m.r || "") as RosterRole | null;
        if (r && !out[r]) out[r] = m.u || resolvePlayerSlug(m.n);
      }
    }
  }
  const starters = teamStartersByRole(team);
  for (const r of ROSTER_ROLES) {
    if (!out[r] && starters[r]) out[r] = starters[r];
  }
  return out;
}

export interface RosterDeltaSlotInput {
  role: RosterRole;
  slug: string;
  name: string;
  games: number;
  rating: number | null;
  kda: number | null;
  dpm: number | null;
  goldShare: number | null;
  gd15: number | null;
}

export type RosterDeltaVerdict = "upgrade" | "downgrade" | "sidegrade" | "unchanged" | "incomplete";

export interface RosterDeltaRow {
  role: RosterRole;
  current: RosterDeltaSlotInput | null;
  baseline: RosterDeltaSlotInput | null;
  dRating: number | null;
  dKda: number | null;
  dDpm: number | null;
  dGoldShare: number | null;
  dGd15: number | null;
  verdict: RosterDeltaVerdict;
}

export interface RosterDeltaSummary {
  rows: RosterDeltaRow[];
  comparedRoles: number;
  upgrades: number;
  downgrades: number;
  sidegrades: number;
  currAvgRating: number | null;
  baseAvgRating: number | null;
  netRatingDelta: number | null;
  netGd15Delta: number | null;
  netGoldShareDelta: number | null;
}

const cleanZero = (n: number) => (Object.is(n, -0) ? 0 : n);

/** Compare proposed 5-role slots against a baseline lineup across ratings, KDA, DPM, Gold%, and GD@15. */
export function computeRosterDelta(
  current: Partial<Record<RosterRole, RosterDeltaSlotInput | null>>,
  baseline: Partial<Record<RosterRole, RosterDeltaSlotInput | null>>,
  samePeriod = false,
): RosterDeltaSummary {
  const rows: RosterDeltaRow[] = ROSTER_ROLES.map((role) => {
    const curr = current[role] ?? null;
    const base = baseline[role] ?? null;
    const dRating = curr?.rating != null && base?.rating != null ? cleanZero(Number((curr.rating - base.rating).toFixed(1))) : null;
    const dKda = curr?.kda != null && base?.kda != null ? cleanZero(Number((curr.kda - base.kda).toFixed(2))) : null;
    const dDpm = curr?.dpm != null && base?.dpm != null ? cleanZero(Math.round(curr.dpm - base.dpm)) : null;
    const dGoldShare =
      curr?.goldShare != null && base?.goldShare != null ? cleanZero(Number((curr.goldShare - base.goldShare).toFixed(1))) : null;
    const dGd15 = curr?.gd15 != null && base?.gd15 != null ? cleanZero(Math.round(curr.gd15 - base.gd15)) : null;
    let verdict: RosterDeltaVerdict = "incomplete";
    if (curr && base) {
      if (samePeriod && curr.slug === base.slug) verdict = "unchanged";
      else if (dRating != null) verdict = dRating >= 0.25 ? "upgrade" : dRating <= -0.25 ? "downgrade" : "sidegrade";
      else if (dKda != null) verdict = dKda >= 0.5 ? "upgrade" : dKda <= -0.5 ? "downgrade" : "sidegrade";
      else verdict = "sidegrade";
    }
    return { role, current: curr, baseline: base, dRating, dKda, dDpm, dGoldShare, dGd15, verdict };
  });

  const compared = rows.filter((r) => r.current && r.baseline);
  const ratedPairs = compared.filter((r) => r.current!.rating != null && r.baseline!.rating != null);
  const currAvgRating = ratedPairs.length
    ? Number((ratedPairs.reduce((s, r) => s + r.current!.rating!, 0) / ratedPairs.length).toFixed(1))
    : null;
  const baseAvgRating = ratedPairs.length
    ? Number((ratedPairs.reduce((s, r) => s + r.baseline!.rating!, 0) / ratedPairs.length).toFixed(1))
    : null;
  const netRatingDelta = ratedPairs.length
    ? cleanZero(Number((ratedPairs.reduce((s, r) => s + (r.current!.rating! - r.baseline!.rating!), 0) / ratedPairs.length).toFixed(1)))
    : null;
  const gdRows = compared.filter((r) => r.dGd15 != null);
  const netGd15Delta = gdRows.length ? cleanZero(gdRows.reduce((s, r) => s + r.dGd15!, 0)) : null;
  const goldRows = compared.filter((r) => r.dGoldShare != null);
  const netGoldShareDelta = goldRows.length
    ? cleanZero(Number(goldRows.reduce((s, r) => s + r.dGoldShare!, 0).toFixed(1)))
    : null;

  return {
    rows,
    comparedRoles: compared.length,
    upgrades: compared.filter((r) => r.verdict === "upgrade").length,
    downgrades: compared.filter((r) => r.verdict === "downgrade").length,
    sidegrades: compared.filter((r) => r.verdict === "sidegrade").length,
    currAvgRating,
    baseAvgRating,
    netRatingDelta,
    netGd15Delta,
    netGoldShareDelta,
  };
}

export function avgRatingInPeriod(rows: PlayerGameRow[], ratingFile: RatingFile | null): number | null {
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
  const prev2Year = String(Number(thisYear) - 2);
  const rawPeriod = q.get("p") || `y${thisYear}`;
  const period = /^y\d{4}$|^all$|^last\d+$/.test(rawPeriod) ? rawPeriod : `y${thisYear}`;
  const teamSeed = q.get("team") || "";
  const rawVs = q.get("vs") || "";
  const vsSlug = rawVs ? resolveTeamAlias(rawVs) || rawVs : "";
  const defaultVp = period === `y${thisYear}` ? `y${prevYear}` : period;
  const rawVp = q.get("vp") || "";
  const vp = /^y\d{4}$|^all$|^last\d+$/.test(rawVp) ? rawVp : defaultVp;

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
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const inFlightRef = useRef<Set<string>>(new Set());
  const [loadingSlug, setLoadingSlug] = useState<Set<string>>(() => new Set());
  const [teamLoading, setTeamLoading] = useState<string | null>(null);
  const [baselineTeam, setBaselineTeam] = useState<{ slug: string; team: HubTeam } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!vsSlug) {
      setBaselineTeam(null);
      return;
    }
    let alive = true;
    loadHubTeam(vsSlug)
      .then((team) => {
        if (alive) setBaselineTeam({ slug: vsSlug, team });
      })
      .catch(() => {
        if (alive) setBaselineTeam(null);
      });
    return () => {
      alive = false;
    };
  }, [vsSlug]);

  const baseSlugs = useMemo(
    () => (baselineTeam && baselineTeam.slug === vsSlug ? teamLineupForPeriod(baselineTeam.team, vp) : {}),
    [baselineTeam, vsSlug, vp],
  );

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
    const wanted = [
      ...new Set([...ROSTER_ROLES.map((r) => slotSlugs[r]), ...ROSTER_ROLES.map((r) => baseSlugs[r] || "")].filter(Boolean)),
    ];
    const toFetch = wanted.filter((s) => !loadedRef.current[s] && !inFlightRef.current.has(s));
    if (!toFetch.length) return;
    for (const s of toFetch) inFlightRef.current.add(s);
    setLoadingSlug((prev) => new Set([...prev, ...toFetch]));
    for (const slug of toFetch) {
      Promise.all([
        loadHubPlayer(slug),
        loadPlayerGames(slug).catch((err) => {
          if (err instanceof MissingFile) return [] as PlayerGameRow[];
          throw err;
        }),
      ])
        .then(([player, games]) => {
          setLoaded((prev) => ({ ...prev, [slug]: { slug, player, games } }));
        })
        .catch(() => {})
        .finally(() => {
          inFlightRef.current.delete(slug);
          setLoadingSlug((prev) => {
            const next = new Set(prev);
            next.delete(slug);
            return next;
          });
        });
    }
  }, [slotSlugs, baseSlugs]);

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

  const dominantClub = useMemo(() => {
    const counts = new Map<string, { slug: string; name: string; n: number }>();
    for (const x of filledEntries) {
      const cu = x.entry?.player.clubU || (x.entry?.player.club ? resolveTeamAlias(x.entry.player.club) : "");
      if (!cu || !x.entry?.player.club) continue;
      const cur = counts.get(cu) || { slug: cu, name: x.entry.player.club, n: 0 };
      cur.n++;
      counts.set(cu, cur);
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    return top && top.n >= 2 ? top : null;
  }, [filledEntries]);

  const baseEntries = useMemo(() => {
    return Object.fromEntries(
      ROSTER_ROLES.map((role) => {
        const slug = baseSlugs[role] || "";
        const entry = slug ? loaded[slug] : undefined;
        if (!entry) return [role, null];
        const periodGames = inPeriod(entry.games, vp, playerRowRef);
        const fallbackGames = periodGames.length === 0 ? entry.games : periodGames;
        const agg: PlayerAgg | null = fallbackGames.length > 0 ? playerAgg(fallbackGames) : null;
        if (!agg) return [role, null];
        const rt = avgRatingInPeriod(fallbackGames, ratingFile);
        const slot: RosterDeltaSlotInput = {
          role,
          slug,
          name: entry.player.name,
          games: agg.g,
          rating: rt,
          kda: agg.kda,
          dpm: agg.dpm,
          goldShare: agg.goldShare,
          gd15: agg.tl?.gd15 ?? null,
        };
        return [role, slot];
      }),
    ) as Partial<Record<RosterRole, RosterDeltaSlotInput | null>>;
  }, [baseSlugs, loaded, vp, ratingFile]);

  const currentDeltaMap = useMemo(
    () =>
      Object.fromEntries(
        roleEntries.map((x) => [
          x.role,
          x.entry && x.agg
            ? {
                role: x.role,
                slug: x.slug,
                name: x.entry.player.name,
                games: x.agg.g,
                rating: x.rt,
                kda: x.agg.kda,
                dpm: x.agg.dpm,
                goldShare: x.agg.goldShare,
                gd15: x.agg.tl?.gd15 ?? null,
              }
            : null,
        ]),
      ) as Partial<Record<RosterRole, RosterDeltaSlotInput | null>>,
    [roleEntries],
  );

  const deltaSummary = useMemo(
    () => computeRosterDelta(currentDeltaMap, baseEntries, period === vp),
    [currentDeltaMap, baseEntries, period, vp],
  );
  const vpLabel = vp === "all" ? tl("All time") : vp.startsWith("y") ? vp.slice(1) : vp;

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
  const reportUrl = useMemo(() => {
    const p = new URLSearchParams({ mode: "report", p: period });
    if (ROSTER_ROLES.every((r) => Boolean(slotSlugs[r]))) {
      p.set("players", ROSTER_ROLES.map((r) => slotSlugs[r]).join(","));
    } else {
      for (const r of ROSTER_ROLES) {
        if (slotSlugs[r]) p.set(ROLE_PARAM[r], slotSlugs[r]);
      }
    }
    if (vsSlug) {
      p.set("team", vsSlug);
      p.set("vs", vsSlug);
      p.set("vp", vp);
    } else if (teamSeed) {
      p.set("team", resolveTeamAlias(teamSeed) || teamSeed);
    }
    return `${BASE}embed?${p.toString()}`;
  }, [period, slotSlugs, vsSlug, vp, teamSeed]);

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
                href={`${BASE}embed?mode=roster&players=${encodeURIComponent(rosterPlayersParam)}&p=${encodeURIComponent(period)}&studio=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rw-accent/50 bg-rw-accent/10 text-rw-accent hover:bg-rw-accent hover:text-rw-bg font-semibold transition-colors"
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                {tl("Embed / OBS")} →
              </a>
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rw-teal/50 bg-rw-teal/10 text-rw-teal hover:bg-rw-teal hover:text-rw-bg font-semibold transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {tl("Report card")} →
              </a>
            </>
          )}
          {ROSTER_ROLES.some((r) => Boolean(slotSlugs[r])) && (
            <button
              type="button"
              onClick={() => setParams({ top: null, jg: null, mid: null, bot: null, sup: null, team: null, vs: null, vp: null })}
              className="px-2.5 py-1 rounded-lg border border-rw-border text-rw-muted hover:text-rw-text"
            >
              {tl("Clear")}
            </button>
          )}
        </div>
        <div className="w-full pt-2 mt-1 border-t border-rw-border/60 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rw-muted">{tl("Compare vs club")}</span>
          {dominantClub && vsSlug !== dominantClub.slug && (
            <button
              type="button"
              onClick={() => setParams({ vs: dominantClub.slug, vp: `y${prevYear}` })}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rw-accent/60 bg-rw-accent/10 hover:bg-rw-accent hover:text-rw-bg text-xs text-rw-accent font-semibold transition-colors"
            >
              <TeamLogo name={dominantClub.name} size={14} />
              <span>{dominantClub.name} ({prevYear})</span>
            </button>
          )}
          {PRESET_TEAMS.map((t) => (
            <button
              key={`vs-${t.slug}`}
              type="button"
              onClick={() => setParams({ vs: t.slug })}
              aria-pressed={vsSlug === t.slug}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-colors ${
                vsSlug === t.slug
                  ? "border-rw-accent bg-rw-accent/15 text-rw-accent font-semibold"
                  : "border-rw-border bg-rw-bg text-rw-sub hover:border-rw-accent hover:text-rw-text"
              }`}
            >
              <TeamLogo name={t.label} size={14} />
              <span>{t.label}</span>
            </button>
          ))}
          <div className="w-44 min-w-[9rem]">
            <ComparePick kind="team" onPick={(slug) => setParams({ vs: resolveTeamAlias(slug) || slug })} />
          </div>
          {vsSlug && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
              {[
                [`y${thisYear}`, thisYear],
                [`y${prevYear}`, prevYear],
                [`y${prev2Year}`, prev2Year],
                ["all", tl("All time")],
              ].map(([val, label]) => (
                <button
                  key={`vp-${val}`}
                  type="button"
                  onClick={() => setParams({ vp: val })}
                  aria-pressed={vp === val}
                  className={`px-2 py-0.5 rounded-lg border font-semibold ${
                    vp === val ? "border-rw-teal bg-rw-teal/15 text-rw-teal" : "border-rw-border text-rw-sub hover:text-rw-text"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setParams({ vs: null, vp: null })}
                className="px-2 py-0.5 rounded-lg border border-rw-border text-rw-muted hover:text-rw-text"
              >
                {tl("Clear")}
              </button>
            </div>
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

      {/* Split-to-split / baseline club roster delta table */}
      {vsSlug && filledEntries.length >= 1 && (
        <section className={`${card} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <GitCompare className="w-4 h-4 text-rw-accent" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-rw-text">
                {tl("Roster delta vs baseline")}
              </h2>
              {baselineTeam && baselineTeam.slug === vsSlug ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rw-sub">
                  <TeamLogo name={baselineTeam.team.name} code={baselineTeam.team.codes?.[0]} size={16} />
                  <TeamLink name={baselineTeam.team.name} u={baselineTeam.slug} className="hover:text-rw-accent" />
                  <span>({vpLabel})</span>
                </span>
              ) : (
                <span className="text-xs text-rw-muted">{tl("Loading…")}</span>
              )}
            </div>
            {deltaSummary.comparedRoles > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
                {deltaSummary.netRatingDelta != null && (
                  <span
                    className={`px-2 py-0.5 rounded-full border font-semibold ${
                      deltaSummary.netRatingDelta > 0
                        ? "border-rw-teal/50 bg-rw-teal/15 text-rw-teal"
                        : deltaSummary.netRatingDelta < 0
                          ? "border-rw-red/50 bg-rw-red/15 text-rw-red"
                          : "border-rw-border text-rw-sub"
                    }`}
                  >
                    Δ {tl("Rating")}: {deltaSummary.netRatingDelta > 0 ? `+${fmtDec(deltaSummary.netRatingDelta, 1)}` : fmtDec(deltaSummary.netRatingDelta, 1)}
                  </span>
                )}
                {deltaSummary.netGd15Delta != null && (
                  <span
                    className={`px-2 py-0.5 rounded-full border font-semibold ${
                      deltaSummary.netGd15Delta > 0
                        ? "border-rw-teal/50 bg-rw-teal/15 text-rw-teal"
                        : deltaSummary.netGd15Delta < 0
                          ? "border-rw-red/50 bg-rw-red/15 text-rw-red"
                          : "border-rw-border text-rw-sub"
                    }`}
                  >
                    Δ GD@15: {deltaSummary.netGd15Delta > 0 ? `+${fmtNum(deltaSummary.netGd15Delta)}` : fmtNum(deltaSummary.netGd15Delta)}
                  </span>
                )}
                <span className="text-rw-sub">
                  <span className="text-rw-teal font-semibold">{deltaSummary.upgrades} {tl("Upgrade")}</span>
                  {" · "}
                  <span className="text-rw-red font-semibold">{deltaSummary.downgrades} {tl("Downgrade")}</span>
                  {" · "}
                  <span className="text-rw-gold font-semibold">{deltaSummary.sidegrades} {tl("Sidegrade")}</span>
                </span>
              </div>
            )}
          </div>

          <STable className="w-full text-xs">
            <thead>
              <tr className="border-b border-rw-border">
                <th className={th}>{tl("Role")}</th>
                <th className={th}>{tl("Proposed")} ({periodLabel})</th>
                <th className={th}>{tl("Baseline")} ({vpLabel})</th>
                <th className={`${th} text-right`}>Δ {tl("Rating")}</th>
                <th className={`${th} text-right`}>Δ KDA</th>
                <th className={`${th} text-right max-sm:hidden`}>Δ DPM</th>
                <th className={`${th} text-right`}>Δ GD@15</th>
                <th className={`${th} text-right max-md:hidden`}>Δ Gold%</th>
                <th className={`${th} text-right`}>{tl("Result")}</th>
              </tr>
            </thead>
            <tbody>
              {deltaSummary.rows.map((row) => {
                const signedTone = (v: number | null) =>
                  v == null || v === 0 ? "text-rw-muted" : v > 0 ? "text-rw-teal font-semibold" : "text-rw-red font-semibold";
                const verdictPill =
                  row.verdict === "upgrade"
                    ? "border-rw-teal/50 bg-rw-teal/15 text-rw-teal"
                    : row.verdict === "downgrade"
                      ? "border-rw-red/50 bg-rw-red/15 text-rw-red"
                      : row.verdict === "sidegrade"
                        ? "border-rw-gold/50 bg-rw-gold/15 text-rw-gold"
                        : "border-rw-border text-rw-muted";
                const verdictLabel =
                  row.verdict === "upgrade"
                    ? tl("Upgrade")
                    : row.verdict === "downgrade"
                      ? tl("Downgrade")
                      : row.verdict === "sidegrade"
                        ? tl("Sidegrade")
                        : row.verdict === "unchanged"
                          ? tl("Unchanged")
                          : "–";
                return (
                  <tr key={`delta-${row.role}`} className="border-b border-rw-border/60">
                    <td className={`${td} font-semibold text-rw-accent`}>{roleName(row.role)}</td>
                    <td className={td}>
                      {row.current ? (
                        <span className="inline-flex items-center gap-1.5">
                          <PlayerLink name={row.current.name} u={row.current.slug} className="font-semibold text-rw-text hover:text-rw-accent" />
                          {row.current.rating != null && <RatingBadge v={row.current.rating} />}
                        </span>
                      ) : (
                        <span className="text-rw-muted">–</span>
                      )}
                    </td>
                    <td className={td}>
                      {row.baseline ? (
                        <span className="inline-flex items-center gap-1.5">
                          <PlayerLink name={row.baseline.name} u={row.baseline.slug} className="text-rw-sub hover:text-rw-accent" />
                          {row.baseline.rating != null && <RatingBadge v={row.baseline.rating} />}
                        </span>
                      ) : (
                        <span className="text-rw-muted">–</span>
                      )}
                    </td>
                    <td className={`${td} text-right tabular-nums ${signedTone(row.dRating)}`}>
                      {row.dRating == null ? "–" : `${row.dRating > 0 ? "+" : ""}${fmtDec(row.dRating, 1)}`}
                    </td>
                    <td className={`${td} text-right tabular-nums ${signedTone(row.dKda)}`}>
                      {row.dKda == null ? "–" : `${row.dKda > 0 ? "+" : ""}${fmtDec(row.dKda, 2)}`}
                    </td>
                    <td className={`${td} text-right tabular-nums max-sm:hidden ${signedTone(row.dDpm)}`}>
                      {row.dDpm == null ? "–" : `${row.dDpm > 0 ? "+" : ""}${fmtNum(row.dDpm)}`}
                    </td>
                    <td className={`${td} text-right tabular-nums ${signedTone(row.dGd15)}`}>
                      {row.dGd15 == null ? "–" : `${row.dGd15 > 0 ? "+" : ""}${fmtNum(row.dGd15)}`}
                    </td>
                    <td className={`${td} text-right tabular-nums max-md:hidden text-rw-sub`}>
                      {row.dGoldShare == null ? "–" : `${row.dGoldShare > 0 ? "+" : ""}${fmtDec(row.dGoldShare, 1)}%`}
                    </td>
                    <td className={`${td} text-right`}>
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${verdictPill}`}>
                        {verdictLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </STable>
        </section>
      )}
    </div>
  );
};
