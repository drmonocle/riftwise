/**
 * "16:9 card": a fixed 1600×900 picture for a broadcast scene, X or Discord. A headline, one or two sides with their
 * key numbers (bars show who's ahead), an optional win chance, and the RiftWise footer. It is drawn off screen only
 * while the picture is made, so it never changes the page.
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonitorPlay } from "lucide-react";
import { toBlob } from "html-to-image";
import { tl, tc, locale, roleName } from "../../i18n";
import { IS_WEB } from "../../platform";
import { ChampIcon } from "./ui";
import type { PlayerAgg, TeamAgg } from "../../hub/period";
import { ROLES } from "../../hub/champAgg";
import type { draftTendencies } from "./DraftTendencies";

export interface CardSide {
  name: string;
  /** a line under the name: region, role, team */
  sub?: string;
  /** most played champions, shown as icons */
  champs?: string[];
}

export interface CardRow {
  label: string;
  a: string;
  b?: string;
  /** numbers behind a / b, for the bars (null = no bar) */
  va?: number | null;
  vb?: number | null;
  /** "low": the smaller number is better (deaths) */
  better?: "high" | "low";
  /** one-side cards: a 0-100 bar (percentile, win rate) */
  pct?: number | null;
}

export interface CardData {
  title: string;
  subtitle?: string;
  a: CardSide;
  b?: CardSide;
  /** win chance of a and b in percent */
  chance?: [number, number] | null;
  rows: CardRow[];
  /** a line in the footer (data credits) */
  note?: string;
  /** a layout of its own (Match prep's overview, Fearless and draft cards) in place of the sides and rows */
  body?: React.ReactNode;
}

const W = 1600;
const H = 900;

/** The 1600×900 frame every card shares: headline, the card's own content, the RiftWise footer. */
const Frame: React.FC<{ d: CardData; children: React.ReactNode }> = ({ d, children }) => (
  <div
    style={{
      width: W,
      height: H,
      boxSizing: "border-box",
      padding: "48px 72px 32px",
      display: "flex",
      flexDirection: "column",
      fontFamily: "inherit",
      color: "var(--rw-text)",
      background: "linear-gradient(135deg, var(--rw-surface) 0%, var(--rw-bg) 70%)",
    }}
  >
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24 }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "var(--rw-accent)" }}>{d.title}</div>
      {d.subtitle && <div style={{ fontSize: 24, color: "var(--rw-sub)" }}>{d.subtitle}</div>}
    </div>
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "2px solid var(--rw-border)", paddingTop: 14, marginTop: 12, fontSize: 20, color: "var(--rw-muted)" }}>
      <span>
        <span style={{ fontWeight: 800, color: "var(--rw-accent)" }}>RiftWise</span> · riftwise.gg
      </span>
      <span>
        {d.note ? `${d.note} · ` : ""}
        {new Date().toISOString().slice(0, 10)}
      </span>
    </div>
  </div>
);

