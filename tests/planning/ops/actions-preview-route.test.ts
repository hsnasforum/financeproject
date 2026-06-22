import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as actionPreviewPOST } from "../../../src/app/api/ops/actions/preview/route";
import { clearOpsActionPreviewTokensForTests } from "../../../src/lib/ops/actions/previewToken";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;

function localHeaders(host = LOCAL_HOST, csrf = "csrf-token"): HeadersInit {
  const origin = `http://${host}`;
  return {
    host,
    origin,
    referer: `${origin}/ops`,
    cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
    "content-type": "application/json",
  };
}

function writeRunsIndexFixture(count: number) {
  const runsDir = env.PLANNING_RUNS_DIR as string;
  fs.mkdirSync(runsDir, { recursive: true });
  const entries = Array.from({ length: count }, (_, index) => {
    const id = `preview-run-${String(index).padStart(2, "0")}`;
    return {
      id,
      profileId: "preview_profile",
      title: `preview ${id}`,
      createdAt: new Date(Date.UTC(2026, 2, 1, 0, 0, index)).toISOString(),
      snapshot: {
        id: "snapshot-1",
        asOf: "2026-03-01",
      },
      warningsCount: 0,
      criticalCount: 0,
    };
  });

  fs.writeFileSync(
    path.join(runsDir, "index.json"),
    `${JSON.stringify({ version: 1, entries }, null, 2)}\n`,
    "utf-8",
  );
}

describe.sequential("ops actions preview route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-actions-preview-"));
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "0";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    clearOpsActionPreviewTokensForTests();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;
    if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
    else delete env.AUTH_SECRET;
    if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
    else delete env.NEXTAUTH_SECRET;
    clearOpsActionPreviewTokensForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks preview without csrf", async () => {
    const response = await actionPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/actions/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        actionId: "RUNS_CLEANUP",
      }),
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });

  it("blocks preview from non-local host", async () => {
    const response = await actionPreviewPOST(new Request(`${REMOTE_ORIGIN}/api/ops/actions/preview`, {
      method: "POST",
      headers: localHeaders(REMOTE_HOST),
      body: JSON.stringify({
        csrf: "csrf-token",
        actionId: "RUNS_CLEANUP",
      }),
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("blocks preview without a planning auth signal when fallback is not explicit", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";

    const response = await actionPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/actions/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        actionId: "RUNS_CLEANUP",
      }),
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe("UNAUTHENTICATED");
  });

  it("caps preview sampleIds to 20", async () => {
    writeRunsIndexFixture(28);

    const response = await actionPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/actions/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        actionId: "RUNS_CLEANUP",
        params: {
          keepCount: 1,
          keepDays: 3650,
        },
      }),
    }));

    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        summary?: {
          sampleIds?: string[];
          truncated?: boolean;
        };
      };
      meta?: {
        userId?: string;
        authSource?: string;
      };
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.meta).toEqual({
      userId: "default",
      authSource: "local-namespace",
    });
    expect(Array.isArray(payload.data?.summary?.sampleIds)).toBe(true);
    expect(payload.data?.summary?.sampleIds?.length).toBeLessThanOrEqual(20);
    expect(payload.data?.summary?.truncated).toBe(true);
  });
});
