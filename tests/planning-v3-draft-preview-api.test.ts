import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as draftPreviewPOST } from "../src/app/api/planning/v3/draft/preview/route";
import { createProfile } from "../src/lib/planning/store/profileStore";
import { createDraft } from "../src/lib/planning/v3/draft/store";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3950";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestJson(pathName: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathName}`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/planning/v3/draft/preview", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-draft-preview-"));
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

  it("builds merged profile deterministically for identical baseProfile + patch input", async () => {
    const requestBody = {
      baseProfile: {
        monthlyIncomeNet: 2_100_000,
        monthlyEssentialExpenses: 900_000,
        monthlyDiscretionaryExpenses: 300_000,
        liquidAssets: 2_000_000,
        investmentAssets: 1_000_000,
        debts: [],
        goals: [],
      },
      draftPatch: {
        monthlyIncomeNet: 2_600_000,
        monthlyEssentialExpenses: 1_000_000,
        monthlyDiscretionaryExpenses: 350_000,
        assumptions: ["rule based draft"],
        monthsConsidered: 3,
      },
      evidence: [
        {
          key: "income-median",
          title: "월평균 소득",
          formula: "median(last3)",
          inputs: { months: 3, incomeMedian: 2_600_000 },
          assumption: "sample months=3",
        },
      ],
    };

    const responseA = await draftPreviewPOST(requestJson("/api/planning/v3/draft/preview", requestBody));
    const responseB = await draftPreviewPOST(requestJson("/api/planning/v3/draft/preview", requestBody));

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);

    const payloadA = await responseA.json() as {
      ok?: boolean;
      mergedProfile?: { monthlyIncomeNet?: number; monthlyEssentialExpenses?: number; monthlyDiscretionaryExpenses?: number };
      diffSummary?: { changedKeys?: string[] };
      evidence?: Array<{ key?: string }>;
    };
    const payloadB = await responseB.json() as {
      ok?: boolean;
      mergedProfile?: { monthlyIncomeNet?: number; monthlyEssentialExpenses?: number; monthlyDiscretionaryExpenses?: number };
      diffSummary?: { changedKeys?: string[] };
      evidence?: Array<{ key?: string }>;
    };

    expect(payloadA.ok).toBe(true);
    expect(payloadB.ok).toBe(true);
    expect(payloadA).toStrictEqual(payloadB);
    expect(payloadA.mergedProfile?.monthlyIncomeNet).toBe(2_600_000);
    expect(payloadA.mergedProfile?.monthlyEssentialExpenses).toBe(1_000_000);
    expect(payloadA.mergedProfile?.monthlyDiscretionaryExpenses).toBe(350_000);
    expect(payloadA.diffSummary?.changedKeys).toContain("monthlyIncomeNet");
    expect(payloadA.evidence?.[0]?.key).toBe("income-median");
  });

  it("supports draftId + baseProfileId input", async () => {
    const base = await createProfile({
      name: "preview-base",
      profile: {
        monthlyIncomeNet: 1_900_000,
        monthlyEssentialExpenses: 800_000,
        monthlyDiscretionaryExpenses: 200_000,
        liquidAssets: 1_000_000,
        investmentAssets: 500_000,
        debts: [],
        goals: [],
      },
    });

    const draft = await createDraft({
      source: { kind: "csv", rows: 2, months: 1 },
      cashflow: [
        {
          ym: "2026-03",
          incomeKrw: 2_800_000,
          expenseKrw: -1_300_000,
          netKrw: 1_500_000,
          txCount: 2,
        },
      ],
      draftPatch: {
        monthlyIncomeNet: 2_800_000,
        monthlyEssentialExpenses: 1_000_000,
        monthlyDiscretionaryExpenses: 300_000,
        assumptions: ["from draft store"],
        monthsConsidered: 1,
      },
    });

    const response = await draftPreviewPOST(requestJson("/api/planning/v3/draft/preview", {
      draftId: draft.id,
      baseProfileId: base.id,
    }));

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      mergedProfile?: { monthlyIncomeNet?: number; monthlyEssentialExpenses?: number; monthlyDiscretionaryExpenses?: number };
    };

    expect(payload.ok).toBe(true);
    expect(payload.mergedProfile?.monthlyIncomeNet).toBe(2_800_000);
    expect(payload.mergedProfile?.monthlyEssentialExpenses).toBe(1_000_000);
    expect(payload.mergedProfile?.monthlyDiscretionaryExpenses).toBe(300_000);
  });

  it("returns 400 when neither draftPatch nor draftId is provided", async () => {
    const response = await draftPreviewPOST(requestJson("/api/planning/v3/draft/preview", {
      baseProfile: {
        monthlyIncomeNet: 1,
        monthlyEssentialExpenses: 1,
        monthlyDiscretionaryExpenses: 1,
      },
    }));

    expect(response.status).toBe(400);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });
});
