import { CATEGORIES, type Category, type Player, type Projection } from "@/shared/types";
import { mean, stdev } from "@/shared/util";

/** Balanced default: availability matters, but not linearly (H2H allows streaming). */
export const DEFAULT_AVAILABILITY_WEIGHT = 0.5;

export interface PoolStats {
  leagueFgPct: number;
  leagueFtPct: number;
  mean: Record<Category, number>;
  sd: Record<Category, number>;
  size: number;
  /** Games a durable player is projected to play, from the pool itself. */
  referenceGp: number;
  /**
   * How much projected availability counts, 0..1.
   *   0   = pure per-game production (games played ignored)
   *   0.5 = balanced; a 45-game player keeps ~79% of their value
   *   1   = full season totals; value scales linearly with games
   */
  availabilityWeight: number;
}

export type CategoryVector = Record<Category, number>;

export function emptyVector(): CategoryVector {
  return CATEGORIES.reduce((acc, c) => {
    acc[c] = 0;
    return acc;
  }, {} as CategoryVector);
}

/**
 * Raw per-category impact for one projection.
 *
 * Percentage categories are volume-adjusted (`(pct - leagueAvg) * attempts`)
 * because a 90% free-throw shooter on 1 attempt per game barely moves a week.
 * TO stays positive here and is inverted when standardized.
 */
export function rawImpacts(projection: Projection, leagueFgPct: number, leagueFtPct: number): CategoryVector {
  const vector = emptyVector();
  vector["FG%"] = ((projection.fgPct ?? leagueFgPct) - leagueFgPct) * (projection.fga ?? 0);
  vector["FT%"] = ((projection.ftPct ?? leagueFtPct) - leagueFtPct) * (projection.fta ?? 0);
  vector["3PM"] = projection.threes;
  vector.PTS = projection.pts;
  vector.REB = projection.reb;
  vector.AST = projection.ast;
  vector.STL = projection.stl;
  vector.BLK = projection.blk;
  vector.TO = projection.tov;
  return vector;
}

/**
 * Builds the standardization baseline from the fantasy-relevant slice of the
 * pool (roughly the players who will actually be rostered), not from every
 * player in the file — deep bench players would drag the means down.
 */
export function buildPoolStats(
  players: Player[],
  relevantCount?: number,
  availabilityWeight = DEFAULT_AVAILABILITY_WEIGHT,
): PoolStats {
  const projected = players.filter((p): p is Player & { projection: Projection } => Boolean(p.projection));
  const ordered = [...projected].sort((a, b) => (a.adp ?? a.rank ?? 9999) - (b.adp ?? b.rank ?? 9999));
  const slice = relevantCount ? ordered.slice(0, Math.max(20, relevantCount)) : ordered;
  const source = slice.length >= 20 ? slice : ordered;

  const totalFgm = source.reduce((acc, p) => acc + (p.projection.fgm ?? (p.projection.fga ?? 0) * (p.projection.fgPct ?? 0)), 0);
  const totalFga = source.reduce((acc, p) => acc + (p.projection.fga ?? 0), 0);
  const totalFtm = source.reduce((acc, p) => acc + (p.projection.ftm ?? (p.projection.fta ?? 0) * (p.projection.ftPct ?? 0)), 0);
  const totalFta = source.reduce((acc, p) => acc + (p.projection.fta ?? 0), 0);

  const leagueFgPct = totalFga > 0 ? totalFgm / totalFga : 0.46;
  const leagueFtPct = totalFta > 0 ? totalFtm / totalFta : 0.78;

  const impacts = source.map((p) => rawImpacts(p.projection, leagueFgPct, leagueFtPct));
  const means = emptyVector();
  const sds = emptyVector();
  for (const category of CATEGORIES) {
    const values = impacts.map((v) => v[category]);
    const m = mean(values);
    means[category] = m;
    sds[category] = stdev(values, m) || 1;
  }

  // Reference durability comes from the pool, so it self-calibrates to whatever
  // the projection source assumes about a full season.
  const games = source.map((p) => p.projection.gp).filter((g) => g > 0).sort((a, b) => a - b);
  const referenceGp = games.length ? Math.max(60, games[Math.floor(games.length * 0.9)]) : 72;

  return {
    leagueFgPct,
    leagueFtPct,
    mean: means,
    sd: sds,
    size: source.length,
    referenceGp,
    availabilityWeight,
  };
}

/**
 * Fraction of a full season's impact this player is projected to deliver.
 *
 * Per-game production alone hides availability: a 45-game star and a 78-game
 * star look identical once totals are divided by games played. Scaling the
 * standardized value by availability restores it — and it correctly shrinks
 * NEGATIVE categories too, because a player who misses games also does less
 * damage to the categories they hurt.
 */
export function availabilityFactor(projection: Projection, stats: PoolStats): number {
  if (stats.availabilityWeight <= 0) return 1;
  const ratio = projection.gp > 0 ? projection.gp / Math.max(1, stats.referenceGp) : 0;
  return Math.min(1.1, Math.pow(Math.max(0, ratio), stats.availabilityWeight));
}

/** Standardized 9-CAT value. Higher is always better, including TO. */
export function zScores(projection: Projection, stats: PoolStats): CategoryVector {
  const raw = rawImpacts(projection, stats.leagueFgPct, stats.leagueFtPct);
  const availability = availabilityFactor(projection, stats);
  const z = emptyVector();
  for (const category of CATEGORIES) {
    const value = ((raw[category] - stats.mean[category]) / stats.sd[category]) * availability;
    z[category] = category === "TO" ? -value : value;
  }
  return z;
}

export function totalZ(z: CategoryVector, categories: readonly Category[] = CATEGORIES): number {
  return categories.reduce((acc, c) => acc + z[c], 0);
}

export function weightedZ(z: CategoryVector, weights: Partial<CategoryVector>, categories: readonly Category[] = CATEGORIES): number {
  return categories.reduce((acc, c) => acc + z[c] * (weights[c] ?? 1), 0);
}
