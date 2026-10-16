/**
 * "Copy image" / "Save image" for a stats section: a PNG of exactly what's shown, with a small RiftWatch footer,
 * ready to paste into X, Discord or a broadcast graphic. Champion and item pictures come from Riot's Data Dragon,
 * which allows this (it sends Access-Control-Allow-Origin: *).
 */
import React, { useState } from "react";
import { ImageDown, Images } from "lucide-react";
import { toBlob } from "html-to-image";
import { tl } from "../../i18n";
import { IS_WEB } from "../../platform";

async function capture(node: HTMLElement): Promise<Blob | null> {
  node.classList.add("rw-capturing");
  try {
    return await toBlob(node, {
      pixelRatio: 2,
      backgroundColor: "#0a1428",
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
  <div className="rw-capture-only items-center justify-between gap-3 pt-2 mt-1 border-t border-[#1e282d] text-[10px] text-[#7e8e9f]">
    <span className="font-bold text-[#c8aa6e]">RiftWatch Pro Stats</span>
    <span>lolworlds.com/riftwatch · {new Date().toISOString().slice(0, 10)}</span>
  </div>
);

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
      a.download = `${name.replace(/[^\w.-]+/g, "-").slice(0, 80) || "riftwatch"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash("");
    } catch {
      flash("failed");
    }
  };
  const btn = "p-1 rounded border border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2] hover:border-[#2c3c44] disabled:opacity-50";
  return (
    <span data-nocapture="1" className="flex items-center gap-1 shrink-0">
      {state === "copied" && <span className="text-[10px] text-[#0ac8b9]">{tl("Copied")}</span>}
      {state === "failed" && <span className="text-[10px] text-[#e84057]">{tl("Couldn't make the image")}</span>}
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
