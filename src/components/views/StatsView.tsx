import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Trophy,
  Swords,
  Medal,
  ArrowLeft,
  GitCompare,
  Home,
  CalendarRange,
  Layers,
  History,
} from "lucide-react";
import { AppSettings } from "../../types";
import {
  ChampionStats,
  StatsMeta,
  INTERNATIONAL_KINDS,
  loadChampionStats,
  loadStatsMeta,
  winRate,
} from "../../stats";
import { tl, tk, tc, roleName, eventTitle } from "../../i18n";
import { champName, useChampionNames } from "../../champions";
import { loadHubMeta, loadHubRecords, loadHubTitles } from "../../hub/data";
import type { HubRecords, HubTitle } from "../../hub/types";
import {
  CompareRoute,
  HubRoute,
  canGoBack,
  hubBack,
  hubShareUrl,
  navigateHub,
  useHubRoute,
} from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import {
  card,
  ChampIcon,
  ChampLink,
  CopyLinkButton,
  EventLink,
  Failed,
  fmtDate,
  fmtNum,
  HubLink,
  Loading,
  Page,
  PlayerLink,
  RevealButton,
  Section,
  SpoilerProvider,
  td,
  th,
  TeamLink,
  useHidden,
  useLoad,
  usePageTitle,
} from "../hub/ui";
import { HubSearch } from "../hub/HubSearch";

/** Every pro pentakill: the players with the most, and the newest (spoiler mode hides fresh ones). */
const PentakillRecords: React.FC<{ p: NonNullable<HubRecords["pentas"]> }> = ({
  p,
}) => {
  const [n, setN] = useState(15);
  return (
    <>
      <Section title={tl("Most pentakills")}>
        <ol className="text-xs space-y-1.5">
          {p.most.map((x, i) => (
            <li key={i} className="flex justify-between gap-2 min-w-0">
              <PlayerLink name={x.n} u={x.u} />
              <span className="text-[#c8aa6e] font-bold">{x.v}</span>
            </li>
          ))}
        </ol>
        <p className="text-[10px] text-[#7e8e9f]">
          {tl(
            "{n} pentakills recorded by Leaguepedia. Complete from 2018 on; earlier years only partly, so older players are undercounted.",
            {
              n: fmtNum(p.total),
            },
          )}
        </p>
      </Section>
      <Section title={tl("Latest pentakills")}>
        <ol className="text-xs space-y-1.5">
          {p.recent.slice(0, n).map((x, i) => (
            <PentaRow key={i} x={x} />
          ))}
        </ol>
        {p.recent.length > n && (
          <button
            type="button"
            onClick={() => setN((v) => v + 30)}
            className="text-xs text-[#0ac8b9] hover:underline"
          >
            {tl("Show more ({n} left)", { n: p.recent.length - n })}
          </button>
        )}
      </Section>
    </>
  );
};

const PentaRow: React.FC<{
  x: NonNullable<HubRecords["pentas"]>["recent"][number];
}> = ({ x }) => {
  const [hidden, reveal] = useHidden(`penta:${x.g}:${x.n}`, x.date);
  return (
    <li className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {hidden ? (
          <RevealButton onReveal={reveal} small />
        ) : (
          <>
            <ChampIcon name={x.c} size={18} />
            <span className="truncate">
              <PlayerLink name={x.n} u={x.u} />{" "}
              <span className="text-[#9bb3c9]">{champName(x.c)}</span>
              {x.x > 1 && <span className="text-[#c8aa6e]"> ×{x.x}</span>}{" "}
              {x.g ? (
                <HubLink
                  to={{ kind: "match", slug: x.g }}
                  className="text-[#9bb3c9] hover:text-[#c8aa6e] hover:underline"
                >
                  {x.a} vs {x.b}
                </HubLink>
              ) : (
                <span className="text-[#9bb3c9]">
                  {x.a} vs {x.b}
                </span>
              )}
            </span>
          </>
        )}
      </div>
      <div className="text-[10px] text-[#7e8e9f] truncate">
        <EventLink
          name={x.t}
          u={x.e}
          className="text-[#7e8e9f] hover:text-[#c8aa6e] hover:underline"
        />{" "}
        · {fmtDate(x.date)}
      </div>
    </li>
  );
};

/** Minutes as m:ss (records are kept to the second) */
const mmss = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
import { ComparePage } from "../hub/ComparePage";
import { LeaguePage, LeaguesPanel, PatchesPanel } from "../hub/MetaPages";
import { HubHome, EventsBrowse } from "../hub/HubHome";
import { TeamPage } from "../hub/TeamPage";
import { PlayerPage } from "../hub/PlayerPage";
import { EventPage } from "../hub/EventPage";
import { MatchPage } from "../hub/MatchPage";
import { ChampPage } from "../hub/ChampPage";

