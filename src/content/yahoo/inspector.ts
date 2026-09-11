import { cleanText, extractPlayerFromText } from "./parser";
import { resolveAll, yahooSelectors, type SelectorGroup } from "./selectors";

export interface InspectedElement {
  selectorGroup: string;
  matchedSelector?: string;
  hitCount: number;
  sampleText: string[];
  attributes: Record<string, string>[];
  /** Text of the nearest clickable control, useful for locating draft buttons. */
  nearestClickable?: string;
  parsedPlayerSample?: string;
}

export interface InspectorReport {
  capturedAt: string;
  url: string;
  title: string;
  groups: InspectedElement[];
  candidateRowSelectors: { selector: string; count: number; sample: string }[];
}

const SENSITIVE_ATTRS = /^(?:.*(?:token|session|auth|cookie|email|crumb|csrf|guid|uid|user|account).*)$/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const LONG_ID_RE = /\b[A-Za-z0-9_-]{24,}\b/g;

/** Strips anything that could carry identity or auth before export. */
export function sanitizeText(text: string): string {
  return text.replace(EMAIL_RE, "[email]").replace(LONG_ID_RE, "[id]").slice(0, 220);
}

function attributesOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attribute of [...el.attributes]) {
    if (SENSITIVE_ATTRS.test(attribute.name)) continue;
    if (attribute.name === "style") continue;
    out[attribute.name] = sanitizeText(attribute.value);
  }
  return out;
}

function inspectGroup(name: string, group: SelectorGroup): InspectedElement {
  const { elements, matchedSelector } = resolveAll(document, group);
  const sample = elements.slice(0, 5);
  const firstText = sample[0] ? cleanText(sample[0]) : "";
  return {
    selectorGroup: name,
    matchedSelector,
    hitCount: elements.length,
    sampleText: sample.map((el) => sanitizeText(cleanText(el))),
    attributes: sample.map(attributesOf),
    nearestClickable: sample[0]
      ? sanitizeText(cleanText(sample[0].querySelector("button, [role='button'], a")) || "")
      : undefined,
    parsedPlayerSample: firstText ? extractPlayerFromText(firstText)?.name : undefined,
  };
}

/**
 * Scans the page for repeated row-like structures. This is how you find the real
 * pick/player row selector in a live draft room when the known candidates miss.
 */
export function discoverRowSelectors(minRepeat = 6): { selector: string; count: number; sample: string }[] {
  const counts = new Map<string, HTMLElement[]>();
  for (const el of document.querySelectorAll<HTMLElement>("li, tr, div[class], div[data-test]")) {
    const dataTest = el.getAttribute("data-test") ?? el.getAttribute("data-testid");
    const key = dataTest
      ? `[data-test="${dataTest}"]`
      : el.classList.length
        ? `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")}`
        : el.tagName.toLowerCase();
    const bucket = counts.get(key);
    if (bucket) bucket.push(el);
    else counts.set(key, [el]);
  }

  return [...counts.entries()]
    .filter(([, els]) => els.length >= minRepeat)
    .map(([selector, els]) => ({
      selector,
      count: els.length,
      sample: sanitizeText(cleanText(els[0])),
    }))
    .filter((entry) => Boolean(extractPlayerFromText(entry.sample)))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
}

export function captureInspectorReport(): InspectorReport {
  const groups: InspectedElement[] = [];
  for (const [name, group] of Object.entries(yahooSelectors)) {
    if (!group || Array.isArray(group)) continue; // skip attribute lists
    groups.push(inspectGroup(name, group as SelectorGroup));
  }
  return {
    capturedAt: new Date().toISOString(),
    // Query strings on Yahoo league URLs can carry identifiers.
    url: `${location.origin}${location.pathname}`,
    title: sanitizeText(document.title),
    groups,
    candidateRowSelectors: discoverRowSelectors(),
  };
}

export function downloadInspectorReport(): void {
  const report = captureInspectorReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `draft-dom-inspection-${Date.now()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
