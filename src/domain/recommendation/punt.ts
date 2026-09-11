import {
  CATEGORIES,
  NO_PUNTS,
  type Category,
  type LeagueSettings,
  type Player,
  type PuntLevel,
  type StrategyState,
} from "@/shared/types";
import { clamp, normalCdf } from "@/shared/util";
import { emptyVector, zScores, type CategoryVector, type PoolStats } from "./zscore";

export interface PuntInput {
  roster: Player[];
  available: Player[];
  stats: PoolStats;
  league: LeagueSettings;
  round: number;
  mode: "auto" | "manual";
  manualPunts: Record<Category, PuntLevel>;
  lockedCategories: Category[];
}

export interface CategoryProfile {
  /** Mean z of the current roster in each category. */
  rosterZ: CategoryVector;
  /** 0-1 percentile of the roster's projected standing in each category. */
  percentile: CategoryVector;
  /** 0-1 cost of recovering a category given who is still on the board. */
  recoveryCost: CategoryVector;
}

/** Slots that actually contribute to weekly categories (IL does not). */
export function activeRosterSize(league: LeagueSettings): number {
  const slots = league.rosterSlots;
  const total = (Object.keys(slots) as (keyof typeof slots)[])
    .filter((slot) => slot !== "IL")
    .reduce((acc, slot) => acc + (slots[slot] ?? 0), 0);
  return Math.max(4, total);
}

const PUNTABLE: Category[] = ["FG%", "FT%", "3PM", "REB", "AST", "STL", "BLK", "TO"];

/** Round gates keep the engine from locking a build on one or two picks. */
const SOFT_PUNT_ROUND = 3;
const HARD_PUNT_ROUND = 5;
const MAX_PUNTS = 2;

export function buildCategoryProfile(
  roster: Player[],
  available: Player[],
  stats: PoolStats,
  league: LeagueSettings,
): CategoryProfile {
  const rosterZ = emptyVector();
  const percentile = emptyVector();
  const recoveryCost = emptyVector();

  const withProjection = roster.filter((p) => p.projection);
  const rosterSize = activeRosterSize(league);
  for (const category of CATEGORIES) {
    const values = withProjection.map((p) => zScores(p.projection!, stats)[category]);
    const total = values.reduce((a, b) => a + b, 0);
    rosterZ[category] = values.length ? total / values.length : 0;

    // Where the team is projected to FINISH, not how good the picks so far are.
    // Unfilled slots are assumed league-average (z = 0), so a two-player roster
    // sits near the middle and the estimate sharpens as the roster fills. The
    // spread of a full team's category total is ~sqrt(rosterSize) player-sds.
    percentile[category] = clamp(normalCdf(total / Math.sqrt(rosterSize)));

    const eliteRemaining = available.filter((p) => p.projection && zScores(p.projection, stats)[category] >= 1).length;
    recoveryCost[category] = clamp(1 - eliteRemaining / Math.max(1, league.teams * 0.75));
  }

  return { rosterZ, percentile, recoveryCost };
}

export function detectPunts(input: PuntInput): { strategy: StrategyState; profile: CategoryProfile } {
  const { roster, available, stats, league, round, mode, manualPunts, lockedCategories } = input;
  const profile = buildCategoryProfile(roster, available, stats, league);

  if (mode === "manual") {
    return {
      strategy: {
        mode: "manual",
        punts: { ...NO_PUNTS, ...manualPunts },
        lockedCategories,
        buildLabel: describeBuild({ ...NO_PUNTS, ...manualPunts }),
        confidence: 1,
      },
      profile,
    };
  }

  const punts: Record<Category, PuntLevel> = { ...NO_PUNTS };
  const rostered = roster.filter((p) => p.projection).length;

  if (rostered >= 2 && round >= SOFT_PUNT_ROUND) {
    const ranked = PUNTABLE.filter((c) => league.categories.includes(c))
      .map((category) => ({
        category,
        // Weak standing plus an expensive recovery is what actually makes a punt.
        evidence: (0.5 - profile.percentile[category]) * 1.6 + profile.recoveryCost[category] * 0.6,
        percentile: profile.percentile[category],
      }))
      .filter((c) => c.percentile <= 0.3)
      .sort((a, b) => b.evidence - a.evidence)
      .slice(0, MAX_PUNTS);

    for (const item of ranked) {
      const canHardPunt = round >= HARD_PUNT_ROUND && item.percentile <= 0.15 && item.evidence >= 0.85;
      // TO is never hard-punted: it is too cheap to recover through roster churn.
      punts[item.category] = canHardPunt && item.category !== "TO" ? "hard" : "soft";
    }
  }

  for (const category of lockedCategories) {
    punts[category] = manualPunts[category] ?? punts[category];
  }

  const puntedCount = CATEGORIES.filter((c) => punts[c] !== "none").length;
  const confidence = puntedCount === 0 ? clamp(rostered / 6) : clamp(0.35 + 0.12 * rostered + 0.1 * puntedCount);

  return {
    strategy: {
      mode: "auto",
      punts,
      lockedCategories,
      buildLabel: describeBuild(punts, round),
      confidence,
    },
    profile,
  };
}

export function describeBuild(punts: Record<Category, PuntLevel>, round?: number): string {
  const hard = CATEGORIES.filter((c) => punts[c] === "hard");
  const soft = CATEGORIES.filter((c) => punts[c] === "soft");
  if (hard.length === 0 && soft.length === 0) {
    return round !== undefined && round <= 2 ? "Balanced (too early to punt)" : "Balanced";
  }
  const parts: string[] = [];
  if (hard.length) parts.push(`Punt ${hard.join(" + ")}`);
  if (soft.length) parts.push(`Soft punt ${soft.join(" + ")}`);
  return parts.join(" · ");
}

/** Category weights implied by the punt state: hard punts are worth nothing. */
export function puntWeights(punts: Record<Category, PuntLevel>): CategoryVector {
  const weights = emptyVector();
  for (const category of CATEGORIES) {
    weights[category] = punts[category] === "hard" ? 0 : punts[category] === "soft" ? 0.35 : 1;
  }
  return weights;
}
