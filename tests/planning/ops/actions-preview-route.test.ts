import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as actionPreviewPOST } from "../../../src/app/api/ops/actions/preview/route";
import { createRun } from "../../../src/lib/planning/server/store/runStore";
import { clearOpsActionPreviewTokensForTests } from "../../../src/lib/ops/actions/previewToken";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;

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

describe.sequential("ops actions preview route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-actions-preview-"));
    env.NODE_ENV = "test";
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    clearOpsActionPreviewTokensForTests();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
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

  it("caps preview sampleIds to 20", async () => {
    for (let index = 0; index < 28; index += 1) {
      const id = `preview-run-${String(index).padStart(2, "0")}`;
      await createRun({
        id,
        profileId: "preview_profile",
        title: `preview ${id}`,
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
    }

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
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data?.summary?.sampleIds)).toBe(true);
    expect(payload.data?.summary?.sampleIds?.length).toBeLessThanOrEqual(20);
    expect(payload.data?.summary?.truncated).toBe(true);
  });
});

