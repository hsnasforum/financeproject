import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as alertsGET } from "../src/app/api/planning/v3/news/alerts/route";
import { resolveAlertEventsPath } from "../src/lib/news/alerts";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3100";
const EVENTS_PATH = resolveAlertEventsPath();

function requestGet(pathname: string, host = LOCAL_HOST): Request {
  const origin = `http://${host}`;
  const headers = new Headers({ host });
  return new Request(`${origin}${pathname}`, { method: "GET", headers });
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

  it("blocks non-local host", async () => {
    const response = await alertsGET(requestGet("/api/planning/v3/news/alerts", "example.com"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("returns grouped alert events for recent days", async () => {
    const backup = backupAndRemove(EVENTS_PATH);
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

      const response = await alertsGET(requestGet("/api/planning/v3/news/alerts?days=30"));
      const payload = await response.json() as {
        ok?: boolean;
        data?: {
          total?: number;
          groups?: Array<{ dayKst?: string; events?: Array<{ id?: string }> }>;
        };
      };

      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.data?.total).toBe(2);
      expect(payload.data?.groups?.length).toBe(2);
      expect(payload.data?.groups?.[0]?.dayKst).toBe("2026-03-04");
      expect(payload.data?.groups?.[0]?.events?.[0]?.id).toBe("a1");
    } finally {
      restoreFile(EVENTS_PATH, backup);
    }
  });
});
