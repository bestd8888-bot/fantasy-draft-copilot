import { POSITIONS, type Player, type Position } from "@/shared/types";
import { clamp, logistic } from "@/shared/util";

export type PositionScarcity = Record<Position, number>;

export interface ScarcityInput {
  available: Player[];
  /** Punt-adjusted value per player id, higher is better. */
  valueById: Map<string, number>;
  picksUntilMe: number;
  /** How many of the top players to treat as "startable quality" per position. */
  qualityDepth?: number;
}

/**
 * Scarcity is not "how many are left" — it is how much quality is expected to
 * evaporate before the user's next pick.
 *
 *   scarcity(pos) = (qualityNow - qualityAtMyNextPick) / qualityNow
 */
export function positionScarcity(input: ScarcityInput): PositionScarcity {
  const { available, valueById, picksUntilMe } = input;
  const depth = input.qualityDepth ?? 5;

  // The market drafts roughly by ADP, so the next `picksUntilMe` ADP leaders are
  // the players most likely to be gone when the user is back on the clock.
  const byMarket = [...available].sort(
    (a, b) => (a.adp ?? a.rank ?? 9999) - (b.adp ?? b.rank ?? 9999),
  );
  const goneCount = Math.max(0, Math.min(byMarket.length, picksUntilMe));
  const goneIds = new Set(byMarket.slice(0, goneCount).map((p) => p.id));

  const scarcity = {} as PositionScarcity;
  for (const position of POSITIONS) {
    const eligible = available.filter((p) => p.positions.includes(position));
    const now = topQuality(eligible, valueById, depth);
    const later = topQuality(
      eligible.filter((p) => !goneIds.has(p.id)),
      valueById,
      depth,
    );
    const drop = now > 0 ? (now - later) / now : 0;
    const thinness = clamp(1 - eligible.length / 18);
    scarcity[position] = clamp(drop * 0.75 + thinness * 0.25);
  }
  return scarcity;
}

function topQuality(players: Player[], valueById: Map<string, number>, depth: number): number {
  return players
    .map((p) => valueById.get(p.id) ?? 0)
    .sort((a, b) => b - a)
    .slice(0, depth)
    .reduce((acc, v) => acc + Math.max(0, v), 0);
}

/**
 * Probability the player is still on the board at the user's next pick.
 *
 * Heuristic: rank the remaining pool the way the market drafts it, then ask how
 * far the player sits beyond the number of picks that will happen first.
 */
export function survivalProbability(
  player: Player,
  available: Player[],
  picksUntilMe: number,
  currentOverallPick: number,
): number {
  if (picksUntilMe <= 0) return 0; // The user is on the clock: it is now or never.

  const marketRank =
    [...available]
      .sort((a, b) => (a.adp ?? a.rank ?? 9999) - (b.adp ?? b.rank ?? 9999))
      .findIndex((p) => p.id === player.id) + 1;
  const effectiveRank = marketRank > 0 ? marketRank : available.length;

  const adpSlack = player.adp !== undefined ? player.adp - (currentOverallPick + picksUntilMe) : 0;
  const spread = 0.4 * picksUntilMe + 2;
  const margin = effectiveRank - picksUntilMe - 0.5 + adpSlack * 0.25;
  return clamp(logistic(margin / spread), 0.01, 0.99);
}
