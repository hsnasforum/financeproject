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
import { GET as todayGET } from "../src/app/api/planning/v3/news/today/route";
import { GET as trendsGET } from "../src/app/api/planning/v3/news/trends/route";
import { FIXTURE_ITEMS } from "../planning/v3/news/fixtures/sample-items";
import { upsertItems } from "../planning/v3/news/store";

import { installPlanningAuthRequiredFalseForTest } from "./planning/auth/testPlanningAuthEnv";

installPlanningAuthRequiredFalseForTest();

const env = process.env as Record<string, string | undefined>;
const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;
const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const EVIL_ORIGIN = "http://evil.com";
const SEEDED_LAST_RUN_AT = "2026-03-10T00:00:00.000Z";

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (typeof value === "string") env[key] = value;
    else delete env[key];
  }
}

function requestJson(
  pathname: string,
  body: unknown,
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererPath?: string;
    refererOrigin?: string;
    userId?: string;
  },
): Request {
  const requestOrigin = options?.requestOrigin ?? REMOTE_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererPath = options?.refererPath ?? "/planning/v3/news";
  const refererOrigin = options?.refererOrigin ?? origin;
  const headers = new Headers({
    host,
    origin,
    referer: `${refererOrigin}${refererPath}`,
    "content-type": "application/json",
  });
  if (options?.userId) {
    headers.set("x-planning-user-id", options.userId);
  }
  return new Request(`${requestOrigin}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function requestGet(
  pathname: string,
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererPath?: string;
    refererOrigin?: string;
    userId?: string;
  },
): Request {
  const requestOrigin = options?.requestOrigin ?? LOCAL_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererPath = options?.refererPath ?? "/planning/v3/news";
  const refererOrigin = options?.refererOrigin ?? origin;
  const headers = new Headers({
    host,
    origin,
    referer: `${refererOrigin}${refererPath}`,
  });
  if (options?.userId) {
    headers.set("x-planning-user-id", options.userId);
  }
  return new Request(`${requestOrigin}${pathname}`, {
    method: "GET",
    headers,
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
    restoreEnv();
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

  it("routes namespace refresh and recovery writes to the trusted-header planning user root", async () => {
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    const aliceRoot = path.join(root, "planning", "users", "alice", "planning-v3", "news");
    fs.mkdirSync(aliceRoot, { recursive: true });
    fs.writeFileSync(path.join(aliceRoot, "state.json"), `${JSON.stringify({
      schemaVersion: 1,
      lastRunAt: SEEDED_LAST_RUN_AT,
      sources: {},
    }, null, 2)}\n`, "utf-8");
    upsertItems(FIXTURE_ITEMS, aliceRoot);

    const refreshResponse = await refreshPOST(requestJson("/api/planning/v3/news/refresh", {
      csrf: "test",
    }, {
      requestOrigin: LOCAL_ORIGIN,
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      refererOrigin: LOCAL_ORIGIN,
      userId: "alice",
    }));
    const refreshPayload = await refreshResponse.json() as {
      ok?: boolean;
      data?: { lastRefreshedAt?: string | null };
      meta?: { userId?: string; authSource?: string };
    };

    expect(refreshResponse.status).toBe(200);
    expect(refreshPayload.ok).toBe(true);
    expect(refreshPayload.meta).toEqual({ userId: "alice", authSource: "trusted-header" });
    expect(refreshPayload.data?.lastRefreshedAt).toBe(SEEDED_LAST_RUN_AT);
    expect(runNewsRefreshMock).toHaveBeenCalledWith({ rootDir: aliceRoot });

    const executeResponse = await recoveryPOST(requestJson("/api/planning/v3/news/recovery", {
      csrf: "test",
      action: "rebuild_caches",
      confirm: true,
    }, {
      requestOrigin: LOCAL_ORIGIN,
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      refererOrigin: LOCAL_ORIGIN,
      userId: "alice",
    }));
    const executePayload = await executeResponse.json() as {
      ok?: boolean;
      data?: { execution?: { writeTargets?: string[] } | null };
      meta?: { userId?: string; authSource?: string };
    };

    expect(executeResponse.status).toBe(200);
    expect(executePayload.ok).toBe(true);
    expect(executePayload.meta).toEqual({ userId: "alice", authSource: "trusted-header" });
    expect(executePayload.data?.execution?.writeTargets ?? []).toContain(
      ".data/planning/users/alice/planning-v3/news/cache/today.latest.json",
    );
    expect((executePayload.data?.execution?.writeTargets ?? []).some((row) => row.startsWith(".data/news/"))).toBe(false);
    expect(fs.existsSync(path.join(aliceRoot, "cache", "today.latest.json"))).toBe(true);
    expect(fs.existsSync(path.join(aliceRoot, "cache", "trends.30d.latest.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "news", "cache", "today.latest.json"))).toBe(false);

    const aliceTodayResponse = await todayGET(requestGet("/api/planning/v3/news/today", {
      userId: "alice",
    }));
    const aliceTodayPayload = await aliceTodayResponse.json() as {
      ok?: boolean;
      data?: { lastRefreshedAt?: string | null } | null;
      meta?: { userId?: string; authSource?: string };
    };
    expect(aliceTodayResponse.status).toBe(200);
    expect(aliceTodayPayload.ok).toBe(true);
    expect(aliceTodayPayload.meta).toEqual({ userId: "alice", authSource: "trusted-header" });
    expect(aliceTodayPayload.data?.lastRefreshedAt).toBe(SEEDED_LAST_RUN_AT);

    const aliceTrendsResponse = await trendsGET(requestGet("/api/planning/v3/news/trends?window=30", {
      userId: "alice",
    }));
    const aliceTrendsPayload = await aliceTrendsResponse.json() as {
      ok?: boolean;
      data?: { date?: string; topics?: unknown[] } | null;
      meta?: { userId?: string; authSource?: string };
    };
    expect(aliceTrendsResponse.status).toBe(200);
    expect(aliceTrendsPayload.ok).toBe(true);
    expect(aliceTrendsPayload.meta).toEqual({ userId: "alice", authSource: "trusted-header" });
    expect(aliceTrendsPayload.data?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const bobTodayResponse = await todayGET(requestGet("/api/planning/v3/news/today", {
      userId: "bob",
    }));
    const bobTodayPayload = await bobTodayResponse.json() as {
      ok?: boolean;
      data?: unknown;
      meta?: { userId?: string; authSource?: string };
    };
    expect(bobTodayResponse.status).toBe(200);
    expect(bobTodayPayload.ok).toBe(true);
    expect(bobTodayPayload.meta).toEqual({ userId: "bob", authSource: "trusted-header" });
    expect(bobTodayPayload.data).toBeNull();
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
