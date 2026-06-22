import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as alertRulesGET, POST as alertRulesPOST } from "../src/app/api/planning/v3/news/alerts/rules/route";
import { GET as alertsGET, POST as alertsPOST } from "../src/app/api/planning/v3/news/alerts/route";
import { DELETE as noteDELETE, PATCH as notePATCH } from "../src/app/api/planning/v3/news/notes/[noteId]/route";
import { GET as notesGET, POST as notesPOST } from "../src/app/api/planning/v3/news/notes/route";
import { GET as settingsGET, POST as settingsPOST } from "../src/app/api/planning/v3/news/settings/route";
import {
  resolveAlertEventsPath,
  resolveAlertEventStatePath,
  resolveAlertRulesOverridePath,
} from "../src/lib/news/alerts";
import { resolveNewsNotesDir } from "../planning/v3/news/notes";
import { resolveNewsSettingsPath } from "../planning/v3/news/settings";

const env = process.env as Record<string, string | undefined>;

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (typeof value === "string") env[key] = value;
    else delete env[key];
  }
}

function userHeaders(userId: string, refererPath: string): Headers {
  return new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}${refererPath}`,
    "x-planning-user-id": userId,
  });
}

function requestGet(pathname: string, userId: string, refererPath: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: userHeaders(userId, refererPath),
  });
}

function requestWrite(
  method: "POST" | "PATCH" | "DELETE",
  pathname: string,
  userId: string,
  refererPath: string,
  body: Record<string, unknown>,
): Request {
  const headers = userHeaders(userId, refererPath);
  headers.set("cookie", "dev_csrf=test");
  headers.set("content-type", "application/json");
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method,
    headers,
    body: JSON.stringify({ ...body, csrf: "test" }),
  });
}

function expectTrustedMeta(payload: unknown, userId: string): void {
  const meta = (payload as { meta?: { userId?: string; authSource?: string } }).meta;
  expect(meta).toEqual({
    userId,
    authSource: "trusted-header",
  });
}

function writeAlertEventFixture(): void {
  const eventsPath = resolveAlertEventsPath();
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  fs.writeFileSync(eventsPath, `${JSON.stringify({
    id: "news-alert-a1",
    createdAt: "2026-03-04T01:00:00.000Z",
    dayKst: "2026-03-04",
    source: "news:refresh",
    ruleId: "topic_burst_high",
    ruleKind: "topic_burst",
    level: "high",
    title: "토픽 급증",
    summary: "today=5",
    targetType: "topic",
    targetId: "fx",
    link: "/planning/v3/news/trends?topic=fx",
  })}\n`, "utf-8");
}

describe("planning v3 news user scope", () => {
  let root = "";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T00:00:00.000Z"));
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-news-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps news settings overrides isolated by planning user", async () => {
    const initialResponse = await settingsGET(requestGet(
      "/api/planning/v3/news/settings",
      "alice",
      "/planning/v3/news/settings",
    ));
    expect(initialResponse.status).toBe(200);
    const initialPayload = await initialResponse.json() as {
      data?: {
        sources?: Array<{ id?: string; overrideEnabled?: boolean | null; overrideWeight?: number | null }>;
        topics?: Array<{ id?: string; overrideKeywords?: string[] | null }>;
      };
    };
    const sourceId = initialPayload.data?.sources?.[0]?.id ?? "";
    const topicId = initialPayload.data?.topics?.[0]?.id ?? "";
    expect(sourceId).not.toBe("");
    expect(topicId).not.toBe("");

    const postResponse = await settingsPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/settings",
      "alice",
      "/planning/v3/news/settings",
      {
        sources: [{ id: sourceId, enabled: false, weight: 0.91 }],
        topics: [{ id: topicId, keywords: ["alice-keyword"] }],
      },
    ));
    expect(postResponse.status).toBe(200);
    expectTrustedMeta(await postResponse.json(), "alice");

    const bobResponse = await settingsGET(requestGet(
      "/api/planning/v3/news/settings",
      "bob",
      "/planning/v3/news/settings",
    ));
    const bobPayload = await bobResponse.json() as {
      data?: {
        sources?: Array<{ id?: string; overrideEnabled?: boolean | null; overrideWeight?: number | null }>;
        topics?: Array<{ id?: string; overrideKeywords?: string[] | null }>;
      };
    };
    expect(bobResponse.status).toBe(200);
    expectTrustedMeta(bobPayload, "bob");
    expect(bobPayload.data?.sources?.find((row) => row.id === sourceId)?.overrideEnabled).toBeNull();
    expect(bobPayload.data?.sources?.find((row) => row.id === sourceId)?.overrideWeight).toBeNull();
    expect(bobPayload.data?.topics?.find((row) => row.id === topicId)?.overrideKeywords).toBeNull();

    const aliceResponse = await settingsGET(requestGet(
      "/api/planning/v3/news/settings",
      "alice",
      "/planning/v3/news/settings",
    ));
    const alicePayload = await aliceResponse.json() as {
      data?: {
        sources?: Array<{ id?: string; overrideEnabled?: boolean | null; overrideWeight?: number | null }>;
        topics?: Array<{ id?: string; overrideKeywords?: string[] | null }>;
      };
    };
    expect(aliceResponse.status).toBe(200);
    expectTrustedMeta(alicePayload, "alice");
    expect(alicePayload.data?.sources?.find((row) => row.id === sourceId)?.overrideEnabled).toBe(false);
    expect(alicePayload.data?.sources?.find((row) => row.id === sourceId)?.overrideWeight).toBe(0.91);
    expect(alicePayload.data?.topics?.find((row) => row.id === topicId)?.overrideKeywords).toEqual(["alice-keyword"]);
    expect(resolveNewsSettingsPath().replaceAll("\\", "/")).toContain("/users/alice/planning-v3/news/settings.json");
  });

  it("keeps alert rule overrides isolated by planning user", async () => {
    const initialResponse = await alertRulesGET(requestGet(
      "/api/planning/v3/news/alerts/rules",
      "alice",
      "/planning/v3/news/settings",
    ));
    expect(initialResponse.status).toBe(200);
    const initialPayload = await initialResponse.json() as {
      data?: { effective?: Array<{ id?: string; enabled?: boolean }> };
    };
    const ruleId = initialPayload.data?.effective?.find((row) => row.enabled !== false)?.id
      ?? initialPayload.data?.effective?.[0]?.id
      ?? "";
    expect(ruleId).not.toBe("");

    const postResponse = await alertRulesPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/alerts/rules",
      "alice",
      "/planning/v3/news/settings",
      { rules: [{ id: ruleId, enabled: false }] },
    ));
    expect(postResponse.status).toBe(200);
    expectTrustedMeta(await postResponse.json(), "alice");

    const bobResponse = await alertRulesGET(requestGet(
      "/api/planning/v3/news/alerts/rules",
      "bob",
      "/planning/v3/news/settings",
    ));
    const bobPayload = await bobResponse.json() as {
      data?: {
        overrides?: { rules?: Array<{ id?: string; enabled?: boolean }> };
        effective?: Array<{ id?: string; enabled?: boolean }>;
      };
    };
    expect(bobResponse.status).toBe(200);
    expectTrustedMeta(bobPayload, "bob");
    expect((bobPayload.data?.overrides?.rules ?? []).some((row) => row.id === ruleId)).toBe(false);
    expect(bobPayload.data?.effective?.find((row) => row.id === ruleId)?.enabled).not.toBe(false);

    const aliceResponse = await alertRulesGET(requestGet(
      "/api/planning/v3/news/alerts/rules",
      "alice",
      "/planning/v3/news/settings",
    ));
    const alicePayload = await aliceResponse.json() as {
      data?: {
        overrides?: { rules?: Array<{ id?: string; enabled?: boolean }> };
        effective?: Array<{ id?: string; enabled?: boolean }>;
      };
    };
    expect(aliceResponse.status).toBe(200);
    expectTrustedMeta(alicePayload, "alice");
    expect((alicePayload.data?.overrides?.rules ?? []).some((row) => row.id === ruleId && row.enabled === false)).toBe(true);
    expect(alicePayload.data?.effective?.find((row) => row.id === ruleId)?.enabled).toBe(false);
    expect(resolveAlertRulesOverridePath().replaceAll("\\", "/")).toContain("/users/alice/news/alerts/rules.override.json");
  });

  it("shares alert event feed but isolates alert event state by planning user", async () => {
    writeAlertEventFixture();

    const postResponse = await alertsPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/alerts",
      "alice",
      "/planning/v3/news/alerts",
      { id: "news-alert-a1", action: "ack", days: 30 },
    ));
    expect(postResponse.status).toBe(200);
    expectTrustedMeta(await postResponse.json(), "alice");

    const bobResponse = await alertsGET(requestGet(
      "/api/planning/v3/news/alerts?days=30",
      "bob",
      "/planning/v3/news/alerts",
    ));
    const bobPayload = await bobResponse.json() as {
      data?: { groups?: Array<{ events?: Array<{ id?: string; state?: { acknowledgedAt?: string | null } }> }> };
    };
    expect(bobResponse.status).toBe(200);
    expectTrustedMeta(bobPayload, "bob");
    const bobEvent = bobPayload.data?.groups?.flatMap((group) => group.events ?? []).find((event) => event.id === "news-alert-a1");
    expect(bobEvent?.state?.acknowledgedAt).toBeNull();

    const aliceResponse = await alertsGET(requestGet(
      "/api/planning/v3/news/alerts?days=30",
      "alice",
      "/planning/v3/news/alerts",
    ));
    const alicePayload = await aliceResponse.json() as {
      data?: { groups?: Array<{ events?: Array<{ id?: string; state?: { acknowledgedAt?: string | null } }> }> };
    };
    expect(aliceResponse.status).toBe(200);
    expectTrustedMeta(alicePayload, "alice");
    const aliceEvent = alicePayload.data?.groups?.flatMap((group) => group.events ?? []).find((event) => event.id === "news-alert-a1");
    expect(typeof aliceEvent?.state?.acknowledgedAt).toBe("string");
    expect(resolveAlertEventStatePath().replaceAll("\\", "/")).toContain("/users/alice/news/alerts/event-state.json");
  });

  it("keeps news notes list, update, and delete scoped by planning user", async () => {
    const createdResponse = await notesPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/notes",
      "alice",
      "/planning/v3/news",
      {
        targetType: "item",
        targetId: "https://example.com/alice",
        tags: ["관찰"],
        note: "alice memo",
      },
    ));
    const createdPayload = await createdResponse.json() as { data?: { id?: string } };
    expect(createdResponse.status).toBe(200);
    expectTrustedMeta(createdPayload, "alice");
    const noteId = createdPayload.data?.id ?? "";
    expect(noteId.length).toBeGreaterThan(10);

    const bobListResponse = await notesGET(requestGet(
      "/api/planning/v3/news/notes",
      "bob",
      "/planning/v3/news",
    ));
    const bobListPayload = await bobListResponse.json() as { data?: { total?: number } };
    expect(bobListResponse.status).toBe(200);
    expectTrustedMeta(bobListPayload, "bob");
    expect(bobListPayload.data?.total).toBe(0);

    const bobPatchResponse = await notePATCH(
      requestWrite(
        "PATCH",
        `/api/planning/v3/news/notes/${noteId}`,
        "bob",
        "/planning/v3/news",
        { note: "bob takeover" },
      ),
      { params: Promise.resolve({ noteId }) },
    );
    const bobPatchPayload = await bobPatchResponse.json();
    expect(bobPatchResponse.status).toBe(404);
    expectTrustedMeta(bobPatchPayload, "bob");

    const bobDeleteResponse = await noteDELETE(
      requestWrite(
        "DELETE",
        `/api/planning/v3/news/notes/${noteId}`,
        "bob",
        "/planning/v3/news",
        {},
      ),
      { params: Promise.resolve({ noteId }) },
    );
    const bobDeletePayload = await bobDeleteResponse.json();
    expect(bobDeleteResponse.status).toBe(404);
    expectTrustedMeta(bobDeletePayload, "bob");

    const alicePatchResponse = await notePATCH(
      requestWrite(
        "PATCH",
        `/api/planning/v3/news/notes/${noteId}`,
        "alice",
        "/planning/v3/news",
        { note: "alice memo updated", tags: ["업데이트"] },
      ),
      { params: Promise.resolve({ noteId }) },
    );
    const alicePatchPayload = await alicePatchResponse.json() as { data?: { note?: string; tags?: string[] } };
    expect(alicePatchResponse.status).toBe(200);
    expectTrustedMeta(alicePatchPayload, "alice");
    expect(alicePatchPayload.data?.note).toBe("alice memo updated");
    expect(alicePatchPayload.data?.tags).toEqual(["업데이트"]);

    const aliceDeleteResponse = await noteDELETE(
      requestWrite(
        "DELETE",
        `/api/planning/v3/news/notes/${noteId}`,
        "alice",
        "/planning/v3/news",
        {},
      ),
      { params: Promise.resolve({ noteId }) },
    );
    const aliceDeletePayload = await aliceDeleteResponse.json();
    expect(aliceDeleteResponse.status).toBe(200);
    expectTrustedMeta(aliceDeletePayload, "alice");

    const aliceListResponse = await notesGET(requestGet(
      "/api/planning/v3/news/notes",
      "alice",
      "/planning/v3/news",
    ));
    const aliceListPayload = await aliceListResponse.json() as { data?: { total?: number } };
    expect(aliceListResponse.status).toBe(200);
    expect(aliceListPayload.data?.total).toBe(0);
    expect(resolveNewsNotesDir().replaceAll("\\", "/")).toContain("/users/alice/planning-v3/news/notes");
  });
});
