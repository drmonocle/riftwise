/**
 * "Overview" next to Match prep on the Live and Schedule tabs: finds both teams in the stats hub and opens a quick
 * overview of the match (ranks, chances, form, head-to-head, storylines, a 16:9 card) on top of the page. The
 * overview itself loads only when opened. Hidden for TBD teams; disappears if a team isn't in the stats.
 */
import React, { Suspense, useState } from "react";
import { Gauge } from "lucide-react";
import { Match } from "../types";
import { tl } from "../i18n";
import { findHubTeam, loadHubIndex } from "../hub/data";
import { navigateHub } from "../hub/route";
import { lazyPart } from "../lazyPart";

const MatchOverview = lazyPart(() => import("./hub/MatchOverview").then((m) => m.MatchOverview));

const isTbd = (code: string, name: string) => !code || /^tbd$/i.test(code) || /^tbd$/i.test(name || "");

export const MatchOverviewButton: React.FC<{ match: Match; compact?: boolean; onDone?: () => void }> = ({ match, compact, onDone }) => {
  const [state, setState] = useState<"" | "busy" | "missing">("");
  const [open, setOpen] = useState<{ a: string; b: string } | null>(null);
  if (state === "missing" || isTbd(match.team1Code, match.team1Name) || isTbd(match.team2Code, match.team2Name)) return null;
  const start = (e: React.MouseEvent) => {
    e.stopPropagation();
    setState("busy");
    loadHubIndex()
      .then((index) => {
        const a = findHubTeam(index, match.team1Name, match.team1Code);
        const b = findHubTeam(index, match.team2Name, match.team2Code);
        if (!a || !b) return setState("missing");
        setState("");
        setOpen({ a, b });
      })
      .catch(() => setState("missing"));
  };
  const label = tl("Overview");
  const title = tl("Match overview: chances, form, head-to-head and a card to share");
  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={start}
          disabled={state === "busy"}
          title={title}
          aria-label={label}
          className="p-1 max-sm:min-w-9 max-sm:min-h-9 pointer-coarse:min-w-9 pointer-coarse:min-h-9 flex items-center justify-center rounded text-rw-sub hover:text-rw-accent hover:bg-rw-bg disabled:opacity-50 shrink-0"
        >
          <Gauge className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={state === "busy"}
          title={title}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rw-border bg-rw-bg text-[11px] text-rw-accent hover:border-rw-accent/60 disabled:opacity-50"
        >
          <Gauge className="w-3.5 h-3.5" />
          {label}
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <MatchOverview
            match={match}
            a={open.a}
            b={open.b}
            onClose={() => setOpen(null)}
            onPrep={() => {
              setOpen(null);
              navigateHub({ kind: "prep", a: open.a, b: open.b });
              onDone?.();
            }}
          />
        </Suspense>
      )}
    </>
  );
};
