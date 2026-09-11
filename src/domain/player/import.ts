import { projectionRowSchema, type ProjectionRow } from "@/shared/schema";
import { fallbackPlayerId, normalizeName, parsePositions } from "@/shared/names";
import type { Player, Projection } from "@/shared/types";

export interface ImportResult {
  players: Player[];
  errors: string[];
  skipped: number;
}

const HEADER_ALIASES: Record<string, keyof ProjectionRow> = {
  id: "player_id",
  playerid: "player_id",
  player_id: "player_id",
  player: "name",
  name: "name",
  playername: "name",
  team: "team",
  nbateam: "team",
  tm: "team",
  pos: "positions",
  position: "positions",
  positions: "positions",
  eligiblepositions: "positions",
  gp: "gp",
  games: "gp",
  g: "gp",
  mpg: "mpg",
  min: "mpg",
  minutes: "mpg",
  fgpct: "fg_pct",
  "fg%": "fg_pct",
  fg_pct: "fg_pct",
  fgm: "fgm",
  fga: "fga",
  ftpct: "ft_pct",
  "ft%": "ft_pct",
  ft_pct: "ft_pct",
  ftm: "ftm",
  fta: "fta",
  "3pm": "three_pm",
  threepm: "three_pm",
  three_pm: "three_pm",
  tpm: "three_pm",
  fg3m: "three_pm",
  pts: "pts",
  points: "pts",
  reb: "reb",
  trb: "reb",
  rebounds: "reb",
  ast: "ast",
  assists: "ast",
  stl: "stl",
  steals: "stl",
  blk: "blk",
  blocks: "blk",
  to: "tov",
  tov: "tov",
  turnovers: "tov",
  adp: "adp",
  rank: "rank",
  yahoorank: "rank",
  yahoo_id: "yahoo_id",
  yahooid: "yahoo_id",
  injury: "injury_status",
  injury_status: "injury_status",
  status: "injury_status",
};

function canonicalHeader(raw: string): keyof ProjectionRow | undefined {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/_/g, "")];
}

/** Minimal RFC4180-ish CSV splitter (handles quoted fields and embedded commas). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function percentFromMaybeWhole(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return value > 1.5 ? value / 100 : value;
}

function toProjection(row: ProjectionRow): Projection | undefined {
  const required = [row.pts, row.reb, row.ast, row.stl, row.blk, row.tov, row.three_pm];
  if (required.some((v) => v === undefined || Number.isNaN(v))) return undefined;

  let fgPct = percentFromMaybeWhole(row.fg_pct);
  let ftPct = percentFromMaybeWhole(row.ft_pct);
  let { fga, fta, fgm, ftm } = row;

  if (fgPct === undefined && fgm !== undefined && fga) fgPct = fgm / fga;
  if (ftPct === undefined && ftm !== undefined && fta) ftPct = ftm / fta;
  if (fga === undefined && fgm !== undefined && fgPct) fga = fgm / fgPct;
  if (fta === undefined && ftm !== undefined && ftPct) fta = ftm / ftPct;
  // Without attempt volume the percentage impact model cannot weight the player;
  // fall back to a rough attempt estimate from scoring volume.
  if (fga === undefined && fgPct) fga = (row.pts! * 0.42) / Math.max(0.3, fgPct);
  if (fta === undefined && ftPct) fta = row.pts! * 0.22;

  return {
    gp: row.gp ?? 70,
    mpg: row.mpg,
    fgm,
    fga,
    fgPct,
    ftm,
    fta,
    ftPct,
    threes: row.three_pm!,
    pts: row.pts!,
    reb: row.reb!,
    ast: row.ast!,
    stl: row.stl!,
    blk: row.blk!,
    tov: row.tov!,
  };
}

export function rowToPlayer(row: ProjectionRow): Player {
  const name = row.name.trim();
  const nbaTeam = (row.team ?? "").trim().toUpperCase();
  return {
    id: row.player_id?.trim() || fallbackPlayerId(name, nbaTeam),
    providerIds: row.yahoo_id ? { yahoo: row.yahoo_id } : undefined,
    name,
    normalizedName: normalizeName(name),
    nbaTeam,
    positions: parsePositions(row.positions),
    rank: row.rank,
    adp: row.adp,
    projection: toProjection(row),
    injuryStatus: row.injury_status,
  };
}

export function parseProjectionsCsv(text: string): ImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { players: [], errors: ["CSV has no data rows"], skipped: 0 };

  const headers = splitCsvLine(lines[0]).map(canonicalHeader);
  if (!headers.includes("name")) return { players: [], errors: ["CSV is missing a `name` column"], skipped: 0 };

  const players: Player[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      const value = cells[idx];
      if (value !== undefined && value !== "") raw[header] = value;
    });
    const parsed = projectionRowSchema.safeParse(raw);
    if (!parsed.success) {
      skipped++;
      if (errors.length < 10) errors.push(`row ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    players.push(rowToPlayer(parsed.data));
  }
  return { players, errors, skipped };
}

export function parseProjectionsJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { players: [], errors: [`invalid JSON: ${(err as Error).message}`], skipped: 0 };
  }
  const rows = Array.isArray(data) ? data : (data as { players?: unknown[] }).players;
  if (!Array.isArray(rows)) return { players: [], errors: ["expected an array of players"], skipped: 0 };

  const players: Player[] = [];
  const errors: string[] = [];
  let skipped = 0;
  rows.forEach((row, idx) => {
    const normalizedRow: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      const header = canonicalHeader(key);
      if (header && value !== null && value !== "") normalizedRow[header] = value;
    }
    if (Array.isArray((row as { positions?: unknown }).positions)) {
      normalizedRow.positions = ((row as { positions: string[] }).positions ?? []).join("|");
    }
    const parsed = projectionRowSchema.safeParse(normalizedRow);
    if (!parsed.success) {
      skipped++;
      if (errors.length < 10) errors.push(`item ${idx}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      return;
    }
    players.push(rowToPlayer(parsed.data));
  });
  return { players, errors, skipped };
}

export function parseProjections(text: string, filename = ""): ImportResult {
  const looksJson = filename.toLowerCase().endsWith(".json") || text.trimStart().startsWith("[") || text.trimStart().startsWith("{");
  return looksJson ? parseProjectionsJson(text) : parseProjectionsCsv(text);
}
