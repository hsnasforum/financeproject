import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runNewsRefreshMock } = vi.hoisted(() => ({
  runNewsRefreshMock: vi.fn(),
}));

vi.mock("../planning/v3/news/cli/newsRefresh", async () => {
  const actual = await vi.importActual("../planning/v3/news/cli/newsRefresh");
  return {
    ...(actual as object),
    runNewsRefresh: (...args: unknown[]) => runNewsRefreshMock(...args),
  };
});

import { POST as recoveryPOST } from "../src/app/api/planning/v3/news/recovery/route";
import { POST as refreshPOST } from "../src/app/api/planning/v3/news/refresh/route";
import { FIXTURE_ITEMS } from "../planning/v3/news/fixtures/sample-items";
import { upsertItems } from "../planning/v3/news/store";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";
const SEEDED_LAST_RUN_AT = "2026-03-10T00:00:00.000Z";

function requestJson(
  pathname: string,
  body: unknown,
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererPath?: string;
    refererOrigin?: string;
  },
): Request {
  const requestOrigin = options?.requestOrigin ?? REMOTE_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererPath = options?.refererPath ?? "/planning/v3/news";
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${requestOrigin}${pathname}`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${refererOrigin}${refererPath}`,
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

describe("planning v3 news refresh/recovery remote host contract", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-news-refresh-recovery-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    runNewsRefreshMock.mockReset();
    runNewsRefreshMock.mockResolvedValue({
      sourcesProcessed: 2,
      itemsFetched: 10,
      itemsNew: 3,
      itemsDeduped: 7,
      errors: [],
    });

    const newsRoot = path.join(root, "news");
    fs.mkdirSync(newsRoot, { recursive: true });
    fs.writeFileSync(path.join(newsRoot, "state.json"), `${JSON.stringify({
      schemaVersion: 1,
      lastRunAt: SEEDED_LAST_RUN_AT,
      sources: {},
    }, null, 2)}\n`, "utf-8");
    upsertItems(FIXTURE_ITEMS, newsRoot);
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows same-origin remote host refresh and reads lastRunAt from env-aware news root", async () => {
    const response = await refreshPOST(requestJson("/api/planning/v3/news/refresh", {
      csrf: "test",
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: { itemsNew?: number; lastRefreshedAt?: string | null };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data?.itemsNew).toBe(3);
    expect(payload.data?.lastRefreshedAt).toBe(SEEDED_LAST_RUN_AT);
    expect(runNewsRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("allows same-origin remote host recovery preview/confirm and writes caches into env-aware news root", async () => {
    const previewResponse = await recoveryPOST(requestJson("/api/planning/v3/news/recovery", {
      csrf: "test",
      action: "rebuild_caches",
      confirm: false,
    }));
    expect(previewResponse.status).toBe(200);
    const previewPayload = await previewResponse.json() as {
      ok?: boolean;
      data?: { requiresConfirmation?: boolean; summary?: { action?: string } };
    };
    expect(previewPayload.ok).toBe(true);
    expect(previewPayload.data?.requiresConfirmation).toBe(true);
    expect(previewPayload.data?.summary?.action).toBe("rebuild_caches");

    const executeResponse = await recoveryPOST(requestJson("/api/planning/v3/news/recovery", {
      csrf: "test",
      action: "rebuild_caches",
      confirm: true,
    }));
    expect(executeResponse.status).toBe(200);
    const executePayload = await executeResponse.json() as {
      ok?: boolean;
      data?: {
        requiresConfirmation?: boolean;
        execution?: { wroteCount?: number };
      };
    };
    expect(executePayload.ok).toBe(true);
    expect(executePayload.data?.requiresConfirmation).toBe(false);
    expect((executePayload.data?.execution?.wroteCount ?? 0) > 0).toBe(true);
    expect(fs.existsSync(path.join(root, "news", "cache", "today.latest.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "news", "cache", "scenarios.latest.json"))).toBe(true);
  });

  it("blocks cross-origin refresh and recovery", async () => {
    await expectOriginMismatch(refreshPOST(requestJson(
      "/api/planning/v3/news/refresh",
      { csrf: "test" },
      {
        origin: EVIL_ORIGIN,
        refererOrigin: EVIL_ORIGIN,
      },
    )));
    expect(runNewsRefreshMock).not.toHaveBeenCalled();

    await expectOriginMismatch(recoveryPOST(requestJson(
      "/api/planning/v3/news/recovery",
      { csrf: "test", action: "rebuild_caches", confirm: false },
      {
        origin: EVIL_ORIGIN,
        refererOrigin: EVIL_ORIGIN,
      },
    )));
  });
});
