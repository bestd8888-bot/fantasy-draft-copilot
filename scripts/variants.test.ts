/** Engine variants under the same simulated drafts.  npm run simulate -- scripts/variants.test.ts */
import { describe, it } from "vitest";
import { buildStats, recommend, type EngineOptions } from "@/domain/recommendation/RecommendationEngine";
import { zScores } from "@/domain/recommendation/zscore";
import { slotForOverallPick } from "@/shared/snake";
import { CATEGORIES, DEFAULT_LEAGUE, type Player } from "@/shared/types";
import { makeState } from "../tests/helpers";
import { marketPool, opponentPick, rng } from "./simlib";

interface Variant { name: string; options: EngineOptions; punts: "auto" | "off" }

function run(v: Variant, seed: number, slot: number, noise = 15): number {
  const pool = marketPool(seed, noise);
  const stats = buildStats(pool, 12);
  const teams: Player[][] = Array.from({ length: 12 }, () => []);
  let available = [...pool];
  const oppRand = rng(seed * 31 + 7);
  for (let pick = 1; pick <= 156; pick++) {
    const owner = slotForOverallPick(pick, DEFAULT_LEAGUE);
    let chosen: Player;
    if (owner === slot) {
      const state = makeState({ available, myRoster: teams[slot - 1], currentPick: pick, currentRound: Math.ceil(pick / 12), myDraftSlot: slot, picksUntilMe: 0 });
      // "off" is the shipped default: punts detected and shown, never applied.
      state.strategy = v.punts === "off" ? { ...state.strategy, mode: "suggest" } : { ...state.strategy, mode: "auto" };
      const id = recommend(state, { ...v.options, stats }).recommendations[0].playerId;
      chosen = available.find((p) => p.id === id)!;
    } else chosen = opponentPick(available, oppRand);
    teams[owner - 1].push(chosen);
    available = available.filter((p) => p.id !== chosen.id);
  }
  const totals = teams.map((roster) => {
    const t: Record<string, number> = {};
    for (const c of CATEGORIES) t[c] = roster.reduce((acc, p) => acc + zScores(p.projection!, stats)[c], 0);
    return t;
  });
  let wins = 0;
  for (let o = 0; o < 12; o++) {
    if (o === slot - 1) continue;
    for (const c of CATEGORIES) wins += totals[slot - 1][c] > totals[o][c] ? 1 : 0;
  }
  return wins / 11;
}

describe("punting robustness", () => {
  it("auto-applied punting vs the suggest-only default", () => {
    const auto: Variant = { name: "auto", options: {}, punts: "auto" };
    const off: Variant = { name: "off", options: {}, punts: "off" };
    for (const noise of [5, 15, 25]) {
      const diffs: number[] = [];
      for (let d = 0; d < 144; d++) {
        const seed = 5000 + d, slot = (d % 12) + 1;
        diffs.push(run(off, seed, slot, noise) - run(auto, seed, slot, noise));
      }
      const m = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const se = Math.sqrt(diffs.reduce((a, b) => a + (b - m) ** 2, 0) / (diffs.length - 1) / diffs.length);
      const better = diffs.filter((x) => x > 0).length, worse = diffs.filter((x) => x < 0).length;
      console.log(`ROBUST noise ±${noise}: suggest minus auto = ${m >= 0 ? "+" : ""}${m.toFixed(3)} ± ${se.toFixed(3)}  (suggest better in ${better}, worse in ${worse} of 144)`);
    }
  });
});