const Card: React.FC<{ d: CardData }> = ({ d }) => {
  if (d.body) return <Frame d={d}>{d.body}</Frame>;
  const two = !!d.b;
  const rows = d.rows.slice(0, two ? 9 : 10);
  const side = (s: CardSide, right: boolean) => (
    <div style={{ textAlign: right ? "right" : "left", minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.05, color: "var(--rw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {s.name}
      </div>
      {s.sub && <div style={{ fontSize: 22, color: "var(--rw-sub)", marginTop: 4 }}>{s.sub}</div>}
      {s.champs && s.champs.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: right ? "flex-end" : "flex-start" }}>
          {s.champs.slice(0, 5).map((c) => (
            <ChampIcon key={c} name={c} size={44} />
          ))}
        </div>
      )}
    </div>
  );
  const bar = (r: CardRow) => {
    if (!two || r.va == null || r.vb == null) return null;
    const a = Math.abs(r.va);
    const b = Math.abs(r.vb);
    // signed numbers (gold leads): compare the raw values; otherwise share of the total
    let left = a + b > 0 ? a / (a + b) : 0.5;
    if (r.va < 0 || r.vb < 0) left = r.va === r.vb ? 0.5 : r.va > r.vb ? 0.7 : 0.3;
    // lower is better (deaths, game length): the better side gets the longer bar
    if (r.better === "low") left = 1 - left;
    const aBetter = r.better === "low" ? r.va < r.vb : r.va > r.vb;
    const bBetter = r.better === "low" ? r.vb < r.va : r.vb > r.va;
    return (
      <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", background: "var(--rw-bg)", marginTop: 4 }}>
        <div style={{ width: `${left * 100}%`, background: aBetter ? "var(--rw-accent)" : "var(--rw-line)" }} />
        <div style={{ flex: 1, background: bBetter ? "var(--rw-teal)" : "var(--rw-line)" }} />
      </div>
    );
  };
  return (
    <Frame d={d}>
      <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 20 }}>
        {side(d.a, false)}
        {two && (
          <div style={{ textAlign: "center", minWidth: 220 }}>
            {d.chance ? (
              <>
                <div style={{ fontSize: 20, color: "var(--rw-muted)", textTransform: "uppercase", letterSpacing: 2 }}>{tl("Win chance")}</div>
                <div style={{ fontSize: 48, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "var(--rw-accent)" }}>{d.chance[0]}%</span>
                  <span style={{ color: "var(--rw-muted)", fontSize: 32 }}> · </span>
                  <span style={{ color: "var(--rw-teal)" }}>{d.chance[1]}%</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 40, fontWeight: 800, color: "var(--rw-muted)" }}>VS</div>
            )}
          </div>
        )}
        {d.b && side(d.b, true)}
      </div>
      <div style={{ marginTop: 22, flex: 1, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateColumns: two ? "1fr" : "1fr 1fr", gap: two ? 6 : "14px 48px", alignContent: "start" }}>
        {rows.map((r) =>
          two ? (
            <div key={r.label}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "baseline", gap: 24, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{r.a}</span>
                <span style={{ fontSize: 20, color: "var(--rw-sub)", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center" }}>{r.label}</span>
                <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15, textAlign: "right" }}>{r.b}</span>
              </div>
              {bar(r)}
            </div>
          ) : (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontSize: 22, color: "var(--rw-sub)", textTransform: "uppercase", letterSpacing: 1.5 }}>{r.label}</span>
                <span style={{ fontSize: 36, fontWeight: 800 }}>{r.a}</span>
              </div>
              {r.pct != null && (
                <div style={{ height: 8, borderRadius: 4, background: "var(--rw-bg)", marginTop: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, r.pct))}%`, height: "100%", background: "var(--rw-accent)" }} />
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </Frame>
  );
};

/** The button: draws the card off screen, turns it into a PNG, copies it (and on the web, offers a download). */
export const BroadcastCardButton: React.FC<{ data: () => CardData; name: string; label?: string; compact?: boolean }> = ({ data, name, label, compact }) => {
  const [job, setJob] = useState<{ d: CardData; save: boolean } | null>(null);
  const [state, setState] = useState<"" | "busy" | "copied" | "failed">("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!job) return;
    let alive = true;
    (async () => {
      try {
        // let the card and its champion pictures load: off screen, lazy pictures never would, so load them now
        // (and don't wait more than a few seconds for a slow one)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const imgs = [...(ref.current?.querySelectorAll("img") || [])];
        for (const im of imgs) im.loading = "eager";
        await Promise.race([
          Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => ((im.onload = r), (im.onerror = r)))))),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
        if (!ref.current) throw new Error("no card");
        const bg = getComputedStyle(document.documentElement).getPropertyValue("--rw-bg").trim() || "#0a1428";
        const blob = await toBlob(ref.current.firstElementChild as HTMLElement, { width: W, height: H, pixelRatio: 1, backgroundColor: bg, skipFonts: true });
        if (!blob) throw new Error("no image");
        if (job.save) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${name.replace(/[^\w.-]+/g, "-").slice(0, 80) || "riftwise"}-16x9.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          if (alive) setState("");
        } else {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          if (alive) setState("copied");
        }
      } catch {
        if (alive) setState("failed");
      } finally {
        if (alive) setJob(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [job, name]);
  // "Copied" / the error note go away after a moment
  useEffect(() => {
    if (state !== "copied" && state !== "failed") return;
    const t = setTimeout(() => setState(""), 2200);
    return () => clearTimeout(t);
  }, [state]);
  const start = (save: boolean) => {
    setState("busy");
    setJob({ d: data(), save });
  };
  return (
    <span data-nocapture="1" className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => start(false)}
        disabled={state === "busy"}
        className={`flex items-center gap-1 rounded border border-rw-border text-rw-teal hover:border-rw-accent disabled:opacity-50 text-[11px] ${
          compact ? "p-1 pointer-coarse:min-h-8 pointer-coarse:min-w-8" : "px-2 py-1.5 min-h-8"
        }`}
        title={`${label ? `${label}: ` : ""}${tl("Copy a 1600×900 card for a broadcast, X or Discord")}`}
        aria-label={compact ? `${label || tl("16:9 card")}: ${tl("Copy a 1600×900 card for a broadcast, X or Discord")}` : undefined}
      >
        <MonitorPlay className="w-3.5 h-3.5" />
        {compact ? (state === "copied" ? tl("Copied") : null) : state === "busy" ? tl("Making the image…") : state === "copied" ? tl("Copied") : label || tl("16:9 card")}
      </button>
      {IS_WEB && !compact && (
        <button
          type="button"
          onClick={() => start(true)}
          disabled={state === "busy"}
          className="text-[11px] px-2 py-1.5 min-h-8 rounded border border-rw-border text-rw-sub hover:text-rw-text disabled:opacity-50"
          title={tl("Save the 16:9 card as a picture")}
        >
          {tl("Save")}
        </button>
      )}
      {state === "failed" && <span className="text-[10px] text-rw-red">{tl("Couldn't make the image")}</span>}
      {job &&
        createPortal(
          <div ref={ref} aria-hidden="true" style={{ position: "fixed", left: -20000, top: 0, width: W, height: H, pointerEvents: "none" }}>
            <Card d={job.d} />
          </div>,
          document.body,
        )}
    </span>
  );
};

// ── what goes on the cards ────────────────────────────────────────────────

const pc = (v: number | null | undefined) => (v == null ? "–" : `${v.toFixed(1)}%`);
const wrOf = (w: number, g: number) => (g ? (w / g) * 100 : null);
const sg = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString(locale())}`);
const n1 = (v: number | null | undefined) => (v == null ? "–" : String(v));

/** Two teams over a period: record, gold, objectives and (with Oracle's Elixir games) the early game. */
export function teamCardData(
  a: { name: string; region?: string },
  b: { name: string; region?: string },
  A: TeamAgg,
  B: TeamAgg,
  period: string,
  chance?: [number, number] | null,
): CardData {
  const rows: CardRow[] = [
    { label: tl("Games won"), a: `${A.w}-${A.g - A.w}`, b: `${B.w}-${B.g - B.w}`, va: wrOf(A.w, A.g), vb: wrOf(B.w, B.g) },
    { label: tl("Win rate"), a: pc(wrOf(A.w, A.g)), b: pc(wrOf(B.w, B.g)), va: wrOf(A.w, A.g), vb: wrOf(B.w, B.g) },
  ];
  if (A.tl || B.tl) {
    rows.push({ label: "GD@15", a: sg(A.tl?.gd15), b: sg(B.tl?.gd15), va: A.tl?.gd15 ?? null, vb: B.tl?.gd15 ?? null });
    rows.push({ label: tl("Ahead at 15"), a: pc(A.tl?.lead15), b: pc(B.tl?.lead15), va: A.tl?.lead15 ?? null, vb: B.tl?.lead15 ?? null });
    rows.push({ label: tl("First blood"), a: pc(A.tl?.fb), b: pc(B.tl?.fb), va: A.tl?.fb ?? null, vb: B.tl?.fb ?? null });
  } else {
    rows.push({ label: tl("Gold diff / game"), a: sg(A.gd), b: sg(B.gd), va: A.gd, vb: B.gd });
  }
  rows.push(
    { label: tl("Kills / game"), a: n1(A.kills), b: n1(B.kills), va: A.kills, vb: B.kills },
    { label: tl("DRA%"), a: pc(A.dragShare), b: pc(B.dragShare), va: A.dragShare, vb: B.dragShare },
    { label: tl("Baron%"), a: pc(A.baronShare), b: pc(B.baronShare), va: A.baronShare, vb: B.baronShare },
    { label: tl("Towers"), a: n1(A.towers), b: n1(B.towers), va: A.towers, vb: B.towers },
  );
  return {
    title: tl("Head to head"),
    subtitle: period,
    a: { name: a.name, sub: a.region, champs: A.picks.slice(0, 5).map((p) => p[0]) },
    b: { name: b.name, sub: b.region, champs: B.picks.slice(0, 5).map((p) => p[0]) },
    chance,
    rows,
    note: A.tl || B.tl ? tl("Early game: Oracle's Elixir") : undefined,
  };
}

/** One player, or two side by side, over a period. */
export function playerCardData(
  a: { name: string; role?: string; club?: string },
  A: PlayerAgg,
  period: string,
  b?: { name: string; role?: string; club?: string },
  B?: PlayerAgg,
): CardData {
  const sub = (x: { role?: string; club?: string }) => [x.role, x.club].filter(Boolean).join(" · ");
  const two = !!(b && B);
  const row = (label: string, fa: string, va: number | null, fb?: string, vb?: number | null, pct?: number | null, better?: "low"): CardRow =>
    two ? { label, a: fa, b: fb, va, vb, better } : { label, a: fa, pct };
  const rows: CardRow[] = [
    row(tl("Win rate"), pc(wrOf(A.w, A.g)), wrOf(A.w, A.g), B && pc(wrOf(B.w, B.g)), B && wrOf(B.w, B.g), wrOf(A.w, A.g)),
    row(tl("KDA"), String(A.kda), A.kda, B && String(B.kda), B?.kda),
    row("KP", pc(A.kp), A.kp, B && pc(B.kp), B?.kp, A.kp),
    row(tl("CS / min"), n1(A.csm), A.csm, B && n1(B.csm), B?.csm),
    row(tl("Damage / min"), A.dpm != null ? A.dpm.toLocaleString(locale()) : "–", A.dpm, B && (B.dpm != null ? B.dpm.toLocaleString(locale()) : "–"), B?.dpm),
    row(tl("DMG%"), pc(A.dmgShare), A.dmgShare, B && pc(B.dmgShare), B?.dmgShare),
  ];
  if (A.tl || B?.tl) {
    rows.push(row("GD@15", sg(A.tl?.gd15), A.tl?.gd15 ?? null, B && sg(B.tl?.gd15), B?.tl?.gd15 ?? null));
    rows.push(row("CSD@15", A.tl?.csd15 != null ? `${A.tl.csd15 > 0 ? "+" : ""}${A.tl.csd15}` : "–", A.tl?.csd15 ?? null,
      B && (B.tl?.csd15 != null ? `${B.tl.csd15 > 0 ? "+" : ""}${B.tl.csd15}` : "–"), B?.tl?.csd15 ?? null));
  }
  rows.push(row(tl("VS / min"), n1(A.vsm), A.vsm, B && n1(B.vsm), B?.vsm));
  rows.push(row(tl("Games"), String(A.g), A.g, B && String(B.g), B?.g));
  return {
    title: two ? tl("Player comparison") : tl("Player card"),
    subtitle: period,
    a: { name: a.name, sub: sub(a), champs: A.champs.slice(0, 5).map((c) => c.c) },
    b: two ? { name: b!.name, sub: sub(b!), champs: B!.champs.slice(0, 5).map((c) => c.c) } : undefined,
    rows,
    note: A.tl || B?.tl ? tl("Early game: Oracle's Elixir") : undefined,
  };
}

// ── Match prep cards: overview, Fearless pools, drafts (layouts of their own) ─────────────────────────────

const A_COLOR = "var(--rw-accent)";
const B_COLOR = "var(--rw-teal)";
const caption: React.CSSProperties = { fontSize: 18, color: "var(--rw-sub)", textTransform: "uppercase", letterSpacing: 1.5 };
const none = <span style={{ color: "var(--rw-muted)", fontSize: 22 }}>–</span>;
const chip = (c: string, n?: number, size = 46) => (
  <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 20, color: "var(--rw-sub)", fontVariantNumeric: "tabular-nums" }}>
    <ChampIcon name={c} size={size} />
    {n != null && n}
  </span>
);

