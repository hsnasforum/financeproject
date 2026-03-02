import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as feedbackListGET, POST as feedbackPOST } from "../../../src/app/api/ops/feedback/planning/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalFeedbackDir = process.env.PLANNING_FEEDBACK_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;

const HOST = "localhost:3000";
const ORIGIN = `http://${HOST}`;
const CSRF = "csrf-token";

function buildPostRequest(body: unknown): Request {
  return new Request(`${ORIGIN}/api/ops/feedback/planning`, {
    method: "POST",
    headers: {
      host: HOST,
      origin: ORIGIN,
      referer: `${ORIGIN}/planning`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(CSRF)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function buildGetRequest(): Request {
  return new Request(`${ORIGIN}/api/ops/feedback/planning?csrf=${encodeURIComponent(CSRF)}`, {
    method: "GET",
    headers: {
      host: HOST,
      origin: ORIGIN,
      referer: `${ORIGIN}/ops/feedback/planning`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(CSRF)}`,
    },
  });
}

describe("planning feedback api", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-feedback-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_FEEDBACK_DIR = path.join(root, "feedback");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalFeedbackDir === "string") env.PLANNING_FEEDBACK_DIR = originalFeedbackDir;
    else delete env.PLANNING_FEEDBACK_DIR;

    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates feedback and lists it", async () => {
    const createRes = await feedbackPOST(buildPostRequest({
      csrf: CSRF,
      from: { screen: "/planning" },
      context: {
        snapshot: {
          id: "snapshot-1",
          asOf: "2026-02-28",
          fetchedAt: "2026-02-28T00:00:00.000Z",
          missing: false,
        },
        runId: "run-123",
        health: {
          criticalCount: 0,
          warningsCodes: ["WARN_A", "WARN_B"],
        },
      },
      content: {
        category: "ux",
        title: "입력 필드 단위가 눈에 잘 안 띕니다",
        message: "라벨 옆에 (원) 단위가 더 강조되면 좋겠습니다.",
      },
    }));

    const createPayload = (await createRes.json()) as {
      ok?: boolean;
      data?: { id?: string; content?: { category?: string } };
      message?: string;
    };

    expect(createRes.status).toBe(201);
    expect(createPayload.ok).toBe(true);
    expect(createPayload.data?.id).toBeTruthy();
    expect(createPayload.data?.content?.category).toBe("ux");

    const listRes = await feedbackListGET(buildGetRequest());
    const listPayload = (await listRes.json()) as {
      ok?: boolean;
      data?: Array<{ id?: string; from?: { screen?: string }; context?: { runId?: string } }>;
    };

    expect(listRes.status).toBe(200);
    expect(listPayload.ok).toBe(true);
    expect(Array.isArray(listPayload.data)).toBe(true);
    expect(listPayload.data?.some((row) => row.id === createPayload.data?.id)).toBe(true);

    const created = listPayload.data?.find((row) => row.id === createPayload.data?.id);
    expect(created?.from?.screen).toBe("/planning");
    expect(created?.context?.runId).toBe("run-123");
  });
});
