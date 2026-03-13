import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as alertsGET, POST as alertsPOST } from "../src/app/api/planning/v3/news/alerts/route";
import { resolveAlertEventStatePath, resolveAlertEventsPath } from "../src/lib/news/alerts";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3100";
const REMOTE_HOST = "example.com";
const EVIL_ORIGIN = "http://evil.com";

function eventsPath(): string {
  return resolveAlertEventsPath();
}

function eventStatePath(): string {
  return resolveAlertEventStatePath();
}

function requestGet(
  pathname: string,
  options?: {
    host?: string;
    origin?: string;
    refererOrigin?: string;
  },
): Request {
  const host = options?.host ?? LOCAL_HOST;
  const origin = options?.origin ?? `http://${host}`;
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${origin}${pathname}`, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${refererOrigin}/planning/v3/news/alerts`,
    },
  });
}

function requestPost(
  pathname: string,
  body: Record<string, unknown>,
  options?: {
    host?: string;
    origin?: string;
    refererOrigin?: string;
    csrf?: string;
  },
): Request {
  const host = options?.host ?? LOCAL_HOST;
  const origin = options?.origin ?? `http://${host}`;
  const refererOrigin = options?.refererOrigin ?? origin;
  const csrf = options?.csrf ?? "csrf-token";
  const headers = new Headers({
    host,
    origin,
    referer: `${refererOrigin}/planning/v3/news/alerts`,
    cookie: `dev_action=1; dev_csrf=${csrf}`,
    "content-type": "application/json",
  });
  return new Request(`${origin}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, csrf }),
  });
}

function backupAndRemove(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const backup = fs.readFileSync(filePath, "utf-8");
  fs.unlinkSync(filePath);
  return backup;
}

function restoreFile(filePath: string, backup: string | null): void {
  if (backup === null) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, backup, "utf-8");
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as { ok?: boolean; error?: { code?: string } };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

describe("planning v3 news alerts api", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-news-alerts-api-"));
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

  it("allows same-origin remote host", async () => {
    const response = await alertsGET(requestGet("/api/planning/v3/news/alerts", { host: REMOTE_HOST }));
    const payload = await response.json() as { ok?: boolean; data?: { total?: number } };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.total).toBeGreaterThanOrEqual(0);
  });

  it("returns grouped alert events for recent days", async () => {
    const alertsPath = eventsPath();
    const statePath = eventStatePath();
    const backup = backupAndRemove(alertsPath);
    const stateBackup = backupAndRemove(statePath);
    try {
      fs.mkdirSync(path.dirname(alertsPath), { recursive: true });
      fs.writeFileSync(alertsPath, [
        JSON.stringify({
          id: "a1",
          createdAt: "2026-03-04T01:00:00.000Z",
          dayKst: "2026-03-04",
          source: "news:refresh",
          ruleId: "topic_burst_high",
          ruleKind: "topic_burst",
          level: "high",
          title: "토픽 급증",
          summary: "today=5",
          targetType: "topic",
          targetId: "fx",
          link: "/planning/v3/news/trends?topic=fx",
        }),
        JSON.stringify({
          id: "a2",
          createdAt: "2026-03-03T01:00:00.000Z",
          dayKst: "2026-03-03",
          source: "indicators:refresh",
          ruleId: "fx_zscore_high",
          ruleKind: "indicator",
          level: "medium",
          title: "환율 zscore",
          summary: "zscore=2.1",
          targetType: "topic",
          targetId: "fx",
          link: "/planning/v3/news/trends?topic=fx",
        }),
      ].join("\n") + "\n", "utf-8");

      const response = await alertsGET(requestGet("/api/planning/v3/news/alerts?days=30"));
      const payload = await response.json() as {
        ok?: boolean;
        data?: {
          total?: number;
          summary?: {
            pendingTotal?: number;
            hiddenTotal?: number;
          };
          groups?: Array<{
            dayKst?: string;
            events?: Array<{
              id?: string;
              state?: {
                acknowledgedAt?: string | null;
                hiddenAt?: string | null;
              };
            }>;
          }>;
        };
      };

      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.data?.total).toBe(2);
      expect(payload.data?.summary?.pendingTotal).toBe(2);
      expect(payload.data?.summary?.hiddenTotal).toBe(0);
      expect(payload.data?.groups?.length).toBe(2);
      expect(payload.data?.groups?.[0]?.dayKst).toBe("2026-03-04");
      expect(payload.data?.groups?.[0]?.events?.[0]?.id).toBe("a1");
      expect(payload.data?.groups?.[0]?.events?.[0]?.state).toEqual({
        acknowledgedAt: null,
        hiddenAt: null,
      });
    } finally {
      restoreFile(alertsPath, backup);
      restoreFile(statePath, stateBackup);
    }
  });

  it("persists acknowledged and hidden alert state under env-aware root", async () => {
    const alertsPath = eventsPath();
    const statePath = eventStatePath();
    const eventsBackup = backupAndRemove(alertsPath);
    const stateBackup = backupAndRemove(statePath);
    try {
      fs.mkdirSync(path.dirname(alertsPath), { recursive: true });
      fs.writeFileSync(alertsPath, [
        JSON.stringify({
          id: "a1",
          createdAt: "2026-03-04T01:00:00.000Z",
          dayKst: "2026-03-04",
          source: "news:refresh",
          ruleId: "topic_burst_high",
          ruleKind: "topic_burst",
          level: "high",
          title: "토픽 급증",
          summary: "today=5",
          targetType: "topic",
          targetId: "fx",
          link: "/planning/v3/news/trends?topic=fx",
        }),
      ].join("\n") + "\n", "utf-8");

      const ackResponse = await alertsPOST(requestPost("/api/planning/v3/news/alerts", {
        id: "a1",
        action: "ack",
        days: 30,
      }));
      const ackPayload = await ackResponse.json() as {
        ok?: boolean;
        data?: {
          mutation?: { id?: string; action?: string };
          groups?: Array<{ events?: Array<{ state?: { acknowledgedAt?: string | null; hiddenAt?: string | null } }> }>;
        };
      };

      expect(ackResponse.status).toBe(200);
      expect(ackPayload.ok).toBe(true);
      expect(ackPayload.data?.mutation?.id).toBe("a1");
      expect(ackPayload.data?.mutation?.action).toBe("ack");
      expect(typeof ackPayload.data?.groups?.[0]?.events?.[0]?.state?.acknowledgedAt).toBe("string");
      expect(ackPayload.data?.groups?.[0]?.events?.[0]?.state?.hiddenAt).toBeNull();

      const hideResponse = await alertsPOST(requestPost("/api/planning/v3/news/alerts", {
        id: "a1",
        action: "hide",
        days: 30,
      }));
      const hidePayload = await hideResponse.json() as {
        ok?: boolean;
        data?: {
          summary?: { hiddenTotal?: number; acknowledgedTotal?: number };
          groups?: Array<{ events?: Array<{ state?: { acknowledgedAt?: string | null; hiddenAt?: string | null } }> }>;
        };
      };

      expect(hideResponse.status).toBe(200);
      expect(hidePayload.ok).toBe(true);
      expect(hidePayload.data?.summary?.hiddenTotal).toBe(1);
      expect(hidePayload.data?.summary?.acknowledgedTotal).toBe(0);
      expect(typeof hidePayload.data?.groups?.[0]?.events?.[0]?.state?.hiddenAt).toBe("string");

      const getResponse = await alertsGET(requestGet("/api/planning/v3/news/alerts?days=30"));
      const getPayload = await getResponse.json() as {
        ok?: boolean;
        data?: {
          groups?: Array<{ events?: Array<{ state?: { acknowledgedAt?: string | null; hiddenAt?: string | null } }> }>;
        };
      };

      expect(getResponse.status).toBe(200);
      expect(getPayload.ok).toBe(true);
      expect(typeof getPayload.data?.groups?.[0]?.events?.[0]?.state?.acknowledgedAt).toBe("string");
      expect(typeof getPayload.data?.groups?.[0]?.events?.[0]?.state?.hiddenAt).toBe("string");
      expect(statePath.startsWith(root)).toBe(true);
      expect(fs.existsSync(statePath)).toBe(true);
    } finally {
      restoreFile(alertsPath, eventsBackup);
      restoreFile(statePath, stateBackup);
    }
  });

  it("blocks cross-origin GET/POST", async () => {
    await expectOriginMismatch(alertsGET(requestGet(
      "/api/planning/v3/news/alerts",
      { host: REMOTE_HOST, origin: EVIL_ORIGIN, refererOrigin: EVIL_ORIGIN },
    )));
    await expectOriginMismatch(alertsPOST(requestPost(
      "/api/planning/v3/news/alerts",
      { id: "a1", action: "ack", days: 30 },
      { host: REMOTE_HOST, origin: EVIL_ORIGIN, refererOrigin: EVIL_ORIGIN },
    )));
  });
});
