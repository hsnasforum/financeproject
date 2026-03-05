import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../src/app/api/planning/v3/exposure/profile/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

let root = "";

function requestGet(pathname: string, host = LOCAL_HOST): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: { host },
  });
}

function requestPost(body: unknown, withAuth = true): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/exposure`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/exposure/profile`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("planning v3 exposure api", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-exposure-api-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks non-local GET", async () => {
    const response = await GET(requestGet("/api/planning/v3/exposure/profile", "example.com"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("requires csrf on POST", async () => {
    const response = await POST(requestPost({ profile: {} }, false));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("CSRF_MISMATCH");
  });

  it("writes and reads profile", async () => {
    const save = await POST(requestPost({
      csrf: "csrf-token",
      profile: {
        debt: {
          hasDebt: "yes",
          rateType: "variable",
          repricingHorizon: "short",
        },
      },
    }));
    const saveJson = await save.json() as { ok?: boolean; profile?: { debt?: { rateType?: string } } };
    expect(save.status).toBe(200);
    expect(saveJson.ok).toBe(true);
    expect(saveJson.profile?.debt?.rateType).toBe("variable");

    const get = await GET(requestGet("/api/planning/v3/exposure/profile"));
    const getJson = await get.json() as { ok?: boolean; profile?: { debt?: { hasDebt?: string } } | null };
    expect(get.status).toBe(200);
    expect(getJson.ok).toBe(true);
    expect(getJson.profile?.debt?.hasDebt).toBe("yes");
  });
});
