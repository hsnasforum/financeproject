import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as preflightPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/preflight/route";
import { createProfile } from "../src/lib/planning/store/profileStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:5010";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestPost(pathname: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
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

describe("POST /api/planning/v3/profile/drafts/[id]/preflight", () => {
  let root = "";
  let draftId = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-draft-preflight-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;

    draftId = "d_preflight_api";
    const draftsDir = path.join(root, "planning-v3", "drafts");
    fs.mkdirSync(draftsDir, { recursive: true });
    fs.writeFileSync(path.join(draftsDir, `${draftId}.json`), JSON.stringify({
      id: draftId,
      batchId: "b_1",
      createdAt: "2026-03-03T00:00:00.000Z",
      draftPatch: {
        monthlyIncomeNet: 2_700_000,
        monthlyEssentialExpenses: 1_100_000,
        monthlyDiscretionaryExpenses: 420_000,
        assumptions: ["deterministic preflight"],
        monthsConsidered: 3,
      },
      evidence: {
        monthsUsed: ["2026-01", "2026-02", "2026-03"],
      },
      assumptions: ["deterministic preflight"],
      stats: {
        months: 3,
        transfersExcluded: true,
      },
    }, null, 2));
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns 404 when draft does not exist", async () => {
    const id = "missing_draft";
    const response = await preflightPOST(
      requestPost(`/api/planning/v3/profile/drafts/${encodeURIComponent(id)}/preflight`, { csrf: "test" }),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(404);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("NO_DATA");
  });

  it("supports preflight with and without profileId", async () => {
    const withoutProfile = await preflightPOST(
      requestPost(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/preflight`, { csrf: "test" }),
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(withoutProfile.status).toBe(200);
    const payloadWithout = await withoutProfile.json() as {
      ok?: boolean;
      data?: { targetProfileId?: string; summary?: { changedCount?: number }; warnings?: Array<{ code?: string }> };
    };
    expect(payloadWithout.ok).toBe(true);
    expect(payloadWithout.data?.targetProfileId).toBeUndefined();
    expect(payloadWithout.data?.summary?.changedCount).toBeGreaterThan(0);
    expect((payloadWithout.data?.warnings ?? []).some((row) => row.code === "NO_BASE_PROFILE")).toBe(true);

    const created = await createProfile({
      name: "preflight-target",
      profile: {
        monthlyIncomeNet: 2_200_000,
        monthlyEssentialExpenses: 1_000_000,
        monthlyDiscretionaryExpenses: 300_000,
        liquidAssets: 1_000_000,
        investmentAssets: 500_000,
        debts: [],
        goals: [],
      },
    });

    const withProfile = await preflightPOST(
      requestPost(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/preflight`, {
        csrf: "test",
        profileId: created.id,
      }),
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(withProfile.status).toBe(200);
    const payloadWith = await withProfile.json() as { ok?: boolean; data?: { targetProfileId?: string } };
    expect(payloadWith.ok).toBe(true);
    expect(payloadWith.data?.targetProfileId).toBe(created.id);
  });

  it("returns 404 when profileId is provided but profile does not exist", async () => {
    const response = await preflightPOST(
      requestPost(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/preflight`, {
        csrf: "test",
        profileId: "missing_profile",
      }),
      { params: Promise.resolve({ id: draftId }) },
    );

    expect(response.status).toBe(404);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("NO_DATA");
  });

  it("does not include forbidden raw keys in response shape", async () => {
    const response = await preflightPOST(
      requestPost(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}/preflight`, { csrf: "test" }),
      { params: Promise.resolve({ id: draftId }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    const keys = collectKeys(payload).join("\n").toLowerCase();
    expect(keys.includes("description")).toBe(false);
    expect(keys.includes("desc")).toBe(false);
    expect(keys.includes("merchant")).toBe(false);
    expect(keys.includes("rawline")).toBe(false);
    expect(keys.includes("originalcsv")).toBe(false);
    expect(keys.includes("memo")).toBe(false);
  });
});

