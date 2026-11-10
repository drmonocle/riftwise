import React, { useEffect, useRef, useState } from "react";
import { X, Swords, Eye, EyeOff, Globe, Home, ClipboardList, GitCompare } from "lucide-react";
import { findHubTeam, loadHubIndexQuick, prettySlug, resolveLeagueSlug } from "../hub/data";
import { navigateHub } from "../hub/route";
import { RIOT_PREFIX } from "../hub/riotMatch";
import { findSeriesSlug } from "../hub/seriesLookup";
import { Match, CatalogData } from "../types";
import { computeHeadToHead, h2hKey, normalizeTeamCode, pickTeamByCode, recentMeetings, H2HMeeting } from "../helpers";
import { fetchH2HSeries, H2HSeriesEntry } from "../api";
import { H2HBar, T1_COLOR, T2_COLOR } from "./H2HMeter";
import { fmtDate, useTeamLogo } from "./hub/ui";
import { SectionCard } from "./hub/BroadcastCard";
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
  return { name: t?.name || code, image: t?.image, league: t?.league ? resolveLeagueSlug(t.league) : undefined };
}

const Split: React.FC<{ icon: React.ReactNode; label: string; wins: [number, number]; c1: string; c2: string; onClick?: () => void }> = ({
  icon,
  label,
  wins,
  c1,
  c2,
  onClick,
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
  const inner = (
    <>
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
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="block w-full text-left py-1 hover:opacity-85" title={tl("Game finder")}>
      {inner}
    </button>
  ) : (
    <div className="py-1">{inner}</div>
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
  }) => {
    const hubLogo = useTeamLogo(info.name, code);
    const imgSrc = info.image || hubLogo;
    return (
      <button
        type="button"
        onClick={() => onSelectTeam?.(code, info.name)}
        className={`flex items-center gap-2 min-w-0 ${align === "right" ? "flex-row-reverse text-right" : "text-left"} hover:opacity-80`}
        title={tl("View {team} roster", { team: info.name })}
      >
        {imgSrc ? (
          <img {...riotImg(imgSrc, 96)} alt="" className="w-9 h-9 object-contain shrink-0" />
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
  };

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
          <div className="flex items-center gap-2">
            {h2h && !hideTotals && (
              <SectionCard
                section={`${c1} vs ${c2} · ${tl("All-time head-to-head")}`}
                sub={tl("{n} games · all tournaments", { n: total })}
                name={`${c1}-vs-${c2}-h2h`}
                rows={() =>
                  [
                    {
                      team: h2h.team1Wins >= h2h.team2Wins ? t1.name || c1 : t2.name || c2,
                      label: tl("All-time head-to-head"),
                      sub: `${t1.name} vs ${t2.name}`,
                      value: `${c1} ${h2h.team1Wins} – ${h2h.team2Wins} ${c2}`,
                      win: h2h.team1Wins !== h2h.team2Wins ? h2h.team1Wins > h2h.team2Wins : undefined,
                    },
                    ...(intl[0] + intl[1] > 0
                      ? [
                          {
                            team: intl[0] >= intl[1] ? t1.name || c1 : t2.name || c2,
                            label: tl("Worlds · MSI · First Stand"),
                            value: `${c1} ${intl[0]} – ${intl[1]} ${c2}`,
                            win: intl[0] !== intl[1] ? intl[0] > intl[1] : undefined,
                          },
                        ]
                      : []),
                    ...(domestic[0] + domestic[1] > 0
                      ? [
                          {
                            team: domestic[0] >= domestic[1] ? t1.name || c1 : t2.name || c2,
                            label: tl("Domestic & other events"),
                            value: `${c1} ${domestic[0]} – ${domestic[1]} ${c2}`,
                            win: domestic[0] !== domestic[1] ? domestic[0] > domestic[1] : undefined,
                          },
                        ]
                      : []),
                    ...(revealed
                      ? meetings.slice(0, 6).map((m) => ({
                          team: m.team1Score >= m.team2Score ? t1.name || c1 : t2.name || c2,
                          label: m.tournament,
                          sub: fmtDate(m.date),
                          value: `${c1} ${m.team1Score} – ${m.team2Score} ${c2}`,
                          win: m.team1Score !== m.team2Score ? m.team1Score > m.team2Score : undefined,
                        }))
                      : []),
                  ].map((r, idx) => ({ ...r, rank: idx + 1 }))
                }
              />
            )}
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
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Team code={c1} info={t1} color={T1_COLOR} align="left" />
            <div className="text-center shrink-0">
              {h2h ? (
                <>
                  <div className="font-mono font-extrabold text-2xl">
                    {hideTotals ? (
                      <>
                        <span style={{ color: T1_COLOR }}>?</span>
                        <span className="text-rw-muted mx-1.5">–</span>
                        <span style={{ color: T2_COLOR }}>?</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          navigateHub({
                            kind: "compare",
                            mode: "team",
                            a: prettySlug(t1.name),
                            b: prettySlug(t2.name),
                          });
                          onClose();
                        }}
                        className="hover:opacity-85 hover:underline"
                        title={tl("Compare")}
                      >
                        <span style={{ color: T1_COLOR }}>{h2h.team1Wins}</span>
                        <span className="text-rw-muted mx-1.5">–</span>
                        <span style={{ color: T2_COLOR }}>{h2h.team2Wins}</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigateHub({
                        kind: "finder",
                        query: new URLSearchParams({ team: prettySlug(t1.name), vs: prettySlug(t2.name) }).toString(),
                      });
                      onClose();
                    }}
                    className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
                    title={tl("Game finder")}
                  >
                    {tl("{n} games · all tournaments", { n: total })}
                  </button>
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
              <Split
                icon={<Globe className="w-3 h-3 text-rw-accent" />}
                label={tl("Worlds · MSI · First Stand")}
                wins={intl}
                c1={c1}
                c2={c2}
                onClick={() => {
                  navigateHub({
                    kind: "finder",
                    query: new URLSearchParams({ team: prettySlug(t1.name), vs: prettySlug(t2.name) }).toString(),
                  });
                  onClose();
                }}
              />
              <Split
                icon={<Home className="w-3 h-3 text-rw-sub" />}
                label={tl("Domestic & other events")}
                wins={domestic}
                c1={c1}
                c2={c2}
                onClick={() => {
                  navigateHub({
                    kind: "finder",
                    query: new URLSearchParams({ team: prettySlug(t1.name), vs: prettySlug(t2.name) }).toString(),
                  });
                  onClose();
                }}
              />
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
                  const tot = m.team1Score + m.team2Score;
                  const share1 = tot > 0 ? Math.round((m.team1Score / tot) * 100) : 50;
                  return (
                    <li
                      key={`${m.date}-${m.tournament}-${i}`}
                      className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded bg-rw-bg border border-rw-border"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigateHub({ kind: "event", slug: prettySlug(m.tournament) });
                            onClose();
                          }}
                          className="text-rw-text hover:text-rw-accent hover:underline truncate block max-w-full text-left"
                        >
                          {m.tournament}
                        </button>
                        <div className="text-[10px] text-rw-muted font-mono">{fmtDate(m.date)}</div>
                      </div>
                      {revealed ? (
                        <button
                          type="button"
                          onClick={() => {
                            findSeriesSlug({
                              team1Name: t1.name,
                              team1Code: c1,
                              team2Name: t2.name,
                              team2Code: c2,
                              startTimeUtc: m.date,
                            })
                              .then((slug) => {
                                if (slug) {
                                  navigateHub({ kind: "match", slug });
                                  onClose();
                                  return;
                                }
                                const day = m.date.slice(0, 10);
                                const hit = schedule.find(
                                  (sm) =>
                                    sm.startTimeUtc.slice(0, 10) === day &&
                                    ((normalizeTeamCode(sm.team1Code) === c1 && normalizeTeamCode(sm.team2Code) === c2) ||
                                      (normalizeTeamCode(sm.team1Code) === c2 && normalizeTeamCode(sm.team2Code) === c1)),
                                );
                                if (hit) {
                                  navigateHub({ kind: "match", slug: `${RIOT_PREFIX}${hit.matchId}` });
                                } else {
                                  navigateHub({
                                    kind: "finder",
                                    query: new URLSearchParams({
                                      team: prettySlug(t1.name),
                                      vs: prettySlug(t2.name),
                                      ...(m.date.length >= 4 ? { year: m.date.slice(0, 4) } : {}),
                                    }).toString(),
                                  });
                                }
                                onClose();
                              })
                              .catch(() => {});
                          }}
                          className="inline-flex items-center gap-2 font-mono font-bold shrink-0 hover:opacity-80"
                          title={tl("Details")}
                        >
                          {tot > 0 && (
                            <span className="hidden sm:inline-flex w-9 h-1 rounded-full bg-rw-border/70 overflow-hidden gap-[1px] shrink-0" aria-hidden="true">
                              <span className="h-full" style={{ width: `${share1}%`, backgroundColor: T1_COLOR }} />
                              <span className="h-full flex-1" style={{ backgroundColor: T2_COLOR }} />
                            </span>
                          )}
                          <span className="hover:underline">
                            <span style={{ color: T1_COLOR }}>{c1} {m.team1Score}</span>
                            <span className="text-rw-muted"> – </span>
                            <span style={{ color: T2_COLOR }}>{m.team2Score} {c2}</span>
                          </span>
                          <span className="text-[10px] font-sans font-semibold" style={{ color: t1Won ? T1_COLOR : T2_COLOR }}>
                            {tl("{team} won", { team: t1Won ? c1 : c2 })}
                          </span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-rw-muted shrink-0">{tl("score hidden")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <PrepButton
            t1={{ code: team1Code, name: t1.name, league: t1.league }}
            t2={{ code: team2Code, name: t2.name, league: t2.league }}
            year={meetings[0]?.date && /^\d{4}/.test(meetings[0].date) ? meetings[0].date.slice(0, 4) : undefined}
            onDone={onClose}
          />
        </div>
      </div>
    </div>
  );
};

/** "Match prep" + "Draft board" + "Compare": opens the stats hub's tools for these two teams (when both are in the stats). */
const PrepButton: React.FC<{
  t1: { code: string; name: string; league?: string };
  t2: { code: string; name: string; league?: string };
  year?: string;
  onDone: () => void;
}> = ({ t1, t2, year, onDone }) => {
  const [state, setState] = useState<"" | "busy" | "missing">("");
  if (state === "missing") return null;
  const lg = t1.league && t1.league === t2.league ? t1.league : t1.league || t2.league;
  const openRoute = (dest: (a: string, b: string) => void) => {
    setState("busy");
    loadHubIndexQuick()
      .then((index) => {
        const a = findHubTeam(index, t1.name, t1.code);
        const b = findHubTeam(index, t2.name, t2.code);
        if (!a || !b) return setState("missing");
        dest(a, b);
        onDone();
      })
      .catch(() => setState("missing"));
  };
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={() => openRoute((a, b) => navigateHub({ kind: "prep", a, b }))}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-rw-accent/40 text-rw-accent text-xs font-semibold hover:bg-rw-accent/10 disabled:opacity-60"
      >
        <ClipboardList className="w-3.5 h-3.5" />
        {tl("Match prep: form, drafts, lanes and storylines")}
      </button>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() =>
            openRoute((a, b) => navigateHub({ kind: "draft", query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}` }))
          }
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/40 text-xs font-semibold disabled:opacity-60"
        >
          <Swords className="w-3.5 h-3.5" />
          {tl("Draft board")}
        </button>
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() => openRoute((a, b) => navigateHub({ kind: "compare", mode: "team", a, b }))}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/40 text-xs font-semibold disabled:opacity-60"
        >
          <GitCompare className="w-3.5 h-3.5" />
          {tl("Compare")}
        </button>
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() =>
            openRoute((a, b) => navigateHub({ kind: "finder", query: `team=${encodeURIComponent(a)}&vs=${encodeURIComponent(b)}` }))
          }
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/40 text-xs font-semibold disabled:opacity-60"
        >
          {tl("Game finder")}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() => openRoute(() => navigateHub({ kind: "rankings", ...(lg ? { query: `league=${encodeURIComponent(lg)}` } : {}) }))}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/40 text-xs font-semibold disabled:opacity-60"
        >
          {tl("Power rankings")}
        </button>
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() =>
            openRoute(() =>
              navigateHub({
                kind: "tiers",
                ...((lg || year)
                  ? {
                      query: new URLSearchParams({
                        ...(lg ? { league: lg } : {}),
                        ...(year ? { key: `y${year}` } : {}),
                      }).toString(),
                    }
                  : {}),
              }),
            )
          }
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/40 text-xs font-semibold disabled:opacity-60"
        >
          {tl("Pro tier list")}
        </button>
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() =>
            openRoute(() =>
              navigateHub({
                kind: "leaders",
                ...((lg || year)
                  ? {
                      query: new URLSearchParams({
                        ...(lg ? { league: lg } : {}),
                        ...(year ? { year } : {}),
                      }).toString(),
                    }
                  : {}),
              }),
            )
          }
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/40 text-xs font-semibold disabled:opacity-60"
        >
          {tl("Player leaderboards")}
        </button>
      </div>
    </div>
  );
};
