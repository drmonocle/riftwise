import React, { useState, useEffect, useMemo } from "react";
import { StreamEvent, StreamStatus, AppSettings, CatalogData } from "../../types";
import { streamPhase, streamEventTitle, upcomingStreamMatches } from "../../helpers";
import { Radio, Play, ExternalLink, Flame, Star, Moon, ChevronDown } from "lucide-react";
import { tl, tn, locale, stageName } from "../../i18n";
import { lazyPart } from "../../lazyPart";
import { PartBoundary } from "../PartBoundary";
// Loaded with the stats hub code, only when the 24/7 tab is opened
const StreamBracket = lazyPart(() => import("../hub/StreamBracket").then((m) => m.StreamBracket));

interface StreamViewProps {
  events: StreamEvent[];
  status?: StreamStatus | null;
  settings: AppSettings;
  catalog?: CatalogData;
  onOpenUrl: (url: string) => void;
  onSelectTab?: (tab: any) => void;
}

const TWITCH_URL = "https://www.twitch.tv/LoLWorldChampionship";
const YOUTUBE_LIVE_URL = "https://www.youtube.com/@LoLWorldChampionships/live";
const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@LoLWorldChampionships";
const DISCORD_URL = "https://discord.gg/UCRhtZzVhF";
const DAYS_SHOWN = 3;

const ts = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

function relTime(iso?: string, now = Date.now()): string {
  const diff = ts(iso) - now;
  if (isNaN(diff)) return "";
  if (diff <= 0) return tl("now");
  const mins = Math.floor(diff / 60000);
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return tl("in {d}d {h}h", { d, h: h % 24 });
  if (h > 0) return tl("in {h}h {m}m", { h, m: mins % 60 });
  return tl("in {m}m", { m: Math.max(1, mins) });
}

function clock(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }) : "--:--";
}

function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((a - b) / 86400000);
  if (days === 0) return tl("Today");
  if (days === 1) return tl("Tomorrow");
  return d.toLocaleDateString(locale(), { weekday: "long", month: "short", day: "numeric" });
}

