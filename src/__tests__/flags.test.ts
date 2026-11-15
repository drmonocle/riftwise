import { describe, it, expect } from "vitest";
import { FLAG_CODES, countryCode, flagCode } from "../components/hub/CountryFlag";

const FLAG_FILES = import.meta.glob("../../public/flags/*.svg");

describe("country flags", () => {
  it("keeps FLAG_CODES in sync with public/flags/*.svg", () => {
    const onDisk = Object.keys(FLAG_FILES)
      .map((p) => p.split("/").pop()!.slice(0, -4))
      .sort();
    expect([...FLAG_CODES].sort()).toEqual(onDisk);
  });

  it("resolves canonical codes instead of obsolete ISO regions", () => {
    expect(countryCode("France")).toBe("fr");
    expect(countryCode("United Kingdom")).toBe("gb");
    expect(countryCode("Russia")).toBe("ru");
    expect(countryCode("Serbia")).toBe("rs");
    expect(countryCode("South Korea")).toBe("kr");
    expect(countryCode("fx")).toBe("fr");
    expect(countryCode("uk")).toBe("gb");
  });

  it("gates flagCode on available flag SVGs", () => {
    expect(flagCode("South Korea")).toBe("kr");
    expect(flagCode("France")).toBe("fr");
    expect(flagCode("fx")).toBe("fr");
    expect(flagCode("uk")).toBe("gb");
    expect(flagCode("Moldova")).toBeNull();
    expect(flagCode("xk")).toBeNull();
  });
});
