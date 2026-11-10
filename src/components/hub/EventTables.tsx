/** gol.gg-style stat tables for one tournament: every player and every team, sortable by any column. */
import React, { useMemo, useState } from "react";
import { tl, roleName } from "../../i18n";
import { prettySlug } from "../../hub/data";
import { hubShareUrl } from "../../hub/route";
import { champName } from "../../champions";
import type { EventPlayer, EventTeamStats, HubEvent } from "../../hub/types";
import { ChampIcon, HubLink, OeCredit, PlayerLink, PlayerPhoto, Section, TeamLink, TeamLogo, fmtNum } from "./ui";
import { SectionCard } from "./BroadcastCard";
import { Column, SortTable, per } from "./SortTable";
import { WinBar, KdaBar } from "./OpponentChart";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);
const signed = (v: number | null) => (v == null ? "–" : <span className={v >= 0 ? "text-rw-teal" : "text-rw-red"}>{`${v > 0 ? "+" : ""}${fmtNum(v)}`}</span>);
const shareTone = (v: number | null, hi = 0.52, lo = 0.48) => {
  if (v == null) return "–";
  const c = v >= hi ? "text-rw-teal font-semibold" : v <= lo ? "text-rw-red" : "";
  return <span className={c}>{pct(v)}</span>;
};

