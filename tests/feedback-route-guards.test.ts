import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as unlockPOST } from "../src/app/api/dev/unlock/route";
import { GET as feedbackDetailGET, PATCH as feedbackPatch } from "../src/app/api/feedback/[id]/route";
import { GET as feedbackListGET } from "../src/app/api/feedback/list/route";
import { GET as feedbackRecentGET } from "../src/app/api/feedback/recent/route";
import { POST as feedbackPost } from "../src/app/api/feedback/route";
import { addFeedback, addOpsFeedback, getFeedbackById, listRecent } from "../src/lib/feedback/feedbackStore";
import { FEEDBACK_MANAGEMENT_COOKIE_NAME } from "../src/lib/feedback/feedbackManagementCapability";

const TEST_STORE_PATH = path.join(process.cwd(), "tmp", "feedback-route-guards.test.json");
const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const DEV_ACTION_TOKEN = "feedback-route-guards-token";
const ADMIN_RECORD_KEYS = [
  "appVersion",
  "category",
  "createdAt",
  "dueDate",
  "id",
  "message",
  "note",
  "priority",
  "recordKind",
  "status",
  "tags",
  "tasks",
  "traceId",
  "url",
  "userAgent",
].sort();

const mutableEnv = process.env as Record<string, string | undefined>;
let previousStorePath: string | undefined;
let previousNodeEnv: string | undefined;
let previousDevActionToken: string | undefined;
let previousAllowRemote: string | undefined;

function cleanup() {
  for (const filePath of [TEST_STORE_PATH, `${TEST_STORE_PATH}.tmp`]) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function request(
  pathName: string,
  init: {
    method?: "GET" | "POST" | "PATCH";
    body?: Record<string, unknown>;
    origin?: string | null;
    host?: string;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const host = init.host ?? LOCAL_HOST;
  const origin = init.origin === undefined ? `http://${host}` : init.origin;
  const headers: Record<string, string> = {
    host,
    referer: `${origin ?? LOCAL_ORIGIN}/feedback`,
  };
  if (origin) headers.origin = origin;
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body) headers["content-type"] = "application/json";
  Object.assign(headers, init.headers ?? {});

  return new Request(`http://${host}${pathName}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
}

function extractCookie(setCookie: string, name: string): string {
  const match = new RegExp(`(?:^|,\\s*|;\\s*)${name}=([^;,]+)`).exec(setCookie);
  if (!match?.[1]) throw new Error(`${name} cookie was not issued`);
  return `${name}=${match[1]}`;
}

async function unlockFeedbackManagement(): Promise<string> {
  const response = await unlockPOST(new Request(`${LOCAL_ORIGIN}/api/dev/unlock`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/ops/rules`,
      "x-dev-token": DEV_ACTION_TOKEN,
    },
  }));
  expect(response.status).toBe(200);
  return extractCookie(response.headers.get("set-cookie") ?? "", FEEDBACK_MANAGEMENT_COOKIE_NAME);
}

function seedPublicFeedback() {
  return addFeedback({
    recordKind: "public-feedback",
    category: "improve",
    message: "관리 경계 테스트용 공개 피드백입니다.",
    traceId: "trace-public",
    userAgent: "test-agent",
    url: "/feedback",
    appVersion: "test",
    note: "운영 메모",
    tasks: [{ id: "task-1", text: "확인하기", done: false }],
  });
}

function seedOpsFeedback() {
  return addOpsFeedback({
    category: "bug",
    message: "[OPS][DATA_DOCTOR] 실패: DB_NOT_READY",
    traceId: null,
    userAgent: "ops-auto-ticket",
    url: "/api/dev/doctor/fix",
    appVersion: null,
    priority: "P0",
    tags: ["ops", "auto"],
    note: "internal ops note",
    fingerprint: "OPS:FIX:DATA_DOCTOR:DB_NOT_READY",
  });
}

function expectExactAdminRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual(ADMIN_RECORD_KEYS);
}

