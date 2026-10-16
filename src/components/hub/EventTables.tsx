/** gol.gg-style stat tables for one tournament: every player and every team, sortable by any column. */
import React, { useMemo, useState } from "react";
import { tl, roleName } from "../../i18n";
import type { EventPlayer, EventTeamStats, HubEvent } from "../../hub/types";
import { ChampIcon, PlayerLink, Section, TeamLink, fmtNum } from "./ui";
import { Column, SortTable, per } from "./SortTable";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

export const EventPlayerStats: React.FC<{ e: HubEvent; hidden?: boolean }> = ({ e, hidden }) => {
  const players = hidden ? [] : e.players || [];
  const [role, setRole] = useState("All");
  const maxG = Math.max(0, ...players.map((p) => p.g));
  const [regular, setRegular] = useState(true);
  const minG = Math.max(2, Math.ceil(maxG * 0.4));
  const rows = useMemo(
    () => players.filter((p) => (role === "All" || p.r === role) && (!regular || p.g >= minG || maxG < 3)),
    [players, role, regular, minG, maxG],
  );
  if (players.length === 0) return null;
  const cols: Column<EventPlayer>[] = [
    { key: "n", label: tl("Player"), value: (p) => p.n.toLowerCase(), render: (p) => <PlayerLink name={p.n} u={p.u} /> },
    { key: "t", label: tl("Team"), value: (p) => p.t.toLowerCase(), render: (p) => <span className="max-w-[8rem] truncate inline-block align-bottom"><TeamLink name={p.t} u={p.tu} /></span> },
    { key: "r", label: tl("Role"), value: (p) => ROLES.indexOf(p.r), render: (p) => <span className="text-[#7e8e9f]">{roleName(p.r)}</span> },
    { key: "g", label: tl("Games"), value: (p) => p.g },
    { key: "wr", label: tl("Win %"), value: (p) => per(p.w, p.g, 3), render: (p) => pct(per(p.w, p.g, 3)) },
    { key: "kda", label: tl("KDA"), value: (p) => per(p.k + p.a, Math.max(p.d, 1), 2) },
    { key: "k", label: "K", title: tl("Kills per game"), value: (p) => per(p.k, p.g) },
    { key: "d", label: "D", title: tl("Deaths per game"), value: (p) => per(p.d, p.g) },
    { key: "a", label: "A", title: tl("Assists per game"), value: (p) => per(p.a, p.g) },
    { key: "kp", label: "KP", title: tl("Kill participation"), value: (p) => per(p.k + p.a, p.tk, 3), render: (p) => pct(per(p.k + p.a, p.tk, 3)) },
    { key: "csm", label: tl("CS/m"), title: tl("CS per minute"), value: (p) => per(p.cs, p.min) },
    { key: "gpm", label: tl("GPM"), title: tl("Gold per minute"), value: (p) => per(p.gold, p.min, 0) },
    { key: "dpm", label: tl("DPM"), title: tl("Damage per minute"), value: (p) => per(p.dmg, p.min, 0) },
    { key: "vpm", label: tl("VS/m"), title: tl("Vision score per minute"), value: (p) => per(p.vis, p.vmin, 2) },
    { key: "dmgs", label: tl("DMG%"), title: tl("Share of the team's damage to champions"), value: (p) => (p.td ? per(p.sd || 0, p.td, 3) : null), render: (p) => (p.td ? pct(per(p.sd || 0, p.td, 3)) : "–") },
    { key: "golds", label: tl("Gold%"), title: tl("Share of the team's gold"), value: (p) => (p.tg ? per(p.sg || 0, p.tg, 3) : null), render: (p) => (p.tg ? pct(per(p.sg || 0, p.tg, 3)) : "–") },
    { key: "viss", label: tl("VS%"), title: tl("Share of the team's vision score"), value: (p) => (p.tv ? per(p.sv || 0, p.tv, 3) : null), render: (p) => (p.tv ? pct(per(p.sv || 0, p.tv, 3)) : "–") },
    {
      key: "nc",
      label: tl("Champions"),
      value: (p) => p.nc,
      render: (p) => (
        <span className="flex items-center gap-0.5">
          {p.c.map((c) => (
            <ChampIcon key={c} name={c} size={16} />
          ))}
          {p.nc > p.c.length && <span className="text-[10px] text-[#7e8e9f] ml-0.5">+{p.nc - p.c.length}</span>}
        </span>
      ),
    },
  ];
  if (players.some((p) => p.mvp)) cols.splice(5, 0, { key: "mvp", label: tl("POG"), title: tl("Player of the Game awards"), value: (p) => p.mvp || 0 });
  return (
    <Section title={tl("Player stats")}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {["All", ...ROLES].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`px-2 py-1 rounded border ${role === r ? "bg-[#c8aa6e] text-[#091428] font-bold border-[#c8aa6e]" : "border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2]"}`}
          >
            {r === "All" ? tl("All roles") : roleName(r)}
          </button>
        ))}
        {maxG >= 3 && (
          <label className="flex items-center gap-1 ml-auto text-[#9bb3c9] cursor-pointer">
            <input type="checkbox" checked={regular} onChange={(ev) => setRegular(ev.target.checked)} />
            {tl("Only players with {n}+ games", { n: minG })}
          </label>
        )}
      </div>
      <SortTable rows={rows} columns={cols} initial={{ key: "kda", desc: true }} rowKey={(p, i) => `${p.u || p.n}-${p.t}-${i}`} />
      <p className="text-[10px] text-[#7e8e9f]">{tl("Click a column to sort. K / D / A are per game; KP = kill participation.")}</p>
    </Section>
  );
};

