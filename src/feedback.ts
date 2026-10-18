/** Where feedback and "wrong stat" reports go: an email to Kyle, with a short form filled in. */
import { tl } from "./i18n";
import { APP_VERSION } from "./version";

export const FEEDBACK_EMAIL = "kyle.l.hoover@gmail.com";

/** The footer's "Feedback": ideas and fixes, with the RP code thank-you. */
export const feedbackUrl = (page: string): string =>
  `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(tl("RiftWise feedback"))}&body=${encodeURIComponent(
    [
      tl("Fill this out with anything you'd like to see added or fixed. If I think it's a good enough fix or feature to add, I'll send you an RP code as a thank-you."),
      "",
      tl("What would you like added or fixed?"),
      "",
      "",
      tl("Where in RiftWise (a page or a link)?"),
      "",
      "",
      `RiftWise ${APP_VERSION} · ${page}`,
    ].join("\n"),
  )}`;
