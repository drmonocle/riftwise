/**
 * Counter-pick finder: pick a champion and see the lane matchups pro play has seen most, with the champion's win
 * rate and gold lead at 15 minutes in each (hub/matchups/<champion>.json, built from every game with roles).
 * Address: /stats/counters?champ=rumble&role=Top
 */
import React, { useMemo } from "react";
import { tl, roleName } from "../../i18n";
import { champName } from "../../champions";
import { loadHubIndex, loadMatchups, prettySlug } from "../../hub/data";
import { ROLES } from "../../hub/champAgg";
import type { HubMatchups } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { card, ChampIcon, ChampLink, HubLink, Loading, OeCredit, Section, useLoad, usePageTitle } from "./ui";
import { SortTable, type Column } from "./SortTable";

type Row = { c: string; role: number; g: number; w: number; gd: number | null };

/** a champion's page slug from the search index row (the stored slug, else one from the name) */
const champSlug = (c: [string, string, number]) => c[1] || prettySlug(c[0]);

export const CountersPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Counter-pick finder"));
  useDDragon();
  const q = new URLSearchParams(query || "");
  const slug = q.get("champ") || "";
  const role = q.get("role") || "";
  const minG = Math.max(1, Number(q.get("min")) || 5);
  const index = useLoad(loadHubIndex, []);
  const data = useLoad(() => (slug ? loadMatchups(slug) : Promise.resolve(null)), [slug]);
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query || "");
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    navigateHub({ kind: "counters", query: next.toString() }, { replace: true });
  };
  const rows = useMemo<Row[]>(() => {
    const d = data.data;
    if (!d) return [];
    const roleIdx = role ? ROLES.indexOf(role) : -1;
    return d.vs
      .filter(([, r, g]) => g >= minG && (roleIdx < 0 || r === roleIdx))
      .map(([c, r, g, w, gd]) => ({ c, role: r, g, w, gd }));
  }, [data.data, role, minG]);
  const sel = "bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text";
  const columns: Column<Row>[] = [
    { key: "c", label: tl("Lane opponent"), value: (x) => champName(x.c), render: (x) => <ChampLink name={x.c} size={18} /> },
    { key: "role", label: tl("Role"), value: (x) => x.role, render: (x) => (x.role >= 0 ? roleName(ROLES[x.role]) : "–"), className: "text-rw-sub" },
    { key: "g", label: tl("Games"), value: (x) => x.g, className: "tabular-nums text-rw-sub" },
    {
      key: "wr",
      label: tl("Win rate"),
      title: tl("How often {champ} won the game against this lane opponent", { champ: data.data ? champName(data.data.c) : "" }),
      value: (x) => x.w / x.g,
      render: (x) => <span className={x.w / x.g >= 0.55 ? "text-rw-teal font-semibold" : x.w / x.g <= 0.45 ? "text-rw-red" : ""}>{Math.round((x.w / x.g) * 100)}%</span>,
      className: "tabular-nums",
    },
    {
      key: "gd",
      label: "GD@15",
      title: tl("Average gold lead over this lane opponent at 15 minutes (Oracle's Elixir)"),
      value: (x) => x.gd,
      render: (x) => (x.gd == null ? "–" : <span className={x.gd > 150 ? "text-rw-teal" : x.gd < -150 ? "text-rw-red" : ""}>{x.gd > 0 ? "+" : ""}{x.gd}</span>),
      className: "tabular-nums",
    },
  ];
  const good = rows.filter((x) => x.g >= Math.max(minG, 8)).sort((a, b) => b.w / b.g - a.w / a.g).slice(0, 5);
  const bad = rows.filter((x) => x.g >= Math.max(minG, 8)).sort((a, b) => a.w / a.g - b.w / b.g).slice(0, 5);
  return (
    <div className="rw-page">
      <div className={`${card} space-y-2`}>
        <h2 className="text-lg font-bold text-rw-text">{tl("Counter-pick finder")}</h2>
        <p className="text-[11px] text-rw-sub">
          {tl("Pick a champion: every lane opponent pro play has put against it, with its win rate and gold lead at 15 minutes in that matchup. Same role on each side; every pro game with known roles since 2011.")}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            list="rw-champ-list"
            placeholder={tl("Champion…")}
            aria-label={tl("Champion")}
            defaultValue={data.data?.c || ""}
            onChange={(e) => {
              const hit = (index.data?.champs || []).find((c) => c[0].toLowerCase() === e.target.value.trim().toLowerCase());
              if (hit) set({ champ: champSlug(hit) });
            }}
            className={`${sel} w-48`}
          />
          <datalist id="rw-champ-list">
            {(index.data?.champs || []).map((c) => (
              <option key={c[1]} value={c[0]} />
            ))}
          </datalist>
          <select value={role} onChange={(e) => set({ role: e.target.value || undefined })} aria-label={tl("Role")} className={sel}>
            <option value="">{tl("Every role")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleName(r)}
              </option>
            ))}
          </select>
          <select value={String(minG)} onChange={(e) => set({ min: e.target.value })} aria-label={tl("At least")} className={sel}>
            {[1, 3, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {tl("{n}+ games", { n })}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!slug && index.data && (
        <Section title={tl("Most played champions")}>
          <div className="flex flex-wrap gap-2">
            {index.data.champs.slice(0, 40).map((c) => (
              <HubLink key={champSlug(c)} to={{ kind: "counters", query: `champ=${champSlug(c)}` }} className="flex items-center gap-1 px-2 py-1 rounded border border-rw-border text-xs hover:border-rw-accent">
                <ChampIcon name={c[0]} size={18} /> {champName(c[0])}
              </HubLink>
            ))}
          </div>
        </Section>
      )}
      {slug && data.loading && <Loading />}
      {slug && data.data && (
        <>
          {(good.length > 0 || bad.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Section title={tl("{champ} does best against", { champ: champName(data.data.c) })}>
                <ul className="text-xs space-y-1">
                  {good.map((x) => (
                    <li key={x.c + x.role} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <ChampLink name={x.c} size={18} /> <span className="text-rw-muted">{x.role >= 0 ? roleName(ROLES[x.role]) : ""}</span>
                      </span>
                      <span className="tabular-nums text-rw-teal font-semibold">
                        {Math.round((x.w / x.g) * 100)}% <span className="text-rw-muted font-normal">({x.g})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title={tl("{champ} struggles against", { champ: champName(data.data.c) })}>
                <ul className="text-xs space-y-1">
                  {bad.map((x) => (
                    <li key={x.c + x.role} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <ChampLink name={x.c} size={18} /> <span className="text-rw-muted">{x.role >= 0 ? roleName(ROLES[x.role]) : ""}</span>
                      </span>
                      <span className="tabular-nums text-rw-red font-semibold">
                        {Math.round((x.w / x.g) * 100)}% <span className="text-rw-muted font-normal">({x.g})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          )}
          <Section title={tl("Every lane matchup: {champ}", { champ: champName(data.data.c) })} share={`riftwise-counters-${slug}`}>
            <p className="text-[11px] text-rw-muted">{tl("{n} games with a lane opponent in pro play", { n: data.data.g })}</p>
            <SortTable rows={rows} columns={columns} initial={{ key: "g", desc: true }} rowKey={(x) => `${x.c}-${x.role}`} copyName={`riftwise-counters-${slug}`} />
            <OeCredit />
          </Section>
        </>
      )}
      {slug && !data.loading && !data.data && <p className="text-xs text-rw-sub">{tl("No lane matchups for this champion yet.")}</p>}
    </div>
  );
};

/** A small picker used on champion pages and Match prep: open the finder for a champion. */
export const CountersLink: React.FC<{ slug: string; role?: string; className?: string }> = ({ slug, role, className }) => (
  <HubLink to={{ kind: "counters", query: `champ=${slug}${role ? `&role=${role}` : ""}` }} className={className || "text-[11px] text-rw-teal hover:underline font-semibold"}>
    {tl("Counter-picks")}
  </HubLink>
);
