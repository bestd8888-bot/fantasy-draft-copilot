import { describe, expect, it } from "vitest";
import { fallbackPlayerId, normalizeName, parsePositions } from "@/shared/names";

describe("normalizeName", () => {
  it("folds accents", () => {
    expect(normalizeName("Nikola Jokić")).toBe("nikola jokic");
    expect(normalizeName("Nikola Jokic")).toBe("nikola jokic");
  });

  it("drops generational suffixes with or without a period", () => {
    expect(normalizeName("Jaren Jackson Jr.")).toBe("jaren jackson");
    expect(normalizeName("Jaren Jackson Jr")).toBe("jaren jackson");
    expect(normalizeName("Gary Trent Jr.")).toBe("gary trent");
    expect(normalizeName("Tim Hardaway III")).toBe("tim hardaway");
  });

  it("handles apostrophes and hyphens", () => {
    expect(normalizeName("De'Aaron Fox")).toBe("deaaron fox");
    expect(normalizeName("Karl-Anthony Towns")).toBe("karl anthony towns");
    expect(normalizeName("Shai Gilgeous-Alexander")).toBe("shai gilgeous alexander");
  });

  it("keeps a two-word name even when the last word is suffix-like", () => {
    expect(normalizeName("Kenneth Jr")).toBe("kenneth jr");
  });

  it("builds a stable fallback id", () => {
    expect(fallbackPlayerId("Nikola Jokić", "DEN")).toBe("nikola jokic|den");
  });
});

describe("parsePositions", () => {
  it("expands combo tokens", () => {
    expect(parsePositions("PG|SG")).toEqual(["PG", "SG"]);
    expect(parsePositions("G")).toEqual(["PG", "SG"]);
    expect(parsePositions("F")).toEqual(["SF", "PF"]);
    expect(parsePositions("PF/C")).toEqual(["PF", "C"]);
  });

  it("dedupes and ignores junk", () => {
    expect(parsePositions("PG, G, ???")).toEqual(["PG", "SG"]);
    expect(parsePositions(undefined)).toEqual([]);
  });
});
