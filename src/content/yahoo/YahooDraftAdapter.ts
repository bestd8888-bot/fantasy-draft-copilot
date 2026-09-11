import type { DraftMeta, LeagueSettings, ParserHealth, PlatformPlayer } from "@/shared/types";
import { scoreHealth, type AdapterSnapshot, type DraftPlatformAdapter, type PlatformDraftPick } from "../adapter";
import { observeDraftRoom } from "./observer";
import { cleanText, parseOverallPick, parsePickRow, parsePlayerRow, parseRound, parseTimerSeconds } from "./parser";
import { resolveAll, resolveFirst, yahooSelectors } from "./selectors";
import { findPlayersTable, parseDraftClient } from "./draftClient";

export interface YahooAdapterOptions {
  /** Set from settings when the page does not expose which team is the user's. */
  myTeamName?: string;
  myDraftSlot?: number;
  teams?: number;
}

export class YahooDraftAdapter implements DraftPlatformAdapter {
  readonly platform = "yahoo" as const;

  constructor(private options: YahooAdapterOptions = {}) {}

  setOptions(options: YahooAdapterOptions): void {
    this.options = { ...this.options, ...options };
  }

  detect(): boolean {
    if (!/fantasysports\.yahoo\.com$/.test(location.hostname)) return false;
    return /draft/i.test(location.pathname) || Boolean(resolveFirst(document, yahooSelectors.draftBoard));
  }

  snapshot(): AdapterSnapshot {
    // The live draft client is the primary path; the generic board parser below
    // stays as a fallback for other Yahoo draft surfaces and for the fixtures.
    const client = this.snapshotFromDraftClient();
    if (client) return client;
    return this.snapshotFromBoard();
  }

  /**
   * Yahoo's draft client renders the full available-player table with projections,
   * so the pool and the projections both come straight off the page — no import
   * needed — and drafted players are already filtered out of that table.
   */
  private snapshotFromDraftClient(): AdapterSnapshot | undefined {
    const parsed = parseDraftClient(document);
    if (!parsed || !parsed.tableFound) return undefined;

    const health = scoreHealth({
      boardFound: parsed.tableFound,
      // The client gives no completed-pick list; the pick number implies the count.
      pickCount: Math.max(0, (parsed.meta.currentPick ?? 1) - 1),
      // A located-but-empty roster panel is a healthy parse at the start of a
      // draft; only a missing panel counts against confidence.
      rosterFound: parsed.rosterPanelFound,
      currentPickFound: parsed.meta.currentPick !== undefined,
      warnings: parsed.warnings,
    });

    return {
      league: this.parseLeague(),
      meta: { ...parsed.meta, myDraftSlot: this.options.myDraftSlot ?? parsed.meta.myDraftSlot },
      drafted: [],
      myRoster: parsed.myRoster,
      available: parsed.players,
      availableIsAuthoritative: true,
      health,
    };
  }

  private snapshotFromBoard(): AdapterSnapshot {
    const warnings: string[] = [];

    const board = resolveFirst(document, yahooSelectors.draftBoard);
    const results = resolveFirst(document, yahooSelectors.resultsPanel) ?? board;
    const myTeamPanel = resolveFirst(document, yahooSelectors.myTeamPanel);
    const playerList = resolveFirst(document, yahooSelectors.playerList);

    if (!board) warnings.push("draft board container not found");
    if (!results) warnings.push("draft results panel not found");
    if (!playerList) warnings.push("available player list not found");

    const drafted = results ? this.parseDrafted(results, warnings) : [];
    const myRoster = myTeamPanel ? this.parsePlayers(myTeamPanel) : [];
    const available = playerList ? this.parsePlayers(playerList) : [];
    const meta = this.parseMeta(drafted, warnings);

    if (!myTeamPanel) warnings.push("my-team panel not found — using manual roster tracking");

    const health: ParserHealth = scoreHealth({
      boardFound: Boolean(board),
      pickCount: drafted.length,
      rosterFound: myRoster.length > 0,
      currentPickFound: meta.currentPick !== undefined,
      warnings,
    });

    return { league: this.parseLeague(), meta, drafted, myRoster, available, health };
  }