export const EventTeamStatsTable: React.FC<{ e: HubEvent; hidden?: boolean }> = ({ e, hidden }) => {
  const teams = e.teamStats || [];
  if (teams.length === 0 || hidden) return null;
  const all: Column<EventTeamStats>[] = [
    { key: "t", label: tl("Team"), value: (t) => t.t.toLowerCase(), render: (t) => <TeamLink name={t.t} u={t.u} /> },
    { key: "g", label: tl("Games"), value: (t) => t.g },
    { key: "wr", label: tl("Win %"), value: (t) => per(t.w, t.g, 3), render: (t) => pct(per(t.w, t.g, 3)) },
    { key: "min", label: tl("Avg game"), value: (t) => per(t.min, t.g), render: (t) => tl("{n} min", { n: per(t.min, t.g) ?? "–" }) },
    { key: "kd", label: "K:D", title: tl("Kills per death"), value: (t) => per(t.k, Math.max(t.d, 1), 2) },
    { key: "k", label: tl("Kills"), title: tl("Kills per game"), value: (t) => per(t.k, t.g) },
    { key: "d", label: tl("Deaths"), title: tl("Deaths per game"), value: (t) => per(t.d, t.g) },
    { key: "gpm", label: tl("GPM"), title: tl("Team gold per minute"), value: (t) => (t.gold ? per(t.gold, t.min, 0) : null) },
    {
      key: "gdm",
      label: tl("GD/m"),
      title: tl("Gold difference per minute, end of game"),
      value: (t) => per(t.gd, t.min, 0),
      render: (t) => {
        const v = per(t.gd, t.min, 0) ?? 0;
        return <span className={v >= 0 ? "text-[#0ac8b9]" : "text-[#e84057]"}>{`${v >= 0 ? "+" : ""}${v}`}</span>;
      },
    },
    { key: "blue", label: tl("Blue%"), title: tl("Share of games on blue side"), value: (t) => (t.blue != null ? per(t.blue, t.g, 3) : null), render: (t) => (t.blue != null ? pct(per(t.blue, t.g, 3)) : "–") },
    {
      key: "gd",
      label: tl("Gold diff"),
      title: tl("Gold difference per game, end of game"),
      value: (t) => per(t.gd, t.g, 0),
      render: (t) => {
        const v = per(t.gd, t.g, 0) ?? 0;
        return <span className={v >= 0 ? "text-[#0ac8b9]" : "text-[#e84057]"}>{`${v >= 0 ? "+" : ""}${fmtNum(v)}`}</span>;
      },
    },
    { key: "drag", label: tl("Dragons"), title: tl("Dragons per game"), value: (t) => per(t.drag, t.g, 2) },
    { key: "drap", label: tl("DRA%"), title: tl("Share of all dragons taken in their games"), value: (t) => (t.odrag != null && t.drag + t.odrag ? per(t.drag, t.drag + t.odrag, 3) : null), render: (t) => (t.odrag != null && t.drag + t.odrag ? pct(per(t.drag, t.drag + t.odrag, 3)) : "–") },
    { key: "bar", label: tl("Barons"), title: tl("Barons per game"), value: (t) => per(t.bar, t.g, 2) },
    { key: "barp", label: tl("Baron%"), title: tl("Share of all barons taken in their games"), value: (t) => (t.obar != null && t.bar + t.obar ? per(t.bar, t.bar + t.obar, 3) : null), render: (t) => (t.obar != null && t.bar + t.obar ? pct(per(t.bar, t.bar + t.obar, 3)) : "–") },
    { key: "tow", label: tl("Towers"), title: tl("Towers per game"), value: (t) => per(t.tow, t.g, 1) },
    { key: "tl", label: tl("Lost"), title: tl("Towers lost per game"), value: (t) => (t.tl != null ? per(t.tl, t.g, 1) : null) },
    { key: "csm", label: tl("CS/m"), title: tl("Team CS per minute"), value: (t) => (t.pmin ? per(t.cs || 0, t.pmin, 1) : null) },
    { key: "dpm", label: tl("DPM"), title: tl("Team damage per minute"), value: (t) => (t.pmin ? per(t.dmg || 0, t.pmin, 0) : null) },
    { key: "grub", label: tl("Void grubs"), title: tl("Void grubs per game"), value: (t) => per(t.grub, t.g, 1) },
  ];
  // Void grubs only exist since 2024
  const cols = all.filter((c) => c.key !== "grub" || teams.some((t) => t.grub > 0));
  return (
    <Section title={tl("Team stats")}>
      <SortTable rows={teams} columns={cols} initial={{ key: "wr", desc: true }} rowKey={(t, i) => `${t.t}-${i}`} />
      <p className="text-[10px] text-[#7e8e9f]">{tl("Per game, games with a full scoreboard only.")}</p>
    </Section>
  );
};
