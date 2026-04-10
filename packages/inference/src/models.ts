import type {
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "openclaw/plugin-sdk/provider-model-shared";
import { DEFAULT_CONTEXT_TOKENS } from "openclaw/plugin-sdk/provider-model-shared";
import { createSubsystemLogger } from "openclaw/plugin-sdk/runtime-env";
import {
  COSINE_DEFAULT_MODEL_ID,
  COSINE_ORIGIN_HEADER,
  resolveCosineProviderBaseUrl,
} from "./auth.js";

const log = createSubsystemLogger("cosine-inference/models");
const DEFAULT_MAX_TOKENS = 32_768;
const DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

type OpenAIModelEntry = {
  id?: unknown;
};

type OpenAIModelsResponse = {
  data?: OpenAIModelEntry[];
};

function trimNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function inferReasoningSupport(modelId: string): boolean {
  return /\b(?:gpt-5|o[13-9]|codex|reason|thinking|claude|gemini|kimi|qwen|minimax|glm)\b/i.test(
    modelId,
  );
}

function inferVisionSupport(modelId: string): boolean {
  return /\b(?:vision|gpt|claude|gemini|kimi|qwen)\b/i.test(modelId);
}

function buildCosineModelDefinition(modelId: string): ModelDefinitionConfig {
  return {
    id: modelId,
    name: modelId,
    reasoning: inferReasoningSupport(modelId),
    input: inferVisionSupport(modelId) ? ["text", "image"] : ["text"],
    cost: DEFAULT_COST,
    contextWindow: DEFAULT_CONTEXT_TOKENS,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

function buildStaticCatalog(): ModelDefinitionConfig[] {
  return [buildCosineModelDefinition(COSINE_DEFAULT_MODEL_ID)];
}

export async function discoverCosineModels(params?: {
  baseUrl?: string;
  bearerToken?: string;
  fetchFn?: typeof fetch;
}): Promise<ModelDefinitionConfig[]> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return buildStaticCatalog();
  }

  const baseUrl = params?.baseUrl ?? resolveCosineProviderBaseUrl();
  const fetchFn = params?.fetchFn ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "cosine-origin": COSINE_ORIGIN_HEADER,
  };
  if (params?.bearerToken?.trim()) {
    headers.Authorization = `Bearer ${params.bearerToken.trim()}`;
  }

  try {
    const response = await fetchFn(`${normalizeBaseUrl(baseUrl)}/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      log.warn(`Failed to discover Cosine models: HTTP ${response.status}`);
      return buildStaticCatalog();
    }

    const payload = (await response.json()) as OpenAIModelsResponse;
    const ids = new Set<string>();
    for (const model of payload.data ?? []) {
      const id = trimNonEmptyString(model.id);
      if (id) {
        ids.add(id);
      }
    }

    if (ids.size === 0) {
      return buildStaticCatalog();
    }

    return [...ids].toSorted((a, b) => a.localeCompare(b)).map(buildCosineModelDefinition);
  } catch (error) {
    log.warn(`Failed to discover Cosine models: ${String(error)}`);
    return buildStaticCatalog();
  }
}

export async function buildCosineProvider(params?: {
  baseUrl?: string;
  bearerToken?: string;
  fetchFn?: typeof fetch;
}): Promise<ModelProviderConfig> {
  const baseUrl = params?.baseUrl ?? resolveCosineProviderBaseUrl();
  return {
    baseUrl,
    api: "openai-responses",
    auth: "oauth",
    authHeader: true,
    models: await discoverCosineModels({
      baseUrl,
      bearerToken: params?.bearerToken,
      fetchFn: params?.fetchFn,
    }),
  };
}
