/**
 * Pro tier list: what pro teams actually play, by role, on one patch (or a year, or all time): each champion in its
 * main role, placed by its presence (picked or banned, share of games) nudged by its win rate once it has 10+
 * picks. From the same files as the Champions page (champions/<key>.json, top leagues or all leagues).
 * Address: /stats/tiers?key=p26.20&scope=all&role=Mid
 */
import React, { useMemo } from "react";
import { tl, roleName, fmtDec } from "../../i18n";
import { champName } from "../../champions";
import { ChampRow, ChampionStats, StatsMeta, loadChampionStats } from "../../stats";
import { navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { ROLES, champAgg } from "../../hub/champAgg";
import { card, ChampIcon, HubLink, Loading, Section, useLoad, usePageTitle } from "./ui";
import { loadChampGames, loadChampIndex, prettySlug } from "../../hub/data";

const TIERS: { t: string; min: number; color: string }[] = [
  { t: "S", min: 40, color: "#ff6b81" },
  { t: "A", min: 25, color: "#ffa94d" },
  { t: "B", min: 12, color: "#ffd43b" },
  { t: "C", min: 5, color: "#69db7c" },
  { t: "D", min: -Infinity, color: "#74c0fc" },
];

type Ranked = ChampRow & { presence: number; wr: number | null; score: number };

/** presence in points, plus up to ±10 for the win rate (full weight from 30 picks, none under 10) */
export function tierScore(c: ChampRow, games: number): number {
  const presence = games ? Math.min(1, (c.p + c.b) / games) * 100 : 0;
  if (c.p < 10) return presence;
  const wr = c.w / c.p;
  return presence + Math.max(-10, Math.min(10, (wr - 0.5) * 100)) * Math.min(1, c.p / 30);
}

export const tierOf = (score: number) => TIERS.find((x) => score >= x.min)!;

export const TiersPage: React.FC<{ meta: StatsMeta; query?: string }> = ({ meta, query }) => {
  usePageTitle(tl("Pro tier list"));
  useDDragon();
  const q = new URLSearchParams(query || "");
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query || "");
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    navigateHub({ kind: "tiers", query: next.toString() }, { replace: true });
  };
  const patchKeys = meta.champions.filter((k) => k.startsWith("p"));
  const key = q.get("key") && meta.champions.includes(q.get("key")!) ? q.get("key")! : patchKeys[0] || meta.champions[0];
  const rawScope = q.get("league") || q.get("scope") || "major";
  const isLeague = rawScope !== "major" && rawScope !== "all";
  const scope: "major" | "all" = rawScope === "all" ? "all" : "major";
  const role = ROLES.includes(q.get("role") || "") ? q.get("role")! : "";
  const index = useLoad(loadChampIndex, []);
  const leagues = index.data || [];
  const mainLeagues = leagues.filter((l) => l.pr);
  const otherLeagues = leagues.filter((l) => !l.pr && Object.values(l.y).reduce((s, n) => s + n, 0) >= 100);
  const state = useLoad<ChampionStats>(() => (isLeague ? Promise.resolve({ games: 0, all: { games: 0, champs: [] }, major: { games: 0, champs: [] } }) : loadChampionStats(key)), [key, isLeague]);
  const lgBlock = useLoad(
    () => {
      if (!isLeague) return Promise.resolve(null);
      const lg = leagues.find((l) => l.u === rawScope);
      const availYears = Object.keys(lg?.y || {}).sort().reverse();
      if (!availYears.length) return Promise.resolve({ games: 0, champs: [] as ChampRow[] });
      let targetYears: string[] = [];
      let patchFilter: string | undefined;
      if (key.startsWith("y")) {
        const y = key.slice(1);
        targetYears = availYears.includes(y) ? [y] : [];
      } else if (key.startsWith("p")) {
        patchFilter = key.slice(1);
        const majorNum = Number(patchFilter.split(".")[0]);
        const guessedYear = String(majorNum >= 25 ? 2000 + majorNum : 2010 + majorNum);
        targetYears = Array.from(new Set([guessedYear, ...availYears.slice(0, 2)])).filter((y) => availYears.includes(y));
      } else {
        targetYears = availYears;
      }
      if (!targetYears.length) return Promise.resolve({ games: 0, champs: [] as ChampRow[] });
      return Promise.all(targetYears.map((y) => loadChampGames(rawScope, y))).then((files) => {
        const allGames = files.flatMap((f) => f.games);
        const agg = champAgg(allGames, { patch: patchFilter });
        const champs: ChampRow[] = agg.rows.map((r) => ({
          c: r.c,
          role: r.role >= 0 ? ROLES[r.role] : "",
          p: r.p,
          w: r.w,
          b: r.b,
          kda: r.kda ?? 0,
          csm: r.csm,
          gpm: r.gpm,
          dpm: r.dpm,
        }));
        return { games: agg.games, champs };
      });
    },
    [isLeague, rawScope, key, leagues.length],
  );
  const block = isLeague ? lgBlock.data : state.data?.[scope] || state.data?.all;

  const byRole = useMemo(() => {
    const out = new Map<string, Ranked[]>(ROLES.map((r) => [r, []]));
    if (!block) return out;
    for (const c of block.champs) {
      if (!c.role || !out.has(c.role) || c.p + c.b < 2) continue;
      out.get(c.role)!.push({ ...c, presence: block.games ? (c.p + c.b) / block.games : 0, wr: c.p ? c.w / c.p : null, score: tierScore(c, block.games) });
    }
    for (const list of out.values()) list.sort((a, b) => b.score - a.score);
    return out;
  }, [block]);

  const label = (k: string) =>
    k === "all" ? tl("All time (2011 to today)") : k.startsWith("p") ? tl("Patch {patch}", { patch: k.slice(1) }) : tl("Year {year}", { year: k.slice(1) });
  const sel = "bg-rw-bg border border-rw-border rounded-lg px-2 py-1.5 text-xs text-rw-text";
  const shown = role ? [role] : ROLES;
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-2`}>
        <h1 className="text-lg font-bold text-rw-text">{tl("Pro tier list")}</h1>
        <p className="text-[11px] text-rw-sub">
          {tl(
            "What pro teams actually play. Each champion sits in its main role, placed by its presence (picked or banned, share of games) and nudged up or down by its win rate once it has 10 picks or more. S: 40+ points, A: 25+, B: 12+, C: 5+.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={key} onChange={(e) => set({ key: e.target.value })} aria-label={tl("Patch or year")} className={sel}>
            {meta.champions.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </select>
          <select
            value={rawScope}
            onChange={(e) => {
              const v = e.target.value;
              set({ scope: v === "major" ? undefined : v, league: undefined });
            }}
            aria-label={tl("Leagues")}
            className={sel}
          >
            <option value="major">{tl("Top leagues")}</option>
            <option value="all">{tl("All leagues")}</option>
            {mainLeagues.length > 0 && (
              <optgroup label={tl("Leagues")}>
                {mainLeagues.map((l) => (
                  <option key={l.u} value={l.u}>
                    {l.l}
                  </option>
                ))}
              </optgroup>
            )}
            {otherLeagues.length > 0 && (
              <optgroup label={tl("Other leagues")}>
                {otherLeagues.map((l) => (
                  <option key={l.u} value={l.u}>
                    {l.l}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="flex flex-wrap gap-1" role="group" aria-label={tl("Role")}>
            {["", ...ROLES].map((r) => (
              <button
                key={r || "all"}
                type="button"
                onClick={() => set({ role: r || undefined })}
                aria-pressed={role === r}
                className={`px-2 py-1 rounded border text-xs ${role === r ? "border-rw-accent text-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
              >
                {r ? roleName(r) : tl("Every role")}
              </button>
            ))}
          </span>
        </div>
        {block && <p className="text-[10px] text-rw-muted">{tl("{n} games", { n: block.games })}</p>}
      </div>
      {(state.loading || lgBlock.loading) && <Loading />}
      {block && (
        <div className={`grid gap-3 ${role ? "" : "sm:grid-cols-2 xl:grid-cols-5"}`}>
          {shown.map((r) => (
            <Section key={r} title={roleName(r)} share={`riftwise-tiers-${key}-${r}`}>
              <div className="space-y-1.5">
                {TIERS.map((tier) => {
                  const list = (byRole.get(r) || []).filter((c) => tierOf(c.score).t === tier.t);
                  if (!list.length) return null;
                  return (
                    <div key={tier.t} className="flex gap-2 items-start">
                      <span className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-xs font-black text-black" style={{ background: tier.color }}>
                        {tier.t}
                      </span>
                      <span className="flex flex-wrap gap-1 min-w-0">
                        {list.map((c) => (
                          <HubLink
                            key={c.c}
                            to={{ kind: "champ", slug: prettySlug(c.c) }}
                            className="block rounded hover:ring-1 hover:ring-rw-accent"
                            title={`${champName(c.c)}: ${tl("presence {p}", { p: `${fmtDec(c.presence * 100)}%` })} · ${tl("{n} picks", { n: c.p })}${
                              c.wr != null && c.p >= 10 ? ` · ${tl("{p} win rate", { p: `${fmtDec(c.wr * 100)}%` })}` : ""
                            }`}
                          >
                            <ChampIcon name={c.c} size={role ? 40 : 30} />
                          </HubLink>
                        ))}
                      </span>
                    </div>
                  );
                })}
                {!(byRole.get(r) || []).length && <p className="text-[11px] text-rw-muted">{tl("No games yet.")}</p>}
              </div>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
};
