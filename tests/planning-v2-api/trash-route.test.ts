import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as trashDELETE, GET as trashGET } from "../../src/app/api/planning/v2/trash/route";
import { POST as trashRestorePOST } from "../../src/app/api/planning/v2/trash/restore/route";
import { POST as trashEmptyPOST } from "../../src/app/api/planning/v2/trash/empty/route";
import { buildConfirmString } from "../../src/lib/ops/confirm";
import { createProfile, deleteProfile, getProfile } from "../../src/lib/planning/store/profileStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalReportsDir = process.env.PLANNING_REPORTS_DIR;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function profileFixture() {
  return {
    monthlyIncomeNet: 3_600_000,
    monthlyEssentialExpenses: 1_400_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 800_000,
    investmentAssets: 2_200_000,
    debts: [],
    goals: [],
  };
}

function buildGetRequest(urlPath: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/trash`,
    },
  });
}

function buildJsonRequest(method: string, urlPath: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/trash`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning trash routes", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-trash-routes-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_REPORTS_DIR = path.join(root, "reports");
    env.PLANNING_TRASH_DIR = path.join(root, "trash");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalReportsDir === "string") env.PLANNING_REPORTS_DIR = originalReportsDir;
    else delete env.PLANNING_REPORTS_DIR;
    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;
    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("lists/restores/permanently deletes/empties trash with confirm checks", async () => {
    const profile = await createProfile({
      name: "trash profile",
      profile: profileFixture(),
    });
    await deleteProfile(profile.id);
    expect(await getProfile(profile.id)).toBeNull();

    const listRes = await trashGET(buildGetRequest("/api/planning/v2/trash?kind=profiles&limit=20"));
    const listPayload = await listRes.json() as {
      ok?: boolean;
      data?: Array<{ kind?: string; id?: string }>;
    };
    expect(listRes.status).toBe(200);
    expect(listPayload.ok).toBe(true);
    expect((listPayload.data ?? []).some((item) => item.kind === "profiles" && item.id === profile.id)).toBe(true);

    const mismatchRes = await trashRestorePOST(buildJsonRequest("POST", "/api/planning/v2/trash/restore", {
      kind: "profiles",
      id: profile.id,
      confirmText: "RESTORE profiles wrong",
    }));
    const mismatchPayload = await mismatchRes.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(mismatchRes.status).toBe(400);
    expect(mismatchPayload.ok).toBe(false);
    expect(mismatchPayload.error?.code).toBe("CONFIRM_MISMATCH");

    const restoreRes = await trashRestorePOST(buildJsonRequest("POST", "/api/planning/v2/trash/restore", {
      kind: "profiles",
      id: profile.id,
      confirmText: buildConfirmString("RESTORE profiles", profile.id),
    }));
    const restorePayload = await restoreRes.json() as {
      ok?: boolean;
      data?: { restored?: boolean };
    };
    expect(restoreRes.status).toBe(200);
    expect(restorePayload.ok).toBe(true);
    expect(restorePayload.data?.restored).toBe(true);
    expect(await getProfile(profile.id)).not.toBeNull();

    await deleteProfile(profile.id);
    const hardDeleteRes = await trashDELETE(buildJsonRequest("DELETE", "/api/planning/v2/trash", {
      kind: "profiles",
      id: profile.id,
      confirmText: buildConfirmString("DELETE profiles", profile.id),
    }));
    const hardDeletePayload = await hardDeleteRes.json() as {
      ok?: boolean;
      data?: { deleted?: boolean };
    };
    expect(hardDeleteRes.status).toBe(200);
    expect(hardDeletePayload.ok).toBe(true);
    expect(hardDeletePayload.data?.deleted).toBe(true);

    await deleteProfile((await createProfile({
      name: "trash profile 2",
      profile: profileFixture(),
    })).id);

    const emptyRes = await trashEmptyPOST(buildJsonRequest("POST", "/api/planning/v2/trash/empty", {
      kind: "profiles",
      confirmText: buildConfirmString("EMPTY_TRASH", "profiles"),
    }));
    const emptyPayload = await emptyRes.json() as {
      ok?: boolean;
      data?: { deleted?: number };
    };
    expect(emptyRes.status).toBe(200);
    expect(emptyPayload.ok).toBe(true);
    expect((emptyPayload.data?.deleted ?? 0)).toBeGreaterThan(0);
  });
});
