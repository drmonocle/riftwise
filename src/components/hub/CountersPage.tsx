/**
 * Counter-pick finder: pick a champion and see the lane matchups pro play has seen most, with the champion's win
 * rate and gold lead at 15 minutes in each (hub/matchups/<champion>.json, built from every game with roles).
 * Address: /stats/counters?champ=rumble&role=Top
 */
import React, { useEffect, useMemo, useState } from "react";
import { tl, roleName } from "../../i18n";
import { champName } from "../../champions";
import { bare, loadHubChamp, loadHubIndexQuick, loadMatchups, matchesChampSearch, normText, prettySlug, resolveChampSlug, sameChamp } from "../../hub/data";
import { ROLES } from "../../hub/champAgg";
import type { HubChamp, HubMatchups } from "../../hub/types";
import { hubShareUrl, navigateHub } from "../../hub/route";
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
  const rawSlug = q.get("champ") || "";
  const slug = rawSlug ? resolveChampSlug(rawSlug) : "";
  const vsParam = q.get("vs") || "";
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
  const [vsInput, setVsInput] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [duoSearch, setDuoSearch] = useState("");
  useEffect(() => {
    if (data.data?.m?.c) setInputVal(champName(data.data.m.c));
    else if (!slug) setInputVal("");
    setTableSearch("");
    setDuoSearch("");
  }, [data.data?.m?.c, slug]);
  useEffect(() => {
    setVsInput(vsParam ? champName(vsParam) : "");
  }, [vsParam]);
  const matchChamp = (raw: string) => {
    const trimmed = raw.trim();
    const resolved = resolveChampSlug(trimmed);
    const b = bare(resolved || trimmed);
    if (!b) return undefined;
    const list = index.data?.champs || [];
    return (
      list.find((c) => c[1] === resolved || bare(c[0]) === b || bare(champName(c[0])) === b || c[1] === b || sameChamp(c[0], trimmed)) ||
      (b.length >= 3 ? list.find((c) => bare(c[0]).startsWith(b) || bare(champName(c[0])).startsWith(b)) : undefined) ||
      list.find((c) => matchesChampSearch(c[0], trimmed))
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
  const finderLink = (opp: string, n: number | string, roleIdx?: number) => {
    const rStr = roleIdx != null && roleIdx >= 0 ? ROLES[roleIdx] : role || "";
    return rawChamp ? (
      <HubLink
        to={{
          kind: "finder",
          query: `champ=${encodeURIComponent(rawChamp)}&vschamp=${encodeURIComponent(opp)}${rStr ? `&role=${encodeURIComponent(rStr)}` : ""}`,
        }}
        className="hover:text-rw-accent hover:underline"
        title={tl("Game finder")}
      >
        {n}
      </HubLink>
    ) : (
      n
    );
  };
  const maxRowG = useMemo(() => Math.max(1, ...rows.map((r) => r.g)), [rows]);
  const hasCsd = useMemo(() => rows.some((r) => r.csd != null), [rows]);
  const columns: Column<Row>[] = [
    { key: "c", label: tl("Lane opponent"), value: (x) => champName(x.c), render: (x) => <ChampLink name={x.c} size={18} /> },
    {
      key: "role",
      label: tl("Role"),
      value: (x) => x.role,
      render: (x) =>
        x.role >= 0 ? (
          <button
            type="button"
            onClick={() => set({ role: role === ROLES[x.role] ? undefined : ROLES[x.role] })}
            className="text-rw-sub hover:text-rw-accent hover:underline"
          >
            {roleName(ROLES[x.role])}
          </button>
        ) : (
          "–"
        ),
      className: "text-rw-sub",
    },
    {
      key: "g",
      label: tl("Games"),
      value: (x) => x.g,
      render: (x) => {
        const w = Math.max(6, Math.round((x.g / maxRowG) * 100));
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[2.75rem]">
            <span>{finderLink(x.c, x.g, x.role)}</span>
            <span className="h-1 w-10 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-rw-accent/65" style={{ width: `${w}%` }} />
            </span>
          </span>
        );
      },
      className: "tabular-nums text-rw-sub",
    },
    {
      key: "wr",
      label: tl("Win rate"),
      title: tl("How often {champ} won the game against this lane opponent", { champ: cName }),
      value: (x) => x.w / x.g,
      render: (x) => {
        const pct = Math.round((x.w / x.g) * 100);
        const cls = x.w / x.g >= 0.55 ? "text-rw-teal font-semibold" : x.w / x.g <= 0.45 ? "text-rw-red" : "";
        const barCls = x.w / x.g >= 0.55 ? "bg-rw-teal/80" : x.w / x.g <= 0.45 ? "bg-rw-red/75" : "bg-rw-sub/55";
        return (
          <span className="inline-flex flex-col gap-0.5 min-w-[3rem]">
            <button
              type="button"
              onClick={() => set({ vs: x.c })}
              className={`text-left hover:underline ${cls}`}
              title={`${cName} ${tl("vs")} ${champName(x.c)}`}
            >
              {pct}%
            </button>
            <span className="h-1 w-11 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
              <span className={`block h-full rounded-full ${barCls}`} style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
            </span>
          </span>
        );
      },
      className: "tabular-nums",
    },
    {
      key: "gd",
      label: "GD@15",
      title: tl("Average gold lead over this lane opponent at 15 minutes (Oracle's Elixir)"),
      value: (x) => x.gd,
      render: (x) =>
        x.gd == null ? (
          "–"
        ) : (
          <button
            type="button"
            onClick={() => set({ vs: x.c })}
            className={`hover:underline ${x.gd > 150 ? "text-rw-teal" : x.gd < -150 ? "text-rw-red" : ""}`}
            title={`${cName} ${tl("vs")} ${champName(x.c)}`}
          >
            {x.gd > 0 ? "+" : ""}
            {x.gd}
          </button>
        ),
      className: "tabular-nums",
    },
    ...(hasCsd
      ? ([
          {
            key: "csd",
            label: "CSD@15",
            title: tl("CS lead over the lane opponent at 15 minutes"),
            value: (x) => x.csd ?? null,
            render: (x) =>
              x.csd == null ? (
                "–"
              ) : (
                <button
                  type="button"
                  onClick={() => set({ vs: x.c })}
                  className={`hover:underline ${x.csd >= 3 ? "text-rw-teal" : x.csd <= -3 ? "text-rw-red" : "hover:text-rw-accent"}`}
                >
                  {x.csd > 0 ? "+" : ""}
                  {x.csd.toFixed(1)}
                </button>
              ),
            className: "tabular-nums",
          },
        ] as Column<Row>[])
      : []),
  ];
  const sampleFloor = span === "12m" ? Math.max(minG, 3) : Math.max(minG, 8);
  const good = rows.filter((x) => x.g >= sampleFloor).sort((a, b) => b.w / b.g - a.w / a.g).slice(0, 5);
  const bad = rows.filter((x) => x.g >= sampleFloor).sort((a, b) => a.w / a.g - b.w / b.g).slice(0, 5);
  const filteredRows = useMemo(() => {
    const raw = normText(tableSearch);
    if (!raw) return rows;
    const terms = raw
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(s))
      .filter(Boolean);
    return rows.filter((r) => {
      const rDisp = r.role >= 0 ? normText(roleName(ROLES[r.role])) : "";
      return terms.some((term) => matchesChampSearch(r.c, term) || Boolean(rDisp && rDisp.includes(term)));
    });
  }, [rows, tableSearch]);
  const vsMatch = useMemo(() => {
    const d = data.data;
    if (!d || !vsParam) return null;
    const allRows: Row[] = [];
    if (span === "12m" && d.ch?.matchups12) {
      ROLES.forEach((rName, rIdx) => {
        for (const [opp, g, w, , gd, csd] of d.ch?.matchups12?.[rName] || []) {
          if (sameChamp(opp, vsParam)) {
            allRows.push({ c: opp, role: rIdx, g, w, gd: gd ?? null, csd: csd ?? null });
          }
        }
      });
    }
    if (allRows.length === 0) {
      for (const [c, r, g, w, gd] of d.m.vs) {
        if (sameChamp(c, vsParam)) {
          allRows.push({ c, role: r, g, w, gd });
        }
      }
    }
    if (allRows.length === 0) return null;
    const oppCanon = allRows[0].c;
    const totalG = allRows.reduce((s, r) => s + r.g, 0);
    const totalW = allRows.reduce((s, r) => s + r.w, 0);
    const gdRows = allRows.filter((r) => r.gd != null);
    const avgGd = gdRows.length > 0 ? Math.round(gdRows.reduce((s, r) => s + (r.gd || 0) * r.g, 0) / gdRows.reduce((s, r) => s + r.g, 0)) : null;
    return { oppCanon, totalG, totalW, avgGd, roles: allRows };
  }, [data.data, vsParam, span]);
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
            className={`${sel} w-44`}
          />
          {slug && vsParam ? (
            <button
              type="button"
              onClick={() => set({ champ: resolveChampSlug(vsMatch?.oppCanon || vsParam), vs: rawChamp || slug })}
              className="px-1.5 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/60 font-semibold"
              title={`⇄ ${champName(vsMatch?.oppCanon || vsParam)} ${tl("vs")} ${cName || slug}`}
            >
              ⇄
            </button>
          ) : (
            <span className="text-rw-muted">{tl("vs")}</span>
          )}
          <input
            list="rw-champ-list"
            placeholder={tl("Lane opponent")}
            aria-label={tl("Lane opponent")}
            value={vsInput}
            onChange={(e) => {
              const v = e.target.value;
              setVsInput(v);
              if (!v.trim()) {
                set({ vs: undefined });
                return;
              }
              const exact = (index.data?.champs || []).find(
                (c) => bare(c[0]) === bare(v.trim()) || bare(champName(c[0])) === bare(v.trim()),
              );
              if (exact) set({ vs: exact[0] });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const hit = matchChamp(vsInput);
                if (hit) set({ vs: hit[0] });
              }
            }}
            className={`${sel} w-44`}
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
            <span className="ml-auto inline-flex flex-wrap items-center gap-1.5">
              <HubLink
                to={{ kind: "champ", slug }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-rw-accent/50 bg-rw-accent/10 text-rw-accent hover:bg-rw-accent/20 font-semibold"
              >
                {rawChamp && <ChampIcon name={rawChamp} size={16} />}
                {cName} →
              </HubLink>
              {vsMatch && (
                <HubLink
                  to={{ kind: "champ", slug: prettySlug(vsMatch.oppCanon) }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/50 font-semibold"
                >
                  <ChampIcon name={vsMatch.oppCanon} size={16} />
                  {champName(vsMatch.oppCanon)} →
                </HubLink>
              )}
              <HubLink
                to={{
                  kind: "champions",
                  query: new URLSearchParams({
                    q: rawChamp || cName,
                    ...(role ? { role } : {}),
                  }).toString(),
                }}
                className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/50 font-semibold"
              >
                {tl("Champions")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: new URLSearchParams({
                    champ: rawChamp || cName,
                    ...(role ? { role } : {}),
                  }).toString(),
                }}
                className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/50 font-semibold"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "items", query: `champ=${encodeURIComponent(slug)}` }}
                className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/50 font-semibold"
              >
                {tl("Item history")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "tiers",
                  query: new URLSearchParams({
                    q: vsMatch ? `${rawChamp || cName},${vsMatch.oppCanon}` : rawChamp || cName,
                    ...(role ? { role } : {}),
                  }).toString(),
                }}
                className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/50 font-semibold"
              >
                {tl("Pro tier list")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "leaders",
                  query: new URLSearchParams({
                    champ: rawChamp || cName,
                    ...(role ? { role } : {}),
                  }).toString(),
                }}
                className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/50 font-semibold"
              >
                {tl("Player leaderboards")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "finder",
                  query: `champ=${encodeURIComponent(rawChamp || cName)}${vsMatch ? `&vschamp=${encodeURIComponent(vsMatch.oppCanon)}` : ""}${role ? `&role=${encodeURIComponent(role)}` : ""}`,
                }}
                className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/50 font-semibold"
              >
                {tl("Game finder")} →
              </HubLink>
              <HubLink
                to={{ kind: "rankings" }}
                className="px-2 py-1 rounded border border-rw-border bg-rw-bg text-rw-sub hover:text-rw-accent hover:border-rw-accent/50 font-semibold"
              >
                {tl("Power rankings")} →
              </HubLink>
            </span>
          )}
        </div>
      </div>
      {!slug && index.data && (
        <div className="rw-span">
          <Section
            title={tl("Most played champions")}
            right={
              <span className="flex flex-wrap items-center gap-2 text-[11px]" data-nocapture="1">
                {(() => {
                  const qTrim = inputVal.trim();
                  const topC = qTrim
                    ? index.data.champs.find((c) => matchesChampSearch(c[0], qTrim))
                    : undefined;
                  return (
                    <>
                      <HubLink
                        to={{
                          kind: "champions",
                          ...(topC || role
                            ? {
                                query: new URLSearchParams({
                                  ...(topC ? { q: topC[0] } : {}),
                                  ...(role ? { role } : {}),
                                }).toString(),
                              }
                            : {}),
                        }}
                        className="text-rw-accent hover:underline font-semibold"
                      >
                        {tl("Champions")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "tiers",
                          ...(topC || role
                            ? {
                                query: new URLSearchParams({
                                  ...(topC ? { q: topC[0] } : {}),
                                  ...(role ? { role } : {}),
                                }).toString(),
                              }
                            : {}),
                        }}
                        className="text-rw-accent hover:underline font-semibold"
                      >
                        {tl("Pro tier list")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "draft",
                          ...(topC || role
                            ? {
                                query: new URLSearchParams({
                                  ...(topC ? { champ: topC[0] } : {}),
                                  ...(role ? { role } : {}),
                                }).toString(),
                              }
                            : {}),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Draft board")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "items",
                          ...(topC ? { query: `champ=${encodeURIComponent(champSlug(topC))}` } : {}),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Item history")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "leaders",
                          ...(topC || role
                            ? {
                                query: new URLSearchParams({
                                  ...(topC ? { champ: topC[0] } : {}),
                                  ...(role ? { role } : {}),
                                }).toString(),
                              }
                            : {}),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Player leaderboards")} →
                      </HubLink>
                      <HubLink to={{ kind: "rankings" }} className="text-rw-sub hover:text-rw-accent hover:underline">
                        {tl("Power rankings")} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "finder",
                          ...(topC || role
                            ? {
                                query: new URLSearchParams({
                                  ...(topC ? { champ: topC[0] } : {}),
                                  ...(role ? { role } : {}),
                                }).toString(),
                              }
                            : {}),
                        }}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Game finder")} →
                      </HubLink>
                    </>
                  );
                })()}
              </span>
            }
          >
            <div className="flex flex-wrap gap-2">
              {(() => {
                const qTrim = inputVal.trim();
                const list = qTrim
                  ? index.data.champs.filter((c) => matchesChampSearch(c[0], qTrim))
                  : index.data.champs.slice(0, 40);
                return list.map((c) => (
                  <HubLink key={champSlug(c)} to={{ kind: "counters", query: `champ=${champSlug(c)}` }} className="flex items-center gap-1 px-2 py-1 rounded border border-rw-border text-xs hover:border-rw-accent">
                    <ChampIcon name={c[0]} size={18} /> {champName(c[0])}
                  </HubLink>
                ));
              })()}
            </div>
          </Section>
        </div>
      )}
      {slug && data.loading && <Loading />}
      {slug && data.data && (
        <>
          {vsMatch && (
            <div className="rw-span">
              <Section
                title={`${cName} ${tl("vs")} ${champName(vsMatch.oppCanon)}`}
                right={
                  <div className="flex flex-wrap items-center gap-2">
                    <HubLink
                      to={{ kind: "finder", query: `champ=${encodeURIComponent(rawChamp)}&vschamp=${encodeURIComponent(vsMatch.oppCanon)}` }}
                      className="px-2 py-0.5 rounded border border-rw-accent/50 bg-rw-accent/10 text-[11px] font-semibold text-rw-accent hover:bg-rw-accent/20"
                    >
                      {tl("Game finder")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "items", query: `champ=${encodeURIComponent(slug)}` }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          q: `${rawChamp || cName},${vsMatch.oppCanon}`,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          champ: rawChamp || cName,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          champ: rawChamp || cName,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "rankings" }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                    <button
                      type="button"
                      onClick={() => set({ champ: prettySlug(vsMatch.oppCanon), vs: rawChamp })}
                      className="px-2 py-0.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-sub hover:text-rw-accent hover:border-rw-accent/60"
                    >
                      ⇄ {champName(vsMatch.oppCanon)} {tl("vs")} {cName}
                    </button>
                    <SectionCard
                      section={tl("Matchups")}
                      name={`${cName} vs ${champName(vsMatch.oppCanon)}`}
                      sub={span === "12m" ? tl("Last 12 months") : tl("All time")}
                      rows={() =>
                        [
                          {
                            champ: vsMatch.oppCanon,
                            label: `${cName} vs ${champName(vsMatch.oppCanon)}`,
                            sub: `${vsMatch.totalG}G · ${vsMatch.totalW}W–${vsMatch.totalG - vsMatch.totalW}L${vsMatch.avgGd != null ? ` · ${vsMatch.avgGd > 0 ? "+" : ""}${vsMatch.avgGd} GD@15` : ""}`,
                            value: `${Math.round((vsMatch.totalW / vsMatch.totalG) * 100)}%`,
                            win: vsMatch.totalW / vsMatch.totalG >= 0.5,
                          },
                          ...vsMatch.roles.map((r) => ({
                            champ: rawChamp || undefined,
                            label: r.role >= 0 ? roleName(ROLES[r.role]) : tl("Every role"),
                            sub: `${r.g}G · ${r.w}W–${r.g - r.w}L${r.gd != null ? ` · ${r.gd > 0 ? "+" : ""}${r.gd} GD@15` : ""}`,
                            value: `${Math.round((r.w / r.g) * 100)}%`,
                            win: r.w / r.g >= 0.5,
                          })),
                        ].map((row, idx) => ({ rank: idx + 1, ...row }))
                      }
                    />
                    <CopyMatchupPost
                      cName={cName}
                      oppName={champName(vsMatch.oppCanon)}
                      spanLabel={span === "12m" ? tl("Last 12 months") : tl("All time")}
                      vsMatch={vsMatch}
                      query={q.toString()}
                    />
                  </div>
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rw-border bg-rw-bg/50 px-4 py-3 text-xs">
                  <div className="flex items-center gap-3">
                    {rawChamp && (
                      <HubLink to={{ kind: "champ", slug }} title={cName}>
                        <ChampIcon name={rawChamp} size={36} />
                      </HubLink>
                    )}
                    <div>
                      <div className="font-bold text-sm text-rw-text">
                        <HubLink to={{ kind: "champ", slug }} className="hover:text-rw-accent hover:underline">
                          {cName}
                        </HubLink>{" "}
                        <span className="text-rw-muted font-normal">{tl("vs")}</span>{" "}
                        <HubLink to={{ kind: "champ", slug: prettySlug(vsMatch.oppCanon) }} className="hover:text-rw-accent hover:underline">
                          {champName(vsMatch.oppCanon)}
                        </HubLink>
                      </div>
                      <div className="text-[11px] text-rw-sub font-mono">
                        {vsMatch.totalW}W–{vsMatch.totalG - vsMatch.totalW}L ({finderLink(vsMatch.oppCanon, vsMatch.totalG)} {tl("Games")})
                        {vsMatch.avgGd != null && (
                          <span className={vsMatch.avgGd > 150 ? "text-rw-teal" : vsMatch.avgGd < -150 ? "text-rw-red" : ""}>
                            {" · "}
                            {finderLink(vsMatch.oppCanon, `${vsMatch.avgGd > 0 ? "+" : ""}${vsMatch.avgGd} GD@15`)}
                          </span>
                        )}
                      </div>
                      {vsMatch.totalG > 0 && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className={`font-mono text-[11px] font-bold tabular-nums ${vsMatch.totalW / vsMatch.totalG >= 0.5 ? "text-rw-teal" : "text-rw-sub"}`}>
                            {Math.round((vsMatch.totalW / vsMatch.totalG) * 100)}%
                          </span>
                          <div className="w-28 h-1.5 rounded-full bg-rw-border/70 overflow-hidden flex" aria-hidden="true">
                            <div
                              className="h-full bg-rw-teal/85"
                              style={{ width: `${Math.round((vsMatch.totalW / vsMatch.totalG) * 100)}%` }}
                            />
                            <div
                              className="h-full bg-rw-red/75"
                              style={{ width: `${100 - Math.round((vsMatch.totalW / vsMatch.totalG) * 100)}%` }}
                            />
                          </div>
                          <span className={`font-mono text-[11px] font-bold tabular-nums ${vsMatch.totalW / vsMatch.totalG < 0.5 ? "text-rw-red" : "text-rw-sub"}`}>
                            {100 - Math.round((vsMatch.totalW / vsMatch.totalG) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <HubLink to={{ kind: "champ", slug: prettySlug(vsMatch.oppCanon) }} title={champName(vsMatch.oppCanon)}>
                      <ChampIcon name={vsMatch.oppCanon} size={36} />
                    </HubLink>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {vsMatch.roles.map((r) => {
                      const wr = Math.round((r.w / r.g) * 100);
                      const rStr = r.role >= 0 ? ROLES[r.role] : "";
                      return (
                        <div key={r.role} className="rounded-lg border border-rw-border bg-rw-surface px-2.5 py-1.5 text-center">
                          <div className="text-[10px] text-rw-muted uppercase">
                            {r.role >= 0 ? (
                              <button
                                type="button"
                                onClick={() => set({ role: role === rStr ? undefined : rStr })}
                                className="hover:text-rw-accent hover:underline"
                              >
                                {roleName(rStr)}
                              </button>
                            ) : (
                              tl("Role")
                            )}
                          </div>
                          <div className={`font-mono font-bold ${wr >= 50 ? "text-rw-teal" : "text-rw-red"}`}>
                            {rawChamp ? (
                              <HubLink
                                to={{
                                  kind: "finder",
                                  query: `champ=${encodeURIComponent(rawChamp)}&vschamp=${encodeURIComponent(vsMatch.oppCanon)}${rStr ? `&role=${encodeURIComponent(rStr)}` : ""}`,
                                }}
                                className="hover:underline"
                                title={tl("Game finder")}
                              >
                                {wr}%
                              </HubLink>
                            ) : (
                              `${wr}%`
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-rw-sub">
                            {finderLink(vsMatch.oppCanon, r.g, r.role)}G
                            {r.gd != null ? (
                              <>
                                {" · "}
                                {finderLink(vsMatch.oppCanon, `${r.gd > 0 ? "+" : ""}${r.gd} GD@15`, r.role)}
                              </>
                            ) : (
                              ""
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Section>
            </div>
          )}
          {(good.length > 0 || bad.length > 0) && (
            <div className="rw-span grid sm:grid-cols-2 gap-3">
              <Section
                title={tl("{champ} does best against", { champ: cName })}
                right={
                  <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
                    {good[0] && (
                      <>
                        <HubLink
                          to={{
                            kind: "counters",
                            query: `champ=${encodeURIComponent(slug)}&vs=${encodeURIComponent(good[0].c)}${good[0].role >= 0 ? `&role=${encodeURIComponent(ROLES[good[0].role])}` : role ? `&role=${encodeURIComponent(role)}` : ""}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline font-semibold"
                        >
                          {champName(good[0].c)} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `champ=${encodeURIComponent(rawChamp || cName)}&vschamp=${encodeURIComponent(good[0].c)}${good[0].role >= 0 ? `&role=${encodeURIComponent(ROLES[good[0].role])}` : ""}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Game finder")} →
                        </HubLink>
                      </>
                    )}
                    <HubLink
                      to={{ kind: "items", query: `champ=${encodeURIComponent(slug)}` }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          q: good[0] ? `${rawChamp || cName},${good[0].c}` : rawChamp || cName,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          champ: rawChamp || cName,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          champ: rawChamp || cName,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "rankings" }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                    <SectionCard
                      section={tl("{champ} does best against", { champ: cName })}
                      name={cName}
                      sub={span === "12m" ? tl("Last 12 months") : tl("All time")}
                      rows={() =>
                        good.map((x, idx) => ({
                          rank: idx + 1,
                          champ: x.c,
                          label: champName(x.c),
                          sub: `${x.role >= 0 ? `${roleName(ROLES[x.role])} · ` : ""}${x.g}G${x.gd != null ? ` · ${x.gd > 0 ? "+" : ""}${x.gd} GD@15` : ""}`,
                          value: `${Math.round((x.w / x.g) * 100)}%`,
                          win: true,
                        }))
                      }
                    />
                  </span>
                }
              >
                <ul className="text-xs space-y-1.5">
                  {good.map((x) => {
                    const wr = Math.round((x.w / x.g) * 100);
                    return (
                      <li key={x.c + x.role} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 min-w-0 truncate">
                            <ChampLink name={x.c} size={18} />{" "}
                            {x.role >= 0 && (
                              <button
                                type="button"
                                onClick={() => set({ role: role === ROLES[x.role] ? undefined : ROLES[x.role] })}
                                className="text-rw-muted hover:text-rw-accent hover:underline"
                              >
                                {roleName(ROLES[x.role])}
                              </button>
                            )}
                          </span>
                          <span className="tabular-nums text-rw-teal font-semibold shrink-0">
                            <button
                              type="button"
                              onClick={() => set({ vs: x.c })}
                              className="hover:underline"
                              title={`${cName} ${tl("vs")} ${champName(x.c)}`}
                            >
                              {wr}%
                            </button>{" "}
                            {x.gd != null && (
                              <span className="text-[11px] font-mono text-rw-sub font-normal">
                                ·{" "}
                                <button
                                  type="button"
                                  onClick={() => set({ vs: x.c })}
                                  className="hover:text-rw-accent hover:underline"
                                  title={`${cName} ${tl("vs")} ${champName(x.c)}`}
                                >
                                  {x.gd > 0 ? "+" : ""}
                                  {x.gd} GD@15
                                </button>{" "}
                              </span>
                            )}
                            <span className="text-rw-muted font-normal">({finderLink(x.c, x.g, x.role)})</span>
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                          <div className="h-full rounded-full bg-rw-teal/75" style={{ width: `${Math.max(8, Math.min(100, wr))}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Section>
              <Section
                title={tl("{champ} struggles against", { champ: cName })}
                right={
                  <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
                    {bad[0] && (
                      <>
                        <HubLink
                          to={{
                            kind: "counters",
                            query: `champ=${encodeURIComponent(slug)}&vs=${encodeURIComponent(bad[0].c)}${bad[0].role >= 0 ? `&role=${encodeURIComponent(ROLES[bad[0].role])}` : role ? `&role=${encodeURIComponent(role)}` : ""}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline font-semibold"
                        >
                          {champName(bad[0].c)} →
                        </HubLink>
                        <HubLink
                          to={{
                            kind: "finder",
                            query: `champ=${encodeURIComponent(rawChamp || cName)}&vschamp=${encodeURIComponent(bad[0].c)}${bad[0].role >= 0 ? `&role=${encodeURIComponent(ROLES[bad[0].role])}` : ""}`,
                          }}
                          className="text-[11px] text-rw-accent hover:underline"
                        >
                          {tl("Game finder")} →
                        </HubLink>
                      </>
                    )}
                    <HubLink
                      to={{ kind: "items", query: `champ=${encodeURIComponent(slug)}` }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "tiers",
                        query: new URLSearchParams({
                          q: bad[0] ? `${rawChamp || cName},${bad[0].c}` : rawChamp || cName,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: new URLSearchParams({
                          champ: rawChamp || cName,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: new URLSearchParams({
                          champ: rawChamp || cName,
                          ...(role ? { role } : {}),
                        }).toString(),
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "rankings" }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                    <SectionCard
                      section={tl("{champ} struggles against", { champ: cName })}
                      name={cName}
                      sub={span === "12m" ? tl("Last 12 months") : tl("All time")}
                      rows={() =>
                        bad.map((x, idx) => ({
                          rank: idx + 1,
                          champ: x.c,
                          label: champName(x.c),
                          sub: `${x.role >= 0 ? `${roleName(ROLES[x.role])} · ` : ""}${x.g}G${x.gd != null ? ` · ${x.gd > 0 ? "+" : ""}${x.gd} GD@15` : ""}`,
                          value: `${Math.round((x.w / x.g) * 100)}%`,
                          win: false,
                        }))
                      }
                    />
                  </span>
                }
              >
                <ul className="text-xs space-y-1.5">
                  {bad.map((x) => {
                    const wr = Math.round((x.w / x.g) * 100);
                    return (
                      <li key={x.c + x.role} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 min-w-0 truncate">
                            <ChampLink name={x.c} size={18} />{" "}
                            {x.role >= 0 && (
                              <button
                                type="button"
                                onClick={() => set({ role: role === ROLES[x.role] ? undefined : ROLES[x.role] })}
                                className="text-rw-muted hover:text-rw-accent hover:underline"
                              >
                                {roleName(ROLES[x.role])}
                              </button>
                            )}
                          </span>
                          <span className="tabular-nums text-rw-red font-semibold shrink-0">
                            <button
                              type="button"
                              onClick={() => set({ vs: x.c })}
                              className="hover:underline"
                              title={`${cName} ${tl("vs")} ${champName(x.c)}`}
                            >
                              {wr}%
                            </button>{" "}
                            {x.gd != null && (
                              <span className="text-[11px] font-mono text-rw-sub font-normal">
                                ·{" "}
                                <button
                                  type="button"
                                  onClick={() => set({ vs: x.c })}
                                  className="hover:text-rw-accent hover:underline"
                                  title={`${cName} ${tl("vs")} ${champName(x.c)}`}
                                >
                                  {x.gd > 0 ? "+" : ""}
                                  {x.gd} GD@15
                                </button>{" "}
                              </span>
                            )}
                            <span className="text-rw-muted font-normal">({finderLink(x.c, x.g, x.role)})</span>
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                          <div className="h-full rounded-full bg-rw-red/75" style={{ width: `${Math.max(8, Math.min(100, wr))}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            </div>
          )}
          <div className="rw-span">
            <Section
              title={tl("Every lane matchup: {champ}", { champ: cName })}
              right={
                <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
                  {rows.length > 8 && (
                    <input
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder={tl("Search champions…")}
                      aria-label={tl("Search champions…")}
                      className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted w-36"
                    />
                  )}
                  {filteredRows.length >= 1 && (
                    <>
                      <HubLink
                        to={{
                          kind: "counters",
                          query: `champ=${encodeURIComponent(slug)}&vs=${encodeURIComponent(filteredRows[0].c)}${role ? `&role=${encodeURIComponent(role)}` : ""}`,
                        }}
                        className="text-[11px] text-rw-accent hover:underline font-semibold"
                      >
                        {champName(filteredRows[0].c)} →
                      </HubLink>
                      <HubLink
                        to={{
                          kind: "finder",
                          query: `champ=${encodeURIComponent(rawChamp || cName)}&vschamp=${encodeURIComponent(filteredRows[0].c)}${role ? `&role=${encodeURIComponent(role)}` : ""}`,
                        }}
                        className="text-[11px] text-rw-accent hover:underline font-semibold"
                      >
                        {tl("Game finder")} →
                      </HubLink>
                    </>
                  )}
                  <HubLink
                    to={{ kind: "items", query: `champ=${encodeURIComponent(slug)}` }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "tiers",
                      query: new URLSearchParams({
                        q: [rawChamp || cName, filteredRows[0]?.c].filter(Boolean).join(","),
                        ...(role ? { role } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Pro tier list")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "draft",
                      query: new URLSearchParams({
                        champ: rawChamp || cName,
                        ...(role ? { role } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </HubLink>
                  <HubLink
                    to={{
                      kind: "leaders",
                      query: new URLSearchParams({
                        champ: rawChamp || cName,
                        ...(role ? { role } : {}),
                      }).toString(),
                    }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </HubLink>
                  <HubLink
                    to={{ kind: "rankings" }}
                    className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </HubLink>
                  <SectionCard
                    section={tl("Every lane matchup: {champ}", { champ: cName })}
                    name={cName}
                    sub={span === "12m" ? tl("Last 12 months") : tl("All time")}
                    rows={() =>
                      filteredRows.slice(0, 14).map((x, idx) => ({
                        rank: idx + 1,
                        champ: x.c,
                        label: champName(x.c),
                        sub: `${x.role >= 0 ? `${roleName(ROLES[x.role])} · ` : ""}${x.g}G${x.gd != null ? ` · ${x.gd > 0 ? "+" : ""}${x.gd} GD@15` : ""}`,
                        value: `${Math.round((x.w / x.g) * 100)}%`,
                        win: x.w / x.g >= 0.5,
                      }))
                    }
                  />
                  <CopyCountersPost
                    cName={cName}
                    spanLabel={span === "12m" ? tl("Last 12 months") : tl("All time")}
                    good={good}
                    bad={bad}
                    query={q.toString()}
                  />
                </span>
              }
              share={`riftwise-counters-${slug}`}
            >
              <p className="text-[11px] text-rw-muted">
                <HubLink
                  to={{
                    kind: "finder",
                    query: `champ=${encodeURIComponent(rawChamp || cName)}${role ? `&role=${encodeURIComponent(role)}` : ""}`,
                  }}
                  className="hover:text-rw-accent hover:underline"
                  title={tl("Game finder")}
                >
                  {span === "12m"
                    ? `${tl("Last 12 months")} · ${tl("{n} games with a lane opponent in pro play", { n: rows.reduce((s, r) => s + r.g, 0) })}`
                    : tl("{n} games with a lane opponent in pro play", { n: data.data.m.g })}
                </HubLink>
              </p>
              <SortTable rows={filteredRows} columns={columns} initial={{ key: "g", desc: true }} rowKey={(x) => `${x.c}-${x.role}`} copyName={`riftwise-counters-${slug}`} />
              <OeCredit />
            </Section>
          </div>
          {data.data.ch?.duos && data.data.ch.duos.length > 0 && (
            <div className="rw-span">
              <Section
                title={tl("Bot lane partners")}
                right={
                  <span className="flex flex-wrap items-center gap-2" data-nocapture="1">
                    {data.data.ch.duos.length > 10 && (
                      <input
                        value={duoSearch}
                        onChange={(e) => setDuoSearch(e.target.value)}
                        placeholder={tl("Search champions…")}
                        aria-label={tl("Search champions…")}
                        className="bg-rw-bg border border-rw-border rounded px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted w-36"
                      />
                    )}
                    {(() => {
                      const raw = normText(duoSearch);
                      const terms = raw
                        .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                        .map((s) => normText(s))
                        .filter(Boolean);
                      const dList = terms.length
                        ? data.data!.ch!.duos!.filter(([pc]) => terms.some((t) => matchesChampSearch(pc, t)))
                        : data.data!.ch!.duos!;
                      const topDuo = dList[0] || data.data!.ch!.duos![0];
                      return topDuo ? (
                        <>
                          <HubLink
                            to={{
                              kind: "finder",
                              query: `champ=${encodeURIComponent(`${rawChamp || cName},${topDuo[0]}`)}`,
                            }}
                            className="text-[11px] text-rw-accent hover:underline"
                          >
                            {tl("Game finder")} →
                          </HubLink>
                          <HubLink
                            to={{
                              kind: "counters",
                              query: `champ=${encodeURIComponent(prettySlug(topDuo[0]))}`,
                            }}
                            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                          >
                            {tl("Counters")} →
                          </HubLink>
                        </>
                      ) : null;
                    })()}
                    <HubLink
                      to={{ kind: "items", query: `champ=${encodeURIComponent(slug)}` }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Item history")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "tiers", query: `role=Bot&q=${encodeURIComponent(rawChamp || cName)}` }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "draft", query: `role=Bot&champ=${encodeURIComponent(rawChamp || cName)}` }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "leaders",
                        query: `role=Bot&champ=${encodeURIComponent(rawChamp || cName)}`,
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Player leaderboards")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "rankings" }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Power rankings")} →
                    </HubLink>
                    <SectionCard
                      section={tl("Bot lane partners")}
                      name={cName}
                      rows={() => {
                        const raw = normText(duoSearch);
                        const terms = raw
                          .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                          .map((s) => normText(s))
                          .filter(Boolean);
                        const list = terms.length
                          ? data.data!.ch!.duos!.filter(([pc]) => terms.some((t) => matchesChampSearch(pc, t)))
                          : data.data!.ch!.duos!;
                        return list.slice(0, 12).map(([pc, g, w], idx) => ({
                          rank: idx + 1,
                          champ: pc,
                          label: champName(pc),
                          sub: `${g}G`,
                          value: `${Math.round((w / g) * 100)}%`,
                          win: w / g >= 0.5,
                        }));
                      }}
                    />
                  </span>
                }
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
                  {(() => {
                    const raw = normText(duoSearch);
                    const terms = raw
                      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
                      .map((s) => normText(s))
                      .filter(Boolean);
                    const list = terms.length
                      ? data.data.ch.duos.filter(([pc]) => terms.some((t) => matchesChampSearch(pc, t)))
                      : data.data.ch.duos;
                    return list.slice(0, terms.length ? 30 : 10).map(([pc, g, w]) => {
                      const wr = Math.round((w / g) * 100);
                      return (
                        <div key={pc} className="rounded-lg border border-rw-border bg-rw-bg/50 px-2.5 py-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <ChampLink name={pc} size={20} />
                            <div className="text-right shrink-0">
                              <HubLink
                                to={{ kind: "counters", query: `champ=${prettySlug(pc)}` }}
                                className={`font-mono font-bold tabular-nums hover:underline ${wr >= 50 ? "text-rw-teal" : "text-rw-red"}`}
                                title={tl("Counter-pick finder")}
                              >
                                {wr}%
                              </HubLink>
                              <HubLink
                                to={{ kind: "finder", query: `champ=${encodeURIComponent(`${rawChamp || cName},${pc}`)}` }}
                                className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline font-mono block"
                                title={tl("Game finder")}
                              >
                                {g}G
                              </HubLink>
                            </div>
                          </div>
                          <div className="h-1 rounded-full bg-rw-raised overflow-hidden" aria-hidden="true">
                            <div
                              className={`h-full rounded-full ${wr >= 50 ? "bg-rw-teal/75" : "bg-rw-red/70"}`}
                              style={{ width: `${Math.max(8, Math.min(100, wr))}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
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

const CopyMatchupPost: React.FC<{
  cName: string;
  oppName: string;
  spanLabel: string;
  vsMatch: { totalG: number; totalW: number; avgGd: number | null; roles: Row[] };
  query?: string;
}> = ({ cName, oppName, spanLabel, vsMatch, query }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const wr = Math.round((vsMatch.totalW / vsMatch.totalG) * 100);
    const lines = [
      `${cName} vs ${oppName} · ${spanLabel}`,
      `${vsMatch.totalW}W–${vsMatch.totalG - vsMatch.totalW}L (${wr}% · ${vsMatch.totalG}G)${vsMatch.avgGd != null ? ` · ${vsMatch.avgGd > 0 ? "+" : ""}${vsMatch.avgGd} GD@15` : ""}`,
      ...vsMatch.roles.map((r) => `${r.role >= 0 ? roleName(ROLES[r.role]) : tl("Role")}: ${Math.round((r.w / r.g) * 100)}% (${r.g}G${r.gd != null ? `, ${r.gd > 0 ? "+" : ""}${r.gd} GD@15` : ""})`),
      hubShareUrl({ kind: "counters", ...(query ? { query } : {}) }),
    ];
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        setState("copied");
        setTimeout(() => setState("idle"), 1600);
      },
      () => {
        setState("failed");
        setTimeout(() => setState("idle"), 2000);
      },
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={tl("Copy a ready-to-post summary with the link, for X or Discord")}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-surface text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};

const CopyCountersPost: React.FC<{ cName: string; spanLabel: string; good: Row[]; bad: Row[]; query?: string }> = ({ cName, spanLabel, good, bad, query }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    const fmt = (x: Row) => `${champName(x.c)} (${Math.round((x.w / x.g) * 100)}%, ${x.g}G${x.gd != null ? `, ${x.gd > 0 ? "+" : ""}${x.gd} GD@15` : ""})`;
    const lines = [
      `${tl("Counter-pick finder")}: ${cName} (${spanLabel})`,
      good.length > 0 ? `${tl("{champ} does best against", { champ: cName })}: ${good.slice(0, 3).map(fmt).join(" · ")}` : null,
      bad.length > 0 ? `${tl("{champ} struggles against", { champ: cName })}: ${bad.slice(0, 3).map(fmt).join(" · ")}` : null,
      hubShareUrl({ kind: "counters", ...(query ? { query } : {}) }),
    ].filter((x): x is string => !!x);
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        setState("copied");
        setTimeout(() => setState("idle"), 1600);
      },
      () => {
        setState("failed");
        setTimeout(() => setState("idle"), 2000);
      },
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={tl("Copy a ready-to-post summary with the link, for X or Discord")}
      className="px-2 py-0.5 rounded border border-rw-border bg-rw-surface text-[11px] text-rw-sub hover:text-rw-text hover:border-rw-accent/60"
    >
      {state === "copied" ? tl("Copied") : state === "failed" ? tl("Couldn't copy") : tl("Copy post")}
    </button>
  );
};
