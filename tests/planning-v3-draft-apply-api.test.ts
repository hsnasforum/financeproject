import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as applyDraftPOST } from "../src/app/api/planning/v3/draft/apply/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { createProfile, getProfile } from "../src/lib/planning/store/profileStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3700";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestJson(pathName: string, body: unknown, host = LOCAL_HOST): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${pathName}`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${origin}/planning/v3/transactions`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/planning/v3/draft/apply", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-draft-apply-"));
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

  it("preview returns diffRows and ignores client-sent raw patch", async () => {
    const profile = await createProfile({
      name: "Base",
      profile: {
        monthlyIncomeNet: 1_200_000,
        monthlyEssentialExpenses: 500_000,
        monthlyDiscretionaryExpenses: 300_000,
        liquidAssets: 5_000_000,
        investmentAssets: 3_000_000,
        debts: [],
        goals: [],
      },
    });

    const batch = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-01-10,3000000,salary",
        "2026-01-12,-1000000,월세",
        "2026-02-10,3200000,salary",
        "2026-02-12,-1200000,월세",
        "2026-03-10,3100000,salary",
        "2026-03-12,-900000,식비",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "apply.csv",
    });

    const response = await applyDraftPOST(requestJson("/api/planning/v3/draft/apply", {
      profileId: profile.id,
      batchId: batch.batch.id,
      mode: "preview",
      profilePatch: {
        monthlyIncomeNet: 999_999_999,
      },
    }));

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      profilePatch?: { monthlyIncomeNet?: number };
      diffRows?: Array<{ field?: string; afterKrw?: number }>;
    };

    expect(payload.ok).toBe(true);
    expect(payload.profilePatch?.monthlyIncomeNet).toBe(3_100_000);
    expect((payload.diffRows ?? []).length).toBeGreaterThan(0);
    const incomeDiff = (payload.diffRows ?? []).find((row) => row.field === "monthlyIncomeNet");
    expect(incomeDiff?.afterKrw).toBe(3_100_000);
  });

  it("apply mode is blocked in export-only mode and does not mutate profile", async () => {
    const profile = await createProfile({
      name: "Apply Target",
      profile: {
        monthlyIncomeNet: 1_500_000,
        monthlyEssentialExpenses: 600_000,
        monthlyDiscretionaryExpenses: 300_000,
        liquidAssets: 8_000_000,
        investmentAssets: 2_000_000,
        debts: [],
        goals: [],
      },
    });

    const batch = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-01-10,3000000,salary",
        "2026-01-12,-1000000,월세",
        "2026-02-10,3200000,salary",
        "2026-02-12,-1200000,월세",
        "2026-03-10,3100000,salary",
        "2026-03-12,-900000,식비",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "apply-save.csv",
    });

    const response = await applyDraftPOST(requestJson("/api/planning/v3/draft/apply", {
      profileId: profile.id,
      batchId: batch.batch.id,
      mode: "apply",
    }));

    expect(response.status).toBe(409);
    const payload = await response.json() as {
      ok?: boolean;
      error?: {
        code?: string;
      };
    };

    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("EXPORT_ONLY");

    const saved = await getProfile(profile.id);
    expect(saved).not.toBeNull();
    expect(saved?.profile.monthlyIncomeNet).toBe(1_500_000);
    expect(saved?.profile.monthlyEssentialExpenses).toBe(600_000);
    expect(saved?.profile.monthlyDiscretionaryExpenses).toBe(300_000);
  });

  it("blocks non-local host by local-only guard", async () => {
    const response = await applyDraftPOST(requestJson("/api/planning/v3/draft/apply", {
      profileId: "p1",
      batchId: "b1",
      mode: "preview",
    }, "example.com"));

    expect(response.status).toBe(403);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });
});
