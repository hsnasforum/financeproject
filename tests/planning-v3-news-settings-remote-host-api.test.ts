import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as indicatorsSpecsGET } from "../src/app/api/planning/v3/indicators/specs/route";
import { GET as newsSettingsGET } from "../src/app/api/planning/v3/news/settings/route";
import { GET as newsSourcesGET } from "../src/app/api/planning/v3/news/sources/route";

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

function requestCrossOrigin(pathname: string): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin: EVIL_ORIGIN,
      referer: `${EVIL_ORIGIN}/planning/v3/news/settings`,
    },
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as {
    ok?: boolean;
    error?: { code?: string };
  };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

describe("planning v3 news settings remote host contract", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-news-settings-remote-host-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows same-origin remote host across news settings GET routes", async () => {
    const settingsResponse = await newsSettingsGET(requestGet("/api/planning/v3/news/settings"));
    expect(settingsResponse.status).toBe(200);
    const settingsPayload = await settingsResponse.json() as {
      ok?: boolean;
      data?: {
        sources?: Array<{ id?: string }>;
        topics?: Array<{ id?: string }>;
      };
    };
    expect(settingsPayload.ok).toBe(true);
    expect((settingsPayload.data?.sources ?? []).length).toBeGreaterThan(0);
    expect((settingsPayload.data?.topics ?? []).length).toBeGreaterThan(0);

    const sourcesResponse = await newsSourcesGET(requestGet("/api/planning/v3/news/sources"));
    expect(sourcesResponse.status).toBe(200);
    const sourcesPayload = await sourcesResponse.json() as {
      ok?: boolean;
      data?: { items?: Array<{ url?: string }> };
    };
    expect(sourcesPayload.ok).toBe(true);
    expect((sourcesPayload.data?.items ?? []).length).toBeGreaterThan(0);

    const specsResponse = await indicatorsSpecsGET(requestGet("/api/planning/v3/indicators/specs"));
    expect(specsResponse.status).toBe(200);
    const specsPayload = await specsResponse.json() as {
      ok?: boolean;
      data?: {
        specs?: Array<{ id?: string }>;
        catalog?: Array<{ id?: string }>;
      };
    };
    expect(specsPayload.ok).toBe(true);
    expect((specsPayload.data?.specs ?? []).length).toBeGreaterThan(0);
    expect((specsPayload.data?.catalog ?? []).length).toBeGreaterThan(0);
  });

  it("blocks cross-origin access across news settings GET routes", async () => {
    await expectOriginMismatch(newsSettingsGET(requestCrossOrigin("/api/planning/v3/news/settings")));
    await expectOriginMismatch(newsSourcesGET(requestCrossOrigin("/api/planning/v3/news/sources")));
    await expectOriginMismatch(indicatorsSpecsGET(requestCrossOrigin("/api/planning/v3/indicators/specs")));
  });
});
