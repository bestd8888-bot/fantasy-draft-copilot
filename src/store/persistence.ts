import {
  DEFAULT_SETTINGS,
  EMPTY_OVERRIDES,
  type AppSettings,
  type DraftPick,
  type Player,
  type PlayerNote,
  type Projection,
  type SessionOverrides,
} from "@/shared/types";
import { logger } from "@/shared/logger";
import type { PoolStats } from "@/domain/recommendation/zscore";

export const STORAGE_KEYS = {
  settings: "settings",
  players: "players",
  playersMeta: "playersMeta",
  session: (sessionId: string) => `session:${sessionId}`,
  notes: "playerNotes",
} as const;

export interface PlayersMeta {
  source: string;
  importedAt: number;
  count: number;
  withProjection: number;
}

export interface PersistedSession {
  sessionId: string;
  drafted: DraftPick[];
  myRosterIds: string[];
  overrides: SessionOverrides;
  /**
   * Projections harvested from the draft page, keyed by provider id. A player
   * vanishes from Yahoo's table the moment they are drafted, so without this
   * cache the user's own roster would have no stats and punt detection would be
   * blind. Survives a tab reload with the rest of the session.
   */
  projections?: Record<string, Projection>;
  /**
   * The standardization baseline and the pool it came from. Without these a
   * mid-draft reload would rebuild the baseline from the depleted board, quietly
   * inflating every remaining player's z-scores.
   */
  stats?: PoolStats;
  baselinePool?: Player[];
  updatedAt: number;
}

/** chrome.storage.local with an in-memory fallback so tests and pages outside the extension still work. */
const memory = new Map<string, unknown>();

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome?.storage?.local);
}

export async function readKey<T>(key: string, fallback: T): Promise<T> {
  if (!hasChromeStorage()) return (memory.get(key) as T) ?? fallback;
  try {
    const result = await chrome.storage.local.get(key);
    return (result[key] as T) ?? fallback;
  } catch (err) {
    logger.warn("storage read failed", key, err);
    return fallback;
  }
}

export async function writeKey(key: string, value: unknown): Promise<void> {
  if (!hasChromeStorage()) {
    memory.set(key, value);
    return;
  }
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (err) {
    logger.warn("storage write failed", key, err);
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = migrateSettings(await readKey<Partial<AppSettings>>(STORAGE_KEYS.settings, {}));
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    league: { ...DEFAULT_SETTINGS.league, ...stored.league },
    weights: { ...DEFAULT_SETTINGS.weights, ...stored.weights },
    manualPunts: { ...DEFAULT_SETTINGS.manualPunts, ...stored.manualPunts },
    llm: { ...DEFAULT_SETTINGS.llm, ...stored.llm },
  };
}

/**
 * v1 -> v2: "auto" punting used to be the default, so a stored "auto" almost
 * always means "never touched", not a choice. It moves to the new default,
 * "suggest". A user who later picks "auto" again is on v2 and keeps it.
 */
export function migrateSettings(stored: Partial<AppSettings>): Partial<AppSettings> {
  if (Object.keys(stored).length === 0) return stored;
  if ((stored.settingsVersion ?? 1) >= 2) return stored;
  return {
    ...stored,
    strategyMode: stored.strategyMode === "auto" ? "suggest" : stored.strategyMode,
    settingsVersion: 2,
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeKey(STORAGE_KEYS.settings, settings);
}

export async function loadPlayers(): Promise<{ players: Player[]; meta?: PlayersMeta }> {
  const players = await readKey<Player[]>(STORAGE_KEYS.players, []);
  const meta = await readKey<PlayersMeta | undefined>(STORAGE_KEYS.playersMeta, undefined);
  return { players, meta };
}

export async function savePlayers(players: Player[], source: string): Promise<PlayersMeta> {
  const meta: PlayersMeta = {
    source,
    importedAt: Date.now(),
    count: players.length,
    withProjection: players.filter((p) => p.projection).length,
  };
  await writeKey(STORAGE_KEYS.players, players);
  await writeKey(STORAGE_KEYS.playersMeta, meta);
  return meta;
}

/** Player notes are global: they are the user's standing read, not draft state. */
export async function loadNotes(): Promise<Record<string, PlayerNote>> {
  return readKey<Record<string, PlayerNote>>(STORAGE_KEYS.notes, {});
}

export async function saveNotes(notes: Record<string, PlayerNote>): Promise<void> {
  await writeKey(STORAGE_KEYS.notes, notes);
}

export async function loadSession(sessionId: string): Promise<PersistedSession | undefined> {
  return readKey<PersistedSession | undefined>(STORAGE_KEYS.session(sessionId), undefined);
}

export async function saveSession(session: PersistedSession): Promise<void> {
  await writeKey(STORAGE_KEYS.session(session.sessionId), session);
}

export async function loadOverrides(sessionId: string): Promise<SessionOverrides> {
  const session = await loadSession(sessionId);
  return session?.overrides ?? { ...EMPTY_OVERRIDES };
}

/**
 * Session id must survive a tab reload but not leak league identifiers, so it is
 * derived from the pathname only.
 */
export function deriveSessionId(url: string = location.href): string {
  try {
    const parsed = new URL(url);
    const key = `${parsed.hostname}${parsed.pathname}`.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
    return key || "default-session";
  } catch {
    return "default-session";
  }
}
