import React, { useEffect, useState } from "react";
import { X, Swords, Eye, EyeOff, Globe, Home, ClipboardList } from "lucide-react";
import { findHubTeam, loadHubIndex } from "../hub/data";
import { navigateHub } from "../hub/route";
import { Match, CatalogData } from "../types";
import { computeHeadToHead, h2hKey, normalizeTeamCode, pickTeamByCode, recentMeetings, H2HMeeting } from "../helpers";
import { fetchH2HSeries, H2HSeriesEntry } from "../api";
import { H2HBar, T1_COLOR, T2_COLOR } from "./H2HMeter";
import { tl } from "../i18n";

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
      <div className="flex items-center justify-between text-[11px] text-[#7e8e9f] py-1">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span>{tl("never met")}</span>
      </div>
    );
  }
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
        <span className="flex items-center gap-1.5 text-[#9bb3c9] min-w-0 truncate">{icon}{label}</span>
        <span className="font-mono font-bold whitespace-nowrap shrink-0">
          <span style={{ color: T1_COLOR }}>{c1} {wins[0]}</span>
          <span className="text-[#7e8e9f]"> – </span>
          <span style={{ color: T2_COLOR }}>{wins[1]} {c2}</span>
          <span className="hidden sm:inline text-[#7e8e9f] font-normal"> · {tl("{n} games", { n: total })}</span>
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

  const h2h = computeHeadToHead(c1, c2, schedule, matchId, countThisMatch);
  const t1 = teamInfo(catalog, team1Code);
  const t2 = teamInfo(catalog, team2Code);
  const total = h2h ? h2h.team1Wins + h2h.team2Wins : 0;
  const t1Pct = total > 0 ? Math.round((h2h!.team1Wins / total) * 100) : 50;

  const intlRaw = series?.intl ?? [0, 0];
  const intl: [number, number] = flip ? [intlRaw[1], intlRaw[0]] : [intlRaw[0], intlRaw[1]];
  const domestic: [number, number] = h2h
    ? [Math.max(0, h2h.team1Wins - intl[0]), Math.max(0, h2h.team2Wins - intl[1])]
    : [0, 0];
  const meetings: H2HMeeting[] = recentMeetings(c1, c2, series?.recent, schedule, matchId, countThisMatch);

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
        <img src={info.image} alt="" className="w-9 h-9 object-contain shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded bg-[#091428] flex items-center justify-center font-mono text-[10px] text-[#c8aa6e] shrink-0">
          {code.slice(0, 3)}
        </div>
      )}
      <div className="min-w-0">
        <div className="font-bold text-sm whitespace-nowrap" style={{ color }}>{code}</div>
        <div className="hidden sm:block text-[10px] text-[#7e8e9f] truncate">{info.name}</div>
      </div>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={tl("Head-to-head history: {a} vs {b}", { a: c1, b: c2 })}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-[#0a1420] border border-[#c8aa6e]/50 rounded-t-2xl sm:rounded-xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e282d]">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#c8aa6e] font-semibold">
            <Swords className="w-3.5 h-3.5 text-[#0ac8b9]" />
            {tl("All-time head-to-head")}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tl("Close")}
            className="p-1 rounded text-[#7e8e9f] hover:text-[#f0e6d2] hover:bg-[#1e282d]"
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
                    <span style={{ color: T1_COLOR }}>{h2h.team1Wins}</span>
                    <span className="text-[#7e8e9f] mx-1.5">–</span>
                    <span style={{ color: T2_COLOR }}>{h2h.team2Wins}</span>
                  </div>
                  <div className="text-[10px] text-[#7e8e9f]">{tl("{n} games · all tournaments", { n: total })}</div>
                </>
              ) : (
                <div className="text-xs text-[#7e8e9f]">{tl("No recorded games")}</div>
              )}
            </div>
            <Team code={c2} info={t2} color={T2_COLOR} align="right" />
          </div>
          {h2h && <H2HBar t1Pct={t1Pct} className="h-2" />}

          {h2h && (
            <div className="rounded-lg bg-[#091428] border border-[#1e282d] px-3 py-1.5">
              <Split icon={<Globe className="w-3 h-3 text-[#c8aa6e]" />} label={tl("Worlds · MSI · First Stand")} wins={intl} c1={c1} c2={c2} />
              <Split icon={<Home className="w-3 h-3 text-[#9bb3c9]" />} label={tl("Domestic & other events")} wins={domestic} c1={c1} c2={c2} />
              {series === undefined && !failed && (
                <div className="text-[10px] text-[#7e8e9f] py-1">{tl("Loading tournament split…")}</div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-[#c8aa6e] font-semibold">{tl("Recent meetings")}</div>
              {spoilerMode && meetings.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRevealed((r) => !r)}
                  className="flex items-center gap-1 text-[10px] text-[#9bb3c9] hover:text-[#c8aa6e]"
                  aria-label={revealed ? tl("Hide scores") : tl("Reveal scores")}
                >
                  {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {revealed ? tl("Hide scores") : tl("Reveal scores")}
                </button>
              )}
            </div>
            {meetings.length === 0 ? (
              <div className="text-[11px] text-[#7e8e9f] py-2">
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
                      className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded bg-[#091428] border border-[#1e282d]"
                    >
                      <div className="min-w-0">
                        <div className="text-[#f0e6d2] truncate">{m.tournament}</div>
                        <div className="text-[10px] text-[#7e8e9f] font-mono">{m.date}</div>
                      </div>
                      {revealed ? (
                        <div className="font-mono font-bold shrink-0">
                          <span style={{ color: T1_COLOR }}>{c1} {m.team1Score}</span>
                          <span className="text-[#7e8e9f]"> – </span>
                          <span style={{ color: T2_COLOR }}>{m.team2Score} {c2}</span>
                          <span className="ml-2 text-[10px] font-sans font-semibold" style={{ color: t1Won ? T1_COLOR : T2_COLOR }}>
                            {tl("{team} won", { team: t1Won ? c1 : c2 })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#7e8e9f] shrink-0">{tl("score hidden")}</span>
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
      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#c8aa6e]/40 text-[#c8aa6e] text-xs font-semibold hover:bg-[#c8aa6e]/10 disabled:opacity-60"
    >
      <ClipboardList className="w-3.5 h-3.5" />
      {tl("Match prep: form, drafts, lanes and storylines")}
    </button>
  );
};
