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
  <div className="grid sm:grid-cols-[9rem_1fr] gap-x-3 gap-y-0.5 py-1.5 border-t border-rw-border first:border-t-0">
    <dt className="font-bold text-rw-text">{t}</dt>
    <dd className="text-rw-sub">{children}</dd>
  </div>
);

export const AboutPage: React.FC<{ onOpenUrl?: (url: string) => void }> = ({ onOpenUrl }) => {
  usePageTitle(tl("How we count"));
  const report = reportUrl(typeof window !== "undefined" ? window.location.href : "");
  const OE_URL = "https://oracleselixir.com/";
  const openOe = (e: React.MouseEvent) => {
    if (onOpenUrl) {
      e.preventDefault();
      onOpenUrl(OE_URL);
    }
  };
  const openReport = (e: React.MouseEvent) => {
    if (onOpenUrl) {
      e.preventDefault();
      onOpenUrl(report);
    }
  };
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      <Section title={tl("Where the numbers come from")}>
        <ul className="list-disc pl-4 space-y-1 text-rw-sub">
          <li>{tl("Leaguepedia (lol.fandom.com): every pro game since 2011, with scoreboards, drafts, rosters, results and prize money. Shared under the CC BY-SA 3.0 license.")}</li>
          <li>
            <a href="https://oracleselixir.com/" onClick={openOe} target="_blank" rel="noopener noreferrer" className="text-rw-teal hover:underline font-semibold">
              Oracle's Elixir
            </a>{" "}
            {tl("(oracleselixir.com) by Tim Sevenhuysen: the early game of most pro games since 2014 (gold, CS and XP leads at 10, 15 and 20 minutes, first blood, first tower, turret plates, void grubs, wards). Free for non-commercial use with credit; thank you, Tim.")}
          </li>
          <li>{tl("Riot's esports schedule: live scores and upcoming matches.")}</li>
          <li>{tl("The stats are rebuilt whenever new games come in: results show up within a few hours of a series, full game stats (KDA, gold, items) overnight. The newest games can be missing details until then.")}</li>
        </ul>
      </Section>
      <Section title={tl("What counts")}>
        <ul className="list-disc pl-4 space-y-1 text-rw-sub">
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
          <Term t="GD@15 · CSD@15 · XPD@15">
            {tl("Gold, CS and experience lead at 15 minutes: a player against the opponent in the same role, a team against the other team. Also shown at 10 and 20 minutes.")}
          </Term>
          <Term t={tl("Ahead at 15")}>{tl("How often a team was ahead in gold at 15 minutes, and its win rate when ahead or behind then.")}</Term>
          <Term t={`${tl("FB%")} · ${tl("FT%")}`}>
            {tl("First blood and first tower: how often a team got it. For a player: how often they had the kill or an assist on first blood.")}
          </Term>
          <Term t={tl("DMG% − Gold%")}>{tl("Damage share minus gold share. Above zero: more damage than the gold they got would suggest.")}</Term>
          <Term t="CKPM">{tl("Kills per minute by both teams together: how bloody a team's games are.")}</Term>
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
      <Section title={tl("Game rating")}>
        <p className="text-rw-sub mb-2">
          {tl("Every pro game gets a rating from 0 to 100 for how good it was to watch. It adds up eight things:")}
        </p>
        <dl>
          <Term t={tl("Action")}>{tl("Up to 22.5 points: kills per minute, with extra credit when teams fight over Barons and Elder Dragons.")}</Term>
          <Term t={tl("How close")}>
            {tl("Up to 13.5 points: kills, gold and objectives close to even, games still level at 20 or 25 minutes, and wins by the team with fewer kills.")}
          </Term>
          <Term t={tl("Length")}>{tl("Up to 9 points: full marks from about 28 to 44 minutes; longer games keep them when they stay eventful.")}</Term>
          <Term t={tl("Base races")}>{tl("Up to 4.5 points: both teams breaking inhibitors, Baron and Elder fights, pentakills.")}</Term>
          <Term t={tl("Stakes")}>
            {tl("Up to 40 points: a Worlds final counts most (40), then Worlds semifinals (37), the MSI final (35.5), Worlds quarterfinals (34) and the big leagues' finals (31). Academy and second-tier leagues count least.")}
          </Term>
          <Term t={tl("Series drama")}>
            {tl("Up to 15 points: a deciding Game 5 (most of all after coming back from 0–2), must-win games, and a little less for the first games of a 3–0 sweep.")}
          </Term>
          <Term t={tl("Rivalries")}>{tl("Up to 4.5 points: famous clashes like T1 vs KT, LCK vs LPL knockouts and the best teams of each region meeting.")}</Term>
          <Term t={tl("Comebacks")}>{tl("Up to 5 points: winning from far behind in gold, with less gold, or after losing inhibitors.")}</Term>
        </dl>
        <p className="text-rw-sub mt-2">
          {tl("Tiers: S 90+, A 80+, B 70+, C 55+, D below. Only about 1 game in 2,000 reaches S.")} {tl("A series counts its best game most, then its best three games and all of them; a 3-2 gets a little more, a sweep a little less.")}{" "}
          <HubLink to={{ kind: "best" }} className="text-rw-teal hover:underline font-semibold">
            {tl("Best games")}
          </HubLink>
        </p>
      </Section>
      <Section title={tl("Not shown yet")}>
        <ul className="list-disc pl-4 space-y-1 text-rw-sub">
          <li>{tl("Solo kills: not in our data yet.")}</li>
          <li>{tl("Early-game numbers (leads at 15, first blood, plates, wards) only cover games Oracle's Elixir has a timeline for: most league and international games, fewer small or old events.")}</li>
          <li>{tl("Turret plates work differently since the 2026 patches (many more per game), so plate counts from before and after don't compare.")}</li>
          <li>{tl("Pentakills are fully recorded from 2018 on; Player of the Game mostly from 2018 on; prize money only where it's listed in US dollars.")}</li>
        </ul>
      </Section>
      <Section title={tl("Spoiler mode")}>
        <p className="text-rw-sub">{tl("With spoiler mode on, results from the last two weeks stay hidden until you press Reveal.")}</p>
      </Section>
      <Section title={tl("Found a wrong number?")}>
        <p className="text-rw-sub">
          {tl("Tell us which page and what you expected; we check every report.")}{" "}
          <a href={report} onClick={openReport} className="text-rw-teal hover:underline font-semibold">
            {tl("Report a wrong stat")}
          </a>
        </p>
      </Section>
      <Section title={tl("Use the data")}>
        <p className="text-rw-sub">
          {tl("Free to use, also in videos, articles and broadcasts. Please credit RiftWise (riftwise.gg) and Leaguepedia, and Oracle's Elixir for early-game numbers.")}{" "}
          <HubLink to={{ kind: "data" }} className="text-rw-teal hover:underline font-semibold">
            {tl("Data downloads")}
          </HubLink>
        </p>
      </Section>
    </div>
  );
};
