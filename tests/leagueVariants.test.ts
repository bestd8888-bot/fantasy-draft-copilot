import { describe, expect, it } from "vitest";
import { parsePlayersTable } from "@/content/yahoo/draftClient";
import { teamCountCandidates, buildDraftState } from "@/store/buildDraftState";
import { PlayerIndex } from "@/domain/player/PlayerIndex";
import { recommend } from "@/domain/recommendation/RecommendationEngine";
import { scoreHealth } from "@/content/adapter";
import { DEFAULT_SETTINGS, EMPTY_OVERRIDES } from "@/shared/types";

function table(headers: string[], rows: string[][]): HTMLTableElement {
  const head = `<tr><td>Queue</td><td>Player</td>${headers.map((h) => `<td>${h}</td>`).join("")}</tr>`;
  const body = rows
    .map(
      (cells, i) =>
        `<tr><td></td><td><div class="ys-player" data-id="${i + 1}"><div><span>P. Player${i}</span></div>` +
        `<div><span>SF</span><span>ORL</span></div></div></td>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`,
    )
    .join("");
  document.body.innerHTML = `<table><tbody>${head}${body}</tbody></table>`;
  return document.querySelector("table")!;
}

describe("leagues that do not score all nine categories", () => {
  it("builds projections for an 8-cat league with no TO column", () => {
    const t = table(
      ["XRank", "Rank", "L7ADP", "GP", "FG%", "FT%", "3PTM", "PTS", "REB", "AST", "ST", "BLK"],
      [
        ["10", "10", "11", "70", ".480", ".810", "140", "1500", "420", "300", "80", "40"],
        ["20", "20", "19", "72", ".500", ".760", "60", "1200", "650", "150", "60", "90"],
      ],
    );
    const { players, scoredCategories, warnings } = parsePlayersTable(t);
    expect(players.every((p) => p.projection)).toBe(true);
    expect(players[0].projection!.pts).toBeCloseTo(1500 / 70, 1);
    expect(players[0].projection!.tov).toBe(0); // absent column -> neutral
    expect(scoredCategories).toEqual(["FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK"]);
    expect(warnings).toEqual([]);
  });

  it("still works when rebounds are split into OREB / DREB", () => {
    const t = table(
      ["GP", "FG%", "FT%", "3PTM", "PTS", "OREB", "DREB", "AST", "ST", "BLK", "TO"],
      [["70", ".480", ".810", "140", "1500", "80", "340", "300", "80", "40", "150"]],
    );
    const { players } = parsePlayersTable(t);
    expect(players[0].projection).toBeDefined();
  });

  it("says why when a table has no usable projection columns", () => {
    const t = table(["XRank", "Rank", "L7ADP"], [["10", "10", "11"]]);
    const { players, warnings } = parsePlayersTable(t);
    expect(players[0].projection).toBeUndefined();
    expect(warnings.join(" ")).toMatch(/stat 下拉/);
  });

  it("scores only the league's categories end to end", () => {
    const t = table(
      ["GP", "FG%", "FT%", "3PTM", "PTS", "REB", "AST", "ST", "BLK"],
      Array.from({ length: 30 }, (_, i) => ["70", ".470", ".800", String(60 + i * 5), String(900 + i * 40), String(300 + i * 8), String(150 + i * 7), "70", "40"]),
    );
    const { players, scoredCategories } = parsePlayersTable(t);
    const state = buildDraftState({
      snapshot: {
        league: { categories: scoredCategories },
        meta: { currentRound: 2, currentPick: 15, picksUntilMe: 3 },
        drafted: [],
        myRoster: [],
        available: players,
        availableIsAuthoritative: true,
        health: scoreHealth({ boardFound: true, pickCount: 14, rosterFound: true, currentPickFound: true, warnings: [] }),
      },
      index: new PlayerIndex([]),
      settings: DEFAULT_SETTINGS,
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "8cat",
      platform: "yahoo",
    });
    expect(state.league.categories).not.toContain("TO");
    const recs = recommend(state).recommendations;
    expect(recs.every((r) => !r.improves.includes("TO") && !r.hurts.includes("TO"))).toBe(true);
  });
});

describe("league size detection", () => {
  it("narrows Round 5 / Pick 43 to 9 or 10 teams", () => {
    expect(teamCountCandidates({ currentRound: 5, currentPick: 43 }, "snake")).toEqual([9, 10]);
  });

  it("settles on 10 once the user's own picks are visible", () => {
    // Up in 1 (my next pick is 44) and a YOUR TURN marker at 57: in a 10-team
    // snake both are slot 4; in a 9-team snake they are different slots.
    const candidates = teamCountCandidates(
      { currentRound: 5, currentPick: 43, picksUntilMe: 1, myPickNumbers: [44, 57] },
      "snake",
    );
    expect(candidates).toEqual([10]);
  });

  it("uses the detected size and says so instead of raising an error", () => {
    const state = buildDraftState({
      snapshot: {
        league: {},
        meta: { currentRound: 5, currentPick: 43, picksUntilMe: 1, myPickNumbers: [44, 57] },
        drafted: [],
        myRoster: [],
        available: [],
        availableIsAuthoritative: true,
        health: scoreHealth({ boardFound: true, pickCount: 42, rosterFound: true, currentPickFound: true, warnings: [] }),
      },
      index: new PlayerIndex([]),
      settings: DEFAULT_SETTINGS, // still the default 12
      overrides: { ...EMPTY_OVERRIDES },
      sessionId: "ten",
      platform: "yahoo",
      teamsCandidates: [10],
    });
    expect(state.league.teams).toBe(10);
    expect(state.myDraftSlot).toBe(4);
    expect(state.configWarnings).toEqual([]);
    expect(state.configNotices?.[0]).toContain("10 隊");
  });
});
