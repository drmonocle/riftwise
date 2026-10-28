/**
 * The floating team logos behind the page (TV, 2026-10-28: like lolworlds.com's, "as long as it doesn't add any
 * overhead"): a canvas under everything, logos rising slowly with a little sway, nudged aside by the mouse. The
 * reigning MSI and First Stand champions float a little bigger, in a ring of their own with a label.
 *
 * Kept cheap: each bubble is drawn once into its own small picture, so a frame is only a copy of each (about 20);
 * at most 30 frames a second; nothing runs while the page is hidden, and it stops for good when stop() is called.
 * src/components/TeamBubbles.tsx loads this file only once the page has settled, and not at all for reduced motion.
 */

export type Ring = "msi" | "first-stand";

export interface BubbleTeam {
  /** the logo's address (Riot's resized picture) */
  img: string;
  ring?: Ring;
  /** "MSI 2026": shown under a ringed bubble */
  label?: string;
}

const RING_COLOR: Record<Ring, string> = { msi: "#7cc8ff", "first-stand": "#ff9d4a" };
const FRAME_MS = 1000 / 30;
const SPRITE_R = 22; // regular bubbles are drawn at this radius once, then scaled down
const RINGED_R = 27;

interface Sprite {
  pic: HTMLCanvasElement;
  /** the circle's radius and centre in the picture, and the picture's size around it (a label makes it taller,
   * and wider when it's longer than the circle: "First Stand 2026" is) */
  r: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const LABEL_FONT = "bold 10px system-ui, 'Segoe UI', sans-serif";

interface Bubble {
  sprite: Sprite | null;
  team: number;
  ringed: boolean;
  r: number;
  x: number;
  baseX: number;
  y: number;
  speed: number;
  swing: number;
  swingSpeed: number;
  angle: number;
  alpha: number;
  baseAlpha: number;
}

/** Light or dark page: the bubble's body follows the theme's background. */
function darkPage(el: HTMLElement): boolean {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).backgroundColor || "");
  if (!m) return true;
  const [r, g, b] = m.slice(1).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

function makeSprite(img: HTMLImageElement, r: number, dpr: number, dark: boolean, accent: string, ring?: Ring, label?: string): Sprite {
  const pad = ring ? 4 : 2;
  const pic = document.createElement("canvas");
  let c = pic.getContext("2d")!;
  const showLabel = !!(label && ring);
  if (showLabel) c.font = LABEL_FONT;
  const labelW = showLabel ? Math.ceil(c.measureText(label!).width) + 6 : 0;
  const w = Math.max((r + pad) * 2, labelW);
  const h = (r + pad) * 2 + (showLabel ? 14 : 0);
  pic.width = Math.ceil(w * dpr);
  pic.height = Math.ceil(h * dpr);
  c = pic.getContext("2d")!; // resizing the canvas reset it
  c.scale(dpr, dpr);
  const cx = w / 2;
  const cy = r + pad;
  const body = c.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  body.addColorStop(0, dark ? "rgba(30, 48, 70, 0.92)" : "rgba(255, 255, 255, 0.95)");
  body.addColorStop(1, dark ? "rgba(8, 16, 26, 0.85)" : "rgba(225, 230, 238, 0.9)");
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = body;
  c.fill();
  c.strokeStyle = ring ? RING_COLOR[ring] : accent;
  c.globalAlpha = ring ? 1 : 0.6;
  c.lineWidth = ring ? 2.5 : 1.2;
  c.stroke();
  c.globalAlpha = 1;
  if (img.naturalWidth > 0) {
    c.save();
    c.beginPath();
    c.arc(cx, cy, r - 2, 0, Math.PI * 2);
    c.clip();
    const s = (r - 2) * 1.5;
    c.drawImage(img, cx - s / 2, cy - s / 2, s, s);
    c.restore();
  }
  // a glassy highlight on the top left
  c.beginPath();
  c.arc(cx, cy, r - 2.5, -Math.PI * 0.82, -Math.PI * 0.22);
  c.strokeStyle = dark ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.9)";
  c.lineWidth = 1.3;
  c.stroke();
  if (showLabel) {
    c.font = LABEL_FONT;
    c.textAlign = "center";
    c.textBaseline = "top";
    c.fillStyle = RING_COLOR[ring!];
    c.fillText(label!, cx, cy + r + 3);
  }
  return { pic, r, cx, cy, w, h };
}

