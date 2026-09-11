/**
 * Parser for Yahoo's live draft client (basketball.fantasysports.yahoo.com/draftclient/...).
 *
 * Calibrated 2026-09 against a real 12-team H2H draft room. What that page gives us:
 *
 *   - A real <table> whose header is "Queue Player XRank Rank 💎 L7ADP GP FG% FT%
 *     3PTM PTS REB AST ST BLK TO". Counting stats are SEASON TOTALS, not per game.
 *   - Every player cell is `div.ys-player[data-id]`, where data-id is the stable
 *     Yahoo player id. `data-i13n-module` says which list the cell belongs to
 *     ("player-list", "draft-scout", ...).
 *   - A status line: "00:29 Angelo's Pick • You're up in 1 Picks • Round 5, Pick 54
 *     Last: K. GEORGE (PG,SG · UTA) Paolo".
 *
 * Everything else on the page is atomic CSS ("D(f)", "W(150px)") or hashed module
 * classes ("_ys_9w258l"), so nothing here may depend on those.
 */
import { parsePositions } from "@/shared/names";
import type { DraftMeta, PlatformPlayer, Projection } from "@/shared/types";
import { cleanText } from "./parser";

const POSITION_TEAM_RE = /\b((?:PG|SG|SF|PF|C)(?:\s*,\s*(?:PG|SG|SF|PF|C))*)\s+([A-Z]{2,3})\b/;
/**
 * Injury badges. The single-letter codes (O/Q/D) are only accepted when NOT
 * followed by a period — Yahoo abbreviates names as "Q. Grimes" and "D. Harper",
 * and stripping that initial would rename the player to ". Grimes".
 */
const INJURY_RE = /\b(GTD|DTD|OUT|INJ|IL\+?|NA|O|Q|D)\b(?!\.)/;

const ROUND_PICK_RE = /round\s*(\d{1,2})\s*,?\s*pick\s*(\d{1,3})/i;
const UP_IN_RE = /up\s+in\s+(\d{1,2})\s*picks?/i;
/**
 * The user is on the clock. Yahoo swaps "<Name>'s Pick • You're up in N Picks"
 * for "Your Pick" at that moment, which is also when the countdown that would
 * otherwise give us the draft slot disappears.
 */
const ON_CLOCK_RE = /(?:^|[^a-z'’])your\s+pick\b|you(?:'|’)?re\s+on\s+the\s+clock/i;
/** Shown before the first pick, when there is no "Round N, Pick N" yet. */
const PRE_DRAFT_RE = /draft\s+(?:starting|starts|begins|will\s+begin)|starting\s+soon|waiting\s+(?:for|to)\s+(?:the\s+)?draft/i;
/** "YOUR TURN - 12TH PICK" markers injected into the player list. */
const MY_TURN_RE = /your\s+turn\s*[-–—]?\s*(\d{1,3})\s*(?:st|nd|rd|th)\s*pick/gi;
const TIMER_RE = /\b(\d{1,2}):(\d{2})\b/;

/** Column header text -> the projection field it feeds. */
const STAT_COLUMNS: Record<string, keyof Projection | "adp" | "rank" | "xrank" | "gp"> = {
  GP: "gp",
  "FG%": "fgPct",
  "FT%": "ftPct",
  "3PTM": "threes",
  "3PM": "threes",
  PTS: "pts",
  REB: "reb",
  AST: "ast",
  ST: "stl",
  STL: "stl",
  BLK: "blk",
  TO: "tov",
  TOV: "tov",
  L7ADP: "adp",
  ADP: "adp",
  RANK: "rank",
  XRANK: "xrank",
};

const COUNTING_STATS: (keyof Projection)[] = ["pts", "reb", "ast", "stl", "blk", "tov", "threes"];

/**
 * Whether the table is showing season totals rather than per-game averages.
 *
 * This MUST be decided once for the whole table, never per column: a center with
 * 8 three-pointers all season is below any sane per-game threshold for 3PM, so a
 * per-column rule would read it as "8 threes per game" and hand that player an
 * enormous z-score. Points are the reliable signal — nobody averages 60, and any
 * rostered player totals far more than that over a season.
 */
function detectSeasonTotals(rows: { pts?: number; gp?: number }[]): boolean {
  const points = rows.map((r) => r.pts).filter((v): v is number => v !== undefined && v > 0);
  if (points.length === 0) return false;
  const sorted = [...points].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] > 60;
}

export interface DraftClientSnapshot {
  players: PlatformPlayer[];
  myRoster: PlatformPlayer[];
  /** The roster panel was located, even if the roster is still empty. */
  rosterPanelFound: boolean;
  meta: DraftMeta;
  warnings: string[];
  tableFound: boolean;
  statusFound: boolean;
}

