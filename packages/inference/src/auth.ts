import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import type {
  AuthProfileStore,
  OAuthCredential,
  ProviderAuthContext,
  ProviderAuthResult,
} from "openclaw/plugin-sdk/provider-auth";
import {
  buildOauthProviderAuthResult,
  ensureAuthProfileStore,
  resolveRequiredHomeDir,
} from "openclaw/plugin-sdk/provider-auth";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";

const PROVIDER_ID = "cosine";
export const COSINE_API_BASE_URL = "https://api.cosine.sh";
export const COSINE_PROVIDER_BASE_URL = "https://api.cosine.sh";
export const COSINE_DEFAULT_MODEL_ID = "gpt-5.4";
export const COSINE_DEFAULT_MODEL_REF = `${PROVIDER_ID}/${COSINE_DEFAULT_MODEL_ID}`;
export const COSINE_ORIGIN_HEADER = "openclaw";
export const COSINE_DEFAULT_PROFILE_ID = `${PROVIDER_ID}:default`;
const COSINE_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

type CosineTokenFile = {
  token?: unknown;
  refresh_token?: unknown;
  expiry?: unknown;
  user_id?: unknown;
  team_id?: unknown;
  team_name?: unknown;
  team_slug?: unknown;
};

type CosineLoginRequestResponse = {
  login_request_id?: unknown;
  login_secret?: unknown;
};

type CosineLoginEventEnvelope = {
  event?: unknown;
  data?: {
    token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    user_id?: unknown;
    team_id?: unknown;
    team_name?: unknown;
    team_slug?: unknown;
  };
};

type CosineRefreshResponse = {
  token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

function trimNonEmptyString(value: unknown): string | undefined {
  return normalizeOptionalString(typeof value === "string" ? value : undefined) ?? undefined;
}

function readOAuthCredentialField(
  credential: OAuthCredential | undefined,
  key: string,
): string | undefined {
  if (!credential || typeof credential !== "object") {
    return undefined;
  }
  return trimNonEmptyString((credential as Record<string, unknown>)[key]);
}

function writeOAuthCredentialField(
  target: OAuthCredential,
  key: string,
  value: string | undefined,
) {
  if (!value) {
    return;
  }
  (target as Record<string, unknown>)[key] = value;
}

function resolveExpiryEpochSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.floor(parsed / 1000);
}

export function resolveCosineApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return trimNonEmptyString(env.COSINE_API_BASE_URL) ?? COSINE_API_BASE_URL;
}

export function resolveCosineProviderBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return trimNonEmptyString(env.COSINE_CHONKYLLM_BASE_URL) ?? COSINE_PROVIDER_BASE_URL;
}

function resolveCosineHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = trimNonEmptyString(env.COSINE_HOME);
  if (!configured) {
    return path.join(resolveRequiredHomeDir(), ".cosine");
  }
  if (configured === "~") {
    return resolveRequiredHomeDir();
  }
  if (configured.startsWith("~/")) {
    return path.join(resolveRequiredHomeDir(), configured.slice(2));
  }
  return path.resolve(configured);
}

function readCosineTokenFile(env: NodeJS.ProcessEnv = process.env): CosineTokenFile | null {
  try {
    const authPath = path.join(resolveCosineHome(env), "auth.json");
    const raw = fs.readFileSync(authPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CosineTokenFile) : null;
  } catch {
    return null;
  }
}

function buildCosineCredential(params: {
  access: string;
  refresh: string;
  expires?: number;
  userId?: string;
  teamId?: string;
  teamName?: string;
  teamSlug?: string;
  apiBaseUrl?: string;
}): OAuthCredential {
  const credential: OAuthCredential = {
    type: "oauth",
    provider: PROVIDER_ID,
    access: params.access,
    refresh: params.refresh,
    expires: params.expires ?? 0,
  };
  writeOAuthCredentialField(credential, "userId", params.userId);
  writeOAuthCredentialField(credential, "teamId", params.teamId);
  writeOAuthCredentialField(credential, "teamName", params.teamName);
  writeOAuthCredentialField(credential, "teamSlug", params.teamSlug);
  writeOAuthCredentialField(credential, "apiBaseUrl", params.apiBaseUrl);
  return credential;
}

function oauthCredentialMatches(a: OAuthCredential, b: OAuthCredential): boolean {
  return (
    a.type === b.type &&
    a.provider === b.provider &&
    a.access === b.access &&
    a.refresh === b.refresh &&
    a.expires === b.expires &&
    readOAuthCredentialField(a, "userId") === readOAuthCredentialField(b, "userId") &&
    readOAuthCredentialField(a, "teamId") === readOAuthCredentialField(b, "teamId") &&
    readOAuthCredentialField(a, "teamName") === readOAuthCredentialField(b, "teamName") &&
    readOAuthCredentialField(a, "teamSlug") === readOAuthCredentialField(b, "teamSlug") &&
    readOAuthCredentialField(a, "apiBaseUrl") === readOAuthCredentialField(b, "apiBaseUrl")
  );
}

