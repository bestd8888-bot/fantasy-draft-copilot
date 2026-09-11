import type { LeagueSettings } from "./types";

export function roundOf(overallPick: number, teams: number): number {
  return Math.ceil(overallPick / teams);
}

export function pickInRoundOf(overallPick: number, teams: number): number {
  return ((overallPick - 1) % teams) + 1;
}

/** Overall pick number owned by `slot` in `round`. */
export function overallPickFor(round: number, slot: number, league: Pick<LeagueSettings, "teams" | "draftType">): number {
  const { teams, draftType } = league;
  const positionInRound = draftType === "snake" && round % 2 === 0 ? teams - slot + 1 : slot;
  return (round - 1) * teams + positionInRound;
}

/** The draft slot that owns a given overall pick. */
export function slotForOverallPick(overall: number, league: Pick<LeagueSettings, "teams" | "draftType">): number {
  const { teams, draftType } = league;
  const round = roundOf(overall, teams);
  const posInRound = pickInRoundOf(overall, teams);
  return draftType === "snake" && round % 2 === 0 ? teams - posInRound + 1 : posInRound;
}

/** First pick owned by `slot` that is at or after `fromOverall`. */
export function nextPickForSlot(
  fromOverall: number,
  slot: number,
  league: Pick<LeagueSettings, "teams" | "draftType">,
  maxRounds = 30,
): number | undefined {
  const startRound = roundOf(Math.max(1, fromOverall), league.teams);
  for (let round = startRound; round <= maxRounds; round++) {
    const overall = overallPickFor(round, slot, league);
    if (overall >= fromOverall) return overall;
  }
  return undefined;
}

/** How many picks (including the current one) happen before the user is on the clock. */
export function picksUntilSlot(
  currentOverall: number,
  slot: number,
  league: Pick<LeagueSettings, "teams" | "draftType">,
): number | undefined {
  const next = nextPickForSlot(currentOverall, slot, league);
  return next === undefined ? undefined : next - currentOverall;
}
