import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Search, Trophy, Users, User, Swords, Medal, ArrowLeft, GitCompare, Clock } from "lucide-react";
import { AppSettings } from "../../types";
import {
  ChampionStats,
  PlayerStats,
  Records,
  StatsMeta,
  StatsSearch,
  TeamStats,
  Title,
  INTERNATIONAL_KINDS,
  loadChampionStats,
  loadPlayerStats,
  loadRecords,
  loadStatsMeta,
  loadStatsSearch,
  loadTeamStats,
  loadTitles,
  searchByName,
  winRate,
} from "../../stats";

type StatsTab = "teams" | "players" | "champions" | "records" | "titles" | "compare";

interface StatsViewProps {
  settings: AppSettings;
}

// ── Small building blocks ─────────────────────────────────────────────────

const card = "bg-[#0a1420] border border-[#1e282d] rounded-xl p-4";
const th = "text-left font-semibold text-[#7e8e9f] py-1.5 pr-3 whitespace-nowrap";
const td = "py-1.5 pr-3 whitespace-nowrap";

function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList): { data: T | null; error: boolean; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: boolean; loading: boolean }>({ data: null, error: false, loading: true });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: false, loading: true });
    fn()
      .then((data) => alive && setState({ data, error: false, loading: false }))
      .catch(() => alive && setState({ data: null, error: true, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const Loading: React.FC<{ what?: string }> = ({ what = "stats" }) => (
  <div className="py-10 text-center text-xs text-[#9bb3c9]" role="status">
    <Clock className="w-4 h-4 inline mr-1.5 text-[#0ac8b9] animate-pulse" />
    Loading {what}…
  </div>
);

const Failed: React.FC = () => (
  <div className="py-10 text-center text-xs text-[#e84057]">
    Couldn't load the stats right now. Check your connection and try again in a minute.
  </div>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({ label, value, sub }) => (
  <div className="bg-[#091428] border border-[#1e282d] rounded-lg px-3 py-2 min-w-0">
    <div className="text-[10px] uppercase tracking-wider text-[#7e8e9f] font-semibold truncate">{label}</div>
    <div className="text-base font-bold text-[#f0e6d2] truncate">{value}</div>
    {sub && <div className="text-[10px] text-[#9bb3c9] truncate">{sub}</div>}
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <section className={`${card} space-y-2 min-w-0`}>
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#c8aa6e]">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

const LinkBtn: React.FC<{ onClick?: () => void; children: React.ReactNode }> = ({ onClick, children }) =>
  onClick ? (
    <button type="button" onClick={onClick} className="text-[#f0e6d2] hover:text-[#c8aa6e] hover:underline text-left">
      {children}
    </button>
  ) : (
    <span className="text-[#9bb3c9]">{children}</span>
  );

const SpoilerNote: React.FC = () => (
  <p className="text-[11px] text-[#7e8e9f] italic">Hidden while spoiler mode is on.</p>
);

const fmtNum = (n: number) => n.toLocaleString();

// ── Search list (teams or players) ────────────────────────────────────────

const Picker: React.FC<{
  kind: "teams" | "players";
  search: StatsSearch;
  onPick: (slug: string, name: string) => void;
  placeholder?: string;
  compact?: boolean;
}> = ({ kind, search, onPick, placeholder, compact }) => {
  const [q, setQ] = useState("");
  const thisYear = String(new Date().getFullYear());
  const items = useMemo(() => {
    if (kind === "teams") {
      const list = q ? search.teams : search.teams.filter((t) => t.y >= String(+thisYear - 1));
      return searchByName(list, q, compact ? 8 : 40).map((t) => {
        // When an old name is what matched, say so ("was SK Telecom T1")
        const old =
          q && t.a && !t.n.toLowerCase().includes(q.toLowerCase())
            ? t.a.split(" | ").find((o) => o.toLowerCase().includes(q.toLowerCase()))
            : undefined;
        return { s: t.s, n: t.n, sub: old ? `was ${old}` : `${fmtNum(t.g)} games · last ${t.y}` };
      });
    }
    const list = q ? search.players : search.players.filter((p) => p.y >= String(+thisYear - 1));
    return searchByName(list, q, compact ? 8 : 40).map((p) => ({ s: p.s, n: p.n, sub: `${p.t} · ${fmtNum(p.g)} games` }));
  }, [kind, search, q, compact, thisYear]);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 bg-[#091428] border border-[#1e282d] focus-within:border-[#c8aa6e]/60 rounded-lg px-3 py-2">
        <Search className="w-4 h-4 text-[#7e8e9f]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder || (kind === "teams" ? "Search any team, 2011 to today…" : "Search any player…")}
          aria-label={kind === "teams" ? "Search teams" : "Search players"}
          className="bg-transparent outline-none text-sm text-[#f0e6d2] placeholder-[#7e8e9f] flex-1 min-w-0"
        />
      </label>
      {!q && !compact && (
        <p className="text-[11px] text-[#7e8e9f]">
          Showing the most active {kind} right now. Search to find anyone from {kind === "teams" ? "any era" : "2011 on"}.
        </p>
      )}
      <div className={compact ? "grid gap-1" : "grid gap-1.5 sm:grid-cols-2"}>
        {items.map((it) => (
          <button
            key={it.s}
            type="button"
            onClick={() => {
              onPick(it.s, it.n);
              setQ("");
            }}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0a1420] border border-[#1e282d] hover:border-[#c8aa6e]/60 text-left text-xs"
          >
            <span className="font-semibold text-[#f0e6d2] truncate">{it.n}</span>
            <span className={`text-[#7e8e9f] text-[11px] truncate shrink-0 max-w-[55%] ${compact ? "hidden sm:inline" : ""}`}>{it.sub}</span>
          </button>
        ))}
        {items.length === 0 && <p className="text-xs text-[#9bb3c9] py-3">No {kind} match "{q}".</p>}
      </div>
    </div>
  );
};

// ── Team page ─────────────────────────────────────────────────────────────

const TeamPage: React.FC<{
  slug: string;
  spoiler: boolean;
  onTeam: (slug: string) => void;
  onPlayer: (slug: string) => void;
}> = ({ slug, spoiler, onTeam, onPlayer }) => {
  const { data: t, error, loading } = useLoad(() => loadTeamStats(slug), [slug]);
  if (loading) return <Loading what="team" />;
  if (error || !t) return <Failed />;
  const worlds = t.titles.filter((x) => x.kind === "Worlds").length;
  const msi = t.titles.filter((x) => x.kind === "MSI").length;
  const firstStand = t.titles.filter((x) => x.kind === "First Stand").length;
  const oldNames = t.names.filter((n) => n.n !== t.name);
  return (
    <div className="space-y-3">
      <div className={card}>
        <h2 className="text-lg font-bold text-[#f0e6d2]">{t.name}</h2>
        <p className="text-[11px] text-[#7e8e9f]">
          Pro games from {t.from} to {t.to}
        </p>
        {oldNames.length > 0 && (
          <p className="text-[11px] text-[#9bb3c9] mt-1">
            Also played as{" "}
            {oldNames.map((n, i) => (
              <span key={n.n + n.from}>
                {i > 0 && ", "}
                <span className="text-[#f0e6d2]">{n.n}</span> ({n.from.slice(0, 4)}
                {n.to.slice(0, 4) !== n.from.slice(0, 4) ? `–${n.to.slice(0, 4)}` : ""})
              </span>
            ))}
            . All of it counts here.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <Stat label="Games" value={`${fmtNum(t.w)}-${fmtNum(t.g - t.w)}`} sub={`${winRate(t.w, t.g)} win rate`} />
          <Stat label="Series" value={`${t.sw}-${t.sg - t.sw}`} sub={`${winRate(t.sw, t.sg)} won`} />
          <Stat
            label="Titles"
            value={t.titles.length}
            sub={
              worlds || msi || firstStand
                ? [`${worlds} Worlds`, `${msi} MSI`, firstStand ? `${firstStand} First Stand` : ""].filter(Boolean).join(" · ")
                : "finals won"
            }
          />
          <Stat label="Best streak" value={t.bestStreak ? `${t.bestStreak.n} wins` : "–"} sub={t.bestStreak?.date} />
          <Stat label="Avg game" value={`${t.avgMin} min`} />
          {t.kills != null && <Stat label="Kills / game" value={t.kills} sub={`${t.deaths} deaths`} />}
          {t.obj && <Stat label="Dragons / game" value={t.obj.dragons} sub={`${t.obj.barons} barons`} />}
          {t.obj && (
            <Stat
              label="Gold diff / game"
              value={`${t.obj.golddiff >= 0 ? "+" : ""}${fmtNum(Math.round(t.obj.golddiff))}`}
              sub={`${t.obj.towers} towers`}
            />
          )}
        </div>
      </div>

      {t.titles.length > 0 && (
        <Section title="Titles">
          <ul className="text-xs space-y-1">
            {t.titles.map((x) => (
              <li key={x.t + x.date} className="flex justify-between gap-2">
                <span className="text-[#f0e6d2]">
                  <Trophy className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-[#c8aa6e]" : "text-[#7e8e9f]"}`} />
                  {x.t}
                  {x.as !== t.name && <span className="text-[#7e8e9f]"> (as {x.as})</span>}
                </span>
                <span className="text-[#7e8e9f] shrink-0">
                  {x.score} vs {x.l}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Recent series">
          {spoiler ? (
            <SpoilerNote />
          ) : (
            <ul className="text-xs space-y-1">
              {t.recent.map((r, i) => (
                <li key={i} className="flex justify-between gap-2 min-w-0">
                  <span className="truncate min-w-0">
                    <span className={r.us > r.them ? "text-[#0ac8b9] font-bold" : "text-[#e84057] font-bold"}>
                      {r.us > r.them ? "W" : "L"} {r.us}-{r.them}
                    </span>{" "}
                    <span className="text-[#f0e6d2]">vs {r.opp}</span>
                  </span>
                  <span className="text-[#7e8e9f] shrink-0">{r.date}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="By year">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>Year</th>
                <th className={th}>Record</th>
                <th className={th}>Win %</th>
              </tr>
            </thead>
            <tbody>
              {t.years.map((y) => (
                <tr key={y.y} className="border-t border-[#1e282d]">
                  <td className={`${td} text-[#f0e6d2]`}>
                    {y.y}
                    {y.as !== t.name && <span className="text-[#7e8e9f] text-[10px]"> as {y.as}</span>}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {y.w}-{y.g - y.w}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{winRate(y.w, y.g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Roster">
        <div className="space-y-2">
          {t.roster.map((yr) => (
            <div key={yr.y} className="text-xs">
              <span className="text-[#7e8e9f] font-semibold mr-2">{yr.y}</span>
              {yr.p.map((p, i) => (
                <span key={p.s}>
                  {i > 0 && <span className="text-[#3a4a5a]"> · </span>}
                  <LinkBtn onClick={() => onPlayer(p.s)}>{p.n}</LinkBtn>
                  <span className="text-[#7e8e9f]"> {p.r}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Against other teams">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>Opponent</th>
                <th className={th}>Games</th>
                <th className={th}>Win %</th>
                <th className={th}>Last met</th>
              </tr>
            </thead>
            <tbody>
              {t.opps.map((o) => (
                <tr key={o.n} className="border-t border-[#1e282d]">
                  <td className={td}>
                    <LinkBtn onClick={o.s ? () => onTeam(o.s!) : undefined}>{o.n}</LinkBtn>
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {o.w}-{o.g - o.w}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{winRate(o.w, o.g)}</td>
                  <td className={`${td} text-[#7e8e9f]`}>{o.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Most picked champions">
          <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
            {t.champs.map((c) => (
              <li key={c.c} className="flex justify-between">
                <span className="text-[#f0e6d2]">{c.c}</span>
                <span className="text-[#7e8e9f]">
                  {c.g} · {winRate(c.w, c.g)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Most banned by them">
          <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
            {t.bans.map((c) => (
              <li key={c.c} className="flex justify-between">
                <span className="text-[#f0e6d2]">{c.c}</span>
                <span className="text-[#7e8e9f]">{c.g}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
};

// ── Player page ───────────────────────────────────────────────────────────

const BEST_LABEL: Record<string, string> = { kills: "Most kills", assists: "Most assists", dmg: "Most damage", cs: "Most CS" };

const PlayerPage: React.FC<{ slug: string; spoiler: boolean; onTeam: (slug: string) => void }> = ({ slug, spoiler, onTeam }) => {
  const { data: p, error, loading } = useLoad(() => loadPlayerStats(slug), [slug]);
  if (loading) return <Loading what="player" />;
  if (error || !p) return <Failed />;
  const current = p.teams[0];
  return (
    <div className="space-y-3">
      <div className={card}>
        <h2 className="text-lg font-bold text-[#f0e6d2]">{p.name}</h2>
        <p className="text-[11px] text-[#7e8e9f]">
          {p.role}
          {p.club ? ` · ${p.club} (last game ${p.clubTo || current?.to})` : current ? ` · last played for ${current.n} (${current.to})` : ""}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <Stat label="Games" value={`${fmtNum(p.w)}-${fmtNum(p.g - p.w)}`} sub={`${winRate(p.w, p.g)} win rate`} />
          <Stat label="KDA" value={p.kda} sub={`${fmtNum(p.k)} / ${fmtNum(p.d)} / ${fmtNum(p.a)}`} />
          <Stat label="Champions" value={p.nChamps} sub={p.champs[0] ? `most: ${p.champs[0].c}` : undefined} />
          <Stat
            label="Titles"
            value={p.titles.length}
            sub={`${p.titles.filter((x) => x[2] === "Worlds").length} Worlds · ${p.titles.filter((x) => x[2] === "MSI").length} MSI`}
          />
          {p.csm != null && <Stat label="CS / min" value={p.csm} />}
          {p.gpm != null && <Stat label="Gold / min" value={fmtNum(p.gpm)} />}
          {p.dpm != null && <Stat label="Damage / min" value={fmtNum(p.dpm)} />}
        </div>
        <p className="text-[10px] text-[#7e8e9f] mt-2">All-Star and show matches aren't counted.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Teams">
          <ul className="text-xs space-y-1">
            {p.teams.map((t) => (
              <li key={t.n} className="flex justify-between gap-2">
                <LinkBtn onClick={t.s ? () => onTeam(t.s!) : undefined}>{t.n}</LinkBtn>
                <span className="text-[#7e8e9f] shrink-0">
                  {t.from.slice(0, 4)}–{t.to.slice(0, 4)} · {t.w}-{t.g - t.w}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="By year">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>Year</th>
                <th className={th}>Team</th>
                <th className={th}>Record</th>
                <th className={th}>KDA</th>
              </tr>
            </thead>
            <tbody>
              {p.years.map((y) => (
                <tr key={y.y} className="border-t border-[#1e282d]">
                  <td className={`${td} text-[#f0e6d2]`}>{y.y}</td>
                  <td className={`${td} text-[#9bb3c9] max-w-[9rem] truncate`}>{y.team}</td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {y.w}-{y.g - y.w}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{y.kda}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Champion pool">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>Champion</th>
                <th className={th}>Games</th>
                <th className={th}>Win %</th>
                <th className={th}>KDA</th>
                <th className={th}>K / D / A</th>
              </tr>
            </thead>
            <tbody>
              {p.champs.slice(0, 20).map((c) => (
                <tr key={c.c} className="border-t border-[#1e282d]">
                  <td className={`${td} text-[#f0e6d2]`}>{c.c}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.g}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{winRate(c.w, c.g)}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.kda}</td>
                  <td className={`${td} text-[#7e8e9f]`}>
                    {c.k} / {c.d} / {c.a}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Recent games">
          {spoiler ? (
            <SpoilerNote />
          ) : (
            <ul className="text-xs space-y-1">
              {p.recent.map((r, i) => (
                <li key={i} className="flex justify-between gap-2 min-w-0">
                  <span className="truncate min-w-0">
                    <span className={r.win ? "text-[#0ac8b9] font-bold" : "text-[#e84057] font-bold"}>{r.win ? "W" : "L"}</span>{" "}
                    <span className="text-[#f0e6d2]">{r.c}</span>{" "}
                    <span className="text-[#9bb3c9]">
                      {r.k}/{r.d}/{r.a} vs {r.opp}
                    </span>
                  </span>
                  <span className="text-[#7e8e9f] shrink-0">{r.date}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Career bests">
          <ul className="text-xs space-y-1">
            {Object.entries(p.best).map(([k, b]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="text-[#9bb3c9]">{BEST_LABEL[k] || k}</span>
                <span className="text-[#f0e6d2] text-right truncate">
                  {fmtNum(b.v)} <span className="text-[#7e8e9f]">({b.c} vs {b.opp}, {b.date.slice(0, 4)})</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {p.titles.length > 0 && (
        <Section title="Titles">
          <ul className="text-xs space-y-1">
            {p.titles.map(([t, date, kind]) => (
              <li key={t + date} className="flex justify-between gap-2">
                <span className="text-[#f0e6d2]">
                  <Trophy className={`w-3 h-3 inline mr-1 ${kind === "Worlds" ? "text-[#c8aa6e]" : "text-[#7e8e9f]"}`} />
                  {t}
                </span>
                <span className="text-[#7e8e9f] shrink-0">{date}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};

// ── Champions ─────────────────────────────────────────────────────────────

type ChampSort = "presence" | "p" | "b" | "wr" | "kda";

const ChampionsPanel: React.FC<{ meta: StatsMeta }> = ({ meta }) => {
  const [key, setKey] = useState(() => meta.champions.find((k) => k.startsWith("p")) || meta.champions[0]);
  const [scope, setScope] = useState<"major" | "all">("major");
  const [sort, setSort] = useState<ChampSort>("presence");
  const [role, setRole] = useState("All");
  const { data, error, loading } = useLoad<ChampionStats>(() => loadChampionStats(key), [key]);

  const block = data?.[scope] || data?.all;
  const rows = useMemo(() => {
    if (!block) return [];
    const n = block.games;
    const list = block.champs
      .filter((c) => role === "All" || c.role === role)
      .map((c) => ({ ...c, presence: (c.p + c.b) / n, wr: c.p ? c.w / c.p : 0 }));
    const val = (c: (typeof list)[number]) =>
      sort === "presence" ? c.presence : sort === "wr" ? (c.p >= 10 ? c.wr : -1) : sort === "kda" ? c.kda ?? -1 : c[sort];
    return list.sort((a, b) => val(b) - val(a)).slice(0, 80);
  }, [block, sort, role]);

  const label = (k: string) =>
    k === "all" ? "All time (2011 to today)" : k.startsWith("p") ? `Patch ${k.slice(1)}` : `Year ${k.slice(1)}`;
  const SortTh: React.FC<{ k: ChampSort; children: React.ReactNode }> = ({ k, children }) => (
    <th className={th}>
      <button type="button" onClick={() => setSort(k)} className={sort === k ? "text-[#c8aa6e]" : "hover:text-[#f0e6d2]"}>
        {children}
        {sort === k ? " ▼" : ""}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="Patch or year"
          className="bg-[#091428] border border-[#1e282d] rounded-lg px-2 py-1.5 text-[#f0e6d2]"
        >
          {meta.champions.includes("all") && <option value="all">{label("all")}</option>}
          {meta.champions.filter((k) => k.startsWith("p")).map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
          {meta.champions.filter((k) => k.startsWith("y")).map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Role"
          className="bg-[#091428] border border-[#1e282d] rounded-lg px-2 py-1.5 text-[#f0e6d2]"
        >
          {["All", "Top", "Jungle", "Mid", "Bot", "Support"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <div className="flex rounded-lg border border-[#1e282d] overflow-hidden">
          {(["major", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-2.5 py-1.5 ${scope === s ? "bg-[#c8aa6e] text-[#091428] font-bold" : "text-[#9bb3c9]"}`}
            >
              {s === "major" ? "Top leagues" : "All leagues"}
            </button>
          ))}
        </div>
        {block && <span className="text-[#7e8e9f]">{fmtNum(block.games)} games</span>}
      </div>
      {loading ? (
        <Loading what="champions" />
      ) : error || !block ? (
        <Failed />
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>Champion</th>
                <th className={th}>Role</th>
                <SortTh k="presence">Presence</SortTh>
                <SortTh k="p">Picks</SortTh>
                <SortTh k="b">Bans</SortTh>
                <SortTh k="wr">Win %</SortTh>
                <SortTh k="kda">KDA</SortTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.c} className="border-t border-[#1e282d]">
                  <td className={`${td} text-[#f0e6d2] font-semibold`}>{c.c}</td>
                  <td className={`${td} text-[#7e8e9f]`}>{c.role || "–"}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{Math.round(c.presence * 100)}%</td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.p}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.b}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.p ? winRate(c.w, c.p) : "–"}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.kda ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-[#7e8e9f] mt-2">
            Presence = picked or banned in that share of games. "Top leagues" = the main regional leagues plus Worlds, MSI and other internationals.
          </p>
        </div>
      )}
    </div>
  );
};

// ── Records ───────────────────────────────────────────────────────────────

const RecordsPanel: React.FC<{ onTeam: (s: string) => void; onPlayer: (s: string) => void }> = ({ onTeam, onPlayer }) => {
  const { data: r, error, loading } = useLoad<Records>(loadRecords, []);
  if (loading) return <Loading what="records" />;
  if (error || !r) return <Failed />;

  const gameList = (title: string, rows: Records["game"]["fastest"], fmt: (v: number) => string) => (
    <Section title={title}>
      <ol className="text-xs space-y-1.5">
        {rows.map((g, i) => (
          <li key={i} className="min-w-0">
            <div className="truncate">
              <span className="text-[#c8aa6e] font-bold mr-1">{fmt(g.v)}</span>
              <span className="text-[#f0e6d2]">
                {g.w} over {g.w === g.a ? g.b : g.a}
              </span>
            </div>
            <div className="text-[10px] text-[#7e8e9f] truncate">
              {g.t} · {g.date}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );

  const playerList = (title: string, rows: Records["player"]["kills"], fmt: (v: number) => string = fmtNum) => (
    <Section title={title}>
      <ol className="text-xs space-y-1.5">
        {rows.map((p, i) => (
          <li key={i} className="min-w-0">
            <div className="truncate">
              <span className="text-[#c8aa6e] font-bold mr-1">{fmt(p.v)}</span>
              <LinkBtn onClick={() => onPlayer(p.ps)}>{p.pl}</LinkBtn>
              <span className="text-[#9bb3c9]">
                {" "}
                {p.c} {p.kda}
              </span>
            </div>
            <div className="text-[10px] text-[#7e8e9f] truncate">
              vs {p.opp} · {p.t} · {p.date}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );

  const careerList = (title: string, rows: Records["career"]["games"]) => (
    <Section title={title}>
      <ol className="text-xs space-y-1.5">
        {rows.map((p, i) => (
          <li key={i} className="flex justify-between gap-2 min-w-0">
            <LinkBtn onClick={() => onPlayer(p.ps)}>{p.pl}</LinkBtn>
            <span className="text-[#c8aa6e] font-bold">{fmtNum(p.v)}</span>
          </li>
        ))}
      </ol>
    </Section>
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#7e8e9f]">
        {r.note} Career totals count every pro game except All-Star and show matches. The top records were checked
        against Leaguepedia.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {gameList("Fastest wins", r.game.fastest, (v) => `${v} min`)}
        {gameList("Longest games", r.game.longest, (v) => `${v} min`)}
        {gameList("Most kills in a game", r.game.bloodiest, (v) => `${v} kills`)}
        {gameList("Won with the biggest gold deficit (end of game)", r.game.comebacks, (v) => `${(v / 1000).toFixed(1)}k`)}
        {playerList("Most kills by one player", r.player.kills)}
        {playerList("Most assists by one player", r.player.assists)}
        {playerList("Best deathless games (kills + assists)", r.player.perfect)}
        {playerList("Most damage in a game", r.player.dmg)}
        {playerList("Most CS in a game", r.player.cs)}
        <Section title="Longest win streaks">
          <ol className="text-xs space-y-1.5">
            {r.team.streaks.map((t, i) => (
              <li key={i} className="flex justify-between gap-2 min-w-0">
                <LinkBtn onClick={t.s ? () => onTeam(t.s!) : undefined}>{t.team}</LinkBtn>
                <span className="text-[#7e8e9f]">
                  <span className="text-[#c8aa6e] font-bold">{t.v} games</span> · ended {t.date}
                </span>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Most international titles (Worlds, MSI, First Stand)">
          <ol className="text-xs space-y-1.5">
            {r.team.titles.map((t, i) => (
              <li key={i} className="flex justify-between gap-2 min-w-0">
                <LinkBtn onClick={t.s ? () => onTeam(t.s!) : undefined}>{t.team}</LinkBtn>
                <span className="text-[#7e8e9f]">
                  {t.worlds ? `${t.worlds} Worlds · ` : ""}
                  <span className="text-[#c8aa6e] font-bold">{t.v} total</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
        {careerList("Most pro games", r.career.games)}
        {careerList("Most career kills", r.career.kills)}
        {careerList("Most career assists", r.career.assists)}
        {careerList("Biggest champion pools", r.career.pool)}
      </div>
    </div>
  );
};

// ── Titles ────────────────────────────────────────────────────────────────

const TITLE_FILTERS = [
  { key: "International", label: "Worlds, MSI & First Stand" },
  { key: "Worlds", label: "Worlds" },
  { key: "Leagues", label: "League titles" },
  { key: "All", label: "Everything" },
] as const;

const TitlesPanel: React.FC<{ onTeam: (s: string) => void }> = ({ onTeam }) => {
  const { data, error, loading } = useLoad<Title[]>(loadTitles, []);
  const [kind, setKind] = useState<(typeof TITLE_FILTERS)[number]["key"]>("International");
  if (loading) return <Loading what="titles" />;
  if (error || !data) return <Failed />;
  const rows = data
    .filter((x) =>
      kind === "All"
        ? true
        : kind === "International"
        ? INTERNATIONAL_KINDS.includes(x.kind)
        : kind === "Worlds"
        ? x.kind === "Worlds"
        : x.kind === "Regional",
    )
    .slice(0, 300);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {TITLE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKind(f.key)}
            className={`px-2.5 py-1.5 rounded-lg border ${
              kind === f.key ? "bg-[#c8aa6e] text-[#091428] font-bold border-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={th}>Event</th>
              <th className={th}>Champion</th>
              <th className={th}>Final</th>
              <th className={th}>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.t + x.date} className="border-t border-[#1e282d]">
                <td className={`${td} text-[#f0e6d2]`}>
                  <Trophy className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-[#c8aa6e]" : "text-[#7e8e9f]"}`} />
                  {x.t}
                </td>
                <td className={td}>
                  <LinkBtn onClick={x.s ? () => onTeam(x.s!) : undefined}>{x.as}</LinkBtn>
                  {x.as !== x.w && <span className="text-[#7e8e9f] text-[10px]"> (now {x.w})</span>}
                </td>
                <td className={`${td} text-[#9bb3c9]`}>
                  {x.score} vs {x.l}
                </td>
                <td className={`${td} text-[#7e8e9f]`}>{x.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Compare ───────────────────────────────────────────────────────────────

const CompareSide: React.FC<{
  kind: "teams" | "players";
  slug: string | null;
  search: StatsSearch;
  onPick: (s: string | null) => void;
}> = ({ kind, slug, search, onPick }) => {
  if (!slug) return <Picker kind={kind} search={search} onPick={(s) => onPick(s)} compact placeholder={`Pick a ${kind === "teams" ? "team" : "player"}…`} />;
  return (
    <button type="button" onClick={() => onPick(null)} className="text-[11px] text-[#0ac8b9] hover:underline">
      Change
    </button>
  );
};

const CompareRow: React.FC<{ label: string; a: React.ReactNode; b: React.ReactNode }> = ({ label, a, b }) => (
  <tr className="border-t border-[#1e282d]">
    <td className={`${td} text-right text-[#f0e6d2] font-semibold w-2/5`}>{a}</td>
    <td className={`${td} text-center text-[#7e8e9f] text-[11px]`}>{label}</td>
    <td className={`${td} text-[#f0e6d2] font-semibold w-2/5`}>{b}</td>
  </tr>
);

const ComparePanel: React.FC<{ search: StatsSearch }> = ({ search }) => {
  const [kind, setKind] = useState<"teams" | "players">("teams");
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [data, setData] = useState<{ a: TeamStats | PlayerStats | null; b: TeamStats | PlayerStats | null }>({ a: null, b: null });

  useEffect(() => {
    let alive = true;
    const loader = kind === "teams" ? loadTeamStats : loadPlayerStats;
    Promise.all([a ? loader(a).catch(() => null) : null, b ? loader(b).catch(() => null) : null]).then(
      ([x, y]) => alive && setData({ a: x, b: y }),
    );
    return () => {
      alive = false;
    };
  }, [kind, a, b]);

  const switchKind = (k: "teams" | "players") => {
    setKind(k);
    setA(null);
    setB(null);
    setData({ a: null, b: null });
  };

  let rows: React.ReactNode = null;
  if (data.a && data.b) {
    if (kind === "teams") {
      const x = data.a as TeamStats;
      const y = data.b as TeamStats;
      const h = x.opps.find((o) => o.n === y.name);
      rows = (
        <>
          <CompareRow label="Head to head (games)" a={h ? h.w : "–"} b={h ? h.g - h.w : "–"} />
          <CompareRow label="Games won" a={`${x.w}-${x.g - x.w}`} b={`${y.w}-${y.g - y.w}`} />
          <CompareRow label="Win rate" a={winRate(x.w, x.g)} b={winRate(y.w, y.g)} />
          <CompareRow label="Series won" a={winRate(x.sw, x.sg)} b={winRate(y.sw, y.sg)} />
          <CompareRow label="Titles" a={x.titles.length} b={y.titles.length} />
          <CompareRow label="Worlds" a={x.titles.filter((t) => t.kind === "Worlds").length} b={y.titles.filter((t) => t.kind === "Worlds").length} />
          <CompareRow label="Best streak" a={x.bestStreak?.n ?? "–"} b={y.bestStreak?.n ?? "–"} />
          <CompareRow label="Avg game (min)" a={x.avgMin} b={y.avgMin} />
          <CompareRow label="Kills / game" a={x.kills ?? "–"} b={y.kills ?? "–"} />
          <CompareRow label="Dragons / game" a={x.obj?.dragons ?? "–"} b={y.obj?.dragons ?? "–"} />
          <CompareRow label="Gold diff / game" a={x.obj ? Math.round(x.obj.golddiff) : "–"} b={y.obj ? Math.round(y.obj.golddiff) : "–"} />
        </>
      );
    } else {
      const x = data.a as PlayerStats;
      const y = data.b as PlayerStats;
      rows = (
        <>
          <CompareRow label="Role" a={x.role} b={y.role} />
          <CompareRow label="Games" a={fmtNum(x.g)} b={fmtNum(y.g)} />
          <CompareRow label="Win rate" a={winRate(x.w, x.g)} b={winRate(y.w, y.g)} />
          <CompareRow label="KDA" a={x.kda} b={y.kda} />
          <CompareRow label="Kills" a={fmtNum(x.k)} b={fmtNum(y.k)} />
          <CompareRow label="Assists" a={fmtNum(x.a)} b={fmtNum(y.a)} />
          <CompareRow label="CS / min" a={x.csm ?? "–"} b={y.csm ?? "–"} />
          <CompareRow label="Damage / min" a={x.dpm ?? "–"} b={y.dpm ?? "–"} />
          <CompareRow label="Champions played" a={x.nChamps} b={y.nChamps} />
          <CompareRow label="Titles" a={x.titles.length} b={y.titles.length} />
          <CompareRow label="Worlds" a={x.titles.filter((t) => t[2] === "Worlds").length} b={y.titles.filter((t) => t[2] === "Worlds").length} />
          <CompareRow label="Most played" a={x.champs[0]?.c ?? "–"} b={y.champs[0]?.c ?? "–"} />
        </>
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        {(["teams", "players"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            className={`px-2.5 py-1.5 rounded-lg border ${
              kind === k ? "bg-[#c8aa6e] text-[#091428] font-bold border-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9]"
            }`}
          >
            {k === "teams" ? "Teams" : "Players"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { s: a, set: setA, d: data.a },
          { s: b, set: setB, d: data.b },
        ].map((side, i) => (
          <div key={i} className={`${card} space-y-1 min-w-0`}>
            {side.d && <div className="text-sm font-bold text-[#f0e6d2] truncate">{side.d.name}</div>}
            <CompareSide kind={kind} slug={side.s} search={search} onPick={side.set} />
          </div>
        ))}
      </div>
      {rows && (
        <div className={card}>
          <table className="w-full text-xs">
            <tbody>{rows}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Main view ─────────────────────────────────────────────────────────────

export const StatsView: React.FC<StatsViewProps> = ({ settings }) => {
  const [tab, setTab] = useState<StatsTab>("teams");
  const [team, setTeam] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const { data: meta, error: metaError } = useLoad<StatsMeta>(loadStatsMeta, []);
  const needsSearch = tab === "teams" || tab === "players" || tab === "compare";
  const [search, setSearch] = useState<StatsSearch | null>(null);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    if (!needsSearch || search) return;
    loadStatsSearch()
      .then(setSearch)
      .catch(() => setSearchError(true));
  }, [needsSearch, search]);

  const openTeam = (s: string) => {
    setTab("teams");
    setPlayer(null);
    setTeam(s);
  };
  const openPlayer = (s: string) => {
    setTab("players");
    setTeam(null);
    setPlayer(s);
  };

  const tabs: { key: StatsTab; label: string; icon: React.ReactNode }[] = [
    { key: "teams", label: "Teams", icon: <Users className="w-3.5 h-3.5" /> },
    { key: "players", label: "Players", icon: <User className="w-3.5 h-3.5" /> },
    { key: "champions", label: "Champions", icon: <Swords className="w-3.5 h-3.5" /> },
    { key: "records", label: "Records", icon: <Medal className="w-3.5 h-3.5" /> },
    { key: "titles", label: "Titles", icon: <Trophy className="w-3.5 h-3.5" /> },
    { key: "compare", label: "Compare", icon: <GitCompare className="w-3.5 h-3.5" /> },
  ];

  const detailOpen = (tab === "teams" && team) || (tab === "players" && player);

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto overflow-y-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1e282d]">
        <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Pro Stats
        </h2>
        {meta && (
          <span className="text-[11px] text-[#7e8e9f]">
            {fmtNum(meta.games)} pro games · {meta.from.slice(0, 4)}–{meta.to.slice(0, 4)} · updated daily
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              if (t.key === "teams") setTeam(null);
              if (t.key === "players") setPlayer(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              tab === t.key
                ? "bg-[#c8aa6e] text-[#091428] border-[#c8aa6e]"
                : "border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2] hover:border-[#c8aa6e]/50"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {settings.spoilerMode && (
        <p className="text-[11px] text-[#c8aa6e] bg-[#c8aa6e]/10 border border-[#c8aa6e]/30 rounded-lg px-3 py-2">
          Spoiler mode is on: recent games are hidden, but stats still include results (records, titles and win rates up
          to today).
        </p>
      )}

      {detailOpen && (
        <button
          type="button"
          onClick={() => (tab === "teams" ? setTeam(null) : setPlayer(null))}
          className="flex items-center gap-1 text-xs text-[#0ac8b9] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All {tab}
        </button>
      )}

      {metaError && <Failed />}

      {tab === "teams" &&
        (team ? (
          <TeamPage slug={team} spoiler={settings.spoilerMode} onTeam={openTeam} onPlayer={openPlayer} />
        ) : search ? (
          <Picker kind="teams" search={search} onPick={openTeam} />
        ) : searchError ? (
          <Failed />
        ) : (
          <Loading what="teams" />
        ))}

      {tab === "players" &&
        (player ? (
          <PlayerPage slug={player} spoiler={settings.spoilerMode} onTeam={openTeam} />
        ) : search ? (
          <Picker kind="players" search={search} onPick={openPlayer} />
        ) : searchError ? (
          <Failed />
        ) : (
          <Loading what="players" />
        ))}

      {tab === "champions" && (meta ? <ChampionsPanel meta={meta} /> : !metaError && <Loading what="champions" />)}
      {tab === "records" && <RecordsPanel onTeam={openTeam} onPlayer={openPlayer} />}
      {tab === "titles" && <TitlesPanel onTeam={openTeam} />}
      {tab === "compare" && (search ? <ComparePanel search={search} /> : searchError ? <Failed /> : <Loading what="compare" />)}

      <p className="text-[10px] text-[#7e8e9f] text-center pt-2">
        Stats come from RiftWatch's pro games catalog (built from public Leaguepedia data) and are rebuilt every night.
      </p>
    </div>
  );
};
