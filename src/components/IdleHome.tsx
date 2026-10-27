/**
 * The Live tab when nothing is on: something to read instead of an empty "no matches" strip. The latest results
 * (spoiler-safe: scores wait for Reveal in spoiler mode), the top of the power rankings, and the stats pages
 * people use most. Three of four visits ended on the home page before this (2026-10-26 logs).
 */
import React, { useMemo } from "react";
import { ArrowRight, BarChart3, Columns2, ClipboardList, EyeOff, Trophy } from "lucide-react";
import { Match, AppSettings } from "../types";
import { tl, tc, locale } from "../i18n";
import { isRevealed, setRevealed } from "../revealed";
import { navigateHub } from "../hub/route";
import { loadRatings } from "../hub/data";
import { useLoad } from "./hub/ui";
import { riotImg } from "../riotImage";
import { clickable, OPEN_TAB_EVENT } from "../a11y";

const HEAD = "font-head text-xs font-semibold uppercase tracking-wider text-rw-text";

/** The latest finished series, newest first: scores shown only when spoiler mode is off or the match is revealed. */
const LatestResults: React.FC<{ schedule: Match[]; settings: AppSettings; onSelectTab: (tab: "schedule") => void }> = ({ schedule, settings, onSelectTab }) => {
  const done = useMemo(
    () =>
      schedule
        .filter((m) => m.state === "completed" && m.team1Code !== "TBD" && m.team2Code !== "TBD")
        .sort((a, b) => b.startTimeUtc.localeCompare(a.startTimeUtc))
        .slice(0, 6),
    [schedule],
  );
  if (!done.length) return null;
  const when = (iso: string) => {
    const d = new Date(iso);
    const days = Math.round((Date.now() - d.getTime()) / 86400000);
    return days < 1 ? tl("Today") : days === 1 ? tl("Yesterday") : d.toLocaleDateString(locale(), { month: "short", day: "numeric" });
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className={HEAD}>{tl("Latest results")}</h2>
        <button type="button" onClick={() => onSelectTab("schedule")} className="text-rw-teal hover:underline text-[11px] font-medium">
          {tl("All results →")}
        </button>
      </div>
      {/* why the scores are buttons: spoiler mode hides results until asked */}
      {settings.spoilerMode && done.some((m) => !isRevealed(`match:${m.matchId}`)) && (
        <p className="flex items-start gap-1.5 text-[11px] text-rw-sub">
          <EyeOff className="w-3.5 h-3.5 shrink-0 mt-px text-rw-accent" />
          <span>
            {tl("Spoiler mode is on, so scores stay hidden until you press Reveal.")}{" "}
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: "settings" }))} className="text-rw-teal hover:underline">
              {tl("Turn it off in Settings")}
            </button>
          </span>
        </p>
      )}
      <ul className="divide-y divide-rw-border border border-rw-border rounded-lg bg-rw-surface">
        {done.map((m) => {
          const shown = !settings.spoilerMode || isRevealed(`match:${m.matchId}`);
          const w1 = shown && m.team1Score > m.team2Score;
          const w2 = shown && m.team2Score > m.team1Score;
          return (
            <li key={m.matchId} className="flex items-center gap-2 px-3 py-2 text-xs min-w-0">
              <span className="w-24 shrink-0 text-[11px] text-rw-muted truncate" title={m.leagueName}>
                {m.leagueName}
              </span>
              <span className={`flex-1 min-w-0 text-right truncate ${w1 ? "font-bold text-rw-text" : "text-rw-sub"}`}>{m.team1Name}</span>
              {m.team1Image && <img {...riotImg(m.team1Image, 40)} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
              {shown ? (
                <span className="font-num tabular-nums font-bold text-rw-text w-12 text-center shrink-0">
                  {m.team1Score}–{m.team2Score}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealed(`match:${m.matchId}`, true)}
                  className="w-12 shrink-0 text-[10px] rounded border border-rw-accent/50 text-rw-accent hover:bg-rw-accent/10 px-1 py-0.5"
                >
                  {tl("Reveal")}
                </button>
              )}
              {m.team2Image && <img {...riotImg(m.team2Image, 40)} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
              <span className={`flex-1 min-w-0 truncate ${w2 ? "font-bold text-rw-text" : "text-rw-sub"}`}>{m.team2Name}</span>
              <span className="w-16 shrink-0 text-right text-[11px] text-rw-muted">{when(m.startTimeUtc)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** The five highest-rated teams right now, from the power rankings. */
const TopTeams: React.FC<{ onSelectTab: (tab: "stats") => void }> = ({ onSelectTab }) => {
  const ratings = useLoad(() => loadRatings().catch(() => null), []);
  const top = useMemo(() => (ratings.data?.teams || []).filter((t) => t[9] === 1).sort((a, b) => b[5] - a[5]).slice(0, 5), [ratings.data]);
  if (!top.length) return null;
  const open = (slug?: string) => {
    navigateHub(slug ? { kind: "team", slug } : { kind: "rankings" });
    onSelectTab("stats");
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className={HEAD}>{tl("Power rankings")}</h2>
        <button type="button" onClick={() => open()} className="text-rw-teal hover:underline text-[11px] font-medium">
          {tl("Every team →")}
        </button>
      </div>
      <ol className="border border-rw-border rounded-lg bg-rw-surface divide-y divide-rw-border">
        {top.map((t, i) => (
          <li key={t[0]} {...clickable(() => open(t[0]))} className="flex items-center gap-3 px-3 py-1.5 text-xs cursor-pointer hover:bg-rw-raised">
            <span className="w-4 text-rw-muted font-num tabular-nums">{i + 1}</span>
            <span className="font-semibold text-rw-text flex-1 min-w-0 truncate">{t[1]}</span>
            <span className="text-[11px] text-rw-muted">{t[10] || t[3]}</span>
            <span className="font-num tabular-nums font-bold text-rw-accent w-12 text-right">{Math.round(t[5])}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};

/** Where to go from here: the stats pages people use most. */
const Explore: React.FC<{ onSelectTab: (tab: "stats") => void; worlds: boolean }> = ({ onSelectTab, worlds }) => {
  const go = (kind: "prep" | "compare" | "rankings" | "worlds" | "records") => {
    navigateHub({ kind });
    onSelectTab("stats");
  };
  const tiles: { kind: "prep" | "compare" | "rankings" | "worlds" | "records"; icon: React.ReactNode; title: string; sub: string }[] = [
    { kind: "prep", icon: <ClipboardList className="w-4 h-4" />, title: tl("Match prep"), sub: tl("Storylines, form and every lane for any two teams") },
    { kind: "compare", icon: <Columns2 className="w-4 h-4" />, title: tl("Compare"), sub: tl("Two or more teams or players side by side") },
    { kind: "rankings", icon: <BarChart3 className="w-4 h-4" />, title: tl("Power rankings"), sub: tl("Every team, every region, one scale") },
    worlds
      ? { kind: "worlds", icon: <Trophy className="w-4 h-4" />, title: tc("event", "Worlds"), sub: tl("Facts, the Swiss stage and the bracket picker") }
      : { kind: "records", icon: <Trophy className="w-4 h-4" />, title: tl("Records"), sub: tl("The biggest numbers in pro play since 2011") },
  ];
  return (
    <section className="space-y-2">
      <h2 className={HEAD}>{tl("Explore the stats")}</h2>
      <div className="grid gap-2 sm:grid-cols-2 @container">
        {tiles.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => go(t.kind)}
            className="text-left rounded-lg border border-rw-border bg-rw-surface hover:bg-rw-raised hover:border-rw-accent/50 px-3 py-2.5 flex items-start gap-3"
          >
            <span className="mt-0.5 text-rw-accent shrink-0">{t.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-rw-text">{t.title}</span>
              <span className="block text-[11px] text-rw-sub leading-snug">{t.sub}</span>
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-rw-muted shrink-0 mt-1" />
          </button>
        ))}
      </div>
    </section>
  );
};

export const IdleHome: React.FC<{
  schedule: Match[];
  settings: AppSettings;
  onSelectTab: (tab: "schedule" | "stats") => void;
}> = ({ schedule, settings, onSelectTab }) => {
  const worlds = useMemo(() => schedule.some((m) => m.leagueSlug === "worlds"), [schedule]);
  return (
    <div className="space-y-6">
      <LatestResults schedule={schedule} settings={settings} onSelectTab={onSelectTab} />
      <Explore onSelectTab={onSelectTab} worlds={worlds} />
      <TopTeams onSelectTab={onSelectTab} />
    </div>
  );
};
