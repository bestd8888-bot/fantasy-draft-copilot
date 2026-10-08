import { create } from "zustand";
import type { AdapterSnapshot, DraftPlatformAdapter } from "@/content/adapter";
import { PlayerIndex } from "@/domain/player/PlayerIndex";
import { buildStats, recommend, type EngineResult } from "@/domain/recommendation/RecommendationEngine";
import type { PoolStats } from "@/domain/recommendation/zscore";
import { logger } from "@/shared/logger";
import { draftStateSchema } from "@/shared/schema";
import {
  DEFAULT_SETTINGS,
  EMPTY_OVERRIDES,
  NOTE_PRESETS,
  type AiExplanation,
  type AppSettings,
  type Category,
  type DraftPick,
  type DraftState,
  type NoteTag,
  type Player,
  type PlayerNote,
  type Projection,
  type PuntLevel,
  type SessionOverrides,
  type StrategyMode,
} from "@/shared/types";
import { buildDraftState } from "./buildDraftState";
import { loadNotes, loadSession, saveNotes, saveSession } from "./persistence";

export interface DraftStoreState {
  settings: AppSettings;
  overrides: SessionOverrides;
  players: Player[];
  index: PlayerIndex;
  stats?: PoolStats;

  state?: DraftState;
  result?: EngineResult;
  ai?: AiExplanation;
  aiStatus: "idle" | "loading" | "error" | "disabled";

  sessionId: string;
  platform: DraftState["platform"];
  /** Picks recovered from storage after a tab reload. */
  persistedPicks: DraftPick[];
  /** Guards against recomputing when only the draft timer changed. */
  lastFingerprint?: string;
  /**
   * Projections harvested from the draft page while each player was still on the
   * board, keyed by provider id. Drafted players leave Yahoo's table, so this is
   * what keeps the user's own roster scoreable.
   */
  projectionCache: Record<string, Projection>;
  /** The user's standing read on players, global and persistent across drafts. */
  notes: Record<string, PlayerNote>;
  /** Players the standardization baseline was built from, kept so it can be rebuilt. */
  baselinePool: Player[];
  lastError?: string;
  selectedPlayerId?: string;
  quickMode: boolean;

  setSettings: (settings: AppSettings) => void;
  setPlayers: (players: Player[]) => void;
  setOverrides: (patch: Partial<SessionOverrides>) => void;
  setAi: (ai: AiExplanation | undefined, status: DraftStoreState["aiStatus"]) => void;
  select: (playerId?: string) => void;
  togglePin: (playerId: string) => void;
  toggleBlacklist: (playerId: string) => void;
  markDrafted: (playerId: string) => void;
  addToMyRoster: (playerId: string) => void;
  setPunt: (category: Category, level: PuntLevel) => void;
  setNote: (playerId: string, name: string, tag: NoteTag | "clear") => void;
  setStrategyMode: (mode: StrategyMode) => void;
  ingest: (snapshot: AdapterSnapshot, platform: DraftState["platform"], sessionId: string) => void;
  recompute: () => void;
}