  subscribe(callback: () => void): () => void {
    let disconnect = this.observe(callback);

    // The draft client is a SPA: on first load the player table may not exist
    // yet, so we start on document.body and re-scope once it appears.
    let rearm: ReturnType<typeof setInterval> | undefined;
    if (!findPlayersTable(document)) {
      rearm = setInterval(() => {
        if (!findPlayersTable(document)) return;
        clearInterval(rearm);
        rearm = undefined;
        disconnect();
        disconnect = this.observe(callback);
        callback();
      }, 2000);
    }

    return () => {
      if (rearm) clearInterval(rearm);
      disconnect();
    };
  }

  private observe(callback: () => void): () => void {
    const table = findPlayersTable(document);
    // On the live client the table and the status line sit in different subtrees,
    // so we watch the document and rely on the debounce plus the store's
    // fingerprint check to keep a ticking draft timer from causing real work.
    const roots = table
      ? [document.body]
      : [
          resolveFirst(document, yahooSelectors.draftBoard),
          resolveFirst(document, yahooSelectors.resultsPanel),
          resolveFirst(document, yahooSelectors.myTeamPanel),
          resolveFirst(document, yahooSelectors.playerList),
        ].filter((el): el is HTMLElement => Boolean(el));

    return observeDraftRoom({ roots, debounceMs: 250 }, callback);
  }

  private parseDrafted(root: HTMLElement, warnings: string[]): PlatformDraftPick[] {
    const { elements, matchedSelector } = resolveAll(root, yahooSelectors.pickRow);
    if (elements.length === 0) {
      warnings.push("no pick rows matched");
      return [];
    }

    const teams = this.options.teams ?? 12;
    const picks: PlatformDraftPick[] = [];
    for (const el of elements) {
      const parsed = parsePickRow(el);
      if (!parsed) continue;
      const overall =
        parsed.overall ??
        (parsed.round && parsed.pickInRound ? (parsed.round - 1) * teams + parsed.pickInRound : undefined);
      picks.push({
        overall,
        round: parsed.round,
        pickInRound: parsed.pickInRound,
        teamId: parsed.teamId,
        teamName: parsed.teamName,
        isMine: this.isMyRow(el, parsed.teamName),
        player: parsed.player,
      });
    }

    if (picks.length === 0 && elements.length > 4) {
      warnings.push(`pick rows matched (${matchedSelector}) but none parsed — selector drift likely`);
    }
    return picks;
  }

  private parsePlayers(root: HTMLElement): PlatformPlayer[] {
    const { elements } = resolveAll(root, yahooSelectors.playerRow);
    const players: PlatformPlayer[] = [];
    for (const el of elements) {
      const player = parsePlayerRow(el);
      if (player) players.push(player);
    }
    return players;
  }

  private parseMeta(drafted: PlatformDraftPick[], warnings: string[]): DraftMeta {
    const roundEl = resolveFirst(document, yahooSelectors.roundLabel);
    const pickEl = resolveFirst(document, yahooSelectors.currentPickLabel);
    const timerEl = resolveFirst(document, yahooSelectors.timer);

    const labelText = [cleanText(roundEl), cleanText(pickEl)].filter(Boolean).join(" ");
    const currentRound = parseRound(labelText);
    let currentPick = parseOverallPick(labelText);

    // Fall back to counting completed picks when the header cannot be read.
    if (currentPick === undefined && drafted.length > 0) {
      const maxOverall = Math.max(...drafted.map((p) => p.overall ?? 0));
      currentPick = (Number.isFinite(maxOverall) && maxOverall > 0 ? maxOverall : drafted.length) + 1;
      warnings.push("current pick inferred from pick count");
    }

    if (currentPick === undefined) warnings.push("current pick not found");

    return {
      currentRound,
      currentPick,
      myDraftSlot: this.options.myDraftSlot,
      secondsRemaining: timerEl ? parseTimerSeconds(cleanText(timerEl)) : undefined,
    };
  }

  /**
   * Intentionally returns nothing for team count on the live client: guessing it
   * from page text ("7 teams left") would silently corrupt every snake
   * calculation. The league size comes from the user's settings instead.
   */
  private parseLeague(): Partial<LeagueSettings> {
    return {};
  }

  private isMyRow(el: HTMLElement, teamName?: string): boolean {
    for (const selector of yahooSelectors.myTeamMarker.candidates) {
      try {
        if (el.matches(selector) || el.querySelector(selector)) return true;
      } catch {
        // ignore invalid selector
      }
    }
    const mine = this.options.myTeamName?.trim().toLowerCase();
    if (mine && teamName) return teamName.trim().toLowerCase() === mine;
    return false;
  }
}
