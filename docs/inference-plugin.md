# Cosine inference plugin

This document explains how to install and use the Cosine inference plugin for
OpenClaw.

Package:

- `@cosineai/claw-inference`

Provider id:

- `cosine`

Production endpoints:

- inference: `https://api.cosine.sh/responses`
- models: `https://api.cosine.sh/models`

## What the plugin does

The plugin adds a `cosine` inference provider to OpenClaw.

It is intended for:

- Cosine OAuth login
- model discovery from the production `/models` endpoint
- inference against the production `/responses` endpoint
- attaching the required request metadata header:
  - `cosine-origin: openclaw`

The plugin does not send `cosine-team-id`. Team identity is expected to be
embedded in the token.

## Requirements

- OpenClaw `2026.4.9` or newer
- Node 22+
- a valid Cosine account with access to the inference API

## Install

Install the plugin into OpenClaw:

```bash
openclaw plugins install @cosineai/claw-inference
```

After install, OpenClaw should be able to discover the `cosine` provider.

## Authenticate

The plugin uses Cosine OAuth.

In normal interactive flows, OpenClaw should surface the provider during setup
or auth selection. Depending on the OpenClaw flow you are using, common entry
points are:

```bash
openclaw configure
```

or the provider auth login flow:

```bash
openclaw models auth login --provider cosine
```

The plugin opens the Cosine browser login flow against `https://api.cosine.sh`
and stores the resulting session token for runtime use.

## Selecting the provider

Once installed and authenticated, use the provider/model ref:

```text
cosine/gpt-5.4
```

The plugin currently defaults to:

- provider: `cosine`
- default model: `gpt-5.4`

## Model discovery

The plugin discovers models from:

```text
https://api.cosine.sh/models
```

The endpoint is expected to return the standard OpenAI-style models list shape:

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-5.4",
      "object": "model",
      "owned_by": "cosine"
    }
  ]
}
```

If discovery fails, the plugin falls back to a minimal static catalog with
`gpt-5.4`.

## Inference requests

Inference uses the OpenAI Responses-compatible transport against:

```text
https://api.cosine.sh/responses
```

The plugin sets:

- `cosine-origin: openclaw`

It may also set optional request metadata when configured:

- `cosine-project-id`
- `cosine-subagent-id`
- `cosine-session-id`

## Environment variables

### Base URL overrides

- `COSINE_API_BASE_URL`
  - overrides the login/refresh API base URL
- `COSINE_CHONKYLLM_BASE_URL`
  - overrides the provider base URL used for inference/model discovery
  - despite the older name, this now defaults to `https://api.cosine.sh`

### Auth-related environment variables

These can be used when the token is already available in the environment:

- `COSINE_AUTH_TOKEN`
- `COSINE_AUTH_REFRESH_TOKEN`
- `COSINE_AUTH_EXPIRY`
- `COSINE_AUTH_USER_ID`
- `COSINE_AUTH_TEAM_ID`
- `COSINE_AUTH_TEAM_NAME`
- `COSINE_AUTH_TEAM_SLUG`

### Optional request metadata

- `COSINE_PROJECT_ID`
- `COSINE_SUBAGENT_ID`

## Troubleshooting

### The provider does not appear

Check:

- the plugin installed successfully
- your OpenClaw version is at least `2026.4.9`
- the package is visible in your OpenClaw plugin list

### Login succeeds but inference fails

Check:

- the token is valid for the Cosine production API
- `COSINE_API_BASE_URL` is not pointing at the wrong environment
- `COSINE_CHONKYLLM_BASE_URL` is not overriding the provider to a stale host

### Model list is empty

The plugin falls back to `gpt-5.4` if `/models` fails. If you expected more
models, verify the production API is returning them from `/models`.

## Development

From the `claw` repo root:

```bash
pnpm install
pnpm build
pnpm test
```

For the inference package only:

```bash
pnpm --filter @cosineai/claw-inference build
pnpm --filter @cosineai/claw-inference test
```
