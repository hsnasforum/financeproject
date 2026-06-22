import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as opsSecurityStatusGET } from "../../../src/app/api/ops/security/status/route";
import { resetVaultRuntimeForTests } from "../../../src/lib/planning/security/vaultState";

const ROUTE_FILE = "src/app/api/ops/security/status/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/planning/server/security/opsSecurityStatusRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/planning/security/vaultCsrf",
  "lib/planning/security/vaultState",
  "getOrCreateVaultCsrfToken(",
  "setVaultCsrfCookie(",
  "getVaultStatus(",
] as const;

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "PLANNING_VAULT_CONFIG_PATH",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type SecurityStatusPayload = {
  ok?: boolean;
  data?: {
    configured?: boolean;
    unlocked?: boolean;
  };
  csrfToken?: string;
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

function buildStatusRequest(userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/security/status`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/ops/security`,
      "x-planning-user-id": userId,
    },
  });
}

describe("ops security status route service boundary", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-security-status-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, "security", "vault.json");
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    await resetVaultRuntimeForTests();
  });

  afterEach(async () => {
    restoreEnv();
    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps vault state and csrf access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });

  it("returns current-user metadata and a vault csrf cookie through the service boundary", async () => {
    const response = await opsSecurityStatusGET(buildStatusRequest("alice"));
    const payload = await response.json() as SecurityStatusPayload;
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      configured: false,
      unlocked: false,
    });
    expect(payload.csrfToken).toEqual(expect.any(String));
    expect(setCookie).toContain(`planning_vault_csrf=${payload.csrfToken}`);
    expect(payload.meta).toEqual({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
  });
});
