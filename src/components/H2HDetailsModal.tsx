import React, { useEffect, useRef, useState } from "react";
import { X, Swords, Eye, EyeOff, Globe, Home, ClipboardList } from "lucide-react";
import { findHubTeam, loadHubIndex } from "../hub/data";
import { navigateHub } from "../hub/route";
import { Match, CatalogData } from "../types";
import { computeHeadToHead, h2hKey, normalizeTeamCode, pickTeamByCode, recentMeetings, H2HMeeting } from "../helpers";
import { fetchH2HSeries, H2HSeriesEntry } from "../api";
import { H2HBar, T1_COLOR, T2_COLOR } from "./H2HMeter";
import { fmtDate } from "./hub/ui";
import { tl, tn } from "../i18n";
import { riotImg } from "../riotImage";

interface H2HDetailsModalProps {
  team1Code: string;
  team2Code: string;
  /** Match the view was opened from; its own result is not counted. */
  matchId?: string;
  /** False while the match's score is hidden: its games stay out of the record. */
  countThisMatch?: boolean;
  schedule: Match[];
  catalog?: CatalogData;
  spoilerMode: boolean;
  onClose: () => void;
  onSelectTeam?: (teamCode: string, teamName?: string) => void;
}

function teamInfo(catalog: CatalogData | undefined, code: string) {
  const t = catalog ? pickTeamByCode(catalog.teams, code) : undefined;
  return { name: t?.name || code, image: t?.image };
}

const Split: React.FC<{ icon: React.ReactNode; label: string; wins: [number, number]; c1: string; c2: string }> = ({
  icon,
  label,
  wins,
  c1,
  c2,
}) => {
  const total = wins[0] + wins[1];
  if (total === 0) {
    return (
      <div className="flex items-center justify-between text-[11px] text-rw-muted py-1">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span>{tl("never met")}</span>
      </div>
    );
  }
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
        <span className="flex items-center gap-1.5 text-rw-sub min-w-0 truncate">{icon}{label}</span>
        <span className="font-mono font-bold whitespace-nowrap shrink-0">
          <span style={{ color: T1_COLOR }}>{c1} {wins[0]}</span>
          <span className="text-rw-muted"> – </span>
          <span style={{ color: T2_COLOR }}>{wins[1]} {c2}</span>
          <span className="hidden sm:inline text-rw-muted font-normal"> · {tn("{n} game", "{n} games", total)}</span>
        </span>
      </div>
      <H2HBar t1Pct={Math.round((wins[0] / total) * 100)} className="h-1" />
    </div>
  );
};