export const StreamView: React.FC<StreamViewProps> = ({ events, status, settings, catalog, onOpenUrl, onSelectTab }) => {
  const [, setTick] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const logos = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of catalog?.teams || []) {
      if (t.code && t.image) map[t.code.toUpperCase()] = t.image;
      if (t.name && t.image) map[t.name.toUpperCase()] = t.image;
    }
    return map;
  }, [catalog]);

  const now = Date.now();
  const phase = streamPhase(events, status, now);
  const upcoming = upcomingStreamMatches(events, now);
  const followed = (e: StreamEvent) =>
    (!!e.team1 && settings.followedTeams.includes(e.team1)) || (!!e.team2 && settings.followedTeams.includes(e.team2));

  const Logo: React.FC<{ code?: string; size: number }> = ({ code, size }) => {
    if (!code) return null;
    const src = logos[code.toUpperCase()];
    const box = { width: size, height: size };
    return src ? (
      <img src={src} alt="" style={box} className="object-contain shrink-0" />
    ) : (
      <span
        style={box}
        className="rounded bg-rw-bg border border-rw-border text-[9px] font-bold text-rw-accent flex items-center justify-center shrink-0"
      >
        {code.slice(0, 3)}
      </span>
    );
  };

  const Matchup: React.FC<{ e: StreamEvent; big?: boolean }> = ({ e, big }) =>
    e.team1 && e.team2 ? (
      <span className={`flex items-center ${big ? "gap-3" : "gap-1.5"} min-w-0`}>
        <span className={`flex items-center ${big ? "gap-2" : "gap-1.5"}`}>
          <Logo code={e.team1} size={big ? 36 : 16} />
          <span
            className={`font-bold ${big ? "text-2xl" : "text-xs"} ${
              settings.followedTeams.includes(e.team1) ? "text-rw-accent" : "text-rw-text"
            }`}
          >
            {e.team1}
          </span>
        </span>
        <span className={`text-rw-muted ${big ? "text-sm" : "text-[11px]"}`}>{tl("vs")}</span>
        <span className={`flex items-center ${big ? "gap-2" : "gap-1.5"}`}>
          <Logo code={e.team2} size={big ? 36 : 16} />
          <span
            className={`font-bold ${big ? "text-2xl" : "text-xs"} ${
              settings.followedTeams.includes(e.team2) ? "text-rw-accent" : "text-rw-text"
            }`}
          >
            {e.team2}
          </span>
        </span>
      </span>
    ) : (
      <span className={`font-semibold text-rw-text ${big ? "text-xl" : "text-xs"}`}>{e.name || tl("Broadcast segment")}</span>
    );

  const WatchButtons: React.FC = () => (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onOpenUrl(TWITCH_URL)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#9146ff] hover:bg-[#a970ff] text-white font-bold text-xs"
      >
        <Play className="w-3.5 h-3.5 fill-current" /> Twitch
      </button>
      <button
        onClick={() => onOpenUrl(YOUTUBE_LIVE_URL)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#cc0000] hover:bg-[#e60000] text-white font-bold text-xs"
      >
        <Play className="w-3.5 h-3.5 fill-current" /> YouTube
      </button>
      <button
        onClick={() => onOpenUrl("https://lolworlds.com/schedule")}
        className="flex items-center gap-1 px-2 py-1.5 text-xs text-rw-sub hover:text-rw-text"
      >
        {tl("Full schedule")} <ExternalLink className="w-3 h-3" />
      </button>
    </div>
  );

  // ── On break: the marathon has ended for now ───────────────────────────
  if (phase.kind === "break") {
    const nextLine =
      phase.next && ts(phase.next.utcIso) - now > 24 * 60 * 60 * 1000
        ? tl("The next marathon starts {date} at {time} with {event}.", {
            date: new Date(phase.next.utcIso).toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" }),
            time: clock(phase.next.utcIso),
            event: streamEventTitle(phase.next),
          })
      : null;
    return (
      <div className="p-4 page-5xl rw-capped overflow-y-auto h-full">
        <div className="bg-rw-panel border border-rw-border rounded-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-rw-accent/10 border border-rw-accent/30 flex items-center justify-center">
            <Moon className="w-6 h-6 text-rw-accent" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-rw-text">{status?.headline || tl("The 24/7 marathon is taking a break")}</h2>
            <p className="text-sm text-rw-sub leading-relaxed max-w-xl mx-auto">
              {status?.message ||
                nextLine ||
                tl("It comes back before the next big international event. Check back here or follow the channel to know when it starts.")}
            </p>
            {status?.message && nextLine && <p className="text-xs text-rw-teal">{nextLine}</p>}
            {phase.lastAired && (
              <p className="text-[11px] text-rw-muted">
                {tl("Last aired:")} {phase.lastAired.team1 && phase.lastAired.team2 ? `${phase.lastAired.team1} vs ${phase.lastAired.team2}, ` : ""}
                {streamEventTitle(phase.lastAired)}
                {phase.lastAired.stage ? ` ${stageName(phase.lastAired.stage)}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {onSelectTab && (
              <button
                onClick={() => onSelectTab("live")}
                className="px-3.5 py-2 rounded-md bg-rw-accent hover:bg-rw-text text-rw-bg font-bold text-xs"
              >
                {tl("Live pro matches")}
              </button>
            )}
            <button
              onClick={() => onOpenUrl(YOUTUBE_CHANNEL_URL)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#cc0000] hover:bg-[#e60000] text-white font-bold text-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> {tl("Full VODs on YouTube")}
            </button>
            <button
              onClick={() => onOpenUrl(TWITCH_URL)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#9146ff] hover:bg-[#a970ff] text-white font-bold text-xs"
            >
              {tl("Follow on Twitch")}
            </button>
            <button
              onClick={() => onOpenUrl(DISCORD_URL)}
              className="px-3.5 py-2 rounded-md border border-rw-border hover:border-rw-accent/60 text-rw-text text-xs"
            >
              {tl("Discord")}
            </button>
          </div>
        </div>
        <div className="mt-4">
          <PartBoundary>
            <React.Suspense fallback={null}>
              <StreamBracket events={events} now={now} />
            </React.Suspense>
          </PartBoundary>
        </div>
      </div>
    );
  }

  // ── On air (or a short pause between matches) ──────────────────────────
  const current = phase.kind === "airing" ? phase.current : null;
  const next = phase.next;
  const progress =
    current && next ? Math.min(1, Math.max(0, (now - ts(current.utcIso)) / (ts(next.utcIso) - ts(current.utcIso)))) : null;
  const nextBanger = upcoming.find((e) => e.isBanger);
  const showBanger = nextBanger && nextBanger !== next;

  // Schedule after the next match, grouped by day and then by event + stage
  const later = upcoming.slice(1);
  const dayKeys: string[] = [];
  const byDay = new Map<string, StreamEvent[]>();
  for (const e of later) {
    const k = dayLabel(e.utcIso);
    if (!byDay.has(k)) {
      byDay.set(k, []);
      dayKeys.push(k);
    }
    byDay.get(k)!.push(e);
  }
  const shownDays = showAll ? dayKeys : dayKeys.slice(0, DAYS_SHOWN);

  return (
    <div className="p-4 space-y-4 page-5xl rw-capped overflow-y-auto h-full select-none">
      {/* Now playing */}
      <section className="bg-rw-panel border border-rw-teal/50 rounded-xl overflow-hidden">
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-bold tracking-wider text-rw-teal uppercase">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              {current ? tl("Now on the 24/7 stream") : tl("24/7 stream · short break")}
            </span>
            {current?.isBanger && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-[#ff4655] px-2 py-0.5 rounded">
                <Flame className="w-3 h-3 fill-current" /> <span className="uppercase">{tl("Banger")}</span>
              </span>
            )}
          </div>

          {current ? (
            <div className="space-y-1">
              <Matchup e={current} big />
              <div className="text-xs text-rw-accent font-semibold">
                {streamEventTitle(current)}
                {current.stage ? ` · ${stageName(current.stage)}` : ""}
              </div>
            </div>
          ) : (
            next && (
              <div className="space-y-1">
                <div className="text-sm text-rw-sub">{tl("Next match starts {when}", { when: relTime(next.utcIso, now) })}</div>
                <Matchup e={next} big />
                <div className="text-xs text-rw-accent font-semibold">
                  {streamEventTitle(next)}
                  {next.stage ? ` · ${stageName(next.stage)}` : ""}
                </div>
              </div>
            )
          )}

          {progress != null && (
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-rw-bg overflow-hidden">
                <div className="h-full bg-rw-teal" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-rw-muted font-mono">
                <span>{tl("started {time}", { time: clock(current!.utcIso) })}</span>
                <span>{tl("next match {when}", { when: relTime(next!.utcIso, now) })}</span>
              </div>
            </div>
          )}

          <WatchButtons />
        </div>

        {/* Up next, once */}
        {current && next && (
          <div className="border-t border-rw-border bg-rw-bg/60 px-5 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-rw-teal uppercase tracking-wider text-[10px] shrink-0">{tl("Up next")}</span>
              <Matchup e={next} />
              {next.isBanger && <Flame className="w-3.5 h-3.5 text-[#ff4655] fill-current shrink-0" aria-label={tl("Banger")} />}
            </div>
            <span className="font-mono text-rw-sub shrink-0 ml-auto">
              {clock(next.utcIso)} · {relTime(next.utcIso, now)}
            </span>
          </div>
        )}
      </section>

      {/* Next banger, only when it isn't already the next match */}
      {showBanger && nextBanger && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 rounded-lg border border-[#ff4655]/50 bg-rw-red/10 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <Flame className="w-3.5 h-3.5 text-[#ff4655] fill-current shrink-0" />
            <span className="font-bold text-[#ff4655] light:text-[#c8102e] uppercase tracking-wider text-[10px] shrink-0">{tl("Next banger")}</span>
            <Matchup e={nextBanger} />
            <span className="text-rw-muted truncate hidden sm:inline">
              {streamEventTitle(nextBanger)}
              {nextBanger.stage ? ` · ${stageName(nextBanger.stage)}` : ""}
            </span>
          </div>
          <span className="font-mono text-[#ff4655] light:text-[#c8102e] shrink-0">{relTime(nextBanger.utcIso, now)}</span>
        </div>
      )}

      {/* Schedule */}
      {later.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-rw-text uppercase tracking-wider">
            {tl("Coming up on the marathon")}
          </h3>
          {shownDays.map((day) => {
            const list = byDay.get(day)!;
            return (
              <div key={day} className="rounded-lg border border-rw-border overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 bg-rw-surface text-[11px]">
                  <span className="font-bold text-rw-teal uppercase tracking-wider">{day}</span>
                  <span className="text-rw-muted">
                    {tn("{n} match", "{n} matches", list.length)}
                  </span>
                </div>
                {list.map((e, i) => {
                  const prev = list[i - 1];
                  const group = `${streamEventTitle(e)}${e.stage ? ` · ${stageName(e.stage)}` : ""}`;
                  const prevGroup = prev ? `${streamEventTitle(prev)}${prev.stage ? ` · ${stageName(prev.stage)}` : ""}` : "";
                  const fol = followed(e);
                  return (
                    <React.Fragment key={String(e.id)}>
                      {group !== prevGroup && (
                        <div className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-rw-accent/80 border-t border-rw-border bg-rw-bg">
                          {group}
                        </div>
                      )}
                      <div
                        className={`flex items-center gap-3 px-3.5 py-2 border-t border-rw-border/60 text-xs ${
                          fol ? "bg-rw-accent/5" : "bg-rw-bg"
                        }`}
                      >
                        <span className="w-16 shrink-0 font-mono font-semibold text-rw-sub">{clock(e.utcIso)}</span>
                        <span className="flex-1 min-w-0">
                          <Matchup e={e} />
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {fol && <Star className="w-3.5 h-3.5 text-rw-accent fill-current" aria-label={tl("A team you follow")} />}
                          {e.isBanger && <Flame className="w-3.5 h-3.5 text-[#ff4655] fill-current" aria-label={tl("Banger")} />}
                          {day === tl("Today") && <span className="text-[10px] font-mono text-rw-muted min-w-14 whitespace-nowrap text-right">{relTime(e.utcIso, now)}</span>}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })}
          {dayKeys.length > DAYS_SHOWN && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="w-full flex items-center justify-center gap-1 py-2 text-xs text-rw-teal hover:underline"
            >
              {showAll ? tl("Show less") : tn("Show {n} more day", "Show {n} more days", dayKeys.length - DAYS_SHOWN)}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
            </button>
          )}
          <p className="text-[10px] text-rw-muted flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-rw-accent fill-current" /> {tl("team you follow")}
            </span>
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3 text-[#ff4655] fill-current" /> {tl("banger")}
            </span>
            <span>{tl("Times are in your time zone.")}</span>
          </p>
        </section>
      )}

      <PartBoundary>
        <React.Suspense fallback={null}>
          <StreamBracket events={events} now={now} />
        </React.Suspense>
      </PartBoundary>
    </div>
  );
};
