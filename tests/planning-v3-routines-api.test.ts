import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../src/app/api/planning/v3/routines/daily/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;
const originalPlanningNamespaceEnabled = env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningAuthRequired = env.PLANNING_AUTH_REQUIRED;
const originalPlanningTrustAuthHeaders = env.PLANNING_TRUST_AUTH_HEADERS;
const originalPlanningUserId = env.PLANNING_USER_ID;
const originalAuthSecret = env.AUTH_SECRET;
const originalNextAuthSecret = env.NEXTAUTH_SECRET;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

let root = "";

function requestGet(pathname: string, host = LOCAL_HOST, withOriginHeaders = false, userId?: string): Request {
  const origin = `http://${host}`;
  const headers = new Headers({ host });
  if (withOriginHeaders) {
    headers.set("origin", origin);
    headers.set("referer", `${origin}/planning/v3/journal`);
  }
  if (userId) headers.set("x-planning-user-id", userId);
  return new Request(`${origin}${pathname}`, {
    method: "GET",
    headers,
  });
}

function requestPost(pathname: string, body: unknown, cookie = "dev_csrf=csrf-token", userId?: string): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/journal`,
    "content-type": "application/json",
  });
  if (cookie) {
    headers.set("cookie", cookie);
  }
  if (userId) headers.set("x-planning-user-id", userId);
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("planning v3 routines api", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-routines-api-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "0";
    env.PLANNING_NAMESPACE_ENABLED = "0";
    delete env.PLANNING_TRUST_AUTH_HEADERS;
    delete env.PLANNING_USER_ID;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    if (typeof originalPlanningNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalPlanningNamespaceEnabled;
    else delete env.PLANNING_NAMESPACE_ENABLED;

    if (typeof originalPlanningAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalPlanningAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;

    if (typeof originalPlanningTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalPlanningTrustAuthHeaders;
    else delete env.PLANNING_TRUST_AUTH_HEADERS;

    if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
    else delete env.PLANNING_USER_ID;

    if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
    else delete env.AUTH_SECRET;

    if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
    else delete env.NEXTAUTH_SECRET;

    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows same-origin remote host GET", async () => {
    const response = await GET(requestGet("/api/planning/v3/routines/daily?date=2026-03-05", "example.com", true));
    const payload = await response.json() as { ok?: boolean; checklist?: { date?: string } };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.checklist?.date).toBe("2026-03-05");
  });

  it("blocks csrf mismatch for POST when dev csrf cookie exists", async () => {
    const response = await POST(requestPost("/api/planning/v3/routines/daily", {
      csrf: "csrf-body",
      checklist: { date: "2026-03-05", items: [] },
    }, "dev_csrf=csrf-cookie"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("CSRF_MISMATCH");
  });

  it("saves and reads checklist linked by date", async () => {
    const save = await POST(requestPost("/api/planning/v3/routines/daily", {
      csrf: "csrf-token",
      checklist: {
        date: "2026-03-05",
        items: [
          { id: "refresh_news", checked: true },
          { id: "write_journal", checked: true },
        ],
      },
    }));
    const savedPayload = await save.json() as {
      ok?: boolean;
      checklist?: { date?: string; items?: Array<{ id?: string; checked?: boolean }> };
    };
    expect(save.status).toBe(200);
    expect(savedPayload.ok).toBe(true);
    expect(savedPayload.checklist?.date).toBe("2026-03-05");
    expect(savedPayload.checklist?.items?.find((row) => row.id === "refresh_news")?.checked).toBe(true);

    const read = await GET(requestGet("/api/planning/v3/routines/daily?date=2026-03-05", LOCAL_HOST, true));
    const readPayload = await read.json() as {
      ok?: boolean;
      checklist?: { date?: string; savedAt?: string | null; items?: Array<{ id?: string; checked?: boolean }> };
    };
    expect(read.status).toBe(200);
    expect(readPayload.ok).toBe(true);
    expect(readPayload.checklist?.date).toBe("2026-03-05");
    expect(typeof readPayload.checklist?.savedAt).toBe("string");
    expect(readPayload.checklist?.items?.find((row) => row.id === "write_journal")?.checked).toBe(true);
  });

  it("keeps daily routine checklists scoped to the authenticated user", async () => {
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    const saveAlice = await POST(requestPost("/api/planning/v3/routines/daily", {
      csrf: "csrf-token",
      checklist: {
        date: "2026-03-06",
        items: [
          { id: "refresh_news", checked: true },
        ],
      },
    }, "dev_csrf=csrf-token", "alice"));
    expect(saveAlice.status).toBe(200);
    const saveAlicePayload = await saveAlice.json() as {
      ok?: boolean;
      checklist?: { date?: string; items?: Array<{ id?: string; checked?: boolean }> };
      meta?: { userId?: string; authSource?: string };
    };
    expect(saveAlicePayload.ok).toBe(true);
    expect(saveAlicePayload.checklist?.date).toBe("2026-03-06");
    expect(saveAlicePayload.checklist?.items?.find((row) => row.id === "refresh_news")?.checked).toBe(true);
    expect(saveAlicePayload.meta).toMatchObject({ userId: "alice", authSource: "trusted-header" });

    const bobRead = await GET(requestGet("/api/planning/v3/routines/daily?date=2026-03-06", LOCAL_HOST, true, "bob"));
    expect(bobRead.status).toBe(200);
    const bobPayload = await bobRead.json() as {
      ok?: boolean;
      checklist?: { items?: Array<{ id?: string; checked?: boolean }> };
      meta?: { userId?: string; authSource?: string };
    };
    expect(bobPayload.ok).toBe(true);
    expect(bobPayload.meta).toMatchObject({ userId: "bob", authSource: "trusted-header" });
    expect(bobPayload.checklist?.items?.find((row) => row.id === "refresh_news")?.checked).not.toBe(true);

    const aliceRead = await GET(requestGet("/api/planning/v3/routines/daily?date=2026-03-06", LOCAL_HOST, true, "alice"));
    expect(aliceRead.status).toBe(200);
    const alicePayload = await aliceRead.json() as {
      ok?: boolean;
      checklist?: { items?: Array<{ id?: string; checked?: boolean }> };
      meta?: { userId?: string; authSource?: string };
    };
    expect(alicePayload.ok).toBe(true);
    expect(alicePayload.checklist?.items?.find((row) => row.id === "refresh_news")?.checked).toBe(true);
    expect(alicePayload.meta).toMatchObject({ userId: "alice", authSource: "trusted-header" });
  });
});
