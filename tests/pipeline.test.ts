import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { YahooDraftAdapter } from "@/content/yahoo/YahooDraftAdapter";
import { MockDraftAdapter } from "@/content/mock/MockDraftAdapter";
import { PlayerIndex } from "@/domain/player/PlayerIndex";
import { buildDemoPool } from "@/domain/player/demoPool";
import { buildDraftState } from "@/store/buildDraftState";
import { connectAdapter, restoreSession, useDraftStore } from "@/store/useDraftStore";
import { loadNotes } from "@/store/persistence";
import { DEFAULT_SETTINGS, EMPTY_OVERRIDES } from "@/shared/types";
import { scoreHealth } from "@/content/adapter";
import { draftStateSchema } from "@/shared/schema";

const pool = buildDemoPool(120);
const index = new PlayerIndex(pool);

function loadFixture(name: string): void {
  document.documentElement.innerHTML = readFileSync(
    path.resolve(process.cwd(), "tests/fixtures/yahoo", name),
    "utf-8",
  );
}

describe("buildDraftState", () => {
  it("produces a schema-valid normalized state from a fixture page", () => {
    loadFixture("draft-room-v1.html");
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();
    const state = buildDraftState({
      snapshot,
      index,
      settings: { ...DEFAULT_SETTINGS, myDraftSlot: 3 },
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "s1",
      platform: "fixture",
    });

    expect(draftStateSchema.safeParse(state).success).toBe(true);
    expect(state.currentPick).toBe(27);
    expect(state.currentRound).toBe(3);
    expect(state.myDraftSlot).toBe(3);
    // Snake: slot 3 owns pick 27 in round 3.
    expect(state.nextMyPick).toBe(27);
    expect(state.picksUntilMe).toBe(0);
  });

  it("treats master pool minus drafted as the available pool, not the DOM rows", () => {
    loadFixture("virtualized-list.html");
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();
    const state = buildDraftState({
      snapshot,
      index,
      settings: DEFAULT_SETTINGS,
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "s2",
      platform: "fixture",
    });

    expect(snapshot.available).toHaveLength(2);
    expect(state.available.length).toBeGreaterThan(100);
  });

  it("never lists the same player twice and never keeps a drafted player available", () => {
    const mock = new MockDraftAdapter({ league: DEFAULT_SETTINGS.league, pool, myDraftSlot: 3 });
    for (let i = 0; i < 25; i++) mock.simulatePick();

    const state = buildDraftState({
      snapshot: mock.snapshot(),
      index,
      settings: DEFAULT_SETTINGS,
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "s3",
      platform: "mock",
    });

    const draftedIds = state.drafted.map((p) => p.playerId);
    expect(new Set(draftedIds).size).toBe(draftedIds.length);
    expect(state.available.some((p) => draftedIds.includes(p.id))).toBe(false);
    expect(state.drafted.map((p) => p.overall)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
  });

  it("AT-02: restores picks recorded before a reload", () => {
    loadFixture("parser-broken.html");
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();
    const persisted = [
      { overall: 1, round: 1, pickInRound: 1, isMine: true, playerId: pool[0].id, playerName: pool[0].name },
      { overall: 2, round: 1, pickInRound: 2, isMine: false, playerId: pool[1].id, playerName: pool[1].name },
    ];

    const state = buildDraftState({
      snapshot,
      index,
      settings: { ...DEFAULT_SETTINGS, myDraftSlot: 1 },
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "s4",
      platform: "fixture",
      persistedPicks: persisted,
    });

    expect(state.drafted).toHaveLength(2);
    expect(state.myRoster.map((p) => p.id)).toEqual([pool[0].id]);
    expect(state.available.some((p) => p.id === pool[0].id)).toBe(false);
  });

  it("honours manual drafted / manual roster overrides", () => {
    loadFixture("parser-broken.html");
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();
    const state = buildDraftState({
      snapshot,
      index,
      settings: DEFAULT_SETTINGS,
      overrides: { ...EMPTY_OVERRIDES, manualDrafted: [pool[4].id], manualRoster: [pool[9].id] },
      sessionId: "s5",
      platform: "fixture",
    });

    expect(state.available.some((p) => p.id === pool[4].id)).toBe(false);
    expect(state.myRoster.map((p) => p.id)).toContain(pool[9].id);
  });
});

describe("store pipeline", () => {
  beforeEach(() => {
    useDraftStore.setState({
      overrides: { ...EMPTY_OVERRIDES },
      persistedPicks: [],
      result: undefined,
      state: undefined,
      selectedPlayerId: undefined,
    });
    useDraftStore.getState().setSettings({ ...DEFAULT_SETTINGS, myDraftSlot: 3 });
    useDraftStore.getState().setPlayers(pool);
  });

  it("recomputes recommendations as the mock draft advances", () => {
    const mock = new MockDraftAdapter({ league: DEFAULT_SETTINGS.league, pool, myDraftSlot: 3 });
    const disconnect = connectAdapter(mock, "mock-session", "mock");

    const first = useDraftStore.getState().result!.recommendations[0];
    expect(first).toBeDefined();

    // Somebody takes the top recommendation.
    mock.draftForMe(first.playerId);
    const after = useDraftStore.getState().result!.recommendations;
    expect(after.some((r) => r.playerId === first.playerId)).toBe(false);
    expect(useDraftStore.getState().state!.myRoster.map((p) => p.id)).toContain(first.playerId);

    disconnect();
  });

  it("AT-05: switches to quick mode when the user is within the threshold", () => {
    const mock = new MockDraftAdapter({ league: DEFAULT_SETTINGS.league, pool, myDraftSlot: 3 });
    const disconnect = connectAdapter(mock, "mock-session", "mock");

    // Slot 3 picks at overall 3; from pick 1 that is 2 picks away.
    expect(useDraftStore.getState().quickMode).toBe(true);

    useDraftStore.getState().setSettings({ ...DEFAULT_SETTINGS, myDraftSlot: 12, quickModeThreshold: 3 });
    useDraftStore.getState().ingest(mock.snapshot(), "mock", "mock-session");
    expect(useDraftStore.getState().quickMode).toBe(false);

    disconnect();
  });

  it("AT-04: disables recommendations when parser confidence collapses", () => {
    loadFixture("parser-broken.html");
    const adapter = new YahooDraftAdapter({ teams: 12 });
    useDraftStore.getState().ingest(adapter.snapshot(), "fixture", "broken-session");

    const state = useDraftStore.getState();
    expect(state.state!.parserStatus).toBe("error");
    expect(state.result).toBeUndefined();
  });
});

describe("standardization baseline", () => {
  beforeEach(() => {
    useDraftStore.setState({
      overrides: { ...EMPTY_OVERRIDES },
      persistedPicks: [],
      stats: undefined,
      result: undefined,
      state: undefined,
      lastFingerprint: undefined,
    });
    useDraftStore.getState().setSettings(DEFAULT_SETTINGS);
  });

  it("never builds a baseline from an empty import", () => {
    // buildStats([]) yields sd = 1 everywhere, which makes z-scores equal raw
    // per-game numbers and weights PTS ~20x STL.
    useDraftStore.getState().setPlayers([]);
    expect(useDraftStore.getState().stats).toBeUndefined();
  });

  it("derives the baseline from the page's own pool and keeps it fixed", () => {
    useDraftStore.getState().setPlayers([]);

    // A Yahoo-style snapshot: the pool and its projections come off the page.
    const asPlatform = (players: typeof pool) =>
      players.map((p) => ({
        providerId: p.id,
        name: p.name,
        nbaTeam: p.nbaTeam,
        positions: p.positions,
        rank: p.rank,
        adp: p.adp,
        projection: p.projection,
      }));
    const snapshot = (available: typeof pool) => ({
      league: DEFAULT_SETTINGS.league,
      meta: { currentRound: 1, currentPick: 1 },
      drafted: [],
      myRoster: [],
      available: asPlatform(available),
      availableIsAuthoritative: true,
      health: scoreHealth({
        boardFound: true,
        pickCount: 0,
        rosterFound: true,
        currentPickFound: true,
        warnings: [],
      }),
    });

    useDraftStore.getState().ingest(snapshot(pool), "yahoo", "baseline-session");

    const stats = useDraftStore.getState().stats!;
    expect(stats).toBeDefined();
    expect(stats.size).toBeGreaterThan(20);
    // A real spread, not the sd = 1 placeholder that makes z equal raw stats.
    expect(stats.sd.PTS).toBeGreaterThan(2);
    expect(stats.sd.STL).toBeLessThan(1);

    // Categories are comparable once standardized.
    const z = useDraftStore.getState().result!.recommendations[0].categoryZ;
    expect(Math.abs(z.PTS)).toBeLessThan(5);
    expect(Math.abs(z.STL)).toBeLessThan(5);

    // The baseline stays put as the board drains, so scores stay comparable.
    useDraftStore.setState({ lastFingerprint: undefined });
    useDraftStore.getState().ingest(snapshot(pool.slice(-15)), "yahoo", "baseline-session");
    expect(useDraftStore.getState().stats).toBe(stats);
  });
});

describe("player notes persistence", () => {
  it("keeps notes across drafts and applies them to recommendations", async () => {
    useDraftStore.setState({ notes: {}, stats: undefined, lastFingerprint: undefined });
    useDraftStore.getState().setSettings(DEFAULT_SETTINGS);
    useDraftStore.getState().setPlayers(pool);

    const mock = new MockDraftAdapter({ league: DEFAULT_SETTINGS.league, pool, myDraftSlot: 3 });
    const disconnect = connectAdapter(mock, "notes-session", "mock");

    const before = useDraftStore.getState().result!.recommendations;
    const target = before[8];
    useDraftStore.getState().setNote(target.playerId, target.playerName, "target");

    const after = useDraftStore.getState().result!.recommendations;
    const moved = after.find((r) => r.playerId === target.playerId)!;
    expect(moved.rank).toBeLessThan(target.rank);

    // Notes are global, not part of the draft session: a fresh draft keeps them.
    const stored = await loadNotes();
    expect(stored[target.playerId].name).toBe(target.playerName);

    useDraftStore.setState({ notes: {} });
    await restoreSession("a-totally-different-draft");
    expect(useDraftStore.getState().notes[target.playerId]).toBeDefined();

    // Clearing removes it everywhere.
    useDraftStore.getState().setNote(target.playerId, target.playerName, "clear");
    expect(await loadNotes()).toEqual({});

    disconnect();
  });
});
