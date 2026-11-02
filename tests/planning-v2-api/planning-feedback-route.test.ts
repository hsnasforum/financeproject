import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as feedbackPOST } from "../../src/app/api/planning/v2/feedback/route";

const env = process.env as Record<string, string | undefined>;
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PLANNING_DATA_DIR: process.env.PLANNING_DATA_DIR,
  PLANNING_NAMESPACE_ENABLED: process.env.PLANNING_NAMESPACE_ENABLED,
  PLANNING_SINGLE_USER_MODE: process.env.PLANNING_SINGLE_USER_MODE,
  PLANNING_AUTH_REQUIRED: process.env.PLANNING_AUTH_REQUIRED,
  PLANNING_TRUST_AUTH_HEADERS: process.env.PLANNING_TRUST_AUTH_HEADERS,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
};

const HOST = "localhost:3000";
const ORIGIN = `http://${HOST}`;
const CSRF = "csrf-token";

function buildPostRequest(
  body: Record<string, unknown>,
  options: { userId?: string; origin?: string; csrfCookie?: string } = {},
): Request {
  const origin = options.origin ?? ORIGIN;
  return new Request(`${ORIGIN}/api/planning/v2/feedback`, {
    method: "POST",
    headers: {
      host: HOST,
      origin,
      referer: `${origin}/planning`,
      cookie: `dev_csrf=${encodeURIComponent(options.csrfCookie ?? CSRF)}`,
      "content-type": "application/json",
      ...(options.userId ? { "x-planning-user-id": options.userId } : {}),
    },
    body: JSON.stringify(body),
  });
}

function feedbackBody(title = "입력 필드 단위 개선", csrf = CSRF) {
  return {
    csrf,
    from: { screen: "/planning" },
    context: {
      snapshot: {
        id: "snapshot-1",
        asOf: "2026-08-24",
        fetchedAt: "2026-08-24T00:00:00.000Z",
        missing: false,
      },
      runId: "run-123",
      health: {
        criticalCount: 0,
        warningsCodes: ["WARN_A"],
      },
    },
    content: {
      category: "ux",
      title,
      message: "라벨 옆에 단위를 더 분명하게 표시해 주세요.",
    },
  };
}

describe("planning v2 feedback route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v2-feedback-route-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "true";
    env.PLANNING_SINGLE_USER_MODE = "false";
    env.PLANNING_AUTH_REQUIRED = "true";
    env.PLANNING_TRUST_AUTH_HEADERS = "true";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === "string") env[key] = value;
      else delete env[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("stores structured feedback inside the authenticated user's namespace", async () => {
    const aliceResponse = await feedbackPOST(buildPostRequest(feedbackBody(), { userId: "alice" }));
    const alicePayload = await aliceResponse.json() as {
      ok?: boolean;
      data?: { id?: string; context?: { runId?: string } };
      meta?: { userId?: string; authSource?: string };
    };
    const bobResponse = await feedbackPOST(buildPostRequest(feedbackBody("다른 사용자 피드백"), { userId: "bob" }));
    const bobPayload = await bobResponse.json() as { ok?: boolean; data?: { id?: string } };

    expect(aliceResponse.status).toBe(201);
    expect(alicePayload.ok).toBe(true);
    expect(alicePayload.data?.context?.runId).toBe("run-123");
    expect(alicePayload.meta).toMatchObject({ userId: "alice", authSource: "trusted-header" });
    expect(bobResponse.status).toBe(201);
    expect(bobPayload.ok).toBe(true);

    const aliceFile = path.join(root, "users", "alice", "ops", "feedback", "planning", `${alicePayload.data?.id}.json`);
    const bobFile = path.join(root, "users", "bob", "ops", "feedback", "planning", `${bobPayload.data?.id}.json`);
    expect(fs.existsSync(aliceFile)).toBe(true);
    expect(fs.existsSync(bobFile)).toBe(true);
    expect(fs.existsSync(path.join(root, "users", "alice", "ops", "feedback", "planning", `${bobPayload.data?.id}.json`))).toBe(false);
  });

  it("requires route authentication and rejects mismatched same-origin or csrf requests", async () => {
    const unauthenticated = await feedbackPOST(buildPostRequest(feedbackBody()));
    const wrongOrigin = await feedbackPOST(buildPostRequest(feedbackBody(), {
      userId: "alice",
      origin: "http://evil.example",
    }));
    const wrongCsrf = await feedbackPOST(buildPostRequest(feedbackBody("CSRF 불일치", "wrong-token"), {
      userId: "alice",
    }));

    expect(unauthenticated.status).toBe(401);
    expect(wrongOrigin.status).toBe(403);
    expect(wrongCsrf.status).toBe(403);
  });

  it("preserves the structured title and message validation contract", async () => {
    const response = await feedbackPOST(buildPostRequest(feedbackBody("한"), { userId: "alice" }));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      ok: false,
      error: {
        code: "INPUT",
        message: "title은 2~160자여야 합니다.",
      },
    });
  });
});
