#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REMOTE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const COPIED_SOURCE_INPUTS = [
  "src",
  "scripts",
  "public",
  "prisma/schema.prisma",
  "prisma/migrations",
];

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeCommandMessage(result) {
  return asString(result.stderr || result.stdout)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}

function runGit(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function requireGitSuccess(cwd, args, label) {
  const result = runGit(cwd, args);
  if (result.status !== 0) {
    const detail = safeCommandMessage(result);
    throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
  }
  return asString(result.stdout);
}

function readPackageVersion(cwd) {
  const packageJsonPath = path.join(cwd, "package.json");
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch {
    throw new Error("release package.json is missing or invalid");
  }
  const version = asString(parsed?.version);
  if (!SEMVER_PATTERN.test(version)) throw new Error("release package version is not valid semver");
  return version;
}

function resolveRemoteTagSha(cwd, remote, tag) {
  const exactRef = `refs/tags/${tag}`;
  const peeledRef = `${exactRef}^{}`;
  const result = runGit(cwd, ["ls-remote", remote, exactRef, peeledRef]);
  if (result.status !== 0) {
    const detail = safeCommandMessage(result);
    throw new Error(`release remote tag lookup failed${detail ? `: ${detail}` : ""}`);
  }
  const rows = asString(result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((row) => row.length === 2);
  const peeled = rows.find((row) => row[1] === peeledRef)?.[0];
  const exact = rows.find((row) => row[1] === exactRef)?.[0];
  const resolved = asString(peeled || exact).toLowerCase();
  if (!FULL_SHA_PATTERN.test(resolved)) throw new Error("release remote tag is missing or invalid");
  return resolved;
}

/**
 * @param {{
 *   cwd?: string;
 *   sourceSha: string;
 *   tag: string;
 *   defaultBranch: string;
 *   remote?: string;
 *   requireClean?: boolean;
 *   verifyRemoteTag?: boolean;
 * }} options
 */
export function verifyReleaseTagContext(options) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const sourceSha = asString(options.sourceSha).toLowerCase();
  const tag = asString(options.tag);
  const defaultBranch = asString(options.defaultBranch);
  const remote = asString(options.remote) || "origin";

  if (!FULL_SHA_PATTERN.test(sourceSha)) {
    throw new Error("release source SHA must be a full commit SHA");
  }
  if (!tag.startsWith("v")) {
    throw new Error("release tag must start with v");
  }
  if (!REMOTE_NAME_PATTERN.test(remote)) {
    throw new Error("release remote name is invalid");
  }

  requireGitSuccess(cwd, ["check-ref-format", "refs/tags/" + tag], "release tag validation");
  requireGitSuccess(cwd, ["check-ref-format", "--branch", defaultBranch], "release branch validation");

  const packageVersion = readPackageVersion(cwd);
  if (tag !== `v${packageVersion}`) {
    throw new Error(`release tag/version mismatch: tag=${tag} package=${packageVersion}`);
  }

  const headSha = requireGitSuccess(cwd, ["rev-parse", "HEAD^{commit}"], "release HEAD lookup").toLowerCase();
  if (headSha !== sourceSha) {
    throw new Error(`release checkout SHA mismatch: head=${headSha} expected=${sourceSha}`);
  }

  const tagSha = requireGitSuccess(
    cwd,
    ["rev-parse", `refs/tags/${tag}^{commit}`],
    "release tag commit lookup",
  ).toLowerCase();
  if (tagSha !== sourceSha) {
    throw new Error(`release tag target mismatch: tag=${tagSha} expected=${sourceSha}`);
  }

  const allowedRef = `refs/remotes/${remote}/${defaultBranch}`;
  const allowedSha = requireGitSuccess(
    cwd,
    ["rev-parse", `${allowedRef}^{commit}`],
    "release allowed branch lookup",
  ).toLowerCase();
  const ancestor = runGit(cwd, ["merge-base", "--is-ancestor", sourceSha, allowedRef]);
  if (ancestor.status === 1) {
    throw new Error(`release tag commit is outside ${remote}/${defaultBranch}`);
  }
  if (ancestor.status !== 0) {
    const detail = safeCommandMessage(ancestor);
    throw new Error(`release ancestry check failed${detail ? `: ${detail}` : ""}`);
  }

  if (options.requireClean !== false) {
    const worktreeStatus = requireGitSuccess(
      cwd,
      ["status", "--porcelain=v1", "--untracked-files=all"],
      "release worktree status",
    );
    if (worktreeStatus) {
      throw new Error("release worktree contains tracked or unignored changes");
    }
    const ignoredCopiedInputs = requireGitSuccess(
      cwd,
      [
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "--",
        ...COPIED_SOURCE_INPUTS,
      ],
      "release ignored input inventory",
    );
    if (ignoredCopiedInputs) {
      throw new Error("release copied source roots contain ignored untracked files");
    }
  }

  if (options.verifyRemoteTag === true) {
    const remoteTagSha = resolveRemoteTagSha(cwd, remote, tag);
    if (remoteTagSha !== sourceSha) {
      throw new Error(`release remote tag target mismatch: tag=${remoteTagSha} expected=${sourceSha}`);
    }
  }

  return {
    ok: true,
    sourceSha,
    tag,
    packageVersion,
    defaultBranch,
    allowedSha,
  };
}

function parseArgs(argv) {
  const options = {
    sourceSha: process.env.GITHUB_SHA ?? "",
    tag: process.env.GITHUB_REF_NAME ?? "",
    defaultBranch: process.env.DEFAULT_BRANCH ?? "",
    remote: "origin",
    requireClean: true,
    verifyRemoteTag: false,
  };
  for (const token of argv) {
    if (!token.startsWith("--") || !token.includes("=")) {
      throw new Error(`unknown release tag guard option: ${token}`);
    }
    const [rawKey, ...rest] = token.slice(2).split("=");
    const value = rest.join("=");
    if (rawKey === "sha") options.sourceSha = value;
    else if (rawKey === "tag") options.tag = value;
    else if (rawKey === "default-branch") options.defaultBranch = value;
    else if (rawKey === "remote") options.remote = value;
    else if (rawKey === "require-clean") options.requireClean = value !== "false";
    else if (rawKey === "verify-remote-tag") options.verifyRemoteTag = value === "true";
    else throw new Error(`unknown release tag guard option: ${token}`);
  }
  return options;
}

function main() {
  const result = verifyReleaseTagContext(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[release:tag:guard] ${message}\n`);
    process.exitCode = 1;
  }
}
