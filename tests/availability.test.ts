import { describe, expect, it } from "vitest";
import { availabilityFactor, buildPoolStats, zScores } from "@/domain/recommendation/zscore";
import { injuryRiskScore } from "@/domain/recommendation/scoring";
import { recommend } from "@/domain/recommendation/RecommendationEngine";
import { buildDemoPool } from "@/domain/player/demoPool";
import { makePlayer, makeState } from "./helpers";

/** Same per-game production, different availability. */
const line = { pts: 24, reb: 8, ast: 5, stl: 1.3, blk: 0.8, threes: 2.2, tov: 2.4, fga: 17, fgPct: 0.49, fta: 5, ftPct: 0.8 };
const ironMan = makePlayer("Iron Man", ["SF"], { ...line, gp: 78 }, { id: "iron", adp: 20, rank: 20 });
const fragile = makePlayer("Fragile Star", ["SF"], { ...line, gp: 45 }, { id: "fragile", adp: 20, rank: 20 });

const filler = Array.from({ length: 40 }, (_, i) =>
  makePlayer(`Filler ${i}`, ["SF"], { pts: 10 + i * 0.4, gp: 70 + (i % 8) }, { id: `f${i}`, adp: 30 + i, rank: 30 + i }),
);
const pool = [ironMan, fragile, ...filler];

describe("games played as a first-class input", () => {
  it("used to be divided away entirely — per-game lines are identical", () => {
    const perGameOnly = buildPoolStats(pool, undefined, 0);
    expect(zScores(ironMan.projection!, perGameOnly).PTS).toBeCloseTo(
      zScores(fragile.projection!, perGameOnly).PTS,
      10,
    );
  });

  it("separates them once availability counts", () => {
    const stats = buildPoolStats(pool, undefined, 0.5);
    const iron = zScores(ironMan.projection!, stats);
    const hurt = zScores(fragile.projection!, stats);

    expect(iron.PTS).toBeGreaterThan(hurt.PTS);
    // 45 of ~78 games at weight 0.5 keeps roughly 76% of the impact.
    expect(availabilityFactor(fragile.projection!, stats)).toBeCloseTo(Math.sqrt(45 / stats.referenceGp), 2);
  });

  it("also shrinks the categories a player HURTS, because they play less", () => {
    const stats = buildPoolStats(pool, undefined, 0.5);
    // TO is inverted, so a high-turnover player has negative TO z.
    const hog = makePlayer("Turnover Hog", ["PG"], { ...line, tov: 5, gp: 78 }, { id: "hog" });
    const hogHurt = makePlayer("Hurt Hog", ["PG"], { ...line, tov: 5, gp: 40 }, { id: "hurt-hog" });
    expect(zScores(hogHurt.projection!, stats).TO).toBeGreaterThan(zScores(hog.projection!, stats).TO);
  });

  it("scales linearly at weight 1 and not at all at weight 0", () => {
    const total = buildPoolStats(pool, undefined, 1);
    expect(availabilityFactor(fragile.projection!, total)).toBeCloseTo(45 / total.referenceGp, 3);
    expect(availabilityFactor(fragile.projection!, buildPoolStats(pool, undefined, 0))).toBe(1);
  });

  it("ranks the durable player ahead of the fragile one at equal production", () => {
    const state = makeState({ available: pool, currentPick: 20, picksUntilMe: 5 });
    const result = recommend(state, { availabilityWeight: 0.5, limit: 40 });
    const iron = result.recommendations.find((r) => r.playerId === "iron")!;
    const hurt = result.recommendations.find((r) => r.playerId === "fragile")!;

    expect(iron.rank).toBeLessThan(hurt.rank);
    expect(iron.score).toBeGreaterThan(hurt.score);
    expect(hurt.projectedGames).toBe(45);
    expect(hurt.shortReason).toContain("45 場");
  });

  it("does not charge missed games twice", () => {
    // A 66-game forecast is ordinary; with availability priced into the value it
    // must not also read as elevated injury risk.
    const ordinary = makePlayer("Ordinary", ["SF"], { ...line, gp: 66 }, { id: "ord" });
    expect(injuryRiskScore(ordinary, 0.5)).toBe(0);
    // A current designation still counts, always.
    expect(injuryRiskScore({ ...ordinary, injuryStatus: "OUT" }, 0.5)).toBeGreaterThan(0.5);
  });

  it("keeps the whole pipeline stable across the weight range", () => {
    const demo = buildDemoPool(120);
    for (const weight of [0, 0.5, 1]) {
      const result = recommend(makeState({ available: demo }), { availabilityWeight: weight });
      expect(result.recommendations).toHaveLength(12);
      expect(result.recommendations[0].score).toBeGreaterThan(0);
    }
  });
});
