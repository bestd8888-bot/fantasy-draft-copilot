import {
  CATEGORIES,
  DEFAULT_WEIGHTS,
  EMPTY_OVERRIDES,
  type Category,
  type DraftState,
  type EngineWeights,
  type Player,
  type PlayerNote,
  type Recommendation,
  type SessionOverrides,
  type StrategyState,
} from "@/shared/types";
import { clamp, logistic } from "@/shared/util";
import { buildPoolStats, emptyVector, zScores, type CategoryVector, type PoolStats } from "./zscore";
import { buildCategoryProfile, detectPunts, puntWeights, type CategoryProfile } from "./punt";
import { positionScarcity, survivalProbability } from "./scarcity";
import { rosterFit } from "./rosterFit";
import {
  adpValueScore,
  categoryNeedScore,
  improvesAndHurts,
  injuryRiskScore,
  marketMomentum,
  percentileOf,
  reachLabel,
  toAbsoluteScores,
  upsideScore,
} from "./scoring";

export interface EngineOptions {
  weights?: EngineWeights;
  overrides?: SessionOverrides;
  /** The user's standing read on individual players, keyed by player id. */
  notes?: Record<string, PlayerNote>;
  limit?: number;
  /** Pre-computed pool stats; pass this in to avoid recomputing every pick. */
  stats?: PoolStats;
  /** How much projected games played counts; see PoolStats.availabilityWeight. */
  availabilityWeight?: number;
}

export interface EngineResult {
  recommendations: Recommendation[];
  strategy: StrategyState;
  /** 0-100 per-category standing of the user's roster, for the overlay bars. */
  categoryPercentiles: Record<Category, number>;
  categoryProfile: CategoryProfile;
  stats: PoolStats;
  computedAtMs: number;
  durationMs: number;
}

/** Extra credit for a player who will not survive until the user picks again. */
const SURVIVAL_URGENCY_BONUS = 0.03;

/**
 * Scale of the logistic that maps total 9-CAT z onto absolute base value.
 *
 * A logistic rather than a clamped line: a linear map saturates at the top, so
 * every elite player collapses to exactly 1.0 and the 35% component can no
 * longer tell a superstar from a very good player. This stays strictly monotone
 * at every level while keeping the scale absolute.
 *   z = 0 -> 0.50   z = +6 -> 0.68   z = +12 -> 0.82   z = -6 -> 0.32
 */
const BASE_VALUE_SPAN = 8;

/**
 * How far a player note can move the raw score. Sized so a note can lift a
 * player a few slots or settle a close call, but never override a real gap in
 * value — the user's read is an input, not a veto.
 */
const NOTE_INFLUENCE = 0.08;

export function buildStats(players: Player[], teams: number, availabilityWeight?: number): PoolStats {
  return buildPoolStats(players, teams * 13, availabilityWeight);
}