export const useDraftStore = create<DraftStoreState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  overrides: { ...EMPTY_OVERRIDES },
  players: [],
  index: new PlayerIndex([]),
  aiStatus: "idle",
  sessionId: "default-session",
  platform: "yahoo",
  persistedPicks: [],
  projectionCache: {},
  notes: {},
  baselinePool: [],
  quickMode: false,

  setSettings: (settings) => {
    const previous = get().settings;
    set({ settings });
    // Availability changes what a z-score means, so the baseline must be rebuilt
    // from the same pool it was originally derived from — not from the depleted
    // board, which would shift the scale mid-draft.
    if (previous.availabilityWeight !== settings.availabilityWeight) {
      const pool = get().baselinePool;
      set({
        stats: pool.length > 0 ? buildStats(pool, settings.league.teams, settings.availabilityWeight) : undefined,
      });
    }
    get().recompute();
  },

  setPlayers: (players) => {
    set({
      players,
      index: new PlayerIndex(players),
      // An empty import must NOT produce a baseline: buildStats([]) yields sd = 1
      // for every category, which turns z-scores into raw per-game numbers and
      // silently weights PTS ~20x STL. The page's own pool fills this in instead.
      stats:
        players.length > 0
          ? buildStats(players, get().settings.league.teams, get().settings.availabilityWeight)
          : undefined,
      baselinePool: players,
    });
    get().recompute();
  },

  setOverrides: (patch) => {
    const overrides = { ...get().overrides, ...patch };
    set({ overrides });
    void persist(get());
    get().recompute();
  },

  setAi: (ai, status) => set({ ai, aiStatus: status }),

  select: (playerId) => set({ selectedPlayerId: playerId }),

  togglePin: (playerId) => {
    const { pinned } = get().overrides;
    get().setOverrides({
      pinned: pinned.includes(playerId) ? pinned.filter((id) => id !== playerId) : [...pinned, playerId],
    });
  },

  toggleBlacklist: (playerId) => {
    const { blacklisted } = get().overrides;
    get().setOverrides({
      blacklisted: blacklisted.includes(playerId)
        ? blacklisted.filter((id) => id !== playerId)
        : [...blacklisted, playerId],
    });
  },

  markDrafted: (playerId) => {
    const { manualDrafted } = get().overrides;
    if (manualDrafted.includes(playerId)) return;
    get().setOverrides({ manualDrafted: [...manualDrafted, playerId] });
  },

  addToMyRoster: (playerId) => {
    const { manualRoster } = get().overrides;
    if (manualRoster.includes(playerId)) return;
    get().setOverrides({ manualRoster: [...manualRoster, playerId] });
  },

  setNote: (playerId, name, tag) => {
    const notes = { ...get().notes };
    if (tag === "clear") delete notes[playerId];
    else {
      const preset = NOTE_PRESETS[tag];
      notes[playerId] = {
        playerId,
        name,
        adjustment: preset.adjustment,
        risk: preset.risk,
        updatedAt: Date.now(),
      };
    }
    set({ notes });
    void saveNotes(notes);
    get().recompute();
  },

  setPunt: (category, level) => {
    const settings = get().settings;
    get().setSettings({
      ...settings,
      strategyMode: "manual",
      manualPunts: { ...settings.manualPunts, [category]: level },
    });
  },

  setStrategyMode: (mode) => {
    get().setSettings({ ...get().settings, strategyMode: mode });
  },

  ingest: (snapshot, platform, sessionId) => {
    const { index, settings, overrides, persistedPicks } = get();
    try {
      const projectionCache = harvestProjections(get().projectionCache, snapshot.available);
      const state = buildDraftState({
        snapshot,
        index,
        settings,
        overrides,
        sessionId,
        platform,
        persistedPicks,
        projectionCache,
      });

      // A ticking draft clock mutates the DOM every second. Only the parts that
      // can change a recommendation count as a real change; everything else just
      // refreshes the displayed countdown.
      //
      // Identity, not counts: Yahoo's table always shows 100 rows, so when a
      // player is drafted the next one slides in and the length never changes.
      // If the table repaints before the "Pick N" label, a count-based check
      // would keep recommending a player who is already gone.
      const fingerprint = [
        state.currentPick,
        state.picksUntilMe,
        state.parserStatus,
        idHash(state.available),
        idHash(state.myRoster),
        state.drafted.length,
      ].join("|");

      // Establish the standardization baseline from the first full board we see
      // and then keep it fixed: recomputing it from a shrinking pool would keep
      // re-centering the scale, making whoever is left always look elite.
      if (!get().stats && state.available.some((p) => p.projection)) {
        const baselinePool = [...state.available, ...state.myRoster];
        set({
          baselinePool,
          stats: buildStats(baselinePool, state.league.teams, settings.availabilityWeight),
        });
      }

      if (fingerprint === get().lastFingerprint && get().result) {
        set({ state, projectionCache, quickMode: (state.picksUntilMe ?? 99) <= settings.quickModeThreshold });
        return;
      }

      const parsed = draftStateSchema.safeParse(state);
      if (!parsed.success) {
        logger.warn("draft state failed validation", parsed.error.issues.slice(0, 3));
        set({ lastError: `state validation: ${parsed.error.issues[0]?.message ?? "unknown"}` });
      }
      set({
        state,
        platform,
        sessionId,
        lastError: undefined,
        lastFingerprint: fingerprint,
        projectionCache,
        quickMode: (state.picksUntilMe ?? 99) <= settings.quickModeThreshold,
      });
      void persist(get());
      get().recompute();
    } catch (err) {
      logger.error("ingest failed", err);
      set({ lastError: (err as Error).message });
    }
  },

  recompute: () => {
    const { state, settings, overrides, stats, players, notes } = get();
    if (!state) return;
    // Below the confidence floor the page data cannot be trusted at all, so the
    // engine stops rather than producing confidently wrong advice.
    if (state.parserHealth.confidence < 0.35) {
      set({ result: undefined });
      return;
    }
    try {
      const result = recommend(state, {
        weights: settings.weights,
        overrides,
        notes,
        limit: 12,
        // Undefined is fine: the engine derives a baseline from the live pool.
        availabilityWeight: settings.availabilityWeight,
        stats:
          stats ??
          (players.length > 0
            ? buildStats(players, state.league.teams, settings.availabilityWeight)
            : undefined),
      });
      set({ result, lastError: undefined });
    } catch (err) {
      logger.error("recommendation failed", err);
      set({ lastError: (err as Error).message });
    }
  },
}));

