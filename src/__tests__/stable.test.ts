import { describe, expect, it } from "vitest";
import { sortValue } from "../components/STable";

// sortValue only reads a cell's text and data-sort, so a plain object stands in for the table cell
const cell = (text: string, sort?: string) => ({ textContent: text, dataset: sort === undefined ? {} : { sort } }) as unknown as HTMLTableCellElement;

describe("sortable table values", () => {
  it("reads numbers the way the site shows them", () => {
    expect(sortValue(cell("1,630"))).toBe(1630);
    expect(sortValue(cell("65%"))).toBe(65);
    expect(sortValue(cell("+12"))).toBe(12);
    expect(sortValue(cell("−3"))).toBe(-3);
    expect(sortValue(cell("3-1"))).toBeCloseTo(3 + 0.75 * 0.999);
    expect(sortValue(cell("#4"))).toBe(4);
    expect(sortValue(cell("$1,250,000"))).toBe(1250000);
    expect(sortValue(cell("12.5k"))).toBe(12500);
    expect(sortValue(cell("2013–2026"))).toBe(2013);
  });

  it("records sort by wins, then win rate", () => {
    const v = (t: string) => sortValue(cell(t)) as number;
    expect(v("18-0")).toBeGreaterThan(v("18-12"));
    expect(v("19-30")).toBeGreaterThan(v("18-0"));
  });

  it("game times, dates, text and blanks", () => {
    expect(sortValue(cell("31:45"))).toBe(31 * 60 + 45);
    expect(sortValue(cell("Oct 28", "2025-10-28"))).toBe("2025-10-28");
    expect(sortValue(cell("2", "7"))).toBe(7);
    expect(sortValue(cell("LoL Champions Korea"))).toBe("lol champions korea");
    expect(sortValue(cell("2024-11-02"))).toBe(Date.UTC(2024, 10, 2));
    expect(sortValue(cell("<1%"))).toBe(0.5);
    expect(sortValue(cell("–"))).toBeNull();
    expect(sortValue(cell(""))).toBeNull();
  });
});

import { localPlain } from "../components/STable";
import { setDictionaryForTests } from "../i18n";
describe("numbers written the reader's way", () => {
  it("German: 1.234 is a thousand, 3.69 a KDA, prize money in euros style", () => {
    setDictionaryForTests("de", {});
    expect(localPlain("1.234")).toBe("1234");
    expect(localPlain("1.234.567")).toBe("1234567");
    expect(localPlain("3.69")).toBe("3.69");
    expect(localPlain("100.000 $")).toBe("100000");
    expect(localPlain("3,5")).toBe("3.5");
  });
  it("Brazil and English", () => {
    setDictionaryForTests("pt-BR", {});
    expect(localPlain("US$ 100.000")).toBe("100000");
    setDictionaryForTests("en", {});
    expect(localPlain("$1,250,000")).toBe("1250000");
    expect(localPlain("+218")).toBe("218");
  });
  it("French spaces", () => {
    setDictionaryForTests("fr", {});
    expect(localPlain("1\u202f234,5")).toBe("1234.5");
    expect(localPlain("100\u202f000\u00a0$US")).toBe("100000");
  });
});
