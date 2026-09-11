import { llmResponseSchema } from "@/shared/schema";
import type { AiExplanation, LlmSettings } from "@/shared/types";
import { logger } from "@/shared/logger";
import { SYSTEM_PROMPT, type LlmPayload } from "./prompt";

export interface ExplainRequest {
  payload: LlmPayload;
  settings: LlmSettings;
  /** Valid candidate ids; a reply naming anything else is rejected. */
  allowedPlayerIds: string[];
}

export interface LlmProvider {
  readonly name: string;
  explain(request: ExplainRequest, signal: AbortSignal): Promise<AiExplanation>;
}

class OpenAiProvider implements LlmProvider {
  readonly name = "openai";

  async explain(request: ExplainRequest, signal: AbortSignal): Promise<AiExplanation> {
    const { settings, payload } = request;
    if (!settings.apiKey) throw new Error("missing API key");

    const response = await fetch(`${settings.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty LLM response");

    const parsed = llmResponseSchema.parse(JSON.parse(content));
    // Guardrail: the LLM may only choose from the deterministic shortlist.
    if (!request.allowedPlayerIds.includes(parsed.bestPick)) {
      throw new Error("LLM picked a player outside the candidate list");
    }
    return { ...parsed, generatedAt: Date.now() };
  }
}

const PROVIDERS: Record<string, LlmProvider> = { openai: new OpenAiProvider() };

/**
 * Runs the explanation with a hard timeout. Never throws into the caller's
 * render path: on any failure the deterministic recommendation stands alone.
 */
export async function explainWithTimeout(request: ExplainRequest): Promise<AiExplanation | undefined> {
  const { settings } = request;
  if (!settings.enabled || settings.provider === "none") return undefined;

  const provider = PROVIDERS[settings.provider];
  if (!provider) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    return await provider.explain(request, controller.signal);
  } catch (err) {
    logger.warn("LLM explanation unavailable:", (err as Error).message);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
