/** Champion page: pro picks, bans and wins by year and patch, builds, matchups, best players and the latest pro games. */
import React, { useMemo, useState } from "react";
import { tl, tc, roleName, fmtN } from "../../i18n";
import { winRate } from "../../stats";
import { champName } from "../../champions";
import { loadHubChamp } from "../../hub/data";
import type { HubChamp } from "../../hub/types";
import { isFinishedItem, useDDragon } from "../../hub/ddragon";
import {
  card,
  ChampIcon,
  ChampLink,
  fmtDate,
  fmtNum,
  HubLink,
  ItemIcon,
  OeCredit,
  Page,
  PlayerLink,
  RevealButton,
  RuneIcon,
  Section,
  SpellIcon,
  Stat,
  td,
  th,
  useHidden,
  useLoad,
  usePageTitle,
} from "./ui";
import { itemName, runeName, spellName } from "../../hub/ddragon";
import { CountersLink } from "./CountersPage";
import { STable } from "../STable";
import { BroadcastCardButton, champCardData } from "./BroadcastCard";

export const ChampPage: React.FC<{ slug: string }> = ({ slug }) => {
  const state = useLoad(() => loadHubChamp(slug), [slug]);
  usePageTitle(state.data ? champName(state.data.name) : null, state.data?.name);
  useDDragon();
  return <Page state={state}>{(c) => <ChampView c={c} />}</Page>;
};

/** A lead at 15 minutes: "+250" in teal, "-40" in red. */
const signedText = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmtNum(v)}`);
const Lead: React.FC<{ v: number | null | undefined }> = ({ v }) => (
  <span className={v == null ? "text-rw-muted" : v >= 0 ? "text-rw-teal" : "text-rw-red"}>{signedText(v)}</span>
);

/** Presence (filled line) and win rate (dashed, patches with 5+ picks) over the recent patches, oldest on the left. */
const PatchTrend: React.FC<{ patches: NonNullable<HubChamp["patches"]> }> = ({ patches }) => {
  const list = [...patches].reverse();
  const w = 160;
  const h = 36;
  const x = (i: number) => (list.length > 1 ? (i / (list.length - 1)) * (w - 4) + 2 : w / 2);
  const pres = list.map((p) => (p.pr ?? p.pk + p.b) / Math.max(p.g, 1));
  const top = Math.max(0.05, ...pres);
  const presPts = pres.map((v, i) => `${x(i).toFixed(1)},${(h - 2 - (v / top) * (h - 4)).toFixed(1)}`).join(" ");
  const wrPts = list
    .map((p, i) => (p.pk >= 5 ? `${x(i).toFixed(1)},${(h - 2 - (p.w / p.pk) * (h - 4)).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={tl("Presence and win rate by patch, {from} to {to}", { from: list[0].p, to: list[list.length - 1].p })}
    >
      <title>{tl("Presence (solid) and win rate (dashed) by patch, {from} to {to}", { from: list[0].p, to: list[list.length - 1].p })}</title>
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="var(--rw-border)" strokeDasharray="2 3" />
      <polyline points={presPts} fill="none" stroke="var(--rw-accent)" strokeWidth={2} strokeLinejoin="round" />
      {wrPts && <polyline points={wrPts} fill="none" stroke="var(--rw-teal)" strokeWidth={1.5} strokeDasharray="4 3" />}
    </svg>
  );
};

// "<1%" rather than "0%" for something that did happen, just rarely
const pctOf = (w: number, g: number) => (!g ? "–" : w > 0 && (w / g) * 100 < 0.5 ? "<1%" : `${Math.round((w / g) * 100)}%`);

