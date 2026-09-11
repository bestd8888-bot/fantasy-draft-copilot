import { z } from "zod";
import { CATEGORIES, POSITIONS } from "./types";

export const categorySchema = z.enum(CATEGORIES);
export const positionSchema = z.enum(POSITIONS);
export const puntLevelSchema = z.enum(["none", "soft", "hard"]);

export const rosterSlotsSchema = z
  .object({
    PG: z.number().int().min(0).optional(),
    SG: z.number().int().min(0).optional(),
    G: z.number().int().min(0).optional(),
    SF: z.number().int().min(0).optional(),
    PF: z.number().int().min(0).optional(),
    F: z.number().int().min(0).optional(),
    C: z.number().int().min(0).optional(),
    UTIL: z.number().int().min(0).optional(),
    BN: z.number().int().min(0).optional(),
    IL: z.number().int().min(0).optional(),
  })
  .strict();

export const leagueSettingsSchema = z.object({
  teams: z.number().int().min(2).max(30),
  draftType: z.enum(["snake", "linear"]),
  scoring: z.enum(["9cat", "8cat", "points", "roto"]),
  categories: z.array(categorySchema).min(1),
  rosterSlots: rosterSlotsSchema,
  secondsPerPick: z.number().int().positive().optional(),
});

export const projectionSchema = z.object({
  gp: z.number().min(0).max(82),
  mpg: z.number().min(0).max(48).optional(),
  fgm: z.number().min(0).optional(),
  fga: z.number().min(0).optional(),
  fgPct: z.number().min(0).max(1).optional(),
  ftm: z.number().min(0).optional(),
  fta: z.number().min(0).optional(),
  ftPct: z.number().min(0).max(1).optional(),
  threes: z.number().min(0),
  pts: z.number().min(0),
  reb: z.number().min(0),
  ast: z.number().min(0),
  stl: z.number().min(0),
  blk: z.number().min(0),
  tov: z.number().min(0),
});

export const playerSchema = z.object({
  id: z.string().min(1),
  providerIds: z.object({ yahoo: z.string().optional() }).optional(),
  name: z.string().min(1),
  normalizedName: z.string().min(1),
  nbaTeam: z.string(),
  positions: z.array(positionSchema),
  rank: z.number().optional(),
  adp: z.number().optional(),
  projection: projectionSchema.optional(),
  injuryStatus: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const draftPickSchema = z.object({
  overall: z.number().int().positive(),
  round: z.number().int().positive(),
  pickInRound: z.number().int().positive(),
  teamId: z.string().optional(),
  isMine: z.boolean(),
  playerId: z.string(),
  playerName: z.string(),
  timestamp: z.number().optional(),
});

export const strategySchema = z.object({
  mode: z.enum(["auto", "manual"]),
  punts: z.record(categorySchema, puntLevelSchema),
  lockedCategories: z.array(categorySchema),
  buildLabel: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const parserHealthSchema = z.object({
  boardFound: z.boolean(),
  pickCount: z.number().int().min(0),
  rosterFound: z.boolean(),
  currentPickFound: z.boolean(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export const draftStateSchema = z.object({
  platform: z.enum(["yahoo", "mock", "fixture"]),
  sessionId: z.string().min(1),
  league: leagueSettingsSchema,
  currentRound: z.number().int().min(1),
  currentPick: z.number().int().min(1),
  myDraftSlot: z.number().int().positive().optional(),
  nextMyPick: z.number().int().positive().optional(),
  picksUntilMe: z.number().int().min(0).optional(),
  secondsRemaining: z.number().min(0).optional(),
  drafted: z.array(draftPickSchema),
  myRoster: z.array(playerSchema.extend({ draftRound: z.number().optional(), draftPick: z.number().optional() })),
  available: z.array(playerSchema),
  strategy: strategySchema,
  updatedAt: z.number(),
  parserStatus: z.enum(["ok", "partial", "error"]),
  parserHealth: parserHealthSchema,
});

/** One row of an imported projection file, after header normalization. */
export const projectionRowSchema = z.object({
  player_id: z.string().optional(),
  name: z.string().min(1),
  team: z.string().optional(),
  positions: z.string().optional(),
  gp: z.coerce.number().optional(),
  mpg: z.coerce.number().optional(),
  fg_pct: z.coerce.number().optional(),
  fgm: z.coerce.number().optional(),
  fga: z.coerce.number().optional(),
  ft_pct: z.coerce.number().optional(),
  ftm: z.coerce.number().optional(),
  fta: z.coerce.number().optional(),
  three_pm: z.coerce.number().optional(),
  pts: z.coerce.number().optional(),
  reb: z.coerce.number().optional(),
  ast: z.coerce.number().optional(),
  stl: z.coerce.number().optional(),
  blk: z.coerce.number().optional(),
  tov: z.coerce.number().optional(),
  adp: z.coerce.number().optional(),
  rank: z.coerce.number().optional(),
  yahoo_id: z.string().optional(),
  injury_status: z.string().optional(),
});

export const llmResponseSchema = z.object({
  bestPick: z.string(),
  shortReason: z.string(),
  warnings: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type ProjectionRow = z.infer<typeof projectionRowSchema>;