interface StatsViewProps {
  settings: AppSettings;
  onOpenUrl: (url: string) => void;
}

const SECTIONS: {
  kind: HubRoute["kind"];
  label: string;
  icon: React.ReactNode;
}[] = [
  { kind: "home", label: tk("Home"), icon: <Home className="w-3.5 h-3.5" /> },
  {
    kind: "tournaments",
    label: tk("Tournaments"),
    icon: <CalendarRange className="w-3.5 h-3.5" />,
  },
  {
    kind: "leagues",
    label: tk("Leagues"),
    icon: <Layers className="w-3.5 h-3.5" />,
  },
  {
    kind: "champions",
    label: tk("Champions"),
    icon: <Swords className="w-3.5 h-3.5" />,
  },
  {
    kind: "patches",
    label: tk("Patches"),
    icon: <History className="w-3.5 h-3.5" />,
  },
  {
    kind: "records",
    label: tk("Records"),
    icon: <Medal className="w-3.5 h-3.5" />,
  },
  {
    kind: "titles",
    label: tk("Titles"),
    icon: <Trophy className="w-3.5 h-3.5" />,
  },
  {
    kind: "compare",
    label: tk("Compare"),
    icon: <GitCompare className="w-3.5 h-3.5" />,
  },
];

// ── Champions table (pick / ban / win rates by patch or year) ─────────────

type ChampSort = "presence" | "p" | "b" | "wr" | "kda";

