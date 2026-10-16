/** Patch history (the pro meta on every patch) and league histories (every season and its winner). */
import React, { useMemo, useState } from "react";
import { Crown } from "lucide-react";
import { tl, tn, regionName } from "../../i18n";
import { loadLeague, loadLeagues, loadPatches } from "../../hub/data";
import type { HubLeague, LeagueRow, PatchRow } from "../../hub/types";
import { useDDragon } from "../../hub/ddragon";
import {
  card,
  ChampLink,
  EventLink,
  fmtDate,
  fmtNum,
  HubLink,
  Page,
  RevealButton,
  Section,
  td,
  th,
  TeamLink,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";

// ── Patches ───────────────────────────────────────────────────────────────

export const PatchesPanel: React.FC = () => {
  usePageTitle(tl("Patches"));
  useDDragon();
  const state = useLoad(loadPatches, []);
  const [n, setN] = useState(24);
  return (
    <Page state={state}>
      {(rows: PatchRow[]) => (
        <div className="space-y-3">
          <p className="text-[11px] text-[#7e8e9f]">
            {tl(
              "The most picked or banned champions on every patch, newest first (all pro leagues). Percent = presence: picked or banned in that share of games.",
            )}
          </p>
          {rows.slice(0, n).map((p) => (
            <div key={p.p} className={`${card} p-3`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-[#f0e6d2]">
                  {tl("Patch {patch}", { patch: p.p })}
                </h3>
                <span className="text-[11px] text-[#7e8e9f]">
                  {fmtDate(p.from)} – {fmtDate(p.to)} ·{" "}
                  {tn("{n} game", "{n} games", p.g)}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1 text-xs">
                {p.c.map(([c, pk, b, w]) => (
                  <div
                    key={c}
                    className="flex items-center justify-between gap-1 min-w-0"
                  >
                    <ChampLink name={c} size={18} />
                    <span
                      className="text-[#9bb3c9] tabular-nums shrink-0"
                      title={tl("{p} picks · {b} bans · {wr}", {
                        p: pk,
                        b,
                        wr: pk ? `${Math.round((w / pk) * 100)}%` : "–",
                      })}
                    >
                      {Math.round(((pk + b) / Math.max(p.g, 1)) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {rows.length > n && (
            <button
              type="button"
              onClick={() => setN((x) => x + 48)}
              className="text-xs text-[#0ac8b9] hover:underline"
            >
              {tl("Show more ({n} left)", { n: rows.length - n })}
            </button>
          )}
        </div>
      )}
    </Page>
  );
};

// ── Leagues ───────────────────────────────────────────────────────────────

export const LeaguesPanel: React.FC = () => {
  usePageTitle(tl("Leagues"));
  const state = useLoad(loadLeagues, []);
  const [scope, setScope] = useState<"main" | "all">("main");
  const [q, setQ] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-lg border border-[#1e282d] overflow-hidden">
          {(["main", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-2.5 py-1.5 ${scope === s ? "bg-[#c8aa6e] text-[#091428] font-bold" : "text-[#9bb3c9]"}`}
            >
              {s === "main"
                ? tl("Main leagues & internationals")
                : tl("Everything")}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tl("Filter by name or region…")}
          aria-label={tl("Filter by name or region…")}
          className="bg-[#091428] border border-[#1e282d] rounded-lg px-2.5 py-1.5 text-[#f0e6d2] placeholder-[#7e8e9f] flex-1 min-w-[10rem]"
        />
      </div>
      <Page state={state}>
        {(rows: LeagueRow[]) => <LeagueTable rows={rows} scope={scope} q={q} />}
      </Page>
    </div>
  );
};

const LeagueTable: React.FC<{
  rows: LeagueRow[];
  scope: "main" | "all";
  q: string;
}> = ({ rows, scope, q }) => {
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((l) =>
      qq
        ? `${l.l} ${l.r || ""}`.toLowerCase().includes(qq)
        : scope === "all" || l.pr,
    );
  }, [rows, scope, q]);
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className={th}>{tl("League")}</th>
            <th className={th}>{tl("Region")}</th>
            <th className={th}>{tl("Years")}</th>
            <th className={th}>{tl("Tournaments")}</th>
            <th className={th}>{tl("Games")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((l) => (
            <tr key={l.u} className="border-t border-[#1e282d]">
              <td className={`${td} max-w-[16rem] truncate`}>
                <HubLink to={{ kind: "league", slug: l.u }}>{l.l}</HubLink>
              </td>
              <td className={`${td} text-[#9bb3c9]`}>
                {l.r ? regionName(l.r, l.r) : ""}
              </td>
              <td className={`${td} text-[#7e8e9f]`}>
                {l.from && l.to
                  ? l.from === l.to
                    ? l.from
                    : `${l.from}–${l.to}`
                  : ""}
              </td>
              <td className={`${td} text-[#9bb3c9]`}>{l.n}</td>
              <td className={`${td} text-[#7e8e9f]`}>{fmtNum(l.g)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const LeaguePage: React.FC<{ slug: string }> = ({ slug }) => {
  const state = useLoad(() => loadLeague(slug), [slug]);
  usePageTitle(state.data?.l);
  return <Page state={state}>{(l) => <LeagueView l={l} />}</Page>;
};

const LeagueView: React.FC<{ l: HubLeague }> = ({ l }) => {
  const years = [...new Set(l.events.map((e) => e.y))];
  return (
    <div className="space-y-3">
      <div className={card}>
        <h2 className="text-lg font-bold text-[#f0e6d2]">{l.l}</h2>
        <p className="text-[11px] text-[#9bb3c9]">
          {[
            l.region ? regionName(l.region, l.region) : null,
            tn("{n} tournament", "{n} tournaments", l.events.length),
            years.length ? `${years[years.length - 1]}–${years[0]}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {l.titles.length > 0 && (
        <Section title={tl("Most titles")}>
          <ul className="text-xs grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {l.titles.map((t) => (
              <li key={t.t} className="flex justify-between gap-2 min-w-0">
                <span className="truncate">
                  <TeamLink name={t.t} u={t.u} />
                </span>
                <span className="text-[#c8aa6e] font-bold shrink-0">{t.n}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-[#7e8e9f]">
            {tl(
              "Finals won (playoffs, championships and cups). Teams that changed names count as one.",
            )}
          </p>
        </Section>
      )}
      <Section title={tl("Every tournament")}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Tournament")}</th>
                <th className={`${th} hidden sm:table-cell`}>{tl("Dates")}</th>
                <th className={th}>{tl("Winner")}</th>
              </tr>
            </thead>
            <tbody>
              {l.events.map((e) => (
                <LeagueEventRow key={e.u} e={e} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
};

const LeagueEventRow: React.FC<{ e: HubLeague["events"][number] }> = ({
  e,
}) => {
  const [hidden, reveal] = useHidden(`event:${e.u}`, e.en);
  return (
    <tr className="border-t border-[#1e282d]">
      <td className={`${td} max-w-[12rem] sm:max-w-[16rem] truncate`}>
        <EventLink name={e.n} u={e.u} />
      </td>
      <td
        className={`${td} text-[#7e8e9f] hidden sm:table-cell whitespace-nowrap`}
      >
        {fmtDate(e.st, false)}
        {e.en && e.en !== e.st ? ` – ${fmtDate(e.en)}` : ""}
      </td>
      <td className={`${td} max-w-[10rem] truncate`}>
        {e.w ? (
          hidden ? (
            <RevealButton onReveal={reveal} small />
          ) : (
            <span className="flex items-center gap-1">
              <Crown className="w-3 h-3 text-[#c8aa6e] shrink-0" />
              <TeamLink name={e.w} u={e.wu} />
            </span>
          )
        ) : (
          ""
        )}
      </td>
    </tr>
  );
};
