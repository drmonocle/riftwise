/**
 * "Copy image" / "Save image" for a stats section: a PNG of exactly what's shown, with a small RiftWise footer,
 * ready to paste into X, Discord or a broadcast graphic. Champion and item pictures come from Riot's Data Dragon,
 * which allows this (it sends Access-Control-Allow-Origin: *).
 */
import React, { useState } from "react";
import { ImageDown, Images } from "lucide-react";
import { toBlob } from "html-to-image";
import { tl } from "../../i18n";
import { IS_WEB } from "../../platform";

export async function capture(node: HTMLElement): Promise<Blob | null> {
  node.classList.add("rw-capturing");
  try {
    return await toBlob(node, {
      // sharp, but a whole page stays under the browsers' picture size limits
      pixelRatio: Math.max(1, Math.min(2, 16000 / Math.max(1, node.scrollHeight))),
      // the picture's background is the theme's card colour (html-to-image needs a real colour, not a variable)
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--rw-surface").trim() || "#0a1428",
      skipFonts: true,
      // leave the buttons themselves out of the picture
      filter: (n) => !(n instanceof HTMLElement && n.dataset.nocapture === "1"),
    });
  } finally {
    node.classList.remove("rw-capturing");
  }
}

/** Shown only inside the picture. */
export const CaptureFooter: React.FC = () => (
  <div className="rw-capture-only items-center justify-between gap-3 pt-2 mt-1 border-t border-rw-border text-[10px] text-rw-muted">
    <span className="font-bold text-rw-accent">RiftWise Pro Stats</span>
    <span>riftwise.gg · {new Date().toISOString().slice(0, 10)}</span>
  </div>
);

/**
 * "Copy as image" for a whole page (Match prep): the button with its label, plus a save button on the web.
 * The page's buttons (data-nocapture) are left out, and rw-capture-only parts (title, date) show in the picture.
 */
export const CopyPageImage: React.FC<{ target: React.RefObject<HTMLElement | null>; name: string }> = ({ target, name }) => {
  const [state, setState] = useState<"" | "busy" | "copied" | "failed">("");
  const flash = (s: typeof state) => {
    setState(s);
    if (s !== "busy") setTimeout(() => setState(""), 2200);
  };
  const run = async (save: boolean) => {
    if (!target.current) return;
    flash("busy");
    try {
      const blob = await capture(target.current);
      if (!blob) throw new Error("no image");
      if (save) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name.replace(/[^\w.-]+/g, "-").slice(0, 80) || "riftwise"}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        flash("");
      } else {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        flash("copied");
      }
    } catch {
      flash("failed");
    }
  };
  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => run(false)}
        disabled={state === "busy"}
        className="flex items-center gap-1 min-h-8 px-1.5 rounded text-rw-teal hover:underline disabled:opacity-50"
        title={tl("Copy this whole page as a picture, to paste into Discord, X or a broadcast graphic")}
      >
        <Images className="w-3.5 h-3.5" />
        {state === "busy" ? tl("Making the image…") : state === "copied" ? tl("Copied") : tl("Copy as an image")}
      </button>
      {IS_WEB && (
        <button type="button" onClick={() => run(true)} disabled={state === "busy"} className="text-rw-teal hover:text-rw-text disabled:opacity-50" title={tl("Save as an image")} aria-label={tl("Save as an image")}>
          <ImageDown className="w-3.5 h-3.5" />
        </button>
      )}
      {state === "failed" && <span className="text-[10px] text-rw-red">{tl("Couldn't make the image")}</span>}
    </span>
  );
};

export const ShareButtons: React.FC<{ target: React.RefObject<HTMLElement | null>; name: string }> = ({ target, name }) => {
  const [state, setState] = useState<"" | "busy" | "copied" | "failed">("");
  const flash = (s: typeof state) => {
    setState(s);
    if (s !== "busy") setTimeout(() => setState(""), 1800);
  };
  const copy = async () => {
    if (!target.current) return;
    flash("busy");
    try {
      const blob = await capture(target.current);
      if (!blob) throw new Error("no image");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("copied");
    } catch {
      flash("failed");
    }
  };
  const save = async () => {
    if (!target.current) return;
    flash("busy");
    try {
      const blob = await capture(target.current);
      if (!blob) throw new Error("no image");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^\w.-]+/g, "-").slice(0, 80) || "riftwise"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash("");
    } catch {
      flash("failed");
    }
  };
  // bigger on touch screens (a finger needs ~32px), compact with a mouse
  const btn = "p-1 pointer-coarse:min-h-8 pointer-coarse:min-w-8 flex items-center justify-center rounded border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-line disabled:opacity-50";
  return (
    <span data-nocapture="1" className="flex items-center gap-1 shrink-0">
      {state === "copied" && <span className="text-[10px] text-rw-teal">{tl("Copied")}</span>}
      {state === "failed" && <span className="text-[10px] text-rw-red">{tl("Couldn't make the image")}</span>}
      <button type="button" onClick={copy} disabled={state === "busy"} className={btn} title={tl("Copy as an image")} aria-label={tl("Copy as an image")}>
        <Images className="w-3.5 h-3.5" />
      </button>
      {IS_WEB && (
        <button type="button" onClick={save} disabled={state === "busy"} className={btn} title={tl("Save as an image")} aria-label={tl("Save as an image")}>
          <ImageDown className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
};
