import { normalizeName } from "@/shared/names";
import {
  DEFAULT_LEAGUE,
  DEFAULT_SETTINGS,
  EMPTY_OVERRIDES,
  NO_PUNTS,
  type DraftState,
  type Player,
  type Position,
  type Projection,
} from "@/shared/types";
import { scoreHealth } from "@/content/adapter";

export function makePlayer(
  name: string,
  positions: Position[],
  projection: Partial<Projection>,
  extra: Partial<Player> = {},
): Player {
  return {
    id: extra.id ?? normalizeName(name).replace(/ /g, "-"),
    name,
    normalizedName: normalizeName(name),
    nbaTeam: extra.nbaTeam ?? "AAA",
    positions,
    adp: extra.adp,
    rank: extra.rank,
    tags: extra.tags,
    injuryStatus: extra.injuryStatus,
    projection: {
      gp: 72,
      mpg: 32,
      fga: 14,
      fgPct: 0.47,
      fta: 4,
      ftPct: 0.78,
      threes: 1.8,
      pts: 18,
      reb: 5,
      ast: 4,
      stl: 1,
      blk: 0.6,
      tov: 2.2,
      ...projection,
    },
  };
}

export function makeState(overrides: Partial<DraftState> = {}): DraftState {
  return {
    platform: "mock",
    sessionId: "test",
    league: DEFAULT_LEAGUE,
    currentRound: 1,
    currentPick: 1,
    myDraftSlot: 3,
    nextMyPick: 3,
    picksUntilMe: 2,
    drafted: [],
    myRoster: [],
    available: [],
    strategy: { mode: "auto", punts: { ...NO_PUNTS }, lockedCategories: [], confidence: 0 },
    updatedAt: Date.now(),
    parserStatus: "ok",
    parserHealth: scoreHealth({
      boardFound: true,
      pickCount: 0,
      rosterFound: true,
      currentPickFound: true,
      warnings: [],
    }),
    ...overrides,
  };
}

export const testSettings = DEFAULT_SETTINGS;
export const testOverrides = EMPTY_OVERRIDES;
