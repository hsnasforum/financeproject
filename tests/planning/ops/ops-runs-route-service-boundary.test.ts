import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as opsRunDELETE } from "../../../src/app/api/ops/runs/[runId]/route";
import { POST as opsRunsCleanupPOST } from "../../../src/app/api/ops/runs/cleanup/route";
import { GET as opsRunsGET } from "../../../src/app/api/ops/runs/route";
import { createRun, getRun } from "../../../src/lib/planning/store/runStore";
import { runWithPlanningUserScope } from "../../../src/lib/planning/store/userScope";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "PLANNING_OPS_AUDIT_PATH",
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
const ROUTE_SERVICE_IMPORT = "lib/planning/server/runs/opsRouteService";
const ROUTE_FILES = [
  "src/app/api/ops/runs/route.ts",
  "src/app/api/ops/runs/[runId]/route.ts",
  "src/app/api/ops/runs/cleanup/route.ts",
] as const;
const FORBIDDEN_ROUTE_PATTERNS = [
  "auditLogStore",
  "appendOpsAuditEvent",
  "planning/server/store/runStore",
  "planning/store/namespace",
  "planRunsRetention",
  "deleteRun(",
  "isPlanningNamespaceEnabled(",
  "listRunIndexEntries(",
] as const;

type ApiPayload = {
  ok?: boolean;
  data?: Array<{ id?: string; title?: string }> | Record<string, unknown>;
  error?: { code?: string };
  meta?: {
    userId?: string;
    authSource?: string;
    planningNamespaceEnabled?: boolean;
    total?: number;
  };
};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function localHeaders(userId: string, csrf = "csrf-token"): Record<string, string> {
  return {
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/ops/runs`,
    cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    "content-type": "application/json",
    "x-planning-user-id": userId,
  };
}

function buildRunsRequest(userId: string, csrf = "csrf-token"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/runs?csrf=${encodeURIComponent(csrf)}`, {
    method: "GET",
    headers: localHeaders(userId, csrf),
  });
}

function buildDeleteRequest(userId: string, runId: string, csrf = "csrf-token"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/runs/${encodeURIComponent(runId)}`, {
    method: "DELETE",
    headers: localHeaders(userId, csrf),
    body: JSON.stringify({ csrf }),
  });
}

function buildCleanupRequest(userId: string, body: Record<string, unknown>, csrf = "csrf-token"): Request {
  return new Request(`${LOCAL_ORIGIN}/api/ops/runs/cleanup`, {
    method: "POST",
    headers: localHeaders(userId, csrf),
    body: JSON.stringify({ csrf, ...body }),
  });
}

async function writeRunFixture(input: {
  userId: string;
  id: string;
  title: string;
  createdAt: string;
}): Promise<void> {
  await runWithPlanningUserScope({ userId: input.userId }, () => createRun({
    id: input.id,
    profileId: "profile-1",
    title: input.title,
    createdAt: input.createdAt,
    overallStatus: "SUCCESS",
    input: {
      horizonMonths: 1,
    },
    meta: {
      snapshot: {
        id: `snapshot-${input.id}`,
        asOf: "2026-03-01",
      },
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: {},
  }, {
    enforceRetention: false,
  }));
}

async function readRunFixture(userId: string, runId: string) {
  return runWithPlanningUserScope({ userId }, () => getRun(runId));
}

describe("ops runs route service boundary", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-runs-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    env.PLANNING_OPS_AUDIT_PATH = path.join(root, "ops-audit.ndjson");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps run store, namespace, retention, and audit access behind the route service", () => {
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

  it("lists only the current planning user's ops runs", async () => {
    await writeRunFixture({
      userId: "alice",
      id: "alice-run",
      title: "Alice run",
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    await writeRunFixture({
      userId: "bob",
      id: "bob-run",
      title: "Bob run",
      createdAt: "2026-03-01T00:00:00.000Z",
    });

    const response = await opsRunsGET(buildRunsRequest("alice"));
    const payload = await response.json() as ApiPayload;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
      total: 1,
    });
    expect(Array.isArray(payload.data) ? payload.data.map((row) => row.id) : []).toEqual(["alice-run"]);
  });

  it("deletes only the current planning user's target run", async () => {
    await writeRunFixture({
      userId: "alice",
      id: "alice-delete",
      title: "Alice delete",
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    await writeRunFixture({
      userId: "bob",
      id: "bob-delete",
      title: "Bob delete",
      createdAt: "2026-03-01T00:00:00.000Z",
    });

    const response = await opsRunDELETE(
      buildDeleteRequest("alice", "alice-delete"),
      { params: Promise.resolve({ runId: "alice-delete" }) },
    );
    const payload = await response.json() as ApiPayload;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      id: "alice-delete",
      deleted: true,
    });
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
    expect(await readRunFixture("alice", "alice-delete")).toBeNull();
    expect(await readRunFixture("bob", "bob-delete")).not.toBeNull();
  });

  it("cleans up only the current planning user's stale runs", async () => {
    await writeRunFixture({
      userId: "alice",
      id: "alice-old",
      title: "Alice old",
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    await writeRunFixture({
      userId: "alice",
      id: "alice-new",
      title: "Alice new",
      createdAt: "2099-01-01T00:00:00.000Z",
    });
    await writeRunFixture({
      userId: "bob",
      id: "bob-old",
      title: "Bob old",
      createdAt: "2000-01-01T00:00:00.000Z",
    });

    const response = await opsRunsCleanupPOST(buildCleanupRequest("alice", {
      keepDays: 1,
      keepCount: 10,
      dryRun: false,
    }));
    const payload = await response.json() as ApiPayload;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      dryRun: false,
      plannedDelete: 1,
      deleted: 1,
      failed: [],
    });
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
      planningNamespaceEnabled: true,
    });
    expect(await readRunFixture("alice", "alice-old")).toBeNull();
    expect(await readRunFixture("alice", "alice-new")).not.toBeNull();
    expect(await readRunFixture("bob", "bob-old")).not.toBeNull();
  });
});
