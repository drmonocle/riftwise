/** About RiftWise (riftwise.gg/about): who makes it, why, and what it promises. In Kyle's own words. */
import React from "react";
import { tl, tk } from "../../i18n";
import { card, HubLink, Section, usePageTitle } from "./ui";

const LINKS: [string, string][] = [
  ["https://drmonocle.com/", tk("My website")],
  ["https://www.twitch.tv/LoLWorldChampionship", tk("24/7 stream on Twitch")],
  ["https://www.youtube.com/@LoLWorldChampionships", tk("YouTube")],
  ["https://x.com/LoLWorldChamp", tk("X (Twitter)")],
  ["https://discord.gg/UCRhtZzVhF", tk("Discord")],
  ["https://ko-fi.com/monocle", tk("Support on Ko-fi")],
];

export const AboutMePage: React.FC<{ onOpenUrl?: (url: string) => void }> = ({ onOpenUrl }) => {
  usePageTitle(tl("About RiftWise"));
  // the desktop app opens links in the browser
  const ext = (url: string) => ({
    href: url,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: (e: React.MouseEvent) => {
      if (onOpenUrl) {
        e.preventDefault();
        onOpenUrl(url);
      }
    },
  });
  const link = "text-rw-teal hover:underline font-semibold";
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      <div className={card}>
        <div className="flex flex-col sm:flex-row gap-4">
          <img
            src="/kyle-hoover.jpg"
            alt={tl("Kyle with the LTA Championship trophy")}
            width={640}
            height={800}
            className="w-44 sm:w-52 h-auto rounded-xl self-center sm:self-start shrink-0"
          />
          <div className="space-y-2 min-w-0">
            <h1 className="text-lg font-bold text-rw-text">{tl("Hi, I'm Kyle")}</h1>
            <p className="text-rw-sub">
              {tl("I'm Kyle Hoover, also known as Dr. Monocle (in game: Dr Monocle#DOC), from Columbus, Ohio. I made RiftWise.")}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {LINKS.map(([url, label]) => (
                <a
                  key={url}
                  {...ext(url)}
                  className="px-2.5 py-1 rounded-lg border border-rw-border bg-rw-bg text-rw-text hover:border-rw-accent/60 hover:text-rw-accent"
                >
                  {tl(label)}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Section title={tl("How I got into League")}>
        <p className="text-rw-sub">
          {tl(
            "I started playing League around 2010, in high school. My friend Josh got me into it (another Kyle had shown it to him). I'd gotten my first PC a few months earlier and was playing a ton of Team Fortress 2, but once I tried League I fell in love with it. The earliest champion releases I remember are Leona and Yorick.",
          )}
        </p>
      </Section>

      <Section title={tl("Esports")}>
        <div className="space-y-2 text-rw-sub">
          <p>
            {tl(
              "I've watched esports nonstop since the start, and I'm an NA fan through and through. I was a huge TSM fan: I still have the gear, I still want them back in League, and yes, I've asked them on YouTube. These days I mostly root for players, like Inspired and Massu, and FlyQuest is my team. My dream is to see an NA team win Worlds.",
            )}
          </p>
          <p>
            {tl(
              "The play that lives in my head rent-free: Faker on Galio in the deciding game of the Worlds 2024 final against BLG in London, ulting onto Zeus to save him and holding BLG off until the rest of T1 arrived.",
            )}{" "}
            <HubLink to={{ kind: "match", slug: "worlds-2024-main-event-finals-1", game: 5 }} className={link}>
              {tl("See that game")}
            </HubLink>
          </p>
        </div>
      </Section>

      <Section title={tl("What else I do")}>
        <p className="text-rw-sub">
          {tl(
            "I run the 24/7 rebroadcast channel of Worlds, MSI and First Stand on Twitch, and I'm slowly remastering every international event in higher quality. My day job is in IT for local government.",
          )}
        </p>
      </Section>

      <Section title={tl("Why I made RiftWise")}>
        <div className="space-y-2 text-rw-sub">
          <p>
            {tl(
              "My favorite part of any broadcast is the analyst desk: the pre-shows and the segments between games. The stats tools they use can be a little slow, so I wanted to give back to the community with a faster stats site, and maybe help make analyst desks even better.",
            )}{" "}
            {tl("Shout-out to the desk crew, like Kobe, Jatt, Raz and Emily: you're the best.")}
          </p>
          <p>
            {tl(
              "Most LoL stats sites feel a little slow to me, mostly because they're bogged down with ads. dpm.lol, who have sponsored my stream for about two years (good people), put out a companion app that runs phenomenally, and I thought: if they can make something that good, why can't I? RiftWise is that try: fast, free, and made by a fan for analysts, casters, coaches and anyone who loves pro League.",
            )}
          </p>
        </div>
      </Section>

      <Section title={tl("My promises")}>
        <ul className="list-disc pl-4 space-y-1 text-rw-sub">
          <li>{tl("Free, always. No paid tiers, ever.")}</li>
          <li>{tl("No ads, and I'll never sell your data.")}</li>
          <li>{tl("No account needed. Accounts are optional, only to sync your settings between devices.")}</li>
          <li>
            {tl(
              "RiftWise runs on a server in my house. If it ever costs more than I can cover, I'll ask for donations, like Wikipedia does. At most there could be a small sponsor image with a plain link and no tracking, never front and center.",
            )}
          </li>
        </ul>
      </Section>

      <Section title={tl("How it's made")}>
        <div className="space-y-2 text-rw-sub">
          <p>{tl("I build RiftWise with the help of AI: Gemini (through Google's Antigravity) and Claude helped write parts of the site and brainstorm features.")}</p>
          <p>
            {tl("Stats come from Leaguepedia and Oracle's Elixir, and live scores from Riot's esports schedule.")}{" "}
            {tl("Player photos come from Riot and Leaguepedia.")}{" "}
            <HubLink to={{ kind: "about" }} className={link}>
              {tl("How we count")}
            </HubLink>
          </p>
        </div>
      </Section>
    </div>
  );
};
