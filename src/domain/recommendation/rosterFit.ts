import { POSITIONS, type LeagueSettings, type Player, type Position } from "@/shared/types";
import { clamp } from "@/shared/util";

export type PositionCounts = Record<Position, number>;

export function emptyCounts(): PositionCounts {
  return POSITIONS.reduce((acc, p) => {
    acc[p] = 0;
    return acc;
  }, {} as PositionCounts);
}

/**
 * Turns Yahoo-style roster slots (PG, G, F, UTIL, BN ...) into a target number
 * of players per concrete position. Combo slots are split across the positions
 * that can fill them.
 */
export function positionTargets(league: LeagueSettings): PositionCounts {
  const slots = league.rosterSlots;
  const targets = emptyCounts();
  const add = (positions: Position[], amount: number) => {
    for (const position of positions) targets[position] += amount / positions.length;
  };

  add(["PG"], slots.PG ?? 0);
  add(["SG"], slots.SG ?? 0);
  add(["SF"], slots.SF ?? 0);
  add(["PF"], slots.PF ?? 0);
  add(["C"], slots.C ?? 0);
  add(["PG", "SG"], slots.G ?? 0);
  add(["SF", "PF"], slots.F ?? 0);
  add([...POSITIONS], slots.UTIL ?? 0);
  add([...POSITIONS], (slots.BN ?? 0) * 0.8);

  for (const position of POSITIONS) targets[position] = Math.max(0.5, targets[position]);
  return targets;
}

/** Eligibility share per position; a PG/SG counts half at each. */
export function rosterPositionCounts(roster: Player[]): PositionCounts {
  const counts = emptyCounts();
  for (const player of roster) {
    const positions = player.positions.length ? player.positions : ([...POSITIONS] as Position[]);
    for (const position of positions) counts[position] += 1 / positions.length;
  }
  return counts;
}

export interface RosterFitResult {
  score: number;
  positionNeed: PositionCounts;
  /** Human-readable note used in the short reason. */
  note?: string;
}

export function rosterFit(
  player: Player,
  roster: Player[],
  league: LeagueSettings,
  scarcity: PositionCounts,
): RosterFitResult {
  const targets = positionTargets(league);
  const counts = rosterPositionCounts(roster);

  const positionNeed = emptyCounts();
  for (const position of POSITIONS) {
    positionNeed[position] = clamp((targets[position] - counts[position]) / Math.max(0.5, targets[position]));
  }

  const positions = player.positions.length ? player.positions : ([...POSITIONS] as Position[]);
  const needs = positions.map((p) => positionNeed[p]);
  const bestNeed = Math.max(...needs);
  const avgNeed = needs.reduce((a, b) => a + b, 0) / needs.length;
  const scarcityBoost = Math.max(...positions.map((p) => scarcity[p] ?? 0));

  const multiPositionBonus = clamp((positions.length - 1) * 0.07, 0, 0.2);
  const excessPenalty = bestNeed < 0.12 ? 0.22 : bestNeed < 0.25 ? 0.1 : 0;

  const score = clamp(
    0.3 + 0.4 * bestNeed + 0.15 * avgNeed + 0.1 * scarcityBoost + multiPositionBonus - excessPenalty,
  );

  let note: string | undefined;
  if (excessPenalty >= 0.22) note = `${positions.join("/")} slots already full`;
  else if (bestNeed >= 0.6) note = `fills ${positions.filter((p) => positionNeed[p] >= 0.6).join("/") || positions.join("/")} need`;
  else if (multiPositionBonus > 0.1) note = `${positions.join("/")} flexibility`;

  return { score, positionNeed, note };
}
