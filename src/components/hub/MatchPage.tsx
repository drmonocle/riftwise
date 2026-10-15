/** One series (a "match": Bo1 to Bo5): every game's draft, scoreboard, builds, runes and objectives. */
import React, { useState } from "react";
import { PlayCircle, Swords, Clock } from "lucide-react";
import { tl, tc, roleName, locale } from "../../i18n";
import { champName } from "../../champions";
import { loadHubSeries } from "../../hub/data";
import type { GamePlayer, HubGame, HubSeries, SideStats } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import {
  card,
  ChampIcon,
  EventLink,
  fmtDate,
  fmtNum,
  ItemIcon,
  Page,
  PlayerLink,
  RevealButton,
  RuneIcon,
  SpellIcon,
  TeamLink,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";

const fmtGold = (g?: number) => (g == null ? "–" : `${(g / 1000).toFixed(1)}k`);
const fmtMin = (m?: number | null) => {
  if (m == null) return "";
  const mm = Math.floor(m);
  const ss = Math.round((m - mm) * 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
};
const DRAKE_LABEL: Record<string, string> = {
  infernal: "Infernal", mountain: "Mountain", ocean: "Ocean", cloud: "Cloud", hextech: "Hextech", chemtech: "Chemtech",
};

export const MatchPage: React.FC<{ slug: string; onOpenUrl: (url: string) => void }> = ({ slug, onOpenUrl }) => {
  const state = useLoad(() => loadHubSeries(slug), [slug]);
  usePageTitle(state.data ? `${state.data.a.n} vs ${state.data.b.n} – ${state.data.en}` : null);
  useDDragon();
  return <Page state={state}>{(s) => <SeriesView s={s} slug={slug} onOpenUrl={onOpenUrl} />}</Page>;
};

const SeriesView: React.FC<{ s: HubSeries; slug: string; onOpenUrl: (url: string) => void }> = ({ s, slug, onOpenUrl }) => {
  const [hidden, reveal] = useHidden(`series:${slug}`, s.date);
  const withStats = s.games.filter((g) => g.p && g.p.length);
  const [gi, setGi] = useState(0);
  const game = s.games[Math.min(gi, s.games.length - 1)];
  const scoreA = hidden ? "?" : s.sa;
  const scoreB = hidden ? "?" : s.sb;
  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="text-[11px] text-[#7e8e9f] flex flex-wrap gap-x-2">
          <EventLink name={s.en} u={s.e} className="text-[#c8aa6e] hover:underline" />
          {s.stage && <span>· {s.stage}</span>}
          <span>· {fmtDate(s.date)}</span>
          <span>· {tc("series length", "Best of {n}", { n: s.bo })}</span>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right min-w-0">
            <TeamLink name={s.a.n} u={s.a.u} className={`text-base sm:text-lg font-bold hover:underline ${!hidden && s.w === 1 ? "text-[#0ac8b9]" : "text-[#f0e6d2]"}`} />
          </div>
          <div className="text-2xl font-black text-[#f0e6d2] tabular-nums text-center min-w-[4.5rem]">
            {scoreA} <span className="text-[#3a4a5a]">–</span> {scoreB}
          </div>
          <div className="min-w-0">
            <TeamLink name={s.b.n} u={s.b.u} className={`text-base sm:text-lg font-bold hover:underline ${!hidden && s.w === 2 ? "text-[#0ac8b9]" : "text-[#f0e6d2]"}`} />
          </div>
        </div>
        {hidden && (
          <div className="mt-2 text-center">
            <RevealButton onReveal={reveal} />
          </div>
        )}
        {withStats.length === 0 && (
          <p className="mt-3 text-[11px] text-[#7e8e9f] text-center">{tl("Only the results of this series are known: no player stats were recorded for it.")}</p>
        )}
      </div>

      {s.games.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {s.games.map((g, i) => (
            <button
              key={g.n}
              type="button"
              role="tab"
              aria-selected={i === gi}
              onClick={() => setGi(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                i === gi ? "bg-[#c8aa6e] text-[#091428] border-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2]"
              }`}
            >
              {tl("Game {n}", { n: g.n })}
              {!hidden && g.w ? <span className="ml-1 opacity-70">({g.w === 1 ? s.a.c || s.a.n : s.b.c || s.b.n})</span> : null}
            </button>
          ))}
        </div>
      )}

      {game && <GameView s={s} g={game} hidden={hidden} onOpenUrl={onOpenUrl} />}
    </div>
  );
};

const GameView: React.FC<{ s: HubSeries; g: HubGame; hidden: boolean; onOpenUrl: (url: string) => void }> = ({ s, g, hidden, onOpenUrl }) => {
  const blueTeam = g.blue === "a" ? s.a : s.b;
  const redTeam = g.blue === "a" ? s.b : s.a;
  const blueWon = (g.w === 1 && g.blue === "a") || (g.w === 2 && g.blue === "b");
  const redWon = g.w !== 0 && !blueWon;
  const blue = g.p?.filter((p) => p.s === 1) || [];
  const red = g.p?.filter((p) => p.s === 2) || [];
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7e8e9f]">
          <span className="flex items-center gap-2">
            {g.min != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {hidden ? "–" : fmtMin(g.min)}
              </span>
            )}
            {g.patch && <span>{tl("Patch {patch}", { patch: g.patch })}</span>}
            {g.date && <span>{new Date(`${g.date.replace(" ", "T")}Z`).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })}</span>}
            {g.ff ? <span className="text-[#c8aa6e]">{tl("Forfeit")}</span> : null}
          </span>
          {g.vod && (
            <button
              type="button"
              onClick={() => onOpenUrl(g.vod!)}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#e84057]/15 border border-[#e84057]/50 text-[#f0e6d2] hover:bg-[#e84057]/25 font-semibold"
            >
              <PlayCircle className="w-3.5 h-3.5 text-[#e84057]" />
              {tl("Watch this game")}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SideHeader name={blueTeam.n} u={blueTeam.u} side="blue" won={!hidden && blueWon} st={g.t?.blue} />
          <SideHeader name={redTeam.n} u={redTeam.u} side="red" won={!hidden && redWon} st={g.t?.red} right />
        </div>
        {(g.t?.blue?.picks?.length || g.t?.blue?.bans?.length) && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#1e282d]">
            <Draft st={g.t?.blue} />
            <Draft st={g.t?.red} right />
          </div>
        )}
      </div>

      {(blue.length > 0 || red.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Scoreboard name={blueTeam.n} side="blue" players={blue} hidden={hidden} won={blueWon} minutes={g.min} />
          <Scoreboard name={redTeam.n} side="red" players={red} hidden={hidden} won={redWon} minutes={g.min} />
        </div>
      )}
      {g.st !== "f" && !g.p && (
        <p className="text-[11px] text-[#7e8e9f] text-center">
          {g.st === "r" ? tl("Only the result of this game is known.") : tl("No result or stats were recorded for this game.")}
        </p>
      )}
    </div>
  );
};

const SideHeader: React.FC<{ name: string; u: string | null; side: "blue" | "red"; won: boolean; st?: SideStats; right?: boolean }> = ({
  name,
  u,
  side,
  won,
  st,
  right,
}) => {
  const color = side === "blue" ? "#4a9eff" : "#e84057";
  const obj: [string, React.ReactNode][] = [];
  if (st?.k != null) obj.push([tl("Kills"), st.k]);
  if (st?.gold != null) obj.push([tl("Gold"), fmtGold(st.gold)]);
  if (st?.towers != null) obj.push([tl("Towers"), st.towers]);
  if (st?.drag != null) obj.push([tl("Dragons"), st.drag]);
  if (st?.barons != null) obj.push([tl("Barons"), st.barons]);
  if (st?.grubs) obj.push([tl("Void grubs"), st.grubs]);
  if (st?.heralds) obj.push([tl("Heralds"), st.heralds]);
  if (st?.atakhan) obj.push([tl("Atakhan"), st.atakhan]);
  if (st?.elders) obj.push([tl("Elders"), st.elders]);
  const drakes = st?.drakes ? Object.entries(st.drakes).map(([k, n]) => `${tl(DRAKE_LABEL[k] || k)}${n && n > 1 ? ` ×${n}` : ""}`) : [];
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`flex items-center gap-2 ${right ? "justify-end" : ""}`}>
        <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color }}>
          {side === "blue" ? tl("Blue side") : tl("Red side")}
        </span>
        {won && <span className="text-[10px] font-bold text-[#0ac8b9]">{tc("short result", "W")}</span>}
      </div>
      <TeamLink name={name} u={u} className="text-sm font-bold text-[#f0e6d2] hover:underline" />
      {obj.length > 0 && (
        <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] ${right ? "justify-end" : ""}`}>
          {obj.map(([l, v]) => (
            <span key={l} className="text-[#7e8e9f]">
              {l} <span className="text-[#f0e6d2] font-semibold">{v}</span>
            </span>
          ))}
        </div>
      )}
      {drakes.length > 0 && <div className="text-[10px] text-[#7e8e9f] mt-0.5">{drakes.join(" · ")}</div>}
    </div>
  );
};

const Draft: React.FC<{ st?: SideStats; right?: boolean }> = ({ st, right }) => (
  <div className={`space-y-1.5 min-w-0 ${right ? "text-right" : ""}`}>
    {st?.bans && st.bans.length > 0 && (
      <div className={`flex flex-wrap items-center gap-1 ${right ? "justify-end" : ""}`}>
        <span className="text-[10px] text-[#7e8e9f] uppercase mr-1">{tl("Bans")}</span>
        {st.bans.map((c, i) => (
          <span key={i} className="opacity-60 grayscale">
            <ChampIcon name={c} size={20} />
          </span>
        ))}
      </div>
    )}
    {st?.picks && st.picks.length > 0 && (
      <div className={`flex flex-wrap items-center gap-1 ${right ? "justify-end" : ""}`}>
        <span className="text-[10px] text-[#7e8e9f] uppercase mr-1">{tl("Picks")}</span>
        {st.picks.map((c, i) => (
          <ChampIcon key={i} name={c} size={24} />
        ))}
      </div>
    )}
  </div>
);

const Scoreboard: React.FC<{ name: string; side: "blue" | "red"; players: GamePlayer[]; hidden: boolean; won: boolean; minutes?: number | null }> = ({
  name,
  side,
  players,
  hidden,
  won,
  minutes,
}) => {
  const color = side === "blue" ? "#4a9eff" : "#e84057";
  const totalK = players.reduce((s, p) => s + p.k, 0);
  return (
    <section className={`${card} p-3 min-w-0`} style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <h3 className="text-xs font-bold text-[#f0e6d2] mb-2 flex items-center gap-2">
        <Swords className="w-3.5 h-3.5" style={{ color }} />
        {name}
        {!hidden && won && <span className="text-[10px] text-[#0ac8b9]">{tl("Victory")}</span>}
      </h3>
      <div className="space-y-2">
        {players.map((p, i) => (
          <PlayerRow key={i} p={p} teamKills={totalK} minutes={minutes} />
        ))}
      </div>
    </section>
  );
};

const PlayerRow: React.FC<{ p: GamePlayer; teamKills: number; minutes?: number | null }> = ({ p, teamKills, minutes }) => {
  const kp = teamKills ? Math.round(((p.k + p.a) / teamKills) * 100) : null;
  const csm = p.cs != null && minutes ? (p.cs / minutes).toFixed(1) : null;
  return (
    <div className="border-t border-[#1e282d] pt-2 first:border-0 first:pt-0 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        {p.c && <ChampIcon name={p.c} size={30} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <PlayerLink name={p.n} u={p.u} className="font-semibold text-[#f0e6d2] hover:text-[#c8aa6e] hover:underline truncate" />
            {p.r && <span className="text-[10px] text-[#7e8e9f] shrink-0">{roleName(p.r)}</span>}
          </div>
          <div className="text-[10px] text-[#7e8e9f] truncate">{p.c ? champName(p.c) : ""}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-[#f0e6d2] tabular-nums">
            {p.k}/{p.d}/{p.a}
          </div>
          <div className="text-[10px] text-[#7e8e9f] tabular-nums">
            {p.cs != null && <>{tl("{n} CS", { n: p.cs })}{csm ? ` (${csm})` : ""}</>}
            {kp != null && <> · {tl("{pct} KP", { pct: `${kp}%` })}</>}
          </div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {p.it && p.it.length > 0 && (
          <span className="flex items-center gap-0.5">
            {p.it.map((it, i) => (
              <ItemIcon key={i} name={it} size={20} />
            ))}
            {p.tr && <ItemIcon name={p.tr} size={16} />}
          </span>
        )}
        {p.sp && p.sp.length > 0 && (
          <span className="flex items-center gap-0.5">
            {p.sp.map((sp, i) => (
              <SpellIcon key={i} name={sp} />
            ))}
          </span>
        )}
        {p.ks && (
          <span className="flex items-center gap-0.5" title={(p.rn || [p.ks]).join(", ")}>
            <RuneIcon name={p.ks} size={20} />
            {p.stt && <RuneIcon name={p.stt} size={14} />}
          </span>
        )}
        <span className="text-[10px] text-[#7e8e9f] tabular-nums">
          {p.gd != null && <>{tl("{n} gold", { n: fmtNum(p.gd) })}</>}
          {p.dm != null && <> · {tl("{n} dmg", { n: fmtNum(p.dm) })}</>}
          {p.v != null && <> · {tl("{n} vision", { n: p.v })}</>}
        </span>
      </div>
    </div>
  );
};

