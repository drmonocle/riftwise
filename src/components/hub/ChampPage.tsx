/** Champion page: pro picks, bans and wins by year, roles, best players and the latest pro games. */
import React from "react";
import { tl, tc, roleName } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubChamp } from "../../hub/data";
import type { HubChamp } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import {
  card,
  ChampIcon,
  fmtDate,
  fmtNum,
  HubLink,
  Page,
  PlayerLink,
  RevealButton,
  Section,
  Stat,
  td,
  th,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";

export const ChampPage: React.FC<{ slug: string }> = ({ slug }) => {
  const state = useLoad(() => loadHubChamp(slug), [slug]);
  usePageTitle(state.data ? champName(state.data.name) : null);
  useDDragon();
  return <Page state={state}>{(c) => <ChampView c={c} />}</Page>;
};

const ChampView: React.FC<{ c: HubChamp }> = ({ c }) => {
  const [recentHidden, revealRecent] = useHidden(`champ-recent:${c.u}`, c.recent[0]?.date);
  const maxYear = Math.max(1, ...c.years.map((y) => y.p + y.b));
  const totalRoles = c.roles.reduce((s, r) => s + r.p, 0) || 1;
  return (
    <div className="space-y-3">
      <div className={`${card} flex gap-3 items-start`}>
        <ChampIcon name={c.name} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-[#f0e6d2]">{champName(c.name)}</h2>
          <p className="text-[11px] text-[#9bb3c9]">
            {c.roles
              .filter((r) => r.p / totalRoles >= 0.05)
              .map((r) => `${roleName(r.r)} ${Math.round((r.p / totalRoles) * 100)}%`)
              .join(" · ")}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Stat label={tl("Picks")} value={fmtNum(c.p)} />
            <Stat label={tl("Bans")} value={fmtNum(c.b)} />
            <Stat label={tl("Win %")} value={winRate(c.w, c.p)} />
          </div>
        </div>
      </div>

      <Section title={tl("By year")}>
        <div className="space-y-1">
          {c.years.map((y) => (
            <div key={y.y} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-xs">
              <span className="text-[#f0e6d2] font-semibold">{y.y}</span>
              <div className="h-3 bg-[#091428] rounded overflow-hidden flex" title={`${y.p} / ${y.b}`}>
                <div className="bg-[#0ac8b9]/70" style={{ width: `${(y.p / maxYear) * 100}%` }} />
                <div className="bg-[#e84057]/50" style={{ width: `${(y.b / maxYear) * 100}%` }} />
              </div>
              <span className="text-[#9bb3c9] tabular-nums text-right w-44 truncate">
                {tl("{p} picks · {b} bans · {wr}", { p: fmtNum(y.p), b: fmtNum(y.b), wr: y.p ? winRate(y.w, y.p) : "–" })}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#7e8e9f]">
          <span className="inline-block w-2 h-2 bg-[#0ac8b9]/70 mr-1" />
          {tl("Picks")} <span className="inline-block w-2 h-2 bg-[#e84057]/50 ml-2 mr-1" />
          {tl("Bans")}
        </p>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title={tl("Most games on {champion}", { champion: champName(c.name) })}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Player")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
                <th className={th}>{tl("KDA")}</th>
              </tr>
            </thead>
            <tbody>
              {c.players.slice(0, 25).map((p) => (
                <tr key={p.n + p.u} className="border-t border-[#1e282d]">
                  <td className={td}>
                    <PlayerLink name={p.n} u={p.u} />
                  </td>
                  <td className={`${td} text-[#9bb3c9]`}>{p.g}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{winRate(p.w, p.g)}</td>
                  <td className={`${td} text-[#9bb3c9]`}>{p.kda}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title={tl("Latest pro games")} right={recentHidden ? <RevealButton onReveal={revealRecent} small /> : undefined}>
          {recentHidden ? (
            <p className="text-[11px] text-[#7e8e9f] italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <ul className="text-xs space-y-1.5">
              {c.recent.map((r, i) => (
                <li key={i} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate min-w-0">
                      <span className={`font-bold mr-1 ${r.win ? "text-[#0ac8b9]" : "text-[#e84057]"}`}>
                        {r.win ? tc("short result", "W") : tc("short result", "L")}
                      </span>
                      <PlayerLink name={r.n} u={r.u} /> <span className="text-[#9bb3c9] tabular-nums">{r.k}/{r.d}/{r.a}</span>{" "}
                      {r.g ? <HubLink to={{ kind: "match", slug: r.g }}>vs {r.opp}</HubLink> : <span>vs {r.opp}</span>}
                    </span>
                    <span className="text-[#7e8e9f] shrink-0">{fmtDate(r.date, false)}</span>
                  </div>
                  <div className="text-[10px] text-[#7e8e9f] truncate">{r.en}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
};
