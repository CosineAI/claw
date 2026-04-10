# claw

Cosine first-party OpenClaw extensions monorepo.

This repository is intended to publish external OpenClaw plugins under the
`@cosineai/*` npm scope, starting with `@cosineai/claw-inference`.

## Packages

- `packages/inference` — Cosine inference provider plugin for OpenClaw

Docs:

- `docs/inference-plugin.md` — how to install, authenticate, and use the plugin

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## Publishing

The repository includes:

- CI for install, build, and test
- a local helper script for manual npm releases

Users install the published plugin with:

```bash
openclaw plugins install @cosineai/claw-inference
```

Manual release helpers:

```bash
pnpm release:inference:dry-run
pnpm release:inference
pnpm release:inference -- --tag beta
```
