/** Tournament page extras: quick facts, team rosters (with subs and coaches), records between regions. */
import React, { useState } from "react";
import { Flame, Crown, Timer, Swords } from "lucide-react";
import { tl, tk, roleName } from "../../i18n";
import type {
  EventOverview,
  EventRoster,
  GameRef,
  HubEvent,
} from "../../hub/types";
import {
  ChampIcon,
  HubLink,
  PlayerLink,
  Section,
  Stat,
  TeamLink,
  fmtNum,
  td,
  th,
} from "./ui";

const mmss = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const DRAKE: Record<string, string> = {
  infernal: tk("Infernal"),
  mountain: tk("Mountain"),
  ocean: tk("Ocean"),
  cloud: tk("Cloud"),
  hextech: tk("Hextech"),
  chemtech: tk("Chemtech"),
  elder: tk("Elder"),
};

const GameLine: React.FC<{
  label: string;
  r: GameRef | null;
  value: string;
}> = ({ label, r, value }) =>
  r ? (
    <li className="flex flex-wrap items-baseline justify-between gap-x-2 min-w-0">
      <span className="text-[#9bb3c9] shrink-0">{label}</span>
      <span className="min-w-0 text-right">
        <span className="text-[#c8aa6e] font-bold">{value}</span>{" "}
        {r.g ? (
          <HubLink to={{ kind: "match", slug: r.g }}>
            {r.a} vs {r.b}
          </HubLink>
        ) : (
          <span className="text-[#f0e6d2]">
            {r.a} vs {r.b}
          </span>
        )}
      </span>
    </li>
  ) : null;

