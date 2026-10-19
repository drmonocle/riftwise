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

// English country names as Leaguepedia writes them -> codes: the browser's own English list, plus the names it spells
// differently ("Hong Kong SAR China", "Czechia"...)
let codesByName: Map<string, string> | null = null;
const LP_NAMES: Record<string, string> = {
  "hong kong": "HK", macau: "MO", macao: "MO", "czech republic": "CZ", turkey: "TR", "türkiye": "TR", england: "GB",
  scotland: "GB", wales: "GB", "northern ireland": "GB", "republic of ireland": "IE", "south korea": "KR", korea: "KR",
  "united states": "US", usa: "US", russia: "RU", vietnam: "VN", "ivory coast": "CI", "bosnia and herzegovina": "BA",
};
/**
 * "South Korea" -> "Corée du Sud" for a French reader (cc: the code, when the data has it); an English reader gets the
 * name as written, and a name it doesn't know stays as it is.
 */
export function localCountry(name: string | null | undefined, cc?: string | null): string {
  if (!name) return cc ? countryName(cc) : "";
  if (locale().startsWith("en")) return name;
  const key = name.trim().toLowerCase();
  if (cc) return countryName(cc) || name;
  try {
    if (!codesByName) {
      codesByName = new Map();
      const en = new Intl.DisplayNames(["en"], { type: "region" });
      for (let a = 65; a <= 90; a++)
        for (let b = 65; b <= 90; b++) {
          const cc = String.fromCharCode(a, b);
          const n = en.of(cc);
          if (n && n !== cc) codesByName.set(n.toLowerCase(), cc);
        }
    }
    const cc = LP_NAMES[key] || codesByName.get(key);
    return cc ? countryName(cc) || name : name;
  } catch {
    return name;
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