describe("feedback public and local-ops access matrix", () => {
  beforeEach(() => {
    previousStorePath = process.env.FEEDBACK_STORE_PATH;
    previousNodeEnv = process.env.NODE_ENV;
    previousDevActionToken = process.env.DEV_ACTION_TOKEN;
    previousAllowRemote = process.env.ALLOW_REMOTE;
    mutableEnv.FEEDBACK_STORE_PATH = TEST_STORE_PATH;
    mutableEnv.NODE_ENV = "test";
    mutableEnv.DEV_ACTION_TOKEN = DEV_ACTION_TOKEN;
    delete mutableEnv.ALLOW_REMOTE;
    cleanup();
  });

  afterEach(() => {
    cleanup();
    if (typeof previousStorePath === "string") mutableEnv.FEEDBACK_STORE_PATH = previousStorePath;
    else delete mutableEnv.FEEDBACK_STORE_PATH;
    if (typeof previousNodeEnv === "string") mutableEnv.NODE_ENV = previousNodeEnv;
    else delete mutableEnv.NODE_ENV;
    if (typeof previousDevActionToken === "string") mutableEnv.DEV_ACTION_TOKEN = previousDevActionToken;
    else delete mutableEnv.DEV_ACTION_TOKEN;
    if (typeof previousAllowRemote === "string") mutableEnv.ALLOW_REMOTE = previousAllowRemote;
    else delete mutableEnv.ALLOW_REMOTE;
  });

  it("keeps public submission open and returns only the public receipt", async () => {
    const response = await feedbackPost(request("/api/feedback", {
      method: "POST",
      body: {
        category: "bug",
        message: "피드백 저장 route guard 성공 케이스입니다.",
        snapshot: {
          generatedAt: "2000-01-01T00:00:00.000Z",
          appVersion: "client-controlled-snapshot",
          recentErrors: [],
        },
      },
      headers: {
        "x-page-url": "https://attacker.example/private?token=secret",
        "x-local-state-summary": encodeURIComponent(JSON.stringify({ injected: { exists: true, savedAt: null } })),
      },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    const recent = listRecent(10);
    expect(recent).toHaveLength(1);
    const storedSnapshot = getFeedbackById(recent[0]!.id)?.snapshot;
    expect(storedSnapshot?.generatedAt).toEqual(expect.any(String));
    expect(storedSnapshot?.generatedAt).not.toBe("2000-01-01T00:00:00.000Z");
    expect(storedSnapshot?.appVersion).not.toBe("client-controlled-snapshot");
    expect(storedSnapshot?.page.url).toBe("http://localhost:3000/api/feedback");
    expect(storedSnapshot?.localStateSummary).toBeNull();
  });

  it("stores feedback even when server diagnostics cannot be generated", async () => {
    const originalExistsSync = fs.existsSync;
    const existsSyncSpy = vi.spyOn(fs, "existsSync").mockImplementation((target) => {
      const normalized = String(target).replaceAll("\\", "/");
      if (normalized.endsWith("/tmp/dart")) {
        throw new Error("diagnostics unavailable");
      }
      return originalExistsSync(target);
    });

    try {
      const response = await feedbackPost(request("/api/feedback", {
        method: "POST",
        body: {
          category: "question",
          message: "진단 생성 실패 시에도 저장되는 피드백입니다.",
        },
      }));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toEqual({ ok: true });
      const recent = listRecent(10);
      expect(recent).toHaveLength(1);
      expect(getFeedbackById(recent[0]!.id)?.snapshot).toBeUndefined();
    } finally {
      existsSyncSpy.mockRestore();
    }
  });

  it("keeps origin protection on public submission", async () => {
    for (const origin of [null, "https://evil.example"] as const) {
      const response = await feedbackPost(request("/api/feedback", {
        method: "POST",
        origin,
        body: {
          category: "question",
          message: "신뢰되지 않은 요청은 저장되면 안 됩니다.",
        },
      }));
      const payload = await response.json() as { error?: { code?: string } };

      expect(response.status).toBe(403);
      expect(payload.error?.code).toBe(origin === null ? "MISSING_ORIGIN" : "UNTRUSTED_ORIGIN");
    }
    expect(listRecent(10)).toHaveLength(0);
  });

  it("rejects anonymous and ordinary authenticated users from management reads", async () => {
    const saved = seedPublicFeedback();
    const calls = [
      feedbackListGET(request("/api/feedback/list")),
      feedbackRecentGET(request("/api/feedback/recent", { cookie: "authjs.session-token=user-session" })),
      feedbackDetailGET(
        request(`/api/feedback/${saved.id}`, { cookie: "authjs.session-token=user-session" }),
        { params: Promise.resolve({ id: saved.id }) },
      ),
    ];

    for (const responsePromise of calls) {
      const response = await responsePromise;
      const payload = await response.json() as { error?: { code?: string } };
      expect(response.status).toBe(403);
      expect(payload.error?.code).toBe("UNAUTHORIZED");
    }
  });

  it("lets an unlocked local operator read explicitly mapped admin records", async () => {
    seedPublicFeedback();
    const opsTicket = seedOpsFeedback();
    const cookie = await unlockFeedbackManagement();

    const listResponse = await feedbackListGET(request("/api/feedback/list", { cookie }));
    const listPayload = await listResponse.json() as { data?: Array<Record<string, unknown>> };
    expect(listResponse.status).toBe(200);
    expect(listPayload.data).toHaveLength(2);
    expect(listPayload.data?.map((item) => item.recordKind).sort()).toEqual(["ops-ticket", "public-feedback"]);
    expect(listPayload.data?.every((item) => !("fingerprint" in item))).toBe(true);
    for (const item of listPayload.data ?? []) expectExactAdminRecord(item);

    const recentResponse = await feedbackRecentGET(request("/api/feedback/recent", { cookie }));
    const recentPayload = await recentResponse.json() as { data?: Array<Record<string, unknown>> };
    expect(recentResponse.status).toBe(200);
    for (const item of recentPayload.data ?? []) expectExactAdminRecord(item);

    const detailResponse = await feedbackDetailGET(
      request(`/api/feedback/${opsTicket.id}`, { cookie }),
      { params: Promise.resolve({ id: opsTicket.id }) },
    );
    const detailPayload = await detailResponse.json() as { data?: Record<string, unknown> };
    expect(detailResponse.status).toBe(200);
    expectExactAdminRecord(detailPayload.data);
    expect(detailPayload.data).toMatchObject({
      recordKind: "ops-ticket",
      id: opsTicket.id,
      note: "internal ops note",
    });
    expect(detailPayload.data).not.toHaveProperty("fingerprint");
  });

  it("does not treat legacy dev_action or forged management cookies as authorization", async () => {
    seedPublicFeedback();
    for (const cookie of ["dev_action=1", `${FEEDBACK_MANAGEMENT_COOKIE_NAME}=1`]) {
      const response = await feedbackListGET(request("/api/feedback/list", { cookie }));
      const payload = await response.json() as { error?: { code?: string } };
      expect(response.status).toBe(403);
      expect(payload.error?.code).toBe("UNAUTHORIZED");
    }
  });

  it("keeps the local boundary strict even when ALLOW_REMOTE is enabled", async () => {
    seedPublicFeedback();
    const cookie = await unlockFeedbackManagement();
    mutableEnv.ALLOW_REMOTE = "1";
    const response = await feedbackListGET(request("/api/feedback/list", {
      host: "example.com",
      origin: "https://example.com",
      cookie,
    }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("rejects forwarded-host spoofing even with a signed capability", async () => {
    seedPublicFeedback();
    const cookie = await unlockFeedbackManagement();
    const response = await feedbackListGET(request("/api/feedback/list", {
      host: "example.com",
      origin: "https://example.com",
      cookie,
      headers: { "x-forwarded-host": LOCAL_HOST },
    }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("hides management routes in production even with a valid local capability", async () => {
    seedPublicFeedback();
    const cookie = await unlockFeedbackManagement();
    mutableEnv.NODE_ENV = "production";
    const response = await feedbackListGET(request("/api/feedback/list", { cookie }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(404);
    expect(payload.error?.code).toBe("NOT_FOUND");
  });

  it("requires both local-ops authorization and a trusted origin for PATCH", async () => {
    const saved = seedOpsFeedback();

    const anonymousResponse = await feedbackPatch(
      request(`/api/feedback/${saved.id}`, {
        method: "PATCH",
        body: { status: "DOING" },
      }),
      { params: Promise.resolve({ id: saved.id }) },
    );
    expect(anonymousResponse.status).toBe(403);
    expect(getFeedbackById(saved.id)?.status).toBe("OPEN");

    const cookie = await unlockFeedbackManagement();
    const crossOriginResponse = await feedbackPatch(
      request(`/api/feedback/${saved.id}`, {
        method: "PATCH",
        origin: "https://evil.example",
        cookie,
        body: { status: "DOING" },
      }),
      { params: Promise.resolve({ id: saved.id }) },
    );
    const crossOriginPayload = await crossOriginResponse.json() as { error?: { code?: string } };
    expect(crossOriginResponse.status).toBe(403);
    expect(crossOriginPayload.error?.code).toBe("UNTRUSTED_ORIGIN");
    expect(getFeedbackById(saved.id)?.status).toBe("OPEN");

    const operatorResponse = await feedbackPatch(
      request(`/api/feedback/${saved.id}`, {
        method: "PATCH",
        cookie,
        body: { status: "DOING", priority: "P1", tags: ["route-guard"] },
      }),
      { params: Promise.resolve({ id: saved.id }) },
    );
    const operatorPayload = await operatorResponse.json() as {
      data?: { recordKind?: string; status?: string; priority?: string };
    };
    expect(operatorResponse.status).toBe(200);
    expectExactAdminRecord(operatorPayload.data);
    expect(operatorPayload.data).toMatchObject({
      recordKind: "ops-ticket",
      status: "DOING",
      priority: "P1",
    });
  });
});
