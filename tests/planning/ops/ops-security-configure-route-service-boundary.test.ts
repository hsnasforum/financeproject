import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as opsSecurityConfigurePOST } from "../../../src/app/api/ops/security/configure/route";
import { resetVaultRuntimeForTests } from "../../../src/lib/planning/security/vaultState";

const ROUTE_FILE = "src/app/api/ops/security/configure/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/planning/server/security/opsSecurityConfigureRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/planning/security/vaultCsrf",
  "lib/planning/security/vaultState",
  "lib/ops/securityAuditLog",
  "consumeVaultCsrfOrThrow(",
  "configureVaultPassphrase(",
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
const PASSPHRASE = "configure-passphrase";

type ConfigurePayload = {
  ok?: boolean;
  data?: {
    configured?: boolean;
    unlocked?: boolean;
    autoLockMinutes?: number;
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

function buildConfigureRequest(userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/security/configure`, {
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
      passphrase: PASSPHRASE,
      autoLockMinutes: 45,
    }),
  });
}

describe.sequential("ops security configure route service boundary", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-security-configure-"));
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

  it("keeps vault state, csrf, and audit access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });

  it("configures the vault inside the current planning user scope", async () => {
    const response = await opsSecurityConfigurePOST(buildConfigureRequest("alice"));
    const payload = await response.json() as ConfigurePayload;
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      configured: true,
      unlocked: true,
      autoLockMinutes: 45,
    });
    expect(setCookie).toContain(`planning_vault_csrf=${CSRF_TOKEN}`);
    expect(payload.meta).toEqual({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
  });
});
