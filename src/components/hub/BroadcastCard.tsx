/**
 * "16:9 card": a fixed 1600×900 picture for a broadcast scene, X or Discord. A headline, one or two sides with their
 * key numbers (bars show who's ahead), an optional win chance, and the RiftWise footer. It is drawn off screen only
 * while the picture is made, so it never changes the page.
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonitorPlay } from "lucide-react";
import { toBlob } from "html-to-image";
import { tl, tc, locale, roleName, fmtDec, stageLabel, eventTitle } from "../../i18n";
import { IS_WEB } from "../../platform";
import { ChampIcon } from "./ui";
import { champName } from "../../champions";
import { loadHubPhotos, usePlayerPicture, useTeamLogo } from "../../hub/riotCatalog";
import type { PlayerAgg, TeamAgg } from "../../hub/period";
import { ROLES } from "../../hub/champAgg";
import type { draftTendencies } from "./DraftTendencies";

export interface CardSide {
  name: string;
  /** a line under the name: region, role, team */
  sub?: string;
  /** most played champions, shown as icons */
  champs?: string[];
  /** the team whose logo goes beside the name (a player's card: their team), and its short name */
  team?: string;
  code?: string | null;
  /** a player's card: their photo (by page slug, or Riot's photo the page file carries), the team logo on it */
  player?: { slug?: string; img?: string };
  /** a team's card: its current five, faces in a row beside the name */
  roster?: { name: string; slug?: string; role?: string }[];
}

/** A team page's roster player: name, page slug, games, role (the team file's `roster[].p`). */
export type RosterPlayer = { n: string; u?: string | null; r?: string };

/**
 * A player's photo on a card (TV, 2026-10-28: "player face cards on their stat sheets"): Riot's photo from Riot's own
 * picture server, or the Leaguepedia copy on our server, both allowed inside a picture; initials when there's none.
 * The team logo sits on its corner.
 */
