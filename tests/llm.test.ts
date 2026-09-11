import { afterEach, describe, expect, it, vi } from "vitest";
import { explainWithTimeout } from "@/llm/provider";
import { buildLlmPayload } from "@/llm/prompt";
import { recommend } from "@/domain/recommendation/RecommendationEngine";
import { buildDemoPool } from "@/domain/player/demoPool";
import { makeState } from "./helpers";

const pool = buildDemoPool(60);
const state = makeState({ available: pool, myRoster: pool.slice(0, 2), currentRound: 3, currentPick: 27 });
const result = recommend(state);
const settings = { enabled: true, provider: "openai" as const, model: "gpt-4o-mini", apiKey: "sk-test", timeoutMs: 50 };
const allowedPlayerIds = result.recommendations.slice(0, 5).map((r) => r.playerId);

function mockFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("LLM payload", () => {
  it("contains only normalized basketball data", () => {
    const payload = buildLlmPayload(state, result);
    const serialized = JSON.stringify(payload);

    expect(payload.candidates).toHaveLength(5);
    expect(payload.league.teams).toBe(12);
    expect(serialized).not.toMatch(/cookie|token|session|yahoo\.com|<html|<div/i);
    expect(Object.keys(payload)).toEqual(["league", "strategy", "myRoster", "candidates"]);
  });
});

describe("explainWithTimeout", () => {
  it("returns a validated explanation", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ bestPick: allowedPlayerIds[0], shortReason: "補 AST/STL", warnings: [], confidence: 0.9 }),
    );
    const explanation = await explainWithTimeout({ payload: buildLlmPayload(state, result), settings, allowedPlayerIds });
    expect(explanation?.bestPick).toBe(allowedPlayerIds[0]);
    expect(explanation?.shortReason).toBe("補 AST/STL");
  });

  it("AT-03: rejects a player outside the candidate list and falls back silently", async () => {
    vi.stubGlobal("fetch", mockFetch({ bestPick: "hallucinated-player", shortReason: "x", confidence: 1 }));
    await expect(
      explainWithTimeout({ payload: buildLlmPayload(state, result), settings, allowedPlayerIds }),
    ).resolves.toBeUndefined();
  });

  it("returns undefined on HTTP errors and on timeout", async () => {
    vi.stubGlobal("fetch", mockFetch({}, false));
    await expect(
      explainWithTimeout({ payload: buildLlmPayload(state, result), settings, allowedPlayerIds }),
    ).resolves.toBeUndefined();

    vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    );
    await expect(
      explainWithTimeout({ payload: buildLlmPayload(state, result), settings, allowedPlayerIds }),
    ).resolves.toBeUndefined();
  });

  it("does nothing when the provider is disabled", async () => {
    const fetchSpy = mockFetch({});
    vi.stubGlobal("fetch", fetchSpy);
    await explainWithTimeout({
      payload: buildLlmPayload(state, result),
      settings: { ...settings, enabled: false },
      allowedPlayerIds,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("demo pool", () => {
  it("generates unique ids and names", () => {
    const big = buildDemoPool(300);
    expect(new Set(big.map((p) => p.id)).size).toBe(300);
    expect(new Set(big.map((p) => p.normalizedName)).size).toBe(300);
    expect(big.every((p) => p.projection && p.projection.pts > 0)).toBe(true);
  });
});
