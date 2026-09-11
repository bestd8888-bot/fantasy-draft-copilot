import { describe, expect, it } from "vitest";
import { buildPoolStats, rawImpacts, zScores } from "@/domain/recommendation/zscore";
import { makePlayer } from "./helpers";

const pool = [
  makePlayer("High Scorer", ["SG"], { pts: 28, tov: 3.5, fga: 20, fgPct: 0.46, fta: 7, ftPct: 0.9 }),
  makePlayer("Low Scorer", ["SF"], { pts: 9, tov: 1.1, fga: 7, fgPct: 0.45, fta: 1.5, ftPct: 0.75 }),
  makePlayer("Mid Scorer", ["PF"], { pts: 17, tov: 2.0, fga: 13, fgPct: 0.48, fta: 3, ftPct: 0.8 }),
  makePlayer("Rim Runner", ["C"], { pts: 14, reb: 11, blk: 2.4, tov: 1.8, fga: 9, fgPct: 0.64, fta: 6, ftPct: 0.55, threes: 0 }),
  ...Array.from({ length: 20 }, (_, i) =>
    makePlayer(`Filler ${i}`, ["SF"], { pts: 10 + i * 0.5, tov: 1.5 + i * 0.05 }, { id: `filler-${i}` }),
  ),
];

const stats = buildPoolStats(pool);

describe("z-score", () => {
  it("rewards counting stats", () => {
    const high = zScores(pool[0].projection!, stats);
    const low = zScores(pool[1].projection!, stats);
    expect(high.PTS).toBeGreaterThan(low.PTS);
  });

  it("inverts turnovers so fewer is better", () => {
    const high = zScores(pool[0].projection!, stats); // 3.5 TO
    const low = zScores(pool[1].projection!, stats); // 1.1 TO
    expect(low.TO).toBeGreaterThan(high.TO);
    expect(high.TO).toBeLessThan(0);
  });

  it("weights percentage categories by volume", () => {
    const lowVolumeElite = { ...pool[1].projection!, ftPct: 0.95, fta: 1 };
    const highVolumeElite = { ...pool[1].projection!, ftPct: 0.95, fta: 9 };
    const raw = rawImpacts(lowVolumeElite, stats.leagueFgPct, stats.leagueFtPct);
    const rawBig = rawImpacts(highVolumeElite, stats.leagueFgPct, stats.leagueFtPct);
    expect(rawBig["FT%"]).toBeGreaterThan(raw["FT%"]);
    expect(zScores(highVolumeElite, stats)["FT%"]).toBeGreaterThan(zScores(lowVolumeElite, stats)["FT%"]);
  });

  it("punishes a high-volume poor free-throw shooter", () => {
    const z = zScores(pool[3].projection!, stats); // 55% on 6 attempts
    expect(z["FT%"]).toBeLessThan(0);
    expect(z["FG%"]).toBeGreaterThan(0);
  });
});