export function findPlayersTable(root: ParentNode = document): HTMLTableElement | undefined {
  for (const table of root.querySelectorAll<HTMLTableElement>("table")) {
    const header = cleanText(table.querySelector("tr"));
    if (/XRank|L7ADP|3PTM/i.test(header) && table.querySelector(".ys-player")) return table;
  }
  return undefined;
}

function headerIndexMap(table: HTMLTableElement): Map<string, number> {
  const headerRow = table.querySelector("tr");
  const map = new Map<string, number>();
  if (!headerRow) return map;
  [...headerRow.children].forEach((cell, index) => {
    // "💎 L7ADP" -> "L7ADP"
    const label = cleanText(cell).replace(/[^A-Za-z0-9%]/g, "").toUpperCase();
    if (label) map.set(label, index);
  });
  return map;
}

function numberFrom(text: string | undefined): number | undefined {
  if (!text) return undefined;
  // Yahoo writes shooting percentages as ".485" — no leading zero.
  const match = /-?(?:\d+\.?\d*|\.\d+)/.exec(text.replace(/,/g, ""));
  return match ? Number(match[0]) : undefined;
}

/** Accepts both ".485" and "48.5" for a percentage column. */
function asPercentage(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return value > 1.5 ? value / 100 : value;
}

/** Splits "F. Wagner GTD SF,PF ORL" into its parts. */
export function parsePlayerCell(cell: HTMLElement): Omit<PlatformPlayer, "projection"> | undefined {
  const container = cell.querySelector<HTMLElement>(".ys-player") ?? cell;
  const providerId = container.getAttribute("data-id") ?? undefined;
  const text = cleanText(container);
  if (!text) return undefined;

  const positionTeam = POSITION_TEAM_RE.exec(text);
  // The first span inside the player cell is the name and is already clean, so it
  // is used verbatim; only the text fallback needs badge stripping.
  const nameSpan = container.querySelector<HTMLElement>("span");
  let name: string;
  if (nameSpan) {
    name = cleanText(nameSpan);
  } else {
    const raw = positionTeam ? text.slice(0, positionTeam.index) : text;
    name = raw.replace(INJURY_RE, "");
  }
  name = name.replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return undefined;

  // Yahoo renders the badge as its own element with a descriptive title.
  const badge = container.querySelector<HTMLElement>('[title*="Injur" i], [title*="Game Time" i]');
  const injuryMatch = badge ? INJURY_RE.exec(cleanText(badge)) : INJURY_RE.exec(text.slice(name.length));

  return {
    providerId,
    name,
    nbaTeam: positionTeam?.[2],
    positions: positionTeam ? parsePositions(positionTeam[1]) : undefined,
    injuryStatus: injuryMatch?.[1],
  };
}

function projectionFrom(
  values: Partial<Record<keyof Projection, number>>,
  seasonTotals: boolean,
): Projection | undefined {
  const gp = values.gp ?? 0;
  if (gp <= 0 || COUNTING_STATS.some((key) => values[key] === undefined)) return undefined;

  const perGame = {} as Projection;
  for (const key of COUNTING_STATS) {
    perGame[key] = seasonTotals ? values[key]! / gp : values[key]!;
  }
  perGame.gp = gp;
  perGame.fgPct = asPercentage(values.fgPct);
  perGame.ftPct = asPercentage(values.ftPct);

  // The draft table has no FGA/FTA column, so volume is estimated from scoring —
  // enough to keep the percentage categories weighted rather than flat.
  if (perGame.fgPct) perGame.fga = (perGame.pts * 0.42) / Math.max(0.3, perGame.fgPct);
  if (perGame.ftPct) perGame.fta = perGame.pts * 0.22;
  return perGame;
}

