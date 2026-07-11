#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SEMVER_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeApiBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(asString(value));
  } catch {
    throw new Error("release API URL is invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("release API URL must be an HTTPS base URL");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
}

/**
 * @param {{
 *   repository: string;
 *   tag: string;
 *   token: string;
 *   apiUrl?: string;
 *   fetchImpl?: typeof fetch;
 * }} options
 */
export async function assertReleaseDoesNotExist(options) {
  const repository = asString(options.repository);
  const tag = asString(options.tag);
  const token = asString(options.token);
  if (!REPOSITORY_PATTERN.test(repository)) throw new Error("release repository is invalid");
  if (!SEMVER_TAG_PATTERN.test(tag)) throw new Error("release tag is invalid");
  if (!token) throw new Error("release API token is missing");
  const apiBaseUrl = normalizeApiBaseUrl(options.apiUrl ?? "https://api.github.com");
  const fetchImpl = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await fetchImpl(
      `${apiBaseUrl}/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Error("release existence lookup failed");
  }
  if (response.status === 404) return { ok: true, exists: false };
  if (response.status === 200) {
    throw new Error(`GitHub Release already exists for ${tag}; automatic overwrite is blocked`);
  }
  throw new Error(`release existence lookup failed with status ${response.status}`);
}

async function main() {
  const result = await assertReleaseDoesNotExist({
    repository: process.env.GITHUB_REPOSITORY ?? "",
    tag: process.env.GITHUB_REF_NAME ?? "",
    token: process.env.GITHUB_TOKEN ?? "",
    apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
  });
  process.stdout.write(`[release:existing:guard] tag is available exists=${result.exists}\n`);
}

const invokedPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[release:existing:guard] ${message}\n`);
    process.exitCode = 1;
  });
}