function loadCosineEnvTokens(env: NodeJS.ProcessEnv = process.env) {
  const access = trimNonEmptyString(env.COSINE_AUTH_TOKEN);
  if (!access) {
    return null;
  }
  return {
    access,
    refresh: trimNonEmptyString(env.COSINE_AUTH_REFRESH_TOKEN),
    expires: resolveExpiryEpochSeconds(env.COSINE_AUTH_EXPIRY),
    userId: trimNonEmptyString(env.COSINE_AUTH_USER_ID),
    teamId: trimNonEmptyString(env.COSINE_AUTH_TEAM_ID),
    teamName: trimNonEmptyString(env.COSINE_AUTH_TEAM_NAME),
    teamSlug: trimNonEmptyString(env.COSINE_AUTH_TEAM_SLUG),
  };
}

export function readCosineCliOAuthProfile(params: {
  env?: NodeJS.ProcessEnv;
  store: AuthProfileStore;
}): { profileId: string; credential: OAuthCredential } | null {
  const env = params.env ?? process.env;
  const envTokens = loadCosineEnvTokens(env);
  const fileTokens = readCosineTokenFile(env);
  const access = envTokens?.access ?? trimNonEmptyString(fileTokens?.token);
  const refresh = envTokens?.refresh ?? trimNonEmptyString(fileTokens?.refresh_token);
  if (!access || !refresh) {
    return null;
  }

  const credential = buildCosineCredential({
    access,
    refresh,
    expires: envTokens?.expires ?? resolveExpiryEpochSeconds(fileTokens?.expiry),
    userId: envTokens?.userId ?? trimNonEmptyString(fileTokens?.user_id),
    teamId: envTokens?.teamId ?? trimNonEmptyString(fileTokens?.team_id),
    teamName: envTokens?.teamName ?? trimNonEmptyString(fileTokens?.team_name),
    teamSlug: envTokens?.teamSlug ?? trimNonEmptyString(fileTokens?.team_slug),
    apiBaseUrl: resolveCosineApiBaseUrl(env),
  });

  const existing = params.store.profiles[COSINE_DEFAULT_PROFILE_ID];
  if (existing && (existing.type !== "oauth" || !oauthCredentialMatches(existing, credential))) {
    return null;
  }

  return {
    profileId: COSINE_DEFAULT_PROFILE_ID,
    credential,
  };
}

function resolveRequestMetadata(env: NodeJS.ProcessEnv = process.env) {
  return {
    projectId: trimNonEmptyString(env.COSINE_PROJECT_ID),
    subagentId: trimNonEmptyString(env.COSINE_SUBAGENT_ID),
  };
}

function resolveLoginWebSocketUrl(apiBaseUrl: string, requestId: string, secret: string): string {
  const url = new URL("/cli-login", apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("login_request_id", requestId);
  url.searchParams.set("login_secret", secret);
  return url.toString();
}

async function createCosineLoginRequest(apiBaseUrl: string) {
  const response = await fetch(new URL("/cli/login/request", apiBaseUrl), {
    method: "POST",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Cosine login request failed: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as CosineLoginRequestResponse;
  const requestId = trimNonEmptyString(payload.login_request_id);
  const secret = trimNonEmptyString(payload.login_secret);
  if (!requestId || !secret) {
    throw new Error("Cosine login response missing request credentials");
  }
  return { requestId, secret };
}

async function waitForCosineLogin(params: {
  apiBaseUrl: string;
  requestId: string;
  secret: string;
}): Promise<{
  access: string;
  refresh?: string;
  expires?: number;
  userId?: string;
  teamId?: string;
  teamName?: string;
  teamSlug?: string;
}> {
  const wsUrl = resolveLoginWebSocketUrl(params.apiBaseUrl, params.requestId, params.secret);
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      ws.terminate();
      reject(new Error("Timed out waiting for Cosine OAuth login"));
    }, COSINE_LOGIN_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeAllListeners();
      try {
        ws.close();
      } catch {
        // Best-effort close.
      }
    };

    ws.on("message", (raw: WebSocket.RawData) => {
      let envelope: CosineLoginEventEnvelope;
      try {
        envelope = JSON.parse(String(raw)) as CosineLoginEventEnvelope;
      } catch {
        return;
      }
      if (envelope.event !== "authenticated") {
        return;
      }
      const access = trimNonEmptyString(envelope.data?.token);
      if (!access) {
        settled = true;
        cleanup();
        reject(new Error("Cosine OAuth completed without a session token"));
        return;
      }
      const expiresIn =
        typeof envelope.data?.expires_in === "number" && Number.isFinite(envelope.data.expires_in)
          ? envelope.data.expires_in
          : 0;
      settled = true;
      cleanup();
      resolve({
        access,
        refresh: trimNonEmptyString(envelope.data?.refresh_token),
        expires: expiresIn > 0 ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
        userId: trimNonEmptyString(envelope.data?.user_id),
        teamId: trimNonEmptyString(envelope.data?.team_id),
        teamName: trimNonEmptyString(envelope.data?.team_name),
        teamSlug: trimNonEmptyString(envelope.data?.team_slug),
      });
    });

    ws.on("error", (error: Error) => {
      settled = true;
      cleanup();
      reject(error);
    });

    ws.on("close", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Cosine OAuth WebSocket closed before authentication completed"));
        return;
      }
      cleanup();
    });
  });
}