export function recommend(state: DraftState, options: EngineOptions = {}): EngineResult {
  const startedAt = Date.now();
  const started = typeof performance !== "undefined" ? performance.now() : startedAt;
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const overrides = options.overrides ?? EMPTY_OVERRIDES;
  const notes = options.notes ?? {};
  const limit = options.limit ?? 12;
  const league = state.league;
  const categories = league.categories.length ? league.categories : [...CATEGORIES];

  const blacklisted = new Set(overrides.blacklisted);
  const pinned = new Set(overrides.pinned);
  const draftedIds = new Set([...state.drafted.map((p) => p.playerId), ...overrides.manualDrafted]);
  const pool = state.available.filter((p) => !draftedIds.has(p.id) && !blacklisted.has(p.id));

  const stats =
    options.stats ?? buildStats([...pool, ...state.myRoster], league.teams, options.availabilityWeight);

  const { strategy, profile } = detectPunts({
    roster: state.myRoster,
    available: pool,
    stats,
    league,
    round: state.currentRound,
    mode: state.strategy.mode,
    manualPunts: state.strategy.punts,
    lockedCategories: state.strategy.lockedCategories,
  });

  const catWeights = puntWeights(strategy.punts);
  for (const category of CATEGORIES) {
    if (!categories.includes(category)) catWeights[category] = 0;
  }

  const need = emptyVector();
  for (const category of CATEGORIES) {
    // Punted categories are never "needed" — that is the whole point of punting.
    need[category] = catWeights[category] === 0 ? 0 : clamp(1 - profile.percentile[category]) * catWeights[category];
  }

  // Pass 1: per-player z vectors and the two value aggregates.
  const zById = new Map<string, CategoryVector>();
  const baseZById = new Map<string, number>();
  const puntZById = new Map<string, number>();
  for (const player of pool) {
    const z = player.projection ? zScores(player.projection, stats) : emptyVector();
    zById.set(player.id, z);
    const base = categories.reduce((acc, c) => acc + z[c], 0);
    baseZById.set(player.id, base);
    puntZById.set(player.id, categories.reduce((acc, c) => acc + z[c] * catWeights[c], 0));
  }

  const baseSorted = [...baseZById.values()].sort((a, b) => b - a);
  const puntSorted = [...puntZById.values()].sort((a, b) => b - a);

  const picksUntilMe = state.picksUntilMe ?? 0;
  const scarcityByPosition = positionScarcity({
    available: pool,
    valueById: puntZById,
    picksUntilMe,
  });

  // Pass 2: components.
  interface Scored {
    player: Player;
    raw: number;
    parts: Omit<Recommendation, "playerId" | "playerName" | "positions" | "nbaTeam" | "adp" | "score" | "rank" | "shortReason" | "categoryZ" | "improves" | "hurts" | "reachLabel" | "survivalToNextPick"> & {
      reachLabel: Recommendation["reachLabel"];
      survivalToNextPick: number;
      improves: Category[];
      hurts: Category[];
      fitNote?: string;
    };
    z: CategoryVector;
  }

  const scored: Scored[] = pool.map((player) => {
    const z = zById.get(player.id)!;
    const hasProjection = Boolean(player.projection);

    // Ranking-only fallback: without projections we can still order by the
    // platform's own rank, but every fit component stays neutral.
    //
    // Base value is ABSOLUTE — a fixed mapping of total 9-CAT z — not a
    // percentile of what happens to be left. A percentile would hand the best
    // remaining player ~1.0 in every round, so a round-12 board would score just
    // as high as a round-1 board.
    const baseValue = hasProjection
      ? logistic(baseZById.get(player.id)! / BASE_VALUE_SPAN)
      : rankFallback(player, pool.length);
    // Punt fit compares standings, so it stays percentile-based on both sides.
    const puntFit = hasProjection
      ? clamp(
          0.5 +
            (percentileOf(puntZById.get(player.id)!, puntSorted) -
              percentileOf(baseZById.get(player.id)!, baseSorted)),
        )
      : 0.5;

    const fit = hasProjection ? rosterFit(player, state.myRoster, league, scarcityByPosition) : { score: 0.5, note: undefined };
    const categoryNeed = hasProjection ? categoryNeedScore(z, need, catWeights, categories) : 0.5;
    const scarcity = player.positions.length
      ? Math.max(...player.positions.map((p) => scarcityByPosition[p] ?? 0))
      : 0.3;
    const adpValue = adpValueScore(player, state.currentPick, league.teams);
    const momentum = marketMomentum(player, league.teams);
    const upside = hasProjection ? upsideScore(player, stats, momentum ?? 0) : 0.4;

    const note = notes[player.id];
    const injuryRisk = clamp(injuryRiskScore(player, stats.availabilityWeight) + (note?.risk ? 0.3 : 0));
    const survival = survivalProbability(player, pool, picksUntilMe, state.currentPick);
    const { improves, hurts } = improvesAndHurts(z, catWeights, categories);

    let raw =
      baseValue * weights.baseValue +
      fit.score * weights.rosterFit +
      categoryNeed * weights.categoryNeed +
      puntFit * weights.puntFit +
      scarcity * weights.scarcity +
      adpValue * weights.adpValue +
      upside * weights.upside -
      injuryRisk * weights.injuryRisk;

    // A player who will not last until the next pick is worth taking now.
    raw += (1 - survival) * SURVIVAL_URGENCY_BONUS;
    if (note) raw += clamp(note.adjustment, -1, 1) * NOTE_INFLUENCE;

    return {
      player,
      raw,
      z,
      parts: {
        baseValue,
        rosterFit: fit.score,
        categoryNeed,
        puntFit,
        scarcity,
        adpValue,
        upside,
        injuryRisk,
        reachLabel: reachLabel(player, state.currentPick, league.teams),
        survivalToNextPick: survival,
        improves,
        hurts,
        fitNote: fit.note,
        marketMomentum: momentum,
        noteAdjustment: note?.adjustment,
        projectedGames: player.projection?.gp,
      },
    };
  });

  scored.sort((a, b) => b.raw - a.raw);

  // The best conceivable pick: every positive component maxed out, nothing lost
  // to injury risk. Scores are a share of that, so they stay comparable across
  // rounds, and are computed before pinning so a pin never changes a score.
  const maxAchievable =
    weights.baseValue +
    weights.rosterFit +
    weights.categoryNeed +
    weights.puntFit +
    weights.scarcity +
    weights.adpValue +
    weights.upside +
    SURVIVAL_URGENCY_BONUS;
  const displayScores = toAbsoluteScores(
    scored.map((s) => s.raw),
    maxAchievable,
  );
  const withScores = scored.map((entry, index) => ({ entry, display: displayScores[index] }));

  // Pinning is a display preference, not a value judgement: it lifts a player to
  // the top of the list while leaving the score that justified it untouched.
  // Array.prototype.sort is stable, so order within each group is preserved.
  const ordered = pinned.size
    ? [...withScores].sort(
        (a, b) => Number(pinned.has(b.entry.player.id)) - Number(pinned.has(a.entry.player.id)),
      )
    : withScores;

  const top = ordered.slice(0, limit);

  const recommendations: Recommendation[] = top.map(({ entry, display }, index) => ({
    playerId: entry.player.id,
    playerName: entry.player.name,
    positions: entry.player.positions,
    nbaTeam: entry.player.nbaTeam,
    adp: entry.player.adp,
    score: display,
    rank: index + 1,
    baseValue: entry.parts.baseValue,
    rosterFit: entry.parts.rosterFit,
    categoryNeed: entry.parts.categoryNeed,
    puntFit: entry.parts.puntFit,
    scarcity: entry.parts.scarcity,
    adpValue: entry.parts.adpValue,
    upside: entry.parts.upside,
    injuryRisk: entry.parts.injuryRisk,
    reachLabel: entry.parts.reachLabel,
    survivalToNextPick: entry.parts.survivalToNextPick,
    improves: entry.parts.improves,
    hurts: entry.parts.hurts,
    categoryZ: entry.z,
    marketMomentum: entry.parts.marketMomentum,
    noteAdjustment: entry.parts.noteAdjustment,
    projectedGames: entry.player.projection?.gp,
    referenceGames: stats.referenceGp,
    shortReason: buildShortReason(entry.parts, strategy, pinned.has(entry.player.id)),
  }));

  const categoryPercentiles = {} as Record<Category, number>;
  for (const category of CATEGORIES) {
    categoryPercentiles[category] = Math.round(profile.percentile[category] * 100);
  }

  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    recommendations,
    strategy,
    categoryPercentiles,
    categoryProfile: profile,
    stats,
    computedAtMs: startedAt,
    durationMs: ended - started,
  };
}

