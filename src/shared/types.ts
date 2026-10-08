export const CATEGORIES = ["FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO"] as const;
export type Category = (typeof CATEGORIES)[number];

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Position = (typeof POSITIONS)[number];
/** Slots a league can roster, including the combo/flex slots Yahoo uses. */
export type RosterSlot = Position | "G" | "F" | "UTIL" | "BN" | "IL";

export type PuntLevel = "none" | "soft" | "hard";

export interface LeagueSettings {
  teams: number;
  draftType: "snake" | "linear";
  scoring: "9cat" | "8cat" | "points" | "roto";
  categories: Category[];
  rosterSlots: Partial<Record<RosterSlot, number>>;
  secondsPerPick?: number;
}

export interface Projection {
  gp: number;
  mpg?: number;
  fgm?: number;
  fga?: number;
  fgPct?: number;
  ftm?: number;
  fta?: number;
  ftPct?: number;
  threes: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
}

export interface Player {
  id: string;
  providerIds?: { yahoo?: string };
  name: string;
  normalizedName: string;
  nbaTeam: string;
  positions: Position[];
  rank?: number;
  adp?: number;
  projection?: Projection;
  injuryStatus?: string;
  tags?: string[];
}

export interface RosterPlayer extends Player {
  draftRound?: number;
  draftPick?: number;
}

export interface DraftPick {
  overall: number;
  round: number;
  pickInRound: number;
  teamId?: string;
  isMine: boolean;
  playerId: string;
  playerName: string;
  timestamp?: number;
}

/**
 * How punt strategy reaches the scores.
 *   suggest — detect and show the build, but score as if nothing is punted (default)
 *   auto    — detect and apply the detected punts to the scores
 *   manual  — apply exactly the punts the user set
 *
 * "suggest" is the default because simulation found auto-applied punting LOST
 * about 0.1 head-to-head categories per week versus not punting, consistently
 * across market conditions. A deliberate punt is still one click away.
 */
export type StrategyMode = "suggest" | "auto" | "manual";

export interface StrategyState {
  mode: StrategyMode;
  /** Punts that actually weight the scores. */
  punts: Record<Category, PuntLevel>;
  /** In suggest mode: what auto-detection would have punted. */
  suggestedPunts?: Record<Category, PuntLevel>;
  lockedCategories: Category[];
  buildLabel?: string;
  confidence: number;
}

export type ParserStatus = "ok" | "partial" | "error";

export interface ParserHealth {
  boardFound: boolean;
  pickCount: number;
  rosterFound: boolean;
  currentPickFound: boolean;
  confidence: number;
  warnings: string[];
}

export interface DraftMeta {
  currentRound?: number;
  currentPick?: number;
  myDraftSlot?: number;
  secondsRemaining?: number;
  onTheClockTeamId?: string;
  /** Read straight off the page ("You're up in N Picks") when available. */
  picksUntilMe?: number;
  /** Overall picks the page marks as the user's ("YOUR TURN - 12TH PICK"). */
  myPickNumbers?: number[];
}

/** A player as seen on the platform page, before it is matched to the master DB. */
export interface PlatformPlayer {
  providerId?: string;
  name: string;
  nbaTeam?: string;
  positions?: string[];
  rank?: number;
  adp?: number;
  injuryStatus?: string;
  /** Per-game projection scraped from the platform's own stat table. */
  projection?: Projection;
}

export interface DraftState {
  platform: "yahoo" | "mock" | "fixture";
  sessionId: string;
  /** Settings that contradict what the page shows — not parser failures. */
  configWarnings?: string[];
  /** Settings the page let us correct automatically for this draft. */
  configNotices?: string[];
  league: LeagueSettings;
  currentRound: number;
  currentPick: number;
  myDraftSlot?: number;
  nextMyPick?: number;
  picksUntilMe?: number;
  secondsRemaining?: number;
  drafted: DraftPick[];
  myRoster: RosterPlayer[];
  available: Player[];
  strategy: StrategyState;
  updatedAt: number;
  parserStatus: ParserStatus;
  parserHealth: ParserHealth;
}

export type ReachLabel = "Great Value" | "Fair" | "Slight Reach" | "Major Reach";

export interface Recommendation {
  playerId: string;
  playerName: string;
  positions: Position[];
  nbaTeam: string;
  adp?: number;
  score: number;
  rank: number;

  baseValue: number;
  rosterFit: number;
  categoryNeed: number;
  puntFit: number;
  scarcity: number;
  adpValue: number;
  upside: number;
  injuryRisk: number;

  reachLabel: ReachLabel;
  survivalToNextPick: number;

  improves: Category[];
  hurts: Category[];

