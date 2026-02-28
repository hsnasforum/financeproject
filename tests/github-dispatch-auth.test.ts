import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as githubDispatchPost } from "../src/app/api/dev/github/dispatch/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalToken = process.env.GITHUB_TOKEN_DISPATCH;
const originalOwner = process.env.GITHUB_REPO_OWNER;
const originalRepo = process.env.GITHUB_REPO_NAME;
const originalFetch = globalThis.fetch;

function buildRequest(body: Record<string, unknown>, withAuth = true): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  const headers = new Headers({
    host,
    origin,
    referer: `${origin}/ops/rules`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${origin}/api/dev/github/dispatch`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("github dispatch api auth/config", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.GITHUB_TOKEN_DISPATCH = "token";
    env.GITHUB_REPO_OWNER = "owner";
    env.GITHUB_REPO_NAME = "repo";
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalToken === "string") env.GITHUB_TOKEN_DISPATCH = originalToken;
    else delete env.GITHUB_TOKEN_DISPATCH;
    if (typeof originalOwner === "string") env.GITHUB_REPO_OWNER = originalOwner;
    else delete env.GITHUB_REPO_OWNER;
    if (typeof originalRepo === "string") env.GITHUB_REPO_NAME = originalRepo;
    else delete env.GITHUB_REPO_NAME;
    globalThis.fetch = originalFetch;
  });

  it("returns CONFIG when required env is missing", async () => {
    delete env.GITHUB_TOKEN_DISPATCH;
    const response = await githubDispatchPost(buildRequest({
      workflow: "rules-tune-pr.yml",
      ref: "main",
      csrf: "csrf-token",
    }));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("CONFIG");
  });

  it("returns 403 without dev guard context", async () => {
    const response = await githubDispatchPost(buildRequest({
      workflow: "rules-tune-pr.yml",
      ref: "main",
      csrf: "csrf-token",
    }, false));
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHORIZED");
  });
});
