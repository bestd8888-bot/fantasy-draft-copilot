import { parsePositions } from "@/shared/names";
import type { PlatformPlayer } from "@/shared/types";
import { readAttribute, yahooSelectors } from "./selectors";

const POSITION_TOKEN = "(?:PG|SG|SF|PF|C|G|F|GF|FC|UTIL)";
/** e.g. "GSW - PG,SG", "(GSW - PG, SG)", "BOS PF/C" */
const TEAM_POS_RE = new RegExp(
  `\\(?\\b([A-Z]{2,3})\\b\\s*[-–—|]?\\s*((?:${POSITION_TOKEN})(?:\\s*[,/|]\\s*${POSITION_TOKEN})*)\\)?`,
);
const PICK_LABEL_RE = /\b(?:R(?:ound)?\s*)?(\d{1,2})\s*[.\-–]\s*(\d{1,2})\b/;
const OVERALL_PICK_RE = /\b(?:pick|#)\s*(\d{1,3})\b/i;
const ROUND_RE = /\bround\s*(\d{1,2})\b/i;
const TIMER_RE = /(\d{1,2}):(\d{2})/;

/**
 * Visible text of an element, with a space inserted at every element boundary.
 *
 * Yahoo renders "<span>1.1</span><span>Player</span><span>BOS - PG</span>" with
 * no whitespace between spans, so a plain `textContent` yields "1.1PlayerBOS"
 * and every word-boundary pattern below would miss.
 */
export function cleanText(el: Element | null | undefined): string {
  if (!el) return "";
  const parts: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue?.trim();
    if (value) parts.push(value);
    node = walker.nextNode();
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export interface ParsedPlayerText {
  name: string;
  nbaTeam?: string;
  positions?: string[];
}

/**
 * Pulls a player out of a row's visible text. Yahoo renders picks roughly as
 * "1.3  Player Name  GSW - PG,SG", so the team/position tag is the anchor: the
 * name is whatever precedes it once the pick label is removed.
 */
export function extractPlayerFromText(rawText: string): ParsedPlayerText | undefined {
  const text = rawText.replace(/\s+/g, " ").trim();
  if (!text) return undefined;

  const teamPos = TEAM_POS_RE.exec(text);
  let namePart = teamPos ? text.slice(0, teamPos.index) : text;

  namePart = namePart
    .replace(PICK_LABEL_RE, " ")
    .replace(OVERALL_PICK_RE, " ")
    .replace(/^\s*\d{1,3}[.)]\s*/, " ")
    .replace(/\b(?:GTD|OUT|DTD|INJ|IL|IL\+|O|Q|D)\b\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  // A name needs at least two words; anything shorter is almost always chrome.
  if (namePart.split(" ").length < 2 || namePart.length > 60) return undefined;

  return {
    name: namePart,
    nbaTeam: teamPos?.[1],
    positions: teamPos ? parsePositions(teamPos[2]) : undefined,
  };
}

export function parsePlayerRow(el: HTMLElement): PlatformPlayer | undefined {
  const providerId = readAttribute(el, yahooSelectors.playerIdAttributes);
  const nameEl = el.querySelector<HTMLElement>('[data-test*="name"], .player-name, a[href*="/players/"]');
  const text = cleanText(el);

  const parsed = extractPlayerFromText(nameEl ? `${cleanText(nameEl)} ${text}` : text) ?? undefined;
  const name = nameEl ? cleanText(nameEl).replace(/\s*\(.*$/, "") : parsed?.name;
  if (!name || name.split(" ").length < 2) return undefined;

  const rank = numberFromAttrOrText(el, ["data-rank", "data-test-rank"], /\brank\s*:?\s*(\d{1,3})\b/i);
  const adp = numberFromAttrOrText(el, ["data-adp", "data-test-adp"], /\badp\s*:?\s*(\d{1,3}(?:\.\d)?)\b/i);
  const injuryStatus = cleanText(el.querySelector('[data-test*="injury"], .injury-status')) || undefined;

  return {
    providerId,
    name,
    nbaTeam: parsed?.nbaTeam,
    positions: parsed?.positions,
    rank,
    adp,
    injuryStatus,
  };
}

export interface ParsedPickRow {
  round?: number;
  pickInRound?: number;
  overall?: number;
  teamId?: string;
  teamName?: string;
  player: PlatformPlayer;
}

export function parsePickRow(el: HTMLElement): ParsedPickRow | undefined {
  const text = cleanText(el);
  if (!text) return undefined;

  const player = parsePlayerRow(el);
  if (!player) return undefined;

  const pickLabel = PICK_LABEL_RE.exec(text);
  const overallAttr = el.getAttribute("data-pick") ?? el.getAttribute("data-overall-pick");
  const overallFromText = OVERALL_PICK_RE.exec(text);

  return {
    round: pickLabel ? Number(pickLabel[1]) : undefined,
    pickInRound: pickLabel ? Number(pickLabel[2]) : undefined,
    overall: overallAttr ? Number(overallAttr) : overallFromText ? Number(overallFromText[1]) : undefined,
    teamId: readAttribute(el, yahooSelectors.teamIdAttributes),
    teamName: cleanText(el.querySelector('[data-test*="team-name"], .team-name')) || undefined,
    player,
  };
}

export function parseRound(text: string): number | undefined {
  const match = ROUND_RE.exec(text);
  return match ? Number(match[1]) : undefined;
}

export function parseOverallPick(text: string): number | undefined {
  const match = OVERALL_PICK_RE.exec(text);
  return match ? Number(match[1]) : undefined;
}

export function parseTimerSeconds(text: string): number | undefined {
  const match = TIMER_RE.exec(text);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function numberFromAttrOrText(el: HTMLElement, attributes: string[], pattern: RegExp): number | undefined {
  const attr = readAttribute(el, attributes);
  if (attr && !Number.isNaN(Number(attr))) return Number(attr);
  const match = pattern.exec(cleanText(el));
  return match ? Number(match[1]) : undefined;
}
