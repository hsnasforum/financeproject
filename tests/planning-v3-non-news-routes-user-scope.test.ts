import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/import/csv/route";
import { GET as indicatorsSpecsGET, POST as indicatorsSpecsPOST } from "../src/app/api/planning/v3/indicators/specs/route";
import { GET as scenarioLibraryGET, POST as scenarioLibraryPOST } from "../src/app/api/planning/v3/scenarios/library/route";

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

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:4875";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  data?: {
    rows?: Array<{ topicId?: string; effectiveEnabled?: boolean }>;
    specs?: Array<{ id?: string }>;
  };
  error?: { code?: string };
  meta?: { userId?: string; authSource?: string };
};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function userHeaders(userId: string, contentType?: string): Record<string, string> {
  return {
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/scenarios`,
    ...(contentType ? { "content-type": contentType } : {}),
    "x-planning-user-id": userId,
  };
}

function buildGetRequest(pathname: string, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: userHeaders(userId),
  });
}

function buildJsonRequest(pathname: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

function buildCsvImportRequest(body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/import/csv?csrf=test`, {
    method: "POST",
    headers: {
      ...userHeaders(userId, "application/json"),
      cookie: "dev_csrf=test",
      "x-csrf-token": "test",
    },
    body: JSON.stringify(body),
  });
}

describe("planning v3 non-news routes user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-non-news-routes-user-scope-"));
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
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps scenario library overrides scoped to the authenticated user", async () => {
    const aliceBefore = await scenarioLibraryGET(buildGetRequest("/api/planning/v3/scenarios/library", "alice"));
    expect(aliceBefore.status).toBe(200);
    const aliceBeforePayload = await aliceBefore.json() as ApiPayload;
    const target = aliceBeforePayload.data?.rows?.[0];
    expect(target?.topicId).toBeTruthy();
    expect(target?.effectiveEnabled).toBe(true);

    const saveAlice = await scenarioLibraryPOST(buildJsonRequest("/api/planning/v3/scenarios/library", {
      csrf: "test",
      items: [{ topicId: target?.topicId, enabled: false, order: 0 }],
    }, "alice"));
    expect(saveAlice.status).toBe(200);

    const aliceAfter = await scenarioLibraryGET(buildGetRequest("/api/planning/v3/scenarios/library", "alice"));
    expect(aliceAfter.status).toBe(200);
    const aliceAfterPayload = await aliceAfter.json() as ApiPayload;
    expect(aliceAfterPayload.data?.rows?.find((row) => row.topicId === target?.topicId)?.effectiveEnabled).toBe(false);

    const bobAfter = await scenarioLibraryGET(buildGetRequest("/api/planning/v3/scenarios/library", "bob"));
    expect(bobAfter.status).toBe(200);
    const bobAfterPayload = await bobAfter.json() as ApiPayload;
    expect(bobAfterPayload.data?.rows?.find((row) => row.topicId === target?.topicId)?.effectiveEnabled).toBe(true);
  });

  it("returns authenticated meta for invalid non-news route inputs", async () => {
    const invalidImport = await importCsvPOST(buildCsvImportRequest({}, "alice"));
    expect(invalidImport.status).toBe(400);
    expect(await invalidImport.json()).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    const invalidScenario = await scenarioLibraryPOST(buildJsonRequest("/api/planning/v3/scenarios/library", {
      csrf: "test",
      items: "not-an-array",
    }, "bob"));
    expect(invalidScenario.status).toBe(400);
    expect(await invalidScenario.json()).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidSpecs = await indicatorsSpecsPOST(buildJsonRequest("/api/planning/v3/indicators/specs", {
      csrf: "test",
      mode: "bad",
      specs: [],
    }, "alice"));
    expect(invalidSpecs.status).toBe(400);
    expect(await invalidSpecs.json()).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });
  });

  it("keeps authenticated indicator specs reads intact", async () => {
    const response = await indicatorsSpecsGET(buildGetRequest("/api/planning/v3/indicators/specs", "alice"));
    expect(response.status).toBe(200);
    const payload = await response.json() as ApiPayload;
    expect(payload.ok).toBe(true);
    expect((payload.data?.specs ?? []).length).toBeGreaterThan(0);
  });
});
