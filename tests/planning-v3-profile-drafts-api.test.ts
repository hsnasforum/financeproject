import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as draftsPOST, GET as draftsGET } from "../src/app/api/planning/v3/profile/drafts/route";
import { GET as draftDetailGET, DELETE as draftDetailDELETE } from "../src/app/api/planning/v3/profile/drafts/[id]/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4990";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestPost(body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/profile/drafts`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/profile/drafts`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestGet(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/profile/drafts`,
    },
  });
}

function requestDelete(pathname: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "DELETE",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/profile/drafts`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function collectKeys(value: unknown, parent = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectKeys(entry, `${parent}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  const rows: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const pathKey = parent ? `${parent}.${key}` : key;
    rows.push(pathKey);
    rows.push(...collectKeys(child, pathKey));
  }
  return rows;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("planning v3 profile drafts API", () => {
  let root = "";
  let batchId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-profile-drafts-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;

    const account = await createAccount({ name: "Main", kind: "checking" });
    const created = await appendBatchFromCsv({
      accountId: account.id,
      csvText: [
        "date,amount,description",
        "2026-01-01,3000000,salary",
        "2026-01-02,-1200000,rent",
        "2026-02-01,3200000,salary",
        "2026-02-02,-1100000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "profile-drafts-api.csv",
    });
    batchId = created.batch.id;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("POST returns 400 when batchId is missing", async () => {
    const response = await draftsPOST(requestPost({ csrf: "test" }));
    expect(response.status).toBe(400);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("GET list returns stable shape", async () => {
    const created = await draftsPOST(requestPost({ csrf: "test", batchId }));
    expect(created.status).toBe(200);

    const response = await draftsGET(requestGet("/api/planning/v3/profile/drafts?csrf=test"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ draftId?: string; id?: string; batchId?: string; createdAt?: string; stats?: { months?: number } }>;
    };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect((payload.data ?? []).length).toBeGreaterThanOrEqual(1);
    expect(typeof payload.data?.[0]?.draftId).toBe("string");
    expect(typeof payload.data?.[0]?.id).toBe("string");
    expect(typeof payload.data?.[0]?.batchId).toBe("string");
    expect(typeof payload.data?.[0]?.createdAt).toBe("string");
  });

  it("GET list sorts by createdAt desc deterministically", async () => {
    const createdA = await draftsPOST(requestPost({ csrf: "test", batchId }));
    expect(createdA.status).toBe(200);
    await sleep(5);
    const createdB = await draftsPOST(requestPost({ csrf: "test", batchId }));
    expect(createdB.status).toBe(200);

    const response = await draftsGET(requestGet("/api/planning/v3/profile/drafts?csrf=test"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ draftId?: string; createdAt?: string }>;
    };
    expect(payload.ok).toBe(true);
    const first = String(payload.data?.[0]?.draftId ?? "");
    const second = String(payload.data?.[1]?.draftId ?? "");
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
    const firstTs = Date.parse(String(payload.data?.[0]?.createdAt ?? ""));
    const secondTs = Date.parse(String(payload.data?.[1]?.createdAt ?? ""));
    expect(firstTs).toBeGreaterThanOrEqual(secondTs);
  });

  it("GET detail omits forbidden keys and DELETE removes draft", async () => {
    const created = await draftsPOST(requestPost({ csrf: "test", batchId }));
    const createdPayload = await created.json() as { data?: { id?: string } };
    const draftId = String(createdPayload.data?.id ?? "");
    expect(draftId).toBeTruthy();

    const detail = await draftDetailGET(
      requestGet(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}?csrf=test`),
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(detail.status).toBe(200);
    const detailJson = await detail.json();
    const keys = collectKeys(detailJson).join("\n").toLowerCase();
    expect(keys.includes("description")).toBe(false);
    expect(keys.includes("desc")).toBe(false);
    expect(keys.includes("merchant")).toBe(false);
    expect(keys.includes("rawline")).toBe(false);
    expect(keys.includes("originalcsv")).toBe(false);
    expect(keys.includes("memo")).toBe(false);

    const deleted = await draftDetailDELETE(
      requestDelete(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}`, { csrf: "test" }),
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(deleted.status).toBe(200);
    const deletedPayload = await deleted.json() as { ok?: boolean; data?: { deleted?: boolean } };
    expect(deletedPayload.ok).toBe(true);
    expect(deletedPayload.data?.deleted).toBe(true);
  });

  it("DELETE returns 404 for missing draft", async () => {
    const response = await draftDetailDELETE(
      requestDelete("/api/planning/v3/profile/drafts/d_missing", { csrf: "test" }),
      { params: Promise.resolve({ id: "d_missing" }) },
    );
    expect(response.status).toBe(404);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("NO_DATA");
  });

  it("returns 500 when stored draft includes forbidden keys", async () => {
    const forbiddenId = "d_forbidden_payload";
    const draftsDir = path.join(root, "planning-v3", "drafts");
    fs.mkdirSync(draftsDir, { recursive: true });
    fs.writeFileSync(path.join(draftsDir, `${forbiddenId}.json`), JSON.stringify({
      id: forbiddenId,
      batchId,
      createdAt: new Date().toISOString(),
      draftPatch: { monthlyIncomeNet: 1, monthlyEssentialExpenses: 1, monthlyDiscretionaryExpenses: 1, assumptions: ["x"], monthsConsidered: 1 },
      evidence: { desc: "SHOULD_NOT_BE_ALLOWED" },
      assumptions: ["x"],
      stats: { months: 1 },
    }, null, 2));

    const response = await draftDetailGET(
      requestGet(`/api/planning/v3/profile/drafts/${encodeURIComponent(forbiddenId)}?csrf=test`),
      { params: Promise.resolve({ id: forbiddenId }) },
    );
    expect(response.status).toBe(500);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INTERNAL");
  });
});
