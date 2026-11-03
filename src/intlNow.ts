/** Whether Worlds, MSI or First Stand is on right now, from the live schedule (the front page and the live view). */
import type { Match } from "./types";

export const INTL_EVENTS: Record<string, { kind: "worlds" | "msi" | "first-stand"; name: string }> = {
  worlds: { kind: "worlds", name: "Worlds" },
  msi: { kind: "msi", name: "MSI" },
  first_stand: { kind: "first-stand", name: "First Stand" },
};

/** A Worlds, MSI or First Stand match that is on, was on in the last day or starts in the next two. */
export function intlMatchNow(schedule: Match[], now = Date.now()): Match | undefined {
  return schedule.find((m) => {
    if (!INTL_EVENTS[m.leagueSlug]) return false;
    const t = Date.parse(m.startTimeUtc);
    return m.state === "inProgress" || (t > now - 24 * 3600_000 && t < now + 48 * 3600_000);
  });
}