/** gol.gg-style "tournament data": averages, side wins, dragons, notable games, pentakills, Player of the Game. */
export const EventFacts: React.FC<{ o: EventOverview; hidden?: boolean }> = ({
  o,
  hidden,
}) => {
  const sideTotal = o.blue + o.red;
  const drakes = Object.entries(o.drakes).sort((a, b) => b[1] - a[1]);
  return (
    <Section title={tl("Tournament facts")}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label={tl("Games")} value={fmtNum(o.g)} />
        <Stat label={tl("Avg game")} value={mmss(o.min)} />
        <Stat label={tl("Kills / game")} value={o.kills} />
        <Stat
          label={tl("Blue side wins")}
          value={
            hidden || !sideTotal
              ? "–"
              : `${Math.round((o.blue / sideTotal) * 100)}%`
          }
          sub={
            hidden || !sideTotal
              ? undefined
              : tl("{b} blue · {r} red", { b: o.blue, r: o.red })
          }
        />
      </div>
      {!hidden && (
        <ul className="text-xs space-y-1 mt-1">
          <GameLine
            label={tl("Shortest game")}
            r={o.short}
            value={o.short ? mmss(o.short.v) : ""}
          />
          <GameLine
            label={tl("Longest game")}
            r={o.long}
            value={o.long ? mmss(o.long.v) : ""}
          />
          <GameLine
            label={tl("Most kills in a game")}
            r={o.bloody}
            value={o.bloody ? tl("{n} kills", { n: o.bloody.v }) : ""}
          />
          {o.farm && (
            <li className="flex flex-wrap items-baseline justify-between gap-x-2 min-w-0">
              <span className="text-[#9bb3c9] shrink-0">
                {tl("Best farming game")}
              </span>
              <span className="min-w-0 text-right">
                <span className="text-[#c8aa6e] font-bold">
                  {tl("{n} CS/min", { n: o.farm.v })}
                </span>{" "}
                <PlayerLink name={o.farm.n} u={o.farm.u} />{" "}
                <span className="text-[#7e8e9f]">
                  ({o.farm.cs} CS, {mmss(o.farm.min)})
                </span>{" "}
                {o.farm.g && (
                  <HubLink
                    to={{ kind: "match", slug: o.farm.g }}
                    className="text-[#0ac8b9] hover:underline"
                  >
                    {tl("Details")}
                  </HubLink>
                )}
              </span>
            </li>
          )}
        </ul>
      )}
      {drakes.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#9bb3c9]">
          <span className="text-[#7e8e9f] flex items-center gap-1">
            <Flame className="w-3 h-3" />
            {tl("Dragons taken:")}
          </span>
          {drakes.map(([k, n]) => (
            <span key={k}>
              {tl(DRAKE[k] || k)}{" "}
              <span className="text-[#f0e6d2] font-semibold">{n}</span>
            </span>
          ))}
        </div>
      )}
      {!hidden && o.pentas.length > 0 && (
        <div className="text-xs">
          <span className="text-[#7e8e9f] flex items-center gap-1 mb-1">
            <Swords className="w-3 h-3" />
            {tl("Pentakills")}
          </span>
          <ul className="space-y-1">
            {o.pentas.map((p, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <ChampIcon name={p.c} size={16} />
                <PlayerLink name={p.n} u={p.u} />
                {p.x > 1 && <span className="text-[#c8aa6e]">×{p.x}</span>}
                {p.g && (
                  <HubLink
                    to={{ kind: "match", slug: p.g }}
                    className="text-[#0ac8b9] hover:underline ml-1"
                  >
                    {tl("Details")}
                  </HubLink>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!hidden && o.mvp.length > 0 && (
        <div className="text-xs">
          <span className="text-[#7e8e9f] flex items-center gap-1 mb-1">
            <Crown className="w-3 h-3" />
            {tl("Most Player of the Game awards")}
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {o.mvp.map((m) => (
              <span key={m.n}>
                <PlayerLink name={m.n} u={m.u} />{" "}
                <span className="text-[#c8aa6e] font-bold">{m.v}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[#7e8e9f] flex items-center gap-1">
        <Timer className="w-3 h-3" />
        {tl("Games with a full scoreboard only.")}
      </p>
    </Section>
  );
};

/** Every team's roster for the tournament, including substitutes and coaches (Leaguepedia's rosters). */
export const EventRosters: React.FC<{ rosters: EventRoster[] }> = ({
  rosters,
}) => {
  const [open, setOpen] = useState(rosters.length <= 4);
  return (
    <Section
      title={tl("Team rosters")}
      right={
        rosters.length > 4 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] text-[#0ac8b9] hover:underline"
          >
            {open
              ? tl("Show fewer")
              : tl("Show all {n}", { n: rosters.length })}
          </button>
        ) : undefined
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(open ? rosters : rosters.slice(0, 4)).map((t) => (
          <div
            key={t.t}
            className="bg-[#091428] border border-[#1e282d] rounded-lg p-2 text-xs min-w-0"
          >
            <div className="font-semibold mb-1 truncate">
              <TeamLink name={t.t} u={t.u} />
              {t.r && (
                <span className="text-[#7e8e9f] text-[10px] ml-1">{t.r}</span>
              )}
            </div>
            <ul className="space-y-0.5">
              {t.p.map(([n, u, role, flag], i) => (
                <li key={i} className="flex justify-between gap-2 min-w-0">
                  <span className="truncate min-w-0">
                    <PlayerLink name={n} u={u} />
                  </span>
                  <span className="text-[#7e8e9f] shrink-0 text-[10px]">
                    {role
                      ? /coach/i.test(role)
                        ? tl("Coach")
                        : roleName(role)
                      : ""}
                    {flag ? ` · ${flag}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
};

/** International events: how each region did against each other region (series). */
export const RegionalRecords: React.FC<{ e: HubEvent; hidden?: boolean }> = ({
  e,
  hidden,
}) => {
  if (!e.regions || e.regions.length === 0 || hidden) return null;
  return (
    <Section title={tl("Region vs region")}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("Regions")}</th>
            <th className={th}>{tl("Series")}</th>
          </tr>
        </thead>
        <tbody>
          {e.regions.map((r) => (
            <tr key={r.a + r.b} className="border-t border-[#1e282d]">
              <td className={`${td} text-[#f0e6d2]`}>
                {r.a} vs {r.b}
              </td>
              <td className={`${td} tabular-nums`}>
                <span
                  className={
                    r.wa > r.wb ? "text-[#0ac8b9] font-bold" : "text-[#9bb3c9]"
                  }
                >
                  {r.wa}
                </span>
                <span className="text-[#7e8e9f]"> – </span>
                <span
                  className={
                    r.wb > r.wa ? "text-[#0ac8b9] font-bold" : "text-[#9bb3c9]"
                  }
                >
                  {r.wb}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
};
