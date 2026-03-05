import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../src/app/api/planning/v3/news/weekly-plan/route";
import { resolveWeeklyPlanPath } from "../planning/v3/news/weeklyPlan";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const WEEKLY_PLAN_PATH = resolveWeeklyPlanPath();

function requestGet(pathname: string, host = LOCAL_HOST): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: { host },
  });
}

function requestPost(pathname: string, body: unknown, withAuth = true): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/news`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }

  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function backupWeeklyPlanFile(): string | null {
  if (!fs.existsSync(WEEKLY_PLAN_PATH)) return null;
  const backup = `${WEEKLY_PLAN_PATH}.backup-test`;
  fs.rmSync(backup, { force: true });
  fs.renameSync(WEEKLY_PLAN_PATH, backup);
  return backup;
}

function restoreWeeklyPlanFile(backup: string | null): void {
  fs.rmSync(WEEKLY_PLAN_PATH, { force: true });
  if (!backup) return;
  fs.renameSync(backup, WEEKLY_PLAN_PATH);
}

describe("planning v3 news weekly plan api", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("blocks non-local host", async () => {
    const response = await GET(requestGet("/api/planning/v3/news/weekly-plan", "example.com"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("supports explicit save with local/csrf guard", async () => {
    const backup = backupWeeklyPlanFile();
    try {
      const denied = await POST(requestPost("/api/planning/v3/news/weekly-plan", {
        csrf: "csrf-token",
        topics: ["rates"],
        seriesIds: ["KR_BOK_BASE_RATE"],
      }, false));
      expect(denied.status).toBe(403);

      const saved = await POST(requestPost("/api/planning/v3/news/weekly-plan", {
        csrf: "csrf-token",
        weekOf: "2026-03-02",
        topics: ["rates", "inflation", "rates"],
        seriesIds: ["KR_BOK_BASE_RATE", "kr_base_rate", "KR_USDKRW"],
      }));
      const savedPayload = await saved.json() as {
        ok?: boolean;
        data?: {
          topics?: string[];
          seriesIds?: string[];
          weekOf?: string;
        };
      };
      expect(saved.status).toBe(200);
      expect(savedPayload.ok).toBe(true);
      expect(savedPayload.data?.weekOf).toBe("2026-03-02");
      expect(savedPayload.data?.topics).toEqual(["rates", "inflation"]);
      expect(savedPayload.data?.seriesIds).toEqual(["kr_base_rate", "kr_usdkrw"]);

      const response = await GET(requestGet("/api/planning/v3/news/weekly-plan"));
      const payload = await response.json() as {
        ok?: boolean;
        data?: {
          weekOf?: string;
          topics?: string[];
          seriesIds?: string[];
        } | null;
      };

      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.data?.weekOf).toBe("2026-03-02");
      expect(payload.data?.topics).toEqual(["rates", "inflation"]);
      expect(payload.data?.seriesIds).toEqual(["kr_base_rate", "kr_usdkrw"]);
    } finally {
      restoreWeeklyPlanFile(backup);
    }
  });
});
