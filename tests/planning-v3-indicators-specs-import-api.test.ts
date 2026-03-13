import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as indicatorsSpecsGET, POST as indicatorsSpecsPOST } from "../src/app/api/planning/v3/indicators/specs/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestGet(pathname: string): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin: REMOTE_ORIGIN,
      referer: `${REMOTE_ORIGIN}/planning/v3/news/settings`,
    },
  });
}

function requestJson(
  pathname: string,
  body: unknown,
  options?: {
    origin?: string;
    refererOrigin?: string;
  },
): Request {
  const origin = options?.origin ?? REMOTE_ORIGIN;
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      host: REMOTE_HOST,
      origin,
      referer: `${refererOrigin}/planning/v3/news/settings`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as { ok?: boolean; error?: { code?: string } };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

describe("planning v3 indicators specs import api", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-indicator-specs-import-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, "planning");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("supports same-origin remote dry-run/apply and persists overrides under env-aware root", async () => {
    const spec = {
      id: "kr_env_apply_series",
      sourceId: "fixture",
      externalId: "fixture://kr_env_apply_series",
      name: "KR Env Apply Series",
      frequency: "M",
      transform: "none",
      enabled: true,
    };

    const dryRunResponse = await indicatorsSpecsPOST(requestJson("/api/planning/v3/indicators/specs", {
      csrf: "test",
      mode: "dry_run",
      specs: [spec],
    }));
    expect(dryRunResponse.status).toBe(200);
    const dryRunPayload = await dryRunResponse.json() as {
      ok?: boolean;
      data?: {
        mode?: string;
        preview?: { createCount?: number };
        applied?: unknown;
      };
    };
    expect(dryRunPayload.ok).toBe(true);
    expect(dryRunPayload.data?.mode).toBe("dry_run");
    expect(dryRunPayload.data?.preview?.createCount).toBe(1);
    expect(dryRunPayload.data?.applied).toBeNull();
    expect(fs.existsSync(path.join(root, "indicators", "specOverrides.json"))).toBe(false);

    const applyResponse = await indicatorsSpecsPOST(requestJson("/api/planning/v3/indicators/specs", {
      csrf: "test",
      mode: "apply",
      specs: [spec],
    }));
    expect(applyResponse.status).toBe(200);
    const applyPayload = await applyResponse.json() as {
      ok?: boolean;
      data?: {
        mode?: string;
        applied?: { overridesCount?: number; effectiveCount?: number } | null;
      };
    };
    expect(applyPayload.ok).toBe(true);
    expect(applyPayload.data?.mode).toBe("apply");
    expect(applyPayload.data?.applied?.overridesCount).toBe(1);
    expect((applyPayload.data?.applied?.effectiveCount ?? 0) > 0).toBe(true);
    expect(fs.existsSync(path.join(root, "indicators", "specOverrides.json"))).toBe(true);

    const getResponse = await indicatorsSpecsGET(requestGet("/api/planning/v3/indicators/specs"));
    expect(getResponse.status).toBe(200);
    const getPayload = await getResponse.json() as {
      ok?: boolean;
      data?: { specs?: Array<{ id?: string }> };
    };
    expect(getPayload.ok).toBe(true);
    expect((getPayload.data?.specs ?? []).some((row) => row.id === "kr_env_apply_series")).toBe(true);
  });

  it("blocks cross-origin import writes", async () => {
    await expectOriginMismatch(indicatorsSpecsPOST(requestJson(
      "/api/planning/v3/indicators/specs",
      {
        csrf: "test",
        mode: "dry_run",
        specs: [],
      },
      {
        origin: EVIL_ORIGIN,
        refererOrigin: EVIL_ORIGIN,
      },
    )));
  });
});
