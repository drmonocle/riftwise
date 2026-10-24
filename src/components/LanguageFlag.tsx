/**
 * The language picker in the top bar: the flag of the language on screen; clicking it lists every language
 * with its flag (English first). Picking one saves it and reloads, like the picker in Settings.
 */
import React, { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { AppSettings } from "../types";
import { LANGUAGES, currentLang, tl, type Lang } from "../i18n";
import { Flag } from "./Flags";

export const LanguageFlag: React.FC<{ onUpdateSettings: (s: Partial<AppSettings>) => void }> = ({ onUpdateSettings }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const lang = currentLang();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const pick = (code: Lang) => {
    setOpen(false);
    if (code === lang) return;
    onUpdateSettings({ language: code });
    // Every screen reads its text once, so load the new language with a quick reload
    window.setTimeout(() => window.location.reload(), 150);
  };

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center h-7 w-7 max-sm:h-9 rounded hover:bg-rw-raised transition-colors"
        aria-label={tl("Language")}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={tl("Change language")}
      >
        <Flag lang={lang} className="w-[18px] h-3 rounded-[2px]" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={tl("Language")}
          className="absolute right-0 top-full mt-1 z-50 min-w-[11rem] py-1 rounded-lg border border-rw-border bg-rw-surface shadow-xl"
        >
          {LANGUAGES.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === lang}>
              <button
                type="button"
                onClick={() => pick(l.code)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left hover:bg-rw-raised ${
                  l.code === lang ? "text-rw-accent font-semibold" : "text-rw-text"
                }`}
              >
                <Flag lang={l.code} className="w-5 h-[13px] rounded-[2px] shrink-0" />
                <span className="flex-1">{l.name}</span>
                {l.code === lang && <Check className="w-3.5 h-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
