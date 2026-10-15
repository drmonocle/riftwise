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
    { key: "k", label: tl("Kills"), title: tl("Kills per game"), value: (t) => per(t.k, t.g) },
    { key: "d", label: tl("Deaths"), title: tl("Deaths per game"), value: (t) => per(t.d, t.g) },
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
    { key: "bar", label: tl("Barons"), title: tl("Barons per game"), value: (t) => per(t.bar, t.g, 2) },
    { key: "tow", label: tl("Towers"), title: tl("Towers per game"), value: (t) => per(t.tow, t.g, 1) },
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
