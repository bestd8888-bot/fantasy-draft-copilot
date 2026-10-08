/** Shared pieces for the draft simulations in this folder. */
import { buildDemoPool } from "@/domain/player/demoPool";
import type { Player } from "@/shared/types";

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

/** A pool whose ADP is the true value ordering plus market noise, re-ranked 1..n. */
export function marketPool(seed: number, marketNoise: number): Player[] {
  const r = rng(seed);
  return buildDemoPool(230, seed)
    .map((p) => ({ ...p, adp: (p.adp ?? 100) + gauss(r) * marketNoise }))
    .sort((a, b) => a.adp! - b.adp!)
    .map((p, i) => ({ ...p, adp: i + 1, rank: i + 1 }));
}

/**
 * A human-like opponent: drafts the player who looks best on their OWN board,
 * which is ADP plus personal noise that widens later in the draft — everyone
 * agrees on the first picks, nobody agrees on pick 120.
 * `available` must be ADP-sorted.
 */
export function opponentPick(available: Player[], r: () => number): Player {
  let best = available[0];
  let bestScore = Infinity;
  for (const p of available.slice(0, 30)) {
    const score = p.adp! + gauss(r) * (1.5 + 0.12 * p.adp!);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}
