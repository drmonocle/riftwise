/** A team's country as a small flag (public/flags/<code>.svg, flag-icons, MIT) with the name in the reader's language. */
import React from "react";
import { locale } from "../../i18n";

let names: Intl.DisplayNames | null = null;
/** "kr" -> "South Korea" / "대한민국" / "Corée du Sud"... ("" when unknown) */
export function countryName(cc: string | null | undefined): string {
  if (!cc) return "";
  try {
    names = names && names.resolvedOptions().locale === locale() ? names : new Intl.DisplayNames([locale()], { type: "region" });
    return names.of(cc.toUpperCase()) || cc.toUpperCase();
  } catch {
    return cc.toUpperCase();
  }
}

export const CountryFlag: React.FC<{ cc: string | null | undefined; className?: string }> = ({ cc, className = "" }) => {
  if (!cc) return <span className="text-rw-muted">–</span>;
  const name = countryName(cc);
  return (
    <img
      src={`/flags/${cc}.svg`}
      alt={name}
      title={name}
      width={20}
      height={15}
      loading="lazy"
      className={`inline-block w-5 h-[15px] rounded-[2px] ring-1 ring-black/20 object-cover align-middle ${className}`}
    />
  );
};
