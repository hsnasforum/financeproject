import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as draftPreviewPOST } from "../src/app/api/planning/v3/draft/preview/route";
import { DELETE as draftDeleteGET, GET as draftDetailGET } from "../src/app/api/planning/v3/drafts/[id]/route";
import { GET as draftsGET, POST as draftsPOST } from "../src/app/api/planning/v3/drafts/route";
import { createDraft } from "../src/lib/planning/v3/draft/store";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestGet(pathname: string, refererPath = "/planning/v3/drafts"): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin: REMOTE_ORIGIN,
      referer: `${REMOTE_ORIGIN}${refererPath}`,
    },
  });
}

function requestJson(
  pathname: string,
  method: "POST" | "DELETE",
  body: unknown,
  refererPath = "/planning/v3/drafts",
  origin = REMOTE_ORIGIN,
): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method,
    headers: {
      host: REMOTE_HOST,
      origin,
      referer: `${origin}${refererPath}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as {
    ok?: boolean;
    error?: { code?: string };
  };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

describe("planning v3 drafts remote host contract", () => {
  let root = "";
  let existingDraftId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-drafts-remote-host-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, ".data", "planning");

    const created = await createDraft({
      source: { kind: "csv", filename: "remote-host.csv" },
      cashflow: [
        { ym: "2026-03", incomeKrw: 2_400_000, expenseKrw: -1_100_000, netKrw: 1_300_000, txCount: 2 },
      ],
      draftPatch: {
        monthlyIncomeNet: 2_400_000,
        monthlyEssentialExpenses: 900_000,
        monthlyDiscretionaryExpenses: 200_000,
      },
    });
    existingDraftId = created.id;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows same-origin remote host across drafts list/detail/create/delete and preview", async () => {
    const listResponse = await draftsGET(requestGet("/api/planning/v3/drafts?csrf=test"));
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json() as {
      ok?: boolean;
      drafts?: Array<{ id?: string }>;
    };
    expect(listPayload.ok).toBe(true);
    expect((listPayload.drafts ?? []).some((row) => row.id === existingDraftId)).toBe(true);

    const detailResponse = await draftDetailGET(
      requestGet(`/api/planning/v3/drafts/${encodeURIComponent(existingDraftId)}?csrf=test`),
      { params: Promise.resolve({ id: existingDraftId }) },
    );
    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json() as {
      ok?: boolean;
      draft?: { id?: string };
    };
    expect(detailPayload.ok).toBe(true);
    expect(detailPayload.draft?.id).toBe(existingDraftId);

    const createResponse = await draftsPOST(requestJson(
      "/api/planning/v3/drafts",
      "POST",
      {
        csrf: "test",
        source: { kind: "csv", filename: "new-remote.csv" },
        payload: {
          cashflow: [
            { ym: "2026-04", incomeKrw: 2_700_000, expenseKrw: -1_200_000, netKrw: 1_500_000, txCount: 2 },
          ],
          draftPatch: {
            monthlyIncomeNet: 2_700_000,
            monthlyEssentialExpenses: 1_000_000,
            monthlyDiscretionaryExpenses: 200_000,
          },
        },
        meta: { rows: 2, columns: 3 },
      },
    ));
    expect(createResponse.status).toBe(201);
    const createPayload = await createResponse.json() as {
      ok?: boolean;
      id?: string;
    };
    expect(createPayload.ok).toBe(true);
    const createdDraftId = String(createPayload.id ?? "");
    expect(createdDraftId).toBeTruthy();

    const previewResponse = await draftPreviewPOST(requestJson(
      "/api/planning/v3/draft/preview",
      "POST",
      {
        csrf: "test",
        draftId: existingDraftId,
        baseProfile: {
          monthlyIncomeNet: 2_000_000,
          monthlyEssentialExpenses: 800_000,
          monthlyDiscretionaryExpenses: 300_000,
          liquidAssets: 0,
          investmentAssets: 0,
          debts: [],
          goals: [],
        },
      },
      "/planning/v3/drafts",
    ));
    expect(previewResponse.status).toBe(200);
    const previewPayload = await previewResponse.json() as {
      ok?: boolean;
      mergedProfile?: { monthlyIncomeNet?: number };
    };
    expect(previewPayload.ok).toBe(true);
    expect(previewPayload.mergedProfile?.monthlyIncomeNet).toBe(2_400_000);

    const deleteResponse = await draftDeleteGET(
      requestJson(
        `/api/planning/v3/drafts/${encodeURIComponent(createdDraftId)}`,
        "DELETE",
        { csrf: "test" },
      ),
      { params: Promise.resolve({ id: createdDraftId }) },
    );
    expect(deleteResponse.status).toBe(200);
    const deletePayload = await deleteResponse.json() as {
      ok?: boolean;
      deleted?: boolean;
    };
    expect(deletePayload.ok).toBe(true);
    expect(deletePayload.deleted).toBe(true);
  });

  it("blocks cross-origin access across drafts list/detail/create/delete and preview", async () => {
    await expectOriginMismatch(draftsGET(new Request(`${REMOTE_ORIGIN}/api/planning/v3/drafts?csrf=test`, {
      method: "GET",
      headers: {
        host: REMOTE_HOST,
        origin: EVIL_ORIGIN,
        referer: `${EVIL_ORIGIN}/planning/v3/drafts`,
      },
    })));

    await expectOriginMismatch(draftDetailGET(
      new Request(`${REMOTE_ORIGIN}/api/planning/v3/drafts/${encodeURIComponent(existingDraftId)}?csrf=test`, {
        method: "GET",
        headers: {
          host: REMOTE_HOST,
          origin: EVIL_ORIGIN,
          referer: `${EVIL_ORIGIN}/planning/v3/drafts`,
        },
      }),
      { params: Promise.resolve({ id: existingDraftId }) },
    ));

    await expectOriginMismatch(draftsPOST(requestJson(
      "/api/planning/v3/drafts",
      "POST",
      { csrf: "test", source: { kind: "csv" }, payload: { cashflow: [], draftPatch: {} } },
      "/planning/v3/drafts",
      EVIL_ORIGIN,
    )));

    await expectOriginMismatch(draftPreviewPOST(requestJson(
      "/api/planning/v3/draft/preview",
      "POST",
      { csrf: "test", draftId: existingDraftId, baseProfile: { monthlyIncomeNet: 1, monthlyEssentialExpenses: 1, monthlyDiscretionaryExpenses: 1, liquidAssets: 0, investmentAssets: 0, debts: [], goals: [] } },
      "/planning/v3/drafts",
      EVIL_ORIGIN,
    )));

    await expectOriginMismatch(draftDeleteGET(
      requestJson(
        `/api/planning/v3/drafts/${encodeURIComponent(existingDraftId)}`,
        "DELETE",
        { csrf: "test" },
        "/planning/v3/drafts",
        EVIL_ORIGIN,
      ),
      { params: Promise.resolve({ id: existingDraftId }) },
    ));
  });
});
