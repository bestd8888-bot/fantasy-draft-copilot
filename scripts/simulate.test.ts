/**
 * Draft-strategy simulation. Not part of the regular suite (run explicitly):
 *   npx vitest run scripts/simulate.test.ts
 *
 * 12-team snake, 13 rounds. Opponents draft near ADP. The market's ADP is the
 * pool's true value plus noise, which is what makes ADP and projections disagree
 * in real leagues. Every strategy faces the same seeds, slots and opponents.
 * Metric: expected H2H category wins per week (out of 9) against the 11 rivals.
 */
import { describe, it } from "vitest";
import { buildStats, recommend } from "@/domain/recommendation/RecommendationEngine";
import { zScores } from "@/domain/recommendation/zscore";
import { slotForOverallPick } from "@/shared/snake";
import { CATEGORIES, DEFAULT_LEAGUE, type Player } from "@/shared/types";
import { makeState } from "../tests/helpers";

type Strategy = "adp" | "engine" | "engine-autopunt";

import { marketPool, opponentPick, rng } from "./simlib";

function runDraft(strategy: Strategy, seed: number, slot: number, marketNoise: number): number {
  const pool: Player[] = marketPool(seed, marketNoise);
  const stats = buildStats(pool, 12);

  const teams: Player[][] = Array.from({ length: 12 }, () => []);
  let available = [...pool];
  const oppRand = rng(seed * 31 + 7);

  for (let pick = 1; pick <= 13 * 12; pick++) {
    const owner = slotForOverallPick(pick, DEFAULT_LEAGUE);
    let chosen: Player;
    if (owner === slot && strategy !== "adp") {
      const state = makeState({
        available,
        myRoster: teams[slot - 1],
        currentPick: pick,
        currentRound: Math.ceil(pick / 12),
        myDraftSlot: slot,
        picksUntilMe: 0,
      });
      state.strategy = { ...state.strategy, mode: strategy === "engine" ? "suggest" : "auto" };
      const id = recommend(state, { stats }).recommendations[0].playerId;
      chosen = available.find((p) => p.id === id)!;
    } else if (owner === slot) {
      chosen = available[0]; // the "draft by ADP" strategy: take the market's top player
    } else {
      chosen = opponentPick(available, oppRand);
    }
    teams[owner - 1].push(chosen);
    available = available.filter((p) => p.id !== chosen.id);
  }

  const totals = teams.map((roster) => {
    const t: Record<string, number> = {};
    for (const c of CATEGORIES) t[c] = 0;
    for (const p of roster) {
      const z = zScores(p.projection!, stats);
      for (const c of CATEGORIES) t[c] += z[c];
    }
    return t;
  });
  const me = totals[slot - 1];
  let wins = 0;
  for (let o = 0; o < 12; o++) {
    if (o === slot - 1) continue;
    for (const c of CATEGORIES) wins += me[c] > totals[o][c] ? 1 : me[c] === totals[o][c] ? 0.5 : 0;
  }
  return wins / 11;
}

describe("strategy simulation", () => {
  it("compares drafting by ADP against the engine's default and auto-punt modes", () => {
    for (const noise of [5, 15, 25]) {
      const results: Record<Strategy, number[]> = { adp: [], engine: [], "engine-autopunt": [] };
      for (let d = 0; d < 36; d++) {
        const seed = 1000 + d;
        const slot = (d % 12) + 1;
        for (const s of ["adp", "engine", "engine-autopunt"] as Strategy[]) results[s].push(runDraft(s, seed, slot, noise));
      }
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      console.log(
        `market noise ±${noise}:  draft-by-ADP ${avg(results.adp).toFixed(2)}  |  engine (default) ${avg(results.engine).toFixed(2)}  |  engine + auto punt ${avg(results["engine-autopunt"]).toFixed(2)}  wins/wk of 9`,
      );
    }
  }, 300_000);
});
