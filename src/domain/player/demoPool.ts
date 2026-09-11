import { normalizeName } from "@/shared/names";
import type { Player, Position } from "@/shared/types";

/**
 * Deterministic synthetic player pool for mock / fixture mode.
 *
 * These are FICTIONAL players with invented projections. They exist so the
 * engine, overlay and tests can run without shipping third-party projection
 * data. Import a real CSV/JSON in the options page for live drafts.
 */

const FIRST = [
  "Andre", "Brandon", "Caleb", "Darius", "Elias", "Marcus", "Tobias", "Jalen", "Nico", "Omar",
  "Rashad", "Silas", "Teddy", "Victor", "Wesley", "Zane", "Kofi", "Luka", "Miles", "Dario",
  "Emeka", "Franco", "Hugo", "Ivan", "Jonas", "Kai", "Leon", "Mateo", "Nikola", "Oscar",
];
const LAST = [
  "Abara", "Brooks", "Calder", "Devane", "Ellery", "Farrow", "Gundry", "Holloway", "Ivers", "Jessup",
  "Kovac", "Lindqvist", "Mabry", "Nazari", "Okafor", "Pellini", "Quill", "Rendon", "Sandoval", "Tanaka",
  "Ulmer", "Vasquez", "Whitfield", "Xiong", "Yates", "Zeller", "Benoit", "Cortes", "Dembele", "Eriksen",
];
const TEAMS = ["ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS"];

interface Archetype {
  label: string;
  positions: Position[];
  /** Multipliers applied to the tier-scaled baseline. */
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  threes: number;
  tov: number;
  fgPct: number;
  ftPct: number;
  fgaShare: number;
  ftaShare: number;
}

const ARCHETYPES: Archetype[] = [
  { label: "floor general", positions: ["PG"], pts: 0.9, reb: 0.5, ast: 2.0, stl: 1.3, blk: 0.2, threes: 1.1, tov: 1.3, fgPct: 0.455, ftPct: 0.86, fgaShare: 0.42, ftaShare: 0.22 },
  { label: "scoring guard", positions: ["PG", "SG"], pts: 1.3, reb: 0.6, ast: 1.1, stl: 1.1, blk: 0.2, threes: 1.4, tov: 1.1, fgPct: 0.445, ftPct: 0.88, fgaShare: 0.47, ftaShare: 0.2 },
  { label: "3&D wing", positions: ["SG", "SF"], pts: 0.85, reb: 0.7, ast: 0.6, stl: 1.4, blk: 0.5, threes: 1.6, tov: 0.7, fgPct: 0.46, ftPct: 0.84, fgaShare: 0.4, ftaShare: 0.12 },
  { label: "point forward", positions: ["SF", "PF"], pts: 1.2, reb: 1.1, ast: 1.3, stl: 1.0, blk: 0.6, threes: 0.9, tov: 1.2, fgPct: 0.49, ftPct: 0.74, fgaShare: 0.45, ftaShare: 0.26 },
  { label: "stretch big", positions: ["PF", "C"], pts: 1.0, reb: 1.4, ast: 0.6, stl: 0.7, blk: 1.3, threes: 1.2, fgPct: 0.48, ftPct: 0.8, tov: 0.9, fgaShare: 0.42, ftaShare: 0.15 },
  { label: "rim-running center", positions: ["C"], pts: 0.95, reb: 1.8, ast: 0.4, stl: 0.6, blk: 2.0, threes: 0.05, tov: 1.0, fgPct: 0.62, ftPct: 0.62, fgaShare: 0.3, ftaShare: 0.24 },
  { label: "hub center", positions: ["C"], pts: 1.2, reb: 1.7, ast: 1.4, stl: 0.8, blk: 1.1, threes: 0.5, tov: 1.4, fgPct: 0.56, ftPct: 0.71, fgaShare: 0.4, ftaShare: 0.25 },
  { label: "energy forward", positions: ["SF", "PF"], pts: 0.8, reb: 1.3, ast: 0.5, stl: 1.2, blk: 0.9, threes: 0.6, tov: 0.8, fgPct: 0.52, ftPct: 0.68, fgaShare: 0.34, ftaShare: 0.2 },
];

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function buildDemoPool(count = 156, seed = 20260911): Player[] {
  const rand = lcg(seed);
  const players: Player[] = [];

  for (let i = 0; i < count; i++) {
    const archetype = ARCHETYPES[i % ARCHETYPES.length];
    // Talent decays with draft position; jitter keeps ranks from being a straight line.
    const tier = Math.exp(-i / 55) * (0.85 + rand() * 0.3);
    const mpg = 20 + tier * 16;
    const usage = 0.55 + tier * 0.9;

    const pts = +(7 + 20 * tier * archetype.pts * (0.9 + rand() * 0.2)).toFixed(1);
    const fga = +(pts * archetype.fgaShare * (0.9 + rand() * 0.2) + 3).toFixed(1);
    const fta = +(pts * archetype.ftaShare * (0.85 + rand() * 0.3) + 0.6).toFixed(1);
    const fgPct = +Math.min(0.68, Math.max(0.39, archetype.fgPct + (rand() - 0.5) * 0.05)).toFixed(3);
    const ftPct = +Math.min(0.94, Math.max(0.45, archetype.ftPct + (rand() - 0.5) * 0.12)).toFixed(3);

    // First/last indices vary at different rates so every generated name is unique.
    const name = `${FIRST[i % FIRST.length]} ${LAST[(Math.floor(i / FIRST.length) + i * 7) % LAST.length]}${
      i % 17 === 16 ? " Jr." : ""
    }`;
    const projection = {
      gp: Math.round(58 + rand() * 22),
      mpg: +mpg.toFixed(1),
      fga,
      fgPct,
      fgm: +(fga * fgPct).toFixed(1),
      fta,
      ftPct,
      ftm: +(fta * ftPct).toFixed(1),
      threes: +(0.4 + 2.2 * tier * archetype.threes * (0.7 + rand() * 0.6)).toFixed(1),
      pts,
      reb: +(1.8 + 5.2 * tier * archetype.reb * (0.85 + rand() * 0.3)).toFixed(1),
      ast: +(0.8 + 3.4 * tier * archetype.ast * (0.85 + rand() * 0.3)).toFixed(1),
      stl: +(0.3 + 0.9 * tier * archetype.stl * (0.7 + rand() * 0.6)).toFixed(2),
      blk: +(0.1 + 0.8 * tier * archetype.blk * (0.7 + rand() * 0.6)).toFixed(2),
      tov: +(0.7 + 1.9 * usage * archetype.tov * (0.85 + rand() * 0.3)).toFixed(2),
    };

    players.push({
      id: `demo_${String(i + 1).padStart(3, "0")}`,
      providerIds: { yahoo: `demo_${String(i + 1).padStart(3, "0")}` },
      name,
      normalizedName: normalizeName(name),
      nbaTeam: TEAMS[(i * 13) % TEAMS.length],
      positions: archetype.positions,
      rank: i + 1,
      adp: +(i + 1 + (rand() - 0.5) * 9).toFixed(1),
      projection,
      injuryStatus: rand() < 0.06 ? "GTD" : undefined,
      tags: ["demo", archetype.label],
    });
  }

  // Rank by the pool's own ordering so ADP and rank stay broadly consistent.
  players.sort((a, b) => (a.adp ?? 0) - (b.adp ?? 0));
  players.forEach((p, idx) => {
    p.rank = idx + 1;
  });
  return players;
}
