import { describe, expect, it } from "vitest";
import { recommend } from "@/domain/recommendation/RecommendationEngine";
import { buildDemoPool } from "@/domain/player/demoPool";
import { makeState } from "./helpers";

const pool = buildDemoPool(120);

describe("on the clock", () => {
  it("at a snake turn (picks 60 and 61), everyone survives to the next pick", () => {
    // Slot 12 in a 12-team snake picks 60 then 61 — nobody picks in between.
    const state = makeState({
      available: pool.slice(50),
      currentRound: 5,
      currentPick: 60,
      myDraftSlot: 12,
      picksUntilMe: 0,
    });
    const result = recommend(state);
    for (const rec of result.recommendations) expect(rec.survivalToNextPick).toBeGreaterThan(0.9);
  });

  it("mid-round, survival is measured to the FOLLOWING pick, not forced to 0", () => {
    // Slot 7 picks 55, then 66: ten other managers pick in between.
    const state = makeState({
      available: pool.slice(40),
      currentRound: 5,
      currentPick: 55,
      myDraftSlot: 7,
      picksUntilMe: 0,
    });
    const result = recommend(state, { limit: 40 });
    const survivals = result.recommendations.map((r) => r.survivalToNextPick);
    expect(Math.max(...survivals)).toBeGreaterThan(0.3); // deep players can wait
    expect(Math.min(...survivals)).toBeLessThan(0.5); // the top of the board cannot
  });

  it("flags back-to-back picks at a snake turn", () => {
    // Slot 12 picks 60 and 61; slot 7 does not.
    const turn = recommend(makeState({ available: pool, currentRound: 5, currentPick: 60, myDraftSlot: 12, picksUntilMe: 0 }));
    const mid = recommend(makeState({ available: pool, currentRound: 5, currentPick: 55, myDraftSlot: 7, picksUntilMe: 0 }));
    expect(turn.backToBack).toBe(true);
    expect(mid.backToBack).toBe(false);
  });
});
