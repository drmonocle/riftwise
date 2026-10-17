/**
 * "Match prep" for an upcoming match: finds both teams in the stats hub and opens their prep page
 * (storylines, form, head-to-head, drafts, lanes). Hidden for TBD teams; disappears if a team isn't in the stats.
 */
import React, { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Match } from "../types";
import { tl } from "../i18n";
import { findHubTeam, loadHubIndex } from "../hub/data";
import { navigateHub } from "../hub/route";

const isTbd = (code: string, name: string) => !code || /^tbd$/i.test(code) || /^tbd$/i.test(name || "");

export const MatchPrepButton: React.FC<{ match: Match; compact?: boolean; onDone?: () => void }> = ({ match, compact, onDone }) => {
  const [state, setState] = useState<"" | "busy" | "missing">("");
  if (state === "missing" || isTbd(match.team1Code, match.team1Name) || isTbd(match.team2Code, match.team2Name)) return null;
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    setState("busy");
    loadHubIndex()
      .then((index) => {
        const a = findHubTeam(index, match.team1Name, match.team1Code);
        const b = findHubTeam(index, match.team2Name, match.team2Code);
        if (!a || !b) return setState("missing");
        setState("");
        navigateHub({ kind: "prep", a, b });
        onDone?.();
      })
      .catch(() => setState("missing"));
  };
  const label = tl("Match prep");
  return compact ? (
    <button
      type="button"
      onClick={open}
      disabled={state === "busy"}
      title={tl("Match prep: form, drafts, lanes and storylines")}
      aria-label={label}
      className="p-1 rounded text-rw-sub hover:text-rw-accent hover:bg-rw-bg disabled:opacity-50 shrink-0"
    >
      <ClipboardList className="w-3.5 h-3.5" />
    </button>
  ) : (
    <button
      type="button"
      onClick={open}
      disabled={state === "busy"}
      title={tl("Match prep: form, drafts, lanes and storylines")}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60 disabled:opacity-50"
    >
      <ClipboardList className="w-3.5 h-3.5" />
      {label}
    </button>
  );
};
