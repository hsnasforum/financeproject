import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as createProfilePOST } from "../src/app/api/planning/v3/drafts/[id]/create-profile/route";
import { createProfile, listProfileMetas } from "../src/lib/planning/store/profileStore";
import { createDraft } from "../src/lib/planning/v3/drafts/draftStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3500";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestJson(
  pathName: string,
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
  return new Request(`${requestOrigin}${pathName}`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${refererOrigin}/planning/v3/drafts`,
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

  it("allows same-origin remote host and still blocks cross-origin", async () => {
    const draft = await createDraft({
      source: { kind: "csv", filename: "remote-create-profile.csv" },
      monthlyCashflow: [
        { ym: "2026-03", incomeKrw: 3_300_000, expenseKrw: -2_000_000, netKrw: 1_300_000, txCount: 2 },
      ],
      draftPatch: {
        monthlyIncomeNet: 3_300_000,
        monthlyEssentialExpenses: 1_400_000,
        monthlyDiscretionaryExpenses: 600_000,
      },
    });

    const sameOriginResponse = await createProfilePOST(
      requestJson(
        `/api/planning/v3/drafts/${draft.id}/create-profile`,
        { csrf: "test", baseProfileId: "base-id" },
        { requestOrigin: REMOTE_ORIGIN, host: REMOTE_HOST },
      ),
      { params: Promise.resolve({ id: draft.id }) },
    );
    expect(sameOriginResponse.status).toBe(409);
    const sameOriginPayload = await sameOriginResponse.json() as { ok?: boolean; error?: { code?: string } };
    expect(sameOriginPayload.ok).toBe(false);
    expect(sameOriginPayload.error?.code).toBe("EXPORT_ONLY");

    await expectOriginMismatch(createProfilePOST(
      requestJson(
        `/api/planning/v3/drafts/${draft.id}/create-profile`,
        { csrf: "test", baseProfileId: "base-id" },
        {
          requestOrigin: REMOTE_ORIGIN,
          host: REMOTE_HOST,
          origin: EVIL_ORIGIN,
          refererOrigin: EVIL_ORIGIN,
        },
      ),
      { params: Promise.resolve({ id: draft.id }) },
    ));
  });
});
