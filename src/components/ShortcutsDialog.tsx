/**
 * The keyboard shortcuts, listed: "?" opens it anywhere (not while typing), and so does the footer link. The web
 * version has only the ones that don't take over the browser's own (Reload, Save Page, switching tabs); the desktop
 * app adds those.
 */
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Keyboard, X } from "lucide-react";
import { tl } from "../i18n";
import { IS_DESKTOP } from "../platform";

const Key: React.FC<{ k: string }> = ({ k }) => (
  <kbd className="inline-block min-w-6 px-1.5 py-0.5 rounded border border-rw-border bg-rw-bg text-rw-text font-num text-[11px] text-center">{k}</kbd>
);

export const ShortcutsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onClose]);

  const rows: [string[], string][] = [
    [["/"], tl("Search teams, players, tournaments and champions")],
    [["?"], tl("Show this list")],
    [["Esc"], tl("Close a window or menu")],
    [["Tab"], tl("Move between links and buttons (the first Tab offers a jump to the page)")],
  ];
  if (IS_DESKTOP) {
    rows.push(
      [["F5", "Ctrl+R"], tl("Refresh scores and schedules")],
      [["Ctrl+1", "…", "Ctrl+7"], tl("Switch tabs, in their order")],
      [["Ctrl+S"], tl("Spoiler mode on or off")],
    );
  }
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rw-shortcuts-title"
        className="w-full max-w-md bg-rw-surface border border-rw-border rounded-xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="rw-shortcuts-title" className="font-head text-sm font-semibold text-rw-text flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-rw-teal" />
            {tl("Keyboard shortcuts")}
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="p-1 rounded text-rw-muted hover:text-rw-text" aria-label={tl("Close")}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <dl className="text-xs divide-y divide-rw-border">
          {rows.map(([keys, what]) => (
            <div key={what} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-rw-sub">{what}</dt>
              <dd className="flex items-center gap-1 shrink-0">
                {keys.map((k) => (k === "…" ? <span key={k} className="text-rw-muted">…</span> : <Key key={k} k={k} />))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
};
