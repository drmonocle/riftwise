/** "How we count": where the numbers come from, what each stat means, known gaps, and how to report a wrong number. */
import React from "react";
import { tl } from "../../i18n";
import { HubLink, Section, usePageTitle } from "./ui";

export const REPORT_EMAIL = "kyle.l.hoover@gmail.com";

/** mailto link for "Report a wrong stat", with the page it's about filled in. */
export const reportUrl = (page: string) =>
  `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent("RiftWise stats: wrong number")}&body=${encodeURIComponent(
    `Page: ${page}\n\nWhat looks wrong:\n\nWhat it should be (and where you saw it):\n`,
  )}`;

const Term: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => (
  <div className="grid sm:grid-cols-[9rem_1fr] gap-x-3 gap-y-0.5 py-1.5 border-t border-[#1e282d] first:border-t-0">
    <dt className="font-bold text-[#f0e6d2]">{t}</dt>
    <dd className="text-[#9bb3c9]">{children}</dd>
  </div>
);

export const AboutPage: React.FC<{ onOpenUrl?: (url: string) => void }> = ({ onOpenUrl }) => {
  usePageTitle(tl("How we count"));
  const report = reportUrl(typeof window !== "undefined" ? window.location.href : "");
  const openReport = (e: React.MouseEvent) => {
    if (onOpenUrl) {
      e.preventDefault();
      onOpenUrl(report);
    }
  };
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      <Section title={tl("Where the numbers come from")}>
        <ul className="list-disc pl-4 space-y-1 text-[#9bb3c9]">
          <li>{tl("Leaguepedia (lol.fandom.com): every pro game since 2011, with scoreboards, drafts, rosters, results and prize money. Shared under the CC BY-SA 3.0 license.")}</li>
          <li>{tl("Riot's esports schedule: live scores and upcoming matches.")}</li>
          <li>{tl("The stats are rebuilt whenever new games come in: results show up within a few hours of a series, full game stats (KDA, gold, items) overnight. The newest games can be missing details until then.")}</li>
        </ul>
      </Section>
      <Section title={tl("What counts")}>
        <ul className="list-disc pl-4 space-y-1 text-[#9bb3c9]">
          <li>{tl("Every league, international event, qualifier and academy league Leaguepedia lists. All-Star and show matches aren't counted.")}</li>
          <li>{tl("Titles: finals of Worlds, MSI, First Stand and other big international events, plus the playoffs, championships and cups of the main leagues.")}</li>
          <li>{tl("Teams that changed names (SK Telecom T1 to T1) count as one team, as on Leaguepedia.")}</li>
          <li>{tl("Per-game, per-minute and share numbers use games with a full scoreboard only.")}</li>
        </ul>
      </Section>
      <Section title={tl("The stats")}>
        <dl>
          <Term t="KDA">{tl("(kills + assists) ÷ deaths, with deaths counted as at least 1.")}</Term>
          <Term t="KP">{tl("Kill participation: (kills + assists) ÷ the team's kills.")}</Term>
          <Term t={`${tl("CS/m")} · ${tl("GPM")} · ${tl("DPM")}`}>{tl("Creep score, gold and damage to champions per minute of game time.")}</Term>
          <Term t={`${tl("DMG%")} · ${tl("Gold%")} · ${tl("VS%")}`}>{tl("A player's share of the team's damage to champions, gold and vision score.")}</Term>
          <Term t={tl("GD/m")}>{tl("The team's gold lead at the end of the game, per minute played.")}</Term>
          <Term t={`${tl("DRA%")} · ${tl("Baron%")}`}>{tl("The share of all dragons (or barons) in a team's games that the team took.")}</Term>
          <Term t={tl("Presence")}>{tl("The share of games where a champion was picked or banned.")}</Term>
          <Term t={tl("Blind%")}>{tl("How often a champion was picked before the enemy laner was known (games where the draft order is known).")}</Term>
          <Term t="B1">{tl("The first pick of the draft (blue side).")}</Term>
          <Term t={tl("League ranks")}>
            {tl("A player against the same role in the same league and year (all splits and playoffs) with at least 30% of the most games played; a team against the league's teams.")}
          </Term>
          <Term t={tl("Averages")}>
            {tl("Rates are worked out from totals (all gold ÷ all minutes), so longer games weigh more. Sites that average game by game can show slightly different numbers.")}
          </Term>
        </dl>
      </Section>
      <Section title={tl("Not shown yet")}>
        <ul className="list-disc pl-4 space-y-1 text-[#9bb3c9]">
          <li>{tl("Gold, CS and XP difference at 15 minutes, first blood, first tower, wards placed and cleared, solo kills: coming once the game timelines are in our database.")}</li>
          <li>{tl("Pentakills are fully recorded from 2018 on; Player of the Game mostly from 2018 on; prize money only where it's listed in US dollars.")}</li>
        </ul>
      </Section>
      <Section title={tl("Spoiler mode")}>
        <p className="text-[#9bb3c9]">{tl("With spoiler mode on, results from the last two weeks stay hidden until you press Reveal.")}</p>
      </Section>
      <Section title={tl("Found a wrong number?")}>
        <p className="text-[#9bb3c9]">
          {tl("Tell us which page and what you expected; we check every report.")}{" "}
          <a href={report} onClick={openReport} className="text-[#0ac8b9] hover:underline font-semibold">
            {tl("Report a wrong stat")}
          </a>
        </p>
      </Section>
      <Section title={tl("Use the data")}>
        <p className="text-[#9bb3c9]">
          {tl("Free to use, also in videos, articles and broadcasts. Please credit RiftWise (lolworlds.com/riftwise) and Leaguepedia.")}{" "}
          <HubLink to={{ kind: "data" }} className="text-[#0ac8b9] hover:underline font-semibold">
            {tl("Data downloads")}
          </HubLink>
        </p>
      </Section>
    </div>
  );
};
