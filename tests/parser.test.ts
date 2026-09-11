import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { YahooDraftAdapter } from "@/content/yahoo/YahooDraftAdapter";
import { extractPlayerFromText, parseTimerSeconds } from "@/content/yahoo/parser";
import { captureInspectorReport, discoverRowSelectors, sanitizeText } from "@/content/yahoo/inspector";

function loadFixture(name: string): void {
  const file = path.resolve(process.cwd(), "tests/fixtures/yahoo", name);
  document.documentElement.innerHTML = readFileSync(file, "utf-8");
}

describe("text extraction", () => {
  it("pulls name, team and positions out of a pick row", () => {
    expect(extractPlayerFromText("1.3 Silas Okafor MIL - C")).toEqual({
      name: "Silas Okafor",
      nbaTeam: "MIL",
      positions: ["C"],
    });
    expect(extractPlayerFromText("2.10 Nikola Jokić DEN - C")?.name).toBe("Nikola Jokić");
    expect(extractPlayerFromText("Andre Jessup (BOS - PG,SG)")?.positions).toEqual(["PG", "SG"]);
  });

  it("rejects chrome text that is not a player", () => {
    expect(extractPlayerFromText("Loading…")).toBeUndefined();
    expect(extractPlayerFromText("")).toBeUndefined();
  });

  it("parses the timer", () => {
    expect(parseTimerSeconds("0:48")).toBe(48);
    expect(parseTimerSeconds("1:05")).toBe(65);
    expect(parseTimerSeconds("--")).toBeUndefined();
  });
});

describe("YahooDraftAdapter against fixtures", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "";
  });

  it("parses draft-room-v1 with high confidence", () => {
    loadFixture("draft-room-v1.html");
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();

    expect(snapshot.health.boardFound).toBe(true);
    expect(snapshot.health.confidence).toBeGreaterThan(0.6);
    expect(snapshot.drafted).toHaveLength(5);
    expect(snapshot.drafted[0].player.name).toBe("Andre Jessup");
    expect(snapshot.drafted[0].player.nbaTeam).toBe("BOS");
    expect(snapshot.drafted.filter((p) => p.isMine)).toHaveLength(2);
    expect(snapshot.meta.currentPick).toBe(27);
    expect(snapshot.meta.currentRound).toBe(3);
    expect(snapshot.meta.secondsRemaining).toBe(48);
    expect(snapshot.myRoster.map((p) => p.name)).toContain("Nikola Jokić");
    expect(snapshot.available[0].adp).toBe(28.5);
    expect(snapshot.available[0].injuryStatus).toBe("GTD");
    // Team count is deliberately NOT guessed from page text — a wrong value would
    // silently corrupt every snake-draft calculation. It comes from settings.
    expect(snapshot.league.teams).toBeUndefined();
  });

  it("still parses the v2 redesign through fallback selectors", () => {
    loadFixture("draft-room-v2.html");
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();

    expect(snapshot.drafted.length).toBe(3);
    expect(snapshot.drafted.some((p) => p.isMine)).toBe(true);
    expect(snapshot.meta.currentPick).toBe(49);
    expect(snapshot.health.confidence).toBeGreaterThan(0.5);
  });

  it("does not mistake a virtualized window for the full player pool", () => {
    loadFixture("virtualized-list.html");
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();

    // Only two rows are rendered; the store must not treat this as the board.
    expect(snapshot.available).toHaveLength(2);
    expect(snapshot.drafted).toHaveLength(2);
  });

  it("fails loudly when the page structure is unrecognisable", () => {
    loadFixture("parser-broken.html");
    const snapshot = new YahooDraftAdapter({ teams: 12 }).snapshot();

    expect(snapshot.health.confidence).toBeLessThan(0.35);
    expect(snapshot.health.warnings.length).toBeGreaterThan(0);
    expect(snapshot.drafted).toHaveLength(0);
  });
});

describe("DOM inspector", () => {
  it("reports selector hits and discovers repeated row structures", () => {
    loadFixture("draft-room-v1.html");
    const report = captureInspectorReport();

    const board = report.groups.find((g) => g.selectorGroup === "draftBoard")!;
    expect(board.hitCount).toBe(1);
    expect(board.matchedSelector).toBe('[data-test="draft-board"]');
    expect(discoverRowSelectors(3).length).toBeGreaterThan(0);
  });

  it("scrubs identifiers before export", () => {
    expect(sanitizeText("contact me@example.com now")).toBe("contact [email] now");
    expect(sanitizeText("token AbCdEfGhIjKlMnOpQrStUvWxYz123456")).toBe("token [id]");
  });
});