/** Oracle's Elixir columns for the player table (leads over the lane opponent at 15, first blood). */
const playerEarlyCols = (wrap: (p: EventPlayer, node: React.ReactNode) => React.ReactNode): Column<EventPlayer>[] => [
  { key: "g15", label: "GD@15", title: tl("Gold lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? per(p.g15 || 0, p.tn, 0) : null), render: (p) => (p.tn ? wrap(p, signed(per(p.g15 || 0, p.tn, 0))) : "–") },
  { key: "c15", label: "CSD@15", title: tl("CS lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? per(p.c15 || 0, p.tn, 1) : null), render: (p) => (p.tn ? wrap(p, signed(per(p.c15 || 0, p.tn, 1))) : "–") },
  { key: "x15", label: "XPD@15", title: tl("XP lead over the lane opponent at 15 minutes"), value: (p) => (p.tn ? per(p.x15 || 0, p.tn, 0) : null), render: (p) => (p.tn ? wrap(p, signed(per(p.x15 || 0, p.tn, 0))) : "–") },
  { key: "fbp", label: tl("FB%"), title: tl("Took part in first blood (kill or assist)"), value: (p) => (p.fbn ? per(p.fbp || 0, p.fbn, 3) : null), render: (p) => (p.fbn ? wrap(p, shareTone(per(p.fbp || 0, p.fbn, 3), 0.3, 0.12)) : "–") },
];

/** Oracle's Elixir columns for the team table. */
const teamEarlyCols = (wrap: (t: EventTeamStats, node: React.ReactNode) => React.ReactNode): Column<EventTeamStats>[] => [
  { key: "g15", label: "GD@15", title: tl("Gold lead at 15 minutes"), value: (t) => (t.tn ? per(t.g15 || 0, t.tn, 0) : null), render: (t) => (t.tn ? wrap(t, signed(per(t.g15 || 0, t.tn, 0))) : "–") },
  { key: "fb", label: tl("FB%"), title: tl("First blood rate"), value: (t) => (t.fbn ? per(t.fb || 0, t.fbn, 3) : null), render: (t) => (t.fbn ? wrap(t, shareTone(per(t.fb || 0, t.fbn, 3))) : "–") },
  { key: "ft", label: tl("FT%"), title: tl("First tower rate"), value: (t) => (t.fbn ? per(t.ft || 0, t.fbn, 3) : null), render: (t) => (t.fbn ? wrap(t, shareTone(per(t.ft || 0, t.fbn, 3))) : "–") },
  { key: "pl", label: tl("Plates"), title: tl("Turret plates taken per game"), value: (t) => (t.pln ? per(t.pl || 0, t.pln, 1) : null), render: (t) => (t.pln ? wrap(t, per(t.pl || 0, t.pln, 1)) : "–") },
];

export const EventPlayerStats: React.FC<{ e: HubEvent; hidden?: boolean }> = ({ e, hidden }) => {
  const players = hidden ? [] : e.players || [];
  const [role, setRole] = useState("All");
  const [search, setSearch] = useState("");
  const maxG = Math.max(0, ...players.map((p) => p.g));
  const [regular, setRegular] = useState(true);
  const minG = Math.max(2, Math.ceil(maxG * 0.4));
  const rows = useMemo(() => {
    const terms = search
      .toLowerCase()
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    return players.filter(
      (p) =>
        (role === "All" || p.r === role) &&
        (!regular || p.g >= minG || maxG < 3) &&
        (!terms.length ||
          terms.some((term) => `${p.n} ${p.u || ""} ${p.t} ${p.tu || ""}`.toLowerCase().includes(term))),
    );
  }, [players, role, regular, minG, maxG, search]);
  if (players.length === 0) return null;
  const pStatLink = (p: EventPlayer, node: React.ReactNode) =>
    node == null || node === "–" ? (
      "–"
    ) : (
      <HubLink
        to={
          p.u
            ? { kind: "player", slug: p.u, tab: "stats", query: `p=e:${encodeURIComponent(e.u)}` }
            : { kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(p.n)}` }
        }
        className="hover:text-rw-accent hover:underline"
        title={tl("Stats")}
      >
        {node}
      </HubLink>
    );
  const cols: Column<EventPlayer>[] = [
    {
      key: "n",
      label: tl("Player"),
      value: (p) => p.n.toLowerCase(),
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <HubLink to={{ kind: "player", slug: p.u || prettySlug(p.n) }} className="shrink-0 hover:opacity-80" title={p.n}>
            <PlayerPhoto name={p.n} team={p.t} slug={p.u ?? undefined} size={18} />
          </HubLink>
          <PlayerLink name={p.n} u={p.u} />
        </span>
      ),
    },
    {
      key: "t",
      label: tl("Team"),
      value: (p) => p.t.toLowerCase(),
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 max-w-[9rem] truncate align-bottom">
          <HubLink to={{ kind: "team", slug: p.tu || prettySlug(p.t) }} className="shrink-0 hover:opacity-80" title={p.t}>
            <TeamLogo name={p.t} size={14} />
          </HubLink>
          <TeamLink name={p.t} u={p.tu} className="truncate" />
        </span>
      ),
    },
    {
      key: "r",
      label: tl("Role"),
      value: (p) => ROLES.indexOf(p.r),
      render: (p) => (
        <button
          type="button"
          onClick={() => setRole(role === p.r ? "All" : p.r)}
          className="text-rw-muted hover:text-rw-accent hover:underline"
        >
          {roleName(p.r)}
        </button>
      ),
    },
    {
      key: "g",
      label: tl("Games"),
      value: (p) => p.g,
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
            <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(8, Math.round((p.g / Math.max(1, maxG)) * 100))}%` }} />
          </span>
          <HubLink
            to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(p.u || p.n)}` }}
            className="hover:text-rw-accent hover:underline"
          >
            {p.g}
          </HubLink>
        </span>
      ),
    },
    {
      key: "wr",
      label: tl("Win %"),
      value: (p) => per(p.w, p.g, 3),
      render: (p) => (
        <HubLink
          to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(p.u || p.n)}` }}
          className="hover:opacity-90"
          title={tl("Game finder")}
        >
          <WinBar w={p.w} g={p.g} />
        </HubLink>
      ),
    },
    {
      key: "kda",
      label: tl("KDA"),
      value: (p) => per(p.k + p.a, Math.max(p.d, 1), 2),
      render: (p) =>
        p.u ? (
          <HubLink
            to={{ kind: "player", slug: p.u, tab: "stats", query: `p=e:${encodeURIComponent(e.u)}` }}
            className="inline-flex hover:opacity-85"
            title={tl("Stats")}
          >
            <KdaBar kda={per(p.k + p.a, Math.max(p.d, 1), 2) ?? 0} />
          </HubLink>
        ) : (
          <KdaBar kda={per(p.k + p.a, Math.max(p.d, 1), 2) ?? 0} />
        ),
    },
    { key: "k", label: "K", title: tl("Kills per game"), value: (p) => per(p.k, p.g), render: (p) => pStatLink(p, per(p.k, p.g)) },
    { key: "d", label: "D", title: tl("Deaths per game"), value: (p) => per(p.d, p.g), render: (p) => pStatLink(p, per(p.d, p.g)) },
    { key: "a", label: "A", title: tl("Assists per game"), value: (p) => per(p.a, p.g), render: (p) => pStatLink(p, per(p.a, p.g)) },
    { key: "kp", label: "KP", title: tl("Kill participation"), value: (p) => per(p.k + p.a, p.tk, 3), render: (p) => (p.tk ? pStatLink(p, shareTone(per(p.k + p.a, p.tk, 3), 0.72, 0.58)) : "–") },
    { key: "csm", label: tl("CS/m"), title: tl("CS per minute"), value: (p) => per(p.cs, p.min), render: (p) => pStatLink(p, per(p.cs, p.min)) },
    { key: "gpm", label: tl("GPM"), title: tl("Gold per minute"), value: (p) => per(p.gold, p.min, 0), render: (p) => pStatLink(p, per(p.gold, p.min, 0)) },
    { key: "dpm", label: tl("DPM"), title: tl("Damage per minute"), value: (p) => (p.dmg ? per(p.dmg, p.dm ?? p.min, 0) : null), render: (p) => (p.dmg ? pStatLink(p, per(p.dmg, p.dm ?? p.min, 0)) : "–") },
    { key: "vpm", label: tl("VS/m"), title: tl("Vision score per minute"), value: (p) => per(p.vis, p.vmin, 2), render: (p) => pStatLink(p, per(p.vis, p.vmin, 2)) },
    { key: "dmgs", label: tl("DMG%"), title: tl("Share of the team's damage to champions"), value: (p) => (p.td ? per(p.sd || 0, p.td, 3) : null), render: (p) => (p.td ? pStatLink(p, shareTone(per(p.sd || 0, p.td, 3), 0.26, 0.1)) : "–") },
    { key: "golds", label: tl("Gold%"), title: tl("Share of the team's gold"), value: (p) => (p.tg ? per(p.sg || 0, p.tg, 3) : null), render: (p) => (p.tg ? pStatLink(p, pct(per(p.sg || 0, p.tg, 3))) : "–") },
    { key: "viss", label: tl("VS%"), title: tl("Share of the team's vision score"), value: (p) => (p.tv ? per(p.sv || 0, p.tv, 3) : null), render: (p) => (p.tv ? pStatLink(p, pct(per(p.sv || 0, p.tv, 3))) : "–") },
    {
      key: "nc",
      label: tl("Champions"),
      value: (p) => p.nc,
      render: (p) => (
        <span className="flex items-center gap-0.5">
          {p.c.map((c) => (
            <HubLink
              key={c}
              to={
                p.u
                  ? { kind: "player", slug: p.u, tab: "champions", query: `champ=${encodeURIComponent(c)}&p=e:${encodeURIComponent(e.u)}` }
                  : { kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(p.n)}&champ=${encodeURIComponent(c)}` }
              }
              className="hover:opacity-80"
              title={`${p.n} · ${champName(c)}`}
            >
              <ChampIcon name={c} size={16} />
            </HubLink>
          ))}
          {p.nc > p.c.length && (
            <HubLink
              to={
                p.u
                  ? { kind: "player", slug: p.u, tab: "champions", query: `p=e:${encodeURIComponent(e.u)}` }
                  : { kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(p.n)}` }
              }
              className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline ml-0.5"
            >
              +{p.nc - p.c.length}
            </HubLink>
          )}
        </span>
      ),
    },
  ];
  if (players.some((p) => p.mvp))
    cols.splice(5, 0, {
      key: "mvp",
      label: tl("POG"),
      title: tl("Player of the Game awards"),
      value: (p) => p.mvp || 0,
      render: (p) =>
        p.mvp ? (
          <HubLink
            to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(p.u || p.n)}` }}
            className="hover:text-rw-accent hover:underline font-semibold"
          >
            {p.mvp}
          </HubLink>
        ) : (
          0
        ),
    });
  const early = players.some((p) => p.tn || p.fbn);
  if (early) cols.splice(cols.length - 1, 0, ...playerEarlyCols(pStatLink));
  return (
    <Section
      title={tl("Player stats")}
      share={`${e.u}-players`}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {rows.length >= 2 && rows[0].u && rows[1].u && (
            <HubLink
              to={{ kind: "compare", mode: "player", a: rows[0].u, b: rows[1].u, period: `e:${e.u}` }}
              className="text-[11px] text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Compare")} →
            </HubLink>
          )}
          {rows.length >= 1 && rows[0].u && (
            <HubLink
              to={{ kind: "items", query: `player=${encodeURIComponent(rows[0].u)}` }}
              className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
              data-nocapture="1"
            >
              {tl("Item history")} →
            </HubLink>
          )}
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(e.start?.slice(0, 4) ? { year: e.start.slice(0, 4) } : {}),
                event: e.u,
                ...(role !== "All" ? { role } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Leaderboards")} →
          </HubLink>
          <HubLink
            to={{
              kind: "champions",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(e.start?.slice(0, 4) ? { year: e.start.slice(0, 4) } : {}),
                event: e.u,
                ...(role !== "All" ? { role } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Champions")} →
          </HubLink>
          <HubLink
            to={{
              kind: "tiers",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(e.start?.slice(0, 4) ? { key: `y${e.start.slice(0, 4)}` } : {}),
                ...(role !== "All" ? { role } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink
            to={{ kind: "draft", query: `p=e:${encodeURIComponent(e.u)}` }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Draft board")} →
          </HubLink>
          <HubLink
            to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}${role !== "All" ? `&role=${encodeURIComponent(role)}` : ""}` }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Game finder")} →
          </HubLink>
          <HubLink
            to={{ kind: "rankings", ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}) }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Power rankings")} →
          </HubLink>
          <CopyEventTablePost
            title={`${tl("Player stats")} · ${e.n} (${role === "All" ? tl("All roles") : roleName(role)})`}
            rows={[...rows]
              .sort((a, b) => (per(b.k + b.a, Math.max(b.d, 1), 2) || 0) - (per(a.k + a.a, Math.max(a.d, 1), 2) || 0))
              .slice(0, 6)
              .map((p, idx) => `#${idx + 1} ${p.n} (${p.t}, ${roleName(p.r)}): ${per(p.k + p.a, Math.max(p.d, 1), 2) ?? "–"} KDA · ${pct(per(p.w, p.g, 3))}`)}
            url={hubShareUrl({ kind: "event", slug: e.u, tab: "stats" })}
          />
          <SectionCard
            section={tl("Player stats")}
            sub={`${e.n} · ${role === "All" ? tl("All roles") : roleName(role)}`}
            name={`${e.u}-player-stats-${role}`}
            rows={() =>
              [...rows]
                .sort((a, b) => (per(b.k + b.a, Math.max(b.d, 1), 2) || 0) - (per(a.k + a.a, Math.max(a.d, 1), 2) || 0))
                .slice(0, 10)
                .map((p, idx) => ({
                  rank: idx + 1,
                  team: p.t,
                  label: p.n,
                  sub: `${p.t} · ${roleName(p.r)} · ${pct(per(p.w, p.g, 3))}`,
                  value: `${per(p.k + p.a, Math.max(p.d, 1), 2) ?? "–"} KDA`,
                  win: p.g >= 2 ? p.w / p.g >= 0.5 : undefined,
                }))
            }
          />
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {["All", ...ROLES].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`px-2 py-1 rounded border ${role === r ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"}`}
          >
            {r === "All" ? tl("All roles") : roleName(r)}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          placeholder={tl("Filter by name or team…")}
          aria-label={tl("Filter by name or team…")}
          className="bg-rw-bg border border-rw-border rounded px-2 py-1 text-[11px] text-rw-text w-40"
        />
        {(rows.length === 2 || (search.trim() && rows.length >= 2)) && rows[0].u && rows[1].u && (
          <>
            <HubLink
              to={{ kind: "compare", mode: "player", a: rows[0].u, b: rows[1].u, period: `e:${e.u}` }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Compare")} →
            </HubLink>
            {rows[0].t !== rows[1].t && (
              <>
                <HubLink
                  to={{ kind: "prep", a: rows[0].tu || prettySlug(rows[0].t), b: rows[1].tu || prettySlug(rows[1].t), period: `e:${e.u}` }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Match prep")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "draft",
                    query: `teams=${encodeURIComponent(rows[0].tu || prettySlug(rows[0].t))},${encodeURIComponent(rows[1].tu || prettySlug(rows[1].t))}&p=e:${encodeURIComponent(e.u)}`,
                  }}
                  className="text-rw-accent hover:underline font-semibold"
                >
                  {tl("Draft board")} →
                </HubLink>
              </>
            )}
          </>
        )}
        {search.trim() && rows.length === 1 && rows[0].u && (
          <>
            <HubLink
              to={{ kind: "compare", mode: "player", a: rows[0].u, period: `e:${e.u}` }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Compare")} →
            </HubLink>
            <HubLink
              to={{ kind: "items", query: `player=${encodeURIComponent(rows[0].u)}` }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Item history")} →
            </HubLink>
            <HubLink
              to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&player=${encodeURIComponent(rows[0].u)}` }}
              className="text-rw-accent hover:underline font-semibold"
            >
              {tl("Game finder")} →
            </HubLink>
          </>
        )}
        {maxG >= 3 && (
          <label className="flex items-center gap-1 ml-auto text-rw-sub cursor-pointer">
            <input type="checkbox" checked={regular} onChange={(ev) => setRegular(ev.target.checked)} />
            {tl("Only players with {n}+ games", { n: minG })}
          </label>
        )}
      </div>
      <SortTable rows={rows} columns={cols} initial={{ key: "kda", desc: true }} rowKey={(p, i) => `${p.u || p.n}-${p.t}-${i}`} copyName={`${e.u}-players`} />
      <p className="text-[10px] text-rw-muted">{tl("Click a column to sort. K / D / A are per game; KP = kill participation.")}</p>
      {early && <OeCredit />}
    </Section>
  );
};

export const EventTeamStatsTable: React.FC<{ e: HubEvent; hidden?: boolean }> = ({ e, hidden }) => {
  const teams = e.teamStats || [];
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const terms = search
      .toLowerCase()
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    return !terms.length ? teams : teams.filter((t) => terms.some((term) => `${t.t} ${t.u || ""}`.toLowerCase().includes(term)));
  }, [teams, search]);
  if (teams.length === 0 || hidden) return null;
  const maxTeamG = Math.max(1, ...teams.map((t) => t.g));
  const tStatLink = (t: EventTeamStats, node: React.ReactNode) =>
    node == null || node === "–" ? (
      "–"
    ) : (
      <HubLink
        to={{ kind: "team", slug: t.u || prettySlug(t.t), tab: "stats", query: `p=e:${encodeURIComponent(e.u)}` }}
        className="hover:text-rw-accent hover:underline"
        title={tl("Stats")}
      >
        {node}
      </HubLink>
    );
  const all: Column<EventTeamStats>[] = [
    {
      key: "t",
      label: tl("Team"),
      value: (t) => t.t.toLowerCase(),
      render: (t) => (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <HubLink to={{ kind: "team", slug: t.u || prettySlug(t.t) }} className="shrink-0 hover:opacity-80" title={t.t}>
            <TeamLogo name={t.t} size={15} />
          </HubLink>
          <TeamLink name={t.t} u={t.u} />
        </span>
      ),
    },
    {
      key: "g",
      label: tl("Games"),
      value: (t) => t.g,
      render: (t) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="w-8 h-1.5 bg-rw-bg rounded-full overflow-hidden hidden sm:inline-block shrink-0">
            <span className="block h-full bg-rw-accent/70 rounded-full" style={{ width: `${Math.max(8, Math.round((t.g / maxTeamG) * 100))}%` }} />
          </span>
          <HubLink
            to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&team=${encodeURIComponent(t.u || t.t)}` }}
            className="hover:text-rw-accent hover:underline"
          >
            {t.g}
          </HubLink>
        </span>
      ),
    },
    {
      key: "wr",
      label: tl("Win %"),
      value: (t) => per(t.w, t.g, 3),
      render: (t) => (
        <HubLink
          to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&team=${encodeURIComponent(t.u || t.t)}` }}
          className="hover:opacity-90"
          title={tl("Game finder")}
        >
          <WinBar w={t.w} g={t.g} />
        </HubLink>
      ),
    },
    {
      key: "min",
      label: tl("Avg game"),
      value: (t) => per(t.min, t.g),
      render: (t) => tStatLink(t, tl("{n} min", { n: per(t.min, t.g) ?? "–" })),
    },
    {
      key: "kd",
      label: "K:D",
      title: tl("Kills per death"),
      value: (t) => per(t.k, Math.max(t.d, 1), 2),
      render: (t) => {
        const v = per(t.k, Math.max(t.d, 1), 2);
        if (v == null) return "–";
        return (
          <HubLink
            to={{ kind: "team", slug: t.u || prettySlug(t.t), tab: "stats", query: `p=e:${encodeURIComponent(e.u)}` }}
            className={`hover:underline ${v >= 1.15 ? "text-rw-teal font-semibold" : v <= 0.85 ? "text-rw-red" : ""}`}
            title={tl("Stats")}
          >
            {v}
          </HubLink>
        );
      },
    },
    { key: "k", label: tl("Kills"), title: tl("Kills per game"), value: (t) => per(t.k, t.g), render: (t) => tStatLink(t, per(t.k, t.g)) },
    { key: "d", label: tl("Deaths"), title: tl("Deaths per game"), value: (t) => per(t.d, t.g), render: (t) => tStatLink(t, per(t.d, t.g)) },
    { key: "gpm", label: tl("GPM"), title: tl("Team gold per minute"), value: (t) => (t.gold ? per(t.gold, t.min, 0) : null), render: (t) => (t.gold ? tStatLink(t, per(t.gold, t.min, 0)) : "–") },
    {
      key: "gdm",
      label: tl("GD/m"),
      title: tl("Gold difference per minute, end of game"),
      value: (t) => per(t.gd, t.min, 0),
      render: (t) => {
        const v = per(t.gd, t.min, 0) ?? 0;
        return tStatLink(t, <span className={v >= 0 ? "text-rw-teal" : "text-rw-red"}>{`${v >= 0 ? "+" : ""}${v}`}</span>);
      },
    },
    {
      key: "blue",
      label: tl("Blue%"),
      title: tl("Share of games on blue side"),
      value: (t) => (t.blue != null ? per(t.blue, t.g, 3) : null),
      render: (t) =>
        t.blue != null ? (
          t.blue > 0 ? (
            <HubLink
              to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&team=${encodeURIComponent(t.u || t.t)}&side=b` }}
              className="hover:text-rw-accent hover:underline"
            >
              {pct(per(t.blue, t.g, 3))}
            </HubLink>
          ) : (
            pct(per(t.blue, t.g, 3))
          )
        ) : (
          "–"
        ),
    },
    {
      key: "gd",
      label: tl("Gold diff"),
      title: tl("Gold difference per game, end of game"),
      value: (t) => per(t.gd, t.g, 0),
      render: (t) => {
        const v = per(t.gd, t.g, 0) ?? 0;
        return (
          <HubLink
            to={{ kind: "team", slug: t.u || prettySlug(t.t), tab: "stats", query: `p=e:${encodeURIComponent(e.u)}` }}
            className={`hover:underline ${v >= 0 ? "text-rw-teal" : "text-rw-red"}`}
            title={tl("Stats")}
          >
            {`${v >= 0 ? "+" : ""}${fmtNum(v)}`}
          </HubLink>
        );
      },
    },
    { key: "drag", label: tl("Dragons"), title: tl("Dragons per game"), value: (t) => per(t.drag, t.g, 2), render: (t) => tStatLink(t, per(t.drag, t.g, 2)) },
    { key: "drap", label: tl("DRA%"), title: tl("Share of all dragons taken in their games"), value: (t) => (t.odrag != null && t.drag + t.odrag ? per(t.drag, t.drag + t.odrag, 3) : null), render: (t) => (t.odrag != null && t.drag + t.odrag ? tStatLink(t, shareTone(per(t.drag, t.drag + t.odrag, 3))) : "–") },
    { key: "bar", label: tl("Barons"), title: tl("Barons per game"), value: (t) => per(t.bar, t.g, 2), render: (t) => tStatLink(t, per(t.bar, t.g, 2)) },
    { key: "barp", label: tl("Baron%"), title: tl("Share of all barons taken in their games"), value: (t) => (t.obar != null && t.bar + t.obar ? per(t.bar, t.bar + t.obar, 3) : null), render: (t) => (t.obar != null && t.bar + t.obar ? tStatLink(t, shareTone(per(t.bar, t.bar + t.obar, 3))) : "–") },
    { key: "tow", label: tl("Towers"), title: tl("Towers per game"), value: (t) => per(t.tow, t.g, 1), render: (t) => tStatLink(t, per(t.tow, t.g, 1)) },
    { key: "tl", label: tl("Lost"), title: tl("Towers lost per game"), value: (t) => (t.tl != null ? per(t.tl, t.g, 1) : null), render: (t) => (t.tl != null ? tStatLink(t, per(t.tl, t.g, 1)) : "–") },
    { key: "csm", label: tl("CS/m"), title: tl("Team CS per minute"), value: (t) => (t.pmin ? per(t.cs || 0, t.pmin, 1) : null), render: (t) => (t.pmin ? tStatLink(t, per(t.cs || 0, t.pmin, 1)) : "–") },
    { key: "dpm", label: tl("DPM"), title: tl("Team damage per minute"), value: (t) => (t.pmin ? per(t.dmg || 0, t.pmin, 0) : null), render: (t) => (t.pmin ? tStatLink(t, per(t.dmg || 0, t.pmin, 0)) : "–") },
    { key: "grub", label: tl("Void grubs"), title: tl("Void grubs per game"), value: (t) => per(t.grub, t.g, 1), render: (t) => tStatLink(t, per(t.grub, t.g, 1)) },
  ];
  // Void grubs only exist since 2024
  const cols = all.filter((c) => c.key !== "grub" || teams.some((t) => t.grub > 0));
  const early = teams.some((t) => t.tn || t.fbn || t.pln);
  if (early) cols.push(...teamEarlyCols(tStatLink));
  const pair =
    rows.length === 2 || (search.trim() && rows.length >= 2)
      ? [rows[0].u || prettySlug(rows[0].t), rows[1].u || prettySlug(rows[1].t)]
      : null;
  return (
    <Section
      title={tl("Team stats")}
      share={`${e.u}-teams`}
      right={
        <span className="flex flex-wrap items-center gap-2">
          {rows.length >= 2 && (
            <>
              <HubLink
                to={{
                  kind: "prep",
                  a: rows[0].u || prettySlug(rows[0].t),
                  b: rows[1].u || prettySlug(rows[1].t),
                  period: `e:${e.u}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "compare",
                  mode: "team",
                  a: rows[0].u || prettySlug(rows[0].t),
                  b: rows[1].u || prettySlug(rows[1].t),
                  period: `e:${e.u}`,
                }}
                className="text-[11px] text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Compare")} →
              </HubLink>
            </>
          )}
          <HubLink
            to={{
              kind: "champions",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(e.start?.slice(0, 4) ? { year: e.start.slice(0, 4) } : {}),
                event: e.u,
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Champions")} →
          </HubLink>
          <HubLink
            to={{
              kind: "tiers",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(e.start?.slice(0, 4) ? { key: `y${e.start.slice(0, 4)}` } : {}),
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Pro tier list")} →
          </HubLink>
          <HubLink
            to={{ kind: "rankings", ...(e.lu ? { query: `league=${encodeURIComponent(e.lu)}` } : {}) }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Power rankings")} →
          </HubLink>
          <HubLink
            to={{ kind: "draft", query: `p=e:${encodeURIComponent(e.u)}` }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Draft board")} →
          </HubLink>
          <HubLink
            to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}` }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Game finder")} →
          </HubLink>
          <HubLink
            to={{
              kind: "leaders",
              query: new URLSearchParams({
                ...(e.lu ? { league: e.lu } : {}),
                ...(e.start?.slice(0, 4) ? { year: e.start.slice(0, 4) } : {}),
                event: e.u,
              }).toString(),
            }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Player leaderboards")} →
          </HubLink>
          <CopyEventTablePost
            title={`${tl("Team stats")} · ${e.n}`}
            rows={[...rows]
              .sort((a, b) => (per(b.w, b.g, 3) || 0) - (per(a.w, a.g, 3) || 0))
              .slice(0, 6)
              .map((t, idx) => `#${idx + 1} ${t.t}: ${t.w}-${t.g - t.w} (${pct(per(t.w, t.g, 3))}) · ${per(t.min, t.g) ?? "–"}m`)}
            url={hubShareUrl({ kind: "event", slug: e.u, tab: "stats" })}
          />
          <SectionCard
            section={tl("Team stats")}
            sub={e.n}
            name={`${e.u}-team-stats`}
            rows={() =>
              [...rows]
                .sort((a, b) => (per(b.w, b.g, 3) || 0) - (per(a.w, a.g, 3) || 0))
                .slice(0, 10)
                .map((t, idx) => ({
                  rank: idx + 1,
                  team: t.t,
                  label: t.t,
                  sub: `${t.w}-${t.g - t.w} · ${per(t.min, t.g) ?? "–"} min`,
                  value: pct(per(t.w, t.g, 3)),
                  win: t.g > 0 ? t.w / t.g >= 0.5 : undefined,
                }))
            }
          />
        </span>
      }
    >
      {teams.length > 2 && (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-nocapture="1">
          <input
            type="search"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder={tl("Filter by name or team…")}
            aria-label={tl("Filter by name or team…")}
            className="bg-rw-bg border border-rw-border rounded px-2 py-1 text-[11px] text-rw-text w-44"
          />
          {pair && (
            <span className="flex items-center gap-2 text-[11px]">
              <HubLink to={{ kind: "prep", a: pair[0], b: pair[1], period: `e:${e.u}` }} className="text-rw-accent hover:underline font-semibold">
                {tl("Match prep")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{ kind: "draft", query: `teams=${encodeURIComponent(pair[0])},${encodeURIComponent(pair[1])}&p=e:${encodeURIComponent(e.u)}` }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Draft board")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink to={{ kind: "compare", mode: "team", a: pair[0], b: pair[1], period: `e:${e.u}` }} className="text-rw-accent hover:underline font-semibold">
                {tl("Compare")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&team=${encodeURIComponent(pair[0])}&vs=${encodeURIComponent(pair[1])}` }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Game finder")}
              </HubLink>
            </span>
          )}
          {search.trim() && rows.length === 1 && (
            <span className="flex items-center gap-2 text-[11px]">
              <HubLink
                to={{ kind: "prep", a: rows[0].u || prettySlug(rows[0].t), period: `e:${e.u}` }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Match prep")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{ kind: "draft", query: `teams=${encodeURIComponent(rows[0].u || prettySlug(rows[0].t))}&p=e:${encodeURIComponent(e.u)}` }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Draft board")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{ kind: "compare", mode: "team", a: rows[0].u || prettySlug(rows[0].t), period: `e:${e.u}` }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Compare")}
              </HubLink>
              <span className="text-rw-muted">·</span>
              <HubLink
                to={{ kind: "finder", query: `event=${encodeURIComponent(e.u)}&team=${encodeURIComponent(rows[0].u || prettySlug(rows[0].t))}` }}
                className="text-rw-accent hover:underline font-semibold"
              >
                {tl("Game finder")}
              </HubLink>
            </span>
          )}
        </div>
      )}
      <SortTable rows={rows} columns={cols} initial={{ key: "wr", desc: true }} rowKey={(t, i) => `${t.t}-${i}`} copyName={`${e.u}-teams`} />
      <p className="text-[10px] text-rw-muted">{tl("Per game, games with a full scoreboard only.")}</p>
      {early && <OeCredit />}
    </Section>
  );
};

const CopyEventTablePost: React.FC<{
  title: string;
  rows: string[];
  url: string;
}> = ({ title, rows, url }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const lines: string[] = [title];
    for (const r of rows) {
      lines.push(r);
    }
    lines.push(url);
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        setState("failed");
        setTimeout(() => setState("idle"), 2400);
      });
  };
  return (
    <button
      type="button"
      data-nocapture="1"
      onClick={copy}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
      title={tl("Copy post")}
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
