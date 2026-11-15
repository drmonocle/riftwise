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

// Complete set of two-letter codes in public/flags/*.svg (verified by unit tests).
export const FLAG_CODES: ReadonlySet<string> = new Set([
  "ae", "al", "ar", "at", "au", "ba", "be", "bg", "bo", "br", "by", "ca", "ch", "cl", "cn", "co", "cr", "cy", "cz",
  "de", "dk", "do", "dz", "ec", "ee", "eg", "es", "eu", "fi", "fr", "gb", "gr", "gt", "hk", "hn", "hr", "hu", "id",
  "ie", "il", "in", "iq", "is", "it", "jo", "jp", "kr", "kw", "kz", "lb", "lt", "lu", "lv", "ma", "mn", "mo", "mt",
  "mx", "my", "ni", "nl", "no", "nz", "om", "pa", "pe", "ph", "pl", "pr", "pt", "py", "qa", "ro", "rs", "ru", "sa",
  "se", "sg", "si", "sk", "sv", "th", "tn", "tr", "tw", "ua", "us", "uy", "ve", "vn", "za",
]);
const FLAG_ALIASES: Record<string, string> = { uk: "gb", fx: "fr", su: "ru", yu: "rs" };
const OBSOLETE_REGIONS = new Set(["AN", "BU", "CS", "DD", "FX", "NT", "SU", "TP", "UK", "YD", "YU", "ZR"]);

// English country names as Leaguepedia writes them -> codes: the browser's own English list, plus the names it spells
// differently ("Hong Kong SAR China", "Czechia"...)
let codesByName: Map<string, string> | null = null;
const LP_NAMES: Record<string, string> = {
  "hong kong": "HK", macau: "MO", macao: "MO", "czech republic": "CZ", turkey: "TR", "türkiye": "TR", england: "GB",
  scotland: "GB", wales: "GB", "northern ireland": "GB", "united kingdom": "GB", "republic of ireland": "IE",
  "south korea": "KR", korea: "KR", "united states": "US", usa: "US", france: "FR", russia: "RU", serbia: "RS",
  vietnam: "VN", "ivory coast": "CI", "bosnia and herzegovina": "BA", moldova: "MD", "north macedonia": "MK",
};
/** Two-letter ISO country code for a Leaguepedia country name ("South Korea" -> "kr"), or null when unknown. */
export function countryCode(name: string | null | undefined, cc?: string | null): string | null {
  if (cc && /^[a-z]{2}$/i.test(cc.trim())) {
    const raw = cc.trim().toLowerCase();
    return FLAG_ALIASES[raw] || raw;
  }
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (/^[a-z]{2}$/i.test(key)) return FLAG_ALIASES[key] || key;
  try {
    if (!codesByName) {
      codesByName = new Map();
      const en = new Intl.DisplayNames(["en"], { type: "region" });
      for (let a = 65; a <= 90; a++)
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          if (OBSOLETE_REGIONS.has(code)) continue;
          const n = en.of(code);
          if (n && n !== code) {
            const nKey = n.toLowerCase();
            if (FLAG_CODES.has(code.toLowerCase()) || !codesByName.has(nKey)) codesByName.set(nKey, code);
          }
        }
    }
    const resolved = LP_NAMES[key] || codesByName.get(key);
    return resolved ? resolved.toLowerCase() : null;
  } catch {
    return LP_NAMES[key] ? LP_NAMES[key].toLowerCase() : null;
  }
}

/** Flag SVG code when public/flags/<code>.svg exists ("France" -> "fr"), else null. */
export function flagCode(name: string | null | undefined, cc?: string | null): string | null {
  const c = countryCode(name, cc);
  if (!c) return null;
  const norm = FLAG_ALIASES[c] || c;
  return FLAG_CODES.has(norm) ? norm : null;
}

/**
 * "South Korea" -> "Corée du Sud" for a French reader (cc: the code, when the data has it); an English reader gets the
 * name as written, and a name it doesn't know stays as it is.
 */
export function localCountry(name: string | null | undefined, cc?: string | null): string {
  if (!name) return cc ? countryName(cc) : "";
  if (locale().startsWith("en")) return name;
  const code = countryCode(name, cc);
  return code ? countryName(code) || name : name;
}

export const CountryFlag: React.FC<{ cc: string | null | undefined; className?: string }> = ({ cc, className = "" }) => {
  if (!cc) return <span className="text-rw-muted">–</span>;
  const code = flagCode(cc);
  const name = countryName(code || cc);
  if (!code) return <span className="text-rw-muted" title={name || cc}>–</span>;
  return (
    <img
      src={`/flags/${code}.svg`}
      alt={name}
      title={name}
      width={20}
      height={15}
      loading="lazy"
      className={`inline-block w-5 h-[15px] rounded-[2px] ring-1 ring-black/20 object-cover align-middle ${className}`}
    />
  );
};
