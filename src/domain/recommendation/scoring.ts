import { CATEGORIES, type Category, type Player, type ReachLabel } from "@/shared/types";
import { clamp } from "@/shared/util";
import type { CategoryVector, PoolStats } from "./zscore";
import { zScores } from "./zscore";

/** 0-1 percentile of a value inside a sorted-descending numeric array. */
export function percentileOf(value: number, sortedDesc: number[]): number {
  if (sortedDesc.length === 0) return 0.5;
  let lo = 0;
  let hi = sortedDesc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDesc[mid] > value) lo = mid + 1;
    else hi = mid;
  }
  return clamp(1 - lo / sortedDesc.length);
}

/** How well the player serves the categories the roster is actually short in. */
export function categoryNeedScore(
  z: CategoryVector,
  need: CategoryVector,
  weights: CategoryVector,
  categories: readonly Category[],
): number {
  let weightedNeed = 0;
  let totalNeed = 0;
  for (const category of categories) {
    const w = need[category] * weights[category];
    if (w <= 0) continue;
    totalNeed += w;
    weightedNeed += w * clamp(z[category] / 2, -1, 1);
  }
  if (totalNeed === 0) return 0.5;
  return clamp(0.5 + (weightedNeed / totalNeed) * 0.5);
}

/**
 * ADP value: being able to take an ADP-30 player at pick 60 is a real edge, but
 * the component is deliberately capped so ADP can never drive the board.
 */
export function adpValueScore(player: Player, currentOverallPick: number, teams: number): number {
  if (player.adp === undefined) return 0.5;
  // Positive when the player has fallen past their ADP and is still available.
  const fall = currentOverallPick - player.adp;
  return clamp(0.5 + fall / (teams * 2.5));
}

export function reachLabel(player: Player, currentOverallPick: number, teams: number): ReachLabel {
  if (player.adp === undefined) return "Fair";
  const fall = currentOverallPick - player.adp;
  if (fall >= teams * 0.75) return "Great Value";
  if (fall >= -teams * 0.4) return "Fair";
  if (fall >= -teams * 1.2) return "Slight Reach";
  return "Major Reach";
}

/**
 * Divergence between the season-long consensus rank and the last-7-days ADP.
 *
 * Positive = the market is drafting this player EARLIER than the season ranking
 * says (lower ADP number is earlier). Role changes, camp reports and injury news
 * reach live draft rooms days before they reach published projections, so this
 * gap is the earliest machine-readable trace of them.
 */
export function marketMomentum(player: Player, teams: number): number | undefined {
  if (player.rank === undefined || player.adp === undefined) return undefined;
  const gap = player.rank - player.adp;
  return clamp(gap / (teams * 1.5), -1, 1);
}

/** Per-minute production above their raw totals hints at unrealized volume. */
export function upsideScore(player: Player, stats: PoolStats, momentum = 0): number {
  const projection = player.projection;
  if (!projection) return clamp(0.4 + momentum * 0.25);
  const minutes = projection.mpg ?? 28;
  const total = CATEGORIES.reduce((acc, c) => acc + zScores(projection, stats)[c], 0);
  const per36 = minutes > 0 ? (total / minutes) * 30 : total;
  const roomToGrow = clamp((32 - minutes) / 14);
  const tagBoost = player.tags?.includes("upside") ? 0.15 : 0;
  // Momentum feeds upside rather than value: a rising market suggests news the
  // projections have not priced in, which is exactly what upside is meant to be.
  return clamp(0.4 + (per36 - total) * 0.05 + roomToGrow * 0.35 + tagBoost + momentum * 0.25);
}

/**
 * Risk that the projection itself is optimistic — a current injury designation,
 * or a games-played forecast so low it signals real uncertainty.
 *
 * The routine cost of missing games is NOT priced here: that now lives in the
 * value itself via `availabilityWeight`. Charging it twice would penalise every
 * durable-but-not-iron-man player.
 */
export function injuryRiskScore(player: Player, availabilityWeight = 0): number {
  const gp = player.projection?.gp ?? 70;
  const status = (player.injuryStatus ?? "").toUpperCase();
  const statusRisk = status.includes("OUT") || status.includes("IL") ? 0.6 : status ? 0.25 : 0;
  // Only the tail — a sub-55-game forecast — still counts as risk on top.
  const fragility = clamp((55 - gp) / 25) * (1 - availabilityWeight * 0.7);
  return clamp(fragility * 0.6 + statusRisk);
}

export function improvesAndHurts(
  z: CategoryVector,
  weights: CategoryVector,
  categories: readonly Category[],
): { improves: Category[]; hurts: Category[] } {
  const improves: Category[] = [];
  const hurts: Category[] = [];
  for (const category of categories) {
    if (weights[category] === 0) continue;
    if (z[category] >= 0.5) improves.push(category);
    else if (z[category] <= -0.5) hurts.push(category);
  }
  improves.sort((a, b) => z[b] - z[a]);
  hurts.sort((a, b) => z[a] - z[b]);
  return { improves: improves.slice(0, 4), hurts: hurts.slice(0, 3) };
}

/**
 * Maps raw weighted scores onto an ABSOLUTE 0-100 scale: the share of the best
 * possible pick this candidate captures.
 *
 * It deliberately does NOT anchor the leader at a fixed number. An earlier
 * version pinned the top candidate to 95 every time, which made the score look
 * absolute while only encoding rank — a 95 in round 1 and a 95 in round 12 meant
 * nothing comparable. Now a thin board reads low across the list, which is the
 * honest signal.
 */
export function toAbsoluteScores(rawScores: number[], maxAchievable: number): number[] {
  const ceiling = Math.max(1e-6, maxAchievable);
  return rawScores.map((raw) => clamp(Math.round((raw / ceiling) * 100), 1, 100));
}
