import { describe, expect, it } from "vitest";
import { parseProjections, parseProjectionsCsv, parseProjectionsJson, splitCsvLine } from "@/domain/player/import";
import { PlayerIndex } from "@/domain/player/PlayerIndex";

const SAMPLE_CSV = `player_id,name,team,positions,gp,fg_pct,ft_pct,three_pm,pts,reb,ast,stl,blk,tov,fga,fta,adp
demo_001,Demo Guard,AAA,PG|SG,72,0.468,0.871,2.7,22.4,4.1,7.8,1.5,0.3,2.8,16.2,5.4,42.0
demo_002,Demo Wing,BBB,SF|PF,74,0.491,0.813,2.1,20.8,6.5,3.4,1.2,0.8,2.1,14.9,4.8,55.0
demo_003,Demo Center,CCC,C,70,0.596,0.681,0.2,17.5,10.8,2.2,0.8,2.1,2.5,10.9,6.0,63.0`;

describe("CSV import", () => {
  it("parses the spec's sample file", () => {
    const result = parseProjectionsCsv(SAMPLE_CSV);
    expect(result.players).toHaveLength(3);
    expect(result.errors).toHaveLength(0);

    const guard = result.players[0];
    expect(guard.id).toBe("demo_001");
    expect(guard.positions).toEqual(["PG", "SG"]);
    expect(guard.projection?.fgPct).toBeCloseTo(0.468);
    expect(guard.projection?.fga).toBe(16.2);
    expect(guard.adp).toBe(42);
  });

  it("accepts alternative headers, whole-number percentages and quoted fields", () => {
    const csv = `Player,Tm,Pos,G,FG%,FT%,3PM,PTS,TRB,AST,STL,BLK,TOV
"Jokic, Nikola",DEN,C,70,58.3,81.7,1.1,26.4,12.4,9.0,1.4,0.9,3.0`;
    const result = parseProjectionsCsv(csv);
    expect(result.players).toHaveLength(1);
    expect(result.players[0].projection?.fgPct).toBeCloseTo(0.583);
    expect(result.players[0].projection?.ftPct).toBeCloseTo(0.817);
    // No attempts column: volume is estimated so percentage impact still works.
    expect(result.players[0].projection?.fga).toBeGreaterThan(0);
  });

  it("skips invalid rows without losing the good ones", () => {
    const csv = `name,pts,reb,ast,stl,blk,tov,three_pm
Good Player,20,5,5,1,1,2,2
,1,1,1,1,1,1,1`;
    const result = parseProjectionsCsv(csv);
    expect(result.players).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("reports a missing name column instead of importing junk", () => {
    expect(parseProjectionsCsv("a,b\n1,2").errors[0]).toMatch(/name/);
  });

  it("splits quoted CSV fields", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(splitCsvLine('"he said ""hi""",x')).toEqual(['he said "hi"', "x"]);
  });
});

describe("JSON import", () => {
  it("accepts an array with array-valued positions", () => {
    const json = JSON.stringify([
      { name: "Array Guy", team: "XYZ", positions: ["PG", "SG"], pts: 20, reb: 4, ast: 6, stl: 1, blk: 0.3, tov: 2, three_pm: 2, gp: 70 },
    ]);
    const result = parseProjectionsJson(json);
    expect(result.players[0].positions).toEqual(["PG", "SG"]);
  });

  it("accepts a { players: [...] } wrapper and reports bad JSON", () => {
    expect(parseProjections('{"players":[]}', "x.json").players).toHaveLength(0);
    expect(parseProjectionsJson("{nope").errors[0]).toMatch(/invalid JSON/);
  });
});

describe("PlayerIndex matching", () => {
  const { players } = parseProjectionsCsv(SAMPLE_CSV);
  const index = new PlayerIndex(players);

  it("matches by provider id, name+team and unique name", () => {
    expect(index.match({ name: "Demo Guard", nbaTeam: "AAA" })?.id).toBe("demo_001");
    expect(index.match({ name: "demo guard" })?.id).toBe("demo_001");
    expect(index.match({ name: "Unknown Person" })).toBeUndefined();
  });

  it("refuses to guess when a bare name is ambiguous", () => {
    const ambiguous = new PlayerIndex([
      ...players,
      { ...players[0], id: "other", nbaTeam: "ZZZ" },
    ]);
    expect(ambiguous.match({ name: "Demo Guard" })).toBeUndefined();
    expect(ambiguous.match({ name: "Demo Guard", nbaTeam: "ZZZ" })?.id).toBe("other");
  });

  it("synthesises a placeholder so unknown drafted players still leave the pool", () => {
    const resolved = index.resolve({ name: "Rookie Nobody", nbaTeam: "QQQ", positions: ["SF"] });
    expect(resolved.tags).toContain("unmatched");
    expect(resolved.projection).toBeUndefined();
    expect(resolved.id).toBe("rookie nobody|qqq");
  });
});
