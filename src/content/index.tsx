import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import overlayCss from "@/ui/overlay/overlay.css?inline";
import { OverlayApp, type MockControls } from "@/ui/overlay/OverlayApp";
import { YahooDraftAdapter } from "./yahoo/YahooDraftAdapter";
import { MockDraftAdapter } from "./mock/MockDraftAdapter";
import { downloadInspectorReport } from "./yahoo/inspector";
import { buildDemoPool } from "@/domain/player/demoPool";
import { connectAdapter, restoreSession, useDraftStore } from "@/store/useDraftStore";
import { deriveSessionId, loadPlayers, loadSettings } from "@/store/persistence";
import { explainWithTimeout } from "@/llm/provider";
import { buildLlmPayload } from "@/llm/prompt";
import { logger, setVerbose } from "@/shared/logger";
import type { DraftPlatformAdapter } from "./adapter";
import type { DraftState } from "@/shared/types";

const HOST_ID = "fantasy-draft-ai-copilot-root";

type Mode = "yahoo" | "mock" | "fixture" | "off";

function detectMode(): Mode {
  const params = new URLSearchParams(location.search);
  const requested = params.get("draftcopilot") ?? (location.hash.includes("draftcopilot=mock") ? "mock" : null);
  if (requested === "mock") return "mock";
  if (requested === "fixture") return "fixture";

  if (new YahooDraftAdapter().detect()) return "yahoo";
  // A local fixture page identifies itself explicitly; we never inject into
  // arbitrary pages.
  if (document.querySelector('[data-draft-copilot="fixture"]')) return "fixture";
  return "off";
}

async function bootstrap(): Promise<void> {
  const mode = detectMode();
  if (mode === "off") return;
  if (document.getElementById(HOST_ID)) return;

  const settings = await loadSettings();
  setVerbose(settings.devInspector);

  const { players } = await loadPlayers();
  const store = useDraftStore.getState();
  store.setSettings(settings);

  // Mock and fixture modes fall back to the bundled fictional pool so the whole
  // pipeline is runnable with no data import.
  const pool = players.length > 0 ? players : mode === "yahoo" ? [] : buildDemoPool();
  store.setPlayers(pool);
  // On Yahoo an empty import is the normal case: the draft client's own player
  // table supplies both the pool and the projections. Nothing to warn about —
  // and a console.warn here would light up the extension's "Errors" badge.
  if (players.length === 0 && mode === "yahoo") {
    logger.debug("no projections imported; using the draft page's own stat table");
  }

  const sessionId = deriveSessionId();
  await restoreSession(sessionId);

  let adapter: DraftPlatformAdapter;
  let mockControls: MockControls | undefined;
  let platform: DraftState["platform"] = mode === "mock" ? "mock" : mode === "fixture" ? "fixture" : "yahoo";

  if (mode === "mock") {
    const mock = new MockDraftAdapter({
      league: settings.league,
      pool,
      myDraftSlot: settings.myDraftSlot ?? 3,
      autoPickMs: 3500,
    });
    adapter = mock;
    mockControls = {
      isMyTurn: mock.isMyTurn,
      onSimulatePick: () => mock.simulatePick(),
      onDraftBest: () => {
        const best = useDraftStore.getState().result?.recommendations[0];
        if (best) mock.draftForMe(best.playerId);
      },
      onReset: () => mock.reset(),
    };
  } else {
    adapter = new YahooDraftAdapter({
      myDraftSlot: settings.myDraftSlot,
      teams: settings.league.teams,
    });
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  const mount = document.createElement("div");
  shadow.append(style, mount);
  document.body.appendChild(host);

  createRoot(mount).render(
    <StrictMode>
      <OverlayApp
        mockControls={mockControls}
        onOpenInspector={mode === "yahoo" || settings.devInspector ? downloadInspectorReport : undefined}
      />
    </StrictMode>,
  );

  connectAdapter(adapter, sessionId, platform);
  wireLlmExplanations();

  // Settings changed in the options page apply without reloading the draft tab.
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) void loadSettings().then((next) => useDraftStore.getState().setSettings(next));
    if (changes.players) void loadPlayers().then(({ players: next }) => useDraftStore.getState().setPlayers(next));
  });

  (window as unknown as { __draftCopilot?: unknown }).__draftCopilot = {
    store: useDraftStore,
    adapter,
    inspector: () => import("./yahoo/inspector").then((m) => m.captureInspectorReport()),
  };

  logger.debug(`overlay active (${mode}) · ${pool.length} players in the imported pool`);
}

/**
 * Fires the optional LLM explanation after the deterministic result is already
 * on screen. Never blocks rendering, and skips quick mode entirely.
 */
function wireLlmExplanations(): void {
  let lastKey = "";
  useDraftStore.subscribe((state) => {
    const { result, settings, quickMode } = state;
    const best = result?.recommendations[0];
    if (!best || !state.state) return;
    if (!settings.llm.enabled || settings.llm.provider === "none") {
      if (state.aiStatus !== "disabled") state.setAi(undefined, "disabled");
      return;
    }
    if (quickMode) return;

    const key = `${state.state.currentPick}:${best.playerId}`;
    if (key === lastKey) return;
    lastKey = key;

    state.setAi(state.ai, "loading");
    void explainWithTimeout({
      payload: buildLlmPayload(state.state, result),
      settings: settings.llm,
      allowedPlayerIds: result.recommendations.slice(0, 5).map((r) => r.playerId),
    }).then((explanation) => {
      const current = useDraftStore.getState();
      if (explanation) current.setAi(explanation, "idle");
      else current.setAi(undefined, "error");
    });
  });
}

void bootstrap().catch((err) => logger.error("bootstrap failed", err));
