import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PATCH as feedbackPatch } from "../src/app/api/feedback/[id]/route";
import { POST as feedbackPost } from "../src/app/api/feedback/route";
import { addFeedback, getFeedbackById, listRecent } from "../src/lib/feedback/feedbackStore";

const TEST_STORE_PATH = path.join(process.cwd(), "tmp", "feedback-route-guards.test.json");
const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

let previousStorePath: string | undefined;

function cleanup() {
  if (fs.existsSync(TEST_STORE_PATH)) {
    fs.unlinkSync(TEST_STORE_PATH);
  }
}

function jsonRequest(
  pathName: string,
  init: {
    method: "POST" | "PATCH";
    body: Record<string, unknown>;
    origin?: string | null;
    host?: string;
  },
): Request {
  const host = init.host ?? LOCAL_HOST;
  const origin = init.origin === undefined ? `http://${host}` : init.origin;
  const headers: Record<string, string> = {
    host,
    "content-type": "application/json",
    referer: `${origin ?? LOCAL_ORIGIN}/feedback`,
  };
  if (origin) headers.origin = origin;

  return new Request(`http://${host}${pathName}`, {
    method: init.method,
    headers,
    body: JSON.stringify(init.body),
  });
}

describe("feedback route mutation guards", () => {
  beforeEach(() => {
    previousStorePath = process.env.FEEDBACK_STORE_PATH;
    process.env.FEEDBACK_STORE_PATH = TEST_STORE_PATH;
    cleanup();
  });

  afterEach(() => {
    cleanup();
    if (typeof previousStorePath === "string") process.env.FEEDBACK_STORE_PATH = previousStorePath;
    else delete process.env.FEEDBACK_STORE_PATH;
  });

  it("stores public feedback from same-origin browser requests", async () => {
    const response = await feedbackPost(jsonRequest("/api/feedback", {
      method: "POST",
      body: {
        category: "bug",
        message: "피드백 저장 route guard 성공 케이스입니다.",
      },
    }));
    const payload = await response.json() as { ok?: boolean };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(listRecent(10)).toHaveLength(1);
  });

  it("blocks feedback submission when Origin is missing", async () => {
    const response = await feedbackPost(jsonRequest("/api/feedback", {
      method: "POST",
      origin: null,
      body: {
        category: "bug",
        message: "Origin 없는 요청은 저장되면 안 됩니다.",
      },
    }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("MISSING_ORIGIN");
    expect(listRecent(10)).toHaveLength(0);
  });

  it("blocks feedback submission from an untrusted Origin", async () => {
    const response = await feedbackPost(jsonRequest("/api/feedback", {
      method: "POST",
      origin: "https://evil.example",
      body: {
        category: "question",
        message: "다른 Origin 요청은 저장되면 안 됩니다.",
      },
    }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("UNTRUSTED_ORIGIN");
    expect(listRecent(10)).toHaveLength(0);
  });

  it("updates feedback detail from same-origin browser requests", async () => {
    const saved = addFeedback({
      category: "improve",
      message: "상세 수정 전 피드백입니다.",
      traceId: null,
      userAgent: null,
      url: "/feedback",
      appVersion: "test",
    });

    const response = await feedbackPatch(
      jsonRequest(`/api/feedback/${encodeURIComponent(saved.id)}`, {
        method: "PATCH",
        body: { status: "DOING", priority: "P1", tags: ["route-guard"] },
      }),
      { params: Promise.resolve({ id: saved.id }) },
    );
    const payload = await response.json() as { ok?: boolean; data?: { status?: string; priority?: string } };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.status).toBe("DOING");
    expect(payload.data?.priority).toBe("P1");
  });

  it("blocks feedback detail updates when Origin is missing", async () => {
    const saved = addFeedback({
      category: "improve",
      message: "상세 수정 차단 전 피드백입니다.",
      traceId: null,
      userAgent: null,
      url: "/feedback",
      appVersion: "test",
    });

    const response = await feedbackPatch(
      jsonRequest(`/api/feedback/${encodeURIComponent(saved.id)}`, {
        method: "PATCH",
        origin: null,
        body: { status: "DONE" },
      }),
      { params: Promise.resolve({ id: saved.id }) },
    );
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("MISSING_ORIGIN");
    expect(getFeedbackById(saved.id)?.status).toBe("OPEN");
  });
});
