import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as alertRulesGET, POST as alertRulesPOST } from "../src/app/api/planning/v3/news/alerts/rules/route";
import { resolveAlertRulesOverridePath } from "../src/lib/news/alerts";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestGet(pathname: string, options?: { origin?: string; refererOrigin?: string }): Request {
  const origin = options?.origin ?? REMOTE_ORIGIN;
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin,
      referer: `${refererOrigin}/planning/v3/news/settings`,
    },
  });
}

function requestPost(
  pathname: string,
  body: unknown,
  options?: { origin?: string; refererOrigin?: string },
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

describe("planning v3 news alert rules api", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-news-alert-rules-"));
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

  it("allows same-origin remote host GET/POST and persists overrides under env-aware root", async () => {
    const getResponse = await alertRulesGET(requestGet("/api/planning/v3/news/alerts/rules"));
    expect(getResponse.status).toBe(200);
    const getPayload = await getResponse.json() as {
      ok?: boolean;
      data?: {
        updatedAt?: string | null;
        defaults?: { rules?: Array<{ id?: string; enabled?: boolean }> };
        overrides?: { updatedAt?: string | null; rules?: Array<{ id?: string; enabled?: boolean }> };
        effective?: Array<{ id?: string; enabled?: boolean }>;
      };
    };
    expect(getPayload.ok).toBe(true);
    expect((getPayload.data?.defaults?.rules ?? []).length).toBeGreaterThan(0);
    expect((getPayload.data?.effective ?? []).length).toBeGreaterThan(0);
    expect(getPayload.data?.updatedAt ?? null).toBeNull();

    const targetRuleId = getPayload.data?.effective?.[0]?.id;
    expect(typeof targetRuleId).toBe("string");

    const postResponse = await alertRulesPOST(requestPost("/api/planning/v3/news/alerts/rules", {
      csrf: "test",
      rules: [{ id: targetRuleId, enabled: false }],
    }));
    expect(postResponse.status).toBe(200);
    const postPayload = await postResponse.json() as {
      ok?: boolean;
      data?: {
        updatedAt?: string | null;
        overrides?: { updatedAt?: string | null; rules?: Array<{ id?: string; enabled?: boolean }> };
        effective?: Array<{ id?: string; enabled?: boolean }>;
      };
    };
    expect(postPayload.ok).toBe(true);
    expect(typeof postPayload.data?.updatedAt).toBe("string");
    expect(postPayload.data?.updatedAt).toBe(postPayload.data?.overrides?.updatedAt);
    expect((postPayload.data?.overrides?.rules ?? []).some((row) => row.id === targetRuleId && row.enabled === false)).toBe(true);
    expect((postPayload.data?.effective ?? []).some((row) => row.id === targetRuleId && row.enabled === false)).toBe(true);

    const overridePath = resolveAlertRulesOverridePath();
    expect(overridePath.startsWith(root)).toBe(true);
    expect(fs.existsSync(overridePath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(overridePath, "utf-8")) as {
      rules?: Array<{ id?: string; enabled?: boolean }>;
    };
    expect((written.rules ?? []).some((row) => row.id === targetRuleId && row.enabled === false)).toBe(true);
  });

  it("blocks cross-origin GET/POST", async () => {
    await expectOriginMismatch(alertRulesGET(requestGet(
      "/api/planning/v3/news/alerts/rules",
      { origin: EVIL_ORIGIN, refererOrigin: EVIL_ORIGIN },
    )));
    await expectOriginMismatch(alertRulesPOST(requestPost(
      "/api/planning/v3/news/alerts/rules",
      { csrf: "test", rules: [] },
      { origin: EVIL_ORIGIN, refererOrigin: EVIL_ORIGIN },
    )));
  });
});
