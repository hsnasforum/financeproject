import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as applyPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/apply/route";
import { createProfile, getProfile } from "../src/lib/planning/store/profileStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4120";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestPost(
  pathname: string,
  body: unknown,
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererOrigin?: string;
  },
): Request {
  const requestOrigin = options?.requestOrigin ?? LOCAL_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${requestOrigin}${pathname}`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${refererOrigin}/planning/v3/profile/drafts`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as { ok?: boolean; error?: { code?: string } };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

function writeDraft(root: string, id: string, patch: Record<string, unknown>) {
  const draftsDir = path.join(root, "planning-v3", "drafts");
  fs.mkdirSync(draftsDir, { recursive: true });
  fs.writeFileSync(path.join(draftsDir, `${id}.json`), JSON.stringify({
    id,
    batchId: "b_apply",
    createdAt: "2026-03-03T00:00:00.000Z",
    draftPatch: patch,
    evidence: {
      monthsUsed: ["2026-01", "2026-02", "2026-03"],
    },
    assumptions: ["apply test"],
    stats: {
      months: 3,
      transfersExcluded: true,
      unassignedCount: 0,
    },
  }, null, 2));
}

describe("POST /api/planning/v3/profile/drafts/[id]/apply", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-profile-draft-apply-api-"));
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

  it("returns 404 NO_DATA when draft does not exist", async () => {
    const draftId = "missing_draft";
    const response = await applyPOST(
      requestPost(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/apply`, { csrf: "test" }),
      { params: Promise.resolve({ id: draftId }) },
    );

    expect(response.status).toBe(404);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("NO_DATA");
  });

  it("creates a new v2 profile from draft without base profile", async () => {
    const draftId = "d_apply_no_base";
    writeDraft(root, draftId, {
      monthlyIncomeNet: 3_200_000,
      monthlyEssentialExpenses: 1_300_000,
      monthlyDiscretionaryExpenses: 500_000,
      assumptions: ["from draft"],
      monthsConsidered: 3,
    });

    const response = await applyPOST(
      requestPost(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/apply`, { csrf: "test" }),
      { params: Promise.resolve({ id: draftId }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: { profileId?: string };
    };
    expect(payload.ok).toBe(true);
    expect(typeof payload.data?.profileId).toBe("string");
    expect(payload.data?.profileId?.length).toBeGreaterThan(0);

    const createdProfile = await getProfile(payload.data?.profileId ?? "");
    expect(createdProfile).not.toBeNull();
    expect(createdProfile?.profile.monthlyIncomeNet).toBe(3_200_000);
    expect(createdProfile?.profile.monthlyEssentialExpenses).toBe(1_300_000);
    expect(createdProfile?.profile.monthlyDiscretionaryExpenses).toBe(500_000);
    expect(createdProfile?.profile.liquidAssets).toBe(0);
    expect(createdProfile?.profile.investmentAssets).toBe(0);
    expect(createdProfile?.profile.debts).toEqual([]);
    expect(createdProfile?.profile.goals).toEqual([]);
  });

  it("creates a new profile from base profile while preserving non-patched fields", async () => {
    const base = await createProfile({
      name: "base-profile",
      profile: {
        monthlyIncomeNet: 2_000_000,
        monthlyEssentialExpenses: 1_000_000,
        monthlyDiscretionaryExpenses: 300_000,
        liquidAssets: 7_000_000,
        investmentAssets: 2_500_000,
        debts: [
          {
            id: "debt-1",
            name: "loan",
            balance: 10_000_000,
            minimumPayment: 300_000,
            aprPct: 4.5,
          },
        ],
        goals: [
          {
            id: "goal-1",
            name: "비상금",
            targetAmount: 5_000_000,
            targetMonth: 24,
          },
        ],
      },
    });

    const draftId = "d_apply_with_base";
    writeDraft(root, draftId, {
      monthlyIncomeNet: 3_500_000,
      monthlyEssentialExpenses: 1_600_000,
      monthlyDiscretionaryExpenses: 600_000,
      assumptions: ["from draft"],
      monthsConsidered: 4,
    });

    const response = await applyPOST(
      requestPost(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/apply`, {
        csrf: "test",
        profileId: base.id,
      }),
      { params: Promise.resolve({ id: draftId }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { ok?: boolean; data?: { profileId?: string } };
    expect(payload.ok).toBe(true);
    expect(payload.data?.profileId).toBeTruthy();
    expect(payload.data?.profileId).not.toBe(base.id);

    const created = await getProfile(payload.data?.profileId ?? "");
    expect(created).not.toBeNull();
    expect(created?.profile.monthlyIncomeNet).toBe(3_500_000);
    expect(created?.profile.monthlyEssentialExpenses).toBe(1_600_000);
    expect(created?.profile.monthlyDiscretionaryExpenses).toBe(600_000);
    expect(created?.profile.liquidAssets).toBe(base.profile.liquidAssets);
    expect(created?.profile.investmentAssets).toBe(base.profile.investmentAssets);
    expect(created?.profile.debts).toEqual(base.profile.debts);
    expect(created?.profile.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      targetMonth: goal.targetMonth,
    }))).toEqual(base.profile.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      targetMonth: goal.targetMonth,
    })));

    const baseAfter = await getProfile(base.id);
    expect(baseAfter?.profile.monthlyIncomeNet).toBe(2_000_000);
    expect(baseAfter?.profile.monthlyEssentialExpenses).toBe(1_000_000);
    expect(baseAfter?.profile.monthlyDiscretionaryExpenses).toBe(300_000);
  });

  it("allows same-origin remote host and still blocks cross-origin", async () => {
    const draftId = "d_apply_remote_host";
    writeDraft(root, draftId, {
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 1_200_000,
      monthlyDiscretionaryExpenses: 450_000,
      assumptions: ["remote host"],
      monthsConsidered: 3,
    });

    const sameOrigin = await applyPOST(
      requestPost(
        `/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/apply`,
        { csrf: "test" },
        { requestOrigin: REMOTE_ORIGIN, host: REMOTE_HOST },
      ),
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(sameOrigin.status).toBe(200);
    const sameOriginPayload = await sameOrigin.json() as {
      ok?: boolean;
      data?: { profileId?: string };
    };
    expect(sameOriginPayload.ok).toBe(true);
    expect(typeof sameOriginPayload.data?.profileId).toBe("string");

    await expectOriginMismatch(applyPOST(
      requestPost(
        `/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/apply`,
        { csrf: "test" },
        {
          requestOrigin: REMOTE_ORIGIN,
          host: REMOTE_HOST,
          origin: EVIL_ORIGIN,
          refererOrigin: EVIL_ORIGIN,
        },
      ),
      { params: Promise.resolve({ id: draftId }) },
    ));
  });
});
