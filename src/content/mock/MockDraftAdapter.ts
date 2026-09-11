import { overallPickFor, pickInRoundOf, roundOf, slotForOverallPick } from "@/shared/snake";
import type { LeagueSettings, Player } from "@/shared/types";
import { scoreHealth, type AdapterSnapshot, type DraftPlatformAdapter, type PlatformDraftPick } from "../adapter";

export interface MockDraftOptions {
  league: LeagueSettings;
  pool: Player[];
  myDraftSlot: number;
  /** Milliseconds between simulated opponent picks; 0 means manual stepping. */
  autoPickMs?: number;
  seed?: number;
}

/**
 * In-memory draft simulator.
 *
 * Lets the entire pipeline — state, engine, overlay, persistence — be exercised
 * without a live Yahoo room, which is also what the E2E test drives.
 */
export class MockDraftAdapter implements DraftPlatformAdapter {
  readonly platform = "mock" as const;

  private picks: PlatformDraftPick[] = [];
  private taken = new Set<string>();
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>;
  private rngState: number;
  private startedAt = Date.now();

  constructor(private readonly options: MockDraftOptions) {
    this.rngState = (options.seed ?? 42) >>> 0;
    if (options.autoPickMs && options.autoPickMs > 0) this.start(options.autoPickMs);
  }

  detect(): boolean {
    return true;
  }

  get currentPick(): number {
    return this.picks.length + 1;
  }

  get isMyTurn(): boolean {
    return slotForOverallPick(this.currentPick, this.options.league) === this.options.myDraftSlot;
  }

  start(intervalMs: number): void {
    this.stop();
    this.timer = setInterval(() => {
      // The simulator never picks for the user — that stays a human decision.
      if (this.isMyTurn) return;
      this.simulatePick();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Advances one pick. Returns false when the pool or roster limit is exhausted. */
  simulatePick(): boolean {
    const board = this.options.pool.filter((p) => !this.taken.has(p.id));
    if (board.length === 0) return false;

    // Opponents draft near ADP with a little noise, which is what makes the
    // survival-probability model worth testing.
    const window = board
      .slice()
      .sort((a, b) => (a.adp ?? a.rank ?? 9999) - (b.adp ?? b.rank ?? 9999))
      .slice(0, 6);
    const chosen = window[Math.floor(this.random() * Math.min(window.length, 4))] ?? window[0];
    this.commit(chosen, slotForOverallPick(this.currentPick, this.options.league) === this.options.myDraftSlot);
    return true;
  }

  /** Records the user's own pick. */
  draftForMe(playerId: string): boolean {
    const player = this.options.pool.find((p) => p.id === playerId && !this.taken.has(p.id));
    if (!player) return false;
    this.commit(player, true);
    return true;
  }

  reset(): void {
    this.picks = [];
    this.taken.clear();
    this.startedAt = Date.now();
    this.emit();
  }

  snapshot(): AdapterSnapshot {
    const overall = this.currentPick;
    const league = this.options.league;
    return {
      league,
      meta: {
        currentRound: roundOf(overall, league.teams),
        currentPick: overall,
        myDraftSlot: this.options.myDraftSlot,
        secondsRemaining: league.secondsPerPick
          ? Math.max(0, league.secondsPerPick - Math.floor((Date.now() - this.startedAt) / 1000) % league.secondsPerPick)
          : undefined,
      },
      drafted: this.picks,
      myRoster: this.picks.filter((p) => p.isMine).map((p) => p.player),
      available: this.options.pool.filter((p) => !this.taken.has(p.id)).slice(0, 60).map((p) => ({
        providerId: p.id,
        name: p.name,
        nbaTeam: p.nbaTeam,
        positions: p.positions,
        rank: p.rank,
        adp: p.adp,
      })),
      health: scoreHealth({
        boardFound: true,
        pickCount: this.picks.length,
        rosterFound: true,
        currentPickFound: true,
        warnings: [],
      }),
    };
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Overall pick numbers owned by the user, for the UI. */
  myPicks(rounds = 13): number[] {
    return Array.from({ length: rounds }, (_, i) => overallPickFor(i + 1, this.options.myDraftSlot, this.options.league));
  }

  private commit(player: Player, isMine: boolean): void {
    const overall = this.currentPick;
    const league = this.options.league;
    this.taken.add(player.id);
    this.picks.push({
      overall,
      round: roundOf(overall, league.teams),
      pickInRound: pickInRoundOf(overall, league.teams),
      teamId: `team-${slotForOverallPick(overall, league)}`,
      isMine,
      player: {
        providerId: player.id,
        name: player.name,
        nbaTeam: player.nbaTeam,
        positions: player.positions,
        rank: player.rank,
        adp: player.adp,
      },
      timestamp: Date.now(),
    });
    this.startedAt = Date.now();
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private random(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 0x100000000;
  }
}
