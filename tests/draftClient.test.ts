import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseDraftClient,
  parsePlayersTable,
  parseStatus,
  findPlayersTable,
  parseMyRoster,
  parsePlayerCell,
  parseMyPickNumbers,
} from "@/content/yahoo/draftClient";
import { YahooDraftAdapter } from "@/content/yahoo/YahooDraftAdapter";
import { PlayerIndex } from "@/domain/player/PlayerIndex";
import { buildDraftState } from "@/store/buildDraftState";
import { recommend } from "@/domain/recommendation/RecommendationEngine";
import { DEFAULT_SETTINGS, EMPTY_OVERRIDES } from "@/shared/types";
import { useDraftStore } from "@/store/useDraftStore";

beforeEach(() => {
  document.documentElement.innerHTML = readFileSync(
    path.resolve(process.cwd(), "tests/fixtures/yahoo/draft-client-2026.html"),
    "utf-8",
  );
});

describe("Yahoo draft client — status line", () => {
  it("reads round, pick, countdown and timer from sibling spans", () => {
    const { meta, found } = parseStatus(document);
    expect(found).toBe(true);
    expect(meta.currentRound).toBe(5);
    expect(meta.currentPick).toBe(54);
    expect(meta.picksUntilMe).toBe(1);
    expect(meta.secondsRemaining).toBe(29);
  });
});

describe("Yahoo draft client — player table", () => {
  it("converts season totals into per-game projections", () => {
    const { players } = parsePlayersTable(findPlayersTable(document)!);
    const wagner = players.find((p) => p.providerId === "6550")!;

    expect(players).toHaveLength(3); // the "YOUR TURN" marker row is not a player
    expect(wagner.name).toBe("F. Wagner");
    expect(wagner.nbaTeam).toBe("ORL");
    expect(wagner.positions).toEqual(["SF", "PF"]);
    expect(wagner.injuryStatus).toBe("GTD");
    expect(wagner.adp).toBe(53.7);
    expect(wagner.rank).toBe(43);

    // 1623 PTS / 67 GP = 24.2 ppg, 384 REB / 67 = 5.7 rpg
    expect(wagner.projection!.gp).toBe(67);
    expect(wagner.projection!.pts).toBeCloseTo(24.2, 1);
    expect(wagner.projection!.reb).toBeCloseTo(5.7, 1);
    expect(wagner.projection!.ast).toBeCloseTo(4.2, 1);
    expect(wagner.projection!.stl).toBeCloseTo(1.15, 2);
    expect(wagner.projection!.blk).toBeCloseTo(0.36, 2);
    expect(wagner.projection!.tov).toBeCloseTo(2.1, 1);
    expect(wagner.projection!.threes).toBeCloseTo(1.67, 2);
    expect(wagner.projection!.fgPct).toBeCloseTo(0.485);
    expect(wagner.projection!.ftPct).toBeCloseTo(0.848);
    // No attempts column on the page, so volume is estimated for the % categories.
    expect(wagner.projection!.fga).toBeGreaterThan(0);
  });

  it('reads the roster from the "YOUR TEAM" panel', () => {
    const roster = parseMyRoster(document, findPlayersTable(document)!);
    expect(roster.players.map((p) => p.name)).toEqual(["N. Jokic", "A. Sengun"]);
    expect(roster.expected).toBe(2);
    expect(roster.capacity).toBe(13);
  });

  it("does not mistake the pick activity feed for the user's roster", () => {
    const roster = parseMyRoster(document, findPlayersTable(document)!);
    // P. George and C. White were drafted by other managers.
    expect(roster.players.map((p) => p.name)).not.toContain("P. George");
    expect(roster.players.map((p) => p.name)).not.toContain("C. White");
  });

  it("warns when the roster panel is only partly rendered", () => {
    document.querySelector('.ys-player[data-id="6023"]')!.remove();
    const parsed = parseDraftClient(document)!;
    expect(parsed.myRoster).toHaveLength(1);
    expect(parsed.warnings.join(" ")).toMatch(/1\/2/);
  });
});

describe("Yahoo draft client — abbreviated names", () => {
  function cell(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = `<div class="ys-player" data-id="1">${html}</div>`;
    return host.firstElementChild as HTMLElement;
  }

  it("keeps a first initial that collides with an injury code", () => {
    // "Q", "D" and "O" are also Yahoo injury badges; an initial must survive.
    for (const name of ["Q. Grimes", "D. Harper", "O. Okongwu"]) {
      const parsed = parsePlayerCell(
        cell(`<div><span>${name}</span></div><div><span>SG,SF</span><span>NYK</span></div>`),
      );
      expect(parsed?.name).toBe(name);
      expect(parsed?.injuryStatus).toBeUndefined();
    }
  });

  it("still reads the injury badge from its own element", () => {
    const parsed = parsePlayerCell(
      cell(
        '<div><span>Q. Grimes</span><div title="Injured: Game Time Decision">GTD</div></div>' +
          "<div><span>SG,SF</span><span>NYK</span></div>",
      ),
    );
    expect(parsed?.name).toBe("Q. Grimes");
    expect(parsed?.injuryStatus).toBe("GTD");
  });
});

