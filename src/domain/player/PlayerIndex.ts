import { fallbackPlayerId, normalizeName, parsePositions } from "@/shared/names";
import type { PlatformPlayer, Player } from "@/shared/types";

/**
 * Matches players scraped off the draft page against the master projection DB.
 *
 * Matching order: provider id -> normalized name + team -> unique normalized name.
 * An ambiguous bare-name match is rejected rather than guessed, so the engine
 * never silently attributes the wrong projection to a drafted player.
 */
export class PlayerIndex {
  private readonly byId = new Map<string, Player>();
  private readonly byYahooId = new Map<string, Player>();
  private readonly byNameTeam = new Map<string, Player>();
  private readonly byName = new Map<string, Player[]>();

  constructor(players: Player[]) {
    for (const player of players) {
      this.byId.set(player.id, player);
      if (player.providerIds?.yahoo) this.byYahooId.set(player.providerIds.yahoo, player);
      if (player.nbaTeam) this.byNameTeam.set(`${player.normalizedName}|${player.nbaTeam.toLowerCase()}`, player);
      const bucket = this.byName.get(player.normalizedName);
      if (bucket) bucket.push(player);
      else this.byName.set(player.normalizedName, [player]);
    }
  }

  get size(): number {
    return this.byId.size;
  }

  all(): Player[] {
    return [...this.byId.values()];
  }

  get(id: string): Player | undefined {
    return this.byId.get(id);
  }

  match(candidate: PlatformPlayer): Player | undefined {
    if (candidate.providerId) {
      const byProvider = this.byYahooId.get(candidate.providerId);
      if (byProvider) return byProvider;
    }
    const key = normalizeName(candidate.name);
    if (candidate.nbaTeam) {
      const exact = this.byNameTeam.get(`${key}|${candidate.nbaTeam.toLowerCase()}`);
      if (exact) return exact;
    }
    const bucket = this.byName.get(key);
    if (bucket && bucket.length === 1) return bucket[0];
    return undefined;
  }

  /**
   * Match, or synthesise a projection-less placeholder so an unknown drafted
   * player is still removed from the available pool.
   */
  resolve(candidate: PlatformPlayer): Player {
    const matched = this.match(candidate);
    if (matched) return matched;
    const nbaTeam = (candidate.nbaTeam ?? "").toUpperCase();
    return {
      id: candidate.providerId ?? fallbackPlayerId(candidate.name, nbaTeam),
      providerIds: candidate.providerId ? { yahoo: candidate.providerId } : undefined,
      name: candidate.name,
      normalizedName: normalizeName(candidate.name),
      nbaTeam,
      positions: parsePositions(candidate.positions),
      rank: candidate.rank,
      adp: candidate.adp,
      injuryStatus: candidate.injuryStatus,
      tags: ["unmatched"],
    };
  }
}
