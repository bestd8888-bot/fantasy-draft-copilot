/**
 * Calibration of the "survives to my next pick" probability.
 *   npm run simulate
 * Predictions are bucketed and compared with how often players actually
 * survived, against opponents who draft near ADP.
 */
import { describe, it } from "vitest";
import { buildStats, recommend } from "@/domain/recommendation/RecommendationEngine";
import { slotForOverallPick, nextPickForSlot } from "@/shared/snake";
import { DEFAULT_LEAGUE, type Player } from "@/shared/types";
import { makeState } from "../tests/helpers";

import { marketPool, opponentPick, rng } from "./simlib";

describe("survival calibration", () => {
  it("predicted vs actual", () => {
    const buckets = Array.from({ length: 10 }, () => ({ n: 0, survived: 0, predicted: 0 }));
    for (let d = 0; d < 36; d++) {
      const seed = 2000 + d;
      const slot = (d % 12) + 1;
      const pool: Player[] = marketPool(seed, 15);
      const stats = buildStats(pool, 12);
      let available = [...pool];
      const oppRand = rng(seed * 31 + 7);
      const pending: { id: string; p: number; checkAt: number }[] = [];

      for (let pick = 1; pick <= 156; pick++) {
        // Resolve predictions whose horizon has arrived.
        for (const q of pending.filter((x) => x.checkAt === pick)) {
          const b = buckets[Math.min(9, Math.floor(q.p * 10))];
          b.n++;
          b.predicted += q.p;
          if (available.some((a) => a.id === q.id)) b.survived++;
        }
        const owner = slotForOverallPick(pick, DEFAULT_LEAGUE);
        let chosen: Player;
        if (owner === slot) {
          const res = recommend(
            makeState({ available, currentPick: pick, currentRound: Math.ceil(pick / 12), myDraftSlot: slot, picksUntilMe: 0 }),
            { stats, limit: 15 },
          );
          const following = nextPickForSlot(pick + 1, slot, DEFAULT_LEAGUE);
          chosen = available.find((p) => p.id === res.recommendations[0].playerId)!;
          if (following && following - pick > 1) {
            for (const rec of res.recommendations.slice(1)) pending.push({ id: rec.playerId, p: rec.survivalToNextPick, checkAt: following });
          }
        } else {
          chosen = opponentPick(available, oppRand);
        }
        available = available.filter((p) => p.id !== chosen.id);
      }
    }
    console.log("predicted bucket | n | mean predicted | actual survived");
    buckets.forEach((b, i) => {
      if (b.n) console.log(`  ${i * 10}-${i * 10 + 10}% | ${String(b.n).padStart(4)} | ${((b.predicted / b.n) * 100).toFixed(0).padStart(3)}% | ${((b.survived / b.n) * 100).toFixed(0).padStart(3)}%`);
    });
  });
});
