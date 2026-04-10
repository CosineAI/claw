import type {
  ProviderResolveTransportTurnStateContext,
  ProviderResolveWebSocketSessionPolicyContext,
  ProviderTransportTurnState,
  ProviderWebSocketSessionPolicy,
} from "openclaw/plugin-sdk/plugin-entry";

function normalizeIdentityValue(value: string, maxLength = 160): string {
  const trimmed = value.trim().replace(/[\r\n]+/g, " ");
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function resolveCosineTransportTurnState(
  ctx: ProviderResolveTransportTurnStateContext,
): ProviderTransportTurnState | undefined {
  const sessionId = ctx.sessionId ? normalizeIdentityValue(ctx.sessionId) : "";
  if (!sessionId) {
    return undefined;
  }

  const turnId = normalizeIdentityValue(ctx.turnId);
  const attempt = String(Math.max(1, ctx.attempt));

  return {
    headers: {
      "cosine-session-id": sessionId,
    },
    metadata: {
      origin: "openclaw",
      openclaw_session_id: sessionId,
      openclaw_turn_id: turnId,
      openclaw_turn_attempt: attempt,
      openclaw_transport: ctx.transport,
    },
  };
}

export function resolveCosineWebSocketSessionPolicy(
  ctx: ProviderResolveWebSocketSessionPolicyContext,
): ProviderWebSocketSessionPolicy | undefined {
  const sessionId = ctx.sessionId ? normalizeIdentityValue(ctx.sessionId) : "";
  if (!sessionId) {
    return undefined;
  }

  return {
    headers: {
      "cosine-session-id": sessionId,
    },
  };
}
