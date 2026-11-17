/** What's new & roadmap (/stats/changelog): recent analyst/caster tools, data milestones and feedback link. */
import React from "react";
import { tl, tk } from "../../i18n";
import { feedbackUrl } from "../../feedback";
import { hubShareUrl } from "../../hub/route";
import { JumpBar } from "./PageTabs";
import { HubLink, Section, usePageTitle } from "./ui";

export const ChangelogPage: React.FC<{ onOpenUrl?: (url: string) => void }> = ({ onOpenUrl }) => {
  usePageTitle(tl("What's new"));
  const sendIdea = feedbackUrl(hubShareUrl({ kind: "changelog" }));
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      <p className="text-rw-sub">{tl("New tools, stats and broadcast features on RiftWise.")}</p>
      <JumpBar
        items={[
          { id: "tools", label: tk("Analyst & broadcast tools") },
          { id: "coverage", label: tk("Global data & ratings") },
          { id: "roadmap", label: tk("Roadmap & feedback") },
        ]}
      />
      <Section title={tl("Analyst & broadcast tools")} id="tools">
        <ul className="list-disc pl-4 space-y-2 text-rw-sub">
          <li>
            <strong className="text-rw-text">{tl("Roster builder")}</strong> —{" "}
            {tl("Choose any five pro players to check composite form, Gold% and DMG% fit, Fearless flex depth and teammate history.")}{" "}
            <HubLink to={{ kind: "gm" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Roster builder")} →
            </HubLink>
          </li>
          <li>
            <strong className="text-rw-text">{tl("Roster moves")} &amp; {tl("Expiring contracts")}</strong> —{" "}
            {tl("Track recent club transfers with player ratings and filter active Leaguepedia contract end dates by league, role and year.")}{" "}
            <HubLink to={{ kind: "moves" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Roster moves")} →
            </HubLink>
          </li>
          <li>
            <strong className="text-rw-text">{tl("OBS stream overlay")}</strong> —{" "}
            {tl("Add live matchup cards, individual player spotlights or 5-player lineup bars to OBS with the interactive URL builder.")}{" "}
            <a href="/overlay?studio=1" target="_blank" rel="noopener noreferrer" className="text-rw-accent hover:underline font-semibold">
              {tl("OBS stream overlay")} →
            </a>
          </li>
          <li>
            <strong className="text-rw-text">{tl("Tier list")} &amp; {tl("Counters")}</strong> —{" "}
            {tl("Drag champions, players or teams into S–D tiers (with blind resume mode), and inspect lane matchups with GD@15, CSD@15 and XPD@15.")}{" "}
            <HubLink to={{ kind: "tiers" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Tier list")} →
            </HubLink>{" "}
            ·{" "}
            <HubLink to={{ kind: "counters" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Counters")} →
            </HubLink>
          </li>
          <li>
            <strong className="text-rw-text">{tl("Match prep")} &amp; {tl("Draft board")}</strong> —{" "}
            {tl("Pre-series scouting packets, 16:9 PNG broadcast cards and Fearless draft simulations for every matchup.")}{" "}
            <HubLink to={{ kind: "prep" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Match prep")} →
            </HubLink>{" "}
            ·{" "}
            <HubLink to={{ kind: "draft" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Draft board")} →
            </HubLink>
          </li>
        </ul>
      </Section>

      <Section title={tl("Global data & ratings")} id="coverage">
        <ul className="list-disc pl-4 space-y-1.5 text-rw-sub">
          <li>
            {tl("Cross-region Elo power rankings on one global scale, updating after every pro match.")}{" "}
            <HubLink to={{ kind: "rankings" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Power rankings")} →
            </HubLink>
          </li>
          <li>
            {tl("RiftWise 0–10 player ratings and MEPI 0–100 classic game scores from Season 1 through the present.")}{" "}
            <HubLink to={{ kind: "best" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Best games")} →
            </HubLink>
          </li>
          <li>
            {tl("Every game and scoreboard available to query or export as clean CSV and JSON files.")}{" "}
            <HubLink to={{ kind: "finder" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Game finder")} →
            </HubLink>{" "}
            ·{" "}
            <HubLink to={{ kind: "data" }} className="text-rw-accent hover:underline font-semibold">
              {tl("Data downloads")} →
            </HubLink>
          </li>
        </ul>
      </Section>

      <Section title={tl("Roadmap & feedback")} id="roadmap">
        <p className="text-rw-sub">
          {tl("Coming up next: split-to-split roster strength deltas, automated international seed simulations, and richer patch-by-patch item win curves.")}{" "}
          <a
            href={sendIdea}
            onClick={(e) => {
              if (onOpenUrl) {
                e.preventDefault();
                onOpenUrl(sendIdea);
              }
            }}
            className="text-rw-accent hover:underline font-semibold"
          >
            {tl("Send feedback")} →
          </a>
        </p>
      </Section>
    </div>
  );
};