function rankFallback(player: Player, poolSize: number): number {
  const rank = player.rank ?? player.adp;
  if (rank === undefined) return 0.25;
  return clamp(1 - rank / Math.max(poolSize, 50));
}

function buildShortReason(
  parts: {
    improves: Category[];
    hurts: Category[];
    survivalToNextPick: number;
    reachLabel: string;
    fitNote?: string;
    marketMomentum?: number;
    noteAdjustment?: number;
    projectedGames?: number;
  },
  strategy: StrategyState,
  isPinned: boolean,
): string {
  const bits: string[] = [];
  if (isPinned) bits.push("已釘選");
  if (parts.noteAdjustment !== undefined && parts.noteAdjustment > 0) bits.push("你標記看好");
  if (parts.noteAdjustment !== undefined && parts.noteAdjustment < 0) bits.push("你標記看衰");
  if ((parts.marketMomentum ?? 0) >= 0.35) bits.push("市場正在追捧");
  else if ((parts.marketMomentum ?? 0) <= -0.35) bits.push("市場正在降溫");
  if (parts.projectedGames !== undefined && parts.projectedGames < 60) {
    bits.push(`只預計打 ${Math.round(parts.projectedGames)} 場`);
  }
  if (parts.improves.length) bits.push(`補 ${parts.improves.slice(0, 3).join("/")}`);
  if (parts.fitNote) bits.push(parts.fitNote);
  const hardOrSoft = CATEGORIES.filter((c) => strategy.punts[c] !== "none");
  if (hardOrSoft.length && parts.hurts.every((h) => strategy.punts[h] !== "none")) {
    bits.push(`符合 punt ${hardOrSoft.join("/")} 方向`);
  } else if (parts.hurts.length) {
    bits.push(`但傷 ${parts.hurts.slice(0, 2).join("/")}`);
  }
  if (parts.survivalToNextPick < 0.2) bits.push("下一輪幾乎等不到");
  else if (parts.survivalToNextPick > 0.8) bits.push("下一輪大機率還在");
  if (parts.reachLabel === "Great Value") bits.push("ADP 撿到");
  return bits.slice(0, 3).join("，") || "整體價值最高";
}

export { buildCategoryProfile };
