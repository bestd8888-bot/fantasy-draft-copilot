import type { Position } from "./types";

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * Canonical key for matching a page-scraped name against the master player DB.
 * Strips accents, punctuation, generational suffixes and case.
 *
 *   normalizeName("Nikola Jokić")        -> "nikola jokic"
 *   normalizeName("Jaren Jackson Jr.")   -> "jaren jackson"
 */
export function normalizeName(raw: string): string {
  const folded = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`.]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = folded.split(" ").filter((p) => p.length > 0);
  while (parts.length > 2 && SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

/** Stable id for a player that has no provider id. */
export function fallbackPlayerId(name: string, nbaTeam: string | undefined): string {
  return `${normalizeName(name)}|${(nbaTeam ?? "").toLowerCase()}`;
}

const POSITION_ALIASES: Record<string, Position[]> = {
  PG: ["PG"],
  SG: ["SG"],
  SF: ["SF"],
  PF: ["PF"],
  C: ["C"],
  G: ["PG", "SG"],
  F: ["SF", "PF"],
  GF: ["SG", "SF"],
  FC: ["PF", "C"],
  UTIL: [],
};

/** Parses "PG|SG", "PG,SG", "PG/SG" or "G" into concrete positions. */
export function parsePositions(raw: string | string[] | undefined): Position[] {
  if (!raw) return [];
  const tokens = Array.isArray(raw) ? raw : raw.split(/[|,/\s]+/);
  const out = new Set<Position>();
  for (const token of tokens) {
    const key = token.trim().toUpperCase();
    if (!key) continue;
    for (const pos of POSITION_ALIASES[key] ?? []) out.add(pos);
  }
  return [...out];
}
