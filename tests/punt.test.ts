import { describe, expect, it } from "vitest";
import { buildPoolStats } from "@/domain/recommendation/zscore";
import { buildCategoryProfile, detectPunts, describeBuild, puntWeights } from "@/domain/recommendation/punt";
import { DEFAULT_LEAGUE, NO_PUNTS } from "@/shared/types";
import { makePlayer } from "./helpers";

/** Two elite bigs who cannot shoot free throws — the classic punt-FT% start. */
const bigMan = (name: string) =>
  makePlayer(name, ["PF", "C"], {
    pts: 26,
    reb: 11,
    ast: 5,
    stl: 1.1,
    blk: 1.5,
    threes: 0.6,
    tov: 3.4,
    fga: 19,
    fgPct: 0.58,
    fta: 11,
    ftPct: 0.62,
  });

const balancedGuard = (name: string) =>
  makePlayer(name, ["PG", "SG"], {
    pts: 21,
    reb: 4,
    ast: 7,
    stl: 1.4,
    blk: 0.3,
    threes: 2.8,
    tov: 2.6,
    fga: 16,
    fgPct: 0.46,
    fta: 5,
    ftPct: 0.89,
  });

const pool = [
  bigMan("Big A"),
  bigMan("Big B"),
  balancedGuard("Guard A"),
  balancedGuard("Guard B"),
  ...Array.from({ length: 40 }, (_, i) =>
    makePlayer(`Filler ${i}`, ["SF"], { pts: 12 + (i % 9), fta: 3, ftPct: 0.78, tov: 2 }, { id: `f-${i}` }),
  ),
];
const stats = buildPoolStats(pool);

function run(roster: ReturnType<typeof makePlayer>[], round: number) {
  return detectPunts({
    roster,
    available: pool,
    stats,
    league: DEFAULT_LEAGUE,
    round,
    mode: "auto",
    manualPunts: { ...NO_PUNTS },
    lockedCategories: [],
  });
}

describe("punt detection", () => {
  it("never punts in round 1", () => {
    const { strategy } = run([bigMan("Big A")], 1);
    expect(Object.values(strategy.punts).every((level) => level === "none")).toBe(true);
    expect(strategy.buildLabel).toContain("too early");
  });

  it("stays neutral in round 2 even with a lopsided start", () => {
    const { strategy } = run([bigMan("Big A"), bigMan("Big B")], 2);
    expect(Object.values(strategy.punts).every((level) => level === "none")).toBe(true);
  });

  it("suggests a soft FT% punt from round 3 with two poor FT bigs", () => {
    const { strategy } = run([bigMan("Big A"), bigMan("Big B")], 3);
    expect(strategy.punts["FT%"]).toBe("soft");
    expect(strategy.buildLabel).toContain("FT%");
  });

  it("escalates to a hard punt by round 5", () => {
    const { strategy } = run([bigMan("Big A"), bigMan("Big B"), bigMan("Big C")], 5);
    expect(strategy.punts["FT%"]).toBe("hard");
  });

  it("does not punt on a balanced roster", () => {
    const { strategy } = run([balancedGuard("Guard A"), balancedGuard("Guard B")], 5);
    expect(strategy.punts["FT%"]).toBe("none");
  });

  it("caps the number of punted categories", () => {
    const { strategy } = run([bigMan("Big A"), bigMan("Big B"), bigMan("Big C"), bigMan("Big D")], 6);
    expect(Object.values(strategy.punts).filter((l) => l !== "none").length).toBeLessThanOrEqual(2);
  });

  it("lets manual mode override auto detection", () => {
    const { strategy } = detectPunts({
      roster: [balancedGuard("Guard A"), balancedGuard("Guard B")],
      available: pool,
      stats,
      league: DEFAULT_LEAGUE,
      round: 6,
      mode: "manual",
      manualPunts: { ...NO_PUNTS, AST: "hard" },
      lockedCategories: ["AST"],
    });
    expect(strategy.mode).toBe("manual");
    expect(strategy.punts.AST).toBe("hard");
    expect(strategy.confidence).toBe(1);
  });
});