export async function runCosineOAuth(ctx: ProviderAuthContext): Promise<ProviderAuthResult> {
  const apiBaseUrl = resolveCosineApiBaseUrl(ctx.env);

  await ctx.prompter.note(
    [
      "This signs in with your Cosine account and stores the session token OpenClaw needs for inference.",
      ctx.isRemote
        ? "Open the login URL in your local browser. OpenClaw will keep waiting for the authenticated WebSocket event."
        : "A browser window will open for the Cosine login flow.",
    ].join("\n"),
    "Cosine OAuth",
  );

  const progress = ctx.prompter.progress("Starting Cosine OAuth…");

  try {
    const { requestId, secret } = await createCosineLoginRequest(apiBaseUrl);
    const loginUrl = new URL("/cli/login", apiBaseUrl);
    loginUrl.searchParams.set("login_request_id", requestId);
    loginUrl.searchParams.set("login_secret", secret);

    progress.update("Waiting for browser sign-in…");
    try {
      await ctx.openUrl(loginUrl.toString());
    } catch {
      ctx.runtime.log(`Open this URL in your browser:\n\n${loginUrl}\n`);
    }

    const session = await waitForCosineLogin({
      apiBaseUrl,
      requestId,
      secret,
    });
    progress.stop("Cosine OAuth complete");

    return buildOauthProviderAuthResult({
      providerId: PROVIDER_ID,
      defaultModel: COSINE_DEFAULT_MODEL_REF,
      access: session.access,
      refresh: session.refresh,
      expires: session.expires,
      profileName: session.teamSlug ?? session.teamId ?? session.userId,
      credentialExtra: {
        ...(session.userId ? { userId: session.userId } : {}),
        ...(session.teamId ? { teamId: session.teamId } : {}),
        ...(session.teamName ? { teamName: session.teamName } : {}),
        ...(session.teamSlug ? { teamSlug: session.teamSlug } : {}),
        apiBaseUrl,
      },
      configPatch: {
        models: {
          providers: {
            [PROVIDER_ID]: {
              baseUrl: resolveCosineProviderBaseUrl(ctx.env),
              api: "openai-responses" as const,
              auth: "oauth" as const,
              authHeader: true,
              models: [],
            },
          },
        },
      },
      notes: [
        `Cosine API base URL: ${apiBaseUrl}`,
        `Cosine inference base URL: ${resolveCosineProviderBaseUrl(ctx.env)}`,
      ],
    });
  } catch (error) {
    progress.stop("Cosine OAuth failed");
    throw error;
  }
}

export async function refreshCosineOAuthCredential(
  credential: OAuthCredential,
): Promise<OAuthCredential> {
  const refreshToken = trimNonEmptyString(credential.refresh);
  if (!refreshToken) {
    throw new Error("Cosine OAuth credential is missing refresh_token");
  }

  const apiBaseUrl = readOAuthCredentialField(credential, "apiBaseUrl") ?? resolveCosineApiBaseUrl();
  const response = await fetch(new URL("/auth/cli-refresh", apiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    throw new Error(`Cosine token refresh failed: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as CosineRefreshResponse;
  const access = trimNonEmptyString(payload.token);
  if (!access) {
    throw new Error("Cosine token refresh did not return a session token");
  }
  const expiresIn =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 0;

  const refreshed: OAuthCredential = {
    ...credential,
    access,
    refresh: trimNonEmptyString(payload.refresh_token) ?? refreshToken,
    ...(expiresIn > 0 ? { expires: Math.floor(Date.now() / 1000) + expiresIn } : {}),
  };
  writeOAuthCredentialField(refreshed, "apiBaseUrl", apiBaseUrl);
  return refreshed;
}

export function buildCosineRuntimeRequestHeaders(env: NodeJS.ProcessEnv = process.env) {
  const metadata = resolveRequestMetadata(env);
  return {
    "cosine-origin": COSINE_ORIGIN_HEADER,
    ...(metadata.projectId ? { "cosine-project-id": metadata.projectId } : {}),
    ...(metadata.subagentId ? { "cosine-subagent-id": metadata.subagentId } : {}),
  };
}

export function readCosineStore(agentDir?: string) {
  return ensureAuthProfileStore(agentDir, {
    allowKeychainPrompt: false,
  });
}
