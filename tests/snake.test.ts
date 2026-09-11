import { describe, expect, it } from "vitest";
import { nextPickForSlot, overallPickFor, picksUntilSlot, roundOf, slotForOverallPick } from "@/shared/snake";

const league = { teams: 12, draftType: "snake" as const };
const linear = { teams: 12, draftType: "linear" as const };

describe("snake draft math", () => {
  it("maps round/slot to overall pick (12-team, slot 3)", () => {
    expect(overallPickFor(1, 3, league)).toBe(3);
    expect(overallPickFor(2, 3, league)).toBe(22);
    expect(overallPickFor(3, 3, league)).toBe(27);
    expect(overallPickFor(4, 3, league)).toBe(46);
  });

  it("is linear when the league is linear", () => {
    expect(overallPickFor(2, 3, linear)).toBe(15);
  });

  it("inverts back to the owning slot", () => {
    for (let overall = 1; overall <= 60; overall++) {
      const slot = slotForOverallPick(overall, league);
      expect(overallPickFor(roundOf(overall, 12), slot, league)).toBe(overall);
    }
  });

  it("finds the next pick and the distance to it", () => {
    expect(nextPickForSlot(4, 3, league)).toBe(22);
    expect(picksUntilSlot(20, 3, league)).toBe(2);
    expect(picksUntilSlot(22, 3, league)).toBe(0);
    expect(picksUntilSlot(23, 3, league)).toBe(4);
  });
});
