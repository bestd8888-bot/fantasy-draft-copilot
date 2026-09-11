/**
 * All Yahoo DOM knowledge lives here. Nothing outside this folder may query the
 * page — that is what keeps a Yahoo redesign to a one-file fix.
 *
 * Every entry is an ordered candidate list: stable hooks (data-test, aria-label,
 * role) first, structural guesses last. `resolve()` reports which candidate hit
 * so the inspector and parser health can show selector drift.
 *
 * ⚠️  These are calibrated against the bundled fixtures, NOT against a live
 *     2026 Yahoo draft room. Run the DOM inspector in a Yahoo mock draft and
 *     update this file before trusting it live. See README "Selector calibration".
 */
export interface SelectorGroup {
  /** Ordered candidate CSS selectors. */
  candidates: string[];
  /** Optional text pattern a candidate element must match to be accepted. */
  textPattern?: RegExp;
}

export const yahooSelectors = {
  draftBoard: {
    candidates: [
      '[data-test="draft-board"]',
      '[data-test*="draft-board"]',
      '[data-testid*="draftBoard"]',
      '[aria-label*="Draft Board" i]',
      "#draft-board",
      ".draft-board",
    ],
  } satisfies SelectorGroup,

  resultsPanel: {
    candidates: [
      '[data-test="draft-results"]',
      '[data-test*="results"]',
      '[aria-label*="Draft Results" i]',
      "#draft-results",
      ".draft-results",
    ],
  } satisfies SelectorGroup,

  /** A single completed pick inside the results panel. */
  pickRow: {
    candidates: [
      '[data-test="pick-row"]',
      '[data-test*="pick"]',
      '[data-testid*="pick"]',
      "li[data-pick]",
      "tr[data-pick]",
      "ul > li",
      "tbody > tr",
    ],
  } satisfies SelectorGroup,

  playerList: {
    candidates: [
      '[data-test="player-list"]',
      '[data-test*="players"]',
      '[aria-label*="Available Players" i]',
      "#players-table",
      ".players-table",
    ],
  } satisfies SelectorGroup,

  playerRow: {
    candidates: [
      '[data-test="player-row"]',
      '[data-test*="player-row"]',
      "tr[data-player-id]",
      "li[data-player-id]",
      "tbody > tr",
      "ul > li",
    ],
  } satisfies SelectorGroup,

  myTeamPanel: {
    candidates: [
      '[data-test="my-team"]',
      '[data-test*="my-team"]',
      '[aria-label*="My Team" i]',
      "#my-team",
      ".my-team",
    ],
  } satisfies SelectorGroup,

  myTeamMarker: {
    candidates: ['[data-test="is-my-team"]', "[data-my-team]", '[class*="is-me" i]', '[aria-current="true"]'],
  } satisfies SelectorGroup,

  timer: {
    candidates: ['[data-test="draft-timer"]', '[data-test*="timer"]', '[aria-label*="Time remaining" i]', ".draft-timer"],
    textPattern: /\d{1,2}:\d{2}/,
  } satisfies SelectorGroup,

  roundLabel: {
    candidates: ['[data-test="draft-round"]', '[data-test*="round"]', '[aria-label*="Round" i]', ".draft-round"],
    textPattern: /round\s*\d+/i,
  } satisfies SelectorGroup,

  currentPickLabel: {
    candidates: [
      '[data-test="current-pick"]',
      '[data-test*="on-the-clock"]',
      '[aria-label*="On the clock" i]',
      ".current-pick",
    ],
  } satisfies SelectorGroup,

  /** Attributes that may carry the Yahoo player id on a row. */
  playerIdAttributes: ["data-player-id", "data-playerid", "data-pid", "data-test-player-id"],
  /** Attributes that may carry the team id on a pick row. */
  teamIdAttributes: ["data-team-id", "data-teamid", "data-test-team-id"],
};

export interface ResolveResult {
  elements: HTMLElement[];
  matchedSelector?: string;
}

/** Runs the candidate list in order and returns the first selector that hits. */
export function resolveAll(root: ParentNode, group: SelectorGroup): ResolveResult {
  for (const selector of group.candidates) {
    let found: HTMLElement[];
    try {
      found = [...root.querySelectorAll<HTMLElement>(selector)];
    } catch {
      continue; // Malformed selector: skip rather than break the whole parse.
    }
    if (group.textPattern) found = found.filter((el) => group.textPattern!.test(el.textContent ?? ""));
    if (found.length > 0) return { elements: found, matchedSelector: selector };
  }
  return { elements: [] };
}

export function resolveFirst(root: ParentNode, group: SelectorGroup): HTMLElement | undefined {
  return resolveAll(root, group).elements[0];
}

export function readAttribute(el: Element, attributes: string[]): string | undefined {
  for (const attribute of attributes) {
    const value = el.getAttribute(attribute);
    if (value) return value;
  }
  return undefined;
}
