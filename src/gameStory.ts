/**
 * A finished game's story in a few sentences, from Riot's live-stats frames sampled about once a minute
 * (liveGame.ts fetchTimeline): who drew first blood and took the first tower, the biggest gold lead, a Baron that
 * turned the game, and how the winner got there. No AI: rules over the numbers, the same facts every time, in the
 * reader's language. Minutes are the sample's ("by minute 5"), not the exact second.
 */
import { tl } from "./i18n";
import type { TimelinePoint } from "./liveGame";

const k = (n: number) => `${(Math.abs(n) / 1000).toFixed(1)}k`;
const minute = (t: number) => Math.max(1, Math.round(t));

/** `left` / `right`: team codes; blueIsLeft: which of them played blue (the timeline's leads are blue minus red). */
export function gameStory(points: TimelinePoint[], left: string, right: string, blueIsLeft: boolean): string[] {
  if (points.length < 5) return [];
  const side = (p: TimelinePoint, ofLeft: boolean) => (ofLeft === blueIsLeft ? p.blue : p.red);
  const leadL = (p: TimelinePoint) => (blueIsLeft ? p.lead : -p.lead);
  const name = (isLeft: boolean) => (isLeft ? left : right);
  const out: string[] = [];

  // first blood and first tower: the first sample where a team has one
  for (const [stat, text] of [
    ["k", (team: string, m: number) => tl("{team} drew first blood (by minute {m}).", { team, m })],
    ["tw", (team: string, m: number) => tl("{team} took the first tower (by minute {m}).", { team, m })],
  ] as const) {
    const p = points.find((x) => side(x, true)[stat] + side(x, false)[stat] > 0);
    if (p) {
      const l = side(p, true)[stat] > 0;
      if (l !== side(p, false)[stat] > 0) out.push(text(name(l), minute(p.t)));
    }
  }

  // the winner, only when the end agrees with itself: ahead in gold, towers and inhibitors (a base race or a
  // backdoor can end a game against the gold, and then the story doesn't guess)
  const last = points[points.length - 1];
  const g = leadL(last), tw = side(last, true).tw - side(last, false).tw, inh = side(last, true).inh - side(last, false).inh;
  const winL = g !== 0 && Math.sign(g) === Math.sign(tw) && Math.sign(g) === Math.sign(inh) ? g > 0 : null;
  const sign = winL ? 1 : -1;
  const worst = winL == null ? null : points.reduce((a, b) => (sign * leadL(b) < sign * leadL(a) ? b : a));
  const comeback = worst != null && sign * leadL(worst) <= -2000;

  // the biggest lead either way (a comeback says it better)
  const top = points.reduce((a, b) => (Math.abs(leadL(b)) > Math.abs(leadL(a)) ? b : a));
  if (!comeback && Math.abs(leadL(top)) >= 1500) {
    out.push(tl("{team}'s biggest lead: {gold} gold at minute {m}.", { team: name(leadL(top) > 0), gold: k(leadL(top)), m: minute(top.t) }));
  }

  // a Baron that turned the game: taken while behind (or level), and ahead two samples later
  for (let i = 1; i < points.length; i++) {
    for (const isLeft of [true, false]) {
      if (side(points[i], isLeft).b <= side(points[i - 1], isLeft).b) continue;
      const before = (isLeft ? 1 : -1) * leadL(points[i - 1]);
      const after = (isLeft ? 1 : -1) * leadL(points[Math.min(i + 2, points.length - 1)]);
      if (before <= 500 && after - before >= 2000) {
        out.push(tl("The Baron by minute {m} turned it: {team} went from {before} to {after} gold.", {
          m: minute(points[i].t), team: name(isLeft), before: `${before < 0 ? "−" : "+"}${k(before)}`, after: `${after < 0 ? "−" : "+"}${k(after)}`,
        }));
      }
    }
  }

  if (winL != null && worst) {
    if (comeback) {
      out.push(tl("{team} came back from {gold} gold behind (minute {m}) to win.", { team: name(winL), gold: k(leadL(worst)), m: minute(worst.t) }));
    } else {
      // from when the winner stayed ahead for good
      let from = points.length - 1;
      while (from > 0 && sign * leadL(points[from - 1]) > 0) from--;
      out.push(
        from <= 1
          ? tl("{team} led from the start and never gave it back.", { team: name(winL) })
          : tl("{team} took the lead for good at minute {m}.", { team: name(winL), m: minute(points[from].t) }),
      );
    }
  }
  return out;
}
