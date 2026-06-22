import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as opsSecurityLockPOST } from "../../../src/app/api/ops/security/lock/route";
import { POST as opsSecurityUnlockPOST } from "../../../src/app/api/ops/security/unlock/route";
import { withCurrentPlanningUser } from "../../../src/lib/planning/auth/currentUser";
import { configureVaultPassphrase, resetVaultRuntimeForTests } from "../../../src/lib/planning/security/vaultState";

const ROUTE_FILES = [
  "src/app/api/ops/security/lock/route.ts",
  "src/app/api/ops/security/unlock/route.ts",
] as const;
const ROUTE_SERVICE_IMPORT = "lib/planning/server/security/opsSecurityLockRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/planning/security/vaultCsrf",
  "lib/planning/security/vaultState",
  "lib/ops/securityAuditLog",
  "lib/ops/metricsLog",
  "consumeVaultCsrfOrThrow(",
  "lockVault(",
  "unlockVault(",
  "appendOpsAuditEvent(",
  "appendOpsMetricEvent(",
] as const;

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "PLANNING_VAULT_CONFIG_PATH",
  "PLANNING_OPS_AUDIT_PATH",
  "PLANNING_OPS_METRICS_PATH",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const CSRF_TOKEN = "csrf-token";
const PASSPHRASE = "lock-unlock-passphrase";

type SecurityActionPayload = {
  ok?: boolean;
  data?: {
    configured?: boolean;
    unlocked?: boolean;
  };
  meta?: {
    userId?: string;
    authSource?: string;
    planningNamespaceEnabled?: boolean;
  };
};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function buildActionRequest(pathname: string, userId: string, body: Record<string, unknown>): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/ops/security`,
      cookie: `planning_vault_csrf=${CSRF_TOKEN}`,
      "content-type": "application/json",
      "x-planning-user-id": userId,
    },
    body: JSON.stringify({
      csrf: CSRF_TOKEN,
      ...body,
    }),
  });
}

function buildUserRequest(userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}/ops/security`, {
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/ops/security`,
      "x-planning-user-id": userId,
    },
  });
}

describe.sequential("ops security lock/unlock route service boundary", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-security-lock-unlock-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, "security", "vault.json");
    env.PLANNING_OPS_AUDIT_PATH = path.join(root, "ops", "audit", "events.ndjson");
    env.PLANNING_OPS_METRICS_PATH = path.join(root, "ops", "metrics", "events.ndjson");
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    await resetVaultRuntimeForTests();
  });

  afterEach(async () => {
    restoreEnv();
    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps vault state, csrf, audit, and metric access behind the route service", () => {
    const violations = ROUTE_FILES.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      expect(source).toContain(ROUTE_SERVICE_IMPORT);
      return FORBIDDEN_ROUTE_PATTERNS
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${file}:${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it("locks and unlocks inside the current planning user scope", async () => {
    await withCurrentPlanningUser(buildUserRequest("alice"), async () => {
      await configureVaultPassphrase({
        passphrase: PASSPHRASE,
        autoLockMinutes: 30,
      });
    });

    const lockResponse = await opsSecurityLockPOST(buildActionRequest(
      "/api/ops/security/lock",
      "alice",
      {},
    ));
    const lockPayload = await lockResponse.json() as SecurityActionPayload;
    const lockSetCookie = lockResponse.headers.get("set-cookie") ?? "";

    expect(lockResponse.status).toBe(200);
    expect(lockPayload.ok).toBe(true);
    expect(lockPayload.data).toMatchObject({
      configured: true,
      unlocked: false,
    });
    expect(lockSetCookie).toContain(`planning_vault_csrf=${CSRF_TOKEN}`);
    expect(lockPayload.meta).toEqual({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });

    const unlockResponse = await opsSecurityUnlockPOST(buildActionRequest(
      "/api/ops/security/unlock",
      "alice",
      { passphrase: PASSPHRASE },
    ));
    const unlockPayload = await unlockResponse.json() as SecurityActionPayload;
    const unlockSetCookie = unlockResponse.headers.get("set-cookie") ?? "";

    expect(unlockResponse.status).toBe(200);
    expect(unlockPayload.ok).toBe(true);
    expect(unlockPayload.data).toMatchObject({
      configured: true,
      unlocked: true,
    });
    expect(unlockSetCookie).toContain(`planning_vault_csrf=${CSRF_TOKEN}`);
    expect(unlockPayload.meta).toEqual({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
  });
});
