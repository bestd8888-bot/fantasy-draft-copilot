import { describe, expect, it } from "vitest";
import { buildStats, recommend } from "@/domain/recommendation/RecommendationEngine";
import { buildDemoPool } from "@/domain/player/demoPool";
import { EMPTY_OVERRIDES, type Player } from "@/shared/types";
import { makePlayer, makeState } from "./helpers";

const demo = buildDemoPool(140);

function stateWith(available: Player[], roster: Player[] = [], overrides = {}) {
  return makeState({ available, myRoster: roster, ...overrides });
}

describe("recommendation engine", () => {
  it("ranks the whole board and returns a scored, ordered list", () => {
    const result = recommend(stateWith(demo));
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].rank).toBe(1);
    expect(result.recommendations[0].score).toBeGreaterThanOrEqual(result.recommendations[1].score);
    expect(result.recommendations[0].score).toBeLessThanOrEqual(99);
  });

  it("AT-01: never recommends a drafted player", () => {
    const taken = demo[0];
    const state = stateWith(
      demo.filter((p) => p.id !== taken.id),
      [],
      {
        drafted: [
          { overall: 1, round: 1, pickInRound: 1, isMine: false, playerId: taken.id, playerName: taken.name },
        ],
        currentPick: 2,
      },
    );
    const result = recommend(state);
    expect(result.recommendations.some((r) => r.playerId === taken.id)).toBe(false);
  });

  it("respects blacklist and pin overrides", () => {
    const base = recommend(stateWith(demo));
    const leader = base.recommendations[0].playerId;
    const withBlacklist = recommend(stateWith(demo), {
      overrides: { ...EMPTY_OVERRIDES, blacklisted: [leader] },
    });
    expect(withBlacklist.recommendations.some((r) => r.playerId === leader)).toBe(false);

    const underdog = base.recommendations[5].playerId;
    const withPin = recommend(stateWith(demo), { overrides: { ...EMPTY_OVERRIDES, pinned: [underdog] } });
    expect(withPin.recommendations[0].playerId).toBe(underdog);
  });

  it("scores are absolute, not a ladder anchored at the leader", () => {
    const strong = recommend(stateWith(demo, [], { currentPick: 1, currentRound: 1 }));
    // A thin late board must not award the same top score as a rich early one.
    const thin = recommend(stateWith(demo.slice(-12), [], { currentPick: 130, currentRound: 11 }));

    expect(strong.recommendations[0].score).toBeGreaterThan(thin.recommendations[0].score);
    expect(strong.recommendations[0].score).toBeLessThanOrEqual(100);
    expect(thin.recommendations[0].score).toBeGreaterThan(0);
  });

  it("pinning reorders without changing any score", () => {
    const base = recommend(stateWith(demo));
    const underdog = base.recommendations[5];
    const withPin = recommend(stateWith(demo), { overrides: { ...EMPTY_OVERRIDES, pinned: [underdog.playerId] } });

    const pinnedRec = withPin.recommendations.find((r) => r.playerId === underdog.playerId)!;
    expect(pinnedRec.rank).toBe(1);
    // The score describes the player, not the user's preference.
    expect(pinnedRec.score).toBe(underdog.score);
    expect(pinnedRec.baseValue).toBeCloseTo(underdog.baseValue, 10);

    // Everyone else keeps their score too, just shifted down one rank.
    for (const other of base.recommendations.filter((r) => r.playerId !== underdog.playerId)) {
      const after = withPin.recommendations.find((r) => r.playerId === other.playerId);
      if (after) expect(after.score).toBe(other.score);
    }
  });

  it("Case B: rewards a guard when the roster is all bigs", () => {
    const bigs = Array.from({ length: 5 }, (_, i) =>
      makePlayer(`Big ${i}`, ["PF", "C"], { reb: 10, ast: 1.5, blk: 1.8, threes: 0.3 }, { id: `big-${i}` }),
    );
    const guard = makePlayer("Fit Guard", ["PG", "SG"], { ast: 8, stl: 1.8, threes: 2.6, reb: 3 }, { id: "fit-guard" });
    const anotherCenter = makePlayer(
      "Another Center",
      ["C"],
      { ast: 1.4, stl: 0.5, threes: 0.1, reb: 10, blk: 1.9 },
      { id: "another-c" },
    );

    const board = [guard, anotherCenter, ...demo.slice(0, 60)];
    const result = recommend(stateWith(board, bigs, { currentRound: 6, currentPick: 63 }), { limit: 62 });
    const guardRec = result.recommendations.find((r) => r.playerId === "fit-guard")!;
    const centerRec = result.recommendations.find((r) => r.playerId === "another-c");

    expect(guardRec).toBeDefined();
    expect(guardRec.rosterFit).toBeGreaterThan(centerRec?.rosterFit ?? 0);
  });

  it("Case C: an ADP-30 player at pick 60 gets a value bonus", () => {
    const value = makePlayer("Value Guy", ["SF"], {}, { id: "value-guy", adp: 30 });
    const fair = makePlayer("Fair Guy", ["SF"], {}, { id: "fair-guy", adp: 60 });
    const result = recommend(stateWith([value, fair, ...demo.slice(0, 50)], [], { currentPick: 60, currentRound: 5 }), {
      limit: 60,
    });
    const valueRec = result.recommendations.find((r) => r.playerId === "value-guy")!;
    const fairRec = result.recommendations.find((r) => r.playerId === "fair-guy")!;
    expect(valueRec.adpValue).toBeGreaterThan(fairRec.adpValue);
    expect(valueRec.reachLabel).toBe("Great Value");
  });

  it("Case D: survival probability separates safe waits from must-takes", () => {
    const state = stateWith(demo, [], { currentPick: 20, picksUntilMe: 10, nextMyPick: 30, currentRound: 2 });
    const result = recommend(state, { limit: 40 });
    const top = result.recommendations[0];
    const deep = result.recommendations[result.recommendations.length - 1];
    expect(top.survivalToNextPick).toBeLessThan(deep.survivalToNextPick);
    expect(top.survivalToNextPick).toBeLessThan(0.5);
  });

  it("on the clock, survival is measured to the following pick (see onclock.test.ts)", () => {
    // Slot 3 picking at 3 next picks at 22: 18 other managers pick in between.
    const result = recommend(stateWith(demo, [], { currentPick: 3, picksUntilMe: 0, myDraftSlot: 3 }), { limit: 40 });
    const survivals = result.recommendations.map((r) => r.survivalToNextPick);
    expect(survivals.some((s) => s > 0)).toBe(true);
  });

  it("falls back to ranking order when no projections exist", () => {
    const rankOnly: Player[] = demo.slice(0, 30).map((p, i) => ({
      ...p,
      projection: undefined,
      rank: i + 1,
    }));
    const result = recommend(stateWith(rankOnly));
    expect(result.recommendations[0].playerId).toBe(rankOnly[0].id);
    expect(result.recommendations[0].categoryNeed).toBe(0.5);
  });

  it("keeps hard-punted categories out of the reason and the need model", () => {
    const state = stateWith(demo, demo.slice(0, 3), { currentRound: 6, currentPick: 63 });
    state.strategy = { mode: "manual", punts: { ...state.strategy.punts, "FT%": "hard" }, lockedCategories: ["FT%"], confidence: 1 };
    const result = recommend(state);
    expect(result.strategy.punts["FT%"]).toBe("hard");
    expect(result.recommendations.every((r) => !r.improves.includes("FT%") && !r.hurts.includes("FT%"))).toBe(true);
  });

  it("performance: ranks 1000 players well under 500ms", () => {
    const pool = buildDemoPool(1000, 7);
    const stats = buildStats(pool, 12);
    const started = performance.now();
    const result = recommend(stateWith(pool), { stats });
    const elapsed = performance.now() - started;
    expect(result.recommendations.length).toBe(12);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("player notes and market momentum", () => {
  const board = () => demo.slice(0, 40);

  it("a note nudges a player without overriding real value gaps", () => {
    const base = recommend(stateWith(board()), { limit: 40 });
    const midfield = base.recommendations[20];
    const leader = base.recommendations[0];

    const withNote = recommend(stateWith(board()), {
      limit: 40,
      notes: {
        [midfield.playerId]: {
          playerId: midfield.playerId,
          name: midfield.playerName,
          adjustment: 0.8,
          updatedAt: 0,
        },
      },
    });

    const moved = withNote.recommendations.find((r) => r.playerId === midfield.playerId)!;
    expect(moved.rank).toBeLessThan(midfield.rank); // promoted
    expect(moved.score).toBeGreaterThan(midfield.score);
    // ...but a bounded nudge must not vault a mid-board player over the leader.
    expect(withNote.recommendations[0].playerId).toBe(leader.playerId);
    expect(moved.noteAdjustment).toBe(0.8);
  });

  it("a negative note pushes a player down and says why", () => {
    const base = recommend(stateWith(board()), { limit: 40 });
    const leader = base.recommendations[0];

    const withNote = recommend(stateWith(board()), {
      limit: 40,
      notes: {
        [leader.playerId]: { playerId: leader.playerId, name: leader.playerName, adjustment: -0.8, updatedAt: 0 },
      },
    });
    const demoted = withNote.recommendations.find((r) => r.playerId === leader.playerId)!;
    expect(demoted.score).toBeLessThan(leader.score);
    expect(demoted.shortReason).toContain("看衰");
  });

  it("a risk flag raises injury risk on top of the projection", () => {
    const target = recommend(stateWith(board()), { limit: 40 }).recommendations[0];
    const flagged = recommend(stateWith(board()), {
      limit: 40,
      notes: {
        [target.playerId]: {
          playerId: target.playerId,
          name: target.playerName,
          adjustment: -0.2,
          risk: true,
          updatedAt: 0,
        },
      },
    }).recommendations.find((r) => r.playerId === target.playerId)!;

    expect(flagged.injuryRisk).toBeGreaterThan(target.injuryRisk);
  });

  it("reads market momentum from the season rank vs recent ADP gap", () => {
    // Season rank 60 but the last week's drafts take him at 30: rising fast.
    const rising = makePlayer("Rising Guy", ["SF"], {}, { id: "rising", rank: 60, adp: 30 });
    const falling = makePlayer("Falling Guy", ["SF"], {}, { id: "falling", rank: 30, adp: 60 });
    const result = recommend(stateWith([rising, falling, ...board()], [], { currentPick: 45 }), { limit: 45 });

    const up = result.recommendations.find((r) => r.playerId === "rising")!;
    const down = result.recommendations.find((r) => r.playerId === "falling")!;

    expect(up.marketMomentum).toBeGreaterThan(0.3);
    expect(down.marketMomentum).toBeLessThan(-0.3);
    // Momentum feeds upside, not raw value.
    expect(up.upside).toBeGreaterThan(down.upside);
    expect(up.shortReason).toContain("市場正在追捧");
  });
});
