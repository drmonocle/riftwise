/**
 * Counter-pick finder: pick a champion and see the lane matchups pro play has seen most, with the champion's win
 * rate and gold lead at 15 minutes in each (hub/matchups/<champion>.json, built from every game with roles).
 * Address: /stats/counters?champ=rumble&role=Top
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, roleName } from "../../i18n";
import { champName } from "../../champions";
import { bare, loadHubChamp, loadHubIndexQuick, loadMatchups, prettySlug } from "../../hub/data";
import { ROLES } from "../../hub/champAgg";
import type { HubChamp, HubMatchups } from "../../hub/types";
import { navigateHub } from "../../hub/route";
import { useDDragon } from "../../hub/ddragon";
import { card, ChampIcon, ChampLink, HubLink, Loading, OeCredit, Section, useLoad, usePageTitle } from "./ui";
import { SortTable, type Column } from "./SortTable";
import { SectionCard } from "./BroadcastCard";

type Row = { c: string; role: number; g: number; w: number; gd: number | null; csd?: number | null };

/** a champion's page slug from the search index row (the stored slug, else one from the name) */
const champSlug = (c: [string, string, number]) => c[1] || prettySlug(c[0]);

export const CountersPage: React.FC<{ query?: string }> = ({ query }) => {
  usePageTitle(tl("Counter-pick finder"));
  useDDragon();
  const q = new URLSearchParams(query || "");
  const slug = q.get("champ") || "";
  const role = q.get("role") || "";
  const spanParam = q.get("span") || "";
  const index = useLoad(loadHubIndexQuick, []);
  const data = useLoad(
    () =>
      slug
        ? Promise.all([loadMatchups(slug), loadHubChamp(slug).catch(() => null as HubChamp | null)]).then(([m, ch]) => ({ m, ch }))
        : Promise.resolve(null),
    [slug],
  );
  const has12m = useMemo(() => {
    const m12 = data.data?.ch?.matchups12;
    return !!m12 && Object.values(m12).some((l) => l && l.length > 0);
  }, [data.data]);
  const span: "12m" | "all" = spanParam === "all" ? "all" : spanParam === "12m" ? "12m" : has12m ? "12m" : "all";
  const defaultMin = span === "12m" ? 2 : 5;
  const minG = Math.max(1, Number(q.get("min")) || defaultMin);
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query || "");
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    navigateHub({ kind: "counters", query: next.toString() }, { replace: true });
  };
  const [inputVal, setInputVal] = useState("");
  useEffect(() => {
    if (data.data?.m?.c) setInputVal(champName(data.data.m.c));
    else if (!slug) setInputVal("");
  }, [data.data?.m?.c, slug]);
  const matchChamp = (raw: string) => {
    const b = bare(raw.trim());
    if (!b) return undefined;
    const list = index.data?.champs || [];
    return (
      list.find((c) => bare(c[0]) === b || bare(champName(c[0])) === b || c[1] === b) ||
      (b.length >= 3 ? list.find((c) => bare(c[0]).startsWith(b) || bare(champName(c[0])).startsWith(b)) : undefined)
    );
  };
  const rows = useMemo<Row[]>(() => {
    const d = data.data;
    if (!d) return [];
    const roleIdx = role ? ROLES.indexOf(role) : -1;
    if (span === "12m" && d.ch?.matchups12) {
      const out: Row[] = [];
      ROLES.forEach((rName, rIdx) => {
        if (roleIdx >= 0 && rIdx !== roleIdx) return;
        for (const [opp, g, w, , gd, csd] of d.ch?.matchups12?.[rName] || []) {
          if (g >= minG) out.push({ c: opp, role: rIdx, g, w, gd: gd ?? null, csd: csd ?? null });
        }
      });
      if (out.length > 0) return out;
    }
    return d.m.vs
      .filter(([, r, g]) => g >= minG && (roleIdx < 0 || r === roleIdx))
      .map(([c, r, g, w, gd]) => ({ c, role: r, g, w, gd }));
  }, [data.data, role, minG, span]);
  const sel = "bg-rw-bg border border-rw-border rounded px-2 py-1 text-xs text-rw-text";
  const rawChamp = data.data?.m.c || "";
  const cName = rawChamp ? champName(rawChamp) : "";
  const finderLink = (opp: string, n: number) =>
    rawChamp ? (
      <HubLink
        to={{ kind: "finder", query: `champ=${encodeURIComponent(rawChamp)}&vschamp=${encodeURIComponent(opp)}` }}
        className="hover:text-rw-accent hover:underline"
        title={tl("Game finder")}
      >
        {n}
      </HubLink>
    ) : (
      n
    );
  const columns: Column<Row>[] = [
    { key: "c", label: tl("Lane opponent"), value: (x) => champName(x.c), render: (x) => <ChampLink name={x.c} size={18} /> },
    { key: "role", label: tl("Role"), value: (x) => x.role, render: (x) => (x.role >= 0 ? roleName(ROLES[x.role]) : "–"), className: "text-rw-sub" },
    { key: "g", label: tl("Games"), value: (x) => x.g, render: (x) => finderLink(x.c, x.g), className: "tabular-nums text-rw-sub" },
    {
      key: "wr",
      label: tl("Win rate"),
      title: tl("How often {champ} won the game against this lane opponent", { champ: cName }),
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
  const sampleFloor = span === "12m" ? Math.max(minG, 3) : Math.max(minG, 8);
  const good = rows.filter((x) => x.g >= sampleFloor).sort((a, b) => b.w / b.g - a.w / a.g).slice(0, 5);
  const bad = rows.filter((x) => x.g >= sampleFloor).sort((a, b) => a.w / a.g - b.w / b.g).slice(0, 5);
  return (
    <div className="rw-page">
      <div className={`rw-span ${card} space-y-2`}>
        <h1 className="text-lg font-bold text-rw-text">{tl("Counter-pick finder")}</h1>
        <p className="text-[11px] text-rw-sub">
          {tl("Pick a champion: every lane opponent pro play has put against it, with its win rate and gold lead at 15 minutes in that matchup. Same role on each side; every pro game with known roles since 2011.")}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            list="rw-champ-list"
            placeholder={tl("Champion…")}
            aria-label={tl("Champion")}
            value={inputVal}
            onChange={(e) => {
              const v = e.target.value;
              setInputVal(v);
              const exact = (index.data?.champs || []).find(
                (c) => bare(c[0]) === bare(v.trim()) || bare(champName(c[0])) === bare(v.trim()),
              );
              if (exact) set({ champ: champSlug(exact) });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const hit = matchChamp(inputVal);
                if (hit) set({ champ: champSlug(hit) });
              }
            }}
            className={`${sel} w-48`}
          />
          <datalist id="rw-champ-list">
            {(index.data?.champs || []).map((c) => (
              <option key={c[1] || c[0]} value={champName(c[0])} />
            ))}
          </datalist>
          <span className="inline-flex rounded border border-rw-border overflow-hidden">
            <button
              type="button"
              onClick={() => set({ span: "12m", min: undefined })}
              className={`px-2 py-1 ${span === "12m" ? "bg-rw-accent/20 text-rw-text font-semibold" : "bg-rw-bg text-rw-sub hover:text-rw-text"}`}
            >
              {tl("Last 12 months")}
            </button>
            <button
              type="button"
              onClick={() => set({ span: "all", min: undefined })}
              className={`px-2 py-1 border-l border-rw-border ${span === "all" ? "bg-rw-accent/20 text-rw-text font-semibold" : "bg-rw-bg text-rw-sub hover:text-rw-text"}`}
            >
              {tl("All time")}
            </button>
          </span>
          <select value={role} onChange={(e) => set({ role: e.target.value || undefined })} aria-label={tl("Role")} className={sel}>
            <option value="">{tl("Every role")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleName(r)}
              </option>
            ))}
          </select>
          <select value={String(minG)} onChange={(e) => set({ min: e.target.value })} aria-label={tl("At least")} className={sel}>
            {[1, 2, 3, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {tl("{n}+ games", { n })}
              </option>
            ))}
          </select>
          {slug && cName && (
            <HubLink
              to={{ kind: "champ", slug }}
              className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-rw-accent/50 bg-rw-accent/10 text-rw-accent hover:bg-rw-accent/20 font-semibold"
            >
              {rawChamp && <ChampIcon name={rawChamp} size={16} />}
              {cName} →
            </HubLink>
          )}
        </div>
      </div>
      {!slug && index.data && (
        <div className="rw-span">
          <Section title={tl("Most played champions")}>
            <div className="flex flex-wrap gap-2">
              {index.data.champs.slice(0, 40).map((c) => (
                <HubLink key={champSlug(c)} to={{ kind: "counters", query: `champ=${champSlug(c)}` }} className="flex items-center gap-1 px-2 py-1 rounded border border-rw-border text-xs hover:border-rw-accent">
                  <ChampIcon name={c[0]} size={18} /> {champName(c[0])}
                </HubLink>
              ))}
            </div>
          </Section>
        </div>
      )}
      {slug && data.loading && <Loading />}
      {slug && data.data && (
        <>
          {(good.length > 0 || bad.length > 0) && (
            <div className="rw-span grid sm:grid-cols-2 gap-3">
              <Section
                title={tl("{champ} does best against", { champ: cName })}
                right={
                  <SectionCard
                    section={tl("{champ} does best against", { champ: cName })}
                    name={cName}
                    sub={span === "12m" ? tl("Last 12 months") : tl("All time")}
                    rows={() =>
                      good.map((x) => ({
                        label: champName(x.c),
                        sub: `${x.role >= 0 ? `${roleName(ROLES[x.role])} · ` : ""}${x.g}G${x.gd != null ? ` · ${x.gd > 0 ? "+" : ""}${x.gd} GD@15` : ""}`,
                        value: `${Math.round((x.w / x.g) * 100)}%`,
                        win: true,
                      }))
                    }
                  />
                }
              >
                <ul className="text-xs space-y-1.5">
                  {good.map((x) => (
                    <li key={x.c + x.role} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0 truncate">
                        <ChampLink name={x.c} size={18} /> <span className="text-rw-muted">{x.role >= 0 ? roleName(ROLES[x.role]) : ""}</span>
                      </span>
                      <span className="tabular-nums text-rw-teal font-semibold shrink-0">
                        {Math.round((x.w / x.g) * 100)}%{" "}
                        {x.gd != null && (
                          <span className="text-[11px] font-mono text-rw-sub font-normal">
                            · {x.gd > 0 ? "+" : ""}
                            {x.gd} GD@15{" "}
                          </span>
                        )}
                        <span className="text-rw-muted font-normal">({finderLink(x.c, x.g)})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section
                title={tl("{champ} struggles against", { champ: cName })}
                right={
                  <SectionCard
                    section={tl("{champ} struggles against", { champ: cName })}
                    name={cName}
                    sub={span === "12m" ? tl("Last 12 months") : tl("All time")}
                    rows={() =>
                      bad.map((x) => ({
                        label: champName(x.c),
                        sub: `${x.role >= 0 ? `${roleName(ROLES[x.role])} · ` : ""}${x.g}G${x.gd != null ? ` · ${x.gd > 0 ? "+" : ""}${x.gd} GD@15` : ""}`,
                        value: `${Math.round((x.w / x.g) * 100)}%`,
                        win: false,
                      }))
                    }
                  />
                }
              >
                <ul className="text-xs space-y-1.5">
                  {bad.map((x) => (
                    <li key={x.c + x.role} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0 truncate">
                        <ChampLink name={x.c} size={18} /> <span className="text-rw-muted">{x.role >= 0 ? roleName(ROLES[x.role]) : ""}</span>
                      </span>
                      <span className="tabular-nums text-rw-red font-semibold shrink-0">
                        {Math.round((x.w / x.g) * 100)}%{" "}
                        {x.gd != null && (
                          <span className="text-[11px] font-mono text-rw-sub font-normal">
                            · {x.gd > 0 ? "+" : ""}
                            {x.gd} GD@15{" "}
                          </span>
                        )}
                        <span className="text-rw-muted font-normal">({finderLink(x.c, x.g)})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          )}
          <div className="rw-span">
            <Section
              title={tl("Every lane matchup: {champ}", { champ: cName })}
              right={
                <SectionCard
                  section={tl("Every lane matchup: {champ}", { champ: cName })}
                  name={cName}
                  sub={span === "12m" ? tl("Last 12 months") : tl("All time")}
                  rows={() =>
                    rows.slice(0, 14).map((x) => ({
                      label: champName(x.c),
                      sub: `${x.role >= 0 ? `${roleName(ROLES[x.role])} · ` : ""}${x.g}G${x.gd != null ? ` · ${x.gd > 0 ? "+" : ""}${x.gd} GD@15` : ""}`,
                      value: `${Math.round((x.w / x.g) * 100)}%`,
                      win: x.w / x.g >= 0.5,
                    }))
                  }
                />
              }
              share={`riftwise-counters-${slug}`}
            >
              <p className="text-[11px] text-rw-muted">
                {span === "12m"
                  ? `${tl("Last 12 months")} · ${tl("{n} games with a lane opponent in pro play", { n: rows.reduce((s, r) => s + r.g, 0) })}`
                  : tl("{n} games with a lane opponent in pro play", { n: data.data.m.g })}
              </p>
              <SortTable rows={rows} columns={columns} initial={{ key: "g", desc: true }} rowKey={(x) => `${x.c}-${x.role}`} copyName={`riftwise-counters-${slug}`} />
              <OeCredit />
            </Section>
          </div>
          {data.data.ch?.duos && data.data.ch.duos.length > 0 && (
            <div className="rw-span">
              <Section
                title={tl("Bot lane partners")}
                right={
                  <SectionCard
                    section={tl("Bot lane partners")}
                    name={cName}
                    rows={() =>
                      data.data!.ch!.duos!.slice(0, 12).map(([pc, g, w]) => ({
                        label: champName(pc),
                        sub: `${g}G`,
                        value: `${Math.round((w / g) * 100)}%`,
                        win: w / g >= 0.5,
                      }))
                    }
                  />
                }
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
                  {data.data.ch.duos.slice(0, 10).map(([pc, g, w]) => {
                    const wr = Math.round((w / g) * 100);
                    return (
                      <div key={pc} className="rounded-lg border border-rw-border bg-rw-bg/50 px-2.5 py-2 flex items-center justify-between gap-2">
                        <ChampLink name={pc} size={20} />
                        <div className="text-right shrink-0">
                          <div className={`font-mono font-bold tabular-nums ${wr >= 50 ? "text-rw-teal" : "text-rw-red"}`}>{wr}%</div>
                          <div className="text-[10px] text-rw-muted font-mono">{g}G</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </div>
          )}
        </>
      )}
      {slug && !data.loading && !data.data && <p className="text-xs text-rw-sub">{tl("No lane matchups for this champion yet.")}</p>}
    </div>
  );
};

/** A small picker used on champion pages and Match prep: open the finder for a champion. */
export const CountersLink: React.FC<{ slug: string; role?: string; className?: string }> = ({ slug, role, className }) => (
  <HubLink to={{ kind: "counters", query: `champ=${slug}${role ? `&role=${role}` : ""}` }} className={className || "text-[11px] text-rw-accent hover:underline font-semibold"}>
    {tl("Counter-picks")}
  </HubLink>
);
