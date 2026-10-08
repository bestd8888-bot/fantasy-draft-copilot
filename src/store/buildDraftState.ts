import type { AdapterSnapshot } from "@/content/adapter";
import type { PlayerIndex } from "@/domain/player/PlayerIndex";
import { nextPickForSlot, pickInRoundOf, roundOf, slotForOverallPick } from "@/shared/snake";
import { parsePositions } from "@/shared/names";
import { CATEGORIES } from "@/shared/types";
import type {
  AppSettings,
  PlatformPlayer,
  Projection,
  DraftPick,
  DraftState,
  ParserStatus,
  Player,
  RosterPlayer,
  SessionOverrides,
} from "@/shared/types";

export interface BuildInput {
  snapshot: AdapterSnapshot;
  index: PlayerIndex;
  settings: AppSettings;
  overrides: SessionOverrides;
  sessionId: string;
  platform: DraftState["platform"];
  /** Picks recovered from storage, merged in when the page shows fewer. */
  persistedPicks?: DraftPick[];
  /** Projections seen earlier in this draft, keyed by provider id. */
  projectionCache?: Record<string, Projection>;
}

function statusFromConfidence(confidence: number): ParserStatus {
  if (confidence >= 0.6) return "ok";
  if (confidence >= 0.35) return "partial";
  return "error";
}

/**
 * Turns a platform snapshot into the normalized DraftState the engine consumes.
 *
 * The available pool is `master DB - drafted`, never "the rows currently in the
 * DOM": Yahoo virtualizes its player list, so the visible rows are only used to
 * enrich metadata such as ADP and injury status.
 */
export function buildDraftState(input: BuildInput): DraftState {
  const { snapshot, index, settings, overrides, sessionId, platform, projectionCache } = input;
  const league = { ...settings.league, ...snapshot.league };
  const teams = league.teams;

  // --- drafted picks -------------------------------------------------------
  const byOverall = new Map<number, DraftPick>();
  const seenPlayers = new Set<string>();

  const addPick = (pick: DraftPick) => {
    // sessionId + overall is the unique key; a player can never be drafted twice.
    if (seenPlayers.has(pick.playerId)) return;
    if (byOverall.has(pick.overall)) return;
    byOverall.set(pick.overall, pick);
    seenPlayers.add(pick.playerId);
  };

  for (const persisted of input.persistedPicks ?? []) addPick(persisted);

  snapshot.drafted.forEach((raw, idx) => {
    const player = index.resolve(raw.player);
    const overall =
      raw.overall ?? (raw.round && raw.pickInRound ? (raw.round - 1) * teams + raw.pickInRound : idx + 1);
    const pick: DraftPick = {
      overall,
      round: raw.round ?? roundOf(overall, teams),
      pickInRound: raw.pickInRound ?? pickInRoundOf(overall, teams),
      teamId: raw.teamId,
      isMine: raw.isMine,
      playerId: player.id,
      playerName: player.name,
      timestamp: raw.timestamp,
    };
    // The live page wins over persisted data for the same slot.
    if (byOverall.has(overall) && byOverall.get(overall)!.playerId !== player.id) {
      const stale = byOverall.get(overall)!;
      seenPlayers.delete(stale.playerId);
      byOverall.delete(overall);
    }
    addPick(pick);
  });

  for (const playerId of overrides.manualDrafted) {
    const player = index.get(playerId);
    if (!player || seenPlayers.has(playerId)) continue;
    const overall = byOverall.size + 1;
    addPick({
      overall,
      round: roundOf(overall, teams),
      pickInRound: pickInRoundOf(overall, teams),
      isMine: false,
      playerId,
      playerName: player.name,
    });
  }

  const drafted = [...byOverall.values()].sort((a, b) => a.overall - b.overall);
  const draftedIds = new Set(drafted.map((p) => p.playerId));

  // --- my roster -----------------------------------------------------------
  const rosterById = new Map<string, RosterPlayer>();
  for (const pick of drafted.filter((p) => p.isMine)) {
    const player = index.get(pick.playerId);
    if (player) rosterById.set(player.id, { ...player, draftRound: pick.round, draftPick: pick.overall });
  }
  for (const raw of snapshot.myRoster) {
    const player =
      index.match(raw) ??
      (raw.projection || snapshot.availableIsAuthoritative ? mergePlatformPlayer(raw, index, projectionCache) : undefined);
    if (player && !rosterById.has(player.id)) rosterById.set(player.id, { ...player });
  }
  for (const playerId of overrides.manualRoster) {
    const player = index.get(playerId);
    if (player && !rosterById.has(player.id)) rosterById.set(player.id, { ...player });
  }
  const myRoster = [...rosterById.values()];

  // --- available pool ------------------------------------------------------
  // Two sources, in priority order:
  //   1. The platform's own undrafted list, when it is authoritative and carries
  //      projections (Yahoo's draft client table). Nothing needs importing.
  //   2. Otherwise master DB - drafted, because a rendered list may only be the
  //      visible window of a virtualized table.
  let available: Player[];

  if (snapshot.availableIsAuthoritative && snapshot.available.length > 0) {
    const seen = new Set<string>();
    available = [];
    for (const raw of snapshot.available) {
      const player = mergePlatformPlayer(raw, index, projectionCache);
      if (seen.has(player.id) || draftedIds.has(player.id) || rosterById.has(player.id)) continue;
      seen.add(player.id);
      available.push(player);
    }
  } else {
    const platformMeta = new Map<string, (typeof snapshot.available)[number]>();
    for (const raw of snapshot.available) {
      const matched = index.match(raw);
      if (matched) platformMeta.set(matched.id, raw);
    }

    available = index
      .all()
      .filter((p) => !draftedIds.has(p.id) && !rosterById.has(p.id))
      .map((p) => {
        const meta = platformMeta.get(p.id);
        if (!meta) return p;
        return {
          ...p,
          rank: p.rank ?? meta.rank,
          adp: p.adp ?? meta.adp,
          injuryStatus: meta.injuryStatus ?? p.injuryStatus,
        };
      });
  }

  // --- pick position -------------------------------------------------------
  const currentPick = snapshot.meta.currentPick ?? drafted.length + 1;
  const currentRound = snapshot.meta.currentRound ?? roundOf(currentPick, teams);

  const myPicks = drafted.filter((p) => p.isMine);
  // "You're up in N picks" is read straight off the page, so it also pins down
  // which draft slot is the user's — more reliable than inferring from picks.
  const slotFromCountdown =
    snapshot.meta.picksUntilMe !== undefined
      ? slotForOverallPick(currentPick + snapshot.meta.picksUntilMe, league)
      : undefined;

  // Before the first pick there is no countdown yet, but the player list already
  // marks the user's upcoming picks — any one of them maps back to their slot.
  const slotFromMarkers = snapshot.meta.myPickNumbers?.length
    ? slotForOverallPick(snapshot.meta.myPickNumbers[0], league)
    : undefined;

  const myDraftSlot =
    settings.myDraftSlot ??
    snapshot.meta.myDraftSlot ??
    slotFromCountdown ??
    slotFromMarkers ??
    (myPicks.length > 0 ? slotForOverallPick(myPicks[0].overall, league) : undefined);

  const nextMyPick = myDraftSlot ? nextPickForSlot(currentPick, myDraftSlot, league) : undefined;
  const picksUntilMe =
    snapshot.meta.picksUntilMe ?? (nextMyPick !== undefined ? nextMyPick - currentPick : undefined);

  return {
    platform,
    sessionId,
    configWarnings: leagueSizeWarnings(snapshot.meta, league.teams),
    league,
    currentRound,
    currentPick,
    myDraftSlot,
    nextMyPick,
    picksUntilMe,
    secondsRemaining: snapshot.meta.secondsRemaining,
    drafted,
    myRoster,
    available,
    strategy: {
      mode: settings.strategyMode,
      punts: settings.manualPunts,
      // In manual mode every explicitly punted category is locked against auto-detection.
      lockedCategories: CATEGORIES.filter((c) => settings.manualPunts[c] && settings.manualPunts[c] !== "none"),
      confidence: 0,
    },
    updatedAt: Date.now(),
    parserStatus: statusFromConfidence(snapshot.health.confidence),
    parserHealth: snapshot.health,
  };
}