export const H2HDetailsModal: React.FC<H2HDetailsModalProps> = ({
  team1Code,
  team2Code,
  matchId,
  countThisMatch = true,
  schedule,
  catalog,
  spoilerMode,
  onClose,
  onSelectTeam,
}) => {
  const [series, setSeries] = useState<H2HSeriesEntry | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState(!spoilerMode);

  const c1 = normalizeTeamCode(team1Code);
  const c2 = normalizeTeamCode(team2Code);
  const key = h2hKey(c1, c2);
  const flip = key.split("__")[0] !== c1; // series data is from the alphabetically-first team's side

  useEffect(() => {
    let cancelled = false;
    setSeries(undefined);
    setFailed(false);
    fetchH2HSeries(key)
      .then((s) => !cancelled && setSeries(s))
      .catch(() => !cancelled && (setSeries(null), setFailed(true)));
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // keyboard and screen-reader users land in the dialog, and go back to where they were when it closes
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  const h2h = computeHeadToHead(c1, c2, schedule, matchId, countThisMatch);
  const t1 = teamInfo(catalog, team1Code);
  const t2 = teamInfo(catalog, team2Code);
  const total = h2h ? h2h.team1Wins + h2h.team2Wins : 0;
  const t1Pct = total > 0 ? Math.round((h2h!.team1Wins / total) * 100) : 50;

  // Worlds / MSI / First Stand: the published history up to the H2H data's cutoff, plus newer results from the schedule
  const intlRaw = series?.intl ?? [0, 0];
  const intl: [number, number] = flip ? [intlRaw[1], intlRaw[0]] : [intlRaw[0], intlRaw[1]];
  if (h2h) {
    intl[0] += h2h.scheduleBigT1;
    intl[1] += h2h.scheduleBigT2;
  }
  const domestic: [number, number] = h2h
    ? [Math.max(0, h2h.team1Wins - intl[0]), Math.max(0, h2h.team2Wins - intl[1])]
    : [0, 0];
  const meetings: H2HMeeting[] = recentMeetings(c1, c2, series?.recent, schedule, matchId, countThisMatch);
  // spoiler mode: a meeting in the last two weeks would show in the totals, so they wait for Reveal too
  const freshMeeting = meetings.some((m) => Date.now() - new Date(m.date).getTime() < 14 * 86400_000);
  const hideTotals = spoilerMode && !revealed && freshMeeting;

  const Team: React.FC<{ code: string; info: { name: string; image?: string }; color: string; align: "left" | "right" }> = ({
    code,
    info,
    color,
    align,
  }) => (
    <button
      type="button"
      onClick={() => onSelectTeam?.(code, info.name)}
      className={`flex items-center gap-2 min-w-0 ${align === "right" ? "flex-row-reverse text-right" : "text-left"} hover:opacity-80`}
      title={tl("View {team} roster", { team: info.name })}
    >
      {info.image ? (
        <img {...riotImg(info.image, 96)} alt="" className="w-9 h-9 object-contain shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded bg-rw-bg flex items-center justify-center font-mono text-[10px] text-rw-accent shrink-0">
          {code.slice(0, 3)}
        </div>
      )}
      <div className="min-w-0">
        <div className="font-bold text-sm whitespace-nowrap" style={{ color }}>{code}</div>
        <div className="hidden sm:block text-[10px] text-rw-muted truncate">{info.name}</div>
      </div>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={tl("Head-to-head history: {a} vs {b}", { a: c1, b: c2 })}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-rw-surface border border-rw-accent/50 rounded-t-2xl sm:rounded-xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-rw-border">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rw-accent font-semibold">
            <Swords className="w-3.5 h-3.5 text-rw-teal" />
            {tl("All-time head-to-head")}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={tl("Close")}
            className="p-1.5 -m-0.5 rounded text-rw-muted hover:text-rw-text hover:bg-rw-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Team code={c1} info={t1} color={T1_COLOR} align="left" />
            <div className="text-center shrink-0">
              {h2h ? (
                <>
                  <div className="font-mono font-extrabold text-2xl">
                    <span style={{ color: T1_COLOR }}>{hideTotals ? "?" : h2h.team1Wins}</span>
                    <span className="text-rw-muted mx-1.5">–</span>
                    <span style={{ color: T2_COLOR }}>{hideTotals ? "?" : h2h.team2Wins}</span>
                  </div>
                  <div className="text-[10px] text-rw-muted">{tl("{n} games · all tournaments", { n: total })}</div>
                </>
              ) : (
                <div className="text-xs text-rw-muted">{tl("No recorded games")}</div>
              )}
            </div>
            <Team code={c2} info={t2} color={T2_COLOR} align="right" />
          </div>
          {h2h && !hideTotals && <H2HBar t1Pct={t1Pct} className="h-2" />}

          {h2h && !hideTotals && (
            <div className="rounded-lg bg-rw-bg border border-rw-border px-3 py-1.5">
              <Split icon={<Globe className="w-3 h-3 text-rw-accent" />} label={tl("Worlds · MSI · First Stand")} wins={intl} c1={c1} c2={c2} />
              <Split icon={<Home className="w-3 h-3 text-rw-sub" />} label={tl("Domestic & other events")} wins={domestic} c1={c1} c2={c2} />
              {series === undefined && !failed && (
                <div className="text-[10px] text-rw-muted py-1">{tl("Loading tournament split…")}</div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-rw-accent font-semibold">{tl("Recent meetings")}</div>
              {spoilerMode && meetings.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRevealed((r) => !r)}
                  className="flex items-center gap-1 text-[10px] text-rw-sub hover:text-rw-accent"
                  aria-label={revealed ? tl("Hide scores") : tl("Reveal scores")}
                >
                  {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {revealed ? tl("Hide scores") : tl("Reveal scores")}
                </button>
              )}
            </div>
            {meetings.length === 0 ? (
              <div className="text-[11px] text-rw-muted py-2">
                {series === undefined && !failed
                  ? tl("Loading…")
                  : failed
                    ? tl("Couldn't load the match history right now.")
                    : tl("No past series on record.")}
              </div>
            ) : (
              <ul className="space-y-1">
                {meetings.map((m, i) => {
                  const t1Won = m.team1Score > m.team2Score;
                  return (
                    <li
                      key={`${m.date}-${m.tournament}-${i}`}
                      className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded bg-rw-bg border border-rw-border"
                    >
                      <div className="min-w-0">
                        <div className="text-rw-text truncate">{m.tournament}</div>
                        <div className="text-[10px] text-rw-muted font-mono">{fmtDate(m.date)}</div>
                      </div>
                      {revealed ? (
                        <div className="font-mono font-bold shrink-0">
                          <span style={{ color: T1_COLOR }}>{c1} {m.team1Score}</span>
                          <span className="text-rw-muted"> – </span>
                          <span style={{ color: T2_COLOR }}>{m.team2Score} {c2}</span>
                          <span className="ml-2 text-[10px] font-sans font-semibold" style={{ color: t1Won ? T1_COLOR : T2_COLOR }}>
                            {tl("{team} won", { team: t1Won ? c1 : c2 })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-rw-muted shrink-0">{tl("score hidden")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <PrepButton t1={{ code: team1Code, name: t1.name }} t2={{ code: team2Code, name: t2.name }} onDone={onClose} />
        </div>
      </div>
    </div>
  );
};

/** "Match prep": opens the stats hub's prep page for these two teams (when both are in the stats). */
const PrepButton: React.FC<{ t1: { code: string; name: string }; t2: { code: string; name: string }; onDone: () => void }> = ({ t1, t2, onDone }) => {
  const [state, setState] = useState<"" | "busy" | "missing">("");
  if (state === "missing") return null;
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={() => {
        setState("busy");
        loadHubIndex()
          .then((index) => {
            const a = findHubTeam(index, t1.name, t1.code);
            const b = findHubTeam(index, t2.name, t2.code);
            if (!a || !b) return setState("missing");
            navigateHub({ kind: "prep", a, b });
            onDone();
          })
          .catch(() => setState("missing"));
      }}
      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-rw-accent/40 text-rw-accent text-xs font-semibold hover:bg-rw-accent/10 disabled:opacity-60"
    >
      <ClipboardList className="w-3.5 h-3.5" />
      {tl("Match prep: form, drafts, lanes and storylines")}
    </button>
  );
};
