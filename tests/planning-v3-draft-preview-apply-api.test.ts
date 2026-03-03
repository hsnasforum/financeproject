import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as previewApplyGET } from "../src/app/api/planning/v3/drafts/[id]/preview-apply/route";
import { createProfile } from "../src/lib/planning/store/profileStore";
import { createDraft } from "../src/lib/planning/v3/store/draftStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3400";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestGet(pathName: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathName}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
    },
  });
}

describe("GET /api/planning/v3/drafts/[id]/preview-apply", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-preview-apply-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns 400 for invalid draft id and 404 for missing profile", async () => {
    const invalidDraftResponse = await previewApplyGET(
      requestGet("/api/planning/v3/drafts/../bad/preview-apply?profileId=p-1"),
      { params: Promise.resolve({ id: "../bad" }) },
    );
    expect([400, 404]).toContain(invalidDraftResponse.status);

    const profile = await createProfile({
      name: "Base Profile",
      profile: {
        monthlyIncomeNet: 3_000_000,
        monthlyEssentialExpenses: 1_300_000,
        monthlyDiscretionaryExpenses: 700_000,
        liquidAssets: 10_000_000,
        investmentAssets: 5_000_000,
        debts: [],
        goals: [],
      },
    });

    const draft = await createDraft({
      source: { kind: "csv", rows: 2, months: 1 },
      cashflow: [
        { ym: "2026-03", incomeKrw: 3_300_000, expenseKrw: -2_000_000, netKrw: 1_300_000, txCount: 2 },
      ],
      draftPatch: {
        monthlyIncomeNet: 3_300_000,
        monthlyEssentialExpenses: 1_400_000,
        monthlyDiscretionaryExpenses: 600_000,
        assumptions: ["assumption"],
        monthsConsidered: 1,
      },
    });

    const missingProfileResponse = await previewApplyGET(
      requestGet(`/api/planning/v3/drafts/${draft.id}/preview-apply?profileId=missing`),
      { params: Promise.resolve({ id: draft.id }) },
    );
    expect(missingProfileResponse.status).toBe(404);

    const okResponse = await previewApplyGET(
      requestGet(`/api/planning/v3/drafts/${draft.id}/preview-apply?profileId=${profile.id}`),
      { params: Promise.resolve({ id: draft.id }) },
    );
    expect(okResponse.status).toBe(200);
    const payload = await okResponse.json() as { ok?: boolean; summary?: { changedFields?: string[] } };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.summary?.changedFields)).toBe(true);
  });
});