describe("Yahoo draft client — adapter and pipeline", () => {
  it("produces an authoritative pool with high confidence", () => {
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();

    expect(snapshot.availableIsAuthoritative).toBe(true);
    expect(snapshot.health.confidence).toBeGreaterThan(0.6);
    expect(snapshot.available).toHaveLength(3);
    expect(snapshot.myRoster).toHaveLength(2);
    expect(snapshot.meta.picksUntilMe).toBe(1);
  });

  it("infers the draft slot from the on-page countdown", () => {
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();
    const state = buildDraftState({
      snapshot,
      index: new PlayerIndex([]),
      settings: { ...DEFAULT_SETTINGS, myDraftSlot: undefined },
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "live",
      platform: "yahoo",
    });

    // Pick 54 + 1 = my pick 55; round 5 is a forward round, so 55 - 48 = slot 7.
    expect(state.myDraftSlot).toBe(7);
    expect(state.picksUntilMe).toBe(1);
    expect(state.currentRound).toBe(5);
  });

  it("recommends using page projections with nothing imported", () => {
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();
    const state = buildDraftState({
      snapshot,
      index: new PlayerIndex([]), // no CSV imported at all
      settings: DEFAULT_SETTINGS,
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "live",
      platform: "yahoo",
    });

    expect(state.available.every((p) => p.projection)).toBe(true);
    expect(state.myRoster).toHaveLength(2);

    const result = recommend(state);
    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0].score).toBeGreaterThan(0);
    // Real z-scores, not the ranking-only fallback.
    expect(result.recommendations[0].categoryZ.PTS).not.toBe(0);
  });

  it("warns instead of guessing when the roster panel is not on screen", () => {
    // Drop the heading so the "YOUR TEAM" anchor disappears.
    [...document.querySelectorAll("div")]
      .filter((el) => el.textContent?.trim().startsWith("YOUR TEAM ("))
      .forEach((el) => el.remove());
    const parsed = parseDraftClient(document)!;
    expect(parsed.myRoster).toHaveLength(0);
    expect(parsed.warnings.join(" ")).toMatch(/YOUR TEAM/);
  });
});

describe("projection cache", () => {
  it("keeps scoring the user's roster after those players leave Yahoo's table", () => {
    const adapter = new YahooDraftAdapter({ teams: 12 });
    const store = useDraftStore.getState();
    store.setSettings({ ...DEFAULT_SETTINGS, myDraftSlot: 7 });
    store.setPlayers([]);

    // Round 1: A. Thompson is still on the board, so the page shows his stats.
    store.ingest(adapter.snapshot(), "yahoo", "cache-session");
    expect(useDraftStore.getState().projectionCache["6018"]).toBeDefined();

    // He is then drafted onto the user's team: Yahoo removes him from the table
    // and moves him into the YOUR TEAM panel, where there are no stat columns.
    const row = document.querySelector('.ys-player[data-id="6018"]')!.closest("tr")!;
    row.remove();
    const panel = [...document.querySelectorAll("div")].find(
      (el) => el.className.includes("Ovy(a)") && el.querySelector('.ys-player[data-id="5185"]'),
    )!;
    const moved = document.createElement("div");
    moved.className = "ys-player";
    moved.setAttribute("data-id", "6018");
    moved.innerHTML = '<div><span>A. Thompson</span></div><div><span>PG,SG</span><span>HOU</span></div>';
    panel.appendChild(moved);
    document.querySelector(".\\_ys_1vj86om")!.textContent = "YOUR TEAM (3/13)";

    useDraftStore.setState({ lastFingerprint: undefined });
    useDraftStore.getState().ingest(adapter.snapshot(), "yahoo", "cache-session");

    const state = useDraftStore.getState().state!;
    const rostered = state.myRoster.find((p) => p.id === "6018");
    expect(rostered).toBeDefined();
    expect(rostered!.projection?.pts).toBeCloseTo(14.9, 1); // 1102 PTS / 74 GP
    expect(state.available.some((p) => p.id === "6018")).toBe(false);

    // With real roster stats the category bars stop sitting at a flat 50.
    const result = useDraftStore.getState().result!;
    expect(Object.values(result.categoryPercentiles).some((v) => v !== 50)).toBe(true);
  });
});

