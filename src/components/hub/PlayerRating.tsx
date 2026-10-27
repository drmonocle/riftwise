/** The player rating's look (src/hub/playerRating.ts): a 0-10 badge coloured by how good the game was. */
import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { tl, locale } from "../../i18n";
import { loadRatingFile, type RatingFile } from "../../hub/playerRating";

/** hub/rating.json once it's in (null before, and with builds that don't have it) */
export function useRatingFile(): RatingFile | null {
  const [f, setF] = useState<RatingFile | null>(null);
  useEffect(() => {
    let alive = true;
    loadRatingFile().then((x) => alive && setF(x));
    return () => {
      alive = false;
    };
  }, []);
  return f;
}

const tone = (v: number) =>
  v >= 8
    ? "bg-rw-teal/15 text-rw-teal border-rw-teal/40"
    : v >= 7
      ? "bg-rw-accent/15 text-rw-accent border-rw-accent/40"
      : v >= 5.5
        ? "bg-rw-raised text-rw-text border-rw-border"
        : "bg-rw-raised text-rw-muted border-rw-border";

export const fmtRating = (v: number) => v.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A rating; `top`: the best of its game (a star). */
export const RatingBadge: React.FC<{ v: number; top?: boolean; title?: string }> = ({ v, top, title }) => (
  <span
    className={`inline-flex items-center gap-0.5 px-1.5 rounded border text-[11px] font-bold tabular-nums leading-5 ${tone(v)}`}
    title={title || (top ? tl("Top rated in this game") : tl("RiftWise rating: how well they played this game (6 is average)"))}
  >
    {top && <Star className="w-2.5 h-2.5 fill-current" />}
    {fmtRating(v)}
  </span>
);