const ChampView: React.FC<{ c: HubChamp }> = ({ c }) => {
  const ddReady = useDDragon();
  const [recentHidden, revealRecent] = useHidden(`champ-recent:${c.u}`, c.recent[0]?.date);
  const maxYear = Math.max(1, ...c.years.map((y) => y.p + y.b));
  const totalRoles = c.roles.reduce((s, r) => s + r.p, 0) || 1;
  const mainRoles = c.roles.filter((r) => r.p / totalRoles >= 0.1).map((r) => r.r);
  // the champion's roles in order of how often it's played there, with matchups in either list
  const roleKeys = mainRoles.filter((r) => (c.matchups?.[r]?.length || 0) > 0 || (c.matchups12?.[r]?.length || 0) > 0);
  const [muRole, setMuRole] = useState(roleKeys[0] || "");
  // this meta (last 12 months) first when there is one
  const [muRecentPick, setMuRecent] = useState(() => Object.keys(c.matchups12 || {}).length > 0);
  // the last 12 months have no matchups in this role: show all time
  const muRecent = muRecentPick && (c.matchups12?.[muRole]?.length || 0) > 0;
  const muRows = ((muRecent ? c.matchups12 : c.matchups) || {})[muRole] || [];
  const muLane = muRows.some((m) => m.length > 3);
  const laneNow = (muRecent ? c.lane12 : c.lane)?.[muRole];
  const showDuos = mainRoles.some((r) => r === "Bot" || r === "Support") && (c.duos || []).length > 0;
  const items = useMemo(() => (c.builds?.items || []).filter(([it]) => isFinishedItem(it)).slice(0, 8), [c.builds, ddReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // a build part picked in "Pro builds": the latest games narrow to the ones that used it
  const [usedOnly, setUsed] = useState<{ kind: "item" | "key" | "spells"; v: string } | null>(null);
  const pickUsed = (kind: "item" | "key" | "spells", v: string) => {
    setUsed((u) => (u && u.kind === kind && u.v === v ? null : { kind, v }));
    window.setTimeout(() => document.getElementById("champ-latest")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };
  const usedIn = (r: (typeof c.recent)[number]) =>
    !usedOnly ||
    (usedOnly.kind === "item"
      ? (r.it || []).includes(usedOnly.v)
      : usedOnly.kind === "key"
        ? r.ks === usedOnly.v
        : [...(r.sp || [])].sort().join(" + ") === usedOnly.v.split(" + ").sort().join(" + "));
  const usedName = usedOnly ? (usedOnly.kind === "item" ? itemName(usedOnly.v) : usedOnly.kind === "key" ? runeName(usedOnly.v) : usedOnly.v.split(" + ").map(spellName).join(" + ")) : "";
  const pickRow = (on: boolean) =>
    `flex items-center gap-2 min-w-0 w-full text-left rounded px-1 -mx-1 hover:bg-rw-raised ${on ? "ring-1 ring-rw-accent bg-rw-accent/10" : ""}`;
  const maxPatch = Math.max(1, ...(c.patches || []).map((p) => (p.pr ?? p.pk + p.b) / Math.max(p.g, 1)));
  return (
    <div className="rw-page">
      <div className={`${card} flex gap-3 items-start`}>
        <ChampIcon name={c.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-rw-text">{champName(c.name)}</h1>
        <CountersLink slug={c.u} className="inline-block text-[11px] text-rw-teal hover:underline font-semibold" />
          <p className="text-[11px] text-rw-sub">
            {c.roles
              .filter((r) => r.p / totalRoles >= 0.05)
              .map((r) => `${roleName(r.r)} ${Math.round((r.p / totalRoles) * 100)}%`)
              .join(" · ")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 rw-stats mt-3">
            <Stat label={tl("Picks")} value={fmtNum(c.p)} />
            <Stat label={tl("Bans")} value={fmtNum(c.b)} />
            <Stat label={tl("Win %")} value={winRate(c.w, c.p)} />
            {c.side && c.side[0] + c.side[2] > 0 && (
              <Stat label={tl("Blue / red side")} value={`${pctOf(c.side[1], c.side[0])} / ${pctOf(c.side[3], c.side[2])}`} sub={tl("win rate on each side")} />
            )}
          </div>
        </div>
      </div>

      {c.builds && c.builds.g > 0 && (
        <Section title={tl("Pro builds in the last 12 months")}>
          <p className="text-[11px] text-rw-muted">
            {tl("From {n} pro games since {date}. Share of games and win rate.", { n: fmtNum(c.builds.g), date: fmtDate(c.builds.since) })}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Items")}</div>
              <ul className="space-y-1 text-xs">
                {items.map(([it, g, w]) => (
                  <li key={it}>
                    <button type="button" onClick={() => pickUsed("item", it)} className={pickRow(usedOnly?.kind === "item" && usedOnly.v === it)} title={tl("Show the latest pro games with it")}>
                    <ItemIcon name={it} size={22} />
                    <span className="truncate flex-1 text-rw-text">{itemName(it)}</span>
                    <span className="text-rw-sub tabular-nums shrink-0">{pctOf(g, c.builds!.g)}</span>
                    <span className="text-rw-muted tabular-nums shrink-0 w-10 text-right">{pctOf(w, g)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Keystones")}</div>
              <ul className="space-y-1 text-xs">
                {c.builds.keys.map(([k, g, w]) => (
                  <li key={k}>
                    <button type="button" onClick={() => pickUsed("key", k)} className={pickRow(usedOnly?.kind === "key" && usedOnly.v === k)} title={tl("Show the latest pro games with it")}>
                    <RuneIcon name={k} size={22} />
                    <span className="truncate flex-1 text-rw-text">{runeName(k)}</span>
                    <span className="text-rw-sub tabular-nums shrink-0">{pctOf(g, c.builds!.g)}</span>
                    <span className="text-rw-muted tabular-nums shrink-0 w-10 text-right">{pctOf(w, g)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-rw-muted mb-1">{tl("Summoner spells")}</div>
              <ul className="space-y-1 text-xs">
                {c.builds.spells.map(([sp, g, w]) => (
                  <li key={sp}>
                    <button type="button" onClick={() => pickUsed("spells", sp)} className={pickRow(usedOnly?.kind === "spells" && usedOnly.v === sp)} title={tl("Show the latest pro games with it")}>
                    <span className="flex gap-0.5">
                      {sp.split(" + ").map((x) => (
                        <SpellIcon key={x} name={x} size={20} />
                      ))}
                    </span>
                    <span className="truncate flex-1 text-rw-text">{sp.split(" + ").map(spellName).join(" + ")}</span>
                    <span className="text-rw-sub tabular-nums shrink-0">{pctOf(g, c.builds!.g)}</span>
                    <span className="text-rw-muted tabular-nums shrink-0 w-10 text-right">{pctOf(w, g)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-[10px] text-rw-muted">{tl("Click an item, keystone or spell pair to see the latest pro games that used it.")}</p>
        </Section>
      )}

      {c.slots && Object.keys(c.slots).length > 0 && (
        <Section title={tl("By pick order")}>
          <p className="text-[11px] text-rw-muted">{tl("Games and win rate by where it was picked in the draft (B = blue side, R = red side), every pro game with the pick order known.")}</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {Object.entries(c.slots).map(([slot, [g, w]]) => (
              <div key={slot} className="rounded-lg border border-rw-border bg-rw-bg px-2 py-1.5 text-center">
                <div className={`text-xs font-bold ${slot.startsWith("B") ? "text-[#4a9eff]" : "text-rw-red"}`}>{slot}</div>
                <div className="text-sm font-semibold text-rw-text tabular-nums">{g >= 5 ? pctOf(w, g) : "–"}</div>
                <div className="text-[10px] text-rw-muted">{tl("{n} games", { n: fmtNum(g) })}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.patches && c.patches.length > 0 && (
        <Section title={tl("Recent patches")} right={c.patches.length >= 3 ? <PatchTrend patches={c.patches} /> : undefined}>
          <div className="space-y-1">
            {c.patches.map((p, i) => {
              const pres = (p.pr ?? p.pk + p.b) / Math.max(p.g, 1);
              const before = c.patches![i + 1];
              const d = before ? Math.round((pres - (before.pr ?? before.pk + before.b) / Math.max(before.g, 1)) * 100) : null;
              return (
                <div key={p.p} className="grid grid-cols-[3.5rem_1fr_2.5rem_auto] items-center gap-2 text-xs">
                  <span className="text-rw-text font-semibold">{p.p}</span>
                  <div className="h-2.5 bg-rw-bg rounded overflow-hidden">
                    <div className="h-full bg-rw-accent/70" style={{ width: `${(pres / maxPatch) * 100}%` }} />
                  </div>
                  <span
                    className={`tabular-nums text-right text-[10px] ${d == null || d === 0 ? "text-rw-muted" : d > 0 ? "text-rw-teal" : "text-rw-red"}`}
                    title={before ? tl("Change in presence against {patch}, in points", { patch: before.p }) : undefined}
                  >
                    {d == null ? "" : d === 0 ? "=" : `${d > 0 ? "+" : ""}${d}`}
                  </span>
                  <span className="text-rw-sub tabular-nums text-right leading-tight sm:whitespace-nowrap sm:min-w-56">
                    {tl("{pres} presence · {p} picks · {wr}", { pres: `${Math.round(pres * 100)}%`, p: p.pk, wr: p.pk ? pctOf(p.w, p.pk) : "–" })}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-rw-muted">{tl("Presence = picked or banned in that share of games (all leagues).")}</p>
        </Section>
      )}

      <Section
        title={tl("By year")}
        right={<BroadcastCardButton data={() => champCardData(c, champName(c.name))} name={`${c.u}-pro-play`} label={tl("Overview card")} />}
      >
        <div className="space-y-1">
          {c.years.map((y) => (
            <div key={y.y} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-xs">
              <span className="text-rw-text font-semibold">{y.y}</span>
              <div className="h-3 bg-rw-bg rounded overflow-hidden flex" title={`${y.p} / ${y.b}`}>
                <div className="bg-rw-teal/70" style={{ width: `${(y.p / maxYear) * 100}%` }} />
                <div className="bg-rw-red/50" style={{ width: `${(y.b / maxYear) * 100}%` }} />
              </div>
              <span className="text-rw-sub tabular-nums text-right shrink-0 whitespace-nowrap min-w-44">
                {tl("{p} picks · {b} bans · {wr}", { p: fmtNum(y.p), b: fmtNum(y.b), wr: y.p ? winRate(y.w, y.p) : "–" })}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-rw-muted">
          <span className="inline-block w-2 h-2 bg-rw-teal/70 mr-1" />
          {tl("Picks")} <span className="inline-block w-2 h-2 bg-rw-red/50 ml-2 mr-1" />
          {tl("Bans")}
        </p>
      </Section>

      {roleKeys.length > 0 && (
        <Section
          title={tl("Matchups")}
          right={
            c.matchups12 ? (
              <span className="flex gap-1">
                {[true, false].map((recent) => (
                  <button
                    key={String(recent)}
                    type="button"
                    onClick={() => setMuRecent(recent)}
                    className={`px-2 py-0.5 rounded text-[11px] border ${
                      recent === muRecent ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
                    }`}
                  >
                    {recent ? tl("Last 12 months") : tl("All time")}
                  </button>
                ))}
              </span>
            ) : undefined
          }
        >
          {roleKeys.length > 1 && (
            <div className="flex gap-1">
              {roleKeys.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setMuRole(r)}
                  className={`px-2 py-0.5 rounded text-[11px] border ${
                    r === muRole ? "bg-rw-accent text-rw-bg font-bold border-rw-accent" : "border-rw-border text-rw-sub"
                  }`}
                >
                  {roleName(r)}
                </button>
              ))}
            </div>
          )}
          {laneNow && laneNow.length > 2 && (
            <p className="text-[11px] text-rw-sub">
              {tl("In lane at 15 minutes: {gd} gold, {cs} CS, {xp} XP against the other {role}; ahead in {p} of games.", {
                gd: signedText(laneNow[3]),
                cs: signedText(laneNow[4]),
                xp: signedText(laneNow[5]),
                role: roleName(muRole),
                p: pctOf(laneNow[6], laneNow[2]),
              })}
            </p>
          )}
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("Against")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
                {muLane && (
                  <>
                    <th className={th} title={tl("Gold lead over the lane opponent at 15 minutes")}>
                      GD@15
                    </th>
                    <th className={th} title={tl("CS lead over the lane opponent at 15 minutes")}>
                      CSD@15
                    </th>
                    <th className={th} title={tl("XP lead over the lane opponent at 15 minutes")}>
                      XPD@15
                    </th>
                    <th className={th} title={tl("Games ahead in gold at 15 minutes")}>
                      {tl("Lane %")}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {muRows.map(([oc, g, w, tn, gd, cs, xp, ahead]) => (
                <tr key={oc} className="border-t border-rw-border">
                  <td className={`${td} max-w-[10rem]`}>
                    <ChampLink name={oc} size={16} />
                  </td>
                  <td className={`${td} text-rw-sub`}>{g}</td>
                  <td className={`${td} ${w / g >= 0.5 ? "text-rw-teal" : "text-rw-red"}`}>{pctOf(w, g)}</td>
                  {muLane && (
                    <>
                      <td className={td} data-sort={gd ?? ""}>
                        <Lead v={gd} />
                      </td>
                      <td className={td} data-sort={cs ?? ""}>
                        <Lead v={cs} />
                      </td>
                      <td className={td} data-sort={xp ?? ""}>
                        <Lead v={xp} />
                      </td>
                      <td
                        className={`${td} ${tn && ahead != null ? (ahead / tn >= 0.5 ? "text-rw-teal" : "text-rw-red") : "text-rw-muted"}`}
                        data-sort={tn && ahead != null ? ahead / tn : ""}
                        title={tn ? tl("{n} games with timelines", { n: tn }) : undefined}
                      >
                        {tn && ahead != null ? pctOf(ahead, tn) : "–"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </STable>
          <p className="text-[10px] text-rw-muted">
            {muRecent
              ? tl("Against the champion in the same role, last 12 months, 2+ games.")
              : tl("Against the champion in the same role, all pro games, 3+ games.")}
          </p>
          {muLane && <OeCredit />}
        </Section>
      )}
      {showDuos && (
        <Section title={tl("Bot lane partners")}>
          <STable className="w-full text-xs">
            <thead>
              <tr>
                <th className={th}>{tl("With")}</th>
                <th className={th}>{tl("Games")}</th>
                <th className={th}>{tl("Win %")}</th>
              </tr>
            </thead>
            <tbody>
              {(c.duos || []).slice(0, 15).map(([pc, g, w]) => (
                <tr key={pc} className="border-t border-rw-border">
                  <td className={`${td} max-w-[10rem]`}>
                    <ChampLink name={pc} size={16} />
                  </td>
                  <td className={`${td} text-rw-sub`}>{g}</td>
                  <td className={`${td} ${w / g >= 0.5 ? "text-rw-teal" : "text-rw-red"}`}>{pctOf(w, g)}</td>
                </tr>
              ))}
            </tbody>
          </STable>
        </Section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Section title={tl("Most games on {champion}", { champion: champName(c.name) })}>
          <STable className="w-full text-xs">
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
                <tr key={p.n + p.u} className="border-t border-rw-border">
                  <td className={td}>
                    <PlayerLink name={p.n} u={p.u} />
                  </td>
                  <td className={`${td} text-rw-sub`}>{p.g}</td>
                  <td className={`${td} text-rw-sub`}>{winRate(p.w, p.g)}</td>
                  <td className={`${td} text-rw-sub`}>{fmtN(p.kda)}</td>
                </tr>
              ))}
            </tbody>
          </STable>
        </Section>
        <Section
          title={tl("Latest pro games")}
          right={
            recentHidden ? (
              <RevealButton onReveal={revealRecent} small />
            ) : usedOnly ? (
              <button type="button" onClick={() => setUsed(null)} className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-rw-accent text-rw-accent text-[11px]" title={tl("Show every game")}>
                {tl("With {name}", { name: usedName })} ✕
              </button>
            ) : undefined
          }
        >
          <span id="champ-latest" />
          {recentHidden ? (
            <p className="text-[11px] text-rw-muted italic">{tl("Hidden while spoiler mode is on.")}</p>
          ) : (
            <ul className="text-xs space-y-2">
              {usedOnly && !c.recent.some(usedIn) && <li className="text-rw-muted">{tl("None of the latest games used it.")}</li>}
              {c.recent.filter(usedIn).map((r, i) => (
                <li key={i} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate min-w-0">
                      <span className={`font-bold mr-1 ${r.win ? "text-rw-teal" : "text-rw-red"}`}>
                        {r.win ? tc("short result", "W") : tc("short result", "L")}
                      </span>
                      <PlayerLink name={r.n} u={r.u} /> <span className="text-rw-sub tabular-nums">{r.k}/{r.d}/{r.a}</span>{" "}
                      {r.g ? <HubLink to={{ kind: "match", slug: r.g, game: r.gn }}>vs {r.opp}</HubLink> : <span>vs {r.opp}</span>}
                    </span>
                    <span className="text-rw-muted shrink-0">{fmtDate(r.date, false)}</span>
                  </div>
                  {r.it && r.it.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {r.ks && <RuneIcon name={r.ks} size={18} />}
                      {r.stt && <RuneIcon name={r.stt} size={14} />}
                      <span className="w-1" />
                      {r.it.map((it, j) => (
                        <ItemIcon key={j} name={it} size={18} />
                      ))}
                      <span className="w-1" />
                      {(r.sp || []).map((sp) => (
                        <SpellIcon key={sp} name={sp} size={14} />
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] text-rw-muted truncate">{r.en}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
};