/** Starts the bubbles on `canvas` (which fills the window behind the page); returns stop(). */
export function startBubbles(canvas: HTMLCanvasElement, teams: BubbleTeam[]): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx || !teams.length) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const host = canvas.parentElement || document.body;
  const dark = darkPage(host);
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--rw-accent").trim() || "#c8aa6e";
  let width = 0;
  let height = 0;
  const sprites: (Sprite | null)[] = teams.map(() => null);
  const imgs = teams.map((t, i) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      sprites[i] = makeSprite(img, t.ring ? RINGED_R : SPRITE_R, dpr, dark, accent, t.ring, t.label);
      for (const b of bubbles) if (b.team === i) b.sprite = sprites[i];
    };
    img.src = t.img;
    return img;
  });
  const plain = teams.map((t, i) => (t.ring ? -1 : i)).filter((i) => i >= 0);
  let bubbles: Bubble[] = [];

  const make = (team: number, anywhere: boolean): Bubble => {
    const ringed = !!teams[team].ring;
    const r = ringed ? RINGED_R : 11 + Math.random() * 11;
    // a ringed bubble stays far enough from the sides for its label (about 50 px each way) to show whole
    const edge = ringed ? Math.min(60, width / 2) : 0;
    const x = edge + Math.random() * (width - edge * 2);
    const baseAlpha = ringed ? 0.75 : 0.25 + Math.random() * 0.22;
    return {
      sprite: sprites[team], team, ringed, r, x, baseX: x,
      y: anywhere ? Math.random() * (height + 100) : height + r * 2 + Math.random() * 60,
      speed: 0.15 + Math.random() * 0.3, swing: 8 + Math.random() * 16, swingSpeed: 0.008 + Math.random() * 0.012,
      angle: Math.random() * Math.PI * 2, alpha: baseAlpha, baseAlpha,
    };
  };
  const fill = () => {
    const n = width < 768 ? 8 : width < 1200 ? 14 : 20;
    bubbles = [];
    teams.forEach((t, i) => t.ring && bubbles.push(make(i, true)));
    for (let k = 0; k < n && plain.length; k++) bubbles.push(make(plain[Math.floor(Math.random() * plain.length)], true));
  };
  const size = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  fill();

  let mx = -1000;
  let my = -1000;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse") {
      mx = e.clientX;
      my = e.clientY;
    }
  };
  const onLeave = () => {
    mx = my = -1000;
  };
  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      size();
      fill();
    }, 200);
  };

  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - last < FRAME_MS) return;
    const step = last ? Math.min((now - last) / 16.7, 4) : 1;
    last = now;
    ctx.clearRect(0, 0, width, height);
    for (const b of bubbles) {
      b.y -= b.speed * step;
      b.angle += b.swingSpeed * step;
      b.x = b.baseX + Math.sin(b.angle) * b.swing;
      const dx = b.x - mx;
      const dy = b.y - my;
      const d = Math.hypot(dx, dy);
      if (d < 85 && d > 0) {
        const f = ((85 - d) / 85) * 3 * step;
        b.baseX += (dx / d) * f;
        b.y += (dy / d) * f;
        b.alpha = Math.min(0.9, b.baseAlpha + 0.3);
      } else b.alpha += (b.baseAlpha - b.alpha) * 0.05 * step;
      if (b.y < -b.r * 3) {
        // off the top: back in at the bottom, the ringed ones as themselves and the rest as any team
        Object.assign(b, make(b.ringed ? b.team : plain[Math.floor(Math.random() * plain.length)] ?? b.team, false));
        continue;
      }
      const s = b.sprite;
      if (!s) continue;
      const k = b.r / s.r;
      ctx.globalAlpha = b.alpha;
      ctx.drawImage(s.pic, b.x - s.cx * k, b.y - s.cy * k, s.w * k, s.h * k);
    }
    ctx.globalAlpha = 1;
  };
  const run = () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (document.visibilityState !== "hidden") raf = requestAnimationFrame(frame);
  };
  const onVisible = () => run();
  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisible);
  run();
  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(resizeTimer);
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisible);
    for (const img of imgs) img.onload = null;
    ctx.clearRect(0, 0, width, height);
  };
}
