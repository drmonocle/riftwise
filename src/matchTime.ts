import { tl, locale } from "./i18n";

/** A match's start in the reader's words: "Today at 5:00 PM", "Tomorrow at 9:00 AM", "Nov 2 at 4:00 PM". */
export function formatMatchTime(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();

    const timeStr = d.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
    if (isToday) return tl("Today at {time}", { time: timeStr });

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const isTomorrow =
      d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear();

    if (isTomorrow) return tl("Tomorrow at {time}", { time: timeStr });

    return tl("{date} at {time}", { date: d.toLocaleDateString(locale(), { month: "short", day: "numeric" }), time: timeStr });
  } catch {
    return iso;
  }
}