/** Order-sensitive djb2 hash of player ids — cheap enough to run on every DOM tick. */
function idHash(players: { id: string }[]): string {
  let hash = 5381;
  for (const player of players) {
    for (let i = 0; i < player.id.length; i++) hash = ((hash << 5) + hash + player.id.charCodeAt(i)) | 0;
    hash = ((hash << 5) + hash + 124) | 0; // separator, so ["ab","c"] != ["a","bc"]
  }
  return `${players.length}:${(hash >>> 0).toString(36)}`;
}

/** Remembers every projection the page has shown us, without overwriting on re-render. */
function harvestProjections(
  cache: Record<string, Projection>,
  players: { providerId?: string; projection?: Projection }[],
): Record<string, Projection> {
  let next: Record<string, Projection> | undefined;
  for (const player of players) {
    if (!player.providerId || !player.projection || cache[player.providerId]) continue;
    next = next ?? { ...cache };
    next[player.providerId] = player.projection;
  }
  return next ?? cache;
}

async function persist(store: DraftStoreState): Promise<void> {
  const { state, overrides, sessionId, projectionCache, stats, baselinePool, players } = store;
  if (!state) return;
  await saveSession({
    sessionId,
    drafted: state.drafted,
    myRosterIds: state.myRoster.map((p) => p.id),
    overrides,
    projections: projectionCache,
    // Only a baseline derived from the page needs saving; an imported master
    // pool is rebuilt from the import itself.
    stats: players.length === 0 ? stats : undefined,
    baselinePool: players.length === 0 ? baselinePool : undefined,
    updatedAt: Date.now(),
  });
}

/** Restores picks/overrides recorded before a tab reload, plus the global notes. */
export async function restoreSession(sessionId: string): Promise<void> {
  useDraftStore.setState({ notes: await loadNotes() });
  const session = await loadSession(sessionId);
  if (!session) return;
  useDraftStore.setState({
    overrides: session.overrides ?? { ...EMPTY_OVERRIDES },
    persistedPicks: session.drafted ?? [],
    projectionCache: session.projections ?? {},
    ...(session.stats && useDraftStore.getState().players.length === 0
      ? { stats: session.stats, baselinePool: session.baselinePool ?? [] }
      : {}),
    sessionId,
  });
}

export function connectAdapter(
  adapter: DraftPlatformAdapter,
  sessionId: string,
  platform: DraftState["platform"] = adapter.platform,
): () => void {
  const pump = () => useDraftStore.getState().ingest(adapter.snapshot(), platform, sessionId);
  pump();
  return adapter.subscribe(pump);
}