describe("Yahoo draft client — before the first pick", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = readFileSync(
      path.resolve(process.cwd(), "tests/fixtures/yahoo/draft-client-predraft.html"),
      "utf-8",
    );
  });

  it('treats "Draft Starting Soon" as round 1 pick 1 rather than a parse failure', () => {
    const { meta, found, preDraft } = parseStatus(document);
    expect(found).toBe(true);
    expect(preDraft).toBe(true);
    expect(meta.currentRound).toBe(1);
    expect(meta.currentPick).toBe(1);
    // The visible clock counts down to the start; it is not a pick timer.
    expect(meta.secondsRemaining).toBeUndefined();
  });

  it("finds the roster panel even though the roster is empty", () => {
    const roster = parseMyRoster(document, findPlayersTable(document)!);
    expect(roster.panelFound).toBe(true);
    expect(roster.players).toHaveLength(0);
    expect(roster.expected).toBe(0);
    expect(roster.capacity).toBe(13);

    // An empty roster at pick 1 is normal — it must not be reported as an error.
    const parsed = parseDraftClient(document)!;
    expect(parsed.warnings.join(" ")).not.toMatch(/YOUR TEAM/);
  });

  it('reads the draft slot from the "YOUR TURN" markers before any pick', () => {
    expect(parseMyPickNumbers(document)).toEqual([12, 13]);

    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();
    const state = buildDraftState({
      snapshot,
      index: new PlayerIndex([]),
      settings: { ...DEFAULT_SETTINGS, myDraftSlot: undefined },
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "pre",
      platform: "yahoo",
    });

    expect(state.myDraftSlot).toBe(12);
    expect(state.currentPick).toBe(1);
    expect(state.picksUntilMe).toBe(11);
  });

  it("stays above the confidence floor so recommendations run from pick 1", () => {
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();
    expect(snapshot.health.confidence).toBeGreaterThanOrEqual(0.6);
    expect(snapshot.health.warnings).toEqual([]);

    const state = buildDraftState({
      snapshot,
      index: new PlayerIndex([]),
      settings: DEFAULT_SETTINGS,
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "pre",
      platform: "yahoo",
    });
    expect(state.parserStatus).toBe("ok");
    expect(recommend(state).recommendations.length).toBeGreaterThan(0);
  });
});

describe("season totals vs per-game", () => {
  function tableWith(rows: string[]): HTMLTableElement {
    document.documentElement.innerHTML = `<body><table><tbody>
      <tr><td>Queue</td><td>Player</td><td>XRank</td><td>Rank</td><td>L7ADP</td><td>GP</td>
          <td>FG%</td><td>FT%</td><td>3PTM</td><td>PTS</td><td>REB</td><td>AST</td>
          <td>ST</td><td>BLK</td><td>TO</td></tr>
      ${rows.join("")}
    </tbody></table></body>`;
    return document.querySelector("table")!;
  }

  const row = (id: string, name: string, stats: string) =>
    `<tr><td></td><td><div class="ys-player" data-id="${id}"><div><span>${name}</span></div>` +
    `<div><span>C</span><span>DET</span></div></div></td><td>10</td><td>10</td><td>10</td>${stats}</tr>`;

  it("does not read a big man's 8 season three-pointers as 8 per game", () => {
    // The trap: 8 is below any plausible per-game 3PM threshold, so a per-column
    // rule would treat it as a per-game average and hand this player a monstrous
    // 3PM z-score. Points make the table's scale unambiguous.
    const table = tableWith([
      row("1", "Big Man", "<td>70</td><td>.620</td><td>.600</td><td>8</td><td>1100</td><td>700</td><td>120</td><td>40</td><td>130</td><td>150</td>"),
      row("2", "Wing", "<td>72</td><td>.470</td><td>.850</td><td>180</td><td>1400</td><td>300</td><td>250</td><td>80</td><td>25</td><td>140</td>"),
      row("3", "Guard", "<td>75</td><td>.450</td><td>.880</td><td>210</td><td>1600</td><td>280</td><td>450</td><td>90</td><td>15</td><td>180</td>"),
    ]);

    const { players } = parsePlayersTable(table);
    const big = players.find((p) => p.providerId === "1")!;
    expect(big.projection!.threes).toBeCloseTo(8 / 70, 3); // 0.11 per game, not 8
    expect(big.projection!.blk).toBeCloseTo(130 / 70, 2);
    expect(big.projection!.pts).toBeCloseTo(1100 / 70, 1);
  });

  it("leaves a per-game table alone", () => {
    const table = tableWith([
      row("1", "Per Game", "<td>70</td><td>.500</td><td>.800</td><td>2.1</td><td>22.5</td><td>8.1</td><td>4.2</td><td>1.1</td><td>0.8</td><td>2.4</td>"),
      row("2", "Per Game B", "<td>72</td><td>.470</td><td>.850</td><td>1.8</td><td>18.2</td><td>5.0</td><td>3.1</td><td>0.9</td><td>0.4</td><td>1.9</td>"),
    ]);

    const { players } = parsePlayersTable(table);
    expect(players[0].projection!.pts).toBeCloseTo(22.5, 1);
    expect(players[0].projection!.threes).toBeCloseTo(2.1, 1);
  });
});