export function parsePlayersTable(table: HTMLTableElement): { players: PlatformPlayer[]; warnings: string[] } {
  const columns = headerIndexMap(table);
  const warnings: string[] = [];
  const players: PlatformPlayer[] = [];

  const statEntries = Object.entries(STAT_COLUMNS).filter(([label]) => columns.has(label));
  if (!columns.has("GP") || !columns.has("PTS")) {
    warnings.push("player table has no projection columns — switch the stat dropdown to season projections");
  }

  interface RawRow {
    base: Omit<PlatformPlayer, "projection">;
    values: Partial<Record<keyof Projection, number>>;
    rank?: number;
    adp?: number;
  }
  const rawRows: RawRow[] = [];

  for (const row of table.querySelectorAll<HTMLTableRowElement>("tr")) {
    const playerCell = row.querySelector<HTMLElement>(".ys-player")?.closest("td") as HTMLElement | null;
    if (!playerCell) continue; // header row, or a "YOUR TURN - Nth PICK" marker row

    const base = parsePlayerCell(playerCell);
    if (!base) continue;

    const cells = [...row.children] as HTMLElement[];
    const values: Partial<Record<keyof Projection, number>> = {};
    let adp: number | undefined;
    let rank: number | undefined;
    let xrank: number | undefined;

    for (const [label, field] of statEntries) {
      const value = numberFrom(cleanText(cells[columns.get(label)!]));
      if (value === undefined) continue;
      if (field === "adp") adp = value;
      else if (field === "rank") rank = value;
      else if (field === "xrank") xrank = value;
      else values[field] = value;
    }

    rawRows.push({ base, values, rank: rank ?? xrank, adp: adp ?? xrank ?? rank });
  }

  // Second pass: the totals-vs-per-game decision is a property of the table.
  const seasonTotals = detectSeasonTotals(rawRows.map((r) => r.values));
  for (const raw of rawRows) {
    players.push({
      ...raw.base,
      rank: raw.rank,
      adp: raw.adp,
      projection: projectionFrom(raw.values, seasonTotals),
    });
  }

  if (players.length === 0) warnings.push("player table found but no rows parsed");
  return { players, warnings };
}

/**
 * Reads the status line, e.g.
 *   "00:29 Angelo's Pick • You're up in 1 Picks • Round 5, Pick 54".
 *
 * Each field is located independently, because Yahoo renders them as sibling
 * spans and a redesign can easily split or reorder them. For each pattern the
 * *tightest* element that still matches wins, so we read the label itself rather
 * than a paragraph of surrounding chrome.
 */
export function parseStatus(root: ParentNode = document): { meta: DraftMeta; found: boolean; preDraft?: boolean } {
  let roundPick: string | undefined;
  let upIn: string | undefined;
  let onClock = false;
  let preDraft = false;
  let timer: string | undefined;

  for (const element of root.querySelectorAll<HTMLElement>("div,span,p,section,header,h1,h2,h3,li")) {
    // Cheap pre-filter on textContent keeps this off the hot path: only a handful
    // of elements get the expensive boundary-aware text extraction.
    const raw = element.textContent;
    if (!raw || raw.length > 400 || !/pick|up in|clock|start|begin|waiting|\d:\d\d/i.test(raw)) continue;

    const text = cleanText(element);
    if (!text) continue;

    if (text.length <= 200 && ROUND_PICK_RE.test(text) && (!roundPick || text.length < roundPick.length)) {
      roundPick = text;
    }
    if (text.length <= 120 && UP_IN_RE.test(text) && (!upIn || text.length < upIn.length)) upIn = text;
    if (text.length <= 120 && ON_CLOCK_RE.test(text)) onClock = true;
    if (text.length <= 120 && PRE_DRAFT_RE.test(text)) preDraft = true;
    if (text.length <= 30 && TIMER_RE.test(text) && (!timer || text.length < timer.length)) timer = text;
  }

  if (!roundPick) {
    // The draft room is open but no pick has happened yet. That is a known,
    // readable state — not a parser failure — so the overlay stays live and
    // simply reports round 1, pick 1. The visible clock is the countdown to the
    // start, not a pick timer, so it is deliberately not reported.
    if (preDraft) return { meta: { currentRound: 1, currentPick: 1 }, found: true, preDraft: true };
    return { meta: {}, found: false };
  }

  const match = ROUND_PICK_RE.exec(roundPick)!;
  const upInMatch = upIn ? UP_IN_RE.exec(upIn) : null;
  const timerMatch = timer ? TIMER_RE.exec(timer) : null;

  return {
    meta: {
      currentRound: Number(match[1]),
      currentPick: Number(match[2]),
      picksUntilMe: upInMatch ? Number(upInMatch[1]) : onClock ? 0 : undefined,
      secondsRemaining: timerMatch ? Number(timerMatch[1]) * 60 + Number(timerMatch[2]) : undefined,
    },
    found: true,
  };
}

/**
 * Overall pick numbers the page marks as the user's ("YOUR TURN - 12TH PICK").
 *
 * These rows are rendered in the player list from the moment the room opens, so
 * they pin down the user's draft slot before a single pick has been made.
 */
export function parseMyPickNumbers(root: ParentNode = document): number[] {
  const text = (root instanceof Document ? root.body : (root as HTMLElement))?.textContent ?? "";
  const picks = new Set<number>();
  MY_TURN_RE.lastIndex = 0;
  let match = MY_TURN_RE.exec(text);
  while (match) {
    const overall = Number(match[1]);
    if (overall > 0) picks.add(overall);
    match = MY_TURN_RE.exec(text);
  }
  return [...picks].sort((a, b) => a - b);
}

