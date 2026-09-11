import { debounce } from "@/shared/util";

export interface ObserverOptions {
  /** Containers to watch. Falls back to document.body when none are found. */
  roots: Element[];
  debounceMs?: number;
  /** Safety net for updates that never produce a mutation (canvas, workers). */
  pollMs?: number;
}

/**
 * Watches the draft room for changes.
 *
 * Scoped to the draft containers rather than the whole document, and debounced,
 * so a busy draft room does not pin a CPU core.
 */
export function observeDraftRoom(options: ObserverOptions, onChange: () => void): () => void {
  const debounced = debounce(onChange, options.debounceMs ?? 200);
  const roots = options.roots.length > 0 ? options.roots : [document.body];

  const observer = new MutationObserver(() => debounced());
  for (const root of roots) {
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  const poll = window.setInterval(() => debounced(), options.pollMs ?? 5000);

  return () => {
    observer.disconnect();
    window.clearInterval(poll);
    debounced.cancel();
  };
}
