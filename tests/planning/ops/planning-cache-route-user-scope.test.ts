import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as planningCachePurgePOST } from "../../../src/app/api/ops/planning-cache/purge/route";
import { GET as planningCacheStatsGET } from "../../../src/app/api/ops/planning-cache/stats/route";
import { list as listAuditLog } from "../../../src/lib/audit/auditLogStore";
import { setCache } from "../../../src/lib/planning/cache/storage";
import { runWithPlanningUserScope } from "../../../src/lib/planning/store/userScope";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_CACHE_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "AUDIT_LOG_PATH",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const ROUTE_SERVICE_IMPORT = "@/lib/planning/server/cache/opsRouteService";
const ROUTE_FILES = [
  "src/app/api/ops/planning-cache/stats/route.ts",
  "src/app/api/ops/planning-cache/purge/route.ts",
] as const;
const FORBIDDEN_ROUTE_PATTERNS = [
  "@/lib/audit/auditLogStore",
  "@/lib/planning/cache/storage",
  "@/lib/planning/store/namespace",
  "appendAuditLog(",
  "cacheStats(",
  "getCacheUsageStats(",
  "isPlanningNamespaceEnabled(",
  "purgeExpired(",
] as const;

type ApiPayload = {
  ok?: boolean;
  data?: {
    entries?: {
      total?: number;
      byKind?: Record<string, number>;
    };
    usage?: {
      totalLookups?: number;
      totals?: {
        hits?: number;
        misses?: number;
      };
    };
    purged?: number;
  };
  error?: { code?: string };
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

function localHeaders(userId?: string, csrf = "csrf-token"): Record<string, string> {
  return {
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/ops/planning-cache`,
    cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    "content-type": "application/json",
    ...(userId ? { "x-planning-user-id": userId } : {}),
  };
}

function buildStatsRequest(userId?: string, csrf = "csrf-token"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/planning-cache/stats?csrf=${encodeURIComponent(csrf)}`, {
    method: "GET",
    headers: localHeaders(userId, csrf),
  });
}

function buildLockedStatsRequest(userId?: string, csrf = "csrf-token"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/planning-cache/stats?csrf=${encodeURIComponent(csrf)}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/ops/planning-cache`,
      "content-type": "application/json",
      ...(userId ? { "x-planning-user-id": userId } : {}),
    },
  });
}

function buildPurgeRequest(userId?: string, csrf = "csrf-token"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/planning-cache/purge`, {
    method: "POST",
    headers: localHeaders(userId, csrf),
    body: JSON.stringify({ csrf }),
  });
}

async function writeCacheFixture(input: {
  userId: string;
  kind: "simulate" | "actions";
  keyChar: string;
  expired?: boolean;
}): Promise<string> {
  const key = input.keyChar.repeat(64);
  await runWithPlanningUserScope({ userId: input.userId }, () => setCache({
    version: 1,
    kind: input.kind,
    key,
    createdAt: "2026-02-28T00:00:00.000Z",
    expiresAt: input.expired ? "2000-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z",
    meta: {
      horizonMonths: 120,
      assumptionsHash: "a".repeat(64),
      optionsHash: "b".repeat(64),
    },
    data: { owner: input.userId },
  }));
  return key;
}

describe("ops planning cache routes user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-planning-cache-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    delete env.PLANNING_CACHE_DIR;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps cache storage, namespace, and audit access behind the route service", () => {
    const invalid = ROUTE_FILES.flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const violations = FORBIDDEN_ROUTE_PATTERNS
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${filePath}:${pattern}`);
      return source.includes(ROUTE_SERVICE_IMPORT)
        ? violations
        : [...violations, `${filePath}:missing ${ROUTE_SERVICE_IMPORT}`];
    });

    expect(invalid).toEqual([]);
  });

  it("requires a current planning user before exposing cache stats", async () => {
    const response = await planningCacheStatsGET(buildStatsRequest());
    const payload = await response.json() as ApiPayload;

    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe("UNAUTHENTICATED");
  });

  it("rejects spoofed cache stats trusted headers when the bridge is disabled", async () => {
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    const response = await planningCacheStatsGET(buildStatsRequest("attacker"));
    const payload = await response.json() as ApiPayload;

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("FORBIDDEN");
    expect(JSON.stringify(payload)).not.toContain("attacker");
  });

  it("requires the ops dev unlock before planning route auth on cache stats", async () => {
    env.PLANNING_TRUST_AUTH_HEADERS = "1";

    const response = await planningCacheStatsGET(buildLockedStatsRequest("alice"));
    const payload = await response.json() as ApiPayload;

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("UNAUTHORIZED");
    expect(JSON.stringify(payload)).not.toContain("alice");
  });

  it("returns only the current planning user's cache stats", async () => {
    await writeCacheFixture({ userId: "alice", kind: "simulate", keyChar: "1" });
    await writeCacheFixture({ userId: "bob", kind: "actions", keyChar: "2" });

    const response = await planningCacheStatsGET(buildStatsRequest("alice"));
    const payload = await response.json() as ApiPayload;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
    expect(payload.data?.entries).toMatchObject({
      total: 1,
      byKind: {
        simulate: 1,
        actions: 0,
      },
    });
  });

  it("purges only the current planning user's expired cache entries and audits scope", async () => {
    const aliceExpiredKey = await writeCacheFixture({ userId: "alice", kind: "simulate", keyChar: "3", expired: true });
    const bobExpiredKey = await writeCacheFixture({ userId: "bob", kind: "actions", keyChar: "4", expired: true });

    const response = await planningCachePurgePOST(buildPurgeRequest("alice"));
    const payload = await response.json() as ApiPayload;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.purged).toBe(1);
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });

    expect(fs.existsSync(path.join(root, "users", "alice", "cache", `simulate.${aliceExpiredKey}.json`))).toBe(false);
    expect(fs.existsSync(path.join(root, "users", "bob", "cache", `actions.${bobExpiredKey}.json`))).toBe(true);

    const auditRows = listAuditLog();
    expect(auditRows[0]?.event).toBe("PLANNING_CACHE_PURGE");
    expect(auditRows[0]?.details).toMatchObject({
      result: "SUCCESS",
      purged: 1,
      planningUserId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
  });
});