/**
 * The user's own roster panel is headed "YOUR TEAM (8/13)".
 *
 * That heading is the anchor because the draft client also renders a pick
 * activity feed ("81 David P. George SF,PF BOS") built from the same
 * `.ys-player` cells — grabbing those would silently attribute other managers'
 * players to the user and poison punt detection and roster fit. The count in the
 * heading doubles as a self-check.
 */
const MY_TEAM_RE = /your\s+team\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i;

export interface RosterResult {
  players: PlatformPlayer[];
  /** True when the roster panel itself was located, even if it is still empty. */
  panelFound: boolean;
  /** How many players the page says the roster holds. */
  expected?: number;
  capacity?: number;
}

function findMyTeamPanel(root: ParentNode): { panel: HTMLElement; expected: number; capacity: number } | undefined {
  // 1. Locate the heading itself: the tightest element carrying "YOUR TEAM (n/m)".
  let heading: HTMLElement | undefined;
  let expected = 0;
  let capacity = 0;

  for (const element of root.querySelectorAll<HTMLElement>("div,section,aside,span,p")) {
    const raw = element.textContent;
    if (!raw || raw.length > 4000 || !/your\s*team/i.test(raw)) continue;

    const match = MY_TEAM_RE.exec(cleanText(element));
    if (!match) continue;
    if (heading && raw.length >= (heading.textContent?.length ?? 0)) continue;

    heading = element;
    expected = Number(match[1]);
    capacity = Number(match[2]);
  }

  if (!heading) return undefined;

  // 2. An empty roster has no player cells to find, and that is a valid state.
  if (expected === 0) return { panel: heading.parentElement ?? heading, expected, capacity };

  // 3. Otherwise walk outwards to the nearest ancestor that actually holds the
  //    roster cells. Stopping at the FIRST such ancestor keeps the unrelated
  //    pick-activity feed (same `.ys-player` component) out of the roster.
  let panel: HTMLElement | null = heading;
  for (let depth = 0; depth < 5 && panel; depth++) {
    if (panel.querySelector(".ys-player")) return { panel, expected, capacity };
    panel = panel.parentElement;
  }
  return { panel: heading.parentElement ?? heading, expected, capacity };
}

export function parseMyRoster(root: ParentNode = document, playersTable?: HTMLElement): RosterResult {
  const seen = new Set<string>();
  const players: PlatformPlayer[] = [];

  const collect = (cells: Iterable<HTMLElement>) => {
    for (const cell of cells) {
      if (playersTable?.contains(cell)) continue;
      const parsed = parsePlayerCell(cell);
      const key = parsed?.providerId ?? parsed?.name;
      if (!parsed || !key || seen.has(key)) continue;
      seen.add(key);
      players.push(parsed);
    }
  };

  const myTeam = findMyTeamPanel(root);
  if (myTeam) {
    collect(myTeam.panel.querySelectorAll<HTMLElement>(".ys-player"));
    return { players, panelFound: true, expected: myTeam.expected, capacity: myTeam.capacity };
  }

  // Fallback for surfaces that tag the roster list with an analytics module
  // instead of the "YOUR TEAM" heading.
  collect(
    [...root.querySelectorAll<HTMLElement>(".ys-player[data-i13n-module]")].filter((cell) => {
      const module = cell.getAttribute("data-i13n-module") ?? "";
      return /pick|roster|team/i.test(module) && !/player-list|draft-scout|queue/i.test(module);
    }),
  );
  return { players, panelFound: players.length > 0 };
}

export function parseDraftClient(root: ParentNode = document): DraftClientSnapshot | undefined {
  const table = findPlayersTable(root);
  const status = parseStatus(root);
  if (!table && !status.found) return undefined;

  const warnings: string[] = [];
  const { players, warnings: tableWarnings } = table ? parsePlayersTable(table) : { players: [], warnings: ["player table not found"] };
  warnings.push(...tableWarnings);

  const roster = parseMyRoster(root, table);
  const myRoster = roster.players;
  if (!roster.panelFound) {
    warnings.push("我的隊伍讀不到 — 請確認畫面上有 YOUR TEAM 欄位，roster fit 與 punt 偵測才會啟用");
  } else if (roster.expected !== undefined && myRoster.length < roster.expected) {
    // Never pretend the roster is complete: a half-read roster skews punt detection.
    warnings.push(`我的隊伍只讀到 ${myRoster.length}/${roster.expected} 名球員，請把 YOUR TEAM 欄位捲到底`);
  }
  if (!status.found) warnings.push("draft status line not found — round/pick unknown");

  const myPickNumbers = parseMyPickNumbers(root);
  return {
    players,
    myRoster,
    rosterPanelFound: roster.panelFound,
    meta: { ...status.meta, myPickNumbers: myPickNumbers.length ? myPickNumbers : undefined },
    warnings,
    tableFound: Boolean(table),
    statusFound: status.found,
  };
}
