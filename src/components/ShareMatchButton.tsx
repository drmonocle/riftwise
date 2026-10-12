import React, { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Match } from "../types";
import { matchShareUrl } from "../platform";

/** Copies a link that opens this match in the web version (lolworlds.com/riftwatch/#match/<id>). */
export const ShareMatchButton: React.FC<{ match: Match; className?: string }> = ({ match, className = "" }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = matchShareUrl(match.matchId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // The async clipboard can refuse (e.g. the desktop window isn't focused): try the old copy
      // command before falling back to a box the user copies from by hand.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) setCopied(true);
      else window.prompt("Copy this link:", url);
    }
  };

  const label = copied ? "Link copied" : `Copy link to ${match.team1Code} vs ${match.team2Code}`;
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className={`p-1 rounded transition-colors ${
        copied ? "text-[#0ac8b9]" : "text-[#7e8e9f] hover:text-[#c8aa6e] hover:bg-[#1e282d]"
      } ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
    </button>
  );
};