/**
 * Turns a platform row into a Player: the master DB wins when it has a match,
 * otherwise the page's own projection is used so the engine still has real data.
 */
function mergePlatformPlayer(
  raw: PlatformPlayer,
  index: PlayerIndex,
  projectionCache?: Record<string, Projection>,
): Player {
  const matched = index.match(raw);
  const base = matched ?? index.resolve(raw);
  const cached = raw.providerId ? projectionCache?.[raw.providerId] : undefined;
  return {
    ...base,
    positions: base.positions.length ? base.positions : parsePositions(raw.positions),
    nbaTeam: base.nbaTeam || (raw.nbaTeam ?? "").toUpperCase(),
    rank: matched?.rank ?? raw.rank,
    adp: matched?.adp ?? raw.adp,
    injuryStatus: raw.injuryStatus ?? base.injuryStatus,
    projection: base.projection ?? raw.projection ?? cached,
    tags: base.projection || raw.projection || cached ? base.tags?.filter((t) => t !== "unmatched") : base.tags,
  };
}

/**
 * Cross-checks the configured league size against what the page reports.
 *
 * "Round R, Pick P" pins the team count: round R spans picks (R-1)T+1 .. RT.
 * A friend in a 10-team league who never changed the default of 12 would
 * otherwise get silently wrong slot and snake math with nothing on screen to
 * suggest it.
 */
export function leagueSizeWarnings(
  meta: { currentRound?: number; currentPick?: number },
  teams: number,
): string[] {
  const round = meta.currentRound;
  const pick = meta.currentPick;
  if (!round || !pick || round < 2) return [];
  const consistent = (round - 1) * teams < pick && pick <= round * teams;
  if (consistent) return [];

  const candidates: number[] = [];
  for (let t = 4; t <= 20; t++) if ((round - 1) * t < pick && pick <= round * t) candidates.push(t);
  const hint = candidates.length ? `（依目前 Round ${round}、Pick ${pick} 推算應為 ${candidates.join(" / ")} 隊）` : "";
  return [`聯盟隊伍數設定為 ${teams} 隊，但跟選秀室對不上${hint}，請到設定頁修正`];
}