export interface PrepTeamLine {
  name: string;
  /** "#3 worldwide · #2 in LCK" */
  rank?: string;
  /** rating change in 30 days */
  chg?: number | null;
  /** last 10 series, newest first: true = won */
  form: boolean[];
}

/** Match prep overview: both teams, ranks, win chances for one game / Bo3 / Bo5, form, head-to-head, storylines. */
export function prepOverviewCard(d: {
  a: PrepTeamLine;
  b: PrepTeamLine;
  chances: [string, number][];
  h2h: [number, number] | null;
  stories: string[];
  period: string;
}): CardData {
  const team = (t: PrepTeamLine, right: boolean, color: string) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: right ? "right" : "left" }}>
      <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
      {t.rank && (
        <div style={{ fontSize: 22, color: "var(--rw-sub)", marginTop: 6 }}>
          {t.rank}
          {t.chg != null && t.chg !== 0 && (
            <span style={{ color: t.chg > 0 ? "var(--rw-teal)" : "var(--rw-red)", marginLeft: 10 }}>
              {t.chg > 0 ? "▲" : "▼"} {Math.abs(t.chg)} {tl("in 30 days")}
            </span>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: right ? "flex-end" : "flex-start" }}>
        {t.form.map((w, i) => (
          <span
            key={i}
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
              color: w ? "var(--rw-teal)" : "var(--rw-red)",
              border: `2px solid ${w ? "var(--rw-teal)" : "var(--rw-red)"}`,
            }}
          >
            {w ? tc("short result", "W") : tc("short result", "L")}
          </span>
        ))}
      </div>
    </div>
  );
  return {
    title: tl("Match prep"),
    subtitle: d.period,
    a: { name: d.a.name },
    rows: [],
    body: (
      <>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 32, marginTop: 20 }}>
          {team(d.a, false, A_COLOR)}
          <div style={{ fontSize: 40, fontWeight: 800, color: "var(--rw-muted)", paddingTop: 8 }}>VS</div>
          {team(d.b, true, B_COLOR)}
        </div>
        {d.chances.length > 0 && (
          <div style={{ marginTop: 28, display: "grid", gap: 12 }}>
            <div style={{ ...caption, textAlign: "center" }}>{tl("Win chances")}</div>
            {d.chances.map(([what, p]) => (
              <div key={what} style={{ display: "grid", gridTemplateColumns: "110px 1fr 110px", alignItems: "center", gap: 16, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: A_COLOR }}>{Math.round(p * 100)}%</span>
                <div style={{ position: "relative", height: 34, borderRadius: 6, overflow: "hidden", background: B_COLOR }}>
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${p * 100}%`, background: A_COLOR, borderRight: "3px solid var(--rw-bg)" }} />
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "var(--rw-bg)" }}>
                    {what}
                  </span>
                </div>
                <span style={{ fontSize: 32, fontWeight: 800, color: B_COLOR, textAlign: "right" }}>{Math.round((1 - p) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: d.h2h ? "320px 1fr" : "1fr", gap: 40, flex: 1, minHeight: 0 }}>
          {d.h2h && (
            <div>
              <div style={caption}>{tl("Head to head (series)")}</div>
              <div style={{ fontSize: 54, fontWeight: 800, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: A_COLOR }}>{d.h2h[0]}</span>
                <span style={{ color: "var(--rw-muted)" }}> – </span>
                <span style={{ color: B_COLOR }}>{d.h2h[1]}</span>
              </div>
            </div>
          )}
          {d.stories.length > 0 && (
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div style={caption}>{tl("Storylines")}</div>
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {d.stories.slice(0, 3).map((t, i) => (
                  <li key={i} style={{ fontSize: 24, lineHeight: 1.25, color: "var(--rw-text)", display: "flex", gap: 10 }}>
                    <span style={{ color: "var(--rw-accent)" }}>•</span>
                    <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </>
    ),
  };
}

export interface PoolLine {
  name: string;
  /** champions played, most first: [champion, games] */
  list: [string, number][];
  /** champions with 2+ games */
  deep: number;
}

const Pinch: React.FC = () => (
  <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1.5, color: "#fff", background: "var(--rw-red)", borderRadius: 6, padding: "3px 10px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
    {tl("pinch point")}
  </span>
);

/** Fearless pool depth: the five roles side by side, the shallowest pool marked. */
export function fearlessCard(d: { aName: string; bName: string; rows: { role: string; a: PoolLine | null; b: PoolLine | null }[]; period: string }): CardData {
  const all = d.rows.flatMap((r) => [r.a, r.b]).filter((x): x is PoolLine => !!x && x.list.length > 0);
  const min = all.length ? Math.min(...all.map((x) => x.deep)) : -1;
  const cell = (x: PoolLine | null, right: boolean) =>
    !x ? (
      none
    ) : (
      <div style={{ minWidth: 0, textAlign: right ? "right" : "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: right ? "flex-end" : "flex-start" }}>
          {right && x.deep === min && <Pinch />}
          <span style={{ fontSize: 26, fontWeight: 800 }}>{x.name}</span>
          <span style={{ fontSize: 20, color: x.deep === min ? "var(--rw-red)" : "var(--rw-sub)" }}>{tl("{n} with 2+ games", { n: x.deep })}</span>
          {!right && x.deep === min && <Pinch />}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6, justifyContent: right ? "flex-end" : "flex-start" }}>
          {x.list.slice(0, 8).map(([c, n]) => (
            <span key={c} style={{ opacity: n >= 2 ? 1 : 0.5 }}>
              {chip(c, n, 40)}
            </span>
          ))}
        </div>
      </div>
    );
  return {
    title: tl("Fearless pool depth"),
    subtitle: `${d.aName} vs ${d.bName} · ${d.period}`,
    a: { name: d.aName },
    rows: [],
    body: (
      <div style={{ marginTop: 18, display: "grid", gap: 6, flex: 1, alignContent: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 1fr", gap: 20, fontSize: 30, fontWeight: 800 }}>
          <span style={{ color: A_COLOR }}>{d.aName}</span>
          <span />
          <span style={{ color: B_COLOR, textAlign: "right" }}>{d.bName}</span>
        </div>
        {d.rows.map((r) => (
          <div key={r.role} style={{ display: "grid", gridTemplateColumns: "1fr 150px 1fr", gap: 20, alignItems: "center", borderTop: "1px solid var(--rw-border)", paddingTop: 8 }}>
            {cell(r.a, false)}
            <span style={{ ...caption, textAlign: "center", color: "var(--rw-accent)", fontWeight: 800 }}>{roleName(r.role)}</span>
            {cell(r.b, true)}
          </div>
        ))}
      </div>
    ),
  };
}

type Draft = ReturnType<typeof draftTendencies>;

/** Both teams' drafts side by side: first picks, red openers, phase 1 bans, counter-pick roles, bot duos, flex picks. */
export function draftCard(d: { aName: string; bName: string; A: Draft; B: Draft; period: string }): CardData {
  const roleText = (shares: [number, number][]) =>
    shares.length ? shares.slice(0, 2).map(([r, v]) => `${roleName(ROLES[r])} ${Math.round(v * 100)}%`).join(" · ") : "–";
  const icons = (list: [string, number, number][], n: number, right: boolean) => (
    <div style={{ display: "flex", gap: 10, justifyContent: right ? "flex-end" : "flex-start", flexWrap: "wrap" }}>
      {list.length ? list.slice(0, n).map(([c, g]) => chip(c, g, 42)) : none}
    </div>
  );
  const duos = (x: Draft, right: boolean) => (
    <div style={{ display: "flex", gap: 18, justifyContent: right ? "flex-end" : "flex-start" }}>
      {x.botDuos.length
        ? x.botDuos.slice(0, 2).map(([c1, c2, g]) => (
            <span key={c1 + c2} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 20, color: "var(--rw-sub)" }}>
              <ChampIcon name={c1} size={40} />
              <ChampIcon name={c2} size={40} />
              {g}
            </span>
          ))
        : none}
    </div>
  );
  const flex = (x: Draft, right: boolean) => (
    <div style={{ display: "flex", gap: 8, justifyContent: right ? "flex-end" : "flex-start" }}>
      {x.flex.length ? x.flex.slice(0, 6).map(([c]) => <ChampIcon key={c} name={c} size={40} />) : none}
    </div>
  );
  const text = (t: string, right: boolean) => <div style={{ fontSize: 24, fontWeight: 700, textAlign: right ? "right" : "left" }}>{t}</div>;
  const rows: [string, React.ReactNode, React.ReactNode][] = [
    [tl("First pick (blue)"), icons(d.A.b1, 4, false), icons(d.B.b1, 4, true)],
    [tl("First picks (red)"), icons(d.A.r12, 4, false), icons(d.B.r12, 4, true)],
    [tl("Bans, phase 1"), icons(d.A.bans1, 5, false), icons(d.B.bans1, 5, true)],
    // where counter-picks go
    [tl("Last pick on red (R5)"), text(roleText(d.A.r5), false), text(roleText(d.B.r5), true)],
    [tl("Last picks on blue (B4-B5)"), text(roleText(d.A.b45), false), text(roleText(d.B.b45), true)],
    [tl("Bot lane pairs"), duos(d.A, false), duos(d.B, true)],
    [tl("Flex picks"), flex(d.A, false), flex(d.B, true)],
  ];
  return {
    title: tl("Draft tendencies"),
    subtitle: d.period,
    a: { name: d.aName },
    rows: [],
    note: tl("{a} and {b} games with the draft order", { a: d.A.games, b: d.B.games }),
    body: (
      <div style={{ marginTop: 18, display: "grid", gap: 4, flex: 1, alignContent: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px 1fr", gap: 20, fontSize: 34, fontWeight: 800 }}>
          <span style={{ color: A_COLOR, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.aName}</span>
          <span />
          <span style={{ color: B_COLOR, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.bName}</span>
        </div>
        {rows.map(([what, a, b]) => (
          <div key={what} style={{ display: "grid", gridTemplateColumns: "1fr 260px 1fr", gap: 20, alignItems: "center", borderTop: "1px solid var(--rw-border)", padding: "8px 0" }}>
            {a}
            <span style={{ ...caption, textAlign: "center" }}>{what}</span>
            {b}
          </div>
        ))}
      </div>
    ),
  };
}
