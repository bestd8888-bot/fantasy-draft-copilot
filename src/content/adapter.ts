import type { DraftMeta, LeagueSettings, ParserHealth, PlatformPlayer } from "@/shared/types";

export interface PlatformDraftPick {
  overall?: number;
  round?: number;
  pickInRound?: number;
  teamId?: string;
  teamName?: string;
  isMine: boolean;
  player: PlatformPlayer;
  timestamp?: number;
}

export interface AdapterSnapshot {
  league: Partial<LeagueSettings>;
  meta: DraftMeta;
  drafted: PlatformDraftPick[];
  myRoster: PlatformPlayer[];
  /**
   * Players the page currently shows as available. May be incomplete (virtualized
   * lists); the store treats `masterPool - drafted` as the source of truth and
   * uses this only to enrich metadata.
   */
  available: PlatformPlayer[];
  /**
   * True when `available` is the platform's own list of undrafted players and can
   * be used as the pool directly (Yahoo's draft client filters drafted players
   * out of its table). False when it is just whatever rows happen to be rendered,
   * in which case the store uses `master DB - drafted` instead.
   */
  availableIsAuthoritative?: boolean;
  health: ParserHealth;
}

export interface DraftPlatformAdapter {
  readonly platform: "yahoo" | "mock" | "fixture";
  /** True when this adapter recognises the current page. */
  detect(): boolean;
  snapshot(): AdapterSnapshot;
  /** Calls back whenever the page changes in a way that may alter the snapshot. */
  subscribe(callback: () => void): () => void;
}

export function emptyHealth(warnings: string[] = []): ParserHealth {
  return {
    boardFound: false,
    pickCount: 0,
    rosterFound: false,
    currentPickFound: false,
    confidence: 0,
    warnings,
  };
}

/**
 * Parser confidence drives the overlay's trust model:
 *   >= 0.6  green, recommendations live
 *   0.35-0.6 yellow, recommendations shown but marked stale
 *   < 0.35  red, recommendations disabled
 */
export function scoreHealth(health: Omit<ParserHealth, "confidence">): ParserHealth {
  let confidence = 0;
  if (health.boardFound) confidence += 0.35;
  if (health.currentPickFound) confidence += 0.3;
  if (health.rosterFound) confidence += 0.2;
  if (health.pickCount > 0) confidence += 0.15;
  confidence -= Math.min(0.3, health.warnings.length * 0.1);
  return { ...health, confidence: Math.max(0, Math.min(1, confidence)) };
}
