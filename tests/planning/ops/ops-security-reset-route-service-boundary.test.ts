import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as opsSecurityResetPOST } from "../../../src/app/api/ops/security/reset/route";
import { withCurrentPlanningUser } from "../../../src/lib/planning/auth/currentUser";
import {
  configureVaultPassphrase,
  resetVaultRuntimeForTests,
} from "../../../src/lib/planning/security/vaultState";

const ROUTE_FILE = "src/app/api/ops/security/reset/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/planning/server/security/opsSecurityResetRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/planning/security/vaultCsrf",
  "lib/planning/security/vaultReset",
  "lib/planning/security/vaultState",
  "lib/ops/securityAuditLog",
  "consumeVaultCsrfOrThrow(",
  "resetVaultAndPlanningData(",
  "getVaultStatus(",
  "appendOpsAuditEvent(",
  "toClientError(",
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
const PASSPHRASE = "reset-boundary-passphrase";
const RESET_CONFIRM_PHRASE = "RESET VAULT DATA";

type ResetPayload = {
  ok?: boolean;
  data?: {
    configured?: boolean;
    unlocked?: boolean;
  };
  meta?: {
    userId?: string;
    authSource?: string;
    planningNamespaceEnabled?: boolean;
    reset?: {
      keepAudit?: boolean;
      removed?: string[];
    };
  };
};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function buildResetRequest(userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/security/reset`, {
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
      confirmText: RESET_CONFIRM_PHRASE,
      keepAudit: false,
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

describe.sequential("ops security reset route service boundary", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-security-reset-boundary-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, "security", "vault.json");
    env.PLANNING_OPS_AUDIT_PATH = path.join(root, "ops", "audit", "events.ndjson");
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    await resetVaultRuntimeForTests();
  });

  afterEach(async () => {
    restoreEnv();
    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps vault reset, state, csrf, and audit access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });

  it("resets the current planning user namespace", async () => {
    const aliceUserDir = path.join(root, "users", "alice");
    await withCurrentPlanningUser(buildUserRequest("alice"), async () => {
      await configureVaultPassphrase({
        passphrase: PASSPHRASE,
        autoLockMinutes: 30,
      });
    });
    expect(fs.existsSync(aliceUserDir)).toBe(true);

    const response = await opsSecurityResetPOST(buildResetRequest("alice"));
    const payload = await response.json() as ResetPayload;
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      configured: false,
      unlocked: false,
    });
    expect(fs.existsSync(aliceUserDir)).toBe(false);
    expect(setCookie).toContain(`planning_vault_csrf=${CSRF_TOKEN}`);
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
    expect(payload.meta?.reset?.keepAudit).toBe(false);
  });
});
