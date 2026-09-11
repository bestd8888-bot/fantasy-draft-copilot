import { CATEGORIES, type DraftState, type Recommendation } from "@/shared/types";
import type { EngineResult } from "@/domain/recommendation/RecommendationEngine";

export const SYSTEM_PROMPT = `You are a fantasy basketball draft copilot.

The deterministic recommendation engine has already ranked the candidates.
Do not invent players or stats.
Do not recommend anyone outside the provided candidate list.
Explain the top recommendation in Traditional Chinese.
Prioritize roster fit, punt strategy, category balance, positional scarcity,
and whether the player is likely to survive until the next pick.

Return JSON only, matching:
{"bestPick": string (a playerId from candidates), "shortReason": string (<= 40 Chinese characters), "warnings": string[], "confidence": number 0-1}`;

export interface LlmPayload {
  league: { teams: number; scoring: string; round: number; overallPick: number; picksUntilMe?: number };
  strategy: Record<string, string>;
  myRoster: string[];
  candidates: {
    playerId: string;
    name: string;
    positions: string[];
    engineScore: number;
    improves: string[];
    hurts: string[];
    survivalToNextPick: number;
    reach: string;
  }[];
}

/**
 * Builds the LLM payload.
 *
 * Only normalized basketball facts leave the machine — no cookies, no auth
 * headers, no page HTML, no account or league identifiers (NFR-003).
 */
export function buildLlmPayload(state: DraftState, result: EngineResult, topN = 5): LlmPayload {
  const strategy: Record<string, string> = {};
  for (const category of CATEGORIES) {
    const level = result.strategy.punts[category];
    if (level && level !== "none") strategy[category] = level;
  }

  return {
    league: {
      teams: state.league.teams,
      scoring: state.league.scoring,
      round: state.currentRound,
      overallPick: state.currentPick,
      picksUntilMe: state.picksUntilMe,
    },
    strategy,
    myRoster: state.myRoster.map((p) => p.name),
    candidates: result.recommendations.slice(0, topN).map(toCandidate),
  };
}

function toCandidate(rec: Recommendation) {
  return {
    playerId: rec.playerId,
    name: rec.playerName,
    positions: rec.positions,
    engineScore: rec.score,
    improves: rec.improves,
    hurts: rec.hurts,
    survivalToNextPick: Number(rec.survivalToNextPick.toFixed(2)),
    reach: rec.reachLabel,
  };
}
