import { beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import { buildCosineRuntimeRequestHeaders, COSINE_ORIGIN_HEADER } from "./auth.js";
import { resolveCosineTransportTurnState } from "./transport.js";

const buildCosineProviderMock = vi.hoisted(() =>
  vi.fn(async () => ({
    baseUrl: "https://api.cosine.sh",
    api: "openai-responses",
    auth: "oauth",
    authHeader: true,
    models: [
      {
        id: "gpt-5.4",
        name: "gpt-5.4",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 32768,
      },
    ],
  })),
);

vi.mock("./models.js", () => ({
  buildCosineProvider: buildCosineProviderMock,
}));

function createPluginApi(registerProvider: (provider: unknown) => void) {
  return {
    pluginConfig: {},
    registerProvider,
  } as Parameters<typeof plugin.register>[0];
}

function registerProviderPlugin() {
  const registerProvider = vi.fn();
  plugin.register(createPluginApi(registerProvider));
  expect(registerProvider).toHaveBeenCalledTimes(1);
  return registerProvider.mock.calls[0]?.[0];
}

describe("cosine inference plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COSINE_PROJECT_ID;
    delete process.env.COSINE_SUBAGENT_ID;
  });

  it("builds the provider against the production API base", async () => {
    const provider = registerProviderPlugin();
    const result = await provider.catalog.run({
      config: {
        models: {
          providers: {
            cosine: {
              baseUrl: "https://api.cosine.sh",
            },
          },
        },
      },
      env: {},
      agentDir: "/tmp/agent",
      resolveProviderAuth: () => ({
        apiKey: "oauth-marker",
        discoveryApiKey: "session-cookie",
        mode: "oauth",
        source: "profile",
      }),
    } as never);

    expect(buildCosineProviderMock).toHaveBeenCalledWith({
      baseUrl: "https://api.cosine.sh",
      bearerToken: "session-cookie",
    });
    expect(result).toMatchObject({
      provider: {
        api: "openai-responses",
        auth: "oauth",
        authHeader: true,
        apiKey: "oauth-marker",
      },
    });
  });

  it("adds origin and session metadata without team headers", () => {
    process.env.COSINE_PROJECT_ID = "proj-1";
    process.env.COSINE_SUBAGENT_ID = "sub-2";

    const headers = buildCosineRuntimeRequestHeaders(process.env);
    expect(headers).toEqual({
      "cosine-origin": COSINE_ORIGIN_HEADER,
      "cosine-project-id": "proj-1",
      "cosine-subagent-id": "sub-2",
    });

    expect(
      resolveCosineTransportTurnState({
        provider: "cosine",
        modelId: "gpt-5.4",
        sessionId: "session-abc",
        turnId: "turn-1",
        attempt: 2,
        transport: "stream",
      }),
    ).toMatchObject({
      headers: {
        "cosine-session-id": "session-abc",
      },
      metadata: {
        origin: "openclaw",
        openclaw_session_id: "session-abc",
        openclaw_turn_id: "turn-1",
        openclaw_turn_attempt: "2",
      },
    });
  });
});