  shortReason: string;
  /** Per-category standardized impact, punt-neutral. */
  categoryZ: Record<Category, number>;
  /**
   * -1..+1 gap between the season-long consensus rank and the last-7-days ADP.
   * Positive means the market is taking this player earlier than the season
   * ranking implies — usually the first visible trace of news the projections
   * have not absorbed yet.
   */
  marketMomentum?: number;
  /** The user's own adjustment that was applied, if any. */
  noteAdjustment?: number;
  /** Projected games played, and the pool's durable-player reference. */
  projectedGames?: number;
  referenceGames?: number;
}

/**
 * The user's own read on a player, carried across drafts.
 *
 * This is the channel for knowledge the projections cannot hold — a role change,
 * a coach comment, a training-camp report. It is deliberately a bounded nudge,
 * not an override: it can move a player several slots or break a tie, but it
 * cannot bury the underlying 9-CAT value.
 */
export interface PlayerNote {
  playerId: string;
  /** Kept for display in the options page, where there is no live draft board. */
  name: string;
  /** -1 (hard downgrade) .. +1 (hard target). */
  adjustment: number;
  /** Personal injury/role-risk flag, added on top of the projected risk. */
  risk?: boolean;
  note?: string;
  updatedAt: number;
}

export type NoteTag = "target" | "watch" | "downgrade" | "risk";

export const NOTE_PRESETS: Record<NoteTag, { adjustment: number; risk?: boolean; label: string }> = {
  target: { adjustment: 0.8, label: "鎖定目標" },
  watch: { adjustment: 0.3, label: "看好" },
  downgrade: { adjustment: -0.6, label: "看衰" },
  risk: { adjustment: -0.2, risk: true, label: "風險" },
};

export interface EngineWeights {
  baseValue: number;
  rosterFit: number;
  categoryNeed: number;
  puntFit: number;
  scarcity: number;
  adpValue: number;
  upside: number;
  injuryRisk: number;
}

export const DEFAULT_WEIGHTS: EngineWeights = {
  baseValue: 0.35,
  rosterFit: 0.22,
  categoryNeed: 0.15,
  puntFit: 0.1,
  scarcity: 0.08,
  adpValue: 0.05,
  upside: 0.03,
  injuryRisk: 0.02,
};

export interface LlmSettings {
  enabled: boolean;
  provider: "openai" | "none";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
}

export interface AppSettings {
  league: LeagueSettings;
  myDraftSlot?: number;
  weights: EngineWeights;
  quickModeThreshold: number;
  /** 0 = judge players purely per game, 1 = judge them on projected season totals. */
  availabilityWeight: number;
  strategyMode: StrategyMode;
  /** Bumped when a default changes in a way stored settings must migrate. */
  settingsVersion?: number;
  manualPunts: Record<Category, PuntLevel>;
  llm: LlmSettings;
  devInspector: boolean;
  overlayCollapsed: boolean;
}

export interface SessionOverrides {
  pinned: string[];
  blacklisted: string[];
  /** Players the user manually marked as drafted when the parser missed them. */
  manualDrafted: string[];
  /** Player ids the user manually added to their own roster. */
  manualRoster: string[];
}

export interface AiExplanation {
  bestPick: string;
  shortReason: string;
  warnings: string[];
  confidence: number;
  generatedAt: number;
}

export const DEFAULT_LEAGUE: LeagueSettings = {
  teams: 12,
  draftType: "snake",
  scoring: "9cat",
  categories: [...CATEGORIES],
  rosterSlots: { PG: 1, SG: 1, G: 1, SF: 1, PF: 1, F: 1, C: 2, UTIL: 2, BN: 3, IL: 1 },
  secondsPerPick: 60,
};

export const NO_PUNTS: Record<Category, PuntLevel> = {
  "FG%": "none",
  "FT%": "none",
  "3PM": "none",
  PTS: "none",
  REB: "none",
  AST: "none",
  STL: "none",
  BLK: "none",
  TO: "none",
};

export const DEFAULT_SETTINGS: AppSettings = {
  league: DEFAULT_LEAGUE,
  weights: DEFAULT_WEIGHTS,
  quickModeThreshold: 3,
  availabilityWeight: 0.5,
  strategyMode: "suggest",
  settingsVersion: 2,
  manualPunts: { ...NO_PUNTS },
  llm: { enabled: false, provider: "none", model: "gpt-4o-mini", timeoutMs: 3000 },
  devInspector: false,
  overlayCollapsed: false,
};

export const EMPTY_OVERRIDES: SessionOverrides = {
  pinned: [],
  blacklisted: [],
  manualDrafted: [],
  manualRoster: [],
};
