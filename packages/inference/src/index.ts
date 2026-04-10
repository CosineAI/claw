import { definePluginEntry, type ProviderAuthContext } from "openclaw/plugin-sdk/plugin-entry";
import { resolveOAuthApiKeyMarker } from "openclaw/plugin-sdk/provider-auth";
import { buildProviderReplayFamilyHooks } from "openclaw/plugin-sdk/provider-model-shared";
import { buildProviderStreamFamilyHooks } from "openclaw/plugin-sdk/provider-stream";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import {
  buildCosineRuntimeRequestHeaders,
  readCosineCliOAuthProfile,
  readCosineStore,
  refreshCosineOAuthCredential,
  resolveCosineProviderBaseUrl,
  runCosineOAuth,
} from "./auth.js";
import { buildCosineProvider } from "./models.js";
import {
  resolveCosineTransportTurnState,
  resolveCosineWebSocketSessionPolicy,
} from "./transport.js";

const PROVIDER_ID = "cosine";
const COSINE_STREAM_HOOKS = buildProviderStreamFamilyHooks("openai-responses-defaults");
const COSINE_REPLAY_HOOKS = buildProviderReplayFamilyHooks({ family: "openai-compatible" });

function resolveConfiguredCosineBaseUrl(config: {
  models?: {
    providers?: Record<string, { baseUrl?: string }>;
  };
}): string {
  const configured = normalizeOptionalString(config.models?.providers?.[PROVIDER_ID]?.baseUrl);
  return configured ?? resolveCosineProviderBaseUrl();
}

export default definePluginEntry({
  id: "cosine-inference",
  name: "Cosine Inference",
  description: "Cosine inference provider plugin for OpenClaw",
  register(api) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "Cosine",
      docsPath: "/providers/models",
      envVars: [
        "COSINE_API_BASE_URL",
        "COSINE_CHONKYLLM_BASE_URL",
        "COSINE_AUTH_TOKEN",
        "COSINE_AUTH_REFRESH_TOKEN",
        "COSINE_AUTH_EXPIRY",
        "COSINE_AUTH_USER_ID",
        "COSINE_AUTH_TEAM_ID",
        "COSINE_AUTH_TEAM_NAME",
        "COSINE_AUTH_TEAM_SLUG",
        "COSINE_PROJECT_ID",
        "COSINE_SUBAGENT_ID",
      ],
      auth: [
        {
          id: "oauth",
          label: "Cosine OAuth",
          hint: "Browser sign-in for Cosine inference",
          kind: "oauth",
          run: async (ctx: ProviderAuthContext) => await runCosineOAuth(ctx),
        },
      ],
      wizard: {
        setup: {
          choiceId: "cosine",
          choiceLabel: "Cosine OAuth",
          choiceHint: "Browser sign-in for Cosine inference",
          methodId: "oauth",
        },
      },
      catalog: {
        order: "profile",
        run: async (ctx) => {
          const auth = ctx.resolveProviderAuth(PROVIDER_ID, {
            oauthMarker: resolveOAuthApiKeyMarker(PROVIDER_ID),
          });
          if (!auth.apiKey && !auth.discoveryApiKey) {
            return null;
          }

          void readCosineCliOAuthProfile({
            env: ctx.env,
            store: readCosineStore(ctx.agentDir),
          });

          return {
            provider: {
              ...(await buildCosineProvider({
                baseUrl: resolveConfiguredCosineBaseUrl(ctx.config),
                bearerToken: auth.discoveryApiKey ?? auth.apiKey,
              })),
              apiKey: auth.apiKey,
            },
          };
        },
      },
      resolveExternalAuthProfiles: (ctx) => {
        const profile = readCosineCliOAuthProfile({
          env: ctx.env,
          store: ctx.store,
        });
        return profile ? [{ ...profile, persistence: "runtime-only" }] : undefined;
      },
      prepareRuntimeAuth: async (ctx) => ({
        apiKey: ctx.apiKey,
        request: {
          headers: buildCosineRuntimeRequestHeaders(ctx.env),
        },
      }),
      refreshOAuth: async (credential) => await refreshCosineOAuthCredential(credential),
      prepareExtraParams: (ctx) => {
        const transport = ctx.extraParams?.transport;
        if (transport === "auto" || transport === "sse" || transport === "websocket") {
          return ctx.extraParams;
        }
        return {
          ...ctx.extraParams,
          transport: "auto",
        };
      },
      resolveTransportTurnState: (ctx) => resolveCosineTransportTurnState(ctx),
      resolveWebSocketSessionPolicy: (ctx) => resolveCosineWebSocketSessionPolicy(ctx),
      resolveReasoningOutputMode: () => "native",
      isModernModelRef: () => true,
      ...COSINE_REPLAY_HOOKS,
      ...COSINE_STREAM_HOOKS,
    });
  },
});
