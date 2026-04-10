#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packageDir = path.join(repoRoot, "packages", "inference");

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/release-inference.mjs [--dry-run] [--tag <dist-tag>] [--skip-checks]",
      "",
      "Options:",
      "  --dry-run       Run npm publish with --dry-run",
      "  --tag <tag>     npm dist-tag to publish under (default: latest)",
      "  --skip-checks   Skip build/test preflight",
      "  --help          Show this help",
      "",
      "Examples:",
      "  pnpm release:inference:dry-run",
      "  pnpm release:inference",
      "  pnpm release:inference -- --tag beta",
    ].join("\n"),
  );
}

const args = process.argv.slice(2);
let dryRun = false;
let skipChecks = false;
let tag = "latest";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--help" || arg === "-h") {
    printUsage();
    process.exit(0);
  }
  if (arg === "--dry-run") {
    dryRun = true;
    continue;
  }
  if (arg === "--skip-checks") {
    skipChecks = true;
    continue;
  }
  if (arg === "--tag") {
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      fail("Missing value for --tag");
    }
    tag = next;
    index += 1;
    continue;
  }
  fail(`Unknown argument: ${arg}`);
}

if (!existsSync(path.join(packageDir, "package.json"))) {
  fail(`Package directory not found: ${packageDir}`);
}

if (!skipChecks) {
  console.log("Running inference package checks...");
  run("pnpm", ["--filter", "@cosineai/claw-inference", "build"]);
  run("pnpm", ["--filter", "@cosineai/claw-inference", "test"]);
}

const publishArgs = ["publish", "--tag", tag];
if (dryRun) {
  publishArgs.push("--dry-run");
}

console.log(
  [
    `Publishing @cosineai/claw-inference from ${packageDir}`,
    `npm tag: ${tag}`,
    dryRun ? "mode: dry-run" : "mode: publish",
  ].join("\n"),
);

run("npm", publishArgs, { cwd: packageDir });
