import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as createProfilePOST } from "../src/app/api/planning/v3/drafts/[id]/create-profile/route";
import { createProfile, listProfileMetas } from "../src/lib/planning/store/profileStore";
import { createDraft } from "../src/lib/planning/v3/store/draftStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3500";
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

describe("POST /api/planning/v3/drafts/[id]/create-profile", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-create-profile-"));
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

  it("returns export-only error and does not create profile", async () => {
    const base = await createProfile({
      name: "Base",
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

    const response = await createProfilePOST(
      requestJson(`/api/planning/v3/drafts/${draft.id}/create-profile`, {
        baseProfileId: base.id,
      }),
      { params: Promise.resolve({ id: draft.id }) },
    );

    expect(response.status).toBe(409);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("EXPORT_ONLY");

    const metas = await listProfileMetas();
    expect(metas.some((row) => row.profileId !== base.id)).toBe(false);
  });
});