describe("punt weights", () => {
  it("zeroes hard punts and discounts soft ones", () => {
    const weights = puntWeights({ ...NO_PUNTS, "FT%": "hard", BLK: "soft" });
    expect(weights["FT%"]).toBe(0);
    expect(weights.BLK).toBeLessThan(1);
    expect(weights.PTS).toBe(1);
  });

  it("describes the build", () => {
    expect(describeBuild({ ...NO_PUNTS })).toBe("Balanced");
    expect(describeBuild({ ...NO_PUNTS, "FT%": "hard" })).toBe("Punt FT%");
  });
});

describe("category standing model", () => {
  const elite = (name: string) =>
    makePlayer(name, ["SF"], { pts: 30, reb: 10, ast: 8, stl: 2, blk: 1.5, threes: 3, tov: 2.5 });
  const solid = (name: string) =>
    makePlayer(name, ["SF"], { pts: 18, reb: 6, ast: 4, stl: 1.2, blk: 0.7, threes: 2, tov: 2 });

  function percentiles(roster: ReturnType<typeof makePlayer>[]) {
    return buildCategoryProfile(roster, pool, stats, DEFAULT_LEAGUE).percentile;
  }

  it("starts at the midpoint when nothing is drafted", () => {
    for (const value of Object.values(percentiles([]))) expect(value).toBeCloseTo(0.5, 5);
  });

  it("regresses a partial roster toward the middle instead of amplifying it", () => {
    // Same per-player quality, more slots filled -> a more committed standing.
    const two = percentiles([elite("A"), elite("B")]);
    const six = percentiles(["A", "B", "C", "D", "E", "F"].map(elite));
    expect(two.PTS).toBeGreaterThan(0.5);
    expect(two.PTS).toBeLessThan(six.PTS);

    // Two merely-good players must not read as a finished elite category.
    expect(percentiles([solid("A"), solid("B")]).PTS).toBeLessThan(0.85);
  });

  it("moves symmetrically for weaknesses", () => {
    const weak = makePlayer("Weak", ["C"], { pts: 6, reb: 3, ast: 0.5, stl: 0.3, blk: 0.2, threes: 0, tov: 1 });
    const two = percentiles([weak, weak]);
    const six = percentiles([weak, weak, weak, weak, weak, weak]);
    expect(two.PTS).toBeLessThan(0.5);
    expect(six.PTS).toBeLessThan(two.PTS);
  });
});

describe("suggest mode (default)", () => {
  it("detects the build but applies no punts to the scores", () => {
    const { strategy } = detectPunts({
      roster: [bigMan("Big A"), bigMan("Big B"), bigMan("Big C")],
      available: pool,
      stats,
      league: DEFAULT_LEAGUE,
      round: 5,
      mode: "suggest",
      manualPunts: { ...NO_PUNTS },
      lockedCategories: [],
    });
    expect(strategy.mode).toBe("suggest");
    expect(Object.values(strategy.punts).every((l) => l === "none")).toBe(true);
    expect(strategy.suggestedPunts?.["FT%"]).not.toBe("none");
    expect(strategy.buildLabel).toContain("建議");
  });
});

describe("settings migration", () => {
  it("moves the old untouched 'auto' default to 'suggest' and leaves real choices alone", async () => {
    const { migrateSettings } = await import("@/store/persistence");
    expect(migrateSettings({ strategyMode: "auto" }).strategyMode).toBe("suggest");
    expect(migrateSettings({ strategyMode: "manual" }).strategyMode).toBe("manual");
    // A v2 user who deliberately picked auto keeps it.
    expect(migrateSettings({ strategyMode: "auto", settingsVersion: 2 }).strategyMode).toBe("auto");
    expect(migrateSettings({})).toEqual({});
  });
});
