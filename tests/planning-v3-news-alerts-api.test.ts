import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as alertsGET, POST as alertsPOST } from "../src/app/api/planning/v3/news/alerts/route";
import { resolveAlertEventStatePath, resolveAlertEventsPath } from "../src/lib/news/alerts";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3100";
const EVENTS_PATH = resolveAlertEventsPath();
const EVENT_STATE_PATH = resolveAlertEventStatePath();

function requestGet(pathname: string, host = LOCAL_HOST, withOriginHeaders = false): Request {
  const origin = `http://${host}`;
  const headers = new Headers({ host });
  if (withOriginHeaders) {
    headers.set("origin", origin);
    headers.set("referer", `${origin}/planning/v3/news/alerts`);
  }
  return new Request(`${origin}${pathname}`, { method: "GET", headers });
}

function requestPost(pathname: string, body: Record<string, unknown>, host = LOCAL_HOST, csrf = "csrf-token"): Request {
  const origin = `http://${host}`;
  const headers = new Headers({
    host,
    origin,
    referer: `${origin}/planning/v3/news/alerts`,
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

describe("planning v3 news alerts api", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("allows same-origin remote host", async () => {
    const response = await alertsGET(requestGet("/api/planning/v3/news/alerts", "example.com", true));
    const payload = await response.json() as { ok?: boolean; data?: { total?: number } };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.total).toBeGreaterThanOrEqual(0);
  });

  it("returns grouped alert events for recent days", async () => {
    const backup = backupAndRemove(EVENTS_PATH);
    const stateBackup = backupAndRemove(EVENT_STATE_PATH);
    try {
      fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true });
      fs.writeFileSync(EVENTS_PATH, [
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

      const response = await alertsGET(requestGet("/api/planning/v3/news/alerts?days=30", LOCAL_HOST, true));
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
      restoreFile(EVENTS_PATH, backup);
      restoreFile(EVENT_STATE_PATH, stateBackup);
    }
  });

  it("persists acknowledged and hidden alert state", async () => {
    const eventsBackup = backupAndRemove(EVENTS_PATH);
    const stateBackup = backupAndRemove(EVENT_STATE_PATH);
    try {
      fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true });
      fs.writeFileSync(EVENTS_PATH, [
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

      const getResponse = await alertsGET(requestGet("/api/planning/v3/news/alerts?days=30", LOCAL_HOST, true));
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
    } finally {
      restoreFile(EVENTS_PATH, eventsBackup);
      restoreFile(EVENT_STATE_PATH, stateBackup);
    }
  });
});
