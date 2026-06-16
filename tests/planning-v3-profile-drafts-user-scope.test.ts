import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/batches/import/csv/route";
import { POST as draftApplyPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/apply/route";
import { POST as draftPreflightPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/preflight/route";
import { GET as draftDetailGET, DELETE as draftDetailDELETE } from "../src/app/api/planning/v3/profile/drafts/[id]/route";
import { GET as draftsGET, POST as draftsPOST } from "../src/app/api/planning/v3/profile/drafts/route";
import { createProfile } from "../src/lib/planning/store/profileStore";
import { runWithPlanningUserScope } from "../src/lib/planning/store/userScope";

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

const LOCAL_HOST = "localhost:4990";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  data?: unknown;
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
    referer: `${LOCAL_ORIGIN}/planning/v3/profile/drafts`,
    ...(contentType ? { "content-type": contentType } : {}),
    "x-planning-user-id": userId,
  };
}

function buildGetRequest(urlPath: string, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: userHeaders(userId),
  });
}

function buildJsonRequest(method: "POST" | "DELETE", urlPath: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

async function createBatchFixture(userId: string): Promise<string> {
  const response = await importCsvPOST(buildJsonRequest("POST", "/api/planning/v3/batches/import/csv", {
    csrf: "test",
    fileName: `${userId}-profile-draft.csv`,
    csvText: [
      "date,amount,description",
      "2026-06-01,3200000,salary",
      "2026-06-02,-900000,rent",
      "2026-07-01,3300000,salary",
      "2026-07-02,-910000,rent",
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

async function createProfileDraftFixture(userId: string): Promise<{ batchId: string; draftId: string }> {
  const batchId = await createBatchFixture(userId);
  const response = await draftsPOST(buildJsonRequest("POST", "/api/planning/v3/profile/drafts", {
    csrf: "test",
    batchId,
  }, userId));
  expect(response.status).toBe(200);

  const payload = await response.json() as {
    data?: { id?: string; draftId?: string };
  };
  const draftId = String(payload.data?.id ?? payload.data?.draftId ?? "");
  expect(draftId).toBeTruthy();
  return { batchId, draftId };
}

async function createProfileFixture(userId: string): Promise<string> {
  return runWithPlanningUserScope({ userId }, async () => {
    const profile = await createProfile({
      name: `${userId} base profile`,
      profile: {
        monthlyIncomeNet: 3_000_000,
        monthlyEssentialExpenses: 1_200_000,
        monthlyDiscretionaryExpenses: 400_000,
        liquidAssets: 2_000_000,
        investmentAssets: 1_000_000,
        debts: [],
        goals: [],
      },
    });
    return profile.id;
  });
}

function draftRows(payload: ApiPayload): Array<{ id?: string; draftId?: string }> {
  return Array.isArray(payload.data) ? payload.data as Array<{ id?: string; draftId?: string }> : [];
}

describe("planning v3 profile drafts API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-profile-drafts-user-scope-"));
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

  it("does not expose another user's profile draft through list, detail, delete, or create-from-batch", async () => {
    const { batchId: aliceBatchId, draftId: aliceDraftId } = await createProfileDraftFixture("alice");

    const aliceList = await draftsGET(
      buildGetRequest("/api/planning/v3/profile/drafts?csrf=test", "alice"),
    );
    expect(aliceList.status).toBe(200);
    const aliceListPayload = await aliceList.json() as ApiPayload;
    expect(draftRows(aliceListPayload).some((row) => row.id === aliceDraftId || row.draftId === aliceDraftId)).toBe(true);

    const bobList = await draftsGET(
      buildGetRequest("/api/planning/v3/profile/drafts?csrf=test", "bob"),
    );
    expect(bobList.status).toBe(200);
    const bobListPayload = await bobList.json() as ApiPayload;
    expect(draftRows(bobListPayload).some((row) => row.id === aliceDraftId || row.draftId === aliceDraftId)).toBe(false);

    const bobDetail = await draftDetailGET(
      buildGetRequest(`/api/planning/v3/profile/drafts/${encodeURIComponent(aliceDraftId)}?csrf=test`, "bob"),
      { params: Promise.resolve({ id: aliceDraftId }) },
    );
    expect(bobDetail.status).toBe(404);
    const bobDetailPayload = await bobDetail.json() as ApiPayload;
    expect(bobDetailPayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobDelete = await draftDetailDELETE(
      buildJsonRequest("DELETE", `/api/planning/v3/profile/drafts/${encodeURIComponent(aliceDraftId)}`, { csrf: "test" }, "bob"),
      { params: Promise.resolve({ id: aliceDraftId }) },
    );
    expect(bobDelete.status).toBe(404);
    const bobDeletePayload = await bobDelete.json() as ApiPayload;
    expect(bobDeletePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobCreateFromAliceBatch = await draftsPOST(buildJsonRequest("POST", "/api/planning/v3/profile/drafts", {
      csrf: "test",
      batchId: aliceBatchId,
    }, "bob"));
    expect(bobCreateFromAliceBatch.status).toBe(404);
    const bobCreatePayload = await bobCreateFromAliceBatch.json() as ApiPayload;
    expect(bobCreatePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const aliceDetail = await draftDetailGET(
      buildGetRequest(`/api/planning/v3/profile/drafts/${encodeURIComponent(aliceDraftId)}?csrf=test`, "alice"),
      { params: Promise.resolve({ id: aliceDraftId }) },
    );
    expect(aliceDetail.status).toBe(200);
    const aliceDetailPayload = await aliceDetail.json() as ApiPayload;
    expect(aliceDetailPayload.ok).toBe(true);
  });

  it("does not preflight or apply another user's draft or base profile", async () => {
    const aliceProfileId = await createProfileFixture("alice");
    const { draftId: aliceDraftId } = await createProfileDraftFixture("alice");
    const { draftId: bobDraftId } = await createProfileDraftFixture("bob");

    const bobPreflightAliceDraft = await draftPreflightPOST(
      buildJsonRequest(
        "POST",
        `/api/planning/v3/profile/drafts/${encodeURIComponent(aliceDraftId)}/preflight`,
        { csrf: "test" },
        "bob",
      ),
      { params: Promise.resolve({ id: aliceDraftId }) },
    );
    expect(bobPreflightAliceDraft.status).toBe(404);
    const bobPreflightAliceDraftPayload = await bobPreflightAliceDraft.json() as ApiPayload;
    expect(bobPreflightAliceDraftPayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobPreflightAliceProfile = await draftPreflightPOST(
      buildJsonRequest(
        "POST",
        `/api/planning/v3/profile/drafts/${encodeURIComponent(bobDraftId)}/preflight`,
        { csrf: "test", profileId: aliceProfileId },
        "bob",
      ),
      { params: Promise.resolve({ id: bobDraftId }) },
    );
    expect(bobPreflightAliceProfile.status).toBe(404);
    const bobPreflightAliceProfilePayload = await bobPreflightAliceProfile.json() as ApiPayload;
    expect(bobPreflightAliceProfilePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobApplyAliceDraft = await draftApplyPOST(
      buildJsonRequest(
        "POST",
        `/api/planning/v3/profile/drafts/${encodeURIComponent(aliceDraftId)}/apply`,
        { csrf: "test" },
        "bob",
      ),
      { params: Promise.resolve({ id: aliceDraftId }) },
    );
    expect(bobApplyAliceDraft.status).toBe(404);
    const bobApplyAliceDraftPayload = await bobApplyAliceDraft.json() as ApiPayload;
    expect(bobApplyAliceDraftPayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobApplyAliceProfile = await draftApplyPOST(
      buildJsonRequest(
        "POST",
        `/api/planning/v3/profile/drafts/${encodeURIComponent(bobDraftId)}/apply`,
        { csrf: "test", profileId: aliceProfileId },
        "bob",
      ),
      { params: Promise.resolve({ id: bobDraftId }) },
    );
    expect(bobApplyAliceProfile.status).toBe(404);
    const bobApplyAliceProfilePayload = await bobApplyAliceProfile.json() as ApiPayload;
    expect(bobApplyAliceProfilePayload).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });
  });
});