export const CardPhoto: React.FC<{ name: string; team?: string; slug?: string; img?: string; size: number; noLogo?: boolean }> = ({
  name,
  team,
  slug,
  img,
  size,
  noLogo,
}) => {
  const pic = usePlayerPicture(name, team, slug, img);
  const [broken, setBroken] = useState(false);
  const src = pic && !broken ? pic.src.replace(/^http:/, "https:") : null;
  const ring: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    boxShadow: `0 0 0 ${size > 100 ? 4 : 3}px var(--rw-accent), 0 8px 24px rgba(0,0,0,0.45)`,
    background: "radial-gradient(circle at 50% 30%, var(--rw-raised), var(--rw-bg))",
  };
  return (
    <span style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-block" }}>
      {src ? (
        <img src={src} crossOrigin="anonymous" alt="" onError={() => setBroken(true)} style={{ ...ring, objectFit: "cover", objectPosition: "top" }} />
      ) : (
        <span style={{ ...ring, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size / 3, fontWeight: 900, color: "var(--rw-sub)" }}>
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
      {team && !noLogo && (
        <span
          style={{
            position: "absolute",
            right: -size * 0.06,
            bottom: -size * 0.06,
            width: size * 0.42,
            height: size * 0.42,
            borderRadius: "50%",
            background: "var(--rw-surface)",
            boxShadow: "0 0 0 3px var(--rw-bg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CardLogo name={team} size={size * 0.3} />
        </span>
      )}
    </span>
  );
};

/**
 * A team's logo on a card ("could we get team logos into the overview pictures?", 2026-10-28): Riot's logo from its
 * team list, loaded from Riot's own picture server, which lets pages copy it into a picture (Riot's resizer doesn't,
 * so the page's small logos stay out of cards). A team Riot has none for gets a badge with its short name when
 * `badge` is set (the headline teams), and nothing in a list.
 */
export const CardLogo: React.FC<{ name?: string; code?: string | null; size: number; badge?: boolean }> = ({ name, code, size, badge }) => {
  const logo = useTeamLogo(name, code ?? undefined);
  if (logo)
    return (
      <img
        src={logo.replace(/^http:/, "https:")}
        crossOrigin="anonymous"
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))" }}
      />
    );
  if (!badge || !name) return null;
  // the short name, a short one-word name as it is ("TSM", not "T"), else the initials
  const short = (code || (name.length <= 4 && !/\s/.test(name) ? name : name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).map((w) => w[0]).join("")) || name)
    .slice(0, 4)
    .toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: size / 5,
        border: "3px solid var(--rw-line)",
        background: "linear-gradient(145deg, var(--rw-raised), var(--rw-bg))",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size / (short.length > 3 ? 3.6 : 2.8),
        fontWeight: 900,
        letterSpacing: 1,
        color: "var(--rw-sub)",
      }}
    >
      {short}
    </span>
  );
};

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
    <div style={{ display: "flex", alignItems: "center", gap: 24, minWidth: 0, flex: 1, flexDirection: right ? "row-reverse" : "row" }}>
      {s.player ? (
        <CardPhoto name={s.name} team={s.team} slug={s.player.slug} img={s.player.img} size={128} />
      ) : (
        s.team && <CardLogo name={s.team} code={s.code} size={112} badge />
      )}
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
        {!two && d.a.roster && d.a.roster.length > 0 && (
          <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
            {d.a.roster.map((p) => (
              <div key={p.name} style={{ width: 124, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <CardPhoto name={p.name} team={d.a.team} slug={p.slug} size={92} noLogo />
                <div
                  style={{
                    fontSize: p.name.length > 9 ? 18 : p.name.length > 7 ? 20 : 22,
                    fontWeight: 800,
                    marginTop: 12,
                    maxWidth: "100%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.name}
                </div>
                {p.role && <div style={{ fontSize: 15, color: "var(--rw-muted)", textTransform: "uppercase", letterSpacing: 1.5 }}>{roleName(p.role)}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      {two ? (
        <div style={{ marginTop: 22, flex: 1, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr", gap: 6, alignContent: "start" }}>
          {rows.map((r) => (
            <div key={r.label}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "baseline", gap: 24, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{r.a}</span>
                <span style={{ fontSize: 20, color: "var(--rw-sub)", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center" }}>{r.label}</span>
                <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15, textAlign: "right" }}>{r.b}</span>
              </div>
              {bar(r)}
            </div>
          ))}
        </div>
      ) : (
        <OneSide rows={rows} />
      )}
    </Frame>
  );
};

/**
 * A one-sided card's numbers (TV, 2026-10-28: "some lines not having bars look weird"): the shares and rates as bars
 * on one 0-100% scale with a mark at 50%, across the top up to three to a row, and every other number as a tile, four
 * to a row under them (bars stacked in one column ran off the bottom of the card with six of them).
 */
const OneSide: React.FC<{ rows: CardRow[] }> = ({ rows }) => {
  const bars = rows.filter((r) => r.pct != null);
  const tiles = rows.filter((r) => r.pct == null);
  const barCols = bars.length <= 3 ? bars.length : bars.length === 4 ? 2 : 3;
  // a signed number reads as ahead (teal) or behind (red); everything else in the text colour
  const tone = (v: string) => (/^\+\d/.test(v) ? "var(--rw-teal)" : /^[−-]\d/.test(v) ? "var(--rw-red)" : "var(--rw-text)");
  const barRow = (r: CardRow) => {
    const p = Math.max(0, Math.min(100, r.pct!));
    return (
      <div key={r.label} style={{ minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontSize: 21, color: "var(--rw-sub)", textTransform: "uppercase", letterSpacing: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
          <span style={{ fontSize: 36, fontWeight: 800 }}>{r.a}</span>
        </div>
        <div style={{ position: "relative", height: 12, borderRadius: 6, background: "var(--rw-bg)", boxShadow: "inset 0 0 0 1px var(--rw-border)", marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${p}%`, height: "100%", borderRadius: 6, background: "linear-gradient(90deg, var(--rw-accent-2), var(--rw-accent))" }} />
          <div style={{ position: "absolute", left: "calc(50% - 1px)", top: 0, bottom: 0, width: 2, background: "var(--rw-bg)", opacity: 0.85 }} />
        </div>
      </div>
    );
  };
  const tile = (r: CardRow) => (
    <div key={r.label} style={{ minWidth: 0, borderRadius: 10, background: "var(--rw-surface)", boxShadow: "inset 0 0 0 1px var(--rw-border)", padding: "14px 20px" }}>
      <div style={{ fontSize: 18, color: "var(--rw-sub)", textTransform: "uppercase", letterSpacing: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
      <div
        style={{
          fontSize: r.a.length > 14 ? 24 : r.a.length > 9 ? 30 : 40,
          fontWeight: 800,
          marginTop: 4,
          color: tone(r.a),
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {r.a}
      </div>
    </div>
  );
  return (
    <div style={{ marginTop: 30, flex: 1, minHeight: 0, overflow: "hidden", display: "grid", gap: 30, alignContent: "start" }}>
      {bars.length > 0 && <div style={{ display: "grid", gridTemplateColumns: `repeat(${barCols}, minmax(0, 1fr))`, gap: "26px 48px" }}>{bars.map(barRow)}</div>}
      {tiles.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>{tiles.map(tile)}</div>}
    </div>
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
        // the list of who has a photo on our server first, so the faces are in the card before it's drawn (it can
        // come after the card's first draw on a slow connection, and the picture had initials)
        await Promise.race([loadHubPhotos(), new Promise((r) => setTimeout(r, 3000))]);
        // let the card and its champion pictures load: off screen, lazy pictures never would, so load them now
        // (and don't wait more than a few seconds for a slow one)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const imgs = [...(ref.current?.querySelectorAll("img") || [])];
        for (const im of imgs) {
          im.loading = "eager";
          if (im.dataset.full) im.src = im.dataset.full; // full icons: the resized ones can't be copied into a picture
        }
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
          compact ? "p-1 pointer-coarse:min-h-9 pointer-coarse:min-w-9 max-sm:min-h-9 max-sm:min-w-9" : "px-2 py-1.5 min-h-8 whitespace-nowrap"
        }`}
        title={`${label ? `${label}: ` : ""}${tl("Copy a 1600×900 card for a broadcast, X or Discord")}`}
        aria-label={compact ? `${label || tl("Overview card")}: ${tl("Copy a 1600×900 card for a broadcast, X or Discord")}` : undefined}
      >
        <MonitorPlay className="w-3.5 h-3.5" />
        {compact ? (state === "copied" ? tl("Copied") : null) : state === "busy" ? tl("Making the image…") : state === "copied" ? tl("Copied") : label || tl("Overview card")}
      </button>
      {IS_WEB && !compact && (
        <button
          type="button"
          onClick={() => start(true)}
          disabled={state === "busy"}
          className="text-[11px] px-2 py-1.5 min-h-8 rounded border border-rw-border text-rw-sub hover:text-rw-text disabled:opacity-50"
          title={tl("Save the 16:9 card as a picture")}
        >
          {tl("Save card")}
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

const pc = (v: number | null | undefined) => (v == null ? "–" : `${fmtDec(v)}%`);
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
    a: { name: a.name, sub: a.region, champs: A.picks.slice(0, 5).map((p) => p[0]), team: a.name },
    b: { name: b.name, sub: b.region, champs: B.picks.slice(0, 5).map((p) => p[0]), team: b.name },
    chance,
    rows,
    note: A.tl || B.tl ? tl("Early game: Oracle's Elixir") : undefined,
  };
}

/** One player, or two side by side, over a period. */
export function playerCardData(
  a: { name: string; role?: string; club?: string; slug?: string },
  A: PlayerAgg,
  period: string,
  b?: { name: string; role?: string; club?: string; slug?: string },
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
    row(tl("DMG%"), pc(A.dmgShare), A.dmgShare, B && pc(B.dmgShare), B?.dmgShare, A.dmgShare),
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
    a: { name: a.name, sub: sub(a), champs: A.champs.slice(0, 5).map((c) => c.c), team: a.club, player: { slug: a.slug } },
    b: two ? { name: b!.name, sub: sub(b!), champs: B!.champs.slice(0, 5).map((c) => c.c), team: b!.club, player: { slug: b!.slug } } : undefined,
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
    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", gap: 24, flexDirection: right ? "row-reverse" : "row" }}>
    <CardLogo name={t.name} size={124} badge />
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 1fr", gap: 20, fontSize: 30, fontWeight: 800, alignItems: "center" }}>
          <span style={{ color: A_COLOR, display: "flex", alignItems: "center", gap: 14 }}>
            <CardLogo name={d.aName} size={56} badge />
            {d.aName}
          </span>
          <span />
          <span style={{ color: B_COLOR, display: "flex", alignItems: "center", gap: 14, justifyContent: "flex-end" }}>
            {d.bName}
            <CardLogo name={d.bName} size={56} badge />
          </span>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px 1fr", gap: 20, fontSize: 34, fontWeight: 800, alignItems: "center" }}>
          <span style={{ color: A_COLOR, display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <CardLogo name={d.aName} size={60} badge />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.aName}</span>
          </span>
          <span />
          <span style={{ color: B_COLOR, display: "flex", alignItems: "center", gap: 14, justifyContent: "flex-end", minWidth: 0 }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.bName}</span>
            <CardLogo name={d.bName} size={60} badge />
          </span>
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

// ── more overview cards: one team, a tournament, the power rankings, a chances table, a champion ─────────────

const mmss = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * One team over a period: record, sides, gold, objectives and (with Oracle's Elixir games) the early game, with its
 * current five (TV, 2026-10-28: "not showing player faces for the current roster"): this year's most played player
 * in each role, the roster listing them by games.
 */
export function teamSoloCardData(t: { name: string; sub?: string; roster?: RosterPlayer[] }, A: TeamAgg, period: string): CardData {
  const list = t.roster ?? [];
  const byRole = ROLES.flatMap((r) => list.find((p) => p.r === r) ?? []);
  const five = (byRole.length >= 3 ? byRole : list.slice(0, 5)).map((p) => ({ name: p.n, slug: p.u ?? undefined, role: p.r }));
  const rows: CardRow[] = [
    { label: tl("Games won"), a: `${A.w}-${A.g - A.w}` },
    { label: tl("Win rate"), a: pc(wrOf(A.w, A.g)), pct: wrOf(A.w, A.g) },
    { label: tl("Blue side"), a: `${A.blue[1]}-${A.blue[0] - A.blue[1]}`, pct: wrOf(A.blue[1], A.blue[0]) },
    { label: tl("Red side"), a: `${A.red[1]}-${A.red[0] - A.red[1]}`, pct: wrOf(A.red[1], A.red[0]) },
  ];
  if (A.tl) {
    rows.push({ label: "GD@15", a: sg(A.tl.gd15) });
    rows.push({ label: tl("Ahead at 15"), a: pc(A.tl.lead15), pct: A.tl.lead15 });
  } else rows.push({ label: tl("Gold diff / game"), a: sg(A.gd) });
  rows.push(
    { label: tl("Kills / game"), a: n1(A.kills) },
    { label: tl("DRA%"), a: pc(A.dragShare), pct: A.dragShare },
    { label: tl("Baron%"), a: pc(A.baronShare), pct: A.baronShare },
    { label: tl("Avg game"), a: A.min ? mmss(A.min) : "–" },
  );
  return {
    title: tl("Team card"),
    subtitle: period,
    a: { name: t.name, sub: t.sub, champs: A.picks.slice(0, 5).map((p) => p[0]), team: t.name, roster: five },
    rows,
    note: A.tl ? tl("Early game: Oracle's Elixir") : undefined,
  };
}

/** A tournament: winner and podium, games, length, kills, sides, Player of the Game, its best and shortest games. */
export function eventCardData(d: {
  name: string;
  when?: string;
  podium: string[];
  o: import("../../hub/types").EventOverview;
}): CardData {
  const { o } = d;
  const sides = o.blue + o.red;
  const rows: (CardRow & { sub?: string })[] = [
    { label: tl("Games"), a: o.g.toLocaleString(locale()) },
    { label: tl("Avg game"), a: o.min ? mmss(o.min) : "–" },
    { label: tl("Kills / game"), a: n1(o.kills || null) },
    { label: tl("Blue side wins"), a: sides ? `${Math.round((o.blue / sides) * 100)}%` : "–", pct: sides ? (o.blue / sides) * 100 : null },
  ];
  if (o.mvp[0]) rows.push({ label: tl("Most Player of the Game"), a: `${o.mvp[0].n} · ${o.mvp[0].v}` });
  if (o.short) rows.push({ label: tl("Shortest game"), a: mmss(o.short.v), sub: `${o.short.a} vs ${o.short.b}` });
  if (o.bloody) rows.push({ label: tl("Bloodiest game"), a: String(o.bloody.v), sub: `${o.bloody.a} vs ${o.bloody.b}` });
  if (o.pentas.length) rows.push({ label: tl("Pentakills"), a: o.pentas.map((p) => p.n).slice(0, 3).join(", ") });
  const medal = ["var(--rw-accent)", "var(--rw-text)", "var(--rw-sub)"];
  return {
    title: tl("Tournament overview"),
    subtitle: d.when,
    a: { name: d.name },
    rows: [],
    body: (
      <>
        <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, marginTop: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
        {d.podium.length > 0 && (
          <div style={{ display: "flex", gap: 40, marginTop: 14, alignItems: "baseline", flexWrap: "wrap" }}>
            {d.podium.slice(0, 3).map((t, i) => (
              <span key={i} style={{ fontSize: i === 0 ? 40 : 28, fontWeight: 800, color: medal[i], display: "inline-flex", alignItems: "center", gap: 12 }}>
                {i === 0 ? "🏆 " : `${i + 1}. `}
                <CardLogo name={t} size={i === 0 ? 64 : 44} />
                {t}
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "18px 48px", alignContent: "start" }}>
          {rows.map((r) => (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ ...caption, fontSize: 20, whiteSpace: "nowrap" }}>{r.label}</span>
                <span style={{ fontSize: 30, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{r.a}</span>
              </div>
              {r.sub && <div style={{ fontSize: 20, color: "var(--rw-sub)", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</div>}
              {r.pct != null && (
                <div style={{ height: 8, borderRadius: 4, background: "var(--rw-bg)", marginTop: 6, overflow: "hidden" }}>
                  <div style={{ width: `${r.pct}%`, height: "100%", background: "var(--rw-accent)" }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    ),
  };
}

/** A ranked list (power rankings): rank, name, league, rating and its 30-day change. */
export function rankingsCard(d: { title: string; subtitle: string; rows: { name: string; league?: string; r: number; chg?: number | null }[] }): CardData {
  const rows = d.rows.slice(0, 10);
  return {
    title: d.title,
    subtitle: d.subtitle,
    a: { name: d.title },
    rows: [],
    body: (
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gridAutoFlow: "column", gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, auto)`, gap: "10px 56px", alignContent: "start" }}>
        {rows.map((x, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 48px 1fr auto auto", gap: 18, alignItems: "center", borderTop: "1px solid var(--rw-border)", padding: "12px 0", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: i === 0 ? "var(--rw-accent)" : "var(--rw-muted)" }}>{i + 1}</span>
            <span style={{ display: "flex" }}>
              <CardLogo name={x.name} size={48} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 34, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span>
              {x.league && <span style={{ display: "block", fontSize: 18, color: "var(--rw-sub)" }}>{x.league}</span>}
            </span>
            <span style={{ fontSize: 30, fontWeight: 800, color: "var(--rw-accent)" }}>{x.r}</span>
            <span style={{ fontSize: 22, minWidth: 64, textAlign: "right", color: !x.chg ? "var(--rw-muted)" : x.chg > 0 ? "var(--rw-teal)" : "var(--rw-red)" }}>
              {!x.chg ? "–" : `${x.chg > 0 ? "▲" : "▼"}${Math.abs(x.chg)}`}
            </span>
          </div>
        ))}
      </div>
    ),
  };
}

/** A chances table (Worlds and bracket pickers): one row per team, the last column the title. */
export function chancesCard(d: { title: string; subtitle: string; cols: string[]; rows: { name: string; v: string[] }[]; note?: string }): CardData {
  const rows = d.rows.slice(0, 10);
  const grid = `1fr ${d.cols.map(() => "170px").join(" ")}`;
  return {
    title: d.title,
    subtitle: d.subtitle,
    a: { name: d.title },
    rows: [],
    note: d.note,
    body: (
      <div style={{ marginTop: 16, display: "grid", gap: 0, alignContent: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: 12, padding: "0 0 8px" }}>
          <span style={caption}>{tl("Team")}</span>
          {d.cols.map((c, i) => (
            <span key={c} style={{ ...caption, textAlign: "right", color: i === d.cols.length - 1 ? "var(--rw-accent)" : "var(--rw-sub)" }}>{c}</span>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: grid, gap: 12, alignItems: "baseline", borderTop: "1px solid var(--rw-border)", padding: "6px 0", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <CardLogo name={r.name} size={34} />
              <span style={{ fontSize: 28, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
            </span>
            {r.v.map((x, j) => (
              <span key={j} style={{ fontSize: j === r.v.length - 1 ? 32 : 26, fontWeight: j === r.v.length - 1 ? 800 : 600, textAlign: "right", color: j === r.v.length - 1 ? "var(--rw-accent)" : "var(--rw-text)" }}>{x}</span>
            ))}
          </div>
        ))}
      </div>
    ),
  };
}

/** A champion in pro play: this year and all time, its roles and the players with the most games on it. */
export function champCardData(c: import("../../hub/types").HubChamp, label: string): CardData {
  const year = c.years.find((y) => y.y === String(new Date().getFullYear())) || c.years[c.years.length - 1];
  const rows: CardRow[] = [];
  if (year) {
    rows.push({ label: tl("Games in {year}", { year: year.y }), a: year.p.toLocaleString(locale()) });
    rows.push({ label: tl("Win rate in {year}", { year: year.y }), a: pc(wrOf(year.w, year.p)), pct: wrOf(year.w, year.p) });
    rows.push({ label: tl("Bans in {year}", { year: year.y }), a: year.b.toLocaleString(locale()) });
  }
  rows.push({ label: tl("Games, all time"), a: c.p.toLocaleString(locale()) });
  rows.push({ label: tl("Win rate, all time"), a: pc(wrOf(c.w, c.p)), pct: wrOf(c.w, c.p) });
  const roles = c.roles.slice(0, 2).map((r) => roleName(r.r)).join(" · ");
  if (roles) rows.push({ label: tl("Main roles"), a: roles });
  for (const p of c.players.slice(0, 4)) rows.push({ label: p.n, a: tl("{g} games · {wr}", { g: p.g, wr: pc(wrOf(p.w, p.g)) }) });
  return {
    title: tl("Champion card"),
    a: { name: label, sub: tl("Pro play since 2011"), champs: [c.name] },
    rows,
  };
}

// ── player career, series and game cards ─────────────────────────────────

/** A player's whole pro career: record, KDA, farm and damage, titles, Player of the Game, champions. */
export function playerCareerCardData(p: import("../../hub/types").HubPlayer): CardData {
  const per = (v: number) => (p.g ? fmtDec(v / p.g) : "–");
  const rows: CardRow[] = [
    { label: tl("Games won"), a: `${p.w.toLocaleString(locale())}-${(p.g - p.w).toLocaleString(locale())}` },
    { label: tl("Win rate"), a: pc(wrOf(p.w, p.g)), pct: wrOf(p.w, p.g) },
    { label: tl("KDA"), a: String(p.kda) },
    { label: tl("K / D / A per game"), a: `${per(p.k)} / ${per(p.d)} / ${per(p.a)}` },
    { label: tl("CS / min"), a: n1(p.csm) },
    { label: tl("Damage / min"), a: p.dpm != null ? p.dpm.toLocaleString(locale()) : "–" },
    { label: tl("Titles"), a: String(p.titles.length) },
    { label: tl("Player of the Game"), a: p.mvp != null ? String(p.mvp) : "–" },
    { label: tl("Tournaments"), a: String(p.events.length) },
    { label: tl("Champions played"), a: String(p.nChamps) },
  ];
  const sub = [p.role ? roleName(p.role) : null, p.club, p.bio.country].filter(Boolean).join(" · ");
  const ys = p.years.map((y) => y.y).sort();
  const years = ys.length ? (ys[0] === ys[ys.length - 1] ? ys[0] : `${ys[0]}–${ys[ys.length - 1]}`) : undefined;
  return {
    title: tl("Career card"),
    subtitle: years,
    a: { name: p.name, sub, champs: p.champs.slice(0, 5).map((c) => c.c), team: p.club || undefined, player: { slug: p.u, img: p.img } },
    rows,
  };
}

/** A series: the score, then each game's winner, length, kills, gold, Player of the Game and both drafts. */
export function seriesCardData(s: import("../../hub/types").HubSeries): CardData {
  const nameA = s.a.c || s.a.n;
  const nameB = s.b.c || s.b.n;
  const games = s.games.filter((g) => g.w).slice(0, 5);
  const big = games.length <= 3;
  return {
    title: eventTitle(s.en),
    subtitle: [s.stage ? stageLabel(s.stage) : null, fmtDay(s.date)].filter(Boolean).join(" · "),
    a: { name: s.a.n },
    rows: [],
    body: (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 32, marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22, justifyContent: "flex-end", minWidth: 0 }}>
            <div style={{ fontSize: 52, fontWeight: 800, color: s.w === 1 ? A_COLOR : "var(--rw-text)", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.a.n}</div>
            <CardLogo name={s.a.n} code={s.a.c} size={96} badge />
          </div>
          <div style={{ fontSize: 72, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
            {s.sa}
            <span style={{ color: "var(--rw-muted)" }}> – </span>
            {s.sb}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, minWidth: 0 }}>
            <CardLogo name={s.b.n} code={s.b.c} size={96} badge />
            <div style={{ fontSize: 52, fontWeight: 800, color: s.w === 2 ? A_COLOR : "var(--rw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.b.n}</div>
          </div>
        </div>
        <div style={{ marginTop: 18, display: "grid", gap: big ? 14 : 8, alignContent: "start" }}>
          {games.map((g) => {
            const ta = g.t ? (g.blue === "a" ? g.t.blue : g.t.red) : undefined;
            const tb = g.t ? (g.blue === "a" ? g.t.red : g.t.blue) : undefined;
            const picks = (x: typeof ta, right: boolean) => (
              <div style={{ display: "flex", gap: 6, justifyContent: right ? "flex-start" : "flex-end" }}>
                {(x?.picks || []).slice(0, 5).map((c) => (
                  <ChampIcon key={c} name={c} size={big ? 46 : 36} />
                ))}
              </div>
            );
            return (
              <div key={g.n} style={{ display: "grid", gridTemplateColumns: "1fr 380px 1fr", alignItems: "center", gap: 20, borderTop: "1px solid var(--rw-border)", paddingTop: big ? 12 : 8 }}>
                {picks(ta, false)}
                <div style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ fontSize: big ? 28 : 24, fontWeight: 800 }}>
                    {tl("Game {n}", { n: g.n })}: <span style={{ color: A_COLOR }}>{g.w === 1 ? nameA : nameB}</span>
                  </div>
                  <div style={{ fontSize: 20, color: "var(--rw-sub)" }}>
                    {[g.min ? mmss(g.min) : null, ta?.k != null && tb?.k != null ? tl("{a}-{b} kills", { a: ta.k, b: tb.k }) : null, g.mvp ? `👑 ${g.mvp.n}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                {picks(tb, true)}
              </div>
            );
          })}
        </div>
      </>
    ),
  };
}

/** One game: both teams' kills, gold and objectives with bars, their drafts, and the Player of the Game. */
export function gameCardData(s: import("../../hub/types").HubSeries, g: import("../../hub/types").HubGame): CardData {
  const blueTeam = g.blue === "a" ? s.a : s.b;
  const redTeam = g.blue === "a" ? s.b : s.a;
  const B = g.t?.blue || {};
  const R = g.t?.red || {};
  const blueWon = (g.w === 1 && g.blue === "a") || (g.w === 2 && g.blue === "b");
  const row = (label: string, a?: number, b?: number, fmt: (v: number) => string = String): CardRow | null =>
    a == null && b == null ? null : { label, a: a == null ? "–" : fmt(a), b: b == null ? "–" : fmt(b), va: a ?? null, vb: b ?? null };
  const k = (v: number) => `${fmtDec(v / 1000)}k`;
  const rows = [
    row(tl("Kills"), B.k, R.k),
    row(tl("Gold"), B.gold, R.gold, k),
    row(tl("Towers"), B.towers, R.towers),
    row(tl("Dragons"), B.drag, R.drag),
    row(tl("Barons"), B.barons, R.barons),
    row(tl("Voidgrubs"), B.grubs, R.grubs),
    B.g15 != null ? { label: "GD@15", a: sg(B.g15), b: sg(-B.g15), va: B.g15, vb: -B.g15 } : null,
  ].filter((r): r is CardRow => !!r);
  if (g.mvp) rows.push({ label: tl("Player of the Game"), a: blueWon ? g.mvp.n : "", b: blueWon ? "" : g.mvp.n });
  const won = tl("Won");
  return {
    title: tl("{event} · Game {n}", { event: eventTitle(s.en), n: g.n }),
    subtitle: [g.min ? mmss(g.min) : null, g.patch ? tl("Patch {patch}", { patch: g.patch }) : null].filter(Boolean).join(" · "),
    a: { name: blueTeam.n, sub: `${tl("Blue side")}${blueWon ? ` · ${won}` : ""}`, champs: B.picks, team: blueTeam.n, code: blueTeam.c },
    b: { name: redTeam.n, sub: `${tl("Red side")}${!blueWon && g.w ? ` · ${won}` : ""}`, champs: R.picks, team: redTeam.n, code: redTeam.c },
    rows,
    note: B.g15 != null ? tl("Early game: Oracle's Elixir") : undefined,
  };
}

const fmtDay = (d: string) => {
  const t = Date.parse(d.length <= 10 ? `${d}T12:00:00Z` : d.replace(" ", "T"));
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString(locale(), { dateStyle: "medium" });
};

// ── the draft board ──────────────────────────────────────────────────────

export interface BoardSide {
  name: string;
  bans: string[];
  /** in pick order: champion, its likely role and the player who plays it */
  picks: { c: string; role?: string; player?: string }[];
}

/** The draft on the Draft board: both teams' bans and picks (role and player), and earlier Fearless games. */
export function draftBoardCard(d: { blue: BoardSide; red: BoardSide; period: string; earlier: { blue: string[]; red: string[] }[] }): CardData {
  const side = (s: BoardSide, color: string, sideName: string, right: boolean) => (
    <div style={{ minWidth: 0, textAlign: right ? "right" : "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexDirection: right ? "row-reverse" : "row" }}>
        <CardLogo name={s.name} size={72} badge />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 46, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
          <div style={{ ...caption, marginTop: 2 }}>{sideName}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center", justifyContent: right ? "flex-end" : "flex-start" }}>
        <span style={{ ...caption, fontSize: 16, marginRight: 6 }}>{tl("Bans")}</span>
        {s.bans.length ? s.bans.map((c) => <span key={c} style={{ opacity: 0.55, filter: "grayscale(0.7)" }}><ChampIcon name={c} size={40} /></span>) : none}
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
        {s.picks.map((p) => (
          <div key={p.c} style={{ display: "flex", alignItems: "center", gap: 14, flexDirection: right ? "row-reverse" : "row" }}>
            <ChampIcon name={p.c} size={64} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{champName(p.c)}</div>
              {(p.role || p.player) && <div style={{ fontSize: 20, color: "var(--rw-sub)" }}>{[p.role, p.player].filter(Boolean).join(" · ")}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  return {
    title: tl("Draft board"),
    subtitle: d.period ? tl("Pools from {period}", { period: d.period }) : undefined,
    a: { name: d.blue.name },
    rows: [],
    body: (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, marginTop: 14, flex: 1, minHeight: 0 }}>
          {side(d.blue, "#4a9eff", tl("Blue side"), false)}
          {side(d.red, "var(--rw-red)", tl("Red side"), true)}
        </div>
        {d.earlier.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 28px", alignItems: "center", borderTop: "1px solid var(--rw-border)", paddingTop: 10 }}>
            <span style={caption}>{tl("Fearless: earlier games")}</span>
            {d.earlier.map((g, i) => (
              <span key={i} style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 18, color: "var(--rw-sub)" }}>
                {tl("Game {n}", { n: i + 1 })}
                {[...g.blue, ...g.red].map((c, k) => (
                  <ChampIcon key={k} name={c} size={28} />
                ))}
              </span>
            ))}
          </div>
        )}
      </>
    ),
  };
}

// ── a section as a card: any list on a team or player page ─────────────────

export interface ListRow {
  label: string;
  /** the number on the right */
  value?: string;
  /** a smaller line under the label */
  sub?: string;
  /** a champion icon before the label */
  champ?: string;
  /** a won / lost mark before the label */
  win?: boolean | null;
}

/** One section of a page (titles, by year, champion pool...) as a card: who it is about, then the list. */
export function listCard(d: { section: string; name: string; sub?: string; rows: ListRow[] }): CardData {
  const two = d.rows.length > 6;
  const rows = d.rows.slice(0, two ? 12 : 6);
  return {
    title: d.section,
    subtitle: d.sub,
    a: { name: d.name },
    rows: [],
    body: (
      <>
        <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.05, marginTop: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: two ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
            gridAutoFlow: two ? "column" : "row",
            gridTemplateRows: two ? `repeat(${Math.ceil(rows.length / 2)}, auto)` : undefined,
            gap: "0 56px",
            alignContent: "start",
          }}
        >
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, borderTop: "1px solid var(--rw-border)", padding: "10px 0", minWidth: 0 }}>
              {r.win != null && (
                <span style={{ fontSize: 24, fontWeight: 900, width: 28, color: r.win ? "var(--rw-teal)" : "var(--rw-red)" }}>
                  {r.win ? tc("short result", "W") : tc("short result", "L")}
                </span>
              )}
              {r.champ && <ChampIcon name={r.champ} size={46} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
                {r.sub && <div style={{ fontSize: 19, color: "var(--rw-sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</div>}
              </div>
              {r.value && <div style={{ fontSize: 28, fontWeight: 800, color: "var(--rw-accent)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.value}</div>}
            </div>
          ))}
        </div>
      </>
    ),
  };
}

/** The small card button in a section's header: the section's list as a 16:9 card. */
export const SectionCard: React.FC<{ section: string; name: string; sub?: string; rows: () => ListRow[] }> = ({ section, name, sub, rows }) => (
  <BroadcastCardButton compact data={() => listCard({ section, name, sub, rows: rows() })} name={`${name}-${section}`} label={tl("Overview card")} />
);