const ChampionsPanel: React.FC<{ meta: StatsMeta }> = ({ meta }) => {
  usePageTitle(tl("Champions"));
  const [key, setKey] = useState(
    () => meta.champions.find((k) => k.startsWith("p")) || meta.champions[0],
  );
  const [scope, setScope] = useState<"major" | "all">("major");
  const [sort, setSort] = useState<ChampSort>("presence");
  const [role, setRole] = useState("All");
  const state = useLoad<ChampionStats>(() => loadChampionStats(key), [key]);

  const block = state.data?.[scope] || state.data?.all;
  const rows = useMemo(() => {
    if (!block) return [];
    const n = block.games;
    const list = block.champs
      .filter((c) => role === "All" || c.role === role)
      .map((c) => ({
        ...c,
        presence: (c.p + c.b) / n,
        wr: c.p ? c.w / c.p : 0,
      }));
    const val = (c: (typeof list)[number]) =>
      sort === "presence"
        ? c.presence
        : sort === "wr"
          ? c.p >= 10
            ? c.wr
            : -1
          : sort === "kda"
            ? (c.kda ?? -1)
            : c[sort];
    return list.sort((a, b) => val(b) - val(a)).slice(0, 80);
  }, [block, sort, role]);

  const label = (k: string) =>
    k === "all"
      ? tl("All time (2011 to today)")
      : k.startsWith("p")
        ? tl("Patch {patch}", { patch: k.slice(1) })
        : tl("Year {year}", { year: k.slice(1) });
  const SortTh: React.FC<{ k: ChampSort; children: React.ReactNode }> = ({
    k,
    children,
  }) => (
    <th className={th}>
      <button
        type="button"
        onClick={() => setSort(k)}
        className={sort === k ? "text-[#c8aa6e]" : "hover:text-[#f0e6d2]"}
      >
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
          aria-label={tl("Patch or year")}
          className="bg-[#091428] border border-[#1e282d] rounded-lg px-2 py-1.5 text-[#f0e6d2]"
        >
          {meta.champions.includes("all") && (
            <option value="all">{label("all")}</option>
          )}
          {meta.champions
            .filter((k) => k.startsWith("p"))
            .map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          {meta.champions
            .filter((k) => k.startsWith("y"))
            .map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label={tl("Role")}
          className="bg-[#091428] border border-[#1e282d] rounded-lg px-2 py-1.5 text-[#f0e6d2]"
        >
          {["All", "Top", "Jungle", "Mid", "Bot", "Support"].map((r) => (
            <option key={r} value={r}>
              {r === "All" ? tl("All roles") : roleName(r)}
            </option>
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
              {s === "major" ? tl("Top leagues") : tl("All leagues")}
            </button>
          ))}
        </div>
        {block && (
          <span className="text-[#7e8e9f]">
            {tl("{n} games", { n: fmtNum(block.games) })}
          </span>
        )}
      </div>
      {state.loading ? (
        <Loading />
      ) : state.error || !block ? (
        <Failed />
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Champion")}</th>
                <th className={th}>{tl("Role")}</th>
                <SortTh k="presence">{tl("Presence")}</SortTh>
                <SortTh k="p">{tl("Picks")}</SortTh>
                <SortTh k="b">{tl("Bans")}</SortTh>
                <SortTh k="wr">{tl("Win %")}</SortTh>
                <SortTh k="kda">{tl("KDA")}</SortTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.c} className="border-t border-[#1e282d]">
                  <td className={`${td} font-semibold max-w-[10rem]`}>
                    <ChampLink name={c.c} size={18} />
                  </td>
                  <td className={`${td} text-[#7e8e9f]`}>
                    {c.role ? roleName(c.role) : "–"}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {Math.round(c.presence * 100)}%
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.p}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.b}</td>
                  <td className={`${td} text-[#9bb3c9]`}>
                    {c.p ? winRate(c.w, c.p) : "–"}
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{c.kda ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-[#7e8e9f] mt-2">
            {tl(
              'Presence = picked or banned in that share of games. "Top leagues" = the main regional leagues plus Worlds, MSI and other internationals.',
            )}
          </p>
        </div>
      )}
    </div>
  );
};

// ── Records ───────────────────────────────────────────────────────────────

const RecordsPanel: React.FC = () => {
  usePageTitle(tl("Records"));
  const state = useLoad<HubRecords>(loadHubRecords, []);
  return (
    <Page state={state}>
      {(r) => {
        const gameList = (
          title: string,
          rows: HubRecords["game"]["fastest"],
          fmt: (v: number) => string,
        ) => (
          <Section title={title}>
            <ol className="text-xs space-y-1.5">
              {rows.map((g, i) => (
                <li key={i} className="min-w-0">
                  <div className="truncate">
                    <span className="text-[#c8aa6e] font-bold mr-1">
                      {fmt(g.v)}
                    </span>
                    {g.g ? (
                      <HubLink to={{ kind: "match", slug: g.g }}>
                        {tl("{w} beat {l}", {
                          w: g.w,
                          l: g.w === g.a ? g.b : g.a,
                        })}
                      </HubLink>
                    ) : (
                      <span className="text-[#f0e6d2]">
                        {tl("{w} beat {l}", {
                          w: g.w,
                          l: g.w === g.a ? g.b : g.a,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#7e8e9f] truncate">
                    <EventLink
                      name={g.t}
                      u={g.e}
                      className="text-[#7e8e9f] hover:text-[#c8aa6e] hover:underline"
                    />{" "}
                    · {fmtDate(g.date)}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        );
        const playerList = (
          title: string,
          rows: HubRecords["player"]["kills"],
          fmt: (v: number) => string = fmtNum,
        ) => (
          <Section title={title}>
            <ol className="text-xs space-y-1.5">
              {rows.map((p, i) => (
                <li key={i} className="min-w-0">
                  <div className="truncate">
                    <span className="text-[#c8aa6e] font-bold mr-1">
                      {fmt(p.v)}
                    </span>
                    <PlayerLink name={p.pl} u={p.u} />
                    <span className="text-[#9bb3c9]">
                      {" "}
                      {champName(p.c)}{" "}
                      {p.g ? (
                        <HubLink
                          to={{ kind: "match", slug: p.g }}
                          className="text-[#9bb3c9] hover:text-[#c8aa6e] hover:underline"
                        >
                          {p.kda}
                        </HubLink>
                      ) : (
                        p.kda
                      )}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#7e8e9f] truncate">
                    vs {p.opp} ·{" "}
                    <EventLink
                      name={p.t}
                      u={p.e}
                      className="text-[#7e8e9f] hover:text-[#c8aa6e] hover:underline"
                    />{" "}
                    · {fmtDate(p.date)}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        );
        const careerList = (
          title: string,
          rows: HubRecords["career"]["games"],
        ) => (
          <Section title={title}>
            <ol className="text-xs space-y-1.5">
              {rows.map((p, i) => (
                <li key={i} className="flex justify-between gap-2 min-w-0">
                  <PlayerLink name={p.pl} u={p.u} />
                  <span className="text-[#c8aa6e] font-bold">
                    {fmtNum(p.v)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        );
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-[#7e8e9f]">
              {tl(
                "Top leagues and international events only. Games shorter than 14 minutes are skipped, and a game only counts when its numbers agree across Leaguepedia's tables.",
              )}{" "}
              {tl(
                "Career totals count every pro game except All-Star and show matches. The top records were checked against Leaguepedia.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {gameList(tl("Fastest wins"), r.game.fastest, mmss)}
              {gameList(tl("Longest games"), r.game.longest, mmss)}
              {gameList(tl("Most kills in a game"), r.game.bloodiest, (v) =>
                tl("{n} kills", { n: v }),
              )}
              {gameList(
                tl("Won with the biggest gold deficit (end of game)"),
                r.game.comebacks,
                (v) => `${(v / 1000).toFixed(1)}k`,
              )}
              {playerList(tl("Most kills by one player"), r.player.kills)}
              {playerList(tl("Most assists by one player"), r.player.assists)}
              {playerList(
                tl("Best deathless games (kills + assists)"),
                r.player.perfect,
              )}
              {playerList(tl("Most damage in a game"), r.player.dmg)}
              {playerList(tl("Most CS in a game"), r.player.cs)}
              {r.pentas && r.pentas.recent.length > 0 && (
                <PentakillRecords p={r.pentas} />
              )}
              <Section title={tl("Longest win streaks")}>
                <ol className="text-xs space-y-1.5">
                  {r.team.streaks.map((t, i) => (
                    <li key={i} className="flex justify-between gap-2 min-w-0">
                      <TeamLink name={t.team} u={t.u} />
                      <span className="text-[#7e8e9f]">
                        <span className="text-[#c8aa6e] font-bold">
                          {tl("{n} games", { n: t.v })}
                        </span>{" "}
                        · {tl("ended {date}", { date: fmtDate(t.date) })}
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
              <Section
                title={tl(
                  "Most international titles (Worlds, MSI, First Stand)",
                )}
              >
                <ol className="text-xs space-y-1.5">
                  {r.team.titles.map((t, i) => (
                    <li key={i} className="flex justify-between gap-2 min-w-0">
                      <TeamLink name={t.team} u={t.u} />
                      <span className="text-[#7e8e9f]">
                        {t.worlds
                          ? tl("{n} Worlds", { n: t.worlds }) + " · "
                          : ""}
                        <span className="text-[#c8aa6e] font-bold">
                          {tl("{n} total", { n: t.v })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
              {careerList(tl("Most pro games"), r.career.games)}
              {careerList(tl("Most career kills"), r.career.kills)}
              {careerList(tl("Most career assists"), r.career.assists)}
              {careerList(tl("Biggest champion pools"), r.career.pool)}
            </div>
          </div>
        );
      }}
    </Page>
  );
};

// ── Titles ────────────────────────────────────────────────────────────────

const TITLE_FILTERS = [
  { key: "International", label: tk("Worlds, MSI & First Stand") },
  { key: "Worlds", label: tk("Worlds") },
  { key: "Leagues", label: tk("League titles") },
  { key: "All", label: tk("Everything") },
] as const;

const TitlesPanel: React.FC = () => {
  usePageTitle(tl("Titles"));
  const state = useLoad<HubTitle[]>(loadHubTitles, []);
  const [kind, setKind] =
    useState<(typeof TITLE_FILTERS)[number]["key"]>("International");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {TITLE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKind(f.key)}
            className={`px-2.5 py-1.5 rounded-lg border ${
              kind === f.key
                ? "bg-[#c8aa6e] text-[#091428] font-bold border-[#c8aa6e]"
                : "border-[#1e282d] text-[#9bb3c9]"
            }`}
          >
            {tl(f.label)}
          </button>
        ))}
      </div>
      <Page state={state}>
        {(data) => {
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
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={th}>{tl("Event")}</th>
                    <th className={th}>{tc("title winner", "Champion")}</th>
                    <th className={th}>{tc("title match", "Final")}</th>
                    <th className={th}>{tl("Date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => (
                    <tr
                      key={x.t + x.date}
                      className="border-t border-[#1e282d]"
                    >
                      <td className={`${td} max-w-[14rem] truncate`}>
                        <Trophy
                          className={`w-3 h-3 inline mr-1 ${x.kind === "Worlds" ? "text-[#c8aa6e]" : "text-[#7e8e9f]"}`}
                        />
                        <EventLink name={eventTitle(x.t)} u={x.e} />
                      </td>
                      <td className={td}>
                        <TeamLink name={x.as} u={x.u} />
                        {x.as !== x.w && (
                          <span className="text-[#7e8e9f] text-[10px]">
                            {" "}
                            ({tl("now {team}", { team: x.w })})
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-[#9bb3c9]`}>
                        {x.score} vs {x.l}
                      </td>
                      <td className={`${td} text-[#7e8e9f]`}>
                        {fmtDate(x.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Page>
    </div>
  );
};

// ── Compare ───────────────────────────────────────────────────────────────


// ── The Stats tab ─────────────────────────────────────────────────────────

export const StatsView: React.FC<StatsViewProps> = ({
  settings,
  onOpenUrl,
}) => {
  useChampionNames();
  useDDragon();
  const route = useHubRoute();
  const statsMeta = useLoad<StatsMeta>(loadStatsMeta, []);
  const hubMeta = useLoad(loadHubMeta, []);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [route]);

  const isSection = SECTIONS.some((s) => s.kind === route.kind);
  const back = () => {
    if (!hubBack()) navigateHub({ kind: "home" });
  };

  return (
    <SpoilerProvider on={settings.spoilerMode}>
      <div
        ref={scroller}
        className="p-4 space-y-4 max-w-5xl mx-auto overflow-y-auto h-full"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1e282d]">
          <h2 className="text-xs font-bold text-[#c8aa6e] uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> {tl("Pro Stats")}
          </h2>
          {hubMeta.data && (
            <span className="text-[11px] text-[#7e8e9f]">
              {tl("{n} pro games · {from}–{to} · updated daily", {
                n: fmtNum(hubMeta.data.games),
                from: "2011",
                to:
                  hubMeta.data.years.find(
                    (y) => y <= String(new Date().getFullYear()),
                  ) || "",
              })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isSection && (
            <button
              type="button"
              onClick={back}
              className="flex items-center gap-1 text-xs text-[#0ac8b9] hover:underline shrink-0"
              aria-label={tl("Back")}
            >
              <ArrowLeft className="w-3.5 h-3.5" />{" "}
              {canGoBack() ? tl("Back") : tl("Stats home")}
            </button>
          )}
          {!isSection && <CopyLinkButton url={hubShareUrl(route)} />}
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {SECTIONS.map((s) => (
              <HubLink
                key={s.kind}
                to={{ kind: s.kind } as HubRoute}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  route.kind === s.kind
                    ? "bg-[#c8aa6e] text-[#091428] border-[#c8aa6e]"
                    : "border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2] hover:border-[#c8aa6e]/50"
                }`}
              >
                {s.icon}
                {tl(s.label)}
              </HubLink>
            ))}
          </div>
          {route.kind !== "home" && (
            <div className="w-full sm:w-64 sm:ml-auto">
              <HubSearch placeholder={tl("Search…")} />
            </div>
          )}
        </div>

        {settings.spoilerMode && (
          <p className="text-[11px] text-[#c8aa6e] bg-[#c8aa6e]/10 border border-[#c8aa6e]/30 rounded-lg px-3 py-2">
            {tl(
              "Spoiler mode is on: results from the last two weeks are hidden until you reveal them. Older results and career stats still show.",
            )}
          </p>
        )}

        {route.kind === "home" && <HubHome />}
        {route.kind === "tournaments" && (
          <EventsBrowse
            year={route.year}
            meta={hubMeta.data}
            onYear={(y) =>
              navigateHub({ kind: "tournaments", year: y }, { replace: true })
            }
          />
        )}
        {route.kind === "leagues" && <LeaguesPanel />}
        {route.kind === "patches" && <PatchesPanel />}
        {route.kind === "league" && <LeaguePage slug={route.slug} />}
        {route.kind === "champions" &&
          (statsMeta.data ? (
            <ChampionsPanel meta={statsMeta.data} />
          ) : statsMeta.error ? (
            <Failed />
          ) : (
            <Loading />
          ))}
        {route.kind === "records" && <RecordsPanel />}
        {route.kind === "titles" && <TitlesPanel />}
        {route.kind === "compare" && <ComparePage route={route as CompareRoute} />}
        {route.kind === "team" && <TeamPage slug={route.slug} />}
        {route.kind === "player" && (
          <PlayerPage slug={route.slug} onOpenUrl={onOpenUrl} />
        )}
        {route.kind === "event" && <EventPage slug={route.slug} />}
        {route.kind === "match" && (
          <MatchPage slug={route.slug} onOpenUrl={onOpenUrl} />
        )}
        {route.kind === "champ" && <ChampPage slug={route.slug} />}

        <p className="text-[10px] text-[#7e8e9f] text-center pt-2">
          {tl(
            "Stats come from RiftWatch's pro games catalog (built from public Leaguepedia data) and are rebuilt every night.",
          )}
        </p>
      </div>
    </SpoilerProvider>
  );
};
