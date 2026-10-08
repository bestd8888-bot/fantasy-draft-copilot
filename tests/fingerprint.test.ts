import { beforeEach, describe, expect, it } from "vitest";
import { useDraftStore } from "@/store/useDraftStore";
import { buildDemoPool } from "@/domain/player/demoPool";
import { scoreHealth } from "@/content/adapter";
import { DEFAULT_SETTINGS, EMPTY_OVERRIDES, type Player } from "@/shared/types";

const pool = buildDemoPool(140);

function snapshot(available: Player[], currentPick = 30) {
  return {
    league: DEFAULT_SETTINGS.league,
    meta: { currentRound: 3, currentPick, picksUntilMe: 5 },
    drafted: [],
    myRoster: [],
    available: available.map((p) => ({
      providerId: p.id,
      name: p.name,
      nbaTeam: p.nbaTeam,
      positions: p.positions,
      rank: p.rank,
      adp: p.adp,
      projection: p.projection,
    })),
    availableIsAuthoritative: true,
    health: scoreHealth({ boardFound: true, pickCount: 29, rosterFound: true, currentPickFound: true, warnings: [] }),
  };
}

describe("recompute trigger", () => {
  beforeEach(() => {
    useDraftStore.setState({
      overrides: { ...EMPTY_OVERRIDES },
      stats: undefined,
      result: undefined,
      state: undefined,
      lastFingerprint: undefined,
      notes: {},
    });
    useDraftStore.getState().setSettings(DEFAULT_SETTINGS);
    useDraftStore.getState().setPlayers([]);
  });

  it("drops a drafted player even when the 100-row table keeps the same length", () => {
    // Yahoo always shows 100 rows: when the leader is drafted, the 101st slides in.
    // The table can update before the "Pick N" label does.
    const board = pool.slice(0, 100);
    useDraftStore.getState().ingest(snapshot(board), "yahoo", "fp");
    const leader = useDraftStore.getState().result!.recommendations[0].playerId;

    const afterPick = [...board.filter((p) => p.id !== leader), pool[100]];
    expect(afterPick).toHaveLength(100);
    useDraftStore.getState().ingest(snapshot(afterPick, 30), "yahoo", "fp"); // label not updated yet

    const recs = useDraftStore.getState().result!.recommendations;
    expect(recs.some((r) => r.playerId === leader)).toBe(false);
  });
});

describe("baseline across a tab reload", () => {
  it("keeps the same standardization scale after reloading mid-draft", async () => {
    const { restoreSession } = await import("@/store/useDraftStore");
    useDraftStore.setState({ stats: undefined, baselinePool: [], result: undefined, lastFingerprint: undefined });
    useDraftStore.getState().setPlayers([]);

    // Start of draft: full board.
    useDraftStore.getState().ingest(snapshot(pool.slice(0, 100), 1), "yahoo", "reload-session");
    const before = useDraftStore.getState().stats!;

    // Tab reload: memory wiped, then the page now shows a depleted board.
    useDraftStore.setState({ stats: undefined, baselinePool: [], result: undefined, lastFingerprint: undefined });
    await restoreSession("reload-session");
    useDraftStore.getState().ingest(snapshot(pool.slice(40, 140), 41), "yahoo", "reload-session");

    const after = useDraftStore.getState().stats!;
    expect(after.mean.PTS).toBeCloseTo(before.mean.PTS, 6);
    expect(after.sd.PTS).toBeCloseTo(before.sd.PTS, 6);
  });
});

describe("league size cross-check", () => {
  it("flags a 12-team setting in a 10-team draft and suggests the real size", async () => {
    const { leagueSizeWarnings } = await import("@/store/buildDraftState");
    // Round 5, pick 45 only exists in a 9-11 team league.
    const warnings = leagueSizeWarnings({ currentRound: 5, currentPick: 45 }, 12);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("10");
    expect(leagueSizeWarnings({ currentRound: 5, currentPick: 45 }, 10)).toEqual([]);
    // Round 1 cannot tell league sizes apart, so it never warns.
    expect(leagueSizeWarnings({ currentRound: 1, currentPick: 3 }, 12)).toEqual([]);
  });
});
