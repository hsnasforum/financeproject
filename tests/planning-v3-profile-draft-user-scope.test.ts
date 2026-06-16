import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/batches/import/csv/route";
import { GET as profileDraftGET } from "../src/app/api/planning/v3/profile/draft/route";

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

const LOCAL_HOST = "localhost:4950";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  data?: unknown;
  error?: { code?: string };
  meta?: { userId?: string; authSource?: string; batchId?: string };
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
    referer: `${LOCAL_ORIGIN}/planning/v3/profile/draft`,
    ...(contentType ? { "content-type": contentType } : {}),
    "x-planning-user-id": userId,
  };
}

function buildJsonRequest(urlPath: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "POST",
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

function buildGetRequest(urlPath: string, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: userHeaders(userId),
  });
}

async function createBatchFixture(userId: string): Promise<string> {
  const response = await importCsvPOST(buildJsonRequest("/api/planning/v3/batches/import/csv", {
    csrf: "test",
    fileName: `${userId}-profile-draft-preview.csv`,
    csvText: [
      "date,amount,description",
      "2026-08-01,3400000,salary",
      "2026-08-02,-950000,rent",
      "2026-09-01,3500000,salary",
      "2026-09-02,-960000,rent",
    ].join("\n"),
  }, userId));
  expect(response.status).toBe(201);

  const payload = await response.json() as {
    data?: { batchId?: string };
  };
  const batchId = String(payload.data?.batchId ?? "");
  expect(batchId).toBeTruthy();
  return batchId;
}

describe("planning v3 profile draft preview API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-profile-draft-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
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

  it("does not build a profile draft preview from another user's batch", async () => {
    const aliceBatchId = await createBatchFixture("alice");

    const bobPreview = await profileDraftGET(
      buildGetRequest(`/api/planning/v3/profile/draft?batchId=${encodeURIComponent(aliceBatchId)}&csrf=test`, "bob"),
    );
    expect(bobPreview.status).toBe(404);
    const bobPayload = await bobPreview.json() as ApiPayload;
    expect(bobPayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const alicePreview = await profileDraftGET(
      buildGetRequest(`/api/planning/v3/profile/draft?batchId=${encodeURIComponent(aliceBatchId)}&csrf=test`, "alice"),
    );
    expect(alicePreview.status).toBe(200);
    const alicePayload = await alicePreview.json() as ApiPayload;
    expect(alicePayload.ok).toBe(true);
    expect(alicePayload.meta?.batchId).toBe(aliceBatchId);
  });
});
