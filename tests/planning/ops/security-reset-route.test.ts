import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as securityResetPOST } from "../../../src/app/api/ops/security/reset/route";
import { saveAssumptionsSnapshotToHistory, saveLatestAssumptionsSnapshot } from "../../../src/lib/planning/assumptions/storage";
import { appendOpsAuditEvent } from "../../../src/lib/ops/securityAuditLog";
import { configureVaultPassphrase, resetVaultRuntimeForTests } from "../../../src/lib/planning/security/vaultState";
import { createProfile } from "../../../src/lib/planning/store/profileStore";
import { createRun } from "../../../src/lib/planning/store/runStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
const originalVaultConfigPath = process.env.PLANNING_VAULT_CONFIG_PATH;
const originalOpsAuditPath = process.env.PLANNING_OPS_AUDIT_PATH;
const originalProfileMetaPath = process.env.PLANNING_PROFILE_META_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;

const RESET_CONFIRM_PHRASE = "RESET VAULT DATA";

function profileFixture() {
  return {
    schemaVersion: 2,
    monthlyIncomeNet: 4_500_000,
    monthlyEssentialExpenses: 1_900_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 2_000_000,
    investmentAssets: 3_000_000,
    debts: [],
    goals: [],
  };
}

function buildCookie(csrf = "csrf-token"): string {
  return `planning_vault_csrf=${csrf}`;
}

function localHeaders(csrf = "csrf-token", host = LOCAL_HOST): HeadersInit {
  const origin = `http://${host}`;
  return {
    host,
    origin,
    referer: `${origin}/ops/security`,
    cookie: buildCookie(csrf),
    "content-type": "application/json",
  };
}

describe.sequential("ops security reset API", () => {
  let root = "";
  let profilesDir = "";
  let runsDir = "";
  let assumptionsPath = "";
  let assumptionsHistoryDir = "";
  let vaultConfigPath = "";
  let opsAuditPath = "";
  let profileMetaPath = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-security-reset-"));
    profilesDir = path.join(root, "profiles");
    runsDir = path.join(root, "runs");
    assumptionsPath = path.join(root, "assumptions.latest.json");
    assumptionsHistoryDir = path.join(root, "assumptions", "history");
    vaultConfigPath = path.join(root, "security", "vault.json");
    opsAuditPath = path.join(root, "ops", "audit", "events.ndjson");
    profileMetaPath = path.join(root, "vault", "profiles.meta.json");

    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = profilesDir;
    env.PLANNING_RUNS_DIR = runsDir;
    env.PLANNING_ASSUMPTIONS_PATH = assumptionsPath;
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = assumptionsHistoryDir;
    env.PLANNING_VAULT_CONFIG_PATH = vaultConfigPath;
    env.PLANNING_OPS_AUDIT_PATH = opsAuditPath;
    env.PLANNING_PROFILE_META_PATH = profileMetaPath;

    await configureVaultPassphrase({
      passphrase: "reset-passphrase",
      autoLockMinutes: 30,
    });

    await createProfile({
      name: "reset profile",
      profile: profileFixture(),
    });

    await createRun({
      id: "reset-run-1",
      profileId: "reset_profile",
      title: "reset run",
      input: {
        horizonMonths: 12,
      },
      meta: {
        snapshot: {
          id: "snapshot-1",
          asOf: "2026-03-01",
          fetchedAt: "2026-03-01T00:00:00.000Z",
        },
        health: {
          warningsCodes: [],
          criticalCount: 0,
        },
      },
      outputs: {},
    }, { enforceRetention: false });

    const snapshot = {
      version: 1 as const,
      schemaVersion: 2 as const,
      asOf: "2026-03-01",
      fetchedAt: "2026-03-01T00:00:00.000Z",
      korea: {
        baseRatePct: 3.5,
      },
      sources: [
        {
          name: "ecos",
          url: "https://ecos.bok.or.kr",
          fetchedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      warnings: [],
    };
    await saveLatestAssumptionsSnapshot(snapshot);
    await saveAssumptionsSnapshotToHistory(snapshot);
    await appendOpsAuditEvent({
      eventType: "VAULT_TEST_EVENT",
      meta: { test: true },
    });
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalAssumptionsPath === "string") env.PLANNING_ASSUMPTIONS_PATH = originalAssumptionsPath;
    else delete env.PLANNING_ASSUMPTIONS_PATH;
    if (typeof originalAssumptionsHistoryDir === "string") env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalAssumptionsHistoryDir;
    else delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
    if (typeof originalVaultConfigPath === "string") env.PLANNING_VAULT_CONFIG_PATH = originalVaultConfigPath;
    else delete env.PLANNING_VAULT_CONFIG_PATH;
    if (typeof originalOpsAuditPath === "string") env.PLANNING_OPS_AUDIT_PATH = originalOpsAuditPath;
    else delete env.PLANNING_OPS_AUDIT_PATH;
    if (typeof originalProfileMetaPath === "string") env.PLANNING_PROFILE_META_PATH = originalProfileMetaPath;
    else delete env.PLANNING_PROFILE_META_PATH;
    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("wipes vault/planning storage and can remove audit logs", async () => {
    const response = await securityResetPOST(new Request(`${LOCAL_ORIGIN}/api/ops/security/reset`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        confirmText: RESET_CONFIRM_PHRASE,
        keepAudit: false,
      }),
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: { configured?: boolean; unlocked?: boolean };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.configured).toBe(false);
    expect(payload.data?.unlocked).toBe(false);

    await expect(fs.promises.access(profilesDir)).rejects.toBeDefined();
    await expect(fs.promises.access(runsDir)).rejects.toBeDefined();
    await expect(fs.promises.access(assumptionsPath)).rejects.toBeDefined();
    await expect(fs.promises.access(assumptionsHistoryDir)).rejects.toBeDefined();
    await expect(fs.promises.access(vaultConfigPath)).rejects.toBeDefined();
    await expect(fs.promises.access(opsAuditPath)).rejects.toBeDefined();
  });

  it("blocks reset without csrf", async () => {
    const response = await securityResetPOST(new Request(`${LOCAL_ORIGIN}/api/ops/security/reset`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        confirmText: RESET_CONFIRM_PHRASE,
      }),
    }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });

  it("blocks reset from non-local host", async () => {
    const response = await securityResetPOST(new Request(`${REMOTE_ORIGIN}/api/ops/security/reset`, {
      method: "POST",
      headers: localHeaders("csrf-token", REMOTE_HOST),
      body: JSON.stringify({
        csrf: "csrf-token",
        confirmText: RESET_CONFIRM_PHRASE,
      }),
    }));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });
});
