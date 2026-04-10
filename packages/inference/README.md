# @cosineai/claw-inference

Cosine inference provider plugin for OpenClaw.

Full usage guide:

- `../../docs/inference-plugin.md`

## Install

```bash
openclaw plugins install @cosineai/claw-inference
```

## What it provides

- provider id: `cosine`
- production inference endpoint: `https://api.cosine.sh/responses`
- production model discovery endpoint: `https://api.cosine.sh/models`
- `cosine-origin: openclaw`

## Environment overrides

- `COSINE_API_BASE_URL` — override the Cosine API base URL
- `COSINE_CHONKYLLM_BASE_URL` — override the provider base URL used by OpenClaw
- `COSINE_PROJECT_ID` — optional request metadata
- `COSINE_SUBAGENT_ID` — optional request metadata
